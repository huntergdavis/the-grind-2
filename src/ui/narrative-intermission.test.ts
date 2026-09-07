import { describe, expect, it, vi } from "vitest";
import {
  createNarrativeIntermissionSchedule,
  narrativeIntermissionAttribution,
  narrativeIntermissionDirectionAttribution,
  narrativeIntermissionInspirationTone,
  narrativeIntermissionMomentPresentation,
  narrativeIntermissionRecordedMoments,
  narrativeIntermissionStoryOrigin,
  narrativeIntermissionTiming,
  type NarrativeIntermissionClock,
} from "./narrative-intermission";

describe("narrative intermission origin and attribution", () => {
  it("clearly labels authored text without claiming local-model authorship", () => {
    expect(narrativeIntermissionStoryOrigin("authored")).toBe("authored");
    expect(narrativeIntermissionAttribution("authored")).toBe("Authored interlude · imagined interpretation");
    expect(narrativeIntermissionAttribution("authored")).not.toMatch(/local|model|LLM/iu);
  });

  it.each(["model", undefined, null, "", "Authored", "authored model", {}, ["authored"]])(
    "preserves the existing model attribution for absent or unknown origins: %j", (origin) => {
      expect(narrativeIntermissionStoryOrigin(origin)).toBe("model");
      expect(narrativeIntermissionAttribution(origin)).toBe("Local storyteller · imagined interpretation");
    },
  );
});

describe("narrative intermission direction attribution", () => {
  it.each([
    ["parchment", "Crimson Chronicle"],
    ["orrery", "Impossible Orrery"],
    ["moth-court", "Moth Court"],
  ])("labels model staging separately from prose authorship: %s", (stage, label) => {
    expect(narrativeIntermissionDirectionAttribution({ stage, origin: "model" }))
      .toBe(`Local DM staging · ${label}`);
    expect(narrativeIntermissionAttribution("authored")).toBe("Authored interlude · imagined interpretation");
  });

  it.each([undefined, null, {}, { stage: "orrery", origin: "default" },
    { stage: "unknown", origin: "model" }, { stage: "moth-court", origin: "authored" },
    { stage: "parchment", origin: "default" }])("never credits a missing or invalid model choice: %j", (value) => {
    expect(narrativeIntermissionDirectionAttribution(value)).toBeNull();
  });
});

describe("narrative intermission selected moment", () => {
  const firstVictory = { kind: "first-shared-victory" as const,
    battle: { location: "Willow Ford", headline: "The raider falls.", tick: 24 } };

  it("names a verified first victory even without a separate model choice", () => {
    expect(narrativeIntermissionMomentPresentation("Willow Ford", undefined, firstVictory))
      .toEqual({ caption: "First victory together · Willow Ford", attribution: null });
    expect(narrativeIntermissionAttribution("model")).toBe("Local storyteller · imagined interpretation");
  });

  it("credits only an actual model-selected first-victory subject", () => {
    expect(narrativeIntermissionMomentPresentation("Willow Ford", {
      choice: "milestone", origin: "model", kind: "first-shared-victory",
    })).toEqual({ caption: "First victory together · Willow Ford", attribution: "Local DM chose this recorded first shared victory." });
    expect(narrativeIntermissionMomentPresentation("Willow Ford", {
      choice: "milestone", origin: "default", kind: "first-shared-victory",
    })).toEqual({ caption: "First victory together · Willow Ford", attribution: null });
  });

  it("never lets stray first-victory metadata override a different selected subject", () => {
    expect(narrativeIntermissionMomentPresentation("The road", { choice: "current", origin: "model" }, firstVictory))
      .toEqual({ caption: "An earlier moment · The road", attribution: "Local DM chose the current recorded moment." });
    expect(narrativeIntermissionMomentPresentation("Eldermere", {
      choice: "milestone", origin: "model", kind: "farewell-remembrance",
    }, firstVictory).caption).toBe("A farewell revisited · Eldermere");
  });

  it("names a verified model-selected farewell and explains its selection separately", () => {
    expect(narrativeIntermissionMomentPresentation("Eldermere", {
      choice: "milestone", origin: "model", kind: "farewell-remembrance",
    })).toEqual({ caption: "A farewell revisited · Eldermere", attribution: "Local DM chose this recorded farewell." });
  });

  it("truthfully names a default farewell without crediting model selection", () => {
    expect(narrativeIntermissionMomentPresentation("Eldermere", {
      choice: "milestone", origin: "default", kind: "farewell-remembrance",
    })).toEqual({ caption: "A farewell revisited · Eldermere", attribution: null });
  });

  it("keeps the ordinary caption for a model-selected current scene", () => {
    expect(narrativeIntermissionMomentPresentation("The old road", { choice: "current", origin: "model" }))
      .toEqual({ caption: "An earlier moment · The old road", attribution: "Local DM chose the current recorded moment." });
  });

  it.each([undefined, null, {}, { choice: "milestone", origin: "model" },
    { choice: "milestone", origin: "model", kind: "victory" }, { choice: "current", origin: "default" }])(
    "does not infer a farewell or model choice from incomplete metadata: %j", (value) => {
      expect(narrativeIntermissionMomentPresentation("Willow Ford", value))
        .toEqual({ caption: "An earlier moment · Willow Ford", attribution: null });
    },
  );

  it("omits an empty place and resets the following ordinary caption", () => {
    expect(narrativeIntermissionMomentPresentation(" ", { choice: "milestone", origin: "model", kind: "farewell-remembrance" }).caption)
      .toBe("A farewell revisited");
    expect(narrativeIntermissionMomentPresentation("", undefined)).toEqual({ caption: "An earlier moment", attribution: null });
  });
});

