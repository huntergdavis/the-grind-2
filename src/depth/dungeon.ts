import { pick, randomInt } from "../core/rng";
import type { DungeonState, DungeonTrapKind, DungeonTrapPhase, DungeonTrapState, MazeCell, MazeDirection } from "./types";

const directions: readonly MazeDirection[] = ["north", "east", "south", "west"];
const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };
const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const features: readonly MazeCell["feature"][] = ["empty", "empty", "empty", "treasure", "trap", "shrine", "lair"];
const trapKinds: readonly DungeonTrapKind[] = ["tripwire", "rune-ward"];
const trapPhases: readonly DungeonTrapPhase[] = ["hidden", "detected", "disarmed", "triggered"];
const names = ["Ashen Archive", "Clockroot Vault", "Hollow Crown", "Moonkennel", "Salt Labyrinth"] as const;
const validDungeonStateCache = new WeakSet<object>();

export interface DungeonTraversalPlan {
  mode: "complete" | "explore" | "hazard" | "retrace";
  options: readonly MazeDirection[];
  roomsToFrontier: number;
}

export interface DungeonWayfindingView {
  mode: "complete" | "explore" | "hazard" | "retrace";
  currentCellId: string;
  frontierCellId: string | null;
  routeCellIds: readonly string[];
  frontierDirections: readonly MazeDirection[];
  nextDirection: MazeDirection | null;
  nextPassageDirections: readonly MazeDirection[];
  roomsToFrontier: number;
}

export interface DungeonTrapConsequence {
  dungeonId: string;
  cellId: string;
  damage: number;
  healthBefore: number;
  healthAfter: number;
}

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
};

function generatedTrap(seed: string, cellId: string, phase: DungeonTrapPhase = "hidden"): DungeonTrapState {
  return {
    cellId,
    kind: pick(trapKinds, seed, "dungeon-trap", cellId, 0, "kind"),
    detectDifficulty: 10 + randomInt(5, seed, "dungeon-trap", cellId, 0, "detect-difficulty"),
    disarmDifficulty: 11 + randomInt(6, seed, "dungeon-trap", cellId, 0, "disarm-difficulty"),
    phase,
  };
}

export function dungeonTrapKindLabel(kind: DungeonTrapKind): string {
  return kind === "tripwire" ? "whisper-wire" : "echo rune";
}

export function dungeonTrapCheckAttribute(kind: DungeonTrapKind, stage: "detect" | "disarm"): DungeonTrapCheckAttribute {
  return trapAttributes[kind][stage];
}

export function migrateDungeonTraps(state: Omit<DungeonState, "traps">, seed: string): DungeonState {
  const discovered = new Set(state.discoveredCellIds);
  const visited = new Set(state.visitedCellIds);
  return {
    ...state,
    traps: state.cells
      .filter((cell) => cell.feature === "trap")
      .map((cell) => generatedTrap(
        seed,
        cell.id,
        visited.has(cell.id) ? "triggered" : discovered.has(cell.id) ? "detected" : "hidden",
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
  const discovered = new Set(state.discoveredCellIds);
  discovered.add(cell.id);
  for (const direction of cell.exits) {
    const change = delta[direction];
    discovered.add(mazeCellId(state.id, cell.x + change[0], cell.y + change[1]));
  }
  return [...discovered];
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

export function generateDungeon(
  seed: string,
  dungeonId: string,
  requestedWidth = 8,
  requestedHeight = 8,
  includeTransientEntryHazard = false,
): DungeonState {
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
  const traps = cells.filter((cell) => cell.feature === "trap").map((cell) => generatedTrap(seed, cell.id));
  const entryCellId = mazeCellId(dungeonId, 0, 0);
  const base: DungeonState = {
    id: dungeonId,
    name: pick(names, seed, "dungeon", dungeonId, 0, "name"),
    width,
    height,
    cells,
    entryCellId,
    exitCellId: farthestCell(cells, entryCellId),
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

export function moveDungeon(state: DungeonState, direction: MazeDirection): DungeonState {
  if (state.completed) return state;
  const current = state.cells.find((cell) => cell.id === state.currentCellId);
  if (current === undefined) throw new Error("Current maze cell is missing");
  if (!current.exits.includes(direction)) throw new Error(`There is no passage ${direction}`);
  const change = delta[direction];
  const destinationId = mazeCellId(state.id, current.x + change[0], current.y + change[1]);
  const destinationTrap = dungeonTrapAt(state, destinationId);
  const visited = new Set(state.visitedCellIds);
  visited.add(destinationId);
  const moved: DungeonState = {
    ...state,
    currentCellId: destinationId,
    visitedCellIds: [...visited],
    traversalLog: [...state.traversalLog.slice(-63), `Moved ${direction} to ${destinationId}.`],
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
): DungeonTrapConsequence | null {
  const cell = state.cells.find((candidate) => candidate.id === cellId);
  const trap = dungeonTrapAt(state, cellId);
  if (!firstVisit || cell?.feature !== "trap" || trap === null || trap.phase === "disarmed" || trap.phase === "triggered") return null;
  const boundedHealth = Math.max(0, Math.min(maxHealth, healthBefore));
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
  const visited = new Set(state.visitedCellIds);
  const frontierDirections = (cell: MazeCell): readonly MazeDirection[] =>
    orderedExits(cell).filter((direction) => {
      const neighbor = legalNeighbor(state, byId, cell, direction);
      if (neighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
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
    for (const direction of orderedExits(cell)) {
      const neighbor = legalNeighbor(state, byId, cell, direction);
      if (neighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
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

export function isValidDungeonState(value: unknown): value is DungeonState {
  if (!isRecord(value)) return false;
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
  const trapCells = state.cells.filter((cell) => cell.feature === "trap");
  const trapCellIds = new Set(trapCells.map((cell) => cell.id));
  const trapIds = new Set<string>();
  for (const candidate of state.traps as readonly unknown[]) {
    if (!isRecord(candidate)) return false;
    const trap = candidate as unknown as DungeonTrapState;
    if (
      !trapCellIds.has(trap.cellId) || trapIds.has(trap.cellId)
      || !trapKinds.includes(trap.kind) || !trapPhases.includes(trap.phase)
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
      const neighbor = legalNeighbor(state, byId, cell, direction);
      if (neighbor === null || !discovered.has(neighbor.id)) return false;
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
      if (traversal.options.length === 0 && traversal.mode !== "hazard") return false;
    } catch {
      return false;
    }
  }
  validDungeonStateCache.add(value);
  return true;
}
