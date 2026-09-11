import type { WorldState } from "../core/types";
import { isValidDungeonSecretPassage, projectDungeonSecretPassageCue } from "../depth/dungeon";
import type { DungeonState, MazeDirection } from "../depth/types";

const opposite: Record<MazeDirection, MazeDirection> = { north: "south", east: "west", south: "north", west: "east" };

/** Before opening, a draught identifies a wall, never the room behind it. */
export type DungeonSecretPassageView =
  | Readonly<{ phase: "draught"; direction: MazeDirection }>
  | Readonly<{ phase: "open"; direction: MazeDirection; destinationCellId: string }>;

export function projectCurrentDungeonSecretPassage(dungeon: DungeonState): DungeonSecretPassageView | null {
  const passage = dungeon.secretPassage, clue = passage?.clue;
  if (clue == null || !isValidDungeonSecretPassage(dungeon)) return null;
  if (passage?.opened == null) {
    const cue = projectDungeonSecretPassageCue(dungeon);
    return cue === null ? null : Object.freeze({ phase: "draught", direction: cue.direction });
  }
  if (dungeon.currentCellId === clue.fromCellId) return Object.freeze({ phase: "open", direction: clue.direction, destinationCellId: clue.toCellId });
  if (dungeon.currentCellId === clue.toCellId) return Object.freeze({ phase: "open", direction: opposite[clue.direction], destinationCellId: clue.fromCellId });
  return null;
}

export interface DungeonSecretPassageScene {
  readonly phase: "draught" | "opened" | "crossed";
  readonly commandId: string;
  readonly tick: number;
  readonly dungeonId: string;
  readonly cellId: string;
  readonly direction: MazeDirection;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
  /** Null until the wall has actually opened. */
  readonly connection: Readonly<{ fromCellId: string; toCellId: string; openingSourceCommandId: string }> | null;
}

/** A historical clue or opening cannot replay over another command, town, or campaign. */
export function projectDungeonSecretPassageScene(state: WorldState): DungeonSecretPassageScene | null {
  const dungeon = state.depth.dungeon, source = state.chronicle.at(-1);
  if (dungeon === null || state.scene.mode !== "dungeon" || source?.mode !== "dungeon"
    || state.tick !== state.depth.tick || source.tick !== state.tick || state.hero.id !== state.depth.hero.id
    || !isValidDungeonSecretPassage(dungeon, state.tick)) return null;
  const passage = dungeon.secretPassage, clue = passage?.clue;
  const current = projectCurrentDungeonSecretPassage(dungeon);
  if (clue == null || current === null) return null;
  const opened = passage?.opened;
  let phase: DungeonSecretPassageScene["phase"], direction = current.direction;
  if (opened == null) {
    const prefix = `depth:${state.tick}:dungeon:${dungeon.id}:`;
    const expectedSources = source.commandType === "move-dungeon" ? Object.keys(opposite).map(value => `${prefix}${value}`)
      : source.commandType === "disarm-dungeon-trap" ? [`${prefix}disarm:${clue.fromCellId}`]
      : source.commandType === "unlock-dungeon-gate" ? [`${prefix}unlock:${clue.fromCellId}`]
      : source.commandType === "search-dungeon" ? [`${prefix}search:${clue.fromCellId}`] : [];
    if (clue.revealedTick !== state.tick || !expectedSources.includes(clue.revealSourceCommandId)
      || source.commandId !== `${state.campaignId}:${clue.revealSourceCommandId}`) return null;
    phase = "draught";
  } else if (opened.tick === state.tick && source.commandType === "open-dungeon-passage"
    && source.commandId === `${state.campaignId}:${opened.sourceCommandId}` && dungeon.currentCellId === clue.fromCellId) {
    phase = "opened";
  } else if (opened.tick < state.tick && source.commandType === "move-dungeon") {
    // The exact adjacent move into this endpoint must have come from the other endpoint.
    direction = opposite[current.direction];
    if (source.commandId !== `${state.campaignId}:depth:${state.tick}:dungeon:${dungeon.id}:${direction}`) return null;
    phase = "crossed";
  } else return null;
  const headline = phase === "draught" ? `DRAUGHT · ${direction.toUpperCase()}`
    : phase === "opened" ? `PASSAGE OPEN · ${direction.toUpperCase()}` : "PASSAGE CROSSED";
  const detail = phase === "draught" ? "A COOL DRAUGHT THROUGH SOLID STONE"
    : phase === "opened" ? "TWO FAMILIAR ROOMS · A SHORTER WAY" : "A FAMILIAR ROOM, BY A NEW WAY";
  return Object.freeze({ phase, commandId: source.commandId!, tick: state.tick, dungeonId: dungeon.id,
    cellId: dungeon.currentCellId, direction, headline, detail,
    compactDetail: phase === "draught" ? "AIR THROUGH STONE" : phase === "opened" ? "WALL OPEN · HERO STILL" : "ONE REAL STEP",
    connection: opened == null ? null : Object.freeze({ fromCellId: clue.fromCellId, toCellId: clue.toCellId,
      openingSourceCommandId: `${state.campaignId}:${opened.sourceCommandId}` }),
  });
}
