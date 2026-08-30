import { describe, expect, it } from "vitest";
import { projectCombatCueVerticalLayout, projectCombatRosterLayout, type CombatRosterBounds } from "./combat-roster-layout";

function overlaps(left: CombatRosterBounds, right: CombatRosterBounds): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}

describe("combat roster layout", () => {
  it.each([2, 4, 6])("keeps %i unit plates and the turn ribbon inside 320x180", (unitCount) => {
    const layout = projectCombatRosterLayout(unitCount, 30);
    expect(layout.plates).toHaveLength(unitCount);
    for (const bounds of [...layout.plates, layout.upcoming]) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(180);
    }
    for (let index = 0; index < layout.plates.length; index += 1) {
      for (let other = index + 1; other < layout.plates.length; other += 1) {
        expect(overlaps(layout.plates[index]!, layout.plates[other]!)).toBe(false);
      }
      expect(overlaps(layout.plates[index]!, layout.upcoming)).toBe(false);
    }
  });

  it("bounds invalid counts and top offsets deterministically", () => {
    expect(projectCombatRosterLayout(99, Number.NaN).plates).toHaveLength(6);
    expect(projectCombatRosterLayout(-4, -20).plates).toHaveLength(0);
    expect(projectCombatRosterLayout(2.9, 8).plates).toHaveLength(2);
  });

  it.each([117, 139, 156])("reserves battlefield cue geometry below a six-unit roster at sprite y=%i", (spriteY) => {
    const roster = projectCombatRosterLayout(6, 39);
    const cues = projectCombatCueVerticalLayout(spriteY, roster.bottom);
    expect(cues.reticleTop).toBeGreaterThan(roster.bottom);
    expect(cues.statusCenterY - 2.6).toBeGreaterThan(roster.bottom);
    expect(cues.reticleBottom).toBeLessThanOrEqual(180);
    expect(cues.statusBottom).toBeLessThanOrEqual(180);
    expect(cues.reticleBottom).toBeGreaterThan(cues.reticleTop);
  });
});
