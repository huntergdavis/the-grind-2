import { randomInt } from "../core/rng";
import { advanceRoute, edgeBetween, generateAtlas, neighboringLocationIds, planRoute } from "./atlas";
import { createCombat, legalCombatActions, monsterAbilityForLevel, monsterDefinitions, resolveCombatTurn } from "./combat";
import {
  addActiveCompanion,
  companionToCombatant,
  createEmptyCompanionRoster,
  retireActiveCompanionAtDestination,
  selectSharedRoadCompanion,
  syncActiveCompanionCombat,
} from "./companion";
import {
  counterDuelHabitText,
  counterDuelHabitUnlockText,
  counterDuelStanceLabel,
  counterDuelStances,
  counterToStance,
  createCounterDuel,
  newlyEstablishedCounterDuelHabits,
  projectCounterDuelHabit,
  resolveCounterDuelRound,
} from "./counter-duel";
import {
  canUnlockDungeonGate,
  describeDungeonShrineUse,
  dungeonMoveOptions,
  dungeonKeyName,
  dungeonTrapAt,
  dungeonTrapKindLabel,
  generateDungeon,
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
  createHero,
  createQuest,
  effectiveAttribute,
  equipBestItems,
  generateLoot,
  observeMonster,
  observeMonsters,
  progressQuest,
  recordMonsterVictory,
  isValidDetailedHeroState,
  isValidQuestState,
  starterAbilities,
  trainAbility,
} from "./rpg";
import { generateTown, visitTown } from "./towns";
import type {
  CombatLogEntry,
  CombatState,
  CombatantState,
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
  QuestState,
} from "./types";

export const maximumDepthLogEntries = 128;
export const maximumCompletedCombats = 4;
export const maximumCompletedCounterDuels = 4;
export const maximumAbilityDiscoveries = 32;

type PreviousHeroState = Omit<DetailedHeroState, "abilities" | "monsterLore">;
type PreviousDungeonStateV7 = Omit<DungeonState, "latestShrineUse">;
type PreviousDungeonStateV5 = Omit<DungeonState, "layoutVersion" | "keyGate" | "latestShrineUse">;
type PreviousDungeonState = Omit<PreviousDungeonStateV5, "traps">;
type PreviousCombatantState = Omit<CombatantState, "abilities" | "speciesId">;
type PreviousCombatStateVCurrent = Omit<CombatState, "eventStream">;
type PreviousCombatLogEntry = Omit<CombatLogEntry, "action" | "targetId" | "abilityId"> & {
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
type PreviousDepthStateV8 = Omit<DepthState, "schemaVersion" | "companions"> & {
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
    };
  });
  return {
    ...combat,
    combatants,
    log,
    eventStream: { schemaVersion: 1, firstRecordedTurn: combat.turn + 1, events: [] },
  };
}

