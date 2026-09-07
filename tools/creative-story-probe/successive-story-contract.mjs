import { randomUUID } from 'node:crypto';
import { transformStoppingWorker } from './sentence-stopping-contract.mjs';

export const successiveStoryBudgets = Object.freeze({ total: 240_000, work: 235_000, cleanup: 5_000, write: 90_000 });
export const inputMarker = '  const activeTokenizer = tokenizer;';
export const inputInstrumentation = '\n  workerScope.postMessage({ type: "probe-input", inputTokens: inputLength, effectiveMessages: boundedMessages });';

/** Observation only: production token trimming, stopping, generation and returned text remain intact. */
export function instrumentSuccessiveStoryWorker(source) {
  if (source.split(inputMarker).length !== 2) throw new Error('Expected one production write token boundary');
  return transformStoppingWorker(source, 'candidate').replace(inputMarker, inputMarker + inputInstrumentation);
}

export function successiveStoryReportName(now = new Date(), uuid = randomUUID()) {
  return `successive-story-report-${now.toISOString().replace(/[:.]/g, '-')}-${uuid}.json`;
}
