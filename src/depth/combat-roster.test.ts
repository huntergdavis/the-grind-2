import { describe, expect, it } from "vitest";
import { createCombat, resolveCombatTurn } from "./combat";
import { projectCombatRoster } from "./combat-roster";
import { createHero } from "./rpg";
import type { AbilityState, CombatState, CombatantState } from "./types";

function unit(
  id: string,
  side: CombatantState["side"],
  health: number,
  initiative: number,
): CombatantState {
  return {
    id,
    name: id.toUpperCase(),
    side,
    health,
    maxHealth: 20,
    mana: 5,
    maxMana: 5,
    power: 8,
    armor: 2,
    initiative,
    statuses: [],
    speciesId: side === "enemies" ? id : null,
    abilities: [],
  };
}

function scheduledCombat(): CombatState {
  return {
    id: "scheduled",
    round: 3,
    turn: 7,
    activeIndex: 2,
    turnOrder: ["hero", "enemy:dead", "enemy:living"],
    combatants: [
      unit("hero", "heroes", 20, 12),
      unit("enemy:dead", "enemies", 0, 10),
      unit("enemy:living", "enemies", 20, 8),
    ],
    outcome: "ongoing",
    log: [],
    eventStream: { schemaVersion: 2, firstRecordedTurn: 8, events: [] },
    threat: { schemaVersion: 1, rating: "legacy-unrated" },
    weaponUse: { schemaVersion: 1, tracking: "legacy-untracked" },
  };
}

