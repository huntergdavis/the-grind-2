import { randomInt } from "../core/rng";

export type ReparteeClassification = "direct" | "near" | "category";
export type ReparteeOutcome = "victory" | "defeat" | "draw" | "retreat";
export type ReparteeFrameId = "reframe-the-premise" | "ask-for-the-result";

export interface ReparteeEntry {
  readonly id: string;
  readonly word: string;
  readonly definition: string;
  readonly frameId: ReparteeFrameId;
  readonly languageBand: "clean";
  readonly register: "plain" | "dry" | "pompous";
}

/** Original Grind content; no dialogue or dictionary text is imported. */
export const reparteeEntries: readonly ReparteeEntry[] = Object.freeze([
  { id: "borrowed-light", word: "borrowed light", definition: "Knowledge received from someone else, which need not leave its borrower in the dark.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "footnote", word: "footnote", definition: "A small acknowledgement that an idea has company.", frameId: "reframe-the-premise", languageBand: "clean", register: "dry" },
  { id: "kindling", word: "kindling", definition: "A modest beginning that helps a larger thought catch fire.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "margin", word: "margin", definition: "The space beside someone else's words where your own may begin.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "windbag", word: "windbag", definition: "A person who mistakes everyone else's silence for a request to continue.", frameId: "ask-for-the-result", languageBand: "clean", register: "dry" },
  { id: "thunder", word: "thunder", definition: "A splendid noise that should not be mistaken for the rain.", frameId: "ask-for-the-result", languageBand: "clean", register: "pompous" },
  { id: "bell", word: "bell", definition: "A useful way to summon a meeting, but a poor substitute for its business.", frameId: "ask-for-the-result", languageBand: "clean", register: "plain" },
  { id: "kettle", word: "kettle", definition: "An excellent whistler, once someone else has done the heating.", frameId: "ask-for-the-result", languageBand: "clean", register: "dry" },
  { id: "compass", word: "compass", definition: "A guide to direction, not an objection to travelling.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "bridge", word: "bridge", definition: "A practical answer to a gap that enthusiasm alone cannot fill.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "lantern", word: "lantern", definition: "Evidence that looking ahead and going ahead can be the same plan.", frameId: "reframe-the-premise", languageBand: "clean", register: "plain" },
  { id: "sound-footing", word: "sound footing", definition: "Preparation that lets the next step be a brave one rather than the last one.", frameId: "reframe-the-premise", languageBand: "clean", register: "dry" },
]);

export const reparteeBook = Object.freeze({
  id: "small-dictionary-large-nuisances",
  contentVersion: 1 as const,
  title: "A Small Dictionary for Large Nuisances",
  excerpt: "Windbag: a person who mistakes everyone else's silence for a request to continue.",
  entryIds: Object.freeze(reparteeEntries.map((entry) => entry.id)),
  frameIds: Object.freeze(["reframe-the-premise", "ask-for-the-result"] as const),
  provenance: "Original Grind writing; clean language; authored semantic counters, content version 1.",
});

export const reparteeChallenges = Object.freeze([
  Object.freeze({ id: "borrowed-thought", claim: "learning-is-dependence", text: "If you need a book to think, whose thoughts are you really having?" }),
  Object.freeze({ id: "loud-authority", claim: "loudness-proves-authority", text: "The strongest voice should lead. Mine reaches the back of the square." }),
  Object.freeze({ id: "cautious-courage", claim: "caution-is-cowardice", text: "A cautious hero is only a coward with a longer explanation." }),
]);

export interface ReparteeReadingContext {
  readonly actorId: string;
  readonly locationId: string;
  readonly buildingId: string;
  readonly sourceCommandId: string;
  readonly tick: number;
}

export interface BookReadingReceipt extends ReparteeReadingContext {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly contentVersion: 1;
  readonly firstRead: true;
  readonly addedEntryIds: readonly string[];
  readonly addedFrameIds: readonly ReparteeFrameId[];
}

export interface ReparteeStartContext extends ReparteeReadingContext {
  readonly encounterId: string;
  readonly residentId: string;
  /** F1 stays at its reading venue; a witnessed encore can use another actual town. */
  readonly rulesVersion?: 1 | 2;
}

export interface ReparteeResponse {
  readonly id: string;
  readonly challengeId: string;
  readonly text: string;
  readonly style: "direct" | "near" | "category" | "personality";
  readonly classification: ReparteeClassification;
  readonly delta: -1 | 0 | 1;
  readonly entryIds: readonly string[];
  readonly frameId: ReparteeFrameId | null;
  readonly explanation: string;
}

export interface ReparteeRoundReceipt {
  readonly roundIndex: number;
  readonly challengeId: string;
  readonly call: string;
  readonly responseId: string;
  readonly reply: string;
  readonly classification: ReparteeClassification;
  readonly delta: -1 | 0 | 1;
  readonly momentum: number;
  readonly entryIds: readonly string[];
  readonly frameId: ReparteeFrameId | null;
  readonly readingSourceCommandId: string | null;
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly explanation: string;
}

export interface ReparteeDuel {
  readonly encounterId: string;
  readonly rulesVersion: 1 | 2;
  readonly contentVersion: 1;
  readonly actorId: string;
  readonly residentId: string;
  readonly locationId: string;
  readonly buildingId: string;
  readonly sourceCommandId: string;
  readonly startedTick: number;
  readonly readingSourceCommandId: string;
  readonly roundIndex: number;
  readonly momentum: number;
  readonly rounds: readonly ReparteeRoundReceipt[];
}

export interface ReparteeReceipt extends ReparteeDuel {
  readonly outcome: ReparteeOutcome;
  readonly completedTick: number;
  readonly completionCommandId: string;
  readonly reputationBefore: number;
  readonly reputationAfter: number;
  readonly reputationAward: 0 | 1;
  readonly reputationCap: number;
  readonly consumedOpportunity: true;
}

export interface ReparteeProgress {
  readonly schemaVersion: 1;
  readonly reading: BookReadingReceipt | null;
  readonly active: ReparteeDuel | null;
  readonly completed: ReparteeReceipt | null;
}

export interface ReparteeRoundContext {
  readonly encounterId: string;
  readonly roundIndex: number;
  readonly responseId: string;
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly reputationBefore: number;
  readonly reputationCap: number;
}

const directReplies = Object.freeze([
  Object.freeze([
    "Borrowed light still lets me see. Learning an idea is not surrendering my judgment.",
    "A footnote admits where a thought began, not where it must end. I can read and disagree.",
    "A book is kindling, not a leash. Someone may start the fire without choosing what I cook.",
    "There is room in the margin for my answer. Reading your thought does not make it mine to obey.",
  ]),
  Object.freeze([
    "A windbag can fill a square. Give us a useful plan, and we can discuss who leads it.",
    "Thunder reaches a whole valley. We still wait for rain before calling it useful.",
    "A bell can call the meeting; it cannot chair it. What do you propose once we are listening?",
    "A kettle can outshout a cook. I would still ask the cook what is for supper.",
  ]),
  Object.freeze([
    "A compass does not refuse the journey. It lets courage choose where to go.",
    "Checking a bridge is how I mean to cross it. Caution can serve courage instead of replacing it.",
    "A lantern is for walking into the dark, not staying out of it. Looking ahead can be brave.",
    "Sound footing lets me take the next step. I can be careful about how without retreating from why.",
  ]),
]);

const starterReplies = Object.freeze([
  Object.freeze([
    ["The binding is handsome, though. I suppose that does not answer your question.", "near", "near", "Admiring the book is intelligible, but does not answer whether learning prevents independent thought."],
    ["I challenge your jurisdiction over soup. This square has suffered enough unlicensed ladles.", "category", "category", "A dispute about soup has no bearing on whether borrowed knowledge permits independent thought."],
    ["Perhaps I am still learning to think for myself. I would rather admit that than pretend to know everything.", "personality", "near", "An honest admission expresses humility without disproving the resident's claim."],
  ] as const),
  Object.freeze([
    ["You do have an impressive set of lungs. I will grant you the back of the square.", "near", "near", "Acknowledging the volume leaves the claim that volume confers authority unanswered."],
    ["Then I demand a smaller spoon. No proper pudding should require this much shouting.", "category", "category", "A request about pudding does not address who should lead or why."],
    ["I can shout as well! LOOK HOW MUCH LEADERSHIP I AM DOING!", "personality", "category", "Copying the boast accepts its faulty premise and supplies no reason to trust either speaker's leadership."],
  ] as const),
  Object.freeze([
    ["A shorter explanation, then: I dislike being frightened. There, I have saved us both a little time.", "near", "near", "Naming fear honestly does not distinguish caution from cowardice."],
    ["Your argument is plainly under-seasoned. Bring pepper, and we can resume the hearing.", "category", "category", "Seasoning an argument is a deliberate category mistake, not an answer about courage."],
    ["I will accept being called cautious. I do not need your applause badly enough to perform a foolish dare.", "personality", "near", "Refusing the dare is a dignified concession, not proof that the claim about courage is false."],
  ] as const),
] as const);

export function createReparteeProgress(): ReparteeProgress {
  return { schemaVersion: 1, reading: null, active: null, completed: null };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f]/u.test(value);
}

function tick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && expected.every((entry, index) => Object.hasOwn(value, index) && value[index] === entry);
}

