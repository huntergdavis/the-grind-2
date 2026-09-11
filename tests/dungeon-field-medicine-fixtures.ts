import { advanceWorld, campaignDirector } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { naturalReparteeMemoryFixture } from "./repartee-memory-fixtures";

export { reparteeMemoryCampaignId as dungeonFieldMedicineCampaignId } from "./repartee-memory-fixtures";

let ready: WorldState | undefined;

/** One earned journey, no staged health, supplies, dungeon or injury. The
 * unchanged v167 baseline first entered Hollowwatch's dungeon at T71 with
 * 11/42 HP and three owned tonics, after real combat/defeat recovery. Medicine
 * treats that already-living hero; it does not revive them or invent supplies.
 */
export function naturalDungeonFieldMedicineFixture(): WorldState {
  if (ready !== undefined) return ready;
  let world = naturalReparteeMemoryFixture();
  while (world.tick <= 320) {
    if (campaignDirector(world).candidates[0]?.command.type === "use-dungeon-tonic") {
      ready = world;
      return ready;
    }
    if (world.tick === 320) break;
    world = advanceWorld(world);
  }
  throw new Error("The known earned dungeon journey did not offer its owned tonic by T320");
}
