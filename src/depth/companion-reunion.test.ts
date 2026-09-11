import { beforeAll, describe, expect, it } from "vitest";
import { naturalCompanionReunionArrivalFixture, naturalCompanionReunionFixture } from "../../tests/companion-reunion-fixtures";
import { naturalReparteeMemoryFixture } from "../../tests/repartee-memory-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { advanceRoute } from "./atlas";
import { addActiveCompanion, selectSharedRoadCompanion } from "./companion";
import { captureCompanionReunionArrival, companionReunionCommandId, companionReunionLines, isValidCampaignCompanionReunion, selectCompanionReturn, selectCompanionReunion } from "./companion-reunion";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { selectPaidInnRest } from "./town-rest";
import type { DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}
function unchangedFacts(state: DepthState) {
  const { tick: _tick, log: _log, companionReunion: _reunion, ...facts } = state;
  return facts;
}

describe("one earned return to a fulfilled companion's farewell town", () => {
  let beforeArrival: WorldState, ready: WorldState, completed: WorldState;
  beforeAll(() => {
    beforeArrival = naturalCompanionReunionArrivalFixture();
    ready = naturalCompanionReunionFixture();
    completed = advanceWorld(ready);
  });

  it("captures only the actual full-route travel arrival, not staying after farewell", () => {
    const before = beforeArrival.depth, arrivalWorld = advanceWorld(beforeArrival), arrived = arrivalWorld.depth;
    const command = campaignDirector(beforeArrival).candidates[0]!.command;
    expect(command.type).toBe("travel");
    if (command.type !== "travel") throw new Error("Expected an actual travel command");
    expect(before.companionReunion).toBeNull();
    const receipt = arrived.companionReunion!, former = arrived.companions.former.find((entry) => entry.identity.residentId === receipt.residentId)!;
    expect(receipt).toMatchObject({ schemaVersion: 1, rulesVersion: "companion-reunion-v1", heroId: before.hero.id,
      residentId: former.identity.residentId, companionName: former.identity.name, joinedTick: former.joinedTick,
      departureTick: former.departure.tick, locationId: former.departure.locationId,
      presenceRule: "retained-at-farewell-v1", sharedVictories: former.victories, completed: null });
    expect(receipt.locationId).toBe(former.destination.locationId);
    expect(receipt.arrival).toEqual({ sourceCommandId: `depth:${arrived.tick}:travel:${command.distance}`,
      tick: arrived.tick, sourceLocationId: before.atlas.currentLocationId, route: before.atlas.route, distance: command.distance });
    expect(receipt.arrival.route).not.toBe(before.atlas.route);
    expect(receipt.arrival.tick).toBeGreaterThan(former.departure.tick);
    expect(receipt.arrival.sourceLocationId).not.toBe(receipt.locationId);
    expect(arrived.atlas.route).toBeNull();
    expect(arrived.companions).toEqual(before.companions);
    expect(arrivalWorld.chronicle.at(-1)).toMatchObject({ commandType: "travel", tick: receipt.arrival.tick,
      commandId: `${arrivalWorld.campaignId}:${receipt.arrival.sourceCommandId}` });
    expect(reload(arrived)).toEqual(arrived);
    const farewell = advanceWorld(advanceWorld(naturalReparteeMemoryFixture())).depth;
    expect(farewell.companionReunion).toBeNull();
    expect(selectCompanionReturn(farewell)).toBeNull();
    expect(captureCompanionReunionArrival(farewell, { ...farewell, tick: farewell.tick + 1 }, { type: "travel", distance: 1 })).toBeNull();
    expect(captureCompanionReunionArrival(before, { ...before, tick: before.tick + 1,
      atlas: advanceRoute(before.atlas, 1) }, { type: "travel", distance: 1 })).toBeNull();
  });

  it("speaks once from the retained oath and changes no resources, victories, bond, regard or old stories", () => {
    const receipt = completed.depth.companionReunion!, command = campaignDirector(ready).candidates[0]!.command;
    expect(command).toEqual({ type: "reunite-companion", residentId: receipt.residentId,
      joinedTick: receipt.joinedTick, arrivalTick: receipt.arrival.tick });
    if (command.type !== "reunite-companion") throw new Error("Expected reunion command");
    expect(receipt.completed).toEqual({ sourceCommandId: companionReunionCommandId(completed.tick, command),
      tick: completed.tick, ...companionReunionLines(receipt.sharedVictories) });
    expect(unchangedFacts(completed.depth)).toEqual(unchangedFacts(ready.depth));
    expect(completed.hero).toEqual(ready.hero);
    expect(completed.scene).toMatchObject({ mode: "chronicle",
      location: ready.depth.atlas.locations.find((entry) => entry.id === receipt.locationId)!.name });
    expect(completed.chronicle.at(-1)).toMatchObject({ commandType: "reunite-companion", tick: completed.tick,
      commandId: `${completed.campaignId}:${receipt.completed!.sourceCommandId}` });
    expect(reload(completed.depth)).toEqual(completed.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(completed)))).toEqual(completed);
    expect(selectCompanionReunion(completed.depth)).toBeNull();
    expect(selectCompanionReturn(completed.depth)).toBeNull();
    expect(() => stepDepth(completed.depth, command)).toThrow();
    expect(campaignDirector(completed).candidates.every((entry) => entry.command.type !== "reunite-companion")).toBe(true);
    expect(advanceWorld(completed).depth.companionReunion).toEqual(receipt);
  });

  it("does not require the optional books, public challenge, Bell delivery, or its memory", () => {
    // Isolated dependency boundary, not another claimed natural chronology.
    const independent = { ...ready.depth, usefulReply: null, roomChallenge: null, bellExpedition: null, bellMemory: null };
    expect(isValidCampaignCompanionReunion(independent)).toBe(true);
    expect(selectCompanionReunion(independent)).toEqual(selectCompanionReunion(ready.depth));
    expect(depthCommandCandidates(independent)[0]!.command.type).toBe("reunite-companion");
    expect(companionReunionLines(0).companionLine).toContain("kept your word");
    expect(companionReunionLines(1).companionLine).toBe("One shared victory. I am glad this time we can simply say hello.");
    expect(companionReunionLines(4).companionLine).toBe("4 victories together. I am glad this time we can simply say hello.");
  });

  it("keeps existing paid recovery and defeat recovery ahead of the pending greeting", () => {
    // Explicit resource boundary after actual travel; not a natural low-mana claim.
    const lowMana = reload({ ...ready.depth, hero: { ...ready.depth.hero, gold: Math.max(5, ready.depth.hero.gold),
      resources: { ...ready.depth.hero.resources, health: ready.depth.hero.resources.maxHealth, mana: 0 } } });
    expect(selectPaidInnRest(lowMana)).not.toBeNull();
    expect(selectCompanionReunion(lowMana)).toBeNull();
    expect(depthCommandCandidates(lowMana)[0]!.command).toEqual({ type: "wait" });
    const rested = stepDepth(lowMana, { type: "wait" });
    expect(rested.companionReunion).toEqual(lowMana.companionReunion);
    expect(depthCommandCandidates(rested)[0]!.command.type).toBe("reunite-companion");
    const defeated = { ...ready.depth, hero: { ...ready.depth.hero,
      resources: { ...ready.depth.hero.resources, health: 0 } } };
    expect(selectCompanionReunion(defeated)).toBeNull();
    expect(depthCommandCandidates(defeated)[0]!.command).toEqual({ type: "wait" });
    for (const status of ["ready-to-fulfill", "fulfilled"] as const) {
      expect(selectCompanionReunion({ ...ready.depth, quest: { ...ready.depth.quest, status } })).toBeNull();
    }
  });

  it("rejects forged sources, routes, participants, timestamps, dialogue and premature completion", () => {
    const receipt = completed.depth.companionReunion!, arrival = receipt.arrival, result = receipt.completed!;
    const malformed = [undefined, {}, { ...receipt, rulesVersion: "companion-reunion-v2" }, { ...receipt, extra: true },
      { ...receipt, presenceRule: "went-home-offscreen" }, { ...receipt, heroId: "foreign-hero" },
      { ...receipt, residentId: "absent-companion" }, { ...receipt, joinedTick: receipt.joinedTick + 1 },
      { ...receipt, companionName: "Someone else" }, { ...receipt, sharedVictories: receipt.sharedVictories + 1 },
      { ...receipt, arrival: { ...arrival, sourceCommandId: "fabricated-return" } },
      { ...receipt, arrival: { ...arrival, tick: receipt.departureTick } },
      { ...receipt, arrival: { ...arrival, sourceLocationId: receipt.locationId } },
      { ...receipt, arrival: { ...arrival, distance: 0 } },
      { ...receipt, arrival: { ...arrival, route: { ...arrival.route, distanceTravelled: arrival.route.distanceTravelled + 1 } } },
      { ...receipt, arrival: { ...arrival, route: { ...arrival.route, path: [arrival.sourceLocationId, arrival.sourceLocationId, receipt.locationId] } } },
      { ...receipt, completed: { ...result, sourceCommandId: "foreign-hello" } },
      { ...receipt, completed: { ...result, tick: arrival.tick } },
      { ...receipt, completed: { ...result, heroLine: "You saw my solo delivery." } },
      { ...receipt, completed: { ...result, companionLine: "Take another reward." } },
    ];
    for (const invalid of malformed) {
      const state = { ...completed.depth, companionReunion: invalid } as unknown as DepthState;
      expect(isValidCampaignCompanionReunion(state)).toBe(false);
      expect(() => reload(state)).toThrow();
    }
    const command = campaignDirector(ready).candidates[0]!.command;
    if (command.type !== "reunite-companion") throw new Error("Expected reunion command");
    for (const foreign of [{ ...command, residentId: "foreign" }, { ...command, joinedTick: command.joinedTick + 1 },
      { ...command, arrivalTick: command.arrivalTick - 1 }]) expect(() => stepDepth(ready.depth, foreign)).toThrow();
    expect(() => stepDepth(beforeArrival.depth, command)).toThrow();
    expect(() => stepDepth(ready.depth, { type: "plan-route", destinationId: arrival.sourceLocationId })).toThrow();
  });

  it("migrates Depth34 to no invented arrival while preserving and validating present history", () => {
    const { companionReunion: _reunion, ...old } = beforeArrival.depth;
    expect(reload({ ...old, schemaVersion: 34 } as unknown as DepthState)).toEqual({ ...beforeArrival.depth, schemaVersion: 35, companionReunion: null });
    for (const invalid of [undefined, {}, { schemaVersion: 2 }]) {
      // An explicitly present undefined property must reach the upgrader;
      // JSON serialization would first turn it into an absent legacy field.
      expect(() => upgradeDepthState({ ...old, schemaVersion: 34, companionReunion: invalid },
        beforeArrival.seed, beforeArrival.hero.id, beforeArrival.hero.name)).toThrow();
    }
    expect(reload({ ...completed.depth, schemaVersion: 34 } as unknown as DepthState)).toEqual(completed.depth);
  });

  it("retains the greeting after later travel and an actual different resident joins the party", () => {
    const receipt = completed.depth.companionReunion!;
    const ordinary = stepDepth(completed.depth, { type: "wait" });
    const routed = stepDepth(ordinary, { type: "plan-route", destinationId: receipt.arrival.sourceLocationId });
    expect(isValidCampaignCompanionReunion(routed)).toBe(true);
    expect(reload(routed).companionReunion).toEqual(receipt);
    const town = ordinary.towns[receipt.locationId]!;
    const companion = selectSharedRoadCompanion({ seed: ordinary.seed, atlas: ordinary.atlas, town,
      roster: ordinary.companions, joinedTick: ordinary.tick + 1, heroLevel: ordinary.hero.level });
    expect(companion).not.toBeNull();
    expect(companion!.identity.residentId).not.toBe(receipt.residentId);
    const later = { ...ordinary, tick: ordinary.tick + 1, companions: addActiveCompanion(ordinary.companions, companion!) };
    expect(isValidCampaignCompanionReunion(later)).toBe(true);
    expect(reload(later).companionReunion).toEqual(receipt);
    expect(selectCompanionReturn(later)).toBeNull();
    expect(selectCompanionReturn({ ...later, companionReunion: null })).toBeNull();
  });

  it("stops hidden catch-up before the greeting, preserving its exact pending source once", () => {
    const request = { id: `reunion:${ready.tick}`, observedAtMs: 100_000 + ready.tick,
      elapsedMs: 48_000, requestedTicks: 10 };
    const stopped = catchUpWorld(ready, request);
    expect(stopped.tick).toBe(ready.tick);
    expect(stopped.depth).toEqual(ready.depth);
    expect(stopped.pendingAttention.at(-1)?.commandType).toBe("reunite-companion");
    expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
    expect(catchUpWorld(stopped, request)).toBe(stopped);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
  });
});
