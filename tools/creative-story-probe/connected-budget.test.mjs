import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';
import { buildConnectedBudgetMessages, connectedBudgetPolicy } from './connected-budget.mjs';
import { groundArrivalMessages, arrivalGroundingPolicy } from './arrival-grounding.mjs';
import { sentenceBudgetPolicy } from './sentence-budget.mjs';

let server, production;
const fixtures = createWebgpuV1ProductionCases().slice(0, 3);
// Mocked replies exercise memory plumbing, not model quality or supplied probe prose.
const replies = ['Mara steadied Rowan. Concern stayed with her.',
  'Mara stayed beside Rowan. Relief softened her worry.',
  'Mara released Rowan gently. Farewell stirred her doubt.'];
before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  production = Object.assign({}, ...await Promise.all(['/src/narrator/creative-story.ts',
    '/src/narrator/creative-writer-conversation.ts', '/src/ui/narrative-journal.ts',
    '/src/ui/narrative-continuity.ts'].map((path) => server.ssrLoadModule(path))));
});
after(async () => { await server?.close(); });

function currentRunInputs() {
  const journal = production.createNarrativeJournal(() => ({ getItem: () => null, setItem() {} }));
  return fixtures.map((fixture, index) => {
    const continuity = production.selectNarrativeContinuity(journal.snapshot.entries, fixture.job, fixture.viewpoint);
    const seed = production.selectStorySeed(fixture.mode, fixture.identity, fixture.attempt,
      { viewpoint: fixture.viewpoint, focus: fixture.focus });
    const messages = production.buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus, continuity);
    assert.equal(continuity.length, index);
    assert.equal(journal.record({ sourceEventId: fixture.job.eventId, campaignId: fixture.job.campaignId,
      sourceTick: fixture.job.tick, readyAtMs: index + 1, text: replies[index], location: fixture.facts.location,
      headline: fixture.facts.headline, origin: 'model', inspirationTone: 'care' }), true);
    return { fixture, continuity, messages };
  });
}

test('one explicit grounded connected policy changes prompts, not the live defaults, sampling, or memory ownership', () => {
  assert.equal(connectedBudgetPolicy.productionMessagesUnchanged, false);
  assert.equal(connectedBudgetPolicy.changesPrompt, true);
  assert.equal(connectedBudgetPolicy.productionDefaultUnchanged, true);
  assert.equal(connectedBudgetPolicy.changesSamplingOrTokenCap, false);
  assert.equal(connectedBudgetPolicy.usesSavedProse, false);
  assert.equal(connectedBudgetPolicy.requiresSameRunMemories, true);
  assert.equal(connectedBudgetPolicy.persistentArchiveReads, false);
  assert.equal(connectedBudgetPolicy.persistentArchiveWrites, false);
  assert.equal(connectedBudgetPolicy.journalScope, 'owned-memory-only');
  assert.equal(connectedBudgetPolicy.softLimitMs, sentenceBudgetPolicy.softLimitMs);
  assert.equal(connectedBudgetPolicy.hardLimitMs, sentenceBudgetPolicy.hardLimitMs);
  assert.deepEqual(connectedBudgetPolicy.sceneIds, fixtures.map(({ id }) => id));
  assert.deepEqual(connectedBudgetPolicy.actualMemoryCounts, [0, 1, 2]);
  assert.ok(Object.isFrozen(connectedBudgetPolicy));
  assert.ok(Object.isFrozen(connectedBudgetPolicy.sceneIds));
});

test('real current-run production memories remain byte-identical across the compact road, arrival, and farewell', () => {
  const groundedArrival = groundArrivalMessages(arrivalGroundingPolicy.originalMessages);
  for (const [index, { fixture, continuity, messages }] of currentRunInputs().entries()) {
    const before = JSON.stringify({ fixture, messages });
    const compact = buildConnectedBudgetMessages(fixture, messages);
    assert.equal(JSON.stringify({ fixture, messages }), before);
    assert.equal(compact.length, index + 2);
    assert.equal(compact[0].content, groundedArrival[0].content);
    assert.deepEqual(compact.slice(1, -1), messages.slice(1, -1));
    assert.deepEqual(continuity.map(({ text }) => text), replies.slice(0, index));
    assert.deepEqual(production.buildCreativeWriterConversation(compact).slice(1, -1),
      production.buildCreativeWriterConversation(messages).slice(1, -1));
    const content = compact.at(-1).content;
    assert.ok(content.startsWith(`${fixture.facts.action}\n${fixture.facts.consequence}\n`));
    for (const identity of ['Mara', 'Rowan', 'loyalty', 'mercy', 'miller', 'shared-road oath', '1 shared victory']) {
      assert.ok(content.includes(identity), identity);
    }
    assert.ok(compact.reduce((total, { content }) => total + content.length, 0)
      < messages.reduce((total, { content }) => total + content.length, 0));
    assert.ok(Object.isFrozen(compact));
    assert.ok(compact.every(Object.isFrozen));
    if (index === 0) assert.match(content, /care for Rowan conflicts with uncertainty about their unfinished journey/u);
    if (index === 1) assert.equal(content, groundedArrival.at(-1).content);
    if (index === 2) {
      assert.match(content, /Rowan remains alive and injured in Greyford/u);
      assert.match(content, /no longer Mara's active companion/u);
      assert.match(content, /earlier care and relief develop into tenderness and uncertainty about this farewell/u);
    }
  }
});

test('foreign fixtures, changed current facts or identities, and malformed memory counts fail before compaction', () => {
  const inputs = currentRunInputs();
  assert.throws(() => buildConnectedBudgetMessages(createWebgpuV1ProductionCases()[3], inputs[0].messages), /exact three fixed/u);
  for (const change of [fixture => { fixture.facts.consequence = 'Rowan recovered.'; },
    fixture => { fixture.viewpoint.hero.name = 'Inez'; }, fixture => { fixture.viewpoint.companion.status = 'healed'; },
    fixture => { fixture.job.eventId = 'foreign:event'; }, fixture => { fixture.expected = 'Invent a reunion.'; }]) {
    const fixture = structuredClone(fixtures[0]); change(fixture);
    assert.throws(() => buildConnectedBudgetMessages(fixture, inputs[0].messages), /exact three fixed/u);
  }
  for (const value of [null, {}, [], inputs[0].messages, inputs[2].messages]) {
    assert.throws(() => buildConnectedBudgetMessages(fixtures[1], value), /production messages/u);
  }
  for (const change of [messages => { messages[1].role = 'assistant'; },
    messages => { messages[1].content = 'A replacement memory.'; }, messages => { messages[0].extra = true; },
    messages => { messages.at(-1).content = 'Rowan recovered.'; }]) {
    const messages = structuredClone(inputs[1].messages); change(messages);
    assert.throws(() => buildConnectedBudgetMessages(fixtures[1], messages), /production messages/u);
  }
});
