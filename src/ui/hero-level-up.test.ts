import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import { createHeroGrowthState } from "../core/hero-growth";
import type { WorldState } from "../core/types";
import {
  heroExperienceFloor,
  heroLevelForExperience,
  heroMasteryForExperience,
  maximumHeroLevel,
} from "../depth/rpg";
import { completeQuestWithFacts } from "../../tests/quest-fixtures";
import { isHeroLevelUpPacketV1, projectHeroLevelUp } from "./hero-level-up";

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
  if (source === undefined) throw new Error("Level-up fixture produced no Chronicle source");
  expect(after.hero.level).toBe(targetLevel);
  return { before, after, source, packet: projectHeroLevelUp(before, after, source) };
}

function resolveQuestReward(seed: string) {
  const initial = withExperience(createWorld(seed, `campaign:${seed}`), 24);
  const ready = upgradeWorldState({
    ...initial,
    depth: { ...initial.depth, quest: completeQuestWithFacts(initial.depth.quest) },
  });
  const fulfilled = advanceWorld(ready);
  expect(fulfilled.chronicle.at(-1)?.commandType).toBe("fulfill-quest");
  const rewarded = advanceWorld(fulfilled);
  const source = rewarded.chronicle.at(-1);
  if (source === undefined) throw new Error("Quest reward fixture produced no Chronicle source");
  return { before: fulfilled, after: rewarded, source, packet: projectHeroLevelUp(fulfilled, rewarded, source) };
}

