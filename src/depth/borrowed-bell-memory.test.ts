import { beforeAll, describe, expect, it } from "vitest";
import { naturalBorrowedBellFixture } from "../../tests/borrowed-bell-fixtures";
import { planRoute } from "./atlas";
import {
  bellMoveCommandId, bellMoveOptions, bellRollCommandId, bellStartCommandId,
  moveBellExpedition, rollBellExpedition, startBellExpedition, type BellExpedition,
} from "./borrowed-bell";
import { borrowedBellInstanceId } from "./borrowed-bell-campaign";
import { bellDeliveryMemoryCommandId, bellDeliveryRestName, bellDeliveryRoadsideMemoryCommandId,
  isValidBellDeliveryMemory, selectBellDeliveryMemory, type BellDeliveryMemory } from "./borrowed-bell-memory";
import { selectCriticalRoadsideRest } from "./roadside-rest";
import { selectPaidInnRest } from "./town-rest";
import type { DepthState } from "./types";

let ready: DepthState;
const finishes: BellExpedition[] = [];

function restBoundary(board: BellExpedition): DepthState {
  // Pure source/receipt boundary, not a claim about the next autonomous rest.
  // The real town, inn, hero and former companion come from the earned fixture.
  return { ...ready, bellMemory: null, tick: board.completion!.tick + 1, bellExpedition: board,
    hero: { ...ready.hero, gold: 20, resources: { ...ready.hero.resources,
      health: ready.hero.resources.maxHealth - 1, mana: 0 } } };
}

function commit(state: DepthState, memory = selectBellDeliveryMemory(state)!): DepthState {
  return { ...state, tick: memory.tick, bellMemory: memory,
    hero: { ...state.hero, gold: memory.rest.goldAfter,
      resources: { ...state.hero.resources, health: memory.rest.healthAfter, mana: memory.rest.manaAfter } } };
}

function memoryOf(kind: BellDeliveryMemory["kind"]): { state: DepthState; memory: BellDeliveryMemory } {
  for (const board of finishes) {
    const state = restBoundary(board), memory = selectBellDeliveryMemory(state);
    if (memory?.kind === kind) return { state, memory };
  }
  throw new Error(`The one fixed board stream has no ${kind} memory fixture`);
}

