import { isValidCampaignBorrowedBell } from "./borrowed-bell-campaign";
import type { BellExpedition, BellTurnReceipt } from "./borrowed-bell";
import { selectPaidInnRest, type PaidInnRestPlan } from "./town-rest";
import { selectCriticalRoadsideRest, unresolvedRouteEncounterId, type CriticalRoadsideRestPlan } from "./roadside-rest";
import type { DepthState, RoutePlan } from "./types";

export type BellDeliveryRest = ({ readonly kind: "inn" } & PaidInnRestPlan)
  | ({ readonly kind: "roadside" } & CriticalRoadsideRestPlan);

export interface BellDeliveryMemory {
  readonly schemaVersion: 1;
  readonly rulesVersion: "bell-delivery-memory-v1";
  readonly instanceId: string;
  readonly heroId: string;
  readonly completionSourceCommandId: string;
  readonly completedTick: number;
  readonly evidenceSourceCommandId: string;
  readonly evidenceTick: number;
  readonly evidenceTurn: number;
  readonly kind: "late" | "parcel" | "inspection" | "precision" | "delivery";
  readonly rest: BellDeliveryRest;
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly line: string;
}

/** The existing paid-inn wait command, not a new free rest or reward command. */
export function bellDeliveryMemoryCommandId(tick: number, locationId: string, innId: string): string {
  return `depth:${tick}:town:${locationId}:inn-rest:${innId}`;
}

export function bellDeliveryRoadsideMemoryCommandId(tick: number): string {
  return `depth:${tick}:critical-roadside-recovery`;
}

export function bellDeliveryRestName(rest: BellDeliveryRest): string {
  return rest.kind === "inn" ? rest.innName : "Roadside camp";
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((item, index) => Object.hasOwn(actual, index) && exact(actual[index], item));
  if (record(expected)) return record(actual) && Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, item]) => Object.hasOwn(actual, key) && exact(actual[key], item));
  return actual === expected;
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function quietSoloRest(state: DepthState): boolean {
  return state.companions.active.length === 0 && state.hero.resources.health > 0
    && state.combat === null && state.counterDuel === null
    && state.repartee.active === null && (state.dungeon === null || state.dungeon.completed)
    && state.bellExpedition?.completion !== null && state.quest.status === "active"
    && state.pendingQuestReward === null;
}

function evidence(board: BellExpedition): { kind: BellDeliveryMemory["kind"]; move: BellTurnReceipt } | null {
  if (board.completion === null) return null;
  const last = board.turns.at(-1);
  if (last === undefined) return null;
  // Room labels and traversed cells are not evidence that their effects happened.
  const parcel = board.turns.find((move) => move.landing.kind === "parcel" && move.landing.goldGranted === 1);
  if (parcel !== undefined) return { kind: "parcel", move: parcel };
  if (board.completion.outcome === "late") return { kind: "late", move: last };
  const inspection = board.turns.find((move) => move.landing.kind === "inspection" && move.landing.routeNote !== null);
  if (inspection !== undefined) return { kind: "inspection", move: inspection };
  const precision = board.turns.find((move) => move.pace === "steady" && move.steadyCost === 1);
  if (precision !== undefined) return { kind: "precision", move: precision };
  return board.completion.outcome === "delivered" ? { kind: "delivery", move: last } : null;
}

function thought(kind: BellDeliveryMemory["kind"], board: BellExpedition): string {
  switch (kind) {
    case "late": return "I can still feel the clerk's stamp on my forehead. All that careful carrying, and I brought the bell back after the procession had gone.";
    case "parcel": return board.completion!.outcome === "late"
      ? "MISCELLANEOUS PARCEL. The bell was late; apparently its carrier was freight. Now I catch myself wondering whether I need a forwarding address."
      : "MISCELLANEOUS PARCEL. I made the deadline, yet here I am wondering whether I need a forwarding address.";
    case "inspection": return "A visiting hat. That is what the inspector called the bell. I got it back before closing, but that ridiculous name is the part I keep hearing.";
    case "precision": return "One spark of mana for one careful step. I made the deadline, but I keep thinking about how slowly I moved while the procession's clock kept going.";
    case "delivery": return "For once, I got something awkward where it belonged before the doors closed. I let myself enjoy that for a breath. The bell can do tomorrow's worrying.";
  }
}

function makeMemory(board: BellExpedition, rest: BellDeliveryRest, tick: number): BellDeliveryMemory | null {
  const recalled = evidence(board);
  if (recalled === null || board.completion === null) return null;
  return {
    schemaVersion: 1, rulesVersion: "bell-delivery-memory-v1", instanceId: board.instanceId, heroId: board.heroId,
    completionSourceCommandId: board.completion.sourceCommandId, completedTick: board.completion.tick,
    evidenceSourceCommandId: recalled.move.sourceCommandId, evidenceTick: recalled.move.tick, evidenceTurn: recalled.move.turn,
    kind: recalled.kind, rest: { ...rest }, sourceCommandId: rest.kind === "inn"
      ? bellDeliveryMemoryCommandId(tick, rest.locationId, rest.innId) : bellDeliveryRoadsideMemoryCommandId(tick),
    tick, line: thought(recalled.kind, board),
  };
}

