import type { DirectedJourneyLeg } from "../core/types";
import { edgeBetween, orientedEdgePath } from "../depth/atlas";
import type { AtlasBiome, AtlasEdge, AtlasState, AtlasTerrainPoint, RoutePlan } from "../depth/types";
import { projectRoute, type RouteProjection } from "./route-projection";

export type TravelSlope = "ascending" | "level" | "descending";
export type TravelCrossingPhase = "ahead" | "crossing" | "behind";

export interface TravelTerrainSample {
  pointIndex: number;
  distance: number;
  offset: number;
  biome: AtlasBiome;
  elevation: number;
  moisture: number;
  flux: number;
}

export interface TravelCrossingProjection {
  pointIndex: number;
  offset: number;
  phase: TravelCrossingPhase;
  flux: number;
}

export interface TravelCorridor {
  projection: RouteProjection;
  direction: string;
  edgeTerrain: AtlasEdge["terrain"];
  biome: AtlasBiome;
  lookaheadBiome: AtlasBiome;
  elevation: number;
  moisture: number;
  flux: number;
  signedSlope: number;
  slope: TravelSlope;
  curve: number;
  nearby: readonly TravelTerrainSample[];
  crossing: TravelCrossingProjection | null;
  fromName: string;
  toName: string;
  arriving: boolean;
}

export interface TravelBiomeVisual {
  sky: number;
  horizon: number;
  ground: number;
  groundDark: number;
  accent: number;
  silhouette: "waves" | "cliffs" | "grass" | "trees" | "jungle" | "dunes" | "scrub" | "peaks" | "snow" | "reeds";
}

