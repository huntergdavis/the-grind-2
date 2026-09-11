import {
  bellMoveCommandId, bellMoveOptions, bellRollCommandId, bellStartCommandId,
  isValidBellExpedition, moveBellExpedition, rollBellExpedition, startBellExpedition,
} from "./borrowed-bell";
import type { DepthCommand, DepthCommandCandidate, DepthState } from "./types";

type BellCommand = Extract<DepthCommand, { type: "start-bell" | "roll-bell" | "move-bell" }>;

export function borrowedBellInstanceId(heroId: string, locationId: string): string {
  return `bell:${heroId}:${locationId}:first-delivery`;
}

function quietSoloTown(state: DepthState): boolean {
  const locationId = state.atlas.currentLocationId;
  return state.hero.resources.health > 0 && state.companions.active.length === 0
    && state.atlas.route === null && state.combat === null && state.counterDuel === null
    && state.repartee.active === null && (state.dungeon === null || state.dungeon.completed)
    && state.quest.status === "active" && state.pendingQuestReward === null
    && state.atlas.discoveredLocationIds.includes(locationId)
    && state.atlas.locations.some((location) => location.id === locationId && location.kind === "town")
    && state.towns[locationId]?.locationId === locationId && state.towns[locationId]!.visits > 0;
}

export function canStartBorrowedBell(state: DepthState): boolean {
  return state.bellExpedition === null && quietSoloTown(state) && state.hero.level >= 2
    && state.hero.resources.health * 2 > state.hero.resources.maxHealth
    && state.hero.gold <= Number.MAX_SAFE_INTEGER - 4
    && state.companions.former.some((companion) => companion.departure.tick <= state.tick);
}

export function borrowedBellCommandId(tick: number, command: BellCommand): string {
  if (command.type === "start-bell") return bellStartCommandId(tick, command.instanceId, command.locationId);
  if (command.type === "roll-bell") return bellRollCommandId(tick, command.instanceId, command.turn);
  return bellMoveCommandId(tick, command.instanceId, command.turn, command.pace, command.route);
}

export function borrowedBellCommandCandidates(state: DepthState): readonly DepthCommandCandidate[] | null {
  const board = state.bellExpedition;
  const candidate = (command: BellCommand, label: string): DepthCommandCandidate => ({
    id: borrowedBellCommandId(state.tick + 1, command), command, label, deciderId: state.hero.id,
  });
  if (board !== null) {
    if (board.completion !== null) return null;
    if (board.pendingRoll === null) return [candidate({ type: "roll-bell", instanceId: board.instanceId, turn: board.turn },
      `roll the storehouse die for turn ${board.turn}`)];
    return bellMoveOptions(board).map((option) => candidate({ type: "move-bell", instanceId: board.instanceId,
      turn: board.turn, pace: option.pace, route: option.route },
    `${option.pace === "steady" ? "spend 1 MP to move one space" : `use the committed roll of ${board.pendingRoll!.value}`}${option.route === null ? "" : ` toward space ${option.route}`}`));
  }
  if (!canStartBorrowedBell(state)) return null;
  const locationId = state.atlas.currentLocationId;
  return [candidate({ type: "start-bell", instanceId: borrowedBellInstanceId(state.hero.id, locationId), locationId },
    "carry the Borrowed Bell through the storehouse board")];
}

export function describeBorrowedBell(state: DepthState): string {
  const board = state.bellExpedition;
  if (board === null) return "The storehouse delivery board is quiet.";
  if (board.pendingRoll !== null) return `The die shows ${board.pendingRoll.value}. Turn ${board.turn}: take the roll, or spend 1 MP to move exactly one space. Delivery bonus closes after turn 4.`;
  const move = board.turns.at(-1);
  if (move === undefined) return "The clerk hands over the festival bell. Carry it to the exit by turn 4 for 3 gold. Only landing triggers a room; forks stop movement.";
  const travel = `Turn ${move.turn} · roll ${move.roll.value} · ${move.pace}${move.steadyCost === 1 ? " (1 MP)" : ""} · ${move.path.join(" → ")}. ${move.landing.text}`;
  const result = board.completion?.outcome === "returned" ? " The bell is returned without a delivery bonus." : "";
  return `${travel}${result}`;
}

export function stepCampaignBorrowedBell(state: DepthState, command: BellCommand): DepthState {
  const sourceCommandId = borrowedBellCommandId(state.tick + 1, command);
  let board = state.bellExpedition;
  if (command.type === "start-bell") {
    if (!canStartBorrowedBell(state) || command.locationId !== state.atlas.currentLocationId
      || command.instanceId !== borrowedBellInstanceId(state.hero.id, command.locationId)) throw new Error("Borrowed Bell admission is unavailable");
    board = startBellExpedition({ instanceId: command.instanceId, heroId: state.hero.id, locationId: command.locationId,
      sourceCommandId, tick: state.tick + 1, mana: state.hero.resources.mana, gold: state.hero.gold });
  } else {
    if (board === null || board.completion !== null || board.instanceId !== command.instanceId || board.turn !== command.turn
      || !quietSoloTown(state) || state.atlas.currentLocationId !== board.locationId) throw new Error("No matching active Borrowed Bell turn");
    const context = { seed: state.seed, sourceCommandId, tick: state.tick + 1 };
    board = command.type === "roll-bell" ? rollBellExpedition(board, context)
      : moveBellExpedition(board, { pace: command.pace, route: command.route }, context);
  }
  return { ...state, tick: state.tick + 1, bellExpedition: board,
    hero: { ...state.hero, gold: board.gold, resources: { ...state.hero.resources, mana: board.mana } } };
}

/** Active resources are exact; a completed board remains historical after later travel or spending. */
export function isValidCampaignBorrowedBell(state: DepthState): boolean {
  try {
    const board = state.bellExpedition;
    if (board === null) return true;
    if (!isValidBellExpedition(board, state.seed) || board.heroId !== state.hero.id
      || board.instanceId !== borrowedBellInstanceId(state.hero.id, board.locationId)
      || board.startedTick > state.tick || board.sourceCommandId !== bellStartCommandId(board.startedTick, board.instanceId, board.locationId)
      || !state.atlas.discoveredLocationIds.includes(board.locationId)
      || !state.atlas.locations.some((location) => location.id === board.locationId && location.kind === "town")
      || state.towns[board.locationId]?.visits === undefined || state.towns[board.locationId]!.visits < 1
      || !state.companions.former.some((companion) => companion.departure.tick < board.startedTick)) return false;
    const latestTick = board.completion?.tick ?? board.pendingRoll?.tick ?? board.turns.at(-1)?.tick ?? board.startedTick;
    if (latestTick > state.tick) return false;
    if (board.pendingRoll !== null && board.pendingRoll.sourceCommandId !== bellRollCommandId(board.pendingRoll.tick, board.instanceId, board.pendingRoll.turn)) return false;
    for (const move of board.turns) {
      if (move.roll.sourceCommandId !== bellRollCommandId(move.roll.tick, board.instanceId, move.turn)
        || move.sourceCommandId !== bellMoveCommandId(move.tick, board.instanceId, move.turn, move.pace, move.route)) return false;
    }
    return board.completion !== null && latestTick < state.tick || quietSoloTown(state)
      && state.atlas.currentLocationId === board.locationId && state.hero.gold === board.gold
      && state.hero.resources.mana === board.mana;
  } catch { return false; }
}
