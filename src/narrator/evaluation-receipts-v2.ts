import { canonicalHash } from "../core/canonical";
import {
  isNarratorEvaluationRunSpecV2,
  isNarratorEvaluationWorkerBindingV2,
  type NarratorEvaluationRunSpecV2,
  type NarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1, narratorEvaluationRequiredCases } from "./evaluation";
import {
  accountNarratorGeneratedTokenIdsV2,
  countNarratorInputTokenIdsV2,
  normalizeNarratorDecodedOutputV2,
  type NarratorGeneratedTokenAccountingV2,
} from "./evaluation-prompt-contract";
import {
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import type { NarratorModelCandidate } from "./model-candidate";
import { isSafeAmbientNarration } from "./output-policy";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
} from "./protocol";

export type NarratorEvaluationLoadStatusV2 =
  | "ok"
  | "worker-binding-mismatch"
  | "artifact-evidence-invalid"
  | "artifact-mismatch"
  | "model-id-mismatch"
  | "load-error"
  | "load-timeout"
  | "device-lost"
  | "aborted";

export type NarratorEvaluationCaseStatusV2 =
  | "ok"
  | "not-run"
  | "run-aborted"
  | "prompt-format-error"
  | "input-tokenizer-error"
  | "input-token-contract-error"
  | "input-budget"
  | "generation-error"
  | "generated-token-contract-error"
  | "decode-error"
  | "normalization-error"
  | "output-policy-rejected"
  | "worker-call-error"
  | "worker-response-invalid"
  | "case-timeout"
  | "device-lost";

export type NarratorEvaluationDisposeStatusV2 = "not-attempted" | "ok" | "error" | "timeout" | "device-lost";
export type NarratorEvaluationTerminationStatusV2 = "not-requested" | "requested" | "request-error";
export type NarratorEvaluationLoadStageV2 =
  | "model-identity"
  | "handshake"
  | "artifact-verification"
  | "model-load";

export type NarratorVerifiedArtifactV2 = NarratorVerifiedArtifactV1;

