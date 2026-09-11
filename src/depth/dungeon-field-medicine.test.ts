import { beforeAll, describe, expect, it } from "vitest";
import { naturalDungeonFieldMedicineFixture } from "../../tests/dungeon-field-medicine-fixtures";
import { canonicalStringify } from "../core/canonical";
import { actorPolicy, advanceWorld, campaignDirector, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { isValidDungeonState } from "./dungeon";
import { dungeonFieldMedicineCommandId, isValidCampaignDungeonFieldMedicine, isValidDungeonFieldMedicineUse, selectDungeonFieldMedicine } from "./dungeon-field-medicine";
import { createEmberTonic, emberTonicId } from "./rpg";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}
function medicineCommand(state: DepthState): Extract<DepthCommand, { type: "use-dungeon-tonic" }> {
  const receipt = selectDungeonFieldMedicine(state);
  if (receipt === null) throw new Error("Expected available medicine");
  return { type: "use-dungeon-tonic", dungeonId: receipt.dungeonId, cellId: receipt.cellId, itemId: receipt.itemId };
}
function resourceBoundary(state: DepthState, health: number, quantity: number): DepthState {
  const inventory = state.hero.inventory.filter((item) => item.id !== emberTonicId(state.hero.id));
  return { ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health },
    inventory: quantity === 0 ? inventory : [...inventory, createEmberTonic(state.hero.id, quantity)] } };
}

