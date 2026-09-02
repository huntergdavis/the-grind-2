import { randomInt } from "../core/rng";
import type { AbilityState, CombatantState } from "./types";

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

export function combatDamageV1(
  seed: string,
  combatId: string,
  turn: number,
  actor: Pick<CombatantState, "id" | "power">,
  target: Pick<CombatantState, "id" | "health" | "armor">,
  ability: Pick<AbilityState, "effect" | "potency" | "level"> | null,
  weakenedPotency: number,
  guarded: boolean,
): CombatDamageV1 {
  const variance = randomInt(5, seed, "combat-resolution", combatId, turn, `${actor.id}:${target.id}`);
  const armorReduction = ability?.effect === "piercing"
    ? Math.floor(target.armor / 5)
    : Math.floor(target.armor / 2);
  const rawDamage = actor.power + variance - weakenedPotency +
    (ability === null ? 0 : ability.potency + ability.level) - armorReduction;
  const unguardedDamage = Math.max(1, rawDamage);
  const resolvedDamage = Math.max(1, Math.floor(rawDamage * (guarded ? 0.5 : 1)));
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
