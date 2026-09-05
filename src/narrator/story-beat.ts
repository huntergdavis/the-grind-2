import { canonicalHash } from "../core/canonical";
import type { ChronicleEntry, SceneMode, SceneState } from "../core/types";

export const storyBeatSchemaVersion = 1 as const;
export const storyBeatMaximumLocationCharacters = 120;
export const storyBeatMaximumHeadlineCharacters = 160;
export const storyBeatMaximumActionCharacters = 240;
export const storyBeatMaximumConsequenceCharacters = 280;
export const storyBeatMaximumInputTokens = 320 as const;
export const storyBeatMaximumOutputTokens = 48 as const;
export const storyBeatMaximumOutputCharacters = 160;
export const storyBeatMaximumOutputWords = 24;

export interface StoryBeatPublicFactsV1 {
  readonly schemaVersion: 1;
  readonly kind: "public-story-beat";
  readonly location: string;
  readonly headline: string;
  readonly action: string;
  readonly consequence: string;
}

export interface StoryBeatJobV1 {
  readonly schemaVersion: 1;
  readonly task: "author-story-beat";
  readonly disposition: "manual-ephemeral-noncanonical";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
  readonly facts: StoryBeatPublicFactsV1;
  readonly deterministicFallback: string;
  readonly maximumInputTokens: 320;
  readonly maximumOutputTokens: 48;
}

const sceneModes: readonly SceneMode[] = Object.freeze([
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "training",
  "discovery",
  "camp",
  "chronicle",
]);

const factsKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "location",
  "headline",
  "action",
  "consequence",
] as const);

const jobKeys = Object.freeze([
  "schemaVersion",
  "task",
  "disposition",
  "campaignId",
  "eventId",
  "tick",
  "sourceFingerprint",
  "facts",
  "deterministicFallback",
  "maximumInputTokens",
  "maximumOutputTokens",
] as const);

const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const numericClaimPattern = /[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?/gu;

const neutralWords = new Set<string>([
  "a",
  "an",
  "and",
  "as",
  "at",
  "before",
  "behind",
  "beneath",
  "beside",
  "between",
  "beyond",
  "but",
  "by",
  "during",
  "each",
  "every",
  "for",
  "from",
  "has",
  "have",
  "here",
  "in",
  "inside",
  "into",
  "is",
  "it",
  "its",
  "near",
  "no",
  "not",
  "now",
  "of",
  "on",
  "only",
  "or",
  "out",
  "outside",
  "over",
  "past",
  "so",
  "still",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "toward",
  "under",
  "was",
  "were",
  "where",
  "which",
  "while",
  "who",
  "with",
  "within",
  "without",
]);

const forbiddenClaimWords = new Set<string>([
  // Future or promises.
  "eventually",
  "future",
  "going",
  "later",
  "next",
  "promise",
  "promised",
  "promises",
  "shall",
  "soon",
  "tomorrow",
  "will",
  "would",
  // Rewards, quests, and mechanical authority.
  "award",
  "awarded",
  "awards",
  "bounty",
  "gold",
  "loot",
  "mission",
  "missions",
  "objective",
  "objectives",
  "prize",
  "quest",
  "quests",
  "reward",
  "rewarded",
  "rewards",
  "treasure",
  // Death or injury.
  "bleed",
  "bleeding",
  "bleeds",
  "broken",
  "dead",
  "death",
  "die",
  "dies",
  "died",
  "fatal",
  "hurt",
  "injured",
  "injury",
  "kill",
  "killed",
  "kills",
  "perish",
  "perished",
  "slain",
  "slay",
  "slays",
  "wound",
  "wounded",
  "wounds",
  // Relationships.
  "allies",
  "ally",
  "betray",
  "betrayed",
  "bond",
  "bonds",
  "companion",
  "companions",
  "enemy",
  "enemies",
  "friend",
  "friends",
  "hate",
  "hates",
  "kin",
  "love",
  "loves",
  "lover",
  "mentor",
  "parent",
  "relationship",
  "relationships",
  "rival",
  "sibling",
  "trust",
  "trusts",
  // Private thought, intent, or first-person assertion.
  "believe",
  "believes",
  "believed",
  "decide",
  "decides",
  "decided",
  "dream",
  "dreams",
  "fear",
  "fears",
  "feel",
  "feels",
  "felt",
  "hope",
  "hopes",
  "i",
  "intend",
  "intends",
  "knew",
  "know",
  "knows",
  "me",
  "mine",
  "my",
  "myself",
  "our",
  "ours",
  "ourselves",
  "realize",
  "realized",
  "realizes",
  "remember",
  "remembered",
  "remembers",
  "suspect",
  "suspects",
  "think",
  "thinks",
  "thought",
  "us",
  "want",
  "wants",
  "we",
  "wonder",
  "wonders",
  // Dialogue, including unattributed dialogue without quotation marks.
  "ask",
  "asked",
  "asks",
  "exclaim",
  "exclaimed",
  "exclaims",
  "replied",
  "replies",
  "reply",
  "said",
  "say",
  "says",
  "shout",
  "shouted",
  "shouts",
  "speak",
  "speaks",
  "spoke",
  "spoken",
  "tell",
  "tells",
  "told",
  "whisper",
  "whispered",
  "whispers",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isBoundedText(value: unknown, maximumCharacters: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumCharacters
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value)
    && /[\p{L}\p{N}]/u.test(value);
}

function lower(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

interface WordToken {
  readonly raw: string;
  readonly lower: string;
}

function words(value: string): readonly WordToken[] {
  return [...value.matchAll(wordPattern)].map((match) => {
    const raw = match[0];
    return { raw, lower: lower(raw) };
  });
}

function wordSet(value: string): ReadonlySet<string> {
  return new Set(words(value).map((token) => token.lower));
}

function containsWordSequence(haystack: readonly WordToken[], needle: readonly WordToken[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset]?.lower === token.lower)) return true;
  }
  return false;
}

