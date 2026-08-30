import { randomInt } from "../core/rng";
import { abilityExperienceFloor, derivedStats, gainAbilityExperience } from "./rpg";
import type { AbilityState, CombatAction, CombatLogEntry, CombatState, CombatStatus, CombatTurnEvent, CombatantState, DetailedHeroState } from "./types";

export const maximumCombatTurns = 128;
export const maximumCombatLogEntries = 96;
export const maximumCombatEventsPerTurn = 12;
export const maximumCombatEvents = 96;

type CombatTurnEventDraft = CombatTurnEvent extends infer Event
  ? Event extends CombatTurnEvent
    ? Omit<Event, "id" | "turn" | "ordinal">
    : never
  : never;

interface MonsterDefinition {
  id: string;
  name: string;
  color: number;
  secret: Pick<AbilityState, "id" | "name" | "effect" | "manaCost" | "potency">;
}

export const monsterDefinitions = [
  { id: "lantern-wolf", name: "Lantern Wolf", color: 0x63865d, secret: { id: "secret:lantern-wolf:moonhowl", name: "Moonhowl", effect: "weaken", manaCost: 2, potency: 4 } },
  { id: "mossback-brute", name: "Mossback Brute", color: 0x4f7350, secret: { id: "secret:mossback-brute:rootbreaker", name: "Rootbreaker", effect: "piercing", manaCost: 1, potency: 6 } },
  { id: "river-wyrmling", name: "River Wyrmling", color: 0x477b84, secret: { id: "secret:river-wyrmling:undertow", name: "Undertow Coil", effect: "arcane", manaCost: 3, potency: 5 } },
  { id: "inkcap-mimic", name: "Inkcap Mimic", color: 0x6e5579, secret: { id: "secret:inkcap-mimic:false-treasure", name: "False Treasure", effect: "poison", manaCost: 2, potency: 4 } },
  { id: "copperhorn", name: "Copperhorn", color: 0x8b6848, secret: { id: "secret:copperhorn:bellmetal-charge", name: "Bellmetal Charge", effect: "burning", manaCost: 2, potency: 5 } },
] as const satisfies readonly MonsterDefinition[];

export type MonsterSpeciesId = typeof monsterDefinitions[number]["id"];

export function monsterDefinition(monsterId: string): MonsterDefinition | undefined {
  return monsterDefinitions.find((entry) => entry.id === monsterId);
}

export function monsterAbilityForLevel(definition: MonsterDefinition, heroLevel: number): AbilityState {
  const level = Math.max(1, Math.min(20, 1 + Math.floor(heroLevel / 4)));
  return {
    ...definition.secret,
    kind: "secret",
    level,
    experience: abilityExperienceFloor(level),
    uses: 0,
    sourceMonsterId: definition.id,
  };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clampEnemyCount(value: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(5, Math.floor(value)));
}

function result(combatants: readonly CombatantState[], turn: number): CombatState["outcome"] {
  if (!combatants.some((unit) => unit.side === "heroes" && unit.health > 0)) return "defeat";
  if (!combatants.some((unit) => unit.side === "enemies" && unit.health > 0)) return "victory";
  if (turn >= maximumCombatTurns) return "stalemate";
  return "ongoing";
}

function appendLog(log: readonly CombatLogEntry[], entry: CombatLogEntry): readonly CombatLogEntry[] {
  return [...log.slice(-(maximumCombatLogEntries - 1)), entry];
}

function appendTurnEvent(
  packet: CombatTurnEvent[],
  combatId: string,
  turn: number,
  draft: CombatTurnEventDraft,
): CombatTurnEvent {
  if (packet.length >= maximumCombatEventsPerTurn) throw new RangeError("Combat turn event packet exceeds its bound");
  const ordinal = packet.length;
  const event = {
    ...draft,
    id: `${combatId}:${turn}:${ordinal}`,
    turn,
    ordinal,
  } as CombatTurnEvent;
  packet.push(event);
  return event;
}

