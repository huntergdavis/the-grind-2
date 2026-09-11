import { advanceRoute, edgeBetween, orientedEdgePath } from "./atlas";
import { unresolvedRouteEncounterId } from "./roadside-rest";
import type { AtlasState, DepthCommand, DepthState, RoutePlan } from "./types";

export interface PennywiseGateSite {
  readonly edgeId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly nearPointIndex: number;
  readonly farPointIndex: number;
  readonly nearProgress: number;
  readonly farProgress: number;
}
interface GateGoldReceipt {
  readonly goldBefore: number;
  readonly goldSpent: 0 | 2;
  readonly goldAfter: number;
}
export interface PennywiseGate {
  readonly schemaVersion: 1;
  readonly rulesVersion: "pennywise-gate-v1";
  readonly gateId: string;
  readonly heroId: string;
  readonly site: PennywiseGateSite;
  readonly arrival: {
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly routeBefore: RoutePlan;
    readonly routeAtGate: RoutePlan;
    readonly distance: number;
  };
  readonly choice: ({ readonly kind: "pay" | "lift"; readonly tick: number; readonly sourceCommandId: string } & GateGoldReceipt) | null;
  readonly completion: ({ readonly tick: number; readonly sourceCommandId: string; readonly routeAfter: RoutePlan;
    readonly distance: number; readonly line: string } & GateGoldReceipt) | null;
}
export interface PennywiseGateApproach {
  readonly site: PennywiseGateSite;
  readonly approachDistance: number;
}
export interface PennywiseGateChoice {
  readonly choice: "pay" | "lift";
  readonly label: string;
  readonly goldCost: 0 | 2;
  readonly actions: 1 | 2;
}
type GateCommand = Extract<DepthCommand, { type: "choose-pennywise-gate" | "pass-pennywise-gate" }>;
const routeKeys = ["destinationId", "path", "legIndex", "legProgress", "distanceTravelled", "totalDistance"];
const siteKeys = ["edgeId", "fromLocationId", "toLocationId", "nearPointIndex", "farPointIndex", "nearProgress", "farProgress"];
function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function sameRoute(left: RoutePlan | null, right: RoutePlan | null): boolean {
  return left === null || right === null ? left === right : left.destinationId === right.destinationId
    && left.legIndex === right.legIndex && left.legProgress === right.legProgress
    && left.distanceTravelled === right.distanceTravelled && left.totalDistance === right.totalDistance
    && left.path.length === right.path.length && left.path.every((id, index) => right.path[index] === id);
}
function copyRoute(route: RoutePlan): RoutePlan { return { ...route, path: [...route.path] }; }
function routeAt(atlas: AtlasState, route: RoutePlan): AtlasState {
  return { ...atlas, currentLocationId: route.path[route.legIndex]!, route };
}
function validRoute(atlas: AtlasState, value: unknown): value is RoutePlan {
  if (!keys(value, routeKeys) || !Array.isArray(value.path) || value.path.length < 2
    || value.path.length > atlas.locations.length || new Set(value.path).size !== value.path.length
    || !value.path.every((id) => typeof id === "string" && atlas.locations.some((location) => location.id === id))
    || value.path.at(-1) !== value.destinationId || !integer(value.legIndex) || value.legIndex >= value.path.length - 1
    || !integer(value.legProgress) || !integer(value.distanceTravelled) || !integer(value.totalDistance, 1)) return false;
  const path = value.path as string[];
  const edges = path.slice(1).map((to, index) => edgeBetween(atlas, path[index]!, to));
  return value.totalDistance === edges.reduce((sum, edge) => sum + edge.distance, 0)
    && value.legProgress < edges[value.legIndex]!.distance
    && value.distanceTravelled === edges.slice(0, value.legIndex).reduce((sum, edge) => sum + edge.distance, 0) + value.legProgress;
}
/** First real interior pair still ahead on this leg. This establishes new road
 * content; neither point claims an old gate, settlement, or river crossing. */
