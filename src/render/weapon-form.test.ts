import { describe, expect, it } from "vitest";
import { applyWeaponUseMastery, createHero, createWeaponUseMastery } from "../depth/rpg";
import type { CombatState, DetailedHeroState, ItemState } from "../depth/types";
import type { CombatVisualCue } from "./combat-choreography";
import { projectGearAppearance } from "./hero-appearance";
import {
  projectCombatFamiliarWeaponForm,
  projectFamiliarWeaponForm,
  projectFamiliarWeaponFormPose,
  type FamiliarWeaponSilhouette,
} from "./weapon-form";

function weapon(id: string): ItemState {
  return {
    id,
    name: `Test ${id}`,
    kind: "equipment",
    slot: "weapon",
    rarity: "rare",
    quantity: 1,
    modifiers: { power: 2 },
    restorative: null,
    useMastery: createWeaponUseMastery(),
  };
}

function weaponWithSilhouette(silhouette: FamiliarWeaponSilhouette): ItemState {
  for (let index = 0; index < 100; index += 1) {
    const candidate = weapon(`weapon:${silhouette}:${index}`);
    if (projectGearAppearance(candidate)?.silhouette === silhouette) return candidate;
  }
  throw new Error(`No ${silhouette} fixture found`);
}

function atExperience(item: ItemState, experience: number): ItemState {
  let current = item;
  for (let index = 0; index < experience; index += 1) {
    current = applyWeaponUseMastery(current, {
      id: `combat:mastery:${item.id}:${index}`,
      outcome: "victory",
      weaponUse: {
        schemaVersion: 1,
        tracking: "tracked",
        rulesVersion: "weapon-effective-use-v1",
        heroId: "hero:forms",
        weaponId: item.id,
        basicStrikes: 1,
        damage: 3,
      },
    }, index + 1).item;
  }
  return current;
}

function heroWithWeapon(item: ItemState): DetailedHeroState {
  const base = createHero("weapon-forms", "hero:forms", "Mira Vale");
  const oldWeaponId = base.equipment.weapon;
  return {
    ...base,
    equipment: { ...base.equipment, weapon: item.id },
    inventory: [
      ...base.inventory.filter((candidate) => candidate.id !== oldWeaponId && candidate.id !== item.id),
      item,
    ],
  };
}

function combat(hero: DetailedHeroState, outcome: CombatState["outcome"] = "ongoing"): CombatState {
  const weaponId = hero.inventory.find((item) => item.id === hero.equipment.weapon)?.id;
  if (weaponId === undefined) throw new Error("Fixture hero has no equipped weapon");
  return {
    id: "combat:familiar-form",
    round: 1,
    turn: 1,
    activeIndex: 1,
    turnOrder: [hero.id, "enemy:test"],
    outcome,
    combatants: [
      { id: hero.id, name: hero.name, side: "heroes", health: 20, maxHealth: 20, mana: 4, maxMana: 4, power: 8, armor: 3, initiative: 10, statuses: [], speciesId: null, abilities: [] },
      { id: "enemy:test", name: "Test Brute", side: "enemies", health: 8, maxHealth: 14, mana: 0, maxMana: 0, power: 5, armor: 2, initiative: 7, statuses: [], speciesId: "test-brute", abilities: [] },
    ],
    log: [{ turn: 1, actorId: hero.id, action: "attack", targetId: "enemy:test", abilityId: null, itemId: null, message: `${hero.name} strikes.`, amount: 6 }],
    eventStream: {
      schemaVersion: 2,
      firstRecordedTurn: 1,
      events: [
        { id: "combat:familiar-form:1:0", turn: 1, ordinal: 0, kind: "intent", actorId: hero.id, targetId: "enemy:test", action: "attack", abilityId: null, itemId: null },
        { id: "combat:familiar-form:1:1", turn: 1, ordinal: 1, kind: "damage", actorId: hero.id, targetId: "enemy:test", abilityId: null, healthBefore: 14, amount: 6, healthAfter: 8, guarded: false, critical: false },
        ...(outcome === "ongoing" ? [] : [
          { id: "combat:familiar-form:1:2", turn: 1, ordinal: 2, kind: "outcome" as const, actorId: hero.id, targetId: null, outcome },
        ]),
      ],
    },
    threat: { schemaVersion: 1, rating: "legacy-unrated" },
    weaponUse: {
      schemaVersion: 1,
      tracking: "tracked",
      rulesVersion: "weapon-effective-use-v1",
      heroId: hero.id,
      weaponId,
      basicStrikes: 1,
      damage: 6,
    },
  };
}

const cue: CombatVisualCue = {
  id: "combat:familiar-form:turn:1",
  actorId: "hero:forms",
  targetId: "enemy:test",
  action: "attack",
  actorSide: "heroes",
  amount: 6,
  effect: null,
};

