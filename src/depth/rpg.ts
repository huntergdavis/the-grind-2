import { pick, randomInt } from "../core/rng";
import type {
  AbilityState,
  AttributeName,
  CombatState,
  CombatantState,
  CompletedQuestSummary,
  DetailedHeroState,
  EquipmentSlot,
  HeroAttributes,
  ItemModifier,
  ItemState,
  QuestObjective,
  QuestObjectiveRule,
  QuestProgressFact,
  QuestRewardGrant,
  QuestRewardReceipt,
  QuestState,
  QuestStatus,
  SubquestState,
  WeaponUseMasteryState,
  WeaponUseReceipt,
} from "./types";

export const inventoryCapacity = 32;
export const maximumAbilities = 16;
export const maximumMonsterLoreEntries = 16;
export const maximumHeroLevel = 1_000;
export const maximumHeroMechanicalLevel = 50;
export const secretTechniqueInsightRequired = 3;
export const questSequenceGeneratorVersion = "quest-sequence-v1" as const;
export const maximumWeaponUseLevel = 10;
export const maximumWeaponUseExperience = 45;
export const weaponUseExperienceFloors = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45] as const;
export const emberTonicTargetQuantity = 3;
export const emberTonicUnitPrice = 5;

export const heroClasses = ["Wayfinder", "Warden", "Spellblade", "Tinker", "Wildspeaker"] as const;
const equipmentSlots: readonly EquipmentSlot[] = ["weapon", "offhand", "head", "body", "feet", "charm"];
const attributeNames: readonly AttributeName[] = ["strength", "agility", "vitality", "intellect", "spirit", "luck"];
const itemKinds: readonly ItemState["kind"][] = ["equipment", "consumable", "key"];
const itemRarities: readonly ItemState["rarity"][] = ["common", "uncommon", "rare", "legendary"];
const itemModifiers: readonly ItemModifier[] = [...attributeNames, "power", "armor", "maxHealth", "maxMana"];
const objectiveStatuses: readonly QuestObjective["status"][] = ["active", "complete", "failed"];
const questStatuses: readonly QuestStatus[] = ["active", "ready-to-fulfill", "fulfilled", "failed"];
const abilityKinds: readonly AbilityState["kind"][] = ["spell", "technique", "secret"];
const abilityEffects: readonly AbilityState["effect"][] = ["arcane", "burning", "poison", "weaken", "piercing"];
const lootNames = ["Ashen", "Bright", "Deepdelver's", "Foxfire", "Moonlit", "Wayfarer's"] as const;
const lootNouns: Record<EquipmentSlot, readonly string[]> = {
  weapon: ["Blade", "Spear", "Wand"],
  offhand: ["Buckler", "Grimoire", "Lantern"],
  head: ["Cap", "Crown", "Helm"],
  body: ["Coat", "Mail", "Vest"],
  feet: ["Boots", "Greaves", "Sandals"],
  charm: ["Compass", "Locket", "Talisman"],
};

const spellTemplates = [
  { id: "spell:ember-arc", name: "Ember Arc", effect: "burning", manaCost: 3, potency: 4 },
  { id: "spell:river-star", name: "River Star", effect: "arcane", manaCost: 3, potency: 5 },
  { id: "spell:thorn-hex", name: "Thorn Hex", effect: "poison", manaCost: 2, potency: 3 },
] as const;

const classTechniques: Record<string, { id: string; name: string; effect: AbilityState["effect"]; manaCost: number; potency: number }> = {
  Wayfinder: { id: "technique:horizon-step", name: "Horizon Step", effect: "piercing", manaCost: 0, potency: 4 },
  Warden: { id: "technique:bastion-cut", name: "Bastion Cut", effect: "weaken", manaCost: 0, potency: 3 },
  Spellblade: { id: "technique:spell-edge", name: "Spell Edge", effect: "arcane", manaCost: 1, potency: 5 },
  Tinker: { id: "technique:springbolt", name: "Springbolt", effect: "piercing", manaCost: 0, potency: 4 },
  Wildspeaker: { id: "technique:root-whisper", name: "Root Whisper", effect: "poison", manaCost: 0, potency: 3 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function weaponUseLevelForExperience(experience: number): number {
  if (!isBoundedInteger(experience, 0, maximumWeaponUseExperience)) {
    throw new RangeError("Weapon Use Mastery experience must be an integer from 0 through 45");
  }
  let level = 1;
  for (let index = 1; index < weaponUseExperienceFloors.length; index += 1) {
    const floor = weaponUseExperienceFloors[index];
    if (floor === undefined || experience < floor) break;
    level = index + 1;
  }
  return level;
}

export function createWeaponUseMastery(): WeaponUseMasteryState {
  return {
    schemaVersion: 1,
    rulesVersion: "weapon-effective-use-v1",
    level: 1,
    experience: 0,
    receipts: [],
  };
}

function isValidWeaponUseReceipt(
  value: unknown,
  weaponId: string,
  expectedExperienceBefore: number,
  previous: WeaponUseReceipt | undefined,
): value is WeaponUseReceipt {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "id", "combatId", "weaponId", "resolvedTick", "outcome", "basicStrikes", "damage",
    "experienceBefore", "experienceAfter", "levelBefore", "levelAfter",
  ])) return false;
  const outcome = value.outcome;
  const combatId = value.combatId;
  return value.schemaVersion === 1 && typeof combatId === "string" && combatId.length > 0 &&
    value.id === `${combatId}:weapon-use:${weaponId}` && value.weaponId === weaponId &&
    (outcome === "victory" || outcome === "defeat" || outcome === "stalemate") &&
    isBoundedInteger(value.resolvedTick, 0, Number.MAX_SAFE_INTEGER) &&
    (previous === undefined || value.resolvedTick > previous.resolvedTick) &&
    isBoundedInteger(value.basicStrikes, 1, 128) && isBoundedInteger(value.damage, 1, Number.MAX_SAFE_INTEGER) &&
    value.experienceBefore === expectedExperienceBefore && value.experienceAfter === expectedExperienceBefore + 1 &&
    value.levelBefore === weaponUseLevelForExperience(expectedExperienceBefore) &&
    value.levelAfter === weaponUseLevelForExperience(expectedExperienceBefore + 1);
}

export function isValidWeaponUseMastery(value: unknown, weaponId: string): value is WeaponUseMasteryState {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "rulesVersion", "level", "experience", "receipts"]) ||
    !Array.isArray(value.receipts) || value.receipts.length > maximumWeaponUseExperience) return false;
  const receipts = value.receipts as unknown[];
  let previous: WeaponUseReceipt | undefined;
  const combatIds = new Set<string>();
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    if (!isValidWeaponUseReceipt(receipt, weaponId, index, previous)) return false;
    if (combatIds.has(receipt.combatId)) return false;
    combatIds.add(receipt.combatId);
    previous = receipt;
  }
  return value.schemaVersion === 1 && value.rulesVersion === "weapon-effective-use-v1" &&
    value.experience === receipts.length && value.level === weaponUseLevelForExperience(receipts.length);
}

export function applyWeaponUseMastery(
  item: ItemState,
  combat: Pick<CombatState, "id" | "outcome" | "weaponUse">,
  resolvedTick: number,
): { item: ItemState; receipt: WeaponUseReceipt | null } {
  if (item.kind !== "equipment" || item.slot !== "weapon" || item.useMastery === null ||
    !isValidWeaponUseMastery(item.useMastery, item.id)) throw new Error("Weapon Use Mastery requires a valid weapon");
  if (combat.outcome === "ongoing" || combat.weaponUse.tracking !== "tracked" ||
    combat.weaponUse.weaponId !== item.id || combat.weaponUse.basicStrikes < 1 || combat.weaponUse.damage < 1) {
    return { item, receipt: null };
  }
  if (!isBoundedInteger(resolvedTick, 0, Number.MAX_SAFE_INTEGER)) throw new RangeError("Weapon Use Mastery tick is invalid");
  const experienceBefore = item.useMastery.experience;
  if (experienceBefore >= maximumWeaponUseExperience) return { item, receipt: null };
  const experienceAfter = experienceBefore + 1;
  const receipt: WeaponUseReceipt = {
    schemaVersion: 1,
    id: `${combat.id}:weapon-use:${item.id}`,
    combatId: combat.id,
    weaponId: item.id,
    resolvedTick,
    outcome: combat.outcome,
    basicStrikes: combat.weaponUse.basicStrikes,
    damage: combat.weaponUse.damage,
    experienceBefore,
    experienceAfter,
    levelBefore: item.useMastery.level,
    levelAfter: weaponUseLevelForExperience(experienceAfter),
  };
  const useMastery: WeaponUseMasteryState = {
    ...item.useMastery,
    level: receipt.levelAfter,
    experience: experienceAfter,
    receipts: [...item.useMastery.receipts, receipt],
  };
  if (!isValidWeaponUseMastery(useMastery, item.id)) throw new Error("Weapon Use Mastery settlement is invalid");
  return { item: { ...item, useMastery }, receipt };
}