describe("narrative intermission recorded moments", () => {
  const firstVictory = { kind: "first-shared-victory" as const,
    battle: { location: "Willow Ford", headline: "The raider falls.", tick: 24 } };
  const remembrance = {
    oath: { location: "Willow Ford", headline: "Mara and Joss pledged to share the road.", tick: 12 },
    farewell: { location: "North Bridge", headline: "Joss left the company to recover.", tick: 37 },
  };

  it("shows the exact public battle record for an authored first victory", () => {
    expect(narrativeIntermissionRecordedMoments({ origin: "authored", headline: "Later scene", firstVictory }))
      .toEqual({ summary: "Recorded moment", records: [
        { label: "First shared victory · T24", location: "Willow Ford", headline: "The raider falls." },
      ] });
    expect(narrativeIntermissionAttribution("authored")).toBe("Authored interlude · imagined interpretation");
  });

  it("does not project an authored recovery's battle record onto later model prose", () => {
    expect(narrativeIntermissionRecordedMoments({ origin: "model", headline: "The road continues.", firstVictory }))
      .toEqual({ summary: "Recorded moment", records: [
        { label: null, location: null, headline: "The road continues." },
      ] });
    expect(narrativeIntermissionRecordedMoments({ headline: "", firstVictory }))
      .toEqual({ summary: "Recorded moment", records: [] });
  });

  it("freezes copied victory display fields and resets the next ordinary source", () => {
    const input = { ...firstVictory, battle: { ...firstVictory.battle } };
    const projected = narrativeIntermissionRecordedMoments({ origin: "authored", headline: "", firstVictory: input });
    input.battle.headline = "A later mutation";
    expect(projected.records[0]?.headline).toBe(firstVictory.battle.headline);
    expect(Object.isFrozen(projected.records)).toBe(true);
    expect(projected.records.every(Object.isFrozen)).toBe(true);
    expect(narrativeIntermissionRecordedMoments({ origin: "authored", headline: "The road continues." }).records)
      .toEqual([{ label: null, location: null, headline: "The road continues." }]);
  });

  it("pairs a clearly labeled farewell with its earlier oath only for authored remembrance", () => {
    expect(narrativeIntermissionRecordedMoments({ origin: "authored", headline: "Current scene", remembrance }))
      .toEqual({
        summary: "Recorded moments",
        records: [
          { label: "Farewell · T37", location: "North Bridge", headline: "Joss left the company to recover." },
          { label: "Earlier oath · T12", location: "Willow Ford", headline: "Mara and Joss pledged to share the road." },
        ],
      });
  });

  it("keeps an ordinary authored interlude's existing single recorded headline", () => {
    expect(narrativeIntermissionRecordedMoments({ origin: "authored", headline: "The bridge toll was paid." }))
      .toEqual({
        summary: "Recorded moment",
        records: [{ label: null, location: null, headline: "The bridge toll was paid." }],
      });
  });

  it("does not carry memory labels into an accepted model passage, even with stray remembrance metadata", () => {
    expect(narrativeIntermissionRecordedMoments({ origin: "model", headline: "The road continues.", remembrance }))
      .toEqual({
        summary: "Recorded moment",
        records: [{ label: null, location: null, headline: "The road continues." }],
      });
    expect(narrativeIntermissionRecordedMoments({ headline: "The road continues.", remembrance }).summary)
      .toBe("Recorded moment");
  });

  it("omits blank ordinary sources and leaves no remembered records in the next projection", () => {
    narrativeIntermissionRecordedMoments({ origin: "authored", headline: "", remembrance });
    expect(narrativeIntermissionRecordedMoments({ headline: " \n " }))
      .toEqual({ summary: "Recorded moment", records: [] });
  });

  it("copies only display fields and freezes the projection independently of its input", () => {
    const input = { oath: { ...remembrance.oath }, farewell: { ...remembrance.farewell } };
    const projected = narrativeIntermissionRecordedMoments({ origin: "authored", headline: "", remembrance: input });
    input.farewell.headline = "A later mutation";
    expect(projected.records[0]?.headline).toBe(remembrance.farewell.headline);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.records)).toBe(true);
    expect(projected.records.every(Object.isFrozen)).toBe(true);
  });
});

describe("narrative intermission inspiration tone", () => {
  it("accepts only the authored decorative tones", () => {
    expect(narrativeIntermissionInspirationTone("care")).toBe("care");
    expect(narrativeIntermissionInspirationTone("trust")).toBe("trust");
    expect(narrativeIntermissionInspirationTone("neutral")).toBe("neutral");
  });

  it.each([undefined, null, "", "Care", "care trust", "angry", 1, {}, ["trust"]])(
    "uses neutral for missing or unknown metadata: %j",
    (value) => { expect(narrativeIntermissionInspirationTone(value)).toBe("neutral"); },
  );
});

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

  it.each([false, true])("a held passage does not disable the next reading timer (reduced motion: %s)", (reducedMotion) => {
    const { callbacks, schedule, frames, timers } = setup();
    const timing = narrativeIntermissionTiming("A quiet road.");
    schedule.start(timing, reducedMotion);
    const staleFinish = [...timers.values()][0]!.callback;
    schedule.hold();
    schedule.hold();
    expect(timers.size).toBe(0);
    expect(frames.size).toBe(0);
    schedule.start(timing, reducedMotion);
    expect([...timers.values()][0]?.delayMs).toBe(12_000);
    expect(callbacks.onReveal).toHaveBeenLastCalledWith(reducedMotion ? 1 : 0);
    staleFinish();
    expect(callbacks.onFinish).not.toHaveBeenCalled();
    [...timers.values()][0]!.callback();
    expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
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
