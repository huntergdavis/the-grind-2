import type { ChronicleEntry, WorldState } from "../core/types";
import { applyHeroExperience, derivedStats, equipBestItems, generateLoot, type DerivedHeroStats } from "../depth/rpg";
import type {
  EquipmentSlot,
  HeroResources,
  ItemModifier,
  ItemState,
} from "../depth/types";
import { projectGearAppearance, type GearSilhouette } from "../render/hero-appearance";

export interface BattleSpoilsModifierFactV1 {
  readonly schemaVersion: 1;
  readonly modifier: ItemModifier;
  readonly amount: number;
}

export interface BattleSpoilsMasteryFactV1 {
  readonly schemaVersion: 1;
  readonly level: number;
  readonly experience: number;
  readonly receiptCount: number;
}

export interface BattleSpoilsItemFactV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly rarity: ItemState["rarity"];
  readonly silhouette: GearSilhouette;
  readonly modifiers: readonly BattleSpoilsModifierFactV1[];
  readonly mastery: BattleSpoilsMasteryFactV1 | null;
}

export interface BattleSpoilsDerivedDeltaV1 {
  readonly power: number;
  readonly armor: number;
  readonly initiative: number;
  readonly maxHealth: number;
  readonly maxMana: number;
}

export interface BattleSpoilsComparisonPacketV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: "combat-action";
  readonly combatId: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly location: string;
  readonly slot: EquipmentSlot;
  readonly oldItem: BattleSpoilsItemFactV1 | null;
  readonly newItem: BattleSpoilsItemFactV1;
  readonly derivedBefore: DerivedHeroStats;
  readonly derivedAfter: DerivedHeroStats;
  readonly derivedDelta: BattleSpoilsDerivedDeltaV1;
  readonly resourcesBefore: HeroResources;
  readonly resourcesAfter: HeroResources;
  readonly oldItemDisposition: "pack" | "empty-slot";
  readonly mechanicalEffect: "already-applied-auto-equip";
}

