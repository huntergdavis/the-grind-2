import assert from 'node:assert/strict';
import test from 'node:test';
import { createWriteTimingDiagnostics } from './webgpu-write-timing.mjs';
import { hasCompleteConnectedBudgetEvidence } from './connected-budget-evidence.mjs';

// Authored orchestration fixture, not model output or a literary qualification.
function evidence(count = 3, decoded = [20, 30, 40]) {
  const report = { outputs: [], candidateRawOutputs: [], sentenceBudgetObservations: [],
    completeStoryObservations: [], writeTimingObservations: [], samplingObservations: [], errors: [], deviceLosses: [] };
  let dispatches = 0;
  for (let index = 0; index < count; index++) {
    const story = index + 1, prefix = `Mara considered scene ${story}.`, source = prefix + ' Rowan hesitated';
    const raw = '<think>\n\n</think>\n\n' + source;
    let clock = 0;
    const native = { prefillTokens: 231, prefillMs: 30000, decodeTokens: 0, decodeMs: 0 };
    const pipeline = { getCurRoundPrefillTotalTokens: () => native.prefillTokens,
      getCurRoundPrefillTotalTime: () => native.prefillMs / 1000,
      getCurRoundDecodingTotalTokens: () => native.decodeTokens,
      getCurRoundDecodingTotalTime: () => native.decodeMs / 1000 };
    const timing = createWriteTimingDiagnostics(record => report.writeTimingObservations.push({ ...record, story }),
      () => clock, () => dispatches);
    timing.worker('write-start'); timing.worker('reset-start'); timing.worker('reset-end');
    timing.worker('create-start'); timing.worker('create-end'); timing.begin('prefill', pipeline);
    clock = 30000; dispatches++; timing.end('prefill', pipeline); timing.worker('chunk', source);
    for (let step = 0; step < decoded[index]; step++) {
      timing.begin('decode', pipeline); clock += 10; native.decodeMs += 10; native.decodeTokens++;
      dispatches++; timing.end('decode', pipeline); timing.worker('chunk', source);
    }
    clock = 80000; timing.worker('interrupt-start'); clock += 20; timing.worker('interrupt-return');
    timing.worker('stream-drained', source); timing.worker('write-success');
    report.outputs.push({ status: 'completed', raw: prefix, cleaned: prefix, acceptedNewStory: true,
      archived: true, characterAnchorPreserved: true, connectedSequence: true,
      journalScope: 'owned-memory-only', journal: { persistent: false },
      sentenceBudgetOutcome: { mode: 'completed-sentence-budget-fallback', sentenceCount: 1 } });
    report.candidateRawOutputs.push({ story, raw, rawCharacters: raw.length, rawTruncated: false });
    report.sentenceBudgetObservations.push({ story, kind: 'sentence-budget-decision',
      stage: 'worker-success-after-stream-drain', mode: 'completed-sentence-budget-fallback',
      selectedPrefix: prefix, sentenceCount: 1, elapsedMs: 80020, stopElapsedMs: 80000,
      originalCharacters: source.length, discardedCharacters: source.length - prefix.length,
      stopOriginalCharacters: source.length, stopDiscardedCharacters: source.length - prefix.length,
      rawTruncated: false, hygieneScope: 'whole-raw-stream-after-drain' });
    report.completeStoryObservations.push({ story, kind: 'complete-story', completed: true,
      deviceLossWindow: 'first-prefill-through-worker-write-settlement',
      submissionCounterWindow: 'worker-lifetime-through-write-settlement', watchStarted: true, watchStopped: true,
      submission: { encodedDispatches: dispatches, flushAttempts: dispatches, flushedDispatches: dispatches,
        maxPendingDispatchesBeforeFlush: 1, missingPendingEncoderCount: 0, pendingEncoderAfterFlushCount: 0,
        invalidPendingCount: 0, errors: [] }, errors: [], deviceLosses: [] });
  }
  report.samplingObservations = Array.from({ length: Math.min(64, decoded.slice(0, count).reduce((sum, steps) => sum + steps + 1, 0)) },
    (_, index) => ({ step: index + 1, settings: { grammarConstrained: false } }));
  return report;
}

test('one, two, and three aligned writes retain complete native timing while sampling stays globally capped', () => {
  for (const count of [1, 2, 3]) assert.equal(hasCompleteConnectedBudgetEvidence(evidence(count), count), true);
  const report = evidence();
  assert.equal(report.samplingObservations.length, 64);
  assert.deepEqual(report.writeTimingObservations.filter(record => record.phase === 'write-success').map(record => record.decodedSteps), [20, 30, 40]);
  // A strict numerical warning remains visible data, not an invented all-token pass.
  report.samplingObservations[0].probabilities = { normalized: false, aboveOneCount: 1 };
  assert.equal(hasCompleteConnectedBudgetEvidence(report, 3), true);
  const natural = evidence(1), prefix = natural.outputs[0].raw;
  const raw = '<think>\n\n</think>\n\n' + prefix;
  Object.assign(natural.candidateRawOutputs[0], { raw, rawCharacters: raw.length });
  Object.assign(natural.sentenceBudgetObservations[0], { mode: 'natural-completion', stopElapsedMs: null,
    originalCharacters: prefix.length, discardedCharacters: 0, stopOriginalCharacters: null,
    stopDiscardedCharacters: null, hygieneScope: 'ordinary-admission-after-worker-result' });
  natural.outputs[0].sentenceBudgetOutcome.mode = 'natural-completion';
  assert.equal(hasCompleteConnectedBudgetEvidence(natural, 1), true);
});

