import {
  hasExactKeys,
  isBoundedIdentity,
  isCompatibilityAcquisitionUrl,
  isCompatibilityRunResult,
  isSha256,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityProtocolVersion,
  sharedModelCompatibilityRuntimePaths,
  type SharedModelCompatibilityArtifactV1,
  type SharedModelCompatibilityHarnessV1,
  type SharedModelCompatibilityStageRequestV1,
  type SharedModelCompatibilityStagedArtifactV1,
} from "./protocol";
import {
  requestCompatibilityWorker,
  type SharedModelCompatibilityWorkerPort,
} from "./worker-channel";
import {
  advanceSharedModelCompatibilityState,
  type SharedModelCompatibilityHarnessState,
} from "./state";

declare global {
  interface Window {
    __theGrindSharedModelCompatibility?: SharedModelCompatibilityHarnessV1;
  }
}

function exactArtifact(value: unknown): value is SharedModelCompatibilityArtifactV1 {
  return hasExactKeys(value, ["byteLength", "path", "sha256", "url"])
    && isBoundedIdentity(value.path, 240)
    && isBoundedIdentity(value.url, 500)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && isSha256(value.sha256);
}

function exactPaths(
  values: readonly SharedModelCompatibilityArtifactV1[],
  expected: readonly string[],
): boolean {
  return values.length === expected.length
    && values.every((value, index) => value.path === expected[index]);
}

