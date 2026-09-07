import { describe, expect, it, vi } from "vitest";
import type { CreativeStoryViewpoint } from "../narrator/creative-story";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { selectNarrativeContinuity } from "./narrative-continuity";
import { createNarrativeJournal, narrativeJournalKey, type NarrativeJournalEntry } from "./narrative-journal";

const job: StoryBeatJobV1 = {
  schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
  campaignId: "campaign:one", eventId: "event:current", tick: 10, sourceFingerprint: "fingerprint:current",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: "Greyford", headline: "The road remains open.",
    action: "Mara follows the road.", consequence: "The journey continues." },
  deterministicFallback: "Mara follows the road.", maximumInputTokens: 320, maximumOutputTokens: 48,
};
const viewpoint: CreativeStoryViewpoint = {
  hero: { name: "Mara", values: ["loyalty"] },
  companion: { name: "Rowan", role: "miller", status: "travelling", purpose: "shared-road-oath", victories: 1 },
};

function entry(tick: number, overrides: Partial<NarrativeJournalEntry> = {}): NarrativeJournalEntry {
  return { campaignId: job.campaignId, sourceEventId: `event:${tick}`, sourceTick: tick, readyAtMs: tick,
    text: `Mara let doubt share the silence at moment ${tick}.`, location: "Otherford", headline: "A quiet stretch of road.",
    origin: "model", presentedAtMs: null, ...overrides };
}

function duet(tick = 4, overrides: Partial<NarrativeJournalEntry> = {}): NarrativeJournalEntry {
  const voices = [
    { role: "hero" as const, name: "Mara", text: "I hope there is room for doubt beside courage." },
    { role: "companion" as const, name: "Rowan", text: "I wonder whether trust can remain this quiet." },
  ];
  return entry(tick, { text: voices.map((voice) => voice.text).join("\n\n"), voices, ...overrides });
}

const ids = (entries: readonly NarrativeJournalEntry[], capturedViewpoint: CreativeStoryViewpoint | null = viewpoint) =>
  selectNarrativeContinuity(entries, job, capturedViewpoint).map((memory) => memory.sourceEventId);

