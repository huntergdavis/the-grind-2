import { randomInt } from "../core/rng";
import { buildTerrainNeighbors, calculateTerrainSignature, generateTerrain } from "./terrain";
import type {
  AtlasEdge,
  AtlasLocation,
  AtlasState,
  AtlasTerrain,
  AtlasTerrainPoint,
  LocationKind,
  RoutePlan,
} from "./types";

const prefixes = ["Amber", "Briar", "Cinder", "Dawn", "Elder", "Frost", "Glimmer", "Hollow"] as const;
const suffixes = ["ford", "haven", "mere", "reach", "rest", "watch", "wood", "vale"] as const;
const biomes = new Set(["ocean", "coast", "grassland", "forest", "rainforest", "desert", "tundra", "mountain", "snow", "marsh"]);
const locationKinds = new Set(["town", "wilds", "dungeon", "landmark"]);
const locationFeatures = new Set(["sheltered-coast", "river-ford", "fertile-basin", "mountain-pass", "ancient-peak", "biome-frontier"]);
const edgeTerrains = new Set(["road", "trail", "pass", "river"]);

interface HeapEntry {
  index: number;
  priority: number;
}

class MinHeap {
  private readonly entries: HeapEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  private comesBefore(left: HeapEntry, right: HeapEntry): boolean {
    return left.priority < right.priority || (left.priority === right.priority && left.index < right.index);
  }

  push(entry: HeapEntry): void {
    this.entries.push(entry);
    let child = this.entries.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      const parentEntry = this.entries[parent];
      if (parentEntry === undefined || this.comesBefore(parentEntry, entry)) break;
      this.entries[child] = parentEntry;
      child = parent;
    }
    this.entries[child] = entry;
  }

  pop(): HeapEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (first === undefined || last === undefined || this.entries.length === 0) return first;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      const leftEntry = this.entries[left];
      const rightEntry = this.entries[right];
      if (leftEntry === undefined) break;
      const child = rightEntry !== undefined && this.comesBefore(rightEntry, leftEntry) ? right : left;
      const childEntry = this.entries[child];
      if (childEntry === undefined || this.comesBefore(last, childEntry)) break;
      this.entries[parent] = childEntry;
      parent = child;
    }
    this.entries[parent] = last;
    return first;
  }
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value)) return 12;
  return Math.max(4, Math.min(48, Math.floor(value)));
}

function locationKind(index: number): LocationKind {
  if (index === 0 || index % 4 === 0) return "town";
  if (index % 4 === 3) return "dungeon";
  if (index % 4 === 2) return "landmark";
  return "wilds";
}

