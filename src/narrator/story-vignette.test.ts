import { describe, expect, it } from "vitest";
import type { CreativeStoryFocus, CreativeStoryViewpoint } from "./creative-story";
import { createStoryVignette, type StoryVignette } from "./story-vignette";
import { createHeroInnerLifeVoice, type HeroValue } from "./story-voice";

type CompanionStatus = NonNullable<CreativeStoryViewpoint["companion"]>["status"];
const statuses: readonly CompanionStatus[] = ["travelling", "arrived", "injured", "arrived-injured"];
const viewpoint: CreativeStoryViewpoint = {
  hero: { name: "Mara", values: ["curiosity", "loyalty"] },
  companion: { name: "Rowan Vale", role: "miller", status: "travelling", purpose: "shared-road-oath", victories: 0 },
};
const neutralViewpoint: CreativeStoryViewpoint = { ...viewpoint, hero: { ...viewpoint.hero, values: [] } };

function withStatus(status: CompanionStatus): CreativeStoryViewpoint {
  return { ...viewpoint, companion: { ...viewpoint.companion!, status } };
}

function collect(focus: CreativeStoryFocus, captured: CreativeStoryViewpoint, count: number): readonly StoryVignette[] {
  return Array.from({ length: count }, (_, attempt) => {
    const passage = createStoryVignette({ viewpoint: captured, focus, identity: "captured:scene", attempt });
    expect(passage).not.toBeNull();
    return passage!;
  });
}

