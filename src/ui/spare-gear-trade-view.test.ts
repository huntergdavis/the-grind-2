import { beforeAll, describe, expect, it } from "vitest";
import { canonicalStringify } from "../core/canonical";
import { upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { naturalSpareGearTradeFixture, type NaturalSpareGearTradeJourney } from "../../tests/spare-gear-trade-fixtures";
import { projectGearAppearance } from "../render/hero-appearance";
import { projectSpareGearTradeScene } from "./spare-gear-trade-view";
import { projectStatusHistory } from "./status-history";
import { projectInventoryView } from "./view-projection";

describe("source-bound spare-gear sale presentation", () => {
  let journey: NaturalSpareGearTradeJourney;
  beforeAll(() => { journey = naturalSpareGearTradeFixture(); });

  it("waits for the actual sale and shows the sold snapshot, not the kept weapon", () => {
    const { before, sold } = journey, receipt = sold.depth.spareGearTrade!;
    expect(projectSpareGearTradeScene(before)).toBeNull();
    const scene = projectSpareGearTradeScene(sold)!;
    expect(scene).toMatchObject({ phase: "sold", commandId: sold.chronicle.at(-1)!.commandId,
      tick: 61, heroId: sold.hero.id, locationId: "location:0", locationName: "Elderwatch",
      marketId: receipt.marketId, marketName: receipt.marketName,
      itemId: receipt.soldItem.id, itemName: "Ashen Spear", keptWeaponId: receipt.keptWeapon.id,
      quantityBefore: 1, quantityAfter: 0, goldBefore: 18, goldAfter: 19,
      headline: "A LIGHTER PACK · +1 GOLD", detail: "At last, a weapon against my luggage.",
      compactDetail: "At last, a weapon against my luggage." });
    expect(scene.appearance).toEqual(projectGearAppearance(receipt.soldItem));
    expect(scene.appearance).toMatchObject({ silhouette: "spear", useMasteryLevel: 1, useMasteryStage: 0 });
    expect(scene).not.toHaveProperty("residentId");
    expect(scene).not.toHaveProperty("manaRestorative");
  });

  it("removes only the sold spear while preserving equipped mastery, resources and progression", () => {
    const { before, sold } = journey, receipt = sold.depth.spareGearTrade!;
    expect(sold.depth.hero).toEqual({ ...before.depth.hero, gold: 19,
      inventory: before.depth.hero.inventory.filter((item) => item.id !== receipt.soldItem.id) });
    expect(sold.hero.experience).toBe(before.hero.experience);
    const kept = sold.depth.hero.inventory.find((item) => item.id === receipt.keptWeapon.id)!;
    expect(kept).toEqual(receipt.keptWeapon);
    expect(kept.useMastery).toMatchObject({ level: 2, experience: 1 });
    expect(sold.depth.hero.equipment).toEqual(before.depth.hero.equipment);
    expect(sold.depth.roadSupper).toEqual(before.depth.roadSupper);
    const inventory = projectInventoryView(sold);
    expect(inventory.gold).toBe(19);
    expect(inventory.items.some((item) => item.id === receipt.soldItem.id)).toBe(false);
    expect(inventory.items.find((item) => item.id === kept.id)?.equippedSlot).toBe("weapon");
  });

  it("keeps an exact frozen scene after save reload without changing the source state", () => {
    const raw = canonicalStringify(journey.sold);
    const restored = upgradeWorldState(JSON.parse(raw));
    expect(restored).toEqual(journey.sold);
    const scene = projectSpareGearTradeScene(restored as WorldState)!;
    expect(scene).toEqual(projectSpareGearTradeScene(journey.sold));
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.appearance)).toBe(true);
    expect(canonicalStringify(journey.sold)).toBe(raw);
  });

  it("rejects stale, unrelated and mismatched scene sources without replaying a historical sale", () => {
    const { sold } = journey;
    const source = sold.chronicle.at(-1)!;
    for (const state of [
      { ...sold, campaignId: "campaign:unrelated-sale" },
      { ...sold, tick: sold.tick + 1 },
      { ...sold, scene: { ...sold.scene, headline: "A different town event" } },
      { ...sold, chronicle: [...sold.chronicle.slice(0, -1), { ...source, commandId: `${source.commandId}:other` }] },
    ]) expect(projectSpareGearTradeScene(state)).toBeNull();
  });

  it("keeps the original sale in Status while normal travel clears its scene", () => {
    const { sold, next } = journey, source = sold.chronicle.at(-1)!;
    const rows = projectStatusHistory(next).filter((entry) => entry.source === "chronicle" && entry.eventId === source.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: source.action, consequence: source.consequence,
      decision: { commandId: source.commandId } });
    expect(source.action).toContain("Ashen Spear");
    expect(next.chronicle.at(-1)!.commandType).toBe("plan-route");
    expect(next.depth.spareGearTrade).toEqual(sold.depth.spareGearTrade);
    expect(projectSpareGearTradeScene(next)).toBeNull();
    expect(next.depth.hero.gold).toBe(19);
  });
});
