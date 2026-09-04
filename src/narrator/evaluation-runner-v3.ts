import {
  isNarratorEvaluationRunSpecV3,
  isNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
  type NarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
  isNarratorRunReceiptV3,
  type NarratorCaseReceiptV3,
  type NarratorEvaluationCaseStatusV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import {
  NarratorEvaluationDeviceLostError,
  createNarratorEvaluationWatchdog,
  type NarratorEvaluationClock,
  type NarratorEvaluationWatchdog,
} from "./evaluation-runner";
import type { NarratorFormIdV3 } from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  isNarratorEvaluationWorkerCaseResponseForRequestV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerOutcomeV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  isNarratorBoundedText,
  narratorMaximumOutputTokens,
} from "./protocol";

export interface NarratorEvaluationWorkerPortV3 {
  readonly modelId: string;
  readonly workerEpoch: string;
  handshake(signal: AbortSignal): Promise<unknown>;
  verifyArtifacts(signal: AbortSignal): Promise<unknown>;
  load(signal: AbortSignal): Promise<void>;
  evaluate(
    request: NarratorEvaluationWorkerCaseRequestV3,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<unknown>;
  dispose(signal: AbortSignal): Promise<void>;
  terminate(): void;
}

const responseStatuses = Object.freeze({
  selected: "ok",
  "prompt-format-error": "prompt-format-error",
  "input-tokenizer-error": "input-tokenizer-error",
  "input-token-contract-error": "input-token-contract-error",
  "input-budget": "input-budget",
  "target-tokenizer-error": "target-tokenizer-error",
  "target-token-contract-error": "target-token-contract-error",
  "generation-error": "generation-error",
  "selection-contract-error": "selection-contract-error",
} satisfies Record<NarratorEvaluationWorkerOutcomeV3, NarratorEvaluationCaseStatusV3>);

function elapsed(clock: NarratorEvaluationClock, started: number): number {
  const duration = clock.now() - started;
  return Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
}

function isDenseVerifiedArtifacts(
  value: unknown,
): value is readonly NarratorVerifiedArtifactV1[] {
  return Array.isArray(value)
    && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index))
    && isNarratorVerifiedArtifactsV1(value);
}

function priorSelectedFormId(
  rows: readonly NarratorCaseReceiptV3[],
  ordinal: number,
): NarratorFormIdV3 | null {
  if (ordinal % 2 === 0) return null;
  const prior = rows[ordinal - 1];
  return prior?.status === "ok" ? prior.selectedFormId : null;
}

function rowWithoutResponse(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV3,
  rows: readonly NarratorCaseReceiptV3[],
  priorWorkerResponseHash: string | null,
  ordinal: number,
  status: NarratorEvaluationCaseStatusV3,
  request: NarratorEvaluationWorkerCaseRequestV3 | null,
  latencyMilliseconds: number,
): NarratorCaseReceiptV3 {
  return createNarratorCaseReceiptV3(
    runSpec,
    candidate,
    priorSelectedFormId(rows, ordinal),
    priorWorkerResponseHash,
    {
      ordinal,
      status,
      request,
      response: null,
      latencyMilliseconds,
    },
  );
}

function rowFromResponse(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV3,
  rows: readonly NarratorCaseReceiptV3[],
  priorWorkerResponseHash: string | null,
  request: NarratorEvaluationWorkerCaseRequestV3,
  response: NarratorEvaluationWorkerCaseResponseV3,
  latencyMilliseconds: number,
): NarratorCaseReceiptV3 {
  return createNarratorCaseReceiptV3(
    runSpec,
    candidate,
    priorSelectedFormId(rows, request.ordinal),
    priorWorkerResponseHash,
    {
      ordinal: request.ordinal,
      status: responseStatuses[response.outcome],
      request,
      response,
      latencyMilliseconds,
    },
  );
}

