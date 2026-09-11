import { beforeAll, describe, expect, it } from "vitest";
import { commitLegalSmithyStroke, naturalSmithyJobBeforeAdmissionFixture, naturalSmithyJobFixture } from "../../tests/smithy-job-fixtures";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectSmithyJobScene } from "./smithy-job-view";
import { projectStatusHistory } from "./status-history";

describe("the admitted one-nail workshop presentation", () => {
  let before: WorldState, admitted: WorldState, drive: WorldState, straight: WorldState, bent: WorldState, unfinished: WorldState;
  beforeAll(() => {
    before = naturalSmithyJobBeforeAdmissionFixture(); admitted = naturalSmithyJobFixture();
    drive = commitLegalSmithyStroke(admitted, "drive"); straight = commitLegalSmithyStroke(drive, "tap");
    bent = commitLegalSmithyStroke(drive, "drive");
    unfinished = commitLegalSmithyStroke(commitLegalSmithyStroke(admitted, "tap"), "tap");
  }, 20_000);

  it("waits for explicit admission, retaining the actual healer host without inventing a smith profession", () => {
    expect(projectSmithyJobScene(before)).toBeNull();
    expect(projectSmithyJobScene(admitted)).toMatchObject({ phase: "admission", strokeCount: 0,
      residentName: "Hale Cooper", residentRole: "healer", locationName: "Elderwatch", smithName: "The Wheel Smithy",
      heroId: admitted.hero.id, commandId: admitted.chronicle.at(-1)!.commandId,
      shape: "in-progress", points: 0, manaBefore: 24, manaSpent: 0, manaAfter: 24,
      goldBefore: 7, goldEarned: 0, goldAfter: 7, headline: "ONE NAIL · 2 GOLD" });
    expect(admitted.depth.smithyJob!.presenceRule).toBe("admitted-together-v1");
    expect(admitted.depth.towns[admitted.depth.atlas.currentLocationId]!.name).not.toBe("Elderwatch");
  });

  it("shows the real first stroke and MP cost without declaring an early result", () => {
    expect(projectSmithyJobScene(drive)).toMatchObject({ phase: "stroke", strokeCount: 1, stroke: "drive", points: 2,
      shape: "in-progress", manaBefore: 24, manaSpent: 1, manaAfter: 23, goldBefore: 7, goldEarned: 0, goldAfter: 7,
      headline: "FOCUSED DRIVE · 1/2", detail: "2/3 points · MP 24→23" });
    expect(drive.depth.smithyJob!.completion).toBeNull();
    expect(drive.depth.hero.resources.health).toBe(admitted.depth.hero.resources.health);
    expect(drive.depth.atlas).toEqual(admitted.depth.atlas);
  });

  it("shows each actual two-stroke shape and only the straight nail's earned wage", () => {
    for (const [world, shape, points, earned, headline] of [
      [straight, "straight", 3, 2, "STRAIGHT · +2 GOLD"],
      [unfinished, "unfinished", 2, 0, "UNFINISHED · NO PAY"],
      [bent, "bent", 4, 0, "BENT · NO PAY"],
    ] as const) {
      expect(projectSmithyJobScene(world)).toMatchObject({ phase: "result", shape, points, strokeCount: 2,
        goldBefore: 7, goldEarned: earned, goldAfter: 7 + earned, headline,
        detail: world.depth.smithyJob!.completion!.line });
      expect(world.depth.hero.inventory).toEqual(admitted.depth.hero.inventory);
      expect(world.depth.hero.experience).toBe(admitted.depth.hero.experience);
      expect(world.depth.quest).toEqual(admitted.depth.quest);
    }
    expect(projectSmithyJobScene(bent)!.detail).toBe("Excellent. A corner nail.");
    const otherStraight = commitLegalSmithyStroke(commitLegalSmithyStroke(admitted, "tap"), "drive");
    expect(projectSmithyJobScene(otherStraight)).toMatchObject({ shape: "straight", goldEarned: 2, manaBefore: 24, manaAfter: 23 });
  });

  it("reconstructs every frozen view without altering any canonical save", () => {
    for (const world of [admitted, drive, straight, bent, unfinished]) {
      const saved = JSON.stringify(world), scene = projectSmithyJobScene(world);
      expect(scene).not.toBeNull(); expect(Object.isFrozen(scene)).toBe(true);
      expect(projectSmithyJobScene(JSON.parse(saved))).toEqual(scene);
      expect(JSON.stringify(world)).toBe(saved);
    }
  });

  it("rejects foreign, stale, wrongly typed or relocated sources and changed resources", () => {
    for (const world of [admitted, drive, straight]) {
      const source = world.chronicle.at(-1)!;
      for (const change of [{ commandId: `foreign:${source.commandId}` }, { tick: world.tick - 1 },
        { commandType: "wait" as const }, { mode: "travel" as const }]) {
        expect(projectSmithyJobScene({ ...world, chronicle: [...world.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
      }
      expect(projectSmithyJobScene({ ...world, campaignId: "foreign" })).toBeNull();
      expect(projectSmithyJobScene({ ...world, hero: { ...world.hero, id: "absent-hero" } })).toBeNull();
      expect(projectSmithyJobScene({ ...world, scene: { ...world.scene, mode: "travel" } })).toBeNull();
      expect(projectSmithyJobScene({ ...world, depth: { ...world.depth, hero: { ...world.depth.hero, gold: world.depth.hero.gold + 1 } } })).toBeNull();
      expect(projectSmithyJobScene({ ...world, depth: { ...world.depth, atlas: { ...world.depth.atlas, currentLocationId: "location:8" } } })).toBeNull();
    }
  });

  it("keeps exact receipts in existing Status and returns to ordinary play without replaying the job", () => {
    for (const world of [admitted, drive, straight, bent, unfinished]) {
      const source = world.chronicle.at(-1)!;
      const row = projectStatusHistory(world).find(entry => entry.source === "chronicle" && entry.eventId === source.id);
      if (row?.source !== "chronicle") throw new Error("Missing actual smithy Status event");
      expect(row.decision.commandId).toBe(source.commandId);
      expect(row.consequence).toBe(world.scene.consequence);
    }
    const after = advanceWorld(straight);
    expect(projectSmithyJobScene(after)).toBeNull();
    expect(after.depth.smithyJob).toEqual(straight.depth.smithyJob);
    expect(after.chronicle.at(-1)!.commandType).not.toBe("smithy-stroke");
  });
});