function edgeId(left: string, right: string): string {
  return [left, right].sort().join("~");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function isValidAtlasState(value: unknown): value is AtlasState {
  if (!isRecord(value) || !isRecord(value.terrain) || !Array.isArray(value.locations) || !Array.isArray(value.edges)) return false;
  const terrain = value.terrain;
  if (
    terrain.version !== 1 || terrain.generator !== "oleary-inspired-v1" || typeof terrain.signature !== "string" ||
    !safeInteger(terrain.width) || terrain.width <= 0 || terrain.width > 2_000 ||
    !safeInteger(terrain.height) || terrain.height <= 0 || terrain.height > 2_000 ||
    !safeInteger(terrain.seaLevel) || !Array.isArray(terrain.points) || terrain.points.length < 16 || terrain.points.length > 500 ||
    !Array.isArray(terrain.triangles) || terrain.triangles.length < 1 || !Array.isArray(terrain.coastline) || !Array.isArray(terrain.rivers)
  ) return false;
  const width = terrain.width as number;
  const height = terrain.height as number;
  const seaLevel = terrain.seaLevel as number;
  const points = terrain.points;
  if (!points.every((entry) => isRecord(entry) &&
    safeInteger(entry.x) && entry.x >= 0 && entry.x <= width &&
    safeInteger(entry.y) && entry.y >= 0 && entry.y <= height &&
    safeInteger(entry.elevation) && safeInteger(entry.filledElevation) && safeInteger(entry.moisture) && entry.moisture >= 0 && entry.moisture <= 1_000 &&
    safeInteger(entry.flux) && entry.flux >= 0 && typeof entry.biome === "string" && biomes.has(entry.biome) &&
    (entry.downhill === null || (safeInteger(entry.downhill) && entry.downhill >= 0 && entry.downhill < points.length)))) return false;
  const pointAt = (index: unknown): Record<string, unknown> | undefined => safeInteger(index) ? points[index] as Record<string, unknown> | undefined : undefined;
  for (const entry of points) {
    if (!isRecord(entry) || entry.downhill === null) continue;
    const downhill = pointAt(entry.downhill);
    if (downhill === undefined || !safeInteger(downhill.filledElevation) || !safeInteger(entry.filledElevation) || downhill.filledElevation >= entry.filledElevation) return false;
  }
  if (!terrain.triangles.every((entry) => {
    if (!isRecord(entry) || !safeInteger(entry.a) || !safeInteger(entry.b) || !safeInteger(entry.c)) return false;
    const a = pointAt(entry.a);
    const b = pointAt(entry.b);
    const c = pointAt(entry.c);
    if (a === undefined || b === undefined || c === undefined || !safeInteger(a.x) || !safeInteger(a.y) || !safeInteger(b.x) || !safeInteger(b.y) || !safeInteger(c.x) || !safeInteger(c.y)) return false;
    return (b.x - a.x) * (c.y - a.y) !== (b.y - a.y) * (c.x - a.x);
  })) return false;
  if (!terrain.coastline.every((entry) => isRecord(entry) &&
    safeInteger(entry.x1) && entry.x1 >= 0 && entry.x1 <= width && safeInteger(entry.y1) && entry.y1 >= 0 && entry.y1 <= height &&
    safeInteger(entry.x2) && entry.x2 >= 0 && entry.x2 <= width && safeInteger(entry.y2) && entry.y2 >= 0 && entry.y2 <= height)) return false;
  const riverIds = new Set<string>();
  if (!terrain.rivers.every((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || riverIds.has(entry.id) || !safeInteger(entry.flux) || entry.flux < 1 || !Array.isArray(entry.pointIndices) || entry.pointIndices.length < 2) return false;
    const pointIndices = entry.pointIndices;
    riverIds.add(entry.id);
    if (!pointIndices.every((index) => pointAt(index) !== undefined) || new Set(pointIndices).size !== pointIndices.length) return false;
    return pointIndices.slice(0, -1).every((index, ordinal) => pointAt(index)?.downhill === pointIndices[ordinal + 1]);
  })) return false;

  const locations = value.locations;
  const locationIds = new Set<string>();
  if (!locations.every((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || locationIds.has(entry.id) || typeof entry.name !== "string" || entry.name.length === 0 ||
      typeof entry.kind !== "string" || !locationKinds.has(entry.kind) || typeof entry.feature !== "string" || !locationFeatures.has(entry.feature) ||
      !safeInteger(entry.danger) || entry.danger < 1 || entry.danger > 10 || !safeInteger(entry.terrainPointIndex)) return false;
    const point = pointAt(entry.terrainPointIndex);
    if (point === undefined || entry.x !== point.x || entry.y !== point.y || !safeInteger(point.elevation) || point.elevation < seaLevel) return false;
    locationIds.add(entry.id);
    return true;
  }) || locations.length < 4 || locations.length > 48) return false;

  const edges = value.edges;
  const edgeIds = new Set<string>();
  const edgeByPair = new Map<string, Record<string, unknown>>();
  if (!edges.every((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || edgeIds.has(entry.id) || typeof entry.from !== "string" || typeof entry.to !== "string" ||
      !locationIds.has(entry.from) || !locationIds.has(entry.to) || entry.from === entry.to || !safeInteger(entry.distance) || entry.distance <= 0 ||
      typeof entry.terrain !== "string" || !edgeTerrains.has(entry.terrain) || !Array.isArray(entry.pathPointIndices) || entry.pathPointIndices.length < 2 ||
      !Array.isArray(entry.pathDistances) || entry.pathDistances.length !== entry.pathPointIndices.length || !Array.isArray(entry.crossingPointIndices)) return false;
    const pathPointIndices = entry.pathPointIndices;
    const pathDistances = entry.pathDistances;
    const crossingPointIndices = entry.crossingPointIndices;
    const from = locations.find((location) => isRecord(location) && location.id === entry.from);
    const to = locations.find((location) => isRecord(location) && location.id === entry.to);
    if (!isRecord(from) || !isRecord(to) || pathPointIndices[0] !== from.terrainPointIndex || pathPointIndices.at(-1) !== to.terrainPointIndex ||
      !pathPointIndices.every((index) => pointAt(index) !== undefined) || pathDistances[0] !== 0 || pathDistances.at(-1) !== entry.distance ||
      !pathDistances.every((distance, index) => safeInteger(distance) && distance >= 0 && (index === 0 || distance > (pathDistances[index - 1] as number))) ||
      !crossingPointIndices.every((index) => safeInteger(index) && pathPointIndices.includes(index))) return false;
    edgeIds.add(entry.id);
    edgeByPair.set(edgeId(entry.from, entry.to), entry);
    return true;
  }) || edges.length < locations.length - 1 || edges.length > locations.length + 8) return false;

  if (typeof value.currentLocationId !== "string" || !locationIds.has(value.currentLocationId) || !Array.isArray(value.discoveredLocationIds) ||
    !value.discoveredLocationIds.every((id) => typeof id === "string" && locationIds.has(id)) || !value.discoveredLocationIds.includes(value.currentLocationId)) return false;
  if (value.route !== null) {
    const route = value.route;
    if (!isRecord(route) || typeof route.destinationId !== "string" || !locationIds.has(route.destinationId) || !Array.isArray(route.path) || route.path.length < 2 ||
      !route.path.every((id) => typeof id === "string" && locationIds.has(id)) || route.path.at(-1) !== route.destinationId ||
      !safeInteger(route.legIndex) || route.legIndex < 0 || route.legIndex >= route.path.length - 1 || route.path[route.legIndex] !== value.currentLocationId ||
      !safeInteger(route.legProgress) || route.legProgress < 0 || !safeInteger(route.distanceTravelled) || route.distanceTravelled < 0 ||
      !safeInteger(route.totalDistance) || route.totalDistance <= 0) return false;
    const routePath = route.path;
    const routeEdges = routePath.slice(1).map((id, index) => edgeByPair.get(edgeId(routePath[index] as string, id as string)));
    if (routeEdges.some((edge) => edge === undefined)) return false;
    const total = routeEdges.reduce((sum, edge) => sum + (edge?.distance as number), 0);
    const completed = routeEdges.slice(0, route.legIndex).reduce((sum, edge) => sum + (edge?.distance as number), 0);
    const activeDistance = routeEdges[route.legIndex]?.distance;
    if (route.totalDistance !== total || !safeInteger(activeDistance) || route.legProgress >= activeDistance || route.distanceTravelled !== completed + route.legProgress) return false;
  }
  try {
    const typedTerrain = terrain as unknown as AtlasTerrain;
    const { signature: _signature, ...unsigned } = typedTerrain;
    return calculateTerrainSignature(unsigned) === typedTerrain.signature;
  } catch {
    return false;
  }
}

