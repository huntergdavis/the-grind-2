import { pick, randomInt } from "../core/rng";
import { advanceRoute, generateAtlas, neighboringLocationIds, planRoute } from "./atlas";
import { chooseCombatAction, createCombat, resolveCombatTurn } from "./combat";
import { chooseDungeonMove, generateDungeon, moveDungeon } from "./dungeon";
import { addItem, createHero, createQuest, generateLoot, progressQuest } from "./rpg";
import { generateTown, visitTown } from "./towns";
import type { DepthCommand, DepthLogEntry, DepthState, DetailedHeroState, QuestState } from "./types";

export const maximumDepthLogEntries = 128;
export const maximumCompletedCombats = 4;

function appendLog(state: DepthState, category: DepthLogEntry["category"], message: string): DepthState {
  const entry: DepthLogEntry = { id: `${state.seed}:depth:${state.tick}:${category}`, tick: state.tick, category, message };
  return { ...state, log: [...state.log.slice(-(maximumDepthLogEntries - 1)), entry] };
}

function syncHeroFromCombat(hero: DetailedHeroState, combatHero: { health: number; mana: number } | undefined): DetailedHeroState {
  if (combatHero === undefined) return hero;
  return { ...hero, resources: { ...hero.resources, health: combatHero.health, mana: combatHero.mana } };
}

function completeObjective(quest: QuestState, objectiveId: string): QuestState {
  return progressQuest(quest, objectiveId, 1);
}

export function createDepthState(seed: string, heroId = "depth:hero", heroName = "Aster Vale"): DepthState {
  const atlas = generateAtlas(seed);
  const initialTown = visitTown(generateTown(seed, atlas.currentLocationId));
  return {
    schemaVersion: 1,
    seed,
    tick: 0,
    atlas,
    towns: { [atlas.currentLocationId]: initialTown },
    dungeon: null,
    hero: createHero(seed, heroId, heroName),
    quest: createQuest(seed),
    combat: null,
    completedCombats: [],
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
      return appendLog({ ...state, combat }, "combat", `${combat.combatants.length - 1} enemies close in.`);
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
      const rewardedHero = combat.outcome === "victory" && !hero.inventory.some((item) => item.id === loot.id) ? addItem(hero, loot) : hero;
      if (rewardedHero.inventory.length > inventoryBeforeLoot) quest = completeObjective(quest, "quest:collect-items");
      return appendLog({ ...state, combat: null, completedCombats, hero: rewardedHero, quest }, "combat", `The battle ends in ${combat.outcome}.`);
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
