import {
  isLiveNarratorFormId,
  type LiveNarratorFormId,
} from "./live-form-selection";
import {
  isNarratorBoundedText,
  type NarratorEnergy,
  type NarratorMoveV1,
} from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const narratorMomentEventClasses = Object.freeze([
  "danger",
  "discovery",
  "arrival",
  "ambient",
] as const);

export type NarratorMomentEventClass = typeof narratorMomentEventClasses[number];
export type NarratorMomentActivity = "calm" | "open" | "busy";

export interface CommittedPublicChronicleFactV1 {
  readonly schemaVersion: 1;
  readonly kind: "committed-public-chronicle-fact";
  readonly visibility: "public";
  readonly committed: true;
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
  readonly activity: NarratorMomentActivity;
  readonly energy: NarratorEnergy;
  readonly eventClasses: readonly NarratorMomentEventClass[];
}

export interface RecentNarratorMomentV1 {
  readonly tick: number;
  readonly formId: LiveNarratorFormId;
}

export interface NarratorMomentDirectorInputV1 {
  readonly schemaVersion: 1;
  readonly fact: CommittedPublicChronicleFactV1;
  /** Oldest first; every entry must precede the committed fact tick. */
  readonly recentMoments: readonly RecentNarratorMomentV1[];
}

export type NarratorMomentSuppressionReason =
  | "invalid-input"
  | "busy"
  | "calm"
  | "cooldown"
  | "relax"
  | "fatigued";

export interface EligibleNarratorMomentDecisionV1 {
  readonly schemaVersion: 1;
  readonly kind: "eligible";
  readonly eventClass: NarratorMomentEventClass;
  readonly move: NarratorMoveV1;
  readonly suppression: null;
  readonly eligibleFormIds: readonly LiveNarratorFormId[];
}

export interface SuppressedNarratorMomentDecisionV1 {
  /** Suppression applies only to optional selection; the caller's authored fallback remains valid. */
  readonly schemaVersion: 1;
  readonly kind: "suppressed";
  readonly eventClass: NarratorMomentEventClass | null;
  readonly move: NarratorMoveV1 | null;
  readonly suppression: NarratorMomentSuppressionReason;
  readonly eligibleFormIds: readonly [];
}

export type NarratorMomentDecisionV1 =
  | EligibleNarratorMomentDecisionV1
  | SuppressedNarratorMomentDecisionV1;

const minimumTickGapByEventClass = deepFreeze({
  danger: 2,
  discovery: 2,
  arrival: 3,
  ambient: 4,
} as const satisfies Readonly<Record<NarratorMomentEventClass, number>>);

export const narratorMomentDirectorPolicyV1 = deepFreeze({
  schemaVersion: 1 as const,
  maximumEventClasses: 3,
  maximumRecentMoments: 8,
  pressureRelaxTicks: 3,
  fatigueWindowMoments: 4,
  fatigueResetTicks: 8,
  maximumUsesPerFormInFatigueWindow: 1,
  eventClassPriority: narratorMomentEventClasses,
  suppressionPriority: Object.freeze([
    "invalid-input",
    "busy",
    "calm",
    "cooldown",
    "relax",
    "fatigued",
  ] as const satisfies readonly NarratorMomentSuppressionReason[]),
  minimumTickGapByEventClass,
});

interface EventClassPolicy {
  readonly move: NarratorMoveV1;
  readonly formIds: readonly LiveNarratorFormId[];
}

const eventClassPolicies = deepFreeze({
  danger: {
    move: "register-pressure",
    formIds: ["pressure-attention", "pressure-feel", "pressure-close"],
  },
  discovery: {
    move: "establish-setting",
    formIds: ["establish-holds", "establish-gathers", "establish-waits"],
  },
  arrival: {
    move: "establish-setting",
    formIds: ["establish-holds", "establish-gathers", "establish-waits"],
  },
  ambient: {
    move: "shade-atmosphere",
    formIds: ["shade-holds-baseline", "shade-rests", "shade-settles", "shade-lingers"],
  },
} as const satisfies Readonly<Record<NarratorMomentEventClass, EventClassPolicy>>);

const factKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "visibility",
  "committed",
  "campaignId",
  "eventId",
  "tick",
  "sourceFingerprint",
  "activity",
  "energy",
  "eventClasses",
] as const);
const recentMomentKeys = Object.freeze(["tick", "formId"] as const);
const inputKeys = Object.freeze(["schemaVersion", "fact", "recentMoments"] as const);
const narratorEnergies = Object.freeze(["quiet", "steady", "heightened"] as const);
const sourceFingerprintPattern = /^[0-9a-f]{16}$/u;
const emptyFormIds = Object.freeze([]) as readonly [];

