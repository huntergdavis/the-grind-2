import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import {
  isNarratorRunReceiptV3,
  type NarratorCaseReceiptV3,
  type NarratorEvaluationCaseStatusV3,
  type NarratorRunReceiptV3,
  type NarratorSuccessfulCaseReceiptV3,
} from "./evaluation-receipts-v3";
import {
  narratorFormIdsV3,
  type NarratorFormIdV3,
} from "./evaluation-selection-contract-v3";
import {
  isNarratorModelCandidate,
  type NarratorModelCandidate,
} from "./model-candidate";

export const narratorRateabilityThresholdsV3 = Object.freeze({
  requiredCaseCount: 200 as const,
  minimumValidRowCount: 198 as const,
  minimumRateableNonBaselineCount: 140 as const,
  minimumStratumValidityPermille: 900 as const,
  minimumStratumRateablePermille: 600 as const,
  minimumVoiceRateablePermille: 650 as const,
  maximumRepeatedBurstCount: 0 as const,
  maximumSelectedFormRun: 3 as const,
  requiredVariableSeedCount: 20 as const,
  seedCount: 20 as const,
  casesPerSeed: 10 as const,
});

export const narratorRateabilityContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-rateability:v3" as const,
  source: "fully-revalidated-V3-run-receipt" as const,
  validRow: "ok-safe-zero-knowledge-violation-with-complete-host-selection" as const,
  rateableRow: "valid-model-selected-nonbaseline-form" as const,
  baselineRow: "valid-baseline-form-is-automatic-tie" as const,
  capacity: "full-denominator-global-stratum-and-voice-counts" as const,
  stratum: "move-energy-voice" as const,
  fatigueBursts: "five-seed-local-two-slot-pairs-both-valid-equal-selected-form-id" as const,
  fatigueRuns: "corpus-ordinal-order-across-seeds-invalid-resets-run" as const,
  fatigueSeedDiversity: "distinct-valid-stable-form-ids-inside-each-ten-case-seed" as const,
  repair: "no-retry-rescore-reorder-substitution-or-post-result-repair" as const,
  thresholds: narratorRateabilityThresholdsV3,
  humanQualityEvaluated: false as const,
  humanRatingIncluded: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
  productionAuthority: false as const,
});

export const narratorRateabilityContractHashV3 = canonicalHash(
  narratorRateabilityContractV3,
);

export type NarratorRateabilityBlockerV3 =
  | "run-load-not-ok"
  | "run-worker-binding-missing"
  | "run-incomplete"
  | "run-dispose-not-ok"
  | "run-termination-requested"
  | "valid-rows-below-198"
  | "accepted-knowledge-violation"
  | "rateable-nonbaseline-rows-below-140"
  | "stratum-validity-below-90-percent"
  | "stratum-rateable-below-60-percent"
  | "voice-rateable-below-65-percent"
  | "repeated-form-inside-burst"
  | "selected-form-run-above-three"
  | "seed-form-variants-below-two";

export interface NarratorRateabilityCapacityV3 {
  readonly key: string;
  readonly caseCount: number;
  readonly validRowCount: number;
  readonly rateableNonBaselineCount: number;
  readonly baselineAutoTieCount: number;
  readonly invalidRowCount: number;
  readonly validityPermille: number;
  readonly rateablePermille: number;
}

export interface NarratorRateabilityStatusCountV3 {
  readonly status: NarratorEvaluationCaseStatusV3;
  readonly count: number;
}

export interface NarratorRateabilityFormCountV3 {
  readonly formId: NarratorFormIdV3;
  readonly count: number;
}

export interface NarratorRateabilitySummaryV3 {
  readonly schemaVersion: 3;
  readonly summaryId: "the-grind-2:narrator-rateability-summary:v3";
  readonly rateabilityContractHash: string;
  readonly candidateId: string;
  readonly runSpecHash: string;
  readonly runReceiptHash: string;
  readonly corpusHash: string;
  readonly thresholds: typeof narratorRateabilityThresholdsV3;
  readonly caseCount: 200;
  readonly completedRowCount: number;
  readonly statusCounts: readonly NarratorRateabilityStatusCountV3[];
  readonly validRowCount: number;
  readonly invalidRowCount: number;
  readonly rateableNonBaselineCount: number;
  readonly baselineAutoTieCount: number;
  readonly acceptedKnowledgeViolationCount: number;
  readonly validityPermille: number;
  readonly rateablePermille: number;
  readonly p95ValidLatencyMilliseconds: number | null;
  readonly strata: readonly NarratorRateabilityCapacityV3[];
  readonly voices: readonly NarratorRateabilityCapacityV3[];
  readonly selectedForms: readonly NarratorRateabilityFormCountV3[];
  readonly repeatedBurstCount: number;
  readonly maximumSelectedFormRun: number;
  readonly variableSeedCount: number;
  readonly disposition: "run-mechanics-pass" | "blocked";
  readonly blockers: readonly NarratorRateabilityBlockerV3[];
  readonly humanQualityEvaluated: false;
  readonly humanRatingIncluded: false;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly productionAuthority: false;
  readonly contentHash: string;
}

