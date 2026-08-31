import { describe, expect, it } from "vitest";
import { heroExperienceFloor, maximumHeroLevel } from "../depth/rpg";
import { createChampionInduction } from "./champions";
import { createWorld } from "./simulation";
import type { ChampionInduction, WorldState } from "./types";
import {
  createCampaignLegacyState,
  isValidCampaignLegacyState,
  isValidLegendCard,
  maximumCampaignLegends,
  maximumLegendCardBytes,
} from "./legends";

function champion(index: number): ChampionInduction {
  const base = createWorld(`legend-source:${index}`, `campaign:legend-source:${index}`);
  const experience = heroExperienceFloor(maximumHeroLevel);
  const world: WorldState = {
    ...base,
    hero: { ...base.hero, level: maximumHeroLevel, experience },
    depth: {
      ...base.depth,
      hero: { ...base.depth.hero, level: maximumHeroLevel, experience },
    },
  };
  return createChampionInduction(world, "earned", { id: `command:legend-source:${index}`, type: "wait" });
}

describe("campaign LegendCard selection", () => {
  it("selects at most three verified cards independent of candidate order", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => champion(index));
    const first = createCampaignLegacyState("new-campaign-seed", candidates);
    const second = createCampaignLegacyState("new-campaign-seed", [...candidates].reverse());

    expect(second).toEqual(first);
    expect(first.cards).toHaveLength(maximumCampaignLegends);
    expect(new Set(first.cards.map((card) => card.sourceChampionId)).size).toBe(first.cards.length);
    expect(first.cards.every(isValidLegendCard)).toBe(true);
    expect(first.cards.every((card) => new TextEncoder().encode(JSON.stringify(card)).byteLength <= maximumLegendCardBytes)).toBe(true);
    expect(isValidCampaignLegacyState(first, "new-campaign-seed")).toBe(true);
  });

  it("fails closed for malformed and duplicate Hall records", () => {
    const valid = champion(1);
    const malformed = { ...champion(2), heroName: "Changed without a new hash" };
    const selected = createCampaignLegacyState("closed-selection", [malformed, valid, structuredClone(valid)]);

    expect(selected.cards).toHaveLength(1);
    expect(selected.cards[0]?.sourceChampionId).toBe(valid.id);
  });

  it("copies identity provenance and one signature reference without importing power", () => {
    const source = champion(3);
    const state = createCampaignLegacyState("bounded-card", [source]);
    const card = state.cards[0];
    const sourceSignature = source.abilities[0];
    const cardBytes = JSON.stringify(card);

    expect(card).toMatchObject({
      sourceChampionId: source.id,
      sourceChampionHash: source.contentHash,
      sourceCampaignId: source.sourceCampaignId,
      sourceHeroId: source.heroId,
      heroName: source.heroName,
      className: source.className,
      level: 1_000,
      signatureAbility: source.abilities[0] ?? null,
    });
    expect(card).not.toHaveProperty("experience");
    expect(card).not.toHaveProperty("equipment");
    expect(card).not.toHaveProperty("gold");
    expect(card).not.toHaveProperty("stats");
    expect(card).not.toHaveProperty("quest");
    if (sourceSignature !== undefined) {
      expect(card?.signatureAbility).not.toBe(sourceSignature);
      (sourceSignature as { abilityName: string }).abilityName = "Mutated source art";
      expect(JSON.stringify(card)).toBe(cardBytes);
      expect(isValidLegendCard(card)).toBe(true);
    }
  });

  it("keeps the admitted subset immutable when the browser Hall later changes", () => {
    const initialHall = Array.from({ length: 5 }, (_, index) => champion(index));
    const admitted = createCampaignLegacyState("stable-campaign", initialHall);
    const laterHall = [...initialHall, champion(99)];
    const before = JSON.stringify(admitted);

    createCampaignLegacyState("stable-campaign", laterHall);
    expect(JSON.stringify(admitted)).toBe(before);
    expect(admitted.cards.some((card) => card.sourceChampionId === laterHall.at(-1)?.id)).toBe(false);
    expect(isValidCampaignLegacyState(admitted, "stable-campaign")).toBe(true);
  });

  it("can choose different bounded subsets for different campaign seeds", () => {
    const hall = Array.from({ length: 12 }, (_, index) => champion(index));
    const subsets = new Set(
      Array.from({ length: 12 }, (_, index) =>
        createCampaignLegacyState(`campaign-seed:${index}`, hall).cards.map((card) => card.id).join("|"),
      ),
    );

    expect(subsets.size).toBeGreaterThan(1);
  });
});
