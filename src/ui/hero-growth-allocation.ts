import { canonicalHash } from "../core/canonical";
import {
  recordedDepthCommandTypes,
  type ChronicleEntry,
  type RecordedDepthCommandType,
  type SceneState,
  type WorldState,
} from "../core/types";
import {
  derivedStats,
  derivedStatsFromInputs,
  heroLevelForExperience,
  heroMechanicalLevel,
  type DerivedHeroStats,
  type EquippedModifierTotals,
} from "../depth/rpg";
import type {
  EquipmentSlot,
  HeroAttributes,
  HeroGrowthCandidate,
  HeroGrowthPackageId,
  HeroGrowthReasonCode,
  HeroGrowthRecord,
  HeroResources,
  ItemModifier,
  ItemState,
} from "../depth/types";
import {
  isHeroLevelUpPacketV1,
  projectHeroLevelUp,
  type HeroLevelUpDerivedDelta,
  type HeroLevelUpEquipmentFact,
  type HeroLevelUpPacketV1,
} from "./hero-level-up";

export type HeroGrowthAllocationTiming = "immediate" | "deferred";

export interface HeroGrowthAllocationSelectionV1 {
  readonly selectionOrdinal: number;
  readonly turningPointOrdinal: number;
  readonly selectionCount: number;
  readonly settlementTiming: HeroGrowthAllocationTiming;
  readonly record: HeroGrowthRecord;
  readonly selectedCandidate: HeroGrowthCandidate;
  readonly attributesBefore: HeroAttributes;
  readonly attributesAfter: HeroAttributes;
  readonly derivedBefore: DerivedHeroStats;
  readonly derivedAfter: DerivedHeroStats;
  readonly resourcesBefore: HeroResources;
  readonly resourcesAfter: HeroResources;
}

export interface HeroGrowthAllocationPacketV1 {
  readonly schemaVersion: 1;
  readonly recipeId: "hero-growth-allocation@1";
  readonly eventId: string;
  readonly applicationId: string;
  readonly tick: number;
  readonly applicationTick: number;
  readonly applicationTiming: HeroGrowthAllocationTiming;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: RecordedDepthCommandType;
  readonly sourceHeadline: string;
  readonly sourceAction: string;
  readonly sourceLocation: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly equipmentAfter: readonly HeroLevelUpEquipmentFact[];
  readonly selectionCount: number;
  readonly selections: readonly HeroGrowthAllocationSelectionV1[];
  readonly levelTransition: HeroLevelUpPacketV1 | null;
  readonly derivedBefore: DerivedHeroStats;
  readonly derivedAfter: DerivedHeroStats;
  readonly totalDerivedDelta: HeroLevelUpDerivedDelta;
  readonly levelOnlyDerivedDelta: HeroLevelUpDerivedDelta;
  readonly growthDerivedDelta: HeroLevelUpDerivedDelta;
  readonly otherSameBeatDerivedDelta: HeroLevelUpDerivedDelta;
}

const growthPackageOrder = Object.freeze([
  "growth-v1:field-temper",
  "growth-v1:road-rhythm",
  "growth-v1:inner-pattern",
] as const satisfies readonly HeroGrowthPackageId[]);
const growthPackageLabels: Readonly<Record<HeroGrowthPackageId, string>> = Object.freeze({
  "growth-v1:field-temper": "Field Temper",
  "growth-v1:road-rhythm": "Road Rhythm",
  "growth-v1:inner-pattern": "Inner Pattern",
});

