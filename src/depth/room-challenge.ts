import { isValidCampaignBorrowedBell } from "./borrowed-bell-campaign";
import { isValidCampaignUsefulReply, usefulReplyBook } from "./useful-reply";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "./types";

/** Original single-exchange content, never an update to a scored F1/F2 table. */
export const roomChallengeClaim = Object.freeze({
  id: "listening-forfeits-leadership",
  text: "If you ask the room what it needs, the room is leading you.",
});
export interface RoomChallengeResponse {
  readonly id: string;
  readonly text: string;
  readonly classification: "direct" | "near" | "category";
  readonly delta: 1 | 0 | -1;
  readonly expressionId: string | null;
  readonly frameId: string | null;
  readonly explanation: string;
}
const constructive: RoomChallengeResponse = Object.freeze({
  id: "listen-then-lead", classification: "direct", delta: 1,
  text: "A sounding board is not a throne with better acoustics. Listening tells me what needs doing; choosing how to help is still leadership.",
  expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId,
  explanation: "Listening supplies the needs; choosing a useful response remains an act of leadership. Asking does not surrender that judgment.",
});
const starters: readonly RoomChallengeResponse[] = Object.freeze([
  Object.freeze({ id: "let-the-room-lead", classification: "near", delta: 0,
    text: "Then let the room lead for a minute. My feet could use a committee.",
    expressionId: null, frameId: null,
    explanation: "Graciously accepts the room's lead without refuting the claim that listening gives leadership away.",
  }),
  Object.freeze({ id: "order-the-ceiling", classification: "category", delta: -1,
    text: "I shall give the room an order: STOP LEADING ME. There. A splendidly obedient ceiling.",
    expressionId: null, frameId: null,
    explanation: "A louder order to the room does not show whether listening prevents useful leadership.",
  }),
]);

export interface RoomChallengeResult {
  readonly responseId: string;
  readonly reply: string;
  readonly classification: RoomChallengeResponse["classification"];
  readonly delta: RoomChallengeResponse["delta"];
  readonly outcome: "victory" | "draw" | "defeat";
  readonly expressionId: string | null;
  readonly frameId: string | null;
  readonly readingSourceCommandId: string | null;
  readonly explanation: string;
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly reputationBefore: number;
  readonly reputationAfter: number;
  readonly reputationAward: 0 | 1;
}
export interface RoomChallenge {
  readonly schemaVersion: 1;
  readonly rulesVersion: "room-challenge-v1";
  readonly contentVersion: 1;
  readonly encounterId: string;
  readonly heroId: string;
  readonly locationId: string;
  readonly buildingId: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly claimId: string;
  readonly claim: string;
  readonly readingSourceCommandId: string;
  readonly readingTick: number;
  readonly expressionId: string;
  readonly frameId: string;
  readonly lessonSourceCommandId: string;
  readonly lessonTick: number;
  readonly bellSourceCommandId: string;
  readonly bellTick: number;
  readonly sourceCommandId: string;
  readonly startedTick: number;
  readonly reputationBefore: number;
  readonly reputationCap: 100;
  readonly result: RoomChallengeResult | null;
}
type RoomCommand = Extract<DepthCommand, { type: "start-room-challenge" | "answer-room-challenge" }>;
export interface RoomChallengeVenue {
  readonly encounterId: string; readonly locationId: string; readonly buildingId: string;
  readonly residentId: string; readonly residentName: string;
}

