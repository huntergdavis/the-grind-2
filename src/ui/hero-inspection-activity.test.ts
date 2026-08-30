import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { projectViewHero } from "./hero-inspection-activity";

describe("hero inspection activity", () => {
  it("projects exact, read-only subjects for every inspection view", () => {
    let world = createWorld("hero-margins", "campaign");
    for (let index = 0; index < 28; index += 1) world = advanceWorld(world);
    const before = JSON.stringify(world);
    for (const view of ["map", "inventory", "journal", "codex", "spellbook"] as const) {
      const projected = projectViewHero(world, view);
      expect(projected.view).toBe(view);
      expect(projected.tick).toBe(world.tick);
      expect(projected.heroName).toBe(world.depth.hero.name);
      expect(projected.sceneHeadline).toBe(world.scene.headline);
      expect(projected.appearance.weapon?.itemId ?? null).toBe(world.depth.hero.equipment.weapon);
    }
    expect(JSON.stringify(world)).toBe(before);
  });

  it("keeps a still-valid per-view subject focused as the world advances", () => {
    const world = createWorld("hero-margin-focus", "campaign");
    const first = projectViewHero(world, "inventory");
    expect(first.subjectId).not.toBeNull();
    const next = projectViewHero(advanceWorld(world), "inventory", first.subjectId ?? undefined);
    expect(next.subjectId).toBe(first.subjectId);
  });

  it("never reveals an unlearned monster secret through the marginal activity", () => {
    const world = createWorld("hero-margin-redaction", "campaign");
    const secretName = "Name That Must Stay Hidden";
    const secretId = "secret:must-stay-hidden";
    const withLore = {
      ...world,
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          monsterLore: [{
            monsterId: "lantern-wolf",
            monsterName: "Lantern Wolf",
            encounters: 2,
            victories: 1,
            insight: 1,
            requiredInsight: 3,
            secretTechniqueId: secretId,
            secretTechniqueName: secretName,
            learned: false,
          }],
        },
      },
    };
    const encoded = JSON.stringify(projectViewHero(withLore, "codex"));
    expect(encoded).not.toContain(secretId);
    expect(encoded).not.toContain(secretName);
    expect(encoded).toContain("1/3 insight");
  });

  it("switches to truthful live-action poses for high-attention scenes", () => {
    const base = createWorld("hero-margin-attention", "campaign");
    const battle = { ...base, scene: { ...base.scene, mode: "battle" as const } };
    const discovery = { ...base, scene: { ...base.scene, mode: "discovery" as const } };
    expect(projectViewHero(battle, "journal")).toMatchObject({
      pose: "battle",
      attention: "forbiddenDuringCatchUp",
      liveNotice: expect.stringContaining("Battle continues off-screen"),
    });
    expect(projectViewHero(discovery, "spellbook")).toMatchObject({
      pose: "alert",
      attention: "queueForPresentation",
      liveNotice: expect.stringContaining("significant scene continues off-screen"),
    });
  });
});