describe("combat roster projection", () => {
  for (const enemyCount of [1, 3, 5]) {
    it(`projects exact units and three upcoming living turns for ${enemyCount} enemies`, () => {
      const hero = createHero(`roster:${enemyCount}`, `hero:${enemyCount}`, `Hero ${enemyCount}`);
      const combat = createCombat(`roster:${enemyCount}`, hero, `encounter:${enemyCount}`, enemyCount);
      const activeId = combat.turnOrder[combat.activeIndex];
      const projection = projectCombatRoster(combat);
      const expectedUnitIds = [...combat.combatants].sort((left, right) => {
        const sideOrder = (left.side === "heroes" ? 0 : 1) - (right.side === "heroes" ? 0 : 1);
        return sideOrder || combat.turnOrder.indexOf(left.id) - combat.turnOrder.indexOf(right.id);
      }).map((entry) => entry.id);

      expect(projection).not.toBeNull();
      expect(projection?.units).toHaveLength(enemyCount + 1);
      expect(projection?.units.map((entry) => entry.id)).toEqual(expectedUnitIds);
      expect(projection?.units.map((entry) => entry.turnOrderIndex)).toEqual(
        expectedUnitIds.map((id) => combat.turnOrder.indexOf(id)),
      );
      expect(projection?.activeUnitId).toBe(activeId);
      expect(projection?.upcomingTurns).toHaveLength(3);
      expect(projection?.upcomingTurns[0]?.unitId).toBe(activeId);
      expect(projection?.upcomingTurns.every((entry) => combat.combatants.find((unit) => unit.id === entry.unitId)?.health !== 0)).toBe(true);
      expect(projectCombatRoster(JSON.parse(JSON.stringify(combat)))).toEqual(projection);
    });
  }

  it("retains dead units, skips them in scheduling, and reports round wraps", () => {
    const combat = scheduledCombat();
    const projection = projectCombatRoster(combat);

    expect(projection?.units.find((entry) => entry.id === "enemy:dead")).toMatchObject({ alive: false, isActive: false });
    expect(projection?.upcomingTurns).toEqual([
      { slot: 1, unitId: "enemy:living", unitName: "ENEMY:LIVING", side: "enemies", turnOrderIndex: 2, round: 3 },
      { slot: 2, unitId: "hero", unitName: "HERO", side: "heroes", turnOrderIndex: 0, round: 4 },
      { slot: 3, unitId: "enemy:living", unitName: "ENEMY:LIVING", side: "enemies", turnOrderIndex: 2, round: 4 },
    ]);
  });

  it("is independent of serialized combatant array order", () => {
    const combat = scheduledCombat();
    const reordered: CombatState = {
      ...combat,
      combatants: [combat.combatants[2]!, combat.combatants[0]!, combat.combatants[1]!],
    };

    expect(projectCombatRoster(reordered)).toEqual(projectCombatRoster(combat));
    expect(projectCombatRoster(reordered)?.units.map((entry) => entry.id)).toEqual([
      "hero",
      "enemy:dead",
      "enemy:living",
    ]);
  });

  it("focuses guard on its actor as a self effect", () => {
    const hero = createHero("roster:guard", "hero:guard", "Lio Reed");
    const created = createCombat("roster:guard", hero, "encounter:guard", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Guard roster fixture lacks combatants");
    const combat: CombatState = { ...created, activeIndex: 0, turnOrder: [heroUnit.id, enemy.id] };
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "guard",
      targetId: null,
      abilityId: null,
      itemId: null,
    }, "roster:guard");
    const projection = projectCombatRoster(resolved);

    expect(projection).toMatchObject({
      intentTargetId: null,
      focusTargetId: heroUnit.id,
      focusKind: "self-effect",
      latestTurn: { actorId: heroUnit.id, action: "guard", targetId: heroUnit.id },
    });
    expect(projection?.units.find((entry) => entry.id === heroUnit.id)).toMatchObject({
      actedLast: true,
      wasIntentTarget: false,
      isFocused: true,
      statuses: [{ kind: "guarding", duration: 1, potency: 50 }],
    });
  });

  it("focuses a restorative on its actor as a self effect", () => {
    const hero = createHero("roster:restorative", "hero:restorative", "Ari Moss");
    const tonic = hero.inventory.find((item) => item.restorative !== null);
    const created = createCombat("roster:restorative", hero, "encounter:restorative", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined || tonic === undefined) {
      throw new Error("Restorative roster fixture lacks combatants or tonic");
    }
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, enemy.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id ? { ...entry, health: 5 } : entry),
    };
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "item",
      targetId: heroUnit.id,
      abilityId: null,
      itemId: tonic.id,
    }, "roster:restorative", tonic);
    const projection = projectCombatRoster(resolved);

    expect(projection).toMatchObject({
      intentTargetId: heroUnit.id,
      focusTargetId: heroUnit.id,
      focusKind: "self-effect",
      latestTurn: {
        actorId: heroUnit.id,
        action: "item",
        targetId: heroUnit.id,
        restorative: { itemId: tonic.id, targetId: heroUnit.id },
      },
    });
    expect(projection?.units.find((entry) => entry.id === heroUnit.id)).toMatchObject({
      actedLast: true,
      wasIntentTarget: true,
      isFocused: true,
    });
  });

  it("links an ability, cost, result, focus, statuses, and defeat to exact units", () => {
    const hero = createHero("roster:ability", "hero:ability", "Mira Ash");
    const created = createCombat("roster:ability", hero, "encounter:ability", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Ability roster fixture lacks combatants");
    const ability: AbilityState = {
      id: "ability:roster:ember-bind",
      name: "Ember Bind",
      kind: "spell",
      effect: "burning",
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 99,
      sourceMonsterId: null,
    };
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, enemy.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id
        ? {
            ...entry,
            mana: 5,
            maxMana: Math.max(5, entry.maxMana),
            statuses: [{ kind: "poisoned" as const, duration: 2, potency: 1 }],
            abilities: [...entry.abilities, ability],
          }
        : { ...entry, health: 1 }),
    };
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "ability",
      targetId: enemy.id,
      abilityId: ability.id,
      itemId: null,
    }, "roster:ability");
    const projection = projectCombatRoster(resolved);
    const projectedHero = projection?.units.find((entry) => entry.id === heroUnit.id);
    const projectedEnemy = projection?.units.find((entry) => entry.id === enemy.id);

    expect(projection).toMatchObject({
      activeUnitId: null,
      intentTargetId: enemy.id,
      focusTargetId: enemy.id,
      focusKind: "action-target",
      upcomingTurns: [],
      latestTurn: {
        actorId: heroUnit.id,
        targetId: enemy.id,
        action: "ability",
        actionLabel: ability.name,
        abilityId: ability.id,
        abilityName: ability.name,
        intentInterrupted: false,
        outcome: "victory",
      },
    });
    expect(projection?.latestTurn?.mana).toMatchObject({ manaBefore: 5, amount: 2, manaAfter: 3 });
    expect(projection?.latestTurn?.damage).toMatchObject({ targetId: enemy.id, healthBefore: 1, healthAfter: 0 });
    expect(projection?.latestTurn?.statusEvents.map((event) => [event.kind, event.status, event.durationAfter])).toEqual([
      ["status-tick", "poisoned", 1],
      ["status-applied", "burning", 2],
    ]);
    expect(projectedHero).toMatchObject({ actedLast: true, isFocused: false, statuses: [{ kind: "poisoned", duration: 1, potency: 1 }] });
    expect(projectedEnemy).toMatchObject({ alive: false, wasIntentTarget: true, isFocused: true, defeatedLastTurn: true });
  });

  it("focuses lethal start-turn damage without pretending the intent executed", () => {
    const hero = createHero("roster:interrupted", "hero:interrupted", "Corin Vale");
    const created = createCombat("roster:interrupted", hero, "encounter:interrupted", 1);
    const heroUnit = created.combatants.find((entry) => entry.side === "heroes");
    const enemy = created.combatants.find((entry) => entry.side === "enemies");
    if (heroUnit === undefined || enemy === undefined) throw new Error("Interrupted roster fixture lacks combatants");
    const combat: CombatState = {
      ...created,
      activeIndex: 0,
      turnOrder: [heroUnit.id, enemy.id],
      combatants: created.combatants.map((entry) => entry.id === heroUnit.id
        ? { ...entry, health: 2, statuses: [{ kind: "poisoned" as const, duration: 1, potency: 3 }] }
        : entry),
    };
    const resolved = resolveCombatTurn(combat, {
      actorId: heroUnit.id,
      type: "attack",
      targetId: enemy.id,
      abilityId: null,
      itemId: null,
    }, "roster:interrupted");
    const projection = projectCombatRoster(resolved);

    expect(projection).toMatchObject({
      outcome: "defeat",
      activeUnitId: null,
      intentTargetId: enemy.id,
      focusTargetId: heroUnit.id,
      focusKind: "self-effect",
      upcomingTurns: [],
      latestTurn: { actorId: heroUnit.id, targetId: enemy.id, intentInterrupted: true, damage: null, mana: null },
    });
    expect(projection?.units.find((entry) => entry.id === heroUnit.id)).toMatchObject({
      alive: false,
      actedLast: true,
      wasIntentTarget: false,
      isFocused: true,
      defeatedLastTurn: true,
    });
    expect(projection?.units.find((entry) => entry.id === enemy.id)?.wasIntentTarget).toBe(true);
  });

  it("shows a new combat roster without inventing resolved action facts", () => {
    const combat = scheduledCombat();
    const projection = projectCombatRoster(combat);

    expect(projection).toMatchObject({
      activeUnitId: "enemy:living",
      intentTargetId: null,
      focusTargetId: null,
      focusKind: "none",
      latestTurn: null,
    });
  });

  it("fails closed on broken roster references and an unavailable ongoing actor", () => {
    const valid = scheduledCombat();
    expect(projectCombatRoster({ ...valid, turnOrder: ["hero", "enemy:dead", "missing"] })).toBeNull();
    expect(projectCombatRoster({ ...valid, turnOrder: ["hero", "hero", "enemy:living"] })).toBeNull();
    expect(projectCombatRoster({ ...valid, activeIndex: 99 })).toBeNull();
    expect(projectCombatRoster({ ...valid, activeIndex: 1 })).toBeNull();
  });
});
