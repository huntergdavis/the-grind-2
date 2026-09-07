import { instrumentSuccessiveStoryWorker } from './successive-story-contract.mjs';

export const sampledProseSettings = Object.freeze({ doSample: true, temperature: 0.7, topK: 40 });
export const sampledProseRuntimePaths = Object.freeze([
  'node_modules/@huggingface/transformers/package.json',
  'node_modules/@huggingface/transformers/src/models/modeling_utils.js',
  'node_modules/@huggingface/transformers/src/generation/logits_sampler.js',
]);
export const sampledProseReplacement = Object.freeze([
  'max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08',
  'max_new_tokens: 64, do_sample: true, temperature: 0.7, top_k: 40, repetition_penalty: 1.08',
]);

/** The already-observed 135M/64-token or 360M/40-token worker retains its exact budget. */
export function applySampledProseDecoding(source, maximumTokens) {
  if (![40, 64].includes(maximumTokens)) throw new Error('Only the existing 40- or 64-token prose budget is supported');
  const [before, after] = sampledProseReplacement.map((text) => text.replace('max_new_tokens: 64', `max_new_tokens: ${maximumTokens}`));
  if (source.split(before).length !== 2) throw new Error('Expected exactly one production prose decoding call');
  return source.replace(before, after);
}

/** Only prose decoding changes; production prompts, identity, stopping and DM direct() remain intact. */
export function instrumentSampledProseWorker(source) {
  return applySampledProseDecoding(instrumentSuccessiveStoryWorker(source), 64);
}
