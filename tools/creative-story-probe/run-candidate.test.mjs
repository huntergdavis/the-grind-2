import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateCandidate, substituteIdentity, parseCandidateOptions } from './run-candidate.mjs';
import { selectCandidateFixtures } from './candidate-story-opening.mjs';
import { createSuccessiveStoryCases } from './successive-story-cases.mjs';
import { buildEmotionalSceneMessages } from './emotional-scene-messages.mjs';

const candidate = JSON.parse(await readFile(new URL('./candidate-smollm2-360m.json', import.meta.url), 'utf8'));

test('candidate metadata contains exactly five pinned, sized, digest-bearing artifacts', () => {
  assert.equal(validateCandidate(candidate), candidate);
  assert.equal(candidate.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0), 366_673_969);
  for (const change of [
    { revision: 'main' },
    { artifacts: candidate.artifacts.slice(1) },
    { artifacts: candidate.artifacts.map((artifact, index) => index ? artifact : { ...artifact, sha256: 'partial' }) },
    { artifacts: candidate.artifacts.map((artifact, index) => index ? artifact : { ...artifact, sourceUrl: artifact.sourceUrl.replace(candidate.revision, 'main') }) },
  ]) assert.throws(() => validateCandidate({ ...candidate, ...change }));
});

test('build transform changes only one model and revision literal, never decoding/runtime options', () => {
  const previous = { modelId: 'old/model', revision: 'old-revision' };
  const source = 'model="old/model"; revision="old-revision"; wasm.numThreads=1; max_new_tokens=64;';
  const transformed = substituteIdentity(source, previous, candidate);
  assert.equal(transformed, `model="${candidate.modelId}"; revision="${candidate.revision}"; wasm.numThreads=1; max_new_tokens=64;`);
  assert.throws(() => substituteIdentity(`${source} old/model`, previous, candidate));
  assert.throws(() => substituteIdentity(source.replace('old-revision', 'missing'), previous, candidate));
});

test('opening and persistent profile are explicit independent flags with unchanged defaults', () => {
  const base = ['--candidate', 'candidate.json', '--run'];
  assert.deepEqual(parseCandidateOptions(base), { manifestPath: 'candidate.json', prepareOnly: false,
    skipRestore: false, storyOpening: false, persistentProfile: false });
  assert.deepEqual(parseCandidateOptions([...base, '--story-opening', '--persistent-profile', '--skip-restore']), {
    manifestPath: 'candidate.json', prepareOnly: false, skipRestore: true, storyOpening: true, persistentProfile: true,
  });
  assert.equal(parseCandidateOptions([...base, '--persistent-profile']).storyOpening, false);
  assert.equal(parseCandidateOptions([...base, '--story-opening']).persistentProfile, false);
  assert.equal(parseCandidateOptions(['--candidate', 'candidate.json', '--prepare']).prepareOnly, true);
  for (const invalid of [[], ['--candidate', '--run'], ['--candidate', 'candidate.json'], [...base, '--prepare']]) {
    assert.throws(() => parseCandidateOptions(invalid), /Usage:/);
  }
});

test('default fixture selection keeps all three exact archival prompts without rebuilding them', async () => {
  const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(baseline);
  assert.equal(selectCandidateFixtures(baseline), baseline.outputs);
  assert.equal(selectCandidateFixtures(baseline).length, 3);
  assert.equal(JSON.stringify(baseline), before);
  assert.throws(() => selectCandidateFixtures({ outputs: baseline.outputs.slice(0, 1) }), /three historical/);
});

test('compact opening selects exactly the first public scene and the shared instruction-only emotional prompt', () => {
  const [expected] = createSuccessiveStoryCases();
  const selected = selectCandidateFixtures(undefined, true);
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0], { ...expected,
    messages: buildEmotionalSceneMessages(expected.job, expected.viewpoint, expected.focus) });
  assert.equal(selected[0].id, 'injured-companion-on-the-road');
  assert.deepEqual(selected[0].messages.map((message) => message.role), ['system', 'user']);
  assert.match(selected[0].messages[1].content, /Both remain alive\. Rowan is still injured/);
  assert.equal(Object.hasOwn(selected[0], 'hostPrefix'), false);
  assert.equal(Object.hasOwn(selected[0], 'raw'), false);
});

test('runner and browser share fixture selection and persistent cleanup targets only the owned temporary profile', async () => {
  const [runner, probe] = await Promise.all(['run-candidate.mjs', 'candidate-probe.js']
    .map((name) => readFile(new URL(name, import.meta.url), 'utf8')));
  for (const source of [runner, probe]) {
    assert.match(source, /import \{ selectCandidateFixtures \} from '\.\/candidate-story-opening\.mjs'/);
    assert.match(source, /selectCandidateFixtures\(baseline, storyOpening\)/);
  }
  assert.match(runner, /mkdtemp\(resolve\(tmpdir\(\), 'tg2-candidate-profile-'\)\)/);
  assert.match(runner, /chromium\.launchPersistentContext\(ownedProfile, \{ headless: true \}\)/);
  assert.match(runner, /browserContext === undefined \|\| report\.cleanup\.contextClosed === true/);
  assert.match(runner, /rm\(ownedProfile, \{ recursive: true, force: true \}\)/);
  assert.ok(runner.indexOf('browserContext?.close()') < runner.indexOf('rm(ownedProfile,'));
  assert.match(runner, /if \(\(browser === undefined \|\| report\.cleanup\.browserClosed === true\)\s*&& \(browserContext === undefined \|\| report\.cleanup\.contextClosed === true\)\) \{\s*clearTimeout\(cleanupWatchdog\)/);
  assert.match(probe, /storyOpening && \(index !== 0 \|\| openingAttempted\)/);
});
