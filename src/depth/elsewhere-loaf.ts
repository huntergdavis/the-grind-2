import { randomInt } from "../core/rng";
import { isValidCompanionReferences, isValidFormerCompanion } from "./companion";
import type { DepthState, FormerCompanion } from "./types";

export type ElsewhereLoafStyle = "steady" | "experimental";
export type ElsewhereLoafOutcome = "plain-loaf" | "unexpected-delight" | "bricklike-loaf";
export interface ElsewhereLoaf {
  readonly schemaVersion: 1;
  readonly rulesVersion: "elsewhere-loaf-v1";
  readonly id: string;
  readonly heroId: string;
  readonly residentId: string;
  readonly companionName: string;
  readonly role: "baker";
  readonly joinedTick: number;
  readonly departureTick: number;
  readonly locationId: string;
  readonly innId: string;
  readonly innName: string;
  /** The new admission places this former companion at an inn in the recorded farewell town. */
  readonly presenceRule: "retained-farewell-inn-worksite-v1";
  /** Explicitly supplied by this new worksite, never removed from or granted to the hero. */
  readonly supplyRule: "inn-trial-dough-v1";
  readonly admission: {
    readonly tick: number;
    readonly triggerCommandId: string;
    readonly eventId: string;
    readonly heroLocationId: string;
    readonly style: ElsewhereLoafStyle;
    /** Private committed d6. The public admission packet must not contain this or a future result. */
    readonly ovenRoll: number;
    readonly doughProvided: 1;
    readonly doughAfter: 1;
    readonly line: string;
  };
  readonly completion: {
    readonly tick: number;
    readonly triggerCommandId: string;
    readonly eventId: string;
    readonly heroLocationId: string;
    readonly doughBefore: 1;
    readonly doughConsumed: 1;
    readonly doughAfter: 0;
    readonly productQuantity: 1;
    readonly outcome: ElsewhereLoafOutcome;
    readonly line: string;
  } | null;
}

function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function eligibleBaker(companion: FormerCompanion): boolean {
  return isValidFormerCompanion(companion) && companion.identity.role === "baker"
    && companion.departure.outcome === "fulfilled" && companion.injury === "none" && companion.resources.health > 0;
}
function identity(heroId: string, residentId: string, joinedTick: number, tick: number): string {
  return `elsewhere-loaf:${heroId}:${residentId}:${joinedTick}:${tick}`;
}
export function elsewhereLoafEventId(id: string, phase: "admission" | "completion"): string { return `${id}:${phase}`; }
function source(value: unknown, tick: number, heroLocationId: string, state: DepthState): value is string {
  // Released first-visit candidates intentionally predate the depth:T namespace.
  // Preserve their real ID rather than relabeling the hero's committed command.
  if (value === `town:${heroLocationId}`) {
    const town = state.towns[heroLocationId];
    return publicLocation(state, heroLocationId) && town !== undefined && town.locationId === heroLocationId
      && town.visits > 0 && state.atlas.locations.some(location => location.id === heroLocationId && location.kind === "town");
  }
  return typeof value === "string" && value.startsWith(`depth:${tick}:`) && value.length > `depth:${tick}:`.length
    && value.length <= 2048 && !/[\s\u0000-\u001f]/u.test(value);
}
function publicLocation(state: DepthState, locationId: unknown): locationId is string {
  return typeof locationId === "string" && state.atlas.discoveredLocationIds.includes(locationId)
    && state.atlas.locations.some(location => location.id === locationId);
}
function innAt(state: DepthState, locationId: string, innId: string) {
  const town = state.towns[locationId], inn = town?.buildings.find(building => building.id === innId && building.kind === "inn");
  return town !== undefined && town.locationId === locationId && town.visits > 0 && publicLocation(state, locationId)
    && state.atlas.locations.some(location => location.id === locationId && location.kind === "town")
    && inn !== undefined && town.districts.some(district => district.id === inn.districtId && district.buildingIds.includes(inn.id))
    ? inn : null;
}
function commitment(seed: string, id: string, tick: number): { style: ElsewhereLoafStyle; ovenRoll: number } {
  return { style: randomInt(2, seed, "elsewhere-loaf", id, tick, "baking-style-v1") === 0 ? "steady" : "experimental",
    ovenRoll: 1 + randomInt(6, seed, "elsewhere-loaf", id, tick, "oven-roll-v1") };
}
function admissionLine(style: ElsewhereLoafStyle): string {
  return style === "steady" ? "One batch of dough. A loaf with no ambitions beyond being lunch."
    : "One batch of dough. An unreasonable number of possibilities.";
}
/** A bounded original activity rule; role alone never asserts that this work already happened. */
export function elsewhereLoafResult(style: ElsewhereLoafStyle, ovenRoll: number): { outcome: ElsewhereLoafOutcome; line: string } {
  if ((style !== "steady" && style !== "experimental") || !integer(ovenRoll, 1) || ovenRoll > 6) throw new TypeError("Invalid loaf commitment");
  if (style === "steady") return { outcome: "plain-loaf", line: "A perfectly ordinary loaf. There are worse things to be at lunchtime." };
  return ovenRoll >= 4
    ? { outcome: "unexpected-delight", line: "It rose to the occasion. Higher than the baker intended." }
    : { outcome: "bricklike-loaf", line: "Excellent. A load-bearing loaf." };
}

