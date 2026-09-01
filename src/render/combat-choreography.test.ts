import { describe, expect, it } from "vitest";
import { resolveCombatTurn } from "../depth/combat";
import { combatCueDurationSeconds, combatEffectColor, projectCombatMotion, projectLatestCombatCue, projectLatestCombatTurn, type CombatVisualCue } from "./combat-choreography";
import type { CombatState } from "../depth/types";

const attack: CombatVisualCue = {
  id: "combat:1:turn:3",
  actorId: "hero",
  targetId: "enemy",
  action: "attack",
  actorSide: "heroes",
  amount: 18,
  effect: null,
};

describe("combat choreography", () => {
  it("moves a hero toward the target, reacts, then returns to a settled pose", () => {
    expect(projectCombatMotion(attack, 0, false).phase).toBe("intent");
    const impact = projectCombatMotion(attack, combatCueDurationSeconds * 0.42, false);
    expect(impact.phase).toBe("impact");
    expect(impact.actorOffsetX).toBeGreaterThan(0);
    expect(impact.effectAlpha).toBeGreaterThan(0);
    const reaction = projectCombatMotion(attack, combatCueDurationSeconds * 0.58, false);
    expect(reaction.phase).toBe("reaction");
    expect(Math.abs(reaction.targetOffsetX)).toBeGreaterThan(0);
    expect(projectCombatMotion(attack, combatCueDurationSeconds, false)).toMatchObject({
      phase: "settled",
      actorOffsetX: 0,
      targetOffsetX: 0,
      effectAlpha: 0,
    });
  });

  it("mirrors enemy lunges and keeps guards on their own side", () => {
    const enemy = projectCombatMotion({ ...attack, actorSide: "enemies" }, combatCueDurationSeconds * 0.42, false);
    expect(enemy.actorOffsetX).toBeLessThan(0);
    const guard = projectCombatMotion({ ...attack, action: "guard", amount: 0 }, combatCueDurationSeconds * 0.22, false);
    expect(guard.actorOffsetX).toBe(0);
    expect(guard.targetOffsetX).toBe(0);
    expect(guard.actorOffsetY).toBeLessThan(0);
  });

  it("removes translations for reduced motion without hiding impact state", () => {
    const motion = projectCombatMotion({ ...attack, action: "ability", effect: "burning" }, combatCueDurationSeconds * 0.55, true);
    expect(motion).toMatchObject({ actorOffsetX: 0, actorOffsetY: 0, targetOffsetX: 0 });
    expect(motion.effectAlpha).toBeGreaterThan(0);
    expect(combatEffectColor({ ...attack, action: "ability", effect: "burning" })).toBe(0xff8d4d);
  });

  it("projects the canonical resolved-turn actor rather than the next active combatant", () => {
    const combat: CombatState = {
      id: "battle",
      round: 1,
      turn: 1,
      activeIndex: 1,
      turnOrder: ["hero", "enemy"],
      outcome: "ongoing",
      combatants: [
        { id: "hero", name: "Hero", side: "heroes", health: 20, maxHealth: 20, mana: 4, maxMana: 5, power: 8, armor: 2, initiative: 10, statuses: [], speciesId: null, abilities: [] },
        { id: "enemy", name: "Enemy", side: "enemies", health: 9, maxHealth: 15, mana: 2, maxMana: 2, power: 5, armor: 1, initiative: 8, statuses: [], speciesId: "enemy", abilities: [] },
      ],
      eventStream: {
        schemaVersion: 2,
        firstRecordedTurn: 1,
        events: [
          { id: "battle:1:0", turn: 1, ordinal: 0, kind: "intent", actorId: "hero", targetId: "enemy", action: "attack", abilityId: null, itemId: null },
          { id: "battle:1:1", turn: 1, ordinal: 1, kind: "damage", actorId: "hero", targetId: "enemy", abilityId: null, healthBefore: 15, amount: 6, healthAfter: 9, guarded: false, critical: false },
        ],
      },
      log: [{ turn: 1, actorId: "hero", action: "attack", targetId: "enemy", abilityId: null, itemId: null, message: "Hero strikes.", amount: 6 }],
      threat: { schemaVersion: 1, rating: "legacy-unrated" },
    };
    expect(combat.turnOrder[combat.activeIndex]).toBe("enemy");
    expect(projectLatestCombatCue(combat)).toMatchObject({ actorId: "hero", targetId: "enemy", amount: 6 });
    expect(projectLatestCombatTurn(combat)).toMatchObject({
      actorName: "Hero",
      targetName: "Enemy",
      text: "Hero · Intent: Attack · Enemy HP 15→9",
    });
    expect(projectLatestCombatCue({
      ...combat,
      eventStream: { schemaVersion: 2, firstRecordedTurn: 2, events: [] },
    })).toBeNull();
  });

  it("stages lethal status resolution without animating the unexecuted intent", () => {
    const combat: CombatState = {
      id: "status-battle",
      round: 1,
      turn: 1,
      activeIndex: 0,
      turnOrder: ["hero", "enemy"],
      outcome: "defeat",
      combatants: [
        { id: "hero", name: "Hero", side: "heroes", health: 0, maxHealth: 20, mana: 4, maxMana: 5, power: 8, armor: 2, initiative: 10, statuses: [], speciesId: null, abilities: [] },
        { id: "enemy", name: "Enemy", side: "enemies", health: 9, maxHealth: 15, mana: 2, maxMana: 2, power: 5, armor: 1, initiative: 8, statuses: [], speciesId: "enemy", abilities: [] },
      ],
      eventStream: {
        schemaVersion: 2,
        firstRecordedTurn: 1,
        events: [
          { id: "status-battle:1:0", turn: 1, ordinal: 0, kind: "intent", actorId: "hero", targetId: "enemy", action: "attack", abilityId: null, itemId: null },
          { id: "status-battle:1:1", turn: 1, ordinal: 1, kind: "status-expired", actorId: "hero", targetId: "hero", status: "poisoned", potency: 3, durationBefore: 1, durationAfter: 0, healthBefore: 2, amount: 2, healthAfter: 0 },
          { id: "status-battle:1:2", turn: 1, ordinal: 2, kind: "defeated", actorId: "hero", targetId: "hero", causeEventId: "status-battle:1:1" },
          { id: "status-battle:1:3", turn: 1, ordinal: 3, kind: "outcome", actorId: "hero", targetId: null, outcome: "defeat" },
        ],
      },
      log: [{ turn: 1, actorId: "hero", action: "status", targetId: "hero", abilityId: null, itemId: null, message: "Hero suffers poison.", amount: 3 }],
      threat: { schemaVersion: 1, rating: "legacy-unrated" },
    };
    const cue = projectLatestCombatCue(combat);
    expect(cue).toMatchObject({ action: "status", actorId: "hero", targetId: "hero", effect: "poison", amount: 2 });
    expect(projectCombatMotion(cue!, combatCueDurationSeconds * 0.55, false)).toMatchObject({
      actorOffsetX: 0,
      actorOffsetY: 0,
      targetOffsetX: 0,
    });
    expect(projectLatestCombatTurn(combat)).toMatchObject({
      intentInterrupted: true,
      text: "Hero · Intent: Attack — interrupted · Poison −2 HP 2→0 · duration 1→0 · Hero defeated · Defeat",
    });
  });

  it("preserves nonlethal status, cost, damage, and application order in spectator text", () => {
    const ability = {
      id: "ability:ember-bind",
      name: "Ember Bind",
      kind: "spell" as const,
      effect: "burning" as const,
      level: 1,
      experience: 0,
      uses: 0,
      manaCost: 2,
      potency: 4,
      sourceMonsterId: null,
    };
    const combat: CombatState = {
      id: "ordered-battle",
      round: 1,
      turn: 0,
      activeIndex: 0,
      turnOrder: ["hero", "enemy"],
      outcome: "ongoing",
      combatants: [
        { id: "hero", name: "Hero", side: "heroes", health: 20, maxHealth: 20, mana: 5, maxMana: 5, power: 8, armor: 2, initiative: 10, statuses: [{ kind: "poisoned", duration: 2, potency: 1 }], speciesId: null, abilities: [ability] },
        { id: "enemy", name: "Enemy", side: "enemies", health: 100, maxHealth: 100, mana: 2, maxMana: 2, power: 5, armor: 1, initiative: 8, statuses: [], speciesId: "enemy", abilities: [] },
      ],
      eventStream: { schemaVersion: 2, firstRecordedTurn: 1, events: [] },
      log: [],
      threat: { schemaVersion: 1, rating: "legacy-unrated" },
    };
    const resolved = resolveCombatTurn(combat, {
      actorId: "hero",
      type: "ability",
      targetId: "enemy",
      abilityId: ability.id,
      itemId: null,
    }, "ordered-battle");
    const summary = projectLatestCombatTurn(resolved);
    if (summary === null) throw new Error("Ordered battle has no turn summary");

    expect(resolved.eventStream.events.map((event) => event.kind)).toEqual([
      "intent",
      "status-tick",
      "mana-spent",
      "damage",
      "status-applied",
    ]);
    expect(summary.intentInterrupted).toBe(false);
    expect(summary.text).toContain("Poison −1 HP 20→19 · duration 2→1");
    expect(summary.text).toContain("Burning applied · duration 0→2");
    expect(summary.text.indexOf("Poison")).toBeLessThan(summary.text.indexOf("MP"));
    expect(summary.text.indexOf("MP")).toBeLessThan(summary.text.indexOf("Enemy HP"));
    expect(summary.text.indexOf("Enemy HP")).toBeLessThan(summary.text.indexOf("Burning applied"));
  });
});
