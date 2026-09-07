import { describe, expect, it } from "vitest";
import { captureFirstSharedVictory, createFirstSharedVictoryVignette, type FirstSharedVictory } from "./first-shared-victory";

const packet: FirstSharedVictory = {
  kind: "first-shared-victory", campaignId: "private-campaign", eventId: "private-event", tick: 12,
  combatId: "private-combat", heroName: "Mira", companionName: "Neris", companionId: "private-companion",
  condition: "healthy", battle: { location: "Amber Crossing", headline: "The battle ends in victory.", tick: 12 },
};

describe("authored first shared-victory reactions", () => {
  it("captures only the packet shape and freezes nested provenance independently", () => {
    const source = { ...structuredClone(packet), privateMood: "not a recorded feeling" };
    const captured = captureFirstSharedVictory(source);
    expect(captured).toEqual(packet);
    expect(captured).not.toBe(source);
    expect(captured.battle).not.toBe(source.battle);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.battle)).toBe(true);
    (source.battle as { headline: string }).headline = "Changed caller record";
    expect(captured.battle.headline).toBe(packet.battle.headline);
  });

  it("provides six distinct original two-sentence reactions, grounded in the captured condition and both names", () => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const condition of ["healthy", "injured"] as const) {
      const source = { ...packet, condition };
      const before = structuredClone(source);
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = createFirstSharedVictoryVignette(source, "shared-road", "stable-identity", attempt)!;
        ids.add(result.id);
        texts.add(result.text);
        expect(result.text).toContain("Mira");
        expect(result.text).toContain("Neris");
        expect(result.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(2);
        expect(result.text.length).toBeLessThan(600);
        expect(result.tone).toBe(condition === "injured" ? "care" : "trust");
        expect(result.text).not.toMatch(/private-|romance|forever|recover|healed|killed|strongest|saved the party|always trusted|will be fine/iu);
        if (condition === "injured") expect(result.text).toMatch(/injur/iu);
        expect(Object.isFrozen(result)).toBe(true);
      }
      expect(source).toEqual(before);
    }
    expect(ids.size).toBe(6);
    expect(texts.size).toBe(6);
  });

  it("respects Scene imagery and missing captured milestones", () => {
    expect(createFirstSharedVictoryVignette(packet, "scene", "scene", 0)).toBeNull();
    expect(createFirstSharedVictoryVignette(null, "inner-life", "missing", 0)).toBeNull();
    expect(createFirstSharedVictoryVignette(packet, "inner-life", "source", 0)).not.toBeNull();
  });

  it("is stable and rotates without adjacent repeats within each three-entry condition bucket", () => {
    for (const condition of ["healthy", "injured"] as const) {
      const source = { ...packet, condition };
      const results = Array.from({ length: 7 }, (_, attempt) => createFirstSharedVictoryVignette(source, "inner-life", "stable", attempt));
      expect(results[0]).toEqual(results[3]);
      for (let index = 1; index < results.length; index++) expect(results[index]).not.toEqual(results[index - 1]);
      expect(createFirstSharedVictoryVignette(source, "inner-life", "stable", 0)).toEqual(results[0]);
    }
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("falls back safely for invalid attempt %s", (attempt) => {
    expect(createFirstSharedVictoryVignette(packet, "inner-life", "stable", attempt))
      .toEqual(createFirstSharedVictoryVignette(packet, "inner-life", "stable", 0));
  });
});
