import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import releasedSave from "./fixtures/dungeon-secret-passage-v171-before-clue.json";

export const dungeonSecretPassageCampaignId = releasedSave.provenance.campaignId;
const releaseCommit = "de54654df13706c30abbaac4cb6408b2e26ebc1d";
const releasedHash = "8a9ea71e5cfcbbe3";
let earned: { beforeClue: WorldState; ready: WorldState } | undefined;

/** Released-save regression, NOT a fresh-current journey claim. The original
 * v171 uninterrupted campaign produced this exact pre-clue T120 checkpoint.
 * It was recovered with all 50 project modules pinned to that release and
 * the original T320 ceiling; W1's current fresh path did not qualify by T320.
 * No maze, HP, inventory, visits, gate or outcome is patched. Current code
 * must upgrade without changing canonical bytes, then earn its cue through
 * one real command. Consumers perform the existing real opening/crossing.
 */
function releasedDungeonSecretPassageJourney(): { beforeClue: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  if (releasedSave.provenance.releaseCommit !== releaseCommit || releasedSave.provenance.tick !== 120
    || releasedSave.provenance.canonicalHash !== releasedHash || canonicalHash(releasedSave.world) !== releasedHash) {
    throw new Error("Released v171 pre-clue checkpoint provenance or canonical hash changed");
  }
  const beforeClue = upgradeWorldState(structuredClone(releasedSave.world));
  if (canonicalHash(beforeClue) !== releasedHash || canonicalStringify(beforeClue) !== canonicalStringify(releasedSave.world)) {
    throw new Error("Current upgrade changed the exact released pre-clue save");
  }
  const ready = advanceWorld(beforeClue);
  if (ready.tick !== beforeClue.tick + 1 || campaignDirector(ready).candidates[0]?.command.type !== "open-dungeon-passage") {
    throw new Error("Released pre-clue save did not earn its actual cue on the next command");
  }
  earned = { beforeClue, ready }; return earned;
}

export function releasedDungeonSecretPassageFixture(): WorldState { return releasedDungeonSecretPassageJourney().ready; }
export function releasedDungeonSecretPassageBeforeClueFixture(): WorldState { return releasedDungeonSecretPassageJourney().beforeClue; }
