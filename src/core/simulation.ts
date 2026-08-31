import {
  abilityExperienceCeiling,
  abilityExperienceFloor,
  counterDuelHabitText,
  counterDuelStanceLabel,
  counterDuelTellText,
  createDepthState,
  describeCompletedQuestReward,
  describeQuestRewardReceipt,
  describeDungeonShrineUse,
  depthCommandCandidates,
  dungeonTrapAt,
  isValidAtlasState,
  isValidCombatState,
  isValidCompanionReferences,
  isValidCompanionRoster,
  isValidCounterDuel,
  isValidDungeonState,
  isValidDetailedHeroState,
  isValidQuestState,
  isValidQuestCompletionState,
  isValidQuestRewardState,
  heroLevelForExperience,
  heroMasteryForExperience,
  needsCriticalRoadsideRecovery,
  projectLatestCombatTurn,
  projectCounterDuelHabit,
  projectLatestShrineUse,
  syncCompanionResources,
  stepDepth,
  upgradeDepthState,
} from "../depth";
import type { DepthCommand, DepthState } from "../depth";
import { actorPolicy } from "./actor-policy";
import {
  assertForwardMotionReferences,
  constrainForwardMotion,
  createForwardMotionState,
  updateForwardMotion,
} from "./forward-motion";
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

export { actorPolicy };

export const maximumCatchUpTicks = 96;
const worldMinutesPerTick = 15;
const maximumWallClockJournalEntries = 32;
const maximumAttentionQueueEntries = 16;
const abilityKinds = ["spell", "technique", "secret"] as const;
const abilityEffects = ["arcane", "burning", "poison", "weaken", "piercing"] as const;

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
    schemaVersion: 5,
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
      policyVersion: 2,
      simulationTick: 0,
      worldClockMinutes: 0,
      attentionClock: 0,
      presentationTimeMs: 0,
      maximumCatchUpTicks,
      wallClockJournal: [],
    },
    forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, 0),
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
  const constrained = constrainForwardMotion(state, depthCommandCandidates(depth));
  const candidates = constrained.candidates;
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
  const goal = depth.pendingQuestReward !== null
    ? `Receive the reward for ${depth.quest.title}`
    : depth.quest.status === "ready-to-fulfill"
      ? `Fulfill ${depth.quest.title}`
      : activeObjective?.description ?? "Decide what the legend becomes next";

  return { mode, location, goal, candidates, forwardMotionReason: constrained.reason };
}

