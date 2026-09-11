import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalReunionWitnessMemoryFixture } from "./reunion-witness-memory-fixtures";

export const ovenReportCampaignId = "campaign:browser-repartee-memory";
export interface OvenReportJourney { before: WorldState; completed: WorldState; next: WorldState }
let journey: OvenReportJourney | undefined;

/** Same uninterrupted known campaign and original T320 ceiling. The actual
 * completed bake, living former baker and return are never supplied or staged.
 * One existing reunion action reports the bake; no new hero action is added.
 */
export function naturalOvenReportFixture(): OvenReportJourney {
  if (journey !== undefined) return journey;
  const actual = naturalReunionWitnessMemoryFixture();
  const reunion = actual.completed.depth.companionReunion!, report = reunion.completed?.ovenReport;
  if (actual.before.tick !== 85 || canonicalHash(actual.before) !== "f5b9799468cf117e"
      || actual.completed.tick !== 86 || actual.next.tick !== 87 || report === undefined
      || report.sourceCompletionTick !== 74 || report.outcome !== "plain-loaf"
      || actual.completed.chronicle.at(-1)?.commandType !== "reunite-companion"
      || actual.next.chronicle.at(-1)?.commandType !== "plan-route") {
    throw new Error("The known actual reunion did not report its earlier matching bake");
  }
  journey = actual; return journey;
}

const oldAction = "Aster Rook: “I brought an old line back with me: “I will accept being called cautious.”” Ada Fen: “It is exactly as I remember. I am still not sure what to make of it.”";
const oldLogMessage = "Aster Rook: “I brought an old line back with me: “I will accept being called cautious.”” Ada Fen: “It is exactly as I remember. I am still not sure what to make of it.” The old oath remains fulfilled; this hello earns no reward.";

/** Explicit compact reconstruction, not a new source journey or another JSON
 * archive. Only the additive report and its two spoken/log renderings are
 * removed/restored using literal strings from the independently captured
 * unchanged fdfc539/v179 T86 save. The ENTIRE old world must match that proof's
 * hash before upgrade; otherwise this helper rejects the reconstruction.
 * Local acceptance also compares canonical bytes with the ignored actual save.
 */
export function releasedOvenReportBaselineFixture(): WorldState {
  const raw = JSON.parse(canonicalStringify(naturalOvenReportFixture().completed)) as WorldState;
  const reunion = raw.depth.companionReunion!, { ovenReport: _report, ...oldCompleted } = reunion.completed!;
  raw.depth.companionReunion = { ...reunion, completed: oldCompleted };
  raw.scene = { ...raw.scene, action: oldAction };
  raw.chronicle = raw.chronicle.map(entry => entry.tick === 86 ? { ...entry, action: oldAction } : entry);
  raw.depth.log = raw.depth.log.map(entry => entry.tick === 86 ? { ...entry, message: oldLogMessage } : entry);
  if (raw.tick !== 86 || canonicalHash(raw) !== "195410d557c0b9dc") throw new Error("Reconstructed old greeting differs from the independently captured whole-world hash");
  const restored = upgradeWorldState(raw);
  if (restored === null || canonicalStringify(restored) !== canonicalStringify(raw)) throw new Error("The exact old greeting did not upgrade unchanged");
  return restored;
}

export function releasedOvenReportNextFixture(): WorldState {
  const next = advanceWorld(releasedOvenReportBaselineFixture());
  if (next.tick !== 87 || canonicalHash(next) !== "281ce30ff33f2647") throw new Error("The old greeting's ordinary continuation changed");
  return next;
}
