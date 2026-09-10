import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectDisarmingKitPurchaseScene } from "./disarming-kit-purchase";

function purchased(): WorldState {
  return advanceWorld(createWorld("browser-dungeon-search:8", "campaign:browser-dungeon-search"));
}

describe("recorded smith purchase staging", () => {
  it("binds the actual purchase to its exact smith and same-tick Chronicle without mutation", () => {
    const state = purchased();
    const saved = JSON.stringify(state);
    const purchase = state.depth.latestDisarmingKitPurchase!;
    expect(projectDisarmingKitPurchaseScene(state)).toEqual({
      smithId: purchase.smithId, smithName: "The Heron Smithy", receipt: state.chronicle.at(-1)!.consequence,
    });
    expect(projectDisarmingKitPurchaseScene(JSON.parse(saved))).toEqual(projectDisarmingKitPurchaseScene(state));
    expect(Object.isFrozen(projectDisarmingKitPurchaseScene(state))).toBe(true);
    expect(JSON.stringify(state)).toBe(saved);
  });

  it("suppresses stale, foreign, unpurchased and mismatched transaction staging", () => {
    const state = purchased();
    const purchase = state.depth.latestDisarmingKitPurchase!;
    const source = state.chronicle.at(-1)!;
    const variants: WorldState[] = [
      { ...state, tick: state.tick + 1 },
      { ...state, scene: { ...state.scene, mode: "atlas" } },
      { ...state, depth: { ...state.depth, latestDisarmingKitPurchase: null } },
      { ...state, depth: { ...state.depth, latestDisarmingKitPurchase: { ...purchase, smithId: "foreign" } } },
      { ...state, depth: { ...state.depth, hero: { ...state.depth.hero, gold: purchase.goldBefore } } },
      { ...state, depth: { ...state.depth, hero: { ...state.depth.hero,
        inventory: state.depth.hero.inventory.filter((item) => item.id !== purchase.itemId),
      } } },
      { ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, commandId: "foreign" }] },
      { ...state, chronicle: [...state.chronicle.slice(0, -1), { ...source, commandType: "wait" }] },
    ];
    for (const variant of variants) expect(projectDisarmingKitPurchaseScene(variant)).toBeNull();
    expect(projectDisarmingKitPurchaseScene(advanceWorld(state))).toBeNull();
  });
});
