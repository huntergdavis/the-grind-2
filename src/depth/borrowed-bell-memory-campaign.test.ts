import { beforeAll, describe, expect, it } from "vitest";
import { naturalBorrowedBellFixture } from "../../tests/borrowed-bell-fixtures";
import { naturalBorrowedBellMemoryFixture } from "../../tests/borrowed-bell-memory-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { isValidBellDeliveryMemory, selectBellDeliveryMemory } from "./borrowed-bell-memory";
import { selectCriticalRoadsideRest } from "./roadside-rest";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { selectPaidInnRest } from "./town-rest";
import type { DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}

/** Explicit low-mana service boundary, NOT a natural inn journey. Board history
 * is earned normally; one legal ordinary wait moves beyond its completion tick
 * before this test sets the low-mana boundary for the existing paid service.
 */
function explicitInnBoundary(): DepthState {
  let world = naturalBorrowedBellFixture();
  for (let beat = 0; beat < 17; beat++) {
    world = advanceWorld(world);
    if (world.depth.bellExpedition?.completion !== null && world.depth.bellExpedition !== null) break;
  }
  expect(world.depth.bellExpedition!.completion).not.toBeNull();
  const restedTick = stepDepth(world.depth, { type: "wait" });
  return reload({ ...restedTick, hero: { ...restedTick.hero, resources: { ...restedTick.hero.resources,
    health: restedTick.hero.resources.maxHealth - 1, mana: Math.floor(restedTick.hero.resources.maxMana / 3) } } });
}

