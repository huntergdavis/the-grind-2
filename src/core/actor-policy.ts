import {
  counterDuelStanceLabel,
  counterToStance,
  projectCounterDuelPolicyView,
  projectDungeonMoveKnowledge,
  scoreCounterDuelPrediction,
} from "../depth";
import type { AbilityState, DepthCommand, DepthCommandCandidate, DungeonMoveKnowledge, MazeDirection } from "../depth";
import { randomInt } from "./rng";
import { describeForwardMotionReason } from "./forward-motion";
import type {
  ActorChoice,
  ActorDecisionConsideration,
  ActorInstinctCondition,
  ActorInstinctContext,
  ActorInstinctProfile,
  ActorInstinctRule,
  ActorInstinctSelector,
  Opportunity,
  WorldState,
} from "./types";

function freezeProfile(id: ActorInstinctContext, rules: readonly ActorInstinctRule[]): ActorInstinctProfile {
  return Object.freeze({
    id,
    rules: Object.freeze(rules.map((rule) => Object.freeze({
      ...rule,
      conditions: Object.freeze([...rule.conditions]),
    }))),
  });
}

export const actorInstinctProfiles: Readonly<Record<ActorInstinctContext, ActorInstinctProfile>> = Object.freeze({
  road: freezeProfile("road", [
    { id: "road.recover", conditions: ["actor-low-health"], selector: "recovery", reasonCode: "survive-danger" },
    { id: "road.visible-dungeon-objective", conditions: [], selector: "visible-dungeon-objective", reasonCode: "pursue-visible-objective" },
    { id: "road.explore", conditions: ["hero-curious"], selector: "unknown-route", reasonCode: "explore-unknown" },
    { id: "road.brave-danger", conditions: ["hero-courageous"], selector: "dangerous-route", reasonCode: "meet-danger" },
    { id: "road.help-town", conditions: ["hero-merciful"], selector: "town-route", reasonCode: "help-settlement" },
    { id: "road.mapped-reward", conditions: [], selector: "mapped-opportunity", reasonCode: "pursue-mapped-reward" },
    { id: "road.practice", conditions: [], selector: "training", reasonCode: "practice-growth" },
    { id: "road.continue", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
  ]),
  ordinaryCombat: freezeProfile("ordinaryCombat", [
    { id: "combat.finish", conditions: ["bounded-finish"], selector: "finishing-action", reasonCode: "finish-safely" },
    { id: "combat.control", conditions: ["hero-merciful"], selector: "control-ability", reasonCode: "control-conflict" },
    { id: "combat.experiment", conditions: ["hero-curious"], selector: "unpracticed-ability", reasonCode: "test-technique" },
    { id: "combat.press", conditions: ["hero-courageous"], selector: "strongest-attack", reasonCode: "meet-danger" },
    { id: "combat.practical", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
  ]),
  direCombat: freezeProfile("direCombat", [
    { id: "dire.safe-finish", conditions: ["actor-low-health", "bounded-finish"], selector: "finishing-action", reasonCode: "finish-safely" },
    { id: "dire.restore", conditions: ["actor-low-health"], selector: "restorative", reasonCode: "survive-danger" },
    { id: "dire.guard", conditions: ["actor-low-health"], selector: "guard", reasonCode: "survive-danger" },
    { id: "dire.control", conditions: ["hero-merciful"], selector: "control-ability", reasonCode: "control-conflict" },
    { id: "dire.experiment", conditions: ["hero-curious"], selector: "unpracticed-ability", reasonCode: "test-technique" },
    { id: "dire.press", conditions: ["hero-courageous"], selector: "strongest-attack", reasonCode: "meet-danger" },
    { id: "dire.practical", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
  ]),
});

interface CandidateScore {
  candidate: DepthCommandCandidate;
  score: number;
  reason: string;
  tieBreak: number;
}

interface ActorPolicyKnowledge {
  dungeonMoves: ReadonlyMap<MazeDirection, DungeonMoveKnowledge>;
}

function projectActorPolicyKnowledge(state: WorldState): ActorPolicyKnowledge {
  const moves = state.depth.dungeon === null ? [] : projectDungeonMoveKnowledge(state.depth.dungeon);
  return { dungeonMoves: new Map(moves.map((move) => [move.direction, move])) };
}

function combatFacts(state: WorldState, candidate: DepthCommandCandidate): {
  actor: NonNullable<WorldState["depth"]["combat"]>["combatants"][number] | undefined;
  target: NonNullable<WorldState["depth"]["combat"]>["combatants"][number] | undefined;
  ability: AbilityState | undefined;
  projectedDamage: number;
  finishesTarget: boolean;
  boundedFinish: boolean;
} {
  if (candidate.command.type !== "combat-action" || state.depth.combat === null) {
    return { actor: undefined, target: undefined, ability: undefined, projectedDamage: 0, finishesTarget: false, boundedFinish: false };
  }
  const action = candidate.command.action;
  const actor = state.depth.combat.combatants.find((entry) => entry.id === action.actorId);
  const target = state.depth.combat.combatants.find((entry) => entry.id === action.targetId);
  const ability = actor?.abilities.find((entry) => entry.id === action.abilityId);
  const projectedDamage = action.type === "guard" || action.type === "item"
    ? 0
    : Math.max(1, (actor?.power ?? 1) + (ability?.potency ?? 0) - Math.floor((target?.armor ?? 0) / 2));
  const finishesTarget = target !== undefined && projectedDamage >= target.health;
  const opposingSurvivors = actor === undefined
    ? 0
    : state.depth.combat.combatants.filter((entry) => entry.side !== actor.side && entry.health > 0).length;
  return { actor, target, ability, projectedDamage, finishesTarget, boundedFinish: finishesTarget && opposingSurvivors === 1 };
}

function dungeonMoveKnowledge(
  candidate: DepthCommandCandidate,
  knowledge: ActorPolicyKnowledge,
): DungeonMoveKnowledge | undefined {
  return candidate.command.type === "move-dungeon"
    ? knowledge.dungeonMoves.get(candidate.command.direction)
    : undefined;
}

function scoreCandidate(
  state: WorldState,
  candidate: DepthCommandCandidate,
  knowledge: ActorPolicyKnowledge,
): CandidateScore {
  const command = candidate.command;
  let score = 10;
  let reason = "it is the clearest legal next step";

  if (command.type === "combat-action" && state.depth.combat !== null) {
    const { actor, target, ability, projectedDamage, finishesTarget } = combatFacts(state, candidate);
    const lowHealth = actor !== undefined && actor.health * 3 <= actor.maxHealth;
    if (command.action.type === "item") {
      const item = state.depth.hero.inventory.find((entry) => entry.id === command.action.itemId);
      score = 180;
      reason = `${item?.name ?? "the restorative"} follows the visible emergency rule at HP ${actor?.health ?? 0}/${actor?.maxHealth ?? 0}`;
    } else if (command.action.type === "guard") {
      score = lowHealth ? 120 : 4;
      reason = lowHealth
        ? `guarding at ${actor?.health ?? 0}/${actor?.maxHealth ?? 0} health may prevent defeat`
        : "a measured defense preserves momentum";
    } else {
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
  } else if (command.type === "counter-duel-action" && state.depth.counterDuel !== null) {
    const view = projectCounterDuelPolicyView(state.depth.counterDuel, state.depth.hero.monsterLore);
    const read = scoreCounterDuelPrediction(view, command.prediction);
    score = read.score;
    if (state.hero.values.includes("courage") && command.prediction === "feint") score += 4;
    if (state.hero.values.includes("curiosity") && command.prediction === "ward") score += 4;
    if ((state.hero.values.includes("mercy") || state.hero.values.includes("loyalty")) && command.prediction === "rush") score += 4;
    reason = `${read.reason}; ${counterDuelStanceLabel(counterToStance(command.prediction))} is the derived answer`;
  } else if (command.type === "plan-route") {
    const destination = state.depth.atlas.locations.find((entry) => entry.id === command.destinationId);
    const unknown = !state.depth.atlas.discoveredLocationIds.includes(command.destinationId);
    score = 12;
    if (unknown && state.hero.values.includes("curiosity")) {
      score += 20;
      reason = `${destination?.name ?? "the destination"} is mapped but still unvisited`;
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
      score -= (destination?.danger ?? 0) * 6;
      reason = "the wounded traveler avoids the most dangerous available road";
    }
  } else if (command.type === "recruit-companion") {
    const companion = state.depth.towns[state.depth.atlas.currentLocationId]?.residents.find(
      (resident) => resident.id === command.residentId,
    );
    score = 80;
    reason = `${companion?.name ?? "the resident"} has offered a specific Shared Road Oath`;
  } else if (command.type === "farewell-companion") {
    const companion = state.depth.companions.active.find((entry) => entry.identity.residentId === command.residentId);
    score = 100;
    reason = `${companion?.destination.name ?? "the promised town"} has been reached and the oath deserves its farewell`;
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
    const move = dungeonMoveKnowledge(candidate, knowledge);
    const feature = move?.feature;
    const shrineUnvisited = feature === "shrine"
      && move !== undefined
      && state.depth.dungeon !== null
      && !state.depth.dungeon.visitedCellIds.includes(move.destinationCellId);
    const missingHealth = state.depth.hero.resources.health < state.depth.hero.resources.maxHealth;
    const missingMana = state.depth.hero.resources.mana < state.depth.hero.resources.maxMana;
    const needsShrine = shrineUnvisited && (missingHealth || missingMana);
    const shrineObjectiveActive = state.depth.quest.subquests
      .flatMap((subquest) => subquest.objectives)
      .some((objective) => objective.rule.kind === "discover-dungeon-feature" &&
        objective.rule.feature === "shrine" && objective.status === "active");
    score = move?.sightedWayfinderKey === true
      ? 90
      : needsShrine
        ? 80
        : feature === "treasure" || (shrineUnvisited && shrineObjectiveActive) ? 35 : feature === "trap" ? 3 : 16;
    reason = move?.sightedWayfinderKey === true
      ? `the sighted Wayfinder Key waits in the ${command.direction} chamber`
      : needsShrine
        ? `the unspent shrine can restore ${missingHealth && missingMana ? "health and mana" : missingHealth ? "health" : "mana"}`
        : feature === "treasure"
          ? "the mapped chamber promises treasure"
          : shrineUnvisited && shrineObjectiveActive
            ? "the mapped shrine may advance the active objective"
            : feature === "trap"
              ? "the trapped passage is accepted only if other routes are worse"
              : "the passage advances the maze without inventing unknown facts";
  } else if (command.type === "disarm-dungeon-trap") {
    score = 100;
    reason = "the detected mechanism blocks safe progress and permits one careful attempt";
  } else if (command.type === "train-ability") {
    const ability = state.depth.hero.abilities.find((entry) => entry.id === command.abilityId);
    score = 30 - Math.min(20, ability?.experience ?? 0);
    if (state.hero.values.includes("curiosity")) score += 8;
    reason = `${ability?.name ?? "the technique"} has the most room to grow`;
  } else if (command.type === "start-combat") {
    score = 50;
    reason = "the road encounter has crossed the unavoidable threshold";
  } else if (command.type === "start-counter-duel") {
    score = 50;
    reason = "the road rival has declared a bounded Pattern Duel";
  } else if (command.type === "wait") {
    score = state.depth.hero.resources.health < state.depth.hero.resources.maxHealth ? 100 : 5;
    reason = state.depth.atlas.route !== null
      && state.depth.hero.resources.health * 2 <= state.depth.hero.resources.maxHealth
      ? "full recovery is wiser than entering the unresolved road encounter at critical health"
      : "recovery is safer than an illegal or impossible move";
  }

  return {
    candidate,
    score,
    reason,
    tieBreak: command.type === "combat-action" && command.action.type === "item"
      ? 0
      : randomInt(1_000_000, state.seed, "actor-policy", candidate.id, state.tick + 1, "exact-tie"),
  };
}

function conditionMatches(state: WorldState, candidate: DepthCommandCandidate, condition: ActorInstinctCondition): boolean {
  const { actor, boundedFinish } = combatFacts(state, candidate);
  switch (condition) {
    case "actor-low-health":
      return actor === undefined
        ? state.depth.hero.resources.health * 2 < state.depth.hero.resources.maxHealth
        : actor.health * 3 <= actor.maxHealth;
    case "bounded-finish": return boundedFinish;
    case "hero-curious": return actor?.side === "enemies" ? false : state.hero.values.includes("curiosity");
    case "hero-courageous": return actor?.side === "enemies" ? false : state.hero.values.includes("courage");
    case "hero-merciful": return actor?.side === "enemies" ? false : state.hero.values.includes("mercy");
  }
}

function selectorMatches(
  state: WorldState,
  candidate: DepthCommandCandidate,
  selector: ActorInstinctSelector,
  knowledge: ActorPolicyKnowledge,
): boolean {
  const command = candidate.command;
  const { ability, boundedFinish } = combatFacts(state, candidate);
  switch (selector) {
    case "finishing-action": return command.type === "combat-action" && (command.action.type === "attack" || command.action.type === "ability") && boundedFinish;
    case "restorative": return command.type === "combat-action" && command.action.type === "item";
    case "guard": return command.type === "combat-action" && command.action.type === "guard";
    case "control-ability": return command.type === "combat-action" && command.action.type === "ability" && (ability?.effect === "weaken" || ability?.effect === "poison");
    case "unpracticed-ability": return command.type === "combat-action" && command.action.type === "ability";
    case "strongest-attack": return command.type === "combat-action" && (command.action.type === "attack" || command.action.type === "ability");
    case "unknown-route": return command.type === "plan-route" && !state.depth.atlas.discoveredLocationIds.includes(command.destinationId);
    case "dangerous-route": {
      if (command.type !== "plan-route") return false;
      const destination = state.depth.atlas.locations.find((entry) => entry.id === command.destinationId);
      return (destination?.danger ?? 0) >= 6;
    }
    case "town-route": {
      if (command.type !== "plan-route") return false;
      return state.depth.atlas.locations.find((entry) => entry.id === command.destinationId)?.kind === "town";
    }
    case "visible-dungeon-objective": return dungeonMoveKnowledge(candidate, knowledge)?.sightedWayfinderKey === true;
    case "mapped-opportunity": {
      const feature = dungeonMoveKnowledge(candidate, knowledge)?.feature;
      return feature === "treasure" || feature === "shrine";
    }
    case "training": return command.type === "train-ability";
    case "recovery": return command.type === "wait";
    case "any": return true;
  }
}

function contextFor(state: WorldState, candidates: readonly DepthCommandCandidate[]): ActorInstinctContext {
  const combatCandidate = candidates.find((candidate) => candidate.command.type === "combat-action");
  if (combatCandidate === undefined) return "road";
  const actor = combatFacts(state, combatCandidate).actor;
  return actor !== undefined && actor.health * 3 <= actor.maxHealth ? "direCombat" : "ordinaryCombat";
}

function matchingRule(
  state: WorldState,
  candidate: DepthCommandCandidate,
  profile: ActorInstinctProfile,
  knowledge: ActorPolicyKnowledge,
): { rule: ActorInstinctRule; index: number } {
  const index = profile.rules.findIndex((rule) => rule.conditions.every((condition) => conditionMatches(state, candidate, condition)) && selectorMatches(state, candidate, rule.selector, knowledge));
  const rule = profile.rules[index];
  if (rule === undefined) throw new Error(`Actor instinct profile ${profile.id} has no matching fallback`);
  return { rule, index };
}

function decisionActor(state: WorldState, candidate: DepthCommandCandidate): { id: string; name: string } {
  if (candidate.command.type !== "combat-action") return { id: state.hero.id, name: state.hero.name };
  const actorId = candidate.command.action.actorId;
  const actor = state.depth.combat?.combatants.find((entry) => entry.id === actorId);
  return { id: actorId, name: actor?.name ?? state.hero.name };
}

function presentationLabels(
  state: WorldState,
  candidate: DepthCommandCandidate,
  knowledge: ActorPolicyKnowledge,
): Pick<ActorDecisionConsideration, "actionLabel" | "targetLabel"> {
  const command: DepthCommand = candidate.command;
  switch (command.type) {
    case "recruit-companion": {
      const resident = state.depth.towns[state.depth.atlas.currentLocationId]?.residents.find(
        (entry) => entry.id === command.residentId,
      );
      const destination = state.depth.atlas.locations.find((entry) => entry.id === command.destinationId);
      return { actionLabel: "swears a Shared Road Oath", targetLabel: `${resident?.name ?? "a resident"} → ${destination?.name ?? command.destinationId}` };
    }
    case "farewell-companion": {
      const companion = state.depth.companions.active.find((entry) => entry.identity.residentId === command.residentId);
      return { actionLabel: "completes the Shared Road Oath", targetLabel: companion?.identity.name ?? command.residentId };
    }
    case "combat-action": {
      const actor = state.depth.combat?.combatants.find((entry) => entry.id === command.action.actorId);
      const target = state.depth.combat?.combatants.find((entry) => entry.id === command.action.targetId);
      const ability = actor?.abilities.find((entry) => entry.id === command.action.abilityId);
      return command.action.type === "guard"
        ? { actionLabel: "guards", targetLabel: "self" }
        : command.action.type === "item"
          ? { actionLabel: `uses ${state.depth.hero.inventory.find((entry) => entry.id === command.action.itemId)?.name ?? "a restorative"}`, targetLabel: "self · emergency HP ≤ ⅓" }
        : { actionLabel: command.action.type === "ability" ? `uses ${ability?.name ?? "a technique"}` : "attacks", targetLabel: target?.name ?? "foe" };
    }
    case "counter-duel-action": return {
      actionLabel: `reads ${counterDuelStanceLabel(command.prediction)}`,
      targetLabel: `answers with ${counterDuelStanceLabel(counterToStance(command.prediction))}`,
    };
    case "plan-route": return { actionLabel: "plots a route", targetLabel: state.depth.atlas.locations.find((entry) => entry.id === command.destinationId)?.name ?? command.destinationId };
    case "travel": return { actionLabel: `advances ${command.distance} ${command.distance === 1 ? "mile" : "miles"}`, targetLabel: state.scene.location };
    case "visit-town": return { actionLabel: "enters town", targetLabel: state.scene.location };
    case "enter-dungeon": return { actionLabel: "enters the maze", targetLabel: state.scene.location };
    case "move-dungeon": {
      const move = dungeonMoveKnowledge(candidate, knowledge);
      return {
        actionLabel: `takes the ${command.direction} passage`,
        targetLabel: move?.sightedWayfinderKey === true ? "the sighted Wayfinder Key" : move?.feature ?? state.scene.location,
      };
    }
    case "disarm-dungeon-trap": return { actionLabel: "attempts to disarm", targetLabel: "the detected mechanism" };
    case "unlock-dungeon-gate": return { actionLabel: "turns the Wayfinder Key", targetLabel: "the sealed shortcut" };
    case "start-combat": return { actionLabel: "faces the road's danger", targetLabel: `${command.enemyCount} ${command.enemyCount === 1 ? "threat" : "threats"}` };
    case "start-counter-duel": return { actionLabel: "accepts a Pattern Duel", targetLabel: "the road rival" };
    case "train-ability": return { actionLabel: "practices", targetLabel: state.depth.hero.abilities.find((entry) => entry.id === command.abilityId)?.name ?? command.abilityId };
    case "fulfill-quest": return { actionLabel: "fulfills the quest", targetLabel: state.depth.quest.title };
    case "apply-quest-reward": return { actionLabel: "receives the quest reward", targetLabel: state.depth.quest.title };
    case "admit-successor-quest": return { actionLabel: "begins the next quest", targetLabel: state.depth.completedQuests.at(-1)?.title ?? command.completionId };
    case "wait": return { actionLabel: "recovers", targetLabel: state.scene.location };
  }
}

export function actorPolicy(state: WorldState, opportunity: Opportunity): ActorChoice {
  const context = contextFor(state, opportunity.candidates);
  const profile = actorInstinctProfiles[context];
  const knowledge = projectActorPolicyKnowledge(state);
  const ranked = opportunity.candidates
    .map((candidate) => ({ ...scoreCandidate(state, candidate, knowledge), ...matchingRule(state, candidate, profile, knowledge) }))
    .sort((left, right) => left.index - right.index || right.score - left.score || left.tieBreak - right.tieBreak || (left.candidate.id < right.candidate.id ? -1 : 1));
  const selected = ranked[0];
  if (selected === undefined) throw new Error("Actor Policy found no legal choice");
  const actor = decisionActor(state, selected.candidate);
  const consideration = (entry: typeof selected): ActorDecisionConsideration => ({
    commandId: `${state.campaignId}:${entry.candidate.id}`,
    ...presentationLabels(state, entry.candidate, knowledge),
    matchedRuleId: entry.rule.id,
  });
  const considered = ranked.slice(0, 4).map(consideration);
  const selectedTrace = consideration(selected);
  const selectedCommand = selected.candidate.command;
  const destinationName = selectedCommand.type === "plan-route"
    ? state.depth.atlas.locations.find((location) => location.id === selectedCommand.destinationId)?.name ?? selectedCommand.destinationId
    : null;
  const forwardReason = opportunity.forwardMotionReason === null || destinationName === null
    ? null
    : describeForwardMotionReason(opportunity.forwardMotionReason, destinationName);
  const reasons = [forwardReason ?? selected.reason];
  const rationale = forwardReason === null
    ? `${actor.name} chose to ${selected.candidate.label} because ${selected.reason}.`
    : `${actor.name} chose to ${selected.candidate.label} because ${forwardReason}.`;
  return {
    commandId: selectedTrace.commandId,
    command: selected.candidate.command,
    action: selected.candidate.label,
    consideredCommandIds: considered.map((entry) => entry.commandId),
    consideredActions: ranked.slice(0, 4).map((entry) => entry.candidate.label),
    rationale,
    trace: {
      actorId: actor.id,
      actorName: actor.name,
      context,
      profileId: profile.id,
      matchedRuleId: selected.rule.id,
      reasonCode: selected.rule.reasonCode,
      ...(opportunity.forwardMotionReason === null ? {} : { forwardMotionReason: opportunity.forwardMotionReason }),
      considered,
      selected: selectedTrace,
      reasons,
    },
  };
}
