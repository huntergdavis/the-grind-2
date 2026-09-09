import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime } from './webgpu-dispatch-diagnostics.mjs';
import { createSubmissionDiagnostics, isCompleteSubmissionDiagnostic, instrumentSubmissionRuntime,
  submissionDiagnosticPlugin } from './webgpu-submission-diagnostics.mjs';

function context(events = []) {
  return { pendingEncoder: null, pendingDispatchCount: 0,
    flushCommands() {
      events.push('flush');
      assert.notEqual(this.pendingEncoder, null);
      this.pendingEncoder = null;
      this.pendingDispatchCount = 0;
    } };
}

test('each ended dispatch flushes once synchronously and reports one immutable counter snapshot', () => {
  const records = [], events = [], diagnostic = createSubmissionDiagnostics(r => records.push(r)), gpu = context(events);
  for (let i = 0; i < 3; i++) {
    gpu.pendingEncoder = {}; gpu.pendingDispatchCount = 1;
    events.push('end'); diagnostic.afterDispatch(gpu); events.push('after');
  }
  diagnostic.report({ comparisonCompleted: true });
  diagnostic.report({ comparisonCompleted: true });
  assert.deepEqual(events, Array.from({ length: 3 }, () => ['end', 'flush', 'after']).flat());
  assert.equal(records.length, 1);
  assert.equal(records[0].encodedDispatches, 3);
  assert.equal(records[0].flushedDispatches, 3);
  assert.equal(isCompleteSubmissionDiagnostic(records[0]), true);
  // The policy remains in effect until worker termination; its emitted snapshot stays fixed.
  gpu.pendingEncoder = {}; gpu.pendingDispatchCount = 1; diagnostic.afterDispatch(gpu);
  assert.equal(records[0].encodedDispatches, 3);
});

test('flush failure retains the original exception and an honest bounded abort summary', () => {
  const records = [], failure = Error('submit failed'), diagnostic = createSubmissionDiagnostics(r => records.push(r));
  const gpu = { pendingEncoder: {}, pendingDispatchCount: 1, flushCommands() { throw failure; } };
  assert.throws(() => diagnostic.afterDispatch(gpu), error => error === failure);
  diagnostic.report({ comparisonCompleted: false });
  assert.equal(records[0].encodedDispatches, 1);
  assert.equal(records[0].flushAttempts, 1);
  assert.equal(records[0].flushedDispatches, 0);
  assert.deepEqual(records[0].errors, ['submit failed']);
  assert.equal(isCompleteSubmissionDiagnostic(records[0]), false);
});

test('complete policy evidence rejects empty, larger-batch, missing-encoder and failed-flush cases', () => {
  const records = [], diagnostic = createSubmissionDiagnostics(r => records.push(r));
  const gpu = context(); gpu.pendingEncoder = {}; gpu.pendingDispatchCount = 2;
  diagnostic.afterDispatch(gpu); diagnostic.report({ comparisonCompleted: true });
  assert.equal(records[0].maxPendingDispatchesBeforeFlush, 2);
  assert.equal(isCompleteSubmissionDiagnostic(records[0]), false);
  const good = { ...records[0], maxPendingDispatchesBeforeFlush: 1 };
  assert.equal(isCompleteSubmissionDiagnostic(good), true);
  for (const change of [{ encodedDispatches: 0 }, { flushAttempts: 2 }, { flushedDispatches: 0 },
    { missingPendingEncoderCount: 1 }, { pendingEncoderAfterFlushCount: 1 }, { invalidPendingCount: 1 },
    { errors: ['failure'] }, { comparisonCompleted: false }, { changesShaders: true }, { addsGPUWaits: true }]) {
    assert.equal(isCompleteSubmissionDiagnostic({ ...good, ...change }), false);
  }
  for (const pending of [null, NaN]) {
    const observations = [], helper = createSubmissionDiagnostics(r => observations.push(r));
    helper.afterDispatch({ pendingEncoder: null, pendingDispatchCount: pending, flushCommands() {} });
    helper.report({ comparisonCompleted: false });
    assert.equal(observations[0].missingPendingEncoderCount, 1);
    assert.equal(observations[0].invalidPendingCount, 1);
    assert.equal(isCompleteSubmissionDiagnostic(observations[0]), false);
  }
});

test('last transform preserves dispatch inspection and changes only queue boundaries on exact source paths', () => {
  const path = resolve('node_modules/@mlc-ai/web-llm/lib/index.js'), original = readFileSync(path, 'utf8');
  const source = instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(original)));
  const transformed = instrumentSubmissionRuntime(source);
  assert.ok(transformed.includes('compute.end();\n                    __tg2SubmissionDiagnostics.afterDispatch(this);'));
  assert.ok(transformed.includes('__tg2SubmissionDiagnostics.report(report);\n    emit(report);'));
  const dispatchAt = transformed.indexOf('__tg2Dispatch.encoded({'), endAt = transformed.indexOf('compute.end();');
  assert.ok(dispatchAt < endAt);
  assert.ok(transformed.indexOf('__tg2SubmissionDiagnostics.afterDispatch(this);') > endAt);
  assert.ok(transformed.indexOf('await __tg2Dispatch.flush();') < transformed.indexOf('__tg2SubmissionDiagnostics.report(report);'));
  for (const marker of ['this.fsoftmaxWithTemperature(', 'pipeline.fsoftmaxWithTemperature(', 'this.fsampleWithTopP(',
    'this.tvm.uniform([1], 0.0, 1.0, this.device)', 'compute.dispatchWorkgroups(', 'yield this.device.sync()',
    'temp_max_shared', 'temp_sum_shared', 'this.device.queue.submit([this.pendingEncoder.finish()]);']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length, marker);
  }
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const plugin = submissionDiagnosticPlugin([path]);
  assert.equal(plugin.transform(source, path).code, transformed);
  assert.equal(plugin.transform(source, path + '?v=1').code, transformed);
  assert.equal(plugin.transform(source, path + '.backup'), null);
  assert.throws(() => instrumentSubmissionRuntime(original), /dispatch transform/);
  assert.throws(() => instrumentSubmissionRuntime(transformed), /dispatch transform/);
  assert.throws(() => instrumentSubmissionRuntime(source.replace('compute.end();', 'CHANGED')), /no longer matches/);
  assert.throws(() => instrumentSubmissionRuntime(source + '\ncompute.end();'), /no longer matches/);
  assert.throws(() => instrumentSubmissionRuntime(source.replace('emit(report);', 'CHANGED')), /no longer matches/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
