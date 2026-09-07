import { describe, expect, it } from "vitest";
import { createHeroStoryVoice, normalizeStoryVoiceValue, type HeroValue } from "./story-voice";

const values = ["curiosity", "loyalty", "mercy", "courage"] as const;

describe("recorded hero value inspiration", () => {
  it.each(values)("accepts the exact recorded %s value", (value) => {
    expect(normalizeStoryVoiceValue(value)).toBe(value);
  });

  it.each([undefined, null, "", "Curiosity", "courage ", "strongest", "miller", "affection", 1, true, {}, ["loyalty"]].map((value) => [value]))(
    "rejects unsupported or inferred value %j without coercion", (value) => {
      expect(normalizeStoryVoiceValue(value)).toBeNull();
    },
  );

  it("provides sixteen original, short, distinct value-shaped first-person thoughts", () => {
    const unique = new Set<string>();
    const cues: Record<HeroValue, RegExp> = {
      curiosity: /understand|wonder|question/u, loyalty: /trust|doubt|company|dependable/u,
      mercy: /gentleness|kindness|care|gentle/u, courage: /fear|brave|courage/u,
    };
    for (const condition of ["healthy", "injured"] as const) {
      for (const value of values) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const voice = createHeroStoryVoice([value], condition, "original-thoughts", attempt)!;
          expect(voice.value).toBe(value);
          expect(voice.text).toMatch(/^I /u);
          expect(voice.text).toMatch(cues[value]);
          expect(voice.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(1);
          expect(voice.text.split(/\s+/u).length).toBeLessThanOrEqual(18);
          expect(voice.text.length).toBeLessThanOrEqual(240);
          expect(voice.text).not.toMatch(/always|forever|recover|healed|will be fine|strongest|saved the party|romance|private-|\d/iu);
          if (condition === "healthy") expect(voice.text).not.toMatch(/injur|pain|hurt|wound/iu);
          expect(Object.isFrozen(voice)).toBe(true);
          unique.add(voice.text);
        }
      }
    }
    expect(unique.size).toBe(16);
  });

  it("selects only captured values without giving duplicates or source order extra weight", () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const expected = createHeroStoryVoice(["curiosity", "mercy"], "healthy", "same-person", attempt);
      expect(createHeroStoryVoice(["mercy", "curiosity", "mercy"], "healthy", "same-person", attempt)).toEqual(expected);
      expect(["curiosity", "mercy"]).toContain(expected?.value);
    }
  });

  it("cycles every captured value and both wordings without locking two-value heroes to one variant", () => {
    for (const captured of [["loyalty"], ["curiosity", "mercy"], [...values]] satisfies HeroValue[][]) {
      const voices = Array.from({ length: captured.length * 2 }, (_, attempt) =>
        createHeroStoryVoice(captured, "injured", "stable-cycle", attempt)!);
      expect(new Set(voices.map(({ value }) => value))).toEqual(new Set(captured));
      expect(new Set(voices.map(({ text }) => text)).size).toBe(captured.length * 2);
      expect(createHeroStoryVoice(captured, "injured", "stable-cycle", captured.length * 2)).toEqual(voices[0]);
    }
  });

  it("uses identity for stable variety rather than treating the first listed value as dominant", () => {
    const chosen = new Set(Array.from({ length: 16 }, (_, index) =>
      createHeroStoryVoice(["curiosity", "mercy"], "healthy", `identity-${index}`, 0)?.value));
    expect(chosen).toEqual(new Set(["curiosity", "mercy"]));
    expect(createHeroStoryVoice(values, "healthy", "stable", 3)).toEqual(createHeroStoryVoice(values, "healthy", "stable", 3));
  });

  it.each([undefined, null, [], "loyalty", {}, { values: ["loyalty"] }, ["unknown"], ["loyalty", "unknown"],
    ["loyalty", null], ["loyalty", 1], ["LOyalty"], ["mercy "], new Array(1), Array.from({ length: 17 }, () => "loyalty")].map((value) => [value]))(
    "returns neutral for absent, malformed, unknown or overlong values %j", (captured) => {
      expect(createHeroStoryVoice(captured, "healthy", "stable", 0)).toBeNull();
    },
  );

  it("fails closed on a throwing captured value accessor", () => {
    const captured = ["loyalty"];
    Object.defineProperty(captured, 0, { get() { throw new Error("invalid captured value"); } });
    expect(createHeroStoryVoice(captured, "healthy", "stable", 0)).toBeNull();
  });

  it("reads only the bounded indexed values, never a caller-supplied iterator", () => {
    const captured = ["loyalty"];
    Object.defineProperty(captured, Symbol.iterator, { value() { throw new Error("must not invoke caller iteration"); } });
    expect(createHeroStoryVoice(captured, "healthy", "bounded", 0))
      .toEqual(createHeroStoryVoice(["loyalty"], "healthy", "bounded", 0));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("uses initial rotation for invalid attempt %s", (attempt) => {
    expect(createHeroStoryVoice(values, "healthy", "stable", attempt))
      .toEqual(createHeroStoryVoice(values, "healthy", "stable", 0));
  });

  it("keeps the largest safe attempt bounded and leaves caller values untouched", () => {
    const captured: HeroValue[] = ["mercy", "loyalty"];
    const before = [...captured];
    const result = createHeroStoryVoice(captured, "injured", "immutable", Number.MAX_SAFE_INTEGER)!;
    expect(captured).toEqual(before);
    expect(before).toContain(result.value);
    captured.splice(0, captured.length, "curiosity");
    expect(before).toContain(result.value);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
