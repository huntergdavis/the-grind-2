export const reparteeMinimumDwellMs = 8_000;

export interface ReparteeDwell {
  readonly sourceKey: string | null;
  readonly elapsedMs: number;
  readonly sampledAtMs: number;
  readonly running: boolean;
}

export function createReparteeDwell(): ReparteeDwell {
  return { sourceKey: null, elapsedMs: 0, sampledAtMs: 0, running: false };
}

/** Presentation time only: pause/visibility edges settle the old interval once. */
export function updateReparteeDwell(
  previous: ReparteeDwell,
  sourceKey: string | null,
  nowMs: number,
  running: boolean,
): ReparteeDwell {
  const now = Number.isFinite(nowMs) ? Math.max(previous.sampledAtMs, nowMs) : previous.sampledAtMs;
  if (sourceKey === null || sourceKey !== previous.sourceKey) {
    return { sourceKey, elapsedMs: 0, sampledAtMs: now, running: sourceKey !== null && running };
  }
  const credited = previous.running ? Math.max(0, now - previous.sampledAtMs) : 0;
  return {
    sourceKey,
    elapsedMs: Math.min(reparteeMinimumDwellMs, previous.elapsedMs + credited),
    sampledAtMs: now,
    running,
  };
}

/** Inspection keeps its normal autonomous progress; fixture fast mode is explicit. */
export function reparteeDwellPending(dwell: ReparteeDwell, visible: boolean, fast = false): boolean {
  return !fast && visible && dwell.sourceKey !== null && dwell.elapsedMs < reparteeMinimumDwellMs;
}