export function describeWeaponUseReceipt(itemName: string, receipt: WeaponUseReceipt): string {
  const nextFloor = weaponUseExperienceFloors[receipt.levelAfter];
  const progress = receipt.levelAfter === maximumWeaponUseLevel
    ? "Use Mastery L10 · mastery cap"
    : receipt.levelAfter > receipt.levelBefore
      ? `Use Level ${receipt.levelBefore}→${receipt.levelAfter}`
      : `${receipt.experienceAfter}/${nextFloor} toward Use Level ${receipt.levelAfter + 1}`;
  return `${itemName} · ${receipt.basicStrikes} basic ${receipt.basicStrikes === 1 ? "strike" : "strikes"} · ${receipt.damage} damage · use XP ${receipt.experienceBefore}→${receipt.experienceAfter} · ${progress} · no combat bonus`;
}

function isBoundedReference(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}

export function isValidItemState(value: unknown): value is ItemState {
  if (!isRecord(value) || !isRecord(value.modifiers)) return false;
  const kind = value.kind as ItemState["kind"];
  const slot = value.slot as EquipmentSlot | null;
  const modifierEntries = Object.entries(value.modifiers);
  const restorative = value.restorative;
  const useMastery = value.useMastery;
  const validRestorative = restorative === null || (
    isRecord(restorative) &&
    hasExactKeys(restorative, ["schemaVersion", "kind", "target"]) &&
    restorative.schemaVersion === 1 &&
    restorative.kind === "restore-health-quarter-max" &&
    restorative.target === "self"
  );
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    itemKinds.includes(kind) &&
    itemRarities.includes(value.rarity as ItemState["rarity"]) &&
    isBoundedInteger(value.quantity, 1, Number.MAX_SAFE_INTEGER) &&
    (kind === "equipment"
      ? equipmentSlots.includes(slot as EquipmentSlot) && value.quantity === 1
      : slot === null && modifierEntries.length === 0) &&
    (kind === "equipment" && slot === "weapon"
      ? isValidWeaponUseMastery(useMastery, value.id as string)
      : useMastery === null) &&
    validRestorative &&
    (kind === "consumable" || restorative === null) &&
    modifierEntries.every(([modifier, amount]) =>
      itemModifiers.includes(modifier as ItemModifier) && isBoundedInteger(amount, 0, 100)
    )
  );
}

export function restorativeHealthAmount(item: ItemState, maximumHealth: number): number {
  if (item.restorative?.kind !== "restore-health-quarter-max") return 0;
  if (!Number.isSafeInteger(maximumHealth) || maximumHealth <= 0) {
    throw new RangeError("Restorative maximum health must be a positive integer");
  }
  return Math.ceil(maximumHealth / 4);
}

export function isValidQuestObjectiveRule(value: unknown): value is QuestObjectiveRule {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "visit-location":
      return hasExactKeys(value, ["schemaVersion", "kind", "locationKind", "firstVisitOnly"]) &&
        value.locationKind === "town" && value.firstVisitOnly === true;
    case "win-combat":
      return hasExactKeys(value, ["schemaVersion", "kind"]);
    case "complete-dungeon":
      return hasExactKeys(value, ["schemaVersion", "kind", "binding"]) &&
        (value.binding === "any" || value.binding === "quest-lead");
    case "discover-dungeon-feature":
      return hasExactKeys(value, ["schemaVersion", "kind", "feature", "binding"]) &&
        value.feature === "shrine" && (value.binding === "any" || value.binding === "quest-lead");
    case "acquire-item":
      return hasExactKeys(value, ["schemaVersion", "kind", "disposition"]) && value.disposition === "inventory";
    default:
      return false;
  }
}

function isValidQuestObjective(value: unknown): value is QuestObjective {
  if (!isRecord(value)) return false;
  const status = value.status as QuestObjective["status"];
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.description === "string" && value.description.length > 0 &&
    isValidQuestObjectiveRule(value.rule) &&
    isBoundedInteger(value.target, 1, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.current, 0, value.target as number) &&
    objectiveStatuses.includes(status) &&
    (status !== "complete" || value.current === value.target) &&
    (status !== "active" || value.current < value.target)
  );
}

function isValidAbilityState(value: unknown): value is AbilityState {
  if (!isRecord(value)) return false;
  const level = value.level as number;
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    abilityKinds.includes(value.kind as AbilityState["kind"]) &&
    abilityEffects.includes(value.effect as AbilityState["effect"]) &&
    isBoundedInteger(level, 1, 20) &&
    isBoundedInteger(value.experience, abilityExperienceFloor(level), abilityExperienceFloor(20)) &&
    (level === 20
      ? value.experience === abilityExperienceFloor(20)
      : (value.experience as number) < abilityExperienceCeiling(level)) &&
    isBoundedInteger(value.uses, 0, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.manaCost, 0, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.potency, 0, Number.MAX_SAFE_INTEGER) &&
    (value.kind === "secret"
      ? typeof value.sourceMonsterId === "string" && value.sourceMonsterId.length > 0
      : value.sourceMonsterId === null)
  );
}

function isValidMonsterLoreState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.monsterId === "string" && value.monsterId.length > 0 &&
    typeof value.monsterName === "string" && value.monsterName.length > 0 &&
    typeof value.secretTechniqueId === "string" && value.secretTechniqueId.length > 0 &&
    typeof value.secretTechniqueName === "string" && value.secretTechniqueName.length > 0 &&
    isBoundedInteger(value.encounters, 0, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.victories, 0, value.encounters as number) &&
    isBoundedInteger(value.requiredInsight, 1, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.insight, 0, value.requiredInsight as number) &&
    typeof value.learned === "boolean" &&
    value.learned === (value.insight === value.requiredInsight)
  );
}

function aggregateObjectiveStatus(objectives: readonly Pick<QuestObjective, "status">[]): QuestObjective["status"] {
  if (objectives.some((objectiveState) => objectiveState.status === "failed")) return "failed";
  return objectives.every((objectiveState) => objectiveState.status === "complete") ? "complete" : "active";
}

export function isValidQuestState(value: unknown): value is QuestState {
  if (!isRecord(value) || !Array.isArray(value.objectives) || !Array.isArray(value.subquests)) return false;
  if (
    typeof value.id !== "string" || value.id.length === 0 ||
    typeof value.title !== "string" || value.title.length === 0 ||
    typeof value.summary !== "string" || value.summary.length === 0 ||
    !questStatuses.includes(value.status as QuestState["status"]) ||
    !isBoundedInteger(value.ordinal, 0, Number.MAX_SAFE_INTEGER - 1) ||
    !isBoundedInteger(value.admittedTick, 0, Number.MAX_SAFE_INTEGER) ||
    typeof value.instanceId !== "string" || value.instanceId !== questInstanceId(value.id, value.ordinal as number) ||
    value.objectives.length === 0 ||
    !value.objectives.every(isValidQuestObjective)
  ) return false;
  const subquests = value.subquests as unknown as SubquestState[];
  if (!subquests.every((subquest) =>
    isRecord(subquest) &&
    typeof subquest.id === "string" && subquest.id.length > 0 &&
    typeof subquest.title === "string" && subquest.title.length > 0 &&
    objectiveStatuses.includes(subquest.status) &&
    Array.isArray(subquest.objectives) && subquest.objectives.length > 0 &&
    subquest.objectives.every(isValidQuestObjective) &&
    subquest.status === aggregateObjectiveStatus(subquest.objectives)
  )) return false;
  const objectiveIds = [
    ...(value.objectives as QuestObjective[]).map((objectiveState) => objectiveState.id),
    ...subquests.flatMap((subquest) => subquest.objectives.map((objectiveState) => objectiveState.id)),
  ];
  const subquestIds = subquests.map((subquest) => subquest.id);
  const aggregateStatus = aggregateObjectiveStatus([
    ...(value.objectives as QuestObjective[]),
    ...subquests.map((subquest) => ({
      id: subquest.id,
      description: subquest.title,
      current: subquest.status === "complete" ? 1 : 0,
      target: 1,
      status: subquest.status,
    })),
  ]);
  const validQuestStatus = aggregateStatus === "complete"
    ? value.status === "ready-to-fulfill" || value.status === "fulfilled"
    : value.status === aggregateStatus;
  return (
    new Set(objectiveIds).size === objectiveIds.length &&
    new Set(subquestIds).size === subquestIds.length &&
    validQuestStatus
  );
}

