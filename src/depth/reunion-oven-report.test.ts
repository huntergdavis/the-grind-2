import { describe, expect, it } from "vitest";
import { naturalReunionWitnessMemoryFixture, releasedCompanionReunionFixture } from "../../tests/reunion-witness-memory-fixtures";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { advanceWorld, upgradeWorldState } from "../core/simulation";
import { companionReunionMemoryLines, companionReunionOvenReportLine, isValidCampaignCompanionReunion, selectCompanionReunion } from "./companion-reunion";
import type { ElsewhereLoaf, ElsewhereLoafOutcome } from "./elsewhere-loaf";
import { stepDepth, upgradeDepthState } from "./state";
import type { DepthState } from "./types";

describe("news from the actual oven reaches an earned reunion", () => {
  it("adds one exact spoken report without replacing the remembered exchange or granting anything", () => {
    const { before, completed, next } = naturalReunionWitnessMemoryFixture();
    const input = canonicalStringify(before), reunion = completed.depth.companionReunion!, spoken = reunion.completed!;
    const loaf = before.depth.elsewhereLoaf!, baked = loaf.completion!, report = spoken.ovenReport!;
    expect([before.tick, completed.tick, next.tick]).toEqual([85, 86, 87]);
    expect([loaf.admission.tick, baked.tick, reunion.arrival.tick]).toEqual([73, 74, 85]);
    expect(report).toEqual({ schemaVersion: 1, rulesVersion: "reunion-oven-report-v1", loafId: loaf.id,
      sourceCompletionEventId: baked.eventId, sourceCompletionCommandId: baked.triggerCommandId,
      sourceCompletionTick: baked.tick, outcome: "plain-loaf",
      line: "I baked at The Candle Inn. An ordinary loaf. Lunch need not be ambitious." });
    expect([loaf.heroId, loaf.residentId, loaf.companionName, loaf.joinedTick, loaf.departureTick, loaf.locationId])
      .toEqual([reunion.heroId, reunion.residentId, reunion.companionName, reunion.joinedTick, reunion.departureTick, reunion.locationId]);
    expect(Object.hasOwn(report, "ovenRoll")).toBe(false);
    expect(spoken).toMatchObject(companionReunionMemoryLines(spoken.memory!));
    expect(spoken.memory).toEqual(selectCompanionReunion(before.depth)!.memory);
    expect(completed.chronicle.at(-1)).toMatchObject({ tick: 86, commandType: "reunite-companion",
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
    expect(upgradeWorldState(JSON.parse(canonicalStringify(next)))).toEqual(next);
    expect(canonicalStringify(before)).toBe(input);
  });

  it("keeps three short outcome-specific copy cases separate from the one observed campaign outcome", () => {
    // Authored-copy unit cases, not three fabricated natural baking histories.
    const expected: Record<ElsewhereLoafOutcome, string> = {
      "plain-loaf": "I baked at The Candle Inn. An ordinary loaf. Lunch need not be ambitious.",
      "unexpected-delight": "I baked at The Candle Inn. The experiment rose higher than planned.",
      "bricklike-loaf": "I baked at The Candle Inn. Excellent load-bearing properties.",
    };
    for (const outcome of Object.keys(expected) as ElsewhereLoafOutcome[]) {
      expect(companionReunionOvenReportLine(outcome, "The Candle Inn")).toBe(expected[outcome]);
    }
    expect(() => companionReunionOvenReportLine("invented-bread-delivery" as ElsewhereLoafOutcome, "The Candle Inn")).toThrow();
  });

  it("keeps the exact released v177 completed greeting unchanged and never backfills a report", () => {
    const old = releasedCompanionReunionFixture(), source = canonicalStringify(old), reunion = old.depth.companionReunion!;
    expect(canonicalHash(old)).toBe("d9cce50f7bc14aa8");
    expect(Object.hasOwn(reunion.completed!, "ovenReport")).toBe(false);
    expect(upgradeWorldState(JSON.parse(source))).toEqual(old);
    expect(isValidCampaignCompanionReunion(old.depth)).toBe(true);
    expect(selectCompanionReunion(old.depth)).toBeNull();
    expect(advanceWorld(old).depth.companionReunion).toEqual(reunion);
    expect(canonicalStringify(old)).toBe(source);
  });

  it("accepts absent reports on already completed greetings even when a matching bake is retained", () => {
    const { completed } = naturalReunionWitnessMemoryFixture(), reunion = completed.depth.companionReunion!;
    // Backward-compatible optional-field boundary, not a claim that this modified
    // checkpoint is an independently recovered released save.
    const { ovenReport: _report, ...spoken } = reunion.completed!;
    const state = { ...completed.depth, companionReunion: { ...reunion, completed: spoken } };
    expect(state.elsewhereLoaf!.completion).not.toBeNull();
    expect(isValidCampaignCompanionReunion(state)).toBe(true);
    expect(upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toEqual(state);
    expect(selectCompanionReunion(state)).toBeNull();
  });

  it("rejects altered report sources, result, copy, versions and malformed present optional values", () => {
    const { completed } = naturalReunionWitnessMemoryFixture(), reunion = completed.depth.companionReunion!;
    const spoken = reunion.completed!, report = spoken.ovenReport!;
    const malformed = [undefined, null, {}, { ...report, extra: true }, { ...report, schemaVersion: 2 },
      { ...report, rulesVersion: "reunion-oven-report-v2" }, { ...report, loafId: "another-loaf" },
      { ...report, sourceCompletionEventId: "another-event" }, { ...report, sourceCompletionCommandId: "another-command" },
      { ...report, sourceCompletionTick: report.sourceCompletionTick + 1 }, { ...report, outcome: "bricklike-loaf" },
      { ...report, line: "I brought you bread. You loved it." }, { ...report, ovenRoll: 6 }];
    for (const value of malformed) {
      const state = { ...completed.depth, companionReunion: { ...reunion, completed: { ...spoken, ovenReport: value } } } as unknown as DepthState;
      expect(isValidCampaignCompanionReunion(state)).toBe(false);
      expect(() => upgradeDepthState(state, state.seed, state.hero.id, state.hero.name)).toThrow();
    }
    const { elsewhereLoaf: _loaf, ...withoutSource } = completed.depth;
    expect(isValidCampaignCompanionReunion(withoutSource)).toBe(false);
  });

  it("does not report unfinished, foreign or unvalidated activity, or require a report to create the original memory", () => {
    const { before } = naturalReunionWitnessMemoryFixture(), loaf = before.depth.elsewhereLoaf!;
    const baseline = selectCompanionReunion(before.depth)!;
    const { elsewhereLoaf: _loaf, ...withoutLoaf } = before.depth;
    const changed: DepthState[] = [withoutLoaf, ...[
      { ...loaf, completion: null }, { ...loaf, heroId: "another-hero" },
      { ...loaf, residentId: "another-baker" }, { ...loaf, companionName: "Another baker" },
      { ...loaf, joinedTick: loaf.joinedTick + 1 }, { ...loaf, departureTick: loaf.departureTick + 1 },
      { ...loaf, locationId: loaf.admission.heroLocationId },
      { ...loaf, completion: { ...loaf.completion!, tick: before.depth.companionReunion!.arrival.tick } },
    ].map(value => ({ ...before.depth, elsewhereLoaf: value as ElsewhereLoaf }))];
    // These are selector-only missing/foreign-source boundaries, not staged
    // valid campaign outcomes. The actual source journey is covered above.
    for (const state of changed) {
      const selected = selectCompanionReunion(state)!;
      expect(selected).not.toBeNull();
      expect(Object.hasOwn(selected, "ovenReport")).toBe(false);
      expect(selected.memory).toEqual(baseline.memory);
      expect(selected.heroLine).toBe(baseline.heroLine);
      expect(selected.companionLine).toBe(baseline.companionLine);
    }
  });
});
