import { isValidCampaignUsefulReply, usefulReplyBook, usefulReplyCall } from "../depth/useful-reply";
import { isValidCampaignRoomChallenge } from "../depth/room-challenge";
import { isValidCampaignCompanionReunion } from "../depth/companion-reunion";
import { isValidCampaignDungeonFieldMedicine } from "../depth/dungeon-field-medicine";
import { isValidDungeonSecretPassage } from "../depth/dungeon";
import { isValidCampaignPennywiseGate } from "../depth/pennywise-gate";
import { isValidCampaignSmithyJob } from "../depth/smithy-job";
import { innBluffClaim, innBluffTellText, isValidCampaignInnBluff } from "../depth/inn-bluff";
import { isValidCampaignDungeonLair } from "../depth/dungeon-lair";
import { isValidCampaignRoadSupper } from "../depth/road-supper";
import { isValidCampaignElsewhereLoaf } from "../depth/elsewhere-loaf";
import { isValidCampaignCompanionCredit } from "../depth/companion-credit";
import { isValidCampaignBetterQuestion } from "../depth/better-question";
import {
  abilityExperienceCeiling,
  abilityExperienceFloor,
  applyHeroExperience,
  counterDuelHabitText,
  counterDuelPatternBreakText,
  counterDuelStanceLabel,
  counterDuelTellText,
  createQuest,
  createDepthState,
  describeCompletedQuestReward,
  describeQuestRewardReceipt,
  describeWeaponUseReceipt,
  describeDungeonShrineUse,
  depthCommandCandidates,
  dungeonTrapAt,
  isValidAtlasState,
  isValidCompanionReferences,
  isValidCompanionRoster,
  isValidCompanionStateGraph,
  isValidCounterDuel,
  isValidDungeonState,
  isValidDetailedHeroState,
  isValidDepthEncounterThreatState,
  isValidSecretDiscoveryGraph,
  isValidCampaignRepartee,
  isValidCampaignReparteeCallback,
  isValidCampaignBorrowedBell,
  isValidBellDeliveryMemory,
  selectBellDeliveryMemory,
  bellDeliveryRestName,
  describeBorrowedBell,
  isCanonicalQuestDefinition,
  isValidQuestState,
  isValidQuestCompletionState,
  isValidQuestRewardState,
  heroLevelForExperience,
  heroMasteryForExperience,
  legacyHeroLevelForExperience,
  maximumHeroLevel,
  needsCriticalRoadsideRecovery,
  projectLatestCombatTurn,
  projectCounterDuelHabit,
  projectLatestShrineUse,
  selectTonicRestock,
  selectPaidInnRest,
  questLeadAdmissionStatus,
  reparteeBook,
  reparteeChallenges,
  projectSuccessorQuestLead,
  stepDepth,
  upgradeDepthState,
} from "../depth";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "../depth";
import { selectDisarmingKitPurchase } from "../depth/town-disarming-kit";
import { actorPolicy } from "./actor-policy";
import {
  applyHeroGrowth,
  describeHeroGrowthRecord,
  isValidHeroGrowthState,
} from "./hero-growth";
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
  CampaignLegacyState,
  ChronicleEntry,
  EventPolicy,
  HeroValue,
  Opportunity,
  SceneMode,
  SceneState,
  WorldState,
  RecordedDepthCommandType,
} from "./types";
import { recordedDepthCommandTypes } from "./types";
import {
  championExperienceFloorV1,
  championLevelV1,
  createChampionInduction,
  isValidChampionForState,
} from "./champions";
import { createCampaignLegacyState, isValidCampaignLegacyState } from "./legends";
import {
  createLegacyManifestationState,
  isValidLegacyManifestationState,
  legacyMentorArcNeedsTownVisit,
  projectLegacyManifestation,
  projectLegacyMentorArcBeat,
  resolveLegacyManifestation,
  resolveLegacyMentorArcBeat,
  scheduledLegacyMentorFarewellTownVisit,
  scheduledLegacyMentorPromiseTownVisit,
  scheduledLegacyMentorReturnTownVisit,
  scheduledLegacyTownVisit,
  totalTownVisits,
  upgradeLegacyManifestationState,
} from "./legacy-manifestations";

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

export function createWorld(
  seed: string,
  campaignId: string,
  legacy: CampaignLegacyState = createCampaignLegacyState(seed),
): WorldState {
  if (!isValidCampaignLegacyState(legacy, seed)) {
    throw new TypeError("New campaign legacy state violates selector invariants");
  }
  const name = heroName(seed);
  const heroId = `hero:${campaignId}`;
  const depth = createDepthState(seed, heroId, name);
  return {
    schemaVersion: 9,
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
    championInduction: null,
    legacy,
    legacyManifestations: createLegacyManifestationState(),
    depth,
  };
}

export function attentionPolicyForMode(mode: SceneMode): AttentionPolicy {
  if (mode === "battle") return "forbiddenDuringCatchUp";
  if (mode === "dungeon" || mode === "training" || mode === "discovery" || mode === "chronicle") return "queueForPresentation";
  return "backgroundSafe";
}

export function eventPolicyForMode(mode: SceneMode, commandType?: RecordedDepthCommandType): EventPolicy {
  // A once-only performed job uses the town stage, but should not have its
  // first showing consumed unseen. Ordinary town visits remain background-safe.
  const attention = commandType === "start-smithy-job" || commandType === "smithy-stroke"
    || commandType === "start-inn-bluff" || commandType === "resolve-inn-bluff"
    ? attentionPolicyForMode("chronicle") : attentionPolicyForMode(mode);
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
  const baseCandidates = depthCommandCandidates(depth);
  const constrained = constrainForwardMotion(
    state,
    legacyTownRevisitCandidate(state, baseCandidates) ?? baseCandidates,
  );
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
  const questLead = projectSuccessorQuestLead(depth.seed, depth.atlas, depth.quest);
  const fulfilledGoal = (): string => {
    const commandTypes = new Set(candidates.map((candidate) => candidate.command.type));
    if (commandTypes.size === 1 && commandTypes.has("combat-action")) {
      return "Resolve the battle before turning the page";
    }
    if (commandTypes.size === 1 && commandTypes.has("counter-duel-action")) {
      return "Finish the Pattern Duel before turning the page";
    }
    if (
      candidates.length === 1 &&
      candidates[0]?.command.type === "admit-successor-quest"
    ) {
      return `Begin ${createQuest(depth.seed, depth.totalCompletedQuests, depth.tick + 1).title}`;
    }
    throw new Error("A fulfilled quest has an incoherent encounter-closure opportunity");
  };
  const goal = depth.pendingQuestReward !== null
    ? `Receive the reward for ${depth.quest.title}`
    : depth.quest.status === "ready-to-fulfill"
      ? `Fulfill ${depth.quest.title}`
      : depth.quest.status === "fulfilled"
        ? fulfilledGoal()
        : questLead?.phase === "revealed" || questLead?.phase === "routed"
          ? `Follow the lead to ${questLead.locationName}`
          : questLead?.phase === "at-lead"
            ? `Search the lead at ${questLead.locationName}`
            : activeObjective?.description ?? "Decide what the legend becomes next";

  return { mode, location, goal, candidates, forwardMotionReason: constrained.reason };
}

export function legacyTownRevisitCandidate(
  state: WorldState,
  baseCandidates: readonly DepthCommandCandidate[],
): readonly DepthCommandCandidate[] | null {
  const needsInitialAppearance = state.legacyManifestations.appearances.length < state.legacy.cards.length;
  const needsMentorArcVisit = legacyMentorArcNeedsTownVisit(state);
  // A later oath can wait one visit; the consecutive-visit guard then releases the road.
  if (
    (!needsInitialAppearance && !needsMentorArcVisit) ||
    baseCandidates.length === 0 ||
    baseCandidates.some((candidate) => candidate.command.type !== "plan-route"
      && !(candidate.command.type === "recruit-companion" && state.depth.companions.former.length > 0)) ||
    state.chronicle.at(-1)?.commandType === "visit-town" ||
    state.depth.companions.active.length > 0
  ) return null;
  const location = state.depth.atlas.locations.find(
    (candidate) => candidate.id === state.depth.atlas.currentLocationId,
  );
  if (location?.kind !== "town" || state.depth.towns[location.id] === undefined) return null;
  const questLead = projectSuccessorQuestLead(state.depth.seed, state.depth.atlas, state.depth.quest);
  if (questLead?.phase === "revealed") return null;
  return [{
    id: `town:${location.id}`,
    label: `revisit ${location.name} before taking the road`,
    deciderId: state.hero.id,
    command: { type: "visit-town" },
  }];
}

