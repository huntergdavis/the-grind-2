import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { inspectionViews, projectInventoryView, projectJournalView, projectMapView } from "./view-projection";

describe("view-only screen projections", () => {
  it("exposes a fixed extensible view order", () => {
    expect(inspectionViews).toEqual(["watch", "map", "inventory", "journal"]);
  });

  it("projects every inventory stack and exact equipped state without mutation", () => {
    const world = createWorld("screen-inventory", "campaign");
    const before = JSON.stringify(world);
    const inventory = projectInventoryView(world);
    expect(inventory.stackCount).toBe(world.depth.hero.inventory.length);
    expect(inventory.itemCount).toBe(world.depth.hero.inventory.reduce((total, item) => total + item.quantity, 0));
    expect(inventory.equippedCount).toBe(Object.values(world.depth.hero.equipment).filter((itemId) => itemId !== null).length);
    expect(inventory.items.map((item) => item.id)).toEqual(world.depth.hero.inventory.map((item) => item.id));
    expect(JSON.stringify(world)).toBe(before);
  });

  it("projects the active canonical route and discovery count", () => {
    let world = createWorld("screen-map", "campaign");
    for (let index = 0; index < 12 && world.depth.atlas.route === null; index += 1) world = advanceWorld(world);
    const map = projectMapView(world);
    expect(map.currentLeg).toContain("→");
    expect(map.destination).not.toBeNull();
    expect(map.progress).toMatch(/\d+\/\d+ miles · \d+ remaining/);
    expect(map.discovered).toBe(`${world.depth.atlas.discoveredLocationIds.length}/${world.depth.atlas.locations.length} mapped sites reached`);
  });

  it("projects the full quest tree and bounded newest-first chronicle", () => {
    let world = createWorld("screen-journal", "campaign");
    for (let index = 0; index < 20; index += 1) world = advanceWorld(world);
    const journal = projectJournalView(world);
    expect(journal.quests).toHaveLength(1 + world.depth.quest.subquests.length);
    expect(journal.entries.length).toBeLessThanOrEqual(12);
    expect(journal.entries[0]?.tick).toBe(world.chronicle.at(-1)?.tick);
    expect(journal.quests.flatMap((quest) => quest.objectives).length).toBe(
      world.depth.quest.objectives.length + world.depth.quest.subquests.reduce((total, quest) => total + quest.objectives.length, 0),
    );
  });
});
