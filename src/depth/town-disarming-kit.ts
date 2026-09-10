import { inventoryCapacity } from "./rpg";
import { disarmingKitId } from "./disarming-kit";
import type { DepthState, DisarmingKitPurchasePlan, DisarmingKitPurchaseReceipt } from "./types";
export type { DisarmingKitPurchasePlan, DisarmingKitPurchaseReceipt } from "./types";

export const disarmingKitGoldCost = 5;

/** A real, affordable supply stop; candidate ordering keeps recovery and oaths first. */
export function selectDisarmingKitPurchase(state: DepthState): DisarmingKitPurchasePlan | null {
  if (state.quest.status !== "active" || state.pendingQuestReward !== null
    || state.companions.active.length > 0 || state.atlas.route !== null
    || state.combat !== null || state.counterDuel !== null
    || (state.dungeon !== null && !state.dungeon.completed)
    || state.hero.resources.health <= Math.floor(state.hero.resources.maxHealth / 2)
    || !Number.isSafeInteger(state.hero.gold) || state.hero.gold < disarmingKitGoldCost
    || state.hero.inventory.length >= inventoryCapacity
    || state.hero.inventory.some((item) => item.id === disarmingKitId(state.hero.id) || item.dungeonTool !== undefined)) return null;
  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  if (location?.kind !== "town" || !state.atlas.discoveredLocationIds.includes(location.id)) return null;
  const town = state.towns[location.id];
  if (town === undefined || town.locationId !== location.id || !Number.isSafeInteger(town.visits) || town.visits < 1) return null;
  const smith = town.buildings.filter((building) => building.kind === "smithy"
    && town.districts.some((district) => district.id === building.districtId && district.buildingIds.includes(building.id)))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (smith === undefined) return null;
  return Object.freeze({
    locationId: location.id, townId: town.id, townName: town.name,
    smithId: smith.id, smithName: smith.name, itemId: disarmingKitId(state.hero.id), itemName: "Disarming Kit",
    quantityBefore: 0, quantityBought: 1, quantityAfter: 1,
    goldBefore: state.hero.gold, unitPrice: disarmingKitGoldCost, goldSpent: disarmingKitGoldCost,
    goldAfter: state.hero.gold - disarmingKitGoldCost,
  });
}

/** Historical purchase proof remains valid after travel and consumption. */
export function isValidDisarmingKitPurchaseReceipt(value: unknown, state: Pick<DepthState, "hero" | "towns" | "tick">): value is DisarmingKitPurchaseReceipt | null {
  if (value === null) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const receipt = value as DisarmingKitPurchaseReceipt;
  const keys = ["schemaVersion", "tick", "locationId", "townId", "townName", "smithId", "smithName", "itemId", "itemName",
    "quantityBefore", "quantityBought", "quantityAfter", "goldBefore", "unitPrice", "goldSpent", "goldAfter"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))
    || receipt.schemaVersion !== 1 || !Number.isSafeInteger(receipt.tick) || receipt.tick < 1 || receipt.tick > state.tick
    || receipt.itemId !== disarmingKitId(state.hero.id) || receipt.itemName !== "Disarming Kit"
    || receipt.quantityBefore !== 0 || receipt.quantityBought !== 1 || receipt.quantityAfter !== 1
    || receipt.unitPrice !== disarmingKitGoldCost || receipt.goldSpent !== disarmingKitGoldCost
    || !Number.isSafeInteger(receipt.goldBefore) || receipt.goldBefore < disarmingKitGoldCost
    || receipt.goldAfter !== receipt.goldBefore - disarmingKitGoldCost) return false;
  const town = state.towns[receipt.locationId];
  const smith = town?.buildings.find((building) => building.id === receipt.smithId && building.kind === "smithy");
  return town !== undefined && town.visits > 0 && town.id === receipt.townId && town.locationId === receipt.locationId
    && town.name === receipt.townName && smith !== undefined && smith.name === receipt.smithName
    && town.districts.some((district) => district.id === smith.districtId && district.buildingIds.includes(smith.id));
}