function upgradeCombatEventStream(combat: PreviousCombatStateVCurrent): CombatState {
  return {
    ...combat,
    eventStream: { schemaVersion: 1, firstRecordedTurn: combat.turn + 1, events: [] },
  };
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

export function upgradeDepthState(value: unknown, seed: string, heroId: string, heroName: string): DepthState {
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion === 9) {
    if (!isValidDetailedHeroState(value.hero) || !isValidQuestState(value.quest)) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    return value as unknown as DepthState;
  }
  if (value.schemaVersion === 8) {
    const previous = value as unknown as PreviousDepthStateV8;
    return { ...previous, schemaVersion: 9, companions: createEmptyCompanionRoster() };
  }
  if (value.schemaVersion === 7) {
    const previous = value as unknown as PreviousDepthStateV7;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : { ...previous.dungeon, latestShrineUse: null },
    };
  }
  if (value.schemaVersion === 6) {
    const previous = value as unknown as PreviousDepthStateV6;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : { ...previous.dungeon, latestShrineUse: null },
      combat: previous.combat === null ? null : upgradeCombatEventStream(previous.combat),
      completedCombats: previous.completedCombats.map(upgradeCombatEventStream),
    };
  }
  if (value.schemaVersion === 5) {
    const previous = value as unknown as PreviousDepthStateV5;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null
        ? null
        : { ...previous.dungeon, layoutVersion: 1, keyGate: null, latestShrineUse: null },
      combat: previous.combat === null ? null : upgradeCombatEventStream(previous.combat),
      completedCombats: previous.completedCombats.map(upgradeCombatEventStream),
    };
  }
  if (value.schemaVersion === 4) {
    const previous = value as unknown as PreviousDepthStateV4;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null
        ? null
        : { ...previous.dungeon, layoutVersion: 1, keyGate: null, latestShrineUse: null },
      counterDuel: null,
      completedCounterDuels: [],
      combat: previous.combat === null ? null : upgradeCombatEventStream(previous.combat),
      completedCombats: previous.completedCombats.map(upgradeCombatEventStream),
    };
  }
  if (value.schemaVersion === 3) {
    const previous = value as unknown as PreviousDepthStateV3;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
      counterDuel: null,
      completedCounterDuels: [],
      combat: previous.combat === null ? null : upgradeCombatEventStream(previous.combat),
      completedCombats: previous.completedCombats.map(upgradeCombatEventStream),
    };
  }
  if (value.schemaVersion === 2) {
    const previous = value as unknown as PreviousDepthStateV2;
    return {
      ...previous,
      schemaVersion: 9,
      companions: createEmptyCompanionRoster(),
      seed,
      atlas: upgradeAtlas(previous.atlas, seed),
      dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
      counterDuel: null,
      completedCounterDuels: [],
      combat: previous.combat === null ? null : upgradeCombatEventStream(previous.combat),
      completedCombats: previous.completedCombats.map(upgradeCombatEventStream),
    };
  }
  if (value.schemaVersion !== 1 || !isRecord(value.hero)) throw new RangeError("Unsupported depth schema version");
  const previous = value as unknown as PreviousDepthState;
  if (!Array.isArray(previous.completedCombats) || !Array.isArray(previous.log)) {
    throw new TypeError("Depth state collections are malformed");
  }
  const hero: DetailedHeroState = {
    ...previous.hero,
    abilities: starterAbilities(seed, heroId, previous.hero.className),
    monsterLore: [],
  };
  return {
    ...previous,
    schemaVersion: 9,
    companions: createEmptyCompanionRoster(),
    seed,
    atlas: upgradeAtlas(previous.atlas, seed),
    dungeon: previous.dungeon === null ? null : migrateDungeonTraps(previous.dungeon, seed),
    hero,
    combat: previous.combat === null ? null : upgradeCombat(previous.combat, hero),
    completedCombats: previous.completedCombats.map((combat) => upgradeCombat(combat, hero)),
    counterDuel: null,
    completedCounterDuels: [],
    discoveries: [],
    log: previous.log.length > 0
      ? previous.log
      : [{ id: `${seed}:depth:${previous.tick}:world`, tick: previous.tick, category: "world", message: `${heroName}'s adventure continues.` }],
  };
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

function completeObjective(quest: QuestState, objectiveId: string): QuestState {
  return progressQuest(quest, objectiveId, 1);
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
    level: hero.level,
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
  return {
    schemaVersion: 9,
    seed,
    tick: 0,
    atlas,
    towns: { [atlas.currentLocationId]: initialTown },
    companions: createEmptyCompanionRoster(),
    dungeon: null,
    hero: createHero(seed, heroId, heroName),
    quest: createQuest(seed),
    combat: null,
    completedCombats: [],
    counterDuel: null,
    completedCounterDuels: [],
    discoveries: [],
    log: [{ id: `${seed}:depth:0:world`, tick: 0, category: "world", message: `${heroName} begins in ${initialTown.name}.` }],
  };
}

