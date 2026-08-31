import { describe, expect, it } from "vitest";
import { heroExperienceFloor, maximumHeroLevel } from "../depth/rpg";
import type { WorldState } from "./types";
import { createWorld } from "./simulation";
import {
  championExperienceFloorV1,
  championLevelV1,
  createChampionInduction,
  isValidChampionForState,
  isValidChampionInduction,
  maximumChampionAbilities,
  maximumChampionSnapshotBytes,
} from "./champions";

const earnedSource = { id: "test:champion-command", type: "wait" as const };

function eligibleWorld(seed = "champion-record"): WorldState {
  const world = createWorld(seed, `campaign:${seed}`);
  const experience = heroExperienceFloor(maximumHeroLevel);
  return {
    ...world,
    hero: { ...world.hero, level: maximumHeroLevel, experience },
    depth: {
      ...world.depth,
      hero: { ...world.depth.hero, level: maximumHeroLevel, experience },
    },
  };
}

describe("Hall of Champions induction", () => {
  it("creates one deterministic compact allowlisted champion snapshot", () => {
    const world = eligibleWorld();
    const first = createChampionInduction(world, "earned", earnedSource);
    const second = createChampionInduction(structuredClone(world), "earned", earnedSource);

    expect(second).toEqual(first);
    expect(first.id).toBe(`champion:${first.contentHash}`);
    expect(first.level).toBe(1_000);
    expect(first.experience).toBe(11_976_012);
    expect(first.sourceCommandId).toBe(earnedSource.id);
    expect(first.sourceCommandType).toBe(earnedSource.type);
    expect(first.abilities.length).toBeLessThanOrEqual(maximumChampionAbilities);
    expect(new TextEncoder().encode(JSON.stringify(first)).byteLength).toBeLessThan(maximumChampionSnapshotBytes);
    expect(isValidChampionInduction(first)).toBe(true);
    expect(isValidChampionForState(first, world)).toBe(true);
  });

  it("distinguishes adopted records and keeps an induction valid as the Eternal campaign continues", () => {
    const world = eligibleWorld("champion-adopted");
    const earned = createChampionInduction(world, "earned", earnedSource);
    const adopted = createChampionInduction(world, "adopted", null);
    const continued = {
      ...world,
      tick: world.tick + 100,
      hero: { ...world.hero, experience: world.hero.experience + 500 },
      depth: {
        ...world.depth,
        tick: world.tick + 100,
        totalCompletedQuests: world.depth.totalCompletedQuests + 2,
        hero: { ...world.depth.hero, experience: world.depth.hero.experience + 500 },
      },
    };

    expect(adopted.qualification).toBe("adopted");
    expect(adopted.sourceCommandId).toBeNull();
    expect(adopted.sourceCommandType).toBe("unknown-released-save");
    expect(adopted.contentHash).not.toBe(earned.contentHash);
    expect(isValidChampionForState(adopted, continued)).toBe(true);
  });

  it("freezes the v1 milestone independently of later hero levels", () => {
    const world = eligibleWorld("champion-frozen-v1");
    const record = createChampionInduction(world, "earned", earnedSource);
    const future = {
      ...world,
      hero: { ...world.hero, level: championLevelV1 + 1, experience: championExperienceFloorV1 + 10_000 },
      depth: {
        ...world.depth,
        hero: { ...world.depth.hero, level: championLevelV1 + 1, experience: championExperienceFloorV1 + 10_000 },
      },
    };

    expect(record.level).toBe(championLevelV1);
    expect(record.experience).toBe(championExperienceFloorV1);
    expect(isValidChampionInduction(record)).toBe(true);
    expect(isValidChampionForState(record, future)).toBe(true);
  });

  it("rejects mutation, extra keys, malformed content hashes, and premature induction", () => {
    const world = eligibleWorld("champion-invalid");
    const record = createChampionInduction(world, "earned", earnedSource);
    expect(isValidChampionInduction({ ...record, heroName: `${record.heroName}!` })).toBe(false);
    expect(isValidChampionInduction({ ...record, extra: true })).toBe(false);
    expect(isValidChampionInduction({ ...record, contentHash: "0".repeat(16), id: `champion:${"0".repeat(16)}` })).toBe(false);
    expect(isValidChampionForState(null, world)).toBe(false);
    expect(isValidChampionInduction({ ...record, sourceCommandId: null })).toBe(false);
    expect(() => createChampionInduction(createWorld("premature", "campaign:premature"), "earned", earnedSource))
      .toThrow(`requires Level ${championLevelV1}`);
    expect(() => createChampionInduction(world, "earned", null)).toThrow("provenance disagree");
    expect(() => createChampionInduction(world, "adopted", earnedSource)).toThrow("provenance disagree");
  });
});
