import { advanceDepth, createDepthState, upgradeDepthState } from "../depth";
import { pick } from "./rng";
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
  if (mode === "dungeon" || mode === "chronicle") return "queueForPresentation";
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
    maximumFidelityAffected: mode === "battle" ? "canonicalNamed" : "supporting",
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
  const current = depth.atlas.locations.find(
    (location) => location.id === depth.atlas.currentLocationId,
  );
  const routeStartsCombat =
    depth.atlas.route !== null && depth.tick > 0 && depth.tick % 11 === 0;
  const mode: SceneMode =
    depth.combat !== null || routeStartsCombat
      ? "battle"
      : depth.dungeon !== null && !depth.dungeon.completed
        ? "dungeon"
        : depth.atlas.route !== null
          ? depth.atlas.route.distanceTravelled === 0 || state.tick % 5 === 0
            ? "atlas"
            : "travel"
          : state.tick > 0 && state.tick % 23 === 0
            ? "chronicle"
            : state.tick > 0 && state.tick % 17 === 0
              ? "camp"
              : current?.kind === "town"
                ? "town"
                : "atlas";

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

  return { mode, location, goal, actions: actionSets[mode] };
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
      action:
        route === null
          ? `${state.hero.name} studies ${depth.atlas.edges.length} roads between ${depth.atlas.locations.length} places.`
          : `${route.path.length - 1} legs cover ${route.totalDistance} miles.`,
      consequence: latestLog ?? `The party will ${choice.action}`,
      sensoryIntensity: 0,
    },
    travel: {
      headline: `The road unfolds toward ${destination?.name ?? "the next landmark"}.`,
      action: `${route?.distanceTravelled ?? 0} of ${route?.totalDistance ?? 0} miles are behind the party.`,
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
    camp: {
      headline: "Firelight turns danger into memory.",
      action: `${state.hero.name} tends ${depth.hero.inventory.length} carried items and chooses to ${choice.action}.`,
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
  if (!opportunity.actions.includes(choice.action)) {
    throw new Error("Actor Policy selected an illegal action");
  }

  const tick = state.tick + 1;
  let depth = advanceDepth(state.depth);
  const experienceGain =
    opportunity.mode === "battle"
      ? 8
      : opportunity.mode === "dungeon"
        ? 4
        : 1;
  const experience = depth.hero.experience + experienceGain;
  const level = Math.min(50, 1 + Math.floor(Math.sqrt(experience / 12)));
  const mastery = Math.floor(experience / 250);
  const justWon =
    depth.completedCombats.at(-1)?.id !== state.depth.completedCombats.at(-1)?.id &&
    depth.completedCombats.at(-1)?.outcome === "victory";
  const gold = Math.min(Number.MAX_SAFE_INTEGER, depth.hero.gold + (justWon ? 5 : 0));
  const health =
    opportunity.mode === "camp"
      ? depth.hero.resources.maxHealth
      : depth.hero.resources.health;
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
            },
          ],
        };
      }
      break;
    }

    next = rulesEngine(next, opportunity, actorPolicy(next, opportunity));
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
    "camp",
    "chronicle",
  ];
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
