import { describe, expect, it } from "vitest";
import {
  bellHardTurnCap, bellMoveCommandId, bellMoveOptions, bellRollCommandId, bellStartCommandId,
  isValidBellExpedition, moveBellExpedition, projectBellBoard, rollBellExpedition, startBellExpedition,
  type BellExpedition, type BellPace,
} from "./borrowed-bell";

const seed = "borrowed-bell-rules";
const instanceId = "bell:hero:town";

function start(mana = 10, gold = 4): BellExpedition {
  return startBellExpedition({ instanceId, heroId: "hero", locationId: "town", tick: 1, mana, gold,
    sourceCommandId: bellStartCommandId(1, instanceId, "town") });
}

function roll(progress: BellExpedition): BellExpedition {
  const tick = (progress.turns.at(-1)?.tick ?? progress.startedTick) + 1;
  return rollBellExpedition(progress, { seed, tick, sourceCommandId: bellRollCommandId(tick, instanceId, progress.turn) });
}

function move(progress: BellExpedition, pace: BellPace = "stride", route: number | null = null): BellExpedition {
  const rolled = progress.pendingRoll === null ? roll(progress) : progress;
  const tick = rolled.pendingRoll!.tick + 1;
  return moveBellExpedition(rolled, { pace, route }, { seed, tick,
    sourceCommandId: bellMoveCommandId(tick, instanceId, rolled.turn, pace, route) });
}

function atFirstFork(mana = 10): BellExpedition { return move(start(mana)); }
function atDispatch(mana = 10): BellExpedition { return move(atFirstFork(mana), "stride", 2); }

