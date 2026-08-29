import { describe, expect, it } from "vitest";
import { edgeBetween, neighboringLocationIds } from "../depth";
import { actorPolicy } from "./actor-policy";
import { maximumRecentJourneyEntries } from "./forward-motion";
import { advanceWorld, campaignDirector, createWorld, rulesEngine, upgradeWorldState } from "./simulation";
import type { DirectedJourneyLeg, WorldState } from "./types";

function atJunction(seed: string): { world: WorldState; fromId: string; junctionId: string; alternateId: string } {
  const initial = createWorld(seed, `campaign:${seed}`);
  const junction = initial.depth.atlas.locations.find(
    (location) => neighboringLocationIds(initial.depth.atlas, location.id).length >= 2,
  );
  if (junction === undefined) throw new Error("Forward-motion fixture needs a junction");
  const [fromId, alternateId] = neighboringLocationIds(initial.depth.atlas, junction.id);
  if (fromId === undefined || alternateId === undefined) throw new Error("Forward-motion fixture needs two roads");
  const arrivedTick = 10;
  const leg: DirectedJourneyLeg = {
    fromLocationId: fromId,
    toLocationId: junction.id,
    plannedTick: 4,
    arrivedTick,
    reason: "least-recent",
  };
  return {
    fromId,
    junctionId: junction.id,
    alternateId,
    world: {
      ...initial,
      tick: arrivedTick,
      hero: { ...initial.hero, values: ["mercy", "loyalty"] },
      depth: {
        ...initial.depth,
        tick: arrivedTick,
        atlas: {
          ...initial.depth.atlas,
          currentLocationId: junction.id,
          discoveredLocationIds: initial.depth.atlas.locations.map((location) => location.id),
        },
      },
      lifecycle: {
        ...initial.lifecycle,
        simulationTick: arrivedTick,
        worldClockMinutes: arrivedTick * 15,
      },
      forwardMotion: {
        schemaVersion: 1,
        recentLocationIds: [fromId, junction.id],
        recentLegs: [leg],
        decisionsSinceProgress: 2,
        lastProgressTick: 8,
        activeDirective: null,
      },
    },
  };
}

