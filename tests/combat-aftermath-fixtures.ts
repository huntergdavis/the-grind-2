import checkpoint from "./fixtures/combat-aftermath-v176-before-ending.json" with { type: "json" };
import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

export const aftermathCampaignId = "campaign:browser-repartee-memory";
export interface ReleasedCombatAftermathJourney {
  before: WorldState;
  resolved: WorldState;
  next: WorldState;
}
let retained: ReleasedCombatAftermathJourney | undefined;

/** Exact released v176 T64 save, not current fresh-campaign reachability.
 * The original uninterrupted campaign supplied both enemies, hero strike and
 * fatal next action. Current code imports it unchanged and executes only the
 * real T65 closing action and T66 recovery; no choices or fields are staged.
 */
export function releasedCombatAftermathFixture(): ReleasedCombatAftermathJourney {
  if (retained !== undefined) return retained;
  const { provenance } = checkpoint;
  if (provenance.releaseCommit !== "703d5ebf3c639e3b61c9d7ad56da26253305310a"
      || provenance.version !== "0.5.176" || provenance.tick !== 64
      || provenance.canonicalHash !== "9f89badf9f82a532") throw new Error("Unrecognized released aftermath provenance");
  const raw = JSON.parse(JSON.stringify(checkpoint.world)) as WorldState;
  if (canonicalHash(raw) !== provenance.canonicalHash || raw.tick !== provenance.tick
      || raw.campaignId !== aftermathCampaignId || raw.seed !== provenance.seed
      || raw.chronicle.at(-1)?.commandId !== provenance.sourceCommandId) throw new Error("Released aftermath checkpoint changed");
  const before = upgradeWorldState(raw);
  if (before === null || canonicalStringify(before) !== canonicalStringify(raw)) throw new Error("Released aftermath save no longer loads exactly");
  const resolved = advanceWorld(before), next = advanceWorld(resolved);
  if (canonicalHash(resolved) !== provenance.expectedTerminal.canonicalHash || resolved.tick !== 65
      || resolved.depth.roadSupper?.terminal?.combat.outcome !== "defeat"
      || resolved.depth.hero.resources.health !== 0 || resolved.chronicle.at(-1)?.commandType !== "combat-action") {
    throw new Error("Released actual closing action no longer preserves its exact defeat");
  }
  if (canonicalHash(next) !== provenance.expectedRecovery.canonicalHash || next.tick !== 66
      || next.chronicle.at(-1)?.commandType !== "wait") throw new Error("Released actual recovery changed");
  retained = { before, resolved, next };
  return retained;
}
