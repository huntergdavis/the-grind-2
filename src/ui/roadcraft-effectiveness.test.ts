import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import {
  createCombat,
  isValidCombatState,
  legalCompanionActions,
  resolveCombatTurn,
} from "../depth/combat";
import { combatDamageV1 } from "../depth/combat-damage";
import { millerRoadcraftKit } from "../depth/companion-kit";
import { companionToCombatant } from "../depth/companion";
import type { ActiveCompanion, CombatAction, CombatState, FormerCompanion } from "../depth/types";
import {
  describeRoadcraftEffectiveness,
  projectRoadcraftEffectiveness,
} from "./roadcraft-effectiveness";

function miller(): ActiveCompanion {
  return {
    phase: "travelling",
    identity: {
      residentId: "resident:miller:effectiveness",
      name: "Mara Mill",
      role: "miller",
      disposition: "warm",
      originTownId: "town:origin",
      originLocationId: "location:origin",
      homeBuildingId: "building:mill",
    },
    destination: { locationId: "location:destination", name: "Stonecross" },
    purpose: "shared-road-oath",
    joinedTick: 1,
    resources: { health: 34, mana: 0 },
    combat: { maxHealth: 34, maxMana: 0, power: 8, armor: 3, initiative: 20 },
    victories: 3,
    bond: 8,
    injury: "none",
    combatKit: millerRoadcraftKit,
  };
}

function fixture(seed: string, enemyCount = 1): {
  companion: ActiveCompanion;
  combat: CombatState;
  heroId: string;
  seed: string;
} {
  const world = createWorld(seed, `campaign:${seed}`);
  const companion = miller();
  const created = createCombat(seed, world.depth.hero, `encounter:${seed}`, enemyCount, [companionToCombatant(companion)]);
  const enemies = created.combatants.filter((combatant) => combatant.side === "enemies");
  return {
    seed,
    companion,
    heroId: world.depth.hero.id,
    combat: {
      ...created,
      activeIndex: 0,
      turnOrder: [companion.identity.residentId, ...enemies.map((enemy) => enemy.id), world.depth.hero.id],
      combatants: created.combatants.map((combatant) => combatant.id === world.depth.hero.id
        ? { ...combatant, health: Math.floor(combatant.maxHealth / 2) }
        : combatant),
    },
  };
}

function roadcraftAction(combat: CombatState, actionId: "flour-veil" | "millstone-drag"): CombatAction {
  const selected = legalCompanionActions(combat).find((action) =>
    action.type === "companion-action" && action.companionActionId === actionId
  );
  if (selected === undefined) throw new Error(`${actionId} is unavailable in the fixture`);
  return selected;
}

function damageAt(combat: CombatState, turn: number) {
  const event = combat.eventStream.events.find((candidate) => candidate.turn === turn && candidate.kind === "damage");
  if (event?.kind !== "damage") throw new Error(`Missing damage at turn ${turn}`);
  return event;
}

function source(fixtureValue: ReturnType<typeof fixture>, combat: CombatState) {
  return { seed: fixtureValue.seed, combat, completedCombats: [] };
}

