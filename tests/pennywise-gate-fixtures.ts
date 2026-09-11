import { actorPolicy, advanceWorld, campaignDirector, createWorld, rulesEngine } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

export const pennywiseGateCampaignId = "campaign:browser-repartee-memory";

let earned: { beforeApproach: WorldState; ready: WorldState } | undefined;

/** T2 is an original road barrier, not the deferred ferry. The unchanged T7
 * baseline proved actual interior forest-road points at miles8 and15 of70,
 * within the next ordinary12-mile move. This helper requires the new real
 * approach command and gate choice: no road, location, HP, supplies, encounter
 * outcome or route is staged. The pinned first-road T15 ceiling is unchanged.
 */
function pennywiseGateJourney(): { beforeApproach: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  let world = createWorld("shared-road-playful:7", pennywiseGateCampaignId), previous: WorldState | undefined;
  while (world.tick <= 15) {
    if (campaignDirector(world).candidates[0]?.command.type === "choose-pennywise-gate") {
      if (previous === undefined || world.chronicle.at(-1)?.commandType !== "travel") {
        throw new Error("Pennywise Gate must follow an actual road approach, not an invented arrival");
      }
      earned = { beforeApproach: previous, ready: world };
      return earned;
    }
    if (world.tick === 15) break;
    previous = world;
    world = advanceWorld(world);
  }
  throw new Error("The pinned first-road journey did not reach Pennywise Gate by T15");
}

export function naturalPennywiseGateApproachFixture(): WorldState { return pennywiseGateJourney().beforeApproach; }
export function naturalPennywiseGateFixture(): WorldState { return pennywiseGateJourney().ready; }

/** Explicit legal alternative to this hero's natural pay choice. Only the
 * selected allowed command changes; no personality, gold or road is staged.
 */
export function pennywiseGateLegalLiftFixture(): WorldState {
  const ready = naturalPennywiseGateFixture(), opportunity = campaignDirector(ready);
  const selected = opportunity.candidates.find(candidate => candidate.command.type === "choose-pennywise-gate" && candidate.command.choice === "lift");
  if (selected === undefined) throw new Error("Earned gate has no legal lift alternative");
  // Narrow only this authored choice, while rulesEngine still receives and
  // validates the complete canonical opportunity. Trace names the real lift.
  return rulesEngine(ready, opportunity, { ...actorPolicy(ready, { ...opportunity, candidates: [selected] }),
    rationale: "Explicit acceptance branch: choose the offered free lift without staging resources." });
}
