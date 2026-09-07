import type { CreativeStoryFocus } from "./creative-story";
import type { StoryVignette } from "./story-vignette";

/** One verified shared victory; identifiers bind the host request and are never prose or model memory. */
export interface FirstSharedVictory {
  readonly kind: "first-shared-victory";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly combatId: string;
  readonly heroName: string;
  readonly companionName: string;
  readonly companionId: string;
  readonly condition: "healthy" | "injured";
  readonly battle: Readonly<{ location: string; headline: string; tick: number }>;
}

export function captureFirstSharedVictory(packet: FirstSharedVictory): FirstSharedVictory {
  return Object.freeze({
    kind: packet.kind, campaignId: packet.campaignId, eventId: packet.eventId, tick: packet.tick,
    combatId: packet.combatId, heroName: packet.heroName, companionName: packet.companionName,
    companionId: packet.companionId, condition: packet.condition,
    battle: Object.freeze({ location: packet.battle.location, headline: packet.battle.headline, tick: packet.battle.tick }),
  });
}

// Original imagined reactions, not durable feelings, dialogue, combat credit or promises about the next battle.
const healthy = [
  (hero: string, companion: string) => `Their first victory together left ${hero} oddly shy of the relief that ${companion}'s presence brought. `
    + "Trust seemed less like certainty than a door standing a little less firmly shut.",
  (hero: string, companion: string) => `${hero} found a small, unexpected warmth in the words first victory with ${companion}. `
    + "Pride wanted to make a promise of it; caution preferred to let this one shared success be enough.",
  (hero: string, companion: string) => `For ${hero}, winning beside ${companion} made companionship feel briefly less like a question. `
    + "The uncertainty had not vanished, but there was room beside it for gratitude, awkward and sincere.",
] as const;

const injured = [
  (hero: string, companion: string) => `Their first victory together brought ${hero} relief that would not settle while ${companion} remained injured. `
    + "Gratitude and worry pressed against each other, neither willing to call the other ungrateful.",
  (hero: string, companion: string) => `${hero} wanted to feel proud of the first victory with ${companion}, and found concern folded into every attempt. `
    + `${companion} was alive and injured; winning had answered one question without answering what care might ask next.`,
  (hero: string, companion: string) => `The thought of a first shared victory felt fragile to ${hero} beside the fact of ${companion}'s injury. `
    + "Relief was real, but so was the wish that success could have arrived with less reason to worry.",
] as const;

/** Authored recovery after a rejected completed draft; never an automatic claim about either character's actual emotions. */
export function createFirstSharedVictoryVignette(
  packet: FirstSharedVictory | null,
  focus: CreativeStoryFocus,
  identity: string,
  attempt: number,
): Readonly<StoryVignette> | null {
  if (packet === null || focus === "scene") return null;
  const entries = packet.condition === "injured" ? injured : healthy;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0;
  const rotation = Number.isSafeInteger(attempt) && attempt >= 0 ? attempt % entries.length : 0;
  const selected = (hash % entries.length + rotation) % entries.length;
  return Object.freeze({
    id: `first-shared-victory-${packet.condition}-${selected + 1}`,
    text: entries[selected]!(packet.heroName, packet.companionName),
    tone: packet.condition === "injured" ? "care" : "trust",
  });
}
