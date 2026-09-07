import type { WorldState } from "../core/types";
import type { FarewellRemembrance } from "../narrator/farewell-remembrance";
import { projectCompanionFarewell } from "./companion-farewell";

export type { FarewellRemembrance } from "../narrator/farewell-remembrance";

const unsafeText = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}<>`*_{}\[\]]|&(?:[a-z]{2,}|#(?:\d+|x[\da-f]+));/iu;

function publicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value === value.trim() && !unsafeText.test(value);
}

/** A retained, recorded oath and one exact wounded-but-alive departure; never a new saved memory. */
export function projectFarewellRemembrance(before: WorldState, after: WorldState): FarewellRemembrance | null {
  try {
    const source = after.chronicle.at(-1);
    if (source?.commandType !== "farewell-companion") return null;
    const farewell = projectCompanionFarewell(before, after, source);
    if (farewell === null || farewell.outcome !== "injured"
      || farewell.joinedTick >= farewell.tick
      || !publicText(after.hero.name, 128)
      || !publicText(farewell.companionName, 128)
      || !publicText(farewell.originName, 120)
      || !publicText(farewell.destinationName, 120)
      || !publicText(source.location, 120)
      || !publicText(source.headline, 160)) return null;

    const oathId = `${after.campaignId}:${farewell.joinedTick}`;
    const oathCommandId = `${after.campaignId}:depth:${farewell.joinedTick}:companion:join:${farewell.companionId}`;
    // Reject ambiguous aliases as well as duplicate exact matches, rather than taking the first.
    const matches = after.chronicle.filter((entry) => entry.id === oathId
      || entry.tick === farewell.joinedTick || entry.commandId === oathCommandId);
    if (matches.length !== 1) return null;
    const oath = matches[0]!;
    const origins = after.depth.atlas.locations.filter((location) => location.id === farewell.originLocationId);
    // Chronicle places use atlas labels; the oath's town name can legitimately differ.
    if (origins.length !== 1) return null;
    if (oath.id !== oathId || oath.tick !== farewell.joinedTick
      || oath.commandType !== "recruit-companion" || oath.commandId !== oathCommandId
      || oath.mode !== "chronicle" || oath.location !== origins[0]!.name
      || oath.headline !== `${farewell.companionName} joins the road.`
      || oath.action !== `${farewell.companionName}, ${farewell.profession}, will travel from ${farewell.originName} to ${farewell.destinationName}.`
      || oath.consequence !== `${farewell.companionName}, ${farewell.profession} of ${farewell.originName}, swears to share the road to ${farewell.destinationName}.`
      || !publicText(oath.location, 120) || !publicText(oath.headline, 160)
      || source.location !== farewell.destinationName
      || source.headline !== `${farewell.companionName}'s Shared Road Oath is complete.`
      || source.action !== `${farewell.companionName} departs wounded but alive after ${farewell.victories} shared ${farewell.victories === 1 ? "victory" : "victories"}.`) return null;

    return Object.freeze({
      kind: "farewell-remembrance",
      campaignId: after.campaignId,
      eventId: source.id,
      tick: source.tick,
      heroName: after.hero.name,
      companionName: farewell.companionName,
      oath: Object.freeze({ location: oath.location, headline: oath.headline, tick: oath.tick }),
      farewell: Object.freeze({ location: source.location, headline: source.headline, tick: source.tick }),
    });
  } catch {
    return null;
  }
}