function appendTurnPacket(combat: CombatState, packet: readonly CombatTurnEvent[]): CombatState {
  if (packet.length === 0) return combat;
  if (packet.length > maximumCombatEventsPerTurn) throw new RangeError("Combat turn event packet exceeds its bound");
  const turns = new Map<number, CombatTurnEvent[]>();
  for (const event of [...combat.eventStream.events, ...packet]) {
    const entries = turns.get(event.turn) ?? [];
    entries.push(event);
    turns.set(event.turn, entries);
  }
  const orderedTurns = [...turns.keys()].sort((left, right) => left - right);
  let retainedCount = orderedTurns.reduce((total, retainedTurn) => total + (turns.get(retainedTurn)?.length ?? 0), 0);
  while (retainedCount > maximumCombatEvents && orderedTurns.length > 1) {
    const removedTurn = orderedTurns.shift();
    if (removedTurn !== undefined) retainedCount -= turns.get(removedTurn)?.length ?? 0;
  }
  const events = orderedTurns.flatMap((retainedTurn) => turns.get(retainedTurn) ?? []);
  if (events.length > maximumCombatEvents) throw new RangeError("A single combat turn cannot fit the event history bound");
  return { ...combat, eventStream: { ...combat.eventStream, events } };
}

function withCombatant(combatants: readonly CombatantState[], updated: CombatantState): readonly CombatantState[] {
  return combatants.map((combatant) => combatant.id === updated.id ? updated : combatant);
}

export function createCombat(seed: string, hero: DetailedHeroState, encounterId: string, requestedEnemyCount = 2): CombatState {
  const heroStats = derivedStats(hero);
  const combatants: CombatantState[] = [{
    id: hero.id,
    name: hero.name,
    side: "heroes",
    health: Math.min(hero.resources.health, heroStats.maxHealth),
    maxHealth: heroStats.maxHealth,
    mana: Math.min(hero.resources.mana, heroStats.maxMana),
    maxMana: heroStats.maxMana,
    power: heroStats.power,
    armor: heroStats.armor,
    initiative: heroStats.initiative,
    statuses: [],
    speciesId: null,
    abilities: hero.abilities,
  }];
  const count = clampEnemyCount(requestedEnemyCount);
  for (let index = 0; index < count; index += 1) {
    const id = `${encounterId}:enemy:${index}`;
    const definition = monsterDefinitions[randomInt(monsterDefinitions.length, seed, "combat", id, 0, "species")];
    if (definition === undefined) throw new Error("Missing monster definition");
    const danger = 4 + hero.level + randomInt(4, seed, "combat", id, 0, "danger");
    const mana = 5 + Math.floor(danger / 2);
    combatants.push({
      id,
      name: `${definition.name} ${index + 1}`,
      side: "enemies",
      health: 12 + danger * 2,
      maxHealth: 12 + danger * 2,
      mana,
      maxMana: mana,
      power: 4 + danger,
      armor: Math.floor(danger / 3),
      initiative: 7 + randomInt(12, seed, "combat", id, 0, "initiative"),
      statuses: [],
      speciesId: definition.id,
      abilities: [monsterAbilityForLevel(definition, hero.level)],
    });
  }
  const turnOrder = [...combatants].sort((left, right) => right.initiative - left.initiative || compareIds(left.id, right.id)).map((entry) => entry.id);
  return {
    id: encounterId,
    round: 1,
    turn: 0,
    activeIndex: 0,
    turnOrder,
    combatants,
    outcome: "ongoing",
    log: [],
    eventStream: { schemaVersion: 1, firstRecordedTurn: 1, events: [] },
  };
}

function targetForAction(combat: CombatState, action: CombatAction, actor: CombatantState): CombatantState {
  if (action.targetId === null) throw new Error("This combat action needs a target");
  const target = combat.combatants.find((combatant) => combatant.id === action.targetId);
  if (target === undefined || target.health <= 0) throw new Error("Combat target is unavailable");
  if (target.side === actor.side) throw new Error("Hostile actions cannot target an ally");
  return target;
}

function prepareTurn(
  combat: CombatState,
  actor: CombatantState,
  turn: number,
  packet: CombatTurnEvent[],
): { combat: CombatState; actor: CombatantState; defeatCauseEventId: string | null } {
  let health = actor.health;
  const nextStatuses: CombatStatus[] = [];
  let prepared = combat;
  let defeatCauseEventId: string | null = null;
  for (const status of actor.statuses) {
    const healthBefore = health;
    if (status.kind === "poisoned" || status.kind === "burning") {
      health = Math.max(0, health - status.potency);
      prepared = {
        ...prepared,
        log: appendLog(prepared.log, {
          turn: combat.turn + 1,
          actorId: actor.id,
          action: "status",
          targetId: actor.id,
          abilityId: null,
          message: `${actor.name} suffers ${status.kind === "poisoned" ? "poison" : "burning"}.`,
          amount: status.potency,
        }),
      };
    }
    const durationAfter = status.kind !== "guarding" && status.duration > 1 ? status.duration - 1 : 0;
    if (durationAfter > 0) nextStatuses.push({ ...status, duration: durationAfter });
    const statusEvent = appendTurnEvent(packet, combat.id, turn, {
      kind: durationAfter === 0 ? "status-expired" : "status-tick",
      actorId: actor.id,
      targetId: actor.id,
      status: status.kind,
      potency: status.potency,
      durationBefore: status.duration,
      durationAfter,
      healthBefore,
      amount: healthBefore - health,
      healthAfter: health,
    });
    if (healthBefore > 0 && health === 0) defeatCauseEventId = statusEvent.id;
  }
  const updated = { ...actor, health, statuses: nextStatuses };
  return {
    combat: { ...prepared, combatants: withCombatant(prepared.combatants, updated) },
    actor: updated,
    defeatCauseEventId,
  };
}

