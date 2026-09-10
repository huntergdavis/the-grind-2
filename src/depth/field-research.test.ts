import { describe, expect, it } from "vitest";
import { createCombat, isValidCombatState, resolveCombatTurn } from "./combat";
import { advanceFieldResearch, createFieldResearchState, isValidFieldResearchState } from "./field-research";
import { createDepthState, stepDepth, unresolvedRouteEncounterId, upgradeDepthState } from "./state";
import type { CombatAction, CombatState, DepthState, FieldResearchStateV1 } from "./types";

const seed = "browser-field-research:0";
const heroId = "hero:campaign:browser-field-research";
const secretId = "secret:inkcap-mimic:false-treasure";

function fixture(): DepthState {
  const initial = createDepthState(seed, heroId, "Mara");
  const edge = initial.atlas.edges.find((candidate) => candidate.from === initial.atlas.currentLocationId || candidate.to === initial.atlas.currentLocationId)!;
  const routed = stepDepth(initial, { type: "plan-route", destinationId: edge.from === initial.atlas.currentLocationId ? edge.to : edge.from });
  const encounterId = unresolvedRouteEncounterId(routed)!;
  const started = stepDepth(routed, { type: "start-combat", encounterId, enemyCount: 1 });
  const combat = started.combat!;
  const enemy = combat.combatants.find((unit) => unit.side === "enemies")!;
  expect(enemy.speciesId).toBe("inkcap-mimic");
  expect(enemy.abilities[0]!.id).toBe(secretId);
  // A naturally generated, rated Inkcap; only hero readiness and turn order are controlled.
  return { ...started, hero: { ...started.hero, resources: { ...started.hero.resources, health: started.hero.resources.maxHealth, mana: 0 } },
    combat: { ...combat, activeIndex: 0, turnOrder: [enemy.id, heroId],
      combatants: combat.combatants.map((unit) => unit.id === heroId ? { ...unit, health: unit.maxHealth, mana: 0 } : unit) },
  };
}

function cast(combat: CombatState, actorId = combat.turnOrder[combat.activeIndex]!): Extract<CombatAction, { type: "ability" }> {
  return { type: "ability", actorId, targetId: heroId, abilityId: secretId, itemId: null };
}

function guard(combat: CombatState): CombatAction {
  return { type: "guard", actorId: combat.turnOrder[combat.activeIndex]!, targetId: null, abilityId: null, itemId: null };
}

function apply(initial = fixture()): DepthState {
  return stepDepth(initial, { type: "combat-action", action: cast(initial.combat!) });
}

function complete(initial = fixture()): DepthState {
  const applied = apply(initial);
  return stepDepth(applied, { type: "combat-action", action: guard(applied.combat!) });
}

function controlledPair(otherPoison = false): CombatState {
  const canonical = fixture();
  const secret = canonical.combat!.combatants.find((unit) => unit.side === "enemies")!.abilities[0]!;
  const combat = createCombat(seed, canonical.hero, "research:controlled", 2);
  const enemies = combat.combatants.filter((unit) => unit.side === "enemies");
  const result: CombatState = { ...combat, activeIndex: 0, turnOrder: [...enemies.map((unit) => unit.id), heroId],
    combatants: combat.combatants.map((unit) => unit.side === "heroes" ? unit : {
      ...unit, speciesId: otherPoison && unit.id === enemies[1]!.id ? "copperhorn" : "inkcap-mimic",
      power: 1, abilities: [otherPoison && unit.id === enemies[1]!.id
        ? { ...secret, id: "test:other:poison", sourceMonsterId: "copperhorn" } : secret],
    }),
  };
  expect(isValidCombatState(result)).toBe(true);
  return result;
}

function resolve(research: FieldResearchStateV1, before: CombatState, action: CombatAction) {
  const after = resolveCombatTurn(before, action, seed);
  expect(isValidCombatState(after)).toBe(true);
  return { combat: after, research: advanceFieldResearch(research, before, after, { heroId, depthTick: after.turn + 10 }) };
}

