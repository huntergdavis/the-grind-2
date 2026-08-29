import type { AtlasEdge, AtlasState } from "../depth/types";
import { orientedEdgePath } from "../depth/atlas";

export interface RouteProjection {
  edgeId: string;
  fromId: string;
  toId: string;
  legIndex: number;
  legDistance: number;
  legProgress: number;
  legRatio: number;
  routeDistance: number;
  routeTotalDistance: number;
  routeRatio: number;
  terrainX: number;
  terrainY: number;
  segmentIndex: number;
  segmentRatio: number;
  startPointIndex: number;
  endPointIndex: number;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function edgeBetween(atlas: AtlasState, fromId: string, toId: string): AtlasEdge | undefined {
  return atlas.edges.find(
    (edge) =>
      (edge.from === fromId && edge.to === toId) ||
      (edge.from === toId && edge.to === fromId),
  );
}

export function projectRoute(atlas: AtlasState): RouteProjection | null {
  const route = atlas.route;
  if (route === null) return null;
  const fromId = route.path[route.legIndex];
  const toId = route.path[route.legIndex + 1];
  if (fromId === undefined || toId === undefined) return null;
  const edge = edgeBetween(atlas, fromId, toId);
  if (edge === undefined || edge.distance <= 0) return null;

  const legProgress = Math.max(0, Math.min(edge.distance, route.legProgress));
  const routeDistance = Math.max(0, Math.min(route.totalDistance, route.distanceTravelled));
  const oriented = orientedEdgePath(edge, fromId);
  let segmentIndex = 0;
  while (segmentIndex < oriented.distances.length - 2 && legProgress > (oriented.distances[segmentIndex + 1] ?? edge.distance)) {
    segmentIndex += 1;
  }
  const segmentStartDistance = oriented.distances[segmentIndex] ?? 0;
  const segmentEndDistance = oriented.distances[segmentIndex + 1] ?? edge.distance;
  const segmentRatio = clampRatio((legProgress - segmentStartDistance) / Math.max(1, segmentEndDistance - segmentStartDistance));
  const startPointIndex = oriented.pointIndices[segmentIndex] ?? -1;
  const endPointIndex = oriented.pointIndices[segmentIndex + 1] ?? -1;
  const startPoint = atlas.terrain.points[startPointIndex];
  const endPoint = atlas.terrain.points[endPointIndex];
  if (startPoint === undefined || endPoint === undefined) return null;
  return {
    edgeId: edge.id,
    fromId,
    toId,
    legIndex: route.legIndex,
    legDistance: edge.distance,
    legProgress,
    legRatio: clampRatio(legProgress / edge.distance),
    routeDistance,
    routeTotalDistance: route.totalDistance,
    routeRatio: clampRatio(routeDistance / Math.max(1, route.totalDistance)),
    terrainX: Math.round(startPoint.x + (endPoint.x - startPoint.x) * segmentRatio),
    terrainY: Math.round(startPoint.y + (endPoint.y - startPoint.y) * segmentRatio),
    segmentIndex,
    segmentRatio,
    startPointIndex,
    endPointIndex,
  };
}
