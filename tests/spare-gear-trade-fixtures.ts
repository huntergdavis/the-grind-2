import { canonicalHash } from "../src/core/canonical";
import { advanceWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalRoadSupperPurchasedFixture } from "./road-supper-fixtures";

export interface NaturalSpareGearTradeJourney {
  readonly before: WorldState;
  readonly sold: WorldState;
  readonly next: WorldState;
}
let journey: NaturalSpareGearTradeJourney | undefined;

/** Actual unchanged T60 rations-purchased boundary, followed by the real sale.
 * No spare, market, gold, equipment, mastery, obligation or outcome is staged.
 * The original bounded fresh campaign helper retains its T58 hash check.
 */
export function naturalSpareGearTradeBeforeFixture(): WorldState {
  const before = naturalRoadSupperPurchasedFixture();
  if (before.tick !== 60 || canonicalHash(before) !== "82baa77aba72378e") {
    throw new Error("Spare-gear trade changed the actual pre-sale T60 campaign");
  }
  return before;
}

export function naturalSpareGearTradeJourneyFixture(): NaturalSpareGearTradeJourney {
  if (journey !== undefined) return journey;
  const before = naturalSpareGearTradeBeforeFixture(), sold = advanceWorld(before);
  if (sold.tick !== before.tick + 1 || sold.chronicle.at(-1)?.commandType !== "sell-spare-gear"
    || sold.depth.spareGearTrade == null) {
    throw new Error("The actual T60 spare did not produce one canonical sale");
  }
  const next = advanceWorld(sold);
  if (next.chronicle.at(-1)?.commandType !== "plan-route") {
    throw new Error("The actual spare sale did not return to ordinary route planning");
  }
  journey = { before, sold, next }; return journey;
}

export function naturalSpareGearTradeFixture(): NaturalSpareGearTradeJourney {
  return naturalSpareGearTradeJourneyFixture();
}
