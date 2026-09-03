import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationWorkerBindingV2,
  isNarratorEvaluationRunSpecV2,
  type NarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import { narratorPromptAndTokenContractHashV2 } from "./evaluation-prompt-contract";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  narratorMaximumResponseBytes,
} from "./protocol";

export const narratorEvaluationWorkerProtocolVersionV2 = 2 as const;
export const narratorEvaluationWorkerMaximumEnvelopeBytesV2 = 32_768;

export interface NarratorEvaluationWorkerCaseRequestV2 {
  readonly schemaVersion: 2;
  readonly protocolVersion: 2;
  readonly kind: "run-case";
  readonly runId: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string;
  readonly contractHash: string;
  readonly corpusVersion: 1;
  readonly corpusHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export type NarratorEvaluationWorkerOutcomeV2 =
  | "generated"
  | "prompt-format-error"
  | "input-tokenizer-error"
  | "input-token-contract-error"
  | "input-budget"
  | "generation-error"
  | "generated-token-contract-error"
  | "decode-error";

export interface NarratorEvaluationWorkerCaseResponseV2 {
  readonly schemaVersion: 2;
  readonly protocolVersion: 2;
  readonly kind: "case-result";
  readonly runId: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string;
  readonly contractHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly outcome: NarratorEvaluationWorkerOutcomeV2;
  readonly inputTokenIds: readonly number[] | null;
  readonly observedInputTokens: number | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly decodedText: string | null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface ResponseFieldsV2 {
  readonly outcome: NarratorEvaluationWorkerOutcomeV2;
  readonly inputTokenIds: readonly number[] | null;
  readonly observedInputTokens?: number | null;
  readonly fullDecoderTokenIds: readonly number[] | null;
  readonly decodedText: string | null;
}

const hashPattern = /^[0-9a-f]{16}$/u;
const outcomes: readonly NarratorEvaluationWorkerOutcomeV2[] = [
  "generated", "prompt-format-error", "input-tokenizer-error", "input-token-contract-error", "input-budget",
  "generation-error", "generated-token-contract-error", "decode-error",
];

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function hasValidContentHash(value: Record<string, unknown>): boolean {
  if (!hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return value.contentHash === canonicalHash(content);
}

function boundedTokenIds(value: unknown, maximumLength: number, allowEmpty = false): value is readonly number[] {
  if (!Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.length > maximumLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)
      || !Number.isSafeInteger(value[index])
      || Number(value[index]) < 0) return false;
  }
  return true;
}

function requestContent(
  runSpec: NarratorEvaluationRunSpecV2,
  candidate: NarratorModelCandidate,
  ordinal: number,
  workerEpoch: string,
  requestId: string,
): Omit<NarratorEvaluationWorkerCaseRequestV2, "contentHash"> {
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined) throw new RangeError("Narrator evaluation ordinal is invalid");
  const binding = createNarratorEvaluationWorkerBindingV2(runSpec, candidate);
  return {
    schemaVersion: 2,
    protocolVersion: narratorEvaluationWorkerProtocolVersionV2,
    kind: "run-case",
    runId: runSpec.runId,
    runSpecHash: runSpec.contentHash,
    workerBindingHash: canonicalHash(binding),
    contractHash: narratorPromptAndTokenContractHashV2,
    corpusVersion: runSpec.corpus.version,
    corpusHash: runSpec.corpus.hash,
    workerEpoch,
    requestId,
    ordinal,
    caseId: evaluationCase.id,
    caseHash: canonicalHash(evaluationCase),
    modelAdmitted: false,
    displayAuthorized: false,
  };
}

