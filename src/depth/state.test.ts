import { describe, expect, it } from "vitest";
import { generateDungeon, mazeCellId } from "./dungeon";
import { advanceDepth, createDepthState, depthCommandCandidates, maximumCompletedCombats, maximumDepthLogEntries, stepDepth } from "./state";
import type { DepthState, DungeonState } from "./types";

function hazardFixture(health?: number, exitAtTrap = false): DepthState {
  const state = createDepthState("hazard-reducer", "hero:hazard", "Corin Vale");
  const id = "dungeon:hazard-reducer";
  const trap = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const deadEnd = mazeCellId(id, 0, 1);
  const exit = mazeCellId(id, 1, 1);
  const dungeon: DungeonState = {
    id,
    name: "Clockroot Vault",
    width: 2,
    height: 2,
    cells: [
      { id: trap, x: 0, y: 0, exits: ["east", "south"], feature: "trap" },
      { id: entry, x: 1, y: 0, exits: ["south", "west"], feature: "empty" },
      { id: deadEnd, x: 0, y: 1, exits: ["north"], feature: "empty" },
      { id: exit, x: 1, y: 1, exits: ["north"], feature: "shrine" },
    ],
    entryCellId: entry,
    exitCellId: exitAtTrap ? trap : exit,
    currentCellId: entry,
    visitedCellIds: [entry],
    discoveredCellIds: [entry, trap, exit],
    traps: [{ cellId: trap, kind: "tripwire", detectDifficulty: 14, disarmDifficulty: 16, phase: "hidden" }],
    traversalLog: ["Entered the maze."],
    turns: 0,
    completed: false,
  };
  return {
    ...state,
    dungeon,
    hero: health === undefined
      ? state.hero
      : { ...state.hero, resources: { ...state.hero.resources, health } },
  };
}

