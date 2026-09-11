import { describe, expect, it } from "vitest";
import { witnessedEncoreFixture } from "../../tests/repartee-witness-fixtures";
import { reparteeResponses, type ReparteeResponse } from "./repartee";
import { isValidCampaignRepartee } from "./repartee-campaign";
import { isValidCampaignReparteeCallback, reparteeCallbackCommandId, selectReparteeCallback, type ReparteeCallback } from "./repartee-memory";
import { depthCommandCandidates, stepDepth } from "./state";
import type { DepthState } from "./types";

const readyBySeed = new Map<string, DepthState>();

function rememberedArrival(seed = "shared-road-playful:7", styles: readonly (ReparteeResponse["style"] | "retreat")[] = ["direct", "category", "near"]): DepthState {
  let ready = readyBySeed.get(seed);
  if (ready === undefined) {
    ready = witnessedEncoreFixture("campaign:repartee-memory-rules", seed).depth;
    readyBySeed.set(seed, ready);
  }
  let state = stepDepth(ready, depthCommandCandidates(ready)[0]!.command);
  for (const style of styles) {
    const active = state.repartee.active!;
    const responseId = style === "retreat" ? style : reparteeResponses(state.repartee).find((entry) => entry.style === style)!.id;
    state = stepDepth(state, { type: "repartee-action", encounterId: active.encounterId, roundIndex: active.roundIndex, responseId });
  }
  state = stepDepth(state, { type: "plan-route", destinationId: state.companions.active[0]!.destination.locationId });
  // Explicit command-based arrival fixture, not a claimed natural autonomous road journey.
  state = stepDepth(state, { type: "travel", distance: state.atlas.route!.totalDistance });
  expect(isValidCampaignRepartee(state)).toBe(true);
  return state;
}

function committed(state: DepthState, callback = selectReparteeCallback(state)!): DepthState {
  // Pure validation fixture. Integration tests separately execute the real callback command.
  return { ...state, tick: callback.tick, reparteeCallback: callback };
}

