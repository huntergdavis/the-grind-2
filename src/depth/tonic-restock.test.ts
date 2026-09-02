import { describe, expect, it } from "vitest";
import { createCounterDuel } from "./counter-duel";
import { generateDungeon } from "./dungeon";
import {
  createWeaponUseMastery,
  emberTonicId,
  inventoryCapacity,
} from "./rpg";
import {
  createDepthState,
  depthCommandCandidates,
  selectTonicRestock,
  stepDepth,
  upgradeDepthState,
} from "./state";
import type { DepthState, ItemState } from "./types";

function withTonicQuantity(quantity: number | null, gold: number): DepthState {
  const base = createDepthState("tonic-restock", "hero:tonic-restock", "Nia Ember");
  const itemId = emberTonicId(base.hero.id);
  const inventory = quantity === null
    ? base.hero.inventory.filter((item) => item.id !== itemId)
    : base.hero.inventory.map((item) => item.id === itemId ? { ...item, quantity } : item);
  return { ...base, hero: { ...base.hero, gold, inventory } };
}

function fillInventory(state: DepthState): DepthState {
  const original = state.hero.inventory[0];
  if (original === undefined) throw new Error("Full-inventory fixture needs a starter weapon");
  const fillers = Array.from({ length: inventoryCapacity - state.hero.inventory.length }, (_, index): ItemState => ({
    ...original,
    id: `restock:filler:${index}`,
    name: `Restock Filler ${index}`,
    useMastery: createWeaponUseMastery(),
  }));
  return { ...state, hero: { ...state.hero, inventory: [...state.hero.inventory, ...fillers] } };
}

describe("autonomous town tonic restock", () => {
  it.each([
    { quantity: null, gold: 0, bought: 0, after: 0, goldAfter: 0 },
    { quantity: null, gold: 4, bought: 0, after: 0, goldAfter: 4 },
    { quantity: null, gold: 5, bought: 1, after: 1, goldAfter: 0 },
    { quantity: null, gold: 10, bought: 2, after: 2, goldAfter: 0 },
    { quantity: null, gold: 15, bought: 3, after: 3, goldAfter: 0 },
    { quantity: 1, gold: 5, bought: 1, after: 2, goldAfter: 0 },
    { quantity: 1, gold: 10, bought: 2, after: 3, goldAfter: 0 },
    { quantity: 2, gold: 4, bought: 0, after: 2, goldAfter: 4 },
    { quantity: 2, gold: 5, bought: 1, after: 3, goldAfter: 0 },
    { quantity: 3, gold: 50, bought: 0, after: 3, goldAfter: 50 },
  ])("buys only the affordable missing quantity: $quantity at $gold gold", ({ quantity, gold, bought, after, goldAfter }) => {
    const state = withTonicQuantity(quantity, gold);
    const plan = selectTonicRestock(state);
    if (bought === 0) {
      expect(plan).toBeNull();
      expect(depthCommandCandidates(state).some((candidate) => candidate.command.type === "restock-tonic")).toBe(false);
      return;
    }
    expect(plan).toMatchObject({
      itemId: emberTonicId(state.hero.id),
      quantityBefore: quantity ?? 0,
      quantityBought: bought,
      quantityAfter: after,
      goldBefore: gold,
      unitPrice: 5,
      goldSpent: bought * 5,
      goldAfter,
      disposition: quantity === null ? "recreated" : "incremented",
    });
    const candidate = depthCommandCandidates(state).find((entry) => entry.command.type === "restock-tonic");
    expect(candidate).toMatchObject({
      label: `restock Ember Tonic ×${quantity ?? 0}→×${after}`,
      command: { type: "restock-tonic", itemId: emberTonicId(state.hero.id) },
    });
  });

  it("applies one exact deterministic purchase and changes no unrelated state", () => {
    const before = withTonicQuantity(null, 12);
    const command = { type: "restock-tonic" as const, itemId: emberTonicId(before.hero.id) };
    const after = stepDepth(before, command);
    const replayed = stepDepth(structuredClone(before), command);
    expect(after).toEqual(replayed);
    expect(after.hero.gold).toBe(2);
    expect(after.hero.inventory.at(-1)).toMatchObject({
      id: command.itemId,
      name: "Ember Tonic",
      quantity: 2,
      restorative: { schemaVersion: 1, kind: "restore-health-quarter-max", target: "self" },
    });
    expect(after.log.at(-1)?.message).toBe("Ember Tonic ×0→×2 (+2) · gold 12→2 · 5 gold each");
    expect({
      ...after,
      tick: before.tick,
      log: before.log,
      hero: { ...after.hero, gold: before.hero.gold, inventory: before.hero.inventory },
    }).toEqual(before);
    expect(upgradeDepthState(structuredClone(after), after.seed, after.hero.id, after.hero.name)).toEqual(after);
  });

  it("fails closed for full inventory, forged tonic identity, and unsafe states", () => {
    const absent = withTonicQuantity(null, 15);
    const full = fillInventory(absent);
    expect(full.hero.inventory).toHaveLength(inventoryCapacity);
    expect(selectTonicRestock(full)).toBeNull();

    const itemId = emberTonicId(absent.hero.id);
    const present = withTonicQuantity(1, 10);
    const forgedName = {
      ...present,
      hero: {
        ...present.hero,
        inventory: present.hero.inventory.map((item) => item.id === itemId ? { ...item, name: "Counterfeit Tonic" } : item),
      },
    };
    const forgedEffect = {
      ...present,
      hero: {
        ...present.hero,
        inventory: present.hero.inventory.map((item) => item.id === itemId ? { ...item, restorative: null } : item),
      },
    };
    expect(selectTonicRestock(forgedName)).toBeNull();
    expect(selectTonicRestock(forgedEffect)).toBeNull();
    expect(() => stepDepth(forgedName, { type: "restock-tonic", itemId })).toThrow("unavailable");
    expect(() => stepDepth(present, { type: "restock-tonic", itemId: "item:forged" })).toThrow("unavailable");

    const unfunded = { ...present, hero: { ...present.hero, gold: 0 } };
    const routedCandidate = depthCommandCandidates(unfunded).find((candidate) => candidate.command.type === "plan-route");
    if (routedCandidate?.command.type !== "plan-route") throw new Error("Unsafe fixture needs a route candidate");
    const routed = stepDepth(unfunded, routedCandidate.command);
    const routeFunded = { ...routed, hero: { ...routed.hero, gold: 10 } };
    const encounterId = `encounter:route:${routeFunded.atlas.route?.path.join(">") ?? "missing"}`;
    const combat = stepDepth(routeFunded, { type: "start-combat", encounterId, enemyCount: 1 });
    const counterDuel = {
      ...present,
      counterDuel: createCounterDuel(present.seed, "encounter:unsafe-restock-duel", present.hero.id, present.hero.resources.maxHealth),
    };
    const dungeon = { ...present, dungeon: generateDungeon(present.seed, "dungeon:unsafe-restock", 7, 7, true) };
    const defeated = { ...present, hero: { ...present.hero, resources: { ...present.hero.resources, health: 0 } } };
    const periodicPractice = { ...present, tick: 29 };
    const questClosure = { ...present, quest: { ...present.quest, status: "ready-to-fulfill" as const } };
    for (const unsafe of [routeFunded, combat, counterDuel, dungeon, defeated, periodicPractice, questClosure]) {
      expect(selectTonicRestock(unsafe)).toBeNull();
      expect(depthCommandCandidates(unsafe).some((candidate) => candidate.command.type === "restock-tonic")).toBe(false);
    }
  });
});
