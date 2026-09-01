import type { HeroLevelUpPacketV1 } from "../ui/hero-level-up";

export type HeroLevelUpCutawayPhase =
  | "source"
  | "threshold"
  | "ascent"
  | "mechanics"
  | "tableau"
  | "final"
  | "settled"
  | "static";

export interface HeroLevelUpCutawayFrame {
  readonly phase: HeroLevelUpCutawayPhase;
  readonly heroLift: number;
  readonly heroScale: number;
  readonly glowAlpha: number;
  readonly ringProgress: number;
  readonly oldLevelAlpha: number;
  readonly newLevelAlpha: number;
  readonly newLevelScale: number;
  readonly sourceAlpha: number;
  readonly thresholdAlpha: number;
  readonly mechanicsAlpha: number;
  readonly tableauAlpha: number;
}

export const heroLevelUpStandardDurationSeconds = 5.6;
export const heroLevelUpMilestoneDurationSeconds = 8;
export const heroLevelUpMaximumDurationSeconds = 9;
export const heroLevelUpStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

export function heroLevelUpDurationSeconds(packet: HeroLevelUpPacketV1): number {
  if (packet.emphasis === "maximum") return heroLevelUpMaximumDurationSeconds;
  return packet.emphasis === "milestone"
    ? heroLevelUpMilestoneDurationSeconds
    : heroLevelUpStandardDurationSeconds;
}

export function projectHeroLevelUpCutawayFrame(
  packet: HeroLevelUpPacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): HeroLevelUpCutawayFrame {
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      heroLift: 3,
      heroScale: packet.emphasis === "maximum" ? 1.12 : 1.08,
      glowAlpha: 1,
      ringProgress: 1,
      oldLevelAlpha: 0.42,
      newLevelAlpha: 1,
      newLevelScale: 1,
      sourceAlpha: 1,
      thresholdAlpha: 1,
      mechanicsAlpha: 1,
      tableauAlpha: 1,
    };
  }

  const progress = clampUnit(elapsedSeconds / heroLevelUpDurationSeconds(packet));
  const phase: HeroLevelUpCutawayPhase = progress < 0.12
    ? "source"
    : progress < 0.3
      ? "threshold"
      : progress < 0.56
        ? "ascent"
        : progress < 0.74
          ? "mechanics"
          : progress < 0.9
            ? "tableau"
            : progress < 1
              ? "final"
              : "settled";
  const rise = rangeProgress(progress, 0.3, 0.56);
  const settle = rangeProgress(progress, 0.56, 0.74);
  const pulse = Math.sin(rise * Math.PI);
  const milestoneScale = packet.emphasis === "maximum" ? 0.16 : packet.emphasis === "milestone" ? 0.12 : 0.08;
  return {
    phase,
    heroLift: pulse * 8 + settle * 3,
    heroScale: 1 + pulse * milestoneScale + settle * (packet.emphasis === "maximum" ? 0.12 : 0.08),
    glowAlpha: clampUnit(rangeProgress(progress, 0.24, 0.42) * (1 - rangeProgress(progress, 0.9, 1) * 0.28)),
    ringProgress: rangeProgress(progress, 0.3, 0.62),
    oldLevelAlpha: 1 - rangeProgress(progress, 0.3, 0.5) * 0.58,
    newLevelAlpha: rangeProgress(progress, 0.42, 0.56),
    newLevelScale: 1 + (1 - rangeProgress(progress, 0.42, 0.64)) * 0.32,
    sourceAlpha: 1,
    thresholdAlpha: progress >= 0.12 ? 1 : 0,
    mechanicsAlpha: progress >= 0.56 ? 1 : 0,
    tableauAlpha: progress >= 0.74 ? 1 : 0,
  };
}
