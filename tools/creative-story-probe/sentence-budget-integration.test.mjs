import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebgpuV1Arguments, hasCompleteSentenceBudgetArrivalEvidence } from './run-webgpu-v1.mjs';

const args = ['--run', '--candidate-diagnostic', '--cache-only', '--inspect-model-buffer',
  '--inspect-dispatch', '--submit-each-dispatch', '--complete-story', '--repair-softmax-race',
  '--replay-arrival', '--compact-arrival', '--grounded-arrival', '--sentence-budget'];

test('sentence budget requires the entire grounded cache-only chain, without grammar or extra scene modes', () => {
  const selected = parseWebgpuV1Arguments(args);
  assert.equal(selected.sentenceBudget, true);
  assert.equal(selected.sentenceGrammar, false);
  assert.equal(parseWebgpuV1Arguments(args.slice(0, -1)).sentenceBudget, false);
  for (const removed of args.slice(0, -1)) {
    assert.throws(() => parseWebgpuV1Arguments(args.filter(arg => arg !== removed)), /Usage:/u, removed);
  }
  for (const extra of ['--sentence-budget', '--sentence-grammar', '--allow-model-download',
    '--connected-story', '--observe-pre-sort', '--production-scenes']) {
    assert.throws(() => parseWebgpuV1Arguments([...args, extra]), /Usage:/u, extra);
  }
});

test('missing execution evidence or ordinary admission cannot qualify a budget candidate', () => {
  for (const report of [{}, { outputs: [] }, { outputs: [{ status: 'failed' }] },
    { outputs: [{ status: 'completed', acceptedNewStory: false, archived: false }] },
    { outputs: [{ status: 'completed', acceptedNewStory: true, archived: true }] }]) {
    assert.equal(hasCompleteSentenceBudgetArrivalEvidence(report), false);
  }
});

test('budget qualification requires exact settled-prefix provenance and unconstrained sampling', () => {
  // Authored fixture for orchestration only, not candidate output or prompt prose.
  const prefix = "Mara steadied Rowan's hand, relieved they had arrived.";
  const source = prefix + ' She worried';
  const raw = '<think>\n\n</think>\n\n' + source;
  const evidence = () => ({
    outputs: [{ status: 'completed', raw: prefix, acceptedNewStory: true, archived: false }],
    candidateRawOutputs: [{ raw, rawCharacters: raw.length, rawTruncated: false }],
    sentenceBudgetObservations: [{
      kind: 'sentence-budget-decision', stage: 'worker-success-after-stream-drain',
      mode: 'completed-sentence-budget-fallback', selectedPrefix: prefix, sentenceCount: 1,
      elapsedMs: 80020, stopElapsedMs: 80000, originalCharacters: source.length,
      discardedCharacters: source.length - prefix.length, rawTruncated: false,
      stopOriginalCharacters: source.length, stopDiscardedCharacters: source.length - prefix.length,
      hygieneScope: 'whole-raw-stream-after-drain',
    }],
    samplingObservations: [{ settings: { grammarConstrained: false } }], errors: [],
  });
  assert.equal(hasCompleteSentenceBudgetArrivalEvidence(evidence()), true);
  for (const mutate of [
    report => { report.outputs[0].raw += ' Invented completion.'; },
    report => { report.candidateRawOutputs[0].rawTruncated = true; },
    report => { report.sentenceBudgetObservations = []; },
    report => { report.sentenceBudgetObservations[0].stopElapsedMs = 79999; },
    report => { report.sentenceBudgetObservations[0].elapsedMs = 90000; },
    report => { report.samplingObservations = []; },
    report => { report.samplingObservations[0].settings.grammarConstrained = true; },
    report => { report.errors.push({ field: 'sentenceBudgetObservations' }); },
  ]) {
    const report = evidence(); mutate(report);
    assert.equal(hasCompleteSentenceBudgetArrivalEvidence(report), false, mutate.toString());
  }
});
