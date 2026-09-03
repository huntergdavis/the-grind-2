import {
  maximumFieldNoteResolutionUnlocks,
  type FieldNoteResolutionPacketV1,
} from "../ui/field-note-resolution";

export type FieldNoteCutawayPhase =
  | "observations"
  | "third-mark"
  | "inference"
  | "precedence"
  | "final"
  | "settled"
  | "static";

export interface FieldNoteCutawayFrame {
  readonly phase: FieldNoteCutawayPhase;
  readonly activeUnlockIndex: number;
  readonly unlockAlphas: readonly number[];
  readonly pageAlpha: number;
  readonly inkAlpha: number;
  readonly silhouetteAlpha: number;
  readonly thirdMarkAlpha: number;
  readonly habitAlpha: number;
  readonly precedenceAlpha: number;
  readonly finalAlpha: number;
  readonly cameraScale: number;
  readonly cameraOffsetX: number;
  readonly cameraOffsetY: number;
}

export const fieldNoteCutawayDurationSeconds = 4.8;
export const fieldNoteCutawayStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

function unlockCount(packet: FieldNoteResolutionPacketV1): number {
  const count = packet.unlocks.length;
  if (!Number.isSafeInteger(count) || count < 1 || count > maximumFieldNoteResolutionUnlocks) {
    throw new RangeError("A Field Note cutaway requires one or two unlocks");
  }
  for (let index = 1; index < count; index += 1) {
    if (packet.unlocks[index - 1]!.speciesId >= packet.unlocks[index]!.speciesId) {
      throw new RangeError("Field Note cutaway unlocks must be strictly sorted by species ID");
    }
  }
  return count;
}

function completeFrame(count: number, phase: "settled" | "static"): FieldNoteCutawayFrame {
  return {
    phase,
    activeUnlockIndex: count - 1,
    unlockAlphas: Object.freeze(Array.from({ length: count }, () => 1)),
    pageAlpha: 1,
    inkAlpha: 1,
    silhouetteAlpha: 1,
    thirdMarkAlpha: 1,
    habitAlpha: 1,
    precedenceAlpha: 1,
    finalAlpha: 1,
    cameraScale: 1,
    cameraOffsetX: 0,
    cameraOffsetY: 0,
  };
}

export function projectFieldNoteCutawayFrame(
  packet: FieldNoteResolutionPacketV1,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): FieldNoteCutawayFrame {
  const count = unlockCount(packet);
  if (reducedMotion || forceOutcome) return completeFrame(count, "static");

  const progress = clampUnit(elapsedSeconds / fieldNoteCutawayDurationSeconds);
  if (progress >= 1) return completeFrame(count, "settled");

  const phase: FieldNoteCutawayPhase = progress < 0.28
    ? "observations"
    : progress < 0.45
      ? "third-mark"
      : progress < 0.66
        ? "inference"
        : progress < 0.84
          ? "precedence"
          : "final";
  const observationProgress = rangeProgress(progress, 0, 0.28);
  const observationCursor = observationProgress * count;
  const activeUnlockIndex = Math.min(count - 1, Math.floor(observationCursor));
  const unlockAlphas = Object.freeze(packet.unlocks.map((_unlock, index) => {
    const start = index / count * 0.22;
    return rangeProgress(progress, start, start + 0.08);
  }));
  const cameraArc = Math.sin(progress * Math.PI);

  return {
    phase,
    activeUnlockIndex,
    unlockAlphas,
    pageAlpha: rangeProgress(progress, 0, 0.08),
    inkAlpha: rangeProgress(progress, 0.04, 0.18),
    silhouetteAlpha: rangeProgress(progress, 0.08, 0.28),
    thirdMarkAlpha: rangeProgress(progress, 0.28, 0.45),
    habitAlpha: rangeProgress(progress, 0.45, 0.66),
    precedenceAlpha: rangeProgress(progress, 0.66, 0.84),
    finalAlpha: rangeProgress(progress, 0.84, 0.96),
    cameraScale: 1 + cameraArc * 0.025,
    cameraOffsetX: 0,
    cameraOffsetY: -cameraArc * 1.5,
  };
}
