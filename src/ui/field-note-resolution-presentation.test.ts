import { beforeAll, describe, expect, it } from "vitest";
import { advanceWorld, createWorld } from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import type { CounterDuelStance, MonsterLoreState } from "../depth/types";
import {
  fieldNoteEvidenceRelationship,
  fieldNotePublicTellLabel,
  fieldNotePublicTellMatchesActiveDuel,
  fieldNotePublicTellText,
  isFieldNotePublicTellV1,
  isFieldNoteResolutionPacketV2,
  projectFieldNoteResolutionPacketV2,
  type FieldNoteResolutionPacketV2,
} from "./field-note-resolution-presentation";

interface PatternFixture {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
  readonly packet: FieldNoteResolutionPacketV2;
}

let cachedFixture: PatternFixture | null = null;

function changedLore(before: WorldState, after: WorldState): readonly MonsterLoreState[] {
  const prior = new Map(before.depth.hero.monsterLore.map((entry) => [entry.monsterId, entry]));
  return after.depth.hero.monsterLore.filter((entry) =>
    entry.encounters === (prior.get(entry.monsterId)?.encounters ?? 0) + 1,
  );
}

function patternFixture(): PatternFixture {
  if (cachedFixture !== null) return cachedFixture;
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    let current = createWorld(
      `field-note-live-tell-${seedIndex}`,
      `campaign:field-note-live-tell:${seedIndex}`,
    );
    for (let step = 0; step < 180; step += 1) {
      const provisional = advanceWorld(current);
      const source = provisional.chronicle.at(-1);
      if (source?.commandType === "start-counter-duel") {
        const observed = changedLore(current, provisional);
        if (observed.length === 1) {
          const lore = new Map(current.depth.hero.monsterLore.map((entry) => [entry.monsterId, entry]));
          for (const entry of observed) lore.set(entry.monsterId, { ...entry, encounters: 2 });
          const before = {
            ...current,
            depth: {
              ...current.depth,
              hero: {
                ...current.depth.hero,
                monsterLore: [...lore.values()].sort((left, right) => left.monsterId.localeCompare(right.monsterId)),
              },
            },
          };
          const after = advanceWorld(before);
          const committedSource = after.chronicle.at(-1);
          if (committedSource?.commandType === "start-counter-duel") {
            const packet = projectFieldNoteResolutionPacketV2(before, after, committedSource);
            if (packet !== null) {
              cachedFixture = { before, after, source: committedSource, packet };
              return cachedFixture;
            }
          }
        }
      }
      current = provisional;
    }
  }
  throw new Error("Could not find a canonical Pattern Duel Field-Note transition");
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) expectDeepFrozen(nested);
}

