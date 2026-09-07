import { describe, expect, it } from "vitest";
import type { FirstSharedVictory } from "./first-shared-victory";
import { storyDuetText } from "./story-duet";
import { createStoryDuetVignette } from "./story-duet-vignette";
import { createHeroStoryVoice, type HeroValue } from "./story-voice";

const packet: FirstSharedVictory = {
  kind: "first-shared-victory", campaignId: "private-campaign", eventId: "private-event", tick: 12,
  combatId: "private-combat", heroName: "Mira", companionName: "Neris", companionId: "private-companion",
  condition: "healthy", battle: { location: "Amber Crossing", headline: "The battle ends in victory.", tick: 12 },
};

describe("authored role-bound first-victory duets", () => {
  it("changes only the hero's authored thought and inspiration credit for captured values", () => {
    for (const condition of ["healthy", "injured"] as const) {
      for (const value of ["curiosity", "loyalty", "mercy", "courage"] as const) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const source = { ...packet, condition };
          const before = structuredClone(source);
          const neutral = createStoryDuetVignette(source, "shared-road", "unchanged-companion", attempt)!;
          const result = createStoryDuetVignette(source, "shared-road", "unchanged-companion", attempt, [value])!;
          expect(result.duet.hero).toEqual({ name: packet.heroName, voiceValue: value,
            text: createHeroStoryVoice([value], condition, "unchanged-companion", attempt)!.text });
          expect(result.duet.hero.text).not.toBe(neutral.duet.hero.text);
          expect(result.duet.companion).toEqual(neutral.duet.companion);
          expect(result.duet.companion).not.toHaveProperty("voiceValue");
          expect(result.tone).toBe(neutral.tone);
          expect(result.duet.kind).toBe(neutral.duet.kind);
          expect(storyDuetText(result.duet)).toBe(`${result.duet.hero.text}\n\n${neutral.duet.companion.text}`);
          expect(source).toEqual(before);
        }
      }
    }
  });

  it.each([undefined, null, [], ["unknown"], ["loyalty", "unknown"], "loyalty", { values: ["mercy"] },
    ["Courage"], [null], Array.from({ length: 17 }, () => "curiosity")].map((value) => [value]))(
    "preserves neutral duet bytes exactly for absent or malformed captured values %j", (values) => {
      for (const condition of ["healthy", "injured"] as const) {
        for (let attempt = 0; attempt < 3; attempt++) {
          const source = { ...packet, condition };
          const neutral = createStoryDuetVignette(source, "shared-road", "legacy-neutral", attempt)!;
          const result = createStoryDuetVignette(source, "shared-road", "legacy-neutral", attempt, values)!;
          expect(JSON.stringify(result)).toBe(JSON.stringify(neutral));
          expect(result.duet.hero).not.toHaveProperty("voiceValue");
        }
      }
    },
  );

  it("captures value-inspired wording without retaining or mutating the recorded values", () => {
    const values: HeroValue[] = ["curiosity", "mercy"];
    const result = createStoryDuetVignette(packet, "shared-road", "immutable-voice", 0, values)!;
    expect(values).toEqual(["curiosity", "mercy"]);
    expect(values).toContain(result.duet.hero.voiceValue);
    const before = structuredClone(result);
    values.splice(0, values.length, "courage");
    expect(result).toEqual(before);
    expect([result, result.duet, result.duet.hero, result.duet.companion].every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it.each(["inner-life", "scene"] as const)("recorded values cannot enable a duet for %s", (focus) => {
    expect(createStoryDuetVignette(packet, focus, "wrong-focus", 0, ["loyalty"])).toBeNull();
    expect(createStoryDuetVignette(null, "shared-road", "missing-packet", 0, ["loyalty"])).toBeNull();
  });

  it("provides six distinct pairs of short first-person thoughts with contrasting roles", () => {
    const pairs = new Set<string>();
    const thoughts = new Set<string>();
    for (const condition of ["healthy", "injured"] as const) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = createStoryDuetVignette({ ...packet, condition }, "shared-road", "stable", attempt)!;
        expect(result.tone).toBe(condition === "injured" ? "care" : "trust");
        expect(result.duet).toMatchObject({ kind: "inner-voices", hero: { name: "Mira" }, companion: { name: "Neris" } });
        expect(result.duet.hero.text).not.toBe(result.duet.companion.text);
        for (const role of [result.duet.hero, result.duet.companion]) {
          expect(role.text).toMatch(/^I /u);
          expect(role.text.match(/[.!?](?:\s|$)/gu)).toHaveLength(1);
          expect(role.text.trim().split(/\s+/u).length).toBeLessThanOrEqual(18);
          expect(role.text.length).toBeLessThanOrEqual(240);
          expect(role.text).not.toMatch(/private-|romance|forever|recover|healed|killed|strongest|saved the party|always trusted|will be fine|Mira|Neris/iu);
          thoughts.add(role.text);
        }
        pairs.add(storyDuetText(result.duet));
        expect(storyDuetText(result.duet)).toBe(`${result.duet.hero.text}\n\n${result.duet.companion.text}`);
      }
    }
    expect(pairs.size).toBe(6);
    expect(thoughts.size).toBe(12);
  });

  it.each(["inner-life", "scene"] as const)("does not replace the %s treatment", (focus) => {
    expect(createStoryDuetVignette(packet, focus, "stable", 0)).toBeNull();
  });

  it("requires the verified milestone kind and supported condition", () => {
    expect(createStoryDuetVignette(null, "shared-road", "missing", 0)).toBeNull();
    expect(createStoryDuetVignette({ ...packet, kind: "farewell-remembrance" } as unknown as FirstSharedVictory, "shared-road", "wrong-kind", 0)).toBeNull();
    expect(createStoryDuetVignette({ ...packet, condition: "unknown" } as unknown as FirstSharedVictory, "shared-road", "wrong-condition", 0)).toBeNull();
  });

  it("keeps matching visible names in distinct host-assigned roles", () => {
    const result = createStoryDuetVignette({ ...packet, heroName: "Rowan", companionName: "Rowan" }, "shared-road", "shared-name", 0)!;
    expect(result.duet.hero.name).toBe("Rowan");
    expect(result.duet.companion.name).toBe("Rowan");
    expect(result.duet.hero).not.toBe(result.duet.companion);
    expect(result.duet.hero.text).not.toBe(result.duet.companion.text);
  });

  it("freezes both role records and does not retain mutable packet fields", () => {
    const source = structuredClone(packet);
    const before = structuredClone(source);
    const result = createStoryDuetVignette(source, "shared-road", "immutable", 0)!;
    expect(source).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.duet)).toBe(true);
    expect(Object.isFrozen(result.duet.hero)).toBe(true);
    expect(Object.isFrozen(result.duet.companion)).toBe(true);
    (source as { heroName: string }).heroName = "Changed later";
    expect(result.duet.hero.name).toBe("Mira");
    expect(JSON.stringify(result)).not.toContain("private-");
  });

  it("is deterministic and rotates among three pairs per condition without adjacent repeats", () => {
    for (const condition of ["healthy", "injured"] as const) {
      const source = { ...packet, condition };
      const result = Array.from({ length: 7 }, (_, attempt) => createStoryDuetVignette(source, "shared-road", "stable", attempt));
      expect(result[0]).toEqual(result[3]);
      expect(createStoryDuetVignette(source, "shared-road", "stable", 0)).toEqual(result[0]);
      for (let index = 1; index < result.length; index++) expect(result[index]).not.toEqual(result[index - 1]);
    }
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("uses initial rotation for invalid attempt %s", (attempt) => {
    expect(createStoryDuetVignette(packet, "shared-road", "stable", attempt))
      .toEqual(createStoryDuetVignette(packet, "shared-road", "stable", 0));
  });
});
