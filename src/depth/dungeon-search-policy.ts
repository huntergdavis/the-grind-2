import { canSearchDungeon, canUnlockDungeonGate, projectDungeonMoveKnowledge, projectDungeonTraversal } from "./dungeon";
import type { DepthState } from "./types";

/** Caution uses public condition and passage knowledge, never hidden trap rolls. */
export function shouldSearchDungeon(state: DepthState): boolean {
  const dungeon = state.dungeon;
  if (dungeon === null || state.combat !== null || state.counterDuel !== null
    || state.companions.active.length > 0 || state.pendingQuestReward !== null
    || state.quest.status !== "active" || state.hero.resources.health <= 0
    || state.hero.resources.health * 2 > state.hero.resources.maxHealth
    || !canSearchDungeon(dungeon) || canUnlockDungeonGate(dungeon)) return false;
  const traversal = projectDungeonTraversal(dungeon);
  if (traversal.mode !== "explore") return false;
  const moves = projectDungeonMoveKnowledge(dungeon).filter((move) => traversal.options.includes(move.direction));
  if (moves.some((move) => move.sightedWayfinderKey
    || (move.feature === "shrine" && !dungeon.visitedCellIds.includes(move.destinationCellId)))) return false;
  // Already marked hazards need entry/disarming, not another search.
  return moves.some((move) => move.feature !== "trap");
}
