import { canonicalHash } from "../core/canonical";
import type { WorldState } from "../core/types";
import {
  deterministicStoryBeatFallback,
  isStoryBeatJobV1,
  isStoryBeatPublicFactsV1,
  projectStoryBeatJobV1,
  storyBeatMaximumActionCharacters,
  storyBeatMaximumConsequenceCharacters,
  storyBeatMaximumHeadlineCharacters,
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";
import {
  isCommittedStoryBeatMechanicsV2,
  isStoryBeatPublicMechanicsV2,
  projectCommittedStoryBeatMechanicsV2,
  type CommittedStoryBeatMechanicsV2,
  type StoryBeatConsequenceFactV2,
  type StoryBeatConsequenceMetricV2,
  type StoryBeatCostFactV2,
  type StoryBeatCostMetricV2,
  type StoryBeatLensIdV2,
} from "./story-beat-mechanics-v2";

export const factualStoryBeatSchemaVersion = 2 as const;
export const factualStoryBeatMaximumInputTokens = 384 as const;
export const factualStoryBeatMaximumOutputTokens = storyBeatMaximumOutputTokens;

export interface FactualStoryBeatPublicFactsV2 {
  readonly schemaVersion: 2;
  readonly kind: "public-factual-story-beat";
  readonly narrative: StoryBeatPublicFactsV1;
  readonly beatLensId: StoryBeatLensIdV2;
  readonly cost: StoryBeatCostFactV2 | null;
  readonly consequence: StoryBeatConsequenceFactV2 | null;
}

export interface FactualStoryBeatJobV2 {
  readonly schemaVersion: 2;
  readonly task: "author-factual-story-beat";
  readonly disposition: "manual-ephemeral-noncanonical";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
  readonly facts: FactualStoryBeatPublicFactsV2;
  readonly deterministicFallback: string;
  readonly maximumInputTokens: 384;
  readonly maximumOutputTokens: 48;
}

const publicFactsKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "narrative",
  "beatLensId",
  "cost",
  "consequence",
] as const);

const jobKeys = Object.freeze([
  "schemaVersion",
  "task",
  "disposition",
  "campaignId",
  "eventId",
  "tick",
  "sourceFingerprint",
  "facts",
  "deterministicFallback",
  "maximumInputTokens",
  "maximumOutputTokens",
] as const);

const costLabels = Object.freeze({
  "hero-health": "health",
  "hero-mana": "mana",
  "hero-gold": "currency",
} as const satisfies Readonly<Record<StoryBeatCostMetricV2, string>>);

const consequenceLabels = Object.freeze({
  "combat-victory": "combat victory count",
  "combat-defeat": "combat defeat count",
  "combat-stalemate": "combat stalemate count",
  "counter-duel-victory": "duel victory count",
  "counter-duel-defeat": "duel defeat count",
  "counter-duel-draw": "duel draw count",
  "quests-completed": "completion count",
  "dungeon-completed": "completed dungeon count",
  "location-reached": "arrival count",
  "route-planned": "planned route count",
  "dungeon-entered": "entered dungeon count",
  "quest-objective-progress": "task progress",
  "dungeon-cells-visited": "visited cell count",
  "enemy-health": "foe health",
  "hero-level": "level",
  "hero-experience": "experience",
  "ability-experience": "ability experience",
  "town-visits": "town visit count",
  "companions-recruited": "active party count",
  "companions-departed": "departure count",
  "hero-health": "health",
  "hero-mana": "mana",
  "hero-gold": "currency",
  "route-distance": "route distance",
} as const satisfies Readonly<Record<StoryBeatConsequenceMetricV2, string>>);

const neutralNarrativeWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "before",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "now",
  "of",
  "on",
  "or",
  "the",
  "then",
  "to",
  "while",
  "with",
]);

const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isBoundedText(value: unknown, maximumCharacters: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumCharacters
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value)
    && /[\p{L}\p{N}]/u.test(value);
}

function singletonMechanics(
  beatLensId: StoryBeatLensIdV2,
  cost: unknown,
  consequence: unknown,
): unknown {
  return {
    schemaVersion: 2,
    kind: "public-story-beat-mechanics",
    beatLensId,
    costs: cost === null ? [] : [cost],
    consequences: consequence === null ? [] : [consequence],
  };
}

