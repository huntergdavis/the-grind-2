import { beforeAll, describe, expect, it } from "vitest";
import { naturalDungeonLairBeforeArrivalFixture, naturalDungeonLairFixture } from "../../tests/dungeon-lair-fixtures";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectDungeonGuardianScene, projectDungeonLairMark } from "./dungeon-guardian-view";
import { dungeonPerspectiveFacing, projectDungeonPerspectiveView } from "./dungeon-perspective-view";
import { projectStatusHistory } from "./status-history";

describe("an actually entered room admits one visible guardian", () => {
  let before: WorldState, entered: WorldState, started: WorldState, acted: WorldState, resolved: WorldState;
  beforeAll(() => {
    before = naturalDungeonLairBeforeArrivalFixture(); entered = naturalDungeonLairFixture();
    started = advanceWorld(entered); acted = advanceWorld(started); resolved = acted;
    for (let turn = 0; resolved.depth.combat !== null && turn < 64; turn += 1) resolved = advanceWorld(resolved);
    if (resolved.depth.dungeon?.lair?.encounter?.resolution == null) throw new Error("The real guardian did not resolve within 64 combat actions");
  }, 20_000);

  it("discloses no guardian until the actual first entry, then only that recorded room", () => {
    expect(projectDungeonGuardianScene(before)).toBeNull();
    expect(projectDungeonLairMark(before.depth.dungeon!)).toBeNull();
    expect(projectDungeonPerspectiveView(before)!.guardian).toBeNull();
    const encounter = entered.depth.dungeon!.lair!.encounter!;
    expect(projectDungeonGuardianScene(entered)).toMatchObject({ phase: "entered", cellId: encounter.cellId,
      commandId: entered.chronicle.at(-1)!.commandId, guardianName: encounter.guardian.name, headline: "THE ROOM IS TAKEN" });
    const mark = projectDungeonLairMark(entered.depth.dungeon!)!;
    expect(mark).toEqual({ dungeonId: encounter.dungeonId, cellId: encounter.cellId, status: "revealed",
      guardianId: encounter.guardian.id, guardianName: encounter.guardian.name });
    expect(projectDungeonPerspectiveView(entered, "west")!.guardian).toEqual(mark);
    expect(Object.keys(mark).sort()).toEqual(["cellId", "dungeonId", "guardianId", "guardianName", "status"]);
    expect(JSON.stringify(mark)).not.toMatch(/speciesId|seed|combatants|resolution|arrival/u);
  });

  it("binds the real admission and actual combat turn without moving or turning the dungeon camera", () => {
    const encounter = entered.depth.dungeon!.lair!.encounter!;
    expect(started.chronicle.at(-1)!.commandType).toBe("start-dungeon-guardian");
    for (const state of [started, acted]) {
      expect(projectDungeonGuardianScene(state)).toMatchObject({ phase: "fighting", combatId: encounter.combatId,
        commandId: state.chronicle.at(-1)!.commandId, guardianId: encounter.guardian.id });
      expect(state.depth.dungeon!.currentCellId).toBe(entered.depth.dungeon!.currentCellId);
      expect(state.depth.dungeon!.turns).toBe(entered.depth.dungeon!.turns);
      expect(projectDungeonPerspectiveView(state)).toBeNull();
      expect(state.depth.combat!.combatants.filter(unit => unit.side === "enemies").map(unit => unit.id)).toEqual([encounter.guardian.id]);
      expect(state.depth.combat!.threat.rating).toBe("dungeon-bound");
    }
    expect(dungeonPerspectiveFacing(before, entered, "north")).toBe("west");
    expect(dungeonPerspectiveFacing(entered, started, "west")).toBe("west");
    expect(dungeonPerspectiveFacing(started, acted, "west")).toBe("west");
  });

  it("shows only the real terminal outcome, and retains a room memory without replaying battle", () => {
    const receipt = resolved.depth.dungeon!.lair!.encounter!.resolution!;
    expect(projectDungeonGuardianScene(resolved)).toMatchObject({ phase: receipt.outcome,
      commandId: `${resolved.campaignId}:${receipt.sourceCommandId}`, tick: receipt.tick });
    expect(projectDungeonLairMark(resolved.depth.dungeon!)!.status).toBe(receipt.outcome === "victory" ? "cleared" : "unbeaten");
    const after = advanceWorld(resolved);
    expect(projectDungeonGuardianScene(after)).toBeNull();
    expect(projectDungeonLairMark(after.depth.dungeon!)).toEqual(projectDungeonLairMark(resolved.depth.dungeon!));
    expect(after.depth.dungeon!.lair).toEqual(resolved.depth.dungeon!.lair);
  });

  it("retains exact frozen packets on reload without adding resources or mutating the source", () => {
    for (const world of [entered, started, acted, resolved]) {
      const json = JSON.stringify(world), scene = projectDungeonGuardianScene(world)!;
      expect(Object.isFrozen(scene)).toBe(true);
      expect(projectDungeonGuardianScene(JSON.parse(json))).toEqual(scene);
      expect(projectDungeonLairMark(JSON.parse(json).depth.dungeon)).toEqual(projectDungeonLairMark(world.depth.dungeon!));
      expect(JSON.stringify(world)).toBe(json);
    }
  });

  it("rejects foreign, stale and wrong-command scenes rather than borrowing a retained combat", () => {
    for (const world of [entered, started, acted, resolved]) {
      const source = world.chronicle.at(-1)!;
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { commandId: `${source.commandId}:forged` },
        { commandType: "wait" as const }, { tick: world.tick - 1 }, { mode: "town" as const }]) {
        expect(projectDungeonGuardianScene({ ...world, chronicle: [...world.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectDungeonGuardianScene({ ...world, campaignId: "another-campaign" })).toBeNull();
      expect(projectDungeonGuardianScene({ ...world, hero: { ...world.hero, id: "another-hero" } })).toBeNull();
      expect(projectDungeonGuardianScene({ ...world, scene: { ...world.scene, mode: "town" } })).toBeNull();
    }
  });

  it("keeps exact arrival, guardian admission and outcome receipts in the existing Status history", () => {
    for (const world of [entered, started, resolved]) {
      const source = world.chronicle.at(-1)!;
      const row = projectStatusHistory(world).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
      if (row?.source !== "chronicle") throw new Error("The actual guardian event must remain in Status");
      expect(row.decision.commandId).toBe(source.commandId);
      expect(row.decision.commandType).toBe(source.commandType);
      expect(row.consequence).toBe(source.consequence);
    }
  });
});
