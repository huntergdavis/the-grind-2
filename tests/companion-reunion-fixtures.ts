import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalReparteeMemoryFixture } from "./repartee-memory-fixtures";

export { reparteeMemoryCampaignId as companionReunionCampaignId } from "./repartee-memory-fixtures";

let earnedJourney: { beforeArrival: WorldState; ready: WorldState } | undefined;

/** Same known earned oath journey; the new bounded return opportunity must
 * produce ordinary route planning, real travel and a separate reunion. No HP,
 * location, route, roster, farewell, victory or arrival is staged. The unchanged
 * v166 baseline had no return through T320; this tests the explicit new feature,
 * not a retrospective claim that its routing already existed.
 */
function reunionJourney(): { beforeArrival: WorldState; ready: WorldState } {
  if (earnedJourney !== undefined) return earnedJourney;
  let world = naturalReparteeMemoryFixture(), beforeArrival: WorldState | null = null;
  while (world.tick <= 320) {
    if (campaignDirector(world).candidates[0]?.command.type === "reunite-companion") {
      if (beforeArrival === null) throw new Error("A reunion needs an actual prior route-arrival transition");
      earnedJourney = { beforeArrival, ready: world };
      return earnedJourney;
    }
    if (world.tick === 320) break;
    const before = world;
    world = advanceWorld(before);
    if (before.depth.atlas.route !== null && world.depth.atlas.route === null
      && before.depth.atlas.route.destinationId === world.depth.atlas.currentLocationId
      && before.depth.atlas.currentLocationId !== world.depth.atlas.currentLocationId
      && world.chronicle.at(-1)?.commandType === "travel"
      && world.depth.companions.former.some(companion => companion.departure.outcome === "fulfilled"
        && companion.injury === "none" && companion.resources.health > 0 && companion.departure.tick < world.tick
        && companion.departure.locationId === companion.destination.locationId
        && companion.departure.locationId === world.depth.atlas.currentLocationId)) beforeArrival = before;
  }
  throw new Error("Known earned oath journey did not offer a genuine return reunion by T320");
}

export function naturalCompanionReunionFixture(): WorldState { return reunionJourney().ready; }
export function naturalCompanionReunionArrivalFixture(): WorldState { return reunionJourney().beforeArrival; }
