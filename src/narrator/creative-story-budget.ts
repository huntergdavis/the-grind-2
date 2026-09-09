import { cleanCreativeStoryOutput } from "./creative-story";
import { completedCreativeStorySentences } from "./creative-story-sentences";

export const creativeStorySoftLimitMs = 80_000;
export const creativeStoryHardLimitMs = 90_000;

export interface CreativeStoryBudgetSelection {
  readonly text: string;
  readonly sentenceCount: number;
  readonly elapsedMs: number;
  readonly originalCharacters: number;
  readonly discardedCharacters: number;
}

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const sentenceEnd = /[.!?]["'”’)]*$/u;
const lexicalStart = /^["'“‘(]*\p{L}/u;
const uncertainEnd = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|capt|sgt|lt|gen|cmdr|rev|vs|etc|e\.g|i\.e|no|vol|dept|approx)\.|\b\p{L}\.|(?:\p{L}\.){2,}|\.{2,}|…)["'”’)]*$/iu;

function hasBalancedDelimiters(text: string): boolean {
  const stack: string[] = [];
  const openers: Readonly<Record<string, string>> = { "“": "”", "‘": "’", "(": ")" };
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!, before = text[index - 1] ?? "", after = text[index + 1] ?? "";
    // Apostrophes after letters are not reliable quotation boundaries.
    if ((character === "'" || character === "’") && /\p{L}/u.test(before)) continue;
    if (stack.at(-1) === character) { stack.pop(); continue; }
    if (Object.hasOwn(openers, character)) { stack.push(openers[character]!); continue; }
    if (character === "”" || character === "’" || character === ")") return false;
    if (character === '"') { stack.push(character); continue; }
    if (character === "'") {
      if ((index === 0 || /[\s(]/u.test(before)) && /\p{L}/u.test(after)) stack.push(character);
      else return false;
    }
  }
  return stack.length === 0;
}

/**
 * Port of the reviewed 8baf543 tool selector. Keep an exact completed prefix,
 * never invent punctuation or hide an unsafe unfinished tail. Ordinary quick
 * completion takes precedence at the caller; no competing timeout is created.
 */
export function selectCreativeStoryBudgetFallback(text: string, elapsedMs: number): CreativeStoryBudgetSelection | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < creativeStorySoftLimitMs || elapsedMs >= creativeStoryHardLimitMs) return null;
  try {
    if (cleanCreativeStoryOutput(text) === null) return null;
    const source = text.trimStart();
    const completed = completedCreativeStorySentences(source);
    const segments = [...segmenter.segment(source)];
    for (let count = Math.min(completed.length, 2); count >= 1; count--) {
      const next = segments[count];
      if (!next || !lexicalStart.test(next.segment.trimStart())) continue;
      const retained = segments.slice(0, count).map(({ segment }) => segment.trim());
      if (retained.some((sentence, index) => sentence !== completed[index]
        || !sentenceEnd.test(sentence) || uncertainEnd.test(sentence))) continue;
      const prefix = source.slice(0, next.index).trimEnd();
      if (!hasBalancedDelimiters(prefix) || cleanCreativeStoryOutput(prefix) === null) continue;
      return { text: prefix, sentenceCount: count, elapsedMs,
        originalCharacters: text.length, discardedCharacters: text.length - prefix.length };
    }
    return null;
  } catch {
    return null;
  }
}
