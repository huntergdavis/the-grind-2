import { describe, expect, it } from "vitest";
import { naturalWeaponTechniqueFixture } from "../../tests/weapon-technique-fixtures";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { upgradeWorldState } from "../core/simulation";
import { createCombat } from "./combat";
import { createWeaponUseMastery, gainAbilityExperience, trainAbility } from "./rpg";
import { stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";
import { createTurningCheck, isValidCampaignWeaponTechniqueCertification, selectWeaponTechniqueCertification,
  stepWeaponTechniqueCertification, turningCheckAbilityId, weaponTechniqueCertificationCommandId } from "./weapon-technique";

describe("a real weapon-use receipt certifies Turning Check", () => {
  it("replaces one actual training action with a third permanent technique and only ordinary hero XP", () => {
    const { before, learned, next } = naturalWeaponTechniqueFixture(), source = canonicalStringify(before);
    const receipt = learned.depth.weaponTechniqueCertification!, plan = selectWeaponTechniqueCertification(before.depth)!;
    expect([before.tick, learned.tick, next.tick]).toEqual([58, 59, 60]);
    expect(canonicalHash(before)).toBe("e823e5bde8f2a9f6");
    expect(receipt).toEqual(plan);
    expect(receipt.weapon).toEqual(before.depth.hero.inventory.find(item => item.id === before.depth.hero.equipment.weapon));
    expect(receipt.weapon).not.toBe(before.depth.hero.inventory.find(item => item.id === receipt.weapon.id));
    expect(receipt.sourceUseReceipt).toMatchObject({ resolvedTick: 35, outcome: "victory", basicStrikes: 1, damage: 14,
      experienceBefore: 0, experienceAfter: 1, levelBefore: 1, levelAfter: 2 });
    expect(receipt.ability).toEqual({ id: "technique:turning-check", name: "Turning Check", kind: "technique", effect: "weaken",
      manaCost: 2, potency: 2, damageRule: "weapon-check-half-v1", level: 1, experience: 0, uses: 0, sourceMonsterId: null });
    expect(learned.depth.hero).toEqual({ ...before.depth.hero, experience: before.depth.hero.experience + 1,
      abilities: [...before.depth.hero.abilities, createTurningCheck()] });
    expect(learned.chronicle.at(-1)).toMatchObject({ tick: 59, commandType: "certify-weapon-technique",
      commandId: `${learned.campaignId}:${receipt.sourceCommandId}` });
    const { tick: _beforeTick, log: _beforeLog, hero: _beforeHero, ...beforeFacts } = before.depth;
    const { tick: _afterTick, log: _afterLog, hero: _afterHero, weaponTechniqueCertification: _certification, ...afterFacts } = learned.depth;
    expect(afterFacts).toEqual(beforeFacts);
    expect(next.depth.weaponTechniqueCertification).toEqual(receipt);
    expect(next.chronicle.at(-1)?.commandType).not.toBe("certify-weapon-technique");
    expect(canonicalStringify(before)).toBe(source);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(learned)))).toEqual(learned);
  });

  it("requires the exact earned item and receipt, and cannot certify or grant the skill twice", () => {
    const { before, learned } = naturalWeaponTechniqueFixture(), receipt = learned.depth.weaponTechniqueCertification!;
    const command = { type: "certify-weapon-technique" as const, weaponId: receipt.weapon.id, receiptId: receipt.sourceUseReceipt.id };
    expect(receipt.sourceCommandId).toBe(weaponTechniqueCertificationCommandId(59, command));
    const pure = stepWeaponTechniqueCertification(before.depth, command);
    expect(pure.hero.experience).toBe(before.depth.hero.experience); // Core grants the ordinary training XP once.
    expect(pure.hero.abilities).toEqual([...before.depth.hero.abilities, createTurningCheck()]);
    expect(selectWeaponTechniqueCertification(learned.depth)).toBeNull();
    for (const invalid of [{ ...command, weaponId: "unowned-blade" }, { ...command, receiptId: "unearned-use" }]) {
      expect(() => stepWeaponTechniqueCertification(before.depth, invalid)).toThrow();
    }
    expect(() => stepDepth(learned.depth, command)).toThrow();
  });

  it("leaves old absence inert and rejects knowledge with no certification source", () => {
    const { before } = naturalWeaponTechniqueFixture(), original = canonicalStringify(before);
    expect(Object.hasOwn(before.depth, "weaponTechniqueCertification")).toBe(false);
    expect(isValidCampaignWeaponTechniqueCertification(before.depth)).toBe(true);
    expect(upgradeWorldState(JSON.parse(original))).toEqual(before);
    expect(canonicalStringify(before)).toBe(original);
    const unsourced = { ...before.depth, hero: { ...before.depth.hero, abilities: [...before.depth.hero.abilities, createTurningCheck()] } };
    expect(isValidCampaignWeaponTechniqueCertification(unsourced)).toBe(false);
    expect(() => upgradeDepthState(unsourced, unsourced.seed, unsourced.hero.id, unsourced.hero.name)).toThrow();
  });

  it("rejects malformed receipts, forged item uses and altered certified mechanics", () => {
    const { learned } = naturalWeaponTechniqueFixture(), receipt = learned.depth.weaponTechniqueCertification!;
    const values = [undefined, null, {}, { ...receipt, extra: true }, { ...receipt, schemaVersion: 2 },
      { ...receipt, rulesVersion: "weapon-technique-certification-v2" }, { ...receipt, heroId: "someone-else" },
      { ...receipt, locationId: "somewhere-else" }, { ...receipt, tick: receipt.tick + 1 },
      { ...receipt, sourceCommandId: `${receipt.sourceCommandId}:invented` },
      { ...receipt, sourceUseReceipt: { ...receipt.sourceUseReceipt, damage: 15 } },
      { ...receipt, weapon: { ...receipt.weapon, modifiers: { power: 99 } } },
      { ...receipt, ability: { ...receipt.ability, potency: 99 } },
      { ...receipt, ability: { ...receipt.ability, experience: 3 } }];
    for (const value of values) {
      const state = { ...learned.depth, weaponTechniqueCertification: value } as unknown as DepthState;
      expect(isValidCampaignWeaponTechniqueCertification(state)).toBe(false);
      expect(() => upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toThrow();
    }
    // Changing both archive copies cannot override the actual retained item receipt.
    const forged = structuredClone(learned.depth);
    forged.weaponTechniqueCertification!.sourceUseReceipt.damage += 1;
    forged.weaponTechniqueCertification!.weapon.useMastery!.receipts[0]!.damage += 1;
    expect(isValidCampaignWeaponTechniqueCertification(forged)).toBe(false);
  });

  it("keeps recovery, periodic timing, a real visited town and repertoire capacity ahead of certification", () => {
    const { before } = naturalWeaponTechniqueFixture(), state = before.depth;
    const blade = state.hero.inventory.find(item => item.id === state.hero.equipment.weapon)!;
    const replaceBlade = (item: typeof blade): DepthState => ({ ...state, hero: { ...state.hero,
      inventory: state.hero.inventory.map(entry => entry.id === blade.id ? item : entry) } });
    // Predicate-only refusal boundaries. None is a claimed natural acquisition.
    const blocked: DepthState[] = [
      { ...state, tick: state.tick + 1 },
      { ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health: 0 } } },
      { ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health: Math.floor(state.hero.resources.maxHealth / 2) } } },
      { ...state, hero: { ...state.hero, resources: { ...state.hero.resources, mana: 0 } } },
      { ...state, towns: { ...state.towns, [state.atlas.currentLocationId]: { ...state.towns[state.atlas.currentLocationId]!, visits: 0 } } },
      { ...state, hero: { ...state.hero, equipment: { ...state.hero.equipment, weapon: null } } },
      { ...state, hero: { ...state.hero, abilities: [...state.hero.abilities, { ...createTurningCheck(), id: "unit:existing-control" }] } },
      { ...state, hero: { ...state.hero, abilities: Array.from({ length: 16 }, (_, index) => ({ ...state.hero.abilities[0]!, id: `unit:full-repertoire:${index}` })) } },
      replaceBlade({ ...blade, useMastery: createWeaponUseMastery() }),
      replaceBlade({ ...blade, name: "A claimed Roadworn Blade" }),
    ];
    for (const value of blocked) expect(selectWeaponTechniqueCertification(value)).toBeNull();
    expect(selectWeaponTechniqueCertification(state)).not.toBeNull();
  });

  it("preserves ordinary later training and use mastery without changing the original certificate", () => {
    const { learned } = naturalWeaponTechniqueFixture(), original = canonicalStringify(learned.depth.weaponTechniqueCertification);
    // Existing pure progression operations at explicit post-learning boundaries;
    // the acceptance journey separately proves actual tactical use.
    const trained: DepthState = { ...learned.depth, tick: learned.tick + 1,
      hero: trainAbility(learned.depth.hero, turningCheckAbilityId) };
    expect(isValidCampaignWeaponTechniqueCertification(trained)).toBe(true);
    const used: DepthState = { ...trained, tick: trained.tick + 1, hero: { ...trained.hero,
      abilities: trained.hero.abilities.map(ability => ability.id === turningCheckAbilityId ? gainAbilityExperience(ability, 2) : ability) } };
    expect(used.hero.abilities.find(ability => ability.id === turningCheckAbilityId)).toMatchObject({ experience: 5, uses: 1, level: 1 });
    expect(isValidCampaignWeaponTechniqueCertification(used)).toBe(true);
    expect(canonicalStringify(used.weaponTechniqueCertification)).toBe(original);
    const ability = used.hero.abilities.find(entry => entry.id === turningCheckAbilityId)!;
    for (const change of [{ experience: 1, uses: 0 }, { experience: 2, uses: 0 }, { experience: 2, uses: 2 },
      { level: 2 }, { manaCost: 0 }, { potency: 3 }, { sourceMonsterId: "unearned-monster-secret" }]) {
      expect(isValidCampaignWeaponTechniqueCertification({ ...used, hero: { ...used.hero,
        abilities: used.hero.abilities.map(entry => entry.id === turningCheckAbilityId ? { ...ability, ...change } : entry) } })).toBe(false);
    }
  });

  it("retains permanent knowledge after historical equipment removal without requiring an old Chronicle or combat ring", () => {
    const { learned } = naturalWeaponTechniqueFixture(), state = learned.depth, weaponId = state.weaponTechniqueCertification!.weapon.id;
    // Historical retention boundary only: no claim that a sale/removal command
    // already exists for this mastered blade. The certificate must outlive it.
    const later: DepthState = { ...state, tick: state.tick + 1, completedCombats: [],
      hero: { ...state.hero, equipment: { ...state.hero.equipment, weapon: null },
        inventory: state.hero.inventory.filter(item => item.id !== weaponId) } };
    expect(isValidCampaignWeaponTechniqueCertification(later)).toBe(true);
    expect(later.hero.abilities).toEqual(state.hero.abilities);
    expect(later.weaponTechniqueCertification).toEqual(state.weaponTechniqueCertification);
    expect(selectWeaponTechniqueCertification(later)).toBeNull();
    expect(isValidCampaignWeaponTechniqueCertification({ ...later, hero: { ...later.hero,
      abilities: later.hero.abilities.filter(ability => ability.id !== turningCheckAbilityId) } })).toBe(false);
  });

  it("rechecks retained item evidence after an in-place edit rather than accepting a stale source cache", () => {
    const { learned } = naturalWeaponTechniqueFixture(), state = structuredClone(learned.depth);
    expect(isValidCampaignWeaponTechniqueCertification(state)).toBe(true);
    const weapon = state.hero.inventory.find(item => item.id === state.weaponTechniqueCertification!.weapon.id)!;
    weapon.useMastery!.receipts[0]!.damage += 1;
    expect(isValidCampaignWeaponTechniqueCertification(state)).toBe(false);
  });

  it("requires the full current certified ability in active combat and rejects a retained copy ahead of current mastery", () => {
    const { learned } = naturalWeaponTechniqueFixture();
    const hero = trainAbility(learned.depth.hero, turningCheckAbilityId);
    const combat = createCombat(learned.seed, hero, "unit:certified-ability-ownership", 1);
    // Component-level ownership boundaries using the existing combat constructor,
    // not a claimed route encounter, campaign admission or natural payoff.
    const current: DepthState = { ...learned.depth, tick: learned.tick + 2, hero, combat };
    expect(isValidCampaignWeaponTechniqueCertification(current)).toBe(true);
    const without = { ...combat, combatants: combat.combatants.map(actor => actor.id === hero.id
      ? { ...actor, abilities: actor.abilities.filter(ability => ability.id !== turningCheckAbilityId) } : actor) };
    expect(isValidCampaignWeaponTechniqueCertification({ ...current, combat: without })).toBe(false);
    const initialCopy = { ...combat, combatants: combat.combatants.map(actor => actor.id === hero.id
      ? { ...actor, abilities: actor.abilities.map(ability => ability.id === turningCheckAbilityId ? createTurningCheck() : ability) } : actor) };
    expect(isValidCampaignWeaponTechniqueCertification({ ...current, combat: initialCopy })).toBe(false);
    // An older copy can have less mastery; an archived copy cannot claim uses
    // or experience the permanent current ability has somehow lost.
    expect(isValidCampaignWeaponTechniqueCertification({ ...current, combat: null,
      completedCombats: [...current.completedCombats, initialCopy] })).toBe(true);
    const advancedCopy = { ...combat, combatants: combat.combatants.map(actor => actor.id === hero.id
      ? { ...actor, abilities: actor.abilities.map(ability => ability.id === turningCheckAbilityId ? gainAbilityExperience(ability, 2) : ability) } : actor) };
    expect(isValidCampaignWeaponTechniqueCertification({ ...current, combat: advancedCopy })).toBe(false);
    expect(isValidCampaignWeaponTechniqueCertification({ ...current, combat: null,
      completedCombats: [...current.completedCombats, advancedCopy] })).toBe(false);
  });
});
