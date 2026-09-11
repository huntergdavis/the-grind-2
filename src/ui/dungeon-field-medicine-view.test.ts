import { beforeAll, describe, expect, it } from "vitest";
import { naturalDungeonFieldMedicineFixture } from "../../tests/dungeon-field-medicine-fixtures";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { projectDungeonFieldMedicineScene } from "./dungeon-field-medicine-view";
import { dungeonPerspectiveFacing } from "./dungeon-perspective-view";
import { projectStatusHistory } from "./status-history";

describe("dungeon field medicine presentation", () => {
  let ready: WorldState, treated: WorldState;
  beforeAll(() => {
    ready = naturalDungeonFieldMedicineFixture();
    treated = advanceWorld(ready);
  });

  it("waits for the actual owned dose, not merely low health or a stocked inventory", () => {
    expect(ready.depth.hero.resources.health).toBe(11);
    expect(ready.depth.hero.resources.maxHealth).toBe(42);
    expect(projectDungeonFieldMedicineScene(ready)).toBeNull();
    const receipt = treated.depth.dungeon!.latestFieldMedicineUse!;
    expect(treated.chronicle.at(-1)!.commandType).toBe("use-dungeon-tonic");
    expect(projectDungeonFieldMedicineScene(treated)).toEqual({
      commandId: `${treated.campaignId}:${receipt.sourceCommandId}`, tick: treated.tick,
      heroId: receipt.heroId, dungeonId: receipt.dungeonId, locationId: receipt.locationId,
      cellId: receipt.cellId, itemId: receipt.itemId, itemName: "Ember Tonic",
      healthBefore: 11, healthAfter: 22, amount: 11, quantityBefore: 3, quantityAfter: 2,
      headline: "EMBER TONIC · +11 HP",
      detail: "HP 11 → 22 · Ember Tonic 3 → 2",
      compactDetail: "HP 11→22 · tonic 3→2",
    });
  });

  it("keeps the actual room and heading, with no invented movement or room discovery", () => {
    const dungeon = treated.depth.dungeon!;
    expect(dungeon.currentCellId).toBe(ready.depth.dungeon!.currentCellId);
    expect({ ...dungeon, latestFieldMedicineUse: null }).toEqual({ ...ready.depth.dungeon!, latestFieldMedicineUse: null });
    expect(dungeonPerspectiveFacing(ready, treated, "east")).toBe("east");
    expect(treated.depth.hero.resources.mana).toBe(ready.depth.hero.resources.mana);
    expect(treated.depth.hero.experience).toBe(ready.depth.hero.experience);
    expect(treated.depth.quest).toEqual(ready.depth.quest);
  });

  it("projects the same frozen receipt after reload without mutating campaign state", () => {
    const saved = JSON.stringify(treated), scene = projectDungeonFieldMedicineScene(treated)!;
    expect(Object.isFrozen(scene)).toBe(true);
    expect(projectDungeonFieldMedicineScene(JSON.parse(saved))).toEqual(scene);
    expect(JSON.stringify(treated)).toBe(saved);
  });

  it("rejects stale, foreign and wrong-command scene ownership", () => {
    const source = treated.chronicle.at(-1)!;
    const withSource = (change: Partial<typeof source>): WorldState => ({ ...treated,
      chronicle: [...treated.chronicle.slice(0, -1), { ...source, ...change }],
    });
    expect(projectDungeonFieldMedicineScene(withSource({ commandId: `foreign:${source.commandId}` }))).toBeNull();
    expect(projectDungeonFieldMedicineScene(withSource({ commandType: "search-dungeon" }))).toBeNull();
    expect(projectDungeonFieldMedicineScene(withSource({ tick: treated.tick - 1 }))).toBeNull();
    expect(projectDungeonFieldMedicineScene(withSource({ mode: "battle" }))).toBeNull();
    expect(projectDungeonFieldMedicineScene({ ...treated, scene: { ...treated.scene, mode: "battle" } })).toBeNull();
  });

  it("rejects a changed actor, place, cell, amount or remaining owned stack", () => {
    const dungeon = treated.depth.dungeon!, receipt = dungeon.latestFieldMedicineUse!;
    const withReceipt = (change: Partial<typeof receipt>): WorldState => ({ ...treated,
      depth: { ...treated.depth, dungeon: { ...dungeon, latestFieldMedicineUse: { ...receipt, ...change } } },
    });
    expect(projectDungeonFieldMedicineScene(withReceipt({ heroId: "not-this-hero" }))).toBeNull();
    expect(projectDungeonFieldMedicineScene({ ...treated, hero: { ...treated.hero, id: "not-this-rendered-hero" } })).toBeNull();
    expect(projectDungeonFieldMedicineScene(withReceipt({ locationId: "not-this-dungeon" }))).toBeNull();
    expect(projectDungeonFieldMedicineScene(withReceipt({ cellId: "not-this-cell" }))).toBeNull();
    expect(projectDungeonFieldMedicineScene(withReceipt({ amount: receipt.amount + 1 }))).toBeNull();
    expect(projectDungeonFieldMedicineScene({ ...treated, depth: { ...treated.depth,
      hero: { ...treated.depth.hero, inventory: treated.depth.hero.inventory.filter((item) => item.id !== receipt.itemId) },
    } })).toBeNull();
  });

  it("uses the existing Status history for exact quantities, health and command source", () => {
    const receipt = treated.depth.dungeon!.latestFieldMedicineUse!, source = treated.chronicle.at(-1)!;
    const rows = projectStatusHistory(treated);
    const row = rows.find((entry) => entry.source === "chronicle" && entry.eventId === source.id);
    expect(row?.source).toBe("chronicle");
    if (row?.source !== "chronicle") throw new Error("Missing canonical medicine Status row");
    expect(row.action).toContain("drinks one Ember Tonic without leaving the room");
    expect(row.consequence).toContain("Ember Tonic ×3→×2");
    expect(row.consequence).toContain("HP 11→22/42 (+11)");
    expect(row.decision.commandId).toBe(`${treated.campaignId}:${receipt.sourceCommandId}`);
    expect(row.decision.commandType).toBe("use-dungeon-tonic");
    expect(rows.some((entry) => entry.source === "mechanics" && entry.tick === treated.tick
      && entry.message.includes("Ember Tonic ×3→×2") && entry.message.includes("HP 11→22/42 (+11)"))).toBe(true);
  });

  it("retains the receipt but stops the drink pose on the next ordinary dungeon action", () => {
    const after = advanceWorld(treated);
    expect(after.depth.dungeon!.latestFieldMedicineUse).toEqual(treated.depth.dungeon!.latestFieldMedicineUse);
    expect(projectDungeonFieldMedicineScene(after)).toBeNull();
    expect(after.chronicle.at(-1)!.commandType).not.toBe("use-dungeon-tonic");
  });
});
