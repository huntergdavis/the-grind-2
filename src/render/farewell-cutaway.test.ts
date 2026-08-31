import { describe, expect, it } from "vitest";
import type { CompanionFarewellPacket } from "../ui/companion-farewell";
import {
  farewellCutawayDurationSeconds,
  projectFarewellCutawayFrame,
} from "./farewell-cutaway";

function packet(overrides: Partial<CompanionFarewellPacket> = {}): CompanionFarewellPacket {
  return Object.freeze({
    schemaVersion: 1,
    eventId: "campaign:12",
    tick: 12,
    commandId: "campaign:depth:12:companion:farewell:resident:1",
    commandType: "farewell-companion",
    heroId: "hero:1",
    companionId: "resident:1",
    companionName: "Hale Vale",
    profession: "baker",
    disposition: "warm",
    originTownId: "town:1",
    originLocationId: "location:1",
    originName: "Amberwick",
    destinationId: "location:2",
    destinationName: "Mossmarket",
    purpose: "shared-road-oath",
    joinedTick: 2,
    departureTick: 12,
    outcome: "fulfilled",
    injury: "none",
    health: 22,
    maxHealth: 22,
    victories: 0,
    bond: 36,
    ...overrides,
  });
}

describe("companion farewell cutaway", () => {
  it("projects the complete promise-to-legacy sequence", () => {
    const expected = [
      [0, "promise"],
      [1, "journey"],
      [2.8, "arrival"],
      [4.2, "farewell"],
      [5.8, "legacy"],
      [farewellCutawayDurationSeconds + 0.01, "settled"],
    ] as const;
    for (const [seconds, phase] of expected) {
      expect(projectFarewellCutawayFrame(packet(), seconds, false).phase).toBe(phase);
    }
  });

  it("keeps a healthy profession-bearing companion visibly departing", () => {
    const final = projectFarewellCutawayFrame(packet(), 7.5, false);
    expect(final).toMatchObject({
      outcome: "fulfilled",
      companionKneel: 0,
      journeyAlpha: 1,
      arrivalAlpha: 1,
      farewellAlpha: 1,
      legacyAlpha: 1,
    });
    expect(final.companionOffsetX).toBeGreaterThan(30);
    expect(final.companionAlpha).toBeGreaterThanOrEqual(0.72);
  });

  it("shows an injured departure without making the companion walk normally", () => {
    const injured = packet({ outcome: "injured", injury: "fallen", health: 0 });
    const final = projectFarewellCutawayFrame(injured, 7.5, false);
    expect(final.companionKneel).toBe(1);
    expect(final.companionOffsetX).toBeLessThan(20);
    expect(final.companionOffsetY).toBe(3);
    expect(final.companionAlpha).toBeGreaterThan(0.85);
  });

  it("shows every fact immediately for reduced motion and forced outcome", () => {
    for (const frame of [
      projectFarewellCutawayFrame(packet(), 0, true),
      projectFarewellCutawayFrame(packet({ outcome: "injured", injury: "wounded" }), 0, false, true),
    ]) {
      expect(frame).toMatchObject({
        phase: "static",
        journeyAlpha: 1,
        arrivalAlpha: 1,
        farewellAlpha: 1,
        legacyAlpha: 1,
      });
    }
  });

  it("never emits non-finite transforms for hostile elapsed values", () => {
    for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, -99]) {
      const frame = projectFarewellCutawayFrame(packet(), elapsed, false);
      expect([
        frame.heroOffsetX,
        frame.companionOffsetX,
        frame.companionOffsetY,
        frame.companionKneel,
        frame.companionAlpha,
      ].every(Number.isFinite)).toBe(true);
    }
  });
});
