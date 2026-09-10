import type { ChronicleEntry, WorldState } from "../core/types";
import {
  dungeonTrapAt,
  dungeonTrapCheckAttribute,
  createDungeonDisarmKitUse,
  generateDungeon,
  moveDungeon,
  resolveDungeonTrap,
  resolveDungeonTrapCheck,
  resolveDungeonDisarmCheck,
} from "../depth/dungeon";
import { disarmingKitId, selectDisarmingKit } from "../depth/disarming-kit";
import { applyQuestProgressFact, effectiveAttribute, heroMechanicalLevel, isValidQuestObjectiveRule } from "../depth/rpg";
import { isQuestLeadDungeon } from "../depth/quest-lead";
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

export interface TrapResolutionPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly commandId: string;
  readonly commandType: TrapResolutionCommandType;
  readonly heroId: string;
  readonly dungeonId: string;
  readonly cellId: string;
  readonly trapKind: Exclude<DungeonTrapKind, "mana-siphon">;
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

export interface TrapResolutionPacketV2 extends Omit<TrapResolutionPacketV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly tool: {
    readonly itemId: string;
    readonly bonus: 2;
    readonly quantityBefore: 1;
    readonly quantityAfter: 0;
  };
}

export interface TrapResolutionPacketV3 extends Omit<TrapResolutionPacketV1, "schemaVersion" | "trapKind"> {
  readonly schemaVersion: 3;
  readonly trapKind: "mana-siphon";
  readonly manaBefore: number;
  readonly manaLost: number;
  readonly manaAfter: number;
  readonly maxMana: number;
  readonly tool: TrapResolutionPacketV2["tool"] | null;
}

export type TrapResolutionPacket = TrapResolutionPacketV1 | TrapResolutionPacketV2 | TrapResolutionPacketV3;

