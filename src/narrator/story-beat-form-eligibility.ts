import {
  storyBeatFormLocationShells,
  storyBeatForms,
  type StoryBeatFormDescriptor,
  type StoryBeatFormLocationShell,
} from "./story-beat-form-selection";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const storyBeatPresentationJoins = Object.freeze([
  "while",
  "as",
  "semicolon",
  "and",
] as const);
export type StoryBeatPresentationJoin = typeof storyBeatPresentationJoins[number];
export type StoryBeatPresentationBucketId =
  `${StoryBeatFormLocationShell}-${StoryBeatPresentationJoin}`;

export interface StoryBeatPresentationBucket {
  readonly bucketId: StoryBeatPresentationBucketId;
  readonly locationShell: StoryBeatFormLocationShell;
  readonly join: StoryBeatPresentationJoin;
}

export const storyBeatPresentationBuckets: readonly StoryBeatPresentationBucket[] = deepFreeze(
  storyBeatPresentationJoins.flatMap((join) =>
    storyBeatFormLocationShells.map((locationShell) => ({
      bucketId: `${locationShell}-${join}` as StoryBeatPresentationBucketId,
      locationShell,
      join,
    }))),
);

export interface StoryBeatFormEligibilityDecision {
  readonly schemaVersion: 1;
  readonly sequenceSlot: number;
  readonly requestedBucketId: StoryBeatPresentationBucketId;
  readonly selectedBucketId: StoryBeatPresentationBucketId | null;
  readonly forms: readonly StoryBeatFormDescriptor[];
}

export function selectStoryBeatFormEligibility(
  factsValue: unknown,
  sequenceSlot: unknown,
): StoryBeatFormEligibilityDecision {
  if (!Number.isSafeInteger(sequenceSlot) || Number(sequenceSlot) < 0) {
    throw new TypeError("Story-beat presentation sequence slot is invalid");
  }
  const forms = storyBeatForms(factsValue);
  const requestedIndex = Number(sequenceSlot) % storyBeatPresentationBuckets.length;
  const requested = storyBeatPresentationBuckets[requestedIndex]!;
  for (let offset = 0; offset < storyBeatPresentationBuckets.length; offset += 1) {
    const bucket = storyBeatPresentationBuckets[
      (requestedIndex + offset) % storyBeatPresentationBuckets.length
    ]!;
    const eligible = forms.filter((form) =>
      form.locationShell === bucket.locationShell && form.join === bucket.join);
    if (eligible.length > 0) {
      return deepFreeze({
        schemaVersion: 1 as const,
        sequenceSlot: Number(sequenceSlot),
        requestedBucketId: requested.bucketId,
        selectedBucketId: bucket.bucketId,
        forms: eligible,
      });
    }
  }
  return deepFreeze({
    schemaVersion: 1 as const,
    sequenceSlot: Number(sequenceSlot),
    requestedBucketId: requested.bucketId,
    selectedBucketId: null,
    forms: [],
  });
}