function appliedStatus(ability: AbilityState): CombatStatus | undefined {
  const potency = Math.max(1, 1 + Math.floor(ability.level / 5));
  if (ability.effect === "poison") return { kind: "poisoned", duration: 3, potency };
  if (ability.effect === "burning") return { kind: "burning", duration: 2, potency: potency + 1 };
  if (ability.effect === "weaken") return { kind: "weakened", duration: 2, potency: potency + 1 };
  return undefined;
}

function addOrRefreshStatus(statuses: readonly CombatStatus[], added: CombatStatus | undefined): readonly CombatStatus[] {
  if (added === undefined) return statuses;
  return [...statuses.filter((status) => status.kind !== added.kind), added].slice(-8);
}

function nextLivingIndex(combat: CombatState, currentIndex: number): { index: number; wrapped: boolean } {
  for (let offset = 1; offset <= combat.turnOrder.length; offset += 1) {
    const index = (currentIndex + offset) % combat.turnOrder.length;
    const id = combat.turnOrder[index];
    const candidate = combat.combatants.find((entry) => entry.id === id);
    if (candidate !== undefined && candidate.health > 0) return { index, wrapped: index <= currentIndex };
  }
  return { index: currentIndex, wrapped: false };
}

export function resolveCombatTurn(input: CombatState, action: CombatAction, seed: string): CombatState {
  if (input.outcome !== "ongoing") return input;
  const activeId = input.turnOrder[input.activeIndex];
  if (activeId === undefined || action.actorId !== activeId) throw new Error("Action actor is not active");
  const active = input.combatants.find((entry) => entry.id === activeId);
  if (active === undefined || active.health <= 0) throw new Error("Active combatant is unavailable");
  const turn = input.turn + 1;
  const packet: CombatTurnEvent[] = [];
  appendTurnEvent(packet, input.id, turn, {
    kind: "intent",
    actorId: active.id,
    targetId: action.targetId,
    action: action.type,
    abilityId: action.abilityId,
  });
  let { combat, actor, defeatCauseEventId } = prepareTurn(input, active, turn, packet);

  if (actor.health === 0 && defeatCauseEventId !== null) {
    appendTurnEvent(packet, input.id, turn, {
      kind: "defeated",
      actorId: actor.id,
      targetId: actor.id,
      causeEventId: defeatCauseEventId,
    });
  }

  if (actor.health > 0 && action.type === "guard") {
    const guardStatus: CombatStatus = { kind: "guarding", duration: 1, potency: 50 };
    const previousGuard = actor.statuses.find((status) => status.kind === "guarding");
    actor = { ...actor, statuses: addOrRefreshStatus(actor.statuses, guardStatus) };
    combat = {
      ...combat,
      combatants: withCombatant(combat.combatants, actor),
        log: appendLog(combat.log, { turn, actorId: actor.id, action: "guard", targetId: actor.id, abilityId: null, message: `${actor.name} braces behind a careful guard.`, amount: 0 }),
      };
    appendTurnEvent(packet, input.id, turn, {
      kind: "status-applied",
      actorId: actor.id,
      targetId: actor.id,
      abilityId: null,
      status: guardStatus.kind,
      potencyBefore: previousGuard?.potency ?? null,
      potencyAfter: guardStatus.potency,
      durationBefore: previousGuard?.duration ?? null,
      durationAfter: guardStatus.duration,
    });
  } else if (actor.health > 0) {
    const target = targetForAction(combat, action, actor);
    const selected = action.type === "ability"
      ? actor.abilities.find((entry) => entry.id === action.abilityId)
      : undefined;
    if (action.type === "ability" && selected === undefined) throw new Error("Combatant does not know that ability");
    if (selected !== undefined && actor.mana < selected.manaCost) throw new Error("Combatant lacks mana for that ability");
    const variance = randomInt(5, seed, "combat-resolution", combat.id, turn, `${actor.id}:${target.id}`);
    const guarding = target.statuses.some((status) => status.kind === "guarding");
    const weakened = actor.statuses.find((status) => status.kind === "weakened")?.potency ?? 0;
    const armor = selected?.effect === "piercing" ? Math.floor(target.armor / 5) : Math.floor(target.armor / 2);
    const rawDamage = actor.power + variance - weakened + (selected === undefined ? 0 : selected.potency + selected.level) - armor;
    const damage = Math.max(1, Math.floor(rawDamage * (guarding ? 0.5 : 1)));
    const added = selected === undefined ? undefined : appliedStatus(selected);
    const previousStatus = added === undefined
      ? undefined
      : target.statuses.find((status) => status.kind === added.kind);
    const updatedTarget: CombatantState = {
      ...target,
      health: Math.max(0, target.health - damage),
      statuses: addOrRefreshStatus(target.statuses, added),
    };
    if (selected !== undefined) {
      appendTurnEvent(packet, input.id, turn, {
        kind: "mana-spent",
        actorId: actor.id,
        targetId: actor.id,
        abilityId: selected.id,
        manaBefore: actor.mana,
        amount: selected.manaCost,
        manaAfter: actor.mana - selected.manaCost,
      });
    }
    actor = selected === undefined
      ? actor
      : {
          ...actor,
          mana: actor.mana - selected.manaCost,
          abilities: actor.abilities.map((entry) => entry.id === selected.id ? gainAbilityExperience(entry, 2) : entry),
        };
    combat = {
      ...combat,
      combatants: withCombatant(withCombatant(combat.combatants, updatedTarget), actor),
      log: appendLog(combat.log, {
        turn,
        actorId: actor.id,
        action: selected === undefined ? "attack" : "ability",
        targetId: target.id,
        abilityId: selected?.id ?? null,
        message: selected === undefined
          ? `${actor.name} strikes ${target.name} for ${damage}.`
          : `${actor.name} invokes ${selected.name} on ${target.name} for ${damage}.`,
        amount: damage,
      }),
    };
    const damageEvent = appendTurnEvent(packet, input.id, turn, {
      kind: "damage",
      actorId: actor.id,
      targetId: target.id,
      abilityId: selected?.id ?? null,
      healthBefore: target.health,
      amount: target.health - updatedTarget.health,
      healthAfter: updatedTarget.health,
      guarded: guarding,
      critical: false,
    });
    if (added !== undefined) {
      appendTurnEvent(packet, input.id, turn, {
        kind: "status-applied",
        actorId: actor.id,
        targetId: target.id,
        abilityId: selected?.id ?? null,
        status: added.kind,
        potencyBefore: previousStatus?.potency ?? null,
        potencyAfter: added.potency,
        durationBefore: previousStatus?.duration ?? null,
        durationAfter: added.duration,
      });
    }
    if (target.health > 0 && updatedTarget.health === 0) {
      appendTurnEvent(packet, input.id, turn, {
        kind: "defeated",
        actorId: actor.id,
        targetId: target.id,
        causeEventId: damageEvent.id,
      });
    }
  }

  const outcome = result(combat.combatants, turn);
  if (outcome !== "ongoing") {
    appendTurnEvent(packet, input.id, turn, {
      kind: "outcome",
      actorId: actor.id,
      targetId: null,
      outcome,
    });
    return appendTurnPacket({ ...combat, turn, outcome }, packet);
  }
  const next = nextLivingIndex(combat, input.activeIndex);
  return appendTurnPacket({
    ...combat,
    turn,
    outcome,
    activeIndex: next.index,
    round: input.round + (next.wrapped ? 1 : 0),
  }, packet);
}

