import { describe, expect, it } from "vitest";
import {
  createReparteeProgress, isValidReparteeProgress, readReparteeBook, reparteeBook,
  reparteeChallenges, reparteeEntries, reparteeResponses, resolveReparteeRound, startRepartee,
  type ReparteeProgress, type ReparteeResponse,
} from "./repartee";

const readingContext = {
  actorId: "actor:hero", locationId: "location:town", buildingId: "building:inn",
  sourceCommandId: "depth:2:read-book", tick: 2,
};
const startContext = {
  ...readingContext, encounterId: "repartee:hero:town", residentId: "resident:keeper",
  sourceCommandId: "depth:3:start-repartee", tick: 3,
};

function read(): ReparteeProgress {
  return readReparteeBook(createReparteeProgress(), readingContext);
}

function started(): ReparteeProgress {
  return startRepartee(read(), startContext);
}

function answer(progress: ReparteeProgress, style: ReparteeResponse["style"] | "retreat", reputationBefore = 4, reputationCap = 10): ReparteeProgress {
  const duel = progress.active;
  if (duel === null) throw new Error("Fixture requires a pending duel");
  const responseId = style === "retreat" ? "retreat" : reparteeResponses(progress).find((entry) => entry.style === style)?.id;
  if (responseId === undefined) throw new Error("Fixture requires a legal response");
  return resolveReparteeRound(progress, {
    encounterId: duel.encounterId, roundIndex: duel.roundIndex, responseId,
    sourceCommandId: `depth:${4 + duel.roundIndex}:repartee-action`, tick: 4 + duel.roundIndex,
    reputationBefore, reputationCap,
  });
}

function finish(styles: readonly (ReparteeResponse["style"] | "retreat")[], before = 4, cap = 10): ReparteeProgress {
  return styles.reduce((progress, style) => answer(progress, style, before, cap), started());
}

