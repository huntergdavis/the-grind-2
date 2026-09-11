import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";
import { calculateSceneLayout } from "./layout";
import { drawRoadSupper, projectRoadSupperSteam, roadSupperTableau } from "./road-supper";

describe("native Road Supper props", () => {
  it("distinguishes two purchased units from the meal and two empty wrappers", () => {
    const bought = drawRoadSupper("purchase"), prepared = drawRoadSupper("prepared");
    expect(bought.layer.children.filter(child => child.label === "purchased-road-ration")).toHaveLength(2);
    expect(bought.steam).toBeNull();
    expect(prepared.layer.children.filter(child => child.label === "purchased-road-ration")).toHaveLength(0);
    expect(prepared.layer.children.filter(child => child.label === "consumed-ration-wrapper")).toHaveLength(2);
    expect(prepared.layer.children.some(child => child.label === "prepared-supper-bowl")).toBe(true);
    expect(roadSupperTableau).toMatchObject({ heroX: 124, heroY: 139, bowlX: 172, bowlY: 135 });
    for (const drawing of [bought, prepared]) {
      for (const child of drawing.layer.children) {
        if (!(child instanceof Graphics)) continue;
        expect(child.context.bounds.minX).toBeGreaterThanOrEqual(105);
        expect(child.context.bounds.maxX).toBeLessThanOrEqual(260);
        expect(child.context.bounds.minY).toBeGreaterThanOrEqual(67);
        expect(child.context.bounds.maxY).toBeLessThanOrEqual(163);
      }
      drawing.layer.destroy({ children: true });
    }
  });

  it("settles one wisp without looping or animating a reduced-motion scene", () => {
    expect(projectRoadSupperSteam(0, false)).toEqual({ progress: 0, y: -0, alpha: 0.6 });
    expect(projectRoadSupperSteam(0.4, false)).toEqual({ progress: 0.5, y: -6, alpha: 0.3 });
    expect(projectRoadSupperSteam(0, true)).toEqual(projectRoadSupperSteam(20, false));
    expect(projectRoadSupperSteam(20, false)).toEqual({ progress: 1, y: -12, alpha: 0 });
  });

  it("fits the supper actor and props inside a short chrome-reserved Watch viewport", () => {
    // A short host models the space left after navigation and the party ribbon,
    // not a full phone screen. The ordinary camp's fixed y96 cannot fit here.
    const width = 320, height = 210;
    const layout = calculateSceneLayout(width, height, 320, 180);
    const prepared = drawRoadSupper("prepared");
    expect(layout.y + roadSupperTableau.heroY * layout.scale).toBeLessThan(height);
    expect(layout.y + (roadSupperTableau.heroY - 44) * layout.scale).toBeGreaterThan(0);
    expect(96 + roadSupperTableau.heroY * layout.scale).toBeGreaterThan(height);
    for (const child of prepared.layer.children) {
      if (!(child instanceof Graphics)) continue;
      const bounds = child.context.bounds;
      expect(layout.x + bounds.minX * layout.scale).toBeGreaterThanOrEqual(0);
      expect(layout.x + bounds.maxX * layout.scale).toBeLessThanOrEqual(width);
      expect(layout.y + bounds.minY * layout.scale).toBeGreaterThanOrEqual(0);
      expect(layout.y + bounds.maxY * layout.scale).toBeLessThanOrEqual(height);
    }
    prepared.layer.destroy({ children: true });
  });
});