export function chooseCombatAction(combat: CombatState): CombatAction {
  if (combat.outcome !== "ongoing") throw new Error("Combat has ended");
  const actorId = combat.turnOrder[combat.activeIndex];
  const actor = combat.combatants.find((entry) => entry.id === actorId);
  if (actor === undefined || actor.health <= 0) throw new Error("Active combatant is unavailable");
  const targets = combat.combatants.filter((entry) => entry.side !== actor.side && entry.health > 0).sort((left, right) => left.health - right.health || compareIds(left.id, right.id));
  const target = targets[0];
  if (target === undefined) throw new Error("No combat target remains");
  if (actor.side === "heroes" && actor.health * 3 < actor.maxHealth && combat.turn % 4 === 1) {
    return { actorId: actor.id, type: "guard", targetId: null, abilityId: null };
  }
  const available = actor.abilities.filter((entry) => entry.manaCost <= actor.mana);
  const cadence = actor.side === "heroes" ? 3 : 4;
  const abilityTurn = actor.side === "heroes" ? 0 : 2;
  const chosen = available.length > 0 && combat.turn % cadence === abilityTurn
    ? available[combat.round % available.length]
    : undefined;
  return chosen === undefined
    ? { actorId: actor.id, type: "attack", targetId: target.id, abilityId: null }
    : { actorId: actor.id, type: "ability", targetId: target.id, abilityId: chosen.id };
}

