import type { WorldState } from "../core/types";
import { isValidCampaignSpareGearTrade } from "../depth/spare-gear-trade";
import { projectGearAppearance, type GearAppearance } from "../render/hero-appearance";

export interface SpareGearTradeScene {
  readonly phase: "sold";
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly marketId: string;
  readonly marketName: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly keptWeaponId: string;
  readonly quantityBefore: 1;
  readonly quantityAfter: 0;
  readonly goldBefore: number;
  readonly goldAfter: number;
  readonly appearance: Readonly<GearAppearance>;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** The sold snapshot describes the object on the market stand, never current
 * equipment or an item still in the pack. Only its actual sale owns this scene. */
export function projectSpareGearTradeScene(world: WorldState): SpareGearTradeScene | null {
  const state = world.depth, receipt = state.spareGearTrade, source = world.chronicle.at(-1);
  if (receipt == null || source == null || !isValidCampaignSpareGearTrade(state)
    || world.tick !== state.tick || receipt.tick !== world.tick || source.tick !== world.tick
    || source.commandType !== "sell-spare-gear" || source.mode !== "town" || world.scene.mode !== "town"
    || source.commandId !== `${world.campaignId}:${receipt.sourceCommandId}`
    || world.hero.id !== state.hero.id || receipt.heroId !== state.hero.id
    || receipt.locationId !== state.atlas.currentLocationId
    || (["location", "headline", "action", "goal", "consequence", "sensoryIntensity"] as const)
      .some((key) => world.scene[key] !== source[key])) return null;
  const location = state.atlas.locations.find((entry) => entry.id === receipt.locationId);
  const market = state.towns[receipt.locationId]?.buildings.find((entry) => entry.id === receipt.marketId && entry.kind === "market");
  const appearance = projectGearAppearance(receipt.soldItem);
  if (location?.kind !== "town" || market === undefined || market.name !== receipt.marketName
    || appearance === null || appearance.slot !== "weapon") return null;
  const line = "At last, a weapon against my luggage.";
  return Object.freeze({ phase: "sold", commandId: source.commandId, tick: receipt.tick, heroId: receipt.heroId,
    locationId: location.id, locationName: location.name, marketId: market.id, marketName: market.name,
    itemId: receipt.soldItem.id, itemName: receipt.soldItem.name, keptWeaponId: receipt.keptWeapon.id,
    quantityBefore: receipt.quantityBefore, quantityAfter: receipt.quantityAfter,
    goldBefore: receipt.goldBefore, goldAfter: receipt.goldAfter, appearance: Object.freeze(appearance),
    headline: "A LIGHTER PACK · +1 GOLD", detail: line, compactDetail: line });
}
