import { describe, expect, it } from "vitest";
import { chooseCombatAction, createCombat, maximumCombatLogEntries, maximumCombatTurns, resolveCombatTurn } from "./combat";
import { addItem, createHero, createQuest, derivedStats, equipItem, generateLoot, inventoryCapacity, observeMonsters, progressQuest, recordMonsterVictory } from "./rpg";
import type { CombatAction, CombatState, ItemState } from "./types";

describe("character, inventory, and quest depth", () => {
  it("enforces inventory capacity and equipment ownership", () => {
    let hero = createHero("items", "hero:item", "Mira Ash");
    const basePower = derivedStats(hero).power;
    const relic: ItemState = { id: "item:relic", name: "Dawn Pike", kind: "equipment", slot: "weapon", rarity: "rare", quantity: 1, modifiers: { power: 8 } };
    hero = equipItem(addItem(hero, relic), relic.id);
    expect(hero.inventory.some((item) => item.id === hero.equipment.weapon)).toBe(true);
    expect(derivedStats(hero).power).toBe(basePower + 4);
    expect(() => equipItem(hero, "missing-item")).toThrow("outside the inventory");
    for (let index = hero.inventory.length; index < inventoryCapacity + 8; index += 1) {
      hero = addItem(hero, { id: `item:${index}`, name: `Supply ${index}`, kind: "key", slot: null, rarity: "common", quantity: 1, modifiers: {} });
    }
    expect(hero.inventory).toHaveLength(inventoryCapacity);
    expect(Object.values(hero.equipment).filter((id) => id !== null).every((id) => hero.inventory.some((item) => item.id === id))).toBe(true);
  });

  it("progresses main objectives and nested subquests to completion", () => {
    let quest = createQuest("quest-seed");
    quest = progressQuest(quest, "quest:visit-towns", 99);
    quest = progressQuest(quest, "quest:win-battle");
    quest = progressQuest(quest, "quest:cross-maze");
    quest = progressQuest(quest, "quest:find-shrine");
    quest = progressQuest(quest, "quest:collect-items", 3);
    expect(quest.objectives.every((entry) => entry.status === "complete")).toBe(true);
    expect(quest.subquests.every((entry) => entry.status === "complete")).toBe(true);
    expect(quest.status).toBe("complete");
    expect(quest.objectives[0]?.current).toBe(quest.objectives[0]?.target);
  });

  it("generates stable, source-keyed equipment rewards", () => {
    const loot = generateLoot("loot-seed", "dungeon:cell:3,4");
    expect(generateLoot("loot-seed", "dungeon:cell:3,4")).toEqual(loot);
    expect(generateLoot("loot-seed", "combat:guardian")).not.toEqual(loot);
    expect(loot.kind).toBe("equipment");
    expect(loot.slot).not.toBeNull();
  });
});

describe("multi-turn tactical combat", () => {
  it("replays a full battle deterministically across many turns", () => {
    const hero = createHero("combat-hero", "hero:combat", "Corin Vale");
    const play = (): CombatState => {
      let combat = createCombat("battle-seed", hero, "encounter:replay", 3);
      while (combat.outcome === "ongoing") combat = resolveCombatTurn(combat, chooseCombatAction(combat), "battle-seed");
      return combat;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(first.turn).toBeGreaterThan(1);
    expect(first.outcome).not.toBe("ongoing");
    expect(first.log.length).toBeGreaterThan(1);
    expect(first.log.some((entry) => entry.action === "ability" && entry.abilityId !== null)).toBe(true);
    const combatHero = first.combatants.find((entry) => entry.id === hero.id);
    expect(combatHero?.abilities.some((entry) => entry.uses > 0 && entry.experience > 0)).toBe(true);
  });

  it("caps endless battles and their live log", () => {
    const hero = createHero("stalemate", "hero:stalemate", "Hale Fen");
    let combat = createCombat("stalemate", hero, "encounter:stalemate", 1);
    combat = {
      ...combat,
      combatants: combat.combatants.map((entry) => ({ ...entry, health: 999, maxHealth: 999, power: 0, armor: 999 })),
    };
    while (combat.outcome === "ongoing") {
      const actorId = combat.turnOrder[combat.activeIndex];
      if (actorId === undefined) throw new Error("Missing active combatant");
      const action: CombatAction = { actorId, type: "guard", targetId: null, abilityId: null };
      combat = resolveCombatTurn(combat, action, "stalemate");
    }
    expect(combat.turn).toBe(maximumCombatTurns);
    expect(combat.outcome).toBe("stalemate");
    expect(combat.log).toHaveLength(maximumCombatLogEntries);
    expect(combat.combatants.every((entry) => entry.statuses.length <= 8)).toBe(true);
  });

  it("learns a monster's named secret at a deterministic visible threshold", () => {
    let hero = createHero("lore-seed", "hero:lore", "Nessa Rook");
    const combat = createCombat("lore-seed", hero, "encounter:lore", 1);
    hero = observeMonsters(hero, combat.combatants);
    const monster = combat.combatants.find((entry) => entry.side === "enemies");
    if (monster?.speciesId === null || monster === undefined) throw new Error("Missing monster species");
    expect(hero.monsterLore.find((entry) => entry.monsterId === monster.speciesId)?.insight).toBe(0);
    for (let victory = 0; victory < 2; victory += 1) {
      const result = recordMonsterVictory(hero, combat.combatants);
      hero = result.hero;
      expect(result.learned).toHaveLength(0);
    }
    const result = recordMonsterVictory(hero, combat.combatants);
    expect(result.learned).toHaveLength(1);
    expect(result.hero.abilities.some((entry) => entry.kind === "secret" && entry.sourceMonsterId === monster.speciesId)).toBe(true);
    expect(result.hero.monsterLore.find((entry) => entry.monsterId === monster.speciesId)).toMatchObject({ insight: 3, learned: true });
  });
});
