import { describe, expect, it } from "vitest";
import { naturalExperimentalLoafFixture } from "../../tests/experimental-loaf-fixtures";
import { canonicalStringify } from "../core/canonical";
import { randomInt } from "../core/rng";
import { actorPolicy, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import { advanceElsewhereLoaf, elsewhereLoafEventId, elsewhereLoafResult, isValidCampaignElsewhereLoaf } from "./elsewhere-loaf";
import { stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";

describe("one former baker's real independent inn experiment", () => {
  it("admits the actual former baker to supplied dough at a known inn while the hero is elsewhere", () => {
    const { before, admitted, completed } = naturalExperimentalLoafFixture(), loaf = admitted.depth.elsewhereLoaf!;
    expect([before.tick, admitted.tick, completed.tick]).toEqual([72, 73, 74]);
    expect(Object.hasOwn(before.depth, "elsewhereLoaf")).toBe(false);
    const former = admitted.depth.companions.former.find(entry => entry.identity.residentId === loaf.residentId)!;
    expect(former.identity).toMatchObject({ name: "Ada Fen", role: "baker" });
    expect(loaf).toMatchObject({ heroId: admitted.hero.id, companionName: former.identity.name,
      residentId: former.identity.residentId, role: former.identity.role, joinedTick: former.joinedTick,
      departureTick: former.departure.tick, locationId: former.departure.locationId,
      presenceRule: "retained-farewell-inn-worksite-v1", supplyRule: "inn-trial-dough-v1", completion: null });
    expect(former.departure.outcome).toBe("fulfilled");
    expect(former.resources.health).toBeGreaterThan(0);
    expect(former.injury).toBe("none");
    expect(loaf.locationId).not.toBe(former.identity.originLocationId);
    const town = admitted.depth.towns[loaf.locationId]!, inn = town.buildings.find(building => building.id === loaf.innId)!;
    expect(inn).toMatchObject({ kind: "inn", name: loaf.innName });
    expect(town.districts.find(district => district.id === inn.districtId)!.buildingIds).toContain(inn.id);
    expect(town.visits).toBeGreaterThan(0);
    expect(admitted.depth.atlas.discoveredLocationIds).toContain(loaf.locationId);
    expect(loaf.admission).toMatchObject({ tick: admitted.tick, heroLocationId: admitted.depth.atlas.currentLocationId,
      doughProvided: 1, doughAfter: 1, eventId: elsewhereLoafEventId(loaf.id, "admission") });
    expect(loaf.admission.heroLocationId).not.toBe(loaf.locationId);
    expect(loaf.admission.tick).toBeGreaterThan(former.departure.tick);
    expect(admitted.chronicle.at(-1)!.commandId).toBe(`${admitted.campaignId}:${loaf.admission.triggerCommandId}`);
    expect(admitted.chronicle.at(-1)!.commandType).toBe("travel");
    expect(completed.chronicle.at(-1)!.commandType).toBe("plan-route");
    expect(completed.depth.elsewhereLoaf!.completion).toMatchObject({ tick: completed.tick,
      doughBefore: 1, doughConsumed: 1, doughAfter: 0, productQuantity: 1 });
  });

  it("distinguishes a plain lunch, a successful experiment and a bricklike loaf without staging campaign outcomes", () => {
    // Pure content/rule cases, not three claimed natural journeys.
    for (const roll of [1, 2, 3, 4, 5, 6]) {
      expect(elsewhereLoafResult("steady", roll)).toEqual({ outcome: "plain-loaf",
        line: "A perfectly ordinary loaf. There are worse things to be at lunchtime." });
      expect(elsewhereLoafResult("experimental", roll)).toEqual(roll < 4
        ? { outcome: "bricklike-loaf", line: "Excellent. A load-bearing loaf." }
        : { outcome: "unexpected-delight", line: "It rose to the occasion. Higher than the baker intended." });
    }
    for (const roll of [0, 7, 1.5, Number.NaN]) expect(() => elsewhereLoafResult("experimental", roll)).toThrow();
  });

  it("commits independent deterministic style and oven draws without mutating either observed state", () => {
    const { before, admitted } = naturalExperimentalLoafFixture(), loaf = admitted.depth.elsewhereLoaf!;
    const { elsewhereLoaf: _loaf, ...ordinaryAfter } = admitted.depth;
    const originalBefore = canonicalStringify(before.depth), originalAfter = canonicalStringify(ordinaryAfter);
    expect(loaf.admission.style).toBe(randomInt(2, before.seed, "elsewhere-loaf", loaf.id, admitted.tick, "baking-style-v1") === 0 ? "steady" : "experimental");
    expect(loaf.admission.ovenRoll).toBe(1 + randomInt(6, before.seed, "elsewhere-loaf", loaf.id, admitted.tick, "oven-roll-v1"));
    expect(advanceElsewhereLoaf(before.depth, ordinaryAfter, loaf.admission.triggerCommandId)).toEqual(loaf);
    expect(advanceElsewhereLoaf(before.depth, ordinaryAfter, loaf.admission.triggerCommandId)).toEqual(loaf);
    expect(canonicalStringify(before.depth)).toBe(originalBefore);
    expect(canonicalStringify(ordinaryAfter)).toBe(originalAfter);
  });

  it("leaves direct depth commands without an actual observer source unchanged instead of inventing NPC work", () => {
    const { before, admitted } = naturalExperimentalLoafFixture();
    const travel = actorPolicy(before, campaignDirector(before));
    const directTravel = stepDepth(before.depth, travel.command);
    expect(Object.hasOwn(directTravel, "elsewhereLoaf")).toBe(false);
    const plan = actorPolicy(admitted, campaignDirector(admitted));
    const directPlan = stepDepth(admitted.depth, plan.command);
    expect(directPlan.elsewhereLoaf).toBe(admitted.depth.elsewhereLoaf);
    expect(directPlan.elsewhereLoaf!.completion).toBeNull();
    expect(directPlan.tick).toBe(admitted.tick + 1);
  });

  it("pauses while the hero is at the inn's town or dead, then uses the next eligible committed source once", () => {
    const { admitted } = naturalExperimentalLoafFixture(), loaf = admitted.depth.elsewhereLoaf!;
    const plan = actorPolicy(admitted, campaignDirector(admitted));
    const pending = stepDepth(admitted.depth, plan.command);
    // Explicit observer-only presence/death boundaries on a genuinely admitted job.
    // These are not claimed natural travel or death events.
    const home = { ...pending, atlas: { ...pending.atlas, currentLocationId: loaf.locationId } };
    const homeAfter = { ...home, tick: home.tick + 1 };
    expect(advanceElsewhereLoaf(home, homeAfter, `depth:${homeAfter.tick}:wait`)).toBe(loaf);
    const dead = { ...pending, hero: { ...pending.hero, resources: { ...pending.hero.resources, health: 0 } } };
    expect(advanceElsewhereLoaf(dead, { ...dead, tick: dead.tick + 1 }, `depth:${dead.tick + 1}:wait`)).toBe(loaf);
    const awayAgain = { ...homeAfter, tick: homeAfter.tick + 1,
      atlas: { ...homeAfter.atlas, currentLocationId: admitted.depth.atlas.currentLocationId } };
    const finished = advanceElsewhereLoaf(homeAfter, awayAgain, `depth:${awayAgain.tick}:wait`)!;
    expect(finished.completion).toMatchObject({ tick: awayAgain.tick, heroLocationId: awayAgain.atlas.currentLocationId,
      triggerCommandId: `depth:${awayAgain.tick}:wait`, doughConsumed: 1, productQuantity: 1 });
    expect(finished.admission).toBe(loaf.admission);
    expect(finished.completion!.tick).toBeGreaterThan(loaf.admission.tick + 1);
  });

  it("rejects invalid observed ticks and malformed, altered or foreign activity receipts", () => {
    // One actual legal visit command preserves the released non-depth source format.
    // golden:0's real T518 first visit exposed this format; no replay sweep is needed here.
    const visitBefore = createWorld("loaf-town-source", "campaign:loaf-town-source").depth;
    const visitAfter = stepDepth(visitBefore, { type: "visit-town" });
    expect(advanceElsewhereLoaf(visitBefore, visitAfter, `town:${visitAfter.atlas.currentLocationId}`)).toBeUndefined();
    expect(() => advanceElsewhereLoaf(visitBefore, visitAfter, "town:foreign-town")).toThrow();
    const { before, admitted, completed } = naturalExperimentalLoafFixture(), loaf = completed.depth.elsewhereLoaf!, end = loaf.completion!;
    for (const trigger of ["foreign", `depth:${admitted.tick}:`, `depth:${admitted.tick - 1}:travel:9`]) {
      expect(() => advanceElsewhereLoaf(before.depth, admitted.depth, trigger)).toThrow();
    }
    const malformed = [undefined, null, {}, { ...loaf, extra: true }, { ...loaf, rulesVersion: "elsewhere-loaf-v2" },
      { ...loaf, residentId: "unrelated-baker" }, { ...loaf, companionName: "Invented Baker" },
      { ...loaf, joinedTick: loaf.joinedTick + 1 }, { ...loaf, role: "smith" }, { ...loaf, innId: "imaginary-oven" },
      { ...loaf, innName: "Invented Inn" }, { ...loaf, supplyRule: "taken-from-hero" },
      { ...loaf, admission: { ...loaf.admission, ovenRoll: loaf.admission.ovenRoll === 6 ? 1 : loaf.admission.ovenRoll + 1 } },
      { ...loaf, admission: { ...loaf.admission, style: loaf.admission.style === "steady" ? "experimental" : "steady" } },
      { ...loaf, admission: { ...loaf.admission, triggerCommandId: "foreign:admission" } },
      { ...loaf, admission: { ...loaf.admission, heroLocationId: loaf.locationId } },
      { ...loaf, completion: { ...end, tick: loaf.admission.tick } },
      { ...loaf, completion: { ...end, triggerCommandId: `depth:${end.tick - 1}:route:wrong` } },
      { ...loaf, completion: { ...end, eventId: "another-job:completion" } },
      { ...loaf, completion: { ...end, heroLocationId: loaf.locationId } },
      { ...loaf, completion: { ...end, doughConsumed: 0 } }, { ...loaf, completion: { ...end, productQuantity: 2 } },
      { ...loaf, completion: { ...end, outcome: end.outcome === "plain-loaf" ? "bricklike-loaf" : "plain-loaf" } },
      { ...loaf, completion: { ...end, line: "The hero receives a free meal." } }];
    for (const value of malformed) {
      const changed = { ...completed.depth, elsewhereLoaf: value } as unknown as DepthState;
      expect(isValidCampaignElsewhereLoaf(changed)).toBe(false);
      expect(() => upgradeDepthState(changed, changed.seed, changed.hero.id, changed.hero.name)).toThrow();
    }
    expect(isValidCampaignElsewhereLoaf({ ...completed.depth, companions: { ...completed.depth.companions, former: [] } })).toBe(false);
  });

  it("round-trips exact history while old absence remains absent even at a now-eligible checkpoint", () => {
    const { before, admitted, completed } = naturalExperimentalLoafFixture();
    for (const world of [before, admitted, completed]) {
      const bytes = canonicalStringify(world);
      expect(upgradeWorldState(JSON.parse(bytes))).toEqual(world);
      expect(canonicalStringify(world)).toBe(bytes);
    }
    const { elsewhereLoaf: _loaf, ...oldDepth } = admitted.depth;
    const old = { ...admitted, depth: oldDepth };
    const loaded = upgradeWorldState(JSON.parse(canonicalStringify(old)));
    expect(loaded).toEqual(old);
    expect(Object.hasOwn(loaded.depth, "elsewhereLoaf")).toBe(false);
  });

  it("keeps a finished product historical after later travel and never consumes another batch", () => {
    const { completed, next } = naturalExperimentalLoafFixture(), loaf = completed.depth.elsewhereLoaf!;
    // Use the actual next source from its committed Chronicle, not a fictional baking command.
    const commandId = next.chronicle.at(-1)!.commandId!.slice(`${next.campaignId}:`.length);
    expect(advanceElsewhereLoaf(completed.depth, next.depth, commandId)).toBe(loaf);
    expect(next.depth.elsewhereLoaf).toEqual(loaf);
    const later = { ...next.depth, atlas: { ...next.depth.atlas, currentLocationId: loaf.locationId },
      hero: { ...next.depth.hero, resources: { ...next.depth.hero.resources, health: 0 } } };
    expect(isValidCampaignElsewhereLoaf(later)).toBe(true);
    expect(loaf.completion).toMatchObject({ doughAfter: 0, productQuantity: 1 });
  });
});
