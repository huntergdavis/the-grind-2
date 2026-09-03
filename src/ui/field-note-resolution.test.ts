import { describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { monsterDefinitions } from "../depth/combat";
import { projectCounterDuelSpeciesHabit } from "../depth/counter-duel";
import type { MonsterLoreState } from "../depth/types";
import {
  isFieldNoteResolutionPacketV1,
  maximumFieldNoteResolutionUnlocks,
  projectFieldNoteResolution,
  type FieldNoteResolutionPacketV1,
} from "./field-note-resolution";

type StartCommand = "start-combat" | "start-counter-duel";

interface ResolutionFixture {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
  readonly packet: FieldNoteResolutionPacketV1;
}

const fixtureCache = new Map<string, ResolutionFixture>();

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) expectDeepFrozen(nested);
}

function changedLore(before: WorldState, after: WorldState): readonly MonsterLoreState[] {
  const prior = new Map(before.depth.hero.monsterLore.map((entry) => [entry.monsterId, entry]));
  return after.depth.hero.monsterLore.filter((entry) => {
    const earlier = prior.get(entry.monsterId);
    return entry.encounters === (earlier?.encounters ?? 0) + 1;
  });
}

function preparedBefore(current: WorldState, observed: readonly MonsterLoreState[]): WorldState {
  const lore = new Map(current.depth.hero.monsterLore.map((entry) => [entry.monsterId, entry]));
  for (const entry of observed) lore.set(entry.monsterId, { ...entry, encounters: 2 });
  return {
    ...current,
    depth: {
      ...current.depth,
      hero: {
        ...current.depth.hero,
        monsterLore: [...lore.values()].sort((left, right) => left.monsterId < right.monsterId ? -1 : left.monsterId > right.monsterId ? 1 : 0),
      },
    },
  };
}

function fixture(commandType: StartCommand, minimumUnlocks = 1): ResolutionFixture {
  const cacheKey = `${commandType}:${minimumUnlocks}`;
  const cached = fixtureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    let current = createWorld(
      `field-note-resolution-${commandType}-${minimumUnlocks}-${seedIndex}`,
      `campaign:field-note-resolution:${commandType}:${minimumUnlocks}:${seedIndex}`,
    );
    for (let step = 0; step < 180; step += 1) {
      const provisional = advanceWorld(current);
      const source = provisional.chronicle.at(-1);
      if (source?.commandType === commandType) {
        const observed = changedLore(current, provisional);
        if (new Set(observed.map((entry) => entry.monsterId)).size >= minimumUnlocks) {
          const before = preparedBefore(current, observed);
          const after = advanceWorld(before);
          const committedSource = after.chronicle.at(-1);
          if (committedSource?.commandType === commandType) {
            const packet = projectFieldNoteResolution(before, after, committedSource);
            if (packet !== null && packet.unlocks.length >= minimumUnlocks) {
              const result = { before, after, source: committedSource, packet };
              fixtureCache.set(cacheKey, result);
              return result;
            }
          }
        }
      }
      current = provisional;
    }
  }
  throw new Error(`Could not find a canonical ${commandType} transition with ${minimumUnlocks} unlocks`);
}

function replaceLore(
  world: WorldState,
  speciesId: string,
  change: (entry: MonsterLoreState) => MonsterLoreState,
): WorldState {
  return {
    ...world,
    depth: {
      ...world.depth,
      hero: {
        ...world.depth.hero,
        monsterLore: world.depth.hero.monsterLore.map((entry) => entry.monsterId === speciesId ? change(entry) : entry),
      },
    },
  };
}