export function createNarratorEvaluationWorkerCaseRequestV2(
  runSpec: NarratorEvaluationRunSpecV2,
  candidate: NarratorModelCandidate,
  ordinal: number,
  workerEpoch: string,
  requestId: string,
): NarratorEvaluationWorkerCaseRequestV2 {
  if (!isNarratorEvaluationRunSpecV2(runSpec, candidate)
    || !isNarratorBoundedText(workerEpoch, 200)
    || !isNarratorBoundedText(requestId, 240)) {
    throw new TypeError("Narrator V2 evaluation request identity is invalid");
  }
  const content = requestContent(runSpec, candidate, ordinal, workerEpoch, requestId);
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorEvaluationWorkerCaseRequestV2(
  value: unknown,
  runSpec: NarratorEvaluationRunSpecV2,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationWorkerCaseRequestV2 {
  if (narratorEnvelopeByteLength(value) > narratorEvaluationWorkerMaximumEnvelopeBytesV2
    || !isNarratorEvaluationRunSpecV2(runSpec, candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "kind", "runId", "runSpecHash", "workerBindingHash", "contractHash",
      "corpusVersion", "corpusHash", "workerEpoch", "requestId", "ordinal", "caseId", "caseHash",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || value.protocolVersion !== narratorEvaluationWorkerProtocolVersionV2
    || value.kind !== "run-case"
    || !Number.isSafeInteger(value.ordinal)
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !isNarratorBoundedText(value.requestId, 240)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  try {
    const expected = requestContent(
      runSpec,
      candidate,
      Number(value.ordinal),
      String(value.workerEpoch),
      String(value.requestId),
    );
    return Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
  } catch {
    return false;
  }
}

function responseShapeIsValid(value: NarratorEvaluationWorkerCaseResponseV2): boolean {
  const inputIds = value.inputTokenIds;
  const generatedIds = value.fullDecoderTokenIds;
  const noEvidence = inputIds === null
    && value.observedInputTokens === null
    && generatedIds === null
    && value.decodedText === null;
  if (value.outcome === "prompt-format-error" || value.outcome === "input-tokenizer-error") return noEvidence;
  if (value.outcome === "input-budget") {
    return inputIds === null
      && Number.isSafeInteger(value.observedInputTokens)
      && Number(value.observedInputTokens) > narratorMaximumInputTokens
      && generatedIds === null
      && value.decodedText === null;
  }
  if (!boundedTokenIds(inputIds, narratorMaximumInputTokens, true)
    || value.observedInputTokens !== null) return false;
  if (value.outcome === "input-token-contract-error" || value.outcome === "generation-error") {
    return generatedIds === null && value.decodedText === null;
  }
  if (value.outcome === "generated-token-contract-error") {
    return (generatedIds === null || boundedTokenIds(generatedIds, narratorMaximumOutputTokens + 1, true))
      && value.decodedText === null;
  }
  if (!boundedTokenIds(generatedIds, narratorMaximumOutputTokens + 1, true)) return false;
  if (value.outcome === "decode-error") return value.decodedText === null;
  return typeof value.decodedText === "string"
    && new TextEncoder().encode(value.decodedText).byteLength <= narratorMaximumResponseBytes;
}

export function createNarratorEvaluationWorkerCaseResponseV2(
  request: NarratorEvaluationWorkerCaseRequestV2,
  fields: ResponseFieldsV2,
): NarratorEvaluationWorkerCaseResponseV2 {
  if (!isNarratorRecord(request) || !hasValidContentHash(request as unknown as Record<string, unknown>)) {
    throw new TypeError("Narrator V2 evaluation request is invalid");
  }
  const content = {
    schemaVersion: 2 as const,
    protocolVersion: narratorEvaluationWorkerProtocolVersionV2,
    kind: "case-result" as const,
    runId: request.runId,
    runSpecHash: request.runSpecHash,
    workerBindingHash: request.workerBindingHash,
    contractHash: request.contractHash,
    workerEpoch: request.workerEpoch,
    requestId: request.requestId,
    ordinal: request.ordinal,
    caseId: request.caseId,
    caseHash: request.caseHash,
    outcome: fields.outcome,
    inputTokenIds: fields.inputTokenIds === null ? null : Object.freeze([...fields.inputTokenIds]),
    observedInputTokens: fields.observedInputTokens ?? null,
    fullDecoderTokenIds: fields.fullDecoderTokenIds === null ? null : Object.freeze([...fields.fullDecoderTokenIds]),
    decodedText: fields.decodedText,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const response = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!outcomes.includes(response.outcome) || !responseShapeIsValid(response)
    || narratorEnvelopeByteLength(response) > narratorEvaluationWorkerMaximumEnvelopeBytesV2) {
    throw new TypeError("Narrator V2 evaluation response is invalid");
  }
  return response;
}

export function isNarratorEvaluationWorkerCaseResponseForRequestV2(
  value: unknown,
  request: NarratorEvaluationWorkerCaseRequestV2,
): value is NarratorEvaluationWorkerCaseResponseV2 {
  if (narratorEnvelopeByteLength(value) > narratorEvaluationWorkerMaximumEnvelopeBytesV2
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "kind", "runId", "runSpecHash", "workerBindingHash", "contractHash",
      "workerEpoch", "requestId", "ordinal", "caseId", "caseHash", "outcome", "inputTokenIds",
      "observedInputTokens", "fullDecoderTokenIds", "decodedText", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 2
    || value.protocolVersion !== narratorEvaluationWorkerProtocolVersionV2
    || value.kind !== "case-result"
    || !outcomes.includes(value.outcome as NarratorEvaluationWorkerOutcomeV2)
    || value.runId !== request.runId
    || value.runSpecHash !== request.runSpecHash
    || value.workerBindingHash !== request.workerBindingHash
    || value.contractHash !== request.contractHash
    || value.workerEpoch !== request.workerEpoch
    || value.requestId !== request.requestId
    || value.ordinal !== request.ordinal
    || value.caseId !== request.caseId
    || value.caseHash !== request.caseHash
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hasValidContentHash(value)) return false;
  return responseShapeIsValid(value as unknown as NarratorEvaluationWorkerCaseResponseV2);
}
