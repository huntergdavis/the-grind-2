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
      releasedHashes.push(canonicalHash({ ...world, depth: { ...world.depth, schemaVersion: 23,
        fieldResearch: world.depth.fieldResearch.inkcap } }));
      return canonicalHash(world);
    });
    // v149 changes only observational research: stripping the wrapper/new task
    // must retain v147/v148's exact gameplay AND existing Inkcap evidence.
    expect(releasedHashes).toEqual([
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
    // Audited alongside exact JSON resume and empty legacy Moonhowl migration.
    expect(hashes).toEqual([
      "2258a13ef4b03fe4",
      "4147c7bd618943dd",
      "b639d1704e956a0d",
      "a0af50da14d28ffe",
      "cdbe37e87e79b955",
      "1c1fb1f102332fc0",
      "6047f93a6f91f87d",
      "242346fa2521fb52",
      "4f81e6eac2a61567",
      "7c64e78d795da701",
    ]);
  }, 80_000);
});
