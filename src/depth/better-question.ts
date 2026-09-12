import { isValidCampaignRoomChallenge } from "./room-challenge";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "./types";

/** Original finite content: asking for a reason is not an automatic agreement. */
export const betterQuestionBook = Object.freeze({
  id: "questions-without-traps", contentVersion: 1 as const,
  title: "Questions Without Traps",
  excerpt: "A question is a door only when the asker is prepared to hear the answer. Otherwise it is a painted wall with a doorknob.",
  expression: "good-faith question", expressionId: "good-faith-question", frameId: "ask-before-accusing",
  definition: "A question asked to learn what would change a person's mind, rather than to corner them into defending it.",
});
export const betterQuestionClaim = Object.freeze({
  id: "conversation-is-surrender", text: "If you ask what would change my mind, you have already surrendered your own." });

export interface BetterQuestionResponse {
  readonly id: string;
  readonly classification: "open" | "concession" | "dismissal";
  readonly text: string;
  readonly explanation: string;
  readonly expressionId: string | null;
  readonly frameId: string | null;
}
const learned = Object.freeze({ id: "ask-what-would-change", classification: "open" as const,
  text: "Then let us each name what might change our minds. Listening is not surrender; it is how we learn whether there is a bridge at all.",
  explanation: "Keeps a boundary while asking for a real condition of change. Neither speaker is declared correct, but the conversation remains open.",
  expressionId: betterQuestionBook.expressionId, frameId: betterQuestionBook.frameId });
const starters: readonly BetterQuestionResponse[] = Object.freeze([
  Object.freeze({ id: "leave-it-unsettled", classification: "concession", text: "Then we may leave it unsettled. Not every disagreement needs a trophy.",
    explanation: "Refuses to turn the disagreement into a contest, without learning what either speaker might reconsider.", expressionId: null, frameId: null }),
  Object.freeze({ id: "call-it-a-wall", classification: "dismissal", text: "If your mind is a wall, I shall save my questions for a door.",
    explanation: "Rejects the speaker instead of testing the claim. The exchange closes without a new fact or reward.", expressionId: null, frameId: null }),
]);

export interface BetterQuestion {
  readonly schemaVersion: 1;
  readonly rulesVersion: "better-question-v1";
  readonly contentVersion: 1;
  readonly conversationId: string;
  readonly heroId: string;
  readonly locationId: string;
  readonly buildingId: string;
  readonly residentId: string;
  readonly residentName: string;
  readonly reading: { readonly bookId: string; readonly expressionId: string; readonly frameId: string; readonly sourceCommandId: string; readonly tick: number };
  readonly exchange: {
    readonly claimId: string; readonly claim: string; readonly responseId: string; readonly response: string;
    readonly classification: BetterQuestionResponse["classification"]; readonly explanation: string;
    readonly readingSourceCommandId: string | null; readonly sourceCommandId: string; readonly tick: number;
  } | null;
}

type BetterQuestionCommand = Extract<DepthCommand, { type: "read-better-question-book" | "answer-better-question" }>;
export interface BetterQuestionVenue { readonly conversationId: string; readonly locationId: string; readonly buildingId: string; readonly residentId: string; readonly residentName: string }

