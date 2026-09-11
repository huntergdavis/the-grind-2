import { createForwardMotionState } from "../src/core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { applyHeroExperience, heroExperienceFloor } from "../src/depth/rpg";
import { generateTown, visitTown } from "../src/depth/towns";

/** Explicit earned-level and visited-town staging, not a claimed natural journey.
 * Every book, reply, recruitment and witness receipt after this point is emitted
 * by real autonomous campaign commands. No transcript or companion is invented.
 */
export function witnessedEncoreFixture(campaignId = "campaign:repartee-witness-acceptance", seed = "shared-road-lifecycle"): WorldState {
  const base = createWorld(seed, campaignId);
  const originId = base.depth.atlas.currentLocationId;
  const location = base.depth.atlas.locations.find((entry) => entry.kind === "town" && entry.id !== originId)!;
  const town = visitTown(generateTown(seed, location.id));
  const hero = applyHeroExperience(base.depth.hero, heroExperienceFloor(2)).hero;
  let world = upgradeWorldState({
    ...base,
    hero: { ...base.hero, level: hero.level, experience: hero.experience,
      health: hero.resources.health, maxHealth: hero.resources.maxHealth },
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(location.id, base.tick),
    depth: { ...base.depth, hero,
      atlas: { ...base.depth.atlas, currentLocationId: location.id,
        discoveredLocationIds: [originId, location.id], route: null },
      towns: { ...base.depth.towns, [location.id]: town } },
  });
  for (let turn = 0; turn < 16; turn++) {
    const next = campaignDirector(world).candidates[0]?.command;
    if (world.depth.repartee.completed !== null && world.depth.companions.active.length === 1
      && next?.type === "start-repartee") return world;
    world = advanceWorld(world);
  }
  throw new Error(`Earned scenario did not offer a witnessed encore in 16 actual turns (T${world.tick}, next ${campaignDirector(world).candidates[0]?.command.type})`);
}
