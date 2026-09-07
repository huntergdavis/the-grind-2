import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createMomentChoiceCases } from './moment-choice-cases.mjs';
import { createFirstVictoryChoiceCases } from './first-victory-choice-cases.mjs';
import { createCounterbalancedChoiceCases, counterbalanceMomentMessages } from './counterbalanced-choice-cases.mjs';
import { counterbalancedChoiceReportName, runContextFit } from './run-context-fit.mjs';

const baseline = JSON.parse(await readFile(new URL('./viewpoint-report.json', import.meta.url), 'utf8'));
const farewell = JSON.parse(await readFile(new URL('./moment-choice-report-2026-09-07T07-27-48-716Z-03c8f499-c936-484a-9131-0787b21b4858.json', import.meta.url), 'utf8'));
const victory = JSON.parse(await readFile(new URL('./first-victory-choice-report-2026-09-07T08-21-59-952Z-a3595ba3-44be-4721-86c0-22f0e144a8c3.json', import.meta.url), 'utf8'));

test('four fixed cases retain the two exact historical public pairs and label mappings', () => {
  const cases = createCounterbalancedChoiceCases(baseline);
  assert.deepEqual(cases.map(({ id }) => id), [
    'farewell-current-first', 'farewell-milestone-first',
    'healthy-first-victory-current-first', 'healthy-first-victory-milestone-first',
  ]);
  const originals = [createMomentChoiceCases(baseline)[0], createFirstVictoryChoiceCases(baseline)[0]];
  cases.forEach((row, index) => {
    const original = originals[Math.floor(index / 2)];
    assert.deepEqual(row.currentJob, original.currentJob);
    assert.deepEqual(row.milestoneJob, original.milestoneJob);
    assert.equal(row.excludedChoice, '3');
    assert.equal(row.choices['1'], index % 2 === 0 ? 'current' : 'milestone');
    assert.equal(row.choices['2'], index % 2 === 0 ? 'milestone' : 'current');
    assert.ok(Object.isFrozen(row) && Object.isFrozen(row.choices));
  });
});

for (const [name, report] of [['farewell', farewell], ['first-victory', victory]]) {
  test(`${name} reversal preserves every snippet and fixed instruction byte, changing only section order and labels`, () => {
    const messages = report.outputs[0].momentMessages;
    const before = structuredClone(messages);
    const original = counterbalanceMomentMessages(messages, 'current-first');
    const reversed = counterbalanceMomentMessages(messages, 'milestone-first');
    assert.deepEqual(original, messages);
    assert.equal(JSON.stringify(original), JSON.stringify(messages));
    assert.deepEqual(reversed[0], original[0]);
    const initialSections = original[1].content.split('\n\n');
    const reversedSections = reversed[1].content.split('\n\n');
    assert.equal(reversedSections[0], `1 ${initialSections[1].slice(2)}`);
    assert.equal(reversedSections[1], `2 ${initialSections[0].slice(2)}`);
    assert.equal(reversedSections[2], initialSections[2]);
    assert.equal(Buffer.byteLength(reversed[1].content), Buffer.byteLength(original[1].content));
    assert.deepEqual(messages, before);
    assert.ok(Object.isFrozen(reversed) && reversed.every(Object.isFrozen));
  });
}

test('malformed or changed prompt boundaries fail rather than guess a section swap', () => {
  const original = farewell.outputs[0].momentMessages;
  for (const raw of [null, [], original.slice(1), [...original, original[1]],
    [{ ...original[0], role: 'user' }, original[1]],
    [original[0], { ...original[1], content: original[1].content.replace('1 Current', '3 Current') }],
    [original[0], { ...original[1], content: original[1].content.replace('Changed: ', 'Outcome: ') }],
    [original[0], { ...original[1], content: `${original[1].content}\n` }],
    [original[0], { ...original[1], content: original[1].content.replace('Choose 1 or 2.', 'Choose the best.') }]]) {
    assert.throws(() => counterbalanceMomentMessages(raw, 'milestone-first'), /production|Production/);
  }
  assert.throws(() => counterbalanceMomentMessages(original, 'adaptive-order'), /production/);
});

test('counterbalanced report names are unique and the mode remains explicit and exclusive', async () => {
  const now = new Date('2026-09-07T00:00:00Z');
  const first = counterbalancedChoiceReportName(now);
  assert.match(first, /^counterbalanced-choice-report-2026-09-07T00-00-00-000Z-[a-f0-9-]+\.json$/);
  assert.notEqual(first, counterbalancedChoiceReportName(now));
  await assert.rejects(runContextFit(['--counterbalanced-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--counterbalanced-choice', '--moment-choice']), /Explicit execution/);
  await assert.rejects(runContextFit(['--run', '--counterbalanced-choice', '--prior-report', 'anything']), /Explicit execution/);
});
