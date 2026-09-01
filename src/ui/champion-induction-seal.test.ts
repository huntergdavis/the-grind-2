import { describe, expect, it } from "vitest";
import {
  championExperienceFloorV1,
  createChampionInduction,
} from "../core/champions";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import { createHeroGrowthState } from "../core/hero-growth";
import type { WorldState } from "../core/types";
import {
  heroExperienceFloor,
  heroLevelForExperience,
  heroMasteryForExperience,
  maximumHeroLevel,
} from "../depth/rpg";
import {
  isChampionInductionSealPacketV1,
  projectChampionInductionSeal,
  type ChampionInductionSealPacketV1,
} from "./champion-induction-seal";

function withExperience(state: WorldState, experience: number): WorldState {
  const level = heroLevelForExperience(experience);
  const depthHero = { ...state.depth.hero, experience, level };
  return upgradeWorldState({
    ...state,
    hero: { ...state.hero, experience, level, mastery: heroMasteryForExperience(experience) },
    depth: {
      ...state.depth,
      hero: depthHero,
      heroGrowth: createHeroGrowthState(depthHero),
    },
  });
}

function resolveLevel(seed: string, targetLevel: number) {
  const initial = createWorld(seed, `campaign:${seed}`);
  const before = withExperience(initial, heroExperienceFloor(targetLevel) - 1);
  const after = advanceWorld(before);
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Level fixture produced no Chronicle source");
  expect(after.hero.level).toBe(targetLevel);
  return { before, after, source, packet: projectChampionInductionSeal(before, after, source) };
}

function requirePacket(value: ChampionInductionSealPacketV1 | null): ChampionInductionSealPacketV1 {
  if (value === null) throw new Error("Expected an earned Champion induction seal packet");
  return value;
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("Champion induction seal projector", () => {
  it("projects the exact earned Level-1000 induction as a bounded no-power receipt", () => {
    const { after, source, packet: candidate } = resolveLevel(
      "champion-seal-earned",
      maximumHeroLevel,
    );
    const packet = requirePacket(candidate);
    const induction = after.championInduction;
    if (induction === null) throw new Error("Expected canonical Champion induction");

    expect(packet).toMatchObject({
      schemaVersion: 1,
      eventId: source.id,
      tick: after.tick,
      campaignId: after.campaignId,
      commandId: source.commandId,
      commandType: source.commandType,
      heroId: after.hero.id,
      heroName: after.hero.name,
      className: after.depth.hero.className,
      experienceBefore: championExperienceFloorV1 - 1,
      experienceAfter: championExperienceFloorV1,
      levelBefore: maximumHeroLevel - 1,
      levelAfter: maximumHeroLevel,
      totalCompletedQuests: induction.totalCompletedQuests,
      archivedEquipmentCount: induction.equipment.length,
      archivedAbilityCount: induction.abilities.length,
      mechanicalEffect: "none",
      campaignContinues: true,
    });
    expect(packet.induction).toEqual(induction);
    expect(packet.induction).not.toBe(induction);
    expect(packet.induction.id).toBe(`champion:${packet.induction.contentHash}`);
    expect(isChampionInductionSealPacketV1(packet)).toBe(true);
    expect(isChampionInductionSealPacketV1(structuredClone(packet))).toBe(true);
    expectDeepFrozen(packet);
  });

  it("is deterministic, JSON-stable, and does not mutate or freeze its inputs", () => {
    const { before, after, source } = resolveLevel("champion-seal-pure", maximumHeroLevel);
    const beforeJson = JSON.stringify(before);
    const afterJson = JSON.stringify(after);
    const sourceJson = JSON.stringify(source);
    const inductionWasFrozen = Object.isFrozen(after.championInduction);

    const first = requirePacket(projectChampionInductionSeal(before, after, source));
    const second = requirePacket(projectChampionInductionSeal(
      structuredClone(before),
      structuredClone(after),
      structuredClone(source),
    ));

    expect(second).toEqual(first);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(before)).toBe(beforeJson);
    expect(JSON.stringify(after)).toBe(afterJson);
    expect(JSON.stringify(source)).toBe(sourceJson);
    expect(Object.isFrozen(after.championInduction)).toBe(inductionWasFrozen);
  });

  it("rejects nonmaximum, adopted, reload, and already-max worlds", () => {
    const ordinary = resolveLevel("champion-seal-ordinary", 999);
    expect(ordinary.packet).toBeNull();

    const earned = resolveLevel("champion-seal-adopted", maximumHeroLevel);
    const adoptedAfter = {
      ...earned.after,
      championInduction: createChampionInduction(earned.after, "adopted", null),
    };
    expect(projectChampionInductionSeal(earned.before, adoptedAfter, earned.source)).toBeNull();

    const continued = advanceWorld(earned.after);
    const continuedSource = continued.chronicle.at(-1);
    if (continuedSource === undefined) throw new Error("Continued fixture produced no Chronicle source");
    expect(projectChampionInductionSeal(earned.after, continued, continuedSource)).toBeNull();
    expect(projectChampionInductionSeal(earned.after, earned.after, earned.source)).toBeNull();
  });

  it("fails closed for forged world identity, source provenance, hash, and archive facts", () => {
    const fixture = resolveLevel("champion-seal-world-forgery", maximumHeroLevel);
    const packet = requirePacket(fixture.packet);
    const induction = fixture.after.championInduction;
    if (induction === null || fixture.source.commandId === undefined || fixture.source.commandType === undefined) {
      throw new Error("Expected exact earned fixture provenance");
    }

    expect(projectChampionInductionSeal(fixture.before, {
      ...fixture.after,
      seed: `${fixture.after.seed}:forged`,
    }, fixture.source)).toBeNull();
    expect(projectChampionInductionSeal(fixture.before, fixture.after, {
      ...fixture.source,
      commandId: `${fixture.source.commandId}:forged`,
    })).toBeNull();
    expect(projectChampionInductionSeal(fixture.before, {
      ...fixture.after,
      championInduction: { ...induction, contentHash: "0000000000000000", id: "champion:0000000000000000" },
    }, fixture.source)).toBeNull();
    expect(projectChampionInductionSeal(fixture.before, {
      ...fixture.after,
      championInduction: createChampionInduction(fixture.after, "earned", {
        id: `${fixture.source.commandId}:forged`,
        type: fixture.source.commandType,
      }),
    }, fixture.source)).toBeNull();
    expect(projectChampionInductionSeal(fixture.before, {
      ...fixture.after,
      hero: { ...fixture.after.hero, gold: fixture.after.hero.gold + 1 },
    }, fixture.source)).toBeNull();

    const packetForgeries: unknown[] = [
      { ...packet, inventedPower: 1 },
      { ...packet, mechanicalEffect: "bonus-power" },
      { ...packet, campaignContinues: false },
      { ...packet, archivedEquipmentCount: packet.archivedEquipmentCount + 1 },
      { ...packet, archivedAbilityCount: packet.archivedAbilityCount + 1 },
      { ...packet, totalCompletedQuests: packet.totalCompletedQuests + 1 },
      { ...packet, commandId: `${packet.commandId}:forged` },
      { ...packet, tick: packet.tick + 1 },
      {
        ...packet,
        induction: {
          ...packet.induction,
          contentHash: "0000000000000000",
          id: "champion:0000000000000000",
        },
      },
      {
        ...packet,
        induction: createChampionInduction(fixture.after, "adopted", null),
      },
    ];
    for (const forged of packetForgeries) {
      expect(isChampionInductionSealPacketV1(forged)).toBe(false);
    }
  });
});
