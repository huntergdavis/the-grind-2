import type { DepthCommand } from "../depth/types";
import { canonicalHash, canonicalStringify } from "./canonical";
import type {
  CampaignLegacyState,
  LegacyAppearanceFact,
  LegacyBelief,
  LegacyLessonFact,
  LegacyManifestationState,
  LegacyMeetingFact,
  LegacyMentorArcState,
  LegacyMentorFarewellFact,
  LegacyMentorMemoryFact,
  LegacyMentorPromiseFact,
  LegacyMentorReturnFact,
  LegacyRecognitionFact,
  LegendCard,
  WorldState,
} from "./types";

export const maximumLegacyManifestations = 3;

export interface LegacyManifestationPlan {
  card: LegendCard;
  abilityId: string;
  abilityName: string;
  abilityLevel: number;
  belief: LegacyBelief;
  scheduledTownVisit: number;
  townVisitOrdinal: number;
}

export interface LegacyManifestationResolution {
  manifestations: LegacyManifestationState;
  appearance: LegacyAppearanceFact;
  meeting: LegacyMeetingFact;
  recognition: LegacyRecognitionFact;
  lesson: LegacyLessonFact;
}

export type LegacyMentorArcBeatPlan =
  | {
      phase: "promise";
      card: LegendCard;
      scheduledTownVisit: number;
      townVisitOrdinal: number;
      completedQuestBaseline: number;
    }
  | {
      phase: "return";
      card: LegendCard;
      scheduledTownVisit: number;
      townVisitOrdinal: number;
      completedQuestBaseline: number;
      completedQuestCount: number;
    }
  | {
      phase: "farewell";
      card: LegendCard;
      scheduledTownVisit: number;
      townVisitOrdinal: number;
    };

export type LegacyMentorArcBeatResolution =
  | { phase: "promise"; manifestations: LegacyManifestationState; promise: LegacyMentorPromiseFact }
  | { phase: "return"; manifestations: LegacyManifestationState; returned: LegacyMentorReturnFact }
  | { phase: "farewell"; manifestations: LegacyManifestationState; farewell: LegacyMentorFarewellFact; memory: LegacyMentorMemoryFact };

interface PreviousLegacyManifestationStateV1 {
  schemaVersion: 1;
  scheduleVersion: 1;
  townVisitBaseline: number;
  appearances: readonly LegacyAppearanceFact[];
  meetings: readonly LegacyMeetingFact[];
  recognitions: readonly LegacyRecognitionFact[];
  lessons: readonly LegacyLessonFact[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function factId(prefix: string, content: Record<string, unknown>): string {
  return `${prefix}:${canonicalHash(content)}`;
}

function validFactId(value: unknown, prefix: string, content: Record<string, unknown>): boolean {
  return value === factId(prefix, content);
}

function isValidAppearanceFact(value: unknown): value is LegacyAppearanceFact {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "legendId", "sourceChampionId", "kind", "tick", "locationId",
    "sourceCommandId", "scheduledTownVisit", "townVisitOrdinal",
  ])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.kind === "mortal-mentor" &&
    boundedString(value.legendId, 256) &&
    boundedString(value.sourceChampionId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    boundedString(value.locationId, 256) &&
    boundedString(value.sourceCommandId, 512) &&
    positiveSafeInteger(value.scheduledTownVisit) &&
    positiveSafeInteger(value.townVisitOrdinal) &&
    value.townVisitOrdinal >= value.scheduledTownVisit &&
    validFactId(value.id, "legacy-appearance", content);
}

function isValidMeetingFact(value: unknown): value is LegacyMeetingFact {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "id", "appearanceId", "legendId", "heroId", "tick", "interaction"])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.interaction === "witnessed-demonstration" &&
    boundedString(value.appearanceId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    validFactId(value.id, "legacy-meeting", content);
}

function isValidRecognitionFact(value: unknown): value is LegacyRecognitionFact {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "id", "meetingId", "appearanceId", "legendId", "heroId", "tick", "recognition", "belief"])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.recognition === "introduced-by-name" &&
    (value.belief === "believes-champion-claim" || value.belief === "withholds-judgment") &&
    boundedString(value.meetingId, 256) &&
    boundedString(value.appearanceId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    validFactId(value.id, "legacy-recognition", content);
}

