import { describe, expect, it } from "vitest";
import type { CombatTurnSummary } from "../depth/combat-turn";
import {
  combatInformationClearance,
  combatQuickReceiptMaxCharacters,
  formatCombatQuickReceipt,
  projectCombatCueVerticalLayout,
  projectCombatEnemyFormation,
  projectCombatInformationRailLayout,
} from "./combat-roster-layout";
import { animatedLayerMaximumOffset } from "./layout";

function summary(overrides: Partial<CombatTurnSummary> = {}): CombatTurnSummary {
  return {
    id: "combat:turn:1",
    turn: 1,
    actorId: "hero",
    actorName: "Orin Mossbrook",
    targetId: "river-wyrmling",
    targetName: "River Wyrmling",
    action: "attack",
    actionLabel: "Attack",
    intentInterrupted: false,
    abilityId: null,
    abilityName: null,
    companionAction: null,
    mana: null,
    restorative: null,
    damage: {
      id: "combat:turn:1:damage",
      ordinal: 1,
      kind: "damage",
      turn: 1,
      actorId: "hero",
      targetId: "river-wyrmling",
      abilityId: null,
      amount: 7,
      healthBefore: 7,
      healthAfter: 0,
      guarded: false,
      critical: false,
    },
    statusEvents: [],
    defeatedIds: ["river-wyrmling"],
    outcome: null,
    text: "Full canonical receipt remains in the native HUD.",
    ...overrides,
  };
}