test('missing, duplicate, interleaved, reordered, foreign, and failed per-story evidence is rejected', () => {
  for (const count of [0, 4, NaN, '3', undefined]) assert.equal(hasCompleteConnectedBudgetEvidence(evidence(), count), false);
  for (const report of [null, undefined, {}, { outputs: [] }]) assert.equal(hasCompleteConnectedBudgetEvidence(report, 1), false);
  for (const mutate of [
    report => report.outputs.pop(),
    report => report.candidateRawOutputs.push(report.candidateRawOutputs[2]),
    report => report.sentenceBudgetObservations.reverse(),
    report => { report.sentenceBudgetObservations[1] = { ...report.sentenceBudgetObservations[1], story: 1 }; },
    report => { delete report.candidateRawOutputs[1].story; },
    report => { report.candidateRawOutputs[1].story = 99; },
    report => { report.completeStoryObservations[1].completed = false; },
    report => { report.completeStoryObservations[1].submission = report.completeStoryObservations[0].submission; },
    report => { report.writeTimingObservations.find(record => record.story === 2).story = 1; },
    report => { report.writeTimingObservations.reverse(); },
    report => { const index = report.writeTimingObservations.findIndex(record => record.story === 2); report.writeTimingObservations.push(report.writeTimingObservations.splice(index - 1, 1)[0]); },
    report => { report.writeTimingObservations.find(record => record.story === 2 && record.phase === 'decode-end').decodeTokens = 99; },
    report => { report.writeTimingObservations.find(record => record.story === 2 && record.phase === 'write-success').droppedEvents = 1; },
    report => { report.writeTimingObservations.find(record => record.story === 2 && record.phase === 'write-success').encodedDispatches++; },
    report => { report.writeTimingObservations.find(record => record.story === 2).encodedDispatches = null; },
    report => { report.errors.push({ field: 'sentenceBudgetObservations' }); },
    report => { report.deviceLosses.push({ reason: 'unknown' }); },
  ]) {
    const report = evidence(); mutate(report);
    assert.equal(hasCompleteConnectedBudgetEvidence(report, 3), false, mutate.toString());
  }
});

test('exact-prefix and ordinary-admission gates cannot be replaced by a success-looking budget label', () => {
  for (const mutate of [
    report => { report.outputs[1].raw += ' Invented ending.'; },
    report => { report.outputs[1].acceptedNewStory = false; },
    report => { report.outputs[1].archived = false; },
    report => { report.outputs[1].characterAnchorPreserved = false; },
    report => { report.outputs[1].journal.persistent = true; },
    report => { report.outputs[1].sentenceBudgetOutcome.mode = 'natural-completion'; },
    report => { report.outputs[1].sentenceBudgetOutcome.sentenceCount = 2; },
    report => { report.candidateRawOutputs[1].rawTruncated = true; },
    report => { report.sentenceBudgetObservations[1].stopElapsedMs = 79999; },
    report => { report.sentenceBudgetObservations[1].elapsedMs = 90000; },
    report => { report.sentenceBudgetObservations[1].selectedPrefix = 'Different text.'; },
  ]) {
    const report = evidence(); mutate(report);
    assert.equal(hasCompleteConnectedBudgetEvidence(report, 3), false, mutate.toString());
  }
});

test('sampling coverage is exactly the bounded global prefix, never reset per scene or silently incomplete', () => {
  for (const mutate of [
    report => report.samplingObservations.pop(),
    report => report.samplingObservations.push({ step: 65, settings: { grammarConstrained: false } }),
    report => { report.samplingObservations[1].step = 1; },
    report => { report.samplingObservations[1].settings.grammarConstrained = true; },
    report => { report.samplingObservations = []; },
  ]) {
    const report = evidence(); mutate(report);
    assert.equal(hasCompleteConnectedBudgetEvidence(report, 3), false, mutate.toString());
  }
  const first = evidence(1, [2]);
  assert.equal(first.samplingObservations.length, 3);
  assert.equal(hasCompleteConnectedBudgetEvidence(first, 1), true);
  first.samplingObservations.push({ step: 4, settings: { grammarConstrained: false } });
  assert.equal(hasCompleteConnectedBudgetEvidence(first, 1), false);
});
