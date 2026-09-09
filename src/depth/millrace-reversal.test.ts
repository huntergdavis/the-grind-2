import { describe, expect, it } from "vitest";
import { createCombat, isValidCombatState, legalCompanionActions, maximumCombatEvents, maximumCombatEventsPerTurn, resolveCombatTurn } from "./combat";
import { millerRoadcraftKit, upgradeCompanionActionRuntime } from "./companion-kit";
import { createHero } from "./rpg";
import { legalMillraceReversal, millraceReversalDamageProfile } from "./shared-opening";
import { combatDamageV1 } from "./combat-damage";
import type { AbilityState, CombatAction, CombatState, CombatantState, CompanionActionRuntimeV1 } from "./types";

const seed = "millrace-reversal-proof";

function fixture(enemyCount = 1): CombatState {
  const hero = createHero(seed, "hero:millrace", "Aster Vale");
  const miller: CombatantState = {
    id: "resident:millrace-miller", name: "Mara Mill", side: "heroes", speciesId: null,
    health: 60, maxHealth: 60, mana: 0, maxMana: 0, power: 8, armor: 3, initiative: 20,
    statuses: [], abilities: [], companionKit: millerRoadcraftKit,
  };
  const created = createCombat(seed, hero, "encounter:millrace", enemyCount, [miller]);
  const enemies = created.combatants.filter((unit) => unit.side === "enemies");
  return {
    ...created,
    activeIndex: 0,
    turnOrder: [miller.id, enemies[0]!.id, hero.id, ...enemies.slice(1).map((unit) => unit.id)],
    combatants: created.combatants.map((unit) => unit.id === hero.id ? { ...unit, power: 10, abilities: [] }
      : unit.side === "enemies" ? { ...unit, health: 120, maxHealth: 120, armor: 20, power: unit.id === enemies[0]!.id ? 6 : 4, abilities: [] } : unit),
  };
}

function drag(combat: CombatState): CombatState {
  const action = legalCompanionActions(combat).find((entry) => entry.type === "companion-action" && entry.companionActionId === "millstone-drag");
  if (action === undefined) throw new Error("The actual Miller must have a legal Drag");
  return resolveCombatTurn(combat, action, seed);
}

function attack(combat: CombatState, targetId = "hero:millrace"): CombatAction {
  return { actorId: combat.turnOrder[combat.activeIndex]!, type: "attack", targetId, abilityId: null, itemId: null };
}

function guard(combat: CombatState): CombatAction {
  return { actorId: combat.turnOrder[combat.activeIndex]!, type: "guard", targetId: null, abilityId: null, itemId: null };
}

function earn(combat = fixture()): CombatState {
  const sourced = drag(combat);
  expect(isValidCombatState(sourced)).toBe(true);
  const opened = resolveCombatTurn(sourced, attack(sourced), seed);
  expect(isValidCombatState(opened)).toBe(true);
  expect(opened.companionActionRuntime?.schemaVersion).toBe(2);
  return opened;
}

function legacyRuntime(combat: CombatState): CompanionActionRuntimeV1 {
  const runtime = combat.companionActionRuntime;
  if (runtime === undefined) throw new Error("Missing Miller runtime");
  return { schemaVersion: 1, actorId: runtime.actorId, kitId: runtime.kitId, rulesVersion: runtime.rulesVersion, readyRounds: { ...runtime.readyRounds } };
}

