import { describe, expect, it } from "vitest";
import {
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "../narrator/story-beat";
import {
  createStoryBeatDraftSignatureV1,
  storyBeatDraftEchoReasonV1,
} from "./story-beat-echo";

const facts: StoryBeatPublicFactsV1 = {
  schemaVersion: 1,
  kind: "public-story-beat",
  location: "Amber Crossing",
  headline: "The old bridge answers.",
  action: "Rain rings across the old bridge.",
  consequence: "The eastern path opens.",
};

function signature(value: string, location = facts.location) {
  const result = createStoryBeatDraftSignatureV1(value, location);
  if (result === null) throw new Error("Expected a story-beat signature");
  return result;
}

describe("story-beat anti-echo admission", () => {
  it("rejects a headline restatement despite case, adornment, repetition, or neutral filler", () => {
    for (const candidate of [
      "At Amber Crossing, the old bridge answers.",
      "OLD bridge answers at AMBER CROSSING!",
      "At Amber Crossing — old bridge answers ✦.",
      "At Amber Crossing, the old bridge answers answers.",
      "At Amber Crossing, the old bridge answers and it answers.",
      "At Amber Crossing, the old bridge answers and the old bridge answers.",
      "At Amber Crossing, bridge answers and bridge answers.",
    ]) {
      expect(storyBeatDraftEchoReasonV1(signature(candidate), facts, []), candidate)
        .toBe("headline-echo");
    }
    expect(storyBeatDraftEchoReasonV1(
      signature("At Amber Crossing, rain rings while the old bridge answers."),
      facts,
      [],
    )).toBeNull();
    expect(storyBeatDraftEchoReasonV1(
      signature("At Amber Crossing, answers the old bridge."),
      facts,
      [],
    )).toBeNull();
  });

  it("normalizes compatibility case and punctuation for exact repeats without confusable mapping", () => {
    const previous = signature("At Amber Crossing, rain rings across stone 12.");
    expect(storyBeatDraftEchoReasonV1(
      signature("Ａｔ Amber Crossing rain rings across stone 12!"),
      facts,
      [previous],
    )).toBe("recent-echo");
    expect(storyBeatDraftEchoReasonV1(
      signature("аlpha beta."),
      facts,
      [signature("alpha beta.")],
    )).toBeNull();
  });

  it("canonicalizes only equivalent intra-word apostrophes and hyphens", () => {
    const typographyFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      action: "Warden's lantern dims over stone arch. Moon-Watch lantern dims over stone arch.",
      consequence: "The warden’s lantern dims. The Moon‑Watch lantern dims.",
    };
    const cases = [
      [
        "At Amber Crossing, Warden's lantern dims over stone arch.",
        "At Amber Crossing, Warden’s lantern dims over stone arch.",
      ],
      [
        "At Amber Crossing, Moon-Watch lantern dims over stone arch.",
        "At Amber Crossing, Moon‑Watch lantern dims over stone arch.",
      ],
    ] as const;
    for (const [previous, candidate] of cases) {
      expect(validateStoryBeatResultV1(previous, typographyFacts)).toBe(previous);
      expect(validateStoryBeatResultV1(candidate, typographyFacts)).toBe(candidate);
      expect(storyBeatDraftEchoReasonV1(
        signature(candidate),
        typographyFacts,
        [signature(previous)],
      )).toBe("recent-echo");
    }
  });

  it("applies the inclusive 0.80 multiset-Dice threshold only from four content tokens", () => {
    const previous = signature("alpha alpha beta gamma delta.");
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha beta beta gamma delta."),
      facts,
      [previous],
    )).toBe("recent-echo");
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha beta beta beta gamma delta."),
      facts,
      [previous],
    )).toBeNull();
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha gamma beta."),
      facts,
      [signature("alpha beta gamma.")],
    )).toBeNull();
  });

  it("excludes each mandatory location from recent similarity", () => {
    const location = "Silent Amber Archive Tower";
    const localFacts = {
      ...facts,
      location,
      action: "Rain settles.",
      consequence: "Wind rises.",
    };
    expect(storyBeatDraftEchoReasonV1(
      signature(`At ${location}, wind rises.`, location),
      localFacts,
      [signature(`At ${location}, rain settles.`, location)],
    )).toBeNull();
  });

  it("preserves repeated location words when they carry story meaning", () => {
    const location = "Bell Tower";
    const semanticFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      location,
      headline: "The eastern iron gate stirs.",
      action: "Bell opens the old eastern iron gate.",
      consequence: "Tower opens the old eastern iron gate.",
    };
    const previous = `At ${location}, bell opens old eastern iron gate.`;
    const candidate = `At ${location}, tower opens old eastern iron gate.`;

    expect(validateStoryBeatResultV1(previous, semanticFacts)).toBe(previous);
    expect(validateStoryBeatResultV1(candidate, semanticFacts)).toBe(candidate);
    expect(storyBeatDraftEchoReasonV1(
      signature(candidate, location),
      semanticFacts,
      [signature(previous, location)],
    )).toBeNull();
  });

  it("still rejects a headline when its subject repeats a location word", () => {
    const location = "Bell Tower";
    const localFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      location,
      headline: "Tower falls.",
      action: "Tower falls beside the bell.",
      consequence: "The eastern path opens.",
    };
    const candidate = `At ${location}, tower falls.`;

    expect(validateStoryBeatResultV1(candidate, localFacts)).toBe(candidate);
    expect(storyBeatDraftEchoReasonV1(
      signature(candidate, location),
      localFacts,
      [],
    )).toBe("headline-echo");

    const suffixCandidate = `Tower falls at ${location}.`;
    expect(validateStoryBeatResultV1(suffixCandidate, localFacts))
      .toBe(suffixCandidate);
    expect(storyBeatDraftEchoReasonV1(
      signature(suffixCandidate, location),
      localFacts,
      [],
    )).toBe("headline-echo");
  });

  it("requires an inclusive 0.75 length ratio before near-repeat rejection", () => {
    const candidate = signature("alpha beta gamma delta epsilon zeta.");
    expect(storyBeatDraftEchoReasonV1(
      candidate,
      facts,
      [signature("alpha beta gamma delta epsilon zeta zeta zeta.")],
    )).toBe("recent-echo");
    expect(storyBeatDraftEchoReasonV1(
      candidate,
      facts,
      [signature("alpha beta gamma delta epsilon zeta zeta zeta zeta.")],
    )).toBeNull();
  });

  it("keeps polarity and spatial relation changes materially distinct", () => {
    const cases = [
      {
        previous: "At Amber Crossing, the old bell is open by the tower.",
        candidate: "At Amber Crossing, the old bell is not open by the tower.",
        action: "The old bell is open by the tower.",
        consequence: "The old bell is not open by the tower.",
      },
      {
        previous: "At Amber Crossing, the bell glows inside the old tower.",
        candidate: "At Amber Crossing, the bell glows outside the old tower.",
        action: "The bell glows inside the old tower.",
        consequence: "The bell glows outside the old tower.",
      },
      {
        previous: "At Amber Crossing, the bridge stands before the tower.",
        candidate: "At Amber Crossing, the tower stands before the bridge.",
        action: "The bridge stands before the tower.",
        consequence: "The tower stands before the bridge.",
      },
      {
        previous: "At Amber Crossing, the bridge is not open and the tower is open.",
        candidate: "At Amber Crossing, the bridge is open and the tower is not open.",
        action: "The bridge is not open and the tower is open.",
        consequence: "The bridge is open and the tower is not open.",
      },
      {
        previous: "At Amber Crossing, the guard waits near the tower.",
        candidate: "At Amber Crossing, the guard waits at the tower.",
        action: "The guard waits near the tower.",
        consequence: "The guard waits at the tower.",
      },
    ] as const;
    for (const { previous, candidate, action, consequence } of cases) {
      const semanticFacts: StoryBeatPublicFactsV1 = {
        ...facts,
        action,
        consequence,
      };
      expect(validateStoryBeatResultV1(previous, semanticFacts)).toBe(previous);
      expect(validateStoryBeatResultV1(candidate, semanticFacts)).toBe(candidate);
      expect(storyBeatDraftEchoReasonV1(
        signature(candidate),
        semanticFacts,
        [signature(previous)],
      )).toBeNull();
    }
  });

  it("preserves nonadjacent role order in recent drafts and headlines", () => {
    const previous = "At Amber Crossing, bell and gate: bell covers gate.";
    const candidate = "At Amber Crossing, bell and gate: gate covers bell.";
    const previousFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: "Bell and gate: bell covers gate.",
      action: "Bell and gate: bell covers gate.",
      consequence: "The eastern path opens.",
    };
    const candidateFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: previousFacts.headline,
      action: "Bell and gate: gate covers bell.",
      consequence: "The eastern path opens.",
    };

    expect(validateStoryBeatResultV1(previous, previousFacts)).toBe(previous);
    expect(validateStoryBeatResultV1(candidate, candidateFacts)).toBe(candidate);
    expect(storyBeatDraftEchoReasonV1(
      signature(candidate),
      candidateFacts,
      [signature(previous)],
    )).toBeNull();
    expect(storyBeatDraftEchoReasonV1(
      signature(candidate),
      previousFacts,
      [],
    )).toBeNull();
  });

  it("keeps a scope-reversing headline materially distinct", () => {
    const semanticFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: "The bridge stands before the tower.",
      action: "The tower stands before the bridge.",
      consequence: "The eastern path opens.",
    };
    const candidate = "At Amber Crossing, the tower stands before the bridge.";

    expect(validateStoryBeatResultV1(candidate, semanticFacts)).toBe(candidate);
    expect(storyBeatDraftEchoReasonV1(
      signature(candidate),
      semanticFacts,
      [],
    )).toBeNull();
  });

  it("rejects ordered spatial and numeric headline abbreviations", () => {
    const cases = [
      {
        headline: "The old bridge stands before the tall tower.",
        candidate: "At Amber Crossing, bridge stands before tower.",
      },
      {
        headline: "The 12 marked stones meet 13 iron gates.",
        candidate: "At Amber Crossing, 12 stones meet 13 gates.",
      },
    ] as const;
    for (const { headline, candidate } of cases) {
      const localFacts: StoryBeatPublicFactsV1 = {
        ...facts,
        headline,
      };
      expect(validateStoryBeatResultV1(candidate, localFacts)).toBe(candidate);
      expect(storyBeatDraftEchoReasonV1(
        signature(candidate),
        localFacts,
        [],
      )).toBe("headline-echo");
    }
  });

  it("rejects model-valid demonstrative filler without erasing logical changes", () => {
    const restatements = [
      "At Amber Crossing, this old bridge answers.",
      "At Amber Crossing, that old bridge answers.",
      "At Amber Crossing, the old bridge answers here.",
    ] as const;
    for (const candidate of restatements) {
      expect(validateStoryBeatResultV1(candidate, facts)).toBe(candidate);
      expect(storyBeatDraftEchoReasonV1(
        signature(candidate),
        facts,
        [],
      )).toBe("headline-echo");
    }

    const pluralFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: "Old bridges answer.",
      action: "Old bridges answer across the crossing.",
      consequence: "The eastern path opens.",
    };
    for (const demonstrative of ["these", "those"]) {
      const candidate = `At Amber Crossing, ${demonstrative} old bridges answer.`;
      expect(validateStoryBeatResultV1(candidate, pluralFacts)).toBe(candidate);
      expect(storyBeatDraftEchoReasonV1(
        signature(candidate),
        pluralFacts,
        [],
      )).toBe("headline-echo");
    }

    const logicalFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: "The bridge opens and the gate closes.",
      action: "The bridge opens or the gate closes.",
      consequence: "The eastern path opens.",
    };
    const logicalChange = "At Amber Crossing, the bridge opens or the gate closes.";
    expect(validateStoryBeatResultV1(logicalChange, logicalFacts)).toBe(logicalChange);
    expect(storyBeatDraftEchoReasonV1(
      signature(logicalChange),
      logicalFacts,
      [],
    )).toBeNull();
    const repeatedClause =
      "At Amber Crossing, the bridge opens and the bridge opens.";
    expect(validateStoryBeatResultV1(repeatedClause, logicalFacts))
      .toBe(repeatedClause);
    expect(storyBeatDraftEchoReasonV1(
      signature(repeatedClause),
      logicalFacts,
      [],
    )).toBe("headline-echo");

    const reverseLogicalFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      headline: "The bridge opens or the gate closes.",
      action: "The bridge opens and the gate closes.",
      consequence: "The eastern path opens.",
    };
    const reverseLogicalChange =
      "At Amber Crossing, the bridge opens and the gate closes.";
    expect(validateStoryBeatResultV1(reverseLogicalChange, reverseLogicalFacts))
      .toBe(reverseLogicalChange);
    expect(storyBeatDraftEchoReasonV1(
      signature(reverseLogicalChange),
      reverseLogicalFacts,
      [],
    )).toBeNull();
  });

  it("keeps distinct numeric claim multisets materially different", () => {
    const previous = signature("alpha beta gamma delta 12.");
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha beta gamma delta 12!"),
      facts,
      [previous],
    )).toBe("recent-echo");
    for (const numeric of ["13", "012", "12.0", "-12", "−12"]) {
      expect(storyBeatDraftEchoReasonV1(
        signature(`alpha beta gamma delta ${numeric}.`),
        facts,
        [previous],
      ), numeric).toBeNull();
    }
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha beta gamma delta 13 12."),
      facts,
      [signature("alpha beta gamma delta 12 13.")],
    )).toBeNull();
    expect(storyBeatDraftEchoReasonV1(
      signature("alpha beta gamma delta 12."),
      facts,
      [signature("alpha beta gamma delta 12 12.")],
    )).toBeNull();
  });

  it("does not reinterpret a typographic hyphen as a numeric minus sign", () => {
    const signed = "At Amber Crossing, the count holds at -12 marked stones.";
    const unsigned = "At Amber Crossing, the count holds at ‐12 marked stones.";
    const signedFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      action: "The count holds at -12 marked stones.",
      consequence: "The eastern path opens.",
    };
    const unsignedFacts: StoryBeatPublicFactsV1 = {
      ...facts,
      action: "The count holds at ‐12 marked stones.",
      consequence: "The eastern path opens.",
    };

    expect(validateStoryBeatResultV1(signed, signedFacts)).toBe(signed);
    expect(validateStoryBeatResultV1(unsigned, unsignedFacts)).toBe(unsigned);
    expect(storyBeatDraftEchoReasonV1(
      signature(unsigned),
      unsignedFacts,
      [signature(signed)],
    )).toBeNull();
  });

  it("stores only frozen normalized signatures rather than original prose", () => {
    const original = "At Amber Crossing, Rain rings ✦.";
    const result = signature(original);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.tokens)).toBe(true);
    expect(Object.isFrozen(result.contentTokens)).toBe(true);
    expect(Object.isFrozen(result.numericTokens)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(original);
  });
});
