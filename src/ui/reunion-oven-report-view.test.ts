import { beforeAll, describe, expect, it } from "vitest";
import { canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { companionReunionMemoryLines } from "../depth/companion-reunion";
import { naturalOvenReportFixture, releasedOvenReportBaselineFixture, releasedOvenReportNextFixture } from "../../tests/oven-report-fixtures";
import { projectCompanionReunionScene } from "./companion-reunion-view";
import { projectReparteeScene } from "./repartee-view";

describe("news from the oven presentation", () => {
  let before: WorldState, completed: WorldState, next: WorldState;
  beforeAll(() => { ({ before, completed, next } = naturalOvenReportFixture()); });

  it("adds the actual baker's report without rewriting the witnessed conversation", () => {
    const reunion = completed.depth.companionReunion!, spoken = reunion.completed!;
    const loaf = completed.depth.elsewhereLoaf!, scene = projectCompanionReunionScene(completed)!;
    expect(scene.title).toBe("An old line returns · Elderwatch");
    expect(scene.consequence).toBe("Some words travel with you.");
    expect({ heroLine: scene.call, companionLine: scene.reply }).toEqual(companionReunionMemoryLines(spoken.memory!));
    expect(scene.memory).toEqual(spoken.memory);
    expect(scene.companion.id).toBe(loaf.residentId);
    expect(scene.companion.joinedTick).toBe(loaf.joinedTick);
    expect(scene.ovenReport).toEqual({ schemaVersion: 1, rulesVersion: "reunion-oven-report-v1",
      loafId: loaf.id, sourceCompletionEventId: loaf.completion!.eventId,
      sourceCompletionCommandId: loaf.completion!.triggerCommandId,
      sourceCompletionTick: 74, outcome: "plain-loaf",
      line: "I baked at The Candle Inn. An ordinary loaf. Lunch need not be ambitious." });
    expect(scene.commandId).toBe(`${completed.campaignId}:${spoken.sourceCommandId}`);
    expect(scene.tick).toBe(86);
    expect(scene.ovenReport!.sourceCompletionTick).toBeLessThan(reunion.arrival.tick);
    expect(projectReparteeScene(completed)).toEqual(scene);
  });

  it("projects only a frozen public report, not the oven roll or a delivered item", () => {
    const saved = canonicalStringify(completed), scene = projectCompanionReunionScene(completed)!;
    expect(Object.keys(scene.ovenReport!).sort()).toEqual([
      "schemaVersion", "rulesVersion", "loafId", "sourceCompletionEventId", "sourceCompletionCommandId",
      "sourceCompletionTick", "outcome", "line",
    ].sort());
    expect(Object.isFrozen(scene.ovenReport)).toBe(true);
    expect(scene.ovenReport).not.toBe(completed.depth.companionReunion!.completed!.ovenReport);
    expect(JSON.stringify(scene)).not.toContain("ovenRoll");
    expect(scene).toMatchObject({ marks: [], momentum: null, outcome: null, witness: null, encore: false,
      buildingId: null, buildingName: null, bookId: null });
    expect(completed.depth.elsewhereLoaf).toEqual(before.depth.elsewhereLoaf);
    expect(completed.depth.hero).toEqual(before.depth.hero);
    expect(completed.depth.companions).toEqual(before.depth.companions);
    expect(canonicalStringify(completed)).toBe(saved);
  });

  it("reopens the exact spoken report, then leaves it in history when the hero continues", () => {
    const scene = projectCompanionReunionScene(completed)!;
    expect(projectCompanionReunionScene(before)).toBeNull();
    expect(projectCompanionReunionScene(JSON.parse(JSON.stringify(completed)))).toEqual(scene);
    expect(projectCompanionReunionScene(next)).toBeNull();
    expect(next.depth.companionReunion!.completed!.ovenReport).toEqual(scene.ovenReport);
    expect(next.depth.elsewhereLoaf).toEqual(completed.depth.elsewhereLoaf);
  });

  it("rejects changed bake evidence, result or words instead of staging an invented report", () => {
    const reunion = completed.depth.companionReunion!, spoken = reunion.completed!, report = spoken.ovenReport!;
    for (const changed of [
      { ...report, sourceCompletionEventId: `${report.sourceCompletionEventId}:other` },
      { ...report, sourceCompletionCommandId: `${report.sourceCompletionCommandId}:other` },
      { ...report, sourceCompletionTick: report.sourceCompletionTick + 1 },
      { ...report, outcome: "bricklike-loaf" as const },
      { ...report, line: "I brought you a loaf." },
    ]) {
      const forged: WorldState = { ...completed, depth: { ...completed.depth,
        companionReunion: { ...reunion, completed: { ...spoken, ovenReport: changed } } } };
      expect(projectCompanionReunionScene(forged)).toBeNull();
    }
  });

  it("does not borrow an old report for a foreign command, speaker or unrelated scene", () => {
    const source = completed.chronicle.at(-1)!;
    const foreign: WorldState = { ...completed, chronicle: [...completed.chronicle.slice(0, -1),
      { ...source, commandId: `foreign:${completed.depth.companionReunion!.completed!.sourceCommandId}` }] };
    expect(projectCompanionReunionScene(foreign)).toBeNull();
    expect(projectCompanionReunionScene({ ...completed, hero: { ...completed.hero, id: "another-hero" } })).toBeNull();
    expect(projectCompanionReunionScene({ ...completed, scene: { ...completed.scene, action: "Unrelated conversation" } })).toBeNull();
    expect(projectCompanionReunionScene({ ...completed, tick: completed.tick + 1 })).toBeNull();
  });

  it("preserves the exact released v179 greeting without retroactively telling the hero about the bake", () => {
    // Acceptance's compact reconstruction must match the entire independently
    // captured old world hash before it can be loaded; this is not an edited
    // live event being passed off as a released save.
    const old = releasedOvenReportBaselineFixture(), saved = canonicalStringify(old);
    const spoken = old.depth.companionReunion!.completed!, scene = projectCompanionReunionScene(old)!;
    expect(old.depth.elsewhereLoaf!.completion).not.toBeNull();
    expect(spoken).not.toHaveProperty("ovenReport");
    expect(scene).not.toHaveProperty("ovenReport");
    expect(scene.memory).toEqual(spoken.memory);
    expect(scene.call).toBe(spoken.heroLine);
    expect(scene.reply).toBe(spoken.companionLine);
    expect(scene.title).toBe("An old line returns · Elderwatch");
    expect(projectCompanionReunionScene(JSON.parse(saved))).toEqual(scene);
    expect(canonicalStringify(old)).toBe(saved);
    const onward = releasedOvenReportNextFixture();
    expect(onward.depth.companionReunion!.completed).not.toHaveProperty("ovenReport");
    expect(projectCompanionReunionScene(onward)).toBeNull();
  });
});
