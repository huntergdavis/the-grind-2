import { describe, expect, it } from "vitest";
import { createCombat, isValidCombatState, monsterAbilityForLevel, monsterDefinitions, resolveCombatTurn } from "./combat";
import { advanceFieldResearch, createFieldResearchState, isValidFieldResearchState, upgradeFieldResearchState } from "./field-research";
import { createDepthState, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";
import type { CombatAction, CombatState, DepthState, FieldResearchStateV2 } from "./types";

const seed = "browser-moonhowl-research:39";
const heroId = "hero:campaign:browser-moonhowl-research";
const abilityId = "secret:lantern-wolf:moonhowl";

function fixture(): DepthState {
  const initial = createDepthState(seed, heroId, "Mara");
  const edge = initial.atlas.edges.find((candidate) => (candidate.from === initial.atlas.currentLocationId && candidate.to === "location:5")
    || (candidate.to === initial.atlas.currentLocationId && candidate.from === "location:5"))!;
  const routed = stepDepth(initial, { type: "plan-route", destinationId: edge.from === initial.atlas.currentLocationId ? edge.to : edge.from });
  const started = stepDepth(routed, { type: "start-combat", encounterId: unresolvedRouteEncounterId(routed)!, enemyCount: 1 });
  const combat = started.combat!;
  const enemy = combat.combatants.find((unit) => unit.side === "enemies")!;
  expect(enemy.speciesId).toBe("lantern-wolf");
  expect(enemy.abilities[0]!.id).toBe(abilityId);
  // Shared with the actual-app test: a naturally generated rated Wolf, with only hero readiness/order controlled.
  return { ...started, hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth, mana: 0 } },
    combat: { ...combat, activeIndex: 0, turnOrder: [enemy.id, heroId],
      combatants: combat.combatants.map((unit) => unit.id === heroId ? { ...unit, health: unit.maxHealth, mana: 0 } : unit) } };
}

function cast(combat: CombatState, selectedAbility = abilityId): Extract<CombatAction, { type: "ability" }> {
  return { type: "ability", actorId: combat.turnOrder[combat.activeIndex]!, targetId: heroId, abilityId: selectedAbility, itemId: null };
}

function attack(combat: CombatState): Extract<CombatAction, { type: "attack" }> {
  return { type: "attack", actorId: combat.turnOrder[combat.activeIndex]!, targetId: combat.combatants.find((unit) => unit.side === "enemies" && unit.health > 0)!.id,
    abilityId: null, itemId: null };
}

function guard(combat: CombatState): CombatAction {
  return { type: "guard", actorId: combat.turnOrder[combat.activeIndex]!, targetId: null, abilityId: null, itemId: null };
}

function apply(initial = fixture()): DepthState {
  return stepDepth(initial, { type: "combat-action", action: cast(initial.combat!) });
}

function complete(): DepthState {
  const applied = apply();
  return stepDepth(applied, { type: "combat-action", action: attack(applied.combat!) });
}

/** Controlled legacy-unrated variants are used only for overwrite/expiry and interruption negatives. */
function controlledPair(otherWeaken = false): CombatState {
  const canonical = fixture();
  const secret = monsterAbilityForLevel(monsterDefinitions[0], 1);
  const combat = createCombat(seed, canonical.hero, "moonhowl:controlled", 2);
  const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
  const result: CombatState = { ...combat, activeIndex: 0, turnOrder: [...enemies.map((unit) => unit.id), heroId],
    combatants: combat.combatants.map((unit) => unit.side === "heroes" ? { ...unit, health: unit.maxHealth, mana: unit.maxMana } : {
      ...unit, speciesId: otherWeaken && unit.id === enemies[1]!.id ? "copperhorn" : "lantern-wolf",
      power: 1, armor: 0, maxHealth: 200, health: 200, maxMana: 20, mana: 20,
      abilities: [otherWeaken && unit.id === enemies[1]!.id ? { ...secret, id: "test:other:weaken", sourceMonsterId: "copperhorn" } : secret],
    }) };
  expect(isValidCombatState(result)).toBe(true);
  return result;
}

function resolve(research: FieldResearchStateV2, before: CombatState, action: CombatAction) {
  const after = resolveCombatTurn(before, action, seed);
  expect(isValidCombatState(after)).toBe(true);
  return { combat: after, research: advanceFieldResearch(research, before, after, { heroId, depthTick: after.turn + 10 }) };
}

