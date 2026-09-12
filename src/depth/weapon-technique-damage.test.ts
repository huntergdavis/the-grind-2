import { describe, expect, it } from "vitest";
import { combatDamageRangeV1, combatDamageV1 } from "./combat-damage";
import { createTurningCheck } from "./weapon-technique";

describe("Turning Check's explicit glancing-strike tradeoff", () => {
  it("halves direct damage before Guard and reports only actual Guard prevention", () => {
    const ability = createTurningCheck();
    const { damageRule: _rule, ...ordinaryProfile } = ability;
    const actor = { id: "hero", power: 15 }, target = { id: "foe", health: 40, armor: 4 };
    for (let turn = 1; turn <= 25; turn++) {
      const ordinary = combatDamageV1("check-damage", "battle", turn, actor, target, ordinaryProfile, 0, false);
      const glancing = combatDamageV1("check-damage", "battle", turn, actor, target, ability, 0, false);
      const guarded = combatDamageV1("check-damage", "battle", turn, actor, target, ability, 0, true);
      expect(glancing.rawDamage).toBe(Math.floor(ordinary.rawDamage / 2));
      expect(glancing.appliedDamage).toBe(Math.max(1, Math.floor(ordinary.rawDamage / 2)));
      expect(glancing.preventedDamage).toBe(0);
      expect(guarded.appliedDamage).toBe(Math.max(1, Math.floor(glancing.rawDamage / 2)));
      expect(guarded.unguardedAppliedDamage).toBe(glancing.appliedDamage);
      expect(guarded.preventedDamage).toBe(glancing.appliedDamage - guarded.appliedDamage);
      expect(glancing.variance).toBe(ordinary.variance);
    }
  });

  it("keeps forecasts and resolved hits aligned, including armor, weakening and lethal clamping", () => {
    for (const power of [1, 15]) for (const health of [1, 40]) for (const guarded of [false, true]) {
      const ability = createTurningCheck(), actor = { id: "hero", power }, target = { id: "foe", health, armor: 8 };
      const range = combatDamageRangeV1(actor, target, ability, 2, guarded);
      for (let turn = 1; turn <= 25; turn++) {
        const hit = combatDamageV1("check-damage", "battle", turn, actor, target, ability, 2, guarded);
        expect(hit.resolvedDamage).toBeGreaterThanOrEqual(range.minimumDamage);
        expect(hit.resolvedDamage).toBeLessThanOrEqual(range.maximumDamage);
        expect(hit.resolvedDamage).toBeGreaterThanOrEqual(1);
        expect(hit.appliedDamage).toBe(Math.min(health, hit.resolvedDamage));
      }
    }
  });
});