const attributeKeys = Object.freeze([
  "strength", "agility", "vitality", "intellect", "spirit", "luck",
] as const satisfies readonly (keyof HeroAttributes)[]);
const derivedKeys = Object.freeze([
  "power", "armor", "initiative", "maxHealth", "maxMana",
] as const satisfies readonly (keyof DerivedHeroStats)[]);
const resourceKeys = Object.freeze(["health", "maxHealth", "mana", "maxMana"] as const);
const equipmentSlots = Object.freeze([
  "weapon", "offhand", "head", "body", "feet", "charm",
] as const satisfies readonly EquipmentSlot[]);
const itemRarities = Object.freeze([
  "common", "uncommon", "rare", "legendary",
] as const satisfies readonly ItemState["rarity"][]);
const modifierKeys = Object.freeze([
  ...attributeKeys, "power", "armor", "maxHealth", "maxMana",
] as const satisfies readonly ItemModifier[]);
const reasonCodes = Object.freeze([
  "combat-pressure", "roadcraft", "disciplined-study", "class-affinity", "personal-value",
  "underdeveloped-path", "steady-practice",
] as const satisfies readonly HeroGrowthReasonCode[]);
const recordKeys = Object.freeze([
  "schemaVersion", "id", "tick", "crossedTick", "heroId", "checkpointLevel", "sourceCommandId",
  "sourceCommandType", "experienceBefore", "experienceAfter", "levelBefore", "levelAfter", "appliedLevel",
  "packageTotalsBefore", "attributesBefore", "derivedBefore", "resourcesBefore", "equipmentModifiers",
  "candidates", "selectedPackageId", "rationale",
] as const);
const candidateKeys = Object.freeze([
  "schemaVersion", "packageId", "label", "score", "tieBreak", "reasonCodes", "attributeDeltas",
  "attributesAfter", "derivedAfter", "resourcesAfter",
] as const);
const selectionKeys = Object.freeze([
  "selectionOrdinal", "turningPointOrdinal", "selectionCount", "settlementTiming", "record", "selectedCandidate",
  "attributesBefore", "attributesAfter", "derivedBefore", "derivedAfter", "resourcesBefore", "resourcesAfter",
] as const);
const packetKeys = Object.freeze([
  "schemaVersion", "recipeId", "eventId", "applicationId", "tick", "applicationTick", "applicationTiming",
  "campaignId", "commandId", "commandType", "sourceHeadline", "sourceAction", "sourceLocation",
  "heroId", "heroName", "className", "equipmentAfter", "selectionCount", "selections", "levelTransition",
  "derivedBefore", "derivedAfter", "totalDerivedDelta", "levelOnlyDerivedDelta", "growthDerivedDelta",
  "otherSameBeatDerivedDelta",
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
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function deepFrozenCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFrozenCopy(entry))) as T;
  }
  if (isRecord(value)) {
    const copy = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepFrozenCopy(entry)]),
    );
    return Object.freeze(copy) as T;
  }
  return value;
}

function validAttributes(value: unknown, maximum = 999): value is HeroAttributes {
  return isRecord(value)
    && hasExactKeys(value, attributeKeys)
    && attributeKeys.every((key) => safeInteger(value[key], 0, maximum));
}

function validDerived(value: unknown, allowNegative = false): value is DerivedHeroStats | HeroLevelUpDerivedDelta {
  if (!isRecord(value) || !hasExactKeys(value, derivedKeys)) return false;
  const minimum = allowNegative ? -Number.MAX_SAFE_INTEGER : 0;
  return derivedKeys.every((key) => safeInteger(value[key], minimum));
}

function validResources(value: unknown): value is HeroResources {
  return isRecord(value)
    && hasExactKeys(value, resourceKeys)
    && safeInteger(value.maxHealth, 1)
    && safeInteger(value.health, 0, value.maxHealth as number)
    && safeInteger(value.maxMana, 0)
    && safeInteger(value.mana, 0, value.maxMana as number);
}

function subtractDerived(after: DerivedHeroStats, before: DerivedHeroStats): HeroLevelUpDerivedDelta {
  return {
    power: after.power - before.power,
    armor: after.armor - before.armor,
    initiative: after.initiative - before.initiative,
    maxHealth: after.maxHealth - before.maxHealth,
    maxMana: after.maxMana - before.maxMana,
  };
}

function addDeltas(left: HeroLevelUpDerivedDelta, right: HeroLevelUpDerivedDelta): HeroLevelUpDerivedDelta {
  return {
    power: left.power + right.power,
    armor: left.armor + right.armor,
    initiative: left.initiative + right.initiative,
    maxHealth: left.maxHealth + right.maxHealth,
    maxMana: left.maxMana + right.maxMana,
  };
}

function subtractDeltas(left: HeroLevelUpDerivedDelta, right: HeroLevelUpDerivedDelta): HeroLevelUpDerivedDelta {
  return {
    power: left.power - right.power,
    armor: left.armor - right.armor,
    initiative: left.initiative - right.initiative,
    maxHealth: left.maxHealth - right.maxHealth,
    maxMana: left.maxMana - right.maxMana,
  };
}

function zeroDelta(): HeroLevelUpDerivedDelta {
  return { power: 0, armor: 0, initiative: 0, maxHealth: 0, maxMana: 0 };
}

