import { describe, expect, it } from "vitest";
import { generateDungeon, mazeCellId, moveDungeon } from "./dungeon";
import type { MazeDirection } from "./types";

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
});
