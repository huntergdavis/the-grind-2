import { describe, expect, it } from "vitest";
import { heroExperienceFloor, maximumHeroLevel } from "../depth/rpg";
import type { DepthCommandCandidate } from "../depth/types";
import { createChampionInduction } from "./champions";
import { canonicalHash } from "./canonical";
import { createCampaignLegacyState } from "./legends";
import {
  createLegacyManifestationState,
  isValidLegacyManifestationState,
  legacyMentorArcNeedsTownVisit,
  projectLegacyManifestation,
  projectLegacyMentorArcBeat,
  resolveLegacyManifestation,
  resolveLegacyMentorArcBeat,
  scheduledLegacyMentorFarewellTownVisit,
  scheduledLegacyMentorPromiseTownVisit,
  scheduledLegacyMentorReturnTownVisit,
  scheduledLegacyTownVisit,
  totalTownVisits,
  upgradeLegacyManifestationState,
} from "./legacy-manifestations";
import { createWorld, legacyTownRevisitCandidate } from "./simulation";
import type { ChampionInduction, WorldState } from "./types";

function champion(index: number): ChampionInduction {
  const base = createWorld(`mentor-source:${index}`, `campaign:mentor-source:${index}`);
  const experience = heroExperienceFloor(maximumHeroLevel);
  const world: WorldState = {
    ...base,
    hero: { ...base.hero, level: maximumHeroLevel, experience },
    depth: {
      ...base.depth,
      hero: { ...base.depth.hero, level: maximumHeroLevel, experience },
    },
  };
  return createChampionInduction(world, "earned", { id: `command:mentor-source:${index}`, type: "wait" });
}

function campaign(cardCount = 1): WorldState {
  const records = Array.from({ length: cardCount }, (_, index) => champion(index));
  const seed = "legacy-mentor-campaign";
  return createWorld(seed, "campaign:legacy-mentor", createCampaignLegacyState(seed, records));
}

function withTownVisits(state: WorldState, visits: number): WorldState {
  const locationId = state.depth.atlas.currentLocationId;
  const town = state.depth.towns[locationId];
  if (town === undefined) throw new Error("Legacy mentor fixture requires a current town");
  return {
    ...state,
    depth: {
      ...state.depth,
      towns: { ...state.depth.towns, [locationId]: { ...town, visits } },
    },
  };
}

function metCampaign(cardCount = 1): WorldState {
  const base = campaign(cardCount);
  const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
  const ready = withTownVisits(base, due - 1);
  const plan = projectLegacyManifestation(ready, { type: "visit-town" });
  if (plan === null) throw new Error("Mentor arc fixture requires a first meeting");
  const resolved = resolveLegacyManifestation(ready, plan, `${ready.campaignId}:town:${ready.depth.atlas.currentLocationId}`);
  return withTownVisits({
    ...ready,
    tick: ready.tick + 1,
    legacyManifestations: resolved.manifestations,
  }, due);
}

function rehashFact<T extends { id: string }>(prefix: string, value: T): T {
  const { id: _id, ...content } = value;
  return { ...content, id: `${prefix}:${canonicalHash(content)}` } as T;
}

