import { describe, expect, it } from "vitest";
import { createDungeonSearchState, createDungeonSecretPassageState, dungeonEffectiveExits, dungeonMoveOptions,
  dungeonSecretPassageCommandId, generateDungeon, isDungeonPassageOpen, isValidDungeonSecretPassage,
  isValidDungeonState, mazeCellId, moveDungeon, openDungeonSecretPassage, projectDungeonMoveKnowledge,
  projectDungeonSearchExits, projectDungeonSecretPassageCue, projectDungeonWayfinding,
  revealDungeonSecretPassage, selectDungeonSecretPassage } from "./dungeon";
import type { DungeonState, MazeCell, MazeDirection } from "./types";

/** A nine-room unit geometry, not a claimed generated campaign. Four rooms
 * have been walked and retraced; the east wall would cut three known steps
 * to one. Campaign acceptance separately earns the real T121 opportunity.
 */
function knownWall(): DungeonState {
  const id = "dungeon:unit-wall", coordinates = [[0, 0], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]];
  const order: readonly MazeDirection[] = ["north", "east", "south", "west"];
  const cells: MazeCell[] = coordinates.map(([x, y], index) => {
    const neighbors = [coordinates[index - 1], coordinates[index + 1]].filter((entry) => entry !== undefined);
    const exits = order.filter((direction) => neighbors.some(([nx, ny]) => direction === "north" ? nx === x && ny === y! - 1
      : direction === "east" ? nx === x! + 1 && ny === y : direction === "south" ? nx === x && ny === y! + 1 : nx === x! - 1 && ny === y));
    return { id: mazeCellId(id, x!, y!), x: x!, y: y!, exits, feature: "empty" };
  });
  return { id, name: "Unit wall", width: 3, height: 3, layoutVersion: 1, keyGate: null, trapRulesVersion: 1,
    latestShrineUse: null, search: createDungeonSearchState(), secretPassage: createDungeonSecretPassageState(),
    cells, entryCellId: cells[0]!.id, exitCellId: cells.at(-1)!.id, currentCellId: cells[0]!.id,
    visitedCellIds: cells.slice(0, 4).map((cell) => cell.id), discoveredCellIds: cells.slice(0, 5).map((cell) => cell.id),
    traps: [], traversalLog: ["Unit setup: four rooms walked, then retraced."], turns: 6, completed: false };
}
function reveal(state = knownWall()): DungeonState {
  return revealDungeonSecretPassage(state, { tick: 10, sourceCommandId: `depth:10:dungeon:${state.id}:north` });
}
function open(state = reveal()): DungeonState {
  const clue = state.secretPassage!.clue!;
  return openDungeonSecretPassage(state, { dungeonId: state.id, fromCellId: clue.fromCellId, toCellId: clue.toCellId }, 11);
}

