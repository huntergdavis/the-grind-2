import { describe, expect, it } from "vitest";
import { advanceWorld, actorPolicy, campaignDirector, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { releasedCopperhornChain } from "../../tests/released-copperhorn-fixtures";
import { createCombat, isValidCombatState, monsterAbilityForLevel, monsterDefinitions, resolveCombatTurn } from "./combat";
import { advanceFieldResearch, createFieldResearchState, isValidFieldResearchState, upgradeFieldResearchState } from "./field-research";
import type { CombatAction, CombatState, FieldResearchStateV3 } from "./types";

const seed = "golden:27";
const abilityId = "secret:copperhorn:bellmetal-charge";
function selectedAction(world: WorldState): CombatAction {
  const selected = actorPolicy(world, campaignDirector(world));
  if (selected.command.type !== "combat-action") throw new Error("Released proof requires a real combat action");
  return selected.command.action;
}

function guard(combat: CombatState): CombatAction {
  return { actorId: combat.turnOrder[combat.activeIndex]!, type: "guard", targetId: null, abilityId: null, itemId: null };
}

/** Controlled source/overwrite negatives only; primary occurrence above changes no generated fields. */
function controlledPair(otherFire = false): CombatState {
  const hero = releasedCopperhornChain().before.depth.hero;
  const created = createCombat(seed, hero, "copperhorn:controlled", 2);
  const enemies = created.combatants.filter((actor) => actor.side === "enemies");
  const secret = monsterAbilityForLevel(monsterDefinitions[4], 1);
  return { ...created, activeIndex: 0, turnOrder: [enemies[0]!.id, hero.id, enemies[1]!.id],
    combatants: created.combatants.map((actor) => actor.id === hero.id ? { ...actor, health: actor.maxHealth } : {
      ...actor, speciesId: otherFire && actor.id === enemies[1]!.id ? "river-wyrmling" : "copperhorn",
      power: 1, health: 200, maxHealth: 200, mana: 20, maxMana: 20,
      abilities: [otherFire && actor.id === enemies[1]!.id ? { ...secret, id: "test:other-fire", sourceMonsterId: "river-wyrmling" } : secret],
    }) };
}

function resolve(research: FieldResearchStateV3, before: CombatState, action: CombatAction) {
  const after = resolveCombatTurn(before, action, seed);
  expect(isValidCombatState(before)).toBe(true);
  expect(isValidCombatState(after)).toBe(true);
  return { combat: after, research: advanceFieldResearch(research, before, after,
    { heroId: releasedCopperhornChain().before.hero.id, depthTick: after.turn + 100 }) };
}

function cast(combat: CombatState, id = abilityId): Extract<CombatAction, { type: "ability" }> {
  return { actorId: combat.turnOrder[combat.activeIndex]!, type: "ability", targetId: releasedCopperhornChain().before.hero.id, abilityId: id, itemId: null };
}

describe("Copperhorn final-ember field research", () => {
  it("resumes released Golden 27 application, intermediate burn, enemy Guard, then final burn before victory", () => {
    const { before, applied, first, guarded, finished } = releasedCopperhornChain();
    expect([before.tick, applied.tick, first.tick, guarded.tick, finished.tick]).toEqual([4, 5, 6, 7, 8]);
    expect(before.depth.fieldResearch.copperhorn).toEqual({ taskId: "copperhorn:final-ember@1", application: null, firstTick: null, aftereffect: null });
    const application = applied.depth.fieldResearch.copperhorn.application!;
    const combatId = before.depth.combat!.id;
    expect(application).toEqual({ speciesId: "copperhorn", abilityId, combatId,
      sourceEventId: `${combatId}:2:3`, sourceTick: 5, sourceTurn: 2, actorId: `${combatId}:enemy:0`,
      targetId: before.hero.id, potency: 2, duration: 2, targetHealthAfter: 30 });
    expect(applied.depth.fieldResearch.copperhorn.firstTick).toBeNull();
    expect(first.depth.fieldResearch.copperhorn.firstTick).toEqual({ combatId, sourceEventId: `${combatId}:3:1`,
      sourceTick: 6, sourceTurn: 3, applicationEventId: application.sourceEventId, targetId: before.hero.id,
      potency: 2, durationBefore: 2, durationAfter: 1, healthBefore: 30, amount: 2, healthAfter: 28 });
    expect(first.depth.fieldResearch.copperhorn.aftereffect).toBeNull();
    expect(guarded.depth.fieldResearch).toBe(first.depth.fieldResearch);
    expect(selectedAction(first).type).toBe("guard");
    expect(selectedAction(guarded)).toEqual({ actorId: before.hero.id, type: "ability",
      targetId: `${combatId}:enemy:0`, abilityId: "technique:springbolt", itemId: null });
    expect(finished.depth.fieldResearch.copperhorn.aftereffect).toEqual({ combatId, sourceEventId: `${combatId}:5:1`,
      sourceTick: 8, sourceTurn: 5, applicationEventId: application.sourceEventId, targetId: before.hero.id,
      potency: 2, durationBefore: 1, durationAfter: 0, healthBefore: 28, amount: 2, healthAfter: 26,
      firstTickEventId: `${combatId}:3:1`, intentEventId: `${combatId}:5:0` });
    const raw = resolveCombatTurn(guarded.depth.combat!, selectedAction(guarded), seed);
    expect(finished.depth.completedCombats.at(-1)).toEqual(raw);
    expect(raw.outcome).toBe("victory");
    expect(finished.depth.hero.resources.health).toBe(26);
    expect(finished.depth.fieldResearch.inkcap).toBe(guarded.depth.fieldResearch.inkcap);
    expect(finished.depth.fieldResearch.moonhowl).toBe(guarded.depth.fieldResearch.moonhowl);
    expect(isValidFieldResearchState(finished.depth.fieldResearch, before.hero.id, finished.tick)).toBe(true);
    const proof = finished.depth.fieldResearch.copperhorn;
    for (const value of [finished.depth.fieldResearch, proof, proof.application, proof.firstTick, proof.aftereffect]) expect(Object.isFrozen(value)).toBe(true);
  });

  it("resumes the first observation and intermediary exactly, then retains completed proof after event history disappears", () => {
    const { applied, first, finished } = releasedCopperhornChain();
    for (const world of [applied, first]) {
      const bytes = JSON.stringify(world);
      const restored = upgradeWorldState(JSON.parse(bytes));
      expect(JSON.stringify(advanceWorld(restored))).toBe(JSON.stringify(advanceWorld(world)));
      expect(JSON.stringify(world)).toBe(bytes);
    }
    const proof = finished.depth.fieldResearch;
    expect(upgradeFieldResearchState(JSON.parse(JSON.stringify(proof)), finished.hero.id, 200)).toEqual(proof);
    const unrelated = controlledPair();
    const next = resolveCombatTurn(unrelated, guard(unrelated), seed);
    expect(advanceFieldResearch(proof, unrelated, next, { heroId: finished.hero.id, depthTick: 200 })).toBe(proof);
  });

  it("cannot complete from expiry alone, a missing first tick, a forged source, or a foreign combat", () => {
    const { guarded, finished } = releasedCopperhornChain();
    const before = guarded.depth.combat!;
    const after = finished.depth.completedCombats.at(-1)!;
    const proof = guarded.depth.fieldResearch;
    const copperhorn = proof.copperhorn;
    const variations = [createFieldResearchState(),
      { ...proof, copperhorn: { ...copperhorn, firstTick: null } },
      { ...proof, copperhorn: { ...copperhorn, firstTick: { ...copperhorn.firstTick!, sourceEventId: `${before.id}:3:2` } } },
      { ...proof, copperhorn: { ...copperhorn, application: { ...copperhorn.application!, sourceEventId: `${before.id}:2:2` } } },
    ];
    for (const research of variations) expect(advanceFieldResearch(research, before, after,
      { heroId: guarded.hero.id, depthTick: finished.tick })).toBe(research);
    expect(advanceFieldResearch(proof, { ...before, id: "different" }, after, { heroId: guarded.hero.id, depthTick: finished.tick })).toBe(proof);
    expect(advanceFieldResearch(proof, before, after, { heroId: "another-hero", depthTick: finished.tick })).toBe(proof);
  });

  it("requires unpruned application and intermediate combat packets, not just persisted matching potency", () => {
    const { guarded } = releasedCopperhornChain();
    const before = guarded.depth.combat!;
    const pruned = { ...before, eventStream: { ...before.eventStream, firstRecordedTurn: 4,
      events: before.eventStream.events.filter((event) => event.turn >= 4) } };
    expect(isValidCombatState(pruned)).toBe(true);
    const after = resolveCombatTurn(pruned, selectedAction(guarded), seed);
    expect(advanceFieldResearch(guarded.depth.fieldResearch, pruned, after,
      { heroId: guarded.hero.id, depthTick: guarded.tick + 1 })).toBe(guarded.depth.fieldResearch);
  });

  it.each([false, true])("resets the intermediate source when burning is overwritten, other fire=%s", (otherFire) => {
    const initial = controlledPair(otherFire);
    const first = resolve(createFieldResearchState(), initial, cast(initial));
    const ticked = resolve(first.research, first.combat, guard(first.combat));
    expect(ticked.research.copperhorn.firstTick).not.toBeNull();
    const replacement = resolve(ticked.research, ticked.combat, cast(ticked.combat, otherFire ? "test:other-fire" : abilityId));
    expect(replacement.research.copperhorn.firstTick).toBeNull();
    expect(replacement.research.copperhorn.aftereffect).toBeNull();
    const enemyWait = resolve(replacement.research, replacement.combat, guard(replacement.combat));
    const nextTick = resolve(enemyWait.research, enemyWait.combat, guard(enemyWait.combat));
    expect(nextTick.research.copperhorn.aftereffect).toBeNull();
    if (otherFire) {
      expect(nextTick.research.copperhorn.firstTick).toBeNull();
      expect(nextTick.research.copperhorn.application).toEqual(first.research.copperhorn.application);
    } else {
      expect(nextTick.research.copperhorn.firstTick?.applicationEventId).toBe(replacement.research.copperhorn.application?.sourceEventId);
      expect(replacement.research.copperhorn.application?.sourceEventId).not.toBe(first.research.copperhorn.application?.sourceEventId);
    }
  });

  it("records fatal final burning before an interrupted intent without inventing a completed action", () => {
    const { guarded } = releasedCopperhornChain();
    // Controlled fatal edge; the released occurrence above survives.
    const before = { ...guarded.depth.combat!, combatants: guarded.depth.combat!.combatants.map((actor) => actor.id === guarded.hero.id
      ? { ...actor, health: 1 } : actor) };
    const after = resolveCombatTurn(before, guard(before), seed);
    expect(isValidCombatState(before)).toBe(true);
    expect(isValidCombatState(after)).toBe(true);
    expect(after.outcome).toBe("defeat");
    const research = advanceFieldResearch(guarded.depth.fieldResearch, before, after, { heroId: guarded.hero.id, depthTick: guarded.tick + 1 });
    expect(research.copperhorn.aftereffect).toMatchObject({ healthBefore: 1, amount: 1, healthAfter: 0, intentEventId: `${before.id}:5:0` });
    expect(after.eventStream.events.filter((event) => event.turn === 5).some((event) => event.kind === "damage"
      || (event.kind === "status-applied" && event.status === "guarding"))).toBe(false);
  });

  it("migrates exact V1/V2 evidence without retrospectively observing old Copperhorn battles", () => {
    const { finished } = releasedCopperhornChain();
    const current = finished.depth.fieldResearch;
    const old = { schemaVersion: 2 as const, inkcap: current.inkcap, moonhowl: current.moonhowl };
    const before = JSON.stringify(old);
    const upgraded = upgradeFieldResearchState(old, finished.hero.id, finished.tick);
    expect(upgraded.inkcap).toEqual(old.inkcap);
    expect(upgraded.moonhowl).toEqual(old.moonhowl);
    expect(upgraded.copperhorn).toEqual(createFieldResearchState().copperhorn);
    expect(upgradeFieldResearchState(old.inkcap, finished.hero.id, finished.tick).copperhorn).toEqual(upgraded.copperhorn);
    expect(upgradeFieldResearchState(JSON.parse(JSON.stringify(upgraded)), finished.hero.id, finished.tick)).toEqual(upgraded);
    expect(JSON.stringify(old)).toBe(before);
    expect(Object.isFrozen(upgraded.copperhorn)).toBe(true);
  });

  it("rejects extra/future/malformed research and inconsistent source, chronology, duration or HP proof", () => {
    const { finished } = releasedCopperhornChain();
    const state = finished.depth.fieldResearch;
    const proof = state.copperhorn, application = proof.application!, first = proof.firstTick!, final = proof.aftereffect!;
    const malformed = [null, { ...proof, extra: true }, { ...proof, taskId: "different" }, { ...proof, application: null }, { ...proof, firstTick: null },
      { ...proof, application: { ...application, targetHealthAfter: 0 } },
      { ...proof, application: { ...application, speciesId: "inkcap-mimic" } },
      { ...proof, application: { ...application, sourceTick: finished.tick + 1 } },
      { ...proof, firstTick: { ...first, durationBefore: 1 } },
      { ...proof, firstTick: { ...first, amount: 0 } },
      { ...proof, aftereffect: { ...final, firstTickEventId: application.sourceEventId } },
      { ...proof, aftereffect: { ...final, intentEventId: first.sourceEventId } },
      { ...proof, aftereffect: { ...final, sourceTurn: first.sourceTurn } },
      { ...proof, aftereffect: { ...final, sourceTick: first.sourceTick } },
      { ...proof, aftereffect: { ...final, durationAfter: 1 } },
      { ...proof, aftereffect: { ...final, healthAfter: final.healthBefore } },
    ];
    for (const copperhorn of malformed) {
      const invalid = { ...state, copperhorn };
      expect(isValidFieldResearchState(invalid, finished.hero.id, finished.tick)).toBe(false);
      expect(() => upgradeFieldResearchState(invalid, finished.hero.id, finished.tick)).toThrow("malformed");
    }
    for (const invalid of [{ ...state, schemaVersion: 4 }, { ...state, extra: true },
      { schemaVersion: 2, inkcap: state.inkcap, moonhowl: state.moonhowl, copperhorn: proof }]) {
      expect(() => upgradeFieldResearchState(invalid, finished.hero.id, finished.tick)).toThrow("malformed");
    }
  });
});