describe("hero level-up projector", () => {
  it("projects an exact ordinary earned threshold without inventing growth choices", () => {
    const { before, after, source, packet } = resolveLevel("level-up-standard", 2);
    expect(packet).toMatchObject({
      schemaVersion: 1,
      eventId: source.id,
      commandId: source.commandId,
      commandType: source.commandType,
      sourceKind: "command-award",
      heroId: after.hero.id,
      heroName: after.hero.name,
      experienceBefore: before.hero.experience,
      experienceDelta: 1,
      experienceAfter: after.hero.experience,
      levelBefore: 1,
      levelAfter: 2,
      levelDelta: 1,
      thresholdSpan: {
        firstLevel: 2,
        lastLevel: 2,
        count: 1,
        firstRequiredExperience: 12,
        lastRequiredExperience: 12,
      },
      mechanicalLevelBefore: 1,
      mechanicalLevelAfter: 2,
      levelOnlyDerivedDelta: { power: 1, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
      concurrentDerivedDelta: { power: 0, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
      progressionBand: "adventurer",
      emphasis: "standard",
      nextLevelRequirement: 48,
    });
    expect(packet?.sourceHeadline).toBe(source.headline);
    expect(packet?.sourceAction).toBe(source.action);
    expect(packet?.sourceLocation).toBe(source.location);
    expect(isHeroLevelUpPacketV1(packet)).toBe(true);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet?.thresholdSpan)).toBe(true);
    expect(Object.isFrozen(packet?.equipmentAfter)).toBe(true);
    expect(packet?.equipmentAfter.length).toBeGreaterThan(0);
    for (const fact of packet?.equipmentAfter ?? []) {
      expect(after.depth.hero.equipment[fact.slot]).toBe(fact.itemId);
      expect(after.depth.hero.inventory).toContainEqual(expect.objectContaining({ id: fact.itemId, name: fact.itemName }));
    }
  });

  it("attributes a surplus quest threshold to the exact applied reward receipt", () => {
    const { before, after, packet } = resolveQuestReward("level-up-quest-reward");
    const completion = after.depth.completedQuests.at(-1);
    if (completion?.reward.status !== "applied") throw new Error("Expected applied quest reward");
    expect(packet).toMatchObject({
      sourceKind: "quest-reward",
      commandType: "apply-quest-reward",
      rewardGrantId: completion.reward.grant.id,
      questCompletionId: completion.id,
      questTitle: completion.title,
      experienceBefore: 24,
      experienceDelta: 25,
      experienceAfter: 49,
      levelBefore: 2,
      levelAfter: 3,
    });
    expect(packet?.experienceBefore).toBe(before.hero.experience);
    expect(packet?.experienceAfter).toBe(after.hero.experience);
  });

  it("marks the Level 50 crossing as a milestone with one final mechanical power gain", () => {
    const { packet } = resolveLevel("level-up-fifty", 50);
    expect(packet).toMatchObject({
      levelBefore: 49,
      levelAfter: 50,
      mechanicalLevelBefore: 49,
      mechanicalLevelAfter: 50,
      levelOnlyDerivedDelta: { power: 1, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
      progressionBand: "adventurer",
      emphasis: "milestone",
    });
  });

  it("validates a bounded multi-threshold span and keeps same-beat build change separate", () => {
    const base = resolveLevel("level-up-packet-span", 2).packet;
    if (base === null) throw new Error("Expected valid level-up packet");
    const multi = {
      ...base,
      experienceBefore: 0,
      experienceDelta: 48,
      experienceAfter: 48,
      levelBefore: 1,
      levelAfter: 3,
      levelDelta: 2,
      thresholdSpan: {
        firstLevel: 2,
        lastLevel: 3,
        count: 2,
        firstRequiredExperience: 12,
        lastRequiredExperience: 48,
      },
      mechanicalLevelBefore: 1,
      mechanicalLevelAfter: 3,
      derivedBefore: { power: 4, armor: 3, initiative: 4, maxHealth: 24, maxMana: 12 },
      derivedAfter: { power: 6, armor: 4, initiative: 4, maxHealth: 24, maxMana: 12 },
      levelOnlyDerivedDelta: { power: 2, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
      concurrentDerivedDelta: { power: 0, armor: 1, initiative: 0, maxHealth: 0, maxMana: 0 },
      emphasis: "milestone",
      nextLevelRequirement: 108,
    };
    expect(isHeroLevelUpPacketV1(multi)).toBe(true);
    expect(isHeroLevelUpPacketV1({
      ...multi,
      concurrentDerivedDelta: { ...multi.concurrentDerivedDelta, armor: 0 },
    })).toBe(false);
  });

  it("states the Level 51 mechanical plateau rather than fabricating another power gain", () => {
    const { packet } = resolveLevel("level-up-eternal", 51);
    expect(packet).toMatchObject({
      levelBefore: 50,
      levelAfter: 51,
      mechanicalLevelBefore: 50,
      mechanicalLevelAfter: 50,
      levelOnlyDerivedDelta: { power: 0, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 },
      progressionBand: "eternal",
    });
  });

  it("projects the earned maximum threshold while limiting its claims to maximum reached", () => {
    const { after, packet } = resolveLevel("level-up-maximum", maximumHeroLevel);
    expect(after.championInduction).not.toBeNull();
    expect(packet).toMatchObject({
      levelBefore: maximumHeroLevel - 1,
      levelAfter: maximumHeroLevel,
      progressionBand: "maximum",
      emphasis: "maximum",
      nextLevelRequirement: null,
    });
  });

  it("does not replay after the maximum or project unrelated transitions", () => {
    const maximum = resolveLevel("level-up-capped", maximumHeroLevel).after;
    const after = advanceWorld(maximum);
    const source = after.chronicle.at(-1);
    if (source === undefined) throw new Error("Capped fixture produced no Chronicle source");
    expect(after.hero.level).toBe(maximumHeroLevel);
    expect(projectHeroLevelUp(maximum, after, source)).toBeNull();
  });

  it("fails closed for altered worlds, sources, receipt facts, and packet capabilities", () => {
    const { before, after, source, packet } = resolveQuestReward("level-up-forged");
    const completion = after.depth.completedQuests.at(-1)!;
    if (completion.reward.status !== "applied" || packet === null) throw new Error("Expected valid projector fixture");
    expect(projectHeroLevelUp(before, { ...after, hero: { ...after.hero, gold: after.hero.gold + 1 } }, source)).toBeNull();
    expect(projectHeroLevelUp(before, after, { ...source, commandId: `${source.commandId}:forged` })).toBeNull();
    expect(projectHeroLevelUp({ ...before, chronicle: [...before.chronicle, source] }, after, source)).toBeNull();
    expect(projectHeroLevelUp(before, {
      ...after,
      depth: {
        ...after.depth,
        completedQuests: [
          ...after.depth.completedQuests.slice(0, -1),
          {
            ...completion,
            reward: {
              ...completion.reward,
              receipt: { ...completion.reward.receipt, experienceDelta: completion.reward.receipt.experienceDelta + 1 },
            },
          },
        ],
      },
    }, source)).toBeNull();
    expect(isHeroLevelUpPacketV1({ ...packet, growthChoice: "invented" })).toBe(false);
    expect(isHeroLevelUpPacketV1({ ...packet, levelOnlyDerivedDelta: { ...packet.levelOnlyDerivedDelta, power: 99 } })).toBe(false);
  });
});
