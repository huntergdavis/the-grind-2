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
    // v143 first divergences: seed 0's finisher classification and seed 1's Guard label;
    // seeds 2/3/6/8/9 choose lower overkill, while 4/7 use level/piercing-aware ranking. Seed 5 is unchanged.
    expect(hashes).toEqual([
      "394de1e505301842",
      "47b637af68787d22",
      "ba0d4264eead3321",
      "5c5c8688e19cb27a",
      "672919acfce595e9",
      "2264f83afc160819",
      "61a0a96f1e265fa0",
      "6b7b03f8bd44558b",
      "0b9fd43581446b8e",
      "806e68b79e682047",
    ]);
  }, 80_000);
});
