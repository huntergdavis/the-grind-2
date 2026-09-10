import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { createCombat, monsterAbilityForLevel, monsterDefinition, resolveCombatTurn } from "../depth/combat";
import { advanceFieldResearch, createFieldResearchState, inkcapResearchClue, moonhowlResearchClue } from "../depth/field-research";
import { observeMonsters } from "../depth/rpg";
import type { CombatState, FieldResearchStateV2 } from "../depth/types";
import { projectCodexView, projectInkcapFieldResearch, projectMoonhowlFieldResearch } from "./view-projection";

function researchJourney(species: "inkcap-mimic" | "lantern-wolf" = "inkcap-mimic") {
  const base = createWorld("field-research-view", "campaign:field-research-view");
  const definition = monsterDefinition(species)!;
  const created = createCombat(base.seed, base.depth.hero, `encounter:field-research-view:${species}`, 1);
  const enemyId = created.combatants.find((unit) => unit.side === "enemies")!.id;
  // Controlled unrated combat, not a claim that a route sampled these stats.
  // The ability, status application, damage and research receipts are produced
  // by real reducers. Projection fixtures below are not imported saved worlds.
  const combat: CombatState = { ...created, turnOrder: [enemyId, base.hero.id], activeIndex: 0,
    combatants: created.combatants.map((unit) => unit.id === enemyId ? {
      ...unit, name: "An observed combatant", speciesId: definition.id,
      health: 120, maxHealth: 120, power: 1, mana: unit.maxMana,
      abilities: [monsterAbilityForLevel(definition, base.depth.hero.level)],
    } : unit),
  };
  const applied = resolveCombatTurn(combat, { type: "ability", actorId: enemyId, targetId: base.hero.id,
    abilityId: definition.secret.id, itemId: null }, base.seed);
  const first = advanceFieldResearch(createFieldResearchState(), combat, applied, { heroId: base.hero.id, depthTick: 10 });
  const acted = resolveCombatTurn(applied, { type: "attack", actorId: base.hero.id, targetId: enemyId, abilityId: null, itemId: null }, base.seed);
  const complete = advanceFieldResearch(first, applied, acted, { heroId: base.hero.id, depthTick: 11 });
  function world(state: CombatState | null, fieldResearch: FieldResearchStateV2, tick: number): WorldState {
    return { ...base, tick, depth: { ...base.depth, tick, combat: state, fieldResearch } };
  }
  return { base, combat, applied, acted, first, complete, world };
}

