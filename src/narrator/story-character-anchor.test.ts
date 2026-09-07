import { describe, expect, it } from "vitest";
import type { CreativeStoryFocus, CreativeStoryViewpoint } from "./creative-story";
import { captureStoryCharacterAnchor, hasStoryCharacterAnchor } from "./story-character-anchor";

function viewpoint(hero = "Mara", companion: string | null = "Rowan"): CreativeStoryViewpoint {
  return {
    hero: { name: hero, values: ["loyalty", "mercy"] },
    companion: companion === null ? null : {
      name: companion, role: "miller", status: "injured", purpose: "shared-road-oath", victories: 1,
    },
  };
}

function accepts(text: string, hero = "Mara", companion: string | null = "Rowan", focus: CreativeStoryFocus = "shared-road"): boolean {
  return hasStoryCharacterAnchor(text, captureStoryCharacterAnchor(viewpoint(hero, companion), focus));
}

describe("requested story character anchor", () => {
  it("leaves atmospheric scene writing and missing viewpoints unrestricted", () => {
    expect(captureStoryCharacterAnchor(viewpoint(), "scene")).toEqual([]);
    expect(hasStoryCharacterAnchor("Mist settles over the stones.", captureStoryCharacterAnchor(viewpoint(), "scene"))).toBe(true);
    for (const focus of ["inner-life", "shared-road", "scene"] as const) {
      expect(hasStoryCharacterAnchor("Mist settles over the stones.", captureStoryCharacterAnchor(null, focus))).toBe(true);
    }
  });

  it("requires only the hero for inner life, and the hero when a shared road has no companion", () => {
    expect(accepts("Mara tightened her grip.", "Mara", "Rowan", "inner-life")).toBe(true);
    expect(accepts("Rowan tightened his grip.", "Mara", "Rowan", "inner-life")).toBe(false);
    expect(accepts("Mara tightened her grip.", "Mara", null)).toBe(true);
    expect(accepts("The traveler tightened their grip.", "Mara", null)).toBe(false);
  });

  it("requires both actual requested characters for the shared road", () => {
    expect(accepts("Mara watched Rowan adjust his pack.")).toBe(true);
    expect(accepts("Mara watched a traveler adjust his pack.")).toBe(false);
    expect(accepts("A traveler watched Rowan adjust his pack.")).toBe(false);
  });

  it("accepts complete names or natural given names but not surnames alone", () => {
    expect(accepts("Mara Vale waited beside Rowan Bright.", "Mara Vale", "Rowan Bright")).toBe(true);
    expect(accepts("Mara waited beside Rowan.", "Mara Vale", "Rowan Bright")).toBe(true);
    expect(accepts("Vale waited beside Bright.", "Mara Vale", "Rowan Bright")).toBe(false);
  });

  it.each([
    "Marauder watched Rowan.", "Tamara watched Rowan.", "ÉMara watched Rowan.",
    "𐐀Mara watched Rowan.", "Mara2 watched Rowan.", "Mara_2 watched Rowan.",
    "O'Mara watched Rowan.", "Bo-Mara watched Rowan.", "Mara-Lee watched Rowan.",
  ])("does not mistake an embedded name for the hero: %s", (text) => {
    expect(accepts(text)).toBe(false);
  });

  it("accepts quoted names and straight or curly possessives", () => {
    expect(accepts("Mara’s hand steadied Rowan's pack.")).toBe(true);
    expect(accepts("'Mara,' Rowan whispered.")).toBe(true);
    expect(accepts("‘Mara’s hands are cold,’ Rowan thought.")).toBe(true);
  });

  it("keeps hyphenated and apostrophized given names intact", () => {
    expect(accepts("Anne–Marie’s sleeve brushed D’Arcy’s hand.", "Anne-Marie Gray", "D'Arcy Vale")).toBe(true);
    expect(accepts("Anne's sleeve brushed Arcy's hand.", "Anne-Marie Gray", "D'Arcy Vale")).toBe(false);
  });

  it("normalizes Unicode composition, case, and whitespace without removing name accents", () => {
    expect(accepts("E\u0301LODIE held ΙΡΙΔΑ's hand.", "Élodie Vale", "Ιριδα Bright")).toBe(true);
    expect(accepts("Elodie held Ιριδα's hand.", "Élodie Vale", "Ιριδα Bright")).toBe(false);
    expect(accepts("Mara\nVale waited for Rowan\tBright.", " Mara   Vale ", " Rowan Bright ")).toBe(true);
  });

  it("treats regex metacharacters in names literally", () => {
    expect(accepts("A.+ steadied B(ra)'s pack.", "A.+ Vale", "B(ra) Bright")).toBe(true);
    expect(accepts("Axxxx steadied Bra's pack.", "A.+ Vale", "B(ra) Bright")).toBe(false);
  });

  it("requires unambiguous full names when both characters share a given name", () => {
    const anchor = captureStoryCharacterAnchor(viewpoint("Mara Vale", "Mara Bright"), "shared-road");
    expect(anchor.map(({ aliases }) => aliases)).toEqual([["mara vale"], ["mara bright"]]);
    expect(hasStoryCharacterAnchor("Mara Vale steadied Mara Bright's pack.", anchor)).toBe(true);
    expect(hasStoryCharacterAnchor("Mara Vale steadied Mara's pack.", anchor)).toBe(false);
    expect(hasStoryCharacterAnchor("Mara steadied Mara's pack.", anchor)).toBe(false);
  });

  it("does not count a single full-name occurrence as two different characters", () => {
    expect(accepts("Mara Rowan waited quietly.", "Mara Rowan", "Rowan Bright")).toBe(false);
    expect(accepts("Mara Rowan waited with Rowan.", "Mara Rowan", "Rowan Bright")).toBe(true);
    expect(accepts("Mara Vale waited quietly.", "Mara", "Mara Vale")).toBe(false);
    expect(accepts("Mara Vale waited with Mara.", "Mara", "Mara Vale")).toBe(true);
    expect(accepts("Mara Vale waited with Mara Vale.", "Mara Vale", "Mara Vale")).toBe(false);
  });

  it("captures immutable strings and does not follow later viewpoint changes", () => {
    const mutable = { hero: { name: "Mara Vale", values: [] }, companion: null };
    const anchor = captureStoryCharacterAnchor(mutable, "inner-life");
    mutable.hero.name = "Nira Vale";
    expect(anchor).toEqual([{ role: "hero", fullName: "mara vale", aliases: ["mara vale", "mara"] }]);
    expect(hasStoryCharacterAnchor("Mara listened.", anchor)).toBe(true);
    expect(hasStoryCharacterAnchor("Nira listened.", anchor)).toBe(false);
    expect(Object.isFrozen(anchor)).toBe(true);
    expect(Object.isFrozen(anchor[0])).toBe(true);
    expect(Object.isFrozen(anchor[0]!.aliases)).toBe(true);
  });

  it("does not turn a malformed empty required name into an unrestricted pass", () => {
    expect(accepts("Rowan watched the road.", "  ", "Rowan")).toBe(false);
  });

  it("rejects both sampled-135M drafts that lost the requested people", () => {
    // Actual raw outputs retained in sampled-prose-report-2026-09-07T18-51-27-173Z-
    // afa64a3d-b8ce-4f39-81fe-7522a34b8be7.json; these are not invented model fixtures.
    const first = "2 - 3 years ago . The old road was marked by a white rose on it , a symbol of love and brotherhood , but today it had been a thorn in the side of the weary traveler who now sought to cross it . The";
    const second = "Frodo remembered when he'd been a boy, the path to Elya and the way his father and mother had taken him to meet up at the road he had sworn to protect. The road was named after the rose that Mara had planted there so she could see the sun rise on its beauty. But";
    expect(accepts(first)).toBe(false);
    expect(accepts(second)).toBe(false);
    // The second passage mentions Mara but loses Rowan. This deliberately does
    // not claim an identity-only check can reject its invented backstory.
    expect(accepts(second, "Mara", "Rowan", "inner-life")).toBe(true);
  });

  it("does not misrepresent name presence as factual or emotional quality", () => {
    expect(accepts("Mara and Rowan healed every wound and remembered a thousand invented battles.")).toBe(true);
    expect(accepts("Mara and Rowan stood still. Mara and Rowan stood still.")).toBe(true);
  });
});
