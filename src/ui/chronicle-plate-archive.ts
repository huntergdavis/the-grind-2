import { captureChroniclePlateRecipe, type ChroniclePlateRecipeV1 } from "./chronicle-plate";

export const chroniclePlateArchiveKey = "the-grind-2:chronicle-plates:v1";
export const chroniclePlateMaximumEntries = 48;
export const chroniclePlateMaximumBytes = 128 * 1_024;

export interface ChroniclePlateArchiveSnapshot {
  readonly entries: readonly ChroniclePlateRecipeV1[];
  readonly persistent: boolean;
}

type PlateStorage = Pick<Storage, "getItem" | "setItem">;
const encoder = new TextEncoder();

function identity(recipe: ChroniclePlateRecipeV1): string {
  return JSON.stringify([recipe.campaignId, recipe.sourceEventId]);
}

function serialize(entries: readonly ChroniclePlateRecipeV1[]): string {
  return JSON.stringify({ schemaVersion: 1, entries });
}

function readEntries(stored: string): readonly ChroniclePlateRecipeV1[] | null {
  if (stored.length > chroniclePlateMaximumBytes || encoder.encode(stored).byteLength > chroniclePlateMaximumBytes) return null;
  const value: unknown = JSON.parse(stored);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).length !== 2 || envelope.schemaVersion !== 1
    || !Object.hasOwn(envelope, "entries") || !Array.isArray(envelope.entries)
    || envelope.entries.length > chroniclePlateMaximumEntries) return null;
  const entries: ChroniclePlateRecipeV1[] = [];
  const seen = new Set<string>();
  for (const source of envelope.entries) {
    const entry = captureChroniclePlateRecipe(source);
    if (entry === null || seen.has(identity(entry))) return null;
    seen.add(identity(entry));
    entries.push(entry);
  }
  return Object.freeze(entries);
}

/** A bounded local memento archive, never a canonical save or historical replay source. */
export function createChroniclePlateArchive(getStorage: () => PlateStorage = () => localStorage) {
  let entries: readonly ChroniclePlateRecipeV1[] = Object.freeze([]);
  let persistent = false;
  let writable = true;
  try {
    const stored = getStorage().getItem(chroniclePlateArchiveKey);
    const restored = stored === null ? entries : readEntries(stored);
    if (restored === null) writable = false;
    else { entries = restored; persistent = true; }
  } catch {
    // An unreadable or unvalidated archive is preserved, not replaced with an empty archive.
    writable = false;
  }

  return {
    get snapshot(): ChroniclePlateArchiveSnapshot { return Object.freeze({ entries, persistent }); },
    /** True means a new local entry; snapshot.persistent separately reports whether it was saved. */
    record(recipe: unknown): boolean {
      const entry = captureChroniclePlateRecipe(recipe);
      if (entry === null || entries.some((previous) => identity(previous) === identity(entry))) return false;
      const retained = [entry, ...entries].slice(0, chroniclePlateMaximumEntries);
      let stored = serialize(retained);
      while (encoder.encode(stored).byteLength > chroniclePlateMaximumBytes) {
        retained.pop();
        stored = serialize(retained);
      }
      if (!retained.includes(entry)) return false;
      entries = Object.freeze(retained);
      persistent = false;
      if (writable) try {
        getStorage().setItem(chroniclePlateArchiveKey, stored);
        persistent = true;
      } catch {
        // Quota or policy failures keep this page's captured entries available without claiming persistence.
      }
      return true;
    },
  };
}
