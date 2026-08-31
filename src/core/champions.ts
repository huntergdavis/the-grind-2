import { canonicalHash, canonicalStringify } from "./canonical";
import type { AbilityEffect, AbilityKind, EquipmentSlot, ItemState } from "../depth/types";
import { recordedDepthCommandTypes } from "./types";
import type {
  ChampionAbilityRecord,
  ChampionEquipmentRecord,
  ChampionInduction,
  ChampionQualification,
  RecordedDepthCommandType,
  WorldState,
} from "./types";

export const championLevelV1 = 1_000;
export const championExperienceFloorV1 = 11_976_012;
export const maximumChampionSnapshotBytes = 4_096;
export const maximumChampionAbilities = 3;
export const maximumChampionEquipment = 6;

const equipmentSlots: readonly EquipmentSlot[] = ["weapon", "offhand", "head", "body", "feet", "charm"];
const rarities: readonly ItemState["rarity"][] = ["common", "uncommon", "rare", "legendary"];
const abilityKinds: readonly AbilityKind[] = ["spell", "technique", "secret"];
const abilityEffects: readonly AbilityEffect[] = ["arcane", "burning", "poison", "weaken", "piercing"];

type ChampionContent = Omit<ChampionInduction, "id" | "contentHash">;

export interface ChampionSourceCommand {
  id: string;
  type: RecordedDepthCommandType;
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

function contentOf(record: ChampionInduction): ChampionContent {
  const { id: _id, contentHash: _contentHash, ...content } = record;
  return content;
}

function championId(contentHash: string): string {
  return `champion:${contentHash}`;
}

function equippedRecords(state: WorldState): readonly ChampionEquipmentRecord[] {
  return equipmentSlots.flatMap((slot) => {
    const itemId = state.depth.hero.equipment[slot];
    const item = itemId === null
      ? undefined
      : state.depth.hero.inventory.find((candidate) => candidate.id === itemId);
    if (item === undefined || item.kind !== "equipment" || item.slot !== slot) return [];
    return [{ itemId: item.id, itemName: item.name, slot, rarity: item.rarity }];
  });
}

function abilityRecords(state: WorldState): readonly ChampionAbilityRecord[] {
  return [...state.depth.hero.abilities]
    .sort((left, right) =>
      right.level - left.level ||
      right.uses - left.uses ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    )
    .slice(0, maximumChampionAbilities)
    .map((ability) => ({
      abilityId: ability.id,
      abilityName: ability.name,
      kind: ability.kind,
      effect: ability.effect,
      level: ability.level,
    }));
}

export function createChampionInduction(
  state: WorldState,
  qualification: ChampionQualification,
  sourceCommand: ChampionSourceCommand | null,
): ChampionInduction {
  if (
    state.hero.level < championLevelV1 ||
    state.depth.hero.level < championLevelV1 ||
    state.hero.experience < championExperienceFloorV1 ||
    state.depth.hero.experience < championExperienceFloorV1
  ) {
    throw new RangeError(`Champion induction requires Level ${championLevelV1}`);
  }
  if (
    (qualification === "earned" && sourceCommand === null) ||
    (qualification === "adopted" && sourceCommand !== null)
  ) {
    throw new TypeError("Champion qualification and source command provenance disagree");
  }
  const content: ChampionContent = {
    schemaVersion: 1,
    sourceCampaignId: state.campaignId,
    heroId: state.hero.id,
    heroName: state.hero.name,
    className: state.depth.hero.className,
    level: championLevelV1,
    experience: state.hero.experience,
    recordedTick: state.tick,
    qualification,
    sourceCommandId: sourceCommand?.id ?? null,
    sourceCommandType: sourceCommand?.type ?? "unknown-released-save",
    totalCompletedQuests: state.depth.totalCompletedQuests,
    equipment: equippedRecords(state),
    abilities: abilityRecords(state),
  };
  const contentHash = canonicalHash(content);
  const record: ChampionInduction = {
    ...content,
    id: championId(contentHash),
    contentHash,
  };
  if (!isValidChampionInduction(record)) {
    throw new TypeError("Champion induction exceeds the immutable snapshot contract");
  }
  return record;
}

function isValidEquipmentRecord(value: unknown): value is ChampionEquipmentRecord {
  return isRecord(value) &&
    hasExactKeys(value, ["itemId", "itemName", "slot", "rarity"]) &&
    boundedString(value.itemId, 256) &&
    boundedString(value.itemName, 120) &&
    equipmentSlots.includes(value.slot as EquipmentSlot) &&
    rarities.includes(value.rarity as ItemState["rarity"]);
}

function isValidAbilityRecord(value: unknown): value is ChampionAbilityRecord {
  return isRecord(value) &&
    hasExactKeys(value, ["abilityId", "abilityName", "kind", "effect", "level"]) &&
    boundedString(value.abilityId, 256) &&
    boundedString(value.abilityName, 120) &&
    abilityKinds.includes(value.kind as AbilityKind) &&
    abilityEffects.includes(value.effect as AbilityEffect) &&
    Number.isSafeInteger(value.level) &&
    (value.level as number) >= 1 &&
    (value.level as number) <= 20;
}

export function isValidChampionInduction(value: unknown): value is ChampionInduction {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion",
    "id",
    "contentHash",
    "sourceCampaignId",
    "heroId",
    "heroName",
    "className",
    "level",
    "experience",
    "recordedTick",
    "qualification",
    "sourceCommandId",
    "sourceCommandType",
    "totalCompletedQuests",
    "equipment",
    "abilities",
  ])) return false;
  if (
    value.schemaVersion !== 1 ||
    !boundedString(value.contentHash, 16) || !/^[0-9a-f]{16}$/.test(value.contentHash) ||
    value.id !== championId(value.contentHash) ||
    !boundedString(value.sourceCampaignId, 256) ||
    !boundedString(value.heroId, 256) ||
    !boundedString(value.heroName, 120) ||
    !boundedString(value.className, 80) ||
    value.level !== championLevelV1 ||
    !nonNegativeSafeInteger(value.experience) || value.experience < championExperienceFloorV1 ||
    !nonNegativeSafeInteger(value.recordedTick) ||
    (value.qualification !== "earned" && value.qualification !== "adopted") ||
    !nonNegativeSafeInteger(value.totalCompletedQuests) ||
    !Array.isArray(value.equipment) || value.equipment.length > maximumChampionEquipment ||
    !value.equipment.every(isValidEquipmentRecord) ||
    new Set(value.equipment.map((entry) => entry.slot)).size !== value.equipment.length ||
    !Array.isArray(value.abilities) || value.abilities.length > maximumChampionAbilities ||
    !value.abilities.every(isValidAbilityRecord) ||
    new Set(value.abilities.map((entry) => entry.abilityId)).size !== value.abilities.length
  ) return false;
  const validSource = value.qualification === "earned"
    ? boundedString(value.sourceCommandId, 512) &&
      recordedDepthCommandTypes.includes(value.sourceCommandType as RecordedDepthCommandType)
    : value.sourceCommandId === null && value.sourceCommandType === "unknown-released-save";
  if (!validSource) return false;
  const record = value as unknown as ChampionInduction;
  if (record.contentHash !== canonicalHash(contentOf(record))) return false;
  return new TextEncoder().encode(canonicalStringify(record)).byteLength <= maximumChampionSnapshotBytes;
}

export function isValidChampionForState(
  induction: ChampionInduction | null,
  state: Pick<WorldState, "campaignId" | "tick" | "hero" | "depth">,
): boolean {
  if (induction === null) {
    return state.hero.level < championLevelV1 &&
      state.depth.hero.level < championLevelV1 &&
      state.hero.experience < championExperienceFloorV1 &&
      state.depth.hero.experience < championExperienceFloorV1;
  }
  return isValidChampionInduction(induction) &&
    state.hero.level >= championLevelV1 &&
    state.depth.hero.level >= championLevelV1 &&
    state.hero.experience >= championExperienceFloorV1 &&
    state.depth.hero.experience >= championExperienceFloorV1 &&
    induction.sourceCampaignId === state.campaignId &&
    induction.heroId === state.hero.id &&
    induction.heroName === state.hero.name &&
    induction.className === state.depth.hero.className &&
    induction.experience <= state.hero.experience &&
    induction.recordedTick <= state.tick &&
    induction.totalCompletedQuests <= state.depth.totalCompletedQuests;
}
