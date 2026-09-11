import type { WorldState } from "../core/types";
import { dungeonGuardianResolutionCommandId, isValidCampaignDungeonLair, isValidDungeonLair } from "../depth/dungeon-lair";
import type { DungeonState } from "../depth/types";

/** A remembered encounter, not surveillance of an unvisited room or a surviving foe. */
export interface DungeonLairMark {
  readonly dungeonId: string;
  readonly cellId: string;
  readonly status: "revealed" | "cleared" | "unbeaten";
  readonly guardianId: string;
  readonly guardianName: string;
}

export function projectDungeonLairMark(dungeon: DungeonState): DungeonLairMark | null {
  const encounter = dungeon.lair?.encounter;
  if (encounter == null || !isValidDungeonLair(dungeon)
    || !dungeon.visitedCellIds.includes(encounter.cellId) || !dungeon.discoveredCellIds.includes(encounter.cellId)) return null;
  return Object.freeze({ dungeonId: dungeon.id, cellId: encounter.cellId,
    status: encounter.resolution === null ? "revealed" : encounter.resolution.outcome === "victory" ? "cleared" : "unbeaten",
    guardianId: encounter.guardian.id, guardianName: encounter.guardian.name });
}

export interface DungeonGuardianScene {
  readonly phase: "entered" | "fighting" | "victory" | "defeat" | "stalemate";
  readonly commandId: string;
  readonly tick: number;
  readonly dungeonId: string;
  readonly cellId: string;
  readonly combatId: string;
  readonly heroId: string;
  readonly guardianId: string;
  readonly guardianName: string;
  readonly headline: string;
  readonly detail: string;
  readonly compactDetail: string;
}

/** The current committed event owns the caption and chamber. Retained history alone cannot replay a fight. */
export function projectDungeonGuardianScene(state: WorldState): DungeonGuardianScene | null {
  const dungeon = state.depth.dungeon, source = state.chronicle.at(-1), encounter = dungeon?.lair?.encounter;
  if (dungeon == null || encounter == null || source == null || state.tick !== state.depth.tick || source.tick !== state.tick
    || state.hero.id !== state.depth.hero.id || encounter.heroId !== state.hero.id
    || encounter.locationId !== state.depth.atlas.currentLocationId || !isValidCampaignDungeonLair(state.depth)) return null;
  let phase: DungeonGuardianScene["phase"], commandId: string;
  if (encounter.arrival.tick === state.tick && encounter.started === null && source.commandType === "move-dungeon"
    && state.scene.mode === "dungeon" && source.mode === "dungeon" && dungeon.currentCellId === encounter.cellId) {
    phase = "entered"; commandId = encounter.arrival.sourceCommandId;
  } else if (encounter.started?.tick === state.tick && encounter.resolution === null && source.commandType === "start-dungeon-guardian"
    && state.scene.mode === "battle" && source.mode === "battle" && state.depth.combat?.id === encounter.combatId) {
    phase = "fighting"; commandId = encounter.started.sourceCommandId;
  } else if (source.commandType === "combat-action" && source.mode === "battle" && state.scene.mode === "battle") {
    const combat = encounter.resolution?.tick === state.tick ? encounter.resolution.combat : state.depth.combat;
    if (combat?.id !== encounter.combatId) return null;
    const actualSource = dungeonGuardianResolutionCommandId(combat, state.tick);
    if (actualSource === null) return null;
    if (encounter.resolution !== null) {
      if (encounter.resolution.tick !== state.tick || encounter.resolution.sourceCommandId !== actualSource) return null;
      phase = encounter.resolution.outcome;
    } else phase = "fighting";
    commandId = actualSource;
  } else return null;
  if (source.commandId !== `${state.campaignId}:${commandId}`) return null;
  const headline = phase === "entered" ? "THE ROOM IS TAKEN" : phase === "fighting" ? "LAIR GUARDIAN"
    : phase === "victory" ? "LAIR CLEARED" : phase === "defeat" ? "DEFEAT · LAIR UNBEATEN" : "STALEMATE · LAIR UNBEATEN";
  const detail = phase === "entered" ? "The map said lair. I had hoped it meant former lair."
    : phase === "fighting" ? `${encounter.guardian.name} · the room is occupied.`
    : phase === "victory" ? "One room won. The rest of the maze remains."
    : "The encounter is remembered unbeaten. No second challenge.";
  return Object.freeze({ phase, commandId: source.commandId, tick: state.tick, dungeonId: dungeon.id,
    cellId: encounter.cellId, combatId: encounter.combatId, heroId: encounter.heroId,
    guardianId: encounter.guardian.id, guardianName: encounter.guardian.name, headline, detail,
    compactDetail: phase === "entered" ? "I HAD HOPED: FORMER LAIR" : phase === "victory" ? "ONE ROOM WON · MAZE REMAINS"
      : phase === "fighting" ? encounter.guardian.name : "UNBEATEN · NO SECOND CHALLENGE" });
}