export const maximumCompletedQuestSummaries = 8;
export const questRewardExperienceAward = 25;
export const questRewardBaseGoldAward = 15;

const questRewardConversionGold: Readonly<Record<ItemState["rarity"], number>> = {
  common: 4,
  uncommon: 8,
  rare: 16,
  legendary: 32,
};
const expectedQuestRewardItemCache = new WeakMap<object, { seed: string; completionId: string; item: ItemState }>();

export function questInstanceId(questId: unknown, ordinal: number): string {
  return `${String(questId)}:instance:${ordinal}`;
}

export function questCompletionId(instanceId: string): string {
  return `${instanceId}:fulfilled`;
}

function isValidCompletedQuestSummary(value: unknown, currentTick: number): value is CompletedQuestSummary {
  if (!isRecord(value) || !Array.isArray(value.objectiveIds) || !Array.isArray(value.subquestIds)) return false;
  return (
    typeof value.questInstanceId === "string" && value.questInstanceId.length > 0 &&
    typeof value.questId === "string" && value.questId.length > 0 &&
    isBoundedInteger(value.questOrdinal, 0, Number.MAX_SAFE_INTEGER) &&
    value.questInstanceId === questInstanceId(value.questId, value.questOrdinal as number) &&
    value.id === questCompletionId(value.questInstanceId) &&
    typeof value.title === "string" && value.title.length > 0 &&
    isBoundedInteger(value.fulfilledTick, 0, currentTick) &&
    value.objectiveIds.length > 0 && value.objectiveIds.length <= 64 &&
    value.objectiveIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(value.objectiveIds).size === value.objectiveIds.length &&
    value.subquestIds.length <= 32 &&
    value.subquestIds.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(value.subquestIds).size === value.subquestIds.length
  );
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function questRewardGrantId(completionId: string): string {
  return `${completionId}:reward:0`;
}

export function createQuestRewardGrant(
  seed: string,
  summary: Pick<CompletedQuestSummary, "id" | "questInstanceId" | "questOrdinal" | "fulfilledTick">,
  inventoryLength: number,
  issuedTick = summary.fulfilledTick,
): QuestRewardGrant {
  const id = questRewardGrantId(summary.id);
  const item = generateLoot(seed, id, 0);
  const itemDisposition = inventoryLength >= inventoryCapacity ? "converted-to-gold" : "inventory";
  const itemConversionGold = itemDisposition === "converted-to-gold" ? questRewardConversionGold[item.rarity] : 0;
  return {
    schemaVersion: 1,
    id,
    completionId: summary.id,
    questInstanceId: summary.questInstanceId,
    questOrdinal: summary.questOrdinal,
    issuedTick,
    rulesVersion: "quest-reward-v1",
    experienceAward: questRewardExperienceAward,
    baseGoldAward: questRewardBaseGoldAward,
    item,
    itemDisposition,
    itemConversionGold,
    goldAward: questRewardBaseGoldAward + itemConversionGold,
  };
}

export function describeQuestRewardGrant(grant: QuestRewardGrant): string {
  const itemResult = grant.itemDisposition === "inventory"
    ? `${grant.item.name} → Inventory`
    : `${grant.item.name} → +${grant.itemConversionGold} gold (inventory full)`;
  return `Reward ready: +${grant.experienceAward} XP · +${grant.goldAward} gold · ${itemResult}`;
}

export function describeQuestRewardReceipt(grant: QuestRewardGrant, receipt: QuestRewardReceipt): string {
  const itemResult = receipt.itemDisposition === "inventory"
    ? `${grant.item.name} → Inventory`
    : receipt.itemConversionGold === grant.itemConversionGold
      ? `${grant.item.name} → +${receipt.itemConversionGold} gold (inventory full)`
      : receipt.itemConversionGold === 0
        ? `${grant.item.name} → ${grant.itemConversionGold} gold value capped (+0 credited)`
        : `${grant.item.name} → +${receipt.itemConversionGold}/${grant.itemConversionGold} gold (cap reached)`;
  const levelResult = receipt.levelAfter > receipt.levelBefore
    ? ` · Level ${receipt.levelBefore}→${receipt.levelAfter}`
    : "";
  return `Reward granted at T${receipt.appliedTick}: +${receipt.experienceDelta} XP · +${receipt.goldDelta} gold · ${itemResult}${levelResult}`;
}

export function describeCompletedQuestReward(summary: CompletedQuestSummary): string {
  if (summary.reward.status === "legacy-no-grant") return "Legacy completion · no reward record";
  return summary.reward.status === "pending"
    ? describeQuestRewardGrant(summary.reward.grant)
    : describeQuestRewardReceipt(summary.reward.grant, summary.reward.receipt);
}

function sameItem(left: ItemState, right: ItemState): boolean {
  const canonicalOrder = ([leftKey]: readonly [string, unknown], [rightKey]: readonly [string, unknown]) => leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  const leftModifiers = Object.entries(left.modifiers).sort(canonicalOrder);
  const rightModifiers = Object.entries(right.modifiers).sort(canonicalOrder);
  return left.id === right.id && left.name === right.name && left.kind === right.kind &&
    left.slot === right.slot && left.rarity === right.rarity && left.quantity === right.quantity &&
    JSON.stringify(leftModifiers) === JSON.stringify(rightModifiers) &&
    JSON.stringify(left.restorative) === JSON.stringify(right.restorative) &&
    JSON.stringify(left.useMastery) === JSON.stringify(right.useMastery);
}

function sameItemIdentity(left: ItemState, right: ItemState): boolean {
  const leftMastery = left.useMastery;
  const rightMastery = right.useMastery;
  return sameItem({ ...left, useMastery: rightMastery }, right) &&
    (left.kind === "equipment" && left.slot === "weapon" ? leftMastery !== null : leftMastery === null);
}

function sameGrant(left: QuestRewardGrant, right: QuestRewardGrant): boolean {
  return left.schemaVersion === right.schemaVersion && left.id === right.id &&
    left.completionId === right.completionId && left.questInstanceId === right.questInstanceId &&
    left.questOrdinal === right.questOrdinal && left.issuedTick === right.issuedTick &&
    left.rulesVersion === right.rulesVersion && left.experienceAward === right.experienceAward &&
    left.baseGoldAward === right.baseGoldAward && sameItem(left.item, right.item) &&
    left.itemDisposition === right.itemDisposition && left.itemConversionGold === right.itemConversionGold &&
    left.goldAward === right.goldAward;
}

function isValidQuestRewardGrant(
  value: unknown,
  seed: string,
  summary: CompletedQuestSummary,
  currentTick: number,
): value is QuestRewardGrant {
  if (!isRecord(value) || !isValidItemState(value.item)) return false;
  const cached = expectedQuestRewardItemCache.get(summary);
  const expectedItem = cached?.seed === seed && cached.completionId === summary.id
    ? cached.item
    : generateLoot(seed, questRewardGrantId(summary.id), 0);
  if (cached?.seed !== seed || cached.completionId !== summary.id) {
    expectedQuestRewardItemCache.set(summary, { seed, completionId: summary.id, item: expectedItem });
  }
  const disposition = value.itemDisposition;
  const expectedConversion = disposition === "converted-to-gold"
    ? questRewardConversionGold[expectedItem.rarity]
    : disposition === "inventory" ? 0 : -1;
  return value.schemaVersion === 1 && value.id === questRewardGrantId(summary.id) &&
    value.completionId === summary.id && value.questInstanceId === summary.questInstanceId &&
    value.questOrdinal === summary.questOrdinal && isBoundedInteger(value.issuedTick, summary.fulfilledTick, currentTick) &&
    value.rulesVersion === "quest-reward-v1" && value.experienceAward === questRewardExperienceAward &&
    value.baseGoldAward === questRewardBaseGoldAward && sameItem(value.item, expectedItem) &&
    value.itemConversionGold === expectedConversion &&
    value.goldAward === questRewardBaseGoldAward + expectedConversion;
}

function isValidQuestRewardReceipt(
  value: unknown,
  grant: QuestRewardGrant,
  currentTick: number,
): value is QuestRewardReceipt {
  if (!isRecord(value)) return false;
  const experienceBefore = value.experienceBefore;
  const goldBefore = value.goldBefore;
  if (!isBoundedInteger(experienceBefore, 0, Number.MAX_SAFE_INTEGER) ||
      !isBoundedInteger(goldBefore, 0, Number.MAX_SAFE_INTEGER)) return false;
  const experienceAfter = Math.min(Number.MAX_SAFE_INTEGER, experienceBefore + grant.experienceAward);
  const baseGoldAfter = Math.min(Number.MAX_SAFE_INTEGER, goldBefore + grant.baseGoldAward);
  const goldAfter = Math.min(Number.MAX_SAFE_INTEGER, goldBefore + grant.goldAward);
  const levelForReceipt = value.schemaVersion === 1
    ? legacyHeroLevelForExperience
    : value.schemaVersion === 2 ? heroLevelForExperience : null;
  return levelForReceipt !== null && value.id === `${grant.id}:receipt` && value.grantId === grant.id &&
    value.appliedTick === grant.issuedTick + 1 && value.appliedTick <= currentTick &&
    value.experienceDelta === experienceAfter - experienceBefore && value.experienceAfter === experienceAfter &&
    value.levelBefore === levelForReceipt(experienceBefore) &&
    value.levelAfter === levelForReceipt(experienceAfter) &&
    value.goldDelta === goldAfter - goldBefore && value.goldAfter === goldAfter &&
    value.itemId === grant.item.id && value.itemDisposition === grant.itemDisposition &&
    value.itemConversionGold === goldAfter - baseGoldAfter;
}

export function isValidQuestRewardState(
  seed: string,
  hero: DetailedHeroState,
  quest: QuestState,
  completedQuests: readonly CompletedQuestSummary[],
  pendingQuestReward: unknown,
  currentTick: number,
): pendingQuestReward is QuestRewardGrant | null {
  const latest = completedQuests.at(-1);
  let pending: QuestRewardGrant | null = null;
  for (const summary of completedQuests) {
    const reward = summary.reward;
    if (!isRecord(reward) || typeof reward.status !== "string") return false;
    if (reward.status === "legacy-no-grant") {
      if (summary.questInstanceId === quest.instanceId) return false;
      continue;
    }
    if (!isValidQuestRewardGrant(reward.grant, seed, summary, currentTick)) return false;
    const grant = reward.grant;
    if (reward.status === "pending") {
      if (pending !== null || summary !== latest || summary.questInstanceId !== quest.instanceId || grant.issuedTick !== currentTick) return false;
      pending = grant;
      continue;
    }
    if (reward.status !== "applied" || !isValidQuestRewardReceipt(reward.receipt, grant, currentTick)) return false;
    if (summary === latest && summary.questInstanceId === quest.instanceId && reward.receipt.appliedTick === currentTick) {
      const receipt = reward.receipt;
      if (
        hero.experience !== receipt.experienceAfter ||
        hero.level !== heroLevelForExperience(receipt.experienceAfter) ||
        (receipt.schemaVersion === 2 && hero.level !== receipt.levelAfter) ||
        hero.gold !== receipt.goldAfter
      ) return false;
      const carriesItem = hero.inventory.some((item) => item.id === grant.item.id && sameItemIdentity(item, grant.item));
      if ((grant.itemDisposition === "inventory") !== carriesItem) return false;
    }
  }
  if (quest.status !== "fulfilled") return pendingQuestReward === null && pending === null;
  if (latest?.questInstanceId !== quest.instanceId || latest.reward.status === "legacy-no-grant") return false;
  if (pending === null) return pendingQuestReward === null && latest.reward.status === "applied";
  if (!isRecord(pendingQuestReward) || !sameGrant(pending, pendingQuestReward as unknown as QuestRewardGrant)) return false;
  const expectedDisposition = hero.inventory.length >= inventoryCapacity ? "converted-to-gold" : "inventory";
  return pending.itemDisposition === expectedDisposition && !hero.inventory.some((item) => item.id === pending!.item.id);
}

export function isValidQuestCompletionState(
  quest: QuestState,
  completedQuests: unknown,
  totalCompletedQuests: unknown,
  currentTick: number,
): completedQuests is readonly CompletedQuestSummary[] {
  if (
    !isBoundedInteger(currentTick, 0, Number.MAX_SAFE_INTEGER) ||
    !isValidQuestState(quest) ||
    !Array.isArray(completedQuests) ||
    completedQuests.length > maximumCompletedQuestSummaries ||
    !isBoundedInteger(totalCompletedQuests, 0, Number.MAX_SAFE_INTEGER) ||
    !completedQuests.every((summary) => isValidCompletedQuestSummary(summary, currentTick))
  ) return false;
  const summaries = completedQuests as CompletedQuestSummary[];
  const ids = summaries.map((summary) => summary.id);
  const instanceIds = summaries.map((summary) => summary.questInstanceId);
  if (new Set(ids).size !== ids.length || new Set(instanceIds).size !== instanceIds.length) return false;
  const firstRetainedOrdinal = (totalCompletedQuests as number) - summaries.length;
  if (firstRetainedOrdinal < 0) return false;
  if (summaries.some((summary, index) =>
    summary.questOrdinal !== firstRetainedOrdinal + index ||
    (index > 0 && summary.fulfilledTick <= summaries[index - 1]!.fulfilledTick)
  )) return false;
  const expectedTotal = quest.status === "fulfilled" ? quest.ordinal + 1 : quest.ordinal;
  if (totalCompletedQuests !== expectedTotal) return false;
  const latest = summaries.at(-1);
  if (quest.status !== "fulfilled") {
    if (quest.ordinal === 0) return summaries.length === 0 && latest === undefined;
    return latest !== undefined && latest.reward.status === "applied" &&
      latest.questOrdinal === quest.ordinal - 1 && latest.questInstanceId !== quest.instanceId &&
      quest.admittedTick > latest.fulfilledTick && quest.admittedTick > latest.reward.receipt.appliedTick;
  }
  return (
    latest !== undefined &&
    latest.questInstanceId === quest.instanceId &&
    latest.questId === quest.id &&
    latest.questOrdinal === quest.ordinal &&
    latest.fulfilledTick > quest.admittedTick &&
    latest.title === quest.title &&
    sameStringList(latest.objectiveIds, [
      ...quest.objectives.map((objectiveState) => objectiveState.id),
      ...quest.subquests.flatMap((subquest) => subquest.objectives.map((objectiveState) => objectiveState.id)),
    ]) &&
    sameStringList(latest.subquestIds, quest.subquests.map((subquest) => subquest.id))
  );
}

export function isValidDetailedHeroState(value: unknown): value is DetailedHeroState {
  if (
    !isRecord(value) || !isRecord(value.attributes) || !isRecord(value.resources) ||
    !Array.isArray(value.inventory) || !isRecord(value.equipment) ||
    !Array.isArray(value.abilities) || !Array.isArray(value.monsterLore)
  ) return false;
  const attributes = value.attributes;
  if (
    typeof value.id !== "string" || value.id.length === 0 ||
    typeof value.name !== "string" || value.name.length === 0 ||
    typeof value.className !== "string" || !heroClasses.includes(value.className as typeof heroClasses[number]) ||
    !isBoundedInteger(value.level, 1, maximumHeroLevel) ||
    !isBoundedInteger(value.experience, 0, Number.MAX_SAFE_INTEGER) ||
    value.level !== heroLevelForExperience(value.experience as number) ||
    !isBoundedInteger(value.gold, 0, Number.MAX_SAFE_INTEGER) ||
    value.inventory.length > inventoryCapacity ||
    !value.inventory.every(isValidItemState) ||
    !attributeNames.every((attribute) => isBoundedInteger(attributes[attribute], 0, 999)) ||
    value.abilities.length > maximumAbilities || !value.abilities.every(isValidAbilityState) ||
    value.monsterLore.length > maximumMonsterLoreEntries || !value.monsterLore.every(isValidMonsterLoreState)
  ) return false;
  const inventory = value.inventory as ItemState[];
  const itemIds = inventory.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length) return false;
  const abilityIds = (value.abilities as AbilityState[]).map((abilityState) => abilityState.id);
  if (new Set(abilityIds).size !== abilityIds.length) return false;
  const loreIds = (value.monsterLore as { monsterId: string }[]).map((loreState) => loreState.monsterId);
  if (new Set(loreIds).size !== loreIds.length) return false;
  if (Object.keys(value.equipment).some((slot) => !equipmentSlots.includes(slot as EquipmentSlot))) return false;
  for (const slot of equipmentSlots) {
    const itemId = value.equipment[slot];
    if (itemId === null) continue;
    if (typeof itemId !== "string") return false;
    const item = inventory.find((candidate) => candidate.id === itemId);
    if (item === undefined || item.kind !== "equipment" || item.slot !== slot) return false;
  }
  const hero = value as unknown as DetailedHeroState;
  const stats = derivedStats(hero);
  return (
    isBoundedInteger(value.resources.maxHealth, 1, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.resources.health, 0, value.resources.maxHealth as number) &&
    isBoundedInteger(value.resources.maxMana, 0, Number.MAX_SAFE_INTEGER) &&
    isBoundedInteger(value.resources.mana, 0, value.resources.maxMana as number) &&
    value.resources.maxHealth === stats.maxHealth &&
    value.resources.maxMana === stats.maxMana
  );
}

