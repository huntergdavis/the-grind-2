import assert from 'node:assert/strict';
import test from 'node:test';
import { directionCooldownReportName, directionReportName, runContextFit } from './run-context-fit.mjs';

test('direction reports have unique names independent of all prior experiment reports', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  assert.match(directionReportName(now), /^direction-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(directionReportName(now), directionReportName(now));
});

test('cooldown reports cannot overwrite the preserved all-labels direction experiment', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const first = directionCooldownReportName(now);
  assert.match(first, /^direction-cooldown-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, directionReportName(now));
  assert.notEqual(first, directionCooldownReportName(now));
});

test('direction mode requires explicit execution and cannot alter strict prior-report mode', async () => {
  await assert.rejects(runContextFit(['--direction']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--direction', '--prior-report', 'anything']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--direction', '--exemplars']), /Explicit execution/);
  await assert.rejects(runContextFit(['--direction-cooldown']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--direction-cooldown', '--direction']), /Explicit execution/);
});