function id(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500; }
function atTick(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function keys(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...names].sort().join(",");
}
function exact(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
function conversationId(heroId: string, locationId: string): string { return `better-question:${heroId}:${locationId}`; }
export function betterQuestionCommandId(tick: number, command: BetterQuestionCommand): string {
  return `depth:${tick}:better-question:${command.conversationId}:${command.type === "read-better-question-book"
    ? `read:${command.buildingId}:${command.residentId}` : `answer:${command.responseId}`}`;
}

function venueName(state: DepthState, locationId: string, buildingId: string, residentId: string): string | null {
  const town = state.towns[locationId], building = town?.buildings.find(entry => entry.id === buildingId);
  if (town === undefined || town.locationId !== locationId || town.visits < 1 || building === undefined
    || !["hall", "inn"].includes(building.kind) || !state.atlas.discoveredLocationIds.includes(locationId)
    || !state.atlas.locations.some(entry => entry.id === locationId && entry.kind === "town")
    || !town.districts.some(entry => entry.id === building.districtId && entry.buildingIds.includes(buildingId))) return null;
  const resident = town.residents.find(entry => entry.id === residentId && entry.homeBuildingId === buildingId && building.residentIds.includes(entry.id));
  return resident?.name ?? null;
}
function quietSoloTown(state: DepthState): boolean {
  return state.companions.active.length === 0 && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.atlas.route === null && state.combat === null && state.counterDuel === null && state.repartee.active === null
    && (state.dungeon === null || state.dungeon.completed) && state.quest.status === "active" && state.pendingQuestReward === null;
}
function prerequisites(state: DepthState): boolean {
  return state.roomChallenge !== null && state.roomChallenge.result !== null && isValidCampaignRoomChallenge(state)
    && state.weaponTechniqueCertification !== undefined && state.roadSupper !== undefined && state.spareGearTrade !== undefined;
}
export function betterQuestionResponses(question: BetterQuestion | null): readonly BetterQuestionResponse[] {
  return question === null ? starters : Object.freeze([learned, ...starters]);
}
function exchangeReceipt(question: BetterQuestion, response: BetterQuestionResponse, tick: number): NonNullable<BetterQuestion["exchange"]> {
  return { claimId: betterQuestionClaim.id, claim: betterQuestionClaim.text, responseId: response.id, response: response.text,
    classification: response.classification, explanation: response.explanation,
    readingSourceCommandId: response.frameId === null ? null : question.reading.sourceCommandId,
    sourceCommandId: betterQuestionCommandId(tick, { type: "answer-better-question", conversationId: question.conversationId, responseId: response.id }), tick };
}
function validQuestion(value: unknown): value is BetterQuestion {
  if (!keys(value, ["schemaVersion", "rulesVersion", "contentVersion", "conversationId", "heroId", "locationId", "buildingId", "residentId", "residentName", "reading", "exchange"])
    || value.schemaVersion !== 1 || value.rulesVersion !== "better-question-v1" || value.contentVersion !== 1
    || ![value.conversationId, value.heroId, value.locationId, value.buildingId, value.residentId, value.residentName].every(id)
    || !keys(value.reading, ["bookId", "expressionId", "frameId", "sourceCommandId", "tick"])
    || value.reading.bookId !== betterQuestionBook.id || value.reading.expressionId !== betterQuestionBook.expressionId
    || value.reading.frameId !== betterQuestionBook.frameId || !id(value.reading.sourceCommandId) || !atTick(value.reading.tick)) return false;
  const question = value as unknown as BetterQuestion;
  if (question.conversationId !== conversationId(question.heroId, question.locationId)
    || question.reading.sourceCommandId !== betterQuestionCommandId(question.reading.tick, { type: "read-better-question-book", ...question })) return false;
  if (question.exchange === null) return true;
  const response = betterQuestionResponses(question).find(entry => entry.id === question.exchange!.responseId);
  return response !== undefined && question.exchange.tick === question.reading.tick + 1
    && exact(question.exchange, exchangeReceipt(question, response, question.exchange.tick));
}

/** One later book at the same real town that hosted the prior public exchange. */
export function selectBetterQuestionVenue(state: DepthState): BetterQuestionVenue | null {
  if (state.betterQuestion !== null || !quietSoloTown(state) || !prerequisites(state) || selectPaidInnRest(state) !== null) return null;
  const previous = state.roomChallenge!, locationId = previous.locationId;
  if (state.atlas.currentLocationId !== locationId) return null;
  const town = state.towns[locationId];
  if (town === undefined) return null;
  for (const building of [...town.buildings].sort((a, b) => Number(a.kind !== "hall") - Number(b.kind !== "hall") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    for (const residentId of building.residentIds) {
      if (residentId === previous.residentId || [...state.companions.active, ...state.companions.former].some(entry => entry.identity.residentId === residentId)) continue;
      const residentName = venueName(state, locationId, building.id, residentId);
      if (residentName !== null) return { conversationId: conversationId(state.hero.id, locationId), locationId, buildingId: building.id, residentId, residentName };
    }
  }
  return null;
}

export function isValidCampaignBetterQuestion(state: DepthState): boolean {
  try {
    const question = state.betterQuestion;
    if (question === null) return true;
    if (!validQuestion(question) || question.heroId !== state.hero.id || !prerequisites(state)
      || venueName(state, question.locationId, question.buildingId, question.residentId) !== question.residentName
      || question.reading.tick > state.tick || question.reading.tick <= state.roomChallenge!.result!.tick) return false;
    const lastTick = question.exchange?.tick ?? question.reading.tick;
    if (lastTick < state.tick) return true;
    return state.atlas.currentLocationId === question.locationId && quietSoloTown(state) && selectPaidInnRest(state) === null;
  } catch { return false; }
}

export function betterQuestionCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const make = (command: BetterQuestionCommand, label: string): DepthCommandCandidate => ({ id: betterQuestionCommandId(state.tick + 1, command), command, label, deciderId: state.hero.id });
  const question = state.betterQuestion;
  if (question !== null) return question.exchange === null && isValidCampaignBetterQuestion(state)
    ? betterQuestionResponses(question).map(response => make({ type: "answer-better-question", conversationId: question.conversationId, responseId: response.id }, response.text)) : null;
  const venue = selectBetterQuestionVenue(state);
  return venue === null ? null : [make({ type: "read-better-question-book", ...venue }, `read ${betterQuestionBook.title}`)];
}

export function stepCampaignBetterQuestion(state: DepthState, command: BetterQuestionCommand): BetterQuestion {
  if (!isValidCampaignBetterQuestion(state)) throw new Error("The better question has invalid history");
  if (command.type === "read-better-question-book") {
    const venue = selectBetterQuestionVenue(state);
    if (venue === null || ["conversationId", "locationId", "buildingId", "residentId"].some(key => venue[key as keyof BetterQuestionVenue] !== command[key as keyof typeof command])) throw new Error("No matching later public book is available");
    return { schemaVersion: 1, rulesVersion: "better-question-v1", contentVersion: 1, ...venue, heroId: state.hero.id,
      reading: { bookId: betterQuestionBook.id, expressionId: betterQuestionBook.expressionId, frameId: betterQuestionBook.frameId,
        sourceCommandId: betterQuestionCommandId(state.tick + 1, command), tick: state.tick + 1 }, exchange: null };
  }
  const question = state.betterQuestion;
  if (question === null || question.exchange !== null || command.conversationId !== question.conversationId) throw new Error("No matching better question awaits an answer");
  const response = betterQuestionResponses(question).find(entry => entry.id === command.responseId);
  if (response === undefined) throw new Error("The requested response is not known");
  return { ...question, exchange: exchangeReceipt(question, response, state.tick + 1) };
}
