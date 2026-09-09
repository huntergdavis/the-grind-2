import { describe, expect, it } from "vitest";
import { projectLatestCombatTurn } from "../depth/combat-turn";
import type { CombatState, CombatTurnEvent, SharedOpening } from "../depth/types";
import { combatCueDurationSeconds, projectCombatMotion, projectLatestCombatCue } from "./combat-choreography";
import { formatCombatQuickReceipt } from "./combat-roster-layout";
import { projectMillraceReversal } from "./millrace-reversal";

const opening: SharedOpening = {
  heroId: "hero", companionId: "miller", targetId: "enemy", sourceEventId: "drag:1", sourceTurn: 1,
  affectedActionEventId: "attack:2", affectedDamageEventId: "damage:2", earnedEventId: "earned:2", earnedTurn: 2,
};

function fixture(phase: "ready" | "spent" | "expired"): CombatState {
  const spent = phase === "spent";
  const event: CombatTurnEvent = phase === "ready"
    ? { ...opening, id: "earned:2", ordinal: 2, turn: 2, actorId: "enemy", kind: "shared-opening-earned", rulesVersion: "millrace-reversal-v1", openingBefore: 0, openingAfter: 1 }
    : spent
      ? { ...opening, id: "spent:3", ordinal: 1, turn: 3, actorId: "hero", kind: "shared-opening-spent", rulesVersion: "millrace-reversal-v1", openingBefore: 1, openingAfter: 0, jointActionId: "millrace-reversal", armorReduction: 3, damage: 9 }
      : { ...opening, id: "expired:3", ordinal: 1, turn: 3, actorId: "hero", kind: "shared-opening-expired", rulesVersion: "millrace-reversal-v1", openingBefore: 1, openingAfter: 0, reason: "hero-action" };
  const turn = phase === "ready" ? 2 : 3;
  return {
    id: "combat:millrace", round: 1, turn, activeIndex: 0, turnOrder: ["hero", "miller", "enemy"], outcome: "ongoing",
    combatants: [
      { id: "hero", name: "Mira Greyhaven", side: "heroes", health: 40, maxHealth: 45, mana: 12, maxMana: 12, power: 10, armor: 2, initiative: 10, statuses: [], speciesId: null, abilities: [] },
      { id: "miller", name: "Fara Glass", side: "heroes", health: 34, maxHealth: 34, mana: 0, maxMana: 0, power: 5, armor: 1, initiative: 8, statuses: [], speciesId: null, abilities: [] },
      { id: "enemy", name: "Inkcap Mimic", side: "enemies", health: spent ? 21 : 30, maxHealth: 30, mana: 0, maxMana: 0, power: 6, armor: 15, initiative: 7, statuses: [], speciesId: "inkcap-mimic", abilities: [] },
    ],
    companionActionRuntime: { schemaVersion: 2, actorId: "miller", kitId: "miller-roadcraft", rulesVersion: "miller-roadcraft-v1",
      readyRounds: { "flour-veil": 1, "millstone-drag": 3 }, dragSource: null, sharedOpening: phase === "ready" ? opening : null },
    eventStream: { schemaVersion: 2, firstRecordedTurn: turn, events: [
      { id: `intent:${turn}`, turn, ordinal: 0, kind: "intent", actorId: phase === "ready" ? "enemy" : "hero", targetId: phase === "ready" ? "hero" : "enemy", action: spent ? "joint-action" : "attack", abilityId: null, itemId: null },
      event,
      ...(phase === "expired" ? [] : [{ id: `damage:${turn}`, turn, ordinal: 3, kind: "damage" as const,
        actorId: phase === "ready" ? "enemy" : "hero", targetId: phase === "ready" ? "hero" : "enemy", abilityId: null,
        healthBefore: phase === "ready" ? 45 : 30, healthAfter: phase === "ready" ? 40 : 21,
        amount: phase === "ready" ? 5 : 9, guarded: false, critical: false as const }]),
    ] },
    log: [], threat: { schemaVersion: 1, rating: "legacy-unrated" },
    weaponUse: { schemaVersion: 1, tracking: "tracked", rulesVersion: "weapon-effective-use-v1", heroId: "hero", weaponId: "sword:one", basicStrikes: spent ? 1 : 0, damage: spent ? 9 : 0 },
  };
}

