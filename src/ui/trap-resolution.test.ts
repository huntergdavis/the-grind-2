import { describe, expect, it } from "vitest";
import { advanceWorld, attentionPolicyForMode, createWorld, eventPolicyForMode } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { dungeonTrapAt, generateDungeon, mazeCellId } from "../depth/dungeon";
import { derivedStats } from "../depth/rpg";
import { stepDepth } from "../depth/state";
import type { DungeonState, DungeonTrapKind, DungeonTrapPhase } from "../depth/types";
import { projectTrapResolution } from "./trap-resolution";
import { projectCutawayCandidates } from "../render/cutaway-registry";

interface TrapWorldOptions {
  kind: DungeonTrapKind;
  stage: "detect" | "disarm";
  success: boolean;
  exit: boolean;
  health?: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function trapWorld(options: TrapWorldOptions): WorldState {
  const world = createWorld(`projection-${options.kind}-${options.stage}-${options.success}-${options.exit}`, "campaign:trap-projection");
  const id = "dungeon:trap-projection";
  const trap = mazeCellId(id, 0, 0);
  const entry = mazeCellId(id, 1, 0);
  const ordinaryExit = mazeCellId(id, 1, 1);
  const deadEnd = mazeCellId(id, 0, 1);
  const phase: DungeonTrapPhase = options.stage === "detect" ? "hidden" : "detected";
  const aptitude = options.success ? 20 : 1;
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
  return {
    ...world,
    hero: { ...world.hero, health },
    scene: { ...world.scene, mode: "dungeon", location: dungeon.name },
    depth: {
      ...world.depth,
      dungeon,
      hero: {
        ...hero,
        resources: {
          ...world.depth.hero.resources,
          health,
          mana: Math.min(world.depth.hero.resources.mana, heroStats.maxMana),
          maxMana: heroStats.maxMana,
        },
      },
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

function entryTrapWorld(kind: DungeonTrapKind, success: boolean) {
  const dungeonId = `dungeon:entry-${kind}`;
  let seed = "";
  for (let index = 0; index < 200; index += 1) {
    const candidateSeed = `entry-${kind}-${index}`;
    const generated = generateDungeon(candidateSeed, dungeonId, 3, 3, true);
    const trap = dungeonTrapAt(generated, generated.entryCellId);
    if (trap?.kind === kind) {
      seed = candidateSeed;
      break;
    }
  }
  if (seed === "") throw new Error(`Could not find a generated ${kind} entry trap`);
  const world = createWorld(seed, `campaign:entry-${kind}-${success}`);
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
  const before: WorldState = {
    ...world,
    depth: {
      ...world.depth,
      hero: {
        ...hero,
        resources: {
          ...hero.resources,
          mana: Math.min(hero.resources.mana, heroStats.maxMana),
          maxMana: heroStats.maxMana,
        },
      },
    },
  };
  const depth = stepDepth(before.depth, { type: "enter-dungeon", dungeonId, width: 3, height: 3 });
  const tick = before.tick + 1;
  const scene = {
    mode: "dungeon" as const,
    location: depth.dungeon?.name ?? dungeonId,
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
    commandId: `${before.campaignId}:depth:${tick}:dungeon:${dungeonId}:enter`,
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
