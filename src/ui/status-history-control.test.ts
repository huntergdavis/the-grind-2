import { beforeAll, describe, expect, it } from "vitest";
import { naturalCombatControlFixture } from "../../tests/combat-control-fixtures";
import { canonicalStringify } from "../core/canonical";
import type { WorldState } from "../core/types";
import { projectCombatAftermathScene } from "./combat-aftermath";
import { projectCombatControlEntry, projectCombatControlScene, type BoundCombatControlRecap } from "./combat-control-recap";
import { projectStatusHistory, type ChronicleStatusHistoryRow } from "./status-history";

function controlRows(world: WorldState, controls: readonly BoundCombatControlRecap[]): ChronicleStatusHistoryRow[] {
  return projectStatusHistory(world, [], controls).filter((row): row is ChronicleStatusHistoryRow =>
    row.source === "chronicle" && row.control !== undefined);
}

describe("a weakened answer in existing Status history", () => {
  let journey: ReturnType<typeof naturalCombatControlFixture>;
  let recap: BoundCombatControlRecap;
  beforeAll(() => {
    // The same bounded, actual v181 journey: no supplied status, target or HP.
    journey = naturalCombatControlFixture();
    recap = projectCombatControlScene(journey.retaliated)!;
  }, 20_000);

  it("adds one exact-source disclosure without replacing actual facts or adding rows", () => {
    expect(recap).not.toBeNull();
    expect([journey.applied.tick, journey.retaliated.tick]).toEqual([276, 277]);
    const world = journey.retaliated, saved = canonicalStringify(world);
    const base = projectStatusHistory(world), enriched = projectStatusHistory(world, [], [recap]);
    expect(enriched).toHaveLength(base.length);
    const matches = controlRows(world, [recap]);
    expect(matches).toHaveLength(1);
    const { control, ...unchanged } = matches[0]!;
    expect(unchanged).toEqual(base.find(row => row.source === "chronicle" && row.eventId === recap.chronicleId));
    expect(control).toEqual(recap);
    expect(control!.commandId).toBe(world.chronicle.at(-1)!.commandId);
    expect(control!.tick).toBe(277);
    expect(Object.isFrozen(enriched)).toBe(true);
    expect(Object.isFrozen(matches[0])).toBe(true);
    expect(canonicalStringify(world)).toBe(saved);
  });

  it("keeps the actual application and response sources without quantifying a saving", () => {
    expect(recap.heroId).toBe(journey.retaliated.hero.id);
    expect(recap.enemyId).toBe(journey.applicationEvent.targetId);
    expect(recap.applicationTurn).toBe(journey.applicationEvent.turn);
    expect(recap.retaliationTurn).toBe(journey.retaliationEvent.turn);
    expect(recap.sourceEventIds).toEqual(expect.arrayContaining([
      journey.applicationEvent.id, journey.statusTickEvent.id, journey.retaliationEvent.id,
    ]));
    expect(recap.detail).toContain("Turning Check");
    expect(recap.detail).toContain("Moonhowl");
    expect(recap.detail).toContain(`${journey.retaliationEvent.amount} HP`);
    expect(recap.detail).toContain(`${journey.retaliationEvent.healthBefore}→${journey.retaliationEvent.healthAfter} HP`);
    expect(recap).not.toHaveProperty("damagePrevented");
    expect(recap).not.toHaveProperty("damageWithoutTechnique");
    expect(recap.detail).not.toMatch(/saved|prevented|decisive|would have/iu);
  });

  it("requires the exact row, tick, command, campaign and hero for a supplied packet", () => {
    for (const candidate of [
      { ...recap, chronicleId: `${recap.chronicleId}:other` },
      { ...recap, tick: recap.tick - 1 },
      { ...recap, commandId: `${recap.commandId}:other` },
      { ...recap, heroId: "hero:another-campaign" },
    ]) expect(controlRows(journey.retaliated, [candidate])).toEqual([]);
    expect(controlRows({ ...journey.retaliated, campaignId: "campaign:another-history" }, [recap])).toEqual([]);
    expect(controlRows(journey.retaliated, [recap, recap])).toHaveLength(1);
  });

  it("does not attach control evidence to a nonbattle or different action row", () => {
    const world = journey.retaliated, source = world.chronicle.at(-1)!;
    for (const replacement of [
      { ...source, mode: "camp" as const },
      { ...source, commandType: "wait" as const },
    ]) {
      const changed = { ...world, chronicle: [...world.chronicle.slice(0, -1), replacement] };
      expect(controlRows(changed, [recap])).toEqual([]);
    }
    expect(controlRows(journey.applied, [recap])).toEqual([]);
    expect(projectCombatControlScene(journey.applied)).toBeNull();
  });

  it("restores exact current evidence while preserving the legacy empty-argument shape", () => {
    const world = journey.retaliated, restored = JSON.parse(canonicalStringify(world)) as WorldState;
    expect(projectCombatControlScene(restored)).toEqual(recap);
    expect(projectCombatControlEntry(restored, restored.chronicle.at(-1)!)).toEqual(recap);
    expect(projectStatusHistory(restored, [], [recap])).toEqual(projectStatusHistory(world, [], [recap]));
    expect(projectStatusHistory(world, [])).toEqual(projectStatusHistory(world));
    expect(projectStatusHistory(world, [], [])).toEqual(projectStatusHistory(world));
    expect(projectStatusHistory(world).every(row => !Object.hasOwn(row, "control"))).toBe(true);
  });

  it("keeps Last exchange separate at the real terminal source without inventing a later archive", () => {
    const world = journey.terminal, source = world.chronicle.at(-1)!;
    const control = projectCombatControlEntry(world, source)!;
    const aftermath = projectCombatAftermathScene(world)!;
    expect(control).not.toBeNull();
    expect(aftermath).not.toBeNull();
    expect(control).toMatchObject({ tick: 278, commandId: source.commandId, chronicleId: source.id,
      detail: recap.detail, sourceEventIds: recap.sourceEventIds });
    const base = projectStatusHistory(world, [aftermath]);
    const rows = projectStatusHistory(world, [aftermath], [control]);
    expect(rows).toHaveLength(base.length);
    const terminal = rows.find((row): row is ChronicleStatusHistoryRow => row.source === "chronicle" && row.eventId === source.id)!;
    const { control: retainedControl, ...withoutControl } = terminal;
    expect(withoutControl).toEqual(base.find(row => row.source === "chronicle" && row.eventId === source.id));
    expect(retainedControl).toEqual(control);
    expect(terminal.aftermath).toEqual(aftermath);
    expect(projectCombatControlScene(world)).toBeNull();
    const restored = JSON.parse(canonicalStringify(world)) as WorldState;
    expect(projectCombatControlEntry(restored, restored.chronicle.at(-1)!)).toEqual(control);
    // This ordinary road fight has no independent timestamped Supper/lair
    // archive. Do not attach its reusable combat ID to an older row after wait.
    expect(projectCombatControlScene(journey.next)).toBeNull();
    expect(projectCombatControlEntry(journey.next, source)).toBeNull();
    expect(projectCombatControlEntry(journey.next, journey.retaliated.chronicle.at(-1)!)).toBeNull();
  });
});
