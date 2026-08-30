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
      consequenceAlpha: 1,
      heroOffsetX: 0,
      opponentOffsetX: 0,
    });
  });
});
