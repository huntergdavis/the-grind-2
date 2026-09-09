import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { createDispatchDiagnostics, instrumentDispatchRuntime, dispatchDiagnosticPlugin } from './webgpu-dispatch-diagnostics.mjs';

function frame(code = '@compute @workgroup_size(32) fn main() {}') {
  const buffers = [{ size: 607744, usage: 140 }, { size: 77791232, usage: 140 }, { size: 16, usage: 72 }];
  const words = new Uint32Array([151936, 1]), signed = new Int32Array(words.buffer), floats = new Float32Array(words.buffer);
  return { context: { shaderSubmitCounter: 22, debugShaderSubmitLimit: -1, gpuBufferFromPtr: pointer => buffers[pointer - 1] },
    finfo: { name: 'softmax_kernel', arg_types: ['handle', 'handle', 'int32'], launch_param_tags: ['blockIdx.x', 'threadIdx.x'] },
    code, args: [1, 2, 151936, 1, 32], bufferArgIndices: [0, 1], podArgIndices: [2], dispatchToDim: [0, 3],
    paramWriteAccess: [false, true], workDim: [1, 1, 1, 32, 1, 1], packDimX: 1,
    bindGroupEntries: [{ binding: 0, resource: { buffer: buffers[0] } }, { binding: 1, resource: { buffer: buffers[1] } },
      { binding: 2, resource: { buffer: buffers[2], size: 8 } }], i32View: signed, u32View: words, f32View: floats };
}

test('only the first live and fresh calls are captured and original return values/errors are retained', async () => {
  const records = [], diagnostic = createDispatchDiagnostics(record => records.push(record));
  const input = frame(), sentinel = {};
  diagnostic.encoded(input);
  diagnostic.run('live', () => diagnostic.encoded(input), false);
  assert.equal(diagnostic.run('live', () => { diagnostic.encoded(input); return sentinel; }), sentinel);
  diagnostic.run('live', () => diagnostic.encoded(input));
  diagnostic.run('other', () => diagnostic.encoded(input));
  assert.throws(() => diagnostic.run('fresh', () => { diagnostic.encoded(input); throw Error('original'); }), /original/);
  await diagnostic.flush();
  assert.deepEqual(records.map(record => record.label), ['live', 'fresh']);
  assert.equal(records[0].scopeCallError, null);
  assert.match(records[1].scopeCallError, /original/);
  assert.equal(records[0].wgslSha256, createHash('sha256').update(input.code).digest('hex'));
  assert.equal(records[0].wgsl, input.code);
});

test('records reflect actual launch values, uniform bits, whole-buffer bindings, and stable identities', async () => {
  const records = [], diagnostic = createDispatchDiagnostics(record => records.push(record));
  const input = frame(), originalWords = [...input.u32View], originalArgs = [...input.args];
  diagnostic.run('live', () => { diagnostic.encoded(input); diagnostic.encoded(input); });
  await diagnostic.flush();
  const record = records[0];
  assert.deepEqual(record.workDim, input.workDim);
  assert.deepEqual(record.requestedLaunch, [{ dimension: 0, value: 1 }, { dimension: 3, value: 32 }]);
  assert.equal(record.scalars[0].uniformBits, 151936);
  assert.equal(record.bindings[1].boundBytes, 77791232);
  assert.equal(record.bindings[1].explicitSize, false);
  assert.equal(record.bindings[1].writable, true);
  assert.equal(record.bindings[2].boundBytes, 8);
  assert.equal(record.bindings[2].explicitSize, true);
  assert.equal(record.bindings[0].bufferIdentity, records[1].bindings[0].bufferIdentity);
  assert.deepEqual([...input.u32View], originalWords);
  assert.deepEqual(input.args, originalArgs);
});

