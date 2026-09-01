export const adventureEventSchemaVersion = 1 as const;
export const maximumAdventureEventsPerSegment = 100_000;
export const maximumAdventureDictionaryEntries = 65_535;
export const maximumAdventureReferencesPerEvent = 16;
export const maximumAdventureStringBytes = 256;
export const maximumAdventureSegmentBytes = 16 * 1024 * 1024;

export type LedgerCommandType =
  | "plan-route"
  | "travel"
  | "visit-town"
  | "enter-dungeon"
  | "move-dungeon"
  | "disarm-dungeon-trap"
  | "unlock-dungeon-gate"
  | "start-combat"
  | "combat-action"
  | "start-counter-duel"
  | "counter-duel-action"
  | "train-ability"
  | "progress-objective"
  | "fulfill-quest"
  | "apply-quest-reward"
  | "admit-successor-quest"
  | "wait";

export type LedgerDirection = "north" | "east" | "south" | "west";
export type LedgerCombatAction = "attack" | "guard" | "ability" | "item";
export type LedgerCombatOutcome = "victory" | "defeat" | "stalemate";
export type LedgerCombatEffectKind =
  | "damage"
  | "healing"
  | "mana-spent"
  | "guarded"
  | "status-applied"
  | "status-tick"
  | "status-expired"
  | "defeated";
export type LedgerResource = "health" | "mana" | "guard";
export type LedgerAbilityProgressSource = "combat" | "training";
export type LedgerCurrency = "gold";

/**
 * Version-one events are a causal journal of resolved semantic facts. They are
 * deliberately presentation-free: prose, recaps, and statistics are rebuilt
 * as projections, while periodic snapshots make long replays practical.
 */
export interface AdventureEventPayloads {
  "campaign.started": {
    seed: number;
    rulesetVersion: string;
    generatorVersion: string;
    worldSchemaVersion: string;
    depthSchemaVersion: string;
    initialStateHash: string;
    heroId: string;
    locationId: string;
  };
  "command.applied": {
    commandType: LedgerCommandType;
  };
  "route.planned": {
    originLocationId: string;
    destinationId: string;
    legs: number;
    distance: number;
    routeHash: string;
  };
  "travel.edge-advanced": {
    edgeId: string;
    progressBefore: number;
    progressAfter: number;
    reachedLocationId: string | null;
    routeCompleted: boolean;
  };
  "town.visited": {
    townId: string;
    visit: number;
    reputationAfter: number;
  };
  "dungeon.entered": {
    dungeonId: string;
    width: number;
    height: number;
    layoutVersion: string;
    layoutHash: string;
  };
  "dungeon.moved": {
    dungeonId: string;
    fromCellId: string;
    toCellId: string;
    direction: LedgerDirection;
    firstVisit: boolean;
    feature: string | null;
    completed: boolean;
  };
  "dungeon.trap-triggered": {
    dungeonId: string;
    cellId: string;
    damage: number;
    healthBefore: number;
    healthAfter: number;
  };
  "combat.started": {
    combatId: string;
    enemySpeciesIds: readonly string[];
  };
  "combat.action": {
    combatId: string;
    round: number;
    turn: number;
    action: LedgerCombatAction;
    targetId: string | null;
    abilityId: string | null;
    manaCost: number;
  };
  "combat.effect": {
    combatId: string;
    kind: LedgerCombatEffectKind;
    targetId: string;
    resource: LedgerResource | null;
    amount: number;
    resourceAfter: number | null;
    statusId: string | null;
    statusDurationAfter: number | null;
    statusPotencyAfter: number | null;
  };
  "combat.ended": {
    combatId: string;
    outcome: LedgerCombatOutcome;
    turns: number;
  };
  "monster.observed": {
    speciesId: string;
    encountersAfter: number;
  };
  "monster.insight-gained": {
    speciesId: string;
    insightDelta: number;
    insightAfter: number;
    requiredInsight: number;
    victoriesAfter: number;
  };
  "ability.progressed": {
    abilityId: string;
    source: LedgerAbilityProgressSource;
    experienceDelta: number;
    experienceAfter: number;
    levelAfter: number;
    usesDelta: number;
    usesAfter: number;
  };
  "ability.learned": {
    abilityId: string;
    speciesId: string;
  };
  "quest.progressed": {
    objectiveId: string;
    appliedDelta: number;
    currentAfter: number;
    objectiveCompleted: boolean;
  };
  "quest.fulfilled": {
    completionId: string;
    questInstanceId: string;
    questId: string;
    questOrdinal: number;
    objectiveCount: number;
    subquestCount: number;
    totalCompletedQuests: number;
  };
  "quest.reward-applied": {
    grantId: string;
    completionId: string;
    experienceDelta: number;
    experienceAfter: number;
    levelBefore: number;
    levelAfter: number;
    goldDelta: number;
    goldAfter: number;
    itemId: string;
    itemDisposition: "inventory" | "converted-to-gold";
    itemConversionGold: number;
  };
  "quest.admitted": {
    questInstanceId: string;
    questId: string;
    questOrdinal: number;
    predecessorCompletionId: string;
    generatorVersion: "quest-sequence-v1";
    objectiveCount: number;
    subquestCount: number;
  };
  "quest.lead-revealed": {
    leadId: string;
    questInstanceId: string;
    questOrdinal: number;
    objectiveId: "quest:cross-maze";
    locationId: string;
    selectorVersion: "quest-lead-v1";
  };
  "actor.recovered": {
    healthDelta: number;
    healthAfter: number;
    manaDelta: number;
    manaAfter: number;
  };
  "item.acquired": {
    itemId: string;
    quantity: number;
  };
  "item.consumed": {
    combatId: string;
    turn: number;
    itemId: string;
    effect: "restore-health-quarter-max-v1";
    quantityBefore: number;
    quantityAfter: number;
    disposition: "retained" | "depleted";
    targetId: string;
    maxHealth: number;
    healthBefore: number;
    healthDelta: number;
    healthAfter: number;
  };
  "equipment.changed": {
    slot: string;
    previousItemId: string | null;
    itemId: string | null;
  };
  "hero.progressed": {
    experienceDelta: number;
    experienceAfter: number;
    levelAfter: number;
  };
  "hero.growth-selected": {
    recordId: string;
    rulesVersion: "three-turning-points-v1";
    checkpointLevel: 10 | 25 | 50;
    crossedTick: number;
    appliedLevel: number;
    selectedPackageId: "growth-v1:field-temper" | "growth-v1:road-rhythm" | "growth-v1:inner-pattern";
    packageSelectionAfter: 1 | 2;
  };
  "currency.changed": {
    currency: LedgerCurrency;
    delta: number;
    amountAfter: number;
  };
}

export type AdventureEventType = keyof AdventureEventPayloads;

export interface AdventureEventBase<
  TType extends AdventureEventType,
  TPayload extends AdventureEventPayloads[TType],
> {
  schemaVersion: typeof adventureEventSchemaVersion;
  campaignId: string;
  sequence: number;
  worldTick: number;
  type: TType;
  actorId: string | null;
  causeSequences: readonly number[];
  payload: TPayload;
}

export type AdventureEvent = {
  [TType in AdventureEventType]: AdventureEventBase<
    TType,
    AdventureEventPayloads[TType]
  >;
}[AdventureEventType];

export function adventureEventId(event: Pick<AdventureEvent, "campaignId" | "sequence">): string {
  return `${event.campaignId}:event:${event.sequence}`;
}