function safelyValidatePublicFacts(value: unknown): value is FactualStoryBeatPublicFactsV2 {
  if (!isRecord(value)
    || !hasExactKeys(value, publicFactsKeys)
    || value.schemaVersion !== factualStoryBeatSchemaVersion
    || value.kind !== "public-factual-story-beat"
    || !isStoryBeatPublicFactsV1(value.narrative)
    || (value.beatLensId !== "cost"
      && value.beatLensId !== "consequence"
      && value.beatLensId !== "contrast")) return false;
  if (value.beatLensId === "cost" && (value.cost === null || value.consequence !== null)) {
    return false;
  }
  if (value.beatLensId === "consequence" && (value.cost !== null || value.consequence === null)) {
    return false;
  }
  if (value.beatLensId === "contrast" && (value.cost === null || value.consequence === null)) {
    return false;
  }
  const mechanics = singletonMechanics(value.beatLensId, value.cost, value.consequence);
  if (!isStoryBeatPublicMechanicsV2(mechanics)) return false;
  const candidate: FactualStoryBeatPublicFactsV2 = {
    schemaVersion: factualStoryBeatSchemaVersion,
    kind: "public-factual-story-beat",
    narrative: value.narrative,
    beatLensId: mechanics.beatLensId,
    cost: mechanics.costs[0] ?? null,
    consequence: mechanics.consequences[0] ?? null,
  };
  return validationFacts(candidate) !== null;
}

export function isFactualStoryBeatPublicFactsV2(
  value: unknown,
): value is FactualStoryBeatPublicFactsV2 {
  try {
    return safelyValidatePublicFacts(value);
  } catch {
    return false;
  }
}

function safelyValidateJob(value: unknown): value is FactualStoryBeatJobV2 {
  return isRecord(value)
    && hasExactKeys(value, jobKeys)
    && value.schemaVersion === factualStoryBeatSchemaVersion
    && value.task === "author-factual-story-beat"
    && value.disposition === "manual-ephemeral-noncanonical"
    && isBoundedText(value.campaignId, 160)
    && isBoundedText(value.eventId, 200)
    && Number.isSafeInteger(value.tick)
    && (value.tick as number) >= 0
    && typeof value.sourceFingerprint === "string"
    && /^[0-9a-f]{16}$/u.test(value.sourceFingerprint)
    && isFactualStoryBeatPublicFactsV2(value.facts)
    && value.deterministicFallback === deterministicStoryBeatFallback(value.facts.narrative)
    && value.maximumInputTokens === factualStoryBeatMaximumInputTokens
    && value.maximumOutputTokens === factualStoryBeatMaximumOutputTokens;
}

export function isFactualStoryBeatJobV2(value: unknown): value is FactualStoryBeatJobV2 {
  try {
    return safelyValidateJob(value);
  } catch {
    return false;
  }
}

function costClause(fact: StoryBeatCostFactV2): string {
  return `${costLabels[fact.metric]} falls from ${fact.before} to ${fact.after}`;
}

function consequenceClause(fact: StoryBeatConsequenceFactV2): string {
  const direction = fact.direction === "increase" ? "rises" : "falls";
  return `${consequenceLabels[fact.metric]} ${direction} from ${fact.before} to ${fact.after}`;
}

function requiredClauses(facts: FactualStoryBeatPublicFactsV2): readonly string[] {
  return [
    ...(facts.cost === null ? [] : [costClause(facts.cost)]),
    ...(facts.consequence === null ? [] : [consequenceClause(facts.consequence)]),
  ];
}

function appendValidationClauses(
  field: string,
  maximumCharacters: number,
  suffix: string,
): string | null {
  const expanded = `${field} ${suffix}`;
  return expanded.length <= maximumCharacters ? expanded : null;
}

function validationFacts(
  facts: FactualStoryBeatPublicFactsV2,
): StoryBeatPublicFactsV1 | null {
  const clauses = requiredClauses(facts);
  if (clauses.length === 0) return null;
  const suffix = clauses.join(" ");
  const consequence = appendValidationClauses(
    facts.narrative.consequence,
    storyBeatMaximumConsequenceCharacters,
    suffix,
  );
  if (consequence !== null) {
    return { ...facts.narrative, consequence };
  }
  const action = appendValidationClauses(
    facts.narrative.action,
    storyBeatMaximumActionCharacters,
    suffix,
  );
  if (action !== null) {
    return { ...facts.narrative, action };
  }
  const headline = appendValidationClauses(
    facts.narrative.headline,
    storyBeatMaximumHeadlineCharacters,
    suffix,
  );
  if (headline !== null) {
    return { ...facts.narrative, headline };
  }
  return null;
}

function selectedFacts(
  mechanics: CommittedStoryBeatMechanicsV2,
): Pick<FactualStoryBeatPublicFactsV2, "beatLensId" | "cost" | "consequence"> {
  const cost = mechanics.facts.costs[0];
  const consequence = mechanics.facts.consequences[0];
  return {
    beatLensId: mechanics.facts.beatLensId,
    cost: cost === undefined ? null : { ...cost },
    consequence: consequence === undefined ? null : { ...consequence },
  };
}