describe("Inkcap Mimic field research Codex projection", () => {
  it("keeps unseen species hidden and starts without invented observations", () => {
    const base = createWorld("research-unseen", "campaign:research-unseen");
    expect(projectCodexView(base).monsters).toEqual([]);
    expect(projectInkcapFieldResearch(base)).toMatchObject({ progress: 0, clue: null, application: null, aftereffect: null });
  });

  it("shows a directly witnessed Inkcap at 0/2 without inventing lore or names from IDs", () => {
    const journey = researchJourney();
    const before = journey.world(journey.combat, createFieldResearchState(), 9);
    const serialized = JSON.stringify(before);
    expect(projectCodexView(before).monsters).toEqual([expect.objectContaining({
      monsterId: "inkcap-mimic", monsterName: "Inkcap Mimic", encounters: 0, victories: 0, observedOnly: true,
      technique: null, techniqueStatus: "studying", fieldResearch: expect.objectContaining({ progress: 0, clue: null }),
    })]);
    expect(projectCodexView(before).monsters[0]!.monsterName).not.toBe("An observed combatant");
    expect(before.depth.hero.monsterLore).toEqual([]);
    expect(JSON.stringify(before)).toBe(serialized);
  });

  it("preserves a real combat-start encounter count instead of adding a research encounter", () => {
    const journey = researchJourney();
    const before = journey.world(journey.combat, createFieldResearchState(), 9);
    const observed = { ...before, depth: { ...before.depth, hero: observeMonsters(before.depth.hero, journey.combat.combatants) } };
    const entry = projectCodexView(observed).monsters[0]!;
    expect(entry).toMatchObject({ encounters: 1, victories: 0, insight: 0, fieldResearch: { progress: 0 } });
    expect(entry.observedOnly).toBeUndefined();
    expect(observed.depth.hero.monsterLore[0]!.encounters).toBe(1);
  });

  it("shows the exact application, then positive pre-action poison HP change, as two different observations", () => {
    const journey = researchJourney();
    expect(journey.first.inkcap.application).not.toBeNull();
    expect(journey.first.inkcap.aftereffect).toBeNull();
    expect(journey.complete.inkcap.aftereffect?.amount).toBeGreaterThan(0);
    const first = projectInkcapFieldResearch(journey.world(journey.applied, journey.first, 10));
    expect(first).toMatchObject({ progress: 1, clue: null, application: journey.first.inkcap.application, aftereffect: null });
    expect(first.applicationText).toContain(`T10 · Combat turn 1: False Treasure applied poison to the hero`);
    expect(first.applicationText).toContain(`HP ${journey.first.inkcap.application!.targetHealthAfter} after application`);
    const aftereffect = journey.complete.inkcap.aftereffect!;
    const completed = projectInkcapFieldResearch(journey.world(journey.acted, journey.complete, 11));
    expect(completed).toMatchObject({ progress: 2, clue: inkcapResearchClue, application: journey.first.inkcap.application, aftereffect });
    expect(completed.aftereffectText).toBe(`T11 · Combat turn 2: poison harmed the hero before acting · HP ${aftereffect.healthBefore}→${aftereffect.healthAfter} (−${aftereffect.amount}) · duration ${aftereffect.durationBefore}→${aftereffect.durationAfter}.`);
    expect(aftereffect.applicationEventId).toBe(journey.first.inkcap.application!.sourceEventId);
  });

  it("keeps retained research readable after combat records leave the view and through JSON reload, without claiming a learned ability", () => {
    const journey = researchJourney();
    const after = journey.world(null, journey.complete, 200);
    const before = JSON.stringify(after);
    const codex = projectCodexView(after);
    expect(codex).toMatchObject({ recordedCount: 1, learnedCount: 0, monsters: [expect.objectContaining({
      techniqueStatus: "studying", technique: null, insight: 0, fieldResearch: expect.objectContaining({ progress: 2, clue: inkcapResearchClue }),
    })] });
    expect(projectCodexView(JSON.parse(before))).toEqual(codex);
    expect(after.depth.hero.abilities).toEqual(journey.base.depth.hero.abilities);
    expect(after.depth.hero.monsterLore).toEqual([]);
    expect(JSON.stringify(after)).toBe(before);
  });

  it("does not display future, another hero's, or mismatched-source evidence", () => {
    const journey = researchJourney();
    const future = journey.world(null, journey.complete, 10);
    expect(projectInkcapFieldResearch(future).progress).toBe(0);
    expect(projectCodexView(future).monsters).toEqual([]);
    const foreign = { ...journey.complete, inkcap: { ...journey.complete.inkcap, application: { ...journey.complete.inkcap.application!, targetId: "hero:other" } } };
    expect(projectCodexView(journey.world(null, foreign, 11)).monsters).toEqual([]);
    const mismatched = { ...journey.complete, inkcap: { ...journey.complete.inkcap, aftereffect: { ...journey.complete.inkcap.aftereffect!, applicationEventId: "unrelated:1:0" } } };
    expect(projectInkcapFieldResearch(journey.world(null, mismatched, 11))).toMatchObject({ progress: 0, clue: null, application: null, aftereffect: null });
  });
});

