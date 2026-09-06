/// <reference lib="webworker" />

import {
  AutoModelForSeq2SeqLM,
  AutoTokenizer,
  LogitsProcessor,
  LogitsProcessorList,
  LogLevel,
  env,
} from "@huggingface/transformers";
import { canonicalHash, canonicalStringify } from "../../../src/core/canonical";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
} from "../../../src/narrator/evaluation";
import {
  createLiveNarratorTransformersAdapter,
  type LiveNarratorTransformersAdapter,
  type LiveNarratorTransformersInputs,
  type LiveNarratorTransformersModelPort,
  type LiveNarratorTransformersTokenizerPort,
} from "../../../src/narrator/live-transformers-adapter";
import type { LiveNarratorTrieLogitsProcessor } from "../../../src/narrator/live-form-selection";
import {
  narratorMaximumOutputTokens,
} from "../../../src/narrator/protocol";
import { identifyLiveNarratorSelection } from "./comparison";
import {
  hasExactKeys,
  isBoundedIdentity,
  isRecord,
  isSha256,
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityCorpusHash,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityProtocolVersion,
  sharedModelCompatibilityRuntimePaths,
  type SharedModelCompatibilityCaseResultV1,
  type SharedModelCompatibilityRunResultV1,
  type SharedModelCompatibilityStagedArtifactV1,
  type SharedModelCompatibilityWorkerRequestV1,
  type SharedModelCompatibilityWorkerResponseV1,
} from "./protocol";

interface CallableTokenizer {
  (text: string, options: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
  decode(ids: number[], options: Readonly<Record<string, unknown>>): unknown;
  dispose?: () => Promise<void> | void;
}

interface CallableModel {
  generate(options: Readonly<Record<string, unknown>>): Promise<unknown>;
  dispose(): Promise<void> | void;
}

type ModelRole = "baseline" | "candidate";

const workerScope = self as DedicatedWorkerGlobalScope;
const verifiedModelRoot = "/__verified_shared_model_compatibility__/";
const runtimeModulePath = "ort-wasm-simd-threaded.asyncify.mjs";
const runtimeWasmPath = "ort-wasm-simd-threaded.asyncify.wasm";
const tokenizerPaths = Object.freeze(["tokenizer.json", "tokenizer_config.json"] as const);

let state: "created" | "initialized" | "running" | "complete" | "disposed" | "failed" = "created";
let runId: string | null = null;
let baselineAggregate: string | null = null;
let candidateAggregate: string | null = null;
let baselineAssets: Map<string, ArrayBuffer> | null = null;
let candidateAssets: Map<string, ArrayBuffer> | null = null;
let runtimeAssets: Map<string, ArrayBuffer> | null = null;
let runtimeModuleUrl: string | null = null;
let activeAdapter: LiveNarratorTransformersAdapter | null = null;
let activeModel: CallableModel | null = null;
let activeTokenizer: CallableTokenizer | null = null;
let failureStage = "request";

const controlledFailureCodes = new Map<string, string>([
  ["Shared-model compatibility output failed the live safety policy", "output-failed-live-safety-policy"],
  ["Shared-model compatibility output did not identify exactly one production form", "output-form-identification-failed"],
]);

function normalizedFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const controlled = controlledFailureCodes.get(message);
  if (controlled !== undefined) return controlled;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(message) && message.length <= 100) return message;
  return "unexpected-error";
}

async function digest(bytes: BufferSource): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function artifactMap(
  artifacts: unknown,
  expectedPaths: readonly string[],
): Promise<Map<string, ArrayBuffer>> {
  if (!Array.isArray(artifacts) || artifacts.length !== expectedPaths.length) {
    throw new TypeError("artifact-closure-invalid");
  }
  const result = new Map<string, ArrayBuffer>();
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index] as SharedModelCompatibilityStagedArtifactV1;
    if (!hasExactKeys(artifact, ["byteLength", "bytes", "path", "sha256"])
      || artifact.path !== expectedPaths[index]
      || !Number.isSafeInteger(artifact.byteLength)
      || artifact.byteLength <= 0
      || !isSha256(artifact.sha256)
      || !(artifact.bytes instanceof ArrayBuffer)
      || artifact.bytes.byteLength !== artifact.byteLength
      || await digest(artifact.bytes) !== artifact.sha256) {
      throw new TypeError(`artifact-${index}-integrity-drift`);
    }
    result.set(artifact.path, artifact.bytes);
  }
  return result;
}

async function assertAggregate(
  artifacts: readonly SharedModelCompatibilityStagedArtifactV1[],
  expected: string,
): Promise<void> {
  const manifest = artifacts.map(({ path, byteLength, sha256 }) => ({
    path,
    byteLength,
    sha256,
  }));
  const bytes = new TextEncoder().encode(canonicalStringify(manifest));
  if (await digest(bytes) !== expected) throw new TypeError("model-aggregate-hash-drift");
}