export function projectFactualStoryBeatJobV2(
  narrativeValue: unknown,
  mechanicsValue: unknown,
): FactualStoryBeatJobV2 | null {
  try {
    if (!isStoryBeatJobV1(narrativeValue)
      || !isCommittedStoryBeatMechanicsV2(mechanicsValue)
      || narrativeValue.campaignId !== mechanicsValue.campaignId
      || narrativeValue.eventId !== mechanicsValue.eventId
      || narrativeValue.tick !== mechanicsValue.tick) return null;

    const selected = selectedFacts(mechanicsValue);
    const facts: FactualStoryBeatPublicFactsV2 = {
      schemaVersion: factualStoryBeatSchemaVersion,
      kind: "public-factual-story-beat",
      narrative: { ...narrativeValue.facts },
      ...selected,
    };
    if (!isFactualStoryBeatPublicFactsV2(facts)) return null;

    const sourceFingerprint = canonicalHash({
      schemaVersion: factualStoryBeatSchemaVersion,
      purpose: "experimental-factual-story-beat-source",
      campaignId: narrativeValue.campaignId,
      eventId: narrativeValue.eventId,
      tick: narrativeValue.tick,
      narrativeSourceFingerprint: narrativeValue.sourceFingerprint,
      mechanicsSourceFingerprint: mechanicsValue.sourceFingerprint,
      facts,
    });
    const job: FactualStoryBeatJobV2 = {
      schemaVersion: factualStoryBeatSchemaVersion,
      task: "author-factual-story-beat",
      disposition: "manual-ephemeral-noncanonical",
      campaignId: narrativeValue.campaignId,
      eventId: narrativeValue.eventId,
      tick: narrativeValue.tick,
      sourceFingerprint,
      facts,
      deterministicFallback: deterministicStoryBeatFallback(facts.narrative),
      maximumInputTokens: factualStoryBeatMaximumInputTokens,
      maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
    };
    return isFactualStoryBeatJobV2(job) ? deepFreeze(job) : null;
  } catch {
    return null;
  }
}

/**
 * Joins one exact committed simulation transition into the model-visible V2
 * contract. Multi-tick catch-up and stale Chronicle sources fail closed.
 */
export function projectFactualStoryBeatTransitionV2(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): FactualStoryBeatJobV2 | null {
  try {
    const source = after.chronicle.at(-1);
    const narrative = projectStoryBeatJobV1(
      after.campaignId,
      after.scene,
      source,
      source?.id,
    );
    const mechanics = projectCommittedStoryBeatMechanicsV2(
      before,
      after,
      source,
      source?.id,
    );
    return projectFactualStoryBeatJobV2(narrative, mechanics);
  } catch {
    return null;
  }
}

export const factualStoryBeatPromptInstructionV2 =
  "Write one sentence of at most 24 words. Name the place, include every REQUIRED clause exactly, and connect it to supplied scene words. Add no dialogue, thoughts, future events, quests, rewards, relationships, or unsupplied harm.";

export function formatFactualStoryBeatPromptV2(value: unknown): string | null {
  try {
    if (!isFactualStoryBeatPublicFactsV2(value)) return null;
    return [
      factualStoryBeatPromptInstructionV2,
      `PLACE: ${JSON.stringify(value.narrative.location)}`,
      `HEADLINE: ${JSON.stringify(value.narrative.headline)}`,
      `ACTION: ${JSON.stringify(value.narrative.action)}`,
      `CONSEQUENCE: ${JSON.stringify(value.narrative.consequence)}`,
      `LENS: ${JSON.stringify(value.beatLensId)}`,
      `REQUIRED COST: ${JSON.stringify(value.cost === null ? null : costClause(value.cost))}`,
      `REQUIRED CONSEQUENCE: ${JSON.stringify(
        value.consequence === null ? null : consequenceClause(value.consequence),
      )}`,
      "BEAT:",
    ].join("\n");
  } catch {
    return null;
  }
}

function parseCanonicalPromptValue(line: string, label: string): unknown {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) {
    throw new TypeError(`Factual story-beat prompt is missing ${label}`);
  }
  const encoded = line.slice(prefix.length);
  const decoded: unknown = JSON.parse(encoded);
  if (JSON.stringify(decoded) !== encoded) {
    throw new TypeError(`Factual story-beat prompt ${label} is not canonical`);
  }
  return decoded;
}

function parseCanonicalMechanicNumber(value: string): number {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError("Factual story-beat prompt mechanic number is invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError("Factual story-beat prompt mechanic number is unsafe");
  }
  return parsed;
}

function parseCostClause(value: unknown): StoryBeatCostFactV2 | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError("Factual story-beat REQUIRED COST is invalid");
  }
  for (const metric of Object.keys(costLabels) as StoryBeatCostMetricV2[]) {
    const match = new RegExp(
      `^${costLabels[metric]} falls from ((?:0|[1-9]\\d*)) to ((?:0|[1-9]\\d*))$`,
      "u",
    ).exec(value);
    if (match === null) continue;
    const before = parseCanonicalMechanicNumber(match[1]!);
    const after = parseCanonicalMechanicNumber(match[2]!);
    return {
      kind: "cost",
      metric,
      direction: "decrease",
      before,
      after,
      amount: before - after,
    };
  }
  throw new TypeError("Factual story-beat REQUIRED COST clause is unknown");
}

