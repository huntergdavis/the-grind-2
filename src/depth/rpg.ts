import { pick, randomInt } from "../core/rng";
import type {
  DetailedHeroState,
  EquipmentSlot,
  HeroAttributes,
  ItemModifier,
  ItemState,
  QuestObjective,
  QuestState,
  SubquestState,
} from "./types";

export const inventoryCapacity = 32;

const classes = ["Wayfinder", "Warden", "Spellblade", "Tinker", "Wildspeaker"] as const;
const equipmentSlots: readonly EquipmentSlot[] = ["weapon", "offhand", "head", "body", "feet", "charm"];
const lootNames = ["Ashen", "Bright", "Deepdelver's", "Foxfire", "Moonlit", "Wayfarer's"] as const;
const lootNouns: Record<EquipmentSlot, readonly string[]> = {
  weapon: ["Blade", "Spear", "Wand"],
  offhand: ["Buckler", "Grimoire", "Lantern"],
  head: ["Cap", "Crown", "Helm"],
  body: ["Coat", "Mail", "Vest"],
  feet: ["Boots", "Greaves", "Sandals"],
  charm: ["Compass", "Locket", "Talisman"],
};

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
  return {
    id: heroId,
    name,
    className: pick(classes, seed, "hero-depth", heroId, 0, "class"),
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

export interface DerivedHeroStats {
  power: number;
  armor: number;
  initiative: number;
  maxHealth: number;
  maxMana: number;
}

export function derivedStats(hero: DetailedHeroState): DerivedHeroStats {
  const totals: Partial<Record<ItemModifier, number>> = {};
  const equippedIds = new Set(equipmentSlots.flatMap((slot) => hero.equipment[slot] === null ? [] : [hero.equipment[slot]]));
  for (const item of hero.inventory) {
    if (!equippedIds.has(item.id)) continue;
    for (const [modifier, amount] of Object.entries(item.modifiers) as [ItemModifier, number][]) {
      totals[modifier] = (totals[modifier] ?? 0) + amount;
    }
  }
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

export function createQuest(seed: string): QuestState {
  return {
    id: "quest:vanished-road",
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
  const status = objectives.every((entry) => entry.status === "complete") && subquests.every((entry) => entry.status === "complete") ? "complete" : "active";
  return { ...quest, objectives, subquests, status };
}
