import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "./simulation";
import { canonicalHash, canonicalStringify } from "./canonical";

describe("canonical state serialization", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalStringify({ z: 1, nested: { b: 2, a: 3 }, a: 4 })).toBe(
      '{"a":4,"nested":{"a":3,"b":2},"z":1}',
    );
  });

  it("rejects non-integer outcome math", () => {
    expect(() => canonicalStringify({ value: 0.5 })).toThrow(TypeError);
  });

  it("keeps hashes stable across JSON save, migration, and replay", () => {
    let world = createWorld("canonical-seed", "campaign");
    for (let index = 0; index < 1_000; index += 1) world = advanceWorld(world);
    const restored = upgradeWorldState(JSON.parse(JSON.stringify(world)));
    expect(canonicalHash(restored)).toBe(canonicalHash(world));

    let replay = createWorld("canonical-seed", "campaign");
    for (let index = 0; index < 1_000; index += 1) replay = advanceWorld(replay);
    expect(canonicalHash(replay)).toBe(canonicalHash(world));
  }, 20_000);

  it("produces ten stable golden campaign hashes", () => {
    const hashes = Array.from({ length: 10 }, (_, seedIndex) => {
      let world = createWorld(`golden:${seedIndex}`, `campaign:${seedIndex}`);
      for (let tick = 0; tick < 1_000; tick += 1) world = advanceWorld(world);
      return canonicalHash(world);
    });
    // v151 intentionally changes hero finish choices and ensuing progression.
    // Keep whole-state goldens plus exact JSON/resume/replay above, rather than
    // v149's now-obsolete claim that stripping research preserves old gameplay.
    expect(hashes).toEqual([
      "81d3d6ba0bda94a4",
      "839530a7574421b7",
      "c4188e077a546566",
      "e4c5ce5d2368f7dc",
      "9b583f00a41605ac",
      "4506b2616e7fd04f",
      "bab4f9f29d527a18",
      "3a3d6b25e5c1b6c0",
      "945eb6026bda52a5",
      "9c999f055e83622e",
    ]);
  }, 80_000);
});
