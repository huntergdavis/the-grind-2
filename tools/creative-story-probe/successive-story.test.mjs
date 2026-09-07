import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createSuccessiveStoryCases, isExactRecalledPassage } from './successive-story-cases.mjs';
import { successiveStoryBudgets, instrumentSuccessiveStoryWorker, inputInstrumentation,
  successiveStoryReportName } from './successive-story-contract.mjs';
import { instrumentation, bootInstrumentation, stoppingMarker } from './sentence-stopping-contract.mjs';

const worker = await readFile(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url), 'utf8');

test('two public fixtures advance the same injured living pair to the oath destination', () => {
  const [first, second] = createSuccessiveStoryCases();
  assert.equal(first.job.campaignId, second.job.campaignId);
  assert.ok(first.job.tick < second.job.tick);
  assert.notEqual(first.job.eventId, second.job.eventId);
  assert.deepEqual(first.viewpoint.hero, second.viewpoint.hero);
  assert.equal(first.viewpoint.companion.name, second.viewpoint.companion.name);
  assert.equal(first.viewpoint.companion.status, 'injured');
  assert.equal(second.viewpoint.companion.status, 'arrived-injured');
  assert.match(second.facts.consequence, /alive.*injured.*beside Mara/);
  assert.ok([first, second].every((item) => item.focus === 'shared-road' && !('memory' in item) && !('messages' in item)));
});

test('fresh detached fixtures use actual production source identity and no authored prior prose', () => {
  const cases = createSuccessiveStoryCases();
  for (const fixture of cases) assert.equal(fixture.identity, JSON.stringify([
    fixture.job.campaignId, fixture.job.eventId, fixture.job.tick, fixture.job.sourceFingerprint,
  ]));
  cases[0].viewpoint.hero.name = 'Changed';
  assert.equal(createSuccessiveStoryCases()[0].viewpoint.hero.name, 'Mara');
});

test('exact recalled prose is separately rejected without fuzzy literary judgments', () => {
  const memory = [{ text: 'Recorded imagined text.' }];
  assert.equal(isExactRecalledPassage('Recorded imagined text.', memory), true);
  assert.equal(isExactRecalledPassage('Recorded imagined text. Another sentence.', memory), false);
  assert.equal(isExactRecalledPassage(null, memory), false);
  assert.equal(isExactRecalledPassage('Recorded imagined text.', []), false);
});

test('instrumentation is fully removable and cannot alter production generation', () => {
  const observed = instrumentSuccessiveStoryWorker(worker);
  assert.equal(observed.replace(inputInstrumentation, '').replace(instrumentation, '').replace(bootInstrumentation, ''), worker);
  assert.ok(observed.includes(stoppingMarker));
  assert.match(observed, /effectiveMessages: boundedMessages/);
  assert.match(observed, /max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08/);
  assert.match(observed, /wasm.numThreads = 1/);
});

test('worker marker drift and changed output budget fail closed', () => {
  assert.throws(() => instrumentSuccessiveStoryWorker(worker.replace('  const activeTokenizer = tokenizer;', '')));
  assert.throws(() => instrumentSuccessiveStoryWorker(worker.replace('max_new_tokens: 64', 'max_new_tokens: 128')));
});

test('one two-write attempt includes cleanup within240seconds and unique receipts', () => {
  assert.equal(successiveStoryBudgets.work + successiveStoryBudgets.cleanup, successiveStoryBudgets.total);
  assert.equal(successiveStoryBudgets.total, 240_000);
  assert.equal(successiveStoryBudgets.write, 90_000);
  assert.notEqual(successiveStoryReportName(), successiveStoryReportName());
});

test('production journal selects only actual archived model prose and builder keeps later facts last', async () => {
  const server = await createServer({ configFile: false,
    root: fileURLToPath(new URL('../..', import.meta.url)), server: { middlewareMode: true }, logLevel: 'silent' });
  try {
    const { createNarrativeJournal } = await server.ssrLoadModule('/src/ui/narrative-journal.ts');
    const { selectNarrativeContinuity } = await server.ssrLoadModule('/src/ui/narrative-continuity.ts');
    const { buildCreativeStoryMessages, selectStorySeed } = await server.ssrLoadModule('/src/narrator/creative-story.ts');
    const [first, second] = createSuccessiveStoryCases();
    const journal = createNarrativeJournal(() => ({ getItem: () => null, setItem: () => {} }));
    const archive = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));
    const archivedModelText = archive.outputs.find((output) => output.id === 'injured-active-companion').cleaned;
    assert.ok(journal.record({ sourceEventId: first.job.eventId, campaignId: first.job.campaignId,
      sourceTick: first.job.tick, readyAtMs: 1, text: archivedModelText,
      location: first.facts.location, headline: first.facts.headline, origin: 'model', inspirationTone: 'care' }));
    const memory = selectNarrativeContinuity(journal.snapshot.entries, second.job, second.viewpoint);
    assert.equal(memory.length, 1);
    assert.ok(memory[0].text.length <= 240 && archivedModelText.includes(memory[0].text));
    const seed = selectStorySeed(second.mode, second.identity, second.attempt, { viewpoint: second.viewpoint, focus: second.focus });
    const messages = buildCreativeStoryMessages(second.job, seed, second.viewpoint, second.focus, memory);
    assert.equal(messages.length, 3);
    assert.ok(messages[1].content.endsWith(JSON.stringify(memory[0].text)));
    for (const fact of Object.values(second.facts)) assert.ok(messages.at(-1).content.includes(fact));
    assert.deepEqual(buildCreativeStoryMessages(second.job, seed, second.viewpoint, second.focus).at(-1), messages.at(-1));
    assert.ok(messages.every((message) => message.content.length <= 4000));
  } finally { await server.close(); }
});

test('isolated runner keeps explicit execution, exact cache-only load, offline writes and raw checkpoints', async () => {
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  const probe = await readFile(new URL('./successive-story-probe.js', import.meta.url), 'utf8');
  assert.match(runner, /verifyStagedArtifacts\(staged, manifest\.artifacts\)/);
  assert.match(runner, /flag: 'wx'/);
  assert.match(runner, /setOffline\(true\)/);
  assert.match(probe, /cacheOnly: true/);
  assert.match(probe, /client\.write\(fixture\.messages\)/);
  assert.match(probe, /selectNarrativeContinuity\(journal\.snapshot\.entries/);
  assert.doesNotMatch(probe, /client\.(direct|chooseMoment)\(|max_new_tokens|repetition_penalty/);
  assert.match(runner, /report\.outputs\.push\(output\);\s+report\.pending = null;\s+await checkpoint\(\)/);
});

test('multiple static worker build passes are distinct from the one actual runtime worker', async () => {
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  assert.match(runner, /report\.observedTransformCount = transformed/);
  assert.match(runner, /if \(transformed < 1\)/);
  assert.doesNotMatch(runner, /if \(transformed !== 1\)/);
  assert.match(runner, /page\.on\('worker'/);
  assert.match(runner, /url: worker\.url\(\)/);
  assert.match(runner, /if \(report\.runtimeWorkerCount !== 1\)/);
});
