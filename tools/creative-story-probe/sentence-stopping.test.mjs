import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stoppingBudgets, stoppingMarker, suffixMarker, instrumentation, bootInstrumentation,
  transformStoppingWorker, selectStoppingFixture, stoppingReportName, compareStoppingOutputs, digest,
} from './sentence-stopping-contract.mjs';

const source = await readFile(new URL('../../src/narrator/creative-writer.worker.ts', import.meta.url), 'utf8');
const archive = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));

test('baseline differs from candidate by exactly the stopping property', () => {
  const baseline = transformStoppingWorker(source, 'baseline');
  const candidate = transformStoppingWorker(source, 'candidate');
  assert.equal(candidate.replace(stoppingMarker, ''), baseline);
  assert.equal(candidate.replace(instrumentation, '').replace(bootInstrumentation, ''), source);
  assert.ok(baseline.includes('class FinishedPassageCriteria'));
});

test('both variants collect actual generated suffix and input counts without changing returned text', () => {
  for (const variant of ['baseline', 'candidate']) {
    const transformed = transformStoppingWorker(source, variant);
    assert.ok(transformed.includes(suffixMarker + instrumentation));
    assert.equal(transformed.split(instrumentation).length, 2);
    assert.ok(transformed.includes('return text;'));
    assert.ok(transformed.includes('max_new_tokens: 64, do_sample: false, repetition_penalty: 1.08'));
    assert.ok(transformed.includes('wasm.numThreads = 1;'));
    assert.ok(transformed.includes('device: "wasm", dtype: "q8"'));
  }
});

test('marker drift, duplication and unknown variants fail closed', () => {
  assert.throws(() => transformStoppingWorker(source.replace(stoppingMarker, ''), 'baseline'));
  assert.throws(() => transformStoppingWorker(source + stoppingMarker, 'candidate'));
  assert.throws(() => transformStoppingWorker(source.replace(suffixMarker, ''), 'candidate'));
  assert.throws(() => transformStoppingWorker(source, 'retry'));
  assert.throws(() => transformStoppingWorker(source.replace('max_new_tokens: 64', 'max_new_tokens: 128'), 'candidate'));
});

test('fixture reuses exact archived messages, facts and discarded tail without prompt rebuilding', () => {
  const fixture = selectStoppingFixture(archive);
  assert.deepEqual(fixture.messages, archive.outputs[0].messages);
  assert.deepEqual(fixture.facts, archive.outputs[0].facts);
  assert.equal(fixture.promptSha256, digest(JSON.stringify(archive.outputs[0].messages)));
  assert.ok(fixture.historicalRaw.startsWith(fixture.historicalCleaned));
  assert.ok(fixture.historicalRaw.length > fixture.historicalCleaned.length);
  fixture.messages[0].content = 'Changed copy';
  assert.notEqual(archive.outputs[0].messages[0].content, 'Changed copy');
});

test('different, incomplete or tail-free fixture is rejected', () => {
  assert.throws(() => selectStoppingFixture({ ...archive, complete: false }));
  assert.throws(() => selectStoppingFixture({ ...archive, outputs: archive.outputs.slice(1) }));
  const copy = structuredClone(archive);
  copy.outputs[0].raw = copy.outputs[0].cleaned;
  assert.throws(() => selectStoppingFixture(copy));
});

test('receipt names cannot overwrite the historical baseline by default', () => {
  const name = stoppingReportName(new Date('2026-09-07T13:00:00.000Z'), 'unique');
  assert.equal(name, 'sentence-stopping-report-2026-09-07T13-00-00-000Z-unique.json');
  assert.notEqual(stoppingReportName(), stoppingReportName());
});

test('total work and cleanup are bounded while each production write remains90seconds', () => {
  assert.equal(stoppingBudgets.work + stoppingBudgets.cleanup, stoppingBudgets.total);
  assert.equal(stoppingBudgets.total, 295_000);
  assert.equal(stoppingBudgets.write, 90_000);
  assert.ok(Object.isFrozen(stoppingBudgets));
});

test('matched result separates preserved prose, raw prefix and actual token counts from timing claims', () => {
  const baseline = { status: 'completed', raw: 'First. Second. Third tail', cleaned: 'First. Second.', outputTokens: 64, generationMs: 60_000 };
  const candidate = { status: 'completed', raw: 'First. Second. Third', cleaned: 'First. Second.', outputTokens: 30, generationMs: 40_000 };
  const result = compareStoppingOutputs(baseline, candidate);
  assert.equal(result.identicalCleanedProse, true);
  assert.equal(result.candidateRawIsBaselinePrefix, true);
  assert.equal(result.savedOutputTokens, 34);
  assert.match(result.interpretation, /confound timing/);
});

test('failed or rejected output cannot count as preserved prose or a successful comparison', () => {
  assert.equal(compareStoppingOutputs(null, null).bothCompleted, false);
  assert.equal(compareStoppingOutputs({ status: 'failed' }, null).savedOutputTokens, null);
  const rejected = { status: 'completed', raw: 'Writing advice', cleaned: null, outputTokens: 5 };
  assert.equal(compareStoppingOutputs(rejected, rejected).identicalCleanedProse, false);
});

test('runner keeps cache-only restore, offline inference, production client and explicit execution gate', async () => {
  const runner = await readFile(new URL('./run-sentence-stopping.mjs', import.meta.url), 'utf8');
  const browser = await readFile(new URL('./sentence-stopping-probe.js', import.meta.url), 'utf8');
  assert.match(runner, /verifyStagedArtifacts\(staged, manifest\.artifacts\)/);
  assert.match(runner, /sentenceStoppingProbe\.load\(true\)/);
  assert.match(runner, /setOffline\(true\)/);
  assert.match(runner, /flag: 'wx'/);
  assert.match(runner, /Explicit --run required/);
  assert.match(browser, /createCreativeWriterClient\(\{ createWorker/);
  assert.match(browser, /client\.write\(messages\)/);
  assert.doesNotMatch(browser, /max_new_tokens|repetition_penalty|fetch\(/);
});
