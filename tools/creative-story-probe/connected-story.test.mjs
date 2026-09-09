import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';
import { buildConnectedBudgetMessages, connectedBudgetPolicy } from './connected-budget.mjs';
import { webgpuV1 as baselineWebgpuV1 } from './webgpu-v1-config.mjs';
import { webgpuCandidate, creativeWriterModelId, creativeWriterModelRevision,
  creativeWriterModelUrl, creativeWriterModelLib } from './webgpu-candidate-config.mjs';

let server, production;
const probeUrl = new URL('./webgpu-v1-probe.js', import.meta.url);
const source = await readFile(probeUrl, 'utf8');
const failedCandidate = JSON.parse(await readFile(new URL('./webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json', import.meta.url), 'utf8'));
const failedSequence = JSON.parse(await readFile(new URL('./webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json', import.meta.url), 'utf8'));
const connectedQuery = '?candidate-diagnostic=1&cache-only=1&connected-story=1';
const connectedBudgetQuery = connectedQuery + '&connected-budget=1';
// Mocked worker replies are unit-test data, never candidate quality evidence or probe templates.
const replies = [
  'Mara watched Rowan with quiet concern. Hope kept her beside him on the road.',
  'Mara felt relief beside Rowan in Greyford. His injured hand still troubled her.',
  'Mara let Rowan rest in Greyford. Their farewell carried tenderness and uncertainty.',
];