describe("Millrace Reversal presentation", () => {
  it("uses only the current earned pip and preserves all three source identities", () => {
    const combat = fixture("ready");
    expect(projectMillraceReversal(combat)).toEqual({ phase: "ready", opening,
      heroName: "Mira Greyhaven", companionName: "Fara Glass", targetName: "Inkcap Mimic",
      headline: "Fara Glass's Millstone Drag opens Inkcap Mimic to Mira Greyhaven." });
    expect(projectLatestCombatTurn(combat)?.text).toContain("Shared Opening 0→1 · Fara Glass's Millstone Drag affected Inkcap Mimic's strike · ready for Mira Greyhaven");
    const legacy = { ...combat };
    delete legacy.companionActionRuntime;
    expect(projectMillraceReversal(legacy)).toBeNull();
    expect(projectMillraceReversal({ ...combat, outcome: "victory" })).toBeNull();
    expect(projectMillraceReversal({ ...combat, combatants: combat.combatants.map((unit) => unit.id === "miller" ? { ...unit, health: 0 } : unit) })).toBeNull();
  });

  it("projects one exact spent receipt and piercing cue, not a companion second hit", () => {
    const combat = fixture("spent");
    const summary = projectLatestCombatTurn(combat)!;
    expect(summary.actionLabel).toBe("Millrace Reversal");
    expect(summary.text).toContain("Fara Glass braces for Mira Greyhaven · one strike at Inkcap Mimic · piercing · armor penalty 3 · 0 MP · 0 items");
    expect(summary.damage).toMatchObject({ healthBefore: 30, amount: 9, healthAfter: 21 });
    expect(formatCombatQuickReceipt(summary)).toBe("MILLRACE REVERSAL · OPENING 1→0 · HP 30→21 · PIERCING");
    expect(projectLatestCombatCue(combat)).toMatchObject({ action: "joint-action", actorId: "hero", targetId: "enemy", amount: 9,
      effect: "piercing", sharedOpening: { companionId: "miller", sourceEventId: "drag:1", affectedActionEventId: "attack:2", openingBefore: 1, openingAfter: 0 } });
    expect(projectMillraceReversal(combat)?.headline).toBe("Millrace Reversal · Fara Glass braces; Mira Greyhaven strikes Inkcap Mimic once · 9 damage · piercing · armor penalty 3 · Opening 1→0.");
    expect(projectMillraceReversal(JSON.parse(JSON.stringify(combat)))).toEqual(projectMillraceReversal(combat));
  });

  it("never leaves an empty or expired meter behind", () => {
    const expired = fixture("expired");
    expect(projectMillraceReversal(expired)).toBeNull();
    expect(projectLatestCombatTurn(expired)?.text).toContain("Shared Opening 1→0 · expired: hero action");
    const spent = fixture("spent");
    expect(projectMillraceReversal({ ...spent, eventStream: { schemaVersion: 2, firstRecordedTurn: 4, events: [] } })).toBeNull();
  });

  it("advances one hero strike while the Miller braces, then settles without a second pulse", () => {
    const cue = projectLatestCombatCue(fixture("spent"))!;
    const impact = projectCombatMotion(cue, combatCueDurationSeconds * 0.42, false);
    expect(impact.actorOffsetX).toBeGreaterThan(0);
    expect(impact.supportOffsetX).toBeLessThan(0);
    expect(impact.effectAlpha).toBeGreaterThan(0);
    expect(impact.braceAlpha).toBeGreaterThan(0);
    expect(impact.weaponArmOffset).toBeGreaterThan(0);
    const samples = Array.from({ length: 101 }, (_, i) => projectCombatMotion(cue, combatCueDurationSeconds * i / 100, false).effectAlpha);
    expect(samples.filter((value, i) => i > 0 && i < samples.length - 1 && value > samples[i - 1]! && value >= samples[i + 1]!)).toHaveLength(1);
    expect(projectCombatMotion(cue, combatCueDurationSeconds * 2, false)).toMatchObject({ phase: "settled", actorOffsetX: 0, targetOffsetX: 0, effectAlpha: 0, braceAlpha: 0 });
  });

  it("holds a complete, unmoving three-actor tableau for reduced motion", () => {
    const cue = projectLatestCombatCue(fixture("spent"))!;
    const initial = projectCombatMotion(cue, 0, true);
    expect(initial).toMatchObject({ phase: "consequence", actorOffsetX: 0, actorOffsetY: 0, targetOffsetX: 0, supportOffsetX: 0, weaponArmOffset: 1.18 });
    expect(initial.effectAlpha).toBeGreaterThan(0);
    expect(initial.braceAlpha).toBeGreaterThan(0);
    expect(projectCombatMotion(cue, 100, true)).toEqual(initial);
  });
});
