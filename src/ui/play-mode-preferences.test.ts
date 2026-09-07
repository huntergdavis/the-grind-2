import { describe, expect, it, vi } from "vitest";
import {
  planPlayStartup,
  playModePreferenceKey,
  readPlayModePreference,
  writePlayModePreference,
  type PlayMode,
} from "./play-mode-preferences";

describe("explicit play-mode preference", () => {
  it.each(["deterministic", "llm"] as const)("round trips only schema and the %s choice", (mode) => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    writePlayModePreference(mode, () => storage);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(playModePreferenceKey, `{"schemaVersion":1,"mode":"${mode}"}`);
    expect(storage.getItem).not.toHaveBeenCalled();
    storage.getItem.mockReturnValue(storage.setItem.mock.calls[0]![1]);
    expect(readPlayModePreference(() => storage)).toBe(mode);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(playModePreferenceKey);
    expect(Object.keys(JSON.parse(storage.setItem.mock.calls[0]![1]))).toEqual(["schemaVersion", "mode"]);
  });

  it.each([
    null, "", "bad JSON", "null", "[]", "true", "1", '"llm"', "{}",
    '{"mode":"llm"}',
    '{"schemaVersion":0,"mode":"llm"}',
    '{"schemaVersion":2,"mode":"llm"}',
    '{"schemaVersion":"1","mode":"llm"}',
    '{"schemaVersion":1}',
    '{"schemaVersion":1,"mode":true}',
    '{"schemaVersion":1,"mode":"LLM"}',
    '{"schemaVersion":1,"mode":"automatic"}',
    '{"schemaVersion":1,"mode":"llm","enabled":true}',
    '{"schemaVersion":1,"mode":"llm","prose":"Not a preference"}',
    '{"schemaVersion":1,"mode":"llm","model":"Other writer"}',
  ])("requires a new choice for absent, malformed, unsupported or extraneous storage: %s", (stored) => {
    const storage = { getItem: vi.fn(() => stored), setItem: vi.fn() };
    expect(readPlayModePreference(() => storage)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not migrate unrelated storytelling settings into play-mode consent", () => {
    const previous = '{"schemaVersion":1,"focus":"shared-road","rhythm":"rare","draftRecovery":"quiet"}';
    const saved = new Map<string, string>([
      ["the-grind-2:storytelling:v1", previous],
      ["unrelated-save", "Retained campaign data"],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => saved.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }),
    };
    expect(readPlayModePreference(() => storage)).toBeNull();
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(playModePreferenceKey);
    expect(storage.setItem).not.toHaveBeenCalled();
    writePlayModePreference("deterministic", () => storage);
    expect(saved.get("the-grind-2:storytelling:v1")).toBe(previous);
    expect(saved.get("unrelated-save")).toBe("Retained campaign data");
    expect(saved.size).toBe(3);
  });

  it("does not serialize invalid runtime values or their extraneous data", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const getStorage = vi.fn(() => storage);
    const toJSON = vi.fn(() => ({ mode: "llm", prose: "Private text" }));
    for (const value of [null, true, "automatic", { mode: "llm", enabled: true, toJSON }]) {
      writePlayModePreference(value as PlayMode, getStorage);
    }
    expect(getStorage).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("survives blocked storage access, blocked reads and failed writes", () => {
    const blocked = () => { throw Error("Storage unavailable"); };
    expect(readPlayModePreference(blocked)).toBeNull();
    expect(readPlayModePreference(() => ({ getItem: blocked, setItem: vi.fn() }))).toBeNull();
    expect(() => writePlayModePreference("llm", blocked)).not.toThrow();
    expect(() => writePlayModePreference("deterministic", () => ({ getItem: vi.fn(), setItem: blocked }))).not.toThrow();
  });
});

const startupCases = ([null, "deterministic", "llm"] as const).flatMap((mode) =>
  [false, true].flatMap((fresh) => [false, true].map((cached) => ({
    mode, fresh, cached,
    expected: fresh || mode === null ? "choose"
      : mode === "deterministic" ? "deterministic" : cached ? "restore" : "choose",
  }))),
);

describe("play startup planning", () => {
  it.each(startupCases)("plans $expected for mode=$mode fresh=$fresh cached=$cached", ({ expected, ...input }) => {
    const before = { ...input };
    expect(planPlayStartup(input)).toBe(expected);
    expect(input).toEqual(before);
  });

  it("does not interpret a remembered LLM choice as permission to redownload missing files", () => {
    expect(planPlayStartup({ mode: "llm", fresh: false, cached: false })).toBe("choose");
    expect(planPlayStartup({ mode: "llm", fresh: false, cached: true })).toBe("restore");
  });

  it("requires an explicit choice for an unsupported runtime mode even with a complete cache", () => {
    expect(planPlayStartup({ mode: "automatic" as PlayMode, fresh: false, cached: true })).toBe("choose");
  });
});
