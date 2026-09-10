import { describe, expect, it, vi } from "vitest";
import { createCombat, resolveCombatTurn } from "../depth/combat";
import type { AbilityState, CombatState, CombatStatus } from "../depth/types";
import { actorPolicy } from "./actor-policy";
import { projectCombatActionForecast } from "./combat-action-forecast";
import * as rng from "./rng";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function technique(id: string, manaCost: number, potency: number): AbilityState {
  return { id, name: id, kind: "technique", effect: "arcane", level: 1, experience: 0, uses: 0,
    manaCost, potency, sourceMonsterId: null };
}

function fixture(options: {
  abilities?: readonly AbilityState[]; enemyHealth?: number; enemyCount?: number; armor?: number;
  guarded?: boolean; critical?: boolean; statuses?: readonly CombatStatus[];
} = {}): WorldState {
  // Controlled arithmetic fixtures only; the final test retains actual class techniques.
  const base = createWorld("efficient-finisher", "campaign:efficient-finisher");
  const created = createCombat(base.seed, base.depth.hero, "encounter:efficient-finisher", options.enemyCount ?? 1);
  const enemies = created.combatants.filter((unit) => unit.side === "enemies");
  const health = options.critical === true ? 1 : base.depth.hero.resources.maxHealth;
  let combat: CombatState = {
    ...created, activeIndex: 0,
    turnOrder: options.guarded === true ? [enemies[0]!.id, base.hero.id, ...enemies.slice(1).map((unit) => unit.id)]
      : [base.hero.id, ...enemies.map((unit) => unit.id)],
    combatants: created.combatants.map((unit) => unit.id === base.hero.id
      ? { ...unit, power: 10, health, mana: 4, maxMana: Math.max(4, unit.maxMana), abilities: options.abilities ?? [], statuses: options.statuses ?? [] }
      : { ...unit, health: options.enemyHealth ?? 5, armor: options.armor ?? 2, statuses: [] }),
  };
  if (options.guarded === true) combat = resolveCombatTurn(combat, {
    actorId: enemies[0]!.id, type: "guard", targetId: null, abilityId: null, itemId: null,
  }, base.seed);
  return { ...base, hero: { ...base.hero, health, values: ["curiosity", "courage"] },
    scene: { ...base.scene, mode: "battle" },
    depth: { ...base.depth, legacyUnratedCombatIds: [combat.id], combat,
      hero: { ...base.depth.hero, resources: { ...base.depth.hero.resources, health, mana: 4 } } } };
}

function choice(world: WorldState) { return actorPolicy(world, campaignDirector(world)); }

function bounds(world: WorldState, abilityId: string | null): number {
  const combat = world.depth.combat!;
  const target = combat.combatants.find((unit) => unit.side === "enemies")!;
  return projectCombatActionForecast(combat, abilityId === null
    ? { actorId: world.hero.id, type: "attack", targetId: target.id, abilityId: null, itemId: null }
    : { actorId: world.hero.id, type: "ability", targetId: target.id, abilityId, itemId: null }).minimumDamage;
}