describe("Field-Note Resolution truth projection", () => {
  it("projects a genuine tactical 2-to-3 transition with aggregate-only history and frozen sorted facts", () => {
    const { before, after, source, packet } = fixture("start-combat", 2);
    const beforeSnapshot = JSON.stringify(before);
    const afterSnapshot = JSON.stringify(after);
    const sourceSnapshot = JSON.stringify(source);
    expect(packet).toMatchObject({
      schemaVersion: 1,
      eventId: source.id,
      tick: source.tick,
      campaignId: after.campaignId,
      heroId: after.hero.id,
      heroName: after.hero.name,
      encounterMode: "tactical",
      sourceCommandType: "start-combat",
      priorEvidence: "aggregate-only",
    });
    expect(packet.unlocks).toHaveLength(2);
    expect(packet.unlocks.map((unlock) => unlock.speciesId)).toEqual(
      [...packet.unlocks.map((unlock) => unlock.speciesId)].sort(),
    );
    expect(packet.unlocks.every((unlock) =>
      unlock.beforeEncounterCount === 2
      && unlock.afterEncounterCount === 3
      && unlock.requiredEncounterCount === 3
    )).toBe(true);
    expect(packet.precedenceText).toContain("no live tell");
    expect(packet.precedenceText).toContain("no present intent");
    expect(packet.speciesKey).toBe(packet.unlocks.map((unlock) => unlock.speciesId).join("+"));
    expect(isFieldNoteResolutionPacketV1(packet)).toBe(true);
    expect(isFieldNoteResolutionPacketV1(JSON.parse(JSON.stringify(packet)))).toBe(true);
    expectDeepFrozen(packet);
    expect(JSON.stringify(before)).toBe(beforeSnapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
    expect(JSON.stringify(source)).toBe(sourceSnapshot);
  });

  it("distinguishes a genuine Pattern Duel source and preserves live-tell precedence", () => {
    const { after, packet } = fixture("start-counter-duel");
    expect(after.depth.counterDuel).not.toBeNull();
    expect(after.depth.combat).toBeNull();
    expect(packet).toMatchObject({
      encounterMode: "pattern-duel",
      sourceCommandType: "start-counter-duel",
      priorEvidence: "aggregate-only",
    });
    expect(packet.precedenceText).toContain("live tell takes precedence");
    expect(packet.precedenceText).toContain("no committed stance");
  });

  it("validates one or two complete, canonical, strictly sorted unlock facts", () => {
    const base = fixture("start-counter-duel").packet;
    const allUnlocks = monsterDefinitions.map((definition) => {
      const habit = projectCounterDuelSpeciesHabit(definition.id, 3);
      if (habit?.status !== "established") throw new Error(`Missing canonical habit for ${definition.id}`);
      return {
        speciesId: definition.id,
        speciesName: definition.name,
        beforeEncounterCount: 2 as const,
        afterEncounterCount: 3 as const,
        requiredEncounterCount: 3 as const,
        preferredStance: habit.preferredStance,
        habitLabel: habit.label,
      };
    }).sort((left, right) => left.speciesId < right.speciesId ? -1 : left.speciesId > right.speciesId ? 1 : 0);
    expect(allUnlocks).toHaveLength(monsterDefinitions.length);
    expect(maximumFieldNoteResolutionUnlocks).toBe(2);
    for (let count = 1; count <= maximumFieldNoteResolutionUnlocks; count += 1) {
      const unlocks = allUnlocks.slice(0, count);
      expect(isFieldNoteResolutionPacketV1({
        ...base,
        speciesKey: unlocks.map((unlock) => unlock.speciesId).join("+"),
        unlocks,
      }), `unlock count ${count}`).toBe(true);
    }
  });

  it("fails closed on wrong command, tick, campaign, hero, and stale or replayed sources", () => {
    const { before, after, source } = fixture("start-counter-duel");
    expect(projectFieldNoteResolution(before, after, { ...source, commandType: "travel" })).toBeNull();
    expect(projectFieldNoteResolution(before, after, { ...source, tick: source.tick + 1 })).toBeNull();
    expect(projectFieldNoteResolution(before, { ...after, campaignId: `${after.campaignId}:forged` }, source)).toBeNull();
    expect(projectFieldNoteResolution(before, { ...after, hero: { ...after.hero, id: `${after.hero.id}:forged` } }, source)).toBeNull();
    expect(projectFieldNoteResolution(after, after, source)).toBeNull();
    const stale = before.chronicle.at(-1);
    if (stale !== undefined) expect(projectFieldNoteResolution(before, after, stale)).toBeNull();
  });

  it("fails closed on wrong species, canonical name drift, and non-exact threshold counts", () => {
    const { before, after, source, packet } = fixture("start-counter-duel");
    const speciesId = packet.unlocks[0]!.speciesId;
    expect(projectFieldNoteResolution(
      before,
      replaceLore(after, speciesId, (entry) => ({ ...entry, monsterId: "unknown-species" })),
      source,
    )).toBeNull();
    expect(projectFieldNoteResolution(
      before,
      replaceLore(after, speciesId, (entry) => ({ ...entry, monsterName: `${entry.monsterName}?` })),
      source,
    )).toBeNull();
    expect(projectFieldNoteResolution(
      replaceLore(before, speciesId, (entry) => ({ ...entry, encounters: 1 })),
      after,
      source,
    )).toBeNull();
    expect(projectFieldNoteResolution(
      before,
      replaceLore(after, speciesId, (entry) => ({ ...entry, encounters: 4 })),
      source,
    )).toBeNull();
  });

  it("fails closed on incomplete, reordered, duplicate, and unrelated forged transition state", () => {
    const { before, after, source, packet } = fixture("start-combat", 2);
    const removedId = packet.unlocks[0]!.speciesId;
    const incomplete = {
      ...after,
      depth: {
        ...after.depth,
        hero: {
          ...after.depth.hero,
          monsterLore: after.depth.hero.monsterLore.filter((entry) => entry.monsterId !== removedId),
        },
      },
    };
    expect(projectFieldNoteResolution(before, incomplete, source)).toBeNull();
    const reordered = {
      ...after,
      depth: {
        ...after.depth,
        hero: { ...after.depth.hero, monsterLore: [...after.depth.hero.monsterLore].reverse() },
      },
    };
    expect(projectFieldNoteResolution(before, reordered, source)).toBeNull();
    const duplicate = {
      ...after,
      depth: {
        ...after.depth,
        hero: { ...after.depth.hero, monsterLore: [...after.depth.hero.monsterLore, after.depth.hero.monsterLore[0]!] },
      },
    };
    expect(projectFieldNoteResolution(before, duplicate, source)).toBeNull();
    const unrelated = {
      ...after,
      depth: { ...after.depth, quest: { ...after.depth.quest, title: `${after.depth.quest.title}?` } },
    };
    expect(projectFieldNoteResolution(before, unrelated, source)).toBeNull();
  });

  it("rejects malformed packets, extra keys, wrong mode semantics, ordering, duplicates, and unknown species", () => {
    const packet = fixture("start-combat", 2).packet;
    expect(isFieldNoteResolutionPacketV1({ ...packet, extra: true })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({ ...packet, encounterMode: "pattern-duel" })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({ ...packet, priorEvidence: "three-exact-receipts" })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({ ...packet, unlocks: [] })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({
      ...packet,
      speciesKey: [...packet.unlocks].reverse().map((unlock) => unlock.speciesId).join("+"),
      unlocks: [...packet.unlocks].reverse(),
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({
      ...packet,
      speciesKey: `${packet.unlocks[0]!.speciesId}+${packet.unlocks[0]!.speciesId}`,
      unlocks: [packet.unlocks[0], packet.unlocks[0]],
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({
      ...packet,
      speciesKey: "unknown-species",
      unlocks: [{ ...packet.unlocks[0], speciesId: "unknown-species" }],
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV1({
      ...packet,
      unlocks: [{ ...packet.unlocks[0], habitLabel: "Always attacks next" }],
    })).toBe(false);
  });
});
