import { randomInt } from "../core/rng";

export const bellDeadline = 4;
export const bellHardTurnCap = 8;
export type BellPace = "stride" | "steady";
export type BellOutcome = "delivered" | "late" | "returned";
export type BellLandingKind = "transit" | "toll" | "inspection" | "parcel" | "exit";

const cells = Object.freeze([
  { id: 0, label: "Loan Desk", x: 0, y: 1, exits: [1] },
  { id: 1, label: "First Fork", x: 1, y: 1, exits: [2, 3] },
  { id: 2, label: "Shortcut Toll", x: 2, y: 0, exits: [4] },
  { id: 3, label: "Inspection", x: 2, y: 2, exits: [5] },
  { id: 4, label: "Dispatch Fork", x: 4, y: 1, exits: [7, 6] },
  { id: 5, label: "Long Corridor", x: 3, y: 2, exits: [4] },
  { id: 6, label: "Parcel Counter", x: 5, y: 2, exits: [7] },
  { id: 7, label: "Closing Passage", x: 6, y: 1, exits: [8] },
  { id: 8, label: "Exit", x: 7, y: 1, exits: [] },
].map((cell) => Object.freeze({ ...cell, exits: Object.freeze(cell.exits) })));

export interface BellRollReceipt { readonly turn: number; readonly value: 1 | 2 | 3; readonly sourceCommandId: string; readonly tick: number }
export interface BellLandingReceipt {
  readonly kind: BellLandingKind; readonly text: string;
  readonly manaSpent: 0 | 1; readonly goldGranted: 0 | 1; readonly routeNote: string | null;
}
export interface BellTurnReceipt {
  readonly turn: number; readonly roll: BellRollReceipt; readonly pace: BellPace; readonly route: number | null;
  readonly stepsAllowed: number; readonly path: readonly number[]; readonly landedCell: number;
  readonly discardedPips: number; readonly steadyCost: 0 | 1; readonly landing: BellLandingReceipt;
  readonly manaBefore: number; readonly manaAfter: number; readonly goldBefore: number; readonly goldAfter: number;
  readonly sourceCommandId: string; readonly tick: number;
}
export interface BellCompletion {
  readonly outcome: BellOutcome; readonly turn: number; readonly cell: number; readonly bonusGold: 0 | 3;
  readonly sourceCommandId: string; readonly tick: number;
}
export interface BellExpedition {
  readonly schemaVersion: 1; readonly rulesVersion: 1; readonly boardId: "borrowed-bell";
  readonly instanceId: string; readonly heroId: string; readonly locationId: string;
  readonly sourceCommandId: string; readonly startedTick: number;
  readonly initialMana: number; readonly initialGold: number; readonly mana: number; readonly gold: number;
  readonly currentCell: number; readonly turn: number; readonly pendingRoll: BellRollReceipt | null;
  readonly turns: readonly BellTurnReceipt[]; readonly landedCells: readonly number[];
  readonly completion: BellCompletion | null; readonly fallback: "return-without-bonus";
}
export interface BellStartContext {
  readonly instanceId: string; readonly heroId: string; readonly locationId: string;
  readonly sourceCommandId: string; readonly tick: number; readonly mana: number; readonly gold: number;
}
export interface BellMoveOption {
  readonly pace: BellPace; readonly route: number | null; readonly stepsAllowed: number;
  readonly path: readonly number[]; readonly landedCell: number; readonly steadyCost: 0 | 1;
  readonly landingKnown: boolean; readonly knownManaCost: number; readonly knownGoldReward: number | null;
}
export interface BellBoardView {
  readonly title: string;
  readonly cells: readonly {
    readonly id: number; readonly label: string; readonly x: number; readonly y: number; readonly exits: readonly number[];
    readonly visited: boolean; readonly landed: boolean; readonly current: boolean;
    readonly disclosure: "public" | "unrevealed" | "experienced"; readonly effectText: string;
  }[];
  readonly currentCell: number; readonly turn: number; readonly deadline: 4; readonly hardTurnCap: 8;
  readonly roll: number | null; readonly mana: number; readonly gold: number;
  readonly outcome: BellOutcome | null; readonly routeNote: string | null;
}

