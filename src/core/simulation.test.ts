import { describe, expect, it } from "vitest";
import { actorPolicy, advanceWorld, campaignDirector, createWorld } from "./simulation";

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
});
