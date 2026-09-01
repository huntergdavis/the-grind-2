import { describe, expect, it } from "vitest";
import {
  applyHeroGrowth,
  createHeroGrowthState,
  heroGrowthCheckpointLevels,
  isValidHeroGrowthState,
  isStructurallyValidHeroGrowthState,
} from "./hero-growth";
import { applyHeroExperience, createHero, heroExperienceFloor } from "../depth/rpg";
import type { DetailedHeroState, HeroGrowthState } from "../depth/types";
import type { HeroValue, RecordedDepthCommandType } from "./types";

const campaignId = "campaign:growth-test";
const seed = "growth-test";

function atLevel(hero: DetailedHeroState, level: number): DetailedHeroState {
  const target = heroExperienceFloor(level);
  if (target < hero.experience) throw new Error("Test helper cannot reduce experience");
  return applyHeroExperience(hero, target - hero.experience).hero;
}

function resolve(
  state: HeroGrowthState,
  heroBefore: DetailedHeroState,
  levelAfter: number,
  options: {
    tick?: number;
    type?: RecordedDepthCommandType;
    values?: readonly HeroValue[];
    encounterActiveAfter?: boolean;
  } = {},
) {
  const hero = atLevel(heroBefore, levelAfter);
  return applyHeroGrowth(state, hero, {
    campaignId,
    seed,
    heroId: hero.id,
    heroName: hero.name,
    className: hero.className,
    values: options.values ?? ["courage", "loyalty"],
    tick: options.tick ?? levelAfter,
    sourceCommandId: `${campaignId}:command:${options.tick ?? levelAfter}`,
    sourceCommandType: options.type ?? "start-combat",
    experienceBefore: heroBefore.experience,
    experienceAfter: hero.experience,
    levelBefore: heroBefore.level,
    levelAfter: hero.level,
    encounterActiveAfter: options.encounterActiveAfter ?? false,
  });
}

function woundedHero(className: DetailedHeroState["className"]): DetailedHeroState {
  const hero = createHero(seed, "hero:growth", "Rook Vale");
  return {
    ...hero,
    className,
    resources: {
      ...hero.resources,
      health: Math.max(1, hero.resources.health - 9),
      mana: Math.max(0, hero.resources.mana - 4),
    },
  };
}

