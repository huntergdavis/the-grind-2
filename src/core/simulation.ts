import { abilityExperienceCeiling, createDepthState, depthCommandCandidates, stepDepth, upgradeDepthState } from "../depth";
import type { DepthCommand, DepthCommandCandidate } from "../depth";
import { pick, randomInt } from "./rng";
import type {
  ActorChoice,
  AttentionPolicy,
  ChronicleEntry,
  EventPolicy,
  HeroValue,
  Opportunity,
  SceneMode,
  SceneState,
  WorldState,
} from "./types";

export const maximumCatchUpTicks = 96;
const worldMinutesPerTick = 15;
const maximumWallClockJournalEntries = 32;
const maximumAttentionQueueEntries = 16;

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

function initialScene(name: string, location: string): SceneState {
  return {
    mode: "town",
    location,
    headline: `${name} wakes before the bells.`,
    action: "A road waits beyond the town gate.",
    goal: "Find the missing courier",
    consequence: "A new adventure has begun",
    sensoryIntensity: 0,
  };
}

export function createWorld(seed: string, campaignId: string): WorldState {
  const name = heroName(seed);
  const heroId = `hero:${campaignId}`;
  const depth = createDepthState(seed, heroId, name);
  return {
    schemaVersion: 4,
    campaignId,
    campaignPolicy: "EternalHero",
    seed,
    tick: 0,
    hero: {
      id: heroId,
      name,
      level: depth.hero.level,
      mastery: 0,
      experience: depth.hero.experience,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
      gold: depth.hero.gold,
      values: heroValues(seed),
    },
    scene: initialScene(name, depth.towns[depth.atlas.currentLocationId]?.name ?? "The road"),
    chronicle: [],
    lifecycle: {
      policyVersion: 1,
      simulationTick: 0,
      worldClockMinutes: 0,
      attentionClock: 0,
      presentationTimeMs: 0,
      maximumCatchUpTicks,
      wallClockJournal: [],
    },
    pendingAttention: [],
    depth,
  };
}

export function attentionPolicyForMode(mode: SceneMode): AttentionPolicy {
  if (mode === "battle") return "forbiddenDuringCatchUp";
  if (mode === "dungeon" || mode === "training" || mode === "discovery" || mode === "chronicle") return "queueForPresentation";
  return "backgroundSafe";
}

export function eventPolicyForMode(mode: SceneMode): EventPolicy {
  const attention = attentionPolicyForMode(mode);
  if (attention === "backgroundSafe") {
    return {
      attention,
      reversible: true,
      maximumFidelityAffected: "aggregate",
      thresholdBehavior: "continue",
      maximumCreditedDurationTicks: maximumCatchUpTicks,
      aggregation: "summarize",
      queuedFallback: "chronicle-summary",
    };
  }

  return {
    attention,
    reversible: false,
    maximumFidelityAffected: mode === "battle" || mode === "discovery" ? "canonicalNamed" : "supporting",
    thresholdBehavior:
      attention === "forbiddenDuringCatchUp"
        ? "forbiddenDuringCatchUp"
        : "stopBeforeNamedThreshold",
    maximumCreditedDurationTicks: 0,
    aggregation: "none",
    queuedFallback: "present-in-foreground",
  };
}

export function campaignDirector(state: WorldState): Opportunity {
  const { depth } = state;
  const candidates = depthCommandCandidates(depth);
  if (candidates.length === 0) throw new Error("Campaign Director found no legal commands");
  const current = depth.atlas.locations.find(
    (location) => location.id === depth.atlas.currentLocationId,
  );
  const modes = [...new Set(candidates.map((candidate) => sceneModeForCommand(state, candidate.command)))];
  if (modes.length !== 1) throw new Error("One opportunity cannot mix presentation modes");
  const mode = modes[0];
  if (mode === undefined) throw new Error("Campaign Director found no presentation mode");

  const location =
    mode === "dungeon"
      ? depth.dungeon?.name ?? current?.name ?? "Unknown maze"
      : mode === "town"
        ? depth.towns[depth.atlas.currentLocationId]?.name ?? current?.name ?? "Unknown town"
        : current?.name ?? "Uncharted road";
  const activeObjective = [
    ...depth.quest.objectives,
    ...depth.quest.subquests.flatMap((subquest) => subquest.objectives),
  ].find((objective) => objective.status === "active");
  const goal = activeObjective?.description ?? "Decide what the legend becomes next";

  return { mode, location, goal, candidates };
}

