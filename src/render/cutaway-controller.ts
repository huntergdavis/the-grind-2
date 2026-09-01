import {
  completeCutaway,
  createCutawayQueue,
  discardPendingCutaway,
  offerCutaway,
  resolveCutawayCandidate,
  type AnyCutawayCandidate,
  type CutawayQueue,
  type CutawayQueueAction,
  type CutawayRegistryV1,
  type CutawayResolution,
} from "./cutaway-registry";

export interface CutawayControllerState {
  readonly generation: number;
  readonly queue: CutawayQueue;
}

export interface CutawayControllerOffer {
  readonly state: CutawayControllerState;
  readonly action: CutawayQueueAction;
  readonly resolution: CutawayResolution;
}

export interface CutawayControllerCompletion {
  readonly state: CutawayControllerState;
  readonly action: "completed" | "stale";
}

function sameCandidate(left: AnyCutawayCandidate, right: AnyCutawayCandidate): boolean {
  return left.recipeKey === right.recipeKey && left.eventId === right.eventId;
}

export function createCutawayController(): CutawayControllerState {
  return Object.freeze({ generation: 0, queue: createCutawayQueue() });
}

export function offerCommittedCutaway(
  registry: CutawayRegistryV1,
  state: CutawayControllerState,
  candidate: AnyCutawayCandidate,
): CutawayControllerOffer {
  const offered = offerCutaway(registry, state.queue, candidate);
  const generation = offered.action === "start" ? state.generation + 1 : state.generation;
  const nextState = offered.queue === state.queue && generation === state.generation
    ? state
    : Object.freeze({ generation, queue: offered.queue });
  return Object.freeze({ state: nextState, action: offered.action, resolution: offered.resolution });
}

export function completeActiveCutaway(
  state: CutawayControllerState,
  candidate: AnyCutawayCandidate,
  generation: number,
): CutawayControllerCompletion {
  if (generation !== state.generation
    || state.queue.active === null
    || !sameCandidate(state.queue.active, candidate)) {
    return Object.freeze({ state, action: "stale" });
  }
  return Object.freeze({
    state: Object.freeze({
      generation: state.generation + 1,
      queue: completeCutaway(state.queue),
    }),
    action: "completed",
  });
}

export function discardPendingCutawayPresentation(
  state: CutawayControllerState,
): CutawayControllerState {
  const queue = discardPendingCutaway(state.queue);
  return queue === state.queue ? state : Object.freeze({ generation: state.generation, queue });
}

export function cancelCutawayController(state: CutawayControllerState): CutawayControllerState {
  return Object.freeze({ generation: state.generation + 1, queue: createCutawayQueue() });
}

export function isCutawayBusy(state: CutawayControllerState): boolean {
  return state.queue.active !== null;
}

export function activeCutawayMaximumMs(
  registry: CutawayRegistryV1,
  state: CutawayControllerState,
): number | null {
  const active = state.queue.active;
  if (active === null) return null;
  const resolution = resolveCutawayCandidate(registry, active);
  return resolution.mode === "animate" ? resolution.recipe?.durationBudget.maximumMs ?? null : null;
}
