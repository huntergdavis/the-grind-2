import { describe, expect, it } from "vitest";
import {
  browserStoryBeatProtocolVersion,
  browserStoryBeatRepresentativeIndexes,
  hasExactKeys,
  isBoundedIdentity,
  isCaseResult,
  isSha256,
  isStoryBeatAcquisitionUrl,
} from "./protocol";

const result = Object.freeze({
  index: 0,
  id: "story-beat-training-corpus-v1:holdout:0000",
  caseHash: "1".repeat(16),
  candidate: "At Amber Yard, the bell rests.",
  valid: true,
  fallbackRequired: false,
  inputTokens: 80,
  outputTokens: 9,
  elapsedMs: 14,
});

describe("story-beat browser evaluation protocol", () => {
  it("pins V1 identities and the exact case-result shape", () => {
    expect(browserStoryBeatProtocolVersion).toBe(1);
    expect(browserStoryBeatRepresentativeIndexes).toEqual([
      4, 7, 8, 20, 30, 58, 63, 70, 79, 89, 91, 107, 126, 147, 175, 177, 189, 191,
    ]);
    expect(isCaseResult(structuredClone(result))).toBe(true);
    expect(isCaseResult({ ...result, hidden: true })).toBe(false);
    expect(isCaseResult({ ...result, fallbackRequired: true })).toBe(false);
    expect(isCaseResult({ ...result, inputTokens: 321 })).toBe(false);
    expect(isCaseResult({ ...result, outputTokens: 49 })).toBe(false);
  });

  it("rejects malformed, hostile, and throwing structures without widening", () => {
    expect(isBoundedIdentity("run:story-beat:001")).toBe(true);
    expect(isBoundedIdentity(" run")).toBe(false);
    expect(isSha256("a".repeat(64))).toBe(true);
    expect(isSha256("A".repeat(64))).toBe(false);
    expect(hasExactKeys({ a: 1 }, ["a"])).toBe(true);
    expect(() => hasExactKeys(new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } }), ["a"]))
      .toThrow("hostile");
  });

  it("allows only exact same-origin staging acquisition routes", () => {
    const origin = "http://127.0.0.1:4173";
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/model/0`, origin)).toBe(true);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/runtime/1`, origin)).toBe(true);
    expect(isStoryBeatAcquisitionUrl("https://example.test/__story_beat_evaluation_staging__/model/0", origin)).toBe(false);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/model/0?x=1`, origin)).toBe(false);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/model/0#x`, origin)).toBe(false);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/%2e%2e/model/0`, origin)).toBe(false);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging__/model/0/extra`, origin)).toBe(false);
    expect(isStoryBeatAcquisitionUrl(`${origin}/__story_beat_evaluation_staging_evil__/model/0`, origin)).toBe(false);
  });
});
