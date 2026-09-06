import {
  browserFactualStoryBeatExpectedHoldoutSha256,
  browserFactualStoryBeatExpectedModelAggregateSha256,
  browserFactualStoryBeatProtocolVersion,
  browserFactualStoryBeatRepresentativeIndexes,
  hasExactKeys,
  isBoundedIdentity,
  isFactualStoryBeatAcquisitionUrl,
  isSha256,
  type BrowserFactualStoryBeatArtifactV2,
  type BrowserFactualStoryBeatHarnessV2,
  type BrowserFactualStoryBeatStageRequestV2,
  type BrowserFactualStoryBeatStagedArtifactV2,
} from "./protocol";
import {
  requestFactualStoryBeatWorkerV2,
  type FactualStoryBeatWorkerChannelPortV2,
} from "./worker-channel";

declare global {
  interface Window {
    __theGrindFactualStoryBeatV2BrowserEvaluation?: BrowserFactualStoryBeatHarnessV2;
  }
}

const exactModelPaths = Object.freeze([
  "config.json",
  "generation_config.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
]);
const exactRuntimePaths = Object.freeze([
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]);

function exactArtifact(value: unknown): value is BrowserFactualStoryBeatArtifactV2 {
  return hasExactKeys(value, ["byteLength", "path", "sha256", "url"])
    && isBoundedIdentity(value.path, 240)
    && isBoundedIdentity(value.url, 500)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && isSha256(value.sha256);
}

function exactPaths(
  values: readonly BrowserFactualStoryBeatArtifactV2[],
  expected: readonly string[],
): boolean {
  return values.length === expected.length
    && values.every((value, index) => value.path === expected[index]);
}

function expectedIndexes(length: number): readonly number[] | null {
  if (length === browserFactualStoryBeatRepresentativeIndexes.length) {
    return browserFactualStoryBeatRepresentativeIndexes;
  }
  if (length === 200) return Object.freeze(Array.from({ length: 200 }, (_, index) => index));
  return null;
}

function validSelectedIndexes(value: unknown): value is readonly number[] {
  if (!Array.isArray(value)) return false;
  const expected = expectedIndexes(value.length);
  return expected !== null
    && value.every((entry, index) => entry === expected[index]);
}

function validStage(value: unknown): value is BrowserFactualStoryBeatStageRequestV2 {
  return hasExactKeys(value, [
    "holdout", "modelAggregateSha256", "modelArtifacts", "protocolVersion",
    "runId", "runtimeArtifacts", "selectedIndexes",
  ])
    && value.protocolVersion === browserFactualStoryBeatProtocolVersion
    && isBoundedIdentity(value.runId)
    && value.modelAggregateSha256
      === browserFactualStoryBeatExpectedModelAggregateSha256
    && isSha256(value.modelAggregateSha256)
    && exactArtifact(value.holdout)
    && value.holdout.path === "sealed-holdout.json"
    && value.holdout.sha256 === browserFactualStoryBeatExpectedHoldoutSha256
    && Array.isArray(value.modelArtifacts)
    && value.modelArtifacts.every(exactArtifact)
    && exactPaths(value.modelArtifacts, exactModelPaths)
    && Array.isArray(value.runtimeArtifacts)
    && value.runtimeArtifacts.every(exactArtifact)
    && exactPaths(value.runtimeArtifacts, exactRuntimePaths)
    && validSelectedIndexes(value.selectedIndexes);
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function acquire(
  artifact: BrowserFactualStoryBeatArtifactV2,
): Promise<BrowserFactualStoryBeatStagedArtifactV2> {
  const url = new URL(artifact.url, location.href);
  if (!isFactualStoryBeatAcquisitionUrl(artifact.url, location.origin)) {
    throw new TypeError("Factual story-beat acquisition escaped the staging origin");
  }
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Factual story-beat acquisition failed: ${artifact.path}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.byteLength
    || await digest(bytes) !== artifact.sha256) {
    throw new Error(
      `Factual story-beat acquisition integrity differs: ${artifact.path}`,
    );
  }
  return Object.freeze({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    bytes,
  });
}

let state: "created" | "staged" | "running" | "complete" | "disposed" | "failed" =
  "created";
let worker: Worker | null = null;
let runId: string | null = null;
let operation = 0;

function failClosed(error: unknown): never {
  state = "failed";
  try {
    worker?.terminate();
  } catch {
    // Preserve the primary error.
  }
  worker = null;
  throw error;
}