const caseStatuses = Object.freeze([
  "ok",
  "prompt-format-error",
  "input-tokenizer-error",
  "input-token-contract-error",
  "input-budget",
  "target-tokenizer-error",
  "target-token-contract-error",
  "generation-error",
  "selection-contract-error",
  "worker-response-invalid",
  "worker-call-error",
  "case-timeout",
  "device-lost",
  "run-aborted",
  "not-run",
] satisfies readonly NarratorEvaluationCaseStatusV3[]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function permille(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.floor(numerator * 1_000 / denominator);
}

function validRow(
  row: NarratorCaseReceiptV3,
): row is NarratorSuccessfulCaseReceiptV3 {
  return row.status === "ok"
    && row.safetyAccepted
    && row.knowledgeViolationCount === 0
    && row.selection !== null
    && row.selectedFormId !== null
    && row.renderedText !== null
    && row.selectedFormId === row.selection.selectedFormId;
}

function rateableRow(row: NarratorCaseReceiptV3): boolean {
  return validRow(row)
    && row.selectedFormId !== row.request.eligibility.baselineFormId;
}

function capacity(
  key: string,
  ordinals: readonly number[],
  rows: readonly NarratorCaseReceiptV3[],
): NarratorRateabilityCapacityV3 {
  const selected = ordinals.map((ordinal) => rows[ordinal]!);
  const validRowCount = selected.filter(validRow).length;
  const rateableNonBaselineCount = selected.filter(rateableRow).length;
  const baselineAutoTieCount = selected.filter((row) =>
    validRow(row) && row.selectedFormId === row.request.eligibility.baselineFormId).length;
  return Object.freeze({
    key,
    caseCount: ordinals.length,
    validRowCount,
    rateableNonBaselineCount,
    baselineAutoTieCount,
    invalidRowCount: ordinals.length - validRowCount,
    validityPermille: permille(validRowCount, ordinals.length),
    rateablePermille: permille(rateableNonBaselineCount, ordinals.length),
  });
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

function fatigue(rows: readonly NarratorCaseReceiptV3[]): {
  readonly repeatedBurstCount: number;
  readonly maximumSelectedFormRun: number;
  readonly variableSeedCount: number;
} {
  let repeatedBurstCount = 0;
  let maximumSelectedFormRun = 0;
  let currentRun = 0;
  let previous: NarratorFormIdV3 | null = null;
  let variableSeedCount = 0;

  for (let seed = 0; seed < narratorRateabilityThresholdsV3.seedCount; seed += 1) {
    const selectedForms = rows
      .slice(
        seed * narratorRateabilityThresholdsV3.casesPerSeed,
        (seed + 1) * narratorRateabilityThresholdsV3.casesPerSeed,
      )
      .map((row) => validRow(row) ? row.selectedFormId : null);
    if (new Set(selectedForms.filter((form): form is NarratorFormIdV3 => form !== null)).size >= 2) {
      variableSeedCount += 1;
    }
    for (let slot = 0; slot < selectedForms.length; slot += 2) {
      if (selectedForms[slot] !== null && selectedForms[slot] === selectedForms[slot + 1]) {
        repeatedBurstCount += 1;
      }
    }
    for (const form of selectedForms) {
      if (form !== null && form === previous) currentRun += 1;
      else currentRun = form === null ? 0 : 1;
      previous = form;
      maximumSelectedFormRun = Math.max(maximumSelectedFormRun, currentRun);
    }
  }
  return { repeatedBurstCount, maximumSelectedFormRun, variableSeedCount };
}

function groupedOrdinals(
  keyFor: (ordinal: number) => string,
): readonly (readonly [string, readonly number[]])[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const key = keyFor(ordinal);
    const group = groups.get(key) ?? [];
    group.push(ordinal);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, ordinals]) => Object.freeze([key, Object.freeze(ordinals)] as const));
}

