import { pick, randomInt } from "../core/rng";
import { isDisarmingKit } from "./disarming-kit";
import { isValidDungeonFieldMedicineUse } from "./dungeon-field-medicine";
import type { DungeonDisarmKitUseV1, ItemState } from "./types";
import type {
  DungeonKeyGateState,
  DungeonSearchDiscoveryV1,
  DungeonSearchExitV1,
  DungeonSearchReceiptV1,
  DungeonSearchStateV1,
  DungeonSecretPassageClue,
  DungeonSecretPassageState,
  DungeonShrineUse,
  DungeonState,
  DungeonTrapKind,
  DungeonTrapPhase,
  DungeonTrapState,
  MazeCell,
  MazeDirection,
} from "./types";

const directions: readonly MazeDirection[] = ["north", "east", "south", "west"];
const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };
const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const features: readonly MazeCell["feature"][] = ["empty", "empty", "empty", "treasure", "trap", "shrine", "lair"];
const legacyTrapKinds: readonly DungeonTrapKind[] = ["tripwire", "rune-ward"];
const trapKinds: readonly DungeonTrapKind[] = [...legacyTrapKinds, "mana-siphon"];
const trapPhases: readonly DungeonTrapPhase[] = ["hidden", "detected", "disarmed", "triggered"];
const names = ["Ashen Archive", "Clockroot Vault", "Hollow Crown", "Moonkennel", "Salt Labyrinth"] as const;
const validDungeonStateCache = new WeakSet<object>();
export const dungeonKeyName = "Wayfinder Key";
export const dungeonSearchBonus = 2 as const;

export type DungeonTraversalMode =
  | "complete"
  | "explore"
  | "hazard"
  | "retrace"
  | "return-to-gate"
  | "unlock-gate"
  | "cross-gate";

export interface DungeonTraversalPlan {
  mode: DungeonTraversalMode;
  options: readonly MazeDirection[];
  roomsToFrontier: number;
}

export interface DungeonWayfindingView {
  mode: DungeonTraversalMode;
  currentCellId: string;
  frontierCellId: string | null;
  routeCellIds: readonly string[];
  frontierDirections: readonly MazeDirection[];
  nextDirection: MazeDirection | null;
  nextPassageDirections: readonly MazeDirection[];
  roomsToFrontier: number;
}

export interface DungeonKeyGateView {
  key: null | {
    cellId: string;
    x: number;
    y: number;
    name: string;
    status: "sighted" | "carried" | "used";
  };
  gate: null | {
    unlockCellId: string;
    shortcutCellId: string | null;
    x: number;
    y: number;
    direction: MazeDirection;
    status: "locked" | "open";
  };
}

export interface DungeonMoveKnowledge {
  direction: MazeDirection;
  destinationCellId: string;
  feature: MazeCell["feature"];
  sightedWayfinderKey: boolean;
}

export function projectLatestShrineUse(state: DungeonState, tick: number): DungeonShrineUse | null {
  return state.latestShrineUse?.tick === tick ? state.latestShrineUse : null;
}

export function describeDungeonShrineUse(use: DungeonShrineUse): string {
  if (use.healthRestored === 0 && use.manaRestored === 0) return "RESOURCES FULL";
  return `HP ${use.healthBefore}→${use.healthAfter} (+${use.healthRestored}) · MP ${use.manaBefore}→${use.manaAfter} (+${use.manaRestored})`;
}

export interface DungeonHealthTrapConsequenceV1 {
  dungeonId: string;
  cellId: string;
  damage: number;
  healthBefore: number;
  healthAfter: number;
}

export interface DungeonManaTrapConsequenceV2 extends DungeonHealthTrapConsequenceV1 {
  readonly schemaVersion: 2;
  readonly effect: "mana-loss";
  readonly damage: 0;
  readonly manaBefore: number;
  readonly manaLost: number;
  readonly manaAfter: number;
  readonly maxMana: number;
}

export type DungeonTrapConsequence = DungeonHealthTrapConsequenceV1 | DungeonManaTrapConsequenceV2;

export interface DungeonTrapView {
  cellId: string;
  x: number;
  y: number;
  kind: DungeonTrapKind;
  status: "armed" | "disarmed" | "triggered";
  detectDifficulty: number;
  disarmDifficulty: number;
  current: boolean;
}

export type DungeonTrapCheckAttribute = "agility" | "intellect" | "spirit";

export interface DungeonTrapCheck {
  cellId: string;
  kind: DungeonTrapKind;
  stage: "detect" | "disarm";
  attribute: DungeonTrapCheckAttribute;
  skill: number;
  roll: number;
  total: number;
  difficulty: number;
  success: boolean;
}

export interface DungeonTrapAptitudes {
  agility: number;
  intellect: number;
  spirit: number;
  level: number;
}

const trapAttributes: Record<DungeonTrapKind, { detect: DungeonTrapCheckAttribute; disarm: DungeonTrapCheckAttribute }> = {
  tripwire: { detect: "intellect", disarm: "agility" },
  "rune-ward": { detect: "spirit", disarm: "intellect" },
  "mana-siphon": { detect: "spirit", disarm: "intellect" },
};

function generatedTrap(seed: string, cellId: string, phase: DungeonTrapPhase = "hidden", trapRulesVersion: 1 | 2 = 1): DungeonTrapState {
  return {
    cellId,
    kind: pick(trapRulesVersion === 1 ? legacyTrapKinds : trapKinds, seed, "dungeon-trap", cellId, 0, "kind"),
    detectDifficulty: 10 + randomInt(5, seed, "dungeon-trap", cellId, 0, "detect-difficulty"),
    disarmDifficulty: 11 + randomInt(6, seed, "dungeon-trap", cellId, 0, "disarm-difficulty"),
    phase,
  };
}

export function dungeonTrapKindLabel(kind: DungeonTrapKind): string {
  return kind === "tripwire" ? "whisper-wire" : kind === "rune-ward" ? "echo rune" : "mana siphon";
}

export function dungeonTrapCheckAttribute(kind: DungeonTrapKind, stage: "detect" | "disarm"): DungeonTrapCheckAttribute {
  return trapAttributes[kind][stage];
}

export function migrateDungeonTraps(
  state: Omit<DungeonState, "traps" | "layoutVersion" | "keyGate" | "latestShrineUse">,
  seed: string,
): DungeonState {
  const discovered = new Set(state.discoveredCellIds);
  const visited = new Set(state.visitedCellIds);
  return {
    ...state,
    layoutVersion: 1,
    trapRulesVersion: 1,
    keyGate: null,
    latestShrineUse: null,
    search: createDungeonSearchState(),
    traps: state.cells
      .filter((cell) => cell.feature === "trap")
      .map((cell) => generatedTrap(
        seed,
        cell.id,
        visited.has(cell.id) ? "triggered" : discovered.has(cell.id) ? "detected" : "hidden",
        1,
      )),
  };
}

export function dungeonTrapAt(state: DungeonState, cellId: string): DungeonTrapState | null {
  return state.traps.find((trap) => trap.cellId === cellId) ?? null;
}

export function withDungeonTrapPhase(state: DungeonState, cellId: string, phase: DungeonTrapPhase): DungeonState {
  const trap = dungeonTrapAt(state, cellId);
  if (trap === null) throw new Error("Dungeon trap is missing");
  const legal = trap.phase === phase
    || (trap.phase === "hidden" && (phase === "detected" || phase === "triggered"))
    || (trap.phase === "detected" && (phase === "disarmed" || phase === "triggered"));
  if (!legal) throw new Error(`Dungeon trap cannot transition from ${trap.phase} to ${phase}`);
  return {
    ...state,
    traps: state.traps.map((candidate) => candidate.cellId === cellId ? { ...candidate, phase } : candidate),
  };
}

export function resolveDungeonTrapCheck(
  state: DungeonState,
  cellId: string,
  stage: "detect" | "disarm",
  aptitudes: DungeonTrapAptitudes,
  seed: string,
): DungeonTrapCheck {
  const trap = dungeonTrapAt(state, cellId);
  if (trap === null) throw new Error("Dungeon trap is missing");
  if ((stage === "detect" && trap.phase !== "hidden") || (stage === "disarm" && trap.phase !== "detected")) {
    throw new Error(`Dungeon trap is not ready to ${stage}`);
  }
  const attribute = trapAttributes[trap.kind][stage];
  const skill = aptitudes[attribute] + aptitudes.level;
  const roll = randomInt(4, seed, "dungeon-trap-check", cellId, 0, stage);
  const total = skill + roll;
  const difficulty = stage === "detect" ? trap.detectDifficulty : trap.disarmDifficulty;
  return { cellId, kind: trap.kind, stage, attribute, skill, roll, total, difficulty, success: total >= difficulty };
}

/** One existing cell-bound roll. A real kit changes only total and success. */
export function resolveDungeonDisarmCheck(
  state: DungeonState, cellId: string, aptitudes: DungeonTrapAptitudes, seed: string, kit: ItemState | null,
): DungeonTrapCheck {
  if (kit !== null && !isDisarmingKit(kit)) throw new TypeError("Disarming kit capability is invalid");
  const base = resolveDungeonTrapCheck(state, cellId, "disarm", aptitudes, seed);
  if (kit === null) return base;
  const total = base.total + 2;
  if (!Number.isSafeInteger(total)) throw new RangeError("Assisted disarm total exceeds its bound");
  return { ...base, total, success: total >= base.difficulty };
}

