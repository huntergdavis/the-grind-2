import { describe, expect, it } from "vitest";
import {
  createReparteeProgress, readReparteeBook, reparteeResponses, resolveReparteeRound, startRepartee,
  type ReparteeProgress, type ReparteeResponse,
} from "./repartee";
import {
  createReparteeWitnessReaction, createReparteeWitnessState, declareReparteeWitnessPreference,
  isValidReparteeWitnessPreference, isValidReparteeWitnessReaction, reparteeWitnessPreference,
  reparteeWitnessPreferences, type ReparteeWitnessPreference, type ReparteeWitnessPreferenceId,
} from "./repartee-witness";

const start = {
  actorId: "hero:reader", residentId: "resident:rival", locationId: "town:actual", buildingId: "building:hall",
  encounterId: "repartee:witnessed-encore", sourceCommandId: "depth:4:encore", tick: 4,
};
const declaration = { witnessId: "resident:companion", joinedTick: 3, sourceCommandId: start.sourceCommandId, tick: start.tick };
const presence = { witnessId: declaration.witnessId, witnessName: "Robin", joinedTick: declaration.joinedTick, locationId: start.locationId, tick: 7 };

function started(): ReparteeProgress {
  return startRepartee(readReparteeBook(createReparteeProgress(), {
    actorId: start.actorId, locationId: start.locationId, buildingId: start.buildingId, sourceCommandId: "depth:2:read", tick: 2,
  }), start);
}

function finish(styles: readonly (ReparteeResponse["style"] | "retreat")[]): ReparteeProgress {
  return styles.reduce((progress, style) => {
    const active = progress.active!;
    const responseId = style === "retreat" ? style : reparteeResponses(progress).find((entry) => entry.style === style)!.id;
    return resolveReparteeRound(progress, {
      encounterId: active.encounterId, roundIndex: active.roundIndex, responseId,
      sourceCommandId: `depth:${5 + active.roundIndex}:reply`, tick: 5 + active.roundIndex, reputationBefore: 4, reputationCap: 100,
    });
  }, started());
}

function preference(preferenceId: ReparteeWitnessPreferenceId): ReparteeWitnessPreference {
  // Rules tests declare a concrete preference; campaign tests additionally prove the seed binding.
  return { ...declareReparteeWitnessPreference("witness-rules", declaration), preferenceId };
}

function react(styles: readonly (ReparteeResponse["style"] | "retreat")[], preferenceId: ReparteeWitnessPreferenceId) {
  const progress = finish(styles), pref = preference(preferenceId);
  return { progress, pref, reaction: createReparteeWitnessReaction(progress, pref, { ...presence, tick: progress.completed!.completedTick })! };
}

