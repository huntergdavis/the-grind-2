import {
  recordedDepthCommandTypes,
  type ChronicleEntry,
  type RecordedDepthCommandType,
  type SceneState,
  type WorldState,
} from "../core/types";
import {
  derivedStats,
  heroExperienceFloor,
  heroLevelForExperience,
  heroMasteryForExperience,
  heroMechanicalLevel,
  heroNextLevelRequirement,
  maximumHeroLevel,
  type DerivedHeroStats,
} from "../depth/rpg";
import type { EquipmentSlot, ItemState } from "../depth/types";

export type HeroLevelUpProgressionBand = "adventurer" | "eternal" | "maximum";
export type HeroLevelUpEmphasis = "standard" | "milestone" | "maximum";
export type HeroLevelUpSourceKind = "command-award" | "quest-reward";

export interface HeroLevelUpThresholdSpan {
  readonly firstLevel: number;
  readonly lastLevel: number;
  readonly count: number;
  readonly firstRequiredExperience: number;
  readonly lastRequiredExperience: number;
}

export interface HeroLevelUpDerivedDelta {
  readonly power: number;
  readonly armor: number;
  readonly initiative: number;
  readonly maxHealth: number;
  readonly maxMana: number;
}

export interface HeroLevelUpEquipmentFact {
  readonly slot: EquipmentSlot;
  readonly itemId: string;
  readonly itemName: string;
  readonly rarity: ItemState["rarity"];
}

export interface HeroLevelUpPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: RecordedDepthCommandType;
  readonly sourceKind: HeroLevelUpSourceKind;
  readonly sourceHeadline: string;
  readonly sourceAction: string;
  readonly sourceLocation: string;
  readonly rewardGrantId: string | null;
  readonly questCompletionId: string | null;
  readonly questTitle: string | null;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly experienceBefore: number;
  readonly experienceDelta: number;
  readonly experienceAfter: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelDelta: number;
  readonly thresholdSpan: HeroLevelUpThresholdSpan;
  readonly masteryBefore: number;
  readonly masteryAfter: number;
  readonly mechanicalLevelBefore: number;
  readonly mechanicalLevelAfter: number;
  readonly derivedBefore: DerivedHeroStats;
  readonly derivedAfter: DerivedHeroStats;
  readonly levelOnlyDerivedDelta: HeroLevelUpDerivedDelta;
  readonly concurrentDerivedDelta: HeroLevelUpDerivedDelta;
  readonly equipmentAfter: readonly HeroLevelUpEquipmentFact[];
  readonly progressionBand: HeroLevelUpProgressionBand;
  readonly emphasis: HeroLevelUpEmphasis;
  readonly nextLevelRequirement: number | null;
}

