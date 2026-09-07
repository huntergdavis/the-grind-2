import type { CreativeStoryFocus, CreativeStoryViewpoint } from "./creative-story";

export interface StoryExpectedCharacter {
  readonly role: "hero" | "companion";
  readonly fullName: string;
  readonly aliases: readonly string[];
}

export type StoryCharacterAnchor = readonly StoryExpectedCharacter[];

function normalizeNameText(text: string): string {
  return text.normalize("NFC").toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/gu, "'")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/\s+/gu, " ").trim();
}

/** Copy the explicitly requested characters before asynchronous writing begins. */
export function captureStoryCharacterAnchor(
  viewpoint: CreativeStoryViewpoint | null,
  focus: CreativeStoryFocus,
): StoryCharacterAnchor {
  if (viewpoint === null || focus === "scene") return Object.freeze([]);
  const characters = [
    { role: "hero" as const, fullName: normalizeNameText(viewpoint.hero.name) },
    ...(focus === "shared-road" && viewpoint.companion !== null
      ? [{ role: "companion" as const, fullName: normalizeNameText(viewpoint.companion.name) }] : []),
  ];
  const givenNames = characters.map(({ fullName }) => fullName.split(" ")[0]!);
  return Object.freeze(characters.map((character, index) => {
    const givenName = givenNames[index]!;
    const uniqueGivenName = givenNames.filter((name) => name === givenName).length === 1;
    const aliases = character.fullName.length === 0 ? []
      : uniqueGivenName && givenName !== character.fullName ? [character.fullName, givenName] : [character.fullName];
    return Object.freeze({ ...character, aliases: Object.freeze(aliases) });
  }));
}

interface NameSpan {
  readonly start: number;
  readonly end: number;
}

function literalNameSpans(text: string, name: string): readonly NameSpan[] {
  if (name.length === 0) return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`, "gu");
  return [...text.matchAll(pattern)].flatMap((match) => {
    const start = match.index;
    const end = start + match[0].length;
    // A name is not the tail of O'Mara or part of Mara-Lee. Straight/curly
    // possessives remain natural mentions, while quotation marks are harmless.
    if (/[\p{L}\p{M}\p{N}_]['-]$/u.test(text.slice(0, start))
      || /^(?:-[\p{L}\p{M}\p{N}_]|'(?!s(?=$|[^\p{L}\p{M}\p{N}_]))[\p{L}\p{M}\p{N}_])/u.test(text.slice(end))) return [];
    return [{ start, end }];
  });
}

/**
 * A minimum identity check, not factual validation or a literary-quality score.
 * It cannot detect invented backstory, emotions, strangers, or false outcomes.
 * Scene-focused writing and absent viewpoints have no character-name constraint.
 */
export function hasStoryCharacterAnchor(text: string, anchor: StoryCharacterAnchor): boolean {
  if (anchor.length === 0) return true;
  const normalized = normalizeNameText(text);
  const fullNameSpans = anchor.map(({ fullName }) => literalNameSpans(normalized, fullName));
  return anchor.every((character, characterIndex) => character.aliases.some((alias) =>
    literalNameSpans(normalized, alias).some((span) => !fullNameSpans.some((otherSpans, otherIndex) =>
      otherIndex !== characterIndex && otherSpans.some((other) => other.start <= span.start && other.end >= span.end)))));
}