export function stepDepth(input: DepthState, command: DepthCommand): DepthState {
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
        heroLevel: state.hero.level,
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
      return appendLog(state, "world", arrived ? `The party reaches ${state.atlas.currentLocationId}.` : "The party advances along the route.");
    }
    case "visit-town": {
      const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
      if (location?.kind !== "town") throw new Error("Current location is not a town");
      const existing = state.towns[location.id] ?? generateTown(state.seed, location.id);
      const town = visitTown(existing);
      const firstVisit = existing.visits === 0;
      state = { ...state, towns: { ...state.towns, [location.id]: town }, quest: firstVisit ? completeObjective(state.quest, "quest:visit-towns") : state.quest };
      return appendLog(state, "town", `${town.name} opens its ${town.districts.length} districts to the party.`);
    }
    case "enter-dungeon": {
      if (state.dungeon !== null && !state.dungeon.completed) throw new Error("A dungeon traversal is already active");
      let dungeon = generateDungeon(state.seed, command.dungeonId, command.width, command.height, true);
      const entry = dungeon.cells.find((cell) => cell.id === dungeon.entryCellId);
      const entryTrap = dungeonTrapAt(dungeon, dungeon.entryCellId);
      let hero = state.hero;
      let quest = state.quest;
      let message = `${dungeon.name} reveals a ${dungeon.width}×${dungeon.height} maze.`;
      if (entry?.feature === "shrine") {
        const restored = useDungeonShrine(dungeon, hero, entry.id, state.tick);
        dungeon = restored.dungeon;
        hero = restored.hero;
        quest = completeObjective(quest, "quest:find-shrine");
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
        quest = completeObjective(quest, "quest:find-shrine");
      }
      if (current?.feature === "treasure" && firstVisit) {
        const before = hero.inventory.length;
        const loot = generateLoot(state.seed, current.id);
        if (!hero.inventory.some((item) => item.id === loot.id)) hero = addItem(hero, loot);
        if (hero.inventory.length > before) quest = completeObjective(quest, "quest:collect-items");
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
          dungeon = completeResolvedDungeonExit(withDungeonTrapPhase(dungeon, currentTrap.cellId, "triggered"));
          hero = applyDungeonTrap(hero, trap);
        }
      }
      if (dungeon.completed && !state.dungeon.completed) quest = completeObjective(quest, "quest:cross-maze");
      const keyFound = keyPhaseBefore === "uncollected" && dungeon.keyGate?.phase === "carried";
      const crossedShortcut = keyPhaseBefore === "open"
        && state.dungeon.keyGate !== null
        && ((state.dungeon.currentCellId === state.dungeon.keyGate.unlockCellId && dungeon.currentCellId === state.dungeon.keyGate.shortcutCellId)
          || (state.dungeon.currentCellId === state.dungeon.keyGate.shortcutCellId && dungeon.currentCellId === state.dungeon.keyGate.unlockCellId));
      const message = check?.success === true
        ? `${hero.name} spots a ${dungeonTrapKindLabel(check.kind)} before it springs — ${check.attribute} ${check.total} meets concealment ${check.difficulty}. It must be disarmed.`
        : trap !== null && check !== null
          ? `${dungeonTrapKindLabel(check.kind)} escapes notice (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, trap, dungeon.completed)}`
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
      let consequence: DungeonTrapConsequence | null = null;
      if (!check.success) {
        consequence = resolveDungeonTrap(state.dungeon, currentTrap.cellId, true, hero.resources.health, hero.resources.maxHealth);
        hero = applyDungeonTrap(hero, consequence);
      }
      dungeon = completeResolvedDungeonExit(dungeon);
      const message = check.success
        ? `${hero.name} unthreads the ${dungeonTrapKindLabel(check.kind)} — ${check.attribute} ${check.total} meets mechanism ${check.difficulty}. The marked trap is disarmed.${dungeon.completed ? " The far stair is reached." : ""}`
        : consequence === null
          ? `The ${dungeonTrapKindLabel(check.kind)} resists, but fails harmlessly.`
          : `${hero.name}'s disarm fails (${check.attribute} ${check.total} vs ${check.difficulty}). ${dungeonTrapMessage(hero, dungeon.name, consequence, dungeon.completed)}`;
      dungeon = appendDungeonTraversalMessage(dungeon, message);
      const quest = dungeon.completed && !state.dungeon.completed ? completeObjective(state.quest, "quest:cross-maze") : state.quest;
      return appendLog({ ...state, dungeon, hero, quest }, "dungeon", message);
    }
    case "start-combat": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Combat is already active");
      if (state.counterDuel !== null) throw new Error("A counter duel is already active");
      const activeCompanion = state.companions.active[0];
      const allies = activeCompanion === undefined || activeCompanion.resources.health === 0
        ? []
        : [companionToCombatant(activeCompanion)];
      const combat = createCombat(state.seed, state.hero, command.encounterId, command.enemyCount, allies);
      const hero = observeMonsters(state.hero, combat.combatants);
      const fieldNote = counterDuelHabitUnlockText(newlyEstablishedCounterDuelHabits(state.hero.monsterLore, hero.monsterLore));
      const message = `${combat.combatants.length - 1} enemies close in.${fieldNote === null ? "" : ` ${fieldNote}`}`;
      return appendLog({ ...state, combat, hero }, "combat", message);
    }
    case "combat-action": {
      if (state.combat === null) throw new Error("No combat is active");
      const combat = resolveCombatTurn(state.combat, command.action, state.seed);
      const combatHero = combat.combatants.find((entry) => entry.id === state.hero.id);
      const hero = syncHeroFromCombat(state.hero, combatHero);
      const companionParticipated = state.companions.active.some((companion) =>
        combat.combatants.some((combatant) => combatant.id === companion.identity.residentId)
      );
      const companions = companionParticipated
        ? syncActiveCompanionCombat(state.companions, combat.combatants, combat.outcome)
        : state.companions;
      if (combat.outcome === "ongoing") return appendLog({ ...state, combat, hero, companions }, "combat", combat.log.at(-1)?.message ?? "The battle continues.");
      const completedCombats = [...state.completedCombats.slice(-(maximumCompletedCombats - 1)), combat];
      let quest = combat.outcome === "victory" ? completeObjective(state.quest, "quest:win-battle") : state.quest;
      const inventoryBeforeLoot = hero.inventory.length;
      const loot = generateLoot(state.seed, combat.id);
      const rewardedHero = equipBestItems(combat.outcome === "victory" && !hero.inventory.some((item) => item.id === loot.id) ? addItem(hero, loot) : hero);
      if (rewardedHero.inventory.length > inventoryBeforeLoot) quest = completeObjective(quest, "quest:collect-items");
      const learning = combat.outcome === "victory"
        ? recordMonsterVictory(rewardedHero, combat.combatants)
        : { hero: rewardedHero, learned: [] };
      const newDiscoveries = learning.learned.map((entry) => ({
        id: `${state.seed}:discovery:${entry.ability.id}:${state.tick}`,
        tick: state.tick,
        abilityId: entry.ability.id,
        abilityName: entry.ability.name,
        monsterId: entry.monsterId,
        monsterName: entry.monsterName,
      }));
      let next = appendLog({
        ...state,
        combat: null,
        completedCombats,
        hero: learning.hero,
        companions,
        quest,
        discoveries: [...state.discoveries, ...newDiscoveries].slice(-maximumAbilityDiscoveries),
      }, "combat", `The battle ends in ${combat.outcome}.`);
      if (newDiscoveries.length > 0) {
        next = appendLog(next, "ability", `${learning.hero.name} learns ${newDiscoveries.map((entry) => entry.abilityName).join(" and ")} from the defeated monsters.`);
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
        `${counterDuel.opponentName} bars the road with a Pattern Duel: Rush breaks Feint, Feint opens Ward, Ward stops Rush. First to 2; after round 5 the leader wins and an equal score draws. ${fieldNote ?? `${counterDuelHabitText(habit)}.`}`,
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
      if (counterDuel.outcome === "ongoing") {
        return appendLog({ ...state, counterDuel }, "combat", `Pattern Duel round ${latest.round}: ${result}`);
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
      return appendLog(
        { ...state, counterDuel: null, completedCounterDuels, hero },
        "combat",
        `Pattern Duel round ${latest.round}: ${result} The duel ends in ${counterDuel.outcome}. ${consequence}`,
      );
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
    case "progress-objective":
      return appendLog({ ...state, quest: progressQuest(state.quest, command.objectiveId, command.amount) }, "quest", `Progress advances for ${command.objectiveId}.`);
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
  }
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

function unresolvedRouteEncounterId(state: DepthState): string | null {
  if (state.atlas.route === null) return null;
  const encounterId = `encounter:route:${state.atlas.route.path.join(">")}`;
  const completed = state.completedCombats.some((combat) => combat.id === encounterId)
    || state.completedCounterDuels.some((duel) => duel.id === encounterId);
  return completed ? null : encounterId;
}

export function needsCriticalRoadsideRecovery(state: DepthState): boolean {
  return state.combat === null
    && state.counterDuel === null
    && (state.dungeon === null || state.dungeon.completed)
    && unresolvedRouteEncounterId(state) !== null
    && state.hero.resources.health * 2 <= state.hero.resources.maxHealth;
}

export function depthCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] {
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
    return legalCombatActions(combat).slice(0, 12).map((action) => {
      const actor = combat.combatants.find((entry) => entry.id === action.actorId);
      const target = combat.combatants.find((entry) => entry.id === action.targetId);
      const ability = actor?.abilities.find((entry) => entry.id === action.abilityId);
      if (actor === undefined) throw new Error("Combat candidate actor is missing");
      if (action.type !== "guard" && target === undefined) throw new Error("Combat candidate target is missing");
      if (action.type === "ability" && ability === undefined) throw new Error("Combat candidate ability is missing");
      const label = action.type === "guard"
        ? `${actor.name} guards`
        : `${actor.name} uses ${ability?.name ?? "Attack"} on ${target?.name}`;
      return commandCandidate(
        state,
        `combat:${combat.id}:${combat.turn}:${action.actorId}:${action.type}:${action.abilityId ?? "basic"}:${action.targetId ?? "self"}`,
        label,
        { type: "combat-action", action },
        actor.id,
      );
    });
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
    return [commandCandidate(state, `town:${location.id}`, `enter ${location.name}`, { type: "visit-town" })];
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
          heroLevel: state.hero.level,
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
  if (location?.kind === "dungeon" && (state.dungeon === null || state.dungeon.id !== `dungeon:${location.id}`)) {
    return [commandCandidate(
      state,
      `dungeon:${location.id}:enter`,
      `enter the maze at ${location.name}`,
      { type: "enter-dungeon", dungeonId: `dungeon:${location.id}`, width: 7, height: 7 },
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
