import { describe, expect, it, vi } from "vitest";
import {
  adventureSpeeds,
  adventureSpeedPreferenceKey,
  adventureStepIntervalMs,
  normalizeAdventureSpeed,
  readAdventureSpeedPreference,
  writeAdventureSpeedPreference,
  type AdventureSpeed,
} from "./adventure-speed";

describe("bounded adventure speed", () => {
  it("exposes only the seven immutable numeric presets", () => {
    expect(adventureSpeeds).toEqual([1, 2, 5, 10, 25, 50, 100]);
    expect(Object.isFrozen(adventureSpeeds)).toBe(true);
  });

  it.each(adventureSpeeds)("preserves the supported %sx speed", (speed) => {
    expect(normalizeAdventureSpeed(speed)).toBe(speed);
  });

  it.each([undefined, null, false, true, "1", "100", 0, -1, 3, 1.5, 101, Infinity, -Infinity, NaN, {}, [100]])(
    "defaults unsupported input %s to1x without coercion", (value) => {
      expect(normalizeAdventureSpeed(value)).toBe(1);
    },
  );

  it.each([
    [1, 4_800, 250], [2, 2_400, 250], [5, 960, 250], [10, 480, 250],
    [25, 192, 192], [50, 96, 96], [100, 48, 48],
  ] as const)("uses bounded intervals for %sx with and without the fast fixture", (speed, ordinary, fast) => {
    expect(adventureStepIntervalMs(speed)).toBe(ordinary);
    expect(adventureStepIntervalMs(speed, false)).toBe(ordinary);
    expect(adventureStepIntervalMs(speed, true)).toBe(fast);
    expect(adventureStepIntervalMs(speed, true)).toBeGreaterThanOrEqual(48);
  });

  it("normalizes malformed runtime speed before calculating an interval", () => {
    expect(adventureStepIntervalMs(0 as AdventureSpeed)).toBe(4_800);
    expect(adventureStepIntervalMs(Infinity as AdventureSpeed, true)).toBe(250);
    expect(adventureStepIntervalMs("100" as unknown as AdventureSpeed)).toBe(4_800);
  });
});

describe("remembered adventure speed", () => {
  it.each(adventureSpeeds)("round trips %sx with only its exact version and speed", (speed) => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => saved.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }),
    };
    expect(writeAdventureSpeedPreference(speed, () => storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
      adventureSpeedPreferenceKey, `{"schemaVersion":1,"speed":${speed}}`,
    );
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(readAdventureSpeedPreference(() => storage)).toBe(speed);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(adventureSpeedPreferenceKey);
    expect(Object.keys(JSON.parse(saved.get(adventureSpeedPreferenceKey)!))).toEqual(["schemaVersion", "speed"]);
  });

  it.each([
    null, "", "bad JSON", "null", "[]", "true", "100", '"100"', "{}",
    '{"speed":100}', '{"schemaVersion":0,"speed":100}', '{"schemaVersion":2,"speed":100}',
    '{"schemaVersion":"1","speed":100}', '{"schemaVersion":1}',
    '{"schemaVersion":1,"speed":"100"}', '{"schemaVersion":1,"speed":3}',
    '{"schemaVersion":1,"speed":0}', '{"schemaVersion":1,"speed":null}',
    '{"schemaVersion":1,"speed":100,"campaignId":"private"}',
    '{"schemaVersion":1,"speed":100,"enabled":true}',
    " ".repeat(129),
  ])("returns1x for absent, malformed or unsupported stored value %s without rewriting it", (stored) => {
    const storage = { getItem: vi.fn(() => stored), setItem: vi.fn() };
    expect(readAdventureSpeedPreference(() => storage)).toBe(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("leaves campaign data and narration preferences untouched", () => {
    const saved = new Map([
      ["the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}'],
      ["the-grind-2:storytelling:v1", '{"schemaVersion":1,"focus":"shared-road"}'],
      ["campaign:one", "existing save"],
    ]);
    const before = [...saved];
    const storage = {
      getItem: vi.fn((key: string) => saved.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }),
    };
    expect(readAdventureSpeedPreference(() => storage)).toBe(1);
    expect(writeAdventureSpeedPreference(100, () => storage)).toBe(true);
    for (const [key, value] of before) expect(saved.get(key)).toBe(value);
    expect(saved.size).toBe(before.length + 1);
  });

  it("reports failed persistence truthfully when storage is blocked or full", () => {
    const blocked = () => { throw new Error("Storage blocked"); };
    expect(readAdventureSpeedPreference(blocked)).toBe(1);
    expect(readAdventureSpeedPreference(() => ({ getItem: blocked, setItem: vi.fn() }))).toBe(1);
    expect(writeAdventureSpeedPreference(5, blocked)).toBe(false);
    expect(writeAdventureSpeedPreference(5, () => ({ getItem: vi.fn(), setItem: blocked }))).toBe(false);
  });

  it("rejects invalid runtime write values without invoking storage or object serialization", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const getStorage = vi.fn(() => storage);
    const toJSON = vi.fn(() => 100);
    for (const value of [undefined, null, "100", 3, Infinity, { speed: 100, toJSON }]) {
      expect(writeAdventureSpeedPreference(value as AdventureSpeed, getStorage)).toBe(false);
    }
    expect(getStorage).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("uses localStorage only when a read or write is requested", () => {
    const storage = { getItem: vi.fn(() => '{"schemaVersion":1,"speed":25}'), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    try {
      expect(readAdventureSpeedPreference()).toBe(25);
      expect(writeAdventureSpeedPreference(50)).toBe(true);
      expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(adventureSpeedPreferenceKey, '{"schemaVersion":1,"speed":50}');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
