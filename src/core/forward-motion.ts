import { edgeBetween } from "../depth";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "../depth";
import type {
  DirectedJourneyLeg,
  ForwardMotionReason,
  ForwardMotionState,
  Opportunity,
  RouteDirective,
  WorldState,
} from "./types";

export const maximumRecentJourneyEntries = 8;
export const maximumDecisionsSinceProgress = 8;

export function createForwardMotionState(currentLocationId: string, tick: number): ForwardMotionState {
  return {
    schemaVersion: 1,
    recentLocationIds: [currentLocationId],
    recentLegs: [],
    decisionsSinceProgress: 0,
    lastProgressTick: tick,
    activeDirective: null,
  };
}

interface ConstrainedCandidates {
  candidates: readonly DepthCommandCandidate[];
  reason: ForwardMotionReason | null;
}

function routeDestination(candidate: DepthCommandCandidate): string | null {
  return candidate.command.type === "plan-route" ? candidate.command.destinationId : null;
}

export function constrainForwardMotion(
  state: WorldState,
  candidates: readonly DepthCommandCandidate[],
): ConstrainedCandidates {
  if (candidates.length === 0 || candidates.some((candidate) => candidate.command.type !== "plan-route")) {
    return { candidates, reason: null };
  }

  const currentLocationId = state.depth.atlas.currentLocationId;
  const lastLeg = state.forwardMotion.recentLegs.at(-1);
  const reverseLocationId = lastLeg?.toLocationId === currentLocationId
    ? lastLeg.fromLocationId
    : null;
  const reverseCandidate = candidates.find((candidate) => routeDestination(candidate) === reverseLocationId);
  if (candidates.length === 1 && reverseCandidate !== undefined) {
    return { candidates, reason: "only-open-road" };
  }

  const withoutImmediateReverse = reverseCandidate === undefined
    ? candidates
    : candidates.filter((candidate) => candidate !== reverseCandidate);
  const eligible = withoutImmediateReverse.length > 0 ? withoutImmediateReverse : candidates;
  const unseen = eligible.filter((candidate) => {
    const destinationId = routeDestination(candidate);
    return destinationId !== null && !state.depth.atlas.discoveredLocationIds.includes(destinationId);
  });
  if (unseen.length > 0) return { candidates: unseen, reason: "explore-unseen" };

  const recency = (candidate: DepthCommandCandidate): number => {
    const destinationId = routeDestination(candidate);
    return destinationId === null ? Number.MAX_SAFE_INTEGER : state.forwardMotion.recentLocationIds.lastIndexOf(destinationId);
  };
  const oldestVisit = Math.min(...eligible.map(recency));
  const leastRecent = eligible.filter((candidate) => recency(candidate) === oldestVisit);
  return {
    candidates: leastRecent,
    reason: reverseCandidate === undefined ? "least-recent" : "avoid-immediate-reverse",
  };
}

export function describeForwardMotionReason(reason: ForwardMotionReason, destinationName: string): string {
  switch (reason) {
    case "explore-unseen": return `${destinationName} is a mapped site the party has not reached`;
    case "avoid-immediate-reverse": return `${destinationName} keeps the journey from retracing its last road`;
    case "only-open-road": return `${destinationName} lies along the only open road out`;
    case "least-recent": return `${destinationName} is the least recently traveled way forward`;
  }
}

export function forwardMotionLabel(directive: RouteDirective | null): string {
  if (directive === null) return "Momentum · continuing saved route";
  switch (directive.reason) {
    case "explore-unseen": return "Momentum · new site";
    case "avoid-immediate-reverse": return "Momentum · no reversal";
    case "only-open-road": return "Backtrack · only open road";
    case "least-recent": return "Roam · least-recent road";
  }
}

function questProgressSignature(depth: DepthState): string {
  return [...depth.quest.objectives, ...depth.quest.subquests.flatMap((subquest) => subquest.objectives)]
    .map((objective) => `${objective.id}:${objective.current}:${objective.status}`)
    .join("|");
}

function madeCanonicalProgress(before: DepthState, after: DepthState): boolean {
  if (after.atlas.discoveredLocationIds.length > before.atlas.discoveredLocationIds.length) return true;
  if (questProgressSignature(after) !== questProgressSignature(before)) return true;
  if (after.discoveries.length > before.discoveries.length) return true;
  if ((after.dungeon?.visitedCellIds.length ?? 0) > (before.dungeon?.visitedCellIds.length ?? 0)) return true;
  if (
    before.dungeon?.id === after.dungeon?.id
    && before.dungeon?.traps.map((trap) => `${trap.cellId}:${trap.phase}`).join("|")
      !== after.dungeon?.traps.map((trap) => `${trap.cellId}:${trap.phase}`).join("|")
  ) return true;
  return after.completedCombats.at(-1)?.id !== before.completedCombats.at(-1)?.id
    || after.completedCounterDuels.at(-1)?.id !== before.completedCounterDuels.at(-1)?.id;
}