test('WGSL and dispatch counts stay bounded while the hash still identifies exact shader source', async () => {
  const records = [], diagnostic = createDispatchDiagnostics(record => records.push(record));
  const input = frame('x'.repeat(300000));
  diagnostic.run('live', () => { for (let i = 0; i < 12; i++) diagnostic.encoded(input); });
  await diagnostic.flush();
  assert.equal(records.length, 8);
  for (const record of records) {
    assert.equal(record.scopeObservedDispatches, 12);
    assert.equal(record.scopeRecordedDispatches, 8);
    assert.equal(record.scopeTruncated, true);
    assert.equal(record.wgsl.length, 262144);
    assert.equal(record.wgslCharacters, 300000);
    assert.equal(record.wgslTruncated, true);
    assert.equal(record.wgslSha256, createHash('sha256').update(input.code).digest('hex'));
  }
});

test('the observed 134580-character chunk shader fits without truncation', async () => {
  const records = [], diagnostic = createDispatchDiagnostics(record => records.push(record));
  const input = frame('x'.repeat(134580));
  diagnostic.run('live', () => diagnostic.encoded(input));
  await diagnostic.flush();
  assert.equal(records[0].wgsl, input.code);
  assert.equal(records[0].wgslCharacters, 134580);
  assert.equal(records[0].wgslTruncated, false);
  assert.equal(records[0].wgslSha256, createHash('sha256').update(input.code).digest('hex'));
});

test('skipped debug-limit dispatches and no-dispatch calls are explicit, not reported as executed work', async () => {
  const records = [], diagnostic = createDispatchDiagnostics(record => records.push(record));
  const input = frame(); delete input.bindGroupEntries; delete input.workDim;
  input.context.debugShaderSubmitLimit = 22;
  diagnostic.run('live', () => diagnostic.skipped(input));
  diagnostic.run('fresh', () => 9);
  await diagnostic.flush();
  const skipped = records.find(record => record.label === 'live');
  assert.equal(skipped.skippedDebugLimit, true);
  assert.equal(skipped.stage, 'skipped-debug-limit');
  assert.equal(skipped.workDim, null);
  assert.equal(records.find(record => record.label === 'fresh').kind, 'softmax-call-without-dispatch');
});

test('instrumentation wraps only two softmax expressions, flushes before completion, and rejects source drift', () => {
  const path = resolve('node_modules/@mlc-ai/web-llm/lib/index.js'), original = readFileSync(path, 'utf8');
  const source = instrumentModelBufferRuntime(instrumentSamplingRuntime(original));
  const transformed = instrumentDispatchRuntime(source);
  assert.ok(transformed.includes("__tg2Dispatch.run('live', () => this.fsoftmaxWithTemperature("));
  assert.ok(transformed.includes("own(__tg2Dispatch.run('fresh', () => pipeline.fsoftmaxWithTemperature("));
  assert.ok(transformed.includes('await __tg2Dispatch.flush();\n    emit(report);'));
  assert.ok(transformed.indexOf('__tg2Dispatch.encoded({') > transformed.indexOf('compute.dispatchWorkgroups(workDim[0], workDim[1], workDim[2]);'));
  for (const marker of ['this.tvm.uniform([1], 0.0, 1.0, this.device)', 'this.fsampleWithTopP(', 'compute.dispatchWorkgroups(workDim[0], workDim[1], workDim[2]);']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length);
  }
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const plugin = dispatchDiagnosticPlugin([path]);
  assert.equal(plugin.transform(source, path).code, transformed);
  assert.equal(plugin.transform(source, path + '?v=1').code, transformed);
  assert.equal(plugin.transform(source, path + '.backup'), null);
  assert.throws(() => instrumentDispatchRuntime(instrumentSamplingRuntime(original)), /model-buffer transform/);
  assert.throws(() => instrumentDispatchRuntime(transformed), /model-buffer transform/);
  assert.throws(() => instrumentDispatchRuntime(source.replace('emit(report);', 'CHANGED')), /no longer matches/);
  assert.throws(() => instrumentDispatchRuntime(source + '\nemit(report);'), /no longer matches/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
