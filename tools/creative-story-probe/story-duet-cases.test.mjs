import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';
import { createStoryDuetCases } from './story-duet-cases.mjs';
import { storyDuetReportName, runContextFit } from './run-context-fit.mjs';

const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));

test('two fixed duet fixtures bind their actual public healthy/injured victory sources to explicit roles', () => {
  const before = structuredClone(baseline);
  const prior = createFirstVictoryChoiceCases(baseline);
  const cases = createStoryDuetCases(baseline);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases.map(({ packet }) => packet.condition), ['healthy', 'injured']);
  cases.forEach((row, index) => {
    assert.deepEqual(row.job, prior[index].milestoneJob);
    assert.equal(row.packet.eventId, row.job.eventId);
    assert.equal(row.packet.tick, row.job.tick);
    assert.equal(row.packet.campaignId, row.job.campaignId);
    assert.equal(row.packet.battle.location, row.job.facts.location);
    assert.equal(row.packet.battle.headline, row.job.facts.headline);
    assert.equal(row.packet.kind, 'first-shared-victory');
    assert.equal(row.focus, 'shared-road');
    assert.deepEqual(row.roleBindings, { HERO: 'Mara', COMPANION: 'Rowan' });
    assert.ok(Object.isFrozen(row) && Object.isFrozen(row.packet) && Object.isFrozen(row.packet.battle));
  });
  assert.deepEqual(baseline, before);
});

test('duet report names are unique and separate from all source-choice receipts', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const first = storyDuetReportName(now);
  assert.match(first, /^story-duet-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, storyDuetReportName(now));
});

test('duet generation requires explicit exclusive mode and cannot relax historical comparisons', async () => {
  await assert.rejects(runContextFit(['--story-duet']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--story-duet', '--first-victory-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--story-duet', '--prior-report', 'anything']), /Explicit execution/);
});
