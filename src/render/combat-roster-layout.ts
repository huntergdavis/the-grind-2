import type { CombatTurnSummary } from "../depth/combat-turn";
import { animatedLayerMaximumOffset } from "./layout";

export interface CombatOverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CombatInformationRailLayout {
  threat: CombatOverlayBounds;
  receipt: CombatOverlayBounds | null;
  informationBottom: number;
}

export interface CombatCueVerticalLayout {
  reticleTop: number;
  reticleBottom: number;
  statusTop: number;
  statusCenterY: number;
  statusBottom: number;
}

export interface CombatQuickReceiptRoadcraftImpact {
  kind: "flour-veil" | "millstone-drag";
  preventedDamage: number;
}

export interface CombatEnemyFormationSlot {
  x: number;
  y: number;
  scale: number;
  healthX: number;
  healthY: number;
  healthWidth: number;
  animatedSilhouetteTop: number;
  visualEnvelopeBottom: number;
}

export const combatInformationClearance = 4;
export const combatQuickReceiptMaxCharacters = 76;

const threatBounds: CombatOverlayBounds = { x: 6, y: 28, width: 308, height: 11.5 };
const receiptBounds: CombatOverlayBounds = { x: 6, y: 43, width: 308, height: 18 };
const statusMarkerRadius = 2.6;
const statusMarkerBottomOffset = 5.5;
const maximumMonsterTopOffset = 35;
const maximumActorLift = 2;

function compactLabel(value: string, maximumLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim().toUpperCase();
  const characters = Array.from(normalized);
  return characters.length <= maximumLength
    ? normalized
    : `${characters.slice(0, Math.max(0, maximumLength - 1)).join("")}…`;
}

function statusFact(summary: CombatTurnSummary): string | null {
  const applied = summary.statusEvents.find((event) => event.kind === "status-applied");
  if (applied !== undefined) return `${applied.status.toUpperCase()} ${applied.durationAfter}T`;
  const ticking = summary.statusEvents.find((event) => event.kind === "status-tick");
  if (ticking !== undefined) return `${ticking.status.toUpperCase()} ${ticking.durationAfter}T`;
  const expired = summary.statusEvents.find((event) => event.kind === "status-expired");
  return expired === undefined ? null : `${expired.status.toUpperCase()} ENDED`;
}

function interruptedStatusFact(summary: CombatTurnSummary): string | null {
  const ticking = summary.statusEvents.find((event) => event.kind !== "status-applied" && event.amount > 0);
  if (ticking === undefined || ticking.kind === "status-applied") return null;
  const label = ticking.status === "poisoned"
    ? "POISON"
    : ticking.status === "burning"
      ? "BURNING"
      : ticking.status.toUpperCase();
  return `${label} −${ticking.amount} HP ${ticking.healthBefore}→${ticking.healthAfter}`;
}

function resultFact(
  summary: CombatTurnSummary,
  roadcraftImpact: CombatQuickReceiptRoadcraftImpact | null,
): string {
  const facts: string[] = [];
  if (summary.outcome !== null) facts.push(summary.outcome.toUpperCase());
  if (summary.defeatedIds.length > 0) facts.push(summary.defeatedIds.length === 1 ? "KO" : `${summary.defeatedIds.length} KO`);
  if (summary.restorative !== null) {
    facts.push(
      `HP ${summary.restorative.healthBefore}→${summary.restorative.healthAfter} (+${summary.restorative.amount})`,
      `×${summary.restorative.quantityBefore}→×${summary.restorative.quantityAfter}`,
    );
  } else if (summary.companionAction !== null) {
    facts.push(
      `${summary.companionAction.manaCost} MP`,
      `${summary.companionAction.damage} DMG`,
      `${summary.companionAction.effect.toUpperCase()} ${summary.companionAction.duration}T`,
    );
  } else if (summary.damage !== null) {
    facts.push(`HP ${summary.damage.healthBefore}→${summary.damage.healthAfter}${summary.damage.guarded ? " GUARDED" : ""}`);
  } else {
    const status = statusFact(summary);
    if (status !== null) facts.push(status);
  }
  if (roadcraftImpact?.kind === "flour-veil") facts.push(`VEIL +${roadcraftImpact.preventedDamage} HP`);
  if (roadcraftImpact?.kind === "millstone-drag") facts.push("DRAG WEAKENED");
  if (summary.mana !== null && summary.mana.amount > 0) facts.push(`MP ${summary.mana.manaBefore}→${summary.mana.manaAfter}`);
  return compactLabel(facts.join(" · ") || "RESOLVED", 30);
}