const equipmentSlots: readonly EquipmentSlot[] = ["weapon", "offhand", "head", "body", "feet", "charm"];
const itemRarities: readonly ItemState["rarity"][] = ["common", "uncommon", "rare", "legendary"];
const milestoneLevels = new Set([10, 25, 50, 100, 250, 500, 750, maximumHeroLevel]);
const derivedKeys = Object.freeze(["power", "armor", "initiative", "maxHealth", "maxMana"] as const);
const packetKeys = Object.freeze([
  "schemaVersion", "eventId", "tick", "campaignId", "commandId", "commandType", "sourceKind",
  "sourceHeadline", "sourceAction", "sourceLocation", "rewardGrantId", "questCompletionId", "questTitle",
  "heroId", "heroName", "className", "experienceBefore", "experienceDelta", "experienceAfter",
  "levelBefore", "levelAfter", "levelDelta", "thresholdSpan", "masteryBefore", "masteryAfter",
  "mechanicalLevelBefore", "mechanicalLevelAfter", "derivedBefore", "derivedAfter",
  "levelOnlyDerivedDelta", "concurrentDerivedDelta", "equipmentAfter", "progressionBand", "emphasis",
  "nextLevelRequirement",
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

function boundedText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameValue(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function subtractDerived(after: DerivedHeroStats, before: DerivedHeroStats): HeroLevelUpDerivedDelta {
  return Object.freeze({
    power: after.power - before.power,
    armor: after.armor - before.armor,
    initiative: after.initiative - before.initiative,
    maxHealth: after.maxHealth - before.maxHealth,
    maxMana: after.maxMana - before.maxMana,
  });
}

function subtractDeltas(total: HeroLevelUpDerivedDelta, levelOnly: HeroLevelUpDerivedDelta): HeroLevelUpDerivedDelta {
  return Object.freeze({
    power: total.power - levelOnly.power,
    armor: total.armor - levelOnly.armor,
    initiative: total.initiative - levelOnly.initiative,
    maxHealth: total.maxHealth - levelOnly.maxHealth,
    maxMana: total.maxMana - levelOnly.maxMana,
  });
}

function equipmentFacts(state: WorldState): readonly HeroLevelUpEquipmentFact[] {
  const facts = equipmentSlots.flatMap((slot) => {
    const itemId = state.depth.hero.equipment[slot];
    const item = itemId === null
      ? undefined
      : state.depth.hero.inventory.find((candidate) => candidate.id === itemId);
    return item === undefined ? [] : [{
      slot,
      itemId: item.id,
      itemName: item.name,
      rarity: item.rarity,
    }];
  });
  return Object.freeze(facts.map((fact) => Object.freeze(fact)));
}

function progressionBand(level: number): HeroLevelUpProgressionBand {
  if (level >= maximumHeroLevel) return "maximum";
  return level > 50 ? "eternal" : "adventurer";
}

function progressionEmphasis(levelBefore: number, levelAfter: number): HeroLevelUpEmphasis {
  if (levelAfter >= maximumHeroLevel) return "maximum";
  if (levelAfter - levelBefore > 1 || milestoneLevels.has(levelAfter)) return "milestone";
  return "standard";
}

function validDerived(value: unknown, allowNegative: boolean): value is DerivedHeroStats | HeroLevelUpDerivedDelta {
  if (!isRecord(value) || !hasExactKeys(value, derivedKeys)) return false;
  const minimum = allowNegative ? -Number.MAX_SAFE_INTEGER : 0;
  return derivedKeys.every((key) => safeInteger(value[key], minimum));
}

function validEquipment(value: unknown): value is readonly HeroLevelUpEquipmentFact[] {
  if (!Array.isArray(value) || value.length > equipmentSlots.length) return false;
  const slots = new Set<string>();
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, ["slot", "itemId", "itemName", "rarity"])) return false;
    if (!equipmentSlots.includes(entry.slot as EquipmentSlot)
      || !boundedText(entry.itemId, 512)
      || !boundedText(entry.itemName, 160)
      || !itemRarities.includes(entry.rarity as ItemState["rarity"])
      || slots.has(entry.slot as string)
      || ids.has(entry.itemId as string)) return false;
    slots.add(entry.slot as string);
    ids.add(entry.itemId as string);
  }
  return true;
}

