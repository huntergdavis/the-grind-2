import { describe, expect, it } from "vitest";
import { combatCueDurationSeconds, combatEffectColor, projectCombatMotion, projectLatestCombatCue, type CombatVisualCue } from "./combat-choreography";
import type { CombatState } from "../depth/types";

const attack: CombatVisualCue = {
  id: "combat:1:turn:3",
  actorId: "hero",
  targetId: "enemy",
  action: "attack",
  actorSide: "heroes",
  amount: 18,
  effect: null,
};

describe("combat choreography", () => {
  it("moves a hero toward the target, reacts, then returns to a settled pose", () => {
    expect(projectCombatMotion(attack, 0, false).phase).toBe("intent");
    const impact = projectCombatMotion(attack, combatCueDurationSeconds * 0.42, false);
    expect(impact.phase).toBe("impact");
    expect(impact.actorOffsetX).toBeGreaterThan(0);
    expect(impact.effectAlpha).toBeGreaterThan(0);
    const reaction = projectCombatMotion(attack, combatCueDurationSeconds * 0.58, false);
    expect(reaction.phase).toBe("reaction");
    expect(Math.abs(reaction.targetOffsetX)).toBeGreaterThan(0);
    expect(projectCombatMotion(attack, combatCueDurationSeconds, false)).toMatchObject({
      phase: "settled",
      actorOffsetX: 0,
      targetOffsetX: 0,
      effectAlpha: 0,
    });
  });

  it("mirrors enemy lunges and keeps guards on their own side", () => {
    const enemy = projectCombatMotion({ ...attack, actorSide: "enemies" }, combatCueDurationSeconds * 0.42, false);
    expect(enemy.actorOffsetX).toBeLessThan(0);
    const guard = projectCombatMotion({ ...attack, action: "guard", amount: 0 }, combatCueDurationSeconds * 0.22, false);
    expect(guard.actorOffsetX).toBe(0);
    expect(guard.targetOffsetX).toBe(0);
    expect(guard.actorOffsetY).toBeLessThan(0);
  });

  it("removes translations for reduced motion without hiding impact state", () => {
    const motion = projectCombatMotion({ ...attack, action: "ability", effect: "burning" }, combatCueDurationSeconds * 0.55, true);
    expect(motion).toMatchObject({ actorOffsetX: 0, actorOffsetY: 0, targetOffsetX: 0 });
    expect(motion.effectAlpha).toBeGreaterThan(0);
    expect(combatEffectColor({ ...attack, action: "ability", effect: "burning" })).toBe(0xff8d4d);
  });

  it("projects the resolved log actor rather than the next active combatant", () => {
    const combat: CombatState = {
      id: "battle",
      round: 1,
      turn: 1,
      activeIndex: 1,
      turnOrder: ["hero", "enemy"],
      outcome: "ongoing",
      combatants: [
        { id: "hero", name: "Hero", side: "heroes", health: 20, maxHealth: 20, mana: 4, maxMana: 5, power: 8, armor: 2, initiative: 10, statuses: [], speciesId: null, abilities: [] },
        { id: "enemy", name: "Enemy", side: "enemies", health: 9, maxHealth: 15, mana: 2, maxMana: 2, power: 5, armor: 1, initiative: 8, statuses: [], speciesId: "enemy", abilities: [] },
      ],
      log: [{ turn: 1, actorId: "hero", action: "attack", targetId: "enemy", abilityId: null, message: "Hero strikes.", amount: 6 }],
    };
    expect(combat.turnOrder[combat.activeIndex]).toBe("enemy");
    expect(projectLatestCombatCue(combat)).toMatchObject({ actorId: "hero", targetId: "enemy", amount: 6 });
  });
});
