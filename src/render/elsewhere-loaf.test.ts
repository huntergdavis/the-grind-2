import { describe, expect, it } from "vitest";
import { drawElsewhereLoaf, elsewhereLoafTableau, projectElsewhereLoafPose } from "./elsewhere-loaf";

describe("native Elsewhere bakery", () => {
  it("draws exactly the committed dough or loaf without a hero, merchant, private roll or extra product", () => {
    for (const product of ["dough", "plain-loaf", "unexpected-delight", "bricklike-loaf"] as const) {
      const drawing = drawElsewhereLoaf({ product });
      expect(drawing.children.map(child => child.label)).toEqual(["admitted-inn-worksite", "admitted-oven", "trial-worktable", product]);
      expect(drawing.children.at(-1)!.position).toMatchObject({ x: 176, y: 123 });
      const bounds = drawing.getLocalBounds();
      expect(bounds.minX).toBeGreaterThanOrEqual(0); expect(bounds.maxX).toBeLessThanOrEqual(320);
      expect(bounds.minY).toBeGreaterThanOrEqual(0); expect(bounds.maxY).toBeLessThanOrEqual(180);
      drawing.destroy({ children: true });
    }
  });

  it("finishes a bounded gesture once and keeps the still outcome under reduced motion", () => {
    for (const phase of ["admission", "completion"] as const) {
      const start = projectElsewhereLoafPose(phase, 0, false), middle = projectElsewhereLoafPose(phase, 0.4, false);
      const settled = projectElsewhereLoafPose(phase, 1.6, false);
      expect(middle.frontArm).not.toBe(start.frontArm);
      expect(projectElsewhereLoafPose(phase, 60, false)).toEqual(settled);
      expect(projectElsewhereLoafPose(phase, 0, true)).toEqual(settled);
      expect(settled.progress).toBe(1);
    }
  });

  it("keeps the native front hand in contact with the dough throughout the knead and still pose", () => {
    // Actual native rig: shoulder (5,-10.5), hand (2.2,11.2), actor scale1.7.
    // Check the real two nested rotations, not merely matching dataset labels.
    const samples = Array.from({ length: 17 }, (_, index) => projectElsewhereLoafPose("admission", index / 10, false));
    samples.push(projectElsewhereLoafPose("admission", 0, true));
    for (const pose of samples) {
      const localX = 5 + Math.cos(pose.frontArm) * 2.2 - Math.sin(pose.frontArm) * 11.2;
      const localY = -10.5 + Math.sin(pose.frontArm) * 2.2 + Math.cos(pose.frontArm) * 11.2;
      const handX = elsewhereLoafTableau.actorX + 1.7 * (Math.cos(pose.body) * localX - Math.sin(pose.body) * localY);
      const handY = elsewhereLoafTableau.actorY + 1.7 * (Math.sin(pose.body) * localX + Math.cos(pose.body) * localY);
      const contact = ((handX - elsewhereLoafTableau.productX) / 13) ** 2
        + ((handY - elsewhereLoafTableau.productY) / 7) ** 2;
      expect(contact).toBeLessThanOrEqual(1);
    }
    const dough = drawElsewhereLoaf({ product: "dough" });
    const table = dough.children.find(child => child.label === "trial-worktable")!;
    const product = dough.children.at(-1)!;
    expect(product.position.y + product.getLocalBounds().maxY).toBe(table.getLocalBounds().minY);
    dough.destroy({ children: true });
  });
});
