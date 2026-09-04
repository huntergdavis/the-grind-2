import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  createNarratorEvaluationWorkerBindingV3,
  isNarratorEvaluationRunSpecV3,
  type NarratorEvaluationRunSpecV3,
} from "./evaluation-contract-v3";
import {
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationCorpusVersion,
} from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  countNarratorFormInputTokenIdsV3,
  createNarratorFormEligibilityDecisionV3,
  isNarratorFormEligibilityDecisionV3,
  narratorFormIdsV3,
  narratorFormPromptBytesHashV3,
  narratorFormSelectionContractHashV3,
  validateNarratorFormSelectionV3,
  type NarratorFormEligibilityDecisionV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
} from "./protocol";

export const narratorEvaluationWorkerProtocolVersionV3 = 3 as const;
export const narratorEvaluationWorkerMaximumEnvelopeBytesV3 = 32_768;

export interface NarratorEvaluationWorkerCaseRequestV3 {
  readonly schemaVersion: 3;
  readonly protocolVersion: 3;
  readonly kind: "run-form-case";
  readonly runId: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string;
  readonly contractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly corpusVersion: 1;
  readonly corpusHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly promptBytesHash: string;
  readonly eligibility: NarratorFormEligibilityDecisionV3;
  readonly priorWorkerResponseHash: string | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export type NarratorEvaluationWorkerOutcomeV3 =
  | "selected"
  | "prompt-format-error"
  | "input-tokenizer-error"
  | "input-token-contract-error"
  | "input-budget"
  | "target-tokenizer-error"
  | "target-token-contract-error"
  | "generation-error"
  | "selection-contract-error";

export interface NarratorEvaluationTargetObservationV3 {
  readonly formId: NarratorFormIdV3;
  readonly tokenIds: readonly number[];
  readonly decodedWitness: string;
}

export interface NarratorEvaluationWorkerCaseResponseV3 {
  readonly schemaVersion: 3;
  readonly protocolVersion: 3;
  readonly kind: "form-case-result";
  readonly runId: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string;
  readonly contractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly corpusVersion: 1;
  readonly corpusHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
  readonly requestHash: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly promptBytesHash: string;
  readonly eligibilityHash: string;
  readonly priorWorkerResponseHash: string | null;
  readonly outcome: NarratorEvaluationWorkerOutcomeV3;
  readonly inputTokenIds: readonly number[] | null;
  readonly observedInputTokens: number | null;
  readonly targetObservations: readonly NarratorEvaluationTargetObservationV3[] | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly selectionTrace: readonly NarratorFormSelectionTraceStepV3[] | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorEvaluationWorkerResponseFieldsV3 {
  readonly outcome: NarratorEvaluationWorkerOutcomeV3;
  readonly inputTokenIds: readonly number[] | null;
  readonly observedInputTokens: number | null;
  readonly targetObservations: readonly NarratorEvaluationTargetObservationV3[] | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly selectionTrace: readonly NarratorFormSelectionTraceStepV3[] | null;
}

const hashPattern = /^[0-9a-f]{16}$/u;
const outcomes: readonly NarratorEvaluationWorkerOutcomeV3[] = Object.freeze([
  "selected",
  "prompt-format-error",
  "input-tokenizer-error",
  "input-token-contract-error",
  "input-budget",
  "target-tokenizer-error",
  "target-token-contract-error",
  "generation-error",
  "selection-contract-error",
]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function hasValidContentHash(value: Record<string, unknown>): boolean {
  if (!hashPattern.test(String(value.contentHash))) return false;
  try {
    const { contentHash, ...content } = value;
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function boundedTokenIds(value: unknown, maximumLength: number, allowEmpty: boolean): value is readonly number[] {
  return isDenseArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= maximumLength
    && value.every((token) => Number.isSafeInteger(token) && Number(token) >= 0);
}

function isUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff_ffff;
}

function envelopeWithinBudget(value: unknown): boolean {
  try {
    return narratorEnvelopeByteLength(value) <= narratorEvaluationWorkerMaximumEnvelopeBytesV3;
  } catch {
    return false;
  }
}

function copyEligibility(value: NarratorFormEligibilityDecisionV3): NarratorFormEligibilityDecisionV3 {
  return deepFreeze({
    schemaVersion: value.schemaVersion,
    seedId: value.seedId,
    sequenceSlot: value.sequenceSlot,
    burstIndex: value.burstIndex,
    burstPosition: value.burstPosition,
    priorSelectedFormId: value.priorSelectedFormId,
    baselineFormId: value.baselineFormId,
    eligibleFormIds: [...value.eligibleFormIds],
    suppressedFormId: value.suppressedFormId,
    contentHash: value.contentHash,
  });
}

function derivedRequestId(
  runSpecHash: string,
  workerBindingHash: string,
  workerEpoch: string,
  ordinal: number,
  caseHash: string,
  promptBytesHash: string,
  eligibilityHash: string,
  priorWorkerResponseHash: string | null,
): string {
  return `case:${String(ordinal).padStart(3, "0")}:${canonicalHash({
    schemaVersion: 3,
    protocolVersion: narratorEvaluationWorkerProtocolVersionV3,
    runSpecHash,
    workerBindingHash,
    contractHash: narratorFormSelectionContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    workerEpoch,
    ordinal,
    caseHash,
    promptBytesHash,
    eligibilityHash,
    priorWorkerResponseHash,
  })}`;
}

function requestContent(
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
  ordinal: number,
  workerEpoch: string,
  priorSelectedFormId: NarratorFormIdV3 | null,
  priorWorkerResponseHash: string | null,
): Omit<NarratorEvaluationWorkerCaseRequestV3, "contentHash"> {
  if (!isNarratorEvaluationRunSpecV3(runSpec, candidate)
    || !Number.isSafeInteger(ordinal)
    || !isNarratorBoundedText(workerEpoch, 200)) {
    throw new TypeError("Narrator V3 evaluation request identity is invalid");
  }
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined) throw new RangeError("Narrator evaluation ordinal is invalid");
  if ((ordinal === 0 && priorWorkerResponseHash !== null)
    || (ordinal > 0 && !hashPattern.test(String(priorWorkerResponseHash)))) {
    throw new TypeError("Narrator V3 evaluation response chain is invalid");
  }
  const sequenceSlot = ordinal % 10;
  const eligibility = createNarratorFormEligibilityDecisionV3(evaluationCase.prompt, {
    seedId: evaluationCase.seedId,
    sequenceSlot,
    priorSelectedFormId,
  });
  const binding = createNarratorEvaluationWorkerBindingV3(runSpec, candidate);
  const workerBindingHash = canonicalHash(binding);
  const caseHash = canonicalHash(evaluationCase);
  const promptBytesHash = narratorFormPromptBytesHashV3(evaluationCase.prompt);
  const requestId = derivedRequestId(
    runSpec.contentHash,
    workerBindingHash,
    workerEpoch,
    ordinal,
    caseHash,
    promptBytesHash,
    eligibility.contentHash,
    priorWorkerResponseHash,
  );
  return {
    schemaVersion: 3,
    protocolVersion: narratorEvaluationWorkerProtocolVersionV3,
    kind: "run-form-case",
    runId: runSpec.runId,
    runSpecHash: runSpec.contentHash,
    workerBindingHash,
    contractHash: narratorFormSelectionContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    corpusVersion: narratorEvaluationCorpusVersion,
    corpusHash: narratorEvaluationCorpusHashV1,
    workerEpoch,
    requestId,
    ordinal,
    caseId: evaluationCase.id,
    caseHash,
    promptBytesHash,
    eligibility: copyEligibility(eligibility),
    priorWorkerResponseHash,
    modelAdmitted: false,
    displayAuthorized: false,
  };
}

export function createNarratorEvaluationWorkerCaseRequestV3(
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
  ordinal: number,
  workerEpoch: string,
  priorSelectedFormId: NarratorFormIdV3 | null,
  priorWorkerResponseHash: string | null,
): NarratorEvaluationWorkerCaseRequestV3 {
  const content = requestContent(
    runSpec,
    candidate,
    ordinal,
    workerEpoch,
    priorSelectedFormId,
    priorWorkerResponseHash,
  );
  const request = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!envelopeWithinBudget(request)) throw new RangeError("Narrator V3 evaluation request exceeds its envelope budget");
  return request;
}

function requestEnvelopeShapeIsValid(value: unknown): value is NarratorEvaluationWorkerCaseRequestV3 {
  if (!envelopeWithinBudget(value)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "kind", "runId", "runSpecHash", "workerBindingHash", "contractHash",
      "evidenceContractHash", "protocolContractHash", "corpusVersion", "corpusHash", "workerEpoch", "requestId",
      "ordinal", "caseId", "caseHash", "promptBytesHash", "eligibility", "priorWorkerResponseHash",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || value.protocolVersion !== narratorEvaluationWorkerProtocolVersionV3
    || value.kind !== "run-form-case"
    || !isNarratorBoundedText(value.runId, 200)
    || !hashPattern.test(String(value.runSpecHash))
    || !hashPattern.test(String(value.workerBindingHash))
    || value.contractHash !== narratorFormSelectionContractHashV3
    || value.evidenceContractHash !== narratorEvaluationEvidenceContractHashV3
    || value.protocolContractHash !== narratorEvaluationWorkerProtocolContractHashV3
    || value.corpusVersion !== narratorEvaluationCorpusVersion
    || value.corpusHash !== narratorEvaluationCorpusHashV1
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !isNarratorBoundedText(value.requestId, 240)
    || !Number.isSafeInteger(value.ordinal)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  const ordinal = Number(value.ordinal);
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined
    || value.caseId !== evaluationCase.id
    || value.caseHash !== canonicalHash(evaluationCase)
    || value.promptBytesHash !== narratorFormPromptBytesHashV3(evaluationCase.prompt)
    || !isNarratorFormEligibilityDecisionV3(value.eligibility, evaluationCase.prompt)
    || value.eligibility.seedId !== evaluationCase.seedId
    || value.eligibility.sequenceSlot !== ordinal % 10
    || (ordinal === 0 ? value.priorWorkerResponseHash !== null : !hashPattern.test(String(value.priorWorkerResponseHash)))) {
    return false;
  }
  return value.requestId === derivedRequestId(
    String(value.runSpecHash),
    String(value.workerBindingHash),
    value.workerEpoch,
    ordinal,
    String(value.caseHash),
    String(value.promptBytesHash),
    value.eligibility.contentHash,
    value.priorWorkerResponseHash as string | null,
  );
}

export function isNarratorEvaluationWorkerCaseRequestV3(
  value: unknown,
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
  priorSelectedFormId: NarratorFormIdV3 | null,
  priorWorkerResponseHash: string | null,
): value is NarratorEvaluationWorkerCaseRequestV3 {
  if (!requestEnvelopeShapeIsValid(value)) return false;
  try {
    const expected = requestContent(
      runSpec,
      candidate,
      value.ordinal,
      value.workerEpoch,
      priorSelectedFormId,
      priorWorkerResponseHash,
    );
    const { contentHash: _contentHash, ...content } = value;
    return exactCanonical(content, expected);
  } catch {
    return false;
  }
}

function isTargetObservation(value: unknown): value is NarratorEvaluationTargetObservationV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["formId", "tokenIds", "decodedWitness"])
    && narratorFormIdsV3.includes(value.formId as NarratorFormIdV3)
    && boundedTokenIds(value.tokenIds, narratorMaximumInputTokens, true)
    && typeof value.decodedWitness === "string"
    && new TextEncoder().encode(value.decodedWitness).byteLength <= 1_024;
}