before(async () => {
  server = await createServer({ configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  production = Object.assign({}, ...await Promise.all([
    '/src/ui/narrative-journal.ts', '/src/ui/narrative-continuity.ts',
    '/src/narrator/creative-story.ts', '/src/narrator/story-character-anchor.ts',
    '/src/narrator/creative-writer-conversation.ts',
  ].map((path) => server.ssrLoadModule(path))));
});
after(async () => { await server?.close(); });

function createProbe(query = connectedQuery, responses = replies) {
  const sandbox = {};
  const calls = { loads: [], writes: [], workers: 0, terminated: 0 };
  const bindings = {
    ...production, createWebgpuV1ProductionCases, createSuccessiveStoryCases, isExactRecalledPassage,
    buildEmotionalSceneMessages, buildConnectedBudgetMessages, connectedBudgetPolicy,
    baselineWebgpuV1, webgpuCandidate, creativeWriterModelId,
    creativeWriterModelRevision, creativeWriterModelUrl, creativeWriterModelLib, failedCandidate, failedSequence,
    location: { search: query }, globalThis: sandbox,
    caches: { keys: async () => [] },
    CreateWebWorkerMLCEngine: () => { throw new Error('The exploratory engine is out of scope'); },
    Worker: class {
      constructor() { calls.workers += 1; }
      addEventListener() {}
      terminate() { calls.terminated += 1; }
    },
    createCreativeWriterClient({ createWorker }) {
      let worker;
      return {
        ready: false,
        async load(_progress, options) { worker = createWorker(); calls.loads.push(options); this.ready = true; },
        async write(messages) {
          calls.writes.push(structuredClone(messages));
          const response = responses[calls.writes.length - 1];
          if (response instanceof Error) throw response;
          return response;
        },
        dispose() { worker?.terminate(); this.ready = false; },
      };
    },
  };
  // Execute the actual browser orchestration. Only module loading and its browser/worker boundary are substituted.
  const executable = source.replace(/^import .+;\n/gmu, '')
    .replaceAll('import.meta.url', JSON.stringify(probeUrl.href));
  assert.doesNotMatch(executable, /^import /mu);
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  return { probe: sandbox.webgpuV1Probe, calls };
}

test('connected mode requires the isolated cached candidate and excludes other scene modes', () => {
  for (const query of ['?connected-story=1', '?connected-story=1&cache-only=1',
    '?connected-story=1&candidate-diagnostic=1', ...['candidate-scenes', 'production-scenes',
      'production-solo', 'replay-sequence', 'replay-farewell'].map((mode) => `${connectedQuery}&${mode}=1`)]) {
    assert.throws(() => createProbe(query), /require|exclusive/u, query);
  }
});

test('connected budget requires all isolated candidate flags and excludes every other scene or budget mode', () => {
  for (const required of ['candidate-diagnostic', 'cache-only', 'connected-story']) {
    assert.throws(() => createProbe(connectedBudgetQuery.replace(required + '=1', required + '=0')), /require|exclusive/u, required);
  }
  for (const conflicting of ['candidate-scenes', 'production-scenes', 'production-solo', 'replay-sequence',
    'replay-farewell', 'replay-arrival', 'compact-arrival', 'grounded-arrival', 'sentence-grammar', 'sentence-budget']) {
    assert.throws(() => createProbe(`${connectedBudgetQuery}&${conflicting}=1`), /require|exclusive/u, conflicting);
  }
});

test('grounded connected budget keeps 0 -> 1 -> 2 actual production-selected memories and exact original-message provenance', async () => {
  const { probe, calls } = createProbe(connectedBudgetQuery);
  await probe.load();
  const fixtures = createWebgpuV1ProductionCases().slice(0, 3);
  const outputs = [];
  for (const [index, fixture] of fixtures.entries()) {
    const prepared = probe.prepare(index);
    assert.equal(prepared.promptMode, 'grounded-connected-budget');
    assert.equal(prepared.rawOutputKind, 'client-result-after-cooperative-sentence-budget');
    assert.deepEqual(prepared.connectedBudgetPolicy, connectedBudgetPolicy);
    assert.equal(prepared.connectedSequence, true);
    assert.equal(prepared.expectedActualMemories, index);
    assert.equal(prepared.journalScope, 'owned-memory-only');
    assert.deepEqual(prepared.continuity.map(({ text }) => text), outputs.map(({ cleaned }) => cleaned));
    assert.deepEqual(prepared.actualMemorySourceEventIds, fixtures.slice(0, index).map(({ job }) => job.eventId));
    const original = production.buildCreativeStoryMessages(fixture.job, prepared.seed, fixture.viewpoint, fixture.focus, prepared.continuity);
    assert.deepEqual(prepared.originalMessages, original);
    assert.deepEqual(prepared.messages, buildConnectedBudgetMessages(fixture, original));
    assert.deepEqual(prepared.messages.slice(1, -1), original.slice(1, -1));
    assert.deepEqual(prepared.modelMessages.slice(1, -1), production.buildCreativeWriterConversation(original).slice(1, -1));
    const output = await probe.write(index);
    assert.equal(output.raw, replies[index]);
    assert.equal(output.acceptedNewStory, true);
    assert.equal(output.archived, true);
    assert.equal(output.journal.persistent, false);
    assert.deepEqual(output.journal.entries.map(({ text }) => text), replies.slice(0, index + 1).reverse());
    outputs.push(output);
  }
  assert.deepEqual(calls.loads, [{ cacheOnly: true }]);
  assert.equal(calls.workers, 1);
  assert.deepEqual(calls.writes, outputs.map(({ messages }) => messages));
  assert.throws(() => probe.prepare(3), /selected ordered/u);
  await assert.rejects(probe.write(3), /Prepare each scene once/u);
  probe.dispose();
  assert.equal(calls.terminated, 1);
  const fresh = createProbe(connectedBudgetQuery);
  await fresh.probe.load();
  assert.deepEqual(fresh.probe.prepare(0).continuity, []);
  assert.equal(fresh.calls.writes.length, 0);
  fresh.probe.dispose();
});

test('grounded connected budget cannot replace a failed, unanchored, or repeated memory with saved prose', async () => {
  for (const response of [new Error('Mocked worker failure'), 'A stranger watched the road.']) {
    const { probe } = createProbe(connectedBudgetQuery, [response]);
    await probe.load(); probe.prepare(0);
    const output = await probe.write(0);
    assert.ok(output.status === 'failed' || !output.acceptedNewStory);
    assert.throws(() => probe.prepare(1), /Expected 1 actual production-selected memories, received 0/u);
    probe.dispose();
  }
  const { probe } = createProbe(connectedBudgetQuery, [replies[0], replies[0]]);
  await probe.load(); probe.prepare(0); await probe.write(0); probe.prepare(1);
  const repeated = await probe.write(1);
  assert.equal(repeated.recalledPassageRepeat, true);
  assert.equal(repeated.archived, false);
  assert.throws(() => probe.prepare(2), /Expected 2 actual production-selected memories, received 1/u);
  probe.dispose();
});

test('three actual current-run replies supply 0 -> 1 -> 2 production memories, never a fourth scene', async () => {
  const { probe, calls } = createProbe();
  await probe.load();
  const fixtures = createWebgpuV1ProductionCases().slice(0, 3);
  const outputs = [];
  for (const [index, fixture] of fixtures.entries()) {
    const prepared = probe.prepare(index);
    assert.equal(prepared.id, fixture.id);
    assert.equal(prepared.promptMode, 'unmodified-production-builder');
    assert.equal(prepared.connectedSequence, true);
    assert.equal(prepared.journalScope, 'owned-memory-only');
    assert.equal(prepared.expectedActualMemories, index);
    assert.deepEqual(prepared.actualMemorySourceEventIds, fixtures.slice(0, index).map((entry) => entry.job.eventId));
    assert.deepEqual(prepared.continuity.map((entry) => entry.text), outputs.map((entry) => entry.cleaned));
    const seed = production.selectStorySeed(fixture.mode, fixture.identity, fixture.attempt,
      { viewpoint: fixture.viewpoint, focus: fixture.focus });
    assert.deepEqual(prepared.messages, production.buildCreativeStoryMessages(
      fixture.job, seed, fixture.viewpoint, fixture.focus, prepared.continuity));
    for (const fact of Object.values(fixture.facts)) assert.ok(prepared.messages.at(-1).content.includes(fact));
    const output = await probe.write(index);
    assert.equal(output.status, 'completed');
    assert.equal(output.acceptedNewStory, true);
    assert.equal(output.archived, true);
    assert.equal(output.journal.persistent, false);
    assert.equal(output.journal.entries.length, index + 1);
    outputs.push(output);
  }
  assert.throws(() => probe.prepare(3), /selected ordered/u);
  await assert.rejects(probe.write(3), /Prepare each scene once/u);
  await assert.rejects(probe.load(), /Exactly one GPU model load/u);
  assert.deepEqual(calls.loads, [{ cacheOnly: true }]);
  assert.equal(calls.workers, 1);
  assert.equal(calls.writes.length, 3);
  assert.deepEqual(calls.writes, outputs.map((output) => output.messages));
  probe.dispose();
  assert.equal(calls.terminated, 1);
});

test('failed or unaccepted replies cannot silently become the next scene memory', async () => {
  for (const response of [new Error('Mocked worker failure'), 'A stranger watched the road.']) {
    const { probe } = createProbe(connectedQuery, [response]);
    await probe.load();
    probe.prepare(0);
    const output = await probe.write(0);
    assert.ok(output.status === 'failed' || output.acceptedNewStory === false);
    assert.throws(() => probe.prepare(1), /Expected 1 actual production-selected memories, received 0/u);
    probe.dispose();
  }
  const { probe } = createProbe(connectedQuery, [replies[0], replies[0]]);
  await probe.load();
  probe.prepare(0);
  await probe.write(0);
  probe.prepare(1);
  const repeated = await probe.write(1);
  assert.equal(repeated.recalledPassageRepeat, true);
  assert.equal(repeated.acceptedNewStory, false);
  assert.equal(repeated.archived, false);
  assert.throws(() => probe.prepare(2), /Expected 2 actual production-selected memories, received 1/u);
  probe.dispose();
});

test('each connected run starts empty, without reading or writing the game archive', async () => {
  const first = createProbe();
  await first.probe.load();
  first.probe.prepare(0);
  await first.probe.write(0);
  const second = createProbe();
  await second.probe.load();
  assert.deepEqual(second.probe.prepare(0).continuity, []);
  assert.match(source, /createNarrativeJournal\(\(\) => \(\{ getItem: \(\) => null, setItem: \(\) => \{\} \}\)\)/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u);
  first.probe.dispose();
  second.probe.dispose();
});

test('sentence-only recalled subsets, reorderings and collages fail admission without changing the historical exact flag', async () => {
  const roadFirst = 'Mara watched Rowan with quiet concern.';
  const arrivalFirst = 'Mara felt relief beside Rowan in Greyford.';
  const cases = [
    [replies[0], roadFirst],
    [replies[0], `Hope kept her beside him on the road. ${roadFirst}`],
    [replies[0], replies[1], `${roadFirst} ${arrivalFirst}`],
  ];
  for (const responses of cases) {
    const { probe } = createProbe(connectedBudgetQuery, responses);
    await probe.load();
    let output;
    for (const index of responses.keys()) {
      probe.prepare(index);
      output = await probe.write(index);
      if (index < responses.length - 1) assert.equal(output.archived, true);
    }
    assert.equal(output.cleaned, responses.at(-1));
    assert.equal(output.characterAnchorPreserved, true);
    assert.equal(output.exactMemoryRepeat, false);
    assert.equal(output.recalledPassageRepeat, true);
    assert.equal(output.acceptedNewStory, false);
    assert.equal(output.archived, false);
    assert.equal(output.journal.entries.length, responses.length - 1);
    probe.dispose();
  }
});

test('a copied sentence with a fresh complete sentence remains eligible for connected memory', async () => {
  const mixed = 'Mara watched Rowan with quiet concern. Mara welcomed the silence around Rowan.';
  const { probe } = createProbe(connectedBudgetQuery, [replies[0], mixed]);
  await probe.load();
  probe.prepare(0);
  await probe.write(0);
  probe.prepare(1);
  const output = await probe.write(1);
  assert.equal(output.cleaned, mixed);
  assert.equal(output.exactMemoryRepeat, false);
  assert.equal(output.recalledPassageRepeat, false);
  assert.equal(output.acceptedNewStory, true);
  assert.equal(output.archived, true);
  assert.equal(output.journal.entries.length, 2);
  assert.deepEqual(probe.prepare(2).continuity.map(({ text }) => text), [replies[0], mixed]);
  probe.dispose();
});

test('the original one-scene diagnostic still replays exact inputs and never archives', async () => {
  const { probe } = createProbe('?candidate-diagnostic=1&cache-only=1');
  await probe.load();
  const prepared = probe.prepare(0);
  assert.equal(prepared.promptMode, 'exact-recorded-production-messages');
  assert.deepEqual(prepared.messages, failedCandidate.outputs[0].messages);
  assert.equal(prepared.connectedSequence, undefined);
  const output = await probe.write(0);
  assert.equal(output.acceptedNewStory, true);
  assert.equal(output.archived, false);
  assert.equal(output.journal.entries.length, 0);
  assert.throws(() => probe.prepare(1), /selected ordered/u);
  probe.dispose();
});
