import { describe, expect, it } from "vitest";
import type { AtlasTerrainPoint } from "./types";
import { generateAtlas, isValidAtlasState, neighboringLocationIds } from "./atlas";
import { buildTerrainNeighbors, generateTerrain } from "./terrain";

describe("fantasy terrain generation", () => {
  it("is stable and bounded across one hundred campaign seeds", () => {
    const signatures = Array.from({ length: 100 }, (_, index) => generateTerrain(`terrain:${index}`).signature);
    const replay = Array.from({ length: 100 }, (_, index) => generateTerrain(`terrain:${index}`).signature);
    expect(replay).toEqual(signatures);
    expect(new Set(signatures).size).toBeGreaterThan(90);
  }, 30_000);

  it("builds a nondegenerate quantized mesh with symmetric adjacency", () => {
    const terrain = generateTerrain("mesh-contract");
    expect(terrain.points.length).toBeLessThanOrEqual(500);
    expect(terrain.points.length).toBeGreaterThan(300);
    const neighbors = buildTerrainNeighbors(terrain);
    for (const point of terrain.points) {
      expect([point.x, point.y, point.elevation, point.filledElevation, point.moisture, point.flux]).toSatisfy(
        (values: number[]) => values.every(Number.isSafeInteger),
      );
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(terrain.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(terrain.height);
      expect(point.moisture).toBeGreaterThanOrEqual(0);
      expect(point.moisture).toBeLessThanOrEqual(1_000);
    }
    for (const triangle of terrain.triangles) {
      const a = terrain.points[triangle.a];
      const b = terrain.points[triangle.b];
      const c = terrain.points[triangle.c];
      if (a === undefined || b === undefined || c === undefined) throw new Error("Triangle point is missing");
      expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).not.toBe(0);
    }
    for (let index = 0; index < neighbors.length; index += 1) {
      for (const neighbor of neighbors[index] ?? []) expect(neighbors[neighbor]).toContain(index);
    }
  });

  it("drains every land point to the sea and traces rivers downhill without cycles", () => {
    const terrain = generateTerrain("hydrology-contract");
    for (let start = 0; start < terrain.points.length; start += 1) {
      const source = terrain.points[start];
      if (source === undefined || source.elevation < terrain.seaLevel) continue;
      const seen = new Set<number>();
      let cursor: number | null = start;
      while (cursor !== null) {
        expect(seen.has(cursor)).toBe(false);
        seen.add(cursor);
        const point: AtlasTerrainPoint | undefined = terrain.points[cursor];
        if (point === undefined) throw new Error("Drainage point is missing");
        if (point.elevation < terrain.seaLevel) break;
        expect(point.downhill).not.toBeNull();
        const downhill = terrain.points[point.downhill ?? -1];
        if (downhill === undefined) throw new Error("Drainage outlet is missing");
        expect(downhill.filledElevation).toBeLessThan(point.filledElevation);
        cursor = point.downhill;
      }
      const outlet = terrain.points[cursor ?? -1];
      expect(outlet?.elevation).toBeLessThan(terrain.seaLevel);
    }
    expect(terrain.rivers.length).toBeGreaterThan(2);
    for (const river of terrain.rivers) {
      expect(new Set(river.pointIndices).size).toBe(river.pointIndices.length);
      for (let index = 0; index < river.pointIndices.length - 1; index += 1) {
        const upstreamIndex = river.pointIndices[index];
        const downstreamIndex = river.pointIndices[index + 1];
        const upstream = terrain.points[upstreamIndex ?? -1];
        const downstream = terrain.points[downstreamIndex ?? -1];
        expect(upstream?.downhill).toBe(downstreamIndex);
        expect(downstream?.flux ?? 0).toBeGreaterThanOrEqual(upstream?.flux ?? 0);
      }
      expect(terrain.points[river.pointIndices.at(-1) ?? -1]?.elevation).toBeLessThan(terrain.seaLevel);
    }
  });
});

