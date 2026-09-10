import { describe, expect, it, vi } from "vitest";
import * as rng from "../core/rng";
import {
  canSearchDungeon, createDungeonSearchState, dungeonTrapAt, generateDungeon,
  isDungeonPassageOpen, isValidDungeonSearchState, isValidDungeonState, mazeCellId, migrateDungeonSearch, migrateDungeonFarStairShrine,
  moveDungeon, projectDungeonSearchExits, resolveDungeonTrapCheck, searchDungeon,
  withDungeonTrapPhase,
} from "./dungeon";
import type { DungeonTrapAptitudes } from "./dungeon";
import type { DungeonState, MazeCell, MazeDirection } from "./types";

const dungeonId = "dungeon:active-search";
const cellId = (x: number, y: number) => mazeCellId(dungeonId, x, y);
const seed = "stationary-search";
const zero: DungeonTrapAptitudes = { agility: 0, intellect: 0, spirit: 0, level: 1 };

/** A lawful fully connected layout-v1 maze; its four public exits deliberately include ordinary empty rooms. */
function fixture(trap = true): DungeonState {
  const cells: MazeCell[] = Array.from({ length: 9 }, (_, index) => {
    const x = index % 3;
    const y = Math.floor(index / 3);
    const exits: MazeDirection[] = [];
    if (y > 0) exits.push("north");
    if (x < 2) exits.push("east");
    if (y < 2) exits.push("south");
    if (x > 0) exits.push("west");
    return { id: cellId(x, y), x, y, exits, feature: trap && x === 1 && y === 0 ? "trap" : "empty" };
  });
  return {
    layoutVersion: 1, keyGate: null, latestShrineUse: null, search: createDungeonSearchState(),
    id: dungeonId, name: "The Measured Hall", width: 3, height: 3, cells,
    entryCellId: cellId(1, 1), exitCellId: cellId(2, 2), currentCellId: cellId(1, 1),
    visitedCellIds: [cellId(1, 1)],
    discoveredCellIds: [cellId(1, 1), cellId(1, 0), cellId(2, 1), cellId(1, 2), cellId(0, 1)],
    traps: trap ? [{ cellId: cellId(1, 0), kind: "tripwire", phase: "hidden", detectDifficulty: 12, disarmDifficulty: 13 }] : [],
    traversalLog: ["Entered the maze."], turns: 0, completed: false,
  };
}

function justShort(dungeon: DungeonState): DungeonTrapAptitudes {
  const check = resolveDungeonTrapCheck(dungeon, cellId(1, 0), "detect", zero, seed);
  return { ...zero, intellect: check.difficulty - check.roll - zero.level - 1 };
}

function found(): DungeonState {
  const dungeon = fixture();
  return searchDungeon(dungeon, justShort(dungeon), seed, 20);
}

