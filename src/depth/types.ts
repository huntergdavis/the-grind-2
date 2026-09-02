export type LocationKind = "town" | "wilds" | "dungeon" | "landmark";

export type AtlasBiome =
  | "ocean"
  | "coast"
  | "grassland"
  | "forest"
  | "rainforest"
  | "desert"
  | "tundra"
  | "mountain"
  | "snow"
  | "marsh";

export interface AtlasTerrainPoint {
  x: number;
  y: number;
  elevation: number;
  filledElevation: number;
  moisture: number;
  flux: number;
  biome: AtlasBiome;
  downhill: number | null;
}

export interface AtlasTriangle {
  a: number;
  b: number;
  c: number;
}

export interface AtlasCoastSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AtlasRiver {
  id: string;
  pointIndices: readonly number[];
  flux: number;
}

export interface AtlasTerrain {
  version: 1;
  generator: "oleary-inspired-v1";
  signature: string;
  width: number;
  height: number;
  seaLevel: number;
  points: readonly AtlasTerrainPoint[];
  triangles: readonly AtlasTriangle[];
  coastline: readonly AtlasCoastSegment[];
  rivers: readonly AtlasRiver[];
}

export interface AtlasLocation {
  id: string;
  name: string;
  kind: LocationKind;
  x: number;
  y: number;
  danger: number;
  terrainPointIndex: number;
  feature: "sheltered-coast" | "river-ford" | "fertile-basin" | "mountain-pass" | "ancient-peak" | "biome-frontier";
}

export interface AtlasEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  terrain: "road" | "trail" | "pass" | "river";
  pathPointIndices: readonly number[];
  pathDistances: readonly number[];
  crossingPointIndices: readonly number[];
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
  terrain: AtlasTerrain;
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

export type CompanionPurpose = "shared-road-oath";
export type CompanionInjury = "none" | "wounded" | "fallen";
export type CompanionDepartureOutcome = "fulfilled" | "injured";

export interface CompanionIdentity {
  residentId: string;
  name: string;
  role: string;
  disposition: TownResident["disposition"];
  originTownId: string;
  originLocationId: string;
  homeBuildingId: string;
}

export interface CompanionDestination {
  locationId: string;
  name: string;
}

export interface CompanionCombatProfile {
  maxHealth: number;
  maxMana: number;
  power: number;
  armor: number;
  initiative: number;
}

export interface CompanionResources {
  health: number;
  mana: number;
}

interface CompanionRecordBase {
  identity: CompanionIdentity;
  destination: CompanionDestination;
  purpose: CompanionPurpose;
  joinedTick: number;
  resources: CompanionResources;
  combat: CompanionCombatProfile;
  victories: number;
  bond: number;
  injury: CompanionInjury;
}

export interface ActiveCompanion extends CompanionRecordBase {
  phase: "travelling" | "arrived";
}

export interface CompanionDeparture {
  tick: number;
  locationId: string;
  outcome: CompanionDepartureOutcome;
}

export interface FormerCompanion extends CompanionRecordBase {
  phase: "former";
  departure: CompanionDeparture;
}

export interface CompanionRosterState {
  schemaVersion: 1;
  active: readonly ActiveCompanion[];
  former: readonly FormerCompanion[];
}

export type MazeDirection = "north" | "east" | "south" | "west";

export interface MazeCell {
  id: string;
  x: number;
  y: number;
  exits: readonly MazeDirection[];
  feature: "empty" | "treasure" | "trap" | "shrine" | "lair";
}

export type DungeonTrapKind = "tripwire" | "rune-ward";
export type DungeonTrapPhase = "hidden" | "detected" | "disarmed" | "triggered";

export interface DungeonTrapState {
  cellId: string;
  kind: DungeonTrapKind;
  detectDifficulty: number;
  disarmDifficulty: number;
  phase: DungeonTrapPhase;
}

export type DungeonLayoutVersion = 1 | 2 | 3;
export type DungeonKeyGatePhase = "uncollected" | "carried" | "open";

export interface DungeonKeyGateState {
  keyCellId: string;
  unlockCellId: string;
  shortcutCellId: string;
  phase: DungeonKeyGatePhase;
}

export interface DungeonShrineUse {
  dungeonId: string;
  cellId: string;
  tick: number;
  healthBefore: number;
  healthRestored: number;
  healthAfter: number;
  manaBefore: number;
  manaRestored: number;
  manaAfter: number;
}

