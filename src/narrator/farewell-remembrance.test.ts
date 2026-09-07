import { describe, expect, it } from "vitest";
import { captureFarewellRemembrance, createFarewellRemembranceVignette, type FarewellRemembrance } from "./farewell-remembrance";
import { createHeroFarewellVoice, type HeroValue } from "./story-voice";

function fixture() {
  return {
    kind: "farewell-remembrance", campaignId: "synthetic-campaign", eventId: "synthetic-farewell", tick: 12,
    heroName: "Mira", companionName: "Tamsin",
    oath: { location: "Copper Hollow", headline: "Tamsin joins the road.", tick: 2 },
    farewell: { location: "Dunford", headline: "Tamsin's Shared Road Oath is complete.", tick: 12 },
  } satisfies FarewellRemembrance;
}

const legacyParagraphs = [
  "Mira remembered the oath with Tamsin at Copper Hollow, and how different those words felt beside this wounded farewell. Tamsin was leaving alive; relief and worry did not have to agree before Mira could feel them both.",
  "The oath at Copper Hollow returned to Mira as Tamsin left, wounded but alive. Reaching a goodbye did not make the concern disappear; it gave gratitude and helplessness somewhere new to meet.",
  "Mira thought of the road promised with Tamsin at Copper Hollow, now set beside a farewell neither relief nor worry could simplify. Tamsin was still alive and injured, and caring did not supply an answer to what came next.",
];