describe("combat information rail", () => {
  it("uses a fixed-height latest-turn rail independent of receipt complexity", () => {
    const layout = projectCombatInformationRailLayout(true);
    expect(layout.threat).toEqual({ x: 6, y: 28, width: 308, height: 11.5 });
    expect(layout.receipt).toEqual({ x: 6, y: 43, width: 308, height: 18 });
    expect(layout.informationBottom).toBe(61);

    const withoutReceipt = projectCombatInformationRailLayout(false);
    expect(withoutReceipt.receipt).toBeNull();
    expect(withoutReceipt.informationBottom).toBe(61);
  });

  it.each([1, 3, 5])("reserves a clear battlefield lane with %i enemies", (enemyCount) => {
    const layout = projectCombatInformationRailLayout(true);
    const formation = projectCombatEnemyFormation(enemyCount);
    expect(formation).toHaveLength(enemyCount);
    for (const [index, slot] of formation.entries()) {
      const precedingRow = index < 3 ? null : formation[index - 3]?.visualEnvelopeBottom ?? null;
      const cues = projectCombatCueVerticalLayout(slot.y, layout.informationBottom, precedingRow);
      expect(slot.animatedSilhouetteTop - layout.informationBottom).toBeGreaterThanOrEqual(combatInformationClearance);
      expect(cues.statusTop - animatedLayerMaximumOffset - layout.informationBottom).toBeGreaterThanOrEqual(combatInformationClearance);
      if (precedingRow === null) {
        expect(slot.animatedSilhouetteTop - (cues.statusBottom + animatedLayerMaximumOffset)).toBeGreaterThanOrEqual(combatInformationClearance);
      } else {
        expect(cues.statusTop - animatedLayerMaximumOffset - precedingRow).toBeGreaterThanOrEqual(combatInformationClearance);
        expect(cues.reticleTop - animatedLayerMaximumOffset - precedingRow).toBeGreaterThanOrEqual(combatInformationClearance);
        expect(slot.y - 31 - animatedLayerMaximumOffset - precedingRow).toBeGreaterThanOrEqual(combatInformationClearance);
        expect(slot.animatedSilhouetteTop - (cues.statusBottom + animatedLayerMaximumOffset)).toBeGreaterThanOrEqual(0);
      }
      expect(cues.reticleTop - animatedLayerMaximumOffset).toBeLessThan(slot.animatedSilhouetteTop);
      expect(cues.reticleBottom + animatedLayerMaximumOffset).toBeLessThanOrEqual(slot.visualEnvelopeBottom + animatedLayerMaximumOffset);
    }
    if (enemyCount > 3) {
      const firstRow = formation[0]!;
      const secondRow = formation[3]!;
      expect(secondRow.animatedSilhouetteTop - firstRow.visualEnvelopeBottom).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([117, 139, 156])("keeps status pips, reticle, and stage bounds ordered at sprite y=%i", (spriteY) => {
    const layout = projectCombatInformationRailLayout(true);
    const cues = projectCombatCueVerticalLayout(spriteY, layout.informationBottom);
    expect(cues.statusTop - animatedLayerMaximumOffset).toBeGreaterThanOrEqual(layout.informationBottom + combatInformationClearance);
    expect(cues.statusBottom).toBeLessThan(cues.reticleTop);
    expect(cues.reticleBottom).toBeLessThanOrEqual(180);
    expect(cues.reticleBottom).toBeGreaterThan(cues.reticleTop);
  });
});

describe("combat quick receipt", () => {
  it("shows canonical action, target, damage, and defeat facts in one bounded line", () => {
    expect(formatCombatQuickReceipt(summary())).toBe("ORIN MOSSB… · ATTACK → RIVER WYRM… · KO · HP 7→0");
  });

  it("prioritizes measured Roadcraft impact without copying the full prose receipt", () => {
    expect(formatCombatQuickReceipt(summary({ defeatedIds: [] }), {
      kind: "flour-veil",
      preventedDamage: 4,
    })).toBe("ORIN MOSSB… · ATTACK → RIVER WYRM… · HP 7→0 · VEIL +4 HP");
  });

  it("reports guard status without repeating a self target", () => {
    const receipt = formatCombatQuickReceipt(summary({
      targetId: "hero",
      targetName: "Orin Mossbrook",
      action: "guard",
      actionLabel: "Guard",
      damage: null,
      defeatedIds: [],
      statusEvents: [{
        id: "combat:turn:1:guarding",
        ordinal: 1,
        kind: "status-applied",
        turn: 1,
        actorId: "hero",
        targetId: "hero",
        abilityId: null,
        status: "guarding",
        potencyBefore: null,
        potencyAfter: 2,
        durationBefore: null,
        durationAfter: 2,
      }],
    }));
    expect(receipt).toBe("ORIN MOSSB… · GUARD · GUARDING 2T");
  });

  it("keeps exact ability mana and health transitions", () => {
    const receipt = formatCombatQuickReceipt(summary({
      action: "ability",
      actionLabel: "Ember Thread",
      defeatedIds: [],
      mana: {
        id: "combat:turn:1:mana",
        ordinal: 1,
        kind: "mana-spent",
        turn: 1,
        actorId: "hero",
        targetId: "river-wyrmling",
        abilityId: "ability:ember-thread",
        amount: 4,
        manaBefore: 10,
        manaAfter: 6,
      },
      damage: {
        id: "combat:turn:1:damage",
        ordinal: 2,
        kind: "damage",
        turn: 1,
        actorId: "hero",
        targetId: "river-wyrmling",
        abilityId: "ability:ember-thread",
        amount: 7,
        healthBefore: 20,
        healthAfter: 13,
        guarded: false,
        critical: false,
      },
    }));
    expect(receipt).toContain("HP 20→13");
    expect(receipt).toContain("MP 10→6");
  });

  it("keeps restorative health and inventory transitions", () => {
    const receipt = formatCombatQuickReceipt(summary({
      targetId: "hero",
      targetName: "Orin Mossbrook",
      action: "item",
      actionLabel: "Ember Tonic",
      damage: null,
      defeatedIds: [],
      restorative: {
        id: "combat:turn:1:item",
        ordinal: 1,
        kind: "restorative-used",
        turn: 1,
        actorId: "hero",
        targetId: "hero",
        itemId: "item:ember-tonic",
        itemName: "Ember Tonic",
        effect: "restore-health-quarter-max-v1",
        quantityBefore: 2,
        quantityAfter: 1,
        disposition: "retained",
        maxHealth: 32,
        healthBefore: 4,
        amount: 8,
        healthAfter: 12,
      },
    }));
    expect(receipt).toContain("HP 4→12 (+8)");
    expect(receipt).toContain("×2→×1");
  });

  it("preserves Roadcraft's zero-cost contract and both measured impact labels", () => {
    const flourVeil = formatCombatQuickReceipt(summary({
      actorId: "miller",
      actorName: "Mossback Baker",
      targetId: "hero",
      targetName: "Orin Mossbrook",
      action: "companion-action",
      actionLabel: "Flour Veil",
      damage: null,
      defeatedIds: [],
      companionAction: {
        id: "combat:turn:1:roadcraft",
        ordinal: 1,
        kind: "companion-action-resolved",
        turn: 1,
        actorId: "miller",
        targetId: "hero",
        companionActionId: "flour-veil",
        kitId: "miller-roadcraft",
        rulesVersion: "miller-roadcraft-v1",
        effect: "guarding",
        potency: 3,
        duration: 2,
        manaCost: 0,
        itemCost: 0,
        damage: 0,
        usedRound: 1,
        readyRoundBefore: 1,
        readyRoundAfter: 3,
      },
    }));
    const millstone = formatCombatQuickReceipt(summary({ defeatedIds: [] }), {
      kind: "millstone-drag",
      preventedDamage: 0,
    });
    expect(flourVeil).toContain("0 MP · 0 DMG");
    expect(flourVeil).toContain("GUARDING 2T");
    expect(millstone).toContain("DRAG WEAKENED");
  });

  it("keeps interruption ahead of lethal start-turn status detail", () => {
    const receipt = formatCombatQuickReceipt(summary({
      intentInterrupted: true,
      damage: null,
      defeatedIds: ["hero"],
      statusEvents: [{
        id: "combat:turn:1:poison",
        ordinal: 1,
        kind: "status-tick",
        turn: 1,
        actorId: "hero",
        targetId: "hero",
        status: "poisoned",
        potency: 4,
        durationBefore: 2,
        durationAfter: 1,
        healthBefore: 4,
        amount: 4,
        healthAfter: 0,
      }],
    }));
    expect(receipt).toBe("ORIN MOS… · ATTACK INTERRUPTED · POISON −4 HP 4→0 · ORIN MOS… DEFEATED");
    expect(receipt).not.toContain("→ RIVER");
  });

  it("keeps a terminal outcome first when start-turn damage interrupts intent", () => {
    const receipt = formatCombatQuickReceipt(summary({
      intentInterrupted: true,
      damage: null,
      defeatedIds: ["hero"],
      outcome: "defeat",
      statusEvents: [{
        id: "combat:turn:1:poison",
        ordinal: 1,
        kind: "status-tick",
        turn: 1,
        actorId: "hero",
        targetId: "hero",
        status: "poisoned",
        potency: 4,
        durationBefore: 2,
        durationAfter: 1,
        healthBefore: 4,
        amount: 4,
        healthAfter: 0,
      }],
    }));
    expect(receipt).toBe("DEFEAT · ORIN MOS… · ATTACK INTERRUPTED · POISON −4 HP 4→0 · ACTOR DEFEATED");
  });

  it("bounds adversarial labels and complex outcomes deterministically", () => {
    const receipt = formatCombatQuickReceipt(summary({
      actorName: "🛡️ A hero whose ceremonial name is intentionally far too long",
      targetName: "🐉 An adversary with an equally unreasonably long title",
      actionLabel: "An elaborate and over-described ability",
      outcome: "victory",
      mana: {
        id: "combat:turn:1:mana",
        ordinal: 1,
        kind: "mana-spent",
        turn: 1,
        actorId: "hero",
        targetId: "river-wyrmling",
        abilityId: "ability:test",
        amount: 12,
        manaBefore: 12,
        manaAfter: 0,
      },
    }));
    expect(Array.from(receipt).length).toBeLessThanOrEqual(combatQuickReceiptMaxCharacters);
    expect(receipt).not.toContain("\n");
    expect(receipt).toContain("VICTORY");
    expect(receipt).toContain("KO");
  });
});
