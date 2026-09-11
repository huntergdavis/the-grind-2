import { describe, expect, it } from "vitest";
import { commitLegalSmithyStroke, naturalSmithyJobBeforeAdmissionFixture, naturalSmithyJobFixture } from "../../tests/smithy-job-fixtures";
import { advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function reload(world: WorldState): WorldState { return upgradeWorldState(JSON.parse(JSON.stringify(world))); }
function unchangedHistory(before: WorldState, after: WorldState): void {
  for (const key of ["atlas", "towns", "companions", "quest", "completedQuests", "pendingQuestReward", "dungeon", "combat",
    "completedCombats", "counterDuel", "completedCounterDuels", "repartee", "reparteeWitness", "reparteeCallback",
    "usefulReply", "roomChallenge", "bellExpedition", "bellMemory", "companionReunion", "companionCredit", "pennywiseGate"] as const) {
    expect(after.depth[key]).toEqual(before.depth[key]);
  }
}

describe("one real two-stroke smithy job", () => {
  it("admits at the actual workshop, earns a straight nail, then returns to ordinary play with exact saves", () => {
    const before = naturalSmithyJobBeforeAdmissionFixture(), ready = naturalSmithyJobFixture();
    expect(before.depth).not.toHaveProperty("smithyJob");
    expect(before.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    expect(advanceWorld(before)).toEqual(ready);
    expect(ready.depth.hero).toEqual(before.depth.hero); expect(ready.hero).toEqual(before.hero);
    unchangedHistory(before, ready);
    const job = ready.depth.smithyJob!;
    expect(job).toMatchObject({ residentName: "Hale Cooper", residentRole: "healer", presenceRule: "admitted-together-v1",
      admission: { tick: 2, manaBefore: 24, goldBefore: 7 }, strokes: [], completion: null });
    const first = advanceWorld(ready), finished = advanceWorld(first);
    expect(first.depth.smithyJob!.strokes[0]).toMatchObject({ stroke: "drive", pointsBefore: 0, pointsAfter: 2,
      manaBefore: 24, manaSpent: 1, manaAfter: 23 });
    expect(first.depth.hero).toEqual({ ...ready.depth.hero, resources: { ...ready.depth.hero.resources, mana: 23 } });
    expect(first.hero).toEqual(ready.hero);
    expect(finished.depth.smithyJob!.completion).toMatchObject({ shape: "straight", points: 3, goldBefore: 7, goldEarned: 2, goldAfter: 9 });
    expect(finished.depth.hero).toEqual({ ...first.depth.hero, gold: 9 });
    expect(finished.hero).toEqual({ ...first.hero, gold: 9 });
    unchangedHistory(ready, first); unchangedHistory(first, finished);
    for (const world of [before, ready, first, finished]) expect(reload(world)).toEqual(world);
    for (const world of [ready, first, finished]) {
      const receipt = world.depth.smithyJob!, source = receipt.strokes.at(-1) ?? receipt.admission;
      expect(world.scene.mode).toBe("town");
      expect(world.chronicle.at(-1)?.commandId).toBe(`${world.campaignId}:${source.sourceCommandId}`);
    }
    const next = advanceWorld(finished);
    expect(next.depth.smithyJob).toEqual(finished.depth.smithyJob);
    expect(next.depth.hero.gold).toBe(9);
    // The actual next town activity now belongs to Cato's separate inn claim,
    // not a repeated nail job or wage. Its admission spends nothing.
    expect(next.chronicle.at(-1)?.commandType).toBe("start-inn-bluff");
    expect(reload(next)).toEqual(next);
  });

  it("commits all four legal sequences without making unfinished or bent work earn a wage", () => {
    const ready = naturalSmithyJobFixture();
    for (const [firstStroke, secondStroke, shape, spent, earned] of [
      ["tap", "tap", "unfinished", 0, 0], ["tap", "drive", "straight", 1, 2],
      ["drive", "tap", "straight", 1, 2], ["drive", "drive", "bent", 2, 0],
    ] as const) {
      const first = commitLegalSmithyStroke(ready, firstStroke), finished = commitLegalSmithyStroke(first, secondStroke);
      expect(finished.depth.smithyJob!.completion).toMatchObject({ shape, goldEarned: earned });
      expect(finished.depth.hero).toEqual({ ...ready.depth.hero, gold: 7 + earned,
        resources: { ...ready.depth.hero.resources, mana: 24 - spent } });
      expect(finished.hero).toEqual({ ...ready.hero, gold: 7 + earned });
      unchangedHistory(ready, finished);
      expect(reload(first)).toEqual(first); expect(reload(finished)).toEqual(finished);
      expect(campaignDirector(finished).candidates.some(candidate => candidate.command.type === "smithy-stroke"
        || candidate.command.type === "start-smithy-job")).toBe(false);
    }
  });

  it("allows an explicitly curious and courageous policy fixture to overwork the nail honestly", () => {
    const ready = naturalSmithyJobFixture();
    // Deliberate personality-policy fixture, not a claim about the natural Aster journey.
    const experimental = reload({ ...ready, hero: { ...ready.hero, values: ["curiosity", "courage"] } });
    const finished = advanceWorld(advanceWorld(experimental));
    expect(finished.depth.smithyJob!.strokes.map(stroke => stroke.stroke)).toEqual(["drive", "drive"]);
    expect(finished.depth.smithyJob!.completion).toMatchObject({ shape: "bent", goldEarned: 0,
      line: "Excellent. A corner nail." });
    expect(finished.hero.gold).toBe(7); expect(finished.depth.hero.resources.mana).toBe(22);
  });
});
