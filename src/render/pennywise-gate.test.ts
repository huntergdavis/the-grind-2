import { Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";
import { drawPennywiseGate, projectPennywiseGateTableau } from "./pennywise-gate";

describe("the native Pennywise Gate close-up", () => {
  it("keeps the hero on the near side while lifting and beyond the same bar only after passage", () => {
    const approach = projectPennywiseGateTableau("approach"), lifting = projectPennywiseGateTableau("lifting");
    expect(approach.raised).toBe(false);
    expect(lifting).toMatchObject({ heroX: 158, heroY: 133, pivotX: 174, pivotY: 128, raised: true, lifting: true });
    expect(approach.heroX).toBeLessThan(approach.pivotX);
    expect(lifting.heroX).toBeLessThan(lifting.pivotX);
    for (const phase of ["paid", "passed"] as const) {
      const completed = projectPennywiseGateTableau(phase);
      expect(completed.heroX).toBeGreaterThan(completed.pivotX);
      expect(completed.pivotX).toBe(approach.pivotX);
      expect(completed.lifting).toBe(false);
    }
  });

  it("draws one bounded wooden barrier and honor box, without actors, a ferry, or moving timers", () => {
    for (const phase of ["approach", "lifting", "paid", "passed"] as const) {
      const drawing = drawPennywiseGate(phase), bounds = drawing.getLocalBounds();
      expect(bounds.x).toBeGreaterThanOrEqual(80);
      expect(bounds.y).toBeGreaterThanOrEqual(70);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(240);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(159);
      expect(drawing.children.length).toBe(phase === "paid" ? 4 : 3);
      expect(drawing.children[0]).toBeInstanceOf(Graphics);
      const repeat = drawPennywiseGate(phase);
      expect(repeat.getLocalBounds()).toMatchObject({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      drawing.destroy({ children: true }); repeat.destroy({ children: true });
    }
  });
});
