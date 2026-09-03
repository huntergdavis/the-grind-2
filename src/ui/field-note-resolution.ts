import { advanceWorld } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { monsterDefinition } from "../depth/combat";
import {
  counterDuelHabitEncounterThreshold,
  newlyEstablishedCounterDuelHabits,
  projectCounterDuelSpeciesHabit,
} from "../depth/counter-duel";
import { secretTechniqueInsightRequired } from "../depth/rpg";
import type { CounterDuelStance, MonsterLoreState } from "../depth/types";

export const maximumFieldNoteResolutionUnlocks = 2 as const;

export type FieldNoteResolutionEncounterMode = "tactical" | "pattern-duel";
export type FieldNoteResolutionSourceCommand = "start-combat" | "start-counter-duel";

export interface FieldNoteResolutionUnlockV1 {
  readonly speciesId: string;
  readonly speciesName: string;
  readonly beforeEncounterCount: 2;
  readonly afterEncounterCount: 3;
  readonly requiredEncounterCount: 3;
  readonly preferredStance: CounterDuelStance;
  readonly habitLabel: string;
}

export interface FieldNoteResolutionPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly encounterMode: FieldNoteResolutionEncounterMode;
  readonly sourceCommandType: FieldNoteResolutionSourceCommand;
  readonly speciesKey: string;
  readonly priorEvidence: "aggregate-only";
  readonly unlocks: readonly FieldNoteResolutionUnlockV1[];
  readonly precedenceText: string;
}

const packetKeys = Object.freeze([
  "schemaVersion",
  "eventId",
  "tick",
  "campaignId",
  "heroId",
  "heroName",
  "encounterMode",
  "sourceCommandType",
  "speciesKey",
  "priorEvidence",
  "unlocks",
  "precedenceText",
] as const);

const unlockKeys = Object.freeze([
  "speciesId",
  "speciesName",
  "beforeEncounterCount",
  "afterEncounterCount",
  "requiredEncounterCount",
  "preferredStance",
  "habitLabel",
] as const);

const tacticalPrecedenceText = "Cautious habit only; this tactical encounter has no live tell and the note reveals no present intent.";
const patternDuelPrecedenceText = "Cautious habit only; a legal live tell takes precedence and the note reveals no committed stance.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function boundedText(value: unknown, maximum = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameValue(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function precedenceTextFor(mode: FieldNoteResolutionEncounterMode): string {
  return mode === "tactical" ? tacticalPrecedenceText : patternDuelPrecedenceText;
}

function commandTypeFor(mode: FieldNoteResolutionEncounterMode): FieldNoteResolutionSourceCommand {
  return mode === "tactical" ? "start-combat" : "start-counter-duel";
}

function speciesKeyFor(unlocks: readonly Pick<FieldNoteResolutionUnlockV1, "speciesId">[]): string {
  return unlocks.map((unlock) => unlock.speciesId).join("+");
}

function validCanonicalLoreIdentity(lore: MonsterLoreState): boolean {
  const definition = monsterDefinition(lore.monsterId);
  return definition !== undefined
    && lore.monsterName === definition.name
    && lore.requiredInsight === secretTechniqueInsightRequired
    && lore.secretTechniqueId === definition.secret.id
    && lore.secretTechniqueName === definition.secret.name;
}

function validUnlock(value: unknown): value is FieldNoteResolutionUnlockV1 {
  if (!isRecord(value) || !exactKeys(value, unlockKeys)) return false;
  const speciesId = value.speciesId;
  const speciesName = value.speciesName;
  const habitLabel = value.habitLabel;
  const preferredStance = value.preferredStance;
  if (
    !boundedText(speciesId, 128)
    || !boundedText(speciesName, 128)
    || !boundedText(habitLabel, 256)
    || (preferredStance !== "rush" && preferredStance !== "ward" && preferredStance !== "feint")
    || value.beforeEncounterCount !== 2
    || value.afterEncounterCount !== 3
    || value.requiredEncounterCount !== counterDuelHabitEncounterThreshold
  ) return false;
  const definition = monsterDefinition(speciesId);
  const habit = projectCounterDuelSpeciesHabit(speciesId, value.afterEncounterCount);
  return definition?.name === speciesName
    && habit?.status === "established"
    && habit.encounters === value.afterEncounterCount
    && habit.requiredEncounters === value.requiredEncounterCount
    && habit.preferredStance === preferredStance
    && habit.label === habitLabel;
}

