import { pick, randomInt } from "../core/rng";
import type { DungeonState, MazeCell, MazeDirection } from "./types";

const directions: readonly MazeDirection[] = ["north", "east", "south", "west"];
const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };
const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const features: readonly MazeCell["feature"][] = ["empty", "empty", "empty", "treasure", "trap", "shrine", "lair"];
const names = ["Ashen Archive", "Clockroot Vault", "Hollow Crown", "Moonkennel", "Salt Labyrinth"] as const;
const validDungeonStateCache = new WeakSet<object>();

export interface DungeonTraversalPlan {
  mode: "complete" | "explore" | "retrace";
  options: readonly MazeDirection[];
  roomsToFrontier: number;
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

export function generateDungeon(seed: string, dungeonId: string, requestedWidth = 8, requestedHeight = 8): DungeonState {
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
      cells.push({ id, x, y, exits: directions.filter((direction) => exitSets[cellIndex(width, x, y)]?.has(direction)), feature: pick(features, seed, "dungeon", id, 0, "feature") });
    }
  }
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
  const visited = new Set(state.visitedCellIds);
  visited.add(destinationId);
  const moved: DungeonState = {
    ...state,
    currentCellId: destinationId,
    visitedCellIds: [...visited],
    traversalLog: [...state.traversalLog.slice(-63), `Moved ${direction} to ${destinationId}.`],
    turns: state.turns + 1,
    completed: destinationId === state.exitCellId,
  };
  return { ...moved, discoveredCellIds: discoveredAround(moved, destinationId) };
}

export function projectDungeonTraversal(state: DungeonState): DungeonTraversalPlan {
  if (state.completed) return { mode: "complete", options: [], roomsToFrontier: 0 };
  const byId = new Map(state.cells.map((cell) => [cell.id, cell]));
  const current = byId.get(state.currentCellId);
  if (current === undefined) throw new Error("Current dungeon cell is missing");
  const visited = new Set(state.visitedCellIds);
  const localFrontier = orderedExits(current).filter(
    (direction) => {
      const neighbor = legalNeighbor(state, byId, current, direction);
      if (neighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
      return !visited.has(neighbor.id);
    },
  );
  if (localFrontier.length > 0) return { mode: "explore", options: localFrontier, roomsToFrontier: 0 };

  const queue: { cellId: string; firstDirection: MazeDirection | null; distance: number }[] = [
    { cellId: current.id, firstDirection: null, distance: 0 },
  ];
  const reached = new Set<string>([current.id]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const entry = queue[cursor];
    if (entry === undefined) continue;
    const cell = byId.get(entry.cellId);
    if (cell === undefined) continue;
    const frontier = orderedExits(cell).some(
      (direction) => {
        const neighbor = legalNeighbor(state, byId, cell, direction);
        if (neighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
        return !visited.has(neighbor.id);
      },
    );
    if (frontier && entry.firstDirection !== null) {
      return { mode: "retrace", options: [entry.firstDirection], roomsToFrontier: entry.distance };
    }
    for (const direction of orderedExits(cell)) {
      const neighbor = legalNeighbor(state, byId, cell, direction);
      if (neighbor === null) throw new Error(`Dungeon passage ${direction} is not reciprocal`);
      if (!visited.has(neighbor.id) || reached.has(neighbor.id)) continue;
      reached.add(neighbor.id);
      queue.push({ cellId: neighbor.id, firstDirection: entry.firstDirection ?? direction, distance: entry.distance + 1 });
    }
  }
  throw new Error("Incomplete dungeon has no reachable exploration frontier");
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
    || !Array.isArray(state.visitedCellIds) || !Array.isArray(state.discoveredCellIds)
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
  if (
    visited.size !== state.visitedCellIds.length
    || discovered.size !== state.discoveredCellIds.length
    || !visited.has(state.currentCellId)
    || [...visited].some((id) => !byId.has(id) || !discovered.has(id))
    || [...discovered].some((id) => !byId.has(id))
    || state.traversalLog.some((entry) => typeof entry !== "string")
    || state.completed !== (state.currentCellId === state.exitCellId)
  ) return false;
  for (const cell of state.cells) {
    for (const direction of orderedExits(cell)) {
      if (legalNeighbor(state, byId, cell, direction) === null) return false;
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
      if (projectDungeonTraversal(state).options.length === 0) return false;
    } catch {
      return false;
    }
  }
  validDungeonStateCache.add(value);
  return true;
}
