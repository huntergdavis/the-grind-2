import { describe, expect, it } from "vitest";
import type { AbilityResonancePacketV1 } from "../ui/ability-resonance";
import {
  abilityResonanceDurationSeconds,
  projectAbilityResonanceCutawayFrame,
  projectAbilityResonanceSourcePresentation,
} from "./ability-resonance-cutaway";

function packet(
  effect: AbilityResonancePacketV1["effect"] = "arcane",
  sourceKind: AbilityResonancePacketV1["sourceKind"] = "battle-use",
): AbilityResonancePacketV1 {
  return { effect, sourceKind } as AbilityResonancePacketV1;
}

describe("ability resonance cutaway choreography", () => {
  it("owns one source descriptor for Canvas, DOM, rig, and reduced-motion parity", () => {
    expect(projectAbilityResonanceSourcePresentation("battle-use")).toEqual({
      pose: "battle-strike",
      cue: "impact-chevrons",
      rigMode: "battle",
      label: "IMPACT",
    });
    expect(projectAbilityResonanceSourcePresentation("practice")).toEqual({
      pose: "practice-trace",
      cue: "study-rings",
      rigMode: "training",
      label: "TRACE",
    });
  });

  it("visits each truthful source-to-next-use phase in order within 4.8 seconds", () => {
    const phases = [0, 0.8, 2, 3.1, 3.9, 4.55, abilityResonanceDurationSeconds]
      .map((elapsed) => projectAbilityResonanceCutawayFrame(packet(), elapsed, false).phase);
    expect(phases).toEqual([
      "source",
      "experience",
      "resonance",
      "mastery",
      "tableau",
      "final",
      "settled",
    ]);
    expect(abilityResonanceDurationSeconds).toBeGreaterThanOrEqual(4);
    expect(abilityResonanceDurationSeconds).toBeLessThanOrEqual(5);
  });

  it("distinguishes battle use from practice without changing the outcome choreography", () => {
    const battle = projectAbilityResonanceCutawayFrame(packet("arcane", "battle-use"), 0.4, false);
    const practice = projectAbilityResonanceCutawayFrame(packet("arcane", "practice"), 0.4, false);
    expect(battle).toMatchObject({
      battleSourceAlpha: 1,
      practiceSourceAlpha: 0,
      sourcePose: "battle-strike",
      sourceCue: "impact-chevrons",
    });
    expect(practice).toMatchObject({
      battleSourceAlpha: 0,
      practiceSourceAlpha: 1,
      sourcePose: "practice-trace",
      sourceCue: "study-rings",
    });
    expect(battle.phase).toBe(practice.phase);
    expect(battle.experienceFillProgress).toBe(practice.experienceFillProgress);
    expect(battle.glyphIntensities).toEqual(practice.glyphIntensities);
  });

  it("fills experience before resonating and then reveals the mastery transition", () => {
    const earlyExperience = projectAbilityResonanceCutawayFrame(packet(), 1, false);
    const lateExperience = projectAbilityResonanceCutawayFrame(packet(), 1.92, false);
    const resonance = projectAbilityResonanceCutawayFrame(packet(), 2.4, false);
    const mastery = projectAbilityResonanceCutawayFrame(packet(), 3.35, false);
    expect(earlyExperience.experienceFillProgress).toBeLessThan(lateExperience.experienceFillProgress);
    expect(lateExperience.experienceFillProgress).toBe(1);
    expect(resonance.glyphAlpha).toBeGreaterThan(0);
    expect(mastery.newLevelAlpha).toBeGreaterThan(0);
    expect(mastery.oldLevelAlpha).toBeLessThan(1);
    expect(mastery.masteryAlpha).toBeGreaterThan(0);
  });

  it("exposes exactly one canonical effect glyph channel", () => {
    for (const effect of ["arcane", "burning", "poison", "weaken", "piercing"] as const) {
      const frame = projectAbilityResonanceCutawayFrame(packet(effect), 2.7, false);
      const entries = Object.entries(frame.glyphIntensities);
      expect(entries.filter(([, intensity]) => intensity > 0).map(([name]) => name)).toEqual([effect]);
      expect(frame.glyphIntensities[effect]).toBe(frame.glyphAlpha);
    }
  });

  it("settles into a complete next-use tableau suitable for an exact L19 to L20 receipt", () => {
    const final = projectAbilityResonanceCutawayFrame(packet("piercing"), abilityResonanceDurationSeconds, false);
    expect(final).toMatchObject({
      phase: "settled",
      sourceAlpha: 1,
      experienceFillProgress: 1,
      thresholdFlashAlpha: 1,
      glyphAlpha: 1,
      oldLevelAlpha: 0.42,
      newLevelAlpha: 1,
      newLevelScale: 1,
      masteryAlpha: 1,
      nextUseAlpha: 1,
      tableauAlpha: 1,
    });
    expect(final.glyphIntensities).toEqual({
      arcane: 0,
      burning: 0,
      poison: 0,
      weaken: 0,
      piercing: 1,
    });
  });

  it("makes reduced motion and forced outcome the same complete static result", () => {
    const reduced = projectAbilityResonanceCutawayFrame(packet("burning", "practice"), 0, true);
    const forced = projectAbilityResonanceCutawayFrame(packet("burning", "practice"), 0, false, true);
    expect(reduced).toEqual(forced);
    expect(reduced).toMatchObject({
      phase: "static",
      sourcePose: "practice-trace",
      sourceCue: "study-rings",
      practiceSourceAlpha: 1,
      battleSourceAlpha: 0,
      sourceMotion: 0,
      experienceFillProgress: 1,
      glyphAlpha: 1,
      newLevelAlpha: 1,
      masteryAlpha: 1,
      nextUseAlpha: 1,
      tableauAlpha: 1,
    });
    expect(projectAbilityResonanceCutawayFrame(packet("poison", "battle-use"), 0, true)).toMatchObject({
      phase: "static",
      sourcePose: "battle-strike",
      sourceCue: "impact-chevrons",
      battleSourceAlpha: 1,
      practiceSourceAlpha: 0,
      sourceMotion: 0,
    });
  });

  it("keeps every animation value finite and bounded for hostile elapsed values", () => {
    for (const elapsed of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -99, 0, 9]) {
      const frame = projectAbilityResonanceCutawayFrame(packet("poison"), elapsed, false);
      const bounded = [
        frame.sourceAlpha,
        frame.battleSourceAlpha,
        frame.practiceSourceAlpha,
        frame.sourceMotion,
        frame.experienceAlpha,
        frame.experienceFillProgress,
        frame.thresholdFlashAlpha,
        frame.glyphAlpha,
        ...Object.values(frame.glyphIntensities),
        frame.oldLevelAlpha,
        frame.newLevelAlpha,
        frame.masteryAlpha,
        frame.nextUseAlpha,
        frame.tableauAlpha,
      ];
      expect(bounded.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      expect([frame.glyphScale, frame.newLevelScale, frame.heroLift, frame.heroScale].every(Number.isFinite)).toBe(true);
    }
  });
});