export function legalCombatActions(combat: CombatState): readonly CombatAction[] {
  if (combat.outcome !== "ongoing") return [];
  const actorId = combat.turnOrder[combat.activeIndex];
  const actor = combat.combatants.find((entry) => entry.id === actorId);
  if (actor === undefined || actor.health <= 0) return [];
  const targets = combat.combatants
    .filter((entry) => entry.side !== actor.side && entry.health > 0)
    .sort((left, right) => compareIds(left.id, right.id));
  const abilities = actor.abilities
    .filter((entry) => entry.manaCost <= actor.mana)
    .sort((left, right) => compareIds(left.id, right.id));
  return [
    { actorId: actor.id, type: "guard", targetId: null, abilityId: null },
    ...targets.map((target) => ({
      actorId: actor.id,
      type: "attack" as const,
      targetId: target.id,
      abilityId: null,
    })),
    ...abilities.flatMap((ability) => targets.map((target) => ({
      actorId: actor.id,
      type: "ability" as const,
      targetId: target.id,
      abilityId: ability.id,
    }))),
  ];
}

const combatStatusKinds = ["guarding", "poisoned", "weakened", "burning"] as const;
const combatOutcomes = ["ongoing", "victory", "defeat", "stalemate"] as const;
const combatActions = ["attack", "guard", "ability"] as const;
const combatEventKinds = [
  "intent",
  "status-tick",
  "status-expired",
  "mana-spent",
  "damage",
  "status-applied",
  "defeated",
  "outcome",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function hasKnownStatus(value: unknown): value is CombatStatus["kind"] {
  return typeof value === "string" && combatStatusKinds.includes(value as CombatStatus["kind"]);
}

function isValidCombatant(value: unknown): value is CombatantState {
  if (!isRecord(value) || !Array.isArray(value.statuses) || !Array.isArray(value.abilities)) return false;
  const statuses = value.statuses;
  const statusKinds = statuses.flatMap((status) => isRecord(status) && typeof status.kind === "string" ? [status.kind] : []);
  const abilities = value.abilities;
  const abilityIds = abilities.flatMap((ability) => isRecord(ability) && typeof ability.id === "string" ? [ability.id] : []);
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    (value.side === "heroes" || value.side === "enemies") &&
    isSafeInteger(value.health) && isSafeInteger(value.maxHealth, 1) && value.health <= value.maxHealth &&
    isSafeInteger(value.mana) && isSafeInteger(value.maxMana) && value.mana <= value.maxMana &&
    isSafeInteger(value.power) && isSafeInteger(value.armor) && isSafeInteger(value.initiative) &&
    (value.speciesId === null || (typeof value.speciesId === "string" && value.speciesId.length > 0)) &&
    statuses.length <= combatStatusKinds.length &&
    statusKinds.length === statuses.length && new Set(statusKinds).size === statusKinds.length &&
    statuses.every((status) => isRecord(status) && hasKnownStatus(status.kind) && isSafeInteger(status.duration, 1, 8) && isSafeInteger(status.potency, 1)) &&
    abilities.length <= 16 && abilityIds.length === abilities.length && new Set(abilityIds).size === abilityIds.length
  );
}

function isValidCombatLogEntry(value: unknown, combat: CombatState, combatantIds: ReadonlySet<string>): boolean {
  if (!isRecord(value)) return false;
  const actor = combat.combatants.find((combatant) => combatant.id === value.actorId);
  return (
    isSafeInteger(value.turn, 1, combat.turn) &&
    typeof value.actorId === "string" && combatantIds.has(value.actorId) &&
    (value.action === "attack" || value.action === "guard" || value.action === "ability" || value.action === "status") &&
    (value.targetId === null || (typeof value.targetId === "string" && combatantIds.has(value.targetId))) &&
    (value.abilityId === null || (
      typeof value.abilityId === "string" && actor?.abilities.some((ability) => ability.id === value.abilityId) === true
    )) &&
    typeof value.message === "string" && value.message.length > 0 &&
    isSafeInteger(value.amount)
  );
}

