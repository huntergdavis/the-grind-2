import { combatDamageRangeV1 } from "../depth/combat-damage";
import { legalMillraceReversal, millraceReversalDamageProfile } from "../depth/shared-opening";
import type { CombatAction, CombatState } from "../depth/types";

/** Public bounds for this action, without consulting the encounter's future roll. */
export function projectCombatActionForecast(combat: CombatState, action: CombatAction): {
  minimumDamage: number;
  maximumDamage: number;
  unguardedMinimumDamage: number;
  actorHealthAfterStatuses: number;
  guarded: boolean;
  weakenedPotency: number;
  canAct: boolean;
} {
  const actor = combat.combatants.find((unit) => unit.id === action.actorId);
  const target = combat.combatants.find((unit) => unit.id === action.targetId);
  // prepareTurn applies damage even on the final status tick; only surviving
  // Weakening (duration > 1) can reduce the ensuing strike.
  const actorHealthAfterStatuses = actor === undefined ? 0 : actor.statuses.reduce(
    (health, status) => status.kind === "poisoned" || status.kind === "burning"
      ? Math.max(0, health - status.potency) : health,
    actor.health,
  );
  const weakenedPotency = actor?.statuses.find((status) => status.kind === "weakened" && status.duration > 1)?.potency ?? 0;
  const guarded = target?.statuses.some((status) => status.kind === "guarding") ?? false;
  const canAct = actorHealthAfterStatuses > 0 && combat.outcome === "ongoing"
    && combat.turnOrder[combat.activeIndex] === action.actorId;
  const empty = { minimumDamage: 0, maximumDamage: 0, unguardedMinimumDamage: 0, actorHealthAfterStatuses, guarded, weakenedPotency, canAct };
  if (!canAct || actor === undefined || target === undefined || target.health <= 0 || target.side === actor.side
    || (action.type !== "attack" && action.type !== "ability" && action.type !== "joint-action")) return empty;
  if (action.type === "joint-action") {
    const legal = legalMillraceReversal(combat);
    if (legal === null || legal.jointActionId !== action.jointActionId || legal.actorId !== action.actorId
      || legal.targetId !== action.targetId || legal.companionId !== action.companionId) return empty;
  }
  const ability = action.type === "ability" ? actor.abilities.find((entry) => entry.id === action.abilityId) : undefined;
  if (action.type === "ability" && (ability === undefined || ability.manaCost > actor.mana)) return empty;
  const damageProfile = action.type === "joint-action" ? millraceReversalDamageProfile : ability ?? null;
  const range = combatDamageRangeV1(actor, target, damageProfile, weakenedPotency, guarded);
  const unguardedMinimumDamage = guarded
    ? combatDamageRangeV1(actor, target, damageProfile, weakenedPotency, false).minimumDamage
    : range.minimumDamage;
  return { ...range, unguardedMinimumDamage, actorHealthAfterStatuses, guarded, weakenedPotency, canAct };
}
