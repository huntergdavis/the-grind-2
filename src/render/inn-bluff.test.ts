import { describe, expect, it } from "vitest";
import { drawInnBluff, innBluffTableau, projectInnBluffReveal } from "./inn-bluff";

describe("the opaque cup and actual native die reveal", () => {
  it("creates no die before resolution, then draws exactly the public number of pips within the existing stage", () => {
    const admission = drawInnBluff({ phase: "admission" });
    expect(admission.layer.getChildByLabel("inn-bluff-die")).toBeFalsy();
    expect(admission.cup.alpha).toBe(1);
    expect(admission.cup.position).toMatchObject({ x: innBluffTableau.cupX, y: innBluffTableau.cupY });
    admission.layer.destroy({ children: true });
    for (let face = 1; face <= 6; face++) {
      const drawing = drawInnBluff({ phase: "result", revealedFace: face });
      const die = drawing.layer.getChildByLabel("inn-bluff-die")!;
      expect(die.children.filter(child => child.label === "pip")).toHaveLength(face);
      const bounds = drawing.layer.getLocalBounds();
      expect(bounds.x).toBeGreaterThanOrEqual(60); expect(bounds.y).toBeGreaterThanOrEqual(50);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(270); expect(bounds.y + bounds.height).toBeLessThanOrEqual(165);
      expect(drawing.cup.x).toBe(209); expect(drawing.cup.y).toBeCloseTo(113);
      drawing.layer.destroy({ children: true });
    }
  });

  it("lifts once and settles without changing the die; reduced motion goes directly to the same reveal", () => {
    expect(projectInnBluffReveal(0, false)).toMatchObject({ cupX: 176, cupY: 113, progress: 0 });
    expect(projectInnBluffReveal(0.275, false)).toMatchObject({ cupX: 192.5, cupY: 91, progress: 0.5 });
    const settled = projectInnBluffReveal(1, false);
    for (const elapsed of [0.55, 1, 5, 100]) expect(projectInnBluffReveal(elapsed, false)).toEqual(settled);
    for (const elapsed of [0, 0.1, 0.3, 1, 100]) expect(projectInnBluffReveal(elapsed, true)).toEqual(settled);
  });
});