export function sceneModeForCommand(state: WorldState, command: DepthCommand): SceneMode {
  switch (command.type) {
    case "share-companion-credit":
    case "reunite-companion":
    case "start-room-challenge":
    case "answer-room-challenge":
    case "read-useful-book":
    case "practice-useful-reply":
    case "read-better-question-book":
    case "answer-better-question":
    case "start-bell":
    case "roll-bell":
    case "move-bell":
    case "recall-repartee":
    case "read-book":
    case "start-repartee":
    case "repartee-action":
    case "recruit-companion":
    case "farewell-companion":
    case "fulfill-quest":
    case "apply-quest-reward":
    case "admit-successor-quest":
      return "chronicle";
    case "plan-route":
      return "atlas";
    case "travel":
    case "choose-pennywise-gate":
    case "pass-pennywise-gate":
      return "travel";
    case "restock-tonic":
    case "buy-disarming-kit":
    case "buy-road-rations":
    case "sell-spare-gear":
    case "start-smithy-job":
    case "smithy-stroke":
    case "start-inn-bluff":
    case "resolve-inn-bluff":
      return "town";
    case "prepare-road-supper":
      return "camp";
    case "visit-town":
      return projectLegacyManifestation(state, command) === null && projectLegacyMentorArcBeat(state, command) === null
        ? "town"
        : "chronicle";
    case "enter-dungeon":
    case "use-dungeon-tonic":
    case "invoke-dungeon-shrine":
    case "move-dungeon":
    case "search-dungeon":
    case "open-dungeon-passage":
    case "disarm-dungeon-trap":
    case "unlock-dungeon-gate":
      return "dungeon";
    case "start-combat":
    case "start-dungeon-guardian":
    case "combat-action":
    case "start-counter-duel":
    case "counter-duel-action":
      return "battle";
    case "certify-weapon-technique":
      return "training";
    case "train-ability":
      return state.depth.discoveries.at(-1)?.tick === state.depth.tick
        ? "discovery"
        : "training";
    case "admit-deferred-secret":
      return "discovery";
    case "wait":
      return selectBellDeliveryMemory(state.depth) !== null ? "chronicle"
        : selectPaidInnRest(state.depth) === null ? "camp" : "town";
  }
}

