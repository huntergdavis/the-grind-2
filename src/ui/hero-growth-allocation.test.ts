import { describe, expect, it } from "vitest";
import { applyHeroGrowth, createHeroGrowthState } from "../core/hero-growth";
import { canonicalHash } from "../core/canonical";
import {
  advanceWorld,
  attentionPolicyForMode,
  createWorld,
  eventPolicyForMode,
  upgradeWorldState,
} from "../core/simulation";
import type { ChronicleEntry, RecordedDepthCommandType, WorldState } from "../core/types";
import {
  heroExperienceFloor,
  heroLevelForExperience,
  heroMasteryForExperience,
} from "../depth/rpg";
import type { DetailedHeroState } from "../depth/types";
import { projectCutawayCandidates } from "../render/cutaway-registry";
import {
  isHeroGrowthAllocationPacketV1,
  projectHeroGrowthAllocation,
  type HeroGrowthAllocationPacketV1,
} from "./hero-growth-allocation";

interface GrowthBeatOptions {
  readonly experienceAfter: number;
  readonly encounterActiveAfter?: boolean;
  readonly commandType?: RecordedDepthCommandType;
  readonly healthDelta?: number;
  readonly manaDelta?: number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stagedWorld(seed: string, experience: number): WorldState {
  const initial = createWorld(seed, `campaign:${seed}`);
  const level = heroLevelForExperience(experience);
  const depthHero: DetailedHeroState = { ...initial.depth.hero, experience, level };
  return upgradeWorldState({
    ...initial,
    hero: {
      ...initial.hero,
      experience,
      level,
      mastery: heroMasteryForExperience(experience),
    },
    depth: {
      ...initial.depth,
      hero: depthHero,
      heroGrowth: createHeroGrowthState(depthHero),
    },
  });
}

function growthBeat(before: WorldState, options: GrowthBeatOptions) {
  const tick = before.tick + 1;
  const commandType = options.commandType ?? "wait";
  const commandId = `${before.campaignId}:test:growth:${tick}:${commandType}`;
  const levelAfter = heroLevelForExperience(options.experienceAfter);
  const stagedHero: DetailedHeroState = {
    ...before.depth.hero,
    experience: options.experienceAfter,
    level: levelAfter,
    resources: {
      ...before.depth.hero.resources,
      health: Math.max(0, before.depth.hero.resources.health + (options.healthDelta ?? 0)),
      mana: Math.max(0, before.depth.hero.resources.mana + (options.manaDelta ?? 0)),
    },
  };
  const growth = applyHeroGrowth(before.depth.heroGrowth, stagedHero, {
    campaignId: before.campaignId,
    seed: before.seed,
    heroId: stagedHero.id,
    heroName: stagedHero.name,
    className: stagedHero.className,
    values: before.hero.values,
    tick,
    sourceCommandId: commandId,
    sourceCommandType: commandType,
    experienceBefore: before.hero.experience,
    experienceAfter: options.experienceAfter,
    levelBefore: before.hero.level,
    levelAfter,
    encounterActiveAfter: options.encounterActiveAfter ?? false,
  });
  const scene = {
    mode: "chronicle" as const,
    location: before.scene.location,
    headline: "A turning point settles",
    action: `${growth.hero.name} carries the road's lesson forward.`,
    goal: "Continue the eternal campaign",
    consequence: growth.appliedRecords.length === 0
      ? "The choice is held until danger passes."
      : `${growth.appliedRecords.length} permanent choice${growth.appliedRecords.length === 1 ? "" : "s"} settled.`,
    sensoryIntensity: 2 as const,
  };
  const source: ChronicleEntry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode(scene.mode),
    consideredActions: [scene.action],
    chosenAction: scene.action,
    rationale: "Canonical fixture applies the reducer result.",
    policy: eventPolicyForMode(scene.mode),
    commandId,
    commandType,
  };
  const after: WorldState = {
    ...before,
    tick,
    hero: {
      ...before.hero,
      level: growth.hero.level,
      experience: growth.hero.experience,
      mastery: heroMasteryForExperience(growth.hero.experience),
      health: growth.hero.resources.health,
      maxHealth: growth.hero.resources.maxHealth,
      gold: growth.hero.gold,
    },
    scene,
    chronicle: [...before.chronicle.slice(-31), source],
    depth: {
      ...before.depth,
      tick,
      hero: growth.hero,
      heroGrowth: growth.state,
    },
  };
  return { before, after, source, appliedRecords: growth.appliedRecords };
}

