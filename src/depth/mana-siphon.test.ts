import { describe, expect, it, vi } from "vitest";
import * as rng from "../core/rng";
import { createDisarmingKit } from "./disarming-kit";
import {
  createDungeonDisarmKitUse, createDungeonSearchState, dungeonTrapCheckAttribute,
  dungeonTrapKindLabel, generateDungeon, isValidDungeonDisarmKitUse, isValidDungeonSearchState,
  isValidDungeonState, isValidDungeonTrapRules, mazeCellId, migrateDungeonTraps, moveDungeon, projectDungeonMoveKnowledge,
  projectDungeonSearchExits, projectDungeonTraps, resolveDungeonDisarmCheck, resolveDungeonTrap,
  resolveDungeonTrapCheck, searchDungeon, withDungeonTrapPhase,
} from "./dungeon";
import type { DungeonState, MazeCell, MazeDirection } from "./types";

const seed = "browser-dungeon-search:8";
const dungeonId = "dungeon:location:3";
const zero = { agility: 0, intellect: 0, spirit: 0, level: 1 };
const skilled = { agility: 30, intellect: 30, spirit: 30, level: 1 };

function generated(rules: 1 | 2 = 2): DungeonState {
  return generateDungeon(seed, dungeonId, 7, 7, false, 2, rules);
}

function generatedSiphon() {
  const dungeon = generated();
  const trap = dungeon.traps.find((entry) => entry.kind === "mana-siphon");
  if (trap === undefined) throw new Error("Existing generated layout must contain a rules-2 siphon");
  return { dungeon, trap };
}

/** Controlled connected geometry isolates hidden knowledge and the existing search/disarm commands. */
function visibleExitFixture(): DungeonState {
  const id = "dungeon:siphon-visibility";
  const cellId = (x: number, y: number) => mazeCellId(id, x, y);
  const cells: MazeCell[] = Array.from({ length: 9 }, (_, index) => {
    const x = index % 3, y = Math.floor(index / 3);
    const exits: MazeDirection[] = [];
    if (y > 0) exits.push("north");
    if (x < 2) exits.push("east");
    if (y < 2) exits.push("south");
    if (x > 0) exits.push("west");
    return { id: cellId(x, y), x, y, exits, feature: x === 1 && y === 0 ? "trap" : "empty" };
  });
  return {
    id, name: "The Quiet Coil", width: 3, height: 3, layoutVersion: 1, trapRulesVersion: 2,
    keyGate: null, latestShrineUse: null, latestDisarmKitUse: null, search: createDungeonSearchState(),
    cells, entryCellId: cellId(1, 1), currentCellId: cellId(1, 1), exitCellId: cellId(2, 2),
    visitedCellIds: [cellId(1, 1)],
    discoveredCellIds: [cellId(1, 1), cellId(1, 0), cellId(2, 1), cellId(1, 2), cellId(0, 1)],
    traps: [{ cellId: cellId(1, 0), kind: "mana-siphon", phase: "hidden", detectDifficulty: 12, disarmDifficulty: 12 }],
    traversalLog: ["Entered the maze."], turns: 0, completed: false,
  };
}