export function sceneModeForCommand(state: WorldState, command: DepthCommand): SceneMode {
  switch (command.type) {
    case "recruit-companion":
    case "farewell-companion":
    case "fulfill-quest":
    case "apply-quest-reward":
      return "chronicle";
    case "plan-route":
      return "atlas";
    case "travel":
      return "travel";
    case "visit-town":
      return "town";
    case "enter-dungeon":
    case "move-dungeon":
    case "disarm-dungeon-trap":
    case "unlock-dungeon-gate":
      return "dungeon";
    case "start-combat":
    case "combat-action":
    case "start-counter-duel":
    case "counter-duel-action":
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

function experienceGainForCommand(command: DepthCommand, before: DepthState, after: DepthState): number {
  switch (command.type) {
    case "recruit-companion":
    case "farewell-companion":
    case "fulfill-quest":
    case "apply-quest-reward":
      return 0;
    case "wait":
      return needsCriticalRoadsideRecovery(before) ? 0 : 1;
    case "start-combat":
      return 8;
    case "combat-action":
      return command.action.actorId === before.hero.id ? 8 : 0;
    case "start-counter-duel":
      return 0;
    case "counter-duel-action": {
      const completed = after.completedCounterDuels.at(-1);
      return completed?.id !== before.completedCounterDuels.at(-1)?.id && completed?.outcome === "victory"
        ? completed.stakes.victoryExperience
        : 0;
    }
    case "enter-dungeon":
      return 4;
    case "move-dungeon":
      return (after.dungeon?.visitedCellIds.length ?? 0) > (before.dungeon?.visitedCellIds.length ?? 0) ? 4 : 0;
    case "disarm-dungeon-trap":
    case "unlock-dungeon-gate":
      return 0;
    default:
      return 1;
  }
}

function describeBeat(
  state: WorldState,
  opportunity: Opportunity,
  choice: ActorChoice,
  previousDepth: DepthState,
): SceneState {
  const { depth } = state;
  const town = depth.towns[depth.atlas.currentLocationId];
  const route = depth.atlas.route;
  const destination =
    route === null
      ? undefined
      : depth.atlas.locations.find((location) => location.id === route.destinationId);
  const dungeon = depth.dungeon;
  const counterDuelBeat = choice.command.type === "start-counter-duel" || choice.command.type === "counter-duel-action";
  const combat = depth.combat ?? (
    opportunity.mode === "battle" && !counterDuelBeat
      ? depth.completedCombats.at(-1)
      : undefined
  );
  const counterDuel = depth.counterDuel ?? (counterDuelBeat ? depth.completedCounterDuels.at(-1) : undefined);
  const latestCounterRound = counterDuel?.history.at(-1);
  const counterDuelHabit = counterDuel === undefined
    ? undefined
    : projectCounterDuelHabit(counterDuel, depth.hero.monsterLore);
  const activeCombatant = combat?.combatants.find(
    (combatant) => combatant.id === combat.turnOrder[combat.activeIndex],
  );
  const latestCombatTurn = combat === undefined ? null : projectLatestCombatTurn(combat);
  const sceneDiscovery = depth.discoveries.at(-1);
  const discoveredAbility = depth.hero.abilities.find(
    (ability) => ability.id === sceneDiscovery?.abilityId,
  );
  const trainingAbility = [...depth.hero.abilities].sort(
    (left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[0];
  const currentTrap = dungeon === null ? null : dungeonTrapAt(dungeon, dungeon.currentCellId);
  const shrineUse = dungeon === null ? null : projectLatestShrineUse(dungeon, depth.tick);
  const shrineUseSummary = shrineUse === null ? null : describeDungeonShrineUse(shrineUse);
  const activeCompanion = depth.companions.active[0];
  const departedCompanion = depth.companions.former.at(-1)?.departure.tick === depth.tick
    ? depth.companions.former.at(-1)
    : undefined;
  const latestLog = depth.log.at(-1)?.message;
  const fulfilledQuest = choice.command.type === "fulfill-quest"
    ? depth.completedQuests.at(-1)
    : undefined;
  const rewardedQuest = choice.command.type === "apply-quest-reward"
    ? depth.completedQuests.at(-1)
    : undefined;
  const appliedReward = rewardedQuest?.reward.status === "applied" ? rewardedQuest.reward : undefined;
  const criticalRoadsideRecovery = choice.command.type === "wait"
    && previousDepth.atlas.route !== null
    && previousDepth.hero.resources.health * 2 <= previousDepth.hero.resources.maxHealth
    && depth.hero.resources.health === depth.hero.resources.maxHealth
    && depth.hero.resources.mana === depth.hero.resources.maxMana;
  const trapTriggered = opportunity.mode === "dungeon"
    && currentTrap?.phase === "triggered"
    && depth.hero.resources.health < previousDepth.hero.resources.health
    && depth.log.at(-1)?.tick === depth.tick;
  const trapDetected = opportunity.mode === "dungeon" && currentTrap?.phase === "detected";
  const trapDisarmed = opportunity.mode === "dungeon"
    && choice.command.type === "disarm-dungeon-trap"
    && currentTrap?.phase === "disarmed";
  const keyFound = opportunity.mode === "dungeon"
    && previousDepth.dungeon?.keyGate?.phase === "uncollected"
    && dungeon?.keyGate?.phase === "carried";
  const gateOpened = opportunity.mode === "dungeon"
    && choice.command.type === "unlock-dungeon-gate"
    && dungeon?.keyGate?.phase === "open";
  const crossedGate = opportunity.mode === "dungeon"
    && choice.command.type === "move-dungeon"
    && previousDepth.dungeon?.keyGate?.phase === "open"
    && dungeon?.keyGate?.phase === "open"
    && ((previousDepth.dungeon.currentCellId === dungeon.keyGate.unlockCellId && dungeon.currentCellId === dungeon.keyGate.shortcutCellId)
      || (previousDepth.dungeon.currentCellId === dungeon.keyGate.shortcutCellId && dungeon.currentCellId === dungeon.keyGate.unlockCellId));
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
      headline: dungeon === null
        ? "A sealed stair descends."
        : shrineUse !== null
          ? `${dungeon.name}: the shrine awakens.`
        : trapTriggered
          ? `${dungeon.name}: a marked trap springs!`
          : trapDetected
            ? `${dungeon.name}: danger found in time.`
            : trapDisarmed
              ? `${dungeon.name}: the passage is made safe.`
              : keyFound
                ? `${dungeon.name}: the Wayfinder Key is found.`
                : gateOpened
                  ? `${dungeon.name}: the sealed shortcut opens.`
                  : crossedGate
                    ? dungeon.completed
                      ? `${dungeon.name}: the shortcut opens onto the far stair.`
                      : `${dungeon.name}: the maze folds shorter.`
                    : `${dungeon.name}: passage ${dungeon.turns + 1}.`,
      action:
        dungeon === null
          ? `${state.hero.name} prepares to enter.`
          : shrineUse !== null
            ? `${shrineUseSummary === "RESOURCES FULL" ? "SHRINE FOUND" : "SHRINE AWAKENS"} · ${shrineUseSummary}`
          : trapTriggered
            ? `${state.hero.name} hits the mechanism; the chamber's hazard is now spent.`
            : trapDetected || trapDisarmed
              ? latestLog ?? `${state.hero.name} studies the marked mechanism.`
              : keyFound || gateOpened || crossedGate
                ? latestLog ?? `${state.hero.name} follows the Wayfinder mechanism.`
                : `${dungeon.visitedCellIds.length}/${dungeon.cells.length} chambers visited; the mapped floor reveals no marked hazard.`,
      consequence: dungeon?.traversalLog.at(-1) ?? latestLog ?? "The maze remains unsolved",
      sensoryIntensity: trapTriggered ? 3 : shrineUse !== null || trapDetected || trapDisarmed || keyFound || gateOpened || crossedGate ? 2 : 1,
    },
    battle: {
      headline:
        counterDuelBeat && counterDuel !== undefined
          ? latestCounterRound === undefined
            ? `Pattern Duel: ${counterDuel.opponentName} declares the three answers.`
            : `Pattern Duel · Round ${latestCounterRound.round} · ${counterDuel.heroScore}–${counterDuel.opponentScore}`
        : combat === undefined
          ? "Danger steps onto the road."
          : latestCombatTurn === null
            ? `Round ${combat.round}: ${activeCombatant?.name ?? "the battle"} has the turn.`
            : latestCombatTurn.intentInterrupted
              ? `${latestCombatTurn.actorName}'s ${latestCombatTurn.actionLabel} is interrupted.`
              : latestCombatTurn.action === "guard"
                ? `${latestCombatTurn.actorName} takes guard.`
                : `${latestCombatTurn.actorName} uses ${latestCombatTurn.actionLabel}${latestCombatTurn.targetName === null ? "" : ` on ${latestCombatTurn.targetName}`}.`,
      action: counterDuelBeat && counterDuel !== undefined
        ? latestCounterRound === undefined
          ? `${counterDuelTellText(counterDuel.tell)}. ${counterDuelHabit === undefined ? "" : `${counterDuelHabitText(counterDuelHabit)}. `}${state.hero.name} studies the evidence before committing a read.`
          : `${state.hero.name} predicted ${counterDuelStanceLabel(latestCounterRound.prediction)} and answered with ${counterDuelStanceLabel(latestCounterRound.heroStance)}; ${counterDuel.opponentName} revealed ${counterDuelStanceLabel(latestCounterRound.opponentStance)}.`
        : latestCombatTurn?.text ?? `${state.hero.name} decides to ${choice.action}.`,
      consequence:
        counterDuelBeat && counterDuel !== undefined
          ? counterDuel.outcome === "ongoing"
            ? latestCounterRound === undefined
              ? `First to 2; after round 5 the leader wins and an equal score draws · victory +${counterDuel.stakes.victoryExperience} XP and +${counterDuel.stakes.victoryGold} gold · defeat −${counterDuel.stakes.defeatDamage} health${counterDuelHabit === undefined ? "" : ` · ${counterDuelHabitText(counterDuelHabit)}`}`
              : `${latestCounterRound.result === "hero" ? state.hero.name : latestCounterRound.result === "opponent" ? counterDuel.opponentName : "Neither"} scored; next tell: ${counterDuelTellText(counterDuel.tell)}${counterDuelHabit === undefined ? "" : `; ${counterDuelHabitText(counterDuelHabit)}`}`
            : latestLog ?? `The Pattern Duel ends in ${counterDuel.outcome}`
        : combat === undefined
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
      headline: criticalRoadsideRecovery
        ? "A wise camp turns survival into readiness."
        : "Firelight turns danger into memory.",
      action: latestLog ?? `${state.hero.name} chooses to ${choice.action}.`,
      consequence: criticalRoadsideRecovery
        ? "Fully rested · ready for the road · the same encounter still waits"
        : `${depth.hero.resources.health}/${depth.hero.resources.maxHealth} health; the road can wait a moment`,
      sensoryIntensity: 0,
    },
    chronicle: {
      headline: choice.command.type === "apply-quest-reward" && rewardedQuest !== undefined && appliedReward !== undefined
        ? `Quest Reward: ${rewardedQuest.title}`
        : choice.command.type === "fulfill-quest" && fulfilledQuest !== undefined
        ? `Quest Fulfilled: ${fulfilledQuest.title}`
        : choice.command.type === "recruit-companion" && activeCompanion !== undefined
        ? `${activeCompanion.identity.name} joins the road.`
        : choice.command.type === "farewell-companion" && departedCompanion !== undefined
          ? `${departedCompanion.identity.name}'s Shared Road Oath is complete.`
          : depth.quest.title,
      action: choice.command.type === "apply-quest-reward" && appliedReward !== undefined
        ? `${state.hero.name} receives the promised reward from the Chronicle.`
        : choice.command.type === "fulfill-quest" && fulfilledQuest !== undefined
        ? `${state.hero.name} closes the final page after ${fulfilledQuest.objectiveIds.length} completed objectives.`
        : choice.command.type === "recruit-companion" && activeCompanion !== undefined
        ? `${activeCompanion.identity.name}, ${activeCompanion.identity.role}, will travel from ${town?.name ?? activeCompanion.identity.originLocationId} to ${activeCompanion.destination.name}.`
        : choice.command.type === "farewell-companion" && departedCompanion !== undefined
          ? `${departedCompanion.identity.name} departs ${departedCompanion.departure.outcome === "injured" ? "wounded but alive" : "in good health"} after ${departedCompanion.victories} shared ${departedCompanion.victories === 1 ? "victory" : "victories"}.`
          : depth.quest.summary,
      consequence: choice.command.type === "apply-quest-reward" && appliedReward !== undefined
        ? describeQuestRewardReceipt(appliedReward.grant, appliedReward.receipt)
        : choice.command.type === "fulfill-quest" && fulfilledQuest !== undefined
        ? `Completion #${depth.totalCompletedQuests} recorded at T${fulfilledQuest.fulfilledTick} · ${describeCompletedQuestReward(fulfilledQuest)}`
        : choice.command.type === "recruit-companion" || choice.command.type === "farewell-companion"
        ? latestLog ?? "The Shared Road Oath changes the party."
        : latestLog ?? "The Chronicle binds choices and consequences together",
      sensoryIntensity: choice.command.type === "fulfill-quest" || choice.command.type === "apply-quest-reward" ? 3 : choice.command.type === "recruit-companion" || choice.command.type === "farewell-companion" ? 2 : 0,
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
  const canonicalOpportunity = campaignDirector(state);
  const canonicalCandidateIds = canonicalOpportunity.candidates.map((candidate) => candidate.id);
  if (
    opportunity.mode !== canonicalOpportunity.mode ||
    opportunity.location !== canonicalOpportunity.location ||
    opportunity.goal !== canonicalOpportunity.goal ||
    opportunity.forwardMotionReason !== canonicalOpportunity.forwardMotionReason ||
    opportunity.candidates.length !== canonicalOpportunity.candidates.length ||
    opportunity.candidates.some((candidate, index) =>
      candidate.id !== canonicalCandidateIds[index] ||
      JSON.stringify(candidate.command) !== JSON.stringify(canonicalOpportunity.candidates[index]?.command)
    )
  ) {
    throw new Error("Campaign Director supplied a non-canonical opportunity");
  }
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
  const experienceGain = experienceGainForCommand(choice.command, state.depth, depth);
  const experience = Math.min(Number.MAX_SAFE_INTEGER, depth.hero.experience + experienceGain);
  const level = heroLevelForExperience(experience);
  const mastery = heroMasteryForExperience(experience);
  const justWon =
    depth.completedCombats.at(-1)?.id !== state.depth.completedCombats.at(-1)?.id &&
    depth.completedCombats.at(-1)?.outcome === "victory";
  const completedCounterDuel = depth.completedCounterDuels.at(-1);
  const justWonCounterDuel =
    completedCounterDuel?.id !== state.depth.completedCounterDuels.at(-1)?.id &&
    completedCounterDuel?.outcome === "victory";
  const goldReward = justWonCounterDuel ? completedCounterDuel.stakes.victoryGold : justWon ? 5 : 0;
  const gold = Math.min(Number.MAX_SAFE_INTEGER, depth.hero.gold + goldReward);
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
  const scene = describeBeat({ ...state, depth }, opportunity, choice, state.depth);
  const forwardMotion = updateForwardMotion(state, depth, opportunity, choice.command, tick);

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
    decisionTrace: choice.trace,
    policy: eventPolicyForMode(opportunity.mode),
    ...scene,
  };

  return assertCanonicalRpgState({
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
    forwardMotion,
    lifecycle: {
      ...state.lifecycle,
      simulationTick: tick,
      worldClockMinutes: state.lifecycle.worldClockMinutes + worldMinutesPerTick,
      attentionClock:
        state.lifecycle.attentionClock +
        (entry.attention === "backgroundSafe" ? 0 : 1),
    },
    pendingAttention: state.pendingAttention.filter((event) => event.tick !== tick),
  });
}

function assertCanonicalRpgState(state: WorldState): WorldState {
  if (
    state.depth.hero.id !== state.hero.id ||
    state.depth.hero.name !== state.hero.name ||
    state.depth.hero.level !== state.hero.level ||
    state.depth.hero.experience !== state.hero.experience ||
    state.depth.hero.gold !== state.hero.gold ||
    state.depth.hero.resources.health !== state.hero.health ||
    state.depth.hero.resources.maxHealth !== state.hero.maxHealth ||
    state.hero.level !== heroLevelForExperience(state.hero.experience) ||
    state.hero.mastery !== heroMasteryForExperience(state.hero.experience) ||
    !isValidDetailedHeroState(state.depth.hero) ||
    !isValidQuestState(state.depth.quest) ||
    !isValidQuestCompletionState(state.depth.quest, state.depth.completedQuests, state.depth.totalCompletedQuests, state.depth.tick) ||
    !isValidQuestRewardState(state.depth.seed, state.depth.hero, state.depth.quest, state.depth.completedQuests, state.depth.pendingQuestReward, state.depth.tick)
  ) {
    throw new TypeError("Campaign state violates schema invariants");
  }
  return state;
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

type PreviousLifecycleState = Omit<WorldState["lifecycle"], "policyVersion"> & {
  policyVersion: 1;
};

type PreviousWorldState = Omit<
  WorldState,
  "schemaVersion" | "lifecycle" | "forwardMotion" | "pendingAttention" | "chronicle" | "depth"
> & {
  schemaVersion: 1 | 2;
  lifecycle?: PreviousLifecycleState;
  pendingAttention?: WorldState["pendingAttention"];
  chronicle: readonly LegacyChronicleEntry[];
};

type PreviousWorldStateV4 = Omit<WorldState, "schemaVersion" | "lifecycle" | "forwardMotion"> & {
  schemaVersion: 4;
  lifecycle: PreviousLifecycleState;
};

type PreviousWorldStateV3 = Omit<PreviousWorldStateV4, "schemaVersion" | "depth"> & {
  schemaVersion: 3;
  depth: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDecisionConsideration(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    typeof value.commandId === "string" && value.commandId.length > 0 &&
    typeof value.actionLabel === "string" && value.actionLabel.length > 0 &&
    (value.targetLabel === null || (typeof value.targetLabel === "string" && value.targetLabel.length > 0)) &&
    typeof value.matchedRuleId === "string" && value.matchedRuleId.length > 0;
}

function isDecisionTrace(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const contexts = ["road", "ordinaryCombat", "direCombat"];
  const forwardMotionReasons = ["explore-unseen", "avoid-immediate-reverse", "only-open-road", "least-recent", "companion-oath"];
  const selected = value.selected;
  if (
    typeof value.actorId !== "string" || value.actorId.length === 0 ||
    typeof value.actorName !== "string" || value.actorName.length === 0 ||
    !contexts.includes(value.context as string) ||
    value.profileId !== value.context ||
    typeof value.matchedRuleId !== "string" || value.matchedRuleId.length === 0 ||
    typeof value.reasonCode !== "string" || value.reasonCode.length === 0 ||
    (value.forwardMotionReason !== undefined && !forwardMotionReasons.includes(value.forwardMotionReason as string)) ||
    !Array.isArray(value.considered) || value.considered.length < 1 || value.considered.length > 4 ||
    !value.considered.every(isDecisionConsideration) ||
    !isDecisionConsideration(selected) ||
    selected.matchedRuleId !== value.matchedRuleId ||
    !value.considered.some((entry) => entry.commandId === selected.commandId) ||
    !Array.isArray(value.reasons) || value.reasons.length < 1 || value.reasons.length > 3 ||
    !value.reasons.every((reason) => typeof reason === "string" && reason.length > 0)
  ) return false;
  return true;
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
    "recruit-companion",
    "farewell-companion",
    "plan-route",
    "travel",
    "visit-town",
    "enter-dungeon",
    "move-dungeon",
    "disarm-dungeon-trap",
    "unlock-dungeon-gate",
    "start-combat",
    "combat-action",
    "start-counter-duel",
    "counter-duel-action",
    "train-ability",
    "progress-objective",
    "fulfill-quest",
    "apply-quest-reward",
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
      entry.consideredActions.length > 4 ||
      (entry.decisionTrace !== undefined && !isDecisionTrace(entry.decisionTrace))
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
      typeof ability.id === "string" &&
      ability.id.length > 0 &&
      typeof ability.name === "string" &&
      ability.name.length > 0 &&
      abilityKinds.includes(ability.kind) &&
      abilityEffects.includes(ability.effect) &&
      Number.isSafeInteger(ability.level) &&
      ability.level >= 1 &&
      ability.level <= 20 &&
      isNonNegativeSafeInteger(ability.experience) &&
      ability.experience <= 6 * 19 ** 2 &&
      ability.experience >= abilityExperienceFloor(ability.level) &&
      (ability.level === 20
        ? ability.experience === abilityExperienceFloor(20)
        : ability.experience < abilityExperienceCeiling(ability.level)) &&
      isNonNegativeSafeInteger(ability.uses) &&
      isNonNegativeSafeInteger(ability.manaCost) &&
      isNonNegativeSafeInteger(ability.potency) &&
      (ability.kind === "secret"
        ? typeof ability.sourceMonsterId === "string" && ability.sourceMonsterId.length > 0
        : ability.sourceMonsterId === null)
    );
  const validLore =
    new Set(loreIds).size === loreIds.length &&
    state.depth.hero.monsterLore.every((entry) =>
      typeof entry.monsterId === "string" &&
      entry.monsterId.length > 0 &&
      typeof entry.monsterName === "string" &&
      entry.monsterName.length > 0 &&
      typeof entry.secretTechniqueId === "string" &&
      entry.secretTechniqueId.length > 0 &&
      typeof entry.secretTechniqueName === "string" &&
      entry.secretTechniqueName.length > 0 &&
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
      typeof entry.id === "string" &&
      entry.id.length > 0 &&
      isNonNegativeSafeInteger(entry.tick) &&
      entry.tick <= state.tick &&
      typeof entry.abilityId === "string" &&
      typeof entry.abilityName === "string" &&
      entry.abilityName.length > 0 &&
      typeof entry.monsterId === "string" &&
      typeof entry.monsterName === "string" &&
      entry.monsterName.length > 0 &&
      abilityIds.includes(entry.abilityId) &&
      loreIds.includes(entry.monsterId)
    );
  const combatStates = [
    ...(state.depth.combat === null ? [] : [state.depth.combat]),
    ...state.depth.completedCombats,
  ];
  const validCombats = combatStates.every(isValidCombatState);
  const counterDuels = [
    ...(state.depth.counterDuel === null ? [] : [state.depth.counterDuel]),
    ...state.depth.completedCounterDuels,
  ];
  const validCounterDuels = counterDuels.every((duel) => isValidCounterDuel(duel, state.seed));
  const validCombatRoles =
    (state.depth.combat === null || state.depth.combat.outcome === "ongoing") &&
    state.depth.completedCombats.every((combat) =>
      combat.outcome === "victory" || combat.outcome === "defeat" || combat.outcome === "stalemate"
    ) &&
    combatStates.every((combat) =>
      combat.combatants.some((combatant) => combatant.id === state.hero.id && combatant.side === "heroes")
    );
  const activeCompanion = state.depth.companions.active[0];
  const activeCompanionCombatMatches = activeCompanion === undefined || state.depth.combat === null
    ? []
    : state.depth.combat.combatants.filter(
        (combatant) => combatant.id === activeCompanion.identity.residentId,
      );
  let validActiveCompanionCombat = true;
  if (activeCompanion !== undefined && state.depth.combat !== null) {
    if (activeCompanionCombatMatches.length === 0) {
      validActiveCompanionCombat = activeCompanion.resources.health === 0;
    } else if (activeCompanionCombatMatches.length !== 1) {
      validActiveCompanionCombat = false;
    } else {
      try {
        const synchronized = syncCompanionResources(activeCompanion, activeCompanionCombatMatches[0]!);
        validActiveCompanionCombat =
          synchronized.resources.health === activeCompanion.resources.health &&
          synchronized.resources.mana === activeCompanion.resources.mana &&
          synchronized.injury === activeCompanion.injury;
      } catch {
        validActiveCompanionCombat = false;
      }
    }
  }
  const validCounterDuelRoles =
    (state.depth.counterDuel === null || (
      state.depth.counterDuel.outcome === "ongoing" &&
      state.depth.counterDuel.heroId === state.hero.id
    )) &&
    state.depth.completedCounterDuels.every((duel) =>
      duel.outcome !== "ongoing" && duel.heroId === state.hero.id
    );
  const encounterIds = [...combatStates.map((combat) => combat.id), ...counterDuels.map((duel) => duel.id)];
  const validEncounterIds = new Set(encounterIds).size === encounterIds.length;
  if (
    state.schemaVersion !== 5 ||
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
    state.hero.level !== heroLevelForExperience(state.hero.experience) ||
    state.hero.mastery !== heroMasteryForExperience(state.hero.experience) ||
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
    state.lifecycle.policyVersion !== 2 ||
    state.lifecycle.simulationTick !== state.tick ||
    !isNonNegativeSafeInteger(state.lifecycle.worldClockMinutes) ||
    !isNonNegativeSafeInteger(state.lifecycle.attentionClock) ||
    !isNonNegativeSafeInteger(state.lifecycle.presentationTimeMs) ||
    state.lifecycle.maximumCatchUpTicks !== maximumCatchUpTicks ||
    !Array.isArray(state.lifecycle.wallClockJournal) ||
    state.lifecycle.wallClockJournal.length > maximumWallClockJournalEntries ||
    !isRecord(state.forwardMotion) ||
    !Array.isArray(state.forwardMotion.recentLocationIds) ||
    !Array.isArray(state.forwardMotion.recentLegs) ||
    !assertForwardMotionReferences(state) ||
    !Array.isArray(state.pendingAttention) ||
    state.pendingAttention.length > maximumAttentionQueueEntries ||
    !validPendingAttention ||
    !isRecord(state.depth) ||
    state.depth.schemaVersion !== 11 ||
    state.depth.seed !== state.seed ||
    state.depth.tick !== state.tick ||
    !isRecord(state.depth.hero) ||
    state.depth.hero.id !== state.hero.id ||
    state.depth.hero.name !== state.hero.name ||
    state.depth.hero.level !== state.hero.level ||
    state.depth.hero.experience !== state.hero.experience ||
    state.depth.hero.gold !== state.hero.gold ||
    !isValidDetailedHeroState(state.depth.hero) ||
    !isValidQuestState(state.depth.quest) ||
    !isValidQuestCompletionState(state.depth.quest, state.depth.completedQuests, state.depth.totalCompletedQuests, state.depth.tick) ||
    !isValidQuestRewardState(state.depth.seed, state.depth.hero, state.depth.quest, state.depth.completedQuests, state.depth.pendingQuestReward, state.depth.tick) ||
    (state.depth.pendingQuestReward !== null && (state.depth.combat !== null || state.depth.counterDuel !== null)) ||
    !Array.isArray(state.depth.hero.abilities) ||
    state.depth.hero.abilities.length > 16 ||
    !validAbilities ||
    !Array.isArray(state.depth.hero.monsterLore) ||
    state.depth.hero.monsterLore.length > 16 ||
    !validLore ||
    !isRecord(state.depth.hero.resources) ||
    state.depth.hero.resources.health !== state.hero.health ||
    state.depth.hero.resources.maxHealth !== state.hero.maxHealth ||
    !isValidAtlasState(state.depth.atlas) ||
    !isValidCompanionRoster(state.depth.companions) ||
    !isValidCompanionReferences(state.depth.companions, state.depth.atlas, state.depth.towns) ||
    (state.depth.companions.active.length > 0 && state.depth.dungeon !== null && !state.depth.dungeon.completed) ||
    (state.depth.companions.active[0]?.phase === "travelling" && state.depth.atlas.route !== null && state.depth.atlas.route.destinationId !== state.depth.companions.active[0]?.destination.locationId) ||
    (state.depth.companions.active[0]?.phase === "travelling" && state.depth.atlas.route === null && state.depth.atlas.currentLocationId === state.depth.companions.active[0]?.destination.locationId) ||
    (state.depth.companions.active[0]?.phase === "arrived" && state.depth.atlas.route !== null) ||
    (state.depth.dungeon !== null && !isValidDungeonState(state.depth.dungeon)) ||
    !Array.isArray(state.depth.log) ||
    state.depth.log.length > 128 ||
    !Array.isArray(state.depth.completedCombats) ||
    state.depth.completedCombats.length > 4 ||
    !Array.isArray(state.depth.completedCounterDuels) ||
    state.depth.completedCounterDuels.length > 4 ||
    !validCounterDuels ||
    !validCombatRoles ||
    !validActiveCompanionCombat ||
    !validCounterDuelRoles ||
    !validEncounterIds ||
    (state.depth.combat !== null && state.depth.counterDuel !== null) ||
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

  const candidate = value as WorldState | PreviousWorldState | PreviousWorldStateV3 | PreviousWorldStateV4;
  if (candidate.schemaVersion === 5) {
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    return assertWorldState({ ...candidate, depth });
  }
  if (candidate.schemaVersion === 4 || candidate.schemaVersion === 3) {
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    return assertWorldState({
      ...candidate,
      schemaVersion: 5,
      lifecycle: { ...candidate.lifecycle, policyVersion: 2 },
      forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, candidate.tick),
      depth,
    });
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
      ? { ...candidate.lifecycle, policyVersion: 2 as const }
      : {
          policyVersion: 2 as const,
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
    schemaVersion: 5,
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
    forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, candidate.tick),
    pendingAttention: candidate.pendingAttention ?? [],
    depth,
  });
}
