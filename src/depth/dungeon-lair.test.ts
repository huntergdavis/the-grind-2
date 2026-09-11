import { describe, expect, it } from "vitest";
import { naturalDungeonGuardianJourneyFixture, naturalDungeonLairBeforeArrivalFixture, naturalDungeonLairFixture } from "../../tests/dungeon-lair-fixtures";
import { chooseCombatAction, createCombat, isValidCombatState, maximumCombatTurns } from "./combat";
import { generateDungeon, isValidDungeonState } from "./dungeon";
import { createDungeonLairState, dungeonGuardianCommandId, dungeonGuardianResolutionCommandId, isValidCampaignDungeonLair,
  isValidDungeonLair, recordDungeonLairOutcome, revealDungeonLair, selectDungeonLairEncounter } from "./dungeon-lair";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { addItem, createWeaponUseMastery, derivedStats, equipItem, generateLoot } from "./rpg";
import { isValidEncounterThreatProvenance } from "./threat";
import type { DepthState, DungeonState } from "./types";

function reloaded(state: DepthState): DepthState {
  return upgradeDepthState(structuredClone(state), state.seed, state.hero.id, state.hero.name);
}
function start(state: DepthState): DepthState {
  const selection = selectDungeonLairEncounter(state);
  if (selection === null) throw new Error("Actual arrival lost its guardian");
  return stepDepth(state, { type: "start-dungeon-guardian", dungeonId: selection.dungeonId,
    cellId: selection.cellId, encounterId: selection.encounterId });
}