describe("Pattern Duel Field-Note presentation truth", () => {
  beforeAll(() => {
    patternFixture();
  }, 20_000);

  it("copies the exact public opening tell while withholding committed stance", () => {
    const { after, packet } = patternFixture();
    const duel = after.depth.counterDuel;
    if (duel === null) throw new Error("Pattern fixture has no duel");
    expect(packet).toMatchObject({
      schemaVersion: 2,
      encounterMode: "pattern-duel",
      sourceCommandType: "start-counter-duel",
      commitmentVisibility: "hidden",
      publicTell: {
        schemaVersion: 1,
        duelId: duel.id,
        tellId: duel.tell.id,
        round: 1,
        cue: duel.tell.cue,
        suggestedStance: duel.tell.suggestedStance,
        clarity: duel.tell.clarity,
      },
    });
    expect(fieldNotePublicTellText(packet.publicTell)).toBeTruthy();
    expect(fieldNotePublicTellLabel(packet.publicTell)).toContain("suggests");
    expect(JSON.stringify(packet)).not.toContain("opponentStance");
    expect(JSON.stringify(packet)).not.toContain("committedStance");
    expect(isFieldNoteResolutionPacketV2(packet)).toBe(true);
    expect(isFieldNoteResolutionPacketV2(JSON.parse(JSON.stringify(packet)))).toBe(true);
    expectDeepFrozen(packet);
  });

  it("is deterministic and does not mutate either world or source", () => {
    const { before, after, source, packet } = patternFixture();
    const snapshots = [JSON.stringify(before), JSON.stringify(after), JSON.stringify(source)];
    expect(projectFieldNoteResolutionPacketV2(before, after, source)).toEqual(packet);
    expect([JSON.stringify(before), JSON.stringify(after), JSON.stringify(source)]).toEqual(snapshots);
  });

  it("binds a structurally valid public receipt to the exact active duel", () => {
    const { after, packet } = patternFixture();
    expect(fieldNotePublicTellMatchesActiveDuel(packet, after)).toBe(true);
    const duelId = `${packet.publicTell.duelId}:unrelated`;
    const unrelated = {
      ...packet,
      publicTell: {
        ...packet.publicTell,
        duelId,
        tellId: `${duelId}:round:1:tell`,
      },
    } as FieldNoteResolutionPacketV2;
    expect(isFieldNoteResolutionPacketV2(unrelated)).toBe(true);
    expect(fieldNotePublicTellMatchesActiveDuel(unrelated, after)).toBe(false);
  });

  it("admits all three canonical public signal shapes at every clarity level", () => {
    const cues: Readonly<Record<CounterDuelStance, "forward-weight" | "closed-center" | "open-flank">> = {
      rush: "forward-weight",
      ward: "closed-center",
      feint: "open-flank",
    };
    for (const stance of ["rush", "ward", "feint"] as const) {
      for (const clarity of [1, 2, 3] as const) {
        const duelId = `duel:${stance}:${clarity}`;
        expect(isFieldNotePublicTellV1({
          schemaVersion: 1,
          duelId,
          tellId: `${duelId}:round:1:tell`,
          round: 1,
          cue: cues[stance],
          suggestedStance: stance,
          clarity,
        }), `${stance} clarity ${clarity}`).toBe(true);
      }
    }
  });

  it("keeps agreement and disagreement as independent evidence relationships", () => {
    const { packet } = patternFixture();
    const preferred = packet.unlocks[0]!.preferredStance;
    const cueByStance = {
      rush: "forward-weight",
      ward: "closed-center",
      feint: "open-flank",
    } as const;
    const alternate = (["rush", "ward", "feint"] as const).find((stance) => stance !== preferred)!;
    const agree = {
      ...packet,
      publicTell: {
        ...packet.publicTell,
        cue: cueByStance[preferred],
        suggestedStance: preferred,
      },
    } as FieldNoteResolutionPacketV2;
    const disagree = {
      ...packet,
      publicTell: {
        ...packet.publicTell,
        cue: cueByStance[alternate],
        suggestedStance: alternate,
      },
    } as FieldNoteResolutionPacketV2;
    expect(isFieldNoteResolutionPacketV2(agree)).toBe(true);
    expect(isFieldNoteResolutionPacketV2(disagree)).toBe(true);
    expect(fieldNoteEvidenceRelationship(agree)).toBe("agree");
    expect(fieldNoteEvidenceRelationship(disagree)).toBe("live-over-habit");
  });

  it("does not upgrade tactical Field-Note resolutions", () => {
    const { before, after, source } = patternFixture();
    expect(projectFieldNoteResolutionPacketV2(before, after, { ...source, commandType: "start-combat" })).toBeNull();
  });

  it("fails closed on stale or altered duel evidence", () => {
    const { before, after, source } = patternFixture();
    expect(projectFieldNoteResolutionPacketV2(after, after, source)).toBeNull();
    const duel = after.depth.counterDuel;
    if (duel === null) throw new Error("Pattern fixture has no duel");
    expect(projectFieldNoteResolutionPacketV2(before, {
      ...after,
      depth: {
        ...after.depth,
        counterDuel: { ...duel, tell: { ...duel.tell, clarity: duel.tell.clarity === 3 ? 2 : 3 } },
      },
    }, source)).toBeNull();
  });

  it("rejects forged cues, labels, certainty, power, and extra keys", () => {
    const { packet } = patternFixture();
    expect(isFieldNoteResolutionPacketV2({ ...packet, extra: true })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({ ...packet, encounterMode: "tactical" })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({
      ...packet,
      publicTell: { ...packet.publicTell, cue: packet.publicTell.cue === "forward-weight" ? "closed-center" : "forward-weight" },
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({
      ...packet,
      publicTell: { ...packet.publicTell, tellId: `${packet.publicTell.tellId}:forged` },
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({
      ...packet,
      commitmentVisibility: "revealed",
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({
      ...packet,
      unlocks: [...packet.unlocks, packet.unlocks[0]],
    })).toBe(false);
    expect(isFieldNoteResolutionPacketV2({
      ...packet,
      publicTell: { ...packet.publicTell, opponentStance: "rush" },
    })).toBe(false);
  });
});