const recordKeys = ["schemaVersion", "rulesVersion", "id", "heroId", "residentId", "companionName", "role", "joinedTick", "departureTick",
  "locationId", "innId", "innName", "presenceRule", "supplyRule", "admission", "completion"];
const admissionKeys = ["tick", "triggerCommandId", "eventId", "heroLocationId", "style", "ovenRoll", "doughProvided", "doughAfter", "line"];
const completionKeys = ["tick", "triggerCommandId", "eventId", "heroLocationId", "doughBefore", "doughConsumed", "doughAfter", "productQuantity", "outcome", "line"];

/** Stored hero-away facts outlive subsequent travel. Only a receipt created now checks current presence. */
export function isValidCampaignElsewhereLoaf(state: DepthState): boolean {
  try {
    if (!Object.hasOwn(state, "elsewhereLoaf")) return true;
    const value: unknown = state.elsewhereLoaf;
    if (!keys(value, recordKeys) || value.schemaVersion !== 1 || value.rulesVersion !== "elsewhere-loaf-v1"
      || value.heroId !== state.hero.id || value.role !== "baker" || value.presenceRule !== "retained-farewell-inn-worksite-v1"
      || value.supplyRule !== "inn-trial-dough-v1" || !integer(value.joinedTick, 1) || !integer(value.departureTick, 1)
      || !keys(value.admission, admissionKeys) || !integer(value.admission.tick, 1) || value.admission.tick > state.tick
      || !isValidCompanionReferences(state.companions, state.atlas, state.towns)) return false;
    const loaf = value as unknown as ElsewhereLoaf, admission = loaf.admission;
    const former = state.companions.former.find(entry => entry.identity.residentId === loaf.residentId && entry.joinedTick === loaf.joinedTick);
    const inn = innAt(state, loaf.locationId, loaf.innId), draw = commitment(state.seed, loaf.id, admission.tick);
    if (former === undefined || !eligibleBaker(former) || former.identity.name !== loaf.companionName
      || former.departure.tick !== loaf.departureTick || former.departure.locationId !== loaf.locationId
      || state.companions.active.some(entry => entry.identity.residentId === loaf.residentId)
      || loaf.departureTick >= admission.tick || inn === null || inn.name !== loaf.innName
      || loaf.id !== identity(loaf.heroId, loaf.residentId, loaf.joinedTick, admission.tick)
      || !source(admission.triggerCommandId, admission.tick, admission.heroLocationId, state) || admission.eventId !== elsewhereLoafEventId(loaf.id, "admission")
      || !publicLocation(state, admission.heroLocationId) || admission.heroLocationId === loaf.locationId
      || admission.style !== draw.style || admission.ovenRoll !== draw.ovenRoll
      || admission.doughProvided !== 1 || admission.doughAfter !== 1 || admission.line !== admissionLine(draw.style)) return false;
    if (admission.tick === state.tick && (state.hero.resources.health <= 0 || state.atlas.currentLocationId !== admission.heroLocationId)) return false;
    if (loaf.completion === null) return true;
    const completed = loaf.completion, result = elsewhereLoafResult(draw.style, draw.ovenRoll);
    if (!keys(completed, completionKeys) || !integer(completed.tick, 1) || completed.tick <= admission.tick || completed.tick > state.tick
      || !source(completed.triggerCommandId, completed.tick, completed.heroLocationId, state) || completed.eventId !== elsewhereLoafEventId(loaf.id, "completion")
      || !publicLocation(state, completed.heroLocationId) || completed.heroLocationId === loaf.locationId
      || completed.doughBefore !== 1 || completed.doughConsumed !== 1 || completed.doughAfter !== 0 || completed.productQuantity !== 1
      || completed.outcome !== result.outcome || completed.line !== result.line) return false;
    return completed.tick !== state.tick || state.hero.resources.health > 0 && state.atlas.currentLocationId === completed.heroLocationId;
  } catch { return false; }
}

