import { advanceWorld, createWorld } from "../src/core/simulation";
import type { WorldState } from "../src/core/types";
import { selectDungeonFieldMedicine } from "../src/depth/dungeon-field-medicine";

export const dungeonLairCampaignId = "campaign:browser-repartee-memory";
let earned: { before: WorldState; arrived: WorldState } | undefined;

/** Uninterrupted ordinary campaign, not a staged dungeon or battle. The
 * unchanged v173 source proof first entered Salt Labyrinth's lair (1,6) at
 * T105 from (2,6), with full HP/MP and no owned-tonic recovery owed. Its
 * original T320/20-second ceiling was not expanded; this pinned fixture stops
 * by T112. No health, room, enemy, inventory, companion or result is rewritten.
 */
function dungeonLairJourney(): { before: WorldState; arrived: WorldState } {
  if (earned !== undefined) return earned;
  let world = createWorld("shared-road-playful:7", dungeonLairCampaignId);
  while (world.tick < 112) {
    const before = world;
    world = advanceWorld(before);
    const dungeon = world.depth.dungeon, source = world.chronicle.at(-1);
    if (dungeon === null || before.depth.dungeon?.id !== dungeon.id || source?.commandType !== "move-dungeon") continue;
    const cell = dungeon.cells.find(entry => entry.id === dungeon.currentCellId);
    if (cell?.feature !== "lair" || before.depth.dungeon.visitedCellIds.includes(cell.id)) continue;
    if (world.depth.hero.resources.health <= 0 || world.depth.companions.active.length > 0 || dungeon.completed
      || world.depth.combat !== null || world.depth.counterDuel !== null || world.depth.atlas.route !== null
      || world.depth.quest.status !== "active" || world.depth.pendingQuestReward !== null
      || selectDungeonFieldMedicine(world.depth) !== null) continue;
    if (cell.id !== "dungeon:location:7:cell:1,6" || before.depth.dungeon.currentCellId !== "dungeon:location:7:cell:2,6"
      || source.commandId !== `${world.campaignId}:depth:${world.tick}:dungeon:${dungeon.id}:west`) {
      throw new Error("The pinned lair arrival no longer matches its actual source and geometry");
    }
    earned = { before, arrived: world }; return earned;
  }
  throw new Error("The pinned ordinary dungeon journey did not enter its eligible lair by T112");
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
