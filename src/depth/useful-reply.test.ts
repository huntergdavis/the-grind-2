import { beforeAll, describe, expect, it } from "vitest";
import { naturalUsefulReplyFixture } from "../../tests/useful-reply-fixtures";
import { canonicalStringify } from "../core/canonical";
import { actorPolicy } from "../core/actor-policy";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { addActiveCompanion, selectSharedRoadCompanion } from "./companion";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import { selectPaidInnRest } from "./town-rest";
import type { DepthState } from "./types";
import { isValidCampaignUsefulReply, selectUsefulReplyVenue, usefulReplyBook, usefulReplyCall, usefulReplyCommandCandidates, usefulReplyCommandId, usefulReplyResponses } from "./useful-reply";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}
function immutableFacts(state: DepthState) {
  const { tick: _tick, log: _log, usefulReply: _lesson, ...facts } = state;
  return facts;
}

describe("one useful book and an unscored actual-resident practice reply", () => {
  let ready: WorldState, reading: WorldState, completed: WorldState;
  beforeAll(() => {
    ready = naturalUsefulReplyFixture();
    reading = advanceWorld(ready);
    completed = advanceWorld(reading);
  });

  it("learns only from the actual reading after callback/farewell and uses the new constructive option next", () => {
    expect(ready.depth.usefulReply).toBeNull();
    expect(ready.depth.reparteeCallback).not.toBeNull();
    expect(ready.depth.companions.active).toHaveLength(0);
    expect(usefulReplyResponses(null)).toHaveLength(2);
    expect(usefulReplyResponses(null).some((reply) => reply.classification === "constructive")).toBe(false);
    const lesson = reading.depth.usefulReply!;
    expect(lesson.reading).toMatchObject({ bookId: usefulReplyBook.id, expressionId: usefulReplyBook.expressionId, frameId: usefulReplyBook.frameId, tick: ready.tick + 1 });
    expect(lesson.reply).toBeNull();
    expect(lesson.reading.tick).toBeGreaterThan(ready.depth.companions.former.at(-1)!.departure.tick);
    expect(reading.chronicle.at(-1)).toMatchObject({ commandType: "read-useful-book", commandId: `${reading.campaignId}:${lesson.reading.sourceCommandId}`, tick: lesson.reading.tick });
    expect(usefulReplyResponses(lesson)).toHaveLength(3);
    expect(depthCommandCandidates(reading.depth).every((candidate) => candidate.command.type === "practice-useful-reply")).toBe(true);
    const result = completed.depth.usefulReply!.reply!;
    expect(result).toMatchObject({ classification: "constructive", call: usefulReplyCall.text, readingSourceCommandId: lesson.reading.sourceCommandId, tick: reading.tick + 1 });
    expect(result.reply).toContain("sounding board");
    expect(completed.chronicle.at(-1)).toMatchObject({ commandType: "practice-useful-reply", commandId: `${completed.campaignId}:${result.sourceCommandId}`, tick: result.tick });
    expect(completed.chronicle.at(-1)!.rationale).toContain("actual reading");
  });

  it("changes no resources, progression, old scored transcript, callback, resident reputation, or relationship", () => {
    expect(immutableFacts(reading.depth)).toEqual(immutableFacts(ready.depth));
    expect(immutableFacts(completed.depth)).toEqual(immutableFacts(ready.depth));
    expect(reading.hero).toEqual(ready.hero);
    expect(completed.hero).toEqual(ready.hero);
    expect(completed.scene.consequence).toContain("Unscored practice");
    expect(completed.depth.usefulReply).not.toHaveProperty("score");
    expect(completed.depth.usefulReply).not.toHaveProperty("outcome");
    for (const state of [reading, completed]) {
      expect(reload(state.depth)).toEqual(state.depth);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
    }
  });

  it("keeps both reading and practice foreground when background time accumulates", () => {
    for (const before of [ready, reading]) {
      const request = { id: `useful-reply:${before.tick}`, observedAtMs: 100_000 + before.tick,
        elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(before, request);
      expect(stopped.tick).toBe(before.tick);
      expect(stopped.depth).toEqual(before.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(campaignDirector(before).candidates[0]!.command.type);
      expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
    }
  });

  it("keeps plain alternatives honest and consumes every selected practice outcome once", () => {
    for (const response of usefulReplyResponses(reading.depth.usefulReply)) {
      const after = stepDepth(reading.depth, { type: "practice-useful-reply", lessonId: reading.depth.usefulReply!.lessonId, responseId: response.id });
      expect(after.usefulReply!.reply).toMatchObject({ reply: response.text, classification: response.classification,
        readingSourceCommandId: response.frameId === null ? null : reading.depth.usefulReply!.reading.sourceCommandId });
      expect(immutableFacts(after)).toEqual(immutableFacts(reading.depth));
      expect(usefulReplyCommandCandidates(after)).toBeNull();
      expect(() => stepDepth(after, { type: "practice-useful-reply", lessonId: after.usefulReply!.lessonId, responseId: response.id })).toThrow();
    }
    expect(campaignDirector(completed).candidates.every((candidate) => !["read-useful-book", "practice-useful-reply"].includes(candidate.command.type))).toBe(true);
    const continued = advanceWorld(completed);
    expect(continued.tick).toBe(completed.tick + 1);
    expect(continued.depth.usefulReply).toEqual(completed.depth.usefulReply);
    expect(reload(continued.depth)).toEqual(continued.depth);
  });

  it("rejects unknown, stale and foreign reply/source commands without inventing learning", () => {
    const readCommand = depthCommandCandidates(ready.depth)[0]!.command;
    expect(readCommand.type).toBe("read-useful-book");
    expect(() => stepDepth(reading.depth, readCommand)).toThrow();
    expect(() => stepDepth(completed.depth, readCommand)).toThrow();
    expect(() => stepDepth(reading.depth, { type: "wait" })).toThrow();
    expect(() => stepDepth(reading.depth, { type: "practice-useful-reply", lessonId: reading.depth.usefulReply!.lessonId, responseId: "unlearned" })).toThrow();
    expect(() => stepDepth(ready.depth, { type: "practice-useful-reply", lessonId: "foreign", responseId: "invite-useful-leadership" })).toThrow();
    const opportunity = campaignDirector(reading), real = opportunity.candidates[0]!;
    expect(() => actorPolicy(reading, { ...opportunity, candidates: [{ ...real, id: "foreign-command" }] })).toThrow();
    expect(actorPolicy(reading, { ...opportunity, candidates: [{ ...real, id: "foreign-command" }, ...opportunity.candidates] }).commandId).toBe(`${reading.campaignId}:${real.id}`);
  });

  it("rejects malformed or rewritten saves while old Depth32 saves migrate to no lesson", () => {
    const { usefulReply: _lesson, ...old } = ready.depth;
    expect(reload({ ...old, schemaVersion: 32 } as unknown as DepthState)).toMatchObject({ schemaVersion: 34, usefulReply: null });
    for (const invalid of [undefined, {}, { ...reading.depth.usefulReply!, contentVersion: 2 }, { ...reading.depth.usefulReply!, extra: true },
      { ...reading.depth.usefulReply!, reading: { ...reading.depth.usefulReply!.reading, frameId: "invented" } },
      { ...reading.depth.usefulReply!, reading: { ...reading.depth.usefulReply!.reading, sourceCommandId: "foreign-reading" } },
      { ...completed.depth.usefulReply!, reply: { ...completed.depth.usefulReply!.reply!, reply: "I won a crown." } },
      { ...completed.depth.usefulReply!, reply: { ...completed.depth.usefulReply!.reply!, readingSourceCommandId: "foreign-book" } },
      { ...completed.depth.usefulReply!, reply: { ...completed.depth.usefulReply!.reply!, tick: completed.tick + 1 } }]) {
      expect(() => reload({ ...completed.depth, usefulReply: invalid } as DepthState)).toThrow();
      // JSON omits undefined, so that one legacy encoding is genuinely absent.
      if (invalid !== undefined) expect(() => reload({ ...old, schemaVersion: 32, usefulReply: invalid } as unknown as DepthState)).toThrow();
    }
    expect(() => upgradeDepthState({ ...old, schemaVersion: 32, usefulReply: undefined }, ready.seed, ready.hero.id, ready.hero.name)).toThrow();
    expect(() => reload({ ...reading.depth, tick: reading.tick + 1 })).toThrow();
    const otherResident = reading.depth.towns[reading.depth.usefulReply!.locationId]!.residents.find((entry) => entry.id !== reading.depth.usefulReply!.residentId)!;
    expect(() => reload({ ...reading.depth, usefulReply: { ...reading.depth.usefulReply!, residentId: otherResident.id, residentName: otherResident.name, buildingId: otherResident.homeBuildingId } })).toThrow();
  });

  it("requires an actual safe solo venue and never preempts paid rest, current encounters, or owed farewell", () => {
    expect(selectUsefulReplyVenue(ready.depth)).not.toBeNull();
    const locationId = ready.depth.atlas.currentLocationId, town = ready.depth.towns[locationId]!;
    for (const blocked of [
      { ...ready.depth, reparteeCallback: null },
      { ...ready.depth, companions: { ...ready.depth.companions, former: [] } },
      { ...ready.depth, towns: { ...ready.depth.towns, [locationId]: { ...town, visits: 0 } } },
      { ...ready.depth, towns: { ...ready.depth.towns, [locationId]: { ...town, residents: [] } } },
      { ...ready.depth, atlas: { ...ready.depth.atlas, discoveredLocationIds: [] } },
      { ...ready.depth, hero: { ...ready.depth.hero, resources: { ...ready.depth.hero.resources, health: 0 } } },
    ]) expect(selectUsefulReplyVenue(blocked)).toBeNull();
    // Explicit resource boundary, not a claimed naturally needed inn stop.
    const lowMana = { ...ready.depth, hero: { ...ready.depth.hero, gold: Math.max(5, ready.depth.hero.gold), resources: { ...ready.depth.hero.resources, mana: 0 } } };
    expect(selectPaidInnRest(lowMana)).not.toBeNull();
    expect(selectUsefulReplyVenue(lowMana)).toBeNull();
    expect(depthCommandCandidates(lowMana)[0]!.command.type).not.toBe("read-useful-book");
  });

  it("retains the completed lesson if its real local partner joins the party later", () => {
    const lesson = completed.depth.usefulReply!, town = completed.depth.towns[lesson.locationId]!;
    // A labelled future roster boundary using the actual resident and normal
    // companion factory, not a claim that policy naturally picks this person next.
    const companion = selectSharedRoadCompanion({ seed: completed.seed, atlas: completed.depth.atlas,
      town: { ...town, residents: town.residents.filter((entry) => entry.id === lesson.residentId) },
      roster: completed.depth.companions, joinedTick: completed.tick + 1, heroLevel: completed.depth.hero.level });
    expect(companion?.identity.residentId).toBe(lesson.residentId);
    const future = { ...completed.depth, tick: completed.tick + 1, companions: addActiveCompanion(completed.depth.companions, companion!) };
    expect(isValidCampaignUsefulReply(future)).toBe(true);
    expect(future.usefulReply).toEqual(lesson);
    expect(usefulReplyCommandCandidates(future)).toBeNull();
    expect(lesson.reply!.sourceCommandId).toBe(usefulReplyCommandId(lesson.reply!.tick, { type: "practice-useful-reply", lessonId: lesson.lessonId, responseId: lesson.reply!.responseId }));
  });
});