function largestLandComponent(terrain: AtlasTerrain, neighbors: readonly (readonly number[])[]): readonly number[] {
  const available = new Set(
    terrain.points
      .map((point, index) => point.elevation >= terrain.seaLevel ? index : -1)
      .filter((index) => index >= 0),
  );
  let largest: number[] = [];
  while (available.size > 0) {
    const start = Math.min(...available);
    const component: number[] = [];
    const queue = [start];
    available.delete(start);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === undefined) continue;
      component.push(current);
      for (const neighbor of neighbors[current] ?? []) {
        if (available.delete(neighbor)) queue.push(neighbor);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  return largest.sort((left, right) => left - right);
}

function pointDistance(left: AtlasTerrainPoint, right: AtlasTerrainPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function featureFor(kind: LocationKind, point: AtlasTerrainPoint, seaLevel: number): AtlasLocation["feature"] {
  const relief = point.elevation - seaLevel;
  if (kind === "town") {
    if (point.flux >= 24) return "river-ford";
    if (point.biome === "coast") return "sheltered-coast";
    if (relief < 230 && ["grassland", "forest", "rainforest", "marsh"].includes(point.biome)) return "fertile-basin";
    return "mountain-pass";
  }
  if (relief >= 245) return "ancient-peak";
  if (point.biome === "coast") return "sheltered-coast";
  if (point.flux >= 10) return "river-ford";
  return kind === "dungeon" ? "mountain-pass" : "biome-frontier";
}

function suitability(
  kind: LocationKind,
  point: AtlasTerrainPoint,
  seaLevel: number,
  preferredFeature: AtlasLocation["feature"] | null,
): number {
  const relief = point.elevation - seaLevel;
  const preferred = preferredFeature !== null && featureFor(kind, point, seaLevel) === preferredFeature ? 1_200 : 0;
  if (kind === "town") {
    const hospitable = ["grassland", "forest", "coast", "marsh"].includes(point.biome) ? 600 : 0;
    return preferred + hospitable + Math.min(420, point.flux * 14) + Math.max(0, 300 - relief) - Math.abs(point.x - 500) / 4;
  }
  if (kind === "dungeon") {
    return relief * 2 + (point.biome === "mountain" || point.biome === "snow" ? 700 : 0) + Math.abs(point.x - 500) / 3;
  }
  if (kind === "landmark") {
    return Math.abs(relief - 240) + (point.biome === "coast" ? 450 : 0) + point.flux * 10;
  }
  return 300 + Math.abs(point.moisture - 500) + relief;
}

function chooseLocationPoint(
  seed: string,
  terrain: AtlasTerrain,
  component: readonly number[],
  selected: readonly number[],
  kind: LocationKind,
  locationIndex: number,
  preferredFeature: AtlasLocation["feature"] | null,
): number {
  const thresholds = selected.length < 14 ? [105, 70, 35, 0] : [70, 35, 0];
  for (const separation of thresholds) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidateIndex of component) {
      if (selected.includes(candidateIndex)) continue;
      const point = terrain.points[candidateIndex];
      if (point === undefined) continue;
      const minimumDistance = selected.length === 0
        ? 300
        : Math.min(...selected.map((index) => pointDistance(point, terrain.points[index] ?? point)));
      if (minimumDistance < separation) continue;
      const jitter = randomInt(101, seed, "atlas-location", `location:${locationIndex}`, 0, `candidate:${candidateIndex}`);
      const score = suitability(kind, point, terrain.seaLevel, preferredFeature) + minimumDistance * 2 + jitter;
      if (score > bestScore || (score === bestScore && candidateIndex < bestIndex)) {
        bestIndex = candidateIndex;
        bestScore = score;
      }
    }
    if (bestIndex >= 0) return bestIndex;
  }
  throw new Error("Atlas location constraints could not be satisfied");
}