function exactBytes(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}

function assertTokenizerByteIdentity(
  baseline: ReadonlyMap<string, ArrayBuffer>,
  candidate: ReadonlyMap<string, ArrayBuffer>,
): void {
  for (const path of tokenizerPaths) {
    const left = baseline.get(path);
    const right = candidate.get(path);
    if (left === undefined || right === undefined || !exactBytes(left, right)) {
      throw new TypeError("tokenizer-byte-identity-drift");
    }
  }
}

function verifiedFetch(
  repository: string,
  assets: ReadonlyMap<string, ArrayBuffer>,
  loaded: Set<string>,
): typeof fetch {
  const trustedOrigin = workerScope.location.origin;
  const root = `${verifiedModelRoot}${repository}/`;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), trustedOrigin);
    const method = init?.method ?? request?.method ?? "GET";
    if (method !== "GET"
      || url.origin !== trustedOrigin
      || !url.pathname.startsWith(root)
      || url.search !== ""
      || url.hash !== "") {
      throw new TypeError("model-fetch-unauthorized");
    }
    const path = decodeURIComponent(url.pathname.slice(root.length));
    const bytes = assets.get(path);
    if (bytes === undefined) throw new TypeError("model-fetch-unknown-artifact");
    loaded.add(path);
    return new Response(new Blob([bytes]), {
      status: 200,
      headers: {
        "content-length": String(bytes.byteLength),
        "content-type": path.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
      },
    });
  };
}

function runtimeProcessorBridge(
  processor: LiveNarratorTrieLogitsProcessor,
): LogitsProcessorList {
  class CompatibilityRuntimeProcessor extends LogitsProcessor {
    _call(inputIds: bigint[][], logits: unknown) {
      return processor.process(
        inputIds,
        logits as Parameters<LiveNarratorTrieLogitsProcessor["process"]>[1],
      );
    }
  }
  const processors = new LogitsProcessorList();
  processors.push(new CompatibilityRuntimeProcessor());
  return processors;
}

function assertProductionCorpus(): void {
  if (narratorEvaluationRequiredCases !== sharedModelCompatibilityCaseCount
    || narratorEvaluationCasesV1.length !== sharedModelCompatibilityCaseCount
    || narratorEvaluationCorpusHashV1 !== sharedModelCompatibilityCorpusHash) {
    throw new TypeError("production-evaluation-corpus-drift");
  }
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const row = narratorEvaluationCasesV1[ordinal]!;
    const seed = Math.floor(ordinal / 10);
    const slot = ordinal % 10;
    if (row.id !== `narrator-eval-v1:${String(seed).padStart(2, "0")}:${String(slot).padStart(2, "0")}`
      || row.seedId !== `narrator-eval-seed:${String(seed).padStart(2, "0")}`) {
      throw new TypeError("production-evaluation-order-drift");
    }
  }
}

function configureRuntime(): void {
  if (runtimeAssets === null) throw new Error("runtime-assets-missing");
  if (env.version !== "4.2.0") throw new Error("transformers-version-drift");
  const runtimeModule = runtimeAssets.get(runtimeModulePath);
  const runtimeWasm = runtimeAssets.get(runtimeWasmPath);
  if (runtimeModule === undefined || runtimeWasm === undefined) {
    throw new Error("runtime-closure-incomplete");
  }
  runtimeModuleUrl = URL.createObjectURL(
    new Blob([runtimeModule], { type: "text/javascript" }),
  );
  env.logLevel = LogLevel.NONE;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = verifiedModelRoot;
  env.useFS = false;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.useCustomCache = false;
  env.customCache = null;
  env.useWasmCache = false;
  env.experimental_useCrossOriginStorage = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("wasm-runtime-unavailable");
  wasm.proxy = false;
  wasm.numThreads = 1;
  wasm.wasmBinary = runtimeWasm;
  wasm.wasmPaths = { mjs: runtimeModuleUrl };
}

async function disposeActive(): Promise<void> {
  let firstError: unknown = null;
  if (activeAdapter !== null) {
    try { await activeAdapter.dispose(); } catch (error) { firstError = error; }
  } else {
    try { await activeModel?.dispose(); } catch (error) { firstError = error; }
    try { await activeTokenizer?.dispose?.(); } catch (error) { firstError ??= error; }
  }
  activeAdapter = null;
  activeModel = null;
  activeTokenizer = null;
  if (firstError !== null) throw firstError;
}

