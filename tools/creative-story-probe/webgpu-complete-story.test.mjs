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
import { createCompleteStoryDiagnostics, createConnectedStoryDiagnostics,
  isCompleteStoryDiagnostic, isCompleteConnectedStoryEvidence, finishCompleteStoryWorker,
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

test('three connected writes each own a fresh native loss watch and an advancing cumulative snapshot', async () => {
  const records = [], losses = [], lifecycle = [], d = device();
  let count = 0, watchers = 0;
  const helper = createConnectedStoryDiagnostics(() => ({ ...counters(),
    encodedDispatches: count, flushAttempts: count, flushedDispatches: count }), emit => {
    const index = ++watchers, watch = createDeviceLossWatch(emit);
    return { start(pipeline) { lifecycle.push(`start:${index}`); watch.start(pipeline); },
      stop(pipeline) { lifecycle.push(`stop:${index}`); watch.stop(pipeline); } };
  }, r => records.push(r), r => losses.push(r));
  for (let story = 1; story <= 3; story++) {
    helper.start(d.pipeline); helper.start(d.pipeline);
    count += 650;
    helper.finish(true); helper.finish(true);
    assert.equal(records.length, story);
    assert.equal(isCompleteConnectedStoryEvidence(records, story), true);
  }
  assert.deepEqual(records.map(record => record.story), [1, 2, 3]);
  assert.deepEqual(records.map(record => record.submission.encodedDispatches), [650, 1300, 1950]);
  assert.deepEqual(lifecycle, ['start:1', 'stop:1', 'start:2', 'stop:2', 'start:3', 'stop:3']);
  assert.throws(() => helper.start(d.pipeline), /only three writes/);
  helper.finish(false, Error('fourth write rejected'));
  assert.equal(records.length, 3);
  d.lose({ reason: 'destroyed', message: 'owned final cleanup' }); await d.lost;
  assert.deepEqual(losses, []);
  assert.equal(records.every(record => record.deviceLosses.length === 0), true);
});

test('a second connected write observes later device loss without reactivating the first watch', async () => {
  const records = [], losses = [], d = device();
  const helper = createConnectedStoryDiagnostics(counters, createDeviceLossWatch,
    r => records.push(r), r => losses.push(r));
  helper.start(d.pipeline); helper.finish(true);
  helper.start(d.pipeline);
  d.lose({ reason: 'unknown', message: 'second scene decode lost' }); await d.lost;
  helper.finish(false, Error('original inference failure'));
  helper.finish(false, Error('duplicate failure settlement'));
  assert.equal(records.length, 2);
  assert.deepEqual(records[0].deviceLosses, []);
  assert.deepEqual(records[1].deviceLosses, [{ reason: 'unknown', message: 'second scene decode lost' }]);
  assert.deepEqual(losses, [{ reason: 'unknown', message: 'second scene decode lost', story: 2 }]);
  assert.deepEqual(records[1].errors, ['original inference failure']);
  assert.equal(records[1].watchStopped, true);
  assert.equal(isCompleteConnectedStoryEvidence(records, 2), false);
  assert.throws(() => helper.start(d.pipeline), /cannot resume/);
});

test('connected failures before prefill, during start, overlap, and settlement remain bounded and visible', () => {
  for (const stage of ['before-prefill', 'start', 'overlap', 'stop', 'snapshot']) {
    const records = [], lifecycle = [], pipeline = {};
    const helper = createConnectedStoryDiagnostics(() => {
      if (stage === 'snapshot') throw Error('snapshot failure');
      return counters();
    }, () => ({
      start() { lifecycle.push('start'); if (stage === 'start') throw Error('watch start failure'); },
      stop() { lifecycle.push('stop'); if (stage === 'stop') throw Error('watch stop failure'); },
    }), r => records.push(r));
    if (stage === 'start') assert.throws(() => helper.start(pipeline), /watch start failure/);
    else if (stage !== 'before-prefill') helper.start(pipeline);
    if (stage === 'overlap') assert.throws(() => helper.start({}), /cannot overlap/);
    helper.finish(false, Error(`original ${stage} failure`));
    helper.finish(false, Error('duplicate'));
    assert.equal(records.length, 1, stage);
    assert.equal(records[0].story, 1, stage);
    assert.ok(records[0].errors.includes(`original ${stage} failure`), stage);
    assert.equal(records[0].watchStopped, !['before-prefill', 'stop'].includes(stage), stage);
    assert.equal(isCompleteConnectedStoryEvidence(records, 1), false, stage);
    assert.throws(() => helper.start(pipeline), /cannot resume/, stage);
  }
  const records = [], helper = createConnectedStoryDiagnostics(counters,
    () => ({ start() {}, stop() {} }), r => records.push(r));
  helper.start({}); helper.finish(true);
  helper.finish(false, Error('second write rejected before prefill'));
  assert.equal(records[1].story, 2);
  assert.equal(records[1].watchStarted, false);
  assert.match(records[1].errors[0], /second write rejected/);
});

test('connected evidence rejects missing, duplicated, reordered, failed, or non-advancing receipts', () => {
  const records = [];
  let count = 0;
  const helper = createConnectedStoryDiagnostics(() => ({ ...counters(),
    encodedDispatches: ++count, flushAttempts: count, flushedDispatches: count }),
  () => ({ start() {}, stop() {} }), r => records.push(r));
  for (let i = 0; i < 3; i++) { helper.start({}); helper.finish(true); }
  assert.equal(isCompleteConnectedStoryEvidence(records, 3), true);
  for (const expected of [0, 4, 1.5, undefined, '3']) {
    assert.equal(isCompleteConnectedStoryEvidence(records, expected), false);
  }
  for (const invalid of [null, [], records.slice(0, 2), [...records, records[2]],
    [...records].reverse(), [records[0], records[0], records[2]],
    [records[0], { ...records[1], story: undefined }, records[2]],
    [records[0], { ...records[1], completed: false }, records[2]],
    [records[0], { ...records[1], submission: records[0].submission }, records[2]],
    [records[0], records[1], { ...records[2], submission: records[0].submission }]]) {
    assert.equal(isCompleteConnectedStoryEvidence(invalid, 3), false);
  }
});

test('runtime/worker hooks preserve native generation and precede only write settlement replies', () => {
  const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const workerPath = resolve('src/narrator/creative-writer.worker.ts');
  const originalRuntime = readFileSync(runtimePath, 'utf8'), originalWorker = readFileSync(workerPath, 'utf8');
  const source = instrumentSubmissionRuntime(instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(originalRuntime))));
  const transformed = instrumentCompleteStoryRuntime(source), worker = instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker));
  const defaultSetup = `const __tg2CompleteStory = (${createCompleteStoryDiagnostics.toString()})(
  () => __tg2SubmissionDiagnostics.snapshot(), (${createDeviceLossWatch.toString()}));
if (Reflect.has(globalThis, '__tg2CompleteStoryFinish')) throw new Error('Complete-story runtime hook already exists');
Reflect.set(globalThis, '__tg2CompleteStoryFinish', (completed, error) => __tg2CompleteStory.finish(completed, error));
`;
  const begin = 'const __tg2ModelBufferActive = yield __tg2ModelBuffer.begin(this, genConfig);\n            try {';
  assert.equal(transformed, defaultSetup + source.replace(begin,
    begin + '\n            if (__tg2ModelBufferActive) __tg2CompleteStory.start(this);'));
  assert.equal(instrumentCompleteStoryRuntime(source, { connected: false }), transformed);
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