function immediate(seed = "growth-allocation-immediate") {
  const threshold = heroExperienceFloor(10);
  return growthBeat(stagedWorld(seed, threshold - 1), { experienceAfter: threshold + 3 });
}

function deferred(seed = "growth-allocation-deferred") {
  const threshold = heroExperienceFloor(10);
  const crossed = growthBeat(stagedWorld(seed, threshold - 1), {
    experienceAfter: threshold + 3,
    encounterActiveAfter: true,
  });
  const settled = growthBeat(crossed.after, { experienceAfter: crossed.after.hero.experience });
  return { crossed, settled };
}

function batch(seed = "growth-allocation-batch") {
  return growthBeat(stagedWorld(seed, 0), { experienceAfter: heroExperienceFloor(50) });
}

function requirePacket(value: HeroGrowthAllocationPacketV1 | null): HeroGrowthAllocationPacketV1 {
  if (value === null) throw new Error("Expected a growth-allocation packet");
  return value;
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) expectDeepFrozen(entry);
}

describe("hero growth allocation projection", () => {
  it("projects one immediate canonical append with exact provenance, level transition, and no-refill facts", () => {
    const { before, after, source } = immediate();
    const packet = requirePacket(projectHeroGrowthAllocation(before, after, source));

    expect(packet).toMatchObject({
      schemaVersion: 1,
      recipeId: "hero-growth-allocation@1",
      eventId: source.id,
      tick: after.tick,
      applicationTick: after.tick,
      applicationTiming: "immediate",
      campaignId: after.campaignId,
      commandId: source.commandId,
      commandType: source.commandType,
      heroId: after.hero.id,
      heroName: after.hero.name,
      className: after.depth.hero.className,
      selectionCount: 1,
    });
    expect(packet.levelTransition).toMatchObject({
      eventId: source.id,
      levelBefore: 9,
      levelAfter: 10,
    });
    const selection = packet.selections[0]!;
    expect(selection).toMatchObject({
      selectionOrdinal: 1,
      selectionCount: 1,
      settlementTiming: "immediate",
      record: { checkpointLevel: 10, tick: after.tick, crossedTick: after.tick },
    });
    expect(selection.selectedCandidate.packageId).toBe(selection.record.selectedPackageId);
    expect(selection.resourcesAfter.health).toBe(selection.resourcesBefore.health);
    expect(selection.resourcesAfter.mana).toBe(selection.resourcesBefore.mana);
    expect(selection.resourcesAfter.maxHealth).toBe(selection.derivedAfter.maxHealth);
    expect(selection.resourcesAfter.maxMana).toBe(selection.derivedAfter.maxMana);
    expect(isHeroGrowthAllocationPacketV1(packet)).toBe(true);
    expectDeepFrozen(packet);
  });

  it("projects a held choice only when it actually settles and preserves its original crossing provenance", () => {
    const { crossed, settled } = deferred();
    expect(projectHeroGrowthAllocation(crossed.before, crossed.after, crossed.source)).toBeNull();

    const packet = requirePacket(projectHeroGrowthAllocation(settled.before, settled.after, settled.source));
    expect(packet).toMatchObject({
      applicationTiming: "deferred",
      levelTransition: null,
      levelOnlyDerivedDelta: { power: 0, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
    });
    expect(packet.selections[0]).toMatchObject({
      settlementTiming: "deferred",
      record: {
        crossedTick: crossed.after.tick,
        tick: settled.after.tick,
        sourceCommandId: crossed.source.commandId,
        sourceCommandType: crossed.source.commandType,
      },
    });
    expect(packet.commandId).toBe(settled.source.commandId);
    expect(packet.commandId).not.toBe(packet.selections[0]!.record.sourceCommandId);
  });

  it("projects a bounded three-checkpoint append as one ordered packet with chained selections", () => {
    const { before, after, source } = batch();
    const packet = requirePacket(projectHeroGrowthAllocation(before, after, source));

    expect(packet.selectionCount).toBe(3);
    expect(packet.selections.map((selection) => selection.selectionOrdinal)).toEqual([1, 2, 3]);
    expect(packet.selections.map((selection) => selection.turningPointOrdinal)).toEqual([1, 2, 3]);
    expect(packet.selections.map((selection) => selection.record.checkpointLevel)).toEqual([10, 25, 50]);
    expect(packet.selections[1]!.attributesBefore).toEqual(packet.selections[0]!.attributesAfter);
    expect(packet.selections[2]!.attributesBefore).toEqual(packet.selections[1]!.attributesAfter);
    expect(packet.selections[1]!.derivedBefore).toEqual(packet.selections[0]!.derivedAfter);
    expect(packet.selections[2]!.derivedBefore).toEqual(packet.selections[1]!.derivedAfter);
    expect(packet.selections[1]!.resourcesBefore).toEqual(packet.selections[0]!.resourcesAfter);
    expect(packet.selections[2]!.resourcesBefore).toEqual(packet.selections[1]!.resourcesAfter);
    expect(packet.selections[2]!.attributesAfter).toEqual(after.depth.hero.attributes);
    expect(packet.selections[2]!.derivedAfter).toEqual(packet.derivedAfter);
    expect(packet.levelTransition).toMatchObject({ levelBefore: 1, levelAfter: 50 });
    expect(isHeroGrowthAllocationPacketV1(packet)).toBe(true);
  });

  it("proves four independently named derived vectors sum to the exact world delta", () => {
    const { before, after, source } = immediate("growth-allocation-vectors");
    const packet = requirePacket(projectHeroGrowthAllocation(before, after, source));
    for (const key of ["power", "armor", "initiative", "maxHealth", "maxMana"] as const) {
      expect(packet.totalDerivedDelta[key]).toBe(
        packet.levelOnlyDerivedDelta[key]
          + packet.growthDerivedDelta[key]
          + packet.otherSameBeatDerivedDelta[key],
      );
      expect(packet.totalDerivedDelta[key]).toBe(packet.derivedAfter[key] - packet.derivedBefore[key]);
    }
  });

  it("keeps per-record no-refill truth separate from unrelated same-beat resource loss", () => {
    const threshold = heroExperienceFloor(10);
    const before = stagedWorld("growth-allocation-resource-separation", threshold - 1);
    const resolved = growthBeat(before, {
      experienceAfter: threshold + 2,
      healthDelta: -3,
      manaDelta: -2,
    });
    const packet = requirePacket(projectHeroGrowthAllocation(before, resolved.after, resolved.source));
    const selection = packet.selections[0]!;

    expect(selection.resourcesBefore.health).toBe(before.depth.hero.resources.health - 3);
    expect(selection.resourcesAfter.health).toBe(selection.resourcesBefore.health);
    expect(selection.resourcesBefore.mana).toBe(before.depth.hero.resources.mana - 2);
    expect(selection.resourcesAfter.mana).toBe(selection.resourcesBefore.mana);
  });

  it("fails closed for record tamper, mutated prefix, application identity, and chronology", () => {
    const first = immediate("growth-allocation-tamper");
    const packet = requirePacket(projectHeroGrowthAllocation(first.before, first.after, first.source));
    const tamperedRecord = clone(first.after);
    tamperedRecord.depth.heroGrowth = {
      ...tamperedRecord.depth.heroGrowth,
      records: [{
        ...tamperedRecord.depth.heroGrowth.records[0]!,
        rationale: "A forged motive.",
      }],
    };
    expect(projectHeroGrowthAllocation(first.before, tamperedRecord, first.source)).toBeNull();

    const secondThreshold = heroExperienceFloor(25);
    const second = growthBeat(first.after, { experienceAfter: secondThreshold + 1 });
    const prefixTamper = clone(second.after);
    prefixTamper.depth.heroGrowth = {
      ...prefixTamper.depth.heroGrowth,
      records: [{
        ...prefixTamper.depth.heroGrowth.records[0]!,
        rationale: "The past was rewritten.",
      }, ...prefixTamper.depth.heroGrowth.records.slice(1)],
    };
    expect(projectHeroGrowthAllocation(second.before, prefixTamper, second.source)).toBeNull();

    expect(projectHeroGrowthAllocation(first.before, first.after, {
      ...first.source,
      commandId: `${first.source.commandId}:forged`,
    })).toBeNull();
    expect(isHeroGrowthAllocationPacketV1({ ...packet, applicationId: `${packet.applicationId}:forged` })).toBe(false);
    const chronology = clone(packet);
    chronology.selections[0]!.record.crossedTick = chronology.applicationTick + 1;
    expect(isHeroGrowthAllocationPacketV1(chronology)).toBe(false);
  });

  it("rejects vector, selected-candidate, resource, ordinal, identity, and capability packet forgeries", () => {
    const packet = requirePacket(projectHeroGrowthAllocation(...(() => {
      const { before, after, source } = immediate("growth-allocation-packet-forgery");
      return [before, after, source] as const;
    })()));
    expect(isHeroGrowthAllocationPacketV1({
      ...packet,
      totalDerivedDelta: { ...packet.totalDerivedDelta, armor: packet.totalDerivedDelta.armor + 1 },
    })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({
      ...packet,
      selections: [{ ...packet.selections[0]!, selectionOrdinal: 2 }],
    })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({
      ...packet,
      selections: [{
        ...packet.selections[0]!,
        selectedCandidate: packet.selections[0]!.record.candidates.find(
          (candidate) => candidate.packageId !== packet.selections[0]!.record.selectedPackageId,
        )!,
      }],
    })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({
      ...packet,
      selections: [{
        ...packet.selections[0]!,
        resourcesAfter: {
          ...packet.selections[0]!.resourcesAfter,
          health: Math.max(0, packet.selections[0]!.resourcesAfter.health - 1),
        },
      }],
    })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({ ...packet, tick: packet.tick + 1 })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({ ...packet, inventedChoice: true })).toBe(false);
    expect(isHeroGrowthAllocationPacketV1({ ...packet, sameBeatResourcesBefore: packet.selections[0]!.resourcesBefore })).toBe(false);
  });

  it("rejects rehashed batch discontinuity and self-consistent deferred final-stat forgery", () => {
    const batchPacket = requirePacket(projectHeroGrowthAllocation(...(() => {
      const { before, after, source } = batch("growth-allocation-batch-forgery");
      return [before, after, source] as const;
    })()));
    const second = batchPacket.selections[1]!;
    const forgedResourcesBefore = {
      ...second.resourcesBefore,
      health: Math.max(0, second.resourcesBefore.health - 1),
    };
    const forgedCandidates = second.record.candidates.map((candidate) => ({
      ...candidate,
      resourcesAfter: { ...candidate.resourcesAfter, health: forgedResourcesBefore.health },
    }));
    const recordWithoutId = {
      ...second.record,
      resourcesBefore: forgedResourcesBefore,
      candidates: forgedCandidates,
    };
    const { id: _discardedRecordId, ...recordFacts } = recordWithoutId;
    const forgedRecord = {
      ...recordWithoutId,
      id: `${batchPacket.campaignId}:growth:${canonicalHash(recordFacts)}`,
    };
    const forgedSelected = forgedCandidates.find((candidate) => candidate.packageId === forgedRecord.selectedPackageId)!;
    const forgedSelections = batchPacket.selections.map((selection, index) => index === 1 ? {
      ...selection,
      record: forgedRecord,
      selectedCandidate: forgedSelected,
      resourcesBefore: forgedResourcesBefore,
      resourcesAfter: forgedSelected.resourcesAfter,
    } : selection);
    const forgedRecordIds = forgedSelections.map((selection) => selection.record.id);
    const forgedApplicationId = `${batchPacket.campaignId}:growth-allocation:${canonicalHash({
      schemaVersion: 1,
      recipeId: "hero-growth-allocation@1",
      eventId: batchPacket.eventId,
      recordIds: forgedRecordIds,
    })}`;
    expect(isHeroGrowthAllocationPacketV1({
      ...batchPacket,
      applicationId: forgedApplicationId,
      selections: forgedSelections,
    })).toBe(false);

    const held = deferred("growth-allocation-deferred-derived-forgery");
    const deferredPacket = requirePacket(projectHeroGrowthAllocation(held.settled.before, held.settled.after, held.settled.source));
    const derivedAfter = { ...deferredPacket.derivedAfter, power: deferredPacket.derivedAfter.power + 1 };
    const totalDerivedDelta = { ...deferredPacket.totalDerivedDelta, power: deferredPacket.totalDerivedDelta.power + 1 };
    const otherSameBeatDerivedDelta = { ...deferredPacket.otherSameBeatDerivedDelta, power: deferredPacket.otherSameBeatDerivedDelta.power + 1 };
    expect(isHeroGrowthAllocationPacketV1({
      ...deferredPacket,
      derivedAfter,
      totalDerivedDelta,
      otherSameBeatDerivedDelta,
    })).toBe(false);
  });

  it("returns null for ordinary no-growth transitions and reload-style equal snapshots", () => {
    const ordinaryBefore = stagedWorld("growth-allocation-ordinary", heroExperienceFloor(2) - 1);
    const ordinary = growthBeat(ordinaryBefore, { experienceAfter: heroExperienceFloor(2) + 1 });
    expect(ordinary.appliedRecords).toEqual([]);
    expect(projectHeroGrowthAllocation(ordinary.before, ordinary.after, ordinary.source)).toBeNull();

    const resolved = immediate("growth-allocation-reload");
    expect(projectHeroGrowthAllocation(
      clone(resolved.after),
      clone(resolved.after),
      clone(resolved.source),
    )).toBeNull();

    const next = advanceWorld(clone(resolved.after));
    const nextSource = next.chronicle.at(-1);
    if (nextSource === undefined) throw new Error("Expected a subsequent Chronicle entry");
    expect(projectHeroGrowthAllocation(resolved.after, next, nextSource)).toBeNull();
  });

  it("replaces a same-tick generic level montage while preserving ordinary and deferred admission", () => {
    const resolved = immediate("growth-allocation-admission");
    expect(projectCutawayCandidates(resolved.before, resolved.after, resolved.source).map((candidate) => candidate.recipeKey)).toEqual([
      "hero-growth-allocation@1",
    ]);

    const ordinaryBefore = stagedWorld("growth-allocation-ordinary-admission", heroExperienceFloor(2) - 1);
    const ordinary = growthBeat(ordinaryBefore, { experienceAfter: heroExperienceFloor(2) + 1 });
    expect(projectCutawayCandidates(ordinary.before, ordinary.after, ordinary.source).map((candidate) => candidate.recipeKey)).toEqual([
      "hero-level-up@1",
    ]);

    const held = deferred("growth-allocation-deferred-admission");
    expect(projectCutawayCandidates(held.crossed.before, held.crossed.after, held.crossed.source).map((candidate) => candidate.recipeKey)).toEqual([
      "hero-level-up@1",
    ]);
    expect(projectCutawayCandidates(held.settled.before, held.settled.after, held.settled.source).map((candidate) => candidate.recipeKey)).toEqual([
      "hero-growth-allocation@1",
    ]);
  });
});