function isValidLessonFact(value: unknown): value is LegacyLessonFact {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "id", "meetingId", "appearanceId", "legendId", "heroId", "tick", "abilityId", "abilityName", "abilityLevelAtLesson", "practice", "importedPower"])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.practice === "rehearsed-existing-art" &&
    value.importedPower === false &&
    boundedString(value.meetingId, 256) &&
    boundedString(value.appearanceId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    boundedString(value.abilityId, 256) &&
    boundedString(value.abilityName, 120) &&
    positiveSafeInteger(value.abilityLevelAtLesson) &&
    value.abilityLevelAtLesson <= 20 &&
    validFactId(value.id, "legacy-lesson", content);
}

function isValidPromiseFact(value: unknown): value is LegacyMentorPromiseFact {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "meetingId", "legendId", "heroId", "tick", "locationId",
    "sourceCommandId", "scheduledTownVisit", "townVisitOrdinal", "relationship", "promise",
    "completedQuestBaseline", "importedPower", "mechanicalEffect",
  ])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.relationship === "promised-return" &&
    value.promise === "return-after-next-quest" &&
    value.importedPower === false &&
    value.mechanicalEffect === "none" &&
    boundedString(value.meetingId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    boundedString(value.locationId, 256) &&
    boundedString(value.sourceCommandId, 512) &&
    positiveSafeInteger(value.scheduledTownVisit) &&
    positiveSafeInteger(value.townVisitOrdinal) &&
    value.townVisitOrdinal >= value.scheduledTownVisit &&
    nonNegativeSafeInteger(value.completedQuestBaseline) &&
    validFactId(value.id, "legacy-mentor-promise", content);
}

function isValidReturnFact(value: unknown): value is LegacyMentorReturnFact {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "promiseId", "legendId", "heroId", "tick", "locationId",
    "sourceCommandId", "scheduledTownVisit", "townVisitOrdinal", "relationship",
    "completedQuestBaseline", "completedQuestCount", "importedPower", "mechanicalEffect",
  ])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.relationship === "promise-kept" &&
    value.importedPower === false &&
    value.mechanicalEffect === "none" &&
    boundedString(value.promiseId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    boundedString(value.locationId, 256) &&
    boundedString(value.sourceCommandId, 512) &&
    positiveSafeInteger(value.scheduledTownVisit) &&
    positiveSafeInteger(value.townVisitOrdinal) &&
    value.townVisitOrdinal >= value.scheduledTownVisit &&
    nonNegativeSafeInteger(value.completedQuestBaseline) &&
    positiveSafeInteger(value.completedQuestCount) &&
    value.completedQuestCount > value.completedQuestBaseline &&
    validFactId(value.id, "legacy-mentor-return", content);
}

function isValidFarewellFact(value: unknown): value is LegacyMentorFarewellFact {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "returnId", "legendId", "heroId", "tick", "locationId",
    "sourceCommandId", "scheduledTownVisit", "townVisitOrdinal", "relationship",
    "importedPower", "mechanicalEffect",
  ])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.relationship === "parted-as-friends" &&
    value.importedPower === false &&
    value.mechanicalEffect === "none" &&
    boundedString(value.returnId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.tick) &&
    boundedString(value.locationId, 256) &&
    boundedString(value.sourceCommandId, 512) &&
    positiveSafeInteger(value.scheduledTownVisit) &&
    positiveSafeInteger(value.townVisitOrdinal) &&
    value.townVisitOrdinal >= value.scheduledTownVisit &&
    validFactId(value.id, "legacy-mentor-farewell", content);
}

function isValidMemoryFact(value: unknown): value is LegacyMentorMemoryFact {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "farewellId", "legendId", "heroId", "recordedTick",
    "locationId", "memory", "importedPower", "mechanicalEffect",
  ])) return false;
  const { id: _id, ...content } = value;
  return value.schemaVersion === 1 &&
    value.memory === "kept-road-promise" &&
    value.importedPower === false &&
    value.mechanicalEffect === "none" &&
    boundedString(value.farewellId, 256) &&
    boundedString(value.legendId, 256) &&
    boundedString(value.heroId, 256) &&
    nonNegativeSafeInteger(value.recordedTick) &&
    boundedString(value.locationId, 256) &&
    validFactId(value.id, "legacy-mentor-memory", content);
}

