import type { WorldState } from "../core/types";
import { bindRecordedFarewell, type RecordedFarewell } from "../narrator/recorded-farewell";
import { projectStoryBeatJobV1 } from "../narrator/story-beat";
import { isCompanionFarewellPacket, projectCompanionFarewell } from "./companion-farewell";

export type { RecordedFarewell } from "../narrator/recorded-farewell";

/** Project the committed healthy or injured farewell, even after its recruitment record is evicted. */
export function projectRecordedFarewell(before: WorldState, after: WorldState): RecordedFarewell | null {
  try {
    const source = after.chronicle.at(-1);
    if (source?.commandType !== "farewell-companion") return null;
    const farewell = projectCompanionFarewell(before, after, source);
    if (farewell === null || !isCompanionFarewellPacket(farewell)) return null;
    const condition = farewell.outcome === "fulfilled" ? "healthy" : "injured";
    const health = condition === "healthy" ? "in good health" : "wounded but alive";
    const arrival = condition === "healthy" ? "safely" : "wounded but alive";
    const victories = `${farewell.victories} shared ${farewell.victories === 1 ? "victory" : "victories"}`;
    const road = farewell.victories === 0 ? "the road was quiet" : victories;
    if (after.depth.atlas.currentLocationId !== farewell.destinationId || source.location !== farewell.destinationName
      || source.headline !== `${farewell.companionName}'s Shared Road Oath is complete.`
      || source.action !== `${farewell.companionName} departs ${health} after ${victories}.`
      || source.consequence !== `${farewell.companionName} reaches ${farewell.destinationName} ${arrival}; ${road}, bond ${farewell.bond}. The companions exchange farewells.`) return null;
    const job = projectStoryBeatJobV1(after.campaignId, after.scene, source, source.id);
    if (job === null) return null;
    return bindRecordedFarewell({ kind: "recorded-farewell", campaignId: after.campaignId,
      eventId: source.id, tick: source.tick, heroName: after.hero.name, companionName: farewell.companionName,
      condition, facts: job.facts }, job, { hero: after.hero, companion: null });
  } catch {
    return null;
  }
}
