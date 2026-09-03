import { canonicalHash, canonicalStringify } from "../core/canonical";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  isNarratorVerifiedArtifactsV1,
  narratorArtifactManifestHash,
  narratorArtifactsMatchCandidate,
  narratorCandidateManifestHash,
} from "./evaluation-receipts";
import type { NarratorModelCandidateV1 } from "./model-candidate";
import { isSafeAmbientNarration } from "./output-policy";
import {
  isNarratorRecord,
  isNarratorBoundedText,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  normalizeNarratorOutput,
  type NarratorPromptV1,
} from "./protocol";
import {
  hashNarratorShadowCollectorResponseV1,
  isNarratorShadowCollectorRequestForPlanV1,
  narratorShadowCollectorProtocolVersion,
  type NarratorShadowCollectorErrorCode,
  type NarratorShadowCollectorRequestV1,
  type NarratorShadowCollectorResponseV1,
  type NarratorShadowCollectorWorkerState,
} from "./shadow-collector-protocol";
import type { NarratorShadowBenchmarkPlanV1 } from "./shadow-benchmark";

export class NarratorShadowCollectorDeviceLostError extends Error {
  constructor(message = "Narrator shadow collector lost its inference device") {
    super(message);
    this.name = "NarratorShadowCollectorDeviceLostError";
  }
}

export interface NarratorShadowCollectorBindingV1 {
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly provenanceDossierHash: string;
  readonly candidateStagingReportHash: string;
  readonly runtimeIntegrity: string;
  readonly corpusHash: string;
  readonly decodingHash: string;
}

export interface NarratorShadowCollectorModelPortV1 {
  readonly binding: NarratorShadowCollectorBindingV1;
  verifyArtifacts(signal: AbortSignal): Promise<unknown>;
  load(signal: AbortSignal): Promise<void>;
  runCase(
    prompt: NarratorPromptV1,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown>;
  dispose(signal: AbortSignal): Promise<void>;
  terminate(): void;
}

export interface NarratorShadowCollectorTokenMeterPortV1 {
  readonly binding: NarratorShadowCollectorBindingV1;
  countInput(prompt: NarratorPromptV1, signal: AbortSignal): Promise<unknown>;
  countOutput(text: string, signal: AbortSignal): Promise<unknown>;
}

interface ActiveOperation {
  readonly requestId: string;
  readonly controller: AbortController;
}

interface CachedResponse {
  readonly requestFingerprint: string;
  readonly response: Promise<NarratorShadowCollectorResponseV1>;
}

const rollingDispatchWindowMilliseconds = 10 * 60 * 1_000;

export function narratorShadowCollectorRequestBudgetV1(plan: NarratorShadowBenchmarkPlanV1): number {
  const comparisonDispatches = plan.policy.comparisonOrder.length
    * Math.ceil(plan.policy.comparisonPhaseMilliseconds / rollingDispatchWindowMilliseconds)
    * plan.policy.maximumDispatchesPerRollingTenMinutes;
  const workdayDispatches = Math.ceil(plan.policy.workdayMilliseconds / rollingDispatchWindowMilliseconds)
    * plan.policy.maximumDispatchesPerRollingTenMinutes;
  const corpusRunAndCancelReserve = narratorEvaluationCasesV1.length * 2;
  const lifecycleReserve = 32;
  return comparisonDispatches
    + workdayDispatches
    + plan.policy.stressMinimumAttempts
    + corpusRunAndCancelReserve
    + lifecycleReserve;
}

function measuredTokenCount(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maximum;
}

export class NarratorShadowCollectorWorkerV1 {
  private lifecycleState: NarratorShadowCollectorWorkerState = "available";
  private workerEpoch: string | null = null;
  private active: ActiveOperation | null = null;
  private readonly responses = new Map<string, CachedResponse>();

