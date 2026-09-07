import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { exemplarDemonstrations, withExemplarDemonstrations } from './exemplar-messages.mjs';
import { exemplarReportName, runContextFit } from './run-context-fit.mjs';

const historical = JSON.parse(await readFile(new URL('./context-fit-report-2026-09-07T00-37-03-923Z-d0521c53-3063-4750-b32c-e523137be3cf.json', import.meta.url), 'utf8'));

test('the same two original examples append only to each fixed scene system message', () => {
  for (const fixture of historical.outputs) {
    const before = JSON.stringify(fixture.messages);
    const messages = withExemplarDemonstrations(fixture.messages);
    assert.equal(messages[0].content, `${fixture.messages[0].content}\n\n${exemplarDemonstrations}`);
    assert.strictEqual(messages[1], fixture.messages[1]);
    assert.equal(JSON.stringify(messages[1]), JSON.stringify(fixture.messages[1]));
    assert.equal(JSON.stringify(fixture.messages), before);
    assert.deepEqual(messages.map(({ role }) => role), ['system', 'user']);
    assert.ok(Object.isFrozen(messages) && Object.isFrozen(messages[0]));
  }
});

test('demonstrations are compact and exclude measured scene people and places', () => {
  assert.equal(exemplarDemonstrations.match(/Example facts:/g)?.length, 2);
  assert.equal(exemplarDemonstrations.match(/Example story:/g)?.length, 2);
  assert.ok(exemplarDemonstrations.split(/\s+/).length < 120);
  assert.doesNotMatch(exemplarDemonstrations, /\b(?:Mara|Rowan|Greyford|arch)\b/i);
});

test('malformed role pairs and oversized prompts fail without changing client validation', () => {
  assert.throws(() => withExemplarDemonstrations([{ role: 'assistant', content: 'Story.' }]), /system\/user/);
  assert.throws(() => withExemplarDemonstrations([{ role: 'system', content: 'x'.repeat(4_000) }, { role: 'user', content: 'Scene.' }]), /character bounds/);
});

test('exemplar report names are distinct from historical reports and each other', () => {
  const first = exemplarReportName(new Date('2026-09-07T00:00:00Z'));
  assert.match(first, /^exemplar-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, exemplarReportName(new Date('2026-09-07T00:00:00Z')));
});

test('exemplar execution remains explicit and cannot bypass strict prior-report mode', async () => {
  await assert.rejects(runContextFit(['--exemplars']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--exemplars', '--prior-report', 'anything']), /Explicit execution/);
});
