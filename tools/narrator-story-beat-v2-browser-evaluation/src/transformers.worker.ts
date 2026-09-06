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
import {
  createFactualStoryBeatTransformersAdapterV2,
  type FactualStoryBeatTransformersInputsV2,
  type FactualStoryBeatTransformersModelPortV2,
  type FactualStoryBeatTransformersTokenizerPortV2,
} from "../../../src/narrator/story-beat-v2-transformers-adapter";
import {
  factualStoryBeatPresentationBucketIdsV2,
} from "../../../src/narrator/story-beat-v2-form-selection";
import {
  factualStoryBeatFactsFromPromptV2,
  factualStoryBeatMaximumOutputTokens,
  factualStoryBeatRequiredClausesV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatPublicFactsV2,
} from "../../../src/narrator/story-beat-v2";
import { deterministicStoryBeatFallback } from "../../../src/narrator/story-beat";
import {
  browserFactualStoryBeatExpectedHoldoutCorpusHash,
  browserFactualStoryBeatExpectedHoldoutSha256,
  browserFactualStoryBeatExpectedModelAggregateSha256,
  browserFactualStoryBeatProtocolVersion,
  browserFactualStoryBeatRepresentativeIndexes,
  hasExactKeys,
  isBoundedIdentity,
  isRecord,
  type BrowserFactualStoryBeatCaseResultV2,
  type BrowserFactualStoryBeatStagedArtifactV2,
  type BrowserFactualStoryBeatWorkerRequestV2,
  type BrowserFactualStoryBeatWorkerResponseV2,
} from "./protocol";

interface CallableTokenizer {
  (
    text: string,
    options: Readonly<Record<string, unknown>>,
  ): Promise<unknown> | unknown;
  decode(ids: number[], options: Readonly<Record<string, unknown>>): unknown;
  dispose?: () => Promise<void> | void;
}

interface CallableModel {
  generate(options: Readonly<Record<string, unknown>>): Promise<unknown>;
  dispose(): Promise<void> | void;
}

interface HoldoutRow {
  readonly id: string;
  readonly caseHash: string;
  readonly facts: FactualStoryBeatPublicFactsV2;
}

interface ExpectedArtifact {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

const workerScope = self as DedicatedWorkerGlobalScope;
const modelRepository = "the-grind-2/factual-story-beat-v2-browser-evaluation";
const verifiedModelRoot = "/__verified_factual_story_beat_v2_browser_evaluation__/";
const expectedModelArtifacts = Object.freeze([
  {
    path: "config.json",
    byteLength: 1_506,
    sha256: "f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18",
  },
  {
    path: "generation_config.json",
    byteLength: 142,
    sha256: "8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737",
  },
  {
    path: "onnx/decoder_model_merged_quantized.onnx",
    byteLength: 59_041_810,
    sha256: "35023ce868af4efe8cf86ef87a12b3c5f5977043503cc22e44636d8da3a217c7",
  },
  {
    path: "onnx/encoder_model_quantized.onnx",
    byteLength: 35_612_462,
    sha256: "ec8ada2d3ab8c526ff976b083ad36eb4485e5a92f3a8f61bece3ab4c5f245f53",
  },
  {
    path: "tokenizer.json",
    byteLength: 2_422_234,
    sha256: "4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160",
  },
  {
    path: "tokenizer_config.json",
    byteLength: 20_830,
    sha256: "26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70",
  },
] as const satisfies readonly ExpectedArtifact[]);
const expectedRuntimeArtifacts = Object.freeze([
  {
    path: "ort-wasm-simd-threaded.asyncify.mjs",
    byteLength: 47_389,
    sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
  },
  {
    path: "ort-wasm-simd-threaded.asyncify.wasm",
    byteLength: 23_567_050,
    sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
  },
] as const satisfies readonly ExpectedArtifact[]);
const runtimeModulePath = "ort-wasm-simd-threaded.asyncify.mjs";
const runtimeWasmPath = "ort-wasm-simd-threaded.asyncify.wasm";

let state: "created" | "initialized" | "running" | "complete" | "disposed" | "failed" =
  "created";
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
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value;
}

