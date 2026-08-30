import { describe, expect, it } from "vitest";
import {
  chooseDungeonMove,
  dungeonMoveOptions,
  generateDungeon,
  isValidDungeonState,
  mazeCellId,
  moveDungeon,
  projectDungeonTraps,
  projectDungeonTraversal,
  resolveDungeonTrap,
} from "./dungeon";
import type { DungeonState, MazeDirection } from "./types";

const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

function pathToExit(dungeon: ReturnType<typeof generateDungeon>): readonly MazeDirection[] {
  const queue = [dungeon.entryCellId];
  const previous = new Map<string, { from: string; direction: MazeDirection }>();
  const seen = new Set(queue);
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined || currentId === dungeon.exitCellId) break;
    const current = dungeon.cells.find((cell) => cell.id === currentId);
    if (current === undefined) throw new Error("Missing test maze cell");
    for (const direction of current.exits) {
      const change = delta[direction];
      const neighbor = mazeCellId(dungeon.id, current.x + change[0], current.y + change[1]);
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        previous.set(neighbor, { from: current.id, direction });
        queue.push(neighbor);
      }
    }
  }
  const reversed: MazeDirection[] = [];
  let cursor = dungeon.exitCellId;
  while (cursor !== dungeon.entryCellId) {
    const step = previous.get(cursor);
    if (step === undefined) throw new Error("Exit is unreachable");
    reversed.push(step.direction);
    cursor = step.from;
  }
  return reversed.reverse();
}

