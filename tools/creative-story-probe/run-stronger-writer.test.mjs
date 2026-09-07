import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { archivedReport, selectArchivedScenes, model, runtime, budgets, parseArguments } from './run-stronger-writer.mjs';

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
test('exact pins and finite cold/write/restore/cleanup budgets', () => {
  assert.match(model.revision, /^[a-f0-9]{40}$/);
  assert.equal(model.bytes, 491400032);
  assert.equal(runtime.version, '3.6.1');
  assert.equal(budgets.loadMs + 2 * budgets.writeMs + budgets.restoreMs + budgets.cleanupMs, budgets.totalMs);
});
test('direct Blob mode requires explicit run and preserves the original cache default', () => {
  assert.deepEqual(parseArguments(['--run', '/tmp/fixture']), { mode: '--run', stage: '/tmp/fixture', directBlob: false });
  assert.deepEqual(parseArguments(['--run', '--direct-blob', '/tmp/fixture']), { mode: '--run', stage: '/tmp/fixture', directBlob: true });
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
