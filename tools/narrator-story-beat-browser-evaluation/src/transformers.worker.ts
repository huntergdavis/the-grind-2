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
  createLiveNarratorTransformersAdapter,
  type LiveNarratorTransformersAdapter,
  type LiveNarratorTransformersInputs,
  type LiveNarratorTransformersModelPort,
  type LiveNarratorTransformersTokenizerPort,
} from "../../../src/narrator/live-transformers-adapter";
import type { LiveNarratorTrieLogitsProcessor } from "../../../src/narrator/live-form-selection";
import {
  createStoryBeatTransformersAdapter,
  type StoryBeatTransformersInputs,
  type StoryBeatTransformersModelPort,
  type StoryBeatTransformersTokenizerPort,
} from "../../../src/narrator/story-beat-transformers-adapter";
import {
  deterministicStoryBeatFallback,
  formatStoryBeatPromptV1,
  isStoryBeatPublicFactsV1,
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "../../../src/narrator/story-beat";
import {
  browserStoryBeatExpectedHoldoutCorpusHash,
  browserStoryBeatExpectedHoldoutSha256,
  browserStoryBeatProtocolVersion,
  browserStoryBeatRepresentativeIndexes,
  hasExactKeys,
  isBoundedIdentity,
  isRecord,
  isSha256,
  type BrowserStoryBeatCaseResultV1,
  type BrowserStoryBeatStagedArtifactV1,
  type BrowserStoryBeatWorkerRequestV1,
  type BrowserStoryBeatWorkerResponseV1,
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

interface HoldoutRow {
  readonly id: string;
  readonly split: "holdout";
  readonly prompt: string;
  readonly target: string;
  readonly caseHash: string;
  readonly facts: StoryBeatPublicFactsV1;
}

const workerScope = self as DedicatedWorkerGlobalScope;
const modelRepository = "the-grind-2/story-beat-browser-evaluation";
const verifiedModelRoot = "/__verified_story_beat_browser_evaluation__/";
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
const runtimeModulePath = "ort-wasm-simd-threaded.asyncify.mjs";
const runtimeWasmPath = "ort-wasm-simd-threaded.asyncify.wasm";

let state: "created" | "initialized" | "running" | "complete" | "disposed" | "failed" = "created";
let runId: string | null = null;
let modelRevision: string | null = null;
let modelAssets: Map<string, ArrayBuffer> | null = null;
let runtimeAssets: Map<string, ArrayBuffer> | null = null;
let selectedRows: readonly HoldoutRow[] | null = null;
let tokenizer: CallableTokenizer | null = null;
let model: CallableModel | null = null;
let liveAdapter: LiveNarratorTransformersAdapter | null = null;
let tokenizerVerified = false;
let runtimeModuleUrl: string | null = null;

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim() === value && value.normalize("NFC") === value;
}

function parseField(line: string, label: string): string {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) throw new TypeError(`prompt-${label.toLowerCase()}-missing`);
  const encoded = line.slice(prefix.length);
  const decoded: unknown = JSON.parse(encoded);
  if (!boundedText(decoded, 280) || JSON.stringify(decoded) !== encoded) {
    throw new TypeError(`prompt-${label.toLowerCase()}-invalid`);
  }
  return decoded;
}

function factsFromPrompt(prompt: unknown): StoryBeatPublicFactsV1 {
  if (typeof prompt !== "string") throw new TypeError("prompt-invalid");
  const lines = prompt.split("\n");
  if (lines.length !== 6 || lines[5] !== "BEAT:") throw new TypeError("prompt-frame-invalid");
  const facts = Object.freeze({
    schemaVersion: 1 as const,
    kind: "public-story-beat" as const,
    location: parseField(lines[1] ?? "", "PLACE"),
    headline: parseField(lines[2] ?? "", "HEADLINE"),
    action: parseField(lines[3] ?? "", "ACTION"),
    consequence: parseField(lines[4] ?? "", "CONSEQUENCE"),
  });
  if (!isStoryBeatPublicFactsV1(facts) || formatStoryBeatPromptV1(facts) !== prompt) {
    throw new TypeError("prompt-contract-drift");
  }
  return facts;
}

