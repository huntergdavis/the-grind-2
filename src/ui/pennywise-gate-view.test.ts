import { beforeAll, describe, expect, it } from "vitest";
import { naturalPennywiseGateApproachFixture, naturalPennywiseGateFixture } from "../../tests/pennywise-gate-fixtures";
import { actorPolicy, advanceWorld, campaignDirector, rulesEngine } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectPennywiseGateScene } from "./pennywise-gate-view";
import { projectStatusHistory } from "./status-history";

/** Choose a genuinely offered alternative, without staging gold, a road, or its outcome. */
function choose(world: WorldState, choice: "pay" | "lift"): WorldState {
  const opportunity = campaignDirector(world);
  const candidate = opportunity.candidates.find(entry => entry.command.type === "choose-pennywise-gate" && entry.command.choice === choice)!;
  return rulesEngine(world, opportunity, { ...actorPolicy(world, opportunity), command: candidate.command,
    commandId: `${world.campaignId}:${candidate.id}`, action: candidate.label,
    rationale: "Explicit presentation check of this legal road-gate choice.",
    consideredCommandIds: opportunity.candidates.map(entry => `${world.campaignId}:${entry.id}`) });
}

describe("Pennywise Gate's source-bound road presentation", () => {
  let before: WorldState, arrived: WorldState, paid: WorldState, lifting: WorldState, passed: WorldState;
  beforeAll(() => {
    before = naturalPennywiseGateApproachFixture(); arrived = naturalPennywiseGateFixture();
    paid = choose(arrived, "pay"); lifting = choose(arrived, "lift"); passed = advanceWorld(lifting);
  }, 20_000);

  it("waits for the actual clipped approach and shows the public price at a real road point", () => {
    expect(projectPennywiseGateScene(before)).toBeNull();
    expect(projectPennywiseGateScene(arrived)).toMatchObject({ phase: "approach", heroId: arrived.hero.id,
      commandId: arrived.chronicle.at(-1)!.commandId, edgeId: "location:0~location:8",
      nearPointIndex: 313, farPointIndex: 312, nearProgress: 8, farProgress: 15,
      distanceBefore: before.depth.atlas.route!.distanceTravelled, distanceAfter: 8,
      goldBefore: arrived.depth.hero.gold, goldSpent: 0, goldAfter: arrived.depth.hero.gold,
      headline: "PENNYWISE GATE", detail: "2 GOLD, OR LIFT THE BAR" });
    expect(arrived.depth.atlas.route!.legProgress).toBe(8);
    expect(arrived.depth.atlas.currentLocationId).toBe(before.depth.atlas.currentLocationId);
    expect(arrived.depth.atlas.terrain).toEqual(before.depth.atlas.terrain);
    expect(arrived.depth.atlas.edges).toEqual(before.depth.atlas.edges);
  });

  it("shows a paid passage only after spending two real gold and advancing seven real miles", () => {
    const goldBefore = arrived.depth.hero.gold;
    expect(projectPennywiseGateScene(paid)).toMatchObject({ phase: "paid", goldBefore, goldSpent: 2, goldAfter: goldBefore - 2,
      distanceBefore: 8, distanceAfter: 15, headline: "PAID PASSAGE",
      detail: paid.depth.pennywiseGate!.completion!.line, compactDetail: "2 GOLD · ROAD +7" });
    expect(paid.depth.atlas.route!.legProgress).toBe(15);
    expect(paid.depth.hero.gold).toBe(goldBefore - 2);
    expect(paid.depth.hero.resources).toEqual(arrived.depth.hero.resources);
    expect(paid.depth.hero.inventory).toEqual(arrived.depth.hero.inventory);
    expect(paid.depth.hero.experience).toBe(arrived.depth.hero.experience);
    expect(paid.depth.quest).toEqual(arrived.depth.quest);
  });

  it("keeps lifting stationary, then moves through on a distinct actual command", () => {
    expect(projectPennywiseGateScene(lifting)).toMatchObject({ phase: "lifting", distanceBefore: 8, distanceAfter: 8,
      goldBefore: arrived.depth.hero.gold, goldSpent: 0, goldAfter: arrived.depth.hero.gold, headline: "LIFTING THE BAR" });
    expect(lifting.depth.atlas).toEqual(arrived.depth.atlas);
    expect(lifting.depth.hero).toEqual(arrived.depth.hero);
    expect(lifting.depth.pennywiseGate!.completion).toBeNull();
    expect(passed.chronicle.at(-1)!.commandType).toBe("pass-pennywise-gate");
    expect(projectPennywiseGateScene(passed)).toMatchObject({ phase: "passed", distanceBefore: 8, distanceAfter: 15,
      goldBefore: arrived.depth.hero.gold, goldSpent: 0, goldAfter: arrived.depth.hero.gold, headline: "FREE PASSAGE", detail: "Free passage. Some lifting required." });
    expect(passed.depth.atlas).toEqual(paid.depth.atlas);
    expect(passed.depth.hero).toEqual(arrived.depth.hero);
  });

  it("reconstructs each exact frozen scene after reload without mutating state", () => {
    for (const state of [arrived, paid, lifting, passed]) {
      const saved = JSON.stringify(state), scene = projectPennywiseGateScene(state)!;
      expect(Object.isFrozen(scene)).toBe(true);
      expect(projectPennywiseGateScene(JSON.parse(saved))).toEqual(scene);
      expect(JSON.stringify(state)).toBe(saved);
    }
  });

  it("accepts equivalent current routes whose saved properties have a different order", () => {
    for (const state of [arrived, lifting, paid, passed]) {
      const route = state.depth.atlas.route!;
      const reordered = Object.fromEntries(Object.entries(route).reverse()) as typeof route;
      expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(route));
      const restored: WorldState = { ...state, depth: { ...state.depth,
        atlas: { ...state.depth.atlas, route: reordered } } };
      expect(projectPennywiseGateScene(restored)).toEqual(projectPennywiseGateScene(state));
      expect(projectPennywiseGateScene(restored)).not.toBeNull();
    }
  });

  it("rejects foreign, stale, wrong-command and changed-route or hero ownership", () => {
    for (const state of [arrived, paid, lifting, passed]) {
      const source = state.chronicle.at(-1)!;
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { commandType: "wait" as const },
        { tick: state.tick - 1 }, { mode: "battle" as const }]) {
        expect(projectPennywiseGateScene({ ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectPennywiseGateScene({ ...state, hero: { ...state.hero, id: "another-hero" } })).toBeNull();
      expect(projectPennywiseGateScene({ ...state, campaignId: "another-campaign" })).toBeNull();
      expect(projectPennywiseGateScene({ ...state, scene: { ...state.scene, mode: "town" } })).toBeNull();
      expect(projectPennywiseGateScene({ ...state, depth: { ...state.depth, atlas: { ...state.depth.atlas, route: null } } })).toBeNull();
    }
  });

  it("retains exact source and resource facts in existing Status, then restores ordinary travel", () => {
    for (const state of [paid, lifting, passed]) {
      const source = state.chronicle.at(-1)!;
      const row = projectStatusHistory(state).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
      if (row?.source !== "chronicle") throw new Error("Missing source-bound road gate Status entry");
      expect(row.decision.commandId).toBe(source.commandId);
      expect(row.consequence).toBe(state.scene.consequence);
    }
    const after = advanceWorld(passed);
    expect(after.depth.pennywiseGate).toEqual(passed.depth.pennywiseGate);
    expect(projectPennywiseGateScene(after)).toBeNull();
    expect(after.chronicle.at(-1)!.commandType).toBe("travel");
  });
});
