import { describe, expect, it } from "vitest";
import { actorPolicy } from "../core/actor-policy";
import { createWorld, upgradeWorldState } from "../core/simulation";
import type { Opportunity, WorldState } from "../core/types";
import {
  companionActionTarget,
  chooseCombatAction,
  createCombat,
  isValidCombatState,
  legalCompanionActions,
  resolveCombatTurn,
} from "./combat";
import { basicCompanionKit, millerRoadcraftKit } from "./companion-kit";
import { companionToCombatant } from "./companion";
import { createDepthState, depthCommandCandidates, isValidCompanionStateGraph, stepDepth, upgradeDepthState } from "./state";
import { generateTown, visitTown } from "./towns";
import type { ActiveCompanion, CombatState, DetailedHeroState } from "./types";

function miller(): ActiveCompanion {
  return {
    phase: "travelling",
    identity: {
      residentId: "resident:miller",
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
    victories: 0,
    bond: 2,
    injury: "none",
    combatKit: millerRoadcraftKit,
  };
}

function roadcraftCombat(seed = "roadcraft-combat"): { combat: CombatState; hero: DetailedHeroState; companion: ActiveCompanion } {
  const world = createWorld(seed, `campaign:${seed}`);
  const hero = world.depth.hero;
  const companion = miller();
  const created = createCombat(seed, hero, `encounter:${seed}`, 2, [companionToCombatant(companion)]);
  const enemies = created.combatants.filter((unit) => unit.side === "enemies");
  const combat = {
    ...created,
    activeIndex: 0,
    turnOrder: [companion.identity.residentId, enemies[0]!.id, hero.id, ...enemies.slice(1).map((enemy) => enemy.id)],
    combatants: created.combatants.map((unit) => unit.id === hero.id
      ? { ...unit, health: Math.floor(unit.maxHealth / 2) }
      : unit),
  };
  return { combat, hero, companion };
}

function action(combat: CombatState, actionId: "flour-veil" | "millstone-drag") {
  const selected = legalCompanionActions(combat).find((candidate) =>
    candidate.type === "companion-action" && candidate.companionActionId === actionId
  );
  if (selected?.type !== "companion-action") throw new Error(`${actionId} was not legal in the fixture`);
  return selected;
}

describe("Miller Roadcraft", () => {
  it("rejects forged companion provenance, profiles, resources, and future timeline facts", () => {
    const fixture = roadcraftCombat("roadcraft-graph");
    const roster = {
      schemaVersion: 2 as const,
      kitRulesVersion: "explicit-companion-kit-v1" as const,
      explicitKitAfterTick: 0,
      active: [fixture.companion],
      former: [],
    };
    const source = { tick: 1, hero: fixture.hero, companions: roster, combat: fixture.combat };
    const combatWithoutRuntime = structuredClone(fixture.combat);
    delete combatWithoutRuntime.companionActionRuntime;
    expect(isValidCompanionStateGraph(source)).toBe(true);
    expect(isValidCompanionStateGraph({ ...source, companions: { ...roster, active: [] } })).toBe(false);
    expect(isValidCompanionStateGraph({
      ...source,
      combat: { ...combatWithoutRuntime, combatants: fixture.combat.combatants.filter((unit) => unit.id !== fixture.companion.identity.residentId) },
    })).toBe(false);
    const companionCombatant = fixture.combat.combatants.find((unit) => unit.id === fixture.companion.identity.residentId)!;
    expect(isValidCompanionStateGraph({
      ...source,
      combat: { ...fixture.combat, combatants: [...fixture.combat.combatants, { ...companionCombatant, id: "resident:orphan" }] },
    })).toBe(false);
    expect(isValidCompanionStateGraph({
      ...source,
      combat: { ...fixture.combat, companionActionRuntime: { ...fixture.combat.companionActionRuntime!, actorId: fixture.hero.id } },
    })).toBe(false);
    for (const combatant of [
      { ...companionCombatant, id: "resident:wrong" },
      { ...companionCombatant, companionKit: basicCompanionKit },
      { ...companionCombatant, power: companionCombatant.power + 1 },
      { ...companionCombatant, health: companionCombatant.health - 1 },
    ]) {
      expect(isValidCompanionStateGraph({
        ...source,
        combat: {
          ...fixture.combat,
          combatants: fixture.combat.combatants.map((unit) =>
            unit.id === fixture.companion.identity.residentId ? combatant : unit
          ),
        },
      })).toBe(false);
    }
    expect(isValidCompanionStateGraph({
      ...source,
      tick: 0,
    })).toBe(false);
    const former = {
      ...fixture.companion,
      phase: "former" as const,
      departure: {
        tick: 3,
        locationId: fixture.companion.destination.locationId,
        outcome: "fulfilled" as const,
      },
    };
    expect(isValidCompanionStateGraph({
      tick: 2,
      hero: fixture.hero,
      companions: { ...roster, active: [], former: [former] },
      combat: null,
    })).toBe(false);
  });

  it("enforces the companion graph at direct Depth, reducer, and full-world load boundaries", () => {
    const world = createWorld("roadcraft-orphan-boundary", "campaign:roadcraft-orphan-boundary");
    const orphan = miller();
    const combat = createCombat(
      world.seed,
      world.depth.hero,
      "encounter:orphan-roadcraft",
      1,
      [companionToCombatant(orphan)],
    );
    const forged = {
      ...world.depth,
      combat,
      legacyUnratedCombatIds: [combat.id],
    };
    expect(() => upgradeDepthState(forged, world.seed, world.hero.id, world.hero.name)).toThrow("schema invariants");
    expect(() => stepDepth(forged, { type: "wait" })).toThrow("schema invariants");
    expect(() => upgradeWorldState({ ...world, depth: forged })).toThrow("schema invariants");
  });

  it("assigns explicit kits once at recruitment and preserves a released kitless Miller byte-for-byte", () => {
    const base = createDepthState("roadcraft-recruit");
    const originId = base.atlas.currentLocationId;
    const current = base.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
    if (current === undefined) throw new Error("Roadcraft recruitment fixture needs a second town");
    const eligible = {
      ...base,
      atlas: { ...base.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null },
      towns: { ...base.towns, [current.id]: visitTown(generateTown(base.seed, current.id)) },
    };
    const candidate = depthCommandCandidates(eligible)[0];
    if (candidate?.command.type !== "recruit-companion") throw new Error("No canonical recruit candidate found");
    const recruitCommand = candidate.command;
    const town = eligible.towns[eligible.atlas.currentLocationId];
    if (town === undefined) throw new Error("Recruitment town is missing");
    const withRole = (role: string) => ({
      ...eligible,
      towns: {
        ...eligible.towns,
        [town.locationId]: {
          ...town,
          residents: town.residents.map((resident) => resident.id === recruitCommand.residentId
            ? { ...resident, role }
            : resident),
        },
      },
    });
    const millerState = stepDepth(withRole("miller"), recruitCommand);
    const ordinaryState = stepDepth(withRole("baker"), recruitCommand);
    expect(millerState.companions.active[0]?.combatKit).toEqual(millerRoadcraftKit);
    expect(ordinaryState.companions.active[0]?.combatKit).toEqual(basicCompanionKit);

    const releasedRecord = { ...millerState.companions.active[0] };
    delete releasedRecord.combatKit;
    const legacy = {
      ...millerState,
      schemaVersion: 20,
      companions: { schemaVersion: 1, active: [releasedRecord], former: [] },
    };
    const migrated = upgradeDepthState(legacy, millerState.seed, millerState.hero.id, millerState.hero.name);
    expect(migrated.companions.explicitKitAfterTick).toBe(millerState.tick);
    expect(migrated.companions.active[0]).toEqual(releasedRecord);
    expect(companionToCombatant(migrated.companions.active[0]!).companionKit).toBeUndefined();
  });

  it("resolves Flour Veil as canonical zero-damage cover with an exact cooldown receipt", () => {
    const { combat, hero, companion } = roadcraftCombat("flour-veil");
    expect(isValidCombatState(combat)).toBe(true);
    expect(companionActionTarget(combat, "flour-veil")?.id).toBe(hero.id);
    const beforeHealth = combat.combatants.map((unit) => [unit.id, unit.health]);
    const resolved = resolveCombatTurn(combat, action(combat, "flour-veil"), "flour-veil");
    expect(resolved.combatants.map((unit) => [unit.id, unit.health])).toEqual(beforeHealth);
    expect(resolved.combatants.find((unit) => unit.id === hero.id)?.statuses).toContainEqual({
      kind: "guarding", duration: 1, potency: 50,
    });
    expect(resolved.companionActionRuntime?.readyRounds["flour-veil"]).toBe(3);
    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual([
      "intent", "companion-action-resolved", "status-applied",
    ]);
    expect(resolved.eventStream.events[1]).toMatchObject({
      actorId: companion.identity.residentId,
      targetId: hero.id,
      companionActionId: "flour-veil",
      effect: "guarding",
      manaCost: 0,
      itemCost: 0,
      damage: 0,
      readyRoundBefore: 1,
      readyRoundAfter: 3,
    });
    expect(isValidCombatState(resolved)).toBe(true);

    const nextEnemy = resolved.combatants.find((unit) => unit.id === resolved.turnOrder[resolved.activeIndex]);
    if (nextEnemy === undefined || nextEnemy.side !== "enemies") throw new Error("Flour fixture needs an intervening enemy turn");
    const enemyStrike = { actorId: nextEnemy.id, type: "attack" as const, targetId: hero.id, abilityId: null, itemId: null };
    const guarded = resolveCombatTurn(resolved, enemyStrike, "flour-window");
    const unguarded = resolveCombatTurn({
      ...resolved,
      combatants: resolved.combatants.map((unit) => unit.id === hero.id ? { ...unit, statuses: [] } : unit),
    }, enemyStrike, "flour-window");
    const guardedDamage = guarded.eventStream.events.find((event) => event.turn === 2 && event.kind === "damage");
    const unguardedDamage = unguarded.eventStream.events.find((event) => event.turn === 2 && event.kind === "damage");
    if (guardedDamage?.kind !== "damage" || unguardedDamage?.kind !== "damage") throw new Error("Flour fixture needs damage receipts");
    expect(guardedDamage.guarded).toBe(true);
    expect(guardedDamage.amount).toBe(Math.max(1, Math.floor(unguardedDamage.amount * 0.5)));
    expect(isValidCombatState(guarded)).toBe(true);
    const heroTarget = guarded.combatants.find((unit) => unit.side === "enemies" && unit.health > 0);
    if (heroTarget === undefined) throw new Error("Flour fixture needs a target for the protected hero");
    const afterHeroTurn = resolveCombatTurn(guarded, {
      actorId: hero.id,
      type: "attack",
      targetId: heroTarget.id,
      abilityId: null,
      itemId: null,
    }, "flour-expiry");
    expect(afterHeroTurn.combatants.find((unit) => unit.id === hero.id)?.statuses).not.toContainEqual(
      expect.objectContaining({ kind: "guarding" }),
    );

    const noProtectionWindow: CombatState = {
      ...combat,
      turnOrder: [companion.identity.residentId, hero.id, ...combat.combatants.filter((unit) => unit.side === "enemies").map((unit) => unit.id)],
    };
    expect(companionActionTarget(noProtectionWindow, "flour-veil")).toBeUndefined();
    expect(legalCompanionActions(noProtectionWindow).some((candidate) =>
      candidate.type === "companion-action" && candidate.companionActionId === "flour-veil"
    )).toBe(false);

    const resetTarget = (round: number): CombatState => ({
      ...resolved,
      round,
      activeIndex: resolved.turnOrder.indexOf(companion.identity.residentId),
      combatants: resolved.combatants.map((unit) => unit.id === hero.id ? { ...unit, statuses: [] } : unit),
    });
    expect(legalCompanionActions(resetTarget(2)).some((candidate) => candidate.type === "companion-action" && candidate.companionActionId === "flour-veil")).toBe(false);
    expect(legalCompanionActions(resetTarget(3)).some((candidate) => candidate.type === "companion-action" && candidate.companionActionId === "flour-veil")).toBe(true);
  });

  it("binds cooldown receipts to reconstructed rounds and their retained predecessor", () => {
    const fixture = roadcraftCombat("roadcraft-receipt-chain");
    let combat = resolveCombatTurn(fixture.combat, action(fixture.combat, "flour-veil"), "roadcraft-receipt-chain");
    while (
      combat.outcome === "ongoing" &&
      !(combat.round === 3 && combat.turnOrder[combat.activeIndex] === fixture.companion.identity.residentId)
    ) {
      combat = resolveCombatTurn(combat, chooseCombatAction(combat), "roadcraft-receipt-chain");
    }
    if (combat.outcome !== "ongoing") throw new Error("Receipt-chain fixture ended before the cooldown reset");
    combat = {
      ...combat,
      combatants: combat.combatants.map((unit) => unit.id === fixture.hero.id
        ? { ...unit, health: Math.floor(unit.maxHealth / 2), statuses: [] }
        : unit),
    };
    const second = resolveCombatTurn(combat, action(combat, "flour-veil"), "roadcraft-receipt-chain");
    expect(isValidCombatState(second)).toBe(true);
    const receiptIndexes = second.eventStream.events.flatMap((event, index) =>
      event.kind === "companion-action-resolved" && event.companionActionId === "flour-veil" ? [index] : []
    );
    expect(receiptIndexes).toHaveLength(2);
    const secondReceiptIndex = receiptIndexes[1]!;
    const forgedChain = structuredClone(second);
    const forgedChainReceipt = forgedChain.eventStream.events[secondReceiptIndex];
    if (forgedChainReceipt?.kind !== "companion-action-resolved") throw new Error("Missing second Flour receipt");
    forgedChainReceipt.readyRoundBefore = 1;
    expect(isValidCombatState(forgedChain)).toBe(false);

    const truncated = structuredClone(second);
    truncated.eventStream.events = truncated.eventStream.events.filter((event) => event.turn > 1);
    truncated.eventStream.firstRecordedTurn = 2;
    expect(isValidCombatState(truncated)).toBe(true);
    const truncatedReceipt = truncated.eventStream.events.find((event) =>
      event.kind === "companion-action-resolved" && event.companionActionId === "flour-veil"
    );
    if (truncatedReceipt?.kind !== "companion-action-resolved") throw new Error("Missing retained Flour receipt");
    truncatedReceipt.usedRound -= 1;
    expect(isValidCombatState(truncated)).toBe(false);
  });

  it("targets the strongest foe with Millstone Drag and rejects forged targets", () => {
    const { combat } = roadcraftCombat("millstone-drag");
    const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
    const expected = [...enemies].sort((left, right) =>
      right.power - left.power || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    )[0];
    expect(companionActionTarget(combat, "millstone-drag")?.id).toBe(expected?.id);
    const selected = action(combat, "millstone-drag");
    const forgedTarget = enemies.find((unit) => unit.id !== selected.targetId)?.id ?? combat.combatants.find((unit) => unit.side === "heroes")!.id;
    expect(() => resolveCombatTurn(combat, { ...selected, targetId: forgedTarget }, "millstone-drag")).toThrow("noncanonical target");
    const resolved = resolveCombatTurn(combat, selected, "millstone-drag");
    expect(resolved.combatants.find((unit) => unit.id === selected.targetId)?.statuses).toContainEqual({
      kind: "weakened", duration: 2, potency: 2,
    });
    expect(resolved.combatants.find((unit) => unit.id === selected.targetId)?.health)
      .toBe(combat.combatants.find((unit) => unit.id === selected.targetId)?.health);
    expect(resolved.log.at(-1)).toMatchObject({ action: "companion-action", amount: 0 });
    expect(isValidCombatState(resolved)).toBe(true);
  });

  it("lets lethal damage-over-time interrupt Roadcraft without consuming its cooldown", () => {
    const fixture = roadcraftCombat("roadcraft-interrupted");
    const poisoned: CombatState = {
      ...fixture.combat,
      combatants: fixture.combat.combatants.map((unit) => unit.id === fixture.companion.identity.residentId
        ? { ...unit, health: 1, statuses: [{ kind: "poisoned" as const, potency: 2, duration: 1 }] }
        : unit),
    };
    const resolved = resolveCombatTurn(poisoned, action(poisoned, "millstone-drag"), "roadcraft-interrupted");
    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual(["intent", "status-expired", "defeated"]);
    expect(resolved.companionActionRuntime?.readyRounds["millstone-drag"]).toBe(1);
    expect(resolved.combatants.find((unit) => unit.id === fixture.companion.identity.residentId)?.health).toBe(0);
    expect(isValidCombatState(resolved)).toBe(true);
  });

  it("uses the dedicated Miller policy: self-preservation, cover, finish, then control", () => {
    const fixture = roadcraftCombat("roadcraft-policy");
    const base = createWorld("roadcraft-policy", "campaign:roadcraft-policy");
    const choose = (combat: CombatState) => {
      const depth = { ...base.depth, combat };
      const world = { ...base, depth } as WorldState;
      const candidates = depthCommandCandidates(depth);
      const opportunity: Opportunity = {
        mode: "battle",
        location: "road",
        goal: "survive",
        candidates,
        forwardMotionReason: null,
      };
      return actorPolicy(world, opportunity);
    };

    const cover = choose(fixture.combat);
    expect(cover.command).toMatchObject({ type: "combat-action", action: { type: "companion-action", companionActionId: "flour-veil" } });
    expect(cover.trace.profileId).toBe("millerCombat");
    expect(cover.rationale).toContain("0 MP and 0 damage");

    const lowMiller = {
      ...fixture.combat,
      combatants: fixture.combat.combatants.map((unit) => unit.id === fixture.companion.identity.residentId
        ? { ...unit, health: Math.floor(unit.maxHealth / 3) }
        : unit),
    };
    expect(choose(lowMiller).command).toMatchObject({ type: "combat-action", action: { type: "guard" } });

    const livingEnemies = fixture.combat.combatants.filter((unit) => unit.side === "enemies");
    const finishable = {
      ...fixture.combat,
      combatants: fixture.combat.combatants.map((unit) => unit.id === fixture.hero.id
        ? { ...unit, health: unit.maxHealth }
        : unit.id === livingEnemies[0]?.id ? { ...unit, health: 1 }
          : unit.side === "enemies" ? { ...unit, health: 0 } : unit),
    };
    expect(choose(finishable).command).toMatchObject({ type: "combat-action", action: { type: "attack" } });

    const control = {
      ...fixture.combat,
      combatants: fixture.combat.combatants.map((unit) => unit.id === fixture.hero.id
        ? { ...unit, health: unit.maxHealth }
        : unit),
    };
    expect(choose(control).command).toMatchObject({ type: "combat-action", action: { type: "companion-action", companionActionId: "millstone-drag" } });
  });
});
