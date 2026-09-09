import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { parseWebgpuV1Arguments, hasConnectedStoryProgress } from './run-webgpu-v1.mjs';
import { connectedBudgetPolicy, buildConnectedBudgetMessages } from './connected-budget.mjs';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';

const required = ['--run', '--candidate-diagnostic', '--cache-only', '--inspect-model-buffer',
  '--inspect-dispatch', '--submit-each-dispatch', '--complete-story', '--repair-softmax-race', '--connected-story'];
const args = [...required, '--connected-budget'];

test('connected budget requires the complete cache-only chain and never mixes arrival or grammar experiments', () => {
  const selected = parseWebgpuV1Arguments(args);
  assert.equal(selected.connectedBudget, true);
  assert.equal(selected.connectedStory, true);
  assert.equal(selected.cacheOnly, true);
  assert.equal(selected.sentenceBudget, false);
  assert.equal(parseWebgpuV1Arguments(required).connectedBudget, undefined);
  for (const removed of required) assert.throws(() => parseWebgpuV1Arguments(args.filter(arg => arg !== removed)), /Usage:/u);
  for (const extra of ['--connected-budget', '--replay-arrival', '--compact-arrival', '--grounded-arrival',
    '--sentence-budget', '--sentence-grammar', '--allow-model-download', '--observe-pre-sort', '--production-scenes']) {
    assert.throws(() => parseWebgpuV1Arguments([...args, extra]), /Usage:/u, extra);
  }
});

test('connected runner uses matching manual/build transforms, numbered evidence and existing three-scene limits', async () => {
  const source = await readFile(new URL('./run-webgpu-v1.mjs', import.meta.url), 'utf8');
  assert.equal(source.split('...(useSentenceBudget ? [sentenceBudgetPlugin(repo, { connected: connectedBudget })] : [])').length - 1, 2);
  assert.equal(source.split('...(observeWriteTiming ? [writeTimingPlugin(repo, diagnosticRuntimePaths, { connected: connectedBudget })] : [])').length - 1, 2);
  assert.match(source, /sentenceBudgetObservations\[connectedBudget \? index : 0\]/u);
  assert.match(source, /hasCompleteConnectedBudgetEvidence\(report, index \+ 1\)/u);
  assert.match(source, /const plannedScenes = connectedStory \? 3 :/u);
  assert.match(source, /const totalDeadlineMs = connectedStory \? 600_000 :/u);
  assert.match(source, /connected-story=1&connected-budget=1/u);
});

test('connected progress preserves real production-selected memories and rejects a changed prompt or provenance', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  try {
    const production = Object.assign({}, ...await Promise.all([
      '/src/narrator/creative-story.ts', '/src/ui/narrative-journal.ts', '/src/ui/narrative-continuity.ts',
    ].map(path => server.ssrLoadModule(path))));
    const journal = production.createNarrativeJournal(() => ({ getItem: () => null, setItem: () => {} }));
    // Mock prose for wiring only, never model-quality evidence or supplied trial history.
    const replies = ['Mara worried for Rowan on the road.', 'Mara felt relief beside injured Rowan.', 'Mara said goodbye to Rowan with tenderness.'];
    const outputs = [];
    for (const [index, fixture] of createWebgpuV1ProductionCases().slice(0, 3).entries()) {
      const continuity = production.selectNarrativeContinuity(journal.snapshot.entries, fixture.job, fixture.viewpoint);
      const seed = production.selectStorySeed(fixture.mode, fixture.identity, fixture.attempt, { viewpoint: fixture.viewpoint, focus: fixture.focus });
      const originalMessages = production.buildCreativeStoryMessages(fixture.job, seed, fixture.viewpoint, fixture.focus, continuity);
      const messages = buildConnectedBudgetMessages(fixture, originalMessages);
      assert.equal(journal.record({ sourceEventId: fixture.job.eventId, campaignId: fixture.job.campaignId,
        sourceTick: fixture.job.tick, readyAtMs: 1000 + index, text: replies[index], location: fixture.facts.location,
        headline: fixture.facts.headline, origin: 'model' }), true);
      outputs.push({ ...fixture, continuity, originalMessages, messages, connectedBudgetPolicy,
        status: 'completed', acceptedNewStory: true, archived: true, characterAnchorPreserved: true,
        productionChatReset: true, connectedSequence: true, promptMode: 'grounded-connected-budget',
        journalScope: 'owned-memory-only', expectedActualMemories: index,
        actualMemorySourceEventIds: continuity.map(memory => memory.sourceEventId), cleaned: replies[index],
        journal: { ...journal.snapshot, persistent: false } });
      assert.equal(hasConnectedStoryProgress(outputs, { connectedBudget: true }), true);
      assert.equal(hasConnectedStoryProgress(outputs), false);
    }
    for (const mutate of [
      output => { output.messages[0].content += ' Changed instruction.'; },
      output => { output.originalMessages[1].content += ' Changed memory.'; },
      output => {
        const foreign = 'Earlier imagined passage (not game facts):\n' + JSON.stringify({ text: 'Foreign fiction.', scene: output.continuity[0].scene });
        output.originalMessages[1].content = foreign;
        output.messages[1].content = foreign;
      },
      output => { output.continuity[0].text = 'Invented memory.'; },
      output => { output.actualMemorySourceEventIds[0] = 'foreign'; },
      output => { output.connectedBudgetPolicy.productionMessagesUnchanged = true; },
    ]) {
      const changed = structuredClone(outputs); mutate(changed[2]);
      assert.equal(hasConnectedStoryProgress(changed, { connectedBudget: true }), false, mutate.toString());
    }
  } finally { await server.close(); }
});
