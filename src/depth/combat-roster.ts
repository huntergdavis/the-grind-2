import { projectLatestCombatTurn, type CombatTurnSummary } from "./combat-turn";
import type { CombatState, CombatStatus, CombatantState } from "./types";

export type CombatFocusKind = "action-target" | "self-effect" | "none";

export interface CombatRosterStatus {
  kind: CombatStatus["kind"];
  duration: number;
  potency: number;
}

export interface CombatRosterUnit {
  id: string;
  name: string;
  side: CombatantState["side"];
  alive: boolean;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  initiative: number;
  turnOrderIndex: number;
  statuses: readonly CombatRosterStatus[];
  isActive: boolean;
  actedLast: boolean;
  wasIntentTarget: boolean;
  isFocused: boolean;
  defeatedLastTurn: boolean;
}

export interface UpcomingCombatTurn {
  slot: 1 | 2 | 3;
  unitId: string;
  unitName: string;
  side: CombatantState["side"];
  turnOrderIndex: number;
  round: number;
}

export interface CombatRosterProjection {
  combatId: string;
  round: number;
  turn: number;
  outcome: CombatState["outcome"];
  activeUnitId: string | null;
  intentTargetId: string | null;
  focusTargetId: string | null;
  focusKind: CombatFocusKind;
  units: readonly CombatRosterUnit[];
  upcomingTurns: readonly UpcomingCombatTurn[];
  latestTurn: CombatTurnSummary | null;
}

function hasCanonicalRosterStructure(combat: CombatState): boolean {
  if (
    combat.combatants.length === 0 ||
    combat.turnOrder.length !== combat.combatants.length ||
    !Number.isSafeInteger(combat.activeIndex) ||
    combat.activeIndex < 0 ||
    combat.activeIndex >= combat.turnOrder.length
  ) return false;
  const combatantIds = new Set(combat.combatants.map((unit) => unit.id));
  const orderIds = new Set(combat.turnOrder);
  if (combatantIds.size !== combat.combatants.length || orderIds.size !== combat.turnOrder.length) return false;
  if (combat.turnOrder.some((id) => !combatantIds.has(id))) return false;
  if (combat.outcome !== "ongoing") return true;
  const activeId = combat.turnOrder[combat.activeIndex];
  return (combat.combatants.find((unit) => unit.id === activeId)?.health ?? 0) > 0;
}

function nextLivingTurns(
  combat: CombatState,
  unitsById: ReadonlyMap<string, CombatantState>,
): readonly UpcomingCombatTurn[] {
  if (combat.outcome !== "ongoing") return [];
  const projected: UpcomingCombatTurn[] = [];
  let cursor = combat.activeIndex;
  let round = combat.round;
  for (const slot of [1, 2, 3] as const) {
    if (slot > 1) {
      let found = false;
      for (let offset = 1; offset <= combat.turnOrder.length; offset += 1) {
        const candidateIndex = (cursor + offset) % combat.turnOrder.length;
        const candidateId = combat.turnOrder[candidateIndex];
        if (candidateId !== undefined && (unitsById.get(candidateId)?.health ?? 0) > 0) {
          if (candidateIndex <= cursor) round += 1;
          cursor = candidateIndex;
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    const unitId = combat.turnOrder[cursor];
    const unit = unitId === undefined ? undefined : unitsById.get(unitId);
    if (unit === undefined || unit.health <= 0) break;
    projected.push({
      slot,
      unitId: unit.id,
      unitName: unit.name,
      side: unit.side,
      turnOrderIndex: cursor,
      round,
    });
  }
  return projected;
}

function focusForLatestTurn(latestTurn: CombatTurnSummary | null): {
  intentTargetId: string | null;
  focusTargetId: string | null;
  focusKind: CombatFocusKind;
} {
  if (latestTurn === null) return { intentTargetId: null, focusTargetId: null, focusKind: "none" };
  const intentTargetId = latestTurn.action === "guard" ? null : latestTurn.targetId;
  if (latestTurn.intentInterrupted) {
    return { intentTargetId, focusTargetId: latestTurn.actorId, focusKind: "self-effect" };
  }
  if (latestTurn.restorative !== null) {
    return { intentTargetId, focusTargetId: latestTurn.actorId, focusKind: "self-effect" };
  }
  if (latestTurn.damage?.targetId !== undefined && latestTurn.damage.targetId !== null) {
    return { intentTargetId, focusTargetId: latestTurn.damage.targetId, focusKind: "action-target" };
  }
  const applied = latestTurn.statusEvents.find((event) => event.kind === "status-applied");
  if (applied?.targetId !== undefined && applied.targetId !== null) {
    return {
      intentTargetId,
      focusTargetId: applied.targetId,
      focusKind: latestTurn.action === "guard" ? "self-effect" : "action-target",
    };
  }
  if (latestTurn.targetId !== null) {
    return { intentTargetId, focusTargetId: latestTurn.targetId, focusKind: "action-target" };
  }
  return { intentTargetId, focusTargetId: null, focusKind: "none" };
}

export function projectCombatRoster(combat: CombatState): CombatRosterProjection | null {
  if (!hasCanonicalRosterStructure(combat)) return null;
  const unitsById = new Map(combat.combatants.map((unit) => [unit.id, unit]));
  const turnOrderIndexById = new Map(combat.turnOrder.map((id, index) => [id, index]));
  const latestTurn = projectLatestCombatTurn(combat);
  const focus = focusForLatestTurn(latestTurn);
  const activeUnitId = combat.outcome === "ongoing" ? combat.turnOrder[combat.activeIndex] ?? null : null;
  const defeatedIds = new Set(latestTurn?.defeatedIds ?? []);
  const units = [...combat.combatants].sort((left, right) => {
    const sideOrder = (left.side === "heroes" ? 0 : 1) - (right.side === "heroes" ? 0 : 1);
    return sideOrder || (turnOrderIndexById.get(left.id) ?? -1) - (turnOrderIndexById.get(right.id) ?? -1);
  }).map((unit): CombatRosterUnit => ({
    id: unit.id,
    name: unit.name,
    side: unit.side,
    alive: unit.health > 0,
    health: unit.health,
    maxHealth: unit.maxHealth,
    mana: unit.mana,
    maxMana: unit.maxMana,
    initiative: unit.initiative,
    turnOrderIndex: turnOrderIndexById.get(unit.id) ?? -1,
    statuses: unit.statuses.map((status) => ({
      kind: status.kind,
      duration: status.duration,
      potency: status.potency,
    })),
    isActive: unit.id === activeUnitId,
    actedLast: unit.id === latestTurn?.actorId,
    wasIntentTarget: unit.id === focus.intentTargetId,
    isFocused: unit.id === focus.focusTargetId,
    defeatedLastTurn: defeatedIds.has(unit.id),
  }));
  return {
    combatId: combat.id,
    round: combat.round,
    turn: combat.turn,
    outcome: combat.outcome,
    activeUnitId,
    ...focus,
    units,
    upcomingTurns: nextLivingTurns(combat, unitsById),
    latestTurn,
  };
}
