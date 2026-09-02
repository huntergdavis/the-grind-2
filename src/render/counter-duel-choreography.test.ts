import { describe, expect, it } from "vitest";
import { counterDuelCueDurationSeconds, projectCounterDuelMotion } from "./counter-duel-choreography";

describe("Pattern Duel choreography", () => {
  it("reveals tell, prediction, both stances, then consequence in order", () => {
    expect(projectCounterDuelMotion(0, false)).toMatchObject({ phase: "tell", predictionAlpha: 0, revealAlpha: 0, consequenceAlpha: 0 });
    expect(projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.3, false)).toMatchObject({ phase: "prediction", predictionAlpha: 1, revealAlpha: 0 });
    const reveal = projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.52, false);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.heroOffsetX).toBeGreaterThan(0);
    expect(reveal.opponentOffsetX).toBeLessThan(0);
    expect(projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.8, false)).toMatchObject({ phase: "consequence", consequenceAlpha: 1 });
    expect(projectCounterDuelMotion(counterDuelCueDurationSeconds, false).phase).toBe("settled");
  });

  it("shows the complete ordered tableau without translation in reduced motion", () => {
    expect(projectCounterDuelMotion(0, true)).toEqual({
      phase: "static",
      tellAlpha: 1,
      predictionAlpha: 1,
      revealAlpha: 1,
      patternBreakAlpha: 0,
      patternBreakScale: 1,
      patternBreakPulse: 0,
      consequenceAlpha: 1,
      heroOffsetX: 0,
      opponentOffsetX: 0,
    });
  });

  it("inserts one Pattern Break flourish after reveal and before consequence", () => {
    const before = projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.5, false, true);
    const flourish = projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.7, false, true);
    const after = projectCounterDuelMotion(counterDuelCueDurationSeconds * 0.9, false, true);
    expect(before).toMatchObject({ phase: "reveal", patternBreakAlpha: 0 });
    expect(flourish.phase).toBe("pattern-break");
    expect(flourish.patternBreakAlpha).toBe(1);
    expect(flourish.patternBreakScale).toBeGreaterThan(0.72);
    expect(flourish.patternBreakPulse).toBeGreaterThan(0);
    expect(flourish.heroOffsetX).toBeGreaterThan(5);
    expect(after).toMatchObject({ phase: "consequence", patternBreakAlpha: 1, consequenceAlpha: 1 });
    expect(projectCounterDuelMotion(0, true, true)).toMatchObject({
      phase: "static",
      patternBreakAlpha: 1,
      patternBreakScale: 1,
      patternBreakPulse: 0,
      heroOffsetX: 0,
    });
  });
});
