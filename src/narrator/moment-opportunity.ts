import {
  directNarratorMoment,
  narratorMomentDirectorPolicyV1,
  snapshotNarratorMomentDirectorInputV1,
  type CommittedPublicChronicleFactV1,
  type EligibleNarratorMomentDecisionV1,
  type NarratorMomentDirectorInputV1,
  type NarratorMomentEventClass,
} from "./moment-director";
import { isNarratorBoundedText } from "./protocol";

export const narratorMomentOpportunityMaximumAgeTicks = 4 as const;

export interface NarratorMomentOpportunityContextV1 {
  readonly campaignId: string;
  readonly currentTick: number;
}

export interface PendingNarratorMomentV1 {
  readonly schemaVersion: 1;
  readonly kind: "pending-narrator-moment";
  readonly directorInput: NarratorMomentDirectorInputV1;
}

export interface NarratorMomentOpportunityViewV1 {
  readonly fact: CommittedPublicChronicleFactV1;
  readonly decision: EligibleNarratorMomentDecisionV1;
  readonly ageTicks: number;
  readonly timing: "current" | "held";
}

const contextKeys = Object.freeze(["campaignId", "currentTick"] as const);
const opportunityKeys = Object.freeze(["schemaVersion", "kind", "directorInput"] as const);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read each declared own data property once; accessors are not protocol data. */
function snapshotRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotContext(value: unknown): NarratorMomentOpportunityContextV1 | null {
  try {
    const context = snapshotRecord(value, contextKeys);
    if (context === null
      || !isNarratorBoundedText(context.campaignId, 160)
      || !Number.isSafeInteger(context.currentTick)
      || (context.currentTick as number) < 0) return null;
    return Object.freeze({ campaignId: context.campaignId, currentTick: context.currentTick as number });
  } catch {
    return null;
  }
}

function eligibleDecision(
  input: NarratorMomentDirectorInputV1,
): EligibleNarratorMomentDecisionV1 | null {
  const decision = directNarratorMoment(input);
  return decision.kind === "eligible" ? decision : null;
}

function snapshotEligibleInput(value: unknown): NarratorMomentDirectorInputV1 | null {
  try {
    const input = snapshotNarratorMomentDirectorInputV1(value);
    return input !== null && eligibleDecision(input) !== null ? input : null;
  } catch {
    return null;
  }
}

function opportunityFromSnapshot(
  input: NarratorMomentDirectorInputV1,
): PendingNarratorMomentV1 {
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: "pending-narrator-moment" as const,
    directorInput: input,
  });
}

function sourceIdentityMatches(
  left: CommittedPublicChronicleFactV1,
  right: CommittedPublicChronicleFactV1,
): boolean {
  return left.campaignId === right.campaignId
    && left.eventId === right.eventId
    && left.tick === right.tick
    && left.sourceFingerprint === right.sourceFingerprint;
}

function validInputAt(
  value: NarratorMomentDirectorInputV1 | null,
  context: NarratorMomentOpportunityContextV1,
  requireCurrentTick: boolean,
): value is NarratorMomentDirectorInputV1 {
  if (value === null
    || value.fact.campaignId !== context.campaignId
    || value.fact.tick > context.currentTick
    || context.currentTick - value.fact.tick > narratorMomentOpportunityMaximumAgeTicks) {
    return false;
  }
  return !requireCurrentTick || value.fact.tick === context.currentTick;
}

function snapshotPendingInput(value: unknown): NarratorMomentDirectorInputV1 | null {
  try {
    const pending = snapshotRecord(value, opportunityKeys);
    if (pending === null || pending.schemaVersion !== 1 || pending.kind !== "pending-narrator-moment") {
      return null;
    }
    return snapshotEligibleInput(pending.directorInput);
  } catch {
    return null;
  }
}

export function isPendingNarratorMomentV1(value: unknown): value is PendingNarratorMomentV1 {
  return snapshotPendingInput(value) !== null;
}

function eventClassRank(eventClass: NarratorMomentEventClass): number {
  return narratorMomentDirectorPolicyV1.eventClassPriority.length
    - narratorMomentDirectorPolicyV1.eventClassPriority.indexOf(eventClass);
}

function chooseInput(
  current: NarratorMomentDirectorInputV1 | null,
  candidate: NarratorMomentDirectorInputV1 | null,
): NarratorMomentDirectorInputV1 | null {
  if (current === null) return candidate;
  if (candidate === null) return current;

  if (sourceIdentityMatches(current.fact, candidate.fact)) return current;
  if (candidate.fact.tick === current.fact.tick) return current;

  const currentDecision = eligibleDecision(current);
  const candidateDecision = eligibleDecision(candidate);
  if (currentDecision === null) return candidate;
  if (candidateDecision === null) return current;

  const currentRank = eventClassRank(currentDecision.eventClass);
  const candidateRank = eventClassRank(candidateDecision.eventClass);
  if (candidateRank > currentRank) return candidate;
  if (candidateRank < currentRank) return current;
  return candidate.fact.tick > current.fact.tick ? candidate : current;
}

/**
 * Retains one optional narrator moment whose eligibility is proven by the
 * delivered deterministic director. It has no model, UI, persistence, wall
 * clock, randomness, prose, or gameplay authority.
 */
export function retainNarratorMomentOpportunityV1(
  currentValue: unknown,
  candidateValue: unknown,
  contextValue: unknown,
): PendingNarratorMomentV1 | null {
  const context = snapshotContext(contextValue);
  if (context === null) return null;
  const current = snapshotPendingInput(currentValue);
  const candidate = snapshotEligibleInput(candidateValue);
  const selected = chooseInput(
    validInputAt(current, context, false) ? current : null,
    validInputAt(candidate, context, true) ? candidate : null,
  );
  return selected === null ? null : opportunityFromSnapshot(selected);
}

export function projectNarratorMomentOpportunityV1(
  opportunityValue: unknown,
  contextValue: unknown,
): NarratorMomentOpportunityViewV1 | null {
  const context = snapshotContext(contextValue);
  if (context === null) return null;
  const input = snapshotPendingInput(opportunityValue);
  if (!validInputAt(input, context, false)) return null;
  const decision = eligibleDecision(input);
  if (decision === null) return null;
  const ageTicks = context.currentTick - input.fact.tick;
  return deepFreeze({
    fact: input.fact,
    decision,
    ageTicks,
    timing: ageTicks === 0 ? "current" : "held",
  });
}
