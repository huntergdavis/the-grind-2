import { describe, expect, it } from "vitest";
import type { FieldNoteResolutionPacketV1 } from "../ui/field-note-resolution";
import type { FieldNoteResolutionPacketV2 } from "../ui/field-note-resolution-presentation";
import {
  fieldNoteCutawayDurationSeconds,
  fieldNoteCutawayStaticHoldSeconds,
  projectFieldNoteCutawayFrame,
} from "./field-note-cutaway";

function packet(count = 1): FieldNoteResolutionPacketV1 {
  const species = [
    { speciesId: "copperhorn", speciesName: "Copperhorn", preferredStance: "rush" as const, habitLabel: "Copperhorns often favor Rush" },
    { speciesId: "inkcap-mimic", speciesName: "Inkcap Mimic", preferredStance: "feint" as const, habitLabel: "Inkcap Mimics often favor Feint" },
    { speciesId: "lantern-wolf", speciesName: "Lantern Wolf", preferredStance: "feint" as const, habitLabel: "Lantern Wolves often favor Feint" },
    { speciesId: "mossback-brute", speciesName: "Mossback Brute", preferredStance: "ward" as const, habitLabel: "Mossback Brutes often favor Ward" },
    { speciesId: "river-wyrmling", speciesName: "River Wyrmling", preferredStance: "feint" as const, habitLabel: "River Wyrmlings often favor Feint" },
    { speciesId: "synthetic-sixth", speciesName: "Synthetic Sixth", preferredStance: "ward" as const, habitLabel: "Synthetic rejection fixture" },
  ];
  const unlocks = species.slice(0, count).map((entry) => ({
    ...entry,
    beforeEncounterCount: 2 as const,
    afterEncounterCount: 3 as const,
    requiredEncounterCount: 3 as const,
  }));
  return {
    schemaVersion: 1,
    eventId: "campaign:test:10",
    tick: 10,
    campaignId: "campaign:test",
    heroId: "hero:test",
    heroName: "Mira Greyhaven",
    encounterMode: "tactical",
    sourceCommandType: "start-combat",
    speciesKey: unlocks.map((unlock) => unlock.speciesId).join("+"),
    priorEvidence: "aggregate-only",
    precedenceText: "Cautious habit only; this tactical encounter has no live tell and the note reveals no present intent.",
    unlocks,
  } as FieldNoteResolutionPacketV1;
}

function liveTellPacket(): FieldNoteResolutionPacketV2 {
  return {
    ...packet(1),
    schemaVersion: 2,
    encounterMode: "pattern-duel",
    sourceCommandType: "start-counter-duel",
    precedenceText: "Cautious habit only; a legal live tell takes precedence and the note reveals no committed stance.",
    publicTell: {
      schemaVersion: 1,
      duelId: "duel:field-note",
      tellId: "duel:field-note:round:1:tell",
      round: 1,
      cue: "forward-weight",
      suggestedStance: "rush",
      clarity: 2,
    },
    commitmentVisibility: "hidden",
  };
}