function isTargetObservations(value: unknown): value is readonly NarratorEvaluationTargetObservationV3[] {
  return isDenseArray(value) && value.length <= 4 && value.every(isTargetObservation);
}

function isTraceStep(value: unknown): value is NarratorFormSelectionTraceStepV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["prefixTokenIds", "allowedTokenIds", "allowedScoreBits", "emittedTokenId"])
    && boundedTokenIds(value.prefixTokenIds, narratorMaximumOutputTokens, true)
    && boundedTokenIds(value.allowedTokenIds, 4, true)
    && isDenseArray(value.allowedScoreBits)
    && value.allowedScoreBits.length <= 4
    && value.allowedScoreBits.every(isUint32)
    && Number.isSafeInteger(value.emittedTokenId)
    && Number(value.emittedTokenId) >= 0;
}

function isSelectionTrace(value: unknown): value is readonly NarratorFormSelectionTraceStepV3[] {
  return isDenseArray(value) && value.length <= narratorMaximumOutputTokens && value.every(isTraceStep);
}

function copyTargetObservations(
  value: readonly NarratorEvaluationTargetObservationV3[] | null,
): readonly NarratorEvaluationTargetObservationV3[] | null {
  if (value === null) return null;
  if (!isTargetObservations(value)) throw new TypeError("Narrator V3 target observations are structurally invalid");
  return deepFreeze(value.map((observation) => ({
    formId: observation.formId,
    tokenIds: [...observation.tokenIds],
    decodedWitness: observation.decodedWitness,
  })));
}

