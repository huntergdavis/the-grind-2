import { describe, expect, it, vi } from "vitest";
import { createCombat } from "../depth/combat";
import { companionToCombatant } from "../depth/companion";
import { legalMillraceReversal } from "../depth/shared-opening";
import { depthCommandCandidates, stepDepth } from "../depth/state";
import { generateTown, visitTown } from "../depth/towns";
import type { CombatAction, CombatState } from "../depth/types";
import { actorPolicy } from "./actor-policy";
import { projectCombatActionForecast } from "./combat-action-forecast";
import { createForwardMotionState } from "./forward-motion";
import * as rng from "./rng";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "./simulation";
import type { WorldState } from "./types";

function millerCombatWorld(emergency = false): WorldState {
  const base = createWorld("millrace-policy", "campaign:millrace-policy");
  const originId = base.depth.atlas.currentLocationId;
  const townLocation = base.depth.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (townLocation === undefined) throw new Error("Millrace needs a second recorded town");
  const eligible = {
    ...base.depth,
    atlas: { ...base.depth.atlas, currentLocationId: townLocation.id, discoveredLocationIds: [originId, townLocation.id], route: null },
    towns: { ...base.depth.towns, [townLocation.id]: visitTown(generateTown(base.seed, townLocation.id)) },
  };
  const candidate = depthCommandCandidates(eligible)[0];
  if (candidate?.command.type !== "recruit-companion") throw new Error("Expected real recruitment candidate");
  const command = candidate.command;
  const town = eligible.towns[townLocation.id]!;
  // Reuse the existing Roadcraft recruitment fixture seam: one recorded resident
  // is a Miller, then the real reducer supplies identity, oath, profile and kit.
  let depth = stepDepth({ ...eligible, towns: { ...eligible.towns, [townLocation.id]: {
    ...town,
    residents: town.residents.map((resident) => resident.id === command.residentId ? { ...resident, role: "miller" } : resident),
  } } }, command);
  const companion = depth.companions.active[0];
  if (companion?.combatKit?.kitId !== "miller-roadcraft") throw new Error("Expected canonically recruited Miller kit");
  if (emergency) depth = { ...depth, hero: { ...depth.hero, resources: {
    ...depth.hero.resources, health: Math.max(3, Math.floor(depth.hero.resources.maxHealth / 3)),
  } } };
  const created = createCombat(base.seed, depth.hero, "encounter:millrace-policy", 1, [companionToCombatant(companion)]);
  const enemy = created.combatants.find((unit) => unit.side === "enemies");
  if (enemy === undefined) throw new Error("Expected one enemy");
  const combat: CombatState = {
    ...created,
    activeIndex: 0,
    turnOrder: [companion.identity.residentId, enemy.id, depth.hero.id],
    combatants: created.combatants.map((unit) => unit.id === enemy.id
      ? { ...unit, health: 120, maxHealth: 120, power: 5, armor: 20, abilities: [] }
      : unit.id === depth.hero.id && emergency
        ? { ...unit, statuses: [{ kind: "guarding", duration: 1, potency: 50 }] }
        : unit),
  };
  return upgradeWorldState({
    ...base,
    tick: depth.tick,
    hero: { ...base.hero, health: depth.hero.resources.health },
    depth: { ...depth, combat, legacyUnratedCombatIds: [combat.id] },
    scene: { ...base.scene, mode: "battle", location: town.name },
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    forwardMotion: createForwardMotionState(townLocation.id, depth.tick),
  });
}

function earnOpening(emergency = false): WorldState {
  const before = millerCombatWorld(emergency);
  expect(actorPolicy(before, campaignDirector(before)).command).toMatchObject({
    type: "combat-action", action: { type: "companion-action", companionActionId: "millstone-drag" },
  });
  const dragged = advanceWorld(before);
  const armed = advanceWorld(dragged);
  expect(armed.depth.combat?.eventStream.events.some((event) => event.kind === "shared-opening-earned")).toBe(true);
  expect(legalMillraceReversal(armed.depth.combat!)).not.toBeNull();
  expect(upgradeWorldState(JSON.parse(JSON.stringify(armed)))).toEqual(armed);
  return armed;
}

function openingAction(world: WorldState): { combat: CombatState; action: Extract<CombatAction, { type: "joint-action" }> } {
  const combat = world.depth.combat;
  const action = combat === null ? null : legalMillraceReversal(combat);
  if (combat === null || action === null) throw new Error("Expected a witnessed opening at the hero's action window");
  return { combat, action };
}

