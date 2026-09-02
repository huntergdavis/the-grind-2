import { describe, expect, it } from "vitest";
import { createHeroGrowthState } from "../core/hero-growth";
import { edgeBetween, findRoute } from "./atlas";
import { createCombat } from "./combat";
import { canUnlockDungeonGate, generateDungeon, mazeCellId, projectDungeonTraversal, projectLatestShrineUse } from "./dungeon";
import { projectCounterDuelSpeciesHabit } from "./counter-duel";
import { addItem, describeQuestRewardReceipt, heroLevelForExperience, inventoryCapacity, isValidQuestCompletionState, isValidQuestRewardState, maximumAbilities, maximumHeroLevel } from "./rpg";
import { projectSuccessorQuestLead } from "./quest-lead";
import { advanceDepth, createDepthState, depthCommandCandidates, maximumCompletedCombats, maximumCompletedCounterDuels, maximumDepthLogEntries, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";
import type { DepthState, DungeonState } from "./types";
import { completeQuestWithFacts, downgradeDepthQuestToSchema11 } from "../../tests/quest-fixtures";

function routeCombatFixture(state: DepthState, enemyCount: number): { routed: DepthState; command: Extract<import("./types").DepthCommand, { type: "start-combat" }> } {
  const route = depthCommandCandidates(state).find((candidate) => candidate.command.type === "plan-route");
  if (route?.command.type !== "plan-route") throw new Error("Tactical fixture needs a canonical route");
  const routed = stepDepth(state, route.command);
  const encounterId = unresolvedRouteEncounterId(routed);
  if (encounterId === null) throw new Error("Tactical fixture needs an unresolved route encounter");
  return { routed, command: { type: "start-combat", encounterId, enemyCount } };
}

function forceCombatVictory(state: DepthState): DepthState {
  if (state.combat === null) throw new Error("Victory fixture needs active combat");
  const heroId = state.hero.id;
  const enemies = state.combat.combatants.filter((combatant) => combatant.side === "enemies");
  if (enemies.length !== 1) throw new Error("Victory fixture expects one enemy");
  return advanceDepth({
    ...state,
    combat: {
      ...state.combat,
      activeIndex: 0,
      turnOrder: [heroId, enemies[0]!.id],
      combatants: state.combat.combatants.map((combatant) => (
        combatant.id === heroId
          ? { ...combatant, power: Math.max(combatant.power, 999) }
          : { ...combatant, health: 1 }
      )),
    },
  });
}

function hazardFixture(health?: number, exitAtTrap = false, dungeonId = "dungeon:hazard-reducer"): DepthState {
  const state = createDepthState("hazard-reducer", "hero:hazard", "Corin Vale");
  const id = dungeonId;
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

function readyQuestState(seed = "quest-fulfillment"): DepthState {
  const base = createDepthState(seed, `hero:${seed}`, "Elara Voss");
  const quest = completeQuestWithFacts(base.quest);
  if (quest.status !== "ready-to-fulfill") throw new Error("Quest fixture did not become ready");
  return { ...base, quest };
}

function readyCurrentQuest(state: DepthState): DepthState {
  const quest = completeQuestWithFacts(state.quest);
  if (quest.status !== "ready-to-fulfill") throw new Error("Current quest fixture did not become ready");
  return { ...state, quest };
}

function admittedSuccessorState(seed: string): DepthState {
  let state = readyQuestState(seed);
  state = stepDepth(state, { type: "fulfill-quest", questInstanceId: state.quest.instanceId });
  const reward = depthCommandCandidates(state)[0]?.command;
  if (reward?.type !== "apply-quest-reward") throw new Error("Expected successor fixture reward");
  state = stepDepth(state, reward);
  const admission = depthCommandCandidates(state)[0]?.command;
  if (admission?.type !== "admit-successor-quest") throw new Error("Expected successor fixture admission");
  return stepDepth(state, admission);
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
  it("rejects missing malformed and aggregate-forged schema-fifteen growth state", () => {
    const current = createDepthState("growth-boundary", "hero:growth-boundary", "Aster Vale");
    const missing = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    delete missing.heroGrowth;
    expect(() => upgradeDepthState(missing, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");

    const malformed = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    malformed.heroGrowth.baselineLevel = 0;
    expect(() => upgradeDepthState(malformed, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");

    const aggregate = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    aggregate.heroGrowth.packageSelections["growth-v1:field-temper"] = 1;
    expect(() => upgradeDepthState(aggregate, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");
  });

  it("migrates schema-seventeen learned, full-cap held, and unresolved secret thresholds exactly once", () => {
    const base = createDepthState("secret-knowledge-migration", "hero:secret-knowledge-migration", "Aster Vale");
    const lore = {
      monsterId: "lantern-wolf",
      monsterName: "Lantern Wolf",
      encounters: 3,
      victories: 3,
      insight: 3,
      requiredInsight: 3,
      secretTechniqueId: "secret:lantern-wolf:moonhowl",
      secretTechniqueName: "Moonhowl",
      learned: true,
    } as const;
    const secret = {
      id: lore.secretTechniqueId,
      name: lore.secretTechniqueName,
      kind: "secret" as const,
      effect: "weaken" as const,
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: lore.monsterId,
    };
    function released(state: DepthState): Record<string, any> {
      const legacy = structuredClone(state) as Record<string, any>;
      legacy.schemaVersion = 17;
      delete legacy.secretDiscoveryOutcomes;
      delete legacy.secretDiscoveryAdmissions;
      return legacy;
    }

    const confirmedLegacy = released({
      ...base,
      hero: { ...base.hero, abilities: [...base.hero.abilities, secret], monsterLore: [lore] },
      discoveries: [{
        id: "discovery:legacy:moonhowl",
        tick: 0,
        abilityId: secret.id,
        abilityName: secret.name,
        monsterId: lore.monsterId,
        monsterName: lore.monsterName,
      }],
    });
    const confirmed = upgradeDepthState(confirmedLegacy, base.seed, base.hero.id, base.hero.name);
    expect(confirmed.secretDiscoveryOutcomes).toMatchObject([{
      disposition: "learned",
      reason: "legacy-confirmed",
      thresholdTick: 0,
      repertoireCount: 2,
    }]);
    expect(confirmed.secretDiscoveryAdmissions).toHaveLength(1);
    expect(upgradeDepthState(structuredClone(confirmed), base.seed, base.hero.id, base.hero.name)).toEqual(confirmed);
    for (const collection of ["secretDiscoveryOutcomes", "secretDiscoveryAdmissions"] as const) {
      const malformed = structuredClone(confirmed) as unknown as Record<string, any>;
      malformed[collection][0].extra = true;
      expect(() => upgradeDepthState(malformed, base.seed, base.hero.id, base.hero.name)).toThrow("schema invariants");
      expect(() => stepDepth(malformed as unknown as DepthState, { type: "wait" })).toThrow("schema invariants");
    }
    const orphanedHeld = structuredClone(confirmed) as unknown as Record<string, any>;
    orphanedHeld.secretDiscoveryOutcomes[0].disposition = "deferred-capacity";
    orphanedHeld.secretDiscoveryOutcomes[0].reason = "repertoire-full";
    orphanedHeld.secretDiscoveryOutcomes[0].repertoireCount = maximumAbilities;
    orphanedHeld.secretDiscoveryAdmissions = [];
    orphanedHeld.discoveries = [];
    expect(() => upgradeDepthState(orphanedHeld, base.seed, base.hero.id, base.hero.name)).toThrow("schema invariants");
    expect(() => stepDepth(orphanedHeld as unknown as DepthState, { type: "wait" })).toThrow("schema invariants");

    const template = base.hero.abilities[0]!;
    const fillers = Array.from(
      { length: maximumAbilities - base.hero.abilities.length },
      (_, index) => ({ ...template, id: `spell:migration-filler:${index}`, name: `Migration Filler ${index}` }),
    );
    const held = upgradeDepthState(released({
      ...base,
      hero: { ...base.hero, abilities: [...base.hero.abilities, ...fillers], monsterLore: [lore] },
    }), base.seed, base.hero.id, base.hero.name);
    expect(held.secretDiscoveryOutcomes).toMatchObject([{
      disposition: "deferred-capacity",
      reason: "repertoire-full",
      thresholdTick: null,
      repertoireCount: maximumAbilities,
      mechanics: { effect: "weaken", manaCost: 2, potency: 4 },
    }]);
    expect(held.secretDiscoveryAdmissions).toEqual([]);

    const conflict = { ...template, id: secret.id, name: "Conflicting Art" };
    const conflictFillers = Array.from(
      { length: maximumAbilities - base.hero.abilities.length - 1 },
      (_, index) => ({ ...template, id: `spell:migration-conflict-filler:${index}`, name: `Conflict Filler ${index}` }),
    );
    const rejectedConflict = upgradeDepthState(released({
      ...base,
      hero: {
        ...base.hero,
        abilities: [...base.hero.abilities, conflict, ...conflictFillers],
        monsterLore: [lore],
      },
    }), base.seed, base.hero.id, base.hero.name);
    expect(rejectedConflict.hero.abilities).toHaveLength(maximumAbilities);
    expect(rejectedConflict.secretDiscoveryOutcomes).toMatchObject([{
      disposition: "rejected",
      reason: "ability-id-conflict",
      thresholdTick: null,
    }]);
    expect(upgradeDepthState(
      structuredClone(rejectedConflict),
      base.seed,
      base.hero.id,
      base.hero.name,
    )).toEqual(rejectedConflict);

    const unresolved = upgradeDepthState(released({
      ...base,
      hero: { ...base.hero, monsterLore: [lore] },
    }), base.seed, base.hero.id, base.hero.name);
    expect(unresolved.secretDiscoveryOutcomes).toMatchObject([{
      disposition: "rejected",
      reason: "legacy-unresolved",
      thresholdTick: null,
    }]);
    expect(unresolved.secretDiscoveryAdmissions).toEqual([]);
  });

  it("migrates released schema-fifteen restorative items and combat streams exactly once", () => {
    const base = createDepthState("restorative-migration", "hero:restorative-migration", "Nia Ember");
    const fixture = routeCombatFixture(base, 1);
    const active = stepDepth(fixture.routed, fixture.command);
    let completed = active;
    while (completed.combat !== null) completed = advanceDepth(completed);

    for (const state of [base, active, completed]) {
      const legacy = structuredClone(state) as Record<string, any>;
      legacy.schemaVersion = 15;
      for (const item of legacy.hero.inventory) delete item.restorative;
      for (const combat of [legacy.combat, ...legacy.completedCombats].filter(Boolean)) {
        combat.eventStream.schemaVersion = 1;
        for (const event of combat.eventStream.events) if (event.kind === "intent") delete event.itemId;
        for (const entry of combat.log) delete entry.itemId;
      }

      const upgraded = upgradeDepthState(legacy, state.seed, state.hero.id, state.hero.name);
      const tonic = upgraded.hero.inventory.find((item) => item.id === `${state.hero.id}:item:tonic`);
      expect(upgraded.schemaVersion).toBe(18);
      expect(tonic?.restorative).toEqual({ schemaVersion: 1, kind: "restore-health-quarter-max", target: "self" });
      expect(upgraded.hero.inventory.filter((item) => item.id !== tonic?.id).every((item) => item.restorative === null)).toBe(true);
      for (const combat of [upgraded.combat, ...upgraded.completedCombats].filter((entry): entry is NonNullable<typeof entry> => entry !== null)) {
        expect(combat.eventStream.schemaVersion).toBe(2);
        expect(combat.eventStream.events.filter((event) => event.kind === "intent").every((event) => event.itemId === null)).toBe(true);
        expect(combat.log.every((entry) => entry.itemId === null)).toBe(true);
      }
      expect(upgradeDepthState(structuredClone(upgraded), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);
    }

    const malformed = structuredClone(base) as Record<string, any>;
    delete malformed.hero.inventory[1].restorative;
    expect(() => upgradeDepthState(malformed, base.seed, base.hero.id, base.hero.name)).toThrow("schema invariants");
  });

  it("migrates released schema-sixteen weapon mastery without fabricating combat history", () => {
    const base = createDepthState("weapon-use-migration", "hero:weapon-use-migration", "Nia Ember");
    const fixture = routeCombatFixture(base, 1);
    const active = stepDepth(fixture.routed, fixture.command);
    let completed = active;
    while (completed.combat !== null) completed = advanceDepth(completed);
    const ready = readyQuestState("weapon-use-migration-reward");
    const pending = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });

    for (const state of [base, active, completed, pending]) {
      const legacy = structuredClone(state) as Record<string, any>;
      legacy.schemaVersion = 16;
      for (const item of legacy.hero.inventory) delete item.useMastery;
      for (const combat of [legacy.combat, ...legacy.completedCombats].filter(Boolean)) delete combat.weaponUse;
      if (legacy.pendingQuestReward !== null) delete legacy.pendingQuestReward.item.useMastery;
      for (const summary of legacy.completedQuests) {
        if (summary.reward.status !== "legacy-no-grant") delete summary.reward.grant.item.useMastery;
      }

      const upgraded = upgradeDepthState(legacy, state.seed, state.hero.id, state.hero.name);
      expect(upgraded.schemaVersion).toBe(18);
      for (const item of upgraded.hero.inventory) {
        expect(item.useMastery).toEqual(item.kind === "equipment" && item.slot === "weapon"
          ? { schemaVersion: 1, rulesVersion: "weapon-effective-use-v1", level: 1, experience: 0, receipts: [] }
          : null);
      }
      for (const combat of [upgraded.combat, ...upgraded.completedCombats].filter((entry): entry is NonNullable<typeof entry> => entry !== null)) {
        expect(combat.weaponUse).toEqual({ schemaVersion: 1, tracking: "legacy-untracked" });
      }
      expect(upgraded.pendingQuestReward?.item.useMastery ?? null).toEqual(
        upgraded.pendingQuestReward?.item.slot === "weapon" ? { schemaVersion: 1, rulesVersion: "weapon-effective-use-v1", level: 1, experience: 0, receipts: [] } : null,
      );
      expect(upgradeDepthState(structuredClone(upgraded), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);
    }
  });
  it("freezes and applies one quest reward exactly once across replay and reload", () => {
    const ready = readyQuestState();
    const candidates = depthCommandCandidates(ready);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.command).toEqual({ type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    expect(() => stepDepth(ready, { type: "wait" })).toThrow("must be fulfilled");
    const beforeHero = structuredClone(ready.hero);
    const fulfilled = stepDepth(ready, candidates[0]!.command);
    expect(fulfilled.quest.status).toBe("fulfilled");
    expect(fulfilled.hero).toEqual(beforeHero);
    expect(fulfilled.totalCompletedQuests).toBe(1);
    expect(fulfilled.completedQuests).toHaveLength(1);
    expect(fulfilled.completedQuests[0]).toMatchObject({
      id: `${ready.quest.instanceId}:fulfilled`,
      questInstanceId: ready.quest.instanceId,
      questId: ready.quest.id,
      questOrdinal: 0,
      title: ready.quest.title,
      fulfilledTick: ready.tick + 1,
      objectiveIds: [
        ...ready.quest.objectives.map((objective) => objective.id),
        ...ready.quest.subquests.flatMap((subquest) => subquest.objectives.map((objective) => objective.id)),
      ],
      subquestIds: ready.quest.subquests.map((subquest) => subquest.id),
      reward: {
        status: "pending",
        grant: {
          schemaVersion: 1,
          id: `${ready.quest.instanceId}:fulfilled:reward:0`,
          completionId: `${ready.quest.instanceId}:fulfilled`,
          questInstanceId: ready.quest.instanceId,
          questOrdinal: 0,
          issuedTick: ready.tick + 1,
          rulesVersion: "quest-reward-v1",
          experienceAward: 25,
          baseGoldAward: 15,
          itemDisposition: "inventory",
          itemConversionGold: 0,
          goldAward: 15,
        },
      },
    });
    expect(fulfilled.log.at(-1)?.message).toContain(`QUEST FULFILLED · ${ready.quest.title} · reward prepared: +25 XP · +15 gold`);
    expect(isValidQuestCompletionState(fulfilled.quest, fulfilled.completedQuests, fulfilled.totalCompletedQuests, fulfilled.tick)).toBe(true);
    expect(isValidQuestRewardState(fulfilled.seed, fulfilled.hero, fulfilled.quest, fulfilled.completedQuests, fulfilled.pendingQuestReward, fulfilled.tick)).toBe(true);
    const rewardCommand = depthCommandCandidates(fulfilled)[0]?.command;
    expect(depthCommandCandidates(fulfilled)).toHaveLength(1);
    expect(rewardCommand).toEqual({ type: "apply-quest-reward", grantId: fulfilled.pendingQuestReward?.id });
    expect(() => stepDepth(fulfilled, { type: "wait" })).toThrow("pending quest reward");
    expect(stepDepth(structuredClone(ready), candidates[0]!.command)).toEqual(fulfilled);
    expect(() => stepDepth(ready, { type: "fulfill-quest", questInstanceId: `${ready.quest.instanceId}:forged` })).toThrow("not eligible");
    expect(() => stepDepth(fulfilled, candidates[0]!.command)).toThrow("pending quest reward");
    expect(() => stepDepth(fulfilled, { type: "apply-quest-reward", grantId: `${fulfilled.pendingQuestReward?.id}:forged` })).toThrow("not eligible");
    if (rewardCommand?.type !== "apply-quest-reward") throw new Error("Expected reward command");
    const applied = stepDepth(fulfilled, rewardCommand);
    const reward = applied.completedQuests.at(-1)?.reward;
    if (reward?.status !== "applied") throw new Error("Expected applied reward receipt");
    expect(applied.pendingQuestReward).toBeNull();
    expect(applied.hero.experience).toBe(beforeHero.experience + 25);
    expect(applied.hero.gold).toBe(beforeHero.gold + 15);
    expect(applied.hero.inventory).toContainEqual(reward.grant.item);
    expect(reward.receipt).toMatchObject({
      grantId: reward.grant.id,
      appliedTick: fulfilled.tick + 1,
      experienceBefore: beforeHero.experience,
      experienceDelta: 25,
      experienceAfter: beforeHero.experience + 25,
      goldBefore: beforeHero.gold,
      goldDelta: 15,
      goldAfter: beforeHero.gold + 15,
      itemId: reward.grant.item.id,
      itemDisposition: "inventory",
    });
    expect(isValidQuestRewardState(applied.seed, applied.hero, applied.quest, applied.completedQuests, applied.pendingQuestReward, applied.tick)).toBe(true);
    expect(upgradeDepthState(structuredClone(applied), applied.seed, applied.hero.id, applied.hero.name)).toEqual(applied);
    expect(() => stepDepth(applied, rewardCommand)).toThrow("must be admitted");
    expect(stepDepth(structuredClone(fulfilled), rewardCommand)).toEqual(applied);
  });

  it.each([
    [23, 48],
    [24, 49],
  ])("applies quest reward XP atomically from %i to %i across the Level 3 threshold", (experienceBefore, experienceAfter) => {
    const initial = readyQuestState(`quest-reward-threshold:${experienceBefore}`);
    const ready = {
      ...initial,
      hero: {
        ...initial.hero,
        experience: experienceBefore,
        level: heroLevelForExperience(experienceBefore),
      },
    };
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const command = depthCommandCandidates(fulfilled)[0]?.command;
    if (command?.type !== "apply-quest-reward") throw new Error("Expected quest reward command");
    const applied = stepDepth(fulfilled, command);
    const reward = applied.completedQuests.at(-1)?.reward;
    if (reward?.status !== "applied") throw new Error("Expected applied quest reward");
    expect(applied.hero).toMatchObject({ experience: experienceAfter, level: 3 });
    expect(reward.receipt).toMatchObject({
      experienceBefore,
      experienceDelta: 25,
      experienceAfter,
      levelBefore: 2,
      levelAfter: 3,
    });
    expect(upgradeDepthState(structuredClone(applied), applied.seed, applied.hero.id, applied.hero.name)).toEqual(applied);
  });

  it("preserves a released level-50 reward receipt while expanding its hero to Level 51", () => {
    const initial = readyQuestState("released-level-receipt");
    const ready: DepthState = {
      ...initial,
      hero: { ...initial.hero, experience: 29_975, level: 50 },
    };
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const command = depthCommandCandidates(fulfilled)[0]?.command;
    if (command?.type !== "apply-quest-reward") throw new Error("Expected quest reward command");
    const current = stepDepth(fulfilled, command);
    const released = structuredClone(current) as Record<string, any>;
    const reward = released.completedQuests.at(-1)?.reward;
    if (reward?.status !== "applied") throw new Error("Expected applied reward receipt");
    released.schemaVersion = 12;
    released.hero.level = 50;
    reward.receipt.schemaVersion = 1;
    reward.receipt.levelAfter = 50;

    const upgraded = upgradeDepthState(released, current.seed, current.hero.id, current.hero.name);
    const preserved = upgraded.completedQuests.at(-1)?.reward;
    expect(upgraded.hero).toMatchObject({ experience: 30_000, level: 51 });
    expect(preserved?.status === "applied" ? preserved.receipt : null).toMatchObject({
      schemaVersion: 1,
      experienceAfter: 30_000,
      levelAfter: 50,
    });
    expect(isValidQuestRewardState(upgraded.seed, upgraded.hero, upgraded.quest, upgraded.completedQuests, null, upgraded.tick)).toBe(true);
  });

  it("admits one deterministic successor only after reward settlement", () => {
    const ready = readyQuestState("quest-successor-admission");
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    expect(depthCommandCandidates(fulfilled).map((candidate) => candidate.command.type)).toEqual(["apply-quest-reward"]);
    const reward = depthCommandCandidates(fulfilled)[0]?.command;
    if (reward?.type !== "apply-quest-reward") throw new Error("Expected reward command");
    const settled = stepDepth(fulfilled, reward);
    const completion = settled.completedQuests.at(-1);
    if (completion === undefined || completion.reward.status !== "applied") throw new Error("Expected settled completion");
    const candidates = depthCommandCandidates(settled);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.command).toEqual({ type: "admit-successor-quest", completionId: completion.id });
    expect(() => stepDepth(settled, { type: "wait" })).toThrow("must be admitted");
    expect(() => stepDepth(settled, { type: "admit-successor-quest", completionId: `${completion.id}:forged` })).toThrow("not eligible");

    const preserved = {
      hero: structuredClone(settled.hero),
      atlas: structuredClone(settled.atlas),
      towns: structuredClone(settled.towns),
      companions: structuredClone(settled.companions),
      dungeon: structuredClone(settled.dungeon),
      completedQuests: structuredClone(settled.completedQuests),
      totalCompletedQuests: settled.totalCompletedQuests,
    };
    const command = candidates[0]!.command;
    const admitted = stepDepth(settled, command);
    expect(admitted.quest).toMatchObject({ ordinal: 1, admittedTick: settled.tick + 1, status: "active" });
    expect(admitted.quest.instanceId).toBe(`${admitted.quest.id}:instance:1`);
    expect(admitted.quest.title).not.toBe(settled.quest.title);
    expect([...admitted.quest.objectives, ...admitted.quest.subquests.flatMap((subquest) => subquest.objectives)]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "quest:win-battle", current: 0, status: "active" }),
        expect.objectContaining({ id: "quest:cross-maze", current: 0, status: "active" }),
        expect.objectContaining({ id: "quest:find-shrine", current: 0, status: "active" }),
      ]),
    );
    expect({
      hero: admitted.hero,
      atlas: admitted.atlas,
      towns: admitted.towns,
      companions: admitted.companions,
      dungeon: admitted.dungeon,
      completedQuests: admitted.completedQuests,
      totalCompletedQuests: admitted.totalCompletedQuests,
    }).toEqual(preserved);
    expect(admitted.log.at(-1)?.message).toBe(`NEW QUEST · ${admitted.quest.title} · chapter 2 · 3 objectives.`);
    expect(stepDepth(structuredClone(settled), command)).toEqual(admitted);
    expect(stepDepth(JSON.parse(JSON.stringify(settled)), command)).toEqual(admitted);
    expect(upgradeDepthState(structuredClone(admitted), admitted.seed, admitted.hero.id, admitted.hero.name)).toEqual(admitted);
    expect(() => stepDepth(admitted, command)).toThrow("not eligible");
    expect(() => upgradeDepthState({ ...admitted, quest: { ...admitted.quest, title: "Forged sequel" } }, admitted.seed, admitted.hero.id, admitted.hero.name)).toThrow("schema invariants");
  });

  it("reveals and routes one place-bound successor lead without replacing an active route", () => {
    const admitted = admittedSuccessorState("quest-successor-place-bound");
    const lead = projectSuccessorQuestLead(admitted.seed, admitted.atlas, admitted.quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const neutral = admitted.atlas.locations.find((location) => location.id !== lead.locationId && location.kind !== "town");
    if (neutral === undefined) throw new Error("Expected a neutral lead fixture location");
    const awaitingRoute: DepthState = {
      ...admitted,
      atlas: { ...admitted.atlas, currentLocationId: neutral.id, route: null },
    };
    const candidates = depthCommandCandidates(awaitingRoute);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      label: `plot the quest route to ${lead.locationName}`,
      command: { type: "plan-route", destinationId: lead.locationId },
    });
    const routed = stepDepth(awaitingRoute, candidates[0]!.command);
    expect(projectSuccessorQuestLead(routed.seed, routed.atlas, routed.quest)?.phase).toBe("routed");
    expect(() => stepDepth(routed, { type: "plan-route", destinationId: neutral.id })).toThrow("cannot be replaced");
  });

  it("finishes an unrelated existing route before planning the successor lead", () => {
    const admitted = admittedSuccessorState("quest-successor-existing-route");
    const lead = projectSuccessorQuestLead(admitted.seed, admitted.atlas, admitted.quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const unrelated = admitted.atlas.locations.find((location) =>
      location.id !== admitted.atlas.currentLocationId &&
      location.id !== lead.locationId &&
      (location.kind === "wilds" || location.kind === "landmark")
    );
    if (unrelated === undefined) throw new Error("Expected unrelated route destination");
    const routed = stepDepth(admitted, { type: "plan-route", destinationId: unrelated.id });
    const preservedRoute = structuredClone(routed.atlas.route);
    expect(depthCommandCandidates(routed).every((candidate) => candidate.command.type === "start-combat" || candidate.command.type === "start-counter-duel" || candidate.command.type === "travel")).toBe(true);
    expect(routed.atlas.route).toEqual(preservedRoute);
    expect(() => stepDepth(routed, { type: "plan-route", destinationId: lead.locationId })).toThrow("cannot be replaced");

    const arrived = stepDepth(routed, { type: "travel", distance: 10_000 });
    expect(arrived.atlas).toMatchObject({ currentLocationId: unrelated.id, route: null });
    expect(depthCommandCandidates(arrived)[0]).toMatchObject({
      command: { type: "plan-route", destinationId: lead.locationId },
    });
  });

  it("announces the marked lead only after the final leg of a multi-leg route", () => {
    const admitted = admittedSuccessorState("quest-successor-multileg-arrival");
    const lead = projectSuccessorQuestLead(admitted.seed, admitted.atlas, admitted.quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const origin = admitted.atlas.locations.find((location) => {
      try {
        return findRoute({ ...admitted.atlas, currentLocationId: location.id, route: null }, lead.locationId).length >= 3;
      } catch {
        return false;
      }
    });
    if (origin === undefined) throw new Error("Expected a multi-leg lead route");
    const awaitingRoute: DepthState = {
      ...admitted,
      atlas: { ...admitted.atlas, currentLocationId: origin.id, route: null },
    };
    const routed = stepDepth(awaitingRoute, { type: "plan-route", destinationId: lead.locationId });
    const path = routed.atlas.route?.path;
    if (path === undefined || path.length < 3) throw new Error("Expected a multi-leg planned route");
    const firstLegDistance = edgeBetween(routed.atlas, path[0]!, path[1]!).distance;
    const intermediate = stepDepth(routed, { type: "travel", distance: firstLegDistance });
    expect(intermediate.atlas.route).not.toBeNull();
    expect(intermediate.atlas.currentLocationId).not.toBe(lead.locationId);
    expect(intermediate.log.at(-1)?.message).not.toContain("marked lead");

    const arrived = stepDepth(intermediate, { type: "travel", distance: 10_000 });
    expect(arrived.atlas).toMatchObject({ currentLocationId: lead.locationId, route: null });
    expect(arrived.log.at(-1)?.message).toContain(`marked lead for ${admitted.quest.title}`);
    expect(arrived.log.filter((entry) => entry.message.includes("marked lead"))).toHaveLength(1);
  });

  it("advances a successor maze objective only in its selected lead dungeon", () => {
    const admitted = admittedSuccessorState("quest-successor-exact-lead-dungeon");
    const lead = projectSuccessorQuestLead(admitted.seed, admitted.atlas, admitted.quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const otherDungeon = admitted.atlas.locations.find((location) => location.kind === "dungeon" && location.id !== lead.locationId);
    if (otherDungeon === undefined) throw new Error("Expected a second dungeon fixture");
    const mazeObjective = (quest: DepthState["quest"]) => [
      ...quest.objectives,
      ...quest.subquests.flatMap((subquest) => subquest.objectives),
    ].find((objective) => objective.rule.kind === "complete-dungeon");

    const wrongId = `dungeon:${otherDungeon.id}:quest:${admitted.quest.ordinal}`;
    const wrongFixture = hazardFixture(undefined, false, wrongId);
    const wrongState: DepthState = {
      ...admitted,
      atlas: { ...admitted.atlas, currentLocationId: otherDungeon.id, route: null },
      dungeon: wrongFixture.dungeon,
    };
    const wrongCompleted = stepDepth(wrongState, { type: "move-dungeon", direction: "south" });
    expect(wrongCompleted.dungeon?.completed).toBe(true);
    expect(mazeObjective(wrongCompleted.quest)).toMatchObject({ current: 0, status: "active" });

    const leadId = `dungeon:${lead.locationId}:quest:${admitted.quest.ordinal}`;
    const leadFixture = hazardFixture(undefined, false, leadId);
    const leadState: DepthState = {
      ...wrongCompleted,
      atlas: { ...wrongCompleted.atlas, currentLocationId: lead.locationId, route: null },
      dungeon: leadFixture.dungeon,
    };
    const leadCompleted = stepDepth(leadState, { type: "move-dungeon", direction: "south" });
    expect(leadCompleted.dungeon?.completed).toBe(true);
    expect(mazeObjective(leadCompleted.quest)).toMatchObject({ current: 1, status: "complete" });
    expect(projectSuccessorQuestLead(leadCompleted.seed, leadCompleted.atlas, leadCompleted.quest)?.phase).toBe("resolved");
  });

  it("credits a town only on its first canonical visit", () => {
    const initial = createDepthState("quest-town-first-visit", "hero:town-first-visit", "Nera Moss");
    const destination = initial.atlas.locations.find((location) => location.kind === "town" && initial.towns[location.id] === undefined);
    if (destination === undefined) throw new Error("Town first-visit fixture has no unvisited town");
    const arrived: DepthState = {
      ...initial,
      atlas: {
        ...initial.atlas,
        currentLocationId: destination.id,
        discoveredLocationIds: [...new Set([...initial.atlas.discoveredLocationIds, destination.id])],
        route: null,
      },
    };
    const first = stepDepth(arrived, { type: "visit-town" });
    const objective = (state: DepthState) => state.quest.objectives.find((entry) => entry.rule.kind === "visit-location");
    expect(objective(first)?.current).toBe(1);
    const revisit = stepDepth(first, { type: "visit-town" });
    expect(objective(revisit)?.current).toBe(1);
  });

  it("opens a fresh chapter-qualified expedition when a successor revisits a completed dungeon", () => {
    const ready = readyQuestState("quest-successor-repeat-dungeon");
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const reward = depthCommandCandidates(fulfilled)[0]?.command;
    if (reward?.type !== "apply-quest-reward") throw new Error("Expected reward command");
    const settled = stepDepth(fulfilled, reward);
    const admission = depthCommandCandidates(settled)[0]?.command;
    if (admission?.type !== "admit-successor-quest") throw new Error("Expected admission command");
    const admitted = stepDepth(settled, admission);
    const lead = projectSuccessorQuestLead(admitted.seed, admitted.atlas, admitted.quest);
    if (lead === null) throw new Error("Expected successor quest lead");
    const location = admitted.atlas.locations.find((entry) => entry.id === lead.locationId);
    if (location === undefined) throw new Error("Expected a dungeon location");
    const priorId = `dungeon:${location.id}`;
    const generated = generateDungeon(admitted.seed, priorId, 7, 7, true);
    const priorDungeon: DungeonState = {
      ...generated,
      currentCellId: generated.exitCellId,
      visitedCellIds: generated.cells.map((cell) => cell.id),
      discoveredCellIds: generated.cells.map((cell) => cell.id),
      traps: generated.traps.map((trap) => ({ ...trap, phase: "triggered" })),
      keyGate: generated.keyGate === null ? null : { ...generated.keyGate, phase: "open" },
      completed: true,
    };
    const revisiting: DepthState = {
      ...admitted,
      atlas: { ...admitted.atlas, currentLocationId: location.id, route: null },
      dungeon: priorDungeon,
    };
    const candidates = depthCommandCandidates(revisiting);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.command).toEqual({
      type: "enter-dungeon",
      dungeonId: `dungeon:${location.id}:quest:1`,
      width: 7,
      height: 7,
    });
    const entered = stepDepth(revisiting, candidates[0]!.command);
    expect(entered.dungeon).toMatchObject({
      id: `dungeon:${location.id}:quest:1`,
      completed: false,
    });
  });

  it("retains exactly the newest eight immutable completions across twelve successor cycles", () => {
    let state = createDepthState("quest-successor-long-run", "hero:successor-long-run", "Tamsin Reed");
    const titles: string[] = [];
    for (let cycle = 0; cycle < 12; cycle += 1) {
      titles.push(state.quest.title);
      state = readyCurrentQuest(state);
      state = stepDepth(state, { type: "fulfill-quest", questInstanceId: state.quest.instanceId });
      const reward = depthCommandCandidates(state)[0]?.command;
      if (reward?.type !== "apply-quest-reward") throw new Error("Expected long-run reward command");
      state = stepDepth(state, reward);
      const admission = depthCommandCandidates(state)[0]?.command;
      if (admission?.type !== "admit-successor-quest") throw new Error("Expected long-run admission command");
      state = stepDepth(state, admission);
      expect(isValidQuestCompletionState(state.quest, state.completedQuests, state.totalCompletedQuests, state.tick)).toBe(true);
      expect(isValidQuestRewardState(state.seed, state.hero, state.quest, state.completedQuests, state.pendingQuestReward, state.tick)).toBe(true);
    }
    expect(state.totalCompletedQuests).toBe(12);
    expect(state.quest.ordinal).toBe(12);
    expect(state.completedQuests).toHaveLength(8);
    expect(state.completedQuests.map((completion) => completion.questOrdinal)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(state.completedQuests.every((completion) => completion.reward.status === "applied")).toBe(true);
    expect(titles.every((title, index) => index === 0 || title !== titles[index - 1])).toBe(true);
    const restored = JSON.parse(JSON.stringify(state));
    expect(upgradeDepthState(restored, state.seed, state.hero.id, state.hero.name)).toEqual(restored);
  });

  it("finishes a released in-flight encounter before making successor admission sole", () => {
    const ready = readyQuestState("quest-successor-legacy-encounter");
    let state = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const reward = depthCommandCandidates(state)[0]?.command;
    if (reward?.type !== "apply-quest-reward") throw new Error("Expected legacy reward command");
    state = stepDepth(state, reward);
    const completionId = state.completedQuests.at(-1)?.id;
    if (completionId === undefined) throw new Error("Expected legacy settled completion");
    state = { ...state, combat: createCombat(state.seed, state.hero, "encounter:released-after-reward", 1) };
    expect(depthCommandCandidates(state).every((candidate) => candidate.command.type === "combat-action")).toBe(true);
    expect(() => stepDepth(state, { type: "admit-successor-quest", completionId })).toThrow("active encounter");
    for (let turn = 0; state.combat !== null && turn < 200; turn += 1) {
      const command = depthCommandCandidates(state)[0]?.command;
      if (command?.type !== "combat-action") throw new Error("Expected encounter resolution command");
      state = stepDepth(state, command);
    }
    expect(state.combat).toBeNull();
    expect(depthCommandCandidates(state).map((candidate) => candidate.command)).toEqual([{
      type: "admit-successor-quest",
      completionId,
    }]);
  });

  it("settles one start-bound weapon use before stronger loot auto-equips and replays exactly", () => {
    const base = createDepthState("mastery-preloot-5", "hero:mastery-preloot", "Rhea Moss");
    const fixture = routeCombatFixture(base, 1);
    const started = stepDepth(fixture.routed, fixture.command);
    const combat = started.combat;
    const boundWeaponId = started.hero.equipment.weapon;
    if (combat === null || combat.weaponUse.tracking !== "tracked" || boundWeaponId === null) throw new Error("Mastery settlement fixture has no bound weapon");
    const heroIndex = combat.turnOrder.indexOf(started.hero.id);
    const enemy = combat.combatants.find((entry) => entry.side === "enemies");
    if (heroIndex < 0 || enemy === undefined) throw new Error("Mastery settlement fixture has no combatants");
    const staged: DepthState = {
      ...started,
      combat: {
        ...combat,
        activeIndex: heroIndex,
        combatants: combat.combatants.map((entry) => entry.id === started.hero.id
          ? { ...entry, power: 999 }
          : entry.id === enemy.id ? { ...entry, health: 1 } : entry),
      },
    };
    const command = { type: "combat-action", action: { actorId: started.hero.id, type: "attack", targetId: enemy.id, abilityId: null, itemId: null } } as const;
    const settled = stepDepth(staged, command);
    expect(stepDepth(structuredClone(staged), command)).toEqual(settled);
    expect(settled.combat).toBeNull();
    const usedWeapon = settled.hero.inventory.find((item) => item.id === boundWeaponId);
    const droppedWeapon = settled.hero.inventory.find((item) => item.id === `loot:${combat.id}:0`);
    expect(usedWeapon?.useMastery).toMatchObject({ experience: 1, level: 2 });
    expect(usedWeapon?.useMastery?.receipts).toHaveLength(1);
    expect(usedWeapon?.useMastery?.receipts[0]).toMatchObject({ combatId: combat.id, outcome: "victory", basicStrikes: 1, experienceBefore: 0, experienceAfter: 1, levelBefore: 1, levelAfter: 2 });
    expect(droppedWeapon).toMatchObject({ name: "Bright Blade", slot: "weapon", useMastery: { experience: 0, level: 1, receipts: [] } });
    expect(settled.hero.equipment.weapon).toBe(droppedWeapon?.id);
    expect(settled.log.at(-1)?.message).toContain("Roadworn Blade · 1 basic strike");
    expect(settled.log.at(-1)?.message).toContain("Use Level 1→2 · no combat bonus");
    expect(upgradeDepthState(structuredClone(settled), settled.seed, settled.hero.id, settled.hero.name)).toEqual(settled);
    expect(() => stepDepth(settled, command)).toThrow("No combat is active");
  });

  it("resolves a full inventory by explicitly converting only the incoming reward", () => {
    const ready = readyQuestState("quest-reward-overflow");
    const inventory = [...ready.hero.inventory];
    for (let index = inventory.length; index < 32; index += 1) {
      inventory.push({ id: `overflow:item:${index}`, name: `Packed Supply ${index}`, kind: "consumable", slot: null, rarity: "common", quantity: 1, modifiers: {}, restorative: null, useMastery: null });
    }
    const packed: DepthState = { ...ready, hero: { ...ready.hero, inventory } };
    const fulfilled = stepDepth(packed, { type: "fulfill-quest", questInstanceId: packed.quest.instanceId });
    const grant = fulfilled.pendingQuestReward;
    expect(grant?.itemDisposition).toBe("converted-to-gold");
    expect(grant?.itemConversionGold).toBeGreaterThan(0);
    const command = depthCommandCandidates(fulfilled)[0]?.command;
    if (command?.type !== "apply-quest-reward" || grant === null) throw new Error("Expected overflow reward command");
    const applied = stepDepth(fulfilled, command);
    const reward = applied.completedQuests.at(-1)?.reward;
    if (reward?.status !== "applied") throw new Error("Expected overflow receipt");
    expect(applied.hero.inventory).toEqual(inventory);
    expect(applied.hero.inventory.some((item) => item.id === grant.item.id)).toBe(false);
    expect(applied.hero.gold - packed.hero.gold).toBe(15 + grant.itemConversionGold);
    expect(reward.receipt).toMatchObject({ itemDisposition: "converted-to-gold", itemConversionGold: grant.itemConversionGold });
  });

  it("records actual zero reward deltas at numeric saturation", () => {
    const ready = readyQuestState("quest-reward-saturation");
    const saturated: DepthState = {
      ...ready,
      hero: { ...ready.hero, experience: Number.MAX_SAFE_INTEGER, level: maximumHeroLevel, gold: Number.MAX_SAFE_INTEGER },
    };
    const fulfilled = stepDepth(saturated, { type: "fulfill-quest", questInstanceId: saturated.quest.instanceId });
    const command = depthCommandCandidates(fulfilled)[0]?.command;
    if (command?.type !== "apply-quest-reward") throw new Error("Expected saturated reward command");
    const applied = stepDepth(fulfilled, command);
    const reward = applied.completedQuests.at(-1)?.reward;
    if (reward?.status !== "applied") throw new Error("Expected saturated receipt");
    expect(reward.receipt).toMatchObject({ experienceDelta: 0, experienceAfter: Number.MAX_SAFE_INTEGER, goldDelta: 0, goldAfter: Number.MAX_SAFE_INTEGER, levelBefore: maximumHeroLevel, levelAfter: maximumHeroLevel });
    expect(isValidQuestRewardState(applied.seed, applied.hero, applied.quest, applied.completedQuests, null, applied.tick)).toBe(true);
  });

  it("records partial and fully capped overflow conversion credit without overstating it", () => {
    for (const availableGoldCapacity of [18, 0]) {
      const ready = readyQuestState(`quest-reward-conversion-cap:${availableGoldCapacity}`);
      const inventory = [...ready.hero.inventory];
      for (let index = inventory.length; index < 32; index += 1) {
        inventory.push({ id: `cap:item:${availableGoldCapacity}:${index}`, name: `Packed Cap Supply ${index}`, kind: "consumable", slot: null, rarity: "common", quantity: 1, modifiers: {}, restorative: null, useMastery: null });
      }
      const packed: DepthState = {
        ...ready,
        hero: { ...ready.hero, inventory, gold: Number.MAX_SAFE_INTEGER - availableGoldCapacity },
      };
      const fulfilled = stepDepth(packed, { type: "fulfill-quest", questInstanceId: packed.quest.instanceId });
      const grant = fulfilled.pendingQuestReward;
      const command = depthCommandCandidates(fulfilled)[0]?.command;
      if (grant === null || command?.type !== "apply-quest-reward") throw new Error("Expected capped conversion command");
      const applied = stepDepth(fulfilled, command);
      const reward = applied.completedQuests.at(-1)?.reward;
      if (reward?.status !== "applied") throw new Error("Expected capped conversion receipt");
      const expectedGoldDelta = Math.min(availableGoldCapacity, grant.goldAward);
      const expectedConversionDelta = Math.max(0, expectedGoldDelta - grant.baseGoldAward);
      expect(reward.receipt).toMatchObject({
        goldDelta: expectedGoldDelta,
        goldAfter: Number.MAX_SAFE_INTEGER,
        itemDisposition: "converted-to-gold",
        itemConversionGold: expectedConversionDelta,
      });
      expect(applied.hero.inventory).toEqual(inventory);
      expect(applied.log.at(-1)?.message).toContain(describeQuestRewardReceipt(grant, reward.receipt));
      expect(describeQuestRewardReceipt(grant, reward.receipt)).toContain(
        availableGoldCapacity === 0
          ? `${grant.itemConversionGold} gold value capped (+0 credited)`
          : `+${expectedConversionDelta}/${grant.itemConversionGold} gold (cap reached)`,
      );
    }
  });

  it("finishes an active encounter before fulfillment and rejects forged saved completion history", () => {
    const ready = readyQuestState("quest-encounter-boundary");
    const base = createDepthState("quest-encounter-boundary");
    const destinationId = base.atlas.edges.find((edge) => edge.from === base.atlas.currentLocationId)?.to
      ?? base.atlas.edges.find((edge) => edge.to === base.atlas.currentLocationId)?.from;
    if (destinationId === undefined) throw new Error("Quest encounter fixture has no neighboring route");
    const routed = stepDepth(base, { type: "plan-route", destinationId });
    if (routed.atlas.route === null) throw new Error("Quest encounter fixture has no active route");
    const fighting = stepDepth(routed, {
      type: "start-combat",
      encounterId: `encounter:route:${routed.atlas.route.path.join(">")}`,
      enemyCount: 1,
    });
    const forgedReady = { ...fighting, quest: ready.quest };
    expect(() => stepDepth(forgedReady, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId })).toThrow("active encounter");
    expect(depthCommandCandidates(forgedReady)).not.toHaveLength(0);
    expect(depthCommandCandidates(forgedReady).every((candidate) => candidate.command.type === "combat-action")).toBe(true);

    let resolved = forgedReady;
    for (let turn = 0; resolved.combat !== null && turn < 100; turn += 1) {
      const candidates = depthCommandCandidates(resolved);
      const candidate = candidates.find((entry) => entry.command.type === "combat-action" && entry.command.action.type !== "guard");
      if (candidate?.command.type !== "combat-action") throw new Error("Active quest encounter offered no progress-making combat action");
      resolved = stepDepth(resolved, candidate.command);
    }
    expect(resolved.combat).toBeNull();
    expect(resolved.quest.status).toBe("ready-to-fulfill");
    expect(depthCommandCandidates(resolved)[0]?.command).toEqual({ type: "fulfill-quest", questInstanceId: ready.quest.instanceId });

    const legacy = JSON.parse(JSON.stringify(forgedReady)) as Record<string, any>;
    downgradeDepthQuestToSchema11(legacy);
    legacy.schemaVersion = 9;
    legacy.quest.status = "complete";
    delete legacy.completedQuests;
    delete legacy.totalCompletedQuests;
    delete legacy.quest.instanceId;
    delete legacy.quest.ordinal;
    delete legacy.quest.admittedTick;
    const migrated = upgradeDepthState(legacy, forgedReady.seed, forgedReady.hero.id, forgedReady.hero.name);
    expect(migrated.quest.status).toBe("ready-to-fulfill");
    expect(depthCommandCandidates(migrated).every((candidate) => candidate.command.type === "combat-action")).toBe(true);

    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const forgedSummary = fulfilled.completedQuests.map((summary) => ({ ...summary, fulfilledTick: summary.fulfilledTick + 1 }));
    expect(isValidQuestCompletionState(fulfilled.quest, forgedSummary, fulfilled.totalCompletedQuests, fulfilled.tick)).toBe(false);
    expect(() => upgradeDepthState(
      { ...fulfilled, completedQuests: forgedSummary },
      fulfilled.seed,
      fulfilled.hero.id,
      fulfilled.hero.name,
    )).toThrow("schema invariants");
    expect(() => upgradeDepthState(
      { ...fulfilled, totalCompletedQuests: fulfilled.totalCompletedQuests + 1 },
      fulfilled.seed,
      fulfilled.hero.id,
      fulfilled.hero.name,
    )).toThrow("schema invariants");
    expect(() => upgradeDepthState(
      { ...fulfilled, tick: Number.NaN },
      fulfilled.seed,
      fulfilled.hero.id,
      fulfilled.hero.name,
    )).toThrow("schema invariants");
    expect(isValidQuestCompletionState(
      fulfilled.quest,
      fulfilled.completedQuests.map((summary) => ({ ...summary, fulfilledTick: fulfilled.quest.admittedTick })),
      fulfilled.totalCompletedQuests,
      fulfilled.tick,
    )).toBe(false);
  });

  it("finishes an active Pattern Duel before making fulfillment the sole command", () => {
    const seed = "quest-counter-duel-boundary";
    const ready = readyQuestState(seed);
    const started = stepDepth(createDepthState(seed), {
      type: "start-counter-duel",
      encounterId: "encounter:quest-counter-duel",
    });
    let resolving: DepthState = { ...started, quest: ready.quest };
    expect(() => stepDepth(resolving, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId })).toThrow("active encounter");
    while (resolving.counterDuel !== null) {
      const candidates = depthCommandCandidates(resolving);
      expect(candidates).toHaveLength(3);
      expect(candidates.every((candidate) => candidate.command.type === "counter-duel-action")).toBe(true);
      const winning = candidates.find((candidate) => {
        const trial = stepDepth(structuredClone(resolving), candidate.command);
        const duel = trial.counterDuel ?? trial.completedCounterDuels.at(-1);
        return duel?.history.at(-1)?.result === "hero";
      });
      resolving = stepDepth(resolving, (winning ?? candidates[0])!.command);
    }
    expect(resolving.quest.status).toBe("ready-to-fulfill");
    expect(depthCommandCandidates(resolving).map((candidate) => candidate.command)).toEqual([{
      type: "fulfill-quest",
      questInstanceId: ready.quest.instanceId,
    }]);
  });

  it("migrates released schema-nine active and complete quests without fabricating rewards", () => {
    for (const complete of [false, true]) {
      const current = complete ? readyQuestState(`quest-migration:${complete}`) : createDepthState(`quest-migration:${complete}`);
      const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
      downgradeDepthQuestToSchema11(legacy);
      legacy.schemaVersion = 9;
      delete legacy.completedQuests;
      delete legacy.totalCompletedQuests;
      delete legacy.quest.instanceId;
      delete legacy.quest.ordinal;
      delete legacy.quest.admittedTick;
      if (complete) legacy.quest.status = "complete";
      const upgraded = upgradeDepthState(legacy, current.seed, current.hero.id, current.hero.name);
      expect(upgraded.schemaVersion).toBe(18);
      expect(upgraded.quest.instanceId).toBe(`${upgraded.quest.id}:instance:0`);
      expect(upgraded.quest.ordinal).toBe(0);
      expect(upgraded.quest.admittedTick).toBe(0);
      expect(upgraded.quest.status).toBe(complete ? "ready-to-fulfill" : "active");
      expect(upgraded.completedQuests).toEqual([]);
      expect(upgraded.totalCompletedQuests).toBe(0);
      expect(upgraded.pendingQuestReward).toBeNull();
      expect(upgraded.hero).toEqual(current.hero);
      expect(upgradeDepthState(structuredClone(upgraded), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);

      expect(() => upgradeDepthState(
        { ...legacy, quest: { ...legacy.quest, title: "Forged legacy chapter" } },
        current.seed,
        current.hero.id,
        current.hero.name,
      )).toThrow("schema invariants");
    }
  });

  it("migrates a schema-ten fulfilled quest into one pending reward without retroactive credit", () => {
    const ready = readyQuestState("quest-reward-schema-ten");
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    const legacy = JSON.parse(JSON.stringify(fulfilled)) as Record<string, any>;
    downgradeDepthQuestToSchema11(legacy);
    legacy.schemaVersion = 10;
    legacy.tick += 9;
    delete legacy.pendingQuestReward;
    for (const summary of legacy.completedQuests) delete summary.reward;
    const upgraded = upgradeDepthState(legacy, fulfilled.seed, fulfilled.hero.id, fulfilled.hero.name);
    expect(upgraded.schemaVersion).toBe(18);
    expect(upgraded.hero).toEqual(fulfilled.hero);
    expect(upgraded.pendingQuestReward).not.toBeNull();
    expect(upgraded.completedQuests.at(-1)?.fulfilledTick).toBe(fulfilled.tick);
    expect(upgraded.pendingQuestReward?.issuedTick).toBe(legacy.tick);
    expect(upgraded.completedQuests.at(-1)?.reward.status).toBe("pending");
    expect(depthCommandCandidates(upgraded).map((candidate) => candidate.command)).toEqual([{
      type: "apply-quest-reward",
      grantId: upgraded.pendingQuestReward?.id,
    }]);
    expect(upgradeDepthState(structuredClone(upgraded), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);
    const command = depthCommandCandidates(upgraded)[0]?.command;
    if (command?.type !== "apply-quest-reward") throw new Error("Expected migrated reward command");
    const applied = stepDepth(upgraded, command);
    expect(applied.completedQuests.at(-1)?.reward).toMatchObject({
      status: "applied",
      receipt: { appliedTick: legacy.tick + 1 },
    });
    expect(stepDepth(structuredClone(upgraded), command)).toEqual(applied);
    expect(upgradeDepthState(structuredClone(applied), applied.seed, applied.hero.id, applied.hero.name)).toEqual(applied);
    expect(() => upgradeDepthState(
      { ...legacy, quest: { ...legacy.quest, title: "Forged rewarded chapter" } },
      fulfilled.seed,
      fulfilled.hero.id,
      fulfilled.hero.name,
    )).toThrow("schema invariants");
    expect(() => stepDepth(applied, command)).toThrow("must be admitted");
  });

  it("migrates exact schema-eleven successor rules and old prose without losing lifecycle state", () => {
    const active = admittedSuccessorState("quest-rules-schema-eleven");
    const ready = readyCurrentQuest(active);
    const fulfilled = stepDepth(ready, { type: "fulfill-quest", questInstanceId: ready.quest.instanceId });
    if (fulfilled.pendingQuestReward === null) throw new Error("Schema-eleven fixture has no pending reward");
    const rewarded = stepDepth(fulfilled, { type: "apply-quest-reward", grantId: fulfilled.pendingQuestReward.id });
    for (const fixture of [active, ready, fulfilled, rewarded]) {
      const legacy = JSON.parse(JSON.stringify(fixture)) as Record<string, any>;
      downgradeDepthQuestToSchema11(legacy);
      legacy.schemaVersion = 11;
      const upgraded = upgradeDepthState(legacy, fixture.seed, fixture.hero.id, fixture.hero.name);
      expect(upgraded).toEqual({
        ...JSON.parse(JSON.stringify(fixture)),
        heroGrowth: createHeroGrowthState(fixture.hero),
      });
      expect(upgraded.schemaVersion).toBe(18);
      expect(upgradeDepthState(JSON.parse(JSON.stringify(upgraded)), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);
    }
  });

  it("rejects forged schema-eleven definitions and missing or mismatched schema-twelve rules", () => {
    const current = admittedSuccessorState("quest-rules-forgery");
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    downgradeDepthQuestToSchema11(legacy);
    legacy.schemaVersion = 11;
    legacy.quest.objectives[0].description = "A forged old objective";
    expect(() => upgradeDepthState(legacy, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");

    const missingRule = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    delete missingRule.quest.objectives[0].rule;
    expect(() => upgradeDepthState(missingRule, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");

    const wrongRule = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    wrongRule.quest.subquests[0].objectives[0].rule.binding = "any";
    expect(() => upgradeDepthState(wrongRule, current.seed, current.hero.id, current.hero.name)).toThrow("schema invariants");
  });
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
    const shrineObjective = (state: DepthState) => state.quest.subquests
      .flatMap((subquest) => subquest.objectives)
      .find((objective) => objective.rule.kind === "discover-dungeon-feature");
    expect(shrineObjective(restored)?.current).toBe(1);
    expect(stepDepth(JSON.parse(JSON.stringify(before)), { type: "move-dungeon", direction: "west" })).toEqual(restored);

    const deadEnd = stepDepth(restored, { type: "move-dungeon", direction: "south" });
    const revisited = stepDepth(JSON.parse(JSON.stringify(deadEnd)), { type: "move-dungeon", direction: "north" });
    expect(revisited.dungeon?.latestShrineUse).toEqual(use);
    expect(revisited.hero.resources).toEqual(restored.hero.resources);
    expect(revisited.log.at(-1)?.message).not.toContain("invokes the shrine");
    expect(shrineObjective(revisited)?.current).toBe(1);
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

  it("fully rests at or below half health before one unresolved road encounter", () => {
    const base = createDepthState("critical-roadside-recovery", "hero:roadside", "Tarin Vale");
    const route = depthCommandCandidates(base).find((candidate) => candidate.command.type === "plan-route");
    if (route?.command.type !== "plan-route") throw new Error("Recovery fixture needs a route");
    const planned = stepDepth(base, route.command);
    const healthyEncounter = depthCommandCandidates(planned)[0];
    expect(["start-combat", "start-counter-duel"]).toContain(healthyEncounter?.command.type);

    const threshold = Math.floor(planned.hero.resources.maxHealth / 2);
    for (const health of [0, Math.max(0, threshold - 1), threshold]) {
      const depleted: DepthState = {
        ...planned,
        hero: {
          ...planned.hero,
          resources: { ...planned.hero.resources, health, mana: 0 },
        },
      };
      const candidates = depthCommandCandidates(depleted);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.command).toEqual({ type: "wait" });
      expect(candidates[0]?.label).toBe("make a critical roadside camp");

      const rested = stepDepth(depleted, { type: "wait" });
      expect(rested.hero.resources).toMatchObject({
        health: rested.hero.resources.maxHealth,
        mana: rested.hero.resources.maxMana,
      });
      expect(rested.log.at(-1)?.message).toContain(`HP ${health}→${rested.hero.resources.maxHealth}`);
      expect(rested.log.at(-1)?.message).toContain(`MP 0→${rested.hero.resources.maxMana}`);
      expect(rested.log.at(-1)?.message).toContain("Fully rested; ready for the road");
      expect(depthCommandCandidates(rested)[0]?.command).toEqual(healthyEncounter?.command);
    }

    const aboveThreshold: DepthState = {
      ...planned,
      hero: {
        ...planned.hero,
        resources: { ...planned.hero.resources, health: threshold + 1 },
      },
    };
    expect(depthCommandCandidates(aboveThreshold).every((candidate) => candidate.command.type !== "wait")).toBe(true);
    expect(depthCommandCandidates(planned).every((candidate) => candidate.command.type !== "wait")).toBe(true);

    const withCriticalHealth = (state: DepthState): DepthState => ({
      ...state,
      hero: {
        ...state.hero,
        resources: { ...state.hero.resources, health: threshold, mana: 0 },
      },
    });
    if (healthyEncounter?.command.type !== "start-combat") throw new Error("Recovery fixture has no canonical tactical encounter");
    const activeCombat = withCriticalHealth(stepDepth(planned, healthyEncounter.command));
    const activeDuel = withCriticalHealth(stepDepth(planned, { type: "start-counter-duel", encounterId: "encounter:active-duel" }));
    const activeDungeon = {
      ...hazardFixture(threshold),
      atlas: planned.atlas,
    };
    expect(depthCommandCandidates(activeCombat).every((candidate) => candidate.command.type === "combat-action")).toBe(true);
    expect(depthCommandCandidates(activeDuel).every((candidate) => candidate.command.type === "counter-duel-action")).toBe(true);
    expect(depthCommandCandidates(activeDungeon).every((candidate) => candidate.command.type !== "wait")).toBe(true);
    expect(stepDepth(activeCombat, { type: "wait" }).hero.resources).toEqual(activeCombat.hero.resources);
    expect(stepDepth(activeDuel, { type: "wait" }).hero.resources).toEqual(activeDuel.hero.resources);
    expect(stepDepth(activeDungeon, { type: "wait" }).hero.resources).toEqual(activeDungeon.hero.resources);
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
      downgradeDepthQuestToSchema11(legacy);
      legacy.schemaVersion = 7;
      if (legacy.dungeon !== null) delete legacy.dungeon.latestShrineUse;
      const upgraded = upgradeDepthState(legacy, state.seed, state.hero.id, state.hero.name);

      expect(upgraded.schemaVersion).toBe(18);
      expect(upgraded.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
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
    const initial = createDepthState("combat-event-migration", "hero:combat-event-migration", "Orin Vale");
    const destinationId = initial.atlas.edges.find((edge) => edge.from === initial.atlas.currentLocationId)?.to
      ?? initial.atlas.edges.find((edge) => edge.to === initial.atlas.currentLocationId)?.from;
    if (destinationId === undefined) throw new Error("Combat migration fixture has no neighboring route");
    const base = stepDepth(initial, { type: "plan-route", destinationId });
    if (base.atlas.route === null) throw new Error("Combat migration fixture has no active route");
    const active = stepDepth(base, {
      type: "start-combat",
      encounterId: `encounter:route:${base.atlas.route.path.join(">")}`,
      enemyCount: 2,
    });
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
      downgradeDepthQuestToSchema11(legacy);
      legacy.schemaVersion = 6;
      if (legacy.combat !== null) {
        delete legacy.combat.eventStream;
        delete legacy.combat.threat;
      }
      for (const combat of legacy.completedCombats) {
        delete combat.eventStream;
        delete combat.threat;
      }
      const upgraded = upgradeDepthState(legacy, fixture.state.seed, fixture.state.hero.id, fixture.state.hero.name);
      const expectedLegacyIds = [
        ...(upgraded.combat === null ? [] : [upgraded.combat.id]),
        ...upgraded.completedCombats.map((combat) => combat.id),
      ].sort();

      expect(upgraded.schemaVersion).toBe(18);
      expect(upgraded.legacyUnratedCombatIds).toEqual(expectedLegacyIds);
      expect(upgraded.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
      expect(upgraded.combat === null).toBe(fixture.state.combat === null);
      if (upgraded.combat !== null) {
        expect(upgraded.combat.threat).toEqual({ schemaVersion: 1, rating: "legacy-unrated" });
        expect(upgraded.combat.eventStream).toEqual({
          schemaVersion: 2,
          firstRecordedTurn: upgraded.combat.turn + 1,
          events: [],
        });
      }
      for (const combat of upgraded.completedCombats) {
        expect(combat.threat).toEqual({ schemaVersion: 1, rating: "legacy-unrated" });
        expect(combat.eventStream).toEqual({
          schemaVersion: 2,
          firstRecordedTurn: combat.turn + 1,
          events: [],
        });
      }
      expect(upgradeDepthState(JSON.parse(JSON.stringify(upgraded)), upgraded.seed, upgraded.hero.id, upgraded.hero.name)).toEqual(upgraded);
      expect(() => upgradeDepthState(
        { ...upgraded, legacyUnratedCombatIds: [...upgraded.legacyUnratedCombatIds, "encounter:forged"] },
        upgraded.seed,
        upgraded.hero.id,
        upgraded.hero.name,
      )).toThrow("schema invariants");
      if (upgraded.legacyUnratedCombatIds.length > 0) {
        expect(() => upgradeDepthState(
          { ...upgraded, legacyUnratedCombatIds: [] },
          upgraded.seed,
          upgraded.hero.id,
          upgraded.hero.name,
        )).toThrow("schema invariants");
        expect(() => upgradeDepthState(
          { ...upgraded, legacyUnratedCombatIds: [upgraded.legacyUnratedCombatIds[0]!, upgraded.legacyUnratedCombatIds[0]!] },
          upgraded.seed,
          upgraded.hero.id,
          upgraded.hero.name,
        )).toThrow("schema invariants");
      }

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

  it("admits and consumes one deterministic emergency restorative inside the combat turn", () => {
    const base = createDepthState("restorative-reducer", "hero:restorative-reducer", "Nia Ember");
    const fixture = routeCombatFixture(base, 1);
    const started = stepDepth(fixture.routed, fixture.command);
    const combat = started.combat;
    if (combat === null) throw new Error("Restorative reducer fixture needs combat");
    const heroUnit = combat.combatants.find((entry) => entry.id === started.hero.id);
    const enemy = combat.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Restorative reducer fixture lacks actors");
    const healthBefore = Math.floor(heroUnit.maxHealth / 3);
    const staged: DepthState = {
      ...started,
      hero: { ...started.hero, resources: { ...started.hero.resources, health: healthBefore } },
      combat: {
        ...combat,
        activeIndex: 0,
        turnOrder: [heroUnit.id, enemy.id],
        combatants: combat.combatants.map((entry) => entry.id === heroUnit.id ? { ...entry, health: healthBefore } : entry),
      },
    };
    const tonic = staged.hero.inventory.find((item) => item.restorative !== null);
    if (tonic === undefined) throw new Error("Restorative reducer fixture lacks a tonic");
    const itemCandidates = depthCommandCandidates(staged).filter((candidate) => candidate.command.type === "combat-action" && candidate.command.action.type === "item");
    expect(itemCandidates).toHaveLength(1);
    expect(itemCandidates[0]?.command).toMatchObject({ type: "combat-action", action: { type: "item", itemId: tonic.id, targetId: staged.hero.id } });
    const command = itemCandidates[0]?.command;
    if (command?.type !== "combat-action" || command.action.type !== "item") throw new Error("Expected restorative action");
    const resolved = stepDepth(staged, command);
    const use = resolved.combat?.eventStream.events.find((event) => event.turn === resolved.combat?.turn && event.kind === "restorative-used");
    expect(use?.kind === "restorative-used" ? use.quantityBefore : null).toBe(3);
    expect(use?.kind === "restorative-used" ? use.quantityAfter : null).toBe(2);
    expect(resolved.hero.inventory.find((item) => item.id === tonic.id)?.quantity).toBe(2);
    expect(resolved.hero.resources.health).toBe(use?.kind === "restorative-used" ? use.healthAfter : -1);
    expect(resolved.combat?.combatants.find((entry) => entry.id === resolved.hero.id)?.health).toBe(resolved.hero.resources.health);
    expect(upgradeDepthState(structuredClone(resolved), resolved.seed, resolved.hero.id, resolved.hero.name)).toEqual(resolved);

    const depletedSource: DepthState = {
      ...staged,
      hero: { ...staged.hero, inventory: staged.hero.inventory.map((item) => item.id === tonic.id ? { ...item, quantity: 1 } : item) },
    };
    const depleted = stepDepth(depletedSource, command);
    expect(depleted.hero.inventory.some((item) => item.id === tonic.id)).toBe(false);

    const aboveThreshold = healthBefore + 1;
    const safe: DepthState = {
      ...staged,
      hero: { ...staged.hero, resources: { ...staged.hero.resources, health: aboveThreshold } },
      combat: {
        ...staged.combat!,
        combatants: staged.combat!.combatants.map((entry) => entry.id === staged.hero.id ? { ...entry, health: aboveThreshold } : entry),
      },
    };
    expect(depthCommandCandidates(safe).some((candidate) => candidate.command.type === "combat-action" && candidate.command.action.type === "item")).toBe(false);
    expect(() => stepDepth(safe, command)).toThrow("unavailable");
    expect(() => stepDepth(staged, {
      type: "combat-action",
      action: { actorId: staged.hero.id, type: "item", targetId: staged.hero.id, abilityId: null, itemId: staged.hero.equipment.weapon! },
    })).toThrow("unavailable");
    const enemyTurn: DepthState = {
      ...staged,
      combat: { ...staged.combat!, activeIndex: 0, turnOrder: [enemy.id, staged.hero.id] },
    };
    expect(() => stepDepth(enemyTurn, {
      type: "combat-action",
      action: { actorId: enemy.id, type: "item", targetId: enemy.id, abilityId: null, itemId: tonic.id },
    })).toThrow("unavailable");
  });

  it("selects the smallest stable restorative item id when effective heals tie", () => {
    const base = createDepthState("restorative-selection", "hero:restorative-selection", "Nia Ember");
    const fixture = routeCombatFixture(base, 1);
    const started = stepDepth(fixture.routed, fixture.command);
    const combat = started.combat;
    if (combat === null) throw new Error("Restorative selection fixture needs combat");
    const heroUnit = combat.combatants.find((entry) => entry.id === started.hero.id);
    const enemy = combat.combatants.find((entry) => entry.side === "enemies");
    const tonic = started.hero.inventory.find((item) => item.restorative !== null);
    if (heroUnit === undefined || enemy === undefined || tonic === undefined) throw new Error("Restorative selection fixture is incomplete");
    const alternate = { ...tonic, id: "aaa:restorative", name: "Quiet Tonic", quantity: 1 };
    const health = Math.floor(heroUnit.maxHealth / 3);
    const staged: DepthState = {
      ...started,
      hero: { ...started.hero, inventory: [...started.hero.inventory, alternate], resources: { ...started.hero.resources, health } },
      combat: {
        ...combat,
        activeIndex: 0,
        turnOrder: [heroUnit.id, enemy.id],
        combatants: combat.combatants.map((entry) => entry.id === heroUnit.id ? { ...entry, health } : entry),
      },
    };
    const item = depthCommandCandidates(staged).find((candidate) => candidate.command.type === "combat-action" && candidate.command.action.type === "item");
    expect(item?.command).toMatchObject({ type: "combat-action", action: { itemId: alternate.id } });
    expect(() => stepDepth(staged, {
      type: "combat-action",
      action: { actorId: staged.hero.id, type: "item", targetId: staged.hero.id, abilityId: null, itemId: tonic.id },
    })).toThrow("unavailable");
  });

  it("adds one deterministic inventory reward for a combat victory", () => {
    let state = createDepthState("reward-seed", "hero:reward", "Iona Vale");
    const startingItems = state.hero.inventory.length;
    const fixture = routeCombatFixture(state, 1);
    state = stepDepth(fixture.routed, fixture.command);
    state = forceCombatVictory(state);
    const outcome = state.completedCombats.at(-1)?.outcome;
    expect(outcome).toBe("victory");
    expect(state.hero.inventory).toHaveLength(startingItems + 1);
    expect(state.hero.inventory.at(-1)?.id).toBe(`loot:${fixture.command.encounterId}:0`);
    expect(state.quest.subquests.find((entry) => entry.id === "subquest-supplies")?.objectives[0]?.current).toBe(1);
  });

  it("fails closed when a legacy arbitrary objective command is forged at runtime", () => {
    const initial = createDepthState("legacy-objective-command");
    expect(() => stepDepth(initial, {
      type: "progress-objective",
      objectiveId: "quest:visit-towns",
      amount: 99,
    } as never)).toThrow("Unsupported depth command");
  });

  it("does not credit item acquisition when a victory cannot add loot to a full inventory", () => {
    let state = createDepthState("reward-seed", "hero:reward-full", "Iona Vale");
    let hero = state.hero;
    for (let index = hero.inventory.length; index < inventoryCapacity; index += 1) {
      hero = addItem(hero, {
        id: `item:full-pack:${index}`,
        name: `Packed Token ${index}`,
        kind: "key",
        slot: null,
        rarity: "common",
        quantity: 1,
        modifiers: {},
        useMastery: null,
        restorative: null,
      });
    }
    state = { ...state, hero };
    const fixture = routeCombatFixture(state, 1);
    state = stepDepth(fixture.routed, fixture.command);
    state = forceCombatVictory(state);
    expect(state.completedCombats.at(-1)?.outcome).toBe("victory");
    expect(state.hero.inventory).toHaveLength(inventoryCapacity);
    const itemObjective = state.quest.subquests
      .flatMap((subquest) => subquest.objectives)
      .find((objective) => objective.rule.kind === "acquire-item");
    expect(itemObjective?.current).toBe(0);
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
    const fixture = routeCombatFixture(base, 5);
    const preview = stepDepth(fixture.routed, fixture.command);
    const observed = preview.hero.monsterLore;
    expect(observed.length).toBeGreaterThan(1);
    const prepared = {
      ...fixture.routed,
      hero: { ...fixture.routed.hero, monsterLore: observed.map((entry) => ({ ...entry, encounters: 2 })) },
    };
    const started = stepDepth(prepared, fixture.command);
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

  it("commits a learned monster threshold outcome, discovery, admission, and ability atomically", () => {
    const base = createDepthState("secret-threshold-atomic", "hero:secret-threshold-atomic", "Ilya Quill");
    const fixture = routeCombatFixture(base, 1);
    const started = stepDepth(fixture.routed, fixture.command);
    const observed = started.hero.monsterLore[0];
    if (observed === undefined) throw new Error("Threshold fixture needs observed lore");
    const prepared: DepthState = {
      ...started,
      hero: {
        ...started.hero,
        monsterLore: [{ ...observed, encounters: 3, victories: 2, insight: 2, learned: false }],
      },
    };
    const resolved = forceCombatVictory(prepared);
    expect(resolved.secretDiscoveryOutcomes).toMatchObject([{
      monsterId: observed.monsterId,
      disposition: "learned",
      reason: "slot-available",
      thresholdTick: resolved.tick,
      sourceCombatId: started.combat?.id,
    }]);
    expect(resolved.discoveries).toHaveLength(1);
    expect(resolved.secretDiscoveryAdmissions).toEqual([{
      id: `${resolved.secretDiscoveryOutcomes[0]!.id}:admission:${resolved.discoveries[0]!.id}`,
      tick: resolved.tick,
      outcomeId: resolved.secretDiscoveryOutcomes[0]!.id,
      discoveryId: resolved.discoveries[0]!.id,
    }]);
    expect(resolved.hero.abilities.at(-1)).toMatchObject({
      id: observed.secretTechniqueId,
      name: observed.secretTechniqueName,
      level: 1,
      experience: 0,
      uses: 0,
      sourceMonsterId: observed.monsterId,
    });
    expect(upgradeDepthState(structuredClone(resolved), resolved.seed, resolved.hero.id, resolved.hero.name)).toEqual(resolved);
  });

  it("admits exactly one oldest held monster technique at a safe town beat without a reward", () => {
    const base = createDepthState("held-admission", "hero:held-admission", "Ilya Quill");
    const lore = [
      {
        monsterId: "lantern-wolf",
        monsterName: "Lantern Wolf",
        encounters: 3,
        victories: 3,
        insight: 3,
        requiredInsight: 3,
        secretTechniqueId: "secret:lantern-wolf:moonhowl",
        secretTechniqueName: "Moonhowl",
        learned: true,
      },
      {
        monsterId: "copperhorn",
        monsterName: "Copperhorn",
        encounters: 3,
        victories: 3,
        insight: 3,
        requiredInsight: 3,
        secretTechniqueId: "secret:copperhorn:bellmetal-charge",
        secretTechniqueName: "Bellmetal Charge",
        learned: true,
      },
    ];
    const outcomes: DepthState["secretDiscoveryOutcomes"] = [
      {
        id: `${base.seed}:secret-outcome:lantern-wolf`,
        recordedTick: 6,
        thresholdTick: 5,
        sourceCombatId: "combat:later",
        monsterId: "lantern-wolf",
        monsterName: "Lantern Wolf",
        abilityId: "secret:lantern-wolf:moonhowl",
        abilityName: "Moonhowl",
        mechanics: { effect: "weaken", manaCost: 2, potency: 4 },
        disposition: "deferred-capacity",
        reason: "repertoire-full",
        repertoireCount: maximumAbilities,
        repertoireLimit: maximumAbilities,
      },
      {
        id: `${base.seed}:secret-outcome:copperhorn`,
        recordedTick: 4,
        thresholdTick: 3,
        sourceCombatId: "combat:earlier",
        monsterId: "copperhorn",
        monsterName: "Copperhorn",
        abilityId: "secret:copperhorn:bellmetal-charge",
        abilityName: "Bellmetal Charge",
        mechanics: { effect: "burning", manaCost: 2, potency: 5 },
        disposition: "deferred-capacity",
        reason: "repertoire-full",
        repertoireCount: maximumAbilities,
        repertoireLimit: maximumAbilities,
      },
    ];
    const state: DepthState = {
      ...base,
      tick: 10,
      hero: { ...base.hero, monsterLore: lore },
      secretDiscoveryOutcomes: outcomes,
    };
    const candidates = depthCommandCandidates(state);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.command).toEqual({ type: "admit-deferred-secret", outcomeId: `${base.seed}:secret-outcome:copperhorn` });
    expect(() => stepDepth(state, {
      type: "admit-deferred-secret",
      outcomeId: `${base.seed}:secret-outcome:lantern-wolf`,
    })).toThrow("not eligible");
    const before = {
      experience: state.hero.experience,
      gold: state.hero.gold,
      resources: state.hero.resources,
      abilityCount: state.hero.abilities.length,
    };
    const admitted = stepDepth(state, candidates[0]!.command);
    expect(admitted.secretDiscoveryAdmissions).toHaveLength(1);
    expect(admitted.discoveries).toHaveLength(1);
    expect(admitted.hero.abilities).toHaveLength(before.abilityCount + 1);
    expect(admitted.hero.abilities.at(-1)).toMatchObject({
      id: "secret:copperhorn:bellmetal-charge",
      level: 1,
      experience: 0,
      uses: 0,
    });
    expect(admitted.hero).toMatchObject({ experience: before.experience, gold: before.gold, resources: before.resources });
    expect(admitted.secretDiscoveryOutcomes).toEqual(outcomes);
    expect(upgradeDepthState(structuredClone(admitted), admitted.seed, admitted.hero.id, admitted.hero.name)).toEqual(admitted);
    const practice = depthCommandCandidates(admitted);
    expect(practice).toHaveLength(1);
    expect(practice[0]?.command).toEqual({ type: "train-ability", abilityId: "secret:copperhorn:bellmetal-charge" });
    const practiced = stepDepth(admitted, practice[0]!.command);
    expect(depthCommandCandidates(practiced)[0]?.command).toEqual({
      type: "admit-deferred-secret",
      outcomeId: `${base.seed}:secret-outcome:lantern-wolf`,
    });
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
