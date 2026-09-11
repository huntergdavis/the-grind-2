import { describe, expect, it } from "vitest";
import { releasedCombatAftermathFixture } from "../../tests/combat-aftermath-fixtures";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { createCombat, isValidCombatState, resolveCombatTurn } from "../depth/combat";
import { createHero } from "../depth/rpg";
import type { CombatState, CombatTurnEvent } from "../depth/types";
import { projectCombatAftermath, projectCombatAftermathEntry, projectCombatAftermathScene } from "./combat-aftermath";

type Damage = Extract<CombatTurnEvent, { kind: "damage" }>;
function actual() {
  const journey = releasedCombatAftermathFixture();
  return { ...journey, combat: journey.resolved.depth.roadSupper!.terminal!.combat, entry: journey.resolved.chronicle.at(-1)! };
}

/** Explicit standalone combat-unit branch, not a changed natural campaign. */
function heroTurnUnit(poisoned = false): CombatState {
  const seed = "aftermath-unit", hero = createHero(seed, "hero:aftermath-unit", "Unit Hero");
  const generated = createCombat(seed, hero, "encounter:aftermath-unit", 1);
  let combat: CombatState = { ...generated, combatants: generated.combatants.map(unit => unit.id !== hero.id ? unit
    : { ...unit, health: poisoned ? 1 : 2000, maxHealth: 2000, power: 999, armor: 999,
      statuses: poisoned ? [{ kind: "poisoned", duration: 1, potency: 1 }] : [] }) };
  if (combat.turnOrder[combat.activeIndex] !== hero.id) {
    combat = resolveCombatTurn(combat, { type: "guard", actorId: combat.turnOrder[combat.activeIndex]!,
      targetId: null, abilityId: null, itemId: null }, seed);
  }
  expect(combat.turnOrder[combat.activeIndex]).toBe(hero.id);
  expect(isValidCombatState(combat)).toBe(true);
  return combat;
}

