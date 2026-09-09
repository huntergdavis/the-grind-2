import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createSamplingDiagnostics, compareSortingProbabilities, observeSortingSnapshot, instrumentSamplingRuntime, isCandidateSamplingRequest, samplingDiagnosticPlugin } from './webgpu-sampling-diagnostics.mjs';

const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
const source = readFileSync(runtimePath, 'utf8');
const settings = { temperature: 0.7, topP: 0.85, repetitionPenalty: 1,
  frequencyPenalty: 0, presencePenalty: 0, logitBiasPresent: false, grammarConstrained: false };

test('logit observations preserve every input bit and report finite and nonfinite boundaries', () => {
  const words = new Uint32Array([0x80000000, 0x3f800000, 0xc0000000, 0x7fc01234, 0x7f800000, 0xff800000]);
  const data = new Float32Array(words.buffer);
  const original = [...words];
  const records = [], observer = createSamplingDiagnostics(record => records.push(record));
  observer.beforeProcessor(data);
  observer.afterProcessor(data);
  const probs = new Float32Array([0.25, 0.75]);
  observer.sampled(probs, 1, settings);
  assert.deepEqual([...words], original);
  assert.deepEqual([...probs], [0.25, 0.75]);
  assert.deepEqual(records[0].beforeProcessor, { vocabularySize: 6, nanCount: 1,
    positiveInfinityCount: 1, negativeInfinityCount: 1, finiteMin: -2, finiteMax: 1, argmax: 1 });
  assert.deepEqual(records[0].afterProcessor, records[0].beforeProcessor);
  assert.deepEqual(records[0].settings, settings);
});

test('probability checks distinguish normalized samples and tokens outside the top-p nucleus', () => {
  const observer = createSamplingDiagnostics(() => {});
  const normal = observer.sampled(new Float32Array([0.9, 0.06, 0.04]), 0, settings);
  assert.equal(normal.probabilities.normalized, true);
  assert.ok(normal.probabilities.normalizationError < 1e-6);
  assert.equal(normal.probabilities.positiveCount, 3);
  assert.equal(normal.probabilities.argmax, 0);
  assert.equal(normal.strictlyGreaterProbabilityMass, 0);
  assert.equal(normal.outsideTopPNucleus, false);
  const outside = observer.sampled(new Float32Array([0.9, 0.06, 0.04]), 1, settings);
  assert.equal(outside.sampledTokenInRange, true);
  assert.ok(outside.sampledProbability > 0);
  assert.ok(outside.strictlyGreaterProbabilityMass > 0.89);
  assert.equal(outside.outsideTopPNucleus, true);
  const ties = observer.sampled(new Float32Array([0.5, 0.5]), 1, { ...settings, topP: 0.4 });
  assert.equal(ties.strictlyGreaterProbabilityMass, 0);
  assert.equal(ties.outsideTopPNucleus, false);
});

test('invalid probabilities and invalid token IDs remain explicit rather than valid-looking null numbers', () => {
  const observer = createSamplingDiagnostics(() => {});
  for (const data of [new Float32Array([0.2, 0.2]), new Float32Array([-0.1, 1.1]), new Float32Array([])]) {
    const record = observer.sampled(data, 0, settings);
    assert.equal(record.probabilities.normalized, false);
    assert.equal(record.outsideTopPNucleus, null);
  }
  const nonfinite = observer.sampled(new Float32Array([NaN, Infinity, -Infinity]), 0, settings);
  assert.equal(nonfinite.probabilities.sum, null);
  assert.equal(nonfinite.probabilities.normalizationError, null);
  assert.equal(nonfinite.probabilities.finiteMin, null);
  assert.equal(nonfinite.probabilities.argmax, null);
  assert.equal(nonfinite.sampledProbability, 'NaN');
  for (const token of [-1, 2, 0.5, NaN, Infinity]) {
    const record = observer.sampled(new Float32Array([0, 1]), token, settings);
    assert.equal(record.sampledTokenInRange, false);
    assert.equal(record.sampledProbability, null);
    assert.equal(record.outsideTopPNucleus, null);
  }
  const zero = observer.sampled(new Float32Array([0, 1]), 0, settings);
  assert.equal(zero.sampledProbability, 0);
  assert.equal(zero.outsideTopPNucleus, true);
});

