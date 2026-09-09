import { describe, expect, it, vi } from "vitest";
import { createCombat, resolveCombatTurn } from "../depth/combat";
import type { AbilityState, CombatAction, CombatState, CombatStatus } from "../depth/types";
import { actorPolicy } from "./actor-policy";
import { projectCombatActionForecast } from "./combat-action-forecast";
import * as rng from "./rng";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function guardedCombatWorld(targetHealth = 9, guarded = true): WorldState {
  // Reuse actor-policy.test.ts's real createCombat + active-hero fixture seam.
  const base = createWorld("read-the-guard", "campaign:read-the-guard");
  const created = createCombat(base.seed, base.depth.hero, "encounter:read-the-guard", 1);
  const heroIndex = created.turnOrder.indexOf(base.hero.id);
  if (heroIndex < 0) throw new Error("The real combat fixture needs the hero's turn");
  let combat: CombatState = {
    ...created,
    activeIndex: heroIndex,
    combatants: created.combatants.map((unit) => unit.side === "heroes"
      ? { ...unit, health: 1, mana: 0, power: 10, abilities: [], statuses: [] }
      : { ...unit, health: targetHealth, armor: 2, statuses: [] }),
  };
  if (guarded) {
    const enemy = combat.combatants.find((unit) => unit.side === "enemies");
    if (enemy === undefined) throw new Error("The real combat fixture needs its opponent");
    combat = resolveCombatTurn({ ...combat, activeIndex: combat.turnOrder.indexOf(enemy.id) }, {
      actorId: enemy.id, type: "guard", targetId: null, abilityId: null, itemId: null,
    }, base.seed);
    if (combat.turnOrder[combat.activeIndex] !== base.hero.id) throw new Error("The enemy's guard must yield to the hero");
  }
  return {
    ...base,
    hero: { ...base.hero, health: 1 },
    scene: { ...base.scene, mode: "battle", headline: "The opponent guards the next strike." },
    depth: {
      ...base.depth,
      hero: { ...base.depth.hero, resources: { ...base.depth.hero.resources, health: 1, mana: 0 } },
      // The isolated createCombat fixture has no place-bound threat context.
      legacyUnratedCombatIds: [combat.id],
      combat,
    },
  };
}

function attackContext(world: WorldState): { combat: CombatState; action: Extract<CombatAction, { type: "attack" }> } {
  const combat = world.depth.combat;
  const enemy = combat?.combatants.find((unit) => unit.side === "enemies");
  if (combat === null || enemy === undefined) throw new Error("The attack fixture requires live combat");
  return { combat, action: { actorId: world.hero.id, type: "attack", targetId: enemy.id, abilityId: null, itemId: null } };
}

function withActorStatuses(world: WorldState, statuses: readonly CombatStatus[]): WorldState {
  const { combat } = attackContext(world);
  return { ...world, depth: { ...world.depth, combat: {
    ...combat,
    combatants: combat.combatants.map((unit) => unit.id === world.hero.id ? { ...unit, statuses } : unit),
  } } };
}

