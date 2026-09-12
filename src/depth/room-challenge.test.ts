import { beforeAll, describe, expect, it } from "vitest";
import { naturalRoomChallengeFixture } from "../../tests/room-challenge-fixtures";
import { naturalUsefulReplyFixture } from "../../tests/useful-reply-fixtures";
import { canonicalStringify } from "../core/canonical";
import { actorPolicy } from "../core/actor-policy";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { HeroValue, WorldState } from "../core/types";
import { addActiveCompanion, selectSharedRoadCompanion } from "./companion";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { selectPaidInnRest } from "./town-rest";
import type { DepthCommand, DepthState } from "./types";
import { isValidCampaignRoomChallenge, roomChallengeClaim, roomChallengeCommandCandidates, roomChallengeCommandId, roomChallengeResponses, selectRoomChallengeVenue } from "./room-challenge";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}
function unalteredFacts(state: DepthState) {
  const { tick: _tick, log: _log, roomChallenge: _challenge, towns: _towns, ...facts } = state;
  return facts;
}
function answer(state: DepthState, responseId: string): DepthState {
  return stepDepth(state, { type: "answer-room-challenge", encounterId: state.roomChallenge!.encounterId, responseId });
}

describe("one source-bound public point after the lesson and Bell delivery", () => {
  let ready: WorldState, admitted: WorldState, completed: WorldState;
  beforeAll(() => {
    ready = naturalRoomChallengeFixture();
    admitted = advanceWorld(ready);
    completed = advanceWorld(admitted);
  });

  it("admits the actual safe resident after both prior episodes and exposes the previously learned frame", () => {
    expect(ready.depth.roomChallenge).toBeNull();
    expect(ready.depth.bellExpedition!.completion).not.toBeNull();
    expect(ready.depth.usefulReply!.reply).not.toBeNull();
    expect(ready.depth.companions.active).toHaveLength(0);
    const challenge = admitted.depth.roomChallenge!, lesson = ready.depth.usefulReply!, bell = ready.depth.bellExpedition!.completion!;
    expect(challenge).toMatchObject({ schemaVersion: 1, rulesVersion: "room-challenge-v1", contentVersion: 1,
      heroId: ready.depth.hero.id, claimId: roomChallengeClaim.id, claim: roomChallengeClaim.text,
      readingSourceCommandId: lesson.reading.sourceCommandId, readingTick: lesson.reading.tick,
      expressionId: lesson.reading.expressionId, frameId: lesson.reading.frameId,
      lessonSourceCommandId: lesson.reply!.sourceCommandId, lessonTick: lesson.reply!.tick,
      bellSourceCommandId: bell.sourceCommandId, bellTick: bell.tick, startedTick: ready.tick + 1,
      reputationBefore: ready.depth.towns[challenge.locationId]!.reputation, reputationCap: 100, result: null });
    expect(challenge.startedTick).toBeGreaterThan(challenge.lessonTick);
    expect(challenge.startedTick).toBeGreaterThan(challenge.bellTick);
    expect(ready.depth.towns[challenge.locationId]!.residents).toContainEqual(expect.objectContaining({ id: challenge.residentId, name: challenge.residentName, homeBuildingId: challenge.buildingId }));
    expect(roomChallengeResponses({ ...ready.depth, usefulReply: null }).map((response) => response.classification)).toEqual(["near", "category"]);
    expect(roomChallengeResponses(ready.depth).map((response) => response.classification)).toEqual(["direct", "near", "category"]);
    expect(admitted.chronicle.at(-1)).toMatchObject({ commandType: "start-room-challenge", tick: challenge.startedTick, commandId: `${admitted.campaignId}:${challenge.sourceCommandId}` });
    expect(admitted.scene.location).toBe(admitted.depth.atlas.locations.find((location) => location.id === challenge.locationId)!.name);
    expect(completed.scene.location).toBe(admitted.scene.location);
    expect(admitted.depth.towns).toEqual(ready.depth.towns);
  });

  it("the reading unlocks the counter even when the earlier actual practice chose a concession", () => {
    const reading = advanceWorld(naturalUsefulReplyFixture());
    const plainPractice = stepDepth(reading.depth, { type: "practice-useful-reply", lessonId: reading.depth.usefulReply!.lessonId, responseId: "grant-the-volume" });
    expect(plainPractice.usefulReply!.reply!.classification).toBe("concession");
    // A bounded alternative-history knowledge projection; no claim that the
    // natural policy chose this different practice response in the main fixture.
    const withPlainPractice = { ...ready.depth, usefulReply: plainPractice.usefulReply };
    expect(selectRoomChallengeVenue(withPlainPractice)).not.toBeNull();
    expect(roomChallengeResponses(withPlainPractice).find((response) => response.classification === "direct")?.frameId).toBe(plainPractice.usefulReply!.reading.frameId);
  });

  it("resolves all three meanings once and awards only the capped existing town reputation", () => {
    const challenge = admitted.depth.roomChallenge!, locationId = challenge.locationId;
    for (const response of roomChallengeResponses(admitted.depth)) {
      const after = answer(admitted.depth, response.id), result = after.roomChallenge!.result!;
      const outcome = response.delta === 1 ? "victory" : response.delta === 0 ? "draw" : "defeat";
      expect(result).toMatchObject({ responseId: response.id, reply: response.text, classification: response.classification,
        delta: response.delta, outcome, tick: admitted.tick + 1,
        readingSourceCommandId: response.frameId === null ? null : challenge.readingSourceCommandId,
        reputationBefore: challenge.reputationBefore,
        reputationAfter: response.delta === 1 ? Math.min(100, challenge.reputationBefore + 1) : challenge.reputationBefore });
      expect(after.towns).toEqual({ ...admitted.depth.towns, [locationId]: { ...admitted.depth.towns[locationId]!, reputation: result.reputationAfter } });
      expect(unalteredFacts(after)).toEqual(unalteredFacts(ready.depth));
      expect(reload(after)).toEqual(after);
      expect(roomChallengeCommandCandidates(after)).toBeNull();
      expect(() => answer(after, response.id)).toThrow();
    }
    // Explicit reputation boundaries after a genuine ordinary tick, not natural
    // claims about how the town acquired 99/100 reputation.
    const ordinary = stepDepth(ready.depth, { type: "wait" });
    for (const before of [99, 100]) {
      const boundary = reload({ ...ordinary, towns: { ...ordinary.towns, [locationId]: { ...ordinary.towns[locationId]!, reputation: before } } });
      const command = roomChallengeCommandCandidates(boundary)![0]!.command;
      const capped = answer(stepDepth(boundary, command), "listen-then-lead");
      expect(capped.roomChallenge!.result).toMatchObject({ outcome: "victory", reputationBefore: before, reputationAfter: 100, reputationAward: before === 99 ? 1 : 0 });
      expect(reload(capped)).toEqual(capped);
    }
  });

  it("keeps actual scores independent of autonomous curiosity, mercy, and defiance", () => {
    const opportunity = campaignDirector(admitted);
    const cases: readonly [HeroValue, string, string][] = [
      ["curiosity", "listen-then-lead", "actually learned"],
      ["mercy", "let-the-room-lead", "accepts a draw"],
      ["courage", "order-the-ceiling", "sacrifices this single point"],
    ];
    for (const [value, responseId, reason] of cases) {
      // Policy-only declared-value fixture; no altered life story is persisted.
      const choice = actorPolicy({ ...admitted, hero: { ...admitted.hero, values: [value] } }, opportunity);
      expect(choice.command).toMatchObject({ type: "answer-room-challenge", responseId });
      expect(choice.rationale).toContain(reason);
      const resolved = stepDepth(admitted.depth, choice.command).roomChallenge!.result!;
      expect(resolved.delta).toBe(roomChallengeResponses(admitted.depth).find((entry) => entry.id === responseId)!.delta);
    }
    expect(completed.hero).toEqual(ready.hero);
    expect(unalteredFacts(completed.depth)).toEqual(unalteredFacts(ready.depth));
  });

  it("persists exact start/result sources and resumes a real ordinary action after settlement", () => {
    for (const state of [admitted, completed]) {
      expect(reload(state.depth)).toEqual(state.depth);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
    }
    const result = completed.depth.roomChallenge!.result!;
    expect(completed.chronicle.at(-1)).toMatchObject({ commandType: "answer-room-challenge", tick: result.tick, commandId: `${completed.campaignId}:${result.sourceCommandId}` });
    expect(campaignDirector(completed).candidates.every((candidate) => !["start-room-challenge", "answer-room-challenge"].includes(candidate.command.type))).toBe(true);
    const continued = advanceWorld(completed);
    expect(continued.tick).toBe(completed.tick + 1);
    expect(continued.depth.roomChallenge).toEqual(completed.depth.roomChallenge);
    expect(reload(continued.depth)).toEqual(continued.depth);
  });

  it("stops hidden catch-up before both foreground commands without replaying their rewards", () => {
    for (const before of [ready, admitted]) {
      const request = { id: `room-challenge:${before.tick}`, observedAtMs: 100_000 + before.tick, elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(before, request);
      expect(stopped.tick).toBe(before.tick);
      expect(stopped.depth).toEqual(before.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(campaignDirector(before).candidates[0]!.command.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
    }
  });

  it("preserves prior obligations and requires an actual safe solo venue", () => {
    for (const blocked of [
      { ...ready.depth, usefulReply: null },
      { ...ready.depth, usefulReply: { ...ready.depth.usefulReply!, reply: null } },
      { ...ready.depth, bellExpedition: null },
      { ...ready.depth, bellExpedition: { ...ready.depth.bellExpedition!, completion: null } },
      { ...ready.depth, quest: { ...ready.depth.quest, status: "ready-to-fulfill" as const } },
      { ...ready.depth, atlas: { ...ready.depth.atlas, discoveredLocationIds: [] } },
      { ...ready.depth, hero: { ...ready.depth.hero, resources: { ...ready.depth.hero.resources, health: 0 } } },
    ]) expect(selectRoomChallengeVenue(blocked)).toBeNull();
    const reading = advanceWorld(naturalUsefulReplyFixture());
    expect(depthCommandCandidates(reading.depth).every((candidate) => candidate.command.type === "practice-useful-reply")).toBe(true);
    const ordinary = stepDepth(ready.depth, { type: "wait" });
    const lowMana = reload({ ...ordinary, hero: { ...ordinary.hero, gold: Math.max(5, ordinary.hero.gold), resources: { ...ordinary.hero.resources, mana: 0 } } });
    expect(selectPaidInnRest(lowMana)).not.toBeNull();
    expect(selectRoomChallengeVenue(lowMana)).toBeNull();
    expect(depthCommandCandidates(lowMana)[0]!.command.type).toBe("wait");
    const defeated = { ...ordinary, hero: { ...ordinary.hero, resources: { ...ordinary.hero.resources, health: 0 } } };
    expect(depthCommandCandidates(defeated)[0]!.command).toEqual({ type: "wait" });
  });

  it("rejects foreign, stale, unknown, and competing commands atomically", () => {
    const current = admitted.depth.roomChallenge!, before = canonicalStringify(admitted.depth);
    const rejected: DepthCommand[] = [
      { type: "wait" },
      roomChallengeCommandCandidates(ready.depth)![0]!.command,
      { type: "answer-room-challenge", encounterId: "foreign", responseId: "listen-then-lead" },
      { type: "answer-room-challenge", encounterId: current.encounterId, responseId: "unlearned" },
    ];
    for (const command of rejected) expect(() => stepDepth(admitted.depth, command)).toThrow();
    expect(canonicalStringify(admitted.depth)).toBe(before);
    expect(() => stepDepth(ready.depth, { type: "answer-room-challenge", encounterId: current.encounterId, responseId: "listen-then-lead" })).toThrow();
    const opportunity = campaignDirector(admitted), real = opportunity.candidates[0]!;
    expect(() => actorPolicy(admitted, { ...opportunity, candidates: [{ ...real, id: "foreign-source" }] })).toThrow();
    expect(actorPolicy(admitted, { ...opportunity, candidates: [{ ...real, id: "foreign-source" }, ...opportunity.candidates] }).commandId).not.toContain("foreign-source");
    expect(() => stepDepth(completed.depth, roomChallengeCommandCandidates(ready.depth)![0]!.command)).toThrow();
  });

  it("migrates Depth33 to no challenge and rejects unsupported, rewritten, or temporally impossible receipts", () => {
    const { roomChallenge: _challenge, ...old } = ready.depth;
    expect(reload({ ...old, schemaVersion: 33 } as unknown as DepthState)).toMatchObject({ schemaVersion: 36, roomChallenge: null });
    expect(() => upgradeDepthState({ ...old, schemaVersion: 33, roomChallenge: undefined }, ready.seed, ready.hero.id, ready.hero.name)).toThrow();
    const source = completed.depth.roomChallenge!, result = source.result!;
    for (const invalid of [{}, { ...source, rulesVersion: "room-challenge-v2" }, { ...source, contentVersion: 2 },
      { ...source, claim: "The hero stole the bell." }, { ...source, sourceCommandId: "foreign-start" },
      { ...source, readingSourceCommandId: "foreign-book" }, { ...source, lessonSourceCommandId: "foreign-lesson" },
      { ...source, bellSourceCommandId: "foreign-delivery" }, { ...source, startedTick: source.bellTick },
      { ...source, residentId: "absent-resident" }, { ...source, extra: true },
      { ...source, result: { ...result, reply: "The resident gives me a crown." } },
      { ...source, result: { ...result, reputationAfter: 100, reputationAward: 99 } },
      { ...source, result: { ...result, tick: result.tick + 1 } },
    ]) {
      expect(() => reload({ ...completed.depth, roomChallenge: invalid } as unknown as DepthState)).toThrow();
      expect(() => reload({ ...old, schemaVersion: 33, roomChallenge: invalid } as unknown as DepthState)).toThrow();
    }
    expect(() => reload({ ...admitted.depth, tick: admitted.tick + 1 })).toThrow();
    const locationId = source.locationId;
    expect(() => reload({ ...admitted.depth, towns: { ...admitted.depth.towns, [locationId]: { ...admitted.depth.towns[locationId]!, reputation: 100 } } })).toThrow();
  });

  it("retains settled history when the actual rival joins later and town reputation changes again", () => {
    const challenge = completed.depth.roomChallenge!, town = completed.depth.towns[challenge.locationId]!;
    // A labelled future roster boundary, using a real resident and the normal
    // companion factory; not a claim that policy recruits this rival next.
    const companion = selectSharedRoadCompanion({ seed: completed.seed, atlas: completed.depth.atlas,
      town: { ...town, residents: town.residents.filter((resident) => resident.id === challenge.residentId) },
      roster: completed.depth.companions, joinedTick: completed.tick + 1, heroLevel: completed.depth.hero.level });
    expect(companion?.identity.residentId).toBe(challenge.residentId);
    const later = { ...completed.depth, tick: completed.tick + 1, companions: addActiveCompanion(completed.depth.companions, companion!),
      towns: { ...completed.depth.towns, [challenge.locationId]: { ...town, reputation: 100 } } };
    expect(isValidCampaignRoomChallenge(later)).toBe(true);
    expect(later.roomChallenge).toEqual(challenge);
    expect(roomChallengeCommandCandidates(later)).toBeNull();
    expect(challenge.result!.sourceCommandId).toBe(roomChallengeCommandId(challenge.result!.tick, { type: "answer-room-challenge", encounterId: challenge.encounterId, responseId: challenge.result!.responseId }));
  });
});
