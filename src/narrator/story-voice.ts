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

/** Select only among captured known values. Input order and duplicates never imply relative strength. */
export function createHeroStoryVoice(
  values: unknown,
  condition: "healthy" | "injured",
  identity: string,
  attempt: number,
): Readonly<{ value: HeroValue; text: string }> | null {
  try {
    if (!Array.isArray(values) || (condition !== "healthy" && condition !== "injured")) return null;
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
    return Object.freeze({ value, text: thoughts[condition][value][variant]! });
  } catch {
    return null;
  }
}