function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 600; }
function tick(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function reputation(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100; }
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...names].sort().join(",");
}
function same(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
function encounterId(heroId: string, locationId: string): string { return `room-challenge:${heroId}:${locationId}`; }
export function roomChallengeCommandId(atTick: number, command: RoomCommand): string {
  return `depth:${atTick}:room-challenge:${command.encounterId}:${command.type === "start-room-challenge"
    ? `start:${command.buildingId}:${command.residentId}` : `answer:${command.responseId}`}`;
}

function hasLearnedFrame(state: DepthState): boolean {
  const lesson = state.usefulReply;
  return lesson !== null && lesson.reply !== null && isValidCampaignUsefulReply(state)
    && lesson.reading.bookId === usefulReplyBook.id && lesson.reading.frameId === usefulReplyBook.frameId
    && lesson.reading.expressionId === usefulReplyBook.expressionId;
}
/** The same public meanings are available after any practice response; the reading teaches the frame. */
export function roomChallengeResponses(state: DepthState): readonly RoomChallengeResponse[] {
  return hasLearnedFrame(state) ? Object.freeze([constructive, ...starters]) : starters;
}
function quietSolo(state: DepthState): boolean {
  return state.companions.active.length === 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && state.repartee.active === null && (state.dungeon === null || state.dungeon.completed)
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && state.usefulReply !== null && state.usefulReply.reply !== null
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
/** Retained venue facts survive later recruitment of this same real person. */
function venueName(state: DepthState, locationId: string, buildingId: string, residentId: string): string | null {
  const town = state.towns[locationId], building = town?.buildings.find((entry) => entry.id === buildingId);
  if (town === undefined || town.locationId !== locationId || town.visits < 1 || building === undefined
    || !["hall", "inn"].includes(building.kind) || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some((entry) => entry.id === locationId && entry.kind === "town")
    || !town.districts.some((entry) => entry.id === building.districtId && entry.buildingIds.includes(buildingId))) return null;
  const resident = town.residents.find((entry) => entry.id === residentId && entry.homeBuildingId === buildingId && building.residentIds.includes(entry.id));
  return resident === undefined || resident.id === state.hero.id ? null : resident.name;
}
function isRosterIdentity(state: DepthState, residentId: string): boolean {
  return [...state.companions.active, ...state.companions.former].some((entry) => entry.identity.residentId === residentId);
}
export function selectRoomChallengeVenue(state: DepthState): RoomChallengeVenue | null {
  if (state.roomChallenge !== null || !quietSolo(state) || !hasLearnedFrame(state)
    || state.bellExpedition?.completion == null || !isValidCampaignBorrowedBell(state)
    || selectPaidInnRest(state) !== null) return null;
  const locationId = state.atlas.currentLocationId, town = state.towns[locationId];
  if (town === undefined || !reputation(town.reputation)) return null;
  const buildings = [...town.buildings].sort((a, b) => Number(a.kind !== "hall") - Number(b.kind !== "hall") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const building of buildings) for (const residentId of building.residentIds) {
    if (isRosterIdentity(state, residentId)) continue;
    const residentName = venueName(state, locationId, building.id, residentId);
    if (residentName !== null) return { encounterId: encounterId(state.hero.id, locationId), locationId, buildingId: building.id, residentId, residentName };
  }
  return null;
}
function resultFor(challenge: RoomChallenge, response: RoomChallengeResponse, atTick: number): RoomChallengeResult {
  const outcome = response.delta === 1 ? "victory" : response.delta === 0 ? "draw" : "defeat";
  const reputationAfter = outcome === "victory" ? Math.min(challenge.reputationCap, challenge.reputationBefore + 1) : challenge.reputationBefore;
  return { responseId: response.id, reply: response.text, classification: response.classification, delta: response.delta, outcome,
    expressionId: response.expressionId, frameId: response.frameId,
    readingSourceCommandId: response.frameId === null ? null : challenge.readingSourceCommandId,
    explanation: response.explanation, sourceCommandId: roomChallengeCommandId(atTick, { type: "answer-room-challenge", encounterId: challenge.encounterId, responseId: response.id }),
    tick: atTick, reputationBefore: challenge.reputationBefore, reputationAfter, reputationAward: reputationAfter > challenge.reputationBefore ? 1 : 0 };
}
const challengeKeys = ["schemaVersion", "rulesVersion", "contentVersion", "encounterId", "heroId", "locationId", "buildingId", "residentId", "residentName", "claimId", "claim",
  "readingSourceCommandId", "readingTick", "expressionId", "frameId", "lessonSourceCommandId", "lessonTick", "bellSourceCommandId", "bellTick", "sourceCommandId", "startedTick", "reputationBefore", "reputationCap", "result"];

export function isValidCampaignRoomChallenge(state: DepthState): boolean {
  try {
    const value: unknown = state.roomChallenge;
    if (value === null) return true;
    if (!keys(value, challengeKeys) || value.schemaVersion !== 1 || value.rulesVersion !== "room-challenge-v1" || value.contentVersion !== 1
      || ![value.encounterId, value.heroId, value.locationId, value.buildingId, value.residentId, value.residentName,
        value.readingSourceCommandId, value.lessonSourceCommandId, value.bellSourceCommandId, value.sourceCommandId].every(identifier)
      || ![value.startedTick, value.readingTick, value.lessonTick, value.bellTick].every(tick)
      || !reputation(value.reputationBefore) || value.reputationCap !== 100
      || !hasLearnedFrame(state) || state.bellExpedition?.completion == null || !isValidCampaignBorrowedBell(state)) return false;
    const challenge = value as unknown as RoomChallenge, lesson = state.usefulReply!, bell = state.bellExpedition.completion;
    if (challenge.heroId !== state.hero.id || challenge.encounterId !== encounterId(challenge.heroId, challenge.locationId)
      || challenge.claimId !== roomChallengeClaim.id || challenge.claim !== roomChallengeClaim.text
      || challenge.readingSourceCommandId !== lesson.reading.sourceCommandId || challenge.readingTick !== lesson.reading.tick
      || challenge.expressionId !== lesson.reading.expressionId || challenge.frameId !== lesson.reading.frameId
      || challenge.lessonSourceCommandId !== lesson.reply!.sourceCommandId || challenge.lessonTick !== lesson.reply!.tick
      || challenge.bellSourceCommandId !== bell.sourceCommandId || challenge.bellTick !== bell.tick
      || challenge.readingTick >= challenge.lessonTick || challenge.startedTick <= challenge.lessonTick || challenge.startedTick <= challenge.bellTick
      || challenge.startedTick > state.tick
      || challenge.sourceCommandId !== roomChallengeCommandId(challenge.startedTick, { type: "start-room-challenge", ...challenge })
      || venueName(state, challenge.locationId, challenge.buildingId, challenge.residentId) !== challenge.residentName) return false;
    const result = challenge.result;
    if (result !== null) {
      const response = roomChallengeResponses(state).find((entry) => entry.id === result.responseId);
      if (response === undefined || !tick(result.tick) || result.tick !== challenge.startedTick + 1 || result.tick > state.tick
        || !same(result, { ...resultFor(challenge, response, result.tick) })) return false;
      if (result.tick < state.tick) return true;
    }
    return (result?.tick ?? challenge.startedTick) === state.tick && quietSolo(state)
      && state.atlas.currentLocationId === challenge.locationId && !isRosterIdentity(state, challenge.residentId)
      && selectPaidInnRest(state) === null
      && state.towns[challenge.locationId]!.reputation === (result?.reputationAfter ?? challenge.reputationBefore);
  } catch { return false; }
}
export function roomChallengeCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const make = (command: RoomCommand, label: string): DepthCommandCandidate => ({ command, label, deciderId: state.hero.id, id: roomChallengeCommandId(state.tick + 1, command) });
  const challenge = state.roomChallenge;
  if (challenge !== null) return challenge.result === null && isValidCampaignRoomChallenge(state)
    ? roomChallengeResponses(state).map((response) => make({ type: "answer-room-challenge", encounterId: challenge.encounterId, responseId: response.id }, response.text)) : null;
  const venue = selectRoomChallengeVenue(state);
  return venue === null ? null : [make({ type: "start-room-challenge", encounterId: venue.encounterId, locationId: venue.locationId, buildingId: venue.buildingId, residentId: venue.residentId }, `answer ${venue.residentName}'s one-point challenge about listening` )];
}
export function stepCampaignRoomChallenge(state: DepthState, command: RoomCommand): { roomChallenge: RoomChallenge; towns: DepthState["towns"] } {
  if (!isValidCampaignRoomChallenge(state)) throw new Error("The room challenge has invalid history");
  if (command.type === "start-room-challenge") {
    const venue = selectRoomChallengeVenue(state);
    if (venue === null || command.encounterId !== venue.encounterId || command.locationId !== venue.locationId
      || command.buildingId !== venue.buildingId || command.residentId !== venue.residentId) throw new Error("No matching room challenge is available");
    const lesson = state.usefulReply!, bell = state.bellExpedition!.completion!;
    const roomChallenge: RoomChallenge = { schemaVersion: 1, rulesVersion: "room-challenge-v1", contentVersion: 1, ...venue,
      heroId: state.hero.id, claimId: roomChallengeClaim.id, claim: roomChallengeClaim.text,
      readingSourceCommandId: lesson.reading.sourceCommandId, readingTick: lesson.reading.tick, expressionId: lesson.reading.expressionId, frameId: lesson.reading.frameId,
      lessonSourceCommandId: lesson.reply!.sourceCommandId, lessonTick: lesson.reply!.tick,
      bellSourceCommandId: bell.sourceCommandId, bellTick: bell.tick,
      sourceCommandId: roomChallengeCommandId(state.tick + 1, command), startedTick: state.tick + 1,
      reputationBefore: state.towns[venue.locationId]!.reputation, reputationCap: 100, result: null };
    return { roomChallenge, towns: state.towns };
  }
  const challenge = state.roomChallenge;
  if (challenge === null || challenge.result !== null || challenge.encounterId !== command.encounterId) throw new Error("No matching room challenge awaits an answer");
  const response = roomChallengeResponses(state).find((entry) => entry.id === command.responseId);
  if (response === undefined) throw new Error("The room challenge answer is unknown");
  const result = resultFor(challenge, response, state.tick + 1), town = state.towns[challenge.locationId]!;
  return { roomChallenge: { ...challenge, result },
    towns: { ...state.towns, [challenge.locationId]: { ...town, reputation: result.reputationAfter } } };
}