describe("authored farewell remembrance wording", () => {
  it("keeps all three original neutral paragraph bytes and source IDs unchanged", () => {
    for (const focus of ["inner-life", "shared-road"] as const) {
      const actual = [0, 1, 2].map((attempt) => createFarewellRemembranceVignette(fixture(), focus, "neutral-bytes", attempt)!);
      expect(actual.map(({ id }) => id).sort()).toEqual(["farewell-remembrance-1", "farewell-remembrance-2", "farewell-remembrance-3"]);
      for (const result of actual) {
        expect(result.text).toBe(legacyParagraphs[Number(result.id.slice(-1)) - 1]);
        expect(Object.keys(result).sort()).toEqual(["id", "text", "tone"]);
      }
    }
  });

  it("changes only the second sentence, with all eight value reflections retaining a living injured departure", () => {
    const seconds = new Set<string>();
    const source = fixture();
    const before = structuredClone(source);
    for (const value of ["curiosity", "loyalty", "mercy", "courage"] as const) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const neutral = createFarewellRemembranceVignette(source, "shared-road", "value-shaped", attempt)!;
        const result = createFarewellRemembranceVignette(source, "shared-road", "value-shaped", attempt, [value])!;
        const opening = neutral.text.slice(0, neutral.text.indexOf(". ") + 2);
        const reflection = createHeroFarewellVoice([value], source.heroName, source.companionName, "value-shaped", attempt)!;
        expect(result).toEqual({ id: neutral.id, tone: "care", voiceValue: value, text: opening + reflection.text });
        expect(result.text).toContain(source.heroName);
        expect(result.text).toContain(source.companionName);
        expect(result.text).toContain(source.oath.location);
        expect(result.text).toMatch(/wounded but alive/u);
        expect(result.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(2);
        expect(result.text.length).toBeLessThan(440);
        expect(Object.isFrozen(result)).toBe(true);
        seconds.add(reflection.text);
      }
    }
    expect(seconds.size).toBe(8);
    expect(source).toEqual(before);
    expect(source).not.toHaveProperty("voiceValue");
  });

  it.each([undefined, null, [], "loyalty", {}, ["unknown"], ["loyalty", "unknown"], [null],
    ["Courage"], Array.from({ length: 17 }, () => "mercy")].map((value) => [value]))(
    "keeps neutral bytes for absent or malformed values %j", (values) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const neutral = createFarewellRemembranceVignette(fixture(), "inner-life", "neutral-invalid", attempt);
        const actual = createFarewellRemembranceVignette(fixture(), "inner-life", "neutral-invalid", attempt, values);
        expect(JSON.stringify(actual)).toBe(JSON.stringify(neutral));
      }
    },
  );

  it("never places invented value metadata inside the public-history packet", () => {
    const source = { ...fixture(), voiceValue: "mercy" };
    const captured = captureFarewellRemembrance(source);
    expect(captured).toEqual(fixture());
    expect(captured).not.toHaveProperty("voiceValue");
    const values: HeroValue[] = ["curiosity", "mercy"];
    const result = createFarewellRemembranceVignette(captured, "inner-life", "immutable", 0, values)!;
    const before = structuredClone(result);
    expect(values).toContain(result.voiceValue);
    values.splice(0, values.length, "courage");
    expect(result).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("synthetic-");
    expect(captured).toEqual(fixture());
  });

  it("does not activate Scene imagery or missing memory even with valid values", () => {
    expect(createFarewellRemembranceVignette(fixture(), "scene", "scene", 0, ["loyalty"])).toBeNull();
    expect(createFarewellRemembranceVignette(null, "inner-life", "missing", 0, ["loyalty"])).toBeNull();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("preserves the value-shaped initial rotation for invalid attempt %s", (attempt) => {
    expect(createFarewellRemembranceVignette(fixture(), "shared-road", "invalid-attempt", attempt, ["curiosity", "mercy"]))
      .toEqual(createFarewellRemembranceVignette(fixture(), "shared-road", "invalid-attempt", 0, ["curiosity", "mercy"]));
  });

  it.each(["inner-life", "shared-road"] as const)("provides three repeatable two-sentence care variants for %s", (focus) => {
    const remembrance = fixture();
    const before = structuredClone(remembrance);
    const variants = [0, 1, 2].map((attempt) => createFarewellRemembranceVignette(remembrance, focus, "synthetic-source", attempt)!);
    expect(new Set(variants.map((value) => value.id)).size).toBe(3);
    expect(new Set(variants.map((value) => value.text)).size).toBe(3);
    for (const [attempt, value] of variants.entries()) {
      expect(value).toEqual(createFarewellRemembranceVignette(remembrance, focus, "synthetic-source", attempt));
      expect(value.tone).toBe("care");
      expect(value.text).toContain("Mira");
      expect(value.text).toContain("Tamsin");
      expect(value.text).toContain("Copper Hollow");
      expect(value.text).toMatch(/wounded|injured/u);
      expect(value.text).toContain("alive");
      expect(value.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(2);
      expect(value.text).not.toMatch(/\b(?:healed|recovered|died|dead|reunited)\b/iu);
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(createFarewellRemembranceVignette(remembrance, focus, "synthetic-source", 3)).toEqual(variants[0]);
    expect(remembrance).toEqual(before);
  });

  it("does not turn missing remembrance or Scene imagery into a memory", () => {
    expect(createFarewellRemembranceVignette(null, "inner-life", "synthetic-source", 0)).toBeNull();
    expect(createFarewellRemembranceVignette(fixture(), "scene", "synthetic-source", 0)).toBeNull();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("normalizes invalid attempt %s to the first rotation", (attempt) => {
    expect(createFarewellRemembranceVignette(fixture(), "inner-life", "synthetic-source", attempt))
      .toEqual(createFarewellRemembranceVignette(fixture(), "inner-life", "synthetic-source", 0));
  });

  it("captures only its bounded fields and freezes both nested record excerpts", () => {
    const source = { ...fixture(), ignored: "private-fixture-field", oath: { ...fixture().oath, ignored: "private-fixture-field" } };
    const captured = captureFarewellRemembrance(source);
    expect(captured).toEqual(fixture());
    expect([captured, captured.oath, captured.farewell].every(Object.isFrozen)).toBe(true);
    expect(captured.oath).not.toBe(source.oath);
    expect(captured.farewell).not.toBe(source.farewell);
    source.heroName = "Changed hero";
    source.oath.location = "Changed oath";
    source.farewell.headline = "Changed goodbye";
    expect(captured).toEqual(fixture());
    expect(JSON.stringify(captured)).not.toContain("private-fixture-field");
  });
});
