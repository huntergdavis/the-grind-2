import type { WorldState } from "../core/types";
import {
  dungeonEffectiveExits, isDungeonPassageOpen, isValidDungeonSecretPassage, projectDungeonKeyGate, projectDungeonLandmark, projectDungeonMoveKnowledge, projectDungeonTraps,
} from "../depth/dungeon";
import type { DungeonTrapKind, MazeDirection } from "../depth/types";
import { projectDungeonSearchView } from "./dungeon-search-view";
import { projectCurrentDungeonSecretPassage, type DungeonSecretPassageView } from "./dungeon-secret-passage-view";

const directions: readonly MazeDirection[] = ["north", "east", "south", "west"];
const relativeDirections = ["front", "right", "back", "left"] as const;
const delta: Record<MazeDirection, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};

export interface DungeonPerspectiveTrap {
  readonly kind: DungeonTrapKind;
  readonly status: "armed" | "disarmed" | "triggered";
}

export interface DungeonPerspectiveExit {
  readonly direction: MazeDirection;
  readonly relative: "front" | "right" | "back" | "left";
  readonly destinationCellId: string | null;
  readonly visited: boolean;
  /** Whether the existing autonomous rules currently permit taking this visible doorway. */
  readonly available: boolean;
  readonly gate: "none" | "locked" | "open";
  readonly trap: DungeonPerspectiveTrap | null;
  readonly sightedKey: boolean;
}

/** The optional drawing module receives this packet, never WorldState or MazeCell. */
export interface DungeonPerspectiveView {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly dungeonId: string;
  readonly tick: number;
  readonly sourceCommandId: string | null;
  readonly currentCellId: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly facing: MazeDirection;
  readonly completed: boolean;
  readonly exits: readonly DungeonPerspectiveExit[];
  readonly currentTrap: DungeonPerspectiveTrap | null;
  readonly keyStatus: "unknown" | "sighted" | "carried" | "used";
  readonly landmark: { readonly kind: "far-stair-shrine"; readonly status: "promised" | "mapped" | "awakened"; readonly here: boolean } | null;
  readonly search: { readonly outcome: "marked" | "unrevealed"; readonly headline: string; readonly detail: string } | null;
  readonly secretPassage: (DungeonSecretPassageView & { readonly relative: DungeonPerspectiveExit["relative"] }) | null;
}

function validFacing(value: unknown): value is MazeDirection {
  return directions.includes(value as MazeDirection);
}

function relative(direction: MazeDirection, facing: MazeDirection): DungeonPerspectiveExit["relative"] {
  return relativeDirections[(directions.indexOf(direction) - directions.indexOf(facing) + 4) % 4]!;
}

/** A renderer-only heading: neither a planned route nor a prose log can turn the camera. */
export function dungeonPerspectiveFacing(
  previous: WorldState | null,
  current: WorldState,
  previousFacing: MazeDirection = "north",
): MazeDirection {
  try {
    const before = previous?.depth.dungeon, after = current.depth.dungeon;
    if (previous === null || before == null || after === null || previous.campaignId !== current.campaignId
      || before.id !== after.id || previous.hero.id !== current.hero.id
      || current.tick < previous.tick || current.tick > previous.tick + 1) return "north";
    const held = validFacing(previousFacing) ? previousFacing : "north";
    if (before.currentCellId === after.currentCellId) return held;
    if (current.tick !== previous.tick + 1 || current.depth.tick !== current.tick || previous.depth.tick !== previous.tick
      || current.scene.mode !== "dungeon" || after.turns !== before.turns + 1) return "north";
    const origin = before.cells.find((cell) => cell.id === before.currentCellId);
    const destination = after.cells.find((cell) => cell.id === after.currentCellId);
    if (origin === undefined || destination === undefined || !before.visitedCellIds.includes(origin.id)
      || !after.visitedCellIds.includes(destination.id) || !after.discoveredCellIds.includes(destination.id)) return "north";
    const direction = directions.find((candidate) => destination.x - origin.x === delta[candidate][0]
      && destination.y - origin.y === delta[candidate][1]);
    if (direction === undefined || !projectDungeonMoveKnowledge(before).some((move) =>
      move.direction === direction && move.destinationCellId === destination.id)) return "north";
    const source = current.chronicle.at(-1);
    return source?.tick === current.tick && source.mode === "dungeon" && source.commandType === "move-dungeon"
      && source.commandId === `${current.campaignId}:depth:${current.tick}:dungeon:${after.id}:${direction}`
      ? direction : "north";
  } catch { return "north"; }
}

