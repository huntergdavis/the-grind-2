import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { advanceDepth, depthCommandCandidates } from "../src/depth/state";
import type { DepthCommand, DepthState } from "../src/depth/types";

function isInitialTownObligation(command: DepthCommand): boolean {
  return command.type === "buy-disarming-kit" || command.type === "start-smithy-job"
    || command.type === "smithy-stroke";
}

/** Settle the real kit purchase and finite nail job, never an unrelated adventure. */
export function settleInitialTownDepth(initial: DepthState): DepthState {
  let state = initial;
  for (let count = 0; count < 4; count += 1) {
    if (!depthCommandCandidates(state).every(candidate => isInitialTownObligation(candidate.command))) return state;
    state = advanceDepth(state);
  }
  if (depthCommandCandidates(state).some(candidate => isInitialTownObligation(candidate.command))) {
    throw new Error("Initial town fixture exceeded its kit plus three-command job boundary");
  }
  return state;
}

/** Keep canonical actor choices, Chronicle sources, and the actual earned job receipt. */
export function settleInitialTownWorld(initial: WorldState): WorldState {
  let world = initial;
  for (let count = 0; count < 4; count += 1) {
    if (!campaignDirector(world).candidates.every(candidate => isInitialTownObligation(candidate.command))) return world;
    world = advanceWorld(world);
  }
  if (campaignDirector(world).candidates.some(candidate => isInitialTownObligation(candidate.command))) {
    throw new Error("Initial town fixture exceeded its kit plus three-command job boundary");
  }
  return world;
}