describe("one delivery memory at an existing real rest", () => {
  let ready: WorldState, after: WorldState;
  beforeAll(() => { ready = naturalBorrowedBellMemoryFixture(); after = advanceWorld(ready); });

  it("adds one private memory to the actual T253 roadside recovery without adding costs, XP or quest credit", () => {
    const before = ready.depth, memory = after.depth.bellMemory!, plan = selectCriticalRoadsideRest(before)!;
    expect(ready.tick).toBe(252);
    expect(after.tick).toBe(253);
    expect(selectPaidInnRest(before)).toBeNull();
    expect(before.companions.active).toEqual([]);
    expect(before.hero.resources).toMatchObject({ health: 11, maxHealth: 42, mana: 28, maxMana: 28 });
    expect(memory).toEqual(selectBellDeliveryMemory(before));
    expect(memory).toMatchObject({ schemaVersion: 1, rulesVersion: "bell-delivery-memory-v1", kind: "delivery",
      instanceId: before.bellExpedition!.instanceId, heroId: before.hero.id,
      completedTick: 49, completionSourceCommandId: before.bellExpedition!.completion!.sourceCommandId,
      evidenceSourceCommandId: before.bellExpedition!.turns.at(-1)!.sourceCommandId, evidenceTick: 49, evidenceTurn: 4,
      sourceCommandId: "depth:253:critical-roadside-recovery", tick: 253, rest: { kind: "roadside", ...plan } });
    expect(memory.line).toContain("before the doors closed");
    expect(after.depth.hero).toEqual({ ...before.hero, resources: { ...before.hero.resources,
      health: plan.healthAfter, mana: plan.manaAfter } });
    expect(after.hero.experience).toBe(ready.hero.experience);
    expect(after.hero.gold).toBe(ready.hero.gold);
    expect(after.depth.hero.gold).toBe(20);
    expect(after.depth.hero.experience).toBe(486);
    expect(after.depth.atlas.route).toEqual(before.atlas.route);
    expect(after.depth.bellExpedition).toEqual(before.bellExpedition);
    expect(after.depth.quest).toEqual(before.quest);
    expect(after.depth.completedQuests).toEqual(before.completedQuests);
    expect(after.depth.pendingQuestReward).toEqual(before.pendingQuestReward);
    expect(after.depth.companions).toEqual(before.companions);
    expect(after.depth.reparteeWitness).toEqual(before.reparteeWitness);
    expect(after.chronicle.at(-1)).toMatchObject({ commandType: "wait", mode: "chronicle", tick: 253,
      commandId: `${after.campaignId}:${memory.sourceCommandId}` });
    expect(after.chronicle.at(-1)!.action).toContain(memory.line);
    expect(reload(after.depth)).toEqual(after.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(after)))).toEqual(after);
  });

  it("preserves the same waiting encounter and cannot repeat the memory or reward at the next normal step", () => {
    const memory = after.depth.bellMemory!, board = after.depth.bellExpedition!;
    expect(selectBellDeliveryMemory(after.depth)).toBeNull();
    expect(campaignDirector(after).candidates.map(candidate => candidate.command)).toEqual([
      { type: "start-combat", encounterId: "encounter:route:location:9>location:1", enemyCount: 2 },
    ]);
    const continued = advanceWorld(after);
    expect(continued.chronicle.at(-1)?.commandType).toBe("start-combat");
    expect(continued.depth.combat?.id).toBe("encounter:route:location:9>location:1");
    expect(continued.depth.bellMemory).toEqual(memory);
    expect(continued.depth.bellExpedition).toEqual(board);
    expect(continued.depth.hero.gold).toBe(after.depth.hero.gold);
    // The memory grants no XP; the following ordinary combat entry still grants its existing eight.
    expect(continued.depth.hero.experience).toBe(after.depth.hero.experience + 8);
    expect(continued.depth.atlas.route).toEqual(after.depth.atlas.route);
    expect(isValidBellDeliveryMemory(continued.depth)).toBe(true);
    expect(reload(continued.depth)).toEqual(continued.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(continued)))).toEqual(continued);
  });

  it("also decorates the existing five-gold inn wait at an explicitly staged low-mana boundary", () => {
    const before = explicitInnBoundary(), plan = selectPaidInnRest(before)!, expected = selectBellDeliveryMemory(before)!;
    expect(plan).not.toBeNull();
    expect(expected.rest).toEqual({ kind: "inn", ...plan });
    expect(depthCommandCandidates(before)[0]!.command).toEqual({ type: "wait" });
    const rested = stepDepth(before, { type: "wait" });
    expect(rested.bellMemory).toEqual(expected);
    expect(rested.hero).toEqual({ ...before.hero, gold: before.hero.gold - 5,
      resources: { ...before.hero.resources, health: before.hero.resources.maxHealth, mana: before.hero.resources.maxMana } });
    expect(rested.quest).toEqual(before.quest);
    expect(rested.companions).toEqual(before.companions);
    expect(rested.bellExpedition).toEqual(before.bellExpedition);
    expect(rested.towns).toEqual(before.towns);
    expect(selectPaidInnRest(rested)).toBeNull();
    expect(selectBellDeliveryMemory(rested)).toBeNull();
    expect(reload(rested)).toEqual(rested);
  });

  it("does not invent a rest, permit a fallen hero, interrupt encounters or claim an absent companion heard the thought", () => {
    const before = ready.depth, former = before.companions.former.at(-1)!;
    const { departure: _departure, ...companion } = former;
    for (const state of [
      { ...before, atlas: { ...before.atlas, route: null } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: before.hero.resources.maxHealth } } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 0 } } },
      { ...before, companions: { ...before.companions, active: [{ ...companion, phase: "travelling" }] } },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" } },
      { ...before, combat: {} }, { ...before, counterDuel: {} },
      { ...before, bellExpedition: null },
    ] as DepthState[]) expect(selectBellDeliveryMemory(state)).toBeNull();
    const ordinary = stepDepth(after.depth, { type: "wait" });
    expect(ordinary.bellMemory).toEqual(after.depth.bellMemory);
    expect(ordinary.hero).toEqual(after.depth.hero);
  });

  it("rejects forged remembered evidence, command sources, rest amounts, routes and duplicate fields on load", () => {
    const original = after.depth, memory = original.bellMemory!;
    for (const patch of [
      { instanceId: "another-board" }, { heroId: "another-hero" }, { completedTick: memory.completedTick + 1 },
      { completionSourceCommandId: "invented-completion" }, { evidenceSourceCommandId: "invented-landing" },
      { evidenceTick: memory.evidenceTick + 1 }, { evidenceTurn: 99 }, { sourceCommandId: "invented-rest" },
      { line: "A companion admired a prize never won." }, { kind: "parcel" }, { tick: original.tick + 1 }, { duplicate: memory },
      { rest: { ...memory.rest, goldSpent: 5 } }, { rest: { ...memory.rest, goldAfter: memory.rest.goldAfter + 1 } },
      { rest: { ...memory.rest, healthAfter: memory.rest.healthAfter - 1 } },
      { rest: { ...memory.rest, locationId: "invented-refuge" } },
      { rest: { ...memory.rest, encounterId: "invented-road" } },
      { rest: { ...memory.rest, route: { ...ready.depth.atlas.route!, path: ["missing-location"] } } },
    ]) {
      const forged = { ...original, bellMemory: { ...memory, ...patch } } as DepthState;
      expect(isValidBellDeliveryMemory(forged)).toBe(false);
      expect(() => reload(forged)).toThrow("schema invariants");
    }
  });

  it("requires exact current recovery balances and route while allowing later legitimate combat history", () => {
    const original = after.depth;
    for (const state of [
      { ...original, hero: { ...original.hero, gold: original.hero.gold + 1 } },
      { ...original, hero: { ...original.hero, resources: { ...original.hero.resources, health: original.hero.resources.health - 1 } } },
      { ...original, hero: { ...original.hero, resources: { ...original.hero.resources, mana: original.hero.resources.mana - 1 } } },
      { ...original, atlas: { ...original.atlas, route: null } },
    ] as DepthState[]) {
      expect(isValidBellDeliveryMemory(state)).toBe(false);
      expect(() => reload(state)).toThrow("schema invariants");
    }
    const later = advanceWorld(advanceWorld(after));
    expect(later.tick).toBeGreaterThan(original.tick);
    expect(later.depth.bellMemory).toEqual(original.bellMemory);
    expect(reload(later.depth)).toEqual(later.depth);
  });

  it("migrates released v31 saves to no invented memory while rejecting malformed present receipts", () => {
    const before = ready.depth, { bellMemory: _memory, ...prior } = before, legacy = { ...prior, schemaVersion: 31 };
    const loaded = upgradeDepthState(legacy, before.seed, before.hero.id, before.hero.name);
    expect(loaded.schemaVersion).toBe(33);
    expect(loaded.bellMemory).toBeNull();
    expect(loaded.bellExpedition).toEqual(before.bellExpedition);
    expect(loaded.hero).toEqual(before.hero);
    for (const bellMemory of [undefined, {}, { schemaVersion: 2 }]) {
      expect(() => upgradeDepthState({ ...legacy, bellMemory }, before.seed, before.hero.id, before.hero.name)).toThrow("schema invariants");
    }
  });

  it("stops hidden catch-up before the one foreground memory instead of silently recovering past it", () => {
    expect(campaignDirector(ready).mode).toBe("chronicle");
    const request = { id: "bell-memory:roadside", observedAtMs: 100_000, elapsedMs: 48_000, requestedTicks: 10 };
    const stopped = catchUpWorld(ready, request);
    expect(stopped.tick).toBe(ready.tick);
    expect(stopped.depth).toEqual(ready.depth);
    expect(stopped.pendingAttention.at(-1)?.commandType).toBe("wait");
    expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
    expect(catchUpWorld(stopped, request)).toBe(stopped);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
  });
});