function validManifestationFactGraph(
  value: PreviousLegacyManifestationStateV1 | LegacyManifestationState,
  legacy: CampaignLegacyState,
): boolean {
  if (
    !nonNegativeSafeInteger(value.townVisitBaseline) ||
    !Array.isArray(value.appearances) ||
    !Array.isArray(value.meetings) ||
    !Array.isArray(value.recognitions) ||
    !Array.isArray(value.lessons) ||
    value.appearances.length > maximumLegacyManifestations ||
    value.appearances.length > legacy.cards.length ||
    value.meetings.length !== value.appearances.length ||
    value.recognitions.length !== value.appearances.length ||
    value.lessons.length !== value.appearances.length ||
    !value.appearances.every(isValidAppearanceFact) ||
    !value.meetings.every(isValidMeetingFact) ||
    !value.recognitions.every(isValidRecognitionFact) ||
    !value.lessons.every(isValidLessonFact) ||
    new Set(value.appearances.map((fact) => fact.id)).size !== value.appearances.length ||
    new Set(value.appearances.map((fact) => fact.legendId)).size !== value.appearances.length ||
    new Set(value.meetings.map((fact) => fact.id)).size !== value.meetings.length ||
    new Set(value.recognitions.map((fact) => fact.id)).size !== value.recognitions.length ||
    new Set(value.lessons.map((fact) => fact.id)).size !== value.lessons.length
  ) return false;
  for (let index = 0; index < value.appearances.length; index += 1) {
    const card = legacy.cards[index];
    const appearance = value.appearances[index];
    const meeting = value.meetings[index];
    const recognition = value.recognitions[index];
    const lesson = value.lessons[index];
    if (
      card === undefined || appearance === undefined || meeting === undefined || recognition === undefined || lesson === undefined ||
      appearance.legendId !== card.id || appearance.sourceChampionId !== card.sourceChampionId ||
      (index > 0 && value.appearances[index - 1]!.tick >= appearance.tick) ||
      meeting.appearanceId !== appearance.id || meeting.legendId !== appearance.legendId || meeting.tick !== appearance.tick ||
      recognition.meetingId !== meeting.id || recognition.appearanceId !== appearance.id || recognition.legendId !== appearance.legendId ||
      recognition.heroId !== meeting.heroId || recognition.tick !== appearance.tick ||
      lesson.meetingId !== meeting.id || lesson.appearanceId !== appearance.id || lesson.legendId !== appearance.legendId ||
      lesson.heroId !== meeting.heroId || lesson.tick !== appearance.tick
    ) return false;
  }
  return true;
}

function mentorArcShell(
  manifestations: Pick<LegacyManifestationState, "appearances" | "meetings"> | PreviousLegacyManifestationStateV1,
): LegacyMentorArcState | null {
  const appearance = manifestations.appearances[0];
  const meeting = manifestations.meetings[0];
  if (appearance === undefined || meeting === undefined) return null;
  return {
    schemaVersion: 1,
    legendId: appearance.legendId,
    appearanceId: appearance.id,
    meetingId: meeting.id,
    heroId: meeting.heroId,
    promiseFact: null,
    returnFact: null,
    farewellFact: null,
    memoryFact: null,
  };
}

function isValidMentorArc(value: unknown, manifestations: LegacyManifestationState): value is LegacyMentorArcState {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "legendId", "appearanceId", "meetingId", "heroId",
    "promiseFact", "returnFact", "farewellFact", "memoryFact",
  ])) return false;
  const appearance = manifestations.appearances[0];
  const meeting = manifestations.meetings[0];
  if (
    value.schemaVersion !== 1 || appearance === undefined || meeting === undefined ||
    value.legendId !== appearance.legendId || value.appearanceId !== appearance.id ||
    value.meetingId !== meeting.id || value.heroId !== meeting.heroId
  ) return false;
  const promise = value.promiseFact;
  const returned = value.returnFact;
  const farewell = value.farewellFact;
  const memory = value.memoryFact;
  if (promise === null) return returned === null && farewell === null && memory === null;
  if (!isValidPromiseFact(promise) || promise.meetingId !== meeting.id || promise.legendId !== appearance.legendId ||
      promise.heroId !== meeting.heroId || promise.tick <= meeting.tick || promise.townVisitOrdinal <= appearance.townVisitOrdinal) return false;
  if (returned === null) return farewell === null && memory === null;
  if (!isValidReturnFact(returned) || returned.promiseId !== promise.id || returned.legendId !== promise.legendId ||
      returned.heroId !== promise.heroId || returned.tick <= promise.tick || returned.townVisitOrdinal <= promise.townVisitOrdinal ||
      returned.completedQuestBaseline !== promise.completedQuestBaseline) return false;
  if (farewell === null) return memory === null;
  if (!isValidFarewellFact(farewell) || farewell.returnId !== returned.id || farewell.legendId !== returned.legendId ||
      farewell.heroId !== returned.heroId || farewell.tick <= returned.tick || farewell.townVisitOrdinal <= returned.townVisitOrdinal) return false;
  return isValidMemoryFact(memory) && memory.farewellId === farewell.id && memory.legendId === farewell.legendId &&
    memory.heroId === farewell.heroId && memory.recordedTick === farewell.tick && memory.locationId === farewell.locationId;
}

