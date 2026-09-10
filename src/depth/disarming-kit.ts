import { isValidItemState } from "./rpg";
import type { DetailedHeroState, ItemState } from "./types";

export function disarmingKitId(heroId: string): string {
  if (typeof heroId !== "string" || heroId.length === 0 || heroId.length > 400) throw new TypeError("Disarming kit owner is invalid");
  return `${heroId}:item:disarming-kit`;
}

export function createDisarmingKit(heroId: string): ItemState {
  return Object.freeze({
    id: disarmingKitId(heroId), name: "Disarming Kit", kind: "consumable", slot: null,
    rarity: "common", quantity: 1, modifiers: Object.freeze({}), restorative: null, useMastery: null,
    dungeonTool: Object.freeze({ schemaVersion: 1, kind: "disarming-kit", bonus: 2 }),
  });
}

/** Capability only; the inventory selector supplies the exact owner join. */
export function isDisarmingKit(item: unknown): item is ItemState {
  return isValidItemState(item) && item.dungeonTool?.kind === "disarming-kit"
    && item.name === "Disarming Kit" && item.rarity === "common";
}

export function selectDisarmingKit(hero: Pick<DetailedHeroState, "id" | "inventory">): ItemState | null {
  if (!Array.isArray(hero.inventory)) return null;
  const expectedId = disarmingKitId(hero.id);
  const candidates = hero.inventory.filter((item) => item.dungeonTool !== undefined || item.id === expectedId);
  const kit = candidates.length === 1 ? candidates[0] : undefined;
  return kit !== undefined && kit.id === expectedId && isDisarmingKit(kit) ? kit : null;
}
