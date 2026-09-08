export const webgpuV1 = Object.freeze({
  runtimePackage: '@mlc-ai/web-llm', runtimeVersion: '0.2.85',
  modelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  modelRevision: '9bd564b064631febf14deadcac492efb761d60c3',
  modelUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/9bd564b064631febf14deadcac492efb761d60c3/',
  modelLib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
  contextWindow: 1024, maxTokens: 64, temperature: 0.7, topP: 0.85, seed: 7,
  loadDeadlineMs: 180_000, generationDeadlineMs: 90_000, totalDeadlineMs: 600_000,
});

export const webgpuV1Flags = Object.freeze([
  '--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan',
  '--disable-vulkan-surface', '--enable-unsafe-webgpu',
]);
