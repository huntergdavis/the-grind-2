import { describe, expect, it } from "vitest";
import { createHeroFarewellVoice, createHeroInnerLifeVoice, createHeroStoryVoice, normalizeStoryVoiceValue, type HeroValue } from "./story-voice";

const values = ["curiosity", "loyalty", "mercy", "courage"] as const;

describe("recorded hero value inspiration", () => {
  it("offers eight distinct, frozen two-sentence solo reflections without inventing events or another character", () => {
    const ids = new Set<string>();
    const passages = new Set<string>();
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const cues: Record<HeroValue, RegExp> = {
      curiosity: /question|answer/u, loyalty: /relying|loyalty/u,
      mercy: /gentle|generous/u, courage: /brave|bravery/u,
    };
    for (const value of values) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const voice = createHeroInnerLifeVoice([value], "Mira", "ordinary-original", attempt)!;
        expect(voice.value).toBe(value);
        expect(voice.id).toMatch(new RegExp(`^inner-life-${value}-[a-z-]+$`, "u"));
        expect(voice.text).toContain("Mira");
        expect(voice.text).toMatch(cues[value]);
        expect([...segmenter.segment(voice.text)]).toHaveLength(2);
        expect(voice.text.length).toBeLessThan(300);
        expect(voice.text).not.toMatch(/[<>\r\n]|\b(?:he|she|his|her|injured|healed|died|victory|oath|years ago|always|forever|romance)\b/iu);
        expect(Object.keys(voice).sort()).toEqual(["id", "text", "value"]);
        expect(Object.isFrozen(voice)).toBe(true);
        ids.add(voice.id);
        passages.add(voice.text);
      }
    }
    expect(ids.size).toBe(8);
    expect(passages.size).toBe(8);
  });

  it("keeps solo value and variant selection aligned with the unchanged milestone helpers", () => {
    for (const captured of [["loyalty"], ["curiosity", "mercy"], [...values]] satisfies HeroValue[][]) {
      const count = captured.length * 2;
      const voices = Array.from({ length: count }, (_, attempt) =>
        createHeroInnerLifeVoice(captured, "Mira", "same-capture", attempt)!);
      expect(new Set(voices.map(({ value }) => value))).toEqual(new Set(captured));
      expect(new Set(voices.map(({ id }) => id)).size).toBe(count);
      expect(createHeroInnerLifeVoice(captured, "Mira", "same-capture", count)).toEqual(voices[0]);
      for (let attempt = 0; attempt < count; attempt++) {
        expect(voices[attempt]!.value).toBe(createHeroStoryVoice(captured, "healthy", "same-capture", attempt)!.value);
        expect(voices[attempt]!.value).toBe(createHeroFarewellVoice(captured, "Mira", "Tamsin", "same-capture", attempt)!.value);
        expect(createHeroInnerLifeVoice([...captured].reverse().concat(captured), "Mira", "same-capture", attempt))
          .toEqual(voices[attempt]);
      }
    }
  });

  it.each([undefined, null, [], "loyalty", {}, ["unknown"], ["mercy", "unknown"], [null], new Array(1),
    Array.from({ length: 17 }, () => "courage")].map((value) => [value]))(
    "keeps absent or malformed solo values neutral: %j", (captured) => {
      expect(createHeroInnerLifeVoice(captured, "Mira", "neutral", 0)).toBeNull();
    },
  );

  it("bounds hostile solo values and never invokes a caller's iterator", () => {
    const throwing = ["loyalty"];
    Object.defineProperty(throwing, 0, { get() { throw new Error("invalid captured value"); } });
    expect(createHeroInnerLifeVoice(throwing, "Mira", "bounded", 0)).toBeNull();
    const captured = ["loyalty"];
    Object.defineProperty(captured, Symbol.iterator, { value() { throw new Error("must not invoke caller iteration"); } });
    const result = createHeroInnerLifeVoice(captured, "Mira", "bounded", 0);
    expect(result).toEqual(createHeroInnerLifeVoice(["loyalty"], "Mira", "bounded", 0));
    captured[0] = "mercy";
    expect(result?.value).toBe("loyalty");
  });

  it("keeps solo rotation deterministic for invalid and very large attempts", () => {
    for (const attempt of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(createHeroInnerLifeVoice(values, "Mira", "stable", attempt))
        .toEqual(createHeroInnerLifeVoice(values, "Mira", "stable", 0));
    }
    expect(createHeroInnerLifeVoice(values, "Mira", "stable", Number.MAX_SAFE_INTEGER))
      .toEqual(createHeroInnerLifeVoice(values, "Mira", "stable", Number.MAX_SAFE_INTEGER % 8));
  });

  it("preserves fixed v0.5.105 first-victory text and rotation examples after sharing selection", () => {
    expect(createHeroStoryVoice(values, "healthy", "stable", 0)).toEqual({ value: "mercy",
      text: "I want to enjoy this relief without letting victory make gentleness feel foolish." });
    expect(createHeroStoryVoice(values, "healthy", "stable", 1)).toEqual({ value: "courage",
      text: "I want to welcome this pride without mistaking it for the end of fear." });
    expect(createHeroStoryVoice(values, "healthy", "stable", 4)).toEqual({ value: "mercy",
      text: "I hope there is room for kindness inside the pride I feel." });
    expect(createHeroStoryVoice(values, "injured", "immutable", 0)).toEqual({ value: "courage",
      text: "I hope being brave can mean facing this worry without pretending it is small." });
    expect(createHeroStoryVoice(["curiosity", "mercy"], "healthy", "stable", 2)).toEqual({ value: "curiosity",
      text: "I wonder how much of my excitement is discovery, and how much is simply not being alone." });
  });

  it("provides eight distinct farewell reflections with the same closed value and variant cycle", () => {
    const unique = new Set<string>();
    const cues: Record<HeroValue, RegExp> = { curiosity: /questions|understand/u, loyalty: /caring|oath/u,
      mercy: /dignity|tenderness/u, courage: /fear|uncertainty/u };
    for (const value of values) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const voice = createHeroFarewellVoice([value], "Mira", "Tamsin", "farewell-original", attempt)!;
        expect(voice.value).toBe(value);
        expect(voice.text).toContain("Mira");
        expect(voice.text).toContain("Tamsin");
        expect(voice.text).toContain("wounded but alive");
        expect(voice.text).toMatch(/leaving|left|departing/u);
        expect(voice.text).toMatch(cues[value]);
        expect(voice.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(1);
        expect(voice.text.split(/\s+/u).length).toBeLessThanOrEqual(28);
        expect(voice.text).not.toMatch(/always|forever|will recover|healed|dead|romance|betray|abandon|fault|deserved|[“”"]/iu);
        expect(Object.isFrozen(voice)).toBe(true);
        unique.add(voice.text);
      }
    }
    expect(unique.size).toBe(8);
    for (let attempt = 0; attempt < 8; attempt++) {
      const firstVictory = createHeroStoryVoice(values, "healthy", "same-capture", attempt)!;
      const farewell = createHeroFarewellVoice(values, "Mira", "Tamsin", "same-capture", attempt)!;
      expect(farewell.value).toBe(firstVictory.value);
      expect(createHeroFarewellVoice(values, "Mira", "Tamsin", "same-capture", attempt + 8)).toEqual(farewell);
    }
  });

  it.each([undefined, null, [], "loyalty", ["unknown"], ["mercy", "unknown"], [null],
    Array.from({ length: 17 }, () => "courage")].map((value) => [value]))(
    "gives farewell the same neutral fallback for malformed recorded values %j", (captured) => {
      expect(createHeroFarewellVoice(captured, "Mira", "Tamsin", "neutral", 0)).toBeNull();
    },
  );

  it("freezes the selected farewell value without retaining caller arrays or inferring a companion trait", () => {
    const captured: HeroValue[] = ["mercy", "curiosity", "mercy"];
    const result = createHeroFarewellVoice(captured, "Mira", "Tamsin", "frozen", 0)!;
    expect(result).toEqual(createHeroFarewellVoice(["curiosity", "mercy"], "Mira", "Tamsin", "frozen", 0));
    expect(captured).toEqual(["mercy", "curiosity", "mercy"]);
    captured.splice(0, captured.length, "courage");
    expect(["curiosity", "mercy"]).toContain(result.value);
    expect(Object.keys(result).sort()).toEqual(["text", "value"]);
    expect(Object.isFrozen(result)).toBe(true);
  });

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