export interface DungeonState {
  layoutVersion: DungeonLayoutVersion;
  keyGate: DungeonKeyGateState | null;
  latestShrineUse: DungeonShrineUse | null;
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
  traps: readonly DungeonTrapState[];
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

export interface ItemRestorativeEffect {
  schemaVersion: 1;
  kind: "restore-health-quarter-max";
  target: "self";
}

export interface WeaponUseReceipt {
  schemaVersion: 1;
  id: string;
  combatId: string;
  weaponId: string;
  resolvedTick: number;
  outcome: "victory" | "defeat" | "stalemate";
  basicStrikes: number;
  damage: number;
  experienceBefore: number;
  experienceAfter: number;
  levelBefore: number;
  levelAfter: number;
}

export interface WeaponUseMasteryState {
  schemaVersion: 1;
  rulesVersion: "weapon-effective-use-v1";
  level: number;
  experience: number;
  receipts: readonly WeaponUseReceipt[];
}

export interface ItemState {
  id: string;
  name: string;
  kind: "equipment" | "consumable" | "key";
  slot: EquipmentSlot | null;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  quantity: number;
  modifiers: Partial<Record<ItemModifier, number>>;
  restorative: ItemRestorativeEffect | null;
  useMastery: WeaponUseMasteryState | null;
}

export interface TonicRestockPlan {
  schemaVersion: 1;
  townId: string;
  townName: string;
  itemId: string;
  itemName: "Ember Tonic";
  quantityBefore: number;
  quantityBought: number;
  quantityAfter: number;
  goldBefore: number;
  unitPrice: number;
  goldSpent: number;
  goldAfter: number;
  disposition: "incremented" | "recreated";
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

export type HeroGrowthPackageId =
  | "growth-v1:field-temper"
  | "growth-v1:road-rhythm"
  | "growth-v1:inner-pattern";

export type HeroGrowthReasonCode =
  | "combat-pressure"
  | "roadcraft"
  | "disciplined-study"
  | "class-affinity"
  | "personal-value"
  | "underdeveloped-path"
  | "steady-practice";

export interface HeroGrowthPackageTotals {
  "growth-v1:field-temper": number;
  "growth-v1:road-rhythm": number;
  "growth-v1:inner-pattern": number;
}

export interface HeroGrowthCandidate {
  schemaVersion: 1;
  packageId: HeroGrowthPackageId;
  label: string;
  score: number;
  tieBreak: number;
  reasonCodes: readonly HeroGrowthReasonCode[];
  attributeDeltas: HeroAttributes;
  attributesAfter: HeroAttributes;
  derivedAfter: {
    power: number;
    armor: number;
    initiative: number;
    maxHealth: number;
    maxMana: number;
  };
  resourcesAfter: HeroResources;
}

export interface HeroGrowthRecord {
  schemaVersion: 1;
  id: string;
  tick: number;
  crossedTick: number;
  heroId: string;
  checkpointLevel: 10 | 25 | 50;
  sourceCommandId: string;
  sourceCommandType: DepthCommand["type"] | "progress-objective";
  experienceBefore: number;
  experienceAfter: number;
  levelBefore: number;
  levelAfter: number;
  appliedLevel: number;
  packageTotalsBefore: HeroGrowthPackageTotals;
  attributesBefore: HeroAttributes;
  derivedBefore: HeroGrowthCandidate["derivedAfter"];
  resourcesBefore: HeroResources;
  equipmentModifiers: Partial<Record<ItemModifier, number>>;
  candidates: readonly HeroGrowthCandidate[];
  selectedPackageId: HeroGrowthPackageId;
  rationale: string;
}

export interface HeroGrowthTrigger {
  schemaVersion: 1;
  checkpointLevel: 10 | 25 | 50;
  crossedTick: number;
  sourceCommandId: string;
  sourceCommandType: DepthCommand["type"] | "progress-objective";
  experienceBefore: number;
  experienceAfter: number;
  levelBefore: number;
  levelAfter: number;
}

export interface HeroGrowthState {
  schemaVersion: 1;
  rulesVersion: "three-turning-points-v1";
  baselineLevel: number;
  settledCheckpointLevels: readonly (10 | 25 | 50)[];
  baselineAttributes: HeroAttributes;
  packageSelections: HeroGrowthPackageTotals;
  pendingTriggers: readonly HeroGrowthTrigger[];
  records: readonly HeroGrowthRecord[];
}

export type ObjectiveStatus = "active" | "complete" | "failed";
export type QuestStatus = "active" | "ready-to-fulfill" | "fulfilled" | "failed";

export type QuestObjectiveRule =
  | { schemaVersion: 1; kind: "visit-location"; locationKind: "town"; firstVisitOnly: true }
  | { schemaVersion: 1; kind: "win-combat" }
  | { schemaVersion: 1; kind: "complete-dungeon"; binding: "any" | "quest-lead" }
  | { schemaVersion: 1; kind: "discover-dungeon-feature"; feature: "shrine"; binding: "any" | "quest-lead" }
  | { schemaVersion: 1; kind: "acquire-item"; disposition: "inventory" };

export type QuestProgressFact =
  | { schemaVersion: 1; kind: "location-first-visited"; locationId: string; locationKind: "town" }
  | { schemaVersion: 1; kind: "combat-won"; combatId: string; defeatedSpeciesIds: readonly string[] }
  | { schemaVersion: 1; kind: "dungeon-completed"; dungeonId: string; locationId: string; binding: "unbound" | "quest-lead" }
  | { schemaVersion: 1; kind: "dungeon-feature-discovered"; dungeonId: string; locationId: string; cellId: string; feature: "shrine"; binding: "unbound" | "quest-lead" }
  | { schemaVersion: 1; kind: "item-acquired"; itemId: string; sourceId: string; disposition: "inventory" };

export interface QuestObjective {
  id: string;
  description: string;
  rule: QuestObjectiveRule;
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
  instanceId: string;
  id: string;
  ordinal: number;
  admittedTick: number;
  title: string;
  summary: string;
  status: QuestStatus;
  objectives: readonly QuestObjective[];
  subquests: readonly SubquestState[];
}

export type QuestRewardItemDisposition = "inventory" | "converted-to-gold";

export interface QuestRewardGrant {
  schemaVersion: 1;
  id: string;
  completionId: string;
  questInstanceId: string;
  questOrdinal: number;
  issuedTick: number;
  rulesVersion: "quest-reward-v1";
  experienceAward: number;
  baseGoldAward: number;
  item: ItemState;
  itemDisposition: QuestRewardItemDisposition;
  itemConversionGold: number;
  goldAward: number;
}

export interface QuestRewardReceipt {
  schemaVersion: 1 | 2;
  id: string;
  grantId: string;
  appliedTick: number;
  experienceBefore: number;
  experienceDelta: number;
  experienceAfter: number;
  levelBefore: number;
  levelAfter: number;
  goldBefore: number;
  goldDelta: number;
  goldAfter: number;
  itemId: string;
  itemDisposition: QuestRewardItemDisposition;
  itemConversionGold: number;
}

export type CompletedQuestReward =
  | { status: "legacy-no-grant" }
  | { status: "pending"; grant: QuestRewardGrant }
  | { status: "applied"; grant: QuestRewardGrant; receipt: QuestRewardReceipt };

export interface CompletedQuestSummary {
  id: string;
  questInstanceId: string;
  questId: string;
  questOrdinal: number;
  title: string;
  fulfilledTick: number;
  objectiveIds: readonly string[];
  subquestIds: readonly string[];
  reward: CompletedQuestReward;
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

export type CombatAction =
  | { actorId: string; type: "attack"; targetId: string; abilityId: null; itemId: null }
  | { actorId: string; type: "guard"; targetId: null; abilityId: null; itemId: null }
  | { actorId: string; type: "ability"; targetId: string; abilityId: string; itemId: null }
  | { actorId: string; type: "item"; targetId: string; abilityId: null; itemId: string };

export interface CombatLogEntry {
  turn: number;
  actorId: string;
  action: CombatAction["type"] | "status";
  targetId: string | null;
  abilityId: string | null;
  itemId: string | null;
  message: string;
  amount: number;
}

interface CombatTurnEventBase {
  id: string;
  turn: number;
  ordinal: number;
  actorId: string;
  targetId: string | null;
}

export type CombatTurnEvent =
  | (CombatTurnEventBase & {
      kind: "intent";
      action: CombatAction["type"];
      abilityId: string | null;
      itemId: string | null;
    })
  | (CombatTurnEventBase & {
      kind: "status-tick" | "status-expired";
      status: CombatStatusKind;
      potency: number;
      durationBefore: number;
      durationAfter: number;
      healthBefore: number;
      amount: number;
      healthAfter: number;
    })
  | (CombatTurnEventBase & {
      kind: "mana-spent";
      abilityId: string;
      manaBefore: number;
      amount: number;
      manaAfter: number;
    })
  | (CombatTurnEventBase & {
      kind: "restorative-used";
      itemId: string;
      itemName: string;
      effect: "restore-health-quarter-max-v1";
      quantityBefore: number;
      quantityAfter: number;
      disposition: "retained" | "depleted";
      maxHealth: number;
      healthBefore: number;
      amount: number;
      healthAfter: number;
    })
  | (CombatTurnEventBase & {
      kind: "damage";
      abilityId: string | null;
      healthBefore: number;
      amount: number;
      healthAfter: number;
      guarded: boolean;
      critical: false;
    })
  | (CombatTurnEventBase & {
      kind: "status-applied";
      abilityId: string | null;
      status: CombatStatusKind;
      potencyBefore: number | null;
      potencyAfter: number;
      durationBefore: number | null;
      durationAfter: number;
    })
  | (CombatTurnEventBase & {
      kind: "defeated";
      causeEventId: string;
    })
  | (CombatTurnEventBase & {
      kind: "outcome";
      outcome: Exclude<CombatState["outcome"], "ongoing">;
    });

export interface CombatEventStream {
  schemaVersion: 2;
  firstRecordedTurn: number;
  events: readonly CombatTurnEvent[];
}

export type EncounterThreatBand = "minor" | "guarded" | "perilous" | "dire" | "extreme";

export interface RatedEncounterThreatFactor {
  combatantId: string;
  speciesId: string;
  speciesBias: -1 | 0 | 1;
  score: number;
  mechanicalTier: number;
}

export type EncounterThreatProfile =
  | {
      schemaVersion: 1;
      rating: "legacy-unrated";
    }
  | {
      schemaVersion: 1;
      rating: "place-bound";
      rulesVersion: "place-threat-v1";
      edgeId: string;
      fromLocationId: string;
      destinationLocationId: string;
      placeDanger: number;
      questLeadId: string | null;
      questInstanceId: string | null;
      questModifier: 0 | 1;
      encounterScore: number;
      band: EncounterThreatBand;
      factors: readonly RatedEncounterThreatFactor[];
    };

export interface CombatState {
  id: string;
  round: number;
  turn: number;
  activeIndex: number;
  turnOrder: readonly string[];
  combatants: readonly CombatantState[];
  outcome: "ongoing" | "victory" | "defeat" | "stalemate";
  log: readonly CombatLogEntry[];
  eventStream: CombatEventStream;
  threat: EncounterThreatProfile;
  weaponUse: CombatWeaponUseState;
}

export type CombatWeaponUseState =
  | {
      schemaVersion: 1;
      tracking: "legacy-untracked";
    }
  | {
      schemaVersion: 1;
      tracking: "unarmed";
      heroId: string;
    }
  | {
      schemaVersion: 1;
      tracking: "tracked";
      rulesVersion: "weapon-effective-use-v1";
      heroId: string;
      weaponId: string;
      basicStrikes: number;
      damage: number;
    };

export type CounterDuelStance = "rush" | "ward" | "feint";
export type CounterDuelRoundResult = "hero" | "opponent" | "tie";
export type CounterDuelOutcome = "ongoing" | "victory" | "defeat" | "draw";
export type CounterDuelRulesVersion = "legacy-inert-v1" | "earned-pattern-break-v1";
export type CounterDuelPatternBreakStatus = "building" | "armed" | "spent" | "expired" | "legacy-inert";

export interface CounterDuelPatternBreakState {
  opening: 0 | 1 | 2;
  required: 2;
  status: CounterDuelPatternBreakStatus;
  armedRound: number | null;
  triggeredRound: number | null;
}

export interface CounterDuelPatternBreakReceipt {
  openingBefore: 0 | 1;
  openingGain: 0 | 1;
  openingAfter: 0 | 1 | 2;
  evidence: "none" | "confirmed-live-tell";
  reset: boolean;
  triggered: boolean;
}

export interface CounterDuelTell {
  id: string;
  cue: "forward-weight" | "closed-center" | "open-flank";
  suggestedStance: CounterDuelStance;
  clarity: 1 | 2 | 3;
}

export interface CounterDuelRound {
  round: number;
  tell: CounterDuelTell;
  prediction: CounterDuelStance;
  heroStance: CounterDuelStance;
  opponentStance: CounterDuelStance;
  result: CounterDuelRoundResult;
  heroScore: number;
  opponentScore: number;
  patternBreak?: CounterDuelPatternBreakReceipt;
}

export interface CounterDuelState {
  schemaVersion: 1 | 2;
  rulesVersion?: CounterDuelRulesVersion;
  id: string;
  heroId: string;
  opponentId: string;
  opponentName: string;
  opponentSpeciesId: string;
  round: number;
  heroScore: number;
  opponentScore: number;
  tell: CounterDuelTell;
  history: readonly CounterDuelRound[];
  outcome: CounterDuelOutcome;
  patternBreak?: CounterDuelPatternBreakState;
  stakes: {
    victoryExperience: 8;
    victoryGold: 5;
    heroMaxHealthAtStart: number;
    defeatDamage: number;
  };
}

export type CounterDuelHabitKnowledge =
  | {
      status: "unconfirmed";
      encounters: number;
      requiredEncounters: 3;
    }
  | {
      status: "established";
      encounters: number;
      requiredEncounters: 3;
      preferredStance: CounterDuelStance;
      label: string;
    };

export interface CounterDuelPolicyView {
  id: string;
  opponentName: string;
  round: number;
  heroScore: number;
  opponentScore: number;
  tell: CounterDuelTell;
  habit: CounterDuelHabitKnowledge;
  patternBreak: CounterDuelPatternBreakState | null;
  revealedRounds: readonly CounterDuelRound[];
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

export type SecretDiscoveryDisposition = "learned" | "deferred-capacity" | "rejected";

export type SecretDiscoveryReason =
  | "slot-available"
  | "already-owned"
  | "repertoire-full"
  | "ability-id-conflict"
  | "legacy-confirmed"
  | "legacy-unresolved";

export interface SecretDiscoveryOutcome {
  id: string;
  recordedTick: number;
  thresholdTick: number | null;
  sourceCombatId: string | null;
  monsterId: string;
  monsterName: string;
  abilityId: string;
  abilityName: string;
  mechanics: {
    effect: AbilityEffect;
    manaCost: number;
    potency: number;
  } | null;
  disposition: SecretDiscoveryDisposition;
  reason: SecretDiscoveryReason;
  repertoireCount: number;
  repertoireLimit: number;
}

export interface SecretDiscoveryAdmission {
  id: string;
  tick: number;
  outcomeId: string;
  discoveryId: string;
}

export interface DepthState {
  schemaVersion: 20;
  seed: string;
  tick: number;
  atlas: AtlasState;
  towns: Readonly<Record<string, TownState>>;
  companions: CompanionRosterState;
  dungeon: DungeonState | null;
  hero: DetailedHeroState;
  heroGrowth: HeroGrowthState;
  quest: QuestState;
  completedQuests: readonly CompletedQuestSummary[];
  totalCompletedQuests: number;
  pendingQuestReward: QuestRewardGrant | null;
  legacyUnratedCombatIds: readonly string[];
  combat: CombatState | null;
  completedCombats: readonly CombatState[];
  counterDuel: CounterDuelState | null;
  completedCounterDuels: readonly CounterDuelState[];
  secretDiscoveryOutcomes: readonly SecretDiscoveryOutcome[];
  secretDiscoveryAdmissions: readonly SecretDiscoveryAdmission[];
  discoveries: readonly AbilityDiscovery[];
  log: readonly DepthLogEntry[];
}

export type DepthCommand =
  | { type: "recruit-companion"; residentId: string; destinationId: string }
  | { type: "farewell-companion"; residentId: string }
  | { type: "restock-tonic"; itemId: string }
  | { type: "plan-route"; destinationId: string }
  | { type: "travel"; distance: number }
  | { type: "visit-town" }
  | { type: "enter-dungeon"; dungeonId: string; width: number; height: number }
  | { type: "invoke-dungeon-shrine"; dungeonId: string; cellId: string }
  | { type: "move-dungeon"; direction: MazeDirection }
  | { type: "disarm-dungeon-trap" }
  | { type: "unlock-dungeon-gate" }
  | { type: "start-combat"; encounterId: string; enemyCount: number }
  | { type: "combat-action"; action: CombatAction }
  | { type: "start-counter-duel"; encounterId: string }
  | { type: "counter-duel-action"; prediction: CounterDuelStance }
  | { type: "admit-deferred-secret"; outcomeId: string }
  | { type: "train-ability"; abilityId: string }
  | { type: "fulfill-quest"; questInstanceId: string }
  | { type: "apply-quest-reward"; grantId: string }
  | { type: "admit-successor-quest"; completionId: string }
  | { type: "wait" };

export interface DepthCommandCandidate {
  id: string;
  label: string;
  deciderId: string;
  command: DepthCommand;
}
