/// <reference lib="webworker" />

import { AutoModelForCausalLM, AutoTokenizer, LogLevel, env } from "@huggingface/transformers";
import runtimeModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import runtimeWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { CreativeWriterMessage } from "./creative-writer-client";

// Keep the pinned identity aligned with the disclosure in creative-writer-client.ts.
const modelId = "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA";
const revision = "5b6682c7c9df18f004bfb7e635cba3f3d98537d8";
const cacheName = `the-grind-2:creative-writer:${revision}:ort-1.26.0-dev.20260416-b7804b056c`;
const runtimeRoot = "https://the-grind-2.invalid/creative-writer-runtime/";
const workerScope = self as DedicatedWorkerGlobalScope;
let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>> | null = null;
let busy = false;

async function load(id: number): Promise<void> {
  if (model !== null && tokenizer !== null) return;
  env.logLevel = LogLevel.NONE;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
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
  workerScope.postMessage({ type: "progress", id, message: cachedModel
    ? "Restoring saved creative writer…" : "Downloading creative writer for this browser…" });

  async function runtimeBytes(file: string, assetUrl: string): Promise<ArrayBuffer> {
    const key = runtimeRoot + file;
    const saved = await cache?.match(key);
    if (saved?.ok) return saved.arrayBuffer();
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
  const closedFetch: typeof fetch = async () => { throw new Error("Creative writer network is closed"); };
  if (cachedModel) {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.fetch = closedFetch;
    globalThis.fetch = closedFetch;
  }
  try {
    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      revision, progress_callback, local_files_only: cachedModel,
    });
    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      revision, device: "wasm", dtype: "q8", progress_callback, local_files_only: cachedModel,
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
  const inputs = tokenizer.apply_chat_template(messages, {
    tokenize: true, return_dict: true, add_generation_prompt: true,
  });
  const inputLength = inputs.input_ids.dims.at(-1) ?? 0;
  if (inputLength < 1 || inputLength > 1_024) throw new Error("Prompt exceeds the local context budget");
  const result = await model.generate({
    ...inputs, max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08,
  });
  if (!("tolist" in result)) throw new Error("Invalid generated text");
  const rows = result.tolist() as (number | bigint)[][];
  const suffix = rows[0]?.slice(inputLength).map(Number);
  if (suffix === undefined) throw new Error("Empty generated text");
  const text = tokenizer.decode(suffix, { skip_special_tokens: true }).trim();
  if (text.length === 0 || text.length > 4_000) throw new Error("Invalid generated text");
  return text;
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
      await load(id);
      workerScope.postMessage({ type: "ready", id });
    } else if (request.type === "write") {
      const text = await write(readMessages(request.messages));
      workerScope.postMessage({ type: "result", id, text });
    } else {
      throw new Error("Unknown writer request");
    }
  } catch {
    workerScope.postMessage({ type: "error", id });
  } finally {
    busy = false;
  }
});
