import type { WorldState } from "../core/types";
import { selectDisarmingKit } from "../depth/disarming-kit";
import { isValidDisarmingKitPurchaseReceipt } from "../depth/town-disarming-kit";

/** Stages only the actual, just-persisted smith purchase, never a predicted supply stop. */
export function projectDisarmingKitPurchaseScene(state: WorldState): {
  smithId: string;
  smithName: string;
  receipt: string;
} | null {
  const purchase = state.depth.latestDisarmingKitPurchase;
  const entry = state.chronicle.at(-1);
  if (purchase == null || !isValidDisarmingKitPurchaseReceipt(purchase, state.depth)
    || state.scene.mode !== "town" || entry?.mode !== "town"
    || purchase.tick !== state.tick || state.depth.tick !== state.tick || entry.tick !== state.tick
    || entry.id !== `${state.campaignId}:${state.tick}`
    || entry.commandType !== "buy-disarming-kit"
    || entry.commandId !== `${state.campaignId}:depth:${state.depth.tick}:town:${purchase.locationId}:disarming-kit:${purchase.smithId}`
    || state.depth.atlas.currentLocationId !== purchase.locationId
    || state.depth.hero.gold !== purchase.goldAfter
    || selectDisarmingKit(state.depth.hero)?.id !== purchase.itemId) return null;
  return Object.freeze({ smithId: purchase.smithId, smithName: purchase.smithName, receipt: entry.consequence });
}
