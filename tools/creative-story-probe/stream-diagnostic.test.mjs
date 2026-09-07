import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamTrace, recordStreamChunk, snapshotStream, mayRunSecondScene } from './stream-diagnostic.mjs';
test('native prompt counts and timing are distinct from visible text chunks', () => {
  const trace = createStreamTrace('scene');
  recordStreamChunk(trace, { prompt_progress: { total: 321, processed: 0, cache: 0, time_ms: 0 } }, 4);
  assert.equal(trace.firstVisibleTextMs, null);
  recordStreamChunk(trace, { choices: [{ delta: { content: 'Mara' } }], timings: { prompt_ms: 1234 } }, 1300);
  assert.equal(trace.promptTokens, 321); assert.equal(trace.promptProcessingMs, 1234);
  assert.equal(trace.firstChunkMs, 4); assert.equal(trace.firstVisibleTextMs, 1300); assert.equal(trace.complete, false);
});
test('partial text survives timeout without being labeled complete', () => {
  const trace = createStreamTrace('scene');
  recordStreamChunk(trace, { choices: [{ delta: { content: 'Mara wondered' } }] }, 89900);
  const snapshot = snapshotStream(trace);
  recordStreamChunk(trace, { choices: [{ delta: { content: ' why.' } }] }, 100000);
  assert.equal(snapshot.rawPartial, 'Mara wondered'); assert.equal(trace.rawPartial, 'Mara wondered why.');
  assert.equal(trace.complete, false);
});
test('bad observations and unbounded event streams fail closed', () => {
  const trace = createStreamTrace('scene');
  assert.throws(() => recordStreamChunk(trace, {}, -1));
  trace.chunks.length = 1024; assert.throws(() => recordStreamChunk(trace, {}, 1));
});
test('second scene requires the exact remaining wall budget', () => {
  assert.equal(mayRunSecondScene(200000), true); assert.equal(mayRunSecondScene(200001), false);
});
