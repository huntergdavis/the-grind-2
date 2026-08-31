import { describe, expect, it } from "vitest";
import { maximumHeroLevel } from "../depth/rpg";
import { projectHeroExperience } from "./hero-progression";

describe("hero experience projection", () => {
  it.each([
    [1, 11, "11 / 12", 11, 12],
    [2, 12, "12 / 48", 0, 36],
    [2, 13, "13 / 48", 1, 36],
    [2, 47, "47 / 48", 35, 36],
    [3, 48, "48 / 108", 0, 60],
    [3, 49, "49 / 108", 1, 60],
    [3, 107, "107 / 108", 59, 60],
    [4, 108, "108 / 192", 0, 84],
    [4, 109, "109 / 192", 1, 84],
    [50, 12 * 49 ** 2, "28812 / 30000", 0, 1_188],
  ])("projects inclusive Level %i progress at %i XP", (level, experience, text, value, maximum) => {
    expect(projectHeroExperience({ level, experience })).toEqual({
      state: "progressing",
      text,
      progressMaximum: maximum,
      progressValue: value,
      accessibleLabel: `Hero level ${level}; ${experience} total experience; ${Number(text.split(" / ")[1]) - experience} experience to level ${level + 1}`,
    });
  });

  it("replaces the fictional post-cap target with a truthful maximum state", () => {
    for (const experience of [12 * (maximumHeroLevel - 1) ** 2, 12 * (maximumHeroLevel - 1) ** 2 + 1, Number.MAX_SAFE_INTEGER]) {
      expect(projectHeroExperience({ level: maximumHeroLevel, experience })).toEqual({
        state: "maximum",
        text: `MAX LEVEL · ${experience} total XP`,
        progressMaximum: 1,
        progressValue: 1,
        accessibleLabel: `Maximum hero level ${maximumHeroLevel}; ${experience} total experience`,
      });
    }
  });

  it("rejects a stale level instead of manufacturing display progress", () => {
    expect(() => projectHeroExperience({ level: 1, experience: 12 })).toThrow("canonical level and experience");
  });
});
