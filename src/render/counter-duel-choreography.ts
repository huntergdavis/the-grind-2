export type CounterDuelVisualPhase = "tell" | "prediction" | "reveal" | "consequence" | "settled" | "static";

export interface CounterDuelMotion {
  phase: CounterDuelVisualPhase;
  tellAlpha: number;
  predictionAlpha: number;
  revealAlpha: number;
  consequenceAlpha: number;
  heroOffsetX: number;
  opponentOffsetX: number;
}

export const counterDuelCueDurationSeconds = 3.6;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function projectCounterDuelMotion(elapsedSeconds: number, reducedMotion: boolean): CounterDuelMotion {
  if (reducedMotion) {
    return {
      phase: "static",
      tellAlpha: 1,
      predictionAlpha: 1,
      revealAlpha: 1,
      consequenceAlpha: 1,
      heroOffsetX: 0,
      opponentOffsetX: 0,
    };
  }
  const progress = clampUnit(elapsedSeconds / counterDuelCueDurationSeconds);
  const phase: CounterDuelVisualPhase = progress < 0.2
    ? "tell"
    : progress < 0.4
      ? "prediction"
      : progress < 0.68
        ? "reveal"
        : progress < 1
          ? "consequence"
          : "settled";
  const revealPulse = phase === "reveal" ? Math.sin(((progress - 0.4) / 0.28) * Math.PI) : 0;
  return {
    phase,
    tellAlpha: 1,
    predictionAlpha: progress >= 0.2 ? 1 : 0,
    revealAlpha: progress >= 0.4 ? 1 : 0,
    consequenceAlpha: progress >= 0.68 ? 1 : 0,
    heroOffsetX: revealPulse * 5,
    opponentOffsetX: revealPulse * -5,
  };
}
