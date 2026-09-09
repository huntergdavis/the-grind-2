import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime } from './webgpu-dispatch-diagnostics.mjs';
import { createSubmissionDiagnostics, instrumentSubmissionRuntime } from './webgpu-submission-diagnostics.mjs';
import { createDeviceLossWatch } from './webgpu-first-token-stop.mjs';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { createCompleteStoryDiagnostics, isCompleteStoryDiagnostic, finishCompleteStoryWorker,
  instrumentCompleteStoryRuntime, instrumentCompleteStoryWorker, completeStoryPlugin } from './webgpu-complete-story.mjs';

const counters = () => ({ encodedDispatches: 650, flushAttempts: 650, flushedDispatches: 650,
  maxPendingDispatchesBeforeFlush: 1, missingPendingEncoderCount: 0, pendingEncoderAfterFlushCount: 0,
  invalidPendingCount: 0, errors: [] });
function device() {
  let lose;
  const lost = new Promise(resolve => { lose = resolve; });
  return { lose, lost, pipeline: { tvm: { lib: { webGPUContext: { device: { lost } } } } } };
}

test('loss observation spans prefill through later decode and stops at write settlement', async () => {
  const records = [], losses = [], d = device();
  const helper = createCompleteStoryDiagnostics(counters, createDeviceLossWatch, r => records.push(r), r => losses.push(r));
  helper.start(d.pipeline);
  // There is no stop at the first-comparison/prefill boundary.
  await Promise.resolve();
  d.lose({ reason: 'unknown', message: 'later decode lost' }); await d.lost;
  helper.finish(false, Error('original write failed')); helper.finish(true);
  assert.equal(records.length, 1);
  assert.deepEqual(losses, [{ reason: 'unknown', message: 'later decode lost' }]);
  assert.deepEqual(records[0].deviceLosses, losses);
  assert.equal(records[0].watchStarted, true);
  assert.equal(records[0].watchStopped, true);
  assert.equal(isCompleteStoryDiagnostic(records[0]), false);
});

test('final submission snapshot includes decode while the earlier first-comparison report stays unchanged', async () => {
  const first = [], final = [], d = device(), submission = createSubmissionDiagnostics(r => first.push(r));
  const helper = createCompleteStoryDiagnostics(() => submission.snapshot(), createDeviceLossWatch, r => final.push(r));
  const gpu = { pendingEncoder: {}, pendingDispatchCount: 1,
    flushCommands() { this.pendingEncoder = null; this.pendingDispatchCount = 0; } };
  helper.start(d.pipeline);
  submission.afterDispatch(gpu); submission.report({ comparisonCompleted: true });
  gpu.pendingEncoder = {}; gpu.pendingDispatchCount = 1; submission.afterDispatch(gpu);
  helper.finish(true);
  assert.equal(first[0].encodedDispatches, 1);
  assert.equal(final[0].submission.encodedDispatches, 2);
  assert.equal(isCompleteStoryDiagnostic(final[0]), true);
  d.lose({ reason: 'destroyed', message: 'owned cleanup' }); await d.lost;
  assert.deepEqual(final[0].deviceLosses, []);
});

test('empty, failed, incomplete or numerically inconsistent settlement summaries cannot pass', () => {
  const records = [];
  const helper = createCompleteStoryDiagnostics(counters, () => ({ start() {}, stop() {} }), r => records.push(r));
  helper.start({}); helper.finish(true);
  const good = records[0]; assert.equal(isCompleteStoryDiagnostic(good), true);
  for (const change of [{ completed: false }, { watchStarted: false }, { watchStopped: false }, { submission: null },
    { errors: ['failure'] }, { deviceLosses: [{ reason: 'unknown' }] },
    { submission: { ...counters(), encodedDispatches: 0 } },
    { submission: { ...counters(), flushedDispatches: 649 } },
    { submission: { ...counters(), maxPendingDispatchesBeforeFlush: 2 } },
    { submission: { ...counters(), errors: ['submit failed'] } }]) {
    assert.equal(isCompleteStoryDiagnostic({ ...good, ...change }), false);
  }
  const notStarted = createCompleteStoryDiagnostics(counters, createDeviceLossWatch, r => records.push(r));
  notStarted.finish(false, Error('invalid input'));
  assert.equal(records[1].watchStarted, false);
  assert.equal(isCompleteStoryDiagnostic(records[1]), false);
});