function validContext(value: ReparteeReadingContext): boolean {
  return identifier(value.actorId) && identifier(value.locationId) && identifier(value.buildingId)
    && identifier(value.sourceCommandId) && tick(value.tick);
}

/** Re-reading is deliberately unavailable in this finite first arc. */
export function readReparteeBook(progress: ReparteeProgress, context: ReparteeReadingContext): ReparteeProgress {
  if (!isValidReparteeProgress(progress) || !validContext(context) || progress.reading !== null) return progress;
  return {
    ...progress,
    reading: {
      schemaVersion: 1, bookId: reparteeBook.id, contentVersion: 1,
      actorId: context.actorId, locationId: context.locationId, buildingId: context.buildingId,
      sourceCommandId: context.sourceCommandId, tick: context.tick, firstRead: true,
      addedEntryIds: [...reparteeBook.entryIds], addedFrameIds: [...reparteeBook.frameIds],
    },
  };
}

export function startRepartee(progress: ReparteeProgress, context: ReparteeStartContext): ReparteeProgress {
  const reading = progress.reading;
  const rulesVersion = context.rulesVersion ?? 1;
  if (!isValidReparteeProgress(progress) || !validContext(context) || !identifier(context.encounterId)
    || !identifier(context.residentId) || context.actorId === context.residentId || reading === null
    || progress.active !== null || progress.completed !== null || context.tick <= reading.tick
    || ![1, 2].includes(rulesVersion) || context.actorId !== reading.actorId
    || rulesVersion === 1 && (context.locationId !== reading.locationId || context.buildingId !== reading.buildingId)
    || context.sourceCommandId === reading.sourceCommandId) return progress;
  return {
    ...progress,
    active: {
      encounterId: context.encounterId, rulesVersion, contentVersion: 1,
      actorId: context.actorId, residentId: context.residentId, locationId: context.locationId,
      buildingId: context.buildingId, sourceCommandId: context.sourceCommandId,
      startedTick: context.tick, readingSourceCommandId: reading.sourceCommandId,
      roundIndex: 0, momentum: 0, rounds: [],
    },
  };
}