export function createLegacyManifestationState(townVisitBaseline = 0): LegacyManifestationState {
  if (!nonNegativeSafeInteger(townVisitBaseline)) throw new RangeError("Legacy manifestation visit baseline must be a non-negative safe integer");
  return {
    schemaVersion: 2,
    scheduleVersion: 1,
    townVisitBaseline,
    appearances: [],
    meetings: [],
    recognitions: [],
    lessons: [],
    mentorArc: null,
  };
}

export function isValidLegacyManifestationState(
  value: unknown,
  legacy: CampaignLegacyState,
): value is LegacyManifestationState {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "scheduleVersion", "townVisitBaseline", "appearances", "meetings", "recognitions", "lessons", "mentorArc",
  ])) return false;
  if (
    value.schemaVersion !== 2 ||
    value.scheduleVersion !== 1 ||
    !validManifestationFactGraph(value as unknown as LegacyManifestationState, legacy)
  ) return false;
  const state = value as unknown as LegacyManifestationState;
  return state.mentorArc === null
    ? state.appearances.length === 0
    : isValidMentorArc(state.mentorArc, state);
}

export function upgradeLegacyManifestationState(
  value: unknown,
  legacy: CampaignLegacyState,
): LegacyManifestationState {
  if (isValidLegacyManifestationState(value, legacy)) return value;
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "scheduleVersion", "townVisitBaseline", "appearances", "meetings", "recognitions", "lessons",
  ])) throw new TypeError("Legacy manifestation state violates schema invariants");
  if (value.schemaVersion !== 1 || value.scheduleVersion !== 1) {
    throw new RangeError("Unsupported legacy manifestation schema version");
  }
  const previous = value as unknown as PreviousLegacyManifestationStateV1;
  if (!validManifestationFactGraph(previous, legacy)) {
    throw new TypeError("Legacy manifestation state violates schema invariants");
  }
  const upgraded: LegacyManifestationState = {
    ...previous,
    schemaVersion: 2,
    mentorArc: mentorArcShell(previous),
  };
  if (!isValidLegacyManifestationState(upgraded, legacy)) {
    throw new TypeError("Legacy manifestation migration violates schema invariants");
  }
  return upgraded;
}

function stableOrdinal(value: string): number {
  return Number.parseInt(canonicalHash(value).slice(0, 8), 16) >>> 0;
}

export function totalTownVisits(state: Pick<WorldState, "depth">): number {
  return Object.values(state.depth.towns).reduce((sum, town) => sum + town.visits, 0);
}

function scheduleGap(campaignSeed: string, card: LegendCard, ordinal: number): number {
  return 4 + stableOrdinal(canonicalStringify({
    scheduleVersion: 1,
    campaignSeed,
    legendId: card.id,
    ordinal,
  })) % 4;
}

export function scheduledLegacyTownVisit(
  campaignSeed: string,
  legacy: CampaignLegacyState,
  manifestations: LegacyManifestationState,
  appearanceOrdinal: number,
): number {
  if (!Number.isSafeInteger(appearanceOrdinal) || appearanceOrdinal < 0 || appearanceOrdinal >= legacy.cards.length) {
    throw new RangeError("Legacy appearance ordinal is outside the selected card roster");
  }
  let scheduled = manifestations.townVisitBaseline;
  for (let index = 0; index <= appearanceOrdinal; index += 1) {
    const card = legacy.cards[index];
    if (card === undefined) throw new Error("Legacy schedule is missing a selected card");
    scheduled += scheduleGap(campaignSeed, card, index);
  }
  return scheduled;
}

