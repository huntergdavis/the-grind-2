import { describe, expect, it } from "vitest";
import { heroExperienceFloor, maximumHeroLevel } from "../depth/rpg";
import { createChampionInduction } from "./champions";
import { createCampaignLegacyState } from "./legends";
import {
  createLegacyManifestationState,
  isValidLegacyManifestationState,
  projectLegacyManifestation,
  resolveLegacyManifestation,
  scheduledLegacyTownVisit,
  totalTownVisits,
} from "./legacy-manifestations";
import { createWorld } from "./simulation";
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
});