function responses(reading: BookReadingReceipt | null, roundIndex: number, encounterId: string): readonly ReparteeResponse[] {
  const call = reparteeChallenges[roundIndex];
  const starters = starterReplies[roundIndex];
  if (call === undefined || starters === undefined) return [];
  const choices: ReparteeResponse[] = starters.map(([text, style, classification, explanation]) => ({
    id: `${call.id}:${style}`, challengeId: call.id, text, style, classification,
    delta: classification === "category" ? -1 : 0, entryIds: [], frameId: null, explanation,
  }));
  if (reading !== null) {
    // This keyed cosmetic choice never changes the claim, score, or available meaning.
    const variant = randomInt(4, "repartee-content-v1", "repartee", encounterId, 0, call.id);
    const entry = reparteeEntries[roundIndex * 4 + variant];
    const text = directReplies[roundIndex]?.[variant];
    if (entry !== undefined && text !== undefined && reading.addedEntryIds.includes(entry.id)
      && reading.addedFrameIds.includes(entry.frameId)) {
      choices.unshift({
        id: `${call.id}:direct:${entry.id}`, challengeId: call.id, text, style: "direct",
        classification: "direct", delta: 1, entryIds: [entry.id], frameId: entry.frameId,
        explanation: roundIndex === 0 ? "Admits the borrowed source while rejecting the claim that learning removes independent judgment."
          : roundIndex === 1 ? "Distinguishes being heard from providing useful leadership; volume alone cannot establish authority."
          : "Distinguishes preparation for a brave act from refusal to attempt it; caution does not imply cowardice.",
      });
    }
  }
  return choices;
}

/** Also exposes the starter/learned comparison before admission, without inventing a reading. */
export function reparteeResponses(progress: ReparteeProgress, roundIndex = progress.active?.roundIndex ?? 0): readonly ReparteeResponse[] {
  if (!isValidReparteeProgress(progress) || !Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 2) return [];
  return responses(progress.reading, roundIndex, progress.active?.encounterId ?? progress.completed?.encounterId ?? "preview");
}