export function projectLegacyManifestation(
  state: WorldState,
  command: DepthCommand,
): LegacyManifestationPlan | null {
  if (command.type !== "visit-town" || state.legacy.cards.length === 0) return null;
  if (
    state.depth.combat !== null ||
    state.depth.counterDuel !== null ||
    (state.depth.dungeon !== null && !state.depth.dungeon.completed) ||
    state.depth.pendingQuestReward !== null
  ) return null;
  const appearanceOrdinal = state.legacyManifestations.appearances.length;
  const card = state.legacy.cards[appearanceOrdinal];
  if (card === undefined) return null;
  const scheduledTownVisit = scheduledLegacyTownVisit(state.seed, state.legacy, state.legacyManifestations, appearanceOrdinal);
  const townVisitOrdinal = totalTownVisits(state) + 1;
  if (townVisitOrdinal < scheduledTownVisit) return null;
  const abilities = [...state.depth.hero.abilities].sort((left, right) => {
    const leftKey = canonicalHash({ selectorVersion: 1, campaignSeed: state.seed, legendId: card.id, abilityId: left.id });
    const rightKey = canonicalHash({ selectorVersion: 1, campaignSeed: state.seed, legendId: card.id, abilityId: right.id });
    return (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
  const ability = abilities[0];
  if (ability === undefined) return null;
  const belief: LegacyBelief = stableOrdinal(canonicalStringify({
    beliefVersion: 1,
    campaignSeed: state.seed,
    heroId: state.hero.id,
    legendId: card.id,
  })) % 3 === 0 ? "withholds-judgment" : "believes-champion-claim";
  return {
    card,
    abilityId: ability.id,
    abilityName: ability.name,
    abilityLevel: ability.level,
    belief,
    scheduledTownVisit,
    townVisitOrdinal,
  };
}

function withId<T extends Record<string, unknown>>(prefix: string, content: T): T & { id: string } {
  return { ...content, id: factId(prefix, content) };
}

export function resolveLegacyManifestation(
  state: WorldState,
  plan: LegacyManifestationPlan,
  sourceCommandId: string,
): LegacyManifestationResolution {
  const canonicalPlan = projectLegacyManifestation(state, { type: "visit-town" });
  if (canonicalPlan === null || canonicalStringify(canonicalPlan) !== canonicalStringify(plan)) {
    throw new Error("Legacy manifestation plan is not canonical");
  }
  const tick = state.tick + 1;
  const appearance = withId("legacy-appearance", {
    schemaVersion: 1 as const,
    legendId: plan.card.id,
    sourceChampionId: plan.card.sourceChampionId,
    kind: "mortal-mentor" as const,
    tick,
    locationId: state.depth.atlas.currentLocationId,
    sourceCommandId,
    scheduledTownVisit: plan.scheduledTownVisit,
    townVisitOrdinal: plan.townVisitOrdinal,
  });
  const meeting = withId("legacy-meeting", {
    schemaVersion: 1 as const,
    appearanceId: appearance.id,
    legendId: plan.card.id,
    heroId: state.hero.id,
    tick,
    interaction: "witnessed-demonstration" as const,
  });
  const recognition = withId("legacy-recognition", {
    schemaVersion: 1 as const,
    meetingId: meeting.id,
    appearanceId: appearance.id,
    legendId: plan.card.id,
    heroId: state.hero.id,
    tick,
    recognition: "introduced-by-name" as const,
    belief: plan.belief,
  });
  const lesson = withId("legacy-lesson", {
    schemaVersion: 1 as const,
    meetingId: meeting.id,
    appearanceId: appearance.id,
    legendId: plan.card.id,
    heroId: state.hero.id,
    tick,
    abilityId: plan.abilityId,
    abilityName: plan.abilityName,
    abilityLevelAtLesson: plan.abilityLevel,
    practice: "rehearsed-existing-art" as const,
    importedPower: false as const,
  });
  let manifestations: LegacyManifestationState = {
    ...state.legacyManifestations,
    appearances: [...state.legacyManifestations.appearances, appearance],
    meetings: [...state.legacyManifestations.meetings, meeting],
    recognitions: [...state.legacyManifestations.recognitions, recognition],
    lessons: [...state.legacyManifestations.lessons, lesson],
  };
  if (manifestations.mentorArc === null) {
    manifestations = { ...manifestations, mentorArc: mentorArcShell(manifestations) };
  }
  if (!isValidLegacyManifestationState(manifestations, state.legacy)) {
    throw new TypeError("Resolved legacy manifestation violates fact invariants");
  }
  return { manifestations, appearance, meeting, recognition, lesson };
}

function mentorArcScheduleGap(
  campaignSeed: string,
  arc: LegacyMentorArcState,
  phase: LegacyMentorArcBeatPlan["phase"],
  causalId: string,
): number {
  const bounds = phase === "promise"
    ? { minimum: 3, span: 3 }
    : phase === "return"
      ? { minimum: 6, span: 4 }
      : { minimum: 4, span: 3 };
  return bounds.minimum + stableOrdinal(canonicalStringify({
    scheduleVersion: 1,
    campaignSeed,
    legendId: arc.legendId,
    phase,
    causalId,
  })) % bounds.span;
}

export function scheduledLegacyMentorPromiseTownVisit(
  campaignSeed: string,
  manifestations: LegacyManifestationState,
): number {
  const arc = manifestations.mentorArc;
  const appearance = manifestations.appearances[0];
  if (arc === null || appearance === undefined) throw new Error("Legacy mentor promise schedule requires a genuine first appearance");
  return appearance.townVisitOrdinal + mentorArcScheduleGap(campaignSeed, arc, "promise", arc.meetingId);
}

export function scheduledLegacyMentorReturnTownVisit(
  campaignSeed: string,
  manifestations: LegacyManifestationState,
): number {
  const arc = manifestations.mentorArc;
  const promise = arc?.promiseFact;
  if (arc === null || promise === null || promise === undefined) throw new Error("Legacy mentor return schedule requires a promise");
  return promise.townVisitOrdinal + mentorArcScheduleGap(campaignSeed, arc, "return", promise.id);
}

export function scheduledLegacyMentorFarewellTownVisit(
  campaignSeed: string,
  manifestations: LegacyManifestationState,
): number {
  const arc = manifestations.mentorArc;
  const returned = arc?.returnFact;
  if (arc === null || returned === null || returned === undefined) throw new Error("Legacy mentor farewell schedule requires a return");
  return returned.townVisitOrdinal + mentorArcScheduleGap(campaignSeed, arc, "farewell", returned.id);
}

function legacyTownBeatIsSafe(state: WorldState, command: DepthCommand): boolean {
  if (command.type !== "visit-town") return false;
  if (
    state.depth.combat !== null ||
    state.depth.counterDuel !== null ||
    (state.depth.dungeon !== null && !state.depth.dungeon.completed) ||
    state.depth.pendingQuestReward !== null ||
    state.depth.quest.status !== "active" ||
    state.chronicle.at(-1)?.commandType === "visit-town"
  ) return false;
  const locationId = state.depth.atlas.currentLocationId;
  const location = state.depth.atlas.locations.find((candidate) => candidate.id === locationId);
  const town = state.depth.towns[locationId];
  return location?.kind === "town" && town !== undefined && town.visits > 0 &&
    state.depth.atlas.discoveredLocationIds.includes(locationId);
}

export function projectLegacyMentorArcBeat(
  state: WorldState,
  command: DepthCommand,
): LegacyMentorArcBeatPlan | null {
  const arc = state.legacyManifestations.mentorArc;
  if (arc === null || arc.memoryFact !== null || !legacyTownBeatIsSafe(state, command)) return null;
  if (projectLegacyManifestation(state, command) !== null) return null;
  const card = state.legacy.cards.find((candidate) => candidate.id === arc.legendId);
  if (card === undefined) return null;
  const townVisitOrdinal = totalTownVisits(state) + 1;
  if (arc.promiseFact === null) {
    const scheduledTownVisit = scheduledLegacyMentorPromiseTownVisit(state.seed, state.legacyManifestations);
    return townVisitOrdinal < scheduledTownVisit ? null : {
      phase: "promise",
      card,
      scheduledTownVisit,
      townVisitOrdinal,
      completedQuestBaseline: state.depth.totalCompletedQuests,
    };
  }
  if (arc.returnFact === null) {
    const scheduledTownVisit = scheduledLegacyMentorReturnTownVisit(state.seed, state.legacyManifestations);
    if (
      townVisitOrdinal < scheduledTownVisit ||
      state.depth.totalCompletedQuests <= arc.promiseFact.completedQuestBaseline
    ) return null;
    return {
      phase: "return",
      card,
      scheduledTownVisit,
      townVisitOrdinal,
      completedQuestBaseline: arc.promiseFact.completedQuestBaseline,
      completedQuestCount: state.depth.totalCompletedQuests,
    };
  }
  if (arc.farewellFact === null) {
    const scheduledTownVisit = scheduledLegacyMentorFarewellTownVisit(state.seed, state.legacyManifestations);
    return townVisitOrdinal < scheduledTownVisit ? null : {
      phase: "farewell",
      card,
      scheduledTownVisit,
      townVisitOrdinal,
    };
  }
  return null;
}

export function legacyMentorArcNeedsTownVisit(state: WorldState): boolean {
  const arc = state.legacyManifestations.mentorArc;
  if (arc === null || arc.memoryFact !== null) return false;
  const nextTownVisit = totalTownVisits(state) + 1;
  if (arc.promiseFact === null) return true;
  if (arc.returnFact === null) {
    const scheduled = scheduledLegacyMentorReturnTownVisit(state.seed, state.legacyManifestations);
    return nextTownVisit < scheduled || state.depth.totalCompletedQuests > arc.promiseFact.completedQuestBaseline;
  }
  return arc.farewellFact === null;
}

export function resolveLegacyMentorArcBeat(
  state: WorldState,
  plan: LegacyMentorArcBeatPlan,
  sourceCommandId: string,
): LegacyMentorArcBeatResolution {
  const canonicalPlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
  if (canonicalPlan === null || canonicalStringify(canonicalPlan) !== canonicalStringify(plan)) {
    throw new Error("Legacy mentor arc plan is not canonical");
  }
  const arc = state.legacyManifestations.mentorArc;
  if (arc === null) throw new Error("Legacy mentor arc resolution requires a genuine first meeting");
  const tick = state.tick + 1;
  const common = {
    schemaVersion: 1 as const,
    legendId: arc.legendId,
    heroId: arc.heroId,
    tick,
    locationId: state.depth.atlas.currentLocationId,
    sourceCommandId,
    scheduledTownVisit: plan.scheduledTownVisit,
    townVisitOrdinal: plan.townVisitOrdinal,
    importedPower: false as const,
    mechanicalEffect: "none" as const,
  };
  if (plan.phase === "promise") {
    const promise = withId("legacy-mentor-promise", {
      ...common,
      meetingId: arc.meetingId,
      relationship: "promised-return" as const,
      promise: "return-after-next-quest" as const,
      completedQuestBaseline: plan.completedQuestBaseline,
    });
    const manifestations: LegacyManifestationState = {
      ...state.legacyManifestations,
      mentorArc: { ...arc, promiseFact: promise },
    };
    if (!isValidLegacyManifestationState(manifestations, state.legacy)) throw new TypeError("Legacy mentor promise violates fact invariants");
    return { phase: "promise", manifestations, promise };
  }
  if (plan.phase === "return") {
    if (arc.promiseFact === null) throw new Error("Legacy mentor return requires a promise");
    const returned = withId("legacy-mentor-return", {
      ...common,
      promiseId: arc.promiseFact.id,
      relationship: "promise-kept" as const,
      completedQuestBaseline: plan.completedQuestBaseline,
      completedQuestCount: plan.completedQuestCount,
    });
    const manifestations: LegacyManifestationState = {
      ...state.legacyManifestations,
      mentorArc: { ...arc, returnFact: returned },
    };
    if (!isValidLegacyManifestationState(manifestations, state.legacy)) throw new TypeError("Legacy mentor return violates fact invariants");
    return { phase: "return", manifestations, returned };
  }
  if (arc.returnFact === null) throw new Error("Legacy mentor farewell requires a return");
  const farewell = withId("legacy-mentor-farewell", {
    ...common,
    returnId: arc.returnFact.id,
    relationship: "parted-as-friends" as const,
  });
  const memory = withId("legacy-mentor-memory", {
    schemaVersion: 1 as const,
    farewellId: farewell.id,
    legendId: arc.legendId,
    heroId: arc.heroId,
    recordedTick: tick,
    locationId: state.depth.atlas.currentLocationId,
    memory: "kept-road-promise" as const,
    importedPower: false as const,
    mechanicalEffect: "none" as const,
  });
  const manifestations: LegacyManifestationState = {
    ...state.legacyManifestations,
    mentorArc: { ...arc, farewellFact: farewell, memoryFact: memory },
  };
  if (!isValidLegacyManifestationState(manifestations, state.legacy)) throw new TypeError("Legacy mentor farewell violates fact invariants");
  return { phase: "farewell", manifestations, farewell, memory };
}
