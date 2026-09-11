import { beforeAll, describe, expect, it } from "vitest";
import { heroWorldHashWithoutLoafReceipt, naturalExperimentalLoafFixture } from "../../tests/experimental-loaf-fixtures";
import { canonicalHash, canonicalStringify } from "./canonical";
import { advanceWorld, upgradeWorldState } from "./simulation";

describe("Experimental Loaf alongside actual hero commands", () => {
  let journey: ReturnType<typeof naturalExperimentalLoafFixture>;
  beforeAll(() => { journey = naturalExperimentalLoafFixture(); });

  it("adds only an independent NPC receipt to the unchanged natural travel, route and camp beats", () => {
    const { before, admitted, completed, next } = journey;
    expect([before.tick, admitted.tick, completed.tick, next.tick]).toEqual([72, 73, 74, 75]);
    expect(canonicalHash(before)).toBe("13656f8eed409523");
    // Explicit old-world comparison, not a normalized imported save. Every
    // other canonical field must remain byte-equivalent to the v178 proof.
    expect([admitted, completed, next].map(heroWorldHashWithoutLoafReceipt))
      .toEqual(["4ce6ee4356e6a55b", "6452ad3327e971a7", "5934800e8fab7bd7"]);
    expect([admitted, completed, next].map(world => world.chronicle.at(-1)?.commandType))
      .toEqual(["travel", "plan-route", "prepare-road-supper"]);
    expect([admitted, completed, next].map(world => world.scene.mode)).toEqual(["travel", "atlas", "camp"]);
    expect([admitted.hero.experience, completed.hero.experience, next.hero.experience]).toEqual([51, 52, 52]);
    for (const world of [admitted, completed, next]) {
      expect(world.depth.atlas.currentLocationId).toBe("location:10");
      expect(world.depth.hero.resources).toMatchObject({ health: 37, mana: 22 });
      expect(world.depth.hero.gold).toBe(19);
      expect(world.depth.companions).toEqual(before.depth.companions);
    }
  });

  it("round-trips admission and completion exactly, then continues without replaying the NPC attempt", () => {
    for (const world of [journey.before, journey.admitted, journey.completed, journey.next]) {
      const raw = canonicalStringify(world), restored = upgradeWorldState(JSON.parse(raw));
      expect(canonicalStringify(restored)).toBe(raw);
      expect(canonicalHash(restored)).toBe(canonicalHash(world));
    }
    const restored = upgradeWorldState(JSON.parse(canonicalStringify(journey.completed)))!;
    expect(advanceWorld(restored)).toEqual(journey.next);
    expect(journey.next.depth.elsewhereLoaf).toEqual(journey.completed.depth.elsewhereLoaf);
    const battle = advanceWorld(journey.next);
    expect(battle.tick).toBe(76);
    expect(battle.chronicle.at(-1)?.commandType).toBe("start-combat");
    expect(heroWorldHashWithoutLoafReceipt(battle)).toBe("9fea9ef1f9ace3cc");
    expect(battle.depth.elsewhereLoaf).toEqual(journey.completed.depth.elsewhereLoaf);
  });

  it("binds the real baker, inn dough and two separate NPC events to the actual committed hero sources", () => {
    const { admitted, completed } = journey, loaf = completed.depth.elsewhereLoaf!;
    const former = admitted.depth.companions.former.find(entry => entry.identity.residentId === loaf.residentId
      && entry.joinedTick === loaf.joinedTick)!;
    const town = admitted.depth.towns[loaf.locationId]!, inn = town.buildings.find(building => building.id === loaf.innId)!;
    expect(loaf).toMatchObject({ schemaVersion: 1, rulesVersion: "elsewhere-loaf-v1", heroId: admitted.hero.id,
      residentId: former.identity.residentId, companionName: "Ada Fen", role: "baker", joinedTick: 28,
      departureTick: 45, locationId: "location:0", innId: "town:location:0:district:1:building:0", innName: "The Candle Inn",
      presenceRule: "retained-farewell-inn-worksite-v1", supplyRule: "inn-trial-dough-v1" });
    expect(former).toMatchObject({ identity: { role: "baker" }, injury: "none", departure: { locationId: loaf.locationId, outcome: "fulfilled" } });
    expect(former.resources.health).toBeGreaterThan(0);
    expect(inn.kind).toBe("inn");
    expect(town.visits).toBeGreaterThan(0);
    expect(town.districts.some(district => district.id === inn.districtId && district.buildingIds.includes(inn.id))).toBe(true);
    expect(admitted.depth.atlas.locations.find(location => location.id === loaf.locationId)?.name).toBe("Elderwatch");
    expect(town.name).toBe("Starharbor"); // Stored generation label is not the public atlas name.
    expect(loaf.admission).toMatchObject({ tick: 73, heroLocationId: "location:10", doughProvided: 1, doughAfter: 1 });
    expect(loaf.completion).toMatchObject({ tick: 74, heroLocationId: "location:10", doughBefore: 1,
      doughConsumed: 1, doughAfter: 0, productQuantity: 1 });
    expect(loaf.admission.heroLocationId).not.toBe(loaf.locationId);
    expect(loaf.completion!.eventId).not.toBe(loaf.admission.eventId);
    expect(admitted.chronicle.at(-1)?.commandId).toBe(`${admitted.campaignId}:${loaf.admission.triggerCommandId}`);
    expect(completed.chronicle.at(-1)?.commandId).toBe(`${completed.campaignId}:${loaf.completion!.triggerCommandId}`);
    expect(loaf.admission.eventId).not.toBe(loaf.admission.triggerCommandId);
    expect(completed.depth.hero.inventory).toEqual(admitted.depth.hero.inventory);
    expect(completed.depth.towns).toEqual(admitted.depth.towns);
    expect(completed.depth.companions).toEqual(admitted.depth.companions);
    expect(completed.depth.quest).toEqual(admitted.depth.quest);
  });
});