async function runModel(
  role: ModelRole,
  aggregateSha256: string,
  assets: Map<string, ArrayBuffer>,
): Promise<SharedModelCompatibilityRunResultV1> {
  failureStage = `${role}-load`;
  const repository = `the-grind-2/narrator-shared-model-compatibility-${role}`;
  const loaded = new Set<string>();
  env.fetch = verifiedFetch(repository, assets, loaded);
  const loadStarted = performance.now();
  activeTokenizer = await AutoTokenizer.from_pretrained(repository, {
    revision: aggregateSha256.slice(0, 40),
    local_files_only: true,
  }) as unknown as CallableTokenizer;
  activeModel = await AutoModelForSeq2SeqLM.from_pretrained(repository, {
    revision: aggregateSha256.slice(0, 40),
    local_files_only: true,
    device: "wasm",
    dtype: "q8",
    subfolder: "onnx",
    use_external_data_format: false,
  }) as unknown as CallableModel;
  if (loaded.size !== sharedModelCompatibilityModelPaths.length
    || sharedModelCompatibilityModelPaths.some((path) => !loaded.has(path))) {
    throw new Error("model-loader-closure-drift");
  }
  env.fetch = async () => { throw new Error("model-fetch-closed"); };
  assets.clear();
  const tokenizerPort: LiveNarratorTransformersTokenizerPort = {
    tokenize: (text, options) => activeTokenizer!(text, options),
    decode: (ids, options) => activeTokenizer!.decode([...ids], options),
    dispose: () => activeTokenizer?.dispose?.(),
  };
  const modelPort: LiveNarratorTransformersModelPort = {
    generate: (
      inputs: LiveNarratorTransformersInputs,
      options,
      logitsProcessor,
    ) => activeModel!.generate({
      ...inputs,
      ...options,
      logits_processor: runtimeProcessorBridge(logitsProcessor),
    }),
    dispose: () => activeModel!.dispose(),
  };
  activeAdapter = createLiveNarratorTransformersAdapter(tokenizerPort, modelPort);
  await activeAdapter.verifyPinnedTokenizer(new AbortController().signal);
  const loadElapsedMs = Math.max(0, Math.floor(performance.now() - loadStarted));
  const cases: SharedModelCompatibilityCaseResultV1[] = [];
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    failureStage = `${role}-case-${String(ordinal).padStart(3, "0")}`;
    const row = narratorEvaluationCasesV1[ordinal]!;
    const started = performance.now();
    const signal = new AbortController().signal;
    const inputTokens = await activeAdapter.countInput(row.prompt, signal);
    const text = await activeAdapter.realize(row.prompt, {
      maximumOutputTokens: narratorMaximumOutputTokens,
      signal,
    });
    const outputTokens = await activeAdapter.countOutput(text, signal);
    const selected = identifyLiveNarratorSelection(row.prompt, text);
    if (selected.baseline) {
      if (text !== row.deterministicBaseline) {
        throw new TypeError("selected-baseline-render-drift");
      }
    } else if (!row.allowedOutputs.includes(text)) {
      throw new TypeError("selected-output-not-in-evaluation-policy");
    }
    cases.push(Object.freeze({
      ordinal,
      id: row.id,
      seedId: row.seedId,
      move: row.prompt.move,
      promptHash: canonicalHash(row.prompt),
      selectedFormId: selected.formId,
      lineHash: canonicalHash(text),
      inputTokens,
      outputTokens,
      baselineForm: selected.baseline,
      safe: true,
      eligible: true,
      fallbackUsed: false,
      elapsedMs: Math.max(0, Math.floor(performance.now() - started)),
    }));
  }
  failureStage = `${role}-dispose`;
  await disposeActive();
  return Object.freeze({
    aggregateSha256,
    loadElapsedMs,
    tokenizerVerified: true,
    cases: Object.freeze(cases),
  });
}

async function release(): Promise<void> {
  let firstError: unknown = null;
  try { await disposeActive(); } catch (error) { firstError = error; }
  baselineAssets?.clear();
  candidateAssets?.clear();
  runtimeAssets?.clear();
  baselineAssets = null;
  candidateAssets = null;
  runtimeAssets = null;
  baselineAggregate = null;
  candidateAggregate = null;
  env.fetch = async () => { throw new Error("shared-model-compatibility-worker-disposed"); };
  if (runtimeModuleUrl !== null) URL.revokeObjectURL(runtimeModuleUrl);
  runtimeModuleUrl = null;
  if (firstError !== null) throw firstError;
}

function response(
  kind: SharedModelCompatibilityWorkerResponseV1["kind"],
  request: SharedModelCompatibilityWorkerRequestV1,
  fields = {},
): SharedModelCompatibilityWorkerResponseV1 {
  return {
    protocolVersion: sharedModelCompatibilityProtocolVersion,
    kind,
    runId: request.runId,
    operationId: request.operationId,
    ...fields,
  } as SharedModelCompatibilityWorkerResponseV1;
}

