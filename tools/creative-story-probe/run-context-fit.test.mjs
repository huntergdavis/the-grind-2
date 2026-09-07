import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createContextFitCases } from './context-fit-cases.mjs';
import { comparePriorContextFitCases, contextFitReportName, verifyStagedArtifacts } from './run-context-fit.mjs';

const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));

async function tinyArtifacts(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tg2-context-fit-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifacts = [];
  for (const name of ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']) {
    const bytes = Buffer.from(`Synthetic byte-verification fixture: ${name}\n`);
    const file = join(directory, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: 'wx' });
    artifacts.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return { directory, artifacts };
}

test('context cases retain the exact three historical synthetic facts, viewpoints, and foci', () => {
  const cases = createContextFitCases(baseline);
  assert.deepEqual(cases.map(({ id }) => id), ['rested-curious-hero', 'newly-sworn-companion', 'injured-active-companion']);
  assert.deepEqual(cases.map(({ mode }) => mode), ['discovery', 'travel', 'camp']);
  for (const fixture of cases) {
    const historical = baseline.outputs.find(({ id }) => id === fixture.id);
    assert.deepEqual(fixture.facts, historical.facts);
    assert.deepEqual(fixture.viewpoint, historical.viewpoint);
    assert.equal(fixture.focus, historical.focus);
    assert.deepEqual(fixture.historical.messages, historical.messages);
    assert.equal(fixture.attempt, 0);
    assert.equal(fixture.identity, JSON.stringify([
      'synthetic:viewpoint-probe', `synthetic:${fixture.id}`, 3, '0123456789abcdef',
    ]));
  }
  assert.throws(() => createContextFitCases({ outputs: baseline.outputs.slice(1) }));
});

test('each invocation receives a new report name, never a historical report target', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const first = contextFitReportName(now);
  const second = contextFitReportName(now);
  assert.notEqual(first, second);
  assert.match(first, /^context-fit-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.ok(!['viewpoint-report.json', 'cache-report.json', 'generation-report.json'].includes(first));
});

test('a follow-up may change prompts but must preserve each case and selected seed', () => {
  const outputs = createContextFitCases(baseline).map((fixture) => ({ ...fixture, seed: fixture.historical.seed, messages: fixture.historical.messages }));
  const cases = outputs.map((fixture) => ({ ...fixture, messages: [{ role: 'user', content: 'A revised final instruction.' }] }));
  const compared = comparePriorContextFitCases(cases, { complete: true, outputs });
  assert.ok(compared.every((row) => row.sameFactsViewpointFocusIdentityAndSeed && row.promptChanged));
  const changedSeed = cases.map((fixture, index) => index ? fixture : { ...fixture, seed: { ...fixture.seed, id: 'different' } });
  assert.throws(() => comparePriorContextFitCases(changedSeed, { complete: true, outputs }), /changed seed/);
  const changedFacts = cases.map((fixture, index) => index ? fixture : { ...fixture, facts: { ...fixture.facts, consequence: 'A different outcome.' } });
  assert.throws(() => comparePriorContextFitCases(changedFacts, { complete: true, outputs }), /changed facts/);
});

test('five tiny artifacts verify exact byte lengths and SHA-256 without a model cache', async (t) => {
  const fixture = await tinyArtifacts(t);
  const artifacts = await verifyStagedArtifacts(fixture.directory, fixture.artifacts);
  assert.equal(artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0), fixture.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0));
  assert.ok(artifacts.every((artifact) => artifact.reused));
});

test('staging mismatches abort without a download fallback', async (t) => {
  const { directory, artifacts } = await tinyArtifacts(t);
  await assert.rejects(verifyStagedArtifacts(directory, artifacts.slice(1)), /five distinct/);
  const badBytes = artifacts.map((artifact, index) => index ? artifact : { ...artifact, bytes: artifact.bytes + 1 });
  await assert.rejects(verifyStagedArtifacts(directory, badBytes), /byte mismatch/);
  const badHash = artifacts.map((artifact, index) => index ? artifact : { ...artifact, sha256: '0'.repeat(64) });
  await assert.rejects(verifyStagedArtifacts(directory, badHash), /SHA-256 mismatch/);
  await assert.rejects(verifyStagedArtifacts(join(directory, 'missing'), artifacts), /ENOENT/);
});