function completedLegs(
  before: DepthState,
  after: DepthState,
  plannedTick: number,
  arrivedTick: number,
  reason: ForwardMotionReason,
): readonly DirectedJourneyLeg[] {
  const route = before.atlas.route;
  if (route === null) return [];
  const completedThrough = after.atlas.route === null ? route.path.length - 1 : after.atlas.route.legIndex;
  const legs: DirectedJourneyLeg[] = [];
  for (let index = route.legIndex; index < completedThrough; index += 1) {
    const fromLocationId = route.path[index];
    const toLocationId = route.path[index + 1];
    if (fromLocationId === undefined || toLocationId === undefined) continue;
    legs.push({ fromLocationId, toLocationId, plannedTick, arrivedTick, reason });
  }
  return legs;
}

export function updateForwardMotion(
  state: WorldState,
  afterDepth: DepthState,
  opportunity: Opportunity,
  command: DepthCommand,
  tick: number,
): ForwardMotionState {
  let activeDirective = state.forwardMotion.activeDirective;
  if (command.type === "plan-route") {
    activeDirective = {
      reason: opportunity.forwardMotionReason ?? "least-recent",
      destinationId: command.destinationId,
      plannedTick: tick,
    };
  }

  const plannedTick = activeDirective?.plannedTick ?? state.tick;
  const arrived = completedLegs(state.depth, afterDepth, plannedTick, tick, activeDirective?.reason ?? "least-recent");
  const recentLegs = [...state.forwardMotion.recentLegs, ...arrived].slice(-maximumRecentJourneyEntries);
  const recentLocationIds = [
    ...state.forwardMotion.recentLocationIds,
    ...arrived.map((leg) => leg.toLocationId),
  ].slice(-maximumRecentJourneyEntries);
  if (afterDepth.atlas.route === null) activeDirective = null;
  const progressed = madeCanonicalProgress(state.depth, afterDepth);
  return {
    schemaVersion: 1,
    recentLocationIds,
    recentLegs,
    decisionsSinceProgress: progressed
      ? 0
      : Math.min(maximumDecisionsSinceProgress, state.forwardMotion.decisionsSinceProgress + 1),
    lastProgressTick: progressed ? tick : state.forwardMotion.lastProgressTick,
    activeDirective,
  };
}

export function assertForwardMotionReferences(state: WorldState): boolean {
  const motion = state.forwardMotion;
  const atlas = state.depth.atlas;
  const locationIds = new Set(atlas.locations.map((location) => location.id));
  if (
    typeof motion !== "object" || motion === null ||
    !Array.isArray(motion.recentLocationIds) ||
    !Array.isArray(motion.recentLegs) ||
    motion.schemaVersion !== 1 ||
    motion.recentLocationIds.length < 1 ||
    motion.recentLocationIds.length > maximumRecentJourneyEntries ||
    motion.recentLegs.length > maximumRecentJourneyEntries ||
    !motion.recentLocationIds.every((id) => locationIds.has(id)) ||
    motion.recentLocationIds.at(-1) !== atlas.currentLocationId ||
    !Number.isSafeInteger(motion.decisionsSinceProgress) ||
    motion.decisionsSinceProgress < 0 ||
    motion.decisionsSinceProgress > maximumDecisionsSinceProgress ||
    !Number.isSafeInteger(motion.lastProgressTick) ||
    motion.lastProgressTick < 0 ||
    motion.lastProgressTick > state.tick
  ) return false;
  let previousArrivalTick = -1;
  let previousDestinationId: string | null = null;
  for (const leg of motion.recentLegs) {
    if (
      typeof leg !== "object" || leg === null ||
      !locationIds.has(leg.fromLocationId) ||
      !locationIds.has(leg.toLocationId) ||
      !Number.isSafeInteger(leg.plannedTick) ||
      !Number.isSafeInteger(leg.arrivedTick) ||
      leg.plannedTick < 0 ||
      leg.plannedTick > leg.arrivedTick ||
      leg.arrivedTick < previousArrivalTick ||
      leg.arrivedTick > state.tick ||
      !["explore-unseen", "avoid-immediate-reverse", "only-open-road", "least-recent"].includes(leg.reason) ||
      (previousDestinationId !== null && previousDestinationId !== leg.fromLocationId)
    ) return false;
    try {
      edgeBetween(atlas, leg.fromLocationId, leg.toLocationId);
    } catch {
      return false;
    }
    previousArrivalTick = leg.arrivedTick;
    previousDestinationId = leg.toLocationId;
  }
  const arrivedLocationIds = motion.recentLegs.map((leg) => leg.toLocationId);
  const locationSuffix = motion.recentLocationIds.slice(-arrivedLocationIds.length);
  if (arrivedLocationIds.some((id, index) => locationSuffix[index] !== id)) return false;
  const directive = motion.activeDirective;
  if (directive === null) return true;
  return (
    typeof directive === "object" &&
    atlas.route !== null &&
    atlas.route.destinationId === directive.destinationId &&
    locationIds.has(directive.destinationId) &&
    ["explore-unseen", "avoid-immediate-reverse", "only-open-road", "least-recent"].includes(directive.reason) &&
    Number.isSafeInteger(directive.plannedTick) &&
    directive.plannedTick >= 0 &&
    directive.plannedTick <= state.tick
  );
}
