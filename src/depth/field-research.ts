import { isValidCombatState, maximumCombatEventsPerTurn } from "./combat";
import type { CombatState, CombatTurnEvent, FalseTreasureApplicationV1, FieldResearchStateV1 } from "./types";

export const inkcapResearchClue = "False Treasure inflicts poison; its lingering harm occurs before the victim acts.";
const abilityId = "secret:inkcap-mimic:false-treasure";
const applicationKeys = ["speciesId", "abilityId", "combatId", "sourceEventId", "sourceTick", "sourceTurn", "actorId", "targetId", "potency", "duration", "targetHealthAfter"];
const aftereffectKeys = ["combatId", "sourceEventId", "sourceTick", "sourceTurn", "applicationEventId", "targetId", "potency", "durationBefore", "durationAfter", "healthBefore", "amount", "healthAfter"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function source(value: Record<string, unknown>, currentTick: number): boolean {
  return text(value.combatId) && text(value.sourceEventId)
    && integer(value.sourceTick, 1, currentTick) && integer(value.sourceTurn, 1, Math.min(128, value.sourceTick))
    && Array.from({ length: maximumCombatEventsPerTurn - 1 }, (_, ordinal) => `${value.combatId}:${value.sourceTurn}:${ordinal + 1}`).includes(value.sourceEventId);
}

/** Exact bounded retained evidence, not inferred lore or an unbounded event archive. */
export function isValidFieldResearchState(value: unknown, heroId: string, currentTick: number): value is FieldResearchStateV1 {
  if (!record(value) || !exact(value, ["schemaVersion", "taskId", "application", "aftereffect"])
    || value.schemaVersion !== 1 || value.taskId !== "inkcap:false-treasure@1"
    || !text(heroId) || !integer(currentTick)) return false;
  if (value.application === null) return value.aftereffect === null;
  const application = value.application;
  if (!record(application) || !exact(application, applicationKeys) || !source(application, currentTick)
    || application.speciesId !== "inkcap-mimic" || application.abilityId !== abilityId
    || !text(application.actorId) || ![`${application.combatId}:enemy:0`, `${application.combatId}:enemy:1`].includes(application.actorId)
    || application.actorId === heroId || application.targetId !== heroId
    || !integer(application.potency, 1) || application.duration !== 3 || !integer(application.targetHealthAfter, 1)) return false;
  if (value.aftereffect === null) return true;
  const aftereffect = value.aftereffect;
  return record(aftereffect) && exact(aftereffect, aftereffectKeys) && source(aftereffect, currentTick)
    && aftereffect.combatId === application.combatId && aftereffect.targetId === heroId
    && aftereffect.applicationEventId === application.sourceEventId
    && (aftereffect.sourceTick as number) > (application.sourceTick as number)
    && (aftereffect.sourceTurn as number) > (application.sourceTurn as number)
    && aftereffect.potency === application.potency
    && integer(aftereffect.durationBefore, 1, 3) && aftereffect.durationAfter === aftereffect.durationBefore - 1
    && integer(aftereffect.healthBefore, 1) && integer(aftereffect.amount, 1) && integer(aftereffect.healthAfter)
    && aftereffect.amount === Math.min(aftereffect.healthBefore, application.potency as number)
    && aftereffect.healthAfter === aftereffect.healthBefore - aftereffect.amount;
}

export function createFieldResearchState(): FieldResearchStateV1 {
  return Object.freeze({ schemaVersion: 1, taskId: "inkcap:false-treasure@1", application: null, aftereffect: null });
}

function qualifyingApplication(combat: CombatState, event: CombatTurnEvent, heroId: string): event is Extract<CombatTurnEvent, { kind: "status-applied" }> {
  if (event.kind !== "status-applied" || event.status !== "poisoned" || event.abilityId !== abilityId
    || event.targetId !== heroId || event.durationAfter !== 3 || event.potencyAfter < 1) return false;
  const enemy = combat.combatants.find((actor) => actor.id === event.actorId);
  return enemy?.side === "enemies" && enemy.speciesId === "inkcap-mimic"
    && enemy.abilities.some((ability) => ability.id === abilityId && ability.effect === "poison");
}

/** Called only for the newly resolved combat action, including its terminal packet before cleanup. */
export function advanceFieldResearch(
  research: FieldResearchStateV1,
  before: CombatState,
  after: CombatState,
  context: { readonly heroId: string; readonly depthTick: number },
): FieldResearchStateV1 {
  const { heroId, depthTick } = context;
  if (research.aftereffect !== null || !isValidFieldResearchState(research, heroId, depthTick)
    || before.id !== after.id || after.turn !== before.turn + 1 || after.turn > depthTick) return research;
  const packet = after.eventStream.events.filter((event) => event.turn === after.turn);
  if (!packet.some((event) => (event.kind === "status-applied" && event.status === "poisoned" && event.targetId === heroId)
    || ((event.kind === "status-tick" || event.kind === "status-expired") && event.status === "poisoned" && event.actorId === heroId))) return research;
  if (!isValidCombatState(before) || !isValidCombatState(after)
    || !after.combatants.some((actor) => actor.id === heroId && actor.side === "heroes")) return research;

  const applied = packet.find((event) => qualifyingApplication(after, event, heroId));
  if (applied !== undefined && qualifyingApplication(after, applied, heroId)) {
    const damage = packet.find((event) => event.kind === "damage" && event.actorId === applied.actorId
      && event.targetId === heroId && event.abilityId === abilityId);
    if (damage?.kind !== "damage" || damage.healthAfter <= 0) return research;
    const application: FalseTreasureApplicationV1 = Object.freeze({
      speciesId: "inkcap-mimic", abilityId, combatId: after.id, sourceEventId: applied.id,
      sourceTick: depthTick, sourceTurn: applied.turn, actorId: applied.actorId, targetId: heroId,
      potency: applied.potencyAfter, duration: 3, targetHealthAfter: damage.healthAfter,
    });
    return Object.freeze({ ...research, application });
  }

  const application = research.application;
  if (application === null || application.combatId !== after.id || application.sourceTick >= depthTick) return research;
  const tick = packet.find((event) => (event.kind === "status-tick" || event.kind === "status-expired")
    && event.status === "poisoned" && event.actorId === heroId && event.targetId === heroId && event.amount > 0);
  if (tick === undefined || (tick.kind !== "status-tick" && tick.kind !== "status-expired")) return research;
  // A later poison application replaces ownership, even if its potency is identical.
  const latest = [...after.eventStream.events].reverse().find((event) => event.turn < tick.turn
    && event.kind === "status-applied" && event.status === "poisoned" && event.targetId === heroId);
  if (latest === undefined || !qualifyingApplication(after, latest, heroId)
    || latest.id !== application.sourceEventId || latest.turn !== application.sourceTurn || latest.actorId !== application.actorId
    || latest.potencyAfter !== application.potency || latest.durationAfter !== application.duration
    || tick.potency !== application.potency || tick.durationBefore > application.duration) return research;
  const completed: FieldResearchStateV1 = Object.freeze({ ...research, application: Object.freeze({ ...application }), aftereffect: Object.freeze({
    combatId: after.id, sourceEventId: tick.id, sourceTick: depthTick, sourceTurn: tick.turn,
    applicationEventId: application.sourceEventId, targetId: heroId, potency: tick.potency,
    durationBefore: tick.durationBefore, durationAfter: tick.durationAfter,
    healthBefore: tick.healthBefore, amount: tick.amount, healthAfter: tick.healthAfter,
  }) });
  return isValidFieldResearchState(completed, heroId, depthTick) ? completed : research;
}