describe("Familiar Weapon Forms", () => {
  it("unlocks one deterministic visual-only form at Use Level 4 for every silhouette", () => {
    const expected = {
      sword: ["familiar-form-sword-v1", "Measured Cut"],
      spear: ["familiar-form-spear-v1", "Set Thrust"],
      wand: ["familiar-form-wand-v1", "Anchored Arc"],
    } as const;
    for (const silhouette of ["sword", "spear", "wand"] as const) {
      const levelThree = atExperience(weaponWithSilhouette(silhouette), 5);
      const levelFour = atExperience(weaponWithSilhouette(silhouette), 6);
      const levelTen = atExperience(weaponWithSilhouette(silhouette), 45);
      expect(projectFamiliarWeaponForm(levelThree)).toBeNull();
      expect(projectFamiliarWeaponForm(levelFour)).toMatchObject({
        formId: expected[silhouette][0],
        formName: expected[silhouette][1],
        silhouette,
        displayedMasteryLevel: 4,
        mechanicalBonus: 0,
      });
      expect(projectFamiliarWeaponForm(levelTen)).toMatchObject({
        formId: expected[silhouette][0],
        displayedMasteryLevel: 10,
        mechanicalBonus: 0,
      });
      expect(projectFamiliarWeaponForm(JSON.parse(JSON.stringify(levelFour)) as ItemState)).toEqual(
        projectFamiliarWeaponForm(levelFour),
      );
      expect(projectFamiliarWeaponForm(levelFour)?.unlockReceiptId).toBe(levelFour.useMastery?.receipts[5]?.id);
    }
  });

  it("admits only the exact tracked hero weapon on a positive basic attack without mutation", () => {
    const hero = heroWithWeapon(atExperience(weaponWithSilhouette("spear"), 6));
    const active = combat(hero);
    const before = JSON.stringify({ hero, active });
    expect(projectCombatFamiliarWeaponForm(hero, active, cue)).toMatchObject({
      formId: "familiar-form-spear-v1",
      displayedMasteryLevel: 4,
      sourceCombatId: active.id,
      terminal: false,
      mechanicalBonus: 0,
    });
    expect(JSON.stringify({ hero, active })).toBe(before);

    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, action: "ability" })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, action: "guard", targetId: hero.id })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, action: "item", targetId: hero.id })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, action: "status", actorId: "enemy:test", actorSide: "enemies" })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, amount: 0 })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, active, { ...cue, actorId: "enemy:test", actorSide: "enemies" })).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, { ...active, weaponUse: { schemaVersion: 1, tracking: "legacy-untracked" } }, cue)).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, { ...active, weaponUse: { schemaVersion: 1, tracking: "unarmed", heroId: hero.id } }, cue)).toBeNull();
    expect(projectCombatFamiliarWeaponForm({ ...hero, equipment: { ...hero.equipment, weapon: "other" } }, active, cue)).toBeNull();
    expect(projectCombatFamiliarWeaponForm(hero, {
      ...active,
      weaponUse: { ...active.weaponUse, weaponId: "missing" } as CombatState["weaponUse"],
    }, cue)).toBeNull();
  });

  it("keeps the Level-4 earning blow generic and preserves an earlier form on terminal loot", () => {
    const levelThree = atExperience(weaponWithSilhouette("sword"), 5);
    const levelThreeHero = heroWithWeapon(levelThree);
    const crossingCombat = combat(levelThreeHero, "victory");
    const crossed = applyWeaponUseMastery(levelThree, crossingCombat, 20).item;
    const crossedHero = heroWithWeapon(crossed);
    expect(crossed.useMastery).toMatchObject({ level: 4, experience: 6 });
    expect(projectCombatFamiliarWeaponForm(crossedHero, crossingCombat, cue)).toBeNull();

    const levelFour = atExperience(weaponWithSilhouette("wand"), 6);
    const levelFourHero = heroWithWeapon(levelFour);
    const finishingCombat = combat(levelFourHero, "victory");
    const settledWeapon = applyWeaponUseMastery(levelFour, finishingCombat, 21).item;
    const replacement = weapon("weapon:stronger-loot");
    const postLootHero = {
      ...heroWithWeapon(settledWeapon),
      inventory: [...heroWithWeapon(settledWeapon).inventory, replacement],
      equipment: { ...heroWithWeapon(settledWeapon).equipment, weapon: replacement.id },
    };
    expect(projectCombatFamiliarWeaponForm(postLootHero, finishingCombat, cue)).toMatchObject({
      weaponId: settledWeapon.id,
      formId: "familiar-form-wand-v1",
      displayedMasteryLevel: 4,
      terminal: true,
    });
  });

  it("projects distinct poses, a static accessible tableau, and an exact settled pose", () => {
    const impact = (["sword", "spear", "wand"] as const).map((silhouette) =>
      projectFamiliarWeaponFormPose(silhouette, 1.65 * 0.42, 1.65, false)
    );
    expect(new Set(impact.map((pose) => pose.frontArmRotationOffset)).size).toBe(3);
    expect(impact.every((pose) => pose.glyphAlpha > 0)).toBe(true);
    expect(projectFamiliarWeaponFormPose("sword", 1.65, 1.65, false)).toEqual({
      bodyRotationOffset: 0,
      frontArmRotationOffset: 0,
      rearArmRotationOffset: 0,
      frontLegRotationOffset: 0,
      rearLegRotationOffset: 0,
      glyphAlpha: 0,
      glyphScale: 1,
    });
    expect(projectFamiliarWeaponFormPose("wand", 0, 1.65, true)).toEqual(
      projectFamiliarWeaponFormPose("wand", 999, 1.65, true),
    );
  });
});
