import { randomId } from "../random-id";
import {
  isNarratorExperimentalModelEligible,
  type NarratorExperimentalModelPolicyV1,
} from "./experimental-policy";
import { isSafeLiveNarration } from "./live-output-policy";
import {
  isNarratorBoundedText,
  isNarratorJobV1,
  isNarratorModelBindingV1,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorMaximumInputTokens,
  narratorMaximumResponseBytes,
  narratorProtocolVersion,
  type NarratorCapability,
  type NarratorJobV1,
  type NarratorLifecycleState,
  type NarratorModelAdmission,
  type NarratorModelBindingV1,
  type NarratorPromptV1,
} from "./protocol";
import {
  isStoryBeatJobV1,
  storyBeatMaximumInputTokens,
  validateStoryBeatResultV1,
  type StoryBeatJobV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";
import {
  isNarratorTransportResponseEnvelope,
  type NarratorTransportRequestEnvelope,
  type NarratorTransportResponseEnvelope,
} from "./story-beat-worker-protocol";

export const narratorLoadTimeoutMs = 3 * 60_000;
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
  countStoryBeatInput?(facts: StoryBeatPublicFactsV1): Promise<number> | number;
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

type NarratorEnhancement = Awaited<NonNullable<NarratorOffer["enhancement"]>>;

export type StoryBeatClientFallbackReasonV1 =
  | "invalid-job"
  | "unavailable"
  | "suppressed"
  | "backpressure"
  | "input-budget"
  | "cooldown"
  | "invalid-output"
  | "stale"
  | "transport-failure";

export type StoryBeatClientResultV1 =
  | {
      readonly outcome: "authored";
      readonly source: "model";
      readonly text: string;
    }
  | {
      readonly outcome: "fallback";
      readonly source: "deterministic";
      readonly text: string;
      readonly reason: StoryBeatClientFallbackReasonV1;
    };

type NarratorSourceJobV1 = NarratorJobV1 | StoryBeatJobV1;

interface PendingRequest {
  readonly request: NarratorTransportRequestEnvelope;
  readonly resolve: (response: NarratorTransportResponseEnvelope) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: unknown;
}

interface QueuedNarration {
  readonly job: NarratorJobV1;
  readonly sourceEpoch: number;
  readonly campaignId: string;
  readonly modelBinding: NarratorModelBindingV1;
  readonly resolve: (enhancement: NarratorEnhancement) => void;
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
    && isNarratorModelBindingV1({
      modelId: model.id,
      revision: model.revision,
      artifactManifestHash: model.artifactManifestHash,
    })
    && isNarratorBoundedText(model.license, 160)
    && Number.isSafeInteger(model.storedWeightBytes)
    && model.storedWeightBytes > 0
    && model.storedWeightBytes <= capability.storedWeightBudgetBytes
    && Number.isSafeInteger(model.incrementalMemoryBytes)
    && model.incrementalMemoryBytes > 0
    && model.incrementalMemoryBytes <= capability.incrementalMemoryBudgetBytes;
}

function hasMatchingModelBinding(
  value: NarratorModelBindingV1,
  expected: NarratorModelBindingV1,
): boolean {
  return value.modelId === expected.modelId
    && value.revision === expected.revision
    && value.artifactManifestHash === expected.artifactManifestHash;
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
  private activeJob: NarratorSourceJobV1 | null = null;
  private activeTask: Promise<unknown> | null = null;
  private activeSourceEpoch: number | null = null;
  private queuedNarration: QueuedNarration | null = null;
  private currentSourceFingerprint: string | null = null;
  private sourceEpoch = 0;
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
    const modelSnapshot = Object.freeze({ ...model });
    this.capability = capability;
    this.model = modelSnapshot;
    this.experimentalPolicy = null;
    this.campaignId = campaignId;
    this.currentSourceFingerprint = null;
    if (!isNarratorBoundedText(campaignId, 160) || !admittedModel(modelSnapshot, capability)) {
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

  setCurrentSource(job: NarratorSourceJobV1 | null): void {
    const next = job?.sourceFingerprint ?? null;
    if (this.currentSourceFingerprint === next) return;
    this.currentSourceFingerprint = next;
    this.sourceEpoch += 1;
    this.cancelQueuedNarration();
  }

  narrate(job: NarratorJobV1): NarratorOffer {
    if (!isNarratorJobV1(job) || (this.campaignId !== null && job.campaignId !== this.campaignId)) {
      return { initial: { source: "deterministic", text: neutralNarratorFallback }, enhancement: null };
    }
    this.setCurrentSource(job);
    const initial = { source: "deterministic" as const, text: job.deterministicFallback };
    const modelBinding = this.configuredModelBinding;
    if (
      this.suppression !== null
      || this.lifecycleState === "off"
      || this.lifecycleState === "failed"
      || modelBinding === null
      || this.campaignId === null
    ) return { initial, enhancement: null };
    const campaignId = this.campaignId;
    if (this.activeTask !== null) {
      if (this.activeJob?.sourceFingerprint === job.sourceFingerprint
        && this.activeSourceEpoch === this.sourceEpoch) {
        return { initial, enhancement: null };
      }
      return {
        initial,
        enhancement: this.queueNarration(job, campaignId, modelBinding),
      };
    }
    const enhancement = this.startNarration(job, campaignId, modelBinding);
    return { initial, enhancement };
  }

  authorStoryBeat(job: StoryBeatJobV1): Promise<StoryBeatClientResultV1> {
    if (!isStoryBeatJobV1(job) || (this.campaignId !== null && job.campaignId !== this.campaignId)) {
      return Promise.resolve(this.storyBeatFallback(neutralNarratorFallback, "invalid-job"));
    }
    this.setCurrentSource(job);
    if (this.suppression !== null) {
      return Promise.resolve(this.storyBeatFallback(job.deterministicFallback, "suppressed"));
    }
    const modelBinding = this.configuredModelBinding;
    if (
      this.lifecycleState === "off"
      || this.lifecycleState === "failed"
      || modelBinding === null
      || this.campaignId === null
    ) {
      return Promise.resolve(this.storyBeatFallback(job.deterministicFallback, "unavailable"));
    }
    if (this.activeTask !== null) {
      return Promise.resolve(this.storyBeatFallback(job.deterministicFallback, "backpressure"));
    }
    return this.startStoryBeat(job, this.campaignId, modelBinding);
  }

  dispose(): void {
    this.disable();
  }

  private async realize(
    job: NarratorJobV1,
    operationEpoch: number,
    sourceEpoch: number,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): Promise<{ source: "model"; text: string } | null> {
    const inputTokens = await this.dependencies.tokenMeter.countInput(job.prompt);
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) return null;
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 1 || inputTokens > narratorMaximumInputTokens) return null;
    this.refreshDispatchWindow();
    if (this.dispatches.length >= narratorMaximumDispatchesPerWindow) {
      this.lifecycleState = "cooldown";
      return null;
    }
    if (this.worker === null) {
      try {
        this.createWorker();
      } catch {
        this.fail("workerConstructionFailed", "Narrator worker could not be constructed");
        return null;
      }
      const loadingWorker = this.worker;
      const loadingWorkerEpoch = this.workerEpoch;
      this.lifecycleState = "loading";
      const load = await this.send("load", modelBinding);
      if (!this.isCurrentWorkerOperation(
        operationEpoch,
        campaignId,
        modelBinding,
        loadingWorker,
        loadingWorkerEpoch,
      )) return null;
      if (
        load.kind !== "status"
        || load.payload.state !== "ready"
        || !hasMatchingModelBinding(load.payload, modelBinding)
      ) {
        this.fail("loadRejected", "Narrator worker did not become ready");
        return null;
      }
      this.lifecycleState = "ready";
    }
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) return null;
    this.refreshDispatchWindow();
    if (this.dispatches.length >= narratorMaximumDispatchesPerWindow) {
      this.lifecycleState = "cooldown";
      return null;
    }
    if (this.lifecycleState === "cooldown") this.lifecycleState = "ready";
    this.dispatches.push(this.dependencies.clock.now());
    const response = await this.send("realize", { job });
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) return null;
    if (response.kind === "error") {
      this.fail(response.payload.code, "Narrator worker rejected generation");
      return null;
    }
    if (
      response.kind !== "result"
      || !hasMatchingModelBinding(response.payload, modelBinding)
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

  private async realizeStoryBeat(
    job: StoryBeatJobV1,
    operationEpoch: number,
    sourceEpoch: number,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): Promise<StoryBeatClientResultV1> {
    const inputTokens = this.dependencies.tokenMeter.countStoryBeatInput === undefined
      ? storyBeatMaximumInputTokens
      : await this.dependencies.tokenMeter.countStoryBeatInput(job.facts);
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) {
      return this.storyBeatFallback(job.deterministicFallback, "stale");
    }
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 1 || inputTokens > storyBeatMaximumInputTokens) {
      return this.storyBeatFallback(job.deterministicFallback, "input-budget");
    }
    this.refreshDispatchWindow();
    if (this.dispatches.length >= narratorMaximumDispatchesPerWindow) {
      this.lifecycleState = "cooldown";
      return this.storyBeatFallback(job.deterministicFallback, "cooldown");
    }
    if (this.worker === null) {
      try {
        this.createWorker();
      } catch {
        this.fail("workerConstructionFailed", "Narrator worker could not be constructed");
        return this.storyBeatFallback(job.deterministicFallback, "transport-failure");
      }
      const loadingWorker = this.worker;
      const loadingWorkerEpoch = this.workerEpoch;
      this.lifecycleState = "loading";
      const load = await this.send("load", modelBinding);
      if (!this.isCurrentWorkerOperation(
        operationEpoch,
        campaignId,
        modelBinding,
        loadingWorker,
        loadingWorkerEpoch,
      )) return this.storyBeatFallback(job.deterministicFallback, "stale");
      if (
        load.kind !== "status"
        || load.payload.state !== "ready"
        || !hasMatchingModelBinding(load.payload, modelBinding)
      ) {
        this.fail("loadRejected", "Narrator worker did not become ready");
        return this.storyBeatFallback(job.deterministicFallback, "transport-failure");
      }
      this.lifecycleState = "ready";
    }
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) {
      return this.storyBeatFallback(job.deterministicFallback, "stale");
    }
    this.refreshDispatchWindow();
    if (this.dispatches.length >= narratorMaximumDispatchesPerWindow) {
      this.lifecycleState = "cooldown";
      return this.storyBeatFallback(job.deterministicFallback, "cooldown");
    }
    if (this.lifecycleState === "cooldown") this.lifecycleState = "ready";
    this.dispatches.push(this.dependencies.clock.now());
    const response = await this.send("author-story-beat", { job });
    if (!this.isCurrentOperation(operationEpoch, sourceEpoch, job, campaignId, modelBinding)) {
      return this.storyBeatFallback(job.deterministicFallback, "stale");
    }
    if (
      response.kind !== "story-beat-result"
      || !hasMatchingModelBinding(response.payload, modelBinding)
      || response.payload.eventId !== job.eventId
      || response.payload.tick !== job.tick
      || response.payload.sourceFingerprint !== job.sourceFingerprint
      || this.currentSourceFingerprint !== job.sourceFingerprint
    ) {
      this.fail("staleResult", "Story-beat result identity did not match the active scene");
      return this.storyBeatFallback(job.deterministicFallback, "transport-failure");
    }
    if (response.payload.outcome === "fallback") {
      return this.storyBeatFallback(job.deterministicFallback, response.payload.reason);
    }
    const text = validateStoryBeatResultV1(response.payload.text, job.facts);
    if (text === null) {
      this.fail("invalidStoryBeat", "Story-beat result failed host validation");
      return this.storyBeatFallback(job.deterministicFallback, "transport-failure");
    }
    return Object.freeze({ outcome: "authored", source: "model", text });
  }

  private isCurrentWorkerOperation(
    operationEpoch: number,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
    worker: NarratorWorkerPort | null,
    workerEpoch: string,
  ): boolean {
    const configuredBinding = this.configuredModelBinding;
    return worker !== null
      && this.operationEpoch === operationEpoch
      && this.lifecycleState !== "off"
      && this.lifecycleState !== "failed"
      && this.suppression === null
      && this.campaignId === campaignId
      && this.worker === worker
      && this.workerEpoch === workerEpoch
      && configuredBinding !== null
      && hasMatchingModelBinding(configuredBinding, modelBinding);
  }

  private isCurrentOperation(
    operationEpoch: number,
    sourceEpoch: number,
    job: NarratorSourceJobV1,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): boolean {
    const configuredBinding = this.configuredModelBinding;
    return this.operationEpoch === operationEpoch
      && this.sourceEpoch === sourceEpoch
      && this.lifecycleState !== "off"
      && this.lifecycleState !== "failed"
      && this.suppression === null
      && this.campaignId === campaignId
      && configuredBinding !== null
      && hasMatchingModelBinding(configuredBinding, modelBinding)
      && job.campaignId === campaignId
      && this.activeJob?.sourceFingerprint === job.sourceFingerprint
      && this.currentSourceFingerprint === job.sourceFingerprint;
  }

  private canStartNarration(
    job: NarratorJobV1,
    sourceEpoch: number,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): boolean {
    const configuredBinding = this.configuredModelBinding;
    return this.suppression === null
      && this.lifecycleState !== "off"
      && this.lifecycleState !== "failed"
      && this.sourceEpoch === sourceEpoch
      && this.campaignId === campaignId
      && job.campaignId === campaignId
      && this.currentSourceFingerprint === job.sourceFingerprint
      && configuredBinding !== null
      && hasMatchingModelBinding(configuredBinding, modelBinding);
  }

  private queueNarration(
    job: NarratorJobV1,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): Promise<NarratorEnhancement> {
    this.cancelQueuedNarration();
    return new Promise((resolve) => {
      this.queuedNarration = {
        job,
        sourceEpoch: this.sourceEpoch,
        campaignId,
        modelBinding,
        resolve,
      };
    });
  }

  private cancelQueuedNarration(): void {
    const queued = this.queuedNarration;
    this.queuedNarration = null;
    queued?.resolve(null);
  }

  private promoteQueuedNarration(): void {
    const queued = this.queuedNarration;
    this.queuedNarration = null;
    if (queued === null) return;
    if (!this.canStartNarration(
      queued.job,
      queued.sourceEpoch,
      queued.campaignId,
      queued.modelBinding,
    )) {
      queued.resolve(null);
      return;
    }
    const task = this.startNarration(
      queued.job,
      queued.campaignId,
      queued.modelBinding,
    );
    void task.then(queued.resolve, () => queued.resolve(null));
  }

  private startNarration(
    job: NarratorJobV1,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): Promise<NarratorEnhancement> {
    const operationEpoch = this.operationEpoch;
    const sourceEpoch = this.sourceEpoch;
    this.activeJob = job;
    this.activeSourceEpoch = sourceEpoch;
    let task!: Promise<NarratorEnhancement>;
    task = this.realize(job, operationEpoch, sourceEpoch, campaignId, modelBinding)
      .catch(() => null)
      .finally(() => {
        if (this.activeTask !== task) return;
        this.activeTask = null;
        this.activeSourceEpoch = null;
        if (this.activeJob?.sourceFingerprint === job.sourceFingerprint) this.activeJob = null;
        this.promoteQueuedNarration();
      });
    this.activeTask = task;
    return task;
  }

  private startStoryBeat(
    job: StoryBeatJobV1,
    campaignId: string,
    modelBinding: NarratorModelBindingV1,
  ): Promise<StoryBeatClientResultV1> {
    const operationEpoch = this.operationEpoch;
    const sourceEpoch = this.sourceEpoch;
    this.activeJob = job;
    this.activeSourceEpoch = sourceEpoch;
    let task!: Promise<StoryBeatClientResultV1>;
    task = this.realizeStoryBeat(job, operationEpoch, sourceEpoch, campaignId, modelBinding)
      .catch(() => this.storyBeatFallback(job.deterministicFallback, "transport-failure"))
      .finally(() => {
        if (this.activeTask !== task) return;
        this.activeTask = null;
        this.activeSourceEpoch = null;
        if (this.activeJob?.sourceFingerprint === job.sourceFingerprint) this.activeJob = null;
        this.promoteQueuedNarration();
      });
    this.activeTask = task;
    return task;
  }

  private storyBeatFallback(
    text: string,
    reason: StoryBeatClientFallbackReasonV1,
  ): StoryBeatClientResultV1 {
    return Object.freeze({
      outcome: "fallback",
      source: "deterministic",
      text,
      reason,
    });
  }

  private get configuredModelBinding(): NarratorModelBindingV1 | null {
    if (this.model !== null) {
      return Object.freeze({
        modelId: this.model.id,
        revision: this.model.revision,
        artifactManifestHash: this.model.artifactManifestHash,
      });
    }
    if (this.experimentalPolicy !== null) {
      return Object.freeze({
        modelId: this.experimentalPolicy.modelId,
        revision: this.experimentalPolicy.revision,
        artifactManifestHash: this.experimentalPolicy.artifactManifestHash,
      });
    }
    return null;
  }

  private createWorker(): void {
    this.workerEpoch = this.epochFactory();
    const workerEpoch = this.workerEpoch;
    this.requestOrdinal = 0;
    const worker = this.dependencies.workerFactory();
    const isCurrentWorker = (): boolean =>
      this.worker === worker && this.workerEpoch === workerEpoch;
    try {
      worker.addEventListener("message", (event) => {
        if (isCurrentWorker()) this.receive(event.data);
      });
      worker.addEventListener("error", () => {
        if (isCurrentWorker()) this.fail("workerCrashed", "Narrator worker crashed");
      });
      worker.addEventListener("messageerror", () => {
        if (isCurrentWorker()) this.fail("messageError", "Narrator worker message failed");
      });
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
    kind: NarratorTransportRequestEnvelope["kind"],
    payload: NarratorTransportRequestEnvelope["payload"],
  ): Promise<NarratorTransportResponseEnvelope> {
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
    } as NarratorTransportRequestEnvelope;
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
    if (
      narratorEnvelopeByteLength(value) > narratorMaximumResponseBytes
      || !isNarratorTransportResponseEnvelope(value)
    ) {
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
    this.sourceEpoch += 1;
    this.cancelQueuedNarration();
    this.activeJob = null;
    this.activeTask = null;
    this.activeSourceEpoch = null;
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
