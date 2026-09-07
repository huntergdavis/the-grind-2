import type { CreativeStoryMemory } from "../narrator/creative-continuity";
import type { CreativeStoryViewpoint } from "../narrator/creative-story";
import { completedCreativeStorySentences } from "../narrator/creative-story-sentences";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import type { NarrativeJournalEntry } from "./narrative-journal";

const maximumExcerptCharacters = 240;
const unsafeText = /[<>\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const emptyMemories: readonly CreativeStoryMemory[] = Object.freeze([]);

function safeText(value: unknown, maximum: number, multiline = false): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return null;
  const normalized = multiline ? value.replace(/[\r\n\t]+/gu, " ").trim() : value;
  return normalized.length > 0 && normalized === normalized.trim() && !unsafeText.test(normalized) ? normalized : null;
}

function completeExcerpt(text: string, maximum: number): string | null {
  const accepted: string[] = [];
  let length = 0;
  for (const sentence of completedCreativeStorySentences(text)) {
    const addedLength = sentence.length + (accepted.length === 0 ? 0 : 1);
    // Never cut a name, code point, or an unfinished thought to fill a budget.
    if (length + addedLength > maximum) continue;
    accepted.push(sentence);
    length += addedLength;
  }
  return accepted.length === 0 ? null : accepted.join(" ");
}

function entryExcerpt(entry: NarrativeJournalEntry): string | null {
  const text = safeText(entry.text, 4_000, true);
  if (text === null) return null;
  if (entry.voices === undefined) return completeExcerpt(text, maximumExcerptCharacters);
  if (!Array.isArray(entry.voices) || entry.voices.length !== 2
    || entry.voices.map((voice) => voice.text).join("\n\n") !== entry.text) return null;
  const lines: string[] = [];
  for (const [index, voice] of entry.voices.entries()) {
    if (voice.role !== (index === 0 ? "hero" : "companion")) return null;
    const name = safeText(voice.name, 128);
    const thought = safeText(voice.text, 240);
    if (name === null || thought === null) return null;
    const excerpt = completeExcerpt(thought, maximumExcerptCharacters);
    if (excerpt === null) return null;
    lines.push(`${index === 0 ? "Hero" : "Companion"} ${name}: ${excerpt}`);
  }
  const labeled = lines.join("\n");
  // The pair is either preserved with both speakers, or omitted as a whole.
  return labeled.length <= maximumExcerptCharacters ? labeled : null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}])`, "u").test(text);
}

/** Earlier accepted fiction, not canonical memory or evidence of permanent feelings. */
export function selectNarrativeContinuity(
  entries: readonly NarrativeJournalEntry[],
  job: StoryBeatJobV1,
  viewpoint: CreativeStoryViewpoint | null,
): readonly CreativeStoryMemory[] {
  if (!Number.isSafeInteger(job.tick) || job.tick < 0
    || safeText(job.campaignId, 256) === null || safeText(job.eventId, 512) === null) return emptyMemories;
  const companionName = safeText(viewpoint?.companion?.name, 128);
  const location = safeText(job.facts.location, 120);
  const candidates: { readonly memory: CreativeStoryMemory; readonly relevance: number }[] = [];
  for (const entry of entries) {
    if (entry.campaignId !== job.campaignId || entry.sourceEventId === job.eventId
      || safeText(entry.sourceEventId, 512) === null
      || !Number.isSafeInteger(entry.sourceTick) || entry.sourceTick < 0 || entry.sourceTick >= job.tick
      || (entry.origin !== "model" && entry.origin !== "authored")) continue;
    const text = entryExcerpt(entry);
    if (text === null) continue;
    const memory = Object.freeze({ campaignId: entry.campaignId, sourceEventId: entry.sourceEventId,
      sourceTick: entry.sourceTick, text });
    candidates.push({ memory, relevance: (companionName !== null && mentionsName(text, companionName) ? 2 : 0)
      + (location !== null && entry.location === location ? 1 : 0) });
  }
  // IDs break same-tick ties deterministically; generation/presentation clocks do not order history.
  candidates.sort((left, right) => right.memory.sourceTick - left.memory.sourceTick
    || compareText(left.memory.sourceEventId, right.memory.sourceEventId)
    || compareText(left.memory.text, right.memory.text));
  const latest = candidates[0];
  if (latest === undefined) return emptyMemories;
  const seen = new Set([latest.memory.sourceEventId]);
  let earlier: typeof latest | undefined;
  for (const candidate of candidates.slice(1)) {
    if (seen.has(candidate.memory.sourceEventId)) continue;
    seen.add(candidate.memory.sourceEventId);
    if (earlier === undefined || candidate.relevance > earlier.relevance) earlier = candidate;
  }
  const selected = earlier === undefined ? [latest.memory] : [latest.memory, earlier.memory];
  selected.sort((left, right) => left.sourceTick - right.sourceTick || compareText(left.sourceEventId, right.sourceEventId));
  return Object.freeze(selected);
}
