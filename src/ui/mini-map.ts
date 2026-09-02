import type { QuestLeadProjection } from "../depth/quest-lead";
import type { AtlasState, LocationKind } from "../depth/types";
import { projectRoute } from "../render/route-projection";
import type { AtlasPartyMarkerV1 } from "./atlas-party-marker";

export const miniMapViewBox = { width: 180, height: 112, padding: 7 } as const;

export interface MiniMapPoint {
  x: number;
  y: number;
}

export interface MiniMapLine {
  id: string;
  points: readonly MiniMapPoint[];
}

export interface MiniMapRoad extends MiniMapLine {
  selected: boolean;
  terrain: "road" | "trail" | "pass" | "river";
}

export interface MiniMapSite extends MiniMapPoint {
  id: string;
  name: string;
  kind: LocationKind | "unknown";
  current: boolean;
  destination: boolean;
  lead: boolean;
}

export interface MiniMapProjection {
  coastlines: readonly MiniMapLine[];
  rivers: readonly MiniMapLine[];
  roads: readonly MiniMapRoad[];
  sites: readonly MiniMapSite[];
  party: MiniMapPoint & { marker: AtlasPartyMarkerV1 | null };
  currentPlace: string;
  routeSummary: string;
  ariaLabel: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectPoint(atlas: AtlasState, x: number, y: number): MiniMapPoint {
  const drawableWidth = miniMapViewBox.width - miniMapViewBox.padding * 2;
  const drawableHeight = miniMapViewBox.height - miniMapViewBox.padding * 2;
  return {
    x: miniMapViewBox.padding + Math.max(0, Math.min(atlas.terrain.width, x)) / atlas.terrain.width * drawableWidth,
    y: miniMapViewBox.padding + Math.max(0, Math.min(atlas.terrain.height, y)) / atlas.terrain.height * drawableHeight,
  };
}

function edgeKey(left: string, right: string): string {
  return left < right ? `${left}~${right}` : `${right}~${left}`;
}

export function projectMiniMap(
  atlas: AtlasState,
  partyMarker: AtlasPartyMarkerV1 | null,
  questLead: QuestLeadProjection | null = null,
): MiniMapProjection {
  const discovered = new Set(atlas.discoveredLocationIds);
  const selectedEdges = new Set<string>();
  for (let index = 0; index < (atlas.route?.path.length ?? 0) - 1; index += 1) {
    const left = atlas.route?.path[index];
    const right = atlas.route?.path[index + 1];
    if (left !== undefined && right !== undefined) selectedEdges.add(edgeKey(left, right));
  }

  const coastlines = atlas.terrain.coastline
    .map((segment) => ({
      id: `${segment.x1}:${segment.y1}:${segment.x2}:${segment.y2}`,
      points: [
        projectPoint(atlas, segment.x1, segment.y1),
        projectPoint(atlas, segment.x2, segment.y2),
      ],
    }))
    .sort((left, right) => compareText(left.id, right.id));
  const rivers = atlas.terrain.rivers
    .map((river) => ({
      id: river.id,
      points: river.pointIndices.flatMap((pointIndex) => {
        const point = atlas.terrain.points[pointIndex];
        return point === undefined ? [] : [projectPoint(atlas, point.x, point.y)];
      }),
    }))
    .filter((river) => river.points.length > 1)
    .sort((left, right) => compareText(left.id, right.id));
  const roads = atlas.edges
    .filter((edge) => (discovered.has(edge.from) && discovered.has(edge.to)) || selectedEdges.has(edge.id))
    .map((edge) => ({
      id: edge.id,
      selected: selectedEdges.has(edge.id),
      terrain: edge.terrain,
      points: edge.pathPointIndices.flatMap((pointIndex) => {
        const point = atlas.terrain.points[pointIndex];
        return point === undefined ? [] : [projectPoint(atlas, point.x, point.y)];
      }),
    }))
    .filter((road) => road.points.length > 1)
    .sort((left, right) => compareText(left.id, right.id));
  const sites = atlas.locations
    .filter((location) => discovered.has(location.id) || location.id === atlas.route?.destinationId || location.id === questLead?.locationId)
    .map((location) => ({
      id: location.id,
      name: location.name,
      kind: discovered.has(location.id) ? location.kind : "unknown" as const,
      current: location.id === atlas.currentLocationId,
      destination: location.id === atlas.route?.destinationId,
      lead: location.id === questLead?.locationId,
      ...projectPoint(atlas, location.x, location.y),
    }))
    .sort((left, right) => compareText(left.id, right.id));

  const current = atlas.locations.find((location) => location.id === atlas.currentLocationId);
  const destination = atlas.locations.find((location) => location.id === atlas.route?.destinationId);
  const routeProjection = projectRoute(atlas);
  const partyTerrain = partyMarker?.position ?? (routeProjection === null
    ? { terrainX: current?.x ?? atlas.terrain.width / 2, terrainY: current?.y ?? atlas.terrain.height / 2 }
    : { terrainX: routeProjection.terrainX, terrainY: routeProjection.terrainY });
  const party = { ...projectPoint(atlas, partyTerrain.terrainX, partyTerrain.terrainY), marker: partyMarker };
  const remaining = atlas.route === null ? 0 : Math.max(0, atlas.route.totalDistance - atlas.route.distanceTravelled);
  const currentPlace = routeProjection === null
    ? current?.name ?? "Unknown wilds"
    : `${atlas.locations.find((location) => location.id === routeProjection.fromId)?.name ?? "Road"} → ${atlas.locations.find((location) => location.id === routeProjection.toId)?.name ?? "Unknown"}`;
  const leadSummary = questLead === null
    ? null
    : `Lead · ${questLead.locationName} · ${questLead.phase === "at-lead" ? "at site" : questLead.phase}`;
  const routeSummary = atlas.route === null
    ? leadSummary ?? `${discovered.size}/${atlas.locations.length} sites mapped`
    : `${destination?.name ?? "Unknown destination"} · ${remaining} mi left`;
  const partyText = partyMarker?.accessibleText ?? "Party marker unavailable.";
  const ariaLabel = atlas.route === null
    ? `Mini map. ${partyText} Party at ${currentPlace}. ${routeSummary}. No route is planned. Open full map.`
    : `Mini map. ${partyText} Party travelling ${currentPlace} toward ${destination?.name ?? "an unknown destination"}. ${remaining} miles remaining.${questLead === null ? "" : ` Quest lead at ${questLead.locationName}, ${questLead.phase}.`} Open full map.`;

  return { coastlines, rivers, roads, sites, party, currentPlace, routeSummary, ariaLabel };
}
