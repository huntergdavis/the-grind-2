import type { ItemState } from "./types";

export const roadRationUnitPrice = 1;
export const roadRationPairCost = 2;
export function roadRationId(heroId: string): string { return `${heroId}:item:road-ration`; }
export function createRoadRations(heroId: string, quantity = 2): ItemState {
  if (heroId.length === 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2) {
    throw new RangeError("Road Rations need a real owner and one or two units");
  }
  return { id: roadRationId(heroId), name: "Road Rations", kind: "consumable", slot: null, rarity: "common", quantity,
    modifiers: {}, restorative: null, useMastery: null, food: { schemaVersion: 1, kind: "road-ration" } };
}
/** Strict identity: a renamed tonic or unmarked old consumable is not food. */
export function isCanonicalRoadRations(value: unknown, heroId: string): value is ItemState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ItemState;
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 2) return false;
  const expected = createRoadRations(heroId, item.quantity);
  return Object.keys(item).sort().join(",") === Object.keys(expected).sort().join(",")
    && item.id === expected.id && item.name === expected.name && item.kind === expected.kind && item.slot === null
    && item.rarity === "common" && item.restorative === null && item.useMastery === null
    && item.modifiers !== null && typeof item.modifiers === "object" && !Array.isArray(item.modifiers)
    && Object.keys(item.modifiers).length === 0 && item.food !== null && typeof item.food === "object"
    && Object.keys(item.food).sort().join(",") === "kind,schemaVersion" && item.food.schemaVersion === 1 && item.food.kind === "road-ration";
}
