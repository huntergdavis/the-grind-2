import type { ChronicleEntry, WorldState } from "../core/types";
import type { EquipmentSlot, ItemModifier, ItemState, ObjectiveStatus } from "../depth/types";

export type InspectionView = "watch" | "map" | "inventory" | "journal";

export const inspectionViews: readonly InspectionView[] = ["watch", "map", "inventory", "journal"];

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
