import observedReceipt from "../../../docs/narrator/t5-artifact-publication-receipt.json";
import {
  narratorBrowserOrtRuntimeV2,
} from "../../../src/narrator/evaluation-browser-assets-v2";
import {
  createNarratorBrowserAdapterSmokeReceiptV3,
  narratorBrowserAdapterSmokeSourcePathsV3,
  verifyNarratorBrowserAdapterSmokeReceiptV3,
  type NarratorBrowserAdapterSmokeReceiptFieldsV3,
  type NarratorBrowserObservedBuildV3,
} from "../../../src/narrator/evaluation-browser-receipt-v3";
import { NarratorBrowserEvaluationWorkerPortV3 } from "../../../src/narrator/evaluation-browser-worker-port-v3";
import {
  createNarratorEvaluationRunSpecV3,
  isNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
  type NarratorEvaluationWorkerBindingV3,
} from "../../../src/narrator/evaluation-contract-v3";
import {
  createNarratorCaseReceiptV3,
  type NarratorSuccessfulCaseReceiptV3,
} from "../../../src/narrator/evaluation-receipts-v3";
import { createNarratorEvaluationWatchdog } from "../../../src/narrator/evaluation-runner";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  isNarratorEvaluationWorkerCaseResponseForRequestV3,
} from "../../../src/narrator/evaluation-worker-protocol-v3";
import { createNarratorT5PublishedCandidateV1 } from "../../../src/narrator/t5-publication-evidence";
import {
  acquireNarratorBrowserArtifactsV2,
  type NarratorBrowserAcquisitionItemV2,
} from "../../narrator-browser-evaluation/src/artifact-acquisition";

interface StageRequestV3 {
  readonly runId: string;
  readonly workerEpoch: string;
  readonly modelArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
  readonly runtimeArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
}

interface CommittedSourceBlobV3 {
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

interface ReceiptRequestV3 {
  readonly sourceCommit: string;
  readonly observedBuild: NarratorBrowserObservedBuildV3;
  readonly buildToolchain: NarratorBrowserAdapterSmokeReceiptFieldsV3["buildToolchain"];
  readonly browser: NarratorBrowserAdapterSmokeReceiptFieldsV3["browser"];
  readonly stage: {
    readonly runSpec: NarratorEvaluationRunSpecV3;
    readonly workerBinding: NarratorEvaluationWorkerBindingV3;
    readonly verifiedModelArtifacts: NarratorBrowserAdapterSmokeReceiptFieldsV3["verifiedModelArtifacts"];
    readonly verifiedRuntimeArtifacts: NarratorBrowserAdapterSmokeReceiptFieldsV3["verifiedRuntimeArtifacts"];
  };
  readonly network: NarratorBrowserAdapterSmokeReceiptFieldsV3["network"];
  readonly smoke: {
    readonly load: NarratorBrowserAdapterSmokeReceiptFieldsV3["load"];
    readonly caseReceipt: NarratorSuccessfulCaseReceiptV3;
    readonly dispose: NarratorBrowserAdapterSmokeReceiptFieldsV3["dispose"];
  };
}

const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
let runSpec: NarratorEvaluationRunSpecV3 | null = null;
let workerBinding: NarratorEvaluationWorkerBindingV3 | null = null;
let port: NarratorBrowserEvaluationWorkerPortV3 | null = null;

const clock = Object.freeze({
  now: () => performance.now(),
  setTimeout: (callback: () => void, milliseconds: number) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
});
const watchdog = createNarratorEvaluationWatchdog(clock);

function elapsed(started: number): number {
  const duration = clock.now() - started;
  return Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
}

function failStagedPort(activePort: NarratorBrowserEvaluationWorkerPortV3): void {
  try {
    activePort.terminate();
  } catch {
    // The active operation remains the primary failure.
  } finally {
    port = null;
    runSpec = null;
    workerBinding = null;
  }
}

const api = Object.freeze({
  runtimeManifest: narratorBrowserOrtRuntimeV2,
  sourcePaths: narratorBrowserAdapterSmokeSourcePathsV3,

  createSmokeReceipt(request: ReceiptRequestV3): unknown {
    return createNarratorBrowserAdapterSmokeReceiptV3(candidate, {
      sourceCommit: request.sourceCommit,
      observedBuild: request.observedBuild,
      buildToolchain: request.buildToolchain,
      runSpec: request.stage.runSpec,
      workerEpoch: request.smoke.caseReceipt.request.workerEpoch,
      workerBinding: request.stage.workerBinding,
      verifiedModelArtifacts: request.stage.verifiedModelArtifacts,
      verifiedRuntimeArtifacts: request.stage.verifiedRuntimeArtifacts,
      browser: request.browser,
      network: request.network,
      load: request.smoke.load,
      caseReceipt: request.smoke.caseReceipt,
      dispose: request.smoke.dispose,
    });
  },

  async validateSmokeReceipt(
    value: unknown,
    expectedSourceCommit: string,
    observedBuild: NarratorBrowserObservedBuildV3,
    committedSources: readonly CommittedSourceBlobV3[],
  ): Promise<boolean> {
    const sources = new Map<string, ArrayBuffer>();
    for (const source of committedSources) {
      if (typeof source !== "object"
        || source === null
        || typeof source.path !== "string"
        || !(source.bytes instanceof ArrayBuffer)
        || sources.has(source.path)) return false;
      sources.set(source.path, source.bytes);
    }
    return verifyNarratorBrowserAdapterSmokeReceiptV3(
      value,
      candidate,
      expectedSourceCommit,
      observedBuild,
      async (commit, path) => {
        if (commit !== expectedSourceCommit) throw new Error("Unexpected narrator source commit");
        const bytes = sources.get(path);
        if (bytes === undefined) throw new Error("Missing narrator committed source bytes");
        return bytes;
      },
    );
  },

  async stage(request: StageRequestV3): Promise<unknown> {
    if (port !== null) throw new Error("Narrator V3 browser harness is already staged");
    const [modelArtifacts, runtimeArtifacts] = await Promise.all([
      acquireNarratorBrowserArtifactsV2(request.modelArtifacts),
      acquireNarratorBrowserArtifactsV2(request.runtimeArtifacts),
    ]);
    const worker = new Worker(new URL("./transformers.worker.ts", import.meta.url), {
      type: "module",
      name: "the-grind-2-narrator-evaluation-v3",
    });
    try {
      const activeRunSpec = createNarratorEvaluationRunSpecV3(candidate, request.runId);
      const activePort = new NarratorBrowserEvaluationWorkerPortV3({
        worker,
        workerEpoch: request.workerEpoch,
        candidate,
        runSpec: activeRunSpec,
        modelArtifacts,
        runtimeArtifacts,
      });
      port = activePort;
      runSpec = activeRunSpec;
      const signal = new AbortController().signal;
      const handshake = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.handshake(deadlineSignal),
      );
      if (handshake.status !== "completed"
        || !isNarratorEvaluationWorkerBindingV3(handshake.value, activeRunSpec, candidate)) {
        throw new Error("Narrator V3 browser staging handshake is invalid");
      }
      workerBinding = handshake.value;
      const verification = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.verifyArtifacts(deadlineSignal),
      );
      if (verification.status !== "completed") {
        throw new Error(`Narrator V3 artifact verification did not complete: ${verification.status}`);
      }
      return Object.freeze({
        runSpec: activeRunSpec,
        workerBinding: handshake.value,
        verifiedModelArtifacts: verification.value,
        verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
      });
    } catch (error) {
      try {
        worker.terminate();
      } catch {
        // The staging operation remains the primary failure.
      } finally {
        port = null;
        runSpec = null;
        workerBinding = null;
      }
      throw error;
    }
  },

