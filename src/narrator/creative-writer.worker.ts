/// <reference lib="webworker" />

import { AutoModelForCausalLM, AutoTokenizer, LogitsProcessor, LogitsProcessorList, LogLevel, StoppingCriteria, env } from "@huggingface/transformers";
import runtimeModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import runtimeWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { CreativeWriterMessage } from "./creative-writer-client";
import { createCreativeDirectionMask, type CreativeDirectionLogits } from "./creative-direction-logits";
import { hasFinishedCreativeStoryPassage } from "./creative-story-sentences";
import { creativeStoryMemoryPrefix } from "./creative-continuity";

// Keep the pinned identity aligned with the disclosure in creative-writer-client.ts.
const modelId = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
const revision = "5b6682c7c9df18f004bfb7e635cba3f3d98537d8";
const cacheName = `the-grind-2:creative-writer:${revision}:ort-1.26.0-dev.20260416-b7804b056c`;
const runtimeRoot = "https://the-grind-2.invalid/creative-writer-runtime/";
const workerScope = self as DedicatedWorkerGlobalScope;
let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>> | null = null;
let busy = false;

async function load(id: number, cacheOnly: boolean): Promise<void> {
  if (model !== null && tokenizer !== null) return;
  const closedFetch: typeof fetch = async () => { throw new Error("Creative writer network is closed"); };
  env.logLevel = LogLevel.NONE;
  env.allowLocalModels = cacheOnly;
  env.allowRemoteModels = !cacheOnly;
  if (cacheOnly) {
    env.fetch = closedFetch;
    globalThis.fetch = closedFetch;
  }
  // Transformers 4.2's tokenizer metadata lookup omits its revision option.
  // Pin the URL template too, including that internal lookup and its cache key.
  env.remotePathTemplate = `{model}/resolve/${revision}/`;
  env.useFS = false;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.useWasmCache = false;
  env.experimental_useCrossOriginStorage = false;
  // A separate cache keeps this opt-in writer independent of the factual narrator.
  let cache: Cache | null = null;
  try {
    cache = await caches.open(cacheName);
    env.customCache = cache;
    env.useCustomCache = true;
  } catch {
    env.customCache = null;
    env.useCustomCache = false;
  }
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("WASM runtime is unavailable");
  wasm.numThreads = 1;
  wasm.proxy = false;

  const files = ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];
  const cachedModel = cache !== null && (await Promise.all(files.map(async (file) =>
    (await cache!.match(`https://huggingface.co/${modelId}/resolve/${revision}/${file}`))?.ok === true,
  ))).every(Boolean);
  if (cacheOnly && !cachedModel) throw new Error("Saved creative model is incomplete");
  workerScope.postMessage({ type: "progress", id, message: cachedModel
    ? "Restoring saved creative writer…" : "Downloading creative writer for this browser…" });

  async function runtimeBytes(file: string, assetUrl: string): Promise<ArrayBuffer> {
    const key = runtimeRoot + file;
    const saved = await cache?.match(key);
    if (saved?.ok) return saved.arrayBuffer();
    if (cacheOnly) throw new Error("Saved creative runtime is incomplete");
    const response = await fetch(new URL(assetUrl, workerScope.location.href));
    if (!response.ok) throw new Error("Could not load local runtime");
    try { await cache?.put(key, response.clone()); } catch { /* Loading still works without storage. */ }
    return response.arrayBuffer();
  }
  const [moduleBytes, wasmBytes] = await Promise.all([
    runtimeBytes("ort-wasm-simd-threaded.asyncify.mjs", runtimeModuleUrl),
    runtimeBytes("ort-wasm-simd-threaded.asyncify.wasm", runtimeWasmUrl),
  ]);
  const moduleUrl = URL.createObjectURL(new Blob([moduleBytes], { type: "text/javascript" }));
  wasm.wasmPaths = { mjs: moduleUrl };
  wasm.wasmBinary = wasmBytes;

  const progress_callback = (progress: { status: string; progress?: number }) => {
    const message = cachedModel ? "Restoring saved creative writer…"
      : progress.status === "progress" && typeof progress.progress === "number"
      ? `Downloading creative writer · ${Math.round(progress.progress)}%`
      : "Preparing creative writer in this browser…";
    workerScope.postMessage({ type: "progress", id, message });
  };
  const localOnly = cacheOnly || cachedModel;
  if (localOnly) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.fetch = closedFetch;
    globalThis.fetch = closedFetch;
  }
  try {
    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      revision, progress_callback, local_files_only: localOnly,
    });
    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      revision, device: "wasm", dtype: "q8", progress_callback, local_files_only: localOnly,
    });
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
  // All assets are now resident. Story prompts never enter a network request.
  env.allowRemoteModels = false;
  env.fetch = closedFetch;
  globalThis.fetch = closedFetch;
}

function readMessages(value: unknown): CreativeWriterMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new Error("Invalid prompt");
  const messages = value.map((message: unknown): CreativeWriterMessage => {
    if (message === null || typeof message !== "object") throw new Error("Invalid prompt");
    const entry = message as Record<string, unknown>;
    if ((entry.role !== "system" && entry.role !== "user") || typeof entry.content !== "string"
      || entry.content.trim().length === 0 || entry.content.length > 4_000) throw new Error("Invalid prompt");
    return { role: entry.role, content: entry.content };
  });
  if (messages.reduce((length, message) => length + message.content.length, 0) > 8_000) {
    throw new Error("Prompt is too long");
  }
  return messages;
}