export function isHeroLevelUpPacketV1(value: unknown): value is HeroLevelUpPacketV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, packetKeys)
    || !isRecord(value.thresholdSpan)
    || !hasExactKeys(value.thresholdSpan, ["firstLevel", "lastLevel", "count", "firstRequiredExperience", "lastRequiredExperience"])
    || !validDerived(value.derivedBefore, false)
    || !validDerived(value.derivedAfter, false)
    || !validDerived(value.levelOnlyDerivedDelta, true)
    || !validDerived(value.concurrentDerivedDelta, true)
    || !validEquipment(value.equipmentAfter)) return false;
  if (value.schemaVersion !== 1
    || !boundedText(value.eventId, 512)
    || !safeInteger(value.tick)
    || !boundedText(value.campaignId, 256)
    || !boundedText(value.commandId, 512)
    || !recordedDepthCommandTypes.includes(value.commandType as RecordedDepthCommandType)
    || (value.sourceKind !== "command-award" && value.sourceKind !== "quest-reward")
    || !boundedText(value.sourceHeadline)
    || !boundedText(value.sourceAction)
    || !boundedText(value.sourceLocation)
    || !boundedText(value.heroId, 512)
    || !boundedText(value.heroName, 160)
    || !boundedText(value.className, 120)
    || !safeInteger(value.experienceBefore)
    || !safeInteger(value.experienceDelta, 1)
    || !safeInteger(value.experienceAfter)
    || !safeInteger(value.levelBefore, 1, maximumHeroLevel)
    || !safeInteger(value.levelAfter, 1, maximumHeroLevel)
    || !safeInteger(value.levelDelta, 1, maximumHeroLevel - 1)
    || !safeInteger(value.masteryBefore)
    || !safeInteger(value.masteryAfter)
    || !safeInteger(value.mechanicalLevelBefore, 1, 50)
    || !safeInteger(value.mechanicalLevelAfter, 1, 50)) return false;

  const packet = value as unknown as HeroLevelUpPacketV1;
  const threshold = packet.thresholdSpan;
  const expectedLevelOnlyPower = packet.mechanicalLevelAfter - packet.mechanicalLevelBefore;
  const totalDelta = subtractDerived(packet.derivedAfter, packet.derivedBefore);
  const expectedConcurrent = subtractDeltas(totalDelta, packet.levelOnlyDerivedDelta);
  const rewardFields = [packet.rewardGrantId, packet.questCompletionId, packet.questTitle];
  return packet.experienceBefore + packet.experienceDelta === packet.experienceAfter
    && packet.levelBefore === heroLevelForExperience(packet.experienceBefore)
    && packet.levelAfter === heroLevelForExperience(packet.experienceAfter)
    && packet.levelAfter > packet.levelBefore
    && packet.levelDelta === packet.levelAfter - packet.levelBefore
    && threshold.firstLevel === packet.levelBefore + 1
    && threshold.lastLevel === packet.levelAfter
    && threshold.count === packet.levelDelta
    && threshold.firstRequiredExperience === heroExperienceFloor(threshold.firstLevel)
    && threshold.lastRequiredExperience === heroExperienceFloor(threshold.lastLevel)
    && packet.masteryBefore === heroMasteryForExperience(packet.experienceBefore)
    && packet.masteryAfter === heroMasteryForExperience(packet.experienceAfter)
    && packet.mechanicalLevelBefore === heroMechanicalLevel(packet.levelBefore)
    && packet.mechanicalLevelAfter === heroMechanicalLevel(packet.levelAfter)
    && packet.levelOnlyDerivedDelta.power === expectedLevelOnlyPower
    && packet.levelOnlyDerivedDelta.armor === 0
    && packet.levelOnlyDerivedDelta.initiative === 0
    && packet.levelOnlyDerivedDelta.maxHealth === 0
    && packet.levelOnlyDerivedDelta.maxMana === 0
    && derivedKeys.every((key) => packet.concurrentDerivedDelta[key] === expectedConcurrent[key])
    && packet.progressionBand === progressionBand(packet.levelAfter)
    && packet.emphasis === progressionEmphasis(packet.levelBefore, packet.levelAfter)
    && packet.nextLevelRequirement === heroNextLevelRequirement(packet.levelAfter)
    && (packet.commandType === "apply-quest-reward"
      ? packet.sourceKind === "quest-reward" && rewardFields.every((entry) => boundedText(entry, 512))
      : packet.sourceKind === "command-award" && rewardFields.every((entry) => entry === null));
}

function sourceScene(source: ChronicleEntry): SceneState {
  return {
    mode: source.mode,
    location: source.location,
    headline: source.headline,
    action: source.action,
    goal: source.goal,
    consequence: source.consequence,
    sensoryIntensity: source.sensoryIntensity,
  };
}

function safeWorldPair(before: WorldState, after: WorldState, source: ChronicleEntry): boolean {
  if (before.campaignId !== after.campaignId
    || before.seed !== after.seed
    || before.hero.id !== after.hero.id
    || before.hero.name !== after.hero.name
    || before.depth.hero.id !== after.depth.hero.id
    || before.hero.id !== before.depth.hero.id
    || after.hero.id !== after.depth.hero.id
    || before.hero.name !== before.depth.hero.name
    || after.hero.name !== after.depth.hero.name
    || before.hero.health !== before.depth.hero.resources.health
    || after.hero.health !== after.depth.hero.resources.health
    || before.hero.maxHealth !== before.depth.hero.resources.maxHealth
    || after.hero.maxHealth !== after.depth.hero.resources.maxHealth
    || before.hero.gold !== before.depth.hero.gold
    || after.hero.gold !== after.depth.hero.gold
    || before.hero.mastery !== heroMasteryForExperience(before.hero.experience)
    || after.hero.mastery !== heroMasteryForExperience(after.hero.experience)
    || after.tick !== before.tick + 1
    || after.depth.tick !== before.depth.tick + 1
    || after.tick !== after.depth.tick
    || source.id !== `${after.campaignId}:${after.tick}`
    || source.tick !== after.tick
    || typeof source.commandId !== "string"
    || source.commandId.length === 0
    || source.commandType === undefined
    || !recordedDepthCommandTypes.includes(source.commandType)
    || before.chronicle.some((entry) => entry.id === source.id)
    || after.chronicle.filter((entry) => entry.id === source.id).length !== 1
    || !sameValue(after.chronicle, [...before.chronicle.slice(-31), source])
    || !sameValue(after.chronicle.at(-1), source)
    || !sameValue(after.scene, sourceScene(source))) return false;
  return true;
}

