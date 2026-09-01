import { describe, expect, it } from "vitest";
import {
  heroGrowthAllocationDurationSeconds,
  heroGrowthAllocationStaticHoldSeconds,
  projectHeroGrowthAllocationCutawayFrame,
} from "./hero-growth-allocation-cutaway";

describe("hero growth allocation cutaway", () => {
  it("cycles one to three allocations inside one bounded seven-beat montage", () => {
    expect(heroGrowthAllocationDurationSeconds(1)).toBe(8.5);
    expect(heroGrowthAllocationDurationSeconds(2)).toBe(9.6);
    expect(heroGrowthAllocationDurationSeconds(3)).toBe(10.7);
    expect(() => heroGrowthAllocationDurationSeconds(0)).toThrow(RangeError);
    expect(() => heroGrowthAllocationDurationSeconds(4)).toThrow(RangeError);

    const duration = heroGrowthAllocationDurationSeconds(3);
    const seen = new Set<string>();
    const active = new Set<number>();
    for (let step = 0; step <= 240; step += 1) {
      const frame = projectHeroGrowthAllocationCutawayFrame(3, duration * step / 240, false);
      seen.add(frame.phase);
      active.add(frame.activeAllocationIndex);
    }
    expect(seen).toEqual(new Set(["deed", "options", "decision", "allocation", "mechanics", "resources", "final", "settled"]));
    expect(active).toEqual(new Set([0, 1, 2]));
  });

  it("moves exactly one bounded pair during allocation and exposes the complete terminal facts", () => {
    const duration = heroGrowthAllocationDurationSeconds(1);
    const allocation = projectHeroGrowthAllocationCutawayFrame(1, duration * 0.52, false);
    expect(allocation.phase).toBe("allocation");
    expect(allocation.allocationProgress).toBeGreaterThan(0);
    expect(allocation.allocationProgress).toBeLessThanOrEqual(1);
    expect(allocation.heroLift).toBeGreaterThanOrEqual(0);

    const final = projectHeroGrowthAllocationCutawayFrame(1, duration * 0.94, false);
    expect(final).toMatchObject({
      phase: "final",
      mechanicsAlpha: 1,
      resourcesAlpha: 1,
      tableauAlpha: 1,
    });
  });

  it("collapses reduced motion and forced outcomes to the same complete still tableau", () => {
    const reduced = projectHeroGrowthAllocationCutawayFrame(2, 0, true);
    const forced = projectHeroGrowthAllocationCutawayFrame(2, 0, false, true);
    expect(reduced).toEqual(forced);
    expect(reduced).toMatchObject({
      phase: "static",
      activeAllocationIndex: 1,
      allocationProgress: 1,
      mechanicsAlpha: 1,
      resourcesAlpha: 1,
      tableauAlpha: 1,
    });
    expect(heroGrowthAllocationStaticHoldSeconds).toBe(1.2);
  });
});
