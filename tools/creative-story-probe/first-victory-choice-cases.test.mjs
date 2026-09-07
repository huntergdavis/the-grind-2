import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMomentChoiceCases } from './moment-choice-cases.mjs';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';
import { firstVictoryChoiceReportName, runContextFit } from './run-context-fit.mjs';

const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));

test('two explicit healthy/injured first-victory sources keep the fixed current public facts', () => {
  const before = structuredClone(baseline);
  const current = createMomentChoiceCases(baseline);
  const cases = createFirstVictoryChoiceCases(baseline);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map(({ companionStatus }) => companionStatus), ['healthy', 'injured']);
  cases.forEach((row, index) => {
    assert.deepEqual(row.currentJob.facts, current[index].currentJob.facts);
    assert.equal(row.currentJob.campaignId, row.milestoneJob.campaignId);
    assert.ok(row.currentJob.tick > row.milestoneJob.tick);
    assert.equal(row.milestoneKind, 'first-shared-victory');
    assert.equal(row.excludedChoice, '3');
    assert.deepEqual(row.choices, { '1': 'current-public-scene', '2': 'recorded-first-shared-victory' });
    assert.match(row.milestoneJob.facts.headline, /Mara and Rowan won their first fight/);
    assert.match(row.milestoneJob.facts.consequence, index === 0 ? /remains uninjured/ : /alive and injured/);
    assert.doesNotMatch(JSON.stringify(row.milestoneJob.facts), /farewell|depart|oath|pride|relief/);
    assert.ok(Object.isFrozen(row) && Object.isFrozen(row.milestoneJob) && Object.isFrozen(row.milestoneJob.facts));
  });
  assert.deepEqual(baseline, before);
});

test('first-victory receipts cannot replace the historical farewell report', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const first = firstVictoryChoiceReportName(now);
  assert.match(first, /^first-victory-choice-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, firstVictoryChoiceReportName(now));
});

test('first-victory mode remains explicitly authorized and exclusive', async () => {
  await assert.rejects(runContextFit(['--first-victory-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--first-victory-choice', '--moment-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--first-victory-choice', '--prior-report', 'anything']), /Explicit execution/);
});
