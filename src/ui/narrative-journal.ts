import type { HeldNarrative } from "./creative-story-director";

export const narrativeJournalKey = "the-grind-2:narrative-journal:v1";
export const narrativeJournalMaximumEntries = 200;
export const narrativeJournalMaximumBytes = 256 * 1_024;

export interface NarrativeJournalVoice {
  readonly role: "hero" | "companion";
  readonly name: string;
  readonly text: string;
}

export interface NarrativeJournalEntry {
  readonly sourceEventId: string;
  readonly campaignId: string;
  readonly sourceTick: number;
  readonly readyAtMs: number;
  readonly text: string;
  readonly location: string;
  readonly headline: string;
  readonly origin: "model" | "authored";
  readonly presentedAtMs: number | null;
  readonly voices?: readonly NarrativeJournalVoice[];
}

export interface NarrativeJournalSnapshot {
  readonly entries: readonly NarrativeJournalEntry[];
  readonly persistent: boolean;
}

type JournalStorage = Pick<Storage, "getItem" | "setItem">;
const encoder = new TextEncoder();
const entryKeys = ["sourceEventId", "campaignId", "sourceTick", "readyAtMs", "text",
  "location", "headline", "origin", "presentedAtMs"] as const;

function validText(value: unknown, maximum: number, multiline = false): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim().length > 0 && !/[<>]/u.test(value)
    && !(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u).test(value);
}

function validTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function captureVoices(value: unknown, text: string): readonly NarrativeJournalVoice[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const voices: NarrativeJournalVoice[] = [];
  for (const [index, value_] of value.entries()) {
    if (value_ === null || typeof value_ !== "object" || Array.isArray(value_)) return null;
    const voice = value_ as Record<string, unknown>;
    const role: NarrativeJournalVoice["role"] = index === 0 ? "hero" : "companion";
    if (Object.keys(voice).length !== 3 || voice.role !== role
      || !validText(voice.name, 128) || !validText(voice.text, 240)) return null;
    voices.push(Object.freeze({ role, name: voice.name, text: voice.text }));
  }
  return voices.map((voice) => voice.text).join("\n\n") === text ? Object.freeze(voices) : null;
}

function captureEntry(value: unknown): NarrativeJournalEntry | null {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    const entry = value as Record<string, unknown>;
    const hasVoices = Object.hasOwn(entry, "voices");
    if (Object.keys(entry).length !== entryKeys.length + (hasVoices ? 1 : 0)
      || entryKeys.some((key) => !Object.hasOwn(entry, key))) return null;
    if (!validText(entry.sourceEventId, 512) || !validText(entry.campaignId, 256)
      || !Number.isSafeInteger(entry.sourceTick) || (entry.sourceTick as number) < 0
      || !validTime(entry.readyAtMs) || !validText(entry.text, 4_000, true)
      || !validText(entry.location, 120) || !validText(entry.headline, 160)
      || (entry.origin !== "model" && entry.origin !== "authored")
      || (entry.presentedAtMs !== null && (!validTime(entry.presentedAtMs) || entry.presentedAtMs < entry.readyAtMs))) return null;
    const voices = hasVoices ? captureVoices(entry.voices, entry.text) : null;
    if (hasVoices && voices === null) return null;
    return Object.freeze({ sourceEventId: entry.sourceEventId, campaignId: entry.campaignId,
      sourceTick: entry.sourceTick as number, readyAtMs: entry.readyAtMs, text: entry.text,
      location: entry.location, headline: entry.headline, origin: entry.origin, presentedAtMs: entry.presentedAtMs as number | null,
      ...(voices === null ? {} : { voices }) });
  } catch {
    return null;
  }
}

function capturePassage(passage: HeldNarrative): NarrativeJournalEntry | null {
  try {
    let voices: readonly NarrativeJournalVoice[] | null = null;
    if (passage.duet !== undefined) {
      const duet = passage.duet;
      if (duet.kind !== "inner-voices") return null;
      voices = captureVoices([
        { role: "hero", name: duet.hero.name, text: duet.hero.text },
        { role: "companion", name: duet.companion.name, text: duet.companion.text },
      ], passage.text);
      if (voices === null) return null;
      const source = passage.firstVictory;
      if (source !== undefined && (source.campaignId !== passage.campaignId || source.eventId !== passage.sourceEventId
        || source.tick !== passage.sourceTick || source.heroName !== duet.hero.name || source.companionName !== duet.companion.name)) return null;
    }
    return captureEntry({ sourceEventId: passage.sourceEventId, campaignId: passage.campaignId,
      sourceTick: passage.sourceTick, readyAtMs: passage.readyAtMs, text: passage.text,
      location: passage.location, headline: passage.headline, origin: passage.origin, presentedAtMs: null,
      ...(voices === null ? {} : { voices }) });
  } catch {
    return null;
  }
}

