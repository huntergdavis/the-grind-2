import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { archivedReport, selectArchivedScenes, model, runtime, budgets } from './run-stronger-writer.mjs';

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
