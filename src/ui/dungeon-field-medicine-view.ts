import type { WorldState } from "../core/types";
import { isValidCampaignDungeonFieldMedicine } from "../depth/dungeon-field-medicine";

export interface DungeonFieldMedicineScene {
  readonly commandId: string;
  readonly tick: number;
  readonly heroId: string;
  readonly dungeonId: string;
  readonly locationId: string;
  readonly cellId: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly amount: number;
  readonly quantityBefore: number;
  readonly quantityAfter: number;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** Historical medicine receipts never replay a drink after movement or another action. */
export function projectDungeonFieldMedicineScene(state: WorldState): DungeonFieldMedicineScene | null {
  const dungeon = state.depth.dungeon, source = state.chronicle.at(-1);
  const receipt = dungeon?.latestFieldMedicineUse ?? null;
  if (dungeon === null || receipt === null || !isValidCampaignDungeonFieldMedicine(state.depth)
    || source?.commandType !== "use-dungeon-tonic" || source.tick !== state.tick || state.depth.tick !== state.tick
    || receipt.tick !== state.tick || source.commandId !== `${state.campaignId}:${receipt.sourceCommandId}`
    || source.mode !== "dungeon" || state.scene.mode !== "dungeon"
    || receipt.heroId !== state.depth.hero.id || receipt.heroId !== state.hero.id || receipt.dungeonId !== dungeon.id || dungeon.completed
    || receipt.cellId !== dungeon.currentCellId || receipt.locationId !== state.depth.atlas.currentLocationId
    || state.depth.companions.active.length !== 0 || state.depth.combat !== null) return null;
  return Object.freeze({
    commandId: source.commandId, tick: receipt.tick, heroId: receipt.heroId,
    dungeonId: receipt.dungeonId, locationId: receipt.locationId, cellId: receipt.cellId,
    itemId: receipt.itemId, itemName: receipt.itemName, healthBefore: receipt.healthBefore,
    healthAfter: receipt.healthAfter, amount: receipt.amount,
    quantityBefore: receipt.quantityBefore, quantityAfter: receipt.quantityAfter,
    headline: `${receipt.itemName.toUpperCase()} · +${receipt.amount} HP`,
    detail: `HP ${receipt.healthBefore} → ${receipt.healthAfter} · ${receipt.itemName} ${receipt.quantityBefore} → ${receipt.quantityAfter}`,
    compactDetail: `HP ${receipt.healthBefore}→${receipt.healthAfter} · tonic ${receipt.quantityBefore}→${receipt.quantityAfter}`,
  });
}
