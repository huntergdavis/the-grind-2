import { describe, expect, it, vi } from "vitest";
import type { HeldNarrative } from "./creative-story-director";
import { createNarrativeJournal, narrativeJournalKey, narrativeJournalMaximumBytes,
  narrativeJournalMaximumEntries, type NarrativeJournalEntry } from "./narrative-journal";

function passage(overrides: Partial<HeldNarrative> = {}): HeldNarrative {
  return { sourceEventId: "campaign:one:event:1", campaignId: "campaign:one", sourceTick: 1,
    readyAtMs: 100, text: "Mara wondered whether relief could leave room for doubt. The thought stayed quiet.",
    location: "Greyford", headline: "A sealed arch still waits.", origin: "model", inspirationTone: "neutral", ...overrides };
}

function storage(initial?: string) {
  const saved = new Map<string, string>(initial === undefined ? [] : [[narrativeJournalKey, initial]]);
  return { saved, getItem: vi.fn((key: string) => saved.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { saved.set(key, value); }) };
}

function entry(overrides: Partial<NarrativeJournalEntry> = {}): NarrativeJournalEntry {
  const { inspirationTone: _tone, ...source } = passage();
  return { ...source, presentedAtMs: null, ...overrides };
}

function duetPassage(overrides: Partial<HeldNarrative> = {}): HeldNarrative {
  const duet = { kind: "inner-voices" as const,
    hero: { name: "Mara", text: "I hope relief can leave a little room for doubt." },
    companion: { name: "Rowan", text: "I wonder whether courage can remain quiet." },
  };
  return passage({ origin: "authored", duet, text: `${duet.hero.text}\n\n${duet.companion.text}`,
    firstVictory: { kind: "first-shared-victory", campaignId: "campaign:one", eventId: "campaign:one:event:1", tick: 1,
      combatId: "combat:one", heroName: "Mara", companionName: "Rowan", companionId: "companion:one", condition: "healthy",
      battle: { location: "Greyford", headline: "A sealed arch still waits.", tick: 1 } }, ...overrides });
}