function copyTrace(
  value: readonly NarratorFormSelectionTraceStepV3[] | null,
): readonly NarratorFormSelectionTraceStepV3[] | null {
  if (value === null) return null;
  if (!isSelectionTrace(value)) throw new TypeError("Narrator V3 selection trace is structurally invalid");
  return deepFreeze(value.map((step) => ({
    prefixTokenIds: [...step.prefixTokenIds],
    allowedTokenIds: [...step.allowedTokenIds],
    allowedScoreBits: [...step.allowedScoreBits],
    emittedTokenId: step.emittedTokenId,
  })));
}

function inputIdsAreValid(value: readonly number[] | null): boolean {
  if (value === null) return false;
  try {
    countNarratorFormInputTokenIdsV3(value);
    return true;
  } catch {
    return false;
  }
}

function targetSetForResponse(
  response: NarratorEvaluationWorkerCaseResponseV3,
  request: NarratorEvaluationWorkerCaseRequestV3,
): ReturnType<typeof accountNarratorFormTargetsV3> | null {
  if (response.targetObservations === null) return null;
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  try {
    return accountNarratorFormTargetsV3(
      evaluationCase.prompt,
      request.eligibility,
      response.targetObservations,
    );
  } catch {
    return null;
  }
}

function selectionIsValid(
  response: NarratorEvaluationWorkerCaseResponseV3,
  request: NarratorEvaluationWorkerCaseRequestV3,
  targetSet: NonNullable<ReturnType<typeof targetSetForResponse>>,
): boolean {
  if (response.fullDecoderTokenIds === null || response.selectionTrace === null) return false;
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  try {
    validateNarratorFormSelectionV3(
      evaluationCase.prompt,
      request.eligibility,
      response.fullDecoderTokenIds,
      response.selectionTrace,
      targetSet,
    );
    return true;
  } catch {
    return false;
  }
}

