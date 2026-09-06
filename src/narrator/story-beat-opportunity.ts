import {
  isFactualStoryBeatJobV2,
  type FactualStoryBeatJobV2,
} from "./story-beat-v2";

export const factualStoryBeatOpportunityMaximumAgeTicks = 12 as const;

export const factualStoryBeatOpportunityLensPriority = Object.freeze({
  cost: 1,
  consequence: 2,
  contrast: 3,
} as const);

export interface FactualStoryBeatOpportunityV1 {
  readonly schemaVersion: 1;
  readonly kind: "factual-story-beat-opportunity";
  readonly job: FactualStoryBeatJobV2;
}

export interface FactualStoryBeatOpportunityContextV1 {
  readonly campaignId: string;
  readonly currentTick: number;
}

export interface FactualStoryBeatOpportunityViewV1 {
  readonly job: FactualStoryBeatJobV2;
  readonly ageTicks: number;
  readonly timing: "current" | "held";
}

const opportunityKeys = Object.freeze(["schemaVersion", "kind", "job"] as const);
const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isBoundedCampaignId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value);
}

function validContext(value: unknown): value is FactualStoryBeatOpportunityContextV1 {
  return isRecord(value)
    && hasExactKeys(value, ["campaignId", "currentTick"])
    && isBoundedCampaignId(value.campaignId)
    && Number.isSafeInteger(value.currentTick)
    && (value.currentTick as number) >= 0;
}

function copyJob(job: FactualStoryBeatJobV2): FactualStoryBeatJobV2 {
  return deepFreeze({
    ...job,
    facts: {
      ...job.facts,
      narrative: { ...job.facts.narrative },
      cost: job.facts.cost === null ? null : { ...job.facts.cost },
      consequence: job.facts.consequence === null
        ? null
        : { ...job.facts.consequence },
    },
  });
}

function copyOpportunity(job: FactualStoryBeatJobV2): FactualStoryBeatOpportunityV1 {
  return deepFreeze({
    schemaVersion: 1 as const,
    kind: "factual-story-beat-opportunity" as const,
    job: copyJob(job),
  });
}

function validJobAt(
  value: unknown,
  context: FactualStoryBeatOpportunityContextV1,
): value is FactualStoryBeatJobV2 {
  return isFactualStoryBeatJobV2(value)
    && value.campaignId === context.campaignId
    && value.tick <= context.currentTick
    && context.currentTick - value.tick <= factualStoryBeatOpportunityMaximumAgeTicks;
}

export function isFactualStoryBeatOpportunityV1(
  value: unknown,
): value is FactualStoryBeatOpportunityV1 {
  try {
    return isRecord(value)
      && hasExactKeys(value, opportunityKeys)
      && value.schemaVersion === 1
      && value.kind === "factual-story-beat-opportunity"
      && isFactualStoryBeatJobV2(value.job);
  } catch {
    return false;
  }
}

function chooseJob(
  current: FactualStoryBeatJobV2 | null,
  candidate: FactualStoryBeatJobV2 | null,
): FactualStoryBeatJobV2 | null {
  if (current === null) return candidate;
  if (candidate === null) return current;
  if (candidate.tick === current.tick) return current;
  const currentPriority =
    factualStoryBeatOpportunityLensPriority[current.facts.beatLensId];
  const candidatePriority =
    factualStoryBeatOpportunityLensPriority[candidate.facts.beatLensId];
  if (candidatePriority > currentPriority) return candidate;
  if (candidatePriority < currentPriority) return current;
  return candidate.tick > current.tick ? candidate : current;
}

/**
 * Retains one optional, public, already-committed factual authoring job.
 * It has no model, persistence, timing, rendering, or gameplay authority.
 */
export function retainFactualStoryBeatOpportunityV1(
  currentValue: unknown,
  candidateValue: unknown,
  contextValue: unknown,
): FactualStoryBeatOpportunityV1 | null {
  try {
    if (!validContext(contextValue)) return null;
    const currentJob = isFactualStoryBeatOpportunityV1(currentValue)
      && validJobAt(currentValue.job, contextValue)
      ? currentValue.job
      : null;
    const candidateJob = validJobAt(candidateValue, contextValue)
      ? candidateValue
      : null;
    const selected = chooseJob(currentJob, candidateJob);
    return selected === null ? null : copyOpportunity(selected);
  } catch {
    return null;
  }
}

export function projectFactualStoryBeatOpportunityV1(
  opportunityValue: unknown,
  contextValue: unknown,
): FactualStoryBeatOpportunityViewV1 | null {
  try {
    if (!validContext(contextValue)
      || !isFactualStoryBeatOpportunityV1(opportunityValue)
      || !validJobAt(opportunityValue.job, contextValue)) return null;
    const job = copyJob(opportunityValue.job);
    const ageTicks = contextValue.currentTick - job.tick;
    return deepFreeze({
      job,
      ageTicks,
      timing: ageTicks === 0 ? "current" : "held",
    });
  } catch {
    return null;
  }
}
