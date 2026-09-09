import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createWebgpuV1ProductionCases } from './webgpu-v1-cases.mjs';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';
import { webgpuV1 as baselineWebgpuV1 } from './webgpu-v1-config.mjs';
import { webgpuCandidate, creativeWriterModelId, creativeWriterModelRevision,
  creativeWriterModelUrl, creativeWriterModelLib } from './webgpu-candidate-config.mjs';
import { compactArrivalMessages, arrivalContextPolicy } from './arrival-context.mjs';
import { groundArrivalMessages, arrivalGroundingPolicy } from './arrival-grounding.mjs';
import { arrivalOutputShapePolicy, inspectArrivalOutputShape } from './arrival-output-shape.mjs';

const receiptName = 'webgpu-candidate-report-2026-09-09T06-39-03-194Z-85f1c932.json';
const failedConnectedSequence = JSON.parse(await readFile(new URL(receiptName, import.meta.url), 'utf8'));
const failedCandidate = JSON.parse(await readFile(new URL('./webgpu-candidate-report-2026-09-08T22-39-25-104Z-700078b2.json', import.meta.url), 'utf8'));
const failedSequence = JSON.parse(await readFile(new URL('./webgpu-v1-report-2026-09-08T09-35-34-796Z-bca127e5.json', import.meta.url), 'utf8'));
const probeUrl = new URL('./webgpu-v1-probe.js', import.meta.url);
const source = await readFile(probeUrl, 'utf8');
const arrivalQuery = '?candidate-diagnostic=1&cache-only=1&replay-arrival=1';
// Mocked reply tests orchestration only; it is neither a candidate result nor supplied probe prose.
const reply = 'Mara felt relief beside Rowan in Greyford. His injured hand still troubled her.';
let server, production;

before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  production = Object.assign({}, ...await Promise.all([
    '/src/ui/narrative-journal.ts', '/src/ui/narrative-continuity.ts', '/src/narrator/creative-story.ts',
    '/src/narrator/story-character-anchor.ts', '/src/narrator/creative-writer-conversation.ts',
  ].map((path) => server.ssrLoadModule(path))));
});
after(async () => { await server?.close(); });

function createProbe(query = arrivalQuery, response = reply) {
  const sandbox = {}, calls = { loads: [], writes: [], workers: 0, terminated: 0, archiveWrites: 0 };
  const bindings = { ...production, createWebgpuV1ProductionCases, createSuccessiveStoryCases,
    isExactRecalledPassage, buildEmotionalSceneMessages, baselineWebgpuV1, webgpuCandidate,
    creativeWriterModelId, creativeWriterModelRevision, creativeWriterModelUrl, creativeWriterModelLib,
    failedCandidate, failedSequence, failedConnectedSequence, compactArrivalMessages, arrivalContextPolicy,
    groundArrivalMessages, arrivalGroundingPolicy, arrivalOutputShapePolicy, inspectArrivalOutputShape,
    location: { search: query }, globalThis: sandbox, caches: { keys: async () => [] },
    CreateWebWorkerMLCEngine: () => { throw new Error('The exploratory engine is out of scope'); },
    createNarrativeJournal(storage) {
      const journal = production.createNarrativeJournal(storage);
      return { get snapshot() { return journal.snapshot; }, record(passage) {
        calls.archiveWrites += 1; return journal.record(passage);
      } };
    },
    Worker: class {
      constructor() { calls.workers += 1; }
      addEventListener() {}
      terminate() { calls.terminated += 1; }
    },
    createCreativeWriterClient({ createWorker }) {
      let worker;
      return { ready: false,
        async load(_progress, options) { worker = createWorker(); calls.loads.push(options); this.ready = true; },
        async write(messages) {
          calls.writes.push(structuredClone(messages));
          if (response instanceof Error) throw response;
          return response;
        },
        dispose() { worker?.terminate(); this.ready = false; },
      };
    },
  };
  const executable = source.replace(/^import .+;\n/gmu, '').replaceAll('import.meta.url', JSON.stringify(probeUrl.href));
  assert.doesNotMatch(executable, /^import /mu);
  new Function(...Object.keys(bindings), executable)(...Object.values(bindings));
  return { probe: sandbox.webgpuV1Probe, calls };
}

test('grammar replay preserves grounded messages and inspects unmodified output without archiving', async () => {
  const query = arrivalQuery + '&compact-arrival=1&grounded-arrival=1&sentence-grammar=1';
  for (const flag of ['candidate-diagnostic', 'cache-only', 'replay-arrival', 'compact-arrival', 'grounded-arrival']) {
    assert.throws(() => createProbe(query.replace(flag + '=1', flag + '=0')), /require|exclusive/u, flag);
  }
  const { probe, calls } = createProbe(query);
  await probe.load();
  const prepared = probe.prepare(0);
  assert.deepEqual(prepared.messages, groundArrivalMessages(failedConnectedSequence.outputs[1].messages));
  assert.deepEqual(prepared.arrivalOutputShapePolicy, arrivalOutputShapePolicy);
  assert.equal(prepared.modelMessages[2].content, failedConnectedSequence.outputs[0].cleaned);
  const result = await probe.write(0);
  assert.equal(result.raw, reply);
  assert.equal(result.outputShape.valid, false); // Ordinary admission is not this new shape contract.
  assert.deepEqual(result.outputShape, inspectArrivalOutputShape(reply));
  assert.deepEqual(calls.writes, [prepared.messages]);
  assert.equal(result.archived, false);
  assert.equal(calls.archiveWrites, 0);
  probe.dispose();
});

