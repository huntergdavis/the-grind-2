import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';
import { createSuccessiveStoryCases } from './successive-story-cases.mjs';
import { instrumentSuccessiveStoryWorker } from './successive-story-contract.mjs';
import { emotion360mProfile, emotion360mBudgets, identityReplacements, outputReplacement,
  applyEmotion360mIdentity, instrumentEmotion360mWorker } from './emotion-360m-contract.mjs';

const worker = await readFile(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../../src/narrator/creative-writer-client.ts', import.meta.url), 'utf8');
const cases = createSuccessiveStoryCases();
const reverseIdentity = (source) => identityReplacements.reduce((text, [before, after]) => text.replace(after, before), source);

test('candidate retains exact public facts without supplying fictional sentences or a host prefix', () => {
  for (const fixture of cases) {
    const messages = buildEmotionalSceneMessages(fixture.job, fixture.viewpoint, fixture.focus);
    assert.equal(messages.length, 2);
    for (const key of ['location', 'action', 'consequence']) assert.ok(messages[1].content.includes(fixture.facts[key]));
    assert.ok(messages[1].content.includes('Mara beside Rowan'));
    assert.ok(messages[0].content.includes('two short fantasy story sentences'));
    assert.ok(messages[0].content.includes('Do not recap facts'));
    assert.ok(JSON.stringify(messages).length < 1300);
    assert.ok(Object.isFrozen(messages) && messages.every(Object.isFrozen));
  }
  assert.match(buildEmotionalSceneMessages(cases[0].job, cases[0].viewpoint, 'shared-road')[1].content, /care for the injured companion mixed with uncertainty/);
  assert.match(buildEmotionalSceneMessages(cases[1].job, cases[1].viewpoint, 'shared-road')[1].content, /relief at arriving mixed with concern/);
});

test('instructions derive from arbitrary public names, actual status and selected focus, not fixture IDs', () => {
  const changed = structuredClone(cases[0]);
  changed.viewpoint.hero.name = 'Inez';
  changed.viewpoint.companion.name = 'Aster';
  changed.viewpoint.companion.status = 'travelling';
  changed.job.facts = { location: 'Eastmere', action: 'Inez and Aster walk.', consequence: 'The road continues.' };
  const content = buildEmotionalSceneMessages(changed.job, changed.viewpoint, 'shared-road')[1].content;
  assert.match(content, /Inez beside Aster/);
  assert.doesNotMatch(content, /Mara|Rowan|Greyford|injur|relief at arriving/);
  assert.match(content, /trust in the companion mixed with uncertainty/);
  changed.viewpoint.companion = null;
  changed.viewpoint.hero.values = ['curiosity'];
  assert.match(buildEmotionalSceneMessages(changed.job, changed.viewpoint, 'inner-life')[1].content, /Inez's wonder and uncertainty/);
});

test('production-selected memory remains byte-identical and final current facts remain last', () => {
  const memory = { role: 'user', content: 'Earlier imagined passage (not game facts):\n"Inez worried."' };
  const messages = buildEmotionalSceneMessages(cases[1].job, cases[1].viewpoint, cases[1].focus, [memory]);
  assert.deepEqual(messages[1], memory);
  assert.notEqual(messages[1], memory);
  memory.content = 'mutated';
  assert.ok(messages[1].content.endsWith('"Inez worried."'));
  assert.match(messages[0].content, /current facts take priority/);
  assert.ok(messages.at(-1).content.includes(cases[1].facts.consequence));
  assert.throws(() => buildEmotionalSceneMessages(cases[0].job, cases[0].viewpoint, 'shared-road', [memory]));
});

test('model profile changes exactly identity and64→40, preserving production inference and cache policy', () => {
  assert.equal(reverseIdentity(applyEmotion360mIdentity(client)), client);
  const candidate = instrumentEmotion360mWorker(worker);
  assert.equal(reverseIdentity(candidate.replace(outputReplacement[1], outputReplacement[0])), instrumentSuccessiveStoryWorker(worker));
  for (const marker of ['max_new_tokens: 40, do_sample: false, repetition_penalty: 1.08',
    'stopping_criteria: new FinishedPassageCriteria()', 'wasm.numThreads = 1;', 'inputLength > 1_024',
    'local_files_only: localOnly', 'cacheOnly']) assert.ok(candidate.includes(marker));
  assert.equal(emotion360mProfile.artifactBytes, 366_673_969);
  assert.deepEqual(emotion360mBudgets, { total: 295000, work: 290000, cleanup: 5000, load: 90000, write: 90000 });
});

test('unexpected profile or generation drift fails closed and transformed worker/client parse', async () => {
  assert.throws(() => applyEmotion360mIdentity(worker.replace(identityReplacements[0][0], 'other')));
  assert.throws(() => instrumentEmotion360mWorker(worker.replace('max_new_tokens: 64', 'max_new_tokens: 100')));
  assert.ok((await transformWithOxc(instrumentEmotion360mWorker(worker), 'creative-writer.worker.ts')).code.includes('max_new_tokens: 40'));
  assert.ok((await transformWithOxc(applyEmotion360mIdentity(client), 'creative-writer-client.ts')).code.includes(emotion360mProfile.modelId));
});

test('runner preserves unique reports, verified staging and real journal continuity before offline writes', async () => {
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  const probe = await readFile(new URL('./successive-story-probe.js', import.meta.url), 'utf8');
  for (const marker of ['--emotion-360m', "{ flag: 'wx' }", 'verifyStagedArtifacts(staged, manifest.artifacts)',
    'context.setOffline(true)', 'Cache-only model load exceeded90seconds', 'Historical comparison is not fresh paired A/B']) assert.ok(runner.includes(marker));
  for (const marker of ['selectNarrativeContinuity(journal.snapshot.entries', 'productionMessages.slice(1, -1)',
    'journal.record(', "origin: 'model'", '{ cacheOnly: true }']) assert.ok(probe.includes(marker));
  assert.ok(probe.indexOf('await cache.put(entry.key, response)') < probe.indexOf('async boot()'));
});

test('persistent mode only changes task-owned browser storage with explicit cleanup and unchanged candidate settings', async () => {
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  for (const marker of ['--emotion-360m-persistent', 'emotion-360m-persistent-',
    "mkdtemp(join(tmpdir(), 'tg2-emotion-360m-profile-'))",
    'chromium.launchPersistentContext(ownedProfile, { headless: true })',
    'storageBeforePrime', 'storageAfterPrime', 'priorStorageFailure',
    'await browserContext?.close()', 'await rm(ownedProfile, { recursive: true, force: true })',
    'report.temporaryProfile.removed = true']) assert.ok(runner.includes(marker));
  assert.ok(runner.indexOf('await browserContext?.close()') < runner.indexOf('await rm(ownedProfile,'));
  assert.ok(runner.includes('const budgets = emotion360m ? emotion360mBudgets : successiveStoryBudgets'));
  assert.ok(runner.includes('const emotion360m = persistentProfile ||'));
});
