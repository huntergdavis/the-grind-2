import { randomInt } from "../core/rng";
import { abilityExperienceFloor, derivedStats, gainAbilityExperience } from "./rpg";
import type { AbilityState, CombatAction, CombatLogEntry, CombatState, CombatStatus, CombatantState, DetailedHeroState } from "./types";

export const maximumCombatTurns = 128;
export const maximumCombatLogEntries = 96;

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
  return { id: encounterId, round: 1, turn: 0, activeIndex: 0, turnOrder, combatants, outcome: "ongoing", log: [] };
}

function targetForAction(combat: CombatState, action: CombatAction, actor: CombatantState): CombatantState {
  if (action.targetId === null) throw new Error("This combat action needs a target");
  const target = combat.combatants.find((combatant) => combatant.id === action.targetId);
  if (target === undefined || target.health <= 0) throw new Error("Combat target is unavailable");
  if (target.side === actor.side) throw new Error("Hostile actions cannot target an ally");
  return target;
}

function prepareTurn(combat: CombatState, actor: CombatantState): { combat: CombatState; actor: CombatantState } {
  let health = actor.health;
  const nextStatuses: CombatStatus[] = [];
  let prepared = combat;
  for (const status of actor.statuses) {
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
    if (status.kind !== "guarding" && status.duration > 1) nextStatuses.push({ ...status, duration: status.duration - 1 });
  }
  const updated = { ...actor, health, statuses: nextStatuses };
  return { combat: { ...prepared, combatants: withCombatant(prepared.combatants, updated) }, actor: updated };
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
  let { combat, actor } = prepareTurn(input, active);
  const turn = input.turn + 1;

  if (actor.health > 0 && action.type === "guard") {
    const guardStatus: CombatStatus = { kind: "guarding", duration: 1, potency: 50 };
    actor = { ...actor, statuses: addOrRefreshStatus(actor.statuses, guardStatus) };
    combat = {
      ...combat,
      combatants: withCombatant(combat.combatants, actor),
      log: appendLog(combat.log, { turn, actorId: actor.id, action: "guard", targetId: actor.id, abilityId: null, message: `${actor.name} braces behind a careful guard.`, amount: 0 }),
    };
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
    const updatedTarget: CombatantState = {
      ...target,
      health: Math.max(0, target.health - damage),
      statuses: addOrRefreshStatus(target.statuses, selected === undefined ? undefined : appliedStatus(selected)),
    };
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
  }

  const outcome = result(combat.combatants, turn);
  if (outcome !== "ongoing") return { ...combat, turn, outcome };
  const next = nextLivingIndex(combat, input.activeIndex);
  return { ...combat, turn, outcome, activeIndex: next.index, round: input.round + (next.wrapped ? 1 : 0) };
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
