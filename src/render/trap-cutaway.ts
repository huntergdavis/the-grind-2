import type { TrapResolutionPacket } from "../ui/trap-resolution";

export type TrapCutawayOutcome = "spotted" | "disarmed" | "sprung";
export type TrapCutawayPhase = "command" | "inspection" | "attempt" | "reveal" | "consequence" | "final" | "settled" | "static";
export type TrapCutawayFlavor = "boot-stop" | "wire-curl" | "rune-wobble" | "none";

export interface TrapCutawayFrame {
  readonly phase: TrapCutawayPhase;
  readonly outcome: TrapCutawayOutcome;
  readonly flavor: TrapCutawayFlavor;
  readonly heroOffsetX: number;
  readonly heroOffsetY: number;
  readonly heroKneel: number;
  readonly armRotation: number;
  readonly mechanismAlpha: number;
  readonly checkAlpha: number;
  readonly resultAlpha: number;
  readonly consequenceAlpha: number;
  readonly emphasis: number;
}

export interface TrapCutawayQueue {
  readonly active: TrapResolutionPacket | null;
  readonly pending: TrapResolutionPacket | null;
}

export type TrapCutawayOffer = "start" | "queued" | "deduplicated" | "dropped";

export interface TrapCutawayQueueResult {
  readonly queue: TrapCutawayQueue;
  readonly action: TrapCutawayOffer;
}

export const trapCutawayDurationSeconds = 8;
export const trapCutawayStaticHoldSeconds = 1.2;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rangeProgress(value: number, start: number, end: number): number {
  return clampUnit((value - start) / (end - start));
}

export function trapCutawayOutcome(packet: TrapResolutionPacket): TrapCutawayOutcome {
  if (!packet.success) return "sprung";
  return packet.stage === "detect" ? "spotted" : "disarmed";
}

export function trapCutawayFlavor(packet: TrapResolutionPacket): TrapCutawayFlavor {
  if (!packet.success || packet.damage > 0 || packet.healthAfter === 0) return "none";
  const outcome = trapCutawayOutcome(packet);
  if (outcome === "spotted") return "boot-stop";
  return packet.trapKind === "tripwire" ? "wire-curl" : "rune-wobble";
}

export function projectTrapCutawayFrame(
  packet: TrapResolutionPacket,
  elapsedSeconds: number,
  reducedMotion: boolean,
  forceOutcome = false,
): TrapCutawayFrame {
  const outcome = trapCutawayOutcome(packet);
  const flavor = trapCutawayFlavor(packet);
  if (reducedMotion || forceOutcome) {
    return {
      phase: "static",
      outcome,
      flavor,
      heroOffsetX: 0,
      heroOffsetY: 0,
      heroKneel: packet.healthAfter === 0 ? 1 : 0,
      armRotation: packet.stage === "disarm" ? -0.22 : 0,
      mechanismAlpha: 1,
      checkAlpha: 1,
      resultAlpha: 1,
      consequenceAlpha: 1,
      emphasis: 1,
    };
  }

  const progress = clampUnit(elapsedSeconds / trapCutawayDurationSeconds);
  const phase: TrapCutawayPhase = progress < 0.1
    ? "command"
    : progress < 0.3
      ? "inspection"
      : progress < 0.525
        ? "attempt"
        : progress < 0.65
          ? "reveal"
          : progress < 0.725
            ? "consequence"
            : progress < 1
              ? "final"
              : "settled";
  const approach = phase === "inspection" ? rangeProgress(progress, 0.1, 0.3) : progress >= 0.3 ? 1 : 0;
  const attempt = phase === "attempt" ? Math.sin(rangeProgress(progress, 0.3, 0.525) * Math.PI) : 0;
  const reveal = phase === "reveal" ? Math.sin(rangeProgress(progress, 0.525, 0.65) * Math.PI) : 0;
  const reaction = outcome === "sprung" ? reveal : 0;
  const heroKneel = packet.healthAfter === 0 ? rangeProgress(progress, 0.525, 0.65) : 0;
  return {
    phase,
    outcome,
    flavor,
    heroOffsetX: approach * 11 - reaction * 5,
    heroOffsetY: outcome === "sprung" ? -reaction * 2.5 : 0,
    heroKneel,
    armRotation: packet.stage === "disarm" ? -attempt * 0.72 : 0,
    mechanismAlpha: progress < 0.1 ? 0.58 : 1,
    checkAlpha: progress >= 0.3 ? 1 : 0,
    resultAlpha: progress >= 0.525 ? 1 : 0,
    consequenceAlpha: progress >= 0.65 ? 1 : 0,
    emphasis: 1 + reveal * 0.22,
  };
}

export function createTrapCutawayQueue(): TrapCutawayQueue {
  return Object.freeze({ active: null, pending: null });
}

export function offerTrapCutaway(queue: TrapCutawayQueue, packet: TrapResolutionPacket): TrapCutawayQueueResult {
  if (queue.active?.eventId === packet.eventId || queue.pending?.eventId === packet.eventId) {
    return Object.freeze({ queue, action: "deduplicated" });
  }
  if (queue.active === null) {
    return Object.freeze({ queue: Object.freeze({ active: packet, pending: null }), action: "start" });
  }
  if (queue.pending === null) {
    return Object.freeze({ queue: Object.freeze({ active: queue.active, pending: packet }), action: "queued" });
  }
  return Object.freeze({ queue, action: "dropped" });
}

export function completeTrapCutaway(queue: TrapCutawayQueue): TrapCutawayQueue {
  return Object.freeze({ active: queue.pending, pending: null });
}

export function discardPendingTrapCutaway(queue: TrapCutawayQueue): TrapCutawayQueue {
  if (queue.pending === null) return queue;
  return Object.freeze({ active: queue.active, pending: null });
}

export function cancelTrapCutaways(): TrapCutawayQueue {
  return createTrapCutawayQueue();
}