function makeRound(duel: ReparteeDuel, reading: BookReadingReceipt, choice: ReparteeResponse, context: Pick<ReparteeRoundContext, "sourceCommandId" | "tick">): ReparteeRoundReceipt {
  return {
    roundIndex: duel.roundIndex, challengeId: choice.challengeId,
    call: reparteeChallenges[duel.roundIndex]!.text, responseId: choice.id, reply: choice.text,
    classification: choice.classification, delta: choice.delta, momentum: duel.momentum + choice.delta,
    entryIds: [...choice.entryIds], frameId: choice.frameId,
    readingSourceCommandId: choice.frameId === null ? null : reading.sourceCommandId,
    sourceCommandId: context.sourceCommandId, tick: context.tick, explanation: choice.explanation,
  };
}

function completion(duel: ReparteeDuel, outcome: ReparteeOutcome, context: ReparteeRoundContext): ReparteeReceipt {
  const reputationAfter = outcome === "victory" ? Math.min(context.reputationCap, context.reputationBefore + 1) : context.reputationBefore;
  return {
    ...duel, outcome, completedTick: context.tick, completionCommandId: context.sourceCommandId,
    reputationBefore: context.reputationBefore, reputationAfter,
    reputationAward: (reputationAfter - context.reputationBefore) as 0 | 1,
    reputationCap: context.reputationCap, consumedOpportunity: true,
  };
}

/** The caller binds location/safety and applies a new completion's exact town delta once. */
export function resolveReparteeRound(progress: ReparteeProgress, context: ReparteeRoundContext): ReparteeProgress {
  const duel = progress.active, reading = progress.reading;
  if (!isValidReparteeProgress(progress) || duel === null || reading === null
    || context.encounterId !== duel.encounterId || context.roundIndex !== duel.roundIndex
    || !identifier(context.sourceCommandId) || !tick(context.tick)
    || context.tick <= (duel.rounds.at(-1)?.tick ?? duel.startedTick)
    || context.sourceCommandId === reading.sourceCommandId || context.sourceCommandId === duel.sourceCommandId
    || duel.rounds.some((round) => round.sourceCommandId === context.sourceCommandId)
    || !Number.isSafeInteger(context.reputationBefore) || !Number.isSafeInteger(context.reputationCap)
    || context.reputationBefore < 0 || context.reputationCap < context.reputationBefore) return progress;
  if (context.responseId === "retreat") {
    return { ...progress, active: null, completed: completion(duel, "retreat", context) };
  }
  const choice = responses(reading, duel.roundIndex, duel.encounterId).find((entry) => entry.id === context.responseId);
  if (choice === undefined) return progress;
  const round = makeRound(duel, reading, choice, context);
  const updated: ReparteeDuel = { ...duel, roundIndex: duel.roundIndex + 1, momentum: round.momentum, rounds: [...duel.rounds, round] };
  if (updated.roundIndex < 3) return { ...progress, active: updated };
  const outcome = updated.momentum > 0 ? "victory" : updated.momentum < 0 ? "defeat" : "draw";
  return { ...progress, active: null, completed: completion(updated, outcome, context) };
}

const readingKeys = ["schemaVersion", "bookId", "contentVersion", "actorId", "locationId", "buildingId", "sourceCommandId", "tick", "firstRead", "addedEntryIds", "addedFrameIds"];
const duelKeys = ["encounterId", "rulesVersion", "contentVersion", "actorId", "residentId", "locationId", "buildingId", "sourceCommandId", "startedTick", "readingSourceCommandId", "roundIndex", "momentum", "rounds"];
const completionKeys = [...duelKeys, "outcome", "completedTick", "completionCommandId", "reputationBefore", "reputationAfter", "reputationAward", "reputationCap", "consumedOpportunity"];

function validReading(value: unknown): value is BookReadingReceipt {
  if (!exactKeys(value, readingKeys)) return false;
  return value.schemaVersion === 1 && value.bookId === reparteeBook.id && value.contentVersion === 1
    && identifier(value.actorId) && identifier(value.locationId) && identifier(value.buildingId)
    && identifier(value.sourceCommandId) && tick(value.tick) && value.firstRead === true
    && sameStrings(value.addedEntryIds, reparteeBook.entryIds) && sameStrings(value.addedFrameIds, reparteeBook.frameIds);
}

function sameRound(value: unknown, expected: ReparteeRoundReceipt): boolean {
  if (!exactKeys(value, Object.keys(expected))) return false;
  return Object.entries(expected).every(([key, field]) => key === "entryIds"
    ? sameStrings(value[key], expected.entryIds) : value[key] === field);
}

