import { describe, expect, it } from "vitest";
import { neighboringLocationIds, planRoute } from "../depth/atlas";
import { projectLatestCombatTurn } from "../depth/combat-turn";
import { canUnlockDungeonGate, chooseDungeonMove, generateDungeon, mazeCellId, moveDungeon, projectDungeonMoveKnowledge, projectDungeonWayfinding } from "../depth/dungeon";
import { projectSuccessorQuestLead } from "../depth/quest-lead";
import { createQuest, describeCompletedQuestReward, heroLevelForExperience, heroMasteryForExperience, maximumHeroLevel } from "../depth/rpg";
import { depthCommandCandidates, stepDepth, unresolvedRouteEncounterId } from "../depth/state";
import type { DungeonState } from "../depth/types";
import { completeQuestWithFacts, downgradeDepthQuestToSchema11 } from "../../tests/quest-fixtures";
import { createChampionInduction } from "./champions";
import { canonicalHash } from "./canonical";
import { createHeroGrowthState } from "./hero-growth";
import { createCampaignLegacyState } from "./legends";
import { projectLegacyMentorArcBeat, scheduledLegacyMentorPromiseTownVisit, scheduledLegacyMentorReturnTownVisit, scheduledLegacyTownVisit, totalTownVisits } from "./legacy-manifestations";
import {
  actorPolicy,
  advanceWorld,
  campaignDirector,
  catchUpWorld,
  createWorld,
  attentionPolicyForMode,
  rulesEngine,
  upgradeWorldState,
} from "./simulation";

function worldBeforeTrap() {
  const world = createWorld("world-trap", "campaign:world-trap");
  const id = "dungeon:world-trap";
  const trap = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const deadEnd = mazeCellId(id, 0, 1);
  const exit = mazeCellId(id, 1, 1);
  const dungeon: DungeonState = {
    layoutVersion: 1,
    keyGate: null,
    latestShrineUse: null,
    id,
    name: "Ashen Archive",
    width: 2,
    height: 2,
    cells: [
      { id: trap, x: 0, y: 0, exits: ["east", "south"], feature: "trap" },
      { id: entry, x: 1, y: 0, exits: ["south", "west"], feature: "empty" },
      { id: deadEnd, x: 0, y: 1, exits: ["north"], feature: "empty" },
      { id: exit, x: 1, y: 1, exits: ["north"], feature: "shrine" },
    ],
    entryCellId: entry,
    exitCellId: exit,
    currentCellId: entry,
    visitedCellIds: [entry, exit],
    discoveredCellIds: [entry, trap, deadEnd, exit],
    traps: [{ cellId: trap, kind: "tripwire", detectDifficulty: 14, disarmDifficulty: 16, phase: "hidden" }],
    traversalLog: ["Returned from the far stair."],
    turns: 2,
    completed: false,
  };
  return { ...world, depth: { ...world.depth, dungeon } };
}

function worldBeforeWayfinderUnlock() {
  const world = createWorld("world-wayfinder", "campaign:world-wayfinder");
  const generated = generateDungeon(world.depth.seed, "dungeon:world-wayfinder", 7, 7);
  let dungeon: DungeonState = {
    ...generated,
    cells: generated.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
    traps: [],
  };
  for (let turn = 0; turn < dungeon.cells.length * 2 && dungeon.keyGate?.phase === "uncollected"; turn += 1) {
    const direction = chooseDungeonMove(dungeon, world.depth.seed, turn);
    if (direction === null) throw new Error("World Wayfinder fixture cannot reach its key");
    dungeon = moveDungeon(dungeon, direction);
  }
  for (let turn = 0; turn < dungeon.cells.length && !canUnlockDungeonGate(dungeon); turn += 1) {
    const direction = chooseDungeonMove(dungeon, world.depth.seed, turn);
    if (direction === null) throw new Error("World Wayfinder fixture cannot return to its gate");
    dungeon = moveDungeon(dungeon, direction);
  }
  if (!canUnlockDungeonGate(dungeon)) throw new Error("World Wayfinder fixture did not reach its gate");
  return { ...world, depth: { ...world.depth, dungeon } };
}

function worldBeforeSightedWayfinderKey() {
  const world = createWorld("world-sighted-wayfinder", "campaign:world-sighted-wayfinder");
  const generated = generateDungeon(world.depth.seed, "dungeon:world-sighted-wayfinder", 7, 7);
  let dungeon: DungeonState = {
    ...generated,
    cells: generated.cells.map((cell) => cell.feature === "trap" ? { ...cell, feature: "empty" as const } : cell),
    traps: [],
  };
  for (let turn = 0; turn < dungeon.cells.length * 2; turn += 1) {
    if (projectDungeonMoveKnowledge(dungeon).some((move) => move.sightedWayfinderKey)) {
      return {
        ...world,
        scene: { ...world.scene, mode: "dungeon" as const, location: dungeon.name },
        depth: { ...world.depth, dungeon },
      };
    }
    const direction = chooseDungeonMove(dungeon, world.depth.seed, turn);
    if (direction === null) throw new Error("World sighted-key fixture found no movement option");
    dungeon = moveDungeon(dungeon, direction);
    if (dungeon.keyGate?.phase !== "uncollected") break;
  }
  throw new Error("World sighted-key fixture did not stop before collection");
}

function withHeroExperience<T extends ReturnType<typeof createWorld>>(world: T, experience: number): T {
  const level = heroLevelForExperience(experience);
  const depthHero = { ...world.depth.hero, experience, level };
  let staged: T = {
    ...world,
    hero: { ...world.hero, experience, level, mastery: heroMasteryForExperience(experience) },
    depth: { ...world.depth, hero: depthHero, heroGrowth: createHeroGrowthState(depthHero) },
  };
  if (level === maximumHeroLevel) {
    staged = {
      ...staged,
      championInduction: createChampionInduction(staged, "earned", {
        id: "test:staged-champion",
        type: "wait",
      }),
    };
  }
  return upgradeWorldState(staged) as T;
}

function advanceToDueLegacyVisit(base: ReturnType<typeof createWorld>): ReturnType<typeof createWorld> {
  let state = base;
  for (let step = 0; step < 800; step += 1) {
    const opportunity = campaignDirector(state);
    if (
      opportunity.mode === "chronicle" &&
      opportunity.candidates.length > 0 &&
      opportunity.candidates.every((candidate) => candidate.command.type === "visit-town")
    ) return state;
    state = advanceWorld(state);
  }
  throw new Error(`Autonomous play did not reach a due legacy visit within 800 decisions: ${JSON.stringify({
    tick: state.tick,
    visits: totalTownVisits(state),
    currentLocationId: state.depth.atlas.currentLocationId,
    route: state.depth.atlas.route?.destinationId ?? null,
    quest: { ordinal: state.depth.quest.ordinal, status: state.depth.quest.status },
    latestCommands: state.chronicle.slice(-8).map((entry) => entry.commandType),
  })}`);
}

function rehashFact<T extends { id: string }>(prefix: string, value: T): T {
  const { id: _id, ...content } = value;
  return { ...content, id: `${prefix}:${canonicalHash(content)}` } as T;
}

function releasedDepthFiveDungeon(seed: string, id: string) {
  const generated = generateDungeon(seed, id, 7, 7);
  const gate = generated.keyGate;
  if (gate === null) throw new Error("Released depth-five fixture has no removable generated gate");
  const unlock = generated.cells.find((cell) => cell.id === gate.unlockCellId);
  const shortcut = generated.cells.find((cell) => cell.id === gate.shortcutCellId);
  if (unlock === undefined || shortcut === undefined) throw new Error("Released depth-five fixture gate endpoints are missing");
  const cells = generated.cells.map((cell) => {
    if (cell.id !== gate.unlockCellId && cell.id !== gate.shortcutCellId) return cell;
    const blockedId = cell.id === gate.unlockCellId ? gate.shortcutCellId : gate.unlockCellId;
    return {
      ...cell,
      exits: cell.exits.filter((direction) => {
        const change: readonly [number, number] = direction === "north" ? [0, -1] : direction === "east" ? [1, 0] : direction === "south" ? [0, 1] : [-1, 0];
        return `${id}:cell:${cell.x + change[0]},${cell.y + change[1]}` !== blockedId;
      }),
    };
  });
  const { layoutVersion: _layoutVersion, keyGate: _keyGate, latestShrineUse: _latestShrineUse, ...legacy } = { ...generated, cells };
  return legacy;
}

