import { describe, expect, it } from "vitest";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { createForwardMotionState } from "../core/forward-motion";
import { stepDepth } from "../depth/state";
import { generateTown, visitTown } from "../depth/towns";
import { projectCompanionFarewell } from "./companion-farewell";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function eligibleWorld(seed: string): WorldState {
  const base = createWorld(seed, `campaign:${seed}`);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== originId,
  );
  if (current === undefined) throw new Error("Farewell fixture needs a second town");
  const town = visitTown(generateTown(seed, current.id));
  return upgradeWorldState({
    ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: {
      ...base.depth,
      atlas: {
        ...base.depth.atlas,
        currentLocationId: current.id,
        discoveredLocationIds: [originId, current.id],
        route: null,
      },
      towns: { ...base.depth.towns, [current.id]: town },
    },
  });
}

function arrivedWorld(seed: string): WorldState {
  let world = eligibleWorld(seed);
  for (let step = 0; step < 96; step += 1) {
    const command = campaignDirector(world).candidates[0]?.command;
    if (command?.type === "farewell-companion") return world;
    world = advanceWorld(world);
  }
  throw new Error("Farewell fixture never reached the destination");
}

function resolveFarewell(seed: string, injury: "none" | "fallen" = "none", victories?: number) {
  let before = arrivedWorld(seed);
  const active = before.depth.companions.active[0];
  if (active === undefined) throw new Error("Farewell fixture has no arrived companion");
  if (injury !== "none" || victories !== undefined || active.injury !== "none") {
    const nextActive = {
      ...active,
      ...(victories === undefined ? {} : { victories }),
      ...(injury === "none" ? {
        injury: "none" as const,
        resources: { ...active.resources, health: active.combat.maxHealth },
      } : {
        injury,
        resources: { ...active.resources, health: 0 },
      }),
    };
    before = upgradeWorldState({
      ...before,
      depth: {
        ...before.depth,
        companions: { ...before.depth.companions, active: [nextActive] },
      },
    });
  }
  const after = advanceWorld(before);
  const source = after.chronicle.at(-1);
  if (source === undefined) throw new Error("Farewell fixture produced no Chronicle event");
  return { before, after, source };
}

describe("companion farewell projection", () => {
  it("projects the exact fulfilled Shared Road departure, including a quiet road", () => {
    const { before, after, source } = resolveFarewell("farewell-fulfilled", "none", 0);
    const active = before.depth.companions.active[0]!;
    expect(source.commandId).toBe(`${before.campaignId}:depth:${after.depth.tick}:companion:farewell:${active.identity.residentId}`);
    expect(after.depth).toEqual(stepDepth(before.depth, { type: "farewell-companion", residentId: active.identity.residentId }));
    expect(after.hero).toEqual(before.hero);
    expect(after.chronicle).toEqual([...before.chronicle.slice(-31), source]);
    expect(after.scene).toEqual({
      mode: source.mode,
      location: source.location,
      headline: source.headline,
      action: source.action,
      goal: source.goal,
      consequence: source.consequence,
      sensoryIntensity: source.sensoryIntensity,
    });
    const departed = after.depth.companions.former.at(-1)!;
    const origin = after.depth.towns[departed.identity.originLocationId];
    const destinations = after.depth.atlas.locations.filter((location) => location.id === departed.destination.locationId);
    expect(active.phase).toBe("arrived");
    expect(before.depth.atlas.currentLocationId).toBe(active.destination.locationId);
    expect(after.depth.companions.active).toEqual([]);
    expect(departed.identity.residentId).toBe(active.identity.residentId);
    expect(departed.departure).toEqual({ tick: after.depth.tick, locationId: active.destination.locationId, outcome: "fulfilled" });
    expect(origin).toMatchObject({ id: departed.identity.originTownId, locationId: departed.identity.originLocationId });
    expect(destinations).toHaveLength(1);
    expect(destinations[0]).toMatchObject({ kind: "town", name: departed.destination.name });
    expect(after.depth.atlas.discoveredLocationIds).toContain(origin?.locationId);
    expect(after.depth.atlas.discoveredLocationIds).toContain(destinations[0]?.id);
    const packet = projectCompanionFarewell(before, after, source);
    expect(packet).toMatchObject({
      schemaVersion: 1,
      commandType: "farewell-companion",
      heroId: before.hero.id,
      companionId: active.identity.residentId,
      companionName: active.identity.name,
      profession: active.identity.role,
      disposition: active.identity.disposition,
      originTownId: active.identity.originTownId,
      originLocationId: active.identity.originLocationId,
      destinationId: active.destination.locationId,
      destinationName: active.destination.name,
      purpose: "shared-road-oath",
      joinedTick: active.joinedTick,
      outcome: "fulfilled",
      injury: "none",
      health: active.resources.health,
      maxHealth: active.combat.maxHealth,
      victories: 0,
      bond: active.bond,
    });
    expect(packet?.departureTick).toBe(packet?.tick);
    expect(packet?.originName.length).toBeGreaterThan(0);
  });

  it("projects an injured arrival without healing or softening its facts", () => {
    const { before, after, source } = resolveFarewell("farewell-injured", "fallen", 2);
    const packet = projectCompanionFarewell(before, after, source);
    expect(packet).toMatchObject({
      outcome: "injured",
      injury: "fallen",
      health: 0,
      victories: 2,
    });
    expect(packet?.maxHealth).toBeGreaterThan(0);
  });

  it("is frozen, JSON-stable, and does not mutate either world or source", () => {
    const { before, after, source } = resolveFarewell("farewell-stable");
    const beforeSnapshot = clone(before);
    const afterSnapshot = clone(after);
    const sourceSnapshot = clone(source);
    const first = projectCompanionFarewell(before, after, sourceSnapshot);
    const second = projectCompanionFarewell(clone(before), clone(after), clone(source));
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(before).toEqual(beforeSnapshot);
    expect(after).toEqual(afterSnapshot);
    expect(source).toEqual(sourceSnapshot);
  });

  it("fails closed for unrelated, replayed, forged, or incomplete departures", () => {
    const { before, after, source } = resolveFarewell("farewell-forged");
    const departed = after.depth.companions.former.at(-1)!;
    const cases: readonly [WorldState, WorldState, typeof source][] = [
      [before, after, { ...source, commandType: "wait" }],
      [before, after, { ...source, commandId: `${source.commandId}:forged` }],
      [before, { ...after, tick: after.tick + 1 }, source],
      [{ ...before, chronicle: [...before.chronicle, source] }, after, source],
      [before, { ...after, hero: { ...after.hero, gold: after.hero.gold + 1 } }, source],
      [before, {
        ...after,
        depth: {
          ...after.depth,
          companions: {
            ...after.depth.companions,
            former: [{ ...departed, identity: { ...departed.identity, name: "Invented Traveler" } }],
          },
        },
      }, source],
      [before, {
        ...after,
        depth: {
          ...after.depth,
          companions: {
            ...after.depth.companions,
            former: [{ ...departed, victories: departed.victories + 1 }],
          },
        },
      }, source],
      [before, {
        ...after,
        depth: { ...after.depth, companions: { ...after.depth.companions, former: [] } },
      }, source],
    ];
    for (const [caseBefore, caseAfter, caseSource] of cases) {
      expect(projectCompanionFarewell(caseBefore, caseAfter, caseSource)).toBeNull();
    }
  });
});
