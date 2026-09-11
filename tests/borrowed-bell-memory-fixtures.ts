import { advanceWorld, campaignDirector, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { needsCriticalRoadsideRecovery } from "../src/depth/roadside-rest";

export const borrowedBellMemoryCampaignId = "campaign:browser-repartee-memory";

/** The earned book/oath/delivery journey continues to its first actual solo
 * roadside recovery. After the useful-reply lesson this is T72, not the older
 * T252 route; the event condition, seed and bounded ceiling remain unchanged.
 * No staged injury, route, board, resource or memory history.
 */
export function naturalBorrowedBellMemoryFixture(): WorldState {
  let world = createWorld("shared-road-playful:7", borrowedBellMemoryCampaignId);
  for (let turn = 0; turn < 320; turn++) {
    const state = world.depth;
    if (state.bellExpedition !== null && state.bellExpedition.completion !== null
      && needsCriticalRoadsideRecovery(state) && state.companions.active.length === 0
      && state.hero.resources.health > 0 && state.quest.status === "active"
      && state.repartee.active === null && campaignDirector(world).candidates[0]?.command.type === "wait") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known natural delivery journey did not reach its solo roadside recovery within 320 turns");
}
