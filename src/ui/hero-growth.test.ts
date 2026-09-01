import { describe, expect, it } from "vitest";
import { applyHeroGrowth, createHeroGrowthState } from "../core/hero-growth";
import { applyHeroExperience, createHero, heroExperienceFloor } from "../depth/rpg";
import type { DetailedHeroState } from "../depth/types";
import { projectHeroGrowth } from "./hero-growth";

const campaignId = "campaign:growth-ui";
const seed = "growth-ui";

function atLevel(hero: DetailedHeroState, level: number): DetailedHeroState {
  return applyHeroExperience(hero, heroExperienceFloor(level) - hero.experience).hero;
}

function crossing(encounterActiveAfter: boolean) {
  const created = createHero(seed, "hero:growth-ui", "Rook Vale");
  const heroBefore: DetailedHeroState = {
    ...created,
    className: "Warden",
    resources: { ...created.resources, health: created.resources.health - 5, mana: created.resources.mana - 2 },
  };
  const heroAfter = atLevel(heroBefore, 10);
  return applyHeroGrowth(createHeroGrowthState(heroBefore), heroAfter, {
    campaignId,
    seed,
    heroId: heroAfter.id,
    heroName: heroAfter.name,
    className: heroAfter.className,
    values: ["courage", "loyalty"],
    tick: 42,
    sourceCommandId: "command:growth-ui",
    sourceCommandType: "start-combat",
    experienceBefore: heroBefore.experience,
    experienceAfter: heroAfter.experience,
    levelBefore: heroBefore.level,
    levelAfter: heroAfter.level,
    encounterActiveAfter,
  });
}

describe("Three Turning Points presentation", () => {
  it("projects one settled immutable choice with explicit current-resource stays", () => {
    const settled = crossing(false);
    const projected = projectHeroGrowth(settled.state, settled.hero);
    expect(projected.hudSummary).toBe("TURNING POINT 10 ✓ FIELD TEMPER");
    expect(projected.checkpoints.map((checkpoint) => `${checkpoint.checkpointLevel}:${checkpoint.state}`)).toEqual([
      "10:settled",
      "25:ahead",
      "50:ahead",
    ]);
    expect(projected.attributes).toHaveLength(6);
    expect(projected.records).toHaveLength(1);
    expect(projected.records[0]).toMatchObject({
      checkpointLevel: 10,
      packageLabel: "Field Temper",
      attributeFacts: expect.arrayContaining([expect.stringMatching(/^STR /), expect.stringMatching(/^VIT /)]),
    });
    expect(projected.records[0]?.healthFact).toMatch(/^HP (\d+)→\1 STAYS · MAX HP \d+→\d+$/);
    expect(projected.records[0]?.manaFact).toMatch(/^MP (\d+)→\1 STAYS · MAX MP \d+→\d+$/);
  });

  it("shows a held checkpoint without projecting an unmade package choice", () => {
    const held = crossing(true);
    const projected = projectHeroGrowth(held.state, held.hero);
    expect(projected.hudSummary).toBe("TURNING POINT 10 … HELD");
    expect(projected.checkpoints[0]).toMatchObject({ state: "held", label: "HELD · encounter resolving" });
    expect(projected.records).toEqual([]);
    expect(projected.summary).toContain("no stats have changed yet");
  });

  it("labels migrated checkpoints as settled prior-save truth without inventing records", () => {
    const hero = atLevel(createHero(seed, "hero:migrated-ui", "Mira Vale"), 25);
    const projected = projectHeroGrowth(createHeroGrowthState(hero), hero);
    expect(projected.checkpoints.slice(0, 2).map((checkpoint) => checkpoint.label)).toEqual([
      "SETTLED · prior save",
      "SETTLED · prior save",
    ]);
    expect(projected.records).toEqual([]);
  });
});
