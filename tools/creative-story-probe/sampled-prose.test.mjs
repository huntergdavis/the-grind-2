import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
import { instrumentSuccessiveStoryWorker, successiveStoryBudgets } from './successive-story-contract.mjs';
import { applySampledProseDecoding, instrumentSampledProseWorker, sampledProseReplacement, sampledProseSettings, sampledProseRuntimePaths } from './sampled-prose-contract.mjs';

const source = await readFile(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url), 'utf8');

test('reversing the one declared decoding change restores the observation-only production worker exactly', () => {
  const candidate = instrumentSampledProseWorker(source);
  assert.equal(candidate.replace(sampledProseReplacement[1], sampledProseReplacement[0]), instrumentSuccessiveStoryWorker(source));
  assert.deepEqual(sampledProseSettings, { doSample: true, temperature: 0.7, topK: 40 });
  assert.equal(candidate.split('do_sample: true').length, 2);
  assert.doesNotMatch(candidate, /top_p:/);
  for (const marker of ['max_new_tokens: 64', 'repetition_penalty: 1.08', 'inputLength > 1_024',
    'stopping_criteria: new FinishedPassageCriteria()', 'wasm.numThreads = 1;', 'local_files_only: localOnly']) assert.ok(candidate.includes(marker));
});

test('the DM direct function and request routing remain byte-identical to observed production', () => {
  const boundary = 'async function direct(';
  assert.equal(instrumentSampledProseWorker(source).split(boundary)[1], instrumentSuccessiveStoryWorker(source).split(boundary)[1]);
  assert.match(instrumentSampledProseWorker(source), /max_new_tokens: 1, do_sample: false, repetition_penalty: 1/);
});

test('changed or ambiguous prose decoding fails closed and the isolated worker parses', async () => {
  assert.throws(() => instrumentSampledProseWorker(source.replace(sampledProseReplacement[0], 'changed')));
  assert.throws(() => instrumentSampledProseWorker(source + '\n//' + sampledProseReplacement[0]));
  assert.throws(() => applySampledProseDecoding(source, 128));
  const transformed = await transformWithOxc(instrumentSampledProseWorker(source), 'creative-writer.worker.ts');
  assert.match(transformed.code, /do_sample: true/);
  assert.match(transformed.code, /temperature: (?:0)?\.7/);
  assert.match(transformed.code, /top_k: 40/);
});

test('installed runtime applies temperature and top-k; unsupported nucleus sampling is explicitly omitted', async () => {
  const runtime = await Promise.all(sampledProseRuntimePaths.map((path) => readFile(new URL('../../' + path, import.meta.url), 'utf8')));
  const activeModeling = runtime[1].split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
  assert.match(activeModeling, /new TemperatureLogitsWarper\(generation_config.temperature\)/);
  assert.doesNotMatch(activeModeling, /new TopPLogitsWarper/);
  assert.match(runtime[2], /return new MultinomialSampler\(generation_config\)/);
  assert.match(runtime[2], /k = Math.min\(this.generation_config.top_k, k\)/);
  assert.match(runtime[2], /this.randomSelect\(probabilities\)/);
  assert.equal(JSON.parse(runtime[0]).version, '4.2.0');
});

test('sampled mode is explicit, exclusive and preserves the existing finite offline journal chain', async () => {
  const runner = await readFile(new URL('./run-successive-story.mjs', import.meta.url), 'utf8');
  const probe = await readFile(new URL('./successive-story-probe.js', import.meta.url), 'utf8');
  assert.ok(runner.includes("const sampledProse = args.length === 2 && args[1] === '--sampled-prose'"));
  for (const marker of ['sampled-prose-', 'instrumentSampledProseWorker(source)',
    'sampledProseSettings', 'requestedPromptSha256', 'effectivePromptSha256',
    'verifyStagedArtifacts(staged, manifest.artifacts)', 'context.setOffline(true)',
    'await browserContext?.close()', 'await browser?.close()', 'server.close(done)',
    'report.protectedInputsUnchanged', 'not a fresh paired A/B']) assert.ok(runner.includes(marker));
  assert.ok(runner.includes('const budgets = emotion360m ? emotion360mBudgets : successiveStoryBudgets'));
  assert.deepEqual(successiveStoryBudgets, { total: 240000, work: 235000, cleanup: 5000, write: 90000 });
  assert.doesNotMatch(probe, /sampled-prose|sampledProse/);
  for (const marker of ['selectNarrativeContinuity(journal.snapshot.entries', 'buildCreativeStoryMessages(',
    'client.write(fixture.messages)', 'journal.record(', "origin: 'model'", '{ cacheOnly: true }']) assert.ok(probe.includes(marker));
});