test('saved arrival requires the isolated cache-only candidate and rejects every other scene mode', () => {
  for (const query of ['?replay-arrival=1', '?replay-arrival=1&cache-only=1',
    '?replay-arrival=1&candidate-diagnostic=1', ...['connected-story', 'candidate-scenes',
      'production-scenes', 'production-solo', 'replay-farewell', 'replay-sequence'].map((flag) => `${arrivalQuery}&${flag}=1`)]) {
    assert.throws(() => createProbe(query), /require|exclusive/u, query);
  }
});

test('saved arrival submits exact recorded messages and actual recorded road prose in one fresh worker', async () => {
  const beforeReceipt = JSON.stringify(failedConnectedSequence);
  const [road, arrival] = failedConnectedSequence.outputs;
  assert.equal(road.status, 'completed');
  assert.equal(road.acceptedNewStory, true);
  assert.equal(arrival.id, 'injured-companion-arrives-alive');
  assert.equal(arrival.status, 'failed');
  assert.equal(arrival.raw, null);
  assert.deepEqual(arrival.messages, failedConnectedSequence.inputs[1].messages);
  assert.equal(arrival.continuity.length, 1);
  assert.equal(arrival.continuity[0].text, road.cleaned);
  assert.equal(arrival.continuity[0].sourceEventId, road.job.eventId);
  assert.equal(arrival.continuity[0].campaignId, road.job.campaignId);
  assert.equal(arrival.continuity[0].sourceTick, road.job.tick);

  const { probe, calls } = createProbe();
  await probe.load();
  const prepared = probe.prepare(0);
  for (const field of ['id', 'fixtureKind', 'mode', 'focus', 'facts', 'job', 'viewpoint',
    'identity', 'attempt', 'seed', 'continuity', 'messages', 'modelMessages']) {
    assert.deepEqual(prepared[field], arrival[field], field);
  }
  assert.equal(prepared.promptMode, 'exact-recorded-production-messages');
  assert.equal(prepared.diagnosticReplay, true);
  assert.equal(prepared.journalScope, 'none');
  assert.deepEqual(prepared.arrivalReplay, { receipt: receiptName, originalScene: 2,
    lifecycle: 'fresh-worker-exact-messages-not-original-sequence', history: 'actual-recorded-prior-prose' });
  for (const field of ['connectedSequence', 'expectedActualMemories', 'actualMemorySourceEventIds',
    'status', 'error', 'raw', 'cleaned', 'partialOutputOnly']) assert.equal(prepared[field], undefined, field);

  const output = await probe.write(0);
  assert.equal(output.status, 'completed');
  assert.equal(output.acceptedNewStory, true);
  assert.equal(output.archived, false);
  assert.equal(output.independentChatReset, true);
  assert.deepEqual(output.journal, { entries: [], persistent: false });
  assert.deepEqual(calls.loads, [{ cacheOnly: true }]);
  assert.deepEqual(calls.writes, [failedConnectedSequence.inputs[1].messages]);
  assert.equal(calls.workers, 1);
  assert.equal(calls.archiveWrites, 0);
  assert.throws(() => probe.prepare(1), /selected ordered/u);
  await assert.rejects(probe.write(1), /Prepare each scene once/u);
  await assert.rejects(probe.load(), /Exactly one GPU model load/u);
  probe.dispose();
  assert.equal(calls.terminated, 1);
  assert.equal(JSON.stringify(failedConnectedSequence), beforeReceipt);
});

test('compact arrival submits only the declared variant and preserves exact original input provenance', async () => {
  assert.throws(() => createProbe('?compact-arrival=1'), /requires/u);
  const { probe, calls } = createProbe(`${arrivalQuery}&compact-arrival=1`);
  await probe.load();
  const prepared = probe.prepare(0);
  const original = failedConnectedSequence.outputs[1].messages;
  assert.equal(prepared.promptMode, 'compacted-recorded-arrival-messages');
  assert.equal(prepared.arrivalReplay.lifecycle, arrivalContextPolicy.lifecycle);
  assert.equal(prepared.arrivalGroundingPolicy, undefined);
  assert.deepEqual(prepared.originalMessages, original);
  assert.deepEqual(prepared.messages, compactArrivalMessages(original));
  assert.deepEqual(prepared.messages[1], original[1]);
  assert.equal(prepared.modelMessages[2].content, failedConnectedSequence.outputs[0].cleaned);
  const result = await probe.write(0);
  assert.deepEqual(calls.writes, [prepared.messages]);
  assert.equal(result.archived, false);
  assert.equal(calls.archiveWrites, 0);
  assert.throws(() => probe.prepare(1), /selected ordered/u);
  probe.dispose();
});