describe("Inkcap False Treasure two-observation field research", () => {
  it("records the real application and a distinct pre-action poison loss without granting power", () => {
    const initial = fixture();
    const initialBytes = JSON.stringify(initial);
    expect(isValidCombatState(initial.combat)).toBe(true);
    const applied = apply(initial);
    const application = applied.fieldResearch.application!;
    expect(application).toMatchObject({ speciesId: "inkcap-mimic", abilityId: secretId,
      sourceEventId: `${initial.combat!.id}:1:3`, sourceTurn: 1, sourceTick: initial.tick + 1,
      actorId: `${initial.combat!.id}:enemy:0`, targetId: heroId, potency: 2, duration: 3, targetHealthAfter: 5 });
    expect(applied.fieldResearch.aftereffect).toBeNull();
    const finished = stepDepth(applied, { type: "combat-action", action: guard(applied.combat!) });
    expect(finished.fieldResearch.aftereffect).toEqual({ combatId: initial.combat!.id,
      sourceEventId: `${initial.combat!.id}:2:1`, sourceTick: initial.tick + 2, sourceTurn: 2,
      applicationEventId: application.sourceEventId, targetId: heroId, potency: 2,
      durationBefore: 3, durationAfter: 2, healthBefore: 5, amount: 2, healthAfter: 3 });
    expect(finished.hero).toEqual({ ...applied.hero, resources: { ...applied.hero.resources, health: 3 } });
    expect(finished.quest).toEqual(applied.quest);
    expect(finished.discoveries).toEqual(applied.discoveries);
    expect(finished.hero.monsterLore).toEqual(initial.hero.monsterLore);
    expect(JSON.stringify(initial)).toBe(initialBytes);
    expect(isValidFieldResearchState(finished.fieldResearch, heroId, finished.tick)).toBe(true);
    for (const value of [applied.fieldResearch, application, finished.fieldResearch, finished.fieldResearch.aftereffect]) expect(Object.isFrozen(value)).toBe(true);
  });

  it("resumes exact proof through JSON and retains it after the four-battle/event histories disappear", () => {
    const applied = apply();
    const loaded = upgradeDepthState(JSON.parse(JSON.stringify(applied)), seed, heroId, "Mara");
    const action = { type: "combat-action" as const, action: guard(applied.combat!) };
    expect(stepDepth(loaded, action)).toEqual(stepDepth(applied, action));
    const finished = complete();
    const later = { ...finished, combat: null, completedCombats: [], tick: finished.tick + 100 };
    expect(upgradeDepthState(JSON.parse(JSON.stringify(later)), seed, heroId, "Mara").fieldResearch).toEqual(finished.fieldResearch);
    const next = resolveCombatTurn(finished.combat!, guard(finished.combat!), seed);
    expect(advanceFieldResearch(finished.fieldResearch, finished.combat!, next, { heroId, depthTick: finished.tick + 1 })).toBe(finished.fieldResearch);
  });

  it("migrates schema21 empty despite old lore and retained qualifying receipts; the current schema also starts empty", () => {
    const finished = complete();
    const { fieldResearch: _research, ...previous } = finished;
    const upgraded = upgradeDepthState({ ...previous, schemaVersion: 21 }, seed, heroId, "Mara");
    expect(upgraded.schemaVersion).toBe(23);
    expect(upgraded.fieldResearch).toEqual(createFieldResearchState());
    expect(upgraded.hero.monsterLore).toEqual(finished.hero.monsterLore);
    expect(upgraded.combat).toEqual(finished.combat);
    expect(createDepthState(seed, heroId, "Mara").fieldResearch).toEqual(createFieldResearchState());
  });

  it("refreshes unfinished evidence to the latest genuine application but repeated casts alone remain one observation", () => {
    const initial = controlledPair();
    const first = resolve(createFieldResearchState(), initial, cast(initial));
    const second = resolve(first.research, first.combat, cast(first.combat));
    expect(second.research.aftereffect).toBeNull();
    expect(second.research.application!.sourceEventId).not.toBe(first.research.application!.sourceEventId);
    expect(second.research.application!.actorId).toBe(initial.turnOrder[1]);
    const finished = resolve(second.research, second.combat, guard(second.combat));
    expect(finished.research.aftereffect!.applicationEventId).toBe(second.research.application!.sourceEventId);
    expect(first.research.application!.sourceTurn).toBe(1);
  });

  it("rejects identical-potency poison overwritten by a different species or ability", () => {
    const initial = controlledPair(true);
    const first = resolve(createFieldResearchState(), initial, cast(initial));
    const overwritten = resolve(first.research, first.combat, { ...cast(first.combat), abilityId: "test:other:poison" });
    expect(overwritten.research).toBe(first.research);
    const harmed = resolve(overwritten.research, overwritten.combat, guard(overwritten.combat));
    expect(harmed.combat.eventStream.events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "status-tick", status: "poisoned", amount: 2 })]));
    expect(harmed.research.aftereffect).toBeNull();
  });

  it("does not credit a retained poison status when its original application packet is unavailable", () => {
    const applied = apply();
    const before: CombatState = { ...applied.combat!, eventStream: { schemaVersion: 2, firstRecordedTurn: 2, events: [] } };
    expect(isValidCombatState(before)).toBe(true);
    const after = resolveCombatTurn(before, guard(before), seed);
    expect(isValidCombatState(after)).toBe(true);
    expect(advanceFieldResearch(applied.fieldResearch, before, after, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
  });

  it("rejects missing, wrong-actor, wrong-species and future proof without gaining the delayed observation", () => {
    const applied = apply();
    const before = applied.combat!;
    const after = resolveCombatTurn(before, guard(before), seed);
    const application = applied.fieldResearch.application!;
    const variations: FieldResearchStateV1[] = [
      createFieldResearchState(),
      { ...applied.fieldResearch, application: { ...application, sourceEventId: `${before.id}:1:4` } },
      { ...applied.fieldResearch, application: { ...application, actorId: `${before.id}:enemy:1` } },
      { ...applied.fieldResearch, application: { ...application, sourceTick: applied.tick + 2 } },
    ];
    for (const state of variations) {
      expect(advanceFieldResearch(state, before, after, { heroId, depthTick: applied.tick + 1 })).toBe(state);
    }
    const wrongSpecies = { ...after, combatants: after.combatants.map((unit) => unit.side === "enemies" ? { ...unit, speciesId: "copperhorn" } : unit) };
    expect(advanceFieldResearch(applied.fieldResearch, before, wrongSpecies, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    expect(advanceFieldResearch(applied.fieldResearch, before, after, { heroId: "different-hero", depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
    expect(advanceFieldResearch(applied.fieldResearch, { ...before, id: "other-combat" }, after, { heroId, depthTick: applied.tick + 1 })).toBe(applied.fieldResearch);
  });

  it("records a fatal positive poison tick before terminal cleanup without pretending the hero survived", () => {
    const applied = apply();
    const critical: DepthState = { ...applied,
      hero: { ...applied.hero, resources: { ...applied.hero.resources, health: 1 } },
      combat: { ...applied.combat!, combatants: applied.combat!.combatants.map((unit) => unit.id === heroId ? { ...unit, health: 1 } : unit) },
    };
    const finished = stepDepth(critical, { type: "combat-action", action: guard(critical.combat!) });
    expect(finished.combat).toBeNull();
    expect(finished.completedCombats.at(-1)!.outcome).toBe("defeat");
    expect(finished.fieldResearch.aftereffect).toMatchObject({ healthBefore: 1, amount: 1, healthAfter: 0 });
    expect(isValidFieldResearchState(finished.fieldResearch, heroId, finished.tick)).toBe(true);
  });

  it("does not credit an application that kills the hero before a later observation is possible", () => {
    const initial = fixture();
    const critical: DepthState = { ...initial,
      hero: { ...initial.hero, resources: { ...initial.hero.resources, health: 1 } },
      combat: { ...initial.combat!, combatants: initial.combat!.combatants.map((unit) => unit.id === heroId ? { ...unit, health: 1 } : unit) },
    };
    const finished = apply(critical);
    expect(finished.combat).toBeNull();
    expect(finished.fieldResearch).toEqual(createFieldResearchState());
  });

  it("validates exact bounded persisted source identities, chronology and HP arithmetic", () => {
    const finished = complete();
    const proof = finished.fieldResearch;
    const application = proof.application!;
    const aftereffect = proof.aftereffect!;
    for (const invalid of [
      null, { ...proof, schemaVersion: 2 }, { ...proof, hiddenReward: 1 },
      { ...proof, application: null },
      { ...proof, application: { ...application, targetId: "another-hero" } },
      { ...proof, application: { ...application, actorId: "unbound-monster" } },
      { ...proof, application: { ...application, speciesId: "copperhorn" } },
      { ...proof, application: { ...application, sourceEventId: `${application.combatId}:1:0` } },
      { ...proof, application: { ...application, sourceTick: finished.tick + 1 } },
      { ...proof, application: { ...application, duration: 4 } },
      { ...proof, application: { ...application, potency: Number.MAX_SAFE_INTEGER + 1 } },
      { ...proof, aftereffect: { ...aftereffect, amount: 0 } },
      { ...proof, aftereffect: { ...aftereffect, healthAfter: 4 } },
      { ...proof, aftereffect: { ...aftereffect, sourceTurn: application.sourceTurn } },
      { ...proof, aftereffect: { ...aftereffect, applicationEventId: "unrelated-source" } },
      { ...proof, aftereffect: { ...aftereffect, durationAfter: 3 } },
    ]) {
      expect(isValidFieldResearchState(invalid, heroId, finished.tick)).toBe(false);
      expect(() => upgradeDepthState({ ...finished, fieldResearch: invalid }, seed, heroId, "Mara")).toThrow();
    }
  });
});
