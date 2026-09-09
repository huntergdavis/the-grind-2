import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { stableSoftmaxReference, compareSoftmaxOutput, runComputeDiagnostics, computeDiagnosticPlugin } from './webgpu-compute-diagnostics.mjs';

function fakePipeline({ output = 'reference', fail = false } = {}) {
  const tensors = [], memory = new Map();
  let scopeDepth = 0, syncs = 0, calls = 0;
  const cpu = { kind: 'cpu' }, device = { kind: 'gpu', async sync() { syncs++; } };
  const tvm = { cpu: () => cpu, beginScope() { scopeDepth++; }, endScope() { scopeDepth--; }, detachFromCurrentScope: tensor => tensor,
    memory: { loadRawBytes(address, length) { return memory.get(address).slice(0, length); } },
    empty(shape, dtype, target) {
      assert.equal(dtype, 'float32');
      const data = new Uint8Array(shape.reduce((a, b) => a * b, 1) * 4), address = tensors.length + 1;
      memory.set(address, data);
      const tensor = { shape, data, target, disposed: false,
        copyFrom(value) { data.set(value.data ?? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)); return this; },
        getCPUDataAddress: () => address, numStorageBytes: () => data.byteLength,
        toArray: () => new Float32Array(data.slice().buffer),
        dispose() { assert.ok(syncs > 0); assert.equal(this.disposed, false); this.disposed = true; } };
      tensors.push(tensor); return tensor;
    } };
  const pipeline = { tvm, device, fullVocabSize: 151936, tensors,
    get scopeDepth() { return scopeDepth; }, get calls() { return calls; },
    fsoftmaxWithTemperature(input, temperature) {
      calls++;
      assert.deepEqual(input.shape, [1, 1, 151936]);
      assert.deepEqual(temperature.shape, [1]);
      assert.equal(input.target, device);
      assert.ok(tensors.every(tensor => !tensor.disposed || calls === 2));
      if (fail) throw new Error('known softmax failure');
      const result = tvm.empty(input.shape, 'float32', device);
      const values = output === 'zero' ? new Float32Array(151936)
        : Float32Array.from(stableSoftmaxReference(input.toArray(), temperature.toArray()[0]));
      return result.copyFrom(values);
    } };
  return pipeline;
}

test('Float64 reference is stable, shift invariant, normalized, and rejects invalid input', () => {
  assert.deepEqual([...stableSoftmaxReference(new Float32Array(4), 0.7)], [0.25, 0.25, 0.25, 0.25]);
  const a = stableSoftmaxReference(new Float32Array([10000, 10001, 9999]), 0.7);
  const b = stableSoftmaxReference(new Float32Array([0, 1, -1]), 0.7);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.reduce((x, y) => x + y, 0) - 1) < 1e-12);
  for (const [values, temperature] of [[[], 0.7], [[0], 0], [[Infinity], 0.7], [[NaN], 0.7]]) {
    assert.throws(() => stableSoftmaxReference(values, temperature));
  }
});

test('comparison exposes invalid probabilities, wrong interior maximum, and bounded examples', () => {
  const reference = stableSoftmaxReference(new Float32Array([0, 1, 4, 0]), 0.7);
  const good = compareSoftmaxOutput(Float32Array.from(reference), reference);
  assert.equal(good.matchesReference, true);
  assert.equal(good.actualArgmax, 2);
  assert.ok(good.maxAbsoluteError < 1e-7);
  const invalid = compareSoftmaxOutput(new Float32Array([Infinity, NaN, 0, 0]), reference);
  assert.equal(invalid.matchesReference, false);
  assert.equal(invalid.positiveInfinityCount, 1);
  assert.equal(invalid.nanCount, 1);
  assert.equal(invalid.actualArgmax, 0);
  assert.equal(invalid.sum, null);
  assert.equal(invalid.maxAbsoluteError, null);
  assert.equal(compareSoftmaxOutput(new Float32Array(4), reference).normalized, false);
  assert.equal(compareSoftmaxOutput(new Float32Array([0.25, 0.25, 0.25, 0.25]), reference).matchesReference, false);
  assert.equal(compareSoftmaxOutput(new Float32Array(3), reference).matchesReference, false);
  assert.equal(compareSoftmaxOutput(new Float32Array([0.2499999, 0.2500001, 0.25, 0.25]), new Float64Array(4).fill(0.25)).matchesReference, true);
  assert.ok(compareSoftmaxOutput(new Float32Array(100), new Float64Array(100).fill(0.01)).examples.length <= 10);
});

