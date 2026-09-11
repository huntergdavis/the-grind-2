import { describe, expect, it } from "vitest";
import { naturalSpareGearTradeBeforeFixture, naturalSpareGearTradeFixture } from "../../tests/spare-gear-trade-fixtures";
import { canonicalStringify } from "../core/canonical";
import { campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import { derivedStats } from "./rpg";
import { isValidCampaignSpareGearTrade, selectSpareGearTrade, spareGearTradeCommandId, stepSpareGearTrade } from "./spare-gear-trade";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthState, ItemState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}
function command(state: DepthState) {
  const trade = selectSpareGearTrade(state)!;
  return { type: "sell-spare-gear" as const, marketId: trade.marketId, itemId: trade.soldItem.id };
}

describe("one unused spare weapon becomes one gold", () => {
  it("sells the actual T60 Ashen Spear, retains the worn blade and every unrelated resource/history", () => {
    const { before, sold } = naturalSpareGearTradeFixture(), plan = selectSpareGearTrade(before.depth)!;
    expect(before.tick).toBe(60);
    expect(plan.soldItem).toMatchObject({ name: "Ashen Spear", rarity: "uncommon", modifiers: { power: 2 },
      useMastery: { level: 1, experience: 0, receipts: [] } });
    expect(plan.keptWeapon).toMatchObject({ name: "Roadworn Blade", modifiers: { power: 2, strength: 1 },
      useMastery: { level: 2, experience: 1 } });
    expect(plan.keptWeapon.useMastery!.receipts[0]!.resolvedTick).toBe(35);
    expect(sold.depth.spareGearTrade).toEqual(plan);
    expect(sold.tick).toBe(before.tick + 1);
    expect(plan).toMatchObject({ goldBefore: 18, goldEarned: 1, goldAfter: 19, quantityBefore: 1, quantitySold: 1, quantityAfter: 0 });
    expect(sold.depth.hero).toEqual({ ...before.depth.hero, gold: before.depth.hero.gold + 1,
      inventory: before.depth.hero.inventory.filter(item => item.id !== plan.soldItem.id) });
    expect(sold.hero).toEqual({ ...before.hero, gold: before.hero.gold + 1 });
    expect(derivedStats(sold.depth.hero)).toEqual(derivedStats(before.depth.hero));
    for (const key of ["atlas", "towns", "companions", "quest", "completedQuests", "pendingQuestReward", "completedCombats",
      "repartee", "reparteeWitness", "reparteeCallback", "bellExpedition", "bellMemory", "usefulReply", "roomChallenge", "roadSupper"] as const) {
      expect(sold.depth[key]).toEqual(before.depth[key]);
    }
    expect(plan.soldItem).toEqual(before.depth.hero.inventory.find(item => item.id === plan.soldItem.id));
    expect(plan.keptWeapon).toEqual(before.depth.hero.inventory.find(item => item.id === plan.keptWeapon.id));
  });

  it("binds a real later-market sale to the exact command, item and current Chronicle source", () => {
    const { before, sold } = naturalSpareGearTradeFixture(), trade = sold.depth.spareGearTrade!, action = command(before.depth);
    expect(depthCommandCandidates(before.depth).map(candidate => candidate.command)).toEqual([action]);
    expect(trade.sourceCommandId).toBe(`depth:${sold.tick}:spare-gear:${trade.marketId}:${trade.soldItem.id}`);
    expect(trade.sourceCommandId).toBe(spareGearTradeCommandId(sold.tick, action));
    expect(sold.chronicle.at(-1)).toMatchObject({ tick: sold.tick, mode: "town", commandType: "sell-spare-gear",
      commandId: `${sold.campaignId}:${trade.sourceCommandId}` });
    const town = before.depth.towns[trade.locationId]!;
    expect(town.buildings.find(building => building.id === trade.marketId)?.kind).toBe("market");
    expect(town.visits).toBeGreaterThan(0);
    expect(Object.values(before.depth.towns).filter(entry => entry.visits > 0).length).toBeGreaterThanOrEqual(2);
    expect(() => stepSpareGearTrade(before.depth, { ...action, marketId: "foreign-market" })).toThrow();
    expect(() => stepSpareGearTrade(before.depth, { ...action, itemId: trade.keptWeapon.id })).toThrow();
  });

  it("rejects equipment in use, rare gear, invented modifiers, keys, consumables and absent actual spares", () => {
    const before = naturalSpareGearTradeBeforeFixture().depth, trade = selectSpareGearTrade(before)!;
    expect(selectSpareGearTrade({ ...before, hero: { ...before.hero, equipment: { ...before.hero.equipment, weapon: trade.soldItem.id } } })).toBeNull();
    for (const replacement of [
      { ...trade.soldItem, rarity: "rare" },
      { ...trade.soldItem, modifiers: { power: 2, maxMana: 1 } },
      { ...trade.soldItem, modifiers: { power: 2, strength: 1 } },
      { ...trade.soldItem, kind: "key", slot: null, modifiers: {}, useMastery: null },
      { ...trade.soldItem, kind: "consumable", slot: null, modifiers: {}, useMastery: null },
    ] as ItemState[]) {
      expect(selectSpareGearTrade({ ...before, hero: { ...before.hero,
        inventory: before.hero.inventory.map(item => item.id === trade.soldItem.id ? replacement : item) } })).toBeNull();
    }
    expect(selectSpareGearTrade({ ...before, hero: { ...before.hero,
      inventory: before.hero.inventory.filter(item => item.id !== trade.soldItem.id) } })).toBeNull();
  });

  it("protects mastery, retained battle attribution and quest-granted items instead of deleting their history", () => {
    const before = naturalSpareGearTradeBeforeFixture().depth, trade = selectSpareGearTrade(before)!;
    const used = { ...trade.soldItem, useMastery: { ...trade.keptWeapon.useMastery!, receipts: trade.keptWeapon.useMastery!.receipts.map(receipt =>
      ({ ...receipt, weaponId: trade.soldItem.id, id: `${receipt.combatId}:weapon-use:${trade.soldItem.id}` })) } };
    expect(selectSpareGearTrade({ ...before, hero: { ...before.hero,
      inventory: before.hero.inventory.map(item => item.id === trade.soldItem.id ? used : item) } })).toBeNull();
    const battle = before.completedCombats[0]!;
    expect(battle.weaponUse.tracking).toBe("tracked");
    expect(selectSpareGearTrade({ ...before, completedCombats: [{ ...battle, weaponUse: {
      schemaVersion: 1, tracking: "tracked", rulesVersion: "weapon-effective-use-v1", heroId: before.hero.id,
      weaponId: trade.soldItem.id, basicStrikes: 0, damage: 0 } }] })).toBeNull();
    // Narrow negative reference boundary, not a fabricated earned quest reward.
    const questReference = { ...before, completedQuests: [{ reward: { status: "applied", grant: { item: trade.soldItem } } }] } as unknown as DepthState;
    expect(selectSpareGearTrade(questReference)).toBeNull();
  });

  it("keeps recovery, existing training and real venue obligations ahead of a direct sale", () => {
    const before = naturalSpareGearTradeBeforeFixture().depth, action = command(before), trade = selectSpareGearTrade(before)!;
    const weak = { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 1 } } };
    expect(selectSpareGearTrade(weak)).toBeNull();
    expect(() => stepDepth(weak, action)).toThrow();
    const training = { ...before, tick: 87 };
    expect(selectSpareGearTrade(training)).toBeNull();
    expect(depthCommandCandidates(training)[0]!.command.type).toBe("train-ability");
    expect(() => stepDepth(training, action)).toThrow();
    expect(selectSpareGearTrade({ ...before, hero: { ...before.hero, gold: Number.MAX_SAFE_INTEGER } })).toBeNull();
    const town = before.towns[trade.locationId]!;
    expect(selectSpareGearTrade({ ...before, towns: { ...before.towns, [trade.locationId]: { ...town, visits: 0 } } })).toBeNull();
    expect(selectSpareGearTrade({ ...before, towns: { ...before.towns, [trade.locationId]: { ...town,
      districts: town.districts.map(district => ({ ...district, buildingIds: district.buildingIds.filter(id => id !== trade.marketId) })) } } })).toBeNull();
  });

  it("loads old absence unchanged and rejects altered sale amounts, sources, snapshots and present malformed fields", () => {
    const { before, sold } = naturalSpareGearTradeFixture(), trade = sold.depth.spareGearTrade!;
    expect(Object.hasOwn(createWorld("spare-gear-old", "campaign:spare-gear-old").depth, "spareGearTrade")).toBe(false);
    expect(Object.hasOwn(reload(before.depth), "spareGearTrade")).toBe(false);
    expect(reload(sold.depth)).toEqual(sold.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(sold)))).toEqual(sold);
    const forged = [undefined, null, {}, { ...trade, rulesVersion: "spare-gear-trade-v2" },
      { ...trade, sourceCommandId: `${trade.sourceCommandId}:foreign` }, { ...trade, goldEarned: 2 },
      { ...trade, goldAfter: trade.goldAfter + 1 }, { ...trade, quantitySold: 2 }, { ...trade, tick: trade.tick + 1 },
      { ...trade, soldItem: { ...trade.soldItem, name: "An invented heirloom" } },
      { ...trade, keptWeapon: { ...trade.keptWeapon, modifiers: { power: 99 } } }];
    for (const value of forged) {
      const state = { ...sold.depth, spareGearTrade: value } as unknown as DepthState;
      expect(isValidCampaignSpareGearTrade(state)).toBe(false);
      // Keep an explicitly present undefined field intact at the loader boundary;
      // JSON serialization omits it and would instead produce valid old absence.
      expect(() => upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toThrow();
      if (value !== undefined) expect(() => reload(state)).toThrow();
    }
  });

  it("returns to the exact ordinary route, never pays twice and retains historical proof after later state changes", () => {
    const { sold, next } = naturalSpareGearTradeFixture(), trade = sold.depth.spareGearTrade!;
    expect(campaignDirector(sold).candidates.every(candidate => candidate.command.type === "plan-route")).toBe(true);
    expect(next.chronicle.at(-1)?.commandType).toBe("plan-route");
    expect(next.depth.spareGearTrade).toEqual(trade);
    expect(next.depth.hero.gold).toBe(sold.depth.hero.gold);
    expect(selectSpareGearTrade(next.depth)).toBeNull();
    expect(() => stepDepth(sold.depth, { type: "sell-spare-gear", marketId: trade.marketId, itemId: trade.soldItem.id })).toThrow();
    expect(reload(next.depth)).toEqual(next.depth);
    // Historical evidence cannot demand yesterday's balance or equipment forever.
    const later = { ...next.depth, tick: next.tick + 1, completedCombats: [], hero: { ...next.depth.hero,
      gold: 0, equipment: { ...next.depth.hero.equipment, weapon: null } } };
    expect(isValidCampaignSpareGearTrade(later)).toBe(true);
    expect(isValidCampaignSpareGearTrade({ ...later, hero: { ...later.hero, inventory: [...later.hero.inventory, trade.soldItem] } })).toBe(true);
  });

  it("does not mutate the source inventory or item/mastery snapshots while selecting and committing a sale", () => {
    const before = naturalSpareGearTradeBeforeFixture().depth, original = canonicalStringify(before), plan = selectSpareGearTrade(before)!;
    expect(plan.soldItem).not.toBe(before.hero.inventory.find(item => item.id === plan.soldItem.id));
    expect(plan.keptWeapon.useMastery).not.toBe(before.hero.inventory.find(item => item.id === plan.keptWeapon.id)!.useMastery);
    const result = stepSpareGearTrade(before, command(before));
    expect(result.spareGearTrade).toEqual(plan);
    expect(canonicalStringify(before)).toBe(original);
  });
});
