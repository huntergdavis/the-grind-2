import { describe, expect, it } from "vitest";
import type { HeroLevelUpPacketV1 } from "../ui/hero-level-up";
import {
  heroLevelUpDurationSeconds,
  heroLevelUpMaximumDurationSeconds,
  heroLevelUpMilestoneDurationSeconds,
  heroLevelUpStandardDurationSeconds,
  projectHeroLevelUpCutawayFrame,
} from "./hero-level-up-cutaway";

function packet(emphasis: HeroLevelUpPacketV1["emphasis"] = "standard"): HeroLevelUpPacketV1 {
  return {
    schemaVersion: 1,
    eventId: "campaign:12",
    tick: 12,
    campaignId: "campaign",
    commandId: "campaign:depth:12:wait",
    commandType: "wait",
    sourceKind: "command-award",
    sourceHeadline: "The road yields a lesson",
    sourceAction: "The hero studies the mile.",
    sourceLocation: "Verified road",
    rewardGrantId: null,
    questCompletionId: null,
    questTitle: null,
    heroId: "hero:1",
    heroName: "Mira Vale",
    className: "Warden",
    experienceBefore: 11,
    experienceDelta: 1,
    experienceAfter: 12,
    levelBefore: 1,
    levelAfter: 2,
    levelDelta: 1,
    thresholdSpan: { firstLevel: 2, lastLevel: 2, count: 1, firstRequiredExperience: 12, lastRequiredExperience: 12 },
    masteryBefore: 0,
    masteryAfter: 0,
    mechanicalLevelBefore: 1,
    mechanicalLevelAfter: 2,
    derivedBefore: { power: 4, armor: 3, initiative: 4, maxHealth: 24, maxMana: 12 },
    derivedAfter: { power: 5, armor: 3, initiative: 4, maxHealth: 24, maxMana: 12 },
    levelOnlyDerivedDelta: { power: 1, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
    concurrentDerivedDelta: { power: 0, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
    equipmentAfter: [],
    progressionBand: "adventurer",
    emphasis,
    nextLevelRequirement: 48,
  };
}

describe("hero level-up cutaway", () => {
  it("paces standard, milestone, and maximum earned transitions distinctly", () => {
    expect(heroLevelUpDurationSeconds(packet("standard"))).toBe(heroLevelUpStandardDurationSeconds);
    expect(heroLevelUpDurationSeconds(packet("milestone"))).toBe(heroLevelUpMilestoneDurationSeconds);
    expect(heroLevelUpDurationSeconds(packet("maximum"))).toBe(heroLevelUpMaximumDurationSeconds);
  });

  it("projects the complete source-to-tableau sequence", () => {
    const duration = heroLevelUpDurationSeconds(packet());
    for (const [fraction, phase] of [
      [0, "source"],
      [0.13, "threshold"],
      [0.31, "ascent"],
      [0.57, "mechanics"],
      [0.75, "tableau"],
      [0.91, "final"],
      [1.01, "settled"],
    ] as const) {
      expect(projectHeroLevelUpCutawayFrame(packet(), duration * fraction, false).phase).toBe(phase);
    }
  });

  it("reveals all verified facts immediately for reduced motion and forced outcome", () => {
    for (const frame of [
      projectHeroLevelUpCutawayFrame(packet(), 0, true),
      projectHeroLevelUpCutawayFrame(packet("maximum"), 0, false, true),
    ]) {
      expect(frame).toMatchObject({
        phase: "static",
        ringProgress: 1,
        newLevelAlpha: 1,
        sourceAlpha: 1,
        thresholdAlpha: 1,
        mechanicsAlpha: 1,
        tableauAlpha: 1,
      });
    }
  });

  it("makes milestone spectacle stronger without changing the earned facts", () => {
    const standard = projectHeroLevelUpCutawayFrame(packet("standard"), heroLevelUpStandardDurationSeconds * 0.43, false);
    const maximum = projectHeroLevelUpCutawayFrame(packet("maximum"), heroLevelUpMaximumDurationSeconds * 0.43, false);
    expect(maximum.heroScale).toBeGreaterThan(standard.heroScale);
    expect(maximum.phase).toBe(standard.phase);
  });

  it("never emits non-finite transforms for hostile elapsed values", () => {
    for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, -99]) {
      const frame = projectHeroLevelUpCutawayFrame(packet(), elapsed, false);
      expect([
        frame.heroLift,
        frame.heroScale,
        frame.glowAlpha,
        frame.ringProgress,
        frame.newLevelScale,
      ].every(Number.isFinite)).toBe(true);
    }
  });
});