export function sceneModeForCommand(state: WorldState, command: DepthCommand): SceneMode {
  switch (command.type) {
    case "plan-route":
      return "atlas";
    case "travel":
      return "travel";
    case "visit-town":
      return "town";
    case "enter-dungeon":
    case "move-dungeon":
      return "dungeon";
    case "start-combat":
    case "combat-action":
      return "battle";
    case "train-ability":
      return state.depth.discoveries.at(-1)?.tick === state.depth.tick
        ? "discovery"
        : "training";
    case "progress-objective":
      return "chronicle";
    case "wait":
      return "camp";
  }
}

function experienceGainForCommand(command: DepthCommand): number {
  switch (command.type) {
    case "start-combat":
    case "combat-action":
      return 8;
    case "enter-dungeon":
    case "move-dungeon":
      return 4;
    default:
      return 1;
  }
}

interface CandidateScore {
  candidate: DepthCommandCandidate;
  score: number;
  reason: string;
  tieBreak: number;
}

function dungeonDestinationFeature(state: WorldState, candidate: DepthCommandCandidate): string | undefined {
  if (candidate.command.type !== "move-dungeon" || state.depth.dungeon === null) return undefined;
  const current = state.depth.dungeon.cells.find((cell) => cell.id === state.depth.dungeon?.currentCellId);
  if (current === undefined) return undefined;
  const offsets = {
    north: [0, -1],
    east: [1, 0],
    south: [0, 1],
    west: [-1, 0],
  } as const;
  const offset = offsets[candidate.command.direction];
  return state.depth.dungeon.cells.find(
    (cell) => cell.x === current.x + offset[0] && cell.y === current.y + offset[1],
  )?.feature;
}

