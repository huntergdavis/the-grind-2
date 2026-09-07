export const adventureSpeeds = Object.freeze([1, 2, 5, 10, 25, 50, 100] as const);

export type AdventureSpeed = typeof adventureSpeeds[number];

export const adventureSpeedPreferenceKey = "the-grind-2:adventure-speed:v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function isAdventureSpeed(value: unknown): value is AdventureSpeed {
  return typeof value === "number" && adventureSpeeds.some((speed) => speed === value);
}

export function normalizeAdventureSpeed(value: unknown): AdventureSpeed {
  return isAdventureSpeed(value) ? value : 1;
}

/** Viewer timing is remembered separately from campaign state and model consent. */
export function readAdventureSpeedPreference(
  getStorage: () => PreferenceStorage = () => localStorage,
): AdventureSpeed {
  try {
    const stored = getStorage().getItem(adventureSpeedPreferenceKey);
    if (stored === null || stored.length > 128) return 1;
    const value: unknown = JSON.parse(stored);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return 1;
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== 2 || input.schemaVersion !== 1 || !isAdventureSpeed(input.speed)) return 1;
    return input.speed;
  } catch {
    return 1;
  }
}

/** False means the current-page choice must not be described as remembered. */
export function writeAdventureSpeedPreference(
  speed: AdventureSpeed,
  getStorage: () => PreferenceStorage = () => localStorage,
): boolean {
  if (!isAdventureSpeed(speed)) return false;
  try {
    getStorage().setItem(adventureSpeedPreferenceKey, JSON.stringify({ schemaVersion: 1, speed }));
    return true;
  } catch {
    return false;
  }
}

/** Fast fixtures cap the ordinary interval; they never multiply a selected speed twice. */
export function adventureStepIntervalMs(speed: AdventureSpeed, fastMode = false): number {
  return Math.min(4_800 / normalizeAdventureSpeed(speed), fastMode ? 250 : 4_800);
}