async function processRequest(
  request: SharedModelCompatibilityWorkerRequestV1,
): Promise<SharedModelCompatibilityWorkerResponseV1> {
  if (request.kind === "initialize") {
    failureStage = "initialization";
    if (!hasExactKeys(request, [
      "baselineModelAggregateSha256", "baselineModelArtifacts",
      "candidateModelAggregateSha256", "candidateModelArtifacts", "kind",
      "operationId", "protocolVersion", "runId", "runtimeArtifacts",
    ])
      || state !== "created"
      || !isBoundedIdentity(request.runId)
      || !isSha256(request.baselineModelAggregateSha256)
      || request.baselineModelAggregateSha256
        !== sharedModelCompatibilityBaselineAggregateSha256
      || !isSha256(request.candidateModelAggregateSha256)) {
      throw new TypeError("initialize-invalid");
    }
    assertProductionCorpus();
    await Promise.all([
      assertAggregate(request.baselineModelArtifacts, request.baselineModelAggregateSha256),
      assertAggregate(request.candidateModelArtifacts, request.candidateModelAggregateSha256),
    ]);
    const [nextBaseline, nextCandidate, nextRuntime] = await Promise.all([
      artifactMap(request.baselineModelArtifacts, sharedModelCompatibilityModelPaths),
      artifactMap(request.candidateModelArtifacts, sharedModelCompatibilityModelPaths),
      artifactMap(request.runtimeArtifacts, sharedModelCompatibilityRuntimePaths),
    ]);
    assertTokenizerByteIdentity(nextBaseline, nextCandidate);
    runId = request.runId;
    baselineAggregate = request.baselineModelAggregateSha256;
    candidateAggregate = request.candidateModelAggregateSha256;
    baselineAssets = nextBaseline;
    candidateAssets = nextCandidate;
    runtimeAssets = nextRuntime;
    configureRuntime();
    state = "initialized";
    return response("initialized", request);
  }
  if (request.runId !== runId
    || state === "created"
    || state === "disposed"
    || state === "failed") {
    throw new TypeError("request-stale");
  }
  if (request.kind === "run") {
    if (!hasExactKeys(request, ["kind", "operationId", "protocolVersion", "runId"])
      || state !== "initialized"
      || baselineAssets === null
      || candidateAssets === null
      || baselineAggregate === null
      || candidateAggregate === null) {
      throw new TypeError("run-state-invalid");
    }
    state = "running";
    const baseline = await runModel("baseline", baselineAggregate, baselineAssets);
    const candidate = await runModel("candidate", candidateAggregate, candidateAssets);
    failureStage = "comparison";
    const exactFormParityCount = baseline.cases.reduce(
      (count, row, ordinal) =>
        count + (
          row.selectedFormId === candidate.cases[ordinal]!.selectedFormId
          && row.lineHash === candidate.cases[ordinal]!.lineHash
            ? 1
            : 0
        ),
      0,
    );
    state = "complete";
    return response("complete", request, {
      baseline,
      candidate,
      exactFormParityCount,
    });
  }
  if (request.kind === "dispose") {
    failureStage = "dispose";
    if (!hasExactKeys(request, ["kind", "operationId", "protocolVersion", "runId"])) {
      throw new TypeError("dispose-protocol-invalid");
    }
    await release();
    state = "disposed";
    return response("disposed", request);
  }
  throw new TypeError("request-kind-invalid");
}

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const value = event.data;
  void (async () => {
    failureStage = "request";
    if (!isRecord(value)
      || value.protocolVersion !== sharedModelCompatibilityProtocolVersion
      || !isBoundedIdentity(value.runId)
      || !isBoundedIdentity(value.operationId, 240)
      || !["initialize", "run", "dispose"].includes(String(value.kind))) {
      throw new TypeError("protocol-invalid");
    }
    const request = value as unknown as SharedModelCompatibilityWorkerRequestV1;
    const result = await processRequest(request);
    workerScope.postMessage(result);
    if (result.kind === "disposed") queueMicrotask(() => workerScope.close());
  })().catch(async (error: unknown) => {
    const reason = `shared-model-compatibility-worker-failed:${failureStage}:${normalizedFailureCode(error)}`;
    state = "failed";
    try { await release(); } catch { /* Failure remains fail-closed. */ }
    const record = isRecord(value) ? value : {};
    workerScope.postMessage({
      protocolVersion: sharedModelCompatibilityProtocolVersion,
      kind: "failed",
      runId: isBoundedIdentity(record.runId) ? record.runId : "invalid-run",
      operationId: isBoundedIdentity(record.operationId, 240)
        ? record.operationId
        : "invalid-operation",
      reason,
    } satisfies SharedModelCompatibilityWorkerResponseV1);
  });
};
