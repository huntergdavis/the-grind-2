import { beforeAll, describe, expect, it } from "vitest";
import { actorPolicy, advanceWorld, campaignDirector, rulesEngine } from "../core/simulation";
import type { WorldState } from "../core/types";
import { roomChallengeClaim, roomChallengeResponses } from "../depth/room-challenge";
import { naturalRoomChallengeFixture } from "../../tests/room-challenge-fixtures";
import { projectReparteeScene, projectRoomChallengeScene } from "./repartee-view";

/** Explicit legal alternative, not a claim that this actor autonomously chose it. */
function answer(world: WorldState, classification: "direct" | "near" | "category"): WorldState {
  const response = roomChallengeResponses(world.depth).find((entry) => entry.classification === classification)!;
  const opportunity = campaignDirector(world);
  const selected = opportunity.candidates.find((entry) => entry.command.type === "answer-room-challenge" && entry.command.responseId === response.id)!;
  return rulesEngine(world, opportunity, {
    ...actorPolicy(world, opportunity), command: selected.command, commandId: `${world.campaignId}:${selected.id}`,
    action: selected.label, rationale: "Explicit presentation test of this legal reply's recorded meaning.",
    consideredCommandIds: opportunity.candidates.map((entry) => `${world.campaignId}:${entry.id}`),
  });
}

function earlierStory(world: WorldState): string {
  return JSON.stringify([world.depth.repartee, world.depth.reparteeWitness, world.depth.reparteeCallback,
    world.depth.usefulReply, world.depth.bellExpedition, world.depth.bellMemory]);
}

describe("one public room challenge presentation", () => {
  let before: WorldState, admitted: WorldState, result: WorldState;
  beforeAll(() => {
    before = naturalRoomChallengeFixture();
    admitted = advanceWorld(before);
    result = advanceWorld(admitted);
  });

  it("shows the actual public claim and stakes without an invented answer or result", () => {
    expect(before.depth.roomChallenge).toBeNull();
    expect(projectRoomChallengeScene(before)).toBeNull();
    const challenge = admitted.depth.roomChallenge!, scene = projectRoomChallengeScene(admitted)!;
    expect(scene).toMatchObject({ phase: "room-challenge", challengeId: challenge.encounterId,
      commandId: `${admitted.campaignId}:${challenge.sourceCommandId}`, tick: challenge.startedTick,
      heroId: challenge.heroId, residentId: challenge.residentId, residentName: challenge.residentName,
      buildingId: challenge.buildingId, title: "Let the room answer", call: roomChallengeClaim.text,
      reply: null, marks: [], score: null, momentum: null, outcome: null, witness: null, encore: false,
      readingSourceCommandId: admitted.depth.usefulReply!.reading.sourceCommandId,
      consequence: "One answer. Victory: +1 town reputation, capped at 100.",
    });
    expect(projectReparteeScene(admitted)).toEqual(scene);
  });

  it.each([
    ["direct", 1, "victory", "Victory · +1 counter"],
    ["near", 0, "draw", "Draw · 0 counter"],
    ["category", -1, "defeat", "Defeat · -1 counter"],
  ] as const)("renders the exact %s answer with one semantic result", (classification, score, outcome, title) => {
    const world = answer(admitted, classification), challenge = world.depth.roomChallenge!, receipt = challenge.result!;
    const scene = projectRoomChallengeScene(world)!;
    expect(scene).toMatchObject({ phase: "room-result", classification, score, outcome, title,
      marks: [score], momentum: null, witness: null, encore: false, call: challenge.claim, reply: receipt.reply,
      commandId: `${world.campaignId}:${receipt.sourceCommandId}`, tick: receipt.tick,
    });
    expect(scene.consequence).toBe(`Town reputation ${receipt.reputationBefore} → ${receipt.reputationAfter} · ${score === 1 ? "+1, once only." : "no award."}`);
    expect(earlierStory(world)).toBe(earlierStory(before));
    expect(world.depth.hero.resources).toEqual(before.depth.hero.resources);
    expect(world.depth.companions).toEqual(before.depth.companions);
    expect(world.depth.quest).toEqual(before.depth.quest);
  });

  it("calls a capped victory a victory without displaying an unearned reputation point", () => {
    // Explicit cap boundary atop the actual earlier journey, not a natural 100-reputation claim.
    const locationId = before.depth.atlas.currentLocationId, town = before.depth.towns[locationId]!;
    const capped = { ...before, depth: { ...before.depth, towns: { ...before.depth.towns, [locationId]: { ...town, reputation: 100 } } } };
    const world = answer(advanceWorld(capped), "direct");
    expect(projectRoomChallengeScene(world)).toMatchObject({ title: "Victory · +1 counter", score: 1,
      consequence: "Town reputation 100 → 100 · already at the cap." });
    expect(world.depth.roomChallenge!.result!.reputationAward).toBe(0);
  });

  it("reconstructs exact natural start/result views after reload and leaves all old stories untouched", () => {
    for (const world of [admitted, result]) {
      const saved = JSON.stringify(world), scene = projectRoomChallengeScene(world)!;
      expect(projectRoomChallengeScene(JSON.parse(saved))).toEqual(scene);
      expect(Object.isFrozen(scene)).toBe(true);
      expect(Object.isFrozen(scene.marks)).toBe(true);
      expect(JSON.stringify(world)).toBe(saved);
      expect(earlierStory(world)).toBe(earlierStory(before));
    }
  });

  it("rejects stale, foreign, wrong-phase or absent-participant presentation sources", () => {
    const source = result.chronicle.at(-1)!;
    const withSource = (change: Partial<typeof source>): WorldState => ({ ...result,
      chronicle: [...result.chronicle.slice(0, -1), { ...source, ...change }],
    });
    expect(projectRoomChallengeScene(withSource({ commandId: `foreign:${result.depth.roomChallenge!.result!.sourceCommandId}` }))).toBeNull();
    expect(projectRoomChallengeScene(withSource({ tick: result.tick - 1 }))).toBeNull();
    expect(projectRoomChallengeScene(withSource({ commandType: "start-room-challenge" }))).toBeNull();
    expect(projectRoomChallengeScene({ ...result, scene: { ...result.scene, mode: "battle" } })).toBeNull();
    const challenge = result.depth.roomChallenge!, town = result.depth.towns[challenge.locationId]!;
    expect(projectRoomChallengeScene({ ...result, depth: { ...result.depth,
      towns: { ...result.depth.towns, [challenge.locationId]: { ...town, residents: town.residents.filter((entry) => entry.id !== challenge.residentId) } },
    } })).toBeNull();
    expect(projectRoomChallengeScene({ ...result, depth: { ...result.depth,
      atlas: { ...result.depth.atlas, currentLocationId: "not-this-venue" },
    } })).toBeNull();
  });

  it("retains the receipt but does not replay its stage or award when ordinary play resumes", () => {
    const after = advanceWorld(result);
    expect(after.depth.roomChallenge).toEqual(result.depth.roomChallenge);
    expect(after.depth.towns[result.depth.roomChallenge!.locationId]!.reputation)
      .toBe(result.depth.towns[result.depth.roomChallenge!.locationId]!.reputation);
    expect(projectRoomChallengeScene(after)).toBeNull();
    expect(projectReparteeScene(after)).toBeNull();
  });
});