describe("one actual dungeon guardian, not a repeatable room reward", () => {
  it("opts new expeditions in without changing old geometry or fabricating legacy inhabitants", () => {
    const old = generateDungeon("lair-legacy", "dungeon:location:7", 6, 6, false, 2, 2, 1);
    const current = generateDungeon("lair-legacy", old.id, 6, 6, false, 2, 2, 1, 1);
    expect(current).toEqual({ ...old, lair: createDungeonLairState() });
    expect(Object.hasOwn(old, "lair")).toBe(false);
    expect(isValidDungeonState(old)).toBe(true);
    expect(isValidDungeonState(current)).toBe(true);
    for (const value of [undefined, null, {}, { schemaVersion: 1, rulesVersion: "occupied-lair-v2", encounter: null }]) {
      expect(isValidDungeonState({ ...old, lair: value })).toBe(false);
    }
    expect(() => generateDungeon("lair-legacy", old.id, 6, 6, false, 2, 2, 1, 2 as 1)).toThrow("lair rules");
  });

  it("binds the real first arrival and next battle to one actual guardian without weakening road admission", () => {
    const before = naturalDungeonLairBeforeArrivalFixture().depth, arrived = naturalDungeonLairFixture().depth;
    const encounter = arrived.dungeon!.lair!.encounter!, selection = selectDungeonLairEncounter(arrived)!;
    expect(encounter.arrival).toEqual({ tick: arrived.tick,
      sourceCommandId: `depth:${arrived.tick}:dungeon:${arrived.dungeon!.id}:west`, fromCellId: before.dungeon!.currentCellId,
      direction: "west", turn: arrived.dungeon!.turns });
    expect(before.dungeon!.visitedCellIds).not.toContain(encounter.cellId);
    expect(encounter.cellId).toBe("dungeon:location:7:cell:1,6");
    expect(revealDungeonLair(before, arrived, encounter.arrival.sourceCommandId)).toEqual(arrived.dungeon);
    expect(reloaded(arrived)).toEqual(arrived);
    expect(selection.sourceCommandId).toBe(dungeonGuardianCommandId(arrived.tick + 1,
      { type: "start-dungeon-guardian", dungeonId: selection.dungeonId, cellId: selection.cellId, encounterId: selection.encounterId }));
    expect(() => stepDepth(arrived, { type: "start-combat", encounterId: encounter.combatId, enemyCount: 1 })).toThrow();
    const active = start(arrived);
    expect(active.dungeon!.currentCellId).toBe(encounter.cellId);
    expect(active.hero.resources).toEqual(arrived.hero.resources);
    expect(active.hero.gold).toBe(arrived.hero.gold);
    expect(active.combat!.combatants).toHaveLength(2);
    expect(active.combat!.combatants[1]).toMatchObject(encounter.guardian);
    expect(active.combat!.threat).toMatchObject({ rating: "dungeon-bound", rulesVersion: "dungeon-threat-v1",
      dungeonId: encounter.dungeonId, cellId: encounter.cellId, locationId: encounter.locationId, questModifier: 0 });
    expect(active.combat!.threat).not.toHaveProperty("edgeId");
    expect(reloaded(active)).toEqual(active);
    expect(selectDungeonLairEncounter(active)).toBeNull();
    const delayedTick = active.tick + 1;
    const delayed = { ...active.dungeon!, lair: { ...active.dungeon!.lair!, encounter: { ...active.dungeon!.lair!.encounter!,
      started: { tick: delayedTick, sourceCommandId: dungeonGuardianCommandId(delayedTick,
        { type: "start-dungeon-guardian", dungeonId: selection.dungeonId, cellId: selection.cellId, encounterId: selection.encounterId }) } } } };
    expect(isValidDungeonLair(delayed, delayedTick)).toBe(false);
  });

  it("uses actual dungeon danger and rejects fabricated location, danger, enemy and arrival sources", () => {
    const arrived = naturalDungeonLairFixture().depth, active = start(arrived), combat = active.combat!;
    expect(isValidCombatState(combat)).toBe(true);
    expect(isValidEncounterThreatProvenance(combat.threat, active.atlas)).toBe(true);
    const selection = selectDungeonLairEncounter(arrived)!;
    const altered = createCombat(active.seed, arrived.hero, combat.id, 1, [], { ...selection.threatContext,
      placeDanger: selection.threatContext.placeDanger === 1 ? 2 : 1 });
    expect(isValidCombatState(altered)).toBe(true);
    expect(isValidEncounterThreatProvenance(altered.threat, active.atlas)).toBe(false);
    expect(isValidCampaignDungeonLair({ ...active, combat: altered })).toBe(false);
    const receipt = arrived.dungeon!.lair!.encounter!;
    for (const patch of [
      { guardian: { ...receipt.guardian, name: "An invented inhabitant" } },
      { arrival: { ...receipt.arrival, sourceCommandId: `${receipt.arrival.sourceCommandId}:invented` } },
      { arrival: { ...receipt.arrival, tick: receipt.arrival.tick - 1 } },
      { locationId: arrived.atlas.locations.find((location) => location.kind === "town")!.id },
    ]) {
      const forged = { ...arrived, dungeon: { ...arrived.dungeon!, lair: { ...arrived.dungeon!.lair!, encounter: { ...receipt, ...patch } } } };
      expect(isValidCampaignDungeonLair(forged)).toBe(false);
      expect(() => reloaded(forged)).toThrow();
    }
  });

  it("does not reveal old-save, already visited, forged-direction or owed-recovery arrivals", () => {
    const before = naturalDungeonLairBeforeArrivalFixture().depth, arrived = naturalDungeonLairFixture().depth;
    const empty = { ...arrived.dungeon!, lair: createDungeonLairState() }, source = arrived.dungeon!.lair!.encounter!.arrival.sourceCommandId;
    const legacy: DungeonState = { ...empty }; delete legacy.lair;
    expect(revealDungeonLair(before, { ...arrived, dungeon: legacy }, source)).toBe(legacy);
    expect(revealDungeonLair(before, { ...arrived, dungeon: empty }, `${source}:invented`)).toBe(empty);
    expect(revealDungeonLair({ ...before, dungeon: { ...before.dungeon!, visitedCellIds: [...before.dungeon!.visitedCellIds, empty.currentCellId] } },
      { ...arrived, dungeon: empty }, source)).toBe(empty);
    const wounded = { ...arrived, dungeon: empty, hero: { ...arrived.hero, resources: { ...arrived.hero.resources, health: 1 } } };
    expect(revealDungeonLair(before, wounded, source)).toBe(empty);
  });

  it("retains the actual terminal battle through reload and bounded combat-history pruning", () => {
    const journey = naturalDungeonGuardianJourneyFixture(), state = journey.resolved.depth;
    const encounter = state.dungeon!.lair!.encounter!, resolution = encounter.resolution!;
    expect(resolution.outcome).toBe(resolution.combat.outcome);
    expect(resolution.combat).toEqual(state.completedCombats.find((combat) => combat.id === encounter.combatId));
    expect(resolution.tick).toBe(encounter.started!.tick + resolution.combat.turn);
    expect(resolution.sourceCommandId).toBe(dungeonGuardianResolutionCommandId(resolution.combat, state.tick));
    expect(reloaded(state)).toEqual(state);
    expect(selectDungeonLairEncounter(state)).toBeNull();
    expect(journey.next.chronicle.at(-1)!.commandType).not.toBe("start-dungeon-guardian");
    const later = { ...journey.next.depth, tick: journey.next.tick + 1, completedCombats: [] };
    expect(isValidCampaignDungeonLair(later)).toBe(true);
    expect(later.dungeon!.lair).toEqual(state.dungeon!.lair);
    const fakeCombat = structuredClone(resolution.combat); fakeCombat.combatants[1]!.name = "Imaginary guardian";
    const forged = { ...state, dungeon: { ...state.dungeon!, lair: { ...state.dungeon!.lair!, encounter: { ...encounter,
      resolution: { ...resolution, combat: fakeCombat } } } } };
    expect(isValidCampaignDungeonLair(forged)).toBe(false);
  });

  it("records an actual legal guard-only defeat, recovers at entry, and never offers a rematch", () => {
    const arrived = naturalDungeonLairFixture().depth;
    let state = start(arrived);
    const inventory = structuredClone(state.hero.inventory), gold = state.hero.gold;
    for (let turn = 0; state.combat !== null && turn < maximumCombatTurns; turn += 1) {
      const combat = state.combat, actorId = combat.turnOrder[combat.activeIndex]!;
      state = stepDepth(state, { type: "combat-action", action: actorId === state.hero.id
        ? { actorId, type: "guard", targetId: null, abilityId: null, itemId: null } : chooseCombatAction(combat) });
    }
    expect(state.combat).toBeNull();
    expect(state.dungeon!.lair!.encounter!.resolution!.outcome).toBe("defeat");
    expect(state.hero.resources.health).toBe(0);
    expect(state.hero.gold).toBe(gold);
    expect(state.hero.inventory).toEqual(inventory);
    expect(reloaded(state)).toEqual(state);
    const recovered = stepDepth(state, { type: "wait" });
    expect(recovered.dungeon!.currentCellId).toBe(recovered.dungeon!.entryCellId);
    expect(recovered.hero.resources.health).toBeGreaterThan(0);
    expect(recovered.dungeon!.lair).toEqual(state.dungeon!.lair);
    expect(selectDungeonLairEncounter(recovered)).toBeNull();
    expect(depthCommandCandidates(recovered).every((candidate) => candidate.command.type !== "start-dungeon-guardian")).toBe(true);
    expect(reloaded(recovered)).toEqual(recovered);
  });

  it("rejects duplicated settlement and source tampering instead of granting another reward", () => {
    const journey = naturalDungeonGuardianJourneyFixture(), state = journey.resolved.depth, receipt = state.dungeon!.lair!.encounter!;
    expect(() => start(state)).toThrow("lost its guardian");
    expect(() => recordDungeonLairOutcome(state, receipt.resolution!.combat, receipt.resolution!.sourceCommandId)).toThrow();
    const forged = { ...state.dungeon!, lair: { ...state.dungeon!.lair!, encounter: { ...receipt,
      resolution: { ...receipt.resolution!, sourceCommandId: `${receipt.resolution!.sourceCommandId}:again` } } } };
    expect(isValidDungeonLair(forged, state.tick)).toBe(false);
    expect(isValidDungeonLair(state.dungeon!, receipt.arrival.tick - 1)).toBe(false);
    const recovered = journey.next.depth;
    const foreign = createCombat(recovered.seed, recovered.hero, `${receipt.combatId}:foreign`, 1, [], {
      kind: "dungeon", dungeonId: receipt.dungeonId, cellId: receipt.cellId, locationId: receipt.locationId,
      placeDanger: state.atlas.locations.find((location) => location.id === receipt.locationId)!.danger });
    expect(isValidCombatState(foreign)).toBe(true);
    expect(isValidEncounterThreatProvenance(foreign.threat, state.atlas)).toBe(true);
    expect(isValidCampaignDungeonLair({ ...recovered, tick: recovered.tick + 1, combat: foreign })).toBe(false);
  });

  it("clears only after a real legal victory and grants ordinary loot once in a labeled stronger-equipment unit boundary", () => {
    // Explicit unit boundary, NOT the natural campaign: equip one valid owned
    // test weapon before admission. The guardian, source, HP, danger and rolls
    // remain the actual seeded lair; no combat outcome or enemy is rewritten.
    const natural = naturalDungeonLairFixture().depth;
    const hero = equipItem(addItem(natural.hero, { id: "item:unit-guardian-blade", name: "Unit Guardian Blade",
      kind: "equipment", slot: "weapon", rarity: "legendary", quantity: 1, modifiers: { power: 100, strength: 100, agility: 100 },
      restorative: null, useMastery: createWeaponUseMastery() }), "item:unit-guardian-blade");
    const ready = { ...natural, hero };
    expect(reloaded(ready)).toEqual(ready);
    let state = start(ready);
    const encounter = state.dungeon!.lair!.encounter!, loot = generateLoot(state.seed, encounter.combatId);
    for (let turn = 0; state.combat !== null && turn < 4; turn += 1) {
      const combat = state.combat, actorId = combat.turnOrder[combat.activeIndex]!;
      const targetId = combat.combatants.find((unit) => unit.side !== combat.combatants.find((entry) => entry.id === actorId)!.side && unit.health > 0)!.id;
      state = stepDepth(state, { type: "combat-action", action: { actorId, type: "attack", targetId, abilityId: null, itemId: null } });
    }
    expect(state.combat).toBeNull();
    expect(state.dungeon!.lair!.encounter!.resolution!.outcome).toBe("victory");
    expect(state.hero.gold).toBe(ready.hero.gold);
    expect(state.hero.inventory.filter((item) => item.id === loot.id)).toHaveLength(1);
    expect(state.dungeon!.currentCellId).toBe(encounter.cellId);
    expect(reloaded(state)).toEqual(state);
    expect(selectDungeonLairEncounter(state)).toBeNull();
    expect(() => stepDepth(state, { type: "start-dungeon-guardian", dungeonId: encounter.dungeonId,
      cellId: encounter.cellId, encounterId: encounter.combatId })).toThrow();
    expect(state.hero.inventory.filter((item) => item.id === loot.id)).toHaveLength(1);
  });

  it("retains a real legal guard-only stalemate as unbeaten at the existing 128-turn bound", () => {
    // Both actors legally guard in this rules-unit scenario; autonomous play
    // remains unchanged and the terminal outcome is produced by combat itself.
    let state = start(naturalDungeonLairFixture().depth);
    const resources = structuredClone(state.hero.resources), inventory = structuredClone(state.hero.inventory), gold = state.hero.gold;
    for (let turn = 0; state.combat !== null && turn < maximumCombatTurns; turn += 1) {
      const actorId = state.combat.turnOrder[state.combat.activeIndex]!;
      state = stepDepth(state, { type: "combat-action", action: { actorId, type: "guard", targetId: null, abilityId: null, itemId: null } });
    }
    expect(state.combat).toBeNull();
    const resolution = state.dungeon!.lair!.encounter!.resolution!;
    expect(resolution.outcome).toBe("stalemate");
    expect(resolution.combat.turn).toBe(maximumCombatTurns);
    expect(state.hero.resources).toEqual({ ...resources, maxHealth: derivedStats(state.hero).maxHealth,
      maxMana: derivedStats(state.hero).maxMana });
    expect(state.hero.inventory).toEqual(inventory);
    expect(state.hero.gold).toBe(gold);
    expect(selectDungeonLairEncounter(state)).toBeNull();
    expect(reloaded(state)).toEqual(state);
    expect(depthCommandCandidates(state).every((candidate) => candidate.command.type !== "start-dungeon-guardian")).toBe(true);
  });
});
