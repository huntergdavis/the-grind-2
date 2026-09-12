import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { naturalOvenReportFixture, releasedOvenReportBaselineFixture, releasedOvenReportNextFixture } from "../../tests/oven-report-fixtures";
import { canonicalHash, canonicalStringify } from "./canonical";
import { advanceWorld, campaignDirector, upgradeWorldState } from "./simulation";

describe("news of an actual completed bake at an actual reunion", () => {
  let journey: ReturnType<typeof naturalOvenReportFixture>;
  beforeAll(() => { journey = naturalOvenReportFixture(); });

  it("appends one source-backed report without replacing the witnessed lines or spending another action", () => {
    const { before, completed, next } = journey, reunion = completed.depth.companionReunion!;
    const spoken = reunion.completed!, report = spoken.ovenReport!, loaf = before.depth.elsewhereLoaf!;
    expect([before.tick, completed.tick, next.tick]).toEqual([85, 86, 87]);
    expect(canonicalHash(before)).toBe("8de0bf9b87c9e26c");
    expect([before, completed, next].map(world => world.chronicle.at(-1)?.commandType))
      .toEqual(["travel", "reunite-companion", "plan-route"]);
    expect(report).toEqual({ schemaVersion: 1, rulesVersion: "reunion-oven-report-v1", loafId: loaf.id,
      sourceCompletionEventId: loaf.completion!.eventId, sourceCompletionCommandId: loaf.completion!.triggerCommandId,
      sourceCompletionTick: 74, outcome: "plain-loaf", line: "I baked at The Candle Inn. An ordinary loaf. Lunch need not be ambitious." });
    expect(loaf.completion!.tick).toBeLessThan(reunion.arrival.tick);
    expect(reunion).toMatchObject({ residentId: loaf.residentId, joinedTick: loaf.joinedTick,
      departureTick: loaf.departureTick, locationId: loaf.locationId });
    expect(spoken.heroLine).toBe("I brought an old line back with me: “I will accept being called cautious.”");
    expect(spoken.companionLine).toBe("It is exactly as I remember. I am still not sure what to make of it.");
    expect(spoken.memory).toMatchObject({ sourceReactionTick: 32, sourceReactionId: "unmoved", regardAfter: 0 });
    expect(completed.scene).toMatchObject({ mode: "chronicle", headline: "An old line returns: Ada Fen",
      goal: "Remember a line from the shared road" });
    for (const line of [spoken.heroLine, spoken.companionLine, report.line]) {
      expect(completed.scene.action).toContain(line);
      expect(completed.depth.log.at(-1)?.message).toContain(line);
    }
    expect(completed.chronicle.at(-1)).toMatchObject({ tick: 86, commandType: "reunite-companion",
      commandId: `${completed.campaignId}:${spoken.sourceCommandId}`, action: completed.scene.action });
    const { tick: _beforeTick, log: _beforeLog, companionReunion: _beforeReunion, ...beforeFacts } = before.depth;
    const { tick: _afterTick, log: _afterLog, companionReunion: _afterReunion, ...afterFacts } = completed.depth;
    expect(afterFacts).toEqual(beforeFacts);
    expect(completed.hero).toEqual(before.hero);
    expect([before.hero.experience, completed.hero.experience, next.hero.experience]).toEqual([82, 82, 83]);
    expect(completed.depth.elsewhereLoaf).toEqual(before.depth.elsewhereLoaf);
    expect(report).not.toHaveProperty("ovenRoll");
  });

  it("preserves exact new reports through save and ordinary continuation without a repeat or delivery", () => {
    for (const world of Object.values(journey)) {
      const raw = canonicalStringify(world), restored = upgradeWorldState(JSON.parse(raw));
      expect(canonicalStringify(restored)).toBe(raw);
      expect(world.depth.hero.resources).toMatchObject({ health: 29, mana: 20 });
      expect(world.depth.hero.gold).toBe(24);
    }
    const restored = upgradeWorldState(JSON.parse(canonicalStringify(journey.completed)))!;
    expect(advanceWorld(restored)).toEqual(journey.next);
    expect(campaignDirector(restored).candidates.every(candidate => candidate.command.type !== "reunite-companion")).toBe(true);
    expect(journey.next.depth.companionReunion).toEqual(journey.completed.depth.companionReunion);
    expect(journey.next.depth.elsewhereLoaf).toEqual(journey.before.depth.elsewhereLoaf);
    expect(journey.next.depth.hero.inventory).toEqual(journey.before.depth.hero.inventory);
    expect(journey.completed.chronicle.filter(entry => entry.commandType === "reunite-companion")).toHaveLength(1);
  });

  it("loads the hash-verified reconstructed actual old greeting without retroactive news", () => {
    const old = releasedOvenReportBaselineFixture(), next = releasedOvenReportNextFixture();
    expect([old.tick, canonicalHash(old), next.tick, canonicalHash(next)])
      .toEqual([86, "195410d557c0b9dc", 87, "281ce30ff33f2647"]);
    expect(old.depth.elsewhereLoaf?.completion?.tick).toBe(74);
    expect(old.depth.companionReunion!.completed).not.toHaveProperty("ovenReport");
    expect(next.depth.companionReunion!.completed).not.toHaveProperty("ovenReport");
    expect(old.depth.companionReunion!.completed!.memory).toEqual(journey.completed.depth.companionReunion!.completed!.memory);
    expect(canonicalStringify(upgradeWorldState(JSON.parse(canonicalStringify(old))))).toBe(canonicalStringify(old));
    // Local source-proof corroboration only: CI retains the independently
    // captured full hashes above and does not require ignored scratch files.
    const actualBaselinePath = process.env.TG2_OVEN_REPORT_BASELINE;
    if (actualBaselinePath !== undefined) {
      const actual = JSON.parse(readFileSync(actualBaselinePath, "utf8")) as { worlds: { completed: unknown; next: unknown } };
      expect(canonicalStringify(old)).toBe(canonicalStringify(actual.worlds.completed));
      expect(canonicalStringify(next)).toBe(canonicalStringify(actual.worlds.next));
    }
  });
});