function responseEvidenceIsEmpty(response: NarratorEvaluationWorkerCaseResponseV3): boolean {
  return response.inputTokenIds === null
    && response.observedInputTokens === null
    && response.targetObservations === null
    && response.fullDecoderTokenIds === null
    && response.selectionTrace === null;
}

function responseStageShapeIsValid(
  response: NarratorEvaluationWorkerCaseResponseV3,
  request: NarratorEvaluationWorkerCaseRequestV3,
): boolean {
  if (response.outcome === "prompt-format-error" || response.outcome === "input-tokenizer-error") {
    return responseEvidenceIsEmpty(response);
  }
  if (response.outcome === "input-budget") {
    return response.inputTokenIds === null
      && Number.isSafeInteger(response.observedInputTokens)
      && Number(response.observedInputTokens) > narratorMaximumInputTokens
      && response.targetObservations === null
      && response.fullDecoderTokenIds === null
      && response.selectionTrace === null;
  }
  if (response.inputTokenIds === null || response.observedInputTokens !== null) return false;
  const validInput = inputIdsAreValid(response.inputTokenIds);
  if (response.outcome === "input-token-contract-error") {
    return !validInput
      && response.targetObservations === null
      && response.fullDecoderTokenIds === null
      && response.selectionTrace === null;
  }
  if (!validInput) return false;
  if (response.outcome === "target-tokenizer-error") {
    return response.targetObservations === null
      && response.fullDecoderTokenIds === null
      && response.selectionTrace === null;
  }
  const targetSet = targetSetForResponse(response, request);
  if (response.outcome === "target-token-contract-error") {
    return response.targetObservations !== null
      && targetSet === null
      && response.fullDecoderTokenIds === null
      && response.selectionTrace === null;
  }
  if (targetSet === null) return false;
  if (response.outcome === "generation-error") {
    return response.fullDecoderTokenIds === null && response.selectionTrace === null;
  }
  if (response.fullDecoderTokenIds === null || response.selectionTrace === null) return false;
  const validSelection = selectionIsValid(response, request, targetSet);
  return response.outcome === "selected" ? validSelection : !validSelection;
}

