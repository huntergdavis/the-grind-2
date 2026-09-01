import { describe, expect, it } from "vitest";
import {
  activeCutawayMaximumMs,
  cancelCutawayController,
  completeActiveCutaway,
  createCutawayController,
  discardPendingCutawayPresentation,
  isCutawayBusy,
  offerCommittedCutaway,
} from "./cutaway-controller";
import {
  createCutawayCandidate,
  createCutawayRegistry,
  cutawayRegistry,
  type AnyCutawayCandidate,
  type CutawayRecipeV1,
  type CutawayStaticEnvelopeV1,
} from "./cutaway-registry";

function candidate(recipeKey: string, eventId: string): AnyCutawayCandidate {
  const envelope: CutawayStaticEnvelopeV1 = Object.freeze({
    schemaVersion: 1,
    eventId,
    tick: 9,
    location: "Verified place",
    headline: "Verified headline",
    action: "Verified action",
    consequence: "Verified consequence",
  });
  if (recipeKey === "trap-resolution@1") {
    return createCutawayCandidate(recipeKey, Object.freeze({
      schemaVersion: 1,
      eventId,
      tick: 9,
      commandId: "move:east",
      commandType: "move-dungeon",
      heroId: "hero:1",
      dungeonId: "dungeon:1",
      cellId: "dungeon:1:cell:1,1",
      trapKind: "tripwire",
      phaseBefore: "hidden",
      phaseAfter: "detected",
      stage: "detect",
      attribute: "intellect",
      skill: 12,
      roll: 2,
      total: 14,
      difficulty: 13,
      success: true,
      healthBefore: 40,
      damage: 0,
      healthAfter: 40,
      maxHealth: 40,
      dungeonCompletedBefore: false,
      dungeonCompletedAfter: false,
      completedExit: false,
      crossMazeBefore: 0,
      crossMazeAfter: 0,
      crossMazeDelta: 0,
    }), envelope);
  }
  if (recipeKey === "companion-farewell@1") {
    return createCutawayCandidate(recipeKey, Object.freeze({
      schemaVersion: 1,
      eventId,
      tick: 9,
      commandId: "campaign:depth:9:companion:farewell:resident:1",
      commandType: "farewell-companion",
      heroId: "hero:1",
      companionId: "resident:1",
      companionName: "Hale Vale",
      profession: "baker",
      disposition: "warm",
      originTownId: "town:1",
      originLocationId: "location:1",
      originName: "Amberwick",
      destinationId: "location:2",
      destinationName: "Mossmarket",
      purpose: "shared-road-oath",
      joinedTick: 2,
      departureTick: 9,
      outcome: "fulfilled",
      injury: "none",
      health: 22,
      maxHealth: 22,
      victories: 0,
      bond: 36,
    }), envelope);
  }
  return createCutawayCandidate(recipeKey, Object.freeze({ schemaVersion: 1, eventId, tick: 9 }), envelope);
}

function thirdRecipe(): CutawayRecipeV1 {
  return {
    ...cutawayRegistry.recipes[0]!,
    key: "test-third@1",
    domEquivalentId: "test-third",
    truthCueIds: ["test-third-fact"],
  };
}

describe("cutaway controller", () => {
  it("runs a synthetic third recipe through the same start and completion lifecycle", () => {
    const registry = createCutawayRegistry([...cutawayRegistry.recipes, thirdRecipe()]);
    const third = candidate("test-third@1", "event:third");
    const offered = offerCommittedCutaway(registry, createCutawayController(), third);
    expect(offered.action).toBe("start");
    expect(offered.state.generation).toBe(1);
    expect(isCutawayBusy(offered.state)).toBe(true);
    const completed = completeActiveCutaway(offered.state, third, offered.state.generation);
    expect(completed.action).toBe("completed");
    expect(isCutawayBusy(completed.state)).toBe(false);
    expect(activeCutawayMaximumMs(registry, offered.state)).toBe(11_000);
  });

  it("reads the active watchdog maximum from a synthetic recipe instead of a global constant", () => {
    const recipe: CutawayRecipeV1 = {
      ...thirdRecipe(),
      durationBudget: { targetMs: 1_000, maximumMs: 2_000, staticHoldMs: 500 },
    };
    const registry = createCutawayRegistry([...cutawayRegistry.recipes, recipe]);
    const offered = offerCommittedCutaway(registry, createCutawayController(), candidate("test-third@1", "event:budget"));
    expect(activeCutawayMaximumMs(registry, offered.state)).toBe(2_000);
    expect(activeCutawayMaximumMs(registry, createCutawayController())).toBeNull();
  });

  it("promotes mixed FIFO work under a new generation and ignores the old callback", () => {
    const trap = candidate("trap-resolution@1", "event:trap");
    const farewell = candidate("companion-farewell@1", "event:farewell");
    const started = offerCommittedCutaway(cutawayRegistry, createCutawayController(), trap);
    const queued = offerCommittedCutaway(cutawayRegistry, started.state, farewell);
    expect(queued.action).toBe("queued");
    const completed = completeActiveCutaway(queued.state, trap, 1);
    expect(completed.action).toBe("completed");
    expect(completed.state.generation).toBe(2);
    expect(completed.state.queue.active).toEqual(farewell);
    expect(completeActiveCutaway(completed.state, trap, 1)).toEqual({
      state: completed.state,
      action: "stale",
    });
  });

  it("invalidates callbacks atomically on cancel and can discard only pending spectacle", () => {
    const trap = candidate("trap-resolution@1", "event:trap");
    const farewell = candidate("companion-farewell@1", "event:farewell");
    const started = offerCommittedCutaway(cutawayRegistry, createCutawayController(), trap);
    const queued = offerCommittedCutaway(cutawayRegistry, started.state, farewell);
    const drained = discardPendingCutawayPresentation(queued.state);
    expect(drained.queue).toEqual({ active: trap, pending: null });
    const cancelled = cancelCutawayController(queued.state);
    expect(cancelled.generation).toBe(2);
    expect(cancelled.queue).toEqual({ active: null, pending: null });
    expect(completeActiveCutaway(cancelled, trap, 1)).toEqual({
      state: cancelled,
      action: "stale",
    });
  });
});
