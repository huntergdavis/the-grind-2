import type { ChronicleEntry, WorldState } from "../core/types";
import { counterDuelStanceLabel, counterDuelTellText } from "../depth/counter-duel";
import type { CounterDuelStance, CounterDuelTell } from "../depth/types";
import {
  isFieldNoteResolutionPacketV1,
  projectFieldNoteResolution,
  type FieldNoteResolutionPacketV1,
} from "./field-note-resolution";

export interface FieldNotePublicTellV1 {
  readonly schemaVersion: 1;
  readonly duelId: string;
  readonly tellId: string;
  readonly round: 1;
  readonly cue: CounterDuelTell["cue"];
  readonly suggestedStance: CounterDuelStance;
  readonly clarity: 1 | 2 | 3;
}

export interface FieldNoteResolutionPacketV2 extends Omit<FieldNoteResolutionPacketV1, "schemaVersion"> {
  readonly schemaVersion: 2;
  readonly publicTell: FieldNotePublicTellV1;
  readonly commitmentVisibility: "hidden";
}

export type FieldNoteResolutionPresentationPacket = FieldNoteResolutionPacketV1 | FieldNoteResolutionPacketV2;
export type FieldNoteEvidenceRelationship = "agree" | "live-over-habit";

const receiptKeys = Object.freeze([
  "schemaVersion",
  "duelId",
  "tellId",
  "round",
  "cue",
  "suggestedStance",
  "clarity",
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

export function fieldNotePublicTellClarityLabel(clarity: 1 | 2 | 3): "faint" | "readable" | "bold" {
  return clarity === 3 ? "bold" : clarity === 2 ? "readable" : "faint";
}

function cueMatchesStance(cue: CounterDuelTell["cue"], stance: CounterDuelStance): boolean {
  return (stance === "rush" && cue === "forward-weight")
    || (stance === "ward" && cue === "closed-center")
    || (stance === "feint" && cue === "open-flank");
}

export function isFieldNotePublicTellV1(value: unknown): value is FieldNotePublicTellV1 {
  if (!isRecord(value) || !exactKeys(value, receiptKeys)) return false;
  if (
    value.schemaVersion !== 1
    || typeof value.duelId !== "string"
    || value.duelId.length < 1
    || value.duelId.length > 512
    || typeof value.tellId !== "string"
    || value.tellId.length < 1
    || value.tellId.length > 512
    || value.round !== 1
    || (value.cue !== "forward-weight" && value.cue !== "closed-center" && value.cue !== "open-flank")
    || (value.suggestedStance !== "rush" && value.suggestedStance !== "ward" && value.suggestedStance !== "feint")
    || (value.clarity !== 1 && value.clarity !== 2 && value.clarity !== 3)
    || !cueMatchesStance(value.cue, value.suggestedStance)
  ) return false;
  return value.tellId === `${value.duelId}:round:${value.round}:tell`;
}

export function isFieldNoteResolutionPacketV2(value: unknown): value is FieldNoteResolutionPacketV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  const { publicTell, commitmentVisibility, ...baseFields } = value;
  if (!isFieldNotePublicTellV1(publicTell)) return false;
  if (commitmentVisibility !== "hidden") return false;
  if (!isFieldNoteResolutionPacketV1({ ...baseFields, schemaVersion: 1 })) return false;
  const packet = value as unknown as FieldNoteResolutionPacketV2;
  return packet.encounterMode === "pattern-duel"
    && packet.sourceCommandType === "start-counter-duel"
    && packet.unlocks.length === 1
    && packet.precedenceText.includes("live tell takes precedence")
    && packet.precedenceText.includes("no committed stance");
}

/**
 * Upgrades only a genuine Pattern Duel Field-Note resolution. The receipt copies
 * the public round-one tell and deliberately carries no opponent stance.
 */
export function projectFieldNoteResolutionPacketV2(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): FieldNoteResolutionPacketV2 | null {
  if (source.commandType !== "start-counter-duel") return null;
  const base = projectFieldNoteResolution(before, after, source);
  const duel = after.depth.counterDuel;
  if (
    base === null
    || base.encounterMode !== "pattern-duel"
    || duel === null
    || duel.round !== 1
    || duel.history.length !== 0
    || duel.tell.id !== `${duel.id}:round:1:tell`
    || base.unlocks.length !== 1
    || base.unlocks[0]?.speciesId !== duel.opponentSpeciesId
  ) return null;
  const tell = duel.tell;
  const publicTell = Object.freeze<FieldNotePublicTellV1>({
    schemaVersion: 1,
    duelId: duel.id,
    tellId: tell.id,
    round: 1,
    cue: tell.cue,
    suggestedStance: tell.suggestedStance,
    clarity: tell.clarity,
  });
  const packet = Object.freeze<FieldNoteResolutionPacketV2>({
    ...base,
    schemaVersion: 2,
    publicTell,
    commitmentVisibility: "hidden",
  });
  return isFieldNoteResolutionPacketV2(packet) ? packet : null;
}

export function fieldNotePublicTellText(receipt: FieldNotePublicTellV1): string {
  return counterDuelTellText({
    id: receipt.tellId,
    cue: receipt.cue,
    suggestedStance: receipt.suggestedStance,
    clarity: receipt.clarity,
  });
}

export function fieldNotePublicTellLabel(receipt: FieldNotePublicTellV1): string {
  return `Live signal · ${fieldNotePublicTellClarityLabel(receipt.clarity)} clarity · suggests ${counterDuelStanceLabel(receipt.suggestedStance)}`;
}

export function fieldNoteEvidenceRelationship(packet: FieldNoteResolutionPacketV2): FieldNoteEvidenceRelationship {
  return packet.publicTell.suggestedStance === packet.unlocks[0]!.preferredStance
    ? "agree"
    : "live-over-habit";
}

export function fieldNotePublicTellMatchesActiveDuel(
  packet: FieldNoteResolutionPacketV2,
  state: WorldState,
): boolean {
  const duel = state.depth.counterDuel;
  const tell = packet.publicTell;
  return duel !== null
    && state.campaignId === packet.campaignId
    && state.tick === packet.tick
    && duel.id === tell.duelId
    && duel.round === tell.round
    && duel.history.length === 0
    && duel.opponentSpeciesId === packet.unlocks[0]?.speciesId
    && duel.tell.id === tell.tellId
    && duel.tell.cue === tell.cue
    && duel.tell.suggestedStance === tell.suggestedStance
    && duel.tell.clarity === tell.clarity;
}