function parseHoldout(bytes: ArrayBuffer): readonly HoldoutRow[] {
  if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) throw new TypeError("holdout-size-invalid");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!hasExactKeys(value, ["cases", "corpusHash", "schemaVersion"])
    || value.schemaVersion !== 1 || !Array.isArray(value.cases) || value.cases.length !== 200
    || typeof value.corpusHash !== "string" || !/^[0-9a-f]{16}$/u.test(value.corpusHash)) {
    throw new TypeError("holdout-envelope-invalid");
  }
  const rows = value.cases.map((candidate, index): HoldoutRow => {
    if (!hasExactKeys(candidate, ["caseHash", "id", "prompt", "split", "target"])
      || candidate.id !== `story-beat-training-corpus-v1:holdout:${String(index).padStart(4, "0")}`
      || candidate.split !== "holdout" || typeof candidate.prompt !== "string"
      || !boundedText(candidate.target, 160)
      || typeof candidate.caseHash !== "string" || !/^[0-9a-f]{16}$/u.test(candidate.caseHash)) {
      throw new TypeError(`holdout-row-${index}-invalid`);
    }
    const facts = factsFromPrompt(candidate.prompt);
    if (validateStoryBeatResultV1(candidate.target, facts) !== candidate.target
      || canonicalHash({
        id: candidate.id,
        split: candidate.split,
        prompt: candidate.prompt,
        target: candidate.target,
      }) !== candidate.caseHash) throw new TypeError(`holdout-row-${index}-contract-drift`);
    return Object.freeze({
      id: candidate.id,
      split: candidate.split,
      prompt: candidate.prompt,
      target: candidate.target,
      caseHash: candidate.caseHash,
      facts,
    });
  });
  if (canonicalHash({ schemaVersion: 1, cases: value.cases }) !== value.corpusHash) {
    throw new TypeError("holdout-corpus-hash-drift");
  }
  if (value.corpusHash !== browserStoryBeatExpectedHoldoutCorpusHash) {
    throw new TypeError("holdout-corpus-identity-drift");
  }
  return Object.freeze(rows);
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const artifact = artifacts[index] as BrowserStoryBeatStagedArtifactV1;
    if (!hasExactKeys(artifact, ["byteLength", "bytes", "path", "sha256"])
      || artifact.path !== expectedPaths[index]
      || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0
      || !isSha256(artifact.sha256) || !(artifact.bytes instanceof ArrayBuffer)
      || artifact.bytes.byteLength !== artifact.byteLength
      || await digest(artifact.bytes) !== artifact.sha256) {
      throw new TypeError(`artifact-${index}-integrity-drift`);
    }
    result.set(artifact.path, artifact.bytes);
  }
  return result;
}

function expectedIndexes(length: number): readonly number[] {
  if (length === 200) return Object.freeze(Array.from({ length: 200 }, (_, index) => index));
  if (length === 18) return browserStoryBeatRepresentativeIndexes;
  throw new TypeError("selected-index-count-invalid");
}

function validateIndexes(value: unknown): readonly number[] {
  if (!Array.isArray(value)) throw new TypeError("selected-indexes-invalid");
  const expected = expectedIndexes(value.length);
  if (!value.every((entry, index) => entry === expected[index])) {
    throw new TypeError("selected-index-policy-drift");
  }
  return expected;
}

function verifiedFetch(assets: ReadonlyMap<string, ArrayBuffer>, loaded: Set<string>): typeof fetch {
  const trustedOrigin = workerScope.location.origin;
  const root = `${verifiedModelRoot}${modelRepository}/`;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), trustedOrigin);
    const method = init?.method ?? request?.method ?? "GET";
    if (method !== "GET" || url.origin !== trustedOrigin || !url.pathname.startsWith(root)
      || url.search !== "" || url.hash !== "") {
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
        "content-type": path.endsWith(".json") ? "application/json" : "application/octet-stream",
      },
    });
  };
}

function runtimeProcessorBridge(processor: LiveNarratorTrieLogitsProcessor): LogitsProcessorList {
  class BrowserEvaluationRuntimeProcessor extends LogitsProcessor {
    _call(inputIds: bigint[][], logits: unknown) {
      return processor.process(
        inputIds,
        logits as Parameters<LiveNarratorTrieLogitsProcessor["process"]>[1],
      );
    }
  }
  const processors = new LogitsProcessorList();
  processors.push(new BrowserEvaluationRuntimeProcessor());
  return processors;
}

