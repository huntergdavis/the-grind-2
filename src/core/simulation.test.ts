import { describe, expect, it } from "vitest";
import {
  actorPolicy,
  advanceWorld,
  campaignDirector,
  catchUpWorld,
  createWorld,
  upgradeWorldState,
} from "./simulation";

describe("autonomous simulation", () => {
  it("replays exactly from a seed", () => {
    let left = createWorld("replay-seed", "campaign");
    let right = createWorld("replay-seed", "campaign");
    for (let index = 0; index < 250; index += 1) {
      left = advanceWorld(left);
      right = advanceWorld(right);
    }
    expect(left).toEqual(right);
  });

  it("records alternatives and actor rationale", () => {
    const world = createWorld("choice-seed", "campaign");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(choice.consideredActions.length).toBeGreaterThan(1);
    expect(choice.consideredActions).toContain(choice.action);
    expect(choice.rationale).toContain(world.hero.name);
  });

  it("keeps eternal progression bounded while mastery continues", () => {
    let world = createWorld("forever-seed", "campaign");
    for (let index = 0; index < 20_000; index += 1) world = advanceWorld(world);
    expect(world.hero.level).toBe(50);
    expect(world.hero.mastery).toBeGreaterThan(0);
    expect(world.hero.health).toBeGreaterThan(0);
  });

  it("bounds the live chronicle without duplicate event ids", () => {
    let world = createWorld("chronicle-seed", "campaign");
    for (let index = 0; index < 10_000; index += 1) world = advanceWorld(world);
    expect(world.chronicle).toHaveLength(32);
    expect(new Set(world.chronicle.map((entry) => entry.id)).size).toBe(32);
  });

  it("bounds seven-day catch-up and stops before an attention threshold", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const caughtUp = catchUpWorld(world, {
      id: "observation:seven-days",
      observedAtMs: 604_800_000,
      elapsedMs: 604_800_000,
      requestedTicks: 126_000,
    });

    expect(caughtUp.tick).toBe(2);
    expect(caughtUp.chronicle.every((entry) => entry.attention === "backgroundSafe")).toBe(
      true,
    );
    expect(caughtUp.pendingAttention).toHaveLength(1);
    expect(caughtUp.pendingAttention[0]?.mode).toBe("dungeon");
    expect(caughtUp.lifecycle.wallClockJournal[0]).toMatchObject({
      creditedTicks: 96,
      appliedTicks: 2,
      stoppedAtEventId: "campaign:3:attention",
    });
  });

  it("does not apply the same wall-clock observation twice", () => {
    const world = createWorld("catch-up-seed", "campaign");
    const request = {
      id: "observation:repeat",
      observedAtMs: 50_000,
      elapsedMs: 50_000,
      requestedTicks: 10,
    };
    const once = catchUpWorld(world, request);
    expect(catchUpWorld(once, request)).toBe(once);
  });

  it("upgrades released schema-one saves with lifecycle defaults", () => {
    const current = createWorld("migration-seed", "campaign");
    const legacy = {
      ...current,
      schemaVersion: 1,
      lifecycle: undefined,
      pendingAttention: undefined,
      chronicle: current.chronicle.map(({ policy: _policy, ...entry }) => entry),
    };
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.lifecycle.simulationTick).toBe(upgraded.tick);
    expect(upgraded.pendingAttention).toEqual([]);
  });
});
