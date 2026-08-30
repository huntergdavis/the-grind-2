import { pick, randomInt } from "../core/rng";
import type {
  AbilityState,
  AttributeName,
  CombatantState,
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
export const maximumAbilities = 16;
export const maximumMonsterLoreEntries = 16;
export const secretTechniqueInsightRequired = 3;

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
  const className = pick(classes, seed, "hero-depth", heroId, 0, "class");
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

interface MonsterObservation {
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

export function observeMonsters(hero: DetailedHeroState, combatants: readonly CombatantState[]): DetailedHeroState {
  let lore = [...hero.monsterLore];
  for (const observation of monsterObservations(combatants)) {
    const index = lore.findIndex((entry) => entry.monsterId === observation.speciesId);
    if (index >= 0) {
      const existing = lore[index];
      if (existing !== undefined) lore[index] = { ...existing, encounters: Math.min(Number.MAX_SAFE_INTEGER, existing.encounters + 1) };
      continue;
    }
    if (lore.length >= maximumMonsterLoreEntries) continue;
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
