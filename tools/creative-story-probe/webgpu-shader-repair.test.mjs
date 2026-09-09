import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { instrumentModelBufferRuntime } from './webgpu-model-buffer-diagnostics.mjs';
import { instrumentDispatchRuntime } from './webgpu-dispatch-diagnostics.mjs';
import { instrumentSubmissionRuntime } from './webgpu-submission-diagnostics.mjs';
import { instrumentCompleteStoryRuntime } from './webgpu-complete-story.mjs';
import { SHADER_REPAIR_RECEIPT, readShaderRepairPin, createShaderRepair, isCompleteShaderRepairEvidence,
  instrumentShaderRepairRuntime, shaderRepairPlugin } from './webgpu-shader-repair.mjs';

const receipt = () => JSON.parse(readFileSync(SHADER_REPAIR_RECEIPT, 'utf8'));
const hash = source => createHash('sha256').update(source).digest('hex');

test('pinned repair changes exactly the two shared scalar guards and no reductions, barriers or output writes', () => {
  const pin = readShaderRepairPin(), original = pin.original.split('\n'), repaired = pin.repaired.split('\n');
  assert.ok(Object.isFrozen(pin));
  assert.equal(hash(pin.original), pin.originalSha256);
  assert.equal(hash(pin.repaired), pin.repairedSha256);
  assert.notEqual(pin.originalSha256, pin.repairedSha256);
  assert.equal(original.length, repaired.length);
  const changed = original.flatMap((line, index) => line === repaired[index] ? [] : [index + 1]);
  assert.deepEqual(changed, [61, 100]);
  for (const index of changed) {
    assert.equal(original[index - 1], '  if (i32(threadIdx.x) == 0i) {');
    assert.equal(repaired[index - 1], '  if ((i32(threadIdx.x) == 0i) && (i32(threadIdx.y) == 0i)) {');
  }
  assert.equal(pin.guardChanges, 2);
});

test('missing, duplicate, truncated or drifted receipt evidence cannot become a shader pin', () => {
  for (const mutate of [r => { r.dispatchObservations.pop(); },
    r => { r.dispatchObservations[3] = r.dispatchObservations[1]; },
    r => { r.dispatchObservations[1].wgsl += '\n'; },
    r => { r.dispatchObservations[1].wgslSha256 = '0'.repeat(64); },
    r => { r.dispatchObservations[1].wgslTruncated = true; },
    r => { r.dispatchObservations[0].wgsl += '\n'; },
    r => { r.dispatchObservations[1].name = 'different_kernel'; }]) {
    const changed = receipt(); mutate(changed);
    assert.throws(() => readShaderRepairPin(changed), /receipt/);
  }
});

test('compile interception is synchronous, exact-source gated, emitted once and leaves every untargeted kernel alone', () => {
  const pin = readShaderRepairPin(), records = [], events = [];
  const repair = createShaderRepair(pin, record => { records.push(record); events.push('emit'); });
  const chunk = receipt().dispatchObservations[0];
  assert.equal(repair.repair({ name: chunk.name }, chunk.wgsl), chunk.wgsl);
  assert.equal(repair.repair({ name: 'other' }, 'not WGSL'), 'not WGSL');
  assert.equal(records.length, 0);
  assert.throws(() => repair.repair({ name: pin.shaderName }, pin.original + '\n'), /source drift/);
  assert.equal(records.length, 0);
  events.push('before');
  assert.equal(repair.repair({ name: pin.shaderName }, pin.original), pin.repaired);
  events.push('after');
  assert.deepEqual(events, ['before', 'emit', 'after']);
  assert.equal(records.length, 1);
  assert.ok(Object.isFrozen(records[0]));
  assert.ok(JSON.stringify(records[0]).length < 4000);
  assert.equal(records[0].guardChanges, 2);
  assert.equal(records[0].targetCompilations, 1);
  assert.throws(() => repair.repair({ name: pin.shaderName }, pin.original), /more than once/);
  assert.throws(() => repair.repair({ name: pin.shaderName }, pin.repaired), /source drift/);
  assert.equal(records.length, 1);
  assert.equal(repair.repair({ name: chunk.name }, chunk.wgsl), chunk.wgsl);
});

function evidence() {
  const pin = readShaderRepairPin(), report = receipt();
  report.shaderRepairObservations = [];
  createShaderRepair(pin, record => report.shaderRepairObservations.push(record)).repair({ name: pin.shaderName }, pin.original);
  for (const dispatch of report.dispatchObservations.filter(record => record.name === pin.shaderName)) {
    dispatch.wgsl = pin.repaired;
    dispatch.wgslSha256 = pin.repairedSha256;
    dispatch.wgslCharacters = pin.repaired.length;
  }
  return report;
}

