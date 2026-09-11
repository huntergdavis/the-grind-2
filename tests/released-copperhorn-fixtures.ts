import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import released from "./fixtures/copperhorn-v171-witness.json" with { type: "json" };

type CopperhornChain = { before: WorldState; applied: WorldState; first: WorldState; guarded: WorldState; finished: WorldState };
let chain: CopperhornChain | undefined, retainedWitness: WorldState | undefined;

function restoreExact(value: unknown, hash: string): WorldState {
  if (released.provenance.releaseCommit !== "de54654df13706c30abbaac4cb6408b2e26ebc1d" || canonicalHash(value) !== hash) {
    throw new Error("Released Copperhorn checkpoint provenance or canonical hash changed");
  }
  const world = upgradeWorldState(structuredClone(value));
  if (canonicalHash(world) !== hash || canonicalStringify(world) !== canonicalStringify(value)) {
    throw new Error("Current upgrade changed the exact released Copperhorn save");
  }
  return world;
}

/** Released-save regression, not fresh-current reachability. One original
 * v171 Golden27 replay through its existing T89 cap supplied T4 and T89.
 * Every original module came from that release. Current code performs four
 * real combat commands from the untouched T4 save; no generated field changes.
 */
export function releasedCopperhornChain(): CopperhornChain {
  if (chain !== undefined) return chain;
  const before = restoreExact(released.beforeApplication, "853b63872e22566d");
  const applied = advanceWorld(before), first = advanceWorld(applied), guarded = advanceWorld(first), finished = advanceWorld(guarded);
  if (before.tick !== 4 || finished.tick !== 8 || finished.depth.fieldResearch.copperhorn.application?.sourceTick !== 5
    || finished.depth.fieldResearch.copperhorn.aftereffect?.sourceTick !== 8) {
    throw new Error("Released pre-application save did not earn its exact Copperhorn observations in four current commands");
  }
  chain = { before, applied, first, guarded, finished }; return chain;
}

/** Preserve the original after-history migration boundary without replaying
 * a fresh campaign or silently substituting a shorter migration checkpoint.
 */
export function releasedCopperhornWorld(tick: number): WorldState {
  if (tick === 89) {
    retainedWitness ??= restoreExact(released.afterWitness, "a1a114f1387e61ca");
    return retainedWitness;
  }
  const world = Object.values(releasedCopperhornChain()).find(entry => entry.tick === tick);
  if (world === undefined) throw new Error("Only the released T4–T8 witness and exact T89 history are supplied");
  return world;
}
