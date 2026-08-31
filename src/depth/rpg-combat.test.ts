import { describe, expect, it } from "vitest";
import { chooseCombatAction, createCombat, isValidCombatState, maximumCombatEvents, maximumCombatEventsPerTurn, maximumCombatLogEntries, maximumCombatTurns, resolveCombatTurn } from "./combat";
import { addItem, applyHeroExperience, applyQuestProgressFact, createHero, createQuest, derivedStats, effectiveAttribute, equipItem, generateLoot, heroExperienceFloor, heroLevelForExperience, heroMasteryForExperience, heroMechanicalLevel, heroNextLevelRequirement, inventoryCapacity, isValidDetailedHeroState, isValidQuestObjectiveRule, isValidQuestState, maximumHeroLevel, maximumHeroMechanicalLevel, observeMonsters, questObjectiveRuleLabel, recordMonsterVictory } from "./rpg";
import type { CombatAction, CombatState, ItemState, QuestProgressFact } from "./types";
import { completeQuestWithFacts } from "../../tests/quest-fixtures";

describe("character, inventory, and quest depth", () => {
  it("enforces inventory capacity and equipment ownership", () => {
    let hero = createHero("items", "hero:item", "Mira Ash");
    const basePower = derivedStats(hero).power;
    const relic: ItemState = { id: "item:relic", name: "Dawn Pike", kind: "equipment", slot: "weapon", rarity: "rare", quantity: 1, modifiers: { power: 8, agility: 2 } };
    hero = equipItem(addItem(hero, relic), relic.id);
    expect(hero.inventory.some((item) => item.id === hero.equipment.weapon)).toBe(true);
    expect(derivedStats(hero).power).toBe(basePower + 4);
    expect(effectiveAttribute(hero, "agility")).toBe(hero.attributes.agility + 2);
    expect(() => equipItem(hero, "missing-item")).toThrow("outside the inventory");
    for (let index = hero.inventory.length; index < inventoryCapacity + 8; index += 1) {
      hero = addItem(hero, { id: `item:${index}`, name: `Supply ${index}`, kind: "key", slot: null, rarity: "common", quantity: 1, modifiers: {} });
    }
    expect(hero.inventory).toHaveLength(inventoryCapacity);
    expect(Object.values(hero.equipment).filter((id) => id !== null).every((id) => hero.inventory.some((item) => item.id === id))).toBe(true);
  });

  it("progresses main objectives and nested subquests to completion", () => {
    const quest = completeQuestWithFacts(createQuest("quest-seed"));
    expect(quest.objectives.every((entry) => entry.status === "complete")).toBe(true);
    expect(quest.subquests.every((entry) => entry.status === "complete")).toBe(true);
    expect(quest.status).toBe("ready-to-fulfill");
    expect(quest.objectives[0]?.current).toBe(quest.objectives[0]?.target);
  });

  it("assigns truthful versioned rules to chapter zero and every renewable template", () => {
    const released = createQuest("quest-rule-map");
    expect([
      ...released.objectives,
      ...released.subquests.flatMap((subquest) => subquest.objectives),
    ].map((objective) => [objective.rule, questObjectiveRuleLabel(objective.rule)])).toEqual([
      [{ schemaVersion: 1, kind: "visit-location", locationKind: "town", firstVisitOnly: true }, "FIRST VISITS"],
      [{ schemaVersion: 1, kind: "win-combat" }, "TACTICAL VICTORY"],
      [{ schemaVersion: 1, kind: "complete-dungeon", binding: "any" }, "ANY DUNGEON"],
      [{ schemaVersion: 1, kind: "discover-dungeon-feature", feature: "shrine", binding: "any" }, "ANY SHRINE"],
      [{ schemaVersion: 1, kind: "acquire-item", disposition: "inventory" }, "NEW ITEM"],
    ]);
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      const successor = createQuest("quest-rule-map", ordinal, ordinal * 7);
      const all = [...successor.objectives, ...successor.subquests.flatMap((subquest) => subquest.objectives)];
      expect(all.map((objective) => objective.rule)).toEqual([
        { schemaVersion: 1, kind: "win-combat" },
        { schemaVersion: 1, kind: "complete-dungeon", binding: "quest-lead" },
        { schemaVersion: 1, kind: "discover-dungeon-feature", feature: "shrine", binding: "any" },
      ]);
      expect(all[0]?.description).toContain("Win tactical battles");
      expect(all[2]?.description).toContain("Discover a shrine");
    }
  });

  it("matches progress by rule rather than stable objective identity", () => {
    const initial = createQuest("quest-rule-authority");
    const renamed = {
      ...initial,
      objectives: initial.objectives.map((objective) => objective.rule.kind === "win-combat"
        ? { ...objective, id: "objective:renamed-battle" }
        : { ...objective, id: objective.rule.kind === "visit-location" ? "quest:win-battle" : objective.id }),
    };
    const progressed = applyQuestProgressFact(renamed, {
      schemaVersion: 1,
      kind: "combat-won",
      combatId: "combat:rule-authority",
      defeatedSpeciesIds: ["species:lantern-wolf"],
    });
    expect(progressed.objectives.find((objective) => objective.id === "objective:renamed-battle")?.current).toBe(1);
    expect(progressed.objectives.find((objective) => objective.id === "quest:win-battle")?.current).toBe(0);
  });

  it("fails closed for non-lead dungeon facts while keeping successor shrines renewable", () => {
    const successor = createQuest("quest-rule-binding", 2, 14);
    const unboundDungeon: QuestProgressFact = {
      schemaVersion: 1,
      kind: "dungeon-completed",
      dungeonId: "dungeon:other",
      locationId: "location:other",
      binding: "unbound",
    };
    const unchanged = applyQuestProgressFact(successor, unboundDungeon);
    expect(unchanged.subquests[0]?.objectives[0]?.current).toBe(0);
    const lead = applyQuestProgressFact(unchanged, { ...unboundDungeon, dungeonId: "dungeon:lead", binding: "quest-lead" });
    expect(lead.subquests[0]?.objectives[0]?.current).toBe(1);
    const shrine = applyQuestProgressFact(lead, {
      schemaVersion: 1,
      kind: "dungeon-feature-discovered",
      dungeonId: "dungeon:other",
      locationId: "location:other",
      cellId: "cell:shrine",
      feature: "shrine",
      binding: "unbound",
    });
    expect(shrine.subquests[0]?.objectives[1]?.current).toBe(1);
  });

  it("advances every matching active rule once, caps targets, and rejects malformed facts", () => {
    const initial = createQuest("quest-rule-multi");
    const battle = initial.objectives.find((objective) => objective.rule.kind === "win-combat")!;
    const duplicated = { ...initial, objectives: [...initial.objectives, { ...battle, id: "objective:second-battle" }] };
    const fact: QuestProgressFact = {
      schemaVersion: 1,
      kind: "combat-won",
      combatId: "combat:multi",
      defeatedSpeciesIds: ["species:a"],
    };
    const once = applyQuestProgressFact(duplicated, fact);
    expect(once.objectives.filter((objective) => objective.rule.kind === "win-combat").map((objective) => objective.current)).toEqual([1, 1]);
    expect(applyQuestProgressFact(once, fact).objectives.filter((objective) => objective.rule.kind === "win-combat").map((objective) => objective.current)).toEqual([1, 1]);
    expect(applyQuestProgressFact({ ...initial, status: "fulfilled" }, fact)).toEqual({ ...initial, status: "fulfilled" });
    expect(() => applyQuestProgressFact(initial, { ...fact, extra: true } as unknown as QuestProgressFact)).toThrow("malformed");
    expect(() => applyQuestProgressFact(initial, { ...fact, defeatedSpeciesIds: ["species:a", "species:a"] })).toThrow("malformed");
    expect(isValidQuestObjectiveRule({ ...battle.rule, extra: true })).toBe(false);
  });

  it("generates stable, source-keyed equipment rewards", () => {
    const loot = generateLoot("loot-seed", "dungeon:cell:3,4");
    expect(generateLoot("loot-seed", "dungeon:cell:3,4")).toEqual(loot);
    expect(generateLoot("loot-seed", "combat:guardian")).not.toEqual(loot);
    expect(loot.kind).toBe("equipment");
    expect(loot.slot).not.toBeNull();
  });

  it("rejects malformed hero progression, inventory, equipment, attributes, and resources", () => {
    const hero = createHero("hero-invariants", "hero:invariants", "Rhea Moss");
    expect(isValidDetailedHeroState(hero)).toBe(true);
    const corruptions: readonly ((candidate: Record<string, any>) => void)[] = [
      (candidate) => { candidate.className = "Chronomancer"; },
      (candidate) => { candidate.level = 50; },
      (candidate) => { candidate.experience = 12; },
      (candidate) => { candidate.gold = -1; },
      (candidate) => { candidate.inventory[0].id = ""; },
      (candidate) => { candidate.inventory.push({ ...candidate.inventory[0] }); },
      (candidate) => {
        candidate.inventory = Array.from({ length: inventoryCapacity + 1 }, (_, index) => ({
          id: `overflow:${index}`,
          name: `Overflow ${index}`,
          kind: "key",
          slot: null,
          rarity: "common",
          quantity: 1,
          modifiers: {},
        }));
        candidate.equipment.weapon = null;
      },
      (candidate) => { candidate.inventory[0].quantity = 2; },
      (candidate) => { candidate.inventory[1].quantity = 0; },
      (candidate) => { candidate.inventory[1].kind = "artifact"; },
      (candidate) => { candidate.inventory[1].rarity = "mythic"; },
      (candidate) => { candidate.inventory[0].modifiers.power = -1; },
      (candidate) => { candidate.inventory[0].modifiers.power = 101; },
      (candidate) => { candidate.inventory[0].modifiers.mystery = 1; },
      (candidate) => { delete candidate.equipment.feet; },
      (candidate) => { candidate.equipment.ring = null; },
      (candidate) => { candidate.equipment.body = candidate.equipment.weapon; },
      (candidate) => { candidate.equipment.weapon = candidate.inventory[1].id; },
      (candidate) => { candidate.equipment.weapon = "unowned:item"; },
      (candidate) => { delete candidate.attributes.spirit; },
      (candidate) => { candidate.attributes.strength = 1.5; },
      (candidate) => { candidate.resources.maxHealth += 1; },
      (candidate) => { candidate.resources.health = candidate.resources.maxHealth + 1; },
      (candidate) => { candidate.resources.mana = -1; },
      (candidate) => { delete candidate.resources.maxMana; },
      (candidate) => { candidate.abilities.push({ ...candidate.abilities[0] }); },
      (candidate) => { candidate.abilities[0].level = 2; },
      (candidate) => { candidate.abilities[0].kind = "ritual"; },
      (candidate) => { candidate.monsterLore = [{ monsterId: "", monsterName: "Wolf" }]; },
    ];
    for (const corrupt of corruptions) {
      const candidate = JSON.parse(JSON.stringify(hero));
      corrupt(candidate);
      expect(isValidDetailedHeroState(candidate)).toBe(false);
    }
  });

  it("derives bounded hero levels and mastery from experience at exact thresholds", () => {
    expect([
      0, 11, 12, 13, 47, 48, 49, 107, 108, 109,
    ].map((experience) => heroLevelForExperience(experience))).toEqual([
      1, 1, 2, 2, 2, 3, 3, 3, 4, 4,
    ]);
    expect(heroExperienceFloor(1)).toBe(0);
    expect(heroExperienceFloor(2)).toBe(12);
    expect(heroExperienceFloor(3)).toBe(48);
    expect(heroNextLevelRequirement(1)).toBe(12);
    expect(heroNextLevelRequirement(2)).toBe(48);
    expect(heroNextLevelRequirement(3)).toBe(108);
    expect(heroLevelForExperience(12 * 49 ** 2)).toBe(50);
    expect(heroNextLevelRequirement(50)).toBe(30_000);
    expect(heroLevelForExperience(12 * (maximumHeroLevel - 1) ** 2 - 1)).toBe(maximumHeroLevel - 1);
    expect(heroLevelForExperience(12 * (maximumHeroLevel - 1) ** 2)).toBe(maximumHeroLevel);
    expect(heroLevelForExperience(Number.MAX_SAFE_INTEGER)).toBe(maximumHeroLevel);
    expect(heroNextLevelRequirement(maximumHeroLevel)).toBeNull();
    expect(heroMasteryForExperience(249)).toBe(0);
    expect(heroMasteryForExperience(250)).toBe(1);
  });

  it("keeps Eternal levels above 50 prestigious without multiplying combat danger", () => {
    const base = createHero("eternal-balance", "hero:eternal-balance", "Rhea Moss");
    const level50 = { ...base, level: 50, experience: heroExperienceFloor(50) };
    const level1000 = { ...base, level: maximumHeroLevel, experience: heroExperienceFloor(maximumHeroLevel) };

    expect(maximumHeroMechanicalLevel).toBe(50);
    expect([49, 50, 51, maximumHeroLevel].map(heroMechanicalLevel)).toEqual([49, 50, 50, 50]);
    expect(derivedStats(level1000)).toEqual(derivedStats(level50));
    expect(createCombat("eternal-balance", level1000, "encounter:eternal-balance", 2))
      .toEqual(createCombat("eternal-balance", level50, "encounter:eternal-balance", 2));
    expect(() => heroMechanicalLevel(0)).toThrow("outside progression bounds");
    expect(() => heroMechanicalLevel(maximumHeroLevel + 1)).toThrow("outside progression bounds");
  });

  it("applies cumulative XP atomically across every crossed threshold and saturation", () => {
    const initial = createHero("hero-level-transition", "hero:level-transition", "Rhea Moss");
    const staged = { ...initial, experience: 11, level: 1 };
    const jumped = applyHeroExperience(staged, 97);
    expect(jumped).toMatchObject({
      experienceBefore: 11,
      experienceDelta: 97,
      experienceAfter: 108,
      levelBefore: 1,
      levelAfter: 4,
      hero: { experience: 108, level: 4 },
    });
    expect(jumped.hero.inventory).toEqual(initial.inventory);
    expect(jumped.hero.resources).toEqual(initial.resources);

    const capped = { ...initial, experience: Number.MAX_SAFE_INTEGER, level: maximumHeroLevel };
    expect(applyHeroExperience(capped, 25)).toMatchObject({
      experienceBefore: Number.MAX_SAFE_INTEGER,
      experienceDelta: 0,
      experienceAfter: Number.MAX_SAFE_INTEGER,
      levelBefore: maximumHeroLevel,
      levelAfter: maximumHeroLevel,
    });
    expect(() => applyHeroExperience(staged, -1)).toThrow("nonnegative safe integer");
    expect(() => applyHeroExperience({ ...staged, level: 2 }, 1)).toThrow("level invariants");
  });

  it("rejects malformed quest identities, progress, and nested status propagation", () => {
    const quest = createQuest("quest-invariants");
    expect(isValidQuestState(quest)).toBe(true);
    const corruptions: readonly ((candidate: Record<string, any>) => void)[] = [
      (candidate) => { candidate.id = ""; },
      (candidate) => { candidate.status = "complete"; },
      (candidate) => { candidate.objectives = []; },
      (candidate) => { candidate.objectives[0].id = candidate.objectives[1].id; },
      (candidate) => { candidate.objectives[0].target = 0; },
      (candidate) => { candidate.objectives[0].current = candidate.objectives[0].target + 1; },
      (candidate) => { candidate.objectives[0].status = "complete"; },
      (candidate) => {
        candidate.objectives[0].current = candidate.objectives[0].target;
        candidate.objectives[0].status = "active";
      },
      (candidate) => { candidate.objectives[0].status = "abandoned"; },
      (candidate) => { candidate.subquests[1].id = candidate.subquests[0].id; },
      (candidate) => { candidate.subquests[0].objectives = []; },
      (candidate) => { candidate.subquests[0].status = "complete"; },
      (candidate) => { candidate.subquests[0].objectives[0].id = candidate.objectives[0].id; },
      (candidate) => {
        candidate.subquests[0].objectives[0].status = "failed";
        candidate.subquests[0].status = "failed";
      },
    ];
    for (const corrupt of corruptions) {
      const candidate = JSON.parse(JSON.stringify(quest));
      corrupt(candidate);
      expect(isValidQuestState(candidate)).toBe(false);
    }
    const failed = JSON.parse(JSON.stringify(quest));
    failed.subquests[0].objectives[0].status = "failed";
    failed.subquests[0].status = "failed";
    failed.status = "failed";
    expect(isValidQuestState(failed)).toBe(true);
  });
});

