import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { adaptCandidateWorker } from './webgpu-candidate-adapter.mjs';
import { compareTransferBytes, runTransferDiagnostics, transferDiagnosticPlugin } from './webgpu-transfer-diagnostics.mjs';

function fakePipeline({ badToArray = false, failGPU = false } = {}) {
  const tensors = [], memory = new Map();
  let syncs = 0, scopeDepth = 0;
  const cpu = { kind: 'cpu' };
  const device = { kind: 'gpu', async sync() { syncs++; } };
  const tvm = {
    cpu: () => cpu, beginScope() { scopeDepth++; }, endScope() { scopeDepth--; },
    detachFromCurrentScope: value => value,
    memory: { loadRawBytes(address, length) { return memory.get(address).slice(0, length); } },
    empty([length], dtype, target) {
      const address = tensors.length + 1;
      const data = new Uint8Array(length * 4);
      memory.set(address, data);
      const tensor = { dtype, target, data, disposed: false,
        copyFrom(source) {
          if (target === device && failGPU) throw new Error('known GPU copy failure');
          data.set(source.data ?? new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
          return this;
        },
        getCPUDataAddress: () => address, numStorageBytes: () => data.byteLength,
        toArray() {
          const copy = data.slice();
          if (badToArray) copy[0] ^= 1;
          return dtype === 'int32' ? new Int32Array(copy.buffer) : new Float32Array(copy.buffer);
        },
        dispose() { assert.ok(syncs > 0); assert.equal(this.disposed, false); this.disposed = true; },
      };
      tensors.push(tensor);
      return tensor;
    },
  };
  return { tvm, device, tensors, get scopeDepth() { return scopeDepth; }, get syncs() { return syncs; } };
}

test('byte comparison reports exact bit differences and truncated arrays without logging vectors', () => {
  const expected = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(compareTransferBytes(expected, expected.slice()).matches, true);
  const wrong = expected.slice(); wrong[5] = 9;
  assert.deepEqual(compareTransferBytes(expected, wrong), { matches: false,
    expectedBytes: 8, actualBytes: 8, mismatchedBytes: 1, firstDifferenceByte: 5,
    firstDifferenceElement: 1, expectedByte: 5, actualByte: 9 });
  const short = compareTransferBytes(expected, expected.slice(0, 4));
  assert.equal(short.mismatchedBytes, 4);
  assert.equal(short.firstDifferenceElement, 1);
  assert.equal(short.actualByte, null);
});

test('known float and int transfers emit one report and dispose every synchronized temporary', async () => {
  const pipeline = fakePipeline(), events = [];
  const result = await runTransferDiagnostics(pipeline, record => events.push(record));
  assert.equal(result.ok, true);
  assert.equal(result.generatedTokens, 0);
  assert.equal(events.length, 1);
  assert.deepEqual(result.cases.map(entry => [entry.dtype, entry.length]), [['float32', 64], ['float32', 151936], ['int32', 1]]);
  for (const entry of result.cases) {
    assert.deepEqual(entry.observations.map(observation => observation.path), ['js-to-cpu', 'cpu-to-gpu-to-cpu', 'js-to-gpu-to-cpu']);
    assert.equal(entry.tensorsAllocated, 5);
    assert.equal(entry.tensorsDisposed, 5);
    assert.equal(entry.synchronizedBeforeDispose, true);
  }
  assert.equal(pipeline.scopeDepth, 0);
  assert.equal(pipeline.syncs, 9);
  assert.ok(pipeline.tensors.every(tensor => tensor.disposed));
});

test('direct-memory correctness and broken toArray conversion remain distinct evidence', async () => {
  const result = await runTransferDiagnostics(fakePipeline({ badToArray: true }), () => {});
  assert.equal(result.ok, false);
  assert.equal(result.error, null);
  for (const entry of result.cases) for (const observation of entry.observations) {
    assert.equal(observation.direct.matches, true);
    assert.equal(observation.toArray.matches, false);
    assert.equal(observation.toArray.mismatchedBytes, 1);
    assert.equal(observation.directVsToArray.matches, false);
  }
});

test('operation failures emit one honest partial report, clean up, and propagate', async () => {
  const pipeline = fakePipeline({ failGPU: true }), events = [];
  await assert.rejects(runTransferDiagnostics(pipeline, record => events.push(record)), /known GPU copy failure/);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.match(events[0].error, /known GPU copy failure/);
  assert.equal(events[0].cases[0].observations.length, 1);
  assert.ok(pipeline.tensors.every(tensor => tensor.disposed));
  assert.equal(pipeline.scopeDepth, 0);
});

test('worker hook follows candidate reload, leaves other paths untouched, and rejects marker drift', () => {
  const repo = resolve('.'), worker = resolve(repo, 'src/narrator/creative-writer.worker.ts');
  const original = readFileSync(worker, 'utf8'), adapted = adaptCandidateWorker(original);
  const plugin = transferDiagnosticPlugin(repo);
  const transformed = plugin.transform(adapted, worker).code;
  const marker = 'await candidate.reload(creativeWriterModelId, { context_window_size: 1024 });';
  assert.ok(transformed.includes(marker + '\n    await runTransferDiagnostics(candidate.loadedModelIdToPipeline.get(creativeWriterModelId));'));
  assert.ok(transformed.includes('TG2_TRANSFER_DIAGNOSTIC '));
  for (const marker of ['model.chat.completions.create(', 'max_tokens: 68', 'max_tokens: 1']) {
    assert.equal(transformed.split(marker).length, adapted.split(marker).length);
  }
  assert.deepEqual(plugin.transform(adapted, worker + '?worker_file&type=module'), { code: transformed, map: null });
  for (const path of [worker + '.backup', resolve(repo, 'src/ui/creative-writer.worker.ts')]) {
    assert.equal(plugin.transform(adapted, path), null);
  }
  assert.throws(() => plugin.transform(adapted.replace(marker, 'CHANGED'), worker), /no longer matches/);
  assert.throws(() => plugin.transform(adapted + '\n' + marker, worker), /no longer matches/);
  assert.throws(() => plugin.transform(transformed, worker), /no longer matches/);
  assert.equal(readFileSync(worker, 'utf8'), original);
});