  constructor(
    private readonly plan: NarratorShadowBenchmarkPlanV1,
    private readonly candidate: NarratorModelCandidateV1,
    private readonly model: NarratorShadowCollectorModelPortV1,
    private readonly tokenMeter: NarratorShadowCollectorTokenMeterPortV1,
  ) {}

  get state(): NarratorShadowCollectorWorkerState {
    return this.lifecycleState;
  }

  process(value: unknown): Promise<NarratorShadowCollectorResponseV1> {
    if (!isNarratorShadowCollectorRequestForPlanV1(value, this.plan)) {
      return Promise.resolve(this.error(value, "invalid-envelope"));
    }
    const request = value as NarratorShadowCollectorRequestV1;
    const fingerprint = canonicalStringify(request);
    const cached = this.responses.get(request.requestId);
    if (cached !== undefined) {
      return cached.requestFingerprint === fingerprint
        ? cached.response
        : Promise.resolve(this.error(request, "duplicate-conflict"));
    }
    if (this.responses.size >= narratorShadowCollectorRequestBudgetV1(this.plan)) {
      return Promise.resolve(this.error(request, "request-budget-exceeded"));
    }
    const response = this.processValidated(request);
    this.responses.set(request.requestId, { requestFingerprint: fingerprint, response });
    return response;
  }

  private async processValidated(
    request: NarratorShadowCollectorRequestV1,
  ): Promise<NarratorShadowCollectorResponseV1> {
    if (request.kind === "initialize") return this.initialize(request);
    if (this.workerEpoch === null || request.workerEpoch !== this.workerEpoch) {
      return this.error(request, "identity-mismatch");
    }
    if (request.kind === "cancel") return this.cancel(request);
    if (request.kind === "dispose") return this.dispose(request);
    if (this.active !== null) return this.error(request, "wrong-state");
    if (request.kind === "verify-artifacts") return this.verifyArtifacts(request);
    if (request.kind === "load") return this.load(request);
    return this.runCase(request);
  }

  private initialize(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "initialize" }>,
  ): NarratorShadowCollectorResponseV1 {
    if (this.lifecycleState !== "available"
      || this.workerEpoch !== null
      || !this.portBindingMatchesPlan(this.model.binding)
      || !this.portBindingMatchesPlan(this.tokenMeter.binding)
      || this.candidate.candidateId !== this.plan.bindings.candidateId
      || narratorCandidateManifestHash(this.candidate) !== this.plan.bindings.candidateManifestHash
      || narratorArtifactManifestHash(this.candidate) !== this.plan.bindings.artifactManifestHash
      || this.candidate.runtime.integrity !== this.plan.bindings.runtimeIntegrity) {
      return this.error(request, "identity-mismatch");
    }
    this.workerEpoch = request.workerEpoch;
    this.lifecycleState = "initialized";
    return this.status(request, "initialized");
  }