describe("source-bound Last exchange presentation", () => {
  it("preserves the released save's actual consecutive attacks, different targets and applied HP loss, not raw overkill or a tactical claim", () => {
    const { combat } = actual(), recap = projectCombatAftermath(combat)!;
    const damage = combat.eventStream.events.filter((event): event is Damage => event.kind === "damage");
    const preceding = damage.find(event => event.turn === combat.turn - 1)!, closing = damage.find(event => event.turn === combat.turn)!;
    const name = (id: string | null) => combat.combatants.find(unit => unit.id === id)!.name;
    const ability = (event: Damage) => combat.combatants.find(unit => unit.id === event.actorId)!.abilities.find(entry => entry.id === event.abilityId)!.name;
    expect(preceding.targetId).not.toBe(closing.actorId);
    expect(recap).toMatchObject({ combatId: combat.id, outcome: "defeat", headline: "Last exchange" });
    expect(recap.detail).toBe(`${name(preceding.actorId)} used ${ability(preceding)} on ${name(preceding.targetId)} for ${preceding.amount} HP. ${name(closing.actorId)} used ${ability(closing)} on ${name(closing.targetId)} for ${closing.amount} HP; ${name(closing.targetId)} fell.`);
    expect(closing.amount).toBe(42);
    expect(combat.supper!.spent).toMatchObject({ damageBefore: 65, damageAfter: 48, prevented: 0 });
    expect(recap.detail).not.toMatch(/48 HP|65 HP|17 HP|mistake|because|should have|angry|afraid/iu);
    expect(recap.compactDetail).toContain(ability(closing));
    expect(recap.compactDetail).not.toContain("HP");
    expect(recap.sourceEventIds).toEqual(combat.eventStream.events.filter(event =>
      (event.turn === combat.turn - 1 && (event.kind === "intent" || event.kind === "damage"))
      || (event.turn === combat.turn && ["intent", "damage", "defeated", "outcome"].includes(event.kind))).map(event => event.id));
  });

  it("binds the current terminal scene and the retained terminal Status row after real recovery", () => {
    const { resolved, next, entry, combat } = actual(), scene = projectCombatAftermathScene(resolved)!;
    expect(scene).toEqual({ ...projectCombatAftermath(combat), commandId: entry.commandId, tick: entry.tick, chronicleId: entry.id });
    expect(projectCombatAftermathEntry(resolved, entry)).toEqual(scene);
    expect(projectCombatAftermathScene(next)).toBeNull();
    expect(projectCombatAftermathEntry(next, entry)).toEqual(scene);
    expect(projectCombatAftermathEntry(next, next.chronicle.at(-1)!)).toBeNull();
    expect(projectCombatAftermathEntry(JSON.parse(JSON.stringify(next)), JSON.parse(JSON.stringify(entry)))).toEqual(scene);
  });

  it("rejects wrong scene, campaign, command, tick, missing current ring and active combat sources", () => {
    const { resolved, entry, before } = actual();
    const variants: WorldState[] = [
      { ...resolved, campaignId: "campaign:foreign" },
      { ...resolved, hero: { ...resolved.hero, id: "hero:foreign" },
        depth: { ...resolved.depth, hero: { ...resolved.depth.hero, id: "hero:foreign" } } },
      { ...resolved, tick: resolved.tick + 1 },
      { ...resolved, scene: { ...resolved.scene, mode: "camp" } },
      { ...resolved, scene: { ...resolved.scene, action: "An unrelated action" } },
      { ...resolved, chronicle: [{ ...entry, commandId: `foreign:${entry.commandId}` }] },
      { ...resolved, chronicle: [{ ...entry, id: "foreign-entry" }] },
      { ...resolved, chronicle: [{ ...entry, commandType: "wait" }] },
      { ...resolved, depth: { ...resolved.depth, completedCombats: [] } },
      { ...resolved, depth: { ...resolved.depth, combat: before.depth.combat } },
    ];
    for (const world of variants) expect(projectCombatAftermathScene(world)).toBeNull();
    expect(projectCombatAftermathEntry(resolved, { ...entry, action: "Not the retained row" })).toBeNull();
  });

  it("does not attach an untimestamped or malformed old battle archive to a later Status row", () => {
    const { next, entry } = actual();
    const { roadSupper: _receipt, ...withoutReceipt } = next.depth;
    expect(projectCombatAftermathEntry({ ...next, depth: withoutReceipt }, entry)).toBeNull();
    expect(projectCombatAftermathEntry({ ...next, chronicle: next.chronicle.filter(row => row.id !== entry.id) }, entry)).toBeNull();
    const terminal = next.depth.roadSupper!.terminal!;
    expect(projectCombatAftermathEntry({ ...next, depth: { ...next.depth, roadSupper: { ...next.depth.roadSupper!,
      terminal: { ...terminal, sourceCommandId: `${terminal.sourceCommandId}:foreign` } } } }, entry)).toBeNull();
  });

  it("describes an actual plain-attack victory without inventing an ability or an earlier exchange", () => {
    const before = heroTurnUnit();
    const terminal = resolveCombatTurn(before, { type: "attack", actorId: before.turnOrder[before.activeIndex]!,
      targetId: before.combatants.find(unit => unit.side === "enemies")!.id, abilityId: null, itemId: null }, "aftermath-unit");
    expect(isValidCombatState(terminal)).toBe(true);
    expect(terminal.outcome).toBe("victory");
    const damage = terminal.eventStream.events.find((event): event is Damage => event.turn === terminal.turn && event.kind === "damage")!;
    const target = terminal.combatants.find(unit => unit.id === damage.targetId)!;
    expect(projectCombatAftermath(terminal)).toMatchObject({ outcome: "victory",
      detail: `Unit Hero struck ${target.name} for ${damage.amount} HP; ${target.name} fell.` });
  });

  it("falls back for an actual status-caused interrupted defeat, ongoing or stalemate outcomes and legacy missing events", () => {
    const before = heroTurnUnit(true);
    const terminal = resolveCombatTurn(before, { type: "attack", actorId: before.turnOrder[before.activeIndex]!,
      targetId: before.combatants.find(unit => unit.side === "enemies")!.id, abilityId: null, itemId: null }, "aftermath-unit");
    expect(isValidCombatState(terminal)).toBe(true);
    expect(terminal.outcome).toBe("defeat");
    expect(terminal.eventStream.events.some(event => event.kind === "defeated" && event.targetId === before.turnOrder[before.activeIndex])).toBe(true);
    expect(projectCombatAftermath(terminal)).toBeNull();
    expect(projectCombatAftermath(before)).toBeNull();
    expect(projectCombatAftermath({ ...terminal, outcome: "stalemate" })).toBeNull();
    expect(projectCombatAftermath({ ...terminal, eventStream: { schemaVersion: 2, firstRecordedTurn: terminal.turn + 1, events: [] } })).toBeNull();
  });

  it("uses only the closing packet after lawful ring pruning and rejects a foreign cause or damaged packet", () => {
    const { combat } = actual();
    const pruned = { ...combat, eventStream: { ...combat.eventStream, firstRecordedTurn: combat.turn,
      events: combat.eventStream.events.filter(event => event.turn === combat.turn) } };
    expect(isValidCombatState(pruned)).toBe(true);
    const recap = projectCombatAftermath(pruned)!;
    expect(recap.sourceEventIds).toHaveLength(4);
    expect(recap.detail).not.toContain("Ember Arc");
    const foreign = { ...combat, eventStream: { ...combat.eventStream, events: combat.eventStream.events.map(event =>
      event.kind === "defeated" ? { ...event, causeEventId: "another-battle:damage" } : event) } };
    expect(projectCombatAftermath(foreign)).toBeNull();
    expect(projectCombatAftermath({ ...combat, eventStream: { ...combat.eventStream,
      events: combat.eventStream.events.filter(event => event.kind !== "outcome") } })).toBeNull();
  });

  it("freezes only new view data and leaves the complete canonical world and retained events untouched", () => {
    const { resolved, next, combat, entry } = actual(), before = canonicalStringify(resolved), hash = canonicalHash(resolved);
    const recap = projectCombatAftermath(combat)!;
    projectCombatAftermathScene(resolved);
    projectCombatAftermathEntry(next, entry);
    expect(Object.isFrozen(recap)).toBe(true);
    expect(Object.isFrozen(recap.sourceEventIds)).toBe(true);
    expect(canonicalStringify(resolved)).toBe(before);
    expect(canonicalHash(resolved)).toBe(hash);
  });
});