export function bellStartCommandId(tick: number, instanceId: string, locationId: string): string {
  return `depth:${tick}:bell:${instanceId}:start:${locationId}`;
}
export function bellRollCommandId(tick: number, instanceId: string, turn: number): string {
  return `depth:${tick}:bell:${instanceId}:roll:${turn}`;
}
export function bellMoveCommandId(tick: number, instanceId: string, turn: number, pace: BellPace, route: number | null): string {
  return `depth:${tick}:bell:${instanceId}:move:${turn}:${pace}:${route ?? "forward"}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\u0000-\u001f]/u.test(value);
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
function exact(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((item, index) => Object.hasOwn(actual, index) && exact(actual[index], item));
  if (record(expected)) return record(actual) && Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, item]) => Object.hasOwn(actual, key) && exact(actual[key], item));
  return actual === expected;
}

export function startBellExpedition(context: BellStartContext): BellExpedition {
  if (!identifier(context.instanceId) || !identifier(context.heroId) || !identifier(context.locationId)
    || !identifier(context.sourceCommandId)
    || !integer(context.tick, 1) || !integer(context.mana) || !integer(context.gold, 0, Number.MAX_SAFE_INTEGER - 4)
    || context.sourceCommandId !== bellStartCommandId(context.tick, context.instanceId, context.locationId)) {
    throw new TypeError("Invalid Borrowed Bell admission");
  }
  return {
    schemaVersion: 1, rulesVersion: 1, boardId: "borrowed-bell", instanceId: context.instanceId,
    heroId: context.heroId, locationId: context.locationId, sourceCommandId: context.sourceCommandId, startedTick: context.tick,
    initialMana: context.mana, initialGold: context.gold, mana: context.mana, gold: context.gold,
    currentCell: 0, turn: 1, pendingRoll: null, turns: [], landedCells: [], completion: null, fallback: "return-without-bonus",
  };
}

function movementPath(progress: BellExpedition, steps: number, route: number | null): readonly number[] | null {
  const start = cells[progress.currentCell];
  if (start === undefined || start.exits.length === 0
    || (start.exits.length > 1 ? route === null || !start.exits.includes(route) : route !== null)) return null;
  const path = [start.id];
  for (let step = 0; step < steps; step++) {
    const current = cells[path.at(-1)!]!;
    const next = step === 0 && route !== null ? route : current.exits[0];
    if (next === undefined) break;
    path.push(next);
    if (cells[next]!.exits.length !== 1) break;
  }
  return path;
}

function moveOptions(progress: BellExpedition): readonly BellMoveOption[] {
  if (progress.completion !== null || progress.pendingRoll === null) return [];
  const cell = cells[progress.currentCell]!;
  const routes: readonly (number | null)[] = cell.exits.length > 1 ? cell.exits : [null];
  const options: BellMoveOption[] = [];
  for (const pace of ["stride", "steady"] as const) {
    if (pace === "steady" && progress.mana < 1) continue;
    const stepsAllowed = pace === "steady" ? 1 : progress.pendingRoll.value;
    for (const route of routes) {
      const path = movementPath(progress, stepsAllowed, route);
      if (path === null || path.length < 2) continue;
      const landedCell = path.at(-1)!, steadyCost = pace === "steady" ? 1 : 0;
      const landingKnown = ![3, 6].includes(landedCell) || progress.landedCells.includes(landedCell);
      options.push({ pace, route, stepsAllowed, path, landedCell, steadyCost, landingKnown,
        knownManaCost: steadyCost + (landedCell === 2 ? Math.min(1, progress.mana - steadyCost) : 0),
        knownGoldReward: !landingKnown ? null : landedCell === 6 ? 1 : landedCell === 8 && progress.turn <= bellDeadline ? 3 : 0 });
    }
  }
  return options;
}

/** No seed or future roll is an input to the public legal-choice projection. */
export function bellMoveOptions(progress: BellExpedition): readonly BellMoveOption[] {
  if (!validExpedition(progress, null)) throw new TypeError("Invalid Borrowed Bell progress");
  return moveOptions(progress);
}

function rollValue(seed: string, instanceId: string, turn: number): 1 | 2 | 3 {
  return (1 + randomInt(3, seed, "borrowed-bell", instanceId, turn, "movement-v1")) as 1 | 2 | 3;
}

export function rollBellExpedition(progress: BellExpedition, context: { seed: string; sourceCommandId: string; tick: number }): BellExpedition {
  if (!identifier(context.seed) || !validExpedition(progress, context.seed) || progress.completion !== null
    || progress.pendingRoll !== null || progress.turn > bellHardTurnCap
    || !integer(context.tick, 1) || context.tick <= (progress.turns.at(-1)?.tick ?? progress.startedTick)
    || context.sourceCommandId !== bellRollCommandId(context.tick, progress.instanceId, progress.turn)) {
    throw new TypeError("Cannot commit an invalid, repeated or completed Borrowed Bell roll");
  }
  return { ...progress, pendingRoll: { turn: progress.turn, value: rollValue(context.seed, progress.instanceId, progress.turn),
    sourceCommandId: context.sourceCommandId, tick: context.tick } };
}

function landingEffect(progress: BellExpedition, cell: number, availableMana: number): BellLandingReceipt {
  if (progress.landedCells.includes(cell)) return {
    kind: "transit", text: "This landing was already resolved; nothing is collected again.", manaSpent: 0, goldGranted: 0, routeNote: null,
  };
  if (cell === 2) return { kind: "toll", text: availableMana > 0
    ? "The shortcut collects its posted toll: 1 MP. The bell is not legal tender."
    : "The shortcut finds no MP to collect. The bell passes without debt.",
  manaSpent: availableMana > 0 ? 1 : 0, goldGranted: 0, routeNote: null };
  if (cell === 3) return { kind: "inspection", text: "The inspector classifies the bell as a visiting hat and hands over a route note.",
    manaSpent: 0, goldGranted: 0,
    routeNote: "From the Dispatch Fork, the direct lane reaches the Closing Passage; the Parcel Counter adds one space." };
  if (cell === 6) return { kind: "parcel", text: "The counter stamps the hero MISCELLANEOUS PARCEL and supplies 1 gold in handling pay.",
    manaSpent: 0, goldGranted: 1, routeNote: null };
  if (cell === 8) return { kind: "exit", text: progress.turn <= bellDeadline
    ? "The bell reaches the exit before the closing procession. Delivery bonus: 3 gold."
    : "The procession has gone. The clerk stamps the carrier instead of the form; the bell is returned late, without a bonus.",
  manaSpent: 0, goldGranted: 0, routeNote: null };
  return { kind: "transit", text: `${cells[cell]!.label}: the bell continues to be the hero's responsibility.`,
    manaSpent: 0, goldGranted: 0, routeNote: null };
}

