import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomInt } from "../core/rng";
import { combatDamageRangeV1, combatDamageV1 } from "./combat-damage";
import type { AbilityState } from "./types";

vi.mock("../core/rng", () => ({ randomInt: vi.fn() }));

type DamageAbility = Pick<AbilityState, "effect" | "potency" | "level">;

const cases: readonly {
  name: string;
  power: number;
  armor: number;
  ability: DamageAbility | null;
  weakened: number;
  guarded: boolean;
  minimum: number;
  maximum: number;
}[] = [
  { name: "ordinary armor", power: 10, armor: 5, ability: null, weakened: 0, guarded: false, minimum: 8, maximum: 12 },
  { name: "guarded armor", power: 10, armor: 5, ability: null, weakened: 0, guarded: true, minimum: 4, maximum: 6 },
  { name: "piercing ability", power: 10, armor: 9, ability: { effect: "piercing", potency: 3, level: 2 }, weakened: 0, guarded: false, minimum: 14, maximum: 18 },
  { name: "leveled arcane ability", power: 10, armor: 9, ability: { effect: "arcane", potency: 3, level: 2 }, weakened: 0, guarded: false, minimum: 11, maximum: 15 },
  { name: "weakened attack", power: 10, armor: 2, ability: null, weakened: 5, guarded: false, minimum: 4, maximum: 8 },
  { name: "guarded weakened piercing ability", power: 10, armor: 9, ability: { effect: "piercing", potency: 3, level: 2 }, weakened: 5, guarded: true, minimum: 4, maximum: 6 },
  { name: "minimum damage", power: 1, armor: 99, ability: null, weakened: 9, guarded: false, minimum: 1, maximum: 1 },
  { name: "guarded minimum damage", power: 1, armor: 99, ability: null, weakened: 9, guarded: true, minimum: 1, maximum: 1 },
  { name: "variance crossing minimum", power: 1, armor: 4, ability: null, weakened: 0, guarded: false, minimum: 1, maximum: 3 },
  { name: "guarded variance crossing minimum", power: 1, armor: 4, ability: null, weakened: 0, guarded: true, minimum: 1, maximum: 1 },
];

describe("combat damage range v1", () => {
  beforeEach(() => {
    vi.mocked(randomInt).mockReset();
  });

  it.each(cases)("bounds all five rolls while retaining the exact resolution object: $name", (fixture) => {
    const actor = Object.freeze({ id: "hero:reader", power: fixture.power });
    const target = Object.freeze({ id: "enemy:guard", health: 100, armor: fixture.armor });
    const ability = fixture.ability === null ? null : Object.freeze({ ...fixture.ability });
    const range = combatDamageRangeV1(actor, target, ability, fixture.weakened, fixture.guarded);

    expect(range).toEqual({ minimumDamage: fixture.minimum, maximumDamage: fixture.maximum });
    expect(Object.isFrozen(range)).toBe(true);
    expect(randomInt).not.toHaveBeenCalled();

    const resolvedRolls: number[] = [];
    for (let variance = 0; variance <= 4; variance += 1) {
      vi.mocked(randomInt).mockClear().mockReturnValue(variance);
      const result = combatDamageV1("seed:guard", "combat:guard", 7, actor, target, ability, fixture.weakened, fixture.guarded);
      // The pre-refactor v1 arithmetic is the compatibility oracle, not the new helper.
      const armorReduction = ability?.effect === "piercing" ? Math.floor(target.armor / 5) : Math.floor(target.armor / 2);
      const rawDamage = actor.power + variance - fixture.weakened +
        (ability === null ? 0 : ability.potency + ability.level) - armorReduction;
      const resolvedDamage = Math.max(1, Math.floor(rawDamage * (fixture.guarded ? 0.5 : 1)));
      const unguardedAppliedDamage = Math.min(target.health, Math.max(1, rawDamage));
      const appliedDamage = Math.min(target.health, resolvedDamage);

      expect(result).toEqual({
        rulesVersion: "combat-damage-v1",
        variance,
        weakenedPotency: fixture.weakened,
        armorReduction,
        rawDamage,
        resolvedDamage,
        unguardedAppliedDamage,
        appliedDamage,
        preventedDamage: unguardedAppliedDamage - appliedDamage,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(randomInt).toHaveBeenCalledExactlyOnceWith(5, "seed:guard", "combat-resolution", "combat:guard", 7, "hero:reader:enemy:guard");
      expect(result.resolvedDamage).toBeGreaterThanOrEqual(range.minimumDamage);
      expect(result.resolvedDamage).toBeLessThanOrEqual(range.maximumDamage);
      resolvedRolls.push(result.resolvedDamage);
    }
    expect(Math.min(...resolvedRolls)).toBe(range.minimumDamage);
    expect(Math.max(...resolvedRolls)).toBe(range.maximumDamage);
  });

  it("keeps overkill visible instead of clamping forecasts to the target's remaining health", () => {
    const actor = Object.freeze({ id: "hero", power: 10 });
    const target = Object.freeze({ id: "target", health: 1, armor: 5 });
    const range = combatDamageRangeV1(actor, target, null, 0, true);
    expect(range).toEqual({ minimumDamage: 4, maximumDamage: 6 });
    expect(range).toEqual(combatDamageRangeV1(actor, { ...target, health: 100 }, null, 0, true));
    expect(randomInt).not.toHaveBeenCalled();

    vi.mocked(randomInt).mockReturnValue(4);
    expect(combatDamageV1("seed", "combat", 1, actor, target, null, 0, true)).toEqual({
      rulesVersion: "combat-damage-v1",
      variance: 4,
      weakenedPotency: 0,
      armorReduction: 2,
      rawDamage: 12,
      resolvedDamage: 6,
      unguardedAppliedDamage: 1,
      appliedDamage: 1,
      preventedDamage: 0,
    });
  });

  it("preserves the real seeded variance and deterministic replay, while range reads no identity or seed", async () => {
    const actualRng = await vi.importActual<typeof import("../core/rng")>("../core/rng");
    vi.mocked(randomInt).mockImplementation(actualRng.randomInt);
    const actor = Object.freeze({ id: "hero:replay", power: 11 });
    const target = Object.freeze({ id: "enemy:replay", health: 19, armor: 7 });
    const ability = Object.freeze({ effect: "burning", potency: 4, level: 3 } as const);
    const inputBefore = JSON.stringify({ actor, target, ability });
    const range = combatDamageRangeV1(actor, target, ability, 2, true);
    expect(range).toEqual(combatDamageRangeV1({ ...actor, id: "different:actor" }, { ...target, id: "different:target" }, ability, 2, true));
    expect(randomInt).not.toHaveBeenCalled();

    const first = combatDamageV1("unchanged-seed", "combat:replay", 31, actor, target, ability, 2, true);
    expect(first.variance).toBe(actualRng.randomInt(5, "unchanged-seed", "combat-resolution", "combat:replay", 31, "hero:replay:enemy:replay"));
    const second = combatDamageV1("unchanged-seed", "combat:replay", 31, actor, target, ability, 2, true);
    expect(second).toEqual(first);
    expect(randomInt).toHaveBeenCalledTimes(2);
    expect(JSON.stringify({ actor, target, ability })).toBe(inputBefore);
  });
});
