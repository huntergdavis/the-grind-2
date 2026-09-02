export type CounterDuelVisualPhase = "tell" | "prediction" | "reveal" | "pattern-break" | "consequence" | "settled" | "static";

export interface CounterDuelMotion {
  phase: CounterDuelVisualPhase;
  tellAlpha: number;
  predictionAlpha: number;
  revealAlpha: number;
  patternBreakAlpha: number;
  patternBreakScale: number;
  consequenceAlpha: number;
  heroOffsetX: number;
  opponentOffsetX: number;
}

export const counterDuelCueDurationSeconds = 3.6;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function projectCounterDuelMotion(elapsedSeconds: number, reducedMotion: boolean, patternBreak = false): CounterDuelMotion {
  if (reducedMotion) {
    return {
      phase: "static",
      tellAlpha: 1,
      predictionAlpha: 1,
      revealAlpha: 1,
      patternBreakAlpha: patternBreak ? 1 : 0,
      patternBreakScale: 1,
      consequenceAlpha: 1,
      heroOffsetX: 0,
      opponentOffsetX: 0,
    };
  }
  const progress = clampUnit(elapsedSeconds / counterDuelCueDurationSeconds);
  const phase: CounterDuelVisualPhase = patternBreak
    ? progress < 0.16
      ? "tell"
      : progress < 0.34
        ? "prediction"
        : progress < 0.58
          ? "reveal"
          : progress < 0.84
            ? "pattern-break"
            : progress < 1
              ? "consequence"
              : "settled"
    : progress < 0.2
    ? "tell"
    : progress < 0.4
      ? "prediction"
      : progress < 0.68
        ? "reveal"
        : progress < 1
          ? "consequence"
          : "settled";
  const revealStart = patternBreak ? 0.34 : 0.4;
  const revealSpan = patternBreak ? 0.24 : 0.28;
  const revealPulse = phase === "reveal" ? Math.sin(((progress - revealStart) / revealSpan) * Math.PI) : 0;
  const breakProgress = patternBreak ? clampUnit((progress - 0.58) / 0.26) : 0;
  const breakPulse = phase === "pattern-break" ? Math.sin(breakProgress * Math.PI) : 0;
  return {
    phase,
    tellAlpha: 1,
    predictionAlpha: progress >= (patternBreak ? 0.16 : 0.2) ? 1 : 0,
    revealAlpha: progress >= revealStart ? 1 : 0,
    patternBreakAlpha: patternBreak && progress >= 0.58 ? 1 : 0,
    patternBreakScale: patternBreak ? 0.72 + breakProgress * 0.28 : 1,
    consequenceAlpha: progress >= (patternBreak ? 0.84 : 0.68) ? 1 : 0,
    heroOffsetX: revealPulse * 5 + breakPulse * 11,
    opponentOffsetX: revealPulse * -5 + breakPulse * -4,
  };
}
