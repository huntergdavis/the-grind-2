import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { selectBellDeliveryMemory } from "../src/depth/borrowed-bell-memory";
import { unresolvedRouteEncounterId } from "../src/depth/roadside-rest";
import { naturalRoomChallengeFixture } from "./room-challenge-fixtures";

export const borrowedBellMemoryCampaignId = "campaign:browser-repartee-memory";

/** Explicit low-HP recovery boundary, NOT an uninterrupted natural rest journey.
 * The one known F1/F2/book/practice/Bell/challenge journey earns its next actual
 * unresolved route. Only HP is then set to one quarter; route, encounter, venue,
 * commands and all story receipts remain untouched. The existing real wait
 * must perform the recovery and create the one memory. After F3b, the former
 * natural-rest lead no longer produced a memory within its 320-turn ceiling;
 * this boundary does not replace that missing evidence with a natural claim.
 */
export function borrowedBellMemoryRecoveryBoundaryFixture(): WorldState {
  let world = advanceWorld(advanceWorld(naturalRoomChallengeFixture()));
  if (world.depth.roomChallenge?.result == null) throw new Error("The earned challenge must settle before the recovery boundary");
  for (let turn = 0; turn < 16; turn++) {
    world = advanceWorld(world);
    const state = world.depth;
    if (unresolvedRouteEncounterId(state) === null || state.combat !== null || state.counterDuel !== null
      || state.dungeon !== null && !state.dungeon.completed || state.companions.active.length !== 0
      || state.hero.resources.health <= 0 || state.quest.status !== "active") continue;
    const health = Math.max(1, Math.floor(state.hero.resources.maxHealth / 4));
    const boundary = upgradeWorldState({ ...world, hero: { ...world.hero, health }, depth: { ...state,
      hero: { ...state.hero, resources: { ...state.hero.resources, health } } } });
    if (selectBellDeliveryMemory(boundary.depth)?.rest.kind !== "roadside"
      || campaignDirector(boundary).candidates[0]?.command.type !== "wait") {
      throw new Error("The explicit low-HP boundary must use the actual unresolved route's existing recovery");
    }
    return boundary;
  }
  throw new Error("Known earned challenge journey did not plan an actual solo unresolved route within 16 turns");
}