describe("one owned tonic between actual dungeon actions", () => {
  let ready: WorldState, used: WorldState;
  beforeAll(() => {
    ready = naturalDungeonFieldMedicineFixture();
    used = advanceWorld(ready);
  });

  it("treats the already-living earned explorer, consumes exactly one tonic, and preserves every other fact", () => {
    const before = ready.depth, after = used.depth, receipt = after.dungeon!.latestFieldMedicineUse!;
    expect(before.hero.resources.health).toBeGreaterThan(0);
    expect(before.hero.resources.health * 2).toBeLessThanOrEqual(before.hero.resources.maxHealth);
    expect(receipt).toEqual(selectDungeonFieldMedicine(before));
    expect(receipt).toMatchObject({ schemaVersion: 1, effect: "restore-health-quarter-max-v1", heroId: before.hero.id,
      dungeonId: before.dungeon!.id, cellId: before.dungeon!.currentCellId, locationId: before.atlas.currentLocationId,
      itemId: emberTonicId(before.hero.id), itemName: "Ember Tonic", tick: before.tick + 1,
      healthBefore: 11, maxHealth: 42, amount: 11, healthAfter: 22,
      quantityBefore: 3, quantityAfter: 2, disposition: "retained" });
    expect(after).toEqual({ ...before, tick: before.tick + 1, log: after.log,
      dungeon: { ...before.dungeon!, latestFieldMedicineUse: receipt },
      hero: { ...before.hero, resources: { ...before.hero.resources, health: receipt.healthAfter },
        inventory: before.hero.inventory.map((item) => item.id === receipt.itemId ? { ...item, quantity: receipt.quantityAfter } : item) } });
    expect(used.hero).toEqual({ ...ready.hero, health: receipt.healthAfter });
    expect(used.scene.mode).toBe("dungeon");
    expect(used.scene.consequence).toContain("Ember Tonic ×3→×2 · HP 11→22/42 (+11)");
    expect(used.chronicle.at(-1)).toMatchObject({ commandType: "use-dungeon-tonic", tick: receipt.tick,
      commandId: `${used.campaignId}:${receipt.sourceCommandId}` });
    expect(receipt.sourceCommandId).toBe(dungeonFieldMedicineCommandId(receipt.tick, medicineCommand(before)));
    expect(reload(after)).toEqual(after);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(used)))).toEqual(used);
    expect(selectDungeonFieldMedicine(after)).toBeNull();
    const opportunity = campaignDirector(used), choice = actorPolicy(used, opportunity);
    expect(["move-dungeon", "disarm-dungeon-trap", "unlock-dungeon-gate", "search-dungeon", "open-dungeon-passage", "invoke-dungeon-shrine"])
      .toContain(choice.command.type);
    const ordinary = stepDepth(used.depth, choice.command), continued = advanceWorld(used);
    expect(continued.chronicle.at(-1)).toMatchObject({ commandType: choice.command.type, commandId: choice.commandId });
    expect(continued.depth.dungeon!.latestFieldMedicineUse).toEqual(receipt);
    // Resume the actually offered room action (including a detected trap),
    // with its own resource consequences and no repeated medicine effect.
    expect(continued.depth.hero.resources).toEqual(ordinary.hero.resources);
    expect(continued.depth.hero.inventory.find(item => item.id === receipt.itemId)?.quantity).toBe(receipt.quantityAfter);
  });

  it("depletes the final item and uses the same half-health boundary for direct and automatic commands", () => {
    // Explicit inventory/health boundaries on the actual entered dungeon,
    // not claims about the naturally encountered stack quantity.
    const half = resourceBoundary(ready.depth, Math.floor(ready.depth.hero.resources.maxHealth / 2), 1);
    const receipt = selectDungeonFieldMedicine(half)!;
    const after = stepDepth(half, medicineCommand(half));
    expect(receipt.amount).toBe(Math.ceil(half.hero.resources.maxHealth / 4));
    expect(after.dungeon!.latestFieldMedicineUse).toMatchObject({ quantityBefore: 1, quantityAfter: 0, disposition: "depleted" });
    expect(after.hero.inventory.some((item) => item.id === receipt.itemId)).toBe(false);
    expect(reload(after)).toEqual(after);
    expect(selectDungeonFieldMedicine(after)).toBeNull();
    const above = resourceBoundary(ready.depth, Math.floor(ready.depth.hero.resources.maxHealth / 2) + 1, 3);
    expect(selectDungeonFieldMedicine(above)).toBeNull();
    expect(() => stepDepth(above, medicineCommand(ready.depth))).toThrow();
  });

  it("allows another genuinely needed dose only by spending another real item on another tick", () => {
    const low = resourceBoundary(ready.depth, 1, 3);
    const once = stepDepth(low, medicineCommand(low));
    expect(once.hero.resources.health).toBe(12);
    const next = selectDungeonFieldMedicine(once)!;
    expect(next.sourceCommandId).not.toBe(once.dungeon!.latestFieldMedicineUse!.sourceCommandId);
    const twice = stepDepth(once, medicineCommand(once));
    expect(twice.dungeon!.latestFieldMedicineUse).toMatchObject({ quantityBefore: 2, quantityAfter: 1, healthBefore: 12, healthAfter: 23 });
    expect(selectDungeonFieldMedicine(twice)).toBeNull();
    expect(reload(twice)).toEqual(twice);
  });

  it("rejects absent, empty, duplicate, renamed, foreign and inert tonic stacks", () => {
    const base = ready.depth, id = emberTonicId(base.hero.id), tonic = base.hero.inventory.find((item) => item.id === id)!;
    const without = base.hero.inventory.filter((item) => item.id !== id);
    const inventories = [without, [...without, { ...tonic, quantity: 0 }], [...without, tonic, tonic],
      [...without, { ...tonic, id: "foreign-tonic" }], [...without, { ...tonic, name: "Imaginary medicine" }],
      [...without, { ...tonic, restorative: null }], [...without, { ...tonic, modifiers: { power: 1 } }]];
    for (const inventory of inventories) {
      const invalid = { ...base, hero: { ...base.hero, inventory } };
      expect(selectDungeonFieldMedicine(invalid)).toBeNull();
      expect(() => stepDepth(invalid, medicineCommand(base))).toThrow();
    }
  });

  it("preserves defeat and settlement priority, and cannot treat a completed dungeon or active encounter", () => {
    const base = ready.depth, command = medicineCommand(base);
    for (const health of [0, base.hero.resources.maxHealth]) {
      const boundary = resourceBoundary(base, health, 3);
      expect(selectDungeonFieldMedicine(boundary)).toBeNull();
      expect(() => stepDepth(boundary, command)).toThrow();
      if (health === 0) expect(depthCommandCandidates(boundary)[0]!.command).toEqual({ type: "wait" });
    }
    for (const status of ["ready-to-fulfill", "fulfilled"] as const) {
      const boundary = { ...base, quest: { ...base.quest, status } };
      expect(selectDungeonFieldMedicine(boundary)).toBeNull();
      expect(() => stepDepth(boundary, command)).toThrow();
    }
    const finished = { ...base, dungeon: { ...base.dungeon!, completed: true } };
    expect(selectDungeonFieldMedicine(finished)).toBeNull();
    expect(() => stepDepth(finished, command)).toThrow();
    const activeCombat = base.completedCombats.at(-1);
    expect(activeCombat).toBeDefined();
    expect(selectDungeonFieldMedicine({ ...base, combat: activeCombat! })).toBeNull();
    expect(selectDungeonFieldMedicine({ ...base, companions: { ...base.companions,
      active: [{ ...base.companions.former[0]!, phase: "travelling" }] } })).toBeNull();
    const wrong: DepthCommand[] = [{ ...command, dungeonId: "foreign-dungeon" }, { ...command, cellId: "foreign-cell" }, { ...command, itemId: "foreign-item" }];
    for (const entry of wrong) expect(() => stepDepth(base, entry)).toThrow();
  });

  it("rejects rewritten source, arithmetic, identity and current-tick effect receipts", () => {
    const base = used.depth, receipt = base.dungeon!.latestFieldMedicineUse!;
    const bad = [undefined, {}, { ...receipt, extra: true }, { ...receipt, effect: "free-healing-v2" },
      { ...receipt, heroId: "foreign" }, { ...receipt, sourceCommandId: "foreign-source" },
      { ...receipt, tick: base.tick + 1 }, { ...receipt, cellId: "unvisited-room" }, { ...receipt, locationId: "foreign-location" },
      { ...receipt, amount: receipt.amount + 1 }, { ...receipt, healthAfter: receipt.healthAfter + 1 },
      { ...receipt, healthBefore: 0 }, { ...receipt, quantityAfter: receipt.quantityBefore },
      { ...receipt, quantityBefore: 100 }, { ...receipt, disposition: "depleted" }];
    for (const invalid of bad) {
      const state = { ...base, dungeon: { ...base.dungeon!, latestFieldMedicineUse: invalid } } as unknown as DepthState;
      expect(isValidCampaignDungeonFieldMedicine(state)).toBe(false);
      expect(() => upgradeDepthState(state, base.seed, base.hero.id, base.hero.name)).toThrow();
    }
    expect(isValidCampaignDungeonFieldMedicine(resourceBoundary(base, receipt.healthBefore, receipt.quantityAfter))).toBe(false);
    expect(isValidCampaignDungeonFieldMedicine(resourceBoundary(base, receipt.healthAfter, receipt.quantityBefore))).toBe(false);
    expect(isValidDungeonFieldMedicineUse(receipt, base.dungeon!)).toBe(true);
    expect(isValidDungeonState({ ...base.dungeon!, latestFieldMedicineUse: undefined })).toBe(false);
  });

  it("keeps legacy absence inert and retains genuine history after later resources and room actions change", () => {
    const { latestFieldMedicineUse: _receipt, ...legacyDungeon } = ready.depth.dungeon!;
    const legacy = { ...ready.depth, dungeon: legacyDungeon };
    expect(isValidCampaignDungeonFieldMedicine(legacy)).toBe(true);
    expect(reload(legacy)).toEqual(legacy);
    expect(selectDungeonFieldMedicine(legacy)).toEqual(selectDungeonFieldMedicine(ready.depth));
    const later = advanceWorld(used).depth, receipt = used.depth.dungeon!.latestFieldMedicineUse!;
    // Historical validity must not bind future inventory or HP to a prior drink.
    const changedLater = resourceBoundary(later, 1, 3);
    expect(isValidCampaignDungeonFieldMedicine(changedLater)).toBe(true);
    expect(reload(changedLater).dungeon!.latestFieldMedicineUse).toEqual(receipt);
    expect(later.dungeon!.latestFieldMedicineUse).toEqual(receipt);
  });
});