test('grounded arrival requires compact replay and preserves all existing browser mode gates', () => {
  const flags = ['candidate-diagnostic', 'cache-only', 'replay-arrival', 'compact-arrival'];
  for (const excluded of flags) {
    const query = '?' + [...flags.filter(flag => flag !== excluded), 'grounded-arrival'].map(flag => `${flag}=1`).join('&');
    assert.throws(() => createProbe(query), /require|exclusive/u, excluded);
  }
  for (const extra of ['connected-story', 'candidate-scenes', 'production-scenes', 'production-solo', 'replay-farewell', 'replay-sequence']) {
    assert.throws(() => createProbe(`${arrivalQuery}&compact-arrival=1&grounded-arrival=1&${extra}=1`), /require|exclusive/u, extra);
  }
});

test('grounded arrival keeps actual prior prose and compact current facts while exposing its own policy', async () => {
  const beforeReceipt = JSON.stringify(failedConnectedSequence);
  const original = failedConnectedSequence.outputs[1].messages;
  const compact = compactArrivalMessages(original);
  const { probe, calls } = createProbe(`${arrivalQuery}&compact-arrival=1&grounded-arrival=1`);
  await probe.load();
  const prepared = probe.prepare(0);
  assert.equal(prepared.promptMode, 'grounded-compacted-recorded-arrival-messages');
  assert.equal(prepared.arrivalReplay.lifecycle, arrivalGroundingPolicy.lifecycle);
  assert.deepEqual(prepared.arrivalGroundingPolicy, arrivalGroundingPolicy);
  assert.deepEqual(prepared.arrivalContextPolicy, arrivalContextPolicy);
  assert.deepEqual(prepared.originalMessages, original);
  assert.deepEqual(prepared.messages, groundArrivalMessages(original));
  assert.notEqual(prepared.messages[0].content, compact[0].content);
  assert.deepEqual(prepared.messages[1], original[1]);
  assert.deepEqual(prepared.messages[2], compact[2]);
  assert.deepEqual(prepared.modelMessages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(prepared.modelMessages[2].content, failedConnectedSequence.outputs[0].cleaned);
  assert.deepEqual(prepared.modelMessages.slice(1), production.buildCreativeWriterConversation(compact).slice(1));
  assert.equal(prepared.journalScope, 'none');
  const output = await probe.write(0);
  assert.deepEqual(calls.writes, [prepared.messages]);
  assert.equal(output.status, 'completed');
  assert.equal(output.archived, false);
  assert.deepEqual(output.journal, { entries: [], persistent: false });
  assert.equal(calls.workers, 1);
  assert.equal(calls.archiveWrites, 0);
  assert.throws(() => probe.prepare(1), /selected ordered/u);
  await assert.rejects(probe.write(1), /Prepare each scene once/u);
  probe.dispose();
  assert.equal(JSON.stringify(failedConnectedSequence), beforeReceipt);
});

test('failed arrival replay cannot write an archive or advance to another scene', async () => {
  const { probe, calls } = createProbe(arrivalQuery, new Error('Mocked worker timeout'));
  await probe.load();
  probe.prepare(0);
  const output = await probe.write(0);
  assert.equal(output.status, 'failed');
  assert.equal(output.raw, null);
  assert.equal(output.cleaned, null);
  assert.equal(output.connectedSequence, undefined);
  assert.equal(output.arrivalReplay.lifecycle, 'fresh-worker-exact-messages-not-original-sequence');
  assert.throws(() => probe.prepare(1), /selected ordered/u);
  assert.equal(calls.archiveWrites, 0);
  assert.equal(calls.writes.length, 1);
  probe.dispose();
});

test('connected mode still starts with new empty memory rather than the saved arrival history', async () => {
  const { probe, calls } = createProbe('?candidate-diagnostic=1&cache-only=1&connected-story=1');
  await probe.load();
  const prepared = probe.prepare(0);
  assert.equal(prepared.id, 'injured-companion-on-the-road');
  assert.equal(prepared.connectedSequence, true);
  assert.equal(prepared.promptMode, 'unmodified-production-builder');
  assert.equal(prepared.arrivalReplay, undefined);
  assert.deepEqual(prepared.continuity, []);
  const output = await probe.write(0);
  assert.equal(output.archived, true);
  assert.equal(calls.archiveWrites, 1);
  assert.equal(probe.prepare(1).continuity[0].text, reply);
  assert.match(source, /createNarrativeJournal\(\(\) => \(\{ getItem: \(\) => null, setItem: \(\) => \{\} \}\)\)/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/u);
  probe.dispose();
});
