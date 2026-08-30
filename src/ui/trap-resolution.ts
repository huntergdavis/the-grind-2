import type { ChronicleEntry, WorldState } from "../core/types";
import {
  dungeonTrapAt,
  generateDungeon,
  moveDungeon,
  resolveDungeonTrap,
  resolveDungeonTrapCheck,
} from "../depth/dungeon";
import { effectiveAttribute, progressQuest } from "../depth/rpg";
import type {
  AttributeName,
  DungeonState,
  MazeDirection,
  DungeonTrapKind,
  DungeonTrapPhase,
  ObjectiveStatus,
  QuestObjective,
} from "../depth/types";

export type TrapResolutionCommandType = "enter-dungeon" | "move-dungeon" | "disarm-dungeon-trap";
export type TrapResolutionStage = "detect" | "disarm";

export interface TrapResolutionPacket {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly commandId: string;
  readonly commandType: TrapResolutionCommandType;
  readonly heroId: string;
  readonly dungeonId: string;
  readonly cellId: string;
  readonly trapKind: DungeonTrapKind;
  readonly phaseBefore: DungeonTrapPhase;
  readonly phaseAfter: DungeonTrapPhase;
  readonly stage: TrapResolutionStage;
  readonly attribute: Extract<AttributeName, "agility" | "intellect" | "spirit">;
  readonly skill: number;
  readonly roll: number;
  readonly total: number;
  readonly difficulty: number;
  readonly success: boolean;
  readonly healthBefore: number;
  readonly damage: number;
  readonly healthAfter: number;
  readonly maxHealth: number;
  readonly dungeonCompletedBefore: boolean;
  readonly dungeonCompletedAfter: boolean;
  readonly completedExit: boolean;
  readonly crossMazeBefore: number;
  readonly crossMazeAfter: number;
  readonly crossMazeDelta: number;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function crossMazeObjective(state: WorldState): QuestObjective | null {
  const direct = state.depth.quest.objectives.find((objective) => objective.id === "quest:cross-maze");
  if (direct !== undefined) return direct;
  for (const subquest of state.depth.quest.subquests) {
    const nested = subquest.objectives.find((objective) => objective.id === "quest:cross-maze");
    if (nested !== undefined) return nested;
  }
  return null;
}

function validObjective(objective: QuestObjective): boolean {
  const statuses: readonly ObjectiveStatus[] = ["active", "complete", "failed"];
  return Number.isSafeInteger(objective.current)
    && Number.isSafeInteger(objective.target)
    && objective.current >= 0
    && objective.target > 0
    && objective.current <= objective.target
    && statuses.includes(objective.status);
}

function sameDungeonIdentity(before: DungeonState, after: DungeonState): boolean {
  return before.id === after.id
    && before.name === after.name
    && before.layoutVersion === after.layoutVersion
    && before.width === after.width
    && before.height === after.height
    && before.entryCellId === after.entryCellId
    && before.exitCellId === after.exitCellId
    && sameJson(before.cells, after.cells);
}

function changedTrapCell(before: DungeonState, after: DungeonState): string | null {
  if (before.traps.length !== after.traps.length) return null;
  let changed: string | null = null;
  for (const trap of before.traps) {
    const next = after.traps.find((candidate) => candidate.cellId === trap.cellId);
    if (next === undefined
      || next.kind !== trap.kind
      || next.detectDifficulty !== trap.detectDifficulty
      || next.disarmDifficulty !== trap.disarmDifficulty) return null;
    if (next.phase !== trap.phase) {
      if (changed !== null) return null;
      changed = trap.cellId;
    }
  }
  return changed;
}

function generatedEntryBefore(before: WorldState, after: DungeonState): DungeonState | null {
  if (before.depth.dungeon !== null && !before.depth.dungeon.completed) return null;
  try {
    const generated = generateDungeon(before.depth.seed, after.id, after.width, after.height, true);
    return sameDungeonIdentity(generated, after) ? generated : null;
  } catch {
    return null;
  }
}

function movementDirection(before: DungeonState, cellId: string): MazeDirection | null {
  const from = before.cells.find((candidate) => candidate.id === before.currentCellId);
  const to = before.cells.find((candidate) => candidate.id === cellId);
  if (from === undefined || to === undefined) return null;
  if (to.x === from.x && to.y === from.y - 1) return "north";
  if (to.x === from.x + 1 && to.y === from.y) return "east";
  if (to.x === from.x && to.y === from.y + 1) return "south";
  if (to.x === from.x - 1 && to.y === from.y) return "west";
  return null;
}

function sameTraversalResult(expected: DungeonState, actual: DungeonState): boolean {
  return expected.currentCellId === actual.currentCellId
    && sameJson(expected.visitedCellIds, actual.visitedCellIds)
    && sameJson(expected.discoveredCellIds, actual.discoveredCellIds)
    && sameJson(expected.keyGate, actual.keyGate)
    && sameJson(expected.latestShrineUse, actual.latestShrineUse)
    && expected.turns === actual.turns;
}

function isTrapCommand(commandType: ChronicleEntry["commandType"]): commandType is TrapResolutionCommandType {
  return commandType === "enter-dungeon"
    || commandType === "move-dungeon"
    || commandType === "disarm-dungeon-trap";
}

function safeWorldPair(before: WorldState, after: WorldState, source: ChronicleEntry): boolean {
  if (before.campaignId !== after.campaignId
    || before.seed !== after.seed
    || before.hero.id !== after.hero.id
    || before.depth.seed !== after.depth.seed
    || before.depth.hero.id !== after.depth.hero.id
    || before.depth.hero.id !== before.hero.id
    || after.depth.hero.id !== after.hero.id
    || after.tick !== before.tick + 1
    || after.depth.tick !== before.depth.tick + 1
    || after.tick !== after.depth.tick
    || source.tick !== after.tick
    || source.id !== `${after.campaignId}:${after.tick}`
    || typeof source.commandId !== "string"
    || source.commandId.length === 0
    || !isTrapCommand(source.commandType)
    || before.chronicle.some((entry) => entry.id === source.id)
    || after.chronicle.filter((entry) => entry.id === source.id).length !== 1) return false;
  const latest = after.chronicle.at(-1);
  return latest !== undefined && sameJson(latest, source);
}

export function projectTrapResolution(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): TrapResolutionPacket | null {
  if (!safeWorldPair(before, after, source)) return null;
  const commandType = source.commandType;
  const commandId = source.commandId;
  if (!isTrapCommand(commandType) || typeof commandId !== "string") return null;

  const afterDungeon = after.depth.dungeon;
  if (afterDungeon === null) return null;
  const beforeDungeon = commandType === "enter-dungeon"
    ? generatedEntryBefore(before, afterDungeon)
    : before.depth.dungeon;
  if (beforeDungeon === null || !sameDungeonIdentity(beforeDungeon, afterDungeon)) return null;

  const cellId = changedTrapCell(beforeDungeon, afterDungeon);
  if (cellId === null || afterDungeon.currentCellId !== cellId) return null;
  const trapBefore = dungeonTrapAt(beforeDungeon, cellId);
  const trapAfter = dungeonTrapAt(afterDungeon, cellId);
  if (trapBefore === null || trapAfter === null) return null;
  const cell = afterDungeon.cells.find((candidate) => candidate.id === cellId);
  if (cell?.feature !== "trap") return null;
  if (!Number.isSafeInteger(trapBefore.detectDifficulty)
    || trapBefore.detectDifficulty < 10 || trapBefore.detectDifficulty > 14
    || !Number.isSafeInteger(trapBefore.disarmDifficulty)
    || trapBefore.disarmDifficulty < 11 || trapBefore.disarmDifficulty > 16) return null;

  const stage: TrapResolutionStage = commandType === "disarm-dungeon-trap" ? "disarm" : "detect";
  if (commandType === "enter-dungeon") {
    if (cellId !== afterDungeon.entryCellId
      || beforeDungeon.currentCellId !== cellId
      || !sameTraversalResult(beforeDungeon, afterDungeon)) return null;
  } else if (commandType === "move-dungeon") {
    const direction = movementDirection(beforeDungeon, cellId);
    if (direction === null || beforeDungeon.visitedCellIds.includes(cellId)) return null;
    try {
      if (!sameTraversalResult(moveDungeon(beforeDungeon, direction), afterDungeon)) return null;
    } catch {
      return null;
    }
  } else if (beforeDungeon.currentCellId !== cellId
    || !sameTraversalResult(beforeDungeon, afterDungeon)) return null;

  if ((stage === "detect" && trapBefore.phase !== "hidden")
    || (stage === "disarm" && trapBefore.phase !== "detected")) return null;

  let check;
  try {
    check = resolveDungeonTrapCheck(beforeDungeon, cellId, stage, {
      agility: effectiveAttribute(before.depth.hero, "agility"),
      intellect: effectiveAttribute(before.depth.hero, "intellect"),
      spirit: effectiveAttribute(before.depth.hero, "spirit"),
      level: before.depth.hero.level,
    }, before.seed);
  } catch {
    return null;
  }
  const expectedPhase: DungeonTrapPhase = check.success
    ? stage === "detect" ? "detected" : "disarmed"
    : "triggered";
  if (trapAfter.phase !== expectedPhase) return null;

  const healthBefore = before.depth.hero.resources.health;
  const healthAfter = after.depth.hero.resources.health;
  const maxHealth = before.depth.hero.resources.maxHealth;
  if (![healthBefore, healthAfter, maxHealth].every(Number.isSafeInteger)
    || healthBefore < 0 || healthAfter < 0 || maxHealth <= 0
    || healthBefore > maxHealth || healthAfter > maxHealth
    || after.depth.hero.resources.maxHealth !== maxHealth
    || before.hero.health !== healthBefore || after.hero.health !== healthAfter
    || before.hero.maxHealth !== maxHealth || after.hero.maxHealth !== maxHealth) return null;

  let damage = 0;
  if (check.success) {
    if (healthAfter !== healthBefore) return null;
  } else {
    const consequence = resolveDungeonTrap(beforeDungeon, cellId, true, healthBefore, maxHealth);
    if (consequence === null
      || consequence.healthBefore !== healthBefore
      || consequence.healthAfter !== healthAfter) return null;
    damage = consequence.damage;
  }

  const completedExit = !beforeDungeon.completed && afterDungeon.completed;
  const shouldComplete = cellId === afterDungeon.exitCellId && expectedPhase !== "detected";
  if (afterDungeon.completed !== (beforeDungeon.completed || shouldComplete)
    || completedExit !== shouldComplete) return null;

  const crossMazeBefore = crossMazeObjective(before);
  const crossMazeAfter = crossMazeObjective(after);
  if (crossMazeBefore === null || crossMazeAfter === null
    || !validObjective(crossMazeBefore) || !validObjective(crossMazeAfter)
    || crossMazeBefore.id !== crossMazeAfter.id
    || crossMazeBefore.target !== crossMazeAfter.target) return null;
  const expectedQuest = completedExit
    ? progressQuest(before.depth.quest, "quest:cross-maze", 1)
    : before.depth.quest;
  if (!sameJson(after.depth.quest, expectedQuest)) return null;
  const crossMazeDelta = crossMazeAfter.current - crossMazeBefore.current;
  if (!Number.isSafeInteger(crossMazeDelta) || crossMazeDelta < 0 || crossMazeDelta > 1) return null;

  return Object.freeze({
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    commandId,
    commandType,
    heroId: before.hero.id,
    dungeonId: afterDungeon.id,
    cellId,
    trapKind: trapBefore.kind,
    phaseBefore: trapBefore.phase,
    phaseAfter: trapAfter.phase,
    stage,
    attribute: check.attribute,
    skill: check.skill,
    roll: check.roll,
    total: check.total,
    difficulty: check.difficulty,
    success: check.success,
    healthBefore,
    damage,
    healthAfter,
    maxHealth,
    dungeonCompletedBefore: beforeDungeon.completed,
    dungeonCompletedAfter: afterDungeon.completed,
    completedExit,
    crossMazeBefore: crossMazeBefore.current,
    crossMazeAfter: crossMazeAfter.current,
    crossMazeDelta,
  });
}
