import { describe, expect, it, vi } from "vitest";
import * as rng from "../core/rng";
import { createDisarmingKit, disarmingKitId, isDisarmingKit, selectDisarmingKit } from "./disarming-kit";
import {
  createDungeonDisarmKitUse, dungeonTrapAt, generateDungeon, isValidDungeonDisarmKitUse,
  isValidDungeonState, migrateDungeonFarStairShrine, moveDungeon, resolveDungeonDisarmCheck,
  resolveDungeonTrapCheck, withDungeonTrapPhase,
} from "./dungeon";
import type { DungeonTrapAptitudes } from "./dungeon";
import { isValidItemState } from "./rpg";
import type { DungeonState, ItemState } from "./types";

const heroId = "hero:kit-proof";
const seed = "browser-dungeon-search:8";
const aptitudes: DungeonTrapAptitudes = { agility: 0, intellect: 0, spirit: 0, level: 1 };

/** Generated entry-to-rune movement; only detection is staged, not a full autoplay claim. */
function ready(): DungeonState {
  const generated = generateDungeon(seed, "dungeon:location:3", 7, 7);
  const targetId = `${generated.id}:cell:0,1`;
  if (dungeonTrapAt(generated, targetId) === null) throw new Error("Expected the generated entry rune");
  return moveDungeon(withDungeonTrapPhase(generated, targetId, "detected"), "south");
}

function justShort(dungeon: DungeonState): DungeonTrapAptitudes {
  const check = resolveDungeonTrapCheck(dungeon, dungeon.currentCellId, "disarm", aptitudes, seed);
  return { ...aptitudes, [check.attribute]: check.difficulty - check.roll - aptitudes.level - 1 };
}

function used() {
  const before = ready();
  const kit = createDisarmingKit(heroId);
  const check = resolveDungeonDisarmCheck(before, before.currentCellId, justShort(before), seed, kit);
  const receipt = createDungeonDisarmKitUse(check, kit, 40, before.id);
  const dungeon = { ...withDungeonTrapPhase(before, before.currentCellId, "disarmed"), latestDisarmKitUse: receipt };
  return { before, kit, check, receipt, dungeon };
}

