import { randomId } from "../random-id";
import {
  isNarratorExperimentalModelEligible,
  type NarratorExperimentalModelPolicyV1,
} from "./experimental-policy";
import { isSafeLiveNarration } from "./live-output-policy";
import {
  isNarratorBoundedText,
  isNarratorJobV1,
  isNarratorRecord,
  isNarratorResponseEnvelope,
  narratorEnvelopeByteLength,
  narratorMaximumInputTokens,
  narratorMaximumResponseBytes,
  narratorProtocolVersion,
  type NarratorCapability,
  type NarratorJobV1,
  type NarratorLifecycleState,
  type NarratorModelAdmission,
  type NarratorPromptV1,
  type NarratorRequestEnvelope,
  type NarratorResponseEnvelope,
} from "./protocol";

export const narratorLoadTimeoutMs = 60_000;
export const narratorRealizationTimeoutMs = 8_000;
export const narratorDispatchWindowMs = 10 * 60_000;
export const narratorMaximumDispatchesPerWindow = 2;
export const neutralNarratorFallback = "The moment holds steady.";
export type NarratorConfigurationKind = "off" | "admitted" | "experimental-unrated";

export interface NarratorWorkerPort {
  postMessage(value: unknown): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: () => void): void;
}

export interface NarratorClock {
  now(): number;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NarratorHostTokenMeter {
  countInput(prompt: NarratorPromptV1): Promise<number> | number;
}

export interface NarratorClientDependencies {
  readonly workerFactory: () => NarratorWorkerPort;
  readonly clock: NarratorClock;
  readonly tokenMeter: NarratorHostTokenMeter;
  readonly epochFactory?: () => string;
}

export interface NarratorOffer {
  readonly initial: {
    readonly source: "deterministic";
    readonly text: string;
  };
  readonly enhancement: Promise<{
    readonly source: "model";
    readonly text: string;
  } | null> | null;
}

interface PendingRequest {
  readonly request: NarratorRequestEnvelope;
  readonly resolve: (response: NarratorResponseEnvelope) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: unknown;
}

export class NarratorClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "NarratorClientError";
  }
}

function admittedModel(model: NarratorModelAdmission, capability: NarratorCapability): boolean {
  return capability.execution !== "none"
    && capability.budget !== "unsupported"
    && isNarratorBoundedText(model.id, 160)
    && isNarratorBoundedText(model.revision, 160)
    && isNarratorBoundedText(model.license, 160)
    && Number.isSafeInteger(model.storedWeightBytes)
    && model.storedWeightBytes > 0
    && model.storedWeightBytes <= capability.storedWeightBudgetBytes
    && Number.isSafeInteger(model.incrementalMemoryBytes)
    && model.incrementalMemoryBytes > 0
    && model.incrementalMemoryBytes <= capability.incrementalMemoryBudgetBytes;
}

export class NarratorClient {
  private lifecycleState: NarratorLifecycleState = "off";
  private capability: NarratorCapability | null = null;
  private model: NarratorModelAdmission | null = null;
  private experimentalPolicy: NarratorExperimentalModelPolicyV1 | null = null;
  private campaignId: string | null = null;
  private worker: NarratorWorkerPort | null = null;
  private workerEpoch = "";
  private requestOrdinal = 0;
  private pending: PendingRequest | null = null;
  private activeJob: NarratorJobV1 | null = null;
  private currentSourceFingerprint: string | null = null;
  private suppression: "hidden" | "eco" | null = null;
  private dispatches: number[] = [];
  private operationEpoch = 0;
  private readonly epochFactory: () => string;

  constructor(private readonly dependencies: NarratorClientDependencies) {
    this.epochFactory = dependencies.epochFactory ?? randomId;
  }

  get state(): NarratorLifecycleState {
    return this.lifecycleState;
  }

  get suppressionReason(): "hidden" | "eco" | null {
    return this.suppression;
  }

