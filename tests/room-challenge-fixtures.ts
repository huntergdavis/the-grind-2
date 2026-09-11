import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalBorrowedBellFixture } from "./borrowed-bell-fixtures";

export { borrowedBellCampaignId as roomChallengeCampaignId } from "./borrowed-bell-fixtures";

/** Continue one known actual F1/F2/book/practice journey through the finite
 * Bell expedition. No new seed search or staged health, town, resident, learned
 * frame, delivery result, or challenge is used to make this scene eligible.
 */
export function naturalRoomChallengeFixture(): WorldState {
  let world = naturalBorrowedBellFixture();
  for (let step = 0; step < 64; step++) {
    if (campaignDirector(world).candidates[0]?.command.type === "start-room-challenge") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known natural Bell continuation did not offer the public room challenge within 64 turns");
}