test('missing hooks fail closed on success but never replace an existing worker error reply', () => {
  const messages = [], events = [], debug = console.debug;
  console.debug = value => events.push(JSON.parse(value.slice('TG2_COMPLETE_STORY '.length)));
  try {
    assert.throws(() => finishCompleteStoryWorker(true, undefined, {}), /unavailable/);
    const original = Error('original inference failure');
    finishCompleteStoryWorker(false, original, { __tg2CompleteStoryFinish() { throw Error('observer failed'); } });
    messages.push({ type: 'error', id: 7 });
    assert.deepEqual(messages, [{ type: 'error', id: 7 }]);
    assert.equal(events.length, 1);
    assert.equal(events[0].completed, false);
    assert.match(events[0].errors[0], /observer failed/);
  } finally { console.debug = debug; }
});

test('runtime/worker hooks preserve native generation and precede only write settlement replies', () => {
  const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const workerPath = resolve('src/narrator/creative-writer.worker.ts');
  const originalRuntime = readFileSync(runtimePath, 'utf8'), originalWorker = readFileSync(workerPath, 'utf8');
  const source = instrumentSubmissionRuntime(instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(originalRuntime))));
  const transformed = instrumentCompleteStoryRuntime(source), worker = instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker));
  assert.ok(transformed.includes('if (__tg2ModelBufferActive) __tg2CompleteStory.start(this);'));
  assert.equal(transformed.includes('__tg2FirstTokenStop'), false);
  for (const marker of ['this.processNextToken(nextToken, genConfig);', 'yield __tg2ModelBuffer.compare(',
    'compute.dispatchWorkgroups(', 'this.tvm.uniform([1], 0.0, 1.0, this.device)', 'yield this.device.sync()']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length, marker);
  }
  assert.ok(worker.includes('const text = await write(readMessages(request.messages));\n      __tg2FinishCompleteStoryWorker(true);\n      workerScope.postMessage({ type: "result", id, text });'));
  assert.ok(worker.includes('if (request.type === "write") __tg2FinishCompleteStoryWorker(false, error);\n    workerScope.postMessage({ type: "error", id,'));
  assert.ok(worker.includes('await model.interruptGenerate();'));
  assert.ok(worker.includes('for await (const chunk of chunks)'));
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const plugin = completeStoryPlugin(process.cwd(), [runtimePath]);
  assert.equal(plugin.transform(source, runtimePath + '?worker_file').code, transformed);
  assert.equal(plugin.transform(adaptCandidateWorker(originalWorker), workerPath).code, worker);
  assert.equal(plugin.transform(source, runtimePath + '.backup'), null);
  assert.equal(plugin.transform(originalWorker, workerPath + '.backup'), null);
  assert.throws(() => instrumentCompleteStoryRuntime(originalRuntime), /submission instrumentation/);
  assert.throws(() => instrumentCompleteStoryRuntime(source + '__tg2FirstTokenStop'), /first-token stop/);
  assert.throws(() => instrumentCompleteStoryRuntime(transformed), /exactly once/);
  assert.throws(() => instrumentCompleteStoryRuntime(source.replace('const __tg2ModelBufferActive = yield __tg2ModelBuffer.begin(this, genConfig);', 'CHANGED')), /no longer matches/);
  assert.throws(() => instrumentCompleteStoryWorker(originalWorker), /candidate adapter/);
  assert.throws(() => instrumentCompleteStoryWorker(worker), /exactly once/);
  assert.throws(() => instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker).replace('const text = await write(readMessages(request.messages));', 'CHANGED')), /no longer matches/);
  assert.equal(readFileSync(runtimePath, 'utf8'), originalRuntime);
  assert.equal(readFileSync(workerPath, 'utf8'), originalWorker);
});
