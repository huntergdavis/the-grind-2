import { describe, expect, it } from "vitest";
import { advanceRoute, findRoute, generateAtlas, planRoute } from "../depth/atlas";
import { projectRoute } from "./route-projection";

describe("route projection", () => {
  it("projects the current real edge and advances within it", () => {
    const atlas = generateAtlas("projection", 20);
    const destination = atlas.locations.at(-1)?.id;
    if (destination === undefined) throw new Error("Atlas has no destination");
    const path = findRoute(atlas, destination);
    expect(path.length).toBeGreaterThan(2);

    const planned = planRoute(atlas, destination);
    const start = projectRoute(planned);
    expect(start).toMatchObject({ fromId: path[0], toId: path[1], legIndex: 0, legRatio: 0, routeRatio: 0 });
    if (start === null) throw new Error("Route projection is missing");

    const advanced = advanceRoute(planned, Math.max(1, Math.floor(start.legDistance / 2)));
    const progress = projectRoute(advanced);
    expect(progress?.edgeId).toBe(start.edgeId);
    expect(progress?.legRatio).toBeGreaterThan(0);
    expect(progress?.legRatio).toBeLessThan(1);
    expect(progress?.routeRatio).toBeGreaterThan(0);
  });

  it("moves onto the next projected edge and survives serialization", () => {
    const generated = generateAtlas("projection-save", 20);
    const destination = generated.locations.at(-1)?.id;
    if (destination === undefined) throw new Error("Atlas has no destination");
    const planned = planRoute(generated, destination);
    const first = projectRoute(planned);
    if (first === null) throw new Error("Route projection is missing");

    const nextLeg = advanceRoute(planned, first.legDistance + 1);
    const restored = JSON.parse(JSON.stringify(nextLeg)) as typeof nextLeg;
    const projection = projectRoute(restored);
    expect(projection?.legIndex).toBe(1);
    expect(projection?.fromId).toBe(planned.route?.path[1]);
    expect(projection?.toId).toBe(planned.route?.path[2]);
    expect(projection?.legProgress).toBe(1);
  });

  it("returns no projection while the party is at a location", () => {
    expect(projectRoute(generateAtlas("projection-idle"))).toBeNull();
  });

  it("projects complementary forward and reverse progress to the same terrain point", () => {
    const atlas = generateAtlas("projection-reverse", 12);
    const edge = atlas.edges[0];
    if (edge === undefined) throw new Error("Atlas edge is missing");
    const forwardProgress = Math.max(1, Math.floor(edge.distance * 0.37));
    const forward = projectRoute({
      ...atlas,
      currentLocationId: edge.from,
      route: {
        destinationId: edge.to,
        path: [edge.from, edge.to],
        legIndex: 0,
        legProgress: forwardProgress,
        distanceTravelled: forwardProgress,
        totalDistance: edge.distance,
      },
    });
    const reverseProgress = edge.distance - forwardProgress;
    const reverse = projectRoute({
      ...atlas,
      currentLocationId: edge.to,
      route: {
        destinationId: edge.from,
        path: [edge.to, edge.from],
        legIndex: 0,
        legProgress: reverseProgress,
        distanceTravelled: reverseProgress,
        totalDistance: edge.distance,
      },
    });
    expect(reverse).toMatchObject({ terrainX: forward?.terrainX, terrainY: forward?.terrainY });
  });
});
