/** Tool-only stopping experiment: this does not alter production admission. */
export const sentenceBudgetPolicy = Object.freeze({
  variant: 'completed-sentence-soft-budget-v1',
  softLimitMs: 80_000,
  hardLimitMs: 90_000,
  maximumInputCharacters: 4_000,
  minimumSentences: 1,
  maximumSentences: 2,
  cooperativeChunkBoundaryOnly: true,
  normalCompletionTakesPrecedence: true,
  requiresSuccessfulInterruptAndDrain: true,
  requiresWholeTextProductionAdmission: true,
  requiresRealLexicalLookahead: true,
  preservesInteriorWhitespace: true,
  changesPrompt: false,
  changesModel: false,
  changesStopping: true,
  guaranteesFactualQuality: false,
  productionDefaultUnchanged: true,
  noJournalWrites: true,
});

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const sentenceEnd = /[.!?]["'”’)]*$/u;
const lexicalStart = /^["'“‘(]*\p{L}/u;
// Reuse the production uncertainty policy, conservatively including dotted
// initialisms and a few common abbreviations. These wait for ordinary EOS.
const uncertainEnd = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|capt|sgt|lt|gen|cmdr|rev|vs|etc|e\.g|i\.e|no|vol|dept|approx)\.|\b\p{L}\.|(?:\p{L}\.){2,}|\.{2,}|…)["'”’)]*$/iu;

function hasBalancedDelimiters(text) {
  const stack = [];
  const openers = { '“': '”', '‘': '’', '(': ')' };
  for (let index = 0; index < text.length; index++) {
    const character = text[index], before = text[index - 1] ?? '', after = text[index + 1] ?? '';
    // Contractions and possessives are not quotation boundaries. Ambiguous
    // single-quote endings after a letter conservatively remain unclosed.
    if ((character === "'" || character === '’') && /\p{L}/u.test(before)) continue;
    if (stack.at(-1) === character) { stack.pop(); continue; }
    if (Object.hasOwn(openers, character)) { stack.push(openers[character]); continue; }
    if (character === '”' || character === '’' || character === ')') return false;
    if (character === '"') { stack.push(character); continue; }
    if (character === "'") {
      if ((index === 0 || /[\s(]/u.test(before)) && /\p{L}/u.test(after)) stack.push(character);
      else return false;
    }
  }
  return stack.length === 0;
}

/**
 * Return an already-complete leading passage, never invented punctuation or a
 * rewritten sentence join. The caller strips only its exact synthetic header.
 * Both callbacks must be the real production admission/extraction functions.
 */
export function selectSentenceBudgetPrefix(text, cleanCreativeStoryOutput, completedCreativeStorySentences) {
  if (typeof text !== 'string' || !text || text.length > sentenceBudgetPolicy.maximumInputCharacters
    || typeof cleanCreativeStoryOutput !== 'function' || typeof completedCreativeStorySentences !== 'function') return null;
  try {
    // Check ALL received text before clipping: unsafe suffixes cannot disappear
    // behind an apparently harmless completed first sentence.
    const admitted = cleanCreativeStoryOutput(text);
    if (typeof admitted !== 'string' || !admitted) return null;
    const source = text.trimStart();
    const completed = completedCreativeStorySentences(source);
    if (!Array.isArray(completed) || !completed.length || completed.length > 2
      || completed.some(sentence => typeof sentence !== 'string')) return null;
    const segments = [...segmenter.segment(source)];
    for (let count = Math.min(completed.length, 2); count >= 1; count--) {
      const next = segments[count];
      if (!next || !lexicalStart.test(next.segment.trimStart())) continue;
      const retained = segments.slice(0, count).map(({ segment }) => segment.trim());
      if (retained.length !== count || retained.some((sentence, index) => sentence !== completed[index]
        || !sentenceEnd.test(sentence) || uncertainEnd.test(sentence))) continue;
      const prefix = source.slice(0, next.index).trimEnd();
      if (!hasBalancedDelimiters(prefix)) continue;
      // Recheck the unchanged production gate on the exact selected substring.
      const cleanedPrefix = cleanCreativeStoryOutput(prefix);
      if (typeof cleanedPrefix !== 'string' || !cleanedPrefix) continue;
      return { text: prefix, sentenceCount: count };
    }
    return null;
  } catch {
    // A failed optional selector must not turn an error into accepted prose.
    return null;
  }
}

export function selectSentenceBudgetFallback(text, elapsedMs, cleanCreativeStoryOutput, completedCreativeStorySentences) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < sentenceBudgetPolicy.softLimitMs
    || elapsedMs >= sentenceBudgetPolicy.hardLimitMs) return null;
  const prefix = selectSentenceBudgetPrefix(text, cleanCreativeStoryOutput, completedCreativeStorySentences);
  if (prefix === null) return null;
  return {
    ...prefix,
    elapsedMs,
    originalCharacters: text.length,
    discardedCharacters: text.length - prefix.text.length,
  };
}
