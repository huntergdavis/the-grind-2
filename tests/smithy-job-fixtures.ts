import { actorPolicy, advanceWorld, campaignDirector, createWorld, rulesEngine } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

export const smithyJobCampaignId = "campaign:browser-repartee-memory";
let earned: { before: WorldState; ready: WorldState } | undefined;

/** Uninterrupted same-seed start. Baseline reached The Wheel Smithy after a
 * real kit purchase at T1, with Hale Cooper's actual building association.
 * Admission explicitly establishes the offered job; no smith profession,
 * resident presence, MP, gold, building, history or prior outcome is staged.
 * The pinned T8 bound is intentionally smaller than the baseline T320 cap.
 */
function smithyJobJourney(): { before: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  let world = createWorld("shared-road-playful:7", smithyJobCampaignId);
  while (world.tick < 8) {
    if (campaignDirector(world).candidates[0]?.command.type === "start-smithy-job") {
      const ready = advanceWorld(world);
      if (ready.chronicle.at(-1)?.commandType !== "start-smithy-job") throw new Error("Job admission was not an actual committed command");
      earned = { before: world, ready }; return earned;
    }
    world = advanceWorld(world);
  }
  throw new Error("The pinned ordinary first-town journey did not admit the smithy job by T8");
}

export function naturalSmithyJobBeforeAdmissionFixture(): WorldState { return smithyJobJourney().before; }
export function naturalSmithyJobFixture(): WorldState { return smithyJobJourney().ready; }

/** Choose an offered legal stroke, not a staged resource or outcome. The full
 * canonical opportunity is still checked by rulesEngine. This is an authored
 * acceptance branch, not a claim about the hero's natural policy choice.
 */
export function commitLegalSmithyStroke(world: WorldState, stroke: "tap" | "drive"): WorldState {
  const opportunity = campaignDirector(world);
  const selected = opportunity.candidates.find(candidate => candidate.command.type === "smithy-stroke" && candidate.command.stroke === stroke);
  if (selected === undefined) throw new Error(`The actual smithy job does not offer ${stroke}`);
  return rulesEngine(world, opportunity, { ...actorPolicy(world, { ...opportunity, candidates: [selected] }),
    rationale: `Explicit acceptance branch: choose the offered ${stroke}; resources and outcome remain canonical.` });
}
