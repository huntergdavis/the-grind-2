import { pick, randomInt } from "../core/rng";
import { advanceRoute, generateAtlas, neighboringLocationIds, planRoute } from "./atlas";
import { chooseCombatAction, createCombat, monsterAbilityForLevel, monsterDefinitions, resolveCombatTurn } from "./combat";
import { chooseDungeonMove, generateDungeon, moveDungeon } from "./dungeon";
import {
  addItem,
  createHero,
  createQuest,
  equipBestItems,
  generateLoot,
  observeMonsters,
  progressQuest,
  recordMonsterVictory,
  starterAbilities,
  trainAbility,
} from "./rpg";
import { generateTown, visitTown } from "./towns";
import type {
  CombatLogEntry,
  CombatState,
  CombatantState,
  DepthCommand,
  DepthLogEntry,
  DepthState,
  DetailedHeroState,
  QuestState,
} from "./types";

export const maximumDepthLogEntries = 128;
export const maximumCompletedCombats = 4;
export const maximumAbilityDiscoveries = 32;

type PreviousHeroState = Omit<DetailedHeroState, "abilities" | "monsterLore">;
type PreviousCombatantState = Omit<CombatantState, "abilities" | "speciesId">;
type PreviousCombatLogEntry = Omit<CombatLogEntry, "action" | "targetId" | "abilityId"> & {
  action: "attack" | "guard" | "skill" | "status";
};
type PreviousCombatState = Omit<CombatState, "combatants" | "log"> & {
  combatants: readonly PreviousCombatantState[];
  log: readonly PreviousCombatLogEntry[];
};
type PreviousDepthState = Omit<DepthState, "schemaVersion" | "hero" | "combat" | "completedCombats" | "discoveries"> & {
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
  return { ...combat, combatants, log };
}

export function upgradeDepthState(value: unknown, seed: string, heroId: string, heroName: string): DepthState {
  if (!isRecord(value)) throw new TypeError("Depth state must be an object");
  if (value.schemaVersion === 2) return value as unknown as DepthState;
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
    schemaVersion: 2,
    seed,
    hero,
    combat: previous.combat === null ? null : upgradeCombat(previous.combat, hero),
    completedCombats: previous.completedCombats.map((combat) => upgradeCombat(combat, hero)),
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

export function createDepthState(seed: string, heroId = "depth:hero", heroName = "Aster Vale"): DepthState {
  const atlas = generateAtlas(seed);
  const initialTown = visitTown(generateTown(seed, atlas.currentLocationId));
  return {
    schemaVersion: 2,
    seed,
    tick: 0,
    atlas,
    towns: { [atlas.currentLocationId]: initialTown },
    dungeon: null,
    hero: createHero(seed, heroId, heroName),
    quest: createQuest(seed),
    combat: null,
    completedCombats: [],
    discoveries: [],
    log: [{ id: `${seed}:depth:0:world`, tick: 0, category: "world", message: `${heroName} begins in ${initialTown.name}.` }],
  };
}

export function stepDepth(input: DepthState, command: DepthCommand): DepthState {
  let state: DepthState = { ...input, tick: input.tick + 1 };
  switch (command.type) {
    case "plan-route": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Cannot plan a route during combat");
      state = { ...state, atlas: planRoute(state.atlas, command.destinationId) };
      const destination = state.atlas.locations.find((location) => location.id === command.destinationId);
      return appendLog(state, "world", `A route is plotted to ${destination?.name ?? command.destinationId}.`);
    }
    case "travel": {
      const before = state.atlas.currentLocationId;
      state = { ...state, atlas: advanceRoute(state.atlas, command.distance) };
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
      const dungeon = generateDungeon(state.seed, command.dungeonId, command.width, command.height);
      return appendLog({ ...state, dungeon }, "dungeon", `${dungeon.name} reveals a ${dungeon.width}×${dungeon.height} maze.`);
    }
    case "move-dungeon": {
      if (state.dungeon === null) throw new Error("No dungeon traversal is active");
      const dungeon = moveDungeon(state.dungeon, command.direction);
      let quest = state.quest;
      let hero = state.hero;
      const current = dungeon.cells.find((cell) => cell.id === dungeon.currentCellId);
      if (current?.feature === "shrine" && !state.dungeon.visitedCellIds.includes(current.id)) quest = completeObjective(quest, "quest:find-shrine");
      if (current?.feature === "treasure" && !state.dungeon.visitedCellIds.includes(current.id)) {
        const before = hero.inventory.length;
        const loot = generateLoot(state.seed, current.id);
        if (!hero.inventory.some((item) => item.id === loot.id)) hero = addItem(hero, loot);
        if (hero.inventory.length > before) quest = completeObjective(quest, "quest:collect-items");
      }
      if (dungeon.completed && !state.dungeon.completed) quest = completeObjective(quest, "quest:cross-maze");
      return appendLog({ ...state, dungeon, hero, quest }, "dungeon", dungeon.completed ? `The far stair of ${dungeon.name} is reached.` : `The maze turns ${command.direction}.`);
    }
    case "start-combat": {
      if (state.combat !== null && state.combat.outcome === "ongoing") throw new Error("Combat is already active");
      const combat = createCombat(state.seed, state.hero, command.encounterId, command.enemyCount);
      const hero = observeMonsters(state.hero, combat.combatants);
      return appendLog({ ...state, combat, hero }, "combat", `${combat.combatants.length - 1} enemies close in.`);
    }
    case "combat-action": {
      if (state.combat === null) throw new Error("No combat is active");
      const combat = resolveCombatTurn(state.combat, command.action, state.seed);
      const combatHero = combat.combatants.find((entry) => entry.id === state.hero.id);
      const hero = syncHeroFromCombat(state.hero, combatHero);
      if (combat.outcome === "ongoing") return appendLog({ ...state, combat, hero }, "combat", combat.log.at(-1)?.message ?? "The battle continues.");
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
        quest,
        discoveries: [...state.discoveries, ...newDiscoveries].slice(-maximumAbilityDiscoveries),
      }, "combat", `The battle ends in ${combat.outcome}.`);
      if (newDiscoveries.length > 0) {
        next = appendLog(next, "ability", `${learning.hero.name} learns ${newDiscoveries.map((entry) => entry.abilityName).join(" and ")} from the defeated monsters.`);
      }
      return next;
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
    case "wait":
      return appendLog({
        ...state,
        hero: {
          ...state.hero,
          resources: {
            ...state.hero.resources,
            health: Math.min(state.hero.resources.maxHealth, state.hero.resources.health + Math.max(1, Math.ceil(state.hero.resources.maxHealth / 4))),
            mana: Math.min(state.hero.resources.maxMana, state.hero.resources.mana + Math.max(1, Math.ceil(state.hero.resources.maxMana / 4))),
          },
        },
      }, "world", "The party watches, listens, and recovers before moving on.");
  }
}

