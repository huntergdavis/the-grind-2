import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  createNarratorEvaluationWorkerBindingV3,
  isNarratorEvaluationRunSpecV3,
  isNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
  type NarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationRunReceiptContractHashV3,
  narratorEvaluationRunnerSequencingContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import { narratorEvaluationCasesV1, narratorEvaluationRequiredCases } from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  isSafeRenderedNarrationV3,
  narratorFormPromptBytesHashV3,
  renderNarratorFormV3,
  validateNarratorFormSelectionV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionV3,
} from "./evaluation-selection-contract-v3";
import {
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import {
  isNarratorEvaluationWorkerCaseRequestV3,
  isNarratorEvaluationWorkerCaseResponseForRequestV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerOutcomeV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

export type NarratorEvaluationLoadStatusV3 =
  | "ok"
  | "worker-binding-mismatch"
  | "artifact-evidence-invalid"
  | "artifact-mismatch"
  | "model-id-mismatch"
  | "load-error"
  | "load-timeout"
  | "device-lost"
  | "aborted";

export type NarratorEvaluationCaseStatusV3 =
  | "ok"
  | "not-run"
  | "run-aborted"
  | "prompt-format-error"
  | "input-tokenizer-error"
  | "input-token-contract-error"
  | "input-budget"
  | "target-tokenizer-error"
  | "target-token-contract-error"
  | "generation-error"
  | "selection-contract-error"
  | "worker-call-error"
  | "worker-response-invalid"
  | "case-timeout"
  | "device-lost";

export type NarratorEvaluationDisposeStatusV3 = "not-attempted" | "ok" | "error" | "timeout" | "device-lost";
export type NarratorEvaluationTerminationStatusV3 = "not-requested" | "requested" | "request-error";
export type NarratorEvaluationLoadStageV3 =
  | "model-identity"
  | "handshake"
  | "artifact-verification"
  | "model-load";

interface NarratorCaseReceiptCommonV3 {
  readonly schemaVersion: 3;
  readonly caseReceiptContractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly promptBytesHash: string;
  readonly requestHash: string | null;
  readonly workerResponseHash: string | null;
  readonly latencyMilliseconds: number;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorSuccessfulCaseReceiptV3 extends NarratorCaseReceiptCommonV3 {
  readonly status: "ok";
  readonly request: NarratorEvaluationWorkerCaseRequestV3;
  readonly response: NarratorEvaluationWorkerCaseResponseV3;
  readonly selection: NarratorFormSelectionV3;
  readonly selectedFormId: NarratorFormIdV3;
  readonly renderedText: string;
  readonly safetyAccepted: true;
  readonly knowledgeViolationCount: 0;
}

export interface NarratorUnsuccessfulCaseReceiptV3 extends NarratorCaseReceiptCommonV3 {
  readonly status: Exclude<NarratorEvaluationCaseStatusV3, "ok">;
  readonly request: NarratorEvaluationWorkerCaseRequestV3 | null;
  readonly response: NarratorEvaluationWorkerCaseResponseV3 | null;
  readonly selection: null;
  readonly selectedFormId: null;
  readonly renderedText: null;
  readonly safetyAccepted: false;
  readonly knowledgeViolationCount: 0;
}

export type NarratorCaseReceiptV3 = NarratorSuccessfulCaseReceiptV3 | NarratorUnsuccessfulCaseReceiptV3;

export interface NarratorRunReceiptV3 {
  readonly schemaVersion: 3;
  readonly runReceiptContractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly runnerSequencingContractHash: string;
  readonly runSpec: NarratorEvaluationRunSpecV3;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV3 | null;
  readonly workerBindingHash: string | null;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly verifiedArtifactsHash: string;
  readonly load: {
    readonly stage: NarratorEvaluationLoadStageV3;
    readonly status: NarratorEvaluationLoadStatusV3;
    readonly latencyMilliseconds: number;
  };
  readonly rows: readonly NarratorCaseReceiptV3[];
  readonly rowsHash: string;
  readonly dispose: {
    readonly status: NarratorEvaluationDisposeStatusV3;
    readonly latencyMilliseconds: number;
  };
  readonly termination: {
    readonly status: NarratorEvaluationTerminationStatusV3;
  };
  readonly completedRowCount: number;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorCaseReceiptFieldsV3 {
  readonly ordinal: number;
  readonly status: NarratorEvaluationCaseStatusV3;
  readonly request: NarratorEvaluationWorkerCaseRequestV3 | null;
  readonly response: NarratorEvaluationWorkerCaseResponseV3 | null;
  readonly latencyMilliseconds: number;
}

export interface NarratorRunReceiptFieldsV3 {
  readonly runSpec: NarratorEvaluationRunSpecV3;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV3 | null;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly load: NarratorRunReceiptV3["load"];
  readonly rows: readonly NarratorCaseReceiptV3[];
  readonly dispose: NarratorRunReceiptV3["dispose"];
  readonly termination: NarratorRunReceiptV3["termination"];
}

const hashPattern = /^[0-9a-f]{16}$/u;
const loadStatuses: readonly NarratorEvaluationLoadStatusV3[] = Object.freeze([
  "ok", "worker-binding-mismatch", "artifact-evidence-invalid", "artifact-mismatch", "model-id-mismatch",
  "load-error", "load-timeout", "device-lost", "aborted",
]);
const caseStatuses: readonly NarratorEvaluationCaseStatusV3[] = Object.freeze([
  "ok", "not-run", "run-aborted", "prompt-format-error", "input-tokenizer-error", "input-token-contract-error",
  "input-budget", "target-tokenizer-error", "target-token-contract-error", "generation-error",
  "selection-contract-error", "worker-call-error", "worker-response-invalid",
  "case-timeout", "device-lost",
]);
const disposeStatuses: readonly NarratorEvaluationDisposeStatusV3[] = Object.freeze([
  "not-attempted", "ok", "error", "timeout", "device-lost",
]);
const terminationStatuses: readonly NarratorEvaluationTerminationStatusV3[] = Object.freeze([
  "not-requested", "requested", "request-error",
]);
const loadStages: readonly NarratorEvaluationLoadStageV3[] = Object.freeze([
  "model-identity", "handshake", "artifact-verification", "model-load",
]);
const responseOutcomeStatus = Object.freeze({
  selected: "ok",
  "prompt-format-error": "prompt-format-error",
  "input-tokenizer-error": "input-tokenizer-error",
  "input-token-contract-error": "input-token-contract-error",
  "input-budget": "input-budget",
  "target-tokenizer-error": "target-tokenizer-error",
  "target-token-contract-error": "target-token-contract-error",
  "generation-error": "generation-error",
  "selection-contract-error": "selection-contract-error",
} satisfies Record<NarratorEvaluationWorkerOutcomeV3, NarratorEvaluationCaseStatusV3>);
const responseAbsentStatuses = new Set<NarratorEvaluationCaseStatusV3>([
  "not-run", "run-aborted", "worker-call-error", "worker-response-invalid", "case-timeout", "device-lost",
]);
const terminalCaseStatuses = new Set<NarratorEvaluationCaseStatusV3>([
  "run-aborted", "worker-call-error", "worker-response-invalid", "case-timeout", "device-lost",
]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validContentHash(value: Record<string, unknown>): boolean {
  if (!hashPattern.test(String(value.contentHash))) return false;
  try {
    const { contentHash, ...content } = value;
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function expectedWorkerBindingHash(
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
): string {
  return canonicalHash(createNarratorEvaluationWorkerBindingV3(runSpec, candidate));
}

function successfulDerivation(
  request: NarratorEvaluationWorkerCaseRequestV3,
  response: NarratorEvaluationWorkerCaseResponseV3,
): { readonly selection: NarratorFormSelectionV3; readonly selectedFormId: NarratorFormIdV3; readonly renderedText: string } {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  if (response.outcome !== "selected" || response.targetObservations === null
    || response.fullDecoderTokenIds === null || response.selectionTrace === null) {
    throw new TypeError("Narrator V3 successful receipt lacks complete selection evidence");
  }
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    response.targetObservations,
  );
  const selection = validateNarratorFormSelectionV3(
    evaluationCase.prompt,
    request.eligibility,
    response.fullDecoderTokenIds,
    response.selectionTrace,
    targetSet,
  );
  const renderedText = renderNarratorFormV3(evaluationCase.prompt, selection.selectedFormId);
  if (!isSafeRenderedNarrationV3(renderedText, evaluationCase.prompt)) {
    throw new TypeError("Narrator V3 host rendering is unsafe");
  }
  return { selection, selectedFormId: selection.selectedFormId, renderedText };
}

function transcriptMatchesStatus(
  status: NarratorEvaluationCaseStatusV3,
  request: NarratorEvaluationWorkerCaseRequestV3 | null,
  response: NarratorEvaluationWorkerCaseResponseV3 | null,
): boolean {
  if (request === null) return response === null && (status === "not-run" || status === "run-aborted");
  if (response === null) return responseAbsentStatuses.has(status) && status !== "not-run";
  return responseOutcomeStatus[response.outcome] === status;
}

export function createNarratorCaseReceiptV3(
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
  priorSelectedFormId: NarratorFormIdV3 | null,
  priorWorkerResponseHash: string | null,
  fields: NarratorCaseReceiptFieldsV3,
): NarratorCaseReceiptV3 {
  if (!isNarratorEvaluationRunSpecV3(runSpec, candidate)
    || !caseStatuses.includes(fields.status)
    || !Number.isSafeInteger(fields.ordinal)
    || !Number.isFinite(fields.latencyMilliseconds)
    || !transcriptMatchesStatus(fields.status, fields.request, fields.response)) {
    throw new TypeError("Narrator V3 case receipt fields are invalid");
  }
  const evaluationCase = narratorEvaluationCasesV1[fields.ordinal];
  if (evaluationCase === undefined) throw new RangeError("Narrator evaluation ordinal is invalid");
  if (fields.request !== null && !isNarratorEvaluationWorkerCaseRequestV3(
    fields.request,
    runSpec,
    candidate,
    priorSelectedFormId,
    priorWorkerResponseHash,
  )) {
    throw new TypeError("Narrator V3 case receipt request is invalid");
  }
  if (fields.response !== null && (fields.request === null
    || !isNarratorEvaluationWorkerCaseResponseForRequestV3(fields.response, fields.request))) {
    throw new TypeError("Narrator V3 case receipt response is invalid");
  }
  const derived = fields.status === "ok"
    ? successfulDerivation(fields.request!, fields.response!)
    : null;
  const request = fields.request === null ? null : cloneAndFreeze(fields.request);
  const response = fields.response === null ? null : cloneAndFreeze(fields.response);
  const content = {
    schemaVersion: 3 as const,
    caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    runSpecHash: runSpec.contentHash,
    workerBindingHash: expectedWorkerBindingHash(runSpec, candidate),
    ordinal: fields.ordinal,
    caseId: evaluationCase.id,
    caseHash: canonicalHash(evaluationCase),
    promptBytesHash: narratorFormPromptBytesHashV3(evaluationCase.prompt),
    status: fields.status,
    request,
    response,
    requestHash: request?.contentHash ?? null,
    workerResponseHash: response?.contentHash ?? null,
    selection: derived?.selection ?? null,
    selectedFormId: derived?.selectedFormId ?? null,
    renderedText: derived?.renderedText ?? null,
    safetyAccepted: derived !== null,
    knowledgeViolationCount: 0 as const,
    latencyMilliseconds: Math.max(0, Math.floor(fields.latencyMilliseconds)),
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) }) as NarratorCaseReceiptV3;
}

export function isNarratorCaseReceiptV3(
  value: unknown,
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
  ordinal: number,
  priorSelectedFormId: NarratorFormIdV3 | null,
  priorWorkerResponseHash: string | null,
): value is NarratorCaseReceiptV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "caseReceiptContractHash", "evidenceContractHash", "protocolContractHash", "runSpecHash",
      "workerBindingHash", "ordinal", "caseId", "caseHash", "promptBytesHash", "status", "request", "response",
      "requestHash", "workerResponseHash", "selection", "selectedFormId", "renderedText", "safetyAccepted",
      "knowledgeViolationCount", "latencyMilliseconds", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || value.ordinal !== ordinal
    || !caseStatuses.includes(value.status as NarratorEvaluationCaseStatusV3)
    || !nonNegativeInteger(value.latencyMilliseconds)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !validContentHash(value)) return false;
  try {
    const expected = createNarratorCaseReceiptV3(
      runSpec,
      candidate,
      priorSelectedFormId,
      priorWorkerResponseHash,
      {
        ordinal,
        status: value.status as NarratorEvaluationCaseStatusV3,
        request: value.request as NarratorEvaluationWorkerCaseRequestV3 | null,
        response: value.response as NarratorEvaluationWorkerCaseResponseV3 | null,
        latencyMilliseconds: Number(value.latencyMilliseconds),
      },
    );
    return exactCanonical(value, expected);
  } catch {
    return false;
  }
}

export function createNarratorRunReceiptV3(fields: NarratorRunReceiptFieldsV3): NarratorRunReceiptV3 {
  const workerBinding = fields.workerBinding === null ? null : cloneAndFreeze(fields.workerBinding);
  const verifiedArtifacts = fields.verifiedArtifacts
    .map((artifact) => Object.freeze({ ...artifact }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const rows = Object.freeze([...fields.rows]);
  const content = {
    schemaVersion: 3 as const,
    runReceiptContractHash: narratorEvaluationRunReceiptContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    runnerSequencingContractHash: narratorEvaluationRunnerSequencingContractHashV3,
    runSpec: cloneAndFreeze(fields.runSpec),
    workerEpoch: fields.workerEpoch,
    workerBinding,
    workerBindingHash: workerBinding === null ? null : canonicalHash(workerBinding),
    verifiedArtifacts: Object.freeze(verifiedArtifacts),
    verifiedArtifactsHash: canonicalHash(verifiedArtifacts),
    load: Object.freeze({ ...fields.load }),
    rows,
    rowsHash: canonicalHash(rows.map((row) => row.contentHash)),
    dispose: Object.freeze({ ...fields.dispose }),
    termination: Object.freeze({ ...fields.termination }),
    completedRowCount: rows.filter((row) => row.status !== "not-run").length,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRunReceiptV3(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorRunReceiptV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runReceiptContractHash", "evidenceContractHash", "protocolContractHash",
      "runnerSequencingContractHash", "runSpec", "workerEpoch", "workerBinding", "workerBindingHash",
      "verifiedArtifacts", "verifiedArtifactsHash", "load", "rows", "rowsHash", "dispose", "termination",
      "completedRowCount", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || value.runReceiptContractHash !== narratorEvaluationRunReceiptContractHashV3
    || value.evidenceContractHash !== narratorEvaluationEvidenceContractHashV3
    || value.protocolContractHash !== narratorEvaluationWorkerProtocolContractHashV3
    || value.runnerSequencingContractHash !== narratorEvaluationRunnerSequencingContractHashV3
    || !isNarratorEvaluationRunSpecV3(value.runSpec, candidate)
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !(value.workerBinding === null
      || isNarratorEvaluationWorkerBindingV3(value.workerBinding, value.runSpec, candidate))
    || value.workerBindingHash !== (value.workerBinding === null ? null : canonicalHash(value.workerBinding))
    || !isDenseArray(value.verifiedArtifacts)
    || !isNarratorVerifiedArtifactsV1(value.verifiedArtifacts)
    || value.verifiedArtifactsHash !== canonicalHash(value.verifiedArtifacts)
    || !isNarratorRecord(value.load)
    || !narratorHasExactKeys(value.load, ["stage", "status", "latencyMilliseconds"])
    || !loadStages.includes(value.load.stage as NarratorEvaluationLoadStageV3)
    || !loadStatuses.includes(value.load.status as NarratorEvaluationLoadStatusV3)
    || !nonNegativeInteger(value.load.latencyMilliseconds)
    || !isDenseArray(value.rows)
    || value.rows.length !== narratorEvaluationRequiredCases
    || value.rowsHash !== canonicalHash((value.rows as unknown[]).map((row) =>
      isNarratorRecord(row) ? row.contentHash : null))
    || !isNarratorRecord(value.dispose)
    || !narratorHasExactKeys(value.dispose, ["status", "latencyMilliseconds"])
    || !disposeStatuses.includes(value.dispose.status as NarratorEvaluationDisposeStatusV3)
    || !nonNegativeInteger(value.dispose.latencyMilliseconds)
    || !isNarratorRecord(value.termination)
    || !narratorHasExactKeys(value.termination, ["status"])
    || !terminationStatuses.includes(value.termination.status as NarratorEvaluationTerminationStatusV3)
    || !nonNegativeInteger(value.completedRowCount)
    || value.completedRowCount !== (value.rows as unknown[]).filter((row) =>
      isNarratorRecord(row) && row.status !== "not-run").length
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !validContentHash(value)) return false;

  const runSpec = value.runSpec as unknown as NarratorEvaluationRunSpecV3;
  const rows = value.rows as unknown as NarratorCaseReceiptV3[];
  let priorWorkerResponseHash: string | null = null;
  let terminalSeen = false;
  for (let ordinal = 0; ordinal < rows.length; ordinal += 1) {
    const priorSelectedFormId = ordinal % 2 === 1 && rows[ordinal - 1]?.status === "ok"
      ? rows[ordinal - 1]!.selectedFormId
      : null;
    const row = rows[ordinal];
    if (!isNarratorCaseReceiptV3(
      row,
      runSpec,
      candidate,
      ordinal,
      priorSelectedFormId,
      priorWorkerResponseHash,
    )) return false;
    if (row.request !== null && row.request.workerEpoch !== value.workerEpoch) return false;
    if (row.response !== null) priorWorkerResponseHash = row.response.contentHash;
    if (terminalSeen) {
      if (row.status !== "not-run") return false;
      continue;
    }
    if (row.status === "not-run" && value.load.status === "ok") return false;
    if (terminalCaseStatuses.has(row.status)) terminalSeen = true;
  }

  const loadStage = value.load.stage as NarratorEvaluationLoadStageV3;
  const loadStatus = value.load.status as NarratorEvaluationLoadStatusV3;
  const disposeStatus = value.dispose.status as NarratorEvaluationDisposeStatusV3;
  const terminationStatus = value.termination.status as NarratorEvaluationTerminationStatusV3;
  const artifactsMatch = narratorArtifactsMatchCandidate(value.verifiedArtifacts, candidate)
    && value.verifiedArtifacts.length === 6;
  const bindingMatches = isNarratorEvaluationWorkerBindingV3(value.workerBinding, runSpec, candidate);
  if (loadStatus === "ok") {
    if (loadStage !== "model-load" || !bindingMatches || !artifactsMatch || rows[0]?.status === "not-run") return false;
    if (terminalSeen) {
      if (disposeStatus !== "not-attempted" || terminationStatus === "not-requested") return false;
    } else if (rows.some((row) => row.status === "not-run")
      || disposeStatus === "not-attempted"
      || (disposeStatus === "ok" && terminationStatus !== "not-requested")
      || (disposeStatus !== "ok" && terminationStatus === "not-requested")) return false;
  } else {
    if (loadStage === "model-identity") {
      if (loadStatus !== "model-id-mismatch" || value.workerBinding !== null || value.verifiedArtifacts.length !== 0) {
        return false;
      }
    } else if (loadStage === "handshake") {
      if (value.workerBinding !== null || value.verifiedArtifacts.length !== 0
        || !["worker-binding-mismatch", "load-error", "load-timeout", "device-lost", "aborted"].includes(loadStatus)) {
        return false;
      }
    } else if (loadStage === "artifact-verification") {
      if (!bindingMatches
        || !["artifact-evidence-invalid", "artifact-mismatch", "load-error", "load-timeout", "device-lost", "aborted"]
          .includes(loadStatus)) return false;
      if (loadStatus === "artifact-mismatch") {
        if (artifactsMatch) return false;
      } else if (value.verifiedArtifacts.length !== 0) return false;
    } else if (loadStage === "model-load") {
      if (!bindingMatches || !artifactsMatch
        || !["load-error", "load-timeout", "device-lost", "aborted"].includes(loadStatus)) return false;
    }
    const abortShape = loadStatus === "aborted"
      && rows[0]?.status === "run-aborted"
      && rows[0].request === null
      && rows.slice(1).every((row) => row.status === "not-run" && row.request === null);
    const notRunShape = rows.every((row) => row.status === "not-run" && row.request === null);
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
  return true;
}