describe("autonomous simulation", () => {
  it.each([
    [8, 12],
    [9, 13],
  ])("applies routine XP atomically from %i to %i at or above the Level 2 threshold", (experienceBefore, experienceAfter) => {
    const before = withHeroExperience(worldBeforeSightedWayfinderKey(), experienceBefore);
    const after = advanceWorld(before);
    expect(after.hero).toMatchObject({ experience: experienceAfter, level: 2 });
    expect(after.depth.hero).toMatchObject({ experience: experienceAfter, level: 2 });
    expect(after.scene.consequence).toContain("LEVEL 1 → 2");
    expect(after.chronicle.at(-1)?.consequence).toBe(after.scene.consequence);
    expect(upgradeWorldState(structuredClone(after))).toEqual(after);
  });

  it("settles the Level 10 Turning Point inside the XP transition and reloads it exactly once", () => {
    const threshold = 12 * 9 ** 2;
    const before = withHeroExperience(worldBeforeSightedWayfinderKey(), threshold - 1);
    const resourcesBefore = structuredClone(before.depth.hero.resources);
    const after = advanceWorld(before);
    expect(after.hero).toMatchObject({ level: 10, experience: threshold + 3 });
    expect(after.depth.heroGrowth).toMatchObject({
      settledCheckpointLevels: [10],
      pendingTriggers: [],
    });
    expect(after.depth.heroGrowth.records).toHaveLength(1);
    expect(after.depth.heroGrowth.records[0]).toMatchObject({
      checkpointLevel: 10,
      levelBefore: 9,
      levelAfter: 10,
      appliedLevel: 10,
    });
    expect(after.depth.hero.resources.health).toBe(resourcesBefore.health);
    expect(after.depth.hero.resources.mana).toBe(resourcesBefore.mana);
    expect(after.scene.consequence).toContain("TURNING POINT 10");
    expect(upgradeWorldState(structuredClone(after))).toEqual(after);
  });

  it("holds a combat crossing and drains it once when the encounter ends", () => {
    const threshold = 12 * 9 ** 2;
    let combat = createWorld("growth-combat-seed", "campaign:growth-combat");
    for (let turn = 0; turn < 160 && combat.depth.combat === null; turn += 1) combat = advanceWorld(combat);
    if (combat.depth.combat === null) throw new Error("Growth fixture did not reach combat");
    for (let turn = 0; turn < 16; turn += 1) {
      const actorId = combat.depth.combat.turnOrder[combat.depth.combat.activeIndex];
      if (actorId === combat.hero.id) break;
      combat = advanceWorld(combat);
      if (combat.depth.combat === null) throw new Error("Growth fixture combat ended before the hero acted");
    }
    const before = withHeroExperience(combat, threshold - 1);
    const crossed = advanceWorld(before);
    expect(crossed.depth.combat).not.toBeNull();
    expect(crossed.depth.heroGrowth.records).toEqual([]);
    expect(crossed.depth.heroGrowth.pendingTriggers).toMatchObject([{ checkpointLevel: 10, crossedTick: crossed.tick }]);
    expect(crossed.scene.consequence).toContain("TURNING POINT 10 HELD UNTIL THE ENCOUNTER ENDS");

    let resolved = crossed;
    for (let turn = 0; turn < 80 && resolved.depth.combat !== null; turn += 1) resolved = advanceWorld(resolved);
    expect(resolved.depth.combat).toBeNull();
    expect(resolved.depth.heroGrowth.pendingTriggers).toEqual([]);
    expect(resolved.depth.heroGrowth.records).toHaveLength(1);
    expect(resolved.depth.heroGrowth.records[0]).toMatchObject({
      checkpointLevel: 10,
      crossedTick: crossed.tick,
      tick: resolved.tick,
    });
    expect(upgradeWorldState(structuredClone(resolved))).toEqual(resolved);
  });

  it("reloads every inclusive threshold and cap boundary while rejecting stale levels", () => {
    for (const experience of [11, 12, 13, 47, 48, 49, 107, 108, 109, 12 * 49 ** 2, 30_000, 12 * (maximumHeroLevel - 1) ** 2 - 1, 12 * (maximumHeroLevel - 1) ** 2, Number.MAX_SAFE_INTEGER]) {
      const world = withHeroExperience(createWorld(`hero-threshold:${experience}`, `campaign:hero-threshold:${experience}`), experience);
      const reloaded = upgradeWorldState(JSON.parse(JSON.stringify(world)));
      expect(reloaded.hero).toEqual(world.hero);
      expect(reloaded.depth.hero).toEqual(world.depth.hero);
      expect(world.hero.level).toBe(heroLevelForExperience(experience));
      expect(world.depth.hero.level).toBe(world.hero.level);
    }
    const capped = withHeroExperience(createWorld("hero-threshold:cap", "campaign:hero-threshold:cap"), 12 * (maximumHeroLevel - 1) ** 2);
    expect(capped.hero.level).toBe(maximumHeroLevel);
    expect(() => upgradeWorldState({
      ...structuredClone(capped),
      hero: { ...capped.hero, level: maximumHeroLevel - 1 },
      depth: { ...capped.depth, hero: { ...capped.depth.hero, level: maximumHeroLevel - 1 } },
    })).toThrow("schema invariants");
  });

  it("induces a champion exactly once on a routine XP crossing while the Eternal campaign continues", () => {
    const threshold = 12 * (maximumHeroLevel - 1) ** 2;
    const before = withHeroExperience(worldBeforeSightedWayfinderKey(), threshold - 1);
    expect(before).toMatchObject({ hero: { level: maximumHeroLevel - 1 }, championInduction: null });

    const inducted = advanceWorld(before);
    const record = inducted.championInduction;
    expect(inducted.hero.level).toBe(maximumHeroLevel);
    expect(record).toMatchObject({
      heroId: inducted.hero.id,
      sourceCampaignId: inducted.campaignId,
      recordedTick: inducted.tick,
      qualification: "earned",
      level: maximumHeroLevel,
      sourceCommandId: inducted.chronicle.at(-1)?.commandId,
      sourceCommandType: inducted.chronicle.at(-1)?.commandType,
    });
    expect(inducted.scene.consequence).toContain("HALL OF CHAMPIONS");
    expect(inducted.scene.consequence).toContain("Eternal adventure continues");
    expect(upgradeWorldState(structuredClone(inducted))).toEqual(inducted);

    const continued = advanceWorld(inducted);
    expect(continued.tick).toBe(inducted.tick + 1);
    expect(continued.championInduction).toEqual(record);
  });

  it("induces a champion from an exact-once quest reward crossing", () => {
    const base = createWorld("quest-champion-crossing", "campaign:quest-champion-crossing");
    const threshold = 12 * (maximumHeroLevel - 1) ** 2;
    const prepared = withHeroExperience({
      ...base,
      depth: { ...base.depth, quest: completeQuestWithFacts(base.depth.quest) },
    }, threshold - 25);
    const fulfilled = advanceWorld(prepared);
    expect(fulfilled.depth.pendingQuestReward).not.toBeNull();
    expect(fulfilled.championInduction).toBeNull();

    const inducted = advanceWorld(fulfilled);
    expect(inducted.hero).toMatchObject({ level: maximumHeroLevel, experience: threshold });
    expect(inducted.championInduction).toMatchObject({
      qualification: "earned",
      recordedTick: inducted.tick,
      experience: threshold,
      sourceCommandId: inducted.chronicle.at(-1)?.commandId,
      sourceCommandType: "apply-quest-reward",
    });
    expect(inducted.depth.completedQuests.at(-1)?.reward.status).toBe("applied");
  });

  it.each([
    [12 * 49 ** 2, 50],
    [30_000, 51],
    [12 * (maximumHeroLevel - 1) ** 2, maximumHeroLevel],
    [Number.MAX_SAFE_INTEGER, maximumHeroLevel],
  ])("migrates released level-50 saves at %,i XP to level %i", (experience, expectedLevel) => {
    const released = structuredClone(createWorld(`released-level:${experience}`, `campaign:released-level:${experience}`)) as Record<string, any>;
    released.schemaVersion = 5;
    delete released.championInduction;
    released.hero.experience = experience;
    released.hero.level = 50;
    released.hero.mastery = heroMasteryForExperience(experience);
    released.depth.schemaVersion = 12;
    released.depth.hero.experience = experience;
    released.depth.hero.level = 50;

    const upgraded = upgradeWorldState(released);
    expect(upgraded.hero).toMatchObject({ experience, level: expectedLevel });
    expect(upgraded.depth.hero).toMatchObject({ experience, level: expectedLevel });
    expect(upgraded.depth.schemaVersion).toBe(16);
    expect(upgraded.championInduction?.qualification ?? null).toBe(
      expectedLevel === maximumHeroLevel ? "adopted" : null,
    );
    expect(upgradeWorldState(structuredClone(upgraded))).toEqual(upgraded);
  });

  it("migrates a schema-six Champion without altering the immutable Hall record", () => {
    const current = withHeroExperience(
      createWorld("schema-six-champion", "campaign:schema-six-champion"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    const champion = current.championInduction;
    if (champion === null) throw new Error("Schema-six migration fixture lacks a Champion record");
    const released = structuredClone(current) as unknown as Record<string, unknown>;
    released.schemaVersion = 6;
    delete released.legacy;

    const upgraded = upgradeWorldState(released);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.championInduction).toEqual(champion);
    expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
    expect(upgradeWorldState(structuredClone(upgraded))).toEqual(upgraded);
  });

  it("migrates schema seven with the current town-visit total as a non-retroactive mentor baseline", () => {
    const source = withHeroExperience(
      createWorld("schema-seven-mentor-source", "campaign:schema-seven-mentor-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Schema-seven mentor fixture needs a Champion");
    const seed = "schema-seven-mentor-campaign";
    const current = createWorld(seed, "campaign:schema-seven-mentor", createCampaignLegacyState(seed, [source.championInduction]));
    const locationId = current.depth.atlas.currentLocationId;
    const town = current.depth.towns[locationId];
    if (town === undefined) throw new Error("Schema-seven mentor fixture needs a current town");
    const released = structuredClone({
      ...current,
      depth: {
        ...current.depth,
        towns: { ...current.depth.towns, [locationId]: { ...town, visits: 19 } },
      },
    }) as unknown as Record<string, unknown>;
    released.schemaVersion = 7;
    delete released.legacyManifestations;

    const upgraded = upgradeWorldState(released);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacy).toEqual(current.legacy);
    expect(upgraded.legacyManifestations).toEqual({
      schemaVersion: 2,
      scheduleVersion: 1,
      townVisitBaseline: 19,
      appearances: [],
      meetings: [],
      recognitions: [],
      lessons: [],
      mentorArc: null,
    });
    expect(scheduledLegacyTownVisit(upgraded.seed, upgraded.legacy, upgraded.legacyManifestations, 0)).toBeGreaterThanOrEqual(23);
  });

  it("stops catch-up before a due mortal mentor visit and resumes to one fact set without imported power", () => {
    const source = withHeroExperience(
      createWorld("catch-up-mentor-source", "campaign:catch-up-mentor-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Catch-up mentor fixture needs a Champion");
    const seed = "catch-up-mentor-campaign";
    const base = createWorld(seed, "campaign:catch-up-mentor", createCampaignLegacyState(seed, [source.championInduction]));
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const ready = advanceToDueLegacyVisit(base);
    const opportunity = campaignDirector(ready);
    expect(opportunity.mode).toBe("chronicle");
    expect(opportunity.candidates.every((candidate) => candidate.command.type === "visit-town")).toBe(true);
    expect(opportunity.candidates[0]?.id).toBe(`town:${ready.depth.atlas.currentLocationId}`);
    expect(totalTownVisits(ready)).toBe(due - 1);
    expect(ready.chronicle.some((entry, index, entries) =>
      entry.commandType === "visit-town" && entries[index - 1]?.commandType === "visit-town"
    )).toBe(false);
    expect(ready.chronicle.at(-1)?.commandType).not.toBe("visit-town");
    const heroBefore = structuredClone(ready.hero);
    const detailedHeroBefore = structuredClone(ready.depth.hero);
    const cardsBefore = structuredClone(ready.legacy);
    const catchUpRequest = { id: "catch-up:mentor", observedAtMs: 10_000, elapsedMs: 60_000, requestedTicks: 4 };

    const stopped = catchUpWorld(ready, catchUpRequest);
    expect(stopped.tick).toBe(ready.tick);
    expect(stopped.pendingAttention).toHaveLength(1);
    expect(stopped.pendingAttention[0]).toMatchObject({ mode: "chronicle", commandType: "visit-town" });
    expect(stopped.legacyManifestations.appearances).toHaveLength(0);
    expect(catchUpWorld(stopped, catchUpRequest)).toEqual(stopped);

    const resumed = advanceWorld(stopped);
    expect(resumed.tick).toBe(ready.tick + 1);
    expect(resumed.scene).toMatchObject({ mode: "chronicle", headline: expect.stringContaining("Mortal Mentor") });
    expect(resumed.chronicle.at(-1)).toMatchObject({ commandType: "visit-town", action: expect.stringContaining("Appearance") });
    expect(resumed.legacyManifestations.appearances).toHaveLength(1);
    expect(resumed.legacyManifestations.meetings).toHaveLength(1);
    expect(resumed.legacyManifestations.recognitions).toHaveLength(1);
    expect(resumed.legacyManifestations.lessons).toHaveLength(1);
    expect(resumed.legacyManifestations.lessons[0]?.importedPower).toBe(false);
    expect(resumed.legacyManifestations.appearances[0]?.sourceCommandId).toBe(
      `${resumed.campaignId}:town:${resumed.legacyManifestations.appearances[0]?.locationId}`,
    );
    expect(resumed.hero).toEqual(heroBefore);
    expect(resumed.depth.hero).toEqual(detailedHeroBefore);
    expect(resumed.legacy).toEqual(cardsBefore);
    expect(totalTownVisits(resumed)).toBe(due);
    expect(upgradeWorldState(structuredClone(resumed))).toEqual(resumed);
  });

  it("autonomously completes one finite promise-return-farewell arc without power or repetition", () => {
    const source = withHeroExperience(
      createWorld("mentor-arc-source", "campaign:mentor-arc-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Autonomous mentor arc fixture needs a Champion");
    const seed = "autonomous-mentor-arc";
    let state = createWorld(seed, "campaign:autonomous-mentor-arc", createCampaignLegacyState(seed, [source.championInduction]));
    const seen: string[] = [];
    for (let step = 0; step < 12_000 && state.legacyManifestations.mentorArc?.memoryFact == null; step += 1) {
      const before = state;
      state = advanceWorld(state);
      const beforeArc = before.legacyManifestations.mentorArc;
      const afterArc = state.legacyManifestations.mentorArc;
      const phase = beforeArc?.promiseFact === null && afterArc?.promiseFact !== null
        ? "promise"
        : beforeArc?.returnFact === null && afterArc?.returnFact !== null
          ? "return"
          : beforeArc?.farewellFact === null && afterArc?.farewellFact !== null
            ? "farewell"
            : null;
      if (phase === null) continue;
      seen.push(phase);
      expect(state.hero).toEqual(before.hero);
      expect(state.depth.hero).toEqual(before.depth.hero);
      expect(state.depth.quest).toEqual(before.depth.quest);
      expect(state.depth.companions).toEqual(before.depth.companions);
      expect(state.depth.atlas).toEqual(before.depth.atlas);
      expect(state.legacy).toEqual(before.legacy);
      expect(state.scene).toMatchObject({ mode: "chronicle", consequence: expect.stringContaining("NO POWER TRANSFERRED") });
    }
    expect(seen).toEqual(["promise", "return", "farewell"]);
    expect(state.legacyManifestations.mentorArc?.memoryFact).toMatchObject({
      memory: "kept-road-promise",
      importedPower: false,
      mechanicalEffect: "none",
    });
    expect(canonicalHash(state)).toBe("7cc7b926ba8c7a16");
    expect(projectLegacyMentorArcBeat(state, { type: "visit-town" })).toBeNull();
    const finished = structuredClone(state.legacyManifestations);
    for (let step = 0; step < 200; step += 1) state = advanceWorld(state);
    expect(state.legacyManifestations).toEqual(finished);
    expect(upgradeWorldState(structuredClone(state))).toEqual(state);
  }, 120_000);

  it("migrates schema eight first-meeting history into only an empty relationship shell", () => {
    const source = withHeroExperience(
      createWorld("mentor-arc-migration-source", "campaign:mentor-arc-migration-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Mentor arc migration fixture needs a Champion");
    const seed = "mentor-arc-migration";
    const met = advanceWorld(advanceToDueLegacyVisit(
      createWorld(seed, "campaign:mentor-arc-migration", createCampaignLegacyState(seed, [source.championInduction])),
    ));
    const released = structuredClone(met) as unknown as Record<string, any>;
    released.schemaVersion = 8;
    released.legacyManifestations.schemaVersion = 1;
    delete released.legacyManifestations.mentorArc;

    const upgraded = upgradeWorldState(released);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacyManifestations.mentorArc).toMatchObject({
      legendId: upgraded.legacyManifestations.appearances[0]?.legendId,
      meetingId: upgraded.legacyManifestations.meetings[0]?.id,
      promiseFact: null,
      returnFact: null,
      farewellFact: null,
      memoryFact: null,
    });
    expect(upgraded.chronicle).toEqual(met.chronicle);
    expect(upgraded.hero).toEqual(met.hero);
    expect(upgraded.depth).toEqual(met.depth);
    expect(upgradeWorldState(structuredClone(upgraded))).toEqual(upgraded);
  });

  it("stops catch-up before a promise, resumes it once, and stops revisit injection at an unmet return gate", () => {
    const source = withHeroExperience(
      createWorld("mentor-arc-catch-up-source", "campaign:mentor-arc-catch-up-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Mentor arc catch-up fixture needs a Champion");
    const seed = "mentor-arc-catch-up";
    const met = advanceWorld(advanceToDueLegacyVisit(
      createWorld(seed, "campaign:mentor-arc-catch-up", createCampaignLegacyState(seed, [source.championInduction])),
    ));
    const promiseDue = scheduledLegacyMentorPromiseTownVisit(seed, met.legacyManifestations);
    const currentTown = met.depth.towns[met.depth.atlas.currentLocationId];
    if (currentTown === undefined) throw new Error("Mentor arc catch-up fixture needs a known current town");
    const addedVisits = promiseDue - 1 - totalTownVisits(met);
    const consecutive = {
      ...met,
      depth: {
        ...met.depth,
        towns: {
          ...met.depth.towns,
          [currentTown.locationId]: { ...currentTown, visits: currentTown.visits + addedVisits },
        },
      },
    };
    expect(projectLegacyMentorArcBeat(consecutive, { type: "visit-town" })).toBeNull();
    const ready = upgradeWorldState({ ...consecutive, chronicle: [] });
    expect(projectLegacyMentorArcBeat(ready, { type: "visit-town" })?.phase).toBe("promise");
    const request = { id: "catch-up:mentor-promise", observedAtMs: 20_000, elapsedMs: 60_000, requestedTicks: 4 };
    const stopped = catchUpWorld(ready, request);
    expect(stopped.tick).toBe(ready.tick);
    expect(stopped.pendingAttention).toHaveLength(1);
    expect(stopped.legacyManifestations.mentorArc?.promiseFact).toBeNull();
    expect(catchUpWorld(stopped, request)).toEqual(stopped);

    const resumed = advanceWorld(stopped);
    const promise = resumed.legacyManifestations.mentorArc?.promiseFact;
    if (promise === null || promise === undefined) throw new Error("Mentor promise did not resolve after foreground resume");
    expect(resumed.scene).toMatchObject({
      mode: "chronicle",
      headline: expect.stringContaining("Road Promised"),
      consequence: expect.stringContaining("NO POWER TRANSFERRED"),
    });
    expect(resumed.hero).toEqual(ready.hero);
    expect(resumed.depth.hero).toEqual(ready.depth.hero);

    const returnDue = scheduledLegacyMentorReturnTownVisit(seed, resumed.legacyManifestations);
    const returnTown = resumed.depth.towns[resumed.depth.atlas.currentLocationId];
    if (returnTown === undefined) throw new Error("Mentor return gate fixture needs a known current town");
    const returnReady = upgradeWorldState({
      ...resumed,
      chronicle: [],
      depth: {
        ...resumed.depth,
        towns: {
          ...resumed.depth.towns,
          [returnTown.locationId]: {
            ...returnTown,
            visits: returnTown.visits + (returnDue - 1 - totalTownVisits(resumed)),
          },
        },
      },
    });
    expect(returnReady.depth.totalCompletedQuests).toBe(promise.completedQuestBaseline);
    expect(campaignDirector(returnReady).candidates.some((candidate) => candidate.command.type === "visit-town")).toBe(false);

    const forgedPromise = rehashFact("legacy-mentor-promise", { ...promise, scheduledTownVisit: promise.scheduledTownVisit - 1 });
    expect(() => upgradeWorldState({
      ...resumed,
      legacyManifestations: {
        ...resumed.legacyManifestations,
        mentorArc: { ...resumed.legacyManifestations.mentorArc!, promiseFact: forgedPromise },
      },
    })).toThrow("schema invariants");
  });

  it("rejects fully rehashed mentor histories with an unvisited town or non-canonical source command", () => {
    const source = withHeroExperience(
      createWorld("catch-up-mentor-source", "campaign:catch-up-mentor-source"),
      12 * (maximumHeroLevel - 1) ** 2,
    );
    if (source.championInduction === null) throw new Error("Forged mentor fixture needs a Champion");
    const seed = "catch-up-mentor-campaign";
    const base = createWorld(seed, "campaign:catch-up-mentor", createCampaignLegacyState(seed, [source.championInduction]));
    const locationId = base.depth.atlas.currentLocationId;
    const town = base.depth.towns[locationId];
    if (town === undefined) throw new Error("Forged mentor fixture needs its origin town");
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const ready = upgradeWorldState({
      ...base,
      depth: {
        ...base.depth,
        towns: { ...base.depth.towns, [locationId]: { ...town, visits: due - 1 } },
      },
    });
    const resolved = advanceWorld(ready);
    const originalAppearance = resolved.legacyManifestations.appearances[0];
    const originalMeeting = resolved.legacyManifestations.meetings[0];
    const originalRecognition = resolved.legacyManifestations.recognitions[0];
    const originalLesson = resolved.legacyManifestations.lessons[0];
    if (
      originalAppearance === undefined || originalMeeting === undefined ||
      originalRecognition === undefined || originalLesson === undefined
    ) throw new Error("Forged mentor fixture did not resolve its fact graph");

    const forgeGraph = (world: typeof resolved, locationId: string, sourceCommandId: string) => {
      const appearance = rehashFact("legacy-appearance", {
        ...originalAppearance,
        locationId,
        sourceCommandId,
      });
      const meeting = rehashFact("legacy-meeting", { ...originalMeeting, appearanceId: appearance.id });
      const recognition = rehashFact("legacy-recognition", {
        ...originalRecognition,
        appearanceId: appearance.id,
        meetingId: meeting.id,
      });
      const lesson = rehashFact("legacy-lesson", {
        ...originalLesson,
        appearanceId: appearance.id,
        meetingId: meeting.id,
      });
      return {
        ...world,
        legacyManifestations: {
          ...world.legacyManifestations,
          appearances: [appearance],
          meetings: [meeting],
          recognitions: [recognition],
          lessons: [lesson],
        },
      };
    };

    const unvisitedTown = resolved.depth.atlas.locations.find(
      (location) => location.kind === "town" && resolved.depth.towns[location.id] === undefined,
    );
    if (unvisitedTown === undefined) throw new Error("Forged mentor fixture needs an unvisited atlas town");
    expect(() => upgradeWorldState(forgeGraph(
      resolved,
      unvisitedTown.id,
      `${resolved.campaignId}:town:${unvisitedTown.id}`,
    ))).toThrow("schema invariants");
    expect(() => upgradeWorldState(forgeGraph(
      resolved,
      originalAppearance.locationId,
      `${resolved.campaignId}:forged-town-command`,
    ))).toThrow("schema invariants");
  });

  it("projects one restorative exit-shrine fact through the scene and Chronicle", () => {
    const base = worldBeforeTrap();
    const dungeon = base.depth.dungeon;
    if (dungeon === null) throw new Error("Shrine scene fixture needs a dungeon");
    const health = base.depth.hero.resources.maxHealth - 3;
    const mana = base.depth.hero.resources.maxMana - 4;
    const before = {
      ...base,
      hero: { ...base.hero, health },
      depth: {
        ...base.depth,
        hero: {
          ...base.depth.hero,
          resources: { ...base.depth.hero.resources, health, mana },
        },
        dungeon: { ...dungeon, visitedCellIds: [dungeon.entryCellId] },
      },
    };

    const after = advanceWorld(before);
    expect(after.depth.dungeon?.completed).toBe(true);
    expect(after.depth.dungeon?.latestShrineUse).toMatchObject({
      healthBefore: health,
      healthRestored: 3,
      healthAfter: before.depth.hero.resources.maxHealth,
      manaBefore: mana,
      manaRestored: 4,
      manaAfter: before.depth.hero.resources.maxMana,
    });
    expect(after.scene.headline).toContain("shrine awakens");
    expect(after.scene.action).toBe(`SHRINE AWAKENS · HP ${health}→${before.depth.hero.resources.maxHealth} (+3) · MP ${mana}→${before.depth.hero.resources.maxMana} (+4)`);
    expect(after.chronicle.at(-1)).toMatchObject({
      action: after.scene.action,
      consequence: after.scene.consequence,
      mode: "dungeon",
    });
  });

  it("chooses and collects one publicly sighted Wayfinder Key without duplicate rewards", () => {
    const before = worldBeforeSightedWayfinderKey();
    const dungeon = before.depth.dungeon;
    const gate = dungeon?.keyGate;
    if (dungeon === null || dungeon === undefined || gate === null || gate === undefined) {
      throw new Error("World sighted-key fixture has no key gate");
    }
    const keyMove = projectDungeonMoveKnowledge(dungeon).find((move) => move.sightedWayfinderKey);
    if (keyMove === undefined) throw new Error("World sighted-key fixture has no public key move");
    const opportunity = campaignDirector(before);
    const choice = actorPolicy(before, opportunity);
    expect(choice.command).toEqual({ type: "move-dungeon", direction: keyMove.direction });
    expect(choice.trace.reasonCode).toBe("pursue-visible-objective");

    const restored = JSON.parse(JSON.stringify(before)) as typeof before;
    const collected = advanceWorld(restored);
    expect(advanceWorld(JSON.parse(JSON.stringify(before)))).toEqual(collected);
    expect(collected.depth.dungeon?.currentCellId).toBe(gate.keyCellId);
    expect(collected.depth.dungeon?.keyGate?.phase).toBe("carried");
    expect(collected.depth.hero.experience).toBe(before.depth.hero.experience + 4);
    expect(collected.depth.hero.gold).toBe(before.depth.hero.gold);
    expect(collected.depth.hero.inventory).toEqual(before.depth.hero.inventory);
    expect(collected.depth.quest).toEqual(before.depth.quest);
    expect(collected.depth.log.filter((entry) => entry.message.includes("finds the Wayfinder Key"))).toHaveLength(1);
    expect(projectDungeonWayfinding(collected.depth.dungeon!).mode).toBe("return-to-gate");

    const returning = advanceWorld(collected);
    expect(returning.depth.log.filter((entry) => entry.message.includes("finds the Wayfinder Key"))).toHaveLength(1);
    expect(returning.depth.dungeon?.keyGate?.phase).toBe("carried");
  });

  it("stages one exact trap consequence and grants no XP on spent retracing", () => {
    const before = worldBeforeTrap();
    const restored = JSON.parse(JSON.stringify(before)) as typeof before;
    const triggered = advanceWorld(restored);
    const expectedDamage = Math.max(1, Math.floor(restored.hero.maxHealth / 10));

    expect(triggered.depth.dungeon?.currentCellId).toBe(mazeCellId("dungeon:world-trap", 0, 0));
    expect(triggered.hero.health).toBe(restored.hero.health - expectedDamage);
    expect(triggered.depth.hero.resources.health).toBe(triggered.hero.health);
    expect(triggered.hero.experience).toBe(restored.hero.experience + 4);
    expect(triggered.scene).toMatchObject({
      mode: "dungeon",
      headline: "Ashen Archive: a marked trap springs!",
      sensoryIntensity: 3,
    });
    expect(triggered.scene.action).toContain("hazard is now spent");
    expect(triggered.scene.consequence).toContain(`catches ${triggered.hero.name} for ${expectedDamage} HP`);
    expect(advanceWorld(JSON.parse(JSON.stringify(before)))).toEqual(triggered);

    const retraceBase = worldBeforeTrap();
    const retraceDungeon = retraceBase.depth.dungeon;
    if (retraceDungeon === null) throw new Error("Retrace fixture has no dungeon");
    const trapId = mazeCellId("dungeon:world-trap", 0, 0);
    const entryId = mazeCellId("dungeon:world-trap", 1, 0);
    const deadEndId = mazeCellId("dungeon:world-trap", 0, 1);
    const retraceHealth = retraceBase.hero.health - expectedDamage;
    const retracing = {
      ...retraceBase,
      hero: { ...retraceBase.hero, health: retraceHealth },
      depth: {
        ...retraceBase.depth,
        dungeon: {
          ...retraceDungeon,
          currentCellId: deadEndId,
          visitedCellIds: [entryId, trapId, deadEndId],
          turns: 4,
        },
        hero: {
          ...retraceBase.depth.hero,
          resources: { ...retraceBase.depth.hero.resources, health: retraceHealth },
        },
      },
    };
    const revisited = advanceWorld(retracing);
    expect(revisited.depth.dungeon?.currentCellId).toBe(trapId);
    expect(revisited.hero.health).toBe(retracing.hero.health);
    expect(revisited.hero.experience).toBe(retracing.hero.experience);
    expect(revisited.scene.sensoryIntensity).toBe(1);
    expect(revisited.scene.consequence).not.toContain("marked trap");
  });

  it("recovers canonically after a trap reduces health to zero", () => {
    const base = worldBeforeTrap();
    const before = {
      ...base,
      hero: { ...base.hero, health: 1 },
      depth: {
        ...base.depth,
        hero: {
          ...base.depth.hero,
          resources: { ...base.depth.hero.resources, health: 1 },
        },
      },
    };
    const felled = advanceWorld(before);
    expect(felled.hero.health).toBe(0);
    expect(felled.scene.consequence).toContain("knocks");
    const opportunity = campaignDirector(felled);
    expect(opportunity.candidates).toHaveLength(1);
    expect(opportunity.candidates[0]?.command.type).toBe("wait");
    const felledDungeon = felled.depth.dungeon;
    if (felledDungeon === null) throw new Error("Defeat recovery fixture lost its dungeon");
    const recovered = advanceWorld(felled);
    expect(recovered.hero.health).toBeGreaterThan(0);
    expect(recovered.depth.dungeon?.currentCellId).toBe(felledDungeon.entryCellId);
    expect(recovered.depth.dungeon).toMatchObject({
      visitedCellIds: felledDungeon.visitedCellIds,
      discoveredCellIds: felledDungeon.discoveredCellIds,
      traps: felledDungeon.traps,
      keyGate: felledDungeon.keyGate,
    });
  });

  it("presents a zero-reward stationary Wayfinder unlock before crossing on the next tick", () => {
    const before = worldBeforeWayfinderUnlock();
    const gate = before.depth.dungeon?.keyGate;
    if (gate === null || gate === undefined) throw new Error("World Wayfinder fixture has no gate");
    const opportunity = campaignDirector(before);
    expect(opportunity.candidates.map((candidate) => candidate.command)).toEqual([{ type: "unlock-dungeon-gate" }]);
    const unlocked = advanceWorld(JSON.parse(JSON.stringify(before)));
    expect(unlocked.depth.dungeon?.currentCellId).toBe(gate.unlockCellId);
    expect(unlocked.depth.dungeon?.turns).toBe(before.depth.dungeon?.turns);
    expect(unlocked.hero.experience).toBe(before.hero.experience);
    expect(unlocked.depth.hero.experience).toBe(before.depth.hero.experience);
    expect(unlocked.chronicle.at(-1)?.commandType).toBe("unlock-dungeon-gate");
    expect(unlocked.scene).toMatchObject({
      mode: "dungeon",
      headline: `${before.depth.dungeon?.name}: the sealed shortcut opens.`,
      sensoryIntensity: 2,
    });
    expect(unlocked.scene.action).toContain("Wayfinder Gate is open");

    const crossed = advanceWorld(JSON.parse(JSON.stringify(unlocked)));
    expect(crossed.depth.dungeon?.currentCellId).toBe(gate.shortcutCellId);
    expect(crossed.chronicle.at(-1)?.commandType).toBe("move-dungeon");
    expect(crossed.scene.headline).toBe(`${before.depth.dungeon?.name}: the shortcut opens onto the far stair.`);
    expect(crossed.depth.log.at(-1)?.message).toContain("crosses the opened Wayfinder Gate");
    expect(crossed.depth.log.at(-1)?.message).toContain("far stair");
    expect(advanceWorld(JSON.parse(JSON.stringify(unlocked)))).toEqual(crossed);
  });

  it("replays exactly from a seed", () => {
    let left = createWorld("replay-seed", "campaign");
    let right = createWorld("replay-seed", "campaign");
    for (let index = 0; index < 250; index += 1) {
      left = advanceWorld(left);
      right = advanceWorld(right);
    }
    expect(left).toEqual(right);
  });

  it("records alternatives and actor rationale", () => {
    const initial = createWorld("choice-seed", "campaign");
    const junction = initial.depth.atlas.locations.find(
      (location) => neighboringLocationIds(initial.depth.atlas, location.id).length >= 2,
    );
    if (junction === undefined) throw new Error("Choice fixture needs a road junction");
    const world = {
      ...initial,
      depth: {
        ...initial.depth,
        atlas: { ...initial.depth.atlas, currentLocationId: junction.id },
      },
    };
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.consideredActions.length).toBeGreaterThan(1);
    expect(choice.consideredActions).toContain(choice.action);
    expect(choice.rationale).toContain(world.hero.name);
    expect(choice.trace.selected.commandId).toBe(choice.commandId);
    expect(choice.trace.considered.length).toBeLessThanOrEqual(4);
    expect(choice.command.type).toBe("plan-route");
    const resolved = rulesEngine(world, opportunity, choice);
    expect(resolved.chronicle.at(-1)).toMatchObject({
      commandId: choice.commandId,
      commandType: "plan-route",
      chosenAction: choice.action,
      rationale: choice.rationale,
    });
    if (choice.command.type !== "plan-route") throw new Error("Expected a route command");
    expect(resolved.depth.atlas.route?.destinationId).toBe(choice.command.destinationId);
  });

  it("presents distinct exact quest fulfillment and reward application beats", () => {
    const initial = createWorld("world-quest-fulfillment", "campaign:quest-fulfillment");
    const quest = completeQuestWithFacts(initial.depth.quest);
    const ready = upgradeWorldState({ ...initial, depth: { ...initial.depth, quest } });
    const opportunity = campaignDirector(ready);
    expect(opportunity.mode).toBe("chronicle");
    expect(opportunity.goal).toBe(`Fulfill ${quest.title}`);
    expect(opportunity.candidates).toHaveLength(1);
    expect(opportunity.candidates[0]?.command).toEqual({ type: "fulfill-quest", questInstanceId: quest.instanceId });
    const inventoryBefore = structuredClone(ready.depth.hero.inventory);
    const after = advanceWorld(ready);
    expect(after.depth.quest.status).toBe("fulfilled");
    expect(after.hero.experience).toBe(ready.hero.experience);
    expect(after.hero.gold).toBe(ready.hero.gold);
    expect(after.depth.hero.inventory).toEqual(inventoryBefore);
    const pendingCompletion = after.depth.completedQuests.at(-1);
    if (pendingCompletion === undefined || pendingCompletion.reward.status !== "pending") throw new Error("Expected pending quest reward");
    expect(after.scene).toMatchObject({
      mode: "chronicle",
      headline: `Quest Fulfilled: ${quest.title}`,
      action: `${after.hero.name} closes the final page after 5 completed objectives.`,
      consequence: `Completion #1 recorded at T${after.tick} · ${describeCompletedQuestReward(pendingCompletion)}`,
      sensoryIntensity: 3,
    });
    expect(after.chronicle.at(-1)).toMatchObject({
      commandType: "fulfill-quest",
      headline: after.scene.headline,
      action: after.scene.action,
      consequence: after.scene.consequence,
    });
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    const rewardOpportunity = campaignDirector(after);
    expect(rewardOpportunity.mode).toBe("chronicle");
    expect(rewardOpportunity.goal).toBe(`Receive the reward for ${quest.title}`);
    expect(rewardOpportunity.candidates).toHaveLength(1);
    expect(rewardOpportunity.candidates[0]?.command).toEqual({ type: "apply-quest-reward", grantId: pendingCompletion.reward.grant.id });
    const rewarded = advanceWorld(after);
    const completion = rewarded.depth.completedQuests.at(-1);
    if (completion === undefined || completion.reward.status !== "applied") throw new Error("Expected applied quest reward");
    expect(rewarded.depth.pendingQuestReward).toBeNull();
    expect(rewarded.hero.experience - after.hero.experience).toBe(completion.reward.receipt.experienceDelta);
    expect(rewarded.hero.gold - after.hero.gold).toBe(completion.reward.receipt.goldDelta);
    expect(rewarded.depth.hero.inventory).toContainEqual(completion.reward.grant.item);
    expect(rewarded.scene).toMatchObject({
      mode: "chronicle",
      headline: `Quest Reward: ${quest.title}`,
      action: `${rewarded.hero.name} receives the promised reward from the Chronicle.`,
      consequence: describeCompletedQuestReward(completion),
      sensoryIntensity: 3,
    });
    expect(rewarded.chronicle.at(-1)?.commandType).toBe("apply-quest-reward");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(rewarded)))).toEqual(rewarded);
    const preview = createQuest(rewarded.seed, rewarded.depth.totalCompletedQuests, rewarded.tick + 1);
    const previewLead = projectSuccessorQuestLead(rewarded.seed, rewarded.depth.atlas, preview);
    if (previewLead === null) throw new Error("Expected successor preview lead");
    const admissionOpportunity = campaignDirector(rewarded);
    expect(admissionOpportunity.mode).toBe("chronicle");
    expect(admissionOpportunity.goal).toBe(`Begin ${preview.title}`);
    expect(admissionOpportunity.candidates).toHaveLength(1);
    expect(admissionOpportunity.candidates[0]?.command).toEqual({ type: "admit-successor-quest", completionId: completion.id });
    const admitted = advanceWorld(rewarded);
    expect(admitted.depth.quest).toEqual(preview);
    expect(admitted.hero).toEqual(rewarded.hero);
    expect(admitted.depth.hero).toEqual(rewarded.depth.hero);
    expect(admitted.depth.atlas).toEqual(rewarded.depth.atlas);
    expect(admitted.depth.completedQuests).toEqual(rewarded.depth.completedQuests);
    expect(admitted.depth.totalCompletedQuests).toBe(rewarded.depth.totalCompletedQuests);
    const questLead = projectSuccessorQuestLead(admitted.seed, admitted.depth.atlas, admitted.depth.quest);
    if (questLead === null) throw new Error("Expected admitted successor quest lead");
    expect(admitted.scene).toMatchObject({
      mode: "chronicle",
      headline: `New Quest: ${preview.title}`,
      action: `${admitted.hero.name} turns the page after ${completion.title} and begins ${preview.title}.`,
      consequence: `Chapter 2 admitted at T${preview.admittedTick} · Lead revealed: ${questLead.locationName} · quest route not planned`,
      sensoryIntensity: 2,
    });
    expect(admitted.chronicle.at(-1)).toMatchObject({
      commandType: "admit-successor-quest",
      headline: admitted.scene.headline,
      action: admitted.scene.action,
      consequence: admitted.scene.consequence,
    });
    expect(campaignDirector(admitted).goal).toBe(`Follow the lead to ${questLead.locationName}`);
    const preRoutedAtlas = planRoute(rewarded.depth.atlas, previewLead.locationId);
    if (preRoutedAtlas.route === null) throw new Error("Expected pre-admission lead route");
    const admittedWhileRouted = advanceWorld({
      ...rewarded,
      depth: { ...rewarded.depth, atlas: preRoutedAtlas },
    });
    expect(admittedWhileRouted.depth.atlas.route).toEqual(preRoutedAtlas.route);
    expect(admittedWhileRouted.scene.consequence).toBe(
      `Chapter 2 admitted at T${preview.admittedTick} · Lead revealed: ${previewLead.locationName} · quest route already planned`,
    );
    const atLeadAtlas = {
      ...rewarded.depth.atlas,
      currentLocationId: previewLead.locationId,
      route: null,
      discoveredLocationIds: [...new Set([...rewarded.depth.atlas.discoveredLocationIds, previewLead.locationId])],
    };
    const admittedAtLead = advanceWorld({
      ...rewarded,
      depth: { ...rewarded.depth, atlas: atLeadAtlas },
    });
    expect(admittedAtLead.depth.atlas).toMatchObject({ currentLocationId: previewLead.locationId, route: null });
    expect(admittedAtLead.scene.consequence).toBe(
      `Chapter 2 admitted at T${preview.admittedTick} · Lead revealed: ${previewLead.locationName} · party already at lead`,
    );
    const routedDepth = { ...admitted.depth, atlas: planRoute(admitted.depth.atlas, questLead.locationId) };
    if (routedDepth.atlas.route === null) throw new Error("Expected a nontrivial lead route");
    const routed = { ...admitted, depth: routedDepth };
    let arrived = routed;
    for (let tick = 0; tick < 400 && (arrived.depth.atlas.route !== null || arrived.depth.atlas.currentLocationId !== questLead.locationId); tick += 1) {
      arrived = advanceWorld(arrived);
    }
    expect(arrived.depth.atlas).toMatchObject({ currentLocationId: questLead.locationId, route: null });
    expect(arrived.scene).toMatchObject({
      headline: `The marked lead rises at ${questLead.locationName}.`,
      action: `${arrived.hero.name} reaches the quest marker by completing the real plotted route.`,
    });
    expect(arrived.scene.consequence).toContain(`marked lead for ${admitted.depth.quest.title}`);
    const malformed = structuredClone(admitted);
    malformed.depth.atlas = {
      ...malformed.depth.atlas,
      locations: malformed.depth.atlas.locations.map((location) => location.kind === "dungeon" ? { ...location, kind: "wilds" as const } : location),
    };
    expect(() => upgradeWorldState(malformed)).toThrow("schema invariants");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(admitted)))).toEqual(admitted);
  });

  it("awards one terminal Pattern Duel reward and resumes the saved route", () => {
    let world = createWorld("world-counter-reward", "campaign:world-counter-reward");
    while (world.depth.atlas.route === null) world = advanceWorld(world);
    const encounterId = `encounter:route:${world.depth.atlas.route.path.join(">")}`;
    const startedDepth = stepDepth(world.depth, { type: "start-counter-duel", encounterId });
    world = {
      ...world,
      tick: startedDepth.tick,
      depth: startedDepth,
      lifecycle: {
        ...world.lifecycle,
        simulationTick: startedDepth.tick,
        worldClockMinutes: world.lifecycle.worldClockMinutes + 15,
      },
    };
    const experienceBefore = world.hero.experience;
    const goldBefore = world.hero.gold;

    while (world.depth.counterDuel !== null) {
      const opportunity = campaignDirector(world);
      const candidates = opportunity.candidates;
      const winning = candidates.find((candidate) => {
        const trial = stepDepth(JSON.parse(JSON.stringify(world.depth)), candidate.command);
        const duel = trial.counterDuel ?? trial.completedCounterDuels.at(-1);
        return duel?.history.at(-1)?.result === "hero";
      });
      const selected = winning ?? candidates[0];
      if (selected === undefined) throw new Error("Pattern Duel fixture has no action");
      const policy = actorPolicy(world, opportunity);
      world = rulesEngine(world, opportunity, {
        ...policy,
        commandId: `${world.campaignId}:${selected.id}`,
        command: selected.command,
        action: selected.label,
        consideredCommandIds: candidates.map((candidate) => `${world.campaignId}:${candidate.id}`),
      });
    }
    const completed = world.depth.completedCounterDuels.at(-1);
    expect(completed?.outcome).toBe("victory");
    expect(world.hero.experience).toBe(experienceBefore + 8);
    expect(world.hero.gold).toBe(goldBefore + 5);
    expect(world.depth.atlas.route).not.toBeNull();
    const rewarded = { experience: world.hero.experience, gold: world.hero.gold };
    world = advanceWorld(world);
    expect(world.hero.gold).toBe(rewarded.gold);
    expect(world.hero.experience).toBeGreaterThanOrEqual(rewarded.experience);
    expect(world.depth.counterDuel).toBeNull();
  });

  it("keeps command opportunities bounded, unique, serializable, and deterministic across 100 seeds", () => {
    for (let index = 0; index < 100; index += 1) {
      const world = createWorld(`candidate-audit:${index}`, `campaign:${index}`);
      const first = campaignDirector(world);
      const replay = campaignDirector(JSON.parse(JSON.stringify(world)));
      expect(first).toEqual(replay);
      expect(first.candidates.length).toBeGreaterThanOrEqual(1);
      expect(first.candidates.length).toBeLessThanOrEqual(12);
      expect(new Set(first.candidates.map((candidate) => candidate.id)).size).toBe(first.candidates.length);
      expect(JSON.parse(JSON.stringify(first.candidates))).toEqual(first.candidates);
      expect(actorPolicy(world, first)).toEqual(actorPolicy(world, replay));
    }
  }, 20_000);

  it("resolves the exact canonical combat actor, target, and ability selected", () => {
    let world = createWorld("combat-choice-seed", "campaign");
    while (world.depth.combat === null) world = advanceWorld(world);
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "combat-action") throw new Error("Expected a combat command");
    const command = choice.command;
    const resolved = rulesEngine(world, opportunity, choice);
    const action = (resolved.depth.combat ?? resolved.depth.completedCombats.at(-1))?.log.at(-1);
    expect(action).toMatchObject({
      actorId: command.action.actorId,
      targetId: command.action.targetId,
      abilityId: command.action.abilityId,
    });
    const combat = resolved.depth.completedCombats.at(-1) ?? resolved.depth.combat;
    if (combat === null || combat === undefined) throw new Error("Resolved combat choice has no combat");
    expect(resolved.scene.action).toBe(projectLatestCombatTurn(combat)?.text);
  });

  it("uses an emergency restorative autonomously without awarding action XP", () => {
    const base = createWorld("restorative-xp", "campaign:restorative-xp");
    const route = depthCommandCandidates(base.depth).find((candidate) => candidate.command.type === "plan-route");
    if (route?.command.type !== "plan-route") throw new Error("Restorative XP fixture needs a route");
    const routed = stepDepth(base.depth, route.command);
    const encounterId = unresolvedRouteEncounterId(routed);
    if (encounterId === null) throw new Error("Restorative XP fixture needs an unresolved encounter");
    const started = stepDepth(routed, { type: "start-combat", encounterId, enemyCount: 1 });
    const combat = started.combat;
    if (combat === null) throw new Error("Restorative XP fixture needs active combat");
    const heroIndex = combat.turnOrder.indexOf(started.hero.id);
    const heroUnit = combat.combatants.find((entry) => entry.id === started.hero.id);
    const tonic = started.hero.inventory.find((item) => item.restorative !== null);
    if (heroIndex < 0 || heroUnit === undefined || tonic === undefined) {
      throw new Error("Restorative XP fixture lacks its hero or tonic");
    }
    const health = Math.max(1, Math.floor(heroUnit.maxHealth / 3));
    const depth = {
      ...started,
      hero: { ...started.hero, resources: { ...started.hero.resources, health } },
      combat: {
        ...combat,
        activeIndex: heroIndex,
        combatants: combat.combatants.map((entry) => entry.id === heroUnit.id
          ? { ...entry, health }
          : { ...entry, health: entry.maxHealth }),
      },
    };
    const world = upgradeWorldState({
      ...base,
      tick: depth.tick,
      hero: {
        ...base.hero,
        level: depth.hero.level,
        experience: depth.hero.experience,
        health,
        maxHealth: depth.hero.resources.maxHealth,
        gold: depth.hero.gold,
      },
      depth,
      lifecycle: { ...base.lifecycle, simulationTick: depth.tick },
    });
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.command).toMatchObject({
      type: "combat-action",
      action: { type: "item", itemId: tonic.id, targetId: heroUnit.id },
    });

    const resolved = rulesEngine(world, opportunity, choice);
    expect(resolved.hero.experience).toBe(world.hero.experience);
    expect(resolved.depth.hero.experience).toBe(world.depth.hero.experience);
    expect(resolved.depth.hero.inventory.find((item) => item.id === tonic.id)?.quantity).toBe(tonic.quantity - 1);
    expect(projectLatestCombatTurn(resolved.depth.combat!)?.restorative).toMatchObject({ itemId: tonic.id });
  });

  it("attributes enemy decisions to the enemy instead of the hero", () => {
    let world = createWorld("enemy-choice-seed", "campaign");
    while (world.depth.combat === null) world = advanceWorld(world);
    while (
      world.depth.combat !== null &&
      world.depth.combat.combatants.find((entry) => entry.id === world.depth.combat?.turnOrder[world.depth.combat.activeIndex])?.side !== "enemies"
    ) world = advanceWorld(world);
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "combat-action") throw new Error("Expected an enemy combat command");
    const command = choice.command;
    const actor = world.depth.combat?.combatants.find((entry) => entry.id === command.action.actorId);
    expect(actor?.side).toBe("enemies");
    expect(opportunity.candidates.every((candidate) => candidate.deciderId === actor?.id)).toBe(true);
    expect(choice.rationale).toContain(actor?.name);
    expect(choice.rationale.startsWith(`${world.hero.name} chose`)).toBe(false);
    expect(choice.trace.actorId).toBe(actor?.id);
    expect(choice.trace.actorName).toBe(actor?.name);
  });

  it("rejects a command that was not one of the director's legal candidates", () => {
    const world = createWorld("illegal-choice-seed", "campaign");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(() => rulesEngine(world, opportunity, {
      ...choice,
      command: { type: "travel", distance: 999 },
    })).toThrow("illegal action");
  });

  it("presents scheduled ability training as an attention-gated scene", () => {
    const initial = createWorld("training-scene", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const world = {
      ...initial,
      tick: 29,
      depth: { ...initial.depth, tick: 29 },
      lifecycle: { ...initial.lifecycle, simulationTick: 29 },
    };
    expect(campaignDirector(world).mode).toBe("training");
    expect(attentionPolicyForMode("training")).toBe("queueForPresentation");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    if (choice.command.type !== "train-ability") throw new Error("Expected training");
    const command = choice.command;
    const trained = advanceWorld(world);
    expect(trained.scene.mode).toBe("training");
    expect(trained.scene.action).toContain("practices");
    const before = world.depth.hero.abilities.find((entry) => entry.id === command.abilityId);
    expect(trained.depth.hero.abilities.find((entry) => entry.id === command.abilityId)?.experience).toBe((before?.experience ?? 0) + 3);
  });

  it("presents a newly learned monster secret before continuing the road", () => {
    const initial = createWorld("discovery-scene", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const tick = 8;
    const world = {
      ...initial,
      tick,
      depth: {
        ...initial.depth,
        tick,
        discoveries: [{
          id: "discovery:test",
          tick,
          abilityId: ability.id,
          abilityName: ability.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
      lifecycle: { ...initial.lifecycle, simulationTick: tick },
    };
    expect(campaignDirector(world).mode).toBe("discovery");
    expect(attentionPolicyForMode("discovery")).toBe("queueForPresentation");
    const discovered = advanceWorld(world);
    expect(discovered.scene.mode).toBe("discovery");
    expect(discovered.scene.headline).toContain(ability.name);
    expect(discovered.scene.action).toContain("Lantern Wolf");
    expect(discovered.depth.hero.abilities.find((entry) => entry.id === ability.id)?.experience).toBe(ability.experience + 3);
  });

  it("does not hide camp healing behind a discovery training command", () => {
    const initial = createWorld("discovery-camp", "campaign");
    const ability = initial.depth.hero.abilities[0];
    if (ability === undefined) throw new Error("Hero has no starter ability");
    const tick = 17;
    const health = Math.max(1, initial.depth.hero.resources.maxHealth - 10);
    const world = {
      ...initial,
      tick,
      hero: { ...initial.hero, health },
      depth: {
        ...initial.depth,
        tick,
        hero: {
          ...initial.depth.hero,
          resources: { ...initial.depth.hero.resources, health },
        },
        discoveries: [{
          id: "discovery:camp",
          tick,
          abilityId: ability.id,
          abilityName: ability.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
      lifecycle: { ...initial.lifecycle, simulationTick: tick },
    };
    const opportunity = campaignDirector(world);
    expect(opportunity.mode).toBe("discovery");
    expect(opportunity.candidates.every((candidate) => candidate.command.type === "train-ability")).toBe(true);
    const advanced = advanceWorld(world);
    expect(advanced.scene.mode).toBe("discovery");
    expect(advanced.depth.hero.resources.health).toBe(health);
  });

  it("recovers only through an explicit wait command", () => {
    const initial = createWorld("explicit-recovery", "campaign");
    const world = {
      ...initial,
      hero: { ...initial.hero, health: 0 },
      depth: {
        ...initial.depth,
        hero: {
          ...initial.depth.hero,
          resources: { ...initial.depth.hero.resources, health: 0 },
        },
      },
    };
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.command.type).toBe("wait");
    const recovered = rulesEngine(world, opportunity, choice);
    expect(recovered.depth.hero.resources.health).toBeGreaterThan(0);
    expect(recovered.depth.hero.resources.health).toBeLessThan(recovered.depth.hero.resources.maxHealth);
  });

  it("admits a zero-reward full roadside rest before the same mandatory encounter", () => {
    const initial = createWorld("critical-roadside-world", "campaign:critical-roadside-world");
    const destinationId = neighboringLocationIds(initial.depth.atlas, initial.depth.atlas.currentLocationId)[0];
    if (destinationId === undefined) throw new Error("Recovery world needs a neighboring destination");
    const route = planRoute(initial.depth.atlas, destinationId);
    const health = Math.floor(initial.depth.hero.resources.maxHealth / 2);
    const depth = {
      ...initial.depth,
      atlas: route,
      hero: {
        ...initial.depth.hero,
        resources: { ...initial.depth.hero.resources, health, mana: 0 },
      },
    };
    const world = {
      ...initial,
      hero: { ...initial.hero, health },
      depth,
    };
    const readyWorld = {
      ...world,
      hero: { ...world.hero, health: world.hero.maxHealth },
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          resources: {
            ...world.depth.hero.resources,
            health: world.depth.hero.resources.maxHealth,
            mana: world.depth.hero.resources.maxMana,
          },
        },
      },
    };
    const expectedEncounter = campaignDirector(readyWorld).candidates[0]?.command;
    const opportunity = campaignDirector(world);
    expect(opportunity.mode).toBe("camp");
    expect(opportunity.candidates.map((candidate) => candidate.command)).toEqual([{ type: "wait" }]);
    const choice = actorPolicy(world, opportunity);
    expect(choice.rationale).toContain("critical health");
    const rested = rulesEngine(world, opportunity, choice);

    expect(rested.depth.hero.resources).toMatchObject({
      health: rested.depth.hero.resources.maxHealth,
      mana: rested.depth.hero.resources.maxMana,
    });
    expect(rested.hero.experience).toBe(world.hero.experience);
    expect(rested.hero.gold).toBe(world.hero.gold);
    expect(rested.depth.hero.inventory).toEqual(world.depth.hero.inventory);
    expect(rested.depth.hero.equipment).toEqual(world.depth.hero.equipment);
    expect(rested.depth.hero.abilities).toEqual(world.depth.hero.abilities);
    expect(rested.depth.hero.monsterLore).toEqual(world.depth.hero.monsterLore);
    expect(rested.depth.quest).toEqual(world.depth.quest);
    expect(rested.depth.discoveries).toEqual(world.depth.discoveries);
    expect(rested.depth.companions).toEqual(world.depth.companions);
    expect(rested.depth.completedCombats).toEqual(world.depth.completedCombats);
    expect(rested.depth.completedCounterDuels).toEqual(world.depth.completedCounterDuels);
    expect(rested.scene.action).toContain(`HP ${health}→${rested.hero.maxHealth}`);
    expect(rested.scene.consequence).toContain("the same encounter still waits");
    expect(campaignDirector(rested).candidates[0]?.command).toEqual(expectedEncounter);
    expect(JSON.parse(JSON.stringify(rested))).toEqual(rested);
  });

  it("reloads a learned secret with matching lore and discovery provenance", () => {
    const initial = createWorld("secret-reload", "campaign");
    const secret = {
      id: "secret:lantern-wolf:moonhowl",
      name: "Moonhowl",
      kind: "secret" as const,
      effect: "weaken" as const,
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: "lantern-wolf",
    };
    const world = {
      ...initial,
      depth: {
        ...initial.depth,
        hero: {
          ...initial.depth.hero,
          abilities: [...initial.depth.hero.abilities, secret],
          monsterLore: [...initial.depth.hero.monsterLore, {
            monsterId: "lantern-wolf",
            monsterName: "Lantern Wolf",
            encounters: 3,
            victories: 3,
            insight: 3,
            requiredInsight: 3,
            secretTechniqueId: secret.id,
            secretTechniqueName: secret.name,
            learned: true,
          }],
        },
        discoveries: [{
          id: "discovery:moonhowl:reload",
          tick: 0,
          abilityId: secret.id,
          abilityName: secret.name,
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }],
      },
    };
    const restored = upgradeWorldState(JSON.parse(JSON.stringify(world)));
    expect(restored.depth.hero.abilities.at(-1)).toEqual(secret);
    expect(restored.depth.hero.monsterLore.at(-1)?.learned).toBe(true);
    expect(restored.depth.discoveries.at(-1)?.abilityId).toBe(secret.id);
  });

  it("rejects malformed persisted ability and discovery truth fields", () => {
    const mutations: readonly ((world: Record<string, any>) => void)[] = [
      (world) => { world.depth.hero.abilities[0].kind = "ritual"; },
      (world) => { world.depth.hero.abilities[0].effect = "frost"; },
      (world) => { world.depth.hero.abilities[0].sourceMonsterId = "false-origin"; },
      (world) => {
        world.depth.hero.abilities[0].level = 2;
        world.depth.hero.abilities[0].experience = 0;
      },
      (world) => {
        world.depth.hero.abilities[0].kind = "secret";
        world.depth.hero.abilities[0].sourceMonsterId = null;
      },
      (world) => {
        world.depth.hero.monsterLore = [{
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
          encounters: 1,
          victories: 0,
          insight: 0,
          requiredInsight: 3,
          secretTechniqueId: "",
          secretTechniqueName: "Moonhowl",
          learned: false,
        }];
      },
      (world) => {
        const ability = world.depth.hero.abilities[0];
        world.depth.hero.monsterLore = [{
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
          encounters: 3,
          victories: 3,
          insight: 3,
          requiredInsight: 3,
          secretTechniqueId: ability.id,
          secretTechniqueName: ability.name,
          learned: true,
        }];
        world.depth.discoveries = [{
          id: "discovery:malformed",
          tick: 0,
          abilityId: ability.id,
          abilityName: "",
          monsterId: "lantern-wolf",
          monsterName: "Lantern Wolf",
        }];
      },
    ];
    for (const mutate of mutations) {
      const malformed = JSON.parse(JSON.stringify(createWorld("invalid-ability-truth", "campaign")));
      mutate(malformed);
      expect(() => upgradeWorldState(malformed)).toThrow("schema invariants");
    }
  });

  it("rejects persisted and live canonical RPG corruption through shared invariants", () => {
    const mutations: readonly ((world: Record<string, any>) => void)[] = [
      (world) => { world.depth.hero.className = "Chronomancer"; },
      (world) => { world.depth.hero.inventory[0].modifiers.power = -1; },
      (world) => { world.depth.quest.status = "complete"; },
    ];
    for (const mutate of mutations) {
      const persisted = JSON.parse(JSON.stringify(createWorld("invalid-rpg-truth", "campaign")));
      mutate(persisted);
      expect(() => upgradeWorldState(persisted)).toThrow("schema invariants");

      const live = JSON.parse(JSON.stringify(createWorld("invalid-rpg-truth", "campaign")));
      mutate(live);
      const opportunity = campaignDirector(live);
      expect(() => rulesEngine(live, opportunity, actorPolicy(live, opportunity))).toThrow("schema invariants");
    }

    const forgedProgression = JSON.parse(JSON.stringify(createWorld("invalid-rpg-progression", "campaign")));
    forgedProgression.hero.level = maximumHeroLevel;
    forgedProgression.depth.hero.level = maximumHeroLevel;
    forgedProgression.hero.mastery = 999;
    expect(() => upgradeWorldState(forgedProgression)).toThrow("schema invariants");
  });

  it("saturates maximum hero experience across deterministic positive-XP commands", () => {
    const initial = createWorld("maximum-experience", "campaign");
    const withExperience = (experience: number) => withHeroExperience(structuredClone(initial), experience);
    const almostMaximum = withExperience(Number.MAX_SAFE_INTEGER - 1);
    const almostOpportunity = campaignDirector(almostMaximum);
    const almostChoice = actorPolicy(almostMaximum, almostOpportunity);
    expect(almostChoice.command.type).toBe("plan-route");
    expect(rulesEngine(almostMaximum, almostOpportunity, almostChoice).hero.experience).toBe(Number.MAX_SAFE_INTEGER);

    const maximum = withExperience(Number.MAX_SAFE_INTEGER);
    const opportunity = campaignDirector(maximum);
    const choice = actorPolicy(maximum, opportunity);
    expect(choice.command.type).toBe("plan-route");
    const advanced = rulesEngine(maximum, opportunity, choice);
    const replayState = structuredClone(maximum);
    const replayOpportunity = campaignDirector(replayState);
    expect(rulesEngine(replayState, replayOpportunity, actorPolicy(replayState, replayOpportunity))).toEqual(advanced);
    expect(advanced.hero.experience).toBe(Number.MAX_SAFE_INTEGER);
    expect(advanced.depth.hero.experience).toBe(Number.MAX_SAFE_INTEGER);
    expect(advanced.hero.level).toBe(maximumHeroLevel);
    expect(advanced.hero.mastery).toBe(heroMasteryForExperience(Number.MAX_SAFE_INTEGER));
  });

  it("keeps eternal progression bounded while mastery continues", () => {
    let world = createWorld("forever-seed", "campaign");
    for (let index = 0; index < 20_000; index += 1) world = advanceWorld(world);
    expect(world.hero.level).toBeGreaterThanOrEqual(40);
    expect(world.hero.level).toBeLessThanOrEqual(maximumHeroLevel);
    expect(world.hero.mastery).toBeGreaterThan(0);
    expect(world.hero.health).toBeGreaterThan(0);
    expect(world.depth.totalCompletedQuests).toBeGreaterThanOrEqual(2);
    expect(world.depth.hero.abilities.length).toBeLessThanOrEqual(16);
    expect(world.depth.hero.monsterLore.length).toBeLessThanOrEqual(16);
    expect(world.depth.discoveries.length).toBeLessThanOrEqual(32);
    expect(world.chronicle.every((entry) =>
      entry.decisionTrace !== undefined &&
      entry.decisionTrace.considered.length <= 4 &&
      entry.decisionTrace.reasons.length <= 3
    )).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(world)).byteLength).toBeLessThan(1_000_000);
  }, 60_000);

  it("bounds the live chronicle without duplicate event ids", () => {
    let world = createWorld("chronicle-seed", "campaign");
    for (let index = 0; index < 10_000; index += 1) world = advanceWorld(world);
    expect(world.chronicle).toHaveLength(32);
    expect(new Set(world.chronicle.map((entry) => entry.id)).size).toBe(32);
  }, 30_000);

  it("bounds seven-day catch-up and stops before an attention threshold", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const caughtUp = catchUpWorld(world, {
      id: "observation:seven-days",
      observedAtMs: 604_800_000,
      elapsedMs: 604_800_000,
      requestedTicks: 126_000,
    });

    expect(caughtUp.tick).toBeGreaterThan(0);
    expect(caughtUp.tick).toBeLessThan(96);
    expect(caughtUp.chronicle.every((entry) => entry.attention === "backgroundSafe")).toBe(
      true,
    );
    expect(caughtUp.pendingAttention).toHaveLength(1);
    const pending = caughtUp.pendingAttention[0];
    expect(pending?.tick).toBe(caughtUp.tick + 1);
    expect(pending?.policy.attention).not.toBe("backgroundSafe");
    expect(pending?.commandId).toBeTruthy();
    expect(caughtUp.lifecycle.wallClockJournal[0]).toMatchObject({
      creditedTicks: 96,
      appliedTicks: caughtUp.tick,
      stoppedAtEventId: pending?.id,
    });
  });

  it("does not apply the same wall-clock observation twice", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const request = {
      id: "observation:repeat",
      observedAtMs: 50_000,
      elapsedMs: 50_000,
      requestedTicks: 10,
    };
    const once = catchUpWorld(world, request);
    expect(catchUpWorld(once, request)).toBe(once);
  });

  it("upgrades released schema-one saves with lifecycle defaults", () => {
    const current = createWorld("migration-seed", "campaign");
    const legacy = {
      ...current,
      schemaVersion: 1,
      lifecycle: undefined,
      pendingAttention: undefined,
      depth: undefined,
      chronicle: current.chronicle.map(({ policy: _policy, ...entry }) => entry),
    };
    delete (legacy as unknown as Record<string, unknown>).championInduction;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
    expect(upgraded.lifecycle.policyVersion).toBe(2);
    expect(upgraded.forwardMotion.recentLocationIds).toEqual([upgraded.depth.atlas.currentLocationId]);
    expect(upgraded.lifecycle.simulationTick).toBe(upgraded.tick);
    expect(upgraded.pendingAttention).toEqual([]);
    expect(upgraded.depth.tick).toBe(upgraded.tick);
    expect(upgraded.depth.hero.id).toBe(upgraded.hero.id);
    expect(upgraded.depth.hero.resources.health).toBe(upgraded.hero.health);
  });

  it("upgrades released schema-two saves without losing lifecycle progress", () => {
    let current = createWorld("migration-two-seed", "campaign-two");
    for (let index = 0; index < 7; index += 1) current = advanceWorld(current);
    const legacy = {
      ...current,
      schemaVersion: 2,
      depth: undefined,
    };
    delete (legacy as unknown as Record<string, unknown>).championInduction;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
    expect(upgraded.tick).toBe(current.tick);
    expect(upgraded.lifecycle).toEqual(current.lifecycle);
    expect(upgraded.forwardMotion.recentLocationIds).toEqual([upgraded.depth.atlas.currentLocationId]);
    expect(upgraded.pendingAttention).toEqual(current.pendingAttention);
    expect(upgraded.depth.tick).toBe(current.tick);
    expect(upgraded.depth.hero.name).toBe(current.hero.name);
    expect(upgraded.depth.hero.gold).toBe(current.hero.gold);
  });

  it("upgrades schema-four encounter storage once and reloads idempotently", () => {
    const current = createWorld("migration-four-encounters", "campaign-four-encounters");
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    legacy.schemaVersion = 4;
    delete legacy.championInduction;
    legacy.lifecycle.policyVersion = 1;
    delete legacy.forwardMotion;
    downgradeDepthQuestToSchema11(legacy.depth);
    legacy.depth.schemaVersion = 4;
    delete legacy.depth.counterDuel;
    delete legacy.depth.completedCounterDuels;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
    expect(upgraded.depth.schemaVersion).toBe(16);
    expect(upgraded.depth.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
    if (upgraded.depth.dungeon !== null) {
      expect(upgraded.depth.dungeon.layoutVersion).toBe(1);
      expect(upgraded.depth.dungeon.keyGate).toBeNull();
    }
    expect(upgraded.depth.counterDuel).toBeNull();
    expect(upgraded.depth.completedCounterDuels).toEqual([]);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded);
  });

  it("migrates released schema-five active, completed, and null dungeons without retrofitting gates", () => {
    const base = createWorld("released-depth-five", "campaign:released-depth-five");
    const active = releasedDepthFiveDungeon(base.depth.seed, "dungeon:released-depth-five");
    const completed = {
      ...active,
      currentCellId: active.exitCellId,
      visitedCellIds: active.cells.map((cell) => cell.id),
      discoveredCellIds: active.cells.map((cell) => cell.id),
      traps: active.traps.map((trap) => ({ ...trap, phase: "triggered" as const })),
      traversalLog: [...active.traversalLog, "The released maze was already crossed."],
      turns: active.cells.length + 7,
      completed: true,
    };
    for (const legacyDungeon of [active, completed, null] as const) {
      const legacy = JSON.parse(JSON.stringify(base)) as Record<string, any>;
      legacy.schemaVersion = 5;
      delete legacy.championInduction;
      downgradeDepthQuestToSchema11(legacy.depth);
      legacy.depth.schemaVersion = 5;
      legacy.depth.dungeon = legacyDungeon;
      const upgraded = upgradeWorldState(legacy);
      expect(upgraded.schemaVersion).toBe(9);
      expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
      expect(upgraded.depth.schemaVersion).toBe(16);
      expect(upgraded.depth.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
      if (legacyDungeon === null) {
        expect(upgraded.depth.dungeon).toBeNull();
      } else {
        expect(upgraded.depth.dungeon?.layoutVersion).toBe(1);
        expect(upgraded.depth.dungeon?.keyGate).toBeNull();
        const { layoutVersion: _layoutVersion, keyGate: _keyGate, latestShrineUse: _latestShrineUse, ...preserved } = upgraded.depth.dungeon!;
        expect(preserved).toEqual(legacyDungeon);
      }
      expect(upgradeWorldState(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded);
    }
  });

  it("rejects malformed active, completed, identity, duplicate, and cross-engine encounter roles", () => {
    const base = createWorld("encounter-role-invariants", "campaign:encounter-role-invariants");
    const route = depthCommandCandidates(base.depth).find((candidate) => candidate.command.type === "plan-route");
    if (route?.command.type !== "plan-route") throw new Error("Encounter-role fixture needs a route");
    const routed = stepDepth(base.depth, route.command);
    const encounterId = unresolvedRouteEncounterId(routed);
    if (encounterId === null) throw new Error("Encounter-role fixture needs an unresolved encounter");
    const activeDuelDepth = stepDepth(routed, { type: "start-counter-duel", encounterId });
    const activeDuel = activeDuelDepth.counterDuel;
    if (activeDuel === null) throw new Error("Expected active Pattern Duel fixture");
    let completedDuelDepth = activeDuelDepth;
    while (completedDuelDepth.counterDuel !== null) {
      completedDuelDepth = stepDepth(completedDuelDepth, {
        type: "counter-duel-action",
        prediction: completedDuelDepth.counterDuel.tell.suggestedStance,
      });
    }
    const completedDuel = completedDuelDepth.completedCounterDuels.at(-1);
    if (completedDuel === undefined) throw new Error("Expected completed Pattern Duel fixture");
    const activeCombatDepth = stepDepth(routed, { type: "start-combat", encounterId, enemyCount: 2 });
    const activeCombat = activeCombatDepth.combat;
    if (activeCombat === null) throw new Error("Expected active tactical combat fixture");
    const completedCombat = { ...activeCombat, outcome: "victory" as const };
    const worldWithDepth = (depth: typeof base.depth) => ({
      ...base,
      tick: depth.tick,
      hero: {
        ...base.hero,
        level: depth.hero.level,
        experience: depth.hero.experience,
        health: depth.hero.resources.health,
        maxHealth: depth.hero.resources.maxHealth,
        gold: depth.hero.gold,
      },
      depth,
      lifecycle: { ...base.lifecycle, simulationTick: depth.tick },
    });
    expect(() => upgradeWorldState(worldWithDepth(activeCombatDepth))).not.toThrow();
    if (activeCombat.threat.rating !== "place-bound") throw new Error("Expected rated tactical combat fixture");
    const ratedWorldForgeries = [
      {
        ...activeCombatDepth,
        combat: { ...activeCombat, threat: { ...activeCombat.threat, factors: [...activeCombat.threat.factors].reverse() } },
      },
      {
        ...activeCombatDepth,
        combat: { ...activeCombat, threat: { schemaVersion: 1 as const, rating: "legacy-unrated" as const } },
      },
      {
        ...activeCombatDepth,
        combat: {
          ...activeCombat,
          threat: {
            ...activeCombat.threat,
            fromLocationId: activeCombat.threat.destinationLocationId,
            destinationLocationId: activeCombat.threat.fromLocationId,
          },
        },
      },
      {
        ...activeCombatDepth,
        combat: {
          ...activeCombat,
          threat: activeCombat.threat.questModifier === 0
            ? { ...activeCombat.threat, questLeadId: "lead:forged", questInstanceId: "quest:forged", questModifier: 1 as const }
            : { ...activeCombat.threat, questLeadId: null, questInstanceId: null, questModifier: 0 as const },
        },
      },
    ];
    for (const forgedDepth of ratedWorldForgeries) {
      expect(() => upgradeWorldState(worldWithDepth(forgedDepth))).toThrow("schema invariants");
    }
    const malformedDepths: readonly typeof base.depth[] = [
      { ...base.depth, counterDuel: completedDuel },
      { ...base.depth, completedCounterDuels: [activeDuel] },
      { ...base.depth, counterDuel: activeDuel, completedCounterDuels: [completedDuel] },
      { ...base.depth, completedCounterDuels: [completedDuel, completedDuel] },
      { ...base.depth, counterDuel: { ...activeDuel, heroId: "hero:forged" } },
      { ...base.depth, combat: completedCombat },
      { ...base.depth, completedCombats: [activeCombat] },
      { ...base.depth, completedCombats: [completedCombat, completedCombat] },
      {
        ...base.depth,
        combat: {
          ...activeCombat,
          turnOrder: activeCombat.turnOrder.filter((id) => id !== base.hero.id),
          combatants: activeCombat.combatants.filter((combatant) => combatant.id !== base.hero.id),
        },
      },
      { ...base.depth, completedCombats: [completedCombat], completedCounterDuels: [completedDuel] },
    ];
    for (const depth of malformedDepths) {
      expect(() => upgradeWorldState(worldWithDepth(depth))).toThrow("schema invariants");
    }
  });

  it("upgrades released depth-three trap knowledge without losing visible or sprung truth", () => {
    const base = createWorld("depth-three-traps", "campaign:depth-three-traps");
    const dungeon = generateDungeon(base.seed, "dungeon:depth-three-traps", 9, 7);
    const trap = dungeon.cells.find((cell) => (
      cell.feature === "trap"
      && cell.id !== dungeon.entryCellId
      && cell.id !== dungeon.exitCellId
      && !dungeon.visitedCellIds.includes(cell.id)
    ));
    if (trap === undefined) throw new Error("Depth-three migration fixture has no ordinary trap");
    const current = {
      ...base,
      depth: {
        ...base.depth,
        dungeon: { ...dungeon, discoveredCellIds: dungeon.cells.map((cell) => cell.id) },
      },
    };
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, any>;
    legacy.schemaVersion = 5;
    delete legacy.championInduction;
    downgradeDepthQuestToSchema11(legacy.depth);
    legacy.depth.schemaVersion = 3;
    delete legacy.depth.dungeon.traps;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.depth.schemaVersion).toBe(16);
    expect(upgraded.depth.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
    expect(upgraded.depth.dungeon?.layoutVersion).toBe(1);
    expect(upgraded.depth.dungeon?.keyGate).toBeNull();
    expect(upgraded.depth.dungeon?.traps.find((candidate) => candidate.cellId === trap.id)?.phase).toBe("detected");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(upgraded)))).toEqual(upgraded);

    const visitedLegacy = JSON.parse(JSON.stringify(legacy)) as Record<string, any>;
    visitedLegacy.depth.dungeon.currentCellId = trap.id;
    visitedLegacy.depth.dungeon.visitedCellIds.push(trap.id);
    const visited = upgradeWorldState(visitedLegacy);
    expect(visited.depth.dungeon?.traps.find((candidate) => candidate.cellId === trap.id)?.phase).toBe("triggered");
  });

  it("upgrades a schema-two atlas to canonical geography without losing route intent", () => {
    const current = createWorld("atlas-migration-seed", "atlas-migration");
    const destinationId = current.depth.atlas.locations.at(-1)?.id;
    if (destinationId === undefined) throw new Error("Atlas destination is missing");
    const routed = { ...current, depth: { ...current.depth, atlas: planRoute(current.depth.atlas, destinationId) } };
    const legacy = JSON.parse(JSON.stringify(routed)) as {
      schemaVersion: number;
      championInduction?: unknown;
      depth: {
        schemaVersion: number;
        atlas: {
          terrain?: unknown;
          currentLocationId: string;
          route: { destinationId: string } | null;
          locations: Array<Record<string, unknown>>;
          edges: Array<Record<string, unknown>>;
        };
      };
    };
    legacy.schemaVersion = 5;
    delete legacy.championInduction;
    downgradeDepthQuestToSchema11(legacy.depth as Record<string, any>);
    legacy.depth.schemaVersion = 2;
    delete legacy.depth.atlas.terrain;
    for (const location of legacy.depth.atlas.locations) {
      delete location.terrainPointIndex;
      delete location.feature;
    }
    for (const edge of legacy.depth.atlas.edges) {
      delete edge.pathPointIndices;
      delete edge.pathDistances;
      delete edge.crossingPointIndices;
    }
    const previousNames = legacy.depth.atlas.locations.map((location) => location.name);
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.depth.schemaVersion).toBe(16);
    expect(upgraded.depth.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
    expect(upgraded.depth.atlas.terrain.generator).toBe("oleary-inspired-v1");
    expect(upgraded.depth.atlas.locations.map((location) => location.name)).toEqual(previousNames);
    expect(upgraded.depth.atlas.currentLocationId).toBe(legacy.depth.atlas.currentLocationId);
    expect(upgraded.depth.atlas.route?.destinationId).toBe(destinationId);
    expect(upgraded.depth.atlas.edges.every((edge) => edge.pathPointIndices.length >= 2)).toBe(true);
  });

  it("migrates a genuine released schema-two atlas kind schedule and mid-leg progress", () => {
    const current = createWorld("released-atlas-seed", "released-atlas");
    const legacy = JSON.parse(JSON.stringify(current)) as {
      schemaVersion: number;
      championInduction?: unknown;
      depth: { schemaVersion: number; atlas: Record<string, unknown> };
    };
    legacy.schemaVersion = 5;
    delete legacy.championInduction;
    const kinds = ["town", "wilds", "wilds", "landmark", "town", "dungeon", "landmark", "wilds", "town", "landmark", "dungeon", "wilds"] as const;
    const locations = kinds.map((kind, index) => ({
      id: `location:${index}`,
      name: index === 0 ? "Amberford" : `Legacy ${index}`,
      kind,
      x: 5 + index * 7,
      y: 95 - index * 7,
      danger: index === 0 ? 1 : 1 + (index % 9),
    }));
    const edges = locations.slice(1).map((location, index) => ({
      id: `location:${index}~${location.id}`,
      from: `location:${index}`,
      to: location.id,
      distance: 10,
      terrain: "road" as const,
    }));
    downgradeDepthQuestToSchema11(legacy.depth);
    legacy.depth.schemaVersion = 2;
    legacy.depth.atlas = {
      locations,
      edges,
      currentLocationId: "location:0",
      discoveredLocationIds: ["location:0"],
      route: {
        destinationId: "location:2",
        path: ["location:0", "location:1", "location:2"],
        legIndex: 0,
        legProgress: 4,
        distanceTravelled: 4,
        totalDistance: 20,
      },
    };
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.depth.atlas.locations.map((location) => location.kind)).toEqual(kinds);
    expect(upgraded.depth.atlas.route?.destinationId).toBe("location:2");
    expect(upgraded.depth.atlas.route?.legProgress).toBeGreaterThan(0);
    expect(upgraded.depth.atlas.currentLocationId).toBe("location:0");
    const firstFrom = upgraded.depth.atlas.route?.path[0];
    const firstTo = upgraded.depth.atlas.route?.path[1];
    const firstEdge = upgraded.depth.atlas.edges.find((edge) =>
      (edge.from === firstFrom && edge.to === firstTo) || (edge.from === firstTo && edge.to === firstFrom)
    );
    expect((upgraded.depth.atlas.route?.legProgress ?? 0) / Math.max(1, firstEdge?.distance ?? 1)).toBeCloseTo(0.4, 1);
  });

  it("upgrades a schema-three active battle in place", () => {
    let current = createWorld("migration-three-seed", "campaign-three");
    while (current.depth.combat === null || current.depth.combat.turn < 1) current = advanceWorld(current);
    const legacy = JSON.parse(JSON.stringify(current)) as {
      schemaVersion: number;
      depth: {
        schemaVersion: number;
        hero: Record<string, unknown>;
        combat: { id: string; round: number; turn: number; activeIndex: number; turnOrder: string[]; combatants: Record<string, unknown>[]; log: Record<string, unknown>[] } | null;
        completedCombats: { combatants: Record<string, unknown>[]; log: Record<string, unknown>[] }[];
        discoveries?: unknown;
      };
    };
    if (legacy.depth.combat !== null) {
      const hero = legacy.depth.combat.combatants.find((entry) => entry.id === current.hero.id);
      if (hero !== undefined) {
        hero.health = Math.max(1, Number(hero.health) - 2);
        hero.mana = Math.max(0, Number(hero.mana) - 1);
        hero.statuses = [{ kind: "poisoned", duration: 2, potency: 1 }];
        legacy.depth.combat.log.push({
          turn: 1,
          actorId: current.hero.id,
          action: "skill",
          message: `${current.hero.name} used a legacy skill.`,
          amount: 3,
        });
      }
    }
    legacy.schemaVersion = 3;
    delete (legacy as Record<string, any>).championInduction;
    downgradeDepthQuestToSchema11(legacy.depth);
    legacy.depth.schemaVersion = 1;
    delete legacy.depth.hero.abilities;
    delete legacy.depth.hero.monsterLore;
    delete legacy.depth.discoveries;
    const downgradeCombat = (combat: { combatants: Record<string, unknown>[]; log: Record<string, unknown>[] }): void => {
      for (const combatant of combat.combatants) {
        delete combatant.speciesId;
        delete combatant.abilities;
      }
      for (const entry of combat.log) {
        if (entry.action === "ability") entry.action = "skill";
        delete entry.targetId;
        delete entry.abilityId;
      }
    };
    if (legacy.depth.combat === null) throw new Error("Expected active combat");
    downgradeCombat(legacy.depth.combat);
    for (const combat of legacy.depth.completedCombats) downgradeCombat(combat);
    const before = legacy.depth.combat;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(9);
    expect(upgraded.legacy).toEqual({ schemaVersion: 1, selectorVersion: 1, cards: [] });
    expect(upgraded.depth.schemaVersion).toBe(16);
    expect(upgraded.depth.companions).toEqual({ schemaVersion: 1, active: [], former: [] });
    expect(upgraded.depth.combat).toMatchObject({
      id: before.id,
      round: before.round,
      turn: before.turn,
      activeIndex: before.activeIndex,
      turnOrder: before.turnOrder,
    });
    expect(upgraded.depth.combat?.combatants.map(({ health, mana, statuses }) => ({ health, mana, statuses }))).toEqual(
      before.combatants.map(({ health, mana, statuses }) => ({ health, mana, statuses })),
    );
    expect(upgraded.depth.combat?.combatants.every((entry) => entry.abilities.length > 0)).toBe(true);
    expect(upgraded.depth.hero.abilities).toHaveLength(2);
    expect(upgraded.depth.hero.monsterLore).toEqual([]);
    expect(upgraded.depth.discoveries).toEqual([]);
  });
});