function validEquipment(value: unknown): value is readonly HeroLevelUpEquipmentFact[] {
  if (!Array.isArray(value) || value.length > equipmentSlots.length) return false;
  let previousSlotIndex = -1;
  const itemIds = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, ["slot", "itemId", "itemName", "rarity"])) return false;
    const slotIndex = equipmentSlots.indexOf(entry.slot as EquipmentSlot);
    if (slotIndex <= previousSlotIndex
      || !boundedText(entry.itemId, 512)
      || !boundedText(entry.itemName, 160)
      || !itemRarities.includes(entry.rarity as ItemState["rarity"])
      || itemIds.has(entry.itemId as string)) return false;
    previousSlotIndex = slotIndex;
    itemIds.add(entry.itemId as string);
  }
  return true;
}

function equipmentFacts(state: WorldState): readonly HeroLevelUpEquipmentFact[] {
  return equipmentSlots.flatMap((slot) => {
    const itemId = state.depth.hero.equipment[slot];
    const item = itemId === null
      ? undefined
      : state.depth.hero.inventory.find((candidate) => candidate.id === itemId);
    return item === undefined ? [] : [{ slot, itemId: item.id, itemName: item.name, rarity: item.rarity }];
  });
}

function expectedRecordId(campaignId: string, record: HeroGrowthRecord): string {
  const withoutId = { ...record } as Partial<HeroGrowthRecord>;
  delete withoutId.id;
  return `${campaignId}:growth:${canonicalHash(withoutId)}`;
}

function validPackageTotals(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, growthPackageOrder)
    && growthPackageOrder.every((key) => safeInteger(value[key], 0, 2));
}

function validModifiers(value: unknown): value is EquippedModifierTotals {
  return isRecord(value)
    && Object.keys(value).every((key) => modifierKeys.includes(key as ItemModifier))
    && Object.values(value).every((amount) => safeInteger(amount, 0, 600));
}

function validCandidate(
  value: unknown,
  record: HeroGrowthRecord,
): value is HeroGrowthCandidate {
  if (!isRecord(value)
    || !hasExactKeys(value, candidateKeys)
    || value.schemaVersion !== 1
    || !growthPackageOrder.includes(value.packageId as HeroGrowthPackageId)
    || value.label !== growthPackageLabels[value.packageId as HeroGrowthPackageId]
    || !safeInteger(value.score, -1_000, 1_000)
    || !safeInteger(value.tieBreak, 0, 0xffff_ffff)
    || !Array.isArray(value.reasonCodes)
    || value.reasonCodes.length < 1
    || value.reasonCodes.length > 5
    || !value.reasonCodes.every((reason) => reasonCodes.includes(reason as HeroGrowthReasonCode))
    || !validAttributes(value.attributeDeltas, 1)
    || attributeKeys.reduce((sum, key) => sum + (value.attributeDeltas as HeroAttributes)[key], 0) !== 2
    || !validAttributes(value.attributesAfter)
    || !validDerived(value.derivedAfter)
    || !validResources(value.resourcesAfter)) return false;
  const candidate = value as unknown as HeroGrowthCandidate;
  const expectedAttributes = Object.fromEntries(attributeKeys.map((key) => [
    key,
    record.attributesBefore[key] + candidate.attributeDeltas[key],
  ])) as unknown as HeroAttributes;
  const expectedDerived = derivedStatsFromInputs(
    candidate.attributesAfter,
    heroMechanicalLevel(record.appliedLevel),
    record.equipmentModifiers,
  );
  return sameValue(candidate.attributesAfter, expectedAttributes)
    && sameValue(candidate.derivedAfter, expectedDerived)
    && candidate.resourcesAfter.health === record.resourcesBefore.health
    && candidate.resourcesAfter.mana === record.resourcesBefore.mana
    && candidate.resourcesAfter.maxHealth === candidate.derivedAfter.maxHealth
    && candidate.resourcesAfter.maxMana === candidate.derivedAfter.maxMana;
}

