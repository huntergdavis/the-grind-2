import { describe, expect, it } from "vitest";
import { releasedCombatAftermathFixture } from "../../tests/combat-aftermath-fixtures";
import { naturalRoadSupperJourneyFixture } from "../../tests/road-supper-fixtures";
import { projectCombatActionForecast } from "../core/combat-action-forecast";
import { actorPolicy, campaignDirector } from "../core/simulation";
import { chooseCombatAction, createCombat, isValidCombatState, resolveCombatTurn } from "./combat";
import { combatDamageRangeV1 } from "./combat-damage";
import { createHero } from "./rpg";
import { createCombatSupperPreparation, hasReadySupper, isValidCombatSupper, resolveSupperDamage } from "./supper-preparation";
import type { CombatState } from "./types";

function withoutSupper(combat: CombatState): CombatState {
  const { supper: _supper, ...ordinary } = combat;
  return ordinary;
}

describe("one first-hit Road Supper preparation", () => {
  it("rounds down with minimum one damage and never stacks with stronger Guard", () => {
    expect([1, 2, 3, 4, 65].map(damage => resolveSupperDamage(damage, false))).toEqual([1, 1, 2, 3, 48]);
    expect([1, 4, 32].map(damage => resolveSupperDamage(damage, true))).toEqual([1, 4, 32]);
  });

  it("matches the released-v176 incoming-hit forecast and reports zero saved HP for fatal overkill", () => {
    // Actual released T64 save, advanced by current rules; not the new sale-aware campaign.
    const journey = releasedCombatAftermathFixture();
    const before = journey.before.depth.combat!, terminal = journey.resolved.depth.roadSupper!.terminal!.combat;
    const choice = actorPolicy(journey.before, campaignDirector(journey.before));
    if (choice.command.type !== "combat-action") throw new Error("Expected the actual incoming combat action");
    const forecast = projectCombatActionForecast(before, choice.command.action);
    const spent = terminal.supper!.spent!;
    expect(spent).toMatchObject({ healthBefore: 42, damageBefore: 65, damageAfter: 48, prevented: 0, guarded: false });
    expect(spent.damageAfter).toBeGreaterThanOrEqual(forecast.minimumDamage);
    expect(spent.damageAfter).toBeLessThanOrEqual(forecast.maximumDamage);
    expect(isValidCombatState(terminal)).toBe(true);
    expect(hasReadySupper(terminal, terminal.supper!.heroId)).toBe(false);
    expect(terminal.eventStream.events.filter(event => event.kind === "damage" && event.supper !== undefined)).toHaveLength(1);
    expect(isValidCombatSupper({ ...terminal, supper: { ...terminal.supper!, spent: { ...spent, prevented: 17 } } })).toBe(false);
    expect(isValidCombatSupper({ ...terminal, supper: { ...terminal.supper!, spent: { ...spent, damageEventId: "foreign:0" } } })).toBe(false);
  });

  it("matches the current prepared encounter's actual first incoming hit without assuming its terminal turn", () => {
    const journey = naturalRoadSupperJourneyFixture(), states = [journey.started, ...journey.turns];
    const firstSpent = states.findIndex(world => (world.depth.combat ?? world.depth.roadSupper?.terminal?.combat)?.supper?.spent != null);
    expect(firstSpent).toBeGreaterThan(0);
    const beforeWorld = states[firstSpent - 1]!, afterWorld = states[firstSpent]!;
    const before = beforeWorld.depth.combat!, after = afterWorld.depth.combat ?? afterWorld.depth.roadSupper!.terminal!.combat;
    const choice = actorPolicy(beforeWorld, campaignDirector(beforeWorld));
    if (choice.command.type !== "combat-action") throw new Error("Expected the actual first incoming combat action");
    const heroId = before.supper!.heroId, forecast = projectCombatActionForecast(before, choice.command.action), spent = after.supper!.spent!;
    expect(before.supper!.spent).toBeNull();
    expect(choice.command.action.targetId).toBe(heroId);
    expect(spent.healthBefore).toBe(before.combatants.find(actor => actor.id === heroId)!.health);
    expect(spent.damageAfter).toBe(spent.guarded ? spent.damageBefore : Math.max(1, Math.floor(spent.damageBefore * 0.75)));
    expect(spent.prevented).toBe(Math.min(spent.healthBefore, spent.damageBefore) - Math.min(spent.healthBefore, spent.damageAfter));
    expect(spent.damageAfter).toBeGreaterThanOrEqual(forecast.minimumDamage);
    expect(spent.damageAfter).toBeLessThanOrEqual(forecast.maximumDamage);
    const hits = after.eventStream.events.filter(event => event.kind === "damage" && event.supper !== undefined);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: spent.damageEventId, targetId: heroId, turn: spent.turn,
      amount: Math.min(spent.healthBefore, spent.damageAfter), supper: spent });
    expect(isValidCombatState(after)).toBe(true);
    expect(hasReadySupper(after, heroId)).toBe(false);
    for (const world of states.slice(firstSpent)) {
      expect((world.depth.combat ?? world.depth.roadSupper!.terminal!.combat).supper!.spent).toEqual(spent);
    }
  });

  it("leaves preparation ready after the hero's outgoing action and preserves ordinary forecasts", () => {
    const journey = naturalRoadSupperJourneyFixture(), before = journey.turns[0]!.depth.combat!;
    expect(before.supper!.spent).toBeNull();
    expect(hasReadySupper(before, before.supper!.heroId)).toBe(true);
    const ordinary = withoutSupper(before), action = chooseCombatAction(ordinary);
    const actor = ordinary.combatants.find(unit => unit.id === action.actorId)!;
    const target = ordinary.combatants.find(unit => unit.id === action.targetId)!;
    const ability = action.type === "ability" ? actor.abilities.find(entry => entry.id === action.abilityId)! : null;
    const range = combatDamageRangeV1(actor, target, ability, 0, false);
    expect(projectCombatActionForecast(ordinary, action)).toMatchObject(range);
    expect(isValidCombatState(ordinary)).toBe(true);
  });

  it("consumes the meal on a legally guarded first hit with no additional reduction", () => {
    const journey = naturalRoadSupperJourneyFixture(), start = journey.started.depth.combat!, heroId = start.supper!.heroId;
    // Explicit combat-unit branch, not the natural campaign's chosen action or outcome.
    expect(start.turnOrder[start.activeIndex]).toBe(heroId);
    const guarded = resolveCombatTurn(start, { type: "guard", actorId: heroId, targetId: null, abilityId: null, itemId: null }, journey.started.seed);
    const action = chooseCombatAction(guarded);
    expect(action.targetId).toBe(heroId);
    const ordinary = resolveCombatTurn(withoutSupper(guarded), action, journey.started.seed);
    const prepared = resolveCombatTurn(guarded, action, journey.started.seed);
    expect(prepared.supper!.spent).toMatchObject({ guarded: true, prevented: 0 });
    expect(prepared.supper!.spent!.damageAfter).toBe(prepared.supper!.spent!.damageBefore);
    expect(prepared.combatants).toEqual(ordinary.combatants);
    expect(projectCombatActionForecast(guarded, action)).toMatchObject({ guarded: true,
      minimumDamage: projectCombatActionForecast(withoutSupper(guarded), action).minimumDamage,
      maximumDamage: projectCombatActionForecast(withoutSupper(guarded), action).maximumDamage });
    expect(isValidCombatState(prepared)).toBe(true);
    expect(hasReadySupper(prepared, heroId)).toBe(false);
  });

  it("saves real HP on a survivable unit hit and does not refresh the charge", () => {
    // Standalone generated combat unit, not an edited campaign or rated encounter.
    const seed = "supper-survivable-unit", sourceHero = createHero(seed, "hero:unit", "Unit Hero");
    const generated = createCombat(seed, sourceHero, "encounter:supper-unit", 1);
    let unit: CombatState = { ...generated, supper: createCombatSupperPreparation(sourceHero.id,
      `depth:10:road-supper:${generated.id}`, 10) };
    if (unit.turnOrder[unit.activeIndex] === sourceHero.id) {
      unit = resolveCombatTurn(unit, { type: "attack", actorId: sourceHero.id,
        targetId: unit.combatants.find(actor => actor.side === "enemies")!.id, abilityId: null, itemId: null }, seed);
    }
    const strike = { type: "attack" as const, actorId: unit.turnOrder[unit.activeIndex]!, targetId: sourceHero.id, abilityId: null, itemId: null };
    const prepared = resolveCombatTurn(unit, strike, seed);
    const ordinary = resolveCombatTurn(withoutSupper(unit), strike, seed);
    const hero = prepared.combatants.find(actor => actor.id === sourceHero.id)!;
    const unpreparedHero = ordinary.combatants.find(actor => actor.id === hero.id)!;
    expect(hero.health).toBeGreaterThan(unpreparedHero.health);
    expect(prepared.supper!.spent!.prevented).toBe(hero.health - unpreparedHero.health);
    expect(isValidCombatState(prepared)).toBe(true);
    expect(hasReadySupper(prepared, hero.id)).toBe(false);
    const next = resolveCombatTurn(prepared, chooseCombatAction(prepared), seed);
    expect(next.supper).toEqual(prepared.supper);
  });
});
