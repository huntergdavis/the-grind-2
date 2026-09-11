import { advanceWorld, campaignDirector, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";

export const reparteeMemoryCampaignId = "campaign:browser-repartee-memory";

/** One bounded natural journey, not a staged level, roster, injury or memory.
 * The book, both contests, recruitment, shared battle and arrival are all actual
 * autonomous commands. The small ceiling detects drift without seed searches.
 */
export function naturalReparteeMemoryFixture(): WorldState {
  let world = createWorld("shared-road-playful:7", reparteeMemoryCampaignId);
  for (let turn = 0; turn < 64; turn++) {
    if (campaignDirector(world).candidates[0]?.command.type === "recall-repartee") return world;
    world = advanceWorld(world);
  }
  throw new Error("Known natural Fara Ash journey did not offer its arrival memory within 64 turns");
}
