import { canonicalHash } from "../core/canonical";
import type { SceneMode } from "../core/types";
import {
  storyBeatTrainingCorpusHashV1,
  storyBeatTrainingCorpusRequiredCases,
  storyBeatTrainingCorpusRequiredDevCases,
  storyBeatTrainingCorpusRequiredHoldoutCases,
  storyBeatTrainingCorpusRequiredTrainCases,
  storyBeatTrainingCorpusSplits,
  storyBeatTrainingCorpusV1,
  type StoryBeatTrainingCaseV1,
  type StoryBeatTrainingCorpusSplit,
} from "./story-beat-training-corpus";
import {
  storyBeatConsequenceMetricsV2,
  storyBeatCostMetricsV2,
  storyBeatLensIdsV2,
  type StoryBeatConsequenceFactV2,
  type StoryBeatConsequenceMetricV2,
  type StoryBeatCostFactV2,
  type StoryBeatLensIdV2,
} from "./story-beat-mechanics-v2";
import {
  factualStoryBeatRequiredClausesV2,
  formatFactualStoryBeatPromptV2,
  isFactualStoryBeatPublicFactsV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatPublicFactsV2,
} from "./story-beat-v2";

export const factualStoryBeatTrainingCorpusSchemaVersion = 2 as const;
export const factualStoryBeatTrainingCorpusRequiredTrainCases =
  storyBeatTrainingCorpusRequiredTrainCases;
export const factualStoryBeatTrainingCorpusRequiredDevCases =
  storyBeatTrainingCorpusRequiredDevCases;
export const factualStoryBeatTrainingCorpusRequiredHoldoutCases =
  storyBeatTrainingCorpusRequiredHoldoutCases;
export const factualStoryBeatTrainingCorpusRequiredCases =
  storyBeatTrainingCorpusRequiredCases;

export const factualStoryBeatTrainingTargetFrameIds = Object.freeze([
  "prefix-as",
  "prefix-while",
  "interior-as",
  "interior-while",
  "suffix-as",
  "suffix-while",
] as const);

export type FactualStoryBeatTrainingTargetFrameId =
  typeof factualStoryBeatTrainingTargetFrameIds[number];

export interface FactualStoryBeatTrainingCaseV2 {
  readonly schemaVersion: 2;
  readonly kind: "factual-story-beat-training-positive";
  readonly id: string;
  readonly sourceCaseId: string;
  readonly split: StoryBeatTrainingCorpusSplit;
  readonly familyId: string;
  readonly targetTemplateFamilyId: string;
  readonly targetFrameId: FactualStoryBeatTrainingTargetFrameId;
  readonly mode: SceneMode;
  readonly actor: string;
  readonly lensId: StoryBeatLensIdV2;
  readonly costMetric: StoryBeatCostFactV2["metric"] | null;
  readonly consequenceMetric: StoryBeatConsequenceFactV2["metric"] | null;
  readonly facts: FactualStoryBeatPublicFactsV2;
  readonly prompt: string;
  readonly promptCharacters: number;
  readonly target: string;
  readonly targetWords: number;
  readonly caseHash: string;
}

export interface FactualStoryBeatTrainingCorpusCountsV2 {
  readonly train: 1_000;
  readonly dev: 128;
  readonly holdout: 200;
  readonly total: 1_328;
}

export interface FactualStoryBeatTrainingCorpusV2 {
  readonly schemaVersion: 2;
  readonly kind: "factual-story-beat-training-corpus";
  readonly provenance: "project-authored-v1-scenes-plus-original-typed-mechanics-v2";
  readonly sourceCorpusHash: string;
  readonly splitPolicy: "inherits-v1-scene-disjointness-lens-and-metrics-balanced-v2";
  readonly holdoutPolicy: "sealed-holdout-only-never-training-v2";
  readonly counts: FactualStoryBeatTrainingCorpusCountsV2;
  readonly cases: readonly FactualStoryBeatTrainingCaseV2[];
  readonly corpusHash: string;
}

const caseKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "id",
  "sourceCaseId",
  "split",
  "familyId",
  "targetTemplateFamilyId",
  "targetFrameId",
  "mode",
  "actor",
  "lensId",
  "costMetric",
  "consequenceMetric",
  "facts",
  "prompt",
  "promptCharacters",
  "target",
  "targetWords",
  "caseHash",
] as const);

const countKeys = Object.freeze(["train", "dev", "holdout", "total"] as const);

const corpusKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "provenance",
  "sourceCorpusHash",
  "splitPolicy",
  "holdoutPolicy",
  "counts",
  "cases",
  "corpusHash",
] as const);

const eventConsequenceMetrics = new Set<StoryBeatConsequenceMetricV2>([
  "combat-victory",
  "combat-defeat",
  "combat-stalemate",
  "counter-duel-victory",
  "counter-duel-defeat",
  "counter-duel-draw",
  "dungeon-completed",
  "location-reached",
  "route-planned",
  "dungeon-entered",
]);

const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const sourceCasesById = new Map(
  storyBeatTrainingCorpusV1.cases.map((entry) => [entry.id, entry] as const),
);

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

function isDenseArray(value: unknown, length: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  if (Object.keys(value).length !== value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isSplit(value: unknown): value is StoryBeatTrainingCorpusSplit {
  return value === "train" || value === "dev" || value === "holdout";
}

function isFrameId(value: unknown): value is FactualStoryBeatTrainingTargetFrameId {
  return typeof value === "string"
    && (factualStoryBeatTrainingTargetFrameIds as readonly string[]).includes(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
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

function words(value: string): readonly string[] {
  return [...value.matchAll(wordPattern)].map((match) => match[0]);
}

function caseId(split: StoryBeatTrainingCorpusSplit, index: number): string {
  return `factual-story-beat-training-corpus-v2:${split}:${String(index).padStart(4, "0")}`;
}

function isCaseId(
  value: unknown,
  split: StoryBeatTrainingCorpusSplit,
): value is string {
  return typeof value === "string"
    && new RegExp(
      `^factual-story-beat-training-corpus-v2:${split}:\\d{4}$`,
      "u",
    ).test(value);
}

function casePayload(
  value: FactualStoryBeatTrainingCaseV2,
): Omit<FactualStoryBeatTrainingCaseV2, "caseHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    id: value.id,
    sourceCaseId: value.sourceCaseId,
    split: value.split,
    familyId: value.familyId,
    targetTemplateFamilyId: value.targetTemplateFamilyId,
    targetFrameId: value.targetFrameId,
    mode: value.mode,
    actor: value.actor,
    lensId: value.lensId,
    costMetric: value.costMetric,
    consequenceMetric: value.consequenceMetric,
    facts: value.facts,
    prompt: value.prompt,
    promptCharacters: value.promptCharacters,
    target: value.target,
    targetWords: value.targetWords,
  };
}

function corpusPayload(
  value: FactualStoryBeatTrainingCorpusV2,
): Omit<FactualStoryBeatTrainingCorpusV2, "corpusHash"> {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    provenance: value.provenance,
    sourceCorpusHash: value.sourceCorpusHash,
    splitPolicy: value.splitPolicy,
    holdoutPolicy: value.holdoutPolicy,
    counts: value.counts,
    cases: value.cases,
  };
}

function narrativeMatchesSource(
  facts: FactualStoryBeatPublicFactsV2,
  source: StoryBeatTrainingCaseV1,
): boolean {
  return canonicalHash(facts.narrative) === canonicalHash(source.facts);
}

export function isFactualStoryBeatTrainingCaseV2(
  value: unknown,
): value is FactualStoryBeatTrainingCaseV2 {
  try {
    if (!isRecord(value)
      || !hasExactKeys(value, caseKeys)
      || value.schemaVersion !== factualStoryBeatTrainingCorpusSchemaVersion
      || value.kind !== "factual-story-beat-training-positive"
      || !isSplit(value.split)
      || !isCaseId(value.id, value.split)
      || !isBoundedText(value.sourceCaseId, 120)
      || !isBoundedText(value.familyId, 160)
      || !isBoundedText(value.targetTemplateFamilyId, 160)
      || !isFrameId(value.targetFrameId)
      || !isBoundedText(value.mode, 24)
      || !isBoundedText(value.actor, 80)
      || (value.lensId !== "cost"
        && value.lensId !== "consequence"
        && value.lensId !== "contrast")
      || !isFactualStoryBeatPublicFactsV2(value.facts)
      || value.lensId !== value.facts.beatLensId
      || value.costMetric !== (value.facts.cost?.metric ?? null)
      || value.consequenceMetric !== (value.facts.consequence?.metric ?? null)
      || typeof value.prompt !== "string"
      || value.prompt !== formatFactualStoryBeatPromptV2(value.facts)
      || value.promptCharacters !== value.prompt.length
      || !Number.isSafeInteger(value.promptCharacters)
      || value.promptCharacters <= 0
      || typeof value.target !== "string"
      || value.targetWords !== words(value.target).length
      || !Number.isSafeInteger(value.targetWords)
      || value.targetWords <= 0
      || value.targetWords > 24
      || validateFactualStoryBeatResultV2(value.target, value.facts) !== value.target
      || !isHash(value.caseHash)) return false;

    const source = sourceCasesById.get(value.sourceCaseId);
    if (source === undefined
      || source.split !== value.split
      || source.mode !== value.mode
      || source.actor !== value.actor
      || value.familyId !== `${source.familyId}-factual-v2`
      || value.targetTemplateFamilyId !==
        `${value.split}-${value.mode}-${value.lensId}-${value.targetFrameId}-target-v2`
      || !narrativeMatchesSource(value.facts, source)) return false;

    return value.caseHash === canonicalHash(casePayload(
      value as unknown as FactualStoryBeatTrainingCaseV2,
    ));
  } catch {
    return false;
  }
}

function countsAreValid(value: unknown): value is FactualStoryBeatTrainingCorpusCountsV2 {
  return isRecord(value)
    && hasExactKeys(value, countKeys)
    && value.train === factualStoryBeatTrainingCorpusRequiredTrainCases
    && value.dev === factualStoryBeatTrainingCorpusRequiredDevCases
    && value.holdout === factualStoryBeatTrainingCorpusRequiredHoldoutCases
    && value.total === factualStoryBeatTrainingCorpusRequiredCases;
}

export function isFactualStoryBeatTrainingCorpusV2(
  value: unknown,
): value is FactualStoryBeatTrainingCorpusV2 {
  try {
    if (!isRecord(value)
      || !hasExactKeys(value, corpusKeys)
      || value.schemaVersion !== factualStoryBeatTrainingCorpusSchemaVersion
      || value.kind !== "factual-story-beat-training-corpus"
      || value.provenance !==
        "project-authored-v1-scenes-plus-original-typed-mechanics-v2"
      || value.sourceCorpusHash !== storyBeatTrainingCorpusHashV1
      || value.splitPolicy !==
        "inherits-v1-scene-disjointness-lens-and-metrics-balanced-v2"
      || value.holdoutPolicy !== "sealed-holdout-only-never-training-v2"
      || !countsAreValid(value.counts)
      || !isDenseArray(value.cases, factualStoryBeatTrainingCorpusRequiredCases)
      || !isHash(value.corpusHash)) return false;

    const cases = value.cases;
    const splitCounts = new Map<StoryBeatTrainingCorpusSplit, number>(
      storyBeatTrainingCorpusSplits.map((split) => [split, 0]),
    );
    const ids = new Set<string>();
    const hashes = new Set<string>();
    for (let index = 0; index < cases.length; index += 1) {
      const entry = cases[index];
      const source = storyBeatTrainingCorpusV1.cases[index];
      if (!isFactualStoryBeatTrainingCaseV2(entry)
        || source === undefined
        || entry.sourceCaseId !== source.id
        || entry.id !== caseId(entry.split, splitCounts.get(entry.split) ?? -1)
        || ids.has(entry.id)
        || hashes.has(entry.caseHash)) return false;
      splitCounts.set(entry.split, (splitCounts.get(entry.split) ?? 0) + 1);
      ids.add(entry.id);
      hashes.add(entry.caseHash);
    }
    if (splitCounts.get("train") !== value.counts.train
      || splitCounts.get("dev") !== value.counts.dev
      || splitCounts.get("holdout") !== value.counts.holdout) return false;

    return value.corpusHash === canonicalHash(corpusPayload(
      value as unknown as FactualStoryBeatTrainingCorpusV2,
    ));
  } catch {
    return false;
  }
}

function makeCostFact(groupIndex: number): StoryBeatCostFactV2 {
  const metric = storyBeatCostMetricsV2[groupIndex % storyBeatCostMetricsV2.length]!;
  const before = 12 + (groupIndex % 17);
  const amount = 1 + (Math.floor(groupIndex / 17) % 3);
  return {
    kind: "cost",
    metric,
    direction: "decrease",
    before,
    after: before - amount,
    amount,
  };
}

function makeConsequenceFact(groupIndex: number): StoryBeatConsequenceFactV2 {
  const metric = storyBeatConsequenceMetricsV2[
    groupIndex % storyBeatConsequenceMetricsV2.length
  ]!;
  if (eventConsequenceMetrics.has(metric)) {
    return {
      kind: "consequence",
      metric,
      direction: "increase",
      before: 0,
      after: 1,
      amount: 1,
    };
  }
  const amount = 1 + (Math.floor(groupIndex / 13) % 3);
  if (metric === "enemy-health") {
    const before = 9 + (groupIndex % 19);
    return {
      kind: "consequence",
      metric,
      direction: "decrease",
      before,
      after: before - amount,
      amount,
    };
  }
  const before = 1 + (groupIndex % 23);
  return {
    kind: "consequence",
    metric,
    direction: "increase",
    before,
    after: before + amount,
    amount,
  };
}

function makeFacts(
  source: StoryBeatTrainingCaseV1,
  index: number,
): FactualStoryBeatPublicFactsV2 {
  const lensId = storyBeatLensIdsV2[index % storyBeatLensIdsV2.length]!;
  const groupIndex = Math.floor(index / storyBeatLensIdsV2.length);
  const cost = lensId === "consequence" ? null : makeCostFact(groupIndex);
  const consequence = lensId === "cost" ? null : makeConsequenceFact(groupIndex);
  const facts: FactualStoryBeatPublicFactsV2 = {
    schemaVersion: factualStoryBeatTrainingCorpusSchemaVersion,
    kind: "public-factual-story-beat",
    narrative: source.facts,
    beatLensId: lensId,
    cost,
    consequence,
  };
  if (!isFactualStoryBeatPublicFactsV2(facts)) {
    throw new Error("Generated factual story-beat facts failed validation");
  }
  return deepFreeze(facts);
}

function actionVerb(source: StoryBeatTrainingCaseV1): string {
  const remainder = source.facts.action.slice(source.actor.length).trim();
  const tokens = words(remainder);
  const verb = tokens[1];
  if (verb === undefined) throw new Error("Source action has no authored verb");
  return verb;
}

function makeTarget(
  source: StoryBeatTrainingCaseV1,
  facts: FactualStoryBeatPublicFactsV2,
  frameId: FactualStoryBeatTrainingTargetFrameId,
): string {
  const clauses = factualStoryBeatRequiredClausesV2(facts);
  if (clauses === null || clauses.length === 0) {
    throw new Error("Factual story-beat target has no required clauses");
  }
  const actor = words(source.actor)[0];
  if (actor === undefined) throw new Error("Source actor has no given name");
  const action = facts.beatLensId === "contrast"
    ? `${actor} ${actionVerb(source)}`
    : source.facts.action.slice(0, -1);
  const mechanic = clauses.join(" and ");
  const connector = frameId.endsWith("-as") ? "as" : "while";
  if (frameId.startsWith("prefix-")) {
    return `At ${source.facts.location}, ${action} ${connector} ${mechanic}.`;
  }
  if (frameId.startsWith("interior-")) {
    return `${action} at ${source.facts.location} ${connector} ${mechanic}.`;
  }
  return `${action} ${connector} ${mechanic} at ${source.facts.location}.`;
}

function makeCase(
  source: StoryBeatTrainingCaseV1,
  globalIndex: number,
  splitIndex: number,
): FactualStoryBeatTrainingCaseV2 {
  const facts = makeFacts(source, globalIndex);
  const prompt = formatFactualStoryBeatPromptV2(facts);
  if (prompt === null) throw new Error("Generated factual story-beat prompt is invalid");
  const targetFrameId = factualStoryBeatTrainingTargetFrameIds[
    Math.floor(globalIndex / storyBeatLensIdsV2.length)
      % factualStoryBeatTrainingTargetFrameIds.length
  ]!;
  const target = makeTarget(source, facts, targetFrameId);
  if (validateFactualStoryBeatResultV2(target, facts) !== target) {
    throw new Error(
      `Generated factual story-beat target failed validation: ${source.id}`,
    );
  }
  const content: Omit<FactualStoryBeatTrainingCaseV2, "caseHash"> = {
    schemaVersion: factualStoryBeatTrainingCorpusSchemaVersion,
    kind: "factual-story-beat-training-positive",
    id: caseId(source.split, splitIndex),
    sourceCaseId: source.id,
    split: source.split,
    familyId: `${source.familyId}-factual-v2`,
    targetTemplateFamilyId:
      `${source.split}-${source.mode}-${facts.beatLensId}-${targetFrameId}-target-v2`,
    targetFrameId,
    mode: source.mode,
    actor: source.actor,
    lensId: facts.beatLensId,
    costMetric: facts.cost?.metric ?? null,
    consequenceMetric: facts.consequence?.metric ?? null,
    facts,
    prompt,
    promptCharacters: prompt.length,
    target,
    targetWords: words(target).length,
  };
  const result = { ...content, caseHash: canonicalHash(content) };
  if (!isFactualStoryBeatTrainingCaseV2(result)) {
    throw new Error(`Generated factual story-beat case is invalid: ${source.id}`);
  }
  return deepFreeze(result);
}

const splitIndices = new Map<StoryBeatTrainingCorpusSplit, number>(
  storyBeatTrainingCorpusSplits.map((split) => [split, 0]),
);

const generatedCases = storyBeatTrainingCorpusV1.cases.map((source, index) => {
  const splitIndex = splitIndices.get(source.split) ?? 0;
  splitIndices.set(source.split, splitIndex + 1);
  return makeCase(source, index, splitIndex);
});

const counts: FactualStoryBeatTrainingCorpusCountsV2 = deepFreeze({
  train: factualStoryBeatTrainingCorpusRequiredTrainCases,
  dev: factualStoryBeatTrainingCorpusRequiredDevCases,
  holdout: factualStoryBeatTrainingCorpusRequiredHoldoutCases,
  total: factualStoryBeatTrainingCorpusRequiredCases,
});

const corpusWithoutHash: Omit<FactualStoryBeatTrainingCorpusV2, "corpusHash"> = {
  schemaVersion: factualStoryBeatTrainingCorpusSchemaVersion,
  kind: "factual-story-beat-training-corpus",
  provenance: "project-authored-v1-scenes-plus-original-typed-mechanics-v2",
  sourceCorpusHash: storyBeatTrainingCorpusHashV1,
  splitPolicy: "inherits-v1-scene-disjointness-lens-and-metrics-balanced-v2",
  holdoutPolicy: "sealed-holdout-only-never-training-v2",
  counts,
  cases: deepFreeze(generatedCases),
};

export const factualStoryBeatTrainingCorpusV2: FactualStoryBeatTrainingCorpusV2 =
  deepFreeze({
    ...corpusWithoutHash,
    corpusHash: canonicalHash(corpusWithoutHash),
  });

export const factualStoryBeatTrainingCorpusHashV2 =
  factualStoryBeatTrainingCorpusV2.corpusHash;

if (!isFactualStoryBeatTrainingCorpusV2(factualStoryBeatTrainingCorpusV2)) {
  throw new Error("Generated factual story-beat corpus failed its integrity gate");
}
