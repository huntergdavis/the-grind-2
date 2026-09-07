import { cleanCreativeStoryOutput } from '../../src/narrator/creative-story.ts';

const cacheName = 'tg2-isolated-qwen-wllama-proof-v1';
const loadOptions = Object.freeze({ n_threads: 1, n_gpu_layers: 0, n_ctx: 1024, n_parallel: 1, seed: 17 });
let writer;
let wasmUrl;
let Wllama;
let retainedModelBlob;
let retainedWasmBlob;

/** Runtime-only experiment: retained page memory is NOT a persistent model cache. */
async function loadDirectBlob(reuseMemoryOnly = false) {
  const started = performance.now();
  if (!reuseMemoryOnly) {
    ({ Wllama } = await import(/* @vite-ignore */ '/runtime/esm/index.js'));
    const readBlob = async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Local artifact HTTP ${response.status}`);
      return response.blob();
    };
    retainedModelBlob = await readBlob('/model.gguf');
    retainedWasmBlob = await readBlob('/runtime/esm/wasm/wllama.wasm');
  }
  if (!Wllama || retainedModelBlob?.size !== 491400032 || retainedWasmBlob?.size !== 8457512) {
    throw new Error('Verified-size retained Blobs missing; no persistence or download fallback');
  }
  wasmUrl = URL.createObjectURL(new Blob([retainedWasmBlob], { type: 'application/wasm' }));
  writer = new Wllama({ default: wasmUrl }, { suppressNativeLog: false });
  writer.setCompat(null);
  await writer.loadModel([retainedModelBlob], loadOptions);
  return { loadMs: Math.round(performance.now() - started), reuseMemoryOnly, persistentCacheProven: false,
    storage: 'retained in-page Blobs only', loadOptions, modelLoaded: writer.isModelLoaded(),
    metadata: writer.getModelMetadata(), multiThread: writer.isMultithread() };
}

async function load(cachedOnly = false) {
  const started = performance.now();
  const cache = await caches.open(cacheName);
  if (!cachedOnly) {
    ({ Wllama } = await import(/* @vite-ignore */ '/runtime/esm/index.js'));
    for (const url of ['/model.gguf', '/runtime/esm/wasm/wllama.wasm']) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Local artifact HTTP ${response.status}`);
      await cache.put(url, response);
    }
  }
  const model = await cache.match('/model.gguf');
  const wasm = await cache.match('/runtime/esm/wasm/wllama.wasm');
  if (!model || !wasm || !Wllama) throw new Error('Required cached model/runtime missing; no download fallback');
  wasmUrl = URL.createObjectURL(new Blob([await wasm.arrayBuffer()], { type: 'application/wasm' }));
  writer = new Wllama({ default: wasmUrl }, { suppressNativeLog: false });
  writer.setCompat(null);
  await writer.loadModel([await model.blob()], loadOptions);
  return { loadMs: Math.round(performance.now() - started), cachedOnly, loadOptions,
    modelLoaded: writer.isModelLoaded(), cacheKeys: (await cache.keys()).map(request => new URL(request.url).pathname),
    metadata: writer.getModelMetadata(), multiThread: writer.isMultithread() };
}

async function write(messages) {
  const started = performance.now();
  const response = await writer.createChatCompletion({ messages, max_tokens: 64, temperature: 0,
    penalty_repeat: 1.08, penalty_last_n: -1, seed: 17, cache_prompt: false });
  const raw = response.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') throw new Error('Expected a completed text response');
  return { raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started),
    usage: response.usage, finishReason: response.choices[0].finish_reason };
}

async function writeStream(messages) {
  const started = performance.now();
  let raw = '';
  let lastChunk;
  await writer.createChatCompletion({ messages, max_tokens: 64, temperature: 0,
    penalty_repeat: 1.08, penalty_last_n: -1, seed: 17, cache_prompt: false,
    stream: true, return_progress: true, timings_per_token: true,
    onData(chunk) {
      lastChunk = chunk;
      raw += chunk.choices?.[0]?.delta?.content ?? '';
      void globalThis.strongerStreamCheckpoint({ elapsedMs: Math.round(performance.now() - started), chunk });
    },
  });
  return { raw, cleaned: cleanCreativeStoryOutput(raw), generationMs: Math.round(performance.now() - started),
    usage: lastChunk?.usage, finishReason: lastChunk?.choices?.[0]?.finish_reason, complete: true };
}

async function dispose() {
  if (writer) await writer.exit();
  writer = undefined;
  if (wasmUrl) URL.revokeObjectURL(wasmUrl);
}

globalThis.strongerWriterProbe = { load, loadDirectBlob, write, writeStream, dispose,
  capability: { secureContext: isSecureContext, crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency,
    jspi: typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function' } };