function validGrowthRecord(value: unknown, campaignId: string, heroId: string, maximumTick: number): value is HeroGrowthRecord {
  if (!isRecord(value)
    || !hasExactKeys(value, recordKeys)
    || value.schemaVersion !== 1
    || !boundedText(value.id, 512)
    || !safeInteger(value.tick, 1, maximumTick)
    || !safeInteger(value.crossedTick, 1, value.tick as number)
    || value.heroId !== heroId
    || ![10, 25, 50].includes(value.checkpointLevel as number)
    || !boundedText(value.sourceCommandId, 512)
    || !recordedDepthCommandTypes.includes(value.sourceCommandType as RecordedDepthCommandType)
    || !safeInteger(value.experienceBefore)
    || !safeInteger(value.experienceAfter, (value.experienceBefore as number) + 1)
    || !safeInteger(value.levelBefore, 1, 999)
    || !safeInteger(value.levelAfter, (value.levelBefore as number) + 1, 1_000)
    || value.levelBefore !== heroLevelForExperience(value.experienceBefore as number)
    || value.levelAfter !== heroLevelForExperience(value.experienceAfter as number)
    || !safeInteger(value.appliedLevel, Math.max(value.checkpointLevel as number, value.levelAfter as number), 1_000)
    || !validPackageTotals(value.packageTotalsBefore)
    || !validAttributes(value.attributesBefore)
    || !validDerived(value.derivedBefore)
    || !validResources(value.resourcesBefore)
    || !validModifiers(value.equipmentModifiers)
    || !Array.isArray(value.candidates)
    || value.candidates.length < 2
    || value.candidates.length > 3
    || new Set(value.candidates.map((candidate) => isRecord(candidate) ? candidate.packageId : undefined)).size !== value.candidates.length
    || !growthPackageOrder.includes(value.selectedPackageId as HeroGrowthPackageId)
    || !boundedText(value.rationale, 1_000)) return false;
  const record = value as unknown as HeroGrowthRecord;
  if (!record.candidates.every((candidate) => validCandidate(candidate, record))) return false;
  const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
  const expectedDerivedBefore = derivedStatsFromInputs(
    record.attributesBefore,
    heroMechanicalLevel(record.appliedLevel),
    record.equipmentModifiers,
  );
  return selected !== undefined
    && sameValue(record.derivedBefore, expectedDerivedBefore)
    && record.id === expectedRecordId(campaignId, record);
}

function validSelection(value: unknown, packet: HeroGrowthAllocationPacketV1, index: number): value is HeroGrowthAllocationSelectionV1 {
  const checkpointOrdinal = value !== null && typeof value === "object"
    ? [10, 25, 50].indexOf((value as { record?: { checkpointLevel?: number } }).record?.checkpointLevel ?? -1) + 1
    : 0;
  if (!isRecord(value)
    || !hasExactKeys(value, selectionKeys)
    || value.selectionOrdinal !== index + 1
    || value.turningPointOrdinal !== checkpointOrdinal
    || value.selectionCount !== packet.selectionCount
    || (value.settlementTiming !== "immediate" && value.settlementTiming !== "deferred")
    || !validGrowthRecord(value.record, packet.campaignId, packet.heroId, packet.applicationTick)
    || !isRecord(value.selectedCandidate)
    || !validAttributes(value.attributesBefore)
    || !validAttributes(value.attributesAfter)
    || !validDerived(value.derivedBefore)
    || !validDerived(value.derivedAfter)
    || !validResources(value.resourcesBefore)
    || !validResources(value.resourcesAfter)) return false;
  const selection = value as unknown as HeroGrowthAllocationSelectionV1;
  const selected = selection.record.candidates.find((candidate) => candidate.packageId === selection.record.selectedPackageId);
  const expectedTiming: HeroGrowthAllocationTiming = selection.record.crossedTick === packet.applicationTick
    ? "immediate"
    : "deferred";
  return selection.record.tick === packet.applicationTick
    && selection.settlementTiming === expectedTiming
    && selected !== undefined
    && sameValue(selection.selectedCandidate, selected)
    && sameValue(selection.attributesBefore, selection.record.attributesBefore)
    && sameValue(selection.attributesAfter, selected.attributesAfter)
    && sameValue(selection.derivedBefore, selection.record.derivedBefore)
    && sameValue(selection.derivedAfter, selected.derivedAfter)
    && sameValue(selection.resourcesBefore, selection.record.resourcesBefore)
    && sameValue(selection.resourcesAfter, selected.resourcesAfter)
    && (selection.settlementTiming === "deferred"
      || (selection.record.sourceCommandId === packet.commandId && selection.record.sourceCommandType === packet.commandType));
}