describe("one explicitly declared flyting witness", () => {
  it("starts without invented preferences, memories or private opinions", () => {
    expect(createReparteeWitnessState()).toEqual({ schemaVersion: 1, firstContest: null, preference: null, reaction: null });
    expect(reparteeWitnessPreferences.map((entry) => entry.id)).toEqual(["precision", "humility", "playfulness"]);
    expect(reparteeWitnessPreference("precision").description).toContain("even when the contest is lost");
    expect(reparteeWitnessPreference("humility").description).toContain("shouted leadership boast");
  });

  it("declares an explicit seeded taste without borrowing the hero's values or resident disposition", () => {
    const original = declareReparteeWitnessPreference("declared-preference", declaration);
    expect(isValidReparteeWitnessPreference(original)).toBe(true);
    expect(declareReparteeWitnessPreference("declared-preference", declaration)).toEqual(original);
    expect(declareReparteeWitnessPreference("declared-preference", {
      ...declaration, joinedTick: 100, tick: 102, sourceCommandId: "later-real-declaration",
    }).preferenceId).toBe(original.preferenceId);
    expect(new Set(Array.from({ length: 24 }, (_, index) => declareReparteeWitnessPreference(`taste:${index}`, declaration).preferenceId)).size).toBe(3);
    for (const change of [{ witnessId: "" }, { joinedTick: -1 }, { joinedTick: 4 }, { tick: 2 }, { sourceCommandId: "" }]) {
      expect(() => declareReparteeWitnessPreference("declared-preference", { ...declaration, ...change })).toThrow();
    }
    expect(() => declareReparteeWitnessPreference("", declaration)).toThrow();
    for (const change of [{ schemaVersion: 2 }, { preferenceId: "likes-winners" }, { rulesVersion: "unversioned" }, { extra: true }]) {
      expect(isValidReparteeWitnessPreference({ ...original, ...change })).toBe(false);
    }
  });

  it("respects a sound answer even when the hero loses the contest", () => {
    const { progress, pref, reaction } = react(["direct", "category", "category"], "precision");
    expect(progress.completed!.outcome).toBe("defeat");
    expect(reaction).toMatchObject({ outcome: "defeat", reactionId: "precision-counter", pose: "nod", regardBefore: null, regardDelta: 1, regardAfter: 1 });
    expect(reaction.line).toBe("You lost the contest, not the point of that answer.");
    expect(reaction.evidence).toEqual(progress.completed!.rounds[0]);
    expect(reaction.evidence).not.toBe(progress.completed!.rounds[0]);
    expect(isValidReparteeWitnessReaction(reaction, progress, pref)).toBe(true);
  });

  it("disapproves of the actual hollow boast even if other counters win the contest", () => {
    const { progress, reaction } = react(["direct", "personality", "direct"], "humility");
    expect(progress.completed!.outcome).toBe("victory");
    expect(reaction).toMatchObject({ outcome: "victory", reactionId: "hollow-boast", pose: "frown", regardDelta: -1 });
    expect(reaction.evidence!.responseId).toBe("loud-authority:personality");
    expect(reaction.line).toContain("You won, but");
    expect(progress.completed!.reputationAward).toBe(1);
  });

  it("can enjoy a losing absurdity without rewriting its category-mistake score", () => {
    const { progress, reaction } = react(["category", "category", "category"], "playfulness");
    expect(reaction).toMatchObject({ outcome: "defeat", reactionId: "culinary-absurdity", pose: "laugh", regardDelta: 1 });
    expect(reaction.evidence).toMatchObject({ responseId: "borrowed-thought:category", classification: "category", delta: -1 });
    expect(progress.completed).toMatchObject({ momentum: -3, reputationAward: 0 });
    expect(reaction.line).toContain("trying not to laugh");
    const precision = createReparteeWitnessReaction(progress, preference("precision"), presence)!;
    expect(precision).toMatchObject({ reactionId: "precision-evasion", pose: "frown", regardDelta: -1 });
  });

  it("gives honest humility a source, and never treats a win as automatic applause", () => {
    const honest = react(["personality", "near", "near"], "humility");
    expect(honest.reaction).toMatchObject({ outcome: "draw", reactionId: "honest-admission", regardDelta: 1 });
    expect(honest.reaction.evidence!.responseId).toBe("borrowed-thought:personality");
    for (const id of ["humility", "playfulness"] as const) {
      const { reaction } = react(["direct", "direct", "direct"], id);
      expect(reaction).toMatchObject({ outcome: "victory", reactionId: "unmoved", pose: "quiet", regardBefore: null, regardDelta: 0 });
    }
  });

  it("exhausts three declared preferences over all 64 committed three-reply paths without touching the duel", () => {
    const styles = ["direct", "near", "category", "personality"] as const;
    for (const first of styles) for (const second of styles) for (const third of styles) {
      const progress = finish([first, second, third]);
      const before = JSON.stringify(progress);
      for (const { id } of reparteeWitnessPreferences) {
        const pref = preference(id), reaction = createReparteeWitnessReaction(progress, pref, presence)!;
        expect(reaction).not.toBeNull();
        expect(reaction.regardBefore).toBeNull();
        expect([-1, 0, 1]).toContain(reaction.regardDelta);
        expect(reaction.regardAfter).toBe(reaction.regardDelta);
        expect(reaction.evidence).toEqual(expect.objectContaining({ sourceCommandId: expect.any(String) }));
        expect(isValidReparteeWitnessReaction(JSON.parse(JSON.stringify(reaction)), progress, pref)).toBe(true);
        expect(reaction.heroId).toBe(progress.completed!.actorId);
        expect(reaction.witnessId).not.toBe(reaction.heroId);
      }
      expect(JSON.stringify(progress)).toBe(before);
    }
  });

  it("does not invent a round or opinion after immediate retreat", () => {
    for (const { id } of reparteeWitnessPreferences) {
      const { progress, pref, reaction } = react(["retreat"], id);
      expect(reaction).toMatchObject({ outcome: "retreat", evidence: null, reactionId: "unmoved", regardDelta: 0 });
      expect(reaction.line).toContain("wait for an answer");
      expect(isValidReparteeWitnessReaction(reaction, progress, pref)).toBe(true);
    }
    const partial = react(["direct", "retreat"], "precision");
    expect(partial.reaction).toMatchObject({ outcome: "retreat", reactionId: "precision-counter", regardDelta: 1 });
    expect(partial.reaction.line).toContain("left the contest");
    expect(partial.reaction.evidence!.roundIndex).toBe(0);
  });

  it("requires actual resolution-time presence and the declared start source", () => {
    const progress = finish(["direct", "near", "category"]), pref = preference("precision");
    expect(createReparteeWitnessReaction(progress, pref, null)).toBeNull();
    expect(createReparteeWitnessReaction(started(), pref, presence)).toBeNull();
    for (const change of [{ witnessId: "absent-person" }, { witnessName: "" }, { joinedTick: 2 }, { locationId: "another-town" }, { tick: 6 }, { tick: 8 }]) {
      expect(createReparteeWitnessReaction(progress, pref, { ...presence, ...change })).toBeNull();
    }
    for (const change of [{ sourceCommandId: "unrelated-command" }, { declaredTick: 5 }, { witnessId: start.actorId }, { witnessId: start.residentId }]) {
      const changed = { ...pref, ...change };
      expect(createReparteeWitnessReaction(progress, changed, { ...presence, witnessId: changed.witnessId })).toBeNull();
    }
  });

  it("rejects changed source, speaker, outcome, regard, prose and round evidence on reload", () => {
    const { progress, pref, reaction } = react(["direct", "category", "category"], "precision");
    const changed = [
      { schemaVersion: 2 }, { rulesVersion: "future" }, { encounterId: "other" }, { heroId: "other" }, { residentId: "other" },
      { witnessId: "other" }, { joinedTick: 2 }, { locationId: "other" }, { buildingId: "other" }, { completionCommandId: "other" },
      { completedTick: 8 }, { preferenceSourceCommandId: "other" }, { preferenceId: "humility" }, { outcome: "victory" },
      { reactionId: "applause" }, { pose: "laugh" }, { line: "Invented approval" }, { explanation: "Invented cause" },
      { regardBefore: 0 }, { regardAfter: 2 }, { regardDelta: 2 }, { extra: true }, { evidence: null },
      { evidence: { ...reaction.evidence, sourceCommandId: "other" } },
      { evidence: { ...reaction.evidence, reply: "A reply that never happened" } },
      { evidence: { ...reaction.evidence, entryIds: [] } },
    ];
    for (const patch of changed) expect(isValidReparteeWitnessReaction({ ...reaction, ...patch }, progress, pref)).toBe(false);
    expect(isValidReparteeWitnessReaction({ ...reaction, evidence: { ...reaction.evidence, extra: true } }, progress, pref)).toBe(false);
    expect(isValidReparteeWitnessReaction(null, progress, pref)).toBe(false);
    // Retained name/presence belongs to campaign identity validation, not imagined by this pure rule.
    expect(isValidReparteeWitnessReaction(reaction, progress, pref)).toBe(true);
  });
});