describe("The Borrowed Bell's finite board rules", () => {
  it("admits one public nine-cell board, a four-turn bonus deadline and a no-bonus fallback", () => {
    const initial = start(), view = projectBellBoard(initial);
    expect(initial).toMatchObject({ schemaVersion: 1, rulesVersion: 1, boardId: "borrowed-bell", currentCell: 0,
      turn: 1, pendingRoll: null, turns: [], completion: null, fallback: "return-without-bonus", mana: 10, gold: 4 });
    expect(view.cells.map((cell) => [cell.id, cell.exits])).toEqual([
      [0, [1]], [1, [2, 3]], [2, [4]], [3, [5]], [4, [7, 6]], [5, [4]], [6, [7]], [7, [8]], [8, []],
    ]);
    expect(view).toMatchObject({ deadline: 4, hardTurnCap: 8, roll: null, routeNote: null });
    expect(view.cells.filter((cell) => cell.disclosure === "unrevealed").map((cell) => cell.id)).toEqual([3, 6]);
    expect(view.cells[2]!.effectText).toContain("at most 1 MP");
    expect(view.cells[8]!.effectText).toContain("turn 4 for 3 gold");
    expect(bellMoveOptions(initial)).toEqual([]);
    expect(isValidBellExpedition(initial, seed)).toBe(true);
  });

  it("commits one seeded roll before movement, rejects rerolls and retains its independent source", () => {
    const initial = start(), rolled = roll(initial);
    expect(rolled.pendingRoll).toEqual({ turn: 1, value: 3, sourceCommandId: bellRollCommandId(2, instanceId, 1), tick: 2 });
    expect(initial.pendingRoll).toBeNull();
    expect(rolled.currentCell).toBe(0);
    expect(rolled.mana).toBe(initial.mana);
    expect(roll(initial)).toEqual(rolled);
    expect(() => roll(rolled)).toThrow();
    expect(() => moveBellExpedition(initial, { pace: "stride", route: null },
      { seed, tick: 2, sourceCommandId: bellMoveCommandId(2, instanceId, 1, "stride", null) })).toThrow();
    const moved = move(rolled), turn = moved.turns[0]!;
    expect(turn.roll).toEqual(rolled.pendingRoll);
    expect(turn.roll.sourceCommandId).not.toBe(turn.sourceCommandId);
    expect(turn.roll.tick).toBeLessThan(turn.tick);
    expect(moved.pendingRoll).toBeNull();
    expect(moved.turn).toBe(2);
  });

  it("stops at forks and exit, discards extra pips, and applies no effects to passed cells", () => {
    const fork = atFirstFork();
    expect(fork.turns[0]).toMatchObject({ path: [0, 1], landedCell: 1, stepsAllowed: 3, discardedPips: 2 });
    const dispatch = move(fork, "stride", 2);
    expect(dispatch.turns[1]).toMatchObject({ path: [1, 2, 4], landedCell: 4, manaBefore: 10, manaAfter: 10 });
    expect(dispatch.landedCells).not.toContain(2);
    const parcelPassed = move(dispatch, "stride", 6);
    expect(parcelPassed.turns[2]).toMatchObject({ path: [4, 6, 7], landedCell: 7, goldBefore: 4, goldAfter: 4 });
    expect(projectBellBoard(parcelPassed).cells[6]).toMatchObject({ visited: true, landed: false, disclosure: "unrevealed" });
    const exit = move(parcelPassed);
    expect(exit.turns[3]).toMatchObject({ path: [7, 8], discardedPips: 2, goldBefore: 4, goldAfter: 7 });
    expect(exit.completion).toMatchObject({ outcome: "delivered", turn: 4, cell: 8, bonusGold: 3 });
  });

  it("spends exactly one MP to steady, then applies the separately disclosed landing toll without debt", () => {
    const before = atFirstFork(2), landed = move(before, "steady", 2);
    expect(landed.turns[1]).toMatchObject({ roll: { value: 2 }, stepsAllowed: 1, path: [1, 2], steadyCost: 1,
      manaBefore: 2, manaAfter: 0, landing: { kind: "toll", manaSpent: 1, goldGranted: 0 } });
    const noDebt = move(atFirstFork(1), "steady", 2);
    expect(noDebt.turns[1]).toMatchObject({ steadyCost: 1, manaAfter: 0, landing: { manaSpent: 0 } });
    expect(noDebt.turns[1]!.landing.text).toContain("without debt");
    let penniless = start(0);
    for (const route of [null, 2, 7]) {
      const rolled = roll(penniless);
      expect(bellMoveOptions(rolled).every((option) => option.pace === "stride")).toBe(true);
      expect(() => move(rolled, "steady", route)).toThrow();
      penniless = move(rolled, "stride", route);
    }
    expect(penniless).toMatchObject({ mana: 0, gold: 7, completion: { outcome: "delivered" } });
  });

  it("reveals inspection and parcel effects only on landing, with no hidden reward in legal choices", () => {
    const fork = roll(atFirstFork());
    const unseen = bellMoveOptions(fork).find((option) => option.pace === "steady" && option.route === 3)!;
    expect(unseen).toMatchObject({ landedCell: 3, landingKnown: false, knownGoldReward: null, knownManaCost: 1 });
    expect(unseen).not.toHaveProperty("routeNote");
    const passed = move(fork, "stride", 3), passingView = projectBellBoard(passed);
    expect(passed.turns[1]!.path).toEqual([1, 3, 5]);
    expect(passingView.cells[3]).toMatchObject({ visited: true, landed: false, effectText: "Effect unknown until landing" });
    expect(passingView.routeNote).toBeNull();
    const inspected = move(fork, "steady", 3), inspectedView = projectBellBoard(inspected);
    expect(inspected.turns[1]!.landing.kind).toBe("inspection");
    expect(inspectedView.cells[3]!.disclosure).toBe("experienced");
    expect(inspectedView.routeNote).toContain("Parcel Counter adds one space");
    const dispatch = roll(atDispatch());
    expect(bellMoveOptions(dispatch).find((option) => option.pace === "steady" && option.route === 6))
      .toMatchObject({ landedCell: 6, landingKnown: false, knownGoldReward: null });
    const parcel = move(dispatch, "steady", 6);
    expect(parcel.turns[2]).toMatchObject({ landing: { kind: "parcel", goldGranted: 1 }, goldBefore: 4, goldAfter: 5 });
    expect(projectBellBoard(parcel).cells[6]!.effectText).toContain("1 gold");
    const delivered = move(parcel);
    expect(delivered).toMatchObject({ gold: 8, completion: { bonusGold: 3, outcome: "delivered" } });
  });

  it("returns the bell late on the seven-step long route without erasing spent mana or parcel pay", () => {
    let state = start();
    for (const route of [null, 3, null, null, 6, null, null]) state = move(state, "steady", route);
    expect(state.turns).toHaveLength(7);
    expect(state).toMatchObject({ currentCell: 8, turn: 7, mana: 3, gold: 5,
      completion: { outcome: "late", bonusGold: 0 } });
    expect(state.turns.at(-1)!.landing.text).toContain("stamps the carrier");
    expect(state.turns.some((turn) => turn.landing.routeNote !== null)).toBe(true);
    expect(() => roll(state)).toThrow();
    expect(() => move(state)).toThrow();
    expect(bellMoveOptions(state)).toEqual([]);
  });

  it("preserves the exact admission, committed die, move and completed receipt through JSON reload", () => {
    const initial = start(), rolled = roll(initial), moved = move(rolled);
    const completed = move(move(moved, "stride", 2), "stride", 7);
    for (const state of [initial, rolled, moved, completed]) {
      const restored = JSON.parse(JSON.stringify(state));
      expect(isValidBellExpedition(restored, seed)).toBe(true);
      expect(restored).toEqual(state);
      expect(projectBellBoard(restored)).toEqual(projectBellBoard(state));
      expect(bellMoveOptions(restored)).toEqual(bellMoveOptions(state));
    }
    expect(move(JSON.parse(JSON.stringify(rolled)))).toEqual(moved);
  });

  it("rejects unsupported versions, fabricated rolls, arithmetic, effects, paths and duplicate rewards", () => {
    const rolled = roll(start()), state = move(move(move(start()), "stride", 2), "stride", 7);
    for (const invalid of [
      null, undefined, {}, { ...state, schemaVersion: 2 }, { ...state, rulesVersion: 2 },
      { ...state, boardId: "unknown-board" }, { ...state, extra: true }, { ...state, fallback: "free-bonus" },
      { ...state, sourceCommandId: "foreign-admission" }, { ...state, locationId: "foreign-town" },
      { ...state, mana: state.mana + 1 }, { ...state, gold: state.gold + 3 },
      { ...state, currentCell: 4 }, { ...state, turn: state.turn + 1 }, { ...state, landedCells: [...state.landedCells, 6] },
      { ...state, completion: { ...state.completion, bonusGold: 6 } },
      { ...state, completion: { ...state.completion, outcome: "returned" } },
      { ...state, turns: [...state.turns, state.turns.at(-1)] },
      { ...state, pendingRoll: rolled.pendingRoll },
      { ...rolled, pendingRoll: { ...rolled.pendingRoll, value: 1 } },
      { ...rolled, pendingRoll: { ...rolled.pendingRoll, sourceCommandId: "foreign-roll" } },
      { ...rolled, pendingRoll: { ...rolled.pendingRoll, tick: rolled.startedTick } },
    ]) expect(isValidBellExpedition(invalid, seed)).toBe(false);
    const turn = state.turns[0]!;
    for (const patch of [
      { sourceCommandId: "foreign-move" }, { tick: turn.roll.tick }, { path: [0, 1, 2] },
      { landedCell: 2 }, { discardedPips: 0 }, { steadyCost: 1 }, { manaAfter: 9 }, { goldAfter: 100 },
      { roll: { ...turn.roll, value: 1 } }, { roll: { ...turn.roll, sourceCommandId: "foreign" } },
      { landing: { ...turn.landing, goldGranted: 1 } }, { landing: { ...turn.landing, text: "Invented event" } },
    ]) expect(isValidBellExpedition({ ...state, turns: [{ ...turn, ...patch }, ...state.turns.slice(1)] }, seed)).toBe(false);
    const unsupported = { ...rolled, rulesVersion: 2 } as unknown as BellExpedition;
    const unchanged = JSON.stringify(unsupported);
    expect(() => rollBellExpedition(unsupported, { seed, tick: 3, sourceCommandId: bellRollCommandId(3, instanceId, 1) })).toThrow();
    expect(() => moveBellExpedition(unsupported, { pace: "stride", route: null },
      { seed, tick: 3, sourceCommandId: bellMoveCommandId(3, instanceId, 1, "stride", null) })).toThrow();
    expect(JSON.stringify(unsupported)).toBe(unchanged);
  });

  it("rejects stale or non-adjacent routes and unsafe numerical admission rather than manufacturing recovery", () => {
    const fork = roll(atFirstFork()), tick = fork.pendingRoll!.tick + 1;
    for (const route of [null, 0, 4, 6, 8]) expect(() => moveBellExpedition(fork, { pace: "stride", route },
      { seed, tick, sourceCommandId: bellMoveCommandId(tick, instanceId, fork.turn, "stride", route) })).toThrow();
    expect(() => moveBellExpedition(fork, { pace: "stride", route: 2 },
      { seed, tick: fork.pendingRoll!.tick, sourceCommandId: bellMoveCommandId(fork.pendingRoll!.tick, instanceId, fork.turn, "stride", 2) })).toThrow();
    expect(() => moveBellExpedition(fork, { pace: "stride", route: 2 }, { seed, tick, sourceCommandId: "replayed-another-choice" })).toThrow();
    for (const mana of [-1, 1.5, NaN, Infinity]) expect(() => start(mana)).toThrow();
    for (const gold of [-1, 0.5, Number.MAX_SAFE_INTEGER - 3]) expect(() => start(1, gold)).toThrow();
    const longInstance = "b".repeat(512);
    expect(() => startBellExpedition({ instanceId: longInstance, heroId: "hero", locationId: "town", tick: 1, mana: 1, gold: 1,
      sourceCommandId: bellStartCommandId(1, longInstance, "town") })).toThrow();
    const largest = start(10, Number.MAX_SAFE_INTEGER - 4);
    const paid = move(move(move(move(largest), "stride", 2), "steady", 6));
    expect(paid.gold).toBe(Number.MAX_SAFE_INTEGER);
    expect(isValidBellExpedition(paid, seed)).toBe(true);
  });

  it("exhausts all legal decisions for one committed dice stream and every route terminates before the hard cap", () => {
    const endings: BellExpedition[] = [];
    let visited = 0;
    function explore(state: BellExpedition): void {
      expect(++visited).toBeLessThan(2_000);
      expect(isValidBellExpedition(state, seed)).toBe(true);
      if (state.completion !== null) { endings.push(state); return; }
      const rolled = roll(state), choices = bellMoveOptions(rolled);
      expect(choices.length).toBeGreaterThan(0);
      expect(choices.some((option) => option.pace === "stride")).toBe(true);
      for (const option of choices) explore(move(rolled, option.pace, option.route));
    }
    explore(start());
    expect(endings.length).toBeGreaterThan(10);
    expect(new Set(endings.map((state) => state.completion!.outcome))).toEqual(new Set(["delivered", "late"]));
    expect(Math.max(...endings.map((state) => state.turns.length))).toBe(7);
    for (const state of endings) {
      expect(state.currentCell).toBe(8);
      expect(state.turns.length).toBeLessThan(bellHardTurnCap);
      expect(state.mana).toBeGreaterThanOrEqual(0);
      expect(state.gold - state.initialGold).toBeLessThanOrEqual(4);
      expect(state.landedCells.length).toBe(new Set(state.landedCells).size);
      expect(state.turns.filter((turn) => turn.landing.kind === "parcel").length).toBeLessThanOrEqual(1);
      expect(state.turns.filter((turn) => turn.landing.kind === "toll").length).toBeLessThanOrEqual(1);
    }
  });
});
