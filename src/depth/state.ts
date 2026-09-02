import { randomInt } from "../core/rng";
import { createHeroGrowthState, isStructurallyValidHeroGrowthState } from "../core/hero-growth";
import { advanceRoute, edgeBetween, generateAtlas, neighboringLocationIds, planRoute } from "./atlas";
import { createCombat, isValidCombatState, legalCombatActions, monsterAbilityForLevel, monsterDefinitions, resolveCombatTurn } from "./combat";
import {
  addActiveCompanion,
  companionToCombatant,
  createEmptyCompanionRoster,
  isValidCompanionReferences,
  isValidCompanionRoster,
  companionMatchesCombatantIdentity,
  retireActiveCompanionAtDestination,
  selectSharedRoadCompanion,
  syncCompanionResources,
  syncActiveCompanionCombat,
} from "./companion";
import {
  counterDuelHabitText,
  counterDuelHabitUnlockText,
  counterDuelStanceLabel,
  counterDuelStances,
  counterToStance,
  createCounterDuel,
  isValidCounterDuel,
  newlyEstablishedCounterDuelHabits,
  projectCounterDuelHabit,
  resolveCounterDuelRound,
  upgradeCounterDuel,
} from "./counter-duel";
import {
  canUnlockDungeonGate,
  describeDungeonShrineUse,
  dungeonMoveOptions,
  dungeonKeyName,
  dungeonTrapAt,
  dungeonTrapKindLabel,
  generateDungeon,
  migrateDungeonFarStairShrine,
  migrateDungeonTraps,
  moveDungeon,
  projectDungeonTraversal,
  resolveDungeonTrap,
  resolveDungeonTrapCheck,
  unlockDungeonGate,
  withDungeonTrapPhase,
  type DungeonTrapCheck,
  type DungeonTrapConsequence,
} from "./dungeon";
import {
  addItem,
  applyHeroExperience,
  applyQuestProgressFact,
  applyWeaponUseMastery,
  createHero,
  createEmberTonic,
  createWeaponUseMastery,
  createQuest,
  createQuestRewardGrant,
  describeQuestRewardReceipt,
  describeWeaponUseReceipt,
  effectiveAttribute,
  equipBestItems,
  emberTonicId,
  emberTonicTargetQuantity,
  emberTonicUnitPrice,
  generateLoot,
  heroLevelForExperience,
  heroMechanicalLevel,
  inventoryCapacity,
  legacyHeroLevelForExperience,
  observeMonster,
  observeMonsters,
  maximumAbilities,
  maximumCompletedQuestSummaries,
  questCompletionId,
  recordMonsterVictory,
  restorativeHealthAmount,
  isValidDetailedHeroState,
  isCanonicalQuestDefinition,
  isCanonicalEmberTonic,
  isValidQuestCompletionState,
  isValidQuestRewardState,
  isValidQuestState,
  starterAbilities,
  trainAbility,
  upgradeQuestObjectiveRules,
} from "./rpg";
import { isQuestLeadDungeon, projectSuccessorQuestLead } from "./quest-lead";
import { createLegacyUnratedThreat, isValidEncounterThreatProvenance, type EncounterThreatContext } from "./threat";
import { generateTown, visitTown } from "./towns";
import type {
  CombatLogEntry,
  CombatState,
  CombatantState,
  CompletedQuestSummary,
  DepthCommand,
  DepthCommandCandidate,
  DepthLogEntry,
  DepthState,
  DetailedHeroState,
  DungeonShrineUse,
  DungeonState,
  AtlasState,
  AtlasLocation,
  AtlasEdge,
  QuestRewardGrant,
  QuestRewardReceipt,
  QuestState,
  SecretDiscoveryOutcome,
  TonicRestockPlan,
} from "./types";

export const maximumDepthLogEntries = 128;
export const maximumCompletedCombats = 4;
export const maximumCompletedCounterDuels = 4;
export const maximumAbilityDiscoveries = 32;

function questNeedsDungeonExpedition(quest: QuestState): boolean {
  return [...quest.objectives, ...quest.subquests.flatMap((subquest) => subquest.objectives)]
    .some((objective) =>
      (objective.rule.kind === "complete-dungeon" || objective.rule.kind === "discover-dungeon-feature") &&
      objective.status === "active"
    );
}

function questNeedsShrineDiscovery(quest: QuestState): boolean {
  return [...quest.objectives, ...quest.subquests.flatMap((subquest) => subquest.objectives)]
    .some((objective) =>
      objective.status === "active" &&
      objective.rule.kind === "discover-dungeon-feature" &&
      objective.rule.feature === "shrine"
    );
}

function dungeonExpeditionId(state: DepthState, locationId: string): string {
  return state.quest.ordinal > 0 && questNeedsDungeonExpedition(state.quest)
    ? `dungeon:${locationId}:quest:${state.quest.ordinal}`
    : `dungeon:${locationId}`;
}