const trapResolutionPacketKeys = Object.freeze([
  "schemaVersion", "eventId", "tick", "commandId", "commandType", "heroId", "dungeonId", "cellId",
  "trapKind", "phaseBefore", "phaseAfter", "stage", "attribute", "skill", "roll", "total", "difficulty",
  "success", "healthBefore", "damage", "healthAfter", "maxHealth", "dungeonCompletedBefore",
  "dungeonCompletedAfter", "completedExit", "crossMazeBefore", "crossMazeAfter", "crossMazeDelta",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

/** Accepts only the exact, internally consistent packet shape emitted by projectTrapResolution. */
export function isTrapResolutionPacket(value: unknown): value is TrapResolutionPacket {
  if (!isRecord(value) || !hasExactKeys(value, value.schemaVersion === 3
    ? [...trapResolutionPacketKeys, "tool", "manaBefore", "manaLost", "manaAfter", "maxMana"]
    : value.schemaVersion === 2 ? [...trapResolutionPacketKeys, "tool"] : trapResolutionPacketKeys)) return false;
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)
    || !nonEmptyString(value.eventId)
    || !safeInteger(value.tick)
    || !nonEmptyString(value.commandId)
    || !["enter-dungeon", "move-dungeon", "disarm-dungeon-trap"].includes(String(value.commandType))
    || !nonEmptyString(value.heroId)
    || !nonEmptyString(value.dungeonId)
    || !nonEmptyString(value.cellId)
    || (value.schemaVersion === 3 ? value.trapKind !== "mana-siphon"
      : !["tripwire", "rune-ward"].includes(String(value.trapKind)))
    || !["hidden", "detected", "disarmed", "triggered"].includes(String(value.phaseBefore))
    || !["hidden", "detected", "disarmed", "triggered"].includes(String(value.phaseAfter))
    || !["detect", "disarm"].includes(String(value.stage))
    || !["agility", "intellect", "spirit"].includes(String(value.attribute))
    || !safeInteger(value.skill)
    || !safeInteger(value.roll) || value.roll > 3
    || !safeInteger(value.total)
    || !safeInteger(value.difficulty)
    || typeof value.success !== "boolean"
    || !safeInteger(value.healthBefore)
    || !safeInteger(value.damage)
    || !safeInteger(value.healthAfter)
    || !safeInteger(value.maxHealth, 1)
    || typeof value.dungeonCompletedBefore !== "boolean"
    || typeof value.dungeonCompletedAfter !== "boolean"
    || typeof value.completedExit !== "boolean"
    || !safeInteger(value.crossMazeBefore)
    || !safeInteger(value.crossMazeAfter)
    || !safeInteger(value.crossMazeDelta)) return false;

  const packet = value as unknown as TrapResolutionPacket;
  const tool = packet.schemaVersion === 1 ? null : packet.tool;
  if (packet.schemaVersion === 2 && tool === null) return false;
  if (tool !== null && (packet.stage !== "disarm" || !isRecord(tool)
    || !hasExactKeys(tool, ["itemId", "bonus", "quantityBefore", "quantityAfter"])
    || packet.heroId.length > 400 || tool.itemId !== disarmingKitId(packet.heroId)
    || tool.bonus !== 2 || tool.quantityBefore !== 1 || tool.quantityAfter !== 0)) return false;
  if (packet.schemaVersion === 3 && (!safeInteger(packet.manaBefore) || !safeInteger(packet.manaLost)
    || !safeInteger(packet.manaAfter) || !safeInteger(packet.maxMana)
    || packet.manaBefore > packet.maxMana || packet.manaAfter > packet.maxMana
    || packet.manaAfter !== packet.manaBefore - packet.manaLost
    || packet.manaLost !== (packet.success ? 0 : Math.min(packet.manaBefore, Math.ceil(packet.maxMana / 4)))
    || packet.damage !== 0 || packet.healthAfter !== packet.healthBefore)) return false;
  const expectedStage = packet.commandType === "disarm-dungeon-trap" ? "disarm" : "detect";
  const expectedPhaseAfter: DungeonTrapPhase = packet.success
    ? packet.stage === "detect" ? "detected" : "disarmed"
    : "triggered";
  const expectedDifficultyRange = packet.stage === "detect" ? [10, 14] : [11, 16];
  return packet.stage === expectedStage
    && packet.phaseBefore === (packet.stage === "detect" ? "hidden" : "detected")
    && packet.phaseAfter === expectedPhaseAfter
    && packet.attribute === dungeonTrapCheckAttribute(packet.trapKind, packet.stage)
    && packet.total === packet.skill + packet.roll + (tool?.bonus ?? 0)
    && packet.success === (packet.total >= packet.difficulty)
    && packet.difficulty >= expectedDifficultyRange[0]!
    && packet.difficulty <= expectedDifficultyRange[1]!
    && packet.healthBefore <= packet.maxHealth
    && packet.healthAfter <= packet.maxHealth
    && packet.healthAfter === packet.healthBefore - packet.damage
    && (packet.schemaVersion === 3 ? packet.damage === 0 : packet.success ? packet.damage === 0 : packet.damage > 0)
    && packet.completedExit === (!packet.dungeonCompletedBefore && packet.dungeonCompletedAfter)
    && packet.dungeonCompletedAfter === (packet.dungeonCompletedBefore || packet.completedExit)
    && packet.crossMazeAfter - packet.crossMazeBefore === packet.crossMazeDelta
    && packet.crossMazeDelta <= 1;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function crossMazeObjective(state: WorldState): QuestObjective | null {
  const direct = state.depth.quest.objectives.find((objective) => objective.rule.kind === "complete-dungeon");
  if (direct !== undefined) return direct;
  for (const subquest of state.depth.quest.subquests) {
    const nested = subquest.objectives.find((objective) => objective.rule.kind === "complete-dungeon");
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
    && statuses.includes(objective.status)
    && isValidQuestObjectiveRule(objective.rule);
}

function sameDungeonIdentity(before: DungeonState, after: DungeonState): boolean {
  return before.id === after.id
    && before.name === after.name
    && before.layoutVersion === after.layoutVersion
    && (before.trapRulesVersion ?? 1) === (after.trapRulesVersion ?? 1)
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
    if (after.layoutVersion !== 2 && after.layoutVersion !== 3) return null;
    const generated = generateDungeon(before.depth.seed, after.id, after.width, after.height, true,
      after.layoutVersion, after.trapRulesVersion ?? 1);
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
  if (trapBefore.kind === "mana-siphon" && beforeDungeon.trapRulesVersion !== 2) return null;
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

  const kit = stage === "disarm" ? selectDisarmingKit(before.depth.hero) : null;
  let check;
  try {
    const aptitudes = {
      agility: effectiveAttribute(before.depth.hero, "agility"),
      intellect: effectiveAttribute(before.depth.hero, "intellect"),
      spirit: effectiveAttribute(before.depth.hero, "spirit"),
      level: heroMechanicalLevel(before.depth.hero.level),
    };
    check = stage === "disarm"
      ? resolveDungeonDisarmCheck(beforeDungeon, cellId, aptitudes, before.seed, kit)
      : resolveDungeonTrapCheck(beforeDungeon, cellId, stage, aptitudes, before.seed);
    if (kit !== null) {
      const receipt = createDungeonDisarmKitUse(check, kit, after.depth.tick, afterDungeon.id);
      if (!sameJson(afterDungeon.latestDisarmKitUse, receipt)
        || !sameJson(after.depth.hero.inventory, before.depth.hero.inventory.filter((item) => item.id !== kit.id))) return null;
    } else if (stage === "disarm"
      && !sameJson(beforeDungeon.latestDisarmKitUse ?? null, afterDungeon.latestDisarmKitUse ?? null)) return null;
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
  let manaFacts: Pick<TrapResolutionPacketV3, "manaBefore" | "manaLost" | "manaAfter" | "maxMana"> | null = null;
  if (trapBefore.kind === "mana-siphon") {
    const { mana: manaBefore, maxMana } = before.depth.hero.resources;
    const manaAfter = after.depth.hero.resources.mana;
    if (![manaBefore, manaAfter, maxMana].every((value) => safeInteger(value))
      || manaBefore > maxMana || manaAfter > maxMana
      || after.depth.hero.resources.maxMana !== maxMana || healthAfter !== healthBefore) return null;
    const consequence = check.success ? null
      : resolveDungeonTrap(beforeDungeon, cellId, true, healthBefore, maxHealth, manaBefore, maxMana);
    if (!check.success && (consequence === null || !("effect" in consequence) || consequence.effect !== "mana-loss"
      || consequence.healthBefore !== healthBefore || consequence.healthAfter !== healthAfter
      || consequence.manaBefore !== manaBefore || consequence.manaAfter !== manaAfter
      || consequence.maxMana !== maxMana || consequence.damage !== 0)) return null;
    const manaLost = consequence !== null && "manaLost" in consequence ? consequence.manaLost : 0;
    if (manaAfter !== manaBefore - manaLost) return null;
    manaFacts = { manaBefore, manaLost, manaAfter, maxMana };
  } else if (check.success) {
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
    ? applyQuestProgressFact(before.depth.quest, {
        schemaVersion: 1,
        kind: "dungeon-completed",
        dungeonId: afterDungeon.id,
        locationId: before.depth.atlas.currentLocationId,
        binding: before.depth.quest.ordinal > 0 && isQuestLeadDungeon(
          before.depth.seed,
          before.depth.atlas,
          before.depth.quest,
          afterDungeon.id,
        ) ? "quest-lead" : "unbound",
      })
    : before.depth.quest;
  if (!sameJson(after.depth.quest, expectedQuest)) return null;
  const crossMazeDelta = crossMazeAfter.current - crossMazeBefore.current;
  if (!Number.isSafeInteger(crossMazeDelta) || crossMazeDelta < 0 || crossMazeDelta > 1) return null;

  const facts = {
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
  };
  const tool = kit === null ? null : Object.freeze({
    itemId: kit.id, bonus: 2 as const, quantityBefore: 1 as const, quantityAfter: 0 as const,
  });
  if (trapBefore.kind === "mana-siphon") {
    return manaFacts === null ? null : Object.freeze({ schemaVersion: 3, ...facts,
      trapKind: "mana-siphon", ...manaFacts, tool });
  }
  return tool === null
    ? Object.freeze({ schemaVersion: 1, ...facts, trapKind: trapBefore.kind })
    : Object.freeze({ schemaVersion: 2, ...facts, trapKind: trapBefore.kind, tool });
}
