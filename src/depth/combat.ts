import { pick, randomInt } from "../core/rng";
import { derivedStats } from "./rpg";
import type { CombatAction, CombatLogEntry, CombatState, CombatStatus, CombatantState, DetailedHeroState } from "./types";

export const maximumCombatTurns = 128;
export const maximumCombatLogEntries = 96;

const enemies = ["Lantern Wolf", "Mossback Brute", "River Wyrmling", "Inkcap Mimic", "Copperhorn"] as const;

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
  }];
  const count = clampEnemyCount(requestedEnemyCount);
  for (let index = 0; index < count; index += 1) {
    const id = `${encounterId}:enemy:${index}`;
    const danger = 4 + hero.level + randomInt(4, seed, "combat", id, 0, "danger");
    combatants.push({
      id,
      name: `${pick(enemies, seed, "combat", id, 0, "species")} ${index + 1}`,
      side: "enemies",
      health: 12 + danger * 2,
      maxHealth: 12 + danger * 2,
      mana: 0,
      maxMana: 0,
      power: 4 + danger,
      armor: Math.floor(danger / 3),
      initiative: 7 + randomInt(12, seed, "combat", id, 0, "initiative"),
      statuses: [],
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
    if (status.kind === "poisoned") {
      health = Math.max(0, health - status.potency);
      prepared = { ...prepared, log: appendLog(prepared.log, { turn: combat.turn + 1, actorId: actor.id, action: "status", message: `${actor.name} suffers poison.`, amount: status.potency }) };
    }
    if (status.kind !== "guarding" && status.duration > 1) nextStatuses.push({ ...status, duration: status.duration - 1 });
  }
  const updated = { ...actor, health, statuses: nextStatuses };
  return { combat: { ...prepared, combatants: withCombatant(prepared.combatants, updated) }, actor: updated };
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
    actor = { ...actor, statuses: [...actor.statuses.filter((status) => status.kind !== "guarding"), guardStatus].slice(-8) };
    combat = { ...combat, combatants: withCombatant(combat.combatants, actor), log: appendLog(combat.log, { turn, actorId: actor.id, action: "guard", message: `${actor.name} braces behind a careful guard.`, amount: 0 }) };
  } else if (actor.health > 0) {
    const target = targetForAction(combat, action, actor);
    const skill = action.type === "skill" && actor.mana >= 3;
    const variance = randomInt(5, seed, "combat-resolution", combat.id, turn, `${actor.id}:${target.id}`);
    const guarding = target.statuses.some((status) => status.kind === "guarding");
    const rawDamage = actor.power + variance + (skill ? 4 : 0) - Math.floor(target.armor / 2);
    const damage = Math.max(1, Math.floor(rawDamage * (guarding ? 0.5 : 1)));
    const poison: CombatStatus[] = skill ? [{ kind: "poisoned", duration: 2, potency: 2 }] : [];
    const updatedTarget: CombatantState = { ...target, health: Math.max(0, target.health - damage), statuses: [...target.statuses, ...poison].slice(-8) };
    actor = skill ? { ...actor, mana: actor.mana - 3 } : actor;
    combat = {
      ...combat,
      combatants: withCombatant(withCombatant(combat.combatants, updatedTarget), actor),
      log: appendLog(combat.log, { turn, actorId: actor.id, action: skill ? "skill" : "attack", message: `${actor.name} ${skill ? "unleashes a venomous technique on" : "strikes"} ${target.name} for ${damage}.`, amount: damage }),
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
  if (actor.side === "heroes" && actor.health * 3 < actor.maxHealth && combat.turn % 4 === 1) return { actorId: actor.id, type: "guard", targetId: null };
  return { actorId: actor.id, type: actor.side === "heroes" && actor.mana >= 3 && combat.turn % 3 === 0 ? "skill" : "attack", targetId: target.id };
}
