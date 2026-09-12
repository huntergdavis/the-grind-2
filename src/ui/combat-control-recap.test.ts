import { beforeAll, describe, expect, it } from "vitest";
import { naturalCombatControlFixture } from "../../tests/combat-control-fixtures";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { createCombat, isValidCombatState, resolveCombatTurn } from "../depth/combat";
import { createHero } from "../depth/rpg";
import type { CombatAction, CombatState } from "../depth/types";
import { createTurningCheck } from "../depth/weapon-technique";
import { projectCombatAftermath } from "./combat-aftermath";
import { projectCombatControlEntry, projectCombatControlRecap, projectCombatControlScene } from "./combat-control-recap";

const unitSeed = "control-recap-unit", unitHeroId = "hero:control-recap-unit";
/** Explicit combat-component boundary. Every displayed attack/status below is
 * then committed by the actual reducer, not staged into an event stream.
 */
function unitStart(lethal = false, poisonedEnemy = false): CombatState {
  const hero = { ...createHero(unitSeed, unitHeroId, "Unit Hero"), abilities: [createTurningCheck()] };
  const generated = createCombat(unitSeed, hero, "encounter:control-recap-unit", 1);
  const enemy = generated.combatants.find(actor => actor.side === "enemies")!;
  const combat: CombatState = { ...generated, turnOrder: [unitHeroId, enemy.id], activeIndex: 0,
    combatants: generated.combatants.map(actor => ({ ...actor, power: 10, armor: 0,
      health: actor.id === unitHeroId && lethal ? 1 : 1000, maxHealth: 1000,
      initiative: actor.id === unitHeroId ? 99 : 1,
      statuses: actor.side === "enemies" && poisonedEnemy ? [{ kind: "poisoned", duration: 1, potency: 1000 }] : [] })) };
  expect(isValidCombatState(combat)).toBe(true);
  return combat;
}
function act(combat: CombatState, type: "check" | "attack" | "ability" | "guard"): CombatState {
  const actor = combat.combatants.find(unit => unit.id === combat.turnOrder[combat.activeIndex])!;
  const target = combat.combatants.find(unit => unit.side !== actor.side && unit.health > 0)!;
  const abilityId = type === "check" ? createTurningCheck().id : type === "ability" ? actor.abilities[0]!.id : null;
  const action: CombatAction = abilityId !== null
    ? { type: "ability", actorId: actor.id, targetId: target.id, abilityId, itemId: null }
    : type === "guard" ? { type: "guard", actorId: actor.id, targetId: null, abilityId: null, itemId: null }
      : { type: "attack", actorId: actor.id, targetId: target.id, abilityId: null, itemId: null };
  const after = resolveCombatTurn(combat, action, unitSeed);
  expect(isValidCombatState(after)).toBe(true);
  return after;
}

