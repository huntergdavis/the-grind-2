import { beforeAll, describe, expect, it } from "vitest";
import { naturalReparteeMemoryFixture } from "../../tests/repartee-memory-fixtures";
import { canonicalStringify } from "../core/canonical";
import { advanceWorld, campaignDirector, catchUpWorld, upgradeWorldState } from "../core/simulation";
import type { WorldState } from "../core/types";
import { createSpectatorInbox, observeSpectatorInbox } from "../ui/spectator-inbox";
import { isValidCampaignReparteeCallback, selectReparteeCallback } from "./repartee-memory";
import { depthCommandCandidates, stepDepth, upgradeDepthState } from "./state";
import type { DepthCommand, DepthState } from "./types";

function reload(state: DepthState): DepthState {
  return upgradeDepthState(JSON.parse(canonicalStringify(state)), state.seed, state.hero.id, state.hero.name);
}

// The natural journey may choose a different legal answer as other adventures
// evolve. Fixed legal-outcome coverage lives in repartee-memory.test.ts; here
// the exact authored callback must match whichever judgment was really earned.
const expectedCallbacks = {
  "precision-counter": { pose: "nod", regard: 1, line: "I kept turning that answer over on the road. It still holds." },
  "precision-evasion": { pose: "frown", regard: -1, line: "That answer followed us all this way. The question never did get one." },
  "hollow-boast": { pose: "frown", regard: -1, line: "I remember the volume. I still wanted a reason to follow." },
  "honest-admission": { pose: "nod", regard: 1, line: "I kept thinking about that admission. I am glad you did not dress it up." },
  "culinary-absurdity": { pose: "laugh", regard: 1, line: "All that road, and that is still the bit that makes me laugh." },
  unmoved: { pose: "quiet", regard: 0, line: "I remember it clearly. I am still not sure what to make of it." },
} as const;