function applyMove(progress: BellExpedition, option: BellMoveOption, context: { sourceCommandId: string; tick: number }): BellExpedition {
  const manaBefore = progress.mana, goldBefore = progress.gold;
  const landing = landingEffect(progress, option.landedCell, manaBefore - option.steadyCost);
  const manaAfter = manaBefore - option.steadyCost - landing.manaSpent;
  const finished = option.landedCell === 8 || progress.turn >= bellHardTurnCap;
  const outcome: BellOutcome = option.landedCell === 8 ? progress.turn <= bellDeadline ? "delivered" : "late" : "returned";
  const bonusGold = finished && outcome === "delivered" ? 3 : 0;
  const goldAfter = goldBefore + landing.goldGranted + bonusGold;
  const receipt: BellTurnReceipt = {
    turn: progress.turn, roll: { ...progress.pendingRoll! }, pace: option.pace, route: option.route,
    stepsAllowed: option.stepsAllowed, path: [...option.path], landedCell: option.landedCell,
    discardedPips: option.stepsAllowed - (option.path.length - 1), steadyCost: option.steadyCost,
    landing, manaBefore, manaAfter, goldBefore, goldAfter, sourceCommandId: context.sourceCommandId, tick: context.tick,
  };
  return { ...progress, currentCell: option.landedCell, mana: manaAfter, gold: goldAfter,
    turn: finished ? progress.turn : progress.turn + 1, pendingRoll: null,
    turns: [...progress.turns, receipt],
    landedCells: progress.landedCells.includes(option.landedCell) ? progress.landedCells : [...progress.landedCells, option.landedCell],
    completion: finished ? { outcome, turn: progress.turn, cell: option.landedCell, bonusGold,
      sourceCommandId: context.sourceCommandId, tick: context.tick } : null };
}

/** The campaign passes its seed; a seedless caller may replay only the already committed die. */
export function moveBellExpedition(progress: BellExpedition, action: { pace: BellPace; route: number | null },
  context: { sourceCommandId: string; tick: number; seed?: string }): BellExpedition {
  if (context.seed !== undefined && !identifier(context.seed) || !validExpedition(progress, context.seed ?? null)
    || progress.pendingRoll === null || progress.completion !== null
    || !integer(context.tick, 1) || context.tick <= progress.pendingRoll.tick
    || context.sourceCommandId !== bellMoveCommandId(context.tick, progress.instanceId, progress.turn, action.pace, action.route)) {
    throw new TypeError("Cannot move an invalid, unrolled or completed Borrowed Bell expedition");
  }
  const option = moveOptions(progress).find((entry) => entry.pace === action.pace && entry.route === action.route);
  if (option === undefined) throw new TypeError("Borrowed Bell pace or route is not legal");
  return applyMove(progress, option, context);
}