describe("Lantern Wolf Moonhowl two-observation field research", () => {
  it("records a real living-hero application and a source-linked weakened strike without counterfactual damage claims", () => {
    const initial = fixture();
    const bytes = JSON.stringify(initial);
    const applied = apply(initial);
    const application = applied.fieldResearch.moonhowl.application!;
    expect(application).toMatchObject({ speciesId: "lantern-wolf", abilityId, combatId: initial.combat!.id,
      sourceEventId: `${initial.combat!.id}:1:3`, sourceTick: initial.tick + 1, sourceTurn: 1,
      actorId: `${initial.combat!.id}:enemy:0`, targetId: heroId, duration: 2 });
    expect(application.targetHealthAfter).toBeGreaterThan(0);
    expect(applied.fieldResearch.moonhowl.aftereffect).toBeNull();
    const command = { type: "combat-action" as const, action: attack(applied.combat!) };
    const raw = resolveCombatTurn(applied.combat!, command.action, seed);
    const finished = stepDepth(applied, command);
    const receipt = finished.fieldResearch.moonhowl.aftereffect!;
    const damage = raw.eventStream.events.find((event) => event.turn === 2 && event.kind === "damage")!;
    if (damage.kind !== "damage") throw new Error("Expected actual strike receipt");
    expect(receipt).toEqual({ combatId: initial.combat!.id, sourceEventId: `${initial.combat!.id}:2:1`,
      sourceTick: initial.tick + 2, sourceTurn: 2, applicationEventId: application.sourceEventId,
      targetId: heroId, potency: application.potency, durationBefore: 2, durationAfter: 1,
      healthBefore: application.targetHealthAfter, amount: 0, healthAfter: application.targetHealthAfter,
      intentEventId: `${initial.combat!.id}:2:0`, damageEventId: damage.id, action: "attack", abilityId: null,
      strikeTargetId: damage.targetId, targetHealthBefore: damage.healthBefore, damage: damage.amount, targetHealthAfter: damage.healthAfter });
    expect(finished.combat).toEqual(raw);
    expect(finished.hero.resources).toEqual(applied.hero.resources);
    expect(finished.hero.abilities).toEqual(applied.hero.abilities);
    expect(finished.hero.inventory).toEqual(applied.hero.inventory);
    expect(finished.quest).toEqual(applied.quest);
    expect(finished.discoveries).toEqual(applied.discoveries);
    expect(finished.fieldResearch.inkcap).toBe(applied.fieldResearch.inkcap);
    expect(JSON.stringify(initial)).toBe(bytes);
    expect(isValidFieldResearchState(finished.fieldResearch, heroId, finished.tick)).toBe(true);
    for (const value of [applied.fieldResearch, application, finished.fieldResearch.moonhowl, receipt]) expect(Object.isFrozen(value)).toBe(true);
  });

  it("resumes exact canonical proof and retains completed evidence after the combat histories are gone", () => {
    const applied = apply();
    const loaded = upgradeDepthState(JSON.parse(JSON.stringify(applied)), seed, heroId, "Mara");
    const action = { type: "combat-action" as const, action: attack(applied.combat!) };
    // This seed's terrain contains -0; JSON canonically writes it as 0. Compare exact persisted replay bytes.
    expect(JSON.stringify(stepDepth(loaded, action))).toBe(JSON.stringify(stepDepth(applied, action)));
    const finished = complete();
    const later = { ...finished, combat: null, completedCombats: [], tick: finished.tick + 100 };
    expect(upgradeDepthState(JSON.parse(JSON.stringify(later)), seed, heroId, "Mara").fieldResearch).toEqual(finished.fieldResearch);
    expect(upgradeFieldResearchState(JSON.parse(JSON.stringify(finished.fieldResearch)), heroId, finished.tick)).toEqual(finished.fieldResearch);
    const next = resolveCombatTurn(finished.combat!, guard(finished.combat!), seed);
    expect(advanceFieldResearch(finished.fieldResearch, finished.combat!, next, { heroId, depthTick: finished.tick + 1 })).toBe(finished.fieldResearch);
  });

  it("does not count guarding or expiry as a weakened strike, but can observe a later fresh genuine application", () => {
    const initial = controlledPair();
    const first = resolve(createFieldResearchState(), initial, cast(initial));
    const second = resolve(first.research, first.combat, guard(first.combat));
    const braced = resolve(second.research, second.combat, guard(second.combat));
    expect(braced.research).toBe(second.research);
    expect(braced.combat.eventStream.events).toContainEqual(expect.objectContaining({ kind: "status-tick", status: "weakened", durationAfter: 1 }));
    const enemyOne = resolve(braced.research, braced.combat, guard(braced.combat));
    const enemyTwo = resolve(enemyOne.research, enemyOne.combat, guard(enemyOne.combat));
    const expired = resolve(enemyTwo.research, enemyTwo.combat, attack(enemyTwo.combat));
    expect(expired.combat.eventStream.events).toContainEqual(expect.objectContaining({ kind: "status-expired", status: "weakened", durationAfter: 0 }));
    expect(expired.research.moonhowl.aftereffect).toBeNull();
    const refreshed = resolve(expired.research, expired.combat, cast(expired.combat));
    const intervening = resolve(refreshed.research, refreshed.combat, guard(refreshed.combat));
    const struck = resolve(intervening.research, intervening.combat, attack(intervening.combat));
    expect(struck.research.moonhowl.aftereffect?.applicationEventId).toBe(refreshed.research.moonhowl.application?.sourceEventId);
  });

  it("rejects missing, pruned, wrong-actor, wrong-species, future and foreign-combat source evidence", () => {
    const applied = apply();
    const before = applied.combat!;
    const after = resolveCombatTurn(before, attack(before), seed);
    const application = applied.fieldResearch.moonhowl.application!;
    for (const state of [createFieldResearchState(),
      { ...applied.fieldResearch, moonhowl: { ...applied.fieldResearch.moonhowl, application: { ...application, sourceEventId: `${before.id}:1:4` } } },
      { ...applied.fieldResearch, moonhowl: { ...applied.fieldResearch.moonhowl, application: { ...application, actorId: `${before.id}:enemy:1` } } },
      { ...applied.fieldResearch, moonhowl: { ...applied.fieldResearch.moonhowl, application: { ...application, sourceTick: applied.tick + 2 } } },
    ]) expect(advanceFieldResearch(state, before, after, { heroId, depthTick: applied.tick + 1 })).toBe(state);
    const pruned: CombatState = { ...before, eventStream: { schemaVersion: 2, firstRecordedTurn: 2, events: [] } };
    expect(isValidCombatState(pruned)).toBe(true);
    const prunedAfter = resolveCombatTurn(pruned, attack(pruned), seed);
    expect(advanceFieldResearch(applied.fieldResearch, pruned, prunedAfter, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    const wrongSpecies = { ...after, combatants: after.combatants.map((unit) => unit.side === "enemies" ? { ...unit, speciesId: "copperhorn" } : unit) };
    expect(advanceFieldResearch(applied.fieldResearch, before, wrongSpecies, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    expect(advanceFieldResearch(applied.fieldResearch, before, after, { heroId: "another", depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    expect(advanceFieldResearch(applied.fieldResearch, { ...before, id: "another" }, after, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
  });

  it("refreshes unfinished genuine casts but rejects identical-potency weakening from another owner", () => {
    for (const other of [false, true]) {
      const initial = controlledPair(other);
      const first = resolve(createFieldResearchState(), initial, cast(initial));
      const second = resolve(first.research, first.combat, cast(first.combat, other ? "test:other:weaken" : abilityId));
      expect(second.research.moonhowl.aftereffect).toBeNull();
      const struck = resolve(second.research, second.combat, attack(second.combat));
      if (other) {
        expect(second.research).toBe(first.research);
        expect(struck.research.moonhowl.aftereffect).toBeNull();
      } else {
        expect(second.research.moonhowl.application?.sourceEventId).not.toBe(first.research.moonhowl.application?.sourceEventId);
        expect(struck.research.moonhowl.aftereffect?.applicationEventId).toBe(second.research.moonhowl.application?.sourceEventId);
        const later = resolve(struck.research, struck.combat, cast(struck.combat));
        expect(later.research.moonhowl).toBe(struck.research.moonhowl);
      }
    }
  });

  it("never turns a restorative item or pre-action death into a witnessed strike", () => {
    const applied = apply();
    const before = applied.combat!;
    const critical: CombatState = { ...before, combatants: before.combatants.map((unit) => unit.id === heroId ? { ...unit, health: 1 } : unit) };
    const tonic = applied.hero.inventory.find((item) => item.restorative !== null)!;
    const restored = resolveCombatTurn(critical, { type: "item", actorId: heroId, targetId: heroId, abilityId: null, itemId: tonic.id }, seed, tonic);
    expect(isValidCombatState(restored)).toBe(true);
    expect(advanceFieldResearch(applied.fieldResearch, critical, restored, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    const doomed: CombatState = { ...critical, combatants: critical.combatants.map((unit) => unit.id === heroId
      ? { ...unit, statuses: [...unit.statuses, { kind: "burning", duration: 1, potency: 1 }] } : unit) };
    const died = resolveCombatTurn(doomed, attack(doomed), seed);
    expect(died.outcome).toBe("defeat");
    expect(died.eventStream.events.filter((event) => event.turn === died.turn && event.kind === "damage")).toEqual([]);
    expect(advanceFieldResearch(applied.fieldResearch, doomed, died, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
  });

  it("captures a real finishing strike before terminal cleanup but never credits a fatal application", () => {
    const applied = apply();
    const terminal: CombatState = { ...applied.combat!, combatants: applied.combat!.combatants.map((unit) => unit.side === "enemies" ? { ...unit, health: 1 } : unit) };
    const finished = resolveCombatTurn(terminal, attack(terminal), seed);
    expect(finished.outcome).toBe("victory");
    expect(advanceFieldResearch(applied.fieldResearch, terminal, finished, { heroId, depthTick: applied.tick + 1 }).moonhowl.aftereffect)
      .toMatchObject({ damage: 1, targetHealthBefore: 1, targetHealthAfter: 0 });
    const initial = fixture();
    const critical: DepthState = { ...initial, hero: { ...initial.hero, resources: { ...initial.hero.resources, health: 1 } },
      combat: { ...initial.combat!, combatants: initial.combat!.combatants.map((unit) => unit.id === heroId ? { ...unit, health: 1 } : unit) } };
    const lost = apply(critical);
    expect(lost.combat).toBeNull();
    expect(lost.fieldResearch).toEqual(createFieldResearchState());
  });

  it("validates all three retained event identities, chronological ownership, and separate hero/target HP arithmetic", () => {
    const finished = complete();
    const research = finished.fieldResearch;
    const proof = research.moonhowl;
    const application = proof.application!;
    const effect = proof.aftereffect!;
    for (const invalid of [
      null, { ...proof, extra: true }, { ...proof, taskId: "another" }, { ...proof, application: null },
      { ...proof, application: { ...application, sourceEventId: `${application.combatId}:1:0` } },
      { ...proof, application: { ...application, speciesId: "inkcap-mimic" } },
      { ...proof, application: { ...application, duration: 3 } },
      { ...proof, application: { ...application, targetHealthAfter: 0 } },
      { ...proof, application: { ...application, sourceTick: finished.tick + 1 } },
      { ...proof, aftereffect: { ...effect, applicationEventId: "unrelated" } },
      { ...proof, aftereffect: { ...effect, durationBefore: 1, durationAfter: 0 } },
      { ...proof, aftereffect: { ...effect, amount: 1, healthAfter: effect.healthBefore - 1 } },
      { ...proof, aftereffect: { ...effect, healthAfter: 0 } },
      { ...proof, aftereffect: { ...effect, potency: effect.potency + 1 } },
      { ...proof, aftereffect: { ...effect, intentEventId: `${effect.combatId}:1:0` } },
      { ...proof, aftereffect: { ...effect, damageEventId: effect.sourceEventId } },
      { ...proof, aftereffect: { ...effect, damageEventId: `${effect.combatId}:2:12` } },
      { ...proof, aftereffect: { ...effect, damageEventId: `${effect.combatId}:3:2` } },
      { ...proof, aftereffect: { ...effect, action: "guard" } },
      { ...proof, aftereffect: { ...effect, action: "ability", abilityId: null } },
      { ...proof, aftereffect: { ...effect, abilityId: "test:ability" } },
      { ...proof, aftereffect: { ...effect, strikeTargetId: heroId } },
      { ...proof, aftereffect: { ...effect, damage: 0 } },
      { ...proof, aftereffect: { ...effect, targetHealthAfter: effect.targetHealthAfter + 1 } },
    ]) {
      const state = { ...research, moonhowl: invalid };
      expect(isValidFieldResearchState(state, heroId, finished.tick), JSON.stringify(invalid)).toBe(false);
      expect(() => upgradeFieldResearchState(state, heroId, finished.tick)).toThrow();
    }
    expect(isValidFieldResearchState(research, heroId, finished.tick)).toBe(true);
  });

  it("counts an actual hero strike ability while the same sourced weakening still lingers", () => {
    const initial = controlledPair();
    const applied = resolve(createFieldResearchState(), initial, cast(initial));
    const ready = resolve(applied.research, applied.combat, guard(applied.combat));
    const hero = ready.combat.combatants.find((unit) => unit.id === heroId)!;
    const ability = hero.abilities.find((entry) => entry.manaCost <= hero.mana)!;
    expect(ability).toBeDefined();
    const result = resolve(ready.research, ready.combat, { type: "ability", actorId: heroId,
      targetId: attack(ready.combat).targetId, abilityId: ability.id, itemId: null });
    expect(result.research.moonhowl.aftereffect).toMatchObject({ action: "ability", abilityId: ability.id,
      applicationEventId: applied.research.moonhowl.application!.sourceEventId });
  });
});
