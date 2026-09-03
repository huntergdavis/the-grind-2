import {
  createNarratorCaseReceiptV1,
  createNarratorRunReceiptV1,
  isNarratorEvaluationRunSpecV1,
  isNarratorEvaluationWorkerBindingV1,
  isNarratorRunReceiptV1,
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorEvaluationCaseStatus,
  type NarratorEvaluationRunSpecV1,
  type NarratorRunReceiptV1,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import { narratorEvaluationCasesV1 } from "./evaluation";
import type { NarratorModelCandidateV1 } from "./model-candidate";
import { isSafeAmbientNarration } from "./output-policy";
import {
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  narratorMaximumResponseBytes,
  narratorEnvelopeByteLength,
  isNarratorRecord,
  narratorHasExactKeys,
  normalizeNarratorOutput,
  type NarratorPromptV1,
} from "./protocol";

export interface NarratorEvaluationClock {
  now(): number;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type NarratorEvaluationWorkerError =
  | "input-tokenizer-error"
  | "realizer-error"
  | "output-tokenizer-error";

export class NarratorEvaluationDeviceLostError extends Error {
  constructor(message = "Narrator evaluation worker lost its inference device") {
    super(message);
    this.name = "NarratorEvaluationDeviceLostError";
  }
}

export interface NarratorEvaluationWorkerCaseResult {
  readonly error: NarratorEvaluationWorkerError | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly outputText: string | null;
}

export interface NarratorEvaluationWorkerPort {
  readonly modelId: string;
  handshake(signal: AbortSignal): Promise<unknown>;
  verifyArtifacts(signal: AbortSignal): Promise<unknown>;
  load(signal: AbortSignal): Promise<void>;
  evaluate(
    prompt: NarratorPromptV1,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown>;
  dispose(signal: AbortSignal): Promise<void>;
  terminate(): void;
}

export type NarratorDeadlineOutcome<T> =
  | { readonly status: "completed"; readonly value: T }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "timeout" }
  | { readonly status: "aborted" };

export interface NarratorEvaluationWatchdog {
  run<T>(
    milliseconds: number,
    parentSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<NarratorDeadlineOutcome<T>>;
}

export function createNarratorEvaluationWatchdog(
  clock: NarratorEvaluationClock,
): NarratorEvaluationWatchdog {
  return {
    run<T>(
      milliseconds: number,
      parentSignal: AbortSignal,
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<NarratorDeadlineOutcome<T>> {
      if (parentSignal.aborted) return Promise.resolve({ status: "aborted" });
      const controller = new AbortController();
      return new Promise((resolve) => {
        let settled = false;
        let timeoutHandle: unknown;
        const finish = (outcome: NarratorDeadlineOutcome<T>): void => {
          if (settled) return;
          settled = true;
          if (timeoutHandle !== undefined) clock.clearTimeout(timeoutHandle);
          parentSignal.removeEventListener("abort", abort);
          resolve(outcome);
        };
        const abort = (): void => {
          controller.abort();
          finish({ status: "aborted" });
        };
        timeoutHandle = clock.setTimeout(() => {
          controller.abort();
          finish({ status: "timeout" });
        }, milliseconds);
        parentSignal.addEventListener("abort", abort, { once: true });
        if (parentSignal.aborted) abort();
        void (async () => {
          if (settled) return;
          try {
            const value = await operation(controller.signal);
            finish({ status: "completed", value });
          } catch (error) {
            finish(controller.signal.aborted
              ? (parentSignal.aborted ? { status: "aborted" } : { status: "timeout" })
              : { status: "error", error });
          }
        })();
      });
    },
  };
}

function elapsed(clock: NarratorEvaluationClock, started: number): number {
  const duration = clock.now() - started;
  return Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
}

function isWorkerCaseResult(value: unknown): value is NarratorEvaluationWorkerCaseResult {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["error", "inputTokens", "outputTokens", "outputText"])
    || ![null, "input-tokenizer-error", "realizer-error", "output-tokenizer-error"].includes(
      value.error as NarratorEvaluationWorkerError | null,
    )
    || !(value.inputTokens === null
      || (Number.isSafeInteger(value.inputTokens) && Number(value.inputTokens) >= 0))
    || !(value.outputTokens === null
      || (Number.isSafeInteger(value.outputTokens) && Number(value.outputTokens) >= 0))
    || !(value.outputText === null || typeof value.outputText === "string")
    || (typeof value.outputText === "string"
      && narratorEnvelopeByteLength(value.outputText) > narratorMaximumResponseBytes)) return false;
  if (value.error === null) {
    return value.inputTokens !== null
      && value.outputTokens !== null
      && typeof value.outputText === "string";
  }
  if (value.error === "input-tokenizer-error") {
    return value.inputTokens === null && value.outputTokens === null && value.outputText === null;
  }
  if (value.error === "realizer-error") {
    return (value.inputTokens === null
      || (Number(value.inputTokens) >= 1 && Number(value.inputTokens) <= narratorMaximumInputTokens))
      && value.outputTokens === null
      && value.outputText === null;
  }
  return Number(value.inputTokens) >= 1
    && Number(value.inputTokens) <= narratorMaximumInputTokens
    && value.outputTokens === null
    && normalizeNarratorOutput(value.outputText) !== null;
}

function workerStatus(result: NarratorEvaluationWorkerCaseResult, ordinal: number): NarratorEvaluationCaseStatus {
  if (result.error !== null) return result.error;
  if (!Number.isSafeInteger(result.inputTokens)
    || result.inputTokens === null
    || result.inputTokens < 1
    || result.inputTokens > narratorMaximumInputTokens) return "input-budget";
  const normalized = normalizeNarratorOutput(result.outputText);
  if (!Number.isSafeInteger(result.outputTokens)
    || result.outputTokens === null
    || result.outputTokens < 1
    || result.outputTokens > narratorMaximumOutputTokens) return "output-budget";
  if (normalized === null || !isSafeAmbientNarration(normalized, narratorEvaluationCasesV1[ordinal]!.prompt)) {
    return "output-policy-rejected";
  }
  return "ok";
}

function row(
  runSpec: NarratorEvaluationRunSpecV1,
  ordinal: number,
  status: NarratorEvaluationCaseStatus,
  latencyMilliseconds: number,
  result?: NarratorEvaluationWorkerCaseResult,
) {
  const inputTokens = result?.inputTokens ?? null;
  const normalizedOutput = normalizeNarratorOutput(result?.outputText) ?? null;
  const retainInput = !["not-run", "run-aborted", "input-tokenizer-error", "worker-response-invalid",
    "realizer-timeout", "device-lost"].includes(status);
  const retainOutputTokens = ["ok", "output-budget", "output-policy-rejected"].includes(status);
  const retainOutputText = ["ok", "output-tokenizer-error", "output-budget", "output-policy-rejected"].includes(status);
  return createNarratorCaseReceiptV1({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status,
    inputTokens: retainInput ? inputTokens : null,
    outputTokens: retainOutputTokens ? result?.outputTokens ?? null : null,
    outputText: retainOutputText ? normalizedOutput : null,
    latencyMilliseconds,
  });
}

export async function runNarratorEvaluationV1(
  candidate: NarratorModelCandidateV1,
  runSpec: NarratorEvaluationRunSpecV1,
  worker: NarratorEvaluationWorkerPort,
  clock: NarratorEvaluationClock,
  signal: AbortSignal,
  watchdog: NarratorEvaluationWatchdog = createNarratorEvaluationWatchdog(clock),
): Promise<NarratorRunReceiptV1> {
  if (!isNarratorEvaluationRunSpecV1(runSpec, candidate)) {
    throw new TypeError("Narrator evaluation run specification is invalid");
  }
  const loadStarted = clock.now();
  let verifiedArtifacts: readonly NarratorVerifiedArtifactV1[] = [];
  let loadStatus: NarratorRunReceiptV1["load"]["status"] = "load-error";
  let terminated = false;
  let loaded = false;
  let abortRowEmitted = false;
  const rows = [] as ReturnType<typeof row>[];

  const hardTerminate = (): void => {
    if (terminated) return;
    terminated = true;
    try {
      worker.terminate();
    } catch {
      // Termination is the last-resort cleanup boundary; receipts must still complete.
    }
  };

  if (typeof worker.modelId !== "string" || worker.modelId !== candidate.candidateId) {
    loadStatus = "model-id-mismatch";
    hardTerminate();
  } else {
    const binding = await watchdog.run(
      runSpec.deadlines.cachedLoadMilliseconds,
      signal,
      (deadlineSignal) => worker.handshake(deadlineSignal),
    );
    if (binding.status === "completed") {
      if (!isNarratorEvaluationWorkerBindingV1(binding.value, runSpec)) {
        loadStatus = "worker-binding-mismatch";
        hardTerminate();
      } else {
        const artifacts = await watchdog.run(
          runSpec.deadlines.cachedLoadMilliseconds,
          signal,
          (deadlineSignal) => worker.verifyArtifacts(deadlineSignal),
        );
        if (artifacts.status === "completed") {
          if (!isNarratorVerifiedArtifactsV1(artifacts.value)) {
            loadStatus = "artifact-evidence-invalid";
            hardTerminate();
          } else if (!narratorArtifactsMatchCandidate(artifacts.value, candidate)) {
            verifiedArtifacts = artifacts.value;
            loadStatus = "artifact-mismatch";
            hardTerminate();
          } else {
            verifiedArtifacts = artifacts.value;
            const load = await watchdog.run(
              runSpec.deadlines.cachedLoadMilliseconds,
              signal,
              (deadlineSignal) => worker.load(deadlineSignal),
            );
            if (load.status === "completed") {
              loadStatus = "ok";
              loaded = true;
            } else if (load.status === "aborted") {
              loadStatus = "aborted";
              hardTerminate();
            } else if (load.status === "timeout") {
              loadStatus = "load-timeout";
              hardTerminate();
            } else if (load.error instanceof NarratorEvaluationDeviceLostError) {
              loadStatus = "device-lost";
              hardTerminate();
            } else loadStatus = "load-error";
          }
        } else if (artifacts.status === "aborted") {
          loadStatus = "aborted";
          hardTerminate();
        } else if (artifacts.status === "timeout") {
          loadStatus = "load-timeout";
          hardTerminate();
        } else if (artifacts.error instanceof NarratorEvaluationDeviceLostError) {
          loadStatus = "device-lost";
          hardTerminate();
        } else loadStatus = "load-error";
      }
    } else if (binding.status === "aborted") {
      loadStatus = "aborted";
      hardTerminate();
    } else if (binding.status === "timeout") {
      loadStatus = "load-timeout";
      hardTerminate();
    } else if (binding.error instanceof NarratorEvaluationDeviceLostError) {
      loadStatus = "device-lost";
      hardTerminate();
    } else loadStatus = "load-error";
  }

  const loadLatencyMilliseconds = elapsed(clock, loadStarted);
  if (loaded) {
    for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
      if (terminated || signal.aborted) {
        if (signal.aborted) hardTerminate();
        const status: NarratorEvaluationCaseStatus = signal.aborted && !abortRowEmitted
          ? "run-aborted"
          : "not-run";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(row(runSpec, ordinal, status, 0));
        continue;
      }
      const started = clock.now();
      const outcome = await watchdog.run(
        runSpec.deadlines.wholeCaseMilliseconds,
        signal,
        (deadlineSignal) => worker.evaluate(narratorEvaluationCasesV1[ordinal]!.prompt, {
          maximumOutputTokens: narratorMaximumOutputTokens,
          signal: deadlineSignal,
        }),
      );
      const latency = elapsed(clock, started);
      if (outcome.status === "completed") {
        if (!isWorkerCaseResult(outcome.value)) {
          rows.push(row(runSpec, ordinal, "worker-response-invalid", latency));
          hardTerminate();
        } else {
          rows.push(row(runSpec, ordinal, workerStatus(outcome.value, ordinal), latency, outcome.value));
        }
      } else if (outcome.status === "error") {
        const deviceLost = outcome.error instanceof NarratorEvaluationDeviceLostError;
        rows.push(row(runSpec, ordinal, deviceLost ? "device-lost" : "realizer-error", latency));
        if (deviceLost) hardTerminate();
      } else {
        const status = outcome.status === "timeout" ? "realizer-timeout" : "run-aborted";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(row(runSpec, ordinal, status, latency));
        hardTerminate();
      }
    }
  }
  while (rows.length < narratorEvaluationCasesV1.length) {
    rows.push(row(runSpec, rows.length, loadStatus === "aborted" && rows.length === 0 ? "run-aborted" : "not-run", 0));
  }

  let disposeStatus: NarratorRunReceiptV1["dispose"]["status"] = "hard-terminated";
  let disposeLatencyMilliseconds = 0;
  if (!terminated) {
    const disposeStarted = clock.now();
    const dispose = await watchdog.run(
      runSpec.deadlines.disposeMilliseconds,
      new AbortController().signal,
      (deadlineSignal) => worker.dispose(deadlineSignal),
    );
    disposeLatencyMilliseconds = elapsed(clock, disposeStarted);
    if (dispose.status === "completed") disposeStatus = "ok";
    else if (dispose.status === "error") {
      disposeStatus = dispose.error instanceof NarratorEvaluationDeviceLostError ? "device-lost" : "error";
      if (disposeStatus === "device-lost") hardTerminate();
    }
    else {
      disposeStatus = "timeout";
      hardTerminate();
    }
  }

  const receipt = createNarratorRunReceiptV1({
    runSpec,
    verifiedArtifacts,
    load: { status: loadStatus, latencyMilliseconds: loadLatencyMilliseconds },
    rows,
    dispose: { status: disposeStatus, latencyMilliseconds: disposeLatencyMilliseconds },
  });
  if (!isNarratorRunReceiptV1(receipt, candidate)) {
    throw new TypeError("Narrator evaluation runner produced an invalid receipt");
  }
  return receipt;
}
