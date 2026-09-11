import { beforeAll, describe, expect, it } from "vitest";
import { naturalBorrowedBellFixture } from "../../tests/borrowed-bell-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { createSpectatorInbox, observeSpectatorInbox } from "../ui/spectator-inbox";
import { bellMoveOptions, type BellExpedition } from "./borrowed-bell";
import { borrowedBellCommandId, borrowedBellInstanceId, canStartBorrowedBell, isValidCampaignBorrowedBell } from "./borrowed-bell-campaign";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}

function boardSource(board: BellExpedition): string {
  return board.pendingRoll?.sourceCommandId ?? board.completion?.sourceCommandId
    ?? board.turns.at(-1)?.sourceCommandId ?? board.sourceCommandId;
}

/** Legal direct-command scenarios, not claims about what the autonomous policy chooses. */
function explicitRun(state: DepthState, steadyLongRoute: boolean): DepthState {
  // This direct-command scenario bypasses the policy's ordinary zero-MP recovery preference.
  expect(canStartBorrowedBell(state)).toBe(true);
  let current = stepDepth(state, { type: "start-bell",
    instanceId: borrowedBellInstanceId(state.hero.id, state.atlas.currentLocationId), locationId: state.atlas.currentLocationId });
  for (let beat = 0; beat < 16 && current.bellExpedition!.completion === null; beat++) {
    const board = current.bellExpedition!;
    const command = board.pendingRoll === null ? depthCommandCandidates(current)[0]!.command : {
      type: "move-bell" as const, instanceId: board.instanceId, turn: board.turn,
      pace: steadyLongRoute ? "steady" as const : "stride" as const,
      route: board.currentCell === 1 ? steadyLongRoute ? 3 : 2 : board.currentCell === 4 ? steadyLongRoute ? 6 : 7 : null,
    };
    current = stepDepth(current, command);
    expect(reload(current)).toEqual(current);
  }
  expect(current.bellExpedition!.completion).not.toBeNull();
  return current;
}

