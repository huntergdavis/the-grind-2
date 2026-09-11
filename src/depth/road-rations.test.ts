import { describe, expect, it } from "vitest";
import { createRoadRations, isCanonicalRoadRations, roadRationId } from "./road-rations";
import { createEmberTonic, isValidItemState, restorativeHealthAmount } from "./rpg";

describe("owned Road Rations, not food inferred from a name", () => {
  it("creates only one or two explicit edible units and never a combat restorative", () => {
    for (const quantity of [1, 2]) {
      const item = createRoadRations("hero:supper", quantity);
      expect(item.id).toBe(roadRationId("hero:supper"));
      expect(isCanonicalRoadRations(item, "hero:supper")).toBe(true);
      expect(isValidItemState(item)).toBe(true);
      expect(restorativeHealthAmount(item, 100)).toBe(0);
      expect(isCanonicalRoadRations(item, "hero:someone-else")).toBe(false);
    }
    for (const quantity of [0, 3, 1.5]) expect(() => createRoadRations("hero:supper", quantity)).toThrow();
  });
  it("rejects forged food effects, dual-use tonics, and malformed explicit capabilities", () => {
    const item = createRoadRations("hero:supper"), { food: _food, ...legacyNamedItem } = item;
    expect(isCanonicalRoadRations(legacyNamedItem, "hero:supper")).toBe(false);
    expect(isValidItemState(legacyNamedItem)).toBe(true);
    expect(isCanonicalRoadRations({ ...createEmberTonic("hero:supper"), name: "Road Rations" }, "hero:supper")).toBe(false);
    for (const altered of [
      { ...item, food: undefined }, { ...item, food: null }, { ...item, food: { schemaVersion: 2, kind: "road-ration" } },
      { ...item, food: { ...item.food, healing: 50 } }, { ...item, quantity: 3 },
      { ...item, restorative: createEmberTonic("hero:supper").restorative }, { ...item, modifiers: { power: 1 } },
    ]) {
      expect(isCanonicalRoadRations(altered, "hero:supper")).toBe(false);
      expect(isValidItemState(altered)).toBe(false);
    }
  });
});