describe("stationary dungeon searching", () => {
  it("spends one turn to detect with exactly +2 on the existing cell-bound roll and no movement", () => {
    const dungeon = fixture();
    expect(isValidDungeonState(dungeon)).toBe(true);
    const aptitudes = justShort(dungeon);
    const base = resolveDungeonTrapCheck(dungeon, cellId(1, 0), "detect", aptitudes, seed);
    expect(base.success).toBe(false);
    expect(base.total).toBe(base.difficulty - 1);
    const original = JSON.stringify(dungeon);
    const random = vi.spyOn(rng, "randomInt");
    const result = searchDungeon(dungeon, aptitudes, seed, 20);
    expect(random.mock.calls).toEqual([[4, seed, "dungeon-trap-check", cellId(1, 0), 0, "detect"]]);
    random.mockRestore();
    expect(JSON.stringify(dungeon)).toBe(original);
    expect(result.turns).toBe(1);
    expect(result.currentCellId).toBe(dungeon.currentCellId);
    expect(result.visitedCellIds).toBe(dungeon.visitedCellIds);
    expect(result.discoveredCellIds).toBe(dungeon.discoveredCellIds);
    expect(result.cells).toBe(dungeon.cells);
    expect(result.keyGate).toBe(dungeon.keyGate);
    expect(result.latestShrineUse).toBeNull();
    expect(result.completed).toBe(false);
    expect(dungeonTrapAt(result, cellId(1, 0))?.phase).toBe("detected");
    expect(result.search?.latestReceipt).toEqual({
      schemaVersion: 1, dungeonId, cellId: dungeon.currentCellId, tick: 20, bonus: 2,
      exits: projectDungeonSearchExits(dungeon),
      discoveries: [{ cellId: cellId(1, 0), kind: "tripwire", attribute: "intellect",
        skill: base.skill, roll: base.roll, total: base.total + 2, difficulty: base.difficulty }],
    });
    expect(isValidDungeonState(result)).toBe(true);
    expect(isValidDungeonSearchState(result.search, result, 20)).toBe(true);
  });

  it("reveals no failed trap kind, location, difficulty or roll beyond the same public exit list", () => {
    const hidden = searchDungeon(fixture(), zero, seed, 20);
    const empty = searchDungeon(fixture(false), zero, seed, 20);
    expect(hidden.search).toEqual(empty.search);
    expect(hidden.traversalLog).toEqual(empty.traversalLog);
    expect(hidden.search?.latestReceipt?.discoveries).toEqual([]);
    expect(hidden.search?.latestReceipt?.exits.map((exit) => exit.direction)).toEqual(["north", "east", "south", "west"]);
    expect(dungeonTrapAt(hidden, cellId(1, 0))?.phase).toBe("hidden");
    expect(isValidDungeonState(hidden)).toBe(true);
  });

  it("admits only discovered unvisited reciprocal open exits without inspecting hidden features", () => {
    const dungeon = fixture();
    expect(projectDungeonSearchExits(dungeon)).toEqual(projectDungeonSearchExits(fixture(false)));
    const restricted = {
      ...dungeon, visitedCellIds: [...dungeon.visitedCellIds, cellId(1, 0)],
      discoveredCellIds: dungeon.discoveredCellIds.filter((id) => id !== cellId(2, 1)),
      cells: dungeon.cells.map((cell) => cell.id === cellId(0, 1) ? { ...cell, exits: cell.exits.filter((exit) => exit !== "east") } : cell),
    };
    expect(projectDungeonSearchExits(restricted)).toEqual([{ direction: "south", cellId: cellId(1, 2) }]);
    const locked = { ...dungeon, keyGate: { keyCellId: cellId(0, 0), unlockCellId: dungeon.currentCellId,
      shortcutCellId: cellId(1, 0), phase: "uncollected" as const } };
    expect(projectDungeonSearchExits(locked).some((exit) => exit.direction === "north")).toBe(false);
    expect(projectDungeonSearchExits({ ...locked, keyGate: { ...locked.keyGate, phase: "open" } }).length).toBe(4);
  });

  it("never repeats a search after leaving and returning, while another room can be searched", () => {
    const initial = found();
    expect(canSearchDungeon(initial)).toBe(false);
    expect(() => searchDungeon(initial, zero, seed, 21)).toThrow("unavailable");
    const next = moveDungeon(initial, "east");
    expect(isValidDungeonSearchState(next.search, next, 21)).toBe(true);
    expect(isValidDungeonState(next)).toBe(true);
    expect(canSearchDungeon(next)).toBe(true);
    const twice = searchDungeon(next, zero, seed, 22);
    expect(twice.search?.searchedCellIds).toEqual([cellId(1, 1), cellId(2, 1)]);
    expect(twice.search?.latestReceipt?.cellId).toBe(cellId(2, 1));
    expect(canSearchDungeon(moveDungeon(twice, "west"))).toBe(false);
    expect(isValidDungeonState(twice)).toBe(true);
    const loaded = JSON.parse(JSON.stringify(twice)) as DungeonState;
    expect(isValidDungeonState(loaded)).toBe(true);
    expect(migrateDungeonSearch(loaded)).toBe(loaded);
    expect(canSearchDungeon(loaded)).toBe(false);
  });

  it("preserves successful evidence after moving onto and resolving the detected trap", () => {
    const initial = found();
    const moved = moveDungeon(initial, "north");
    expect(canSearchDungeon(moved)).toBe(false);
    expect(isValidDungeonState(moved)).toBe(true);
    const disarmed = withDungeonTrapPhase(moved, cellId(1, 0), "disarmed");
    expect(isValidDungeonState(disarmed)).toBe(true);
    expect(disarmed.search).toBe(initial.search);
    expect(canSearchDungeon(disarmed)).toBe(true);
    expect(isValidDungeonState(withDungeonTrapPhase(moved, cellId(1, 0), "triggered"))).toBe(true);
  });

  it("refuses completed, unknown-room, exhausted-frontier, repeated-tick and unsafe arithmetic searches", () => {
    const dungeon = fixture();
    expect(canSearchDungeon({ ...dungeon, completed: true })).toBe(false);
    expect(canSearchDungeon({ ...dungeon, visitedCellIds: [] })).toBe(false);
    expect(canSearchDungeon({ ...dungeon, visitedCellIds: dungeon.discoveredCellIds })).toBe(false);
    expect(() => searchDungeon(dungeon, zero, seed, 0)).toThrow("unavailable");
    expect(() => searchDungeon(dungeon, { ...zero, intellect: -1 }, seed, 20)).toThrow("unavailable");
    expect(() => searchDungeon({ ...dungeon, turns: Number.MAX_SAFE_INTEGER }, zero, seed, 20)).toThrow("unavailable");
    expect(() => searchDungeon(moveDungeon(found(), "east"), zero, seed, 20)).toThrow("unavailable");
  });

  it("retains a genuine discovered exit trap when its released layout later migrates to the far-stair shrine", () => {
    const generated = Array.from({ length: 32 }, (_, index) => generateDungeon(`search-far-stair:${index}`, "dungeon:search-far-stair", 7, 7))
      .find((dungeon) => dungeonTrapAt(dungeon, dungeon.exitCellId) !== null);
    if (generated === undefined || generated.keyGate === null) throw new Error("No generated legacy exit-trap fixture");
    const previousRoom = generated.cells.find((cell) => isDungeonPassageOpen(generated, cell.id, generated.exitCellId));
    if (previousRoom === undefined) throw new Error("Legacy exit has no open predecessor");
    const dungeon: DungeonState = { ...generated, currentCellId: previousRoom.id,
      visitedCellIds: generated.cells.map((cell) => cell.id).filter((id) => id !== generated.exitCellId),
      discoveredCellIds: generated.cells.map((cell) => cell.id), keyGate: { ...generated.keyGate, phase: "open" }, turns: 50,
      traps: generated.traps.map((trap) => trap.cellId === generated.exitCellId ? trap : { ...trap, phase: "disarmed" }),
    };
    expect(isValidDungeonState(dungeon)).toBe(true);
    const searched = searchDungeon(dungeon, { agility: 20, intellect: 20, spirit: 20, level: 1 }, "search-far-stair", 60);
    expect(searched.search?.latestReceipt?.discoveries).toHaveLength(1);
    const direction = searched.search!.latestReceipt!.exits[0]!.direction;
    const resolved = { ...withDungeonTrapPhase(moveDungeon(searched, direction), generated.exitCellId, "disarmed"), completed: true };
    expect(isValidDungeonState(resolved)).toBe(true);
    const migrated = migrateDungeonFarStairShrine(resolved);
    expect(dungeonTrapAt(migrated, migrated.exitCellId)).toBeNull();
    expect(migrated.search).toBe(searched.search);
    expect(isValidDungeonState(migrated)).toBe(true);
    expect(isValidDungeonSearchState(migrated.search, migrated, 62)).toBe(true);
    const unrelatedRemoved = { ...found(), traps: [] };
    expect(isValidDungeonSearchState(unrelatedRemoved.search, unrelatedRemoved, 62)).toBe(false);
  });

  it("keeps the receipt immutable and bounded while retaining only 64 public traversal lines", () => {
    const dungeon = { ...fixture(), traversalLog: Array.from({ length: 64 }, (_, index) => `Public step ${index}`) };
    const result = searchDungeon(dungeon, justShort(dungeon), seed, 20);
    expect(result.traversalLog).toHaveLength(64);
    expect(result.traversalLog[0]).toBe("Public step 1");
    const search = result.search!;
    expect(Object.isFrozen(search)).toBe(true);
    expect(Object.isFrozen(search.searchedCellIds)).toBe(true);
    expect(Object.isFrozen(search.latestReceipt)).toBe(true);
    expect(Object.isFrozen(search.latestReceipt?.exits)).toBe(true);
    expect(Object.isFrozen(search.latestReceipt?.exits[0])).toBe(true);
    expect(Object.isFrozen(search.latestReceipt?.discoveries)).toBe(true);
    expect(Object.isFrozen(search.latestReceipt?.discoveries[0])).toBe(true);
  });

  it("initializes fresh and legacy dungeons empty without erasing malformed present evidence", () => {
    const fresh = generateDungeon("search-generation", "dungeon:fresh");
    expect(fresh.search).toEqual(createDungeonSearchState());
    expect(isValidDungeonState(fresh)).toBe(true);
    const { search: _search, ...legacy } = fixture();
    expect(isValidDungeonState(legacy)).toBe(true);
    expect(migrateDungeonSearch(legacy)).toEqual({ ...legacy, search: createDungeonSearchState() });
    expect(migrateDungeonSearch(fresh)).toBe(fresh);
    for (const malformed of [null, {}, { schemaVersion: 2, searchedCellIds: [], latestReceipt: null }]) {
      const bad = { ...fresh, search: malformed } as unknown as DungeonState;
      expect(isValidDungeonState(bad)).toBe(false);
      expect(() => migrateDungeonSearch(bad)).toThrow("malformed");
    }
  });

  it("validates exact bounded source and arithmetic fields without accepting forged failed checks", () => {
    const dungeon = found();
    const search = dungeon.search!;
    const receipt = search.latestReceipt!;
    const proof = receipt.discoveries[0]!;
    const candidates = [
      { ...search, extra: true },
      { ...search, searchedCellIds: [receipt.cellId, receipt.cellId] },
      { ...search, searchedCellIds: ["unknown"] },
      { ...search, searchedCellIds: [], latestReceipt: receipt },
      { ...search, latestReceipt: null },
      { ...search, latestReceipt: { ...receipt, tick: 21 } },
      { ...search, latestReceipt: { ...receipt, dungeonId: "another" } },
      { ...search, latestReceipt: { ...receipt, cellId: cellId(0, 0) } },
      { ...search, latestReceipt: { ...receipt, bonus: 3 } },
      { ...search, latestReceipt: { ...receipt, exits: [...receipt.exits].reverse() } },
      { ...search, latestReceipt: { ...receipt, exits: [{ direction: "north", cellId: cellId(0, 0) }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [{ ...proof, total: proof.total + 1 }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [{ ...proof, attribute: "spirit" }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [{ ...proof, roll: 4 }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [{ ...proof, difficulty: 9 }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [{ ...proof, skill: 0, roll: 0, total: 2 }] } },
      { ...search, latestReceipt: { ...receipt, discoveries: [proof, proof] } },
    ];
    for (const bad of candidates) expect(isValidDungeonSearchState(bad, dungeon, 20), JSON.stringify(bad)).toBe(false);
    expect(isValidDungeonSearchState(search, { ...dungeon, traps: fixture().traps }, 20)).toBe(false);
    expect(isValidDungeonSearchState(search, dungeon, 20)).toBe(true);
    expect(isValidDungeonState({ ...dungeon, cells: [null] })).toBe(false);
    expect(isValidDungeonState({ ...dungeon, traps: [null] })).toBe(false);
    expect(isValidDungeonState({ ...dungeon, keyGate: undefined })).toBe(false);
  });

  it("produces byte-identical results after JSON round-trip without consuming later randomness", () => {
    const dungeon = fixture();
    const aptitudes = justShort(dungeon);
    expect(searchDungeon(dungeon, aptitudes, seed, 20)).toEqual(searchDungeon(JSON.parse(JSON.stringify(dungeon)), aptitudes, seed, 20));
    expect(searchDungeon(dungeon, aptitudes, seed, 20).search?.latestReceipt?.discoveries)
      .toEqual(searchDungeon(dungeon, aptitudes, seed, 200).search?.latestReceipt?.discoveries);
  });
});
