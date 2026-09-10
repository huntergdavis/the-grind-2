import { describe, expect, it } from "vitest";
import { advanceWorld, attentionPolicyForMode, createWorld, eventPolicyForMode } from "../core/simulation";
import { createHeroGrowthState } from "../core/hero-growth";
import type { ChronicleEntry, WorldState } from "../core/types";
import { dungeonTrapAt, mazeCellId, resolveDungeonTrapCheck } from "../depth/dungeon";
import { selectDisarmingKit } from "../depth/disarming-kit";
import { createQuest, derivedStats, effectiveAttribute, heroExperienceFloor, heroMasteryForExperience, heroMechanicalLevel } from "../depth/rpg";
import { selectSuccessorQuestLead } from "../depth/quest-lead";
import { depthCommandCandidates, stepDepth } from "../depth/state";
import type { DepthCommandCandidate, DepthState, DungeonState, DungeonTrapKind, DungeonTrapPhase } from "../depth/types";
import { isTrapResolutionPacket, projectTrapResolution } from "./trap-resolution";
import { cutawayRegistry, projectCutawayCandidates, resolveCutawayCandidate } from "../render/cutaway-registry";

interface TrapWorldOptions {
  kind: DungeonTrapKind;
  stage: "detect" | "disarm";
  success: boolean;
  exit: boolean;
  health?: number;
  aptitude?: number;
  world?: WorldState;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function trapWorld(options: TrapWorldOptions): WorldState {
  const world = options.world ?? createWorld(`projection-${options.kind}-${options.stage}-${options.success}-${options.exit}`, "campaign:trap-projection");
  const id = "dungeon:trap-projection";
  const trap = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const ordinaryExit = mazeCellId(id, 1, 1);
  const deadEnd = mazeCellId(id, 0, 1);
  const phase: DungeonTrapPhase = options.stage === "detect" ? "hidden" : "detected";
  const aptitude = options.aptitude ?? (options.success ? 20 : 1);
  const hero = {
    ...world.depth.hero,
    attributes: {
      ...world.depth.hero.attributes,
      agility: aptitude,
      intellect: aptitude,
      spirit: aptitude,
    },
  };
  const heroStats = derivedStats(hero);
  let dungeon: DungeonState = {
    layoutVersion: 1,
    keyGate: null,
    latestShrineUse: null,
    id,
    name: "Proof Vault",
    width: 2,
    height: 2,
    cells: [
      { id: trap, x: 0, y: 0, exits: ["east", "south"], feature: "trap" },
      { id: entry, x: 1, y: 0, exits: ["south", "west"], feature: "empty" },
      { id: deadEnd, x: 0, y: 1, exits: ["north"], feature: "empty" },
      { id: ordinaryExit, x: 1, y: 1, exits: ["north"], feature: "shrine" },
    ],
    entryCellId: entry,
    exitCellId: options.exit ? trap : ordinaryExit,
    currentCellId: options.stage === "detect" ? entry : trap,
    visitedCellIds: options.stage === "detect" ? [entry, ordinaryExit] : [entry, trap],
    discoveredCellIds: [entry, trap, deadEnd, ordinaryExit],
    traps: [{ cellId: trap, kind: options.kind, detectDifficulty: 10, disarmDifficulty: 11, phase }],
    traversalLog: [],
    turns: options.stage === "detect" ? 0 : 1,
    completed: false,
  };
  const difficulty = options.stage === "detect"
    ? options.success ? 10 : 14
    : options.success ? 11 : 16;
  dungeon = {
    ...dungeon,
    traps: dungeon.traps.map((candidate) => ({
      ...candidate,
      detectDifficulty: options.stage === "detect" ? difficulty : candidate.detectDifficulty,
      disarmDifficulty: options.stage === "disarm" ? difficulty : candidate.disarmDifficulty,
    })),
  };
  const health = options.health ?? world.hero.health;
  const depthHero = {
    ...hero,
    resources: {
      ...world.depth.hero.resources,
      health,
      mana: Math.min(world.depth.hero.resources.mana, heroStats.maxMana),
      maxMana: heroStats.maxMana,
    },
  };
  return {
    ...world,
    hero: { ...world.hero, health },
    scene: { ...world.scene, mode: "dungeon", location: dungeon.name },
    depth: {
      ...world.depth,
      dungeon,
      hero: depthHero,
      heroGrowth: createHeroGrowthState(depthHero),
    },
  };
}

function resolve(options: TrapWorldOptions) {
  const before = trapWorld(options);
  const after = advanceWorld(clone(before));
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Trap projection fixture produced no Chronicle source");
  return { before, after, source, packet: projectTrapResolution(before, after, source) };
}

const entryTrapFixtures = new Map<string, {
  world: WorldState;
  depth: DepthState;
  entry: DepthCommandCandidate & { command: Extract<DepthCommandCandidate["command"], { type: "enter-dungeon" }> };
}>();

function canonicalEntryTrapFixture(kind: DungeonTrapKind, withKit = false, successor = false) {
  const key = `${kind}:${withKit}:${successor}`;
  const cached = entryTrapFixtures.get(key);
  if (cached !== undefined) return cached;
  for (let index = 0; index < 200; index += 1) {
    const candidateSeed = `entry-${kind}-${index}`;
    let world = createWorld(candidateSeed, `campaign:entry-${kind}`);
    if (withKit) {
      const purchased = advanceWorld(world);
      if (purchased.chronicle.at(-1)?.commandType !== "buy-disarming-kit") continue;
      world = purchased;
    }
    // Explicit successor quest setup tests the real layout-3 entry plan, not a claimed played chapter.
    const quest = successor ? createQuest(world.seed, 1, world.depth.tick) : world.depth.quest;
    const lead = successor ? selectSuccessorQuestLead(world.seed, world.depth.atlas, quest) : null;
    const location = world.depth.atlas.locations.find((entry) => lead === null ? entry.kind === "dungeon" : entry.id === lead.locationId);
    if (location === undefined) continue;
    const depth: DepthState = {
      ...world.depth,
      quest,
      atlas: {
        ...world.depth.atlas,
        currentLocationId: location.id,
        discoveredLocationIds: [...new Set([...world.depth.atlas.discoveredLocationIds, location.id])],
        route: null,
      },
    };
    const entry = depthCommandCandidates(depth).find((candidate): candidate is typeof candidate & {
      command: Extract<typeof candidate.command, { type: "enter-dungeon" }>;
    } => candidate.command.type === "enter-dungeon");
    if (entry === undefined) continue;
    const generated = stepDepth(depth, entry.command).dungeon!;
    const trap = dungeonTrapAt(generated, generated.entryCellId);
    if (trap?.kind === kind) {
      const fixture = { world, depth, entry };
      entryTrapFixtures.set(key, fixture);
      return fixture;
    }
  }
  throw new Error(`Could not find a canonical generated ${kind} entry trap`);
}

function entryTrapWorld(kind: DungeonTrapKind, success: boolean, options: { withKit?: boolean; mana?: number; successor?: boolean } = {}) {
  const fixture = canonicalEntryTrapFixture(kind, options.withKit ?? false, options.successor ?? false);
  const { world } = fixture;
  const aptitude = success ? 20 : 1;
  const hero = {
    ...world.depth.hero,
    attributes: {
      ...world.depth.hero.attributes,
      agility: aptitude,
      intellect: aptitude,
      spirit: aptitude,
    },
  };
  const heroStats = derivedStats(hero);
  const depthHero = {
    ...hero,
    resources: {
      ...hero.resources,
      mana: options.mana ?? Math.min(hero.resources.mana, heroStats.maxMana),
      maxMana: heroStats.maxMana,
    },
  };
  const before: WorldState = {
    ...world,
    depth: {
      ...fixture.depth,
      hero: depthHero,
      heroGrowth: createHeroGrowthState(depthHero),
    },
  };
  const depth = stepDepth(before.depth, fixture.entry.command);
  const tick = before.tick + 1;
  const scene = {
    mode: "dungeon" as const,
    location: depth.dungeon?.name ?? fixture.entry.command.dungeonId,
    headline: "Threshold hazard resolved",
    action: "The hero crosses the threshold.",
    goal: "Enter the maze",
    consequence: "The committed trap result stands.",
    sensoryIntensity: 2 as const,
  };
  const source: ChronicleEntry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode("dungeon"),
    consideredActions: ["Enter the maze"],
    chosenAction: "Enter the maze",
    rationale: "The route continues.",
    policy: eventPolicyForMode("dungeon"),
    commandId: `${before.campaignId}:${fixture.entry.id}`,
    commandType: "enter-dungeon",
  };
  const after: WorldState = {
    ...before,
    tick,
    hero: {
      ...before.hero,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
    },
    scene,
    chronicle: [...before.chronicle, source],
    depth,
  };
  return { before, after, source };
}

