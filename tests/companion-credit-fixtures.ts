import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../src/core/simulation";
import { createForwardMotionState } from "../src/core/forward-motion";
import { canonicalHash } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";
import { generateTown, visitTown } from "../src/depth/towns";
import releasedCreditSave from "./fixtures/companion-credit-v170-pre-victory.json";

export const companionCreditCampaignId = "campaign:shared-road-world-arc";

/** Reuses eligibleWorld from companion-world.test.ts: ONLY a second visited
 * town and its matching presentation/forward-motion start are staged. Health,
 * inventory, recruitment, route, battle, enemies and contribution are earned
 * by ordinary autonomous commands. This is NOT uninterrupted natural play.
 */
export function companionCreditTownStartFixture(): WorldState {
  const seed = "shared-road-world-arc", base = createWorld(seed, companionCreditCampaignId);
  const originId = base.depth.atlas.currentLocationId;
  const current = base.depth.atlas.locations.find(location => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Existing shared-road fixture requires a second town");
  const town = visitTown(generateTown(seed, current.id));
  return upgradeWorldState(JSON.parse(JSON.stringify({ ...base,
    scene: { ...base.scene, mode: "town", location: town.name },
    forwardMotion: createForwardMotionState(current.id, base.tick),
    depth: { ...base.depth, atlas: { ...base.depth.atlas, currentLocationId: current.id,
      discoveredLocationIds: [originId, current.id], route: null }, towns: { ...base.depth.towns, [current.id]: town } },
  })));
}

let earned: { beforeVictory: WorldState; ready: WorldState } | undefined;

function companionCreditJourney(): { beforeVictory: WorldState; ready: WorldState } {
  if (earned !== undefined) return earned;
  // RELEASED-SAVE regression, not fresh autoplay: the v170 fixture actually
  // earned Dima's 13-damage hit at T93. T2 now changes the fresh journey's
  // later recruitment, so preserve that real save instead of forcing damage,
  // changing the live policy, or extending its former 96-command search.
  // All original runtime modules were loaded from the recorded release commit.
  if (canonicalHash(releasedCreditSave.world) !== "e80f3999c878f695"
    || releasedCreditSave.provenance.releaseCommit !== "44236a9b874fcb6e920ee5cc9b31755046bfa05b") {
    throw new Error("The released v170 companion-credit checkpoint lost its recorded provenance");
  }
  let world = upgradeWorldState(releasedCreditSave.world), previous: WorldState | undefined;
  if (canonicalHash(world) !== releasedCreditSave.provenance.canonicalHash) {
    throw new Error("Upgrading the released companion-credit save must preserve its actual history exactly");
  }
  for (let commands = 0; commands <= 4; commands++) {
    if (campaignDirector(world).candidates[0]?.command.type === "share-companion-credit") {
      if (previous?.depth.combat?.outcome !== "ongoing" || world.chronicle.at(-1)?.commandType !== "combat-action") {
        throw new Error("Credited-assist fixture must retain its actual immediately preceding victory command");
      }
      earned = { beforeVictory: previous, ready: world };
      return earned;
    }
    if (commands === 4) break;
    previous = world;
    world = advanceWorld(world);
  }
  throw new Error("The released pre-victory save did not offer earned companion credit within four actual commands");
}

export function companionCreditTownBoundaryFixture(): WorldState { return companionCreditJourney().ready; }
export function companionCreditBeforeVictoryFixture(): WorldState { return companionCreditJourney().beforeVictory; }

let farewell: WorldState | undefined;

/** A separate, approved 96-command continuation AFTER the actual exchange.
 * The oath's full road is travelled; destination, roster and callback are not
 * staged. Kept as an earned browser checkpoint rather than fast-forwarding
 * scores of background browser turns or claiming a normal-time soak.
 */
export function companionCreditFarewellFixture(): WorldState {
  if (farewell !== undefined) return farewell;
  const ready = companionCreditTownBoundaryFixture();
  const residentId = ready.depth.companions.active[0]?.identity.residentId;
  let world = advanceWorld(ready);
  for (let commands = 0; commands <= 96; commands++) {
    const command = campaignDirector(world).candidates[0]?.command;
    if (command?.type === "farewell-companion" && command.residentId === residentId) {
      farewell = world;
      return farewell;
    }
    if (commands === 96) break;
    world = advanceWorld(world);
  }
  throw new Error("The earned credited-assist oath did not reach farewell within 96 later commands");
}