function applicationId(campaignId: string, eventId: string, recordIds: readonly string[]): string {
  return `${campaignId}:growth-allocation:${canonicalHash({
    schemaVersion: 1,
    recipeId: "hero-growth-allocation@1",
    eventId,
    recordIds,
  })}`;
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
  return before.campaignId === after.campaignId
    && before.seed === after.seed
    && before.hero.id === after.hero.id
    && before.hero.name === after.hero.name
    && before.depth.hero.id === after.depth.hero.id
    && before.hero.id === before.depth.hero.id
    && after.hero.id === after.depth.hero.id
    && before.hero.name === before.depth.hero.name
    && after.hero.name === after.depth.hero.name
    && before.depth.hero.className === after.depth.hero.className
    && before.hero.level === before.depth.hero.level
    && after.hero.level === after.depth.hero.level
    && before.hero.experience === before.depth.hero.experience
    && after.hero.experience === after.depth.hero.experience
    && before.hero.health === before.depth.hero.resources.health
    && after.hero.health === after.depth.hero.resources.health
    && before.hero.maxHealth === before.depth.hero.resources.maxHealth
    && after.hero.maxHealth === after.depth.hero.resources.maxHealth
    && before.hero.gold === before.depth.hero.gold
    && after.hero.gold === after.depth.hero.gold
    && after.tick === before.tick + 1
    && after.depth.tick === before.depth.tick + 1
    && after.tick === after.depth.tick
    && source.id === `${after.campaignId}:${after.tick}`
    && source.tick === after.tick
    && boundedText(source.commandId, 512)
    && recordedDepthCommandTypes.includes(source.commandType as RecordedDepthCommandType)
    && !before.chronicle.some((entry) => entry.id === source.id)
    && after.chronicle.filter((entry) => entry.id === source.id).length === 1
    && sameValue(after.chronicle, [...before.chronicle.slice(-31), source])
    && sameValue(after.chronicle.at(-1), source)
    && sameValue(after.scene, sourceScene(source));
}

function incrementPackageTotals(
  totals: HeroGrowthRecord["packageTotalsBefore"],
  packageId: HeroGrowthPackageId,
): HeroGrowthRecord["packageTotalsBefore"] {
  return { ...totals, [packageId]: totals[packageId] + 1 };
}

function validSelectionChain(selections: readonly HeroGrowthAllocationSelectionV1[]): boolean {
  for (let index = 1; index < selections.length; index += 1) {
    const previous = selections[index - 1];
    const current = selections[index];
    if (previous === undefined || current === undefined
      || !sameValue(current.attributesBefore, previous.attributesAfter)
      || !sameValue(current.derivedBefore, previous.derivedAfter)
      || !sameValue(current.resourcesBefore, previous.resourcesAfter)
      || !sameValue(current.record.equipmentModifiers, previous.record.equipmentModifiers)
      || current.record.appliedLevel !== previous.record.appliedLevel
      || !sameValue(
        current.record.packageTotalsBefore,
        incrementPackageTotals(previous.record.packageTotalsBefore, previous.selectedCandidate.packageId),
      )) return false;
  }
  return true;
}

function validGrowthAppend(before: WorldState, after: WorldState, records: readonly HeroGrowthRecord[]): boolean {
  const beforeGrowth = before.depth.heroGrowth;
  const afterGrowth = after.depth.heroGrowth;
  if (beforeGrowth.schemaVersion !== 1
    || afterGrowth.schemaVersion !== 1
    || beforeGrowth.rulesVersion !== "three-turning-points-v1"
    || afterGrowth.rulesVersion !== beforeGrowth.rulesVersion
    || afterGrowth.baselineLevel !== beforeGrowth.baselineLevel
    || !sameValue(afterGrowth.baselineAttributes, beforeGrowth.baselineAttributes)
    || records.length < 1
    || records.length > 3) return false;
  let attributes = before.depth.hero.attributes;
  let totals = beforeGrowth.packageSelections;
  for (const record of records) {
    const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
    if (selected === undefined
      || !sameValue(record.packageTotalsBefore, totals)
      || !sameValue(record.attributesBefore, attributes)) return false;
    attributes = selected.attributesAfter;
    totals = incrementPackageTotals(totals, selected.packageId);
  }
  const newlySettled = records.map((record) => record.checkpointLevel);
  const expectedSettled = [...beforeGrowth.settledCheckpointLevels, ...newlySettled].sort((left, right) => left - right);
  const expectedPending = beforeGrowth.pendingTriggers.filter((trigger) => !newlySettled.includes(trigger.checkpointLevel));
  return sameValue(attributes, after.depth.hero.attributes)
    && sameValue(totals, afterGrowth.packageSelections)
    && sameValue(afterGrowth.settledCheckpointLevels, expectedSettled)
    && sameValue(afterGrowth.pendingTriggers, expectedPending);
}

