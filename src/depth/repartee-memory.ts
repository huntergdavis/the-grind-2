import { isValidCampaignRepartee } from "./repartee-campaign";
import type { ReparteeWitnessPose, ReparteeWitnessReaction } from "./repartee-witness";
import type { ActiveCompanion, DepthState, FormerCompanion } from "./types";

export const reparteeCallbackRulesVersion = "repartee-callback-v1" as const;

/** One later shared rest, retaining the actual words rather than inventing a new judgment. */
export interface ReparteeCallback {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof reparteeCallbackRulesVersion;
  readonly encounterId: string;
  readonly heroId: string;
  readonly witnessId: string;
  readonly witnessName: string;
  readonly joinedTick: number;
  readonly sourceReactionCommandId: string;
  readonly sourceReactionTick: number;
  readonly sourceReactionId: string;
  readonly evidenceSourceCommandId: string;
  readonly evidenceRoundIndex: number;
  readonly rememberedReply: string;
  readonly restLocationId: string;
  readonly sourceCommandId: string;
  readonly tick: number;
  readonly pose: ReparteeWitnessPose;
  readonly line: string;
}

export function reparteeCallbackCommandId(tick: number, encounterId: string, witnessId: string): string {
  return `depth:${tick}:repartee:${encounterId}:recall:${witnessId}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeTick(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function retainedSource(state: DepthState): {
  reaction: ReparteeWitnessReaction;
  witness: ActiveCompanion | FormerCompanion;
} | null {
  if (!isValidCampaignRepartee(state)) return null;
  const reaction = state.reparteeWitness.reaction;
  if (reaction === null || reaction.evidence === null) return null;
  const witness = [...state.companions.active, ...state.companions.former].find((entry) =>
    entry.identity.residentId === reaction.witnessId && entry.joinedTick === reaction.joinedTick);
  if (witness === undefined || witness.destination.locationId === reaction.locationId
    || !state.atlas.discoveredLocationIds.includes(witness.destination.locationId)
    || state.atlas.locations.find((entry) => entry.id === witness.destination.locationId)?.kind !== "town") return null;
  return { reaction, witness };
}

/** A genuine pause at the reached destination, not a paid inn or an invented building. */
function presentAtSharedRest(state: DepthState, witness: ActiveCompanion | FormerCompanion): witness is ActiveCompanion {
  return witness.phase === "arrived" && state.companions.active[0] === witness
    && witness.injury === "none" && witness.resources.health > 0 && state.hero.resources.health > 0
    && state.atlas.currentLocationId === witness.destination.locationId && state.atlas.route === null
    && state.combat === null && state.counterDuel === null && state.repartee.active === null
    && (state.dungeon === null || state.dungeon.completed)
    && state.pendingQuestReward === null && state.quest.status === "active";
}

function callbackLine(reaction: ReparteeWitnessReaction): string {
  const reply = reaction.evidence!.reply;
  // An exact first sentence of the committed answer anchors each short scene line.
  // No summarizer, model, fresh roll or reconstructed quote is involved.
  const quote = reply.match(/^[\s\S]*?[.!?](?=\s|$)/u)?.[0] ?? reply;
  const observations: Record<string, string> = {
    "precision-counter": "I kept turning that answer over on the road. It still holds.",
    "precision-evasion": "That answer followed us all this way. The question never did get one.",
    "hollow-boast": "I remember the volume. I still wanted a reason to follow.",
    "honest-admission": "I kept thinking about that admission. I am glad you did not dress it up.",
    "culinary-absurdity": "All that road, and that is still the bit that makes me laugh.",
    unmoved: "I remember it clearly. I am still not sure what to make of it.",
  };
  return `“${quote}” ${observations[reaction.reactionId]!}`;
}

function makeCallback(reaction: ReparteeWitnessReaction, witness: ActiveCompanion | FormerCompanion, tick: number): ReparteeCallback {
  const evidence = reaction.evidence!;
  return {
    schemaVersion: 1, rulesVersion: reparteeCallbackRulesVersion,
    encounterId: reaction.encounterId, heroId: reaction.heroId,
    witnessId: reaction.witnessId, witnessName: reaction.witnessName, joinedTick: reaction.joinedTick,
    sourceReactionCommandId: reaction.completionCommandId, sourceReactionTick: reaction.completedTick,
    sourceReactionId: reaction.reactionId, evidenceSourceCommandId: evidence.sourceCommandId,
    evidenceRoundIndex: evidence.roundIndex, rememberedReply: evidence.reply,
    restLocationId: witness.destination.locationId,
    sourceCommandId: reparteeCallbackCommandId(tick, reaction.encounterId, reaction.witnessId), tick,
    pose: reaction.pose, line: callbackLine(reaction),
  };
}

/** One next-tick foreground opportunity. The caller commits this receipt, then the oath can close. */
export function selectReparteeCallback(state: DepthState): ReparteeCallback | null {
  try {
    if (state.reparteeCallback !== null || !safeTick(state.tick) || state.tick >= Number.MAX_SAFE_INTEGER) return null;
    const source = retainedSource(state);
    if (source === null || !presentAtSharedRest(state, source.witness) || state.tick <= source.reaction.completedTick) return null;
    return makeCallback(source.reaction, source.witness, state.tick + 1);
  } catch { return null; }
}

/** Later injury or farewell cannot rewrite the earlier scene; its own tick still requires real presence. */
export function isValidCampaignReparteeCallback(state: DepthState): boolean {
  try {
    const callback: unknown = state.reparteeCallback;
    if (callback === null) return true;
    if (!record(callback) || !safeTick(callback.tick) || !safeTick(state.tick) || callback.tick > state.tick) return false;
    const source = retainedSource(state);
    if (source === null || callback.tick <= source.reaction.completedTick
      || source.witness.phase === "former" && source.witness.departure.tick <= callback.tick
      || callback.tick === state.tick && !presentAtSharedRest(state, source.witness)) return false;
    const expected = makeCallback(source.reaction, source.witness, callback.tick);
    return Object.keys(callback).length === Object.keys(expected).length
      && Object.entries(expected).every(([key, value]) => Object.hasOwn(callback, key) && callback[key] === value);
  } catch { return false; }
}
