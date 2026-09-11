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
      // v168 keeps Depth 35 and records actual dungeon tonic use and its consequences.
      // Snapshot the entire resulting state; do not normalize away real mechanics.
      return canonicalHash(world);
    });
    expect(hashes).toEqual([
      "6403d2775500bf56",
      "1f0e4fbca0df4717",
      "22d1bd2f3947b748",
      "6958754e410ad9f7",
      "339dbb53fb16ca78",
      "ba57bb5f6d876a83",
      "a1bd0322d850a67c",
      "e960c70867961178",
      "91b400db939a77e9",
      "6a9a5d1701183647",
    ]);
  }, 80_000);
});
