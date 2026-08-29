import { pick, randomInt } from "./rng";
import type {
  ActorChoice,
  ChronicleEntry,
  HeroValue,
  Opportunity,
  SceneMode,
  SceneState,
  WorldState,
} from "./types";

const givenNames = [
  "Aster",
  "Bryn",
  "Corin",
  "Dara",
  "Elowen",
  "Fen",
  "Iria",
  "Joren",
  "Kael",
  "Mira",
  "Nessa",
  "Orin",
] as const;

const familyNames = [
  "Ashvale",
  "Brightwater",
  "Dawnward",
  "Emberlane",
  "Foxglove",
  "Greyhaven",
  "Mossbrook",
  "Rook",
  "Starling",
  "Thornfield",
] as const;

const locations = [
  "Mosslight",
  "The Amber Road",
  "Lake Vey",
  "The Old King’s Maze",
  "Briarwatch",
  "Moonwell Camp",
] as const;

const monsters = [
  "lantern wolf",
  "mossback beetle",
  "river wyrmling",
  "copperhorn ram",
  "inkcap mimic",
] as const;

const sceneOrder: readonly SceneMode[] = [
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "camp",
  "chronicle",
];

const actionSets: Record<SceneMode, readonly string[]> = {
  town: ["ask after the missing courier", "restock quietly", "help at the gate"],
  atlas: ["take the river road", "cross the old bridge", "follow the ridge"],
  travel: ["study the tracks", "press onward", "wait for safer light"],
  dungeon: ["mark the passage", "open the sealed door", "search for a loop"],
  battle: ["hold the line", "exploit an opening", "protect the wounded"],
  camp: ["share the watch", "repair old gear", "write home"],
  chronicle: ["remember the promise", "name the lesson", "plan the return"],
};

function heroName(seed: string): string {
  const first = pick(givenNames, seed, "identity", "hero", 0, "given-name");
  const family = pick(familyNames, seed, "identity", "hero", 0, "family-name");
  return `${first} ${family}`;
}

function heroValues(seed: string): readonly HeroValue[] {
  const all: readonly HeroValue[] = ["curiosity", "loyalty", "mercy", "courage"];
  const first = pick(all, seed, "identity", "hero", 0, "value", 0);
  const second = pick(
    all.filter((value) => value !== first),
    seed,
    "identity",
    "hero",
    0,
    "value",
    1,
  );
  return [first, second];
}

function initialScene(name: string): SceneState {
  return {
    mode: "town",
    location: "Mosslight",
    headline: `${name} wakes before the bells.`,
    action: "A road waits beyond the town gate.",
    goal: "Find the missing courier",
    consequence: "A new adventure has begun",
    sensoryIntensity: 0,
  };
}

export function createWorld(seed: string, campaignId: string): WorldState {
  const name = heroName(seed);
  return {
    schemaVersion: 1,
    campaignId,
    campaignPolicy: "EternalHero",
    seed,
    tick: 0,
    hero: {
      id: `hero:${campaignId}`,
      name,
      level: 1,
      mastery: 0,
      experience: 0,
      health: 12,
      maxHealth: 12,
      gold: 8,
      values: heroValues(seed),
    },
    scene: initialScene(name),
    chronicle: [],
  };
}

export function campaignDirector(state: WorldState): Opportunity {
  const nextTick = state.tick + 1;
  const mode = sceneOrder[nextTick % sceneOrder.length];
  if (mode === undefined) throw new Error("Scene order is empty");

  const location =
    mode === "town"
      ? "Mosslight"
      : mode === "camp"
        ? "Moonwell Camp"
        : mode === "battle"
          ? "Briarwatch"
          : pick(
              locations,
              state.seed,
              "world",
              state.hero.id,
              nextTick,
              "location",
            );

  const goals: Record<SceneMode, string> = {
    town: "Return with news",
    atlas: "Choose a route",
    travel: "Reach Briarwatch",
    dungeon: "Find the courier’s trail",
    battle: "Survive without abandoning anyone",
    camp: "Recover and decide what comes next",
    chronicle: "Understand what the journey changed",
  };

  return { mode, location, goal: goals[mode], actions: actionSets[mode] };
}

