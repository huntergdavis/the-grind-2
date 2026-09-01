import type { WeaponMemoryCeremonyPacketV1 } from "../ui/weapon-memory";

export type WeaponMemoryCutawayPhase =
  | "name"
  | "first-use"
  | "road"
  | "familiar-form"
  | "final-strike"
  | "memory"
  | "final"
  | "settled"
  | "static";

export interface WeaponMemoryCutawayFrame {
  readonly phase: WeaponMemoryCutawayPhase;
  readonly weaponX: number;
  readonly weaponY: number;
  readonly weaponRotation: number;
  readonly weaponScale: number;
  readonly weaponAlpha: number;
  readonly heroAlpha: number;
  readonly marksProgress: number;
  readonly firstAlpha: number;
  readonly strongestAlpha: number;
  readonly formAlpha: number;
  readonly finalAlpha: number;
  readonly tableauAlpha: number;
}

export const weaponMemoryDurationSeconds = 9;
export const weaponMemoryStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

export function projectWeaponMemoryCutawayFrame(
  _packet: WeaponMemoryCeremonyPacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): WeaponMemoryCutawayFrame {
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      weaponX: 104,
      weaponY: 88,
      weaponRotation: -0.22,
      weaponScale: 1.12,
      weaponAlpha: 1,
      heroAlpha: 1,
      marksProgress: 1,
      firstAlpha: 1,
      strongestAlpha: 1,
      formAlpha: 1,
      finalAlpha: 1,
      tableauAlpha: 1,
    };
  }

  const progress = clampUnit(elapsedSeconds / weaponMemoryDurationSeconds);
  const phase: WeaponMemoryCutawayPhase = progress < 0.14
    ? "name"
    : progress < 0.29
      ? "first-use"
      : progress < 0.52
        ? "road"
        : progress < 0.66
          ? "familiar-form"
          : progress < 0.79
            ? "final-strike"
            : progress < 0.91
              ? "memory"
              : progress < 1
                ? "final"
                : "settled";
  const entrance = rangeProgress(progress, 0, 0.14);
  const settle = rangeProgress(progress, 0.14, 0.26);
  const drift = Math.sin(entrance * Math.PI) * 8 * (1 - settle);
  return {
    phase,
    weaponX: 82 + entrance * 22,
    weaponY: 94 - entrance * 6 - drift * 0.2,
    weaponRotation: 0.35 - entrance * 0.57,
    weaponScale: 0.72 + entrance * 0.4,
    weaponAlpha: entrance,
    heroAlpha: rangeProgress(progress, 0.79, 0.91),
    marksProgress: rangeProgress(progress, 0.25, 0.52),
    firstAlpha: rangeProgress(progress, 0.12, 0.29),
    strongestAlpha: rangeProgress(progress, 0.36, 0.57),
    formAlpha: rangeProgress(progress, 0.5, 0.66),
    finalAlpha: rangeProgress(progress, 0.64, 0.79),
    tableauAlpha: rangeProgress(progress, 0.79, 0.91),
  };
}
