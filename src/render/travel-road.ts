import type { AtlasEdge } from "../depth/types";

export interface TravelRoadPoint {
  readonly x: number;
  readonly y: number;
}

export interface TravelRoadGeometry {
  readonly schemaVersion: 1;
  readonly topology: "single-ribbon";
  readonly terrain: AtlasEdge["terrain"];
  readonly startX: number;
  readonly endX: number;
  readonly startY: number;
  readonly endY: number;
  readonly curveAmount: number;
  readonly halfWidth: number;
  readonly centerline: readonly TravelRoadPoint[];
  readonly upperEdge: readonly TravelRoadPoint[];
  readonly lowerEdge: readonly TravelRoadPoint[];
  readonly polygon: readonly TravelRoadPoint[];
}

const halfWidthByTerrain: Readonly<Record<AtlasEdge["terrain"], number>> = {
  road: 10,
  trail: 6,
  pass: 9,
  river: 11,
};

function clamp(value: number, minimum: number, maximum: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.max(minimum, Math.min(maximum, finite));
}

function freezePoint(x: number, y: number): TravelRoadPoint {
  return Object.freeze({ x, y });
}

function centerY(startY: number, endY: number, curveAmount: number, ratio: number): number {
  return startY + (endY - startY) * ratio + Math.sin(Math.PI * ratio) * curveAmount;
}

export function projectTravelRoadGeometry(
  terrain: AtlasEdge["terrain"],
  signedSlope: number,
  curve: number,
): TravelRoadGeometry {
  const startX = -16;
  const endX = 336;
  const pathRise = clamp(signedSlope * 2_800, -8, 8);
  const startY = 150 + pathRise / 2;
  const endY = 150 - pathRise / 2;
  const curveAmount = clamp(curve * 9, -8, 8);
  const halfWidth = halfWidthByTerrain[terrain];
  const samples = 25;
  const centerline = Object.freeze(Array.from({ length: samples }, (_, index) => {
    const ratio = index / (samples - 1);
    return freezePoint(
      startX + (endX - startX) * ratio,
      centerY(startY, endY, curveAmount, ratio),
    );
  }));
  const upperEdge = Object.freeze(centerline.map((point) => freezePoint(point.x, point.y - halfWidth)));
  const lowerEdge = Object.freeze(centerline.map((point) => freezePoint(point.x, point.y + halfWidth)));
  return Object.freeze({
    schemaVersion: 1,
    topology: "single-ribbon",
    terrain,
    startX,
    endX,
    startY,
    endY,
    curveAmount,
    halfWidth,
    centerline,
    upperEdge,
    lowerEdge,
    polygon: Object.freeze([...upperEdge, ...lowerEdge.toReversed()]),
  });
}

export function projectTravelRoadY(geometry: TravelRoadGeometry, x: number): number {
  const ratio = clamp((x - geometry.startX) / (geometry.endX - geometry.startX), 0, 1);
  return centerY(geometry.startY, geometry.endY, geometry.curveAmount, ratio);
}

export function projectTravelRoadFlow(
  geometry: TravelRoadGeometry,
  elapsedSeconds: number,
  count = 10,
): readonly TravelRoadPoint[] {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const safeCount = Math.max(1, Math.min(16, Math.floor(Number.isFinite(count) ? count : 10)));
  const phase = (safeElapsed * 0.055) % 1;
  return Object.freeze(Array.from({ length: safeCount }, (_, index) => {
    const ratio = ((index + 0.5) / safeCount - phase + 1) % 1;
    const x = geometry.startX + (geometry.endX - geometry.startX) * ratio;
    const laneOffset = (index % 2 === 0 ? -0.46 : 0.46) * geometry.halfWidth;
    return freezePoint(x, projectTravelRoadY(geometry, x) + laneOffset);
  }));
}