function isValidCombatEventPacket(
  packet: readonly unknown[],
  combat: CombatState,
  combatantIds: ReadonlySet<string>,
  finalStreamEventId: string | undefined,
): boolean {
  if (packet.length < 1 || packet.length > maximumCombatEventsPerTurn) return false;
  const first = packet[0];
  if (!isRecord(first) || first.kind !== "intent" || typeof first.actorId !== "string") return false;
  const turn = first.turn;
  if (!isSafeInteger(turn, combat.eventStream.firstRecordedTurn, combat.turn)) return false;
  const intentActorId = first.actorId;
  const actor = combat.combatants.find((combatant) => combatant.id === intentActorId);
  if (actor === undefined) return false;
  let previousPhase = 0;
  let manaCount = 0;
  let damageCount = 0;
  let statusAppliedCount = 0;
  let defeatedCount = 0;
  let outcomeCount = 0;
  const resolvedStatuses = new Set<CombatStatus["kind"]>();
  for (let ordinal = 0; ordinal < packet.length; ordinal += 1) {
    const event = packet[ordinal];
    if (!isRecord(event)) return false;
    if (
      event.id !== `${combat.id}:${turn}:${ordinal}` ||
      event.turn !== turn || event.ordinal !== ordinal ||
      typeof event.actorId !== "string" || event.actorId !== intentActorId || !combatantIds.has(event.actorId) ||
      (event.targetId !== null && (typeof event.targetId !== "string" || !combatantIds.has(event.targetId))) ||
      typeof event.kind !== "string" || !combatEventKinds.includes(event.kind as typeof combatEventKinds[number])
    ) return false;
    const phase = event.kind === "intent"
      ? 0
      : event.kind === "status-tick" || event.kind === "status-expired"
        ? 1
        : event.kind === "mana-spent"
          ? 2
          : event.kind === "damage"
            ? 3
            : event.kind === "status-applied"
              ? 4
              : event.kind === "defeated"
                ? 5
                : 6;
    if (phase < previousPhase) return false;
    previousPhase = phase;

    if (event.kind === "intent") {
      if (ordinal !== 0 || !combatActions.includes(event.action as CombatAction["type"])) return false;
      if (event.action === "guard") {
        if (event.targetId !== null || event.abilityId !== null) return false;
      } else if (
        typeof event.targetId !== "string" ||
        combat.combatants.find((combatant) => combatant.id === event.targetId)?.side === actor.side
      ) return false;
      if (event.action === "ability") {
        if (typeof event.abilityId !== "string" || actor?.abilities.some((ability) => ability.id === event.abilityId) !== true) return false;
      } else if (event.abilityId !== null) return false;
      continue;
    }

    if (event.kind === "status-tick" || event.kind === "status-expired") {
      if (
        event.targetId !== event.actorId || !hasKnownStatus(event.status) ||
        resolvedStatuses.has(event.status) ||
        !isSafeInteger(event.potency, 1) || !isSafeInteger(event.durationBefore, 1, 8) ||
        !isSafeInteger(event.durationAfter, 0, 7) ||
        !isSafeInteger(event.healthBefore) || !isSafeInteger(event.amount) || !isSafeInteger(event.healthAfter) ||
        event.healthBefore > actor.maxHealth || event.healthAfter > actor.maxHealth ||
        event.healthBefore - event.amount !== event.healthAfter ||
        event.amount !== ((event.status === "poisoned" || event.status === "burning")
          ? Math.min(event.potency, event.healthBefore)
          : 0) ||
        (event.kind === "status-tick" && (event.durationBefore < 2 || event.durationAfter !== event.durationBefore - 1)) ||
        (event.kind === "status-expired" && (event.durationBefore !== 1 || event.durationAfter !== 0))
      ) return false;
      resolvedStatuses.add(event.status);
      continue;
    }

    if (event.kind === "mana-spent") {
      const ability = actor.abilities.find((candidate) => candidate.id === event.abilityId);
      if (
        first.action !== "ability" || event.targetId !== event.actorId || typeof event.abilityId !== "string" ||
        event.abilityId !== first.abilityId || ability === undefined ||
        !isSafeInteger(event.manaBefore) || !isSafeInteger(event.amount) || !isSafeInteger(event.manaAfter) ||
        event.manaBefore > actor.maxMana || event.amount !== ability.manaCost ||
        event.manaBefore - event.amount !== event.manaAfter
      ) return false;
      manaCount += 1;
      continue;
    }

    if (event.kind === "damage") {
      const target = combat.combatants.find((combatant) => combatant.id === event.targetId);
      if (
        (first.action !== "attack" && first.action !== "ability") ||
        typeof event.targetId !== "string" || event.targetId !== first.targetId || target?.side === actor.side ||
        event.abilityId !== first.abilityId || typeof event.guarded !== "boolean" || event.critical !== false ||
        !isSafeInteger(event.healthBefore, 1) || !isSafeInteger(event.amount, 1) || !isSafeInteger(event.healthAfter) ||
        event.healthBefore > (target?.maxHealth ?? -1) || event.healthAfter > (target?.maxHealth ?? -1) ||
        event.healthBefore - event.amount !== event.healthAfter
      ) return false;
      damageCount += 1;
      continue;
    }

    if (event.kind === "status-applied") {
      const ability = event.abilityId === null
        ? undefined
        : actor.abilities.find((candidate) => candidate.id === event.abilityId);
      const expectedStatus = ability === undefined ? undefined : appliedStatus(ability);
      const previousLevelStatus = ability === undefined
        ? undefined
        : appliedStatus({ ...ability, level: Math.max(1, ability.level - 1) });
      const isGuard = event.abilityId === null;
      if (
        typeof event.targetId !== "string" || !hasKnownStatus(event.status) ||
        !isSafeInteger(event.potencyAfter, 1) || !isSafeInteger(event.durationAfter, 1, 8) ||
        !((event.potencyBefore === null && event.durationBefore === null) || (
          isSafeInteger(event.potencyBefore, 1) && isSafeInteger(event.durationBefore, 1, 8)
        )) ||
        (isGuard
          ? first.action !== "guard" || event.targetId !== actor.id || event.status !== "guarding" ||
            event.potencyBefore !== null || event.durationBefore !== null ||
            event.potencyAfter !== 50 || event.durationAfter !== 1
          : first.action !== "ability" || event.abilityId !== first.abilityId || event.targetId !== first.targetId ||
            ability === undefined || expectedStatus === undefined || event.status !== expectedStatus.kind ||
            event.durationAfter !== expectedStatus.duration ||
            (event.potencyAfter !== expectedStatus.potency && event.potencyAfter !== previousLevelStatus?.potency))
      ) return false;
      statusAppliedCount += 1;
      continue;
    }

    if (event.kind === "defeated") {
      const causeIndex = packet.findIndex((candidate) => isRecord(candidate) && candidate.id === event.causeEventId);
      const cause = causeIndex < 0 ? undefined : packet[causeIndex];
      if (
        typeof event.targetId !== "string" || typeof event.causeEventId !== "string" ||
        causeIndex < 1 || causeIndex >= ordinal || !isRecord(cause) ||
        (cause.kind !== "damage" && cause.kind !== "status-tick" && cause.kind !== "status-expired") ||
        cause.targetId !== event.targetId || cause.healthAfter !== 0
      ) return false;
      defeatedCount += 1;
      continue;
    }

    outcomeCount += 1;
    if (
      event.targetId !== null || ordinal !== packet.length - 1 || event.id !== finalStreamEventId ||
      !combatOutcomes.includes(event.outcome as CombatState["outcome"]) || event.outcome === "ongoing" ||
      event.outcome !== combat.outcome || turn !== combat.turn
    ) return false;
  }
  const lethalCauses = packet.filter((candidate): candidate is Record<string, unknown> => isRecord(candidate) &&
    (candidate.kind === "damage" || candidate.kind === "status-tick" || candidate.kind === "status-expired") &&
    typeof candidate.healthBefore === "number" && candidate.healthBefore > 0 && candidate.healthAfter === 0
  );
  const actorInterrupted = packet.some((candidate) => isRecord(candidate) && candidate.kind === "defeated" &&
    candidate.targetId === actor.id && lethalCauses.some((cause) => cause.id === candidate.causeEventId && cause.kind !== "damage")
  );
  const intendedAbility = first.action === "ability" && typeof first.abilityId === "string"
    ? actor.abilities.find((ability) => ability.id === first.abilityId)
    : undefined;
  const expectedAppliedStatus = intendedAbility === undefined ? undefined : appliedStatus(intendedAbility);
  const hasCanonicalActionEvents = actorInterrupted
    ? manaCount === 0 && damageCount === 0 && statusAppliedCount === 0
    : first.action === "guard"
      ? manaCount === 0 && damageCount === 0 && statusAppliedCount === 1
      : first.action === "attack"
        ? manaCount === 0 && damageCount === 1 && statusAppliedCount === 0
        : manaCount === 1 && damageCount === 1 && statusAppliedCount === (expectedAppliedStatus === undefined ? 0 : 1);
  return (
    hasCanonicalActionEvents &&
    defeatedCount === lethalCauses.length &&
    outcomeCount <= 1 && manaCount <= 1 && damageCount <= 1 && statusAppliedCount <= 1
  );
}

