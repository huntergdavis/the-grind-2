import { describe, expect, it } from "vitest";
import { canUnlockDungeonGate, generateDungeon, mazeCellId, projectDungeonTraversal, projectLatestShrineUse } from "./dungeon";
import { projectCounterDuelSpeciesHabit } from "./counter-duel";
import { advanceDepth, createDepthState, depthCommandCandidates, maximumCompletedCombats, maximumCompletedCounterDuels, maximumDepthLogEntries, stepDepth, upgradeDepthState } from "./state";
import type { DepthState, DungeonState } from "./types";

function hazardFixture(health?: number, exitAtTrap = false): DepthState {
  const state = createDepthState("hazard-reducer", "hero:hazard", "Corin Vale");
  const id = "dungeon:hazard-reducer";
  const trap = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const deadEnd = mazeCellId(id, 0, 1);
  const exit = mazeCellId(id, 1, 1);
  const dungeon: DungeonState = {
    layoutVersion: 1,
    keyGate: null,
    latestShrineUse: null,
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

function shrineFixture(): DepthState {
  const state = createDepthState("shrine-reducer", "hero:shrine", "Mira Vale");
  const id = "dungeon:shrine-reducer";
  const shrine = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const deadEnd = mazeCellId(id, 0, 1);
  const exit = mazeCellId(id, 1, 1);
  return {
    ...state,
    dungeon: {
      layoutVersion: 1,
      keyGate: null,
      latestShrineUse: null,
      id,
      name: "Hearthglass Chapel",
      width: 2,
      height: 2,
      cells: [
        { id: shrine, x: 0, y: 0, exits: ["east", "south"], feature: "shrine" },
        { id: entry, x: 1, y: 0, exits: ["south", "west"], feature: "empty" },
        { id: deadEnd, x: 0, y: 1, exits: ["north"], feature: "empty" },
        { id: exit, x: 1, y: 1, exits: ["north"], feature: "empty" },
      ],
      entryCellId: entry,
      exitCellId: exit,
      currentCellId: entry,
      visitedCellIds: [entry],
      discoveredCellIds: [entry, shrine, exit],
      traps: [],
      traversalLog: ["Entered the maze."],
      turns: 0,
      completed: false,
    },
  };
}

function wayfinderFixture(): DepthState {
  const state = createDepthState("wayfinder-reducer", "hero:wayfinder", "Lio Vale");
  const generated = generateDungeon(state.seed, "dungeon:wayfinder-reducer", 7, 7);
  const dungeon: DungeonState = {
    ...generated,
    cells: generated.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
    traps: [],
  };
  return { ...state, dungeon };
}

describe("composed depth state", () => {
  it("restores exact bounded resources once on first shrine entry and survives replay", () => {
    const base = shrineFixture();
    const before: DepthState = {
      ...base,
      hero: {
        ...base.hero,
        resources: { ...base.hero.resources, health: 1, mana: 0 },
      },
    };
    const expectedHealth = Math.min(
      before.hero.resources.maxHealth,
      before.hero.resources.health + Math.ceil(before.hero.resources.maxHealth / 2),
    );
    const expectedMana = Math.min(
      before.hero.resources.maxMana,
      before.hero.resources.mana + Math.ceil(before.hero.resources.maxMana / 2),
    );
    const restored = stepDepth(before, { type: "move-dungeon", direction: "west" });
    const use = restored.dungeon?.latestShrineUse;

    expect(use).toEqual({
      dungeonId: before.dungeon?.id,
      cellId: restored.dungeon?.currentCellId,
      tick: restored.tick,
      healthBefore: 1,
      healthRestored: expectedHealth - 1,
      healthAfter: expectedHealth,
      manaBefore: 0,
      manaRestored: expectedMana,
      manaAfter: expectedMana,
    });
    expect(restored.hero.resources).toMatchObject({ health: expectedHealth, mana: expectedMana });
    expect(projectLatestShrineUse(restored.dungeon!, restored.tick)).toEqual(use);
    expect(projectLatestShrineUse(restored.dungeon!, restored.tick + 1)).toBeNull();
    expect(restored.log.at(-1)?.message).toContain(`HP 1→${expectedHealth} (+${expectedHealth - 1})`);
    expect(restored.dungeon?.traversalLog.at(-1)).toBe(restored.log.at(-1)?.message);
    expect(stepDepth(JSON.parse(JSON.stringify(before)), { type: "move-dungeon", direction: "west" })).toEqual(restored);

    const deadEnd = stepDepth(restored, { type: "move-dungeon", direction: "south" });
    const revisited = stepDepth(JSON.parse(JSON.stringify(deadEnd)), { type: "move-dungeon", direction: "north" });
    expect(revisited.dungeon?.latestShrineUse).toEqual(use);
    expect(revisited.hero.resources).toEqual(restored.hero.resources);
    expect(revisited.log.at(-1)?.message).not.toContain("invokes the shrine");
  });

  it("records a zero-delta first shrine use when the hero is already whole", () => {
    const before = shrineFixture();
    const restored = stepDepth(before, { type: "move-dungeon", direction: "west" });

    expect(restored.dungeon?.latestShrineUse).toMatchObject({
      healthBefore: before.hero.resources.maxHealth,
      healthRestored: 0,
      healthAfter: before.hero.resources.maxHealth,
      manaBefore: before.hero.resources.maxMana,
      manaRestored: 0,
      manaAfter: before.hero.resources.maxMana,
    });
    expect(restored.log.at(-1)?.message).toContain("RESOURCES FULL");
  });

  it("composes first shrine restoration with far-stair completion", () => {
    const base = hazardFixture();
    const before: DepthState = {
      ...base,
      hero: { ...base.hero, resources: { ...base.hero.resources, health: 1, mana: 0 } },
    };
    const restored = stepDepth(before, { type: "move-dungeon", direction: "south" });

    expect(restored.dungeon?.completed).toBe(true);
    expect(restored.dungeon?.latestShrineUse?.cellId).toBe(restored.dungeon?.exitCellId);
    expect(restored.log.at(-1)?.message).toContain("invokes the shrine");
    expect(restored.log.at(-1)?.message).toContain("far stair");
    expect(restored.dungeon?.traversalLog.at(-1)).toBe(restored.log.at(-1)?.message);
  });

  it("allows positive-health waiting without restoration and rescues zero health to the entry", () => {
    const base = shrineFixture();
    const wounded: DepthState = {
      ...base,
      hero: {
        ...base.hero,
        resources: { ...base.hero.resources, health: 1, mana: 0 },
      },
    };
    const waited = stepDepth(wounded, { type: "wait" });
    expect(waited.hero.resources).toEqual(wounded.hero.resources);
    expect(waited.dungeon).toEqual(wounded.dungeon);
    expect(waited.log.at(-1)?.message).toContain("restores nothing");

    const shrineId = base.dungeon?.cells.find((cell) => cell.feature === "shrine")?.id;
    if (base.dungeon === null || shrineId === undefined) throw new Error("Defeat recovery fixture has no shrine");
    const felled: DepthState = {
      ...base,
      hero: { ...base.hero, resources: { ...base.hero.resources, health: 0, mana: 0 } },
      dungeon: {
        ...base.dungeon,
        currentCellId: shrineId,
        visitedCellIds: [...base.dungeon.visitedCellIds, shrineId],
      },
    };
    const recovered = stepDepth(felled, { type: "wait" });
    expect(recovered.hero.resources.health).toBe(Math.ceil(felled.hero.resources.maxHealth / 4));
    expect(recovered.hero.resources.mana).toBe(Math.ceil(felled.hero.resources.maxMana / 4));
    expect(recovered.dungeon).toEqual({ ...felled.dungeon, currentCellId: felled.dungeon!.entryCellId });
    expect(recovered.log.at(-1)?.message).toContain("regroups at the dungeon entrance");
  });

  it("migrates schema-seven active, completed, and null dungeons without retroactive shrine use", () => {
    const base = shrineFixture();
    const shrineId = base.dungeon?.cells.find((cell) => cell.feature === "shrine")?.id;
    if (base.dungeon === null || shrineId === undefined) throw new Error("Shrine migration fixture has no shrine");
    const active: DepthState = {
      ...base,
      hero: { ...base.hero, resources: { ...base.hero.resources, health: 3, mana: 1 } },
      dungeon: {
        ...base.dungeon,
        currentCellId: shrineId,
        visitedCellIds: [...base.dungeon.visitedCellIds, shrineId],
      },
    };
    const completed: DepthState = {
      ...active,
      dungeon: {
        ...active.dungeon!,
        currentCellId: active.dungeon!.exitCellId,
        visitedCellIds: [...active.dungeon!.visitedCellIds, active.dungeon!.exitCellId],
        completed: true,
      },
    };
    for (const state of [active, completed, { ...base, dungeon: null }] as const) {
      const legacy = JSON.parse(JSON.stringify(state)) as Record<string, any>;
      legacy.schemaVersion = 7;
      if (legacy.dungeon !== null) delete legacy.dungeon.latestShrineUse;
      const upgraded = upgradeDepthState(legacy, state.seed, state.hero.id, state.hero.name);

      expect(upgraded.schemaVersion).toBe(8);
      expect(upgraded.dungeon?.latestShrineUse ?? null).toBeNull();
      expect(upgraded.hero.resources).toEqual(state.hero.resources);
      expect(upgraded.dungeon?.visitedCellIds ?? null).toEqual(state.dungeon?.visitedCellIds ?? null);
      expect(upgradeDepthState(JSON.parse(JSON.stringify(upgraded)), state.seed, state.hero.id, state.hero.name)).toEqual(upgraded);
    }
  });

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

  it("returns with the Wayfinder Key, unlocks while stationary, then crosses on the next tick", () => {
    let state = wayfinderFixture();
    const gate = state.dungeon?.keyGate;
    if (gate === null || gate === undefined) throw new Error("Wayfinder reducer fixture has no gate");
    for (let tick = 0; tick < 128 && state.dungeon?.keyGate?.phase === "uncollected"; tick += 1) {
      const candidate = depthCommandCandidates(state)[0];
      expect(candidate?.command.type).toBe("move-dungeon");
      if (candidate === undefined) throw new Error("Wayfinder reducer has no move candidate");
      state = stepDepth(state, candidate.command);
    }
    expect(state.dungeon?.keyGate?.phase).toBe("carried");
    expect(state.dungeon?.visitedCellIds).not.toContain(gate.shortcutCellId);
    expect(state.log.at(-1)?.message).toContain("finds the Wayfinder Key");

    for (let tick = 0; tick < 128 && state.dungeon !== null && !canUnlockDungeonGate(state.dungeon); tick += 1) {
      expect(projectDungeonTraversal(state.dungeon).mode).toBe("return-to-gate");
      const candidates = depthCommandCandidates(state);
      expect(candidates).toHaveLength(1);
      const candidate = candidates[0];
      if (candidate === undefined) throw new Error("Wayfinder reducer return route has no move");
      state = stepDepth(JSON.parse(JSON.stringify(state)), candidate.command);
    }
    const beforeUnlock = state;
    if (beforeUnlock.dungeon === null) throw new Error("Wayfinder reducer lost its dungeon");
    expect(projectDungeonTraversal(beforeUnlock.dungeon).mode).toBe("unlock-gate");
    expect(depthCommandCandidates(beforeUnlock).map((candidate) => candidate.command)).toEqual([{ type: "unlock-dungeon-gate" }]);
    const unlocked = stepDepth(beforeUnlock, { type: "unlock-dungeon-gate" });
    expect(unlocked.tick).toBe(beforeUnlock.tick + 1);
    expect(unlocked.dungeon?.turns).toBe(beforeUnlock.dungeon.turns);
    expect(unlocked.dungeon?.currentCellId).toBe(gate.unlockCellId);
    expect(unlocked.dungeon?.keyGate?.phase).toBe("open");
    expect(unlocked.hero.experience).toBe(beforeUnlock.hero.experience);
    expect(unlocked.quest).toEqual(beforeUnlock.quest);
    expect(unlocked.log.length).toBe(beforeUnlock.log.length + 1);
    expect(unlocked.log.at(-1)?.message).toContain("Wayfinder Gate is open");
    expect(unlocked.dungeon?.traversalLog.at(-1)).toBe(unlocked.log.at(-1)?.message);

    const crossing = depthCommandCandidates(unlocked);
    expect(crossing).toHaveLength(1);
    expect(crossing[0]?.command.type).toBe("move-dungeon");
    if (crossing[0] === undefined) throw new Error("Opened Wayfinder Gate has no crossing command");
    const crossed = stepDepth(JSON.parse(JSON.stringify(unlocked)), crossing[0].command);
    expect(crossed.dungeon?.currentCellId).toBe(gate.shortcutCellId);
    expect(crossed.dungeon?.turns).toBe((unlocked.dungeon?.turns ?? 0) + 1);
    expect(crossed.log.at(-1)?.message).toContain("crosses the opened Wayfinder Gate");
  });

  it("logs both Wayfinder crossing and completion when the shortcut reaches the far stair", () => {
    const base = createDepthState("wayfinder-exit-reducer", "hero:wayfinder-exit", "Mira Vale");
    const generated = Array.from({ length: 64 }, (_, index) =>
      generateDungeon(base.seed, `dungeon:wayfinder-exit-reducer:${index}`, 7, 7)
    ).find((candidate) => candidate.keyGate?.shortcutCellId === candidate.exitCellId);
    if (generated === undefined) throw new Error("Wayfinder exit reducer fixture found no shortcut at the far stair");
    let state: DepthState = {
      ...base,
      dungeon: {
        ...generated,
        cells: generated.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
        traps: [],
      },
    };
    for (let tick = 0; tick < generated.cells.length * 3 && !state.dungeon?.completed; tick += 1) {
      const candidate = depthCommandCandidates(state)[0];
      if (candidate === undefined) throw new Error("Wayfinder exit reducer fixture has no command");
      state = stepDepth(state, candidate.command);
    }
    expect(state.dungeon?.completed).toBe(true);
    expect(state.dungeon?.currentCellId).toBe(state.dungeon?.exitCellId);
    expect(state.log.at(-1)?.message).toContain("crosses the opened Wayfinder Gate");
    expect(state.log.at(-1)?.message).toContain("far stair");
    expect(state.dungeon?.traversalLog.at(-1)).toContain("Crossed the opened shortcut");
    expect(state.dungeon?.traversalLog.at(-1)).toContain("far stair is reached");
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
    expect(first.completedCounterDuels.length).toBeLessThanOrEqual(maximumCompletedCounterDuels);
    expect(first.atlas.discoveredLocationIds.length).toBeGreaterThan(1);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("migrates released depth-six active, completed, and null combats without inventing events", () => {
    const base = createDepthState("combat-event-migration", "hero:combat-event-migration", "Orin Vale");
    const active = stepDepth(base, { type: "start-combat", encounterId: "encounter:combat-event-migration", enemyCount: 2 });
    if (active.combat === null) throw new Error("Combat migration fixture has no active combat");
    const advancedActive = advanceDepth(active);
    if (advancedActive.combat === null) throw new Error("Combat migration fixture completed too early");
    const activeId = advancedActive.combat.turnOrder[advancedActive.combat.activeIndex];
    const midCombatActive: DepthState = {
      ...advancedActive,
      combat: {
        ...advancedActive.combat,
        combatants: advancedActive.combat.combatants.map((combatant) => combatant.id === activeId
          ? { ...combatant, statuses: [{ kind: "poisoned", duration: 2, potency: 1 }] }
          : combatant),
      },
    };
    let completed = active;
    while (completed.combat !== null) completed = advanceDepth(completed);
    expect(completed.completedCombats).toHaveLength(1);

    const fixtures = [
      { label: "active", state: midCombatActive },
      { label: "completed", state: completed },
      { label: "null", state: base },
    ] as const;
    for (const fixture of fixtures) {
      const legacy = JSON.parse(JSON.stringify(fixture.state)) as Record<string, any>;
      legacy.schemaVersion = 6;
      if (legacy.combat !== null) delete legacy.combat.eventStream;
      for (const combat of legacy.completedCombats) delete combat.eventStream;
      const upgraded = upgradeDepthState(legacy, fixture.state.seed, fixture.state.hero.id, fixture.state.hero.name);

      expect(upgraded.schemaVersion).toBe(8);
      expect(upgraded.combat === null).toBe(fixture.state.combat === null);
      if (upgraded.combat !== null) {
        expect(upgraded.combat.eventStream).toEqual({
          schemaVersion: 1,
          firstRecordedTurn: upgraded.combat.turn + 1,
          events: [],
        });
      }
      for (const combat of upgraded.completedCombats) {
        expect(combat.eventStream).toEqual({
          schemaVersion: 1,
          firstRecordedTurn: combat.turn + 1,
          events: [],
        });
      }
      expect(upgradeDepthState(JSON.parse(JSON.stringify(upgraded)), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);

      if (fixture.label === "active" && upgraded.combat !== null) {
        const candidate = depthCommandCandidates(upgraded)[0];
        if (candidate === undefined) throw new Error("Migrated active combat has no command");
        const resumed = stepDepth(upgraded, candidate.command);
        const replayed = stepDepth(JSON.parse(JSON.stringify(upgraded)), candidate.command);
        const recorded = resumed.combat?.eventStream.events ?? resumed.completedCombats.at(-1)?.eventStream.events ?? [];
        expect(resumed).toEqual(replayed);
        expect(recorded[0]?.turn).toBe(upgraded.combat.turn + 1);
        expect(recorded[0]?.ordinal).toBe(0);
        expect(recorded[0]?.kind).toBe("intent");
        expect(recorded[1]?.kind).toBe("status-tick");
      }
    }
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

  it("completes one Pattern Duel field note exactly at the third meeting without granting rewards", () => {
    const base = createDepthState("field-note-duel", "hero:field-note-duel", "Tarin Reed");
    const command = { type: "start-counter-duel", encounterId: "encounter:field-note-duel" } as const;
    const preview = stepDepth(base, command);
    const speciesId = preview.counterDuel?.opponentSpeciesId;
    const observed = preview.hero.monsterLore.find((entry) => entry.monsterId === speciesId);
    if (speciesId === undefined || observed === undefined) throw new Error("Field-note duel preview has no observed species");
    const prepared = {
      ...base,
      hero: { ...base.hero, monsterLore: [{ ...observed, encounters: 2 }] },
    };
    const started = stepDepth(prepared, command);
    const learned = started.hero.monsterLore.find((entry) => entry.monsterId === speciesId);
    const habit = projectCounterDuelSpeciesHabit(speciesId, 3);
    if (habit?.status !== "established") throw new Error("Expected an established duel field note");
    expect(learned).toMatchObject({ encounters: 3, victories: 0, insight: 0, learned: false });
    expect(started.log).toHaveLength(prepared.log.length + 1);
    expect(started.log.at(-1)?.message).toContain(`Field note completed: ${habit.label}.`);
    expect(started.log.at(-1)?.message.match(/Field note completed/g)).toHaveLength(1);
    expect(started.hero.gold).toBe(prepared.hero.gold);
    expect(started.hero.experience).toBe(prepared.hero.experience);

    const alreadyKnown = {
      ...base,
      hero: { ...base.hero, monsterLore: [{ ...observed, encounters: 3 }] },
    };
    const fourth = stepDepth(alreadyKnown, command);
    expect(fourth.hero.monsterLore[0]?.encounters).toBe(4);
    expect(fourth.log.at(-1)?.message).toContain(`Field note · ${habit.label}.`);
    expect(fourth.log.at(-1)?.message).not.toContain("Field note completed");
  });

  it("combines multiple tactical field-note unlocks into one sorted canonical detail", () => {
    const base = createDepthState("field-note-combat", "hero:field-note-combat", "Ilya Quill");
    const command = { type: "start-combat", encounterId: "encounter:field-note-combat", enemyCount: 5 } as const;
    const preview = stepDepth(base, command);
    const observed = preview.hero.monsterLore;
    expect(observed.length).toBeGreaterThan(1);
    const prepared = {
      ...base,
      hero: { ...base.hero, monsterLore: observed.map((entry) => ({ ...entry, encounters: 2 })) },
    };
    const started = stepDepth(prepared, command);
    const expectedLabels = observed
      .map((entry) => ({ entry, habit: projectCounterDuelSpeciesHabit(entry.monsterId, 3) }))
      .filter((value): value is typeof value & { habit: { status: "established"; label: string } } => value.habit?.status === "established")
      .sort((left, right) => left.entry.monsterId < right.entry.monsterId ? -1 : left.entry.monsterId > right.entry.monsterId ? 1 : 0)
      .map((value) => value.habit.label);
    const message = started.log.at(-1)?.message ?? "";
    expect(started.log).toHaveLength(prepared.log.length + 1);
    expect(message).toContain(`Field notes completed: ${expectedLabels.join("; ")}.`);
    expect(message.match(/Field notes completed/g)).toHaveLength(1);
    expect(started.hero.monsterLore.every((entry) => entry.encounters === 3 && entry.victories === 0 && entry.insight === 0 && !entry.learned)).toBe(true);
    expect(started.hero.gold).toBe(prepared.hero.gold);
    expect(started.hero.experience).toBe(prepared.hero.experience);
  });

  it("runs a bounded Pattern Duel with three reads and applies defeat damage exactly once", () => {
    let state = createDepthState("counter-depth", "hero:counter-depth", "Mira Rook");
    const healthBefore = state.hero.resources.health;
    state = stepDepth(state, { type: "start-counter-duel", encounterId: "encounter:counter-depth" });
    const speciesId = state.counterDuel?.opponentSpeciesId;
    expect(speciesId).toBeTruthy();
    expect(state.hero.monsterLore.find((entry) => entry.monsterId === speciesId)).toMatchObject({ encounters: 1, victories: 0, insight: 0 });

    while (state.counterDuel !== null) {
      const candidates = depthCommandCandidates(state);
      expect(candidates).toHaveLength(3);
      expect(candidates.map((candidate) => candidate.command.type)).toEqual([
        "counter-duel-action",
        "counter-duel-action",
        "counter-duel-action",
      ]);
      const losing = candidates.find((candidate) => {
        const trial = stepDepth(JSON.parse(JSON.stringify(state)), candidate.command);
        const duel = trial.counterDuel ?? trial.completedCounterDuels.at(-1);
        return duel?.history.at(-1)?.result === "opponent";
      });
      state = stepDepth(state, (losing ?? candidates[0])!.command);
    }

    const completed = state.completedCounterDuels.at(-1);
    expect(completed?.outcome).toBe("defeat");
    expect(completed?.history.length).toBeLessThanOrEqual(5);
    expect(state.hero.resources.health).toBe(healthBefore - (completed?.stakes.defeatDamage ?? 0));
    expect(() => stepDepth(state, { type: "counter-duel-action", prediction: "rush" })).toThrow("No counter duel");
    expect(depthCommandCandidates(state).every((candidate) => candidate.command.type !== "start-counter-duel")).toBe(true);
  });
});
