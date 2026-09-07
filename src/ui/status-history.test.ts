import { describe, expect, it } from "vitest";
import { eventPolicyForMode } from "../core/simulation";
import type { ActorDecisionTrace, ChronicleEntry } from "../core/types";
import { maximumDepthLogEntries } from "../depth/state";
import type { DepthLogEntry } from "../depth/types";
import {
  maximumStatusChronicleEntries,
  maximumStatusHistoryEntries,
  maximumStatusMechanicsEntries,
  projectStatusHistory,
  type ChronicleStatusHistoryRow,
  type StatusHistorySource,
} from "./status-history";

const campaignId = "campaign:status-history";

function chronicle(tick: number, changes: Partial<ChronicleEntry> = {}): ChronicleEntry {
  return {
    id: `${campaignId}:${tick}`, tick, mode: "travel", location: "Greyford Road",
    headline: "A road chosen", action: "Mara travels beside injured Rowan.",
    goal: "Reach Greyford.", consequence: "The party remains on the road.",
    sensoryIntensity: 1, attention: "backgroundSafe", policy: eventPolicyForMode("travel"),
    consideredActions: ["Continue the road"], chosenAction: "Continue the road",
    rationale: "The visible objective lies ahead.", ...changes,
  };
}

function mechanical(tick: number, changes: Partial<DepthLogEntry> = {}): DepthLogEntry {
  return {
    id: `seed:status-history:depth:${tick}:world`, tick,
    category: "world", message: `Mechanical receipt at tick ${tick}.`, ...changes,
  };
}

function source(entries: readonly ChronicleEntry[] = [], log: readonly DepthLogEntry[] = []): StatusHistorySource {
  return { campaignId, chronicle: entries, depth: { log } };
}

