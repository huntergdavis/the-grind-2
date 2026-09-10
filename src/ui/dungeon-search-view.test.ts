import { describe, expect, it } from "vitest";
import { createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { generateDungeon, projectDungeonSearchExits, projectDungeonTraps, searchDungeon } from "../depth/dungeon";
import type { DungeonState } from "../depth/types";
import { projectDungeonSearchView } from "./dungeon-search-view";

function searchFixture(kind: "marked" | "failed" | "trap-free" = "marked"): WorldState {
  const base = createWorld("dungeon-search-view", "campaign:dungeon-search-view");
  const generated = generateDungeon(base.depth.seed, "dungeon:search-view", 7, 7);
  const exit = projectDungeonSearchExits(generated)[0];
  if (exit === undefined) throw new Error("Generated search fixture requires a public unvisited exit");
  // Controlled hazard on real generated geometry, not a naturally selected
  // campaign search. The resolver produces every discovery/check receipt.
  const dungeon: DungeonState = {
    ...generated,
    cells: generated.cells.map((cell) => cell.id === exit.cellId && kind !== "trap-free"
      ? { ...cell, feature: "trap" }
      : cell.feature === "trap" ? { ...cell, feature: "empty" } : cell),
    traps: kind === "trap-free" ? [] : [{ cellId: exit.cellId, kind: "tripwire", phase: "hidden", detectDifficulty: 14, disarmDifficulty: 14 }],
  };
  const aptitude = kind === "marked" ? 20 : 0;
  const searched = searchDungeon(dungeon, { agility: aptitude, intellect: aptitude, spirit: aptitude, level: 1 }, base.seed, 1);
  const scene: WorldState["scene"] = {
    ...base.scene, mode: "dungeon", location: dungeon.name,
    headline: "A moment to search.", action: "Inspect the visible unexplored exits without moving.",
    consequence: searched.traversalLog.at(-1)!, sensoryIntensity: 0,
  };
  const entry: ChronicleEntry = {
    ...scene, id: `${base.campaignId}:event:1`, tick: 1,
    commandId: `${base.campaignId}:depth:1:dungeon:${dungeon.id}:search:${dungeon.currentCellId}`,
    commandType: "search-dungeon", attention: "backgroundSafe", policy: eventPolicyForMode("dungeon"),
    consideredActions: ["Search the public exits"], chosenAction: "Search the public exits", rationale: "A stationary inspection.",
  };
  return { ...base, tick: 1, scene, chronicle: [entry], depth: { ...base.depth, tick: 1, dungeon: searched } };
}

describe("stationary dungeon search presentation", () => {
  it("does not invent a search for an ordinary scene or a legacy dungeon", () => {
    expect(projectDungeonSearchView(createWorld("no-search", "campaign:no-search"))).toBeNull();
    const state = searchFixture();
    const { search: _search, ...legacy } = state.depth.dungeon!;
    expect(projectDungeonSearchView({ ...state, depth: { ...state.depth, dungeon: legacy } })).toBeNull();
  });

  it("binds the real successful check to this stationary cell and marks the trap as still armed", () => {
    const state = searchFixture();
    const serialized = JSON.stringify(state);
    const receipt = state.depth.dungeon!.search!.latestReceipt!;
    const view = projectDungeonSearchView(state);
    expect(receipt.discoveries).toHaveLength(1);
    expect(view).toEqual({
      dungeonId: receipt.dungeonId, cellId: receipt.cellId, tick: 1,
      eventId: state.chronicle[0]!.id, commandId: state.chronicle[0]!.commandId,
      outcome: "marked", exits: receipt.exits, discoveries: receipt.discoveries,
      headline: "TRAP MARKED", detail: "1 TRAP MARKED · STILL ARMED", consequence: state.scene.consequence,
    });
    expect(projectDungeonTraps(state.depth.dungeon!)[0]).toMatchObject({ status: "armed", current: false });
    expect(receipt.discoveries[0]!.total).toBe(receipt.discoveries[0]!.skill + receipt.discoveries[0]!.roll + 2);
    expect(Object.isFrozen(view)).toBe(true);
    expect(JSON.stringify(state)).toBe(serialized);
  });

  it("shows identical public results for a failed hidden check and a trap-free search", () => {
    const failed = searchFixture("failed");
    const trapFree = searchFixture("trap-free");
    const view = projectDungeonSearchView(failed);
    expect(view).toEqual(projectDungeonSearchView(trapFree));
    expect(view).toMatchObject({ outcome: "unrevealed", discoveries: [], headline: "SEARCH COMPLETE", detail: "NOTHING REVEALED · PASSAGES UNVERIFIED" });
    expect(view!.exits.length).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toMatch(/tripwire|difficulty|attribute|skill|roll|total|disarmed|safe/i);
    expect(projectDungeonTraps(failed.depth.dungeon!)).toEqual([]);
  });

  it("rejects wrong commands, campaigns, rooms, stale receipts, and changed scene text", () => {
    const state = searchFixture();
    const source = state.chronicle[0]!;
    const dungeon = state.depth.dungeon!;
    const otherCell = dungeon.search!.latestReceipt!.exits[0]!.cellId;
    const invalid: WorldState[] = [
      { ...state, chronicle: [] },
      { ...state, campaignId: "campaign:other" },
      { ...state, tick: 2 },
      { ...state, depth: { ...state.depth, tick: 2 } },
      { ...state, depth: { ...state.depth, tick: 0 } },
      { ...state, chronicle: [{ ...source, commandType: "move-dungeon" }] },
      { ...state, chronicle: [{ ...source, commandId: `${source.commandId}:other` }] },
      { ...state, depth: { ...state.depth, dungeon: { ...dungeon, currentCellId: otherCell } } },
      { ...state, scene: { ...state.scene, mode: "atlas" } },
      { ...state, scene: { ...state.scene, consequence: "The passage is safe." } },
    ];
    for (const candidate of invalid) expect(projectDungeonSearchView(candidate)).toBeNull();
  });

  it("retains exact presentation after JSON reload and stops showing the search on a later tick", () => {
    const state = searchFixture();
    expect(projectDungeonSearchView(JSON.parse(JSON.stringify(state)))).toEqual(projectDungeonSearchView(state));
    const next = { ...state, tick: 2, depth: { ...state.depth, tick: 2 } };
    expect(projectDungeonSearchView(next)).toBeNull();
    expect(projectDungeonTraps(next.depth.dungeon!)[0]?.status).toBe("armed");
  });

  it("does not describe a spent trap as still armed even if an old receipt is copied into the current scene", () => {
    const state = searchFixture();
    const dungeon = state.depth.dungeon!;
    const disarmed: DungeonState = { ...dungeon, traps: dungeon.traps.map((trap) => ({ ...trap, phase: "disarmed" })) };
    expect(projectDungeonSearchView({ ...state, depth: { ...state.depth, dungeon: disarmed } })).toBeNull();
  });
});