describe("composed depth state", () => {
  it("applies a first-entry trap once and survives exact save/replay and retracing", () => {
    const before = hazardFixture();
    const healthBefore = before.hero.resources.health;
    const first = stepDepth(before, { type: "move-dungeon", direction: "west" });
    const expectedDamage = Math.max(1, Math.floor(before.hero.resources.maxHealth / 10));

    expect(first.hero.resources.health).toBe(healthBefore - expectedDamage);
    expect(first.log.at(-1)?.message).toBe(
      `whisper-wire escapes notice (intellect 8 vs 14). The marked trap in Clockroot Vault catches Corin Vale for ${expectedDamage} HP — ${healthBefore - expectedDamage}/${before.hero.resources.maxHealth} remains.`,
    );
    const restoredBefore = JSON.parse(JSON.stringify(before)) as DepthState;
    expect(stepDepth(restoredBefore, { type: "move-dungeon", direction: "west" })).toEqual(
      stepDepth(JSON.parse(JSON.stringify(before)), { type: "move-dungeon", direction: "west" }),
    );
    expect(() => stepDepth(first, { type: "move-dungeon", direction: "east" })).toThrow("outside the current traversal plan");

    const deadEnd = stepDepth(first, { type: "move-dungeon", direction: "south" });
    const revisited = stepDepth(JSON.parse(JSON.stringify(deadEnd)), { type: "move-dungeon", direction: "north" });
    expect(revisited.dungeon?.currentCellId).toBe(first.dungeon?.currentCellId);
    expect(revisited.hero.resources.health).toBe(first.hero.resources.health);
    expect(revisited.hero.inventory).toEqual(first.hero.inventory);
    expect(revisited.log.at(-1)?.message).not.toContain("marked trap");
  });

  it("records trap damage and far-stair completion atomically at zero health", () => {
    const before = hazardFixture(1, true);
    const resolved = stepDepth(before, { type: "move-dungeon", direction: "west" });

    expect(resolved.hero.resources.health).toBe(0);
    expect(resolved.dungeon?.completed).toBe(true);
    expect(resolved.log.at(-1)?.message).toBe(
      `whisper-wire escapes notice (intellect 8 vs 14). The marked trap in Clockroot Vault knocks Corin Vale down — 0/${before.hero.resources.maxHealth} HP. The far stair is reached.`,
    );
    expect(resolved.dungeon?.traversalLog.at(-1)).toBe(resolved.log.at(-1)?.message);
  });

  it("pauses on a detected exit trap and completes only after one successful disarm", () => {
    const base = hazardFixture(undefined, true);
    const before: DepthState = {
      ...base,
      hero: {
        ...base.hero,
        attributes: { ...base.hero.attributes, intellect: 20, agility: 20 },
      },
      dungeon: base.dungeon === null ? null : {
        ...base.dungeon,
        traps: base.dungeon.traps.map((trap) => ({ ...trap, detectDifficulty: 10, disarmDifficulty: 11 })),
      },
    };
    const detected = stepDepth(before, { type: "move-dungeon", direction: "west" });

    expect(detected.hero.resources.health).toBe(before.hero.resources.health);
    expect(detected.dungeon?.currentCellId).toBe(detected.dungeon?.exitCellId);
    expect(detected.dungeon?.completed).toBe(false);
    expect(detected.dungeon?.traps[0]?.phase).toBe("detected");
    expect(detected.log.at(-1)?.message).toContain("spots a whisper-wire before it springs");
    expect(depthCommandCandidates(detected).map((candidate) => candidate.command)).toEqual([{ type: "disarm-dungeon-trap" }]);
    expect(() => stepDepth(detected, { type: "move-dungeon", direction: "east" })).toThrow("must be disarmed");

    const restored = JSON.parse(JSON.stringify(detected)) as DepthState;
    const resolved = stepDepth(restored, { type: "disarm-dungeon-trap" });
    expect(resolved.dungeon?.traps[0]?.phase).toBe("disarmed");
    expect(resolved.dungeon?.completed).toBe(true);
    expect(resolved.hero.resources.health).toBe(before.hero.resources.health);
    expect(resolved.hero.experience).toBe(before.hero.experience);
    expect(resolved.log.at(-1)?.message).toContain("The marked trap is disarmed. The far stair is reached.");
    expect(() => stepDepth(resolved, { type: "disarm-dungeon-trap" })).toThrow("No active dungeon trap");
  });

  it("springs a detected trap after one failed disarm and never offers a retry", () => {
    const base = hazardFixture();
    const before: DepthState = {
      ...base,
      hero: {
        ...base.hero,
        attributes: { ...base.hero.attributes, intellect: 20, agility: 0 },
      },
      dungeon: base.dungeon === null ? null : {
        ...base.dungeon,
        traps: base.dungeon.traps.map((trap) => ({ ...trap, detectDifficulty: 10, disarmDifficulty: 16 })),
      },
    };
    const detected = stepDepth(before, { type: "move-dungeon", direction: "west" });
    const resolved = stepDepth(JSON.parse(JSON.stringify(detected)), { type: "disarm-dungeon-trap" });
    const expectedDamage = Math.max(1, Math.floor(before.hero.resources.maxHealth / 10));

    expect(resolved.dungeon?.traps[0]?.phase).toBe("triggered");
    expect(resolved.hero.resources.health).toBe(before.hero.resources.health - expectedDamage);
    expect(resolved.log.at(-1)?.message).toContain("disarm fails (agility");
    expect(depthCommandCandidates(resolved).some((candidate) => candidate.command.type === "disarm-dungeon-trap")).toBe(false);
    expect(() => stepDepth(resolved, { type: "disarm-dungeon-trap" })).toThrow("no detected current trap");
  });

  it("resolves a newly generated entry trap but never retroactively damages a loaded one", () => {
    const before = createDepthState("entry-trap", "hero:entry-trap", "Nessa Vale");
    const candidate = Array.from({ length: 64 }, (_, index) => `dungeon:entry-trap:${index}`).find((dungeonId) => {
      const generated = generateDungeon(before.seed, dungeonId, 3, 3, true);
      return generated.cells.find((cell) => cell.id === generated.entryCellId)?.feature === "trap";
    });
    if (candidate === undefined) throw new Error("Entry-trap fixture could not find a deterministic seed");
    const entered = stepDepth(before, { type: "enter-dungeon", dungeonId: candidate, width: 3, height: 3 });
    const damage = before.hero.resources.health - entered.hero.resources.health;

    expect(damage).toBe(Math.max(1, Math.floor(before.hero.resources.maxHealth / 10)));
    expect(entered.log.at(-1)?.message).toContain(`catches Nessa Vale for ${damage} HP`);
    const restored = JSON.parse(JSON.stringify(entered)) as DepthState;
    expect(restored.hero.resources.health).toBe(entered.hero.resources.health);
    expect(restored.dungeon?.visitedCellIds).toContain(restored.dungeon?.entryCellId);
  });

  it("replays autonomously from a semantic seed", () => {
    const play = () => {
      let state = createDepthState("depth-replay", "hero:replay", "Dara Moss");
      for (let index = 0; index < 600; index += 1) state = advanceDepth(state);
      return state;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(first.tick).toBe(600);
    expect(first.log.length).toBeLessThanOrEqual(maximumDepthLogEntries);
    expect(first.completedCombats.length).toBeLessThanOrEqual(maximumCompletedCombats);
    expect(first.atlas.discoveredLocationIds.length).toBeGreaterThan(1);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("updates explicit quest commands through the same reducer", () => {
    const initial = createDepthState("commands");
    const progressed = stepDepth(initial, { type: "progress-objective", objectiveId: "quest:visit-towns", amount: 1 });
    expect(progressed.tick).toBe(1);
    expect(progressed.quest.objectives.find((entry) => entry.id === "quest:visit-towns")?.current).toBe(1);
    expect(progressed.log.at(-1)?.category).toBe("quest");
  });

  it("adds one deterministic inventory reward for a combat victory", () => {
    let state = createDepthState("reward-seed", "hero:reward", "Iona Vale");
    const startingItems = state.hero.inventory.length;
    state = stepDepth(state, { type: "start-combat", encounterId: "encounter:reward", enemyCount: 1 });
    while (state.combat !== null) state = advanceDepth(state);
    const outcome = state.completedCombats.at(-1)?.outcome;
    expect(outcome).toBe("victory");
    expect(state.hero.inventory).toHaveLength(startingItems + 1);
    expect(state.hero.inventory.at(-1)?.id).toBe("loot:encounter:reward:0");
    expect(state.quest.subquests.find((entry) => entry.id === "subquest-supplies")?.objectives[0]?.current).toBe(1);
  });
});