export const travelBiomeVisuals: Readonly<Record<AtlasBiome, TravelBiomeVisual>> = {
  ocean: { sky: 0x92c8d5, horizon: 0x4d91a6, ground: 0x326f86, groundDark: 0x20566c, accent: 0xcbe6df, silhouette: "waves" },
  coast: { sky: 0xa8ced0, horizon: 0x608f8e, ground: 0xb8a36f, groundDark: 0x77694b, accent: 0xe5d6a6, silhouette: "cliffs" },
  grassland: { sky: 0x9fc5c1, horizon: 0x668f6c, ground: 0x637d48, groundDark: 0x405436, accent: 0xc5b66d, silhouette: "grass" },
  forest: { sky: 0x789f9a, horizon: 0x355f50, ground: 0x365640, groundDark: 0x20382d, accent: 0x8ca466, silhouette: "trees" },
  rainforest: { sky: 0x719990, horizon: 0x23584a, ground: 0x294d3b, groundDark: 0x173329, accent: 0x66a26a, silhouette: "jungle" },
  desert: { sky: 0xd4b985, horizon: 0xba8657, ground: 0xb17a49, groundDark: 0x795139, accent: 0xe0c27e, silhouette: "dunes" },
  tundra: { sky: 0xaab9b5, horizon: 0x778b83, ground: 0x68766a, groundDark: 0x47534c, accent: 0xc7c8aa, silhouette: "scrub" },
  mountain: { sky: 0x879ca5, horizon: 0x586772, ground: 0x4b5355, groundDark: 0x30383d, accent: 0x9b927a, silhouette: "peaks" },
  snow: { sky: 0xb9ced5, horizon: 0x8197a2, ground: 0xaebdc0, groundDark: 0x6e8088, accent: 0xe5ece9, silhouette: "snow" },
  marsh: { sky: 0x849e91, horizon: 0x506c5b, ground: 0x4d6348, groundDark: 0x2e4033, accent: 0x91a76b, silhouette: "reeds" },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function projectTravelHeroX(legRatio: number): number {
  return 48 + 224 * clamp(Number.isFinite(legRatio) ? legRatio : 0, 0, 1);
}

function displayName(value: string): string {
  return value.replace(/-/g, " ");
}

function arrivalAtlas(atlas: AtlasState, arrival: DirectedJourneyLeg | null): AtlasState {
  if (atlas.route !== null || arrival === null) return atlas;
  const edge = edgeBetween(atlas, arrival.fromLocationId, arrival.toLocationId);
  const route: RoutePlan = {
    destinationId: arrival.toLocationId,
    path: [arrival.fromLocationId, arrival.toLocationId],
    legIndex: 0,
    legProgress: edge.distance,
    distanceTravelled: edge.distance,
    totalDistance: edge.distance,
  };
  return { ...atlas, currentLocationId: arrival.fromLocationId, route };
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function samplePoint(point: AtlasTerrainPoint, pointIndex: number, distance: number, progress: number): TravelTerrainSample {
  return {
    pointIndex,
    distance,
    offset: distance - progress,
    biome: point.biome,
    elevation: point.filledElevation,
    moisture: point.moisture,
    flux: point.flux,
  };
}

function slopeLabel(signedSlope: number): TravelSlope {
  if (signedSlope > 0.0015) return "ascending";
  if (signedSlope < -0.0015) return "descending";
  return "level";
}

function pathCurve(points: readonly AtlasTerrainPoint[], index: number): number {
  const first = points[Math.max(0, index - 1)];
  const middle = points[index];
  const last = points[Math.min(points.length - 1, index + 1)];
  if (first === undefined || middle === undefined || last === undefined) return 0;
  const incomingX = middle.x - first.x;
  const incomingY = middle.y - first.y;
  const outgoingX = last.x - middle.x;
  const outgoingY = last.y - middle.y;
  const denominator = Math.hypot(incomingX, incomingY) * Math.hypot(outgoingX, outgoingY);
  return denominator === 0 ? 0 : clamp((incomingX * outgoingY - incomingY * outgoingX) / denominator, -1, 1);
}

export function projectTravelCorridor(atlas: AtlasState, arrival: DirectedJourneyLeg | null = null): TravelCorridor | null {
  const projectedAtlas = arrivalAtlas(atlas, arrival);
  const projection = projectRoute(projectedAtlas);
  if (projection === null) return null;
  const edge = edgeBetween(projectedAtlas, projection.fromId, projection.toId);
  const oriented = orientedEdgePath(edge, projection.fromId);
  const pathPoints = oriented.pointIndices.map((pointIndex) => projectedAtlas.terrain.points[pointIndex]).filter((point): point is AtlasTerrainPoint => point !== undefined);
  const startPoint = projectedAtlas.terrain.points[projection.startPointIndex];
  const endPoint = projectedAtlas.terrain.points[projection.endPointIndex];
  if (startPoint === undefined || endPoint === undefined || pathPoints.length !== oriented.pointIndices.length) return null;

  const nearbyStart = Math.max(0, projection.segmentIndex - 2);
  const nearbyEnd = Math.min(oriented.pointIndices.length - 1, projection.segmentIndex + 6);
  const nearby: TravelTerrainSample[] = [];
  for (let index = nearbyStart; index <= nearbyEnd; index += 1) {
    const pointIndex = oriented.pointIndices[index];
    if (pointIndex === undefined) continue;
    const point = projectedAtlas.terrain.points[pointIndex];
    if (point === undefined) continue;
    nearby.push(samplePoint(point, pointIndex, oriented.distances[index] ?? 0, projection.legProgress));
  }

  const selectedPoint = projection.segmentRatio < 0.5 ? startPoint : endPoint;
  const lookaheadBiome = nearby.find((sample) => sample.offset > 0 && sample.biome !== selectedPoint.biome)?.biome ?? selectedPoint.biome;
  const segmentDistance = Math.max(1, (oriented.distances[projection.segmentIndex + 1] ?? projection.legDistance) - (oriented.distances[projection.segmentIndex] ?? 0));
  const signedSlope = (endPoint.filledElevation - startPoint.filledElevation) / segmentDistance;
  const crossingCandidates = nearby.flatMap((sample) => edge.crossingPointIndices.includes(sample.pointIndex) ? [sample] : []);
  const nearestCrossing = crossingCandidates.sort((left, right) => Math.abs(left.offset) - Math.abs(right.offset) || left.offset - right.offset)[0];
  const crossingThreshold = Math.max(2, segmentDistance * 0.5);
  const crossing = nearestCrossing === undefined
    ? null
    : {
        pointIndex: nearestCrossing.pointIndex,
        offset: nearestCrossing.offset,
        phase: Math.abs(nearestCrossing.offset) <= crossingThreshold
          ? "crossing" as const
          : nearestCrossing.offset > 0
            ? "ahead" as const
            : "behind" as const,
        flux: nearestCrossing.flux,
      };
  const fromName = projectedAtlas.locations.find((location) => location.id === projection.fromId)?.name ?? projection.fromId;
  const toName = projectedAtlas.locations.find((location) => location.id === projection.toId)?.name ?? projection.toId;

  return {
    projection,
    direction: `${projection.fromId}:${projection.toId}`,
    edgeTerrain: edge.terrain,
    biome: selectedPoint.biome,
    lookaheadBiome,
    elevation: interpolate(startPoint.filledElevation, endPoint.filledElevation, projection.segmentRatio),
    moisture: interpolate(startPoint.moisture, endPoint.moisture, projection.segmentRatio),
    flux: interpolate(startPoint.flux, endPoint.flux, projection.segmentRatio),
    signedSlope,
    slope: slopeLabel(signedSlope),
    curve: pathCurve(pathPoints, projection.segmentIndex),
    nearby,
    crossing,
    fromName,
    toName,
    arriving: atlas.route === null && arrival !== null,
  };
}

export function describeTravelCorridor(corridor: TravelCorridor): string {
  const crossing = corridor.crossing === null ? "" : ` · water ${corridor.crossing.phase}`;
  return `${displayName(corridor.biome)} ${corridor.edgeTerrain} · ${corridor.slope}${crossing}`;
}
