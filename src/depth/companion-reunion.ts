import { advanceRoute, planRoute } from "./atlas";
import { isValidCompanionReferences, isValidFormerCompanion } from "./companion";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthState, FormerCompanion, RoutePlan } from "./types";

export interface CompanionReunion {
  readonly schemaVersion: 1;
  readonly rulesVersion: "companion-reunion-v1";
  readonly heroId: string;
  readonly residentId: string;
  readonly companionName: string;
  readonly joinedTick: number;
  readonly departureTick: number;
  readonly locationId: string;
  /** No off-screen journey home: this finite rule retains the last proven location. */
  readonly presenceRule: "retained-at-farewell-v1";
  readonly sharedVictories: number;
  readonly arrival: {
    readonly sourceCommandId: string;
    readonly tick: number;
    readonly sourceLocationId: string;
    readonly route: RoutePlan;
    readonly distance: number;
  };
  readonly completed: {
    readonly sourceCommandId: string;
    readonly tick: number;
    readonly heroLine: string;
    readonly companionLine: string;
  } | null;
}
type ReunionCommand = Extract<DepthCommand, { type: "reunite-companion" }>;
export interface CompanionReturn {
  readonly residentId: string;
  readonly joinedTick: number;
  readonly companionName: string;
  readonly locationId: string;
  readonly locationName: string;
}
function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...names].sort().join(",");
}
function healthyFormer(entry: FormerCompanion): boolean {
  return isValidFormerCompanion(entry) && entry.departure.outcome === "fulfilled"
    && entry.resources.health > 0 && entry.injury === "none";
}
function orderedFormer(state: DepthState): readonly FormerCompanion[] {
  return [...state.companions.former].filter(healthyFormer).sort((a, b) =>
    a.departure.tick - b.departure.tick || (a.identity.residentId < b.identity.residentId ? -1 : a.identity.residentId > b.identity.residentId ? 1 : 0)
    || a.joinedTick - b.joinedTick);
}
function quietSolo(state: DepthState): boolean {
  return state.companions.active.length === 0 && state.hero.resources.health > 0
    && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed) && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
export function companionReunionLines(sharedVictories: number): { heroLine: string; companionLine: string } {
  return {
    heroLine: "My boots remembered the way. I am glad the rest of me came along.",
    companionLine: sharedVictories === 0
      ? "You kept your word and brought me here. A hello is a fine reason to return."
      : sharedVictories === 1
        ? "One shared victory. I am glad this time we can simply say hello."
        : `${sharedVictories} victories together. I am glad this time we can simply say hello.`,
  };
}
export function companionReunionCommandId(atTick: number, command: ReunionCommand): string {
  return `depth:${atTick}:reunite-companion:${command.residentId}:${command.joinedTick}:${command.arrivalTick}`;
}

/** Only the lowest-priority ordinary-route opportunity uses this selector.
 * It does not travel, bypass a dungeon, or claim that arrival already happened.
 */
export function selectCompanionReturn(state: DepthState): CompanionReturn | null {
  if (state.companionReunion !== null || !quietSolo(state) || selectPaidInnRest(state) !== null
    || !isValidCompanionReferences(state.companions, state.atlas, state.towns)) return null;
  for (const former of orderedFormer(state)) {
    const locationId = former.departure.locationId;
    if (former.departure.tick >= state.tick || locationId === state.atlas.currentLocationId) continue;
    const location = state.atlas.locations.find((entry) => entry.id === locationId && entry.kind === "town");
    if (location === undefined || !state.atlas.discoveredLocationIds.includes(locationId)
      || planRoute(state.atlas, locationId).route === null) continue;
    return { residentId: former.identity.residentId, joinedTick: former.joinedTick,
      companionName: former.identity.name, locationId, locationName: location.name };
  }
  return null;
}

/** A bounded snapshot of the real final travel command, checked against atlas edges. */
function validArrivalRoute(state: DepthState, locationId: string, value: unknown): RoutePlan | null {
  if (!keys(value, ["destinationId", "path", "legIndex", "legProgress", "distanceTravelled", "totalDistance"])
    || !Array.isArray(value.path) || value.path.length < 2 || value.path.length > state.atlas.locations.length
    || !value.path.every((id) => typeof id === "string" && state.atlas.locations.some((entry) => entry.id === id))
    || new Set(value.path).size !== value.path.length || value.path.at(-1) !== value.destinationId
    || !integer(value.legIndex) || value.legIndex >= value.path.length - 1 || value.path[value.legIndex] !== locationId
    || !integer(value.legProgress) || !integer(value.distanceTravelled) || !integer(value.totalDistance, 1)
    || !state.atlas.discoveredLocationIds.includes(locationId)) return null;
  const path = value.path as string[];
  const edges = path.slice(1).map((to, index) => state.atlas.edges.find((edge) =>
    edge.from === path[index] && edge.to === to || edge.to === path[index] && edge.from === to));
  if (edges.some((edge) => edge === undefined || !integer(edge.distance, 1))) return null;
  const total = edges.reduce((sum, edge) => sum + edge!.distance, 0);
  const travelled = edges.slice(0, value.legIndex).reduce((sum, edge) => sum + edge!.distance, 0) + value.legProgress;
  if (!integer(total, 1) || value.totalDistance !== total || travelled !== value.distanceTravelled
    || value.legProgress >= edges[value.legIndex]!.distance) return null;
  return { destinationId: value.destinationId as string, path: [...path], legIndex: value.legIndex,
    legProgress: value.legProgress, distanceTravelled: value.distanceTravelled, totalDistance: value.totalDistance };
}

