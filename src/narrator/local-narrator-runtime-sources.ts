import runtimeModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import runtimeWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import type { LocalNarratorRuntimeSourceUrls } from "./local-model-assets";

export const localNarratorRuntimeSourceUrls = Object.freeze({
  "ort-wasm-simd-threaded.asyncify.mjs": runtimeModuleUrl,
  "ort-wasm-simd-threaded.asyncify.wasm": runtimeWasmUrl,
} satisfies LocalNarratorRuntimeSourceUrls);
