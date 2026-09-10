import type { WorldState } from "../core/types";
import { isValidDungeonSearchState, projectDungeonTraps } from "../depth/dungeon";
import type { DungeonSearchDiscoveryV1, DungeonSearchExitV1 } from "../depth/types";

export interface DungeonSearchView {
  readonly dungeonId: string;
  readonly cellId: string;
  readonly tick: number;
  readonly eventId: string;
  readonly commandId: string;
  readonly outcome: "marked" | "unrevealed";
  readonly exits: readonly DungeonSearchExitV1[];
  readonly discoveries: readonly DungeonSearchDiscoveryV1[];
  readonly headline: string;
  readonly detail: string;
  readonly consequence: string;
}

/** Present only this completed stationary search, never a historical receipt or a hidden failed check. */
export function projectDungeonSearchView(state: WorldState): DungeonSearchView | null {
  const dungeon = state.depth.dungeon;
  const source = state.chronicle.at(-1);
  if (dungeon === null || source === undefined || dungeon.completed
    || !isValidDungeonSearchState(dungeon.search, dungeon, state.depth.tick)) return null;
  const receipt = dungeon.search.latestReceipt;
  const commandId = `${state.campaignId}:depth:${state.depth.tick}:dungeon:${dungeon.id}:search:${dungeon.currentCellId}`;
  if (receipt === null || receipt.tick !== state.depth.tick || receipt.cellId !== dungeon.currentCellId
    || source.tick !== state.tick || source.commandId !== commandId || source.commandType !== "search-dungeon"
    || source.mode !== "dungeon" || state.scene.mode !== "dungeon"
    || source.location !== state.scene.location || source.headline !== state.scene.headline
    || source.action !== state.scene.action || source.goal !== state.scene.goal
    || source.consequence !== state.scene.consequence || source.sensoryIntensity !== state.scene.sensoryIntensity) return null;
  const publicTraps = projectDungeonTraps(dungeon);
  if (receipt.discoveries.some((found) => !publicTraps.some((trap) => trap.cellId === found.cellId && trap.status === "armed"))) return null;
  const count = receipt.discoveries.length;
  return Object.freeze({
    dungeonId: dungeon.id, cellId: receipt.cellId, tick: receipt.tick,
    eventId: source.id, commandId,
    outcome: count === 0 ? "unrevealed" : "marked",
    exits: receipt.exits, discoveries: receipt.discoveries,
    headline: count === 0 ? "SEARCH COMPLETE" : count === 1 ? "TRAP MARKED" : "TRAPS MARKED",
    detail: count === 0 ? "NOTHING REVEALED · PASSAGES UNVERIFIED"
      : `${count} ${count === 1 ? "TRAP" : "TRAPS"} MARKED · STILL ARMED`,
    consequence: source.consequence,
  });
}
