import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalReparteeMemoryFixture } from "./repartee-memory-fixtures";

export { reparteeMemoryCampaignId as usefulReplyCampaignId } from "./repartee-memory-fixtures";

/** The known natural journey recalls at T39, bids farewell at T40, then offers
 * this lesson at a real visited Candle Inn with Cato Ash. The small ceiling detects venue/order drift; it never
 * manufactures a town visit, recovered hero, departed companion, or learning.
 */
export function naturalUsefulReplyFixture(): WorldState {
  let world = naturalReparteeMemoryFixture();
  for (let step = 0; step < 8; step++) {
    if (campaignDirector(world).candidates[0]?.command.type === "read-useful-book") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known companion-memory continuation did not offer a real useful-reply lesson within eight turns");
}
