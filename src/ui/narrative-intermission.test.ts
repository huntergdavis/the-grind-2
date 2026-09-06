import { describe, expect, it, vi } from "vitest";
import {
  createNarrativeIntermissionSchedule,
  narrativeIntermissionTiming,
  type NarrativeIntermissionClock,
} from "./narrative-intermission";

function setup() {
  let now = 0;
  let ordinal = 0;
  const frames = new Map<number, (time: number) => void>();
  const timers = new Map<number, { callback: () => void; delayMs: number }>();
  const clock: NarrativeIntermissionClock = {
    now: () => now,
    requestFrame: (callback) => { const id = ++ordinal; frames.set(id, callback); return id; },
    cancelFrame: (id) => { frames.delete(id); },
    setTimeout: (callback, delayMs) => { const id = ++ordinal; timers.set(id, { callback, delayMs }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  };
  const callbacks = { onReveal: vi.fn(), onFinish: vi.fn() };
  const schedule = createNarrativeIntermissionSchedule(clock, callbacks);
  const advanceFrame = (time: number): void => {
    now = time;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  };
  return { callbacks, schedule, frames, timers, advanceFrame };
}

describe("narrative intermission timing", () => {
  it("allows a short ink reveal and bounds reading time independently of passage size", () => {
    expect(narrativeIntermissionTiming("A quiet road.")).toEqual({ wordCount: 3, revealMs: 2_000, displayMs: 12_000 });
    expect(narrativeIntermissionTiming("word ".repeat(45))).toEqual({ wordCount: 45, revealMs: 2_925, displayMs: 19_000 });
    expect(narrativeIntermissionTiming("word ".repeat(1_000))).toEqual({ wordCount: 1_000, revealMs: 4_000, displayMs: 30_000 });
    expect(narrativeIntermissionTiming("  \n ").wordCount).toBe(0);
    expect(Object.isFrozen(narrativeIntermissionTiming("A quiet road."))).toBe(true);
  });

  it("reveals progressively, then finishes once and clears remaining timers", () => {
    const { callbacks, schedule, frames, timers, advanceFrame } = setup();
    const timing = narrativeIntermissionTiming("A quiet road.");
    schedule.start(timing, false);
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(0);
    expect(frames.size).toBe(1);
    expect([...timers.values()][0]?.delayMs).toBe(12_000);
    advanceFrame(1_000);
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(0.5);
    advanceFrame(2_000);
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(1);
    expect(frames.size).toBe(0);
    const finish = [...timers.values()][0]!.callback;
    finish();
    finish();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });

  it("shows reduced-motion prose immediately while retaining the ordinary reading interval", () => {
    const { callbacks, schedule, frames, timers } = setup();
    schedule.start(narrativeIntermissionTiming("A quiet road."), true);
    expect(callbacks.onReveal.mock.calls).toEqual([[1]]);
    expect(frames.size).toBe(0);
    expect([...timers.values()][0]?.delayMs).toBe(12_000);
    [...timers.values()][0]!.callback();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
  });

  it("Hold reveals the remaining prose and removes every automatic close or reveal callback", () => {
    const { callbacks, schedule, frames, timers } = setup();
    schedule.start(narrativeIntermissionTiming("A quiet road."), false);
    const staleFrame = [...frames.values()][0]!;
    const staleFinish = [...timers.values()][0]!.callback;
    schedule.hold();
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(1);
    expect(frames.size).toBe(0);
    expect(timers.size).toBe(0);
    const reveals = callbacks.onReveal.mock.calls.length;
    staleFrame(100_000);
    staleFinish();
    expect(callbacks.onReveal).toHaveBeenCalledTimes(reveals);
    expect(callbacks.onFinish).not.toHaveBeenCalled();
  });

  it("cancellation clears both clocks without finishing or changing visible prose", () => {
    const { callbacks, schedule, frames, timers } = setup();
    schedule.start(narrativeIntermissionTiming("A quiet road."), false);
    const staleFrame = [...frames.values()][0]!;
    const staleFinish = [...timers.values()][0]!.callback;
    callbacks.onReveal.mockClear();
    schedule.cancel();
    schedule.cancel();
    staleFrame(50_000);
    staleFinish();
    expect(frames.size).toBe(0);
    expect(timers.size).toBe(0);
    expect(callbacks.onReveal).not.toHaveBeenCalled();
    expect(callbacks.onFinish).not.toHaveBeenCalled();
  });

  it("restarting invalidates a prior passage's already queued frames and timeout", () => {
    const { callbacks, schedule, frames, timers, advanceFrame } = setup();
    schedule.start(narrativeIntermissionTiming("The earlier road."), false);
    const staleFrame = [...frames.values()][0]!;
    const staleFinish = [...timers.values()][0]!.callback;
    advanceFrame(1_000);
    schedule.start(narrativeIntermissionTiming("The later road."), false);
    const reveals = callbacks.onReveal.mock.calls.length;
    staleFrame(50_000);
    staleFinish();
    expect(callbacks.onReveal).toHaveBeenCalledTimes(reveals);
    expect(callbacks.onFinish).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    expect(timers.size).toBe(1);
    advanceFrame(2_000);
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(0.5);
  });
});
