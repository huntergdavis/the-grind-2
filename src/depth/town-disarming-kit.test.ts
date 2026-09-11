import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld, upgradeWorldState } from "../core/simulation";
import { createDisarmingKit, disarmingKitId } from "./disarming-kit";
import { depthCommandCandidates, selectDungeonEntryPlan, stepDepth, upgradeDepthState } from "./state";
import { dungeonTrapAt } from "./dungeon";
import { inventoryCapacity } from "./rpg";
import { isValidDisarmingKitPurchaseReceipt, selectDisarmingKitPurchase } from "./town-disarming-kit";

const world = () => createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search");

describe("smith disarming-kit supplies", () => {
  it("autonomously buys one kit from the recorded smith for five gold without XP or recovery", () => {
    const before = world();
    const plan = selectDisarmingKitPurchase(before.depth)!;
    expect(plan).toMatchObject({ smithName: "The Heron Smithy", goldBefore: 12, goldAfter: 7,
      quantityBefore: 0, quantityBought: 1, quantityAfter: 1, goldSpent: 5 });
    expect(depthCommandCandidates(before.depth)[0]?.command).toEqual({ type: "buy-disarming-kit", smithId: plan.smithId });
    const after = advanceWorld(before);
    expect(after.chronicle.at(-1)?.commandType).toBe("buy-disarming-kit");
    expect(after.depth.hero.inventory).toEqual([...before.depth.hero.inventory, createDisarmingKit(before.hero.id)]);
    expect(after.depth.hero.gold).toBe(7);
    expect(after.hero.gold).toBe(7);
    expect(after.hero.experience).toBe(before.hero.experience);
    expect(after.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(after.depth.latestDisarmingKitPurchase).toEqual({ ...plan, schemaVersion: 1, tick: 1 });
    expect(after.scene).toMatchObject({ mode: "town" });
    expect(after.scene.action).toContain(plan.smithName);
    expect(after.scene.consequence).toContain("gold 12→7");
    expect(selectDisarmingKitPurchase(after.depth)).toBeNull();
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(advanceWorld(world())).toEqual(after);
  });

  it("rejects a foreign smith atomically", () => {
    const before = world().depth;
    const saved = JSON.stringify(before);
    expect(() => stepDepth(before, { type: "buy-disarming-kit", smithId: "foreign-smith" })).toThrow("unavailable");
    expect(JSON.stringify(before)).toBe(saved);
  });

  it("refuses unaffordable, duplicate, full, unrecorded and unsafe purchases", () => {
    const before = world().depth;
    const town = before.towns[before.atlas.currentLocationId]!;
    const variants = [
      { ...before, hero: { ...before.hero, gold: 4 } },
      { ...before, hero: { ...before.hero, inventory: [...before.hero.inventory, createDisarmingKit(before.hero.id)] } },
      { ...before, hero: { ...before.hero, inventory: Array(inventoryCapacity).fill(before.hero.inventory[0]) } },
      { ...before, towns: {} },
      { ...before, towns: { [town.locationId]: { ...town, visits: 0 } } },
      { ...before, towns: { [town.locationId]: { ...town, buildings: town.buildings.filter((building) => building.kind !== "smithy") } } },
      { ...before, towns: { [town.locationId]: { ...town, districts: [] } } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 0 } } },
      { ...before, atlas: { ...before.atlas, discoveredLocationIds: [] } },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" as const } },
    ];
    for (const state of variants) expect(selectDisarmingKitPurchase(state)).toBeNull();
    const { dungeonTool: _tool, ...plainItem } = createDisarmingKit(before.hero.id);
    const counterfeit = { ...plainItem, name: "Counterfeit" };
    expect(selectDisarmingKitPurchase({ ...before, hero: { ...before.hero, inventory: [...before.hero.inventory, counterfeit] } })).toBeNull();
  });

  it("validates exact purchase arithmetic and recorded building provenance, not the hero's later gold", () => {
    const after = advanceWorld(world()).depth;
    const receipt = after.latestDisarmingKitPurchase!;
    expect(isValidDisarmingKitPurchaseReceipt(receipt, { ...after, hero: { ...after.hero, gold: 1 } })).toBe(true);
    for (const changed of [{ goldSpent: 4 }, { quantityAfter: 2 }, { smithId: "unknown" }, { tick: after.tick + 1 },
      { itemId: "unknown" }, { goldAfter: 12 }, { townName: "Unknown" }, { bonus: 3 }]) {
      expect(isValidDisarmingKitPurchaseReceipt({ ...receipt, ...changed }, after)).toBe(false);
    }
    expect(isValidDisarmingKitPurchaseReceipt(undefined, after)).toBe(false);
  });

  it("migrates v25 without supplies or purchase credit and rejects malformed present receipts", () => {
    const before = world();
    const { latestDisarmingKitPurchase: _receipt, ...oldDepth } = before.depth;
    const old = { ...before, depth: { ...oldDepth, schemaVersion: 25 } };
    const loaded = upgradeWorldState(old);
    expect(loaded.depth.schemaVersion).toBe(33);
    expect(loaded.depth.latestDisarmingKitPurchase).toBeNull();
    expect(loaded.depth.hero.inventory.some((item) => item.id === disarmingKitId(before.hero.id))).toBe(false);
    expect(loaded.depth.hero.inventory).toEqual(before.depth.hero.inventory);
    expect(() => upgradeWorldState({ ...old, depth: { ...old.depth, latestDisarmingKitPurchase: {} } })).toThrow();
  });

  it("consumes and repurchases a kit with exact proof, rejecting reuse and a newer purchase without its item", () => {
    const purchased = advanceWorld(world()).depth;
    const locationId = "location:3";
    // Deliberate location/HP staging, not fabricated inventory or trap mechanics.
    const located = { ...purchased, atlas: { ...purchased.atlas, currentLocationId: locationId,
      discoveredLocationIds: [...new Set([...purchased.atlas.discoveredLocationIds, locationId])] } };
    const plan = selectDungeonEntryPlan(located)!;
    const entered = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
    let state = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources,
      health: Math.floor(entered.hero.resources.maxHealth / 2) } } };
    for (const expected of ["search-dungeon", "move-dungeon", "disarm-dungeon-trap"]) {
      const action = depthCommandCandidates(state)[0]!.command;
      expect(action.type).toBe(expected);
      state = stepDepth(state, action);
    }
    expect(state.dungeon?.latestDisarmKitUse).toMatchObject({ itemId: disarmingKitId(state.hero.id), quantityBefore: 1,
      quantityAfter: 0, bonus: 2, skill: 11, roll: 0, baseTotal: 11, total: 13, difficulty: 12, success: true });
    expect(state.hero.resources.health).toBe(Math.floor(entered.hero.resources.maxHealth / 2));
    expect(dungeonTrapAt(state.dungeon!, state.dungeon!.currentCellId)?.phase).toBe("disarmed");
    expect(state.hero.inventory.some((item) => item.id === disarmingKitId(state.hero.id))).toBe(false);
    expect(state.latestDisarmingKitPurchase).toEqual(purchased.latestDisarmingKitPurchase);
    expect(upgradeDepthState(structuredClone(state), state.seed, state.hero.id, state.hero.name)).toEqual(state);
    const saved = JSON.stringify(state);
    expect(() => stepDepth(state, { type: "disarm-dungeon-trap" })).toThrow("no detected");
    expect(JSON.stringify(state)).toBe(saved);
    expect(() => upgradeDepthState({ ...state, hero: { ...state.hero,
      inventory: [...state.hero.inventory, createDisarmingKit(state.hero.id)] } }, state.seed, state.hero.id, state.hero.name)).toThrow();

    const forged = { ...state, tick: state.tick + 1,
      latestDisarmingKitPurchase: { ...state.latestDisarmingKitPurchase!, tick: state.tick + 1 } };
    // Each receipt is individually valid; their chronology requires an inventory kit.
    expect(isValidDisarmingKitPurchaseReceipt(forged.latestDisarmingKitPurchase, forged)).toBe(true);
    expect(() => upgradeDepthState(forged, state.seed, state.hero.id, state.hero.name)).toThrow("schema invariants");
    expect(() => stepDepth(forged, { type: "wait" })).toThrow("schema invariants");

    const usedReceipt = state.dungeon!.latestDisarmKitUse;
    // Finish this one generated dungeon using its ordinary bounded traversal choices.
    for (let steps = 0; steps < 200 && !state.dungeon!.completed; steps += 1) {
      state = stepDepth(state, depthCommandCandidates(state)[0]!.command);
    }
    expect(state.dungeon!.completed).toBe(true);
    expect(state.dungeon!.latestDisarmKitUse).toEqual(usedReceipt);
    // As with the entry handoff above, only location is staged; buying is a real reducer action.
    const returned = { ...state, atlas: { ...state.atlas, currentLocationId: purchased.atlas.currentLocationId } };
    const repurchase = selectDisarmingKitPurchase(returned)!;
    expect(repurchase).not.toBeNull();
    const boughtAgain = stepDepth(returned, { type: "buy-disarming-kit", smithId: repurchase.smithId });
    expect(boughtAgain.latestDisarmingKitPurchase!.tick).toBeGreaterThan(usedReceipt!.tick);
    expect(boughtAgain.hero.gold).toBe(returned.hero.gold - 5);
    expect(boughtAgain.hero.inventory.filter((item) => item.id === disarmingKitId(state.hero.id))).toEqual([createDisarmingKit(state.hero.id)]);
    expect(boughtAgain.dungeon!.latestDisarmKitUse).toEqual(usedReceipt);
    expect(upgradeDepthState(structuredClone(boughtAgain), state.seed, state.hero.id, state.hero.name)).toEqual(boughtAgain);
    const missingRepurchase = { ...boughtAgain, hero: { ...boughtAgain.hero,
      inventory: boughtAgain.hero.inventory.filter((item) => item.id !== disarmingKitId(state.hero.id)) } };
    expect(() => upgradeDepthState(missingRepurchase, state.seed, state.hero.id, state.hero.name)).toThrow("schema invariants");
  });
});
