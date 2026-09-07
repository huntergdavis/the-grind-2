import { describe, expect, it, vi } from "vitest";
import type { StoryDuet } from "../narrator/story-duet";
import type { StoryVoiceInspiration } from "../narrator/story-voice-inspiration";
import {
  createNarrativeIntermissionSchedule,
  narrativeIntermissionAttribution,
  narrativeIntermissionDirectionAttribution,
  narrativeIntermissionInspirationTone,
  narrativeIntermissionMomentPresentation,
  narrativeIntermissionRecordedMoments,
  narrativeIntermissionStoryOrigin,
  narrativeIntermissionTiming,
  narrativeIntermissionVoices,
  narrativeIntermissionVoiceInspiration,
  type NarrativeIntermissionClock,
} from "./narrative-intermission";

describe("recorded hero-value voice inspiration", () => {
  const duet = { kind: "inner-voices" as const,
    hero: { name: "Mira", text: "I want to understand what this relief asks of me." },
    companion: { name: "Neris", text: "I hope I can belong here without becoming someone braver than I am." } };
  const text = `${duet.hero.text}\n\n${duet.companion.text}`;

  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("names only a captured valid hero value: %s", (voiceValue) => {
    expect(narrativeIntermissionVoiceInspiration({ text, origin: "authored",
      duet: { ...duet, hero: { ...duet.hero, voiceValue } } }))
      .toBe(`Hero voice inspired by recorded ${voiceValue}.`);
  });

  it("requires authored provenance and an exactly matching displayed duet", () => {
    const captured = { ...duet, hero: { ...duet.hero, voiceValue: "curiosity" as const } };
    for (const origin of [undefined, "model"] as const) {
      expect(narrativeIntermissionVoiceInspiration({ text, ...(origin === undefined ? {} : { origin }), duet: captured })).toBeNull();
    }
    expect(narrativeIntermissionVoiceInspiration({ text: `${text} `, origin: "authored", duet: captured })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ text: "An unrelated later passage.", origin: "authored", duet: captured })).toBeNull();
  });

  it.each([undefined, null, "unknown", "Curiosity", {}, [], true])("omits missing or malformed hero values: %j", (voiceValue) => {
    const malformed = { ...duet, hero: { ...duet.hero, voiceValue } } as unknown as StoryDuet;
    expect(narrativeIntermissionVoiceInspiration({ text, origin: "authored", duet: malformed })).toBeNull();
  });

  it("never invents a companion value or carries the note into an ordinary passage", () => {
    const companionOnly = { ...duet, companion: { ...duet.companion, voiceValue: "loyalty" } };
    expect(narrativeIntermissionVoiceInspiration({ text, origin: "authored", duet: companionOnly })).toBeNull();
    narrativeIntermissionVoiceInspiration({ text, origin: "authored",
      duet: { ...duet, hero: { ...duet.hero, voiceValue: "mercy" } } });
    expect(narrativeIntermissionVoiceInspiration({ text: "A later scene.", origin: "authored" })).toBeNull();
  });
});

describe("recorded farewell hero-value inspiration", () => {
  const text = "Mira remembered the oath with Neris. Concern did not need an answer.";
  const remembrance = { heroName: "Mira",
    oath: { location: "Willow Ford", headline: "Mira and Neris pledged to share the road.", tick: 1 },
    farewell: { location: "North Bridge", headline: "Neris left alive but wounded.", tick: 19 } };
  const voiceInspiration = { kind: "hero-value" as const, heroName: "Mira", value: "loyalty" as const, text };

  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("credits %s without introducing duet labels", (value) => {
    const passage = { text, origin: "authored" as const, remembrance, voiceInspiration: { ...voiceInspiration, value } };
    expect(narrativeIntermissionVoiceInspiration(passage)).toBe(`Hero voice inspired by recorded ${value}.`);
    expect(narrativeIntermissionVoices(passage.text, undefined)).toBeNull();
    expect(narrativeIntermissionRecordedMoments({ ...passage, headline: remembrance.farewell.headline }).records)
      .toHaveLength(2);
  });

  it("requires authored origin, the complete exact text, and the captured farewell's hero name", () => {
    const passage = { text, origin: "authored" as const, remembrance, voiceInspiration };
    expect(narrativeIntermissionVoiceInspiration({ ...passage, origin: "model" })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ text, remembrance, voiceInspiration })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ ...passage, text: `${text} ` })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ ...passage, text: "A later unrelated passage." })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ text, origin: "authored", voiceInspiration })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ ...passage, remembrance: { oath: remembrance.oath, farewell: remembrance.farewell } })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ ...passage, remembrance: { ...remembrance, heroName: "Another hero" } })).toBeNull();
  });

  it.each([undefined, null, {}, { ...voiceInspiration, value: "hope" },
    { ...voiceInspiration, extra: "trait" }, { ...voiceInspiration, text: "Only a fragment." }])
  ("omits malformed or mismatched generic metadata: %j", (value) => {
    expect(narrativeIntermissionVoiceInspiration({ text, origin: "authored", remembrance,
      ...(value === undefined ? {} : { voiceInspiration: value as StoryVoiceInspiration }) })).toBeNull();
  });

  it("does not transfer a generic farewell value onto a duet without its own captured value", () => {
    const duet = { kind: "inner-voices" as const,
      hero: { name: "Mira", text: "I want to understand this relief." },
      companion: { name: "Neris", text: "I hope I can feel uncertain." } };
    const pairedText = `${duet.hero.text}\n\n${duet.companion.text}`;
    expect(narrativeIntermissionVoiceInspiration({ text: pairedText, origin: "authored", remembrance, duet,
      voiceInspiration: { ...voiceInspiration, text: pairedText } })).toBeNull();
    expect(narrativeIntermissionVoiceInspiration({ text: "A later scene.", origin: "authored" })).toBeNull();
  });
});

