import { randomInt } from "../core/rng";
import type { AbilityState, CombatantState } from "./types";

type DamageAbility = Pick<AbilityState, "effect" | "potency" | "level" | "damageRule">;

export interface CombatDamageV1 {
  readonly rulesVersion: "combat-damage-v1";
  readonly variance: number;
  readonly weakenedPotency: number;
  readonly armorReduction: number;
  readonly rawDamage: number;
  readonly resolvedDamage: number;
  readonly unguardedAppliedDamage: number;
  readonly appliedDamage: number;
  readonly preventedDamage: number;
}

export interface CombatDamageRangeV1 {
  readonly minimumDamage: number;
  readonly maximumDamage: number;
}

function resolveDamageArithmetic(
  actor: Pick<CombatantState, "id" | "power">,
  target: Pick<CombatantState, "id" | "health" | "armor">,
  ability: DamageAbility | null,
  weakenedPotency: number,
  guarded: boolean,
  variance: number,
): Pick<CombatDamageV1, "armorReduction" | "rawDamage" | "resolvedDamage"> {
  const armorReduction = ability?.effect === "piercing"
    ? Math.floor(target.armor / 5)
    : Math.floor(target.armor / 2);
  const fullDamage = actor.power + variance - weakenedPotency +
    (ability === null ? 0 : ability.potency + ability.level) - armorReduction;
  // The learned checking stroke trades direct damage for control. Apply this
  // before Guard; its restraint must never be mislabeled as Guard prevention.
  const rawDamage = ability?.damageRule === "weapon-check-half-v1" ? Math.floor(fullDamage / 2) : fullDamage;
  const resolvedDamage = Math.max(1, Math.floor(rawDamage * (guarded ? 0.5 : 1)));
  return { armorReduction, rawDamage, resolvedDamage };
}

/** All possible resolved damage, before target-health clamping and without rolling variance. */
export function combatDamageRangeV1(
  actor: Pick<CombatantState, "id" | "power">,
  target: Pick<CombatantState, "id" | "health" | "armor">,
  ability: DamageAbility | null,
  weakenedPotency: number,
  guarded: boolean,
): CombatDamageRangeV1 {
  return Object.freeze({
    minimumDamage: resolveDamageArithmetic(actor, target, ability, weakenedPotency, guarded, 0).resolvedDamage,
    maximumDamage: resolveDamageArithmetic(actor, target, ability, weakenedPotency, guarded, 4).resolvedDamage,
  });
}

export function combatDamageV1(
  seed: string,
  combatId: string,
  turn: number,
  actor: Pick<CombatantState, "id" | "power">,
  target: Pick<CombatantState, "id" | "health" | "armor">,
  ability: DamageAbility | null,
  weakenedPotency: number,
  guarded: boolean,
): CombatDamageV1 {
  const variance = randomInt(5, seed, "combat-resolution", combatId, turn, `${actor.id}:${target.id}`);
  const { armorReduction, rawDamage, resolvedDamage } = resolveDamageArithmetic(
    actor, target, ability, weakenedPotency, guarded, variance,
  );
  const unguardedDamage = Math.max(1, rawDamage);
  const unguardedAppliedDamage = Math.min(target.health, unguardedDamage);
  const appliedDamage = Math.min(target.health, resolvedDamage);
  return Object.freeze({
    rulesVersion: "combat-damage-v1",
    variance,
    weakenedPotency,
    armorReduction,
    rawDamage,
    resolvedDamage,
    unguardedAppliedDamage,
    appliedDamage,
    preventedDamage: unguardedAppliedDamage - appliedDamage,
  });
}
