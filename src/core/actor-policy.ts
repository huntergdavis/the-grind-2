import {
  companionActionDefinition,
  counterDuelStanceLabel,
  counterToStance,
  projectCounterDuelPolicyView,
  projectDungeonMoveKnowledge,
  scoreCounterDuelPrediction,
  selectTonicRestock,
  selectPaidInnRest,
  selectBellDeliveryMemory,
  selectAvailableDungeonSecretPassage,
  dungeonSecretPassageCommandId,
} from "../depth";
import type { AbilityState, DepthCommand, DepthCommandCandidate, DungeonMoveKnowledge, MazeDirection } from "../depth";
import { legalMillraceReversal } from "../depth/shared-opening";
import { selectDisarmingKitPurchase } from "../depth/town-disarming-kit";
import { selectDisarmingKit } from "../depth/disarming-kit";
import { reparteeBook, reparteeResponses, type ReparteeResponse } from "../depth/repartee";
import { isValidCampaignRepartee } from "../depth/repartee-campaign";
import { isValidCampaignUsefulReply, usefulReplyBook, usefulReplyCommandId, usefulReplyResponses } from "../depth/useful-reply";
import { isValidCampaignRoomChallenge, roomChallengeCommandId, roomChallengeResponses } from "../depth/room-challenge";
import { companionCreditChoices, companionCreditCommandId, selectCompanionCredit } from "../depth/companion-credit";
import { pennywiseGateChoices, pennywiseGateCommandId, selectPennywiseGate } from "../depth/pennywise-gate";
import { selectSmithyJob, selectSmithyJobVenue, smithyJobCommandId, smithyStrokeOptions } from "../depth/smithy-job";
import { innBluffCommandId, projectInnBluffDecision, selectInnBluffVenue } from "../depth/inn-bluff";
import { selectDungeonLairEncounter } from "../depth/dungeon-lair";
import { randomInt } from "./rng";
import { describeForwardMotionReason } from "./forward-motion";
import { projectCombatActionForecast } from "./combat-action-forecast";
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
  millerCombat: freezeProfile("millerCombat", [
    { id: "miller.guard-self", conditions: ["actor-low-health"], selector: "guard", reasonCode: "survive-danger" },
    { id: "miller.flour-veil", conditions: [], selector: "companion-flour-veil", reasonCode: "protect-companion" },
    { id: "miller.finish", conditions: ["bounded-finish"], selector: "finishing-action", reasonCode: "finish-safely" },
    { id: "miller.millstone-drag", conditions: [], selector: "companion-millstone-drag", reasonCode: "control-tempo" },
    { id: "miller.attack", conditions: [], selector: "basic-attack", reasonCode: "continue-purposefully" },
    { id: "miller.fallback", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
  ]),
  sharedOpeningCombat: freezeProfile("sharedOpeningCombat", [
    { id: "opening.restore", conditions: [], selector: "restorative", reasonCode: "survive-danger" },
    { id: "opening.millrace-reversal", conditions: [], selector: "millrace-reversal", reasonCode: "control-tempo" },
    { id: "opening.fallback", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
  ]),
  repartee: freezeProfile("repartee", [
    { id: "repartee.shared-joke", conditions: [], selector: "witnessed-playful-reply", reasonCode: "continue-purposefully" },
    { id: "repartee.learned-counter", conditions: ["hero-curious"], selector: "any", reasonCode: "test-technique" },
    { id: "repartee.graceful-concession", conditions: ["hero-merciful"], selector: "any", reasonCode: "control-conflict" },
    { id: "repartee.defiant-voice", conditions: ["hero-courageous"], selector: "any", reasonCode: "meet-danger" },
    { id: "repartee.address-the-claim", conditions: [], selector: "any", reasonCode: "continue-purposefully" },
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
  reparteeResponses: ReadonlyMap<string, ReparteeResponse>;
  sharedJokeWitness: string | null;
}

function sharedJokeWitness(state: WorldState): string | null {
  const depth = state.depth, active = depth.repartee.active;
  if (!state.hero.values.includes("loyalty") || active?.rulesVersion !== 2 || active.roundIndex !== 1
    || state.seed !== depth.seed || state.hero.id !== depth.hero.id
    || depth.reparteeWitness.preference?.preferenceId !== "playfulness") return null;
  // This one policy moment uses the same real source/presence checks as the reducer.
  // A role, absent friend, private invented taste or unrelated saved preference is insufficient.
  return isValidCampaignRepartee(depth) ? depth.companions.active[0]?.identity.name ?? null : null;
}

function projectActorPolicyKnowledge(state: WorldState): ActorPolicyKnowledge {
  const moves = state.depth.dungeon === null ? [] : projectDungeonMoveKnowledge(state.depth.dungeon);
  const responses = state.depth.repartee.active === null ? [] : reparteeResponses(state.depth.repartee);
  return { dungeonMoves: new Map(moves.map((move) => [move.direction, move])),
    reparteeResponses: new Map(responses.map((response) => [response.id, response])),
    sharedJokeWitness: sharedJokeWitness(state) };
}

function knownReparteeResponse(state: WorldState, candidate: DepthCommandCandidate, knowledge: ActorPolicyKnowledge): ReparteeResponse | undefined {
  const command = candidate.command, active = state.depth.repartee.active;
  if (command.type !== "repartee-action" || active === null || command.encounterId !== active.encounterId
    || command.roundIndex !== active.roundIndex || candidate.deciderId !== active.actorId) return undefined;
  return knowledge.reparteeResponses.get(command.responseId);
}

function combatFacts(state: WorldState, candidate: DepthCommandCandidate): {
  actor: NonNullable<WorldState["depth"]["combat"]>["combatants"][number] | undefined;
  target: NonNullable<WorldState["depth"]["combat"]>["combatants"][number] | undefined;
  ability: AbilityState | undefined;
  projectedDamage: number;
  forecast: ReturnType<typeof projectCombatActionForecast> | null;
  finishesTarget: boolean;
  boundedFinish: boolean;
} {
  if (candidate.command.type !== "combat-action" || state.depth.combat === null) {
    return { actor: undefined, target: undefined, ability: undefined, projectedDamage: 0, forecast: null, finishesTarget: false, boundedFinish: false };
  }
  const action = candidate.command.action;
  const actor = state.depth.combat.combatants.find((entry) => entry.id === action.actorId);
  const target = state.depth.combat.combatants.find((entry) => entry.id === action.targetId);
  const ability = actor?.abilities.find((entry) => entry.id === action.abilityId);
  const forecast = projectCombatActionForecast(state.depth.combat, action);
  const projectedDamage = forecast.minimumDamage;
  const finishesTarget = forecast.canAct && target !== undefined && target.health > 0 && projectedDamage >= target.health;
  const opposingSurvivors = actor === undefined
    ? 0
    : state.depth.combat.combatants.filter((entry) => entry.side !== actor.side && entry.health > 0).length;
  return { actor, target, ability, projectedDamage, forecast, finishesTarget, boundedFinish: finishesTarget && opposingSurvivors === 1 };
}

function dungeonMoveKnowledge(
  candidate: DepthCommandCandidate,
  knowledge: ActorPolicyKnowledge,
): DungeonMoveKnowledge | undefined {
  return candidate.command.type === "move-dungeon"
    ? knowledge.dungeonMoves.get(candidate.command.direction)
    : undefined;
}

function knownUsefulReply(state: WorldState, candidate: DepthCommandCandidate) {
  const command = candidate.command, lesson = state.depth.usefulReply;
  if (command.type !== "practice-useful-reply" || lesson === null || lesson.reply !== null
    || command.lessonId !== lesson.lessonId || candidate.deciderId !== state.depth.hero.id
    || candidate.id !== usefulReplyCommandId(state.depth.tick + 1, command) || !isValidCampaignUsefulReply(state.depth)) return undefined;
  return usefulReplyResponses(lesson).find((response) => response.id === command.responseId);
}

function knownRoomChallengeReply(state: WorldState, candidate: DepthCommandCandidate) {
  const command = candidate.command, challenge = state.depth.roomChallenge;
  if (command.type !== "answer-room-challenge" || challenge === null || challenge.result !== null
    || command.encounterId !== challenge.encounterId || candidate.deciderId !== state.depth.hero.id
    || candidate.id !== roomChallengeCommandId(state.depth.tick + 1, command) || !isValidCampaignRoomChallenge(state.depth)) return undefined;
  return roomChallengeResponses(state.depth).find((response) => response.id === command.responseId);
}

function knownCompanionCreditReply(state: WorldState, candidate: DepthCommandCandidate) {
  const command = candidate.command, credit = selectCompanionCredit(state.depth);
  if (command.type !== "share-companion-credit" || credit === null || command.residentId !== credit.residentId
    || command.joinedTick !== credit.joinedTick || command.combatId !== credit.evidence.combat.id
    || candidate.deciderId !== state.hero.id || candidate.id !== companionCreditCommandId(state.tick + 1, command)) return undefined;
  return companionCreditChoices(state.depth).find((response) => response.choice === command.choice);
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
    const { actor, target, ability, projectedDamage, finishesTarget, forecast } = combatFacts(state, candidate);
    const lowHealth = actor !== undefined && actor.health * 3 <= actor.maxHealth;
    if (command.action.type === "item") {
      const item = state.depth.hero.inventory.find((entry) => entry.id === command.action.itemId);
      score = 180;
      reason = `${item?.name ?? "the restorative"} follows the visible emergency rule at HP ${actor?.health ?? 0}/${actor?.maxHealth ?? 0}`;
      if (legalMillraceReversal(state.depth.combat) !== null) {
        reason += "; emergency restoration takes priority and lets Shared Opening expire 1→0";
      }
    } else if (command.action.type === "joint-action") {
      const companionId = command.action.companionId;
      const companion = state.depth.combat.combatants.find((unit) => unit.id === companionId);
      score = 95;
      reason = `${companion?.name ?? "the Miller"} created the Shared Opening against ${target?.name ?? "the target"}; Millrace Reversal spends 1→0 on one weapon strike with piercing armor reduction ${Math.floor((target?.armor ?? 0) / 5)} and 0 MP`;
    } else if (command.action.type === "guard") {
      score = lowHealth ? 120 : 4;
      reason = lowHealth
        ? `guarding at ${actor?.health ?? 0}/${actor?.maxHealth ?? 0} health may prevent defeat`
        : "a measured defense preserves momentum";
    } else if (command.action.type === "companion-action") {
      const definition = companionActionDefinition(command.action.companionActionId);
      const runtime = state.depth.combat.companionActionRuntime;
      const readyRound = runtime?.readyRounds[command.action.companionActionId] ?? state.depth.combat.round;
      score = command.action.companionActionId === "flour-veil" ? 150 : 55;
      reason = command.action.companionActionId === "flour-veil"
        ? `${target?.name ?? "the ally"} is at HP ${target?.health ?? 0}/${target?.maxHealth ?? 0}; ${definition.name} grants Guarding ${definition.potency}% for ${definition.duration} turn at 0 MP and 0 damage; ready round ${readyRound}`
        : `${target?.name ?? "the foe"} has the highest visible Power ${target?.power ?? 0}; ${definition.name} applies Weakened ${definition.potency} for one action at 0 MP and 0 damage; ready round ${readyRound}`;
    } else {
      score = command.action.type === "ability" ? 28 + (ability?.potency ?? 0) : 18;
      if (finishesTarget) {
        score += 45 - Math.max(0, projectedDamage - (target?.health ?? 0));
        reason = `${ability?.name ?? "the strike"} can finish ${target?.name ?? "the target"}${forecast?.guarded === true ? " through Guard" : ""} with little waste`;
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
  } else if (command.type === "share-companion-credit") {
    const response = knownCompanionCreditReply(state, candidate);
    if (response === undefined) throw new Error("Actor Policy cannot invent a credit response or contributor");
    const considerate = state.hero.values.includes("loyalty") || state.hero.values.includes("mercy");
    const boastful = !considerate && state.hero.values.includes("courage");
    score = response.choice === (boastful ? "claim-credit" : "acknowledge") ? 80 : 20;
    reason = response.choice === "acknowledge"
      ? "the companion actually landed a damaging hit; loyalty, mercy or honest curiosity makes room for that work in the story"
      : "courage without a loyalty or mercy preference favors a boast; the hero knowingly risks the fair-credit companion's disapproval, without changing the battle reward";
  } else if (command.type === "use-dungeon-tonic") {
    score = 80;
    reason = "the living explorer is at half health or below; spending one owned Ember Tonic steadies them before another dungeon action, without moving or discovering anything";
  } else if (command.type === "reunite-companion") {
    score = 60;
    reason = "a real return has brought the hero back to a fulfilled companion's recorded farewell town; a hello honors that history without renewing the oath";
  } else if (command.type === "start-room-challenge") {
    score = 60;
    reason = "the lesson and Bell delivery are complete; this real resident offers one public claim with one declared, bounded reputation stake";
  } else if (command.type === "answer-room-challenge") {
    const response = knownRoomChallengeReply(state, candidate);
    if (response === undefined) throw new Error("Actor Policy cannot score an unknown or foreign room reply");
    const curious = state.hero.values.includes("curiosity"), merciful = state.hero.values.includes("mercy");
    score = 20 + response.delta * 20;
    if (curious && response.classification === "direct") {
      score += 60;
      reason = `curiosity tests the constructive frame actually learned from ${usefulReplyBook.title}; ${response.explanation}`;
    } else if (!curious && merciful && response.classification === "near") {
      score += 60;
      reason = `mercy gives the room its moment instead of insisting on winning the point; the hero knowingly accepts a draw and no reputation award; ${response.explanation}`;
    } else if (!curious && !merciful && state.hero.values.includes("courage") && response.classification === "category") {
      score += 80;
      reason = `courage favors a defiant answer over the sounder learned counter; the hero knowingly sacrifices this single point; ${response.explanation}`;
    } else {
      reason = `the known reply is judged against this public claim, not the size of a vocabulary; ${response.explanation}`;
    }
  } else if (command.type === "read-useful-book") {
    score = 60;
    reason = `the prior road oath is complete; a real public copy of ${usefulReplyBook.title} offers a new way to answer without turning the room into a contest`;
  } else if (command.type === "practice-useful-reply") {
    const response = knownUsefulReply(state, candidate);
    if (response === undefined) throw new Error("Actor Policy cannot select an unlearned or foreign practice reply");
    score = response.classification === "constructive" ? 80 : response.classification === "concession" ? 20 : 0;
    reason = response.classification === "constructive"
      ? `the actual reading of ${usefulReplyBook.title} unlocked a constructive answer; practice tests that new idea without seeking applause or a reward; ${response.explanation}`
      : `this plain response was already known before reading; ${response.explanation}`;
  } else if (command.type === "repartee-action") {
    const response = knownReparteeResponse(state, candidate, knowledge);
    if (response === undefined) throw new Error("Actor Policy cannot score an unknown repartee response");
    score = 20 + response.delta * 20;
    const curious = state.hero.values.includes("curiosity"), merciful = state.hero.values.includes("mercy");
    if (knowledge.sharedJokeWitness !== null && response.id === "loud-authority:category") {
      score = 100;
      reason = `loyalty makes room for one deliberate joke for ${knowledge.sharedJokeWitness}, whose declared taste is absurdity; the hero knowingly accepts -1 momentum for this round instead of answering the claim; ${response.explanation}`;
    } else if (curious && response.style === "direct") {
      score += 40;
      reason = `curiosity tests a counter learned from ${reparteeBook.title}; ${response.explanation}`;
    } else if (!curious && merciful && response.classification === "near") {
      score += response.style === "personality" ? 50 : 40;
      reason = `mercy prefers an honest, dignified concession over winning the point; ${response.explanation}`;
    } else if (!curious && !merciful && state.hero.values.includes("courage") && response.style === "personality") {
      score += 60;
      reason = `courage favors a defiant personal answer over guaranteeing the round; ${response.explanation}`;
    } else {
      reason = `the known answer is judged against the public claim: ${response.explanation}`;
    }
  } else if (command.type === "move-bell") {
    const board = state.depth.bellExpedition;
    const curious = state.hero.values.includes("curiosity");
    const urgent = (board?.turn ?? 1) >= 4;
    score = command.pace === "stride" ? 30 : 10;
    if (command.route === 2 || command.route === 7) score += urgent ? 60 : 12;
    if (curious && !urgent && (command.route === 3 || command.route === 6)) score += 22;
    const inspect = curious && !urgent && board !== null && board.pendingRoll !== null
      && board.pendingRoll.value > 1 && board.mana >= 2
      && (board.currentCell === 1 && command.route === 3 || board.currentCell === 4 && command.route === 6)
      && !board.landedCells.includes(command.route!);
    if (inspect && command.pace === "steady") score += 50;
    reason = inspect && command.pace === "steady"
      ? "curiosity spends one real MP to stop at the signed room instead of passing it; its unrevealed effect is not known, and the delivery deadline still applies"
      : urgent ? "the fourth-turn closing deadline favors the shortest signed exit route using the already committed roll"
        : curious && (command.route === 3 || command.route === 6)
          ? "curiosity chooses a signed detour without knowing its unrevealed landing effect"
          : "use the committed die and the public route signs to carry the bell toward the exit without spending precision mana";
  } else if (command.type === "start-bell" || command.type === "roll-bell") {
    score = 30;
    reason = command.type === "start-bell" ? "one solo delivery board is available after the road oath; its four-turn bonus and landing-only effects are declared"
      : "commit the current movement die before choosing a route or spending precision mana; no future roll informs the choice";
  } else if (command.type === "recall-repartee") {
    const witness = state.depth.companions.active.find((entry) => entry.identity.residentId === command.witnessId);
    score = 30;
    reason = `${witness?.identity.name ?? "the present witness"} has reached the promised destination; one quiet rest recalls an actual spoken exchange before farewell, without another reward`;
  } else if (command.type === "read-book") {
    const building = state.depth.towns[command.locationId]?.buildings.find((entry) => entry.id === command.buildingId);
    score = 30;
    reason = `${reparteeBook.title} is an available public reading copy at ${building?.name ?? "the recorded building"}; learning new replies grants no combat power`;
  } else if (command.type === "start-repartee") {
    const resident = state.depth.towns[command.locationId]?.residents.find((entry) => entry.id === command.residentId);
    score = 30;
    reason = `${resident?.name ?? "the recorded resident"} offers a three-round exchange with declared town-reputation stakes, not a fight`;
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
  } else if (command.type === "start-inn-bluff") {
    const venue = selectInnBluffVenue(state.depth);
    if (venue === null || venue.bluffId !== command.bluffId || venue.locationId !== command.locationId
      || venue.innId !== command.innId || venue.residentId !== command.residentId
      || candidate.deciderId !== state.hero.id || candidate.id !== innBluffCommandId(state.tick + 1, command)) {
      throw new Error("Actor Policy cannot invent an inn wager or its host");
    }
    score = 80; reason = `${venue.residentName} offers a short covered-cup claim; hear the public tell before deciding whether to stake one gold`;
  } else if (command.type === "resolve-inn-bluff") {
    // This copied public packet has no covered face, outcome, seed, or raw receipt.
    const decision = projectInnBluffDecision(state.depth);
    if (decision === null || decision.bluffId !== command.bluffId
      || !decision.choices.some(option => option.choice === command.choice)
      || candidate.deciderId !== state.hero.id || candidate.id !== innBluffCommandId(state.tick + 1, command)) {
      throw new Error("Actor Policy cannot invent an inn-bluff choice");
    }
    const challenge = command.choice === "challenge", suspicious = decision.tell === "fidgeting";
    score = challenge ? suspicious ? 70 : 30 : suspicious ? 40 : 60;
    reason = challenge ? suspicious
      ? "the fidgeting hand suggests a bluff, not proof; risk one gold on a tell that is right only two times in three"
      : "a steady hand weakens the case for a bluff; challenging still risks one owned gold"
      : suspicious ? "even a suspicious gesture can mislead; decline the wager and retain every coin"
        : "the steady hand gives little reason to challenge; decline without spending gold";
    if (challenge && (state.hero.values.includes("curiosity") || state.hero.values.includes("courage"))) {
      score += (state.hero.values.includes("curiosity") ? 20 : 0) + (state.hero.values.includes("courage") ? 20 : 0);
      reason += "; curiosity or courage accepts the uncertainty, without knowing the covered number";
    }
    if (decision.gold <= 2 && !challenge) {
      score = 100; reason = "preserve the last coins for the road; a fallible tell is not worth the one-gold stake";
    }
  } else if (command.type === "start-smithy-job") {
    const venue = selectSmithyJobVenue(state.depth);
    if (venue === null || venue.jobId !== command.jobId || venue.locationId !== command.locationId
      || venue.smithId !== command.smithId || venue.residentId !== command.residentId
      || candidate.deciderId !== state.hero.id || candidate.id !== smithyJobCommandId(state.tick + 1, command)) {
      throw new Error("Actor Policy cannot invent a smithy job or its host");
    }
    score = 80; reason = `${venue.residentName} offers two gold for one straight nail: two strokes, a known target, and no other promised reward`;
  } else if (command.type === "smithy-stroke") {
    const job = selectSmithyJob(state.depth);
    const option = smithyStrokeOptions(state.depth).find(entry => entry.stroke === command.stroke);
    if (job === null || job.jobId !== command.jobId || command.strokeIndex !== job.strokes.length || option === undefined
      || candidate.deciderId !== state.hero.id || candidate.id !== smithyJobCommandId(state.tick + 1, command)) {
      throw new Error("Actor Policy cannot invent a smithy stroke");
    }
    const points = job.strokes.at(-1)?.pointsAfter ?? 0, mana = state.depth.hero.resources.mana;
    const conserving = mana <= 2 && !state.hero.values.includes("loyalty");
    const experimenting = state.hero.values.includes("curiosity") && state.hero.values.includes("courage") && mana >= 2;
    score = job.strokes.length === 0 ? command.stroke === "drive" ? 50 : 40
      : points + option.pointsAdded === 3 ? 80 : 20;
    reason = job.strokes.length === 0 ? command.stroke === "drive"
      ? "begin with a focused drive, leaving a gentle finishing tap to reach exactly three shaping points"
      : "begin with a gentle tap, leaving a focused drive to reach exactly three shaping points"
      : points + option.pointsAdded === 3 ? "the disclosed shaping target is three; this stroke finishes a straight nail and earns the two-gold wage"
        : "this legal stroke will not meet the disclosed target and earns no wage";
    if (command.stroke === "tap" && conserving) {
      score = 110; reason = "keep the last reserves of MP for the road, even if gentle work leaves the nail unfinished and unpaid";
    } else if (command.stroke === "drive" && experimenting) {
      score = 100; reason = job.strokes.length === 0 ? "curiosity and courage try the stronger technique, spending one real MP"
        : points + option.pointsAdded > 3
          ? "curiosity and courage try a second strong blow, accepting the disclosed bent nail and lost wage to see it through"
          : "the stronger finish reaches the disclosed target for a straight nail, spending one real MP";
    }
  } else if (command.type === "choose-pennywise-gate" || command.type === "pass-pennywise-gate") {
    const gate = selectPennywiseGate(state.depth);
    if (gate === null || gate.gateId !== command.gateId || candidate.deciderId !== state.hero.id
      || candidate.id !== pennywiseGateCommandId(state.tick + 1, command)) throw new Error("Actor Policy cannot invent a Pennywise Gate");
    if (command.type === "pass-pennywise-gate") {
      if (gate.choice?.kind !== "lift") throw new Error("The gate has not been lifted");
      score = 80; reason = "the barrier was lifted on the previous turn; walk the actual remaining road distance without paying a toll";
    } else {
      if (!pennywiseGateChoices(state.depth).some(option => option.choice === command.choice)) throw new Error("The gate choice is unavailable");
      const curious = state.hero.values.includes("curiosity");
      score = command.choice === "pay" ? 40 : curious ? 50 : 20;
      reason = command.choice === "pay" ? "spend two owned gold on the counterweight and pass in one action"
        : curious ? "curiosity tries the hand-lifted mechanism: keep the gold, spend one extra action, and gain no extra reward"
          : "lift the barrier by hand to keep the gold; crossing takes a separate action";
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
  } else if (command.type === "restock-tonic") {
    const restock = selectTonicRestock(state.depth);
    score = 110;
    reason = restock === null
      ? "the safe-town supply receipt is unavailable"
      : `${restock.townName} safely renews ${restock.itemName} ×${restock.quantityBefore}→×${restock.quantityAfter} for ${restock.goldSpent} gold`;
  } else if (command.type === "buy-disarming-kit") {
    const purchase = selectDisarmingKitPurchase(state.depth);
    score = 100;
    reason = purchase === null ? "the recorded smith's supply is unavailable"
      : `${purchase.smithName} offers one disarm assist for ${purchase.goldSpent} gold`;
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
  } else if (command.type === "open-dungeon-passage") {
    const clue = selectAvailableDungeonSecretPassage(state.depth);
    if (clue === null || command.dungeonId !== clue.dungeonId || command.fromCellId !== clue.fromCellId
      || command.toCellId !== clue.toCellId || candidate.deciderId !== state.hero.id
      || candidate.id !== dungeonSecretPassageCommandId(state.tick + 1, command.dungeonId, command.fromCellId, command.toCellId)) {
      throw new Error("Actor Policy cannot invent a dungeon passage or its clue");
    }
    score = 80;
    reason = "a draught in this room reveals a useful shortcut through already visited rooms; investigate the latch without moving or bypassing the key gate";
  } else if (command.type === "search-dungeon") {
    score = 70;
    reason = "health at or below half calls for one careful look before entering an unexplored passage";
  } else if (command.type === "disarm-dungeon-trap") {
    score = 100;
    reason = "the detected mechanism blocks safe progress and permits one careful attempt";
  } else if (command.type === "train-ability") {
    const ability = state.depth.hero.abilities.find((entry) => entry.id === command.abilityId);
    score = 30 - Math.min(20, ability?.experience ?? 0);
    if (state.hero.values.includes("curiosity")) score += 8;
    reason = `${ability?.name ?? "the technique"} has the most room to grow`;
  } else if (command.type === "start-dungeon-guardian") {
    const guardian = selectDungeonLairEncounter(state.depth);
    if (guardian === null || guardian.dungeonId !== command.dungeonId || guardian.cellId !== command.cellId
      || guardian.encounterId !== command.encounterId || candidate.id !== guardian.sourceCommandId
      || candidate.deciderId !== state.hero.id) throw new Error("Actor Policy cannot invent a dungeon guardian");
    score = 80;
    reason = "a guardian has actually been encountered in this entered lair; face it once, without inventing a road or a victory";
  } else if (command.type === "start-combat") {
    score = 50;
    reason = "the road encounter has crossed the unavoidable threshold";
  } else if (command.type === "start-counter-duel") {
    score = 50;
    reason = "the road rival has declared a bounded Pattern Duel";
  } else if (command.type === "wait") {
    const innRest = selectPaidInnRest(state.depth);
    const bellMemory = selectBellDeliveryMemory(state.depth);
    score = innRest !== null || state.depth.hero.resources.health < state.depth.hero.resources.maxHealth ? 100 : 5;
    reason = innRest !== null
      ? `${innRest.innName} restores depleted mana before the road for ${innRest.goldSpent} gold`
      : state.depth.atlas.route !== null
      && state.depth.hero.resources.health * 2 <= state.depth.hero.resources.maxHealth
      ? "full recovery is wiser than entering the unresolved road encounter at critical health"
      : "recovery is safer than an illegal or impossible move";
    if (bellMemory !== null) reason += "; the already-needed rest leaves room for one private memory of the actual bell delivery";
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
  const { ability, boundedFinish, forecast } = combatFacts(state, candidate);
  switch (selector) {
    case "finishing-action": return command.type === "combat-action" && (command.action.type === "attack" || command.action.type === "ability") && boundedFinish;
    case "restorative": return command.type === "combat-action" && command.action.type === "item";
    case "guard": return command.type === "combat-action" && command.action.type === "guard";
    case "control-ability": return command.type === "combat-action" && command.action.type === "ability" && (ability?.effect === "weaken" || ability?.effect === "poison");
    case "unpracticed-ability": return command.type === "combat-action" && command.action.type === "ability";
    case "strongest-attack": return command.type === "combat-action" && (command.action.type === "attack" || command.action.type === "ability");
    case "basic-attack": return command.type === "combat-action" && command.action.type === "attack";
    case "companion-flour-veil": return command.type === "combat-action" && command.action.type === "companion-action" && command.action.companionActionId === "flour-veil";
    case "companion-millstone-drag": return command.type === "combat-action" && command.action.type === "companion-action" && command.action.companionActionId === "millstone-drag";
    case "millrace-reversal": return command.type === "combat-action" && command.action.type === "joint-action"
      && command.action.jointActionId === "millrace-reversal" && forecast?.canAct === true && forecast.minimumDamage > 0;
    case "witnessed-playful-reply": return knowledge.sharedJokeWitness !== null
      && knownReparteeResponse(state, candidate, knowledge)?.id === "loud-authority:category";
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
  if (candidates.some((candidate) => candidate.command.type === "repartee-action")) return "repartee";
  const combatCandidate = candidates.find((candidate) => candidate.command.type === "combat-action");
  if (combatCandidate === undefined) return "road";
  const actor = combatFacts(state, combatCandidate).actor;
  const opening = state.depth.combat === null ? null : legalMillraceReversal(state.depth.combat);
  if (opening !== null && opening.actorId === state.hero.id && actor?.id === opening.actorId) return "sharedOpeningCombat";
  if (actor !== undefined && state.depth.combat?.companionActionRuntime?.actorId === actor.id) return "millerCombat";
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
    case "use-dungeon-tonic": return { actionLabel: "drinks one owned Ember Tonic", targetLabel: "the wounded explorer" };
    case "reunite-companion": return { actionLabel: "says hello after returning", targetLabel: state.depth.companionReunion?.companionName ?? "the recorded former companion" };
    case "share-companion-credit": return { actionLabel: knownCompanionCreditReply(state, candidate)?.heroLine ?? "the unavailable credit response", targetLabel: state.depth.companionCredit?.companionName ?? "the recorded companion" };
    case "start-bell": return { actionLabel: "accepts the Borrowed Bell delivery", targetLabel: "the storehouse board" };
    case "roll-bell": return { actionLabel: "rolls before choosing a pace", targetLabel: `delivery turn ${command.turn}` };
    case "move-bell": return {
      actionLabel: command.pace === "steady" ? "spends 1 MP for one precise step" : "uses the committed movement roll",
      targetLabel: command.route === 2 ? "short toll route" : command.route === 3 ? "inspection route"
        : command.route === 6 ? "parcel counter detour" : command.route === 7 ? "direct exit route" : "the next marked space",
    };
    case "recall-repartee": return {
      actionLabel: "shares a memory before parting",
      targetLabel: state.depth.companions.active.find((entry) => entry.identity.residentId === command.witnessId)?.identity.name ?? command.witnessId,
    };
    case "start-room-challenge": return { actionLabel: "accepts a one-point public challenge", targetLabel: state.depth.towns[command.locationId]?.residents.find((resident) => resident.id === command.residentId)?.name ?? "the recorded resident" };
    case "answer-room-challenge": return { actionLabel: knownRoomChallengeReply(state, candidate)?.text ?? "the unavailable answer", targetLabel: state.depth.roomChallenge?.residentName ?? "the recorded resident" };
    case "read-useful-book": return { actionLabel: "reads a new public book", targetLabel: usefulReplyBook.title };
    case "practice-useful-reply": return { actionLabel: knownUsefulReply(state, candidate)?.text ?? "the unavailable practice reply", targetLabel: state.depth.usefulReply?.residentName ?? "the recorded resident" };
    case "read-book": return { actionLabel: "reads a public copy", targetLabel: reparteeBook.title };
    case "start-repartee": return {
      actionLabel: "accepts a flyting contest",
      targetLabel: state.depth.towns[command.locationId]?.residents.find((entry) => entry.id === command.residentId)?.name ?? "the recorded resident",
    };
    case "repartee-action": {
      const response = knownReparteeResponse(state, candidate, knowledge);
      const active = state.depth.repartee.active;
      const resident = active === null ? undefined : state.depth.towns[active.locationId]?.residents.find((entry) => entry.id === active.residentId);
      return { actionLabel: response?.text ?? "the unavailable reply", targetLabel: resident?.name ?? "the recorded resident" };
    }
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
      const forecast = combatFacts(state, candidate).forecast;
      const minimumLoss = Math.min(target?.health ?? 0, forecast?.minimumDamage ?? 0);
      const maximumLoss = Math.min(target?.health ?? 0, forecast?.maximumDamage ?? 0);
      const damageLabel = minimumLoss === maximumLoss ? String(minimumLoss) : `${minimumLoss}–${maximumLoss}`;
      const targetLabel = forecast?.guarded === true && forecast.canAct
        ? `${target?.name ?? "foe"} · Guard · ${damageLabel} damage`
        : target?.name ?? "foe";
      if (command.action.type === "joint-action") {
        const companionId = command.action.companionId;
        const companion = state.depth.combat?.combatants.find((unit) => unit.id === companionId);
        return {
          actionLabel: `uses Millrace Reversal with ${companion?.name ?? "the Miller"}`,
          targetLabel: `${target?.name ?? "foe"}${forecast?.guarded === true ? " · Guard" : ""} · Opening 1→0 · ${damageLabel} damage`,
        };
      }
      return command.action.type === "guard"
        ? { actionLabel: "guards", targetLabel: "self" }
        : command.action.type === "item"
          ? { actionLabel: `uses ${state.depth.hero.inventory.find((entry) => entry.id === command.action.itemId)?.name ?? "a restorative"}`, targetLabel: "self · emergency HP ≤ ⅓" }
        : command.action.type === "companion-action"
          ? { actionLabel: `uses ${companionActionDefinition(command.action.companionActionId).name}`, targetLabel: target?.name ?? "target" }
          : { actionLabel: command.action.type === "ability" ? `uses ${ability?.name ?? "a technique"}` : "attacks", targetLabel };
    }
    case "counter-duel-action": return {
      actionLabel: `reads ${counterDuelStanceLabel(command.prediction)}`,
      targetLabel: `answers with ${counterDuelStanceLabel(counterToStance(command.prediction))}`,
    };
    case "plan-route": return { actionLabel: "plots a route", targetLabel: state.depth.atlas.locations.find((entry) => entry.id === command.destinationId)?.name ?? command.destinationId };
    case "travel": return { actionLabel: `advances ${command.distance} ${command.distance === 1 ? "mile" : "miles"}`, targetLabel: state.scene.location };
    case "start-smithy-job": return { actionLabel: "takes a two-stroke nail-making job", targetLabel: selectSmithyJobVenue(state.depth)?.smithName ?? "the smithy" };
    case "start-inn-bluff": return { actionLabel: "hears a covered-cup claim", targetLabel: selectInnBluffVenue(state.depth)?.residentName ?? "the admitted resident" };
    case "resolve-inn-bluff": return { actionLabel: command.choice === "challenge" ? "stakes one gold on a challenge" : "declines and keeps every coin", targetLabel: projectInnBluffDecision(state.depth)?.residentName ?? "the admitted resident" };
    case "smithy-stroke": return { actionLabel: command.stroke === "drive" ? "drives the hammer with focus" : "gives the nail a gentle tap", targetLabel: "one hopefully straight nail" };
    case "choose-pennywise-gate": return { actionLabel: command.choice === "pay" ? "pays two gold and passes" : "lifts the barrier by hand", targetLabel: "the Pennywise Gate" };
    case "pass-pennywise-gate": return { actionLabel: "walks through the lifted barrier", targetLabel: "the Pennywise Gate" };
    case "visit-town": return { actionLabel: "enters town", targetLabel: state.scene.location };
    case "restock-tonic": {
      const restock = selectTonicRestock(state.depth);
      return {
        actionLabel: "restocks emergency tonics",
        targetLabel: restock === null
          ? command.itemId
          : `${restock.itemName} ×${restock.quantityBefore}→×${restock.quantityAfter} · gold ${restock.goldBefore}→${restock.goldAfter}`,
      };
    }
    case "buy-disarming-kit": {
      const purchase = selectDisarmingKitPurchase(state.depth);
      return { actionLabel: "buys a Disarming Kit", targetLabel: purchase === null ? command.smithId
        : `${purchase.smithName} · gold ${purchase.goldBefore}→${purchase.goldAfter}` };
    }
    case "enter-dungeon": return { actionLabel: "enters the maze", targetLabel: state.scene.location };
    case "invoke-dungeon-shrine": return { actionLabel: "invokes the far-stair shrine", targetLabel: state.scene.location };
    case "move-dungeon": {
      const move = dungeonMoveKnowledge(candidate, knowledge);
      return {
        actionLabel: `takes the ${command.direction} passage`,
        targetLabel: move?.sightedWayfinderKey === true ? "the sighted Wayfinder Key" : move?.feature ?? state.scene.location,
      };
    }
    case "disarm-dungeon-trap": return { actionLabel: selectDisarmingKit(state.depth.hero) === null
      ? "attempts to disarm" : "uses a Disarming Kit (+2)", targetLabel: "the detected mechanism" };
    case "search-dungeon": return { actionLabel: "searches from this room", targetLabel: "the unexplored passages" };
    case "open-dungeon-passage": return { actionLabel: "investigates the draught", targetLabel: "the current room's hidden latch" };
    case "unlock-dungeon-gate": return { actionLabel: "turns the Wayfinder Key", targetLabel: "the sealed shortcut" };
    case "start-combat": return { actionLabel: "faces the road's danger", targetLabel: `${command.enemyCount} ${command.enemyCount === 1 ? "threat" : "threats"}` };
    case "start-dungeon-guardian": return { actionLabel: "faces the entered lair's guardian", targetLabel: state.depth.dungeon?.lair?.encounter?.guardian.name ?? "the recorded guardian" };
    case "start-counter-duel": return { actionLabel: "accepts a Pattern Duel", targetLabel: "the road rival" };
    case "admit-deferred-secret": return {
      actionLabel: "gives a held field note form",
      targetLabel: state.depth.secretDiscoveryOutcomes.find((entry) => entry.id === command.outcomeId)?.abilityName ?? command.outcomeId,
    };
    case "train-ability": return { actionLabel: "practices", targetLabel: state.depth.hero.abilities.find((entry) => entry.id === command.abilityId)?.name ?? command.abilityId };
    case "fulfill-quest": return { actionLabel: "fulfills the quest", targetLabel: state.depth.quest.title };
    case "apply-quest-reward": return { actionLabel: "receives the quest reward", targetLabel: state.depth.quest.title };
    case "admit-successor-quest": return { actionLabel: "begins the next quest", targetLabel: state.depth.completedQuests.at(-1)?.title ?? command.completionId };
    case "wait": {
      const innRest = selectPaidInnRest(state.depth);
      return innRest === null
        ? { actionLabel: selectBellDeliveryMemory(state.depth) === null ? "recovers" : "recovers and remembers the bell", targetLabel: state.scene.location }
        : { actionLabel: selectBellDeliveryMemory(state.depth) === null ? "rests at an inn" : "rests and remembers the bell", targetLabel: `${innRest.innName} · gold ${innRest.goldBefore}→${innRest.goldAfter} · MP ${innRest.manaBefore}→${innRest.manaAfter}` };
    }
  }
}

export function actorPolicy(state: WorldState, opportunity: Opportunity): ActorChoice {
  const knowledge = projectActorPolicyKnowledge(state);
  const candidates = opportunity.candidates.filter((candidate) => state.depth.repartee.active === null
    ? candidate.command.type !== "repartee-action"
    : knownReparteeResponse(state, candidate, knowledge) !== undefined)
    .filter((candidate) => state.depth.usefulReply !== null && state.depth.usefulReply.reply === null
      ? knownUsefulReply(state, candidate) !== undefined : candidate.command.type !== "practice-useful-reply")
    .filter((candidate) => state.depth.roomChallenge !== null && state.depth.roomChallenge.result === null
      ? knownRoomChallengeReply(state, candidate) !== undefined : candidate.command.type !== "answer-room-challenge")
    .filter((candidate) => candidate.command.type !== "share-companion-credit" || knownCompanionCreditReply(state, candidate) !== undefined);
  const context = contextFor(state, candidates);
  const profile = actorInstinctProfiles[context];
  const ranked = candidates
    .map((candidate) => {
      const matched = matchingRule(state, candidate, profile, knowledge);
      const command = candidate.command;
      const facts = combatFacts(state, candidate);
      // Only rank alternatives inside the existing safe, battle-ending rule.
      // Enemy turns, party actions, recovery priorities and multi-foe tactics
      // retain their current ordering; no future combat roll is consulted.
      const finish = matched.rule.selector === "finishing-action" && facts.boundedFinish
        && command.type === "combat-action" && command.action.actorId === state.depth.hero.id
        && (command.action.type === "attack" || command.action.type === "ability")
        ? [facts.ability?.manaCost ?? 0, facts.projectedDamage - (facts.target?.health ?? 0), command.action.type === "attack" ? 0 : 1] as const
        : null;
      return { ...scoreCandidate(state, candidate, knowledge), ...matched, finish };
    })
    .sort((left, right) => left.index - right.index
      || (left.finish !== null && right.finish !== null
        ? left.finish[0] - right.finish[0] || left.finish[1] - right.finish[1] || left.finish[2] - right.finish[2]
        : 0)
      || right.score - left.score || left.tieBreak - right.tieBreak || (left.candidate.id < right.candidate.id ? -1 : 1));
  const selected = ranked[0];
  if (selected === undefined) throw new Error("Actor Policy found no legal choice");
  if (selected.finish !== null) {
    const facts = combatFacts(state, selected.candidate);
    selected.reason = `${facts.ability?.name ?? "the weapon strike"} guarantees a finish against the last foe, ${facts.target?.name ?? "the target"}${facts.forecast?.guarded === true ? ", through Guard" : ""}; ${selected.finish[0]} MP and ${selected.finish[1]} minimum overkill, preferring lower mana cost and then less guaranteed overkill`;
  }
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
  const guardedAlternative = !combatFacts(state, selected.candidate).boundedFinish
    ? ranked.find((entry) => {
      const facts = combatFacts(state, entry.candidate);
      return facts.actor !== undefined && facts.target !== undefined && facts.target.health > 0
        && facts.forecast?.canAct === true && facts.forecast.guarded
        && facts.forecast.unguardedMinimumDamage >= facts.target.health && !facts.finishesTarget
        && state.depth.combat?.combatants.filter((unit) => unit.side !== facts.actor!.side && unit.health > 0).length === 1;
    })
    : undefined;
  const selectedReason = guardedAlternative === undefined
    ? selected.reason
    : `${combatFacts(state, guardedAlternative.candidate).target?.name ?? "The foe"}'s Guard prevents a guaranteed finish; ${selected.reason}`;
  const reasons = [forwardReason ?? selectedReason];
  const rationale = forwardReason === null
    ? selectedCommand.type === "repartee-action" || selectedCommand.type === "practice-useful-reply" || selectedCommand.type === "answer-room-challenge"
      ? `${actor.name} chose the reply “${selected.candidate.label}” because ${selectedReason.replace(/[.!?]+$/u, "")}.`
      : `${actor.name} chose to ${selected.candidate.label} because ${selectedReason}.`
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
