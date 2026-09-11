import { describe, expect, it } from "vitest";
import { naturalReunionWitnessMemoryFixture, releasedCompanionReunionFixture } from "../../tests/reunion-witness-memory-fixtures";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { advanceWorld, upgradeWorldState } from "../core/simulation";
import { companionReunionLines, companionReunionMemoryLines, isValidCampaignCompanionReunion, selectCompanionReunion } from "./companion-reunion";
import { stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";

describe("one exact witnessed line returns with an earned reunion", () => {
  it("quotes the same actual witness's answer without changing the earlier reaction or adding a command", () => {
    const { before, completed, next } = naturalReunionWitnessMemoryFixture();
    const reunion = completed.depth.companionReunion!, spoken = reunion.completed!, memory = spoken.memory!;
    const reaction = before.depth.reparteeWitness.reaction!, evidence = reaction.evidence!;
    expect(before.tick).toBe(85);
    expect(completed.tick).toBe(86);
    expect(next.tick).toBe(87);
    expect(before.depth.companionReunion!.completed).toBeNull();
    expect(memory).toEqual({ schemaVersion: 1, rulesVersion: "reunion-witness-memory-v1",
      heroId: before.hero.id, witnessId: reaction.witnessId, joinedTick: reaction.joinedTick,
      encounterId: reaction.encounterId, sourceReactionCommandId: reaction.completionCommandId,
      sourceReactionTick: reaction.completedTick, sourceReactionId: reaction.reactionId,
      evidenceSourceCommandId: evidence.sourceCommandId, evidenceRoundIndex: evidence.roundIndex,
      rememberedReply: evidence.reply, quote: "I will accept being called cautious.",
      pose: reaction.pose, outcome: reaction.outcome, regardAfter: reaction.regardAfter });
    expect(memory).toMatchObject({ sourceReactionId: "unmoved", outcome: "draw", regardAfter: 0, pose: "quiet" });
    expect(spoken.heroLine).toBe("I brought an old line back with me: “I will accept being called cautious.”");
    expect(spoken.companionLine).toBe("It is exactly as I remember. I am still not sure what to make of it.");
    const former = completed.depth.companions.former.find(entry => entry.identity.residentId === memory.witnessId && entry.joinedTick === memory.joinedTick)!;
    expect(former.identity.name).toBe(reunion.companionName);
    expect(memory.sourceReactionTick).toBeLessThan(former.departure.tick);
    expect(former.departure.tick).toBeLessThan(reunion.arrival.tick);
    expect(reunion.arrival.tick).toBeLessThan(spoken.tick);
    expect(completed.chronicle.at(-1)).toMatchObject({ commandType: "reunite-companion", tick: spoken.tick,
      commandId: `${completed.campaignId}:${spoken.sourceCommandId}` });
    expect(completed.hero).toEqual(before.hero);
    const { tick: _beforeTick, log: _beforeLog, companionReunion: _beforeReunion, ...beforeFacts } = before.depth;
    const { tick: _afterTick, log: _afterLog, companionReunion: _afterReunion, ...afterFacts } = completed.depth;
    expect(afterFacts).toEqual(beforeFacts);
    expect(next.depth.companionReunion).toEqual(reunion);
    expect(next.chronicle.at(-1)?.commandType).not.toBe("reunite-companion");
    expect(selectCompanionReunion(completed.depth)).toBeNull();
    expect(() => stepDepth(completed.depth, { type: "reunite-companion", residentId: reunion.residentId,
      joinedTick: reunion.joinedTick, arrivalTick: reunion.arrival.tick })).toThrow();
    expect(upgradeWorldState(JSON.parse(canonicalStringify(completed)))).toEqual(completed);
  });

  it("keeps the six authored reactions distinct without claiming six natural campaign outcomes", () => {
    // Copy-unit cases only. Actual source admission above earns the unmoved branch.
    const expected = {
      "precision-counter": "A sound answer travels well. The score never was the reason I remembered it.",
      "precision-evasion": "I remember the detour. The question is still waiting where you left it.",
      "hollow-boast": "The echo arrived first. I am still waiting for the argument.",
      "honest-admission": "You left the pretence out. An honest limit still travels better than borrowed swagger.",
      "culinary-absurdity": "The judges had their score. I had that sentence. I still know which I would keep.",
      unmoved: "It is exactly as I remember. I am still not sure what to make of it.",
    };
    for (const [sourceReactionId, companionLine] of Object.entries(expected)) {
      expect(companionReunionMemoryLines({ sourceReactionId, quote: "A recorded sentence." })).toEqual({
        heroLine: "I brought an old line back with me: “A recorded sentence.”", companionLine });
    }
    expect(() => companionReunionMemoryLines({ sourceReactionId: "invented-universal-applause", quote: "A recorded sentence." })).toThrow();
  });

  it("loads the exact released v177 greeting without retroactively adding a quotation", () => {
    const old = releasedCompanionReunionFixture(), original = canonicalStringify(old);
    expect(canonicalHash(old)).toBe("d9cce50f7bc14aa8");
    const reunion = old.depth.companionReunion!, spoken = reunion.completed!;
    expect(Object.hasOwn(spoken, "memory")).toBe(false);
    expect(spoken).toEqual({ sourceCommandId: spoken.sourceCommandId, tick: spoken.tick,
      ...companionReunionLines(reunion.sharedVictories) });
    expect(isValidCampaignCompanionReunion(old.depth)).toBe(true);
    expect(upgradeWorldState(JSON.parse(original))).toEqual(old);
    expect(selectCompanionReunion(old.depth)).toBeNull();
    expect(advanceWorld(old).depth.companionReunion).toEqual(reunion);
    expect(canonicalStringify(old)).toBe(original);
  });

  it("rejects altered evidence, witness, outcome, opinion, quote, dialogue and present malformed memory", () => {
    const { completed } = naturalReunionWitnessMemoryFixture(), reunion = completed.depth.companionReunion!, spoken = reunion.completed!, memory = spoken.memory!;
    const malformed = [undefined, null, {}, { ...memory, extra: true }, { ...memory, rulesVersion: "reunion-witness-memory-v2" },
      { ...memory, heroId: "another-hero" }, { ...memory, witnessId: "absent-witness" }, { ...memory, joinedTick: memory.joinedTick + 1 },
      { ...memory, encounterId: "unrelated-solo-battle" }, { ...memory, sourceReactionCommandId: "foreign-reaction" },
      { ...memory, sourceReactionTick: reunion.departureTick }, { ...memory, sourceReactionId: "culinary-absurdity" },
      { ...memory, evidenceSourceCommandId: "foreign-round" }, { ...memory, evidenceRoundIndex: memory.evidenceRoundIndex + 1 },
      { ...memory, rememberedReply: "I never said that." }, { ...memory, quote: "An invented quotation." },
      { ...memory, pose: "laugh" }, { ...memory, outcome: "victory" }, { ...memory, regardAfter: 1 }];
    for (const value of malformed) {
      const state = { ...completed.depth, companionReunion: { ...reunion, completed: { ...spoken, memory: value } } } as unknown as DepthState;
      expect(isValidCampaignCompanionReunion(state)).toBe(false);
      // Direct input preserves the malformed own-property undefined case.
      expect(() => upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toThrow();
    }
    for (const lines of [{ heroLine: "You watched my later solo battle." }, { companionLine: "I forgive everything now." }]) {
      expect(isValidCampaignCompanionReunion({ ...completed.depth, companionReunion: { ...reunion,
        completed: { ...spoken, ...lines } } })).toBe(false);
    }
    const { memory: _memory, ...withoutMemory } = spoken;
    expect(isValidCampaignCompanionReunion({ ...completed.depth, companionReunion: { ...reunion, completed: withoutMemory } })).toBe(false);
  });

  it("does not fabricate a memory from missing, foreign or unvalidated witness evidence", () => {
    const { before } = naturalReunionWitnessMemoryFixture(), reunion = before.depth.companionReunion!, reaction = before.depth.reparteeWitness.reaction!;
    const original = canonicalStringify(before);
    // Selector-only missing/foreign-source boundaries, not fabricated valid campaign histories.
    for (const changedReaction of [null, { ...reaction, evidence: null }, { ...reaction, witnessId: "someone-else" },
      { ...reaction, joinedTick: reaction.joinedTick + 1 }, { ...reaction, completedTick: reunion.arrival.tick }]) {
      const candidate = selectCompanionReunion({ ...before.depth,
        reparteeWitness: { ...before.depth.reparteeWitness, reaction: changedReaction } });
      expect(candidate).not.toBeNull();
      expect(Object.hasOwn(candidate!, "memory")).toBe(false);
      expect(candidate).toMatchObject(companionReunionLines(reunion.sharedVictories));
    }
    const selected = selectCompanionReunion(before.depth)!;
    expect(selected.memory).toBeDefined();
    expect(canonicalStringify(before)).toBe(original);
  });
});