describe("Millrace Reversal exact source and one-strike runtime", () => {
  it("earns from the actual sourced enemy strike, then spends once for exactly one piercing weapon credit", () => {
    const initial = fixture();
    const opened = earn(initial);
    const before = JSON.stringify(opened);
    const action = legalMillraceReversal(opened);
    if (action === null) throw new Error("A witnessed opening must expose the explicit joint action");
    const hero = opened.combatants.find((unit) => unit.id === action.actorId)!;
    const target = opened.combatants.find((unit) => unit.id === action.targetId)!;
    const actual = combatDamageV1(seed, opened.id, opened.turn + 1, hero, target, millraceReversalDamageProfile, 0, false);
    const spent = resolveCombatTurn(opened, action, seed);
    const packet = spent.eventStream.events.filter((event) => event.turn === spent.turn);
    expect(packet.filter((event) => event.kind === "damage")).toHaveLength(1);
    expect(packet).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: "shared-opening-spent", jointActionId: "millrace-reversal", openingBefore: 1, openingAfter: 0,
      heroId: hero.id, companionId: action.companionId, targetId: target.id, armorReduction: 4, damage: actual.appliedDamage,
    })]));
    expect(spent.weaponUse).toMatchObject({ tracking: "tracked", basicStrikes: 1, damage: actual.appliedDamage });
    expect(spent.combatants.find((unit) => unit.id === target.id)?.health).toBe(target.health - actual.appliedDamage);
    expect(spent.combatants.map((unit) => ({ mana: unit.mana, abilities: unit.abilities }))).toEqual(opened.combatants.map((unit) => ({ mana: unit.mana, abilities: unit.abilities })));
    expect(spent.log.at(-1)).toMatchObject({ action: "joint-action", abilityId: null, itemId: null });
    expect(spent.log.at(-1)?.message).toContain("Aster Vale and Mara Mill perform Millrace Reversal");
    expect(spent.companionActionRuntime).toMatchObject({ schemaVersion: 2, sharedOpening: null });
    expect(legalMillraceReversal(spent)).toBeNull();
    expect(isValidCombatState(spent)).toBe(true);
    expect(resolveCombatTurn(JSON.parse(before), action, seed)).toEqual(spent);
    expect(JSON.stringify(opened)).toBe(before);
  });

  it("expires the pip on any other hero action without a strike or progression", () => {
    const opened = earn();
    const expired = resolveCombatTurn(opened, guard(opened), seed);
    expect(expired.eventStream.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shared-opening-expired", reason: "hero-action", openingBefore: 1, openingAfter: 0 })]));
    expect(expired.weaponUse).toEqual(opened.weaponUse);
    expect(expired.companionActionRuntime).toMatchObject({ sharedOpening: null });
    expect(isValidCombatState(expired)).toBe(true);
  });

  it("earns nothing from guarding or an unsourced lookalike Weaken", () => {
    const sourced = drag(fixture());
    const defended = resolveCombatTurn(sourced, guard(sourced), seed);
    expect(defended.companionActionRuntime).toMatchObject({ sharedOpening: null });
    const lookalike = { ...fixture(), activeIndex: 1, combatants: fixture().combatants.map((unit) => unit.side === "enemies"
      ? { ...unit, statuses: [{ kind: "weakened" as const, duration: 2, potency: 2 }] } : unit) };
    const attacked = resolveCombatTurn(lookalike, attack(lookalike), seed);
    expect(attacked.companionActionRuntime).toMatchObject({ sharedOpening: null });
    expect(attacked.eventStream.events.some((event) => event.kind === "shared-opening-earned")).toBe(false);
  });

  it("invalidates Drag ownership when a later identical Weaken replaces it", () => {
    const base = fixture();
    const enemyId = base.turnOrder[1]!;
    const weak: AbilityState = { id: "spell:replacement-weaken", name: "Other Weaken", kind: "spell", effect: "weaken", level: 1, experience: 0, uses: 0, manaCost: 0, potency: 0, sourceMonsterId: null };
    const reordered = { ...base, turnOrder: [base.turnOrder[0]!, "hero:millrace", enemyId], combatants: base.combatants.map((unit) => unit.id === "hero:millrace" ? { ...unit, abilities: [weak] } : unit) };
    const sourced = drag(reordered);
    const replaced = resolveCombatTurn(sourced, { actorId: "hero:millrace", type: "ability", targetId: enemyId, abilityId: weak.id, itemId: null }, seed);
    expect(replaced.companionActionRuntime).toMatchObject({ dragSource: null, sharedOpening: null });
    const attacked = resolveCombatTurn(replaced, attack(replaced), seed);
    expect(attacked.companionActionRuntime).toMatchObject({ sharedOpening: null });
    expect(isValidCombatState(attacked)).toBe(true);
  });

  it("ties the one held opening to its exact foe in a multi-enemy battle", () => {
    const opened = earn(fixture(2));
    const action = legalMillraceReversal(opened);
    if (action === null) throw new Error("Missing witnessed joint action");
    const otherId = opened.combatants.find((unit) => unit.side === "enemies" && unit.id !== action.targetId)!.id;
    expect(() => resolveCombatTurn(opened, { ...action, targetId: otherId }, seed)).toThrow("noncanonical source");
    expect(() => resolveCombatTurn(opened, { ...action, companionId: "hero:millrace" }, seed)).toThrow("noncanonical source");
    const forged = structuredClone(opened);
    if (forged.companionActionRuntime?.schemaVersion !== 2 || forged.companionActionRuntime.sharedOpening === null) throw new Error("Missing V2 opening");
    forged.companionActionRuntime.sharedOpening.affectedDamageEventId = `${opened.id}:2:11`;
    expect(legalMillraceReversal(forged)).toBeNull();
    expect(isValidCombatState(forged)).toBe(false);
  });

  it.each(["poisoned", "burning"] as const)("expires rather than spending when the hero dies on the final %s tick", (kind) => {
    const opened = earn();
    const doomed = { ...opened, combatants: opened.combatants.map((unit) => unit.id === "hero:millrace"
      ? { ...unit, statuses: [{ kind, duration: 1, potency: unit.health }] } : unit) };
    const action = legalMillraceReversal(doomed);
    if (action === null) throw new Error("Pre-status intent must still have its source");
    const result = resolveCombatTurn(doomed, action, seed);
    const packet = result.eventStream.events.filter((event) => event.turn === result.turn);
    expect(packet.some((event) => event.kind === "damage" || event.kind === "shared-opening-spent")).toBe(false);
    expect(packet).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shared-opening-expired", reason: "participant-unavailable" })]));
    expect(result.weaponUse).toEqual(opened.weaponUse);
    expect(result.companionActionRuntime).toMatchObject({ sharedOpening: null });
    expect(isValidCombatState(result)).toBe(true);
  });

  it.each(["unarmed", "legacy-untracked"] as const)("does not invent an equipped weapon or opening for %s combat", (tracking) => {
    const base = fixture();
    const untracked: CombatState = { ...base, weaponUse: tracking === "unarmed" ? { schemaVersion: 1, tracking, heroId: "hero:millrace" } : { schemaVersion: 1, tracking } };
    const sourced = drag(untracked);
    const after = resolveCombatTurn(sourced, attack(sourced), seed);
    expect(after.companionActionRuntime).toMatchObject({ sharedOpening: null });
    expect(after.weaponUse).toEqual(untracked.weaponUse);
    expect(legalMillraceReversal(after)).toBeNull();
    expect(isValidCombatState(after)).toBe(true);
  });

  it("reads genuine V1 cooldowns without inventing an opening, and rejects V2 receipts relabeled as V1", () => {
    const base = fixture();
    const old = { ...base, companionActionRuntime: legacyRuntime(base) };
    expect(isValidCombatState(old)).toBe(true);
    expect(upgradeCompanionActionRuntime(old.companionActionRuntime)).toMatchObject({ schemaVersion: 2, readyRounds: old.companionActionRuntime.readyRounds, dragSource: null, sharedOpening: null });
    const resumed = drag(old);
    expect(resumed.companionActionRuntime?.schemaVersion).toBe(2);
    expect(isValidCombatState(resumed)).toBe(true);
    const opened = earn();
    expect(isValidCombatState({ ...opened, companionActionRuntime: legacyRuntime(opened) })).toBe(false);
    const action = legalMillraceReversal(opened)!;
    const spent = resolveCombatTurn(opened, action, seed);
    expect(isValidCombatState({ ...spent, companionActionRuntime: legacyRuntime(spent) })).toBe(false);
  });

  it("clears battle-local state after a terminal joint strike while retaining its exact spent receipt", () => {
    const opened = earn();
    const action = legalMillraceReversal(opened)!;
    const finishable = { ...opened, combatants: opened.combatants.map((unit) => unit.id === action.targetId ? { ...unit, health: 1 } : unit) };
    const result = resolveCombatTurn(finishable, action, seed);
    expect(result.outcome).toBe("victory");
    expect(result.companionActionRuntime).toMatchObject({ sharedOpening: null, dragSource: null });
    expect(result.eventStream.events.some((event) => event.kind === "shared-opening-spent")).toBe(true);
    expect(result.weaponUse).toMatchObject({ basicStrikes: 1, damage: 1 });
    expect(isValidCombatState(result)).toBe(true);
  });

  it("advances the retained history floor so long battles keep lawful weapon totals after old packets drop", () => {
    let combat: CombatState = { ...fixture(), combatants: fixture().combatants.map((unit) => ({ ...unit, health: 999, maxHealth: 999, power: 1, armor: 999 })) };
    for (let turn = 0; turn < 60; turn += 1) {
      const actor = combat.combatants.find((unit) => unit.id === combat.turnOrder[combat.activeIndex])!;
      const target = combat.combatants.find((unit) => unit.side !== actor.side)!;
      combat = resolveCombatTurn(combat, attack(combat, target.id), seed);
      expect(isValidCombatState(combat)).toBe(true);
    }
    expect(combat.eventStream.events.length).toBeLessThanOrEqual(maximumCombatEvents);
    expect(combat.eventStream.firstRecordedTurn).toBe(combat.eventStream.events[0]?.turn);
    expect(combat.eventStream.firstRecordedTurn).toBeGreaterThan(1);
    for (const turn of new Set(combat.eventStream.events.map((event) => event.turn))) {
      expect(combat.eventStream.events.filter((event) => event.turn === turn).length).toBeLessThanOrEqual(maximumCombatEventsPerTurn);
    }
    // This reproduces the old pruner's stale full-history marker without editing production.
    expect(isValidCombatState({ ...combat, eventStream: { ...combat.eventStream, firstRecordedTurn: 1 } })).toBe(false);
  });
});