test('connected runtime starts for each original candidate write, never warmup or the first-comparison-only gate', () => {
  const runtimePath = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const workerPath = resolve('src/narrator/creative-writer.worker.ts');
  const originalRuntime = readFileSync(runtimePath, 'utf8'), originalWorker = readFileSync(workerPath, 'utf8');
  const source = instrumentSubmissionRuntime(instrumentDispatchRuntime(instrumentModelBufferRuntime(instrumentSamplingRuntime(originalRuntime))));
  const transformed = instrumentCompleteStoryRuntime(source, { connected: true });
  assert.ok(transformed.startsWith('const __tg2CompleteStory = (function createConnectedStoryDiagnostics('));
  assert.ok(transformed.includes('if (genConfig?.enable_thinking === false && genConfig.max_tokens === 68) __tg2CompleteStory.start(this);'));
  assert.equal(transformed.includes('if (__tg2ModelBufferActive) __tg2CompleteStory.start(this);'), false);
  assert.equal(transformed.includes('__tg2FirstTokenStop'), false);
  for (const marker of ['this.processNextToken(nextToken, genConfig);', 'yield __tg2ModelBuffer.compare(',
    'compute.dispatchWorkgroups(', 'this.tvm.uniform([1], 0.0, 1.0, this.device)', 'yield this.device.sync()']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length, marker);
  }
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const plugin = completeStoryPlugin(process.cwd(), [runtimePath], { connected: true });
  assert.equal(plugin.transform(source, runtimePath + '?worker_file').code, transformed);
  assert.equal(plugin.transform(adaptCandidateWorker(originalWorker), workerPath).code,
    instrumentCompleteStoryWorker(adaptCandidateWorker(originalWorker)));
  assert.throws(() => instrumentCompleteStoryRuntime(transformed, { connected: true }), /exactly once/);
  assert.equal(plugin.transform(source, runtimePath + '.backup'), null);
  assert.equal(readFileSync(runtimePath, 'utf8'), originalRuntime);
  assert.equal(readFileSync(workerPath, 'utf8'), originalWorker);
});
