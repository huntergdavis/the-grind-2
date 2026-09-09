import type { CombatAction, CombatState, MillstoneDragSource, SharedOpening } from "./types";

export const millraceReversalDamageProfile = Object.freeze({ effect: "piercing" as const, potency: 0, level: 0 });

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512; }
function turn(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 128; }

export function isValidMillstoneDragSource(value: unknown): value is MillstoneDragSource {
  return record(value) && Object.keys(value).length === 4 && text(value.sourceEventId) && turn(value.sourceTurn)
    && text(value.companionId) && text(value.targetId) && value.companionId !== value.targetId;
}

export function isValidSharedOpening(value: unknown): value is SharedOpening {
  return record(value) && Object.keys(value).length === 9
    && isValidMillstoneDragSource({ sourceEventId: value.sourceEventId, sourceTurn: value.sourceTurn, companionId: value.companionId, targetId: value.targetId })
    && text(value.heroId) && value.heroId !== value.companionId && value.heroId !== value.targetId
    && text(value.affectedActionEventId) && text(value.affectedDamageEventId) && text(value.earnedEventId)
    && turn(value.earnedTurn) && value.earnedTurn > (value.sourceTurn as number);
}

/** A hot opening must retain its actual Drag, affected strike, and earned receipt. */
export function hasSharedOpeningWitness(combat: CombatState, opening: SharedOpening): boolean {
  const events = combat.eventStream.events;
  const source = events.find((event) => event.id === opening.sourceEventId);
  const intent = events.find((event) => event.id === opening.affectedActionEventId);
  const damage = events.find((event) => event.id === opening.affectedDamageEventId);
  const earned = events.find((event) => event.id === opening.earnedEventId);
  return source?.kind === "companion-action-resolved" && source.companionActionId === "millstone-drag"
    && source.actorId === opening.companionId && source.targetId === opening.targetId && source.turn === opening.sourceTurn
    && intent?.kind === "intent" && (intent.action === "attack" || intent.action === "ability")
    && intent.actorId === opening.targetId && intent.turn === opening.earnedTurn
    && damage?.kind === "damage" && damage.actorId === opening.targetId && damage.turn === opening.earnedTurn && damage.amount > 0
    && events.some((event) => event.turn === intent.turn && event.kind === "status-tick" && event.actorId === opening.targetId
      && event.status === "weakened" && event.potency === 2 && event.durationBefore === 2 && event.durationAfter === 1)
    && !events.some((event) => event.kind === "status-applied" && event.status === "weakened" && event.targetId === opening.targetId
      && event.turn > opening.sourceTurn && event.turn < opening.earnedTurn)
    && earned?.kind === "shared-opening-earned" && earned.turn === opening.earnedTurn
    && earned.heroId === opening.heroId && earned.companionId === opening.companionId && earned.targetId === opening.targetId
    && earned.sourceEventId === opening.sourceEventId && earned.sourceTurn === opening.sourceTurn
    && earned.affectedActionEventId === opening.affectedActionEventId && earned.affectedDamageEventId === opening.affectedDamageEventId
    && !events.some((event) => event.kind === "intent" && event.actorId === opening.heroId && event.turn > opening.earnedTurn);
}

/** A held pip is usable only by its original, living, equipped hero on this turn. */
export function legalMillraceReversal(combat: CombatState): Extract<CombatAction, { type: "joint-action" }> | null {
  const runtime = combat.companionActionRuntime;
  const opening = runtime?.schemaVersion === 2 ? runtime.sharedOpening : null;
  if (opening === null || combat.outcome !== "ongoing" || runtime === undefined || runtime.actorId !== opening.companionId
    || combat.weaponUse.tracking !== "tracked" || combat.weaponUse.heroId !== opening.heroId
    || combat.turnOrder[combat.activeIndex] !== opening.heroId || !hasSharedOpeningWitness(combat, opening)) return null;
  const hero = combat.combatants.find((unit) => unit.id === opening.heroId);
  const companion = combat.combatants.find((unit) => unit.id === opening.companionId);
  const target = combat.combatants.find((unit) => unit.id === opening.targetId);
  if (hero?.side !== "heroes" || hero.health <= 0 || companion?.side !== "heroes" || companion.health <= 0
    || companion.companionKit?.kitId !== "miller-roadcraft" || target?.side !== "enemies" || target.health <= 0) return null;
  return { actorId: hero.id, type: "joint-action", jointActionId: "millrace-reversal", companionId: companion.id, targetId: target.id, abilityId: null, itemId: null };
}