describe("bounded prior-story continuity selection", () => {
  it("returns an immutable empty context when there is no eligible earlier prose", () => {
    const result = selectNarrativeContinuity([], job, null);
    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("excludes foreign campaigns, the current event, equal ticks and future queued milestones", () => {
    expect(ids([entry(4), entry(8, { campaignId: "campaign:other" }),
      entry(7, { sourceEventId: job.eventId }), entry(10), entry(11, { presentedAtMs: null })])).toEqual(["event:4"]);
  });

  it("uses canonical tick rather than ready or presentation time, returning chronological excerpts", () => {
    expect(ids([entry(2, { readyAtMs: 9000, presentedAtMs: 9500 }), entry(9, { readyAtMs: 1 }),
      entry(8, { readyAtMs: 2000 })])).toEqual(["event:8", "event:9"]);
  });

  it("keeps the latest prior story plus an older actual companion mention ahead of unrelated prose", () => {
    expect(ids([entry(9), entry(8), entry(7, { location: "Greyford" }),
      entry(3, { text: "Rowan seemed as uncertain as Mara felt." })])).toEqual(["event:3", "event:9"]);
  });

  it("prefers the current location when there is no companion-relevant excerpt", () => {
    expect(ids([entry(9), entry(8), entry(2, { location: "Greyford" })], null)).toEqual(["event:2", "event:9"]);
  });

  it("does not mistake a name inside another word for a companion callback", () => {
    const ann: CreativeStoryViewpoint = { ...viewpoint, companion: { ...viewpoint.companion!, name: "Ann" } };
    expect(ids([entry(9), entry(8), entry(2, { text: "Anna wondered whether the banner could bear more rain." })], ann))
      .toEqual(["event:8", "event:9"]);
  });

  it("recognizes exact names with punctuation without interpreting them as regular expressions", () => {
    const named: CreativeStoryViewpoint = { ...viewpoint, companion: { ...viewpoint.companion!, name: "Ari (Ash)" } };
    expect(ids([entry(9), entry(8), entry(2, { text: "Mara wondered what Ari (Ash) might be hoping for." })], named))
      .toEqual(["event:2", "event:9"]);
  });

  it("is stable under input reorder and uses event IDs for same-tick ties", () => {
    const source = [entry(8, { sourceEventId: "event:z" }), entry(9), entry(8, { sourceEventId: "event:a" })];
    expect(ids(source)).toEqual(["event:a", "event:9"]);
    expect(ids([...source].reverse())).toEqual(ids(source));
  });

  it("does not return the same event twice even if a caller duplicates a journal entry", () => {
    expect(ids([entry(9), entry(9), entry(8)])).toEqual(["event:8", "event:9"]);
  });

  it("caps context at two complete excerpts of 240 characters each and 480 total", () => {
    const sentence = `${"a".repeat(239)}.`;
    const result = selectNarrativeContinuity([entry(9, { text: sentence }), entry(8, { text: sentence }), entry(7)], job, null);
    expect(result).toHaveLength(2);
    expect(result.map((memory) => memory.text.length)).toEqual([240, 240]);
    expect(result.reduce((sum, memory) => sum + memory.text.length, 0)).toBe(480);
  });

  it("omits an oversized whole sentence, retains a fitting complete sentence and drops an unfinished tail", () => {
    const long = `Mara ${"wondered ".repeat(30)}whether doubt could soften.`;
    const result = selectNarrativeContinuity([entry(8, { text: `${long} Rowan kept his hope quiet. An unfinished thought` })], job, null);
    expect(result[0]?.text).toBe("Rowan kept his hope quiet.");
  });

  it("does not turn unfinished text into a memory or cut an oversized Unicode sentence", () => {
    expect(ids([entry(9, { text: "Mara wondered whether" }), entry(8, { text: `${"🌿".repeat(130)} Mara waited.` })])).toEqual([]);
    const result = selectNarrativeContinuity([entry(7, { text: "Maïa regarded the 🌿 with quiet hope." })], job, null);
    expect(result[0]?.text).toBe("Maïa regarded the 🌿 with quiet hope.");
  });

  it.each(["model", "authored"] as const)("retains both named roles in a %s duet and can retrieve its current companion", (origin) => {
    const result = selectNarrativeContinuity([entry(9), entry(8), duet(3, { origin })], job, viewpoint);
    expect(result[0]).toMatchObject({ sourceEventId: "event:3",
      text: "Hero Mara: I hope there is room for doubt beside courage.\nCompanion Rowan: I wonder whether trust can remain this quiet." });
    expect(result[0]!.text.length).toBeLessThanOrEqual(240);
  });

  it("keeps role labels when the two recorded people share a visible name", () => {
    const source = duet();
    const voices = source.voices!.map((voice) => ({ ...voice, name: "Ash" }));
    const result = selectNarrativeContinuity([{ ...source, voices }], job, null);
    expect(result[0]!.text).toContain("Hero Ash:");
    expect(result[0]!.text).toContain("Companion Ash:");
  });

  it("omits mismatched, role-swapped or oversized voice pairs instead of returning anonymous first-person text", () => {
    const source = duet();
    const longThought = `I ${"wonder ".repeat(20)}whether courage can remain quiet.`;
    const longVoices = source.voices!.map((voice) => ({ ...voice, name: "Verylong Recorded Name", text: longThought }));
    expect(ids([{ ...source, text: "A different story." },
      { ...duet(5), voices: [...source.voices!].reverse() },
      { ...duet(6), voices: longVoices, text: longVoices.map((voice) => voice.text).join("\n\n") }])).toEqual([]);
  });

  it("reads restored journal entries without writing to storage or requiring prior presentation", () => {
    const stored = JSON.stringify({ schemaVersion: 1, entries: [entry(8), duet(3, { origin: "authored" })] });
    const storage = { getItem: vi.fn((key: string) => key === narrativeJournalKey ? stored : null), setItem: vi.fn() };
    const journal = createNarrativeJournal(() => storage);
    expect(journal.snapshot.persistent).toBe(true);
    expect(ids(journal.snapshot.entries)).toEqual(["event:3", "event:8"]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(journal.snapshot.entries.every((row) => row.presentedAtMs === null)).toBe(true);
  });

  it("captures frozen public fields without mutating or retaining journal and viewpoint objects", () => {
    const source = [duet(3), entry(9)];
    const before = structuredClone(source);
    const capturedViewpoint = structuredClone(viewpoint);
    const result = selectNarrativeContinuity(source, job, capturedViewpoint);
    expect(source).toEqual(before);
    expect(capturedViewpoint).toEqual(viewpoint);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
    expect(Object.keys(result[0]!)).toEqual(["campaignId", "sourceEventId", "sourceTick", "text"]);
    expect(result[0]).not.toBe(source[0]);
    source[0] = entry(1);
    expect(result[0]!.text).toContain("Hero Mara:");
  });

  it("rejects invalid ticks, unsafe controls and unpaired UTF-16 instead of forwarding them", () => {
    expect(ids([entry(NaN), entry(-1), entry(4.5), entry(8, { text: "Mara felt \u202Ehope." }),
      entry(7, { text: "Mara felt \uD800hope." }), entry(6, { sourceEventId: "bad\nidentity" })])).toEqual([]);
    expect(selectNarrativeContinuity([entry(1)], { ...job, tick: Infinity }, viewpoint)).toEqual([]);
  });
});