function ability(
  template: { id: string; name: string; effect: AbilityState["effect"]; manaCost: number; potency: number },
  kind: AbilityState["kind"],
  sourceMonsterId: string | null = null,
): AbilityState {
  return {
    ...template,
    kind,
    level: 1,
    experience: 0,
    uses: 0,
    sourceMonsterId,
  };
}

export function abilityExperienceFloor(level: number): number {
  const boundedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return 6 * (boundedLevel - 1) ** 2;
}

export function heroExperienceFloor(level: number): number {
  const boundedLevel = Math.max(1, Math.min(maximumHeroLevel, Math.floor(level)));
  return 12 * (boundedLevel - 1) ** 2;
}

export function heroNextLevelRequirement(level: number): number | null {
  const boundedLevel = Math.max(1, Math.min(maximumHeroLevel, Math.floor(level)));
  return boundedLevel >= maximumHeroLevel ? null : 12 * boundedLevel ** 2;
}

export function heroLevelForExperience(experience: number): number {
  const boundedExperience = Number.isSafeInteger(experience) && experience > 0 ? experience : 0;
  return Math.min(maximumHeroLevel, 1 + Math.floor(Math.sqrt(boundedExperience / 12)));
}

export function legacyHeroLevelForExperience(experience: number): number {
  const boundedExperience = Number.isSafeInteger(experience) && experience > 0 ? experience : 0;
  return Math.min(maximumHeroMechanicalLevel, 1 + Math.floor(Math.sqrt(boundedExperience / 12)));
}

