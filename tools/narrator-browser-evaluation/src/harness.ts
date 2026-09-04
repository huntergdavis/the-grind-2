import observedReceipt from "../../../docs/narrator/t5-artifact-publication-receipt.json";
import { createNarratorBlindStudyV2 } from "../../../src/narrator/blind-evaluation-v2";
import { createNarratorEvaluationRunSpecV2 } from "../../../src/narrator/evaluation-contract-v2";
import {
  narratorBrowserOrtRuntimeV2,
} from "../../../src/narrator/evaluation-browser-assets-v2";
import {
  createNarratorBrowserRunPackageV1,
  verifyNarratorBrowserAdapterBuildReceiptV1,
  type NarratorBrowserObservedBuildV1,
} from "../../../src/narrator/evaluation-browser-receipt-v2";
import { NarratorBrowserEvaluationWorkerPortV2 } from "../../../src/narrator/evaluation-browser-worker-port-v2";
import {
  accountNarratorGeneratedTokenIdsV2,
  countNarratorInputTokenIdsV2,
} from "../../../src/narrator/evaluation-prompt-contract";
import { createNarratorEvaluationWatchdog } from "../../../src/narrator/evaluation-runner";
import { runNarratorEvaluationV2 } from "../../../src/narrator/evaluation-runner-v2";
import {
  createNarratorEvaluationWorkerCaseRequestV2,
  isNarratorEvaluationWorkerCaseResponseForRequestV2,
} from "../../../src/narrator/evaluation-worker-protocol-v2";
import { createNarratorT5PublishedCandidateV1 } from "../../../src/narrator/t5-publication-evidence";
import {
  acquireNarratorBrowserArtifactsV2,
  type NarratorBrowserAcquisitionItemV2,
} from "./artifact-acquisition";

interface StageRequest {
  readonly runId: string;
  readonly workerEpoch: string;
  readonly modelArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
  readonly runtimeArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
}

interface FullRunRequest {
  readonly sheetId: string;
  readonly secretSalt: string;
}

const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
let runSpec: ReturnType<typeof createNarratorEvaluationRunSpecV2> | null = null;
let port: NarratorBrowserEvaluationWorkerPortV2 | null = null;

const clock = Object.freeze({
  now: () => performance.now(),
  setTimeout: (callback: () => void, milliseconds: number) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
});
const watchdog = createNarratorEvaluationWatchdog(clock);

const api = Object.freeze({
  runtimeManifest: narratorBrowserOrtRuntimeV2,

  createRunPackage: createNarratorBrowserRunPackageV1,

  validateBuildReceipt(
    value: unknown,
    expectedSourceCommit: string,
    observedBuild: NarratorBrowserObservedBuildV1,
  ): Promise<boolean> {
    return verifyNarratorBrowserAdapterBuildReceiptV1(
      value,
      candidate,
      expectedSourceCommit,
      observedBuild,
    );
  },

  async stage(request: StageRequest): Promise<unknown> {
    if (port !== null) throw new Error("Narrator browser harness is already staged");
    const worker = new Worker(new URL("./transformers.worker.ts", import.meta.url), {
      type: "module",
      name: "the-grind-2-narrator-evaluation-v2",
    });
    try {
      const [modelArtifacts, runtimeArtifacts] = await Promise.all([
        acquireNarratorBrowserArtifactsV2(request.modelArtifacts),
        acquireNarratorBrowserArtifactsV2(request.runtimeArtifacts),
      ]);
      const activeRunSpec = createNarratorEvaluationRunSpecV2(candidate, request.runId);
      runSpec = activeRunSpec;
      const activePort = new NarratorBrowserEvaluationWorkerPortV2({
        worker,
        workerEpoch: request.workerEpoch,
        candidate,
        runSpec: activeRunSpec,
        modelArtifacts,
        runtimeArtifacts,
      });
      port = activePort;
      const signal = new AbortController().signal;
      const handshake = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.handshake(deadlineSignal),
      );
      if (handshake.status !== "completed") {
        throw new Error(`Narrator browser staging handshake did not complete: ${handshake.status}`);
      }
      const verification = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.verifyArtifacts(deadlineSignal),
      );
      if (verification.status !== "completed") {
        throw new Error(`Narrator browser artifact verification did not complete: ${verification.status}`);
      }
      return Object.freeze({
        workerBinding: handshake.value,
        verifiedModelArtifacts: verification.value,
        verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
      });
    } catch (error) {
      worker.terminate();
      port = null;
      runSpec = null;
      throw error;
    }
  },

  async smokeAfterOffline(): Promise<unknown> {
    if (port === null || runSpec === null) throw new Error("Narrator browser harness is not staged");
    const activePort = port;
    const activeRunSpec = runSpec;
    const signal = new AbortController().signal;
    try {
      const load = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.load(deadlineSignal),
      );
      if (load.status !== "completed") {
        throw new Error(`Narrator browser smoke load did not complete: ${load.status}`);
      }
      const request = createNarratorEvaluationWorkerCaseRequestV2(
        activeRunSpec,
        candidate,
        0,
        activePort.workerEpoch,
        "browser-smoke:case:000",
      );
      const evaluation = await watchdog.run(
        activeRunSpec.deadlines.wholeCaseMilliseconds,
        signal,
        (deadlineSignal) => activePort.evaluate(request, {
          maximumOutputTokens: 48,
          signal: deadlineSignal,
        }),
      );
      if (evaluation.status !== "completed") {
        throw new Error(`Narrator browser smoke case did not complete: ${evaluation.status}`);
      }
      const value = evaluation.value;
      if (!isNarratorEvaluationWorkerCaseResponseForRequestV2(value, request)) {
        throw new TypeError("Narrator browser smoke response is invalid");
      }
      const inputTokens = value.inputTokenIds === null ? null : countNarratorInputTokenIdsV2(value.inputTokenIds);
      const output = value.fullDecoderTokenIds === null
        ? null
        : accountNarratorGeneratedTokenIdsV2(value.fullDecoderTokenIds);
      const disposal = await watchdog.run(
        activeRunSpec.deadlines.disposeMilliseconds,
        signal,
        (deadlineSignal) => activePort.dispose(deadlineSignal),
      );
      if (disposal.status !== "completed") {
        throw new Error(`Narrator browser smoke disposal did not complete: ${disposal.status}`);
      }
      port = null;
      runSpec = null;
      return Object.freeze({
        outcome: value.outcome,
        inputTokens,
        outputTokens: output?.outputTokens ?? null,
        stopReason: output?.stopReason ?? null,
        modelAdmitted: false,
        displayAuthorized: false,
      });
    } catch (error) {
      activePort.terminate();
      port = null;
      runSpec = null;
      throw error;
    }
  },

  async runAfterOffline(request: FullRunRequest): Promise<unknown> {
    if (port === null || runSpec === null) throw new Error("Narrator browser harness is not staged");
    const activePort = port;
    const activeRunSpec = runSpec;
    try {
      const receipt = await runNarratorEvaluationV2(
        candidate,
        activeRunSpec,
        activePort,
        clock,
        new AbortController().signal,
      );
      const blind = createNarratorBlindStudyV2(candidate, receipt, request.sheetId, request.secretSalt);
      port = null;
      runSpec = null;
      return Object.freeze({ receipt, sheet: blind.sheet, key: blind.key });
    } catch (error) {
      activePort.terminate();
      port = null;
      runSpec = null;
      throw error;
    }
  },
});

Object.defineProperty(globalThis, "__theGrindNarratorEvaluationV2", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api,
});

declare global {
  var __theGrindNarratorEvaluationV2: typeof api;
}
