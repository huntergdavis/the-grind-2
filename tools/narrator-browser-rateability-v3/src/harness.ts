import {
  createNarratorBlindStudyV3,
} from "../../../src/narrator/blind-evaluation-v3";
import {
  narratorBrowserFullRunSourcePathsV3,
} from "../../../src/narrator/evaluation-browser-run-receipt-v3";
import { NarratorBrowserEvaluationWorkerPortV3 } from "../../../src/narrator/evaluation-browser-worker-port-v3";
import {
  createNarratorEvaluationRunSpecV3,
  type NarratorEvaluationRunSpecV3,
} from "../../../src/narrator/evaluation-contract-v3";
import {
  createNarratorRateabilitySummaryV3,
} from "../../../src/narrator/evaluation-rateability-v3";
import { createNarratorEvaluationWatchdog } from "../../../src/narrator/evaluation-runner";
import { runNarratorEvaluationV3 } from "../../../src/narrator/evaluation-runner-v3";
import {
  acquireNarratorBrowserArtifactsV2,
  type NarratorBrowserAcquisitionItemV2,
} from "../../narrator-browser-evaluation/src/artifact-acquisition";
import {
  narratorBrowserRateabilityCandidateV3 as candidate,
  type NarratorBrowserCompletedEvidenceV3 as CompletedEvidenceV3,
} from "./evidence";

interface StageRequestV3 {
  readonly runId: string;
  readonly workerEpoch: string;
  readonly modelArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
  readonly runtimeArtifacts: readonly NarratorBrowserAcquisitionItemV2[];
}

interface FullRunRequestV3 {
  readonly sheetId: string;
  readonly secretSalt: string;
}

let runSpec: NarratorEvaluationRunSpecV3 | null = null;
let port: NarratorBrowserEvaluationWorkerPortV3 | null = null;
let completed: CompletedEvidenceV3 | null = null;
let runAttempted = false;

const clock = Object.freeze({
  now: () => performance.now(),
  setTimeout: (callback: () => void, milliseconds: number) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
});
const watchdog = createNarratorEvaluationWatchdog(clock);

function reset(activePort: NarratorBrowserEvaluationWorkerPortV3 | null, terminate: boolean): void {
  try {
    if (terminate) activePort?.terminate();
  } catch {
    // The active operation remains the primary failure.
  } finally {
    port = null;
    runSpec = null;
  }
}

const api = Object.freeze({
  sourcePaths: narratorBrowserFullRunSourcePathsV3,

  async stage(request: StageRequestV3): Promise<unknown> {
    if (port !== null || completed !== null || runAttempted) {
      throw new Error("Narrator V3 full-run harness has already been used");
    }
    const [modelArtifacts, runtimeArtifacts] = await Promise.all([
      acquireNarratorBrowserArtifactsV2(request.modelArtifacts),
      acquireNarratorBrowserArtifactsV2(request.runtimeArtifacts),
    ]);
    const worker = new Worker(
      new URL("../../narrator-browser-evaluation-v3/src/transformers.worker.ts", import.meta.url),
      {
        type: "module",
        name: "the-grind-2-narrator-rateability-v3",
      },
    );
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
      const transport = await watchdog.run(
        activeRunSpec.deadlines.cachedLoadMilliseconds,
        signal,
        (deadlineSignal) => activePort.stageForOffline(deadlineSignal),
      );
      return Object.freeze({
        transportStatus: transport.status,
      });
    } catch (error) {
      reset(port ?? null, true);
      try {
        worker.terminate();
      } catch {
        // The active staging error remains primary.
      }
      throw error;
    }
  },

  async runAfterOffline(request: FullRunRequestV3): Promise<CompletedEvidenceV3> {
    if (port === null || runSpec === null || completed !== null || runAttempted) {
      throw new Error("Narrator V3 full-run harness is not staged");
    }
    runAttempted = true;
    const activePort = port;
    try {
      const receipt = await runNarratorEvaluationV3(
        candidate,
        runSpec,
        activePort,
        clock,
        new AbortController().signal,
        watchdog,
      );
      activePort.terminate();
      const summary = createNarratorRateabilitySummaryV3(candidate, receipt);
      const blind = createNarratorBlindStudyV3(candidate, receipt, request.sheetId, request.secretSalt);
      completed = deepFreeze({
        receipt,
        summary,
        sheet: blind.sheet,
        key: blind.key,
      });
      reset(activePort, false);
      return completed;
    } catch (error) {
      reset(activePort, true);
      throw error;
    }
  },
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

Object.defineProperty(globalThis, "__theGrindNarratorRateabilityV3", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: api,
});

declare global {
  var __theGrindNarratorRateabilityV3: typeof api;
}