const slots = Object.freeze(["weapon", "offhand", "head", "body", "feet", "charm"] as const);
const rarities = Object.freeze(["common", "uncommon", "rare", "legendary"] as const);
const modifiers = Object.freeze([
  "strength", "agility", "vitality", "intellect", "spirit", "luck",
  "power", "armor", "maxHealth", "maxMana",
] as const);
const silhouettes = Object.freeze([
  "sword", "spear", "wand", "shield", "book", "lantern", "cap", "crown", "helm",
  "coat", "mail", "plate", "boots", "greaves", "sandals", "orb", "sigil", "halo",
] as const);
const derivedKeys = Object.freeze(["power", "armor", "initiative", "maxHealth", "maxMana"] as const);
const resourceKeys = Object.freeze(["health", "maxHealth", "mana", "maxMana"] as const);
const packetKeys = Object.freeze([
  "schemaVersion", "eventId", "tick", "campaignId", "commandId", "commandType", "combatId",
  "heroId", "heroName", "className", "location", "slot", "oldItem", "newItem",
  "derivedBefore", "derivedAfter", "derivedDelta", "resourcesBefore", "resourcesAfter",
  "oldItemDisposition", "mechanicalEffect",
] as const);
const itemKeys = Object.freeze([
  "schemaVersion", "id", "name", "slot", "rarity", "silhouette", "modifiers", "mastery",
] as const);
const modifierKeys = Object.freeze(["schemaVersion", "modifier", "amount"] as const);
const masteryKeys = Object.freeze(["schemaVersion", "level", "experience", "receiptCount"] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function boundedText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeInteger(value: unknown, minimum = -Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
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

function subtractDerived(after: DerivedHeroStats, before: DerivedHeroStats): BattleSpoilsDerivedDeltaV1 {
  return {
    power: after.power - before.power,
    armor: after.armor - before.armor,
    initiative: after.initiative - before.initiative,
    maxHealth: after.maxHealth - before.maxHealth,
    maxMana: after.maxMana - before.maxMana,
  };
}

function itemFact(item: ItemState): BattleSpoilsItemFactV1 | null {
  const appearance = projectGearAppearance(item);
  if (appearance === null) return null;
  const modifierFacts = modifiers.flatMap((modifier) => {
    const amount = item.modifiers[modifier];
    return amount === undefined ? [] : [{ schemaVersion: 1 as const, modifier, amount }];
  });
  const mastery = item.useMastery === null ? null : {
    schemaVersion: 1 as const,
    level: item.useMastery.level,
    experience: item.useMastery.experience,
    receiptCount: item.useMastery.receipts.length,
  };
  return {
    schemaVersion: 1,
    id: item.id,
    name: item.name,
    slot: appearance.slot,
    rarity: item.rarity,
    silhouette: appearance.silhouette,
    modifiers: modifierFacts,
    mastery,
  };
}

function validMasteryFact(value: unknown): value is BattleSpoilsMasteryFactV1 | null {
  if (value === null) return true;
  return isRecord(value)
    && exactKeys(value, masteryKeys)
    && value.schemaVersion === 1
    && safeInteger(value.level, 1)
    && safeInteger(value.experience, 0)
    && safeInteger(value.receiptCount, 0)
    && value.receiptCount === value.experience;
}

function validItemFact(value: unknown): value is BattleSpoilsItemFactV1 {
  if (!isRecord(value) || !exactKeys(value, itemKeys) || !Array.isArray(value.modifiers)) return false;
  if (value.schemaVersion !== 1
    || !boundedText(value.id, 512)
    || !boundedText(value.name, 160)
    || !slots.includes(value.slot as EquipmentSlot)
    || !rarities.includes(value.rarity as ItemState["rarity"])
    || !silhouettes.includes(value.silhouette as GearSilhouette)
    || !validMasteryFact(value.mastery)) return false;
  const seen = new Set<string>();
  for (const fact of value.modifiers) {
    if (!isRecord(fact)
      || !exactKeys(fact, modifierKeys)
      || fact.schemaVersion !== 1
      || !modifiers.includes(fact.modifier as ItemModifier)
      || !safeInteger(fact.amount, 0)
      || seen.has(fact.modifier as string)) return false;
    seen.add(fact.modifier as string);
  }
  const order = (value.modifiers as BattleSpoilsModifierFactV1[]).map((fact) => modifiers.indexOf(fact.modifier));
  return order.every((entry, index) => index === 0 || entry > (order[index - 1] ?? -1));
}

function validDerived(value: unknown, allowNegative: boolean): value is DerivedHeroStats | BattleSpoilsDerivedDeltaV1 {
  if (!isRecord(value) || !exactKeys(value, derivedKeys)) return false;
  return derivedKeys.every((key) => safeInteger(value[key], allowNegative ? -Number.MAX_SAFE_INTEGER : 0));
}

function validResources(value: unknown): value is HeroResources {
  if (!isRecord(value) || !exactKeys(value, resourceKeys)) return false;
  return safeInteger(value.health, 0)
    && safeInteger(value.maxHealth, 1)
    && safeInteger(value.mana, 0)
    && safeInteger(value.maxMana, 0)
    && value.health <= value.maxHealth
    && value.mana <= value.maxMana;
}

export function isBattleSpoilsComparisonPacketV1(value: unknown): value is BattleSpoilsComparisonPacketV1 {
  if (!isRecord(value)
    || !exactKeys(value, packetKeys)
    || !validItemFact(value.newItem)
    || !(value.oldItem === null || validItemFact(value.oldItem))
    || !validDerived(value.derivedBefore, false)
    || !validDerived(value.derivedAfter, false)
    || !validDerived(value.derivedDelta, true)
    || !validResources(value.resourcesBefore)
    || !validResources(value.resourcesAfter)) return false;
  const oldItem = value.oldItem as BattleSpoilsItemFactV1 | null;
  const newItem = value.newItem as BattleSpoilsItemFactV1;
  const before = value.derivedBefore as unknown as DerivedHeroStats;
  const after = value.derivedAfter as unknown as DerivedHeroStats;
  return value.schemaVersion === 1
    && boundedText(value.eventId, 512)
    && safeInteger(value.tick, 0)
    && boundedText(value.campaignId, 512)
    && boundedText(value.commandId, 512)
    && value.commandType === "combat-action"
    && boundedText(value.combatId, 512)
    && boundedText(value.heroId, 512)
    && boundedText(value.heroName, 160)
    && boundedText(value.className, 160)
    && boundedText(value.location)
    && slots.includes(value.slot as EquipmentSlot)
    && newItem.id === `loot:${value.combatId as string}:0`
    && newItem.slot === value.slot
    && (oldItem === null || (oldItem.slot === value.slot && oldItem.id !== newItem.id))
    && value.oldItemDisposition === (oldItem === null ? "empty-slot" : "pack")
    && value.mechanicalEffect === "already-applied-auto-equip"
    && value.eventId === `${value.campaignId}:${value.tick}`
    && sameValue(value.derivedDelta, subtractDerived(after, before))
    && (value.resourcesBefore as HeroResources).maxHealth === before.maxHealth
    && (value.resourcesBefore as HeroResources).maxMana === before.maxMana
    && (value.resourcesAfter as HeroResources).maxHealth === after.maxHealth
    && (value.resourcesAfter as HeroResources).maxMana === after.maxMana;
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
    || before.depth.hero.className !== after.depth.hero.className
    || after.tick !== before.tick + 1
    || before.depth.tick !== before.tick
    || after.depth.tick !== after.tick
    || source.id !== `${after.campaignId}:${after.tick}`
    || source.tick !== after.tick
    || source.commandType !== "combat-action"
    || !boundedText(source.commandId, 512)
    || before.chronicle.some((entry) => entry.id === source.id)
    || after.chronicle.filter((entry) => entry.id === source.id).length !== 1
    || !sameValue(after.chronicle.at(-1), source)) return false;
  return sameValue(after.chronicle, [...before.chronicle.slice(-31), source]);
}

function itemWithoutMastery(item: ItemState): ItemState {
  return { ...item, useMastery: null };
}

function inventoryTransitionIsBounded(
  before: WorldState,
  after: WorldState,
  loot: ItemState,
  combatWeaponId: string | null,
): boolean {
  const beforeItems = before.depth.hero.inventory;
  const afterItems = after.depth.hero.inventory;
  if (beforeItems.some((item) => item.id === loot.id)
    || afterItems.length !== beforeItems.length + 1
    || !sameValue(afterItems.find((item) => item.id === loot.id), loot)) return false;
  const newIds = afterItems.filter((item) => !beforeItems.some((prior) => prior.id === item.id));
  if (newIds.length !== 1 || newIds[0]?.id !== loot.id) return false;
  for (const beforeItem of beforeItems) {
    const afterItem = afterItems.find((item) => item.id === beforeItem.id);
    if (afterItem === undefined) return false;
    if (beforeItem.id === combatWeaponId) {
      if (!sameValue(itemWithoutMastery(beforeItem), itemWithoutMastery(afterItem))) return false;
    } else if (!sameValue(beforeItem, afterItem)) return false;
  }
  return true;
}

export function projectBattleSpoilsComparison(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): BattleSpoilsComparisonPacketV1 | null {
  if (!safeWorldPair(before, after, source)) return null;
  const commandId = source.commandId;
  if (!boundedText(commandId, 512)) return null;
  const active = before.depth.combat;
  const completed = after.depth.completedCombats.at(-1);
  if (!active
    || active.outcome !== "ongoing"
    || after.depth.combat !== null
    || !completed
    || completed.id !== active.id
    || completed.outcome !== "victory"
    || source.tick !== after.tick) return null;

  const loot = generateLoot(before.seed, active.id);
  if (loot.slot === null) return null;
  const beforeHero = before.depth.hero;
  const afterHero = after.depth.hero;
  const actingCombatantId = active.turnOrder[active.activeIndex];
  const experienceAward = actingCombatantId === beforeHero.id ? 8 : 0;
  const progression = applyHeroExperience(beforeHero, experienceAward);
  if (progression.levelAfter !== progression.levelBefore
    || afterHero.level !== progression.levelAfter
    || afterHero.experience !== progression.experienceAfter
    || !sameValue(beforeHero.attributes, afterHero.attributes)
    || !inventoryTransitionIsBounded(
      before,
      after,
      loot,
      active.weaponUse.tracking === "tracked" ? active.weaponUse.weaponId : null,
    )) return null;

  const changedSlots = slots.filter((slot) => beforeHero.equipment[slot] !== afterHero.equipment[slot]);
  if (changedSlots.length !== 1
    || changedSlots[0] !== loot.slot
    || afterHero.equipment[loot.slot] !== loot.id) return null;
  const oldItemId = beforeHero.equipment[loot.slot];
  const oldItemAfter = oldItemId === null ? null : afterHero.inventory.find((item) => item.id === oldItemId) ?? null;
  if (oldItemId !== null && oldItemAfter === null) return null;

  const beforeDerived = derivedStats(beforeHero);
  const afterDerived = derivedStats(afterHero);
  if (!sameValue(beforeHero.resources, { ...beforeHero.resources, maxHealth: beforeDerived.maxHealth, maxMana: beforeDerived.maxMana })
    || !sameValue(afterHero.resources, { ...afterHero.resources, maxHealth: afterDerived.maxHealth, maxMana: afterDerived.maxMana })) return null;
  const selectionBase = {
    ...afterHero,
    equipment: { ...beforeHero.equipment },
    resources: {
      health: Math.min(afterHero.resources.health, beforeDerived.maxHealth),
      maxHealth: beforeDerived.maxHealth,
      mana: Math.min(afterHero.resources.mana, beforeDerived.maxMana),
      maxMana: beforeDerived.maxMana,
    },
  };
  if (!sameValue(equipBestItems(selectionBase).equipment, afterHero.equipment)) return null;

  const newFact = itemFact(loot);
  const oldFact = oldItemAfter === null ? null : itemFact(oldItemAfter);
  if (newFact === null || (oldItemAfter !== null && oldFact === null)) return null;
  const packet: BattleSpoilsComparisonPacketV1 = {
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    commandId,
    commandType: "combat-action",
    combatId: active.id,
    heroId: afterHero.id,
    heroName: afterHero.name,
    className: afterHero.className,
    location: source.location,
    slot: loot.slot,
    oldItem: oldFact,
    newItem: newFact,
    derivedBefore: beforeDerived,
    derivedAfter: afterDerived,
    derivedDelta: subtractDerived(afterDerived, beforeDerived),
    resourcesBefore: { ...beforeHero.resources },
    resourcesAfter: { ...afterHero.resources },
    oldItemDisposition: oldFact === null ? "empty-slot" : "pack",
    mechanicalEffect: "already-applied-auto-equip",
  };
  if (!isBattleSpoilsComparisonPacketV1(packet)) return null;
  return freezeCopy(packet) as BattleSpoilsComparisonPacketV1;
}
