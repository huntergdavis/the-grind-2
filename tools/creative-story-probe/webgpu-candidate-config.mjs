/** Evaluation only. This module is never imported by the game build. */
export const creativeWriterModelId = 'Qwen3-4B-q4f16_1-MLC';
export const creativeWriterModelRevision = 'a5c9fab855e3ccbdfed2e7e69683d75f30332161';
export const creativeWriterModelUrl = `https://huggingface.co/mlc-ai/${creativeWriterModelId}/resolve/${creativeWriterModelRevision}/`;
export const creativeWriterModelLib = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen3-4B-q4f16_1_cs1k-webgpu.wasm';
export const creativeWriterModelShardFiles = Object.freeze(Array.from({ length: 74 }, (_, index) => `params_shard_${index}.bin`));
export const creativeWriterCacheScopes = Object.freeze({ model: 'webllm/model', config: 'webllm/config', wasm: 'webllm/wasm' });

export const webgpuCandidate = Object.freeze({
  runtimePackage: '@mlc-ai/web-llm', runtimeVersion: '0.2.85',
  modelId: creativeWriterModelId, modelRevision: creativeWriterModelRevision,
  modelUrl: creativeWriterModelUrl, modelLib: creativeWriterModelLib,
  contextWindow: 1024, maxTokens: 64, temperature: 0.7, topP: 0.85, seed: 7,
  rawMaxTokens: 68, emptyThinkingHeaderTokenIds: Object.freeze([151667, 271, 151668, 271]),
  loadDeadlineMs: 180_000, generationDeadlineMs: 90_000, totalDeadlineMs: 900_000,
  weightBytes: 2_262_920_192, artifactBytes: 2_280_372_422, maximumArtifactBytes: 2_500_000_000,
  registryVramMB: 3431.59, registryContextWindow: 4096,
  license: 'Apache-2.0', enableThinking: false,
});