function scoreCandidate(state: WorldState, candidate: DepthCommandCandidate): CandidateScore {
  const command = candidate.command;
  let score = 10;
  let reason = "it is the clearest legal next step";

  if (command.type === "combat-action" && state.depth.combat !== null) {
    const actor = state.depth.combat.combatants.find((entry) => entry.id === command.action.actorId);
    const target = state.depth.combat.combatants.find((entry) => entry.id === command.action.targetId);
    const ability = actor?.abilities.find((entry) => entry.id === command.action.abilityId);
    const lowHealth = actor !== undefined && actor.health * 3 <= actor.maxHealth;
    if (command.action.type === "guard") {
      score = lowHealth ? 120 : 4;
      reason = lowHealth
        ? `guarding at ${actor?.health ?? 0}/${actor?.maxHealth ?? 0} health may prevent defeat`
        : "a measured defense preserves momentum";
    } else {
      const projectedDamage = Math.max(1, (actor?.power ?? 1) + (ability?.potency ?? 0) - Math.floor((target?.armor ?? 0) / 2));
      const finishesTarget = target !== undefined && projectedDamage >= target.health;
      score = command.action.type === "ability" ? 28 + (ability?.potency ?? 0) : 18;
      if (finishesTarget) {
        score += 45 - Math.max(0, projectedDamage - (target?.health ?? 0));
        reason = `${ability?.name ?? "the strike"} can finish ${target?.name ?? "the target"} with little waste`;
      } else if (ability !== undefined) {
        reason = actor?.side === "enemies"
          ? `${ability.name} is the strongest available signature technique`
          : `${ability.name} creates a useful ${ability.effect} opening`;
      } else {
        reason = `${target?.name ?? "the target"} is the most vulnerable foe in reach`;
      }
      if (actor?.side === "heroes") {
        if (state.hero.values.includes("curiosity") && ability !== undefined) {
          score += Math.max(1, 10 - Math.min(9, ability.uses));
          reason = `curiosity favors testing ${ability.name}, used ${ability.uses} times`;
        }
        if (state.hero.values.includes("courage")) score += command.action.type === "ability" ? 7 : 3;
        if (state.hero.values.includes("mercy") && ability !== undefined && (ability.effect === "weaken" || ability.effect === "poison")) {
          score += 6;
          reason = `mercy favors ${ability.effect} control over a reckless blow`;
        }
      }
    }
  } else if (command.type === "plan-route") {
    const destination = state.depth.atlas.locations.find((entry) => entry.id === command.destinationId);
    const unknown = !state.depth.atlas.discoveredLocationIds.includes(command.destinationId);
    score = 12;
    if (unknown && state.hero.values.includes("curiosity")) {
      score += 20;
      reason = `${destination?.name ?? "the destination"} is still unknown`;
    }
    if (state.hero.values.includes("courage")) {
      score += destination?.danger ?? 0;
      if ((destination?.danger ?? 0) >= 6) reason = `courage accepts its danger ${destination?.danger ?? 0}`;
    }
    if (destination?.kind === "town" && state.hero.values.includes("mercy")) {
      score += 12;
      reason = "a settlement offers people to help and stories to follow";
    }
    if (state.depth.hero.resources.health * 2 < state.depth.hero.resources.maxHealth) {
      score += destination?.kind === "town" ? 80 : -(destination?.danger ?? 0) * 6;
      reason = destination?.kind === "town"
        ? "low health makes a safe settlement the responsible destination"
        : "the wounded traveler weighs safety against the unknown";
    }
  } else if (command.type === "travel") {
    const wounded = state.depth.hero.resources.health * 2 < state.depth.hero.resources.maxHealth;
    score = wounded ? 30 - command.distance : 10 + command.distance;
    if (state.hero.values.includes("courage") && !wounded) score += command.distance;
    reason = wounded
      ? "a shorter pace protects dwindling health"
      : command.distance >= 13
        ? "the road is clear enough for a bold pace"
        : "a steady pace keeps the route readable";
  } else if (command.type === "move-dungeon") {
    const feature = dungeonDestinationFeature(state, candidate);
    score = feature === "treasure" || feature === "shrine" ? 35 : feature === "trap" ? 3 : 16;
    reason = feature === "treasure"
      ? "the mapped chamber promises treasure"
      : feature === "shrine"
        ? "the mapped shrine may advance the quest"
        : feature === "trap"
          ? "the trapped passage is accepted only if other routes are worse"
          : "the passage advances the maze without inventing unknown facts";
  } else if (command.type === "train-ability") {
    const ability = state.depth.hero.abilities.find((entry) => entry.id === command.abilityId);
    score = 30 - Math.min(20, ability?.experience ?? 0);
    if (state.hero.values.includes("curiosity")) score += 8;
    reason = `${ability?.name ?? "the technique"} has the most room to grow`;
  } else if (command.type === "start-combat") {
    score = 50;
    reason = "the road encounter has crossed the unavoidable threshold";
  } else if (command.type === "wait") {
    score = state.depth.hero.resources.health < state.depth.hero.resources.maxHealth ? 100 : 5;
    reason = "recovery is safer than an illegal or impossible move";
  }

  return {
    candidate,
    score,
    reason,
    tieBreak: randomInt(1_000_000, state.seed, "actor-policy", candidate.id, state.tick + 1, "exact-tie"),
  };
}

function decisionActorName(state: WorldState, candidate: DepthCommandCandidate): string {
  if (candidate.command.type !== "combat-action") return state.hero.name;
  const actorId = candidate.command.action.actorId;
  return state.depth.combat?.combatants.find(
    (entry) => entry.id === actorId,
  )?.name ?? state.hero.name;
}

export function actorPolicy(state: WorldState, opportunity: Opportunity): ActorChoice {
  const ranked = opportunity.candidates
    .map((candidate) => scoreCandidate(state, candidate))
    .sort((left, right) => right.score - left.score || left.tieBreak - right.tieBreak || (left.candidate.id < right.candidate.id ? -1 : 1));
  const selected = ranked[0];
  if (selected === undefined) throw new Error("Actor Policy found no legal choice");
  const actorName = decisionActorName(state, selected.candidate);
  return {
    commandId: `${state.campaignId}:${selected.candidate.id}`,
    command: selected.candidate.command,
    action: selected.candidate.label,
    consideredCommandIds: ranked.slice(0, 4).map((entry) => `${state.campaignId}:${entry.candidate.id}`),
    consideredActions: ranked.slice(0, 4).map((entry) => entry.candidate.label),
    rationale: `${actorName} chose to ${selected.candidate.label} because ${selected.reason}.`,
  };
}

