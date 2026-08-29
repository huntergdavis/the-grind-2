import { randomInt } from "../core/rng";
import type {
  AtlasBiome,
  AtlasCoastSegment,
  AtlasRiver,
  AtlasTerrain,
  AtlasTerrainPoint,
  AtlasTriangle,
} from "./types";

const terrainWidth = 1_000;
const terrainHeight = 1_000;
const columns = 24;
const rows = 14;

interface DraftPoint {
  x: number;
  y: number;
  elevation: number;
  filledElevation: number;
  moisture: number;
  flux: number;
  biome: AtlasBiome;
  downhill: number | null;
}

interface HeapEntry {
  index: number;
  priority: number;
}

class MinHeap {
  private readonly values: HeapEntry[] = [];

  get size(): number {
    return this.values.length;
  }

  push(entry: HeapEntry): void {
    this.values.push(entry);
    let child = this.values.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      const parentEntry = this.values[parent];
      if (parentEntry === undefined || parentEntry.priority <= entry.priority) break;
      this.values[child] = parentEntry;
      child = parent;
    }
    this.values[child] = entry;
  }

  pop(): HeapEntry | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (first === undefined || last === undefined || this.values.length === 0) return first;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const leftEntry = this.values[left];
      const rightEntry = this.values[right];
      if (leftEntry === undefined) break;
      const child = rightEntry !== undefined && rightEntry.priority < leftEntry.priority ? right : left;
      const childEntry = this.values[child];
      if (childEntry === undefined || childEntry.priority >= last.priority) break;
      this.values[parent] = childEntry;
      parent = child;
    }
    this.values[parent] = last;
    return first;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

type TerrainSignatureSource = Omit<AtlasTerrain, "signature">;

export function calculateTerrainSignature(terrain: TerrainSignatureSource): string {
  let hash = 0x811c9dc5;
  const consume = (value: number): void => {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  };
  const consumeText = (value: string): void => {
    for (let index = 0; index < value.length; index += 1) consume(value.charCodeAt(index));
    consume(0xff);
  };
  consume(terrain.version);
  consumeText(terrain.generator);
  consume(terrain.width);
  consume(terrain.height);
  consume(terrain.seaLevel);
  for (const point of terrain.points) {
    consume(point.x);
    consume(point.y);
    consume(point.elevation);
    consume(point.filledElevation);
    consume(point.moisture);
    consume(point.flux);
    consumeText(point.biome);
    consume(point.downhill ?? -1);
  }
  for (const triangle of terrain.triangles) {
    consume(triangle.a);
    consume(triangle.b);
    consume(triangle.c);
  }
  for (const segment of terrain.coastline) {
    consume(segment.x1);
    consume(segment.y1);
    consume(segment.x2);
    consume(segment.y2);
  }
  for (const river of terrain.rivers) {
    consumeText(river.id);
    consume(river.flux);
    consume(river.pointIndices.length);
    for (const pointIndex of river.pointIndices) consume(pointIndex);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function pointIndex(column: number, row: number): number {
  return row * (columns + 1) + column;
}

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const denominator = dx * dx + dy * dy;
  const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / denominator));
  return Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy));
}

