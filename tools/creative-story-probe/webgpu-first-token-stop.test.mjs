import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { createDeviceLossWatch, hasCompleteFirstTokenEvidence, isExpectedFirstTokenStop, instrumentFirstTokenStop, firstTokenStopPlugin } from './webgpu-first-token-stop.mjs';

const stoppedReply = { status: 'failed', raw: null, cleaned: null,
  error: 'Error: Creative writer could not finish. Load it again to retry.' };
const report = () => ({ firstTokenStops: [{ reason: 'comparison-complete', afterSample: 1 }],
  samplingObservations: [{}], modelBufferObservations: [{ comparisonCompleted: true, error: null,
    gpuErrors: { validation: null, uncaptured: [] },
    cleanup: { errors: [], synchronized: true, listenerRemoved: true, tensorsAllocated: 8, tensorsDisposed: 8 } }],
  errors: [], deviceLosses: [], dispatchObservations: ['live', 'fresh'].map(label => ({ label,
    kind: 'softmax-shader-dispatch', scopeCallError: null, scopeTruncated: false,
    diagnosticError: null, metadataTruncated: false, wgslTruncated: false, wgslSha256: 'a'.repeat(64) })) });

test('intentional stop requires completed evidence and preserves the actual failed worker reply', () => {
  const before = structuredClone(stoppedReply);
  assert.equal(isExpectedFirstTokenStop(report(), stoppedReply), true);
  assert.deepEqual(stoppedReply, before);
  for (const change of [r => r.firstTokenStops.pop(), r => r.firstTokenStops.push(r.firstTokenStops[0]),
    r => r.firstTokenStops[0].reason = 'other', r => r.samplingObservations.push({}),
    r => r.modelBufferObservations[0].comparisonCompleted = false,
    r => r.modelBufferObservations[0].cleanup.tensorsDisposed--,
    r => r.modelBufferObservations[0].cleanup.synchronized = false,
    r => r.modelBufferObservations[0].gpuErrors.validation = { message: 'bad binding' },
    r => r.modelBufferObservations[0].gpuErrors.uncaptured.push({ message: 'native error' }),
    r => r.dispatchObservations[0].diagnosticError = 'missing metadata',
    r => r.dispatchObservations[0].wgslHashError = 'hash failed',
    r => r.dispatchObservations[0].scopeCallError = 'call failed',
    r => r.dispatchObservations[0].scopeTruncated = true,
    r => r.dispatchObservations[0].wgslSha256 = '',
    r => r.errors.push({ error: 'GPU error' }), r => r.deviceLosses.push({ reason: 'unknown' }),
    r => r.dispatchObservations.pop(), r => r.dispatchObservations = Array(17).fill({ label: 'live' })]) {
    const value = report(); change(value);
    assert.equal(isExpectedFirstTokenStop(value, stoppedReply), false);
  }
  for (const reply of [{ ...stoppedReply, status: 'completed' }, { ...stoppedReply, raw: 'story' },
    { ...stoppedReply, error: 'GPU scene exceeded 90s' }]) assert.equal(isExpectedFirstTokenStop(report(), reply), false);
  const noDispatch = report();
  noDispatch.dispatchObservations[0] = { label: 'live', kind: 'softmax-call-without-dispatch',
    scopeCallError: null, scopeTruncated: false, scopeObservedDispatches: 0, scopeRecordedDispatches: 0 };
  assert.equal(isExpectedFirstTokenStop(noDispatch, stoppedReply), true);
});

test('full stories retain first-comparison evidence without requiring a first-token stop', () => {
  for (const count of [1, 2, 64]) {
    const value = report();
    value.firstTokenStops = [];
    value.samplingObservations = Array.from({ length: count }, () => ({}));
    assert.equal(hasCompleteFirstTokenEvidence(value), true);
    assert.equal(isExpectedFirstTokenStop(value, stoppedReply), false);
  }
  for (const change of [r => r.samplingObservations = [],
    r => r.samplingObservations = Array(65).fill({}),
    r => r.modelBufferObservations[0].gpuErrors.uncaptured.push({ message: 'decode error' }),
    r => r.dispatchObservations[0].wgslSha256 = undefined]) {
    const value = report(); change(value);
    assert.equal(hasCompleteFirstTokenEvidence(value), false);
  }
});

test('native device loss retains bounded reason/message without changing the device', async () => {
  let lost;
  const gpu = { lost: new Promise(resolve => { lost = resolve; }) };
  const pipeline = { tvm: { lib: { webGPUContext: { device: gpu } } } };
  const events = [], observer = createDeviceLossWatch(record => events.push(record));
  observer.start(pipeline);
  lost({ reason: 'unknown', message: 'x'.repeat(1500) });
  await gpu.lost;
  assert.deepEqual(events, [{ reason: 'unknown', message: 'x'.repeat(1000) }]);
  observer.stop(pipeline);
  assert.throws(() => observer.start({}), /unavailable/);
});

test('device loss after the observation window is not attributed to the diagnostic', async () => {
  let lost;
  const gpu = { lost: new Promise(resolve => { lost = resolve; }) };
  const pipeline = { tvm: { lib: { webGPUContext: { device: gpu } } } };
  const events = [], observer = createDeviceLossWatch(record => events.push(record));
  observer.start(pipeline); observer.stop(pipeline);
  lost({ reason: 'destroyed', message: 'cleanup' }); await gpu.lost;
  assert.deepEqual(events, []);
});

test('controlled stop follows comparison and closes the observation window on every prefill exit', () => {
  const path = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const original = readFileSync(path, 'utf8');
  const source = '// TG2_DISPATCH_DIAGNOSTIC \n' + instrumentModelBufferRuntime(instrumentSamplingRuntime(original));
  const transformed = instrumentFirstTokenStop(source);
  assert.ok(transformed.includes('const __tg2FirstTokenStopResult = yield __tg2ModelBuffer.compare('));
  assert.ok(transformed.indexOf("console.debug('TG2_FIRST_TOKEN_STOP '") > transformed.indexOf('const __tg2FirstTokenStopResult ='));
  assert.ok(transformed.includes('} finally { __tg2FirstTokenStopWatch.stop(this); }'));
  assert.equal(transformed.split('this.tvm.uniform([1], 0.0, 1.0, this.device)').length, source.split('this.tvm.uniform([1], 0.0, 1.0, this.device)').length);
  const plugin = firstTokenStopPlugin([path]);
  assert.equal(plugin.transform(source, path + '?worker_file').code, transformed);
  assert.equal(plugin.transform(source, path + '.backup'), null);
  assert.throws(() => instrumentFirstTokenStop(original), /dispatch instrumentation/);
  assert.throws(() => instrumentFirstTokenStop(transformed), /exactly once/);
  assert.throws(() => instrumentFirstTokenStop(source.replace('yield __tg2ModelBuffer.compare(', 'CHANGED(')), /no longer matches/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
