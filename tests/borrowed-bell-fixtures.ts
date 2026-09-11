import { advanceWorld, campaignDirector, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

// Continue the same actual hero used by the witnessed-memory acceptance slice.
export const borrowedBellCampaignId = "campaign:browser-repartee-memory";

/** No staged level, town, former companion, borrowed bell or board receipt.
 * One bounded known-seed journey reaches its first actual board invitation.
 */
export function naturalBorrowedBellFixture(): WorldState {
  let world = createWorld("shared-road-playful:7", borrowedBellCampaignId);
  for (let turn = 0; turn < 128; turn++) {
    if (campaignDirector(world).candidates[0]?.command.type === "start-bell") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known natural farewell journey did not offer the Borrowed Bell within 128 turns");
}
