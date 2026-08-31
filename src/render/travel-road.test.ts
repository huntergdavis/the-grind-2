import { describe, expect, it } from "vitest";
import {
  projectTravelRoadFlow,
  projectTravelRoadGeometry,
  projectTravelRoadY,
} from "./travel-road";

describe("travel road geometry", () => {
  it("projects one continuous left-to-right ribbon with no branch", () => {
    const road = projectTravelRoadGeometry("road", 0.001, 0.6);
    expect(road).toMatchObject({ schemaVersion: 1, topology: "single-ribbon", terrain: "road" });
    expect(road.centerline).toHaveLength(25);
    expect(road.polygon).toHaveLength(50);
    expect(road.centerline[0]?.x).toBe(-16);
    expect(road.centerline.at(-1)?.x).toBe(336);
    expect(road.centerline.every((point, index) => index === 0 || point.x > (road.centerline[index - 1]?.x ?? point.x))).toBe(true);
  });

  it("keeps every terrain centered on the same mechanically truthful surface", () => {
    const widths = ["road", "trail", "pass", "river"].map((terrain) => {
      const road = projectTravelRoadGeometry(terrain as "road" | "trail" | "pass" | "river", 0, 0);
      expect(projectTravelRoadY(road, 160)).toBe(150);
      expect(road.upperEdge.every((point, index) => point.y === (road.centerline[index]?.y ?? 0) - road.halfWidth)).toBe(true);
      expect(road.lowerEdge.every((point, index) => point.y === (road.centerline[index]?.y ?? 0) + road.halfWidth)).toBe(true);
      return road.halfWidth;
    });
    expect(widths).toEqual([10, 6, 9, 11]);
  });

  it("mirrors slope direction and bends only the middle of the ribbon", () => {
    const forward = projectTravelRoadGeometry("road", 0.002, 1);
    const reverse = projectTravelRoadGeometry("road", -0.002, -1);
    expect(forward.startY).toBe(reverse.endY);
    expect(forward.endY).toBe(reverse.startY);
    expect(forward.curveAmount).toBe(-reverse.curveAmount);
    expect(projectTravelRoadY(forward, forward.startX)).toBe(forward.startY);
    expect(projectTravelRoadY(forward, forward.endX)).toBeCloseTo(forward.endY, 8);
    expect(projectTravelRoadY(forward, 160)).not.toBe(150);
  });

  it("moves bounded surface texture opposite the hero's screen progress", () => {
    const road = projectTravelRoadGeometry("trail", 0, 0.2);
    const first = projectTravelRoadFlow(road, 0, 10);
    const later = projectTravelRoadFlow(road, 1, 10);
    expect(first).toHaveLength(10);
    expect(later[4]?.x).toBeLessThan(first[4]?.x ?? Number.NEGATIVE_INFINITY);
    for (const point of later) {
      expect(point.x).toBeGreaterThanOrEqual(road.startX);
      expect(point.x).toBeLessThan(road.endX);
      expect(Math.abs(point.y - projectTravelRoadY(road, point.x))).toBeLessThanOrEqual(road.halfWidth);
    }
  });

  it("stays finite and serializable for hostile numeric inputs", () => {
    const road = projectTravelRoadGeometry("pass", Number.NaN, Number.POSITIVE_INFINITY);
    const flow = projectTravelRoadFlow(road, Number.NaN, Number.POSITIVE_INFINITY);
    expect([...road.polygon, ...flow].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    expect(JSON.parse(JSON.stringify(road))).toEqual(road);
  });
});
