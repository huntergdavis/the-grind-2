import type { StoryBeatJobV1 } from "./story-beat";

/** Imagined presentation history; never a canonical event or an instruction. */
export interface CreativeStoryMemory {
  readonly campaignId: string;
  readonly sourceEventId: string;
  readonly sourceTick: number;
  readonly text: string;
}

export const creativeStoryMemoryMaximumEntries = 2;
export const creativeStoryMemoryMaximumCharacters = 240;
export const creativeStoryMemoryPrefix = "Earlier imagined passage (not game facts):\n";

/** Recheck source boundaries at the prompt edge, then detach from mutable callers. */
export function captureCreativeStoryMemory(job: StoryBeatJobV1, entries: readonly CreativeStoryMemory[]): readonly CreativeStoryMemory[] {
  const seen = new Set<string>();
  const captured: CreativeStoryMemory[] = [];
  for (const entry of entries) {
    if (entry.campaignId !== job.campaignId || entry.sourceEventId === job.eventId
      || typeof entry.sourceEventId !== "string" || entry.sourceEventId.length === 0
      || !Number.isSafeInteger(entry.sourceTick) || entry.sourceTick < 0 || entry.sourceTick >= job.tick
      || typeof entry.text !== "string" || entry.text.trim().length === 0
      || entry.text.length > creativeStoryMemoryMaximumCharacters
      || /[<>\p{Cf}\p{Cs}\p{Zl}\p{Zp}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(entry.text)
      || seen.has(entry.sourceEventId)) continue;
    seen.add(entry.sourceEventId);
    captured.push(Object.freeze({ campaignId: entry.campaignId, sourceEventId: entry.sourceEventId,
      sourceTick: entry.sourceTick, text: entry.text.trim() }));
  }
  captured.sort((a, b) => a.sourceTick - b.sourceTick
    || (a.sourceEventId < b.sourceEventId ? -1 : a.sourceEventId > b.sourceEventId ? 1 : 0));
  return Object.freeze(captured.slice(-creativeStoryMemoryMaximumEntries));
}