describe("Three Turning Points hero growth", () => {
  it("adopts released levels as settled without retroactive attributes or records", () => {
    const hero = atLevel(createHero(seed, "hero:migrated", "Mira Vale"), 25);
    const state = createHeroGrowthState(hero);
    expect(state).toMatchObject({
      settledCheckpointLevels: [10, 25],
      packageSelections: {
        "growth-v1:field-temper": 0,
        "growth-v1:road-rhythm": 0,
        "growth-v1:inner-pattern": 0,
      },
      pendingTriggers: [],
      records: [],
    });
    expect(state.baselineAttributes).toEqual(hero.attributes);
    expect(state.baselineLevel).toBe(25);
    expect(isStructurallyValidHeroGrowthState(state, hero, 0)).toBe(true);
  });

  it("selects Field Temper from known combat, class, and value facts without healing current HP", () => {
    const hero = woundedHero("Warden");
    const beforeHealth = hero.resources.health;
    const beforeMana = hero.resources.mana;
    const result = resolve(createHeroGrowthState(hero), hero, 10);
    const record = result.appliedRecords[0]!;
    expect(record.candidates).toHaveLength(3);
    expect(record.selectedPackageId).toBe("growth-v1:field-temper");
    expect(result.hero.attributes).toMatchObject({
      strength: hero.attributes.strength + 1,
      vitality: hero.attributes.vitality + 1,
    });
    expect(result.hero.resources).toMatchObject({
      health: beforeHealth,
      maxHealth: hero.resources.maxHealth + 3,
      mana: beforeMana,
      maxMana: hero.resources.maxMana,
    });
    expect(record.rationale).toContain("latest danger");
  });

  it("selects Road Rhythm for a Wayfinder travel deed and leaves both current resources unchanged", () => {
    const hero = woundedHero("Wayfinder");
    const result = resolve(createHeroGrowthState(hero), hero, 10, {
      type: "travel",
      values: ["curiosity", "loyalty"],
    });
    expect(result.appliedRecords[0]?.selectedPackageId).toBe("growth-v1:road-rhythm");
    expect(result.hero.attributes).toMatchObject({
      agility: hero.attributes.agility + 1,
      luck: hero.attributes.luck + 1,
    });
    expect(result.hero.resources.health).toBe(hero.resources.health);
    expect(result.hero.resources.mana).toBe(hero.resources.mana);
  });

  it("selects Inner Pattern for disciplined Spellblade training without claiming spell damage", () => {
    const hero = woundedHero("Spellblade");
    const result = resolve(createHeroGrowthState(hero), hero, 10, {
      type: "train-ability",
      values: ["curiosity", "mercy"],
    });
    const record = result.appliedRecords[0]!;
    expect(record.selectedPackageId).toBe("growth-v1:inner-pattern");
    expect(result.hero.attributes).toMatchObject({
      intellect: hero.attributes.intellect + 1,
      spirit: hero.attributes.spirit + 1,
    });
    expect(result.hero.resources).toMatchObject({
      health: hero.resources.health,
      maxHealth: hero.resources.maxHealth,
      mana: hero.resources.mana,
      maxMana: hero.resources.maxMana + 2,
    });
    expect(record.rationale).not.toMatch(/spell damage/i);
  });

  it("limits the career to three checkpoints and no more than two selections of one package", () => {
    const initial = woundedHero("Warden");
    let hero = initial;
    let state = createHeroGrowthState(hero);
    for (const [index, checkpoint] of heroGrowthCheckpointLevels.entries()) {
      const result = resolve(state, hero, checkpoint, { tick: index + 1 });
      hero = result.hero;
      state = result.state;
    }
    expect(state.records.map((record) => record.checkpointLevel)).toEqual([10, 25, 50]);
    expect(state.packageSelections["growth-v1:field-temper"]).toBe(2);
    expect(state.records[2]?.candidates).toHaveLength(2);
    expect(state.records[2]?.candidates.map((candidate) => candidate.packageId)).not.toContain("growth-v1:field-temper");

    const eternal = resolve(state, hero, 51, { tick: 4 });
    expect(eternal.appliedRecords).toEqual([]);
    expect(eternal.state).toBe(state);
    expect(eternal.hero.attributes).toEqual(hero.attributes);
  });

  it("resolves a synthetic multi-checkpoint award as three ordered bounded records", () => {
    const hero = woundedHero("Tinker");
    const result = resolve(createHeroGrowthState(hero), hero, 50, {
      type: "apply-quest-reward",
      values: ["curiosity", "mercy"],
    });
    expect(result.appliedRecords.map((record) => record.checkpointLevel)).toEqual([10, 25, 50]);
    expect(result.state.records).toHaveLength(3);
    expect(Object.values(result.state.packageSelections).reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it("freezes a combat crossing and applies it exactly once after the encounter ends", () => {
    const hero = woundedHero("Warden");
    const initial = createHeroGrowthState(hero);
    const queued = resolve(initial, hero, 10, { tick: 1, encounterActiveAfter: true });
    expect(queued.appliedRecords).toEqual([]);
    expect(queued.state.pendingTriggers.map((trigger) => trigger.checkpointLevel)).toEqual([10]);
    expect(queued.hero.attributes).toEqual(hero.attributes);

    const settled = resolve(queued.state, queued.hero, 10, { tick: 2, type: "combat-action" });
    expect(settled.appliedRecords).toHaveLength(1);
    expect(settled.appliedRecords[0]).toMatchObject({ crossedTick: 1, tick: 2, checkpointLevel: 10 });
    expect(settled.state.pendingTriggers).toEqual([]);

    const repeated = resolve(settled.state, settled.hero, 10, { tick: 3, type: "wait" });
    expect(repeated.appliedRecords).toEqual([]);
    expect(repeated.state).toBe(settled.state);
  });

  it("keeps zero HP at zero when a deferred Field Temper record finally settles", () => {
    const base = woundedHero("Warden");
    const hero = { ...base, resources: { ...base.resources, health: 0 } };
    const result = resolve(createHeroGrowthState(hero), hero, 10);
    expect(result.hero.resources.health).toBe(0);
    expect(result.hero.resources.maxHealth).toBe(hero.resources.maxHealth + 3);
  });

  it("round-trips deterministically and rejects rehashed or aggregate forgeries", () => {
    const hero = woundedHero("Warden");
    const first = resolve(createHeroGrowthState(hero), hero, 10);
    const second = resolve(createHeroGrowthState(structuredClone(hero)), structuredClone(hero), 10);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const restoredState = JSON.parse(JSON.stringify(first.state));
    const restoredHero = JSON.parse(JSON.stringify(first.hero));
    const context = { campaignId, seed, values: ["courage", "loyalty"] as const, tick: 10 };
    expect(isValidHeroGrowthState(restoredState, restoredHero, context)).toBe(true);
    expect(isValidHeroGrowthState({
      ...restoredState,
      packageSelections: { ...restoredState.packageSelections, "growth-v1:field-temper": 2 },
    }, restoredHero, context)).toBe(false);
    expect(isValidHeroGrowthState({
      ...restoredState,
      records: [{ ...restoredState.records[0], rationale: "Invented motive" }],
    }, restoredHero, context)).toBe(false);
    expect(isStructurallyValidHeroGrowthState({
      ...restoredState,
      baselineAttributes: restoredHero.attributes,
      packageSelections: {
        "growth-v1:field-temper": 0,
        "growth-v1:road-rhythm": 0,
        "growth-v1:inner-pattern": 0,
      },
      records: [],
    }, restoredHero, context.tick)).toBe(false);

    const multi = resolve(createHeroGrowthState(hero), hero, 50, { tick: 7 });
    const impossibleAppliedLevel = structuredClone(multi.state);
    impossibleAppliedLevel.records[1]!.appliedLevel = 10;
    expect(isStructurallyValidHeroGrowthState(impossibleAppliedLevel, multi.hero, 7)).toBe(false);
    const reversedChronology = structuredClone(multi.state);
    reversedChronology.records[1]!.crossedTick = 6;
    expect(isStructurallyValidHeroGrowthState(reversedChronology, multi.hero, 7)).toBe(false);
  });
});