async function loadAdapter() {
  if (modelAssets === null || runtimeAssets === null || modelRevision === null) {
    throw new Error("worker-not-initialized");
  }
  if (env.version !== "4.2.0") throw new Error("transformers-version-drift");
  const runtimeModule = runtimeAssets.get(runtimeModulePath);
  const runtimeWasm = runtimeAssets.get(runtimeWasmPath);
  if (runtimeModule === undefined || runtimeWasm === undefined) throw new Error("runtime-closure-incomplete");
  const loaded = new Set<string>();
  runtimeModuleUrl = URL.createObjectURL(new Blob([runtimeModule], { type: "text/javascript" }));
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
  env.fetch = verifiedFetch(modelAssets, loaded);
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("wasm-runtime-unavailable");
  wasm.proxy = false;
  wasm.numThreads = 1;
  wasm.wasmBinary = runtimeWasm;
  wasm.wasmPaths = { mjs: runtimeModuleUrl };

  tokenizer = await AutoTokenizer.from_pretrained(modelRepository, {
    revision: modelRevision,
    local_files_only: true,
  }) as unknown as CallableTokenizer;
  model = await AutoModelForSeq2SeqLM.from_pretrained(modelRepository, {
    revision: modelRevision,
    local_files_only: true,
    device: "wasm",
    dtype: "q8",
    subfolder: "onnx",
    use_external_data_format: false,
  }) as unknown as CallableModel;
  if (loaded.size !== exactModelPaths.length || exactModelPaths.some((path) => !loaded.has(path))) {
    throw new Error("model-loader-closure-drift");
  }
  env.fetch = async () => { throw new Error("model-fetch-closed"); };
  modelAssets.clear();
  const tokenizerPort: LiveNarratorTransformersTokenizerPort & StoryBeatTransformersTokenizerPort = {
    tokenize: (text, options) => tokenizer!(text, options),
    decode: (ids, options) => tokenizer!.decode([...ids], options),
    dispose: () => tokenizer?.dispose?.(),
  };
  const liveModelPort: LiveNarratorTransformersModelPort = {
    generate: (
      inputs: LiveNarratorTransformersInputs,
      options,
      logitsProcessor,
    ) => model!.generate({
      ...inputs,
      ...options,
      logits_processor: runtimeProcessorBridge(logitsProcessor),
    }),
    dispose: () => model!.dispose(),
  };
  liveAdapter = createLiveNarratorTransformersAdapter(tokenizerPort, liveModelPort);
  await liveAdapter.verifyPinnedTokenizer(new AbortController().signal);
  tokenizerVerified = true;
  const modelPort: StoryBeatTransformersModelPort = {
    generate: (inputs: StoryBeatTransformersInputs, options) => model!.generate({ ...inputs, ...options }),
  };
  return createStoryBeatTransformersAdapter(tokenizerPort, modelPort);
}

async function release(): Promise<void> {
  let firstError: unknown = null;
  if (liveAdapter !== null) {
    try { await liveAdapter.dispose(); } catch (error) { firstError = error; }
  } else {
    try { await model?.dispose(); } catch (error) { firstError = error; }
    try { await tokenizer?.dispose?.(); } catch (error) { firstError ??= error; }
  }
  liveAdapter = null;
  model = null;
  tokenizer = null;
  tokenizerVerified = false;
  modelAssets?.clear();
  runtimeAssets?.clear();
  modelAssets = null;
  runtimeAssets = null;
  selectedRows = null;
  env.fetch = async () => { throw new Error("story-beat-worker-disposed"); };
  if (runtimeModuleUrl !== null) URL.revokeObjectURL(runtimeModuleUrl);
  runtimeModuleUrl = null;
  if (firstError !== null) throw firstError;
}

function response(kind: BrowserStoryBeatWorkerResponseV1["kind"], request: BrowserStoryBeatWorkerRequestV1, fields = {}): BrowserStoryBeatWorkerResponseV1 {
  return {
    protocolVersion: browserStoryBeatProtocolVersion,
    kind,
    runId: request.runId,
    operationId: request.operationId,
    ...fields,
  } as BrowserStoryBeatWorkerResponseV1;
}

