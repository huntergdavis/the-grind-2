import { describe, expect, it } from "vitest";
import type { TrapResolutionPacket } from "../ui/trap-resolution";
import {
  cancelTrapCutaways,
  completeTrapCutaway,
  createTrapCutawayQueue,
  discardPendingTrapCutaway,
  offerTrapCutaway,
  projectTrapCutawayFrame,
  trapCutawayFlavor,
  trapCutawayOutcome,
} from "./trap-cutaway";

function packet(overrides: Partial<TrapResolutionPacket> = {}): TrapResolutionPacket {
  return Object.freeze({
    schemaVersion: 1,
    eventId: "campaign:1",
    tick: 1,
    commandId: "move:east",
    commandType: "move-dungeon",
    heroId: "hero:1",
    dungeonId: "dungeon:1",
    cellId: "dungeon:1:cell:1,1",
    trapKind: "tripwire",
    phaseBefore: "hidden",
    phaseAfter: "detected",
    stage: "detect",
    attribute: "intellect",
    skill: 12,
    roll: 2,
    total: 14,
    difficulty: 13,
    success: true,
    healthBefore: 40,
    damage: 0,
    healthAfter: 40,
    maxHealth: 40,
    dungeonCompletedBefore: false,
    dungeonCompletedAfter: false,
    completedExit: false,
    crossMazeBefore: 0,
    crossMazeAfter: 0,
    crossMazeDelta: 0,
    ...overrides,
  });
}

describe("trap cutaway presentation", () => {
  it("derives only the three truthful outcomes", () => {
    expect(trapCutawayOutcome(packet())).toBe("spotted");
    expect(trapCutawayOutcome(packet({ stage: "disarm", phaseBefore: "detected", phaseAfter: "disarmed" }))).toBe("disarmed");
    expect(trapCutawayOutcome(packet({ success: false, phaseAfter: "triggered", damage: 4, healthAfter: 36 }))).toBe("sprung");
  });

  it("uses only bounded mechanism/posture flavor and suppresses it at zero health", () => {
    expect(trapCutawayFlavor(packet())).toBe("boot-stop");
    expect(trapCutawayFlavor(packet({ stage: "disarm", phaseBefore: "detected", phaseAfter: "disarmed" }))).toBe("wire-curl");
    expect(trapCutawayFlavor(packet({ trapKind: "rune-ward", stage: "disarm", phaseBefore: "detected", phaseAfter: "disarmed" }))).toBe("rune-wobble");
    expect(trapCutawayFlavor(packet({ success: false, phaseAfter: "triggered", damage: 4, healthAfter: 36 }))).toBe("none");
    expect(trapCutawayFlavor(packet({ success: false, phaseAfter: "triggered", damage: 4, healthAfter: 0 }))).toBe("none");
  });

  it("projects the complete eight-second sequence and a stable final tableau", () => {
    const expected = [
      [0, "command"],
      [0.81, "inspection"],
      [2.41, "attempt"],
      [4.21, "reveal"],
      [5.21, "consequence"],
      [5.81, "final"],
      [8.01, "settled"],
    ] as const;
    for (const [seconds, phase] of expected) {
      expect(projectTrapCutawayFrame(packet(), seconds, false).phase).toBe(phase);
    }
    const final = projectTrapCutawayFrame(packet(), 6.5, false);
    expect(final).toMatchObject({ resultAlpha: 1, consequenceAlpha: 1, mechanismAlpha: 1, heroKneel: 0 });
    expect(projectTrapCutawayFrame(packet({ success: false, phaseAfter: "triggered", damage: 1, healthBefore: 1, healthAfter: 0 }), 6.5, false).heroKneel).toBe(1);
  });

  it("shows every fact immediately for reduced motion and forced outcome", () => {
    for (const frame of [
      projectTrapCutawayFrame(packet({ success: false, phaseAfter: "triggered", damage: 1, healthBefore: 1, healthAfter: 0 }), 0, true),
      projectTrapCutawayFrame(packet({ success: false, phaseAfter: "triggered", damage: 1, healthBefore: 1, healthAfter: 0 }), 0, false, true),
    ]) {
      expect(frame).toMatchObject({
        phase: "static",
        heroKneel: 1,
        mechanismAlpha: 1,
        checkAlpha: 1,
        resultAlpha: 1,
        consequenceAlpha: 1,
      });
    }
  });

  it("never emits non-finite transforms for hostile elapsed values", () => {
    for (const elapsed of [Number.NaN, Number.POSITIVE_INFINITY, -99]) {
      const frame = projectTrapCutawayFrame(packet(), elapsed, false);
      expect([frame.heroOffsetX, frame.heroOffsetY, frame.heroKneel, frame.armRotation, frame.emphasis].every(Number.isFinite)).toBe(true);
    }
  });

  it("bounds the queue to one active and one pending with ID dedupe and overflow drop", () => {
    const first = packet();
    const second = packet({ eventId: "campaign:2", tick: 2 });
    const third = packet({ eventId: "campaign:3", tick: 3 });
    const started = offerTrapCutaway(createTrapCutawayQueue(), first);
    expect(started.action).toBe("start");
    expect(offerTrapCutaway(started.queue, first).action).toBe("deduplicated");
    const queued = offerTrapCutaway(started.queue, second);
    expect(queued.action).toBe("queued");
    expect(offerTrapCutaway(queued.queue, second).action).toBe("deduplicated");
    expect(offerTrapCutaway(queued.queue, third)).toEqual({ queue: queued.queue, action: "dropped" });
    const drained = discardPendingTrapCutaway(queued.queue);
    expect(drained).toEqual({ active: first, pending: null });
    expect(drained).not.toBe(queued.queue);
    expect(discardPendingTrapCutaway(drained)).toBe(drained);
    expect(completeTrapCutaway(queued.queue)).toEqual({ active: second, pending: null });
    expect(completeTrapCutaway(completeTrapCutaway(queued.queue))).toEqual(createTrapCutawayQueue());
    expect(cancelTrapCutaways()).toEqual(createTrapCutawayQueue());
  });
});
