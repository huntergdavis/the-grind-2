import { describe, expect, it } from "vitest";
import { naturalRoadSupperBeforeMealFixture, naturalRoadSupperBeforePurchaseFixture, naturalRoadSupperJourneyFixture,
  naturalRoadSupperMealFixture, naturalRoadSupperPurchasedFixture } from "../../tests/road-supper-fixtures";
import { createWorld } from "../core/simulation";
import { createRoadRations, roadRationId } from "./road-rations";
import { isValidCampaignRoadSupper, recordRoadRationPurchase, recordRoadSupperMeal, recordRoadSupperTerminal,
  roadSupperCommandId, selectRoadRationPurchase, selectRoadSupperCamp } from "./road-supper";
import { inventoryCapacity } from "./rpg";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";

function reload(state: DepthState): DepthState { return upgradeDepthState(structuredClone(state), state.seed, state.hero.id, state.hero.name); }

describe("one purchased Road Supper, one prepared tactical battle", () => {
  it("leaves old saves and the opening town without food, then buys a real later-market pair for exactly two gold", () => {
    const initial = createWorld("shared-road-playful:7", "campaign:browser-repartee-memory").depth;
    expect(Object.hasOwn(initial, "roadSupper")).toBe(false);
    expect(selectRoadRationPurchase(initial)).toBeNull();
    expect(isValidCampaignRoadSupper(initial)).toBe(true);
    const before = naturalRoadSupperBeforePurchaseFixture().depth, purchased = naturalRoadSupperPurchasedFixture().depth;
    const plan = selectRoadRationPurchase(before)!, receipt = purchased.roadSupper!.purchase;
    expect(plan).not.toBeNull();
    expect(receipt).toEqual({ ...plan, tick: before.tick + 1,
      sourceCommandId: roadSupperCommandId(before.tick + 1, { type: "buy-road-rations", marketId: plan.marketId }) });
    expect(Object.values(before.towns).filter(town => town.visits > 0).length).toBeGreaterThanOrEqual(2);
    expect(before.towns[plan.locationId]!.buildings.find(building => building.id === plan.marketId)?.kind).toBe("market");
    expect(purchased.hero).toEqual({ ...before.hero, gold: before.hero.gold - 2,
      inventory: [...before.hero.inventory, createRoadRations(before.hero.id)] });
    expect(reload(purchased)).toEqual(purchased);
    expect(selectRoadRationPurchase(purchased)).toBeNull();
    expect(() => stepDepth(purchased, { type: "buy-road-rations", marketId: receipt.marketId })).toThrow();
  });

  it("keeps capacity, money, real market membership, recovery and solo requirements", () => {
    const before = naturalRoadSupperBeforePurchaseFixture().depth, plan = selectRoadRationPurchase(before)!;
    expect(selectRoadRationPurchase({ ...before, hero: { ...before.hero, gold: 1 } })).toBeNull();
    expect(selectRoadRationPurchase({ ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 1 } } })).toBeNull();
    const full = [...before.hero.inventory];
    while (full.length < inventoryCapacity) full.push({ id: `unit:full:${full.length}`, name: "Unit capacity token", kind: "key", slot: null,
      rarity: "common", quantity: 1, modifiers: {}, restorative: null, useMastery: null });
    expect(selectRoadRationPurchase({ ...before, hero: { ...before.hero, inventory: full } })).toBeNull();
    const town = before.towns[plan.locationId]!;
    expect(selectRoadRationPurchase({ ...before, towns: { ...before.towns, [plan.locationId]: { ...town,
      buildings: town.buildings.filter(building => building.kind !== "market") } } })).toBeNull();
    expect(selectRoadRationPurchase({ ...before, towns: { [plan.locationId]: town } })).toBeNull();
    expect(() => recordRoadRationPurchase(before, `${roadSupperCommandId(before.tick + 1,
      { type: "buy-road-rations", marketId: plan.marketId })}:forged`)).toThrow();
  });

  it("consumes exactly the owned pair at the real route camp with no healing, XP, gold or story-history changes", () => {
    const before = naturalRoadSupperBeforeMealFixture().depth, prepared = naturalRoadSupperMealFixture().depth;
    const meal = prepared.roadSupper!.meal!, plan = selectRoadSupperCamp(before, meal.encounterId, meal.enemyCount)!;
    expect(plan).not.toBeNull();
    expect(meal).toEqual({ ...plan, tick: before.tick + 1,
      sourceCommandId: roadSupperCommandId(before.tick + 1, { type: "prepare-road-supper", encounterId: meal.encounterId }) });
    expect(meal.route).toEqual(before.atlas.route);
    expect(prepared.atlas).toEqual(before.atlas);
    expect(prepared.hero).toEqual({ ...before.hero, inventory: before.hero.inventory.filter(item => item.id !== roadRationId(before.hero.id)) });
    expect(prepared.companions).toEqual(before.companions);
    expect(prepared.quest).toEqual(before.quest);
    expect(prepared.repartee).toEqual(before.repartee);
    expect(prepared.roadSupper!.purchase).toEqual(before.roadSupper!.purchase);
    expect(reload(prepared)).toEqual(prepared);
    expect(depthCommandCandidates(prepared).map(candidate => candidate.command.type)).toEqual(["start-combat"]);
    expect(() => stepDepth(prepared, { type: "wait" })).toThrow();
  });

  it("rejects missing units, false food, a different route and repeated or forged meal sources", () => {
    const before = naturalRoadSupperBeforeMealFixture().depth, prepared = naturalRoadSupperMealFixture().depth, meal = prepared.roadSupper!.meal!;
    for (const quantity of [0, 1]) {
      const inventory = before.hero.inventory.filter(item => item.id !== meal.itemId);
      if (quantity > 0) inventory.push(createRoadRations(before.hero.id, quantity));
      expect(selectRoadSupperCamp({ ...before, hero: { ...before.hero, inventory } }, meal.encounterId, meal.enemyCount)).toBeNull();
    }
    expect(selectRoadSupperCamp(before, `${meal.encounterId}:different`, meal.enemyCount)).toBeNull();
    expect(selectRoadSupperCamp(before, meal.encounterId, meal.enemyCount + 1)).toBeNull();
    expect(selectRoadSupperCamp(prepared, meal.encounterId, meal.enemyCount)).toBeNull();
    expect(() => recordRoadSupperMeal(before, meal.encounterId, meal.enemyCount, `${meal.sourceCommandId}:forged`)).toThrow();
    for (const patch of [{ sourceCommandId: `${meal.sourceCommandId}:forged` }, { quantityUsed: 1 }, { tick: meal.tick - 1 },
      { route: { ...meal.route, legProgress: meal.route.legProgress + 1 } }]) {
      const forged = { ...prepared, roadSupper: { ...prepared.roadSupper!, meal: { ...meal, ...patch } } } as DepthState;
      expect(isValidCampaignRoadSupper(forged)).toBe(false);
      expect(() => reload(forged)).toThrow();
    }
  });

  it("attaches only to the next exact battle and retains one actual terminal archive through reload and pruning", () => {
    const journey = naturalRoadSupperJourneyFixture(), active = journey.started.depth, resolved = journey.resolved.depth;
    const record = resolved.roadSupper!, meal = record.meal!, assignment = record.assignment!, terminal = record.terminal!;
    expect(assignment.tick).toBe(meal.tick + 1);
    expect(assignment.combatId).toBe(meal.encounterId);
    expect(active.combat!.supper).toMatchObject({ heroId: active.hero.id, mealTick: meal.tick, mealSourceCommandId: meal.sourceCommandId, spent: null });
    expect(terminal.combat).toEqual(resolved.completedCombats.find(combat => combat.id === assignment.combatId));
    expect(terminal.combat.outcome).not.toBe("ongoing");
    expect(terminal.tick).toBe(assignment.tick + terminal.combat.turn);
    expect(reload(active)).toEqual(active);
    expect(reload(resolved)).toEqual(resolved);
    expect(journey.next.depth.roadSupper).toEqual(record);
    const later = { ...journey.next.depth, tick: journey.next.tick + 1, completedCombats: [] };
    expect(isValidCampaignRoadSupper(later)).toBe(true);
    expect(() => recordRoadSupperTerminal(resolved, terminal.combat, terminal.sourceCommandId)).toThrow();
    expect(selectRoadRationPurchase(later)).toBeNull();
    expect(selectRoadSupperCamp(later, meal.encounterId, meal.enemyCount)).toBeNull();
  });

  it("rejects invented active preparation, altered retained battle evidence and malformed optional fields", () => {
    const journey = naturalRoadSupperJourneyFixture(), state = journey.resolved.depth, record = state.roadSupper!;
    for (const value of [undefined, null, {}, { ...record, rulesVersion: "road-supper-v2" }]) {
      expect(isValidCampaignRoadSupper({ ...state, roadSupper: value } as unknown as DepthState)).toBe(false);
    }
    const before = journey.beforePurchase.depth;
    expect(isValidCampaignRoadSupper({ ...before, hero: { ...before.hero,
      inventory: [...before.hero.inventory, createRoadRations(before.hero.id)] } })).toBe(false);
    // Even a valid battle snapshot cannot invent a meal in an unpurchased history.
    expect(isValidCampaignRoadSupper({ ...before, tick: record.terminal!.tick + 1,
      completedCombats: [...before.completedCombats, record.terminal!.combat] })).toBe(false);
    const altered = structuredClone(record.terminal!.combat);
    altered.combatants.find(unit => unit.side === "enemies")!.name = "Invented supper opponent";
    expect(isValidCampaignRoadSupper({ ...state, roadSupper: { ...record, terminal: { ...record.terminal!, combat: altered } } })).toBe(false);
    expect(isValidCampaignRoadSupper({ ...journey.next.depth, tick: journey.next.tick + 1, combat: journey.started.depth.combat })).toBe(false);
  });
});
