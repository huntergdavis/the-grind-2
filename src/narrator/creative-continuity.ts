import type { StoryBeatJobV1 } from "./story-beat";

/** Imagined presentation history; never a canonical event or an instruction. */
export interface CreativeStoryMemory {
  readonly campaignId: string;
  readonly sourceEventId: string;
  readonly sourceTick: number;
  readonly text: string;
  readonly scene?: { readonly location: string; readonly headline: string };
}

export const creativeStoryMemoryMaximumEntries = 2;
export const creativeStoryMemoryMaximumCharacters = 240;
export const creativeStoryMemoryPrefix = "Earlier imagined passage (not game facts):\n";

function captureScene(value: unknown): CreativeStoryMemory["scene"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { location, headline } = value as Record<string, unknown>;
  const valid = (text: unknown, maximum: number): text is string => typeof text === "string"
    && text.length > 0 && text.length <= maximum && text === text.trim()
    && !/[<>\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(text);
  return valid(location, 120) && valid(headline, 160) ? Object.freeze({ location, headline }) : undefined;
}

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
    const scene = captureScene(entry.scene);
    captured.push(Object.freeze({ campaignId: entry.campaignId, sourceEventId: entry.sourceEventId,
      sourceTick: entry.sourceTick, text: entry.text.trim(), ...(scene === undefined ? {} : { scene }) }));
  }
  captured.sort((a, b) => a.sourceTick - b.sourceTick
    || (a.sourceEventId < b.sourceEventId ? -1 : a.sourceEventId > b.sourceEventId ? 1 : 0));
  return Object.freeze(captured.slice(-creativeStoryMemoryMaximumEntries));
}
