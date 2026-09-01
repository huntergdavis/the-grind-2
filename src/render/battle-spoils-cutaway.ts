import type { BattleSpoilsComparisonPacketV1 } from "../ui/battle-spoils";

export type BattleSpoilsCutawayPhase =
  | "found"
  | "compare"
  | "exchange"
  | "consequence"
  | "final"
  | "settled"
  | "static";

export interface BattleSpoilsCutawayFrame {
  readonly phase: BattleSpoilsCutawayPhase;
  readonly oldItemX: number;
  readonly oldItemY: number;
  readonly oldItemAlpha: number;
  readonly oldItemRotation: number;
  readonly newItemX: number;
  readonly newItemY: number;
  readonly newItemAlpha: number;
  readonly newItemRotation: number;
  readonly arrowAlpha: number;
  readonly comparisonAlpha: number;
  readonly resourceAlpha: number;
  readonly heroAlpha: number;
}

export const battleSpoilsDurationSeconds = 5.2;
export const battleSpoilsStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function range(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

export function projectBattleSpoilsCutawayFrame(
  _packet: BattleSpoilsComparisonPacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): BattleSpoilsCutawayFrame {
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      oldItemX: 76,
      oldItemY: 88,
      oldItemAlpha: 1,
      oldItemRotation: -0.18,
      newItemX: 150,
      newItemY: 88,
      newItemAlpha: 1,
      newItemRotation: 0.12,
      arrowAlpha: 1,
      comparisonAlpha: 1,
      resourceAlpha: 1,
      heroAlpha: 1,
    };
  }
  const progress = clampUnit(elapsedSeconds / battleSpoilsDurationSeconds);
  const phase: BattleSpoilsCutawayPhase = progress < 0.2
    ? "found"
    : progress < 0.43
      ? "compare"
      : progress < 0.65
        ? "exchange"
        : progress < 0.86
          ? "consequence"
          : progress < 1
            ? "final"
            : "settled";
  const found = range(progress, 0, 0.2);
  const compare = range(progress, 0.18, 0.43);
  const exchange = range(progress, 0.43, 0.65);
  return {
    phase,
    oldItemX: 76 - exchange * 10,
    oldItemY: 88 + exchange * 11,
    oldItemAlpha: found * (1 - exchange * 0.35),
    oldItemRotation: -0.18 - exchange * 0.2,
    newItemX: 166 - found * 16 + exchange * 11,
    newItemY: 82 + (1 - found) * 10 - exchange * 5,
    newItemAlpha: found,
    newItemRotation: 0.3 - found * 0.18 + exchange * 0.08,
    arrowAlpha: compare,
    comparisonAlpha: compare,
    resourceAlpha: range(progress, 0.62, 0.86),
    heroAlpha: range(progress, 0.72, 0.9),
  };
}