function parseConsequenceClause(value: unknown): StoryBeatConsequenceFactV2 | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError("Factual story-beat REQUIRED CONSEQUENCE is invalid");
  }
  for (
    const metric of Object.keys(consequenceLabels) as StoryBeatConsequenceMetricV2[]
  ) {
    const match = new RegExp(
      `^${consequenceLabels[metric]} (rises|falls) from ((?:0|[1-9]\\d*)) to ((?:0|[1-9]\\d*))$`,
      "u",
    ).exec(value);
    if (match === null) continue;
    const before = parseCanonicalMechanicNumber(match[2]!);
    const after = parseCanonicalMechanicNumber(match[3]!);
    return {
      kind: "consequence",
      metric,
      direction: match[1] === "rises" ? "increase" : "decrease",
      before,
      after,
      amount: Math.abs(after - before),
    };
  }
  throw new TypeError("Factual story-beat REQUIRED CONSEQUENCE clause is unknown");
}

export function factualStoryBeatFactsFromPromptV2(
  value: unknown,
): FactualStoryBeatPublicFactsV2 | null {
  try {
    if (typeof value !== "string") return null;
    const lines = value.split("\n");
    if (lines.length !== 9
      || lines[0] !== factualStoryBeatPromptInstructionV2
      || lines[8] !== "BEAT:") return null;
    const narrative: StoryBeatPublicFactsV1 = {
      schemaVersion: 1,
      kind: "public-story-beat",
      location: parseCanonicalPromptValue(lines[1]!, "PLACE") as string,
      headline: parseCanonicalPromptValue(lines[2]!, "HEADLINE") as string,
      action: parseCanonicalPromptValue(lines[3]!, "ACTION") as string,
      consequence: parseCanonicalPromptValue(lines[4]!, "CONSEQUENCE") as string,
    };
    const facts: FactualStoryBeatPublicFactsV2 = {
      schemaVersion: factualStoryBeatSchemaVersion,
      kind: "public-factual-story-beat",
      narrative,
      beatLensId: parseCanonicalPromptValue(lines[5]!, "LENS") as StoryBeatLensIdV2,
      cost: parseCostClause(parseCanonicalPromptValue(lines[6]!, "REQUIRED COST")),
      consequence: parseConsequenceClause(
        parseCanonicalPromptValue(lines[7]!, "REQUIRED CONSEQUENCE"),
      ),
    };
    if (!isStoryBeatPublicFactsV1(narrative)
      || !isFactualStoryBeatPublicFactsV2(facts)
      || formatFactualStoryBeatPromptV2(facts) !== value) return null;
    return deepFreeze(facts);
  } catch {
    return null;
  }
}

export function factualStoryBeatRequiredClausesV2(
  value: unknown,
): readonly string[] | null {
  try {
    if (!isFactualStoryBeatPublicFactsV2(value)) return null;
    return Object.freeze([...requiredClauses(value)]);
  } catch {
    return null;
  }
}

function lowerWords(value: string): readonly string[] {
  return [...value.matchAll(wordPattern)].map((match) =>
    match[0].toLocaleLowerCase("en-US")
  );
}

function hasOriginalNarrativeWord(
  output: string,
  facts: StoryBeatPublicFactsV1,
): boolean {
  const locationWords = new Set(lowerWords(facts.location));
  const narrativeWords = new Set(
    lowerWords(`${facts.headline} ${facts.action} ${facts.consequence}`)
      .filter((word) =>
        !locationWords.has(word)
        && !neutralNarrativeWords.has(word)
        && !/^\p{N}+$/u.test(word)
      ),
  );
  return narrativeWords.size > 0
    && lowerWords(output).some((word) => narrativeWords.has(word));
}

export function validateFactualStoryBeatResultV2(
  value: unknown,
  factsValue: unknown,
): string | null {
  try {
    if (!isFactualStoryBeatPublicFactsV2(factsValue) || typeof value !== "string") {
      return null;
    }
    const expanded = validationFacts(factsValue);
    if (expanded === null || validateStoryBeatResultV1(value, expanded) !== value) {
      return null;
    }
    const lowerOutput = value.toLocaleLowerCase("en-US");
    if (requiredClauses(factsValue).some((clause) =>
      !lowerOutput.includes(clause.toLocaleLowerCase("en-US"))
    )) return null;
    return hasOriginalNarrativeWord(value, factsValue.narrative) ? value : null;
  } catch {
    return null;
  }
}
