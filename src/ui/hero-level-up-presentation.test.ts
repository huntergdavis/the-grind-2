import { describe, expect, it } from "vitest";
import { championExperienceFloorV1 } from "../core/champions";
import { createHeroGrowthState } from "../core/hero-growth";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { heroLevelForExperience, heroMasteryForExperience } from "../depth/rpg";
import {
  isHeroLevelUpPacketV2,
  projectHeroLevelUpPacketV2,
  type HeroLevelUpPacketV2,
} from "./hero-level-up-presentation";

function withExperience(state: WorldState, experience: number): WorldState {
  const level = heroLevelForExperience(experience);
  const depthHero = { ...state.depth.hero, experience, level };
  return upgradeWorldState({
    ...state,
    hero: { ...state.hero, experience, level, mastery: heroMasteryForExperience(experience) },
    depth: { ...state.depth, hero: depthHero, heroGrowth: createHeroGrowthState(depthHero) },
  });
}

function earnedPacket(seed: string): HeroLevelUpPacketV2 {
  const created = createWorld(seed, `campaign:${seed}`);
  const initial = campaignDirector(created).candidates.some((candidate) => candidate.command.type === "buy-disarming-kit")
    ? advanceWorld(created) : created;
  let before = withExperience(initial, championExperienceFloorV1 - 1);
  if (campaignDirector(before).candidates[0]?.command.type === "read-book") {
    // As in hero-level-up.test.ts, finish real zero-XP story actions first.
    // The threshold must be earned after reading and the actual three replies.
    for (const type of ["read-book", "start-repartee", "repartee-action", "repartee-action", "repartee-action"]) {
      expect(campaignDirector(before).candidates.every((candidate) => candidate.command.type === type)).toBe(true);
      const previous = before;
      before = advanceWorld(before);
      expect(before.hero.experience).toBe(previous.hero.experience);
      expect(before.hero.level).toBe(previous.hero.level);
    }
    expect(before.depth.repartee.completed?.rounds).toHaveLength(3);
  }
  const after = advanceWorld(before);
  expect(after.hero.experience).toBe(before.hero.experience + 1);
  expect(after.hero.level).toBe(1_000);
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Maximum-level fixture produced no Chronicle entry");
  const packet = projectHeroLevelUpPacketV2(before, after, source);
  if (packet === null) throw new Error("Maximum-level fixture produced no earned Hall packet");
  return packet;
}

describe("Level-1000 presentation envelope", () => {
  it("joins one maximum level transition to its exact no-power Hall receipt", () => {
    const packet = earnedPacket("hero-level-up-v2-earned");
    expect(packet).toMatchObject({
      schemaVersion: 2,
      levelAfter: 1_000,
      emphasis: "maximum",
      progressionBand: "maximum",
      nextLevelRequirement: null,
      championInductionSeal: {
        mechanicalEffect: "none",
        campaignContinues: true,
      },
    });
    expect(packet.eventId).toBe(packet.championInductionSeal.eventId);
    expect(packet.championInductionSeal.induction.id).toBe(
      `champion:${packet.championInductionSeal.induction.contentHash}`,
    );
    expect(Object.isFrozen(packet)).toBe(true);
    expect(isHeroLevelUpPacketV2(structuredClone(packet))).toBe(true);
  });

  it("fails closed on ordinary crossings, reloads, and forged joined facts", () => {
    const ordinaryBefore = withExperience(createWorld(
      "hero-level-up-v2-ordinary",
      "campaign:hero-level-up-v2-ordinary",
    ), 11);
    const ordinaryAfter = advanceWorld(ordinaryBefore);
    const ordinarySource = ordinaryAfter.chronicle.at(-1);
    if (ordinarySource === undefined) throw new Error("Ordinary fixture produced no Chronicle entry");
    expect(projectHeroLevelUpPacketV2(ordinaryBefore, ordinaryAfter, ordinarySource)).toBeNull();

    const packet = earnedPacket("hero-level-up-v2-forgery");
    expect(isHeroLevelUpPacketV2({ ...packet, campaignId: "campaign:forged" })).toBe(false);
    expect(isHeroLevelUpPacketV2({ ...packet, inventedReward: true })).toBe(false);
    expect(isHeroLevelUpPacketV2({
      ...packet,
      championInductionSeal: {
        ...packet.championInductionSeal,
        mechanicalEffect: "bonus-power",
      },
    })).toBe(false);
  });
});
