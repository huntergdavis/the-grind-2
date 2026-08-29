import { describe, expect, it } from "vitest";
import { animatedLayerY, calculateSceneLayout } from "./layout";

describe("responsive scene layout", () => {
  it.each([
    [320, 568, 0, 194],
    [375, 667, 0, 228.03125],
    [568, 320, 0, 0.25],
    [1366, 768, 0.33333333333337123, 0],
  ])("keeps 320x180 centered inside %ix%i", (width, height, expectedX, expectedY) => {
    const layout = calculateSceneLayout(width, height, 320, 180);
    expect(layout.x).toBeCloseTo(expectedX);
    expect(layout.y).toBeCloseTo(expectedY);
  });

  it("preserves the portrait base offset while the character layer bobs", () => {
    const layout = calculateSceneLayout(320, 568, 320, 180);
    for (let frame = 0; frame < 300; frame += 1) {
      expect(Math.abs(animatedLayerY(layout.y, frame / 30) - layout.y)).toBeLessThanOrEqual(0.8);
    }
  });
});
