import { describe, expect, it } from "vitest";
import { createDepthState, depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { generateDungeon, projectDungeonSearchExits } from "./dungeon";
import { shouldSearchDungeon } from "./dungeon-search-policy";
import type { DepthState } from "./types";

function fixture(): DepthState {
  const base = createDepthState("search-policy", "hero:search-policy", "Mara");
  const hero = { ...base.hero, resources: { ...base.hero.resources, health: Math.floor(base.hero.resources.maxHealth / 2) } };
  for (let index = 0; index < 24; index++) {
    const dungeon = generateDungeon(base.seed, `dungeon:search-policy:${index}`, 3, 3);
    const state = { ...base, hero, dungeon };
    if (shouldSearchDungeon(state)) return state;
  }
  throw new Error("A generated public frontier is required");
}

describe("autonomous cautious dungeon search", () => {
  it("admits a living hero at half health, but not above the threshold or instead of recovery", () => {
    const before = fixture();
    expect(shouldSearchDungeon(before)).toBe(true);
    expect(depthCommandCandidates(before)).toEqual([expect.objectContaining({ command: {
      type: "search-dungeon", dungeonId: before.dungeon!.id, cellId: before.dungeon!.currentCellId,
    } })]);
    const health = (value: number) => ({ ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: value } } });
    expect(shouldSearchDungeon(health(Math.floor(before.hero.resources.maxHealth / 2) + 1))).toBe(false);
    expect(shouldSearchDungeon(health(0))).toBe(false);
    expect(depthCommandCandidates(health(0))[0]!.command.type).toBe("wait");
  });

  it("uses identical admission for hidden traps and indistinguishable empty passages", () => {
    const before = fixture();
    const exits = new Set(projectDungeonSearchExits(before.dungeon!).map((exit) => exit.cellId));
    const hidden = { ...before, dungeon: { ...before.dungeon!,
      cells: before.dungeon!.cells.map((cell) => exits.has(cell.id) ? { ...cell, feature: "trap" as const } : cell),
      traps: [...before.dungeon!.traps.filter((trap) => !exits.has(trap.cellId)), ...[...exits].map((cellId) => ({
        cellId, kind: "tripwire" as const, phase: "hidden" as const, detectDifficulty: 14, disarmDifficulty: 16,
      }))],
    } };
    const empty = { ...hidden, dungeon: { ...hidden.dungeon,
      cells: hidden.dungeon.cells.map((cell) => exits.has(cell.id) ? { ...cell, feature: "empty" as const } : cell),
      traps: hidden.dungeon.traps.filter((trap) => !exits.has(trap.cellId)),
    } };
    expect(shouldSearchDungeon(hidden)).toBe(true);
    expect(depthCommandCandidates(hidden)).toEqual(depthCommandCandidates(empty));
  });

  it("does not delay a visible unspent shrine, a known trap, or quest settlement", () => {
    const before = fixture();
    const exits = new Set(projectDungeonSearchExits(before.dungeon!).map((exit) => exit.cellId));
    const shrine = { ...before, dungeon: { ...before.dungeon!,
      cells: before.dungeon!.cells.map((cell) => exits.has(cell.id) ? { ...cell, feature: "shrine" as const } : cell),
      traps: before.dungeon!.traps.filter((trap) => !exits.has(trap.cellId)),
    } };
    expect(shouldSearchDungeon(shrine)).toBe(false);
    const armed = { ...before, dungeon: { ...before.dungeon!,
      cells: before.dungeon!.cells.map((cell) => cell.id === before.dungeon!.currentCellId ? { ...cell, feature: "trap" as const } : cell),
      traps: [...before.dungeon!.traps.filter((trap) => trap.cellId !== before.dungeon!.currentCellId), {
        cellId: before.dungeon!.currentCellId, kind: "tripwire" as const, phase: "detected" as const, detectDifficulty: 12, disarmDifficulty: 14,
      }],
    } };
    expect(shouldSearchDungeon(armed)).toBe(false);
    expect(depthCommandCandidates(armed)[0]!.command.type).toBe("disarm-dungeon-trap");
    expect(shouldSearchDungeon({ ...before, quest: { ...before.quest, status: "ready-to-fulfill" } })).toBe(false);
  });

  it("spends one stationary turn without granting rewards and rejects repeat or wrong-room commands", () => {
    const before = fixture();
    const bytes = JSON.stringify(before);
    const command = depthCommandCandidates(before)[0]!.command;
    if (command.type !== "search-dungeon") throw new Error("Expected search");
    const after = stepDepth(before, command);
    expect(after.tick).toBe(before.tick + 1);
    expect(after.dungeon!.turns).toBe(before.dungeon!.turns + 1);
    expect(after.dungeon!.currentCellId).toBe(before.dungeon!.currentCellId);
    expect(after.dungeon!.visitedCellIds).toEqual(before.dungeon!.visitedCellIds);
    expect(after.dungeon!.discoveredCellIds).toEqual(before.dungeon!.discoveredCellIds);
    expect(after.hero).toEqual(before.hero);
    expect(after.quest).toEqual(before.quest);
    expect(after.atlas).toEqual(before.atlas);
    expect(after.log).toHaveLength(before.log.length + 1);
    expect(after.dungeon!.traversalLog).toHaveLength(before.dungeon!.traversalLog.length + 1);
    expect(after.log.at(-1)!.message).toContain("One turn spent; no movement or XP.");
    expect(shouldSearchDungeon(after)).toBe(false);
    expect(depthCommandCandidates(after).every((candidate) => candidate.command.type !== "search-dungeon")).toBe(true);
    expect(() => stepDepth(after, command)).toThrow();
    expect(() => stepDepth(before, { ...command, cellId: "wrong-room" })).toThrow();
    expect(() => stepDepth(before, { ...command, dungeonId: "wrong-dungeon" })).toThrow();
    expect(JSON.stringify(before)).toBe(bytes);
  });

  it("migrates v22 dungeon saves with empty search history and resumes new evidence exactly", () => {
    const before = fixture();
    const { search: _search, ...releasedDungeon } = before.dungeon!;
    const old = { ...before, schemaVersion: 22, dungeon: releasedDungeon };
    const migrated = upgradeDepthState(JSON.parse(JSON.stringify(old)), before.seed, before.hero.id, before.hero.name);
    expect(migrated.schemaVersion).toBe(30);
    expect(migrated.dungeon!.search).toEqual({ schemaVersion: 1, searchedCellIds: [], latestReceipt: null });
    expect(migrated.hero).toEqual(before.hero);
    const after = stepDepth(migrated, depthCommandCandidates(migrated)[0]!.command);
    expect(upgradeDepthState(JSON.parse(JSON.stringify(after)), before.seed, before.hero.id, before.hero.name)).toEqual(after);
    const future = { ...after, dungeon: { ...after.dungeon!, search: { ...after.dungeon!.search!,
      latestReceipt: { ...after.dungeon!.search!.latestReceipt!, tick: after.tick + 1 },
    } } };
    expect(() => upgradeDepthState(future, before.seed, before.hero.id, before.hero.name)).toThrow();
  });
});
