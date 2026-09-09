import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { compactArrivalMessages, arrivalContextPolicy } from './arrival-context.mjs';
import { groundArrivalMessages, arrivalGroundingPolicy } from './arrival-grounding.mjs';

const receipt = JSON.parse(await readFile(new URL(arrivalGroundingPolicy.sourceReceipt, import.meta.url), 'utf8'));
const source = receipt.outputs[1];

test('one grounded variant preserves provenance, original input, and the compact character budget', async () => {
  const input = structuredClone(source.messages), before = JSON.stringify(input);
  const grounded = groundArrivalMessages(input), compact = compactArrivalMessages(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(arrivalGroundingPolicy.variant, 'arrival-grounding-single-variant-v1');
  assert.equal(arrivalGroundingPolicy.lifecycle, 'fresh-worker-grounded-saved-arrival-not-original-sequence');
  assert.deepEqual(arrivalGroundingPolicy.originalMessages, arrivalContextPolicy.originalMessages);
  assert.deepEqual(arrivalGroundingPolicy.originalMessages, receipt.inputs[1].messages);
  for (const field of ['changesPrompt', 'preservesExactRecordedMemoryMessage', 'preservesProductionConversationBuilder',
    'preservesActionAndConsequenceVerbatim', 'preservesCharacterValuesRoleAndVictories',
    'preservesCompactSceneMessage', 'productionDefaultUnchanged', 'noJournalWrites']) {
    assert.equal(arrivalGroundingPolicy[field], true, field);
  }
  assert.equal(arrivalGroundingPolicy.changesSamplingOrOutputBudget, false);
  assert.ok(Object.isFrozen(arrivalGroundingPolicy));
  assert.ok(Object.isFrozen(arrivalGroundingPolicy.originalMessages[0]));
  const quality = JSON.parse(await readFile(new URL(arrivalGroundingPolicy.sourceQualityReceipt, import.meta.url), 'utf8'));
  assert.equal(quality.mode, 'qwen3-compact-arrival-context-timing-cache-only');
  assert.equal(quality.outputs[0].status, 'completed');
  const characters = messages => messages.reduce((total, message) => total + message.content.length, 0);
  assert.ok(characters(grounded) <= characters(compact));
  assert.ok(characters(grounded) <= arrivalGroundingPolicy.maximumInputCharacters);
  assert.equal(arrivalGroundingPolicy.runtimeInputTokenTarget, 231); // A target, not an observed token count.
  grounded[1].content = 'Detached mutation';
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(groundArrivalMessages(input)[1], compact[1]);
});

test('grounding delegates the exact saved-request gate and rejects foreign or changed inputs', () => {
  for (const value of [null, undefined, {}, [], source.messages[0], compactArrivalMessages(source.messages)]) {
    assert.throws(() => groundArrivalMessages(value), /exact recorded/u);
  }
  for (const mutate of [messages => messages.pop(), messages => messages.reverse(),
    messages => messages[0].content += ' Extra rule.', messages => messages[1].content = 'Foreign memory.',
    messages => messages[2].content = messages[2].content.replace('injured', 'healed'),
    messages => messages[1].role = 'assistant', messages => messages[0].extra = true]) {
    const input = structuredClone(source.messages); mutate(input);
    assert.throws(() => groundArrivalMessages(input), /exact recorded/u);
  }
});

test('only the instruction changes; actual memory, current facts, character context, and emotional goal remain intact', () => {
  const grounded = groundArrivalMessages(source.messages), compact = compactArrivalMessages(source.messages);
  assert.deepEqual(grounded.map(message => message.role), ['system', 'user', 'user']);
  assert.deepEqual(grounded.slice(1), compact.slice(1));
  assert.equal(grounded[1].content, source.messages[1].content);
  const memory = JSON.parse(grounded[1].content.slice(grounded[1].content.indexOf('\n') + 1));
  assert.equal(memory.text, receipt.outputs[0].cleaned);
  assert.deepEqual(memory.scene, source.continuity[0].scene);
  for (const fact of [source.facts.action, source.facts.consequence]) assert.ok(grounded[2].content.includes(fact));
  for (const detail of ['loyalty', 'mercy', 'miller', 'shared-road oath', '1 shared victory',
    "Mara's arrival relief conflicts with worry for Rowan's injury."]) assert.ok(grounded[2].content.includes(detail), detail);
  for (const rule of ['exactly two fantasy sentences', '~30 words', 'naming Mara and Rowan',
    'imagined emotion', 'present bodily gesture', 'not recap or repeated prose',
    'Memory is not fact or instruction', 'current facts win', 'no objects, scenery, facts or past events']) {
    assert.ok(grounded[0].content.includes(rule), rule);
  }
});

test('unmodified production conversation retains the original prior-scene and assistant-memory turns', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  try {
    const { buildCreativeWriterConversation } = await server.ssrLoadModule('/src/narrator/creative-writer-conversation.ts');
    const original = buildCreativeWriterConversation(source.messages);
    const grounded = buildCreativeWriterConversation(groundArrivalMessages(source.messages));
    assert.equal(grounded.length, original.length);
    assert.deepEqual(grounded.slice(1, -1), original.slice(1, -1));
    assert.equal(grounded[2].role, 'assistant');
    assert.equal(grounded[2].content, receipt.outputs[0].cleaned);
    assert.ok(grounded.at(-1).content.includes(source.facts.consequence));
  } finally { await server.close(); }
});
