import type { DepthCommand } from "../depth/types";
import { canonicalHash, canonicalStringify } from "./canonical";
import type {
  CampaignLegacyState,
  LegacyAppearanceFact,
  LegacyBelief,
  LegacyLessonFact,
  LegacyManifestationState,
  LegacyMeetingFact,
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

export function createLegacyManifestationState(townVisitBaseline = 0): LegacyManifestationState {
  if (!nonNegativeSafeInteger(townVisitBaseline)) throw new RangeError("Legacy manifestation visit baseline must be a non-negative safe integer");
  return {
    schemaVersion: 1,
    scheduleVersion: 1,
    townVisitBaseline,
    appearances: [],
    meetings: [],
    recognitions: [],
    lessons: [],
  };
}

export function isValidLegacyManifestationState(
  value: unknown,
  legacy: CampaignLegacyState,
): value is LegacyManifestationState {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "scheduleVersion", "townVisitBaseline", "appearances", "meetings", "recognitions", "lessons",
  ])) return false;
  if (
    value.schemaVersion !== 1 ||
    value.scheduleVersion !== 1 ||
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
    !value.lessons.every(isValidLessonFact)
  ) return false;
  const state = value as unknown as LegacyManifestationState;
  if (
    new Set(state.appearances.map((fact) => fact.id)).size !== state.appearances.length ||
    new Set(state.appearances.map((fact) => fact.legendId)).size !== state.appearances.length ||
    new Set(state.meetings.map((fact) => fact.id)).size !== state.meetings.length ||
    new Set(state.recognitions.map((fact) => fact.id)).size !== state.recognitions.length ||
    new Set(state.lessons.map((fact) => fact.id)).size !== state.lessons.length
  ) return false;
  for (let index = 0; index < state.appearances.length; index += 1) {
    const card = legacy.cards[index];
    const appearance = state.appearances[index];
    const meeting = state.meetings[index];
    const recognition = state.recognitions[index];
    const lesson = state.lessons[index];
    if (
      card === undefined || appearance === undefined || meeting === undefined || recognition === undefined || lesson === undefined ||
      appearance.legendId !== card.id || appearance.sourceChampionId !== card.sourceChampionId ||
      (index > 0 && state.appearances[index - 1]!.tick >= appearance.tick) ||
      meeting.appearanceId !== appearance.id || meeting.legendId !== appearance.legendId || meeting.tick !== appearance.tick ||
      recognition.meetingId !== meeting.id || recognition.appearanceId !== appearance.id || recognition.legendId !== appearance.legendId ||
      recognition.heroId !== meeting.heroId || recognition.tick !== appearance.tick ||
      lesson.meetingId !== meeting.id || lesson.appearanceId !== appearance.id || lesson.legendId !== appearance.legendId ||
      lesson.heroId !== meeting.heroId || lesson.tick !== appearance.tick
    ) return false;
  }
  return true;
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
  const manifestations: LegacyManifestationState = {
    ...state.legacyManifestations,
    appearances: [...state.legacyManifestations.appearances, appearance],
    meetings: [...state.legacyManifestations.meetings, meeting],
    recognitions: [...state.legacyManifestations.recognitions, recognition],
    lessons: [...state.legacyManifestations.lessons, lesson],
  };
  if (!isValidLegacyManifestationState(manifestations, state.legacy)) {
    throw new TypeError("Resolved legacy manifestation violates fact invariants");
  }
  return { manifestations, appearance, meeting, recognition, lesson };
}