describe("geographic atlas contracts", () => {
  it("keeps alpine terrain and settlement causes varied across regional seeds", () => {
    const featureCounts = new Map<string, number>();
    const alpineShares: number[] = [];
    for (let seedIndex = 0; seedIndex < 30; seedIndex += 1) {
      const atlas = generateAtlas(`regional-balance:${seedIndex}`, 24);
      const land = atlas.terrain.points.filter((point) => point.biome !== "ocean");
      const alpine = land.filter((point) => point.biome === "mountain" || point.biome === "snow");
      alpineShares.push(alpine.length / Math.max(1, land.length));
      const names = atlas.locations.map((location) => location.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((name) => !/ \d+$/.test(name))).toBe(true);
      for (const town of atlas.locations.filter((location) => location.kind === "town")) {
        featureCounts.set(town.feature, (featureCounts.get(town.feature) ?? 0) + 1);
      }
    }
    expect(Math.max(...alpineShares)).toBeLessThan(0.45);
    expect(alpineShares.reduce((total, share) => total + share, 0) / alpineShares.length).toBeLessThan(0.35);
    for (const feature of ["fertile-basin", "river-ford", "sheltered-coast", "mountain-pass"]) {
      expect(featureCounts.get(feature) ?? 0).toBeGreaterThan(5);
    }
  }, 15_000);

  it("places causal sites on one reachable landmass", () => {
    const atlas = generateAtlas("causal-sites", 24);
    const pointIndices = atlas.locations.map((location) => location.terrainPointIndex);
    expect(new Set(pointIndices).size).toBe(pointIndices.length);
    expect(atlas.locations.filter((location) => location.kind === "town").length).toBeGreaterThanOrEqual(3);
    for (const location of atlas.locations) {
      expect(atlas.terrain.points[location.terrainPointIndex]?.elevation).toBeGreaterThanOrEqual(atlas.terrain.seaLevel);
      expect(location.feature.length).toBeGreaterThan(0);
    }
    const reached = new Set([atlas.currentLocationId]);
    const queue = [atlas.currentLocationId];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === undefined) continue;
      for (const neighbor of neighboringLocationIds(atlas, current)) {
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(reached.size).toBe(atlas.locations.length);
  });

  it("stores legal road polylines and exact cumulative travel costs", () => {
    const atlas = generateAtlas("road-contract", 24);
    const neighbors = buildTerrainNeighbors(atlas.terrain);
    const riverPoints = new Set(atlas.terrain.rivers.flatMap((river) => river.pointIndices.slice(0, -1)));
    for (const edge of atlas.edges) {
      const from = atlas.locations.find((location) => location.id === edge.from);
      const to = atlas.locations.find((location) => location.id === edge.to);
      expect(edge.pathPointIndices[0]).toBe(from?.terrainPointIndex);
      expect(edge.pathPointIndices.at(-1)).toBe(to?.terrainPointIndex);
      expect(edge.pathDistances).toHaveLength(edge.pathPointIndices.length);
      expect(edge.pathDistances[0]).toBe(0);
      expect(edge.pathDistances.at(-1)).toBe(edge.distance);
      for (let index = 1; index < edge.pathPointIndices.length; index += 1) {
        const previous = edge.pathPointIndices[index - 1];
        const current = edge.pathPointIndices[index];
        expect(neighbors[previous ?? -1]).toContain(current);
        expect(atlas.terrain.points[current ?? -1]?.elevation).toBeGreaterThanOrEqual(atlas.terrain.seaLevel);
        expect(edge.pathDistances[index]).toBeGreaterThan(edge.pathDistances[index - 1] ?? -1);
      }
      expect(edge.crossingPointIndices.every((index) => riverPoints.has(index))).toBe(true);
    }
  });

  it("serializes a complete regional atlas within the save budget", () => {
    const atlas = generateAtlas("serialized-atlas", 48);
    const serialized = JSON.stringify(atlas);
    expect(JSON.parse(serialized)).toEqual(atlas);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(300_000);
  });

  it("rejects corrupted terrain signatures, point references, and road costs", () => {
    const atlas = generateAtlas("atlas-integrity", 12);
    expect(isValidAtlasState(atlas)).toBe(true);
    const alteredBiome = JSON.parse(JSON.stringify(atlas));
    alteredBiome.terrain.points[0].biome = alteredBiome.terrain.points[0].biome === "ocean" ? "coast" : "ocean";
    expect(isValidAtlasState(alteredBiome)).toBe(false);
    const badPoint = JSON.parse(JSON.stringify(atlas));
    badPoint.edges[0].pathPointIndices[1] = atlas.terrain.points.length + 1;
    expect(isValidAtlasState(badPoint)).toBe(false);
    const badDistance = JSON.parse(JSON.stringify(atlas));
    badDistance.edges[0].pathDistances[1] = 0;
    expect(isValidAtlasState(badDistance)).toBe(false);
  });
});
