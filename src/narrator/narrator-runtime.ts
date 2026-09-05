import { canonicalStringify } from "../core/canonical";
import { isSafeLiveNarration } from "./live-output-policy";
import {
  isNarratorBoundedText,
  isNarratorJobV1,
  isNarratorModelBindingV1,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  narratorMaximumRequestBytes,
  narratorProtocolVersion,
  normalizeNarratorOutput,
  type NarratorJobV1,
  type NarratorLifecycleState,
  type NarratorModelBindingV1,
  type NarratorPromptV1,
  type NarratorWorkerErrorCode,
} from "./protocol";
import {
  isStoryBeatJobV1,
  storyBeatMaximumInputTokens,
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";
import type {
  NarratorTransportRequestEnvelope,
  NarratorTransportResponseEnvelope,
} from "./story-beat-worker-protocol";

export interface NarratorTokenMeter {
  countInput(prompt: NarratorPromptV1): Promise<number> | number;
  countStoryBeatInput(facts: StoryBeatPublicFactsV1): Promise<number> | number;
  countOutput(text: string): Promise<number> | number;
}

export interface NarratorStoryBeatCandidateV1 {
  readonly text: string;
  readonly outputTokens: number;
}

export interface NarratorRealizer {
  readonly modelBinding: NarratorModelBindingV1;
  load(signal: AbortSignal): Promise<void>;
  realize(
    prompt: NarratorPromptV1,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<string>;
  authorStoryBeat(
    facts: StoryBeatPublicFactsV1,
    options: {
      readonly maximumOutputTokens: typeof storyBeatMaximumOutputTokens;
      readonly signal: AbortSignal;
    },
  ): Promise<NarratorStoryBeatCandidateV1>;
  dispose(): Promise<void> | void;
}

export class NarratorDeviceLostError extends Error {
  constructor(message = "Narrator inference device was lost") {
    super(message);
    this.name = "NarratorDeviceLostError";
  }
}

interface ActiveRequest {
  readonly requestId: string;
  readonly controller: AbortController;
}

interface CachedResponse {
  readonly requestFingerprint: string;
  readonly response: Promise<NarratorTransportResponseEnvelope>;
}

const maximumCachedResponses = 32;
function fixedInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}

function identity(record: Record<string, unknown>): Pick<NarratorTransportRequestEnvelope, "campaignId" | "workerEpoch" | "requestId"> {
  return {
    campaignId: isNarratorBoundedText(record.campaignId, 160) ? record.campaignId : "unknown",
    workerEpoch: isNarratorBoundedText(record.workerEpoch, 200) ? record.workerEpoch : "unknown",
    requestId: isNarratorBoundedText(record.requestId, 240) ? record.requestId : "unknown",
  };
}

function requestBaseIsValid(record: Record<string, unknown>): boolean {
  return narratorHasExactKeys(record, ["protocolVersion", "campaignId", "workerEpoch", "requestId", "kind", "payload"])
    && isNarratorBoundedText(record.campaignId, 160)
    && isNarratorBoundedText(record.workerEpoch, 200)
    && isNarratorBoundedText(record.requestId, 240)
    && isNarratorRecord(record.payload);
}

function requestPayloadIsValid(record: Record<string, unknown>): boolean {
  const payload = record.payload;
  if (!isNarratorRecord(payload)) return false;
  if (record.kind === "load") {
    return isNarratorModelBindingV1(payload);
  }
  if (record.kind === "realize") {
    return narratorHasExactKeys(payload, ["job"]) && isNarratorJobV1(payload.job);
  }
  if (record.kind === "author-story-beat") {
    return narratorHasExactKeys(payload, ["job"]) && isStoryBeatJobV1(payload.job);
  }
  if (record.kind === "cancel") {
    return narratorHasExactKeys(payload, ["targetRequestId"])
      && isNarratorBoundedText(payload.targetRequestId, 240);
  }
  if (record.kind === "dispose") return narratorHasExactKeys(payload, []);
  return false;
}

export class NarratorWorkerRuntime {
  private lifecycleState: NarratorLifecycleState = "available";
  private campaignId: string | null = null;
  private workerEpoch: string | null = null;
  private active: ActiveRequest | null = null;
  private readonly responses = new Map<string, CachedResponse>();
  private readonly modelBinding: NarratorModelBindingV1 | null;

  constructor(
    private readonly realizer: NarratorRealizer,
    private readonly tokenMeter: NarratorTokenMeter,
  ) {
    this.modelBinding = isNarratorModelBindingV1(realizer.modelBinding)
      ? Object.freeze({ ...realizer.modelBinding })
      : null;
  }

  get state(): NarratorLifecycleState {
    return this.lifecycleState;
  }

  process(value: unknown): Promise<NarratorTransportResponseEnvelope> {
    const record = isNarratorRecord(value) ? value : {};
    if (narratorEnvelopeByteLength(value) > narratorMaximumRequestBytes) {
      return Promise.resolve(this.error(record, "oversizedEnvelope", "Narrator request exceeds byte limit"));
    }
    if (!isNarratorRecord(value)) {
      return Promise.resolve(this.error(record, "invalidEnvelope", "Narrator request must be an object"));
    }
    if (value.protocolVersion !== narratorProtocolVersion) {
      return Promise.resolve(this.error(value, "wrongProtocolVersion", "Unsupported narrator protocol version"));
    }
    if (!requestBaseIsValid(value)) {
      return Promise.resolve(this.error(value, "invalidEnvelope", "Narrator request fields are invalid"));
    }
    if (!["load", "realize", "author-story-beat", "cancel", "dispose"].includes(String(value.kind))) {
      return Promise.resolve(this.error(value, "unknownRequestKind", "Unknown narrator request kind"));
    }
    if (!requestPayloadIsValid(value)) {
      return Promise.resolve(this.error(value, "invalidPayload", "Narrator request payload is invalid"));
    }
    const request = value as unknown as NarratorTransportRequestEnvelope;
    const requestFingerprint = canonicalStringify(request);
    const cached = this.responses.get(request.requestId);
    if (cached !== undefined) {
      return cached.requestFingerprint === requestFingerprint
        ? cached.response
        : Promise.resolve(this.error(value, "duplicateConflict", "Request id was reused with different content"));
    }
    const response = this.processValidated(request);
    this.responses.set(request.requestId, { requestFingerprint, response });
    while (this.responses.size > maximumCachedResponses) {
      const oldest = this.responses.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.responses.delete(oldest);
    }
    return response;
  }

  private async processValidated(
    request: NarratorTransportRequestEnvelope,
  ): Promise<NarratorTransportResponseEnvelope> {
    if (request.kind === "load") return this.load(request);
    if (this.campaignId === null || this.workerEpoch === null) {
      return this.error(request as unknown as Record<string, unknown>, "notReady", "Narrator model is not loaded");
    }
    if (request.campaignId !== this.campaignId) {
      return this.error(request as unknown as Record<string, unknown>, "wrongCampaign", "Narrator campaign does not match");
    }
    if (request.workerEpoch !== this.workerEpoch) {
      return this.error(request as unknown as Record<string, unknown>, "wrongWorkerEpoch", "Narrator worker epoch does not match");
    }
    if (request.kind === "cancel") {
      if (this.active?.requestId !== request.payload.targetRequestId) {
        return this.status(request, "no matching active request");
      }
      this.active.controller.abort();
      this.lifecycleState = "cooldown";
      return this.status(request, "cancelled by host");
    }
    if (request.kind === "dispose") {
      this.active?.controller.abort();
      this.active = null;
      await this.realizer.dispose();
      this.lifecycleState = "off";
      return this.status(request, "disposed by host");
    }
    if (request.kind === "author-story-beat") return this.authorStoryBeat(request);
    return this.realize(request);
  }

  private async load(
    request: Extract<NarratorTransportRequestEnvelope, { kind: "load" }>,
  ): Promise<NarratorTransportResponseEnvelope> {
    if (this.campaignId !== null && request.campaignId !== this.campaignId) {
      return this.error(request as unknown as Record<string, unknown>, "wrongCampaign", "Narrator campaign does not match");
    }
    if (this.workerEpoch !== null && request.workerEpoch !== this.workerEpoch) {
      return this.error(request as unknown as Record<string, unknown>, "wrongWorkerEpoch", "Narrator worker epoch does not match");
    }
    if (
      this.modelBinding === null
      || request.payload.modelId !== this.modelBinding.modelId
      || request.payload.revision !== this.modelBinding.revision
      || request.payload.artifactManifestHash !== this.modelBinding.artifactManifestHash
    ) {
      return this.error(request as unknown as Record<string, unknown>, "invalidPayload", "Narrator model binding is not allowlisted");
    }
    if (this.active !== null) {
      return this.error(request as unknown as Record<string, unknown>, "backpressure", "Narrator already has an active request");
    }
    this.campaignId = request.campaignId;
    this.workerEpoch = request.workerEpoch;
    this.lifecycleState = "loading";
    const controller = new AbortController();
    this.active = { requestId: request.requestId, controller };
    try {
      await this.realizer.load(controller.signal);
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      this.lifecycleState = "ready";
      return this.status(request, "model ready");
    } catch (error) {
      if (controller.signal.aborted) {
        this.markCancelledUnlessOff();
        return this.error(request as unknown as Record<string, unknown>, "cancelled", "Narrator load was cancelled");
      }
      this.lifecycleState = "failed";
      if (error instanceof NarratorDeviceLostError) {
        return this.error(request as unknown as Record<string, unknown>, "deviceLost", "Narrator inference device was lost");
      }
      return this.error(request as unknown as Record<string, unknown>, "modelUnavailable", "Narrator model could not load");
    } finally {
      if (this.active?.requestId === request.requestId) this.active = null;
    }
  }

  private async realize(
    request: Extract<NarratorTransportRequestEnvelope, { kind: "realize" }>,
  ): Promise<NarratorTransportResponseEnvelope> {
    if (this.lifecycleState !== "ready") {
      return this.error(request as unknown as Record<string, unknown>, "notReady", "Narrator model is not ready");
    }
    const modelBinding = this.modelBinding;
    if (modelBinding === null) {
      return this.error(request as unknown as Record<string, unknown>, "modelUnavailable", "Narrator model binding is unavailable");
    }
    if (this.active !== null) {
      return this.error(request as unknown as Record<string, unknown>, "backpressure", "Narrator already has an active request");
    }
    const job: NarratorJobV1 = request.payload.job;
    if (job.campaignId !== request.campaignId) {
      return this.error(request as unknown as Record<string, unknown>, "invalidPayload", "Narrator job campaign does not match");
    }
    const controller = new AbortController();
    this.active = { requestId: request.requestId, controller };
    try {
      const inputTokens = fixedInteger(await this.tokenMeter.countInput(job.prompt));
      this.requireActive(request.requestId, controller);
      if (inputTokens === null || inputTokens < 1 || inputTokens > narratorMaximumInputTokens) {
        return this.error(request as unknown as Record<string, unknown>, "invalidPayload", "Narrator prompt exceeds token budget");
      }
      const raw = await this.realizer.realize(job.prompt, {
        maximumOutputTokens: narratorMaximumOutputTokens,
        signal: controller.signal,
      });
      this.requireActive(request.requestId, controller);
      const text = normalizeNarratorOutput(raw);
      const outputTokens = text === null ? null : fixedInteger(await this.tokenMeter.countOutput(text));
      this.requireActive(request.requestId, controller);
      if (
        text === null
        || outputTokens === null
        || outputTokens < 1
        || outputTokens > narratorMaximumOutputTokens
        || !isSafeLiveNarration(text, job.prompt)
      ) {
        return this.error(request as unknown as Record<string, unknown>, "invalidOutput", "Narrator output failed validation");
      }
      return {
        protocolVersion: narratorProtocolVersion,
        campaignId: request.campaignId,
        workerEpoch: request.workerEpoch,
        requestId: request.requestId,
        kind: "result",
        payload: {
          eventId: job.eventId,
          tick: job.tick,
          sourceFingerprint: job.sourceFingerprint,
          text,
          outputTokens,
          ...modelBinding,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        this.markCancelledUnlessOff();
        return this.error(request as unknown as Record<string, unknown>, "cancelled", "Narrator request was cancelled");
      }
      this.lifecycleState = "failed";
      if (error instanceof NarratorDeviceLostError) {
        return this.error(request as unknown as Record<string, unknown>, "deviceLost", "Narrator inference device was lost");
      }
      return this.error(request as unknown as Record<string, unknown>, "internalError", "Narrator generation failed");
    } finally {
      if (this.active?.requestId === request.requestId) this.active = null;
    }
  }

  private async authorStoryBeat(
    request: Extract<NarratorTransportRequestEnvelope, { kind: "author-story-beat" }>,
  ): Promise<NarratorTransportResponseEnvelope> {
    if (this.lifecycleState !== "ready") {
      return this.error(request as unknown as Record<string, unknown>, "notReady", "Narrator model is not ready");
    }
    const modelBinding = this.modelBinding;
    if (modelBinding === null) {
      return this.error(request as unknown as Record<string, unknown>, "modelUnavailable", "Narrator model binding is unavailable");
    }
    if (this.active !== null) {
      return this.error(request as unknown as Record<string, unknown>, "backpressure", "Narrator already has an active request");
    }
    const job = request.payload.job;
    if (job.campaignId !== request.campaignId) {
      return this.error(request as unknown as Record<string, unknown>, "invalidPayload", "Story-beat job campaign does not match");
    }
    const controller = new AbortController();
    this.active = { requestId: request.requestId, controller };
    try {
      const inputTokens = fixedInteger(await this.tokenMeter.countStoryBeatInput(job.facts));
      this.requireActive(request.requestId, controller);
      if (inputTokens === null || inputTokens < 1 || inputTokens > storyBeatMaximumInputTokens) {
        return this.error(request as unknown as Record<string, unknown>, "invalidPayload", "Story-beat prompt exceeds token budget");
      }
      const candidate = await this.realizer.authorStoryBeat(job.facts, {
        maximumOutputTokens: storyBeatMaximumOutputTokens,
        signal: controller.signal,
      });
      this.requireActive(request.requestId, controller);
      const candidateIsExact = isNarratorRecord(candidate)
        && narratorHasExactKeys(candidate, ["text", "outputTokens"]);
      const outputTokens = candidateIsExact ? fixedInteger(candidate.outputTokens) : null;
      const text = candidateIsExact
        ? validateStoryBeatResultV1(candidate.text, job.facts)
        : null;
      if (
        text === null
        || outputTokens === null
        || outputTokens < 1
        || outputTokens > storyBeatMaximumOutputTokens
      ) {
        return {
          protocolVersion: narratorProtocolVersion,
          campaignId: request.campaignId,
          workerEpoch: request.workerEpoch,
          requestId: request.requestId,
          kind: "story-beat-result",
          payload: {
            outcome: "fallback",
            eventId: job.eventId,
            tick: job.tick,
            sourceFingerprint: job.sourceFingerprint,
            reason: "invalid-output",
            ...modelBinding,
          },
        };
      }
      return {
        protocolVersion: narratorProtocolVersion,
        campaignId: request.campaignId,
        workerEpoch: request.workerEpoch,
        requestId: request.requestId,
        kind: "story-beat-result",
        payload: {
          outcome: "authored",
          eventId: job.eventId,
          tick: job.tick,
          sourceFingerprint: job.sourceFingerprint,
          text,
          outputTokens,
          ...modelBinding,
        },
      };
    } catch (error) {
      if (controller.signal.aborted) {
        this.markCancelledUnlessOff();
        return this.error(request as unknown as Record<string, unknown>, "cancelled", "Story-beat request was cancelled");
      }
      this.lifecycleState = "failed";
      if (error instanceof NarratorDeviceLostError) {
        return this.error(request as unknown as Record<string, unknown>, "deviceLost", "Narrator inference device was lost");
      }
      return this.error(request as unknown as Record<string, unknown>, "internalError", "Story-beat generation failed");
    } finally {
      if (this.active?.requestId === request.requestId) this.active = null;
    }
  }

  private requireActive(requestId: string, controller: AbortController): void {
    if (
      controller.signal.aborted
      || this.lifecycleState !== "ready"
      || this.active?.requestId !== requestId
      || this.active.controller !== controller
    ) throw new DOMException("Aborted", "AbortError");
  }

  private markCancelledUnlessOff(): void {
    if (this.lifecycleState !== "off") this.lifecycleState = "cooldown";
  }

  private status(
    request: NarratorTransportRequestEnvelope,
    reason: string,
  ): NarratorTransportResponseEnvelope {
    if (this.modelBinding === null) {
      return this.error(
        request as unknown as Record<string, unknown>,
        "modelUnavailable",
        "Narrator model binding is unavailable",
      );
    }
    return {
      protocolVersion: narratorProtocolVersion,
      ...identity(request as unknown as Record<string, unknown>),
      kind: "status",
      payload: { state: this.lifecycleState, ...this.modelBinding, reason },
    };
  }

  private error(
    record: Record<string, unknown>,
    code: NarratorWorkerErrorCode,
    message: string,
  ): NarratorTransportResponseEnvelope {
    return {
      protocolVersion: narratorProtocolVersion,
      ...identity(record),
      kind: "error",
      payload: { code, message },
    };
  }
}
