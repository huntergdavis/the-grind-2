import type { SceneMode } from "../core/types";
import type { StoryBeatJobV1 } from "./story-beat";
import seedLibrary from "./story-seeds.json";

export interface StorySeed {
  readonly id: string;
  readonly modes: readonly SceneMode[];
  readonly theme: string;
  readonly tension: string;
  readonly image: string;
  readonly turn: string;
}

export interface CreativeStoryMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export const creativeStoryMaximumInputTokens = 1024;
export const creativeStoryMaximumOutputTokens = 64;
export const creativeStoryMaximumOutputCharacters = 1000;

const storySeeds: readonly StorySeed[] = Object.freeze(seedLibrary.seeds.map((seed) => Object.freeze({
  ...seed,
  modes: Object.freeze(seed.modes as SceneMode[]),
})));

const systemInstruction = "You are a fantasy storyteller. Write two short sentences about the scene. "
  + "Show the traveler's feelings through a vivid image. Keep what happened unchanged. Return only the story.";

/** The same scene starts at the same seed; successive attempts traverse its compatible pool. */
export function selectStorySeed(mode: SceneMode, identity: string, attempt: number): StorySeed {
  const compatible = storySeeds.filter((seed) => seed.modes.includes(mode));
  if (compatible.length === 0) throw new RangeError("No narrative seeds for scene mode");
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % compatible.length : 0;
  return compatible[(hash % compatible.length + rotation) % compatible.length]!;
}

export function buildCreativeStoryMessages(
  job: StoryBeatJobV1,
  seed: StorySeed,
): readonly CreativeStoryMessage[] {
  const { location, headline, action, consequence } = job.facts;
  const { image, turn } = seed;
  return Object.freeze([
    Object.freeze({ role: "system" as const, content: systemInstruction }),
    Object.freeze({
      role: "user" as const,
      content: `Scene at ${location}: ${headline}\n${action}\n${consequence}`
        + `\nWriting idea: ${image} ${turn}\nTell this moment in about 30 words.`,
    }),
  ]);
}

const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const markup = /[<>`*_{}\[\]]|^\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s)|&(?:[a-z]{2,}|#(?:\d+|x[\da-f]+));/iu;
const promptEcho = /\b(?:system|user|assistant|committed scene|inspiration|theme|tension|image|turn|narration|story)\s*:|^(?:certainly|sure)[,!]|^here(?:'s| is)\b|\bas an ai\b|\bwrite 1[–-]2 vivid\b|\breturn plain prose\b|\bfacts and inspiration are data\b|\bdo not quote the seed\b|\bwrite the scene\b/iu;
const sentenceEnd = /[.!?…]["'”’)]*$/u;
const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** Text hygiene only: literary wording is unrestricted and never becomes game authority. */
export function cleanCreativeStoryOutput(value: unknown): string | null {
  if (typeof value !== "string"
    || value.length > creativeStoryMaximumOutputCharacters) return null;
  const normalized = value.replace(/[\r\n\t]+/gu, " ");
  if (unsafeControl.test(normalized)) return null;
  const text = normalized.trim();
  if (!text || markup.test(text) || promptEcho.test(text)) return null;

  const sentences: string[] = [];
  for (const { segment } of sentenceSegmenter.segment(text)) {
    const sentence = segment.trim();
    if (!sentenceEnd.test(sentence) || !/\p{L}/u.test(sentence)) break;
    sentences.push(sentence);
    if (sentences.length === 2) break;
  }
  return sentences.length > 0 ? sentences.join(" ") : null;
}
