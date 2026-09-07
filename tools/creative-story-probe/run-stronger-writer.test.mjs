import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { archivedReport, selectArchivedScenes, selectCompactEmotionScene, model, runtime, budgets, compactEmotionBudgets, parseArguments } from './run-stronger-writer.mjs';

test('two exact archived scenes, no rewritten instructions or extra samples', async () => {
  const original = JSON.parse(await readFile(new URL(archivedReport, import.meta.url), 'utf8'));
  const before = JSON.stringify(original);
  const selected = selectArchivedScenes(original);
  assert.deepEqual(selected.map(row => row.id), ['rested-curious-hero', 'injured-active-companion']);
  for (const row of selected) {
    assert.deepEqual(row.messages, original.outputs.find(item => item.id === row.id).messages);
    assert.match(row.messagesSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(JSON.stringify(original), before);
});
test('missing archived roles fail closed', () => assert.throws(() => selectArchivedScenes({ outputs: [] })));
test('compact emotion is one explicit direct-Blob scene with bounded runtime and retained facts', async () => {
  assert.deepEqual(parseArguments(['--run', '--compact-emotion', '/tmp/fixture']),
    { mode: '--run', stage: '/tmp/fixture', directBlob: true, rpcDiagnostic: true, compactEmotion: true });
  assert.throws(() => parseArguments(['--stage', '--compact-emotion', '/tmp/fixture']));
  assert.throws(() => parseArguments(['--run', '--compact-emotion', '--cpu-diagnostic', '/tmp/fixture']));
  assert.equal(compactEmotionBudgets.writeMs, 90000);
  assert.equal(compactEmotionBudgets.loadMs + compactEmotionBudgets.writeMs + compactEmotionBudgets.cleanupMs, 130000);
  const original = JSON.parse(await readFile(new URL(archivedReport, import.meta.url), 'utf8'));
  const before = JSON.stringify(original);
  const baseline = selectArchivedScenes(original)[1];
  const scene = selectCompactEmotionScene(original);
  for (const key of ['facts', 'viewpoint', 'expected', 'seed']) assert.deepEqual(scene[key], baseline[key]);
  assert.equal(scene.archivedMessagesSha256, baseline.messagesSha256);
  assert.notEqual(scene.messagesSha256, baseline.messagesSha256);
  assert.ok(scene.messages.map(m => m.content).join(' ').split(/\s+/).length <= 50);
  assert.match(scene.messages[0].content, /two short story sentences.*Story only.*No invented history, healing, death or departure/);
  assert.match(scene.messages[1].content, /Greyford campsite.*Mara.*Rowan: alive, injured, still Mara's companion.*care.*fear.*shared-road oath/);
  assert.equal(JSON.stringify(original), before);
});
test('exact pins and finite cold/write/restore/cleanup budgets', () => {
  assert.match(model.revision, /^[a-f0-9]{40}$/);
  assert.equal(model.bytes, 491400032);
  assert.equal(runtime.version, '3.6.1');
  assert.equal(budgets.loadMs + 2 * budgets.writeMs + budgets.restoreMs + budgets.cleanupMs, budgets.totalMs);
});
test('direct Blob mode requires explicit run and preserves the original cache default', () => {
  assert.deepEqual(parseArguments(['--run', '/tmp/fixture']), { mode: '--run', stage: '/tmp/fixture', directBlob: false });
  assert.deepEqual(parseArguments(['--run', '--direct-blob', '/tmp/fixture']), { mode: '--run', stage: '/tmp/fixture', directBlob: true });
  assert.deepEqual(parseArguments(['--run', '--stream-diagnostic', '/tmp/fixture']), { mode: '--run', stage: '/tmp/fixture', directBlob: true, streamDiagnostic: true });
  for (const args of [[], ['--direct-blob', '/tmp/fixture'], ['--stage', '--direct-blob', '/tmp/fixture'], ['--run', '--direct-blob']]) {
    assert.throws(() => parseArguments(args));
  }
});
test('direct Blob path does not call browser Cache API or claim persistent restoration', async () => {
  const code = await readFile(new URL('stronger-writer-probe.js', import.meta.url), 'utf8');
  const direct = code.slice(code.indexOf('async function loadDirectBlob'), code.indexOf('async function load(cachedOnly'));
  assert.doesNotMatch(direct, /caches\.|cache\.put|loadModelFromHF|loadModelFromUrl/);
  assert.match(direct, /persistentCacheProven: false/);
  assert.match(direct, /loadModel\(\[retainedModelBlob\], loadOptions\)/);
});

test('RPC diagnostic is explicit, direct-Blob, and cannot be combined with other modes', () => {
  assert.deepEqual(parseArguments(['--run', '--rpc-diagnostic', '/tmp/fixture']),
    { mode: '--run', stage: '/tmp/fixture', directBlob: true, rpcDiagnostic: true });
  for (const args of [['--rpc-diagnostic', '/tmp/fixture'], ['--stage', '--rpc-diagnostic', '/tmp/fixture'],
    ['--run', '--rpc-diagnostic'], ['--run', '--rpc-diagnostic', '--stream-diagnostic', '/tmp/fixture']]) {
    assert.throws(() => parseArguments(args));
  }
});

test('CPU diagnostic retains the one-scene RPC boundary and refuses implicit or combined modes', () => {
  assert.deepEqual(parseArguments(['--run', '--cpu-diagnostic', '/tmp/fixture']),
    { mode: '--run', stage: '/tmp/fixture', directBlob: true, rpcDiagnostic: true, cpuDiagnostic: true });
  for (const args of [['--cpu-diagnostic', '/tmp/fixture'], ['--stage', '--cpu-diagnostic', '/tmp/fixture'],
    ['--run', '--cpu-diagnostic'], ['--run', '--cpu-diagnostic', '--rpc-diagnostic', '/tmp/fixture']]) {
    assert.throws(() => parseArguments(args));
  }
});