function makeLocations(
  seed: string,
  count: number,
  terrain: AtlasTerrain,
  component: readonly number[],
  requestedKinds?: readonly LocationKind[],
): AtlasLocation[] {
  const locations: AtlasLocation[] = [];
  const selected: number[] = [];
  const usedNames = new Set<string>();
  const townFeatures: readonly AtlasLocation["feature"][] = ["fertile-basin", "river-ford", "sheltered-coast", "mountain-pass"];
  for (let index = 0; index < count; index += 1) {
    const kind = requestedKinds?.[index] ?? locationKind(index);
    const townOrdinal = locations.filter((location) => location.kind === "town").length;
    const preferredFeature = kind === "town" ? townFeatures[townOrdinal % townFeatures.length] ?? null : null;
    const terrainPointIndex = chooseLocationPoint(seed, terrain, component, selected, kind, index, preferredFeature);
    selected.push(terrainPointIndex);
    const point = terrain.points[terrainPointIndex];
    if (point === undefined) throw new Error("Atlas location terrain point is missing");
    const prefixStart = randomInt(prefixes.length, seed, "atlas", `location:${index}`, 0, "prefix");
    const suffixStart = randomInt(suffixes.length, seed, "atlas", `location:${index}`, 0, "suffix");
    let name = "Unnamed Reach";
    for (let attempt = 0; attempt < prefixes.length * suffixes.length; attempt += 1) {
      const prefix = prefixes[(prefixStart + Math.floor(attempt / suffixes.length)) % prefixes.length];
      const suffix = suffixes[(suffixStart + attempt) % suffixes.length];
      const candidate = `${prefix ?? "Far"}${suffix ?? "reach"}`;
      if (!usedNames.has(candidate)) {
        name = candidate;
        break;
      }
    }
    usedNames.add(name);
    const danger = index === 0
      ? 1
      : Math.max(1, Math.min(10, 2 + Math.round((point.elevation - terrain.seaLevel) / 85) + (kind === "dungeon" ? 2 : 0)));
    locations.push({
      id: `location:${index}`,
      name,
      kind,
      x: point.x,
      y: point.y,
      danger,
      terrainPointIndex,
      feature: featureFor(kind, point, terrain.seaLevel),
    });
  }
  return locations;
}

