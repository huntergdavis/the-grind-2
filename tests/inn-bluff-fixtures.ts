import { actorPolicy, advanceWorld, campaignDirector, createWorld, rulesEngine } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

export const innBluffCampaignId = "campaign:browser-repartee-memory";
let earned: { before: WorldState; ready: WorldState } | undefined;

/** Uninterrupted ordinary first-town journey, with no staged face, resources,
 * host, venue or prior job. The unchanged baseline reached this opportunity
 * at T4 after an actual kit purchase and the two-stroke paid smithy job.
 * Cato Ash is the inn's real associated scholar; admission explicitly seats
 * the pair and does not pretend home association alone proves presence.
 * T12 is a pinned bound below the original 64-command baseline ceiling.
 */
function innBluffJourney(): { before: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  let world = createWorld("shared-road-playful:7", innBluffCampaignId);
  while (world.tick < 12) {
    if (campaignDirector(world).candidates[0]?.command.type === "start-inn-bluff") {
      const ready = advanceWorld(world);
      if (ready.chronicle.at(-1)?.commandType !== "start-inn-bluff") throw new Error("Inn admission was not an actual committed command");
      earned = { before: world, ready }; return earned;
    }
    world = advanceWorld(world);
  }
  throw new Error("The pinned ordinary first-town journey did not reach the inn bluff by T12");
}

export function naturalInnBluffBeforeAdmissionFixture(): WorldState { return innBluffJourney().before; }
export function naturalInnBluffFixture(): WorldState { return innBluffJourney().ready; }

/** An authored legal branch, not the hero's natural policy choice. The full
 * canonical opportunity still passes through rulesEngine; the covered die,
 * public tell, inventory, personality and outcome are never rewritten.
 */
export function commitLegalInnBluffChoice(world: WorldState, choice: "challenge" | "decline"): WorldState {
  const opportunity = campaignDirector(world);
  const selected = opportunity.candidates.find(candidate => candidate.command.type === "resolve-inn-bluff" && candidate.command.choice === choice);
  if (selected === undefined) throw new Error(`The actual inn bluff does not offer ${choice}`);
  return rulesEngine(world, opportunity, { ...actorPolicy(world, { ...opportunity, candidates: [selected] }),
    rationale: `Explicit acceptance branch: choose the offered ${choice}; the concealed die and outcome remain canonical.` });
}