describe("one separately recorded draught-in-the-wall passage", () => {
  it("opts in only new expeditions and leaves the generated base maze and legacy objects unchanged", () => {
    const old = generateDungeon("wall", "dungeon:wall", 5, 5, false, 3, 2);
    const fresh = generateDungeon("wall", "dungeon:wall", 5, 5, false, 3, 2, 1);
    expect(Object.hasOwn(old, "secretPassage")).toBe(false);
    expect(fresh).toEqual({ ...old, secretPassage: createDungeonSecretPassageState() });
    expect(isValidDungeonState(fresh)).toBe(true);
    expect(revealDungeonSecretPassage(old, { tick: 10, sourceCommandId: "old" })).toBe(old);
    expect(selectDungeonSecretPassage(old)).toBeNull();
    expect(() => generateDungeon("wall", "dungeon:wall", 5, 5, false, 3, 2, 2 as 1)).toThrow();
    // The existing unearned key gate remains the next obligation.
    expect(revealDungeonSecretPassage(fresh, { tick: 10, sourceCommandId: `depth:10:dungeon:${fresh.id}:north` })).toBe(fresh);
  });

  it("discloses only a current-room direction and thought, without opening or looking at hidden features", () => {
    const before = knownWall(), saved = JSON.stringify(before), after = reveal(before), clue = after.secretPassage!.clue!;
    expect(isValidDungeonState(before)).toBe(true);
    expect(JSON.stringify(before)).toBe(saved);
    expect(after.cells).toBe(before.cells);
    expect(after.visitedCellIds).toBe(before.visitedCellIds);
    expect(after.discoveredCellIds).toBe(before.discoveredCellIds);
    expect(after.turns).toBe(before.turns);
    expect(clue).toMatchObject({ dungeonId: before.id, fromCellId: before.currentCellId, toCellId: before.cells[3]!.id,
      direction: "east", revealedTick: 10, revealedTurn: 6, revealSourceCommandId: `depth:10:dungeon:${before.id}:north` });
    expect(clue.knownRouteCellIds).toEqual(before.visitedCellIds);
    const cue = projectDungeonSecretPassageCue(after)!;
    expect(Object.keys(cue).sort()).toEqual(["direction", "text"]);
    expect(cue.direction).toBe("east");
    expect(cue.text).toContain("suspicious amount of weather");
    expect(JSON.stringify(cue)).not.toContain(clue.toCellId);
    expect(isDungeonPassageOpen(after, clue.fromCellId, clue.toCellId)).toBe(false);
    expect(dungeonEffectiveExits(after, clue.fromCellId)).toEqual(["south"]);
    const hiddenVariant = { ...before, cells: before.cells.map((cell) => before.visitedCellIds.includes(cell.id) ? cell : { ...cell, feature: "lair" as const }) };
    expect(reveal(hiddenVariant).secretPassage).toEqual(after.secretPassage);
    expect(revealDungeonSecretPassage(after, { tick: 10, sourceCommandId: clue.revealSourceCommandId })).toBe(after);
  });

  it("opens stationarily, saves the exact source, then takes the useful edge as an ordinary move", () => {
    const before = reveal(), clue = before.secretPassage!.clue!, after = open(before);
    expect(projectDungeonWayfinding(before)).toMatchObject({ mode: "retrace", nextDirection: "south", roomsToFrontier: 3 });
    expect(after.secretPassage!.opened).toEqual({ tick: 11, turn: 7,
      sourceCommandId: dungeonSecretPassageCommandId(11, before.id, clue.fromCellId, clue.toCellId) });
    expect(after.currentCellId).toBe(before.currentCellId);
    expect(after.turns).toBe(before.turns + 1);
    for (const key of ["cells", "traps", "visitedCellIds", "discoveredCellIds", "keyGate", "search", "completed"] as const) expect(after[key]).toEqual(before[key]);
    expect(isDungeonPassageOpen(after, clue.fromCellId, clue.toCellId)).toBe(true);
    expect(isDungeonPassageOpen(after, clue.toCellId, clue.fromCellId)).toBe(true);
    expect(projectDungeonWayfinding(after)).toMatchObject({ mode: "retrace", nextDirection: "east", roomsToFrontier: 1 });
    expect(dungeonMoveOptions(after)).toEqual(["east"]);
    expect(projectDungeonSearchExits(after)).toEqual(projectDungeonSearchExits(before));
    expect(projectDungeonMoveKnowledge(after)[0]).toMatchObject({ direction: "east", destinationCellId: clue.toCellId });
    expect(projectDungeonSecretPassageCue(after)).toBeNull();
    expect(isValidDungeonState(JSON.parse(JSON.stringify(after)))).toBe(true);
    const moved = moveDungeon(after, "east");
    expect(moved.currentCellId).toBe(clue.toCellId);
    expect(moved.turns).toBe(8);
    expect(moved.visitedCellIds).toEqual(after.visitedCellIds);
    expect(moved.discoveredCellIds).toEqual(after.discoveredCellIds);
    expect(moved.secretPassage).toEqual(after.secretPassage);
    expect(isValidDungeonSecretPassage(moved, 12)).toBe(true);
    expect(isValidDungeonState(moved)).toBe(true);
    expect(projectDungeonSearchExits(moved)).toEqual([{ direction: "east", cellId: before.cells[4]!.id }]);
    expect(moveDungeon(moved, "west").currentCellId).toBe(clue.fromCellId);
    expect(() => open(after)).toThrow();
  });

  it("does not disclose an unvisited target, a wall with no useful next step, or an armed current room", () => {
    const state = knownWall();
    expect(reveal({ ...state, visitedCellIds: state.visitedCellIds.slice(0, 3) }).secretPassage!.clue).toBeNull();
    const frontierHere = { ...state, currentCellId: state.cells[3]!.id };
    expect(reveal(frontierHere).secretPassage!.clue).toBeNull();
    const armed = { ...state, cells: state.cells.map((cell) => cell.id === state.currentCellId ? { ...cell, feature: "trap" as const } : cell),
      traps: [{ cellId: state.currentCellId, kind: "tripwire" as const, phase: "detected" as const, detectDifficulty: 10, disarmDifficulty: 11 }] };
    expect(reveal(armed).secretPassage!.clue).toBeNull();
    const elsewhere = moveDungeon(reveal(), "south");
    expect(selectDungeonSecretPassage(elsewhere)).toBeNull();
  });

  it("rejects forged source suffixes, future receipts, wrong targets, extra edges and in-place tampering", () => {
    const before = reveal(), after = open(before), record = after.secretPassage!, clue = record.clue!;
    const malformed: unknown[] = [undefined, null, {}, { ...record, rulesVersion: "draught-v2" }, { ...record, extraEdge: true },
      { ...record, clue: { ...clue, toCellId: before.cells[4]!.id } },
      { ...record, clue: { ...clue, direction: "south" } },
      { ...record, clue: { ...clue, revealSourceCommandId: `depth:10:dungeon:${before.id}:invented` } },
      { ...record, clue: { ...clue, revealSourceCommandId: `depth:10:dungeon:${before.id}:search:foreign-room` } },
      { ...record, clue: { ...clue, knownRouteCellIds: [clue.fromCellId, clue.toCellId] } },
      { ...record, opened: { ...record.opened!, tick: 10 } },
      { ...record, opened: { ...record.opened!, sourceCommandId: "fabricated" } },
      { ...record, opened: { ...record.opened!, turn: 6 } },
    ];
    for (const secretPassage of malformed) {
      const forged = { ...after, secretPassage } as unknown as DungeonState;
      expect(isValidDungeonSecretPassage(forged, 11)).toBe(false);
      expect(isValidDungeonState(forged)).toBe(false);
    }
    expect(isValidDungeonSecretPassage(after, 10)).toBe(false);
    expect(() => openDungeonSecretPassage(before, { dungeonId: before.id, fromCellId: clue.fromCellId, toCellId: "foreign" }, 11)).toThrow();
    const mutable = JSON.parse(JSON.stringify(after)) as DungeonState;
    expect(isValidDungeonState(mutable)).toBe(true);
    Object.assign(mutable.secretPassage!.opened!, { sourceCommandId: "changed-after-validation" });
    expect(isValidDungeonState(mutable)).toBe(false);
  });
});