export function heroMechanicalLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > maximumHeroLevel) {
    throw new RangeError("Hero level is outside progression bounds");
  }
  return Math.min(maximumHeroMechanicalLevel, level);
}

export function heroMasteryForExperience(experience: number): number {
  const boundedExperience = Number.isSafeInteger(experience) && experience > 0 ? experience : 0;
  return Math.floor(boundedExperience / 250);
}

export interface HeroExperienceTransition {
  hero: DetailedHeroState;
  experienceBefore: number;
  experienceDelta: number;
  experienceAfter: number;
  levelBefore: number;
  levelAfter: number;
}

export function applyHeroExperience(input: DetailedHeroState, amount: number): HeroExperienceTransition {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Hero experience award must be a nonnegative safe integer");
  }
  if (
    !Number.isSafeInteger(input.experience) || input.experience < 0 ||
    input.level !== heroLevelForExperience(input.experience)
  ) {
    throw new TypeError("Hero experience state violates level invariants");
  }
  const experienceBefore = input.experience;
  const experienceAfter = Math.min(Number.MAX_SAFE_INTEGER, experienceBefore + amount);
  const levelAfter = heroLevelForExperience(experienceAfter);
  return {
    hero: { ...input, experience: experienceAfter, level: levelAfter },
    experienceBefore,
    experienceDelta: experienceAfter - experienceBefore,
    experienceAfter,
    levelBefore: input.level,
    levelAfter,
  };
}

export function abilityExperienceCeiling(level: number): number {
  const boundedLevel = Math.max(1, Math.min(20, Math.floor(level)));
  return boundedLevel >= 20 ? abilityExperienceFloor(20) : 6 * boundedLevel ** 2;
}

export function gainAbilityExperience(
  input: AbilityState,
  amount: number,
  countUse = true,
): AbilityState {
  const experience = Math.min(
    abilityExperienceFloor(20),
    input.experience + Math.max(0, Math.floor(amount)),
  );
  const level = Math.min(20, 1 + Math.floor(Math.sqrt(experience / 6)));
  return {
    ...input,
    experience,
    level,
    uses: Math.min(Number.MAX_SAFE_INTEGER, input.uses + (countUse ? 1 : 0)),
  };
}

export function starterAbilities(seed: string, heroId: string, className: string): readonly AbilityState[] {
  const spell = pick(spellTemplates, seed, "hero-depth", heroId, 0, "starter-spell");
  const technique = classTechniques[className] ?? classTechniques.Wayfinder;
  if (technique === undefined) throw new Error("Missing class technique");
  return [ability(spell, "spell"), ability(technique, "technique")];
}

export function emberTonicId(heroId: string): string {
  return `${heroId}:item:tonic`;
}

export function createEmberTonic(heroId: string, quantity = emberTonicTargetQuantity): ItemState {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > emberTonicTargetQuantity) {
    throw new RangeError(`Ember Tonic quantity must be an integer from 1 through ${emberTonicTargetQuantity}`);
  }
  return {
    id: emberTonicId(heroId),
    name: "Ember Tonic",
    kind: "consumable",
    slot: null,
    rarity: "common",
    quantity,
    modifiers: {},
    restorative: { schemaVersion: 1, kind: "restore-health-quarter-max", target: "self" },
    useMastery: null,
  };
}

export function isCanonicalEmberTonic(item: ItemState, heroId: string): boolean {
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > emberTonicTargetQuantity) {
    return false;
  }
  const expected = createEmberTonic(heroId, item.quantity);
  return item.id === expected.id && item.name === expected.name && item.kind === expected.kind &&
    item.slot === expected.slot && item.rarity === expected.rarity &&
    Object.keys(item.modifiers).length === 0 && item.useMastery === null &&
    item.restorative?.schemaVersion === expected.restorative?.schemaVersion &&
    item.restorative?.kind === expected.restorative?.kind &&
    item.restorative?.target === expected.restorative?.target;
}

function starterItems(heroId: string): readonly ItemState[] {
  return [
    {
      id: `${heroId}:item:roadblade`,
      name: "Roadworn Blade",
      kind: "equipment",
      slot: "weapon",
      rarity: "common",
      quantity: 1,
      modifiers: { power: 2, strength: 1 },
      restorative: null,
      useMastery: createWeaponUseMastery(),
    },
    createEmberTonic(heroId),
  ];
}

export function createHero(seed: string, heroId = "depth:hero", name = "Aster Vale"): DetailedHeroState {
  const attributes: HeroAttributes = {
    strength: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "strength"),
    agility: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "agility"),
    vitality: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "vitality"),
    intellect: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "intellect"),
    spirit: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "spirit"),
    luck: 6 + randomInt(5, seed, "hero-depth", heroId, 0, "luck"),
  };
  const maxHealth = 24 + attributes.vitality * 3;
  const maxMana = 8 + attributes.spirit * 2;
  const inventory = starterItems(heroId);
  const className = pick(heroClasses, seed, "hero-depth", heroId, 0, "class");
  return {
    id: heroId,
    name,
    className,
    level: 1,
    experience: 0,
    attributes,
    resources: { health: maxHealth, maxHealth, mana: maxMana, maxMana },
    gold: 12,
    inventory,
    equipment: {
      weapon: inventory[0]?.id ?? null,
      offhand: null,
      head: null,
      body: null,
      feet: null,
      charm: null,
    },
    abilities: starterAbilities(seed, heroId, className),
    monsterLore: [],
  };
}

export function generateLoot(seed: string, sourceId: string, ordinal = 0): ItemState {
  const itemId = `loot:${sourceId}:${ordinal}`;
  const slot = pick(equipmentSlots, seed, "loot", sourceId, ordinal, "slot");
  const rarity = pick(["common", "uncommon", "rare", "legendary"] as const, seed, "loot", sourceId, ordinal, "rarity");
  const bonus = rarity === "legendary" ? 6 : rarity === "rare" ? 4 : rarity === "uncommon" ? 2 : 1;
  const primaryModifier: ItemModifier = slot === "body" || slot === "head" ? "armor" : slot === "charm" ? "maxMana" : "power";
  return {
    id: itemId,
    name: `${pick(lootNames, seed, "loot", sourceId, ordinal, "adjective")} ${pick(lootNouns[slot], seed, "loot", sourceId, ordinal, "noun")}`,
    kind: "equipment",
    slot,
    rarity,
    quantity: 1,
    modifiers: { [primaryModifier]: bonus },
    restorative: null,
    useMastery: slot === "weapon" ? createWeaponUseMastery() : null,
  };
}

export function addItem(hero: DetailedHeroState, item: ItemState): DetailedHeroState {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Item quantity must be a positive integer");
  if (hero.inventory.some((candidate) => candidate.id === item.id)) throw new Error("Item ids must be unique");
  if (hero.inventory.length >= inventoryCapacity) return hero;
  return { ...hero, inventory: [...hero.inventory, item] };
}