function normalizedLine(text: string): string {
  return text.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim();
}

function validDuel(value: unknown, reading: BookReadingReceipt, completed: boolean): value is ReparteeDuel | ReparteeReceipt {
  if (!exactKeys(value, completed ? completionKeys : duelKeys)
    || !identifier(value.encounterId) || (value.rulesVersion !== 1 && value.rulesVersion !== 2) || value.contentVersion !== 1
    || value.actorId !== reading.actorId || !identifier(value.locationId) || !identifier(value.buildingId)
    || value.rulesVersion === 1 && (value.locationId !== reading.locationId || value.buildingId !== reading.buildingId)
    || !identifier(value.residentId) || value.residentId === value.actorId
    || !identifier(value.sourceCommandId) || value.sourceCommandId === reading.sourceCommandId
    || !tick(value.startedTick) || value.startedTick <= reading.tick || value.readingSourceCommandId !== reading.sourceCommandId
    || !Array.isArray(value.rounds) || value.rounds.length > (completed ? 3 : 2)
    || value.roundIndex !== value.rounds.length || !Number.isSafeInteger(value.momentum)) return false;
  const duel = value as unknown as ReparteeDuel;
  const commandIds = new Set([reading.sourceCommandId, duel.sourceCommandId]);
  const lines = new Set<string>();
  let replay: ReparteeDuel = { ...duel, roundIndex: 0, momentum: 0, rounds: [] };
  for (const unknownRound of value.rounds) {
    if (!record(unknownRound) || !identifier(unknownRound.sourceCommandId) || commandIds.has(unknownRound.sourceCommandId)
      || !tick(unknownRound.tick) || unknownRound.tick <= (replay.rounds.at(-1)?.tick ?? replay.startedTick)) return false;
    const choice = responses(reading, replay.roundIndex, duel.encounterId).find((entry) => entry.id === unknownRound.responseId);
    if (choice === undefined) return false;
    const expected = makeRound(replay, reading, choice, { sourceCommandId: unknownRound.sourceCommandId, tick: unknownRound.tick });
    if (!sameRound(unknownRound, expected) || lines.has(normalizedLine(expected.call)) || lines.has(normalizedLine(expected.reply))) return false;
    commandIds.add(expected.sourceCommandId);
    lines.add(normalizedLine(expected.call));
    lines.add(normalizedLine(expected.reply));
    replay = { ...replay, roundIndex: replay.roundIndex + 1, momentum: expected.momentum, rounds: [...replay.rounds, expected] };
  }
  if (duel.momentum !== replay.momentum) return false;
  if (!completed) return true;
  const receipt = value as unknown as ReparteeReceipt;
  if (!tick(receipt.completedTick) || !identifier(receipt.completionCommandId) || receipt.consumedOpportunity !== true
    || !Number.isSafeInteger(receipt.reputationBefore) || receipt.reputationBefore < 0
    || !Number.isSafeInteger(receipt.reputationCap) || receipt.reputationCap < receipt.reputationBefore) return false;
  if (receipt.outcome === "retreat") {
    if (receipt.roundIndex >= 3 || receipt.completedTick <= (receipt.rounds.at(-1)?.tick ?? receipt.startedTick)
      || commandIds.has(receipt.completionCommandId)) return false;
  } else {
    const expectedOutcome = receipt.momentum > 0 ? "victory" : receipt.momentum < 0 ? "defeat" : "draw";
    if (receipt.roundIndex !== 3 || receipt.outcome !== expectedOutcome
      || receipt.completedTick !== receipt.rounds.at(-1)?.tick || receipt.completionCommandId !== receipt.rounds.at(-1)?.sourceCommandId) return false;
  }
  const after = receipt.outcome === "victory" ? Math.min(receipt.reputationCap, receipt.reputationBefore + 1) : receipt.reputationBefore;
  return receipt.reputationAfter === after && receipt.reputationAward === after - receipt.reputationBefore;
}

/** Validates meaning and provenance by replaying the tiny committed transcript, not trusting its score. */
export function isValidReparteeProgress(value: unknown): value is ReparteeProgress {
  if (!exactKeys(value, ["schemaVersion", "reading", "active", "completed"]) || value.schemaVersion !== 1) return false;
  if (value.reading === null) return value.active === null && value.completed === null;
  if (!validReading(value.reading) || (value.active !== null && value.completed !== null)) return false;
  return (value.active === null || validDuel(value.active, value.reading, false))
    && (value.completed === null || validDuel(value.completed, value.reading, true));
}