test('observation stops at 64, clears per-step summaries, and cannot throw through an emitter', () => {
  const records = [], observer = createSamplingDiagnostics(record => records.push(record));
  const data = new Float32Array([1]);
  observer.beforeProcessor(data);
  observer.afterProcessor(data);
  observer.sampled(data, 0, settings);
  for (let i = 1; i < 64; i++) observer.sampled(data, 0, settings);
  assert.equal(observer.canObserve(), false);
  observer.beforeProcessor(new Float32Array([99]));
  observer.afterProcessor(new Float32Array([99]));
  assert.equal(observer.sampled(data, 12, settings), undefined);
  assert.equal(records.length, 64);
  assert.equal(records[63].step, 64);
  assert.equal(records[63].sampledToken, 0);
  assert.equal(records[1].beforeProcessor, null);
  assert.equal(records[1].afterProcessor, null);
  assert.doesNotThrow(() => createSamplingDiagnostics(() => { throw Error('observer'); }).sampled(data, 0, settings));
});

test('candidate-only request gating excludes warmups, baseline writes, and direction requests', () => {
  assert.equal(isCandidateSamplingRequest({ enable_thinking: false, max_tokens: 68 }), true);
  for (const config of [undefined, null, {}, { max_tokens: 68 }, { enable_thinking: true, max_tokens: 68 },
    { enable_thinking: false, max_tokens: 1 }, { enable_thinking: false, max_tokens: 64 }]) {
    assert.equal(isCandidateSamplingRequest(config), false);
  }
});

test('runtime instrumentation retains RNG, scores, device synchronization, and existing sample choice', () => {
  const transformed = instrumentSamplingRuntime(source);
  for (const marker of ['yield this.device.sync();', 'this.tvm.uniform([1], 0.0, 1.0, this.device)',
    'logitsOnGPU.copyFrom(logitsOnCPUArray);', 'this.fsampleWithTopP(', 'sampledToken = sampledTokensHost.toArray()[0];']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length, marker);
  }
  assert.ok(transformed.includes('TG2_SAMPLING_DIAGNOSTIC '));
  assert.ok(transformed.includes('if ((logprobs && top_logprobs > 0) || __tg2ObserveSampling)'));
  assert.ok(transformed.includes('__tg2ShouldObserveSampling(genConfig) && __tg2SamplingDiagnostics.canObserve()'));
  assert.ok(transformed.indexOf('__tg2SamplingDiagnostics.beforeProcessor(logitsOnCPUArray);')
    < transformed.indexOf('logitsOnCPUArray = this.logitProcessor.processLogits(logitsOnCPUArray);'));
  assert.ok(transformed.indexOf('__tg2SamplingDiagnostics.afterProcessor(logitsOnCPUArray);')
    > transformed.indexOf('logitsOnCPUArray = this.logitProcessor.processLogits(logitsOnCPUArray);'));
  assert.equal(readFileSync(runtimePath, 'utf8'), source);
});

test('source marker drift, duplication, and double instrumentation fail closed', () => {
  for (const marker of ['let logitsOnCPUArray = (this.logitsOnCPU.toArray());',
    'logitsOnCPUArray = this.logitProcessor.processLogits(logitsOnCPUArray);',
    'if (logprobs && top_logprobs > 0) {\n                this.updateLogitsOnCPU(probs);\n            }',
    'sampledToken = sampledTokensHost.toArray()[0];', 'const outputTokenBegin = performance.now();']) {
    assert.throws(() => instrumentSamplingRuntime(source.replace(marker, 'CHANGED')), /no longer matches/);
    assert.throws(() => instrumentSamplingRuntime(source + '\n' + marker), /no longer matches/);
  }
  assert.throws(() => instrumentSamplingRuntime(instrumentSamplingRuntime(source)), /already installed/);
});

test('Vite instrumentation is limited to exactly the supplied runtime paths', () => {
  const second = '/owned/staged/node_modules/@mlc-ai/web-llm/lib/index.js';
  const plugin = samplingDiagnosticPlugin([runtimePath, second]);
  for (const path of [runtimePath, second, runtimePath + '?v=123']) {
    assert.deepEqual(plugin.transform(source, path), { code: instrumentSamplingRuntime(source), map: null });
  }
  for (const path of [runtimePath + '.backup', '/other/node_modules/@mlc-ai/web-llm/lib/index.js', '/src/main.ts']) {
    assert.equal(plugin.transform(source, path), null);
  }
});