export function equipItem(hero: DetailedHeroState, itemId: string): DetailedHeroState {
  const item = hero.inventory.find((candidate) => candidate.id === itemId);
  if (item === undefined) throw new Error("Cannot equip an item outside the inventory");
  if (item.kind !== "equipment" || item.slot === null) throw new Error("Item is not equippable");
  return { ...hero, equipment: { ...hero.equipment, [item.slot]: item.id } };
}

export function unequipItem(hero: DetailedHeroState, slot: EquipmentSlot): DetailedHeroState {
  return { ...hero, equipment: { ...hero.equipment, [slot]: null } };
}

function equipmentScore(item: ItemState | undefined): number {
  if (item === undefined) return -1;
  return Object.entries(item.modifiers).reduce((total, [modifier, amount]) => {
    const weight = modifier === "power" || modifier === "armor" ? 3 : 1;
    return total + (amount ?? 0) * weight;
  }, 0);
}

export function equipBestItems(hero: DetailedHeroState): DetailedHeroState {
  let equipment = hero.equipment;
  for (const slot of equipmentSlots) {
    const candidates = hero.inventory
      .filter((item) => item.kind === "equipment" && item.slot === slot)
      .sort((left, right) => equipmentScore(right) - equipmentScore(left) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const best = candidates[0];
    const current = hero.inventory.find((item) => item.id === equipment[slot]);
    if (best !== undefined && equipmentScore(best) > equipmentScore(current)) {
      equipment = { ...equipment, [slot]: best.id };
    }
  }
  if (equipment === hero.equipment) return hero;
  const equipped = { ...hero, equipment };
  const stats = derivedStats(equipped);
  return {
    ...equipped,
    resources: {
      health: Math.min(stats.maxHealth, equipped.resources.health),
      maxHealth: stats.maxHealth,
      mana: Math.min(stats.maxMana, equipped.resources.mana),
      maxMana: stats.maxMana,
    },
  };
}

export interface MonsterObservation {
  speciesId: string;
  name: string;
  secret: AbilityState;
}

function monsterObservations(combatants: readonly CombatantState[]): readonly MonsterObservation[] {
  const found = new Map<string, MonsterObservation>();
  for (const combatant of combatants) {
    if (combatant.side !== "enemies" || combatant.speciesId === null) continue;
    const secret = combatant.abilities[0];
    if (secret === undefined || found.has(combatant.speciesId)) continue;
    found.set(combatant.speciesId, {
      speciesId: combatant.speciesId,
      name: combatant.name.replace(/ \d+$/, ""),
      secret,
    });
  }
  return [...found.values()].sort((left, right) => left.speciesId < right.speciesId ? -1 : left.speciesId > right.speciesId ? 1 : 0);
}

export function observeMonster(hero: DetailedHeroState, observation: MonsterObservation): DetailedHeroState {
  let lore = [...hero.monsterLore];
  const index = lore.findIndex((entry) => entry.monsterId === observation.speciesId);
  if (index >= 0) {
    const existing = lore[index];
    if (existing !== undefined) lore[index] = { ...existing, encounters: Math.min(Number.MAX_SAFE_INTEGER, existing.encounters + 1) };
  } else if (lore.length < maximumMonsterLoreEntries) {
    lore.push({
      monsterId: observation.speciesId,
      monsterName: observation.name,
      encounters: 1,
      victories: 0,
      insight: 0,
      requiredInsight: secretTechniqueInsightRequired,
      secretTechniqueId: observation.secret.id,
      secretTechniqueName: observation.secret.name,
      learned: false,
    });
  }
  lore = lore.sort((left, right) => left.monsterId < right.monsterId ? -1 : left.monsterId > right.monsterId ? 1 : 0);
  return { ...hero, monsterLore: lore };
}

export function observeMonsters(hero: DetailedHeroState, combatants: readonly CombatantState[]): DetailedHeroState {
  return monsterObservations(combatants).reduce(observeMonster, hero);
}

export interface LearnedMonsterSecret {
  monsterId: string;
  monsterName: string;
  ability: AbilityState;
}

export interface MonsterSecretThresholdOutcome extends LearnedMonsterSecret {
  disposition: "learned" | "deferred-capacity" | "rejected";
  reason: "slot-available" | "already-owned" | "repertoire-full" | "ability-id-conflict";
  repertoireCount: number;
  repertoireLimit: number;
}

function isExactMonsterSecret(abilityState: AbilityState, candidate: AbilityState): boolean {
  return abilityState.id === candidate.id &&
    abilityState.name === candidate.name &&
    abilityState.kind === "secret" &&
    abilityState.effect === candidate.effect &&
    abilityState.manaCost === candidate.manaCost &&
    abilityState.potency === candidate.potency &&
    abilityState.sourceMonsterId === candidate.sourceMonsterId;
}

export function recordMonsterVictory(
  hero: DetailedHeroState,
  combatants: readonly CombatantState[],
): {
  hero: DetailedHeroState;
  learned: readonly LearnedMonsterSecret[];
  outcomes: readonly MonsterSecretThresholdOutcome[];
} {
  let lore = [...hero.monsterLore];
  let abilities = [...hero.abilities];
  const outcomes: MonsterSecretThresholdOutcome[] = [];
  for (const observation of monsterObservations(combatants)) {
    const index = lore.findIndex((entry) => entry.monsterId === observation.speciesId);
    if (index < 0) continue;
    const existing = lore[index];
    if (existing === undefined) continue;
    const insight = Math.min(existing.requiredInsight, existing.insight + 1);
    const newlyLearned = !existing.learned && insight >= existing.requiredInsight;
    lore[index] = {
      ...existing,
      victories: Math.min(Number.MAX_SAFE_INTEGER, existing.victories + 1),
      insight,
      learned: existing.learned || newlyLearned,
    };
    if (newlyLearned) {
      const candidate = ability(
        {
          id: observation.secret.id,
          name: observation.secret.name,
          effect: observation.secret.effect,
          manaCost: observation.secret.manaCost,
          potency: observation.secret.potency,
        },
        "secret",
        observation.speciesId,
      );
      const repertoireCount = abilities.length;
      const sameId = abilities.find((entry) => entry.id === candidate.id);
      if (sameId !== undefined && isExactMonsterSecret(sameId, candidate)) {
        outcomes.push({
          monsterId: observation.speciesId,
          monsterName: observation.name,
          ability: candidate,
          disposition: "learned",
          reason: "already-owned",
          repertoireCount,
          repertoireLimit: maximumAbilities,
        });
      } else if (sameId !== undefined) {
        outcomes.push({
          monsterId: observation.speciesId,
          monsterName: observation.name,
          ability: candidate,
          disposition: "rejected",
          reason: "ability-id-conflict",
          repertoireCount,
          repertoireLimit: maximumAbilities,
        });
      } else if (repertoireCount >= maximumAbilities) {
        outcomes.push({
          monsterId: observation.speciesId,
          monsterName: observation.name,
          ability: candidate,
          disposition: "deferred-capacity",
          reason: "repertoire-full",
          repertoireCount,
          repertoireLimit: maximumAbilities,
        });
      } else {
        abilities.push(candidate);
        outcomes.push({
          monsterId: observation.speciesId,
          monsterName: observation.name,
          ability: candidate,
          disposition: "learned",
          reason: "slot-available",
          repertoireCount,
          repertoireLimit: maximumAbilities,
        });
      }
    }
  }
  return {
    hero: { ...hero, abilities, monsterLore: lore },
    learned: outcomes
      .filter((outcome) => outcome.disposition === "learned")
      .map(({ monsterId, monsterName, ability: learnedAbility }) => ({ monsterId, monsterName, ability: learnedAbility })),
    outcomes,
  };
}

export function trainAbility(hero: DetailedHeroState, abilityId: string, amount = 3): DetailedHeroState {
  if (!hero.abilities.some((entry) => entry.id === abilityId)) throw new Error("Cannot train an unknown ability");
  return {
    ...hero,
    abilities: hero.abilities.map((entry) => entry.id === abilityId ? gainAbilityExperience(entry, amount, false) : entry),
  };
}

export interface DerivedHeroStats {
  power: number;
  armor: number;
  initiative: number;
  maxHealth: number;
  maxMana: number;
}

export type EquippedModifierTotals = Partial<Record<ItemModifier, number>>;

export function equippedModifierTotals(hero: DetailedHeroState): EquippedModifierTotals {
  const totals: Partial<Record<ItemModifier, number>> = {};
  const equippedIds = new Set(equipmentSlots.flatMap((slot) => hero.equipment[slot] === null ? [] : [hero.equipment[slot]]));
  for (const item of hero.inventory) {
    if (!equippedIds.has(item.id)) continue;
    for (const [modifier, amount] of Object.entries(item.modifiers) as [ItemModifier, number][]) {
      totals[modifier] = (totals[modifier] ?? 0) + amount;
    }
  }
  return totals;
}

export function effectiveAttribute(hero: DetailedHeroState, attribute: AttributeName): number {
  const totals = equippedModifierTotals(hero);
  return hero.attributes[attribute] + (totals[attribute] ?? 0);
}

export function derivedStatsFromInputs(
  attributes: HeroAttributes,
  mechanicalLevel: number,
  totals: EquippedModifierTotals,
): DerivedHeroStats {
  if (!Number.isSafeInteger(mechanicalLevel) || mechanicalLevel < 1 || mechanicalLevel > maximumHeroMechanicalLevel) {
    throw new RangeError("Hero mechanical level must be a safe integer from 1 through 50");
  }
  return {
    power: attributes.strength * 2 + mechanicalLevel + (totals.power ?? 0) + (totals.strength ?? 0) * 2,
    armor: Math.floor(attributes.vitality / 2) + (totals.armor ?? 0),
    initiative: attributes.agility * 2 + attributes.luck,
    maxHealth: 24 + (attributes.vitality + (totals.vitality ?? 0)) * 3 + (totals.maxHealth ?? 0),
    maxMana: 8 + (attributes.spirit + (totals.spirit ?? 0)) * 2 + (totals.maxMana ?? 0),
  };
}

export function derivedStats(hero: DetailedHeroState): DerivedHeroStats {
  return derivedStatsFromInputs(hero.attributes, heroMechanicalLevel(hero.level), equippedModifierTotals(hero));
}

function objective(id: string, description: string, target: number, rule: QuestObjectiveRule): QuestObjective {
  return { id, description, rule, current: 0, target, status: "active" };
}

interface SuccessorQuestTemplate {
  id: string;
  title: string;
  summary: string;
  battleObjective: string;
  legacyBattleObjective: string;
  subquestTitle: string;
  mazeObjective: string;
  shrineObjective: string;
  legacyShrineObjective: string;
}

const successorQuestTemplates: readonly SuccessorQuestTemplate[] = [
  {
    id: "quest:bell-beneath-briar",
    title: "The Bell Beneath Briar",
    summary: "Follow a bell heard only on abandoned roads, break the thing answering it, and recover the silence below.",
    battleObjective: "Win tactical battles while following the buried bell",
    legacyBattleObjective: "Defeat the creature answering the buried bell",
    subquestTitle: "Where the Roots Keep Time",
    mazeObjective: "Cross the root-bound chambers beneath the road",
    shrineObjective: "Discover a shrine while following the buried bell",
    legacyShrineObjective: "Find the shrine that remembers the bell's true voice",
  },
  {
    id: "quest:ashes-of-the-false-star",
    title: "Ashes of the False Star",
    summary: "Track a fallen light through hostile country and learn why its worshippers fear the dawn.",
    battleObjective: "Win tactical battles while tracking the fallen light",
    legacyBattleObjective: "Defeat the guardian carrying the false star's brand",
    subquestTitle: "The Observatory Without a Sky",
    mazeObjective: "Traverse the buried observatory",
    shrineObjective: "Discover a shrine while tracking the fallen light",
    legacyShrineObjective: "Awaken the lens-shrine below the broken dome",
  },
  {
    id: "quest:tideglass-oath",
    title: "The Tideglass Oath",
    summary: "Pursue an oath that changes with the water and confront what waits where the old river vanished.",
    battleObjective: "Win tactical battles while pursuing the changing oath",
    legacyBattleObjective: "Defeat the oathbound hunter on the vanished river",
    subquestTitle: "A River Under Stone",
    mazeObjective: "Follow the drowned passages to their source",
    shrineObjective: "Discover a shrine while pursuing the changing oath",
    legacyShrineObjective: "Discover the shrine beneath the tide marks",
  },
] as const;

function successorQuestTemplate(seed: string, ordinal: number): SuccessorQuestTemplate {
  const origin = randomInt(successorQuestTemplates.length, seed, "quest", questSequenceGeneratorVersion, 0, "origin");
  return successorQuestTemplates[(origin + ordinal - 1) % successorQuestTemplates.length]!;
}

export function createQuest(seed: string, ordinal = 0, admittedTick = 0): QuestState {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Quest ordinal is outside the supported range");
  }
  if (!Number.isSafeInteger(admittedTick) || admittedTick < 0) {
    throw new RangeError("Quest admission tick is outside the supported range");
  }
  if (ordinal > 0) {
    const template = successorQuestTemplate(seed, ordinal);
    const battleTarget = 1 + randomInt(2, seed, "quest", questSequenceGeneratorVersion, ordinal, "battle-target");
    return {
      instanceId: questInstanceId(template.id, ordinal),
      id: template.id,
      ordinal,
      admittedTick,
      title: template.title,
      summary: template.summary,
      status: "active",
      objectives: [objective("quest:win-battle", template.battleObjective, battleTarget, {
        schemaVersion: 1,
        kind: "win-combat",
      })],
      subquests: [{
        id: `subquest:successor:${ordinal}:maze`,
        title: template.subquestTitle,
        status: "active",
        objectives: [
          objective("quest:cross-maze", template.mazeObjective, 1, {
            schemaVersion: 1,
            kind: "complete-dungeon",
            binding: "quest-lead",
          }),
          objective("quest:find-shrine", template.shrineObjective, 1, {
            schemaVersion: 1,
            kind: "discover-dungeon-feature",
            feature: "shrine",
            binding: "any",
          }),
        ],
      }],
    };
  }
  const id = "quest:vanished-road";
  return {
    instanceId: questInstanceId(id, ordinal),
    id,
    ordinal,
    admittedTick,
    title: pick(["The Vanished Road", "The Lantern Covenant", "A Map of Betrayals"] as const, seed, "quest", "main", 0, "title"),
    summary: "Follow the broken trade road, learn who erased it, and bring the travelers home.",
    status: "active",
    objectives: [
      objective("quest:visit-towns", "Earn news in two different towns", 2, {
        schemaVersion: 1,
        kind: "visit-location",
        locationKind: "town",
        firstVisitOnly: true,
      }),
      objective("quest:win-battle", "Win a tactical battle while seeking the vanished road", 1, {
        schemaVersion: 1,
        kind: "win-combat",
      }),
    ],
    subquests: [
      {
        id: "subquest:maze",
        title: "The Cartographer Below",
        status: "active",
        objectives: [
          objective("quest:cross-maze", "Traverse a forgotten maze", 1, {
            schemaVersion: 1,
            kind: "complete-dungeon",
            binding: "any",
          }),
          objective("quest:find-shrine", "Discover a shrine in the maze", 1, {
            schemaVersion: 1,
            kind: "discover-dungeon-feature",
            feature: "shrine",
            binding: "any",
          }),
        ],
      },
      {
        id: "subquest-supplies",
        title: "Supplies for the Long Road",
        status: "active",
        objectives: [objective("quest:collect-items", "Add three new items to the pack", 3, {
          schemaVersion: 1,
          kind: "acquire-item",
          disposition: "inventory",
        })],
      },
    ],
  };
}

