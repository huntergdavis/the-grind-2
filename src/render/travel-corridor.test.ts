import { describe, expect, it } from "vitest";
import type { DirectedJourneyLeg } from "../core/types";
import { generateAtlas } from "../depth/atlas";
import type { AtlasEdge, AtlasState } from "../depth/types";
import { projectTravelCorridor, projectTravelHeroX, travelBiomeVisuals } from "./travel-corridor";

function atlasOnEdge(atlas: AtlasState, edge: AtlasEdge, fromId: string, progress: number): AtlasState {
  const toId = edge.from === fromId ? edge.to : edge.from;
  return {
    ...atlas,
    currentLocationId: fromId,
    route: {
      destinationId: toId,
      path: [fromId, toId],
      legIndex: 0,
      legProgress: progress,
      distanceTravelled: progress,
      totalDistance: edge.distance,
    },
  };
}

function usefulEdge(atlas: AtlasState): AtlasEdge {
  const edge = atlas.edges.find((candidate) => candidate.pathPointIndices.length >= 5);
  if (edge === undefined) throw new Error("Atlas has no useful travel edge");
  return edge;
}

describe("travel corridor", () => {
  it("derives bounded visible terrain from the exact oriented route", () => {
    const atlas = generateAtlas("travel-corridor", 20);
    const edge = usefulEdge(atlas);
    const progress = Math.floor(edge.distance * 0.43);
    const corridor = projectTravelCorridor(atlasOnEdge(atlas, edge, edge.from, progress));
    expect(corridor).not.toBeNull();
    expect(corridor?.edgeTerrain).toBe(edge.terrain);
    expect(corridor?.direction).toBe(`${edge.from}:${edge.to}`);
    expect(corridor?.nearby.length).toBeLessThanOrEqual(9);
    expect(corridor?.nearby.some((sample) => sample.pointIndex === corridor.projection.startPointIndex)).toBe(true);
    expect(corridor?.biome).toBe(atlas.terrain.points[
      corridor?.projection.segmentRatio !== undefined && corridor.projection.segmentRatio < 0.5
        ? corridor.projection.startPointIndex
        : corridor?.projection.endPointIndex ?? -1
    ]?.biome);
  });

  it("keeps complementary travel at the same world point and reverses signed slope", () => {
    const atlas = generateAtlas("travel-corridor-reverse", 20);
    const edge = usefulEdge(atlas);
    const forwardProgress = Math.max(1, Math.floor(edge.distance * 0.37));
    const forward = projectTravelCorridor(atlasOnEdge(atlas, edge, edge.from, forwardProgress));
    const reverse = projectTravelCorridor(atlasOnEdge(atlas, edge, edge.to, edge.distance - forwardProgress));
    expect(reverse?.projection.terrainX).toBe(forward?.projection.terrainX);
    expect(reverse?.projection.terrainY).toBe(forward?.projection.terrainY);
    expect(reverse?.direction).toBe(`${edge.to}:${edge.from}`);
    expect(reverse?.signedSlope).toBeCloseTo(-(forward?.signedSlope ?? Number.NaN), 8);
  });

  it("shows water only when a canonical crossing enters the local corridor", () => {
    const atlas = generateAtlas("travel-corridor-crossing", 20);
    const sourceEdge = usefulEdge(atlas);
    const middleIndex = Math.floor(sourceEdge.pathPointIndices.length / 2);
    const crossingPointIndex = sourceEdge.pathPointIndices[middleIndex];
    const crossingDistance = sourceEdge.pathDistances[middleIndex];
    if (crossingPointIndex === undefined || crossingDistance === undefined) throw new Error("Crossing fixture is invalid");
    const crossingEdge: AtlasEdge = { ...sourceEdge, terrain: "river", crossingPointIndices: [crossingPointIndex] };
    const crossingAtlas: AtlasState = {
      ...atlas,
      edges: atlas.edges.map((edge) => edge.id === crossingEdge.id ? crossingEdge : edge),
    };
    const corridor = projectTravelCorridor(atlasOnEdge(crossingAtlas, crossingEdge, crossingEdge.from, crossingDistance));
    expect(corridor?.crossing).toMatchObject({ pointIndex: crossingPointIndex, phase: "crossing" });

    const approachIndex = Math.max(0, middleIndex - 2);
    const approachDistance = sourceEdge.pathDistances[approachIndex] ?? 0;
    const approaching = projectTravelCorridor(atlasOnEdge(crossingAtlas, crossingEdge, crossingEdge.from, approachDistance));
    const returning = projectTravelCorridor(atlasOnEdge(crossingAtlas, crossingEdge, crossingEdge.to, crossingEdge.distance - approachDistance));
    expect(returning?.crossing?.offset).toBeCloseTo(-(approaching?.crossing?.offset ?? Number.NaN), 8);

    const withoutCrossing: AtlasState = {
      ...crossingAtlas,
      edges: crossingAtlas.edges.map((edge) => edge.id === crossingEdge.id ? { ...edge, crossingPointIndices: [] } : edge),
    };
    expect(projectTravelCorridor(atlasOnEdge(withoutCrossing, { ...crossingEdge, crossingPointIndices: [] }, crossingEdge.from, crossingDistance))?.crossing).toBeNull();
  });

  it("announces the next canonical biome inside the look-ahead window", () => {
    const atlas = generateAtlas("travel-corridor-transition", 20);
    const edge = usefulEdge(atlas);
    const currentPointIndex = edge.pathPointIndices[0];
    const transitionPointIndex = edge.pathPointIndices[2];
    if (currentPointIndex === undefined || transitionPointIndex === undefined) throw new Error("Biome fixture is invalid");
    const currentBiome = atlas.terrain.points[currentPointIndex]?.biome;
    const transitionBiome = currentBiome === "desert" ? "forest" : "desert";
    const localPointIndices = new Set(edge.pathPointIndices.slice(0, 7));
    const transitionAtlas: AtlasState = {
      ...atlas,
      terrain: {
        ...atlas.terrain,
        points: atlas.terrain.points.map((point, index) => index === transitionPointIndex
          ? { ...point, biome: transitionBiome }
          : localPointIndices.has(index) && currentBiome !== undefined
            ? { ...point, biome: currentBiome }
            : point),
      },
    };
    const corridor = projectTravelCorridor(atlasOnEdge(transitionAtlas, edge, edge.from, 0));
    expect(corridor?.biome).toBe(currentBiome);
    expect(corridor?.lookaheadBiome).toBe(transitionBiome);
  });

  it("projects a just-completed canonical leg as an arrival tableau", () => {
    const atlas = generateAtlas("travel-corridor-arrival", 20);
    const edge = usefulEdge(atlas);
    const arrival: DirectedJourneyLeg = {
      fromLocationId: edge.from,
      toLocationId: edge.to,
      plannedTick: 4,
      arrivedTick: 9,
      reason: "explore-unseen",
    };
    const corridor = projectTravelCorridor({ ...atlas, currentLocationId: edge.to, route: null }, arrival);
    expect(corridor).toMatchObject({ arriving: true, direction: `${edge.from}:${edge.to}` });
    expect(corridor?.projection.legRatio).toBe(1);
    expect(corridor?.projection.terrainX).toBe(atlas.terrain.points[edge.pathPointIndices.at(-1) ?? -1]?.x);
    expect(JSON.parse(JSON.stringify(corridor))).toEqual(corridor);
  });

  it("defines a distinct visual contract for every canonical biome", () => {
    expect(Object.keys(travelBiomeVisuals).sort()).toEqual([
      "coast", "desert", "forest", "grassland", "marsh", "mountain", "ocean", "rainforest", "snow", "tundra",
    ]);
    expect(new Set(Object.values(travelBiomeVisuals).map((visual) => visual.silhouette)).size).toBe(10);
  });

  it("moves the hero monotonically left-to-right within safe design bounds", () => {
    const positions = [0, 0.25, 0.5, 0.75, 1].map(projectTravelHeroX);
    expect(positions).toEqual([48, 104, 160, 216, 272]);
    expect(positions.every((position, index) => index === 0 || position > (positions[index - 1] ?? position))).toBe(true);
  });
});
