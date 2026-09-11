import { describe, expect, it } from "vitest";
import type { GearAppearance } from "./hero-appearance";
import { calculateSceneLayout } from "./layout";
import { drawSpareGearTrade, spareGearTradeTableau } from "./spare-gear-trade";

const spear: GearAppearance = { itemId: "loot:unused-spear", itemName: "Ashen Spear", slot: "weapon", rarity: "uncommon",
  color: 0x79b392, accent: 0x365f4c, silhouette: "spear", useMasteryLevel: 1, useMasteryStage: 0 };

describe("native spare-gear sale", () => {
  it("shows one sold weapon and one coin without fake mastery, people or supplies", () => {
    const drawing = drawSpareGearTrade(spear);
    expect(drawing.children.map((child) => child.label)).toEqual(["actual-market-stand", "sold-spare-weapon", "sale-one-gold"]);
    const weapon = drawing.children[1]!;
    expect(weapon.position.x).toBe(spareGearTradeTableau.itemX);
    expect(weapon.position.y).toBe(spareGearTradeTableau.itemY);
    expect(weapon.children.filter((child) => child.label === "recorded-weapon-mastery-mark")).toHaveLength(0);
    drawing.destroy({ children: true });
  });

  it("keeps the actual gear and coin inside the centered chrome-reserved viewport", () => {
    const layout = calculateSceneLayout(320, 210, 320, 180);
    for (const silhouette of ["sword", "spear", "wand"] as const) {
      const drawing = drawSpareGearTrade({ ...spear, silhouette });
      const bounds = drawing.getLocalBounds();
      expect(layout.x + bounds.minX * layout.scale).toBeGreaterThanOrEqual(0);
      expect(layout.x + bounds.maxX * layout.scale).toBeLessThanOrEqual(320);
      expect(layout.y + bounds.minY * layout.scale).toBeGreaterThanOrEqual(0);
      expect(layout.y + bounds.maxY * layout.scale).toBeLessThanOrEqual(210);
      expect(layout.y + spareGearTradeTableau.heroY * layout.scale).toBeLessThan(210);
      drawing.destroy({ children: true });
    }
  });
});
