import { isCompleteConnectedStoryEvidence } from './webgpu-complete-story.mjs';
import { isCompleteWriteTiming } from './webgpu-write-timing.mjs';
import { isCompleteSentenceBudgetEvidence } from './sentence-budget-adapter.mjs';

/**
 * Align the reviewed 8baf543/d4bfd7e contracts for at most three sequential writes.
 * This is execution/provenance evidence, never a literary or all-token math pass.
 * Sampling still covers only the first 64 generated samples across the worker.
 */
export function hasCompleteConnectedBudgetEvidence(report, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 3 || report === null || typeof report !== 'object'
    || !Array.isArray(report.outputs) || report.outputs.length !== count
    || !Array.isArray(report.candidateRawOutputs) || report.candidateRawOutputs.length !== count
    || !Array.isArray(report.sentenceBudgetObservations) || report.sentenceBudgetObservations.length !== count
    || !Array.isArray(report.writeTimingObservations) || report.writeTimingObservations.length > count * 128
    || !Array.isArray(report.errors) || report.errors.length !== 0
    || !Array.isArray(report.deviceLosses) || report.deviceLosses.length !== 0
    || !isCompleteConnectedStoryEvidence(report.completeStoryObservations, count)) return false;
  let previousStory = 1, generatedSamples = 0;
  for (const record of report.writeTimingObservations) {
    if (!Number.isSafeInteger(record?.story) || record.story < previousStory || record.story > count) return false;
    previousStory = record.story;
  }
  for (let index = 0; index < count; index++) {
    const story = index + 1, output = report.outputs[index];
    const raw = report.candidateRawOutputs[index], decision = report.sentenceBudgetObservations[index];
    const timing = report.writeTimingObservations.filter(record => record.story === story);
    if (raw?.story !== story || decision?.story !== story
      || output?.status !== 'completed' || output.acceptedNewStory !== true || output.archived !== true
      || output.characterAnchorPreserved !== true || output.connectedSequence !== true
      || output.journalScope !== 'owned-memory-only' || output.journal?.persistent !== false
      || typeof output.cleaned !== 'string' || output.cleaned.length === 0
      || output.sentenceBudgetOutcome?.mode !== decision.mode
      || output.sentenceBudgetOutcome?.sentenceCount !== decision.sentenceCount
      || !isCompleteSentenceBudgetEvidence([decision], output, [raw]) || !isCompleteWriteTiming(timing)) return false;
    const previousDispatches = index === 0 ? 0 : report.completeStoryObservations[index - 1].submission.encodedDispatches;
    if (!timing.every((record, position) => Number.isSafeInteger(record.encodedDispatches)
      && record.encodedDispatches >= (position === 0 ? previousDispatches : timing[position - 1].encodedDispatches))
      || timing.at(-1).encodedDispatches !== report.completeStoryObservations[index].submission.encodedDispatches) return false;
    // One sample from prefill, then the actual native decode count. No later GPU
    // samples are read back after the global diagnostic cap is exhausted.
    generatedSamples += 1 + timing.at(-1).decodedSteps;
  }
  const samples = report.samplingObservations;
  return Array.isArray(samples) && samples.length === Math.min(64, generatedSamples)
    && samples.every((record, index) => record?.step === index + 1 && record.settings?.grammarConstrained === false);
}