describe("Millrace Reversal core integration", () => {
  it("automatically earns and spends one shared opening on one recorded weapon strike", () => {
    const before = earnOpening();
    const serialized = JSON.stringify(before);
    const { combat, action } = openingAction(before);
    const companion = before.depth.companions.active[0]!;
    const target = combat.combatants.find((unit) => unit.id === action.targetId)!;
    const choice = actorPolicy(before, campaignDirector(before));
    expect(choice.command).toEqual({ type: "combat-action", action });
    expect(choice.trace).toMatchObject({ context: "sharedOpeningCombat", matchedRuleId: "opening.millrace-reversal", reasonCode: "control-tempo" });
    expect(choice.rationale).toContain(companion.identity.name);
    expect(choice.rationale).toContain(target.name);
    expect(choice.rationale).toContain("spends 1→0");
    expect(choice.rationale).toContain("piercing armor reduction 4");

    const forecast = projectCombatActionForecast(combat, action);
    const after = advanceWorld(before);
    const resolved = after.depth.combat!;
    const packet = resolved.eventStream.events.filter((event) => event.turn === resolved.turn);
    const damage = packet.filter((event) => event.kind === "damage");
    expect(damage).toHaveLength(1);
    expect(damage[0]!.amount).toBeGreaterThanOrEqual(forecast.minimumDamage);
    expect(damage[0]!.amount).toBeLessThanOrEqual(forecast.maximumDamage);
    expect(resolved.weaponUse).toMatchObject({ tracking: "tracked", basicStrikes: 1, damage: damage[0]!.amount });
    expect(resolved.companionActionRuntime).toMatchObject({ schemaVersion: 2, sharedOpening: null });
    expect(legalMillraceReversal(resolved)).toBeNull();
    expect(after.tick).toBe(before.tick + 1);
    expect(after.hero.experience - before.hero.experience).toBe(8);
    expect(after.depth.hero.abilities).toEqual(before.depth.hero.abilities);
    expect(after.depth.hero.inventory).toEqual(before.depth.hero.inventory);
    expect(after.depth.hero.gold).toBe(before.depth.hero.gold);
    expect(after.depth.quest).toEqual(before.depth.quest);
    expect(after.depth.companions).toEqual(before.depth.companions);
    expect(after.chronicle.at(-1)?.decisionTrace).toEqual(choice.trace);
    expect(advanceWorld(upgradeWorldState(JSON.parse(serialized)))).toEqual(after);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("takes emergency restoration before the opening, even when another attack guarantees a finish", () => {
    const armed = earnOpening(true);
    const { combat, action } = openingAction(armed);
    // A focused policy-only boundary: make the sole living enemy finishable.
    // The actual restorative transition below uses the unmodified valid source.
    const finishable = { ...armed, depth: { ...armed.depth, combat: {
      ...combat, combatants: combat.combatants.map((unit) => unit.id === action.targetId ? { ...unit, health: 1 } : unit),
    } } };
    expect(projectCombatActionForecast(finishable.depth.combat, { actorId: action.actorId, type: "attack", targetId: action.targetId, abilityId: null, itemId: null }).minimumDamage).toBeGreaterThanOrEqual(1);
    for (const state of [armed, finishable]) {
      const choice = actorPolicy(state, campaignDirector(state));
      expect(choice.command).toMatchObject({ type: "combat-action", action: { type: "item" } });
      expect(choice.trace.matchedRuleId).toBe("opening.restore");
      expect(choice.rationale).toContain("emergency restoration takes priority");
    }
    const after = advanceWorld(armed);
    expect(after.depth.hero.resources.health).toBeGreaterThan(armed.depth.hero.resources.health);
    expect(after.hero.experience).toBe(armed.hero.experience);
    expect(after.depth.combat?.weaponUse).toEqual(combat.weaponUse);
    expect(after.depth.combat?.companionActionRuntime).toMatchObject({ sharedOpening: null });
    const packet = after.depth.combat!.eventStream.events.filter((event) => event.turn === after.depth.combat!.turn);
    expect(packet.some((event) => event.kind === "damage")).toBe(false);
    expect(advanceWorld(upgradeWorldState(JSON.parse(JSON.stringify(armed))))).toEqual(after);
  });

  it("keeps Guard in the joint label and forecasts its actual piercing reduction without future rolls", () => {
    const before = earnOpening();
    const { combat, action } = openingAction(before);
    // Policy/forecast boundary only; the backend suite owns the recorded Guard lifecycle.
    const guarded = { ...combat, combatants: combat.combatants.map((unit) => unit.id === action.targetId
      ? { ...unit, statuses: [...unit.statuses, { kind: "guarding" as const, duration: 1, potency: 50 }] } : unit) };
    const actor = guarded.combatants.find((unit) => unit.id === action.actorId)!;
    const expected = { minimumDamage: Math.max(1, Math.floor((actor.power - 4) / 2)), maximumDamage: Math.max(1, Math.floor((actor.power + 4 - 4) / 2)) };
    const randomInt = vi.spyOn(rng, "randomInt");
    try {
      expect(projectCombatActionForecast(guarded, action)).toMatchObject({ ...expected, guarded: true, canAct: true });
      expect(projectCombatActionForecast({ ...guarded, id: "another-future-seed-domain" }, action)).toMatchObject(expected);
      expect(randomInt).not.toHaveBeenCalled();
    } finally {
      randomInt.mockRestore();
    }
    const state = { ...before, depth: { ...before.depth, combat: guarded } };
    const choice = actorPolicy(state, campaignDirector(state));
    expect(choice.trace.selected.targetLabel).toContain(" · Guard · Opening 1→0 · ");
    expect(choice.trace.selected.targetLabel).toContain(`${expected.minimumDamage}–${expected.maximumDamage} damage`);
    expect(choice.trace.selected.actionLabel).toContain(before.depth.companions.active[0]!.identity.name);
  });

  it("rejects a different participant or target and never forecasts damage after a lethal status tick", () => {
    const before = earnOpening();
    const { combat, action } = openingAction(before);
    for (const invalid of [{ ...action, companionId: "wrong:miller" }, { ...action, targetId: action.companionId }, { ...action, actorId: action.companionId }]) {
      expect(projectCombatActionForecast(combat, invalid)).toMatchObject({ minimumDamage: 0, maximumDamage: 0 });
    }
    const interrupted = { ...combat, combatants: combat.combatants.map((unit) => unit.id === action.actorId
      ? { ...unit, health: 1, statuses: [{ kind: "poisoned" as const, duration: 1, potency: 1 }] } : unit) };
    expect(projectCombatActionForecast(interrupted, action)).toMatchObject({ minimumDamage: 0, maximumDamage: 0, canAct: false });
  });

  it("keeps a missing or legacy opening out of the new profile and damage forecast", () => {
    const before = millerCombatWorld();
    expect(actorPolicy(before, campaignDirector(before)).trace.context).toBe("millerCombat");
    const armed = earnOpening();
    const { combat, action } = openingAction(armed);
    const runtime = combat.companionActionRuntime!;
    const legacy = { ...combat, companionActionRuntime: {
      schemaVersion: 1 as const, actorId: runtime.actorId, kitId: runtime.kitId, rulesVersion: runtime.rulesVersion, readyRounds: runtime.readyRounds,
    } };
    expect(legalMillraceReversal(legacy)).toBeNull();
    expect(projectCombatActionForecast(legacy, action)).toMatchObject({ minimumDamage: 0, maximumDamage: 0 });
    const legacyWorld = { ...armed, depth: { ...armed.depth, combat: legacy } };
    expect(actorPolicy(legacyWorld, campaignDirector(legacyWorld)).trace.context).toBe("ordinaryCombat");
  });

  it("upgrades genuine V1 cooldowns but rejects new spent history relabeled as V1", () => {
    const asLegacyRuntime = (world: WorldState): WorldState => {
      const combat = world.depth.combat;
      const runtime = combat?.companionActionRuntime;
      if (combat === null || runtime === undefined) throw new Error("Expected a Miller combat runtime");
      return { ...world, depth: { ...world.depth, combat: { ...combat, companionActionRuntime: {
        schemaVersion: 1,
        actorId: runtime.actorId,
        kitId: runtime.kitId,
        rulesVersion: runtime.rulesVersion,
        readyRounds: { ...runtime.readyRounds },
      } } } };
    };
    const beforeDrag = millerCombatWorld();
    const genuineLegacy = asLegacyRuntime(beforeDrag);
    const serialized = JSON.stringify(genuineLegacy);
    const restored = upgradeWorldState(JSON.parse(serialized));
    expect(restored.depth.combat?.companionActionRuntime).toEqual({
      ...genuineLegacy.depth.combat!.companionActionRuntime,
      schemaVersion: 2,
      dragSource: null,
      sharedOpening: null,
    });
    expect(restored.depth.combat?.eventStream).toEqual(beforeDrag.depth.combat?.eventStream);
    expect(JSON.stringify(genuineLegacy)).toBe(serialized);

    const spent = advanceWorld(earnOpening());
    expect(spent.depth.combat?.eventStream.events.some((event) => event.kind === "shared-opening-spent")).toBe(true);
    expect(spent.depth.combat?.companionActionRuntime).toMatchObject({ schemaVersion: 2, sharedOpening: null });
    expect(upgradeWorldState(JSON.parse(JSON.stringify(spent)))).toEqual(spent);
    const relabeled = asLegacyRuntime(spent);
    expect(() => upgradeWorldState(JSON.parse(JSON.stringify(relabeled)))).toThrow();
  });
});