  get configurationKind(): NarratorConfigurationKind {
    if (this.experimentalPolicy !== null) return "experimental-unrated";
    if (this.model !== null) return "admitted";
    return "off";
  }

  enable(campaignId: string, model: NarratorModelAdmission, capability: NarratorCapability): boolean {
    this.terminateWorker(new NarratorClientError("reconfigured", "Narrator was reconfigured"));
    this.capability = capability;
    this.model = model;
    this.experimentalPolicy = null;
    this.campaignId = campaignId;
    this.currentSourceFingerprint = null;
    if (!isNarratorBoundedText(campaignId, 160) || !admittedModel(model, capability)) {
      this.capability = null;
      this.model = null;
      this.campaignId = null;
      this.lifecycleState = "failed";
      return false;
    }
    this.lifecycleState = "available";
    return true;
  }

  enableExperimental(
    campaignId: string,
    policy: NarratorExperimentalModelPolicyV1,
    capability: NarratorCapability,
  ): boolean {
    this.terminateWorker(new NarratorClientError("reconfigured", "Narrator was reconfigured"));
    const policySnapshot = Object.freeze({ ...policy });
    this.capability = capability;
    this.model = null;
    this.experimentalPolicy = policySnapshot;
    this.campaignId = campaignId;
    this.currentSourceFingerprint = null;
    if (
      !isNarratorBoundedText(campaignId, 160)
      || !isNarratorExperimentalModelEligible(policySnapshot, capability)
    ) {
      this.capability = null;
      this.experimentalPolicy = null;
      this.campaignId = null;
      this.lifecycleState = "failed";
      return false;
    }
    this.lifecycleState = "available";
    return true;
  }

  disable(): void {
    this.terminateWorker(new NarratorClientError("disabled", "Narrator was disabled"));
    this.capability = null;
    this.model = null;
    this.experimentalPolicy = null;
    this.campaignId = null;
    this.currentSourceFingerprint = null;
    this.suppression = null;
    this.lifecycleState = "off";
  }

  resetAfterFailure(): boolean {
    if (
      this.lifecycleState !== "failed"
      || this.capability === null
      || !isNarratorBoundedText(this.campaignId, 160)
    ) return false;
    const configurationIsEligible = this.model !== null
      ? admittedModel(this.model, this.capability)
      : isNarratorExperimentalModelEligible(this.experimentalPolicy, this.capability);
    if (!configurationIsEligible) return false;
    this.terminateWorker(new NarratorClientError("reset", "Narrator was reset"));
    this.currentSourceFingerprint = null;
    this.lifecycleState = "available";
    return true;
  }

  setSuppressed(reason: "hidden" | "eco" | null): void {
    if (reason === this.suppression) return;
    this.suppression = reason;
    this.currentSourceFingerprint = null;
    this.terminateWorker(new NarratorClientError("suppressed", `Narrator suppression changed: ${reason ?? "none"}`));
    if (this.lifecycleState !== "off" && this.lifecycleState !== "failed") this.lifecycleState = "available";
  }

  setCurrentSource(job: NarratorJobV1 | null): void {
    const next = job?.sourceFingerprint ?? null;
    if (this.currentSourceFingerprint === next) return;
    this.currentSourceFingerprint = next;
    if (this.activeJob !== null && this.activeJob.sourceFingerprint !== next) {
      this.terminateWorker(new NarratorClientError("sceneChanged", "Narrator scene changed"));
      if (this.lifecycleState !== "off" && this.lifecycleState !== "failed") this.lifecycleState = "available";
    }
  }

