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
      // v159 records Depth 28, learned vocabulary, and the real three-round flyting turns.
      // Snapshot the entire resulting state; do not normalize away real mechanics.
      return canonicalHash(world);
    });
    expect(hashes).toEqual([
      "5010a5964e794456",
      "872cb1f639091782",
      "2d2eeecf279df1f8",
      "ce0ef523c5c0ec02",
      "42ccbeb0350d2787",
      "8da0f55e5dc40576",
      "c200614100e4e762",
      "ee3f2738226cae3e",
      "6b4ae6e9372d982e",
      "4eef1b6b92811a8b",
    ]);
  }, 80_000);
});