describe("browser-local accepted narrative journal", () => {
  it("records an accepted draft before presentation with exact flat source and authorship", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    expect(journal.snapshot).toEqual({ entries: [], persistent: true });
    expect(journal.record(passage())).toBe(true);
    expect(journal.snapshot.entries).toEqual([entry()]);
    expect(journal.snapshot.entries[0]!.presentedAtMs).toBeNull();
    expect(local.getItem).toHaveBeenCalledExactlyOnceWith(narrativeJournalKey);
    expect(local.setItem).toHaveBeenCalledTimes(1);
    const envelope = JSON.parse(local.saved.get(narrativeJournalKey)!);
    expect(Object.keys(envelope)).toEqual(["schemaVersion", "entries"]);
    expect(envelope.schemaVersion).toBe(1);
    expect(Object.keys(envelope.entries[0])).toEqual([
      "sourceEventId", "campaignId", "sourceTick", "readyAtMs", "text", "location", "headline", "origin", "presentedAtMs",
    ]);
  });

  it("keeps accepted prose immutable for the same campaign and event without repeated writes", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    const original = passage();
    expect(journal.record(original)).toBe(true);
    expect(journal.record(original)).toBe(false);
    expect(journal.record(passage({ text: "A replacement draft.", origin: "authored", readyAtMs: 200 }))).toBe(false);
    expect(journal.snapshot.entries[0]!.text).toBe(original.text);
    expect(local.setItem).toHaveBeenCalledTimes(1);
  });

  it("does not confuse matching event IDs in different campaigns", () => {
    const journal = createNarrativeJournal(() => storage());
    journal.record(passage());
    expect(journal.record(passage({ campaignId: "campaign:two", origin: "authored", readyAtMs: 200 }))).toBe(true);
    expect(journal.snapshot.entries.map((row) => [row.campaignId, row.origin])).toEqual([
      ["campaign:two", "authored"], ["campaign:one", "model"],
    ]);
  });

  it("survives a new journal instance without relying on model consent or the current campaign", () => {
    const local = storage();
    local.saved.set("the-grind-2:play-mode:v1", '{"schemaVersion":1,"mode":"deterministic"}');
    local.saved.set("campaign:current", "different hero save");
    const before = createNarrativeJournal(() => local);
    before.record(passage());
    before.record(passage({ campaignId: "older-campaign", readyAtMs: 50, origin: "authored" }));
    const restored = createNarrativeJournal(() => local);
    expect(restored.snapshot).toEqual(before.snapshot);
    expect(local.saved.get("campaign:current")).toBe("different hero save");
    expect(local.saved.get("the-grind-2:play-mode:v1")).toBe('{"schemaVersion":1,"mode":"deterministic"}');
    expect(local.saved.size).toBe(3);
  });

  it("marks only the exact archived passage once, preserving its first presentation time", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    const source = passage();
    expect(journal.markPresented(source, 110)).toBe(false);
    journal.record(source);
    const pendingSnapshot = journal.snapshot;
    expect(journal.markPresented(passage({ text: "Another text." }), 110)).toBe(false);
    expect(journal.markPresented(passage({ origin: "authored" }), 110)).toBe(false);
    expect(journal.markPresented(passage({ sourceTick: 2 }), 110)).toBe(false);
    expect(journal.markPresented(source, 99)).toBe(false);
    expect(journal.markPresented(source, Infinity)).toBe(false);
    expect(journal.markPresented(source, 110)).toBe(true);
    expect(journal.markPresented(source, 150)).toBe(false);
    expect(journal.snapshot.entries[0]!.presentedAtMs).toBe(110);
    expect(pendingSnapshot.entries[0]!.presentedAtMs).toBeNull();
    expect(local.setItem).toHaveBeenCalledTimes(2);
    expect(createNarrativeJournal(() => local).snapshot.entries[0]!.presentedAtMs).toBe(110);
  });

  it("freezes retained copies without mutating the input or old snapshots", () => {
    const source = passage();
    const original = structuredClone(source);
    const journal = createNarrativeJournal(() => storage());
    const empty = journal.snapshot;
    journal.record(source);
    const accepted = journal.snapshot;
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.entries)).toBe(true);
    expect(Object.isFrozen(accepted.entries[0])).toBe(true);
    expect(empty.entries).toEqual([]);
    expect(source).toEqual(original);
    expect(accepted.entries[0]).not.toBe(source);
  });

  it("evicts oldest ready drafts at the200-row limit, keeping newer cross-campaign history", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    for (let index = 0; index < narrativeJournalMaximumEntries + 3; index += 1) {
      journal.record(passage({ sourceEventId: `event:${index}`, readyAtMs: index }));
    }
    expect(journal.snapshot.entries).toHaveLength(200);
    expect(journal.snapshot.entries[0]!.sourceEventId).toBe("event:202");
    expect(journal.snapshot.entries.at(-1)!.sourceEventId).toBe("event:3");
    const writes = local.setItem.mock.calls.length;
    expect(journal.record(passage({ sourceEventId: "older-than-retained", readyAtMs: 0 }))).toBe(false);
    expect(local.setItem).toHaveBeenCalledTimes(writes);
  });

  it("enforces the UTF8 serialized byte ceiling as well as row count", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    for (let index = 0; index < 40; index += 1) {
      journal.record(passage({ sourceEventId: `wide:${index}`, readyAtMs: index, text: "é".repeat(4_000) }));
    }
    expect(journal.snapshot.entries.length).toBeLessThan(40);
    expect(journal.snapshot.entries.length).toBeGreaterThan(1);
    expect(journal.snapshot.entries[0]!.sourceEventId).toBe("wide:39");
    expect(new TextEncoder().encode(local.saved.get(narrativeJournalKey)!).byteLength).toBeLessThanOrEqual(narrativeJournalMaximumBytes);
    const oldest = journal.snapshot.entries.at(-1)!;
    journal.markPresented(passage({ ...oldest }), 1_000);
    expect(new TextEncoder().encode(local.saved.get(narrativeJournalKey)!).byteLength).toBeLessThanOrEqual(narrativeJournalMaximumBytes);
    expect(createNarrativeJournal(() => local).snapshot.entries).toEqual(journal.snapshot.entries);
  });

  it("preserves exact line breaks in paired thoughts and copies no optional staging/model metadata", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    journal.record(passage({ text: "I hope relief has room for doubt.\n\nI wonder whether courage can stay quiet.",
      origin: "authored", direction: { stage: "orrery", origin: "model" } }));
    const row = journal.snapshot.entries[0]!;
    expect(row.text).toContain("\n\n");
    expect(row.origin).toBe("authored");
    expect(row).not.toHaveProperty("direction");
    expect(row).not.toHaveProperty("inspirationTone");
    expect(row).not.toHaveProperty("voices");
  });

  it.each(["authored", "model"] as const)("retains exact named %s duet voices through persistence and presentation", (origin) => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    const source = duetPassage({ origin });
    expect(journal.record(source)).toBe(true);
    const accepted = journal.snapshot.entries[0]!;
    expect(accepted.voices).toEqual([
      { role: "hero", name: "Mara", text: source.duet!.hero.text },
      { role: "companion", name: "Rowan", text: source.duet!.companion.text },
    ]);
    expect(Object.isFrozen(accepted.voices)).toBe(true);
    expect(Object.isFrozen(accepted.voices![0])).toBe(true);
    expect(Object.isFrozen(accepted.voices![1])).toBe(true);
    expect(accepted.voices!.map((voice) => voice.text).join("\n\n")).toBe(source.text);
    expect(journal.markPresented(structuredClone(source), 150)).toBe(true);
    expect(createNarrativeJournal(() => local).snapshot.entries[0]).toEqual({ ...accepted, presentedAtMs: 150 });
    expect(accepted.presentedAtMs).toBeNull();
  });

  it("accepts a validated generated duet without a milestone packet and keeps equal names in distinct roles", () => {
    const { firstVictory: _firstVictory, ...source } = duetPassage({ origin: "model" });
    const journal = createNarrativeJournal(() => storage());
    expect(journal.record({ ...source, duet: { ...source.duet!, companion: { ...source.duet!.companion, name: "Mara" } } })).toBe(true);
    expect(journal.snapshot.entries[0]!.voices!.map((voice) => [voice.role, voice.name])).toEqual([
      ["hero", "Mara"], ["companion", "Mara"],
    ]);
  });

  it("never guesses voice attribution from ordinary first-person model prose", () => {
    const journal = createNarrativeJournal(() => storage());
    const { duet: _duet, firstVictory: _firstVictory, ...source } = duetPassage({ origin: "model" });
    expect(journal.record(source)).toBe(true);
    expect(journal.snapshot.entries[0]).not.toHaveProperty("voices");
  });

  it("rejects mismatched duet text, names or optional canonical source binding", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    const source = duetPassage();
    expect(journal.record({ ...source, text: "Different prose." })).toBe(false);
    expect(journal.record({ ...source, duet: { ...source.duet!, hero: { ...source.duet!.hero, name: "Someone else" } } })).toBe(false);
    expect(journal.record({ ...source, firstVictory: { ...source.firstVictory!, campaignId: "another" } })).toBe(false);
    expect(journal.record({ ...source, firstVictory: { ...source.firstVictory!, eventId: "another-event" } })).toBe(false);
    expect(journal.record({ ...source, firstVictory: { ...source.firstVictory!, tick: 2 } })).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("rejects corrupted stored voice roles, names, text, cardinality and extra fields", () => {
    const source = duetPassage();
    const voices = [
      { role: "hero", name: "Mara", text: source.duet!.hero.text },
      { role: "companion", name: "Rowan", text: source.duet!.companion.text },
    ];
    for (const invalid of [
      [...voices].reverse(), [voices[0]], [...voices, voices[0]],
      [{ ...voices[0], name: "" }, voices[1]],
      [{ ...voices[0], text: "Different thought." }, voices[1]],
      [{ ...voices[0], mood: "persistent joy" }, voices[1]],
    ]) {
      const local = storage(JSON.stringify({ schemaVersion: 1, entries: [entry({ text: source.text, voices: invalid as NonNullable<NarrativeJournalEntry["voices"]> })] }));
      expect(createNarrativeJournal(() => local).snapshot).toEqual({ entries: [], persistent: false });
    }
  });

  it("does not mark differently attributed prose as the archived duet", () => {
    const journal = createNarrativeJournal(() => storage());
    const { firstVictory: _firstVictory, ...source } = duetPassage();
    journal.record(source);
    const { duet: _duet, ...withoutDuet } = source;
    expect(journal.markPresented(withoutDuet, 150)).toBe(false);
    expect(journal.markPresented({ ...source, duet: { ...source.duet!, hero: { ...source.duet!.hero, name: "Different hero" } } }, 150)).toBe(false);
    expect(journal.markPresented(structuredClone(source), 150)).toBe(true);
  });

  it("keeps session entries and an honest status if reading storage is blocked", () => {
    const unavailable = () => { throw new Error("Unavailable"); };
    const journal = createNarrativeJournal(unavailable);
    expect(journal.snapshot).toEqual({ entries: [], persistent: false });
    expect(journal.record(passage())).toBe(true);
    expect(journal.markPresented(passage(), 110)).toBe(true);
    expect(journal.snapshot.entries).toHaveLength(1);
    expect(journal.snapshot.persistent).toBe(false);
  });

  it("retains session changes on quota failure while leaving the last durable archive intact", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    journal.record(passage());
    const durable = local.saved.get(narrativeJournalKey);
    local.setItem.mockImplementationOnce(() => { throw new Error("Quota"); });
    expect(journal.record(passage({ sourceEventId: "event:2", readyAtMs: 200 }))).toBe(true);
    expect(journal.snapshot.entries).toHaveLength(2);
    expect(journal.snapshot.persistent).toBe(false);
    expect(local.saved.get(narrativeJournalKey)).toBe(durable);
    expect(journal.record(passage({ sourceEventId: "event:3", readyAtMs: 300 }))).toBe(true);
    expect(journal.snapshot.persistent).toBe(true);
    expect(createNarrativeJournal(() => local).snapshot.entries).toHaveLength(3);
  });

  it.each([
    "bad JSON", "null", "[]", '{"schemaVersion":2,"entries":[]}',
    '{"schemaVersion":1,"entries":[],"campaign":"private"}',
    JSON.stringify({ schemaVersion: 1, entries: [entry({ sourceTick: -1 })] }),
    JSON.stringify({ schemaVersion: 1, entries: [entry(), entry()] }),
    JSON.stringify({ schemaVersion: 1, entries: [entry({ presentedAtMs: 99 })] }),
    JSON.stringify({ schemaVersion: 1, entries: [{ ...entry(), privateState: {} }] }),
    " ".repeat(narrativeJournalMaximumBytes + 1),
  ])("fails closed on an unreadable archive without overwriting it", (stored) => {
    const local = storage(stored);
    const journal = createNarrativeJournal(() => local);
    expect(journal.snapshot).toEqual({ entries: [], persistent: false });
    expect(journal.record(passage())).toBe(true);
    expect(journal.snapshot.entries).toHaveLength(1);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.saved.get(narrativeJournalKey)).toBe(stored);
  });

  it("rejects malformed fields without changing or persisting the archive", () => {
    const local = storage();
    const journal = createNarrativeJournal(() => local);
    const invalid = [
      { text: "" }, { text: "<script>bad</script>" }, { text: "bad\u0000text" }, { text: "x".repeat(4_001) },
      { campaignId: "" }, { sourceEventId: "bad\nidentity" }, { sourceTick: -1 }, { sourceTick: 1.5 },
      { readyAtMs: NaN }, { location: "x".repeat(121) }, { headline: "x".repeat(161) }, { origin: "unknown" },
    ];
    for (const fields of invalid) expect(journal.record(passage(fields as Partial<HeldNarrative>))).toBe(false);
    expect(journal.snapshot.entries).toEqual([]);
    expect(local.setItem).not.toHaveBeenCalled();
  });
});
