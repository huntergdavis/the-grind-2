import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { advanceDepth, depthCommandCandidates } from "../src/depth/state";
import type { DepthCommand, DepthState } from "../src/depth/types";

function isInitialTownObligation(command: DepthCommand): boolean {
  return command.type === "buy-disarming-kit" || command.type === "start-smithy-job"
    || command.type === "smithy-stroke" || command.type === "start-inn-bluff" || command.type === "resolve-inn-bluff";
}

/** Settle only the real kit, three-command nail job and two-command inn bluff. */
export function settleInitialTownDepth(initial: DepthState): DepthState {
  let state = initial;
  for (let count = 0; count < 6; count += 1) {
    if (!depthCommandCandidates(state).every(candidate => isInitialTownObligation(candidate.command))) return state;
    state = advanceDepth(state);
  }
  if (depthCommandCandidates(state).some(candidate => isInitialTownObligation(candidate.command))) {
    throw new Error("Initial town fixture exceeded its kit plus three-command job and two-command bluff boundary");
  }
  return state;
}

/** Keep canonical actor choices, Chronicle sources, and the actual earned job receipt. */
export function settleInitialTownWorld(initial: WorldState): WorldState {
  let world = initial;
  for (let count = 0; count < 6; count += 1) {
    if (!campaignDirector(world).candidates.every(candidate => isInitialTownObligation(candidate.command))) return world;
    world = advanceWorld(world);
  }
  if (campaignDirector(world).candidates.some(candidate => isInitialTownObligation(candidate.command))) {
    throw new Error("Initial town fixture exceeded its kit plus three-command job and two-command bluff boundary");
  }
  return world;
}