describe("authored emotional story vignettes", () => {
  it("retains sixteen distinct neutral/shared-road passages with only the existing authored output fields", () => {
    const passages = [
      ...collect("inner-life", neutralViewpoint, 4),
      ...statuses.flatMap((status) => collect("shared-road", withStatus(status), 3)),
    ];
    expect(passages).toHaveLength(16);
    expect(new Set(passages.map(({ id }) => id)).size).toBe(16);
    expect(new Set(passages.map(({ text }) => text)).size).toBe(16);
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    for (const passage of passages) {
      expect(Object.keys(passage).sort()).toEqual(["id", "text", "tone"]);
      expect(Object.isFrozen(passage)).toBe(true);
      expect(passage.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/u);
      expect([...segmenter.segment(passage.text)]).toHaveLength(2);
      expect(passage.text).toMatch(/\.$/u);
      expect(passage.text).toContain("Mara");
      expect(passage.text.length).toBeLessThan(500);
      expect(passage.text).not.toMatch(/[<>\r\n]|\b(?:he|she|his|her|bond score|romance|healed|recovered|dead|died|kissed|always|years ago)\b/iu);
    }
  });

  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("uses captured %s for two ordinary Inner life reflections", (value) => {
    const captured: CreativeStoryViewpoint = { ...viewpoint, hero: { ...viewpoint.hero, values: [value] } };
    const passages = collect("inner-life", captured, 2);
    expect(new Set(passages.map(({ id }) => id)).size).toBe(2);
    for (let attempt = 0; attempt < 2; attempt++) {
      const voice = createHeroInnerLifeVoice([value], "Mara", "captured:scene", attempt)!;
      expect(passages[attempt]).toEqual({ id: voice.id, text: voice.text, tone: "neutral" });
      expect(Object.isFrozen(passages[attempt])).toBe(true);
      expect(passages[attempt]!.text).not.toContain("Rowan Vale");
    }
    for (const status of statuses) {
      expect(collect("inner-life", { ...captured, companion: withStatus(status).companion }, 2)).toEqual(passages);
      expect(collect("shared-road", { ...captured, companion: withStatus(status).companion }, 3))
        .toEqual(collect("shared-road", withStatus(status), 3));
    }
  });

  it("retains the exact four neutral reflections for missing, malformed or hostile values", () => {
    const expected = collect("inner-life", neutralViewpoint, 4);
    expect(new Set(expected.map(({ id }) => id))).toEqual(new Set([
      "inner-life-unlit-lantern", "inner-life-private-measure", "inner-life-room-for-questions", "inner-life-two-wishes",
    ]));
    const throwing = ["loyalty"];
    Object.defineProperty(throwing, 0, { get() { throw new Error("invalid captured value"); } });
    for (const values of [undefined, null, [], "loyalty", ["unknown"], ["mercy", "unknown"], [null], throwing]) {
      const captured = { ...viewpoint, hero: { ...viewpoint.hero, values } } as unknown as CreativeStoryViewpoint;
      expect(collect("inner-life", captured, 4)).toEqual(expected);
    }
  });

  it("freezes value-shaped prose without retaining mutable names or value lists", () => {
    const capturedValues: HeroValue[] = ["mercy"];
    const captured: CreativeStoryViewpoint = { ...viewpoint, hero: { name: "Mara", values: capturedValues } };
    const passage = createStoryVignette({ viewpoint: captured, focus: "inner-life", identity: "captured:scene", attempt: 0 })!;
    const before = { ...passage };
    capturedValues[0] = "courage";
    (captured.hero as { name: string }).name = "Changed later";
    expect(passage).toEqual(before);
    expect(passage.id).toMatch(/^inner-life-mercy-/u);
    expect(passage.text).toContain("Mara");
    expect(passage.text).not.toContain("Changed later");
  });

  it("gives Inner life four hero-only interpretations independent of companion status", () => {
    const solo = { ...viewpoint, companion: null };
    const passages = collect("inner-life", solo, 4);
    expect(new Set(passages.map(({ id }) => id)).size).toBe(4);
    for (const passage of passages) {
      expect(passage.tone).toBe("neutral");
      expect(passage.text).not.toContain("Rowan Vale");
      expect(passage.text).not.toMatch(/\b(?:injur\w*|arrival|destination|depart\w*|victor\w*)\b/iu);
    }
    for (const status of statuses) expect(collect("inner-life", withStatus(status), 4)).toEqual(passages);
  });

  it.each(statuses)("keeps the three %s passages anchored to both captured names and that status", (status) => {
    const passages = collect("shared-road", withStatus(status), 3);
    expect(new Set(passages.map(({ id }) => id)).size).toBe(3);
    for (const passage of passages) {
      expect(passage.text).toContain("Mara");
      expect(passage.text).toContain("Rowan Vale");
      expect(passage.tone).toBe(status.includes("injured") ? "care" : "trust");
      if (status.includes("injured")) expect(passage.text).toMatch(/\binjur(?:y|ed)\b/iu);
      else expect(passage.text).not.toMatch(/\binjur\w*\b/iu);
      if (status.startsWith("arrived")) expect(passage.text).toContain("oath's destination");
      else expect(passage.text).not.toMatch(/\b(?:arriv\w*|reached|farewell|departed)\b/iu);
      // These checks protect authored corpus promises; they are not a general prose truth validator.
      expect(passage.text).not.toMatch(/\b(?:newly|first met|met again|oath fulfilled|oath was fulfilled|will recover|would recover|will heal|would heal)\b/iu);
    }
  });

  it("respects Scene imagery, missing viewpoint and Shared road without a companion", () => {
    for (const focus of ["inner-life", "shared-road", "scene"] as const) {
      expect(createStoryVignette({ viewpoint: null, focus, identity: "scene", attempt: 0 })).toBeNull();
    }
    expect(createStoryVignette({ viewpoint, focus: "scene", identity: "scene", attempt: 0 })).toBeNull();
    expect(createStoryVignette({ viewpoint: { ...viewpoint, companion: null }, focus: "shared-road", identity: "scene", attempt: 0 })).toBeNull();
  });

  it("is stable for the same identity and rotates each complete bucket before repeating", () => {
    for (const [focus, count] of [["inner-life", 4], ["shared-road", 3]] as const) {
      for (const status of statuses) {
        const captured = withStatus(status);
        const input = { viewpoint: captured, focus, identity: "captured:scene", attempt: 0 };
        const passages = collect(focus, captured, count);
        expect(createStoryVignette(input)).toEqual(passages[0]);
        expect(createStoryVignette({ ...input, attempt: count })).toEqual(passages[0]);
        for (let attempt = 1; attempt <= count; attempt++) {
          expect(createStoryVignette({ ...input, attempt })?.id).not.toBe(passages[attempt - 1]!.id);
        }
      }
    }
    const starts = Array.from({ length: 32 }, (_, index) => createStoryVignette({
      viewpoint, focus: "inner-life", identity: `scene:${index}`, attempt: 0,
    })?.id);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });

  it("treats invalid attempt counters as the first attempt and safely wraps large valid counters", () => {
    for (const focus of ["inner-life", "shared-road"] as const) {
      const input = { viewpoint, focus, identity: "scene", attempt: 0 };
      for (const attempt of [-1, NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(createStoryVignette({ ...input, attempt })).toEqual(createStoryVignette(input));
      }
      const count = focus === "inner-life" ? 4 : 3;
      expect(createStoryVignette({ ...input, attempt: Number.MAX_SAFE_INTEGER }))
        .toEqual(createStoryVignette({ ...input, attempt: Number.MAX_SAFE_INTEGER % count }));
    }
  });

  it("copies names without changing inputs or leaking identity, role, values or victory counts", () => {
    const captured: CreativeStoryViewpoint = {
      hero: { name: "Ari O'Vale", values: ["mercy"] },
      companion: { name: "Jun Ash-Brook", role: "private-test-role", status: "injured", purpose: "shared-road-oath", victories: 987654 },
    };
    const before = structuredClone(captured);
    const result = createStoryVignette({ viewpoint: captured, focus: "shared-road", identity: "private:campaign:source", attempt: 0 })!;
    expect(result.text).toContain("Ari O'Vale");
    expect(result.text).toContain("Jun Ash-Brook");
    expect(JSON.stringify(result)).not.toMatch(/private:campaign:source|private-test-role|987654|mercy/u);
    expect(captured).toEqual(before);
    (captured.hero as { name: string }).name = "Changed later";
    expect(result.text).toContain("Ari O'Vale");
    expect(result.text).not.toContain("Changed later");
  });
});
