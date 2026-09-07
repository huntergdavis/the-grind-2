import { cleanCreativeStoryOutput } from "./creative-story";
import type { CreativeWriterMessage } from "./creative-writer-client";
import type { FirstSharedVictory } from "./first-shared-victory";
import type { StoryBeatJobV1 } from "./story-beat";

export interface StoryDuet {
  readonly kind: "inner-voices";
  readonly hero: Readonly<{ name: string; text: string }>;
  readonly companion: Readonly<{ name: string; text: string }>;
}

export function captureStoryDuet(duet: StoryDuet): StoryDuet {
  return Object.freeze({
    kind: "inner-voices",
    hero: Object.freeze({ name: duet.hero.name, text: duet.hero.text }),
    companion: Object.freeze({ name: duet.companion.name, text: duet.companion.text }),
  });
}

export function storyDuetText(duet: StoryDuet): string {
  return `${duet.hero.text}\n\n${duet.companion.text}`;
}

const encoder = new TextEncoder();
const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

// Reuse the bounded public-snippet approach from creative-moment; never read private packet history or identifiers.
function snippet(value: string, maximum: number): string {
  const text = value.replace(/[\r\n\t]+/gu, " ").trim();
  if (unsafeControl.test(text)) return "";
  if (encoder.encode(text).length <= maximum) return text;
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > maximum - 3) break;
    result += character;
    bytes += size;
  }
  return `${result.trimEnd()}…`;
}

/** The host proves this packet belongs to this source and Shared road focus before requesting a duet. */
export function buildStoryDuetMessages(job: StoryBeatJobV1, packet: FirstSharedVictory): readonly CreativeWriterMessage[] {
  return Object.freeze([
    Object.freeze({ role: "system" as const,
      content: "Write two different imagined inner thoughts after this first shared victory. Each is one short first-person sentence about a present hope or worry. Keep facts and injuries unchanged. Add no history, romance, permanent moods, dialogue, or commands. Return exactly HERO: thought on line one and COMPANION: thought on line two.",
    }),
    Object.freeze({ role: "user" as const,
      content: `HERO is ${snippet(packet.heroName, 32)}. COMPANION is ${snippet(packet.companionName, 32)}.`
        + `\nPlace: ${snippet(job.facts.location, 24)}\nMoment: ${snippet(job.facts.headline, 40)}`
        + `\nAction: ${snippet(job.facts.action, 48)}\nChanged: ${snippet(job.facts.consequence, 64)}`
        + `\nCOMPANION is ${packet.condition === "injured" ? "alive and injured" : "uninjured"}.`
        + "\nHERO: one short thought\nCOMPANION: a different short thought",
    }),
  ]);
}

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const roleEcho = /\b(?:HERO|COMPANION)\s*:|\b(?:one|a different) short thought\b|\b(?:line one|line two|first-person sentence|return exactly|imagined inner thoughts)\b/iu;
const firstPerson = /\b(?:I|me|my|mine|myself)\b/iu;

function thought(line: string): string | null {
  if (line.length > 240 || line.length < 12 || line.trim() !== line || unsafeControl.test(line)
    || roleEcho.test(line) || !firstPerson.test(line)) return null;
  const cleaned = cleanCreativeStoryOutput(line);
  // The ordinary cleaner may return a complete prefix; a role must instead own its entire exact sentence.
  if (cleaned !== line || [...sentenceSegmenter.segment(line)].length !== 1) return null;
  return line;
}

/** Structural and text-hygiene gate only; human-reviewed real outputs separately decide literary/grounding quality. */
export function cleanStoryDuetOutput(value: unknown, packet: FirstSharedVictory): StoryDuet | null {
  if (typeof value !== "string" || value.length > 520) return null;
  const lines = /^HERO: ([^\r\n]+)\r?\nCOMPANION: ([^\r\n]+)$/u.exec(value.trim());
  if (lines === null) return null;
  const hero = thought(lines[1]!);
  const companion = thought(lines[2]!);
  if (hero === null || companion === null || hero.toLocaleLowerCase("en") === companion.toLocaleLowerCase("en")) return null;
  return captureStoryDuet({ kind: "inner-voices", hero: { name: packet.heroName, text: hero },
    companion: { name: packet.companionName, text: companion } });
}