test('default transformed runtime remains byte-identical when pre-sort observation is not requested', () => {
  assert.equal(createHash('sha256').update(instrumentSamplingRuntime(source)).digest('hex'),
    'f68d2e98600b6b9852cddb88b5c37405f418b1f6e1e1dc21da50215d99ea5d59');
  assert.equal(instrumentSamplingRuntime(source, { beforeSort: false }), instrumentSamplingRuntime(source));
});

test('sorting comparison reports exact bits, nonfinite changes, and bounded difference metadata', () => {
  const data = new Float32Array([0.25, 0.75]);
  const summary = createSamplingDiagnostics(() => {}).sampled(data, 1, settings).probabilities;
  const same = compareSortingProbabilities(data, data.slice(), summary);
  assert.equal(same.beforeSorting.normalized, true);
  assert.equal(same.unchangedAfterSorting, true);
  assert.equal(same.sortingDifference.firstDifferenceIndex, null);
  const changed = compareSortingProbabilities(data, new Float32Array([0, Infinity]), summary);
  assert.equal(changed.unchangedAfterSorting, false);
  assert.equal(changed.sortingDifference.mismatchedValues, 2);
  assert.equal(changed.sortingDifference.firstDifferenceIndex, 0);
  assert.equal(changed.sortingDifference.nonfiniteDifferenceCount, 1);
  assert.equal(changed.sortingDifference.maxFiniteAbsoluteDifference, 0.25);
  assert.deepEqual([...data], [0.25, 0.75]);
  assert.equal(compareSortingProbabilities(new Float32Array([-0]), new Float32Array([0]), summary).unchangedAfterSorting, false);
});

test('the extra CPU snapshot is disposed even when reading or observation fails', () => {
  for (const failure of ['none', 'read', 'after', 'observe']) {
    let disposed = 0;
    const tensor = { toArray() { if (failure === 'read') throw Error('read'); return new Float32Array([0.25, 0.75]); },
      dispose() { disposed++; } };
    const run = () => observeSortingSnapshot(tensor, () => {
      if (failure === 'after') throw Error('after');
      return new Float32Array([0.25, 0.75]);
    }, 1, settings, fields => {
      if (failure === 'observe') throw Error('observe');
      assert.equal(fields.unchangedAfterSorting, true);
    });
    if (failure === 'none') run(); else assert.throws(run, new RegExp(failure));
    assert.equal(disposed, 1);
  }
});

test('opt-in pre-sort copy precedes argsort, reuses synchronization, and records exact tensor metadata', () => {
  const transformed = instrumentSamplingRuntime(source, { beforeSort: true });
  const queued = transformed.indexOf('__tg2BeforeSortingCPU = this.tvm.detachFromCurrentScope');
  const sorted = transformed.indexOf('const argsortResults = this.fargsortProbs(probs);');
  const sampled = transformed.indexOf('sampledToken = sampledTokensHost.toArray()[0];');
  assert.ok(queued > transformed.indexOf('probs = probs.view([numProbs, this.fullVocabSize]);'));
  assert.ok(queued < sorted && sorted < sampled);
  assert.ok(transformed.indexOf('observeSortingSnapshot(__tg2BeforeSortingCPU,') > sampled);
  assert.ok(transformed.includes('shape: [...logitsOnGPU.shape], dtype: logitsOnGPU.dtype'));
  assert.ok(transformed.includes('byteOffset: logitsOnGPU.byteOffset, fullVocabSize: this.fullVocabSize'));
  for (const marker of ['yield this.device.sync();', 'this.tvm.uniform([1], 0.0, 1.0, this.device)', 'this.fsampleWithTopP(']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length);
  }
  assert.equal(samplingDiagnosticPlugin([runtimePath], { beforeSort: true }).transform(source, runtimePath).code, transformed);
  assert.throws(() => instrumentSamplingRuntime(source.replace('probs = probs.view([numProbs, this.fullVocabSize]);', 'CHANGED'), { beforeSort: true }), /no longer matches/);
});