  async smokeAfterOffline(): Promise<unknown> {
    if (port === null || runSpec === null || workerBinding === null) {
      throw new Error("Narrator V3 browser harness is not staged");
    }
    const activePort = port;
    const activeRunSpec = runSpec;
    const signal = new AbortController().signal;
    try {
      const loadStarted = clock.now();
      const load = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.load(deadlineSignal),
      );
      const loadLatencyMilliseconds = elapsed(loadStarted);
      if (load.status !== "completed") {
        throw new Error(`Narrator V3 browser smoke load did not complete: ${load.status}`);
      }

      const request = createNarratorEvaluationWorkerCaseRequestV3(
        activeRunSpec,
        candidate,
        0,
        activePort.workerEpoch,
        null,
        null,
      );
      const caseStarted = clock.now();
      const evaluation = await watchdog.run(
        activeRunSpec.deadlines.wholeCaseMilliseconds,
        signal,
        (deadlineSignal) => activePort.evaluate(request, {
          maximumOutputTokens: 48,
          signal: deadlineSignal,
        }),
      );
      const caseLatencyMilliseconds = elapsed(caseStarted);
      if (evaluation.status !== "completed"
        || !isNarratorEvaluationWorkerCaseResponseForRequestV3(evaluation.value, request)
        || evaluation.value.outcome !== "selected") {
        throw new Error("Narrator V3 browser smoke did not produce a valid selection");
      }
      const caseReceipt = createNarratorCaseReceiptV3(
        activeRunSpec,
        candidate,
        null,
        null,
        {
          ordinal: 0,
          status: "ok",
          request,
          response: evaluation.value,
          latencyMilliseconds: caseLatencyMilliseconds,
        },
      );
      if (caseReceipt.status !== "ok") throw new Error("Narrator V3 browser smoke receipt is not successful");

      const disposeStarted = clock.now();
      const disposal = await watchdog.run(
        activeRunSpec.deadlines.disposeMilliseconds,
        signal,
        (deadlineSignal) => activePort.dispose(deadlineSignal),
      );
      const disposeLatencyMilliseconds = elapsed(disposeStarted);
      if (disposal.status !== "completed") {
        throw new Error(`Narrator V3 browser smoke disposal did not complete: ${disposal.status}`);
      }
      port = null;
      runSpec = null;
      workerBinding = null;
      return Object.freeze({
        load: {
          stage: "model-load" as const,
          status: "ok" as const,
          latencyMilliseconds: loadLatencyMilliseconds,
        },
        caseReceipt,
        dispose: {
          status: "ok" as const,
          latencyMilliseconds: disposeLatencyMilliseconds,
        },
      });
    } catch (error) {
      failStagedPort(activePort);
      throw error;
    }
  },
});

Object.defineProperty(globalThis, "__theGrindNarratorEvaluationV3", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api,
});

declare global {
  var __theGrindNarratorEvaluationV3: typeof api;
}