async function write(messages: CreativeWriterMessage[]): Promise<string> {
  if (tokenizer === null || model === null) throw new Error("Load the writer first");
  let boundedMessages = messages;
  const tokenize = () => tokenizer!.apply_chat_template(boundedMessages, {
    tokenize: true, return_dict: true, add_generation_prompt: true,
  });
  let inputs = tokenize();
  let inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  // Only optional imagined history can be shed. Keep the complete final scene and
  // system instruction, and never increase the model's existing context limit.
  while (inputLength > 1_024 && boundedMessages.length > 2 && boundedMessages[0]?.role === "system"
    && boundedMessages.at(-1)?.role === "user"
    && boundedMessages.slice(1, -1).every((message) => message.role === "user" && message.content.startsWith(creativeStoryMemoryPrefix))) {
    boundedMessages = [boundedMessages[0]!, ...boundedMessages.slice(2)];
    inputs = tokenize();
    inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  }
  if (inputLength < 1 || inputLength > 1_024) throw new Error("Prompt exceeds the local context budget");
  const activeTokenizer = tokenizer;
  class FinishedPassageCriteria extends StoppingCriteria {
    _call(inputIds: (number | bigint)[][]): boolean[] {
      return inputIds.map((row) => hasFinishedCreativeStoryPassage(activeTokenizer.decode(
        row.slice(inputLength).map(Number), { skip_special_tokens: true },
      )));
    }
  }
  const result = await model.generate({
    ...inputs, max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08,
    stopping_criteria: new FinishedPassageCriteria(),
  });
  if (!("tolist" in result)) throw new Error("Invalid generated text");
  const rows = result.tolist() as (number | bigint)[][];
  const suffix = rows[0]?.slice(inputLength).map(Number);
  if (suffix === undefined) throw new Error("Empty generated text");
  const text = tokenizer.decode(suffix, { skip_special_tokens: true }).trim();
  if (text.length === 0 || text.length > 4_000) throw new Error("Invalid generated text");
  return text;
}

async function direct(messages: CreativeWriterMessage[], exclude: unknown): Promise<string | null> {
  if (tokenizer === null || model === null) throw new Error("Load the writer first");
  if (exclude !== undefined && exclude !== "1" && exclude !== "2" && exclude !== "3") {
    throw new Error("Direction exclusion must be one label");
  }
  const inputs = tokenizer.apply_chat_template(messages, {
    tokenize: true, return_dict: true, add_generation_prompt: true,
  });
  const inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  if (inputLength < 1 || inputLength > 512) throw new Error("Direction exceeds the local context budget");
  const labels = (["1", "2", "3"] as const).filter((label) => label !== exclude);
  const tokenIds = labels.map((label) => {
    const ids = tokenizer!.encode(label, { add_special_tokens: false });
    if (ids.length !== 1 || tokenizer!.decode(ids, { skip_special_tokens: false }) !== label) {
      throw new Error("Direction label is not one exact token");
    }
    return ids[0]!;
  });
  const mask = createCreativeDirectionMask(tokenIds);
  class DirectionProcessor extends LogitsProcessor {
    _call(_inputIds: bigint[][], logits: unknown) {
      return mask(logits as CreativeDirectionLogits);
    }
  }
  const processors = new LogitsProcessorList();
  processors.push(new DirectionProcessor());
  const result = await model.generate({
    ...inputs, max_new_tokens: 1, do_sample: false, repetition_penalty: 1,
    logits_processor: processors,
  });
  if (!("tolist" in result)) return null;
  const rows = result.tolist() as (number | bigint)[][];
  const suffix = rows.length === 1 ? rows[0]?.slice(inputLength).map(Number) : undefined;
  if (suffix?.length !== 1) return null;
  const index = tokenIds.indexOf(suffix[0]!);
  if (index < 0) return null;
  return tokenizer.decode(suffix, { skip_special_tokens: false }) === labels[index] ? labels[index]! : null;
}

workerScope.addEventListener("message", async (event: MessageEvent<unknown>) => {
  if (event.data === null || typeof event.data !== "object") return;
  const request = event.data as Record<string, unknown>;
  const id = request.id;
  if (!Number.isSafeInteger(id) || typeof id !== "number" || id < 1) return;
  if (busy) { workerScope.postMessage({ type: "error", id }); return; }
  busy = true;
  try {
    if (request.type === "load") {
      await load(id, request.cacheOnly === true);
      workerScope.postMessage({ type: "ready", id });
    } else if (request.type === "write") {
      const text = await write(readMessages(request.messages));
      workerScope.postMessage({ type: "result", id, text });
    } else if (request.type === "direct") {
      const choice = await direct(readMessages(request.messages), request.exclude);
      workerScope.postMessage({ type: "direction", id, choice });
    } else {
      throw new Error("Unknown writer request");
    }
  } catch {
    workerScope.postMessage({ type: "error", id });
  } finally {
    busy = false;
  }
});
