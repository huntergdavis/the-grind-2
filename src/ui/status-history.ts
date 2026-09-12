import type { ActorDecisionTrace, ChronicleEntry, RecordedDepthCommandType, SceneMode } from "../core/types";
import { maximumDepthLogEntries } from "../depth/state";
import type { DepthLogEntry, DepthState } from "../depth/types";
import type { BoundCombatAftermath } from "./combat-aftermath";
import type { BoundCombatControlRecap } from "./combat-control-recap";

// These are display bounds for the existing retained sources, not a second archive.
// The canonical reducer retains the latest 32 Chronicle entries.
export const maximumStatusChronicleEntries = 32;
export const maximumStatusMechanicsEntries = maximumDepthLogEntries;
export const maximumStatusHistoryEntries = maximumStatusChronicleEntries + maximumStatusMechanicsEntries;

interface StatusHistoryIdentity {
  readonly eventId: string;
  readonly campaignId: string;
  readonly tick: number;
}

export interface StatusHistoryDecision {
  readonly chosenAction: string;
  readonly rationale: string;
  readonly commandId: string | null;
  readonly commandType: RecordedDepthCommandType | null;
  readonly trace: Readonly<ActorDecisionTrace> | null;
}

export interface ChronicleStatusHistoryRow extends StatusHistoryIdentity {
  readonly source: "chronicle";
  readonly mode: SceneMode;
  readonly location: string;
  readonly headline: string;
  readonly action: string;
  readonly goal: string;
  readonly consequence: string;
  readonly decision: StatusHistoryDecision;
  readonly aftermath?: BoundCombatAftermath;
  readonly control?: BoundCombatControlRecap;
}

export interface MechanicsStatusHistoryRow extends StatusHistoryIdentity {
  readonly source: "mechanics";
  readonly category: DepthLogEntry["category"];
  readonly message: string;
}

export type StatusHistoryRow = ChronicleStatusHistoryRow | MechanicsStatusHistoryRow;

export interface StatusHistorySource {
  readonly campaignId: string;
  readonly chronicle: readonly ChronicleEntry[];
  readonly depth: Pick<DepthState, "log">;
}

function newestUniqueEntries<T extends { id: string; tick: number }>(
  entries: readonly T[], maximum: number,
): readonly T[] {
  const seen = new Set<string>();
  return entries.map((entry, index) => ({ entry, index }))
    .sort((left, right) => right.entry.tick - left.entry.tick || right.index - left.index)
    .filter(({ entry }) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, maximum)
    .map(({ entry }) => entry);
}

function copyDecisionTrace(trace: ActorDecisionTrace | undefined): Readonly<ActorDecisionTrace> | null {
  if (trace === undefined) return null;
  return Object.freeze({
    ...trace,
    selected: Object.freeze({ ...trace.selected }),
    considered: Object.freeze(trace.considered.map((choice) => Object.freeze({ ...choice }))),
    reasons: Object.freeze([...trace.reasons]),
  });
}

/**
 * Project only this loaded campaign's retained canonical records. Depth receipts
 * have seed-based IDs, not campaign IDs; preserve those IDs and their owning
 * campaign instead of inferring ownership or location from message text.
 *
 * Chronicle and mechanics remain distinct even at the same tick or with matching
 * text. Same-tick placement is a display convention, not a new event chronology.
 * Imagined narrator text is deliberately not an input to this projection.
 */
export function projectStatusHistory(
  state: StatusHistorySource,
  aftermaths: readonly BoundCombatAftermath[] = [],
  controls: readonly BoundCombatControlRecap[] = [],
): readonly StatusHistoryRow[] {
  const chronicle: readonly ChronicleStatusHistoryRow[] = newestUniqueEntries(
    state.chronicle, maximumStatusChronicleEntries,
  ).map((entry) => {
    // These packets come from the validated combat projector. The display join
    // still requires this exact row, rather than just a reusable route/combat ID.
    const aftermath = entry.commandType !== "combat-action" || entry.mode !== "battle" ? undefined
      : aftermaths.find((candidate) => candidate.chronicleId === entry.id && candidate.tick === entry.tick
        && candidate.commandId === entry.commandId && candidate.commandId.startsWith(`${state.campaignId}:depth:`));
    const control = entry.commandType !== "combat-action" || entry.mode !== "battle" ? undefined
      : controls.find((candidate) => candidate.chronicleId === entry.id && candidate.tick === entry.tick
        && candidate.commandId === entry.commandId && candidate.commandId.startsWith(`${state.campaignId}:depth:`)
        && candidate.heroId === `hero:${state.campaignId}`);
    return Object.freeze({
      source: "chronicle" as const,
      eventId: entry.id,
      campaignId: state.campaignId,
      tick: entry.tick,
      mode: entry.mode,
      location: entry.location,
      headline: entry.headline,
      action: entry.action,
      goal: entry.goal,
      consequence: entry.consequence,
      decision: Object.freeze({
        chosenAction: entry.chosenAction,
        rationale: entry.rationale,
        commandId: entry.commandId ?? null,
        commandType: entry.commandType ?? null,
        trace: copyDecisionTrace(entry.decisionTrace),
      }),
      ...(aftermath === undefined ? {} : { aftermath }),
      ...(control === undefined ? {} : { control }),
    });
  });
  const mechanics: readonly MechanicsStatusHistoryRow[] = newestUniqueEntries(
    state.depth.log, maximumStatusMechanicsEntries,
  ).map((entry) => Object.freeze({
    source: "mechanics" as const,
    eventId: entry.id,
    campaignId: state.campaignId,
    tick: entry.tick,
    category: entry.category,
    message: entry.message,
  }));
  return Object.freeze([...chronicle, ...mechanics].sort((left, right) => right.tick - left.tick));
}