function parseHoldout(bytes: ArrayBuffer): readonly HoldoutRow[] {
  if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) {
    throw new TypeError("holdout-size-invalid");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (!hasExactKeys(value, ["cases", "corpusHash", "schemaVersion"])
    || value.schemaVersion !== 2
    || !Array.isArray(value.cases)
    || value.cases.length !== 200
    || typeof value.corpusHash !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.corpusHash)) {
    throw new TypeError("holdout-envelope-invalid");
  }
  const rows = value.cases.map((candidate, index): HoldoutRow => {
    if (!hasExactKeys(candidate, ["caseHash", "id", "prompt", "split", "target"])
      || candidate.id
        !== `factual-story-beat-training-corpus-v2:holdout:${String(index).padStart(4, "0")}`
      || candidate.split !== "holdout"
      || typeof candidate.prompt !== "string"
      || !boundedText(candidate.target, 160)
      || typeof candidate.caseHash !== "string"
      || !/^[0-9a-f]{16}$/u.test(candidate.caseHash)) {
      throw new TypeError(`holdout-row-${index}-invalid`);
    }
    const facts = factualStoryBeatFactsFromPromptV2(candidate.prompt);
    if (facts === null
      || validateFactualStoryBeatResultV2(candidate.target, facts) !== candidate.target
      || canonicalHash({
        id: candidate.id,
        split: candidate.split,
        prompt: candidate.prompt,
        target: candidate.target,
      }) !== candidate.caseHash) {
      throw new TypeError(`holdout-row-${index}-contract-drift`);
    }
    return Object.freeze({
      id: candidate.id,
      caseHash: candidate.caseHash,
      facts,
    });
  });
  if (canonicalHash({ schemaVersion: 2, cases: value.cases }) !== value.corpusHash) {
    throw new TypeError("holdout-corpus-hash-drift");
  }
  if (value.corpusHash !== browserFactualStoryBeatExpectedHoldoutCorpusHash) {
    throw new TypeError("holdout-corpus-identity-drift");
  }
  return Object.freeze(rows);
}

async function digest(bytes: ArrayBuffer): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function artifactMap(
  artifacts: unknown,
  expected: readonly ExpectedArtifact[],
): Promise<Map<string, ArrayBuffer>> {
  if (!Array.isArray(artifacts) || artifacts.length !== expected.length) {
    throw new TypeError("artifact-closure-invalid");
  }
  const result = new Map<string, ArrayBuffer>();
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index] as BrowserFactualStoryBeatStagedArtifactV2;
    const pinned = expected[index]!;
    if (!hasExactKeys(artifact, ["byteLength", "bytes", "path", "sha256"])
      || artifact.path !== pinned.path
      || artifact.byteLength !== pinned.byteLength
      || artifact.sha256 !== pinned.sha256
      || !(artifact.bytes instanceof ArrayBuffer)
      || artifact.bytes.byteLength !== artifact.byteLength
      || await digest(artifact.bytes) !== artifact.sha256) {
      throw new TypeError(`artifact-${index}-integrity-drift`);
    }
    result.set(artifact.path, artifact.bytes);
  }
  return result;
}

