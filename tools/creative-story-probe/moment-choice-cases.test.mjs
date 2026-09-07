import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMomentChoiceCases } from './moment-choice-cases.mjs';
import { momentChoiceReportName, runContextFit } from './run-context-fit.mjs';

const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));

test('two fixed current scenes compare with the same separate public farewell', () => {
  const cases = createMomentChoiceCases(baseline);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map(({ id }) => id), ['sealed-arch-or-recorded-farewell', 'ordinary-travel-or-recorded-farewell']);
  assert.strictEqual(cases[0].milestoneJob, cases[1].milestoneJob);
  for (const row of cases) {
    assert.equal(row.excludedChoice, '3');
    assert.deepEqual(row.choices, { '1': 'current-public-scene', '2': 'recorded-companion-farewell' });
    assert.ok(row.currentJob.tick > row.milestoneJob.tick);
    assert.notEqual(row.currentJob.eventId, row.milestoneJob.eventId);
    assert.ok(Object.isFrozen(row.currentJob.facts) && Object.isFrozen(row.milestoneJob.facts));
    assert.match(row.milestoneJob.facts.consequence, /alive and injured/);
    assert.equal('remembrance' in row, false);
  }
  assert.equal(cases[0].currentJob.facts.headline, baseline.outputs[0].facts.headline);
  assert.match(cases[1].currentJob.facts.headline, /continued along the road/);
});

test('moment reports use unique names without replacing any historical report', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const first = momentChoiceReportName(now);
  assert.match(first, /^moment-choice-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, momentChoiceReportName(now));
});

test('moment proof requires explicit exclusive mode and cannot bypass prior-report checks', async () => {
  await assert.rejects(runContextFit(['--moment-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--moment-choice', '--direction']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--moment-choice', '--prior-report', 'anything']), /Explicit execution/);
});
