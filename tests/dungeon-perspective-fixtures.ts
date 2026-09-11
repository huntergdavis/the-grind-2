import { createForwardMotionState } from "../src/core/forward-motion";
import { createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { selectDungeonEntryPlan, stepDepth } from "../src/depth/state";

export const dungeonPerspectiveCampaignId = "campaign:browser-dungeon-search";

/** Reuses dungeon-search.spec.ts's generated one-exit dungeon. Starting atlas
 * location and HP are explicitly staged; rooms, traps, checks and later commands
 * are not manufactured. This is not an uninterrupted natural travel claim.
 */
export function dungeonPerspectiveFixture(): WorldState {
  const base = createWorld("browser-dungeon-search:8", dungeonPerspectiveCampaignId), locationId = "location:3";
  const located = { ...base.depth, atlas: { ...base.depth.atlas, currentLocationId: locationId,
    discoveredLocationIds: [...new Set([...base.depth.atlas.discoveredLocationIds, locationId])] } };
  const plan = selectDungeonEntryPlan(located);
  if (plan === null) throw new Error("The generated atlas dungeon must have its real entry plan");
  const entered = stepDepth(located, { type: "enter-dungeon", dungeonId: plan.dungeonId, width: plan.width, height: plan.height });
  const depth = { ...entered, hero: { ...entered.hero, resources: { ...entered.hero.resources,
    health: Math.floor(entered.hero.resources.maxHealth / 2) } } };
  return upgradeWorldState({ ...base, tick: depth.tick, depth,
    hero: { ...base.hero, health: depth.hero.resources.health, gold: depth.hero.gold, experience: depth.hero.experience },
    forwardMotion: createForwardMotionState(locationId, depth.tick),
    lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
    scene: { ...base.scene, mode: "dungeon", headline: "The cautious hero studies the passage." },
  });
}
