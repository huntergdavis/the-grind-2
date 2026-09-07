import type { CreativeStoryFocus } from "../narrator/creative-story";

export type StoryRhythm = "balanced" | "quiet" | "rare";
export type StoryDraftRecovery = "vignette" | "quiet";
export interface StorytellingPreferences {
  readonly schemaVersion: 1;
  readonly focus: CreativeStoryFocus;
  readonly rhythm: StoryRhythm;
  readonly draftRecovery: StoryDraftRecovery;
}

export const storytellingPreferenceKey = "the-grind-2:storytelling:v1";
export const defaultStorytellingPreferences: StorytellingPreferences = Object.freeze({
  schemaVersion: 1, focus: "inner-life", rhythm: "balanced", draftRecovery: "vignette",
});

/** Presentation preferences only: never restore activation, prose, or model downloads. */
export function normalizeStorytellingPreferences(value: unknown): StorytellingPreferences {
  if (value === null || typeof value !== "object") return defaultStorytellingPreferences;
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) return defaultStorytellingPreferences;
  const focus = input.focus === "inner-life" || input.focus === "shared-road" || input.focus === "scene"
    ? input.focus : defaultStorytellingPreferences.focus;
  const rhythm = input.rhythm === "balanced" || input.rhythm === "quiet" || input.rhythm === "rare"
    ? input.rhythm : defaultStorytellingPreferences.rhythm;
  const draftRecovery = input.draftRecovery === "vignette" || input.draftRecovery === "quiet"
    ? input.draftRecovery : defaultStorytellingPreferences.draftRecovery;
  return Object.freeze({ schemaVersion: 1, focus, rhythm, draftRecovery });
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readStorytellingPreferences(getStorage: () => PreferenceStorage = () => localStorage): StorytellingPreferences {
  try {
    return normalizeStorytellingPreferences(JSON.parse(getStorage().getItem(storytellingPreferenceKey) ?? "null"));
  } catch {
    return defaultStorytellingPreferences;
  }
}

export function writeStorytellingPreferences(
  preferences: StorytellingPreferences,
  getStorage: () => PreferenceStorage = () => localStorage,
): void {
  try {
    getStorage().setItem(storytellingPreferenceKey, JSON.stringify(normalizeStorytellingPreferences(preferences)));
  } catch {
    // Current-page controls still work when browser storage is blocked or full.
  }
}

export function storytellingCadenceMs(rhythm: StoryRhythm): number {
  return { balanced: 90_000, quiet: 180_000, rare: 300_000 }[rhythm];
}

export function effectiveStoryFocus(focus: CreativeStoryFocus, hasCompanion: boolean): CreativeStoryFocus {
  return focus === "shared-road" && !hasCompanion ? "inner-life" : focus;
}
