/// <reference lib="webworker" />

import {
  AutoModelForSeq2SeqLM,
  AutoTokenizer,
  LogLevel,
  env,
} from "@huggingface/transformers";
import {
  createNarratorEvaluationWorkerBindingV2,
  isNarratorEvaluationRunSpecV2,
  type NarratorEvaluationRunSpecV2,
} from "../../../src/narrator/evaluation-contract-v2";
import {
  narratorBrowserOrtRuntimeV2,
  verifyNarratorBrowserEvaluationAssetsV2,
  type NarratorBrowserStagedArtifactV2,
  type NarratorVerifiedBrowserAssetClosureV2,
} from "../../../src/narrator/evaluation-browser-assets-v2";
import {
  narratorBrowserEvaluationRpcVersionV2,
  type NarratorBrowserEvaluationCommandV2,
  type NarratorBrowserEvaluationResponseV2,
} from "../../../src/narrator/evaluation-browser-worker-port-v2";
import {
  createNarratorTransformersCaseAdapterV2,
  type NarratorTransformersCaseAdapterV2,
  type NarratorTransformersInputsV2,
  type NarratorTransformersModelPortV2,
  type NarratorTransformersTokenizerPortV2,
} from "../../../src/narrator/evaluation-transformers-adapter-v2";
import {
  isNarratorModelCandidate,
  type NarratorModelCandidate,
} from "../../../src/narrator/model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "../../../src/narrator/protocol";
import { createNarratorVerifiedModelFetchV2 } from "./verified-model-fetch";

type WorkerState = "created" | "initialized" | "verified" | "loading" | "loaded" | "failed" | "disposed";

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
let state: WorkerState = "created";
let workerEpoch: string | null = null;
let candidate: NarratorModelCandidate | null = null;
let runSpec: NarratorEvaluationRunSpecV2 | null = null;
let stagedModelArtifacts: readonly NarratorBrowserStagedArtifactV2[] | null = null;
let stagedRuntimeArtifacts: readonly NarratorBrowserStagedArtifactV2[] | null = null;
let closure: NarratorVerifiedBrowserAssetClosureV2 | null = null;
let tokenizer: CallableTokenizer | null = null;
let model: CallableModel | null = null;
let adapter: NarratorTransformersCaseAdapterV2 | null = null;
let runtimeModuleUrl: string | null = null;
const loadedModelPaths = new Set<string>();

function denseStagedArtifacts(value: unknown): value is readonly NarratorBrowserStagedArtifactV2[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return false;
  for (let index = 0; index < value.length; index += 1) {
    const artifact = value[index];
    if (!Object.hasOwn(value, index)
      || !isNarratorRecord(artifact)
      || !narratorHasExactKeys(artifact, ["path", "bytes"])
      || !isNarratorBoundedText(artifact.path, 240)
      || !(artifact.bytes instanceof ArrayBuffer)) return false;
  }
  return true;
}

function baseCommand(value: unknown): value is Record<string, unknown> & {
  readonly schemaVersion: 2;
  readonly rpcId: string;
  readonly kind: string;
} {
  return isNarratorRecord(value)
    && value.schemaVersion === narratorBrowserEvaluationRpcVersionV2
    && isNarratorBoundedText(value.rpcId, 120)
    && isNarratorBoundedText(value.kind, 80);
}

function commandIsValid(value: unknown): value is NarratorBrowserEvaluationCommandV2 {
  if (!baseCommand(value)) return false;
  if (value.kind === "initialize") {
    return narratorHasExactKeys(value, [
      "schemaVersion", "rpcId", "kind", "workerEpoch", "candidate", "runSpec", "modelArtifacts",
      "runtimeArtifacts",
    ])
      && isNarratorBoundedText(value.workerEpoch, 200)
      && isNarratorModelCandidate(value.candidate)
      && isNarratorEvaluationRunSpecV2(value.runSpec, value.candidate)
      && denseStagedArtifacts(value.modelArtifacts)
      && denseStagedArtifacts(value.runtimeArtifacts);
  }
  if (value.kind === "run-case") {
    return narratorHasExactKeys(value, [
      "schemaVersion", "rpcId", "kind", "request", "maximumOutputTokens",
    ]) && value.maximumOutputTokens === 48;
  }
  return ["handshake", "verify-artifacts", "load", "dispose"].includes(value.kind)
    && narratorHasExactKeys(value, ["schemaVersion", "rpcId", "kind"]);
}

function requireIdentity(): {
  readonly candidate: NarratorModelCandidate;
  readonly runSpec: NarratorEvaluationRunSpecV2;
} {
  if (candidate === null || runSpec === null) throw new Error("worker-not-initialized");
  return { candidate, runSpec };
}

async function configureRuntime(verified: NarratorVerifiedBrowserAssetClosureV2): Promise<void> {
  const moduleArtifact = narratorBrowserOrtRuntimeV2.assets.find((artifact) => artifact.role === "runtime-module")!;
  const wasmArtifact = narratorBrowserOrtRuntimeV2.assets.find((artifact) => artifact.role === "runtime-wasm")!;
  const moduleBlob = verified.runtimeArtifactBlob(moduleArtifact.path);
  const wasmBlob = verified.runtimeArtifactBlob(wasmArtifact.path);
  runtimeModuleUrl = URL.createObjectURL(moduleBlob);

  env.logLevel = LogLevel.NONE;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/__verified_narrator__/";
  env.useFS = false;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.useCustomCache = false;
  env.customCache = null;
  env.useWasmCache = false;
  env.experimental_useCrossOriginStorage = false;
  env.fetch = createNarratorVerifiedModelFetchV2(
    verified,
    requireIdentity().candidate,
    workerScope.location.origin,
    (path) => loadedModelPaths.add(path),
  );

  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("onnx-wasm-environment-unavailable");
  wasm.proxy = false;
  wasm.numThreads = 1;
  wasm.wasmBinary = await wasmBlob.arrayBuffer();
  wasm.wasmPaths = { mjs: runtimeModuleUrl };
}