describe("Field Note resolution cutaway choreography", () => {
  it("visits the observation-to-precedence story in order within 4.8 seconds", () => {
    const phases = [0, 1.5, 2.4, 3.35, 4.2, fieldNoteCutawayDurationSeconds]
      .map((elapsed) => projectFieldNoteCutawayFrame(packet(), elapsed, false).phase);
    expect(phases).toEqual([
      "observations",
      "third-mark",
      "inference",
      "precedence",
      "final",
      "settled",
    ]);
    expect(fieldNoteCutawayDurationSeconds).toBe(4.8);
    expect(fieldNoteCutawayStaticHoldSeconds).toBe(1.2);
  });

  it("handles one or two strictly sorted unlocks with deterministic stagger", () => {
    for (let count = 1; count <= 2; count += 1) {
      const source = packet(count);
      const before = JSON.stringify(source);
      const early = projectFieldNoteCutawayFrame(source, 0.3, false);
      const settled = projectFieldNoteCutawayFrame(source, fieldNoteCutawayDurationSeconds, false);
      expect(early.unlockAlphas).toHaveLength(count);
      expect(settled.unlockAlphas).toEqual(Array.from({ length: count }, () => 1));
      expect(settled.activeUnlockIndex).toBe(count - 1);
      expect(JSON.stringify(source)).toBe(before);
      expect(projectFieldNoteCutawayFrame(source, 0.3, false)).toEqual(early);
      expect(Object.isFrozen(early.unlockAlphas)).toBe(true);
    }

    expect(() => projectFieldNoteCutawayFrame(packet(0), 0, false)).toThrow(RangeError);
    expect(() => projectFieldNoteCutawayFrame(packet(3), 0, false)).toThrow(RangeError);
    const unsorted = packet(2);
    const reversed = { ...unsorted, unlocks: [...unsorted.unlocks].reverse() };
    expect(() => projectFieldNoteCutawayFrame(reversed, 0, false)).toThrow(
      "Field Note cutaway unlocks must be strictly sorted by species ID",
    );
  });

  it("reveals only the facts owned by each semantic phase", () => {
    expect(projectFieldNoteCutawayFrame(packet(), 0.8, false)).toMatchObject({
      phase: "observations",
      thirdMarkAlpha: 0,
      habitAlpha: 0,
      precedenceAlpha: 0,
      finalAlpha: 0,
    });
    expect(projectFieldNoteCutawayFrame(packet(), 1.6, false)).toMatchObject({
      phase: "third-mark",
      habitAlpha: 0,
      precedenceAlpha: 0,
      finalAlpha: 0,
    });
    expect(projectFieldNoteCutawayFrame(packet(), 2.5, false)).toMatchObject({
      phase: "inference",
      precedenceAlpha: 0,
      finalAlpha: 0,
    });
    expect(projectFieldNoteCutawayFrame(packet(), 3.4, false)).toMatchObject({
      phase: "precedence",
      finalAlpha: 0,
    });
  });

  it("reveals the public signal, priority, and hidden commitment inside the existing precedence phase", () => {
    const before = projectFieldNoteCutawayFrame(liveTellPacket(), 3.1, false);
    const signal = projectFieldNoteCutawayFrame(liveTellPacket(), 3.35, false);
    const priority = projectFieldNoteCutawayFrame(liveTellPacket(), 3.6, false);
    const hidden = projectFieldNoteCutawayFrame(liveTellPacket(), 3.9, false);
    expect(before.publicTellAlpha).toBe(0);
    expect(signal.publicTellAlpha).toBeGreaterThan(0);
    expect(priority.priorityAlpha).toBeGreaterThan(0);
    expect(hidden.hiddenCommitmentAlpha).toBeGreaterThan(0);
    expect(hidden.habitAlpha).toBe(1);
  });

  it("keeps V1 free of a public-signal comparator", () => {
    const frame = projectFieldNoteCutawayFrame(packet(), fieldNoteCutawayDurationSeconds, false);
    expect(frame.publicTellAlpha).toBe(0);
    expect(frame.priorityAlpha).toBe(0);
    expect(frame.hiddenCommitmentAlpha).toBe(0);
  });

  it("does not derive choreography from habit, stance, or prose content", () => {
    const source = packet(2);
    const altered = {
      ...source,
      precedenceText: "Different canonical wording.",
      unlocks: source.unlocks.map((unlock, index) => ({
        ...unlock,
        preferredStance: index === 0 ? "rush" : "feint",
        habitLabel: `Different habit ${index}`,
      })),
    } as FieldNoteResolutionPacketV1;
    expect(projectFieldNoteCutawayFrame(altered, 2.7, false)).toEqual(
      projectFieldNoteCutawayFrame(source, 2.7, false),
    );
  });

  it("makes reduced motion and forced outcome the same complete motionless tableau", () => {
    const reduced = projectFieldNoteCutawayFrame(liveTellPacket(), 0, true);
    const forced = projectFieldNoteCutawayFrame(liveTellPacket(), 0, false, true);
    expect(reduced).toEqual(forced);
    expect(reduced).toMatchObject({
      phase: "static",
      activeUnlockIndex: 0,
      pageAlpha: 1,
      inkAlpha: 1,
      silhouetteAlpha: 1,
      thirdMarkAlpha: 1,
      habitAlpha: 1,
      publicTellAlpha: 1,
      priorityAlpha: 1,
      hiddenCommitmentAlpha: 1,
      precedenceAlpha: 1,
      finalAlpha: 1,
      cameraScale: 1,
      cameraOffsetX: 0,
      cameraOffsetY: 0,
    });
    expect(reduced.unlockAlphas).toEqual([1]);
  });

  it("keeps every value finite, bounded, and the normal camera movement subtle", () => {
    for (const elapsed of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -99, 0, 1, 3, 4.79, 99]) {
      const frame = projectFieldNoteCutawayFrame(packet(2), elapsed, false);
      const alphas = [
        ...frame.unlockAlphas,
        frame.pageAlpha,
        frame.inkAlpha,
        frame.silhouetteAlpha,
        frame.thirdMarkAlpha,
        frame.habitAlpha,
        frame.publicTellAlpha,
        frame.priorityAlpha,
        frame.hiddenCommitmentAlpha,
        frame.precedenceAlpha,
        frame.finalAlpha,
      ];
      expect(alphas.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
      expect(frame.cameraScale).toBeGreaterThanOrEqual(1);
      expect(frame.cameraScale).toBeLessThanOrEqual(1.025);
      expect(frame.cameraOffsetX).toBe(0);
      expect(Math.abs(frame.cameraOffsetY)).toBeLessThanOrEqual(1.5);
      expect([frame.cameraScale, frame.cameraOffsetX, frame.cameraOffsetY].every(Number.isFinite)).toBe(true);
    }
  });
});