export function isHeroGrowthAllocationPacketV1(value: unknown): value is HeroGrowthAllocationPacketV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, packetKeys)
    || value.schemaVersion !== 1
    || value.recipeId !== "hero-growth-allocation@1"
    || !boundedText(value.eventId, 512)
    || !boundedText(value.applicationId, 512)
    || !safeInteger(value.tick, 1)
    || !safeInteger(value.applicationTick, 1)
    || (value.applicationTiming !== "immediate" && value.applicationTiming !== "deferred")
    || !boundedText(value.campaignId, 256)
    || !boundedText(value.commandId, 512)
    || !recordedDepthCommandTypes.includes(value.commandType as RecordedDepthCommandType)
    || !boundedText(value.sourceHeadline)
    || !boundedText(value.sourceAction)
    || !boundedText(value.sourceLocation)
    || !boundedText(value.heroId, 512)
    || !boundedText(value.heroName, 160)
    || !boundedText(value.className, 120)
    || !validEquipment(value.equipmentAfter)
    || !safeInteger(value.selectionCount, 1, 3)
    || !Array.isArray(value.selections)
    || value.selections.length !== value.selectionCount
    || (value.levelTransition !== null && !isHeroLevelUpPacketV1(value.levelTransition))
    || !validDerived(value.derivedBefore)
    || !validDerived(value.derivedAfter)
    || !validDerived(value.totalDerivedDelta, true)
    || !validDerived(value.levelOnlyDerivedDelta, true)
    || !validDerived(value.growthDerivedDelta, true)
    || !validDerived(value.otherSameBeatDerivedDelta, true)) return false;
  const packet = value as unknown as HeroGrowthAllocationPacketV1;
  if (!packet.selections.every((selection, index) => validSelection(selection, packet, index))) return false;
  const recordIds = packet.selections.map((selection) => selection.record.id);
  const expectedTiming: HeroGrowthAllocationTiming = packet.selections.every((selection) => selection.settlementTiming === "immediate")
    ? "immediate"
    : "deferred";
  const expectedTotal = subtractDerived(packet.derivedAfter, packet.derivedBefore);
  const expectedGrowth = packet.selections.reduce((total, selection) => addDeltas(
    total,
    subtractDerived(selection.derivedAfter, selection.derivedBefore),
  ), zeroDelta());
  const expectedLevelOnly = packet.levelTransition?.levelOnlyDerivedDelta ?? zeroDelta();
  const expectedOther = subtractDeltas(subtractDeltas(expectedTotal, expectedLevelOnly), expectedGrowth);
  const componentSum = addDeltas(addDeltas(expectedLevelOnly, expectedGrowth), expectedOther);
  const checkpoints = packet.selections.map((selection) => selection.record.checkpointLevel);
  const finalSelection = packet.selections.at(-1);
  return packet.eventId === `${packet.campaignId}:${packet.applicationTick}`
    && packet.tick === packet.applicationTick
    && packet.applicationId === applicationId(packet.campaignId, packet.eventId, recordIds)
    && packet.applicationTiming === expectedTiming
    && new Set(recordIds).size === recordIds.length
    && checkpoints.every((checkpoint, index) => index === 0 || checkpoint > checkpoints[index - 1]!)
    && validSelectionChain(packet.selections)
    && finalSelection !== undefined
    && sameValue(packet.derivedAfter, finalSelection.derivedAfter)
    && sameValue(packet.totalDerivedDelta, expectedTotal)
    && sameValue(packet.levelOnlyDerivedDelta, expectedLevelOnly)
    && sameValue(packet.growthDerivedDelta, expectedGrowth)
    && sameValue(packet.otherSameBeatDerivedDelta, expectedOther)
    && sameValue(componentSum, packet.totalDerivedDelta)
    && (packet.levelTransition === null
      || (packet.levelTransition.eventId === packet.eventId
        && packet.levelTransition.tick === packet.applicationTick
        && packet.levelTransition.campaignId === packet.campaignId
        && packet.levelTransition.commandId === packet.commandId
        && packet.levelTransition.commandType === packet.commandType
        && packet.levelTransition.heroId === packet.heroId
        && packet.levelTransition.heroName === packet.heroName
        && packet.levelTransition.className === packet.className
        && sameValue(packet.levelTransition.derivedBefore, packet.derivedBefore)
        && sameValue(packet.levelTransition.derivedAfter, packet.derivedAfter)
        && sameValue(packet.levelTransition.equipmentAfter, packet.equipmentAfter)));
}

