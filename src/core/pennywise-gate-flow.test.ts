import { beforeAll, describe, expect, it } from "vitest";
import { naturalPennywiseGateApproachFixture, naturalPennywiseGateFixture } from "../../tests/pennywise-gate-fixtures";
import { pennywiseGateCommandId } from "../depth/pennywise-gate";
import { stepDepth } from "../depth/state";
import { actorPolicy } from "./actor-policy";
import { advanceWorld, campaignDirector, rulesEngine, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

describe("the Pennywise Gate on the actual first solo road", () => {
  let before: WorldState, ready: WorldState, paid: WorldState, lifted: WorldState, passed: WorldState;
  beforeAll(() => {
    before = naturalPennywiseGateApproachFixture();
    ready = naturalPennywiseGateFixture();
    paid = advanceWorld(ready);
    const opportunity = campaignDirector(ready);
    const lift = opportunity.candidates.find(entry => entry.command.type === "choose-pennywise-gate" && entry.command.choice === "lift")!;
    // Explicitly exercise the other admitted choice, not the natural hero's
    // preference. No gold, values, road, outcome or route is staged.
    lifted = rulesEngine(ready, opportunity, actorPolicy(ready, { ...opportunity, candidates: [lift] }));
    passed = advanceWorld(lifted);
  });

  it("stops real ordinary travel at the barrier without reaching the far side", () => {
    expect(ready.tick).toBe(before.tick + 1);
    expect(Object.hasOwn(before.depth, "pennywiseGate")).toBe(false);
    const approachDistance = 8 - before.depth.atlas.route!.legProgress;
    expect(approachDistance).toBeGreaterThan(0);
    expect(campaignDirector(before).candidates[0]?.command).toEqual({ type: "travel", distance: approachDistance });
    expect(advanceWorld(before)).toEqual(ready);
    const gate = ready.depth.pennywiseGate!;
    expect(gate.arrival).toMatchObject({ tick: ready.tick, distance: approachDistance,
      sourceCommandId: `depth:${ready.tick}:travel:${approachDistance}` });
    expect(ready.depth.atlas.route!.distanceTravelled - before.depth.atlas.route!.distanceTravelled).toBe(approachDistance);
    expect(gate.site).toMatchObject({ nearPointIndex: 313, farPointIndex: 312, nearProgress: 8, farProgress: 15 });
    expect(ready.depth.atlas.route!.legProgress).toBe(8);
    expect(ready.depth.atlas.currentLocationId).toBe(before.depth.atlas.currentLocationId);
    expect(ready.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(ready.depth.hero.gold).toBe(before.depth.hero.gold);
    expect(ready.hero.experience).toBe(before.hero.experience + 1); // Existing ordinary travel XP.
    expect(ready.chronicle.at(-1)).toMatchObject({ commandType: "travel", mode: "travel",
      commandId: `${ready.campaignId}:${gate.arrival.sourceCommandId}` });
    expect(() => stepDepth(before.depth, { type: "travel", distance: 12 })).toThrow("stop");
  });

  it("autonomously spends two owned gold for one-action passage with no other reward", () => {
    expect(paid.tick).toBe(ready.tick + 1);
    const gate = paid.depth.pennywiseGate!;
    expect(gate.choice?.kind).toBe("pay");
    const goldBefore = ready.depth.hero.gold;
    expect(goldBefore).toBeGreaterThanOrEqual(2);
    expect(gate.completion).toMatchObject({ tick: paid.tick, distance: 7, goldBefore, goldSpent: 2, goldAfter: goldBefore - 2 });
    expect(paid.depth.hero).toEqual({ ...ready.depth.hero, gold: goldBefore - 2 });
    expect(paid.hero).toEqual({ ...ready.hero, gold: goldBefore - 2 });
    expect(paid.depth.atlas.route!.legProgress).toBe(15);
    expect(paid.depth.atlas.currentLocationId).toBe(ready.depth.atlas.currentLocationId);
    expect(paid.depth).toEqual({ ...ready.depth, tick: paid.tick, hero: paid.depth.hero, atlas: paid.depth.atlas,
      pennywiseGate: gate, log: paid.depth.log });
    expect(paid.chronicle.at(-1)?.commandId).toBe(`${paid.campaignId}:${gate.completion!.sourceCommandId}`);
  });

  it("supports the legal free alternative: lift stationary, then actually pass", () => {
    expect(lifted.depth.pennywiseGate!.choice?.kind).toBe("lift");
    expect(lifted.depth.pennywiseGate!.completion).toBeNull();
    expect(lifted.depth.atlas).toEqual(ready.depth.atlas);
    expect(lifted.depth.hero).toEqual(ready.depth.hero);
    expect(lifted.hero).toEqual(ready.hero);
    expect(passed.tick).toBe(ready.tick + 2);
    expect(passed.depth.atlas).toEqual(paid.depth.atlas);
    expect(passed.depth.hero).toEqual(ready.depth.hero);
    expect(passed.hero).toEqual(ready.hero);
    expect(passed.depth.pennywiseGate!.completion).toMatchObject({ goldBefore: ready.depth.hero.gold,
      goldSpent: 0, goldAfter: ready.depth.hero.gold, distance: 7 });
    expect(passed.chronicle.at(-1)?.commandId).toBe(`${passed.campaignId}:${pennywiseGateCommandId(passed.tick,
      { type: "pass-pennywise-gate", gateId: passed.depth.pennywiseGate!.gateId })}`);
    expect(() => stepDepth(lifted.depth, { type: "travel", distance: 7 })).toThrow("Finish");
  });

  it("round-trips every boundary and continues without charging or inventing another gate", () => {
    for (const world of [before, ready, paid, lifted, passed]) {
      expect(upgradeWorldState(JSON.parse(JSON.stringify(world)))).toEqual(world);
    }
    for (const world of [paid, passed]) {
      const next = advanceWorld(world);
      expect(next.depth.pennywiseGate).toEqual(world.depth.pennywiseGate);
      expect(next.depth.atlas.route!.legProgress).toBeGreaterThan(world.depth.atlas.route!.legProgress);
      expect(next.depth.hero.gold).toBe(world.depth.hero.gold);
      expect(() => stepDepth(world.depth, { type: "pass-pennywise-gate", gateId: world.depth.pennywiseGate!.gateId })).toThrow();
    }
    expect(() => stepDepth(ready.depth, { type: "choose-pennywise-gate", gateId: "foreign", choice: "pay" })).toThrow();
  });
});
