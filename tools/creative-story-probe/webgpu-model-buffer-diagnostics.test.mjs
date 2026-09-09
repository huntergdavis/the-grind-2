import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { stableSoftmaxReference } from './webgpu-compute-diagnostics.mjs';
import { instrumentSamplingRuntime } from './webgpu-sampling-diagnostics.mjs';
import { createModelBufferDiagnostics, instrumentModelBufferRuntime, modelBufferDiagnosticPlugin } from './webgpu-model-buffer-diagnostics.mjs';

const settings = { temperature: 0.7, topP: 0.85, repetitionPenalty: 1, frequencyPenalty: 0,
  presencePenalty: 0, logitBiasPresent: false, grammarConstrained: false };
const config = { enable_thinking: false, max_tokens: 68 };
function fakePipeline({ failFresh = false, validationError = null, undersized = false } = {}) {
  const tensors = [], memory = new Map(), listeners = new Set();
  let syncs = 0, scope = 0, pushes = 0, pops = 0, freshCalls = 0;
  const gpu = { addEventListener(type, listener) { assert.equal(type, 'uncapturederror'); listeners.add(listener); },
    removeEventListener(type, listener) { listeners.delete(listener); },
    pushErrorScope(type) { assert.equal(type, 'validation'); pushes++; },
    async popErrorScope() { pops++; return validationError; } };
  const cpu = {}, device = { async sync() { syncs++; } };
  const tvm = { lib: { webGPUContext: { device: gpu,
    gpuBufferFromPtr(pointer) { const tensor = tensors[pointer - 1]; return { size: undersized ? 4 : tensor.data.length, usage: 140 }; } } },
    cpu: () => cpu, beginScope() { scope++; }, endScope() { scope--; }, detachFromCurrentScope: tensor => tensor,
    memory: { loadRawBytes(address, count) { return memory.get(address).slice(0, count); } },
    empty(shape, dtype, target) {
      const pointer = tensors.length + 1, data = new Uint8Array(shape.reduce((a, b) => a * b, 1) * 4);
      memory.set(pointer, data);
      const tensor = { shape, dtype, target, byteOffset: 0, data, disposed: false,
        copyFrom(value) { data.set(value.data ?? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)); return this; },
        getDataPtr: () => pointer, getCPUDataAddress: () => pointer, numStorageBytes: () => data.length,
        toArray: () => new Float32Array(data.slice().buffer),
        dispose() { assert.ok(syncs > 0); assert.equal(this.disposed, false); this.disposed = true; } };
      tensors.push(tensor); return tensor;
    } };
  return { tvm, device, fullVocabSize: 4, tensors, listeners, get scope() { return scope; }, get pushes() { return pushes; }, get pops() { return pops; },
    get freshCalls() { return freshCalls; },
    emitError(error) { for (const listener of listeners) listener({ error }); },
    fsoftmaxWithTemperature(input, temperature) {
      freshCalls++;
      if (failFresh) throw new Error('fresh softmax failed');
      return tvm.empty(input.shape, 'float32', device).copyFrom(Float32Array.from(stableSoftmaxReference(input.toArray(), temperature.toArray()[0])));
    } };
}
function capture(diagnostic, pipeline, brokenLive = false) {
  const logits = new Float32Array([0, 1, 4, 0]), temperatures = new Float32Array([0.7]);
  const input = pipeline.tvm.empty([1, 1, 4], 'float32', pipeline.device).copyFrom(logits);
  const probs = pipeline.tvm.empty([1, 4], 'float32', pipeline.device).copyFrom(brokenLive ? new Float32Array(4)
    : Float32Array.from(stableSoftmaxReference(logits, temperatures[0])));
  const temp = pipeline.tvm.empty([1], 'float32', pipeline.device).copyFrom(temperatures);
  const borrowed = [input, probs, temp];
  diagnostic.captureLogits(pipeline, logits, input);
  diagnostic.captureLive(pipeline, probs, temp);
  logits.fill(99); // The first captured CPU values must remain stable.
  return borrowed;
}

test('first-token comparison retains original captures, detects fresh improvement, and disposes only owned tensors', async () => {
  const pipeline = fakePipeline(), events = [], diagnostic = createModelBufferDiagnostics(record => events.push(record));
  assert.equal(await diagnostic.begin(pipeline, config), true);
  const borrowed = capture(diagnostic, pipeline, true);
  await pipeline.device.sync(); // Original sampler's synchronization precedes comparison.
  const report = await diagnostic.compare(pipeline, 0, settings);
  assert.equal(report.comparisonCompleted, true);
  assert.equal(report.originalSampledToken, 0);
  assert.equal(report.live.normalized, false);
  assert.equal(report.fresh.matchesReference, true);
  assert.equal(report.fresh.expectedArgmax, 2);
  assert.equal(report.inputRoundtrip.direct.matches, true);
  assert.equal(events.length, 1);
  assert.equal(pipeline.freshCalls, 1);
  assert.equal(report.cleanup.tensorsAllocated, 8);
  assert.equal(report.cleanup.tensorsDisposed, 8);
  assert.equal(pipeline.scope, 0);
  assert.equal(pipeline.listeners.size, 0);
  assert.equal(pipeline.pushes, 1); assert.equal(pipeline.pops, 1);
  assert.ok(borrowed.every(tensor => !tensor.disposed));
  assert.equal(await diagnostic.begin(pipeline, config), false);
  await diagnostic.compare(pipeline, 1, settings);
  assert.equal(events.length, 1);
});