type PreviousHeroState = Omit<DetailedHeroState, "abilities" | "monsterLore">;
type PreviousDungeonStateV7 = Omit<DungeonState, "latestShrineUse">;
type PreviousDungeonStateV5 = Omit<DungeonState, "layoutVersion" | "keyGate" | "latestShrineUse">;
type PreviousDungeonState = Omit<PreviousDungeonStateV5, "traps">;
type PreviousCombatantState = Omit<CombatantState, "abilities" | "speciesId">;
type PreviousCombatStateV13 = Omit<CombatState, "threat">;
type PreviousCombatStateVCurrent = Omit<CombatState, "eventStream" | "threat">;
type PreviousCombatLogEntry = Omit<CombatLogEntry, "action" | "targetId" | "abilityId" | "itemId"> & {
  action: "attack" | "guard" | "skill" | "status";
};
type PreviousCombatState = Omit<PreviousCombatStateVCurrent, "combatants" | "log"> & {
  combatants: readonly PreviousCombatantState[];
  log: readonly PreviousCombatLogEntry[];
};
type PreviousAtlasLocation = Omit<AtlasLocation, "terrainPointIndex" | "feature">;
type PreviousAtlasEdge = Omit<AtlasEdge, "pathPointIndices" | "pathDistances" | "crossingPointIndices">;
type PreviousAtlasState = Omit<AtlasState, "terrain" | "locations" | "edges"> & {
  locations: readonly PreviousAtlasLocation[];
  edges: readonly PreviousAtlasEdge[];
};
interface PreviousQuestObjectiveV11 {
  id: string;
  description: string;
  current: number;
  target: number;
  status: "active" | "complete" | "failed";
}
interface PreviousSubquestStateV11 {
  id: string;
  title: string;
  status: "active" | "complete" | "failed";
  objectives: readonly PreviousQuestObjectiveV11[];
}
interface PreviousQuestStateV11 {
  instanceId: string;
  id: string;
  ordinal: number;
  admittedTick: number;
  title: string;
  summary: string;
  status: QuestState["status"];
  objectives: readonly PreviousQuestObjectiveV11[];
  subquests: readonly PreviousSubquestStateV11[];
}
type PreviousQuestState = Omit<PreviousQuestStateV11, "instanceId" | "ordinal" | "admittedTick" | "status"> & {
  status: "active" | "complete" | "failed";
};
type PreviousCompletedQuestSummary = Omit<CompletedQuestSummary, "reward">;
type PreviousDepthStateV20 = Omit<DepthState, "schemaVersion" | "companions"> & {
  schemaVersion: 20;
  companions:
    | { schemaVersion: 1; active: DepthState["companions"]["active"]; former: DepthState["companions"]["former"] }
    | DepthState["companions"];
};
type PreviousDepthStateV19 = Omit<PreviousDepthStateV20, "schemaVersion"> & { schemaVersion: 19 };
type PreviousDepthStateV18 = Omit<PreviousDepthStateV19, "schemaVersion"> & { schemaVersion: 18 };
type PreviousDepthStateV17 = Omit<PreviousDepthStateV18, "schemaVersion" | "secretDiscoveryOutcomes" | "secretDiscoveryAdmissions"> & {
  schemaVersion: 17;
};
type PreviousDepthStateV16 = Omit<PreviousDepthStateV17, "schemaVersion"> & { schemaVersion: 16 };
type PreviousDepthStateV15 = Omit<PreviousDepthStateV16, "schemaVersion"> & { schemaVersion: 15 };
type PreviousDepthStateV14 = Omit<PreviousDepthStateV15, "schemaVersion" | "heroGrowth"> & {
  schemaVersion: 14;
};
type PreviousDepthStateV13 = Omit<PreviousDepthStateV14, "schemaVersion" | "legacyUnratedCombatIds" | "combat" | "completedCombats"> & {
  schemaVersion: 13;
  combat: PreviousCombatStateV13 | null;
  completedCombats: readonly PreviousCombatStateV13[];
};
type PreviousDepthStateV12 = Omit<PreviousDepthStateV13, "schemaVersion"> & {
  schemaVersion: 12;
};
type PreviousDepthStateV11 = Omit<PreviousDepthStateV12, "schemaVersion" | "quest"> & {
  schemaVersion: 11;
  quest: PreviousQuestStateV11;
};
type PreviousDepthStateV10 = Omit<PreviousDepthStateV11, "schemaVersion" | "completedQuests" | "pendingQuestReward"> & {
  schemaVersion: 10;
  completedQuests: readonly PreviousCompletedQuestSummary[];
};
type PreviousDepthStateV9 = Omit<PreviousDepthStateV10, "schemaVersion" | "quest" | "completedQuests" | "totalCompletedQuests"> & {
  schemaVersion: 9;
  quest: PreviousQuestState;
};
type PreviousDepthStateV8 = Omit<PreviousDepthStateV9, "schemaVersion" | "companions"> & {
  schemaVersion: 8;
};
type PreviousDepthStateV7 = Omit<PreviousDepthStateV8, "schemaVersion" | "dungeon"> & {
  schemaVersion: 7;
  dungeon: PreviousDungeonStateV7 | null;
};
type PreviousDepthStateV6 = Omit<PreviousDepthStateV7, "schemaVersion" | "combat" | "completedCombats"> & {
  schemaVersion: 6;
  combat: PreviousCombatStateVCurrent | null;
  completedCombats: readonly PreviousCombatStateVCurrent[];
};
type PreviousDepthStateV5 = Omit<PreviousDepthStateV6, "schemaVersion" | "dungeon"> & {
  schemaVersion: 5;
  dungeon: PreviousDungeonStateV5 | null;
};
type PreviousDepthStateV4 = Omit<PreviousDepthStateV5, "schemaVersion" | "counterDuel" | "completedCounterDuels"> & {
  schemaVersion: 4;
};
type PreviousDepthStateV3 = Omit<PreviousDepthStateV4, "schemaVersion" | "dungeon"> & {
  schemaVersion: 3;
  dungeon: PreviousDungeonState | null;
};
type PreviousDepthStateV2 = Omit<PreviousDepthStateV3, "schemaVersion" | "atlas"> & {
  schemaVersion: 2;
  atlas: PreviousAtlasState;
};
type PreviousDepthState = Omit<PreviousDepthStateV2, "schemaVersion" | "hero" | "combat" | "completedCombats" | "discoveries"> & {
  schemaVersion: 1;
  hero: PreviousHeroState;
  combat: PreviousCombatState | null;
  completedCombats: readonly PreviousCombatState[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function exactSecretAbility(state: DepthState, outcome: SecretDiscoveryOutcome) {
  if (outcome.mechanics === null) return undefined;
  return state.hero.abilities.find((ability) =>
    ability.id === outcome.abilityId &&
    ability.name === outcome.abilityName &&
    ability.kind === "secret" &&
    ability.sourceMonsterId === outcome.monsterId &&
    ability.effect === outcome.mechanics?.effect &&
    ability.manaCost === outcome.mechanics.manaCost &&
    ability.potency === outcome.mechanics.potency
  );
}

export function isValidSecretDiscoveryGraph(state: DepthState): boolean {
  if (
    !Array.isArray(state.hero.abilities) ||
    !Array.isArray(state.hero.monsterLore) ||
    !Array.isArray(state.discoveries) ||
    state.discoveries.length > maximumAbilityDiscoveries ||
    !Array.isArray(state.secretDiscoveryOutcomes) ||
    state.secretDiscoveryOutcomes.length > 16 ||
    !Array.isArray(state.secretDiscoveryAdmissions) ||
    state.secretDiscoveryAdmissions.length > 16
  ) return false;

  const discoveryIds = state.discoveries.map((entry) => entry.id);
  const outcomeIds = state.secretDiscoveryOutcomes.map((entry) => entry.id);
  const admissionIds = state.secretDiscoveryAdmissions.map((entry) => entry.id);
  if (
    new Set(discoveryIds).size !== discoveryIds.length ||
    new Set(outcomeIds).size !== outcomeIds.length ||
    new Set(admissionIds).size !== admissionIds.length ||
    new Set(state.secretDiscoveryOutcomes.map((entry) => entry.monsterId)).size !== state.secretDiscoveryOutcomes.length ||
    new Set(state.secretDiscoveryAdmissions.map((entry) => entry.outcomeId)).size !== state.secretDiscoveryAdmissions.length ||
    new Set(state.secretDiscoveryAdmissions.map((entry) => entry.discoveryId)).size !== state.secretDiscoveryAdmissions.length
  ) return false;

  const validDiscoveries = state.discoveries.every((entry) => {
    const raw: unknown = entry;
    return isRecord(raw) &&
    hasExactKeys(raw, ["id", "tick", "abilityId", "abilityName", "monsterId", "monsterName"]) &&
    typeof entry.id === "string" && entry.id.length > 0 &&
    isNonNegativeSafeInteger(entry.tick) && entry.tick <= state.tick &&
    typeof entry.abilityId === "string" && entry.abilityId.length > 0 &&
    typeof entry.abilityName === "string" && entry.abilityName.length > 0 &&
    typeof entry.monsterId === "string" && entry.monsterId.length > 0 &&
    typeof entry.monsterName === "string" && entry.monsterName.length > 0;
  });
  if (!validDiscoveries) return false;

  const validOutcomes = state.secretDiscoveryOutcomes.every((entry) => {
    const raw: unknown = entry;
    if (!isRecord(raw) || !hasExactKeys(raw, [
      "id",
      "recordedTick",
      "thresholdTick",
      "sourceCombatId",
      "monsterId",
      "monsterName",
      "abilityId",
      "abilityName",
      "mechanics",
      "disposition",
      "reason",
      "repertoireCount",
      "repertoireLimit",
    ])) return false;
    const lore = state.hero.monsterLore.find((candidate) => candidate.monsterId === entry.monsterId);
    const definition = monsterDefinitions.find((candidate) => candidate.id === entry.monsterId);
    const mechanicsValid = entry.mechanics === null
      ? entry.disposition === "rejected" && entry.reason === "legacy-unresolved"
      : (() => {
        const rawMechanics: unknown = entry.mechanics;
        return isRecord(rawMechanics) &&
        hasExactKeys(rawMechanics, ["effect", "manaCost", "potency"]) &&
        definition !== undefined &&
        definition.name === entry.monsterName &&
        definition.secret.id === entry.abilityId &&
        definition.secret.name === entry.abilityName &&
        definition.secret.effect === entry.mechanics.effect &&
        definition.secret.manaCost === entry.mechanics.manaCost &&
        definition.secret.potency === entry.mechanics.potency;
      })();
    const sameIdAbility = state.hero.abilities.find((ability) => ability.id === entry.abilityId);
    const exactOwnedAbility = exactSecretAbility(state, entry);
    const conflictingAbility = sameIdAbility !== undefined && exactOwnedAbility === undefined
      ? sameIdAbility
      : undefined;
    const hasAdmission = state.secretDiscoveryAdmissions.some((admission) => admission.outcomeId === entry.id);
    const reasonValid = entry.disposition === "learned"
      ? ["slot-available", "already-owned", "legacy-confirmed"].includes(entry.reason) &&
        (entry.reason !== "slot-available" || entry.repertoireCount < entry.repertoireLimit)
      : entry.disposition === "deferred-capacity"
        ? entry.reason === "repertoire-full" && entry.repertoireCount >= entry.repertoireLimit &&
          (hasAdmission ? exactOwnedAbility !== undefined : sameIdAbility === undefined)
        : entry.disposition === "rejected" &&
          (entry.reason === "legacy-unresolved" || (entry.reason === "ability-id-conflict" && conflictingAbility !== undefined));
    return (
      entry.id === `${state.seed}:secret-outcome:${entry.monsterId}` &&
      isNonNegativeSafeInteger(entry.recordedTick) && entry.recordedTick <= state.tick &&
      (entry.thresholdTick === null || (
        isNonNegativeSafeInteger(entry.thresholdTick) && entry.thresholdTick <= entry.recordedTick
      )) &&
      (entry.thresholdTick !== null || ["repertoire-full", "legacy-unresolved", "ability-id-conflict"].includes(entry.reason)) &&
      (entry.sourceCombatId === null || (typeof entry.sourceCombatId === "string" && entry.sourceCombatId.length > 0)) &&
      (entry.thresholdTick === null ? entry.sourceCombatId === null : entry.sourceCombatId !== null || entry.reason === "legacy-confirmed") &&
      typeof entry.monsterName === "string" && entry.monsterName.length > 0 &&
      typeof entry.abilityId === "string" && entry.abilityId.length > 0 &&
      typeof entry.abilityName === "string" && entry.abilityName.length > 0 &&
      lore !== undefined && lore.learned &&
      lore.monsterName === entry.monsterName &&
      lore.secretTechniqueId === entry.abilityId &&
      lore.secretTechniqueName === entry.abilityName &&
      isNonNegativeSafeInteger(entry.repertoireCount) &&
      entry.repertoireCount <= maximumAbilities &&
      entry.repertoireLimit === maximumAbilities &&
      mechanicsValid && reasonValid
    );
  });
  if (!validOutcomes) return false;

  const validAdmissions = state.secretDiscoveryAdmissions.every((entry) => {
    const raw: unknown = entry;
    if (!isRecord(raw) || !hasExactKeys(raw, ["id", "tick", "outcomeId", "discoveryId"])) return false;
    const outcome = state.secretDiscoveryOutcomes.find((candidate) => candidate.id === entry.outcomeId);
    const discovery = state.discoveries.find((candidate) => candidate.id === entry.discoveryId);
    return outcome !== undefined && discovery !== undefined && exactSecretAbility(state, outcome) !== undefined &&
      outcome.disposition !== "rejected" &&
      entry.id === `${outcome.id}:admission:${discovery.id}` &&
      isNonNegativeSafeInteger(entry.tick) && entry.tick === discovery.tick &&
      entry.tick >= (outcome.thresholdTick ?? outcome.recordedTick) &&
      discovery.abilityId === outcome.abilityId &&
      discovery.abilityName === outcome.abilityName &&
      discovery.monsterId === outcome.monsterId &&
      discovery.monsterName === outcome.monsterName;
  });
  return validAdmissions &&
    state.secretDiscoveryOutcomes.every((outcome) => {
      const count = state.secretDiscoveryAdmissions.filter((entry) => entry.outcomeId === outcome.id).length;
      return outcome.disposition === "learned" ? count === 1 : outcome.disposition === "rejected" ? count === 0 : count <= 1;
    }) &&
    state.discoveries.every((discovery) =>
      state.secretDiscoveryAdmissions.some((entry) => entry.discoveryId === discovery.id)
    ) &&
    state.hero.monsterLore.every((lore) =>
      lore.learned === state.secretDiscoveryOutcomes.some((entry) => entry.monsterId === lore.monsterId)
    );
}

export function isValidCounterDuelGraph(state: DepthState): boolean {
  if (!Array.isArray(state.completedCounterDuels) || state.completedCounterDuels.length > maximumCompletedCounterDuels) {
    return false;
  }
  const active = state.counterDuel;
  if (active !== null && (
    active.schemaVersion !== 2 ||
    active.outcome !== "ongoing" ||
    !isValidCounterDuel(active, state.seed)
  )) return false;
  if (state.completedCounterDuels.some((duel) =>
    duel.schemaVersion !== 2 ||
    duel.outcome === "ongoing" ||
    !isValidCounterDuel(duel, state.seed)
  )) return false;
  const ids = [active?.id, ...state.completedCounterDuels.map((duel) => duel.id)].filter(
    (id): id is string => id !== undefined,
  );
  return new Set(ids).size === ids.length;
}

function upgradeRuleBoundQuest(value: unknown, seed: string): QuestState {
  try {
    return upgradeQuestObjectiveRules(value, seed);
  } catch (cause) {
    throw new TypeError("Campaign state violates schema invariants", { cause });
  }
}

function upgradeCombat(combat: PreviousCombatState, hero: DetailedHeroState): CombatState {
  const combatants: readonly CombatantState[] = combat.combatants.map((entry) => {
    if (entry.id === hero.id) return { ...entry, speciesId: null, abilities: hero.abilities };
    const definition = monsterDefinitions.find((candidate) => entry.name.startsWith(candidate.name)) ?? monsterDefinitions[0];
    if (definition === undefined) throw new Error("Missing monster definition for migration");
    return {
      ...entry,
      speciesId: definition.id,
      abilities: [monsterAbilityForLevel(definition, hero.level)],
    };
  });
  const log: readonly CombatLogEntry[] = combat.log.map((entry) => {
    const actor = combatants.find((candidate) => candidate.id === entry.actorId);
    return {
      ...entry,
      action: entry.action === "skill" ? "ability" : entry.action,
      targetId: null,
      abilityId: entry.action === "skill" ? actor?.abilities[0]?.id ?? null : null,
      itemId: null,
    };
  });
  return {
    ...combat,
    combatants,
    log,
    eventStream: { schemaVersion: 2, firstRecordedTurn: combat.turn + 1, events: [] },
    threat: createLegacyUnratedThreat(),
  };
}

function upgradeCombatEventStream(combat: PreviousCombatStateVCurrent): CombatState {
  return {
    ...combat,
    eventStream: { schemaVersion: 2, firstRecordedTurn: combat.turn + 1, events: [] },
    threat: createLegacyUnratedThreat(),
  };
}

function upgradeCombatThreat(combat: PreviousCombatStateV13): CombatState {
  return { ...combat, threat: createLegacyUnratedThreat() };
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function withLegacyThreatReceipt(
  combat: CombatState | null,
  completedCombats: readonly CombatState[],
): Pick<DepthState, "legacyUnratedCombatIds" | "combat" | "completedCombats"> {
  return {
    legacyUnratedCombatIds: [
      ...(combat === null ? [] : [combat.id]),
      ...completedCombats.map((entry) => entry.id),
    ].sort(compareIds),
    combat,
    completedCombats,
  };
}

function migrateLegacyCombatThreats(previous: {
  readonly combat: PreviousCombatStateV13 | null;
  readonly completedCombats: readonly PreviousCombatStateV13[];
}): Pick<DepthState, "legacyUnratedCombatIds" | "combat" | "completedCombats"> {
  return withLegacyThreatReceipt(
    previous.combat === null ? null : upgradeCombatThreat(previous.combat),
    previous.completedCombats.map(upgradeCombatThreat),
  );
}

function upgradeAtlas(value: unknown, seed: string): AtlasState {
  if (!isRecord(value) || !Array.isArray(value.locations)) throw new TypeError("Legacy atlas is malformed");
  const previous = value as unknown as PreviousAtlasState;
  const generated = generateAtlas(seed, previous.locations.length, previous.locations.map((location) => location.kind));
  const previousById = new Map(previous.locations.map((location) => [location.id, location]));
  const locations = generated.locations.map((location) => {
    const identity = previousById.get(location.id);
    return identity === undefined
      ? location
      : { ...location, id: identity.id, name: identity.name, kind: identity.kind, danger: identity.danger };
  });
  const currentLocationId = locations.some((location) => location.id === previous.currentLocationId)
    ? previous.currentLocationId
    : generated.currentLocationId;
  const discoveredLocationIds = [...new Set([
    currentLocationId,
    ...previous.discoveredLocationIds.filter((id) => locations.some((location) => location.id === id)),
  ])];
  let atlas: AtlasState = { ...generated, locations, currentLocationId, discoveredLocationIds };
  const oldRoute = previous.route;
  const destinationId = oldRoute?.destinationId;
  if (oldRoute !== null && destinationId !== undefined && destinationId !== currentLocationId && locations.some((location) => location.id === destinationId)) {
    atlas = planRoute(atlas, destinationId);
    const oldFrom = oldRoute.path[oldRoute.legIndex];
    const oldTo = oldRoute.path[oldRoute.legIndex + 1];
    const oldEdge = previous.edges.find((edge) =>
      (edge.from === oldFrom && edge.to === oldTo) || (edge.from === oldTo && edge.to === oldFrom)
    );
    const newFrom = atlas.route?.path[0];
    const newTo = atlas.route?.path[1];
    if (oldEdge !== undefined && oldEdge.distance > 0 && oldRoute.legProgress > 0 && newFrom !== undefined && newTo !== undefined) {
      const newEdge = edgeBetween(atlas, newFrom, newTo);
      if (newEdge.distance > 1) {
        const mappedProgress = Math.max(1, Math.min(newEdge.distance - 1, Math.round((oldRoute.legProgress * newEdge.distance) / oldEdge.distance)));
        atlas = advanceRoute(atlas, mappedProgress);
      }
    }
  }
  return atlas;
}

function upgradeQuest(value: unknown, seed: string): QuestState {
  if (!isRecord(value)) throw new TypeError("Legacy quest is malformed");
  const previous = value as unknown as PreviousQuestState;
  return upgradeRuleBoundQuest({
    ...previous,
    instanceId: `${previous.id}:instance:0`,
    ordinal: 0,
    admittedTick: 0,
    status: previous.status === "complete" ? "ready-to-fulfill" : previous.status,
  }, seed);
}

function migratedQuestLifecycle(quest: unknown, seed: string) {
  return {
    quest: upgradeQuest(quest, seed),
    completedQuests: [] as readonly CompletedQuestSummary[],
    totalCompletedQuests: 0,
    pendingQuestReward: null,
  };
}

function migrateQuestRewards(previous: PreviousDepthStateV10, quest: QuestState): PreviousDepthStateV14 {
  const legacySummaries = previous.completedQuests.map((summary): CompletedQuestSummary => ({
    ...summary,
    reward: { status: "legacy-no-grant" },
  }));
  let completedQuests = legacySummaries;
  let pendingQuestReward: QuestRewardGrant | null = null;
  if (previous.quest.status === "fulfilled") {
    if (previous.combat !== null || previous.counterDuel !== null) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    const latest = legacySummaries.at(-1);
    if (latest === undefined || latest.questInstanceId !== previous.quest.instanceId) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    pendingQuestReward = createQuestRewardGrant(previous.seed, latest, previous.hero.inventory.length, previous.tick);
    completedQuests = [
      ...legacySummaries.slice(0, -1),
      { ...latest, reward: { status: "pending", grant: pendingQuestReward } },
    ];
  }
  return {
    ...previous,
    schemaVersion: 14,
    ...migrateLegacyCombatThreats(previous),
    quest,
    completedQuests,
    pendingQuestReward,
  };
}

function migrateExpandedHeroLevel(value: unknown): DetailedHeroState {
  if (!isRecord(value) || !Number.isSafeInteger(value.experience) || !Number.isSafeInteger(value.level)) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  if (value.level !== legacyHeroLevelForExperience(value.experience as number)) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  const hero = { ...value, level: heroLevelForExperience(value.experience as number) };
  if (!isValidDetailedHeroState(hero)) throw new TypeError("Campaign state violates schema invariants");
  return hero;
}

function migrateLegacyItem(item: unknown, heroId: string): unknown {
  if (!isRecord(item)) return item;
  return {
    ...item,
    restorative: item.id === `${heroId}:item:tonic`
      ? { schemaVersion: 1, kind: "restore-health-quarter-max", target: "self" }
      : null,
  };
}

function migrateWeaponUseItem(item: unknown): unknown {
  if (!isRecord(item)) return item;
  return {
    ...item,
    useMastery: item.kind === "equipment" && item.slot === "weapon" ? createWeaponUseMastery() : null,
  };
}

function migrateLegacyGrant(grant: unknown, heroId: string): unknown {
  return isRecord(grant) ? { ...grant, item: migrateLegacyItem(grant.item, heroId) } : grant;
}

function migrateWeaponUseGrant(grant: unknown): unknown {
  return isRecord(grant) ? { ...grant, item: migrateWeaponUseItem(grant.item) } : grant;
}

function migrateWeaponUseCombat(combat: unknown): unknown {
  return isRecord(combat)
    ? { ...combat, weaponUse: { schemaVersion: 1, tracking: "legacy-untracked" } }
    : combat;
}

function migrateLegacyItems(value: Record<string, unknown>, heroId: string): Record<string, unknown> {
  const hero = isRecord(value.hero) && Array.isArray(value.hero.inventory)
    ? { ...value.hero, inventory: value.hero.inventory.map((item) => migrateLegacyItem(item, heroId)) }
    : value.hero;
  const completedQuests = Array.isArray(value.completedQuests)
    ? value.completedQuests.map((summary) => {
        if (!isRecord(summary) || !isRecord(summary.reward) || summary.reward.status === "legacy-no-grant") return summary;
        return { ...summary, reward: { ...summary.reward, grant: migrateLegacyGrant(summary.reward.grant, heroId) } };
      })
    : value.completedQuests;
  return {
    ...value,
    hero,
    completedQuests,
    pendingQuestReward: value.pendingQuestReward === null
      ? null
      : migrateLegacyGrant(value.pendingQuestReward, heroId),
  };
}

function migrateWeaponUseState(value: Record<string, unknown>): Record<string, unknown> {
  const hero = isRecord(value.hero) && Array.isArray(value.hero.inventory)
    ? { ...value.hero, inventory: value.hero.inventory.map(migrateWeaponUseItem) }
    : value.hero;
  const completedQuests = Array.isArray(value.completedQuests)
    ? value.completedQuests.map((summary) => {
        if (!isRecord(summary) || !isRecord(summary.reward) || summary.reward.status === "legacy-no-grant") return summary;
        return { ...summary, reward: { ...summary.reward, grant: migrateWeaponUseGrant(summary.reward.grant) } };
      })
    : value.completedQuests;
  return {
    ...value,
    hero,
    combat: value.combat === null ? null : migrateWeaponUseCombat(value.combat),
    completedCombats: Array.isArray(value.completedCombats) ? value.completedCombats.map(migrateWeaponUseCombat) : value.completedCombats,
    completedQuests,
    pendingQuestReward: value.pendingQuestReward === null ? null : migrateWeaponUseGrant(value.pendingQuestReward),
  };
}

function migrateCombatStreamV2(combat: CombatState): CombatState {
  return {
    ...combat,
    log: combat.log.map((entry) => ({ ...entry, itemId: null })),
    eventStream: {
      schemaVersion: 2,
      firstRecordedTurn: combat.eventStream.firstRecordedTurn,
      events: combat.eventStream.events.map((event) => event.kind === "intent" ? { ...event, itemId: null } : event),
    },
  };
}

function migrateLegacySecretKnowledge(previous: PreviousDepthStateV17): Pick<DepthState, "secretDiscoveryOutcomes" | "secretDiscoveryAdmissions"> {
  const completedLore = [...previous.hero.monsterLore]
    .filter((lore) => lore.learned)
    .sort((left, right) => left.monsterId < right.monsterId ? -1 : left.monsterId > right.monsterId ? 1 : 0);
  const exactLegacyJoins = completedLore.flatMap((lore) => {
    const abilities = previous.hero.abilities.filter((entry) =>
      entry.id === lore.secretTechniqueId &&
      entry.name === lore.secretTechniqueName &&
      entry.kind === "secret" &&
      entry.sourceMonsterId === lore.monsterId
    );
    const discoveries = previous.discoveries.filter((entry) =>
      entry.abilityId === lore.secretTechniqueId &&
      entry.abilityName === lore.secretTechniqueName &&
      entry.monsterId === lore.monsterId &&
      entry.monsterName === lore.monsterName
    );
    if (abilities.length > 1 || discoveries.length > 1) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    return abilities.length === 1 && discoveries.length === 1
      ? [{ monsterId: lore.monsterId, discovery: discoveries[0]! }]
      : [];
  }).sort((left, right) =>
    left.discovery.tick - right.discovery.tick ||
    (left.discovery.id < right.discovery.id ? -1 : left.discovery.id > right.discovery.id ? 1 : 0)
  );
  const initialRepertoireCount = Math.max(0, previous.hero.abilities.length - exactLegacyJoins.length);
  const outcomes: DepthState["secretDiscoveryOutcomes"][number][] = [];
  const admissions: DepthState["secretDiscoveryAdmissions"][number][] = [];
  for (const lore of completedLore) {
    const definition = monsterDefinitions.find((entry) =>
      entry.id === lore.monsterId &&
      entry.name === lore.monsterName &&
      entry.secret.id === lore.secretTechniqueId &&
      entry.secret.name === lore.secretTechniqueName
    );
    const mechanics = definition === undefined
      ? null
      : {
          effect: definition.secret.effect,
          manaCost: definition.secret.manaCost,
          potency: definition.secret.potency,
        };
    const matchingAbilities = previous.hero.abilities.filter((entry) =>
      entry.id === lore.secretTechniqueId &&
      entry.name === lore.secretTechniqueName &&
      entry.kind === "secret" &&
      entry.sourceMonsterId === lore.monsterId &&
      (mechanics === null || (
        entry.effect === mechanics.effect &&
        entry.manaCost === mechanics.manaCost &&
        entry.potency === mechanics.potency
      ))
    );
    const matchingDiscoveries = previous.discoveries.filter((entry) =>
      entry.abilityId === lore.secretTechniqueId &&
      entry.abilityName === lore.secretTechniqueName &&
      entry.monsterId === lore.monsterId &&
      entry.monsterName === lore.monsterName
    );
    if (matchingAbilities.length > 1 || matchingDiscoveries.length > 1) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    const abilityState = matchingAbilities[0];
    const discovery = matchingDiscoveries[0];
    const exactJoin = abilityState !== undefined && discovery !== undefined && mechanics !== null;
    const conflictingSameId = abilityState === undefined && previous.hero.abilities.some((entry) => entry.id === lore.secretTechniqueId);
    const heldAtKnownCap = !conflictingSameId && abilityState === undefined && discovery === undefined && mechanics !== null && previous.hero.abilities.length >= maximumAbilities;
    const disposition = exactJoin ? "learned" : heldAtKnownCap ? "deferred-capacity" : "rejected";
    const reason = exactJoin
      ? "legacy-confirmed"
      : conflictingSameId && mechanics !== null
        ? "ability-id-conflict"
        : heldAtKnownCap
          ? "repertoire-full"
          : "legacy-unresolved";
    const outcomeId = `${previous.seed}:secret-outcome:${lore.monsterId}`;
    const learnedOrder = exactLegacyJoins.findIndex((entry) => entry.monsterId === lore.monsterId);
    outcomes.push({
      id: outcomeId,
      recordedTick: discovery?.tick ?? previous.tick,
      thresholdTick: discovery?.tick ?? null,
      sourceCombatId: null,
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
      abilityId: lore.secretTechniqueId,
      abilityName: lore.secretTechniqueName,
      mechanics,
      disposition,
      reason,
      repertoireCount: exactJoin
        ? Math.min(maximumAbilities, initialRepertoireCount + Math.max(0, learnedOrder))
        : previous.hero.abilities.length,
      repertoireLimit: maximumAbilities,
    });
    if (exactJoin && discovery !== undefined) {
      admissions.push({
        id: `${outcomeId}:admission:${discovery.id}`,
        tick: discovery.tick,
        outcomeId,
        discoveryId: discovery.id,
      });
    }
  }
  return { secretDiscoveryOutcomes: outcomes, secretDiscoveryAdmissions: admissions };
}

export function upgradeDepthState(value: unknown, seed: string, heroId: string, heroName: string): DepthState {
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion !== 16 && value.schemaVersion !== 17 && value.schemaVersion !== 18 && value.schemaVersion !== 19 && value.schemaVersion !== 20 && value.schemaVersion !== 21) value = migrateLegacyItems(value, heroId);
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion !== 17 && value.schemaVersion !== 18 && value.schemaVersion !== 19 && value.schemaVersion !== 20 && value.schemaVersion !== 21) value = migrateWeaponUseState(value);
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion === 21) {
    const state = value as unknown as DepthState;
    if (
      !isValidDetailedHeroState(value.hero) ||
      !isValidQuestState(value.quest) ||
      !isCanonicalQuestDefinition(value.seed as string, value.quest) ||
      !isValidQuestCompletionState(value.quest, value.completedQuests, value.totalCompletedQuests, value.tick as number) ||
      !isValidQuestRewardState(
        value.seed as string,
        value.hero,
        value.quest,
        value.completedQuests,
        value.pendingQuestReward,
        value.tick as number,
      ) ||
      (value.pendingQuestReward !== null && (value.combat !== null || value.counterDuel !== null)) ||
      !isStructurallyValidHeroGrowthState(value.heroGrowth, value.hero as DetailedHeroState, value.tick as number) ||
      !isValidDepthEncounterThreatState(state) ||
      !isValidSecretDiscoveryGraph(state) ||
      !isValidCounterDuelGraph(state)
      || !isValidCompanionRoster(state.companions)
      || state.companions.explicitKitAfterTick > state.tick
      || !isValidCompanionStateGraph(state)
      || !isValidCompanionReferences(state.companions, state.atlas, state.towns)
    ) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    return value as unknown as DepthState;
  }
  if (value.schemaVersion === 20) {
    const previous = value as unknown as PreviousDepthStateV20;
    if (!isRecord(previous.companions) || !Array.isArray(previous.companions.active) || !Array.isArray(previous.companions.former)) {
      throw new TypeError("Depth companion roster is malformed");
    }
    const companions = {
      schemaVersion: 2 as const,
      kitRulesVersion: "explicit-companion-kit-v1" as const,
      explicitKitAfterTick: previous.tick,
      active: previous.companions.active,
      former: previous.companions.former,
    };
    return upgradeDepthState({ ...previous, schemaVersion: 21, companions }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 19) {
    const previous = value as unknown as PreviousDepthStateV19;
    if (!Array.isArray(previous.completedCounterDuels)) {
      throw new TypeError("Depth counter duel history is malformed");
    }
    return upgradeDepthState({
      ...previous,
      schemaVersion: 20,
      counterDuel: previous.counterDuel === null ? null : upgradeCounterDuel(previous.counterDuel, seed),
      completedCounterDuels: previous.completedCounterDuels.map((duel) => upgradeCounterDuel(duel, seed)),
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 18) {
    const previous = value as unknown as PreviousDepthStateV18;
    const exitTrap = previous.dungeon === null ? null : dungeonTrapAt(previous.dungeon, previous.dungeon.exitCellId);
    const dungeon = previous.dungeon !== null &&
      previous.quest.ordinal > 0 &&
      previous.dungeon.layoutVersion === 2 &&
      (exitTrap === null || exitTrap.phase === "disarmed" || exitTrap.phase === "triggered") &&
      questNeedsShrineDiscovery(previous.quest) &&
      isQuestLeadDungeon(previous.seed, previous.atlas, previous.quest, previous.dungeon.id)
      ? migrateDungeonFarStairShrine(previous.dungeon)
      : previous.dungeon;
    return upgradeDepthState({ ...previous, schemaVersion: 19, dungeon }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 17) {
    const previous = value as unknown as PreviousDepthStateV17;
    return upgradeDepthState({
      ...previous,
      schemaVersion: 18,
      ...migrateLegacySecretKnowledge(previous),
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 16) {
    const previous = value as unknown as PreviousDepthStateV16;
    return upgradeDepthState({ ...previous, schemaVersion: 17 }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 15) {
    const previous = value as unknown as PreviousDepthStateV15;
    return upgradeDepthState({
      ...previous,
      schemaVersion: 16,
      combat: previous.combat === null ? null : migrateCombatStreamV2(previous.combat),
      completedCombats: previous.completedCombats.map(migrateCombatStreamV2),
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 14) {
    const previous = value as unknown as PreviousDepthStateV14;
    if (
      !isValidDetailedHeroState(value.hero) ||
      !isValidQuestState(value.quest) ||
      !isCanonicalQuestDefinition(value.seed as string, value.quest) ||
      !isValidQuestCompletionState(value.quest, value.completedQuests, value.totalCompletedQuests, value.tick as number) ||
      !isValidQuestRewardState(
        value.seed as string,
        value.hero,
        value.quest,
        value.completedQuests,
        value.pendingQuestReward,
        value.tick as number,
      ) ||
      (value.pendingQuestReward !== null && (value.combat !== null || value.counterDuel !== null)) ||
      !isValidDepthEncounterThreatState(previous as unknown as DepthState)
    ) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    return upgradeDepthState({
      ...previous,
      schemaVersion: 15,
      heroGrowth: createHeroGrowthState(previous.hero),
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 13) {
    const previous = value as unknown as PreviousDepthStateV13;
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migrateLegacyCombatThreats(previous),
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion !== 1) value = { ...value, hero: migrateExpandedHeroLevel(value.hero) };
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion === 12) {
    const previous = value as unknown as PreviousDepthStateV12;
    const migrated: PreviousDepthStateV14 = {
      ...previous,
      schemaVersion: 14,
      ...migrateLegacyCombatThreats(previous),
    };
    if (
      !isValidQuestState(migrated.quest) ||
      !isCanonicalQuestDefinition(migrated.seed, migrated.quest) ||
      !isValidQuestCompletionState(migrated.quest, migrated.completedQuests, migrated.totalCompletedQuests, migrated.tick) ||
      !isValidQuestRewardState(
        migrated.seed,
        migrated.hero,
        migrated.quest,
        migrated.completedQuests,
        migrated.pendingQuestReward,
        migrated.tick,
      ) ||
      (migrated.pendingQuestReward !== null && (migrated.combat !== null || migrated.counterDuel !== null))
    ) throw new TypeError("Campaign state violates schema invariants");
    return upgradeDepthState(migrated, seed, heroId, heroName);
  }
  if (value.schemaVersion === 11) {
    const previous = value as unknown as PreviousDepthStateV11;
    const quest = upgradeRuleBoundQuest(previous.quest, previous.seed);
    const migrated: PreviousDepthStateV14 = {
      ...previous,
      schemaVersion: 14,
      ...migrateLegacyCombatThreats(previous),
      quest,
    };
    if (
      !isValidDetailedHeroState(migrated.hero) ||
      !isValidQuestCompletionState(migrated.quest, migrated.completedQuests, migrated.totalCompletedQuests, migrated.tick) ||
      !isValidQuestRewardState(
        migrated.seed,
        migrated.hero,
        migrated.quest,
        migrated.completedQuests,
        migrated.pendingQuestReward,
        migrated.tick,
      ) ||
      (migrated.pendingQuestReward !== null && (migrated.combat !== null || migrated.counterDuel !== null))
    ) throw new TypeError("Campaign state violates schema invariants");
    return upgradeDepthState(migrated, seed, heroId, heroName);
  }
  if (value.schemaVersion === 10) {
    const previous = value as unknown as PreviousDepthStateV10;
    const quest = upgradeRuleBoundQuest(previous.quest, previous.seed);
    const summaries = Array.isArray(previous.completedQuests)
      ? previous.completedQuests.map((summary) => ({ ...summary, reward: { status: "legacy-no-grant" as const } }))
      : previous.completedQuests;
    if (
      !isValidDetailedHeroState(previous.hero) ||
      !isValidQuestState(quest) ||
      !isCanonicalQuestDefinition(previous.seed, quest) ||
      !isValidQuestCompletionState(quest, summaries, previous.totalCompletedQuests, previous.tick)
    ) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    return upgradeDepthState(migrateQuestRewards(previous, quest), seed, heroId, heroName);
  }
  if (value.schemaVersion === 9) {
    const previous = value as unknown as PreviousDepthStateV9;
    if (!isValidDetailedHeroState(previous.hero)) throw new TypeError("Campaign state violates schema invariants");
    return upgradeDepthState({ ...previous, schemaVersion: 14, ...migrateLegacyCombatThreats(previous), ...migratedQuestLifecycle(previous.quest, seed) }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 8) {
    const previous = value as unknown as PreviousDepthStateV8;
    return upgradeDepthState({ ...previous, schemaVersion: 14, ...migrateLegacyCombatThreats(previous), companions: createEmptyCompanionRoster(), ...migratedQuestLifecycle(previous.quest, seed) }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 7) {
    const previous = value as unknown as PreviousDepthStateV7;
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migrateLegacyCombatThreats(previous),
      ...migratedQuestLifecycle(previous.quest, seed),
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : { ...previous.dungeon, latestShrineUse: null },
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 6) {
    const previous = value as unknown as PreviousDepthStateV6;
    const migratedCombat = previous.combat === null ? null : upgradeCombatEventStream(previous.combat);
    const migratedCompletedCombats = previous.completedCombats.map(upgradeCombatEventStream);
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migratedQuestLifecycle(previous.quest, seed),
      ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : { ...previous.dungeon, latestShrineUse: null },
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 5) {
    const previous = value as unknown as PreviousDepthStateV5;
    const migratedCombat = previous.combat === null ? null : upgradeCombatEventStream(previous.combat);
    const migratedCompletedCombats = previous.completedCombats.map(upgradeCombatEventStream);
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migratedQuestLifecycle(previous.quest, seed),
      ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null
        ? null
        : { ...previous.dungeon, layoutVersion: 1, keyGate: null, latestShrineUse: null },
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 4) {
    const previous = value as unknown as PreviousDepthStateV4;
    const migratedCombat = previous.combat === null ? null : upgradeCombatEventStream(previous.combat);
    const migratedCompletedCombats = previous.completedCombats.map(upgradeCombatEventStream);
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migratedQuestLifecycle(previous.quest, seed),
      ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null
        ? null
        : { ...previous.dungeon, layoutVersion: 1, keyGate: null, latestShrineUse: null },
      counterDuel: null,
      completedCounterDuels: [],
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 3) {
    const previous = value as unknown as PreviousDepthStateV3;
    const migratedCombat = previous.combat === null ? null : upgradeCombatEventStream(previous.combat);
    const migratedCompletedCombats = previous.completedCombats.map(upgradeCombatEventStream);
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migratedQuestLifecycle(previous.quest, seed),
      ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
      counterDuel: null,
      completedCounterDuels: [],
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion === 2) {
    const previous = value as unknown as PreviousDepthStateV2;
    const migratedCombat = previous.combat === null ? null : upgradeCombatEventStream(previous.combat);
    const migratedCompletedCombats = previous.completedCombats.map(upgradeCombatEventStream);
    return upgradeDepthState({
      ...previous,
      schemaVersion: 14,
      ...migratedQuestLifecycle(previous.quest, seed),
      ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
      companions: createEmptyCompanionRoster(),
      seed,
      atlas: upgradeAtlas(previous.atlas, seed),
      dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
      counterDuel: null,
      completedCounterDuels: [],
    }, seed, heroId, heroName);
  }
  if (value.schemaVersion !== 1 || !isRecord(value.hero)) throw new RangeError("Unsupported depth schema version");
  const previous = value as unknown as PreviousDepthState;
  if (!Array.isArray(previous.completedCombats) || !Array.isArray(previous.log)) {
    throw new TypeError("Depth state collections are malformed");
  }
  if (previous.hero.level !== legacyHeroLevelForExperience(previous.hero.experience)) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  const hero: DetailedHeroState = {
    ...previous.hero,
    level: heroLevelForExperience(previous.hero.experience),
    abilities: starterAbilities(seed, heroId, previous.hero.className),
    monsterLore: [],
  };
  const migratedCombat = previous.combat === null ? null : upgradeCombat(previous.combat, hero);
  const migratedCompletedCombats = previous.completedCombats.map((combat) => upgradeCombat(combat, hero));
  return upgradeDepthState({
    ...previous,
    schemaVersion: 14,
    ...migratedQuestLifecycle(previous.quest, seed),
    companions: createEmptyCompanionRoster(),
    seed,
    atlas: upgradeAtlas(previous.atlas, seed),
    dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
    hero,
    ...withLegacyThreatReceipt(migratedCombat, migratedCompletedCombats),
    counterDuel: null,
    completedCounterDuels: [],
    discoveries: [],
    log: previous.log.length > 0
      ? previous.log
      : [{ id: `${seed}:depth:${previous.tick}:world`, tick: previous.tick, category: "world", message: `${heroName}'s adventure continues.` }],
  }, seed, heroId, heroName);
}

function appendLog(state: DepthState, category: DepthLogEntry["category"], message: string): DepthState {
  const entry: DepthLogEntry = { id: `${state.seed}:depth:${state.tick}:${category}`, tick: state.tick, category, message };
  return { ...state, log: [...state.log.slice(-(maximumDepthLogEntries - 1)), entry] };
}

function syncHeroFromCombat(hero: DetailedHeroState, combatHero: { health: number; mana: number } | undefined): DetailedHeroState {
  if (combatHero === undefined) return hero;
  const detailed = combatHero as { health: number; mana: number; abilities?: DetailedHeroState["abilities"] };
  return {
    ...hero,
    resources: { ...hero.resources, health: combatHero.health, mana: combatHero.mana },
    abilities: detailed.abilities ?? hero.abilities,
  };
}

function dungeonQuestBinding(
  seed: string,
  atlas: AtlasState,
  quest: QuestState,
  dungeonId: string,
): "unbound" | "quest-lead" {
  return quest.ordinal > 0 && isQuestLeadDungeon(seed, atlas, quest, dungeonId)
    ? "quest-lead"
    : "unbound";
}

export interface DungeonEntryPlan {
  dungeonId: string;
  locationId: string;
  width: 7;
  height: 7;
  layoutVersion: 2 | 3;
  landmark: "none" | "far-stair-shrine";
}

export function selectDungeonEntryPlan(state: DepthState): DungeonEntryPlan | null {
  if (
    state.atlas.route !== null ||
    (state.dungeon !== null && !state.dungeon.completed) ||
    (state.combat !== null && state.combat.outcome === "ongoing") ||
    state.counterDuel !== null ||
    state.companions.active.length > 0 ||
    state.pendingQuestReward !== null
  ) return null;
  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  if (location?.kind !== "dungeon") return null;
  const dungeonId = dungeonExpeditionId(state, location.id);
  if (state.dungeon?.id === dungeonId) return null;
  const questLead = state.quest.ordinal > 0 && isQuestLeadDungeon(state.seed, state.atlas, state.quest, dungeonId);
  return {
    dungeonId,
    locationId: location.id,
    width: 7,
    height: 7,
    layoutVersion: questLead ? 3 : 2,
    landmark: questLead ? "far-stair-shrine" : "none",
  };
}

function canInvokeMigratedFarShrine(state: DepthState): boolean {
  const dungeon = state.dungeon;
  const lead = projectSuccessorQuestLead(state.seed, state.atlas, state.quest);
  if (
    dungeon === null || dungeon.layoutVersion !== 3 || !dungeon.completed ||
    dungeon.currentCellId !== dungeon.exitCellId || !dungeon.visitedCellIds.includes(dungeon.exitCellId) ||
    dungeon.cells.find((cell) => cell.id === dungeon.exitCellId)?.feature !== "shrine" ||
    dungeon.latestShrineUse?.cellId === dungeon.exitCellId || state.quest.ordinal === 0 || !questNeedsShrineDiscovery(state.quest) ||
    lead === null || state.atlas.currentLocationId !== lead.locationId || state.atlas.route !== null ||
    state.combat !== null || state.counterDuel !== null || state.companions.active.length > 0 ||
    state.pendingQuestReward !== null
  ) return false;
  return isQuestLeadDungeon(state.seed, state.atlas, state.quest, dungeon.id);
}

function canResolveReleasedFarShrine(state: DepthState, dungeon: DungeonState): boolean {
  const trap = dungeonTrapAt(dungeon, dungeon.exitCellId);
  const lead = projectSuccessorQuestLead(state.seed, state.atlas, state.quest);
  return dungeon.layoutVersion === 2 && !dungeon.completed && dungeon.currentCellId === dungeon.exitCellId &&
    trap !== null && (trap.phase === "disarmed" || trap.phase === "triggered") &&
    state.quest.ordinal > 0 && questNeedsShrineDiscovery(state.quest) && lead !== null &&
    state.atlas.currentLocationId === lead.locationId &&
    isQuestLeadDungeon(state.seed, state.atlas, state.quest, dungeon.id);
}

function applyDungeonTrap(hero: DetailedHeroState, trap: DungeonTrapConsequence | null): DetailedHeroState {
  if (trap === null) return hero;
  return {
    ...hero,
    resources: { ...hero.resources, health: trap.healthAfter },
  };
}

function dungeonTrapMessage(
  hero: DetailedHeroState,
  dungeonName: string,
  trap: DungeonTrapConsequence,
  completed: boolean,
): string {
  const result = trap.healthAfter === 0
    ? `The marked trap in ${dungeonName} knocks ${hero.name} down — 0/${hero.resources.maxHealth} HP.`
    : `The marked trap in ${dungeonName} catches ${hero.name} for ${trap.damage} HP — ${trap.healthAfter}/${hero.resources.maxHealth} remains.`;
  return completed ? `${result} The far stair is reached.` : result;
}

function dungeonTrapAptitudes(hero: DetailedHeroState) {
  return {
    agility: effectiveAttribute(hero, "agility"),
    intellect: effectiveAttribute(hero, "intellect"),
    spirit: effectiveAttribute(hero, "spirit"),
    level: heroMechanicalLevel(hero.level),
  };
}

function completeResolvedDungeonExit(dungeon: DungeonState): DungeonState {
  return dungeon.currentCellId === dungeon.exitCellId ? { ...dungeon, completed: true } : dungeon;
}

function appendDungeonTraversalMessage(dungeon: DungeonState, message: string): DungeonState {
  return { ...dungeon, traversalLog: [...dungeon.traversalLog.slice(-63), message] };
}

function useDungeonShrine(
  dungeon: DungeonState,
  hero: DetailedHeroState,
  cellId: string,
  tick: number,
): { dungeon: DungeonState; hero: DetailedHeroState; use: DungeonShrineUse } {
  const healthBefore = hero.resources.health;
  const manaBefore = hero.resources.mana;
  const healthAfter = Math.min(hero.resources.maxHealth, healthBefore + Math.max(1, Math.ceil(hero.resources.maxHealth / 2)));
  const manaAfter = Math.min(hero.resources.maxMana, manaBefore + Math.max(1, Math.ceil(hero.resources.maxMana / 2)));
  const use: DungeonShrineUse = {
    dungeonId: dungeon.id,
    cellId,
    tick,
    healthBefore,
    healthRestored: healthAfter - healthBefore,
    healthAfter,
    manaBefore,
    manaRestored: manaAfter - manaBefore,
    manaAfter,
  };
  return {
    dungeon: { ...dungeon, latestShrineUse: use },
    hero: {
      ...hero,
      resources: { ...hero.resources, health: healthAfter, mana: manaAfter },
    },
    use,
  };
}

function dungeonShrineMessage(heroName: string, use: DungeonShrineUse): string {
  return `${heroName} invokes the shrine: ${describeDungeonShrineUse(use)}.`;
}

export function createDepthState(seed: string, heroId = "depth:hero", heroName = "Aster Vale"): DepthState {
  const atlas = generateAtlas(seed);
  const initialTown = visitTown(generateTown(seed, atlas.currentLocationId));
  const hero = createHero(seed, heroId, heroName);
  return {
    schemaVersion: 21,
    seed,
    tick: 0,
    atlas,
    towns: { [atlas.currentLocationId]: initialTown },
    companions: createEmptyCompanionRoster(),
    dungeon: null,
    hero,
    heroGrowth: createHeroGrowthState(hero),
    quest: createQuest(seed),
    completedQuests: [],
    totalCompletedQuests: 0,
    pendingQuestReward: null,
    legacyUnratedCombatIds: [],
    combat: null,
    completedCombats: [],
    counterDuel: null,
    completedCounterDuels: [],
    secretDiscoveryOutcomes: [],
    secretDiscoveryAdmissions: [],
    discoveries: [],
    log: [{ id: `${seed}:depth:0:world`, tick: 0, category: "world", message: `${heroName} begins in ${initialTown.name}.` }],
  };
}

export function selectTonicRestock(state: DepthState): TonicRestockPlan | null {
  if (
    state.quest.status !== "active" ||
    state.pendingQuestReward !== null ||
    state.combat !== null ||
    state.counterDuel !== null ||
    state.atlas.route !== null ||
    (state.dungeon !== null && !state.dungeon.completed) ||
    state.companions.active.length > 0 ||
    state.hero.resources.health <= 0 ||
    state.discoveries.at(-1)?.tick === state.tick ||
    heldSecretAdmissionCandidate(state) !== undefined ||
    (state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0)
  ) return null;

  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  const town = location?.kind === "town" ? state.towns[location.id] : undefined;
  if (town === undefined || town.visits < 1) return null;

  const itemId = emberTonicId(state.hero.id);
  const stack = state.hero.inventory.find((item) => item.id === itemId);
  if (stack !== undefined && !isCanonicalEmberTonic(stack, state.hero.id)) return null;
  if (stack === undefined && state.hero.inventory.length >= inventoryCapacity) return null;

  const quantityBefore = stack?.quantity ?? 0;
  const affordable = Math.floor(state.hero.gold / emberTonicUnitPrice);
  const quantityBought = Math.min(emberTonicTargetQuantity - quantityBefore, affordable);
  if (quantityBought < 1) return null;
  const goldSpent = quantityBought * emberTonicUnitPrice;
  return {
    schemaVersion: 1,
    townId: town.id,
    townName: town.name,
    itemId,
    itemName: "Ember Tonic",
    quantityBefore,
    quantityBought,
    quantityAfter: quantityBefore + quantityBought,
    goldBefore: state.hero.gold,
    unitPrice: emberTonicUnitPrice,
    goldSpent,
    goldAfter: state.hero.gold - goldSpent,
    disposition: stack === undefined ? "recreated" : "incremented",
  };
}

function reduceDepth(input: DepthState, command: DepthCommand): DepthState {
  const resolvingActiveEncounter = input.combat !== null
    ? command.type === "combat-action"
    : input.counterDuel !== null && command.type === "counter-duel-action";
  if (input.quest.status === "ready-to-fulfill" && command.type !== "fulfill-quest" && !resolvingActiveEncounter) {
    throw new Error("The completed quest must be fulfilled before another command");
  }
  if (input.pendingQuestReward !== null && command.type !== "apply-quest-reward") {
    throw new Error("The pending quest reward must be applied before another command");
  }
  if (
    input.quest.status === "fulfilled" && input.pendingQuestReward === null &&
    command.type !== "admit-successor-quest" && !resolvingActiveEncounter
  ) {
    throw new Error("The next quest must be admitted before another command");
  }
  let state: DepthState = { ...input, tick: input.tick + 1 };
  switch (command.type) {
    case "recruit-companion": {
      if (state.companions.active.length > 0 || state.companions.former.length > 0) {
        throw new Error("This campaign has already resolved its first Shared Road Oath");
      }
      const town = state.towns[state.atlas.currentLocationId];
      if (town === undefined) throw new Error("A companion can join only in a visited town");
      const companion = selectSharedRoadCompanion({
        seed: state.seed,
        atlas: state.atlas,
        town,
        roster: state.companions,
        joinedTick: state.tick,
        heroLevel: heroMechanicalLevel(state.hero.level),
      });
      if (
        companion === null ||
        companion.identity.residentId !== command.residentId ||
        companion.destination.locationId !== command.destinationId
      ) throw new Error("Shared Road Oath selection is not canonical");
      const companions = addActiveCompanion(state.companions, companion);
      return appendLog(
        { ...state, companions },
        "town",
        `${companion.identity.name}, ${companion.identity.role} of ${town.name}, swears to share the road to ${companion.destination.name}.`,
      );
    }
    case "farewell-companion": {
      const companion = state.companions.active[0];
      if (companion === undefined || companion.identity.residentId !== command.residentId) {
        throw new Error("The named road companion is not active");
      }
      const companions = retireActiveCompanionAtDestination(state.companions, {
        tick: state.tick,
        locationId: state.atlas.currentLocationId,
      });
      const departed = companions.former.at(-1);
      if (departed === undefined) throw new Error("Shared Road Oath produced no farewell record");
      const result = departed.departure.outcome === "injured"
        ? `${departed.identity.name} reaches ${departed.destination.name} wounded but alive`
        : `${departed.identity.name} reaches ${departed.destination.name} safely`;
      const road = departed.victories === 0
        ? "the road was quiet"
        : `${departed.victories} shared ${departed.victories === 1 ? "victory" : "victories"}`;
      return appendLog(
        { ...state, companions },
        "town",
        `${result}; ${road}, bond ${departed.bond}. The companions exchange farewells.`,
      );
    }
    case "plan-route": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Cannot plan a route during combat");
      if (state.atlas.route !== null) throw new Error("An active route cannot be replaced");
      const activeCompanion = state.companions.active[0];
      if (activeCompanion?.phase === "arrived") {
        throw new Error("A completed Shared Road Oath must be closed before planning another route");
      }
      if (activeCompanion !== undefined && command.destinationId !== activeCompanion.destination.locationId) {
        throw new Error("A Shared Road Oath owns the next destination");
      }
      state = { ...state, atlas: planRoute(state.atlas, command.destinationId) };
      const destination = state.atlas.locations.find((location) => location.id === command.destinationId);
      return appendLog(state, "world", `A route is plotted to ${destination?.name ?? command.destinationId}.`);
    }
    case "travel": {
      const before = state.atlas.currentLocationId;
      const routeBefore = state.atlas.route;
      const travelled = routeBefore === null
        ? 0
        : Math.min(command.distance, Math.max(0, routeBefore.totalDistance - routeBefore.distanceTravelled));
      const atlas = advanceRoute(state.atlas, command.distance);
      const active = state.companions.active[0];
      const companions = active === undefined
        ? state.companions
        : {
            ...state.companions,
            active: [{
              ...active,
              phase: atlas.route === null && atlas.currentLocationId === active.destination.locationId
                ? "arrived" as const
                : active.phase,
              bond: Math.min(100, active.bond + (travelled > 0 ? 1 : 0)),
            }],
          };
      state = { ...state, atlas, companions };
      const arrived = before !== state.atlas.currentLocationId;
      const lead = projectSuccessorQuestLead(state.seed, state.atlas, state.quest);
      const reachedLead = arrived &&
        lead !== null &&
        routeBefore?.destinationId === lead.locationId &&
        state.atlas.route === null &&
        state.atlas.currentLocationId === lead.locationId;
      return appendLog(
        state,
        "world",
        arrived
          ? reachedLead && lead !== null
            ? `The party reaches ${lead.locationName}, the marked lead for ${state.quest.title}.`
            : `The party reaches ${state.atlas.currentLocationId}.`
          : "The party advances along the route.",
      );
    }
    case "visit-town": {
      const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
      if (location?.kind !== "town") throw new Error("Current location is not a town");
      const existing = state.towns[location.id] ?? generateTown(state.seed, location.id);
      const town = visitTown(existing);
      const firstVisit = existing.visits === 0;
      state = {
        ...state,
        towns: { ...state.towns, [location.id]: town },
        quest: firstVisit
          ? applyQuestProgressFact(state.quest, {
              schemaVersion: 1,
              kind: "location-first-visited",
              locationId: location.id,
              locationKind: "town",
            })
          : state.quest,
      };
      return appendLog(state, "town", `${town.name} opens its ${town.districts.length} districts to the party.`);
    }
    case "restock-tonic": {
      const plan = selectTonicRestock(input);
      if (plan === null || plan.itemId !== command.itemId) {
        throw new Error("Ember Tonic restock is unavailable");
      }
      const stack = state.hero.inventory.find((item) => item.id === plan.itemId);
      const inventory = stack === undefined
        ? [...state.hero.inventory, createEmberTonic(state.hero.id, plan.quantityAfter)]
        : state.hero.inventory.map((item) => item.id === stack.id
            ? { ...item, quantity: plan.quantityAfter }
            : item);
      const hero = { ...state.hero, gold: plan.goldAfter, inventory };
      return appendLog(
        { ...state, hero },
        "item",
        `${plan.itemName} ×${plan.quantityBefore}→×${plan.quantityAfter} (+${plan.quantityBought}) · gold ${plan.goldBefore}→${plan.goldAfter} · ${plan.unitPrice} gold each`,
      );
    }
    case "enter-dungeon": {
      const plan = selectDungeonEntryPlan(input);
      if (
        plan === null || command.dungeonId !== plan.dungeonId ||
        command.width !== plan.width || command.height !== plan.height
      ) throw new Error("Dungeon entry does not match the canonical expedition plan");
      let dungeon = generateDungeon(state.seed, plan.dungeonId, plan.width, plan.height, true, plan.layoutVersion);
      const entry = dungeon.cells.find((cell) => cell.id === dungeon.entryCellId);
      const entryTrap = dungeonTrapAt(dungeon, dungeon.entryCellId);
      let hero = state.hero;
      let quest = state.quest;
      let message = `${dungeon.name} reveals a ${dungeon.width}×${dungeon.height} maze.${plan.landmark === "far-stair-shrine" ? " Expedition landmark: a shrine waits at the far stair; its exact chamber remains unknown." : ""}`;
      if (entry?.feature === "shrine") {
        const restored = useDungeonShrine(dungeon, hero, entry.id, state.tick);
        dungeon = restored.dungeon;
        hero = restored.hero;
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "dungeon-feature-discovered",
          dungeonId: dungeon.id,
          locationId: state.atlas.currentLocationId,
          cellId: entry.id,
          feature: "shrine",
          binding: dungeonQuestBinding(state.seed, state.atlas, quest, dungeon.id),
        });
        message = `${message} ${dungeonShrineMessage(hero.name, restored.use)}`;
        dungeon = appendDungeonTraversalMessage(dungeon, message);
      } else if (entryTrap?.phase === "hidden") {
        const check = resolveDungeonTrapCheck(dungeon, entryTrap.cellId, "detect", dungeonTrapAptitudes(hero), state.seed);
        if (check.success) {
          dungeon = withDungeonTrapPhase(dungeon, entryTrap.cellId, "detected");
          message = `${hero.name} spots a ${dungeonTrapKindLabel(check.kind)} at the threshold — ${check.attribute} ${check.total} meets concealment ${check.difficulty}. It must be disarmed.`;
        } else {
          const consequence = resolveDungeonTrap(dungeon, entryTrap.cellId, true, hero.resources.health, hero.resources.maxHealth);
          dungeon = withDungeonTrapPhase(dungeon, entryTrap.cellId, "triggered");
          hero = applyDungeonTrap(hero, consequence);
          message = consequence === null
            ? `${dungeonTrapKindLabel(check.kind)} fails harmlessly at the threshold.`
            : `${dungeonTrapKindLabel(check.kind)} escapes notice (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, consequence, false)}`;
        }
        dungeon = appendDungeonTraversalMessage(dungeon, message);
      }
      return appendLog({ ...state, dungeon, hero, quest }, "dungeon", message);
    }
    case "invoke-dungeon-shrine": {
      const dungeon = state.dungeon;
      if (
        dungeon === null || command.dungeonId !== dungeon.id || command.cellId !== dungeon.exitCellId ||
        !canInvokeMigratedFarShrine(input)
      ) throw new Error("The migrated far-stair shrine is unavailable");
      const restored = useDungeonShrine(dungeon, state.hero, dungeon.exitCellId, state.tick);
      const quest = applyQuestProgressFact(state.quest, {
        schemaVersion: 1,
        kind: "dungeon-feature-discovered",
        dungeonId: dungeon.id,
        locationId: state.atlas.currentLocationId,
        cellId: dungeon.exitCellId,
        feature: "shrine",
        binding: "quest-lead",
      });
      const message = `${dungeonShrineMessage(restored.hero.name, restored.use)} The released expedition's far-stair landmark is now recorded.`;
      return appendLog({
        ...state,
        dungeon: appendDungeonTraversalMessage(restored.dungeon, message),
        hero: restored.hero,
        quest,
      }, "dungeon", message);
    }
    case "move-dungeon": {
      if (state.dungeon === null) throw new Error("No dungeon traversal is active");
      if (dungeonTrapAt(state.dungeon, state.dungeon.currentCellId)?.phase === "detected") {
        throw new Error("The detected dungeon trap must be disarmed before moving");
      }
      const traversal = projectDungeonTraversal(state.dungeon);
      const keyPhaseBefore = state.dungeon.keyGate?.phase ?? null;
      if (!traversal.options.includes(command.direction)) throw new Error(`The ${command.direction} passage is outside the current traversal plan`);
      let dungeon = moveDungeon(state.dungeon, command.direction);
      let quest = state.quest;
      let hero = state.hero;
      const current = dungeon.cells.find((cell) => cell.id === dungeon.currentCellId);
      const firstVisit = current !== undefined && !state.dungeon.visitedCellIds.includes(current.id);
      let shrineUse: DungeonShrineUse | null = null;
      if (current?.feature === "shrine" && firstVisit) {
        const restored = useDungeonShrine(dungeon, hero, current.id, state.tick);
        dungeon = restored.dungeon;
        hero = restored.hero;
        shrineUse = restored.use;
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "dungeon-feature-discovered",
          dungeonId: dungeon.id,
          locationId: state.atlas.currentLocationId,
          cellId: current.id,
          feature: "shrine",
          binding: dungeonQuestBinding(state.seed, state.atlas, quest, dungeon.id),
        });
      }
      if (current?.feature === "treasure" && firstVisit) {
        const before = hero.inventory.length;
        const loot = generateLoot(state.seed, current.id);
        if (!hero.inventory.some((item) => item.id === loot.id)) hero = addItem(hero, loot);
        if (hero.inventory.length > before) {
          quest = applyQuestProgressFact(quest, {
            schemaVersion: 1,
            kind: "item-acquired",
            itemId: loot.id,
            sourceId: current.id,
            disposition: "inventory",
          });
        }
      }
      const currentTrap = current === undefined ? null : dungeonTrapAt(dungeon, current.id);
      let trap: DungeonTrapConsequence | null = null;
      let check: DungeonTrapCheck | null = null;
      if (firstVisit && currentTrap?.phase === "hidden") {
        check = resolveDungeonTrapCheck(dungeon, currentTrap.cellId, "detect", dungeonTrapAptitudes(hero), state.seed);
        if (check.success) {
          dungeon = withDungeonTrapPhase(dungeon, currentTrap.cellId, "detected");
        } else {
          trap = resolveDungeonTrap(dungeon, currentTrap.cellId, true, hero.resources.health, hero.resources.maxHealth);
          dungeon = withDungeonTrapPhase(dungeon, currentTrap.cellId, "triggered");
          hero = applyDungeonTrap(hero, trap);
        }
      }
      if (canResolveReleasedFarShrine(state, dungeon)) {
        dungeon = migrateDungeonFarStairShrine(dungeon);
        const restored = useDungeonShrine(dungeon, hero, dungeon.exitCellId, state.tick);
        dungeon = restored.dungeon;
        hero = restored.hero;
        shrineUse = restored.use;
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "dungeon-feature-discovered",
          dungeonId: dungeon.id,
          locationId: state.atlas.currentLocationId,
          cellId: dungeon.exitCellId,
          feature: "shrine",
          binding: "quest-lead",
        });
      }
      const resolvedCurrentTrap = dungeonTrapAt(dungeon, dungeon.currentCellId);
      if (
        dungeon.currentCellId === dungeon.exitCellId &&
        (resolvedCurrentTrap === null || resolvedCurrentTrap.phase === "disarmed" || resolvedCurrentTrap.phase === "triggered")
      ) dungeon = completeResolvedDungeonExit(dungeon);
      if (dungeon.completed && !state.dungeon.completed) {
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "dungeon-completed",
          dungeonId: dungeon.id,
          locationId: state.atlas.currentLocationId,
          binding: dungeonQuestBinding(state.seed, state.atlas, quest, dungeon.id),
        });
      }
      const keyFound = keyPhaseBefore === "uncollected" && dungeon.keyGate?.phase === "carried";
      const crossedShortcut = keyPhaseBefore === "open"
        && state.dungeon.keyGate !== null
        && ((state.dungeon.currentCellId === state.dungeon.keyGate.unlockCellId && dungeon.currentCellId === state.dungeon.keyGate.shortcutCellId)
          || (state.dungeon.currentCellId === state.dungeon.keyGate.shortcutCellId && dungeon.currentCellId === state.dungeon.keyGate.unlockCellId));
      const message = check?.success === true
        ? `${hero.name} spots a ${dungeonTrapKindLabel(check.kind)} before it springs — ${check.attribute} ${check.total} meets concealment ${check.difficulty}. It must be disarmed.`
        : trap !== null && check !== null
          ? `${dungeonTrapKindLabel(check.kind)} escapes notice (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, trap, shrineUse === null && dungeon.completed)}${shrineUse === null ? "" : ` ${dungeonShrineMessage(hero.name, shrineUse)} The far stair of ${dungeon.name} is reached.`}`
        : currentTrap?.phase === "detected"
          ? `${hero.name} reaches the known marked trap. It must be disarmed before the maze can continue.`
        : keyFound
          ? `${hero.name} finds the ${dungeonKeyName}. Its amber teeth point back toward a sealed shortcut.`
        : crossedShortcut
          ? `${hero.name} crosses the opened Wayfinder Gate, cutting across the maze.${dungeon.completed ? ` The far stair of ${dungeon.name} is reached.` : ""}`
        : shrineUse !== null
          ? `${dungeonShrineMessage(hero.name, shrineUse)}${dungeon.completed ? ` The far stair of ${dungeon.name} is reached.` : ""}`
        : dungeon.completed
          ? `The far stair of ${dungeon.name} is reached.`
          : traversal.mode === "retrace"
            ? `The mapped way ${command.direction} retraces toward the nearest unexplored passage.`
            : `An unexplored passage opens ${command.direction}.`;
      const loggedDungeon = trap === null && check === null && currentTrap?.phase !== "detected" && shrineUse === null
        ? dungeon
        : appendDungeonTraversalMessage(dungeon, message);
      return appendLog({ ...state, dungeon: loggedDungeon, hero, quest }, "dungeon", message);
    }
    case "unlock-dungeon-gate": {
      if (state.dungeon === null || state.dungeon.completed) throw new Error("No active dungeon gate can be unlocked");
      if (dungeonTrapAt(state.dungeon, state.dungeon.currentCellId)?.phase === "detected") {
        throw new Error("The detected dungeon trap must be disarmed before unlocking the gate");
      }
      if (!canUnlockDungeonGate(state.dungeon)) throw new Error("The Wayfinder Gate cannot be unlocked here without its key");
      const message = `${state.hero.name} turns the ${dungeonKeyName}. Amber wards retract: the Wayfinder Gate is open.`;
      const dungeon = appendDungeonTraversalMessage(unlockDungeonGate(state.dungeon), message);
      return appendLog({ ...state, dungeon }, "dungeon", message);
    }
    case "disarm-dungeon-trap": {
      if (state.dungeon === null || state.dungeon.completed) throw new Error("No active dungeon trap can be disarmed");
      const currentTrap = dungeonTrapAt(state.dungeon, state.dungeon.currentCellId);
      if (currentTrap?.phase !== "detected") throw new Error("There is no detected current trap to disarm");
      const check = resolveDungeonTrapCheck(state.dungeon, currentTrap.cellId, "disarm", dungeonTrapAptitudes(state.hero), state.seed);
      let dungeon = withDungeonTrapPhase(state.dungeon, currentTrap.cellId, check.success ? "disarmed" : "triggered");
      let hero = state.hero;
      let quest = state.quest;
      let consequence: DungeonTrapConsequence | null = null;
      let shrineUse: DungeonShrineUse | null = null;
      if (!check.success) {
        consequence = resolveDungeonTrap(state.dungeon, currentTrap.cellId, true, hero.resources.health, hero.resources.maxHealth);
        hero = applyDungeonTrap(hero, consequence);
      }
      if (canResolveReleasedFarShrine(state, dungeon)) {
        dungeon = migrateDungeonFarStairShrine(dungeon);
        const restored = useDungeonShrine(dungeon, hero, dungeon.exitCellId, state.tick);
        dungeon = restored.dungeon;
        hero = restored.hero;
        shrineUse = restored.use;
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "dungeon-feature-discovered",
          dungeonId: dungeon.id,
          locationId: state.atlas.currentLocationId,
          cellId: dungeon.exitCellId,
          feature: "shrine",
          binding: "quest-lead",
        });
      }
      dungeon = completeResolvedDungeonExit(dungeon);
      const trapMessage = check.success
        ? `${hero.name} unthreads the ${dungeonTrapKindLabel(check.kind)} — ${check.attribute} ${check.total} meets mechanism ${check.difficulty}. The marked trap is disarmed.${dungeon.completed ? " The far stair is reached." : ""}`
        : consequence === null
          ? `The ${dungeonTrapKindLabel(check.kind)} resists, but fails harmlessly.`
          : `${hero.name}'s disarm fails (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, consequence, dungeon.completed)}`;
      const message = shrineUse === null
        ? trapMessage
        : `${check.success
            ? `${hero.name} unthreads the ${dungeonTrapKindLabel(check.kind)} — ${check.attribute} ${check.total} meets mechanism ${check.difficulty}. The marked trap is disarmed.`
            : consequence === null
              ? `The ${dungeonTrapKindLabel(check.kind)} resists, but fails harmlessly.`
              : `${hero.name}'s disarm fails (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, consequence, false)}`
          } ${dungeonShrineMessage(hero.name, shrineUse)} The far stair of ${dungeon.name} is reached.`;
      dungeon = appendDungeonTraversalMessage(dungeon, message);
      quest = dungeon.completed && !state.dungeon.completed
        ? applyQuestProgressFact(quest, {
            schemaVersion: 1,
            kind: "dungeon-completed",
            dungeonId: dungeon.id,
            locationId: state.atlas.currentLocationId,
            binding: dungeonQuestBinding(state.seed, state.atlas, state.quest, dungeon.id),
          })
        : state.quest;
      return appendLog({ ...state, dungeon, hero, quest }, "dungeon", message);
    }
    case "start-combat": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Combat is already active");
      if (state.counterDuel !== null) throw new Error("A counter duel is already active");
      const activeCompanion = state.companions.active[0];
      const allies = activeCompanion === undefined || activeCompanion.resources.health === 0
        ? []
        : [companionToCombatant(activeCompanion)];
      if (unresolvedRouteEncounterId(state) !== command.encounterId) {
        throw new Error("Tactical combat must match the unresolved active route encounter");
      }
      const combat = createCombat(
        state.seed,
        state.hero,
        command.encounterId,
        command.enemyCount,
        allies,
        projectRouteEncounterThreatContext(state),
      );
      const hero = observeMonsters(state.hero, combat.combatants);
      const fieldNote = counterDuelHabitUnlockText(newlyEstablishedCounterDuelHabits(state.hero.monsterLore, hero.monsterLore));
      const message = `${combat.combatants.length - 1} enemies close in.${fieldNote === null ? "" : ` ${fieldNote}`}`;
      return appendLog({ ...state, combat, hero }, "combat", message);
    }
    case "combat-action": {
      if (state.combat === null) throw new Error("No combat is active");
      const item = command.action.type === "item" ? selectedEmergencyRestorative(state) : undefined;
      if (command.action.type === "item" && item?.id !== command.action.itemId) {
        throw new Error("Restorative item action is unavailable");
      }
      const combat = resolveCombatTurn(state.combat, command.action, state.seed, item);
      const combatHero = combat.combatants.find((entry) => entry.id === state.hero.id);
      let hero = syncHeroFromCombat(state.hero, combatHero);
      const restorativeUse = command.action.type === "item"
        ? [...combat.eventStream.events].reverse().find((event) =>
            event.turn === combat.turn && event.kind === "restorative-used" && event.itemId === command.action.itemId
          )
        : undefined;
      if (restorativeUse?.kind === "restorative-used") {
        const stack = hero.inventory.find((entry) => entry.id === restorativeUse.itemId);
        if (stack === undefined || stack.quantity !== restorativeUse.quantityBefore) {
          throw new Error("Restorative stack no longer matches its resolved combat event");
        }
        hero = {
          ...hero,
          inventory: restorativeUse.quantityAfter === 0
            ? hero.inventory.filter((entry) => entry.id !== stack.id)
            : hero.inventory.map((entry) => entry.id === stack.id
                ? { ...entry, quantity: restorativeUse.quantityAfter }
                : entry),
        };
      }
      const companionParticipated = state.companions.active.some((companion) =>
        combat.combatants.some((combatant) => combatant.id === companion.identity.residentId)
      );
      const companions = companionParticipated
        ? syncActiveCompanionCombat(state.companions, combat.combatants, combat.outcome)
        : state.companions;
      if (combat.outcome === "ongoing") return appendLog({ ...state, combat, hero, companions }, "combat", combat.log.at(-1)?.message ?? "The battle continues.");
      let masteryReceipt = null;
      if (combat.weaponUse.tracking === "tracked" && combat.weaponUse.basicStrikes > 0) {
        const trackedUse = combat.weaponUse;
        const usedWeapon = hero.inventory.find((item) => item.id === trackedUse.weaponId);
        if (usedWeapon === undefined) throw new Error("The combat-bound weapon is missing from inventory");
        const progression = applyWeaponUseMastery(usedWeapon, combat, state.tick);
        masteryReceipt = progression.receipt;
        if (progression.item !== usedWeapon) {
          hero = { ...hero, inventory: hero.inventory.map((item) => item.id === usedWeapon.id ? progression.item : item) };
        }
      }
      const completedCombats = [...state.completedCombats.slice(-(maximumCompletedCombats - 1)), combat];
      const retainedCombatIds = new Set(completedCombats.map((entry) => entry.id));
      const legacyUnratedCombatIds = state.legacyUnratedCombatIds.filter((id) => retainedCombatIds.has(id));
      let quest = combat.outcome === "victory"
        ? applyQuestProgressFact(state.quest, {
            schemaVersion: 1,
            kind: "combat-won",
            combatId: combat.id,
            defeatedSpeciesIds: [...new Set(combat.combatants.flatMap((combatant) =>
              combatant.speciesId === null ? [] : [combatant.speciesId]
            ))],
          })
        : state.quest;
      const inventoryBeforeLoot = hero.inventory.length;
      const loot = generateLoot(state.seed, combat.id);
      const rewardedHero = equipBestItems(combat.outcome === "victory" && !hero.inventory.some((item) => item.id === loot.id) ? addItem(hero, loot) : hero);
      if (rewardedHero.inventory.length > inventoryBeforeLoot) {
        quest = applyQuestProgressFact(quest, {
          schemaVersion: 1,
          kind: "item-acquired",
          itemId: loot.id,
          sourceId: combat.id,
          disposition: "inventory",
        });
      }
      const learning = combat.outcome === "victory"
        ? recordMonsterVictory(rewardedHero, combat.combatants)
        : { hero: rewardedHero, learned: [], outcomes: [] };
      const newSecretOutcomes = learning.outcomes.map((entry) => ({
        id: `${state.seed}:secret-outcome:${entry.monsterId}`,
        recordedTick: state.tick,
        thresholdTick: state.tick,
        sourceCombatId: combat.id,
        monsterId: entry.monsterId,
        monsterName: entry.monsterName,
        abilityId: entry.ability.id,
        abilityName: entry.ability.name,
        mechanics: {
          effect: entry.ability.effect,
          manaCost: entry.ability.manaCost,
          potency: entry.ability.potency,
        },
        disposition: entry.disposition,
        reason: entry.reason,
        repertoireCount: entry.repertoireCount,
        repertoireLimit: entry.repertoireLimit,
      } as const));
      const learnedOutcomes = newSecretOutcomes.filter((entry) => entry.disposition === "learned");
      const newDiscoveries = learnedOutcomes.map((entry) => ({
        id: `${state.seed}:discovery:${entry.abilityId}:${state.tick}`,
        tick: state.tick,
        abilityId: entry.abilityId,
        abilityName: entry.abilityName,
        monsterId: entry.monsterId,
        monsterName: entry.monsterName,
      }));
      const newSecretAdmissions = learnedOutcomes.map((entry, index) => {
        const discovery = newDiscoveries[index];
        if (discovery === undefined) throw new Error("Secret admission lost its discovery");
        return {
          id: `${entry.id}:admission:${discovery.id}`,
          tick: state.tick,
          outcomeId: entry.id,
          discoveryId: discovery.id,
        };
      });
      let next = appendLog({
        ...state,
        combat: null,
        completedCombats,
        legacyUnratedCombatIds,
        hero: learning.hero,
        companions,
        quest,
        secretDiscoveryOutcomes: [...state.secretDiscoveryOutcomes, ...newSecretOutcomes],
        secretDiscoveryAdmissions: [...state.secretDiscoveryAdmissions, ...newSecretAdmissions],
        discoveries: [...state.discoveries, ...newDiscoveries].slice(-maximumAbilityDiscoveries),
      }, "combat", `The battle ends in ${combat.outcome}.`);
      if (masteryReceipt !== null) {
        const weapon = hero.inventory.find((item) => item.id === masteryReceipt.weaponId);
        if (weapon === undefined || weapon.useMastery === null) throw new Error("Weapon Use Mastery receipt lost its item");
        next = appendLog(next, "item", `${describeWeaponUseReceipt(weapon.name, masteryReceipt)}.`);
      }
      const abilityMessages: string[] = [];
      if (newDiscoveries.length > 0) {
        abilityMessages.push(`${learning.hero.name} learns ${newDiscoveries.map((entry) => entry.abilityName).join(" and ")} from the defeated monsters.`);
      }
      const held = newSecretOutcomes.filter((entry) => entry.disposition === "deferred-capacity");
      if (held.length > 0) {
        abilityMessages.push(`${learning.hero.name} understands ${held.map((entry) => entry.abilityName).join(" and ")}, but holds the ${held.length === 1 ? "pattern" : "patterns"}: repertoire full ${held[0]?.repertoireCount}/${held[0]?.repertoireLimit}.`);
      }
      const rejected = newSecretOutcomes.filter((entry) => entry.disposition === "rejected");
      if (rejected.length > 0) {
        abilityMessages.push(`${rejected.map((entry) => entry.abilityName).join(" and ")} cannot enter the repertoire because an ability identity conflicts.`);
      }
      if (abilityMessages.length > 0) {
        next = appendLog(next, "ability", abilityMessages.join(" "));
      }
      return next;
    }
    case "start-counter-duel": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Combat is already active");
      if (state.counterDuel !== null) throw new Error("A counter duel is already active");
      const counterDuel = createCounterDuel(
        state.seed,
        command.encounterId,
        state.hero.id,
        state.hero.resources.maxHealth,
      );
      const definition = monsterDefinitions.find((entry) => entry.id === counterDuel.opponentSpeciesId);
      if (definition === undefined) throw new Error("Counter duel monster definition is missing");
      const hero = observeMonster(state.hero, {
        speciesId: definition.id,
        name: definition.name,
        secret: monsterAbilityForLevel(definition, state.hero.level),
      });
      const fieldNote = counterDuelHabitUnlockText(newlyEstablishedCounterDuelHabits(state.hero.monsterLore, hero.monsterLore));
      const habit = projectCounterDuelHabit(counterDuel, hero.monsterLore);
      return appendLog(
        { ...state, counterDuel, hero },
        "combat",
        `${counterDuel.opponentName} bars the road with a Pattern Duel: Rush breaks Feint, Feint opens Ward, Ward stops Rush. First to 2; after round 5 the leader wins and an equal score draws. Two consecutive confirmed live-tell reads earn a reward-neutral Pattern Break; any other round resets the opening. ${fieldNote ?? `${counterDuelHabitText(habit)}.`}`,
      );
    }
    case "counter-duel-action": {
      if (state.counterDuel === null) throw new Error("No counter duel is active");
      const before = state.counterDuel;
      const counterDuel = resolveCounterDuelRound(before, command.prediction, state.seed);
      const latest = counterDuel.history.at(-1);
      if (latest === undefined) throw new Error("Counter duel resolution produced no round");
      const answer = counterDuelStanceLabel(latest.heroStance);
      const opposed = counterDuelStanceLabel(latest.opponentStance);
      const result = latest.result === "hero"
        ? `${answer} counters ${opposed}; ${state.hero.name} scores.`
        : latest.result === "opponent"
          ? `${opposed} counters ${answer}; ${counterDuel.opponentName} scores.`
          : `${answer} meets ${opposed}; neither side scores.`;
      const patternBreak = latest.patternBreak;
      const openingReceipt = patternBreak?.triggered === true
        ? " Pattern Break: two consecutive confirmed live-tell reads; the ordinary point still decides the score."
        : patternBreak?.openingGain === 1
          ? " Opening 1/2: the live tell is confirmed after reveal."
          : patternBreak?.reset === true
            ? " The uncompleted opening resets."
            : "";
      if (counterDuel.outcome === "ongoing") {
        return appendLog({ ...state, counterDuel }, "combat", `Pattern Duel round ${latest.round}: ${result}${openingReceipt}`);
      }
      const hero = counterDuel.outcome === "defeat"
        ? {
            ...state.hero,
            resources: {
              ...state.hero.resources,
              health: Math.max(0, state.hero.resources.health - counterDuel.stakes.defeatDamage),
            },
          }
        : state.hero;
      const completedCounterDuels = [
        ...state.completedCounterDuels.slice(-(maximumCompletedCounterDuels - 1)),
        counterDuel,
      ];
      const consequence = counterDuel.outcome === "victory"
        ? `Victory earns ${counterDuel.stakes.victoryExperience} experience and ${counterDuel.stakes.victoryGold} gold.`
        : counterDuel.outcome === "defeat"
          ? `Defeat costs ${counterDuel.stakes.defeatDamage} health; ${hero.resources.health}/${hero.resources.maxHealth} remains.`
          : "The draw changes no campaign resource.";
      const terminalOpening = patternBreak?.triggered === true
        ? " Pattern Break · 2/2 confirmed live-tell reads · standard reward only."
        : counterDuel.patternBreak?.status === "expired" && counterDuel.patternBreak.opening > 0
          ? ` Opening expired · ${counterDuel.patternBreak.opening}/2 confirmed reads.`
          : "";
      return appendLog(
        { ...state, counterDuel: null, completedCounterDuels, hero },
        "combat",
        `Pattern Duel round ${latest.round}: ${result}${terminalOpening} ${counterDuel.outcome}. ${consequence}`,
      );
    }
    case "admit-deferred-secret": {
      const outcome = state.secretDiscoveryOutcomes.find((entry) => entry.id === command.outcomeId);
      if (
        outcome === undefined ||
        heldSecretAdmissionCandidate(input)?.id !== command.outcomeId ||
        outcome.disposition !== "deferred-capacity" ||
        outcome.mechanics === null ||
        state.secretDiscoveryAdmissions.some((entry) => entry.outcomeId === outcome.id) ||
        state.hero.abilities.length >= maximumAbilities ||
        state.hero.abilities.some((entry) => entry.id === outcome.abilityId) ||
        state.combat !== null ||
        state.counterDuel !== null ||
        state.atlas.route !== null ||
        (state.dungeon !== null && !state.dungeon.completed)
      ) {
        throw new Error("Deferred secret is not eligible for safe admission");
      }
      const learnedAbility = {
        id: outcome.abilityId,
        name: outcome.abilityName,
        kind: "secret" as const,
        effect: outcome.mechanics.effect,
        level: 1,
        experience: 0,
        uses: 0,
        manaCost: outcome.mechanics.manaCost,
        potency: outcome.mechanics.potency,
        sourceMonsterId: outcome.monsterId,
      };
      const discovery = {
        id: `${state.seed}:discovery:${outcome.abilityId}:${state.tick}`,
        tick: state.tick,
        abilityId: outcome.abilityId,
        abilityName: outcome.abilityName,
        monsterId: outcome.monsterId,
        monsterName: outcome.monsterName,
      };
      const admission = {
        id: `${outcome.id}:admission:${discovery.id}`,
        tick: state.tick,
        outcomeId: outcome.id,
        discoveryId: discovery.id,
      };
      return appendLog({
        ...state,
        hero: { ...state.hero, abilities: [...state.hero.abilities, learnedAbility] },
        discoveries: [...state.discoveries, discovery].slice(-maximumAbilityDiscoveries),
        secretDiscoveryAdmissions: [...state.secretDiscoveryAdmissions, admission],
      }, "ability", `${state.hero.name} opens a repertoire slot and gives held field note ${outcome.abilityName} a living form.`);
    }
    case "train-ability": {
      const before = state.hero.abilities.find((entry) => entry.id === command.abilityId);
      const hero = trainAbility(state.hero, command.abilityId);
      const after = hero.abilities.find((entry) => entry.id === command.abilityId);
      return appendLog(
        { ...state, hero },
        "ability",
        `${hero.name} practices ${after?.name ?? command.abilityId}${before !== undefined && after !== undefined && after.level > before.level ? ` and reaches level ${after.level}` : ""}.`,
      );
    }
    case "fulfill-quest": {
      if (state.quest.status !== "ready-to-fulfill" || command.questInstanceId !== state.quest.instanceId) {
        throw new Error("Quest fulfillment is not eligible");
      }
      if (state.combat !== null || state.counterDuel !== null) {
        throw new Error("Cannot fulfill a quest during an active encounter");
      }
      if (state.completedQuests.some((summary) => summary.questInstanceId === state.quest.instanceId)) {
        throw new Error("Quest has already been fulfilled");
      }
      const objectiveIds = [
        ...state.quest.objectives.map((objectiveState) => objectiveState.id),
        ...state.quest.subquests.flatMap((subquest) => subquest.objectives.map((objectiveState) => objectiveState.id)),
      ];
      const completion = {
        id: questCompletionId(state.quest.instanceId),
        questInstanceId: state.quest.instanceId,
        questId: state.quest.id,
        questOrdinal: state.quest.ordinal,
        title: state.quest.title,
        fulfilledTick: state.tick,
        objectiveIds,
        subquestIds: state.quest.subquests.map((subquest) => subquest.id),
      };
      const grant = createQuestRewardGrant(state.seed, completion, state.hero.inventory.length);
      const summary: CompletedQuestSummary = {
        ...completion,
        reward: { status: "pending", grant },
      };
      const quest: QuestState = { ...state.quest, status: "fulfilled" };
      return appendLog({
        ...state,
        quest,
        completedQuests: [...state.completedQuests.slice(-(maximumCompletedQuestSummaries - 1)), summary],
        totalCompletedQuests: state.totalCompletedQuests + 1,
        pendingQuestReward: grant,
      }, "quest", `QUEST FULFILLED · ${quest.title} · reward prepared: +${grant.experienceAward} XP · +${grant.goldAward} gold · ${grant.item.name}${grant.itemDisposition === "converted-to-gold" ? " will be converted because inventory is full" : " to inventory"}.`);
    }
    case "apply-quest-reward": {
      const grant = state.pendingQuestReward;
      const latest = state.completedQuests.at(-1);
      if (
        grant === null || command.grantId !== grant.id || state.quest.status !== "fulfilled" ||
        latest === undefined || latest.questInstanceId !== state.quest.instanceId ||
        latest.reward.status !== "pending" || latest.reward.grant.id !== grant.id
      ) {
        throw new Error("Quest reward application is not eligible");
      }
      if (state.combat !== null || state.counterDuel !== null) {
        throw new Error("Cannot apply a quest reward during an active encounter");
      }
      const progression = applyHeroExperience(state.hero, grant.experienceAward);
      const goldBefore = state.hero.gold;
      const baseGoldAfter = Math.min(Number.MAX_SAFE_INTEGER, goldBefore + grant.baseGoldAward);
      const goldAfter = Math.min(Number.MAX_SAFE_INTEGER, goldBefore + grant.goldAward);
      let hero: DetailedHeroState = {
        ...progression.hero,
        gold: goldAfter,
      };
      if (grant.itemDisposition === "inventory") hero = addItem(hero, grant.item);
      const receipt: QuestRewardReceipt = {
        schemaVersion: 2,
        id: `${grant.id}:receipt`,
        grantId: grant.id,
        appliedTick: state.tick,
        experienceBefore: progression.experienceBefore,
        experienceDelta: progression.experienceDelta,
        experienceAfter: progression.experienceAfter,
        levelBefore: progression.levelBefore,
        levelAfter: progression.levelAfter,
        goldBefore,
        goldDelta: goldAfter - goldBefore,
        goldAfter,
        itemId: grant.item.id,
        itemDisposition: grant.itemDisposition,
        itemConversionGold: goldAfter - baseGoldAfter,
      };
      const completedQuests = [
        ...state.completedQuests.slice(0, -1),
        { ...latest, reward: { status: "applied" as const, grant, receipt } },
      ];
      return appendLog({ ...state, hero, completedQuests, pendingQuestReward: null }, "quest",
        `QUEST REWARD · ${describeQuestRewardReceipt(grant, receipt)}.`);
    }
    case "admit-successor-quest": {
      const predecessor = state.completedQuests.at(-1);
      if (
        state.quest.status !== "fulfilled" || state.pendingQuestReward !== null ||
        predecessor === undefined || predecessor.questInstanceId !== state.quest.instanceId ||
        predecessor.reward.status !== "applied" || command.completionId !== predecessor.id ||
        state.totalCompletedQuests !== state.quest.ordinal + 1
      ) {
        throw new Error("Successor quest admission is not eligible");
      }
      if (state.combat !== null || state.counterDuel !== null) {
        throw new Error("Cannot admit a successor quest during an active encounter");
      }
      if (state.totalCompletedQuests >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Quest sequence has reached its supported limit");
      }
      const quest = createQuest(state.seed, state.totalCompletedQuests, state.tick);
      return appendLog({ ...state, quest }, "quest",
        `NEW QUEST · ${quest.title} · chapter ${quest.ordinal + 1} · ${quest.objectives.length + quest.subquests.flatMap((subquest) => subquest.objectives).length} objectives.`);
    }
    case "wait": {
      if (needsCriticalRoadsideRecovery(state)) {
        const { health, maxHealth, mana, maxMana } = state.hero.resources;
        return appendLog({
          ...state,
          hero: {
            ...state.hero,
            resources: { ...state.hero.resources, health: maxHealth, mana: maxMana },
          },
        }, "world", `Roadside camp: HP ${health}→${maxHealth} (+${maxHealth - health}) · MP ${mana}→${maxMana} (+${maxMana - mana}). Fully rested; ready for the road.`);
      }
      if (state.hero.resources.health > 0) {
        return appendLog(state, "world", "The party watches and listens; rest away from refuge restores nothing.");
      }
      const health = Math.min(
        state.hero.resources.maxHealth,
        state.hero.resources.health + Math.max(1, Math.ceil(state.hero.resources.maxHealth / 4)),
      );
      const mana = Math.min(
        state.hero.resources.maxMana,
        state.hero.resources.mana + Math.max(1, Math.ceil(state.hero.resources.maxMana / 4)),
      );
      const relocated = state.dungeon !== null && !state.dungeon.completed;
      return appendLog({
        ...state,
        dungeon: relocated && state.dungeon !== null
          ? { ...state.dungeon, currentCellId: state.dungeon.entryCellId }
          : state.dungeon,
        hero: {
          ...state.hero,
          resources: { ...state.hero.resources, health, mana },
        },
      }, "world", relocated
        ? `The party recovers from defeat and regroups at the dungeon entrance — HP ${health}, MP ${mana}.`
        : `The party recovers from defeat — HP ${health}, MP ${mana}.`);
    }
    default:
      throw new TypeError("Unsupported depth command");
  }
}

function heldSecretAdmissionCandidate(state: DepthState): SecretDiscoveryOutcome | undefined {
  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  if (
    state.hero.abilities.length >= maximumAbilities ||
    state.combat !== null ||
    state.counterDuel !== null ||
    state.atlas.route !== null ||
    (state.dungeon !== null && !state.dungeon.completed) ||
    location?.kind !== "town" ||
    state.discoveries.at(-1)?.tick === state.tick
  ) return undefined;
  const admittedOutcomeIds = new Set(state.secretDiscoveryAdmissions.map((entry) => entry.outcomeId));
  return [...state.secretDiscoveryOutcomes]
    .filter((entry) =>
      entry.disposition === "deferred-capacity" &&
      entry.mechanics !== null &&
      !admittedOutcomeIds.has(entry.id) &&
      !state.hero.abilities.some((ability) => ability.id === entry.abilityId)
    )
    .sort((left, right) =>
      (left.thresholdTick ?? left.recordedTick) - (right.thresholdTick ?? right.recordedTick) ||
      left.recordedTick - right.recordedTick ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    )[0];
}

export function stepDepth(input: DepthState, command: DepthCommand): DepthState {
  if (
    !isValidSecretDiscoveryGraph(input) || !isValidCounterDuelGraph(input) ||
    !isValidCompanionStateGraph(input)
  ) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  const output = reduceDepth(input, command);
  if (
    !isValidSecretDiscoveryGraph(output) || !isValidCounterDuelGraph(output) ||
    !isValidCompanionStateGraph(output)
  ) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  return output;
}

function commandCandidate(
  state: DepthState,
  suffix: string,
  label: string,
  command: DepthCommand,
  deciderId = state.hero.id,
): DepthCommandCandidate {
  return {
    id: `depth:${state.tick + 1}:${suffix}`,
    label,
    deciderId,
    command,
  };
}

export function unresolvedRouteEncounterId(state: DepthState): string | null {
  if (state.atlas.route === null) return null;
  const encounterId = `encounter:route:${state.atlas.route.path.join(">")}`;
  const completed = state.completedCombats.some((combat) => combat.id === encounterId)
    || state.completedCounterDuels.some((duel) => duel.id === encounterId);
  return completed ? null : encounterId;
}

export function projectRouteEncounterThreatContext(state: DepthState): EncounterThreatContext {
  const route = state.atlas.route;
  if (route === null) throw new Error("A route encounter needs an active route");
  const fromLocationId = route.path[route.legIndex];
  const destinationLocationId = route.path[route.legIndex + 1];
  if (fromLocationId === undefined || destinationLocationId === undefined) {
    throw new Error("The active route leg is incomplete");
  }
  const edge = edgeBetween(state.atlas, fromLocationId, destinationLocationId);
  const destination = state.atlas.locations.find((location) => location.id === destinationLocationId);
  if (destination === undefined) throw new Error("The active route destination is missing");
  const lead = projectSuccessorQuestLead(state.seed, state.atlas, state.quest);
  const reachesUnresolvedLead = lead !== null && lead.phase !== "resolved" && lead.locationId === destinationLocationId;
  return {
    edgeId: edge.id,
    fromLocationId,
    destinationLocationId,
    placeDanger: destination.danger,
    questLeadId: reachesUnresolvedLead ? lead.id : null,
    questInstanceId: reachesUnresolvedLead ? lead.questInstanceId : null,
    questModifier: reachesUnresolvedLead ? 1 : 0,
  };
}

function sameThreatContext(
  profile: Extract<CombatState["threat"], { rating: "place-bound" }>,
  context: EncounterThreatContext,
): boolean {
  return profile.edgeId === context.edgeId &&
    profile.fromLocationId === context.fromLocationId &&
    profile.destinationLocationId === context.destinationLocationId &&
    profile.placeDanger === context.placeDanger &&
    profile.questLeadId === context.questLeadId &&
    profile.questInstanceId === context.questInstanceId &&
    profile.questModifier === context.questModifier;
}

export function isValidCompanionStateGraph(
  state: Pick<DepthState, "tick" | "hero" | "companions" | "combat" | "completedCombats">,
): boolean {
  if (
    !Number.isSafeInteger(state.tick) || state.tick < 0 ||
    !isValidCompanionRoster(state.companions) ||
    state.companions.explicitKitAfterTick > state.tick
  ) return false;
  const companions = [...state.companions.active, ...state.companions.former];
  if (companions.some((companion) => companion.joinedTick > state.tick)) return false;
  if (state.companions.former.some((companion) => companion.departure.tick > state.tick)) return false;
  if (!Array.isArray(state.completedCombats)) return false;
  const completedCombats = state.completedCombats as readonly CombatState[];
  const retainedCombats = [...completedCombats, ...(state.combat === null ? [] : [state.combat])];
  const retainedCombatIds = retainedCombats.map((combat) => combat.id);
  if (new Set(retainedCombatIds).size !== retainedCombatIds.length) return false;

  const knownCompanions = [...state.companions.active, ...state.companions.former];
  for (const combat of completedCombats) {
    const heroMatches = combat.combatants.filter((combatant) =>
      combatant.id === state.hero.id && combatant.side === "heroes"
    );
    const allies = combat.combatants.filter((combatant) =>
      combatant.side === "heroes" && combatant.id !== state.hero.id
    );
    if (heroMatches.length !== 1 || allies.length > 1) return false;
    const ally = allies[0];
    if (ally === undefined) {
      if (combat.companionActionRuntime !== undefined) return false;
      continue;
    }
    const matches = knownCompanions.filter((companion) =>
      companionMatchesCombatantIdentity(companion, ally)
    );
    if (matches.length !== 1) return false;
    const expectsRoadcraft = matches[0]?.combatKit?.kitId === "miller-roadcraft";
    if (
      (combat.companionActionRuntime !== undefined) !== expectsRoadcraft ||
      (expectsRoadcraft && combat.companionActionRuntime?.actorId !== ally.id)
    ) return false;
  }

  if (state.combat === null) return true;

  const heroMatches = state.combat.combatants.filter((combatant) =>
    combatant.id === state.hero.id && combatant.side === "heroes"
  );
  const allies = state.combat.combatants.filter((combatant) =>
    combatant.side === "heroes" && combatant.id !== state.hero.id
  );
  if (heroMatches.length !== 1) return false;
  const active = state.companions.active[0];
  if (active === undefined) {
    return allies.length === 0 && state.combat.companionActionRuntime === undefined;
  }
  if (allies.length === 0) {
    return active.resources.health === 0 && state.combat.companionActionRuntime === undefined;
  }
  if (allies.length !== 1 || allies[0]?.id !== active.identity.residentId) return false;
  try {
    const synchronized = syncCompanionResources(active, allies[0]);
    const expectsRoadcraft = active.combatKit?.kitId === "miller-roadcraft";
    if (
      (state.combat.companionActionRuntime !== undefined) !== expectsRoadcraft ||
      (expectsRoadcraft && state.combat.companionActionRuntime?.actorId !== active.identity.residentId)
    ) return false;
    return synchronized.resources.health === active.resources.health &&
      synchronized.resources.mana === active.resources.mana &&
      synchronized.injury === active.injury;
  } catch {
    return false;
  }
}

export function isValidDepthEncounterThreatState(state: DepthState): boolean {
  try {
    if (
      !Array.isArray(state.legacyUnratedCombatIds) || !Array.isArray(state.completedCombats) ||
      !isValidCompanionStateGraph(state)
    ) return false;
    const combats = [...(state.combat === null ? [] : [state.combat]), ...state.completedCombats];
    const receipt = state.legacyUnratedCombatIds;
    if (
      receipt.length > maximumCompletedCombats + 1 ||
      receipt.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(receipt).size !== receipt.length ||
      receipt.some((id, index) => index > 0 && compareIds(receipt[index - 1]!, id) >= 0)
    ) return false;
    const actualLegacyIds = combats
      .filter((combat) => combat.threat.rating === "legacy-unrated")
      .map((combat) => combat.id)
      .sort(compareIds);
    if (actualLegacyIds.length !== receipt.length || actualLegacyIds.some((id, index) => id !== receipt[index])) return false;
    for (const combat of combats) {
      if (!isValidCombatState(combat)) return false;
      if (combat.threat.rating === "place-bound" && !isValidEncounterThreatProvenance(combat.threat, state.atlas)) return false;
      if (combat.weaponUse.tracking !== "legacy-untracked" && combat.weaponUse.heroId !== state.hero.id) return false;
      if (combat.weaponUse.tracking === "tracked") {
        const trackedUse = combat.weaponUse;
        if (!state.hero.inventory.some((item) =>
          item.id === trackedUse.weaponId && item.kind === "equipment" && item.slot === "weapon"
        )) return false;
      }
    }
    if (state.hero.inventory.some((item) => item.useMastery?.receipts.some((entry) => entry.resolvedTick > state.tick))) return false;
    if (state.combat?.weaponUse.tracking === "tracked" && state.hero.equipment.weapon !== state.combat.weaponUse.weaponId) return false;
    if (state.combat?.weaponUse.tracking === "unarmed" && state.hero.equipment.weapon !== null) return false;
    if (state.combat?.threat.rating === "place-bound") {
      if (unresolvedRouteEncounterId(state) !== state.combat.id) return false;
      return sameThreatContext(state.combat.threat, projectRouteEncounterThreatContext(state));
    }
    return true;
  } catch {
    return false;
  }
}

export function needsCriticalRoadsideRecovery(state: DepthState): boolean {
  return state.combat === null
    && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed)
    && unresolvedRouteEncounterId(state) !== null
    && state.hero.resources.health * 2 <= state.hero.resources.maxHealth;
}

function selectedEmergencyRestorative(state: DepthState) {
  const combat = state.combat;
  if (combat === null || combat.outcome !== "ongoing") return undefined;
  const activeId = combat.turnOrder[combat.activeIndex];
  const active = combat.combatants.find((entry) => entry.id === activeId);
  if (
    active === undefined || active.id !== state.hero.id || active.health <= 0 ||
    active.health >= active.maxHealth || active.health * 3 > active.maxHealth
  ) return undefined;
  return [...state.hero.inventory]
    .filter((item) => item.quantity > 0 && restorativeHealthAmount(item, active.maxHealth) > 0)
    .sort((left, right) =>
      restorativeHealthAmount(left, active.maxHealth) - restorativeHealthAmount(right, active.maxHealth) ||
      compareIds(left.id, right.id)
    )[0];
}

export function depthCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] {
  if (state.pendingQuestReward !== null) {
    return [commandCandidate(
      state,
      `quest:reward:${state.pendingQuestReward.id}`,
      `receive the reward for ${state.quest.title}`,
      { type: "apply-quest-reward", grantId: state.pendingQuestReward.id },
    )];
  }
  if (canInvokeMigratedFarShrine(state) && state.dungeon !== null) {
    return [commandCandidate(
      state,
      `dungeon:${state.dungeon.id}:invoke-far-shrine`,
      "invoke the far-stair shrine",
      { type: "invoke-dungeon-shrine", dungeonId: state.dungeon.id, cellId: state.dungeon.exitCellId },
    )];
  }
  if (state.counterDuel !== null) {
    return counterDuelStances.map((prediction) => commandCandidate(
      state,
      `counter-duel:${state.counterDuel?.id ?? "unknown"}:${state.counterDuel?.round ?? 0}:${prediction}`,
      `read ${counterDuelStanceLabel(prediction)} and answer with ${counterDuelStanceLabel(counterToStance(prediction))}`,
      { type: "counter-duel-action", prediction },
    ));
  }
  if (state.combat !== null && state.combat.outcome === "ongoing") {
    const combat = state.combat;
    const activeId = combat.turnOrder[combat.activeIndex];
    const active = combat.combatants.find((entry) => entry.id === activeId);
    const restorative = selectedEmergencyRestorative(state);
    const itemAction = active === undefined || restorative === undefined
      ? []
      : [{ actorId: active.id, type: "item" as const, targetId: active.id, abilityId: null, itemId: restorative.id }];
    const actions = [
      ...legalCombatActions(combat).slice(0, itemAction.length === 0 ? 12 : 11),
      ...itemAction,
    ];
    return actions.map((action) => {
      const actor = combat.combatants.find((entry) => entry.id === action.actorId);
      const target = combat.combatants.find((entry) => entry.id === action.targetId);
      const ability = actor?.abilities.find((entry) => entry.id === action.abilityId);
      const item = action.type === "item" ? state.hero.inventory.find((entry) => entry.id === action.itemId) : undefined;
      if (actor === undefined) throw new Error("Combat candidate actor is missing");
      if (action.type !== "guard" && target === undefined) throw new Error("Combat candidate target is missing");
      if (action.type === "ability" && ability === undefined) throw new Error("Combat candidate ability is missing");
      if (action.type === "item" && item === undefined) throw new Error("Combat candidate item is missing");
      const label = action.type === "guard"
        ? `${actor.name} guards`
        : action.type === "item"
          ? `${actor.name} uses ${item?.name ?? "a restorative"}`
        : action.type === "companion-action"
          ? `${actor.name} uses ${action.companionActionId === "flour-veil" ? "Flour Veil" : "Millstone Drag"} on ${target?.name}`
          : `${actor.name} uses ${ability?.name ?? "Attack"} on ${target?.name}`;
      return commandCandidate(
        state,
        `combat:${combat.id}:${combat.turn}:${action.actorId}:${action.type}:${action.type === "companion-action" ? action.companionActionId : action.abilityId ?? action.itemId ?? "basic"}:${action.targetId ?? "self"}`,
        label,
        { type: "combat-action", action },
        actor.id,
      );
    });
  }
  if (state.quest.status === "fulfilled") {
    const predecessor = state.completedQuests.at(-1);
    if (predecessor === undefined || predecessor.reward.status !== "applied") {
      throw new Error("A fulfilled quest has no settled completion");
    }
    return [commandCandidate(
      state,
      `quest:admit:${predecessor.id}`,
      `begin the next quest after ${predecessor.title}`,
      { type: "admit-successor-quest", completionId: predecessor.id },
    )];
  }
  if (state.quest.status === "ready-to-fulfill") {
    return [commandCandidate(
      state,
      `quest:fulfill:${state.quest.instanceId}`,
      `fulfill ${state.quest.title}`,
      { type: "fulfill-quest", questInstanceId: state.quest.instanceId },
    )];
  }
  if (needsCriticalRoadsideRecovery(state)) {
    return [commandCandidate(state, "critical-roadside-recovery", "make a critical roadside camp", { type: "wait" })];
  }
  if (state.hero.resources.health <= 0) {
    return [commandCandidate(state, "recover", "recover from defeat", { type: "wait" })];
  }
  const activeCompanion = state.companions.active[0];
  if (activeCompanion !== undefined && state.dungeon !== null && !state.dungeon.completed) {
    throw new Error("A Shared Road Oath cannot detour into an active dungeon");
  }
  if (activeCompanion?.phase === "arrived") {
    return [commandCandidate(
      state,
      `companion:farewell:${activeCompanion.identity.residentId}`,
      `bid farewell to ${activeCompanion.identity.name}`,
      { type: "farewell-companion", residentId: activeCompanion.identity.residentId },
    )];
  }
  if (activeCompanion !== undefined && state.atlas.route === null) {
    return [commandCandidate(
      state,
      `companion:route:${activeCompanion.destination.locationId}`,
      `honor ${activeCompanion.identity.name}'s oath to ${activeCompanion.destination.name}`,
      { type: "plan-route", destinationId: activeCompanion.destination.locationId },
    )];
  }
  if (state.dungeon !== null && !state.dungeon.completed) {
    if (dungeonTrapAt(state.dungeon, state.dungeon.currentCellId)?.phase === "detected") {
      return [commandCandidate(
        state,
        `dungeon:${state.dungeon.id}:disarm:${state.dungeon.currentCellId}`,
        "disarm the detected trap",
        { type: "disarm-dungeon-trap" },
      )];
    }
    if (canUnlockDungeonGate(state.dungeon)) {
      return [commandCandidate(
        state,
        `dungeon:${state.dungeon.id}:unlock:${state.dungeon.currentCellId}`,
        `turn the ${dungeonKeyName} in the Wayfinder Gate`,
        { type: "unlock-dungeon-gate" },
      )];
    }
    return dungeonMoveOptions(state.dungeon).map((direction) => commandCandidate(
      state,
      `dungeon:${state.dungeon?.id ?? "unknown"}:${direction}`,
      `take the ${direction} passage`,
      { type: "move-dungeon", direction },
    ));
  }
  const latestDiscovery = state.discoveries.at(-1);
  if (latestDiscovery?.tick === state.tick) {
    return [commandCandidate(
      state,
      `train:${latestDiscovery.abilityId}`,
      `practice ${latestDiscovery.abilityName}`,
      { type: "train-ability", abilityId: latestDiscovery.abilityId },
    )];
  }
  const heldOutcome = heldSecretAdmissionCandidate(state);
  if (heldOutcome !== undefined) {
    return [commandCandidate(
      state,
      `admit-secret:${heldOutcome.id}`,
      `give held field note ${heldOutcome.abilityName} a living form`,
      { type: "admit-deferred-secret", outcomeId: heldOutcome.id },
    )];
  }
  if (state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0) {
    return [...state.hero.abilities]
      .sort((left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .slice(0, 4)
      .map((ability) => commandCandidate(
        state,
        `train:${ability.id}`,
        `practice ${ability.name}`,
        { type: "train-ability", abilityId: ability.id },
      ));
  }
  if (state.atlas.route !== null) {
    const encounterId = unresolvedRouteEncounterId(state);
    if (encounterId !== null) {
      const counterDuel = randomInt(4, state.seed, "depth-director", encounterId, 0, "encounter-engine") === 0;
      if (counterDuel) {
        return [commandCandidate(
          state,
          `${encounterId}:counter-duel`,
          "answer the road rival's Pattern Duel",
          { type: "start-counter-duel", encounterId },
        )];
      }
      const enemyCount = 1 + randomInt(2, state.seed, "depth-director", encounterId, 0, "enemy-count");
      return [commandCandidate(
        state,
        `${encounterId}:${enemyCount}`,
        `face ${enemyCount === 1 ? "the road's danger" : `${enemyCount} road threats`}`,
        { type: "start-combat", encounterId, enemyCount },
      )];
    }
    const remaining = Math.max(1, state.atlas.route.totalDistance - state.atlas.route.distanceTravelled);
    const distance = Math.min(remaining, 6 + randomInt(8, state.seed, "depth-director", state.hero.id, state.tick, "travel-distance"));
    return [commandCandidate(
      state,
      `travel:${distance}`,
      `advance ${distance} ${distance === 1 ? "mile" : "miles"}`,
      { type: "travel", distance },
    )];
  }
  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  if (location?.kind === "town" && state.towns[location.id] === undefined) {
    return [{
      id: `town:${location.id}`,
      label: `enter ${location.name}`,
      deciderId: state.hero.id,
      command: { type: "visit-town" },
    }];
  }
  const tonicRestock = selectTonicRestock(state);
  if (tonicRestock !== null) {
    return [commandCandidate(
      state,
      `town:${location?.id ?? "unknown"}:restock:${tonicRestock.itemId}:${tonicRestock.quantityAfter}`,
      `restock ${tonicRestock.itemName} ×${tonicRestock.quantityBefore}→×${tonicRestock.quantityAfter}`,
      { type: "restock-tonic", itemId: tonicRestock.itemId },
    )];
  }
  const questLead = projectSuccessorQuestLead(state.seed, state.atlas, state.quest);
  if (
    questLead !== null &&
    questLead.phase === "revealed" &&
    state.companions.active.length === 0
  ) {
    return [commandCandidate(
      state,
      `quest-lead:${questLead.id}:route`,
      `plot the quest route to ${questLead.locationName}`,
      { type: "plan-route", destinationId: questLead.locationId },
    )];
  }
  if (
    location?.kind === "town" &&
    state.companions.active.length === 0 &&
    state.companions.former.length === 0
  ) {
    const town = state.towns[location.id];
    const companion = town === undefined
      ? null
      : selectSharedRoadCompanion({
          seed: state.seed,
          atlas: state.atlas,
          town,
          roster: state.companions,
          joinedTick: state.tick + 1,
          heroLevel: heroMechanicalLevel(state.hero.level),
        });
    if (companion !== null) {
      return [commandCandidate(
        state,
        `companion:join:${companion.identity.residentId}`,
        `share the road with ${companion.identity.name}`,
        {
          type: "recruit-companion",
          residentId: companion.identity.residentId,
          destinationId: companion.destination.locationId,
        },
      )];
    }
  }
  const dungeonPlan = selectDungeonEntryPlan(state);
  if (dungeonPlan !== null) {
    return [commandCandidate(
      state,
      `${dungeonPlan.dungeonId}:enter`,
      `enter the maze at ${state.atlas.locations.find((entry) => entry.id === dungeonPlan.locationId)?.name ?? dungeonPlan.locationId}`,
      { type: "enter-dungeon", dungeonId: dungeonPlan.dungeonId, width: dungeonPlan.width, height: dungeonPlan.height },
    )];
  }
  const neighbors = neighboringLocationIds(state.atlas, state.atlas.currentLocationId);
  if (neighbors.length === 0) return [commandCandidate(state, "wait", "watch and recover", { type: "wait" })];
  return neighbors.map((destinationId) => {
    const destination = state.atlas.locations.find((entry) => entry.id === destinationId);
    if (destination === undefined) throw new Error("Neighboring atlas destination is missing");
    return commandCandidate(
      state,
      `route:${destinationId}`,
      `plot a route to ${destination.name}`,
      { type: "plan-route", destinationId },
    );
  });
}

export function advanceDepth(state: DepthState): DepthState {
  const candidates = depthCommandCandidates(state);
  const candidate = candidates[randomInt(
    candidates.length,
    state.seed,
    "depth-policy",
    state.hero.id,
    state.tick + 1,
    "candidate",
  )];
  if (candidate === undefined) throw new Error("Depth Director found no legal command");
  return stepDepth(state, candidate.command);
}