function legacyQuestObjectiveDescriptions(seed: string, ordinal: number): {
  objectives: readonly string[];
  subquests: readonly (readonly string[])[];
} {
  if (ordinal === 0) {
    return {
      objectives: ["Earn news in two different towns", "Defeat the road's guardian"],
      subquests: [
        ["Traverse a forgotten maze", "Discover the maze shrine"],
        ["Collect useful supplies"],
      ],
    };
  }
  const template = successorQuestTemplate(seed, ordinal);
  return {
    objectives: [template.legacyBattleObjective],
    subquests: [[template.mazeObjective, template.legacyShrineObjective]],
  };
}

function hasLegacyObjectiveDefinition(value: unknown, canonical: QuestObjective, description: string): value is Omit<QuestObjective, "rule"> {
  return isRecord(value) && !("rule" in value) && value.id === canonical.id &&
    value.description === description && value.target === canonical.target;
}

export function upgradeQuestObjectiveRules(value: unknown, seed: string): QuestState {
  if (!isRecord(value) || !Number.isSafeInteger(value.ordinal) || !Number.isSafeInteger(value.admittedTick) ||
    !Array.isArray(value.objectives) || !Array.isArray(value.subquests)) {
    throw new TypeError("Legacy quest objective rules are malformed");
  }
  const previousObjectives = value.objectives;
  const previousSubquests = value.subquests;
  const canonical = createQuest(seed, value.ordinal as number, value.admittedTick as number);
  const descriptions = legacyQuestObjectiveDescriptions(seed, canonical.ordinal);
  if (
    value.instanceId !== canonical.instanceId || value.id !== canonical.id || value.ordinal !== canonical.ordinal ||
    value.admittedTick !== canonical.admittedTick || value.title !== canonical.title || value.summary !== canonical.summary ||
    previousObjectives.length !== canonical.objectives.length || previousSubquests.length !== canonical.subquests.length ||
    !previousObjectives.every((entry, index) => hasLegacyObjectiveDefinition(entry, canonical.objectives[index]!, descriptions.objectives[index]!))
  ) throw new TypeError("Legacy quest definition is not canonical");

  const objectives = canonical.objectives.map((expected, index) => {
    const previous = previousObjectives[index] as Record<string, unknown>;
    return { ...expected, current: previous.current as number, status: previous.status as QuestObjective["status"] };
  });
  const subquests = canonical.subquests.map((expected, index) => {
    const previous = previousSubquests[index];
    if (!isRecord(previous) || !Array.isArray(previous.objectives) || previous.id !== expected.id ||
      previous.title !== expected.title || previous.objectives.length !== expected.objectives.length ||
      !previous.objectives.every((entry, objectiveIndex) =>
        hasLegacyObjectiveDefinition(entry, expected.objectives[objectiveIndex]!, descriptions.subquests[index]![objectiveIndex]!)
      )) throw new TypeError("Legacy subquest definition is not canonical");
    const previousSubquestObjectives = previous.objectives;
    return {
      ...expected,
      status: previous.status as SubquestState["status"],
      objectives: expected.objectives.map((objectiveState, objectiveIndex) => {
        const previousObjective = previousSubquestObjectives[objectiveIndex] as Record<string, unknown>;
        return {
          ...objectiveState,
          current: previousObjective.current as number,
          status: previousObjective.status as QuestObjective["status"],
        };
      }),
    };
  });
  const upgraded: QuestState = {
    ...canonical,
    status: value.status as QuestState["status"],
    objectives,
    subquests,
  };
  if (!isValidQuestState(upgraded) || !isCanonicalQuestDefinition(seed, upgraded)) {
    throw new TypeError("Migrated quest objective rules violate schema invariants");
  }
  return upgraded;
}

