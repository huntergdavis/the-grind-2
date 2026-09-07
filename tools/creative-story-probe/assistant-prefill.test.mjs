import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { assistantPrefillForCase } from './assistant-prefill-cases.mjs';
import { instrumentAssistantPrefillWorker, prefillReplacements } from './assistant-prefill-contract.mjs';
import { instrumentSuccessiveStoryWorker } from './successive-story-contract.mjs';

const source = await readFile(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url), 'utf8');

test('declared prefixes preserve only supplied actors, injury and road/arrival facts', () => {
  assert.equal(assistantPrefillForCase('injured-companion-on-the-road'), 'Mara travelled beside injured Rowan toward Greyford, and');
  assert.equal(assistantPrefillForCase('injured-companion-arrives-alive'), 'Mara reached Greyford beside injured Rowan, and');
  assert.throws(() => assistantPrefillForCase('other-scene'));
  for (const id of ['injured-companion-on-the-road', 'injured-companion-arrives-alive']) {
    assert.ok(assistantPrefillForCase(id).length < 100);
    assert.doesNotMatch(assistantPrefillForCase(id), /fear|hope|worry|relief|felt|years|England/i);
  }
});

test('only declared continuation changes separate candidate from observation-only production', () => {
  const candidate = instrumentAssistantPrefillWorker(source);
  let reverted = candidate;
  for (const [before, after] of [...prefillReplacements].reverse()) reverted = reverted.replace(after, before);
  assert.equal(reverted, instrumentSuccessiveStoryWorker(source));
  for (const required of ['max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08',
    'stopping_criteria: new FinishedPassageCriteria()', 'wasm.numThreads = 1;', 'inputLength > 1_024']) assert.ok(candidate.includes(required));
});

test('continuation tokenizes complete rendered chat plus prefix without duplicate special tokens', () => {
  const candidate = instrumentAssistantPrefillWorker(source);
  assert.match(candidate, /tokenize: false, add_generation_prompt: true/);
  assert.match(candidate, /\}\) \+ prefix, \{ add_special_tokens: false \}\)/);
  assert.match(candidate, /hasFinishedCreativeStoryPassage\(prefix \+ activeTokenizer\.decode/);
  assert.match(candidate, /probe-suffix.*hostPrefix: prefix, generatedSuffix/);
  assert.match(candidate, /const text = \(prefix \+ generatedSuffix\)\.trim\(\)/);
});

test('source drift fails closed and transformed worker parses as TypeScript', async () => {
  assert.throws(() => instrumentAssistantPrefillWorker(source.replace('const text = await write(readMessages(request.messages));', 'changed')));
  const transformed = await transformWithOxc(instrumentAssistantPrefillWorker(source), 'creative-writer.worker.ts');
  assert.ok(transformed.code.includes('generatedSuffix'));
});

test('trial uses same real journal chain and explicitly distinguishes historical comparison and host text', async () => {
  const probe = await readFile(new URL('./successive-story-probe.js', import.meta.url), 'utf8');
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  assert.match(probe, /selectNarrativeContinuity\(journal\.snapshot\.entries/);
  assert.match(probe, /client\.write\(fixture\.messages\)/);
  assert.match(probe, /probePrefix: activePrefix/);
  assert.match(runner, /Prefix facts\/names are NOT model quality evidence/);
  assert.match(runner, /not fresh paired A\/B/);
  assert.match(runner, /assistant-prefill-/);
});