function approachOnRoute(atlas: AtlasState, route: RoutePlan): PennywiseGateApproach | null {
  const from = route.path[route.legIndex], to = route.path[route.legIndex + 1];
  if (from === undefined || to === undefined) return null;
  const edge = edgeBetween(atlas, from, to), path = orientedEdgePath(edge, from);
  for (let index = 1; index + 1 < path.pointIndices.length - 1; index += 1) {
    const nearProgress = path.distances[index]!, farProgress = path.distances[index + 1]!;
    if (nearProgress <= route.legProgress) continue;
    return { site: { edgeId: edge.id, fromLocationId: from, toLocationId: to,
      nearPointIndex: path.pointIndices[index]!, farPointIndex: path.pointIndices[index + 1]!, nearProgress, farProgress },
    approachDistance: nearProgress - route.legProgress };
  }
  return null;
}
function safeRoad(state: DepthState): boolean {
  return state.atlas.route !== null && state.hero.resources.health > 0 && state.companions.active.length === 0
    && state.combat === null && state.counterDuel === null && (state.dungeon === null || state.dungeon.completed)
    && state.repartee.active === null && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && (state.companionReunion === null || state.companionReunion.completed !== null)
    && (state.companionCredit == null || state.companionCredit.exchange !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null && unresolvedRouteEncounterId(state) === null;
}
function gateIdentity(heroId: string, tick: number, site: PennywiseGateSite): string {
  return `pennywise-gate:${heroId}:${tick}:${site.edgeId}:${site.nearPointIndex}>${site.farPointIndex}`;
}
export function pennywiseGateCommandId(tick: number, command: GateCommand): string {
  return `depth:${tick}:pennywise-gate:${command.gateId}:${command.type === "pass-pennywise-gate" ? "pass" : `choose:${command.choice}`}`;
}
export function pennywiseGateLine(choice: "pay" | "lift"): string {
  return choice === "pay" ? "Two gold, and not a splinter on my dignity." : "Free passage. Some lifting required.";
}
export function selectPennywiseGateApproach(state: DepthState): PennywiseGateApproach | null {
  if (state.pennywiseGate != null || !safeRoad(state) || !integer(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER
    || !validRoute(state.atlas, state.atlas.route)) return null;
  return approachOnRoute(state.atlas, state.atlas.route);
}

/** Only a committed ordinary travel step can establish this campaign's gate. */
export function capturePennywiseGateArrival(before: DepthState, after: DepthState,
  command: Extract<DepthCommand, { type: "travel" }>): PennywiseGate | null {
  if (before.pennywiseGate != null) return before.pennywiseGate;
  const approach = selectPennywiseGateApproach(before);
  if (approach === null || command.distance !== approach.approachDistance || after.tick !== before.tick + 1
    || before.hero.id !== after.hero.id || !safeRoad(after) || after.atlas.route === null
    || after.atlas.currentLocationId !== before.atlas.currentLocationId) return null;
  const expected = advanceRoute(before.atlas, command.distance);
  if (!sameRoute(expected.route, after.atlas.route)) return null;
  return { schemaVersion: 1, rulesVersion: "pennywise-gate-v1",
    gateId: gateIdentity(after.hero.id, after.tick, approach.site), heroId: after.hero.id, site: approach.site,
    arrival: { tick: after.tick, sourceCommandId: `depth:${after.tick}:travel:${command.distance}`,
      routeBefore: copyRoute(before.atlas.route!), routeAtGate: copyRoute(after.atlas.route), distance: command.distance },
    choice: null, completion: null };
}
function validGold(value: GateGoldReceipt, cost: 0 | 2): boolean {
  return integer(value.goldBefore) && integer(value.goldAfter) && value.goldSpent === cost
    && value.goldBefore >= cost && value.goldAfter === value.goldBefore - cost;
}
/** History is bound to immutable atlas geometry and its own route instance, not
 * the later active route, balance, or a recurring route encounter ID. */
export function isValidCampaignPennywiseGate(state: DepthState): boolean {
  try {
    const value: unknown = state.pennywiseGate;
    if (value === undefined) return !Object.prototype.hasOwnProperty.call(state, "pennywiseGate");
    if (value === null) return true;
    if (!keys(value, ["schemaVersion", "rulesVersion", "gateId", "heroId", "site", "arrival", "choice", "completion"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "pennywise-gate-v1" || value.heroId !== state.hero.id
      || !keys(value.site, siteKeys) || !keys(value.arrival, ["tick", "sourceCommandId", "routeBefore", "routeAtGate", "distance"])) return false;
    const gate = value as unknown as PennywiseGate, arrival = gate.arrival;
    if (!integer(arrival.tick, 1) || arrival.tick > state.tick || !integer(arrival.distance, 1)
      || !validRoute(state.atlas, arrival.routeBefore) || !validRoute(state.atlas, arrival.routeAtGate)
      || arrival.sourceCommandId !== `depth:${arrival.tick}:travel:${arrival.distance}`) return false;
    const approach = approachOnRoute(state.atlas, arrival.routeBefore);
    if (approach === null || arrival.distance !== approach.approachDistance
      || siteKeys.some((key) => gate.site[key as keyof PennywiseGateSite] !== approach.site[key as keyof PennywiseGateSite])
      || gate.gateId !== gateIdentity(gate.heroId, arrival.tick, gate.site)
      || !sameRoute(advanceRoute(routeAt(state.atlas, arrival.routeBefore), arrival.distance).route, arrival.routeAtGate)) return false;
    const choice = gate.choice, completed = gate.completion;
    if (choice === null) {
      if (completed !== null) return false;
    } else {
      if (!keys(choice, ["kind", "tick", "sourceCommandId", "goldBefore", "goldSpent", "goldAfter"])
        || (choice.kind !== "pay" && choice.kind !== "lift") || !integer(choice.tick, 1)
        || choice.tick !== arrival.tick + 1 || choice.tick > state.tick || !validGold(choice, choice.kind === "pay" ? 2 : 0)
        || choice.sourceCommandId !== pennywiseGateCommandId(choice.tick, { type: "choose-pennywise-gate", gateId: gate.gateId, choice: choice.kind })) return false;
      if (choice.kind === "pay" && completed === null) return false;
      if (choice.tick === state.tick && state.hero.gold !== choice.goldAfter) return false;
    }
    if (completed !== null) {
      if (choice === null || !keys(completed, ["tick", "sourceCommandId", "routeAfter", "distance", "goldBefore", "goldSpent", "goldAfter", "line"])
        || !integer(completed.tick, 1) || completed.tick > state.tick
        || completed.distance !== gate.site.farProgress - gate.site.nearProgress
        || !validRoute(state.atlas, completed.routeAfter)
        || !sameRoute(advanceRoute(routeAt(state.atlas, arrival.routeAtGate), completed.distance).route, completed.routeAfter)
        || completed.line !== pennywiseGateLine(choice.kind) || !validGold(completed, choice.kind === "pay" ? 2 : 0)) return false;
      if (choice.kind === "pay") {
        if (completed.tick !== choice.tick || completed.sourceCommandId !== choice.sourceCommandId
          || completed.goldBefore !== choice.goldBefore || completed.goldAfter !== choice.goldAfter) return false;
      } else if (completed.tick !== choice.tick + 1 || completed.goldBefore !== choice.goldAfter
        || completed.sourceCommandId !== pennywiseGateCommandId(completed.tick,
        { type: "pass-pennywise-gate", gateId: gate.gateId })) return false;
      if (completed.tick < state.tick) return true;
      return safeRoad(state) && state.hero.gold === completed.goldAfter
        && state.atlas.currentLocationId === gate.site.fromLocationId && sameRoute(state.atlas.route, completed.routeAfter);
    }
    // Admission follows owed work. Once reached, the finite gate sequence is
    // atomic: choose next, then pass next if lifted; no off-screen interleaving.
    return state.tick === (choice === null ? arrival.tick : choice.tick) && safeRoad(state)
      && state.atlas.currentLocationId === gate.site.fromLocationId && sameRoute(state.atlas.route, arrival.routeAtGate);
  } catch { return false; }
}
export function selectPennywiseGate(state: DepthState): PennywiseGate | null {
  const gate = state.pennywiseGate;
  return gate == null || gate.completion !== null || !safeRoad(state) || !integer(state.tick)
    || state.tick >= Number.MAX_SAFE_INTEGER || !isValidCampaignPennywiseGate(state) ? null : gate;
}
export function pennywiseGateChoices(state: DepthState): readonly PennywiseGateChoice[] {
  const gate = selectPennywiseGate(state);
  if (gate === null || gate.choice !== null) return [];
  return [
    ...(state.hero.gold >= 2 ? [{ choice: "pay" as const, label: "pay two gold and pass the gate", goldCost: 2 as const, actions: 1 as const }] : []),
    { choice: "lift", label: "lift the barrier, then walk through", goldCost: 0, actions: 2 },
  ];
}
export function stepPennywiseGate(state: DepthState, command: GateCommand): { pennywiseGate: PennywiseGate; atlas: AtlasState; gold: number } {
  const gate = selectPennywiseGate(state);
  if (gate === null || gate.gateId !== command.gateId) throw new Error("No matching road gate is available");
  const tick = state.tick + 1, sourceCommandId = pennywiseGateCommandId(tick, command);
  if (command.type === "choose-pennywise-gate") {
    if (gate.choice !== null || !pennywiseGateChoices(state).some((choice) => choice.choice === command.choice))
      throw new Error("That gate choice is not available");
    const goldSpent = command.choice === "pay" ? 2 : 0;
    const choice = { kind: command.choice, tick, sourceCommandId, goldBefore: state.hero.gold, goldSpent, goldAfter: state.hero.gold - goldSpent } as const;
    if (command.choice === "lift") return { pennywiseGate: { ...gate, choice }, atlas: state.atlas, gold: state.hero.gold };
    const distance = gate.site.farProgress - gate.site.nearProgress, atlas = advanceRoute(state.atlas, distance);
    if (atlas.route === null) throw new Error("Gate passage cannot become a settlement arrival");
    return { pennywiseGate: { ...gate, choice, completion: { tick, sourceCommandId, routeAfter: copyRoute(atlas.route), distance,
      goldBefore: choice.goldBefore, goldSpent, goldAfter: choice.goldAfter, line: pennywiseGateLine("pay") } }, atlas, gold: choice.goldAfter };
  }
  if (command.type !== "pass-pennywise-gate" || gate.choice?.kind !== "lift") throw new Error("The barrier has not been lifted");
  const distance = gate.site.farProgress - gate.site.nearProgress, atlas = advanceRoute(state.atlas, distance);
  if (atlas.route === null) throw new Error("Gate passage cannot become a settlement arrival");
  return { pennywiseGate: { ...gate, completion: { tick, sourceCommandId, routeAfter: copyRoute(atlas.route), distance,
    goldBefore: state.hero.gold, goldSpent: 0, goldAfter: state.hero.gold, line: pennywiseGateLine("lift") } }, atlas, gold: state.hero.gold };
}