/** Observe an already committed, source-validated hero command. No hero state or log is changed here. */
export function advanceElsewhereLoaf(before: DepthState, after: DepthState, triggerCommandId: string): ElsewhereLoaf | undefined {
  if (!isValidCampaignElsewhereLoaf(before) || !isValidCampaignElsewhereLoaf(after)
    || !integer(before.tick) || after.tick !== before.tick + 1 || before.seed !== after.seed || before.hero.id !== after.hero.id
    || !source(triggerCommandId, after.tick, after.atlas.currentLocationId, after)) throw new TypeError("Invalid Elsewhere Loaf observer source");
  const existing = before.elsewhereLoaf;
  if (existing?.completion != null || after.hero.resources.health <= 0) return existing;
  if (existing !== undefined) {
    if (after.atlas.currentLocationId === existing.locationId) return existing;
    return { ...existing, completion: { tick: after.tick, triggerCommandId,
      eventId: elsewhereLoafEventId(existing.id, "completion"), heroLocationId: after.atlas.currentLocationId,
      doughBefore: 1, doughConsumed: 1, doughAfter: 0, productQuantity: 1,
      ...elsewhereLoafResult(existing.admission.style, existing.admission.ovenRoll) } };
  }
  if (!isValidCompanionReferences(after.companions, after.atlas, after.towns)) return undefined;
  const former = [...after.companions.former].filter(entry => eligibleBaker(entry) && entry.departure.tick < after.tick
    && entry.departure.locationId !== after.atlas.currentLocationId
    && !after.companions.active.some(active => active.identity.residentId === entry.identity.residentId))
    .sort((a, b) => a.departure.tick - b.departure.tick || compare(a.identity.residentId, b.identity.residentId) || a.joinedTick - b.joinedTick);
  for (const baker of former) {
    const locationId = baker.departure.locationId;
    const inn = after.towns[locationId]?.buildings.filter(building => innAt(after, locationId, building.id) !== null)
      .sort((a, b) => compare(a.id, b.id))[0];
    if (inn === undefined) continue;
    const id = identity(after.hero.id, baker.identity.residentId, baker.joinedTick, after.tick), draw = commitment(after.seed, id, after.tick);
    return { schemaVersion: 1, rulesVersion: "elsewhere-loaf-v1", id, heroId: after.hero.id,
      residentId: baker.identity.residentId, companionName: baker.identity.name, role: "baker", joinedTick: baker.joinedTick,
      departureTick: baker.departure.tick, locationId, innId: inn.id, innName: inn.name,
      presenceRule: "retained-farewell-inn-worksite-v1", supplyRule: "inn-trial-dough-v1",
      admission: { tick: after.tick, triggerCommandId, eventId: elsewhereLoafEventId(id, "admission"),
        heroLocationId: after.atlas.currentLocationId, ...draw, doughProvided: 1, doughAfter: 1, line: admissionLine(draw.style) }, completion: null };
  }
  return undefined;
}
