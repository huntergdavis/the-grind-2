import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sentenceBudgetPolicy, selectSentenceBudgetPrefix, selectSentenceBudgetFallback } from './sentence-budget.mjs';

let server, clean, completed;
before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { middlewareMode: true }, logLevel: 'silent' });
  ({ cleanCreativeStoryOutput: clean } = await server.ssrLoadModule('/src/narrator/creative-story.ts'));
  ({ completedCreativeStorySentences: completed } = await server.ssrLoadModule('/src/narrator/creative-story-sentences.ts'));
});
after(async () => { await server?.close(); });

const prefix = text => selectSentenceBudgetPrefix(text, clean, completed);
const fallback = (text, elapsedMs) => selectSentenceBudgetFallback(text, elapsedMs, clean, completed);

test('actual b9cd592b unfinished arrival yields its existing complete first sentence, not invented completion', async () => {
  const receipt = JSON.parse(await readFile(new URL('./webgpu-candidate-report-2026-09-09T08-35-32-034Z-b9cd592b.json', import.meta.url), 'utf8'));
  const observation = receipt.writeTimingObservations.filter(record => record.phase === 'partial-text').at(-1);
  const expected = 'Mara clutches Rowan’s hand, her fingers trembling with the weight of relief and the sting of fear—his breath still uneven, his body a reminder of the path they’ve traversed.';
  assert.equal(observation.partialTextTruncated, false);
  assert.deepEqual(fallback(observation.partialText, observation.elapsedMs), {
    text: expected, sentenceCount: 1, elapsedMs: observation.elapsedMs,
    originalCharacters: observation.partialText.length,
    discardedCharacters: observation.partialText.length - expected.length,
  });
  assert.ok(observation.partialText.startsWith(expected));
  assert.equal(clean(expected), expected);
});

test('soft budget applies only at 80 <= elapsed < 90 seconds without claiming lifecycle or factual success', () => {
  const text = 'Mara listened. Rowan was';
  for (const elapsed of [0, -1, 79_999, 90_000, 90_001, NaN, Infinity, -Infinity, '80000', null]) {
    assert.equal(fallback(text, elapsed), null, String(elapsed));
  }
  for (const elapsed of [80_000, 80_000.5, 89_999]) assert.equal(fallback(text, elapsed).elapsedMs, elapsed);
  assert.equal(sentenceBudgetPolicy.softLimitMs, 80_000);
  assert.equal(sentenceBudgetPolicy.hardLimitMs, 90_000);
  assert.equal(sentenceBudgetPolicy.requiresSuccessfulInterruptAndDrain, true);
  assert.equal(sentenceBudgetPolicy.guaranteesFactualQuality, false);
  assert.equal(sentenceBudgetPolicy.changesPrompt, false);
  assert.equal(sentenceBudgetPolicy.changesModel, false);
  assert.equal(sentenceBudgetPolicy.productionDefaultUnchanged, true);
  assert.equal(sentenceBudgetPolicy.noJournalWrites, true);
  assert.ok(Object.isFrozen(sentenceBudgetPolicy));
});

test('selection preserves exact interior whitespace and chooses at most two already-completed sentences', () => {
  const text = '  Mara  listened.\n\tRowan smiled!  Then he';
  assert.deepEqual(prefix(text), { text: 'Mara  listened.\n\tRowan smiled!', sentenceCount: 2 });
  assert.deepEqual(prefix("Mara's doubt eased. The heroes' hands were"), { text: "Mara's doubt eased.", sentenceCount: 1 });
  assert.deepEqual(prefix('Mara kept 3.14 coins. Rowan was'), { text: 'Mara kept 3.14 coins.', sentenceCount: 1 });
  assert.deepEqual(prefix('Mara listened. Rowan smiled. Then he waited. Mara'), {
    text: 'Mara listened. Rowan smiled.', sentenceCount: 2,
  });
});

test('no invented lookahead, abbreviation, initial, ellipsis, or decimal boundary is accepted', () => {
  for (const text of ['', 'Mara waited', 'Mara waited.', 'Mara waited. 3', 'Mara waited. —',
    'Mara greeted Dr. Rowan', 'Mara greeted J. Rowan', 'Mara visited the U.S. Rowan',
    'Mara waited... Rowan was', 'Mara waited… Rowan was', 'The clock showed 3.14',
    'The clock showed 3. 14']) assert.equal(prefix(text), null, text);
  assert.deepEqual(prefix('Mara listened. Dr. Rowan'), { text: 'Mara listened.', sentenceCount: 1 });
});

test('complete quotations and parentheses survive; dangling or unmatched retained delimiters do not', () => {
  for (const text of ['Mara said, "Wait. Rowan', 'Mara said, “Wait. Rowan', 'Mara (waited. Rowan',
    'Mara waited.” Rowan', 'Mara waited.) Rowan', "Mara waited.' Rowan"]) assert.equal(prefix(text), null, text);
  for (const text of ['Mara said, "Wait." Rowan', 'Mara said, “Wait.” Rowan',
    'Mara said, ‘Wait.’ Rowan', "Mara said, 'Wait.' Rowan", 'Mara (waited.) Rowan']) {
    assert.equal(prefix(text)?.sentenceCount, 1, text);
  }
  assert.deepEqual(prefix('Mara said, "Wait. Stay here." Rowan'), {
    text: 'Mara said, "Wait. Stay here."', sentenceCount: 2,
  });
  assert.deepEqual(prefix('Mara waited. “Rowan'), { text: 'Mara waited.', sentenceCount: 1 });
});

test('whole-text production rejection cannot be hidden by clipping an unsafe or overlong tail', () => {
  for (const text of ['Mara waited. Rowan <unsafe>', 'Mara waited. Rowan\u0000', 'Mara waited. Rowan\u200b',
    'Mara waited. assistant: Rowan', 'Mara waited. **Rowan**', 'Mara waited. Rowan ' + 'x'.repeat(1_000),
    'Mara waited. Rowan ' + 'x'.repeat(4_000)]) {
    assert.equal(clean(text), null, text.slice(0, 40));
    assert.equal(prefix(text), null, text.slice(0, 40));
  }
  for (const text of [null, undefined, {}, 42]) assert.equal(prefix(text), null);
});

test('callback errors and malformed extraction results fail closed without manufacturing a passage', () => {
  const text = 'Mara waited. Rowan was';
  const throwing = () => { throw new Error('Deliberate test failure'); };
  assert.equal(selectSentenceBudgetPrefix(text, throwing, completed), null);
  assert.equal(selectSentenceBudgetPrefix(text, clean, throwing), null);
  assert.equal(selectSentenceBudgetPrefix(text, null, completed), null);
  assert.equal(selectSentenceBudgetPrefix(text, clean, null), null);
  for (const result of [null, {}, [], ['Unrelated.'], [42], ['One.', 'Two.', 'Three.']]) {
    assert.equal(selectSentenceBudgetPrefix(text, clean, () => result), null);
  }
  assert.equal(selectSentenceBudgetPrefix(text, () => null, completed), null);
});