function validKitUseArithmetic(value: Record<string, unknown>): boolean {
  const integer = (candidate: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): candidate is number =>
    typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= minimum && candidate <= maximum;
  return value.schemaVersion === 1 && value.quantityBefore === 1 && value.quantityAfter === 0 && value.bonus === 2
    && typeof value.dungeonId === "string" && value.dungeonId.length > 0 && value.dungeonId.length <= 512
    && typeof value.cellId === "string" && value.cellId.length > 0 && value.cellId.length <= 512
    && typeof value.itemId === "string" && value.itemId.length > 0 && value.itemId.length <= 512
    && integer(value.tick, 1) && trapKinds.includes(value.kind as DungeonTrapKind)
    && value.attribute === trapAttributes[value.kind as DungeonTrapKind]?.disarm
    && integer(value.skill, 0) && integer(value.roll, 0, 3) && integer(value.baseTotal, 0)
    && value.baseTotal === (value.skill as number) + (value.roll as number)
    && integer(value.total, 2) && value.total === (value.baseTotal as number) + 2
    && integer(value.difficulty, 11, 16) && typeof value.success === "boolean"
    && value.success === ((value.total as number) >= (value.difficulty as number));
}

export function createDungeonDisarmKitUse(
  check: DungeonTrapCheck, kit: ItemState, tick: number, dungeonId: string,
): DungeonDisarmKitUseV1 {
  const receipt = {
    schemaVersion: 1 as const, dungeonId, cellId: check.cellId, tick, itemId: kit.id,
    quantityBefore: 1 as const, quantityAfter: 0 as const, bonus: 2 as const,
    kind: check.kind, attribute: check.attribute, skill: check.skill, roll: check.roll,
    baseTotal: check.skill + check.roll, total: check.total, difficulty: check.difficulty, success: check.success,
  };
  if (check.stage !== "disarm" || !isDisarmingKit(kit) || !validKitUseArithmetic(receipt)) {
    throw new TypeError("Assisted disarm receipt violates its fixed rules");
  }
  return Object.freeze(receipt as DungeonDisarmKitUseV1);
}

export function isValidDungeonDisarmKitUse(
  value: unknown, dungeon: DungeonState, currentTick: number,
): value is DungeonDisarmKitUseV1 | null {
  if (value === null) return true;
  if (!isRecord(value) || !Number.isSafeInteger(currentTick) || currentTick < 0) return false;
  const keys = ["schemaVersion", "dungeonId", "cellId", "tick", "itemId", "quantityBefore", "quantityAfter",
    "bonus", "kind", "attribute", "skill", "roll", "baseTotal", "total", "difficulty", "success"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
    || !validKitUseArithmetic(value) || value.dungeonId !== dungeon.id || (value.tick as number) > currentTick
    || (value.kind === "mana-siphon" && dungeon.trapRulesVersion !== 2)
    || !dungeon.visitedCellIds.includes(value.cellId as string) || !dungeon.discoveredCellIds.includes(value.cellId as string)) return false;
  const cell = dungeon.cells.find((candidate) => candidate.id === value.cellId);
  const trap = dungeonTrapAt(dungeon, value.cellId as string);
  // A released far-stair trap may become a shrine after its actual resolution.
  if (trap === null) return dungeon.layoutVersion === 3 && value.cellId === dungeon.exitCellId && cell?.feature === "shrine";
  return cell?.feature === "trap" && trap.kind === value.kind && trap.disarmDifficulty === value.difficulty
    && trap.phase === (value.success ? "disarmed" : "triggered");
}

function dimension(value: number): number {
  if (!Number.isFinite(value)) return 8;
  return Math.max(3, Math.min(24, Math.floor(value)));
}

export function mazeCellId(dungeonId: string, x: number, y: number): string {
  return `${dungeonId}:cell:${x},${y}`;
}

function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function neighboringCoordinates(width: number, height: number, x: number, y: number): readonly { x: number; y: number; direction: MazeDirection }[] {
  return directions.flatMap((direction) => {
    const change = delta[direction];
    const nextX = x + change[0];
    const nextY = y + change[1];
    return nextX >= 0 && nextX < width && nextY >= 0 && nextY < height
      ? [{ x: nextX, y: nextY, direction }]
      : [];
  });
}

function farthestCell(cells: readonly MazeCell[], entryId: string): string {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const queue: string[] = [entryId];
  const distance = new Map<string, number>([[entryId, 0]]);
  let farthest = entryId;
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined) break;
    const current = byId.get(currentId);
    if (current === undefined) throw new Error("Maze cell is missing");
    const currentDistance = distance.get(currentId) ?? 0;
    if (currentDistance > (distance.get(farthest) ?? -1)) farthest = currentId;
    for (const direction of current.exits) {
      const change = delta[direction];
      const neighborId = mazeCellId(entryId.split(":cell:")[0] ?? "", current.x + change[0], current.y + change[1]);
      if (!distance.has(neighborId)) {
        distance.set(neighborId, currentDistance + 1);
        queue.push(neighborId);
      }
    }
  }
  return farthest;
}

function discoveredAround(state: DungeonState, cellId: string): readonly string[] {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  if (cell === undefined) throw new Error("Current maze cell is missing");
  const byId = new Map(state.cells.map((candidate) => [candidate.id, candidate]));
  const discovered = new Set(state.discoveredCellIds);
  discovered.add(cell.id);
  for (const direction of dungeonEffectiveExits(state, cell.id)) {
    const neighbor = effectiveNeighbor(state, byId, cell, direction);
    if (neighbor !== null) discovered.add(neighbor.id);
  }
  return [...discovered];
}

function discoveredFromVisited(state: DungeonState): readonly string[] {
  let discovered: readonly string[] = [...state.discoveredCellIds];
  for (const cellId of state.visitedCellIds) {
    discovered = discoveredAround({ ...state, discoveredCellIds: discovered }, cellId);
  }
  return discovered;
}

function destinationId(state: DungeonState, cell: MazeCell, direction: MazeDirection): string {
  const change = delta[direction];
  return mazeCellId(state.id, cell.x + change[0], cell.y + change[1]);
}

function orderedExits(cell: MazeCell): readonly MazeDirection[] {
  return directions.filter((direction) => cell.exits.includes(direction));
}

function legalNeighbor(
  state: DungeonState,
  byId: ReadonlyMap<string, MazeCell>,
  cell: MazeCell,
  direction: MazeDirection,
): MazeCell | null {
  const neighbor = byId.get(destinationId(state, cell, direction));
  return neighbor !== undefined && neighbor.exits.includes(opposite[direction]) ? neighbor : null;
}

function directionBetween(from: MazeCell, to: MazeCell): MazeDirection | null {
  return directions.find((direction) => {
    const change = delta[direction];
    return from.x + change[0] === to.x && from.y + change[1] === to.y;
  }) ?? null;
}