function responseContent(
  request: NarratorEvaluationWorkerCaseRequestV3,
  fields: NarratorEvaluationWorkerResponseFieldsV3,
): Omit<NarratorEvaluationWorkerCaseResponseV3, "contentHash"> {
  if (!isNarratorRecord(fields)
    || !narratorHasExactKeys(fields, [
      "outcome", "inputTokenIds", "observedInputTokens", "targetObservations", "fullDecoderTokenIds",
      "selectionTrace",
    ])
    || !outcomes.includes(fields.outcome)
    || !(fields.inputTokenIds === null
      || boundedTokenIds(fields.inputTokenIds, narratorMaximumInputTokens, true))
    || !(fields.observedInputTokens === null || Number.isSafeInteger(fields.observedInputTokens))
    || !(fields.targetObservations === null || isTargetObservations(fields.targetObservations))
    || !(fields.fullDecoderTokenIds === null
      || boundedTokenIds(fields.fullDecoderTokenIds, narratorMaximumOutputTokens + 1, true))
    || !(fields.selectionTrace === null || isSelectionTrace(fields.selectionTrace))) {
    throw new TypeError("Narrator V3 evaluation response fields are invalid");
  }
  return {
    schemaVersion: 3,
    protocolVersion: narratorEvaluationWorkerProtocolVersionV3,
    kind: "form-case-result",
    runId: request.runId,
    runSpecHash: request.runSpecHash,
    workerBindingHash: request.workerBindingHash,
    contractHash: request.contractHash,
    evidenceContractHash: request.evidenceContractHash,
    protocolContractHash: request.protocolContractHash,
    corpusVersion: request.corpusVersion,
    corpusHash: request.corpusHash,
    workerEpoch: request.workerEpoch,
    requestId: request.requestId,
    requestHash: request.contentHash,
    ordinal: request.ordinal,
    caseId: request.caseId,
    caseHash: request.caseHash,
    promptBytesHash: request.promptBytesHash,
    eligibilityHash: request.eligibility.contentHash,
    priorWorkerResponseHash: request.priorWorkerResponseHash,
    outcome: fields.outcome,
    inputTokenIds: fields.inputTokenIds === null ? null : Object.freeze([...fields.inputTokenIds]),
    observedInputTokens: fields.observedInputTokens,
    targetObservations: copyTargetObservations(fields.targetObservations),
    fullDecoderTokenIds: fields.fullDecoderTokenIds === null
      ? null
      : Object.freeze([...fields.fullDecoderTokenIds]),
    selectionTrace: copyTrace(fields.selectionTrace),
    modelAdmitted: false,
    displayAuthorized: false,
  };
}

