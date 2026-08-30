import { describe, expect, it } from "vitest";
import {
  canUnlockDungeonGate,
  chooseDungeonMove,
  dungeonMoveOptions,
  dungeonTrapAt,
  generateDungeon,
  isDungeonPassageOpen,
  isValidDungeonState,
  mazeCellId,
  moveDungeon,
  projectDungeonTraps,
  projectDungeonKeyGate,
  projectDungeonTraversal,
  projectDungeonWayfinding,
  resolveDungeonTrap,
  resolveDungeonTrapCheck,
  unlockDungeonGate,
  withDungeonTrapPhase,
} from "./dungeon";
import type { DungeonState, MazeDirection } from "./types";

const delta: Record<MazeDirection, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };

function expectWayfindingTruth(dungeon: DungeonState): void {
  const wayfinding = projectDungeonWayfinding(dungeon);
  const byId = new Map(dungeon.cells.map((cell) => [cell.id, cell]));
  const visited = new Set(dungeon.visitedCellIds);
  const discovered = new Set(dungeon.discoveredCellIds);
  expect(wayfinding.routeCellIds.length).toBeLessThanOrEqual(576);
  expect(Math.max(0, wayfinding.routeCellIds.length - 1)).toBeLessThanOrEqual(575);
  expect(new Set(wayfinding.routeCellIds).size).toBe(wayfinding.routeCellIds.length);
  if (wayfinding.mode === "complete") {
    expect(wayfinding.routeCellIds).toEqual([]);
    expect(wayfinding.frontierCellId).toBeNull();
    expect(projectDungeonTraversal(dungeon).options).toEqual([]);
    return;
  }
  if (wayfinding.mode === "hazard") {
    expect(wayfinding).toMatchObject({
      currentCellId: dungeon.currentCellId,
      frontierCellId: null,
      routeCellIds: [dungeon.currentCellId],
      frontierDirections: [],
      nextDirection: null,
      nextPassageDirections: [],
      roomsToFrontier: 0,
    });
    expect(projectDungeonTraversal(dungeon)).toEqual({ mode: "hazard", options: [], roomsToFrontier: 0 });
    return;
  }
  expect(wayfinding.routeCellIds[0]).toBe(dungeon.currentCellId);
  expect(wayfinding.routeCellIds.at(-1)).toBe(wayfinding.frontierCellId);
  for (const cellId of wayfinding.routeCellIds) {
    expect(visited.has(cellId)).toBe(true);
    expect(discovered.has(cellId)).toBe(true);
  }
  for (let index = 0; index < wayfinding.routeCellIds.length - 1; index += 1) {
    const from = byId.get(wayfinding.routeCellIds[index]!);
    const to = byId.get(wayfinding.routeCellIds[index + 1]!);
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    const direction = from?.exits.find((candidate) => {
      const change = delta[candidate];
      return from.x + change[0] === to?.x && from.y + change[1] === to.y;
    });
    expect(direction).toBeDefined();
    expect(to?.exits).toContain(opposite[direction!]);
  }
  const frontier = byId.get(wayfinding.frontierCellId!);
  expect(frontier).toBeDefined();
  for (const direction of wayfinding.frontierDirections) {
    const change = delta[direction];
    const destination = mazeCellId(dungeon.id, frontier!.x + change[0], frontier!.y + change[1]);
    expect(frontier?.exits).toContain(direction);
    expect(discovered.has(destination)).toBe(true);
    expect(visited.has(destination)).toBe(false);
  }
  const traversal = projectDungeonTraversal(dungeon);
  expect(traversal.options).toEqual(wayfinding.nextPassageDirections);
  expect(traversal.roomsToFrontier).toBe(wayfinding.routeCellIds.length - 1);
}

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
      if (!isDungeonPassageOpen(dungeon, current.id, neighbor)) continue;
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