describe("Game Master forward motion", () => {
  it("removes an immediate reverse before personality ranking when another road exists", () => {
    const { world, fromId, alternateId } = atJunction("forward-junction");
    const opportunity = campaignDirector(world);
    const destinations = opportunity.candidates.flatMap((candidate) =>
      candidate.command.type === "plan-route" ? [candidate.command.destinationId] : [],
    );
    expect(destinations).not.toContain(fromId);
    expect(destinations).toContain(alternateId);
    expect(opportunity.forwardMotionReason).toBe("avoid-immediate-reverse");
    const choice = actorPolicy(world, opportunity);
    expect(choice.command).not.toEqual({ type: "plan-route", destinationId: fromId });
    expect(choice.trace.forwardMotionReason).toBe("avoid-immediate-reverse");
  });

  it("allows the reverse road with an honest reason when it is the only exit", () => {
    const { world, fromId, junctionId } = atJunction("forward-leaf");
    const onlyEdge = edgeBetween(world.depth.atlas, fromId, junctionId);
    const leafWorld: WorldState = {
      ...world,
      depth: { ...world.depth, atlas: { ...world.depth.atlas, edges: [onlyEdge] } },
    };
    const opportunity = campaignDirector(leafWorld);
    expect(opportunity.candidates).toHaveLength(1);
    expect(opportunity.candidates[0]?.command).toEqual({ type: "plan-route", destinationId: fromId });
    expect(opportunity.forwardMotionReason).toBe("only-open-road");
  });

  it("keeps journey memory bounded and prevents available immediate reversals", () => {
    for (let campaign = 0; campaign < 12; campaign += 1) {
      let world = createWorld(`forward-soak:${campaign}`, `campaign:${campaign}`);
      for (let step = 0; step < 400; step += 1) {
        const opportunity = campaignDirector(world);
        const lastLeg = world.forwardMotion.recentLegs.at(-1);
        if (opportunity.candidates.every((candidate) => candidate.command.type === "plan-route") && lastLeg !== undefined) {
          const rawNeighbors = neighboringLocationIds(world.depth.atlas, world.depth.atlas.currentLocationId);
          if (rawNeighbors.length > 1) {
            const destinations = opportunity.candidates.flatMap((candidate) =>
              candidate.command.type === "plan-route" ? [candidate.command.destinationId] : [],
            );
            expect(destinations).not.toContain(lastLeg.fromLocationId);
          }
        }
        world = advanceWorld(world);
        expect(world.forwardMotion.recentLegs.length).toBeLessThanOrEqual(maximumRecentJourneyEntries);
        expect(world.forwardMotion.recentLocationIds.length).toBeLessThanOrEqual(maximumRecentJourneyEntries);
        expect(world.forwardMotion.decisionsSinceProgress).toBeLessThanOrEqual(8);
      }
      expect(new TextEncoder().encode(JSON.stringify(world.forwardMotion)).byteLength).toBeLessThan(2_048);
    }
  }, 20_000);

  it("persists one route directive through interruption and records arrival once", () => {
    let world = createWorld("forward-route-life", "campaign:forward-route-life");
    world = advanceWorld(world);
    const directive = world.forwardMotion.activeDirective;
    expect(world.depth.atlas.route).not.toBeNull();
    expect(directive).not.toBeNull();
    expect(world.forwardMotion.recentLegs).toEqual([]);
    let steps = 0;
    while (world.depth.atlas.route !== null && steps < 100) {
      world = advanceWorld(world);
      if (world.depth.atlas.route !== null) expect(world.forwardMotion.activeDirective).toEqual(directive);
      steps += 1;
    }
    expect(steps).toBeLessThan(100);
    expect(world.forwardMotion.activeDirective).toBeNull();
    expect(world.forwardMotion.recentLegs.length).toBeGreaterThan(0);
    expect(world.forwardMotion.recentLegs.at(-1)?.toLocationId).toBe(world.depth.atlas.currentLocationId);
    expect(world.forwardMotion.recentLocationIds.at(-1)).toBe(world.depth.atlas.currentLocationId);
  });

  it("migrates an active schema-four route without inventing history", () => {
    let current = createWorld("forward-migration", "campaign:forward-migration");
    while (current.depth.atlas.route === null) current = advanceWorld(current);
    const legacy = JSON.parse(JSON.stringify(current)) as Record<string, unknown> & {
      lifecycle: Record<string, unknown>;
      depth: WorldState["depth"];
    };
    legacy.schemaVersion = 4;
    legacy.lifecycle.policyVersion = 1;
    delete legacy.forwardMotion;
    const upgraded = upgradeWorldState(legacy);
    expect(upgraded.schemaVersion).toBe(5);
    expect(upgraded.lifecycle.policyVersion).toBe(2);
    expect(upgraded.depth).toEqual(current.depth);
    expect(upgraded.forwardMotion.recentLocationIds).toEqual([current.depth.atlas.currentLocationId]);
    expect(upgraded.forwardMotion.recentLegs).toEqual([]);
    expect(upgraded.forwardMotion.activeDirective).toBeNull();
  });

  it("rejects malformed forward-motion history at the save boundary", () => {
    const current = createWorld("forward-invalid", "campaign:forward-invalid");
    const malformed = {
      ...current,
      forwardMotion: {
        ...current.forwardMotion,
        recentLocationIds: [...current.forwardMotion.recentLocationIds, "location:unknown"],
      },
    };
    expect(() => upgradeWorldState(malformed)).toThrow("schema invariants");
  });

  it("rejects a forged Game Master reason at the reducer boundary", () => {
    const world = createWorld("forward-forged", "campaign:forward-forged");
    const opportunity = campaignDirector(world);
    const choice = actorPolicy(world, opportunity);
    expect(() => rulesEngine(world, { ...opportunity, forwardMotionReason: "only-open-road" }, choice)).toThrow(
      "non-canonical opportunity",
    );
  });
});
