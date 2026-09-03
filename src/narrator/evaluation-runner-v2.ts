import { canonicalHash } from "../core/canonical";
import {
  isNarratorEvaluationRunSpecV2,
  isNarratorEvaluationWorkerBindingV2,
  type NarratorEvaluationRunSpecV2,
  type NarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorGeneratedTokenIdsV2,
  countNarratorInputTokenIdsV2,
  normalizeNarratorDecodedOutputV2,
} from "./evaluation-prompt-contract";
import {
  createNarratorCaseReceiptV2,
  createNarratorRunReceiptV2,
  isNarratorRunReceiptV2,
  isNarratorVerifiedArtifactsV2,
  type NarratorCaseReceiptV2,
  type NarratorEvaluationCaseStatusV2,
  type NarratorRunReceiptV2,
} from "./evaluation-receipts-v2";
import {
  narratorArtifactsMatchCandidate,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import {
  NarratorEvaluationDeviceLostError,
  createNarratorEvaluationWatchdog,
  type NarratorEvaluationClock,
  type NarratorEvaluationWatchdog,
} from "./evaluation-runner";
import {
  createNarratorEvaluationWorkerCaseRequestV2,
  isNarratorEvaluationWorkerCaseResponseForRequestV2,
  type NarratorEvaluationWorkerCaseRequestV2,
  type NarratorEvaluationWorkerCaseResponseV2,
} from "./evaluation-worker-protocol-v2";
import type { NarratorModelCandidate } from "./model-candidate";
import { isSafeAmbientNarration } from "./output-policy";
import { isNarratorBoundedText, narratorMaximumOutputTokens } from "./protocol";

export interface NarratorEvaluationWorkerPortV2 {
  readonly modelId: string;
  readonly workerEpoch: string;
  handshake(signal: AbortSignal): Promise<unknown>;
  verifyArtifacts(signal: AbortSignal): Promise<unknown>;
  load(signal: AbortSignal): Promise<void>;
  evaluate(
    request: NarratorEvaluationWorkerCaseRequestV2,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown>;
  dispose(signal: AbortSignal): Promise<void>;
  terminate(): void;
}

function elapsed(clock: NarratorEvaluationClock, started: number): number {
  const duration = clock.now() - started;
  return Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
}

function rowWithoutEvidence(
  runSpec: NarratorEvaluationRunSpecV2,
  ordinal: number,
  status: NarratorEvaluationCaseStatusV2,
  latencyMilliseconds: number,
): NarratorCaseReceiptV2 {
  return createNarratorCaseReceiptV2({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status,
    latencyMilliseconds,
  });
}

function responseStatus(
  response: NarratorEvaluationWorkerCaseResponseV2,
  ordinal: number,
): NarratorEvaluationCaseStatusV2 {
  if (response.outcome === "prompt-format-error") return "prompt-format-error";
  if (response.outcome === "input-tokenizer-error") return "input-tokenizer-error";
  if (response.outcome === "input-budget") return "input-budget";
  try {
    countNarratorInputTokenIdsV2(response.inputTokenIds!);
  } catch {
    return "input-token-contract-error";
  }
  if (response.outcome === "input-token-contract-error") return "worker-response-invalid";
  if (response.outcome === "generation-error") return "generation-error";
  if (response.outcome === "generated-token-contract-error" && response.fullDecoderTokenIds === null) {
    return "generated-token-contract-error";
  }
  try {
    accountNarratorGeneratedTokenIdsV2(response.fullDecoderTokenIds!);
  } catch {
    return "generated-token-contract-error";
  }
  if (response.outcome === "generated-token-contract-error") return "worker-response-invalid";
  if (response.outcome === "decode-error") return "decode-error";
  const normalized = normalizeNarratorDecodedOutputV2(response.decodedText);
  if (normalized === null) return "normalization-error";
  return isSafeAmbientNarration(normalized, narratorEvaluationCasesV1[ordinal]!.prompt)
    ? "ok"
    : "output-policy-rejected";
}

function rowFromResponse(
  runSpec: NarratorEvaluationRunSpecV2,
  ordinal: number,
  response: NarratorEvaluationWorkerCaseResponseV2,
  latencyMilliseconds: number,
): NarratorCaseReceiptV2 {
  const status = responseStatus(response, ordinal);
  const retainInputIds = ![
    "prompt-format-error", "input-tokenizer-error", "input-budget", "worker-response-invalid",
  ].includes(status);
  const retainGeneratedIds = ![
    "prompt-format-error", "input-tokenizer-error", "input-token-contract-error", "input-budget", "generation-error",
    "worker-response-invalid",
  ].includes(status);
  const retainOutput = status === "ok" || status === "output-policy-rejected";
  return createNarratorCaseReceiptV2({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status,
    inputTokenIds: retainInputIds ? response.inputTokenIds : null,
    observedInputTokens: status === "input-budget" ? response.observedInputTokens : null,
    fullDecoderTokenIds: retainGeneratedIds ? response.fullDecoderTokenIds : null,
    outputText: retainOutput ? response.decodedText : null,
    latencyMilliseconds,
  });
}

function requestId(
  runSpec: NarratorEvaluationRunSpecV2,
  workerEpoch: string,
  ordinal: number,
): string {
  return `case:${String(ordinal).padStart(3, "0")}:${canonicalHash({
    schemaVersion: 2,
    runSpecHash: runSpec.contentHash,
    workerEpoch,
    ordinal,
  })}`;
}

export async function runNarratorEvaluationV2(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV2,
  worker: NarratorEvaluationWorkerPortV2,
  clock: NarratorEvaluationClock,
  signal: AbortSignal,
  watchdog: NarratorEvaluationWatchdog = createNarratorEvaluationWatchdog(clock),
): Promise<NarratorRunReceiptV2> {
  if (!isNarratorEvaluationRunSpecV2(runSpec, candidate)) {
    throw new TypeError("Narrator V2 evaluation run specification is invalid");
  }
  const workerEpoch = worker.workerEpoch;
  if (!isNarratorBoundedText(workerEpoch, 200)) {
    throw new TypeError("Narrator V2 evaluation worker epoch is invalid");
  }
  const loadStarted = clock.now();
  let workerBinding: NarratorEvaluationWorkerBindingV2 | null = null;
  let verifiedArtifacts: readonly NarratorVerifiedArtifactV1[] = [];
  let loadStatus: NarratorRunReceiptV2["load"]["status"] = "load-error";
  let loadStage: NarratorRunReceiptV2["load"]["stage"] = "model-identity";
  let terminal = false;
  let terminationStatus: NarratorRunReceiptV2["termination"]["status"] = "not-requested";
  let loaded = false;
  let abortRowEmitted = false;
  const rows: NarratorCaseReceiptV2[] = [];

  const requestTermination = (): void => {
    if (terminal) return;
    terminal = true;
    try {
      worker.terminate();
      terminationStatus = "requested";
    } catch {
      terminationStatus = "request-error";
    }
  };

  const workerModelId = worker.modelId;
  if (typeof workerModelId !== "string" || workerModelId !== candidate.candidateId) {
    loadStatus = "model-id-mismatch";
    requestTermination();
  } else {
    loadStage = "handshake";
    const binding = await watchdog.run(
      runSpec.deadlines.cachedLoadMilliseconds,
      signal,
      (deadlineSignal) => worker.handshake(deadlineSignal),
    );
    if (binding.status === "completed") {
      if (!isNarratorEvaluationWorkerBindingV2(binding.value, runSpec, candidate)) {
        loadStatus = "worker-binding-mismatch";
        requestTermination();
      } else {
        workerBinding = binding.value;
        loadStage = "artifact-verification";
        const artifacts = await watchdog.run(
          runSpec.deadlines.cachedLoadMilliseconds,
          signal,
          (deadlineSignal) => worker.verifyArtifacts(deadlineSignal),
        );
        if (artifacts.status === "completed") {
          if (!isNarratorVerifiedArtifactsV2(artifacts.value)) {
            loadStatus = "artifact-evidence-invalid";
            requestTermination();
          } else if (!narratorArtifactsMatchCandidate(artifacts.value, candidate)) {
            verifiedArtifacts = artifacts.value;
            loadStatus = "artifact-mismatch";
            requestTermination();
          } else {
            verifiedArtifacts = artifacts.value;
            loadStage = "model-load";
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
              requestTermination();
            } else if (load.status === "timeout") {
              loadStatus = "load-timeout";
              requestTermination();
            } else if (load.error instanceof NarratorEvaluationDeviceLostError) {
              loadStatus = "device-lost";
              requestTermination();
            } else loadStatus = "load-error";
          }
        } else if (artifacts.status === "aborted") {
          loadStatus = "aborted";
          requestTermination();
        } else if (artifacts.status === "timeout") {
          loadStatus = "load-timeout";
          requestTermination();
        } else if (artifacts.error instanceof NarratorEvaluationDeviceLostError) {
          loadStatus = "device-lost";
          requestTermination();
        } else loadStatus = "load-error";
      }
    } else if (binding.status === "aborted") {
      loadStatus = "aborted";
      requestTermination();
    } else if (binding.status === "timeout") {
      loadStatus = "load-timeout";
      requestTermination();
    } else if (binding.error instanceof NarratorEvaluationDeviceLostError) {
      loadStatus = "device-lost";
      requestTermination();
    } else loadStatus = "load-error";
  }

  const loadLatencyMilliseconds = elapsed(clock, loadStarted);
  if (loaded) {
    for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
      if (terminal || signal.aborted) {
        if (signal.aborted) requestTermination();
        const status: NarratorEvaluationCaseStatusV2 = signal.aborted && !abortRowEmitted
          ? "run-aborted"
          : "not-run";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(rowWithoutEvidence(runSpec, ordinal, status, 0));
        continue;
      }
      const request = createNarratorEvaluationWorkerCaseRequestV2(
        runSpec,
        candidate,
        ordinal,
        workerEpoch,
        requestId(runSpec, workerEpoch, ordinal),
      );
      const started = clock.now();
      const outcome = await watchdog.run(
        runSpec.deadlines.wholeCaseMilliseconds,
        signal,
        (deadlineSignal) => worker.evaluate(request, {
          maximumOutputTokens: narratorMaximumOutputTokens,
          signal: deadlineSignal,
        }),
      );
      const latency = elapsed(clock, started);
      if (outcome.status === "completed") {
        if (!isNarratorEvaluationWorkerCaseResponseForRequestV2(outcome.value, request)) {
          rows.push(rowWithoutEvidence(runSpec, ordinal, "worker-response-invalid", latency));
          requestTermination();
        } else {
          const responseRow = rowFromResponse(runSpec, ordinal, outcome.value, latency);
          rows.push(responseRow);
          if (responseRow.status === "worker-response-invalid") requestTermination();
        }
      } else if (outcome.status === "error") {
        const deviceLost = outcome.error instanceof NarratorEvaluationDeviceLostError;
        rows.push(rowWithoutEvidence(runSpec, ordinal, deviceLost ? "device-lost" : "worker-call-error", latency));
        requestTermination();
      } else {
        const status = outcome.status === "timeout" ? "case-timeout" : "run-aborted";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(rowWithoutEvidence(runSpec, ordinal, status, latency));
        requestTermination();
      }
    }
  }
  while (rows.length < narratorEvaluationCasesV1.length) {
    rows.push(rowWithoutEvidence(
      runSpec,
      rows.length,
      loadStatus === "aborted" && rows.length === 0 ? "run-aborted" : "not-run",
      0,
    ));
  }

  let disposeStatus: NarratorRunReceiptV2["dispose"]["status"] = "not-attempted";
  let disposeLatencyMilliseconds = 0;
  if (!terminal) {
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
      requestTermination();
    } else {
      disposeStatus = "timeout";
      requestTermination();
    }
  }

  const receipt = createNarratorRunReceiptV2({
    runSpec,
    workerEpoch,
    workerBinding,
    verifiedArtifacts,
    load: { stage: loadStage, status: loadStatus, latencyMilliseconds: loadLatencyMilliseconds },
    rows,
    dispose: { status: disposeStatus, latencyMilliseconds: disposeLatencyMilliseconds },
    termination: { status: terminationStatus },
  });
  if (!isNarratorRunReceiptV2(receipt, candidate)) {
    throw new TypeError("Narrator V2 evaluation runner produced an invalid receipt");
  }
  return receipt;
}
