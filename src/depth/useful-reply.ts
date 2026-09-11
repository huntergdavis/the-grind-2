import { isValidCampaignReparteeCallback } from "./repartee-memory";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "./types";

/** Original writing, isolated from the frozen scored-flyting content. */
export const usefulReplyBook = Object.freeze({
  id: "chair-meeting-not-furniture", contentVersion: 1 as const,
  title: "How to Chair a Meeting Without Becoming the Furniture",
  excerpt: "A chair supports the people around it. If your chief contribution is a loud creak, the carpenter has more to offer the meeting.",
  expressionId: "sounding-board", frameId: "turn-volume-into-service",
  expression: "sounding board",
  definition: "Something that helps other voices be heard, without mistaking the resulting noise for its own wisdom.",
});
export const usefulReplyCall = Object.freeze({ id: "useful-leadership", text: "I can make this whole room listen. Surely that makes me fit to lead." });

export interface UsefulReplyResponse {
  readonly id: string;
  readonly text: string;
  readonly classification: "constructive" | "concession" | "boast";
  readonly explanation: string;
  readonly expressionId: string | null;
  readonly frameId: string | null;
}
const constructive: UsefulReplyResponse = Object.freeze({
  id: "invite-useful-leadership", classification: "constructive",
  text: "Excellent. Use that voice to ask who needs a hand; then listen to the answer. A sounding board serves the room; it does not appoint itself the orchestra.",
  explanation: "Acknowledges the useful voice, then offers a test of leadership: help others speak and act on what they need. Volume alone is not authority.",
  expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId,
});
const starters: readonly UsefulReplyResponse[] = Object.freeze([
  Object.freeze({ id: "grant-the-volume", classification: "concession", text: "You are certainly audible. I had not mistaken you for the carpet.",
    explanation: "Acknowledges the volume without establishing whether it makes a useful leader.", expressionId: null, frameId: null }),
  Object.freeze({ id: "compete-for-volume", classification: "boast", text: "I CAN BE AUDIBLE TOO. We may need a larger hall for all this leadership.",
    explanation: "Repeats the same boast instead of connecting leadership to useful work.", expressionId: null, frameId: null }),
]);

export interface UsefulReplyLesson {
  readonly schemaVersion: 1;
  readonly rulesVersion: "useful-reply-v1";
  readonly contentVersion: 1;
  readonly lessonId: string;
  readonly heroId: string;
  readonly locationId: string;
  readonly buildingId: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly reading: {
    readonly bookId: string; readonly expressionId: string; readonly frameId: string;
    readonly sourceCommandId: string; readonly tick: number;
  };
  readonly reply: {
    readonly responseId: string; readonly callId: string; readonly call: string; readonly reply: string;
    readonly classification: UsefulReplyResponse["classification"]; readonly explanation: string;
    readonly readingSourceCommandId: string | null; readonly sourceCommandId: string; readonly tick: number;
  } | null;
}
type LessonCommand = Extract<DepthCommand, { type: "read-useful-book" | "practice-useful-reply" }>;
export interface UsefulReplyVenue { readonly lessonId: string; readonly locationId: string; readonly buildingId: string; readonly residentId: string; readonly residentName: string }