export function projectHeroLevelUp(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): HeroLevelUpPacketV1 | null {
  if (after.hero.level <= before.hero.level
    || after.hero.experience <= before.hero.experience
    || before.hero.level !== before.depth.hero.level
    || after.hero.level !== after.depth.hero.level
    || before.hero.experience !== before.depth.hero.experience
    || after.hero.experience !== after.depth.hero.experience
    || before.campaignId !== after.campaignId
    || after.tick !== before.tick + 1
    || source.id !== `${after.campaignId}:${after.tick}`
    || source.tick !== after.tick
    || source.commandId === undefined
    || source.commandType === undefined
    || !recordedDepthCommandTypes.includes(source.commandType)
    || !safeWorldPair(before, after, source)) return null;

  const commandId = source.commandId;
  const commandType = source.commandType;
  if (commandId === undefined || commandType === undefined) return null;
  const experienceDelta = after.hero.experience - before.hero.experience;
  const levelDelta = after.hero.level - before.hero.level;
  if (!safeInteger(experienceDelta, 1) || !safeInteger(levelDelta, 1)) return null;

  let rewardGrantId: string | null = null;
  let questCompletionId: string | null = null;
  let questTitle: string | null = null;
  if (commandType === "apply-quest-reward") {
    const completion = after.depth.completedQuests.at(-1);
    if (completion === undefined || completion.reward.status !== "applied") return null;
    const { grant, receipt } = completion.reward;
    if (before.depth.pendingQuestReward?.id !== grant.id
      || receipt.appliedTick !== after.tick
      || receipt.experienceBefore !== before.hero.experience
      || receipt.experienceDelta !== experienceDelta
      || receipt.experienceAfter !== after.hero.experience
      || receipt.levelBefore !== before.hero.level
      || receipt.levelAfter !== after.hero.level) return null;
    rewardGrantId = grant.id;
    questCompletionId = completion.id;
    questTitle = completion.title;
  }

  const derivedBefore = Object.freeze({ ...derivedStats(before.depth.hero) });
  const derivedAfter = Object.freeze({ ...derivedStats(after.depth.hero) });
  const finalBuildAtOldLevel = {
    ...after.depth.hero,
    level: before.hero.level,
  };
  const levelOnlyDerivedDelta = subtractDerived(derivedAfter, derivedStats(finalBuildAtOldLevel));
  const concurrentDerivedDelta = subtractDeltas(subtractDerived(derivedAfter, derivedBefore), levelOnlyDerivedDelta);
  const packet: HeroLevelUpPacketV1 = Object.freeze({
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    commandId,
    commandType,
    sourceKind: commandType === "apply-quest-reward" ? "quest-reward" : "command-award",
    sourceHeadline: source.headline,
    sourceAction: source.action,
    sourceLocation: source.location,
    rewardGrantId,
    questCompletionId,
    questTitle,
    heroId: after.hero.id,
    heroName: after.hero.name,
    className: after.depth.hero.className,
    experienceBefore: before.hero.experience,
    experienceDelta,
    experienceAfter: after.hero.experience,
    levelBefore: before.hero.level,
    levelAfter: after.hero.level,
    levelDelta,
    thresholdSpan: Object.freeze({
      firstLevel: before.hero.level + 1,
      lastLevel: after.hero.level,
      count: levelDelta,
      firstRequiredExperience: heroExperienceFloor(before.hero.level + 1),
      lastRequiredExperience: heroExperienceFloor(after.hero.level),
    }),
    masteryBefore: before.hero.mastery,
    masteryAfter: after.hero.mastery,
    mechanicalLevelBefore: heroMechanicalLevel(before.hero.level),
    mechanicalLevelAfter: heroMechanicalLevel(after.hero.level),
    derivedBefore,
    derivedAfter,
    levelOnlyDerivedDelta,
    concurrentDerivedDelta,
    equipmentAfter: equipmentFacts(after),
    progressionBand: progressionBand(after.hero.level),
    emphasis: progressionEmphasis(before.hero.level, after.hero.level),
    nextLevelRequirement: heroNextLevelRequirement(after.hero.level),
  });
  return isHeroLevelUpPacketV1(packet) ? packet : null;
}