describe("narrative intermission imagined voices", () => {
  const duet = { kind: "inner-voices" as const,
    hero: { name: "Mira", text: "I want to trust the relief I feel." },
    companion: { name: "Neris", text: "I am proud, and a little afraid to show it." } };
  const text = `${duet.hero.text}\n\n${duet.companion.text}`;

  it("binds the exact thought pair to static, distinct public role labels", () => {
    expect(narrativeIntermissionVoices(text, duet)).toEqual([
      { role: "hero", label: "Hero", ...duet.hero },
      { role: "companion", label: "Companion", ...duet.companion },
    ]);
    expect(narrativeIntermissionAttribution("authored")).toBe("Authored interlude · imagined interpretation");
    expect(narrativeIntermissionAttribution("model")).toBe("Local storyteller · imagined interpretation");
  });

  it("keeps both roles distinct when their visible names happen to match", () => {
    const sharedName = { ...duet, hero: { ...duet.hero, name: "Rowan" }, companion: { ...duet.companion, name: "Rowan" } };
    expect(narrativeIntermissionVoices(text, sharedName)?.map(({ role, label, name }) => ({ role, label, name })))
      .toEqual([{ role: "hero", label: "Hero", name: "Rowan" }, { role: "companion", label: "Companion", name: "Rowan" }]);
  });

  it.each(["A different passage.", `${text} `, `${duet.companion.text}\n\n${duet.hero.text}`])(
    "ignores duet metadata that does not exactly match its passage: %s", (passage) => {
      expect(narrativeIntermissionVoices(passage, duet)).toBeNull();
    },
  );

  it.each([undefined, null, {}, [], { ...duet, kind: "dialogue" },
    { ...duet, hero: null }, { ...duet, companion: { name: "", text: duet.companion.text } },
    { ...duet, hero: { name: "Mira", text: 12 } }])("keeps malformed or absent metadata on the ordinary prose path: %j", (value) => {
    expect(narrativeIntermissionVoices(text, value)).toBeNull();
  });

  it("copies and freezes the role-bound display fields without retaining caller objects", () => {
    const input = { ...duet, hero: { ...duet.hero }, companion: { ...duet.companion } };
    const projected = narrativeIntermissionVoices(text, input)!;
    input.hero.name = "A different hero";
    input.companion.text = "A later thought.";
    expect(projected[0]?.name).toBe("Mira");
    expect(projected[1]?.text).toBe(duet.companion.text);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(projected.every(Object.isFrozen)).toBe(true);
    expect(narrativeIntermissionVoices("An ordinary later passage.", undefined)).toBeNull();
  });
});

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

  it.each([
    ["farewell-remembrance", "A farewell revisited"],
    ["first-shared-victory", "First victory together"],
  ])("credits Shared road priority without claiming a model subject choice: %s", (kind, title) => {
    expect(narrativeIntermissionMomentPresentation("Willow Ford", { choice: "milestone", origin: "focus", kind }))
      .toEqual({ caption: `${title} · Willow Ford`, attribution: "Shared road focus prioritized this companion moment." });
    expect(narrativeIntermissionAttribution("model")).toBe("Local storyteller · imagined interpretation");
    expect(narrativeIntermissionDirectionAttribution({ stage: "orrery", origin: "model" }))
      .toBe("Local DM staging · Impossible Orrery");
  });

  it("does not carry focused milestone credit into a later ordinary or invalid selection", () => {
    narrativeIntermissionMomentPresentation("Willow Ford", { choice: "milestone", origin: "focus", kind: "first-shared-victory" });
    expect(narrativeIntermissionMomentPresentation("The road", undefined))
      .toEqual({ caption: "An earlier moment · The road", attribution: null });
    expect(narrativeIntermissionMomentPresentation("The road", { choice: "current", origin: "focus" }))
      .toEqual({ caption: "An earlier moment · The road", attribution: null });
    expect(narrativeIntermissionMomentPresentation("The road", { choice: "milestone", origin: "focus", kind: "unknown" }))
      .toEqual({ caption: "An earlier moment · The road", attribution: null });
  });

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