function makeMesh(seed: string): { points: DraftPoint[]; triangles: AtlasTriangle[] } {
  const points: DraftPoint[] = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const boundary = column === 0 || column === columns || row === 0 || row === rows;
      const cellId = `${column}:${row}`;
      const baseX = Math.round((column * terrainWidth) / columns);
      const baseY = Math.round((row * terrainHeight) / rows);
      const xJitter = boundary ? 0 : randomInt(25, seed, "atlas-terrain", cellId, 0, "x-jitter") - 12;
      const yJitter = boundary ? 0 : randomInt(37, seed, "atlas-terrain", cellId, 0, "y-jitter") - 18;
      points.push({
        x: clamp(baseX + xJitter, 0, terrainWidth),
        y: clamp(baseY + yJitter, 0, terrainHeight),
        elevation: 0,
        filledElevation: 0,
        moisture: 0,
        flux: 0,
        biome: "ocean",
        downhill: null,
      });
    }
  }

  const triangles: AtlasTriangle[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = pointIndex(column, row);
      const topRight = pointIndex(column + 1, row);
      const bottomLeft = pointIndex(column, row + 1);
      const bottomRight = pointIndex(column + 1, row + 1);
      const alternate = randomInt(2, seed, "atlas-terrain", `${column}:${row}`, 0, "diagonal") === 1;
      if (alternate) {
        triangles.push({ a: topLeft, b: topRight, c: bottomLeft });
        triangles.push({ a: topRight, b: bottomRight, c: bottomLeft });
      } else {
        triangles.push({ a: topLeft, b: topRight, c: bottomRight });
        triangles.push({ a: topLeft, b: bottomRight, c: bottomLeft });
      }
    }
  }
  return { points, triangles };
}

export function buildTerrainNeighbors(terrain: Pick<AtlasTerrain, "points" | "triangles">): readonly (readonly number[])[] {
  const neighbors = terrain.points.map(() => new Set<number>());
  for (const triangle of terrain.triangles) {
    const pairs = [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]] as const;
    for (const [left, right] of pairs) {
      neighbors[left]?.add(right);
      neighbors[right]?.add(left);
    }
  }
  return neighbors.map((entries) => [...entries].sort((left, right) => left - right));
}

function assignElevation(seed: string, points: DraftPoint[], neighbors: readonly (readonly number[])[]): number {
  const ridgeTilt = randomInt(241, seed, "atlas-terrain", "ridge:main", 0, "tilt") - 120;
  const ridgeY1 = 280 + randomInt(180, seed, "atlas-terrain", "ridge:main", 0, "y1");
  const ridgeY2 = 560 + ridgeTilt;
  const spurX = 360 + randomInt(220, seed, "atlas-terrain", "ridge:spur", 0, "x");
  const spurY = 320 + randomInt(260, seed, "atlas-terrain", "ridge:spur", 0, "y");
  const hills = Array.from({ length: 9 }, (_, hill) => {
    const hillId = `hill:${hill}`;
    return {
      centerX: 130 + randomInt(741, seed, "atlas-terrain", hillId, 0, "x"),
      centerY: 120 + randomInt(761, seed, "atlas-terrain", hillId, 0, "y"),
      radius: 100 + randomInt(161, seed, "atlas-terrain", hillId, 0, "radius"),
      amplitude: 90 + randomInt(181, seed, "atlas-terrain", hillId, 0, "amplitude"),
    };
  });
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    const radial = Math.hypot((point.x - 500) / 500, (point.y - 500) / 500);
    let elevation = 670 - radial * 570;
    const mainRidgeDistance = distanceToSegment(point.x, point.y, 150, ridgeY1, 850, ridgeY2);
    const spurDistance = distanceToSegment(point.x, point.y, 500, Math.round((ridgeY1 + ridgeY2) / 2), spurX, spurY);
    elevation += Math.max(0, 270 - mainRidgeDistance * 2.25);
    elevation += Math.max(0, 160 - spurDistance * 2.4);
    for (const hill of hills) {
      const distance = Math.hypot(point.x - hill.centerX, point.y - hill.centerY);
      if (distance < hill.radius) elevation += hill.amplitude * (1 - distance / hill.radius);
    }
    elevation += randomInt(101, seed, "atlas-terrain", `point:${index}`, 0, "roughness") - 50;
    point.elevation = Math.round(elevation);
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed = points.map((point, index) => {
      const adjacent = neighbors[index] ?? [];
      const neighborTotal = adjacent.reduce((total, neighbor) => total + (points[neighbor]?.elevation ?? point.elevation), 0);
      const neighborMean = adjacent.length === 0 ? point.elevation : neighborTotal / adjacent.length;
      return Math.round(point.elevation * 0.72 + neighborMean * 0.28);
    });
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const elevation = smoothed[index];
      if (point !== undefined && elevation !== undefined) point.elevation = elevation;
    }
  }

  const ordered = points.map((point) => point.elevation).sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length * 0.34)] ?? 0;
}