function experienceGainForCommand(command: DepthCommand, before: DepthState, after: DepthState): number {
  switch (command.type) {
    case "certify-weapon-technique":
      return 1; // The same ordinary hero experience as the training action this lesson occupies.
    case "start-inn-bluff":
    case "resolve-inn-bluff":
    case "start-smithy-job":
    case "smithy-stroke":
    case "choose-pennywise-gate":
    case "pass-pennywise-gate":
      return 0;
    case "share-companion-credit":
    case "use-dungeon-tonic":
    case "open-dungeon-passage":
    case "reunite-companion":
    case "start-room-challenge":
    case "answer-room-challenge":
    case "read-useful-book":
    case "practice-useful-reply":
    case "read-better-question-book":
    case "answer-better-question":
    case "start-bell":
    case "roll-bell":
    case "move-bell":
    case "recall-repartee":
    case "read-book":
    case "start-repartee":
    case "repartee-action":
    case "recruit-companion":
    case "farewell-companion":
    case "fulfill-quest":
    case "apply-quest-reward":
    case "admit-successor-quest":
    case "restock-tonic":
    case "buy-disarming-kit":
    case "buy-road-rations":
    case "sell-spare-gear":
    case "prepare-road-supper":
    case "invoke-dungeon-shrine":
      return 0;
    case "search-dungeon":
      return 0;
    case "wait":
      return needsCriticalRoadsideRecovery(before) || selectPaidInnRest(before) !== null ? 0 : 1;
    case "start-combat":
    case "start-dungeon-guardian":
      return 8;
    case "combat-action":
      return command.action.actorId === before.hero.id && command.action.type !== "item" ? 8 : 0;
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
    case "admit-deferred-secret":
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
  const supper = depth.roadSupper;
  const trade = depth.spareGearTrade;
  if (trade?.tick === depth.tick && choice.command.type === "sell-spare-gear") {
    return { mode: "town", location: trade.marketName, goal: "Keep the stronger weapon; lighten the pack",
      headline: "A lighter pack", action: `${state.hero.name} trades the unused ${trade.soldItem.name} at ${trade.marketName}. “At last, a weapon against my luggage.”`,
      consequence: `${trade.soldItem.name} ×1→×0; gold ${trade.goldBefore}→${trade.goldAfter} (+${trade.goldEarned}). ${trade.keptWeapon.name} stays equipped; its mastery, HP, MP and XP are unchanged.`, sensoryIntensity: 0 };
  }
  if (supper?.purchase.tick === depth.tick && choice.command.type === "buy-road-rations") {
    const purchase = supper.purchase;
    return { mode: "town", location: purchase.marketName, goal: "Carry real supplies for the road",
      headline: "A small investment in supper", action: `${state.hero.name} buys two Road Rations at ${purchase.marketName}.`,
      consequence: `Road Rations ×0→×2; gold ${purchase.goldBefore}→${purchase.goldAfter}. Nothing eaten yet; no HP, MP or XP change.`, sensoryIntensity: 0 };
  }
  if (supper?.meal?.tick === depth.tick && choice.command.type === "prepare-road-supper") {
    const meal = supper.meal;
    const place = depth.atlas.locations.find(location => location.id === meal.locationId)!.name;
    return { mode: "camp", location: `Road camp by ${place}`, goal: "Prepare once, then face the road encounter",
      headline: "Two rations, one pot", action: `${state.hero.name} cooks the two owned rations. “${meal.line}”`,
      consequence: "Road Rations ×2→×0. The next direct hit in this encounter deals 25% less damage; stronger Guard takes precedence. No healing, MP, XP, gold or bond reward.", sensoryIntensity: 0 };
  }
  const guardian = depth.dungeon?.lair?.encounter;
  if (guardian?.arrival.tick === depth.tick && choice.command.type === "move-dungeon") {
    return { mode: "dungeon", location: depth.dungeon!.name, goal: "Face the guardian of the entered lair",
      headline: "The room is taken",
      action: `${state.hero.name} enters ${guardian.cellId} and finds ${guardian.guardian.name}. “The map said lair. I had hoped it meant former lair.”`,
      consequence: "One actual guardian has been encountered. The room is not cleared, and no combat reward has been earned.", sensoryIntensity: 2 };
  }
  const bluff = depth.innBluff;
  if (bluff != null && (bluff.resolution?.tick ?? bluff.admission.tick) === depth.tick) {
    const result = bluff.resolution;
    return { mode: "town", location: bluff.innName, goal: "Hear the claim; challenge or keep your coin",
      headline: result === null ? "A thoroughly respectable number" : result.outcome === "exposed-bluff"
        ? "The cup was exaggerating" : result.outcome === "honest-claim" ? "Suspicion has a price" : "The coin stays in the pocket",
      action: result === null ? `${state.hero.name} sits down with ${bluff.residentName}. “${innBluffClaim}” ${innBluffTellText(bluff.admission.tell)}`
        : `${state.hero.name} ${result.choice === "challenge" ? "challenges the claim" : "declines the wager"}. ${bluff.residentName} lifts the cup: ${result.revealedFace}. “${result.line}”`,
      consequence: result === null ? "The tell is right two times in three, not a promise. Challenge stakes one gold and returns two if the claim is false; declining costs nothing."
        : `${result.outcome}. Gold ${result.goldBefore}→${result.goldAfter}; ${result.goldSpent} staked, ${result.goldReturned} returned. No HP, MP or XP change.`, sensoryIntensity: 0 };
  }
  const job = depth.smithyJob;
  if (job != null && (job.admission.tick === depth.tick || job.strokes.at(-1)?.tick === depth.tick)) {
    const stroke = job.strokes.at(-1), result = job.completion;
    return { mode: "town", location: job.smithName, goal: "Make one straight nail in two strokes",
      headline: result !== null ? result.shape === "straight" ? "One surprisingly straight nail" : result.shape === "bent" ? "A corner nail" : "Not quite a nail"
        : stroke === undefined ? "Surely I can make one nail" : "One more stroke ought to do it",
      action: result !== null ? `${state.hero.name} finishes the second stroke. ${job.residentName}: “${result.line}”`
        : stroke === undefined ? `${state.hero.name} meets ${job.residentName} at the anvil and accepts the two-gold job.`
          : `${state.hero.name} ${stroke.stroke === "drive" ? "drives the hammer with focused technique" : "taps the nail gently"}; the work stays on this anvil.`,
      consequence: result !== null ? `Shaping ${result.points}/3: ${result.shape}. Gold ${result.goldBefore}→${result.goldAfter}; final stroke MP ${stroke!.manaBefore}→${stroke!.manaAfter}. No HP or XP change.`
        : stroke === undefined ? "Two strokes: tap +1 for free, drive +2 for one MP. Exactly three shaping points earns two gold; other shapes earn nothing."
          : `Shaping ${stroke.pointsBefore}→${stroke.pointsAfter}/3; MP ${stroke.manaBefore}→${stroke.manaAfter}. One stroke remains; no wage earned yet.`, sensoryIntensity: 0 };
  }
  const gate = depth.pennywiseGate;
  if (gate != null && (gate.arrival.tick === depth.tick || gate.choice?.tick === depth.tick || gate.completion?.tick === depth.tick)) {
    const completion = gate.completion;
    return { mode: "travel", location: "The Pennywise Gate", goal: "Continue the road beyond the self-service barrier",
      headline: completion !== null ? "The price of passage" : gate.choice === null ? "The Pennywise Gate" : "Some lifting required",
      action: completion !== null ? `${state.hero.name} ${gate.choice?.kind === "pay" ? "feeds two coins into the counterweight and passes" : "walks through the hand-lifted gate"}.`
        : gate.choice === null ? `${state.hero.name} stops at a wooden barrier: two gold, or lift it yourself.`
          : `${state.hero.name} raises the barrier by hand and remains at the same road point.`,
      consequence: completion !== null ? `${completion.line} Gold ${completion.goldBefore}→${completion.goldAfter}; ${completion.distance} actual miles onward. No HP, MP or XP changed.`
        : gate.choice === null ? "The counterweight saves a turn. The free way asks for a little work. Neither grants a reward."
          : "Free passage. Some lifting required. The walk through comes next; no gold or resources spent.", sensoryIntensity: 0 };
  }
  if (choice.command.type === "wait" && previousDepth.bellMemory === null && depth.bellMemory?.tick === depth.tick) {
    const memory = depth.bellMemory;
    const location = depth.atlas.locations.find((entry) => entry.id === memory.rest.locationId);
    return { mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: "A quiet thought after the delivery",
      headline: memory.rest.kind === "inn" ? `The bell remembered at ${bellDeliveryRestName(memory.rest)}` : "A memory beside the road",
      action: `${depth.hero.name}: “${memory.line}”`,
      consequence: memory.rest.kind === "inn"
        ? `An ordinary inn rest: ${memory.rest.goldSpent} gold; health and mana restored. The memory grants no extra reward.`
        : "An ordinary roadside recovery: health and mana restored, no gold spent. The memory grants no extra reward.",
      sensoryIntensity: 0 };
  }
  if (choice.command.type === "start-bell" || choice.command.type === "roll-bell" || choice.command.type === "move-bell") {
    const board = depth.bellExpedition!;
    const location = depth.atlas.locations.find((entry) => entry.id === board.locationId);
    return { mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: "Return the Borrowed Bell by turn four",
      headline: board.completion === null ? "The Borrowed Bell" : board.completion.outcome === "delivered" ? "The bell beats the closing procession" : "A bell returned after closing",
      action: describeBorrowedBell(depth),
      consequence: board.completion === null ? "Forks stop movement. Only the landing room takes effect."
        : `Delivery bonus +${board.completion.bonusGold} gold, once. No combat XP or unrelated quest credit.`,
      sensoryIntensity: board.completion === null ? 1 : 0 };
  }
  if (choice.command.type === "recall-repartee" && depth.reparteeCallback !== null) {
    const memory = depth.reparteeCallback;
    const location = depth.atlas.locations.find((entry) => entry.id === memory.restLocationId);
    return {
      mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: "A shared memory before parting",
      headline: `A quiet rest at ${location?.name ?? "the destination"}`,
      action: `${memory.witnessName}: “${memory.line}”`,
      consequence: "The exchange is remembered, not rewarded again. Regard, bond and resources unchanged.",
      sensoryIntensity: 0,
    };
  }
  if (choice.command.type === "share-companion-credit" && depth.companionCredit?.exchange != null) {
    const credit = depth.companionCredit, exchange = credit.exchange!;
    const location = depth.atlas.locations.find((entry) => entry.id === credit.locationId);
    return { mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: "Whose story is this victory?", headline: "Share the credit",
      action: `${state.hero.name}: “${exchange.heroLine}” ${credit.companionName}: “${exchange.companionLine}”`,
      consequence: `Authored preference: fair credit. ${credit.companionName} → ${state.hero.name}: regard ${exchange.regardDelta > 0 ? "+" : ""}${exchange.regardDelta}. Bond, battle rewards and resources unchanged.`,
      sensoryIntensity: 0 };
  }
  if (choice.command.type === "open-dungeon-passage" && depth.dungeon?.secretPassage?.opened?.tick === depth.tick) {
    const passage = depth.dungeon.secretPassage, clue = passage.clue!;
    return { mode: "dungeon", location: depth.dungeon.name,
      goal: "Follow the draught without leaving the room", headline: "A draught in the wall",
      action: `${state.hero.name} finds a latch and eases the ${clue.direction} wall aside.`,
      consequence: "For a wall, it had a suspicious amount of weather. A real shortcut is open; no movement, XP or resources changed.",
      sensoryIntensity: 0 };
  }
  if (choice.command.type === "use-dungeon-tonic" && depth.dungeon?.latestFieldMedicineUse?.tick === depth.tick) {
    const use = depth.dungeon.latestFieldMedicineUse;
    const location = depth.atlas.locations.find((entry) => entry.id === use.locationId);
    return { mode: "dungeon", location: location?.name ?? opportunity.location,
      goal: "Steady the wounded explorer before continuing", headline: "A bitter mouthful, a steadier hand",
      action: `${state.hero.name} drinks one ${use.itemName} without leaving the room.`,
      consequence: `${use.itemName} ×${use.quantityBefore}→×${use.quantityAfter} · HP ${use.healthBefore}→${use.healthAfter}/${use.maxHealth} (+${use.amount}). No movement, MP, XP or quest credit.`,
      sensoryIntensity: 0 };
  }
  if (choice.command.type === "certify-weapon-technique" && depth.weaponTechniqueCertification !== undefined) {
    const lesson = depth.weaponTechniqueCertification;
    const location = depth.atlas.locations.find(entry => entry.id === lesson.locationId);
    return { mode: "training", location: location?.name ?? opportunity.location,
      goal: "Learn from a weapon actually used in battle", headline: `Blade lesson: ${lesson.ability.name}`,
      action: `${state.hero.name} slows the familiar stroke with ${lesson.weapon.name}. The blade has one more lesson: leave the foe less strength to answer.`,
      consequence: `Learned ${lesson.ability.name} · ${lesson.ability.manaCost} MP · half direct damage to soften a surviving foe's next retaliation. Previous techniques and weapon mastery unchanged.`,
      sensoryIntensity: 0 };
  }
  if (choice.command.type === "reunite-companion" && depth.companionReunion?.completed != null) {
    const reunion = depth.companionReunion, completed = reunion.completed!;
    const location = depth.atlas.locations.find((entry) => entry.id === reunion.locationId);
    return { mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: completed.memory === undefined ? "A hello after the shared road" : "Remember a line from the shared road",
      headline: `${completed.memory === undefined ? "A familiar face" : "An old line returns"}: ${reunion.companionName}`,
      action: `${state.hero.name}: “${completed.heroLine}” ${reunion.companionName}: “${completed.companionLine}”${completed.ovenReport === undefined ? "" : ` ${reunion.companionName}: “${completed.ovenReport.line}”`}`,
      consequence: completed.memory === undefined
        ? "The fulfilled oath stays fulfilled. No new journey, reward or relationship change is claimed."
        : "An actual witnessed answer returns to the conversation. The old judgment and fulfilled oath remain unchanged; no new reward or relationship change.",
      sensoryIntensity: 0 };
  }
  if ((choice.command.type === "start-room-challenge" || choice.command.type === "answer-room-challenge") && depth.roomChallenge !== null) {
    const challenge = depth.roomChallenge, result = challenge.result;
    const location = depth.atlas.locations.find((entry) => entry.id === challenge.locationId);
    return { mode: "chronicle", location: location?.name ?? opportunity.location,
      goal: "One public point about listening and leadership",
      headline: result === null ? "Let the room answer" : `One point: ${result.outcome}`,
      action: result === null ? `${challenge.residentName}: “${challenge.claim}”`
        : `${challenge.residentName}: “${challenge.claim}” ${state.hero.name}: “${result.reply}”`,
      consequence: result === null ? "One reply. A direct counter earns one town reputation, capped at 100; no other reward is at stake."
        : `${result.explanation} ${result.delta > 0 ? "+" : ""}${result.delta} point; reputation ${result.reputationBefore}→${result.reputationAfter}. Resources and relationships unchanged.`,
      sensoryIntensity: 1 };
  }
  if ((choice.command.type === "read-useful-book" || choice.command.type === "practice-useful-reply") && depth.usefulReply !== null) {
    const lesson = depth.usefulReply;
    return {
      mode: "chronicle", location: town?.name ?? opportunity.location,
      goal: "Learn a useful reply, not another way to win",
      headline: lesson.reply === null ? usefulReplyBook.title : "A useful reply",
      action: lesson.reply === null ? `“${usefulReplyBook.excerpt}” ${lesson.residentName}: “${usefulReplyCall.text}”`
        : `${lesson.residentName}: “${lesson.reply.call}” ${state.hero.name}: “${lesson.reply.reply}”`,
      consequence: lesson.reply === null ? `Learned “${usefulReplyBook.expression}”: a new constructive reply is now available.`
        : `${lesson.reply.explanation} Unscored practice; resources and relationships unchanged.`,
      sensoryIntensity: 0,
    };
  }
  if (choice.command.type === "read-book" || choice.command.type === "start-repartee" || choice.command.type === "repartee-action") {
    const duel = depth.repartee.active ?? depth.repartee.completed;
    const round = duel?.rounds.at(-1);
    const resident = town?.residents.find((entry) => entry.id === duel?.residentId);
    return {
      mode: "chronicle", location: town?.name ?? opportunity.location,
      goal: "A contest of wit, not weapons",
      headline: choice.command.type === "read-book" ? reparteeBook.title
        : depth.repartee.completed !== null ? `Flyting: ${depth.repartee.completed.outcome}`
          : `${state.hero.name} and ${resident?.name ?? "the resident"} trade words`,
      action: choice.command.type === "read-book" ? reparteeBook.excerpt
        : choice.command.type === "start-repartee" ? reparteeChallenges[0]!.text
          : round === undefined ? `${state.hero.name} concedes with dignity.` : `“${round.call}” — “${round.reply}”`,
      consequence: depth.log.at(-1)?.message ?? "Three rounds. Words alone settle this contest.",
      sensoryIntensity: 1,
    };
  }
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
  const sceneWeaponUse = combat === undefined || combat.outcome === "ongoing"
    ? null
    : depth.hero.inventory.flatMap((item) => item.useMastery?.receipts
        .filter((receipt) => receipt.combatId === combat.id && receipt.resolvedTick === depth.tick)
        .map((receipt) => ({ item, receipt })) ?? [])[0] ?? null;
  const sceneDiscovery = depth.discoveries.at(-1);
  const discoveredAbility = depth.hero.abilities.find(
    (ability) => ability.id === sceneDiscovery?.abilityId,
  );
  const trainingAbility = [...depth.hero.abilities].sort(
    (left, right) => left.experience - right.experience || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[0];
  const currentTrap = dungeon === null ? null : dungeonTrapAt(dungeon, dungeon.currentCellId);
  const shrineUse = dungeon === null ? null : projectLatestShrineUse(dungeon, depth.tick);
  const dungeonSearch = choice.command.type === "search-dungeon" && dungeon?.search?.latestReceipt?.tick === depth.tick
    ? dungeon.search.latestReceipt : null;
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
  const admittedFrom = choice.command.type === "admit-successor-quest"
    ? depth.completedQuests.at(-1)
    : undefined;
  const questLead = projectSuccessorQuestLead(depth.seed, depth.atlas, depth.quest);
  const previousQuestLead = projectSuccessorQuestLead(previousDepth.seed, previousDepth.atlas, previousDepth.quest);
  const leadArrival = previousQuestLead !== null &&
    choice.command.type === "travel" &&
    previousDepth.atlas.route?.destinationId === previousQuestLead.locationId &&
    depth.atlas.route === null &&
    depth.atlas.currentLocationId === previousQuestLead.locationId;
  const criticalRoadsideRecovery = choice.command.type === "wait"
    && previousDepth.atlas.route !== null
    && previousDepth.hero.resources.health * 2 <= previousDepth.hero.resources.maxHealth
    && depth.hero.resources.health === depth.hero.resources.maxHealth
    && depth.hero.resources.mana === depth.hero.resources.maxMana;
  const tonicRestock = choice.command.type === "restock-tonic"
    ? selectTonicRestock(previousDepth)
    : null;
  const innRest = choice.command.type === "wait" ? selectPaidInnRest(previousDepth) : null;
  const kitPurchase = choice.command.type === "buy-disarming-kit" ? selectDisarmingKitPurchase(previousDepth) : null;
  const releasedEncounterResolutionGoal =
    previousDepth.quest.status === "fulfilled" &&
    previousDepth.pendingQuestReward === null
      ? choice.command.type === "combat-action" && previousDepth.combat !== null && depth.combat === null
        ? "Battle resolved · the next chapter can begin"
        : choice.command.type === "counter-duel-action" && previousDepth.counterDuel !== null && depth.counterDuel === null
          ? "Pattern Duel resolved · the next chapter can begin"
          : null
      : null;
  const previousTrap = previousDepth.dungeon?.id === dungeon?.id && previousDepth.dungeon !== null && currentTrap !== null
    ? dungeonTrapAt(previousDepth.dungeon, currentTrap.cellId) : null;
  const freshManaTrap = currentTrap?.kind === "mana-siphon" && dungeon?.trapRulesVersion === 2
    && (choice.command.type === "enter-dungeon"
      ? previousDepth.dungeon?.id !== dungeon.id && currentTrap.cellId === dungeon.entryCellId
      : choice.command.type === "move-dungeon"
        ? previousTrap?.phase === "hidden" && !previousDepth.dungeon!.visitedCellIds.includes(currentTrap.cellId)
        : choice.command.type === "disarm-dungeon-trap" && previousTrap?.phase === "detected")
    && depth.hero.resources.health === previousDepth.hero.resources.health
    && depth.hero.resources.maxMana === previousDepth.hero.resources.maxMana
    && depth.hero.resources.mana === previousDepth.hero.resources.mana
      - Math.min(previousDepth.hero.resources.mana, Math.ceil(previousDepth.hero.resources.maxMana / 4));
  const trapTriggered = opportunity.mode === "dungeon"
    && currentTrap?.phase === "triggered"
    && (depth.hero.resources.health < previousDepth.hero.resources.health || freshManaTrap)
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
      headline: kitPurchase !== null
        ? `${kitPurchase.smithName}: tools for the dark below.`
        : tonicRestock !== null
        ? `${tonicRestock.townName}: road supplies renewed.`
        : innRest !== null ? `${innRest.innName}: a room before the road.`
        : town === undefined ? "A settlement waits beyond the road." : `${town.name} is awake and changing.`,
      action:
        kitPurchase !== null
          ? `${state.hero.name} buys a Disarming Kit from ${kitPurchase.smithName} in ${kitPurchase.townName}.`
        : tonicRestock !== null
          ? `${state.hero.name} exchanges ${tonicRestock.goldSpent} gold for ${tonicRestock.quantityBought} ${tonicRestock.itemName}${tonicRestock.quantityBought === 1 ? "" : "s"}.`
        : innRest !== null
          ? `${state.hero.name} pays ${innRest.goldSpent} gold for rest at ${innRest.innName} in ${innRest.townName}.`
        : town === undefined
          ? `${state.hero.name} looks for a safe gate.`
          : `${state.hero.name} walks ${town.districts.length} districts known for ${town.specialty}.`,
      consequence:
        kitPurchase !== null
          ? `Disarming Kit ×0→×1 · gold ${kitPurchase.goldBefore}→${kitPurchase.goldAfter} (−${kitPurchase.goldSpent}) · +2 to one disarm attempt; consumed on success or failure.`
        : tonicRestock !== null
          ? `${tonicRestock.itemName} ×${tonicRestock.quantityBefore}→×${tonicRestock.quantityAfter} (+${tonicRestock.quantityBought}) · gold ${tonicRestock.goldBefore}→${tonicRestock.goldAfter} · ${tonicRestock.unitPrice} gold each`
        : innRest !== null
          ? `HP ${innRest.healthBefore}→${innRest.healthAfter} · MP ${innRest.manaBefore}→${innRest.manaAfter} · gold ${innRest.goldBefore}→${innRest.goldAfter} (−${innRest.goldSpent}) · Fully rested · no XP or items gained`
        : town === undefined
          ? latestLog ?? "The town is being discovered"
          : `${town.residents.length} residents remember visit ${town.visits}`,
      sensoryIntensity: innRest !== null || kitPurchase !== null ? 0 : tonicRestock === null ? 1 : 2,
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
      headline: leadArrival
        ? `The marked lead rises at ${previousQuestLead.locationName}.`
        : `The road unfolds toward ${destination?.name ?? "the next landmark"}.`,
      action: leadArrival
        ? `${state.hero.name} reaches the quest marker by completing the real plotted route.`
        : `${state.hero.name} chooses to ${choice.action}; ${route?.distanceTravelled ?? 0} of ${route?.totalDistance ?? 0} miles are behind the party.`,
      consequence: latestLog ?? "Another stretch of the route is now known",
      sensoryIntensity: 1,
    },
    dungeon: {
      headline: dungeon === null
        ? "A sealed stair descends."
        : dungeonSearch !== null
          ? `${dungeon.name}: ${dungeonSearch.discoveries.length > 0 ? "a careful search marks danger" : "a cautious pause"}.`
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
          : dungeonSearch !== null
            ? `${state.hero.name} stays in this room and inspects the ${dungeonSearch.exits.map((exit) => exit.direction).join(" / ")} passages.`
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
      sensoryIntensity: trapTriggered ? 3 : dungeonSearch !== null || shrineUse !== null || trapDetected || trapDisarmed || keyFound || gateOpened || crossedGate ? 2 : 1,
    },
    battle: {
      headline:
        counterDuelBeat && counterDuel !== undefined
          ? latestCounterRound === undefined
            ? `Pattern Duel: ${counterDuel.opponentName} declares the three answers.`
            : latestCounterRound.patternBreak?.triggered === true
              ? `PATTERN BREAK · ${counterDuel.heroScore}–${counterDuel.opponentScore}`
              : `Pattern Duel · Round ${latestCounterRound.round} · ${counterDuel.heroScore}–${counterDuel.opponentScore}`
        : sceneWeaponUse !== null && sceneWeaponUse.receipt.levelAfter > sceneWeaponUse.receipt.levelBefore
          ? `${sceneWeaponUse.item.name} reaches Use Level ${sceneWeaponUse.receipt.levelAfter}.`
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
          : `${state.hero.name} predicted ${counterDuelStanceLabel(latestCounterRound.prediction)} and answered with ${counterDuelStanceLabel(latestCounterRound.heroStance)}; ${counterDuel.opponentName} revealed ${counterDuelStanceLabel(latestCounterRound.opponentStance)}.${latestCounterRound.patternBreak?.triggered === true ? " Two consecutive confirmed live tells fracture the pattern." : ""}`
        : latestCombatTurn?.text ?? `${state.hero.name} decides to ${choice.action}.`,
      consequence:
        counterDuelBeat && counterDuel !== undefined
          ? counterDuel.outcome === "ongoing"
            ? latestCounterRound === undefined
              ? `First to 2; after round 5 the leader wins and an equal score draws · victory +${counterDuel.stakes.victoryExperience} XP and +${counterDuel.stakes.victoryGold} gold · defeat −${counterDuel.stakes.defeatDamage} health · ${counterDuel.patternBreak === undefined ? "Pattern Break unavailable" : counterDuelPatternBreakText(counterDuel.patternBreak)}${counterDuelHabit === undefined ? "" : ` · ${counterDuelHabitText(counterDuelHabit)}`}`
              : `${latestCounterRound.result === "hero" ? state.hero.name : latestCounterRound.result === "opponent" ? counterDuel.opponentName : "Neither"} scored; ${counterDuel.patternBreak === undefined ? "Pattern Break unavailable" : counterDuelPatternBreakText(counterDuel.patternBreak)}; next tell: ${counterDuelTellText(counterDuel.tell)}${counterDuelHabit === undefined ? "" : `; ${counterDuelHabitText(counterDuelHabit)}`}`
            : latestLog ?? `The Pattern Duel ends in ${counterDuel.outcome}`
        : combat === undefined
          ? "The danger has not declared its intent"
          : combat.outcome === "ongoing"
            ? `Next: ${activeCombatant?.name ?? "unknown"}; ${combat.combatants.filter((unit) => unit.health > 0).length} remain standing`
            : sceneWeaponUse === null
              ? `The battle ends in ${combat.outcome}`
              : describeWeaponUseReceipt(sceneWeaponUse.item.name, sceneWeaponUse.receipt),
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
        : choice.command.type === "admit-successor-quest" && admittedFrom !== undefined
          ? `New Quest: ${depth.quest.title}`
        : choice.command.type === "recruit-companion" && activeCompanion !== undefined
        ? `${activeCompanion.identity.name} joins the road.`
        : choice.command.type === "farewell-companion" && departedCompanion !== undefined
          ? `${departedCompanion.identity.name}'s Shared Road Oath is complete.`
          : depth.quest.title,
      action: choice.command.type === "apply-quest-reward" && appliedReward !== undefined
        ? `${state.hero.name} receives the promised reward from the Chronicle.`
        : choice.command.type === "fulfill-quest" && fulfilledQuest !== undefined
        ? `${state.hero.name} closes the final page after ${fulfilledQuest.objectiveIds.length} completed objectives.`
        : choice.command.type === "admit-successor-quest" && admittedFrom !== undefined
          ? `${state.hero.name} turns the page after ${admittedFrom.title} and begins ${depth.quest.title}.`
        : choice.command.type === "recruit-companion" && activeCompanion !== undefined
        ? `${activeCompanion.identity.name}, ${activeCompanion.identity.role}, will travel from ${town?.name ?? activeCompanion.identity.originLocationId} to ${activeCompanion.destination.name}.`
        : choice.command.type === "farewell-companion" && departedCompanion !== undefined
          ? `${departedCompanion.identity.name} departs ${departedCompanion.departure.outcome === "injured" ? "wounded but alive" : "in good health"} after ${departedCompanion.victories} shared ${departedCompanion.victories === 1 ? "victory" : "victories"}.`
          : depth.quest.summary,
      consequence: choice.command.type === "apply-quest-reward" && appliedReward !== undefined
        ? describeQuestRewardReceipt(appliedReward.grant, appliedReward.receipt)
        : choice.command.type === "fulfill-quest" && fulfilledQuest !== undefined
        ? `Completion #${depth.totalCompletedQuests} recorded at T${fulfilledQuest.fulfilledTick} · ${describeCompletedQuestReward(fulfilledQuest)}`
        : choice.command.type === "admit-successor-quest" && admittedFrom !== undefined
          ? `Chapter ${depth.quest.ordinal + 1} admitted at T${depth.quest.admittedTick} · Lead revealed: ${questLead?.locationName ?? "unavailable"} · ${questLead === null ? "lead unavailable" : questLeadAdmissionStatus(questLead)}`
        : choice.command.type === "recruit-companion" || choice.command.type === "farewell-companion"
        ? latestLog ?? "The Shared Road Oath changes the party."
        : latestLog ?? "The Chronicle binds choices and consequences together",
      sensoryIntensity: choice.command.type === "fulfill-quest" || choice.command.type === "apply-quest-reward" ? 3 : choice.command.type === "admit-successor-quest" || choice.command.type === "recruit-companion" || choice.command.type === "farewell-companion" ? 2 : 0,
    },
  };

  const guardianCombat = guardian != null && combat?.id === guardian.combatId && opportunity.mode === "battle";
  if (guardianCombat) {
    const result = guardian.resolution;
    const battle = descriptions.battle;
    return { mode: "battle", location: depth.dungeon!.name, goal: "Resolve this lair, then continue the same maze", ...battle,
      headline: choice.command.type === "start-dungeon-guardian" ? `${guardian.guardian.name} holds the lair`
        : result?.tick === depth.tick ? result.outcome === "victory" ? "At last, a former lair" : "The guardian remains unbeaten"
        : battle.headline,
      action: choice.command.type === "start-dungeon-guardian"
        ? `${state.hero.name} faces ${guardian.guardian.name} in the actual entered room.` : battle.action,
      consequence: result?.tick === depth.tick
        ? `${battle.consequence}. ${result.outcome === "victory" ? "This lair is cleared; ordinary battle rewards settle once, with no extra room bonus." : "The lair is not cleared. No victory reward; later visits skirt this guardian without another challenge."}`
        : battle.consequence };
  }
  return {
    mode: opportunity.mode,
    location: opportunity.location,
    goal: releasedEncounterResolutionGoal ?? opportunity.goal,
    ...descriptions[opportunity.mode],
  };
}

