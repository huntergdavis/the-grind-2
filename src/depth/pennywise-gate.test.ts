import { beforeAll, describe, expect, it } from "vitest";
import { naturalPennywiseGateApproachFixture, naturalPennywiseGateFixture } from "../../tests/pennywise-gate-fixtures";
import { advanceRoute } from "./atlas";
import { capturePennywiseGateArrival, isValidCampaignPennywiseGate, pennywiseGateChoices, pennywiseGateCommandId,
  selectPennywiseGate, selectPennywiseGateApproach, stepPennywiseGate } from "./pennywise-gate";
import type { DepthCommand, DepthState } from "./types";

type GateCommand = Extract<DepthCommand, { type: "choose-pennywise-gate" | "pass-pennywise-gate" }>;
function commit(state: DepthState, command: GateCommand): DepthState {
  const result = stepPennywiseGate(state, command);
  return { ...state, tick: state.tick + 1, pennywiseGate: result.pennywiseGate, atlas: result.atlas,
    hero: { ...state.hero, gold: result.gold } };
}
function choice(state: DepthState, kind: "pay" | "lift"): Extract<GateCommand, { type: "choose-pennywise-gate" }> {
  return { type: "choose-pennywise-gate", gateId: state.pennywiseGate!.gateId, choice: kind };
}
function preserved(state: DepthState) {
  const { tick: _tick, log: _log, pennywiseGate: _gate, atlas: _atlas, hero, ...rest } = state;
  const { gold: _gold, ...heroWithoutGold } = hero;
  return { ...rest, hero: heroWithoutGold };
}