function terrainStepCost(left: AtlasTerrainPoint, right: AtlasTerrainPoint, riverPoints: ReadonlySet<number>, rightIndex: number): number {
  const base = Math.max(1, Math.round(pointDistance(left, right) / 10));
  const slope = Math.round(Math.abs(left.elevation - right.elevation) / 18);
  const biomePenalty: Record<AtlasTerrainPoint["biome"], number> = {
    ocean: 10_000,
    coast: 2,
    grassland: 0,
    forest: 3,
    rainforest: 5,
    desert: 4,
    tundra: 5,
    mountain: 9,
    snow: 13,
    marsh: 8,
  };
  return base + slope + biomePenalty[right.biome] + (riverPoints.has(rightIndex) ? 6 : 0);
}

function terrainPath(
  terrain: AtlasTerrain,
  neighbors: readonly (readonly number[])[],
  start: number,
  destination: number,
  riverPoints: ReadonlySet<number>,
): { path: readonly number[]; distances: readonly number[] } {
  const distances = terrain.points.map(() => Number.POSITIVE_INFINITY);
  const previous = terrain.points.map(() => -1);
  const heap = new MinHeap();
  distances[start] = 0;
  heap.push({ index: start, priority: 0 });
  while (heap.size > 0) {
    const entry = heap.pop();
    if (entry === undefined) break;
    if (entry.priority !== distances[entry.index]) continue;
    if (entry.index === destination) break;
    const current = terrain.points[entry.index];
    if (current === undefined) continue;
    for (const neighborIndex of neighbors[entry.index] ?? []) {
      const neighbor = terrain.points[neighborIndex];
      if (neighbor === undefined || neighbor.elevation < terrain.seaLevel) continue;
      const nextDistance = entry.priority + terrainStepCost(current, neighbor, riverPoints, neighborIndex);
      if (nextDistance < (distances[neighborIndex] ?? Number.POSITIVE_INFINITY)) {
        distances[neighborIndex] = nextDistance;
        previous[neighborIndex] = entry.index;
        heap.push({ index: neighborIndex, priority: nextDistance });
      }
    }
  }
  if (!Number.isFinite(distances[destination])) throw new Error("Atlas road endpoints are disconnected");
  const reversed: number[] = [];
  for (let cursor = destination; cursor >= 0; cursor = previous[cursor] ?? -1) {
    reversed.push(cursor);
    if (cursor === start) break;
  }
  const path = reversed.reverse();
  const cumulative = [0];
  for (let index = 1; index < path.length; index += 1) {
    const left = terrain.points[path[index - 1] ?? -1];
    const rightIndex = path[index] ?? -1;
    const right = terrain.points[rightIndex];
    if (left === undefined || right === undefined) throw new Error("Atlas road path is malformed");
    cumulative.push((cumulative[cumulative.length - 1] ?? 0) + terrainStepCost(left, right, riverPoints, rightIndex));
  }
  return { path, distances: cumulative };
}

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === undefined || parent === index) return index;
    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(left: number, right: number): boolean {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return false;
    this.parents[rightRoot] = leftRoot;
    return true;
  }
}

