import { describe, expect, it } from "vitest";
import { dungeonFramingGutter, dungeonFramingMaximumCellSize, dungeonFramingViewRect, projectDungeonFraming, type DungeonFraming } from "./dungeon-framing";

function assertFits(frame: DungeonFraming): void {
  const rect = dungeonFramingViewRect;
  const left = frame.offsetX + (frame.bounds.minX - dungeonFramingGutter) * frame.cellSize;
  const right = frame.offsetX + (frame.bounds.maxX + 1 + dungeonFramingGutter) * frame.cellSize;
  const top = frame.offsetY + (frame.bounds.minY - dungeonFramingGutter) * frame.cellSize;
  const bottom = frame.offsetY + (frame.bounds.maxY + 1 + dungeonFramingGutter) * frame.cellSize;
  expect(left).toBeGreaterThanOrEqual(rect.x - 0.000001);
  expect(right).toBeLessThanOrEqual(rect.x + rect.width + 0.000001);
  expect(top).toBeGreaterThanOrEqual(rect.y - 0.000001);
  expect(bottom).toBeLessThanOrEqual(rect.y + rect.height + 0.000001);
  expect((left + right) / 2).toBeCloseTo(rect.x + rect.width / 2);
  expect((top + bottom) / 2).toBeCloseTo(rect.y + rect.height / 2);
}

describe("public discovered-room dungeon framing", () => {
  it("enlarges one or two known rooms without allocating space to an unknown 7×7 maze", () => {
    const oldCellSize = Math.min(232 / 7, 132 / 7);
    for (const cells of [[{ x: 2, y: 0 }], [{ x: 2, y: 0 }, { x: 2, y: 1 }]]) {
      const frame = projectDungeonFraming(cells)!;
      expect(frame.cellSize).toBe(dungeonFramingMaximumCellSize);
      expect(frame.cellSize).toBeGreaterThan(oldCellSize * 2);
      expect(frame.roomCount).toBe(cells.length);
      assertFits(frame);
    }
    expect(projectDungeonFraming([{ x: 0, y: 0 }])).toEqual({
      cellSize: 40, offsetX: 140, offsetY: 74,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, roomCount: 1,
    });
  });

  it("fits the full 24×24 known map including its outer room gutter without a clipping minimum", () => {
    const cells = Array.from({ length: 24 * 24 }, (_, index) => ({ x: index % 24, y: Math.floor(index / 24) }));
    const frame = projectDungeonFraming(cells)!;
    expect(frame.cellSize).toBeCloseTo(124 / 24.5);
    expect(frame.roomCount).toBe(576);
    expect(frame.bounds).toEqual({ minX: 0, minY: 0, maxX: 23, maxY: 23 });
    assertFits(frame);
  });

  it("fits extremely wide or tall public extents rather than clamping small rooms into clipping", () => {
    for (const cells of [
      [{ x: -1000, y: 0 }, { x: 1000, y: 0 }],
      [{ x: 0, y: -1000 }, { x: 0, y: 1000 }],
    ]) {
      const frame = projectDungeonFraming(cells)!;
      expect(frame.cellSize).toBeGreaterThan(0);
      expect(frame.cellSize).toBeLessThan(1);
      assertFits(frame);
    }
  });

  it("is independent of coordinate order and duplicates and preserves JSON reload output", () => {
    const cells = [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 5 }];
    const frame = projectDungeonFraming(cells);
    expect(projectDungeonFraming([...cells].reverse())).toEqual(frame);
    expect(projectDungeonFraming([...cells, cells[0]!, cells[1]!])).toEqual(frame);
    expect(projectDungeonFraming(JSON.parse(JSON.stringify(cells)))).toEqual(frame);
    expect(frame!.roomCount).toBe(3);
  });

  it("keeps the on-screen framing identical when all known coordinates are translated", () => {
    const cells = [{ x: 1, y: 2 }, { x: 2, y: 5 }];
    const shifted = cells.map((cell) => ({ x: cell.x - 150, y: cell.y + 300 }));
    const frame = projectDungeonFraming(cells)!;
    const translated = projectDungeonFraming(shifted)!;
    expect(translated.cellSize).toBe(frame.cellSize);
    expect(translated.roomCount).toBe(frame.roomCount);
    for (let index = 0; index < cells.length; index += 1) {
      expect(translated.offsetX + shifted[index]!.x * translated.cellSize).toBeCloseTo(frame.offsetX + cells[index]!.x * frame.cellSize);
      expect(translated.offsetY + shifted[index]!.y * translated.cellSize).toBeCloseTo(frame.offsetY + cells[index]!.y * frame.cellSize);
    }
    assertFits(translated);
  });

  it("accepts only public coordinates and leaves the caller's data unchanged", () => {
    const cells = Object.freeze([Object.freeze({ x: 2, y: 0 }), Object.freeze({ x: 2, y: 1 })]);
    const before = JSON.stringify(cells);
    const frame = projectDungeonFraming(cells)!;
    expect(JSON.stringify(cells)).toBe(before);
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.bounds)).toBe(true);
    // Hidden rooms, features, maze dimensions and game state cannot participate:
    // the projector has only this coordinate-list input.
    expect(Object.keys(frame).sort()).toEqual(["bounds", "cellSize", "offsetX", "offsetY", "roomCount"]);
    assertFits(frame);
  });

  it("fails closed for empty, invalid, or precision-losing coordinate input", () => {
    for (const cells of [
      [], [{ x: NaN, y: 0 }], [{ x: 0, y: Infinity }], [{ x: 0.5, y: 0 }],
      [{ x: Number.MAX_SAFE_INTEGER + 1, y: 0 }],
      [{ x: Number.MAX_SAFE_INTEGER, y: 0 }],
      [{ x: -Number.MAX_SAFE_INTEGER, y: 0 }, { x: Number.MAX_SAFE_INTEGER, y: 0 }],
    ]) expect(projectDungeonFraming(cells)).toBeNull();
  });
});
