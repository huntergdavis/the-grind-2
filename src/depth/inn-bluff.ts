import { randomInt } from "../core/rng";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthState } from "./types";

export type InnBluffChoice = "challenge" | "decline";
export type InnBluffTell = "fidgeting" | "steady";
export type InnBluffOutcome = "exposed-bluff" | "honest-claim" | "declined";
export interface InnBluffVenue {
  readonly bluffId: string;
  readonly locationId: string;
  readonly innId: string;
  readonly innName: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly residentRole: string;
}
export interface InnBluff extends InnBluffVenue {
  readonly schemaVersion: 1;
  readonly rulesVersion: "cup-exaggeration-v1";
  readonly contentVersion: 1;
  readonly heroId: string;
  /** This command seats both actors; association alone is not a prior schedule. */
  readonly presenceRule: "admitted-together-v1";
  readonly admission: {
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly goldBefore: number;
    /** Private until the second command reveals it. Never pass to actor policy. */
    readonly face: number;
    readonly tell: InnBluffTell;
  };
  readonly resolution: {
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly choice: InnBluffChoice;
    readonly revealedFace: number;
    readonly outcome: InnBluffOutcome;
    readonly goldBefore: number;
    readonly goldSpent: 0 | 1;
    readonly goldReturned: 0 | 2;
    readonly goldAfter: number;
    readonly line: string;
  } | null;
}
export interface InnBluffDecision extends InnBluffVenue {
  readonly heroId: string;
  readonly tick: number;
  readonly sourceCommandId: string;
  readonly claim: string;
  readonly tell: InnBluffTell;
  readonly tellText: string;
  readonly tellAccuracy: "two-in-three";
  readonly gold: number;
  readonly choices: readonly {
    readonly choice: InnBluffChoice;
    readonly label: string;
    readonly goldCost: 0 | 1;
  }[];
}
export const innBluffClaim = "At least four. A thoroughly respectable number.";
export function innBluffTellText(tell: InnBluffTell): string {
  return tell === "fidgeting" ? "A thumb keeps finding the rim of the cup." : "The hand leaves the cup alone.";
}
type BluffCommand = Extract<DepthCommand, { type: "start-inn-bluff" | "resolve-inn-bluff" }>;
function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function compareIds(a: { id: string }, b: { id: string }): number { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
function bluffIdentity(heroId: string, tick: number, innId: string, residentId: string): string {
  return `inn-bluff:${heroId}:${tick}:${innId}:${residentId}`;
}
export function innBluffCommandId(tick: number, command: BluffCommand): string {
  return `depth:${tick}:inn-bluff:${command.bluffId}:${command.type === "start-inn-bluff"
    ? `start:${command.innId}:${command.residentId}` : `resolve:${command.choice}`}`;
}
/** Uniform d6; an independent three-way draw makes two tells accurate and one
 * misleading. Accuracy is a public rule, never a guarantee about this cup. */
function commitment(seed: string, bluffId: string, tick: number): { face: number; tell: InnBluffTell } {
  const face = 1 + randomInt(6, seed, "inn-bluff", bluffId, tick, "cup-face");
  const accurate = randomInt(3, seed, "inn-bluff", bluffId, tick, "tell-fidelity") < 2;
  const suggestsBluff = accurate ? face < 4 : face >= 4;
  return { face, tell: suggestsBluff ? "fidgeting" : "steady" };
}
function resolution(choice: InnBluffChoice, face: number): {
  outcome: InnBluffOutcome; goldSpent: 0 | 1; goldReturned: 0 | 2; line: string;
} {
  if (choice === "decline") return { outcome: "declined", goldSpent: 0, goldReturned: 0,
    line: "I decline to invest in the cup's reputation." };
  return face < 4
    ? { outcome: "exposed-bluff", goldSpent: 1, goldReturned: 2, line: "The cup had been speaking above its means." }
    : { outcome: "honest-claim", goldSpent: 1, goldReturned: 0, line: "My suspicion was free. The explanation was not." };
}
function quietTown(state: DepthState): boolean {
  return state.hero.resources.health > 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.companions.active.length === 0 && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed) && state.repartee.active === null
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && (state.usefulReply === null || state.usefulReply.reply !== null)
    && (state.roomChallenge === null || state.roomChallenge.result !== null)
    && (state.companionReunion === null || state.companionReunion.completed !== null)
    && (state.companionCredit == null || state.companionCredit.exchange !== null)
    && (state.pennywiseGate == null || state.pennywiseGate.completion !== null)
    && (state.smithyJob == null || state.smithyJob.completion !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function localResident(state: DepthState, residentId: string): boolean {
  return ![...state.companions.active, ...state.companions.former].some(entry => entry.identity.residentId === residentId);
}
/** Retained association proves the recorded host, not their whereabouts years later. */
function realVenue(state: DepthState, locationId: string, innId: string, residentId: string): Omit<InnBluffVenue, "bluffId"> | null {
  const town = state.towns[locationId], inn = town?.buildings.find(entry => entry.id === innId);
  if (!state.atlas.locations.some(location => location.id === locationId && location.kind === "town")
    || !state.atlas.discoveredLocationIds.includes(locationId) || town === undefined || town.locationId !== locationId
    || !integer(town.visits, 1) || inn?.kind !== "inn"
    || !town.districts.some(district => district.id === inn.districtId && district.buildingIds.includes(innId))) return null;
  const resident = town.residents.find(entry => entry.id === residentId && entry.homeBuildingId === innId && inn.residentIds.includes(entry.id));
  if (resident === undefined || resident.id === state.hero.id) return null;
  return { locationId, innId, innName: inn.name, residentId, residentName: resident.name, residentRole: resident.role };
}
export function selectInnBluffVenue(state: DepthState): InnBluffVenue | null {
  if (state.innBluff != null || !quietTown(state) || !integer(state.tick) || state.tick > Number.MAX_SAFE_INTEGER - 2
    || !integer(state.hero.gold, 1) || state.hero.gold >= Number.MAX_SAFE_INTEGER || selectPaidInnRest(state) !== null) return null;
  const locationId = state.atlas.currentLocationId, town = state.towns[locationId];
  if (town === undefined) return null;
  for (const inn of [...town.buildings].filter(building => building.kind === "inn").sort(compareIds)) {
    for (const resident of [...town.residents].filter(person => person.homeBuildingId === inn.id).sort(compareIds)) {
      const venue = realVenue(state, locationId, inn.id, resident.id);
      if (venue !== null && localResident(state, resident.id)) return { ...venue,
        bluffId: bluffIdentity(state.hero.id, state.tick + 1, inn.id, resident.id) };
    }
  }
  return null;
}
export function isValidCampaignInnBluff(state: DepthState): boolean {
  try {
    const value: unknown = state.innBluff;
    if (value === undefined) return !Object.prototype.hasOwnProperty.call(state, "innBluff");
    if (value === null) return true;
    if (!keys(value, ["schemaVersion", "rulesVersion", "contentVersion", "bluffId", "heroId", "presenceRule", "locationId", "innId", "innName", "residentId", "residentName", "residentRole", "admission", "resolution"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "cup-exaggeration-v1" || value.contentVersion !== 1
      || value.presenceRule !== "admitted-together-v1" || value.heroId !== state.hero.id
      || !keys(value.admission, ["tick", "sourceCommandId", "goldBefore", "face", "tell"])) return false;
    const bluff = value as unknown as InnBluff, admission = bluff.admission;
    const venue = realVenue(state, bluff.locationId, bluff.innId, bluff.residentId);
    if (venue === null || Object.entries(venue).some(([key, field]) => bluff[key as keyof InnBluff] !== field)
      || !integer(admission.tick, 1) || admission.tick > state.tick || admission.tick >= Number.MAX_SAFE_INTEGER
      || !integer(admission.goldBefore, 1) || admission.goldBefore >= Number.MAX_SAFE_INTEGER
      || bluff.bluffId !== bluffIdentity(bluff.heroId, admission.tick, bluff.innId, bluff.residentId)
      || admission.sourceCommandId !== innBluffCommandId(admission.tick, { type: "start-inn-bluff", ...venue, bluffId: bluff.bluffId })) return false;
    const committed = commitment(state.seed, bluff.bluffId, admission.tick);
    if (admission.face !== committed.face || admission.tell !== committed.tell) return false;
    let gold = admission.goldBefore;
    if (bluff.resolution === null) {
      if (state.tick !== admission.tick) return false;
    } else {
      const result = bluff.resolution;
      if (!keys(result, ["tick", "sourceCommandId", "choice", "revealedFace", "outcome", "goldBefore", "goldSpent", "goldReturned", "goldAfter", "line"])
        || (result.choice !== "challenge" && result.choice !== "decline") || result.tick !== admission.tick + 1 || result.tick > state.tick
        || result.sourceCommandId !== innBluffCommandId(result.tick, { type: "resolve-inn-bluff", bluffId: bluff.bluffId, choice: result.choice })
        || result.revealedFace !== admission.face) return false;
      const expected = resolution(result.choice, admission.face);
      if (result.outcome !== expected.outcome || result.goldSpent !== expected.goldSpent || result.goldReturned !== expected.goldReturned
        || result.line !== expected.line || result.goldBefore !== gold || result.goldAfter !== gold - expected.goldSpent + expected.goldReturned) return false;
      gold = result.goldAfter;
      if (result.tick < state.tick) return true;
    }
    return quietTown(state) && state.atlas.currentLocationId === bluff.locationId && localResident(state, bluff.residentId)
      && state.hero.gold === gold;
  } catch { return false; }
}
export function selectInnBluff(state: DepthState): InnBluff | null {
  const bluff = state.innBluff;
  return bluff == null || bluff.resolution !== null || !isValidCampaignInnBluff(state) ? null : bluff;
}
/** Only this explicitly copied packet may inform an unrevealed choice. No raw
 * receipt, private face, prediction, RNG seed, or hidden object reference escapes. */
export function projectInnBluffDecision(state: DepthState): InnBluffDecision | null {
  const bluff = selectInnBluff(state);
  if (bluff === null) return null;
  return { bluffId: bluff.bluffId, heroId: bluff.heroId, locationId: bluff.locationId, innId: bluff.innId,
    innName: bluff.innName, residentId: bluff.residentId, residentName: bluff.residentName, residentRole: bluff.residentRole,
    tick: bluff.admission.tick, sourceCommandId: bluff.admission.sourceCommandId, claim: innBluffClaim,
    tell: bluff.admission.tell, tellText: innBluffTellText(bluff.admission.tell), tellAccuracy: "two-in-three", gold: state.hero.gold,
    choices: [
      { choice: "challenge", label: "challenge the claim: stake 1 gold", goldCost: 1 },
      { choice: "decline", label: "decline the wager: keep every coin", goldCost: 0 },
    ] };
}
export function stepInnBluff(state: DepthState, command: BluffCommand): { innBluff: InnBluff; gold: number } {
  const tick = state.tick + 1, sourceCommandId = innBluffCommandId(tick, command);
  if (command.type === "start-inn-bluff") {
    const venue = selectInnBluffVenue(state);
    if (venue === null || command.bluffId !== venue.bluffId || command.locationId !== venue.locationId
      || command.innId !== venue.innId || command.residentId !== venue.residentId) throw new Error("No matching real inn bluff is available");
    return { innBluff: { ...venue, schemaVersion: 1, rulesVersion: "cup-exaggeration-v1", contentVersion: 1,
      heroId: state.hero.id, presenceRule: "admitted-together-v1", admission: { tick, sourceCommandId,
        goldBefore: state.hero.gold, ...commitment(state.seed, venue.bluffId, tick) }, resolution: null }, gold: state.hero.gold };
  }
  const bluff = selectInnBluff(state);
  if (bluff === null || command.type !== "resolve-inn-bluff" || command.bluffId !== bluff.bluffId
    || (command.choice !== "challenge" && command.choice !== "decline")) throw new Error("That inn wager is not available");
  const result = resolution(command.choice, bluff.admission.face), goldAfter = state.hero.gold - result.goldSpent + result.goldReturned;
  return { innBluff: { ...bluff, resolution: { tick, sourceCommandId, choice: command.choice, revealedFace: bluff.admission.face,
    ...result, goldBefore: state.hero.gold, goldAfter } }, gold: goldAfter };
}
