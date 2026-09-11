export type DungeonPerspective = "map" | "first-person";

export const dungeonPerspectivePreferenceKey = "the-grind-2:dungeon-perspective:v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function isDungeonPerspective(value: unknown): value is DungeonPerspective {
  return value === "map" || value === "first-person";
}

export function normalizeDungeonPerspective(value: unknown): DungeonPerspective {
  return isDungeonPerspective(value) ? value : "map";
}

/** A viewer preference, never part of the campaign or its turn stream. */
export function readDungeonPerspectivePreference(
  getStorage: () => PreferenceStorage = () => localStorage,
): DungeonPerspective {
  try {
    const stored = getStorage().getItem(dungeonPerspectivePreferenceKey);
    if (stored === null || stored.length > 128) return "map";
    const value: unknown = JSON.parse(stored);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return "map";
    const input = value as Record<string, unknown>;
    return Object.keys(input).length === 2 && input.schemaVersion === 1 && isDungeonPerspective(input.perspective)
      ? input.perspective : "map";
  } catch {
    return "map";
  }
}

/** A blocked store keeps the current-page choice without claiming it was saved. */
export function writeDungeonPerspectivePreference(
  perspective: DungeonPerspective,
  getStorage: () => PreferenceStorage = () => localStorage,
): boolean {
  if (!isDungeonPerspective(perspective)) return false;
  try {
    getStorage().setItem(dungeonPerspectivePreferenceKey, JSON.stringify({ schemaVersion: 1, perspective }));
    return true;
  } catch {
    return false;
  }
}
