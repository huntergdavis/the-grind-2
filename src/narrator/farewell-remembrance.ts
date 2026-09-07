import type { CreativeStoryFocus } from "./creative-story";
import type { StoryVignette } from "./story-vignette";

/** Public records plus host-only provenance; never model-generated memory or a save mutation. */
export interface FarewellRemembrance {
  readonly kind: "farewell-remembrance";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly heroName: string;
  readonly companionName: string;
  readonly oath: Readonly<{ location: string; headline: string; tick: number }>;
  readonly farewell: Readonly<{ location: string; headline: string; tick: number }>;
}

export function captureFarewellRemembrance(value: FarewellRemembrance): FarewellRemembrance {
  return Object.freeze({
    kind: value.kind, campaignId: value.campaignId, eventId: value.eventId, tick: value.tick,
    heroName: value.heroName, companionName: value.companionName,
    oath: Object.freeze({ location: value.oath.location, headline: value.oath.headline, tick: value.oath.tick }),
    farewell: Object.freeze({ location: value.farewell.location, headline: value.farewell.headline, tick: value.farewell.tick }),
  });
}

const remembrances = [
  (hero: string, companion: string, place: string) => `${hero} remembered the oath with ${companion} at ${place}, and how different those words felt beside this wounded farewell. `
    + `${companion} was leaving alive; relief and worry did not have to agree before ${hero} could feel them both.`,
  (hero: string, companion: string, place: string) => `The oath at ${place} returned to ${hero} as ${companion} left, wounded but alive. `
    + "Reaching a goodbye did not make the concern disappear; it gave gratitude and helplessness somewhere new to meet.",
  (hero: string, companion: string, place: string) => `${hero} thought of the road promised with ${companion} at ${place}, now set beside a farewell neither relief nor worry could simplify. `
    + `${companion} was still alive and injured, and caring did not supply an answer to what came next.`,
] as const;

/** Authored recovery only. The earlier oath is deliberately not added to the LLM prompt. */
export function createFarewellRemembranceVignette(
  remembrance: FarewellRemembrance | null,
  focus: CreativeStoryFocus,
  identity: string,
  attempt: number,
): Readonly<StoryVignette> | null {
  if (remembrance === null || focus === "scene") return null;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  }
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % remembrances.length : 0;
  const index = (hash % remembrances.length + rotation) % remembrances.length;
  return Object.freeze({
    id: `farewell-remembrance-${index + 1}`,
    text: remembrances[index]!(remembrance.heroName, remembrance.companionName, remembrance.oath.location),
    tone: "care",
  });
}