describe("the first useful book and original repartee duel", () => {
  it("ships one finite original book with 12 useful entries and two learned semantic frame families", () => {
    expect(reparteeBook.title).toBe("A Small Dictionary for Large Nuisances");
    expect(reparteeBook.contentVersion).toBe(1);
    expect(reparteeBook.provenance).toContain("Original Grind");
    expect(reparteeEntries).toHaveLength(12);
    expect(new Set(reparteeEntries.map((entry) => entry.id)).size).toBe(12);
    expect(reparteeBook.entryIds).toEqual(reparteeEntries.map((entry) => entry.id));
    expect(new Set(reparteeEntries.map((entry) => entry.frameId))).toEqual(new Set(reparteeBook.frameIds));
    expect(reparteeBook.frameIds).toHaveLength(2);
    expect(reparteeEntries.every((entry) => entry.languageBand === "clean" && entry.definition.length > 30)).toBe(true);
    expect(reparteeChallenges.map((entry) => entry.claim)).toEqual([
      "learning-is-dependence", "loudness-proves-authority", "caution-is-cowardice",
    ]);
    expect(isValidReparteeProgress(createReparteeProgress())).toBe(true);
  });

  it("persists the exact first-reading source and unlocks a previously unavailable direct counter", () => {
    const initial = createReparteeProgress();
    for (let round = 0; round < 3; round++) {
      const before = reparteeResponses(initial, round);
      expect(before.map((choice) => choice.style)).toEqual(["near", "category", "personality"]);
      expect(before.every((choice) => choice.entryIds.length === 0 && choice.frameId === null)).toBe(true);
    }
    const learned = readReparteeBook(initial, readingContext);
    expect(initial).toEqual(createReparteeProgress());
    expect(learned.reading).toEqual({
      ...readingContext, schemaVersion: 1, contentVersion: 1, bookId: reparteeBook.id, firstRead: true,
      addedEntryIds: reparteeBook.entryIds, addedFrameIds: reparteeBook.frameIds,
    });
    for (let round = 0; round < 3; round++) {
      const after = reparteeResponses(learned, round);
      expect(after).toHaveLength(4);
      expect(after[0]).toMatchObject({ style: "direct", classification: "direct", delta: 1 });
      expect(after[0]?.entryIds).toHaveLength(1);
      expect(after.slice(1)).toEqual(reparteeResponses(initial, round));
      expect(Math.max(...reparteeResponses(initial, round).map((choice) => choice.delta))).toBe(0);
      expect(Math.max(...after.map((choice) => choice.delta))).toBe(1);
    }
    expect(readReparteeBook(learned, readingContext)).toBe(learned);
    expect(readReparteeBook(learned, { ...readingContext, tick: 10, sourceCommandId: "reread" })).toBe(learned);
    expect(isValidReparteeProgress(JSON.parse(JSON.stringify(learned)))).toBe(true);
  });

  it("admits only the actual reader and reading source, then consumes the one opportunity", () => {
    const empty = createReparteeProgress(), learned = read();
    expect(startRepartee(empty, startContext)).toBe(empty);
    for (const changed of [
      { actorId: "another-hero" }, { residentId: readingContext.actorId }, { locationId: "another-town" },
      { buildingId: "another-building" }, { tick: 2 }, { sourceCommandId: readingContext.sourceCommandId },
      { encounterId: "" }, { residentId: "" },
    ]) expect(startRepartee(learned, { ...startContext, ...changed })).toBe(learned);
    const progress = startRepartee(learned, startContext);
    expect(progress.active).toMatchObject({
      actorId: readingContext.actorId, residentId: startContext.residentId, locationId: readingContext.locationId,
      buildingId: readingContext.buildingId, readingSourceCommandId: readingContext.sourceCommandId,
      rulesVersion: 1, contentVersion: 1, roundIndex: 0, momentum: 0, rounds: [],
    });
    expect(startRepartee(progress, startContext)).toBe(progress);
    const ended = answer(progress, "retreat");
    expect(startRepartee(ended, { ...startContext, sourceCommandId: "retry", tick: 10 })).toBe(ended);
  });

  it("scores the small semantic table by actual meaning, including the boastful personality failure", () => {
    for (let round = 0; round < 3; round++) {
      const choices = reparteeResponses(started(), round);
      expect(choices.map((choice) => [choice.style, choice.classification, choice.delta])).toEqual([
        ["direct", "direct", 1], ["near", "near", 0], ["category", "category", -1],
        ["personality", round === 1 ? "category" : "near", round === 1 ? -1 : 0],
      ]);
      for (const choice of choices) {
        expect(choice.challengeId).toBe(reparteeChallenges[round]?.id);
        expect(choice.text.length).toBeGreaterThan(40);
        expect(choice.explanation.length).toBeGreaterThan(40);
      }
    }
    expect(reparteeResponses(started(), 1).find((choice) => choice.style === "personality")?.explanation).toContain("faulty premise");
    expect(reparteeResponses(started(), 0).find((choice) => choice.style === "category")?.text).toContain("jurisdiction over soup");
  });

  it("exhausts all 64 legal three-response paths with signed momentum and no overtime", () => {
    const styles = ["direct", "near", "category", "personality"] as const;
    for (const first of styles) for (const second of styles) for (const third of styles) {
      const result = finish([first, second, third]);
      const receipt = result.completed!;
      const score = receipt.rounds.reduce((sum, round) => sum + round.delta, 0);
      expect(result.active).toBeNull();
      expect(receipt.roundIndex).toBe(3);
      expect(receipt.rounds).toHaveLength(3);
      expect(receipt.momentum).toBe(score);
      expect(receipt.outcome).toBe(score > 0 ? "victory" : score < 0 ? "defeat" : "draw");
      expect(receipt.reputationAfter).toBe(score > 0 ? 5 : 4);
      expect(receipt.consumedOpportunity).toBe(true);
      expect(isValidReparteeProgress(result)).toBe(true);
      expect(isValidReparteeProgress(JSON.parse(JSON.stringify(result)))).toBe(true);
    }
  });

  it("distinguishes victory, defeat, draw, and explicit early retreat without combat rewards", () => {
    expect(finish(["direct", "direct", "direct"]).completed).toMatchObject({ outcome: "victory", momentum: 3, reputationAward: 1 });
    expect(finish(["category", "category", "category"]).completed).toMatchObject({ outcome: "defeat", momentum: -3, reputationAward: 0 });
    expect(finish(["direct", "category", "near"]).completed).toMatchObject({ outcome: "draw", momentum: 0, reputationAward: 0 });
    for (const replies of [[], ["direct"], ["direct", "category"]] as const) {
      const result = finish([...replies, "retreat"]);
      expect(result.completed).toMatchObject({ outcome: "retreat", reputationBefore: 4, reputationAfter: 4, reputationAward: 0 });
      expect(result.completed?.rounds).toHaveLength(replies.length);
      expect(isValidReparteeProgress(result)).toBe(true);
    }
    const serialized = JSON.stringify(finish(["direct", "direct", "direct"]));
    for (const field of ["health", "mana", "experience", "gold", "bond"]) expect(serialized).not.toContain(`"${field}":`);
  });

  it("caps a victory's single reputation increment using the caller's declared existing cap", () => {
    expect(finish(["direct", "direct", "direct"], 10, 10).completed).toMatchObject({
      outcome: "victory", reputationBefore: 10, reputationAfter: 10, reputationAward: 0, reputationCap: 10,
    });
    const result = finish(["direct", "direct", "direct"], 9, 10);
    expect(result.completed).toMatchObject({ reputationBefore: 9, reputationAfter: 10, reputationAward: 1 });
    const repeated = resolveReparteeRound(result, {
      encounterId: startContext.encounterId, roundIndex: 2, responseId: "retreat", sourceCommandId: "another-finish", tick: 7,
      reputationBefore: 10, reputationCap: 10,
    });
    expect(repeated).toBe(result);
  });

  it("rejects stale, duplicate, foreign, cross-category and unknown response commands", () => {
    const progress = started();
    const valid = {
      encounterId: startContext.encounterId, roundIndex: 0, responseId: reparteeResponses(progress)[0]!.id,
      sourceCommandId: "depth:4:repartee-action", tick: 4, reputationBefore: 4, reputationCap: 10,
    };
    for (const changed of [
      { encounterId: "another-encounter" }, { roundIndex: 1 }, { roundIndex: -1 }, { responseId: "unknown" },
      { responseId: reparteeResponses(progress, 1)[0]!.id }, { sourceCommandId: readingContext.sourceCommandId },
      { sourceCommandId: startContext.sourceCommandId }, { sourceCommandId: "" }, { tick: 3 }, { tick: Number.NaN },
      { reputationBefore: -1 }, { reputationBefore: 11 }, { reputationCap: 3 },
    ]) expect(resolveReparteeRound(progress, { ...valid, ...changed })).toBe(progress);
    const once = resolveReparteeRound(progress, valid);
    expect(resolveReparteeRound(once, valid)).toBe(once);
    expect(resolveReparteeRound(once, { ...valid, roundIndex: 1, tick: 5, responseId: reparteeResponses(once)[0]!.id })).toBe(once);
    expect(progress.active?.rounds).toEqual([]);
    expect(once.active?.rounds).toHaveLength(1);
  });

  it("resumes the exact learned mid-duel transcript and reconstructs completed alternatives", () => {
    const first = answer(started(), "direct");
    const loaded = JSON.parse(JSON.stringify(first)) as ReparteeProgress;
    expect(isValidReparteeProgress(loaded)).toBe(true);
    expect(reparteeResponses(loaded)).toEqual(reparteeResponses(first));
    const finished = answer(answer(first, "category"), "personality");
    expect(answer(answer(loaded, "category"), "personality")).toEqual(finished);
    expect(finished.completed?.rounds[0]).toMatchObject({
      call: reparteeChallenges[0]?.text, readingSourceCommandId: readingContext.sourceCommandId,
      sourceCommandId: "depth:4:repartee-action", tick: 4, delta: 1, momentum: 1,
    });
    expect(finished.completed?.rounds[1]).toMatchObject({ readingSourceCommandId: null, entryIds: [], frameId: null });
    for (const round of finished.completed!.rounds) {
      expect(reparteeResponses(finished, round.roundIndex).find((choice) => choice.id === round.responseId)?.text).toBe(round.reply);
    }
  });

  it("rejects fabricated readings, unsupported versions, and malformed arc ownership", () => {
    const progress = started(), reading = progress.reading!, duel = progress.active!;
    for (const invalid of [
      null, undefined, [], {}, { ...progress, schemaVersion: 2 }, { ...progress, unrelated: true },
      { ...progress, reading: null }, { ...progress, reading: { ...reading, contentVersion: 2 } },
      { ...progress, reading: { ...reading, bookId: "imaginary-book" } },
      { ...progress, reading: { ...reading, addedEntryIds: reading.addedEntryIds.slice(1) } },
      { ...progress, reading: { ...reading, addedEntryIds: new Array(12) } },
      { ...progress, reading: { ...reading, addedEntryIds: [...reading.addedEntryIds, reading.addedEntryIds[0]] } },
      { ...progress, reading: { ...reading, addedFrameIds: [] } },
      { ...progress, reading: { ...reading, firstRead: false } },
      { ...progress, reading: { ...reading, sourceCommandId: "" } },
      { ...progress, active: { ...duel, rulesVersion: 2 } },
      { ...progress, active: { ...duel, actorId: "another-hero" } },
      { ...progress, active: { ...duel, residentId: duel.actorId } },
      { ...progress, active: { ...duel, locationId: "another-town" } },
      { ...progress, active: { ...duel, buildingId: "another-building" } },
      { ...progress, active: { ...duel, readingSourceCommandId: "invented-reading" } },
      { ...progress, active: { ...duel, startedTick: reading.tick } },
    ]) expect(isValidReparteeProgress(invalid)).toBe(false);
  });

  it("replays exact meaning, text, score and reading provenance instead of trusting forged receipts", () => {
    const progress = answer(started(), "direct"), duel = progress.active!, round = duel.rounds[0]!;
    for (const changed of [
      { call: "An invented accusation." }, { reply: "A synonym cannot forge a scored reply." }, { classification: "category" },
      { delta: -1 }, { momentum: 9 }, { entryIds: [] }, { frameId: null },
      { readingSourceCommandId: "another-reading" }, { sourceCommandId: readingContext.sourceCommandId },
      { tick: duel.startedTick }, { explanation: "It wins because it is louder." }, { extra: true },
    ]) {
      expect(isValidReparteeProgress({ ...progress, active: { ...duel, rounds: [{ ...round, ...changed }] } })).toBe(false);
    }
    expect(isValidReparteeProgress({ ...progress, active: { ...duel, momentum: 2 } })).toBe(false);
    expect(isValidReparteeProgress({ ...progress, active: { ...duel, roundIndex: 2 } })).toBe(false);
    const two = answer(progress, "near"), twoDuel = two.active!;
    expect(isValidReparteeProgress({ ...two, active: { ...twoDuel, rounds: [round, { ...twoDuel.rounds[1], sourceCommandId: round.sourceCommandId }] } })).toBe(false);
  });

  it("rejects forged outcomes, final provenance, repeated reward claims, and simultaneous active/completed states", () => {
    const progress = finish(["direct", "direct", "direct"]), receipt = progress.completed!;
    for (const changed of [
      { outcome: "defeat" }, { outcome: "retreat" }, { reputationAfter: 6 }, { reputationAward: 2 },
      { reputationBefore: -1 }, { reputationCap: 3 }, { consumedOpportunity: false },
      { completedTick: 99 }, { completionCommandId: "another-command" }, { rounds: receipt.rounds.slice(0, 2) },
    ]) expect(isValidReparteeProgress({ ...progress, completed: { ...receipt, ...changed } })).toBe(false);
    expect(isValidReparteeProgress({ ...progress, active: started().active })).toBe(false);
    const retreat = answer(started(), "retreat");
    expect(isValidReparteeProgress({ ...retreat, completed: { ...retreat.completed, completionCommandId: startContext.sourceCommandId } })).toBe(false);
    expect(reparteeResponses(progress, -1)).toEqual([]);
    expect(reparteeResponses(progress, 3)).toEqual([]);
  });
});
