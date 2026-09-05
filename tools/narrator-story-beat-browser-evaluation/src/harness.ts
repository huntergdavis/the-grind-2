import {
  browserStoryBeatExpectedHoldoutSha256,
  browserStoryBeatProtocolVersion,
  hasExactKeys,
  isBoundedIdentity,
  isSha256,
  isStoryBeatAcquisitionUrl,
  type BrowserStoryBeatArtifactV1,
  type BrowserStoryBeatHarnessV1,
  type BrowserStoryBeatStageRequestV1,
  type BrowserStoryBeatStagedArtifactV1,
} from "./protocol";
import { requestStoryBeatWorker, type StoryBeatWorkerChannelPort } from "./worker-channel";

declare global {
  interface Window {
    __theGrindStoryBeatBrowserEvaluation?: BrowserStoryBeatHarnessV1;
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

function exactArtifact(value: unknown): value is BrowserStoryBeatArtifactV1 {
  return hasExactKeys(value, ["byteLength", "path", "sha256", "url"])
    && isBoundedIdentity(value.path, 240)
    && isBoundedIdentity(value.url, 500)
    && Number.isSafeInteger(value.byteLength) && Number(value.byteLength) > 0
    && isSha256(value.sha256);
}

function exactPaths(values: readonly BrowserStoryBeatArtifactV1[], expected: readonly string[]): boolean {
  return values.length === expected.length
    && values.every((value, index) => value.path === expected[index]);
}

function validSelectedIndexes(value: unknown): value is readonly number[] {
  if (!Array.isArray(value) || (value.length !== 18 && value.length !== 200)) return false;
  return value.every((entry, index) => Number.isSafeInteger(entry)
    && entry >= 0 && entry < 200 && (index === 0 || entry > value[index - 1]));
}

function validStage(value: unknown): value is BrowserStoryBeatStageRequestV1 {
  return hasExactKeys(value, [
    "holdout", "modelAggregateSha256", "modelArtifacts", "protocolVersion", "runId",
    "runtimeArtifacts", "selectedIndexes",
  ])
    && value.protocolVersion === browserStoryBeatProtocolVersion
    && isBoundedIdentity(value.runId)
    && isSha256(value.modelAggregateSha256)
    && exactArtifact(value.holdout)
    && value.holdout.path === "sealed-holdout.json"
    && value.holdout.sha256 === browserStoryBeatExpectedHoldoutSha256
    && Array.isArray(value.modelArtifacts) && value.modelArtifacts.every(exactArtifact)
    && exactPaths(value.modelArtifacts, exactModelPaths)
    && Array.isArray(value.runtimeArtifacts) && value.runtimeArtifacts.every(exactArtifact)
    && exactPaths(value.runtimeArtifacts, exactRuntimePaths)
    && validSelectedIndexes(value.selectedIndexes);
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function acquire(artifact: BrowserStoryBeatArtifactV1): Promise<BrowserStoryBeatStagedArtifactV1> {
  const url = new URL(artifact.url, location.href);
  if (!isStoryBeatAcquisitionUrl(artifact.url, location.origin)) {
    throw new TypeError("Story-beat acquisition escaped the staging origin");
  }
  const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`Story-beat acquisition failed: ${artifact.path}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.byteLength || await digest(bytes) !== artifact.sha256) {
    throw new Error(`Story-beat acquisition integrity differs: ${artifact.path}`);
  }
  return Object.freeze({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    bytes,
  });
}

let state: "created" | "staged" | "running" | "complete" | "disposed" | "failed" = "created";
let worker: Worker | null = null;
let runId: string | null = null;
let operation = 0;

function failClosed(error: unknown): never {
  state = "failed";
  try { worker?.terminate(); } catch { /* Preserve the primary error. */ }
  worker = null;
  throw error;
}

const api: BrowserStoryBeatHarnessV1 = Object.freeze({
  protocolVersion: browserStoryBeatProtocolVersion,

  async stage(value: BrowserStoryBeatStageRequestV1): Promise<void> {
    try {
      if (state !== "created" || !validStage(value)) throw new TypeError("Story-beat stage request is invalid");
      const [holdout, modelArtifacts, runtimeArtifacts] = await Promise.all([
        acquire(value.holdout),
        Promise.all(value.modelArtifacts.map(acquire)),
        Promise.all(value.runtimeArtifacts.map(acquire)),
      ]);
      const activeWorker = new Worker(new URL("./transformers.worker.ts", import.meta.url), {
        name: "story-beat-browser-evaluation-v1",
        type: "module",
      });
      worker = activeWorker;
      runId = value.runId;
      const response = await requestStoryBeatWorker(activeWorker as unknown as StoryBeatWorkerChannelPort, {
        protocolVersion: browserStoryBeatProtocolVersion,
        kind: "initialize",
        runId: value.runId,
        operationId: `${value.runId}:initialize:${operation++}`,
        modelAggregateSha256: value.modelAggregateSha256,
        holdoutSha256: holdout.sha256,
        holdoutBytes: holdout.bytes,
        modelArtifacts,
        runtimeArtifacts,
        selectedIndexes: Object.freeze([...value.selectedIndexes]),
      }, 30_000);
      if (response.kind === "failed") throw new Error(`Story-beat worker initialization failed: ${response.reason}`);
      if (response.kind !== "initialized") throw new TypeError("Story-beat worker initialization response differs");
      state = "staged";
    } catch (error) {
      failClosed(error);
    }
  },

  async run(timeoutMs: number) {
    try {
      if (state !== "staged" || worker === null || runId === null
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 14_400_000) {
        throw new TypeError("Story-beat run request is invalid");
      }
      state = "running";
      const response = await requestStoryBeatWorker(worker as unknown as StoryBeatWorkerChannelPort, {
        protocolVersion: browserStoryBeatProtocolVersion,
        kind: "run",
        runId,
        operationId: `${runId}:run:${operation++}`,
      }, timeoutMs);
      if (response.kind === "failed") throw new Error(`Story-beat worker evaluation failed: ${response.reason}`);
      if (response.kind !== "complete"
        || !Number.isSafeInteger(response.loadElapsedMs) || response.loadElapsedMs < 0
        || response.tokenizerVerified !== true || !Array.isArray(response.results)) {
        throw new TypeError("Story-beat worker completion response differs");
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
      try { activeWorker?.terminate(); } finally { state = "disposed"; }
      return;
    }
    try {
      const response = await requestStoryBeatWorker(activeWorker as unknown as StoryBeatWorkerChannelPort, {
        protocolVersion: browserStoryBeatProtocolVersion,
        kind: "dispose",
        runId: activeRunId,
        operationId: `${activeRunId}:dispose:${operation++}`,
      }, 30_000);
      if (response.kind !== "disposed") throw new TypeError("Story-beat worker disposal response differs");
    } finally {
      activeWorker.terminate();
      state = "disposed";
    }
  },
});

if (window.__theGrindStoryBeatBrowserEvaluation !== undefined) {
  throw new Error("Story-beat browser evaluation API already exists");
}
window.__theGrindStoryBeatBrowserEvaluation = api;
