export type HeroGrowthAllocationCutawayPhase =
  | "deed"
  | "options"
  | "decision"
  | "allocation"
  | "mechanics"
  | "resources"
  | "final"
  | "settled"
  | "static";

export interface HeroGrowthAllocationCutawayFrame {
  readonly phase: HeroGrowthAllocationCutawayPhase;
  readonly activeAllocationIndex: number;
  readonly heroLift: number;
  readonly heroScale: number;
  readonly glowAlpha: number;
  readonly ringProgress: number;
  readonly optionsAlpha: number;
  readonly unselectedAlpha: number;
  readonly selectedScale: number;
  readonly allocationProgress: number;
  readonly mechanicsAlpha: number;
  readonly resourcesAlpha: number;
  readonly tableauAlpha: number;
}

export const heroGrowthAllocationBaseDurationSeconds = 8.5;
export const heroGrowthAllocationAdditionalRecordSeconds = 1.1;
export const heroGrowthAllocationStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

function assertAllocationCount(allocationCount: number): void {
  if (!Number.isSafeInteger(allocationCount) || allocationCount < 1 || allocationCount > 3) {
    throw new RangeError("A growth montage requires one to three persisted allocations");
  }
}

export function heroGrowthAllocationDurationSeconds(allocationCount: number): number {
  assertAllocationCount(allocationCount);
  return heroGrowthAllocationBaseDurationSeconds
    + (allocationCount - 1) * heroGrowthAllocationAdditionalRecordSeconds;
}

export function projectHeroGrowthAllocationCutawayFrame(
  allocationCount: number,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): HeroGrowthAllocationCutawayFrame {
  assertAllocationCount(allocationCount);
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      activeAllocationIndex: allocationCount - 1,
      heroLift: 3,
      heroScale: 1.1,
      glowAlpha: 1,
      ringProgress: 1,
      optionsAlpha: 1,
      unselectedAlpha: 0.62,
      selectedScale: 1,
      allocationProgress: 1,
      mechanicsAlpha: 1,
      resourcesAlpha: 1,
      tableauAlpha: 1,
    };
  }

  const progress = clampUnit(elapsedSeconds / heroGrowthAllocationDurationSeconds(allocationCount));
  const recordProgress = rangeProgress(progress, 0.12, 0.62) * allocationCount;
  const activeAllocationIndex = Math.min(allocationCount - 1, Math.floor(recordProgress));
  const localRecordProgress = clampUnit(recordProgress - activeAllocationIndex);
  const phase: HeroGrowthAllocationCutawayPhase = progress < 0.12
    ? "deed"
    : progress < 0.62
      ? localRecordProgress < 0.3
        ? "options"
        : localRecordProgress < 0.58
          ? "decision"
          : "allocation"
      : progress < 0.75
        ? "mechanics"
        : progress < 0.88
          ? "resources"
          : progress < 1
            ? "final"
            : "settled";
  const allocationProgress = phase === "allocation"
    ? rangeProgress(localRecordProgress, 0.58, 1)
    : progress >= 0.62 || activeAllocationIndex > 0
      ? 1
      : 0;
  const allocationPulse = phase === "allocation" ? Math.sin(allocationProgress * Math.PI) : 0;
  const decisionProgress = phase === "decision" ? rangeProgress(localRecordProgress, 0.3, 0.58) : phase === "allocation" ? 1 : 0;
  return {
    phase,
    activeAllocationIndex,
    heroLift: allocationPulse * 6 + rangeProgress(progress, 0.62, 0.88) * 3,
    heroScale: 1 + allocationPulse * 0.1 + rangeProgress(progress, 0.62, 0.88) * 0.08,
    glowAlpha: rangeProgress(progress, 0.1, 0.24),
    ringProgress: rangeProgress(progress, 0.12, 0.75),
    optionsAlpha: progress < 0.12 ? 0 : 1,
    unselectedAlpha: 1 - decisionProgress * 0.58,
    selectedScale: 1 + Math.sin(decisionProgress * Math.PI) * 0.09,
    allocationProgress,
    mechanicsAlpha: progress >= 0.62 ? 1 : 0,
    resourcesAlpha: progress >= 0.75 ? 1 : 0,
    tableauAlpha: progress >= 0.88 ? 1 : 0,
  };
}
