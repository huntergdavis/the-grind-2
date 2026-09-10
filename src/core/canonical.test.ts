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
    // v147's first divergences are actual low-health searches, at ticks
    // 81/271/25/26/810/154/17/195/23/18. All earlier normalized states match v146.
    // The 10,000-turn audit observed 201 searches and 28 discoveries; saves resume.
    expect(hashes).toEqual([
      "fd4d03b97a0c5856",
      "678308f5167006b2",
      "ec96b70d03d9afdc",
      "4a143f4df80eb5a7",
      "e0378240067a5aff",
      "8fa7e96b720652b6",
      "d34b799b86c6c64a",
      "8b31cb74297eac95",
      "947ac94e8f4a74d3",
      "6c32de4c400ecfbf",
    ]);
  }, 80_000);
});
