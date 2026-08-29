import { describe, expect, it } from "vitest";
import { addItem, createHero, equipItem } from "../depth/rpg";
import type { EquipmentSlot, ItemState } from "../depth/types";
import { projectGearAppearance, projectHeroAppearance } from "./hero-appearance";

function equipment(id: string, slot: EquipmentSlot, rarity: ItemState["rarity"] = "rare"): ItemState {
  return { id, name: `${slot} fixture`, kind: "equipment", slot, rarity, quantity: 1, modifiers: { power: 1 } };
}

describe("hero equipment appearance", () => {
  it("projects every equipped canonical item and survives a save round trip", () => {
    let hero = createHero("appearance", "hero:appearance", "Mira Vale");
    for (const slot of ["offhand", "head", "body", "feet", "charm"] as const) {
      const item = equipment(`fixture:${slot}`, slot);
      hero = equipItem(addItem(hero, item), item.id);
    }
    const appearance = projectHeroAppearance(hero);
    expect(Object.values(appearance).every((entry) => entry !== null)).toBe(true);
    expect(projectHeroAppearance(JSON.parse(JSON.stringify(hero)))).toEqual(appearance);
    expect(appearance.body?.itemId).toBe(hero.equipment.body);
  });

  it("uses stable item identity for silhouettes and rarity for color", () => {
    const weaponLooks = Array.from({ length: 30 }, (_, index) => projectGearAppearance(equipment(`weapon:${index}`, "weapon"))?.silhouette);
    expect(new Set(weaponLooks).size).toBe(3);
    expect(projectGearAppearance(equipment("same", "body", "common"))?.color).not.toBe(
      projectGearAppearance(equipment("same", "body", "legendary"))?.color,
    );
    expect(projectGearAppearance(equipment("same", "body"))).toEqual(projectGearAppearance(equipment("same", "body")));
  });
});