describe("trap resolution projection", () => {
  it("reconstructs the actual successor layout and current trap rules at a generated threshold", () => {
    const { before, after, source } = entryTrapWorld("mana-siphon", true, { successor: true });
    expect(after.depth.dungeon).toMatchObject({ layoutVersion: 3, trapRulesVersion: 2 });
    expect(projectTrapResolution(before, after, source)).toMatchObject({ schemaVersion: 3, success: true });
    expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
      dungeon: { ...after.depth.dungeon!, layoutVersion: 2 },
    } }, source)).toBeNull();
  });

  for (const mode of ["spotted", "drained", "empty"] as const) {
    it(`projects a generated mana siphon ${mode} without inventing HP damage`, () => {
      const { before, after, source } = entryTrapWorld("mana-siphon", mode === "spotted",
        mode === "empty" ? { mana: 0 } : {});
      expect(after.depth.dungeon).toMatchObject({ trapRulesVersion: 2 });
      const saved = JSON.stringify([before, after]);
      const packet = projectTrapResolution(before, after, source);
      const manaBefore = before.depth.hero.resources.mana;
      const maxMana = before.depth.hero.resources.maxMana;
      const manaLost = mode === "spotted" ? 0 : Math.min(manaBefore, Math.ceil(maxMana / 4));
      expect(packet).toMatchObject({ schemaVersion: 3, trapKind: "mana-siphon", commandType: "enter-dungeon",
        stage: "detect", attribute: "spirit", success: mode === "spotted", tool: null,
        healthBefore: before.hero.health, healthAfter: before.hero.health, damage: 0,
        manaBefore, manaLost, manaAfter: manaBefore - manaLost, maxMana,
      });
      expect(isTrapResolutionPacket(packet)).toBe(true);
      expect(projectTrapResolution(clone(before), clone(after), clone(source))).toEqual(packet);
      const candidate = projectCutawayCandidates(before, after, source).find((entry) => entry.recipeKey === "trap-resolution@1")!;
      expect(resolveCutawayCandidate(cutawayRegistry, candidate)).toMatchObject({ mode: "animate", reason: "registered" });
      expect(JSON.stringify([before, after])).toBe(saved);
      expect(Object.isFrozen(packet)).toBe(true);
      if (packet?.schemaVersion !== 3) throw new Error("Expected mana-only packet");
      for (const changed of [
        { schemaVersion: 1 }, { schemaVersion: 2 }, { schemaVersion: 4 }, { trapKind: "tripwire" },
        { manaLost: manaLost + 1 }, { manaAfter: packet.manaAfter + 1 }, { maxMana: -1 },
        { damage: 1, healthAfter: packet.healthBefore - 1 }, { manaBefore: -1 },
        { tool: { itemId: "foreign", bonus: 2, quantityBefore: 1, quantityAfter: 0 } },
      ]) expect(isTrapResolutionPacket({ ...packet, ...changed })).toBe(false);
      const changedResource = { ...after, depth: { ...after.depth,
        hero: { ...after.depth.hero, resources: { ...after.depth.hero.resources, mana: packet.manaAfter + 1 } },
      } };
      expect(projectTrapResolution(before, changedResource, source)).toBeNull();
      expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
        dungeon: { ...after.depth.dungeon!, trapRulesVersion: 1 },
      } }, source)).toBeNull();
    });
  }

  for (const success of [true, false]) {
    it(`retains actual kit consumption on generated mana-siphon disarm ${success ? "success" : "failure"}`, () => {
      const entered = entryTrapWorld("mana-siphon", true, { withKit: true }).after;
      const kit = selectDisarmingKit(entered.depth.hero)!;
      expect(entered.depth.latestDisarmingKitPurchase?.itemId).toBe(kit.id);
      // Explicit aptitudes isolate both outcomes; the kind, cell, roll, and kit all have real sources.
      const adjusted = { ...entered.depth.hero, attributes: { ...entered.depth.hero.attributes, intellect: success ? 20 : 1 } };
      const stats = derivedStats(adjusted);
      const hero = { ...adjusted, resources: { ...adjusted.resources,
        mana: Math.min(adjusted.resources.mana, stats.maxMana), maxMana: stats.maxMana,
      } };
      const before = { ...entered, depth: { ...entered.depth, hero, heroGrowth: createHeroGrowthState(hero) } };
      const after = advanceWorld(clone(before));
      const source = after.chronicle.at(-1)!;
      const packet = projectTrapResolution(before, after, source);
      expect(packet).toMatchObject({ schemaVersion: 3, trapKind: "mana-siphon", attribute: "intellect", stage: "disarm",
        success, damage: 0, healthBefore: before.hero.health, healthAfter: before.hero.health,
        tool: { itemId: kit.id, bonus: 2, quantityBefore: 1, quantityAfter: 0 },
      });
      if (packet?.schemaVersion !== 3) throw new Error("Expected assisted mana packet");
      expect(packet.total).toBe(packet.skill + packet.roll + 2);
      expect(packet.manaLost).toBe(success ? 0 : Math.min(packet.manaBefore, Math.ceil(packet.maxMana / 4)));
      expect(after.depth.hero.inventory.some((item) => item.id === kit.id)).toBe(false);
      expect(isTrapResolutionPacket(packet)).toBe(true);
      expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
        hero: { ...after.depth.hero, inventory: before.depth.hero.inventory },
      } }, source)).toBeNull();
      expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
        dungeon: { ...after.depth.dungeon!, latestDisarmKitUse: null },
      } }, source)).toBeNull();
    });
  }

  for (const succeeds of [true, false]) {
    it(`projects a consumed kit separately from the original roll on assisted ${succeeds ? "success" : "failure"}`, () => {
      const purchased = advanceWorld(createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search"));
      expect(purchased.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
      // This is an explicit isolated trap layout after a real purchase, not a claimed natural journey.
      const staged = trapWorld({ kind: "rune-ward", stage: "disarm", success: false, exit: false,
        aptitude: succeeds ? 9 : 1, world: purchased });
      const dungeon = staged.depth.dungeon!;
      const base = resolveDungeonTrapCheck(dungeon, dungeon.currentCellId, "disarm", {
        agility: effectiveAttribute(staged.depth.hero, "agility"),
        intellect: effectiveAttribute(staged.depth.hero, "intellect"),
        spirit: effectiveAttribute(staged.depth.hero, "spirit"), level: staged.depth.hero.level,
      }, staged.seed);
      const difficulty = succeeds ? base.total + 1 : 16;
      expect(difficulty).toBeGreaterThanOrEqual(11);
      expect(difficulty).toBeLessThanOrEqual(16);
      const kit = selectDisarmingKit(staged.depth.hero)!;
      const before: WorldState = { ...staged, depth: { ...staged.depth,
        dungeon: { ...dungeon, traps: dungeon.traps.map((trap) => ({ ...trap, disarmDifficulty: difficulty })) },
      } };
      const saved = JSON.stringify(before);
      const after = advanceWorld(clone(before));
      const source = after.chronicle.at(-1)!;
      const packet = projectTrapResolution(before, after, source);
      expect(packet).toMatchObject({ schemaVersion: 2, stage: "disarm", success: succeeds,
        skill: base.skill, roll: base.roll, total: base.total + 2, difficulty,
        phaseAfter: succeeds ? "disarmed" : "triggered",
        tool: { itemId: kit.id, bonus: 2, quantityBefore: 1, quantityAfter: 0 },
      });
      expect(after.depth.hero.inventory.some((item) => item.id === kit.id)).toBe(false);
      expect(isTrapResolutionPacket(packet)).toBe(true);
      expect(projectTrapResolution(clone(before), clone(after), clone(source))).toEqual(packet);
      const candidate = projectCutawayCandidates(before, after, source).find((entry) => entry.recipeKey === "trap-resolution@1")!;
      expect(resolveCutawayCandidate(cutawayRegistry, candidate)).toMatchObject({ mode: "animate", reason: "registered" });
      expect(JSON.stringify(before)).toBe(saved);
      expect(Object.isFrozen(packet)).toBe(true);
      if (packet?.schemaVersion !== 2) throw new Error("Expected assisted packet");
      expect(Object.isFrozen(packet.tool)).toBe(true);
      for (const changed of [
        { bonus: 3 }, { quantityAfter: 1 }, { itemId: "foreign" }, { fake: true },
      ]) expect(isTrapResolutionPacket({ ...packet, tool: { ...packet.tool, ...changed } })).toBe(false);
      expect(isTrapResolutionPacket({ ...packet, schemaVersion: 3 })).toBe(false);
      expect(isTrapResolutionPacket({ ...packet, heroId: "x".repeat(401) })).toBe(false);
      expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
        hero: { ...after.depth.hero, inventory: before.depth.hero.inventory },
      } }, source)).toBeNull();
      const receipt = after.depth.dungeon!.latestDisarmKitUse!;
      for (const changed of [{ tick: receipt.tick - 1 }, { skill: receipt.skill + 2 }, { quantityAfter: 1 }, { itemId: "foreign" }]) {
        expect(projectTrapResolution(before, { ...after, depth: { ...after.depth,
          dungeon: { ...after.depth.dungeon!, latestDisarmKitUse: { ...receipt, ...changed } as typeof receipt },
        } }, source)).toBeNull();
      }
    });
  }

  it("projects a same-event detected trap before its earned level-up", () => {
    const staged = trapWorld({ kind: "tripwire", stage: "detect", success: true, exit: false });
    const before: WorldState = {
      ...staged,
      hero: { ...staged.hero, experience: 8, level: 1, mastery: 0 },
      depth: { ...staged.depth, hero: { ...staged.depth.hero, experience: 8, level: 1 } },
    };
    const after = advanceWorld(clone(before));
    const source = after.chronicle.at(-1);
    if (source === undefined) throw new Error("Same-event cutaway fixture produced no Chronicle source");
    expect(after.hero).toMatchObject({ experience: 12, level: 2 });
    const candidates = projectCutawayCandidates(before, after, source);
    expect(candidates.map((candidate) => candidate.recipeKey)).toEqual([
      "trap-resolution@1",
      "hero-level-up@1",
    ]);
    expect(candidates.map((candidate) => candidate.eventId)).toEqual([source.id, source.id]);
  });

  it("preserves the capped canonical check for an assisted level-100 mastery hero", () => {
    const purchased = advanceWorld(createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search"));
    const staged = trapWorld({ kind: "rune-ward", stage: "disarm", success: true, exit: false, world: purchased });
    const experience = heroExperienceFloor(100);
    const levelled = { ...staged.depth.hero, level: 100, experience };
    const stats = derivedStats(levelled);
    const hero = { ...levelled, resources: { ...levelled.resources,
      health: stats.maxHealth, maxHealth: stats.maxHealth, mana: stats.maxMana, maxMana: stats.maxMana,
    } };
    const before: WorldState = { ...staged,
      hero: { ...staged.hero, level: 100, experience, mastery: heroMasteryForExperience(experience),
        health: stats.maxHealth, maxHealth: stats.maxHealth },
      depth: { ...staged.depth, hero, heroGrowth: createHeroGrowthState(hero) },
    };
    const after = advanceWorld(clone(before));
    const packet = projectTrapResolution(before, after, after.chronicle.at(-1)!);
    expect(packet).toMatchObject({ schemaVersion: 2, success: true });
    if (packet === null) throw new Error("The capped assisted receipt must remain visible");
    expect(packet.skill).toBe(effectiveAttribute(hero, packet.attribute) + heroMechanicalLevel(100));
    expect(packet.skill).toBeLessThan(effectiveAttribute(hero, packet.attribute) + 100);
    expect(packet.total).toBe(packet.skill + packet.roll + 2);
    expect(after.depth.dungeon!.latestDisarmKitUse).toMatchObject({ skill: packet.skill, total: packet.total });
    expect(isTrapResolutionPacket(packet)).toBe(true);
  });

  for (const kind of ["tripwire", "rune-ward"] as const) {
    for (const stage of ["detect", "disarm"] as const) {
      for (const success of [true, false]) {
        for (const exit of [false, true]) {
          it(`projects ${kind} ${stage} ${success ? "success" : "failure"} on an ${exit ? "exit" : "ordinary"} cell`, () => {
            const { before, after, source, packet } = resolve({ kind, stage, success, exit });
            expect(packet).not.toBeNull();
            expect(packet).toMatchObject({
              schemaVersion: 1,
              eventId: source.id,
              tick: after.tick,
              commandType: stage === "detect" ? "move-dungeon" : "disarm-dungeon-trap",
              trapKind: kind,
              stage,
              success,
              phaseBefore: stage === "detect" ? "hidden" : "detected",
              phaseAfter: success ? stage === "detect" ? "detected" : "disarmed" : "triggered",
              damage: success ? 0 : Math.max(1, Math.floor(before.hero.maxHealth / 10)),
              completedExit: exit && !(stage === "detect" && success),
              crossMazeDelta: exit && !(stage === "detect" && success) ? 1 : 0,
            });
            expect(packet?.total).toBe(packet!.skill + packet!.roll);
            expect(packet?.healthAfter).toBe(after.hero.health);
          });
        }
      }
    }

    for (const success of [true, false]) {
      it(`projects ${kind} ${success ? "spotted" : "sprung"} at a generated dungeon threshold`, () => {
        const { before, after, source } = entryTrapWorld(kind, success);
        expect(projectTrapResolution(before, after, source)).toMatchObject({
          commandType: "enter-dungeon",
          trapKind: kind,
          stage: "detect",
          success,
          completedExit: false,
          crossMazeDelta: 0,
        });
      });
    }
  }

  it("clamps lethal damage and reports zero quest delta when the objective is already complete", () => {
    const before = trapWorld({ kind: "tripwire", stage: "disarm", success: false, exit: true, health: 1 });
    const quest = before.depth.quest;
    const completedQuest = {
      ...quest,
      subquests: quest.subquests.map((subquest) => ({
        ...subquest,
        objectives: subquest.objectives.map((objective) => objective.id === "quest:cross-maze"
          ? { ...objective, current: objective.target, status: "complete" as const }
          : objective),
      })),
    };
    const completedBefore = { ...before, depth: { ...before.depth, quest: completedQuest } };
    const after = advanceWorld(clone(completedBefore));
    const source = after.chronicle.at(-1)!;
    expect(projectTrapResolution(completedBefore, after, source)).toMatchObject({
      healthBefore: 1,
      healthAfter: 0,
      damage: 1,
      completedExit: true,
      crossMazeDelta: 0,
    });
  });

  it("is JSON-stable and does not mutate either world or a cloned source", () => {
    const { before, after, source } = resolve({ kind: "rune-ward", stage: "disarm", success: true, exit: true });
    const beforeSnapshot = clone(before);
    const afterSnapshot = clone(after);
    const sourceClone = clone(source);
    const first = projectTrapResolution(before, after, sourceClone);
    const second = projectTrapResolution(clone(before), clone(after), clone(source));
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(before).toEqual(beforeSnapshot);
    expect(after).toEqual(afterSnapshot);
  });

  it("does not turn combined legacy exit-trap and shrine changes into an isolated trap receipt", () => {
    const { before, after, source, packet } = resolve({ kind: "tripwire", stage: "disarm", success: false, exit: true, health: 10 });
    expect(packet).toMatchObject({ schemaVersion: 1, completedExit: true });
    // Adversarial projector inputs: a later shrine refund cannot stand in for raw trap loss.
    const restoredHealth = after.hero.health + 1;
    const restored = { ...after, hero: { ...after.hero, health: restoredHealth }, depth: { ...after.depth,
      hero: { ...after.depth.hero, resources: { ...after.depth.hero.resources, health: restoredHealth } },
    } };
    expect(projectTrapResolution(before, restored, source)).toBeNull();
    const dungeon = after.depth.dungeon!;
    const changedLandmark = { ...after, depth: { ...after.depth, dungeon: { ...dungeon,
      cells: dungeon.cells.map((cell) => cell.id === dungeon.exitCellId ? { ...cell, feature: "shrine" as const } : cell),
    } } };
    expect(projectTrapResolution(before, changedLandmark, source)).toBeNull();
  });

  it("fails closed for unrelated, forged, unchanged, illegal, and multiply changed events", () => {
    const { before, after, source } = resolve({ kind: "tripwire", stage: "detect", success: false, exit: false });
    const forgedCases: Array<[WorldState, WorldState, ChronicleEntry]> = [
      [before, after, { ...source, commandType: "travel" }],
      [before, after, { ...source, tick: source.tick + 1 }],
      [before, after, { ...source, id: `${source.id}:forged` }],
      [before, { ...after, tick: after.tick + 1 }, source],
      [before, { ...after, hero: { ...after.hero, health: after.hero.health + 1 } }, source],
      [before, { ...after, depth: { ...after.depth, quest: { ...after.depth.quest, summary: "forged" } } }, source],
    ];
    for (const [caseBefore, caseAfter, caseSource] of forgedCases) {
      expect(projectTrapResolution(caseBefore, caseAfter, caseSource)).toBeNull();
    }

    const beforeDungeon = before.depth.dungeon!;
    const afterDungeon = after.depth.dungeon!;
    const unchanged = { ...after, depth: { ...after.depth, dungeon: { ...afterDungeon, traps: beforeDungeon.traps } } };
    expect(projectTrapResolution(before, unchanged, unchanged.chronicle.at(-1)!)).toBeNull();

    const illegal = {
      ...after,
      depth: {
        ...after.depth,
        dungeon: { ...afterDungeon, traps: afterDungeon.traps.map((trap) => ({ ...trap, phase: "disarmed" as const })) },
      },
    };
    expect(projectTrapResolution(before, illegal, illegal.chronicle.at(-1)!)).toBeNull();

    const extraTrap = { cellId: beforeDungeon.exitCellId, kind: "rune-ward" as const, detectDifficulty: 10, disarmDifficulty: 11, phase: "hidden" as const };
    const multipleBefore = { ...before, depth: { ...before.depth, dungeon: { ...beforeDungeon, traps: [...beforeDungeon.traps, extraTrap] } } };
    const multipleAfter = { ...after, depth: { ...after.depth, dungeon: { ...afterDungeon, traps: [...afterDungeon.traps, { ...extraTrap, phase: "triggered" as const }] } } };
    expect(projectTrapResolution(multipleBefore, multipleAfter, source)).toBeNull();

    const forgedTurns = { ...after, depth: { ...after.depth, dungeon: { ...afterDungeon, turns: afterDungeon.turns + 1 } } };
    expect(projectTrapResolution(before, forgedTurns, source)).toBeNull();

    const cellsWithoutPassage = beforeDungeon.cells.map((cell) => cell.id === beforeDungeon.currentCellId
      ? { ...cell, exits: cell.exits.filter((direction) => direction !== "west") }
      : cell);
    const wallBefore = { ...before, depth: { ...before.depth, dungeon: { ...beforeDungeon, cells: cellsWithoutPassage } } };
    const wallAfter = { ...after, depth: { ...after.depth, dungeon: { ...afterDungeon, cells: cellsWithoutPassage } } };
    expect(projectTrapResolution(wallBefore, wallAfter, source)).toBeNull();
  });
});
