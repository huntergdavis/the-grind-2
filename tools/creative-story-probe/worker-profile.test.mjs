import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { summarizeWorkerProfile, decodeProfileNativeFrames } from './worker-profile.mjs';

test('CPU summary distinguishes idle from sampled work without claiming every sample is a token', () => {
  const result = summarizeWorkerProfile({ startTime: 1000, endTime: 5001000,
    nodes: [{ id: 1, callFrame: { functionName: '(idle)' } }, { id: 2, callFrame: { functionName: 'wasm-function[123]' } }],
    samples: [1, 2, 2, 2] });
  assert.equal(result.durationMs, 5000); assert.equal(result.samples, 4);
  assert.equal(result.idleSamples, 1); assert.equal(result.nonIdleSamples, 3);
  assert.equal(result.topFrames[0].functionName, 'wasm-function[123]');
  assert.equal(result.topFrames[0].samples, 3);
});

test('CPU summary bounds retained frame summaries and handles no samples honestly', () => {
  assert.equal(summarizeWorkerProfile({ startTime: 0, endTime: 1, nodes: [] }).samples, 0);
  const result = summarizeWorkerProfile({ startTime: 0, endTime: 1,
    nodes: Array.from({ length: 80 }, (_, id) => ({ id, callFrame: { functionName: `frame-${id}` } })),
    samples: Array.from({ length: 80 }, (_, id) => id) });
  assert.equal(result.topFrames.length, 32); assert.equal(result.samples, 80);
});

test('native symbols use the exact staged binary table and retain unknown indices', () => {
  const name = Buffer.from('ggml_compute');
  const data = Buffer.alloc(12 + 1 + name.length + 2);
  data.writeUInt32LE(100, 0); data.writeUInt32LE(1, 4); data.writeUInt32LE(1, 8);
  data[12] = name.length; name.copy(data, 13); data.writeUInt16LE(0, 13 + name.length);
  const source = `export const WASM_SOURCE_MAP = { default: '${gzipSync(data).toString('base64')}' };`;
  const result = decodeProfileNativeFrames({ nodes: [
    { id: 1, callFrame: { functionName: '$func100' } },
    { id: 2, callFrame: { functionName: 'wasm-function[99]' } },
    { id: 3, callFrame: { functionName: 'jsFunction' } },
  ] }, source);
  assert.equal(result[0].name, 'ggml_compute'); assert.equal(result[1].name, '(unknown)');
  assert.equal(result.length, 2);
  assert.throws(() => decodeProfileNativeFrames({ nodes: [] }, 'missing'), /missing/);
});