function fillSinks(points: DraftPoint[], neighbors: readonly (readonly number[])[], seaLevel: number): void {
  const heap = new MinHeap();
  const visited = new Set<number>();
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined || point.elevation >= seaLevel) continue;
    point.filledElevation = point.elevation;
    point.downhill = null;
    heap.push({ index, priority: point.filledElevation });
    visited.add(index);
  }
  while (heap.size > 0) {
    const currentEntry = heap.pop();
    if (currentEntry === undefined) break;
    const current = points[currentEntry.index];
    if (current === undefined) continue;
    for (const neighborIndex of neighbors[currentEntry.index] ?? []) {
      if (visited.has(neighborIndex)) continue;
      const neighbor = points[neighborIndex];
      if (neighbor === undefined) continue;
      visited.add(neighborIndex);
      neighbor.filledElevation = Math.max(neighbor.elevation, current.filledElevation + 1);
      neighbor.downhill = currentEntry.index;
      heap.push({ index: neighborIndex, priority: neighbor.filledElevation });
    }
  }
}

function assignFlux(points: DraftPoint[], seaLevel: number): void {
  for (const point of points) point.flux = point.elevation >= seaLevel ? 1 : 0;
  const order = points
    .map((point, index) => ({ index, elevation: point.filledElevation }))
    .sort((left, right) => right.elevation - left.elevation || left.index - right.index);
  for (const entry of order) {
    const point = points[entry.index];
    if (point === undefined || point.downhill === null) continue;
    const target = points[point.downhill];
    if (target !== undefined) target.flux += point.flux;
  }
}

function traceRivers(points: DraftPoint[], seaLevel: number): AtlasRiver[] {
  const candidates = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => point.elevation >= seaLevel + 35 && point.flux >= 9)
    .sort((left, right) => right.point.flux - left.point.flux || left.index - right.index);
  const occupied = new Set<number>();
  const rivers: AtlasRiver[] = [];
  for (const candidate of candidates) {
    if (rivers.length >= 14 || occupied.has(candidate.index)) continue;
    const path: number[] = [];
    const seen = new Set<number>();
    let cursor: number | null = candidate.index;
    while (cursor !== null && !seen.has(cursor) && path.length <= points.length) {
      path.push(cursor);
      seen.add(cursor);
      const point: DraftPoint | undefined = points[cursor];
      if (point === undefined || point.elevation < seaLevel) break;
      cursor = point.downhill;
    }
    const mouth = path.length === 0 ? undefined : points[path[path.length - 1] ?? -1];
    if (path.length < 4 || mouth === undefined || mouth.elevation >= seaLevel) continue;
    rivers.push({ id: `river:${rivers.length}`, pointIndices: path, flux: candidate.point.flux });
    for (const point of path.slice(0, -1)) occupied.add(point);
  }
  return rivers;
}

