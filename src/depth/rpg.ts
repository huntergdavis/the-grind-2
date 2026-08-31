import { pick, randomInt } from "../core/rng";
import type {
  AbilityState,
  AttributeName,
  CombatantState,
  CompletedQuestSummary,
  DetailedHeroState,
  EquipmentSlot,
  HeroAttributes,
  ItemModifier,
  ItemState,
  QuestObjective,
  QuestRewardGrant,
  QuestRewardReceipt,
  QuestState,
  QuestStatus,
  SubquestState,
} from "./types";

export const inventoryCapacity = 32;
export const maximumAbilities = 16;
export const maximumMonsterLoreEntries = 16;
export const secretTechniqueInsightRequired = 3;

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

export function isValidItemState(value: unknown): value is ItemState {
  if (!isRecord(value) || !isRecord(value.modifiers)) return false;
  const kind = value.kind as ItemState["kind"];
  const slot = value.slot as EquipmentSlot | null;
  const modifierEntries = Object.entries(value.modifiers);
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    itemKinds.includes(kind) &&
    itemRarities.includes(value.rarity as ItemState["rarity"]) &&
    isBoundedInteger(value.quantity, 1, Number.MAX_SAFE_INTEGER) &&
    (kind === "equipment"
      ? equipmentSlots.includes(slot as EquipmentSlot) && value.quantity === 1
      : slot === null && modifierEntries.length === 0) &&
    modifierEntries.every(([modifier, amount]) =>
      itemModifiers.includes(modifier as ItemModifier) && isBoundedInteger(amount, 0, 100)
    )
  );
}