describe("source-bound factual control recap", () => {
  let journey: ReturnType<typeof naturalCombatControlFixture>, terminal: WorldState, recovered: WorldState;
  beforeAll(() => {
    journey = naturalCombatControlFixture();
    terminal = journey.terminal;
    recovered = journey.next;
  }, 20_000);

  it("reports the actual earned weakening and applied retaliation HP without a saving or a decisive claim", () => {
    const world = journey.retaliated, combat = world.depth.combat!, recap = projectCombatControlRecap(combat, world.hero.id)!;
    const damage = journey.retaliationEvent, application = journey.applicationEvent;
    expect(world.tick).toBe(277);
    expect(recap).toMatchObject({ combatId: combat.id, heroId: world.hero.id, enemyId: damage.actorId,
      applicationTurn: application.turn, retaliationTurn: damage.turn,
      compactDetail: "Turning Check → weakened Moonhowl · 21 HP lost" });
    expect(recap.detail).toContain("21 HP");
    expect(recap.detail).toContain("42→21 HP");
    expect(recap.detail).not.toMatch(/spared|saved|prevented|23|mistake|because|decisive|angry|afraid/iu);
    expect(recap.sourceEventIds).toEqual([
      `${combat.id}:${application.turn}:0`,
      combat.eventStream.events.find(event => event.turn === application.turn && event.kind === "damage")!.id,
      application.id, `${combat.id}:${damage.turn}:0`, journey.statusTickEvent.id, damage.id,
    ]);
  });

  it("binds current live and terminal rows without confusing the weakened wolf with the later killer", () => {
    const live = journey.retaliated, liveEntry = live.chronicle.at(-1)!;
    const shown = projectCombatControlScene(live)!;
    expect(shown).toEqual({ ...projectCombatControlRecap(live.depth.combat!, live.hero.id),
      commandId: liveEntry.commandId, tick: live.tick, chronicleId: liveEntry.id });
    expect(projectCombatControlEntry(live, liveEntry)).toEqual(shown);
    expect(projectCombatControlScene(journey.applied)).toBeNull();
    expect(terminal.tick).toBe(278);
    const battle = terminal.depth.completedCombats.at(-1)!, entry = terminal.chronicle.at(-1)!;
    const closing = battle.eventStream.events.find(event => event.turn === battle.turn && event.kind === "damage")!;
    expect(closing.actorId).not.toBe(shown.enemyId);
    expect(projectCombatControlEntry(terminal, entry)).toMatchObject({ enemyId: shown.enemyId, retaliationTurn: 2, tick: 278 });
    expect(projectCombatControlEntry(JSON.parse(JSON.stringify(terminal)), JSON.parse(JSON.stringify(entry))))
      .toEqual(projectCombatControlEntry(terminal, entry));
    expect(projectCombatControlScene(terminal)).toBeNull();
    expect(projectCombatAftermath(battle)!.detail).toContain("fell");
    expect(projectCombatControlEntry(recovered, entry)).toBeNull();
    expect(projectCombatControlEntry(terminal, liveEntry)).toBeNull();
  });

  it("rejects foreign or stale world, scene, hero, command and Chronicle joins", () => {
    const world = journey.retaliated, entry = world.chronicle.at(-1)!;
    const variants: WorldState[] = [
      { ...world, campaignId: "campaign:foreign" },
      { ...world, tick: world.tick + 1 },
      { ...world, scene: { ...world.scene, mode: "camp" } },
      { ...world, scene: { ...world.scene, action: "An unrelated attack" } },
      { ...world, hero: { ...world.hero, id: "hero:foreign" }, depth: { ...world.depth, hero: { ...world.depth.hero, id: "hero:foreign" } } },
      { ...world, chronicle: [{ ...entry, commandId: `${entry.commandId}:wrong` }] },
      { ...world, chronicle: [{ ...entry, commandType: "wait" }] },
      { ...world, chronicle: [{ ...entry, id: "foreign-row" }] },
      { ...world, chronicle: [] },
      { ...world, depth: { ...world.depth, combat: journey.applied.depth.combat } },
    ];
    for (const changed of variants) expect(projectCombatControlScene(changed)).toBeNull();
    expect(projectCombatControlEntry(world, { ...entry, consequence: "Not the saved row" })).toBeNull();
    expect(projectCombatControlEntry(recovered, { ...terminal.chronicle.at(-1)!, commandId: entry.commandId! })).toBeNull();
  });

  it("falls back when the real application is lawfully pruned, absent, foreign or malformed", () => {
    const combat = journey.retaliated.depth.combat!;
    const pruned = { ...combat, eventStream: { ...combat.eventStream, firstRecordedTurn: combat.turn,
      events: combat.eventStream.events.filter(event => event.turn === combat.turn) } };
    expect(isValidCombatState(pruned)).toBe(true);
    expect(projectCombatControlRecap(pruned, journey.retaliated.hero.id)).toBeNull();
    expect(projectCombatControlRecap({ ...combat, eventStream: { schemaVersion: 2, firstRecordedTurn: combat.turn + 1, events: [] } }, journey.retaliated.hero.id)).toBeNull();
    for (const field of ["actorId", "targetId", "abilityId", "id"] as const) {
      const tampered = { ...combat, eventStream: { ...combat.eventStream, events: combat.eventStream.events.map(event =>
        event.id === journey.applicationEvent.id ? { ...event, [field]: "foreign-source" } : event) } };
      expect(projectCombatControlRecap(tampered, journey.retaliated.hero.id)).toBeNull();
    }
  });

  it("keeps plain attacks and lethal health clamping factual, without inventing a saving", () => {
    const ordinary = act(act(unitStart(), "check"), "attack");
    expect(projectCombatControlRecap(ordinary, unitHeroId)!.detail).toContain("'s attack dealt");
    const lethal = act(act(unitStart(true), "check"), "attack"), recap = projectCombatControlRecap(lethal, unitHeroId)!;
    expect(lethal.outcome).toBe("defeat");
    expect(recap.detail).toContain("dealt 1 HP");
    expect(recap.detail).toContain("1→0 HP");
    expect(recap.detail).not.toMatch(/saved|spared|prevented/iu);
  });

  it("does not invent a reply after expiry or a status-interrupted death", () => {
    const first = act(unitStart(), "check"), waited = act(act(first, "guard"), "guard");
    const expired = act(waited, "attack");
    expect(expired.eventStream.events.some(event => event.kind === "status-expired" && event.status === "weakened")).toBe(true);
    expect(projectCombatControlRecap(expired, unitHeroId)).toBeNull();
    const interrupted = act(act(unitStart(false, true), "check"), "attack");
    expect(interrupted.outcome).toBe("victory");
    expect(projectCombatControlRecap(interrupted, unitHeroId)).toBeNull();
  });

  it("does not credit a refresh of an already-present weakening or its superseded application", () => {
    const first = act(unitStart(), "check"), waited = act(first, "guard"), refreshed = act(waited, "check");
    const reply = act(refreshed, "ability");
    expect(reply.eventStream.events.find(event => event.turn === 3 && event.kind === "status-applied"))
      .toMatchObject({ potencyBefore: 2, durationBefore: 1 });
    expect(projectCombatControlRecap(reply, unitHeroId)).toBeNull();
  });

  it("freezes only derived view data and preserves canonical hashes, events and original closing recap", () => {
    const world = journey.retaliated, old = canonicalStringify(world), hash = canonicalHash(world);
    const recap = projectCombatControlScene(world)!;
    const battle = terminal.depth.completedCombats.at(-1)!, ending = projectCombatAftermath(battle);
    projectCombatControlEntry(terminal, terminal.chronicle.at(-1)!);
    expect(Object.isFrozen(recap)).toBe(true);
    expect(Object.isFrozen(recap.sourceEventIds)).toBe(true);
    expect(recap.compactDetail.length).toBeLessThanOrEqual(110);
    expect(canonicalStringify(world)).toBe(old);
    expect(canonicalHash(world)).toBe(hash);
    expect(projectCombatAftermath(battle)).toEqual(ending);
  });
});