function validStage(value: unknown): value is SharedModelCompatibilityStageRequestV1 {
  return hasExactKeys(value, [
    "baselineModelAggregateSha256", "baselineModelArtifacts",
    "candidateModelAggregateSha256", "candidateModelArtifacts", "protocolVersion",
    "runId", "runtimeArtifacts",
  ])
    && value.protocolVersion === sharedModelCompatibilityProtocolVersion
    && isBoundedIdentity(value.runId)
    && value.baselineModelAggregateSha256
      === sharedModelCompatibilityBaselineAggregateSha256
    && isSha256(value.candidateModelAggregateSha256)
    && Array.isArray(value.baselineModelArtifacts)
    && value.baselineModelArtifacts.every(exactArtifact)
    && exactPaths(value.baselineModelArtifacts, sharedModelCompatibilityModelPaths)
    && Array.isArray(value.candidateModelArtifacts)
    && value.candidateModelArtifacts.every(exactArtifact)
    && exactPaths(value.candidateModelArtifacts, sharedModelCompatibilityModelPaths)
    && Array.isArray(value.runtimeArtifacts)
    && value.runtimeArtifacts.every(exactArtifact)
    && exactPaths(value.runtimeArtifacts, sharedModelCompatibilityRuntimePaths);
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function acquire(
  artifact: SharedModelCompatibilityArtifactV1,
): Promise<SharedModelCompatibilityStagedArtifactV1> {
  if (!isCompatibilityAcquisitionUrl(artifact.url, location.origin)) {
    throw new TypeError("Shared-model compatibility acquisition escaped the staging origin");
  }
  const response = await fetch(new URL(artifact.url, location.href), {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Shared-model compatibility acquisition failed: ${artifact.path}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.byteLength || await digest(bytes) !== artifact.sha256) {
    throw new Error(`Shared-model compatibility acquisition integrity differs: ${artifact.path}`);
  }
  return Object.freeze({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    bytes,
  });
}

let state: SharedModelCompatibilityHarnessState = "created";
let worker: Worker | null = null;
let runId: string | null = null;
let baselineAggregate: string | null = null;
let candidateAggregate: string | null = null;
let operation = 0;

function failClosed(error: unknown): never {
  state = advanceSharedModelCompatibilityState(state, "fail");
  try { worker?.terminate(); } catch { /* Preserve the primary error. */ }
  worker = null;
  throw error;
}

const api: SharedModelCompatibilityHarnessV1 = Object.freeze({
  protocolVersion: sharedModelCompatibilityProtocolVersion,

  async stage(value: SharedModelCompatibilityStageRequestV1): Promise<void> {
    try {
      if (state !== "created" || !validStage(value)) {
        throw new TypeError("Shared-model compatibility stage request is invalid");
      }
      const baselineModelArtifacts = await Promise.all(
        value.baselineModelArtifacts.map(acquire),
      );
      const candidateModelArtifacts = await Promise.all(
        value.candidateModelArtifacts.map(acquire),
      );
      const runtimeArtifacts = await Promise.all(value.runtimeArtifacts.map(acquire));
      const activeWorker = new Worker(new URL("./transformers.worker.ts", import.meta.url), {
        name: "narrator-shared-model-compatibility-v1",
        type: "module",
      });
      worker = activeWorker;
      runId = value.runId;
      baselineAggregate = value.baselineModelAggregateSha256;
      candidateAggregate = value.candidateModelAggregateSha256;
      const response = await requestCompatibilityWorker(
        activeWorker as unknown as SharedModelCompatibilityWorkerPort,
        {
          protocolVersion: sharedModelCompatibilityProtocolVersion,
          kind: "initialize",
          runId: value.runId,
          operationId: `${value.runId}:initialize:${operation++}`,
          baselineModelAggregateSha256: value.baselineModelAggregateSha256,
          candidateModelAggregateSha256: value.candidateModelAggregateSha256,
          baselineModelArtifacts,
          candidateModelArtifacts,
          runtimeArtifacts,
        },
        300_000,
      );
      if (response.kind === "failed") {
        throw new Error("Shared-model compatibility worker initialization failed");
      }
      if (response.kind !== "initialized") {
        throw new TypeError("Shared-model compatibility initialization response differs");
      }
      state = advanceSharedModelCompatibilityState(state, "stage-complete");
    } catch (error) {
      failClosed(error);
    }
  },

  async run(timeoutMs: number) {
    try {
      if (state !== "staged"
        || worker === null
        || runId === null
        || baselineAggregate === null
        || candidateAggregate === null
        || !Number.isSafeInteger(timeoutMs)
        || timeoutMs < 60_000
        || timeoutMs > 14_400_000) {
        throw new TypeError("Shared-model compatibility run request is invalid");
      }
      state = advanceSharedModelCompatibilityState(state, "run-start");
      const response = await requestCompatibilityWorker(
        worker as unknown as SharedModelCompatibilityWorkerPort,
        {
          protocolVersion: sharedModelCompatibilityProtocolVersion,
          kind: "run",
          runId,
          operationId: `${runId}:run:${operation++}`,
        },
        timeoutMs,
      );
      if (response.kind === "failed") {
        throw new Error("Shared-model compatibility worker evaluation failed");
      }
      if (response.kind !== "complete"
        || !isCompatibilityRunResult(response.baseline, baselineAggregate)
        || !isCompatibilityRunResult(response.candidate, candidateAggregate)
        || !Number.isSafeInteger(response.exactFormParityCount)
        || response.exactFormParityCount < 0
        || response.exactFormParityCount > 200) {
        throw new TypeError("Shared-model compatibility completion response differs");
      }
      state = advanceSharedModelCompatibilityState(state, "run-complete");
      return Object.freeze({
        baseline: response.baseline,
        candidate: response.candidate,
        exactFormParityCount: response.exactFormParityCount,
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
    baselineAggregate = null;
    candidateAggregate = null;
    if (activeWorker === null || activeRunId === null || state === "failed") {
      try {
        activeWorker?.terminate();
      } finally {
        state = advanceSharedModelCompatibilityState(state, "dispose");
      }
      return;
    }
    try {
      const response = await requestCompatibilityWorker(
        activeWorker as unknown as SharedModelCompatibilityWorkerPort,
        {
          protocolVersion: sharedModelCompatibilityProtocolVersion,
          kind: "dispose",
          runId: activeRunId,
          operationId: `${activeRunId}:dispose:${operation++}`,
        },
        60_000,
      );
      if (response.kind !== "disposed") {
        throw new TypeError("Shared-model compatibility disposal response differs");
      }
    } finally {
      activeWorker.terminate();
      state = advanceSharedModelCompatibilityState(state, "dispose");
    }
  },
});

if (window.__theGrindSharedModelCompatibility !== undefined) {
  throw new Error("Shared-model compatibility browser API already exists");
}
window.__theGrindSharedModelCompatibility = api;
