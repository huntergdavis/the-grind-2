import type { CreativeStoryFocus, CreativeStoryViewpoint } from "./creative-story";
import type { CreativeWriterMessage } from "./creative-writer-client";
import type { StoryBeatJobV1 } from "./story-beat";

export type NarrativeStage = "parchment" | "orrery" | "moth-court";

export interface NarrativeDirection {
  readonly stage: NarrativeStage;
  readonly origin: "model" | "default";
}

export const defaultNarrativeDirection: NarrativeDirection = Object.freeze({ stage: "parchment", origin: "default" });

export const narrativeStageLabels: Readonly<Record<NarrativeStage, string>> = Object.freeze({
  parchment: "Crimson Chronicle",
  orrery: "Impossible Orrery",
  "moth-court": "Moth Court",
});

const modelDirections: Readonly<Record<NarrativeStage, NarrativeDirection>> = Object.freeze({
  parchment: Object.freeze({ stage: "parchment", origin: "model" }),
  orrery: Object.freeze({ stage: "orrery", origin: "model" }),
  "moth-court": Object.freeze({ stage: "moth-court", origin: "model" }),
});

export function directionChoiceForStage(stage: NarrativeStage): "1" | "2" | "3" {
  return stage === "orrery" ? "2" : stage === "moth-court" ? "3" : "1";
}

/** The worker returns one literal label; prose, guessed keywords and numeric coercion never count. */
export function directionForChoice(value: unknown): NarrativeDirection {
  if (value === "1") return modelDirections.parchment;
  if (value === "2") return modelDirections.orrery;
  if (value === "3") return modelDirections["moth-court"];
  return defaultNarrativeDirection;
}

/** Default staging cannot claim an unearned model-directed treatment. */
export function normalizeNarrativeDirection(value: unknown): NarrativeDirection {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return defaultNarrativeDirection;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== 2 || !keys.includes("stage") || !keys.includes("origin")) return defaultNarrativeDirection;
    if (record.origin === "default") return defaultNarrativeDirection;
    if (record.origin !== "model") return defaultNarrativeDirection;
    if (record.stage === "parchment" || record.stage === "orrery" || record.stage === "moth-court") {
      return modelDirections[record.stage];
    }
    return defaultNarrativeDirection;
  } catch {
    return defaultNarrativeDirection;
  }
}

const encoder = new TextEncoder();
const unsafeControl = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

/** Each cap limits both UTF-16 characters and UTF-8 bytes, keeping multilingual snippets compact too. */
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

const focusNames: Readonly<Record<CreativeStoryFocus, string>> = Object.freeze({
  "inner-life": "inner life",
  "shared-road": "shared road",
  scene: "scene imagery",
});
const publicValues = ["curiosity", "loyalty", "mercy", "courage"] as const;
const publicStatuses = ["travelling", "arrived", "injured", "arrived-injured"] as const;
const directionOptions = [
  { stage: "parchment", text: "1 Crimson Chronicle: intimate vows, farewells, private doubt; crimson parchment." },
  { stage: "orrery", text: "2 Impossible Orrery: wonder, discovery, unanswered questions; impossible stars." },
  { stage: "moth-court", text: "3 Moth Court: mischief, awkward company, uneasy relief; paper-moth shadow theatre." },
] as const;

/** A small presentation decision, not story authorship, an event proposal or a gameplay command. */
export function buildCreativeDirectionMessages(
  job: StoryBeatJobV1,
  viewpoint?: CreativeStoryViewpoint,
  focus: CreativeStoryFocus = "inner-life",
  previousStage?: NarrativeStage,
): readonly CreativeWriterMessage[] {
  const facts = job.facts;
  const companion = viewpoint?.companion;
  const values = publicValues.filter((value) => viewpoint?.hero.values.includes(value)).join(", ");
  const companionStatus = companion != null && publicStatuses.includes(companion.status) ? companion.status : "";
  // Presentation variety excludes only the last actually shown stage, never inferring a better literary choice.
  const options = directionOptions.filter(({ stage }) => stage !== previousStage);
  const labels = options.length === 3 ? "1, 2, or 3" : options.map(({ stage }) => directionChoiceForStage(stage)).join(" or ");
  // Public variable text is capped at 296 bytes in total; fixed labels/status/values are a small closed vocabulary.
  // The worker separately enforces its exact 512-token budget after applying the model's chat template.
  const scene = [
    `Place: ${snippet(facts.location, 32)}`,
    `Moment: ${snippet(facts.headline, 56)}`,
    `Action: ${snippet(facts.action, 72)}`,
    `Changed: ${snippet(facts.consequence, 88)}`,
    `Focus: ${focusNames[focus] ?? focusNames["inner-life"]}`,
    ...(viewpoint === undefined ? [] : [
      `Hero: ${snippet(viewpoint.hero.name, 24)}${values.length > 0 ? `; ${values}` : ""}`,
      companion == null ? "No active companion."
        : `Companion: ${snippet(companion.name, 24)}; ${companionStatus}`,
    ]),
  ].join("\n");
  return Object.freeze([
    Object.freeze({
      role: "system" as const,
      content: `Direct an imagined fantasy intermission, not game events. Choose its presentation. Reply with only ${labels}.`,
    }),
    Object.freeze({
      role: "user" as const,
      content: `${options.map(({ text }) => text).join("\n")}\n`
        + "All are imagined staging, not events, creatures, or predictions.\n"
        + `Public scene snippets:\n${scene}\nChoose ${labels}.`,
    }),
  ]);
}
