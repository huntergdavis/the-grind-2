import { pick, randomInt } from "../core/rng";
import type { DungeonState, MazeCell, MazeDirection } from "./types";

const directions: readonly MazeDirection[] = ["north", "east", "south", "west"];
const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };
const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const features: readonly MazeCell["feature"][] = ["empty", "empty", "empty", "treasure", "trap", "shrine", "lair"];
const names = ["Ashen Archive", "Clockroot Vault", "Hollow Crown", "Moonkennel", "Salt Labyrinth"] as const;

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

export function chooseDungeonMove(state: DungeonState, seed: string, tick: number): MazeDirection | null {
  if (state.completed) return null;
  const current = state.cells.find((cell) => cell.id === state.currentCellId);
  if (current === undefined || current.exits.length === 0) return null;
  const unvisited = current.exits.filter((direction) => {
    const change = delta[direction];
    return !state.visitedCellIds.includes(mazeCellId(state.id, current.x + change[0], current.y + change[1]));
  });
  const choices = unvisited.length > 0 ? unvisited : current.exits;
  return pick(choices, seed, "dungeon-traversal", state.id, tick, "direction");
}