const api: BrowserFactualStoryBeatHarnessV2 = Object.freeze({
  protocolVersion: browserFactualStoryBeatProtocolVersion,

  async stage(value: BrowserFactualStoryBeatStageRequestV2): Promise<void> {
    try {
      if (state !== "created" || !validStage(value)) {
        throw new TypeError("Factual story-beat stage request is invalid");
      }
      const [holdout, modelArtifacts, runtimeArtifacts] = await Promise.all([
        acquire(value.holdout),
        Promise.all(value.modelArtifacts.map(acquire)),
        Promise.all(value.runtimeArtifacts.map(acquire)),
      ]);
      const activeWorker = new Worker(
        new URL("./transformers.worker.ts", import.meta.url),
        { name: "factual-story-beat-v2-browser-evaluation", type: "module" },
      );
      worker = activeWorker;
      runId = value.runId;
      const response = await requestFactualStoryBeatWorkerV2(
        activeWorker as unknown as FactualStoryBeatWorkerChannelPortV2,
        {
          protocolVersion: browserFactualStoryBeatProtocolVersion,
          kind: "initialize",
          runId: value.runId,
          operationId: `${value.runId}:initialize:${operation++}`,
          modelAggregateSha256: value.modelAggregateSha256,
          holdoutSha256: holdout.sha256,
          holdoutBytes: holdout.bytes,
          modelArtifacts,
          runtimeArtifacts,
          selectedIndexes: Object.freeze([...value.selectedIndexes]),
        },
        30_000,
      );
      if (response.kind === "failed") {
        throw new Error(
          `Factual story-beat worker initialization failed: ${response.reason}`,
        );
      }
      if (response.kind !== "initialized") {
        throw new TypeError("Factual story-beat worker initialization response differs");
      }
      state = "staged";
    } catch (error) {
      failClosed(error);
    }
  },

  async run(timeoutMs: number) {
    try {
      if (state !== "staged"
        || worker === null
        || runId === null
        || !Number.isSafeInteger(timeoutMs)
        || timeoutMs < 60_000
        || timeoutMs > 14_400_000) {
        throw new TypeError("Factual story-beat run request is invalid");
      }
      state = "running";
      const response = await requestFactualStoryBeatWorkerV2(
        worker as unknown as FactualStoryBeatWorkerChannelPortV2,
        {
          protocolVersion: browserFactualStoryBeatProtocolVersion,
          kind: "run",
          runId,
          operationId: `${runId}:run:${operation++}`,
        },
        timeoutMs,
      );
      if (response.kind === "failed") {
        throw new Error(
          `Factual story-beat worker evaluation failed: ${response.reason}`,
        );
      }
      if (response.kind !== "complete"
        || !Number.isSafeInteger(response.loadElapsedMs)
        || response.loadElapsedMs < 0
        || response.tokenizerVerified !== true
        || !Array.isArray(response.results)) {
        throw new TypeError("Factual story-beat worker completion response differs");
      }
      state = "complete";
      return Object.freeze({
        loadElapsedMs: response.loadElapsedMs,
        tokenizerVerified: response.tokenizerVerified,
        results: Object.freeze([...response.results]),
      });
    } catch (error) {
      failClosed(error);
    }
  },

  async dispose(): Promise<void> {
    if (state === "disposed") return;
    const activeWorker = worker;
    const activeRunId = runId;
    worker = null;
    runId = null;
    if (activeWorker === null || activeRunId === null || state === "failed") {
      try {
        activeWorker?.terminate();
      } finally {
        state = "disposed";
      }
      return;
    }
    try {
      const response = await requestFactualStoryBeatWorkerV2(
        activeWorker as unknown as FactualStoryBeatWorkerChannelPortV2,
        {
          protocolVersion: browserFactualStoryBeatProtocolVersion,
          kind: "dispose",
          runId: activeRunId,
          operationId: `${activeRunId}:dispose:${operation++}`,
        },
        30_000,
      );
      if (response.kind !== "disposed") {
        throw new TypeError("Factual story-beat worker disposal response differs");
      }
    } finally {
      activeWorker.terminate();
      state = "disposed";
    }
  },
});

if (window.__theGrindFactualStoryBeatV2BrowserEvaluation !== undefined) {
  throw new Error("Factual story-beat browser evaluation API already exists");
}
window.__theGrindFactualStoryBeatV2BrowserEvaluation = api;
