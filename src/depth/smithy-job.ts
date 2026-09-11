import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthState } from "./types";

export type SmithyStroke = "tap" | "drive";
export type SmithyShape = "unfinished" | "straight" | "bent";
export interface SmithyJobVenue {
  readonly jobId: string;
  readonly locationId: string;
  readonly smithId: string;
  readonly smithName: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly residentRole: string;
}
export interface SmithyJob extends SmithyJobVenue {
  readonly schemaVersion: 1;
  readonly rulesVersion: "one-nail-v1";
  readonly contentVersion: 1;
  readonly heroId: string;
  /** The actual start command establishes this shared scene, not a schedule. */
  readonly presenceRule: "admitted-together-v1";
  readonly admission: {
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly manaBefore: number;
    readonly goldBefore: number;
  };
  readonly strokes: readonly {
    readonly index: 0 | 1;
    readonly stroke: SmithyStroke;
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly pointsBefore: number;
    readonly pointsAdded: 1 | 2;
    readonly pointsAfter: number;
    readonly manaBefore: number;
    readonly manaSpent: 0 | 1;
    readonly manaAfter: number;
  }[];
  readonly completion: {
    readonly tick: number;
    readonly sourceCommandId: string;
    readonly shape: SmithyShape;
    readonly points: 2 | 3 | 4;
    readonly goldBefore: number;
    readonly goldEarned: 0 | 2;
    readonly goldAfter: number;
    readonly line: string;
  } | null;
}
export interface SmithyStrokeOption {
  readonly stroke: SmithyStroke;
  readonly label: string;
  readonly pointsAdded: 1 | 2;
  readonly manaCost: 0 | 1;
}
type JobCommand = Extract<DepthCommand, { type: "start-smithy-job" | "smithy-stroke" }>;
const tap: SmithyStrokeOption = Object.freeze({ stroke: "tap", label: "tap gently: +1 shaping point, no MP", pointsAdded: 1, manaCost: 0 });
const drive: SmithyStrokeOption = Object.freeze({ stroke: "drive", label: "drive carefully: +2 shaping points, 1 MP", pointsAdded: 2, manaCost: 1 });
function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
function compareIds(a: { id: string }, b: { id: string }): number { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
function jobIdentity(heroId: string, tick: number, smithId: string, residentId: string): string {
  return `smithy-job:${heroId}:${tick}:${smithId}:${residentId}`;
}
export function smithyJobCommandId(tick: number, command: JobCommand): string {
  return `depth:${tick}:smithy-job:${command.jobId}:${command.type === "start-smithy-job"
    ? `start:${command.smithId}:${command.residentId}` : `stroke:${command.strokeIndex}:${command.stroke}`}`;
}
export function smithyJobOutcome(points: number): { shape: SmithyShape; goldEarned: 0 | 2; line: string } {
  if (points === 2) return { shape: "unfinished", goldEarned: 0, line: "A convincing beginning. The point is still missing." };
  if (points === 3) return { shape: "straight", goldEarned: 2, line: "A nail, as advertised. Two gold, as promised." };
  if (points === 4) return { shape: "bent", goldEarned: 0, line: "Excellent. A corner nail." };
  throw new Error("A finished nail must have exactly two recorded strokes");
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
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function localResident(state: DepthState, residentId: string): boolean {
  return ![...state.companions.active, ...state.companions.former].some((entry) => entry.identity.residentId === residentId);
}
/** Historical venue facts survive later recruiting of the person who hosted
 * this job. Present admission, separately, excludes absent former companions. */
function realVenue(state: DepthState, locationId: string, smithId: string, residentId: string): Omit<SmithyJobVenue, "jobId"> | null {
  const town = state.towns[locationId], smith = town?.buildings.find((entry) => entry.id === smithId);
  if (!state.atlas.locations.some((location) => location.id === locationId && location.kind === "town")
    || !state.atlas.discoveredLocationIds.includes(locationId) || town === undefined || town.locationId !== locationId
    || !integer(town.visits, 1) || smith?.kind !== "smithy"
    || !town.districts.some((district) => district.id === smith.districtId && district.buildingIds.includes(smithId))) return null;
  const resident = town.residents.find((entry) => entry.id === residentId && entry.homeBuildingId === smithId && smith.residentIds.includes(entry.id));
  if (resident === undefined || resident.id === state.hero.id) return null;
  return { locationId, smithId, smithName: smith.name, residentId, residentName: resident.name, residentRole: resident.role };
}
export function selectSmithyJobVenue(state: DepthState): SmithyJobVenue | null {
  if (state.smithyJob != null || !quietTown(state) || !integer(state.tick) || state.tick > Number.MAX_SAFE_INTEGER - 3
    || !integer(state.hero.resources.mana, 1) || !integer(state.hero.gold) || state.hero.gold > Number.MAX_SAFE_INTEGER - 2
    || selectPaidInnRest(state) !== null) return null;
  const locationId = state.atlas.currentLocationId, town = state.towns[locationId];
  if (town === undefined) return null;
  for (const smith of [...town.buildings].filter((building) => building.kind === "smithy").sort(compareIds)) {
    for (const resident of [...town.residents].filter((person) => person.homeBuildingId === smith.id).sort(compareIds)) {
      const venue = realVenue(state, locationId, smith.id, resident.id);
      if (venue !== null && localResident(state, resident.id)) return { ...venue,
        jobId: jobIdentity(state.hero.id, state.tick + 1, smith.id, resident.id) };
    }
  }
  return null;
}
/** Exact rederivation of this finite job only; no new inventory or skill is earned. */
export function isValidCampaignSmithyJob(state: DepthState): boolean {
  try {
    const value: unknown = state.smithyJob;
    if (value === undefined) return !Object.prototype.hasOwnProperty.call(state, "smithyJob");
    if (value === null) return true;
    if (!keys(value, ["schemaVersion", "rulesVersion", "contentVersion", "jobId", "heroId", "presenceRule", "locationId", "smithId", "smithName", "residentId", "residentName", "residentRole", "admission", "strokes", "completion"])
      || value.schemaVersion !== 1 || value.rulesVersion !== "one-nail-v1" || value.contentVersion !== 1
      || value.presenceRule !== "admitted-together-v1" || value.heroId !== state.hero.id
      || !keys(value.admission, ["tick", "sourceCommandId", "manaBefore", "goldBefore"])
      || !Array.isArray(value.strokes) || value.strokes.length > 2) return false;
    const job = value as unknown as SmithyJob, admission = job.admission;
    const venue = realVenue(state, job.locationId, job.smithId, job.residentId);
    if (venue === null || Object.entries(venue).some(([key, field]) => job[key as keyof SmithyJob] !== field)
      || !integer(admission.tick, 1) || admission.tick > state.tick || admission.tick > Number.MAX_SAFE_INTEGER - 2
      || !integer(admission.manaBefore, 1) || !integer(admission.goldBefore) || admission.goldBefore > Number.MAX_SAFE_INTEGER - 2
      || job.jobId !== jobIdentity(job.heroId, admission.tick, job.smithId, job.residentId)
      || admission.sourceCommandId !== smithyJobCommandId(admission.tick, { type: "start-smithy-job", ...venue, jobId: job.jobId })) return false;
    let mana = admission.manaBefore, points = 0;
    for (const [index, stroke] of job.strokes.entries()) {
      if (!keys(stroke, ["index", "stroke", "tick", "sourceCommandId", "pointsBefore", "pointsAdded", "pointsAfter", "manaBefore", "manaSpent", "manaAfter"])
        || stroke.index !== index || (stroke.stroke !== "tap" && stroke.stroke !== "drive")) return false;
      const option = stroke.stroke === "tap" ? tap : drive;
      if (stroke.tick !== admission.tick + index + 1 || stroke.tick > state.tick || mana < option.manaCost
        || stroke.sourceCommandId !== smithyJobCommandId(stroke.tick, { type: "smithy-stroke", jobId: job.jobId, strokeIndex: index as 0 | 1, stroke: stroke.stroke })
        || stroke.pointsBefore !== points || stroke.pointsAdded !== option.pointsAdded || stroke.pointsAfter !== points + option.pointsAdded
        || stroke.manaBefore !== mana || stroke.manaSpent !== option.manaCost || stroke.manaAfter !== mana - option.manaCost) return false;
      mana = stroke.manaAfter; points = stroke.pointsAfter;
    }
    let gold = admission.goldBefore;
    if (job.completion === null) {
      if (job.strokes.length === 2 || state.tick !== admission.tick + job.strokes.length) return false;
    } else {
      const completion = job.completion, second = job.strokes[1];
      if (job.strokes.length !== 2 || second === undefined
        || !keys(completion, ["tick", "sourceCommandId", "shape", "points", "goldBefore", "goldEarned", "goldAfter", "line"])) return false;
      const outcome = smithyJobOutcome(points);
      if (completion.tick !== second.tick || completion.sourceCommandId !== second.sourceCommandId || completion.points !== points
        || completion.shape !== outcome.shape || completion.line !== outcome.line || completion.goldEarned !== outcome.goldEarned
        || completion.goldBefore !== gold || completion.goldAfter !== gold + outcome.goldEarned) return false;
      gold = completion.goldAfter;
      if (completion.tick < state.tick) return true;
    }
    return quietTown(state) && state.atlas.currentLocationId === job.locationId && localResident(state, job.residentId)
      && state.hero.resources.mana === mana && state.hero.gold === gold;
  } catch { return false; }
}
export function selectSmithyJob(state: DepthState): SmithyJob | null {
  const job = state.smithyJob;
  return job == null || job.completion !== null || !isValidCampaignSmithyJob(state) ? null : job;
}
export function smithyStrokeOptions(state: DepthState): readonly SmithyStrokeOption[] {
  return selectSmithyJob(state) === null ? [] : state.hero.resources.mana >= 1 ? [tap, drive] : [tap];
}
export function stepSmithyJob(state: DepthState, command: JobCommand): { smithyJob: SmithyJob; mana: number; gold: number } {
  const tick = state.tick + 1, sourceCommandId = smithyJobCommandId(tick, command);
  if (command.type === "start-smithy-job") {
    const venue = selectSmithyJobVenue(state);
    if (venue === null || command.jobId !== venue.jobId || command.locationId !== venue.locationId
      || command.smithId !== venue.smithId || command.residentId !== venue.residentId) throw new Error("No matching real smithy job is available");
    return { smithyJob: { ...venue, schemaVersion: 1, rulesVersion: "one-nail-v1", contentVersion: 1,
      heroId: state.hero.id, presenceRule: "admitted-together-v1", admission: { tick, sourceCommandId,
        manaBefore: state.hero.resources.mana, goldBefore: state.hero.gold }, strokes: [], completion: null },
    mana: state.hero.resources.mana, gold: state.hero.gold };
  }
  const job = selectSmithyJob(state), option = smithyStrokeOptions(state).find((entry) => entry.stroke === command.stroke);
  if (job === null || command.type !== "smithy-stroke" || command.jobId !== job.jobId
    || command.strokeIndex !== job.strokes.length || option === undefined) throw new Error("That smithy stroke is not available");
  const pointsBefore = job.strokes.at(-1)?.pointsAfter ?? 0, pointsAfter = pointsBefore + option.pointsAdded;
  const stroke = { index: command.strokeIndex, stroke: command.stroke, tick, sourceCommandId,
    pointsBefore, pointsAdded: option.pointsAdded, pointsAfter, manaBefore: state.hero.resources.mana,
    manaSpent: option.manaCost, manaAfter: state.hero.resources.mana - option.manaCost };
  const strokes = [...job.strokes, stroke];
  if (strokes.length === 1) return { smithyJob: { ...job, strokes }, mana: stroke.manaAfter, gold: state.hero.gold };
  const outcome = smithyJobOutcome(pointsAfter), goldAfter = state.hero.gold + outcome.goldEarned;
  return { smithyJob: { ...job, strokes, completion: { tick, sourceCommandId, ...outcome, points: pointsAfter as 2 | 3 | 4,
    goldBefore: state.hero.gold, goldAfter } }, mana: stroke.manaAfter, gold: goldAfter };
}