/** Decorates an already legal rest. The selector neither admits nor performs a rest. */
export function selectBellDeliveryMemory(state: DepthState): BellDeliveryMemory | null {
  try {
    if (state.bellMemory !== null || !integer(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER
      || !quietSoloRest(state) || !isValidCampaignBorrowedBell(state)) return null;
    const board = state.bellExpedition;
    if (board === null || board.completion === null || board.completion.tick > state.tick) return null;
    const inn = selectPaidInnRest(state);
    if (inn !== null) return makeMemory(board, { kind: "inn", ...inn }, state.tick + 1);
    const camp = selectCriticalRoadsideRest(state);
    return camp === null || validRestRoute(state, camp.locationId, camp.route) === null ? null
      : makeMemory(board, { kind: "roadside", ...camp }, state.tick + 1);
  } catch { return null; }
}

/** Validate the frozen payment/recovery snapshot against the real retained inn and its existing rules.
 * Later growth changes current maximum resources, not the rest's recorded maximum at that time.
 */
function validRestRoute(state: DepthState, locationId: string, value: unknown): RoutePlan | null {
  if (!record(value) || Object.keys(value).length !== 6 || !Array.isArray(value.path)
    || value.path.length < 2 || value.path.length > state.atlas.locations.length
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
  if (!integer(total, 1) || total !== value.totalDistance || travelled !== value.distanceTravelled
    || value.legProgress >= edges[value.legIndex]!.distance) return null;
  return { destinationId: value.destinationId as string, path: [...path], legIndex: value.legIndex,
    legProgress: value.legProgress, distanceTravelled: value.distanceTravelled, totalDistance: value.totalDistance };
}

function validatedRest(state: DepthState, value: unknown): BellDeliveryRest | null {
  if (!record(value) || !integer(value.goldBefore) || !integer(value.goldAfter)
    || !integer(value.healthBefore, 1) || !integer(value.healthAfter, 1)
    || !integer(value.manaBefore) || !integer(value.manaAfter)
    || typeof value.locationId !== "string") return null;
  if (value.kind === "roadside") {
    const route = validRestRoute(state, value.locationId, value.route);
    if (route === null || value.healthBefore * 2 > value.healthAfter || value.manaBefore > value.manaAfter) return null;
    const rest: BellDeliveryRest = { kind: "roadside", locationId: value.locationId,
      encounterId: `encounter:route:${route.path.join(">")}`, route, goldBefore: value.goldBefore,
      goldSpent: 0, goldAfter: value.goldBefore, healthBefore: value.healthBefore,
      healthAfter: value.healthAfter, manaBefore: value.manaBefore, manaAfter: value.manaAfter };
    return exact(value, rest) ? rest : null;
  }
  if (value.kind !== "inn") return null;
  const historicalBoundary: DepthState = {
    ...state, atlas: { ...state.atlas, currentLocationId: value.locationId, route: null },
    companions: { ...state.companions, active: [] }, combat: null, counterDuel: null, dungeon: null,
    quest: { ...state.quest, status: "active" }, pendingQuestReward: null,
    hero: { ...state.hero, gold: value.goldBefore,
      resources: { ...state.hero.resources, health: value.healthBefore, maxHealth: value.healthAfter,
        mana: value.manaBefore, maxMana: value.manaAfter } },
  };
  const rest = selectPaidInnRest(historicalBoundary);
  return rest !== null && exact(value, { kind: "inn", ...rest }) ? { kind: "inn", ...rest } : null;
}

/** Keep the original private thought after travel, spending or growth; never rewrite its audience. */
export function isValidBellDeliveryMemory(state: DepthState): boolean {
  try {
    const value: unknown = state.bellMemory;
    if (value === null) return true;
    if (!record(value) || !integer(value.tick, 1) || !integer(state.tick) || value.tick > state.tick
      || !isValidCampaignBorrowedBell(state)) return false;
    const tick = value.tick;
    const board = state.bellExpedition;
    if (board === null || board.completion === null || value.tick <= board.completion.tick) return false;
    const rest = validatedRest(state, value.rest);
    if (rest === null) return false;
    const expected = makeMemory(board, rest, value.tick);
    if (expected === null || !exact(value, expected)) return false;
    // A later companion does not retroactively hear this private memory; someone already
    // travelling with the hero at its recorded tick would contradict its solo admission.
    if (state.companions.active.some((entry) => entry.joinedTick <= tick)
      || state.companions.former.some((entry) => entry.joinedTick <= tick && entry.departure.tick >= tick)) return false;
    if (value.tick < state.tick) return true;
    const samePlace = rest.kind === "inn" ? state.atlas.route === null
      : exact(state.atlas.route, rest.route) && unresolvedRouteEncounterId(state) === rest.encounterId;
    return quietSoloRest(state) && samePlace && state.atlas.currentLocationId === rest.locationId
      && state.hero.gold === rest.goldAfter && state.hero.resources.health === rest.healthAfter
      && state.hero.resources.maxHealth === rest.healthAfter && state.hero.resources.mana === rest.manaAfter
      && state.hero.resources.maxMana === rest.manaAfter;
  } catch { return false; }
}