describe("Efficient battle-ending hero finish", () => {
  it("prefers lower MP even when the costlier guaranteed finish has less overkill", () => {
    const world = fixture({ enemyHealth: 15, abilities: [technique("costly-exact", 3, 5), technique("cheap-excess", 1, 9)] });
    expect(bounds(world, null)).toBe(9);
    expect(bounds(world, "costly-exact")).toBe(15);
    expect(bounds(world, "cheap-excess")).toBe(19);
    expect(choice(world).command).toMatchObject({ action: { type: "ability", abilityId: "cheap-excess" } });
    expect(choice(world).rationale).toContain("1 MP and 4 minimum overkill");
  });

  it("prefers less minimum overkill among equal-MP guaranteed techniques", () => {
    const world = fixture({ enemyHealth: 14, abilities: [technique("excess", 1, 9), technique("measured", 1, 5)] });
    expect(choice(world).command).toMatchObject({ action: { type: "ability", abilityId: "measured" } });
  });

  it("chooses a sufficient basic strike over a free excessive technique despite personality bonuses", () => {
    const world = fixture({ abilities: [technique("free-excess", 0, 4)] });
    expect(bounds(world, null)).toBe(9);
    expect(bounds(world, "free-excess")).toBe(14);
    expect(choice(world).trace.matchedRuleId).toBe("combat.finish");
    expect(choice(world).command).toMatchObject({ action: { type: "attack" } });
  });

  it("prefers basic on an exact zero-MP guarded damage tie", () => {
    const world = fixture({ guarded: true, armor: 0, abilities: [technique("same-floor", 0, 0)] });
    expect(bounds(world, null)).toBe(5);
    expect(bounds(world, "same-floor")).toBe(5);
    expect(choice(world).command).toMatchObject({ action: { type: "attack" } });
  });

  it("keeps an ability-only genuine finish ahead of emergency restoration", () => {
    const world = fixture({ critical: true, enemyHealth: 15, abilities: [technique("necessary", 2, 5)] });
    expect(choice(world).trace.matchedRuleId).toBe("dire.safe-finish");
    expect(choice(world).command).toMatchObject({ action: { type: "ability", abilityId: "necessary" } });
  });

  it("does not turn a guarded false finish into an excuse to skip the emergency tonic", () => {
    const world = fixture({ guarded: true, critical: true, enemyHealth: 9, abilities: [technique("insufficient", 0, 1)] });
    expect(bounds(world, null)).toBe(4);
    expect(bounds(world, "insufficient")).toBe(5);
    expect(choice(world).trace.matchedRuleId).toBe("dire.restore");
    expect(choice(world).command).toMatchObject({ action: { type: "item" } });
    expect(choice(world).rationale).toContain("Guard prevents a guaranteed finish");
    expect(choice(world).rationale).not.toContain("preferring lower mana cost");
  });

  it.each(["poisoned", "burning"] as const)("does not call a finish safe when the final %s tick kills the hero first", (kind) => {
    const world = fixture({ critical: true, enemyHealth: 1, abilities: [technique("unused", 0, 4)], statuses: [{ kind, duration: 1, potency: 1 }] });
    expect(bounds(world, null)).toBe(0);
    expect(choice(world).trace.matchedRuleId).toBe("dire.restore");
    expect(choice(world).rationale).not.toContain("preferring lower mana cost");
  });

  it("preserves curious multi-enemy technique selection rather than optimizing one target's finish", () => {
    const world = fixture({ enemyCount: 2, enemyHealth: 1, abilities: [technique("still-experimenting", 0, 1)] });
    expect(choice(world).trace.matchedRuleId).toBe("combat.experiment");
    expect(choice(world).command).toMatchObject({ action: { type: "ability", abilityId: "still-experimenting" } });
    expect(choice(world).rationale).not.toContain("preferring lower mana cost");
  });

  it("leaves enemy finish ranking unchanged", () => {
    const base = fixture({ enemyHealth: 20 });
    const combat = base.depth.combat!;
    const enemy = combat.combatants.find((unit) => unit.side === "enemies")!;
    const world = { ...base, depth: { ...base.depth, combat: { ...combat, activeIndex: 1,
      combatants: combat.combatants.map((unit) => unit.id === enemy.id
        ? { ...unit, power: 10, mana: 4, maxMana: 4, abilities: [technique("enemy-signature", 1, 2)] }
        : { ...unit, health: 1, armor: 2 }) } } };
    expect(choice(world).command).toMatchObject({ action: { actorId: enemy.id, type: "ability", abilityId: "enemy-signature" } });
    expect(choice(world).rationale).not.toContain("preferring lower mana cost");
  });

  it("resolves a canonical basic finish, conserves MP, and earns exactly one real weapon receipt across JSON reload", () => {
    // Begin with a genuine loaded save; JSON normalizes terrain's numeric -0.
    const base = upgradeWorldState(JSON.parse(JSON.stringify(createWorld("efficient-finisher-canonical", "campaign:efficient-finisher-canonical"))));
    const created = createCombat(base.seed, base.depth.hero, "encounter:efficient-finisher-canonical", 1);
    const combat = { ...created, activeIndex: 0,
      turnOrder: [base.hero.id, ...created.turnOrder.filter((id) => id !== base.hero.id)],
      combatants: created.combatants.map((unit) => unit.side === "enemies" ? { ...unit, health: 1 } : unit) };
    const before: WorldState = { ...base, scene: { ...base.scene, mode: "battle" },
      depth: { ...base.depth, combat, legacyUnratedCombatIds: [combat.id] } };
    const serialized = JSON.stringify(before);
    expect(upgradeWorldState(JSON.parse(serialized))).toEqual(before);
    expect(before.depth.hero.abilities.length).toBeGreaterThan(0);
    const randomInt = vi.spyOn(rng, "randomInt");
    try {
      const selected = choice(before);
      expect(selected.command).toMatchObject({ type: "combat-action", action: { type: "attack" } });
      expect(randomInt.mock.calls.some((call) => call[2] === "combat-resolution")).toBe(false);
    } finally { randomInt.mockRestore(); }
    const after = advanceWorld(before);
    expect(after.depth.combat).toBeNull();
    expect(after.depth.hero.resources.mana).toBe(before.depth.hero.resources.mana);
    const weapon = after.depth.hero.inventory.find((item) => item.id === before.depth.hero.equipment.weapon)!;
    expect(weapon.useMastery?.experience).toBe(1);
    expect(weapon.useMastery?.receipts).toEqual([expect.objectContaining({ combatId: combat.id, weaponId: weapon.id,
      resolvedTick: after.depth.tick, outcome: "victory", basicStrikes: 1, damage: 1, experienceBefore: 0, experienceAfter: 1 })]);
    for (const ability of before.depth.hero.abilities) {
      expect(after.depth.hero.abilities.find((entry) => entry.id === ability.id)).toEqual(ability);
    }
    expect(after.chronicle.at(-1)?.decisionTrace?.matchedRuleId).toBe("combat.finish");
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(advanceWorld(JSON.parse(serialized))).toEqual(after);
    expect(JSON.stringify(before)).toBe(serialized);
  });
});
