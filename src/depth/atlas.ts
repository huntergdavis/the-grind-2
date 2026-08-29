import { pick, randomInt } from "../core/rng";
import type { AtlasEdge, AtlasLocation, AtlasState, LocationKind, RoutePlan } from "./types";

const prefixes = ["Amber", "Briar", "Cinder", "Dawn", "Elder", "Frost", "Glimmer", "Hollow"] as const;
const suffixes = ["ford", "haven", "mere", "reach", "rest", "watch", "wood", "vale"] as const;
const terrains: readonly AtlasEdge["terrain"][] = ["road", "trail", "pass", "river"];

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 12;
  return Math.max(4, Math.min(48, Math.floor(value)));
}

function locationKind(index: number): LocationKind {
  if (index === 0 || index % 4 === 0) return "town";
  if (index % 5 === 0) return "dungeon";
  if (index % 3 === 0) return "landmark";
  return "wilds";
}

function edgeId(left: string, right: string): string {
  return [left, right].sort().join("~");
}

function makeEdge(seed: string, locations: readonly AtlasLocation[], left: number, right: number): AtlasEdge {
  const from = locations[left];
  const to = locations[right];
  if (from === undefined || to === undefined) throw new Error("Atlas edge endpoint is missing");
  const id = edgeId(from.id, to.id);
  const geometricDistance = Math.hypot(from.x - to.x, from.y - to.y);
  const terrain = pick(terrains, seed, "atlas", id, 0, "terrain");
  const penalty = terrain === "road" ? 0.8 : terrain === "pass" ? 1.35 : 1;
  return { id, from: from.id, to: to.id, distance: Math.max(8, Math.round(geometricDistance * penalty)), terrain };
}

export function generateAtlas(seed: string, requestedLocationCount = 12): AtlasState {
  const count = boundedCount(requestedLocationCount);
  const locations: AtlasLocation[] = [];
  for (let index = 0; index < count; index += 1) {
    const prefix = pick(prefixes, seed, "atlas", `location:${index}`, 0, "prefix");
    const suffix = pick(suffixes, seed, "atlas", `location:${index}`, 0, "suffix");
    locations.push({
      id: `location:${index}`,
      name: `${prefix}${suffix}${index === 0 ? "" : ` ${index + 1}`}`,
      kind: locationKind(index),
      x: 5 + randomInt(91, seed, "atlas", `location:${index}`, 0, "x"),
      y: 5 + randomInt(91, seed, "atlas", `location:${index}`, 0, "y"),
      danger: index === 0 ? 1 : 1 + randomInt(9, seed, "atlas", `location:${index}`, 0, "danger"),
    });
  }

  const edges: AtlasEdge[] = [];
  const ids = new Set<string>();
  const addEdge = (left: number, right: number): void => {
    const edge = makeEdge(seed, locations, left, right);
    if (!ids.has(edge.id)) {
      ids.add(edge.id);
      edges.push(edge);
    }
  };

  for (let index = 0; index < count - 1; index += 1) addEdge(index, index + 1);
  for (let index = 0; index < count - 2; index += 1) {
    if (randomInt(3, seed, "atlas", `location:${index}`, 0, "shortcut") !== 0) addEdge(index, index + 2);
  }

  return {
    locations,
    edges,
    currentLocationId: locations[0]?.id ?? "location:0",
    route: null,
    discoveredLocationIds: [locations[0]?.id ?? "location:0"],
  };
}

export function neighboringLocationIds(atlas: AtlasState, locationId: string): readonly string[] {
  return atlas.edges
    .flatMap((edge) => edge.from === locationId ? [edge.to] : edge.to === locationId ? [edge.from] : [])
    .sort();
}

function edgeBetween(atlas: AtlasState, left: string, right: string): AtlasEdge {
  const id = edgeId(left, right);
  const edge = atlas.edges.find((candidate) => candidate.id === id);
  if (edge === undefined) throw new Error(`No atlas edge joins ${left} and ${right}`);
  return edge;
}

export function findRoute(atlas: AtlasState, destinationId: string): readonly string[] {
  if (!atlas.locations.some((location) => location.id === destinationId)) throw new Error("Unknown destination");
  if (destinationId === atlas.currentLocationId) return [destinationId];
  const queue: string[] = [atlas.currentLocationId];
  const previous = new Map<string, string | null>([[atlas.currentLocationId, null]]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const neighbor of neighboringLocationIds(atlas, current)) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, current);
      queue.push(neighbor);
    }
  }
  if (!previous.has(destinationId)) throw new Error("Destination is unreachable");
  const reversed: string[] = [];
  let cursor: string | null = destinationId;
  while (cursor !== null) {
    reversed.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return reversed.reverse();
}

export function planRoute(atlas: AtlasState, destinationId: string): AtlasState {
  const path = findRoute(atlas, destinationId);
  if (path.length === 1) return { ...atlas, route: null };
  const totalDistance = path.slice(1).reduce((total, locationId, index) => {
    const from = path[index];
    if (from === undefined) throw new Error("Malformed route");
    return total + edgeBetween(atlas, from, locationId).distance;
  }, 0);
  const route: RoutePlan = { destinationId, path, legIndex: 0, legProgress: 0, distanceTravelled: 0, totalDistance };
  return { ...atlas, route };
}

export function advanceRoute(atlas: AtlasState, requestedDistance: number): AtlasState {
  if (atlas.route === null || !Number.isFinite(requestedDistance) || requestedDistance <= 0) return atlas;
  let remaining = Math.floor(requestedDistance);
  let legIndex = atlas.route.legIndex;
  let legProgress = atlas.route.legProgress;
  let currentLocationId = atlas.currentLocationId;
  let distanceTravelled = atlas.route.distanceTravelled;
  const discovered = new Set(atlas.discoveredLocationIds);

  while (remaining > 0 && legIndex < atlas.route.path.length - 1) {
    const from = atlas.route.path[legIndex];
    const to = atlas.route.path[legIndex + 1];
    if (from === undefined || to === undefined) throw new Error("Malformed route leg");
    const edge = edgeBetween(atlas, from, to);
    const spent = Math.min(remaining, edge.distance - legProgress);
    legProgress += spent;
    remaining -= spent;
    distanceTravelled += spent;
    if (legProgress >= edge.distance) {
      currentLocationId = to;
      discovered.add(to);
      legIndex += 1;
      legProgress = 0;
    }
  }

  const arrived = legIndex >= atlas.route.path.length - 1;
  return {
    ...atlas,
    currentLocationId,
    discoveredLocationIds: [...discovered],
    route: arrived ? null : { ...atlas.route, legIndex, legProgress, distanceTravelled },
  };
}
