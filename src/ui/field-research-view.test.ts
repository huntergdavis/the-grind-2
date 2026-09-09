import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { createCombat, monsterAbilityForLevel, monsterDefinition, resolveCombatTurn } from "../depth/combat";
import { advanceFieldResearch, createFieldResearchState, inkcapResearchClue } from "../depth/field-research";
import { observeMonsters } from "../depth/rpg";
import type { CombatState, FieldResearchStateV1 } from "../depth/types";
import { projectCodexView, projectInkcapFieldResearch } from "./view-projection";

function researchJourney() {
  const base = createWorld("field-research-view", "campaign:field-research-view");
  const definition = monsterDefinition("inkcap-mimic")!;
  const created = createCombat(base.seed, base.depth.hero, "encounter:field-research-view", 1);
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
  function world(state: CombatState | null, fieldResearch: FieldResearchStateV1, tick: number): WorldState {
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
    expect(journey.first.application).not.toBeNull();
    expect(journey.first.aftereffect).toBeNull();
    expect(journey.complete.aftereffect?.amount).toBeGreaterThan(0);
    const first = projectInkcapFieldResearch(journey.world(journey.applied, journey.first, 10));
    expect(first).toMatchObject({ progress: 1, clue: null, application: journey.first.application, aftereffect: null });
    expect(first.applicationText).toContain(`T10 · Combat turn 1: False Treasure applied poison to the hero`);
    expect(first.applicationText).toContain(`HP ${journey.first.application!.targetHealthAfter} after application`);
    const aftereffect = journey.complete.aftereffect!;
    const completed = projectInkcapFieldResearch(journey.world(journey.acted, journey.complete, 11));
    expect(completed).toMatchObject({ progress: 2, clue: inkcapResearchClue, application: journey.first.application, aftereffect });
    expect(completed.aftereffectText).toBe(`T11 · Combat turn 2: poison harmed the hero before acting · HP ${aftereffect.healthBefore}→${aftereffect.healthAfter} (−${aftereffect.amount}) · duration ${aftereffect.durationBefore}→${aftereffect.durationAfter}.`);
    expect(aftereffect.applicationEventId).toBe(journey.first.application!.sourceEventId);
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
    const foreign = { ...journey.complete, application: { ...journey.complete.application!, targetId: "hero:other" } };
    expect(projectCodexView(journey.world(null, foreign, 11)).monsters).toEqual([]);
    const mismatched = { ...journey.complete, aftereffect: { ...journey.complete.aftereffect!, applicationEventId: "unrelated:1:0" } };
    expect(projectInkcapFieldResearch(journey.world(null, mismatched, 11))).toMatchObject({ progress: 0, clue: null, application: null, aftereffect: null });
  });
});
