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
    const gameplayHashes: string[] = [];
    const hashes = Array.from({ length: 10 }, (_, seedIndex) => {
      let world = createWorld(`golden:${seedIndex}`, `campaign:${seedIndex}`);
      for (let tick = 0; tick < 1_000; tick += 1) world = advanceWorld(world);
      // Normalize only this release's new schema/observation fields. Every
      // pre-existing gameplay fact must still match the shipped v153 snapshot.
      gameplayHashes.push(canonicalHash({ ...world, depth: { ...world.depth,
        schemaVersion: 24, fieldResearch: { schemaVersion: 2,
          inkcap: world.depth.fieldResearch.inkcap, moonhowl: world.depth.fieldResearch.moonhowl } } }));
      return canonicalHash(world);
    });
    expect(gameplayHashes).toEqual([
      "81d3d6ba0bda94a4", "839530a7574421b7", "c4188e077a546566", "e4c5ce5d2368f7dc", "9b583f00a41605ac",
      "4506b2616e7fd04f", "bab4f9f29d527a18", "3a3d6b25e5c1b6c0", "945eb6026bda52a5", "9c999f055e83622e",
    ]);
    expect(hashes).toEqual([
      "494ff52dabfd8cb2",
      "467d93e9003ddf9e",
      "5827e8358d5fafcb",
      "ceb587cd5b3e290b",
      "d723f89430f8f3f4",
      "fd7f8a05ef393e59",
      "2e955c0ae187e2da",
      "7487bd1d47bc503e",
      "98dd7b2fc632e1e1",
      "629066e51099c5d8",
    ]);
  }, 80_000);
});