function validRoll(value: unknown, progress: BellExpedition, seed: string | null): value is BellRollReceipt {
  if (!record(value) || Object.keys(value).length !== 4 || value.turn !== progress.turn
    || !integer(value.value, 1, 3) || !integer(value.tick, 1)
    || value.tick <= (progress.turns.at(-1)?.tick ?? progress.startedTick)
    || value.sourceCommandId !== bellRollCommandId(value.tick, progress.instanceId, progress.turn)) return false;
  return seed === null || value.value === rollValue(seed, progress.instanceId, progress.turn);
}

function validExpedition(value: unknown, seed: string | null): value is BellExpedition {
  try {
    if (!record(value) || value.schemaVersion !== 1 || value.rulesVersion !== 1 || value.boardId !== "borrowed-bell"
      || !identifier(value.instanceId) || !identifier(value.heroId) || !identifier(value.locationId)
      || !identifier(value.sourceCommandId) || !integer(value.startedTick, 1)
      || !integer(value.initialMana) || !integer(value.initialGold, 0, Number.MAX_SAFE_INTEGER - 4)
      || !Array.isArray(value.turns) || value.turns.length > bellHardTurnCap) return false;
    let replay = startBellExpedition({ instanceId: value.instanceId, heroId: value.heroId, locationId: value.locationId,
      sourceCommandId: value.sourceCommandId, tick: value.startedTick, mana: value.initialMana, gold: value.initialGold });
    for (const receipt of value.turns) {
      if (!record(receipt) || replay.completion !== null || !validRoll(receipt.roll, replay, seed)
        || (receipt.pace !== "stride" && receipt.pace !== "steady")
        || !(receipt.route === null || integer(receipt.route, 0, 8)) || !integer(receipt.tick, 1) || receipt.tick <= receipt.roll.tick
        || receipt.sourceCommandId !== bellMoveCommandId(receipt.tick, replay.instanceId, replay.turn, receipt.pace, receipt.route)) return false;
      replay = { ...replay, pendingRoll: { ...receipt.roll } };
      const option = moveOptions(replay).find((entry) => entry.pace === receipt.pace && entry.route === receipt.route);
      if (option === undefined) return false;
      replay = applyMove(replay, option, { sourceCommandId: receipt.sourceCommandId, tick: receipt.tick });
      if (!exact(receipt, replay.turns.at(-1))) return false;
    }
    if (value.pendingRoll !== null) {
      if (replay.completion !== null || !validRoll(value.pendingRoll, replay, seed)) return false;
      replay = { ...replay, pendingRoll: { ...value.pendingRoll } };
    }
    return exact(value, replay);
  } catch { return false; }
}

/** Supported v1 history is replayed exactly. Unknown versions are rejected, never auto-settled. */
export function isValidBellExpedition(value: unknown, seed: string): value is BellExpedition {
  return identifier(seed) && validExpedition(value, seed);
}

export function projectBellBoard(progress: BellExpedition): BellBoardView {
  if (!validExpedition(progress, null)) throw new TypeError("Cannot project invalid Borrowed Bell progress");
  const visited = new Set([0, ...progress.turns.flatMap((entry) => entry.path)]);
  return {
    title: "The Borrowed Bell", currentCell: progress.currentCell, turn: progress.turn,
    deadline: 4, hardTurnCap: 8, roll: progress.pendingRoll?.value ?? null,
    mana: progress.mana, gold: progress.gold, outcome: progress.completion?.outcome ?? null,
    routeNote: progress.turns.find((entry) => entry.landing.routeNote !== null)?.landing.routeNote ?? null,
    cells: cells.map((cell) => {
      const receipt = progress.turns.find((entry) => entry.landedCell === cell.id);
      const hidden = [3, 6].includes(cell.id) && receipt === undefined;
      return { ...cell, exits: [...cell.exits], visited: visited.has(cell.id), landed: progress.landedCells.includes(cell.id),
        current: cell.id === progress.currentCell, disclosure: hidden ? "unrevealed" : receipt === undefined ? "public" : "experienced",
        effectText: hidden ? "Effect unknown until landing" : receipt?.landing.text ?? (cell.id === 2
          ? "Posted toll: lose at most 1 MP when landing; no debt at zero MP."
          : cell.id === 8 ? "Return by turn 4 for 3 gold; later returns receive no bonus." : "Transit; no landing reward.") };
    }),
  };
}
