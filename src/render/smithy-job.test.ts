import { describe, expect, it } from "vitest";
import { drawSmithyJob, projectSmithyHammerPose, smithyJobTableau } from "./smithy-job";

describe("the native two-stroke smithy work bay", () => {
  it("keeps the actual actors on opposite sides of a bounded anvil without adding an actor", () => {
    expect(smithyJobTableau.heroX).toBeLessThan(smithyJobTableau.anvilX);
    expect(smithyJobTableau.residentX).toBeGreaterThan(smithyJobTableau.anvilX);
    for (const shape of ["in-progress", "unfinished", "straight", "bent"] as const) {
      const drawing = drawSmithyJob({ shape, strokeCount: shape === "in-progress" ? 1 : 2 });
      const bounds = drawing.layer.getLocalBounds();
      expect(bounds.x).toBeGreaterThanOrEqual(60); expect(bounds.y).toBeGreaterThanOrEqual(50);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(270);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(165);
      expect(drawing.layer.children.length).toBe(shape === "in-progress" ? 6 : 7);
      drawing.layer.destroy({ children: true });
    }
  });

  it("gives straight, blunt and bent workpieces visibly different silhouettes", () => {
    const silhouettes = ["unfinished", "straight", "bent"].map(shape => {
      const drawing = drawSmithyJob({ shape: shape as "unfinished" | "straight" | "bent", strokeCount: 2 });
      const bounds = drawing.layer.children[3]!.getLocalBounds();
      const result = `${bounds.x}/${bounds.y}/${bounds.width}/${bounds.height}`;
      drawing.layer.destroy({ children: true }); return result;
    });
    expect(new Set(silhouettes).size).toBe(3);
  });

  it("lifts and strikes once, then stays settled; reduced motion never swings", () => {
    expect(projectSmithyHammerPose(0, false)).toBeCloseTo(0.12);
    expect(projectSmithyHammerPose(0.22, false)).toBeCloseTo(-0.98);
    expect(projectSmithyHammerPose(0.46, false)).toBeCloseTo(0.12);
    for (const elapsed of [0.7, 1, 2, 10, 100]) expect(projectSmithyHammerPose(elapsed, false)).toBe(0.12);
    for (const elapsed of [0, 0.1, 0.22, 0.4, 100]) expect(projectSmithyHammerPose(elapsed, true)).toBe(0.12);
  });
});
