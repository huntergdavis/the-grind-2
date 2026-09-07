import type { CreativeWriterMessage } from "./creative-writer-client";
import type { StoryBeatJobV1 } from "./story-beat";

export type CreativeMomentChoice = "current" | "milestone";
export type CreativeMilestoneKind = "farewell-remembrance" | "first-shared-victory";

export type CreativeMomentSelection =
  | Readonly<{ choice: "current"; origin: "model" | "default" }>
  | Readonly<{ choice: "milestone"; origin: "model" | "default"; kind: CreativeMilestoneKind }>;

const currentSelection: CreativeMomentSelection = Object.freeze({ choice: "current", origin: "model" });
const modelMilestoneSelection: CreativeMomentSelection = Object.freeze({ choice: "milestone", origin: "model", kind: "farewell-remembrance" });
const defaultMilestoneSelection: CreativeMomentSelection = Object.freeze({ choice: "milestone", origin: "default", kind: "farewell-remembrance" });
const modelVictorySelection: CreativeMomentSelection = Object.freeze({ choice: "milestone", origin: "model", kind: "first-shared-victory" });
const defaultVictorySelection: CreativeMomentSelection = Object.freeze({ choice: "milestone", origin: "default", kind: "first-shared-victory" });

/** Presentation provenance only; the host separately proves the captured milestone source. */
export function normalizeCreativeMomentSelection(raw: unknown): CreativeMomentSelection | null {
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!keys.includes("choice") || !keys.includes("origin")) return null;
    if (record.choice === "current") {
      return keys.length === 2 && record.origin === "model" ? currentSelection : null;
    }
    if (record.choice !== "milestone" || keys.length !== 3 || !keys.includes("kind")
      || (record.kind !== "farewell-remembrance" && record.kind !== "first-shared-victory")) return null;
    if (record.origin === "model") return record.kind === "first-shared-victory" ? modelVictorySelection : modelMilestoneSelection;
    if (record.origin === "default") return record.kind === "first-shared-victory" ? defaultVictorySelection : defaultMilestoneSelection;
    return null;
  } catch {
    return null;
  }
}

/** Invalid output preserves the existing milestone priority; it is not a model-selected choice. */
export function momentForChoice(raw: unknown): CreativeMomentChoice {
  return raw === "1" ? "current" : "milestone";
}

const encoder = new TextEncoder();
const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

/** Match the direction prompt's compact public snippets without coupling its frozen contract. */
function snippet(value: unknown, cap: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\r\n\t]+/gu, " ").trim();
  if (unsafeControl.test(text)) return "";
  if (text.length <= cap && encoder.encode(text).length <= cap) return text;
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (result.length + character.length > cap - 1 || bytes + size > cap - 3) break;
    result += character;
    bytes += size;
  }
  return `${result.trimEnd()}…`;
}

function publicMoment(job: StoryBeatJobV1): string {
  return [
    `Place: ${snippet(job.facts.location, 24)}`,
    `Moment: ${snippet(job.facts.headline, 40)}`,
    `Action: ${snippet(job.facts.action, 48)}`,
    `Changed: ${snippet(job.facts.consequence, 64)}`,
  ].join("\n");
}

/** The host proves both candidates eligible and retains their exact sources; the model selects neither new facts nor actions. */
export function buildCreativeMomentMessages(
  currentJob: StoryBeatJobV1,
  milestoneJob: StoryBeatJobV1,
  kind: CreativeMilestoneKind = "farewell-remembrance",
): readonly CreativeWriterMessage[] {
  // Variable text is at most 352 UTF-8 bytes. The worker enforces the exact 512-token chat-template limit.
  return Object.freeze([
    Object.freeze({
      role: "system" as const,
      content: "Choose which recorded moment would make the more compelling brief fantasy intermission. Select a story subject, not a new event. Reply with only 1 or 2.",
    }),
    Object.freeze({
      role: "user" as const,
      content: `1 Current public scene\n${publicMoment(currentJob)}\n\n`
        + `2 ${kind === "first-shared-victory" ? "Recorded first shared victory" : "Recorded companion farewell"}\n${publicMoment(milestoneJob)}\n\n`
        + "Use only these public snippets. Choose 1 or 2.",
    }),
  ]);
}
