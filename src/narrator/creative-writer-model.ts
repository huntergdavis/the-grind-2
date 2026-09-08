/** Exact candidate pinned by the isolated WebGPU V1 probe; no moving model aliases. */
export const creativeWriterModelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const creativeWriterModelRevision = "9bd564b064631febf14deadcac492efb761d60c3";
export const creativeWriterModelUrl = `https://huggingface.co/mlc-ai/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
export const creativeWriterModelLib = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm";
export const creativeWriterModelShardFiles: readonly string[] = Object.freeze(
  Array.from({ length: 30 }, (_, index) => `params_shard_${index}.bin`),
);
export const creativeWriterCacheScopes = Object.freeze({
  model: "webllm/model", config: "webllm/config", wasm: "webllm/wasm",
});