describe("shared canonical status history", () => {
  it("is empty when there are no retained receipts", () => {
    expect(projectStatusHistory(source())).toEqual([]);
  });

  it("preserves event facts and autonomous reasons as separately named fields", () => {
    const entry = chronicle(7, { action: "Mara holds <Rowan's shield> & waits." });
    const result = projectStatusHistory(source([entry]))[0] as ChronicleStatusHistoryRow;
    expect(result).toEqual({
      source: "chronicle", eventId: entry.id, campaignId, tick: 7,
      mode: entry.mode, location: entry.location, headline: entry.headline,
      action: entry.action, goal: entry.goal, consequence: entry.consequence,
      decision: { chosenAction: entry.chosenAction, rationale: entry.rationale,
        commandId: null, commandType: null, trace: null },
    });
    expect(result).not.toHaveProperty("emotion");
    expect(result).not.toHaveProperty("narrative");
  });

  it("interleaves both sources newest first without pretending same-tick rows are new chronology", () => {
    const result = projectStatusHistory(source([chronicle(2), chronicle(5), chronicle(1)], [
      mechanical(5, { id: "same-tick:first", category: "combat" }), mechanical(3),
      mechanical(5, { id: "same-tick:second", category: "ability" }), mechanical(0),
    ]));
    expect(result.map((row) => [row.tick, row.source, row.eventId])).toEqual([
      [5, "chronicle", `${campaignId}:5`], [5, "mechanics", "same-tick:second"],
      [5, "mechanics", "same-tick:first"], [3, "mechanics", mechanical(3).id],
      [2, "chronicle", `${campaignId}:2`], [1, "chronicle", `${campaignId}:1`],
      [0, "mechanics", mechanical(0).id],
    ]);
  });

  it("deduplicates canonical IDs within each source, retaining the latest occurrence", () => {
    const result = projectStatusHistory(source([
      chronicle(3), chronicle(3, { headline: "Latest retained Chronicle receipt" }),
    ], [mechanical(3), mechanical(3, { message: "Latest retained mechanical receipt" })]));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ source: "chronicle", headline: "Latest retained Chronicle receipt" });
    expect(result[1]).toMatchObject({ source: "mechanics", message: "Latest retained mechanical receipt" });
  });

  it("never merges independent sources merely because their IDs, ticks, or words match", () => {
    const entry = chronicle(3);
    const result = projectStatusHistory(source([entry], [mechanical(3, { id: entry.id, message: entry.action })]));
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.source)).toEqual(["chronicle", "mechanics"]);
    expect(result.map((row) => row.eventId)).toEqual([entry.id, entry.id]);
  });

  it("uses each source's real retention bound rather than dropping older mechanical receipts", () => {
    expect(maximumStatusChronicleEntries).toBe(32);
    expect(maximumStatusMechanicsEntries).toBe(maximumDepthLogEntries);
    expect(maximumStatusHistoryEntries).toBe(160);
    const result = projectStatusHistory(source(
      Array.from({ length: 50 }, (_, tick) => chronicle(tick)),
      Array.from({ length: 150 }, (_, tick) => mechanical(tick)),
    ));
    const adventure = result.filter((row) => row.source === "chronicle");
    const mechanics = result.filter((row) => row.source === "mechanics");
    expect(result).toHaveLength(maximumStatusHistoryEntries);
    expect(adventure.map((row) => row.tick)).toEqual(Array.from({ length: 32 }, (_, index) => 49 - index));
    expect(mechanics.map((row) => row.tick)).toEqual(Array.from({ length: 128 }, (_, index) => 149 - index));
  });

  it("retains seed-based mechanical IDs without inventing a location or decision", () => {
    const entry = mechanical(0, { message: "Mara begins in Greyford." });
    expect(projectStatusHistory(source([], [entry]))).toEqual([{
      source: "mechanics", eventId: entry.id, campaignId, tick: 0,
      category: "world", message: entry.message,
    }]);
  });

  it("retains legacy Chronicle IDs and rationale without fabricating a missing trace", () => {
    const entry = chronicle(4, { id: "legacy:retained-event" });
    const result = projectStatusHistory(source([entry]))[0] as ChronicleStatusHistoryRow;
    expect(result.eventId).toBe(entry.id);
    expect(result.decision.rationale).toBe(entry.rationale);
    expect(result.decision.trace).toBeNull();
    expect(result.decision.commandId).toBeNull();
  });

  it("copies the actual decision trace without changing the source or manufacturing an emotional state", () => {
    const selected = { commandId: "command:7", actionLabel: "Guard", targetLabel: "Rowan", matchedRuleId: "protect" };
    const trace: ActorDecisionTrace = {
      actorId: "hero:mara", actorName: "Mara", context: "ordinaryCombat", profileId: "ordinaryCombat",
      matchedRuleId: "protect", reasonCode: "protect-companion", selected, considered: [selected],
      reasons: ["Rowan has low health.", "Guard is available."],
    };
    const entry = chronicle(7, { commandId: selected.commandId, commandType: "wait", decisionTrace: trace });
    const before = JSON.stringify(entry);
    const result = projectStatusHistory(source([entry]))[0] as ChronicleStatusHistoryRow;
    expect(JSON.stringify(entry)).toBe(before);
    expect(result.decision).toMatchObject({ commandId: selected.commandId, commandType: "wait", trace });
    expect(result.decision.trace).not.toBe(trace);
    expect(result.decision.trace!.selected).not.toBe(trace.selected);
    expect(result.decision.trace!.considered).not.toBe(trace.considered);
    expect(result.decision.trace!.considered[0]).not.toBe(trace.considered[0]);
    expect(result.decision.trace!.reasons).not.toBe(trace.reasons);
    expect(Object.isFrozen(result.decision.trace!.reasons)).toBe(true);
    expect(result.decision.trace).not.toHaveProperty("emotion");
  });

  it("does not reorder input arrays, accumulate past calls, or leak another loaded campaign", () => {
    const entries = [chronicle(1), chronicle(3), chronicle(2)];
    const log = [mechanical(0), mechanical(3)];
    const first = source(entries, log);
    const before = JSON.stringify(first);
    expect(projectStatusHistory(first)).toHaveLength(5);
    const next = projectStatusHistory({ campaignId: "campaign:next", chronicle: [], depth: { log: [mechanical(0)] } });
    expect(next).toHaveLength(1);
    expect(next[0]!.campaignId).toBe("campaign:next");
    expect(JSON.stringify(first)).toBe(before);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next[0])).toBe(true);
    expect(projectStatusHistory(source())).toEqual([]);
  });
});