describe("one bounded disarming kit", () => {
  it("creates one immutable typed kit and selects only its exact owner-bound inventory identity", () => {
    const kit = createDisarmingKit(heroId);
    expect(kit.id).toBe(disarmingKitId(heroId));
    expect(isValidItemState(kit)).toBe(true);
    expect(kit).toMatchObject({ quantity: 1, kind: "consumable", restorative: null, useMastery: null,
      dungeonTool: { schemaVersion: 1, kind: "disarming-kit", bonus: 2 } });
    expect(Object.isFrozen(kit)).toBe(true);
    expect(Object.isFrozen(kit.modifiers)).toBe(true);
    expect(Object.isFrozen(kit.dungeonTool)).toBe(true);
    expect(selectDisarmingKit({ id: heroId, inventory: [kit] })).toBe(kit);
    expect(selectDisarmingKit({ id: "another-hero", inventory: [kit] })).toBeNull();
    expect(selectDisarmingKit({ id: heroId, inventory: [kit, kit] })).toBeNull();
    expect(selectDisarmingKit({ id: heroId, inventory: [] })).toBeNull();
  });

  it("keeps old untyped consumables inert and rejects malformed, future, stacked or mixed capabilities", () => {
    const kit = createDisarmingKit(heroId);
    const { dungeonTool: _capability, ...legacy } = kit;
    expect(isValidItemState(legacy)).toBe(true);
    expect(isDisarmingKit(legacy)).toBe(false);
    expect(selectDisarmingKit({ id: heroId, inventory: [legacy] })).toBeNull();
    const invalid = [
      { ...kit, quantity: 2 }, { ...kit, quantity: 0 }, { ...kit, dungeonTool: null },
      { ...kit, name: "Counterfeit Kit" }, { ...kit, rarity: "legendary" },
      { ...kit, dungeonTool: { ...kit.dungeonTool, schemaVersion: 2 } },
      { ...kit, dungeonTool: { ...kit.dungeonTool, bonus: 3 } },
      { ...kit, dungeonTool: { ...kit.dungeonTool, hidden: true } },
      { ...kit, restorative: { schemaVersion: 1, kind: "restore-health-quarter-max", target: "self" } },
      { ...kit, modifiers: { power: 1 } },
    ];
    for (const item of invalid) expect(isDisarmingKit(item)).toBe(false);
  });

  it("adds exactly two to the same single disarm roll, never the skill, and leaves unassisted bytes unchanged", () => {
    const dungeon = ready();
    expect(isValidDungeonState(dungeon)).toBe(true);
    const skills = justShort(dungeon);
    const base = resolveDungeonTrapCheck(dungeon, dungeon.currentCellId, "disarm", skills, seed);
    expect(base.success).toBe(false);
    expect(base.total).toBe(base.difficulty - 1);
    expect(JSON.stringify(resolveDungeonDisarmCheck(dungeon, dungeon.currentCellId, skills, seed, null))).toBe(JSON.stringify(base));
    const before = JSON.stringify(dungeon);
    const random = vi.spyOn(rng, "randomInt");
    let assisted;
    try {
      assisted = resolveDungeonDisarmCheck(dungeon, dungeon.currentCellId, skills, seed, createDisarmingKit(heroId));
      expect(random.mock.calls).toEqual([[4, seed, "dungeon-trap-check", dungeon.currentCellId, 0, "disarm"]]);
    } finally { random.mockRestore(); }
    expect(assisted).toEqual({ ...base, total: base.total + 2, success: true });
    expect(JSON.stringify(dungeon)).toBe(before);
  });

  it("keeps failure possible and adds the same bonus even when an unassisted check already succeeds", () => {
    const dungeon = ready();
    const kit = createDisarmingKit(heroId);
    const failed = resolveDungeonDisarmCheck(dungeon, dungeon.currentCellId, aptitudes, seed, kit);
    expect(failed.success).toBe(false);
    expect(failed.total).toBe(failed.skill + failed.roll + 2);
    const high = { agility: 30, intellect: 30, spirit: 30, level: 1 };
    const base = resolveDungeonTrapCheck(dungeon, dungeon.currentCellId, "disarm", high, seed);
    const assisted = resolveDungeonDisarmCheck(dungeon, dungeon.currentCellId, high, seed, kit);
    expect(base.success).toBe(true);
    expect(assisted.total).toBe(base.total + 2);
  });

  it("rejects missing, hidden and already-resolved mechanisms and untyped pseudo-kits", () => {
    const dungeon = ready();
    const kit = createDisarmingKit(heroId);
    const { dungeonTool: _capability, ...legacy } = kit;
    expect(() => resolveDungeonDisarmCheck(dungeon, dungeon.currentCellId, aptitudes, seed, legacy)).toThrow("capability");
    expect(() => resolveDungeonDisarmCheck(dungeon, "missing", aptitudes, seed, kit)).toThrow();
    for (const phase of ["hidden", "disarmed", "triggered"] as const) {
      const changed = { ...dungeon, traps: dungeon.traps.map((trap) => trap.cellId === dungeon.currentCellId ? { ...trap, phase } : trap) };
      expect(() => resolveDungeonDisarmCheck(changed, changed.currentCellId, aptitudes, seed, kit)).toThrow("not ready");
    }
  });

  it("retains a frozen exact quantity/arithmetic receipt through JSON replay and later movement", () => {
    const { before, kit, receipt, dungeon } = used();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt).toMatchObject({ itemId: kit.id, quantityBefore: 1, quantityAfter: 0, bonus: 2,
      baseTotal: receipt.skill + receipt.roll, total: receipt.baseTotal + 2, success: true });
    expect(isValidDungeonDisarmKitUse(receipt, dungeon, 40)).toBe(true);
    expect(isValidDungeonState(dungeon)).toBe(true);
    const replayCheck = resolveDungeonDisarmCheck(JSON.parse(JSON.stringify(before)), before.currentCellId,
      justShort(before), seed, JSON.parse(JSON.stringify(kit)) as ItemState);
    expect(createDungeonDisarmKitUse(replayCheck, kit, 40, before.id)).toEqual(receipt);
    expect(isValidDungeonDisarmKitUse(receipt, { ...dungeon, currentCellId: dungeon.entryCellId }, 50)).toBe(true);
    expect(isValidDungeonDisarmKitUse(receipt, before, 40)).toBe(false);
  });

  it("fails closed on altered version, source, time, quantity, bonus, check math or outcome", () => {
    const { check, kit, receipt, dungeon } = used();
    for (const patch of [
      { schemaVersion: 2 }, { dungeonId: "foreign" }, { cellId: dungeon.entryCellId }, { tick: 0 }, { tick: 41 },
      { quantityAfter: 1 }, { quantityBefore: 2 }, { bonus: 3 }, { roll: 4 }, { baseTotal: receipt.baseTotal + 1 },
      { skill: receipt.skill + 1 }, { total: receipt.total + 1 }, { difficulty: 99 }, { success: false },
      { attribute: "spirit" }, { surprise: true },
    ]) expect(isValidDungeonDisarmKitUse({ ...receipt, ...patch }, dungeon, 40)).toBe(false);
    expect(isValidDungeonDisarmKitUse(receipt, { ...dungeon, visitedCellIds: [] }, 40)).toBe(false);
    expect(isValidDungeonDisarmKitUse(receipt, { ...dungeon, traps: [] }, 40)).toBe(false);
    expect(() => createDungeonDisarmKitUse({ ...check, total: check.total - 2 }, kit, 40, dungeon.id)).toThrow();
    expect(() => createDungeonDisarmKitUse({ ...check, stage: "detect" }, kit, 40, dungeon.id)).toThrow();
    expect(isValidDungeonState({ ...dungeon, latestDisarmKitUse: { ...receipt, bonus: 3 } })).toBe(false);
  });

  it("preserves a resolved legacy far-stair receipt when that trap becomes the actual shrine", () => {
    // Reuse the existing search migration's bounded generated-layout fixture; only traversal/phase is staged.
    const generated = Array.from({ length: 32 }, (_, index) => generateDungeon(`search-far-stair:${index}`, "dungeon:search-far-stair", 7, 7))
      .find((dungeon) => dungeonTrapAt(dungeon, dungeon.exitCellId) !== null)!;
    if (generated === undefined || generated.keyGate === null) throw new Error("Expected released exit-trap geometry");
    const allCells = generated.cells.map((cell) => cell.id);
    const before: DungeonState = { ...generated, currentCellId: generated.exitCellId,
      visitedCellIds: allCells, discoveredCellIds: allCells, keyGate: { ...generated.keyGate, phase: "open" }, turns: 50,
      traps: generated.traps.map((trap) => ({ ...trap, phase: trap.cellId === generated.exitCellId ? "detected" : "disarmed" })),
    };
    const kit = createDisarmingKit(heroId);
    const check = resolveDungeonDisarmCheck(before, before.exitCellId, { agility: 30, intellect: 30, spirit: 30, level: 1 }, seed, kit);
    const receipt = createDungeonDisarmKitUse(check, kit, 60, before.id);
    const resolved = { ...withDungeonTrapPhase(before, before.exitCellId, "disarmed"), completed: true, latestDisarmKitUse: receipt };
    expect(isValidDungeonState(resolved)).toBe(true);
    const migrated = migrateDungeonFarStairShrine(resolved);
    expect(migrated.latestDisarmKitUse).toBe(receipt);
    expect(dungeonTrapAt(migrated, migrated.exitCellId)).toBeNull();
    expect(isValidDungeonState(migrated)).toBe(true);
    expect(isValidDungeonDisarmKitUse(receipt, migrated, 60)).toBe(true);
  });

  it("starts fresh dungeons empty while retaining legacy absence and rejecting malformed present receipts", () => {
    const fresh = generateDungeon("kit-empty", "dungeon:kit-empty", 7, 7);
    expect(fresh.latestDisarmKitUse).toBeNull();
    const { latestDisarmKitUse: _empty, ...legacy } = fresh;
    expect(isValidDungeonState(legacy)).toBe(true);
    expect(isValidDungeonState({ ...fresh, latestDisarmKitUse: {} })).toBe(false);
  });
});