  narrate(job: NarratorJobV1): NarratorOffer {
    if (!isNarratorJobV1(job) || (this.campaignId !== null && job.campaignId !== this.campaignId)) {
      return { initial: { source: "deterministic", text: neutralNarratorFallback }, enhancement: null };
    }
    this.setCurrentSource(job);
    const initial = { source: "deterministic" as const, text: job.deterministicFallback };
    if (
      this.suppression !== null
      || this.lifecycleState === "off"
      || this.lifecycleState === "failed"
      || this.configuredModelId === null
      || this.campaignId === null
      || this.activeJob !== null
    ) return { initial, enhancement: null };
    const operationEpoch = this.operationEpoch;
    const campaignId = this.campaignId;
    const modelId = this.configuredModelId;
    if (modelId === null) return { initial, enhancement: null };
    this.activeJob = job;
    const enhancement = this.realize(job, operationEpoch, campaignId, modelId)
      .catch(() => null)
      .finally(() => {
        if (this.operationEpoch === operationEpoch && this.activeJob?.sourceFingerprint === job.sourceFingerprint) {
          this.activeJob = null;
        }
      });
    return { initial, enhancement };
  }

  dispose(): void {
    this.disable();
  }

  private async realize(
    job: NarratorJobV1,
    operationEpoch: number,
    campaignId: string,
    modelId: string,
  ): Promise<{ source: "model"; text: string } | null> {
    const inputTokens = await this.dependencies.tokenMeter.countInput(job.prompt);
    if (!this.isCurrentOperation(operationEpoch, job, campaignId, modelId)) return null;
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 1 || inputTokens > narratorMaximumInputTokens) return null;
    this.refreshDispatchWindow();
    if (this.dispatches.length >= narratorMaximumDispatchesPerWindow) {
      this.lifecycleState = "cooldown";
      return null;
    }
    if (this.lifecycleState === "cooldown") this.lifecycleState = this.worker === null ? "available" : "ready";
    this.dispatches.push(this.dependencies.clock.now());
    if (this.worker === null) {
      try {
        this.createWorker();
      } catch {
        this.fail("workerConstructionFailed", "Narrator worker could not be constructed");
        return null;
      }
      this.lifecycleState = "loading";
      const load = await this.send("load", { modelId });
      if (!this.isCurrentOperation(operationEpoch, job, campaignId, modelId)) return null;
      if (load.kind !== "status" || load.payload.state !== "ready" || load.payload.modelId !== modelId) {
        this.fail("loadRejected", "Narrator worker did not become ready");
        return null;
      }
      this.lifecycleState = "ready";
    }
    if (!this.isCurrentOperation(operationEpoch, job, campaignId, modelId)) return null;
    const response = await this.send("realize", { job });
    if (!this.isCurrentOperation(operationEpoch, job, campaignId, modelId)) return null;
    if (response.kind === "error") {
      this.fail(response.payload.code, "Narrator worker rejected generation");
      return null;
    }
    if (
      response.kind !== "result"
      || response.payload.modelId !== modelId
      || response.payload.eventId !== job.eventId
      || response.payload.tick !== job.tick
      || response.payload.sourceFingerprint !== job.sourceFingerprint
      || this.currentSourceFingerprint !== job.sourceFingerprint
      || !isSafeLiveNarration(response.payload.text, job.prompt)
    ) {
      this.fail("staleResult", "Narrator result identity did not match the active scene");
      return null;
    }
    return { source: "model", text: response.payload.text };
  }

  private isCurrentOperation(
    operationEpoch: number,
    job: NarratorJobV1,
    campaignId: string,
    modelId: string,
  ): boolean {
    return this.operationEpoch === operationEpoch
      && this.lifecycleState !== "off"
      && this.lifecycleState !== "failed"
      && this.suppression === null
      && this.campaignId === campaignId
      && this.configuredModelId === modelId
      && job.campaignId === campaignId
      && this.activeJob?.sourceFingerprint === job.sourceFingerprint
      && this.currentSourceFingerprint === job.sourceFingerprint;
  }

  private get configuredModelId(): string | null {
    return this.model?.id ?? this.experimentalPolicy?.modelId ?? null;
  }

  private createWorker(): void {
    this.workerEpoch = this.epochFactory();
    this.requestOrdinal = 0;
    const worker = this.dependencies.workerFactory();
    try {
      worker.addEventListener("message", (event) => this.receive(event.data));
      worker.addEventListener("error", () => this.fail("workerCrashed", "Narrator worker crashed"));
      worker.addEventListener("messageerror", () => this.fail("messageError", "Narrator worker message failed"));
      this.worker = worker;
    } catch (error) {
      try {
        worker.terminate();
      } catch {
        // Preserve the construction failure; this worker never became usable.
      }
      throw error;
    }
  }

  private send(
    kind: NarratorRequestEnvelope["kind"],
    payload: NarratorRequestEnvelope["payload"],
  ): Promise<NarratorResponseEnvelope> {
    if (this.worker === null || this.campaignId === null) {
      return Promise.reject(new NarratorClientError("workerUnavailable", "Narrator worker is unavailable"));
    }
    if (this.pending !== null) {
      return Promise.reject(new NarratorClientError("backpressure", "Narrator allows one pending request"));
    }
    const requestId = `${this.workerEpoch}:${this.requestOrdinal}`;
    this.requestOrdinal += 1;
    const request = {
      protocolVersion: narratorProtocolVersion,
      campaignId: this.campaignId,
      workerEpoch: this.workerEpoch,
      requestId,
      kind,
      payload,
    } as NarratorRequestEnvelope;
    const timeoutMilliseconds = kind === "load"
      ? narratorLoadTimeoutMs
      : narratorRealizationTimeoutMs;
    return new Promise((resolve, reject) => {
      const timeout = this.dependencies.clock.setTimeout(() => {
        if (this.pending?.request.requestId !== requestId) return;
        this.pending = null;
        reject(new NarratorClientError("workerTimeout", "Narrator worker did not respond"));
        this.fail("workerTimeout", "Narrator worker did not respond");
      }, timeoutMilliseconds);
      this.pending = { request, resolve, reject, timeout };
      try {
        this.worker?.postMessage(request);
      } catch {
        const error = new NarratorClientError("workerPostFailed", "Narrator worker request could not be sent");
        if (this.pending?.request.requestId === requestId) this.pending = null;
        this.dependencies.clock.clearTimeout(timeout);
        reject(error);
        this.fail(error.code, error.message);
      }
    });
  }

  private receive(value: unknown): void {
    if (narratorEnvelopeByteLength(value) > narratorMaximumResponseBytes || !isNarratorResponseEnvelope(value)) {
      if (
        isNarratorRecord(value)
        && value.workerEpoch === this.workerEpoch
        && value.campaignId === this.campaignId
      ) this.fail("invalidResponse", "Narrator worker returned an invalid response");
      return;
    }
    if (value.workerEpoch !== this.workerEpoch || value.campaignId !== this.campaignId) return;
    const pending = this.pending;
    if (pending === null || pending.request.requestId !== value.requestId) return;
    this.pending = null;
    this.dependencies.clock.clearTimeout(pending.timeout);
    if (value.kind === "error") {
      pending.reject(new NarratorClientError(value.payload.code, value.payload.message));
      this.fail(value.payload.code, value.payload.message);
    } else pending.resolve(value);
  }

  private refreshDispatchWindow(): void {
    const threshold = this.dependencies.clock.now() - narratorDispatchWindowMs;
    this.dispatches = this.dispatches.filter((timestamp) => timestamp > threshold);
  }

  private fail(code: string, message: string): void {
    this.terminateWorker(new NarratorClientError(code, message));
    if (this.lifecycleState !== "off") this.lifecycleState = "failed";
  }

  private terminateWorker(error: Error): void {
    this.operationEpoch += 1;
    this.activeJob = null;
    const pending = this.pending;
    this.pending = null;
    if (pending !== null) {
      this.dependencies.clock.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.worker?.terminate();
    this.worker = null;
    this.workerEpoch = "";
    this.requestOrdinal = 0;
  }
}