describe("one source-backed memory at the actual oath destination", () => {
  it("recalls the legally chosen failed joke with an exact laugh and no second reward or rewritten history", () => {
    const state = rememberedArrival("shared-road-playful:7", ["direct", "category", "category"]), before = JSON.stringify(state);
    const callback = selectReparteeCallback(state)!;
    const reaction = state.reparteeWitness.reaction!, evidence = reaction.evidence!, witness = state.companions.active[0]!;
    // This explicit command fixture really chose the losing culinary answer;
    // unlike the natural journey, its outcome is not an autoplay assumption.
    expect(reaction).toMatchObject({ reactionId: "culinary-absurdity", outcome: "defeat", regardAfter: 1, pose: "laugh" });
    expect(evidence).toMatchObject({ roundIndex: 1,
      reply: "Then I demand a smaller spoon. No proper pudding should require this much shouting." });
    expect(callback).toMatchObject({
      schemaVersion: 1, rulesVersion: "repartee-callback-v1", encounterId: reaction.encounterId,
      heroId: reaction.heroId, witnessId: witness.identity.residentId, witnessName: witness.identity.name,
      joinedTick: witness.joinedTick, sourceReactionCommandId: reaction.completionCommandId,
      sourceReactionTick: reaction.completedTick, sourceReactionId: reaction.reactionId,
      evidenceSourceCommandId: evidence.sourceCommandId, evidenceRoundIndex: evidence.roundIndex,
      rememberedReply: evidence.reply, restLocationId: witness.destination.locationId,
      tick: state.tick + 1, pose: "laugh",
    });
    expect(callback.sourceCommandId).toBe(reparteeCallbackCommandId(callback.tick, callback.encounterId, callback.witnessId));
    expect(callback.restLocationId).not.toBe(reaction.locationId);
    expect(callback.line).toBe("“Then I demand a smaller spoon.” All that road, and that is still the bit that makes me laugh.");
    expect(callback).not.toHaveProperty("regardDelta");
    expect(callback).not.toHaveProperty("restBuildingId");
    expect(JSON.stringify(state)).toBe(before);
    expect(selectReparteeCallback(state)).toEqual(callback);
    const after = stepDepth(state, { type: "recall-repartee", encounterId: callback.encounterId, witnessId: callback.witnessId });
    expect(after.reparteeCallback).toEqual(callback);
    expect(after.hero).toEqual(state.hero);
    expect(after.companions).toEqual(state.companions);
    expect(after.reparteeWitness).toEqual(state.reparteeWitness);
    expect(after.repartee).toEqual(state.repartee);
    expect(after.towns).toEqual(state.towns);
    expect(after.quest).toEqual(state.quest);
    expect(isValidCampaignReparteeCallback(after)).toBe(true);
    expect(selectReparteeCallback(after)).toBeNull();
  });

  it("preserves disagreement, regard despite defeat and a quiet unresolved opinion instead of congratulating everyone", () => {
    const cases = [
      { seed: "shared-road-playful:0", styles: ["direct", "category", "category"], id: "precision-counter", outcome: "defeat", pose: "nod", line: "It still holds" },
      { seed: "shared-road-playful:0", styles: ["category", "category", "category"], id: "precision-evasion", outcome: "defeat", pose: "frown", line: "question never did get one" },
      { seed: "shared-road-lifecycle", styles: ["direct", "personality", "direct"], id: "hollow-boast", outcome: "victory", pose: "frown", line: "I remember the volume" },
      { seed: "shared-road-lifecycle", styles: ["personality", "near", "near"], id: "honest-admission", outcome: "draw", pose: "nod", line: "thinking about that admission" },
      { seed: "shared-road-playful:7", styles: ["direct", "direct", "direct"], id: "unmoved", outcome: "victory", pose: "quiet", line: "still not sure" },
    ] as const;
    for (const testCase of cases) {
      const state = rememberedArrival(testCase.seed, testCase.styles), reaction = state.reparteeWitness.reaction!;
      expect(reaction).toMatchObject({ reactionId: testCase.id, outcome: testCase.outcome });
      const callback = selectReparteeCallback(state)!;
      expect(callback).toMatchObject({ sourceReactionId: testCase.id, pose: testCase.pose });
      expect(callback.line).toContain(testCase.line);
      expect(isValidCampaignReparteeCallback(committed(state, callback))).toBe(true);
      expect(state.reparteeWitness.reaction).toBe(reaction);
    }
  });

  it("requires exact retained spoken evidence and does not invent a quote after immediate retreat", () => {
    const retreat = rememberedArrival("shared-road-playful:7", ["retreat"]);
    expect(retreat.reparteeWitness.reaction!.evidence).toBeNull();
    expect(selectReparteeCallback(retreat)).toBeNull();
    const state = rememberedArrival(), reaction = state.reparteeWitness.reaction!;
    for (const memory of [
      { ...state.reparteeWitness, reaction: null },
      { ...state.reparteeWitness, firstContest: null },
      { ...state.reparteeWitness, reaction: { ...reaction, evidence: null } },
      { ...state.reparteeWitness, reaction: { ...reaction, evidence: { ...reaction.evidence!, reply: "A line nobody said." } } },
    ]) expect(selectReparteeCallback({ ...state, reparteeWitness: memory })).toBeNull();
  });

  it("rejects an absent, hurt, travelling, foreign, busy or already-recalled audience without delaying farewell", () => {
    const state = rememberedArrival(), witness = state.companions.active[0]!, callback = selectReparteeCallback(state)!;
    const variants: DepthState[] = [
      { ...state, companions: { ...state.companions, active: [] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, phase: "travelling" }] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, injury: "wounded" }] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, resources: { ...witness.resources, health: 0 } }] } },
      { ...state, companions: { ...state.companions, active: [{ ...witness, joinedTick: witness.joinedTick + 1 }] } },
      { ...state, hero: { ...state.hero, resources: { ...state.hero.resources, health: 0 } } },
      { ...state, atlas: { ...state.atlas, currentLocationId: witness.identity.originLocationId } },
      { ...state, atlas: { ...state.atlas, discoveredLocationIds: state.atlas.discoveredLocationIds.filter((id) => id !== witness.destination.locationId) } },
      { ...state, quest: { ...state.quest, status: "ready-to-fulfill" } },
      { ...state, tick: state.reparteeWitness.reaction!.completedTick },
      { ...state, tick: Number.MAX_SAFE_INTEGER },
      committed(state, callback),
    ];
    for (const variant of variants) expect(selectReparteeCallback(variant)).toBeNull();
  });

  it("validates exact saved identity, source, place, prose and pose instead of trusting modified memories", () => {
    const state = rememberedArrival(), callback = selectReparteeCallback(state)!;
    const recorded = committed(state, callback);
    expect(isValidCampaignReparteeCallback(recorded)).toBe(true);
    expect(isValidCampaignReparteeCallback(JSON.parse(JSON.stringify(recorded)))).toBe(true);
    const changes: readonly Record<string, unknown>[] = [
      { schemaVersion: 2 }, { rulesVersion: "unversioned" }, { encounterId: "foreign" }, { heroId: "foreign" },
      { witnessId: "absent" }, { witnessName: "An invented witness" }, { joinedTick: callback.joinedTick + 1 },
      { sourceReactionCommandId: "foreign" }, { sourceReactionTick: callback.sourceReactionTick + 1 }, { sourceReactionId: "invented" },
      { evidenceSourceCommandId: "foreign" }, { evidenceRoundIndex: 9 }, { rememberedReply: "Nobody said this." },
      { restLocationId: "imaginary-inn" }, { sourceCommandId: "foreign" }, { tick: callback.tick + 1 },
      { pose: "frown" }, { line: "Everybody forgave everything." }, { extraReward: 1 },
    ];
    for (const change of changes) expect(isValidCampaignReparteeCallback({ ...recorded,
      reparteeCallback: { ...callback, ...change } as ReparteeCallback })).toBe(false);
    expect(isValidCampaignReparteeCallback({ ...recorded, reparteeCallback: undefined } as unknown as DepthState)).toBe(false);
    expect(isValidCampaignReparteeCallback({ ...state, reparteeCallback: null })).toBe(true);
  });

  it("requires actual presence on the callback tick, then retains the memory after a later real farewell", () => {
    const state = rememberedArrival(), recorded = committed(state), callback = recorded.reparteeCallback!;
    const witness = recorded.companions.active[0]!;
    expect(isValidCampaignReparteeCallback({ ...recorded, companions: { ...recorded.companions,
      active: [{ ...witness, resources: { ...witness.resources, health: 0 } }] } })).toBe(false);
    expect(isValidCampaignReparteeCallback({ ...recorded, atlas: { ...recorded.atlas, currentLocationId: witness.identity.originLocationId } })).toBe(false);
    const later = stepDepth(recorded, { type: "farewell-companion", residentId: witness.identity.residentId });
    expect(later.companions.active).toHaveLength(0);
    expect(later.companions.former.at(-1)!.departure.tick).toBeGreaterThan(callback.tick);
    expect(later.reparteeCallback).toEqual(callback);
    expect(isValidCampaignReparteeCallback(later)).toBe(true);
    expect(selectReparteeCallback(later)).toBeNull();
    const departed = later.companions.former.at(-1)!;
    expect(isValidCampaignReparteeCallback({ ...later, companions: { ...later.companions,
      former: [{ ...departed, departure: { ...departed.departure, tick: callback.tick } }] } })).toBe(false);
  });
});