export function formatCombatQuickReceipt(
  summary: CombatTurnSummary,
  roadcraftImpact: CombatQuickReceiptRoadcraftImpact | null = null,
): string {
  if (summary.intentInterrupted) {
    const actor = compactLabel(summary.actorName, 9);
    const action = compactLabel(summary.actionLabel, 10);
    const status = interruptedStatusFact(summary);
    const outcome = summary.outcome === null ? null : summary.outcome.toUpperCase();
    const actorResult = summary.defeatedIds.includes(summary.actorId)
      ? outcome === null ? `${actor} DEFEATED` : "ACTOR DEFEATED"
      : outcome === null ? `${actor} STOPPED` : "ACTOR STOPPED";
    return compactLabel([
      outcome,
      actor,
      `${action} INTERRUPTED`,
      status,
      actorResult,
    ].filter((part) => part !== null).join(" · "), combatQuickReceiptMaxCharacters);
  }
  const actor = compactLabel(summary.actorName, 11);
  const action = compactLabel(summary.actionLabel, 13);
  const target = summary.targetId === null || summary.targetId === summary.actorId || summary.targetName === null
    ? ""
    : ` → ${compactLabel(summary.targetName, 11)}`;
  const receipt = `${actor} · ${action}${target} · ${resultFact(summary, roadcraftImpact)}`;
  return compactLabel(receipt, combatQuickReceiptMaxCharacters);
}

export function projectCombatInformationRailLayout(hasLatestTurn: boolean): CombatInformationRailLayout {
  return {
    threat: { ...threatBounds },
    receipt: hasLatestTurn ? { ...receiptBounds } : null,
    informationBottom: receiptBounds.y + receiptBounds.height,
  };
}

export function projectCombatEnemyFormation(enemyCount: number): readonly CombatEnemyFormationSlot[] {
  const count = Math.max(0, Math.min(6, Math.floor(Number.isFinite(enemyCount) ? enemyCount : 0)));
  const dense = count > 3;
  const scale = dense ? 0.72 : 1;
  return Array.from({ length: count }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 210 + column * 34;
    const y = dense ? 106 + row * 57 : 117;
    const healthWidth = dense ? 22 : 26;
    const healthY = y + (dense ? 11 : 13);
    return {
      x,
      y,
      scale,
      healthX: x - healthWidth / 2,
      healthY,
      healthWidth,
      animatedSilhouetteTop: y - maximumMonsterTopOffset * scale - maximumActorLift,
      visualEnvelopeBottom: Math.max(healthY + 3, y + 16),
    };
  });
}

export function projectCombatCueVerticalLayout(
  spriteY: number,
  informationBottom: number,
  precedingRowBottom: number | null = null,
): CombatCueVerticalLayout {
  const safeSpriteY = Number.isFinite(spriteY) ? spriteY : 0;
  const safeInformationBottom = Math.max(0, Number.isFinite(informationBottom) ? informationBottom : 0);
  const safePrecedingRowBottom = precedingRowBottom === null
    ? safeInformationBottom
    : Math.max(safeInformationBottom, Number.isFinite(precedingRowBottom) ? precedingRowBottom : safeInformationBottom);
  const cueTop = safePrecedingRowBottom + combatInformationClearance;
  const statusCenterY = Math.max(
    safeSpriteY - 50,
    cueTop + animatedLayerMaximumOffset + statusMarkerRadius,
  );
  const statusTop = statusCenterY - statusMarkerRadius;
  const statusBottom = statusCenterY + statusMarkerBottomOffset;
  const reticleTop = Math.max(safeSpriteY - 43, statusBottom + 0.5, cueTop);
  return {
    reticleTop,
    reticleBottom: Math.min(176, safeSpriteY + 16),
    statusTop,
    statusCenterY,
    statusBottom,
  };
}
