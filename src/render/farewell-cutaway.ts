import type { CompanionFarewellPacket } from "../ui/companion-farewell";

export type FarewellCutawayPhase = "promise" | "journey" | "arrival" | "farewell" | "legacy" | "final" | "settled" | "static";

export interface FarewellCutawayFrame {
  readonly phase: FarewellCutawayPhase;
  readonly outcome: CompanionFarewellPacket["outcome"];
  readonly heroOffsetX: number;
  readonly companionOffsetX: number;
  readonly companionOffsetY: number;
  readonly companionKneel: number;
  readonly companionAlpha: number;
  readonly journeyAlpha: number;
  readonly arrivalAlpha: number;
  readonly farewellAlpha: number;
  readonly legacyAlpha: number;
}

export const farewellCutawayDurationSeconds = 8;
export const farewellCutawayStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

export function projectFarewellCutawayFrame(
  packet: CompanionFarewellPacket,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): FarewellCutawayFrame {
  const injured = packet.outcome === "injured";
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      outcome: packet.outcome,
      heroOffsetX: 5,
      companionOffsetX: injured ? 14 : 42,
      companionOffsetY: injured ? 3 : 0,
      companionKneel: injured ? 1 : 0,
      companionAlpha: injured ? 0.88 : 0.72,
      journeyAlpha: 1,
      arrivalAlpha: 1,
      farewellAlpha: 1,
      legacyAlpha: 1,
    };
  }

  const progress = clampUnit(elapsedSeconds / farewellCutawayDurationSeconds);
  const phase: FarewellCutawayPhase = progress < 0.12
    ? "promise"
    : progress < 0.34
      ? "journey"
      : progress < 0.52
        ? "arrival"
        : progress < 0.72
          ? "farewell"
          : progress < 1
            ? "legacy"
            : "settled";
  const meet = rangeProgress(progress, 0.12, 0.34);
  const depart = rangeProgress(progress, 0.52, 0.82);
  const kneel = injured ? rangeProgress(progress, 0.34, 0.52) : 0;
  return {
    phase,
    outcome: packet.outcome,
    heroOffsetX: meet * 5,
    companionOffsetX: meet * -5 + depart * (injured ? 19 : 47),
    companionOffsetY: kneel * 3,
    companionKneel: kneel,
    companionAlpha: 1 - depart * (injured ? 0.12 : 0.28),
    journeyAlpha: progress >= 0.12 ? 1 : 0,
    arrivalAlpha: progress >= 0.34 ? 1 : 0,
    farewellAlpha: progress >= 0.52 ? 1 : 0,
    legacyAlpha: progress >= 0.72 ? 1 : 0,
  };
}
