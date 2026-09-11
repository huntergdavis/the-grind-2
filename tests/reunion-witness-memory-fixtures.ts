import checkpoint from "./fixtures/companion-reunion-v177-completed.json" with { type: "json" };
import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalCompanionReunionFixture } from "./companion-reunion-fixtures";

export const reunionWitnessMemoryCampaignId = "campaign:browser-repartee-memory";
export interface ReunionWitnessMemoryJourney { before: WorldState; completed: WorldState; next: WorldState }
let journey: ReunionWitnessMemoryJourney | undefined;

/** Same uninterrupted known campaign and existing T320 bound. The actual
 * T85 arrival, Ada's T32 reaction and T44 callback are not staged. Only one
 * existing reunion command adds the new quotation, then ordinary play resumes.
 */
export function naturalReunionWitnessMemoryFixture(): ReunionWitnessMemoryJourney {
  if (journey !== undefined) return journey;
  const before = naturalCompanionReunionFixture();
  if (before.tick !== 85 || canonicalHash(before) !== "b9f956d8d29d2d94") throw new Error("Witness memory changed the unchanged reunion-ready baseline");
  const completed = advanceWorld(before), next = advanceWorld(completed);
  if (completed.tick !== 86 || completed.chronicle.at(-1)?.commandType !== "reunite-companion"
      || !Object.hasOwn(completed.depth.companionReunion!.completed!, "memory")) throw new Error("Actual reunion did not retain its matching witnessed memory");
  if (next.tick !== 87 || next.chronicle.at(-1)?.commandType === "reunite-companion") throw new Error("Completed quotation did not return to ordinary play");
  journey = { before, completed, next }; return journey;
}

/** Exact v177 completed save. Never retrofit the new optional memory or words
 * into a previously delivered greeting; current upgrade must preserve bytes.
 */
export function releasedCompanionReunionFixture(): WorldState {
  const { provenance } = checkpoint;
  if (provenance.releaseCommit !== "2cd22da6966fb80cb810c3e65466468e7a73e42d"
      || provenance.version !== "0.5.177" || provenance.tick !== 86
      || provenance.canonicalHash !== "d9cce50f7bc14aa8") throw new Error("Unrecognized old reunion provenance");
  const raw = JSON.parse(JSON.stringify(checkpoint.world)) as WorldState;
  if (canonicalHash(raw) !== provenance.canonicalHash || raw.tick !== provenance.tick
      || raw.campaignId !== reunionWitnessMemoryCampaignId || raw.seed !== provenance.seed
      || raw.chronicle.at(-1)?.commandId !== provenance.sourceCommandId
      || Object.hasOwn(raw.depth.companionReunion!.completed!, "memory")) throw new Error("Old completed reunion checkpoint changed");
  const restored = upgradeWorldState(raw);
  if (restored === null || canonicalStringify(restored) !== canonicalStringify(raw)) throw new Error("Old completed greeting no longer loads exactly");
  return restored;
}