test('only two owned synthetic softmax calls run; transfer checks and disposal stay explicit', async () => {
  const pipeline = fakePipeline(), events = [];
  const result = await runComputeDiagnostics(pipeline, record => events.push(record));
  assert.equal(events.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.generatedTokens, 0);
  assert.equal(pipeline.calls, 2);
  assert.equal(pipeline.scopeDepth, 0);
  assert.ok(pipeline.tensors.every(tensor => tensor.disposed));
  assert.deepEqual(result.cases.map(entry => entry.probabilities.expectedArgmax), [0, 73777]);
  for (const entry of result.cases) {
    assert.equal(entry.tensorsAllocated, 6);
    assert.equal(entry.tensorsDisposed, 6);
    assert.equal(entry.synchronizedBeforeDispose, true);
    assert.equal(entry.effectiveFloat32Temperature, new Float32Array([0.7])[0]);
    assert.equal(entry.roundtrips.length, 2);
    assert.equal(entry.directVsToArray.matches, true);
    assert.equal(entry.directProbabilities.matchesReference, true);
  }
});

test('incorrect softmax output is reported even when every transfer comparison passes', async () => {
  const result = await runComputeDiagnostics(fakePipeline({ output: 'zero' }), () => {});
  assert.equal(result.ok, false);
  assert.equal(result.error, null);
  for (const entry of result.cases) {
    assert.equal(entry.probabilities.sum, 0);
    assert.equal(entry.probabilities.nonzeroCount, 0);
    assert.equal(entry.directVsToArray.matches, true);
    assert.ok(entry.roundtrips.every(value => value.direct.matches && value.toArray.matches));
  }
});

test('operation failures emit one partial report, dispose tensors, and propagate', async () => {
  const pipeline = fakePipeline({ fail: true }), events = [];
  await assert.rejects(runComputeDiagnostics(pipeline, record => events.push(record)), /known softmax failure/);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.match(events[0].error, /known softmax failure/);
  assert.ok(pipeline.tensors.every(tensor => tensor.disposed));
  assert.equal(pipeline.scopeDepth, 0);
});

test('compute plugin patches only the exact worker after reload and fails closed on source drift', () => {
  const repo = resolve('.'), worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  const original = readFileSync(worker, 'utf8'), adapted = adaptCandidateWorker(original), plugin = computeDiagnosticPlugin(repo);
  const marker = 'await candidate.reload(creativeWriterModelId, { context_window_size: 1024 });';
  const transformed = plugin.transform(adapted, worker).code;
  assert.ok(transformed.includes(marker + '\n    await runComputeDiagnostics(candidate.loadedModelIdToPipeline.get(creativeWriterModelId));'));
  assert.ok(transformed.includes('TG2_COMPUTE_DIAGNOSTIC '));
  assert.equal(transformed.split('model.chat.completions.create(').length, adapted.split('model.chat.completions.create(').length);
  assert.deepEqual(plugin.transform(adapted, worker + '?worker_file&type=module'), { code: transformed, map: null });
  for (const path of [worker + '.backup', resolve(repo, 'src/ui/creative-writer.worker.ts')]) assert.equal(plugin.transform(adapted, path), null);
  assert.throws(() => plugin.transform(adapted.replace(marker, 'CHANGED'), worker), /no longer matches/);
  assert.throws(() => plugin.transform(adapted + '\n' + marker, worker), /no longer matches/);
  assert.throws(() => plugin.transform(transformed, worker), /no longer matches/);
  assert.equal(readFileSync(worker, 'utf8'), original);
});