describe("Read the Guard autonomous combat", () => {
  it("uses an emergency tonic when a guarded nine-HP enemy cannot be finished safely", () => {
    const before = guardedCombatWorld();
    const serialized = JSON.stringify(before);
    expect(upgradeWorldState(JSON.parse(serialized))).toEqual(before);
    const choice = actorPolicy(before, campaignDirector(before));
    expect(choice.trace.context).toBe("direCombat");
    expect(choice.trace.matchedRuleId).toBe("dire.restore");
    expect(choice.command).toMatchObject({ type: "combat-action", action: { type: "item" } });
    expect(choice.rationale).toContain("Guard prevents a guaranteed finish");
    if (choice.command.type !== "combat-action" || choice.command.action.type !== "item") throw new Error("Expected emergency tonic");
    const tonicId = choice.command.action.itemId;
    const tonic = before.depth.hero.inventory.find((item) => item.id === tonicId);
    expect(tonic?.quantity).toBe(3);
    const healthAfterTonic = 1 + Math.ceil(before.depth.hero.resources.maxHealth / 4);
    const after = advanceWorld(before);
    expect(after.depth.combat?.combatants.find((unit) => unit.side === "heroes")?.health).toBe(healthAfterTonic);
    expect(after.depth.hero.resources.health).toBe(healthAfterTonic);
    expect(after.depth.hero.inventory.find((item) => item.id === tonicId)?.quantity).toBe(2);
    expect(after.depth.combat?.combatants.find((unit) => unit.side === "enemies")?.health).toBe(9);
    expect(after.chronicle.at(-1)?.decisionTrace?.matchedRuleId).toBe("dire.restore");
    expect(advanceWorld(JSON.parse(serialized))).toEqual(after);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it.each([
    { targetHealth: 9, guarded: false },
    { targetHealth: 4, guarded: true },
  ])("preserves a genuine battle-ending finish at $targetHealth HP, guarded=$guarded", ({ targetHealth, guarded }) => {
    const before = guardedCombatWorld(targetHealth, guarded);
    const choice = actorPolicy(before, campaignDirector(before));
    expect(choice.trace.matchedRuleId).toBe("dire.safe-finish");
    expect(choice.command).toMatchObject({ type: "combat-action", action: { type: "attack" } });
  });

  it.each([
    { duration: 2, minimum: 2, maximum: 4, weakenedPotency: 4, rule: "dire.restore" },
    { duration: 1, minimum: 4, maximum: 6, weakenedPotency: 0, rule: "dire.safe-finish" },
  ])("accounts for weakness duration $duration before the strike rather than after it", ({ duration, minimum, maximum, weakenedPotency, rule }) => {
    const before = withActorStatuses(guardedCombatWorld(4), [{ kind: "weakened", duration, potency: 4 }]);
    const { combat, action } = attackContext(before);
    expect(projectCombatActionForecast(combat, action)).toMatchObject({
      minimumDamage: minimum, maximumDamage: maximum, guarded: true, weakenedPotency, actorHealthAfterStatuses: 1, canAct: true,
    });
    expect(actorPolicy(before, campaignDirector(before)).trace.matchedRuleId).toBe(rule);
    const resolved = resolveCombatTurn(combat, action, before.seed);
    const amount = resolved.log.findLast((entry) => entry.action === "attack")?.amount;
    expect(amount).toBeGreaterThanOrEqual(minimum);
    expect(amount).toBeLessThanOrEqual(maximum);
  });

  it("counts ability level and piercing armor before halving a guarded strike", () => {
    const base = guardedCombatWorld(7);
    const { combat, action } = attackContext(base);
    const ability: AbilityState = {
      id: "technique:read-the-guard", name: "Measured Thrust", kind: "technique", effect: "piercing",
      level: 4, experience: 54, uses: 0, manaCost: 2, potency: 3, sourceMonsterId: null,
    };
    const prepared: CombatState = { ...combat, combatants: combat.combatants.map((unit) => unit.side === "heroes"
      ? { ...unit, mana: 4, abilities: [ability] }
      : { ...unit, armor: 12 }) };
    const strike: CombatAction = { ...action, type: "ability", abilityId: ability.id, itemId: null };
    expect(projectCombatActionForecast(prepared, strike)).toMatchObject({
      minimumDamage: 7, maximumDamage: 9, unguardedMinimumDamage: 15, guarded: true, canAct: true,
    });
    const before = { ...base, depth: { ...base.depth, combat: prepared } };
    const choice = actorPolicy(before, campaignDirector(before));
    expect(choice.trace.matchedRuleId).toBe("dire.safe-finish");
    expect(choice.command).toEqual({ type: "combat-action", action: strike });
    const resolved = resolveCombatTurn(prepared, strike, before.seed);
    expect(resolved.combatants.find((unit) => unit.id === strike.targetId)?.health).toBe(0);
    const amount = resolved.log.findLast((entry) => entry.action === "ability")?.amount;
    expect(amount).toBeGreaterThanOrEqual(7);
    expect(amount).toBeLessThanOrEqual(9);
    expect(resolved.combatants.find((unit) => unit.id === base.hero.id)?.mana).toBe(2);
  });

  it.each(["poisoned", "burning"] as const)("never calls a strike safe when the final %s tick kills the actor first", (kind) => {
    const before = withActorStatuses(guardedCombatWorld(1, false), [{ kind, duration: 1, potency: 1 }]);
    const { combat, action } = attackContext(before);
    expect(projectCombatActionForecast(combat, action)).toMatchObject({
      minimumDamage: 0, maximumDamage: 0, actorHealthAfterStatuses: 0, canAct: false,
    });
    expect(actorPolicy(before, campaignDirector(before)).trace.matchedRuleId).not.toBe("dire.safe-finish");
    const resolved = resolveCombatTurn(combat, action, before.seed);
    expect(resolved.combatants.find((unit) => unit.id === before.hero.id)?.health).toBe(0);
    expect(resolved.combatants.find((unit) => unit.id === action.targetId)?.health).toBe(1);
    expect(resolved.eventStream.events.some((event) => event.kind === "damage")).toBe(false);
  });

  it("keeps the same public bounds and guaranteed classification without peeking at future seed variance", () => {
    // Six HP can fall to the maximum roll, but never qualifies as guaranteed.
    const before = guardedCombatWorld(6);
    const { combat, action } = attackContext(before);
    const serialized = JSON.stringify(combat);
    const randomInt = vi.spyOn(rng, "randomInt");
    try {
      const forecast = projectCombatActionForecast(combat, action);
      expect(forecast).toMatchObject({ minimumDamage: 4, maximumDamage: 6, unguardedMinimumDamage: 9, guarded: true, canAct: true });
      expect(projectCombatActionForecast(JSON.parse(serialized), action)).toEqual(forecast);
      expect(projectCombatActionForecast({ ...combat, id: "encounter:different-future-roll", turn: combat.turn + 17 }, action)).toEqual(forecast);
      expect(randomInt).not.toHaveBeenCalled();
      for (const seed of ["public-bounds:a", "public-bounds:b", "public-bounds:c"]) {
        const world = { ...before, seed };
        expect(actorPolicy(world, campaignDirector(world)).trace.matchedRuleId).toBe("dire.restore");
      }
      expect(randomInt.mock.calls.some((call) => call[2] === "combat-resolution")).toBe(false);
      expect(JSON.stringify(combat)).toBe(serialized);
    } finally {
      randomInt.mockRestore();
    }
  });
});
