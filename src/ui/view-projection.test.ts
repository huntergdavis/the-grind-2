import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { AbilityDiscovery, AbilityState, MonsterLoreState } from "../depth/types";
import {
  inspectionViews,
  maximumCodexEntries,
  projectCodexView,
  projectInventoryView,
  projectJournalView,
  projectMapView,
} from "./view-projection";

function monsterLore(overrides: Partial<MonsterLoreState> = {}): MonsterLoreState {
  return {
    monsterId: "lantern-wolf",
    monsterName: "Lantern Wolf",
    encounters: 2,
    victories: 1,
    insight: 1,
    requiredInsight: 3,
    secretTechniqueId: "secret:lantern-wolf:moonhowl",
    secretTechniqueName: "Moonhowl",
    learned: false,
    ...overrides,
  };
}

describe("view-only screen projections", () => {
  it("exposes a fixed extensible view order", () => {
    expect(inspectionViews).toEqual(["watch", "map", "inventory", "journal", "codex"]);
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

  it("projects no unseen species and never mutates an empty canonical bestiary", () => {
    const world = createWorld("screen-codex-empty", "campaign");
    const before = JSON.stringify(world);
    expect(projectCodexView(world)).toEqual({
      recordedCount: 0,
      learnedCount: 0,
      unverifiedCount: 0,
      hiddenCount: 0,
      monsters: [],
    });
    expect(JSON.stringify(world)).toBe(before);
  });

  it("redacts every locked secret field while exposing exact encounter progress", () => {
    const world = createWorld("screen-codex-locked", "campaign");
    const locked = monsterLore({
      secretTechniqueId: "secret:must-not-leak",
      secretTechniqueName: "Must Not Leak",
    });
    const withLore = {
      ...world,
      depth: {
        ...world.depth,
        hero: { ...world.depth.hero, monsterLore: [locked] },
      },
    };
    const projected = projectCodexView(withLore);
    expect(projected.monsters[0]).toMatchObject({
      monsterId: locked.monsterId,
      monsterName: locked.monsterName,
      visualKey: "lantern-wolf",
      encounters: 2,
      victories: 1,
      insight: 1,
      requiredInsight: 3,
      remainingVictories: 2,
      techniqueStatus: "studying",
      technique: null,
    });
    expect(JSON.stringify(projected)).not.toContain(locked.secretTechniqueId);
    expect(JSON.stringify(projected)).not.toContain(locked.secretTechniqueName);
  });

  it("reveals a technique only through an exact learned ability and discovery join", () => {
    const world = createWorld("screen-codex-learned", "campaign");
    const lore = monsterLore({ encounters: 4, victories: 3, insight: 3, learned: true });
    const starter = world.depth.hero.abilities[0]!;
    const technique: AbilityState = {
      ...starter,
      id: lore.secretTechniqueId,
      name: lore.secretTechniqueName,
      kind: "secret",
      effect: "weaken",
      level: 2,
      experience: 9,
      uses: 5,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: lore.monsterId,
    };
    const discovery: AbilityDiscovery = {
      id: "discovery:moonhowl",
      tick: 17,
      abilityId: technique.id,
      abilityName: technique.name,
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
    };
    const learnedWorld = {
      ...world,
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          monsterLore: [lore],
          abilities: [...world.depth.hero.abilities, technique],
        },
        discoveries: [discovery],
      },
    };
    const learned = projectCodexView(learnedWorld);
    expect(learned.learnedCount).toBe(1);
    expect(learned.unverifiedCount).toBe(0);
    expect(learned.monsters[0]).toMatchObject({
      techniqueStatus: "learned",
      technique: {
        id: technique.id,
        name: technique.name,
        effect: technique.effect,
        manaCost: technique.manaCost,
        potency: technique.potency,
        level: technique.level,
        experience: technique.experience,
        uses: technique.uses,
        discoveryTick: discovery.tick,
      },
    });

    for (const mismatch of [
      { sourceMonsterId: "different-species" },
      { kind: "spell" as const },
      { name: "Renamed impostor ability" },
    ]) {
      const mismatched = projectCodexView({
        ...learnedWorld,
        depth: {
          ...learnedWorld.depth,
          hero: {
            ...learnedWorld.depth.hero,
            abilities: learnedWorld.depth.hero.abilities.map((ability) => ability.id === technique.id
              ? { ...ability, ...mismatch }
              : ability),
          },
        },
      });
      expect(mismatched.monsters[0]).toMatchObject({ techniqueStatus: "unverified", technique: null });
      expect(JSON.stringify(mismatched)).not.toContain(lore.secretTechniqueName);
    }

    for (const mismatch of [
      { abilityId: "different-ability" },
      { abilityName: "Renamed discovery" },
      { monsterId: "different-species" },
      { monsterName: "Different creature" },
    ]) {
      const mismatched = projectCodexView({
        ...learnedWorld,
        depth: {
          ...learnedWorld.depth,
          discoveries: [{ ...discovery, ...mismatch }],
        },
      });
      expect(mismatched.monsters[0]).toMatchObject({ techniqueStatus: "unverified", technique: null });
      expect(JSON.stringify(mismatched)).not.toContain(lore.secretTechniqueName);
    }
  });

  it("deduplicates, sorts, bounds, and safely styles a large encountered roster", () => {
    const world = createWorld("screen-codex-bound", "campaign");
    const lore = Array.from({ length: maximumCodexEntries + 2 }, (_, index) => monsterLore({
      monsterId: `future-species:${String(index).padStart(2, "0")}`,
      monsterName: `Creature ${String(maximumCodexEntries + 2 - index).padStart(2, "0")}`,
      secretTechniqueId: `secret:future:${index}`,
      secretTechniqueName: `Future Secret ${index}`,
    }));
    const withDuplicate = [...lore, { ...lore[0]!, encounters: 99 }];
    const withLore = {
      ...world,
      depth: { ...world.depth, hero: { ...world.depth.hero, monsterLore: withDuplicate } },
    };
    const first = projectCodexView(withLore);
    const second = projectCodexView(withLore);
    expect(first).toEqual(second);
    expect(first.recordedCount).toBe(maximumCodexEntries + 2);
    expect(first.monsters).toHaveLength(maximumCodexEntries);
    expect(first.hiddenCount).toBe(2);
    expect(first.monsters.every((entry) => entry.visualKey === "unknown")).toBe(true);
    expect(first.monsters.map((entry) => entry.monsterName)).toEqual(
      [...first.monsters.map((entry) => entry.monsterName)].sort(),
    );
  });
});