export function projectHeroGrowthAllocation(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): HeroGrowthAllocationPacketV1 | null {
  const beforeGrowth = before.depth.heroGrowth;
  const afterGrowth = after.depth.heroGrowth;
  if (!safeWorldPair(before, after, source)
    || afterGrowth.records.length <= beforeGrowth.records.length
    || afterGrowth.records.length - beforeGrowth.records.length > 3
    || !sameValue(afterGrowth.records.slice(0, beforeGrowth.records.length), beforeGrowth.records)) return null;
  const records = afterGrowth.records.slice(beforeGrowth.records.length);
  if (records.some((record) => record.tick !== after.tick
    || !validGrowthRecord(record, after.campaignId, after.hero.id, after.tick))
    || !validGrowthAppend(before, after, records)) return null;
  const commandId = source.commandId;
  const commandType = source.commandType;
  if (commandId === undefined || commandType === undefined) return null;
  const levelTransition = projectHeroLevelUp(before, after, source);
  if ((after.hero.level > before.hero.level) !== (levelTransition !== null)
    || after.hero.level < before.hero.level) return null;
  const selections = records.map((record, index): HeroGrowthAllocationSelectionV1 => {
    const selectedCandidate = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
    if (selectedCandidate === undefined) throw new TypeError("Canonical growth record has no selected candidate");
    return {
      selectionOrdinal: index + 1,
      turningPointOrdinal: [10, 25, 50].indexOf(record.checkpointLevel) + 1,
      selectionCount: records.length,
      settlementTiming: record.crossedTick === after.tick ? "immediate" : "deferred",
      record,
      selectedCandidate,
      attributesBefore: record.attributesBefore,
      attributesAfter: selectedCandidate.attributesAfter,
      derivedBefore: record.derivedBefore,
      derivedAfter: selectedCandidate.derivedAfter,
      resourcesBefore: record.resourcesBefore,
      resourcesAfter: selectedCandidate.resourcesAfter,
    };
  });
  const derivedBefore = derivedStats(before.depth.hero);
  const derivedAfter = derivedStats(after.depth.hero);
  const totalDerivedDelta = subtractDerived(derivedAfter, derivedBefore);
  const levelOnlyDerivedDelta = levelTransition?.levelOnlyDerivedDelta ?? zeroDelta();
  const growthDerivedDelta = selections.reduce((total, selection) => addDeltas(
    total,
    subtractDerived(selection.derivedAfter, selection.derivedBefore),
  ), zeroDelta());
  const otherSameBeatDerivedDelta = subtractDeltas(
    subtractDeltas(totalDerivedDelta, levelOnlyDerivedDelta),
    growthDerivedDelta,
  );
  const timing: HeroGrowthAllocationTiming = selections.every((selection) => selection.settlementTiming === "immediate")
    ? "immediate"
    : "deferred";
  const packet = deepFrozenCopy<HeroGrowthAllocationPacketV1>({
    schemaVersion: 1,
    recipeId: "hero-growth-allocation@1",
    eventId: source.id,
    applicationId: applicationId(after.campaignId, source.id, records.map((record) => record.id)),
    tick: after.tick,
    applicationTick: after.tick,
    applicationTiming: timing,
    campaignId: after.campaignId,
    commandId,
    commandType,
    sourceHeadline: source.headline,
    sourceAction: source.action,
    sourceLocation: source.location,
    heroId: after.hero.id,
    heroName: after.hero.name,
    className: after.depth.hero.className,
    equipmentAfter: equipmentFacts(after),
    selectionCount: selections.length,
    selections,
    levelTransition,
    derivedBefore,
    derivedAfter,
    totalDerivedDelta,
    levelOnlyDerivedDelta,
    growthDerivedDelta,
    otherSameBeatDerivedDelta,
  });
  return isHeroGrowthAllocationPacketV1(packet) ? packet : null;
}
