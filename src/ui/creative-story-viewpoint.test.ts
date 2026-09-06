import { describe, expect, it } from "vitest";
import type { HeroState, HeroValue } from "../core/types";
import type { ActivePartyCompanionProjection, PartyProjection } from "./party-projection";
import { projectCreativeStoryViewpoint } from "./creative-story-viewpoint";

function fixture() {
  const hero = { id: "private-hero-id", name: "Mira", values: ["curiosity", "loyalty"] as HeroValue[], gold: 99 };
  const active: ActivePartyCompanionProjection = {
    id: "private-companion-id", name: "Iona Glass", role: "cartographer",
    origin: { townId: "private-town-id", locationId: "private-origin-id", name: "Bellwick" },
    destination: { locationId: "private-destination-id", name: "Foxbridge" },
    purpose: "shared-road-oath", purposeText: "Shared-road oath · Bellwick → Foxbridge",
    joinedTick: 7, victories: 2, bond: 6,
    combatKitId: "basic", combatKitText: "Basic road kit", combatActionTexts: [], roadcraftEffectiveness: null,
    status: "travelling", statusText: "Travelling to Foxbridge", health: 23, maxHealth: 31,
  };
  const party: PartyProjection = {
    active,
    former: [{ ...active, id: "private-former-id", name: "Absent Former Companion", departureTick: 3, departureOutcome: "fulfilled", departureText: "Oath fulfilled" }],
  };
  return { hero, active, party };
}

describe("public creative story viewpoint", () => {
  it("copies only named hero values and one active public companion into a frozen snapshot", () => {
    const { hero, active, party } = fixture();
    const before = JSON.stringify({ hero, party });
    const viewpoint = projectCreativeStoryViewpoint(hero, party);
    expect(viewpoint).toEqual({
      hero: { name: "Mira", values: ["curiosity", "loyalty"] },
      companion: { name: "Iona Glass", role: "cartographer", status: "travelling", purpose: "shared-road-oath", victories: 2 },
    });
    expect(JSON.stringify({ hero, party })).toBe(before);
    expect(Object.isFrozen(viewpoint)).toBe(true);
    expect(Object.isFrozen(viewpoint!.hero)).toBe(true);
    expect(Object.isFrozen(viewpoint!.hero.values)).toBe(true);
    expect(Object.isFrozen(viewpoint!.companion)).toBe(true);
    const encoded = JSON.stringify(viewpoint);
    for (const privateValue of ["private-", "Absent Former Companion", "Bellwick", "Foxbridge", "gold", "bond", "combatKit", "health"]) {
      expect(encoded).not.toContain(privateValue);
    }
    hero.values.push("mercy");
    active.name = "Changed after projection";
    expect(viewpoint!.hero.values).toEqual(["curiosity", "loyalty"]);
    expect(viewpoint!.companion!.name).toBe("Iona Glass");
  });

  it("does not substitute former companions when the public active projection is absent", () => {
    const { hero, party } = fixture();
    expect(projectCreativeStoryViewpoint(hero, { ...party, active: null })?.companion).toBeNull();
  });

  it.each(["travelling", "arrived", "injured", "arrived-injured"] as const)("preserves the public %s status without guessing a disposition", (status) => {
    const { hero, active, party } = fixture();
    expect(projectCreativeStoryViewpoint(hero, { ...party, active: { ...active, status } })?.companion)
      .toEqual({ name: "Iona Glass", role: "cartographer", status, purpose: "shared-road-oath", victories: 2 });
  });

  it("rejects unusable hero names and invalid value lists instead of inventing a character", () => {
    const { hero, party } = fixture();
    for (const name of ["", " Mira", "Mira\nAnother", "Mira\u202e", "x".repeat(129)]) {
      expect(projectCreativeStoryViewpoint({ ...hero, name }, party)).toBeNull();
    }
    for (const values of [["curiosity", "curiosity"], ["romantic"], ["curiosity", "loyalty", "mercy", "courage", "extra"]]) {
      expect(projectCreativeStoryViewpoint({ ...hero, values } as Pick<HeroState, "name" | "values">, party)).toBeNull();
    }
    expect(projectCreativeStoryViewpoint({ name: "Mira", values: [] }, party)?.hero.values).toEqual([]);
  });

  it("omits invalid companion fields without fabricating replacement facts", () => {
    const { hero, active, party } = fixture();
    const invalid = [
      { name: "" }, { name: "x".repeat(129) }, { role: "x".repeat(65) }, { role: "guard\nlover" },
      { victories: -1 }, { victories: 1.5 }, { victories: Number.MAX_SAFE_INTEGER + 1 },
      { status: "dead" }, { purpose: "secret-romance" },
    ];
    for (const fields of invalid) {
      expect(projectCreativeStoryViewpoint(hero, { ...party, active: { ...active, ...fields } as ActivePartyCompanionProjection })?.companion)
        .toBeNull();
    }
    expect(projectCreativeStoryViewpoint({ name: "x".repeat(128), values: ["curiosity", "loyalty", "mercy", "courage"] }, {
      ...party, active: { ...active, name: "y".repeat(128), role: "z".repeat(64), victories: Number.MAX_SAFE_INTEGER },
    })).not.toBeNull();
  });
});
