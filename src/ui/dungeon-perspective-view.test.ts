import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { actorPolicy, campaignDirector, createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import {
  generateDungeon, moveDungeon, projectDungeonMoveKnowledge, projectDungeonSearchExits, searchDungeon,
} from "../depth/dungeon";
import type { DungeonState, DungeonTrapPhase, MazeDirection } from "../depth/types";
import { dungeonPerspectiveFacing, projectDungeonPerspectiveView } from "./dungeon-perspective-view";

function fixture(): WorldState {
  const base = createWorld("dungeon-perspective-view", "campaign:dungeon-perspective-view");
  const dungeon = generateDungeon(base.seed, "dungeon:perspective", 7, 7, false, 3, 2);
  return { ...base, scene: { ...base.scene, mode: "dungeon", location: dungeon.name }, depth: { ...base.depth, dungeon } };
}

function withDungeon(state: WorldState, dungeon: DungeonState): WorldState {
  return { ...state, depth: { ...state.depth, dungeon } };
}

function withTrap(state: WorldState, cellId: string, phase: DungeonTrapPhase): WorldState {
  const dungeon = state.depth.dungeon!;
  return withDungeon(state, { ...dungeon,
    cells: dungeon.cells.map((cell) => cell.id === cellId ? { ...cell, feature: "trap" } : cell),
    traps: [...dungeon.traps.filter((trap) => trap.cellId !== cellId),
      { cellId, kind: "mana-siphon", phase, detectDifficulty: 12, disarmDifficulty: 12 }],
  });
}

/** Explicit view fixture: the real dungeon resolver makes the move/search; this source
 * envelope binds the result without claiming a naturally selected campaign journey.
 */
function committed(state: WorldState, dungeon: DungeonState, commandType: "move-dungeon" | "search-dungeon", suffix: string): WorldState {
  const tick = state.tick + 1;
  const scene = { ...state.scene, mode: "dungeon" as const, action: "The committed dungeon action resolves.",
    consequence: dungeon.traversalLog.at(-1)! };
  const source: ChronicleEntry = { ...scene, id: `${state.campaignId}:event:${tick}`, tick,
    commandId: `${state.campaignId}:depth:${tick}:dungeon:${dungeon.id}:${suffix}`, commandType,
    attention: "queueForPresentation", policy: eventPolicyForMode("dungeon"),
    consideredActions: [], chosenAction: "The committed action", rationale: "Known dungeon facts only." };
  return { ...state, tick, scene, chronicle: [...state.chronicle, source], depth: { ...state.depth, tick, dungeon } };
}

function moved(state: WorldState): { after: WorldState; direction: MazeDirection } {
  const direction = projectDungeonMoveKnowledge(state.depth.dungeon!)[0]!.direction;
  return { after: committed(state, moveDungeon(state.depth.dungeon!, direction), "move-dungeon", direction), direction };
}

describe("the optional one-room dungeon perspective packet", () => {
  it("exports a frozen allowlist without world geometry, hidden mechanics, or campaign mutation", () => {
    const state = fixture(), hash = canonicalHash(state);
    const choiceHash = canonicalHash(actorPolicy(state, campaignDirector(state)));
    const packet = projectDungeonPerspectiveView(state)!;
    expect(packet).not.toBeNull();
    expect(Object.keys(packet).sort()).toEqual([
      "schemaVersion", "campaignId", "dungeonId", "tick", "sourceCommandId", "currentCellId", "heroId", "heroName",
      "facing", "completed", "exits", "currentTrap", "keyStatus", "landmark", "search",
    ].sort());
    expect(packet.exits.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(packet)).not.toMatch(/"(?:seed|cells|width|height|x|y|feature|detectDifficulty|disarmDifficulty|routeCellIds|traversalLog)"/u);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.exits)).toBe(true);
    expect(packet.exits.every(Object.isFrozen)).toBe(true);
    expect(Object.keys(packet.exits[0]!).sort()).toEqual([
      "direction", "relative", "destinationCellId", "visited", "available", "gate", "trap", "sightedKey",
    ].sort());
    for (const facing of ["north", "east", "south", "west"] as const) {
      expect(projectDungeonPerspectiveView(state, facing)!.facing).toBe(facing);
      expect(canonicalHash(state)).toBe(hash);
      expect(canonicalHash(actorPolicy(state, campaignDirector(state)))).toBe(choiceHash);
    }
    expect(projectDungeonPerspectiveView(JSON.parse(JSON.stringify(state)))).toEqual(packet);
  });

  it("does not change when hidden traps, unviewed room features, or neighboring onward exits change", () => {
    const state = fixture(), dungeon = state.depth.dungeon!, exit = projectDungeonMoveKnowledge(dungeon)[0]!;
    const hidden = withTrap(state, exit.destinationCellId, "hidden"), packet = projectDungeonPerspectiveView(hidden);
    const altered = withDungeon(hidden, { ...hidden.depth.dungeon!, width: 99, height: 99,
      cells: hidden.depth.dungeon!.cells.map((cell) => cell.id === exit.destinationCellId
        ? { ...cell, exits: [...new Set([...cell.exits, "north" as const, "east" as const])], feature: "treasure" }
        : cell.id !== dungeon.currentCellId ? { ...cell, feature: "lair" } : cell),
      traps: hidden.depth.dungeon!.traps.map((trap) => trap.phase === "hidden"
        ? { ...trap, kind: "tripwire", detectDifficulty: 999, disarmDifficulty: 999 } : trap),
    });
    expect(projectDungeonPerspectiveView(altered)).toEqual(packet);
    expect(packet!.exits.find((entry) => entry.destinationCellId === exit.destinationCellId)!.trap).toBeNull();
    expect(packet!.landmark).toEqual({ kind: "far-stair-shrine", status: "promised", here: false });
    expect(packet!.keyStatus).toBe("unknown");
  });

  it("exposes only revealed current or doorway traps and preserves their armed/spent distinctions", () => {
    const state = fixture(), dungeon = state.depth.dungeon!, exit = projectDungeonMoveKnowledge(dungeon)[0]!;
    for (const [phase, status] of [["detected", "armed"], ["disarmed", "disarmed"], ["triggered", "triggered"]] as const) {
      const adjacent = projectDungeonPerspectiveView(withTrap(state, exit.destinationCellId, phase))!;
      expect(adjacent.exits.find((entry) => entry.destinationCellId === exit.destinationCellId)!.trap)
        .toEqual({ kind: "mana-siphon", status });
      expect(adjacent.currentTrap).toBeNull();
      const current = projectDungeonPerspectiveView(withTrap(state, dungeon.currentCellId, phase))!;
      expect(current.currentTrap).toEqual({ kind: "mana-siphon", status });
    }
    const remote = dungeon.cells.find((cell) => !dungeon.discoveredCellIds.includes(cell.id))!;
    expect(projectDungeonPerspectiveView(withTrap(state, remote.id, "detected"))).toEqual(projectDungeonPerspectiveView(state));
  });

  it("shows a current locked gate without its secret target and places the shrine only when actually mapped here", () => {
    const state = fixture(), dungeon = state.depth.dungeon!, gate = dungeon.keyGate!;
    const atGate: DungeonState = { ...dungeon, currentCellId: gate.unlockCellId,
      visitedCellIds: [...new Set([...dungeon.visitedCellIds, gate.unlockCellId])],
      discoveredCellIds: [...new Set([...dungeon.discoveredCellIds, gate.unlockCellId])] };
    const locked = projectDungeonPerspectiveView(withDungeon(state, atGate))!;
    expect(locked.exits.find((exit) => exit.gate === "locked")).toMatchObject({ destinationCellId: null, visited: false, trap: null, sightedKey: false });
    expect(JSON.stringify(locked)).not.toContain(gate.shortcutCellId);
    const open = projectDungeonPerspectiveView(withDungeon(state, { ...atGate, keyGate: { ...gate, phase: "open" },
      discoveredCellIds: [...new Set([...atGate.discoveredCellIds, gate.shortcutCellId])] }))!;
    expect(open.keyStatus).toBe("used");
    expect(open.exits.find((exit) => exit.gate === "open")).toMatchObject({ destinationCellId: gate.shortcutCellId, available: true });
    const mapped = projectDungeonPerspectiveView(withDungeon(state, { ...dungeon,
      discoveredCellIds: [...dungeon.discoveredCellIds, dungeon.exitCellId] }))!;
    expect(mapped.landmark).toEqual({ kind: "far-stair-shrine", status: "mapped", here: false });
    const atShrine = projectDungeonPerspectiveView(withDungeon(state, { ...dungeon, completed: true,
      currentCellId: dungeon.exitCellId, visitedCellIds: [...dungeon.visitedCellIds, dungeon.exitCellId],
      discoveredCellIds: [...dungeon.discoveredCellIds, dungeon.exitCellId],
      latestShrineUse: { dungeonId: dungeon.id, cellId: dungeon.exitCellId, tick: 0,
        healthBefore: 1, healthRestored: 1, healthAfter: 2, manaBefore: 0, manaRestored: 1, manaAfter: 1 } }))!;
    expect(atShrine.landmark).toEqual({ kind: "far-stair-shrine", status: "awakened", here: true });
  });

  it("retains a real stationary search's public result without exposing its check arithmetic", () => {
    const state = fixture(), exit = projectDungeonSearchExits(state.depth.dungeon!)[0]!;
    const hidden = withTrap(state, exit.cellId, "hidden");
    const dungeon = searchDungeon(hidden.depth.dungeon!, { agility: 20, intellect: 20, spirit: 20, level: 1 }, state.seed, 1);
    const searched = committed(hidden, dungeon, "search-dungeon", `search:${dungeon.currentCellId}`);
    const packet = projectDungeonPerspectiveView(searched)!;
    expect(packet.search).toEqual({ outcome: "marked", headline: "TRAP MARKED", detail: "1 TRAP MARKED · STILL ARMED" });
    expect(packet.currentCellId).toBe(state.depth.dungeon!.currentCellId);
    expect(dungeonPerspectiveFacing(hidden, searched, "west")).toBe("west");
    expect(JSON.stringify(packet)).not.toMatch(/"(?:skill|roll|total|attribute|difficulty|check)"/u);
    const stale = { ...searched, tick: 2, depth: { ...searched.depth, tick: 2 } };
    expect(projectDungeonPerspectiveView(stale)!.search).toBeNull();
  });

  it("turns only after an adjacent committed move, retaining stationary facing and resetting on new identity or gaps", () => {
    const before = fixture(), { after, direction } = moved(before);
    expect(dungeonPerspectiveFacing(null, before, "west")).toBe("north");
    expect(dungeonPerspectiveFacing(before, before, "west")).toBe("west");
    expect(dungeonPerspectiveFacing(before, after, "west")).toBe(direction);
    expect(projectDungeonPerspectiveView(after, direction)!.facing).toBe(direction);
    expect(dungeonPerspectiveFacing(before, { ...after, chronicle: [] }, "east")).toBe("north");
    const source = after.chronicle.at(-1)!;
    const { commandId: _commandId, ...legacySource } = source;
    expect(projectDungeonPerspectiveView({ ...after, chronicle: [legacySource] })!.sourceCommandId).toBeNull();
    expect(dungeonPerspectiveFacing(before, { ...after, chronicle: [{ ...source, commandId: "foreign" }] }, "east")).toBe("north");
    expect(dungeonPerspectiveFacing(before, { ...after, campaignId: "another-campaign" }, "east")).toBe("north");
    expect(dungeonPerspectiveFacing(before, withDungeon(after, { ...after.depth.dungeon!, id: "another-dungeon" }), "east")).toBe("north");
    expect(dungeonPerspectiveFacing(before, { ...after, tick: after.tick + 5 }, "east")).toBe("north");
    expect(dungeonPerspectiveFacing(after, { ...after, tick: after.tick - 1 }, "east")).toBe("north");
  });

  it("keeps physical back passages visible when wayfinding or a detected hazard forbids taking them", () => {
    const before = fixture(), { after, direction } = moved(before);
    const entered = projectDungeonPerspectiveView(after, direction)!;
    expect(entered.exits.find((exit) => exit.destinationCellId === before.depth.dungeon!.currentCellId))
      .toMatchObject({ relative: "back", visited: true, gate: "none" });
    const guarded = projectDungeonPerspectiveView(withTrap(after, after.depth.dungeon!.currentCellId, "detected"), direction)!;
    expect(guarded.exits.map((exit) => exit.direction)).toEqual(entered.exits.map((exit) => exit.direction));
    expect(guarded.exits.every((exit) => !exit.available)).toBe(true);
    expect(guarded.currentTrap).toEqual({ kind: "mana-siphon", status: "armed" });
  });

  it("fails closed outside the current known dungeon without guessing a future view", () => {
    const state = fixture(), dungeon = state.depth.dungeon!;
    for (const invalid of [
      createWorld("no-dungeon", "campaign:no-dungeon"),
      { ...state, scene: { ...state.scene, mode: "battle" as const } },
      { ...state, depth: { ...state.depth, tick: state.tick + 1 } },
      withDungeon(state, { ...dungeon, currentCellId: "unknown-room" }),
      withDungeon(state, { ...dungeon, discoveredCellIds: [] }),
      withDungeon(state, { ...dungeon, visitedCellIds: [] }),
    ]) expect(projectDungeonPerspectiveView(invalid)).toBeNull();
  });
});
