import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebgpuV1Arguments, hasCompleteGrammarArrivalEvidence } from './run-webgpu-v1.mjs';
import { arrivalGrammarIdentity } from './arrival-grammar-adapter.mjs';

const args = ['--run', '--candidate-diagnostic', '--cache-only', '--inspect-model-buffer',
  '--inspect-dispatch', '--submit-each-dispatch', '--complete-story', '--repair-softmax-race',
  '--replay-arrival', '--compact-arrival', '--grounded-arrival', '--sentence-grammar'];
// Authored test fixture only; never candidate output or prompt prose.
const prose = 'Mara steadies her trembling fingers beside Rowan, relief shadowed by worry over his injury. '
  + 'She holds her breath, uncertain whether arrival can quiet the fear she carries.';
const evidence = () => ({
  outputs: [{ status: 'completed', raw: prose, acceptedNewStory: true, archived: false }],
  arrivalGrammarObservations: [
    { kind: 'arrival-grammar-request', ...arrivalGrammarIdentity },
    { kind: 'arrival-grammar-native', ...arrivalGrammarIdentity, stage: 'first-sampled-token-accepted',
      accepted: true, grammarInitMs: 20, grammarPerTokenMs: 1, error: null },
  ],
  samplingObservations: [{ settings: { grammarConstrained: true } }], errors: [],
});

test('sentence grammar requires the entire grounded cache-only safety chain', () => {
  assert.equal(parseWebgpuV1Arguments(args).sentenceGrammar, true);
  assert.equal(parseWebgpuV1Arguments(args.slice(0, -1)).sentenceGrammar, false);
  for (const removed of args.slice(0, -1)) {
    assert.throws(() => parseWebgpuV1Arguments(args.filter(arg => arg !== removed)), /Usage:/u, removed);
  }
  for (const extra of ['--sentence-grammar', '--allow-model-download', '--connected-story', '--observe-pre-sort']) {
    assert.throws(() => parseWebgpuV1Arguments([...args, extra]), /Usage:/u, extra);
  }
});

test('grammar qualification requires actual native masking, complete raw shape and ordinary admission', () => {
  assert.equal(hasCompleteGrammarArrivalEvidence(evidence()), true);
  const mutations = [
    report => { report.outputs[0].raw += ' A third sentence follows.'; },
    report => { report.outputs[0].raw = null; },
    report => { report.outputs[0].status = 'failed'; },
    report => { report.outputs[0].acceptedNewStory = false; },
    report => { report.outputs[0].archived = true; },
    report => { report.arrivalGrammarObservations.pop(); },
    report => { report.arrivalGrammarObservations[1].accepted = false; },
    report => { report.samplingObservations = []; },
    report => { report.samplingObservations[0].settings.grammarConstrained = false; },
    report => { report.errors.push({ field: 'arrivalGrammarObservations' }); },
  ];
  for (const mutate of mutations) {
    const report = evidence(); mutate(report);
    assert.equal(hasCompleteGrammarArrivalEvidence(report), false, mutate.toString());
  }
  assert.equal(hasCompleteGrammarArrivalEvidence({}), false);
});
