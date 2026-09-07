import type { HeroValue, SceneMode } from "../core/types";
import type { StoryBeatJobV1 } from "./story-beat";
import seedLibrary from "./story-seeds.json";
import { completedCreativeStorySentences } from "./creative-story-sentences";

export type StorySeedPrerequisite = "return" | "success" | "aftermath" | "disruption" | "advantage" | "setback" | "rest";
export type CreativeStoryInspirationTone = "neutral" | "care" | "trust";
export type CreativeStoryOrigin = "model" | "authored";

export interface StorySeed {
  readonly id: string;
  readonly modes: readonly SceneMode[];
  readonly theme: string;
  readonly tension: string;
  readonly image: string;
  readonly turn: string;
  readonly requires?: readonly StorySeedPrerequisite[];
  readonly relationshipFit?: "care" | "trust";
}

export interface CreativeStoryMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export type CreativeStoryFocus = "inner-life" | "shared-road" | "scene";

export interface CreativeStoryViewpoint {
  readonly hero: {
    readonly name: string;
    readonly values: readonly HeroValue[];
  };
  readonly companion: {
    readonly name: string;
    readonly role: string;
    readonly status: "travelling" | "arrived" | "injured" | "arrived-injured";
    readonly purpose: "shared-road-oath";
    readonly victories: number;
  } | null;
}

export const creativeStoryMaximumInputTokens = 1024;
export const creativeStoryMaximumOutputTokens = 64;
export const creativeStoryMaximumOutputCharacters = 1000;

const storySeeds: readonly StorySeed[] = Object.freeze((seedLibrary.seeds as readonly StorySeed[]).map((seed) => Object.freeze({
  ...seed,
  modes: Object.freeze([...seed.modes]),
  ...(seed.requires === undefined ? {} : { requires: Object.freeze([...seed.requires]) }),
})));

const systemInstruction = "You are a fantasy storyteller. Write two short sentences about the scene. "
  + "Feelings and private thoughts are imagined interpretations. Keep people and what happened unchanged; "
  + "add no past events. Return only the story.";

const companionStatusText = {
  travelling: "travelling together",
  arrived: "arrived at the oath destination",
  injured: "injured while travelling",
  "arrived-injured": "injured at the oath destination",
} as const;

function viewpointText(viewpoint: CreativeStoryViewpoint | undefined, focus: CreativeStoryFocus): string {
  if (viewpoint === undefined) return "";
  const { hero, companion } = viewpoint;
  const values = hero.values.length > 0 ? ` Values: ${hero.values.join(", ")}.` : "";
  const victories = companion !== null && (focus !== "shared-road" || companion.victories > 0)
    ? `; ${companion.victories} shared victories` : "";
  const present = companion === null
    ? " No active companion."
    : ` Present companion: ${companion.name}, ${companion.role}; shared-road oath; `
      + `${companionStatusText[companion.status]}${victories}.`;
  return `\nViewpoint: ${hero.name}.${values}${present}`;
}

function focusInstruction(focus: CreativeStoryFocus, viewpoint: CreativeStoryViewpoint | undefined): string {
  if (focus === "scene") return "Focus on the scene's atmosphere through a vivid image.";
  if (focus === "shared-road" && viewpoint?.companion !== undefined && viewpoint.companion !== null) {
    const { hero, companion } = viewpoint;
    switch (companion.status) {
      case "arrived-injured":
        return `Imagine ${hero.name}'s relief at reaching the oath destination with ${companion.name}, `
          + `mixed with worry about ${companion.name}'s injury.`;
      case "arrived":
        return `Imagine ${hero.name}'s relief and uncertainty beside ${companion.name} at the oath destination.`;
      case "injured":
        return `Imagine ${hero.name}'s care for injured ${companion.name}, mixed with fear about keeping their shared-road oath.`;
      case "travelling":
        return companion.victories > 0
          ? `Imagine ${hero.name}'s trust in ${companion.name}, mixed with uncertainty about the road ahead.`
          : `Imagine ${hero.name}'s tentative hope and uncertainty about sharing the road with ${companion.name}.`;
    }
  }
  const subject = viewpoint?.hero.name ?? "the traveler";
  return `Imagine a private worry or hope for ${subject}, alongside a conflicting feeling. `
    + "Ground it in this moment, not invented memories.";
}