function expectedIndexes(length: number): readonly number[] {
  if (length === 200) {
    return Object.freeze(Array.from({ length: 200 }, (_, index) => index));
  }
  if (length === browserFactualStoryBeatRepresentativeIndexes.length) {
    return browserFactualStoryBeatRepresentativeIndexes;
  }
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

function verifiedFetch(
  assets: ReadonlyMap<string, ArrayBuffer>,
  loaded: Set<string>,
): typeof fetch {
  const trustedOrigin = workerScope.location.origin;
  const root = `${verifiedModelRoot}${modelRepository}/`;
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
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

interface RuntimeTrieLogitsProcessor {
  process(
    inputIds: unknown,
    logits: { readonly dims: readonly number[]; readonly data: Float32Array },
  ): unknown;
}

function runtimeProcessorBridge(
  processor: RuntimeTrieLogitsProcessor,
): LogitsProcessorList {
  class BrowserEvaluationRuntimeProcessor extends LogitsProcessor {
    _call(inputIds: bigint[][], logits: unknown) {
      return processor.process(
        inputIds,
        logits as Parameters<RuntimeTrieLogitsProcessor["process"]>[1],
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
  if (runtimeModule === undefined || runtimeWasm === undefined) {
    throw new Error("runtime-closure-incomplete");
  }
  const loaded = new Set<string>();
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
  if (loaded.size !== expectedModelArtifacts.length
    || expectedModelArtifacts.some((artifact) => !loaded.has(artifact.path))) {
    throw new Error("model-loader-closure-drift");
  }
  env.fetch = async () => {
    throw new Error("model-fetch-closed");
  };
  modelAssets.clear();

  const tokenizerPort:
    LiveNarratorTransformersTokenizerPort
    & FactualStoryBeatTransformersTokenizerPortV2 = {
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

  const modelPort: FactualStoryBeatTransformersModelPortV2 = {
    generate: (
      inputs: FactualStoryBeatTransformersInputsV2,
      options,
      logitsProcessor,
    ) => model!.generate({
      ...inputs,
      ...options,
      logits_processor: runtimeProcessorBridge(logitsProcessor),
    }),
  };
  return createFactualStoryBeatTransformersAdapterV2(tokenizerPort, modelPort);
}

async function release(): Promise<void> {
  let firstError: unknown = null;
  if (liveAdapter !== null) {
    try {
      await liveAdapter.dispose();
    } catch (error) {
      firstError = error;
    }
  } else {
    try {
      await model?.dispose();
    } catch (error) {
      firstError = error;
    }
    try {
      await tokenizer?.dispose?.();
    } catch (error) {
      firstError ??= error;
    }
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
  env.fetch = async () => {
    throw new Error("factual-story-beat-worker-disposed");
  };
  if (runtimeModuleUrl !== null) URL.revokeObjectURL(runtimeModuleUrl);
  runtimeModuleUrl = null;
  if (firstError !== null) throw firstError;
}

function response(
  kind: BrowserFactualStoryBeatWorkerResponseV2["kind"],
  request: BrowserFactualStoryBeatWorkerRequestV2,
  fields = {},
): BrowserFactualStoryBeatWorkerResponseV2 {
  return {
    protocolVersion: browserFactualStoryBeatProtocolVersion,
    kind,
    runId: request.runId,
    operationId: request.operationId,
    ...fields,
  } as BrowserFactualStoryBeatWorkerResponseV2;
}

function occurrenceCount(value: string, part: string): number {
  return value.split(part).length - 1;
}

async function processRequest(
  request: BrowserFactualStoryBeatWorkerRequestV2,
): Promise<BrowserFactualStoryBeatWorkerResponseV2> {
  if (request.kind === "initialize") {
    if (!hasExactKeys(request, [
      "holdoutBytes", "holdoutSha256", "kind", "modelAggregateSha256",
      "modelArtifacts", "operationId", "protocolVersion", "runId",
      "runtimeArtifacts", "selectedIndexes",
    ])
      || state !== "created"
      || !isBoundedIdentity(request.runId)
      || request.modelAggregateSha256
        !== browserFactualStoryBeatExpectedModelAggregateSha256
      || request.holdoutSha256 !== browserFactualStoryBeatExpectedHoldoutSha256
      || !(request.holdoutBytes instanceof ArrayBuffer)
      || await digest(request.holdoutBytes) !== request.holdoutSha256) {
      throw new TypeError("initialize-invalid");
    }
    runId = request.runId;
    modelRevision = request.modelAggregateSha256.slice(0, 40);
    const [nextModelAssets, nextRuntimeAssets] = await Promise.all([
      artifactMap(request.modelArtifacts, expectedModelArtifacts),
      artifactMap(request.runtimeArtifacts, expectedRuntimeArtifacts),
    ]);
    const modelManifest = request.modelArtifacts.map((artifact) => ({
      path: artifact.path,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    }));
    const encodedManifest = new TextEncoder().encode(
      canonicalStringify(modelManifest),
    );
    if (await digest(encodedManifest.buffer)
      !== browserFactualStoryBeatExpectedModelAggregateSha256) {
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
  if (request.runId !== runId
    || state === "created"
    || state === "disposed"
    || state === "failed") {
    throw new TypeError("request-stale");
  }
  if (request.kind === "run") {
    if (!hasExactKeys(request, [
      "kind", "operationId", "protocolVersion", "runId",
    ]) || state !== "initialized" || selectedRows === null) {
      throw new TypeError("run-state-invalid");
    }
    state = "running";
    const loadStarted = performance.now();
    const adapter = await loadAdapter();
    if (!tokenizerVerified) throw new Error("pinned-tokenizer-unverified");
    const loadElapsedMs = Math.max(
      0,
      Math.floor(performance.now() - loadStarted),
    );
    const results: BrowserFactualStoryBeatCaseResultV2[] = [];
    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index]!;
      const started = performance.now();
      const inputTokens = await adapter.countInput(row.facts);
      const generated = await adapter.author(row.facts, {
        maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
        signal: new AbortController().signal,
      });
      const validText = validateFactualStoryBeatResultV2(generated.text, row.facts);
      const fallback = deterministicStoryBeatFallback(row.facts.narrative);
      const clauses = factualStoryBeatRequiredClausesV2(row.facts);
      if (fallback !== row.facts.narrative.headline
        || clauses === null
        || generated.sequenceSlot
          !== index % factualStoryBeatPresentationBucketIdsV2.length
        || generated.presentationBucketId
          !== factualStoryBeatPresentationBucketIdsV2[
            index % factualStoryBeatPresentationBucketIdsV2.length
          ]) {
        throw new Error("factual-generation-contract-drift");
      }
      const lower = generated.text.toLocaleLowerCase("en-US");
      const requiredClausesComplete = clauses.every((clause) =>
        occurrenceCount(lower, clause.toLocaleLowerCase("en-US")) === 1);
      const exactPlace = occurrenceCount(
        generated.text,
        row.facts.narrative.location,
      ) === 1;
      if (validText === null || !requiredClausesComplete || !exactPlace) {
        throw new Error("factual-output-boundary-rejected");
      }
      results.push(Object.freeze({
        index,
        id: row.id,
        caseHash: row.caseHash,
        candidate: generated.text,
        valid: true,
        fallbackRequired: false,
        exactPlace,
        requiredClausesComplete,
        sequenceSlot: generated.sequenceSlot,
        presentationBucketId: generated.presentationBucketId,
        formId: generated.formId,
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
    if (!hasExactKeys(request, [
      "kind", "operationId", "protocolVersion", "runId",
    ])) {
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
      || value.protocolVersion !== browserFactualStoryBeatProtocolVersion
      || !isBoundedIdentity(value.runId)
      || !isBoundedIdentity(value.operationId, 240)
      || !["initialize", "run", "dispose"].includes(String(value.kind))) {
      throw new TypeError("protocol-invalid");
    }
    const request = value as unknown as BrowserFactualStoryBeatWorkerRequestV2;
    const result = await processRequest(request);
    workerScope.postMessage(result);
    if (result.kind === "disposed") queueMicrotask(() => workerScope.close());
  })().catch(async () => {
    state = "failed";
    try {
      await release();
    } catch {
      // Failure remains fail-closed.
    }
    const record = isRecord(value) ? value : {};
    workerScope.postMessage({
      protocolVersion: browserFactualStoryBeatProtocolVersion,
      kind: "failed",
      runId: isBoundedIdentity(record.runId) ? record.runId : "invalid-run",
      operationId: isBoundedIdentity(record.operationId, 240)
        ? record.operationId
        : "invalid-operation",
      reason: "evaluation-failed-closed",
    } satisfies BrowserFactualStoryBeatWorkerResponseV2);
    queueMicrotask(() => workerScope.close());
  });
};
