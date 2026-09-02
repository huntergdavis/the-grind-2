import type { MonsterSpeciesId } from "../depth/combat";
import type { CounterDuelState } from "../depth/types";

export const speciesPatternBreakSignatureVersion = "species-pattern-break-signatures-v1" as const;

export type PatternBreakSignatureMotif =
  | "broken-crescents"
  | "stepped-lattice"
  | "ripple-ribbons"
  | "shutter-frames"
  | "horn-chevrons";

export interface PatternBreakSignatureV1 {
  readonly presentationVersion: 1;
  readonly registryVersion: typeof speciesPatternBreakSignatureVersion;
  readonly speciesId: MonsterSpeciesId;
  readonly speciesName: string;
  readonly signatureId: string;
  readonly motif: PatternBreakSignatureMotif;
  readonly colors: Readonly<{
    primary: number;
    accent: number;
    highlight: number;
  }>;
  readonly opponentPose: Readonly<{
    recoilX: number;
    liftY: number;
    tilt: number;
  }>;
}

function signature(
  speciesId: MonsterSpeciesId,
  speciesName: string,
  signatureId: string,
  motif: PatternBreakSignatureMotif,
  colors: PatternBreakSignatureV1["colors"],
  opponentPose: PatternBreakSignatureV1["opponentPose"],
): PatternBreakSignatureV1 {
  return Object.freeze({
    presentationVersion: 1,
    registryVersion: speciesPatternBreakSignatureVersion,
    speciesId,
    speciesName,
    signatureId,
    motif,
    colors: Object.freeze({ ...colors }),
    opponentPose: Object.freeze({ ...opponentPose }),
  });
}

const patternBreakSignatures = Object.freeze({
  "lantern-wolf": signature(
    "lantern-wolf",
    "Lantern Wolf",
    "pattern-break:lantern-wolf:broken-crescents:v1",
    "broken-crescents",
    { primary: 0x63865d, accent: 0xf1c86b, highlight: 0xffedbb },
    { recoilX: -2, liftY: 1, tilt: -0.05 },
  ),
  "mossback-brute": signature(
    "mossback-brute",
    "Mossback Brute",
    "pattern-break:mossback-brute:stepped-lattice:v1",
    "stepped-lattice",
    { primary: 0x4f7350, accent: 0x91ad69, highlight: 0xd6d59b },
    { recoilX: 0, liftY: 2, tilt: 0.02 },
  ),
  "river-wyrmling": signature(
    "river-wyrmling",
    "River Wyrmling",
    "pattern-break:river-wyrmling:ripple-ribbons:v1",
    "ripple-ribbons",
    { primary: 0x477b84, accent: 0x72cbd2, highlight: 0xd1fff4 },
    { recoilX: -1, liftY: -2, tilt: 0.06 },
  ),
  "inkcap-mimic": signature(
    "inkcap-mimic",
    "Inkcap Mimic",
    "pattern-break:inkcap-mimic:shutter-frames:v1",
    "shutter-frames",
    { primary: 0x6e5579, accent: 0xc381b7, highlight: 0xffd1bd },
    { recoilX: 1, liftY: 2, tilt: -0.07 },
  ),
  copperhorn: signature(
    "copperhorn",
    "Copperhorn",
    "pattern-break:copperhorn:horn-chevrons:v1",
    "horn-chevrons",
    { primary: 0x8b6848, accent: 0xd89a50, highlight: 0xffdfa0 },
    { recoilX: -3, liftY: 0, tilt: 0.04 },
  ),
} satisfies Readonly<Record<MonsterSpeciesId, PatternBreakSignatureV1>>);

export function projectPatternBreakSignature(speciesId: string): PatternBreakSignatureV1 | null {
  return Object.prototype.hasOwnProperty.call(patternBreakSignatures, speciesId)
    ? patternBreakSignatures[speciesId as MonsterSpeciesId]
    : null;
}

export function projectCounterDuelPatternBreakSignature(duel: CounterDuelState): PatternBreakSignatureV1 | null {
  if (duel.history.at(-1)?.patternBreak?.triggered !== true) return null;
  const projected = projectPatternBreakSignature(duel.opponentSpeciesId);
  if (projected === null) throw new TypeError("Pattern Break species signature is unavailable");
  return projected;
}
