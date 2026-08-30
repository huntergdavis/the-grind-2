import type { ChronicleEntry, WorldState } from "../core/types";
import { abilityExperienceCeiling, abilityExperienceFloor } from "../depth/rpg";
import type { AbilityEffect, EquipmentSlot, ItemModifier, ItemState, ObjectiveStatus } from "../depth/types";

export type InspectionView = "watch" | "map" | "inventory" | "journal" | "codex";

export const inspectionViews: readonly InspectionView[] = ["watch", "map", "inventory", "journal", "codex"];
export const maximumCodexEntries = 24;

export interface MapViewProjection {
  currentPlace: string;
  currentLeg: string | null;
  destination: string | null;
  progress: string;
  discovered: string;
  terrain: string;
}

export interface InventoryModifierView {
  name: ItemModifier;
  value: number;
}

export interface InventoryItemView {
  id: string;
  name: string;
  kind: ItemState["kind"];
  slot: EquipmentSlot | null;
  rarity: ItemState["rarity"];
  quantity: number;
  equippedSlot: EquipmentSlot | null;
  modifiers: readonly InventoryModifierView[];
}

export interface InventoryViewProjection {
  heroName: string;
  classAndLevel: string;
  gold: number;
  stackCount: number;
  itemCount: number;
  equippedCount: number;
  items: readonly InventoryItemView[];
}

export interface QuestView {
  id: string;
  title: string;
  status: ObjectiveStatus;
  objectives: readonly { id: string; description: string; progress: string; status: ObjectiveStatus }[];
}

export interface JournalViewProjection {
  questTitle: string;
  questSummary: string;
  quests: readonly QuestView[];
  entries: readonly ChronicleEntry[];
}

export type CodexVisualKey =
  | "lantern-wolf"
  | "mossback-brute"
  | "river-wyrmling"
  | "inkcap-mimic"
  | "copperhorn"
  | "unknown";

export interface CodexTechniqueView {
  id: string;
  name: string;
  effect: AbilityEffect;
  manaCost: number;
  potency: number;
  level: number;
  experience: number;
  experienceFloor: number;
  experienceCeiling: number;
  uses: number;
  discoveryTick: number;
}

export interface CodexMonsterView {
  monsterId: string;
  monsterName: string;
  visualKey: CodexVisualKey;
  encounters: number;
  victories: number;
  insight: number;
  requiredInsight: number;
  remainingVictories: number;
  techniqueStatus: "studying" | "learned" | "unverified";
  technique: CodexTechniqueView | null;
}

export interface CodexViewProjection {
  recordedCount: number;
  learnedCount: number;
  unverifiedCount: number;
  hiddenCount: number;
  monsters: readonly CodexMonsterView[];
}

const codexVisualKeys = new Set<CodexVisualKey>([
  "lantern-wolf",
  "mossback-brute",
  "river-wyrmling",
  "inkcap-mimic",
  "copperhorn",
]);

function locationName(state: WorldState, locationId: string | undefined): string | null {
  if (locationId === undefined) return null;
  return state.depth.atlas.locations.find((location) => location.id === locationId)?.name ?? null;
}

export function projectMapView(state: WorldState): MapViewProjection {
  const atlas = state.depth.atlas;
  const route = atlas.route;
  const fromName = route === null ? null : locationName(state, route.path[route.legIndex]);
  const toName = route === null ? null : locationName(state, route.path[route.legIndex + 1]);
  return {
    currentPlace: locationName(state, atlas.currentLocationId) ?? state.scene.location,
    currentLeg: fromName !== null && toName !== null ? `${fromName} → ${toName}` : null,
    destination: route === null ? null : locationName(state, route.destinationId),
    progress: route === null
      ? "No route planned"
      : `${route.distanceTravelled}/${route.totalDistance} miles · ${Math.max(0, route.totalDistance - route.distanceTravelled)} remaining`,
    discovered: `${atlas.discoveredLocationIds.length}/${atlas.locations.length} mapped sites reached`,
    terrain: `${atlas.terrain.generator} · terrain v${atlas.terrain.version}`,
  };
}