export function advanceDepth(state: DepthState): DepthState {
  if (state.combat !== null && state.combat.outcome === "ongoing") return stepDepth(state, { type: "combat-action", action: chooseCombatAction(state.combat) });
  if (state.hero.resources.health <= 0) return stepDepth(state, { type: "wait" });
  if (state.dungeon !== null && !state.dungeon.completed) {
    const direction = chooseDungeonMove(state.dungeon, state.seed, state.tick + 1);
    return direction === null ? stepDepth(state, { type: "wait" }) : stepDepth(state, { type: "move-dungeon", direction });
  }
  const latestDiscovery = state.discoveries.at(-1);
  if (latestDiscovery?.tick === state.tick) {
    return stepDepth(state, { type: "train-ability", abilityId: latestDiscovery.abilityId });
  }
  if (state.tick > 0 && state.tick % 29 === 0 && state.hero.abilities.length > 0) {
    const ability = [...state.hero.abilities].sort((left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0];
    if (ability !== undefined) return stepDepth(state, { type: "train-ability", abilityId: ability.id });
  }
  if (state.atlas.route !== null) {
    if (state.tick > 0 && state.tick % 11 === 0) return stepDepth(state, { type: "start-combat", encounterId: `encounter:${state.tick}`, enemyCount: 1 + randomInt(2, state.seed, "depth-director", state.hero.id, state.tick, "enemy-count") });
    return stepDepth(state, { type: "travel", distance: 6 + randomInt(8, state.seed, "depth-director", state.hero.id, state.tick, "travel-distance") });
  }
  const location = state.atlas.locations.find((entry) => entry.id === state.atlas.currentLocationId);
  if (location?.kind === "town" && state.towns[location.id] === undefined) return stepDepth(state, { type: "visit-town" });
  if (location?.kind === "dungeon" && (state.dungeon === null || state.dungeon.id !== `dungeon:${location.id}`)) return stepDepth(state, { type: "enter-dungeon", dungeonId: `dungeon:${location.id}`, width: 7, height: 7 });
  const neighbors = neighboringLocationIds(state.atlas, state.atlas.currentLocationId);
  if (neighbors.length === 0) return stepDepth(state, { type: "wait" });
  const destinationId = pick(neighbors, state.seed, "depth-director", state.atlas.currentLocationId, state.tick, "destination");
  return stepDepth(state, { type: "plan-route", destinationId });
}
