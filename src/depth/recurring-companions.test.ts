import { describe, expect, it } from "vitest";
import { createForwardMotionState } from "../core/forward-motion";
import { advanceWorld, campaignDirector, createWorld, upgradeWorldState } from "../core/simulation";
import { isValidCompanionReferences, selectSharedRoadCompanion } from "./companion";
import { projectSuccessorQuestLead } from "./quest-lead";
import { createQuest, heroMasteryForExperience, heroMechanicalLevel } from "./rpg";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { generateTown, visitTown } from "./towns";
import type { DepthCommand, DepthState } from "./types";

const seed = "recurring-shared-road";
const campaignId = `campaign:${seed}`;

function eligibleState(): DepthState {
  const base = createWorld(seed, campaignId).depth;
  const originId = base.atlas.currentLocationId;
  const current = base.atlas.locations.find((location) => location.kind === "town" && location.id !== originId);
  if (current === undefined) throw new Error("Recurring-road fixture needs two towns");
  return {
    ...base,
    atlas: { ...base.atlas, currentLocationId: current.id, discoveredLocationIds: [originId, current.id], route: null },
    towns: { ...base.towns, [current.id]: visitTown(generateTown(seed, current.id)) },
  };
}

function selectedRecruitment(state: DepthState): Extract<DepthCommand, { type: "recruit-companion" }> {
  const town = state.towns[state.atlas.currentLocationId];
  if (town === undefined) throw new Error("Recurring-road fixture needs a visited town");
  const selected = selectSharedRoadCompanion({
    seed: state.seed, atlas: state.atlas, town, roster: state.companions,
    joinedTick: state.tick + 1, heroLevel: heroMechanicalLevel(state.hero.level),
  });
  if (selected === null) throw new Error("Recurring-road fixture has no eligible distinct resident");
  return { type: "recruit-companion", residentId: selected.identity.residentId, destinationId: selected.destination.locationId };
}

function finishOath(joined: DepthState): DepthState {
  const route = depthCommandCandidates(joined)[0]?.command;
  if (route?.type !== "plan-route") throw new Error("The oath must own its route");
  let current = stepDepth(joined, route);
  for (let index = 0; index < 32 && current.atlas.route !== null; index += 1) {
    current = stepDepth(current, { type: "travel", distance: 10_000 });
  }
  if (current.atlas.route !== null) throw new Error("Recurring-road fixture did not arrive");
  const farewell = depthCommandCandidates(current)[0]?.command;
  if (farewell?.type !== "farewell-companion") throw new Error("Arrival must have a separate farewell");
  return stepDepth(current, farewell);
}

function firstFarewell(): DepthState {
  const before = eligibleState();
  const candidate = depthCommandCandidates(before)[0]?.command;
  if (candidate?.type !== "recruit-companion") throw new Error("The first oath must remain eligible");
  return finishOath(stepDepth(before, candidate));
}

/** Relocate and advance a validated fixture, rather than claim these are autonomous intervening turns. */
function afterSoloInterval(farewell: DepthState, age: number, sameTown = false): DepthState {
  const former = farewell.companions.former.at(-1);
  if (former === undefined) throw new Error("Expected retained farewell");
  const locationId = sameTown ? former.departure.locationId : former.identity.originLocationId;
  const input: DepthState = {
    ...farewell,
    tick: former.departure.tick + age,
    atlas: { ...farewell.atlas, currentLocationId: locationId, route: null },
    towns: {
      ...farewell.towns,
      [locationId]: farewell.towns[locationId] ?? visitTown(generateTown(seed, locationId)),
    },
  };
  return upgradeDepthState(JSON.parse(JSON.stringify(input)), input.seed, input.hero.id, input.hero.name);
}

function hasRecruitment(state: DepthState): boolean {
  return depthCommandCandidates(state).some((candidate) => candidate.command.type === "recruit-companion");
}

