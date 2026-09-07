import type { HeroValue } from "../core/types";

export type { HeroValue } from "../core/types";

const knownValues = ["curiosity", "loyalty", "mercy", "courage"] as const;

/** A recorded value can inspire authored wording; it is not a measured mood or a dominant personality label. */
export function normalizeStoryVoiceValue(raw: unknown): HeroValue | null {
  return raw === "curiosity" || raw === "loyalty" || raw === "mercy" || raw === "courage" ? raw : null;
}

// Original first-person interpretation. Companion traits, biography and future outcomes are deliberately absent.
const thoughts = {
  healthy: {
    curiosity: [
      "I want to understand this unfamiliar relief without pinning it down too quickly.",
      "I wonder how much of my excitement is discovery, and how much is simply not being alone.",
    ],
    loyalty: [
      "I want this trust to matter without making it a debt between us.",
      "I hope standing together can leave us both enough room to doubt.",
    ],
    mercy: [
      "I want to enjoy this relief without letting victory make gentleness feel foolish.",
      "I hope there is room for kindness inside the pride I feel.",
    ],
    courage: [
      "I want to welcome this pride without mistaking it for the end of fear.",
      "I hope I can be brave without needing my doubts to disappear.",
    ],
  },
  injured: {
    curiosity: [
      "I wish understanding my worry were as easy as finding another question.",
      "I want to understand what help means here without treating another person's hurt as a puzzle.",
    ],
    loyalty: [
      "I want my concern to feel like company, not another weight to carry.",
      "I worry that wanting to be dependable can make me forget to listen.",
    ],
    mercy: [
      "I hope my care can leave room for dignity as well as pain.",
      "I want to be gentle without letting pity decide what someone else needs.",
    ],
    courage: [
      "I want the courage to admit how frightened another person's hurt makes me.",
      "I hope being brave can mean facing this worry without pretending it is small.",
    ],
  },
} as const;

/** Shared bounded selection only; input order and duplicates never imply relative strength. */
function selectStoryVoice(
  values: unknown,
  identity: string,
  attempt: number,
): Readonly<{ value: HeroValue; variant: 0 | 1 }> | null {
  try {
    if (!Array.isArray(values)) return null;
    const count = values.length;
    if (!Number.isSafeInteger(count) || count === 0 || count > 16) return null;
    const supplied = new Set<HeroValue>();
    for (let index = 0; index < count; index++) {
      const value = normalizeStoryVoiceValue(values[index]);
      if (value === null) return null;
      supplied.add(value);
    }
    const pool = knownValues.filter((value) => supplied.has(value));
    if (pool.length === 0) return null;
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
    const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt : 0;
    const value = pool[(hash % pool.length + rotation % pool.length) % pool.length]!;
    // Rotate wording after a complete value cycle so even two-value heroes receive both authored variants.
    const variant = ((hash >>> 3) % 2 + Math.floor(rotation / pool.length) % 2) % 2;
    return Object.freeze({ value, variant: variant as 0 | 1 });
  } catch {
    return null;
  }
}

/** First-victory thoughts retain their exact original value and wording rotation. */
export function createHeroStoryVoice(
  values: unknown,
  condition: "healthy" | "injured",
  identity: string,
  attempt: number,
): Readonly<{ value: HeroValue; text: string }> | null {
  if (condition !== "healthy" && condition !== "injured") return null;
  const selected = selectStoryVoice(values, identity, attempt);
  return selected === null ? null : Object.freeze({
    value: selected.value, text: thoughts[condition][selected.value][selected.variant],
  });
}

// Original second sentences preserve the living, injured departure while imagining only the hero's reflection.
const farewellThoughts = {
  curiosity: [
    (hero: string, companion: string) => `${companion} was leaving wounded but alive, and ${hero} wondered how to live with questions that concern alone could not answer.`,
    (hero: string, companion: string) => `As ${companion} left wounded but alive, ${hero} wanted to understand the unease without turning another person's pain into a puzzle.`,
  ],
  loyalty: [
    (hero: string, companion: string) => `${companion} was leaving wounded but alive; ${hero} hoped that caring could survive a goodbye without becoming a demand to stay.`,
    (hero: string, companion: string) => `With ${companion} departing wounded but alive, ${hero} felt how difficult it was to value an oath without treating it as a tether.`,
  ],
  mercy: [
    (hero: string, companion: string) => `${companion} was leaving wounded but alive, and ${hero} hoped concern could make room for dignity instead of shrinking into pity.`,
    (hero: string, companion: string) => `As ${companion} left wounded but alive, ${hero} wanted tenderness to remain possible without pretending it could set everything right.`,
  ],
  courage: [
    (hero: string, companion: string) => `${companion} was leaving wounded but alive; ${hero} wondered whether courage might mean admitting the fear that relief had not erased.`,
    (hero: string, companion: string) => `With ${companion} departing wounded but alive, ${hero} hoped to face the uncertainty without dressing it up as confidence.`,
  ],
} as const;

/** Authored farewell interpretation, never a new history record or a trait assigned to the departing companion. */
export function createHeroFarewellVoice(
  values: unknown,
  heroName: string,
  companionName: string,
  identity: string,
  attempt: number,
): Readonly<{ value: HeroValue; text: string }> | null {
  const selected = selectStoryVoice(values, identity, attempt);
  return selected === null ? null : Object.freeze({
    value: selected.value, text: farewellThoughts[selected.value][selected.variant](heroName, companionName),
  });
}