export function createNarratorRateabilitySummaryV3(
  candidate: NarratorModelCandidate,
  runReceipt: NarratorRunReceiptV3,
): NarratorRateabilitySummaryV3 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRunReceiptV3(runReceipt, candidate)) {
    throw new TypeError("Narrator V3 rateability evidence is invalid");
  }

  const rows = runReceipt.rows;
  const validRowCount = rows.filter(validRow).length;
  const rateableNonBaselineCount = rows.filter(rateableRow).length;
  const baselineAutoTieCount = rows.filter((row) =>
    validRow(row) && row.selectedFormId === row.request.eligibility.baselineFormId).length;
  const acceptedKnowledgeViolationCount = rows.filter((row) =>
    row.status === "ok" && row.knowledgeViolationCount > 0).length;
  const strata = groupedOrdinals((ordinal) => {
    const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
    return `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
  }).map(([key, ordinals]) => capacity(key, ordinals, rows));
  const voices = groupedOrdinals((ordinal) =>
    narratorEvaluationCasesV1[ordinal]!.prompt.voice)
    .map(([key, ordinals]) => capacity(key, ordinals, rows));
  const selectedForms = narratorFormIdsV3.map((formId) => Object.freeze({
    formId,
    count: rows.filter((row) => validRow(row) && row.selectedFormId === formId).length,
  }));
  const statusCounts = caseStatuses.map((status) => Object.freeze({
    status,
    count: rows.filter((row) => row.status === status).length,
  }));
  const observedFatigue = fatigue(rows);
  const blockers: NarratorRateabilityBlockerV3[] = [];

  if (runReceipt.load.stage !== "model-load" || runReceipt.load.status !== "ok") {
    blockers.push("run-load-not-ok");
  }
  if (runReceipt.workerBinding === null) blockers.push("run-worker-binding-missing");
  if (runReceipt.completedRowCount !== narratorEvaluationRequiredCases
    || rows.some((row) => row.status === "not-run" || row.status === "run-aborted")) {
    blockers.push("run-incomplete");
  }
  if (runReceipt.dispose.status !== "ok") blockers.push("run-dispose-not-ok");
  if (runReceipt.termination.status !== "not-requested") blockers.push("run-termination-requested");
  if (validRowCount < narratorRateabilityThresholdsV3.minimumValidRowCount) {
    blockers.push("valid-rows-below-198");
  }
  if (acceptedKnowledgeViolationCount > 0) blockers.push("accepted-knowledge-violation");
  if (rateableNonBaselineCount
    < narratorRateabilityThresholdsV3.minimumRateableNonBaselineCount) {
    blockers.push("rateable-nonbaseline-rows-below-140");
  }
  if (strata.some((entry) =>
    entry.validRowCount * 1_000
      < entry.caseCount * narratorRateabilityThresholdsV3.minimumStratumValidityPermille)) {
    blockers.push("stratum-validity-below-90-percent");
  }
  if (strata.some((entry) =>
    entry.rateableNonBaselineCount * 1_000
      < entry.caseCount * narratorRateabilityThresholdsV3.minimumStratumRateablePermille)) {
    blockers.push("stratum-rateable-below-60-percent");
  }
  if (voices.some((entry) =>
    entry.rateableNonBaselineCount * 1_000
      < entry.caseCount * narratorRateabilityThresholdsV3.minimumVoiceRateablePermille)) {
    blockers.push("voice-rateable-below-65-percent");
  }
  if (observedFatigue.repeatedBurstCount
    > narratorRateabilityThresholdsV3.maximumRepeatedBurstCount) {
    blockers.push("repeated-form-inside-burst");
  }
  if (observedFatigue.maximumSelectedFormRun
    > narratorRateabilityThresholdsV3.maximumSelectedFormRun) {
    blockers.push("selected-form-run-above-three");
  }
  if (observedFatigue.variableSeedCount
    < narratorRateabilityThresholdsV3.requiredVariableSeedCount) {
    blockers.push("seed-form-variants-below-two");
  }

  const content = {
    schemaVersion: 3 as const,
    summaryId: "the-grind-2:narrator-rateability-summary:v3" as const,
    rateabilityContractHash: narratorRateabilityContractHashV3,
    candidateId: candidate.candidateId,
    runSpecHash: runReceipt.runSpec.contentHash,
    runReceiptHash: runReceipt.contentHash,
    corpusHash: runReceipt.runSpec.corpus.hash,
    thresholds: narratorRateabilityThresholdsV3,
    caseCount: narratorRateabilityThresholdsV3.requiredCaseCount,
    completedRowCount: runReceipt.completedRowCount,
    statusCounts: Object.freeze(statusCounts),
    validRowCount,
    invalidRowCount: narratorEvaluationRequiredCases - validRowCount,
    rateableNonBaselineCount,
    baselineAutoTieCount,
    acceptedKnowledgeViolationCount,
    validityPermille: permille(validRowCount, narratorEvaluationRequiredCases),
    rateablePermille: permille(rateableNonBaselineCount, narratorEvaluationRequiredCases),
    p95ValidLatencyMilliseconds: percentile95(rows
      .filter(validRow)
      .map((row) => row.latencyMilliseconds)),
    strata: Object.freeze(strata),
    voices: Object.freeze(voices),
    selectedForms: Object.freeze(selectedForms),
    ...observedFatigue,
    disposition: blockers.length === 0
      ? "run-mechanics-pass" as const
      : "blocked" as const,
    blockers: Object.freeze(blockers),
    humanQualityEvaluated: false as const,
    humanRatingIncluded: false as const,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
    productionAuthority: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRateabilitySummaryForEvidenceV3(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
): value is NarratorRateabilitySummaryV3 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRunReceiptV3(runReceipt, candidate)) return false;
  try {
    return canonicalStringify(value)
      === canonicalStringify(createNarratorRateabilitySummaryV3(candidate, runReceipt));
  } catch {
    return false;
  }
}