describe("one source-bound Pennywise Gate on a real road", () => {
  let before: DepthState, ready: DepthState;
  beforeAll(() => {
    before = naturalPennywiseGateApproachFixture().depth;
    ready = naturalPennywiseGateFixture().depth;
  });

  it("establishes the new gate only after ordinary travel reaches real interior terrain points", () => {
    const snapshot = JSON.stringify(before), approach = selectPennywiseGateApproach(before)!;
    expect(before).not.toHaveProperty("pennywiseGate");
    expect(approach).toMatchObject({ approachDistance: 8, site: { nearProgress: 8, farProgress: 15 } });
    expect(ready.tick).toBe(before.tick + 1);
    expect(ready.atlas.currentLocationId).toBe(before.atlas.currentLocationId);
    expect(ready.atlas.route!.legIndex).toBe(before.atlas.route!.legIndex);
    expect(ready.pennywiseGate).toMatchObject({ schemaVersion: 1, rulesVersion: "pennywise-gate-v1", heroId: before.hero.id,
      arrival: { tick: ready.tick, sourceCommandId: `depth:${ready.tick}:travel:8`, distance: 8, routeBefore: before.atlas.route, routeAtGate: ready.atlas.route },
      choice: null, completion: null });
    expect(ready.atlas.edges).toEqual(before.atlas.edges);
    // Reaching the gate is ordinary travel and keeps its existing one XP.
    // Only the new payment/lifting/passage commands promise zero added XP.
    expect(ready.hero).toEqual({ ...before.hero, experience: before.hero.experience + 1 });
    expect(capturePennywiseGateArrival(before, ready, { type: "travel", distance: 8 })).toEqual(ready.pennywiseGate);
    expect(capturePennywiseGateArrival(before, ready, { type: "travel", distance: 12 })).toBeNull();
    expect(capturePennywiseGateArrival(before, { ...ready, tick: ready.tick + 1 }, { type: "travel", distance: 8 })).toBeNull();
    expect(selectPennywiseGateApproach(ready)).toBeNull();
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("pays exactly two owned gold and crosses exactly seven miles in one action", () => {
    const snapshot = JSON.stringify(ready), command = choice(ready, "pay"), paid = commit(ready, command), receipt = paid.pennywiseGate!;
    const goldBefore = ready.hero.gold;
    expect(goldBefore).toBeGreaterThanOrEqual(2);
    expect(paid.tick).toBe(ready.tick + 1);
    expect(pennywiseGateChoices(ready).map((entry) => entry.choice)).toEqual(["pay", "lift"]);
    expect(receipt.choice).toMatchObject({ kind: "pay", tick: paid.tick, sourceCommandId: pennywiseGateCommandId(paid.tick, command),
      goldBefore, goldSpent: 2, goldAfter: goldBefore - 2 });
    expect(receipt.completion).toMatchObject({ tick: paid.tick, sourceCommandId: receipt.choice!.sourceCommandId,
      distance: 7, goldBefore, goldSpent: 2, goldAfter: goldBefore - 2, line: "Two gold, and not a splinter on my dignity." });
    expect(paid.hero.gold).toBe(goldBefore - 2);
    expect(paid.atlas.route!.legProgress).toBe(15);
    expect(paid.atlas.route!.distanceTravelled - ready.atlas.route!.distanceTravelled).toBe(7);
    expect(paid.atlas.currentLocationId).toBe(ready.atlas.currentLocationId);
    expect(paid.atlas.discoveredLocationIds).toEqual(ready.atlas.discoveredLocationIds);
    expect(preserved(paid)).toEqual(preserved(ready));
    expect(isValidCampaignPennywiseGate(paid)).toBe(true);
    expect(selectPennywiseGate(paid)).toBeNull();
    expect(() => stepPennywiseGate(paid, command)).toThrow();
    expect(JSON.stringify(ready)).toBe(snapshot);
  });

  it("keeps lifting stationary and permits free passage in the second action with no gold", () => {
    // Explicit affordability boundary on the earned gate; no claim that the
    // natural hero arrived broke. Both actions still use the actual road.
    const broke = { ...ready, hero: { ...ready.hero, gold: 0 } };
    expect(pennywiseGateChoices(broke)).toEqual([{ choice: "lift", label: "lift the barrier, then walk through", goldCost: 0, actions: 2 }]);
    expect(() => stepPennywiseGate(broke, choice(broke, "pay"))).toThrow();
    expect(() => stepPennywiseGate(broke, { type: "pass-pennywise-gate", gateId: broke.pennywiseGate!.gateId })).toThrow();
    const lifted = commit(broke, choice(broke, "lift"));
    expect(lifted.tick).toBe(broke.tick + 1);
    expect(lifted.atlas).toEqual(broke.atlas);
    expect(lifted.hero).toEqual(broke.hero);
    expect(lifted.pennywiseGate!.completion).toBeNull();
    expect(isValidCampaignPennywiseGate(lifted)).toBe(true);
    expect(pennywiseGateChoices(lifted)).toEqual([]);
    const pass: GateCommand = { type: "pass-pennywise-gate", gateId: lifted.pennywiseGate!.gateId }, passed = commit(lifted, pass);
    expect(passed.tick).toBe(lifted.tick + 1);
    expect(passed.pennywiseGate!.completion).toMatchObject({ tick: passed.tick, sourceCommandId: pennywiseGateCommandId(passed.tick, pass),
      distance: 7, goldBefore: 0, goldSpent: 0, goldAfter: 0, line: "Free passage. Some lifting required." });
    expect(passed.atlas).toEqual(commit(ready, choice(ready, "pay")).atlas);
    expect(preserved(passed)).toEqual(preserved(broke));
    expect(isValidCampaignPennywiseGate(passed)).toBe(true);
    expect(() => stepPennywiseGate(passed, pass)).toThrow();
  });

  it("round-trips each phase exactly and keeps completed history after route rollover and later spending", () => {
    const lifted = commit(ready, choice(ready, "lift"));
    const passed = commit(lifted, { type: "pass-pennywise-gate", gateId: lifted.pennywiseGate!.gateId });
    for (const state of [ready, lifted, passed, commit(ready, choice(ready, "pay"))]) {
      const restored = JSON.parse(JSON.stringify(state)) as DepthState;
      expect(restored).toEqual(state);
      expect(isValidCampaignPennywiseGate(restored)).toBe(true);
    }
    const later = { ...passed, tick: passed.tick + 10, atlas: advanceRoute(passed.atlas, passed.atlas.route!.totalDistance),
      hero: { ...passed.hero, gold: 1 } };
    expect(later.atlas.route).toBeNull();
    expect(isValidCampaignPennywiseGate(later)).toBe(true);
    expect(selectPennywiseGateApproach(later)).toBeNull();
    expect(isValidCampaignPennywiseGate({ ...later, atlas: before.atlas })).toBe(true);
    expect(later.pennywiseGate).toEqual(passed.pennywiseGate);
  });

  it("rejects altered sources, invented road points, changed payment and mutated receipts", () => {
    const paid = commit(ready, choice(ready, "pay"));
    const mutations: readonly ((state: DepthState) => void)[] = [
      (state) => { Object.assign(state.pennywiseGate!, { rulesVersion: "pennywise-gate-v2" }); },
      (state) => { Object.assign(state.pennywiseGate!.site, { nearPointIndex: state.pennywiseGate!.site.farPointIndex }); },
      (state) => { Object.assign(state.pennywiseGate!.arrival, { sourceCommandId: "depth:8:wait" }); },
      (state) => { Object.assign(state.pennywiseGate!.arrival, { distance: 12 }); },
      (state) => { Object.assign(state.pennywiseGate!.arrival.routeAtGate, { legProgress: 9 }); },
      (state) => { Object.assign(state.pennywiseGate!.choice!, { goldSpent: 0 }); },
      (state) => { Object.assign(state.pennywiseGate!.completion!, { distance: 70 }); },
      (state) => { Object.assign(state.pennywiseGate!.completion!, { line: "A ferryman grants a bonus." }); },
      (state) => { Object.assign(state.pennywiseGate!.completion!, { sourceCommandId: "depth:9:wait" }); },
      (state) => { Object.assign(state.pennywiseGate!.completion!.routeAfter, { destinationId: "invented-town" }); },
      (state) => { state.hero.gold += 1; },
    ];
    for (const mutate of mutations) {
      const state = JSON.parse(JSON.stringify(paid)) as DepthState;
      expect(isValidCampaignPennywiseGate(state)).toBe(true);
      mutate(state);
      expect(isValidCampaignPennywiseGate(state)).toBe(false);
    }
    expect(() => stepPennywiseGate(ready, { type: "choose-pennywise-gate", gateId: "other-gate", choice: "lift" })).toThrow();
    expect(() => stepPennywiseGate(ready, { ...choice(ready, "lift"), choice: "invented" } as unknown as GateCommand)).toThrow();
  });

  it("leaves old absence untouched and blocks dead, accompanied, unresolved, or owed states", () => {
    expect(isValidCampaignPennywiseGate(before)).toBe(true);
    expect(isValidCampaignPennywiseGate({ ...before, pennywiseGate: null })).toBe(true);
    expect(isValidCampaignPennywiseGate({ ...before, pennywiseGate: undefined } as unknown as DepthState)).toBe(false);
    expect(isValidCampaignPennywiseGate({ ...before, pennywiseGate: {} } as DepthState)).toBe(false);
    const blocked: readonly DepthState[] = [
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 0 } } },
      { ...before, companions: { ...before.companions, active: [{}] as unknown as DepthState["companions"]["active"] } },
      { ...before, completedCombats: [], completedCounterDuels: [] },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" } },
      { ...before, atlas: { ...before.atlas, route: null } },
    ];
    for (const state of blocked) expect(selectPennywiseGateApproach(state)).toBeNull();
    const movedPending = { ...ready, atlas: advanceRoute(ready.atlas, 1) };
    expect(isValidCampaignPennywiseGate(movedPending)).toBe(false);
    expect(selectPennywiseGate(movedPending)).toBeNull();
    expect(isValidCampaignPennywiseGate({ ...ready, tick: ready.tick + 1 })).toBe(false);
    const lifted = commit(ready, choice(ready, "lift"));
    expect(isValidCampaignPennywiseGate({ ...lifted, tick: lifted.tick + 1 })).toBe(false);
  });
});
