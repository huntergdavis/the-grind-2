import { describe, expect, it } from "vitest";
import type { WeaponMemoryCeremonyPacketV1 } from "../ui/weapon-memory";
import {
  projectWeaponMemoryCutawayFrame,
  weaponMemoryDurationSeconds,
} from "./weapon-memory-cutaway";

const packet = {} as WeaponMemoryCeremonyPacketV1;

describe("weapon memory cutaway choreography", () => {
  it("advances through the bounded memory phases", () => {
    const phases = [0, 1.5, 3, 5.2, 6.4, 7.6, 8.5, weaponMemoryDurationSeconds]
      .map((elapsed) => projectWeaponMemoryCutawayFrame(packet, elapsed, false).phase);
    expect(phases).toEqual([
      "name",
      "first-use",
      "road",
      "familiar-form",
      "final-strike",
      "memory",
      "final",
      "settled",
    ]);
  });

  it("reveals all exact-fact layers by the final tableau", () => {
    const frame = projectWeaponMemoryCutawayFrame(packet, 8.5, false);
    expect(frame.weaponAlpha).toBe(1);
    expect(frame.marksProgress).toBe(1);
    expect(frame.firstAlpha).toBe(1);
    expect(frame.strongestAlpha).toBe(1);
    expect(frame.formAlpha).toBe(1);
    expect(frame.finalAlpha).toBe(1);
    expect(frame.tableauAlpha).toBeGreaterThan(0.5);
  });

  it("renders reduced motion and forced outcome as the same complete static truth", () => {
    const reduced = projectWeaponMemoryCutawayFrame(packet, 0, true);
    const forced = projectWeaponMemoryCutawayFrame(packet, 0, false, true);
    expect(reduced).toEqual(forced);
    expect(reduced).toMatchObject({
      phase: "static",
      marksProgress: 1,
      firstAlpha: 1,
      strongestAlpha: 1,
      formAlpha: 1,
      finalAlpha: 1,
      tableauAlpha: 1,
    });
  });

  it("clamps invalid elapsed time without emitting invalid geometry", () => {
    for (const elapsed of [Number.NaN, Number.NEGATIVE_INFINITY, -5, Number.POSITIVE_INFINITY]) {
      const frame = projectWeaponMemoryCutawayFrame(packet, elapsed, false);
      expect(Object.values(frame).filter((value): value is number => typeof value === "number").every(Number.isFinite)).toBe(true);
    }
  });
});