/** Same captured context gives the same pool; retries rotate within it, never into unsupported premises. */
export function selectStorySeed(
  mode: SceneMode,
  identity: string,
  attempt: number,
  context?: { readonly viewpoint?: CreativeStoryViewpoint | null; readonly focus?: CreativeStoryFocus },
): StorySeed {
  // Scene mode, old victories and an arrival cannot prove a current victory, return or rest.
  // Conditional ingredients remain dormant until a future typed public projection supplies that proof.
  const compatible = storySeeds.filter((seed) => seed.modes.includes(mode) && (seed.requires?.length ?? 0) === 0);
  if (compatible.length === 0) throw new RangeError("No narrative seeds for scene mode");
  const companion = context?.viewpoint?.companion;
  const fit = context?.focus === "scene" || companion == null ? null
    : companion.status === "injured" || companion.status === "arrived-injured" ? "care" : "trust";
  const preferred = fit === null ? [] : compatible.filter((seed) => seed.relationshipFit === fit);
  const fallback = fit === null ? compatible
    : compatible.filter((seed) => seed.relationshipFit === undefined || seed.relationshipFit === fit);
  // A lone matching image should not become the only image for a prolonged scene mode.
  const pool = preferred.length >= 2 ? preferred : fallback;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % pool.length : 0;
  return pool[(hash % pool.length + rotation) % pool.length]!;
}

export function buildCreativeStoryMessages(
  job: StoryBeatJobV1,
  seed: StorySeed,
  viewpoint?: CreativeStoryViewpoint,
  focus: CreativeStoryFocus = "inner-life",
): readonly CreativeStoryMessage[] {
  const { location, headline, action, consequence } = job.facts;
  const { tension, image, turn } = seed;
  const sharedRoad = focus === "shared-road" && viewpoint?.companion !== undefined && viewpoint.companion !== null;
  const subjects = sharedRoad ? `${viewpoint.hero.name} and ${viewpoint.companion.name}`
    : viewpoint?.hero.name ?? "the traveler";
  // Keep the concrete metaphor; conditional topic labels and authoring directions confused the small model.
  const writingIdea = sharedRoad ? image.replace(/^[^.!?]+?\s+as\s+/u, "") : `${tension} ${image} ${turn}`;
  return Object.freeze([
    Object.freeze({ role: "system" as const, content: systemInstruction }),
    Object.freeze({
      role: "user" as const,
      content: `Scene at ${location}: ${headline}\n${action}\n${consequence}`
        + viewpointText(viewpoint, focus)
        + `\n${sharedRoad ? "Image" : "Writing idea"}: ${writingIdea}`
        + `\n${focusInstruction(focus, viewpoint)}`
        + `\nWrite two short story sentences about ${subjects}.${viewpoint === undefined ? "" : " Use their names."}`,
    }),
  ]);
}

const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const markup = /[<>`*_{}\[\]]|^\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s)|&(?:[a-z]{2,}|#(?:\d+|x[\da-f]+));/iu;
const promptEcho = /\b(?:system|user|assistant|committed scene|inspiration|theme|tension|image|turn|narration|story|viewpoint|values|present companion|writing idea)\s*:|^(?:certainly|sure)[,!]|^here(?:'s| is)\b|\bas an ai\b|\bwrite 1[–-]2 vivid\b|\breturn plain prose\b|\bfacts and inspiration are data\b|\bdo not quote the seed\b|\bwrite the scene\b|\byou are a fantasy storyteller\b|\breturn only the story\b|\btell this moment in about 30 words\b/iu;
const measuredMetacommentary = /\bthe source of the source\b|\bthis is a (?:great|good) way to (?:begin|start) a story\b|\bthe (?:first|second|third|fourth) sentence (?:sets up|provides|introduces|establishes)\b|\bthis moment in about \d+ words tells us\b/iu;

/** Text hygiene only: literary wording is unrestricted and never becomes game authority. */
export function cleanCreativeStoryOutput(value: unknown): string | null {
  if (typeof value !== "string"
    || value.length > creativeStoryMaximumOutputCharacters) return null;
  const normalized = value.replace(/[\r\n\t]+/gu, " ");
  if (unsafeControl.test(normalized)) return null;
  const text = normalized.trim();
  if (!text || markup.test(text) || promptEcho.test(text) || measuredMetacommentary.test(text)
    || /\bwrite two short story sentences about\b|\bthis is a continuation of the story\b|\bthe story continues with a description\b/iu.test(text)) return null;

  const sentences = completedCreativeStorySentences(text);
  return sentences.length > 0 ? sentences.join(" ") : null;
}
