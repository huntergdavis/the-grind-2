import { canonicalHash } from "../src/core/canonical";
import { advanceWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalReparteeMemoryFixture } from "./repartee-memory-fixtures";

export const experimentalLoafCampaignId = "campaign:browser-repartee-memory";
export interface ExperimentalLoafJourney {
  before: WorldState;
  admitted: WorldState;
  completed: WorldState;
  next: WorldState;
}
let journey: ExperimentalLoafJourney | undefined;

/** Test comparison only, never a save or a staged gameplay state. The original
 * v178 proof records the hero's whole world; the new independent NPC receipt is
 * the sole intended addition. Ordinary commands, logs and resources must match.
 */
export function heroWorldHashWithoutLoafReceipt(world: WorldState): string {
  const { elsewhereLoaf: _receipt, ...depth } = world.depth;
  return canonicalHash({ ...world, depth });
}

/** One unchanged known campaign, original T320 bound, no supplied baker/inn,
 * route, health, job or result. A post-command observer accompanies actual
 * travel at T73 and route planning at T74; it does not spend a hero action.
 */
export function naturalExperimentalLoafFixture(): ExperimentalLoafJourney {
  if (journey !== undefined) return journey;
  let world = naturalReparteeMemoryFixture();
  while (world.tick < 320) {
    const before = world, admitted = advanceWorld(before);
    if (before.depth.elsewhereLoaf === undefined && admitted.depth.elsewhereLoaf !== undefined) {
      if (before.tick !== 72 || canonicalHash(before) !== "13656f8eed409523"
          || admitted.tick !== 73 || admitted.depth.elsewhereLoaf.completion !== null) {
        throw new Error("Experimental Loaf changed its actual first away-from-baker admission");
      }
      const completed = advanceWorld(admitted), next = advanceWorld(completed);
      if (completed.tick !== 74 || completed.depth.elsewhereLoaf?.completion == null || next.tick !== 75) {
        throw new Error("Experimental Loaf did not accompany the actual next ordinary action");
      }
      journey = { before, admitted, completed, next }; return journey;
    }
    world = admitted;
  }
  throw new Error("Known natural journey did not record a former baker's independent attempt by T320");
}