function isValidQuestObjective(value: unknown): value is QuestObjective {
  if (!isRecord(value)) return false;
  const status = value.status as QuestObjective["status"];
  return (
    typeof value.id === "string" && value.id.length > 0 &&
    typeof value.description === "string" && value.description.length > 0 &&
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

function aggregateObjectiveStatus(objectives: readonly QuestObjective[]): QuestObjective["status"] {
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
    JSON.stringify(leftModifiers) === JSON.stringify(rightModifiers);
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
  const expectedItem = generateLoot(seed, questRewardGrantId(summary.id), 0);
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
  return value.schemaVersion === 1 && value.id === `${grant.id}:receipt` && value.grantId === grant.id &&
    value.appliedTick === grant.issuedTick + 1 && value.appliedTick <= currentTick &&
    value.experienceDelta === experienceAfter - experienceBefore && value.experienceAfter === experienceAfter &&
    value.levelBefore === heroLevelForExperience(experienceBefore) &&
    value.levelAfter === heroLevelForExperience(experienceAfter) &&
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
      if (hero.experience !== receipt.experienceAfter || hero.level !== receipt.levelAfter || hero.gold !== receipt.goldAfter) return false;
      const carriesItem = hero.inventory.some((item) => item.id === grant.item.id && sameItem(item, grant.item));
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
  if (quest.status !== "fulfilled") return latest?.questInstanceId !== quest.instanceId;
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
    !isBoundedInteger(value.level, 1, 50) ||
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

export function heroLevelForExperience(experience: number): number {
  const boundedExperience = Number.isSafeInteger(experience) && experience > 0 ? experience : 0;
  return Math.min(50, 1 + Math.floor(Math.sqrt(boundedExperience / 12)));
}

export function heroMasteryForExperience(experience: number): number {
  const boundedExperience = Number.isSafeInteger(experience) && experience > 0 ? experience : 0;
  return Math.floor(boundedExperience / 250);
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
    },
    {
      id: `${heroId}:item:tonic`,
      name: "Ember Tonic",
      kind: "consumable",
      slot: null,
      rarity: "common",
      quantity: 3,
      modifiers: {},
    },
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

export function recordMonsterVictory(
  hero: DetailedHeroState,
  combatants: readonly CombatantState[],
): { hero: DetailedHeroState; learned: readonly LearnedMonsterSecret[] } {
  let lore = [...hero.monsterLore];
  let abilities = [...hero.abilities];
  const learned: LearnedMonsterSecret[] = [];
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
    if (newlyLearned && abilities.length < maximumAbilities && !abilities.some((entry) => entry.id === observation.secret.id)) {
      const learnedAbility = ability(
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
      abilities.push(learnedAbility);
      learned.push({ monsterId: observation.speciesId, monsterName: observation.name, ability: learnedAbility });
    }
  }
  return { hero: { ...hero, abilities, monsterLore: lore }, learned };
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

function equippedModifierTotals(hero: DetailedHeroState): Partial<Record<ItemModifier, number>> {
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

export function derivedStats(hero: DetailedHeroState): DerivedHeroStats {
  const totals = equippedModifierTotals(hero);
  return {
    power: hero.attributes.strength * 2 + hero.level + (totals.power ?? 0) + (totals.strength ?? 0) * 2,
    armor: Math.floor(hero.attributes.vitality / 2) + (totals.armor ?? 0),
    initiative: hero.attributes.agility * 2 + hero.attributes.luck,
    maxHealth: 24 + (hero.attributes.vitality + (totals.vitality ?? 0)) * 3 + (totals.maxHealth ?? 0),
    maxMana: 8 + (hero.attributes.spirit + (totals.spirit ?? 0)) * 2 + (totals.maxMana ?? 0),
  };
}

function objective(id: string, description: string, target: number): QuestObjective {
  return { id, description, current: 0, target, status: "active" };
}

export function createQuest(seed: string, ordinal = 0, admittedTick = 0): QuestState {
  const id = "quest:vanished-road";
  return {
    instanceId: questInstanceId(id, ordinal),
    id,
    ordinal,
    admittedTick,
    title: pick(["The Vanished Road", "The Lantern Covenant", "A Map of Betrayals"] as const, seed, "quest", "main", 0, "title"),
    summary: "Follow the broken trade road, learn who erased it, and bring the travelers home.",
    status: "active",
    objectives: [objective("quest:visit-towns", "Earn news in two different towns", 2), objective("quest:win-battle", "Defeat the road's guardian", 1)],
    subquests: [
      {
        id: "subquest:maze",
        title: "The Cartographer Below",
        status: "active",
        objectives: [objective("quest:cross-maze", "Traverse a forgotten maze", 1), objective("quest:find-shrine", "Discover the maze shrine", 1)],
      },
      {
        id: "subquest-supplies",
        title: "Supplies for the Long Road",
        status: "active",
        objectives: [objective("quest:collect-items", "Collect useful supplies", 3)],
      },
    ],
  };
}

function progressObjective(objectiveState: QuestObjective, objectiveId: string, amount: number): QuestObjective {
  if (objectiveState.id !== objectiveId || objectiveState.status !== "active") return objectiveState;
  const current = Math.min(objectiveState.target, objectiveState.current + Math.max(0, Math.floor(amount)));
  return { ...objectiveState, current, status: current >= objectiveState.target ? "complete" : "active" };
}

function updateSubquest(subquest: SubquestState, objectiveId: string, amount: number): SubquestState {
  const objectives = subquest.objectives.map((entry) => progressObjective(entry, objectiveId, amount));
  return { ...subquest, objectives, status: objectives.every((entry) => entry.status === "complete") ? "complete" : subquest.status };
}

export function progressQuest(quest: QuestState, objectiveId: string, amount = 1): QuestState {
  if (!Number.isFinite(amount) || amount <= 0 || quest.status !== "active") return quest;
  const objectives = quest.objectives.map((entry) => progressObjective(entry, objectiveId, amount));
  const subquests = quest.subquests.map((entry) => updateSubquest(entry, objectiveId, amount));
  const status = objectives.every((entry) => entry.status === "complete") && subquests.every((entry) => entry.status === "complete") ? "ready-to-fulfill" : "active";
  return { ...quest, objectives, subquests, status };
}
