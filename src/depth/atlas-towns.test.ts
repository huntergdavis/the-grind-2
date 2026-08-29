import { describe, expect, it } from "vitest";
import { advanceRoute, findRoute, generateAtlas, neighboringLocationIds, planRoute } from "./atlas";
import { generateTown, visitTown } from "./towns";

describe("persistent world atlas", () => {
  it("generates a deterministic connected graph", () => {
    const atlas = generateAtlas("atlas-seed", 24);
    expect(generateAtlas("atlas-seed", 24)).toEqual(atlas);
    const reached = new Set<string>([atlas.currentLocationId]);
    const queue = [atlas.currentLocationId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const neighbor of neighboringLocationIds(atlas, current)) {
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(reached.size).toBe(atlas.locations.length);
    expect(atlas.edges.length).toBeGreaterThanOrEqual(atlas.locations.length - 1);
  });

  it("builds and advances a real multi-leg route", () => {
    const atlas = generateAtlas("route-seed", 16);
    const destination = atlas.locations.at(-1)?.id;
    if (destination === undefined) throw new Error("Atlas has no destination");
    const path = findRoute(atlas, destination);
    expect(path.length).toBeGreaterThan(2);
    const planned = planRoute(atlas, destination);
    expect(planned.route?.path).toEqual(path);
    const halfway = advanceRoute(planned, Math.floor((planned.route?.totalDistance ?? 0) / 2));
    expect(halfway.route?.distanceTravelled).toBeGreaterThan(0);
    const arrived = advanceRoute(halfway, planned.route?.totalDistance ?? 0);
    expect(arrived.currentLocationId).toBe(destination);
    expect(arrived.route).toBeNull();
    expect(arrived.discoveredLocationIds.length).toBeGreaterThan(1);
  });

  it("bounds oversized atlas requests", () => {
    expect(generateAtlas("huge", 10_000).locations).toHaveLength(48);
    expect(generateAtlas("tiny", -1).locations).toHaveLength(4);
  });
});

describe("generated towns", () => {
  it("persists deterministic, location-specific districts, buildings, and residents", () => {
    const first = generateTown("town-seed", "location:0");
    const replay = generateTown("town-seed", "location:0");
    const elsewhere = generateTown("town-seed", "location:4");
    expect(replay).toEqual(first);
    expect(elsewhere).not.toEqual(first);
    expect(first.districts.length).toBeGreaterThanOrEqual(3);
    expect(first.buildings.length).toBeGreaterThan(first.districts.length);
    expect(first.residents.length).toBeGreaterThan(first.buildings.length);
    for (const district of first.districts) {
      expect(district.buildingIds.every((id) => first.buildings.some((building) => building.id === id))).toBe(true);
    }
    for (const building of first.buildings) {
      expect(first.districts.some((district) => district.id === building.districtId)).toBe(true);
      expect(building.residentIds.every((id) => first.residents.some((resident) => resident.id === id))).toBe(true);
    }
  });

  it("preserves generated identity while visits and reputation change", () => {
    const town = generateTown("town-persistence", "location:8");
    const visited = visitTown(visitTown(town));
    expect(visited.name).toBe(town.name);
    expect(visited.districts).toEqual(town.districts);
    expect(visited.visits).toBe(2);
    expect(visited.reputation).toBe(2);
  });
});
