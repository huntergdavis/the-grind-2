import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalDungeonFieldMedicineFixture } from "./dungeon-field-medicine-fixtures";

export { dungeonFieldMedicineCampaignId as dungeonSecretPassageCampaignId } from "./dungeon-field-medicine-fixtures";

let earned: { beforeClue: WorldState; ready: WorldState } | undefined;

/** The same uninterrupted earned dungeon journey. The unchanged-runtime
 * observation first found useful visited-room wall geometry at T121; that is
 * baseline evidence, not a retrospective secret-passage receipt. This helper
 * requires the new actual cue and command. No geometry, HP, visit, gate, item
 * or outcome is staged, and the original T320 ceiling is unchanged.
 */
function dungeonSecretPassageJourney(): { beforeClue: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  let world = naturalDungeonFieldMedicineFixture(), previous: WorldState | undefined;
  while (world.tick <= 320) {
    if (campaignDirector(world).candidates[0]?.command.type === "open-dungeon-passage") {
      if (previous === undefined || previous.tick + 1 !== world.tick) {
        throw new Error("The passage cue needs its actual preceding gameplay command");
      }
      earned = { beforeClue: previous, ready: world };
      return earned;
    }
    if (world.tick === 320) break;
    previous = world;
    world = advanceWorld(world);
  }
  throw new Error("Known earned dungeon journey did not offer an actual passage cue by T320");
}

export function naturalDungeonSecretPassageFixture(): WorldState { return dungeonSecretPassageJourney().ready; }
export function naturalDungeonSecretPassageBeforeClueFixture(): WorldState { return dungeonSecretPassageJourney().beforeClue; }
