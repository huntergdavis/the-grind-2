import { beforeAll, describe, expect, it } from "vitest";
import { witnessedEncoreFixture } from "../../tests/repartee-witness-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { reparteeResponses, type ReparteeResponse } from "./repartee";
import { isValidCampaignRepartee, selectWitnessedReparteeVenue, witnessedReparteeEncounterId } from "./repartee-campaign";
import { createReparteeWitnessState } from "./repartee-witness";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}

function begin(state: DepthState): DepthState {
  const candidate = depthCommandCandidates(state)[0]!;
  expect(candidate.command.type).toBe("start-repartee");
  return stepDepth(state, candidate.command);
}

function reply(state: DepthState, style: ReparteeResponse["style"] | "retreat"): DepthState {
  const active = state.repartee.active!;
  const responseId = style === "retreat" ? "retreat" : reparteeResponses(state.repartee).find((entry) => entry.style === style)!.id;
  return stepDepth(state, { type: "repartee-action", encounterId: active.encounterId, roundIndex: active.roundIndex, responseId });
}

describe("one actually witnessed flyting encore", () => {
  let ready: WorldState;
  beforeAll(() => { ready = witnessedEncoreFixture(); });

  it("archives the exact solo contest, declares an actual companion preference, and keeps the earned book", () => {
    const before = ready.depth, witness = before.companions.active[0]!;
    const venue = selectWitnessedReparteeVenue(before)!;
    expect(venue.encounterId).toBe(witnessedReparteeEncounterId(before.hero.id, before.atlas.currentLocationId,
      witness.identity.residentId, witness.joinedTick));
    expect(witness.identity.residentId).not.toBe(before.repartee.completed!.residentId);
    expect(witness.identity.originLocationId).toBe(before.repartee.reading!.locationId);
    const state = begin(before), duel = state.repartee.active!;
    expect(state.reparteeWitness.firstContest).toEqual(before.repartee);
    expect(state.repartee.reading).toEqual(before.repartee.reading);
    expect(state.reparteeWitness.preference).toMatchObject({ witnessId: witness.identity.residentId,
      joinedTick: witness.joinedTick, sourceCommandId: duel.sourceCommandId, declaredTick: duel.startedTick });
    expect(state.reparteeWitness.reaction).toBeNull();
    expect(state.hero).toEqual(before.hero);
    expect(state.companions).toEqual(before.companions);
    expect(state.towns).toEqual(before.towns);
    expect(reload(state)).toEqual(state);
  });

  it("records one cause-bound directional reaction with exact mid-round and final reload and no bond or power award", () => {
    const before = ready.depth, original = before.repartee;
    let state = begin(before);
    for (const style of ["direct", "category", "near"] as const) {
      state = reply(state, style);
      expect(reload(state)).toEqual(state);
      expect(state.hero).toEqual(before.hero);
      expect(state.companions).toEqual(before.companions);
      expect(state.quest).toEqual(before.quest);
      expect(state.reparteeWitness.firstContest).toEqual(original);
    }
    const result = state.repartee.completed!, reaction = state.reparteeWitness.reaction!;
    expect(result.outcome).toBe("draw");
    expect(state.towns).toEqual(before.towns);
    expect(reaction).toMatchObject({ encounterId: result.encounterId, heroId: before.hero.id,
      witnessId: before.companions.active[0]!.identity.residentId, residentId: result.residentId,
      completionCommandId: result.completionCommandId, completedTick: result.completedTick, regardBefore: null,
      preferenceSourceCommandId: state.reparteeWitness.preference!.sourceCommandId });
    expect(result.rounds).toContainEqual(reaction.evidence);
    expect(reaction.regardAfter).toBe(reaction.regardDelta);
    expect(depthCommandCandidates(state).map((entry) => entry.command)).toEqual([
      { type: "plan-route", destinationId: before.companions.active[0]!.destination.locationId },
    ]);
    expect(selectWitnessedReparteeVenue(state)).toBeNull();
    const saved = JSON.stringify(state), last = result.rounds.at(-1)!;
    expect(() => stepDepth(state, { type: "repartee-action", encounterId: result.encounterId,
      roundIndex: last.roundIndex, responseId: last.responseId })).toThrow();
    expect(() => begin(state)).toThrow();
    expect(JSON.stringify(state)).toBe(saved);
    const routed = stepDepth(state, depthCommandCandidates(state)[0]!.command);
    expect(routed.reparteeWitness).toEqual(state.reparteeWitness);
    expect(reload(routed)).toEqual(routed);
  });

  it("also consumes an explicit retreat once, without inventing an unspoken reply", () => {
    const before = ready.depth, state = reply(begin(before), "retreat");
    expect(state.repartee.completed).toMatchObject({ outcome: "retreat", rounds: [], reputationAward: 0 });
    expect(state.reparteeWitness.reaction).toMatchObject({ evidence: null, reactionId: "unmoved",
      regardBefore: null, regardAfter: 0, regardDelta: 0 });
    expect(state.hero).toEqual(before.hero);
    expect(state.companions).toEqual(before.companions);
    expect(state.towns).toEqual(before.towns);
    expect(selectWitnessedReparteeVenue(state)).toBeNull();
    expect(reload(state)).toEqual(state);
  });

  it("does not admit an absent, injured, foreign-town or busy witness, and never makes the witness their own rival", () => {
    const before = ready.depth, witness = before.companions.active[0]!;
    const first = before.repartee.completed!;
    const invalid: DepthState[] = [
      { ...before, companions: { ...before.companions, active: [] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, injury: "wounded" }] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, phase: "arrived" }] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, resources: { ...witness.resources, health: 0 } }] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, identity: { ...witness.identity, originLocationId: "foreign" } }] } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 1 } } },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" } },
      { ...before, repartee: { ...before.repartee, completed: null } },
    ];
    for (const state of invalid) expect(selectWitnessedReparteeVenue(state)).toBeNull();
    const formerRivalPresent = { ...before, companions: { ...before.companions, active: [{ ...witness,
      identity: { ...witness.identity, residentId: first.residentId } }] } };
    expect(selectWitnessedReparteeVenue(formerRivalPresent)?.resident.id).not.toBe(first.residentId);
    const routed = stepDepth(before, { type: "plan-route", destinationId: witness.destination.locationId });
    expect(selectWitnessedReparteeVenue(routed)).toBeNull();
  });

  it("rejects forged declaration, witness, source, reaction, archive and duplicate history on load", () => {
    const active = begin(ready.depth), completed = reply(reply(reply(active, "direct"), "category"), "near");
    for (const base of [active, completed]) {
      const preference = base.reparteeWitness.preference!;
      for (const memory of [
        { ...base.reparteeWitness, preference: { ...preference, sourceCommandId: "invented-source" } },
        { ...base.reparteeWitness, preference: { ...preference, witnessId: "invented-witness" } },
        { ...base.reparteeWitness, preference: { ...preference, joinedTick: preference.joinedTick + 1 } },
        { ...base.reparteeWitness, preference: { ...preference, preferenceId: preference.preferenceId === "precision" ? "humility" : "precision" } },
        { ...base.reparteeWitness, firstContest: base.repartee },
        { ...base.reparteeWitness, duplicate: base.reparteeWitness },
      ]) {
        const forged = { ...base, reparteeWitness: memory } as DepthState;
        expect(isValidCampaignRepartee(forged)).toBe(false);
        expect(() => reload(forged)).toThrow("schema invariants");
      }
    }
    const reaction = completed.reparteeWitness.reaction!;
    for (const patch of [{ completionCommandId: "wrong-source" }, { witnessName: "An absent stranger" },
      { regardBefore: 0 }, { regardAfter: 2 }, { line: "An invented opinion" }, { evidence: null }]) {
      const forged = { ...completed, reparteeWitness: { ...completed.reparteeWitness, reaction: { ...reaction, ...patch } } };
      expect(() => reload(forged as DepthState)).toThrow("schema invariants");
    }
    expect(() => reload({ ...active, companions: { ...active.companions, active: [] } })).toThrow("schema invariants");
  });

  it("loads released v28 solo progress with no invented witness and rejects malformed present records", () => {
    const before = ready.depth, { reparteeWitness: _witness, ...prior } = before;
    const legacy = { ...prior, schemaVersion: 28 };
    const loaded = upgradeDepthState(legacy, before.seed, before.hero.id, before.hero.name);
    expect(loaded.schemaVersion).toBe(33);
    expect(loaded.reparteeWitness).toEqual(createReparteeWitnessState());
    expect(loaded.repartee).toEqual(before.repartee);
    expect(loaded.companions).toEqual(before.companions);
    for (const reparteeWitness of [undefined, null, {}, { schemaVersion: 2, firstContest: null, preference: null, reaction: null }]) {
      expect(() => upgradeDepthState({ ...legacy, reparteeWitness }, before.seed, before.hero.id, before.hero.name)).toThrow("schema invariants");
    }
  });

  it("requires the healthy present witness on the completion tick while retaining history on the later oath route", () => {
    const state = reply(reply(reply(begin(ready.depth), "direct"), "category"), "near");
    const witness = state.companions.active[0]!;
    for (const invalid of [
      { ...state, companions: { ...state.companions, active: [] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, injury: "wounded" }] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, resources: { ...witness.resources, health: 0 } }] } },
      { ...state, atlas: { ...state.atlas, currentLocationId: witness.destination.locationId } },
    ] as DepthState[]) expect(() => reload(invalid)).toThrow("schema invariants");
    const routed = stepDepth(state, { type: "plan-route", destinationId: witness.destination.locationId });
    expect(reload(routed)).toEqual(routed);
    expect(routed.reparteeWitness).toEqual(state.reparteeWitness);
  });

  it("keeps all four encore beats foreground, source-linked, and blocked during hidden catch-up", () => {
    let state = ready;
    for (const commandType of ["start-repartee", "repartee-action", "repartee-action", "repartee-action"]) {
      expect(campaignDirector(state).mode).toBe("chronicle");
      const request = { id: `witness:${state.tick}`, observedAtMs: 100_000 + state.tick,
        elapsedMs: 48_000, requestedTicks: 10 };
      const stopped = catchUpWorld(state, request);
      expect(stopped.tick).toBe(state.tick);
      expect(stopped.depth).toEqual(state.depth);
      expect(stopped.pendingAttention.at(-1)?.commandType).toBe(commandType);
      expect(catchUpWorld(stopped, request)).toBe(stopped);
      state = advanceWorld(state);
      expect(state.chronicle.at(-1)?.commandType).toBe(commandType);
      expect(upgradeWorldState(JSON.parse(canonicalStringify(state)))).toEqual(state);
    }
    expect(`${state.campaignId}:${state.depth.reparteeWitness.reaction!.completionCommandId}`).toBe(state.chronicle.at(-1)!.commandId);
    expect(campaignDirector(state).candidates[0]!.command).toEqual({ type: "plan-route",
      destinationId: state.depth.companions.active[0]!.destination.locationId } satisfies DepthCommand);
  });
});