const invalidDecision = Object.freeze({
  schemaVersion: 1,
  kind: "suppressed",
  eventClass: null,
  move: null,
  suppression: "invalid-input",
  eligibleFormIds: emptyFormIds,
} as const satisfies SuppressedNarratorMomentDecisionV1);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isDenseArray(value: unknown, maximumLength: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) return false;
  if (Object.keys(value).length !== value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isEventClass(value: unknown): value is NarratorMomentEventClass {
  return typeof value === "string"
    && (narratorMomentEventClasses as readonly string[]).includes(value);
}

function isEnergy(value: unknown): value is NarratorEnergy {
  return typeof value === "string" && (narratorEnergies as readonly string[]).includes(value);
}

function isCommittedPublicFact(value: unknown): value is CommittedPublicChronicleFactV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, factKeys)
    || value.schemaVersion !== 1
    || value.kind !== "committed-public-chronicle-fact"
    || value.visibility !== "public"
    || value.committed !== true
    || !isNarratorBoundedText(value.campaignId, 160)
    || !isNarratorBoundedText(value.eventId, 160)
    || !Number.isSafeInteger(value.tick)
    || (value.tick as number) < 0
    || typeof value.sourceFingerprint !== "string"
    || !sourceFingerprintPattern.test(value.sourceFingerprint)
    || (value.activity !== "calm" && value.activity !== "open" && value.activity !== "busy")
    || !isEnergy(value.energy)
    || !isDenseArray(value.eventClasses, narratorMomentDirectorPolicyV1.maximumEventClasses)
    || value.eventClasses.length === 0) return false;
  const seen = new Set<NarratorMomentEventClass>();
  for (const eventClass of value.eventClasses) {
    if (!isEventClass(eventClass) || seen.has(eventClass)) return false;
    seen.add(eventClass);
  }
  return true;
}

function isRecentMoment(value: unknown, factTick: number): value is RecentNarratorMomentV1 {
  return isRecord(value)
    && hasExactKeys(value, recentMomentKeys)
    && Number.isSafeInteger(value.tick)
    && (value.tick as number) >= 0
    && (value.tick as number) < factTick
    && isLiveNarratorFormId(value.formId);
}

function safelyValidateInput(value: unknown): value is NarratorMomentDirectorInputV1 {
  if (!isRecord(value)
    || !hasExactKeys(value, inputKeys)
    || value.schemaVersion !== 1
    || !isCommittedPublicFact(value.fact)
    || !isDenseArray(value.recentMoments, narratorMomentDirectorPolicyV1.maximumRecentMoments)) {
    return false;
  }
  let previousTick = -1;
  for (const recent of value.recentMoments) {
    if (!isRecentMoment(recent, value.fact.tick) || recent.tick <= previousTick) return false;
    previousTick = recent.tick;
  }
  return true;
}

export function isNarratorMomentDirectorInputV1(
  value: unknown,
): value is NarratorMomentDirectorInputV1 {
  try {
    return safelyValidateInput(value);
  } catch {
    return false;
  }
}

function selectedEventClass(
  classes: readonly NarratorMomentEventClass[],
): NarratorMomentEventClass {
  for (const eventClass of narratorMomentDirectorPolicyV1.eventClassPriority) {
    if (classes.includes(eventClass)) return eventClass;
  }
  throw new TypeError("Validated narrator moment has no declared event class");
}

function suppressed(
  reason: Exclude<NarratorMomentSuppressionReason, "invalid-input">,
  eventClass: NarratorMomentEventClass,
  move: NarratorMoveV1,
): SuppressedNarratorMomentDecisionV1 {
  return Object.freeze({
    schemaVersion: 1,
    kind: "suppressed",
    eventClass,
    move,
    suppression: reason,
    eligibleFormIds: emptyFormIds,
  });
}

function isPressureForm(formId: LiveNarratorFormId): boolean {
  return (eventClassPolicies.danger.formIds as readonly LiveNarratorFormId[]).includes(formId);
}

/**
 * Chooses the bounded form set that a later narrator selector may consider.
 * Suppression never suppresses or replaces the caller-owned deterministic fallback.
 * This function has no model, UI, persistence, clock, random, or gameplay authority.
 */
export function directNarratorMoment(input: unknown): NarratorMomentDecisionV1 {
  if (!isNarratorMomentDirectorInputV1(input)) return invalidDecision;

  const eventClass = selectedEventClass(input.fact.eventClasses);
  const policy = eventClassPolicies[eventClass];
  if (input.fact.activity === "busy") return suppressed("busy", eventClass, policy.move);
  if (input.fact.activity === "calm") return suppressed("calm", eventClass, policy.move);

  const latest = input.recentMoments.at(-1);
  if (latest !== undefined
    && input.fact.tick - latest.tick
      < narratorMomentDirectorPolicyV1.minimumTickGapByEventClass[eventClass]) {
    return suppressed("cooldown", eventClass, policy.move);
  }

  for (let index = input.recentMoments.length - 1; index >= 0; index -= 1) {
    const recent = input.recentMoments[index]!;
    if (!isPressureForm(recent.formId)) continue;
    if (input.fact.tick - recent.tick < narratorMomentDirectorPolicyV1.pressureRelaxTicks) {
      return suppressed("relax", eventClass, policy.move);
    }
    break;
  }

  const fatigueWindow = input.recentMoments.slice(
    -narratorMomentDirectorPolicyV1.fatigueWindowMoments,
  ).filter((recent) =>
    input.fact.tick - recent.tick < narratorMomentDirectorPolicyV1.fatigueResetTicks);
  const useCounts = new Map<LiveNarratorFormId, number>();
  for (const recent of fatigueWindow) {
    useCounts.set(recent.formId, (useCounts.get(recent.formId) ?? 0) + 1);
  }
  const eligibleFormIds = policy.formIds.filter((formId) =>
    formId !== latest?.formId
      && (useCounts.get(formId) ?? 0)
        < narratorMomentDirectorPolicyV1.maximumUsesPerFormInFatigueWindow);
  if (eligibleFormIds.length === 0) return suppressed("fatigued", eventClass, policy.move);

  return Object.freeze({
    schemaVersion: 1,
    kind: "eligible",
    eventClass,
    move: policy.move,
    suppression: null,
    eligibleFormIds: Object.freeze([...eligibleFormIds]),
  });
}
