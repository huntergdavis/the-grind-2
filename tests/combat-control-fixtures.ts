import { canonicalHash } from "../src/core/canonical";
import { advanceWorld } from "../src/core/simulation";
import { naturalWeaponTechniquePayoffFixture, weaponTechniqueCampaignId } from "./weapon-technique-fixtures";

export const combatControlCampaignId = weaponTechniqueCampaignId;
let cached: ReturnType<typeof buildFixture> | undefined;

function buildFixture() {
  const payoff = naturalWeaponTechniquePayoffFixture();
  const applied = payoff.applied, retaliated = payoff.retaliated;
  const terminal = advanceWorld(retaliated), next = advanceWorld(terminal);
  const expected = ["7fe4f5c115034882", "441525bf4fa856ad", "1368a2efa16e279c", "5f9f91bfa93e73a2"];
  if ([applied, retaliated, terminal, next].some((world, index) => world.tick !== 276 + index || canonicalHash(world) !== expected[index]))
    throw new Error("The actual control moment's unchanged T276–279 source checkpoints drifted");
  if (terminal.depth.completedCombats.at(-1)?.outcome !== "defeat" || next.chronicle.at(-1)?.commandType !== "wait")
    throw new Error("The actual defeat and ordinary recovery did not occur");
  return { applied, retaliated, terminal, next, applicationEvent: payoff.applicationEvent,
    statusTickEvent: payoff.statusTickEvent, retaliationEvent: payoff.retaliationEvent };
}

/** The same uninterrupted v181 journey, not a staged control effect or victory.
 * Existing cached source reaches the real surviving target at T276 and its
 * retaliation at T277. Two ordinary commands produce defeat and recovery.
 * No additional seed, field edits, force-casting, or fabricated archive.
 */
export function naturalCombatControlFixture(): ReturnType<typeof buildFixture> {
  return cached ??= buildFixture();
}