describe("one source-backed shared memory before the actual oath farewell", () => {
  let ready: WorldState;
  beforeAll(() => { ready = naturalReparteeMemoryFixture(); });

  it("recalls the actual contest, spoken answer and judgment without changing regard, bond, resources, or other rewards", () => {
    const before = ready.depth, reaction = before.reparteeWitness.reaction!;
    const contest = before.repartee.completed!, expected = expectedCallbacks[reaction.reactionId as keyof typeof expectedCallbacks];
    const witness = before.companions.active[0]!, proposed = selectReparteeCallback(before)!;
    expect(before.reparteeCallback).toBeNull();
    expect(witness).toMatchObject({ phase: "arrived", injury: "none" });
    expect(witness.resources.health).toBeGreaterThan(0);
    expect(before.atlas.currentLocationId).toBe(witness.destination.locationId);
    expect(before.atlas.currentLocationId).not.toBe(reaction.locationId);
    expect(expected).toBeDefined();
    expect(contest.rounds).toContainEqual(reaction.evidence);
    expect(reaction).toMatchObject({ encounterId: contest.encounterId, outcome: contest.outcome,
      completedTick: contest.completedTick, completionCommandId: contest.completionCommandId,
      pose: expected.pose, regardAfter: expected.regard, regardDelta: expected.regard });
    const after = advanceWorld(ready), receipt = after.depth.reparteeCallback!;
    expect(receipt).toEqual(proposed);
    expect(receipt).toMatchObject({ encounterId: reaction.encounterId, heroId: before.hero.id,
      witnessId: witness.identity.residentId, witnessName: witness.identity.name, joinedTick: witness.joinedTick,
      sourceReactionCommandId: reaction.completionCommandId, sourceReactionTick: reaction.completedTick,
      sourceReactionId: reaction.reactionId, evidenceSourceCommandId: reaction.evidence!.sourceCommandId,
      evidenceRoundIndex: reaction.evidence!.roundIndex, rememberedReply: reaction.evidence!.reply,
      restLocationId: witness.destination.locationId, tick: before.tick + 1, pose: expected.pose });
    const actualQuote = reaction.evidence!.reply.match(/^[\s\S]*?[.!?](?=\s|$)/u)?.[0] ?? reaction.evidence!.reply;
    expect(receipt.line).toBe(`“${actualQuote}” ${expected.line}`);
    expect(after.depth.hero).toEqual(before.hero);
    expect(after.hero).toEqual(ready.hero);
    expect(after.depth.companions).toEqual(before.companions);
    expect(after.depth.reparteeWitness).toEqual(before.reparteeWitness);
    expect(after.depth.repartee).toEqual(before.repartee);
    expect(after.depth.towns).toEqual(before.towns);
    expect(after.depth.quest).toEqual(before.quest);
    expect(after.chronicle.at(-1)).toMatchObject({ commandType: "recall-repartee", mode: "chronicle",
      commandId: `${after.campaignId}:${receipt.sourceCommandId}`, tick: receipt.tick });
    expect(reload(after.depth)).toEqual(after.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(after)))).toEqual(after);
  });

  it("consumes the scene once, then resumes the existing farewell and preserves the memory after departure", () => {
    const after = advanceWorld(ready), receipt = after.depth.reparteeCallback!;
    const witness = after.depth.companions.active[0]!;
    expect(selectReparteeCallback(after.depth)).toBeNull();
    expect(campaignDirector(after).candidates.map(entry => entry.command)).toEqual([
      { type: "farewell-companion", residentId: witness.identity.residentId },
    ]);
    const departed = advanceWorld(after);
    expect(departed.chronicle.at(-1)?.commandType).toBe("farewell-companion");
    expect(departed.depth.companions.active).toHaveLength(0);
    expect(departed.depth.companions.former.at(-1)?.departure.tick).toBeGreaterThan(receipt.tick);
    expect(departed.depth.reparteeCallback).toEqual(receipt);
    expect(departed.depth.reparteeWitness).toEqual(after.depth.reparteeWitness);
    expect(selectReparteeCallback(departed.depth)).toBeNull();
    expect(isValidCampaignReparteeCallback(departed.depth)).toBe(true);
    expect(reload(departed.depth)).toEqual(departed.depth);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(departed)))).toEqual(departed);
    for (const state of [after.depth, departed.depth]) expect(() => stepDepth(state,
      { type: "recall-repartee", encounterId: receipt.encounterId, witnessId: receipt.witnessId })).toThrow();
  });

  it("rejects wrong encounter or witness commands atomically instead of awarding or rewriting a memory", () => {
    const candidate = depthCommandCandidates(ready.depth)[0]!.command;
    expect(candidate.type).toBe("recall-repartee");
    const receipt = selectReparteeCallback(ready.depth)!;
    const saved = canonicalStringify(ready.depth);
    for (const command of [
      { type: "recall-repartee", encounterId: "invented-contest", witnessId: receipt.witnessId },
      { type: "recall-repartee", encounterId: receipt.encounterId, witnessId: "absent-witness" },
    ] satisfies DepthCommand[]) {
      expect(() => stepDepth(ready.depth, command)).toThrow();
      expect(canonicalStringify(ready.depth)).toBe(saved);
    }
  });

  it("does not offer a callback to absent, fallen, injured, still-travelling, dead-hero or quest-busy parties", () => {
    const before = ready.depth, witness = before.companions.active[0]!;
    const cases: DepthState[] = [
      { ...before, companions: { ...before.companions, active: [] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, phase: "travelling" }] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, injury: "wounded" }] } },
      { ...before, companions: { ...before.companions, active: [{ ...witness, injury: "fallen", resources: { ...witness.resources, health: 0 } }] } },
      { ...before, hero: { ...before.hero, resources: { ...before.hero.resources, health: 0 } } },
      { ...before, quest: { ...before.quest, status: "ready-to-fulfill" } },
      { ...before, atlas: { ...before.atlas, currentLocationId: witness.identity.originLocationId } },
    ];
    for (const state of cases) expect(selectReparteeCallback(state)).toBeNull();
    // A discovered atlas destination is enough: no inn visit, invented building,
    // paid service or healing is required for a quiet arrival pause.
    const { [witness.destination.locationId]: _destinationTown, ...otherTowns } = before.towns;
    expect(selectReparteeCallback({ ...before, towns: otherTowns })).toEqual(selectReparteeCallback(before));
  });

  it("rejects forged source, remembered words, identity, pose, location, tick and duplicate fields on load", () => {
    const after = advanceWorld(ready).depth, receipt = after.reparteeCallback!;
    for (const patch of [
      { sourceReactionCommandId: "invented-reaction" }, { sourceReactionTick: receipt.sourceReactionTick + 1 },
      { evidenceSourceCommandId: "invented-round" }, { evidenceRoundIndex: 99 }, { rememberedReply: "Words never spoken" },
      { witnessId: "absent-witness" }, { witnessName: "An absent stranger" }, { heroId: "another-hero" },
      { joinedTick: receipt.joinedTick + 1 }, { restLocationId: ready.depth.reparteeWitness.reaction!.locationId },
      { sourceCommandId: "invented-memory" },
      { sourceReactionId: receipt.sourceReactionId === "honest-admission" ? "unmoved" : "honest-admission" },
      { pose: receipt.pose === "frown" ? "quiet" : "frown" },
      { line: "An invented callback" }, { tick: after.tick + 1 }, { duplicate: receipt },
    ]) {
      const forged = { ...after, reparteeCallback: { ...receipt, ...patch } } as DepthState;
      expect(forged.reparteeCallback).not.toEqual(receipt);
      expect(isValidCampaignReparteeCallback(forged)).toBe(false);
      expect(() => reload(forged)).toThrow("schema invariants");
    }
  });

  it("requires real healthy presence on the callback tick, without deleting later legitimate history", () => {
    const after = advanceWorld(ready).depth, witness = after.companions.active[0]!;
    for (const invalid of [
      { ...after, companions: { ...after.companions, active: [] } },
      { ...after, companions: { ...after.companions, active: [{ ...witness, injury: "wounded" }] } },
      { ...after, companions: { ...after.companions, active: [{ ...witness, injury: "fallen", resources: { ...witness.resources, health: 0 } }] } },
      { ...after, atlas: { ...after.atlas, currentLocationId: witness.identity.originLocationId } },
    ] as DepthState[]) expect(() => reload(invalid)).toThrow("schema invariants");
    const later = advanceWorld(advanceWorld(ready)).depth;
    expect(isValidCampaignReparteeCallback(later)).toBe(true);
    expect(reload(later)).toEqual(later);
  });

  it("migrates released v29 saves with no fabricated callback, rejecting malformed present fields", () => {
    const before = ready.depth, { reparteeCallback: _callback, ...prior } = before;
    const legacy = { ...prior, schemaVersion: 29 };
    const loaded = upgradeDepthState(legacy, before.seed, before.hero.id, before.hero.name);
    expect(loaded.schemaVersion).toBe(35);
    expect(loaded.reparteeCallback).toBeNull();
    expect(loaded.reparteeWitness).toEqual(before.reparteeWitness);
    expect(loaded.companions).toEqual(before.companions);
    for (const reparteeCallback of [undefined, {}, { schemaVersion: 2 }]) {
      expect(() => upgradeDepthState({ ...legacy, reparteeCallback }, before.seed, before.hero.id, before.hero.name)).toThrow("schema invariants");
    }
  });

  it("stops hidden catch-up before speaking the one foreground memory", () => {
    expect(campaignDirector(ready).mode).toBe("chronicle");
    const request = { id: "witness-memory:arrival", observedAtMs: 100_000, elapsedMs: 48_000, requestedTicks: 10 };
    const stopped = catchUpWorld(ready, request);
    expect(stopped.tick).toBe(ready.tick);
    expect(stopped.depth).toEqual(ready.depth);
    expect(stopped.depth.reparteeCallback).toBeNull();
    expect(stopped.pendingAttention.at(-1)?.commandType).toBe("recall-repartee");
    expect(stopped.lifecycle.wallClockJournal.at(-1)?.appliedTicks).toBe(0);
    expect(catchUpWorld(stopped, request)).toBe(stopped);
    expect(upgradeWorldState(JSON.parse(canonicalStringify(stopped)))).toEqual(stopped);
  });

  it("adds one separately source-bound memory to the existing spectator inbox", () => {
    const after = advanceWorld(ready), receipt = after.depth.reparteeCallback!;
    const inbox = observeSpectatorInbox(createSpectatorInbox(ready), ready, after, true);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({ kind: "discovery", title: "A shared memory before parting",
      status: "resolved", sourceId: after.chronicle.at(-1)!.id });
    expect(inbox.items[0]!.details.join("\n")).toContain(receipt.line);
    expect(inbox.items[0]!.details.join("\n")).toContain(receipt.rememberedReply);
    expect(observeSpectatorInbox(inbox, ready, after, true)).toBe(inbox);
    const wrongCampaign = { ...after, chronicle: [{ ...after.chronicle.at(-1)!,
      commandId: `campaign:someone-else:${receipt.sourceCommandId}` }] };
    const forged = observeSpectatorInbox(createSpectatorInbox(ready), ready, wrongCampaign, true);
    expect(forged.items.some(item => item.title === "A shared memory before parting")).toBe(false);
  });
});