function advanceAutonomousDungeon(state: DungeonState, seed: string, turn: number): DungeonState {
  if (projectDungeonTraversal(state).mode === "unlock-gate") return unlockDungeonGate(state);
  const direction = chooseDungeonMove(state, seed, turn);
  if (direction === null) throw new Error("Incomplete maze did not provide a traversal option");
  return moveDungeon(state, direction);
}

function withoutKeyGate(state: DungeonState): DungeonState {
  const gate = state.keyGate;
  if (gate === null) return { ...state, layoutVersion: 1, keyGate: null };
  return {
    ...state,
    layoutVersion: 1,
    keyGate: null,
    cells: state.cells.map((cell) => {
      if (cell.id !== gate.unlockCellId && cell.id !== gate.shortcutCellId) return cell;
      const blockedCellId = cell.id === gate.unlockCellId ? gate.shortcutCellId : gate.unlockCellId;
      return {
        ...cell,
        exits: cell.exits.filter((direction) => {
          const change = delta[direction];
          return mazeCellId(state.id, cell.x + change[0], cell.y + change[1]) !== blockedCellId;
        }),
      };
    }),
  };
}

function withoutTraps(state: DungeonState): DungeonState {
  return {
    ...state,
    cells: state.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
    traps: [],
  };
}

function baseDistance(state: DungeonState, startCellId: string, endCellId: string): number {
  const legacy = withoutKeyGate(state);
  const queue = [startCellId];
  const distances = new Map<string, number>([[startCellId, 0]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = legacy.cells.find((cell) => cell.id === queue[cursor]);
    if (current === undefined) continue;
    for (const direction of current.exits) {
      const change = delta[direction];
      const neighborId = mazeCellId(legacy.id, current.x + change[0], current.y + change[1]);
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, (distances.get(current.id) ?? 0) + 1);
      queue.push(neighborId);
    }
  }
  const distance = distances.get(endCellId);
  if (distance === undefined) throw new Error("Requested cells are disconnected in the base maze");
  return distance;
}

