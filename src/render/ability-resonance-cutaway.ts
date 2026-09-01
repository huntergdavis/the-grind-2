import type { AbilityResonancePacketV1 } from "../ui/ability-resonance";

export type AbilityResonanceCutawayPhase =
  | "source"
  | "experience"
  | "resonance"
  | "mastery"
  | "tableau"
  | "final"
  | "settled"
  | "static";

export interface AbilityResonanceGlyphIntensities {
  readonly arcane: number;
  readonly burning: number;
  readonly poison: number;
  readonly weaken: number;
  readonly piercing: number;
}

export interface AbilityResonanceCutawayFrame {
  readonly phase: AbilityResonanceCutawayPhase;
  readonly sourceAlpha: number;
  readonly battleSourceAlpha: number;
  readonly practiceSourceAlpha: number;
  readonly sourceMotion: number;
  readonly experienceAlpha: number;
  readonly experienceFillProgress: number;
  readonly thresholdFlashAlpha: number;
  readonly glyphAlpha: number;
  readonly glyphScale: number;
  readonly glyphIntensities: AbilityResonanceGlyphIntensities;
  readonly oldLevelAlpha: number;
  readonly newLevelAlpha: number;
  readonly newLevelScale: number;
  readonly masteryAlpha: number;
  readonly nextUseAlpha: number;
  readonly tableauAlpha: number;
  readonly heroLift: number;
  readonly heroScale: number;
}

export const abilityResonanceDurationSeconds = 4.8;
export const abilityResonanceStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

function glyphIntensities(
  effect: AbilityResonancePacketV1["effect"],
  intensity: number,
): AbilityResonanceGlyphIntensities {
  const bounded = clampUnit(intensity);
  return {
    arcane: effect === "arcane" ? bounded : 0,
    burning: effect === "burning" ? bounded : 0,
    poison: effect === "poison" ? bounded : 0,
    weaken: effect === "weaken" ? bounded : 0,
    piercing: effect === "piercing" ? bounded : 0,
  };
}

function completeFrame(
  packet: AbilityResonancePacketV1,
  phase: "static" | "settled",
): AbilityResonanceCutawayFrame {
  return {
    phase,
    sourceAlpha: 1,
    battleSourceAlpha: packet.sourceKind === "battle-use" ? 1 : 0,
    practiceSourceAlpha: packet.sourceKind === "practice" ? 1 : 0,
    sourceMotion: 0,
    experienceAlpha: 1,
    experienceFillProgress: 1,
    thresholdFlashAlpha: 1,
    glyphAlpha: 1,
    glyphScale: 1,
    glyphIntensities: glyphIntensities(packet.effect, 1),
    oldLevelAlpha: 0.42,
    newLevelAlpha: 1,
    newLevelScale: 1,
    masteryAlpha: 1,
    nextUseAlpha: 1,
    tableauAlpha: 1,
    heroLift: 3,
    heroScale: 1.08,
  };
}

export function projectAbilityResonanceCutawayFrame(
  packet: AbilityResonancePacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): AbilityResonanceCutawayFrame {
  if (reducedMotion || forceOutcome) return completeFrame(packet, "static");

  const progress = clampUnit(elapsedSeconds / abilityResonanceDurationSeconds);
  if (progress >= 1) return completeFrame(packet, "settled");

  const phase: AbilityResonanceCutawayPhase = progress < 0.16
    ? "source"
    : progress < 0.4
      ? "experience"
      : progress < 0.63
        ? "resonance"
        : progress < 0.8
          ? "mastery"
          : progress < 0.94
            ? "tableau"
            : "final";
  const sourceProgress = rangeProgress(progress, 0, 0.16);
  const experienceProgress = rangeProgress(progress, 0.16, 0.4);
  const resonanceProgress = rangeProgress(progress, 0.4, 0.63);
  const masteryProgress = rangeProgress(progress, 0.63, 0.8);
  const tableauProgress = rangeProgress(progress, 0.8, 0.94);
  const resonancePulse = Math.sin(resonanceProgress * Math.PI);
  const masteryPulse = Math.sin(masteryProgress * Math.PI);
  const sourceMotion = Math.sin(sourceProgress * Math.PI);
  const glyphIntensity = progress < 0.4
    ? 0
    : clampUnit(resonanceProgress + resonancePulse * 0.16);

  return {
    phase,
    sourceAlpha: rangeProgress(progress, 0, 0.08),
    battleSourceAlpha: packet.sourceKind === "battle-use" ? rangeProgress(progress, 0, 0.08) : 0,
    practiceSourceAlpha: packet.sourceKind === "practice" ? rangeProgress(progress, 0, 0.08) : 0,
    sourceMotion,
    experienceAlpha: rangeProgress(progress, 0.12, 0.2),
    experienceFillProgress: experienceProgress,
    thresholdFlashAlpha: progress < 0.36
      ? 0
      : progress < 0.48
        ? Math.sin(rangeProgress(progress, 0.36, 0.48) * Math.PI)
        : 1,
    glyphAlpha: glyphIntensity,
    glyphScale: 0.82 + glyphIntensity * 0.18 + resonancePulse * 0.12,
    glyphIntensities: glyphIntensities(packet.effect, glyphIntensity),
    oldLevelAlpha: 1 - masteryProgress * 0.58,
    newLevelAlpha: masteryProgress,
    newLevelScale: 1 + (1 - masteryProgress) * 0.28 + masteryPulse * 0.08,
    masteryAlpha: masteryProgress,
    nextUseAlpha: rangeProgress(progress, 0.8, 0.94),
    tableauAlpha: tableauProgress,
    heroLift: resonancePulse * 5 + masteryProgress * 3,
    heroScale: 1 + resonancePulse * 0.08 + masteryProgress * 0.08,
  };
}
