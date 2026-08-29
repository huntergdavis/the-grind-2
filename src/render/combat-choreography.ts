import type { AbilityEffect, CombatAction, CombatState } from "../depth/types";

export type CombatMotionPhase =
  | "intent"
  | "anticipation"
  | "impact"
  | "reaction"
  | "consequence"
  | "settled";

export interface CombatVisualCue {
  id: string;
  actorId: string;
  targetId: string;
  action: CombatAction["type"];
  actorSide: "heroes" | "enemies";
  amount: number;
  effect: AbilityEffect | null;
}

export interface CombatMotion {
  phase: CombatMotionPhase;
  actorOffsetX: number;
  actorOffsetY: number;
  targetOffsetX: number;
  effectAlpha: number;
  effectScale: number;
}

export const combatCueDurationSeconds = 1.65;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

function phaseAt(progress: number): CombatMotionPhase {
  if (progress < 0.12) return "intent";
  if (progress < 0.32) return "anticipation";
  if (progress < 0.48) return "impact";
  if (progress < 0.72) return "reaction";
  if (progress < 1) return "consequence";
  return "settled";
}

export function projectCombatMotion(
  cue: CombatVisualCue,
  elapsedSeconds: number,
  reducedMotion: boolean,
): CombatMotion {
  const progress = clampUnit(elapsedSeconds / combatCueDurationSeconds);
  const phase = phaseAt(progress);
  const direction = cue.actorSide === "heroes" ? 1 : -1;
  const impactPulse = progress >= 1
    ? 0
    : Math.sin(rangeProgress(progress, 0.3, 0.72) * Math.PI);
  const emphasis = cue.action === "ability" ? 1.28 : cue.action === "guard" ? 0.9 : 1;

  if (reducedMotion) {
    return {
      phase,
      actorOffsetX: 0,
      actorOffsetY: 0,
      targetOffsetX: 0,
      effectAlpha: phase === "impact" || phase === "reaction" ? 0.72 : 0,
      effectScale: emphasis,
    };
  }

  if (cue.action === "guard") {
    return {
      phase,
      actorOffsetX: 0,
      actorOffsetY: phase === "anticipation" ? -2.5 : 0,
      targetOffsetX: 0,
      effectAlpha: impactPulse * 0.82,
      effectScale: 0.85 + impactPulse * 0.3,
    };
  }

  let actorOffsetX = 0;
  if (progress >= 0.12 && progress < 0.32) {
    actorOffsetX = -direction * 4 * rangeProgress(progress, 0.12, 0.32);
  } else if (progress >= 0.32 && progress < 0.48) {
    actorOffsetX = direction * (-4 + 21 * rangeProgress(progress, 0.32, 0.48));
  } else if (progress >= 0.48 && progress < 0.72) {
    actorOffsetX = direction * (17 - 11 * rangeProgress(progress, 0.48, 0.72));
  } else if (progress >= 0.72 && progress < 1) {
    actorOffsetX = direction * 6 * (1 - rangeProgress(progress, 0.72, 1));
  }

  const reaction = phase === "reaction"
    ? Math.sin(rangeProgress(progress, 0.48, 0.72) * Math.PI * 5) * Math.min(5, 2 + cue.amount / 12)
    : 0;
  return {
    phase,
    actorOffsetX,
    actorOffsetY: phase === "impact" && cue.action === "ability" ? -2 : 0,
    targetOffsetX: reaction,
    effectAlpha: impactPulse * (cue.action === "ability" ? 0.96 : 0.78),
    effectScale: (0.75 + impactPulse * 0.55) * emphasis,
  };
}

export function combatEffectColor(cue: CombatVisualCue): number {
  if (cue.action === "guard") return 0x7ab6d9;
  return abilityEffectColor(cue.effect);
}

export function abilityEffectColor(effect: AbilityEffect | null): number {
  if (effect === "arcane") return 0x8db4ff;
  if (effect === "burning") return 0xff8d4d;
  if (effect === "poison") return 0x8fcf64;
  if (effect === "weaken") return 0xb88ad4;
  if (effect === "piercing") return 0xf3e6bc;
  return 0xffc857;
}

export function projectLatestCombatCue(combat: CombatState): CombatVisualCue | null {
  const entry = [...combat.log]
    .reverse()
    .find((candidate) => candidate.action !== "status");
  if (entry === undefined || entry.action === "status") return null;
  const actor = combat.combatants.find((candidate) => candidate.id === entry.actorId);
  const targetId = entry.action === "guard" ? entry.actorId : entry.targetId;
  if (actor === undefined || targetId === null) return null;
  const target = combat.combatants.find((candidate) => candidate.id === targetId);
  if (target === undefined) return null;
  const effect = entry.abilityId === null
    ? null
    : actor.abilities.find((ability) => ability.id === entry.abilityId)?.effect ?? null;
  return {
    id: `${combat.id}:turn:${entry.turn}:${entry.actorId}:${entry.action}`,
    actorId: actor.id,
    targetId: target.id,
    action: entry.action,
    actorSide: actor.side,
    amount: entry.amount,
    effect,
  };
}
