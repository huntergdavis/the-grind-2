import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  isNarratorRunReceiptV1,
  type NarratorRunReceiptV1,
} from "./evaluation-receipts";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import {
  narratorCandidateManifestBlockers,
  isNarratorModelCandidateV1,
  type NarratorCandidateManifestBlocker,
  type NarratorModelCandidateV1,
} from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorPromptV1,
  isNarratorRecord,
  narratorHasExactKeys,
  type NarratorPromptV1,
} from "./protocol";

export type NarratorBlindSide = "left" | "right";
export type NarratorBlindResolution = "rate" | "auto-tie" | "unrated-invalid";
export type NarratorBlindRatingChoice = NarratorBlindSide | "tie" | "unrated";

export interface NarratorBlindSheetItemV1 {
  readonly schemaVersion: 1;
  readonly ordinal: number;
  readonly caseId: string;
  readonly prompt: NarratorPromptV1;
  readonly resolution: NarratorBlindResolution;
  readonly leftText: string | null;
  readonly rightText: string | null;
}

export interface NarratorBlindSheetV1 {
  readonly schemaVersion: 1;
  readonly sheetId: string;
  readonly runReceiptHash: string;
  readonly corpusHash: string;
  readonly answerKeySaltFingerprint: string;
  readonly items: readonly NarratorBlindSheetItemV1[];
  readonly contentHash: string;
}

export interface NarratorBlindKeyV1 {
  readonly schemaVersion: 1;
  readonly sheetHash: string;
  readonly runReceiptHash: string;
  readonly secretSalt: string;
  readonly items: readonly {
    readonly ordinal: number;
    readonly caseId: string;
    readonly modelSide: NarratorBlindSide;
  }[];
  readonly contentHash: string;
}

export interface NarratorRatingBundleV1 {
  readonly schemaVersion: 1;
  readonly ratingRunId: string;
  readonly sheetHash: string;
  readonly runReceiptHash: string;
  readonly raterId: string;
  readonly ratings: readonly {
    readonly ordinal: number;
    readonly caseId: string;
    readonly choice: NarratorBlindRatingChoice;
  }[];
  readonly contentHash: string;
}

export interface NarratorRatingReplayRegistryV1 {
  readonly schemaVersion: 1;
  readonly epoch: number;
  readonly consumptionIds: readonly string[];
  readonly contentHash: string;
}

export interface NarratorRatingConsumptionReceiptV1 {
  readonly schemaVersion: 1;
  readonly reportHash: string;
  readonly ratingConsumptionId: string;
  readonly priorRegistry: NarratorRatingReplayRegistryV1;
  readonly nextRegistry: NarratorRatingReplayRegistryV1;
  readonly contentHash: string;
}

export interface NarratorStratumMetricsV1 {
  readonly stratum: string;
  readonly caseCount: number;
  readonly validCount: number;
  readonly modelWins: number;
  readonly templateWins: number;
  readonly ties: number;
  readonly unrated: number;
  readonly decisiveCount: number;
  readonly fullDenominatorScorePermille: number;
}

export type NarratorBenchmarkBlocker = NarratorCandidateManifestBlocker
  | "run-receipt-invalid"
  | "run-load-not-ok"
  | "run-dispose-not-ok"
  | "run-incomplete"
  | "blind-sheet-invalid"
  | "blind-key-invalid"
  | "rating-bundle-invalid"
  | "rating-replay-registry-invalid"
  | "rating-run-replayed"
  | "first-pass-validity-below-99-percent"
  | "accepted-knowledge-violation"
  | "global-model-wins-below-120"
  | "global-score-below-60-percent"
  | "decisive-count-below-140"
  | "model-win-confidence-not-above-50-percent"
  | "stratum-validity-below-90-percent"
  | "stratum-quality-below-50-percent"
  | "stratum-decisive-below-60-percent"
  | "voice-quality-below-55-percent"
  | "voice-decisive-below-65-percent"
  | "repeated-line-inside-burst"
  | "output-form-run-above-three"
  | "sequence-output-variants-below-two";

export interface NarratorBenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly runReceiptHash: string;
  readonly ratingBundleHash: string;
  readonly replayRegistryHash: string;
  readonly replayRegistryEpoch: number;
  readonly ratingConsumptionId: string;
  readonly requiredInV04_13b3: readonly NarratorV04_13b3Requirement[];
  readonly firstPassValidityPermille: number;
  readonly unsafeOutputCount: number;
  readonly acceptedKnowledgeViolations: number;
  readonly p95LatencyMilliseconds: number | null;
  readonly modelWins: number;
  readonly templateWins: number;
  readonly ties: number;
  readonly unrated: number;
  readonly decisiveCount: number;
  readonly fullDenominatorScorePermille: number;
  readonly modelWinWilsonLowerPermille: number;
  readonly repeatedBurstCount: number;
  readonly maximumOutputFormRun: number;
  readonly sequencesWithAtLeastTwoVariants: number;
  readonly strata: readonly NarratorStratumMetricsV1[];
  readonly disposition: "blocked" | "advance-to-v04.13b3";
  readonly blockers: readonly NarratorBenchmarkBlocker[];
  readonly modelAdmitted: false;
  readonly contentHash: string;
}