test('final evidence requires one provenance event and the actual repaired live/fresh shader, keeping chunk WGSL unchanged', () => {
  assert.equal(isCompleteShaderRepairEvidence(evidence()), true);
  assert.equal(isCompleteShaderRepairEvidence(null), false);
  assert.equal(isCompleteShaderRepairEvidence(receipt()), false);
  const original = receipt();
  for (const mutate of [r => { r.shaderRepairObservations = []; },
    r => { r.shaderRepairObservations.push(r.shaderRepairObservations[0]); },
    r => { r.shaderRepairObservations[0] = { ...r.shaderRepairObservations[0], guardChanges: 3 }; },
    r => { r.shaderRepairObservations[0] = { ...r.shaderRepairObservations[0], targetCompilations: 2 }; },
    r => { r.shaderRepairObservations[0] = { ...r.shaderRepairObservations[0], addsGPUWaits: true }; },
    r => { r.shaderRepairObservations[0] = { ...r.shaderRepairObservations[0], changesSampling: true }; },
    r => { r.shaderRepairObservations[0] = { ...r.shaderRepairObservations[0], originalSha256: '0'.repeat(64) }; },
    r => { r.dispatchObservations.pop(); },
    r => { r.dispatchObservations[3] = r.dispatchObservations[1]; },
    r => { r.dispatchObservations[3] = original.dispatchObservations[3]; },
    r => { r.dispatchObservations[1].wgsl = original.dispatchObservations[1].wgsl; },
    r => { r.dispatchObservations[0].wgsl += '\n'; },
    r => { r.dispatchObservations[0].wgslSha256 = '0'.repeat(64); },
    r => { r.dispatchObservations[1].stage = 'skipped-debug-limit'; },
    r => { r.dispatchObservations[1].skippedDebugLimit = true; },
    r => { r.dispatchObservations[1].wgslTruncated = true; },
    r => { r.dispatchObservations[1].diagnosticError = 'capture failure'; },
    r => { r.dispatchObservations[1].scopeCallError = 'GPU failure'; },
    r => { r.dispatchObservations[1].scopeTruncated = true; },
    r => { r.dispatchObservations[1].metadataTruncated = true; },
    r => { r.dispatchObservations[1].wgslHashError = 'hash failure'; },
    r => { r.dispatchObservations[1].wgslCharacters--; }]) {
    const changed = evidence(); mutate(changed);
    assert.equal(isCompleteShaderRepairEvidence(changed), false);
  }
});

test('last isolated transform repairs the captured compile variable without changing sampling or dispatch submission code', () => {
  const path = resolve('node_modules/@mlc-ai/web-llm/lib/index.js'), original = readFileSync(path, 'utf8');
  const source = instrumentCompleteStoryRuntime(instrumentSubmissionRuntime(instrumentDispatchRuntime(
    instrumentModelBufferRuntime(instrumentSamplingRuntime(original)))));
  const transformed = instrumentShaderRepairRuntime(source);
  const marker = 'createShadeInternal(finfo, code, asyncMode) {';
  assert.ok(transformed.includes(marker + '\n            code = __tg2ShaderRepair.repair(finfo, code);'));
  for (const unchanged of ['this.device.createShaderModule(', 'this.device.createComputePipeline(',
    'this.device.createComputePipelineAsync(', '__tg2Dispatch.encoded({',
    'this.fsampleWithTopP(', 'this.tvm.uniform([1], 0.0, 1.0, this.device)',
    'compute.dispatchWorkgroups(', '__tg2SubmissionDiagnostics.afterDispatch(this);',
    'this.device.queue.submit([this.pendingEncoder.finish()]);']) {
    assert.equal(transformed.split(unchanged).length, source.split(unchanged).length, unchanged);
  }
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: transformed, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const plugin = shaderRepairPlugin([path]);
  assert.equal(plugin.transform(source, path).code, transformed);
  assert.equal(plugin.transform(source, path + '?v=1').code, transformed);
  assert.equal(plugin.transform(source, path + '.backup'), null);
  assert.equal(plugin.transform(source, path.replace('/node_modules/', '/other/')), null);
  assert.throws(() => instrumentShaderRepairRuntime(original), /complete-story instrumentation/);
  assert.throws(() => instrumentShaderRepairRuntime(transformed), /exactly once/);
  assert.throws(() => instrumentShaderRepairRuntime(source.replace(marker, 'CHANGED')), /no longer matches/);
  assert.throws(() => instrumentShaderRepairRuntime(source + '\n' + marker), /no longer matches/);
  assert.throws(() => instrumentShaderRepairRuntime(source + '\nconst __tg2Dispatch ='), /no longer matches/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
