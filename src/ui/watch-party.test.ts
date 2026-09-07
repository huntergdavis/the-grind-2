import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import { projectHeroIdentityAppearance } from "../render/hero-appearance";
import type { ActivePartyCompanionProjection, PartyCompanionStatus } from "./party-projection";
import { projectWatchParty } from "./watch-party";

const hero = createWorld("watch-party", "campaign:watch-party").depth.hero;
const companion = {
  id: "resident:watch-companion", name: "Dima Bramble", health: 7, maxHealth: 19, status: "travelling",
} as ActivePartyCompanionProjection;

describe("compact Watch party", () => {
  it("keeps exact hero resources and the existing stable identity palette", () => {
    const result = projectWatchParty({ ...hero, resources: { health: 2, maxHealth: 37, mana: 0, maxMana: 0 } }, null);
    expect(result.hero).toEqual({ id: hero.id, name: hero.name, health: 2, maxHealth: 37, mana: 0, maxMana: 0,
      appearance: projectHeroIdentityAppearance(hero) });
    expect(result.companion).toBeNull();
  });

  it("shows only the active companion's real health, never invented mana", () => {
    const result = projectWatchParty(hero, companion).companion!;
    expect(result).toMatchObject({ id: companion.id, name: companion.name, health: 7, maxHealth: 19 });
    expect(result.appearance).toEqual(projectHeroIdentityAppearance({ id: companion.id }));
    expect(result).not.toHaveProperty("mana");
    expect(result).not.toHaveProperty("maxMana");
  });

  it.each([
    ["travelling", "Travelling", false], ["arrived", "Arrived", false],
    ["injured", "Injured", true], ["arrived-injured", "Arrived injured", true],
  ] as const)("preserves the public %s condition", (status: PartyCompanionStatus, label, injured) => {
    const result = projectWatchParty(hero, { ...companion, status, health: injured ? 0 : 7 }).companion!;
    expect(result.status).toBe(label);
    expect(result.injured).toBe(injured);
    expect(result.health).toBe(injured ? 0 : 7);
    expect(result.status).not.toMatch(/dead|fallen/iu);
  });

  it("keeps portrait identity stable through resource and condition changes", () => {
    const first = projectWatchParty(hero, companion);
    const later = projectWatchParty({ ...hero, resources: { ...hero.resources, health: 0 } },
      { ...companion, status: "injured", health: 0 });
    expect(later.hero.appearance).toEqual(first.hero.appearance);
    expect(later.companion!.appearance).toEqual(first.companion!.appearance);
  });
});