export function captureCompanionReunionArrival(before: DepthState, after: DepthState,
  command: Extract<DepthCommand, { type: "travel" }>): CompanionReunion | null {
  if (before.companionReunion !== null) return before.companionReunion;
  if (!integer(command.distance, 1) || !integer(before.tick) || after.tick !== before.tick + 1
    || before.hero.id !== after.hero.id || before.companions.active.length !== 0 || !quietSolo(after)
    || before.atlas.currentLocationId === after.atlas.currentLocationId
    || !isValidCompanionReferences(after.companions, after.atlas, after.towns)) return null;
  const route = validArrivalRoute(before, before.atlas.currentLocationId, before.atlas.route);
  if (route === null || route.destinationId !== after.atlas.currentLocationId) return null;
  const replay = advanceRoute(before.atlas, command.distance);
  if (replay.route !== null || replay.currentLocationId !== after.atlas.currentLocationId) return null;
  const former = orderedFormer(after).find((entry) => entry.departure.locationId === after.atlas.currentLocationId
    && entry.departure.tick < after.tick);
  if (former === undefined) return null;
  return { schemaVersion: 1, rulesVersion: "companion-reunion-v1", heroId: after.hero.id,
    residentId: former.identity.residentId, companionName: former.identity.name, joinedTick: former.joinedTick,
    departureTick: former.departure.tick, locationId: former.departure.locationId,
    presenceRule: "retained-at-farewell-v1", sharedVictories: former.victories,
    arrival: { sourceCommandId: `depth:${after.tick}:travel:${command.distance}`, tick: after.tick,
      sourceLocationId: before.atlas.currentLocationId, route, distance: command.distance }, completed: null };
}

export function isValidCampaignCompanionReunion(state: DepthState): boolean {
  try {
    const value: unknown = state.companionReunion;
    if (value === null) return true;
    if (!keys(value, ["schemaVersion", "rulesVersion", "heroId", "residentId", "companionName", "joinedTick", "departureTick", "locationId", "presenceRule", "sharedVictories", "arrival", "completed"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "companion-reunion-v1" || value.presenceRule !== "retained-at-farewell-v1"
      || value.heroId !== state.hero.id || !integer(value.joinedTick, 1) || !integer(value.departureTick, 1) || !integer(value.sharedVictories)
      || !keys(value.arrival, ["sourceCommandId", "tick", "sourceLocationId", "route", "distance"])
      || !integer(value.arrival.tick, 1) || !integer(value.arrival.distance, 1)
      || !isValidCompanionReferences(state.companions, state.atlas, state.towns)) return false;
    const reunion = value as unknown as CompanionReunion, arrival = reunion.arrival;
    const former = state.companions.former.find((entry) => entry.identity.residentId === reunion.residentId && entry.joinedTick === reunion.joinedTick);
    if (former === undefined || !healthyFormer(former) || former.identity.name !== reunion.companionName
      || former.departure.tick !== reunion.departureTick || former.departure.locationId !== reunion.locationId
      || former.victories !== reunion.sharedVictories || reunion.departureTick >= arrival.tick || arrival.tick > state.tick
      || arrival.sourceLocationId === reunion.locationId || !state.atlas.discoveredLocationIds.includes(reunion.locationId)
      || !state.atlas.locations.some((entry) => entry.id === reunion.locationId && entry.kind === "town")
      || arrival.sourceCommandId !== `depth:${arrival.tick}:travel:${arrival.distance}`) return false;
    const route = validArrivalRoute(state, arrival.sourceLocationId, arrival.route);
    if (route === null || route.destinationId !== reunion.locationId) return false;
    const replay = advanceRoute({ ...state.atlas, currentLocationId: arrival.sourceLocationId, route }, arrival.distance);
    if (replay.route !== null || replay.currentLocationId !== reunion.locationId) return false;
    if (reunion.completed !== null) {
      const completed = reunion.completed, lines = companionReunionLines(reunion.sharedVictories);
      if (!keys(completed, ["sourceCommandId", "tick", "heroLine", "companionLine"]) || !integer(completed.tick, 1)
        || completed.tick <= arrival.tick || completed.tick > state.tick
        || completed.sourceCommandId !== companionReunionCommandId(completed.tick, { type: "reunite-companion", residentId: reunion.residentId, joinedTick: reunion.joinedTick, arrivalTick: arrival.tick })
        || completed.heroLine !== lines.heroLine || completed.companionLine !== lines.companionLine) return false;
      if (completed.tick < state.tick) return true;
      return quietSolo(state) && selectPaidInnRest(state) === null && state.atlas.currentLocationId === reunion.locationId;
    }
    // Owed recovery and quest settlement may occur after arrival, before speaking.
    return state.companions.active.length === 0 && state.atlas.route === null && state.atlas.currentLocationId === reunion.locationId;
  } catch { return false; }
}

export function selectCompanionReunion(state: DepthState): NonNullable<CompanionReunion["completed"]> | null {
  const reunion = state.companionReunion;
  if (reunion === null || reunion.completed !== null || !integer(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER
    || !isValidCampaignCompanionReunion(state) || !quietSolo(state) || selectPaidInnRest(state) !== null) return null;
  const atTick = state.tick + 1;
  return { sourceCommandId: companionReunionCommandId(atTick, { type: "reunite-companion", residentId: reunion.residentId,
    joinedTick: reunion.joinedTick, arrivalTick: reunion.arrival.tick }), tick: atTick, ...companionReunionLines(reunion.sharedVictories) };
}

export function stepCampaignCompanionReunion(state: DepthState, command: ReunionCommand): CompanionReunion {
  const reunion = state.companionReunion, completed = selectCompanionReunion(state);
  if (reunion === null || completed === null || command.residentId !== reunion.residentId || command.joinedTick !== reunion.joinedTick
    || command.arrivalTick !== reunion.arrival.tick) throw new Error("No matching earned companion reunion is available");
  return { ...reunion, completed };
}
