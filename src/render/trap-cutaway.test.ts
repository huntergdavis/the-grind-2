import { describe, expect, it } from "vitest";
import type { TrapResolutionPacket } from "../ui/trap-resolution";
import {
  cancelTrapCutaways,
  completeTrapCutaway,
  createTrapCutawayFatigueMemory,
  createTrapCutawayQueue,
  discardPendingTrapCutaway,
  offerTrapCutaway,
  projectTrapCutawayFrame,
  resolveTrapCutawayFlavor,
  selectTrapCutawayStaging,
  trapCutawayFatigueCooldown,
  trapCutawayFatigueHistoryLimit,
  trapCutawayFlavor,
  trapCutawayOutcome,
  trapCutawayShotLayout,
  type TrapCutawayFatigueMemory,
  type TrapCutawayShot,
  type TrapCutawayStagingBank,
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

  it("varies shots inside a declared two-presentation cooldown without mutating packets", () => {
    let memory = createTrapCutawayFatigueMemory();
    const shots: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const source = packet({ eventId: `campaign:${index}`, tick: index + 1 });
      const before = JSON.stringify(source);
      const selection = selectTrapCutawayStaging(memory, source);
      expect(JSON.stringify(source)).toBe(before);
      expect(Object.isFrozen(selection)).toBe(true);
      expect(Object.isFrozen(selection.staging)).toBe(true);
      expect(Object.isFrozen(selection.memory)).toBe(true);
      expect(Object.isFrozen(selection.memory.recentShots)).toBe(true);
      expect(shots.slice(-trapCutawayFatigueCooldown)).not.toContain(selection.staging.shot);
      shots.push(selection.staging.shot);
      memory = selection.memory;
    }
    expect(memory.recentShots).toHaveLength(trapCutawayFatigueHistoryLimit);
    expect(memory.recentFlavors).toHaveLength(trapCutawayFatigueHistoryLimit);
  });

  it("suppresses a repeated optional gag until its presentation cooldown expires", () => {
    let memory = createTrapCutawayFatigueMemory();
    const flavors = [];
    for (let index = 0; index < 4; index += 1) {
      const selection = selectTrapCutawayStaging(memory, packet({ eventId: `boot:${index}`, tick: index + 1 }));
      flavors.push(selection.staging.flavor);
      memory = selection.memory;
    }
    expect(flavors).toEqual(["boot-stop", "none", "none", "boot-stop"]);
  });

  it("fails closed for severe and mismatched flavor overrides while changing eligible flourish frames", () => {
    const eligible = packet();
    const severe = packet({ success: false, phaseAfter: "triggered", damage: 40, healthAfter: 0 });
    expect(resolveTrapCutawayFlavor(severe, "rune-wobble")).toBe("none");
    expect(resolveTrapCutawayFlavor(eligible, "wire-curl")).toBe("none");
    expect(projectTrapCutawayFrame(severe, 6, false, false, "boot-stop")).toMatchObject({ flavor: "none", flavorAlpha: 0 });
    expect(projectTrapCutawayFrame(eligible, 6, false, false, "wire-curl")).toMatchObject({ flavor: "none", flavorAlpha: 0 });
    expect(projectTrapCutawayFrame(eligible, 6, false, false, "boot-stop")).toMatchObject({ flavor: "boot-stop", flavorAlpha: 1 });
    expect(projectTrapCutawayFrame(eligible, 6, false, false, "none")).toMatchObject({ flavor: "none", flavorAlpha: 0 });
  });

  it("records no motion-only flavor when fast or reduced-motion presentation forbids it", () => {
    const selection = selectTrapCutawayStaging(createTrapCutawayFatigueMemory(), packet(), { allowMotionFlavor: false });
    expect(selection.staging.flavor).toBe("none");
    expect(selection.memory.recentFlavors).toEqual(["none"]);
  });

  it("always removes optional flavor from severe outcomes", () => {
    const memory: TrapCutawayFatigueMemory = Object.freeze({
      recentShots: Object.freeze([]),
      recentFlavors: Object.freeze([]),
    });
    for (const source of [
      packet({ success: false, phaseAfter: "triggered", damage: 4, healthAfter: 36 }),
      packet({ success: false, phaseAfter: "triggered", damage: 40, healthAfter: 0 }),
    ]) {
      expect(selectTrapCutawayStaging(memory, source).staging.flavor).toBe("none");
    }
  });

  it("falls back to a factual static tableau when staging banks are empty or exhausted", () => {
    const emptyBank: TrapCutawayStagingBank = Object.freeze({ shots: Object.freeze([]), flavors: Object.freeze([]) });
    expect(selectTrapCutawayStaging(createTrapCutawayFatigueMemory(), packet(), { bank: emptyBank }).staging).toEqual({
      shot: "static-tableau",
      flavor: "none",
    });

    const exhaustedBank: TrapCutawayStagingBank = Object.freeze({
      shots: Object.freeze(["wide-profile", "hero-closeup"] as const),
      flavors: Object.freeze(["boot-stop"] as const),
    });
    const memory: TrapCutawayFatigueMemory = Object.freeze({
      recentShots: Object.freeze(["wide-profile", "hero-closeup"] as const),
      recentFlavors: Object.freeze(["boot-stop"] as const),
    });
    expect(selectTrapCutawayStaging(memory, packet(), { bank: exhaustedBank }).staging).toEqual({
      shot: "static-tableau",
      flavor: "none",
    });
  });

  it("keeps every shot's hero, mechanism, and immutable fact panels inside the design safe regions", () => {
    const shots: readonly TrapCutawayShot[] = ["wide-profile", "hero-closeup", "mechanism-closeup", "static-tableau"];
    for (const shot of shots) {
      const layout = trapCutawayShotLayout(shot);
      const heroBounds = {
        left: layout.heroX - 18 * layout.heroScale,
        right: layout.heroX + 18 * layout.heroScale,
        top: layout.heroY - 35 * layout.heroScale,
        bottom: layout.heroY + 18 * layout.heroScale,
      };
      const mechanismBounds = {
        left: layout.mechanismX - 40 * layout.mechanismScale,
        right: layout.mechanismX + 40 * layout.mechanismScale,
        top: layout.mechanismY - 28 * layout.mechanismScale,
        bottom: layout.mechanismY + 18 * layout.mechanismScale,
      };
      expect(heroBounds.left).toBeGreaterThanOrEqual(0);
      expect(heroBounds.right).toBeLessThan(108);
      expect(heroBounds.top).toBeGreaterThanOrEqual(0);
      expect(heroBounds.bottom).toBeLessThanOrEqual(180);
      expect(mechanismBounds.left).toBeGreaterThanOrEqual(108);
      expect(mechanismBounds.right).toBeLessThanOrEqual(320);
      expect(mechanismBounds.top).toBeGreaterThanOrEqual(0);
      expect(mechanismBounds.bottom).toBeLessThanOrEqual(180);
      for (const [x, y, width, height] of [[108, 58, 184, 25], [108, 86, 184, 25], [108, 114, 184, 39]] as const) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(320);
        expect(y + height).toBeLessThanOrEqual(180);
      }
    }
  });

  it("restores first-presentation staging from a fresh campaign or reload memory", () => {
    const source = packet({ eventId: "campaign-reset:42", tick: 42 });
    const first = selectTrapCutawayStaging(createTrapCutawayFatigueMemory(), source);
    const fatigued = selectTrapCutawayStaging(first.memory, source);
    const reset = selectTrapCutawayStaging(createTrapCutawayFatigueMemory(), source);
    expect(fatigued.staging).not.toEqual(first.staging);
    expect(reset.staging).toEqual(first.staging);
    expect(JSON.stringify(reset.memory)).not.toContain("campaign-reset:42");
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
