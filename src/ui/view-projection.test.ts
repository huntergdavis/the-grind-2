import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import { abilityExperienceFloor, maximumAbilities } from "../depth/rpg";
import type { AbilityDiscovery, AbilityState, MonsterLoreState } from "../depth/types";
import {
  inspectionViews,
  maximumCodexEntries,
  projectCodexView,
  projectInventoryView,
  projectJournalView,
  projectMapView,
  projectSpellbookView,
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
    expect(inspectionViews).toEqual(["watch", "map", "inventory", "journal", "codex", "spellbook"]);
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

  it("projects no unowned abilities or locked lore into an empty spellbook", () => {
    const world = createWorld("screen-spellbook-empty", "campaign");
    const locked = monsterLore({
      monsterName: "Must Not Appear",
      secretTechniqueId: "secret:must-not-appear",
      secretTechniqueName: "Hidden Pattern Must Not Appear",
    });
    const empty = {
      ...world,
      depth: {
        ...world.depth,
        hero: { ...world.depth.hero, abilities: [], monsterLore: [locked] },
      },
    };
    const before = JSON.stringify(empty);
    const projected = projectSpellbookView(empty);
    expect(projected).toEqual({
      abilityCount: 0,
      spellCount: 0,
      techniqueCount: 0,
      secretCount: 0,
      masteredCount: 0,
      totalBattleUses: "0",
      hiddenCount: 0,
      closestBreakthrough: null,
      abilities: [],
    });
    expect(JSON.stringify(projected)).not.toContain(locked.monsterName);
    expect(JSON.stringify(projected)).not.toContain(locked.secretTechniqueId);
    expect(JSON.stringify(projected)).not.toContain(locked.secretTechniqueName);
    expect(JSON.stringify(empty)).toBe(before);
  });

  it("projects exact level bands, battle uses, stable kinds, and verified monster provenance", () => {
    const world = createWorld("screen-spellbook-mastery", "campaign");
    const spell: AbilityState = {
      ...world.depth.hero.abilities.find((ability) => ability.kind === "spell")!,
      level: 1,
      experience: 0,
      uses: 2,
    };
    const technique: AbilityState = {
      ...world.depth.hero.abilities.find((ability) => ability.kind === "technique")!,
      level: 19,
      experience: abilityExperienceFloor(19) + 20,
      uses: 7,
    };
    const lore = monsterLore({ encounters: 4, victories: 3, insight: 3, learned: true });
    const secret: AbilityState = {
      ...spell,
      id: lore.secretTechniqueId,
      name: lore.secretTechniqueName,
      kind: "secret",
      effect: "weaken",
      level: 20,
      experience: abilityExperienceFloor(20),
      uses: 11,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: lore.monsterId,
    };
    const discovery: AbilityDiscovery = {
      id: "discovery:spellbook:moonhowl",
      tick: 23,
      abilityId: secret.id,
      abilityName: secret.name,
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
    };
    const withAbilities = {
      ...world,
      depth: {
        ...world.depth,
        hero: {
          ...world.depth.hero,
          abilities: [secret, technique, spell],
          monsterLore: [lore],
        },
        discoveries: [discovery],
      },
    };
    const before = JSON.stringify(withAbilities);
    const projected = projectSpellbookView(withAbilities);
    expect(projected).toMatchObject({
      abilityCount: 3,
      spellCount: 1,
      techniqueCount: 1,
      secretCount: 1,
      masteredCount: 1,
      totalBattleUses: "20",
      hiddenCount: 0,
      closestBreakthrough: {
        abilityId: spell.id,
        abilityName: spell.name,
        nextLevel: 2,
        experienceToNext: 6,
      },
    });
    expect(projected.abilities.map((ability) => ability.kind)).toEqual(["spell", "technique", "secret"]);
    expect(projected.abilities[0]).toMatchObject({
      id: spell.id,
      level: 1,
      experienceFloor: 0,
      experienceCeiling: 6,
      masteryCurrent: 0,
      masterySpan: 6,
      experienceToNext: 6,
      battleUses: 2,
      provenanceStatus: "not-applicable",
      provenance: null,
    });
    expect(projected.abilities[1]).toMatchObject({
      id: technique.id,
      level: 19,
      experienceFloor: abilityExperienceFloor(19),
      masteryCurrent: 20,
      battleUses: 7,
    });
    expect(projected.abilities[2]).toMatchObject({
      id: secret.id,
      mastered: true,
      masteryCurrent: 1,
      masterySpan: 1,
      experienceToNext: 0,
      provenanceStatus: "verified",
      provenance: { monsterName: lore.monsterName, discoveryTick: discovery.tick },
    });
    expect(JSON.stringify(withAbilities)).toBe(before);
  });

  it("fails monster provenance closed across every ability, lore, and discovery mismatch", () => {
    const world = createWorld("screen-spellbook-provenance", "campaign");
    const lore = monsterLore({ encounters: 4, victories: 3, insight: 3, learned: true });
    const secret: AbilityState = {
      ...world.depth.hero.abilities[0]!,
      id: lore.secretTechniqueId,
      name: lore.secretTechniqueName,
      kind: "secret",
      sourceMonsterId: lore.monsterId,
    };
    const discovery: AbilityDiscovery = {
      id: "discovery:spellbook:strict",
      tick: 9,
      abilityId: secret.id,
      abilityName: secret.name,
      monsterId: lore.monsterId,
      monsterName: lore.monsterName,
    };
    const base = {
      ...world,
      depth: {
        ...world.depth,
        hero: { ...world.depth.hero, abilities: [secret], monsterLore: [lore] },
        discoveries: [discovery],
      },
    };
    const mismatches = [
      { ability: { sourceMonsterId: "different-species" } },
      { ability: { name: "Renamed owned secret" } },
      { lore: { learned: false } },
      { lore: { secretTechniqueId: "different-secret" } },
      { lore: { secretTechniqueName: "Different secret" } },
      { discovery: { abilityId: "different-ability" } },
      { discovery: { abilityName: "Different ability" } },
      { discovery: { monsterId: "different-species" } },
      { discovery: { monsterName: "Different creature" } },
    ];
    for (const mismatch of mismatches) {
      const projected = projectSpellbookView({
        ...base,
        depth: {
          ...base.depth,
          hero: {
            ...base.depth.hero,
            abilities: [{ ...secret, ...mismatch.ability }],
            monsterLore: [{ ...lore, ...mismatch.lore }],
          },
          discoveries: [{ ...discovery, ...mismatch.discovery }],
        },
      });
      expect(projected.abilities[0]).toMatchObject({ provenanceStatus: "unverified", provenance: null });
      expect(JSON.stringify(projected)).not.toContain(lore.monsterName);
    }
  });

  it("deduplicates, stably sorts, and reports exact malformed spellbook overflow", () => {
    const world = createWorld("screen-spellbook-bound", "campaign");
    const template = world.depth.hero.abilities[0]!;
    const abilities = Array.from({ length: maximumAbilities + 2 }, (_, index): AbilityState => ({
      ...template,
      id: `spell:future:${String(index).padStart(2, "0")}`,
      name: `Future Art ${String(maximumAbilities + 2 - index).padStart(2, "0")}`,
      kind: index % 3 === 0 ? "secret" : index % 2 === 0 ? "technique" : "spell",
      sourceMonsterId: index % 3 === 0 ? `future-species:${index}` : null,
    }));
    const withDuplicate = [...abilities, { ...abilities[0]!, name: "Z duplicate must lose" }];
    const input = {
      ...world,
      depth: { ...world.depth, hero: { ...world.depth.hero, abilities: withDuplicate } },
    };
    const before = JSON.stringify(input);
    const projected = projectSpellbookView(input);
    expect(projected.abilityCount).toBe(maximumAbilities + 2);
    expect(projected.abilities).toHaveLength(maximumAbilities);
    expect(projected.hiddenCount).toBe(2);
    expect(new Set(projected.abilities.map((ability) => ability.id)).size).toBe(maximumAbilities);
    expect(projected.abilities.map((ability) => ability.kind)).toEqual(
      [...projected.abilities.map((ability) => ability.kind)].sort((left, right) =>
        ({ spell: 0, technique: 1, secret: 2 })[left] - ({ spell: 0, technique: 1, secret: 2 })[right]
      ),
    );
    expect(JSON.stringify(input)).toBe(before);
  });

  it("keeps the aggregate battle-use count exact beyond the safe-integer sum", () => {
    const world = createWorld("screen-spellbook-exact-total", "campaign");
    const abilities = world.depth.hero.abilities.map((ability, index) => ({
      ...ability,
      uses: index === 0 ? Number.MAX_SAFE_INTEGER : 2,
    }));
    const projected = projectSpellbookView({
      ...world,
      depth: { ...world.depth, hero: { ...world.depth.hero, abilities } },
    });
    expect(projected.totalBattleUses).toBe("9007199254740993");
  });
});
