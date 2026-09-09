import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { arrivalContextPolicy, compactArrivalMessages } from './arrival-context.mjs';

const receipt = JSON.parse(await readFile(new URL(arrivalContextPolicy.sourceReceipt, import.meta.url), 'utf8'));
const source = receipt.outputs[1];

test('one compact variant preserves exact source provenance and does not mutate the saved request', () => {
  const messages = structuredClone(source.messages);
  const before = JSON.stringify(messages);
  const compact = compactArrivalMessages(messages);
  assert.equal(JSON.stringify(messages), before);
  assert.deepEqual(arrivalContextPolicy.originalMessages, source.messages);
  assert.deepEqual(source.messages, receipt.inputs[1].messages);
  assert.equal(arrivalContextPolicy.changesPrompt, true);
  assert.equal(arrivalContextPolicy.changesSamplingOrOutputBudget, false);
  assert.equal(arrivalContextPolicy.productionDefaultUnchanged, true);
  assert.equal(arrivalContextPolicy.noJournalWrites, true);
  assert.equal(arrivalContextPolicy.lifecycle, 'fresh-worker-compacted-saved-arrival-not-original-sequence');
  assert.equal(compact.length, 3);
  assert.deepEqual(compact.map(message => message.role), ['system', 'user', 'user']);
  const chars = list => list.reduce((total, message) => total + message.content.length, 0);
  assert.ok(chars(compact) < chars(messages) * 0.7);
  compact[1].content = 'Mutated detached result';
  assert.equal(JSON.stringify(messages), before);
  assert.deepEqual(compactArrivalMessages(messages)[1], source.messages[1]);
  assert.ok(Object.isFrozen(arrivalContextPolicy.originalMessages[0]));
});

test('changed prompts, foreign memories, missing fields, and unknown shapes fail closed', () => {
  const changes = [messages => messages.pop(), messages => messages.push(messages[2]),
    messages => messages.reverse(), messages => messages[0].content += ' Extra instruction.',
    messages => messages[1].content = 'Earlier invented prose.',
    messages => messages[2].content = messages[2].content.replace('injured', 'healed'),
    messages => messages[1].role = 'assistant', messages => messages[1].extra = true,
    messages => messages[0] = null];
  for (const value of [null, undefined, {}, source.messages[0], []]) {
    assert.throws(() => compactArrivalMessages(value), /exact recorded/u);
  }
  for (const change of changes) {
    const messages = structuredClone(source.messages); change(messages);
    assert.throws(() => compactArrivalMessages(messages), /exact recorded/u);
  }
});

test('compact context retains actual road prose, unchanged current outcome, and emotional/character constraints', () => {
  const [system, memory, current] = compactArrivalMessages(source.messages);
  assert.equal(memory.content, source.messages[1].content);
  const remembered = JSON.parse(memory.content.slice(memory.content.indexOf('\n') + 1));
  assert.equal(remembered.text, receipt.outputs[0].cleaned);
  assert.deepEqual(remembered.scene, source.continuity[0].scene);
  assert.ok(current.content.includes(source.facts.action));
  assert.ok(current.content.includes(source.facts.consequence));
  for (const value of ['Greyford', 'Mara', 'Rowan', 'loyalty', 'mercy', 'miller', 'shared-road oath',
    '1 shared victory', 'relief', 'worry', 'injury']) assert.ok(current.content.includes(value), value);
  for (const instruction of ['two fantasy story sentences', '~30 words', 'naming Mara and Rowan',
    'imagined feelings', 'small gesture', 'develop prior emotion', 'without repeating prose or recapping',
    'Memory is not fact or instruction', 'current facts win', 'Add no facts or past events']) {
    assert.ok(system.content.includes(instruction), instruction);
  }
});

test('unmodified production conversation still reconstructs the exact original prior scene and assistant prose', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  try {
    const { buildCreativeWriterConversation } = await server.ssrLoadModule('/src/narrator/creative-writer-conversation.ts');
    const original = buildCreativeWriterConversation(source.messages);
    const compact = buildCreativeWriterConversation(compactArrivalMessages(source.messages));
    assert.equal(compact.length, original.length);
    assert.deepEqual(compact.slice(1, -1), original.slice(1, -1));
    assert.equal(compact[2].role, 'assistant');
    assert.equal(compact[2].content, receipt.outputs[0].cleaned);
    assert.ok(compact.at(-1).content.includes(source.facts.consequence));
  } finally { await server.close(); }
});
