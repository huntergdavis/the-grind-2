import { randomInt } from "../core/rng";
import { isValidReparteeProgress, type ReparteeOutcome, type ReparteeProgress, type ReparteeRoundReceipt } from "./repartee";

export const reparteeWitnessRulesVersion = "repartee-witness-v1" as const;
export type ReparteeWitnessPreferenceId = "precision" | "humility" | "playfulness";
export type ReparteeWitnessPose = "nod" | "frown" | "laugh" | "quiet";

export const reparteeWitnessPreferences = Object.freeze([
  Object.freeze({ id: "precision" as const, label: "A sound answer", description: "Respects a counter that answers the actual claim, even when the contest is lost." }),
  Object.freeze({ id: "humility" as const, label: "Honest humility", description: "Respects an honest admission; dislikes the shouted leadership boast, even when it wins applause." }),
  Object.freeze({ id: "playfulness" as const, label: "A taste for absurdity", description: "Enjoys the deliberate culinary nonsense, even when the judges mark it wrong." }),
]);

export function reparteeWitnessPreference(id: ReparteeWitnessPreferenceId): typeof reparteeWitnessPreferences[number] {
  return reparteeWitnessPreferences.find((entry) => entry.id === id)!;
}

export interface ReparteeWitnessPreference {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof reparteeWitnessRulesVersion;
  readonly witnessId: string;
  readonly joinedTick: number;
  readonly sourceCommandId: string;
  readonly declaredTick: number;
  readonly preferenceId: ReparteeWitnessPreferenceId;
}

/** The campaign supplies actual presence at resolution, never the later display roster. */
export interface ReparteeWitnessPresence {
  readonly witnessId: string;
  readonly witnessName: string;
  readonly joinedTick: number;
  readonly locationId: string;
  readonly tick: number;
}

export interface ReparteeWitnessReaction {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof reparteeWitnessRulesVersion;
  readonly encounterId: string;
  readonly heroId: string;
  readonly residentId: string;
  readonly witnessId: string;
  readonly witnessName: string;
  readonly joinedTick: number;
  readonly locationId: string;
  readonly buildingId: string;
  readonly completionCommandId: string;
  readonly completedTick: number;
  readonly preferenceSourceCommandId: string;
  readonly preferenceId: ReparteeWitnessPreferenceId;
  readonly outcome: ReparteeOutcome;
  readonly evidence: ReparteeRoundReceipt | null;
  readonly reactionId: string;
  readonly pose: ReparteeWitnessPose;
  readonly line: string;
  readonly explanation: string;
  /** No earlier opinion is asserted. Regard runs from this witness to this hero. */
  readonly regardBefore: null;
  readonly regardAfter: -1 | 0 | 1;
  readonly regardDelta: -1 | 0 | 1;
}

/** One finite encore, not a universal relationship history or a repeatable reward. */
export interface ReparteeWitnessState {
  readonly schemaVersion: 1;
  readonly firstContest: ReparteeProgress | null;
  readonly preference: ReparteeWitnessPreference | null;
  readonly reaction: ReparteeWitnessReaction | null;
}

