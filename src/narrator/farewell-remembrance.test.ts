import { describe, expect, it } from "vitest";
import { captureFarewellRemembrance, createFarewellRemembranceVignette, type FarewellRemembrance } from "./farewell-remembrance";

function fixture() {
  return {
    kind: "farewell-remembrance", campaignId: "synthetic-campaign", eventId: "synthetic-farewell", tick: 12,
    heroName: "Mira", companionName: "Tamsin",
    oath: { location: "Copper Hollow", headline: "Tamsin joins the road.", tick: 2 },
    farewell: { location: "Dunford", headline: "Tamsin's Shared Road Oath is complete.", tick: 12 },
  } satisfies FarewellRemembrance;
}

describe("authored farewell remembrance wording", () => {
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
