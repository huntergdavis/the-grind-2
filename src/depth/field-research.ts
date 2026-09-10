import { isValidCombatState, maximumCombatEventsPerTurn } from "./combat";
import type { CombatState, CombatTurnEvent, CopperhornApplicationV1, CopperhornBurningTickV1, CopperhornFinalEmberV1,
  CopperhornResearchStateV1, FalseTreasureApplicationV1, FieldResearchStateV1, FieldResearchStateV2, FieldResearchStateV3,
  MoonhowlApplicationV1, MoonhowlResearchStateV1, MoonhowlStrikeV1 } from "./types";

export const inkcapResearchClue = "False Treasure inflicts poison; its lingering harm occurs before the victim acts.";
export const moonhowlResearchClue = "Moonhowl weakens the hero; while it lingers, the hero strikes with reduced raw power. Weakening itself does not drain health.";
export const copperhornResearchClue = "Bellmetal Charge inflicts burning; its final fading turn still damages the hero before action resolution.";
const abilityId = "secret:inkcap-mimic:false-treasure";
const moonhowlAbilityId = "secret:lantern-wolf:moonhowl";
const copperhornAbilityId = "secret:copperhorn:bellmetal-charge";
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
export function isValidInkcapResearchState(value: unknown, heroId: string, currentTick: number): value is FieldResearchStateV1 {
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

function createInkcapResearchState(): FieldResearchStateV1 {
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
function advanceInkcapResearch(
  research: FieldResearchStateV1,
  before: CombatState,
  after: CombatState,
  context: { readonly heroId: string; readonly depthTick: number },
): FieldResearchStateV1 {
  const { heroId, depthTick } = context;
  if (research.aftereffect !== null || !isValidInkcapResearchState(research, heroId, depthTick)
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
  return isValidInkcapResearchState(completed, heroId, depthTick) ? completed : research;
}

const moonhowlStrikeKeys = [...aftereffectKeys, "intentEventId", "damageEventId", "action", "abilityId", "strikeTargetId", "targetHealthBefore", "damage", "targetHealthAfter"];

function eventOrdinal(combatId: string, turn: number, eventId: unknown): number {
  return Array.from({ length: maximumCombatEventsPerTurn }, (_, ordinal) => `${combatId}:${turn}:${ordinal}`).indexOf(eventId as string);
}

export function isValidMoonhowlResearchState(value: unknown, heroId: string, currentTick: number): value is MoonhowlResearchStateV1 {
  if (!record(value) || !exact(value, ["taskId", "application", "aftereffect"])
    || value.taskId !== "lantern-wolf:moonhowl@1" || !text(heroId) || !integer(currentTick)) return false;
  if (value.application === null) return value.aftereffect === null;
  const application = value.application;
  if (!record(application) || !exact(application, applicationKeys) || !source(application, currentTick)
    || application.speciesId !== "lantern-wolf" || application.abilityId !== moonhowlAbilityId
    || !text(application.actorId) || ![`${application.combatId}:enemy:0`, `${application.combatId}:enemy:1`].includes(application.actorId)
    || application.actorId === heroId || application.targetId !== heroId
    || !integer(application.potency, 1) || application.duration !== 2 || !integer(application.targetHealthAfter, 1)) return false;
  if (value.aftereffect === null) return true;
  const effect = value.aftereffect;
  if (!record(effect) || !exact(effect, moonhowlStrikeKeys) || !source(effect, currentTick)
    || effect.combatId !== application.combatId || effect.targetId !== heroId
    || effect.applicationEventId !== application.sourceEventId
    || (effect.sourceTick as number) <= (application.sourceTick as number)
    || (effect.sourceTurn as number) <= (application.sourceTurn as number)
    || effect.potency !== application.potency || effect.durationBefore !== 2 || effect.durationAfter !== 1
    || !integer(effect.healthBefore, 1) || effect.amount !== 0 || effect.healthAfter !== effect.healthBefore
    || effect.intentEventId !== `${effect.combatId}:${effect.sourceTurn}:0`
    || eventOrdinal(effect.combatId as string, effect.sourceTurn as number, effect.damageEventId)
      <= eventOrdinal(effect.combatId as string, effect.sourceTurn as number, effect.sourceEventId)
    || !["attack", "ability", "joint-action"].includes(effect.action as string)
    || (effect.action === "ability" ? !text(effect.abilityId) : effect.abilityId !== null)
    || ![`${effect.combatId}:enemy:0`, `${effect.combatId}:enemy:1`].includes(effect.strikeTargetId as string)
    || effect.strikeTargetId === heroId || !integer(effect.targetHealthBefore, 1) || !integer(effect.damage, 1)
    || !integer(effect.targetHealthAfter) || effect.damage > effect.targetHealthBefore
    || effect.targetHealthAfter !== effect.targetHealthBefore - effect.damage) return false;
  return true;
}

function createMoonhowlResearchState(): MoonhowlResearchStateV1 {
  return Object.freeze({ taskId: "lantern-wolf:moonhowl@1", application: null, aftereffect: null });
}

function validCopperhornApplication(value: unknown, heroId: string, currentTick: number): value is CopperhornApplicationV1 {
  return record(value) && exact(value, applicationKeys) && source(value, currentTick)
    && value.speciesId === "copperhorn" && value.abilityId === copperhornAbilityId
    && [`${value.combatId}:enemy:0`, `${value.combatId}:enemy:1`].includes(value.actorId as string)
    && value.actorId !== heroId && value.targetId === heroId && integer(value.potency, 1)
    && value.duration === 2 && integer(value.targetHealthAfter, 1);
}

function validCopperhornTick(value: unknown, application: CopperhornApplicationV1, currentTick: number, final: boolean): boolean {
  return record(value) && exact(value, final ? [...aftereffectKeys, "firstTickEventId", "intentEventId"] : aftereffectKeys)
    && source(value, currentTick) && value.combatId === application.combatId && value.targetId === application.targetId
    && value.applicationEventId === application.sourceEventId && value.potency === application.potency
    && (value.sourceTick as number) > application.sourceTick && (value.sourceTurn as number) > application.sourceTurn
    && (value.sourceTick as number) - application.sourceTick >= (value.sourceTurn as number) - application.sourceTurn
    && value.durationBefore === (final ? 1 : 2) && value.durationAfter === (final ? 0 : 1)
    && integer(value.healthBefore, 1) && integer(value.amount, 1) && integer(value.healthAfter)
    && value.amount === Math.min(value.healthBefore as number, application.potency)
    && value.healthAfter === (value.healthBefore as number) - (value.amount as number);
}

export function isValidCopperhornResearchState(value: unknown, heroId: string, currentTick: number): value is CopperhornResearchStateV1 {
  if (!record(value) || !exact(value, ["taskId", "application", "firstTick", "aftereffect"])
    || value.taskId !== "copperhorn:final-ember@1" || !text(heroId) || !integer(currentTick)) return false;
  if (value.application === null) return value.firstTick === null && value.aftereffect === null;
  if (!validCopperhornApplication(value.application, heroId, currentTick)) return false;
  if (value.firstTick === null) return value.aftereffect === null;
  if (!validCopperhornTick(value.firstTick, value.application, currentTick, false)) return false;
  if (value.aftereffect === null) return true;
  const first = value.firstTick as CopperhornBurningTickV1;
  const final = value.aftereffect;
  return record(final) && validCopperhornTick(final, value.application, currentTick, true)
    && first.healthAfter > 0 && final.firstTickEventId === first.sourceEventId
    && final.intentEventId === `${final.combatId}:${final.sourceTurn}:0`
    && (final.sourceTick as number) > first.sourceTick && (final.sourceTurn as number) > first.sourceTurn
    && (final.sourceTick as number) - first.sourceTick >= (final.sourceTurn as number) - first.sourceTurn;
}

function createCopperhornResearchState(): CopperhornResearchStateV1 {
  return Object.freeze({ taskId: "copperhorn:final-ember@1", application: null, firstTick: null, aftereffect: null });
}

export function createFieldResearchState(): FieldResearchStateV3 {
  return Object.freeze({ schemaVersion: 3, inkcap: createInkcapResearchState(), moonhowl: createMoonhowlResearchState(), copperhorn: createCopperhornResearchState() });
}

function isValidFieldResearchV2(value: unknown, heroId: string, currentTick: number): value is FieldResearchStateV2 {
  return record(value) && exact(value, ["schemaVersion", "inkcap", "moonhowl"]) && value.schemaVersion === 2
    && isValidInkcapResearchState(value.inkcap, heroId, currentTick)
    && isValidMoonhowlResearchState(value.moonhowl, heroId, currentTick);
}

export function isValidFieldResearchState(value: unknown, heroId: string, currentTick: number): value is FieldResearchStateV3 {
  return record(value) && exact(value, ["schemaVersion", "inkcap", "moonhowl", "copperhorn"]) && value.schemaVersion === 3
    && isValidInkcapResearchState(value.inkcap, heroId, currentTick)
    && isValidMoonhowlResearchState(value.moonhowl, heroId, currentTick)
    && isValidCopperhornResearchState(value.copperhorn, heroId, currentTick);
}

/** Upgrade only validated evidence; old lore/retained combat history never earns a new observation. */
export function upgradeFieldResearchState(value: unknown, heroId: string, currentTick: number): FieldResearchStateV3 {
  const valid = isValidFieldResearchState(value, heroId, currentTick) ? value
    : isValidFieldResearchV2(value, heroId, currentTick)
      ? { ...value, schemaVersion: 3 as const, copperhorn: createCopperhornResearchState() }
      : isValidInkcapResearchState(value, heroId, currentTick)
      ? { schemaVersion: 3 as const, inkcap: value, moonhowl: createMoonhowlResearchState(), copperhorn: createCopperhornResearchState() }
      : null;
  if (valid === null) throw new TypeError("Field research evidence is malformed or from the future");
  return Object.freeze({ schemaVersion: 3,
    inkcap: Object.freeze({ ...valid.inkcap,
      application: valid.inkcap.application === null ? null : Object.freeze({ ...valid.inkcap.application }),
      aftereffect: valid.inkcap.aftereffect === null ? null : Object.freeze({ ...valid.inkcap.aftereffect }) }),
    moonhowl: Object.freeze({ ...valid.moonhowl,
      application: valid.moonhowl.application === null ? null : Object.freeze({ ...valid.moonhowl.application }),
      aftereffect: valid.moonhowl.aftereffect === null ? null : Object.freeze({ ...valid.moonhowl.aftereffect }) }),
    copperhorn: Object.freeze({ ...valid.copperhorn,
      application: valid.copperhorn.application === null ? null : Object.freeze({ ...valid.copperhorn.application }),
      firstTick: valid.copperhorn.firstTick === null ? null : Object.freeze({ ...valid.copperhorn.firstTick }),
      aftereffect: valid.copperhorn.aftereffect === null ? null : Object.freeze({ ...valid.copperhorn.aftereffect }) }),
  });
}

function qualifyingMoonhowl(combat: CombatState, event: CombatTurnEvent, heroId: string): event is Extract<CombatTurnEvent, { kind: "status-applied" }> {
  if (event.kind !== "status-applied" || event.status !== "weakened" || event.abilityId !== moonhowlAbilityId
    || event.targetId !== heroId || event.durationAfter !== 2 || event.potencyAfter < 1) return false;
  const enemy = combat.combatants.find((actor) => actor.id === event.actorId);
  return enemy?.side === "enemies" && enemy.speciesId === "lantern-wolf"
    && enemy.abilities.some((ability) => ability.id === moonhowlAbilityId && ability.effect === "weaken");
}

function advanceMoonhowlResearch(research: MoonhowlResearchStateV1, before: CombatState, after: CombatState,
  context: { readonly heroId: string; readonly depthTick: number }): MoonhowlResearchStateV1 {
  const { heroId, depthTick } = context;
  if (research.aftereffect !== null) return research;
  const packet = after.eventStream.events.filter((event) => event.turn === after.turn);
  if (!packet.some((event) => event.kind === "status-applied" && event.status === "weakened" && event.targetId === heroId)
    && !packet.some((event) => event.kind === "status-tick" && event.status === "weakened" && event.actorId === heroId)) return research;
  if (!isValidCombatState(before) || !isValidCombatState(after)
    || !after.combatants.some((actor) => actor.id === heroId && actor.side === "heroes")) return research;
  const applied = packet.find((event) => qualifyingMoonhowl(after, event, heroId));
  if (applied !== undefined && qualifyingMoonhowl(after, applied, heroId)) {
    const damage = packet.find((event) => event.kind === "damage" && event.actorId === applied.actorId
      && event.targetId === heroId && event.abilityId === moonhowlAbilityId && event.ordinal < applied.ordinal);
    if (damage?.kind !== "damage" || damage.healthAfter <= 0) return research;
    const application: MoonhowlApplicationV1 = Object.freeze({ speciesId: "lantern-wolf", abilityId: moonhowlAbilityId,
      combatId: after.id, sourceEventId: applied.id, sourceTick: depthTick, sourceTurn: applied.turn,
      actorId: applied.actorId, targetId: heroId, potency: applied.potencyAfter, duration: 2, targetHealthAfter: damage.healthAfter });
    return Object.freeze({ ...research, application });
  }
  const application = research.application;
  if (application === null || application.combatId !== after.id || application.sourceTick >= depthTick) return research;
  const tick = packet.find((event) => event.kind === "status-tick" && event.status === "weakened"
    && event.actorId === heroId && event.targetId === heroId && event.durationBefore === 2 && event.durationAfter === 1
    && event.amount === 0 && event.healthBefore > 0 && event.healthAfter === event.healthBefore);
  if (tick?.kind !== "status-tick" || tick.potency !== application.potency) return research;
  const latest = [...after.eventStream.events].reverse().find((event) => event.turn < tick.turn
    && event.kind === "status-applied" && event.status === "weakened" && event.targetId === heroId);
  if (latest === undefined || !qualifyingMoonhowl(after, latest, heroId)
    || latest.id !== application.sourceEventId || latest.turn !== application.sourceTurn || latest.actorId !== application.actorId
    || latest.potencyAfter !== application.potency || latest.durationAfter !== 2) return research;
  const intent = packet.find((event) => event.kind === "intent" && event.actorId === heroId && event.ordinal === 0
    && (event.action === "attack" || event.action === "ability" || event.action === "joint-action"));
  if (intent?.kind !== "intent" || (intent.action !== "attack" && intent.action !== "ability" && intent.action !== "joint-action")) return research;
  if (intent.action === "ability" && !before.combatants.find((actor) => actor.id === heroId)?.abilities
    .some((ability) => ability.id === intent.abilityId)) return research;
  const damage = packet.find((event) => event.kind === "damage" && event.actorId === heroId
    && event.targetId === intent.targetId && event.abilityId === intent.abilityId && event.ordinal > tick.ordinal && event.amount > 0);
  if (damage?.kind !== "damage" || damage.targetId === null
    || !after.combatants.some((actor) => actor.id === damage.targetId && actor.side === "enemies")
    || !after.combatants.find((actor) => actor.id === heroId)?.statuses
      .some((status) => status.kind === "weakened" && status.potency === application.potency && status.duration === 1)) return research;
  const aftereffect: MoonhowlStrikeV1 = Object.freeze({ combatId: after.id, sourceEventId: tick.id,
    sourceTick: depthTick, sourceTurn: tick.turn, applicationEventId: application.sourceEventId,
    targetId: heroId, potency: tick.potency, durationBefore: 2, durationAfter: 1,
    healthBefore: tick.healthBefore, amount: 0, healthAfter: tick.healthAfter,
    intentEventId: intent.id, damageEventId: damage.id, action: intent.action, abilityId: intent.abilityId,
    strikeTargetId: damage.targetId, targetHealthBefore: damage.healthBefore, damage: damage.amount, targetHealthAfter: damage.healthAfter });
  const completed = Object.freeze({ ...research, application: Object.freeze({ ...application }), aftereffect });
  return isValidMoonhowlResearchState(completed, heroId, depthTick) ? completed : research;
}

function qualifyingCopperhorn(combat: CombatState, event: CombatTurnEvent, heroId: string): event is Extract<CombatTurnEvent, { kind: "status-applied" }> {
  if (event.kind !== "status-applied" || event.status !== "burning" || event.abilityId !== copperhornAbilityId
    || event.targetId !== heroId || event.durationAfter !== 2 || event.potencyAfter < 1) return false;
  const enemy = combat.combatants.find((actor) => actor.id === event.actorId);
  return enemy?.side === "enemies" && enemy.speciesId === "copperhorn"
    && enemy.abilities.some((ability) => ability.id === copperhornAbilityId && ability.effect === "burning");
}

function advanceCopperhornResearch(research: CopperhornResearchStateV1, before: CombatState, after: CombatState,
  context: { readonly heroId: string; readonly depthTick: number }): CopperhornResearchStateV1 {
  if (research.aftereffect !== null) return research;
  const { heroId, depthTick } = context;
  const packet = after.eventStream.events.filter((event) => event.turn === after.turn);
  const applied = packet.find((event) => event.kind === "status-applied" && event.status === "burning" && event.targetId === heroId);
  const tick = packet.find((event) => (event.kind === "status-tick" || event.kind === "status-expired")
    && event.status === "burning" && event.actorId === heroId && event.targetId === heroId && event.amount > 0);
  if (applied === undefined && tick === undefined) return research;
  if (!isValidCombatState(before) || !isValidCombatState(after)
    || !after.combatants.some((actor) => actor.id === heroId && actor.side === "heroes")) return research;
  if (applied !== undefined) {
    if (!qualifyingCopperhorn(after, applied, heroId)) {
      return research.firstTick === null ? research : Object.freeze({ ...research, firstTick: null });
    }
    const damage = packet.find((event) => event.kind === "damage" && event.actorId === applied.actorId
      && event.targetId === heroId && event.abilityId === copperhornAbilityId && event.ordinal < applied.ordinal);
    if (damage?.kind !== "damage" || damage.healthAfter <= 0) return research;
    if (research.application?.sourceEventId === applied.id && research.application.combatId === after.id) return research;
    const application: CopperhornApplicationV1 = Object.freeze({ speciesId: "copperhorn", abilityId: copperhornAbilityId,
      combatId: after.id, sourceEventId: applied.id, sourceTick: depthTick, sourceTurn: applied.turn,
      actorId: applied.actorId, targetId: heroId, potency: applied.potencyAfter, duration: 2, targetHealthAfter: damage.healthAfter });
    return Object.freeze({ ...research, application, firstTick: null });
  }
  const application = research.application;
  if (application === null || application.combatId !== after.id || application.sourceTick >= depthTick
    || tick === undefined || (tick.kind !== "status-tick" && tick.kind !== "status-expired")
    || tick.potency !== application.potency || after.eventStream.firstRecordedTurn > application.sourceTurn
    || !before.combatants.find((actor) => actor.id === heroId)?.statuses.some((status) => status.kind === "burning"
      && status.potency === tick.potency && status.duration === tick.durationBefore)) return research;
  // The full two-turn chain must remain observable; identical later fire still replaces ownership.
  const latest = [...after.eventStream.events].reverse().find((event) => event.turn < tick.turn
    && event.kind === "status-applied" && event.status === "burning" && event.targetId === heroId);
  if (latest === undefined || !qualifyingCopperhorn(after, latest, heroId)
    || latest.id !== application.sourceEventId || latest.turn !== application.sourceTurn || latest.actorId !== application.actorId
    || latest.potencyAfter !== application.potency || latest.durationAfter !== 2) return research;
  const chain = after.eventStream.events.filter((event) => event.turn > application.sourceTurn && event.turn <= tick.turn);
  const burns = chain.filter((event) => (event.kind === "status-tick" || event.kind === "status-expired")
    && event.status === "burning" && event.actorId === heroId && event.targetId === heroId);
  const intents = chain.filter((event) => event.kind === "intent" && event.actorId === heroId);
  const snapshot = { combatId: after.id, sourceEventId: tick.id, sourceTick: depthTick, sourceTurn: tick.turn,
    applicationEventId: application.sourceEventId, targetId: heroId, potency: tick.potency,
    healthBefore: tick.healthBefore, amount: tick.amount, healthAfter: tick.healthAfter };
  if (tick.kind === "status-tick" && tick.durationBefore === 2 && tick.durationAfter === 1) {
    if (research.firstTick !== null || burns.length !== 1 || burns[0]?.id !== tick.id
      || intents.length !== 1 || intents[0]?.id !== `${after.id}:${tick.turn}:0`
      || !after.combatants.find((actor) => actor.id === heroId)?.statuses.some((status) => status.kind === "burning"
        && status.duration === 1 && status.potency === application.potency)) return research;
    const firstTick: CopperhornBurningTickV1 = Object.freeze({ ...snapshot, durationBefore: 2, durationAfter: 1 });
    const observed = Object.freeze({ ...research, firstTick });
    return isValidCopperhornResearchState(observed, heroId, depthTick) ? observed : research;
  }
  const first = research.firstTick;
  const actualFirst = burns[0];
  if (tick.kind !== "status-expired" || tick.durationBefore !== 1 || tick.durationAfter !== 0 || first === null
    || burns.length !== 2 || burns[1]?.id !== tick.id || actualFirst?.kind !== "status-tick"
    || actualFirst.id !== first.sourceEventId || actualFirst.turn !== first.sourceTurn
    || actualFirst.durationBefore !== 2 || actualFirst.durationAfter !== 1 || actualFirst.potency !== first.potency
    || actualFirst.healthBefore !== first.healthBefore || actualFirst.amount !== first.amount || actualFirst.healthAfter !== first.healthAfter
    || intents.length !== 2 || intents[0]?.id !== `${after.id}:${first.sourceTurn}:0` || intents[1]?.id !== `${after.id}:${tick.turn}:0`
    || after.combatants.find((actor) => actor.id === heroId)?.statuses.some((status) => status.kind === "burning")) return research;
  const aftereffect: CopperhornFinalEmberV1 = Object.freeze({ ...snapshot, durationBefore: 1, durationAfter: 0,
    firstTickEventId: first.sourceEventId, intentEventId: `${after.id}:${tick.turn}:0` });
  const completed = Object.freeze({ ...research, application: Object.freeze({ ...application }), firstTick: Object.freeze({ ...first }), aftereffect });
  return isValidCopperhornResearchState(completed, heroId, depthTick) ? completed : research;
}

/** Observe three fixed tasks from this one real, newly resolved combat packet. */
export function advanceFieldResearch(research: FieldResearchStateV3, before: CombatState, after: CombatState,
  context: { readonly heroId: string; readonly depthTick: number }): FieldResearchStateV3 {
  if (!isValidFieldResearchState(research, context.heroId, context.depthTick)
    || before.id !== after.id || after.turn !== before.turn + 1 || after.turn > context.depthTick) return research;
  const inkcap = advanceInkcapResearch(research.inkcap, before, after, context);
  const moonhowl = advanceMoonhowlResearch(research.moonhowl, before, after, context);
  const copperhorn = advanceCopperhornResearch(research.copperhorn, before, after, context);
  return inkcap === research.inkcap && moonhowl === research.moonhowl && copperhorn === research.copperhorn ? research
    : Object.freeze({ schemaVersion: 3, inkcap, moonhowl, copperhorn });
}