export async function runNarratorEvaluationV3(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV3,
  worker: NarratorEvaluationWorkerPortV3,
  clock: NarratorEvaluationClock,
  signal: AbortSignal,
  watchdog: NarratorEvaluationWatchdog = createNarratorEvaluationWatchdog(clock),
): Promise<NarratorRunReceiptV3> {
  if (!isNarratorEvaluationRunSpecV3(runSpec, candidate)) {
    throw new TypeError("Narrator V3 evaluation run specification is invalid");
  }
  const workerEpoch = worker.workerEpoch;
  if (!isNarratorBoundedText(workerEpoch, 200)) {
    throw new TypeError("Narrator V3 evaluation worker epoch is invalid");
  }

  const loadStarted = clock.now();
  let workerBinding: NarratorEvaluationWorkerBindingV3 | null = null;
  let verifiedArtifacts: readonly NarratorVerifiedArtifactV1[] = [];
  let loadStatus: NarratorRunReceiptV3["load"]["status"] = "load-error";
  let loadStage: NarratorRunReceiptV3["load"]["stage"] = "model-identity";
  let terminal = false;
  let terminationStatus: NarratorRunReceiptV3["termination"]["status"] = "not-requested";
  let loaded = false;
  let abortRowEmitted = false;
  const rows: NarratorCaseReceiptV3[] = [];
  let priorWorkerResponseHash: string | null = null;

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
      if (!isNarratorEvaluationWorkerBindingV3(binding.value, runSpec, candidate)) {
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
          if (!isDenseVerifiedArtifacts(artifacts.value)) {
            loadStatus = "artifact-evidence-invalid";
            requestTermination();
          } else if (!narratorArtifactsMatchCandidate(artifacts.value, candidate)
            || artifacts.value.length !== 6) {
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
            } else {
              loadStatus = "load-error";
            }
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
        } else {
          loadStatus = "load-error";
        }
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
    } else {
      loadStatus = "load-error";
    }
  }

  const loadLatencyMilliseconds = elapsed(clock, loadStarted);
  if (loaded) {
    for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
      if (terminal || signal.aborted) {
        if (signal.aborted) requestTermination();
        const status: NarratorEvaluationCaseStatusV3 = signal.aborted && !abortRowEmitted
          ? "run-aborted"
          : "not-run";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(rowWithoutResponse(
          candidate,
          runSpec,
          rows,
          priorWorkerResponseHash,
          ordinal,
          status,
          null,
          0,
        ));
        continue;
      }

      const request = createNarratorEvaluationWorkerCaseRequestV3(
        runSpec,
        candidate,
        ordinal,
        workerEpoch,
        priorSelectedFormId(rows, ordinal),
        priorWorkerResponseHash,
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
      const latencyMilliseconds = elapsed(clock, started);
      if (outcome.status === "completed") {
        if (!isNarratorEvaluationWorkerCaseResponseForRequestV3(outcome.value, request)) {
          rows.push(rowWithoutResponse(
            candidate,
            runSpec,
            rows,
            priorWorkerResponseHash,
            ordinal,
            "worker-response-invalid",
            request,
            latencyMilliseconds,
          ));
          requestTermination();
        } else {
          const response = outcome.value;
          rows.push(rowFromResponse(
            candidate,
            runSpec,
            rows,
            priorWorkerResponseHash,
            request,
            response,
            latencyMilliseconds,
          ));
          priorWorkerResponseHash = response.contentHash;
        }
      } else if (outcome.status === "error") {
        const deviceLost = outcome.error instanceof NarratorEvaluationDeviceLostError;
        rows.push(rowWithoutResponse(
          candidate,
          runSpec,
          rows,
          priorWorkerResponseHash,
          ordinal,
          deviceLost ? "device-lost" : "worker-call-error",
          request,
          latencyMilliseconds,
        ));
        requestTermination();
      } else {
        const status = outcome.status === "timeout" ? "case-timeout" : "run-aborted";
        abortRowEmitted ||= status === "run-aborted";
        rows.push(rowWithoutResponse(
          candidate,
          runSpec,
          rows,
          priorWorkerResponseHash,
          ordinal,
          status,
          request,
          latencyMilliseconds,
        ));
        requestTermination();
      }
    }
  }

  while (rows.length < narratorEvaluationCasesV1.length) {
    const ordinal = rows.length;
    rows.push(rowWithoutResponse(
      candidate,
      runSpec,
      rows,
      priorWorkerResponseHash,
      ordinal,
      loadStatus === "aborted" && ordinal === 0 ? "run-aborted" : "not-run",
      null,
      0,
    ));
  }

  let disposeStatus: NarratorRunReceiptV3["dispose"]["status"] = "not-attempted";
  let disposeLatencyMilliseconds = 0;
  if (!terminal) {
    const disposeStarted = clock.now();
    const dispose = await watchdog.run(
      runSpec.deadlines.disposeMilliseconds,
      new AbortController().signal,
      (deadlineSignal) => worker.dispose(deadlineSignal),
    );
    disposeLatencyMilliseconds = elapsed(clock, disposeStarted);
    if (dispose.status === "completed") {
      disposeStatus = "ok";
    } else if (dispose.status === "error") {
      disposeStatus = dispose.error instanceof NarratorEvaluationDeviceLostError ? "device-lost" : "error";
      requestTermination();
    } else {
      disposeStatus = "timeout";
      requestTermination();
    }
  }

  const receipt = createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding,
    verifiedArtifacts,
    load: {
      stage: loadStage,
      status: loadStatus,
      latencyMilliseconds: loadLatencyMilliseconds,
    },
    rows,
    dispose: {
      status: disposeStatus,
      latencyMilliseconds: disposeLatencyMilliseconds,
    },
    termination: { status: terminationStatus },
  });
  if (!isNarratorRunReceiptV3(receipt, candidate)) {
    throw new TypeError("Narrator V3 evaluation runner produced an invalid receipt");
  }
  return receipt;
}