async function disposeRuntime(): Promise<void> {
  let firstError: unknown = null;
  if (adapter !== null) {
    try {
      await adapter.dispose();
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
  adapter = null;
  model = null;
  tokenizer = null;
  closure = null;
  stagedModelArtifacts = null;
  stagedRuntimeArtifacts = null;
  loadedModelPaths.clear();
  env.fetch = async () => {
    throw new Error("Narrator browser worker is disposed");
  };
  if (runtimeModuleUrl !== null) URL.revokeObjectURL(runtimeModuleUrl);
  runtimeModuleUrl = null;
  if (firstError !== null) throw firstError;
}

async function execute(command: NarratorBrowserEvaluationCommandV2): Promise<unknown> {
  if (command.kind === "initialize") {
    if (state !== "created") throw new Error("initialize-state-invalid");
    workerEpoch = command.workerEpoch;
    candidate = command.candidate;
    runSpec = command.runSpec;
    stagedModelArtifacts = command.modelArtifacts;
    stagedRuntimeArtifacts = command.runtimeArtifacts;
    state = "initialized";
    return null;
  }

  const identity = requireIdentity();
  if (command.kind === "handshake") {
    if (state === "created" || state === "disposed" || state === "failed") throw new Error("handshake-state-invalid");
    if (env.version !== identity.candidate.runtime.version) throw new Error("transformers-version-mismatch");
    return createNarratorEvaluationWorkerBindingV2(identity.runSpec, identity.candidate);
  }

  if (command.kind === "verify-artifacts") {
    if (state === "verified" || state === "loaded") return closure!.modelArtifacts;
    if (state !== "initialized" || stagedModelArtifacts === null || stagedRuntimeArtifacts === null) {
      throw new Error("verification-state-invalid");
    }
    closure = await verifyNarratorBrowserEvaluationAssetsV2(
      identity.candidate,
      stagedModelArtifacts,
      stagedRuntimeArtifacts,
    );
    stagedModelArtifacts = null;
    stagedRuntimeArtifacts = null;
    state = "verified";
    return closure.modelArtifacts;
  }

  if (command.kind === "load") {
    if (state !== "verified" || closure === null) throw new Error("load-state-invalid");
    state = "loading";
    try {
      await configureRuntime(closure);
      const tokenizerInstance = await AutoTokenizer.from_pretrained(identity.candidate.model.repository, {
        revision: identity.candidate.model.revision,
        local_files_only: true,
      });
      tokenizer = tokenizerInstance as unknown as CallableTokenizer;
      const modelInstance = await AutoModelForSeq2SeqLM.from_pretrained(identity.candidate.model.repository, {
        revision: identity.candidate.model.revision,
        local_files_only: true,
        device: "wasm",
        dtype: "q8",
        subfolder: "onnx",
        use_external_data_format: false,
      });
      model = modelInstance as unknown as CallableModel;
      const expectedPaths = new Set(identity.candidate.artifacts.map((artifact) => artifact.path));
      if (loadedModelPaths.size !== expectedPaths.size
        || [...loadedModelPaths].some((path) => !expectedPaths.has(path))) {
        throw new Error("model-loader-artifact-closure-mismatch");
      }
      const tokenizerPort: NarratorTransformersTokenizerPortV2 = {
        tokenize: (text, options) => tokenizer!(text, options),
        decode: (ids, options) => tokenizer!.decode([...ids], options),
        dispose: () => tokenizer?.dispose?.(),
      };
      const modelPort: NarratorTransformersModelPortV2 = {
        generate: (inputs: NarratorTransformersInputsV2, options) => model!.generate({ ...inputs, ...options }),
        dispose: () => model!.dispose(),
      };
      adapter = createNarratorTransformersCaseAdapterV2(
        identity.candidate,
        identity.runSpec,
        workerEpoch!,
        tokenizerPort,
        modelPort,
      );
      state = "loaded";
      return null;
    } catch (error) {
      state = "failed";
      throw error;
    }
  }

  if (command.kind === "run-case") {
    if (state !== "loaded" || adapter === null || workerEpoch === null) throw new Error("case-state-invalid");
    return adapter.evaluate(command.request, command.maximumOutputTokens);
  }

  if (state === "disposed") return null;
  if (!["initialized", "verified", "loaded", "failed"].includes(state)) throw new Error("dispose-state-invalid");
  await disposeRuntime();
  state = "disposed";
  return null;
}

workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const value = event.data;
  if (!commandIsValid(value)) return;
  void (async () => {
    let response: NarratorBrowserEvaluationResponseV2;
    try {
      const result = await execute(value);
      response = {
        schemaVersion: narratorBrowserEvaluationRpcVersionV2,
        rpcId: value.rpcId,
        ok: true,
        value: result,
      };
    } catch {
      response = {
        schemaVersion: narratorBrowserEvaluationRpcVersionV2,
        rpcId: value.rpcId,
        ok: false,
        errorCode: `${value.kind}-failed`,
      };
    }
    workerScope.postMessage(response);
    if (value.kind === "dispose" && response.ok) queueMicrotask(() => workerScope.close());
  })();
};