  private async verifyArtifacts(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "verify-artifacts" }>,
  ): Promise<NarratorShadowCollectorResponseV1> {
    if (this.lifecycleState !== "initialized") return this.error(request, "wrong-state");
    const controller = this.reserve(request.requestId);
    try {
      const value = await this.model.verifyArtifacts(controller.signal);
      this.requireActive(request.requestId, controller);
      if (!isNarratorVerifiedArtifactsV1(value)) return this.fail(request, "artifact-evidence-invalid");
      if (!narratorArtifactsMatchCandidate(value, this.candidate)) return this.fail(request, "artifact-mismatch");
      this.lifecycleState = "verified";
      return hashNarratorShadowCollectorResponseV1({
        ...this.responseBase(request),
        kind: "artifacts",
        payload: { artifacts: Object.freeze(value.map((artifact) => Object.freeze({ ...artifact }))) },
      }) as NarratorShadowCollectorResponseV1;
    } catch (error) {
      return this.operationError(request, controller, error);
    } finally {
      this.release(request.requestId, controller);
    }
  }

  private async load(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "load" }>,
  ): Promise<NarratorShadowCollectorResponseV1> {
    if (this.lifecycleState !== "verified") return this.error(request, "wrong-state");
    const controller = this.reserve(request.requestId);
    this.lifecycleState = "loading";
    try {
      await this.model.load(controller.signal);
      this.requireActive(request.requestId, controller);
      this.lifecycleState = "ready";
      return this.status(request, "loaded");
    } catch (error) {
      return this.operationError(request, controller, error);
    } finally {
      this.release(request.requestId, controller);
    }
  }

  private async runCase(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "run-case" }>,
  ): Promise<NarratorShadowCollectorResponseV1> {
    if (this.lifecycleState !== "ready") return this.error(request, "wrong-state");
    const evaluationCase = narratorEvaluationCasesV1[request.payload.evaluationCaseOrdinal]!;
    const controller = this.reserve(request.requestId);
    this.lifecycleState = "running";
    try {
      const inputTokens = await this.tokenMeter.countInput(evaluationCase.prompt, controller.signal);
      this.requireActive(request.requestId, controller);
      if (!measuredTokenCount(inputTokens, narratorMaximumInputTokens)) {
        return this.fail(request, "invalid-output");
      }
      const value = await this.model.runCase(evaluationCase.prompt, {
        maximumOutputTokens: narratorMaximumOutputTokens,
        signal: controller.signal,
      });
      this.requireActive(request.requestId, controller);
      if (typeof value !== "string") return this.fail(request, "invalid-output");
      const outputText = normalizeNarratorOutput(value);
      if (outputText === null || outputText !== value
        || !isSafeAmbientNarration(outputText, evaluationCase.prompt)) {
        return this.fail(request, "invalid-output");
      }
      const outputTokens = await this.tokenMeter.countOutput(outputText, controller.signal);
      this.requireActive(request.requestId, controller);
      if (!measuredTokenCount(outputTokens, narratorMaximumOutputTokens)) {
        return this.fail(request, "invalid-output");
      }
      this.lifecycleState = "ready";
      return hashNarratorShadowCollectorResponseV1({
        ...this.responseBase(request),
        kind: "case-result",
        payload: {
          evaluationCaseOrdinal: request.payload.evaluationCaseOrdinal,
          evaluationCaseHash: canonicalHash(evaluationCase),
          inputTokens,
          outputTokens,
          outputText,
        },
      }) as NarratorShadowCollectorResponseV1;
    } catch (error) {
      return this.operationError(request, controller, error);
    } finally {
      this.release(request.requestId, controller);
    }
  }

  private cancel(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "cancel" }>,
  ): NarratorShadowCollectorResponseV1 {
    if (this.lifecycleState === "disposing") return this.error(request, "wrong-state");
    if (this.active?.requestId !== request.payload.targetRequestId) return this.error(request, "wrong-state");
    this.active.controller.abort();
    this.safeTerminate();
    this.lifecycleState = "terminated";
    return this.status(request, "cancelled");
  }

  private async dispose(
    request: Extract<NarratorShadowCollectorRequestV1, { kind: "dispose" }>,
  ): Promise<NarratorShadowCollectorResponseV1> {
    if (this.lifecycleState === "disposed") return this.status(request, "disposed");
    if (this.lifecycleState === "disposing") return this.error(request, "wrong-state");
    if (this.active !== null) {
      this.active.controller.abort();
      this.safeTerminate();
    }
    const controller = this.reserve(request.requestId);
    this.lifecycleState = "disposing";
    try {
      await this.model.dispose(controller.signal);
      this.requireActive(request.requestId, controller);
      this.lifecycleState = "disposed";
      return this.status(request, "disposed");
    } catch (error) {
      return this.operationError(request, controller, error);
    } finally {
      this.release(request.requestId, controller);
    }
  }

  private portBindingMatchesPlan(binding: unknown): boolean {
    return isNarratorRecord(binding)
      && Object.isFrozen(binding)
      && narratorHasExactKeys(binding, [
        "candidateId", "candidateManifestHash", "artifactManifestHash", "runtimeIntegrity", "corpusHash",
        "decodingHash", "provenanceDossierHash", "candidateStagingReportHash",
      ])
      && binding.candidateId === this.plan.bindings.candidateId
      && binding.candidateManifestHash === this.plan.bindings.candidateManifestHash
      && binding.artifactManifestHash === this.plan.bindings.artifactManifestHash
      && binding.provenanceDossierHash === this.plan.bindings.provenanceDossierHash
      && binding.candidateStagingReportHash === this.plan.bindings.candidateStagingReportHash
      && binding.runtimeIntegrity === this.plan.bindings.runtimeIntegrity
      && binding.corpusHash === this.plan.bindings.corpusHash
      && binding.decodingHash === this.plan.bindings.decodingHash;
  }

  private reserve(requestId: string): AbortController {
    const controller = new AbortController();
    this.active = { requestId, controller };
    return controller;
  }

  private requireActive(requestId: string, controller: AbortController): void {
    if (controller.signal.aborted
      || this.active?.requestId !== requestId
      || this.active.controller !== controller) throw new DOMException("Aborted", "AbortError");
  }

  private release(requestId: string, controller: AbortController): void {
    if (this.active?.requestId === requestId && this.active.controller === controller) this.active = null;
  }

  private operationError(
    request: NarratorShadowCollectorRequestV1,
    controller: AbortController,
    error: unknown,
  ): NarratorShadowCollectorResponseV1 {
    if (controller.signal.aborted) return this.error(request, "cancelled");
    return this.fail(request, error instanceof NarratorShadowCollectorDeviceLostError ? "device-lost" : "model-error");
  }

  private fail(
    request: NarratorShadowCollectorRequestV1,
    code: NarratorShadowCollectorErrorCode,
  ): NarratorShadowCollectorResponseV1 {
    this.lifecycleState = "failed";
    this.safeTerminate();
    return this.error(request, code);
  }

  private safeTerminate(): void {
    try {
      this.model.terminate();
    } catch {
      // A best-effort final boundary must not prevent a fail-closed response.
    }
  }

  private responseBase(request: NarratorShadowCollectorRequestV1) {
    return {
      schemaVersion: 1 as const,
      protocolVersion: narratorShadowCollectorProtocolVersion,
      runId: this.plan.runId,
      planHash: this.plan.contentHash,
      workerEpoch: request.workerEpoch,
      requestId: request.requestId,
      modelAdmitted: false as const,
      displayAuthorized: false as const,
    };
  }

  private status(
    request: NarratorShadowCollectorRequestV1,
    code: Extract<NarratorShadowCollectorResponseV1, { kind: "status" }>["payload"]["code"],
  ): NarratorShadowCollectorResponseV1 {
    return hashNarratorShadowCollectorResponseV1({
      ...this.responseBase(request),
      kind: "status",
      payload: { state: this.lifecycleState, code },
    }) as NarratorShadowCollectorResponseV1;
  }

  private error(value: unknown, code: NarratorShadowCollectorErrorCode): NarratorShadowCollectorResponseV1 {
    const record = isNarratorRecord(value) ? value : {};
    const workerEpoch = isNarratorBoundedText(record.workerEpoch, 200)
      ? record.workerEpoch
      : this.workerEpoch ?? "invalid";
    const requestId = isNarratorBoundedText(record.requestId, 240)
      ? record.requestId
      : "invalid";
    return hashNarratorShadowCollectorResponseV1({
      schemaVersion: 1,
      protocolVersion: narratorShadowCollectorProtocolVersion,
      runId: this.plan.runId,
      planHash: this.plan.contentHash,
      workerEpoch,
      requestId,
      kind: "error",
      payload: { code },
      modelAdmitted: false,
      displayAuthorized: false,
    }) as NarratorShadowCollectorResponseV1;
  }
}
