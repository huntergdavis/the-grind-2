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
      // v178 keeps Depth 35 and adds exact witnessed memory only to matching new reunions.
      // Snapshot the entire resulting state; do not normalize away real mechanics.
      return canonicalHash(world);
    });
    expect(hashes).toEqual([
      "cafb7919c6f51ba3",
      "a730955269e56daf",
      "ae7c822856e64ac8",
      "7754231a8353130c",
      "fcd59cc3e43f9b03",
      "29eb1a0b46b87125",
      "24c5ca86e03e5490",
      "62f147b3b0c2b6fc",
      "3f589ac48da15615",
      "3131f7ca8a1fa3b9",
    ]);
  }, 80_000);
});
