import { describe, expect, it, vi } from "vitest";
import {
  defaultStorytellingPreferences, effectiveStoryFocus, normalizeStorytellingPreferences,
  readStorytellingPreferences, storytellingCadenceMs, storytellingPreferenceKey, writeStorytellingPreferences,
} from "./storytelling-preferences";

describe("storytelling presentation preferences", () => {
  it.each([null, "bad JSON", "null", "[]", '{"schemaVersion":2,"focus":"scene","rhythm":"rare"}'])(
    "uses the watch-first defaults for missing or unsupported storage: %s", (stored) => {
      expect(readStorytellingPreferences(() => ({ getItem: () => stored, setItem: vi.fn() })))
        .toEqual(defaultStorytellingPreferences);
    },
  );

  it("recovers valid fields independently and discards unrelated data", () => {
    expect(normalizeStorytellingPreferences({ schemaVersion: 1, focus: "shared-road", rhythm: "too-fast", enabled: true }))
      .toEqual({ schemaVersion: 1, focus: "shared-road", rhythm: "balanced", draftRecovery: "vignette" });
    expect(normalizeStorytellingPreferences({ schemaVersion: 1, focus: "unknown", rhythm: "quiet" }))
      .toEqual({ schemaVersion: 1, focus: "inner-life", rhythm: "quiet", draftRecovery: "vignette" });
  });

  it("adds draft recovery to old version-one preferences without changing their focus or rhythm", () => {
    const previous = { schemaVersion: 1, focus: "shared-road", rhythm: "rare" };
    expect(normalizeStorytellingPreferences(previous))
      .toEqual({ ...previous, draftRecovery: "vignette" });
    expect(previous).not.toHaveProperty("draftRecovery");
    expect(Object.isFrozen(normalizeStorytellingPreferences(previous))).toBe(true);
  });

  it("normalizes draft recovery independently and preserves an explicit quiet choice", () => {
    expect(normalizeStorytellingPreferences({ schemaVersion: 1, draftRecovery: "quiet" }))
      .toEqual({ ...defaultStorytellingPreferences, draftRecovery: "quiet" });
    for (const draftRecovery of [null, true, "model", "Vignette", {}]) {
      expect(normalizeStorytellingPreferences({ schemaVersion: 1, draftRecovery }))
        .toEqual(defaultStorytellingPreferences);
    }
  });

  it("round trips only presentation preferences, never writer activation or prose", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    writeStorytellingPreferences({ schemaVersion: 1, focus: "scene", rhythm: "rare", draftRecovery: "quiet", enabled: true, text: "Private story" } as never, () => storage);
    expect(storage.setItem).toHaveBeenCalledWith(storytellingPreferenceKey,
      '{"schemaVersion":1,"focus":"scene","rhythm":"rare","draftRecovery":"quiet"}');
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0]![1]);
    expect(readStorytellingPreferences(() => storage)).toEqual({ schemaVersion: 1, focus: "scene", rhythm: "rare", draftRecovery: "quiet" });
  });

  it("survives blocked storage getters, reads, and writes", () => {
    const blocked = () => { throw Error("Storage denied"); };
    expect(readStorytellingPreferences(blocked)).toEqual(defaultStorytellingPreferences);
    expect(readStorytellingPreferences(() => ({ getItem: blocked, setItem: blocked }))).toEqual(defaultStorytellingPreferences);
    expect(() => writeStorytellingPreferences(defaultStorytellingPreferences, blocked)).not.toThrow();
    expect(() => writeStorytellingPreferences(defaultStorytellingPreferences, () => ({ getItem: blocked, setItem: blocked }))).not.toThrow();
  });

  it("retains shared-road preference while solo, then restores it when a companion is present", () => {
    const preferences = normalizeStorytellingPreferences({ schemaVersion: 1, focus: "shared-road", rhythm: "quiet" });
    expect(effectiveStoryFocus(preferences.focus, false)).toBe("inner-life");
    expect(preferences.focus).toBe("shared-road");
    expect(effectiveStoryFocus(preferences.focus, true)).toBe("shared-road");
    expect(effectiveStoryFocus("scene", false)).toBe("scene");
  });

  it("uses explicit minimum gaps with the previous 90-second rhythm as the default", () => {
    expect(storytellingCadenceMs("balanced")).toBe(90_000);
    expect(storytellingCadenceMs("quiet")).toBe(180_000);
    expect(storytellingCadenceMs("rare")).toBe(300_000);
  });
});