/** Accepts only the exact, complete v1 packet emitted by projectFieldNoteResolution. */
export function isFieldNoteResolutionPacketV1(value: unknown): value is FieldNoteResolutionPacketV1 {
  if (!isRecord(value) || !exactKeys(value, packetKeys) || !Array.isArray(value.unlocks)) return false;
  const unlocks = value.unlocks as readonly unknown[];
  if (
    value.schemaVersion !== 1
    || !boundedText(value.eventId)
    || !Number.isSafeInteger(value.tick)
    || Number(value.tick) < 1
    || !boundedText(value.campaignId, 256)
    || !boundedText(value.heroId, 256)
    || !boundedText(value.heroName, 128)
    || (value.encounterMode !== "tactical" && value.encounterMode !== "pattern-duel")
    || value.sourceCommandType !== commandTypeFor(value.encounterMode)
    || !boundedText(value.speciesKey, 640)
    || value.priorEvidence !== "aggregate-only"
    || unlocks.length < 1
    || unlocks.length > maximumFieldNoteResolutionUnlocks
    || value.precedenceText !== precedenceTextFor(value.encounterMode)
    || value.eventId !== `${value.campaignId}:${String(value.tick)}`
    || !unlocks.every(validUnlock)
  ) return false;
  const speciesIds = unlocks.map((unlock) => (unlock as FieldNoteResolutionUnlockV1).speciesId);
  return speciesIds.every((speciesId, index) => index === 0 || speciesIds[index - 1]! < speciesId)
    && value.speciesKey === speciesIds.join("+");
}

function uniqueLoreById(lore: readonly MonsterLoreState[]): ReadonlyMap<string, MonsterLoreState> | null {
  const byId = new Map<string, MonsterLoreState>();
  for (const entry of lore) {
    if (byId.has(entry.monsterId)) return null;
    byId.set(entry.monsterId, entry);
  }
  return byId;
}

function replayedTransition(before: WorldState, after: WorldState, source: ChronicleEntry): boolean {
  if (
    source.commandType !== "start-combat"
    && source.commandType !== "start-counter-duel"
  ) return false;
  let expected: WorldState;
  try {
    expected = advanceWorld(before);
  } catch {
    return false;
  }
  return sameValue(expected, after)
    && sameValue(after.chronicle.at(-1), source)
    && before.chronicle.every((entry) => entry.id !== source.id)
    && after.chronicle.filter((entry) => entry.id === source.id).length === 1;
}

function exactUnlocks(before: WorldState, after: WorldState): readonly FieldNoteResolutionUnlockV1[] | null {
  const beforeById = uniqueLoreById(before.depth.hero.monsterLore);
  const afterById = uniqueLoreById(after.depth.hero.monsterLore);
  if (beforeById === null || afterById === null) return null;
  const established = newlyEstablishedCounterDuelHabits(
    before.depth.hero.monsterLore,
    after.depth.hero.monsterLore,
  );
  if (established.length < 1 || established.length > maximumFieldNoteResolutionUnlocks) return null;
  const unlocks: FieldNoteResolutionUnlockV1[] = [];
  for (const candidate of established) {
    const prior = beforeById.get(candidate.monsterId);
    const next = afterById.get(candidate.monsterId);
    if (
      prior === undefined
      || next === undefined
      || prior.encounters !== counterDuelHabitEncounterThreshold - 1
      || next.encounters !== counterDuelHabitEncounterThreshold
      || prior.monsterName !== next.monsterName
      || candidate.monsterName !== next.monsterName
      || !validCanonicalLoreIdentity(prior)
      || !validCanonicalLoreIdentity(next)
    ) return null;
    const habit = projectCounterDuelSpeciesHabit(candidate.monsterId, next.encounters);
    if (
      habit?.status !== "established"
      || habit.preferredStance !== candidate.preferredStance
      || habit.label !== candidate.label
    ) return null;
    unlocks.push({
      speciesId: candidate.monsterId,
      speciesName: candidate.monsterName,
      beforeEncounterCount: 2,
      afterEncounterCount: 3,
      requiredEncounterCount: 3,
      preferredStance: candidate.preferredStance,
      habitLabel: candidate.label,
    });
  }
  const ordered = [...unlocks].sort((left, right) => left.speciesId < right.speciesId ? -1 : left.speciesId > right.speciesId ? 1 : 0);
  if (!sameValue(unlocks, ordered)) return null;
  return ordered;
}

/**
 * Projects one live Field Note threshold crossing without changing canonical state.
 * Earlier observations are deliberately disclosed only as an aggregate count; the
 * current Chronicle entry is the sole exact source receipt available in schema v1.
 */
export function projectFieldNoteResolution(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): FieldNoteResolutionPacketV1 | null {
  const sourceCommandType = source.commandType;
  if (sourceCommandType !== "start-combat" && sourceCommandType !== "start-counter-duel") return null;
  if (!replayedTransition(before, after, source)) return null;
  const encounterMode: FieldNoteResolutionEncounterMode = sourceCommandType === "start-combat"
    ? "tactical"
    : "pattern-duel";
  if (
    (encounterMode === "tactical" && (after.depth.combat === null || after.depth.counterDuel !== null))
    || (encounterMode === "pattern-duel" && (after.depth.counterDuel === null || after.depth.combat !== null))
  ) return null;
  const unlocks = exactUnlocks(before, after);
  if (unlocks === null) return null;
  const packet: FieldNoteResolutionPacketV1 = {
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    heroId: after.hero.id,
    heroName: after.hero.name,
    encounterMode,
    sourceCommandType,
    speciesKey: speciesKeyFor(unlocks),
    priorEvidence: "aggregate-only",
    unlocks,
    precedenceText: precedenceTextFor(encounterMode),
  };
  return isFieldNoteResolutionPacketV1(packet) ? deepFreeze(packet) : null;
}