export function actorPolicy(state: WorldState, opportunity: Opportunity): ActorChoice {
  const preferredOrdinal = state.hero.values.includes("mercy") ? 2 : 0;
  const action = pick(
    opportunity.actions,
    state.seed,
    "actor-policy",
    state.hero.id,
    state.tick + 1,
    state.hero.values.join("+"),
    preferredOrdinal,
  );
  return {
    action,
    consideredActions: opportunity.actions,
    rationale: `${state.hero.name} chose ${action} out of ${state.hero.values.join(" and ")}.`,
  };
}

function describeBeat(
  state: WorldState,
  opportunity: Opportunity,
  choice: ActorChoice,
): SceneState {
  const nextTick = state.tick + 1;
  const monster = pick(
    monsters,
    state.seed,
    "ecology",
    state.hero.id,
    nextTick,
    "encounter",
  );
  const descriptions: Record<SceneMode, Omit<SceneState, "mode" | "location" | "goal">> = {
    town: {
      headline: "The town remembers who came back.",
      action: `${state.hero.name} helps Mosslight prepare for nightfall.`,
      consequence: "A gatekeeper now owes the party a favor",
      sensoryIntensity: 1,
    },
    atlas: {
      headline: "The map becomes a decision.",
      action: `${state.hero.name} studies weather, rumors, and the old roads.`,
      consequence: `The party will ${choice.action}`,
      sensoryIntensity: 0,
    },
    travel: {
      headline: "Something has crossed the road ahead.",
      action: `Fresh ${monster} tracks bend toward Briarwatch.`,
      consequence: "A safer return route is marked",
      sensoryIntensity: 1,
    },
    dungeon: {
      headline: "The maze opens into an older story.",
      action: `${state.hero.name} chooses to ${choice.action}.`,
      consequence: "A locked loop and a hidden shortcut are revealed",
      sensoryIntensity: 1,
    },
    battle: {
      headline: `A ${monster} guards the courier’s satchel.`,
      action: `${state.hero.name} decides to ${choice.action}.`,
      consequence: "The creature retreats; the satchel is recovered",
      sensoryIntensity: 3,
    },
    camp: {
      headline: "Firelight turns danger into memory.",
      action: `${state.hero.name} chooses to ${choice.action}.`,
      consequence: "The party recovers and trust quietly deepens",
      sensoryIntensity: 0,
    },
    chronicle: {
      headline: "A small deed becomes part of the legend.",
      action: "The Chronicle binds tracks, choices, and consequences together.",
      consequence: "The missing courier’s route points beyond the lake",
      sensoryIntensity: 0,
    },
  };

  return {
    mode: opportunity.mode,
    location: opportunity.location,
    goal: opportunity.goal,
    ...descriptions[opportunity.mode],
  };
}

export function rulesEngine(
  state: WorldState,
  opportunity: Opportunity,
  choice: ActorChoice,
): WorldState {
  if (!opportunity.actions.includes(choice.action)) {
    throw new Error("Actor Policy selected an illegal action");
  }

  const tick = state.tick + 1;
  const scene = describeBeat(state, opportunity, choice);
  const experienceGain =
    opportunity.mode === "battle"
      ? 8
      : opportunity.mode === "dungeon"
        ? 4
        : 1;
  const experience = state.hero.experience + experienceGain;
  const level = Math.min(50, 1 + Math.floor(Math.sqrt(experience / 12)));
  const mastery = Math.floor(experience / 250);
  const battleDamage =
    opportunity.mode === "battle"
      ? 1 + randomInt(4, state.seed, "battle", state.hero.id, tick, "damage")
      : 0;
  const health =
    opportunity.mode === "camp"
      ? state.hero.maxHealth
      : Math.max(1, state.hero.health - battleDamage);
  const gold = state.hero.gold + (opportunity.mode === "battle" ? 5 : 0);

  const entry: ChronicleEntry = {
    id: `${state.campaignId}:${tick}`,
    tick,
    attention:
      opportunity.mode === "battle" || opportunity.mode === "dungeon"
        ? "queueForPresentation"
        : "backgroundSafe",
    consideredActions: choice.consideredActions,
    chosenAction: choice.action,
    rationale: choice.rationale,
    ...scene,
  };

  return {
    ...state,
    tick,
    hero: { ...state.hero, experience, level, mastery, health, gold },
    scene,
    chronicle: [...state.chronicle.slice(-31), entry],
  };
}

export function advanceWorld(state: WorldState): WorldState {
  const opportunity = campaignDirector(state);
  const choice = actorPolicy(state, opportunity);
  return rulesEngine(state, opportunity, choice);
}