describe("versioned mana-siphon dungeon traps", () => {
  it("opts in only new family selection while preserving geometry, difficulties and exact legacy choices", () => {
    const old = generated(1), current = generated(2);
    expect(generateDungeon(seed, dungeonId, 7, 7)).toEqual(old);
    expect(old.trapRulesVersion).toBe(1);
    expect(current.trapRulesVersion).toBe(2);
    expect(current.traps.some((trap) => trap.kind === "mana-siphon")).toBe(true);
    const withoutFamilies = (dungeon: DungeonState) => {
      const { trapRulesVersion: _version, traps, ...rest } = dungeon;
      return { ...rest, traps: traps.map(({ kind: _kind, ...trap }) => trap) };
    };
    expect(withoutFamilies(current)).toEqual(withoutFamilies(old));
    for (const trap of old.traps) {
      expect(trap.kind).toBe(rng.pick(["tripwire", "rune-ward"], seed, "dungeon-trap", trap.cellId, 0, "kind"));
      expect(trap.detectDifficulty).toBe(10 + rng.randomInt(5, seed, "dungeon-trap", trap.cellId, 0, "detect-difficulty"));
      expect(trap.disarmDifficulty).toBe(11 + rng.randomInt(6, seed, "dungeon-trap", trap.cellId, 0, "disarm-difficulty"));
    }
    expect(isValidDungeonState(old)).toBe(true);
    expect(isValidDungeonState(current)).toBe(true);
    expect(generateDungeon(seed, dungeonId, 7, 7, false, 3, 2).cells.find((cell) => cell.id === current.exitCellId)?.feature).toBe("shrine");
  });

  it("keeps absent versions legacy and rejects malformed versions or new families under legacy rules", () => {
    const old = generated(1), current = generated(2);
    const { trapRulesVersion: _old, ...legacy } = old;
    expect(isValidDungeonState(legacy)).toBe(true);
    expect(isValidDungeonTrapRules(legacy)).toBe(true);
    expect(isValidDungeonTrapRules(old)).toBe(true);
    expect(isValidDungeonTrapRules(current)).toBe(true);
    for (const version of [undefined, null, 0, 3, "2"]) {
      expect(isValidDungeonState({ ...old, trapRulesVersion: version })).toBe(false);
      expect(isValidDungeonTrapRules({ ...old, trapRulesVersion: version })).toBe(false);
      if (version !== undefined) expect(() => generateDungeon(seed, dungeonId, 7, 7, false, 2, version as 1 | 2)).toThrow();
    }
    expect(generateDungeon(seed, dungeonId, 7, 7, false, 2, undefined)).toEqual(old);
    const { trapRulesVersion: _current, ...unsupported } = current;
    expect(isValidDungeonState(unsupported)).toBe(false);
    expect(isValidDungeonTrapRules(unsupported)).toBe(false);
    expect(isValidDungeonState({ ...current, trapRulesVersion: 1 })).toBe(false);
    expect(isValidDungeonTrapRules({ ...current, trapRulesVersion: 1 })).toBe(false);
  });

  it("rejects malformed family records without widening validation to legacy grid geometry", () => {
    for (const value of [null, undefined, [], {}, { traps: null }, { traps: {} }]) {
      expect(isValidDungeonTrapRules(value)).toBe(false);
    }
    for (const trap of [null, undefined, [], "tripwire", {}, { kind: "unknown" }]) {
      expect(isValidDungeonTrapRules({ trapRulesVersion: 2, traps: [trap] })).toBe(false);
    }
    expect(isValidDungeonTrapRules({ traps: new Array(1) })).toBe(false);
    const legacyGrid = { width: 2, height: 2, traps: [] };
    expect(isValidDungeonTrapRules(legacyGrid)).toBe(true);
    expect(isValidDungeonState(legacyGrid)).toBe(false);
  });

  it("reconstructs pre-trap saves with the original two-family generator, never retroactive siphons", () => {
    const old = generated(1);
    const { traps: _traps, layoutVersion: _layout, keyGate: _gate, latestShrineUse: _shrine, trapRulesVersion: _rules, ...previous } = old;
    const migrated = migrateDungeonTraps(previous, seed);
    expect(migrated.trapRulesVersion).toBe(1);
    expect(migrated.traps).toEqual(old.traps.map((trap) => ({ ...trap,
      phase: old.visitedCellIds.includes(trap.cellId) ? "triggered" : old.discoveredCellIds.includes(trap.cellId) ? "detected" : "hidden" })));
    expect(migrated.cells).toBe(old.cells);
    expect(migrated.traps.some((trap) => trap.kind === "mana-siphon")).toBe(false);
  });

  it("preserves the complete legacy HP consequence object regardless of optional mana arguments", () => {
    const old = generated(1);
    expect(new Set(old.traps.map((trap) => trap.kind))).toEqual(new Set(["tripwire", "rune-ward"]));
    for (const trap of old.traps) {
      const expected = { dungeonId, cellId: trap.cellId, damage: 4, healthBefore: 20, healthAfter: 16 };
      expect(resolveDungeonTrap(old, trap.cellId, true, 20, 48)).toEqual(expected);
      expect(JSON.stringify(resolveDungeonTrap(old, trap.cellId, true, 20, 48, 26, 26))).toBe(JSON.stringify(expected));
    }
  });

  it("drains the bounded quarter of maximum MP without HP damage, extra RNG or input mutation", () => {
    const { dungeon, trap } = generatedSiphon();
    const before = JSON.stringify(dungeon);
    const random = vi.spyOn(rng, "randomInt");
    try {
      for (const [manaBefore, maxMana, manaLost, manaAfter] of [
        [26, 26, 7, 19], [3, 26, 3, 0], [0, 26, 0, 0], [0, 0, 0, 0], [1, 1, 1, 0],
      ] as const) {
        expect(resolveDungeonTrap(dungeon, trap.cellId, true, 20, 48, manaBefore, maxMana)).toEqual({
          schemaVersion: 2, effect: "mana-loss", dungeonId, cellId: trap.cellId,
          damage: 0, healthBefore: 20, healthAfter: 20, manaBefore, manaLost, manaAfter, maxMana,
        });
      }
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
    expect(JSON.stringify(dungeon)).toBe(before);
    expect(dungeonTrapKindLabel("mana-siphon")).toBe("mana siphon");
  });

  it("requires explicit valid MP for a live siphon and cannot drain again after resolution or revisit", () => {
    const { dungeon, trap } = generatedSiphon();
    for (const [mana, maximum] of [[undefined, undefined], [1, undefined], [-1, 26], [27, 26], [0, -1],
      [1.5, 26], [1, 26.5], [NaN, 26], [Infinity, 26], [1, Number.MAX_SAFE_INTEGER + 1]]) {
      expect(() => resolveDungeonTrap(dungeon, trap.cellId, true, 20, 48, mana, maximum)).toThrow("valid mana");
    }
    expect(() => resolveDungeonTrap({ ...dungeon, trapRulesVersion: 1 }, trap.cellId, true, 20, 48, 26, 26)).toThrow();
    expect(resolveDungeonTrap(dungeon, trap.cellId, false, 20, 48, 26, 26)).toBeNull();
    const detected = withDungeonTrapPhase(dungeon, trap.cellId, "detected");
    for (const phase of ["triggered", "disarmed"] as const) {
      const spent = withDungeonTrapPhase(detected, trap.cellId, phase);
      expect(resolveDungeonTrap(spent, trap.cellId, true, 20, 48, 26, 26)).toBeNull();
      expect(resolveDungeonTrap(JSON.parse(JSON.stringify(spent)), trap.cellId, true, 20, 48, 26, 26)).toBeNull();
    }
  });

  it("projects hidden siphons exactly like empty floor, including failed searches", () => {
    const hidden = visibleExitFixture();
    const empty: DungeonState = { ...hidden, cells: hidden.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" } : cell), traps: [] };
    expect(isValidDungeonState(hidden)).toBe(true);
    expect(isValidDungeonState(empty)).toBe(true);
    expect(projectDungeonMoveKnowledge(hidden)).toEqual(projectDungeonMoveKnowledge(empty));
    expect(projectDungeonSearchExits(hidden)).toEqual(projectDungeonSearchExits(empty));
    expect(projectDungeonTraps(hidden)).toEqual([]);
    const failed = searchDungeon(hidden, zero, seed, 10);
    const nothing = searchDungeon(empty, zero, seed, 10);
    expect(failed.search).toEqual(nothing.search);
    expect(failed.traversalLog).toEqual(nothing.traversalLog);
    expect(projectDungeonTraps(failed)).toEqual([]);
  });

  it("uses the same fixed checks and validates successful search and single-kit source receipts", () => {
    const hidden = visibleExitFixture();
    const found = searchDungeon(hidden, skilled, seed, 10);
    const trap = found.traps[0]!;
    expect(found.search!.latestReceipt!.discoveries[0]).toMatchObject({ kind: "mana-siphon", attribute: "spirit" });
    expect(isValidDungeonSearchState(found.search, found, 10)).toBe(true);
    expect(isValidDungeonSearchState(found.search, { ...found, trapRulesVersion: 1 }, 10)).toBe(false);
    const entered = moveDungeon(found, "north");
    const original = resolveDungeonTrapCheck(entered, trap.cellId, "disarm", zero, seed);
    const aptitude = { ...zero, intellect: original.difficulty - original.roll - zero.level - 1 };
    const base = resolveDungeonTrapCheck(entered, trap.cellId, "disarm", aptitude, seed);
    const kit = createDisarmingKit("hero:siphon");
    const random = vi.spyOn(rng, "randomInt");
    let assisted;
    try {
      assisted = resolveDungeonDisarmCheck(entered, trap.cellId, aptitude, seed, kit);
      expect(random.mock.calls).toEqual([[4, seed, "dungeon-trap-check", trap.cellId, 0, "disarm"]]);
    } finally { random.mockRestore(); }
    expect(base.success).toBe(false);
    expect(assisted).toEqual({ ...base, total: base.total + 2, success: true });
    expect(dungeonTrapCheckAttribute("mana-siphon", "detect")).toBe("spirit");
    expect(dungeonTrapCheckAttribute("mana-siphon", "disarm")).toBe("intellect");
    const receipt = createDungeonDisarmKitUse(assisted, kit, 12, entered.id);
    const disarmed = { ...withDungeonTrapPhase(entered, trap.cellId, "disarmed"), latestDisarmKitUse: receipt };
    expect(isValidDungeonDisarmKitUse(receipt, disarmed, 12)).toBe(true);
    expect(isValidDungeonDisarmKitUse(receipt, { ...disarmed, trapRulesVersion: 1 }, 12)).toBe(false);
    expect(isValidDungeonState(disarmed)).toBe(true);
    expect(isValidDungeonState(JSON.parse(JSON.stringify(disarmed)))).toBe(true);
    expect(resolveDungeonTrap(disarmed, trap.cellId, true, 20, 48, 26, 26)).toBeNull();
  });
});