describe("the Borrowed Bell in the actual campaign", () => {
  let ready: WorldState;
  let beats: { before: WorldState; after: WorldState }[];
  let completed: WorldState;
  beforeAll(() => {
    ready = naturalBorrowedBellFixture();
    let state = ready;
    beats = [];
    for (let beat = 0; beat < 17; beat++) {
      const before = state;
      state = advanceWorld(state);
      beats.push({ before, after: state });
      if (state.depth.bellExpedition?.completion !== null && state.depth.bellExpedition !== null) {
        completed = state; return;
      }
    }
    throw new Error("Actual Borrowed Bell run exceeded one admission plus eight roll/move turns");
  });

  it("admits one solo hero after a real farewell at a visited town without granting resources or normal dungeon credit", () => {
    const before = ready.depth, after = beats[0]!.after.depth, board = after.bellExpedition!;
    expect(canStartBorrowedBell(before)).toBe(true);
    expect(before.companions.active).toEqual([]);
    expect(before.companions.former.length).toBeGreaterThan(0);
    expect(before.towns[before.atlas.currentLocationId]!.visits).toBeGreaterThan(0);
    expect(before.atlas.discoveredLocationIds).toContain(before.atlas.currentLocationId);
    expect(board).toMatchObject({ schemaVersion: 1, rulesVersion: 1, boardId: "borrowed-bell",
      instanceId: borrowedBellInstanceId(before.hero.id, before.atlas.currentLocationId),
      heroId: before.hero.id, locationId: before.atlas.currentLocationId, startedTick: before.tick + 1,
      initialMana: before.hero.resources.mana, initialGold: before.hero.gold,
      currentCell: 0, turn: 1, pendingRoll: null, turns: [], landedCells: [], completion: null,
      fallback: "return-without-bonus" });
    expect(board.sourceCommandId).toBe(borrowedBellCommandId(after.tick, {
      type: "start-bell", instanceId: board.instanceId, locationId: board.locationId,
    }));
    expect(after.hero).toEqual(before.hero);
    expect(after.quest).toEqual(before.quest);
    expect(after.dungeon).toEqual(before.dungeon);
    expect(after.companions).toEqual(before.companions);
    expect(after.reparteeCallback).toEqual(before.reparteeCallback);
    expect(reload(after)).toEqual(after);
    expect(depthCommandCandidates(after).map(entry => entry.command.type)).toEqual(["roll-bell"]);
  });

  it("commits each die before choosing a legal route, preserving exact rolls, landing-only effects, and source-linked saves", () => {
    for (const { before, after } of beats) {
      const board = after.depth.bellExpedition!, command = after.chronicle.at(-1)!;
      expect(command.mode).toBe("chronicle");
      expect(command.commandId).toBe(`${after.campaignId}:${boardSource(board)}`);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(after)))).toEqual(after);
      expect(reload(after.depth)).toEqual(after.depth);
      expect(after.depth.hero.resources.health).toBe(ready.depth.hero.resources.health);
      expect(after.depth.hero.resources.maxHealth).toBe(ready.depth.hero.resources.maxHealth);
      expect(after.depth.hero.resources.maxMana).toBe(ready.depth.hero.resources.maxMana);
      expect(after.depth.hero.experience).toBe(ready.depth.hero.experience);
      expect(after.depth.hero.inventory).toEqual(ready.depth.hero.inventory);
      expect(after.depth.companions).toEqual(ready.depth.companions);
      expect(after.depth.quest).toEqual(ready.depth.quest);
      expect(after.depth.completedQuests).toEqual(ready.depth.completedQuests);
      if (command.commandType === "roll-bell") {
        expect(board.pendingRoll).toMatchObject({ turn: board.turn, tick: after.tick });
        expect([1, 2, 3]).toContain(board.pendingRoll!.value);
        expect(board.currentCell).toBe(before.depth.bellExpedition!.currentCell);
        expect(board.turns).toEqual(before.depth.bellExpedition!.turns);
        expect(after.depth.hero).toEqual(before.depth.hero);
        expect(depthCommandCandidates(after.depth).every(entry => entry.command.type === "move-bell")).toBe(true);
      }
      if (command.commandType === "move-bell") {
        const prior = before.depth.bellExpedition!, move = board.turns.at(-1)!;
        expect(move.roll).toEqual(prior.pendingRoll);
        expect(move.path[0]).toBe(prior.currentCell);
        expect(move.path.at(-1)).toBe(board.currentCell);
        expect(bellMoveOptions(prior)).toContainEqual(expect.objectContaining({ pace: move.pace, route: move.route,
          path: move.path, landedCell: move.landedCell }));
        expect(board.mana).toBe(prior.mana - move.steadyCost - move.landing.manaSpent);
        expect(board.gold).toBe(prior.gold + move.landing.goldGranted + (board.completion?.bonusGold ?? 0));
        expect(move.landing.goldGranted).toBe(move.landedCell === 6 ? 1 : 0);
        expect(move.landing.manaSpent).toBe(move.landedCell === 2 ? Math.min(1, prior.mana - move.steadyCost) : 0);
        expect(after.depth.hero.resources.mana).toBe(board.mana);
        expect(after.depth.hero.gold).toBe(board.gold);
      }
    }
    expect(completed.depth.bellExpedition!.completion!.cell).toBe(8);
    expect(completed.depth.bellExpedition!.turns.length).toBeLessThanOrEqual(7);
  });

  it("honors real MP for precise stops and a late parcel return, while zero MP still permits a finite stride run", () => {
    const late = explicitRun(ready.depth, true), board = late.bellExpedition!;
    expect(board.completion).toMatchObject({ outcome: "late", bonusGold: 0, turn: 7, cell: 8 });
    expect(board.turns.map(turn => turn.landedCell)).toEqual([1, 3, 5, 4, 6, 7, 8]);
    expect(board.turns.every(turn => turn.steadyCost === 1 && turn.path.length === 2)).toBe(true);
    expect(board.turns.find(turn => turn.landedCell === 3)!.landing.routeNote).not.toBeNull();
    expect(late.hero.resources.mana).toBe(ready.depth.hero.resources.mana - 7);
    expect(late.hero.gold).toBe(ready.depth.hero.gold + 1);
    expect(late.hero.resources.health).toBe(ready.depth.hero.resources.health);
    expect(late.quest).toEqual(ready.depth.quest);
    // As in explicitInnBoundary, first commit an ordinary turn so staging a
    // resource edge case does not rewrite the current lesson's creation facts.
    // This remains a labelled direct-command fixture, not natural zero-MP travel.
    const ordinary = stepDepth(ready.depth, { type: "wait" });
    const lessonBytes = canonicalStringify(ready.depth.usefulReply);
    expect(ordinary.tick).toBe(ready.depth.tick + 1);
    expect(canonicalStringify(ordinary.usefulReply)).toBe(lessonBytes);
    const emptyMana = reload({ ...ordinary, hero: { ...ordinary.hero,
      resources: { ...ordinary.hero.resources, mana: 0 } } });
    const zero = explicitRun(emptyMana, false);
    expect(zero.hero.resources.mana).toBe(0);
    expect(zero.bellExpedition!.turns.every(turn => turn.steadyCost === 0 && turn.landing.manaSpent === 0)).toBe(true);
    expect(zero.bellExpedition!.completion!.cell).toBe(8);
    expect(zero.companions).toEqual(ready.depth.companions);
    expect(canonicalStringify(zero.usefulReply)).toBe(lessonBytes);
  });

  it("rejects competing, stale, duplicate and foreign-instance commands atomically", () => {
    const admitted = beats[0]!.after.depth, board = admitted.bellExpedition!;
    const rolled = stepDepth(admitted, depthCommandCandidates(admitted)[0]!.command);
    for (const [state, command] of [
      [admitted, { type: "wait" }],
      [admitted, { type: "roll-bell", instanceId: "foreign", turn: 1 }],
      [admitted, { type: "roll-bell", instanceId: board.instanceId, turn: 2 }],
      [admitted, { type: "move-bell", instanceId: board.instanceId, turn: 1, pace: "stride", route: null }],
      [rolled, { type: "roll-bell", instanceId: board.instanceId, turn: 1 }],
      [rolled, { type: "move-bell", instanceId: board.instanceId, turn: 1, pace: "stride", route: 8 }],
    ] as [DepthState, DepthCommand][]) {
      const saved = canonicalStringify(state);
      expect(() => stepDepth(state, command)).toThrow();
      expect(canonicalStringify(state)).toBe(saved);
    }
  });

  it("does not interrupt a companion, unvisited town, unsafe hero, active quest settlement or existing board", () => {
    const before = ready.depth, witness = before.companions.former.at(-1)!;
    const { departure: _departure, ...identity } = witness;
    const invalid: DepthState[] = [
      { ...before, companions: { ...before.companions, former: [] } },
      { ...before, companions: { ...before.companions, active: [{ ...identity, phase: "arrived" }] } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 1 } } },
      { ...before, towns: { ...before.towns, [before.atlas.currentLocationId]: { ...before.towns[before.atlas.currentLocationId]!, visits: 0 } } },
      { ...before, atlas: { ...before.atlas, discoveredLocationIds: [] } },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" } },
      beats[0]!.after.depth, completed.depth,
    ];
    for (const state of invalid) expect(canStartBorrowedBell(state)).toBe(false);
  });

  it("rejects altered rolls, resource totals, sources, identity, paths and rewards on load", () => {
    const admitted = beats[0]!.after.depth, rolled = beats.find(beat => beat.after.depth.bellExpedition!.pendingRoll !== null)!.after.depth;
    const board = rolled.bellExpedition!, roll = board.pendingRoll!;
    for (const patch of [
      { heroId: "another-hero" }, { locationId: "foreign-town" }, { instanceId: "another-board" },
      { sourceCommandId: "invented-admission" }, { mana: board.mana + 1 }, { gold: board.gold + 1 },
      { pendingRoll: { ...roll, sourceCommandId: "invented-roll" } },
      { pendingRoll: { ...roll, value: roll.value === 1 ? 2 : 1 } }, { extraReceipt: roll },
    ]) {
      const forged = { ...rolled, bellExpedition: { ...board, ...patch } } as DepthState;
      expect(isValidCampaignBorrowedBell(forged)).toBe(false);
      expect(() => reload(forged)).toThrow("schema invariants");
    }
    const final = completed.depth.bellExpedition!;
    for (const patch of [
      { completion: { ...final.completion!, bonusGold: 99 } },
      { turns: final.turns.map((turn, index) => index === 0 ? { ...turn, path: [0, 8] } : turn) },
      { turns: final.turns.map((turn, index) => index === 0 ? { ...turn, sourceCommandId: "invented-move" } : turn) },
    ]) expect(() => reload({ ...completed.depth, bellExpedition: { ...final, ...patch } } as DepthState)).toThrow("schema invariants");
    expect(() => reload({ ...admitted, hero: { ...admitted.hero, gold: admitted.hero.gold + 1 } })).toThrow("schema invariants");
  });

  it("keeps one settled delivery receipt through later ordinary commands and cannot repeat its bonus", () => {
    const board = completed.depth.bellExpedition!;
    expect(board.completion!.bonusGold).toBe(board.completion!.outcome === "delivered" ? 3 : 0);
    expect(canStartBorrowedBell(completed.depth)).toBe(false);
    expect(depthCommandCandidates(completed.depth).every(entry => !["start-bell", "roll-bell", "move-bell"].includes(entry.command.type))).toBe(true);
    const startAgain: DepthCommand = { type: "start-bell", instanceId: board.instanceId, locationId: board.locationId };
    expect(() => stepDepth(completed.depth, startAgain)).toThrow();
    const continued = advanceWorld(completed);
    expect(continued.depth.bellExpedition).toEqual(board);
    expect(reload(continued.depth)).toEqual(continued.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(continued)))).toEqual(continued);
  });

  it("migrates released v30 saves to no board while rejecting malformed present fields", () => {
    const before = ready.depth, { bellExpedition: _board, ...prior } = before;
    const legacy = { ...prior, schemaVersion: 30 };
    const loaded = upgradeDepthState(legacy, before.seed, before.hero.id, before.hero.name);
    expect(loaded.schemaVersion).toBe(34);
    expect(loaded.bellExpedition).toBeNull();
    expect(loaded.hero).toEqual(before.hero);
    expect(loaded.reparteeCallback).toEqual(before.reparteeCallback);
    for (const bellExpedition of [undefined, {}, { schemaVersion: 2 }]) {
      expect(() => upgradeDepthState({ ...legacy, bellExpedition }, before.seed, before.hero.id, before.hero.name)).toThrow("schema invariants");
    }
  });

  it("keeps admission, dice and movement foreground so hidden catch-up never rolls or lands unseen", () => {
    for (const { before } of beats) {
      const request = { id: `bell:${before.tick}`, observedAtMs: 100_000 + before.tick, elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(before, request), next = campaignDirector(before).candidates[0]!.command;
      expect(stopped.tick).toBe(before.tick);
      expect(stopped.depth).toEqual(before.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(next.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
    }
  });

  it("keeps the board episode source-bound in the existing inbox without duplicate rewards", () => {
    let inbox = createSpectatorInbox(ready);
    for (const { before, after } of beats) inbox = observeSpectatorInbox(inbox, before, after, true);
    const board = completed.depth.bellExpedition!, source = completed.chronicle.at(-1)!;
    const episodes = inbox.items.filter(item => item.episodeId === `bell:${board.instanceId}`);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({ latestSourceId: source.id, status: "resolved", kind: "dungeon", title: "Borrowed Bell delivered" });
    expect(episodes[0]!.details).toContain(`Delivery bonus +${board.completion!.bonusGold} gold, once; no combat XP or unrelated quest credit.`);
    expect(episodes[0]!.details).toContain(`MP ${board.turns.at(-1)!.manaBefore} → ${board.mana} · gold ${board.turns.at(-1)!.goldBefore} → ${board.gold}`);
    const last = beats.at(-1)!;
    expect(observeSpectatorInbox(inbox, last.before, last.after, true)).toBe(inbox);
    const wrongCampaign = { ...completed, chronicle: [{ ...source, commandId: `campaign:someone-else:${boardSource(board)}` }] };
    const invalid = observeSpectatorInbox(createSpectatorInbox(last.before), last.before, wrongCampaign, true);
    expect(invalid.items.some(item => item.episodeId?.includes(board.instanceId))).toBe(false);
  });
});
