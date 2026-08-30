export interface RuntimeLiveness {
  nowMs: number;
  lastAdvanceAtMs: number;
  beatDurationMs: number;
  paused: boolean;
  hidden: boolean;
  interacting: boolean;
}

export function runtimeStallThresholdMs(beatDurationMs: number): number {
  return Math.max(20_000, Math.max(250, beatDurationMs) * 6);
}

export function shouldRecoverRuntime(liveness: RuntimeLiveness): boolean {
  if (liveness.paused || liveness.hidden || liveness.interacting) return false;
  return liveness.nowMs - liveness.lastAdvanceAtMs >= runtimeStallThresholdMs(liveness.beatDurationMs);
}