describe("dungeon mazes", () => {
  it("resolves a marked trap only on first entry and clamps exact damage", () => {
    const id = "dungeon:trap-resolution";
    const entry = mazeCellId(id, 0, 0);
    const trapCell = mazeCellId(id, 1, 0);
    const dungeon: DungeonState = {
      layoutVersion: 1,
      keyGate: null,
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
      traps: [{ cellId: trapCell, kind: "tripwire", detectDifficulty: 14, disarmDifficulty: 16, phase: "hidden" }],
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
      traps: dungeon.traps.map((trap) => trap.cellId === traps[0]!.id
        ? { ...trap, phase: "detected" }
        : trap.cellId === traps[1]!.id
          ? { ...trap, phase: "triggered" }
          : trap),
    });

    expect(projected).toHaveLength(2);
    expect(projected.find((trap) => trap.cellId === traps[0]!.id)?.status).toBe("armed");
    expect(projected.find((trap) => trap.cellId === traps[1]!.id)?.status).toBe("triggered");
    expect(projected).toEqual([...projected].sort((left, right) => left.y - right.y || left.x - right.x));
    expect(JSON.stringify(dungeon)).toBe(before);
    expect(projectDungeonTraps(JSON.parse(JSON.stringify({
      ...dungeon,
      cells: [...dungeon.cells].reverse(),
      discoveredCellIds: [traps[0]!.id, traps[1]!.id, dungeon.entryCellId],
      visitedCellIds: [traps[1]!.id, dungeon.entryCellId],
      traps: dungeon.traps.map((trap) => trap.cellId === traps[0]!.id
        ? { ...trap, phase: "detected" }
        : trap.cellId === traps[1]!.id
          ? { ...trap, phase: "triggered" }
          : trap).reverse(),
    })))).toEqual(projected);
  });

  it("keeps hidden trap families secret and resolves stable typed checks", () => {
    const dungeon = generateDungeon("typed-traps", "dungeon:typed-traps", 9, 7);
    const hidden = dungeon.traps[0];
    if (hidden === undefined) throw new Error("Typed trap fixture has no trap");
    const before = JSON.stringify(dungeon);
    expect(projectDungeonTraps(dungeon)).toEqual([]);
    const aptitudes = { agility: 9, intellect: 10, spirit: 8, level: 2 };
    const check = resolveDungeonTrapCheck(dungeon, hidden.cellId, "detect", aptitudes, "typed-traps");
    const reordered: DungeonState = {
      ...JSON.parse(JSON.stringify(dungeon)),
      cells: [...dungeon.cells].reverse(),
      traps: [...dungeon.traps].reverse(),
    };
    expect(resolveDungeonTrapCheck(reordered, hidden.cellId, "detect", aptitudes, "typed-traps")).toEqual(check);
    const detected = withDungeonTrapPhase(dungeon, hidden.cellId, "detected");
    expect(dungeonTrapAt(detected, hidden.cellId)?.phase).toBe("detected");
    expect(projectDungeonTraps(detected)).toMatchObject([{ cellId: hidden.cellId, status: "armed", kind: hidden.kind }]);
    const disarmed = withDungeonTrapPhase(detected, hidden.cellId, "disarmed");
    expect(projectDungeonTraps(disarmed)[0]?.status).toBe("disarmed");
    expect(() => withDungeonTrapPhase(disarmed, hidden.cellId, "triggered")).toThrow("cannot transition");
    expect(JSON.stringify(dungeon)).toBe(before);
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
    dungeon = { ...dungeon, traps: dungeon.traps.map((trap) => ({ ...trap, phase: "disarmed" })) };
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
      if (projectDungeonTraversal(state).mode === "explore" && unvisited.length > 0) {
        expect(options.every((direction) => unvisited.includes(direction))).toBe(true);
      }
      state = advanceAutonomousDungeon(state, "frontier-choice", turn);
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
      layoutVersion: 1,
      keyGate: null,
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
      traps: [{ cellId: frontier, kind: "tripwire", detectDifficulty: 14, disarmDifficulty: 16, phase: "disarmed" }],
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
      layoutVersion: 1,
      keyGate: null,
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
      traps: [],
      traversalLog: ["Reached a mapped dead end."],
      turns: 4,
      completed: false,
    };
    const before = JSON.stringify(state);
    expect(projectDungeonWayfinding(state)).toEqual({
      mode: "retrace",
      currentCellId: cells[0],
      frontierCellId: cells[2],
      routeCellIds: cells.slice(0, 3),
      frontierDirections: ["east"],
      nextDirection: "east",
      nextPassageDirections: ["east"],
      roomsToFrontier: 2,
    });
    expect(JSON.stringify(state)).toBe(before);
    expect(projectDungeonTraversal(state)).toMatchObject({ mode: "retrace", options: ["east"], roomsToFrontier: 2 });
    const oneRoomCloser = moveDungeon(state, "east");
    expect(projectDungeonWayfinding(oneRoomCloser)).toMatchObject({
      routeCellIds: cells.slice(1, 3),
      frontierCellId: cells[2],
      nextDirection: "east",
      nextPassageDirections: ["east"],
      roomsToFrontier: 1,
    });
    expect(projectDungeonTraversal(oneRoomCloser)).toMatchObject({ mode: "retrace", options: ["east"], roomsToFrontier: 1 });
    const atFrontier = moveDungeon(oneRoomCloser, "east");
    expect(projectDungeonWayfinding(atFrontier)).toEqual({
      mode: "explore",
      currentCellId: cells[2],
      frontierCellId: cells[2],
      routeCellIds: [cells[2]],
      frontierDirections: ["east"],
      nextDirection: null,
      nextPassageDirections: ["east"],
      roomsToFrontier: 0,
    });
    expect(projectDungeonTraversal(atFrontier)).toEqual({ mode: "explore", options: ["east"], roomsToFrontier: 0 });
  });

  it("offers every local frontier without pretending one is selected", () => {
    const id = "dungeon:local-frontier";
    const current = mazeCellId(id, 0, 0);
    const east = mazeCellId(id, 1, 0);
    const south = mazeCellId(id, 0, 1);
    const dungeon: DungeonState = {
      layoutVersion: 1,
      keyGate: null,
      id,
      name: "Open Junction Fixture",
      width: 2,
      height: 2,
      cells: [
        { id: current, x: 0, y: 0, exits: ["south", "east"], feature: "empty" },
        { id: east, x: 1, y: 0, exits: ["west"], feature: "trap" },
        { id: south, x: 0, y: 1, exits: ["north"], feature: "empty" },
      ],
      entryCellId: current,
      exitCellId: east,
      currentCellId: current,
      visitedCellIds: [current],
      discoveredCellIds: [south, current, east],
      traps: [{ cellId: east, kind: "rune-ward", detectDifficulty: 14, disarmDifficulty: 16, phase: "disarmed" }],
      traversalLog: ["Entered an open junction."],
      turns: 0,
      completed: false,
    };
    expect(projectDungeonWayfinding(dungeon)).toEqual({
      mode: "explore",
      currentCellId: current,
      frontierCellId: current,
      routeCellIds: [current],
      frontierDirections: ["east", "south"],
      nextDirection: null,
      nextPassageDirections: ["east", "south"],
      roomsToFrontier: 0,
    });
    expect(projectDungeonTraversal(dungeon).options).toEqual(["east", "south"]);
    expect(projectDungeonWayfinding({
      ...dungeon,
      currentCellId: east,
      visitedCellIds: [current, east],
      completed: true,
    })).toEqual({
      mode: "complete",
      currentCellId: east,
      frontierCellId: null,
      routeCellIds: [],
      frontierDirections: [],
      nextDirection: null,
      nextPassageDirections: [],
      roomsToFrontier: 0,
    });
  });

  it("keeps equal-distance frontier routing stable across serialization order", () => {
    const id = "dungeon:tied-frontiers";
    const westTarget = mazeCellId(id, 0, 1);
    const westFrontier = mazeCellId(id, 1, 1);
    const current = mazeCellId(id, 2, 1);
    const eastFrontier = mazeCellId(id, 3, 1);
    const eastTarget = mazeCellId(id, 4, 1);
    const dungeon: DungeonState = {
      layoutVersion: 1,
      keyGate: null,
      id,
      name: "Tied Frontier Fixture",
      width: 5,
      height: 3,
      cells: [
        { id: westTarget, x: 0, y: 1, exits: ["east"], feature: "empty" },
        { id: westFrontier, x: 1, y: 1, exits: ["east", "west"], feature: "empty" },
        { id: current, x: 2, y: 1, exits: ["west", "east"], feature: "empty" },
        { id: eastFrontier, x: 3, y: 1, exits: ["east", "west"], feature: "empty" },
        { id: eastTarget, x: 4, y: 1, exits: ["west"], feature: "empty" },
      ],
      entryCellId: current,
      exitCellId: eastTarget,
      currentCellId: current,
      visitedCellIds: [westFrontier, current, eastFrontier],
      discoveredCellIds: [westTarget, westFrontier, current, eastFrontier, eastTarget],
      traps: [],
      traversalLog: ["Two mapped ways lead back to a frontier."],
      turns: 5,
      completed: false,
    };
    const expected = projectDungeonWayfinding(dungeon);
    expect(expected).toMatchObject({
      mode: "retrace",
      frontierCellId: eastFrontier,
      routeCellIds: [current, eastFrontier],
      frontierDirections: ["east"],
      nextDirection: "east",
      nextPassageDirections: ["east"],
      roomsToFrontier: 1,
    });
    const shuffled: DungeonState = {
      ...JSON.parse(JSON.stringify(dungeon)),
      cells: [...dungeon.cells].reverse().map((cell) => ({ ...cell, exits: [...cell.exits].reverse() })),
      visitedCellIds: [...dungeon.visitedCellIds].reverse(),
      discoveredCellIds: [...dungeon.discoveredCellIds].reverse(),
    };
    expect(projectDungeonWayfinding(shuffled)).toEqual(expected);
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

  it("generates and traverses one redacted useful Wayfinder shortcut with a separate unlock tick", () => {
    for (const [seed, width, height] of [
      ["wayfinder-minimum", 3, 3],
      ["wayfinder-ordinary", 7, 7],
      ["wayfinder-maximum", 24, 24],
    ] as const) {
      const generated = withoutTraps(generateDungeon(seed, `dungeon:${seed}`, width, height));
      expect(generated.layoutVersion).toBe(2);
      expect(generated.keyGate).not.toBeNull();
      expect(generateDungeon(seed, `dungeon:${seed}`, width, height).keyGate).toEqual(generated.keyGate);
      const generatedGate = generated.keyGate;
      if (generatedGate === null) throw new Error("Wayfinder representative fixture has no gate");
      expect(baseDistance(generated, generatedGate.unlockCellId, generatedGate.shortcutCellId) - 1).toBeGreaterThanOrEqual(3);
      expect(baseDistance(generated, generatedGate.keyCellId, generated.exitCellId)).toBeGreaterThan(
        baseDistance(generated, generatedGate.keyCellId, generatedGate.unlockCellId)
          + 1
          + baseDistance(generated, generatedGate.shortcutCellId, generated.exitCellId),
      );
      expect(isValidDungeonState(generated)).toBe(true);
    }

    let dungeon = withoutTraps(generateDungeon("wayfinder-lifecycle", "dungeon:wayfinder-lifecycle", 7, 7));
    const gate = dungeon.keyGate;
    if (gate === null) throw new Error("Wayfinder lifecycle fixture has no gate");
    const hiddenProjection = projectDungeonKeyGate(dungeon);
    const hiddenJson = JSON.stringify(hiddenProjection);
    if (!dungeon.discoveredCellIds.includes(gate.keyCellId)) expect(hiddenJson).not.toContain(gate.keyCellId);
    if (!dungeon.discoveredCellIds.includes(gate.unlockCellId)) expect(hiddenJson).not.toContain(gate.unlockCellId);
    expect(hiddenJson).not.toContain(gate.shortcutCellId);

    const unlockCell = dungeon.cells.find((cell) => cell.id === gate.unlockCellId);
    const shortcutCell = dungeon.cells.find((cell) => cell.id === gate.shortcutCellId);
    if (unlockCell === undefined || shortcutCell === undefined) throw new Error("Wayfinder endpoints are missing");
    const gateDirection = unlockCell.exits.find((direction) => {
      const change = delta[direction];
      return unlockCell.x + change[0] === shortcutCell.x && unlockCell.y + change[1] === shortcutCell.y;
    });
    if (gateDirection === undefined) throw new Error("Wayfinder endpoints are not adjacent");
    const lockedAtGate: DungeonState = {
      ...dungeon,
      currentCellId: gate.unlockCellId,
      visitedCellIds: [...new Set([...dungeon.visitedCellIds, gate.unlockCellId])],
      discoveredCellIds: [...new Set([...dungeon.discoveredCellIds, gate.unlockCellId])],
    };
    expect(isDungeonPassageOpen(lockedAtGate, gate.unlockCellId, gate.shortcutCellId)).toBe(false);
    expect(() => moveDungeon(lockedAtGate, gateDirection)).toThrow("requires its key");

    for (let turn = 0; turn < dungeon.cells.length * 2 && dungeon.keyGate?.phase === "uncollected"; turn += 1) {
      const direction = chooseDungeonMove(dungeon, "wayfinder-lifecycle", turn);
      if (direction === null) throw new Error("Wayfinder key was not reachable");
      dungeon = moveDungeon(dungeon, direction);
    }
    expect(dungeon.keyGate?.phase).toBe("carried");
    expect(dungeon.currentCellId).toBe(gate.keyCellId);
    expect(dungeon.visitedCellIds).not.toContain(gate.shortcutCellId);
    expect(projectDungeonKeyGate(dungeon)?.key?.status).toBe("carried");
    expect(JSON.stringify(projectDungeonKeyGate(dungeon))).not.toContain(gate.shortcutCellId);
    expect(isValidDungeonState(dungeon)).toBe(true);

    let previousDistance = Number.POSITIVE_INFINITY;
    for (let turn = 0; turn < dungeon.cells.length && !canUnlockDungeonGate(dungeon); turn += 1) {
      const wayfinding = projectDungeonWayfinding(dungeon);
      expect(wayfinding.mode).toBe("return-to-gate");
      expect(wayfinding.roomsToFrontier).toBeLessThan(previousDistance);
      previousDistance = wayfinding.roomsToFrontier;
      const direction = chooseDungeonMove(dungeon, "wayfinder-return", turn);
      if (direction === null) throw new Error("Wayfinder return route stopped early");
      dungeon = moveDungeon(dungeon, direction);
    }
    expect(canUnlockDungeonGate(dungeon)).toBe(true);
    expect(projectDungeonTraversal(dungeon)).toEqual({ mode: "unlock-gate", options: [], roomsToFrontier: 0 });
    const restored = JSON.parse(JSON.stringify(dungeon)) as DungeonState;
    const turnsBeforeUnlock = dungeon.turns;
    const unlocked = unlockDungeonGate(restored);
    expect(unlocked.turns).toBe(turnsBeforeUnlock);
    expect(unlocked.currentCellId).toBe(gate.unlockCellId);
    expect(unlocked.keyGate?.phase).toBe("open");
    expect(projectDungeonKeyGate(unlocked)?.gate).toMatchObject({ status: "open", shortcutCellId: gate.shortcutCellId });
    expect(projectDungeonTraversal(unlocked)).toEqual({ mode: "cross-gate", options: [gateDirection], roomsToFrontier: 0 });
    expect(isValidDungeonState(unlocked)).toBe(true);

    const crossed = moveDungeon(JSON.parse(JSON.stringify(unlocked)), gateDirection);
    expect(crossed.currentCellId).toBe(gate.shortcutCellId);
    expect(crossed.turns).toBe(turnsBeforeUnlock + 1);
    expect(crossed.traversalLog.at(-1)).toContain("Crossed the opened shortcut");
    expect(isValidDungeonState(crossed)).toBe(true);

    expect(isValidDungeonState({ ...dungeon, keyGate: null })).toBe(false);
    expect(isValidDungeonState({ ...dungeon, keyGate: { ...gate, keyCellId: gate.unlockCellId } })).toBe(false);
    const corruptFresh = withoutTraps(generateDungeon("wayfinder-corrupt", "dungeon:wayfinder-corrupt", 7, 7));
    const corruptGate = corruptFresh.keyGate;
    if (corruptGate === null) throw new Error("Wayfinder corruption fixture has no gate");
    expect(isValidDungeonState({ ...corruptFresh, keyGate: { ...corruptGate, phase: "open" } })).toBe(false);
    expect(isValidDungeonState({
      ...corruptFresh,
      currentCellId: corruptGate.shortcutCellId,
      visitedCellIds: [...corruptFresh.visitedCellIds, corruptGate.shortcutCellId],
      discoveredCellIds: [...new Set([...corruptFresh.discoveredCellIds, corruptGate.shortcutCellId])],
    })).toBe(false);
    expect(isValidDungeonState({
      ...corruptFresh,
      currentCellId: corruptGate.keyCellId,
      visitedCellIds: [...corruptFresh.visitedCellIds, corruptGate.keyCellId],
      discoveredCellIds: [...new Set([...corruptFresh.discoveredCellIds, corruptGate.keyCellId])],
      keyGate: { ...corruptGate, phase: "carried" },
    })).toBe(false);
    expect(isValidDungeonState({ ...unlocked, currentCellId: gate.keyCellId })).toBe(false);
    const absentEdge = corruptFresh.cells.flatMap((cell) => (["east", "south"] as const).flatMap((direction) => {
      const change = delta[direction];
      const neighbor = corruptFresh.cells.find((candidate) => candidate.x === cell.x + change[0] && candidate.y === cell.y + change[1]);
      return neighbor === undefined || cell.exits.includes(direction) ? [] : [{ cell, neighbor, direction }];
    }))[0];
    if (absentEdge === undefined) throw new Error("Wayfinder corruption fixture has no absent non-gate edge");
    const extraCycle: DungeonState = {
      ...corruptFresh,
      cells: corruptFresh.cells.map((cell) => cell.id === absentEdge.cell.id
        ? { ...cell, exits: [...cell.exits, absentEdge.direction] }
        : cell.id === absentEdge.neighbor.id
          ? { ...cell, exits: [...cell.exits, opposite[absentEdge.direction]] }
          : cell),
    };
    expect(isValidDungeonState(extraCycle)).toBe(false);
  }, 20_000);

  it("records both shortcut crossing and far-stair completion when the gate opens onto the exit", () => {
    let dungeon = Array.from({ length: 64 }, (_, index) =>
      withoutTraps(generateDungeon("wayfinder-exit", `dungeon:wayfinder-exit:${index}`, 7, 7))
    ).find((candidate) => candidate.keyGate?.shortcutCellId === candidate.exitCellId);
    if (dungeon === undefined) throw new Error("Wayfinder exit fixture found no shortcut at the far stair");
    for (let turn = 0; turn < dungeon.cells.length * 2 && dungeon.keyGate?.phase === "uncollected"; turn += 1) {
      const direction = chooseDungeonMove(dungeon, "wayfinder-exit", turn);
      if (direction === null) throw new Error("Wayfinder exit fixture cannot reach its key");
      dungeon = moveDungeon(dungeon, direction);
    }
    for (let turn = 0; turn < dungeon.cells.length && !canUnlockDungeonGate(dungeon); turn += 1) {
      const direction = chooseDungeonMove(dungeon, "wayfinder-exit-return", turn);
      if (direction === null) throw new Error("Wayfinder exit fixture cannot return to its gate");
      dungeon = moveDungeon(dungeon, direction);
    }
    const gate = dungeon.keyGate;
    if (gate === null) throw new Error("Wayfinder exit fixture has no gate");
    const opened = unlockDungeonGate(dungeon);
    const direction = projectDungeonTraversal(opened).options[0];
    if (direction === undefined) throw new Error("Wayfinder exit fixture has no crossing direction");
    const crossed = moveDungeon(opened, direction);
    expect(crossed.currentCellId).toBe(crossed.exitCellId);
    expect(crossed.completed).toBe(true);
    expect(crossed.traversalLog.at(-1)).toContain("Crossed the opened shortcut");
    expect(crossed.traversalLog.at(-1)).toContain("far stair is reached");
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
        expectWayfindingTruth(state);
        state = advanceAutonomousDungeon(state, seed, turn);
      }
      expect(state.completed).toBe(true);
      expectWayfindingTruth(state);
    }
  }, 20_000);

  it("validates generated topology and rejects one-way or exhausted incomplete saves", () => {
    const dungeon = generateDungeon("validation-seed", "dungeon:validation", 6, 6);
    expect(isValidDungeonState(dungeon)).toBe(true);

    const first = dungeon.cells.find((cell) => cell.exits.length > 0)!;
    const direction = first.exits[0]!;
    const change = delta[direction];
    const neighborId = mazeCellId(dungeon.id, first.x + change[0], first.y + change[1]);
    const oneWay: DungeonState = {
      ...dungeon,
      cells: dungeon.cells.map((cell) => cell.id === neighborId
        ? { ...cell, exits: cell.exits.filter((exit) => exit !== opposite[direction]) }
        : cell),
    };
    expect(isValidDungeonState(oneWay)).toBe(false);

    const entry = dungeon.cells.find((cell) => cell.id === dungeon.entryCellId)!;
    const adjacentId = mazeCellId(
      dungeon.id,
      entry.x + delta[entry.exits[0]!][0],
      entry.y + delta[entry.exits[0]!][1],
    );
    const missingDiscovery: DungeonState = {
      ...dungeon,
      discoveredCellIds: dungeon.discoveredCellIds.filter((id) => id !== adjacentId),
    };
    expect(isValidDungeonState(missingDiscovery)).toBe(false);

    const exhausted: DungeonState = {
      ...dungeon,
      visitedCellIds: dungeon.cells.map((cell) => cell.id),
      discoveredCellIds: dungeon.cells.map((cell) => cell.id),
    };
    expect(isValidDungeonState(exhausted)).toBe(false);
    expect(() => projectDungeonTraversal(exhausted)).toThrow("no reachable exploration frontier");

    const trap = dungeon.traps[0];
    if (trap === undefined) throw new Error("Validation fixture has no trap");
    expect(isValidDungeonState({ ...dungeon, traps: [...dungeon.traps, trap] })).toBe(false);
    expect(isValidDungeonState({
      ...dungeon,
      traps: dungeon.traps.map((candidate) => candidate.cellId === trap.cellId
        ? { ...candidate, detectDifficulty: 99 }
        : candidate),
    })).toBe(false);
    expect(isValidDungeonState({
      ...dungeon,
      traps: dungeon.traps.map((candidate) => candidate.cellId === trap.cellId
        ? { ...candidate, phase: "triggered" }
        : candidate),
    })).toBe(false);

    const detectedUnvisited: DungeonState = {
      ...dungeon,
      discoveredCellIds: dungeon.cells.map((cell) => cell.id),
      traps: dungeon.traps.map((candidate) => candidate.cellId === trap.cellId
        ? { ...candidate, phase: "detected" }
        : candidate),
    };
    expect(isValidDungeonState(detectedUnvisited)).toBe(true);
    expect(isValidDungeonState({
      ...detectedUnvisited,
      traps: detectedUnvisited.traps.map((candidate) => candidate.cellId === trap.cellId
        ? { ...candidate, phase: "disarmed" }
        : candidate),
    })).toBe(false);

    const detectedVisited: DungeonState = {
      ...detectedUnvisited,
      currentCellId: trap.cellId,
      visitedCellIds: [...new Set([...detectedUnvisited.visitedCellIds, trap.cellId])],
    };
    expect(isValidDungeonState(detectedVisited)).toBe(true);
    expect(isValidDungeonState({
      ...detectedVisited,
      traps: detectedVisited.traps.map((candidate) => candidate.cellId === trap.cellId
        ? { ...candidate, phase: "hidden" }
        : candidate),
    })).toBe(false);

    const generatedExitTrap = dungeon.traps.find((candidate) => candidate.cellId === dungeon.exitCellId);
    const legacyDungeon = withoutKeyGate(dungeon);
    const detectedExit: DungeonState = {
      ...legacyDungeon,
      cells: legacyDungeon.cells.map((cell) => cell.id === legacyDungeon.exitCellId
        ? { ...cell, feature: "trap" }
        : cell),
      currentCellId: legacyDungeon.exitCellId,
      visitedCellIds: legacyDungeon.cells.map((cell) => cell.id),
      discoveredCellIds: legacyDungeon.cells.map((cell) => cell.id),
      traps: [
        ...legacyDungeon.traps
          .filter((candidate) => candidate.cellId !== legacyDungeon.exitCellId)
          .map((candidate) => ({ ...candidate, phase: "triggered" as const })),
        {
          cellId: legacyDungeon.exitCellId,
          kind: generatedExitTrap?.kind ?? "tripwire",
          detectDifficulty: generatedExitTrap?.detectDifficulty ?? 10,
          disarmDifficulty: generatedExitTrap?.disarmDifficulty ?? 11,
          phase: "detected",
        },
      ],
      completed: false,
    };
    expect(projectDungeonTraversal(detectedExit)).toEqual({ mode: "hazard", options: [], roomsToFrontier: 0 });
    expect(isValidDungeonState(detectedExit)).toBe(true);
  });
});
