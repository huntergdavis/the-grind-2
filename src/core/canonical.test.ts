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
      // v163 records Depth 32 and the once-only source-bound delivery memory.
      // Snapshot the entire resulting state; do not normalize away real mechanics.
      return canonicalHash(world);
    });
    expect(hashes).toEqual([
      "62035c3055535b45",
      "eb7669b11bbed580",
      "01bf601bde0ef66f",
      "ac1c1faca2803c60",
      "fdd1f8553ffb93d1",
      "db9b5e55e75a0684",
      "adad12f0397f5ec5",
      "831925e2ced740dc",
      "a31d3c57ef865f78",
      "d1d72f57c6ffee28",
    ]);
  }, 80_000);
});
