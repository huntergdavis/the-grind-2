import type { StoryBeatPublicFactsV1 } from "../narrator/story-beat";

export const storyBeatRecentDraftLimit = 8 as const;

export type StoryBeatDraftEchoReasonV1 =
  | "headline-echo"
  | "recent-echo";

export interface StoryBeatDraftSignatureV1 {
  readonly tokens: readonly string[];
  readonly contentTokens: readonly string[];
  readonly numericTokens: readonly string[];
}

const tokenPattern =
  /[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*|[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?/gu;
const numericTokenPattern = /^[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?$/u;

const recentIgnoredWords = new Set<string>([
  "a",
  "an",
  "the",
]);

const headlineIgnoredWords = new Set<string>([
  ...recentIgnoredWords,
  "here",
  "is",
  "it",
  "that",
  "these",
  "this",
  "those",
]);

const scopeSensitiveWords = new Set<string>([
  "above",
  "across",
  "after",
  "against",
  "ahead",
  "among",
  "at",
  "before",
  "behind",
  "below",
  "beside",
  "between",
  "beyond",
  "down",
  "east",
  "eastern",
  "far",
  "from",
  "in",
  "inside",
  "left",
  "near",
  "neither",
  "never",
  "no",
  "nor",
  "north",
  "northern",
  "not",
  "off",
  "on",
  "out",
  "outside",
  "over",
  "right",
  "south",
  "southern",
  "through",
  "to",
  "under",
  "up",
  "west",
  "western",
  "within",
  "without",
]);

const logicalRelationWords = new Set<string>([
  "and",
  "as",
  "but",
  "for",
  "nor",
  "or",
  "so",
  "than",
  "while",
]);

function normalizedTokens(value: string): readonly string[] {
  const canonical = value
    .normalize("NFKC")
    .replace(/[\u2019\u02bc]/gu, "'")
    .replace(/([\p{L}\p{M}])[\u2010\u2011](?=[\p{L}\p{M}])/gu, "$1-")
    .toLocaleLowerCase("en-US");
  return Object.freeze(
    [...canonical.matchAll(tokenPattern)]
      .map((match) => match[0]),
  );
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((token, index) => token === right[index]);
}

function sameVocabulary(left: readonly string[], right: readonly string[]): boolean {
  const leftVocabulary = new Set(left);
  const rightVocabulary = new Set(right);
  return leftVocabulary.size === rightVocabulary.size
    && [...leftVocabulary].every((token) => rightVocabulary.has(token));
}

function collapseAdjacentRuns(tokens: readonly string[]): readonly string[] {
  const collapsed: string[] = [];
  for (const token of tokens) {
    if (collapsed.at(-1) !== token) collapsed.push(token);
  }
  return collapsed;
}

function sameCollapsedTokenOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return sameSequence(
    collapseAdjacentRuns(left),
    collapseAdjacentRuns(right),
  );
}

function containsScopeSensitiveWord(tokens: readonly string[]): boolean {
  return tokens.some((token) => scopeSensitiveWords.has(token));
}

function containsNumericToken(tokens: readonly string[]): boolean {
  return tokens.some((token) => numericTokenPattern.test(token));
}

function multisetCounts(tokens: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function isNonemptyOrderedVocabularySubset(
  candidate: readonly string[],
  source: readonly string[],
): boolean {
  const candidateOrder = collapseAdjacentRuns(candidate);
  const sourceOrder = collapseAdjacentRuns(source);
  if (candidateOrder.length === 0) return false;
  let candidateIndex = 0;
  for (const token of sourceOrder) {
    if (token === candidateOrder[candidateIndex]) candidateIndex += 1;
  }
  return candidateIndex === candidateOrder.length;
}

function isRepeatedOrderedVocabularySubset(
  candidate: readonly string[],
  source: readonly string[],
): boolean {
  const candidateOrder = collapseAdjacentRuns(candidate);
  if (candidateOrder.length < 2) return false;
  for (
    let period = 1;
    period <= Math.floor(candidateOrder.length / 2);
    period += 1
  ) {
    if (candidateOrder.length % period !== 0) continue;
    const repeatedUnit = candidateOrder.slice(0, period);
    if (!isNonemptyOrderedVocabularySubset(repeatedUnit, source)) continue;
    if (candidateOrder.every(
      (token, index) => token === repeatedUnit[index % period],
    )) return true;
  }
  return false;
}

function isAndJoinedOrderedVocabularySubsets(
  candidate: readonly string[],
  source: readonly string[],
): boolean {
  const segments: string[][] = [[]];
  for (const token of candidate) {
    if (token === "and") {
      segments.push([]);
    } else {
      segments.at(-1)!.push(token);
    }
  }
  if (segments.length < 2 || segments.some((segment) => segment.length === 0)) {
    return false;
  }
  const collapsedSegments = segments.map(collapseAdjacentRuns);
  const firstSegment = collapsedSegments[0]!;
  if (
    collapsedSegments.slice(1).every(
      (segment) => sameSequence(segment, firstSegment),
    )
    && isNonemptyOrderedVocabularySubset(firstSegment, source)
  ) return true;

  if (
    source.some((token) => logicalRelationWords.has(token))
    || source.some((token) => scopeSensitiveWords.has(token))
    || containsNumericToken(source)
  ) return false;
  return segments.every(
    (segment) => isNonemptyOrderedVocabularySubset(segment, source),
  );
}

function multisetIntersectionSize(
  left: readonly string[],
  right: readonly string[],
): number {
  const leftCounts = multisetCounts(left);
  const rightCounts = multisetCounts(right);
  let size = 0;
  for (const [token, count] of leftCounts) {
    size += Math.min(count, rightCounts.get(token) ?? 0);
  }
  return size;
}

function contentTokensWithoutLocation(
  tokens: readonly string[],
  locationTokens: readonly string[],
  ignoredWords: ReadonlySet<string>,
): readonly string[] {
  let fallbackStart = -1;
  let locationStart = -1;
  for (
    let start = 0;
    start <= tokens.length - locationTokens.length;
    start += 1
  ) {
    if (!sameSequence(
      tokens.slice(start, start + locationTokens.length),
      locationTokens,
    )) continue;
    if (fallbackStart === -1) fallbackStart = start;
    if (start > 0 && tokens[start - 1] === "at") {
      locationStart = start;
      break;
    }
  }
  if (locationStart === -1) locationStart = fallbackStart;
  const shellAtIndex =
    locationStart > 0 && tokens[locationStart - 1] === "at"
      ? locationStart - 1
      : -1;

  const content: string[] = [];
  for (const [index, token] of tokens.entries()) {
    const isLocationToken =
      locationStart !== -1
      && index >= locationStart
      && index < locationStart + locationTokens.length;
    if (
      index !== shellAtIndex
      && !isLocationToken
      && !ignoredWords.has(token)
    ) content.push(token);
  }
  return content;
}

function isNearRecentEcho(
  candidate: StoryBeatDraftSignatureV1,
  recent: StoryBeatDraftSignatureV1,
): boolean {
  const left = candidate.contentTokens;
  const right = recent.contentTokens;
  if (left.length < 4 || right.length < 4) return false;
  if (!sameSequence(candidate.numericTokens, recent.numericTokens)) return false;
  if (!sameVocabulary(left, right)) return false;
  if (
    containsScopeSensitiveWord(left)
    || containsScopeSensitiveWord(right)
    || containsNumericToken(left)
    || containsNumericToken(right)
  ) {
    if (!sameSequence(left, right)) return false;
  } else if (!sameCollapsedTokenOrder(left, right)) {
    return false;
  }

  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter * 4 < longer * 3) return false;

  const intersection = multisetIntersectionSize(left, right);
  return intersection * 5 >= (left.length + right.length) * 2;
}

export function createStoryBeatDraftSignatureV1(
  value: string,
  location: string,
): StoryBeatDraftSignatureV1 | null {
  try {
    const tokens = normalizedTokens(value);
    const locationTokens = normalizedTokens(location);
    if (tokens.length === 0 || locationTokens.length === 0) return null;
    return Object.freeze({
      tokens,
      contentTokens: Object.freeze(
        contentTokensWithoutLocation(tokens, locationTokens, recentIgnoredWords),
      ),
      numericTokens: Object.freeze(
        tokens.filter((token) => numericTokenPattern.test(token)).sort(),
      ),
    });
  } catch {
    return null;
  }
}

export function storyBeatDraftEchoReasonV1(
  candidate: StoryBeatDraftSignatureV1,
  facts: StoryBeatPublicFactsV1,
  recent: readonly StoryBeatDraftSignatureV1[],
): StoryBeatDraftEchoReasonV1 | null {
  const headlineTokens = normalizedTokens(facts.headline);
  const locationTokens = normalizedTokens(facts.location);
  if (headlineTokens.length === 0 || locationTokens.length === 0) return "headline-echo";
  const candidateHeadlineContent = contentTokensWithoutLocation(
    candidate.tokens,
    locationTokens,
    headlineIgnoredWords,
  );
  const headlineContent = headlineTokens.filter(
    (token) => !headlineIgnoredWords.has(token),
  );
  if (
    isNonemptyOrderedVocabularySubset(candidateHeadlineContent, headlineContent)
    || isRepeatedOrderedVocabularySubset(candidateHeadlineContent, headlineContent)
    || isAndJoinedOrderedVocabularySubsets(candidateHeadlineContent, headlineContent)
  ) return "headline-echo";

  for (const previous of recent) {
    if (
      sameSequence(candidate.tokens, previous.tokens)
      || isNearRecentEcho(candidate, previous)
    ) return "recent-echo";
  }
  return null;
}