function assignMoistureAndBiomes(
  points: DraftPoint[],
  neighbors: readonly (readonly number[])[],
  rivers: readonly AtlasRiver[],
  seaLevel: number,
): void {
  const distance = points.map(() => Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point !== undefined && point.elevation < seaLevel) {
      distance[index] = 0;
      queue.push(index);
    }
  }
  for (const river of rivers) {
    for (const index of river.pointIndices) {
      if ((distance[index] ?? 0) > 0) {
        distance[index] = 0;
        queue.push(index);
      }
    }
  }
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) continue;
    for (const neighbor of neighbors[current] ?? []) {
      const nextDistance = (distance[current] ?? 0) + 1;
      if (nextDistance < (distance[neighbor] ?? Number.POSITIVE_INFINITY)) {
        distance[neighbor] = nextDistance;
        queue.push(neighbor);
      }
    }
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    const waterDistance = Number.isFinite(distance[index]) ? (distance[index] ?? 12) : 12;
    const rainShadow = point.x > 530 && point.elevation < seaLevel + 190 ? 150 : 0;
    point.moisture = clamp(930 - waterDistance * 105 - rainShadow + Math.min(120, point.flux * 5), 0, 1_000);
    if (point.elevation < seaLevel) {
      point.biome = "ocean";
      continue;
    }
    const coastal = (neighbors[index] ?? []).some((neighbor) => (points[neighbor]?.elevation ?? seaLevel) < seaLevel);
    const latitude = Math.abs(point.y - terrainHeight / 2) / (terrainHeight / 2);
    const relativeElevation = point.elevation - seaLevel;
    if (relativeElevation > 465) point.biome = "snow";
    else if (relativeElevation > 350) point.biome = "mountain";
    else if (coastal) point.biome = "coast";
    else if (relativeElevation < 65 && point.flux >= 14) point.biome = "marsh";
    else if (latitude > 0.72 && relativeElevation > 90) point.biome = "tundra";
    else if (point.moisture < 300) point.biome = "desert";
    else if (point.moisture > 790 && latitude < 0.55) point.biome = "rainforest";
    else if (point.moisture > 560) point.biome = "forest";
    else point.biome = "grassland";
  }
}

function interpolateCoast(left: DraftPoint, right: DraftPoint, seaLevel: number): readonly [number, number] {
  const denominator = right.elevation - left.elevation;
  const ratio = denominator === 0 ? 0.5 : (seaLevel - left.elevation) / denominator;
  return [
    clamp(left.x + (right.x - left.x) * ratio, 0, terrainWidth),
    clamp(left.y + (right.y - left.y) * ratio, 0, terrainHeight),
  ];
}

function extractCoastline(points: readonly DraftPoint[], triangles: readonly AtlasTriangle[], seaLevel: number): AtlasCoastSegment[] {
  const coastline: AtlasCoastSegment[] = [];
  for (const triangle of triangles) {
    const indices = [triangle.a, triangle.b, triangle.c] as const;
    const crossings: Array<readonly [number, number]> = [];
    for (let index = 0; index < indices.length; index += 1) {
      const left = points[indices[index] ?? -1];
      const right = points[indices[(index + 1) % indices.length] ?? -1];
      if (left === undefined || right === undefined) continue;
      if ((left.elevation >= seaLevel) === (right.elevation >= seaLevel)) continue;
      crossings.push(interpolateCoast(left, right, seaLevel));
    }
    const first = crossings[0];
    const second = crossings[1];
    if (first !== undefined && second !== undefined) {
      coastline.push({ x1: first[0], y1: first[1], x2: second[0], y2: second[1] });
    }
  }
  return coastline;
}

export function generateTerrain(seed: string): AtlasTerrain {
  const { points, triangles } = makeMesh(seed);
  const neighbors = buildTerrainNeighbors({ points, triangles });
  const seaLevel = assignElevation(seed, points, neighbors);
  fillSinks(points, neighbors, seaLevel);
  assignFlux(points, seaLevel);
  const rivers = traceRivers(points, seaLevel);
  assignMoistureAndBiomes(points, neighbors, rivers, seaLevel);
  const coastline = extractCoastline(points, triangles, seaLevel);
  const unsigned: TerrainSignatureSource = {
    version: 1,
    generator: "oleary-inspired-v1",
    width: terrainWidth,
    height: terrainHeight,
    seaLevel,
    points: points as readonly AtlasTerrainPoint[],
    triangles,
    coastline,
    rivers,
  };
  return { ...unsigned, signature: calculateTerrainSignature(unsigned) };
}