describe("one private Borrowed Bell memory at an actual paid rest", () => {
  beforeAll(() => {
    ready = naturalBorrowedBellFixture().depth;
    const instanceId = borrowedBellInstanceId(ready.hero.id, ready.atlas.currentLocationId), tick = ready.tick + 1;
    const first = startBellExpedition({ instanceId, heroId: ready.hero.id, locationId: ready.atlas.currentLocationId,
      sourceCommandId: bellStartCommandId(tick, instanceId, ready.atlas.currentLocationId), tick, mana: 12, gold: 20 });
    let nodes = 0;
    function visit(board: BellExpedition): void {
      if (++nodes > 2_000) throw new Error("Bounded one-board fixture exceeded its legal-path cap");
      if (board.completion !== null) { finishes.push(board); return; }
      const rollTick = (board.turns.at(-1)?.tick ?? board.startedTick) + 1;
      const rolled = rollBellExpedition(board, { seed: ready.seed, tick: rollTick,
        sourceCommandId: bellRollCommandId(rollTick, instanceId, board.turn) });
      for (const option of bellMoveOptions(rolled)) {
        const tick = rollTick + 1;
        visit(moveBellExpedition(rolled, option, { seed: ready.seed, tick,
          sourceCommandId: bellMoveCommandId(tick, instanceId, rolled.turn, option.pace, option.route) }));
      }
    }
    visit(first);
  });

  it("decorates only the existing legal paid rest with exact completion, move and wait sources", () => {
    const { state, memory } = memoryOf("delivery"), before = JSON.stringify(state);
    const board = state.bellExpedition!, completion = board.completion!, move = board.turns.at(-1)!;
    expect(memory).toMatchObject({ schemaVersion: 1, rulesVersion: "bell-delivery-memory-v1",
      instanceId: board.instanceId, heroId: state.hero.id, completedTick: completion.tick,
      completionSourceCommandId: completion.sourceCommandId, evidenceSourceCommandId: move.sourceCommandId,
      evidenceTick: move.tick, evidenceTurn: move.turn, tick: state.tick + 1, kind: "delivery" });
    expect(memory.rest).toEqual({ kind: "inn", ...selectPaidInnRest(state)! });
    if (memory.rest.kind !== "inn") throw new Error("Expected the existing paid inn rest");
    expect(memory.sourceCommandId).toBe(bellDeliveryMemoryCommandId(memory.tick, memory.rest.locationId, memory.rest.innId));
    expect(memory.line).toContain("before the doors closed");
    expect(JSON.stringify(state)).toBe(before);
    expect(memory).not.toHaveProperty("witnessId");
    expect(memory).not.toHaveProperty("reward");
    expect(isValidBellDeliveryMemory(commit(state))).toBe(true);
  });

  it("recalls actual late, stamped, inspected and precision choices without turning passage into experience", () => {
    const observed = new Set<BellDeliveryMemory["kind"]>();
    for (const board of finishes) {
      const memory = selectBellDeliveryMemory(restBoundary(board))!;
      const move = board.turns.find((entry) => entry.sourceCommandId === memory.evidenceSourceCommandId)!;
      observed.add(memory.kind);
      if (memory.kind === "late") {
        expect(board.completion!.outcome).toBe("late");
        expect(memory.line).toContain("after the procession had gone");
      } else if (memory.kind === "parcel") {
        expect(move.landing).toMatchObject({ kind: "parcel", goldGranted: 1 });
        expect(move.landedCell).toBe(6);
        expect(memory.line).toContain(board.completion!.outcome === "late" ? "The bell was late" : "I made the deadline");
      } else if (memory.kind === "inspection") {
        expect(move.landing.kind).toBe("inspection");
        expect(move.landedCell).toBe(3);
      } else if (memory.kind === "precision") expect(move).toMatchObject({ pace: "steady", steadyCost: 1 });
      if (!board.landedCells.includes(6)) expect(memory.line).not.toContain("MISCELLANEOUS PARCEL");
      if (!board.landedCells.includes(3)) expect(memory.line).not.toContain("visiting hat");
      expect(isValidBellDeliveryMemory(commit(restBoundary(board), memory))).toBe(true);
    }
    expect(observed).toEqual(new Set(["delivery", "precision", "parcel", "inspection", "late"]));
  });

  it("requires a completed source, an affordable actual inn, a safe solo hero and no earlier memory", () => {
    const { state, memory } = memoryOf("delivery"), resources = state.hero.resources;
    const variants: DepthState[] = [
      { ...state, bellExpedition: null },
      { ...state, bellMemory: memory },
      { ...state, tick: state.bellExpedition!.completion!.tick - 1 },
      { ...state, hero: { ...state.hero, gold: 4 } },
      { ...state, hero: { ...state.hero, resources: { ...resources, mana: resources.maxMana } } },
      { ...state, hero: { ...state.hero, resources: { ...resources, health: 0 } } },
      { ...state, towns: {} },
      { ...state, atlas: { ...state.atlas, discoveredLocationIds: [] } },
      { ...state, companions: { ...state.companions, active: [state.companions.former[0] as never] } },
      { ...state, repartee: { ...state.repartee, active: {} as never } },
      { ...state, combat: {} as never },
      { ...state, counterDuel: {} as never },
      { ...state, quest: { ...state.quest, status: "ready-to-fulfill" } },
    ];
    for (const variant of variants) expect(selectBellDeliveryMemory(variant)).toBeNull();
  });

  it("keeps exact rest payment and recovery, without awarding another delivery bonus", () => {
    const { state, memory } = memoryOf("parcel"), after = commit(state, memory);
    expect(after.hero.gold).toBe(state.hero.gold - 5);
    expect(after.hero.resources.health).toBe(state.hero.resources.maxHealth);
    expect(after.hero.resources.mana).toBe(state.hero.resources.maxMana);
    expect(after.hero.experience).toBe(state.hero.experience);
    expect(after.bellExpedition).toBe(state.bellExpedition);
    expect(after.companions).toBe(state.companions);
    expect(after.quest).toBe(state.quest);
    expect(selectBellDeliveryMemory(after)).toBeNull();
    for (const changed of [
      { ...after, hero: { ...after.hero, gold: after.hero.gold + 1 } },
      { ...after, hero: { ...after.hero, resources: { ...after.hero.resources, mana: after.hero.resources.mana - 1 } } },
      { ...after, hero: { ...after.hero, resources: { ...after.hero.resources, health: after.hero.resources.health - 1 } } },
    ]) expect(isValidBellDeliveryMemory(changed)).toBe(false);
  });

  it("round-trips exactly, rejects fabricated sources or rest receipts, and never rewrites earlier private history", () => {
    const { state, memory } = memoryOf("delivery"), after = commit(state, memory);
    expect(isValidBellDeliveryMemory(JSON.parse(JSON.stringify(after)))).toBe(true);
    const patches: unknown[] = [
      undefined, {}, { ...memory, schemaVersion: 2 }, { ...memory, rulesVersion: "unknown" },
      { ...memory, instanceId: "foreign" }, { ...memory, heroId: "foreign" },
      { ...memory, completionSourceCommandId: "foreign" }, { ...memory, completedTick: memory.completedTick - 1 },
      { ...memory, evidenceSourceCommandId: "foreign" }, { ...memory, evidenceTurn: 99 },
      { ...memory, sourceCommandId: "free-wait" }, { ...memory, tick: memory.completedTick },
      { ...memory, line: "My absent friend applauded." }, { ...memory, extraReward: 3 },
      { ...memory, rest: { ...memory.rest, goldSpent: 0 } },
      { ...memory, rest: { ...memory.rest, goldBefore: 21 } },
      { ...memory, rest: { ...memory.rest, innId: "invented-inn" } },
      { ...memory, rest: { ...memory.rest, innName: "Invented Inn" } },
    ];
    for (const value of patches) expect(isValidBellDeliveryMemory({ ...after, bellMemory: value as never })).toBe(false);
    const later: DepthState = { ...after, tick: after.tick + 10, quest: { ...after.quest, status: "fulfilled" },
      hero: { ...after.hero, gold: 0, resources: { ...after.hero.resources, health: 1, mana: 0,
        maxHealth: after.hero.resources.maxHealth + 8, maxMana: after.hero.resources.maxMana + 4 } },
      atlas: { ...after.atlas, currentLocationId: after.atlas.locations.find((entry) => entry.id !== memory.rest.locationId)!.id } };
    expect(isValidBellDeliveryMemory(later)).toBe(true);
    expect(later.bellMemory).toEqual(memory);
    const former = after.companions.former[0]!;
    expect(isValidBellDeliveryMemory({ ...later, companions: { ...later.companions,
      active: [{ ...former, joinedTick: memory.tick + 1 } as never] } })).toBe(true);
    expect(isValidBellDeliveryMemory({ ...later, companions: { ...later.companions,
      active: [{ ...former, joinedTick: memory.tick - 1 } as never] } })).toBe(false);
  });

  it("recalls once during an already-required solo roadside recovery, preserving its real unresolved route", () => {
    const { state } = memoryOf("delivery");
    // A small explicit route/resource boundary; campaign/browser checks separately earn the route and stage only HP.
    const candidates = state.atlas.locations.filter((location) => location.id !== state.atlas.currentLocationId)
      .map((location): DepthState => ({ ...state, atlas: planRoute(state.atlas, location.id),
        hero: { ...state.hero, resources: { ...state.hero.resources, health: Math.floor(state.hero.resources.maxHealth / 4) } } }));
    const before = candidates.find((candidate) => selectCriticalRoadsideRest(candidate) !== null)!;
    expect(before).toBeDefined();
    const plan = selectCriticalRoadsideRest(before)!, memory = selectBellDeliveryMemory(before)!;
    expect(memory.rest).toEqual({ kind: "roadside", ...plan });
    expect(memory.sourceCommandId).toBe(bellDeliveryRoadsideMemoryCommandId(before.tick + 1));
    expect(bellDeliveryRestName(memory.rest)).toBe("Roadside camp");
    expect(memory.rest).not.toHaveProperty("innId");
    const after = commit(before, memory);
    expect(after.atlas.route).toBe(before.atlas.route);
    expect(after.hero.gold).toBe(before.hero.gold);
    expect(after.hero.experience).toBe(before.hero.experience);
    expect(after.hero.resources.health).toBe(before.hero.resources.maxHealth);
    expect(after.hero.resources.mana).toBe(before.hero.resources.maxMana);
    expect(isValidBellDeliveryMemory(after)).toBe(true);
    expect(isValidBellDeliveryMemory(JSON.parse(JSON.stringify(after)))).toBe(true);
    expect(selectBellDeliveryMemory(after)).toBeNull();
    if (memory.rest.kind !== "roadside") throw new Error("Expected a roadside route receipt");
    const route = memory.rest.route;
    for (const rest of [
      { ...memory.rest, encounterId: "invented-encounter" },
      { ...memory.rest, route: { ...route, totalDistance: route.totalDistance + 1 } },
      { ...memory.rest, route: { ...route, path: [route.path[0], "invented-place"] } },
      { ...memory.rest, route: { ...route, extra: true } },
      { ...memory.rest, goldSpent: 1 }, { ...memory.rest, goldAfter: memory.rest.goldAfter + 1 },
      { ...memory.rest, healthBefore: memory.rest.healthAfter },
    ]) expect(isValidBellDeliveryMemory({ ...after, bellMemory: { ...memory, rest } as never })).toBe(false);
    expect(isValidBellDeliveryMemory({ ...after, atlas: { ...after.atlas, route: null } })).toBe(false);
    const later = { ...after, tick: after.tick + 10, atlas: { ...after.atlas, route: null },
      completedCombats: [...after.completedCombats, { id: memory.rest.encounterId } as never],
      hero: { ...after.hero, resources: { ...after.hero.resources, health: 1, mana: 0,
        maxHealth: after.hero.resources.maxHealth + 5, maxMana: after.hero.resources.maxMana + 3 } } };
    expect(isValidBellDeliveryMemory(later)).toBe(true);
    expect(later.bellMemory).toEqual(memory);
  });
});