export function projectInventoryView(state: WorldState): InventoryViewProjection {
  const hero = state.depth.hero;
  const equippedById = new Map<string, EquipmentSlot>();
  for (const [slot, itemId] of Object.entries(hero.equipment) as [EquipmentSlot, string | null][]) {
    if (itemId !== null) equippedById.set(itemId, slot);
  }
  const items = hero.inventory.map((item): InventoryItemView => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    slot: item.slot,
    rarity: item.rarity,
    quantity: item.quantity,
    equippedSlot: equippedById.get(item.id) ?? null,
    modifiers: (Object.entries(item.modifiers) as [ItemModifier, number | undefined][])
      .flatMap(([name, value]) => value === undefined ? [] : [{ name, value }])
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  }));
  return {
    heroName: hero.name,
    classAndLevel: `${hero.className} · Level ${hero.level}`,
    gold: hero.gold,
    stackCount: items.length,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    equippedCount: items.filter((item) => item.equippedSlot !== null).length,
    items,
  };
}

export function projectJournalView(state: WorldState): JournalViewProjection {
  const quest = state.depth.quest;
  const quests: QuestView[] = [
    {
      id: quest.id,
      title: quest.title,
      status: quest.status,
      objectives: quest.objectives.map((objective) => ({
        id: objective.id,
        description: objective.description,
        progress: `${objective.current}/${objective.target}`,
        status: objective.status,
      })),
    },
    ...quest.subquests.map((subquest) => ({
      id: subquest.id,
      title: subquest.title,
      status: subquest.status,
      objectives: subquest.objectives.map((objective) => ({
        id: objective.id,
        description: objective.description,
        progress: `${objective.current}/${objective.target}`,
        status: objective.status,
      })),
    })),
  ];
  return {
    questTitle: quest.title,
    questSummary: quest.summary,
    quests,
    entries: state.chronicle.slice(-12).reverse(),
  };
}

export function projectCodexView(state: WorldState): CodexViewProjection {
  const sortedLore = [...state.depth.hero.monsterLore].sort((left, right) => {
    const nameOrder = left.monsterName.localeCompare(right.monsterName, "en", { sensitivity: "base" });
    return nameOrder !== 0 ? nameOrder : left.monsterId < right.monsterId ? -1 : left.monsterId > right.monsterId ? 1 : 0;
  });
  const uniqueLore = [...new Map(sortedLore.map((entry) => [entry.monsterId, entry])).values()];
  const projected = uniqueLore.map((lore): CodexMonsterView => {
    const ability = lore.learned
      ? state.depth.hero.abilities.find(
          (candidate) => candidate.id === lore.secretTechniqueId
            && candidate.sourceMonsterId === lore.monsterId
            && candidate.kind === "secret"
            && candidate.name === lore.secretTechniqueName,
        )
      : undefined;
    const discovery = ability === undefined
      ? undefined
      : state.depth.discoveries.find(
          (candidate) => candidate.abilityId === ability.id
            && candidate.monsterId === lore.monsterId
            && candidate.abilityName === ability.name
            && candidate.monsterName === lore.monsterName,
        );
    const technique: CodexTechniqueView | null = ability === undefined || discovery === undefined
      ? null
      : {
          id: ability.id,
          name: ability.name,
          effect: ability.effect,
          manaCost: ability.manaCost,
          potency: ability.potency,
          level: ability.level,
          experience: ability.experience,
          experienceFloor: abilityExperienceFloor(ability.level),
          experienceCeiling: abilityExperienceCeiling(ability.level),
          uses: ability.uses,
          discoveryTick: discovery.tick,
        };
    return {
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
      visualKey: codexVisualKeys.has(lore.monsterId as CodexVisualKey)
        ? lore.monsterId as CodexVisualKey
        : "unknown",
      encounters: lore.encounters,
      victories: lore.victories,
      insight: lore.insight,
      requiredInsight: lore.requiredInsight,
      remainingVictories: Math.max(0, lore.requiredInsight - lore.insight),
      techniqueStatus: technique !== null ? "learned" : lore.learned ? "unverified" : "studying",
      technique,
    };
  });
  const monsters = projected.slice(0, maximumCodexEntries);
  return {
    recordedCount: projected.length,
    learnedCount: projected.filter((entry) => entry.techniqueStatus === "learned").length,
    unverifiedCount: projected.filter((entry) => entry.techniqueStatus === "unverified").length,
    hiddenCount: projected.length - monsters.length,
    monsters,
  };
}