function entryIdentity(entry: NarrativeJournalEntry): string {
  return JSON.stringify([entry.campaignId, entry.sourceEventId]);
}

function serialize(entries: readonly NarrativeJournalEntry[]): string {
  return JSON.stringify({ schemaVersion: 1, entries });
}

function readEntries(stored: string): readonly NarrativeJournalEntry[] | null {
  if (stored.length > narrativeJournalMaximumBytes || encoder.encode(stored).byteLength > narrativeJournalMaximumBytes) return null;
  const value: unknown = JSON.parse(stored);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).length !== 2 || envelope.schemaVersion !== 1
    || !Array.isArray(envelope.entries) || envelope.entries.length > narrativeJournalMaximumEntries) return null;
  const entries: NarrativeJournalEntry[] = [];
  const identities = new Set<string>();
  for (const value of envelope.entries) {
    const entry = captureEntry(value);
    if (entry === null || identities.has(entryIdentity(entry))) return null;
    identities.add(entryIdentity(entry));
    entries.push(entry);
  }
  return Object.freeze(entries.sort((left, right) => right.readyAtMs - left.readyAtMs));
}

/** Accepted prose archive only: never a canonical save, model-memory feed, or inference trigger. */
export function createNarrativeJournal(getStorage: () => JournalStorage = () => localStorage) {
  let entries: readonly NarrativeJournalEntry[] = Object.freeze([]);
  let persistent = false;
  let writable = true;
  try {
    const stored = getStorage().getItem(narrativeJournalKey);
    const restored = stored === null ? entries : readEntries(stored);
    if (restored === null) writable = false;
    else { entries = restored; persistent = true; }
  } catch {
    // Never overwrite an archive that this page could not read and validate.
    writable = false;
  }

  const save = (): void => {
    persistent = false;
    if (!writable) return;
    try {
      getStorage().setItem(narrativeJournalKey, serialize(entries));
      persistent = true;
    } catch {
      // Preserve accepted entries in this page when quota or storage policy prevents persistence.
    }
  };

  return {
    get snapshot(): NarrativeJournalSnapshot { return Object.freeze({ entries, persistent }); },
    /** True means the local archive changed; snapshot.persistent separately reports durability. */
    record(passage: HeldNarrative): boolean {
      const entry = capturePassage(passage);
      if (entry === null || entries.some((existing) => entryIdentity(existing) === entryIdentity(entry))) return false;
      const retained = [entry, ...entries].sort((left, right) => right.readyAtMs - left.readyAtMs)
        .slice(0, narrativeJournalMaximumEntries);
      while (encoder.encode(serialize(retained)).byteLength > narrativeJournalMaximumBytes) retained.pop();
      if (!retained.includes(entry)) return false;
      entries = Object.freeze(retained);
      save();
      return true;
    },
    /** Only an exact accepted passage can acquire its first actual presentation timestamp. */
    markPresented(passage: HeldNarrative, atMs = Date.now()): boolean {
      const entry = capturePassage(passage);
      if (entry === null || !validTime(atMs) || atMs < entry.readyAtMs) return false;
      const index = entries.findIndex((existing) => entryIdentity(existing) === entryIdentity(entry));
      const previous = entries[index];
      if (previous === undefined || previous.presentedAtMs !== null
        || entryKeys.some((key) => key !== "presentedAtMs" && previous[key] !== entry[key])
        || JSON.stringify(previous.voices) !== JSON.stringify(entry.voices)) return false;
      const presented = Object.freeze({ ...previous, presentedAtMs: atMs });
      const updated = [...entries];
      updated[index] = presented;
      // Timestamp growth can consume a few bytes at an exactly full byte budget.
      while (encoder.encode(serialize(updated)).byteLength > narrativeJournalMaximumBytes) updated.pop();
      entries = Object.freeze(updated);
      save();
      return true;
    },
  };
}