/** One current room and its public doorways. No neighboring onward exits, hidden features,
 * maze dimensions, coordinates, RNG inputs or undiscovered landmark locations leave this boundary.
 */
export function projectDungeonPerspectiveView(state: WorldState, facing: MazeDirection = "north"): DungeonPerspectiveView | null {
  try {
    const dungeon = state.depth.dungeon;
    if (dungeon === null || state.scene.mode !== "dungeon" || state.tick !== state.depth.tick
      || !Number.isSafeInteger(state.tick) || state.tick < 0 || state.hero.id !== state.depth.hero.id
      || !isValidDungeonSecretPassage(dungeon, state.tick)
      || !dungeon.visitedCellIds.includes(dungeon.currentCellId) || !dungeon.discoveredCellIds.includes(dungeon.currentCellId)
      || !dungeon.cells.some((cell) => cell.id === dungeon.currentCellId)) return null;
    const heading = validFacing(facing) ? facing : "north";
    const discovered = new Set(dungeon.discoveredCellIds), visited = new Set(dungeon.visitedCellIds);
    const traps = projectDungeonTraps(dungeon);
    const trapAt = (cellId: string): DungeonPerspectiveTrap | null => {
      const trap = traps.find((candidate) => candidate.cellId === cellId);
      return trap === undefined ? null : Object.freeze({ kind: trap.kind, status: trap.status });
    };
    const keyGate = projectDungeonKeyGate(dungeon), gate = keyGate?.gate;
    const current = dungeon.cells.find((cell) => cell.id === dungeon.currentCellId)!;
    const available = projectDungeonMoveKnowledge(dungeon);
    const exits: DungeonPerspectiveExit[] = directions.flatMap((direction) => {
      if (!dungeonEffectiveExits(dungeon, current.id).includes(direction)) return [];
      const neighbor = dungeon.cells.find((cell) => cell.x === current.x + delta[direction][0]
        && cell.y === current.y + delta[direction][1]);
      if (neighbor === undefined || !discovered.has(neighbor.id) || !isDungeonPassageOpen(dungeon, current.id, neighbor.id)) return [];
      return [Object.freeze({ direction, relative: relative(direction, heading),
        destinationCellId: neighbor.id, visited: visited.has(neighbor.id),
        available: available.some((move) => move.direction === direction && move.destinationCellId === neighbor.id),
        gate: gate?.status === "open" && (
          gate.unlockCellId === dungeon.currentCellId && gate.shortcutCellId === neighbor.id
          || gate.shortcutCellId === dungeon.currentCellId && gate.unlockCellId === neighbor.id
        ) ? "open" as const : "none" as const,
        trap: trapAt(neighbor.id), sightedKey: keyGate?.key?.status === "sighted" && keyGate.key.cellId === neighbor.id })];
    });
    if (gate?.status === "locked" && gate.unlockCellId === dungeon.currentCellId) {
      exits.push(Object.freeze({ direction: gate.direction, relative: relative(gate.direction, heading),
        destinationCellId: null, visited: false, available: false, gate: "locked", trap: null, sightedKey: false }));
    }
    exits.sort((left, right) => directions.indexOf(left.direction) - directions.indexOf(right.direction));
    if (exits.length > 4 || new Set(exits.map((exit) => exit.direction)).size !== exits.length) return null;
    const landmark = projectDungeonLandmark(dungeon), search = projectDungeonSearchView(state);
    const secretPassage = projectCurrentDungeonSecretPassage(dungeon);
    const source = state.chronicle.at(-1);
    return Object.freeze({ schemaVersion: 1, campaignId: state.campaignId, dungeonId: dungeon.id, tick: state.tick,
      sourceCommandId: source?.tick === state.tick && source.mode === "dungeon" ? source.commandId ?? null : null,
      currentCellId: dungeon.currentCellId, heroId: state.depth.hero.id, heroName: state.depth.hero.name,
      facing: heading, completed: dungeon.completed, exits: Object.freeze(exits), currentTrap: trapAt(dungeon.currentCellId),
      keyStatus: keyGate?.key?.status ?? "unknown",
      landmark: landmark === null ? null : Object.freeze({ kind: landmark.kind, status: landmark.status,
        here: landmark.cellId !== null && landmark.cellId === dungeon.currentCellId }),
      search: search === null ? null : Object.freeze({ outcome: search.outcome, headline: search.headline, detail: search.detail }),
      secretPassage: secretPassage === null ? null : Object.freeze({ ...secretPassage, relative: relative(secretPassage.direction, heading) }),
    });
  } catch { return null; }
}
