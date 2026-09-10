import { describe, expect, it } from "vitest";
import { dungeonCaptionMinimumDetailCssSize, dungeonCaptionMinimumTitleCssSize,
  projectDungeonCaptionLayout, type DungeonCaptionLayout } from "./dungeon-caption-layout";
import { dungeonFramingViewRect } from "./dungeon-framing";
import { calculateSceneLayout } from "./layout";

function assertFits(layout: DungeonCaptionLayout, scale: number): void {
  expect(layout.rail.x).toBeGreaterThanOrEqual(0);
  expect(layout.rail.x + layout.rail.width).toBeLessThanOrEqual(320);
  expect(layout.rail.y).toBeGreaterThanOrEqual(0);
  expect(layout.rail.y + layout.rail.height).toBeLessThan(dungeonFramingViewRect.y);
  for (const line of [layout.title, layout.detail].filter((entry) => entry !== null)) {
    expect(line.x).toBeGreaterThan(layout.rail.x);
    expect(line.x + layout.maxTextWidth).toBeLessThan(layout.rail.x + layout.rail.width);
    expect(line.y).toBeGreaterThanOrEqual(layout.rail.y);
    expect(line.y + line.lineHeight).toBeLessThanOrEqual(layout.rail.y + layout.rail.height);
    expect(line.lineHeight).toBeGreaterThan(line.fontSize);
  }
  expect(layout.title.fontSize * scale).toBeGreaterThanOrEqual(dungeonCaptionMinimumTitleCssSize - 0.000001);
  if (layout.detail !== null) {
    expect(layout.title.y + layout.title.lineHeight).toBeLessThan(layout.detail.y);
    expect(layout.detail.fontSize * scale).toBeGreaterThanOrEqual(dungeonCaptionMinimumDetailCssSize - 0.000001);
  }
}

describe("responsive existing dungeon caption rail", () => {
  it("uses a readable 12px title and 11px detail at the actual 320px scene scale", () => {
    const scale = calculateSceneLayout(320, 640, 320, 180).scale;
    const layout = projectDungeonCaptionLayout(scale)!;
    expect(scale).toBe(1);
    expect(layout.compact).toBe(true);
    expect(layout.rail).toEqual({ x: 44, y: 0, width: 232, height: 30 });
    expect(layout.title.fontSize).toBe(12);
    expect(layout.detail?.fontSize).toBe(11);
    expect(layout.maxTextWidth).toBe(214);
    assertFits(layout, scale);
  });

  it("preserves the established desktop rail and type metrics once both CSS minimums are met", () => {
    const scale = calculateSceneLayout(1280, 720, 320, 180).scale;
    const layout = projectDungeonCaptionLayout(scale)!;
    expect(layout.compact).toBe(false);
    expect(layout.rail).toEqual({ x: 101, y: 2, width: 181, height: 23 });
    expect(layout.title).toEqual({ x: 110, y: 5, fontSize: 7, lineHeight: 8, letterSpacing: 1.1 });
    expect(layout.detail).toEqual({ x: 110, y: 15, fontSize: 4.5, lineHeight: 5.5, letterSpacing: 0.35 });
    assertFits(layout, scale);
  });

  it("keeps compact wording until the detail is readable too, without shrinking either font", () => {
    for (const scale of [1, 1.01, 1.2, 1.75, 2, 2.4]) {
      const layout = projectDungeonCaptionLayout(scale)!;
      expect(layout.compact).toBe(true);
      expect(layout.detail).not.toBeNull();
      assertFits(layout, scale);
    }
    expect(projectDungeonCaptionLayout(2.45)?.compact).toBe(false);
  });

  it("uses only a readable headline when two lines cannot fit a very short or smaller scene", () => {
    for (const scale of [0.5, 0.75, 0.99]) {
      const layout = projectDungeonCaptionLayout(scale)!;
      expect(layout.compact).toBe(true);
      expect(layout.detail).toBeNull();
      assertFits(layout, scale);
    }
    expect(projectDungeonCaptionLayout(calculateSceneLayout(320, 90, 320, 180).scale)?.detail).toBeNull();
  });

  it("fails closed for impossible or invalid scales and returns immutable presentation-only data", () => {
    for (const scale of [0, -1, 0.49, NaN, Infinity, -Infinity]) expect(projectDungeonCaptionLayout(scale)).toBeNull();
    const layout = projectDungeonCaptionLayout(1)!;
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.rail)).toBe(true);
    expect(Object.isFrozen(layout.title)).toBe(true);
    expect(Object.isFrozen(layout.detail)).toBe(true);
    expect(projectDungeonCaptionLayout(JSON.parse(JSON.stringify(1)))).toEqual(layout);
    expect(Object.keys(layout).sort()).toEqual(["compact", "detail", "maxTextWidth", "rail", "title"]);
  });
});
