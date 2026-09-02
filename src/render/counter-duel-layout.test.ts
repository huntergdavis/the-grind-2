import { describe, expect, it } from "vitest";
import { counterDuelWitnessLayout, designBoundsOverlap } from "./counter-duel-layout";

describe("Counter Duel witness layout", () => {
  it("keeps the witness placard inside the observer gutter and clear of hero evidence", () => {
    const layout = counterDuelWitnessLayout;

    expect(layout.panelBounds).toEqual({ left: 2, top: 97, right: 68, bottom: 115 });
    expect(layout.panelBounds.left).toBeGreaterThanOrEqual(0);
    expect(layout.panelBounds.top).toBeGreaterThanOrEqual(0);
    expect(layout.panelBounds.right).toBeLessThanOrEqual(320);
    expect(layout.panelBounds.bottom).toBeLessThanOrEqual(180);
    expect(designBoundsOverlap(layout.panelBounds, layout.heroEvidenceBounds)).toBe(false);
    expect(layout.heroEvidenceBounds.left - layout.panelBounds.right).toBeGreaterThanOrEqual(layout.evidenceGap);
  });
});