async function processRequest(request: BrowserStoryBeatWorkerRequestV1): Promise<BrowserStoryBeatWorkerResponseV1> {
  if (request.kind === "initialize") {
    if (!hasExactKeys(request, [
      "holdoutBytes", "holdoutSha256", "kind", "modelAggregateSha256", "modelArtifacts",
      "operationId", "protocolVersion", "runId", "runtimeArtifacts", "selectedIndexes",
    ])
      || state !== "created" || !isBoundedIdentity(request.runId) || !isSha256(request.modelAggregateSha256)
      || request.holdoutSha256 !== browserStoryBeatExpectedHoldoutSha256
      || !(request.holdoutBytes instanceof ArrayBuffer)
      || await digest(request.holdoutBytes) !== request.holdoutSha256) throw new TypeError("initialize-invalid");
    runId = request.runId;
    modelRevision = request.modelAggregateSha256.slice(0, 40);
    const [nextModelAssets, nextRuntimeAssets] = await Promise.all([
      artifactMap(request.modelArtifacts, exactModelPaths),
      artifactMap(request.runtimeArtifacts, exactRuntimePaths),
    ]);
    const modelManifest = request.modelArtifacts.map((artifact) => ({
      path: artifact.path,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    }));
    const encodedManifest = new TextEncoder().encode(canonicalStringify(modelManifest));
    if (await digest(encodedManifest.buffer) !== request.modelAggregateSha256) {
      throw new TypeError("model-aggregate-hash-drift");
    }
    const rows = parseHoldout(request.holdoutBytes);
    const indexes = validateIndexes(request.selectedIndexes);
    modelAssets = nextModelAssets;
    runtimeAssets = nextRuntimeAssets;
    selectedRows = Object.freeze(indexes.map((index) => rows[index]!));
    state = "initialized";
    return response("initialized", request);
  }
  if (request.runId !== runId || state === "created" || state === "disposed" || state === "failed") {
    throw new TypeError("request-stale");
  }
  if (request.kind === "run") {
    if (!hasExactKeys(request, ["kind", "operationId", "protocolVersion", "runId"])
      || state !== "initialized" || selectedRows === null) throw new TypeError("run-state-invalid");
    state = "running";
    const loadStarted = performance.now();
    const adapter = await loadAdapter();
    if (!tokenizerVerified) throw new Error("pinned-tokenizer-unverified");
    const loadElapsedMs = Math.max(0, Math.floor(performance.now() - loadStarted));
    const results: BrowserStoryBeatCaseResultV1[] = [];
    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index]!;
      const started = performance.now();
      const inputTokens = await adapter.countInput(row.facts);
      const generated = await adapter.author(row.facts, {
        maximumOutputTokens: storyBeatMaximumOutputTokens,
        signal: new AbortController().signal,
      });
      const validText = validateStoryBeatResultV1(generated.text, row.facts);
      const fallback = deterministicStoryBeatFallback(row.facts);
      if (fallback !== row.facts.headline) throw new Error("fallback-contract-drift");
      results.push(Object.freeze({
        index,
        id: row.id,
        caseHash: row.caseHash,
        candidate: generated.text,
        valid: validText !== null,
        fallbackRequired: validText === null,
        inputTokens,
        outputTokens: generated.outputTokens,
        elapsedMs: Math.max(0, Math.floor(performance.now() - started)),
      }));
    }
    state = "complete";
    return response("complete", request, {
      loadElapsedMs,
      tokenizerVerified: true,
      results: Object.freeze(results),
    });
  }
  if (request.kind === "dispose") {
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
    if (!isRecord(value)
      || value.protocolVersion !== browserStoryBeatProtocolVersion
      || !isBoundedIdentity(value.runId) || !isBoundedIdentity(value.operationId, 240)
      || !["initialize", "run", "dispose"].includes(String(value.kind))) {
      throw new TypeError("protocol-invalid");
    }
    const request = value as unknown as BrowserStoryBeatWorkerRequestV1;
    const result = await processRequest(request);
    workerScope.postMessage(result);
    if (result.kind === "disposed") queueMicrotask(() => workerScope.close());
  })().catch(async () => {
    state = "failed";
    try { await release(); } catch { /* Failure remains fail-closed. */ }
    const record = isRecord(value) ? value : {};
    workerScope.postMessage({
      protocolVersion: browserStoryBeatProtocolVersion,
      kind: "failed",
      runId: isBoundedIdentity(record.runId) ? record.runId : "invalid-run",
      operationId: isBoundedIdentity(record.operationId, 240) ? record.operationId : "invalid-operation",
      reason: "evaluation-failed-closed",
    } satisfies BrowserStoryBeatWorkerResponseV1);
    queueMicrotask(() => workerScope.close());
  });
};