export function isValidCombatState(value: unknown): value is CombatState {
  if (!isRecord(value) || !Array.isArray(value.combatants) || !Array.isArray(value.turnOrder) || !Array.isArray(value.log)) return false;
  if (!isRecord(value.eventStream) || !Array.isArray(value.eventStream.events)) return false;
  const combat = value as unknown as CombatState;
  const combatantIds = combat.combatants.map((combatant) => combatant.id);
  const combatantIdSet = new Set(combatantIds);
  const turnOrderIds = combat.turnOrder;
  if (
    typeof combat.id !== "string" || combat.id.length === 0 ||
    !isSafeInteger(combat.round, 1, maximumCombatTurns + 1) || !isSafeInteger(combat.turn, 0, maximumCombatTurns) ||
    !isSafeInteger(combat.activeIndex, 0, Math.max(0, combat.turnOrder.length - 1)) ||
    !combatOutcomes.includes(combat.outcome) ||
    combat.combatants.length < 2 || combat.combatants.length > 6 ||
    !combat.combatants.every(isValidCombatant) ||
    combatantIdSet.size !== combatantIds.length ||
    turnOrderIds.length !== combatantIds.length || new Set(turnOrderIds).size !== turnOrderIds.length ||
    !turnOrderIds.every((id) => typeof id === "string" && combatantIdSet.has(id)) ||
    combat.log.length > maximumCombatLogEntries || !combat.log.every((entry) => isValidCombatLogEntry(entry, combat, combatantIdSet)) ||
    combat.eventStream.schemaVersion !== 1 || !isSafeInteger(combat.eventStream.firstRecordedTurn, 1, combat.turn + 1) ||
    combat.eventStream.events.length > maximumCombatEvents
  ) return false;

  const expectedOutcome = result(combat.combatants, combat.turn);
  if (expectedOutcome !== combat.outcome) return false;
  if (combat.outcome === "ongoing") {
    const activeId = combat.turnOrder[combat.activeIndex];
    if (combat.combatants.find((combatant) => combatant.id === activeId)?.health === 0) return false;
  }

  const packets = new Map<number, unknown[]>();
  let previousTurn = -1;
  let previousOrdinal = -1;
  for (const event of combat.eventStream.events) {
    if (!isRecord(event) || !isSafeInteger(event.turn) || !isSafeInteger(event.ordinal)) return false;
    if (event.turn < previousTurn || (event.turn === previousTurn && event.ordinal <= previousOrdinal)) return false;
    previousTurn = event.turn;
    previousOrdinal = event.ordinal;
    const packet = packets.get(event.turn) ?? [];
    packet.push(event);
    packets.set(event.turn, packet);
  }
  const finalStreamEvent = combat.eventStream.events.at(-1);
  const retainedTurns = [...packets.keys()];
  if (retainedTurns.length > 0 && (
    retainedTurns.at(-1) !== combat.turn ||
    retainedTurns.some((turn, index) => index > 0 && turn !== (retainedTurns[index - 1] ?? 0) + 1)
  )) return false;
  if (![...packets.values()].every((packet) => isValidCombatEventPacket(
    packet,
    combat,
    combatantIdSet,
    isRecord(finalStreamEvent) && typeof finalStreamEvent.id === "string" ? finalStreamEvent.id : undefined,
  ))) return false;

  if (combat.eventStream.events.length > 0) {
    const lastEvent = combat.eventStream.events.at(-1);
    if (!isRecord(lastEvent)) return false;
    if (combat.outcome === "ongoing" && lastEvent.kind === "outcome") return false;
    if (combat.outcome !== "ongoing" && lastEvent.turn === combat.turn && lastEvent.kind !== "outcome") return false;
  }
  return true;
}