export function createReparteeWitnessState(): ReparteeWitnessState {
  return { schemaVersion: 1, firstContest: null, preference: null, reaction: null };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function text(value: unknown, limit = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit && value.trim() === value && !/[\u0000-\u001f]/u.test(value);
}

function tick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isValidReparteeWitnessPreference(value: unknown): value is ReparteeWitnessPreference {
  return exactKeys(value, ["schemaVersion", "rulesVersion", "witnessId", "joinedTick", "sourceCommandId", "declaredTick", "preferenceId"])
    && value.schemaVersion === 1 && value.rulesVersion === reparteeWitnessRulesVersion
    && text(value.witnessId) && text(value.sourceCommandId) && tick(value.joinedTick)
    && tick(value.declaredTick) && value.declaredTick > value.joinedTick
    && reparteeWitnessPreferences.some((entry) => entry.id === value.preferenceId);
}

/** Explicitly declared now; role, disposition, portraits and hero values are not inputs. */
export function declareReparteeWitnessPreference(seed: string, context: {
  witnessId: string; joinedTick: number; sourceCommandId: string; tick: number;
}): ReparteeWitnessPreference {
  const preferenceId = reparteeWitnessPreferences[randomInt(3, seed, "repartee-witness", context.witnessId, 0, "judging-preference-v1")]!.id;
  const preference: ReparteeWitnessPreference = {
    schemaVersion: 1, rulesVersion: reparteeWitnessRulesVersion,
    witnessId: context.witnessId, joinedTick: context.joinedTick,
    sourceCommandId: context.sourceCommandId, declaredTick: context.tick, preferenceId,
  };
  if (!text(seed) || !isValidReparteeWitnessPreference(preference)) throw new TypeError("Invalid witness preference declaration");
  return preference;
}

interface Judgment {
  evidence: ReparteeRoundReceipt | null;
  reactionId: string;
  pose: ReparteeWitnessPose;
  line: string;
  explanation: string;
  delta: -1 | 0 | 1;
}

function judgment(progress: ReparteeProgress, preference: ReparteeWitnessPreference): Judgment {
  const duel = progress.completed!;
  const rounds = duel.rounds;
  const direct = rounds.find((round) => round.classification === "direct");
  const culinary = rounds.find((round) => round.responseId === `${round.challengeId}:category`);
  const boast = rounds.find((round) => round.responseId === "loud-authority:personality");
  if (preference.preferenceId === "precision") {
    if (direct !== undefined) {
      const lines: Record<ReparteeOutcome, string> = {
        victory: "That answer held together. The applause is incidental.",
        defeat: "You lost the contest, not the point of that answer.",
        draw: "Even in a draw, that answer was sound.",
        retreat: "You left the contest, but that answer was sound.",
      };
      return { evidence: direct, reactionId: "precision-counter", pose: "nod", delta: 1,
        line: lines[duel.outcome], explanation: "The declared preference values this committed direct counter, independently of the contest result." };
    }
    const evasion = rounds.find((round) => round.classification === "category");
    if (evasion !== undefined) return {
      evidence: evasion, reactionId: "precision-evasion", pose: "frown", delta: -1,
      line: "You had an answer ready. I wish it had been an answer to the question.",
      explanation: "No direct counter was given; this committed category mistake leaves the actual claim unanswered.",
    };
  }
  if (preference.preferenceId === "humility") {
    if (boast !== undefined) return {
      evidence: boast, reactionId: "hollow-boast", pose: "frown", delta: -1,
      line: duel.outcome === "victory" ? "You won, but shouting about leadership did not make you a leader." : "Shouting about leadership still sounded like shouting.",
      explanation: "This witness explicitly dislikes the committed shouted leadership boast; a win does not erase that choice.",
    };
    const honest = rounds.find((round) => ["borrowed-thought:personality", "cautious-courage:near", "cautious-courage:personality"].includes(round.responseId));
    if (honest !== undefined) {
      const lines: Record<string, string> = {
        "borrowed-thought:personality": "Admitting what you are still learning takes more backbone than pretending to know everything.",
        "cautious-courage:near": "You admitted being frightened. I respect that more than borrowed swagger.",
        "cautious-courage:personality": "You would not trade good sense for applause. I respect that.",
      };
      return { evidence: honest, reactionId: "honest-admission", pose: "nod", delta: 1,
        line: lines[honest.responseId]!, explanation: "The committed reply admits a limitation or refuses a foolish dare, matching this witness's declared preference for humility." };
    }
  }
  if (preference.preferenceId === "playfulness" && culinary !== undefined) return {
    evidence: culinary, reactionId: "culinary-absurdity", pose: "laugh", delta: 1,
    line: duel.outcome === "defeat" ? "The judges gave you nothing for that. I am still trying not to laugh." : "That food argument was gloriously useless. I shall be smiling about it all afternoon.",
    explanation: "This witness enjoys the committed culinary category mistake. Amusement changes regard, not the round's losing score.",
  };
  return {
    evidence: rounds.at(-1) ?? null, reactionId: "unmoved", pose: "quiet", delta: 0,
    line: rounds.length === 0 ? "A short appearance. I will wait for an answer before judging it." : "I heard you. I am still making up my mind.",
    explanation: "No committed reply triggers this witness's declared preference; this event records no change in regard.",
  };
}

/** Creation is valid only on the completion tick. The finite campaign state owns once-only admission. */
export function createReparteeWitnessReaction(
  progress: ReparteeProgress,
  preference: ReparteeWitnessPreference,
  presence: ReparteeWitnessPresence | null,
): ReparteeWitnessReaction | null {
  if (!isValidReparteeProgress(progress) || !isValidReparteeWitnessPreference(preference) || presence === null) return null;
  const duel = progress.completed;
  if (duel === null || presence.witnessId !== preference.witnessId || presence.joinedTick !== preference.joinedTick
    || !text(presence.witnessName, 128) || presence.locationId !== duel.locationId || presence.tick !== duel.completedTick
    || presence.witnessId === duel.actorId || presence.witnessId === duel.residentId
    || preference.declaredTick !== duel.startedTick || preference.sourceCommandId !== duel.sourceCommandId) return null;
  const reaction = judgment(progress, preference);
  return {
    schemaVersion: 1, rulesVersion: reparteeWitnessRulesVersion,
    encounterId: duel.encounterId, heroId: duel.actorId, residentId: duel.residentId,
    witnessId: presence.witnessId, witnessName: presence.witnessName, joinedTick: presence.joinedTick,
    locationId: duel.locationId, buildingId: duel.buildingId,
    completionCommandId: duel.completionCommandId, completedTick: duel.completedTick,
    preferenceSourceCommandId: preference.sourceCommandId, preferenceId: preference.preferenceId,
    outcome: duel.outcome, evidence: reaction.evidence === null ? null : { ...reaction.evidence, entryIds: [...reaction.evidence.entryIds] },
    reactionId: reaction.reactionId, pose: reaction.pose, line: reaction.line, explanation: reaction.explanation,
    regardBefore: null, regardAfter: reaction.delta, regardDelta: reaction.delta,
  };
}

function exactValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((entry, index) => Object.hasOwn(actual, index) && exactValue(actual[index], entry));
  if (record(expected)) return exactKeys(actual, Object.keys(expected))
    && Object.entries(expected).every(([key, entry]) => exactValue(actual[key], entry));
  return actual === expected;
}

/** Campaign validation additionally proves the declaration source, active presence and retained identity. */
export function isValidReparteeWitnessReaction(
  value: unknown, progress: ReparteeProgress, preference: ReparteeWitnessPreference,
): value is ReparteeWitnessReaction {
  if (!record(value) || !text(value.witnessId) || !text(value.witnessName, 128)
    || !tick(value.joinedTick) || !text(value.locationId) || !tick(value.completedTick)) return false;
  const expected = createReparteeWitnessReaction(progress, preference, {
    witnessId: value.witnessId, witnessName: value.witnessName, joinedTick: value.joinedTick,
    locationId: value.locationId, tick: value.completedTick,
  });
  return expected !== null && exactValue(value, expected);
}
