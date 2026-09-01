import {
  championExperienceFloorV1,
  championLevelV1,
  createChampionInduction,
  isValidChampionInduction,
} from "../core/champions";
import type {
  ChampionInduction,
  ChronicleEntry,
  RecordedDepthCommandType,
  WorldState,
} from "../core/types";
import { heroLevelForExperience } from "../depth/rpg";
import { projectHeroLevelUp } from "./hero-level-up";

/**
 * A presentation-only receipt for the exact earned Level-1000 transition.
 *
 * Persistence remains outside this pure projector. Its caller must preserve the
 * existing persist-before-project boundary before offering this packet to a
 * renderer.
 */
export interface ChampionInductionSealPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: RecordedDepthCommandType;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly experienceBefore: number;
  readonly experienceAfter: number;
  readonly levelBefore: number;
  readonly levelAfter: 1_000;
  readonly induction: ChampionInduction;
  readonly totalCompletedQuests: number;
  readonly archivedEquipmentCount: number;
  readonly archivedAbilityCount: number;
  readonly mechanicalEffect: "none";
  readonly campaignContinues: true;
}

const packetKeys = Object.freeze([
  "schemaVersion",
  "eventId",
  "tick",
  "campaignId",
  "commandId",
  "commandType",
  "heroId",
  "heroName",
  "className",
  "experienceBefore",
  "experienceAfter",
  "levelBefore",
  "levelAfter",
  "induction",
  "totalCompletedQuests",
  "archivedEquipmentCount",
  "archivedAbilityCount",
  "mechanicalEffect",
  "campaignContinues",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function boundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function safeInteger(
  value: unknown,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
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
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function freezeCopy<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeCopy(entry))) as unknown as Readonly<T>;
  }
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, freezeCopy(entry)]),
    )) as Readonly<T>;
  }
  return value;
}

export function isChampionInductionSealPacketV1(
  value: unknown,
): value is ChampionInductionSealPacketV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, packetKeys)
    || !isValidChampionInduction(value.induction)) return false;

  const packet = value as unknown as ChampionInductionSealPacketV1;
  const induction = packet.induction;
  return packet.schemaVersion === 1
    && boundedText(packet.eventId, 512)
    && safeInteger(packet.tick)
    && boundedText(packet.campaignId, 256)
    && boundedText(packet.commandId, 512)
    && boundedText(packet.heroId, 512)
    && boundedText(packet.heroName, 160)
    && boundedText(packet.className, 120)
    && safeInteger(packet.experienceBefore, 0, championExperienceFloorV1 - 1)
    && safeInteger(packet.experienceAfter, championExperienceFloorV1)
    && packet.experienceAfter > packet.experienceBefore
    && safeInteger(packet.levelBefore, 1, championLevelV1 - 1)
    && packet.levelBefore === heroLevelForExperience(packet.experienceBefore)
    && packet.levelAfter === championLevelV1
    && packet.eventId === `${packet.campaignId}:${packet.tick}`
    && induction.qualification === "earned"
    && induction.sourceCampaignId === packet.campaignId
    && induction.heroId === packet.heroId
    && induction.heroName === packet.heroName
    && induction.className === packet.className
    && induction.level === packet.levelAfter
    && induction.experience === packet.experienceAfter
    && induction.recordedTick === packet.tick
    && induction.sourceCommandId === packet.commandId
    && induction.sourceCommandType === packet.commandType
    && packet.totalCompletedQuests === induction.totalCompletedQuests
    && packet.archivedEquipmentCount === induction.equipment.length
    && packet.archivedAbilityCount === induction.abilities.length
    && packet.mechanicalEffect === "none"
    && packet.campaignContinues === true;
}

export function projectChampionInductionSeal(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): ChampionInductionSealPacketV1 | null {
  const levelUp = projectHeroLevelUp(before, after, source);
  const induction = after.championInduction;
  if (levelUp === null
    || before.championInduction !== null
    || induction === null
    || levelUp.levelBefore >= championLevelV1
    || levelUp.levelAfter !== championLevelV1
    || levelUp.experienceBefore >= championExperienceFloorV1
    || levelUp.experienceAfter < championExperienceFloorV1
    || levelUp.progressionBand !== "maximum"
    || levelUp.emphasis !== "maximum"
    || !isValidChampionInduction(induction)
    || induction.qualification !== "earned") return null;

  let expectedInduction: ChampionInduction;
  try {
    expectedInduction = createChampionInduction(after, "earned", {
      id: levelUp.commandId,
      type: levelUp.commandType,
    });
  } catch {
    return null;
  }
  if (!sameValue(induction, expectedInduction)) return null;

  const packet: ChampionInductionSealPacketV1 = {
    schemaVersion: 1,
    eventId: levelUp.eventId,
    tick: levelUp.tick,
    campaignId: levelUp.campaignId,
    commandId: levelUp.commandId,
    commandType: levelUp.commandType,
    heroId: levelUp.heroId,
    heroName: levelUp.heroName,
    className: levelUp.className,
    experienceBefore: levelUp.experienceBefore,
    experienceAfter: levelUp.experienceAfter,
    levelBefore: levelUp.levelBefore,
    levelAfter: championLevelV1,
    induction: freezeCopy(induction) as ChampionInduction,
    totalCompletedQuests: induction.totalCompletedQuests,
    archivedEquipmentCount: induction.equipment.length,
    archivedAbilityCount: induction.abilities.length,
    mechanicalEffect: "none",
    campaignContinues: true,
  };
  const frozen = freezeCopy(packet) as ChampionInductionSealPacketV1;
  return isChampionInductionSealPacketV1(frozen) ? frozen : null;
}
