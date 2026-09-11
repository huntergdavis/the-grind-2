import { beforeAll, describe, expect, it } from "vitest";
import { naturalSpareGearTradeFixture } from "../../tests/spare-gear-trade-fixtures";
import { derivedStats } from "../depth/rpg";
import { selectSpareGearTrade, spareGearTradeCommandId } from "../depth/spare-gear-trade";
import { canonicalHash, canonicalStringify } from "./canonical";
import { actorPolicy, campaignDirector, upgradeWorldState } from "./simulation";

describe("Spare change as an actual town action", () => {
  let journey: ReturnType<typeof naturalSpareGearTradeFixture>;
  beforeAll(() => { journey = naturalSpareGearTradeFixture(); });

  it("keeps the earned T60 prefix and explains the actual one-gold trade", () => {
    const { before, sold, next } = journey;
    expect(before.tick).toBe(60);
    expect(canonicalHash(before)).toBe("82baa77aba72378e");
    const choice = actorPolicy(before, campaignDirector(before));
    expect(choice.command.type).toBe("sell-spare-gear");
    if (choice.command.type !== "sell-spare-gear") throw new Error("The real market did not offer the spare trade");
    const receipt = sold.depth.spareGearTrade!;
    expect(choice.commandId).toBe(`${before.campaignId}:${spareGearTradeCommandId(sold.tick, choice.command)}`);
    expect(sold.chronicle.at(-1)).toMatchObject({ commandId: choice.commandId, commandType: "sell-spare-gear", mode: "town" });
    expect(sold.scene).toMatchObject({ mode: "town", headline: "A lighter pack", location: receipt.marketName });
    for (const text of [receipt.soldItem.name, "At last, a weapon against my luggage."]) expect(sold.scene.action).toContain(text);
    expect(sold.scene.consequence).toContain("gold 18→19 (+1)");
    expect(sold.scene.consequence).toContain(receipt.keptWeapon.name);
    expect(sold.tick).toBe(before.tick + 1);
    expect(next.tick).toBe(sold.tick + 1);
    expect(next.chronicle.at(-1)?.commandType).toBe("plan-route");
    expect(selectSpareGearTrade(sold.depth)).toBeNull();
  });

  it("removes only the unused spear while preserving the proven blade and every non-gold resource", () => {
    const { before, sold } = journey, receipt = sold.depth.spareGearTrade!;
    expect(receipt.soldItem.name).toBe("Ashen Spear");
    expect(receipt.keptWeapon.name).toBe("Roadworn Blade");
    expect(receipt.goldEarned).toBe(1);
    expect(sold.depth.hero.gold).toBe(before.depth.hero.gold + 1);
    expect(sold.hero.gold).toBe(sold.depth.hero.gold);
    expect(sold.depth.hero.inventory).toEqual(before.depth.hero.inventory.filter(item => item.id !== receipt.soldItem.id));
    expect(receipt.soldItem).toEqual(before.depth.hero.inventory.find(item => item.id === receipt.soldItem.id));
    expect(sold.depth.hero.equipment).toEqual(before.depth.hero.equipment);
    expect(sold.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(derivedStats(sold.depth.hero)).toEqual(derivedStats(before.depth.hero));
    expect(sold.depth.hero.inventory.find(item => item.id === receipt.keptWeapon.id)).toEqual(receipt.keptWeapon);
    expect(receipt.keptWeapon.useMastery?.receipts).toHaveLength(1);
    expect(sold.depth.hero.experience).toBe(before.depth.hero.experience);
    expect(sold.hero.experience).toBe(before.hero.experience);
    for (const key of ["companions", "quest", "completedQuests", "completedCombats", "roadSupper"] as const) {
      expect(sold.depth[key]).toEqual(before.depth[key]);
    }
  });

  it("round-trips the actual sale and ordinary continuation without recreating the item", () => {
    for (const world of [journey.before, journey.sold, journey.next]) {
      const raw = canonicalStringify(world);
      const restored = upgradeWorldState(JSON.parse(raw));
      expect(canonicalStringify(restored)).toBe(raw);
      expect(canonicalHash(restored)).toBe(canonicalHash(world));
    }
    expect(journey.next.depth.spareGearTrade).toEqual(journey.sold.depth.spareGearTrade);
    expect(journey.next.depth.hero.inventory.some(item => item.id === journey.sold.depth.spareGearTrade!.soldItem.id)).toBe(false);
  });
});
