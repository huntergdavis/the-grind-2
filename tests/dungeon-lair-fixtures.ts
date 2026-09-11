import { advanceWorld, upgradeWorldState } from "../src/core/simulation";
import { canonicalHash, canonicalStringify } from "../src/core/canonical";
import type { WorldState } from "../src/core/types";
import { selectDungeonFieldMedicine } from "../src/depth/dungeon-field-medicine";
import releasedSave from "./fixtures/dungeon-lair-v174-before-arrival.json";

export const dungeonLairCampaignId = "campaign:browser-repartee-memory";
const releasedCommit = "0c1cbb381dddd0f993edf85ebecd411c55c5fb81";
const releasedHash = "5f1e665f4245c183";
let earned: { before: WorldState; arrived: WorldState } | undefined;

/** Released-save regression, NOT fresh-current campaign reachability.
 * v174's uninterrupted campaign earned this exact T104 checkpoint before
 * the real T105 westward lair entry. Road Supper changes the later fresh
 * campaign route; the original T112 fixture ceiling is not expanded.
 * Current code must upgrade the released save without changing its canonical
 * bytes, then execute the real entry. No lair capability, health, room,
 * enemy, inventory, companion or outcome is rewritten. Historical exported
 * function names remain stable for the unchanged source/renderer assertions.
 */
function dungeonLairJourney(): { before: WorldState; arrived: WorldState } {
  if (earned !== undefined) return earned;
  if (releasedSave.provenance.releaseCommit !== releasedCommit || releasedSave.provenance.version !== "0.5.174"
    || releasedSave.provenance.tick !== 104 || releasedSave.provenance.campaignId !== dungeonLairCampaignId
    || releasedSave.provenance.seed !== "shared-road-playful:7" || releasedSave.provenance.canonicalHash !== releasedHash
    || canonicalHash(releasedSave.world) !== releasedHash) {
    throw new Error("Released v174 pre-lair checkpoint provenance or canonical hash changed");
  }
  const before = upgradeWorldState(structuredClone(releasedSave.world));
  if (canonicalHash(before) !== releasedHash || canonicalStringify(before) !== canonicalStringify(releasedSave.world)) {
    throw new Error("Current upgrade changed the exact released pre-lair save");
  }
  const world = advanceWorld(before), dungeon = world.depth.dungeon, source = world.chronicle.at(-1);
  const cell = dungeon?.cells.find(entry => entry.id === dungeon.currentCellId);
  if (dungeon === null || before.depth.dungeon?.id !== dungeon.id || source?.commandType !== "move-dungeon"
    || world.tick !== 105 || cell?.feature !== "lair" || before.depth.dungeon.visitedCellIds.includes(cell.id)
    || world.depth.hero.resources.health <= 0 || world.depth.companions.active.length > 0 || dungeon.completed
    || world.depth.combat !== null || world.depth.counterDuel !== null || world.depth.atlas.route !== null
    || world.depth.quest.status !== "active" || world.depth.pendingQuestReward !== null
    || selectDungeonFieldMedicine(world.depth) !== null) {
    throw new Error("Released pre-lair save did not earn its eligible lair on the next actual command");
  }
  if (cell.id !== "dungeon:location:7:cell:1,6" || before.depth.dungeon.currentCellId !== "dungeon:location:7:cell:2,6"
    || source.commandId !== `${world.campaignId}:depth:${world.tick}:dungeon:${dungeon.id}:west`) {
    throw new Error("The pinned lair arrival no longer matches its actual source and geometry");
  }
  earned = { before, arrived: world }; return earned;
}

export function naturalDungeonLairBeforeArrivalFixture(): WorldState { return dungeonLairJourney().before; }
export function naturalDungeonLairFixture(): WorldState { return dungeonLairJourney().arrived; }

export interface NaturalDungeonGuardianJourney {
  before: WorldState;
  arrived: WorldState;
  started: WorldState;
  turns: readonly WorldState[];
  resolved: WorldState;
  next: WorldState;
}
let fought: NaturalDungeonGuardianJourney | undefined;

/** The actual autonomous fight, whatever its outcome. Never replace a loss
 * with a win or adjust the guardian, rolls, equipment, supplies or personality.
 * At most 64 real combat commands may follow the one guardian admission.
 */
export function naturalDungeonGuardianJourneyFixture(): NaturalDungeonGuardianJourney {
  if (fought !== undefined) return fought;
  const { before, arrived } = dungeonLairJourney(), started = advanceWorld(arrived);
  if (started.chronicle.at(-1)?.commandType !== "start-dungeon-guardian" || started.depth.combat === null) {
    throw new Error("The actual lair arrival did not admit its guardian");
  }
  let world = started;
  const turns: WorldState[] = [];
  while (world.depth.combat !== null && turns.length < 64) {
    world = advanceWorld(world);
    if (world.chronicle.at(-1)?.commandType !== "combat-action") throw new Error("Guardian progression invented a non-combat command");
    turns.push(world);
  }
  if (world.depth.combat !== null || turns.length === 0) throw new Error("The actual guardian battle did not resolve within 64 combat commands");
  fought = { before, arrived, started, turns, resolved: world, next: advanceWorld(world) };
  return fought;
}