export function rulesEngine(
  state: WorldState,
  opportunity: Opportunity,
  choice: ActorChoice,
): WorldState {
  if (!isValidDepthEncounterThreatState(state.depth)) {
    throw new TypeError("Campaign state violates schema invariants");
  }
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

  const legacyManifestationPlan = projectLegacyManifestation(state, choice.command);
  const legacyManifestation = legacyManifestationPlan === null
    ? null
    : resolveLegacyManifestation(state, legacyManifestationPlan, choice.commandId);
  const legacyMentorArcPlan = legacyManifestationPlan === null
    ? projectLegacyMentorArcBeat(state, choice.command)
    : null;
  const legacyMentorArcBeat = legacyMentorArcPlan === null
    ? null
    : resolveLegacyMentorArcBeat(state, legacyMentorArcPlan, choice.commandId);
  const tick = state.tick + 1;
  let depth = stepDepth(state.depth, choice.command, selected.id);
  const experienceGain = legacyManifestationPlan === null && legacyMentorArcPlan === null
    ? experienceGainForCommand(choice.command, state.depth, depth)
    : 0;
  const progression = applyHeroExperience(depth.hero, experienceGain);
  const experience = progression.experienceAfter;
  const level = progression.levelAfter;
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
  depth = {
    ...depth,
    hero: {
      ...progression.hero,
      gold,
      resources: { ...depth.hero.resources },
    },
  };
  const growth = applyHeroGrowth(depth.heroGrowth, depth.hero, {
    campaignId: state.campaignId,
    seed: state.seed,
    heroId: state.hero.id,
    heroName: state.hero.name,
    className: depth.hero.className,
    values: state.hero.values,
    tick,
    sourceCommandId: choice.commandId,
    sourceCommandType: choice.command.type,
    experienceBefore: state.hero.experience,
    experienceAfter: experience,
    levelBefore: state.hero.level,
    levelAfter: level,
    encounterActiveAfter: depth.combat !== null || depth.counterDuel !== null,
  });
  depth = { ...depth, hero: growth.hero, heroGrowth: growth.state };
  const health = depth.hero.resources.health;
  const reachedChampionLevel =
    state.championInduction === null &&
    state.hero.experience < championExperienceFloorV1 &&
    experience >= championExperienceFloorV1 &&
    state.hero.level < championLevelV1 &&
    level >= championLevelV1;
  const describedScene = describeBeat({ ...state, depth }, opportunity, choice, state.depth);
  let scene = level > state.hero.level && choice.command.type !== "apply-quest-reward"
    ? {
        ...describedScene,
        consequence: `${describedScene.consequence} · LEVEL ${state.hero.level} → ${level}`,
      }
    : describedScene;
  if (reachedChampionLevel) {
    scene = {
      ...scene,
      consequence: `${scene.consequence} · HALL OF CHAMPIONS · the Eternal adventure continues`,
    };
  }
  if (growth.appliedRecords.length > 0) {
    scene = {
      ...scene,
      consequence: `${scene.consequence} · ${growth.appliedRecords.map(describeHeroGrowthRecord).join(" · ")}`,
    };
  } else if (growth.queuedTriggers.length > 0) {
    scene = {
      ...scene,
      consequence: `${scene.consequence} · TURNING POINT ${growth.queuedTriggers.map((trigger) => trigger.checkpointLevel).join("/")} HELD UNTIL THE ENCOUNTER ENDS`,
    };
  }
  if (legacyManifestation !== null) {
    const belief = legacyManifestation.recognition.belief === "believes-champion-claim"
      ? "Champion claim believed"
      : "judgment withheld";
    scene = {
      mode: "chronicle",
      location: opportunity.location,
      headline: `Mortal Mentor: ${legacyManifestationPlan!.card.heroName}`,
      action: `Appearance · ${legacyManifestationPlan!.card.heroName} enters. Meeting · ${state.hero.name} watches owned ${legacyManifestation.lesson.abilityName} demonstrated.`,
      goal: opportunity.goal,
      consequence: `Recognition · introduced by name · Belief · ${belief} · Practice · owned L${legacyManifestation.lesson.abilityLevelAtLesson} art · NO POWER TRANSFERRED`,
      sensoryIntensity: 2,
    };
  }
  if (legacyMentorArcBeat !== null && legacyMentorArcPlan !== null) {
    const mentorName = legacyMentorArcPlan.card.heroName;
    if (legacyMentorArcBeat.phase === "promise") {
      scene = {
        mode: "chronicle",
        location: opportunity.location,
        headline: `A Road Promised: ${mentorName}`,
        action: `${state.hero.name} and the mortal mentor agree to meet after another quest is completed.`,
        goal: opportunity.goal,
        consequence: `Promise · completed quests ${legacyMentorArcBeat.promise.completedQuestBaseline} → ${legacyMentorArcBeat.promise.completedQuestBaseline + 1} required · NO REWARD · NO POWER TRANSFERRED`,
        sensoryIntensity: 2,
      };
    } else if (legacyMentorArcBeat.phase === "return") {
      scene = {
        mode: "chronicle",
        location: opportunity.location,
        headline: `Promise Kept: ${mentorName}`,
        action: `${mentorName} returns; ${state.hero.name} has carried the shared promise through another quest.`,
        goal: opportunity.goal,
        consequence: `Return · completed quests ${legacyMentorArcBeat.returned.completedQuestBaseline} → ${legacyMentorArcBeat.returned.completedQuestCount} · NO REWARD · NO POWER TRANSFERRED`,
        sensoryIntensity: 2,
      };
    } else {
      scene = {
        mode: "chronicle",
        location: opportunity.location,
        headline: `Roads Part: ${mentorName}`,
        action: `${state.hero.name} and ${mentorName} part as friends, each continuing a separate mortal road.`,
        goal: opportunity.goal,
        consequence: `Farewell · memory kept-road-promise · NO REWARD · NO POWER TRANSFERRED`,
        sensoryIntensity: 2,
      };
    }
  }
  const forwardMotion = updateForwardMotion(state, depth, opportunity, choice.command, tick);

  const entry: ChronicleEntry = {
    id: `${state.campaignId}:${tick}`,
    tick,
    attention: eventPolicyForMode(opportunity.mode, choice.command.type).attention,
    consideredActions: choice.consideredActions,
    chosenAction: choice.action,
    rationale: choice.rationale,
    commandId: choice.commandId,
    commandType: choice.command.type,
    consideredCommandIds: choice.consideredCommandIds,
    decisionTrace: choice.trace,
    policy: eventPolicyForMode(opportunity.mode, choice.command.type),
    ...scene,
  };

  let next: WorldState = {
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
    legacyManifestations: legacyManifestation?.manifestations ?? legacyMentorArcBeat?.manifestations ?? state.legacyManifestations,
  };
  if (reachedChampionLevel) {
    next = {
      ...next,
      championInduction: createChampionInduction(next, "earned", {
        id: choice.commandId,
        type: choice.command.type,
      }),
    };
  }
  return assertCanonicalRpgState(next);
}