function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500; }
function tick(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...names].sort().join(",");
}
function same(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
function lessonId(heroId: string, locationId: string): string { return `useful-reply:${heroId}:${locationId}`; }
export function usefulReplyCommandId(atTick: number, command: LessonCommand): string {
  return `depth:${atTick}:useful-reply:${command.lessonId}:${command.type === "read-useful-book" ? `read:${command.buildingId}:${command.residentId}` : `reply:${command.responseId}`}`;
}

function validReading(value: unknown): value is UsefulReplyLesson["reading"] {
  return keys(value, ["bookId", "expressionId", "frameId", "sourceCommandId", "tick"])
    && value.bookId === usefulReplyBook.id && value.expressionId === usefulReplyBook.expressionId
    && value.frameId === usefulReplyBook.frameId && identifier(value.sourceCommandId) && tick(value.tick);
}
/** Unknown learning never supplies the constructive option. No score is assigned. */
export function usefulReplyResponses(lesson: UsefulReplyLesson | null): readonly UsefulReplyResponse[] {
  return lesson !== null && validReading(lesson.reading) ? Object.freeze([constructive, ...starters]) : starters;
}
function replyReceipt(lesson: UsefulReplyLesson, response: UsefulReplyResponse, atTick: number): NonNullable<UsefulReplyLesson["reply"]> {
  return { responseId: response.id, callId: usefulReplyCall.id, call: usefulReplyCall.text, reply: response.text,
    classification: response.classification, explanation: response.explanation,
    readingSourceCommandId: response.frameId === null ? null : lesson.reading.sourceCommandId,
    sourceCommandId: usefulReplyCommandId(atTick, { type: "practice-useful-reply", lessonId: lesson.lessonId, responseId: response.id }), tick: atTick };
}
function validLesson(value: unknown): value is UsefulReplyLesson {
  if (!keys(value, ["schemaVersion", "rulesVersion", "contentVersion", "lessonId", "heroId", "locationId", "buildingId", "residentId", "residentName", "reading", "reply"])
    || value.schemaVersion !== 1 || value.rulesVersion !== "useful-reply-v1" || value.contentVersion !== 1
    || ![value.lessonId, value.heroId, value.locationId, value.buildingId, value.residentId, value.residentName].every(identifier)
    || !validReading(value.reading)) return false;
  const lesson = value as unknown as UsefulReplyLesson;
  if (lesson.lessonId !== lessonId(lesson.heroId, lesson.locationId)
    || lesson.reading.sourceCommandId !== usefulReplyCommandId(lesson.reading.tick, { type: "read-useful-book", ...lesson })) return false;
  if (lesson.reply === null) return true;
  const reply = lesson.reply;
  const response = usefulReplyResponses(lesson).find((entry) => entry.id === reply.responseId);
  return response !== undefined && tick(reply.tick) && reply.tick === lesson.reading.tick + 1
    && same(reply, replyReceipt(lesson, response, reply.tick));
}
function priorFarewellTick(state: DepthState): number | null {
  const callback = state.reparteeCallback;
  if (callback === null || !isValidCampaignReparteeCallback(state)) return null;
  const witness = state.companions.former.find((entry) => entry.identity.residentId === callback.witnessId && entry.joinedTick === callback.joinedTick);
  return witness !== undefined && witness.departure.tick > callback.tick && witness.departure.tick <= state.tick ? witness.departure.tick : null;
}
function quietSoloTown(state: DepthState): boolean {
  return state.companions.active.length === 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && state.repartee.active === null && (state.dungeon === null || state.dungeon.completed)
    && (state.bellExpedition === null || state.bellExpedition.completion !== null)
    && state.quest.status === "active" && state.pendingQuestReward === null;
}
function realVenue(state: DepthState, locationId: string, buildingId: string, residentId: string): string | null {
  const town = state.towns[locationId], building = town?.buildings.find((entry) => entry.id === buildingId);
  if (town === undefined || town.locationId !== locationId || town.visits < 1 || building === undefined
    || !["hall", "inn"].includes(building.kind) || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some((entry) => entry.id === locationId && entry.kind === "town")
    || !town.districts.some((entry) => entry.id === building.districtId && entry.buildingIds.includes(buildingId))) return null;
  const resident = town.residents.find((entry) => entry.id === residentId && entry.homeBuildingId === buildingId && building.residentIds.includes(entry.id));
  if (resident === undefined || resident.id === state.hero.id) return null;
  return resident.name;
}
export function selectUsefulReplyVenue(state: DepthState): UsefulReplyVenue | null {
  if (state.usefulReply !== null || !quietSoloTown(state) || priorFarewellTick(state) === null || selectPaidInnRest(state) !== null) return null;
  const locationId = state.atlas.currentLocationId, town = state.towns[locationId];
  if (town === undefined) return null;
  const buildings = [...town.buildings].sort((a, b) => Number(a.kind !== "hall") - Number(b.kind !== "hall") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const building of buildings) for (const residentId of building.residentIds) {
    if ([...state.companions.active, ...state.companions.former].some((entry) => entry.identity.residentId === residentId)) continue;
    const residentName = realVenue(state, locationId, building.id, residentId);
    if (residentName !== null) return { lessonId: lessonId(state.hero.id, locationId), locationId, buildingId: building.id, residentId, residentName };
  }
  return null;
}
export function isValidCampaignUsefulReply(state: DepthState): boolean {
  try {
    const lesson = state.usefulReply;
    if (lesson === null) return true;
    if (!validLesson(lesson) || lesson.heroId !== state.hero.id || lesson.reading.tick > state.tick
      || realVenue(state, lesson.locationId, lesson.buildingId, lesson.residentId) !== lesson.residentName) return false;
    const farewell = priorFarewellTick(state), lastTick = lesson.reply?.tick ?? lesson.reading.tick;
    if (farewell === null || farewell >= lesson.reading.tick || lastTick > state.tick) return false;
    if (lesson.reply !== null && lastTick < state.tick) return true;
    return lastTick === state.tick && quietSoloTown(state) && state.atlas.currentLocationId === lesson.locationId
      && !state.companions.former.some((entry) => entry.identity.residentId === lesson.residentId)
      && selectPaidInnRest(state) === null;
  } catch { return false; }
}
export function usefulReplyCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const make = (command: LessonCommand, label: string): DepthCommandCandidate => ({ command, label, deciderId: state.hero.id, id: usefulReplyCommandId(state.tick + 1, command) });
  const lesson = state.usefulReply;
  if (lesson !== null) return lesson.reply === null && isValidCampaignUsefulReply(state)
    ? usefulReplyResponses(lesson).map((response) => make({ type: "practice-useful-reply", lessonId: lesson.lessonId, responseId: response.id }, response.text)) : null;
  const venue = selectUsefulReplyVenue(state);
  return venue === null ? null : [make({ type: "read-useful-book", lessonId: venue.lessonId, locationId: venue.locationId, buildingId: venue.buildingId, residentId: venue.residentId }, `read ${usefulReplyBook.title}`)];
}
export function stepCampaignUsefulReply(state: DepthState, command: LessonCommand): UsefulReplyLesson {
  if (!isValidCampaignUsefulReply(state)) throw new Error("The useful reply has invalid history");
  if (command.type === "read-useful-book") {
    const venue = selectUsefulReplyVenue(state);
    if (venue === null || ["lessonId", "locationId", "buildingId", "residentId"].some((key) => venue[key as keyof UsefulReplyVenue] !== command[key as keyof typeof command])) throw new Error("No matching public lesson is available");
    return { schemaVersion: 1, rulesVersion: "useful-reply-v1", contentVersion: 1, ...venue, heroId: state.hero.id,
      reading: { bookId: usefulReplyBook.id, expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId,
        sourceCommandId: usefulReplyCommandId(state.tick + 1, command), tick: state.tick + 1 }, reply: null };
  }
  const lesson = state.usefulReply;
  if (lesson === null || lesson.reply !== null || lesson.lessonId !== command.lessonId) throw new Error("No matching practice reply is pending");
  const response = usefulReplyResponses(lesson).find((entry) => entry.id === command.responseId);
  if (response === undefined) throw new Error("The practice reply has not been learned");
  return { ...lesson, reply: replyReceipt(lesson, response, state.tick + 1) };
}