export function createNarratorEvaluationWorkerCaseResponseV3(
  request: NarratorEvaluationWorkerCaseRequestV3,
  fields: NarratorEvaluationWorkerResponseFieldsV3,
): NarratorEvaluationWorkerCaseResponseV3 {
  if (!requestEnvelopeShapeIsValid(request)) throw new TypeError("Narrator V3 evaluation request is invalid");
  const content = responseContent(request, fields);
  const response = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!responseStageShapeIsValid(response, request)) {
    throw new TypeError("Narrator V3 evaluation response stage evidence is invalid");
  }
  if (!envelopeWithinBudget(response)) throw new RangeError("Narrator V3 evaluation response exceeds its envelope budget");
  return response;
}

export function isNarratorEvaluationWorkerCaseResponseForRequestV3(
  value: unknown,
  request: NarratorEvaluationWorkerCaseRequestV3,
): value is NarratorEvaluationWorkerCaseResponseV3 {
  if (!requestEnvelopeShapeIsValid(request)
    || !envelopeWithinBudget(value)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "kind", "runId", "runSpecHash", "workerBindingHash", "contractHash",
      "evidenceContractHash", "protocolContractHash", "corpusVersion", "corpusHash", "workerEpoch", "requestId",
      "requestHash", "ordinal", "caseId", "caseHash", "promptBytesHash", "eligibilityHash",
      "priorWorkerResponseHash", "outcome", "inputTokenIds", "observedInputTokens", "targetObservations",
      "fullDecoderTokenIds", "selectionTrace", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 3
    || value.protocolVersion !== narratorEvaluationWorkerProtocolVersionV3
    || value.kind !== "form-case-result"
    || !outcomes.includes(value.outcome as NarratorEvaluationWorkerOutcomeV3)
    || value.runId !== request.runId
    || value.runSpecHash !== request.runSpecHash
    || value.workerBindingHash !== request.workerBindingHash
    || value.contractHash !== request.contractHash
    || value.evidenceContractHash !== request.evidenceContractHash
    || value.protocolContractHash !== request.protocolContractHash
    || value.corpusVersion !== request.corpusVersion
    || value.corpusHash !== request.corpusHash
    || value.workerEpoch !== request.workerEpoch
    || value.requestId !== request.requestId
    || value.requestHash !== request.contentHash
    || value.ordinal !== request.ordinal
    || value.caseId !== request.caseId
    || value.caseHash !== request.caseHash
    || value.promptBytesHash !== request.promptBytesHash
    || value.eligibilityHash !== request.eligibility.contentHash
    || value.priorWorkerResponseHash !== request.priorWorkerResponseHash
    || !(value.inputTokenIds === null
      || boundedTokenIds(value.inputTokenIds, narratorMaximumInputTokens, true))
    || !(value.observedInputTokens === null || Number.isSafeInteger(value.observedInputTokens))
    || !(value.targetObservations === null || isTargetObservations(value.targetObservations))
    || !(value.fullDecoderTokenIds === null
      || boundedTokenIds(value.fullDecoderTokenIds, narratorMaximumOutputTokens + 1, true))
    || !(value.selectionTrace === null || isSelectionTrace(value.selectionTrace))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  return responseStageShapeIsValid(
    value as unknown as NarratorEvaluationWorkerCaseResponseV3,
    request,
  );
}