function sourceText(facts: StoryBeatPublicFactsV1): string {
  return `${facts.location} ${facts.headline} ${facts.action} ${facts.consequence}`;
}

function hasStandaloneQuote(value: string): boolean {
  if (/["“”„‟«»‹›「」『』‘]/u.test(value)) return true;
  const scalars = [...value];
  const wordScalar = /[\p{L}\p{M}\p{N}]/u;
  return scalars.some((scalar, index) => {
    if (scalar !== "'" && scalar !== "’") return false;
    const before = scalars[index - 1];
    const after = scalars[index + 1];
    return before === undefined
      || after === undefined
      || !wordScalar.test(before)
      || !wordScalar.test(after);
  });
}

function isCapitalizedWord(value: string): boolean {
  const firstLetter = [...value].find((scalar) => /\p{L}/u.test(scalar));
  return firstLetter !== undefined
    && firstLetter === firstLetter.toLocaleUpperCase("en-US")
    && firstLetter !== firstLetter.toLocaleLowerCase("en-US");
}

function numericClaimCounts(value: string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const claim of value.match(numericClaimPattern) ?? []) {
    counts.set(claim, (counts.get(claim) ?? 0) + 1);
  }
  return counts;
}

function sourceNarrativeWords(facts: StoryBeatPublicFactsV1): ReadonlySet<string> {
  const locationWords = wordSet(facts.location);
  return new Set(
    words(`${facts.headline} ${facts.action} ${facts.consequence}`)
      .map((token) => token.lower)
      .filter((token) => !locationWords.has(token) && !neutralWords.has(token) && !/^\p{N}+$/u.test(token)),
  );
}

function sourceMatchesScene(scene: Readonly<SceneState>, source: Readonly<ChronicleEntry>): boolean {
  return source.mode === scene.mode
    && source.location === scene.location
    && source.headline === scene.headline
    && source.action === scene.action
    && source.goal === scene.goal
    && source.consequence === scene.consequence
    && source.sensoryIntensity === scene.sensoryIntensity;
}

export function isStoryBeatPublicFactsV1(value: unknown): value is StoryBeatPublicFactsV1 {
  try {
    return isRecord(value)
      && hasExactKeys(value, factsKeys)
      && value.schemaVersion === storyBeatSchemaVersion
      && value.kind === "public-story-beat"
      && isBoundedText(value.location, storyBeatMaximumLocationCharacters)
      && isBoundedText(value.headline, storyBeatMaximumHeadlineCharacters)
      && isBoundedText(value.action, storyBeatMaximumActionCharacters)
      && isBoundedText(value.consequence, storyBeatMaximumConsequenceCharacters);
  } catch {
    return false;
  }
}

export function deterministicStoryBeatFallback(facts: StoryBeatPublicFactsV1): string {
  return facts.headline;
}

export function isStoryBeatJobV1(value: unknown): value is StoryBeatJobV1 {
  try {
    if (!isRecord(value) || !hasExactKeys(value, jobKeys) || !isStoryBeatPublicFactsV1(value.facts)) return false;
    return value.schemaVersion === storyBeatSchemaVersion
      && value.task === "author-story-beat"
      && value.disposition === "manual-ephemeral-noncanonical"
      && isBoundedText(value.campaignId, 160)
      && isBoundedText(value.eventId, 200)
      && Number.isSafeInteger(value.tick)
      && (value.tick as number) >= 0
      && typeof value.sourceFingerprint === "string"
      && /^[0-9a-f]{16}$/u.test(value.sourceFingerprint)
      && value.deterministicFallback === deterministicStoryBeatFallback(value.facts)
      && value.maximumInputTokens === storyBeatMaximumInputTokens
      && value.maximumOutputTokens === storyBeatMaximumOutputTokens;
  } catch {
    return false;
  }
}

export function projectStoryBeatJobV1(
  campaignId: string,
  scene: Readonly<SceneState>,
  source: Readonly<ChronicleEntry> | undefined,
  latestEventId: string | undefined,
): StoryBeatJobV1 | null {
  try {
    if (
      !isBoundedText(campaignId, 160)
      || source === undefined
      || latestEventId !== source.id
      || !isBoundedText(source.id, 200)
      || !Number.isSafeInteger(source.tick)
      || source.tick < 0
      || !sceneModes.includes(scene.mode)
      || ![0, 1, 2, 3].includes(scene.sensoryIntensity)
      || !sourceMatchesScene(scene, source)
    ) return null;

    const facts: StoryBeatPublicFactsV1 = Object.freeze({
      schemaVersion: storyBeatSchemaVersion,
      kind: "public-story-beat",
      location: source.location,
      headline: source.headline,
      action: source.action,
      consequence: source.consequence,
    });
    if (!isStoryBeatPublicFactsV1(facts)) return null;

    const sourceFingerprint = canonicalHash({
      schemaVersion: storyBeatSchemaVersion,
      purpose: "experimental-story-beat-source",
      campaignId,
      eventId: source.id,
      tick: source.tick,
      scene: {
        mode: scene.mode,
        location: scene.location,
        headline: scene.headline,
        action: scene.action,
        goal: scene.goal,
        consequence: scene.consequence,
        sensoryIntensity: scene.sensoryIntensity,
      },
    });
    const job: StoryBeatJobV1 = Object.freeze({
      schemaVersion: storyBeatSchemaVersion,
      task: "author-story-beat",
      disposition: "manual-ephemeral-noncanonical",
      campaignId,
      eventId: source.id,
      tick: source.tick,
      sourceFingerprint,
      facts,
      deterministicFallback: deterministicStoryBeatFallback(facts),
      maximumInputTokens: storyBeatMaximumInputTokens,
      maximumOutputTokens: storyBeatMaximumOutputTokens,
    });
    return isStoryBeatJobV1(job) ? job : null;
  } catch {
    return null;
  }
}

// Keep the model-facing instruction in one literal so live-probe evidence can tune it
// without changing projection, validation, or host authority.
export const storyBeatPromptInstructionV1 = "Write one sentence of at most 24 words. Name the place and use only facts and words supplied below. Do not add dialogue, thoughts, future events, quests, rewards, harm, or relationships.";

export function formatStoryBeatPromptV1(value: unknown): string | null {
  try {
    if (!isStoryBeatPublicFactsV1(value)) return null;
    return [
      storyBeatPromptInstructionV1,
      `PLACE: ${JSON.stringify(value.location)}`,
      `HEADLINE: ${JSON.stringify(value.headline)}`,
      `ACTION: ${JSON.stringify(value.action)}`,
      `CONSEQUENCE: ${JSON.stringify(value.consequence)}`,
      "BEAT:",
    ].join("\n");
  } catch {
    return null;
  }
}

export function validateStoryBeatResultV1(value: unknown, factsValue: unknown): string | null {
  try {
    if (!isStoryBeatPublicFactsV1(factsValue) || typeof value !== "string") return null;
    if (
      value.length === 0
      || value.length > storyBeatMaximumOutputCharacters
      || value.trim() !== value
      || value.normalize("NFC") !== value
      || unsafeUnicode.test(value)
      || /[^\S ]/u.test(value)
      || / {2,}/u.test(value)
      || /[`*_#~|\\{}<>\[\]]/u.test(value)
      || /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/iu.test(value)
      || /(?:https?:\/\/|www\.)/iu.test(value)
      || /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62})\.)+(?:\p{L}{2,63})(?:[/?#]\S*)?/iu.test(value)
      || hasStandaloneQuote(value)
    ) return null;

    const sentenceMarks = value.match(/[.!?。！？…]/gu) ?? [];
    if (sentenceMarks.length !== 1 || !/[.!?]$/u.test(value)) return null;

    const outputWords = words(value);
    if (outputWords.length === 0 || outputWords.length > storyBeatMaximumOutputWords) return null;

    const availableNumericClaims = numericClaimCounts(sourceText(factsValue));
    const usedNumericClaims = numericClaimCounts(value);
    if ([...usedNumericClaims].some(
      ([claim, count]) => count > (availableNumericClaims.get(claim) ?? 0),
    )) return null;

    if (outputWords.some((token) => forbiddenClaimWords.has(token.lower))) return null;

    const sourceWords = wordSet(sourceText(factsValue));
    if (outputWords.some((token, index) =>
      isCapitalizedWord(token.raw)
      && !sourceWords.has(token.lower)
      && !(index === 0 && neutralWords.has(token.lower)))) return null;

    const locationWords = words(factsValue.location);
    if (!containsWordSequence(outputWords, locationWords)) return null;

    const groundedNarrativeWords = sourceNarrativeWords(factsValue);
    if (groundedNarrativeWords.size === 0
      || !outputWords.some((token) => groundedNarrativeWords.has(token.lower))) return null;

    if (outputWords.some((token) =>
      !sourceWords.has(token.lower)
      && !neutralWords.has(token.lower)
      && !/^\p{N}+$/u.test(token.lower))) return null;

    return value;
  } catch {
    return null;
  }
}
