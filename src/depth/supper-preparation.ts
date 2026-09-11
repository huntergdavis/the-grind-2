import type { CombatState, CombatTurnEvent } from "./types";

export interface SupperDamageReceipt {
  readonly rulesVersion: "road-supper-v1";
  readonly mealSourceCommandId: string;
  readonly turn: number;
  readonly damageEventId: string;
  readonly healthBefore: number;
  /** Ordinary resolved damage, including a stronger Guard if present. */
  readonly damageBefore: number;
  readonly damageAfter: number;
  /** Actual HP saved after health clamping, not hypothetical overkill. */
  readonly prevented: number;
  readonly guarded: boolean;
}

export interface CombatSupperPreparation {
  readonly schemaVersion: 1;
  readonly rulesVersion: "road-supper-v1";
  readonly heroId: string;
  readonly mealSourceCommandId: string;
  readonly mealTick: number;
  readonly spent: SupperDamageReceipt | null;
}

export function createCombatSupperPreparation(heroId: string, mealSourceCommandId: string, mealTick: number): CombatSupperPreparation {
  return { schemaVersion: 1, rulesVersion: "road-supper-v1", heroId, mealSourceCommandId, mealTick, spent: null };
}

export function hasReadySupper(combat: CombatState, targetId: string | null): boolean {
  return combat.outcome === "ongoing" && combat.supper?.spent === null && combat.supper.heroId === targetId;
}

/** Stronger Guard wins; the first direct hit still consumes the preparation. */
export function resolveSupperDamage(normalResolvedDamage: number, guarded: boolean): number {
  return guarded ? normalResolvedDamage : Math.max(1, Math.floor(normalResolvedDamage * 0.75));
}

function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
const receiptKeys = ["rulesVersion", "mealSourceCommandId", "turn", "damageEventId", "healthBefore",
  "damageBefore", "damageAfter", "prevented", "guarded"];

export function isValidCombatSupper(combat: CombatState): boolean {
  try {
    const hits = combat.eventStream.events.filter((event): event is Extract<CombatTurnEvent, { kind: "damage" }> => event.kind === "damage");
    if (!Object.hasOwn(combat, "supper")) return hits.every(event => !Object.hasOwn(event, "supper"));
    const p = combat.supper;
    if (!keys(p, ["schemaVersion", "rulesVersion", "heroId", "mealSourceCommandId", "mealTick", "spent"])
      || p.schemaVersion !== 1 || p.rulesVersion !== "road-supper-v1" || typeof p.heroId !== "string"
      || !integer(p.mealTick, 1) || p.mealSourceCommandId !== `depth:${p.mealTick}:road-supper:${combat.id}`) return false;
    const heroes = combat.combatants.filter(unit => unit.side === "heroes");
    if (heroes.length !== 1 || heroes[0]!.id !== p.heroId) return false;
    const incoming = hits.filter(event => event.targetId === p.heroId);
    const marked = hits.filter(event => Object.hasOwn(event, "supper"));
    if (p.spent === null) return incoming.length === 0 && marked.length === 0;
    const spent = p.spent;
    if (!keys(spent, receiptKeys) || spent.rulesVersion !== "road-supper-v1" || spent.mealSourceCommandId !== p.mealSourceCommandId
      || !integer(spent.turn, 1) || spent.turn > combat.turn || typeof spent.damageEventId !== "string"
      || !integer(spent.healthBefore, 1) || spent.healthBefore > heroes[0]!.maxHealth
      || !integer(spent.damageBefore, 1) || !integer(spent.damageAfter, 1) || !integer(spent.prevented)
      || typeof spent.guarded !== "boolean" || spent.damageAfter !== resolveSupperDamage(spent.damageBefore, spent.guarded)
      || spent.prevented !== Math.min(spent.healthBefore, spent.damageBefore) - Math.min(spent.healthBefore, spent.damageAfter)) return false;
    // Match the existing twelve-event turn packet even after its history is pruned.
    if (!Array.from({ length: 12 }, (_, ordinal) => `${combat.id}:${spent.turn}:${ordinal}`).includes(spent.damageEventId)) return false;
    if (incoming.some(event => event.turn < spent.turn)) return false;
    if (spent.turn < combat.eventStream.firstRecordedTurn) return marked.length === 0;
    const event = incoming.find(hit => hit.id === spent.damageEventId);
    return event !== undefined && marked.length === 1 && event === marked[0] && event.turn === spent.turn && event.guarded === spent.guarded
      && event.healthBefore === spent.healthBefore && event.amount === Math.min(spent.healthBefore, spent.damageAfter)
      && keys(event.supper, receiptKeys) && receiptKeys.every(key => event.supper![key as keyof SupperDamageReceipt] === spent[key]);
  } catch { return false; }
}
