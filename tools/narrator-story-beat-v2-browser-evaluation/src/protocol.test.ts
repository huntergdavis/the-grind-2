import { describe, expect, it } from "vitest";
import {
  browserFactualStoryBeatProtocolVersion,
  browserFactualStoryBeatRepresentativeIndexes,
  hasExactKeys,
  isBoundedIdentity,
  isCaseResult,
  isFactualStoryBeatAcquisitionUrl,
  isSha256,
} from "./protocol";

const result = Object.freeze({
  index: 0,
  id: "factual-story-beat-training-corpus-v2:holdout:0000",
  caseHash: "1".repeat(16),
  candidate: "At Amber Yard, health decreased by 2.",
  valid: true,
  fallbackRequired: false,
  exactPlace: true,
  requiredClausesComplete: true,
  sequenceSlot: 0,
  presentationBucketId: "prefix-as",
  formId: "prefix-as-action",
  inputTokens: 160,
  outputTokens: 9,
  elapsedMs: 14,
});

describe("factual story-beat V2 browser evaluation protocol", () => {
  it("pins V2 identities and the exact case-result shape", () => {
    expect(browserFactualStoryBeatProtocolVersion).toBe(2);
    expect(browserFactualStoryBeatRepresentativeIndexes).toEqual([
      0, 3, 10, 20, 24, 29, 30, 38, 43, 45, 46, 49,
      56, 61, 73, 81, 102, 104, 105, 106, 108, 113, 114, 124,
      131, 136, 139, 143, 147, 148, 152, 157, 161, 167, 170, 195,
    ]);
    expect(isCaseResult(structuredClone(result))).toBe(true);
    expect(isCaseResult({ ...result, hidden: true })).toBe(false);
    expect(isCaseResult({ ...result, fallbackRequired: true })).toBe(false);
    expect(isCaseResult({ ...result, inputTokens: 385 })).toBe(false);
    expect(isCaseResult({ ...result, outputTokens: 49 })).toBe(false);
    expect(isCaseResult({ ...result, sequenceSlot: 6 })).toBe(false);
    expect(isCaseResult({ ...result, presentationBucketId: "prefix-if" }))
      .toBe(false);
    expect(isCaseResult({ ...result, formId: "" })).toBe(false);
  });

  it("rejects malformed, hostile, and throwing structures without widening", () => {
    expect(isBoundedIdentity("run:factual-story-beat:001")).toBe(true);
    expect(isBoundedIdentity(" run")).toBe(false);
    expect(isSha256("a".repeat(64))).toBe(true);
    expect(isSha256("A".repeat(64))).toBe(false);
    expect(hasExactKeys({ a: 1 }, ["a"])).toBe(true);
    expect(() => hasExactKeys(
      new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } }),
      ["a"],
    )).toThrow("hostile");
  });

  it("allows only exact same-origin V2 staging acquisition routes", () => {
    const origin = "http://127.0.0.1:4173";
    const base = origin + "/__factual_story_beat_v2_evaluation_staging__";
    expect(isFactualStoryBeatAcquisitionUrl(base + "/holdout/0", origin))
      .toBe(true);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/model/0", origin))
      .toBe(true);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/runtime/1", origin))
      .toBe(true);
    expect(isFactualStoryBeatAcquisitionUrl(
      "https://example.test/__factual_story_beat_v2_evaluation_staging__/model/0",
      origin,
    )).toBe(false);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/model/0?x=1", origin))
      .toBe(false);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/model/0#x", origin))
      .toBe(false);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/%2e%2e/model/0", origin))
      .toBe(false);
    expect(isFactualStoryBeatAcquisitionUrl(base + "/model/0/extra", origin))
      .toBe(false);
    expect(isFactualStoryBeatAcquisitionUrl(
      origin + "/__factual_story_beat_v2_evaluation_staging_evil__/model/0",
      origin,
    )).toBe(false);
  });
});