function pathBetween(
  cells: readonly MazeCell[],
  dungeonId: string,
  startCellId: string,
  endCellId: string,
): readonly string[] {
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const queue = [startCellId];
  const reached = new Set(queue);
  const predecessor = new Map<string, string | null>([[startCellId, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = byId.get(queue[cursor] ?? "");
    if (current === undefined) continue;
    if (current.id === endCellId) break;
    for (const direction of orderedExits(current)) {
      const change = delta[direction];
      const neighborId = mazeCellId(dungeonId, current.x + change[0], current.y + change[1]);
      if (reached.has(neighborId)) continue;
      const neighbor = byId.get(neighborId);
      if (neighbor === undefined || !neighbor.exits.includes(opposite[direction])) continue;
      reached.add(neighborId);
      predecessor.set(neighborId, current.id);
      queue.push(neighborId);
    }
  }
  if (!predecessor.has(endCellId)) throw new Error("Dungeon path endpoints are disconnected");
  const path: string[] = [];
  let cursor: string | null = endCellId;
  while (cursor !== null) {
    path.push(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }
  return path.reverse();
}

function generateDungeonKeyGate(
  cells: readonly MazeCell[],
  dungeonId: string,
  entryCellId: string,
  exitCellId: string,
): { cells: readonly MazeCell[]; keyGate: DungeonKeyGateState } {
  const path = pathBetween(cells, dungeonId, entryCellId, exitCellId);
  const pathIndex = new Map(path.map((cellId, index) => [cellId, index]));
  const byId = new Map(cells.map((cell) => [cell.id, cell]));
  const candidates: { unlockCellId: string; shortcutCellId: string; saving: number }[] = [];
  for (const cell of cells) {
    for (const direction of ["east", "south"] as const) {
      const change = delta[direction];
      const neighbor = byId.get(mazeCellId(dungeonId, cell.x + change[0], cell.y + change[1]));
      if (neighbor === undefined || cell.exits.includes(direction)) continue;
      const cellPathIndex = pathIndex.get(cell.id);
      const neighborPathIndex = pathIndex.get(neighbor.id);
      if (cellPathIndex === undefined || neighborPathIndex === undefined) continue;
      const saving = Math.abs(neighborPathIndex - cellPathIndex) - 1;
      if (saving < 3) continue;
      candidates.push(cellPathIndex < neighborPathIndex
        ? { unlockCellId: cell.id, shortcutCellId: neighbor.id, saving }
        : { unlockCellId: neighbor.id, shortcutCellId: cell.id, saving });
    }
  }
  candidates.sort((left, right) =>
    right.saving - left.saving
    || (left.unlockCellId < right.unlockCellId ? -1 : left.unlockCellId > right.unlockCellId ? 1 : 0)
    || (left.shortcutCellId < right.shortcutCellId ? -1 : left.shortcutCellId > right.shortcutCellId ? 1 : 0)
  );
  const selected = candidates[0];
  if (selected === undefined) throw new Error("Dungeon generation found no useful gated shortcut");
  const unlockIndex = pathIndex.get(selected.unlockCellId);
  const shortcutIndex = pathIndex.get(selected.shortcutCellId);
  if (unlockIndex === undefined || shortcutIndex === undefined || shortcutIndex - unlockIndex < 4) {
    throw new Error("Dungeon gated shortcut has no internal key position");
  }
  const keyCellId = path[unlockIndex + Math.max(1, Math.floor((shortcutIndex - unlockIndex - 1) / 3))];
  if (keyCellId === undefined || keyCellId === entryCellId || keyCellId === exitCellId) {
    throw new Error("Dungeon generation found no valid key chamber");
  }
  const unlockCell = byId.get(selected.unlockCellId);
  const shortcutCell = byId.get(selected.shortcutCellId);
  const gateDirection = unlockCell === undefined || shortcutCell === undefined
    ? null
    : directionBetween(unlockCell, shortcutCell);
  if (unlockCell === undefined || shortcutCell === undefined || gateDirection === null) {
    throw new Error("Dungeon gated shortcut endpoints are not adjacent");
  }
  const reverseDirection = opposite[gateDirection];
  const roleIds = new Set([keyCellId, selected.unlockCellId, selected.shortcutCellId]);
  const withGate = cells.map((cell): MazeCell => {
    const addedDirection = cell.id === selected.unlockCellId
      ? gateDirection
      : cell.id === selected.shortcutCellId
        ? reverseDirection
        : null;
    return {
      ...cell,
      exits: addedDirection === null
        ? cell.exits
        : directions.filter((direction) => cell.exits.includes(direction) || direction === addedDirection),
      feature: roleIds.has(cell.id) ? "empty" : cell.feature,
    };
  });
  return {
    cells: withGate,
    keyGate: {
      keyCellId,
      unlockCellId: selected.unlockCellId,
      shortcutCellId: selected.shortcutCellId,
      phase: "uncollected",
    },
  };
}

function isDungeonGateEdge(state: DungeonState, fromCellId: string, toCellId: string): boolean {
  const gate = state.keyGate;
  return gate !== null && (
    (gate.unlockCellId === fromCellId && gate.shortcutCellId === toCellId)
    || (gate.unlockCellId === toCellId && gate.shortcutCellId === fromCellId)
  );
}

/** Physical doorways, including the one committed extra edge; never a hidden latch. */
export function dungeonEffectiveExits(state: DungeonState, cellId: string): readonly MazeDirection[] {
  const cell = state.cells.find((entry) => entry.id === cellId);
  if (cell === undefined) return [];
  const passage = state.secretPassage, clue = passage?.clue;
  if (passage?.opened == null || clue == null) return orderedExits(cell);
  const extra = cell.id === clue.fromCellId ? clue.direction : cell.id === clue.toCellId ? opposite[clue.direction] : null;
  return directions.filter((direction) => cell.exits.includes(direction) || direction === extra);
}

function physicalNeighbor(state: DungeonState, byId: ReadonlyMap<string, MazeCell>, cell: MazeCell, direction: MazeDirection): MazeCell | null {
  const neighbor = byId.get(destinationId(state, cell, direction));
  return neighbor !== undefined && dungeonEffectiveExits(state, neighbor.id).includes(opposite[direction]) ? neighbor : null;
}

export function isDungeonPassageOpen(state: DungeonState, fromCellId: string, toCellId: string): boolean {
  const from = state.cells.find((cell) => cell.id === fromCellId);
  const to = state.cells.find((cell) => cell.id === toCellId);
  const direction = from === undefined || to === undefined ? null : directionBetween(from, to);
  if (from === undefined || to === undefined || direction === null || !dungeonEffectiveExits(state, from.id).includes(direction)
    || !dungeonEffectiveExits(state, to.id).includes(opposite[direction])) {
    return false;
  }
  return !isDungeonGateEdge(state, fromCellId, toCellId) || state.keyGate?.phase === "open";
}

function effectiveNeighbor(
  state: DungeonState,
  byId: ReadonlyMap<string, MazeCell>,
  cell: MazeCell,
  direction: MazeDirection,
): MazeCell | null {
  const neighbor = physicalNeighbor(state, byId, cell, direction);
  return neighbor !== null && isDungeonPassageOpen(state, cell.id, neighbor.id) ? neighbor : null;
}

export function createDungeonSearchState(): DungeonSearchStateV1 {
  return Object.freeze({ schemaVersion: 1, searchedCellIds: Object.freeze([]), latestReceipt: null });
}

export function dungeonSecretPassageCommandId(tick: number, dungeonId: string, fromCellId: string, toCellId: string): string {
  return `depth:${tick}:dungeon:${dungeonId}:passage:${fromCellId}:${toCellId}`;
}

export function createDungeonSecretPassageState(): DungeonSecretPassageState {
  return { schemaVersion: 1, rulesVersion: "draught-v1", clue: null, opened: null };
}

/** Validate this extra edge separately: the original maze and key gate stay intact. */
export function isValidDungeonSecretPassage(state: DungeonState, currentTick = Number.MAX_SAFE_INTEGER): boolean {
  try {
    if (!Object.hasOwn(state, "secretPassage")) return true;
    const record: unknown = state.secretPassage;
    if (!isRecord(record) || !searchExactKeys(record, ["schemaVersion", "rulesVersion", "clue", "opened"])
      || record.schemaVersion !== 1 || record.rulesVersion !== "draught-v1" || !searchInteger(currentTick)) return false;
    if (record.clue === null) return record.opened === null;
    const clue = record.clue;
    if (!isRecord(clue) || !searchExactKeys(clue, ["dungeonId", "fromCellId", "toCellId", "direction", "revealedTick", "revealSourceCommandId", "revealedTurn", "knownRouteCellIds"])
      || clue.dungeonId !== state.id || !directions.includes(clue.direction as MazeDirection)
      || !searchInteger(clue.revealedTick, 1, currentTick) || !searchInteger(clue.revealedTurn, 0, state.turns)
      || typeof clue.revealSourceCommandId !== "string" || ![...directions,
        ...["disarm", "unlock", "search"].map((action) => `${action}:${clue.fromCellId}`)]
        .some((suffix) => clue.revealSourceCommandId === `depth:${clue.revealedTick}:dungeon:${state.id}:${suffix}`)
      || !Array.isArray(clue.knownRouteCellIds) || clue.knownRouteCellIds.length < 4 || clue.knownRouteCellIds.length > state.cells.length
      || new Set(clue.knownRouteCellIds).size !== clue.knownRouteCellIds.length
      || clue.knownRouteCellIds[0] !== clue.fromCellId || clue.knownRouteCellIds.at(-1) !== clue.toCellId
      || clue.knownRouteCellIds.some((id) => typeof id !== "string" || !state.visitedCellIds.includes(id))
      || (state.keyGate !== null && (state.keyGate.phase !== "open" || !state.visitedCellIds.includes(state.keyGate.shortcutCellId)))) return false;
    const from = state.cells.find((cell) => cell.id === clue.fromCellId), to = state.cells.find((cell) => cell.id === clue.toCellId);
    if (from === undefined || to === undefined || directionBetween(from, to) !== clue.direction
      || from.exits.includes(clue.direction as MazeDirection) || to.exits.includes(opposite[clue.direction as MazeDirection])) return false;
    const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
    for (let index = 1; index < clue.knownRouteCellIds.length; index++) {
      const a = byId.get(clue.knownRouteCellIds[index - 1]), b = byId.get(clue.knownRouteCellIds[index]);
      const direction = a === undefined || b === undefined ? null : directionBetween(a, b);
      if (a === undefined || b === undefined || direction === null || !a.exits.includes(direction)
        || !b.exits.includes(opposite[direction])) return false;
    }
    if (clue.revealedTick === currentTick && (state.currentCellId !== clue.fromCellId || state.turns !== clue.revealedTurn)) return false;
    if (record.opened === null) return true;
    const opened = record.opened;
    return isRecord(opened) && searchExactKeys(opened, ["tick", "sourceCommandId", "turn"])
      && searchInteger(opened.tick, clue.revealedTick + 1, currentTick)
      && searchInteger(opened.turn, clue.revealedTurn + 1, state.turns)
      && opened.sourceCommandId === dungeonSecretPassageCommandId(opened.tick, state.id, from.id, to.id)
      && (opened.tick !== currentTick || state.currentCellId === from.id && state.turns === opened.turn);
  } catch { return false; }
}

/** Only current, already known geometry can select a clue. No hidden features are read. */
export function revealDungeonSecretPassage(state: DungeonState, source: { tick: number; sourceCommandId: string }): DungeonState {
  if (state.secretPassage === undefined) return state;
  if (!isValidDungeonSecretPassage(state, source.tick)) throw new Error("Dungeon secret passage state is malformed");
  if (state.secretPassage.clue !== null || state.completed || dungeonTrapAt(state, state.currentCellId)?.phase === "detected"
    || (state.keyGate !== null && (state.keyGate.phase !== "open" || !state.visitedCellIds.includes(state.keyGate.shortcutCellId)))) return state;
  const before = projectDungeonWayfinding(state);
  if (before.mode !== "retrace" || before.roomsToFrontier < 2) return state;
  const byId = new Map(state.cells.map((cell) => [cell.id, cell])), current = byId.get(state.currentCellId)!;
  let selected: { clue: DungeonSecretPassageClue; saving: number } | null = null;
  for (const direction of directions) {
    if (current.exits.includes(direction)) continue;
    const target = byId.get(destinationId(state, current, direction));
    if (target === undefined || !state.visitedCellIds.includes(target.id) || target.exits.includes(opposite[direction])) continue;
    const knownRouteCellIds = routeToKnownCell(state, byId, target.id);
    if (knownRouteCellIds === null || knownRouteCellIds.length < 4) continue;
    const clue: DungeonSecretPassageClue = { dungeonId: state.id, fromCellId: current.id, toCellId: target.id, direction,
      revealedTick: source.tick, revealSourceCommandId: source.sourceCommandId, revealedTurn: state.turns, knownRouteCellIds };
    const preview: DungeonState = { ...state, secretPassage: { ...state.secretPassage, clue,
      opened: { tick: source.tick + 1, turn: state.turns + 1, sourceCommandId: dungeonSecretPassageCommandId(source.tick + 1, state.id, current.id, target.id) } } };
    const after = projectDungeonWayfinding(preview), saving = before.roomsToFrontier - after.roomsToFrontier;
    if (after.mode === "retrace" && after.nextDirection === direction && saving > 0 && (selected === null || saving > selected.saving)) selected = { clue, saving };
  }
  if (selected === null) return state;
  const revealed = { ...state, secretPassage: { ...state.secretPassage, clue: selected.clue } };
  if (!isValidDungeonSecretPassage(revealed, source.tick)) throw new Error("Dungeon draught lacks a valid committed source");
  return revealed;
}

export function selectDungeonSecretPassage(state: DungeonState): DungeonSecretPassageClue | null {
  const passage = state.secretPassage;
  return passage?.clue == null || passage.opened !== null || state.completed || passage.clue.fromCellId !== state.currentCellId
    || dungeonTrapAt(state, state.currentCellId)?.phase === "detected" || !isValidDungeonSecretPassage(state) ? null : passage.clue;
}

/** The public cue deliberately omits the destination, even though it is a visited room. */
export function projectDungeonSecretPassageCue(state: DungeonState): { direction: MazeDirection; text: string } | null {
  const clue = selectDungeonSecretPassage(state);
  return clue === null ? null : { direction: clue.direction, text: `A draught brushes the ${clue.direction} wall. For a wall, it has a suspicious amount of weather.` };
}

export function openDungeonSecretPassage(state: DungeonState, command: { dungeonId: string; fromCellId: string; toCellId: string }, tick: number): DungeonState {
  const clue = selectDungeonSecretPassage(state);
  if (clue === null || command.dungeonId !== state.id || command.fromCellId !== clue.fromCellId || command.toCellId !== clue.toCellId
    || !searchInteger(tick, clue.revealedTick + 1) || !searchInteger(state.turns, 0, Number.MAX_SAFE_INTEGER - 1)) throw new Error("No matching disclosed dungeon draught is available");
  const opened = { ...state, turns: state.turns + 1, secretPassage: { ...state.secretPassage!,
    opened: { tick, turn: state.turns + 1, sourceCommandId: dungeonSecretPassageCommandId(tick, state.id, clue.fromCellId, clue.toCellId) } },
    traversalLog: [...state.traversalLog.slice(-63), `A latch yields in the ${clue.direction} wall. The draught becomes a doorway to a room already visited.`] };
  if (!isValidDungeonSecretPassage(opened, tick)) throw new Error("Dungeon passage opening lost its source");
  return opened;
}

/** Only public geometry: never inspect a frontier room's feature or hidden trap to admit a search. */
export function projectDungeonSearchExits(state: DungeonState): readonly DungeonSearchExitV1[] {
  if (state.completed || !state.visitedCellIds.includes(state.currentCellId)) return Object.freeze([]);
  const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
  const current = byId.get(state.currentCellId);
  if (current === undefined) return Object.freeze([]);
  return Object.freeze(directions.flatMap((direction) => {
    if (!dungeonEffectiveExits(state, current.id).includes(direction)) return [];
    const neighbor = effectiveNeighbor(state, byId, current, direction);
    return neighbor === null || state.visitedCellIds.includes(neighbor.id) || !state.discoveredCellIds.includes(neighbor.id)
      ? [] : [Object.freeze({ direction, cellId: neighbor.id })];
  }));
}

function searchExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function searchInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

/** Validate historical public evidence against the persistent dungeon, not today's frontier/hero attributes. */
export function isValidDungeonSearchState(
  value: unknown,
  dungeon: DungeonState,
  currentTick = Number.MAX_SAFE_INTEGER,
): value is DungeonSearchStateV1 {
  if (!isRecord(value) || !searchExactKeys(value, ["schemaVersion", "searchedCellIds", "latestReceipt"])
    || value.schemaVersion !== 1 || !searchInteger(currentTick)
    || !Array.isArray(value.searchedCellIds) || value.searchedCellIds.length > 576
    || !Array.isArray(dungeon.cells) || !Array.isArray(dungeon.visitedCellIds)
    || !Array.isArray(dungeon.discoveredCellIds) || !Array.isArray(dungeon.traps)
    || dungeon.cells.some((cell) => !isRecord(cell) || typeof cell.id !== "string"
      || !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || !Array.isArray(cell.exits))
    || dungeon.traps.some((trap) => !isRecord(trap) || typeof trap.cellId !== "string")
    || (dungeon.keyGate !== null && !isRecord(dungeon.keyGate))
    || new Set(value.searchedCellIds).size !== value.searchedCellIds.length
    || value.searchedCellIds.some((id) => typeof id !== "string" || !dungeon.visitedCellIds.includes(id)
      || !dungeon.cells.some((cell) => cell.id === id))
    || value.searchedCellIds.length > dungeon.cells.length || value.searchedCellIds.length > dungeon.turns) return false;
  if (value.latestReceipt === null) return value.searchedCellIds.length === 0;
  const receipt = value.latestReceipt;
  if (!isRecord(receipt) || !searchExactKeys(receipt, ["schemaVersion", "dungeonId", "cellId", "tick", "bonus", "exits", "discoveries"])
    || receipt.schemaVersion !== 1 || receipt.dungeonId !== dungeon.id || receipt.cellId !== value.searchedCellIds.at(-1)
    || !searchInteger(receipt.tick, 1, currentTick) || receipt.bonus !== dungeonSearchBonus
    || !Array.isArray(receipt.exits) || receipt.exits.length < 1 || receipt.exits.length > 4
    || !Array.isArray(receipt.discoveries) || receipt.discoveries.length > receipt.exits.length) return false;
  const byId = new Map(dungeon.cells.map((cell) => [cell.id, cell]));
  const room = typeof receipt.cellId === "string" ? byId.get(receipt.cellId) : undefined;
  if (room === undefined) return false;
  const exitIds = new Set<string>();
  let previousDirection = -1;
  for (const exit of receipt.exits) {
    if (!isRecord(exit) || !searchExactKeys(exit, ["direction", "cellId"])
      || !directions.includes(exit.direction as MazeDirection) || typeof exit.cellId !== "string") return false;
    const direction = exit.direction as MazeDirection;
    const index = directions.indexOf(direction);
    const neighbor = effectiveNeighbor(dungeon, byId, room, direction);
    if (index <= previousDirection || !dungeonEffectiveExits(dungeon, room.id).includes(direction) || neighbor?.id !== exit.cellId
      || !dungeon.discoveredCellIds.includes(exit.cellId) || exitIds.has(exit.cellId)) return false;
    previousDirection = index;
    exitIds.add(exit.cellId);
  }
  const foundIds = new Set<string>();
  let previousExit = -1;
  for (const found of receipt.discoveries) {
    if (!isRecord(found) || !searchExactKeys(found, ["cellId", "kind", "attribute", "skill", "roll", "total", "difficulty"])
      || typeof found.cellId !== "string" || !exitIds.has(found.cellId) || foundIds.has(found.cellId)
      || !trapKinds.includes(found.kind as DungeonTrapKind)
      || (found.kind === "mana-siphon" && dungeon.trapRulesVersion !== 2)
      || !searchInteger(found.skill) || !searchInteger(found.roll, 0, 3) || !searchInteger(found.total)
      || !searchInteger(found.difficulty, 10, 14) || found.total !== found.skill + found.roll + dungeonSearchBonus
      || found.total < found.difficulty) return false;
    const trap = dungeonTrapAt(dungeon, found.cellId);
    const index = receipt.exits.findIndex((exit) => (exit as DungeonSearchExitV1).cellId === found.cellId);
    // A released layout-v2 far-stair trap may later become the layout-v3 shrine; retain its historical evidence.
    const migratedFarStair = trap === null && dungeon.layoutVersion === 3 && found.cellId === dungeon.exitCellId
      && dungeon.visitedCellIds.includes(found.cellId) && byId.get(found.cellId)?.feature === "shrine";
    if (index <= previousExit || found.attribute !== trapAttributes[found.kind as DungeonTrapKind].detect
      || (!migratedFarStair && (trap === null || trap.phase === "hidden" || trap.kind !== found.kind
        || trap.detectDifficulty !== found.difficulty))) return false;
    previousExit = index;
    foundIds.add(found.cellId);
  }
  return true;
}

export function migrateDungeonSearch(state: DungeonState): DungeonState {
  if (state.search === undefined) return { ...state, search: createDungeonSearchState() };
  if (!isValidDungeonSearchState(state.search, state)) throw new TypeError("Dungeon search evidence is malformed");
  return state;
}

export function canSearchDungeon(state: DungeonState): boolean {
  return !state.completed && (state.search === undefined || isValidDungeonSearchState(state.search, state))
    && !(state.search?.searchedCellIds.includes(state.currentCellId) ?? false)
    && dungeonTrapAt(state, state.currentCellId)?.phase !== "detected"
    && projectDungeonSearchExits(state).length > 0;
}

/** Spend one stationary exploration turn; hidden failures are deliberately absent from the public receipt. */
export function searchDungeon(state: DungeonState, aptitudes: DungeonTrapAptitudes, seed: string, tick: number): DungeonState {
  if (!canSearchDungeon(state) || !searchInteger(tick, 1)
    || (state.search?.latestReceipt !== null && state.search?.latestReceipt !== undefined && tick <= state.search.latestReceipt.tick)
    || !searchInteger(state.turns, 0, Number.MAX_SAFE_INTEGER - 1)
    || ![aptitudes.agility, aptitudes.intellect, aptitudes.spirit, aptitudes.level].every((value) => searchInteger(value, 0, Number.MAX_SAFE_INTEGER - 5))) {
    throw new Error("Dungeon search is unavailable");
  }
  const exits = projectDungeonSearchExits(state);
  const discoveries: DungeonSearchDiscoveryV1[] = [];
  let searched = state;
  for (const exit of exits) {
    const trap = dungeonTrapAt(state, exit.cellId);
    if (trap?.phase !== "hidden") continue;
    const check = resolveDungeonTrapCheck(state, exit.cellId, "detect", aptitudes, seed);
    const total = check.total + dungeonSearchBonus;
    if (!Number.isSafeInteger(total)) throw new RangeError("Dungeon search arithmetic is outside its bound");
    if (total < check.difficulty) continue;
    searched = withDungeonTrapPhase(searched, exit.cellId, "detected");
    discoveries.push(Object.freeze({ cellId: exit.cellId, kind: check.kind,
      attribute: trapAttributes[check.kind].detect as "intellect" | "spirit", skill: check.skill,
      roll: check.roll, total, difficulty: check.difficulty }));
  }
  const receipt: DungeonSearchReceiptV1 = Object.freeze({ schemaVersion: 1, dungeonId: state.id,
    cellId: state.currentCellId, tick, bonus: dungeonSearchBonus, exits, discoveries: Object.freeze(discoveries) });
  return { ...searched, turns: state.turns + 1,
    search: Object.freeze({ schemaVersion: 1,
      searchedCellIds: Object.freeze([...(state.search?.searchedCellIds ?? []), state.currentCellId]), latestReceipt: receipt }),
    traversalLog: [...state.traversalLog.slice(-63), discoveries.length === 0
      ? "Searched the visible unexplored exits; no new traps detected."
      : `Searched the visible unexplored exits; ${discoveries.length} ${discoveries.length === 1 ? "trap detected" : "traps detected"}.`],
  };
}

export function projectDungeonKeyGate(state: DungeonState): DungeonKeyGateView | null {
  const gate = state.keyGate;
  if ((state.layoutVersion !== 2 && state.layoutVersion !== 3) || gate === null) return null;
  const keyCell = state.cells.find((cell) => cell.id === gate.keyCellId);
  const unlockCell = state.cells.find((cell) => cell.id === gate.unlockCellId);
  const shortcutCell = state.cells.find((cell) => cell.id === gate.shortcutCellId);
  if (keyCell === undefined || unlockCell === undefined || shortcutCell === undefined) {
    throw new Error("Dungeon key gate references missing cells");
  }
  const gateDirection = directionBetween(unlockCell, shortcutCell);
  if (gateDirection === null) throw new Error("Dungeon key gate endpoints are not adjacent");
  const keyKnown = gate.phase !== "uncollected" || state.discoveredCellIds.includes(keyCell.id);
  const gateKnown = gate.phase === "open" || state.discoveredCellIds.includes(unlockCell.id);
  return {
    key: keyKnown ? {
      cellId: keyCell.id,
      x: keyCell.x,
      y: keyCell.y,
      name: dungeonKeyName,
      status: gate.phase === "uncollected" ? "sighted" : gate.phase === "carried" ? "carried" : "used",
    } : null,
    gate: gateKnown ? {
      unlockCellId: unlockCell.id,
      shortcutCellId: gate.phase === "open" ? shortcutCell.id : null,
      x: unlockCell.x,
      y: unlockCell.y,
      direction: gateDirection,
      status: gate.phase === "open" ? "open" : "locked",
    } : null,
  };
}

export type DungeonLandmarkView =
  | { kind: "far-stair-shrine"; status: "promised"; cellId: null }
  | { kind: "far-stair-shrine"; status: "mapped" | "awakened"; cellId: string };

export function projectDungeonLandmark(state: DungeonState): DungeonLandmarkView | null {
  if (state.layoutVersion !== 3) return null;
  if (!state.discoveredCellIds.includes(state.exitCellId)) {
    return { kind: "far-stair-shrine", status: "promised", cellId: null };
  }
  return {
    kind: "far-stair-shrine",
    status: state.latestShrineUse?.cellId === state.exitCellId ? "awakened" : "mapped",
    cellId: state.exitCellId,
  };
}

export function projectDungeonMoveKnowledge(state: DungeonState): readonly DungeonMoveKnowledge[] {
  const current = state.cells.find((cell) => cell.id === state.currentCellId);
  if (current === undefined) throw new Error("Current dungeon cell is missing");
  const projectedKey = projectDungeonKeyGate(state)?.key;
  const sightedKeyCellId = projectedKey?.status === "sighted" ? projectedKey.cellId : null;
  return dungeonMoveOptions(state).flatMap((direction) => {
    const [dx, dy] = delta[direction];
    const destination = state.cells.find((cell) => cell.x === current.x + dx && cell.y === current.y + dy);
    if (destination === undefined) return [];
    const trap = destination.feature === "trap" ? dungeonTrapAt(state, destination.id) : null;
    return [{
      direction,
      destinationCellId: destination.id,
      feature: trap?.phase === "hidden" ? "empty" : destination.feature,
      sightedWayfinderKey: destination.id === sightedKeyCellId,
    }];
  });
}

export function canUnlockDungeonGate(state: DungeonState): boolean {
  return state.keyGate?.phase === "carried" && state.currentCellId === state.keyGate.unlockCellId;
}

export function unlockDungeonGate(state: DungeonState): DungeonState {
  if (!canUnlockDungeonGate(state) || state.keyGate === null) {
    throw new Error("Dungeon gate cannot be unlocked here without its key");
  }
  const opened: DungeonState = {
    ...state,
    keyGate: { ...state.keyGate, phase: "open" },
  };
  return { ...opened, discoveredCellIds: discoveredFromVisited(opened) };
}

export function generateDungeon(
  seed: string,
  dungeonId: string,
  requestedWidth = 8,
  requestedHeight = 8,
  includeTransientEntryHazard = false,
  layoutVersion: 2 | 3 = 2,
  trapRulesVersion: 1 | 2 = 1,
  secretPassageRulesVersion?: 1,
): DungeonState {
  if (layoutVersion !== 2 && layoutVersion !== 3) throw new RangeError("Generated dungeon layout version must be 2 or 3");
  if (trapRulesVersion !== 1 && trapRulesVersion !== 2) throw new RangeError("Generated trap rules must be 1 or 2");
  if (secretPassageRulesVersion !== undefined && secretPassageRulesVersion !== 1) throw new RangeError("Generated secret passage rules must be 1");
  const width = dimension(requestedWidth);
  const height = dimension(requestedHeight);
  const exitSets = Array.from({ length: width * height }, () => new Set<MazeDirection>());
  const visited = new Set<number>([0]);
  const stack: number[] = [0];
  let choiceOrdinal = 0;
  while (stack.length > 0) {
    const currentIndex = stack[stack.length - 1];
    if (currentIndex === undefined) break;
    const x = currentIndex % width;
    const y = Math.floor(currentIndex / width);
    const candidates = neighboringCoordinates(width, height, x, y).filter(({ x: nextX, y: nextY }) => !visited.has(cellIndex(width, nextX, nextY)));
    if (candidates.length === 0) {
      stack.pop();
      continue;
    }
    const candidate = candidates[randomInt(candidates.length, seed, "dungeon", dungeonId, choiceOrdinal, "carve")];
    choiceOrdinal += 1;
    if (candidate === undefined) throw new Error("Maze generation could not select a neighbor");
    const nextIndex = cellIndex(width, candidate.x, candidate.y);
    exitSets[currentIndex]?.add(candidate.direction);
    exitSets[nextIndex]?.add(opposite[candidate.direction]);
    visited.add(nextIndex);
    stack.push(nextIndex);
  }

  const cells: MazeCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const id = mazeCellId(dungeonId, x, y);
      const feature = x === 0 && y === 0 && !includeTransientEntryHazard
        ? "empty"
        : pick(features, seed, "dungeon", id, 0, "feature");
      cells.push({ id, x, y, exits: directions.filter((direction) => exitSets[cellIndex(width, x, y)]?.has(direction)), feature });
    }
  }
  const entryCellId = mazeCellId(dungeonId, 0, 0);
  const exitCellId = farthestCell(cells, entryCellId);
  const generated = generateDungeonKeyGate(cells, dungeonId, entryCellId, exitCellId);
  const finalCells = layoutVersion === 3
    ? generated.cells.map((cell): MazeCell => cell.id === exitCellId ? { ...cell, feature: "shrine" } : cell)
    : generated.cells;
  const traps = finalCells.filter((cell) => cell.feature === "trap").map((cell) => generatedTrap(seed, cell.id, "hidden", trapRulesVersion));
  const base: DungeonState = {
    layoutVersion,
    trapRulesVersion,
    keyGate: generated.keyGate,
    latestShrineUse: null,
    latestDisarmKitUse: null,
    latestFieldMedicineUse: null,
    ...(secretPassageRulesVersion === 1 ? { secretPassage: createDungeonSecretPassageState() } : {}),
    search: createDungeonSearchState(),
    id: dungeonId,
    name: pick(names, seed, "dungeon", dungeonId, 0, "name"),
    width,
    height,
    cells: finalCells,
    entryCellId,
    exitCellId,
    currentCellId: entryCellId,
    visitedCellIds: [entryCellId],
    discoveredCellIds: [entryCellId],
    traps,
    traversalLog: ["Entered the maze."],
    turns: 0,
    completed: false,
  };
  return { ...base, discoveredCellIds: discoveredAround(base, entryCellId) };
}

export function migrateDungeonFarStairShrine(state: DungeonState): DungeonState {
  if (state.layoutVersion !== 2 || state.keyGate === null) {
    throw new Error("Only a layout-v2 keyed dungeon can receive the far-stair landmark migration");
  }
  const exit = state.cells.find((cell) => cell.id === state.exitCellId);
  if (exit === undefined) throw new Error("Dungeon far stair is missing");
  const cells = state.cells.map((cell): MazeCell => cell.id === state.exitCellId ? { ...cell, feature: "shrine" } : cell);
  return {
    ...state,
    layoutVersion: 3,
    cells,
    traps: state.traps.filter((trap) => trap.cellId !== state.exitCellId),
    completed: state.completed,
  };
}

export function moveDungeon(state: DungeonState, direction: MazeDirection): DungeonState {
  if (state.completed) return state;
  const current = state.cells.find((cell) => cell.id === state.currentCellId);
  if (current === undefined) throw new Error("Current maze cell is missing");
  if (!dungeonEffectiveExits(state, current.id).includes(direction)) throw new Error(`There is no passage ${direction}`);
  const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
  const rawDestination = physicalNeighbor(state, byId, current, direction);
  if (rawDestination === null) throw new Error(`There is no reciprocal passage ${direction}`);
  if (!isDungeonPassageOpen(state, current.id, rawDestination.id)) {
    throw new Error("The locked dungeon gate requires its key");
  }
  const destinationId = rawDestination.id;
  const destinationTrap = dungeonTrapAt(state, destinationId);
  const collectedKey = state.keyGate?.phase === "uncollected" && state.keyGate.keyCellId === destinationId;
  const crossedGate = isDungeonGateEdge(state, current.id, destinationId) && state.keyGate?.phase === "open";
  const visited = new Set(state.visitedCellIds);
  visited.add(destinationId);
  const moved: DungeonState = {
    ...state,
    keyGate: collectedKey && state.keyGate !== null
      ? { ...state.keyGate, phase: "carried" }
      : state.keyGate,
    currentCellId: destinationId,
    visitedCellIds: [...visited],
    traversalLog: [
      ...state.traversalLog.slice(-63),
      collectedKey
        ? `${dungeonKeyName} found in ${destinationId}.`
        : crossedGate
          ? `Crossed the opened shortcut ${direction} to ${destinationId}.${destinationId === state.exitCellId ? " The far stair is reached." : ""}`
          : `Moved ${direction} to ${destinationId}.`,
    ],
    turns: state.turns + 1,
    completed: destinationId === state.exitCellId && destinationTrap?.phase !== "hidden" && destinationTrap?.phase !== "detected",
  };
  return { ...moved, discoveredCellIds: discoveredAround(moved, destinationId) };
}

export function resolveDungeonTrap(
  state: DungeonState,
  cellId: string,
  firstVisit: boolean,
  healthBefore: number,
  maxHealth: number,
  manaBefore?: number,
  maxMana?: number,
): DungeonTrapConsequence | null {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  const trap = dungeonTrapAt(state, cellId);
  if (!firstVisit || cell?.feature !== "trap" || trap === null || trap.phase === "disarmed" || trap.phase === "triggered") return null;
  const boundedHealth = Math.max(0, Math.min(maxHealth, healthBefore));
  if (trap.kind === "mana-siphon") {
    if (state.trapRulesVersion !== 2 || !Number.isSafeInteger(manaBefore) || !Number.isSafeInteger(maxMana)
      || (manaBefore as number) < 0 || (maxMana as number) < 0 || (manaBefore as number) > (maxMana as number)) {
      throw new TypeError("Mana siphon requires rules 2 and exact valid mana resources");
    }
    const manaLost = Math.min(manaBefore as number, Math.ceil((maxMana as number) / 4));
    return {
      schemaVersion: 2, effect: "mana-loss", dungeonId: state.id, cellId,
      damage: 0, healthBefore: boundedHealth, healthAfter: boundedHealth,
      manaBefore: manaBefore as number, manaLost, manaAfter: (manaBefore as number) - manaLost, maxMana: maxMana as number,
    };
  }
  const rawDamage = Math.max(1, Math.floor(maxHealth / 10));
  const healthAfter = Math.max(0, boundedHealth - rawDamage);
  return {
    dungeonId: state.id,
    cellId,
    damage: boundedHealth - healthAfter,
    healthBefore: boundedHealth,
    healthAfter,
  };
}

export function projectDungeonTraps(state: DungeonState): readonly DungeonTrapView[] {
  const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
  return state.traps
    .filter((trap): trap is DungeonTrapState & { phase: Exclude<DungeonTrapPhase, "hidden"> } => trap.phase !== "hidden")
    .flatMap((trap) => {
      const cell = byId.get(trap.cellId);
      return cell === undefined ? [] : [{
        cellId: cell.id,
        x: cell.x,
        y: cell.y,
        kind: trap.kind,
        status: trap.phase === "detected" ? "armed" as const : trap.phase,
        detectDifficulty: trap.detectDifficulty,
        disarmDifficulty: trap.disarmDifficulty,
        current: cell.id === state.currentCellId,
      }];
    })
    .sort((left, right) => left.y - right.y || left.x - right.x || (left.cellId < right.cellId ? -1 : left.cellId > right.cellId ? 1 : 0));
}

function routeToKnownCell(
  state: DungeonState,
  byId: ReadonlyMap<string, MazeCell>,
  targetCellId: string,
): readonly string[] | null {
  const visited = new Set(state.visitedCellIds);
  const discovered = new Set(state.discoveredCellIds);
  if (!discovered.has(targetCellId)) return null;
  const queue = [state.currentCellId];
  const reached = new Set(queue);
  const predecessor = new Map<string, string | null>([[state.currentCellId, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = byId.get(queue[cursor] ?? "");
    if (current === undefined) continue;
    if (current.id === targetCellId) break;
    for (const direction of dungeonEffectiveExits(state, current.id)) {
      const neighbor = effectiveNeighbor(state, byId, current, direction);
      if (
        neighbor === null
        || reached.has(neighbor.id)
        || (!visited.has(neighbor.id) && neighbor.id !== targetCellId)
      ) continue;
      reached.add(neighbor.id);
      predecessor.set(neighbor.id, current.id);
      queue.push(neighbor.id);
    }
  }
  if (!predecessor.has(targetCellId)) return null;
  const route: string[] = [];
  let cursor: string | null = targetCellId;
  while (cursor !== null) {
    route.push(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }
  return route.reverse();
}

function routeFirstDirection(
  byId: ReadonlyMap<string, MazeCell>,
  routeCellIds: readonly string[],
): MazeDirection | null {
  const from = byId.get(routeCellIds[0] ?? "");
  const to = byId.get(routeCellIds[1] ?? "");
  return from === undefined || to === undefined ? null : directionBetween(from, to);
}

export function projectDungeonWayfinding(state: DungeonState): DungeonWayfindingView {
  const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
  const current = byId.get(state.currentCellId);
  if (current === undefined) throw new Error("Current dungeon cell is missing");
  if (state.completed) {
    return {
      mode: "complete",
      currentCellId: current.id,
      frontierCellId: null,
      routeCellIds: [],
      frontierDirections: [],
      nextDirection: null,
      nextPassageDirections: [],
      roomsToFrontier: 0,
    };
  }
  if (dungeonTrapAt(state, current.id)?.phase === "detected") {
    return {
      mode: "hazard",
      currentCellId: current.id,
      frontierCellId: null,
      routeCellIds: [current.id],
      frontierDirections: [],
      nextDirection: null,
      nextPassageDirections: [],
      roomsToFrontier: 0,
    };
  }
  const gate = state.keyGate;
  if (gate?.phase === "carried" && state.discoveredCellIds.includes(gate.unlockCellId)) {
    if (current.id === gate.unlockCellId) {
      return {
        mode: "unlock-gate",
        currentCellId: current.id,
        frontierCellId: current.id,
        routeCellIds: [current.id],
        frontierDirections: [],
        nextDirection: null,
        nextPassageDirections: [],
        roomsToFrontier: 0,
      };
    }
    const routeCellIds = routeToKnownCell(state, byId, gate.unlockCellId);
    const nextDirection = routeCellIds === null ? null : routeFirstDirection(byId, routeCellIds);
    if (routeCellIds !== null && nextDirection !== null) {
      return {
        mode: "return-to-gate",
        currentCellId: current.id,
        frontierCellId: gate.unlockCellId,
        routeCellIds,
        frontierDirections: [],
        nextDirection,
        nextPassageDirections: [nextDirection],
        roomsToFrontier: routeCellIds.length - 1,
      };
    }
  }
  if (gate?.phase === "open" && current.id === gate.unlockCellId && !state.visitedCellIds.includes(gate.shortcutCellId)) {
    const shortcutCell = byId.get(gate.shortcutCellId);
    const gateDirection = shortcutCell === undefined ? null : directionBetween(current, shortcutCell);
    if (gateDirection === null) throw new Error("Open dungeon gate endpoints are not adjacent");
    return {
      mode: "cross-gate",
      currentCellId: current.id,
      frontierCellId: current.id,
      routeCellIds: [current.id],
      frontierDirections: [gateDirection],
      nextDirection: gateDirection,
      nextPassageDirections: [gateDirection],
      roomsToFrontier: 0,
    };
  }
  const visited = new Set(state.visitedCellIds);
  const frontierDirections = (cell: MazeCell): readonly MazeDirection[] =>
    dungeonEffectiveExits(state, cell.id).filter((direction) => {
      const rawNeighbor = physicalNeighbor(state, byId, cell, direction);
      if (rawNeighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
      const neighbor = effectiveNeighbor(state, byId, cell, direction);
      if (neighbor === null) return false;
      return !visited.has(neighbor.id);
    });
  const localFrontier = frontierDirections(current);
  if (localFrontier.length > 0) {
    return {
      mode: "explore",
      currentCellId: current.id,
      frontierCellId: current.id,
      routeCellIds: [current.id],
      frontierDirections: localFrontier,
      nextDirection: null,
      nextPassageDirections: localFrontier,
      roomsToFrontier: 0,
    };
  }

  const queue: { cellId: string; firstDirection: MazeDirection | null }[] = [
    { cellId: current.id, firstDirection: null },
  ];
  const reached = new Set<string>([current.id]);
  const predecessor = new Map<string, string | null>([[current.id, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const entry = queue[cursor];
    if (entry === undefined) continue;
    const cell = byId.get(entry.cellId);
    if (cell === undefined) continue;
    const directions = frontierDirections(cell);
    if (directions.length > 0 && entry.firstDirection !== null) {
      const routeCellIds: string[] = [];
      let routeCursor: string | null = cell.id;
      while (routeCursor !== null) {
        routeCellIds.push(routeCursor);
        routeCursor = predecessor.get(routeCursor) ?? null;
      }
      routeCellIds.reverse();
      return {
        mode: "retrace",
        currentCellId: current.id,
        frontierCellId: cell.id,
        routeCellIds,
        frontierDirections: directions,
        nextDirection: entry.firstDirection,
        nextPassageDirections: [entry.firstDirection],
        roomsToFrontier: routeCellIds.length - 1,
      };
    }
    for (const direction of dungeonEffectiveExits(state, cell.id)) {
      const rawNeighbor = physicalNeighbor(state, byId, cell, direction);
      if (rawNeighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
      const neighbor = effectiveNeighbor(state, byId, cell, direction);
      if (neighbor === null) continue;
      if (!visited.has(neighbor.id) || reached.has(neighbor.id)) continue;
      reached.add(neighbor.id);
      predecessor.set(neighbor.id, cell.id);
      queue.push({
        cellId: neighbor.id,
        firstDirection: entry.firstDirection ?? direction,
      });
    }
  }
  throw new Error("Incomplete dungeon has no reachable exploration frontier");
}

export function projectDungeonTraversal(state: DungeonState): DungeonTraversalPlan {
  const wayfinding = projectDungeonWayfinding(state);
  return {
    mode: wayfinding.mode,
    options: wayfinding.nextPassageDirections,
    roomsToFrontier: wayfinding.roomsToFrontier,
  };
}

export function dungeonMoveOptions(state: DungeonState): readonly MazeDirection[] {
  return projectDungeonTraversal(state).options;
}

export function chooseDungeonMove(state: DungeonState, seed: string, tick: number): MazeDirection | null {
  const choices = dungeonMoveOptions(state);
  if (choices.length === 0) return null;
  return pick(choices, seed, "dungeon-traversal", state.id, tick, "direction");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates family/rules compatibility only, not grid geometry or trap receipts. */
export function isValidDungeonTrapRules(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.traps)) return false;
  if (Object.hasOwn(value, "trapRulesVersion") && value.trapRulesVersion !== 1 && value.trapRulesVersion !== 2) return false;
  for (const trap of value.traps) {
    if (!isRecord(trap) || !trapKinds.includes(trap.kind as DungeonTrapKind)
      || (trap.kind === "mana-siphon" && value.trapRulesVersion !== 2)) return false;
  }
  return true;
}

export function isValidDungeonState(value: unknown): value is DungeonState {
  if (!isRecord(value) || !isValidDungeonTrapRules(value)) return false;
  if (!isValidDungeonSecretPassage(value as unknown as DungeonState)) return false;
  if (Object.hasOwn(value, "latestFieldMedicineUse")
    && !isValidDungeonFieldMedicineUse(value.latestFieldMedicineUse, value as unknown as DungeonState)) return false;
  if (value.search !== undefined && !isValidDungeonSearchState(value.search, value as unknown as DungeonState)) return false;
  if (validDungeonStateCache.has(value)) return true;
  const state = value as unknown as DungeonState;
  if (
    typeof state.id !== "string" || state.id.length === 0
    || typeof state.name !== "string" || state.name.length === 0
    || !Number.isSafeInteger(state.width) || state.width < 3 || state.width > 24
    || !Number.isSafeInteger(state.height) || state.height < 3 || state.height > 24
    || !Array.isArray(state.cells) || state.cells.length !== state.width * state.height
    || !Array.isArray(state.visitedCellIds) || !Array.isArray(state.discoveredCellIds) || !Array.isArray(state.traps)
    || !Array.isArray(state.traversalLog) || state.traversalLog.length > 64
    || !Number.isSafeInteger(state.turns) || state.turns < 0
    || (state.layoutVersion !== 1 && state.layoutVersion !== 2 && state.layoutVersion !== 3)
    || typeof state.completed !== "boolean"
  ) return false;
  const byId = new Map<string, MazeCell>();
  const coordinates = new Set<string>();
  for (const candidate of state.cells as readonly unknown[]) {
    if (!isRecord(candidate)) return false;
    const cell = candidate as unknown as MazeCell;
    if (
      !Number.isSafeInteger(cell.x) || cell.x < 0 || cell.x >= state.width
      || !Number.isSafeInteger(cell.y) || cell.y < 0 || cell.y >= state.height
      || cell.id !== mazeCellId(state.id, cell.x, cell.y)
      || !Array.isArray(cell.exits)
      || cell.exits.some((direction) => !directions.includes(direction))
      || new Set(cell.exits).size !== cell.exits.length
      || !features.includes(cell.feature)
      || byId.has(cell.id) || coordinates.has(`${cell.x},${cell.y}`)
    ) return false;
    byId.set(cell.id, cell);
    coordinates.add(`${cell.x},${cell.y}`);
  }
  if (!byId.has(state.entryCellId) || !byId.has(state.exitCellId) || !byId.has(state.currentCellId)) return false;
  const visited = new Set(state.visitedCellIds);
  const discovered = new Set(state.discoveredCellIds);
  if (state.latestShrineUse !== null) {
    if (!isRecord(state.latestShrineUse)) return false;
    const use = state.latestShrineUse;
    const shrine = typeof use.cellId === "string" ? byId.get(use.cellId) : undefined;
    if (
      use.dungeonId !== state.id
      || shrine?.feature !== "shrine"
      || !visited.has(use.cellId)
      || !Number.isSafeInteger(use.tick) || use.tick < 1
      || !Number.isSafeInteger(use.healthBefore) || use.healthBefore < 0
      || !Number.isSafeInteger(use.healthRestored) || use.healthRestored < 0
      || !Number.isSafeInteger(use.healthAfter) || use.healthAfter < 0
      || use.healthBefore + use.healthRestored !== use.healthAfter
      || !Number.isSafeInteger(use.manaBefore) || use.manaBefore < 0
      || !Number.isSafeInteger(use.manaRestored) || use.manaRestored < 0
      || !Number.isSafeInteger(use.manaAfter) || use.manaAfter < 0
      || use.manaBefore + use.manaRestored !== use.manaAfter
    ) return false;
  }
  if (state.layoutVersion === 1 && state.keyGate !== null) return false;
  if (state.layoutVersion === 3 && byId.get(state.exitCellId)?.feature !== "shrine") return false;
  if (state.layoutVersion === 2 || state.layoutVersion === 3) {
    if (!isRecord(state.keyGate)) return false;
    const gate = state.keyGate as DungeonKeyGateState;
    if (
      typeof gate.keyCellId !== "string"
      || typeof gate.unlockCellId !== "string"
      || typeof gate.shortcutCellId !== "string"
      || (gate.phase !== "uncollected" && gate.phase !== "carried" && gate.phase !== "open")
      || new Set([gate.keyCellId, gate.unlockCellId, gate.shortcutCellId]).size !== 3
      || gate.keyCellId === state.entryCellId
      || gate.keyCellId === state.exitCellId
    ) return false;
    const keyCell = byId.get(gate.keyCellId);
    const unlockCell = byId.get(gate.unlockCellId);
    const shortcutCell = byId.get(gate.shortcutCellId);
    const gateDirection = unlockCell === undefined || shortcutCell === undefined
      ? null
      : directionBetween(unlockCell, shortcutCell);
    if (
      keyCell === undefined || unlockCell === undefined || shortcutCell === undefined || gateDirection === null
      || keyCell.feature !== "empty"
      || (unlockCell.id === state.exitCellId && state.layoutVersion === 3 ? unlockCell.feature !== "shrine" : unlockCell.feature !== "empty")
      || (shortcutCell.id === state.exitCellId && state.layoutVersion === 3 ? shortcutCell.feature !== "shrine" : shortcutCell.feature !== "empty")
      || !unlockCell.exits.includes(gateDirection)
      || !shortcutCell.exits.includes(opposite[gateDirection])
      || (gate.phase === "uncollected" && (visited.has(gate.keyCellId) || visited.has(gate.shortcutCellId)))
      || (gate.phase === "carried" && (!visited.has(gate.keyCellId) || !visited.has(gate.unlockCellId) || visited.has(gate.shortcutCellId)))
      || (gate.phase === "open" && (!visited.has(gate.keyCellId) || !visited.has(gate.unlockCellId)))
      || (gate.phase === "open" && !visited.has(gate.shortcutCellId) && state.currentCellId !== gate.unlockCellId)
    ) return false;
    const baseCells = state.cells.map((cell): MazeCell => {
      if (cell.id !== gate.unlockCellId && cell.id !== gate.shortcutCellId) return cell;
      const blockedDirection = cell.id === gate.unlockCellId ? gateDirection : opposite[gateDirection];
      return { ...cell, exits: cell.exits.filter((direction: MazeDirection) => direction !== blockedDirection) };
    });
    if (baseCells.reduce((total, cell) => total + cell.exits.length, 0) !== (state.cells.length - 1) * 2) return false;
    try {
      const basePath = pathBetween(baseCells, state.id, state.entryCellId, state.exitCellId);
      const unlockIndex = basePath.indexOf(gate.unlockCellId);
      const keyIndex = basePath.indexOf(gate.keyCellId);
      const shortcutIndex = basePath.indexOf(gate.shortcutCellId);
      const heroRouteSaving = shortcutIndex + unlockIndex - keyIndex * 2 - 1;
      if (
        unlockIndex < 0
        || keyIndex <= unlockIndex
        || shortcutIndex <= keyIndex
        || shortcutIndex - unlockIndex - 1 < 3
        || heroRouteSaving < 1
      ) return false;
      const baseReached = new Set<string>([state.entryCellId]);
      const baseById = new Map(baseCells.map((cell) => [cell.id, cell]));
      const baseQueue = [state.entryCellId];
      for (let cursor = 0; cursor < baseQueue.length; cursor += 1) {
        const cell = baseById.get(baseQueue[cursor] ?? "");
        if (cell === undefined) return false;
        for (const direction of orderedExits(cell)) {
          const neighbor = legalNeighbor(state, baseById, cell, direction);
          if (neighbor === null || baseReached.has(neighbor.id)) continue;
          baseReached.add(neighbor.id);
          baseQueue.push(neighbor.id);
        }
      }
      if (baseReached.size !== state.cells.length) return false;
    } catch {
      return false;
    }
  }
  const trapCells = state.cells.filter((cell) => cell.feature === "trap");
  if (state.layoutVersion === 3 && trapCells.some((cell) => cell.id === state.exitCellId)) return false;
  const trapCellIds = new Set(trapCells.map((cell) => cell.id));
  const trapIds = new Set<string>();
  for (const candidate of state.traps as readonly unknown[]) {
    if (!isRecord(candidate)) return false;
    const trap = candidate as unknown as DungeonTrapState;
    if (
      !trapCellIds.has(trap.cellId) || trapIds.has(trap.cellId)
      || !trapKinds.includes(trap.kind) || !trapPhases.includes(trap.phase)
      || (trap.kind === "mana-siphon" && state.trapRulesVersion !== 2)
      || !Number.isSafeInteger(trap.detectDifficulty) || trap.detectDifficulty < 10 || trap.detectDifficulty > 14
      || !Number.isSafeInteger(trap.disarmDifficulty) || trap.disarmDifficulty < 11 || trap.disarmDifficulty > 16
      || (trap.phase !== "hidden" && !discovered.has(trap.cellId))
      || (trap.phase === "hidden" && visited.has(trap.cellId))
      || ((trap.phase === "disarmed" || trap.phase === "triggered") && !visited.has(trap.cellId))
      || (trap.phase === "detected" && state.currentCellId === state.exitCellId && state.completed)
    ) return false;
    trapIds.add(trap.cellId);
  }
  if (
    visited.size !== state.visitedCellIds.length
    || discovered.size !== state.discoveredCellIds.length
    || !visited.has(state.currentCellId)
    || [...visited].some((id) => !byId.has(id) || !discovered.has(id))
    || [...discovered].some((id) => !byId.has(id))
    || state.traversalLog.some((entry) => typeof entry !== "string")
    || trapIds.size !== trapCellIds.size
  ) return false;
  const currentTrap = state.traps.find((trap) => trap.cellId === state.currentCellId);
  const completionExpected = state.currentCellId === state.exitCellId && currentTrap?.phase !== "hidden" && currentTrap?.phase !== "detected";
  if (state.completed !== completionExpected) return false;
  for (const cell of state.cells) {
    for (const direction of orderedExits(cell)) {
      if (legalNeighbor(state, byId, cell, direction) === null) return false;
    }
  }
  for (const cellId of visited) {
    const cell = byId.get(cellId);
    if (cell === undefined) return false;
    for (const direction of orderedExits(cell)) {
      const rawNeighbor = legalNeighbor(state, byId, cell, direction);
      if (rawNeighbor === null) return false;
      const neighbor = effectiveNeighbor(state, byId, cell, direction);
      if (neighbor !== null && !discovered.has(neighbor.id)) return false;
    }
  }
  const reached = new Set<string>([state.entryCellId]);
  const queue = [state.entryCellId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = byId.get(queue[cursor] ?? "");
    if (cell === undefined) return false;
    for (const direction of orderedExits(cell)) {
      const neighbor = legalNeighbor(state, byId, cell, direction);
      if (neighbor === null || reached.has(neighbor.id)) continue;
      reached.add(neighbor.id);
      queue.push(neighbor.id);
    }
  }
  if (reached.size !== state.cells.length) return false;
  if (!state.completed) {
    try {
      const traversal = projectDungeonTraversal(state);
      if (traversal.options.length === 0 && traversal.mode !== "hazard" && traversal.mode !== "unlock-gate") return false;
    } catch {
      return false;
    }
  }
  if (state.latestDisarmKitUse !== undefined
    && !isValidDungeonDisarmKitUse(state.latestDisarmKitUse, state, Number.MAX_SAFE_INTEGER)) return false;
  validDungeonStateCache.add(value);
  return true;
}