export type NarratorV04_13b3Requirement =
  | "named-phone-memory-receipt"
  | "incremental-memory-unmeasured"
  | "incremental-memory-budget-exceeded";

const hashPattern = /^[0-9a-f]{16}$/u;
const sides: readonly NarratorBlindSide[] = ["left", "right"];
const resolutions: readonly NarratorBlindResolution[] = ["rate", "auto-tie", "unrated-invalid"];
const choices: readonly NarratorBlindRatingChoice[] = ["left", "right", "tie", "unrated"];
const benchmarkBlockerValues: readonly NarratorBenchmarkBlocker[] = [
  "candidate-schema-invalid", "candidate-id-invalid", "model-revision-unpinned", "source-revision-unpinned",
  "model-license-unverified", "model-license-not-permissive", "runtime-unpinned",
  "runtime-license-not-permissive", "runtime-integrity-unpinned", "artifact-manifest-empty",
  "artifact-path-duplicate", "artifact-byte-length-invalid", "artifact-hash-unpinned",
  "stored-byte-budget-exceeded", "incremental-memory-unmeasured", "incremental-memory-budget-exceeded",
  "run-receipt-invalid", "run-load-not-ok", "run-dispose-not-ok", "run-incomplete",
  "blind-sheet-invalid", "blind-key-invalid", "rating-bundle-invalid", "rating-replay-registry-invalid",
  "rating-run-replayed", "first-pass-validity-below-99-percent", "accepted-knowledge-violation",
  "global-model-wins-below-120", "global-score-below-60-percent", "decisive-count-below-140",
  "model-win-confidence-not-above-50-percent", "stratum-validity-below-90-percent",
  "stratum-quality-below-50-percent", "stratum-decisive-below-60-percent",
  "voice-quality-below-55-percent", "voice-decisive-below-65-percent", "repeated-line-inside-burst",
  "output-form-run-above-three", "sequence-output-variants-below-two",
];

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function createNarratorRatingReplayRegistryV1(
  consumptionIds: readonly string[] = [],
  epoch = 0,
): NarratorRatingReplayRegistryV1 {
  if (!Number.isSafeInteger(epoch) || epoch < 0
    || !Array.isArray(consumptionIds)
    || consumptionIds.some((id) => !hashPattern.test(id))
    || new Set(consumptionIds).size !== consumptionIds.length
    || epoch !== consumptionIds.length) {
    throw new TypeError("Narrator rating replay registry is invalid");
  }
  const content = {
    schemaVersion: 1 as const,
    epoch,
    consumptionIds: Object.freeze([...consumptionIds].sort()),
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRatingReplayRegistryV1(value: unknown): value is NarratorRatingReplayRegistryV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["schemaVersion", "epoch", "consumptionIds", "contentHash"])
    || value.schemaVersion !== 1
    || !Number.isSafeInteger(value.epoch)
    || Number(value.epoch) < 0
    || !Array.isArray(value.consumptionIds)
    || value.consumptionIds.some((id) => !hashPattern.test(String(id)))
    || new Set(value.consumptionIds).size !== value.consumptionIds.length
    || value.epoch !== value.consumptionIds.length
    || value.consumptionIds.some((id, index, ids) => index > 0 && String(ids[index - 1]) >= String(id))
    || !hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

function stratumOf(ordinal: number): string {
  const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
  return `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
}

function saltFingerprint(sheetId: string, runReceiptHash: string, secretSalt: string): string {
  return canonicalHash({ schemaVersion: 1, sheetId, runReceiptHash, secretSalt });
}

export function generateNarratorBlindStudySaltV1(
  source: Pick<Crypto, "getRandomValues"> = globalThis.crypto,
): string {
  if (source === undefined || typeof source.getRandomValues !== "function") {
    throw new TypeError("Web Crypto random generation is unavailable");
  }
  const bytes = new Uint8Array(32);
  source.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function isPrivateSalt(value: unknown): value is string {
  return isNarratorBoundedText(value, 240) && /^[A-Za-z0-9_-]{43,240}$/u.test(value);
}

function modelSideAssignments(
  sheetId: string,
  runReceiptHash: string,
  secretSalt: string,
): readonly NarratorBlindSide[] {
  const groups = new Map<string, number[]>();
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const stratum = stratumOf(ordinal);
    const group = groups.get(stratum) ?? [];
    group.push(ordinal);
    groups.set(stratum, group);
  }
  const oddStrata = [...groups.entries()]
    .filter(([, ordinals]) => ordinals.length % 2 === 1)
    .sort(([left], [right]) => {
      const leftHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, stratum: left });
      const rightHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, stratum: right });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
  const extraLeft = new Set(oddStrata.slice(0, oddStrata.length / 2).map(([stratum]) => stratum));
  const assignments = Array<NarratorBlindSide>(narratorEvaluationRequiredCases).fill("right");
  for (const [stratum, ordinals] of groups) {
    const ordered = [...ordinals].sort((left, right) => {
      const leftHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, caseId: narratorEvaluationCasesV1[left]!.id });
      const rightHash = canonicalHash({ sheetId, runReceiptHash, secretSalt, caseId: narratorEvaluationCasesV1[right]!.id });
      return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : 0;
    });
    const leftCount = Math.floor(ordered.length / 2) + (extraLeft.has(stratum) ? 1 : 0);
    for (let index = 0; index < leftCount; index += 1) assignments[ordered[index]!] = "left";
  }
  return Object.freeze(assignments);
}

export function createNarratorBlindStudyV1(
  candidate: NarratorModelCandidateV1,
  runReceipt: NarratorRunReceiptV1,
  sheetId: string,
  secretSalt: string,
): { readonly sheet: NarratorBlindSheetV1; readonly key: NarratorBlindKeyV1 } {
  if (!isNarratorRunReceiptV1(runReceipt, candidate)) throw new TypeError("Narrator run receipt is invalid");
  if (!isNarratorBoundedText(sheetId, 200) || !isPrivateSalt(secretSalt)) {
    throw new TypeError("Narrator blind study identity is invalid");
  }
  const assignments = modelSideAssignments(sheetId, runReceipt.contentHash, secretSalt);
  const items = runReceipt.rows.map((row, ordinal): NarratorBlindSheetItemV1 => {
    const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
    const modelSide = assignments[ordinal]!;
    const valid = row.status === "ok" && row.safetyAccepted && row.outputText !== null;
    const resolution: NarratorBlindResolution = !valid
      ? "unrated-invalid"
      : row.outputText === evaluationCase.deterministicBaseline ? "auto-tie" : "rate";
    const modelText = valid ? row.outputText : null;
    const templateText = valid ? evaluationCase.deterministicBaseline : null;
    return deepFreeze({
      schemaVersion: 1,
      ordinal,
      caseId: evaluationCase.id,
      prompt: evaluationCase.prompt,
      resolution,
      leftText: modelSide === "left" ? modelText : templateText,
      rightText: modelSide === "right" ? modelText : templateText,
    });
  });
  const sheetContent = {
    schemaVersion: 1 as const,
    sheetId,
    runReceiptHash: runReceipt.contentHash,
    corpusHash: narratorEvaluationCorpusHashV1,
    answerKeySaltFingerprint: saltFingerprint(sheetId, runReceipt.contentHash, secretSalt),
    items: Object.freeze(items),
  };
  const sheet = deepFreeze({ ...sheetContent, contentHash: canonicalHash(sheetContent) });
  const keyItems = assignments.map((modelSide, ordinal) => Object.freeze({
    ordinal,
    caseId: narratorEvaluationCasesV1[ordinal]!.id,
    modelSide,
  }));
  const keyContent = {
    schemaVersion: 1 as const,
    sheetHash: sheet.contentHash,
    runReceiptHash: runReceipt.contentHash,
    secretSalt,
    items: Object.freeze(keyItems),
  };
  return deepFreeze({ sheet, key: { ...keyContent, contentHash: canonicalHash(keyContent) } });
}

function expectedSheetItem(
  runReceipt: NarratorRunReceiptV1,
  ordinal: number,
  side: NarratorBlindSide,
): Omit<NarratorBlindSheetItemV1, "schemaVersion" | "ordinal" | "caseId" | "prompt"> {
  const row = runReceipt.rows[ordinal]!;
  const evaluationCase = narratorEvaluationCasesV1[ordinal]!;
  const valid = row.status === "ok" && row.safetyAccepted && row.outputText !== null;
  const resolution: NarratorBlindResolution = !valid
    ? "unrated-invalid"
    : row.outputText === evaluationCase.deterministicBaseline ? "auto-tie" : "rate";
  const modelText = valid ? row.outputText : null;
  const templateText = valid ? evaluationCase.deterministicBaseline : null;
  return {
    resolution,
    leftText: side === "left" ? modelText : templateText,
    rightText: side === "right" ? modelText : templateText,
  };
}

export function isNarratorBlindKeyV1(
  value: unknown,
  runReceipt: unknown,
  sheet: unknown,
): value is NarratorBlindKeyV1 {
  if (!isNarratorRecord(runReceipt)
    || !hashPattern.test(String(runReceipt.contentHash))
    || !isNarratorRecord(sheet)
    || !narratorHasExactKeys(sheet, [
      "schemaVersion", "sheetId", "runReceiptHash", "corpusHash", "answerKeySaltFingerprint", "items", "contentHash",
    ])
    || sheet.schemaVersion !== 1
    || !isNarratorBoundedText(sheet.sheetId, 200)
    || sheet.runReceiptHash !== runReceipt.contentHash
    || !hashPattern.test(String(sheet.answerKeySaltFingerprint))
    || !hashPattern.test(String(sheet.contentHash))
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["schemaVersion", "sheetHash", "runReceiptHash", "secretSalt", "items", "contentHash"])
    || value.schemaVersion !== 1
    || value.sheetHash !== sheet.contentHash
    || value.runReceiptHash !== runReceipt.contentHash
    || !isPrivateSalt(value.secretSalt)
    || !Array.isArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || !hashPattern.test(String(value.contentHash))) return false;
  const typedSheet = sheet as unknown as NarratorBlindSheetV1;
  const typedRunReceipt = runReceipt as unknown as NarratorRunReceiptV1;
  const secretSalt = value.secretSalt as string;
  if (saltFingerprint(typedSheet.sheetId, typedRunReceipt.contentHash, secretSalt)
    !== typedSheet.answerKeySaltFingerprint) return false;
  const assignments = modelSideAssignments(typedSheet.sheetId, typedRunReceipt.contentHash, secretSalt);
  if (!value.items.every((item, ordinal) => isNarratorRecord(item)
    && narratorHasExactKeys(item, ["ordinal", "caseId", "modelSide"])
    && item.ordinal === ordinal
    && item.caseId === narratorEvaluationCasesV1[ordinal]!.id
    && sides.includes(item.modelSide as NarratorBlindSide)
    && item.modelSide === assignments[ordinal])) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

export function isNarratorBlindSheetV1(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  key?: unknown,
): value is NarratorBlindSheetV1 {
  if (!isNarratorModelCandidateV1(candidate)
    || !isNarratorRunReceiptV1(runReceipt, candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "sheetId", "runReceiptHash", "corpusHash", "answerKeySaltFingerprint", "items", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorBoundedText(value.sheetId, 200)
    || value.runReceiptHash !== runReceipt.contentHash
    || value.corpusHash !== narratorEvaluationCorpusHashV1
    || !hashPattern.test(String(value.answerKeySaltFingerprint))
    || !Array.isArray(value.items)
    || value.items.length !== narratorEvaluationRequiredCases
    || !hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  if (contentHash !== canonicalHash(content)) return false;
  if (key === undefined || !isNarratorBlindKeyV1(key, runReceipt, value as unknown as NarratorBlindSheetV1)) return false;
  const typedKey = key as NarratorBlindKeyV1;
  return value.items.every((item, ordinal) => {
    if (!isNarratorRecord(item)
      || !narratorHasExactKeys(item, [
        "schemaVersion", "ordinal", "caseId", "prompt", "resolution", "leftText", "rightText",
      ])
      || item.schemaVersion !== 1
      || item.ordinal !== ordinal
      || item.caseId !== narratorEvaluationCasesV1[ordinal]!.id
      || !isNarratorPromptV1(item.prompt)
      || canonicalHash(item.prompt) !== canonicalHash(narratorEvaluationCasesV1[ordinal]!.prompt)
      || !resolutions.includes(item.resolution as NarratorBlindResolution)) return false;
    const expected = expectedSheetItem(runReceipt, ordinal, typedKey.items[ordinal]!.modelSide);
    return item.resolution === expected.resolution
      && item.leftText === expected.leftText
      && item.rightText === expected.rightText;
  });
}

export function createNarratorRatingBundleV1(
  sheet: NarratorBlindSheetV1,
  ratingRunId: string,
  raterId: string,
  selectedChoices: readonly NarratorBlindRatingChoice[],
): NarratorRatingBundleV1 {
  if (!isNarratorBoundedText(ratingRunId, 200) || !isNarratorBoundedText(raterId, 120)) {
    throw new TypeError("Narrator rating identity is invalid");
  }
  if (selectedChoices.length !== narratorEvaluationRequiredCases) throw new TypeError("Narrator ratings are incomplete");
  const ratings = sheet.items.map((item, ordinal) => {
    const choice = selectedChoices[ordinal]!;
    if (!choices.includes(choice)
      || (item.resolution === "unrated-invalid" && choice !== "unrated")
      || (item.resolution === "auto-tie" && choice !== "tie")
      || (item.resolution === "rate" && choice === "unrated")) {
      throw new TypeError("Narrator rating does not match blind item resolution");
    }
    return Object.freeze({ ordinal, caseId: item.caseId, choice });
  });
  const content = {
    schemaVersion: 1 as const,
    ratingRunId,
    sheetHash: sheet.contentHash,
    runReceiptHash: sheet.runReceiptHash,
    raterId,
    ratings: Object.freeze(ratings),
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRatingBundleV1(
  value: unknown,
  sheet: unknown,
): value is NarratorRatingBundleV1 {
  if (!isNarratorRecord(sheet)
    || !hashPattern.test(String(sheet.contentHash))
    || !hashPattern.test(String(sheet.runReceiptHash))
    || !Array.isArray(sheet.items)
    || sheet.items.length !== narratorEvaluationRequiredCases
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "ratingRunId", "sheetHash", "runReceiptHash", "raterId", "ratings", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorBoundedText(value.ratingRunId, 200)
    || value.sheetHash !== sheet.contentHash
    || value.runReceiptHash !== sheet.runReceiptHash
    || !isNarratorBoundedText(value.raterId, 120)
    || !Array.isArray(value.ratings)
    || value.ratings.length !== narratorEvaluationRequiredCases
    || !hashPattern.test(String(value.contentHash))) return false;
  if (!value.ratings.every((rating, ordinal) => {
    const item = (sheet.items as readonly NarratorBlindSheetItemV1[])[ordinal]!;
    return isNarratorRecord(item)
      && isNarratorRecord(rating)
      && narratorHasExactKeys(rating, ["ordinal", "caseId", "choice"])
      && rating.ordinal === ordinal
      && rating.caseId === item.caseId
      && choices.includes(rating.choice as NarratorBlindRatingChoice)
      && (item.resolution !== "unrated-invalid" || rating.choice === "unrated")
      && (item.resolution !== "auto-tie" || rating.choice === "tie")
      && (item.resolution !== "rate" || rating.choice !== "unrated");
  })) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

function permille(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.floor((numerator * 1_000) / denominator);
}

function wilsonLower(successes: number, trials: number): number {
  if (trials === 0) return 0;
  const z = 1.959963984540054;
  const proportion = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = proportion + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * trials)) / trials);
  return (centre - margin) / denominator;
}

function percentile95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

interface PreferenceCounts {
  modelWins: number;
  templateWins: number;
  ties: number;
  unrated: number;
}

function preferenceCounts(
  ordinals: readonly number[],
  sheet: NarratorBlindSheetV1,
  key: NarratorBlindKeyV1,
  ratings: NarratorRatingBundleV1,
): PreferenceCounts {
  const counts = { modelWins: 0, templateWins: 0, ties: 0, unrated: 0 };
  for (const ordinal of ordinals) {
    const choice = ratings.ratings[ordinal]!.choice;
    if (choice === "unrated") counts.unrated += 1;
    else if (choice === "tie" || sheet.items[ordinal]!.resolution === "auto-tie") counts.ties += 1;
    else if (choice === key.items[ordinal]!.modelSide) counts.modelWins += 1;
    else counts.templateWins += 1;
  }
  return counts;
}

function ratingConsumptionId(sheet: NarratorBlindSheetV1, ratings: NarratorRatingBundleV1): string {
  return canonicalHash({
    schemaVersion: 1,
    sheetHash: sheet.contentHash,
    raterId: ratings.raterId,
  });
}

function outputFatigue(runReceipt: NarratorRunReceiptV1): {
  repeatedBurstCount: number;
  maximumOutputFormRun: number;
  sequencesWithAtLeastTwoVariants: number;
} {
  let repeatedBurstCount = 0;
  let maximumOutputFormRun = 0;
  let currentRun = 0;
  let previous: string | null = null;
  let sequencesWithAtLeastTwoVariants = 0;
  for (let seed = 0; seed < 20; seed += 1) {
    const outputForms = runReceipt.rows.slice(seed * 10, seed * 10 + 10).map((row, offset) => {
      if (row.status !== "ok" || row.outputText === null) return null;
      const evaluationCase = narratorEvaluationCasesV1[seed * 10 + offset]!;
      const outputIndex = evaluationCase.allowedOutputs.indexOf(row.outputText);
      return outputIndex < 0 ? null : `${evaluationCase.prompt.move}:${outputIndex}`;
    });
    if (new Set(outputForms.filter((form): form is string => form !== null)).size >= 2) {
      sequencesWithAtLeastTwoVariants += 1;
    }
    for (let slot = 0; slot < outputForms.length; slot += 2) {
      if (outputForms[slot] !== null && outputForms[slot] === outputForms[slot + 1]) repeatedBurstCount += 1;
    }
    for (const form of outputForms) {
      if (form !== null && form === previous) currentRun += 1;
      else currentRun = form === null ? 0 : 1;
      previous = form;
      maximumOutputFormRun = Math.max(maximumOutputFormRun, currentRun);
    }
  }
  return { repeatedBurstCount, maximumOutputFormRun, sequencesWithAtLeastTwoVariants };
}

function reportWithHash(content: Omit<NarratorBenchmarkReportV1, "contentHash">): NarratorBenchmarkReportV1 {
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function evaluateNarratorBenchmarkV1(
  candidateValue: unknown,
  runReceiptValue: unknown,
  sheetValue: unknown,
  keyValue: unknown,
  ratingsValue: unknown,
  replayRegistryValue: unknown,
): NarratorBenchmarkReportV1 {
  const manifestBlockers = [...narratorCandidateManifestBlockers(candidateValue)];
  const deviceRequirementValues = new Set<NarratorV04_13b3Requirement>([
    "incremental-memory-unmeasured", "incremental-memory-budget-exceeded",
  ]);
  const candidateDeviceRequirements = manifestBlockers
    .filter((blocker) => deviceRequirementValues.has(blocker as NarratorV04_13b3Requirement))
    .map((blocker) => blocker as NarratorV04_13b3Requirement);
  const requiredInV04_13b3 = Object.freeze<NarratorV04_13b3Requirement[]>([
    "named-phone-memory-receipt",
    ...candidateDeviceRequirements,
  ]);
  const blockers: NarratorBenchmarkBlocker[] = manifestBlockers.filter((blocker) => !deviceRequirementValues.has(
    blocker as NarratorV04_13b3Requirement,
  ));
  const candidateValid = isNarratorModelCandidateV1(candidateValue);
  const candidate = candidateValid ? candidateValue : null;
  const candidateId = candidate?.candidateId ?? "invalid-candidate";
  const runValid = candidate !== null && isNarratorRunReceiptV1(runReceiptValue, candidate);
  if (!runValid) blockers.push("run-receipt-invalid");
  const runReceipt = runValid ? runReceiptValue : null;
  const provisionalSheet = isNarratorRecord(sheetValue) ? sheetValue as unknown as NarratorBlindSheetV1 : null;
  const keyValid = runReceipt !== null && provisionalSheet !== null
    && isNarratorBlindKeyV1(keyValue, runReceipt, provisionalSheet);
  if (!keyValid) blockers.push("blind-key-invalid");
  const sheetValid = candidate !== null && runReceipt !== null && keyValid
    && isNarratorBlindSheetV1(sheetValue, candidate, runReceipt, keyValue);
  if (!sheetValid) blockers.push("blind-sheet-invalid");
  const sheet = sheetValid ? sheetValue : null;
  const key = keyValid ? keyValue as NarratorBlindKeyV1 : null;
  const ratingsValid = sheet !== null && isNarratorRatingBundleV1(ratingsValue, sheet);
  if (!ratingsValid) blockers.push("rating-bundle-invalid");
  const ratings = ratingsValid ? ratingsValue : null;
  const replayRegistryValid = isNarratorRatingReplayRegistryV1(replayRegistryValue);
  if (!replayRegistryValid) blockers.push("rating-replay-registry-invalid");
  const replayRegistry = replayRegistryValid ? replayRegistryValue : null;
  const consumptionId = sheet !== null && ratings !== null ? ratingConsumptionId(sheet, ratings) : null;
  if (replayRegistry !== null && consumptionId !== null
    && replayRegistry.consumptionIds.includes(consumptionId)) blockers.push("rating-run-replayed");

  if (runReceipt === null || sheet === null || key === null || ratings === null) {
    const unique = Object.freeze([...new Set(blockers)]);
    return reportWithHash({
      schemaVersion: 1,
      candidateId,
      runReceiptHash: runReceipt?.contentHash ?? "invalid",
      ratingBundleHash: ratings?.contentHash ?? "invalid",
      replayRegistryHash: replayRegistry?.contentHash ?? "invalid",
      replayRegistryEpoch: replayRegistry?.epoch ?? 0,
      ratingConsumptionId: consumptionId ?? "invalid",
      requiredInV04_13b3,
      firstPassValidityPermille: 0,
      unsafeOutputCount: 0,
      acceptedKnowledgeViolations: 0,
      p95LatencyMilliseconds: null,
      modelWins: 0,
      templateWins: 0,
      ties: 0,
      unrated: narratorEvaluationRequiredCases,
      decisiveCount: 0,
      fullDenominatorScorePermille: 0,
      modelWinWilsonLowerPermille: 0,
      repeatedBurstCount: 0,
      maximumOutputFormRun: 0,
      sequencesWithAtLeastTwoVariants: 0,
      strata: Object.freeze([]),
      disposition: "blocked",
      blockers: unique,
      modelAdmitted: false,
    });
  }

  const validCount = runReceipt.rows.filter((row) => row.status === "ok").length;
  const unsafeOutputCount = runReceipt.rows.filter((row) => row.status === "output-policy-rejected").length;
  const acceptedKnowledgeViolations = runReceipt.rows.filter((row) =>
    row.status === "ok" && row.knowledgeViolationCount > 0).length;
  const ordinals = narratorEvaluationCasesV1.map((_, ordinal) => ordinal);
  const global = preferenceCounts(ordinals, sheet, key, ratings);
  const decisiveCount = global.modelWins + global.templateWins;
  const fullDenominatorScorePermille = permille(
    global.modelWins * 2 + global.ties,
    narratorEvaluationRequiredCases * 2,
  );
  const modelWinWilsonLowerPermille = Math.floor(wilsonLower(global.modelWins, decisiveCount) * 1_000);
  if (runReceipt.load.status !== "ok") blockers.push("run-load-not-ok");
  if (runReceipt.dispose.status !== "ok") blockers.push("run-dispose-not-ok");
  if (runReceipt.completedRowCount !== narratorEvaluationRequiredCases
    || runReceipt.rows.some((row) => row.status === "not-run" || row.status === "run-aborted")) {
    blockers.push("run-incomplete");
  }
  if (permille(validCount, narratorEvaluationRequiredCases) < 990) blockers.push("first-pass-validity-below-99-percent");
  if (acceptedKnowledgeViolations > 0) blockers.push("accepted-knowledge-violation");
  if (global.modelWins < 120) blockers.push("global-model-wins-below-120");
  if (fullDenominatorScorePermille < 600) blockers.push("global-score-below-60-percent");
  if (decisiveCount < 140) blockers.push("decisive-count-below-140");
  if (modelWinWilsonLowerPermille <= 500) blockers.push("model-win-confidence-not-above-50-percent");

  const stratumOrdinals = new Map<string, number[]>();
  for (const ordinal of ordinals) {
    const stratum = stratumOf(ordinal);
    const group = stratumOrdinals.get(stratum) ?? [];
    group.push(ordinal);
    stratumOrdinals.set(stratum, group);
  }
  const strata = [...stratumOrdinals.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([stratum, group]) => {
      const counts = preferenceCounts(group, sheet, key, ratings);
      const stratumValid = group.filter((ordinal) => runReceipt.rows[ordinal]!.status === "ok").length;
      const decisive = counts.modelWins + counts.templateWins;
      const score = permille(counts.modelWins * 2 + counts.ties, group.length * 2);
      if (permille(stratumValid, group.length) < 900) blockers.push("stratum-validity-below-90-percent");
      if (counts.modelWins * 2 < group.length) blockers.push("stratum-quality-below-50-percent");
      if (permille(decisive, group.length) < 600) blockers.push("stratum-decisive-below-60-percent");
      return Object.freeze({
        stratum,
        caseCount: group.length,
        validCount: stratumValid,
        ...counts,
        decisiveCount: decisive,
        fullDenominatorScorePermille: score,
      });
    });

  for (const voice of ["spare-observer-v1", "hero-aside-v1"] as const) {
    const group = ordinals.filter((ordinal) => narratorEvaluationCasesV1[ordinal]!.prompt.voice === voice);
    const counts = preferenceCounts(group, sheet, key, ratings);
    if (counts.modelWins * 1_000 < group.length * 550) blockers.push("voice-quality-below-55-percent");
    if (permille(counts.modelWins + counts.templateWins, group.length) < 650) blockers.push("voice-decisive-below-65-percent");
  }

  const fatigue = outputFatigue(runReceipt);
  if (fatigue.repeatedBurstCount > 0) blockers.push("repeated-line-inside-burst");
  if (fatigue.maximumOutputFormRun > 3) blockers.push("output-form-run-above-three");
  if (fatigue.sequencesWithAtLeastTwoVariants < 20) blockers.push("sequence-output-variants-below-two");
  const unique = Object.freeze([...new Set(blockers)]);
  return reportWithHash({
    schemaVersion: 1,
    candidateId,
    runReceiptHash: runReceipt.contentHash,
    ratingBundleHash: ratings.contentHash,
    replayRegistryHash: replayRegistry?.contentHash ?? "invalid",
    replayRegistryEpoch: replayRegistry?.epoch ?? 0,
    ratingConsumptionId: consumptionId ?? "invalid",
    requiredInV04_13b3,
    firstPassValidityPermille: permille(validCount, narratorEvaluationRequiredCases),
    unsafeOutputCount,
    acceptedKnowledgeViolations,
    p95LatencyMilliseconds: percentile95(runReceipt.rows
      .filter((row) => row.status === "ok")
      .map((row) => row.latencyMilliseconds)),
    ...global,
    decisiveCount,
    fullDenominatorScorePermille,
    modelWinWilsonLowerPermille,
    ...fatigue,
    strata: Object.freeze(strata),
    disposition: unique.length === 0 ? "advance-to-v04.13b3" : "blocked",
    blockers: unique,
    modelAdmitted: false,
  });
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isStratumMetrics(value: unknown): value is NarratorStratumMetricsV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "stratum", "caseCount", "validCount", "modelWins", "templateWins", "ties", "unrated",
      "decisiveCount", "fullDenominatorScorePermille",
    ])
    && isNarratorBoundedText(value.stratum, 120)
    && [
      value.caseCount, value.validCount, value.modelWins, value.templateWins, value.ties,
      value.unrated, value.decisiveCount, value.fullDenominatorScorePermille,
    ].every(isNonNegativeInteger)
    && Number(value.validCount) <= Number(value.caseCount)
    && Number(value.modelWins) + Number(value.templateWins) + Number(value.ties) + Number(value.unrated)
      === Number(value.caseCount)
    && Number(value.decisiveCount) === Number(value.modelWins) + Number(value.templateWins)
    && Number(value.fullDenominatorScorePermille) <= 1_000;
}

function isNarratorBenchmarkReportShapeV1(value: unknown): value is NarratorBenchmarkReportV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "candidateId", "runReceiptHash", "ratingBundleHash", "firstPassValidityPermille",
      "replayRegistryHash", "replayRegistryEpoch", "ratingConsumptionId",
      "requiredInV04_13b3",
      "unsafeOutputCount", "acceptedKnowledgeViolations", "p95LatencyMilliseconds", "modelWins",
      "templateWins", "ties", "unrated", "decisiveCount", "fullDenominatorScorePermille",
      "modelWinWilsonLowerPermille", "repeatedBurstCount", "maximumOutputFormRun",
      "sequencesWithAtLeastTwoVariants", "strata", "disposition", "blockers", "modelAdmitted", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorBoundedText(value.candidateId, 160)
    || !(value.runReceiptHash === "invalid" || hashPattern.test(String(value.runReceiptHash)))
    || !(value.ratingBundleHash === "invalid" || hashPattern.test(String(value.ratingBundleHash)))
    || !(value.replayRegistryHash === "invalid" || hashPattern.test(String(value.replayRegistryHash)))
    || !isNonNegativeInteger(value.replayRegistryEpoch)
    || !(value.ratingConsumptionId === "invalid" || hashPattern.test(String(value.ratingConsumptionId)))
    || !Array.isArray(value.requiredInV04_13b3)
    || value.requiredInV04_13b3.some((requirement) => ![
      "named-phone-memory-receipt", "incremental-memory-unmeasured", "incremental-memory-budget-exceeded",
    ].includes(String(requirement)))
    || new Set(value.requiredInV04_13b3).size !== value.requiredInV04_13b3.length
    || ![
      value.firstPassValidityPermille, value.unsafeOutputCount, value.acceptedKnowledgeViolations,
      value.modelWins, value.templateWins, value.ties, value.unrated, value.decisiveCount,
      value.fullDenominatorScorePermille, value.modelWinWilsonLowerPermille, value.repeatedBurstCount,
      value.maximumOutputFormRun, value.sequencesWithAtLeastTwoVariants,
    ].every(isNonNegativeInteger)
    || Number(value.firstPassValidityPermille) > 1_000
    || Number(value.fullDenominatorScorePermille) > 1_000
    || Number(value.modelWinWilsonLowerPermille) > 1_000
    || !(value.p95LatencyMilliseconds === null || isNonNegativeInteger(value.p95LatencyMilliseconds))
    || !Array.isArray(value.strata)
    || !value.strata.every(isStratumMetrics)
    || !["blocked", "advance-to-v04.13b3"].includes(String(value.disposition))
    || !Array.isArray(value.blockers)
    || !value.blockers.every((blocker) => benchmarkBlockerValues.includes(blocker as NarratorBenchmarkBlocker))
    || new Set(value.blockers).size !== value.blockers.length
    || value.modelAdmitted !== false
    || (value.disposition === "advance-to-v04.13b3" && value.blockers.length !== 0)
    || (value.disposition === "blocked" && value.blockers.length === 0)
    || !hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

export function isNarratorBenchmarkReportForEvidenceV1(
  value: unknown,
  candidate: unknown,
  runReceipt: unknown,
  sheet: unknown,
  key: unknown,
  ratings: unknown,
  replayRegistry: unknown,
): value is NarratorBenchmarkReportV1 {
  if (!isNarratorBenchmarkReportShapeV1(value)) return false;
  try {
    const expected = evaluateNarratorBenchmarkV1(
      candidate,
      runReceipt,
      sheet,
      key,
      ratings,
      replayRegistry,
    );
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

export function consumeNarratorBenchmarkReportV1(
  report: unknown,
  candidate: unknown,
  runReceipt: unknown,
  sheet: unknown,
  key: unknown,
  ratings: unknown,
  priorRegistry: unknown,
): NarratorRatingConsumptionReceiptV1 {
  if (!isNarratorRatingReplayRegistryV1(priorRegistry)
    || !isNarratorBenchmarkReportForEvidenceV1(
      report, candidate, runReceipt, sheet, key, ratings, priorRegistry,
    )
    || report.ratingConsumptionId === "invalid"
    || priorRegistry.consumptionIds.includes(report.ratingConsumptionId)) {
    throw new TypeError("Narrator benchmark report cannot be consumed");
  }
  const nextRegistry = createNarratorRatingReplayRegistryV1(
    [...priorRegistry.consumptionIds, report.ratingConsumptionId],
    priorRegistry.epoch + 1,
  );
  const content = {
    schemaVersion: 1 as const,
    reportHash: report.contentHash,
    ratingConsumptionId: report.ratingConsumptionId,
    priorRegistry,
    nextRegistry,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRatingConsumptionReceiptForEvidenceV1(
  value: unknown,
  report: unknown,
  candidate: unknown,
  runReceipt: unknown,
  sheet: unknown,
  key: unknown,
  ratings: unknown,
  currentRegistry: unknown,
): value is NarratorRatingConsumptionReceiptV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "reportHash", "ratingConsumptionId", "priorRegistry", "nextRegistry", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorRatingReplayRegistryV1(value.priorRegistry)
    || !isNarratorRatingReplayRegistryV1(value.nextRegistry)
    || !isNarratorRatingReplayRegistryV1(currentRegistry)
    || canonicalStringify(value.nextRegistry) !== canonicalStringify(currentRegistry)
    || !hashPattern.test(String(value.contentHash))) return false;
  try {
    const expected = consumeNarratorBenchmarkReportV1(
      report, candidate, runReceipt, sheet, key, ratings, value.priorRegistry,
    );
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}
