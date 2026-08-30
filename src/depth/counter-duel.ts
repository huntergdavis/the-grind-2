import { randomInt } from "../core/rng";
import { canonicalStringify } from "../core/canonical";
import { monsterDefinitions } from "./combat";
import type {
  CounterDuelOutcome,
  CounterDuelPolicyView,
  CounterDuelRound,
  CounterDuelRoundResult,
  CounterDuelStance,
  CounterDuelState,
  CounterDuelTell,
} from "./types";

export const counterDuelStances: readonly CounterDuelStance[] = ["rush", "ward", "feint"];
export const counterDuelTargetScore = 2;
export const maximumCounterDuelRounds = 5;

const preferredStanceBySpecies: Readonly<Record<string, CounterDuelStance>> = {
  "lantern-wolf": "feint",
  "mossback-brute": "ward",
  "river-wyrmling": "feint",
  "inkcap-mimic": "feint",
  copperhorn: "rush",
};

const cueByStance: Readonly<Record<CounterDuelStance, CounterDuelTell["cue"]>> = {
  rush: "forward-weight",
  ward: "closed-center",
  feint: "open-flank",
};

export function counterDuelStanceLabel(stance: CounterDuelStance): string {
  return stance === "rush" ? "Rush" : stance === "ward" ? "Ward" : "Feint";
}

export function counterDuelTellText(tell: CounterDuelTell): string {
  const cue = tell.cue === "forward-weight"
    ? "Weight rolls forward"
    : tell.cue === "closed-center"
      ? "Center closes tight"
      : "A tempting flank opens";
  const clarity = tell.clarity === 3 ? "bold" : tell.clarity === 2 ? "readable" : "faint";
  return `${cue} · ${clarity} sign of ${counterDuelStanceLabel(tell.suggestedStance)}`;
}

/** Returns the stance that defeats the predicted opponent stance. */
export function counterToStance(prediction: CounterDuelStance): CounterDuelStance {
  if (prediction === "rush") return "ward";
  if (prediction === "ward") return "feint";
  return "rush";
}

export function resolveCounterDuelMatchup(
  heroStance: CounterDuelStance,
  opponentStance: CounterDuelStance,
): CounterDuelRoundResult {
  if (heroStance === opponentStance) return "tie";
  return counterToStance(opponentStance) === heroStance ? "hero" : "opponent";
}

function opponentStanceForRound(
  duel: Pick<CounterDuelState, "id" | "opponentSpeciesId" | "round" | "history">,
  seed: string,
): CounterDuelStance {
  const recent = duel.history.slice(-2).map((entry) => entry.opponentStance);
  const blocked = recent.length === 2 && recent[0] === recent[1] ? recent[0] : undefined;
  const preferred = preferredStanceBySpecies[duel.opponentSpeciesId] ?? "rush";
  const weighted = [preferred, ...counterDuelStances].filter((stance) => stance !== blocked);
  const stance = weighted[randomInt(
    weighted.length,
    seed,
    "counter-duel",
    duel.id,
    duel.round,
    "opponent-stance",
  )];
  if (stance === undefined) throw new Error("Counter duel found no legal opponent stance");
  return stance;
}

function tellForRound(
  duel: Pick<CounterDuelState, "id" | "opponentSpeciesId" | "round" | "history">,
  seed: string,
): CounterDuelTell {
  const actual = opponentStanceForRound(duel, seed);
  const honest = randomInt(100, seed, "counter-duel", duel.id, duel.round, "tell-truth") < 64;
  const alternatives = counterDuelStances.filter((stance) => stance !== actual);
  const suggestedStance = honest
    ? actual
    : alternatives[randomInt(alternatives.length, seed, "counter-duel", duel.id, duel.round, "false-tell")];
  if (suggestedStance === undefined) throw new Error("Counter duel found no tell stance");
  const clarity = (1 + randomInt(3, seed, "counter-duel", duel.id, duel.round, "tell-clarity")) as 1 | 2 | 3;
  return {
    id: `${duel.id}:round:${duel.round}:tell`,
    cue: cueByStance[suggestedStance],
    suggestedStance,
    clarity,
  };
}

export function createCounterDuel(
  seed: string,
  encounterId: string,
  heroId: string,
  heroMaxHealth: number,
): CounterDuelState {
  const definition = monsterDefinitions[randomInt(
    monsterDefinitions.length,
    seed,
    "counter-duel",
    encounterId,
    0,
    "opponent-species",
  )];
  if (definition === undefined) throw new Error("Counter duel opponent definition is missing");
  const heroMaxHealthAtStart = Math.max(1, Math.floor(heroMaxHealth));
  const base = {
    schemaVersion: 1 as const,
    id: encounterId,
    heroId,
    opponentId: `${encounterId}:opponent`,
    opponentName: definition.name,
    opponentSpeciesId: definition.id,
    round: 1,
    heroScore: 0,
    opponentScore: 0,
    history: [] as readonly CounterDuelRound[],
    outcome: "ongoing" as const,
    stakes: {
      victoryExperience: 8 as const,
      victoryGold: 5 as const,
      heroMaxHealthAtStart,
      defeatDamage: Math.max(1, Math.ceil(heroMaxHealthAtStart / 10)),
    },
  };
  return { ...base, tell: tellForRound(base, seed) };
}