describe("multi-turn tactical combat", () => {
  it("emits byte-identical canonical intent and damage events across JSON replay", () => {
    const hero = createHero("combat-events", "hero:combat-events", "Sera Flint");
    const combat = createCombat("combat-events", hero, "encounter:combat-events", 1);
    const actorId = combat.turnOrder[combat.activeIndex];
    const actor = combat.combatants.find((entry) => entry.id === actorId);
    const target = combat.combatants.find((entry) => entry.side !== actor?.side);
    if (actor === undefined || target === undefined) throw new Error("Combat event fixture lacks actors");
    const durableCombat: CombatState = {
      ...combat,
      combatants: combat.combatants.map((entry) => ({ ...entry, health: 999, maxHealth: 999 })),
    };
    const durableTarget = durableCombat.combatants.find((entry) => entry.id === target.id);
    if (durableTarget === undefined) throw new Error("Combat event fixture lost its target");
    const action: CombatAction = { actorId: actor.id, type: "attack", targetId: target.id, abilityId: null };
    const resolved = resolveCombatTurn(durableCombat, action, "combat-events");
    const replayed = resolveCombatTurn(JSON.parse(JSON.stringify(durableCombat)), action, "combat-events");
    const events = resolved.eventStream.events;

    expect(replayed).toEqual(resolved);
    expect(events.map((event) => event.kind)).toEqual(["intent", "damage"]);
    expect(events.map((event) => event.id)).toEqual([
      `${combat.id}:1:0`,
      `${combat.id}:1:1`,
    ]);
    expect(events[1]).toMatchObject({
      actorId: actor.id,
      targetId: target.id,
      healthBefore: durableTarget.health,
      healthAfter: resolved.combatants.find((entry) => entry.id === target.id)?.health,
      guarded: false,
      critical: false,
    });
    expect(isValidCombatState(resolved)).toBe(true);
  });

  it("orders guarded ability cost, damage, and status application with exact deltas", () => {
    const hero = createHero("combat-ability-events", "hero:ability-events", "Tarin Coil");
    const created = createCombat("combat-ability-events", hero, "encounter:ability-events", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const target = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || target === undefined) throw new Error("Ability event fixture lacks actors");
    const ability = {
      id: "ability:event:ember-bind",
      name: "Ember Bind",
      kind: "spell" as const,
      effect: "burning" as const,
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: null,
    };
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, target.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id
        ? { ...entry, mana: 5, maxMana: Math.max(5, entry.maxMana), abilities: [...entry.abilities, ability] }
        : { ...entry, statuses: [{ kind: "guarding", duration: 1, potency: 50 }] }),
    };
    const beforeHero = combat.combatants.find((entry) => entry.id === heroUnit.id);
    const beforeTarget = combat.combatants.find((entry) => entry.id === target.id);
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "ability",
      targetId: target.id,
      abilityId: ability.id,
    }, "combat-ability-events");
    const packet = resolved.eventStream.events;
    const mana = packet.find((event) => event.kind === "mana-spent");
    const damage = packet.find((event) => event.kind === "damage");
    const applied = packet.find((event) => event.kind === "status-applied" && event.status === "burning");

    expect(packet.map((event) => event.kind)).toEqual([
      "intent",
      "mana-spent",
      "damage",
      "status-applied",
    ]);
    expect(mana).toMatchObject({ manaBefore: beforeHero?.mana, amount: 2, manaAfter: (beforeHero?.mana ?? 0) - 2 });
    expect(damage).toMatchObject({
      healthBefore: beforeTarget?.health,
      healthAfter: resolved.combatants.find((entry) => entry.id === target.id)?.health,
      guarded: true,
    });
    expect(applied).toMatchObject({ potencyBefore: null, durationBefore: null, durationAfter: 2 });
    expect(isValidCombatState(resolved)).toBe(true);
  });

  it("expires lethal damage-over-time before action effects and records defeat then outcome", () => {
    const hero = createHero("combat-status-events", "hero:status-events", "Mira Ash");
    const created = createCombat("combat-status-events", hero, "encounter:status-events", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Status event fixture lacks actors");
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, enemy.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id
        ? { ...entry, health: 2, statuses: [{ kind: "poisoned", duration: 1, potency: 3 }] }
        : entry),
    };
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "attack",
      targetId: enemy.id,
      abilityId: null,
    }, "combat-status-events");

    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual([
      "intent",
      "status-expired",
      "defeated",
      "outcome",
    ]);
    expect(resolved.eventStream.events[1]).toMatchObject({
      status: "poisoned",
      durationBefore: 1,
      durationAfter: 0,
      healthBefore: 2,
      amount: 2,
      healthAfter: 0,
    });
    expect(resolved.outcome).toBe("defeat");
    expect(resolved.eventStream.events.some((event) => event.kind === "damage")).toBe(false);
    expect(isValidCombatState(resolved)).toBe(true);
    expect(isValidCombatState({
      ...resolved,
      eventStream: {
        ...resolved.eventStream,
        events: resolved.eventStream.events.map((event) => event.kind === "status-expired"
          ? { ...event, durationBefore: 2 }
          : event),
      },
    })).toBe(false);
  });

  it("orders finishing damage before defeat and terminal outcome exactly once", () => {
    const hero = createHero("combat-finish-events", "hero:finish-events", "Ilya Thorn");
    const created = createCombat("combat-finish-events", hero, "encounter:finish-events", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Finish event fixture lacks actors");
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, enemy.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id
        ? { ...entry, power: 999 }
        : { ...entry, health: 1, maxHealth: Math.max(1, entry.maxHealth) }),
    };
    const resolved = resolveCombatTurn(combat, { actorId: heroUnit.id, type: "attack", targetId: enemy.id, abilityId: null }, "combat-finish-events");

    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual(["intent", "damage", "defeated", "outcome"]);
    expect(resolved.eventStream.events.filter((event) => event.kind === "defeated")).toHaveLength(1);
    expect(resolved.eventStream.events.filter((event) => event.kind === "outcome")).toHaveLength(1);
    expect(resolved.outcome).toBe("victory");
    expect(isValidCombatState(resolved)).toBe(true);
    expect(isValidCombatState({
      ...resolved,
      eventStream: {
        ...resolved.eventStream,
        events: resolved.eventStream.events.map((event) => event.kind === "outcome"
          ? { ...event, targetId: heroUnit.id }
          : event),
      },
    })).toBe(false);
  });

  it("records guard as intent followed by the exact guarding status", () => {
    const hero = createHero("combat-guard-events", "hero:guard-events", "Lio Reed");
    const combat = createCombat("combat-guard-events", hero, "encounter:guard-events", 1);
    const actorId = combat.turnOrder[combat.activeIndex];
    if (actorId === undefined) throw new Error("Guard fixture lacks an active actor");
    const resolved = resolveCombatTurn(combat, { actorId, type: "guard", targetId: null, abilityId: null }, "combat-guard-events");

    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual(["intent", "status-applied"]);
    expect(resolved.eventStream.events[1]).toMatchObject({
      actorId,
      targetId: actorId,
      status: "guarding",
      potencyAfter: 50,
      durationAfter: 1,
    });
    expect(isValidCombatState(resolved)).toBe(true);
  });

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
    expect(combat.eventStream.events.length).toBeLessThanOrEqual(maximumCombatEvents);
    const retainedTurns = [...new Set(combat.eventStream.events.map((event) => event.turn))];
    for (const turn of retainedTurns) {
      const packet = combat.eventStream.events.filter((event) => event.turn === turn);
      expect(packet.length).toBeLessThanOrEqual(maximumCombatEventsPerTurn);
      expect(packet[0]?.kind).toBe("intent");
      expect(packet.map((event) => event.ordinal)).toEqual(packet.map((_, ordinal) => ordinal));
    }
    expect(combat.eventStream.events.at(-1)?.kind).toBe("outcome");
    expect(combat.combatants.every((entry) => entry.statuses.length <= 8)).toBe(true);
    expect(isValidCombatState(combat)).toBe(true);
  });

  it("rejects corrupted combat resources, references, event arithmetic, IDs, order, and status sets", () => {
    const hero = createHero("combat-corruption", "hero:combat-corruption", "Nessa Vale");
    const created = createCombat("combat-corruption", hero, "encounter:corruption", 1);
    const actorId = created.turnOrder[created.activeIndex];
    const actor = created.combatants.find((entry) => entry.id === actorId);
    const target = created.combatants.find((entry) => entry.side !== actor?.side);
    if (actor === undefined || target === undefined) throw new Error("Corruption fixture lacks actors");
    const valid = resolveCombatTurn(created, { actorId: actor.id, type: "attack", targetId: target.id, abilityId: null }, "combat-corruption");
    const events = valid.eventStream.events;
    const damageIndex = events.findIndex((event) => event.kind === "damage");
    if (damageIndex < 0) throw new Error("Corruption fixture lacks damage");

    const replaceDamage = (replacement: Record<string, unknown>): CombatState => ({
      ...valid,
      eventStream: {
        ...valid.eventStream,
        events: events.map((event, index) => index === damageIndex ? { ...event, ...replacement } as typeof event : event),
      },
    });
    expect(isValidCombatState(valid)).toBe(true);
    expect(isValidCombatState({ ...valid, combatants: valid.combatants.map((entry, index) => index === 0 ? { ...entry, health: entry.maxHealth + 1 } : entry) })).toBe(false);
    expect(isValidCombatState({ ...valid, turnOrder: [valid.turnOrder[0], valid.turnOrder[0]] })).toBe(false);
    expect(isValidCombatState({
      ...valid,
      combatants: valid.combatants.map((entry, index) => index === 0
        ? { ...entry, statuses: [{ kind: "burning", duration: 1, potency: 1 }, { kind: "burning", duration: 2, potency: 2 }] }
        : entry),
    })).toBe(false);
    expect(isValidCombatState(replaceDamage({ targetId: "missing" }))).toBe(false);
    expect(isValidCombatState(replaceDamage({ abilityId: "forged:ability" }))).toBe(false);
    expect(isValidCombatState(replaceDamage({ amount: 999 }))).toBe(false);
    expect(isValidCombatState(replaceDamage({ id: `${valid.id}:1:99` }))).toBe(false);
    expect(isValidCombatState({ ...valid, eventStream: { ...valid.eventStream, events: [...events].reverse() } })).toBe(false);
    expect(isValidCombatState({ ...valid, eventStream: { ...valid.eventStream, events: events.slice(1) } })).toBe(false);
    const intent = events[0];
    const damage = events[damageIndex];
    if (intent === undefined || damage === undefined) throw new Error("Corruption fixture lost its packet");
    const duplicateStatusEvents = [
      intent,
      {
        id: `${valid.id}:1:1`,
        turn: 1,
        ordinal: 1,
        kind: "status-tick" as const,
        actorId: actor.id,
        targetId: actor.id,
        status: "weakened" as const,
        potency: 1,
        durationBefore: 2,
        durationAfter: 1,
        healthBefore: actor.health,
        amount: 0,
        healthAfter: actor.health,
      },
      {
        id: `${valid.id}:1:2`,
        turn: 1,
        ordinal: 2,
        kind: "status-tick" as const,
        actorId: actor.id,
        targetId: actor.id,
        status: "weakened" as const,
        potency: 1,
        durationBefore: 2,
        durationAfter: 1,
        healthBefore: actor.health,
        amount: 0,
        healthAfter: actor.health,
      },
      { ...damage, id: `${valid.id}:1:3`, ordinal: 3 },
    ];
    expect(isValidCombatState({
      ...valid,
      eventStream: { ...valid.eventStream, events: duplicateStatusEvents },
    })).toBe(false);

    const ability = actor.abilities.find((entry) => entry.manaCost <= actor.mana);
    if (ability === undefined) throw new Error("Corruption fixture lacks a usable ability");
    const abilityCombat = resolveCombatTurn(created, {
      actorId: actor.id,
      type: "ability",
      targetId: target.id,
      abilityId: ability.id,
    }, "combat-corruption");
    const abilityEvents = abilityCombat.eventStream.events;
    const manaIndex = abilityEvents.findIndex((event) => event.kind === "mana-spent");
    const abilityDamageIndex = abilityEvents.findIndex((event) => event.kind === "damage");
    if (manaIndex < 0 || abilityDamageIndex < 0) throw new Error("Corruption fixture lacks ability consequences");
    const reordered = abilityEvents.map((event, index) => {
      const source = index === manaIndex
        ? abilityEvents[abilityDamageIndex]
        : index === abilityDamageIndex
          ? abilityEvents[manaIndex]
          : event;
      if (source === undefined) throw new Error("Missing reordered event");
      return { ...source, id: `${abilityCombat.id}:1:${index}`, ordinal: index };
    });
    expect(isValidCombatState({
      ...abilityCombat,
      eventStream: { ...abilityCombat.eventStream, events: reordered },
    })).toBe(false);
    expect(isValidCombatState({
      ...abilityCombat,
      eventStream: {
        ...abilityCombat.eventStream,
        events: abilityEvents.map((event) => event.kind === "mana-spent" ? { ...event, amount: event.amount + 1, manaAfter: event.manaAfter - 1 } : event),
      },
    })).toBe(false);

    const forgedGap = {
      ...valid,
      turn: valid.turn + 1,
      eventStream: { ...valid.eventStream, events },
    };
    expect(isValidCombatState(forgedGap)).toBe(false);
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
