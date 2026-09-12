import { beforeAll, describe, expect, it } from "vitest";
import { naturalWeaponTechniqueFixture, turningCheckId } from "../../tests/weapon-technique-fixtures";
import { canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { equipItem } from "../depth/rpg";
import { projectSpellbookView } from "./view-projection";
import { projectWeaponTechniqueProvenance, projectWeaponTechniqueScene, weaponTechniqueEffectLabel } from "./weapon-technique-view";

describe("weapon-taught technique presentation", () => {
  let before: WorldState, learned: WorldState, next: WorldState;
  beforeAll(() => { ({ before, learned, next } = naturalWeaponTechniqueFixture()); });

  it("highlights the actual certified technique and previously used equipped blade", () => {
    const receipt = learned.depth.weaponTechniqueCertification!, scene = projectWeaponTechniqueScene(learned)!;
    expect(scene).toMatchObject({ phase: "certified", commandId: `${learned.campaignId}:${receipt.sourceCommandId}`,
      tick: 59, heroId: learned.hero.id, abilityId: turningCheckId, abilityName: "Turning Check",
      effect: "weaken", damageRule: "weapon-check-half-v1", initialManaCost: 2, initialPotency: 2,
      weaponId: learned.depth.hero.equipment.weapon, weaponName: "Roadworn Blade",
      locationName: "Elderwatch", learningTick: 59, learningCommandId: receipt.sourceCommandId,
      sourceUse: { ...receipt.sourceUseReceipt, resolvedTick: 35 },
      headline: "Turning Check · learned from the blade", detail: "2 MP to use · Half damage · Weaken" });
    expect(scene.sourceUse.weaponId).toBe(scene.weaponId);
    expect(scene.sourceUse.basicStrikes).toBeGreaterThan(0);
    expect(scene.sourceUse.damage).toBeGreaterThan(0);
    expect(scene.sourceUse.resolvedTick).toBeLessThan(scene.learningTick);
    expect(scene.damageExplanation).toBe("Glancing strike: half direct damage after armor and before Guard (minimum 1). Applies Weakened (2), softening the next retaliation.");
    expect(weaponTechniqueEffectLabel).toBe("Half damage · Weakened (2)");
    expect(scene).not.toHaveProperty("monsterId");
    expect(scene).not.toHaveProperty("residentId");
  });

  it("adds one owned technique to the existing Skills view, without altering the old abilities", () => {
    const skill = projectSpellbookView(learned).abilities.find(ability => ability.id === turningCheckId)!;
    expect(skill).toMatchObject({ kind: "technique", effect: "weaken", manaCost: 2, potency: 2,
      level: 1, experience: 0, battleUses: 0, provenance: null });
    expect(learned.depth.hero.abilities.filter(ability => ability.id !== turningCheckId)).toEqual(before.depth.hero.abilities);
    expect(learned.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(learned.depth.hero.inventory).toEqual(before.depth.hero.inventory);
    expect(projectWeaponTechniqueProvenance(learned, before.depth.hero.abilities[0]!.id)).toBeNull();
  });

  it("retains a frozen source-bound lesson through exact reload and Chronicle pruning", () => {
    const saved = canonicalStringify(learned), scene = projectWeaponTechniqueScene(learned)!;
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.sourceUse)).toBe(true);
    expect(scene.sourceUse).not.toBe(learned.depth.weaponTechniqueCertification!.sourceUseReceipt);
    expect(projectWeaponTechniqueScene(JSON.parse(saved))).toEqual(scene);
    const provenance = projectWeaponTechniqueProvenance(next, turningCheckId)!;
    expect(projectWeaponTechniqueProvenance({ ...next, chronicle: [] }, turningCheckId)).toEqual(provenance);
    expect(canonicalStringify(learned)).toBe(saved);
  });

  it("keeps the learned skill and original blade provenance after a real owned spare is equipped", () => {
    // Focused equipment-helper boundary, not a claim that the autonomous policy
    // chose this swap. Both weapons are actual owned items from the source run.
    const spare = next.depth.hero.inventory.find(item => item.slot === "weapon" && item.id !== next.depth.hero.equipment.weapon)!;
    expect(spare).toBeDefined();
    const changed = equipItem(next.depth.hero, spare.id);
    const switched: WorldState = { ...next, depth: { ...next.depth, hero: changed } };
    const provenance = projectWeaponTechniqueProvenance(switched, turningCheckId)!;
    expect(changed.equipment.weapon).toBe(spare.id);
    expect(changed.abilities).toEqual(next.depth.hero.abilities);
    expect(provenance).toEqual(projectWeaponTechniqueProvenance(next, turningCheckId));
    expect(provenance.weaponId).not.toBe(spare.id);
    expect(projectSpellbookView(switched).abilities.some(ability => ability.id === turningCheckId)).toBe(true);
    expect(projectWeaponTechniqueScene(switched)).toBeNull();
  });

  it("does not turn an old lesson, wrong command or foreign scene into fresh training", () => {
    expect(projectWeaponTechniqueScene(before)).toBeNull();
    expect(projectWeaponTechniqueProvenance(before, turningCheckId)).toBeNull();
    expect(projectWeaponTechniqueScene(next)).toBeNull();
    const source = learned.chronicle.at(-1)!;
    for (const change of [{ commandType: "train-ability" as const }, { tick: learned.tick - 1 },
      { commandId: `foreign:${learned.depth.weaponTechniqueCertification!.sourceCommandId}` }]) {
      expect(projectWeaponTechniqueScene({ ...learned, chronicle: [...learned.chronicle.slice(0, -1), { ...source, ...change }] })).toBeNull();
    }
    expect(projectWeaponTechniqueScene({ ...learned, scene: { ...learned.scene, action: "Unrelated lesson" } })).toBeNull();
    expect(projectWeaponTechniqueProvenance({ ...learned, campaignId: "unrelated-campaign" }, turningCheckId)).toBeNull();
  });

  it("rejects forged weapon use, learning source or ability instead of attributing an invented lesson", () => {
    const receipt = learned.depth.weaponTechniqueCertification!;
    for (const changed of [
      { ...receipt, sourceCommandId: `${receipt.sourceCommandId}:other` },
      { ...receipt, sourceUseReceipt: { ...receipt.sourceUseReceipt, damage: receipt.sourceUseReceipt.damage + 1 } },
      { ...receipt, ability: { ...receipt.ability, effect: "burning" as const } },
      { ...receipt, ability: { ...receipt.ability, damageRule: undefined } },
    ]) {
      // The own-undefined damage rule is deliberately outside the saved type.
      const forged = { ...learned, depth: { ...learned.depth, weaponTechniqueCertification: changed } } as unknown as WorldState;
      expect(projectWeaponTechniqueProvenance(forged, turningCheckId)).toBeNull();
      expect(projectWeaponTechniqueScene(forged)).toBeNull();
    }
  });
});