describe("Lantern Wolf field research Codex projection", () => {
  it("keeps an unseen wolf hidden and shows a witnessed wolf at 0/2 without fabricated lore", () => {
    const journey = researchJourney("lantern-wolf");
    expect(projectCodexView(journey.base).monsters).toEqual([]);
    expect(projectMoonhowlFieldResearch(journey.base)).toMatchObject({ title: "Study Moonhowl", progress: 0, clue: null });
    const before = journey.world(journey.combat, createFieldResearchState(), 9);
    const card = projectCodexView(before).monsters[0]!;
    expect(card).toMatchObject({ monsterId: "lantern-wolf", monsterName: "Lantern Wolf", encounters: 0, victories: 0,
      observedOnly: true, technique: null, fieldResearch: { taskId: "lantern-wolf:moonhowl@1", title: "Study Moonhowl", progress: 0 } });
    expect(before.depth.hero.monsterLore).toEqual([]);
    const observed = { ...before, depth: { ...before.depth, hero: observeMonsters(before.depth.hero, journey.combat.combatants) } };
    expect(projectCodexView(observed).monsters[0]).toMatchObject({ encounters: 1, victories: 0, insight: 0 });
    expect(projectCodexView(observed).monsters[0]!.observedOnly).toBeUndefined();
  });

  it("separates the hero's zero-damage weakening tick from the foe's actual strike damage", () => {
    const journey = researchJourney("lantern-wolf");
    const application = journey.first.moonhowl.application!;
    const aftereffect = journey.complete.moonhowl.aftereffect!;
    expect(application).not.toBeNull();
    expect(aftereffect).not.toBeNull();
    const first = projectMoonhowlFieldResearch(journey.world(journey.applied, journey.first, 10));
    expect(first).toMatchObject({ progress: 1, clue: null, application, aftereffect: null });
    expect(first.applicationText).toBe(`T10 · Combat turn 1: Moonhowl weakened the hero · potency ${application.potency} · 2 turns · Hero HP ${application.targetHealthAfter} after application.`);
    const complete = projectMoonhowlFieldResearch(journey.world(journey.acted, journey.complete, 11));
    expect(complete).toMatchObject({ progress: 2, clue: moonhowlResearchClue, application, aftereffect });
    expect(aftereffect).toMatchObject({ targetId: journey.base.hero.id, amount: 0, healthAfter: aftereffect.healthBefore,
      durationBefore: 2, durationAfter: 1, applicationEventId: application.sourceEventId, action: "attack", abilityId: null });
    expect(aftereffect.strikeTargetId).not.toBe(aftereffect.targetId);
    expect(aftereffect.damage).toBeGreaterThan(0);
    expect(aftereffect.targetHealthAfter).toBe(aftereffect.targetHealthBefore - aftereffect.damage);
    expect(complete.aftereffectText).toBe(`T11 · Combat turn 2: weakening remained before the hero's strike · Hero HP ${aftereffect.healthBefore}→${aftereffect.healthAfter} (no status damage) · duration 2→1 · raw-power penalty ${aftereffect.potency}. The hero then struck a foe · Foe HP ${aftereffect.targetHealthBefore}→${aftereffect.targetHealthAfter} (−${aftereffect.damage}). This is the recorded hit, not an unweakened damage comparison.`);
    expect(complete.aftereffectText).not.toContain(aftereffect.strikeTargetId);
    expect(complete.aftereffectText).not.toContain("An observed combatant");
    expect(journey.acted.eventStream.events.find((event) => event.id === aftereffect.sourceEventId)?.kind).toBe("status-tick");
    expect(journey.acted.eventStream.events.find((event) => event.id === aftereffect.intentEventId)?.kind).toBe("intent");
    expect(journey.acted.eventStream.events.find((event) => event.id === aftereffect.damageEventId)?.kind).toBe("damage");
  });

  it("does not reveal the completion clue when the weakened hero guards instead of striking", () => {
    const journey = researchJourney("lantern-wolf");
    const guarded = resolveCombatTurn(journey.applied, { type: "guard", actorId: journey.base.hero.id,
      targetId: null, abilityId: null, itemId: null }, journey.base.seed);
    const research = advanceFieldResearch(journey.first, journey.applied, guarded, { heroId: journey.base.hero.id, depthTick: 11 });
    expect(projectMoonhowlFieldResearch(journey.world(guarded, research, 11))).toMatchObject({ progress: 1, clue: null, aftereffect: null });
  });

  it("keeps both fixed studies through JSON reload and removed combat history without granting abilities or victories", () => {
    const inkcap = researchJourney();
    const wolf = researchJourney("lantern-wolf");
    const research: FieldResearchStateV2 = { schemaVersion: 2, inkcap: inkcap.complete.inkcap, moonhowl: wolf.complete.moonhowl };
    const state = wolf.world(null, research, 200);
    const serialized = JSON.stringify(state);
    const codex = projectCodexView(state);
    expect(codex).toMatchObject({ recordedCount: 2, learnedCount: 0 });
    expect(codex.monsters.map((card) => [card.monsterId, card.fieldResearch?.progress, card.fieldResearch?.clue])).toEqual([
      ["inkcap-mimic", 2, inkcapResearchClue], ["lantern-wolf", 2, moonhowlResearchClue],
    ]);
    expect(codex.monsters.every((card) => card.encounters === 0 && card.victories === 0 && card.technique === null)).toBe(true);
    expect(projectCodexView(JSON.parse(serialized))).toEqual(codex);
    expect(state.depth.hero.abilities).toEqual(wolf.base.depth.hero.abilities);
    expect(state.depth.hero.monsterLore).toEqual([]);
    expect(JSON.stringify(state)).toBe(serialized);
  });

  it("validates the entire two-task state before showing future, foreign, or mismatched-source proof", () => {
    const journey = researchJourney("lantern-wolf");
    const future = journey.world(null, journey.complete, 10);
    expect(projectCodexView(future).monsters).toEqual([]);
    const invalid: FieldResearchStateV2[] = [
      { ...journey.complete, moonhowl: { ...journey.complete.moonhowl,
        application: { ...journey.complete.moonhowl.application!, targetId: "hero:other" } } },
      { ...journey.complete, moonhowl: { ...journey.complete.moonhowl,
        aftereffect: { ...journey.complete.moonhowl.aftereffect!, applicationEventId: "unrelated:1:0" } } },
      { ...journey.complete, moonhowl: { ...journey.complete.moonhowl,
        aftereffect: { ...journey.complete.moonhowl.aftereffect!, strikeTargetId: journey.base.hero.id } } },
    ];
    for (const research of invalid) {
      const state = journey.world(null, research, 11);
      expect(projectCodexView(state).monsters).toEqual([]);
      expect(projectMoonhowlFieldResearch(state)).toMatchObject({ progress: 0, clue: null, application: null, aftereffect: null });
    }
    const inkcap = researchJourney();
    const corruptOtherTask = { ...invalid[0]!, inkcap: inkcap.complete.inkcap };
    expect(projectInkcapFieldResearch(journey.world(null, corruptOtherTask, 11))).toMatchObject({ progress: 0, clue: null });
  });
});
