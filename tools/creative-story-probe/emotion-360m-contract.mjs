import { instrumentSuccessiveStoryWorker } from './successive-story-contract.mjs';
import { applySampledProseDecoding } from './sampled-prose-contract.mjs';

export const emotion360mProfile = Object.freeze({
  modelId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
  revision: 'a10cc1512eabd3dde888204e902eca88bddb4951',
  artifactBytes: 366_673_969, maxNewTokens: 40,
});
export const emotion360mBudgets = Object.freeze({ total: 295_000, work: 290_000, cleanup: 5_000,
  load: 90_000, write: 90_000 });
export const identityReplacements = Object.freeze([
  ['onnx-community/SmolLM2-135M-Instruct-ONNX-MHA', emotion360mProfile.modelId],
  ['5b6682c7c9df18f004bfb7e635cba3f3d98537d8', emotion360mProfile.revision],
]);
export const outputReplacement = Object.freeze([
  'max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08',
  'max_new_tokens: 40, do_sample: false, repetition_penalty: 1.08',
]);

export function applyEmotion360mIdentity(source) {
  for (const [before, after] of identityReplacements) {
    if (source.split(before).length !== 2) throw new Error('Expected exactly one pinned production identity literal');
    source = source.replace(before, after);
  }
  return source;
}

export function instrumentEmotion360mWorker(source) {
  const observed = instrumentSuccessiveStoryWorker(applyEmotion360mIdentity(source));
  if (observed.split(outputReplacement[0]).length !== 2) throw new Error('Expected one bounded prose generation call');
  return observed.replace(...outputReplacement);
}

/** Final bounded decoding-only follow-up to the unchanged generic 360M prompt/profile. */
export function instrumentEmotion360mSampledWorker(source) {
  return applySampledProseDecoding(instrumentEmotion360mWorker(source), emotion360mProfile.maxNewTokens);
}
