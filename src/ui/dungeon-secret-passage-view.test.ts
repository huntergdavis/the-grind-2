import { beforeAll, describe, expect, it } from "vitest";
import { releasedDungeonSecretPassageBeforeClueFixture, releasedDungeonSecretPassageFixture } from "../../tests/dungeon-secret-passage-fixtures";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { dungeonEffectiveExits, isDungeonPassageOpen } from "../depth/dungeon";
import { dungeonPerspectiveFacing, projectDungeonPerspectiveView } from "./dungeon-perspective-view";
import { projectCurrentDungeonSecretPassage, projectDungeonSecretPassageScene } from "./dungeon-secret-passage-view";
import { projectStatusHistory } from "./status-history";

describe("a released v171 save presents its actual draught, opening and passage crossing", () => {
  let before: WorldState, clue: WorldState, opened: WorldState, crossed: WorldState;
  beforeAll(() => {
    before = releasedDungeonSecretPassageBeforeClueFixture();
    clue = releasedDungeonSecretPassageFixture();
    opened = advanceWorld(clue);
    crossed = advanceWorld(opened);
  }, 20_000);

  it("shows only air at the known wall before the stationary opening", () => {
    expect(projectDungeonSecretPassageScene(before)).toBeNull();
    const record = clue.depth.dungeon!.secretPassage!.clue!;
    expect(projectDungeonSecretPassageScene(clue)).toMatchObject({ phase: "draught", direction: record.direction,
      commandId: clue.chronicle.at(-1)!.commandId, cellId: record.fromCellId, connection: null });
    const publicCue = projectCurrentDungeonSecretPassage(clue.depth.dungeon!);
    expect(publicCue).toEqual({ phase: "draught", direction: record.direction });
    const packet = projectDungeonPerspectiveView(clue, "west")!;
    expect(packet.secretPassage).toMatchObject(publicCue!);
    expect(Object.keys(packet.secretPassage!).sort()).toEqual(["direction", "phase", "relative"]);
    expect(packet.exits.some(exit => exit.direction === record.direction)).toBe(false);
    expect(JSON.stringify(packet)).not.toContain(record.toCellId);
    expect(JSON.stringify(packet)).not.toMatch(/knownRouteCellIds|revealSourceCommandId/u);
    expect(isDungeonPassageOpen(clue.depth.dungeon!, record.fromCellId, record.toCellId)).toBe(false);
  });

  it("opens a real doorway without moving the hero, turning the camera or changing resources", () => {
    const record = opened.depth.dungeon!.secretPassage!, from = record.clue!.fromCellId, to = record.clue!.toCellId;
    expect(opened.chronicle.at(-1)!.commandType).toBe("open-dungeon-passage");
    expect(projectDungeonSecretPassageScene(opened)).toMatchObject({ phase: "opened", cellId: from,
      headline: `PASSAGE OPEN · ${record.clue!.direction.toUpperCase()}`, connection: { fromCellId: from, toCellId: to,
        openingSourceCommandId: `${opened.campaignId}:${record.opened!.sourceCommandId}` } });
    expect(opened.depth.dungeon!.currentCellId).toBe(clue.depth.dungeon!.currentCellId);
    expect(opened.depth.dungeon!.cells).toEqual(clue.depth.dungeon!.cells);
    expect(opened.depth.hero).toEqual(clue.depth.hero);
    expect(opened.depth.quest).toEqual(clue.depth.quest);
    expect(dungeonPerspectiveFacing(clue, opened, "west")).toBe("west");
    expect(isDungeonPassageOpen(opened.depth.dungeon!, from, to)).toBe(true);
    expect(isDungeonPassageOpen(opened.depth.dungeon!, to, from)).toBe(true);
    expect(dungeonEffectiveExits(opened.depth.dungeon!, from)).toContain(record.clue!.direction);
    const packet = projectDungeonPerspectiveView(opened, "west")!;
    expect(packet.secretPassage).toMatchObject({ phase: "open", destinationCellId: to });
    expect(packet.exits.find(exit => exit.direction === record.clue!.direction)).toMatchObject({ destinationCellId: to, visited: true, gate: "none", available: true });
  });

  it("turns only on the next actual step through the new passage and remembers the door behind", () => {
    const record = crossed.depth.dungeon!.secretPassage!.clue!;
    expect(crossed.chronicle.at(-1)!.commandType).toBe("move-dungeon");
    expect(crossed.depth.dungeon!.currentCellId).toBe(record.toCellId);
    expect(projectDungeonSecretPassageScene(crossed)).toMatchObject({ phase: "crossed", direction: record.direction, cellId: record.toCellId });
    expect(dungeonPerspectiveFacing(opened, crossed, "west")).toBe(record.direction);
    const packet = projectDungeonPerspectiveView(crossed, record.direction)!;
    expect(packet.secretPassage).toMatchObject({ phase: "open", relative: "back", destinationCellId: record.fromCellId });
    expect(packet.exits.find(exit => exit.destinationCellId === record.fromCellId)).toMatchObject({ relative: "back", visited: true });
    expect(crossed.depth.dungeon!.visitedCellIds).toEqual(opened.depth.dungeon!.visitedCellIds);
  });

  it("retains exact frozen projections on reload without writing campaign state", () => {
    for (const state of [clue, opened, crossed]) {
      const saved = JSON.stringify(state), scene = projectDungeonSecretPassageScene(state)!;
      expect(Object.isFrozen(scene)).toBe(true);
      expect(projectDungeonSecretPassageScene(JSON.parse(saved))).toEqual(scene);
      expect(projectDungeonPerspectiveView(JSON.parse(saved), "south")).toEqual(projectDungeonPerspectiveView(state, "south"));
      expect(JSON.stringify(state)).toBe(saved);
    }
  });

  it("rejects stale, wrong-command, foreign-campaign and malformed opening receipts", () => {
    for (const state of [clue, opened, crossed]) {
      const source = state.chronicle.at(-1)!;
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { commandType: "wait" as const }, { tick: state.tick - 1 }, { mode: "battle" as const }]) {
        expect(projectDungeonSecretPassageScene({ ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectDungeonSecretPassageScene({ ...state, campaignId: "another-campaign" })).toBeNull();
      expect(projectDungeonSecretPassageScene({ ...state, hero: { ...state.hero, id: "another-hero" } })).toBeNull();
      expect(projectDungeonSecretPassageScene({ ...state, scene: { ...state.scene, mode: "travel" } })).toBeNull();
    }
    const bad: WorldState = structuredClone(opened);
    bad.depth.dungeon!.secretPassage = { ...bad.depth.dungeon!.secretPassage!, opened: { ...bad.depth.dungeon!.secretPassage!.opened!, sourceCommandId: "forged" } };
    expect(projectDungeonSecretPassageScene(bad)).toBeNull();
    expect(projectCurrentDungeonSecretPassage(bad.depth.dungeon!)).toBeNull();
    expect(projectDungeonPerspectiveView(bad)).toBeNull();
  });

  it("keeps the actual opening source in the existing Status history", () => {
    const source = opened.chronicle.at(-1)!;
    const row = projectStatusHistory(opened).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
    expect(row?.source).toBe("chronicle");
    if (row?.source !== "chronicle") throw new Error("Missing real passage Status row");
    expect(row.decision.commandId).toBe(source.commandId);
    expect(row.decision.commandType).toBe("open-dungeon-passage");
    expect(row.consequence).toBe(opened.scene.consequence);
  });
});
