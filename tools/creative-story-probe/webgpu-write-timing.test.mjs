import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime } from './webgpu-dispatch-diagnostics.mjs';
import { instrumentSubmissionRuntime } from './webgpu-submission-diagnostics.mjs';
import { instrumentCompleteStoryRuntime, instrumentCompleteStoryWorker } from './webgpu-complete-story.mjs';
import { instrumentShaderRepairRuntime } from './webgpu-shader-repair.mjs';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { createWriteTimingDiagnostics, noteWriteTimingWorker, isCompleteWriteTiming,
  instrumentWriteTimingRuntime, instrumentWriteTimingWorker, writeTimingPlugin } from './webgpu-write-timing.mjs';

function fixture() {
  const records = [], native = { prefillTokens: 0, prefillMs: 0, decodeTokens: 0, decodeMs: 0 };
  let clock = 1000, dispatches = 0;
  const pipeline = { getCurRoundPrefillTotalTokens: () => native.prefillTokens,
    getCurRoundPrefillTotalTime: () => native.prefillMs / 1000,
    getCurRoundDecodingTotalTokens: () => native.decodeTokens,
    getCurRoundDecodingTotalTime: () => native.decodeMs / 1000 };
  const helper = createWriteTimingDiagnostics(r => records.push(r), () => clock, () => dispatches);
  const advance = ms => { clock += ms; dispatches++; };
  const start = () => {
    helper.worker('write-start'); helper.worker('reset-start'); advance(2); helper.worker('reset-end');
    helper.worker('create-start'); advance(3); helper.worker('create-end'); helper.begin('prefill', pipeline);
  };
  const prefill = () => {
    advance(30000); native.prefillTokens = 350; native.prefillMs = 30000;
    helper.end('prefill', pipeline); helper.worker('chunk', 'Mara');
  };
  const decode = () => {
    helper.begin('decode', pipeline); advance(700);
    native.decodeTokens++; native.decodeMs += 700; helper.end('decode', pipeline);
    helper.worker('chunk', 'Mara and Rowan.');
  };
  const finish = () => { helper.worker('stream-drained', 'Mara and Rowan.'); helper.worker('write-success'); };
  return { records, native, pipeline, helper, advance, start, prefill, decode, finish };
}

test('fake-clock trace separates reset, prefill, each decode, interrupt, drainage, and settlement', () => {
  const f = fixture(); f.start(); f.prefill();
  for (let i = 0; i < 9; i++) f.decode();
  f.helper.worker('interrupt-start'); f.advance(2); f.helper.worker('interrupt-return');
  f.advance(3); f.finish();
  assert.equal(isCompleteWriteTiming(f.records), true);
  const prefill = f.records.find(r => r.phase === 'prefill-end');
  assert.equal(prefill.durationMs, 30000); assert.equal(prefill.prefillTokens, 350);
  const decodes = f.records.filter(r => r.phase === 'decode-end');
  assert.equal(decodes.length, 9);
  assert.deepEqual(decodes.map(r => r.durationMs), Array(9).fill(700));
  assert.equal(decodes.at(-1).decodeMs, 6300);
  assert.deepEqual(f.records.filter(r => r.phase === 'partial-text').map(r => r.textChunks), [1, 8]);
  assert.equal(f.records.at(-1).elapsedMs, 36310);
  assert.equal(f.records.at(-1).decodedSteps, 9);
  const count = f.records.length; f.helper.worker('write-success'); f.helper.worker('chunk', 'late');
  assert.equal(f.records.length, count);
});

test('timeout evidence remains partial and failed or malformed traces never count as completion', () => {
  const f = fixture(); f.start();
  assert.equal(isCompleteWriteTiming(f.records), false);
  f.prefill(); f.decode(); f.helper.begin('decode', f.pipeline); f.advance(90000);
  assert.equal(isCompleteWriteTiming(f.records), false);
  assert.equal(f.records.find(r => r.phase === 'partial-text').partialText, 'Mara');
  f.helper.worker('write-error', undefined, Error('original timeout'));
  assert.equal(f.records.at(-1).error, 'original timeout');
  assert.equal(isCompleteWriteTiming(f.records), false);
  const good = fixture(); good.start(); good.prefill(); good.decode(); good.finish();
  assert.equal(isCompleteWriteTiming(good.records), true);
  for (const invalid of [null, [], good.records.slice(0, -1), [...good.records].reverse(),
    good.records.map(r => r.phase === 'stream-drained' ? { ...r, phase: 'interrupt-error' } : r),
    good.records.map(r => r.phase === 'write-success' ? { ...r, droppedEvents: 1 } : r),
    good.records.map(r => r.phase === 'decode-end' ? { ...r, decodeTokens: 4 } : r),
    good.records.map(r => r.phase === 'prefill-end' ? { ...r, durationMs: null } : r)]) {
    assert.equal(isCompleteWriteTiming(invalid), false);
  }
});

