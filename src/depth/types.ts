export type LocationKind = "town" | "wilds" | "dungeon" | "landmark";

export interface AtlasLocation {
  id: string;
  name: string;
  kind: LocationKind;
  x: number;
  y: number;
  danger: number;
}

export interface AtlasEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  terrain: "road" | "trail" | "pass" | "river";
}

export interface RoutePlan {
  destinationId: string;
  path: readonly string[];
  legIndex: number;
  legProgress: number;
  distanceTravelled: number;
  totalDistance: number;
}

export interface AtlasState {
  locations: readonly AtlasLocation[];
  edges: readonly AtlasEdge[];
  currentLocationId: string;
  route: RoutePlan | null;
  discoveredLocationIds: readonly string[];
}

export interface TownResident {
  id: string;
  name: string;
  role: string;
  disposition: "wary" | "neutral" | "warm";
  homeBuildingId: string;
}

export interface TownBuilding {
  id: string;
  name: string;
  kind: "inn" | "smithy" | "market" | "shrine" | "hall" | "home";
  districtId: string;
  residentIds: readonly string[];
}

export interface TownDistrict {
  id: string;
  name: string;
  character: string;
  buildingIds: readonly string[];
}

export interface TownState {
  id: string;
  locationId: string;
  name: string;
  foundedYear: number;
  specialty: string;
  districts: readonly TownDistrict[];
  buildings: readonly TownBuilding[];
  residents: readonly TownResident[];
  reputation: number;
  visits: number;
}

export type MazeDirection = "north" | "east" | "south" | "west";

export interface MazeCell {
  id: string;
  x: number;
  y: number;
  exits: readonly MazeDirection[];
  feature: "empty" | "treasure" | "trap" | "shrine" | "lair";
}

export interface DungeonState {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: readonly MazeCell[];
  entryCellId: string;
  exitCellId: string;
  currentCellId: string;
  visitedCellIds: readonly string[];
  discoveredCellIds: readonly string[];
  traversalLog: readonly string[];
  turns: number;
  completed: boolean;
}

export type AttributeName =
  | "strength"
  | "agility"
  | "vitality"
  | "intellect"
  | "spirit"
  | "luck";

export type EquipmentSlot = "weapon" | "offhand" | "head" | "body" | "feet" | "charm";
export type ItemModifier = AttributeName | "power" | "armor" | "maxHealth" | "maxMana";

export interface ItemState {
  id: string;
  name: string;
  kind: "equipment" | "consumable" | "key";
  slot: EquipmentSlot | null;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  quantity: number;
  modifiers: Partial<Record<ItemModifier, number>>;
}

export interface HeroAttributes {
  strength: number;
  agility: number;
  vitality: number;
  intellect: number;
  spirit: number;
  luck: number;
}

export interface HeroResources {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export type AbilityKind = "spell" | "technique" | "secret";
export type AbilityEffect = "arcane" | "burning" | "poison" | "weaken" | "piercing";

export interface AbilityState {
  id: string;
  name: string;
  kind: AbilityKind;
  effect: AbilityEffect;
  level: number;
  experience: number;
  uses: number;
  manaCost: number;
  potency: number;
  sourceMonsterId: string | null;
}

export interface MonsterLoreState {
  monsterId: string;
  monsterName: string;
  encounters: number;
  victories: number;
  insight: number;
  requiredInsight: number;
  secretTechniqueId: string;
  secretTechniqueName: string;
  learned: boolean;
}

export interface DetailedHeroState {
  id: string;
  name: string;
  className: string;
  level: number;
  experience: number;
  attributes: HeroAttributes;
  resources: HeroResources;
  gold: number;
  inventory: readonly ItemState[];
  equipment: Record<EquipmentSlot, string | null>;
  abilities: readonly AbilityState[];
  monsterLore: readonly MonsterLoreState[];
}

export type ObjectiveStatus = "active" | "complete" | "failed";

export interface QuestObjective {
  id: string;
  description: string;
  current: number;
  target: number;
  status: ObjectiveStatus;
}

export interface SubquestState {
  id: string;
  title: string;
  status: ObjectiveStatus;
  objectives: readonly QuestObjective[];
}

export interface QuestState {
  id: string;
  title: string;
  summary: string;
  status: ObjectiveStatus;
  objectives: readonly QuestObjective[];
  subquests: readonly SubquestState[];
}

export type CombatStatusKind = "guarding" | "poisoned" | "weakened" | "burning";

export interface CombatStatus {
  kind: CombatStatusKind;
  duration: number;
  potency: number;
}

export interface CombatantState {
  id: string;
  name: string;
  side: "heroes" | "enemies";
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  power: number;
  armor: number;
  initiative: number;
  statuses: readonly CombatStatus[];
  speciesId: string | null;
  abilities: readonly AbilityState[];
}

export interface CombatAction {
  actorId: string;
  type: "attack" | "guard" | "ability";
  targetId: string | null;
  abilityId: string | null;
}

export interface CombatLogEntry {
  turn: number;
  actorId: string;
  action: CombatAction["type"] | "status";
  targetId: string | null;
  abilityId: string | null;
  message: string;
  amount: number;
}

export interface CombatState {
  id: string;
  round: number;
  turn: number;
  activeIndex: number;
  turnOrder: readonly string[];
  combatants: readonly CombatantState[];
  outcome: "ongoing" | "victory" | "defeat" | "stalemate";
  log: readonly CombatLogEntry[];
}

export interface DepthLogEntry {
  id: string;
  tick: number;
  category: "world" | "town" | "dungeon" | "quest" | "combat" | "item" | "ability";
  message: string;
}

export interface AbilityDiscovery {
  id: string;
  tick: number;
  abilityId: string;
  abilityName: string;
  monsterId: string;
  monsterName: string;
}

export interface DepthState {
  schemaVersion: 2;
  seed: string;
  tick: number;
  atlas: AtlasState;
  towns: Readonly<Record<string, TownState>>;
  dungeon: DungeonState | null;
  hero: DetailedHeroState;
  quest: QuestState;
  combat: CombatState | null;
  completedCombats: readonly CombatState[];
  discoveries: readonly AbilityDiscovery[];
  log: readonly DepthLogEntry[];
}

export type DepthCommand =
  | { type: "plan-route"; destinationId: string }
  | { type: "travel"; distance: number }
  | { type: "visit-town" }
  | { type: "enter-dungeon"; dungeonId: string; width: number; height: number }
  | { type: "move-dungeon"; direction: MazeDirection }
  | { type: "start-combat"; encounterId: string; enemyCount: number }
  | { type: "combat-action"; action: CombatAction }
  | { type: "train-ability"; abilityId: string }
  | { type: "progress-objective"; objectiveId: string; amount: number }
  | { type: "wait" };

export interface DepthCommandCandidate {
  id: string;
  label: string;
  deciderId: string;
  command: DepthCommand;
}