function terminalOutcome(
  heroScore: number,
  opponentScore: number,
  resolvedRound: number,
): CounterDuelOutcome {
  if (heroScore >= counterDuelTargetScore) return "victory";
  if (opponentScore >= counterDuelTargetScore) return "defeat";
  if (resolvedRound < maximumCounterDuelRounds) return "ongoing";
  if (heroScore > opponentScore) return "victory";
  if (opponentScore > heroScore) return "defeat";
  return "draw";
}

export function resolveCounterDuelRound(
  duel: CounterDuelState,
  prediction: CounterDuelStance,
  seed: string,
): CounterDuelState {
  if (duel.outcome !== "ongoing") throw new Error("Counter duel is already complete");
  if (!counterDuelStances.includes(prediction)) throw new Error("Counter duel prediction is invalid");
  const opponentStance = opponentStanceForRound(duel, seed);
  const heroStance = counterToStance(prediction);
  const result = resolveCounterDuelMatchup(heroStance, opponentStance);
  const heroScore = duel.heroScore + (result === "hero" ? 1 : 0);
  const opponentScore = duel.opponentScore + (result === "opponent" ? 1 : 0);
  const record: CounterDuelRound = {
    round: duel.round,
    tell: duel.tell,
    prediction,
    heroStance,
    opponentStance,
    result,
    heroScore,
    opponentScore,
  };
  const history = [...duel.history, record];
  const outcome = terminalOutcome(heroScore, opponentScore, duel.round);
  if (outcome !== "ongoing") return { ...duel, heroScore, opponentScore, history, outcome };
  const next = { ...duel, round: duel.round + 1, heroScore, opponentScore, history };
  return { ...next, tell: tellForRound(next, seed) };
}

export function projectCounterDuelPolicyView(duel: CounterDuelState): CounterDuelPolicyView {
  return {
    id: duel.id,
    opponentName: duel.opponentName,
    round: duel.round,
    heroScore: duel.heroScore,
    opponentScore: duel.opponentScore,
    tell: { ...duel.tell },
    revealedRounds: duel.history.slice(-2).map((round) => ({ ...round, tell: { ...round.tell } })),
  };
}

export function scoreCounterDuelPrediction(
  view: CounterDuelPolicyView,
  prediction: CounterDuelStance,
): { score: number; reason: string } {
  let score = prediction === view.tell.suggestedStance ? 60 + view.tell.clarity * 8 : 18;
  let reason = prediction === view.tell.suggestedStance
    ? `the ${view.tell.clarity === 3 ? "bold" : view.tell.clarity === 2 ? "readable" : "faint"} tell suggests ${counterDuelStanceLabel(prediction)}`
    : `${counterDuelStanceLabel(prediction)} remains a legal read if the tell is false`;
  const last = view.revealedRounds.at(-1);
  const previous = view.revealedRounds.at(-2);
  if (last?.opponentStance === prediction) {
    score = previous?.opponentStance === prediction ? 0 : score + 7;
    reason = previous?.opponentStance === prediction
      ? `${counterDuelStanceLabel(prediction)} cannot appear a third consecutive time`
      : `the rival used ${counterDuelStanceLabel(prediction)} last round and may repeat once`;
  }
  return { score, reason };
}

export function isValidCounterDuel(value: unknown, seed: string): value is CounterDuelState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as CounterDuelState;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.id !== "string" || candidate.id.length === 0 ||
    typeof candidate.heroId !== "string" || candidate.heroId.length === 0 ||
    !Number.isSafeInteger(candidate.stakes?.heroMaxHealthAtStart) || candidate.stakes.heroMaxHealthAtStart < 1 ||
    candidate.stakes.victoryExperience !== 8 ||
    candidate.stakes.victoryGold !== 5 ||
    candidate.stakes.defeatDamage !== Math.max(1, Math.ceil(candidate.stakes.heroMaxHealthAtStart / 10)) ||
    !Array.isArray(candidate.history) ||
    candidate.history.length > maximumCounterDuelRounds
  ) return false;
  try {
    let replay = createCounterDuel(
      seed,
      candidate.id,
      candidate.heroId,
      candidate.stakes.heroMaxHealthAtStart,
    );
    for (const record of candidate.history) {
      if (replay.outcome !== "ongoing") return false;
      replay = resolveCounterDuelRound(replay, record.prediction, seed);
    }
    return canonicalStringify(replay) === canonicalStringify(candidate);
  } catch {
    return false;
  }
}
