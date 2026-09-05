/// <reference lib="webworker" />

import {
  AutoModelForSeq2SeqLM,
  AutoTokenizer,
  LogitsProcessor,
  LogitsProcessorList,
  LogLevel,
  env,
} from "@huggingface/transformers";
import {
  createLocalNarratorAssetStore,
  localNarratorArtifactManifestHash,
  localNarratorDisclosedDownloadBytes,
  localNarratorModelArtifacts,
  localNarratorModelRepository,
  localNarratorModelRevision,
  localNarratorRuntimeArtifacts,
  type LocalNarratorStagedArtifact,
} from "./local-model-assets";
import {
  createLiveNarratorTransformersAdapter,
  type LiveNarratorTransformersAdapter,
  type LiveNarratorTransformersInputs,
  type LiveNarratorTransformersModelPort,
  type LiveNarratorTransformersTokenizerPort,
} from "./live-transformers-adapter";
import type { LiveNarratorTrieLogitsProcessor } from "./live-form-selection";
import {
  NarratorWorkerRuntime,
  type NarratorRealizer,
  type NarratorTokenMeter,
} from "./narrator-runtime";
import type {
  NarratorModelBindingV1,
  NarratorPromptV1,
} from "./protocol";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorProtocolVersion,
} from "./protocol";
import {
  createStoryBeatTransformersAdapter,
  type StoryBeatTransformersAdapter,
  type StoryBeatTransformersInputs,
  type StoryBeatTransformersModelPort,
} from "./story-beat-transformers-adapter";
import {
  storyBeatMaximumOutputTokens,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

interface CallableTokenizer {
  (text: string, options: Readonly<Record<string, unknown>>): Promise<unknown> | unknown;
  decode(ids: number[], options: Readonly<Record<string, unknown>>): unknown;
  dispose?: () => Promise<void> | void;
}

interface CallableModel {
  generate(options: Readonly<Record<string, unknown>>): Promise<unknown>;
  dispose(): Promise<void> | void;
}

const workerScope = self as DedicatedWorkerGlobalScope;
const verifiedModelRoot = "/__the_grind_2_verified_local_narrator__/";
const modelBinding: NarratorModelBindingV1 = Object.freeze({
  modelId: localNarratorModelRepository,
  revision: localNarratorModelRevision,
  artifactManifestHash: localNarratorArtifactManifestHash,
});

function stagedMap(
  artifacts: readonly LocalNarratorStagedArtifact[],
): Map<string, ArrayBuffer> {
  const result = new Map<string, ArrayBuffer>();
  for (const artifact of artifacts) {
    if (result.has(artifact.path) || artifact.bytes.byteLength === 0) {
      throw new TypeError("Local narrator staged asset closure is invalid");
    }
    result.set(artifact.path, artifact.bytes);
  }
  return result;
}

function runtimeProcessorBridge(
  processor: LiveNarratorTrieLogitsProcessor,
): LogitsProcessorList {
  class LiveNarratorRuntimeProcessor extends LogitsProcessor {
    _call(inputIds: bigint[][], logits: unknown) {
      return processor.process(
        inputIds,
        logits as Parameters<LiveNarratorTrieLogitsProcessor["process"]>[1],
      );
    }
  }
  const processors = new LogitsProcessorList();
  processors.push(new LiveNarratorRuntimeProcessor());
  return processors;
}

function createVerifiedModelFetch(
  assets: ReadonlyMap<string, ArrayBuffer>,
  onRead: (path: string) => void,
): typeof globalThis.fetch {
  const trustedOrigin = workerScope.location.origin;
  const modelRoot = `${verifiedModelRoot}${localNarratorModelRepository}/`;
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const method = init?.method ?? request?.method ?? "GET";
    const inputUrl = request?.url ?? String(input);
    const url = new URL(inputUrl, trustedOrigin);
    if (method !== "GET"
      || url.origin !== trustedOrigin
      || !url.pathname.startsWith(modelRoot)
      || url.search !== ""
      || url.hash !== "") {
      throw new TypeError("Local narrator model loader requested an unauthorized resource");
    }
    const path = decodeURIComponent(url.pathname.slice(modelRoot.length));
    const bytes = assets.get(path);
    if (bytes === undefined) {
      throw new TypeError("Local narrator model loader requested an unknown artifact");
    }
    onRead(path);
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

class LocalNarratorRealizer implements NarratorRealizer, NarratorTokenMeter {
  readonly modelBinding = modelBinding;
  private adapter: LiveNarratorTransformersAdapter | null = null;
  private storyBeatAdapter: StoryBeatTransformersAdapter | null = null;
  private tokenizer: CallableTokenizer | null = null;
  private model: CallableModel | null = null;
  private runtimeModuleUrl: string | null = null;
  private disposed = false;

  async load(signal: AbortSignal): Promise<void> {
    if (this.disposed) throw new Error("Local narrator realizer is disposed");
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.adapter !== null) return;

    const staged = await createLocalNarratorAssetStore().read();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (staged.modelId !== modelBinding.modelId
      || staged.revision !== modelBinding.revision
      || staged.totalBytes !== localNarratorDisclosedDownloadBytes
      || staged.modelArtifacts.length !== localNarratorModelArtifacts.length
      || staged.runtimeArtifacts.length !== localNarratorRuntimeArtifacts.length) {
      throw new TypeError("Local narrator cached asset identity does not match the worker");
    }

    const modelAssets = stagedMap(staged.modelArtifacts);
    const runtimeAssets = stagedMap(staged.runtimeArtifacts);
    const runtimeModule = runtimeAssets.get("ort-wasm-simd-threaded.asyncify.mjs");
    const runtimeWasm = runtimeAssets.get("ort-wasm-simd-threaded.asyncify.wasm");
    if (runtimeModule === undefined || runtimeWasm === undefined) {
      throw new TypeError("Local narrator runtime closure is incomplete");
    }
    const loadedModelPaths = new Set<string>();

    try {
      this.runtimeModuleUrl = URL.createObjectURL(
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
      env.fetch = createVerifiedModelFetch(modelAssets, (path) => loadedModelPaths.add(path));

      const wasm = env.backends.onnx.wasm;
      if (wasm === undefined) throw new Error("Local narrator ONNX WASM environment is unavailable");
      wasm.proxy = false;
      wasm.numThreads = 1;
      wasm.wasmBinary = runtimeWasm;
      wasm.wasmPaths = { mjs: this.runtimeModuleUrl };

      const tokenizer = await AutoTokenizer.from_pretrained(modelBinding.modelId, {
        revision: modelBinding.revision,
        local_files_only: true,
      });
      this.tokenizer = tokenizer as unknown as CallableTokenizer;
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const model = await AutoModelForSeq2SeqLM.from_pretrained(modelBinding.modelId, {
        revision: modelBinding.revision,
        local_files_only: true,
        device: "wasm",
        dtype: "q8",
        subfolder: "onnx",
        use_external_data_format: false,
      });
      this.model = model as unknown as CallableModel;
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const expectedPaths = new Set(localNarratorModelArtifacts.map((artifact) => artifact.path));
      if (loadedModelPaths.size !== expectedPaths.size
        || [...loadedModelPaths].some((path) => !expectedPaths.has(path))) {
        throw new Error("Local narrator model loader did not consume the exact artifact closure");
      }
      env.fetch = async () => {
        throw new Error("Local narrator model loader is closed");
      };
      modelAssets.clear();

      const tokenizerPort: LiveNarratorTransformersTokenizerPort = {
        tokenize: (text, options) => this.tokenizer!(text, options),
        decode: (ids, options) => this.tokenizer!.decode([...ids], options),
        dispose: () => this.tokenizer?.dispose?.(),
      };
      const modelPort: LiveNarratorTransformersModelPort = {
        generate: (
          inputs: LiveNarratorTransformersInputs,
          options,
          logitsProcessor,
        ) => this.model!.generate({
          ...inputs,
          ...options,
          logits_processor: runtimeProcessorBridge(logitsProcessor),
        }),
        dispose: () => this.model!.dispose(),
      };
      const storyBeatModelPort: StoryBeatTransformersModelPort = {
        generate: (
          inputs: StoryBeatTransformersInputs,
          options,
        ) => this.model!.generate({
          ...inputs,
          ...options,
        }),
      };
      const adapter = createLiveNarratorTransformersAdapter(tokenizerPort, modelPort);
      await adapter.verifyPinnedTokenizer(signal);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      this.storyBeatAdapter = createStoryBeatTransformersAdapter(
        tokenizerPort,
        storyBeatModelPort,
      );
      this.adapter = adapter;
    } catch (error) {
      await this.releaseRuntime();
      throw error;
    }
  }

  countInput(prompt: NarratorPromptV1): Promise<number> {
    return this.requireAdapter().countInput(prompt);
  }

  countOutput(text: string): Promise<number> {
    return this.requireAdapter().countOutput(text);
  }

  countStoryBeatInput(facts: StoryBeatPublicFactsV1): Promise<number> {
    return this.requireStoryBeatAdapter().countInput(facts);
  }

  realize(
    prompt: NarratorPromptV1,
    options: { readonly maximumOutputTokens: 48; readonly signal: AbortSignal },
  ): Promise<string> {
    return this.requireAdapter().realize(prompt, options);
  }

  authorStoryBeat(
    facts: StoryBeatPublicFactsV1,
    options: {
      readonly maximumOutputTokens: typeof storyBeatMaximumOutputTokens;
      readonly signal: AbortSignal;
    },
  ) {
    return this.requireStoryBeatAdapter().author(facts, options);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.releaseRuntime();
  }

  private requireAdapter(): LiveNarratorTransformersAdapter {
    if (this.disposed || this.adapter === null) {
      throw new Error("Local narrator realizer is not loaded");
    }
    return this.adapter;
  }

  private requireStoryBeatAdapter(): StoryBeatTransformersAdapter {
    if (this.disposed || this.storyBeatAdapter === null) {
      throw new Error("Local narrator story-beat adapter is not loaded");
    }
    return this.storyBeatAdapter;
  }

  private async releaseRuntime(): Promise<void> {
    let firstError: unknown = null;
    if (this.adapter !== null) {
      try {
        await this.adapter.dispose();
      } catch (error) {
        firstError = error;
      }
    } else {
      try {
        await this.model?.dispose();
      } catch (error) {
        firstError = error;
      }
      try {
        await this.tokenizer?.dispose?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    this.storyBeatAdapter = null;
    this.adapter = null;
    this.model = null;
    this.tokenizer = null;
    env.fetch = async () => {
      throw new Error("Local narrator worker is disposed");
    };
    if (this.runtimeModuleUrl !== null) URL.revokeObjectURL(this.runtimeModuleUrl);
    this.runtimeModuleUrl = null;
    if (firstError !== null) throw firstError;
  }
}

const realizer = new LocalNarratorRealizer();
const runtime = new NarratorWorkerRuntime(realizer, realizer);

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const request = event.data;
  void runtime.process(request).then((response) => {
    workerScope.postMessage(response);
    if (response.kind === "status" && response.payload.state === "off") {
      queueMicrotask(() => workerScope.close());
    }
  }).catch(() => {
    const record = isNarratorRecord(request) ? request : {};
    workerScope.postMessage({
      protocolVersion: narratorProtocolVersion,
      campaignId: isNarratorBoundedText(record.campaignId, 160)
        ? record.campaignId
        : "unknown",
      workerEpoch: isNarratorBoundedText(record.workerEpoch, 200)
        ? record.workerEpoch
        : "unknown",
      requestId: isNarratorBoundedText(record.requestId, 240)
        ? record.requestId
        : "unknown",
      kind: "error",
      payload: {
        code: "internalError",
        message: "Local narrator worker failed",
      },
    });
    queueMicrotask(() => workerScope.close());
  });
};