function isValidLegacyManifestationsForWorld(state: WorldState): boolean {
  if (!isValidLegacyManifestationState(state.legacyManifestations, state.legacy)) return false;
  const visits = totalTownVisits(state);
  if (state.legacyManifestations.townVisitBaseline > visits) return false;
  const townLocationIds = new Set(
    state.depth.atlas.locations.filter((location) => location.kind === "town").map((location) => location.id),
  );
  if (!state.legacyManifestations.appearances.every((appearance, index) =>
    appearance.tick <= state.tick &&
    appearance.townVisitOrdinal <= visits &&
    townLocationIds.has(appearance.locationId) &&
    state.depth.towns[appearance.locationId] !== undefined &&
    appearance.sourceCommandId === `${state.campaignId}:town:${appearance.locationId}` &&
    appearance.scheduledTownVisit === scheduledLegacyTownVisit(
      state.seed,
      state.legacy,
      state.legacyManifestations,
      index,
    )
  )) return false;
  if (!state.legacyManifestations.meetings.every((meeting) => meeting.heroId === state.hero.id)) return false;
  if (!state.legacyManifestations.recognitions.every((recognition) => recognition.heroId === state.hero.id)) return false;
  if (!state.legacyManifestations.lessons.every((lesson) => {
    if (lesson.heroId !== state.hero.id) return false;
    const ability = state.depth.hero.abilities.find((candidate) => candidate.id === lesson.abilityId);
    return ability !== undefined &&
      ability.name === lesson.abilityName &&
      ability.level >= lesson.abilityLevelAtLesson;
  })) return false;
  const arc = state.legacyManifestations.mentorArc;
  if (arc === null) return true;
  const canonicalTownFact = (fact: {
    tick: number;
    locationId: string;
    sourceCommandId: string;
    townVisitOrdinal: number;
  }): boolean => fact.tick <= state.tick && fact.townVisitOrdinal <= visits &&
    townLocationIds.has(fact.locationId) && state.depth.towns[fact.locationId] !== undefined &&
    fact.sourceCommandId === `${state.campaignId}:town:${fact.locationId}`;
  try {
    const promise = arc.promiseFact;
    if (promise !== null && (
      !canonicalTownFact(promise) ||
      promise.scheduledTownVisit !== scheduledLegacyMentorPromiseTownVisit(state.seed, state.legacyManifestations) ||
      promise.completedQuestBaseline > state.depth.totalCompletedQuests
    )) return false;
    const returned = arc.returnFact;
    if (returned !== null && (
      !canonicalTownFact(returned) ||
      returned.scheduledTownVisit !== scheduledLegacyMentorReturnTownVisit(state.seed, state.legacyManifestations) ||
      returned.completedQuestCount > state.depth.totalCompletedQuests
    )) return false;
    const farewell = arc.farewellFact;
    if (farewell !== null && (
      !canonicalTownFact(farewell) ||
      farewell.scheduledTownVisit !== scheduledLegacyMentorFarewellTownVisit(state.seed, state.legacyManifestations)
    )) return false;
    const memory = arc.memoryFact;
    return memory === null || (
      memory.recordedTick <= state.tick &&
      townLocationIds.has(memory.locationId) &&
      state.depth.towns[memory.locationId] !== undefined
    );
  } catch {
    return false;
  }
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
    !isValidChampionForState(state.championInduction, state) ||
    !isValidLegacyManifestationsForWorld(state) ||
    !isValidDetailedHeroState(state.depth.hero) ||
    !isValidHeroGrowthState(state.depth.heroGrowth, state.depth.hero, {
      campaignId: state.campaignId,
      seed: state.seed,
      values: state.hero.values,
      tick: state.tick,
    }) ||
    !isValidQuestState(state.depth.quest) ||
    !isCanonicalQuestDefinition(state.depth.seed, state.depth.quest) ||
    !isValidQuestCompletionState(state.depth.quest, state.depth.completedQuests, state.depth.totalCompletedQuests, state.depth.tick) ||
    !isValidQuestRewardState(state.depth.seed, state.depth.hero, state.depth.quest, state.depth.completedQuests, state.depth.pendingQuestReward, state.depth.tick) ||
    !isValidSecretDiscoveryGraph(state.depth) ||
    !isValidCampaignRepartee(state.depth) || !isValidCampaignReparteeCallback(state.depth) || !isValidCampaignBorrowedBell(state.depth) || !isValidBellDeliveryMemory(state.depth)
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
    const policy = eventPolicyForMode(opportunity.mode, choice.command.type);
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
  "schemaVersion" | "lifecycle" | "forwardMotion" | "pendingAttention" | "chronicle" | "championInduction" | "legacy" | "legacyManifestations" | "depth"
> & {
  schemaVersion: 1 | 2;
  lifecycle?: PreviousLifecycleState;
  pendingAttention?: WorldState["pendingAttention"];
  chronicle: readonly LegacyChronicleEntry[];
};

type PreviousWorldStateV8 = Omit<WorldState, "schemaVersion" | "legacyManifestations"> & {
  schemaVersion: 8;
  legacyManifestations: unknown;
};

type PreviousWorldStateV7 = Omit<WorldState, "schemaVersion" | "legacyManifestations"> & {
  schemaVersion: 7;
};

type PreviousWorldStateV6 = Omit<PreviousWorldStateV7, "schemaVersion" | "legacy"> & {
  schemaVersion: 6;
};

type PreviousWorldStateV5 = Omit<PreviousWorldStateV6, "schemaVersion" | "championInduction"> & {
  schemaVersion: 5;
};

type PreviousWorldStateV4 = Omit<PreviousWorldStateV5, "schemaVersion" | "lifecycle" | "forwardMotion"> & {
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

function withAdoptedChampion(state: WorldState): WorldState {
  return state.hero.experience >= championExperienceFloorV1
    ? { ...state, championInduction: createChampionInduction(state, "adopted", null) }
    : state;
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
  const contexts = ["road", "ordinaryCombat", "direCombat", "millerCombat", "sharedOpeningCombat", "repartee"];
  const forwardMotionReasons = ["explore-unseen", "avoid-immediate-reverse", "only-open-road", "least-recent", "companion-oath", "companion-return"];
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
      recordedDepthCommandTypes.includes(entry.commandType as RecordedDepthCommandType) &&
      Array.isArray(entry.consideredCommandIds) &&
      entry.consideredCommandIds.length >= 1 &&
      entry.consideredCommandIds.length <= 4 &&
      entry.consideredCommandIds.includes(entry.commandId)
    );
  });
  const validPendingAttention = state.pendingAttention.every((entry) => {
    const hasCommandMetadata = entry.commandId !== undefined || entry.commandType !== undefined;
    if (!hasCommandMetadata) return true;
    return typeof entry.commandId === "string" && entry.commandId.length > 0 && recordedDepthCommandTypes.includes(entry.commandType as RecordedDepthCommandType);
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
  const validCombats = isValidDepthEncounterThreatState(state.depth);
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
  const validActiveCompanionCombat = isValidCompanionStateGraph(state.depth);
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
  const validQuestLead = (() => {
    try {
      const lead = projectSuccessorQuestLead(state.seed, state.depth.atlas, state.depth.quest);
      return state.depth.quest.ordinal === 0 ? lead === null : lead !== null;
    } catch {
      return false;
    }
  })();
  if (
    state.schemaVersion !== 9 ||
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
    state.hero.level > maximumHeroLevel ||
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
    !isValidChampionForState(state.championInduction, state) ||
    !isValidCampaignLegacyState(state.legacy, state.seed) ||
    !isValidLegacyManifestationsForWorld(state) ||
    !isRecord(state.depth) ||
    state.depth.schemaVersion !== 36 ||
    !isValidCampaignSmithyJob(state.depth) || !isValidCampaignInnBluff(state.depth) || !isValidCampaignDungeonLair(state.depth) || !isValidCampaignRoadSupper(state.depth) || !isValidCampaignElsewhereLoaf(state.depth) ||
    !isValidCampaignPennywiseGate(state.depth) ||
    (state.depth.dungeon !== null && !isValidDungeonSecretPassage(state.depth.dungeon, state.tick)) ||
    !isValidCampaignRepartee(state.depth) || !isValidCampaignReparteeCallback(state.depth) || !isValidCampaignBorrowedBell(state.depth) || !isValidBellDeliveryMemory(state.depth) || !isValidCampaignUsefulReply(state.depth) || !isValidCampaignRoomChallenge(state.depth) || !isValidCampaignBetterQuestion(state.depth) || !isValidCampaignCompanionReunion(state.depth) || !isValidCampaignDungeonFieldMedicine(state.depth) || !isValidCampaignCompanionCredit(state.depth) ||
    state.depth.companions.explicitKitAfterTick > state.tick ||
    state.depth.seed !== state.seed ||
    state.depth.tick !== state.tick ||
    !isRecord(state.depth.hero) ||
    state.depth.hero.id !== state.hero.id ||
    state.depth.hero.name !== state.hero.name ||
    state.depth.hero.level !== state.hero.level ||
    state.depth.hero.experience !== state.hero.experience ||
    state.depth.hero.gold !== state.hero.gold ||
    !isValidDetailedHeroState(state.depth.hero) ||
    !isValidHeroGrowthState(state.depth.heroGrowth, state.depth.hero, {
      campaignId: state.campaignId,
      seed: state.seed,
      values: state.hero.values,
      tick: state.tick,
    }) ||
    !isValidQuestState(state.depth.quest) ||
    !isCanonicalQuestDefinition(state.depth.seed, state.depth.quest) ||
    !validQuestLead ||
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
    !isValidSecretDiscoveryGraph(state.depth) ||
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

  const candidate = value as WorldState | PreviousWorldState | PreviousWorldStateV3 | PreviousWorldStateV4 | PreviousWorldStateV5 | PreviousWorldStateV6 | PreviousWorldStateV7 | PreviousWorldStateV8;
  if (candidate.schemaVersion === 9) {
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    return assertWorldState({ ...candidate, depth });
  }
  if (candidate.schemaVersion === 8) {
    return assertWorldState({
      ...candidate,
      schemaVersion: 9,
      legacyManifestations: upgradeLegacyManifestationState(candidate.legacyManifestations, candidate.legacy),
    });
  }
  if (candidate.schemaVersion === 7) {
    return assertWorldState({
      ...candidate,
      schemaVersion: 9,
      legacyManifestations: createLegacyManifestationState(totalTownVisits(candidate)),
    });
  }
  if (candidate.schemaVersion === 6) {
    return assertWorldState({
      ...candidate,
      schemaVersion: 9,
      legacy: createCampaignLegacyState(candidate.seed),
      legacyManifestations: createLegacyManifestationState(totalTownVisits(candidate)),
    });
  }
  if (candidate.schemaVersion === 5) {
    const depthVersion = (candidate.depth as unknown as Record<string, unknown>).schemaVersion;
    const releasedDepth = typeof depthVersion !== "number" || depthVersion < 13;
    if (releasedDepth && candidate.hero.level !== legacyHeroLevelForExperience(candidate.hero.experience)) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    const hero = releasedDepth ? { ...candidate.hero, level: depth.hero.level } : candidate.hero;
    return assertWorldState(withAdoptedChampion({
      ...candidate,
      schemaVersion: 9,
      hero,
      championInduction: null,
      legacy: createCampaignLegacyState(candidate.seed),
      legacyManifestations: createLegacyManifestationState(totalTownVisits({ depth })),
      depth,
    }));
  }
  if (candidate.schemaVersion === 4 || candidate.schemaVersion === 3) {
    if (candidate.hero.level !== legacyHeroLevelForExperience(candidate.hero.experience)) {
      throw new TypeError("Campaign state violates schema invariants");
    }
    const depth = upgradeDepthState(candidate.depth, candidate.seed, candidate.hero.id, candidate.hero.name);
    return assertWorldState(withAdoptedChampion({
      ...candidate,
      schemaVersion: 9,
      hero: { ...candidate.hero, level: depth.hero.level },
      lifecycle: { ...candidate.lifecycle, policyVersion: 2 },
      forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, candidate.tick),
      championInduction: null,
      legacy: createCampaignLegacyState(candidate.seed),
      legacyManifestations: createLegacyManifestationState(totalTownVisits({ depth })),
      depth,
    }));
  }
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) {
    throw new RangeError("Unsupported campaign schema version");
  }
  if (candidate.hero.level !== legacyHeroLevelForExperience(candidate.hero.experience)) {
    throw new TypeError("Campaign state violates schema invariants");
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
      level: heroLevelForExperience(candidate.hero.experience),
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
  return assertWorldState(withAdoptedChampion({
    ...candidate,
    schemaVersion: 9,
    hero: {
      ...candidate.hero,
      level: depth.hero.level,
      health: migratedHealth,
      maxHealth: depth.hero.resources.maxHealth,
    },
    chronicle: candidate.chronicle.map((entry) => ({
      ...entry,
      policy: entry.policy ?? eventPolicyForMode(entry.mode, entry.commandType),
    })),
    lifecycle,
    forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, candidate.tick),
    pendingAttention: candidate.pendingAttention ?? [],
    championInduction: null,
    legacy: createCampaignLegacyState(candidate.seed),
    legacyManifestations: createLegacyManifestationState(totalTownVisits({ depth })),
    depth,
  }));
}
