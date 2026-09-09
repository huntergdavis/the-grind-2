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
    const releasedHashes: string[] = [];
    const hashes = Array.from({ length: 10 }, (_, seedIndex) => {
      let world = createWorld(`golden:${seedIndex}`, `campaign:${seedIndex}`);
      for (let tick = 0; tick < 1_000; tick += 1) world = advanceWorld(world);
      const { fieldResearch: _research, ...releasedDepth } = world.depth;
      releasedHashes.push(canonicalHash({ ...world, depth: { ...releasedDepth, schemaVersion: 21 } }));
      return canonicalHash(world);
    });
    // v146 adds only bounded research data/schema. An independent v145 replay
    // audit matched every one of the 10,010 states without those two additions.
    expect(releasedHashes).toEqual([
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
    expect(hashes).toEqual([
      "c6cedec858d2cf0d",
      "3f746664980d2251",
      "ddeb1aae12c658a9",
      "441da62bbe97b0f5",
      "80186df3a1f050b4",
      "dc03a4f93cd00f6f",
      "d2a4f814e9e6b9c5",
      "a187b2a8b3e68b37",
      "d48f0bf49a2cf114",
      "f45df49966598fa4",
    ]);
  }, 80_000);
});