describe("Roadcraft effectiveness", () => {
  it("reconstructs exact basic-attack Flour prevention and exports stable frozen verb facts", () => {
    const found = fixture("effectiveness:flour-basic");
    const veiled = resolveCombatTurn(found.combat, roadcraftAction(found.combat, "flour-veil"), found.seed);
    const enemy = veiled.combatants.find((combatant) => combatant.id === veiled.turnOrder[veiled.activeIndex]);
    if (enemy === undefined || enemy.side !== "enemies") throw new Error("Flour fixture needs an enemy turn");
    const strike = { actorId: enemy.id, type: "attack" as const, targetId: found.heroId, abilityId: null, itemId: null };
    const guarded = resolveCombatTurn(veiled, strike, found.seed);
    const unguarded = resolveCombatTurn({
      ...veiled,
      combatants: veiled.combatants.map((combatant) => combatant.id === found.heroId
        ? { ...combatant, statuses: [] }
        : combatant),
    }, strike, found.seed);
    const projected = projectRoadcraftEffectiveness(source(found, guarded), found.companion);
    if (projected === null) throw new Error("Roadcraft projection failed");

    expect(projected).toMatchObject({
      scope: "verified-retained-combat-history-v1",
      flourVeilUses: 1,
      millstoneDragUses: 0,
      flourScreenedHits: 1,
      damagePrevented: damageAt(unguarded, 2).amount - damageAt(guarded, 2).amount,
      millstoneAffectedAttacks: 0,
      victoriesTogether: 3,
      injuryCount: 0,
      completeEventCombatCount: 1,
      truncatedEventCombatCount: 0,
      unmeasuredImpactCount: 0,
    });
    expect(projected.uses[0]).toMatchObject({
      verbId: "companion-action:miller-roadcraft-v1:flour-veil",
      companionActionId: "flour-veil",
    });
    expect(projected.latestImpact).toMatchObject({ kind: "flour-veil", sourceEventId: projected.uses[0]?.id });
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.uses)).toBe(true);
    expect(Object.isFrozen(projected.latestImpact)).toBe(true);
    expect(projectRoadcraftEffectiveness(JSON.parse(JSON.stringify(source(found, guarded))), JSON.parse(JSON.stringify(found.companion))))
      .toEqual(projected);
    expect(describeRoadcraftEffectiveness(projected)).toContain("RETAINED ROADCRAFT RECORD");
    expect(describeRoadcraftEffectiveness(projected)).toContain(`${projected.damagePrevented} HP prevented`);
  });

  it("reconstructs ability damage and lethal health caps without rounding guesses", () => {
    const found = fixture("effectiveness:flour-ability");
    const veiled = resolveCombatTurn(found.combat, roadcraftAction(found.combat, "flour-veil"), found.seed);
    const enemy = veiled.combatants.find((combatant) => combatant.id === veiled.turnOrder[veiled.activeIndex]);
    const ability = enemy?.abilities[0];
    if (enemy === undefined || ability === undefined) throw new Error("Ability fixture needs an enemy ability");
    const lowHealth = {
      ...veiled,
      combatants: veiled.combatants.map((combatant) => combatant.id === found.heroId ? { ...combatant, health: 3 } : combatant),
    };
    const resolved = resolveCombatTurn(lowHealth, {
      actorId: enemy.id,
      type: "ability",
      targetId: found.heroId,
      abilityId: ability.id,
      itemId: null,
    }, found.seed);
    const projected = projectRoadcraftEffectiveness(source(found, resolved), found.companion);
    if (projected === null) throw new Error("Ability projection failed");
    expect(projected.flourScreenedHits).toBe(1);
    expect(projected.unmeasuredImpactCount).toBe(0);
    expect(projected.damagePrevented).toBeGreaterThanOrEqual(0);
    expect(projected.damagePrevented + damageAt(resolved, 2).amount).toBeLessThanOrEqual(3);
  });

  it("does not count a later DOT-interrupted ability intent as earned ability XP", () => {
    const found = fixture("effectiveness:interrupted-later-ability");
    const enemy = found.combat.combatants.find((combatant) => combatant.side === "enemies");
    const ability = enemy?.abilities[0];
    if (enemy === undefined || ability === undefined) throw new Error("Interrupted-use fixture needs an enemy ability");
    const staged: CombatState = {
      ...found.combat,
      combatants: found.combat.combatants.map((combatant) => combatant.id === enemy.id
        ? {
            ...combatant,
            mana: combatant.maxMana,
            abilities: [{ ...ability, level: 2, experience: 6, uses: 0, manaCost: 0 }],
          }
        : combatant),
    };
    const veiled = resolveCombatTurn(staged, roadcraftAction(staged, "flour-veil"), found.seed);
    const abilityAction = {
      actorId: enemy.id,
      type: "ability" as const,
      targetId: found.heroId,
      abilityId: ability.id,
      itemId: null,
    };
    let combat = resolveCombatTurn(veiled, abilityAction, found.seed);
    const unguarded = resolveCombatTurn({
      ...veiled,
      combatants: veiled.combatants.map((combatant) => combatant.id === found.heroId
        ? { ...combatant, statuses: [] }
        : combatant),
    }, abilityAction, found.seed);
    const expectedPrevention = damageAt(unguarded, 2).amount - damageAt(combat, 2).amount;
    expect(expectedPrevention).toBeGreaterThan(0);

    const hero = combat.combatants.find((combatant) => combatant.id === found.heroId)!;
    combat = resolveCombatTurn(combat, { actorId: hero.id, type: "guard", targetId: null, abilityId: null, itemId: null }, found.seed);
    combat = resolveCombatTurn(combat, {
      actorId: found.companion.identity.residentId,
      type: "guard",
      targetId: null,
      abilityId: null,
      itemId: null,
    }, found.seed);
    const interrupted: CombatState = {
      ...combat,
      combatants: combat.combatants.map((combatant) => combatant.id === enemy.id
        ? { ...combatant, health: 1, statuses: [{ kind: "poisoned" as const, potency: 2, duration: 1 }] }
        : combatant),
    };
    combat = resolveCombatTurn(interrupted, abilityAction, found.seed);
    expect(combat.eventStream.events.filter((event) =>
      event.kind === "intent" && event.actorId === enemy.id && event.abilityId === ability.id
    )).toHaveLength(2);
    expect(combat.eventStream.events.filter((event) =>
      event.kind === "mana-spent" && event.actorId === enemy.id && event.abilityId === ability.id
    )).toHaveLength(1);
    const projected = projectRoadcraftEffectiveness(source(found, combat), found.companion);
    expect(projected).toMatchObject({
      flourScreenedHits: 1,
      damagePrevented: expectedPrevention,
      unmeasuredImpactCount: 0,
    });
  });

  it("counts a Millstone-affected damaging attack and never calls it direct damage", () => {
    const found = fixture("effectiveness:millstone");
    const controlled = resolveCombatTurn(found.combat, roadcraftAction(found.combat, "millstone-drag"), found.seed);
    const enemy = controlled.combatants.find((combatant) => combatant.id === controlled.turnOrder[controlled.activeIndex]);
    if (enemy === undefined || enemy.side !== "enemies") throw new Error("Millstone fixture needs an enemy turn");
    const resolved = resolveCombatTurn(controlled, {
      actorId: enemy.id,
      type: "attack",
      targetId: found.heroId,
      abilityId: null,
      itemId: null,
    }, found.seed);
    const projected = projectRoadcraftEffectiveness(source(found, resolved), found.companion);
    if (projected === null) throw new Error("Millstone projection failed");
    expect(projected).toMatchObject({
      flourVeilUses: 0,
      millstoneDragUses: 1,
      flourScreenedHits: 0,
      damagePrevented: 0,
      millstoneAffectedAttacks: 1,
    });
    expect(projected.uses[0]?.verbId).toBe("companion-action:miller-roadcraft-v1:millstone-drag");
    expect(projected.latestImpact).toMatchObject({ kind: "millstone-drag", preventedDamage: 0 });
  });

  it("credits every retained enemy hit screened by one Flour Veil", () => {
    const found = fixture("effectiveness:flour-multiple", 2);
    let combat = resolveCombatTurn(found.combat, roadcraftAction(found.combat, "flour-veil"), found.seed);
    for (const enemyId of combat.turnOrder.slice(1, 3)) {
      const enemy = combat.combatants.find((combatant) => combatant.id === enemyId);
      if (enemy === undefined || enemy.side !== "enemies") throw new Error("Multi-hit fixture needs consecutive enemies");
      combat = resolveCombatTurn(combat, {
        actorId: enemy.id,
        type: "attack",
        targetId: found.heroId,
        abilityId: null,
        itemId: null,
      }, found.seed);
    }
    const projected = projectRoadcraftEffectiveness(source(found, combat), found.companion);
    expect(projected).toMatchObject({ flourVeilUses: 1, flourScreenedHits: 2, unmeasuredImpactCount: 0 });
    expect(projected?.impacts.filter((impact) => impact.kind === "flour-veil")).toHaveLength(2);
  });

  it("stops Millstone credit after a competing Weaken overwrites its source", () => {
    const found = fixture("effectiveness:millstone-overwrite");
    const hero = found.combat.combatants.find((combatant) => combatant.id === found.heroId);
    const enemy = found.combat.combatants.find((combatant) => combatant.side === "enemies");
    const ability = hero?.abilities[0];
    if (hero === undefined || enemy === undefined || ability === undefined) throw new Error("Overwrite fixture needs hero, enemy, and ability");
    const staged: CombatState = {
      ...found.combat,
      activeIndex: 0,
      turnOrder: [found.companion.identity.residentId, hero.id, enemy.id],
      combatants: found.combat.combatants.map((combatant) => combatant.id === hero.id
        ? { ...combatant, mana: combatant.maxMana, abilities: [{ ...ability, effect: "weaken" as const, manaCost: 0 }] }
        : combatant),
    };
    let combat = resolveCombatTurn(staged, roadcraftAction(staged, "millstone-drag"), found.seed);
    combat = resolveCombatTurn(combat, {
      actorId: hero.id,
      type: "ability",
      targetId: enemy.id,
      abilityId: ability.id,
      itemId: null,
    }, found.seed);
    combat = resolveCombatTurn(combat, {
      actorId: enemy.id,
      type: "attack",
      targetId: hero.id,
      abilityId: null,
      itemId: null,
    }, found.seed);
    expect(isValidCombatState(combat)).toBe(true);
    expect(projectRoadcraftEffectiveness(source(found, combat), found.companion)).toMatchObject({
      millstoneDragUses: 1,
      millstoneAffectedAttacks: 0,
    });
  });

  it("credits Millstone only while its retained status remains active", () => {
    const found = fixture("effectiveness:millstone-expiry");
    const hero = found.combat.combatants.find((combatant) => combatant.id === found.heroId)!;
    const enemy = found.combat.combatants.find((combatant) => combatant.side === "enemies")!;
    let combat = resolveCombatTurn(found.combat, roadcraftAction(found.combat, "millstone-drag"), found.seed);
    combat = resolveCombatTurn(combat, { actorId: enemy.id, type: "attack", targetId: hero.id, abilityId: null, itemId: null }, found.seed);
    combat = resolveCombatTurn(combat, { actorId: hero.id, type: "guard", targetId: null, abilityId: null, itemId: null }, found.seed);
    combat = resolveCombatTurn(combat, { actorId: found.companion.identity.residentId, type: "guard", targetId: null, abilityId: null, itemId: null }, found.seed);
    combat = resolveCombatTurn(combat, { actorId: enemy.id, type: "attack", targetId: hero.id, abilityId: null, itemId: null }, found.seed);
    expect(isValidCombatState(combat)).toBe(true);
    expect(projectRoadcraftEffectiveness(source(found, combat), found.companion)).toMatchObject({
      millstoneDragUses: 1,
      millstoneAffectedAttacks: 1,
    });
  });

  it("does not credit self-Guard and discloses a truncated retained stream", () => {
    const found = fixture("effectiveness:self-guard");
    const hero = found.combat.combatants.find((combatant) => combatant.id === found.heroId)!;
    const enemy = found.combat.combatants.find((combatant) => combatant.side === "enemies")!;
    const heroFirst: CombatState = {
      ...found.combat,
      activeIndex: 0,
      turnOrder: [hero.id, enemy.id, found.companion.identity.residentId],
    };
    const guarded = resolveCombatTurn(heroFirst, {
      actorId: hero.id,
      type: "guard",
      targetId: null,
      abilityId: null,
      itemId: null,
    }, found.seed);
    const struck = resolveCombatTurn(guarded, {
      actorId: enemy.id,
      type: "attack",
      targetId: hero.id,
      abilityId: null,
      itemId: null,
    }, found.seed);
    const selfGuard = projectRoadcraftEffectiveness(source(found, struck), found.companion);
    expect(selfGuard).toMatchObject({ flourScreenedHits: 0, damagePrevented: 0, unmeasuredImpactCount: 0 });

    const flourFound = fixture("effectiveness:truncated");
    const veiled = resolveCombatTurn(flourFound.combat, roadcraftAction(flourFound.combat, "flour-veil"), flourFound.seed);
    const flourEnemy = veiled.combatants.find((combatant) => combatant.side === "enemies")!;
    const flourStruck = resolveCombatTurn(veiled, {
      actorId: flourEnemy.id,
      type: "attack",
      targetId: flourFound.heroId,
      abilityId: null,
      itemId: null,
    }, flourFound.seed);
    const truncated: CombatState = {
      ...flourStruck,
      eventStream: {
        ...flourStruck.eventStream,
        firstRecordedTurn: 2,
        events: flourStruck.eventStream.events.filter((event) => event.turn === 2),
      },
    };
    expect(isValidCombatState(truncated)).toBe(true);
    expect(projectRoadcraftEffectiveness(source(flourFound, truncated), flourFound.companion)).toMatchObject({
      flourVeilUses: 0,
      flourScreenedHits: 0,
      damagePrevented: 0,
      completeEventCombatCount: 0,
      truncatedEventCombatCount: 1,
    });
  });

  it("fails closed for duplicate combats, identity forgeries, and kitless Millers", () => {
    const found = fixture("effectiveness:forgery");
    expect(projectRoadcraftEffectiveness({ seed: found.seed, combat: found.combat, completedCombats: [found.combat] }, found.companion)).toBeNull();
    const forged = {
      ...found.combat,
      combatants: found.combat.combatants.map((combatant) => combatant.id === found.companion.identity.residentId
        ? { ...combatant, name: "Not Mara" }
        : combatant),
    };
    expect(projectRoadcraftEffectiveness(source(found, forged), found.companion)).toBeNull();
    const legacy = { ...found.companion };
    delete legacy.combatKit;
    expect(projectRoadcraftEffectiveness(source(found, found.combat), legacy)).toBeNull();
  });

  it("keeps oath totals outside a former Miller's empty retained-combat label", () => {
    const former: FormerCompanion = {
      ...miller(),
      phase: "former",
      resources: { health: 0, mana: 0 },
      injury: "fallen",
      departure: { tick: 40, locationId: "location:destination", outcome: "injured" },
    };
    const projected = projectRoadcraftEffectiveness({ seed: "evicted", combat: null, completedCombats: [] }, former);
    if (projected === null) throw new Error("Former Miller projection failed");
    expect(projected).toMatchObject({ retainedCombatCount: 0, victoriesTogether: 3, injuryCount: 1 });
    expect(describeRoadcraftEffectiveness(projected)).toBe(
      "RETAINED ROADCRAFT RECORD · no retained battles · Flour Veil 0 uses · 0 screened hits · 0 HP prevented · Millstone Drag 0 uses · 0 affected attacks",
    );
    expect(describeRoadcraftEffectiveness(projected)).not.toMatch(/victor|injur/i);
  });

  it("shares exact odd rounding, piercing armor, and lethal caps with combat resolution", () => {
    const actor = { id: "actor:damage", power: 10 };
    const target = { id: "target:damage", health: 100, armor: 9 };
    const oddSeed = Array.from({ length: 32 }, (_, index) => `damage-odd:${index}`).find((seed) =>
      combatDamageV1(seed, "combat:damage", 1, actor, target, null, 0, false).rawDamage % 2 !== 0
    );
    if (oddSeed === undefined) throw new Error("Damage fixture could not find an odd deterministic roll");
    const unguarded = combatDamageV1(oddSeed, "combat:damage", 1, actor, target, null, 0, false);
    const guarded = combatDamageV1(oddSeed, "combat:damage", 1, actor, target, null, 0, true);
    expect(guarded.resolvedDamage).toBe(Math.max(1, Math.floor(unguarded.rawDamage / 2)));
    expect(guarded.preventedDamage).toBe(unguarded.appliedDamage - guarded.appliedDamage);

    const arcane = combatDamageV1(oddSeed, "combat:damage", 1, actor, target, {
      effect: "arcane", potency: 5, level: 3,
    }, 0, false);
    const piercing = combatDamageV1(oddSeed, "combat:damage", 1, actor, target, {
      effect: "piercing", potency: 5, level: 3,
    }, 0, false);
    expect(arcane.armorReduction).toBe(4);
    expect(piercing.armorReduction).toBe(1);
    expect(piercing.resolvedDamage - arcane.resolvedDamage).toBe(3);

    const lethal = combatDamageV1(oddSeed, "combat:damage", 1, actor, { ...target, health: 1 }, null, 0, true);
    expect(lethal).toMatchObject({ unguardedAppliedDamage: 1, appliedDamage: 1, preventedDamage: 0 });
    expect(Object.isFrozen(lethal)).toBe(true);
  });
});