test('event count, partial text, serialized size, and error text stay bounded without altering inference', () => {
  const f = fixture(); f.start(); f.prefill();
  f.helper.worker('stream-drained', '\u0000'.repeat(5000));
  const partial = f.records.at(-1);
  assert.equal(partial.partial, true); assert.equal(partial.partialTextTruncated, true);
  assert.ok(partial.partialText.length <= 3000); assert.ok(JSON.stringify(partial).length <= 4000);
  for (let i = 0; i < 200; i++) f.decode();
  f.helper.worker('write-error', undefined, Error('x'.repeat(1000)));
  assert.equal(f.records.length, 128);
  assert.ok(f.records.at(-1).droppedEvents > 0);
  assert.equal(f.records.at(-1).error.length, 400);
  assert.equal(isCompleteWriteTiming(f.records), false);
  assert.doesNotThrow(() => noteWriteTimingWorker('write-error', undefined, Error('original'), {}));
  assert.doesNotThrow(() => noteWriteTimingWorker('write-error', undefined, Error('original'), {
    __tg2WriteTiming: { worker() { throw Error('observer failure'); } },
  }));
  const throwing = createWriteTimingDiagnostics(() => { throw Error('transport failure'); }, () => 0);
  assert.doesNotThrow(() => throwing.worker('write-start'));
  assert.doesNotThrow(() => throwing.worker('write-error', undefined, Error('original')));
});

test('serialized helper is self-contained and ignores non-write warmup boundaries', () => {
  const factory = new Function(`return (${createWriteTimingDiagnostics.toString()});`)();
  const records = [], helper = factory(r => records.push(r), () => 10);
  helper.begin('prefill', {}); helper.end('prefill', {}); helper.worker('chunk', 'warmup');
  assert.deepEqual(records, []);
  noteWriteTimingWorker('write-start', undefined, undefined, { __tg2WriteTiming: helper });
  assert.equal(records[0].phase, 'write-start');
});

test('exact runtime and worker hooks preserve generation, settings, interruption, and error replies', () => {
  const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const workerPath = resolve('src/narrator/creative-writer.worker.ts');
  const runtime = readFileSync(runtimePath, 'utf8'), originalWorker = readFileSync(workerPath, 'utf8');
  const source = instrumentShaderRepairRuntime(instrumentCompleteStoryRuntime(instrumentSubmissionRuntime(
    instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(runtime))))));
  const adaptedWorker = instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker));
  const transformed = instrumentWriteTimingRuntime(source), worker = instrumentWriteTimingWorker(adaptedWorker);
  for (const marker of ['yield __await(this.prefill(request, pipeline, chatConfig, genConfig));',
    'yield __await(this.decode(pipeline, genConfig));', 'yield this.device.sync();',
    'this.device.queue.onSubmittedWorkDone()', 'compute.dispatchWorkgroups(', 'this.tvm.uniform([1], 0.0, 1.0, this.device)']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length, marker);
  }
  for (const marker of ['stream: true, max_tokens: 68, temperature: 0.7, top_p: 0.85, seed: 7',
    'await model.interruptGenerate();', 'for await (const chunk of chunks)',
    'workerScope.postMessage({ type: "result", id, text });',
    'workerScope.postMessage({ type: "error", id, ...(error instanceof WriterSetupError ? { code: error.code } : {}) });']) {
    assert.equal(worker.split(marker).length, adaptedWorker.split(marker).length, marker);
  }
  assert.ok(worker.includes('__tg2FinishCompleteStoryWorker(true);\n      __tg2NoteWriteTiming("write-success");'));
  assert.ok(worker.includes('__tg2NoteWriteTiming("write-error", undefined, error); __tg2FinishCompleteStoryWorker(false, error);'));
  const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  const plugin = writeTimingPlugin(process.cwd(), [runtimePath]);
  assert.equal(plugin.transform(source, runtimePath + '?worker_file').code, transformed);
  assert.equal(plugin.transform(adaptedWorker, workerPath).code, worker);
  assert.equal(plugin.transform(source, runtimePath + '.backup'), null);
  assert.throws(() => instrumentWriteTimingRuntime(runtime), /repaired complete-story/);
  assert.throws(() => instrumentWriteTimingRuntime(transformed), /exactly once/);
  assert.throws(() => instrumentWriteTimingRuntime(source.replace('yield __await(this.decode(pipeline, genConfig));', 'CHANGED')), /no longer matches/);
  assert.throws(() => instrumentWriteTimingWorker(originalWorker), /adapted complete-story/);
  assert.throws(() => instrumentWriteTimingWorker(worker), /exactly once/);
  assert.throws(() => instrumentWriteTimingWorker(adaptedWorker.replace('for await (const chunk of chunks) {', 'CHANGED')), /no longer matches/);
  assert.equal(readFileSync(runtimePath, 'utf8'), runtime);
  assert.equal(readFileSync(workerPath, 'utf8'), originalWorker);
});