describe("recurring Shared Road companions", () => {
  it("keeps the first oath selection, route ownership, and separate farewell unchanged", () => {
    const before = eligibleState();
    expect(depthCommandCandidates(before).map((candidate) => candidate.command)).toEqual([selectedRecruitment(before)]);
    const joined = stepDepth(before, selectedRecruitment(before));
    expect(joined.companions.active).toHaveLength(1);
    expect(joined.companions.former).toEqual([]);
    const finished = finishOath(joined);
    expect(finished.companions.active).toEqual([]);
    expect(finished.companions.former[0]?.identity).toEqual(joined.companions.active[0]?.identity);
    expect(finished.companions.former[0]?.departure.tick).toBe(finished.tick);
  });

  it("rejects a second oath at eleven completed solo ticks, including direct command dispatch", () => {
    const before = afterSoloInterval(firstFarewell(), 11);
    const snapshot = JSON.stringify(before);
    expect(hasRecruitment(before)).toBe(false);
    expect(() => stepDepth(before, selectedRecruitment(before))).toThrow();
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("keeps the farewell town solo even after the twelve-tick interval", () => {
    const before = afterSoloInterval(firstFarewell(), 12, true);
    expect(hasRecruitment(before)).toBe(false);
    expect(() => stepDepth(before, selectedRecruitment(before))).toThrow();
  });

  it("recruits a distinct second resident at twelve ticks in another town without changing the first former record", () => {
    const before = afterSoloInterval(firstFarewell(), 12);
    const former = JSON.parse(JSON.stringify(before.companions.former));
    const command = selectedRecruitment(before);
    expect(command.residentId).not.toBe(former[0].identity.residentId);
    expect(depthCommandCandidates(before).map((candidate) => candidate.command)).toEqual([command]);
    const joined = stepDepth(before, command);
    expect(joined.tick).toBe(before.tick + 1);
    expect(joined.companions.active).toHaveLength(1);
    expect(joined.companions.active[0]?.identity.residentId).toBe(command.residentId);
    expect(joined.companions.former).toEqual(former);
    expect(isValidCompanionReferences(joined.companions, joined.atlas, joined.towns)).toBe(true);
    expect(depthCommandCandidates(joined)[0]?.command).toEqual({ type: "plan-route", destinationId: command.destinationId });
    expect(() => stepDepth(joined, command)).toThrow();
  });

  it("preserves cooldown eligibility, exact selected identity, and the second oath across JSON resume", () => {
    const before = afterSoloInterval(firstFarewell(), 12);
    const resumed = upgradeDepthState(JSON.parse(JSON.stringify(before)), before.seed, before.hero.id, before.hero.name);
    const command = selectedRecruitment(before);
    expect(depthCommandCandidates(resumed).map((candidate) => candidate.command)).toEqual([command]);
    const joined = stepDepth(resumed, command);
    expect(joined).toEqual(stepDepth(before, command));
    expect(upgradeDepthState(JSON.parse(JSON.stringify(joined)), joined.seed, joined.hero.id, joined.hero.name)).toEqual(joined);
  });

  it.each(["initial", "recurring"] as const)("keeps a revealed successor quest route ahead of %s recruitment", (phase) => {
    const before = phase === "initial" ? eligibleState() : afterSoloInterval(firstFarewell(), 12);
    const withQuest = { ...before, quest: createQuest(seed, 1, before.tick) };
    const lead = projectSuccessorQuestLead(seed, withQuest.atlas, withQuest.quest);
    expect(lead?.phase).toBe("revealed");
    expect(depthCommandCandidates(withQuest).map((candidate) => candidate.command)).toEqual([
      { type: "plan-route", destinationId: lead?.locationId },
    ]);
  });

  it("uses the latest farewell for the next interval rather than the first companion's older departure", () => {
    const secondReady = afterSoloInterval(firstFarewell(), 12);
    const secondFarewell = finishOath(stepDepth(secondReady, selectedRecruitment(secondReady)));
    expect(secondFarewell.companions.former).toHaveLength(2);
    expect(hasRecruitment(afterSoloInterval(secondFarewell, 11))).toBe(false);
    const thirdReady = afterSoloInterval(secondFarewell, 12);
    expect(depthCommandCandidates(thirdReady).map((candidate) => candidate.command)).toEqual([selectedRecruitment(thirdReady)]);
  });

  it("turns the second oath into one canonical world and Chronicle transition", () => {
    const depth = afterSoloInterval(firstFarewell(), 12);
    const base = createWorld(seed, campaignId);
    const world = upgradeWorldState({
      ...base,
      tick: depth.tick,
      depth,
      hero: {
        ...base.hero,
        level: depth.hero.level,
        experience: depth.hero.experience,
        mastery: heroMasteryForExperience(depth.hero.experience),
        health: depth.hero.resources.health,
        maxHealth: depth.hero.resources.maxHealth,
        gold: depth.hero.gold,
      },
      scene: { ...base.scene, mode: "town", location: depth.towns[depth.atlas.currentLocationId]!.name },
      lifecycle: { ...base.lifecycle, simulationTick: depth.tick, worldClockMinutes: depth.tick * 15 },
      forwardMotion: createForwardMotionState(depth.atlas.currentLocationId, depth.tick),
    });
    const command = selectedRecruitment(depth);
    expect(campaignDirector(world).candidates.map((candidate) => candidate.command)).toEqual([command]);
    const joined = advanceWorld(world);
    expect(joined.depth.companions.former).toEqual(world.depth.companions.former);
    expect(joined.depth.companions.active[0]?.identity.residentId).toBe(command.residentId);
    expect(joined.chronicle).toHaveLength(world.chronicle.length + 1);
    expect(joined.chronicle.at(-1)?.commandType).toBe("recruit-companion");
    expect(joined.scene.headline).toContain(joined.depth.companions.active[0]!.identity.name);
    expect(upgradeWorldState(JSON.parse(JSON.stringify(joined)))).toEqual(joined);
  });
});
