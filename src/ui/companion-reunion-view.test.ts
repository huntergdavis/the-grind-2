import { beforeAll, describe, expect, it } from "vitest";
import { advanceWorld } from "../core/simulation";
import type { WorldState } from "../core/types";
import { naturalCompanionReunionArrivalFixture, naturalCompanionReunionFixture } from "../../tests/companion-reunion-fixtures";
import { releasedCompanionReunionFixture } from "../../tests/reunion-witness-memory-fixtures";
import { canonicalStringify } from "../core/canonical";
import { companionReunionLines } from "../depth/companion-reunion";
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
      title: `${completed.memory === undefined ? "A familiar face" : "An old line returns"} · ${location.name}`,
      call: completed.heroLine, reply: completed.companionLine,
      arrivalSourceCommandId: reunion.arrival.sourceCommandId, arrivalTick: reunion.arrival.tick,
      sharedVictories: former.victories, departureTick: former.departure.tick,
      bookId: null, buildingId: null, buildingName: null, residentId: null,
      marks: [], momentum: null, outcome: null, witness: null, encore: false,
      consequence: completed.memory === undefined ? "Two roads cross again." : "Some words travel with you.",
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
    expect(projectCompanionReunionScene({ ...reunited, hero: { ...reunited.hero, id: "unrelated-hero" } })).toBeNull();
    expect(projectCompanionReunionScene({ ...reunited, scene: { ...reunited.scene, mode: "battle" } })).toBeNull();
    expect(projectCompanionReunionScene({ ...reunited, scene: { ...reunited.scene, action: "An unrelated conversation" } })).toBeNull();
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

  it("remembers the actual witnessed words without changing the companion's neutral opinion", () => {
    const reunion = reunited.depth.companionReunion!, memory = reunion.completed!.memory!;
    const reaction = reunited.depth.reparteeWitness.reaction!;
    const scene = projectCompanionReunionScene(reunited)!;
    expect(memory).toMatchObject({ rulesVersion: "reunion-witness-memory-v1", witnessId: reunion.residentId,
      joinedTick: reunion.joinedTick, sourceReactionCommandId: reaction.completionCommandId,
      sourceReactionTick: reaction.completedTick, sourceReactionId: reaction.reactionId,
      evidenceSourceCommandId: reaction.evidence!.sourceCommandId, evidenceRoundIndex: reaction.evidence!.roundIndex,
      rememberedReply: reaction.evidence!.reply, quote: "I will accept being called cautious.",
      pose: "quiet", outcome: "draw", regardAfter: 0 });
    expect(scene.memory).toEqual(memory);
    expect(scene.memory).not.toBe(memory);
    expect(Object.isFrozen(scene.memory)).toBe(true);
    expect(scene.call).toContain(`“${memory.quote}”`);
    expect(scene.reply).toBe("It is exactly as I remember. I am still not sure what to make of it.");
    expect(scene.title).toBe("An old line returns · Elderwatch");
    expect(scene.consequence).toBe("Some words travel with you.");
    expect(scene.memory).not.toHaveProperty("regardDelta");
    expect(reunited.depth.reparteeWitness).toEqual(ready.depth.reparteeWitness);
  });

  it("preserves the exact released v177 reunion without retroactively inserting a memory", () => {
    // Actual old completed save, not a newly generated event with its memory deleted.
    const released = releasedCompanionReunionFixture(), before = canonicalStringify(released);
    const reunion = released.depth.companionReunion!, completed = reunion.completed!;
    const scene = projectCompanionReunionScene(released)!;
    expect(completed).not.toHaveProperty("memory");
    expect(scene).not.toHaveProperty("memory");
    expect(scene.title).toBe("A familiar face · Elderwatch");
    expect(scene.consequence).toBe("Two roads cross again.");
    expect(completed).toMatchObject(companionReunionLines(reunion.sharedVictories));
    expect(scene.call).toBe(completed.heroLine);
    expect(scene.reply).toBe(completed.companionLine);
    expect(projectCompanionReunionScene(JSON.parse(before))).toEqual(scene);
    expect(canonicalStringify(released)).toBe(before);
  });

  it("rejects a substituted quote, witness oath or evidence source instead of inventing a callback", () => {
    const reunion = reunited.depth.companionReunion!, completed = reunion.completed!, memory = completed.memory!;
    for (const changed of [
      { ...memory, quote: "An invented line." },
      { ...memory, witnessId: "unrelated-former-companion" },
      { ...memory, joinedTick: memory.joinedTick + 1 },
      { ...memory, evidenceSourceCommandId: `${memory.evidenceSourceCommandId}:other` },
    ]) {
      const state: WorldState = { ...reunited, depth: { ...reunited.depth,
        companionReunion: { ...reunion, completed: { ...completed, memory: changed } } } };
      expect(projectCompanionReunionScene(state)).toBeNull();
    }
  });
});
