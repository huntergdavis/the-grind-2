import { describe, expect, it } from "vitest";
import type { CreativeStoryFocus, CreativeStoryViewpoint } from "./creative-story";
import { createStoryVignette, type StoryVignette } from "./story-vignette";

type CompanionStatus = NonNullable<CreativeStoryViewpoint["companion"]>["status"];
const statuses: readonly CompanionStatus[] = ["travelling", "arrived", "injured", "arrived-injured"];
const viewpoint: CreativeStoryViewpoint = {
  hero: { name: "Mara", values: ["curiosity", "loyalty"] },
  companion: { name: "Rowan Vale", role: "miller", status: "travelling", purpose: "shared-road-oath", victories: 0 },
};

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
  it("contains sixteen distinct, frozen two-sentence passages with only authored output fields", () => {
    const passages = [
      ...collect("inner-life", viewpoint, 4),
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
