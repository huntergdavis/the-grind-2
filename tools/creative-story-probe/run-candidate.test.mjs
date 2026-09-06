import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateCandidate, substituteIdentity } from './run-candidate.mjs';

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