export interface NarratorCaseReceiptV2 {
  readonly schemaVersion: 2;
  readonly runSpecHash: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly status: NarratorEvaluationCaseStatusV2;
  readonly inputTokenIds: readonly number[] | null;
  readonly inputTokens: number | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly outputTokens: number | null;
  readonly generationStopReason: "model-eos" | "maximum-new-tokens" | null;
  readonly outputText: string | null;
  readonly safetyAccepted: boolean;
  readonly knowledgeViolationCount: 0 | 1;
  readonly latencyMilliseconds: number;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorRunReceiptV2 {
  readonly schemaVersion: 2;
  readonly runSpec: NarratorEvaluationRunSpecV2;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV2 | null;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV2[];
  readonly load: {
    readonly stage: NarratorEvaluationLoadStageV2;
    readonly status: NarratorEvaluationLoadStatusV2;
    readonly latencyMilliseconds: number;
  };
  readonly rows: readonly NarratorCaseReceiptV2[];
  readonly dispose: {
    readonly status: NarratorEvaluationDisposeStatusV2;
    readonly latencyMilliseconds: number;
  };
  readonly termination: {
    readonly status: NarratorEvaluationTerminationStatusV2;
  };
  readonly completedRowCount: number;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface CaseReceiptFieldsV2 {
  readonly runSpecHash: string;
  readonly ordinal: number;
  readonly status: NarratorEvaluationCaseStatusV2;
  readonly inputTokenIds?: readonly number[] | null;
  readonly observedInputTokens?: number | null;
  readonly fullDecoderTokenIds?: readonly number[] | null;
  readonly outputText?: string | null;
  readonly latencyMilliseconds: number;
}

interface RunReceiptFieldsV2 {
  readonly runSpec: NarratorEvaluationRunSpecV2;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV2 | null;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV2[];
  readonly load: NarratorRunReceiptV2["load"];
  readonly rows: readonly NarratorCaseReceiptV2[];
  readonly dispose: NarratorRunReceiptV2["dispose"];
  readonly termination: NarratorRunReceiptV2["termination"];
}

const hashPattern = /^[0-9a-f]{16}$/u;
const loadStatuses: readonly NarratorEvaluationLoadStatusV2[] = [
  "ok", "worker-binding-mismatch", "artifact-evidence-invalid", "artifact-mismatch", "model-id-mismatch",
  "load-error", "load-timeout", "device-lost", "aborted",
];
const caseStatuses: readonly NarratorEvaluationCaseStatusV2[] = [
  "ok", "not-run", "run-aborted", "prompt-format-error", "input-tokenizer-error", "input-token-contract-error",
  "input-budget", "generation-error", "generated-token-contract-error", "decode-error", "normalization-error",
  "output-policy-rejected", "worker-call-error", "worker-response-invalid", "case-timeout", "device-lost",
];
const disposeStatuses: readonly NarratorEvaluationDisposeStatusV2[] = [
  "not-attempted", "ok", "error", "timeout", "device-lost",
];
const terminationStatuses: readonly NarratorEvaluationTerminationStatusV2[] = [
  "not-requested", "requested", "request-error",
];
const loadStages: readonly NarratorEvaluationLoadStageV2[] = [
  "model-identity", "handshake", "artifact-verification", "model-load",
];
const noEvidenceStatuses = new Set<NarratorEvaluationCaseStatusV2>([
  "not-run", "run-aborted", "prompt-format-error", "input-tokenizer-error", "worker-call-error",
  "worker-response-invalid", "case-timeout", "device-lost",
]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function boundedTokenIds(value: unknown, maximumLength: number): value is readonly number[] {
  if (!Array.isArray(value) || value.length > maximumLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)
      || !Number.isSafeInteger(value[index])
      || Number(value[index]) < 0) return false;
  }
  return true;
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

export function isNarratorVerifiedArtifactsV2(
  value: unknown,
): value is readonly NarratorVerifiedArtifactV2[] {
  return isDenseArray(value) && isNarratorVerifiedArtifactsV1(value);
}

function inputTokenCount(value: readonly number[] | null): number | null {
  if (value === null) return null;
  try {
    return countNarratorInputTokenIdsV2(value);
  } catch {
    return null;
  }
}

function generatedAccounting(value: readonly number[] | null): NarratorGeneratedTokenAccountingV2 | null {
  if (value === null) return null;
  try {
    return accountNarratorGeneratedTokenIdsV2(value);
  } catch {
    return null;
  }
}

function rowShapeIsValid(row: NarratorCaseReceiptV2): boolean {
  const inputCount = inputTokenCount(row.inputTokenIds);
  const generated = generatedAccounting(row.fullDecoderTokenIds);
  const noInput = row.inputTokenIds === null && row.inputTokens === null;
  const noGeneration = row.fullDecoderTokenIds === null
    && row.outputTokens === null
    && row.generationStopReason === null;
  const noOutput = row.outputText === null && !row.safetyAccepted && row.knowledgeViolationCount === 0;
  if (noEvidenceStatuses.has(row.status)) return noInput && noGeneration && noOutput;
  if (row.status === "input-budget") {
    return row.inputTokenIds === null
      && Number.isSafeInteger(row.inputTokens)
      && Number(row.inputTokens) > narratorMaximumInputTokens
      && noGeneration
      && noOutput;
  }
  if (row.status === "input-token-contract-error") {
    return row.inputTokenIds !== null && inputCount === null && row.inputTokens === null && noGeneration && noOutput;
  }
  if (inputCount === null || row.inputTokens !== inputCount) return false;
  if (row.status === "generation-error") return noGeneration && noOutput;
  if (row.status === "generated-token-contract-error") {
    return row.outputTokens === null
      && row.generationStopReason === null
      && row.outputText === null
      && !row.safetyAccepted
      && row.knowledgeViolationCount === 0
      && (row.fullDecoderTokenIds === null || generated === null);
  }
  if (generated === null
    || row.outputTokens !== generated.outputTokens
    || row.generationStopReason !== generated.stopReason) return false;
  if (row.status === "decode-error" || row.status === "normalization-error") return noOutput;
  if (row.outputText === null) return false;
  const safe = isSafeAmbientNarration(row.outputText, narratorEvaluationCasesV1[row.ordinal]!.prompt);
  if (row.safetyAccepted !== safe || row.knowledgeViolationCount !== (safe ? 0 : 1)) return false;
  return row.status === "ok" ? safe : row.status === "output-policy-rejected" && !safe;
}

export function createNarratorCaseReceiptV2(fields: CaseReceiptFieldsV2): NarratorCaseReceiptV2 {
  const evaluationCase = narratorEvaluationCasesV1[fields.ordinal];
  if (evaluationCase === undefined) throw new RangeError("Narrator evaluation ordinal is invalid");
  const inputTokenIds = fields.inputTokenIds === undefined || fields.inputTokenIds === null
    ? null
    : Object.freeze([...fields.inputTokenIds]);
  const fullDecoderTokenIds = fields.fullDecoderTokenIds === undefined || fields.fullDecoderTokenIds === null
    ? null
    : Object.freeze([...fields.fullDecoderTokenIds]);
  if (!boundedTokenIds(inputTokenIds ?? [], narratorMaximumInputTokens)
    || fullDecoderTokenIds !== null && !boundedTokenIds(fullDecoderTokenIds, 49)) {
    throw new TypeError("Narrator V2 receipt token evidence is invalid");
  }
  const accountedInputTokens = inputTokenCount(inputTokenIds);
  const inputTokens = fields.status === "input-budget"
    ? fields.observedInputTokens ?? null
    : accountedInputTokens;
  const generated = generatedAccounting(fullDecoderTokenIds);
  const outputText = fields.outputText === undefined || fields.outputText === null
    ? null
    : normalizeNarratorDecodedOutputV2(fields.outputText);
  const safetyAccepted = outputText !== null && isSafeAmbientNarration(outputText, evaluationCase.prompt);
  const content = {
    schemaVersion: 2 as const,
    runSpecHash: fields.runSpecHash,
    ordinal: fields.ordinal,
    caseId: evaluationCase.id,
    caseHash: canonicalHash(evaluationCase),
    status: fields.status,
    inputTokenIds,
    inputTokens,
    fullDecoderTokenIds,
    outputTokens: generated?.outputTokens ?? null,
    generationStopReason: generated?.stopReason ?? null,
    outputText,
    safetyAccepted,
    knowledgeViolationCount: (outputText === null || safetyAccepted ? 0 : 1) as 0 | 1,
    latencyMilliseconds: Math.max(0, Math.floor(fields.latencyMilliseconds)),
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const receipt = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!caseReceiptIsValid(receipt, fields.runSpecHash, fields.ordinal)) {
    throw new TypeError("Narrator V2 case receipt is invalid");
  }
  return receipt;
}

function caseReceiptIsValid(
  value: unknown,
  runSpecHash: string,
  ordinal: number,
): value is NarratorCaseReceiptV2 {
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runSpecHash", "ordinal", "caseId", "caseHash", "status", "inputTokenIds", "inputTokens",
      "fullDecoderTokenIds", "outputTokens", "generationStopReason", "outputText", "safetyAccepted",
      "knowledgeViolationCount", "latencyMilliseconds", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || value.runSpecHash !== runSpecHash
    || value.ordinal !== ordinal
    || value.caseId !== evaluationCase.id
    || value.caseHash !== canonicalHash(evaluationCase)
    || !caseStatuses.includes(value.status as NarratorEvaluationCaseStatusV2)
    || !(value.inputTokenIds === null || boundedTokenIds(value.inputTokenIds, narratorMaximumInputTokens))
    || !(value.inputTokens === null || nonNegativeInteger(value.inputTokens))
    || !(value.fullDecoderTokenIds === null || boundedTokenIds(value.fullDecoderTokenIds, 49))
    || !(value.outputTokens === null || nonNegativeInteger(value.outputTokens))
    || ![null, "model-eos", "maximum-new-tokens"].includes(value.generationStopReason as string | null)
    || !(value.outputText === null || normalizeNarratorDecodedOutputV2(value.outputText) === value.outputText)
    || typeof value.safetyAccepted !== "boolean"
    || ![0, 1].includes(Number(value.knowledgeViolationCount))
    || !nonNegativeInteger(value.latencyMilliseconds)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hashPattern.test(String(value.contentHash))) return false;
  if (!rowShapeIsValid(value as unknown as NarratorCaseReceiptV2)) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

export function isNarratorCaseReceiptV2(
  value: unknown,
  runSpec: NarratorEvaluationRunSpecV2,
  ordinal: number,
): value is NarratorCaseReceiptV2 {
  return caseReceiptIsValid(value, runSpec.contentHash, ordinal);
}

export function createNarratorRunReceiptV2(fields: RunReceiptFieldsV2): NarratorRunReceiptV2 {
  const workerBinding = fields.workerBinding === null ? null : { ...fields.workerBinding };
  const verifiedArtifacts = fields.verifiedArtifacts
    .map((artifact) => Object.freeze({ ...artifact }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const content = {
    schemaVersion: 2 as const,
    runSpec: fields.runSpec,
    workerEpoch: fields.workerEpoch,
    workerBinding,
    verifiedArtifacts: Object.freeze(verifiedArtifacts),
    load: Object.freeze({ ...fields.load }),
    rows: Object.freeze([...fields.rows]),
    dispose: Object.freeze({ ...fields.dispose }),
    termination: Object.freeze({ ...fields.termination }),
    completedRowCount: fields.rows.filter((row) => row.status !== "not-run").length,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRunReceiptV2(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorRunReceiptV2 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runSpec", "workerEpoch", "workerBinding", "verifiedArtifacts", "load", "rows", "dispose",
      "termination", "completedRowCount", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || !isNarratorEvaluationRunSpecV2(value.runSpec, candidate)
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !(value.workerBinding === null
      || isNarratorEvaluationWorkerBindingV2(value.workerBinding, value.runSpec, candidate))
    || !isNarratorVerifiedArtifactsV2(value.verifiedArtifacts)
    || !isNarratorRecord(value.load)
    || !narratorHasExactKeys(value.load, ["stage", "status", "latencyMilliseconds"])
    || !loadStages.includes(value.load.stage as NarratorEvaluationLoadStageV2)
    || !loadStatuses.includes(value.load.status as NarratorEvaluationLoadStatusV2)
    || !nonNegativeInteger(value.load.latencyMilliseconds)
    || !isDenseArray(value.rows)
    || value.rows.length !== narratorEvaluationRequiredCases
    || !value.rows.every((row, ordinal) => caseReceiptIsValid(
      row,
      (value.runSpec as unknown as NarratorEvaluationRunSpecV2).contentHash,
      ordinal,
    ))
    || !isNarratorRecord(value.dispose)
    || !narratorHasExactKeys(value.dispose, ["status", "latencyMilliseconds"])
    || !disposeStatuses.includes(value.dispose.status as NarratorEvaluationDisposeStatusV2)
    || !nonNegativeInteger(value.dispose.latencyMilliseconds)
    || !isNarratorRecord(value.termination)
    || !narratorHasExactKeys(value.termination, ["status"])
    || !terminationStatuses.includes(value.termination.status as NarratorEvaluationTerminationStatusV2)
    || !nonNegativeInteger(value.completedRowCount)
    || value.completedRowCount !== value.rows.filter((row) => isNarratorRecord(row) && row.status !== "not-run").length
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hashPattern.test(String(value.contentHash))) return false;
  const runSpec = value.runSpec as unknown as NarratorEvaluationRunSpecV2;
  const loadStage = value.load.stage as NarratorEvaluationLoadStageV2;
  const loadStatus = value.load.status as NarratorEvaluationLoadStatusV2;
  const disposeStatus = value.dispose.status as NarratorEvaluationDisposeStatusV2;
  const terminationStatus = value.termination.status as NarratorEvaluationTerminationStatusV2;
  const rows = value.rows as NarratorCaseReceiptV2[];
  const artifactsMatch = narratorArtifactsMatchCandidate(value.verifiedArtifacts, candidate);
  const bindingMatches = isNarratorEvaluationWorkerBindingV2(value.workerBinding, runSpec, candidate);
  const terminalStatuses = new Set<NarratorEvaluationCaseStatusV2>([
    "run-aborted", "worker-call-error", "worker-response-invalid", "case-timeout", "device-lost",
  ]);
  if (loadStatus === "ok") {
    if (loadStage !== "model-load" || !bindingMatches || !artifactsMatch) return false;
    let terminalSeen = false;
    for (const row of rows) {
      if (terminalSeen) {
        if (row.status !== "not-run") return false;
        continue;
      }
      if (row.status === "not-run") return false;
      if (terminalStatuses.has(row.status)) terminalSeen = true;
    }
    if (terminalSeen) {
      if (disposeStatus !== "not-attempted" || terminationStatus === "not-requested") return false;
    } else if (disposeStatus === "not-attempted"
      || (disposeStatus === "ok" && terminationStatus !== "not-requested")
      || (disposeStatus !== "ok" && terminationStatus === "not-requested")) return false;
  } else {
    if (loadStatus === "artifact-mismatch" && artifactsMatch) return false;
    if (loadStage === "model-identity") {
      if (loadStatus !== "model-id-mismatch"
        || value.workerBinding !== null
        || value.verifiedArtifacts.length !== 0) return false;
    } else if (loadStage === "handshake") {
      if (value.workerBinding !== null
        || value.verifiedArtifacts.length !== 0
        || !["worker-binding-mismatch", "load-error", "load-timeout", "device-lost", "aborted"].includes(loadStatus)) {
        return false;
      }
    } else if (loadStage === "artifact-verification") {
      if (!bindingMatches
        || !["artifact-evidence-invalid", "artifact-mismatch", "load-error", "load-timeout", "device-lost", "aborted"].includes(loadStatus)) {
        return false;
      }
      if (loadStatus === "artifact-mismatch") {
        if (artifactsMatch) return false;
      } else if (value.verifiedArtifacts.length !== 0) return false;
    } else if (loadStage === "model-load") {
      if (!bindingMatches
        || !artifactsMatch
        || !["load-error", "load-timeout", "device-lost", "aborted"].includes(loadStatus)) return false;
    }
    const abortShape = loadStatus === "aborted"
      && rows[0]?.status === "run-aborted"
      && rows.slice(1).every((row) => row.status === "not-run");
    const notRunShape = rows.every((row) => row.status === "not-run");
    if (!(abortShape || (loadStatus !== "aborted" && notRunShape))) return false;
    const requiresTermination = [
      "worker-binding-mismatch", "artifact-evidence-invalid", "artifact-mismatch", "model-id-mismatch",
      "load-timeout", "device-lost", "aborted",
    ].includes(loadStatus);
    if (requiresTermination) {
      if (disposeStatus !== "not-attempted" || terminationStatus === "not-requested") return false;
    } else if (disposeStatus === "not-attempted"
      || (disposeStatus === "ok" && terminationStatus !== "not-requested")
      || (disposeStatus !== "ok" && terminationStatus === "not-requested")) return false;
  }
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}