export function isCanonicalQuestDefinition(seed: string, quest: QuestState): boolean {
  let canonical: QuestState;
  try {
    canonical = createQuest(seed, quest.ordinal, quest.admittedTick);
  } catch {
    return false;
  }
  const sameObjectiveDefinition = (left: QuestObjective, right: QuestObjective): boolean =>
    left.id === right.id && left.description === right.description && left.target === right.target &&
    sameQuestObjectiveRule(left.rule, right.rule);
  return quest.instanceId === canonical.instanceId && quest.id === canonical.id &&
    quest.ordinal === canonical.ordinal && quest.admittedTick === canonical.admittedTick &&
    quest.title === canonical.title && quest.summary === canonical.summary &&
    quest.objectives.length === canonical.objectives.length &&
    quest.objectives.every((objectiveState, index) => sameObjectiveDefinition(objectiveState, canonical.objectives[index]!)) &&
    quest.subquests.length === canonical.subquests.length &&
    quest.subquests.every((subquest, index) => {
      const expected = canonical.subquests[index]!;
      return subquest.id === expected.id && subquest.title === expected.title &&
        subquest.objectives.length === expected.objectives.length &&
        subquest.objectives.every((objectiveState, objectiveIndex) => sameObjectiveDefinition(objectiveState, expected.objectives[objectiveIndex]!));
    });
}

function sameQuestObjectiveRule(left: QuestObjectiveRule, right: QuestObjectiveRule): boolean {
  if (left.schemaVersion !== right.schemaVersion || left.kind !== right.kind) return false;
  switch (left.kind) {
    case "visit-location":
      return right.kind === left.kind && right.locationKind === left.locationKind && right.firstVisitOnly === left.firstVisitOnly;
    case "win-combat":
      return right.kind === left.kind;
    case "complete-dungeon":
      return right.kind === left.kind && right.binding === left.binding;
    case "discover-dungeon-feature":
      return right.kind === left.kind && right.feature === left.feature && right.binding === left.binding;
    case "acquire-item":
      return right.kind === left.kind && right.disposition === left.disposition;
  }
}

export function questObjectiveRuleLabel(rule: QuestObjectiveRule): string {
  switch (rule.kind) {
    case "visit-location": return "FIRST VISITS";
    case "win-combat": return "TACTICAL VICTORY";
    case "complete-dungeon": return rule.binding === "quest-lead" ? "LEAD DUNGEON" : "ANY DUNGEON";
    case "discover-dungeon-feature": return rule.binding === "quest-lead" ? "LEAD SHRINE" : "ANY SHRINE";
    case "acquire-item": return "NEW ITEM";
  }
}

function isValidQuestProgressFact(value: unknown): value is QuestProgressFact {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "location-first-visited":
      return hasExactKeys(value, ["schemaVersion", "kind", "locationId", "locationKind"]) &&
        isBoundedReference(value.locationId) && value.locationKind === "town";
    case "combat-won":
      return hasExactKeys(value, ["schemaVersion", "kind", "combatId", "defeatedSpeciesIds"]) &&
        isBoundedReference(value.combatId) && Array.isArray(value.defeatedSpeciesIds) &&
        value.defeatedSpeciesIds.length > 0 && value.defeatedSpeciesIds.length <= 16 &&
        value.defeatedSpeciesIds.every(isBoundedReference) &&
        new Set(value.defeatedSpeciesIds).size === value.defeatedSpeciesIds.length;
    case "dungeon-completed":
      return hasExactKeys(value, ["schemaVersion", "kind", "dungeonId", "locationId", "binding"]) &&
        isBoundedReference(value.dungeonId) && isBoundedReference(value.locationId) &&
        (value.binding === "unbound" || value.binding === "quest-lead");
    case "dungeon-feature-discovered":
      return hasExactKeys(value, ["schemaVersion", "kind", "dungeonId", "locationId", "cellId", "feature", "binding"]) &&
        isBoundedReference(value.dungeonId) && isBoundedReference(value.locationId) &&
        isBoundedReference(value.cellId) && value.feature === "shrine" &&
        (value.binding === "unbound" || value.binding === "quest-lead");
    case "item-acquired":
      return hasExactKeys(value, ["schemaVersion", "kind", "itemId", "sourceId", "disposition"]) &&
        isBoundedReference(value.itemId) && isBoundedReference(value.sourceId) && value.disposition === "inventory";
    default:
      return false;
  }
}

function objectiveMatchesFact(rule: QuestObjectiveRule, fact: QuestProgressFact): boolean {
  switch (rule.kind) {
    case "visit-location":
      return fact.kind === "location-first-visited" && fact.locationKind === rule.locationKind;
    case "win-combat":
      return fact.kind === "combat-won";
    case "complete-dungeon":
      return fact.kind === "dungeon-completed" && (rule.binding === "any" || fact.binding === "quest-lead");
    case "discover-dungeon-feature":
      return fact.kind === "dungeon-feature-discovered" && fact.feature === rule.feature &&
        (rule.binding === "any" || fact.binding === "quest-lead");
    case "acquire-item":
      return fact.kind === "item-acquired" && fact.disposition === rule.disposition;
  }
}

function progressObjective(objectiveState: QuestObjective, fact: QuestProgressFact): QuestObjective {
  if (!objectiveMatchesFact(objectiveState.rule, fact) || objectiveState.status !== "active") return objectiveState;
  const current = Math.min(objectiveState.target, objectiveState.current + 1);
  return { ...objectiveState, current, status: current >= objectiveState.target ? "complete" : "active" };
}

function updateSubquest(subquest: SubquestState, fact: QuestProgressFact): SubquestState {
  const objectives = subquest.objectives.map((entry) => progressObjective(entry, fact));
  return { ...subquest, objectives, status: objectives.every((entry) => entry.status === "complete") ? "complete" : subquest.status };
}

export function applyQuestProgressFact(quest: QuestState, fact: QuestProgressFact): QuestState {
  if (!isValidQuestProgressFact(fact)) throw new TypeError("Quest progress fact is malformed");
  if (quest.status !== "active") return quest;
  const objectives = quest.objectives.map((entry) => progressObjective(entry, fact));
  const subquests = quest.subquests.map((entry) => updateSubquest(entry, fact));
  const status = objectives.every((entry) => entry.status === "complete") && subquests.every((entry) => entry.status === "complete") ? "ready-to-fulfill" : "active";
  return { ...quest, objectives, subquests, status };
}