test('ineligible requests do not install listeners, allocate snapshots, or run compute', async () => {
  const pipeline = fakePipeline(), diagnostic = createModelBufferDiagnostics(() => {});
  for (const value of [undefined, {}, { enable_thinking: false, max_tokens: 1 }]) assert.equal(await diagnostic.begin(pipeline, value), false);
  assert.equal(pipeline.listeners.size, 0);
  assert.equal(pipeline.tensors.length, 0);
  assert.equal(pipeline.freshCalls, 0);
});

test('GPU validation and bounded uncaptured errors remain distinct and bounds violations are visible', async () => {
  const pipeline = fakePipeline({ undersized: true, validationError: new Error('validation') });
  const diagnostic = createModelBufferDiagnostics(() => {});
  await diagnostic.begin(pipeline, config);
  for (let index = 0; index < 20; index++) pipeline.emitError(new Error('uncaptured'));
  capture(diagnostic, pipeline);
  const report = await diagnostic.compare(pipeline, 2, settings);
  assert.equal(report.ok, false);
  assert.equal(report.gpuErrors.uncaptured.length, 8);
  assert.equal(report.gpuErrors.validation.message, 'validation');
  assert.equal(report.buffers.liveLogits.logicalBytes, 16);
  assert.equal(report.buffers.liveLogits.backingBytes, 4);
  assert.equal(report.buffers.liveLogits.fitsBackingBuffer, false);
});

test('helper and prefill failures report once and clean snapshots/listeners before propagating', async () => {
  for (const failure of ['helper', 'prefill']) {
    const pipeline = fakePipeline({ failFresh: failure === 'helper' }), events = [];
    const diagnostic = createModelBufferDiagnostics(record => events.push(record));
    await diagnostic.begin(pipeline, config);
    const borrowed = capture(diagnostic, pipeline);
    const operation = failure === 'helper' ? diagnostic.compare(pipeline, 2, settings) : diagnostic.abort(new Error('prefill failed'));
    await assert.rejects(operation, /failed/);
    assert.equal(events.length, 1);
    assert.equal(events[0].comparisonCompleted, false);
    assert.ok(events[0].error);
    assert.equal(events[0].cleanup.tensorsAllocated, events[0].cleanup.tensorsDisposed);
    assert.equal(pipeline.listeners.size, 0);
    assert.equal(pipeline.scope, 0);
    assert.ok(borrowed.every(tensor => !tensor.disposed));
    await diagnostic.abort(new Error('outer catch'));
    assert.equal(events.length, 1);
  }
});

test('missing inspection hooks fail explicitly rather than silently claiming an absent check passed', async () => {
  const events = [], diagnostic = createModelBufferDiagnostics(record => events.push(record));
  await assert.rejects(diagnostic.begin({ device: { async sync() {} } }, config), /inspection hooks/);
  assert.equal(events.length, 1);
  assert.equal(events[0].ok, false);
  assert.equal(events[0].comparisonCompleted, false);
});

test('instrumentation is scoped to default sampling and compares only after the original token and diagnostics', () => {
  const path = resolve('node_modules/@mlc-ai/web-llm/lib/index.js');
  const original = readFileSync(path, 'utf8'), source = instrumentSamplingRuntime(original);
  const transformed = instrumentModelBufferRuntime(source);
  assert.ok(transformed.indexOf('yield __tg2ModelBuffer.begin(this, genConfig)') < transformed.indexOf('this.embedAndForward(chunk, chunkLen)'));
  assert.ok(transformed.indexOf('__tg2ModelBuffer.captureLive(this, probs, temperaturesDevice);') < transformed.indexOf('const argsortResults = this.fargsortProbs(probs);'));
  const actualCompare = transformed.indexOf('yield __tg2ModelBuffer.compare(this, sampledToken,');
  assert.ok(actualCompare > transformed.indexOf('__tg2SamplingDiagnostics.sampled(this.logitsOnCPU.toArray(), sampledToken,'));
  assert.ok(actualCompare > transformed.indexOf('sampledTokensHost.dispose();'));
  for (const marker of ['this.tvm.uniform([1], 0.0, 1.0, this.device)', 'sampledToken = sampledTokensHost.toArray()[0];']) {
    assert.equal(transformed.split(marker).length, source.split(marker).length);
  }
  const plugin = modelBufferDiagnosticPlugin([path]);
  assert.equal(plugin.transform(source, path).code, transformed);
  assert.equal(plugin.transform(source, path + '?v=1').code, transformed);
  assert.equal(plugin.transform(source, path + '.backup'), null);
  assert.throws(() => instrumentModelBufferRuntime(original), /default sampling/);
  assert.throws(() => instrumentModelBufferRuntime(instrumentSamplingRuntime(original, { beforeSort: true })), /default sampling/);
  assert.throws(() => instrumentModelBufferRuntime(transformed), /default sampling/);
  assert.throws(() => instrumentModelBufferRuntime(source.replace('sampledTokensHost.dispose();', 'CHANGED')), /no longer matches/);
  assert.equal(readFileSync(path, 'utf8'), original);
});
