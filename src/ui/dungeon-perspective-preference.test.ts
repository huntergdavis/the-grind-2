import { describe, expect, it } from "vitest";
import {
  dungeonPerspectivePreferenceKey, normalizeDungeonPerspective, readDungeonPerspectivePreference,
  writeDungeonPerspectivePreference, type DungeonPerspective,
} from "./dungeon-perspective-preference";

function storage(initial: string | null = null) {
  const entries = new Map<string, string>();
  if (initial !== null) entries.set(dungeonPerspectivePreferenceKey, initial);
  return { entries, getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
}

describe("optional dungeon perspective preference", () => {
  it("defaults to the existing map and accepts only the two supported views", () => {
    expect(readDungeonPerspectivePreference(() => storage())).toBe("map");
    for (const value of [null, undefined, 1, true, "3d", "FIRST-PERSON", {}, []]) {
      expect(normalizeDungeonPerspective(value)).toBe("map");
    }
    expect(normalizeDungeonPerspective("map")).toBe("map");
    expect(normalizeDungeonPerspective("first-person")).toBe("first-person");
  });

  it("round-trips either choice without touching campaign or narrator preferences", () => {
    const store = storage();
    store.setItem("campaign:example", "untouched");
    store.setItem("the-grind-2:play-mode:v1", "untouched");
    for (const perspective of ["first-person", "map"] as const) {
      expect(writeDungeonPerspectivePreference(perspective, () => store)).toBe(true);
      expect(readDungeonPerspectivePreference(() => store)).toBe(perspective);
      expect(store.entries.get(dungeonPerspectivePreferenceKey)).toBe(JSON.stringify({ schemaVersion: 1, perspective }));
    }
    expect([...store.entries.keys()]).toEqual(["campaign:example", "the-grind-2:play-mode:v1", dungeonPerspectivePreferenceKey]);
    expect(store.entries.get("campaign:example")).toBe("untouched");
    expect(store.entries.get("the-grind-2:play-mode:v1")).toBe("untouched");
  });

  it("rejects malformed, oversized, future and extra-field records", () => {
    for (const value of ["{", "null", "[]", "true", '"first-person"',
      JSON.stringify({ schemaVersion: 2, perspective: "first-person" }),
      JSON.stringify({ perspective: "first-person" }),
      JSON.stringify({ schemaVersion: 1, perspective: "3d" }),
      JSON.stringify({ schemaVersion: 1, perspective: "first-person", seed: "not-a-view-setting" }),
      " ".repeat(129) + JSON.stringify({ schemaVersion: 1, perspective: "first-person" }),
    ]) expect(readDungeonPerspectivePreference(() => storage(value))).toBe("map");
  });

  it("survives unavailable reads and reports unsuccessful writes without clearing anything", () => {
    const unavailable = () => { throw new Error("Storage denied"); };
    expect(readDungeonPerspectivePreference(unavailable)).toBe("map");
    expect(writeDungeonPerspectivePreference("first-person", unavailable)).toBe(false);
    const blocked = { getItem: unavailable, setItem: unavailable };
    expect(readDungeonPerspectivePreference(() => blocked)).toBe("map");
    expect(writeDungeonPerspectivePreference("first-person", () => blocked)).toBe(false);
    const store = storage();
    expect(writeDungeonPerspectivePreference("invalid" as DungeonPerspective, () => store)).toBe(false);
    expect(store.entries.size).toBe(0);
  });
});
