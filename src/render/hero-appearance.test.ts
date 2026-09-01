import { describe, expect, it } from "vitest";
import { addItem, applyWeaponUseMastery, createHero, createWeaponUseMastery, equipItem } from "../depth/rpg";
import type { EquipmentSlot, ItemState } from "../depth/types";
import { projectGearAppearance, projectHeroAppearance, projectHeroIdentityAppearance } from "./hero-appearance";

function equipment(id: string, slot: EquipmentSlot, rarity: ItemState["rarity"] = "rare"): ItemState {
  return { id, name: `${slot} fixture`, kind: "equipment", slot, rarity, quantity: 1, modifiers: { power: 1 }, restorative: null, useMastery: slot === "weapon" ? createWeaponUseMastery() : null };
}

function weaponAtExperience(experience: number): ItemState {
  let item = equipment("weapon:mastery-stage", "weapon");
  for (let index = 0; index < experience; index += 1) {
    item = applyWeaponUseMastery(item, {
      id: `encounter:appearance:${index}`,
      outcome: "victory",
      weaponUse: { schemaVersion: 1, tracking: "tracked", rulesVersion: "weapon-effective-use-v1", heroId: "hero:appearance", weaponId: item.id, basicStrikes: 1, damage: 2 },
    }, index + 1).item;
  }
  return item;
}

describe("hero equipment appearance", () => {
  it("gives each hero one stable cross-scene identity palette", () => {
    const first = createHero("appearance", "hero:appearance", "Mira Vale");
    const second = createHero("appearance", "hero:someone-else", "Tomas Reed");
    expect(projectHeroIdentityAppearance(JSON.parse(JSON.stringify(first)))).toEqual(projectHeroIdentityAppearance(first));
    expect(projectHeroIdentityAppearance(second)).not.toEqual(projectHeroIdentityAppearance(first));
  });

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

  it("keeps canonical weapon nouns visually consistent with their silhouettes", () => {
    expect(projectGearAppearance({ ...equipment("named:blade", "weapon"), name: "Roadworn Blade" })?.silhouette).toBe("sword");
    expect(projectGearAppearance({ ...equipment("named:pike", "weapon"), name: "Dawn Pike" })?.silhouette).toBe("spear");
    expect(projectGearAppearance({ ...equipment("named:wand", "weapon"), name: "Foxfire Wand" })?.silhouette).toBe("wand");
  });

  it("adds only non-stat familiarity stages at Use Levels 4, 7, and 10", () => {
    expect([0, 6, 21, 45].map((experience) => projectGearAppearance(weaponAtExperience(experience))?.useMasteryStage)).toEqual([0, 1, 2, 3]);
    expect([0, 6, 21, 45].map((experience) => projectGearAppearance(weaponAtExperience(experience))?.useMasteryLevel)).toEqual([1, 4, 7, 10]);
  });
});
