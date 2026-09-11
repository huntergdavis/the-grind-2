import { beforeAll, describe, expect, it } from "vitest";
import { canonicalStringify } from "../core/canonical";
import { naturalRoadSupperJourneyFixture, type NaturalRoadSupperJourney } from "../../tests/road-supper-fixtures";
import { projectCombatAftermathEntry, projectCombatAftermathScene, type BoundCombatAftermath } from "./combat-aftermath";
import { projectStatusHistory, type ChronicleStatusHistoryRow } from "./status-history";

describe("Last exchange in existing Status history", () => {
  let journey: NaturalRoadSupperJourney;
  let recap: BoundCombatAftermath;
  beforeAll(() => {
    // Reuse the actual bounded market→camp→battle fixture, without changing
    // equipment, enemies, choices or the recorded defeat to obtain a recap.
    journey = naturalRoadSupperJourneyFixture();
    recap = projectCombatAftermathScene(journey.resolved)!;
  });

  it("adds one exact-source disclosure without replacing the terminal facts or adding rows", () => {
    expect(recap).not.toBeNull();
    const before = canonicalStringify(journey.resolved);
    const base = projectStatusHistory(journey.resolved);
    const enriched = projectStatusHistory(journey.resolved, [recap]);
    expect(enriched).toHaveLength(base.length);
    const matches = enriched.filter((entry): entry is ChronicleStatusHistoryRow => entry.source === "chronicle" && entry.aftermath !== undefined);
    expect(matches).toHaveLength(1);
    const { aftermath, ...unchanged } = matches[0]!;
    expect(unchanged).toEqual(base.find((entry) => entry.source === "chronicle" && entry.eventId === recap.chronicleId));
    expect(aftermath).toEqual(recap);
    expect(aftermath!.commandId).toBe(journey.resolved.chronicle.at(-1)!.commandId);
    expect(aftermath!.tick).toBe(65);
    expect(Object.isFrozen(matches[0])).toBe(true);
    expect(canonicalStringify(journey.resolved)).toBe(before);
  });

  it("retains the same receipt after recovery without replaying the live headline", () => {
    const terminal = journey.resolved.chronicle.at(-1)!;
    const retained = projectCombatAftermathEntry(journey.next, terminal);
    expect(retained).toEqual(recap);
    expect(projectCombatAftermathScene(journey.next)).toBeNull();
    const rows = projectStatusHistory(journey.next, [retained!]);
    expect(rows.find((entry) => entry.source === "chronicle" && entry.eventId === terminal.id)).toMatchObject({ aftermath: recap });
    expect(rows.find((entry) => entry.source === "chronicle" && entry.eventId === journey.next.chronicle.at(-1)!.id)).not.toHaveProperty("aftermath");
    const restored = JSON.parse(canonicalStringify(journey.next)) as typeof journey.next;
    expect(projectCombatAftermathEntry(restored, terminal)).toEqual(recap);
  });

  it("requires the exact row, tick, command and campaign even for a supplied recap", () => {
    for (const candidate of [
      { ...recap, chronicleId: `${recap.chronicleId}:other` },
      { ...recap, tick: recap.tick - 1 },
      { ...recap, commandId: `${recap.commandId}:other` },
    ]) {
      expect(projectStatusHistory(journey.resolved, [candidate]).some((entry) => entry.source === "chronicle" && entry.aftermath !== undefined)).toBe(false);
    }
    const foreign = { ...journey.resolved, campaignId: "campaign:unrelated-history" };
    expect(projectStatusHistory(foreign, [recap]).some((entry) => entry.source === "chronicle" && entry.aftermath !== undefined)).toBe(false);
  });

  it("keeps the two different enemies and actual lethal source instead of inventing a counterattack", () => {
    const combat = journey.resolved.depth.roadSupper!.terminal!.combat;
    const damage = combat.eventStream.events.filter((event) => event.kind === "damage");
    expect(damage).toHaveLength(2);
    expect(damage[0]!.targetId).not.toBe(damage[1]!.actorId);
    expect(recap.sourceEventIds).toEqual(expect.arrayContaining(damage.map((event) => event.id)));
    for (const name of ["River Wyrmling 2", "Lantern Wolf 1", "Aster Rook"]) expect(recap.detail).toContain(name);
    expect(recap.outcome).toBe("defeat");
    expect(combat.supper!.spent).toMatchObject({ damageBefore: 65, damageAfter: 48, prevented: 0 });
    expect(journey.resolved.depth.hero.resources.health).toBe(0);
  });

  it("leaves ongoing and legacy no-evidence history in its previous shape", () => {
    const ongoing = journey.turns.find((state) => state.depth.combat?.outcome === "ongoing")!;
    expect(projectCombatAftermathScene(ongoing)).toBeNull();
    const source = { campaignId: ongoing.campaignId, chronicle: ongoing.chronicle, depth: { log: ongoing.depth.log } };
    const base = projectStatusHistory(source);
    expect(projectStatusHistory(source, [])).toEqual(base);
    expect(base.every((entry) => !Object.hasOwn(entry, "aftermath"))).toBe(true);
  });
});