describe("legacy mentor manifestation facts", () => {
  it("uses cumulative deterministic 4–7 visit gaps from a persisted baseline", () => {
    const state = campaign(3);
    const manifestations = createLegacyManifestationState(11);
    const due = state.legacy.cards.map((_, index) =>
      scheduledLegacyTownVisit(state.seed, state.legacy, manifestations, index)
    );

    expect(due[0]).toBeGreaterThanOrEqual(15);
    expect(due[0]).toBeLessThanOrEqual(18);
    expect((due[1] ?? 0) - (due[0] ?? 0)).toBeGreaterThanOrEqual(4);
    expect((due[1] ?? 0) - (due[0] ?? 0)).toBeLessThanOrEqual(7);
    expect((due[2] ?? 0) - (due[1] ?? 0)).toBeGreaterThanOrEqual(4);
    expect((due[2] ?? 0) - (due[1] ?? 0)).toBeLessThanOrEqual(7);
    expect(scheduledLegacyTownVisit(state.seed, state.legacy, manifestations, 0)).toBe(due[0]);
  });

  it("projects only a due town visit and chooses one currently owned ability", () => {
    const base = campaign();
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const early = withTownVisits(base, due - 2);
    const ready = withTownVisits(base, due - 1);

    expect(projectLegacyManifestation(early, { type: "visit-town" })).toBeNull();
    expect(projectLegacyManifestation(ready, { type: "wait" })).toBeNull();
    const plan = projectLegacyManifestation(ready, { type: "visit-town" });
    expect(plan).not.toBeNull();
    expect(plan?.townVisitOrdinal).toBe(due);
    expect(ready.depth.hero.abilities.some((ability) =>
      ability.id === plan?.abilityId && ability.name === plan.abilityName && ability.level === plan.abilityLevel
    )).toBe(true);
  });

  it("records appearance, meeting, recognition, and practice as separate causal facts without importing power", () => {
    const base = campaign();
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const ready = withTownVisits(base, due - 1);
    const plan = projectLegacyManifestation(ready, { type: "visit-town" });
    if (plan === null) throw new Error("Legacy mentor fixture was not due");
    const heroBefore = JSON.stringify(ready.hero);
    const detailedHeroBefore = JSON.stringify(ready.depth.hero);
    const cardsBefore = JSON.stringify(ready.legacy);
    const first = resolveLegacyManifestation(ready, plan, "campaign:legacy-mentor:command:visit");
    const replay = resolveLegacyManifestation(structuredClone(ready), structuredClone(plan), "campaign:legacy-mentor:command:visit");

    expect(replay).toEqual(first);
    expect(first.appearance.id).not.toBe(first.meeting.id);
    expect(first.meeting.id).not.toBe(first.recognition.id);
    expect(first.recognition.id).not.toBe(first.lesson.id);
    expect(first.meeting.appearanceId).toBe(first.appearance.id);
    expect(first.recognition.meetingId).toBe(first.meeting.id);
    expect(first.lesson.meetingId).toBe(first.meeting.id);
    expect(first.lesson).toMatchObject({
      abilityId: plan.abilityId,
      abilityName: plan.abilityName,
      abilityLevelAtLesson: plan.abilityLevel,
      practice: "rehearsed-existing-art",
      importedPower: false,
    });
    expect(JSON.stringify(ready.hero)).toBe(heroBefore);
    expect(JSON.stringify(ready.depth.hero)).toBe(detailedHeroBefore);
    expect(JSON.stringify(ready.legacy)).toBe(cardsBefore);
    expect(isValidLegacyManifestationState(first.manifestations, ready.legacy)).toBe(true);
  });

  it("rejects duplicate, reordered, cardinality-mismatched, and tampered fact graphs", () => {
    const base = campaign();
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const ready = withTownVisits(base, due - 1);
    const plan = projectLegacyManifestation(ready, { type: "visit-town" });
    if (plan === null) throw new Error("Legacy mentor fixture was not due");
    const resolved = resolveLegacyManifestation(ready, plan, "command:mentor-fact-test").manifestations;

    expect(isValidLegacyManifestationState({ ...resolved, meetings: [] }, ready.legacy)).toBe(false);
    expect(isValidLegacyManifestationState({ ...resolved, appearances: [...resolved.appearances, resolved.appearances[0]!] }, ready.legacy)).toBe(false);
    expect(isValidLegacyManifestationState({
      ...resolved,
      lessons: [{ ...resolved.lessons[0]!, abilityName: "Invented power" }],
    }, ready.legacy)).toBe(false);
    expect(isValidLegacyManifestationState({
      ...resolved,
      recognitions: [{ ...resolved.recognitions[0]!, heroId: "hero:somebody-else" }],
    }, ready.legacy)).toBe(false);
  });

  it("never stages another appearance when every selected card has appeared", () => {
    const base = campaign();
    const due = scheduledLegacyTownVisit(base.seed, base.legacy, base.legacyManifestations, 0);
    const ready = withTownVisits(base, due - 1);
    const plan = projectLegacyManifestation(ready, { type: "visit-town" });
    if (plan === null) throw new Error("Legacy mentor fixture was not due");
    const resolved = resolveLegacyManifestation(ready, plan, "command:mentor-once");
    const after = withTownVisits({ ...ready, legacyManifestations: resolved.manifestations }, due + 100);

    expect(totalTownVisits(after)).toBe(due + 100);
    expect(projectLegacyManifestation(after, { type: "visit-town" })).toBeNull();
  });

  it("migrates a released first meeting into an empty first-mentor arc without fabricating later facts", () => {
    const met = metCampaign();
    const previous = structuredClone(met.legacyManifestations) as unknown as Record<string, unknown>;
    previous.schemaVersion = 1;
    delete previous.mentorArc;

    const upgraded = upgradeLegacyManifestationState(previous, met.legacy);
    expect(upgraded.mentorArc).toMatchObject({
      legendId: upgraded.appearances[0]?.legendId,
      appearanceId: upgraded.appearances[0]?.id,
      meetingId: upgraded.meetings[0]?.id,
      promiseFact: null,
      returnFact: null,
      farewellFact: null,
      memoryFact: null,
    });
    expect(upgradeLegacyManifestationState(structuredClone(upgraded), met.legacy)).toEqual(upgraded);
  });

  it("resolves deterministic promise, gated return, farewell, and immutable memory exactly once", () => {
    let state = metCampaign();
    const appearanceVisit = state.legacyManifestations.appearances[0]!.townVisitOrdinal;
    const promiseDue = scheduledLegacyMentorPromiseTownVisit(state.seed, state.legacyManifestations);
    expect(promiseDue - appearanceVisit).toBeGreaterThanOrEqual(3);
    expect(promiseDue - appearanceVisit).toBeLessThanOrEqual(5);

    state = withTownVisits({ ...state, chronicle: [] }, promiseDue - 1);
    const promisePlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
    expect(promisePlan?.phase).toBe("promise");
    if (promisePlan?.phase !== "promise") throw new Error("Promise fixture was not due");
    const stateBeforePromise = structuredClone(state);
    const promised = resolveLegacyMentorArcBeat(state, promisePlan, `${state.campaignId}:town:${state.depth.atlas.currentLocationId}`);
    if (promised.phase !== "promise") throw new Error("Promise resolution returned the wrong phase");
    expect(state).toEqual(stateBeforePromise);
    expect(promised.promise).toMatchObject({ importedPower: false, mechanicalEffect: "none" });
    state = withTownVisits({ ...state, tick: state.tick + 1, legacyManifestations: promised.manifestations }, promiseDue);

    const returnDue = scheduledLegacyMentorReturnTownVisit(state.seed, state.legacyManifestations);
    expect(returnDue - promiseDue).toBeGreaterThanOrEqual(6);
    expect(returnDue - promiseDue).toBeLessThanOrEqual(9);
    state = withTownVisits({ ...state, chronicle: [] }, returnDue - 1);
    expect(legacyMentorArcNeedsTownVisit(state)).toBe(false);
    expect(projectLegacyMentorArcBeat(state, { type: "visit-town" })).toBeNull();
    state = { ...state, depth: { ...state.depth, totalCompletedQuests: promised.promise.completedQuestBaseline + 1 } };
    expect(legacyMentorArcNeedsTownVisit(state)).toBe(true);
    const returnPlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
    if (returnPlan?.phase !== "return") throw new Error("Return fixture was not due");
    const returned = resolveLegacyMentorArcBeat(state, returnPlan, `${state.campaignId}:town:${state.depth.atlas.currentLocationId}`);
    if (returned.phase !== "return") throw new Error("Return resolution returned the wrong phase");
    expect(returned.returned).toMatchObject({ importedPower: false, mechanicalEffect: "none", relationship: "promise-kept" });
    state = withTownVisits({ ...state, tick: state.tick + 1, legacyManifestations: returned.manifestations }, returnDue);

    const farewellDue = scheduledLegacyMentorFarewellTownVisit(state.seed, state.legacyManifestations);
    expect(farewellDue - returnDue).toBeGreaterThanOrEqual(4);
    expect(farewellDue - returnDue).toBeLessThanOrEqual(6);
    state = withTownVisits({ ...state, chronicle: [] }, farewellDue - 1);
    const farewellPlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
    if (farewellPlan?.phase !== "farewell") throw new Error("Farewell fixture was not due");
    const farewell = resolveLegacyMentorArcBeat(state, farewellPlan, `${state.campaignId}:town:${state.depth.atlas.currentLocationId}`);
    if (farewell.phase !== "farewell") throw new Error("Farewell resolution returned the wrong phase");
    expect(farewell.farewell).toMatchObject({ importedPower: false, mechanicalEffect: "none", relationship: "parted-as-friends" });
    expect(farewell.memory).toMatchObject({ importedPower: false, mechanicalEffect: "none", memory: "kept-road-promise" });
    const finished = { ...state, tick: state.tick + 1, legacyManifestations: farewell.manifestations };
    expect(projectLegacyMentorArcBeat(finished, { type: "visit-town" })).toBeNull();
    expect(legacyMentorArcNeedsTownVisit(finished)).toBe(false);
  });

  it("gives a due unseen Champion appearance precedence over a due relationship beat", () => {
    const state = metCampaign(2);
    const initialDue = scheduledLegacyTownVisit(state.seed, state.legacy, state.legacyManifestations, 1);
    const promiseDue = scheduledLegacyMentorPromiseTownVisit(state.seed, state.legacyManifestations);
    const ready = withTownVisits({ ...state, chronicle: [] }, Math.max(initialDue, promiseDue) - 1);
    expect(projectLegacyManifestation(ready, { type: "visit-town" })?.card.id).toBe(ready.legacy.cards[1]?.id);
    expect(projectLegacyMentorArcBeat(ready, { type: "visit-town" })).toBeNull();
  });

  it("never projects or forces a mentor visit through prohibited active states", () => {
    const met = metCampaign();
    const promiseDue = scheduledLegacyMentorPromiseTownVisit(met.seed, met.legacyManifestations);
    const ready = withTownVisits({ ...met, chronicle: [] }, promiseDue - 1);
    const routeCandidate: DepthCommandCandidate = {
      id: "route:blocked-state",
      label: "take the ordinary road",
      deciderId: ready.hero.id,
      command: { type: "plan-route", destinationId: "location:1" },
    };
    const candidate = (command: DepthCommandCandidate["command"]): DepthCommandCandidate => ({
      id: `blocked:${command.type}`,
      label: `resolve ${command.type}`,
      deciderId: ready.hero.id,
      command,
    });
    const cases: readonly {
      name: string;
      state: WorldState;
      candidates: readonly DepthCommandCandidate[];
    }[] = [
      {
        name: "active combat",
        state: { ...ready, depth: { ...ready.depth, combat: {} as WorldState["depth"]["combat"] } },
        candidates: [candidate({ type: "combat-action", action: {} as never })],
      },
      {
        name: "active Pattern Duel",
        state: { ...ready, depth: { ...ready.depth, counterDuel: {} as WorldState["depth"]["counterDuel"] } },
        candidates: [candidate({ type: "counter-duel-action", prediction: "rush" })],
      },
      {
        name: "unfinished dungeon",
        state: { ...ready, depth: { ...ready.depth, dungeon: { completed: false } as WorldState["depth"]["dungeon"] } },
        candidates: [candidate({ type: "move-dungeon", direction: "north" })],
      },
      {
        name: "pending reward",
        state: { ...ready, depth: { ...ready.depth, pendingQuestReward: {} as WorldState["depth"]["pendingQuestReward"] } },
        candidates: [candidate({ type: "apply-quest-reward", grantId: "reward:blocked" })],
      },
      {
        name: "inactive quest",
        state: { ...ready, depth: { ...ready.depth, quest: { ...ready.depth.quest, status: "ready-to-fulfill" } } },
        candidates: [candidate({ type: "fulfill-quest", questInstanceId: ready.depth.quest.instanceId })],
      },
      {
        name: "consecutive town visit",
        state: {
          ...ready,
          chronicle: [{ commandType: "visit-town" } as WorldState["chronicle"][number]],
        },
        candidates: [routeCandidate],
      },
    ];

    for (const blocked of cases) {
      const before = structuredClone(blocked.state);
      expect(projectLegacyMentorArcBeat(blocked.state, { type: "visit-town" }), blocked.name).toBeNull();
      expect(legacyTownRevisitCandidate(blocked.state, blocked.candidates), blocked.name).toBeNull();
      expect(blocked.state, blocked.name).toEqual(before);
    }
  });

  it("rejects a fully rehashed return whose quest baseline breaks its causal promise", () => {
    let state = metCampaign();
    const promiseDue = scheduledLegacyMentorPromiseTownVisit(state.seed, state.legacyManifestations);
    state = withTownVisits({ ...state, chronicle: [] }, promiseDue - 1);
    const promisePlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
    if (promisePlan?.phase !== "promise") throw new Error("Promise forgery fixture was not due");
    const promised = resolveLegacyMentorArcBeat(state, promisePlan, `${state.campaignId}:town:${state.depth.atlas.currentLocationId}`);
    if (promised.phase !== "promise") throw new Error("Promise forgery resolution returned the wrong phase");
    state = withTownVisits({
      ...state,
      tick: state.tick + 1,
      legacyManifestations: promised.manifestations,
      depth: { ...state.depth, totalCompletedQuests: promised.promise.completedQuestBaseline + 1 },
      chronicle: [],
    }, scheduledLegacyMentorReturnTownVisit(state.seed, promised.manifestations) - 1);
    const returnPlan = projectLegacyMentorArcBeat(state, { type: "visit-town" });
    if (returnPlan?.phase !== "return") throw new Error("Return forgery fixture was not due");
    const returned = resolveLegacyMentorArcBeat(state, returnPlan, `${state.campaignId}:town:${state.depth.atlas.currentLocationId}`);
    if (returned.phase !== "return") throw new Error("Return forgery resolution returned the wrong phase");
    const forgedReturn = rehashFact("legacy-mentor-return", {
      ...returned.returned,
      completedQuestBaseline: returned.returned.completedQuestBaseline + 1,
      completedQuestCount: returned.returned.completedQuestCount + 1,
    });
    const forged = {
      ...returned.manifestations,
      mentorArc: { ...returned.manifestations.mentorArc!, returnFact: forgedReturn },
    };
    expect(isValidLegacyManifestationState(forged, state.legacy)).toBe(false);
  });
});
