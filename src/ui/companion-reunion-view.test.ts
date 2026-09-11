import { beforeAll, describe, expect, it } from "vitest";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { naturalCompanionReunionArrivalFixture, naturalCompanionReunionFixture } from "../../tests/companion-reunion-fixtures";
import { projectCompanionReunionScene } from "./companion-reunion-view";
import { projectReparteeScene } from "./repartee-view";

function earlierStory(world: WorldState): string {
  return JSON.stringify([world.depth.companions, world.depth.repartee, world.depth.reparteeWitness,
    world.depth.reparteeCallback, world.depth.usefulReply, world.depth.roomChallenge,
    world.depth.bellExpedition, world.depth.bellMemory]);
}

describe("a familiar face presentation", () => {
  let arrival: WorldState, ready: WorldState, reunited: WorldState;
  beforeAll(() => {
    arrival = naturalCompanionReunionArrivalFixture();
    ready = naturalCompanionReunionFixture();
    reunited = advanceWorld(ready);
  });

  it("does not turn either travel or a retained arrival into an unspoken reunion", () => {
    expect(arrival.depth.atlas.route).not.toBeNull();
    expect(ready.depth.companionReunion).not.toBeNull();
    expect(ready.depth.companionReunion!.completed).toBeNull();
    expect(ready.depth.companionReunion!.arrival.sourceLocationId).toBe(arrival.depth.atlas.currentLocationId);
    expect(ready.depth.companionReunion!.locationId).not.toBe(arrival.depth.atlas.currentLocationId);
    expect(projectCompanionReunionScene(arrival)).toBeNull();
    expect(projectCompanionReunionScene(ready)).toBeNull();
  });

  it("stages the actual former companion and exact words at the recorded farewell town", () => {
    const reunion = reunited.depth.companionReunion!, completed = reunion.completed!;
    const former = reunited.depth.companions.former.find((entry) => entry.identity.residentId === reunion.residentId && entry.joinedTick === reunion.joinedTick)!;
    const location = reunited.depth.atlas.locations.find((entry) => entry.id === reunion.locationId)!;
    const scene = projectCompanionReunionScene(reunited)!;
    expect(scene).toMatchObject({ phase: "reunion", reunionId: completed.sourceCommandId,
      commandId: `${reunited.campaignId}:${completed.sourceCommandId}`, tick: completed.tick,
      heroId: reunion.heroId, heroName: reunited.hero.name, companion: { id: reunion.residentId,
        name: reunion.companionName, role: former.identity.role, joinedTick: reunion.joinedTick },
      locationId: former.departure.locationId, locationName: location.name,
      title: `A familiar face · ${location.name}`, call: completed.heroLine, reply: completed.companionLine,
      arrivalSourceCommandId: reunion.arrival.sourceCommandId, arrivalTick: reunion.arrival.tick,
      sharedVictories: former.victories, departureTick: former.departure.tick,
      bookId: null, buildingId: null, buildingName: null, residentId: null,
      marks: [], momentum: null, outcome: null, witness: null, encore: false,
      consequence: "Two roads cross again.",
    });
    expect(projectReparteeScene(reunited)).toEqual(scene);
  });

  it("retains exact reload words and leaves the old oath, relationships, stories and resources unchanged", () => {
    const saved = JSON.stringify(reunited), scene = projectCompanionReunionScene(reunited)!;
    expect(projectCompanionReunionScene(JSON.parse(saved))).toEqual(scene);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.companion)).toBe(true);
    expect(Object.isFrozen(scene.marks)).toBe(true);
    expect(JSON.stringify(reunited)).toBe(saved);
    expect(earlierStory(reunited)).toBe(earlierStory(ready));
    expect(reunited.depth.hero).toEqual(ready.depth.hero);
    expect(reunited.hero).toEqual(ready.hero);
    expect(reunited.depth.quest).toEqual(ready.depth.quest);
    expect(reunited.depth.towns).toEqual(ready.depth.towns);
    expect(reunited.depth.companions.active).toEqual([]);
  });

  it("rejects stale, foreign, wrong-command and wrong-place presentation sources", () => {
    const source = reunited.chronicle.at(-1)!;
    const withSource = (change: Partial<typeof source>): WorldState => ({ ...reunited,
      chronicle: [...reunited.chronicle.slice(0, -1), { ...source, ...change }],
    });
    expect(projectCompanionReunionScene(withSource({ commandId: `foreign:${reunited.depth.companionReunion!.completed!.sourceCommandId}` }))).toBeNull();
    expect(projectCompanionReunionScene(withSource({ tick: reunited.tick - 1 }))).toBeNull();
    expect(projectCompanionReunionScene(withSource({ commandType: "travel" }))).toBeNull();
    expect(projectCompanionReunionScene({ ...reunited, scene: { ...reunited.scene, mode: "battle" } })).toBeNull();
    expect(projectCompanionReunionScene({ ...reunited, depth: { ...reunited.depth,
      atlas: { ...reunited.depth.atlas, currentLocationId: reunited.depth.companionReunion!.arrival.sourceLocationId },
    } })).toBeNull();
  });

  it("does not substitute a missing, injured or different-oath former companion", () => {
    const reunion = reunited.depth.companionReunion!, roster = reunited.depth.companions;
    const former = roster.former.find((entry) => entry.identity.residentId === reunion.residentId && entry.joinedTick === reunion.joinedTick)!;
    const replace = (value: typeof former | null): WorldState => ({ ...reunited, depth: { ...reunited.depth,
      companions: { ...roster, former: roster.former.flatMap((entry) => entry === former ? value === null ? [] : [value] : [entry]) },
    } });
    expect(projectCompanionReunionScene(replace(null))).toBeNull();
    expect(projectCompanionReunionScene(replace({ ...former, joinedTick: former.joinedTick + 1 }))).toBeNull();
    expect(projectCompanionReunionScene(replace({ ...former, injury: "wounded" }))).toBeNull();
    expect(projectCompanionReunionScene(replace({ ...former, identity: { ...former.identity, name: "Not this companion" } }))).toBeNull();
  });

  it("keeps the historical reunion but removes its stage when the adventure continues", () => {
    const after = advanceWorld(reunited);
    expect(after.depth.companionReunion).toEqual(reunited.depth.companionReunion);
    expect(projectCompanionReunionScene(after)).toBeNull();
    expect(projectReparteeScene(after)).toBeNull();
  });
});