describe("dungeon mazes", () => {
  it("resolves a marked trap only on first entry and clamps exact damage", () => {
    const id = "dungeon:trap-resolution";
    const entry = mazeCellId(id, 0, 0);
    const trapCell = mazeCellId(id, 1, 0);
    const dungeon: DungeonState = {
      id,
      name: "Hazard Fixture",
      width: 2,
      height: 1,
      cells: [
        { id: entry, x: 0, y: 0, exits: ["east"], feature: "empty" },
        { id: trapCell, x: 1, y: 0, exits: ["west"], feature: "trap" },
      ],
      entryCellId: entry,
      exitCellId: trapCell,
      currentCellId: entry,
      visitedCellIds: [entry],
      discoveredCellIds: [entry, trapCell],
      traversalLog: ["Entered the maze."],
      turns: 0,
      completed: false,
    };

    expect(resolveDungeonTrap(dungeon, trapCell, true, 31, 45)).toEqual({
      dungeonId: id,
      cellId: trapCell,
      damage: 4,
      healthBefore: 31,
      healthAfter: 27,
    });
    expect(resolveDungeonTrap(dungeon, trapCell, true, 1, 45)).toMatchObject({ damage: 1, healthBefore: 1, healthAfter: 0 });
    expect(resolveDungeonTrap(dungeon, trapCell, false, 31, 45)).toBeNull();
    expect(resolveDungeonTrap(dungeon, entry, true, 31, 45)).toBeNull();
  });

  it("projects discovered traps as stably armed or spent without mutation", () => {
    const dungeon = generateDungeon("trap-projection", "dungeon:trap-projection", 9, 7);
    const traps = dungeon.cells.filter((cell) => cell.feature === "trap");
    expect(traps.length).toBeGreaterThan(1);
    const before = JSON.stringify(dungeon);
    const projected = projectDungeonTraps({
      ...dungeon,
      discoveredCellIds: [traps[1]!.id, traps[0]!.id, dungeon.entryCellId],
      visitedCellIds: [dungeon.entryCellId, traps[1]!.id],
    });

    expect(projected).toHaveLength(2);
    expect(projected.find((trap) => trap.cellId === traps[0]!.id)?.status).toBe("armed");
    expect(projected.find((trap) => trap.cellId === traps[1]!.id)?.status).toBe("spent");
    expect(projected).toEqual([...projected].sort((left, right) => left.y - right.y || left.x - right.x));
    expect(JSON.stringify(dungeon)).toBe(before);
    expect(projectDungeonTraps(JSON.parse(JSON.stringify({
      ...dungeon,
      cells: [...dungeon.cells].reverse(),
      discoveredCellIds: [traps[0]!.id, traps[1]!.id, dungeon.entryCellId],
      visitedCellIds: [traps[1]!.id, dungeon.entryCellId],
    })))).toEqual(projected);
  });

  it("deterministically generates one connected bounded maze", () => {
    const dungeon = generateDungeon("maze-seed", "dungeon:test", 12, 10);
    expect(generateDungeon("maze-seed", "dungeon:test", 12, 10)).toEqual(dungeon);
    const reached = new Set<string>([dungeon.entryCellId]);
    const queue = [dungeon.entryCellId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const current = dungeon.cells.find((cell) => cell.id === currentId);
      if (current === undefined) break;
      for (const direction of current.exits) {
        const change = delta[direction];
        const neighbor = mazeCellId(dungeon.id, current.x + change[0], current.y + change[1]);
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(reached.size).toBe(dungeon.width * dungeon.height);
    expect(generateDungeon("bounded", "dungeon:max", 999, 999).cells).toHaveLength(24 * 24);
  });

  it("tracks actual passage-by-passage exploration through the exit", () => {
    let dungeon = generateDungeon("traverse-seed", "dungeon:walk", 8, 8);
    const path = pathToExit(dungeon);
    expect(path.length).toBeGreaterThan(0);
    for (const direction of path) dungeon = moveDungeon(dungeon, direction);
    expect(dungeon.currentCellId).toBe(dungeon.exitCellId);
    expect(dungeon.completed).toBe(true);
    expect(dungeon.turns).toBe(path.length);
    expect(dungeon.visitedCellIds.length).toBeLessThanOrEqual(dungeon.cells.length);
    expect(dungeon.discoveredCellIds.length).toBeLessThanOrEqual(dungeon.cells.length);
  });

  it("rejects walking through a wall", () => {
    const dungeon = generateDungeon("walls", "dungeon:walls", 5, 5);
    const entry = dungeon.cells.find((cell) => cell.id === dungeon.entryCellId);
    const wall = (["north", "east", "south", "west"] as const).find((direction) => !entry?.exits.includes(direction));
    if (wall !== undefined) expect(() => moveDungeon(dungeon, wall)).toThrow("no passage");
  });

  it("refuses a visited retreat while a local unvisited passage remains", () => {
    const dungeon = generateDungeon("frontier-choice", "dungeon:frontier", 7, 7);
    let state = dungeon;
    for (let turn = 0; turn < dungeon.cells.length * 2 && !state.completed; turn += 1) {
      const current = state.cells.find((cell) => cell.id === state.currentCellId);
      const options = dungeonMoveOptions(state);
      const unvisited = current?.exits.filter((direction) => {
        const change = delta[direction];
        return !state.visitedCellIds.includes(mazeCellId(state.id, current.x + change[0], current.y + change[1]));
      }) ?? [];
      if (unvisited.length > 0) expect(options.every((direction) => unvisited.includes(direction))).toBe(true);
      const direction = chooseDungeonMove(state, "frontier-choice", turn);
      expect(direction).not.toBeNull();
      state = moveDungeon(state, direction!);
    }
    expect(state.completed).toBe(true);
    expect(state.turns).toBeLessThanOrEqual(dungeon.cells.length * 2);
  });

  it("backtracks through visited rooms toward the nearest remaining frontier", () => {
    const id = "dungeon:backtrack";
    const first = mazeCellId(id, 0, 0);
    const junction = mazeCellId(id, 1, 0);
    const frontier = mazeCellId(id, 1, 1);
    const trapped: DungeonState = {
      id,
      name: "Backtrack Fixture",
      width: 2,
      height: 2,
      cells: [
        { id: first, x: 0, y: 0, exits: ["east"], feature: "empty" },
        { id: junction, x: 1, y: 0, exits: ["south", "west"], feature: "empty" },
        { id: frontier, x: 1, y: 1, exits: ["north"], feature: "trap" },
      ],
      entryCellId: first,
      exitCellId: frontier,
      currentCellId: first,
      visitedCellIds: [first, junction],
      discoveredCellIds: [first, junction, frontier],
      traversalLog: ["Moved west to a dead end."],
      turns: 2,
      completed: false,
    };
    expect(dungeonMoveOptions(trapped)).toEqual(["east"]);
    const atJunction = moveDungeon(trapped, "east");
    expect(atJunction.visitedCellIds).toEqual(trapped.visitedCellIds);
    expect(dungeonMoveOptions(atJunction)).toEqual(["south"]);
    const escaped = moveDungeon(atJunction, "south");
    expect(escaped.currentCellId).toBe(frontier);
    expect(escaped.completed).toBe(true);
  });

  it("reports a decreasing retrace distance before exploration resumes", () => {
    const id = "dungeon:distance";
    const cells = Array.from({ length: 4 }, (_, x) => mazeCellId(id, x, 0));
    const state: DungeonState = {
      id,
      name: "Long Hall Fixture",
      width: 4,
      height: 1,
      cells: cells.map((cellId, x) => ({
        id: cellId,
        x,
        y: 0,
        exits: x === 0 ? ["east"] : x === 3 ? ["west"] : ["east", "west"],
        feature: "empty",
      })),
      entryCellId: cells[0]!,
      exitCellId: cells[3]!,
      currentCellId: cells[0]!,
      visitedCellIds: cells.slice(0, 3),
      discoveredCellIds: cells,
      traversalLog: ["Reached a mapped dead end."],
      turns: 4,
      completed: false,
    };
    expect(projectDungeonTraversal(state)).toMatchObject({ mode: "retrace", options: ["east"], roomsToFrontier: 2 });
    const oneRoomCloser = moveDungeon(state, "east");
    expect(projectDungeonTraversal(oneRoomCloser)).toMatchObject({ mode: "retrace", options: ["east"], roomsToFrontier: 1 });
    const atFrontier = moveDungeon(oneRoomCloser, "east");
    expect(projectDungeonTraversal(atFrontier)).toEqual({ mode: "explore", options: ["east"], roomsToFrontier: 0 });
  });

  it("uses canonical direction order regardless of serialized array order", () => {
    const dungeon = generateDungeon("ordering-seed", "dungeon:ordering", 8, 8);
    const shuffled: DungeonState = {
      ...dungeon,
      cells: [...dungeon.cells].reverse().map((cell) => ({ ...cell, exits: [...cell.exits].reverse() })),
      visitedCellIds: [...dungeon.visitedCellIds].reverse(),
      discoveredCellIds: [...dungeon.discoveredCellIds].reverse(),
    };
    expect(dungeonMoveOptions(shuffled)).toEqual(dungeonMoveOptions(dungeon));
  });

  it("completes representative minimum, ordinary, and maximum generated mazes", () => {
    for (const [seed, width, height] of [
      ["minimum-maze", 3, 3],
      ["ordinary-maze", 9, 7],
      ["maximum-maze", 24, 24],
    ] as const) {
      const dungeon = generateDungeon(seed, `dungeon:${seed}`, width, height);
      let state = dungeon;
      for (let turn = 0; turn < dungeon.cells.length * 2 && !state.completed; turn += 1) {
        const direction = chooseDungeonMove(state, seed, turn);
        if (direction === null) throw new Error("Incomplete maze did not provide a traversal option");
        state = moveDungeon(state, direction);
      }
      expect(state.completed).toBe(true);
    }
  });

  it("validates generated topology and rejects one-way or exhausted incomplete saves", () => {
    const dungeon = generateDungeon("validation-seed", "dungeon:validation", 6, 6);
    expect(isValidDungeonState(dungeon)).toBe(true);

    const first = dungeon.cells.find((cell) => cell.exits.length > 0)!;
    const direction = first.exits[0]!;
    const change = delta[direction];
    const neighborId = mazeCellId(dungeon.id, first.x + change[0], first.y + change[1]);
    const reverse: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };
    const oneWay: DungeonState = {
      ...dungeon,
      cells: dungeon.cells.map((cell) => cell.id === neighborId
        ? { ...cell, exits: cell.exits.filter((exit) => exit !== reverse[direction]) }
        : cell),
    };
    expect(isValidDungeonState(oneWay)).toBe(false);

    const exhausted: DungeonState = {
      ...dungeon,
      visitedCellIds: dungeon.cells.map((cell) => cell.id),
      discoveredCellIds: dungeon.cells.map((cell) => cell.id),
    };
    expect(isValidDungeonState(exhausted)).toBe(false);
    expect(() => projectDungeonTraversal(exhausted)).toThrow("no reachable exploration frontier");
  });
});