function describeBeat(
  state: WorldState,
  opportunity: Opportunity,
  choice: ActorChoice,
): SceneState {
  const { depth } = state;
  const town = depth.towns[depth.atlas.currentLocationId];
  const route = depth.atlas.route;
  const destination =
    route === null
      ? undefined
      : depth.atlas.locations.find((location) => location.id === route.destinationId);
  const dungeon = depth.dungeon;
  const combat = depth.combat ?? depth.completedCombats.at(-1);
  const activeCombatant = combat?.combatants.find(
    (combatant) => combatant.id === combat.turnOrder[combat.activeIndex],
  );
  const latestCombatAction = combat === undefined
    ? undefined
    : [...combat.log].reverse().find((entry) => entry.action !== "status");
  const latestCombatActor = combat?.combatants.find(
    (combatant) => combatant.id === latestCombatAction?.actorId,
  );
  const latestCombatTarget = combat?.combatants.find(
    (combatant) => combatant.id === latestCombatAction?.targetId,
  );
  const latestAbility = latestCombatActor?.abilities.find(
    (ability) => ability.id === latestCombatAction?.abilityId,
  );
  const sceneDiscovery = depth.discoveries.at(-1);
  const discoveredAbility = depth.hero.abilities.find(
    (ability) => ability.id === sceneDiscovery?.abilityId,
  );
  const trainingAbility = [...depth.hero.abilities].sort(
    (left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[0];
  const currentCell = dungeon?.cells.find((cell) => cell.id === dungeon.currentCellId);
  const latestLog = depth.log.at(-1)?.message;
  const descriptions: Record<SceneMode, Omit<SceneState, "mode" | "location" | "goal">> = {
    town: {
      headline: town === undefined ? "A settlement waits beyond the road." : `${town.name} is awake and changing.`,
      action:
        town === undefined
          ? `${state.hero.name} looks for a safe gate.`
          : `${state.hero.name} walks ${town.districts.length} districts known for ${town.specialty}.`,
      consequence:
        town === undefined
          ? latestLog ?? "The town is being discovered"
          : `${town.residents.length} residents remember visit ${town.visits}`,
      sensoryIntensity: 1,
    },
    atlas: {
      headline: route === null ? "The map becomes a decision." : `A real route leads to ${destination?.name ?? "the unknown"}.`,
      action: route === null
        ? `${state.hero.name} chooses to ${choice.action}.`
        : `${state.hero.name} chooses to ${choice.action}; ${route.path.length - 1} legs cover ${route.totalDistance} miles.`,
      consequence: latestLog ?? `The party will ${choice.action}`,
      sensoryIntensity: 0,
    },
    travel: {
      headline: `The road unfolds toward ${destination?.name ?? "the next landmark"}.`,
      action: `${state.hero.name} chooses to ${choice.action}; ${route?.distanceTravelled ?? 0} of ${route?.totalDistance ?? 0} miles are behind the party.`,
      consequence: latestLog ?? "Another stretch of the route is now known",
      sensoryIntensity: 1,
    },
    dungeon: {
      headline: dungeon === null ? "A sealed stair descends." : `${dungeon.name}: passage ${dungeon.turns + 1}.`,
      action:
        dungeon === null
          ? `${state.hero.name} prepares to enter.`
          : `${dungeon.visitedCellIds.length}/${dungeon.cells.length} chambers visited; this one holds ${currentCell?.feature ?? "darkness"}.`,
      consequence: dungeon?.traversalLog.at(-1) ?? latestLog ?? "The maze remains unsolved",
      sensoryIntensity: 1,
    },
    battle: {
      headline:
        combat === undefined
          ? "Danger steps onto the road."
          : latestCombatAction === undefined
            ? `Round ${combat.round}: ${activeCombatant?.name ?? "the battle"} has the turn.`
            : latestCombatAction.action === "guard"
              ? `${latestCombatActor?.name ?? "A combatant"} takes guard.`
              : `${latestCombatActor?.name ?? "A combatant"} uses ${latestAbility?.name ?? "Attack"} on ${latestCombatTarget?.name ?? "a target"}.`,
      action: latestCombatAction?.message ?? `${state.hero.name} decides to ${choice.action}.`,
      consequence:
        combat === undefined
          ? "The danger has not declared its intent"
          : combat.outcome === "ongoing"
            ? `Next: ${activeCombatant?.name ?? "unknown"}; ${combat.combatants.filter((unit) => unit.health > 0).length} remain standing`
            : `The battle ends in ${combat.outcome}`,
      sensoryIntensity: 3,
    },
    training: {
      headline: `${depth.hero.name} refines ${trainingAbility?.name ?? "a familiar art"}.`,
      action: latestLog ?? `${depth.hero.name} chooses to ${choice.action}.`,
      consequence: trainingAbility === undefined
        ? "Practice waits for a known technique"
        : `Level ${trainingAbility.level} · ${trainingAbility.experience}/${abilityExperienceCeiling(trainingAbility.level)} mastery · ${trainingAbility.uses} battle uses`,
      sensoryIntensity: 1,
    },
    discovery: {
      headline: `${depth.hero.name} unlocks ${discoveredAbility?.name ?? sceneDiscovery?.abilityName ?? "a monster secret"}.`,
      action: sceneDiscovery === undefined
        ? `${depth.hero.name} reconstructs an impossible movement.`
        : `${sceneDiscovery.monsterName} revealed the pattern; ${depth.hero.name} makes it their own.`,
      consequence: discoveredAbility === undefined
        ? "The secret is being recorded"
        : `${discoveredAbility.kind} · ${discoveredAbility.effect} · ${discoveredAbility.manaCost} mana · ${discoveredAbility.potency} potency`,
      sensoryIntensity: 3,
    },
    camp: {
      headline: "Firelight turns danger into memory.",
      action: latestLog ?? `${state.hero.name} chooses to ${choice.action}.`,
      consequence: `${depth.hero.resources.health}/${depth.hero.resources.maxHealth} health; the road can wait a moment`,
      sensoryIntensity: 0,
    },
    chronicle: {
      headline: depth.quest.title,
      action: depth.quest.summary,
      consequence: latestLog ?? "The Chronicle binds choices and consequences together",
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
  const selected = opportunity.candidates.find(
    (candidate) => `${state.campaignId}:${candidate.id}` === choice.commandId,
  );
  if (
    selected === undefined ||
    JSON.stringify(selected.command) !== JSON.stringify(choice.command) ||
    !choice.consideredCommandIds.includes(choice.commandId) ||
    choice.consideredCommandIds.length > 4
  ) {
    throw new Error("Actor Policy selected an illegal action");
  }

  const tick = state.tick + 1;
  let depth = stepDepth(state.depth, choice.command);
  const experienceGain = experienceGainForCommand(choice.command);
  const experience = depth.hero.experience + experienceGain;
  const level = Math.min(50, 1 + Math.floor(Math.sqrt(experience / 12)));
  const mastery = Math.floor(experience / 250);
  const justWon =
    depth.completedCombats.at(-1)?.id !== state.depth.completedCombats.at(-1)?.id &&
    depth.completedCombats.at(-1)?.outcome === "victory";
  const gold = Math.min(Number.MAX_SAFE_INTEGER, depth.hero.gold + (justWon ? 5 : 0));
  const health = depth.hero.resources.health;
  depth = {
    ...depth,
    hero: {
      ...depth.hero,
      level,
      experience,
      gold,
      resources: { ...depth.hero.resources, health },
    },
  };
  const scene = describeBeat({ ...state, depth }, opportunity, choice);

  const entry: ChronicleEntry = {
    id: `${state.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode(opportunity.mode),
    consideredActions: choice.consideredActions,
    chosenAction: choice.action,
    rationale: choice.rationale,
    commandId: choice.commandId,
    commandType: choice.command.type,
    consideredCommandIds: choice.consideredCommandIds,
    policy: eventPolicyForMode(opportunity.mode),
    ...scene,
  };

  return {
    ...state,
    tick,
    hero: {
      ...state.hero,
      experience,
      level,
      mastery,
      health,
      maxHealth: depth.hero.resources.maxHealth,
      gold,
    },
    depth,
    scene,
    chronicle: [...state.chronicle.slice(-31), entry],
    lifecycle: {
      ...state.lifecycle,
      simulationTick: tick,
      worldClockMinutes: state.lifecycle.worldClockMinutes + worldMinutesPerTick,
      attentionClock:
        state.lifecycle.attentionClock +
        (entry.attention === "backgroundSafe" ? 0 : 1),
    },
    pendingAttention: state.pendingAttention.filter((event) => event.tick !== tick),
  };
}

export function advanceWorld(state: WorldState): WorldState {
  const opportunity = campaignDirector(state);
  const choice = actorPolicy(state, opportunity);
  return rulesEngine(state, opportunity, choice);
}

export interface CatchUpRequest {
  id: string;
  observedAtMs: number;
  elapsedMs: number;
  requestedTicks: number;
}

function nonNegativeSafeInteger(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

export function catchUpWorld(state: WorldState, request: CatchUpRequest): WorldState {
  if (state.lifecycle.wallClockJournal.some((entry) => entry.id === request.id)) {
    return state;
  }

  const requestedTicks = nonNegativeSafeInteger(request.requestedTicks);
  const creditedTicks = Math.min(requestedTicks, state.lifecycle.maximumCatchUpTicks);
  let next = state;
  let appliedTicks = 0;
  let stoppedAtEventId: string | undefined;

  while (appliedTicks < creditedTicks) {
    const opportunity = campaignDirector(next);
    const choice = actorPolicy(next, opportunity);
    const policy = eventPolicyForMode(opportunity.mode);
    if (policy.attention !== "backgroundSafe") {
      const id = `${next.campaignId}:${next.tick + 1}:attention`;
      stoppedAtEventId = id;
      if (!next.pendingAttention.some((event) => event.id === id)) {
        next = {
          ...next,
          pendingAttention: [
            ...next.pendingAttention.slice(-(maximumAttentionQueueEntries - 1)),
            {
              id,
              tick: next.tick + 1,
              mode: opportunity.mode,
              location: opportunity.location,
              goal: opportunity.goal,
              reason: `Foreground attention required for ${opportunity.mode}.`,
              policy,
              commandId: choice.commandId,
              commandType: choice.command.type,
            },
          ],
        };
      }
      break;
    }

    next = rulesEngine(next, opportunity, choice);
    appliedTicks += 1;
  }

  const observation = {
    id: request.id,
    observedAtMs: nonNegativeSafeInteger(request.observedAtMs),
    elapsedMs: nonNegativeSafeInteger(request.elapsedMs),
    requestedTicks,
    creditedTicks,
    appliedTicks,
    ...(stoppedAtEventId === undefined ? {} : { stoppedAtEventId }),
  };

  return {
    ...next,
    lifecycle: {
      ...next.lifecycle,
      wallClockJournal: [
        ...next.lifecycle.wallClockJournal.slice(-(maximumWallClockJournalEntries - 1)),
        observation,
      ],
    },
  };
}

type LegacyChronicleEntry = Omit<ChronicleEntry, "policy"> & {
  policy?: EventPolicy;
};

type PreviousWorldState = Omit<
  WorldState,
  "schemaVersion" | "lifecycle" | "pendingAttention" | "chronicle" | "depth"
> & {
  schemaVersion: 1 | 2;
  lifecycle?: WorldState["lifecycle"];
  pendingAttention?: WorldState["pendingAttention"];
  chronicle: readonly LegacyChronicleEntry[];
};

type PreviousWorldStateV3 = Omit<WorldState, "schemaVersion" | "depth"> & {
  schemaVersion: 3;
  depth: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function assertWorldState(state: WorldState): WorldState {
  const modes: readonly SceneMode[] = [
    "town",
    "atlas",
    "travel",
    "dungeon",
    "battle",
    "training",
    "discovery",
    "camp",
    "chronicle",
  ];
  const commandTypes: readonly DepthCommand["type"][] = [
    "plan-route",
    "travel",
    "visit-town",
    "enter-dungeon",
    "move-dungeon",
    "start-combat",
    "combat-action",
    "train-ability",
    "progress-objective",
    "wait",
  ];
  const validChronicle = state.chronicle.every((entry) => {
    if (
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      !isNonNegativeSafeInteger(entry.tick) ||
      entry.tick > state.tick ||
      typeof entry.chosenAction !== "string" ||
      typeof entry.rationale !== "string" ||
      !Array.isArray(entry.consideredActions) ||
      entry.consideredActions.length > 4
    ) return false;
    const hasCommandMetadata = entry.commandId !== undefined || entry.commandType !== undefined || entry.consideredCommandIds !== undefined;
    if (!hasCommandMetadata) return true;
    return (
      typeof entry.commandId === "string" &&
      entry.commandId.length > 0 &&
      commandTypes.includes(entry.commandType as DepthCommand["type"]) &&
      Array.isArray(entry.consideredCommandIds) &&
      entry.consideredCommandIds.length >= 1 &&
      entry.consideredCommandIds.length <= 4 &&
      entry.consideredCommandIds.includes(entry.commandId)
    );
  });
  const validPendingAttention = state.pendingAttention.every((entry) => {
    const hasCommandMetadata = entry.commandId !== undefined || entry.commandType !== undefined;
    if (!hasCommandMetadata) return true;
    return typeof entry.commandId === "string" && entry.commandId.length > 0 && commandTypes.includes(entry.commandType as DepthCommand["type"]);
  });
  const abilityIds = state.depth.hero.abilities.map((ability) => ability.id);
  const loreIds = state.depth.hero.monsterLore.map((entry) => entry.monsterId);
  const discoveryIds = state.depth.discoveries.map((entry) => entry.id);
  const validAbilities =
    new Set(abilityIds).size === abilityIds.length &&
    state.depth.hero.abilities.every((ability) =>
      ability.id.length > 0 &&
      ability.name.length > 0 &&
      Number.isSafeInteger(ability.level) &&
      ability.level >= 1 &&
      ability.level <= 20 &&
      isNonNegativeSafeInteger(ability.experience) &&
      ability.experience <= 6 * 19 ** 2 &&
      isNonNegativeSafeInteger(ability.uses) &&
      isNonNegativeSafeInteger(ability.manaCost) &&
      isNonNegativeSafeInteger(ability.potency)
    );
  const validLore =
    new Set(loreIds).size === loreIds.length &&
    state.depth.hero.monsterLore.every((entry) =>
      entry.monsterId.length > 0 &&
      entry.monsterName.length > 0 &&
      isNonNegativeSafeInteger(entry.encounters) &&
      isNonNegativeSafeInteger(entry.victories) &&
      isNonNegativeSafeInteger(entry.insight) &&
      Number.isSafeInteger(entry.requiredInsight) &&
      entry.requiredInsight > 0 &&
      entry.insight <= entry.requiredInsight &&
      entry.victories <= entry.encounters &&
      entry.learned === (entry.insight >= entry.requiredInsight)
    );
  const validDiscoveries =
    new Set(discoveryIds).size === discoveryIds.length &&
    state.depth.discoveries.every((entry) =>
      isNonNegativeSafeInteger(entry.tick) &&
      entry.tick <= state.tick &&
      abilityIds.includes(entry.abilityId) &&
      loreIds.includes(entry.monsterId)
    );
  const combatStates = [
    ...(state.depth.combat === null ? [] : [state.depth.combat]),
    ...state.depth.completedCombats,
  ];
  const validCombats = combatStates.every((combat) => {
    const combatantIds = combat.combatants.map((entry) => entry.id);
    if (new Set(combatantIds).size !== combatantIds.length) return false;
    return combat.combatants.every((combatant) => {
      const combatAbilityIds = combatant.abilities.map((ability) => ability.id);
      return combatant.abilities.length <= 16 && new Set(combatAbilityIds).size === combatAbilityIds.length;
    }) && combat.log.every((entry) => {
      if (entry.abilityId === null) return true;
      const actor = combat.combatants.find((combatant) => combatant.id === entry.actorId);
      return actor?.abilities.some((ability) => ability.id === entry.abilityId) === true;
    });
  });
  if (
    state.schemaVersion !== 4 ||
    typeof state.campaignId !== "string" ||
    state.campaignId.length === 0 ||
    typeof state.seed !== "string" ||
    state.seed.length === 0 ||
    !isNonNegativeSafeInteger(state.tick) ||
    !isRecord(state.hero) ||
    typeof state.hero.id !== "string" ||
    typeof state.hero.name !== "string" ||
    !isNonNegativeSafeInteger(state.hero.level) ||
    state.hero.level < 1 ||
    state.hero.level > 50 ||
    !isNonNegativeSafeInteger(state.hero.mastery) ||
    !isNonNegativeSafeInteger(state.hero.experience) ||
    !isNonNegativeSafeInteger(state.hero.health) ||
    !isNonNegativeSafeInteger(state.hero.maxHealth) ||
    state.hero.health > state.hero.maxHealth ||
    !isNonNegativeSafeInteger(state.hero.gold) ||
    !Array.isArray(state.hero.values) ||
    !isRecord(state.scene) ||
    !modes.includes(state.scene.mode) ||
    !Array.isArray(state.chronicle) ||
    state.chronicle.length > 32 ||
    !validChronicle ||
    !isRecord(state.lifecycle) ||
    state.lifecycle.policyVersion !== 1 ||
    state.lifecycle.simulationTick !== state.tick ||
    !isNonNegativeSafeInteger(state.lifecycle.worldClockMinutes) ||
    !isNonNegativeSafeInteger(state.lifecycle.attentionClock) ||
    !isNonNegativeSafeInteger(state.lifecycle.presentationTimeMs) ||
    state.lifecycle.maximumCatchUpTicks !== maximumCatchUpTicks ||
    !Array.isArray(state.lifecycle.wallClockJournal) ||
    state.lifecycle.wallClockJournal.length > maximumWallClockJournalEntries ||
    !Array.isArray(state.pendingAttention) ||
    state.pendingAttention.length > maximumAttentionQueueEntries ||
    !validPendingAttention ||
    !isRecord(state.depth) ||
    state.depth.schemaVersion !== 2 ||
    state.depth.seed !== state.seed ||
    state.depth.tick !== state.tick ||
    !isRecord(state.depth.hero) ||
    state.depth.hero.id !== state.hero.id ||
    state.depth.hero.name !== state.hero.name ||
    state.depth.hero.level !== state.hero.level ||
    state.depth.hero.experience !== state.hero.experience ||
    state.depth.hero.gold !== state.hero.gold ||
    !Array.isArray(state.depth.hero.abilities) ||
    state.depth.hero.abilities.length > 16 ||
    !validAbilities ||
    !Array.isArray(state.depth.hero.monsterLore) ||
    state.depth.hero.monsterLore.length > 16 ||
    !validLore ||
    !isRecord(state.depth.hero.resources) ||
    state.depth.hero.resources.health !== state.hero.health ||
    state.depth.hero.resources.maxHealth !== state.hero.maxHealth ||
    !isRecord(state.depth.atlas) ||
    !Array.isArray(state.depth.atlas.locations) ||
    !Array.isArray(state.depth.atlas.edges) ||
    !Array.isArray(state.depth.log) ||
    state.depth.log.length > 128 ||
    !Array.isArray(state.depth.completedCombats) ||
    state.depth.completedCombats.length > 4 ||
    !Array.isArray(state.depth.discoveries) ||
    state.depth.discoveries.length > 32 ||
    !validDiscoveries ||
    !validCombats
  ) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  return state;
}

export function upgradeWorldState(value: unknown): WorldState {
  if (!isRecord(value)) {
    throw new TypeError("Campaign state must be an object");
  }

  const candidate = value as WorldState | PreviousWorldState | PreviousWorldStateV3;
  if (candidate.schemaVersion === 4) return assertWorldState(candidate);
  if (candidate.schemaVersion === 3) {
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    return assertWorldState({ ...candidate, schemaVersion: 4, depth });
  }
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) {
    throw new RangeError("Unsupported campaign schema version");
  }

  const baseDepth = createDepthState(candidate.seed, candidate.hero.id, candidate.hero.name);
  const healthRatio =
    candidate.hero.maxHealth <= 0
      ? 1
      : candidate.hero.health / candidate.hero.maxHealth;
  const migratedHealth = Math.max(
    0,
    Math.min(
      baseDepth.hero.resources.maxHealth,
      Math.floor(baseDepth.hero.resources.maxHealth * healthRatio),
    ),
  );
  const depth = {
    ...baseDepth,
    tick: candidate.tick,
    hero: {
      ...baseDepth.hero,
      level: candidate.hero.level,
      experience: candidate.hero.experience,
      gold: candidate.hero.gold,
      resources: {
        ...baseDepth.hero.resources,
        health: migratedHealth,
      },
    },
  };
  const lifecycle =
    candidate.schemaVersion === 2 && candidate.lifecycle !== undefined
      ? candidate.lifecycle
      : {
          policyVersion: 1 as const,
          simulationTick: candidate.tick,
          worldClockMinutes: candidate.tick * worldMinutesPerTick,
          attentionClock: candidate.chronicle.filter(
            (entry) => entry.attention !== "backgroundSafe",
          ).length,
          presentationTimeMs: 0,
          maximumCatchUpTicks,
          wallClockJournal: [],
        };
  return assertWorldState({
    ...candidate,
    schemaVersion: 4,
    hero: {
      ...candidate.hero,
      health: migratedHealth,
      maxHealth: depth.hero.resources.maxHealth,
    },
    chronicle: candidate.chronicle.map((entry) => ({
      ...entry,
      policy: entry.policy ?? eventPolicyForMode(entry.mode),
    })),
    lifecycle,
    pendingAttention: candidate.pendingAttention ?? [],
    depth,
  });
}
