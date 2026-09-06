import { describe, expect, it } from "vitest";
import {
  selectStoryBeatFormEligibility,
  storyBeatPresentationBuckets,
  storyBeatPresentationJoins,
} from "./story-beat-form-eligibility";
import { storyBeatForms } from "./story-beat-form-selection";
import type { StoryBeatPublicFactsV1 } from "./story-beat";

const facts: StoryBeatPublicFactsV1 = {
  schemaVersion: 1,
  kind: "public-story-beat",
  location: "Moonclock Vault",
  headline: "The marked door opens.",
  action: "Mira crosses the quiet threshold.",
  consequence: "The western passage is now reachable.",
};

describe("story-beat presentation rhythm", () => {
  it("cycles every connective through every location shell in a stable 12-slot order", () => {
    expect(storyBeatPresentationJoins).toEqual(["while", "as", "semicolon", "and"]);
    expect(storyBeatPresentationBuckets.map((bucket) => bucket.bucketId)).toEqual([
      "prefix-while",
      "interior-while",
      "suffix-while",
      "prefix-as",
      "interior-as",
      "suffix-as",
      "prefix-semicolon",
      "interior-semicolon",
      "suffix-semicolon",
      "prefix-and",
      "interior-and",
      "suffix-and",
    ]);
    expect(Object.isFrozen(storyBeatPresentationBuckets)).toBe(true);
    expect(storyBeatPresentationBuckets.every(Object.isFrozen)).toBe(true);
  });

  it("retains genuine model choice in every bucket and covers all 45 grounded forms", () => {
    const decisions = storyBeatPresentationBuckets.map((_, sequenceSlot) =>
      selectStoryBeatFormEligibility(facts, sequenceSlot));
    expect(decisions.map((decision) => decision.selectedBucketId))
      .toEqual(storyBeatPresentationBuckets.map((bucket) => bucket.bucketId));
    expect(decisions.every((decision) => decision.forms.length >= 3)).toBe(true);
    expect(decisions.flatMap((decision) => decision.forms.map((form) => form.formId)).sort())
      .toEqual(storyBeatForms(facts).map((form) => form.formId).sort());
    for (const decision of decisions) {
      const bucket = storyBeatPresentationBuckets.find(
        (candidate) => candidate.bucketId === decision.selectedBucketId,
      )!;
      expect(decision.forms.every((form) =>
        form.locationShell === bucket.locationShell && form.join === bucket.join)).toBe(true);
      expect(Object.isFrozen(decision)).toBe(true);
      expect(Object.isFrozen(decision.forms)).toBe(true);
    }
  });

  it("bounds any presentation bucket to two appearances in an 18-beat window", () => {
    const counts = new Map<string, number>();
    for (let sequenceSlot = 0; sequenceSlot < 18; sequenceSlot += 1) {
      const bucketId = selectStoryBeatFormEligibility(facts, sequenceSlot).selectedBucketId!;
      counts.set(bucketId, (counts.get(bucketId) ?? 0) + 1);
    }
    expect(counts.size).toBe(12);
    expect(Math.max(...counts.values())).toBe(2);
  });

  it("wraps deterministically and fails closed when display policy admits no form", () => {
    expect(selectStoryBeatFormEligibility(facts, 12).requestedBucketId)
      .toBe(selectStoryBeatFormEligibility(facts, 0).requestedBucketId);
    const longPhrase = `${new Array(20).fill("marked").join(" ")}.`;
    const empty = selectStoryBeatFormEligibility({
      ...facts,
      headline: longPhrase,
      action: longPhrase,
      consequence: longPhrase,
    }, 0);
    expect(empty.selectedBucketId).toBeNull();
    expect(empty.forms).toEqual([]);
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "0", null]) {
      expect(() => selectStoryBeatFormEligibility(facts, invalid)).toThrow(/slot/u);
    }
    expect(() => selectStoryBeatFormEligibility({ ...facts, secret: true }, 0)).toThrow(/facts/u);
  });
});