function makeEdges(
  seed: string,
  terrain: AtlasTerrain,
  neighbors: readonly (readonly number[])[],
  locations: readonly AtlasLocation[],
): AtlasEdge[] {
  const candidates: Array<{ left: number; right: number; distance: number }> = [];
  for (let left = 0; left < locations.length; left += 1) {
    for (let right = left + 1; right < locations.length; right += 1) {
      const leftPoint = terrain.points[locations[left]?.terrainPointIndex ?? -1];
      const rightPoint = terrain.points[locations[right]?.terrainPointIndex ?? -1];
      if (leftPoint !== undefined && rightPoint !== undefined) candidates.push({ left, right, distance: Math.round(pointDistance(leftPoint, rightPoint)) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.left - b.left || a.right - b.right);
  const selected: Array<{ left: number; right: number }> = [];
  const selectedIds = new Set<string>();
  const sets = new DisjointSet(locations.length);
  for (const candidate of candidates) {
    if (!sets.union(candidate.left, candidate.right)) continue;
    selected.push(candidate);
    selectedIds.add(`${candidate.left}:${candidate.right}`);
  }
  const maximumLoops = Math.min(8, Math.max(1, Math.floor(locations.length / 4)));
  let loops = 0;
  for (const candidate of candidates) {
    if (loops >= maximumLoops) break;
    const candidateId = `${candidate.left}:${candidate.right}`;
    if (selectedIds.has(candidateId)) continue;
    const roll = randomInt(4, seed, "atlas-road", candidateId, 0, "loop");
    if (roll !== 0) continue;
    selected.push(candidate);
    selectedIds.add(candidateId);
    loops += 1;
  }

  const riverPoints = new Set(terrain.rivers.flatMap((river) => river.pointIndices.slice(0, -1)));
  return selected.map(({ left, right }) => {
    const from = locations[left];
    const to = locations[right];
    if (from === undefined || to === undefined) throw new Error("Atlas edge endpoint is missing");
    const path = terrainPath(terrain, neighbors, from.terrainPointIndex, to.terrainPointIndex, riverPoints);
    const crossingPointIndices: number[] = [];
    let crossingStart = -1;
    for (let index = 1; index < path.path.length - 1; index += 1) {
      const pointIndex = path.path[index];
      const onRiver = pointIndex !== undefined && riverPoints.has(pointIndex);
      if (onRiver && crossingStart < 0) crossingStart = index;
      const crossingEnds = crossingStart >= 0 && (!onRiver || index === path.path.length - 2);
      if (crossingEnds) {
        const end = onRiver ? index : index - 1;
        const crossing = path.path[Math.floor((crossingStart + end) / 2)];
        if (crossing !== undefined) crossingPointIndices.push(crossing);
        crossingStart = -1;
      }
    }
    const crossesHighRelief = path.path.some((pointIndex) => {
      const biome = terrain.points[pointIndex]?.biome;
      return biome === "mountain" || biome === "snow";
    });
    const edgeTerrain: AtlasEdge["terrain"] = crossesHighRelief
      ? "pass"
      : crossingPointIndices.length >= 3
        ? "river"
        : from.kind === "town" || to.kind === "town"
          ? "road"
          : "trail";
    return {
      id: edgeId(from.id, to.id),
      from: from.id,
      to: to.id,
      distance: path.distances[path.distances.length - 1] ?? 1,
      terrain: edgeTerrain,
      pathPointIndices: path.path,
      pathDistances: path.distances,
      crossingPointIndices,
    };
  }).sort((left, right) => compareText(left.id, right.id));
}

export function generateAtlas(seed: string, requestedLocationCount = 12, requestedKinds?: readonly LocationKind[]): AtlasState {
  const count = boundedCount(requestedLocationCount);
  const terrain = generateTerrain(seed);
  const neighbors = buildTerrainNeighbors(terrain);
  const component = largestLandComponent(terrain, neighbors);
  if (component.length < count) throw new Error("Atlas continent is too small for required locations");
  const locations = makeLocations(seed, count, terrain, component, requestedKinds);
  const edges = makeEdges(seed, terrain, neighbors, locations);
  return {
    terrain,
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

export function edgeBetween(atlas: AtlasState, left: string, right: string): AtlasEdge {
  const id = edgeId(left, right);
  const edge = atlas.edges.find((candidate) => candidate.id === id);
  if (edge === undefined) throw new Error(`No atlas edge joins ${left} and ${right}`);
  return edge;
}

export function orientedEdgePath(edge: AtlasEdge, fromId: string): { pointIndices: readonly number[]; distances: readonly number[] } {
  if (edge.from === fromId) return { pointIndices: edge.pathPointIndices, distances: edge.pathDistances };
  const total = edge.pathDistances[edge.pathDistances.length - 1] ?? edge.distance;
  return {
    pointIndices: [...edge.pathPointIndices].reverse(),
    distances: [...edge.pathDistances].reverse().map((distance) => total - distance),
  };
}

export function findRoute(atlas: AtlasState, destinationId: string): readonly string[] {
  if (!atlas.locations.some((location) => location.id === destinationId)) throw new Error("Unknown destination");
  if (destinationId === atlas.currentLocationId) return [destinationId];
  const distances = new Map<string, number>([[atlas.currentLocationId, 0]]);
  const previous = new Map<string, string | null>([[atlas.currentLocationId, null]]);
  const pending = new Set(atlas.locations.map((location) => location.id));
  while (pending.size > 0) {
    const current = [...pending].sort((left, right) => (distances.get(left) ?? Number.POSITIVE_INFINITY) - (distances.get(right) ?? Number.POSITIVE_INFINITY) || compareText(left, right))[0];
    if (current === undefined || !Number.isFinite(distances.get(current))) break;
    pending.delete(current);
    if (current === destinationId) break;
    for (const neighbor of neighboringLocationIds(atlas, current)) {
      if (!pending.has(neighbor)) continue;
      const nextDistance = (distances.get(current) ?? 0) + edgeBetween(atlas, current, neighbor).distance;
      if (nextDistance < (distances.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor, nextDistance);
        previous.set(neighbor, current);
      }
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
