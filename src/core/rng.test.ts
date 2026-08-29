import { describe, expect, it } from "vitest";
import { randomInt, randomUnit } from "./rng";

describe("keyed random generation", () => {
  it("returns the same value for the same semantic key", () => {
    expect(randomUnit("seed", "world", "hero", 12, "weather", 3)).toBe(
      randomUnit("seed", "world", "hero", 12, "weather", 3),
    );
  });

  it("isolates unrelated purposes", () => {
    expect(randomUnit("seed", "world", "hero", 12, "weather")).not.toBe(
      randomUnit("seed", "world", "hero", 12, "treasure"),
    );
  });

  it("rejects invalid integer ranges", () => {
    expect(() => randomInt(0, "seed", "world", "hero", 0, "test")).toThrow(
      RangeError,
    );
  });
});
