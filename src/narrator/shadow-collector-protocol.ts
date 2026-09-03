import { canonicalHash } from "../core/canonical";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  isNarratorVerifiedArtifactsV1,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import { isSafeAmbientNarration } from "./output-policy";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorEnvelopeByteLength,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  normalizeNarratorOutput,
} from "./protocol";
import type { NarratorShadowBenchmarkPlanV1 } from "./shadow-benchmark";

export const narratorShadowCollectorProtocolVersion = 1 as const;
export const narratorShadowCollectorMaximumEnvelopeBytes = 32_768;

export type NarratorShadowCollectorRequestKind =
  | "initialize"
  | "verify-artifacts"
  | "load"
  | "run-case"
  | "cancel"
  | "dispose";

export type NarratorShadowCollectorWorkerState =
  | "available"
  | "initialized"
  | "verified"
  | "loading"
  | "ready"
  | "running"
  | "disposing"
  | "terminated"
  | "disposed"
  | "failed";

interface CollectorRequestBaseV1 {
  readonly schemaVersion: 1;
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly planHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
}

export type NarratorShadowCollectorRequestV1 =
  | (CollectorRequestBaseV1 & {
      readonly kind: "initialize";
      readonly payload: {
        readonly candidateId: string;
        readonly candidateManifestHash: string;
        readonly artifactManifestHash: string;
        readonly runtimeIntegrity: string;
        readonly corpusHash: string;
        readonly decodingHash: string;
      };
    })
  | (CollectorRequestBaseV1 & {
      readonly kind: "verify-artifacts";
      readonly payload: Record<string, never>;
    })
  | (CollectorRequestBaseV1 & {
      readonly kind: "load";
      readonly payload: Record<string, never>;
    })
  | (CollectorRequestBaseV1 & {
      readonly kind: "dispose";
      readonly payload: Record<string, never>;
    })
  | (CollectorRequestBaseV1 & {
      readonly kind: "run-case";
      readonly payload: { readonly evaluationCaseOrdinal: number };
    })
  | (CollectorRequestBaseV1 & {
      readonly kind: "cancel";
      readonly payload: { readonly targetRequestId: string };
    });

interface CollectorResponseBaseV1 {
  readonly schemaVersion: 1;
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly planHash: string;
  readonly workerEpoch: string;
  readonly requestId: string;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
}

export type NarratorShadowCollectorErrorCode =
  | "invalid-envelope"
  | "identity-mismatch"
  | "duplicate-conflict"
  | "request-budget-exceeded"
  | "wrong-state"
  | "artifact-evidence-invalid"
  | "artifact-mismatch"
  | "model-error"
  | "invalid-output"
  | "cancelled"
  | "device-lost";

export type NarratorShadowCollectorResponseV1 =
  | (CollectorResponseBaseV1 & {
      readonly kind: "status";
      readonly payload: {
        readonly state: NarratorShadowCollectorWorkerState;
        readonly code: "initialized" | "artifacts-verified" | "loaded" | "cancelled" | "disposed";
      };
      readonly contentHash: string;
    })
  | (CollectorResponseBaseV1 & {
      readonly kind: "artifacts";
      readonly payload: { readonly artifacts: readonly NarratorVerifiedArtifactV1[] };
      readonly contentHash: string;
    })
  | (CollectorResponseBaseV1 & {
      readonly kind: "case-result";
      readonly payload: {
        readonly evaluationCaseOrdinal: number;
        readonly evaluationCaseHash: string;
        readonly inputTokens: number;
        readonly outputTokens: number;
        readonly outputText: string;
      };
      readonly contentHash: string;
    })
  | (CollectorResponseBaseV1 & {
      readonly kind: "error";
      readonly payload: { readonly code: NarratorShadowCollectorErrorCode };
      readonly contentHash: string;
    });

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function isSha512Integrity(value: unknown): value is string {
  return typeof value === "string" && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(value);
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (!isHash(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  return value.contentHash === canonicalHash(content);
}

function isRequestBase(value: Record<string, unknown>): boolean {
  return value.schemaVersion === 1
    && value.protocolVersion === narratorShadowCollectorProtocolVersion
    && /^[0-9a-f]{64}$/u.test(String(value.runId))
    && isHash(value.planHash)
    && isNarratorBoundedText(value.workerEpoch, 200)
    && isNarratorBoundedText(value.requestId, 240)
    && isNarratorRecord(value.payload);
}

export function isNarratorShadowCollectorRequestForPlanV1(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
): value is NarratorShadowCollectorRequestV1 {
  if (narratorEnvelopeByteLength(value) > narratorShadowCollectorMaximumEnvelopeBytes
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "runId", "planHash", "workerEpoch", "requestId", "kind", "payload",
    ])
    || !isRequestBase(value)
    || value.runId !== plan.runId
    || value.planHash !== plan.contentHash
    || !["initialize", "verify-artifacts", "load", "run-case", "cancel", "dispose"].includes(String(value.kind))) {
    return false;
  }
  const payload = value.payload as Record<string, unknown>;
  if (value.kind === "initialize") {
    return narratorHasExactKeys(payload, [
      "candidateId", "candidateManifestHash", "artifactManifestHash", "runtimeIntegrity", "corpusHash", "decodingHash",
    ])
      && payload.candidateId === plan.bindings.candidateId
      && payload.candidateManifestHash === plan.bindings.candidateManifestHash
      && payload.artifactManifestHash === plan.bindings.artifactManifestHash
      && payload.runtimeIntegrity === plan.bindings.runtimeIntegrity
      && isSha512Integrity(payload.runtimeIntegrity)
      && payload.corpusHash === plan.bindings.corpusHash
      && payload.decodingHash === plan.bindings.decodingHash;
  }
  if (value.kind === "verify-artifacts" || value.kind === "load" || value.kind === "dispose") {
    return narratorHasExactKeys(payload, []);
  }
  if (value.kind === "run-case") {
    return narratorHasExactKeys(payload, ["evaluationCaseOrdinal"])
      && Number.isSafeInteger(payload.evaluationCaseOrdinal)
      && Number(payload.evaluationCaseOrdinal) >= 0
      && Number(payload.evaluationCaseOrdinal) < narratorEvaluationCasesV1.length;
  }
  return narratorHasExactKeys(payload, ["targetRequestId"])
    && isNarratorBoundedText(payload.targetRequestId, 240)
    && payload.targetRequestId !== value.requestId;
}

export function createNarratorShadowCollectorInitializeRequestV1(
  plan: NarratorShadowBenchmarkPlanV1,
  workerEpoch: string,
  requestId: string,
): NarratorShadowCollectorRequestV1 {
  const request: NarratorShadowCollectorRequestV1 = {
    schemaVersion: 1,
    protocolVersion: narratorShadowCollectorProtocolVersion,
    runId: plan.runId,
    planHash: plan.contentHash,
    workerEpoch,
    requestId,
    kind: "initialize",
    payload: {
      candidateId: plan.bindings.candidateId,
      candidateManifestHash: plan.bindings.candidateManifestHash,
      artifactManifestHash: plan.bindings.artifactManifestHash,
      runtimeIntegrity: plan.bindings.runtimeIntegrity,
      corpusHash: plan.bindings.corpusHash,
      decodingHash: plan.bindings.decodingHash,
    },
  };
  if (!isNarratorShadowCollectorRequestForPlanV1(request, plan)) {
    throw new TypeError("Narrator shadow collector identity is invalid");
  }
  return Object.freeze({ ...request, payload: Object.freeze(request.payload) });
}

export function isNarratorShadowCollectorResponseForPlanV1(
  value: unknown,
  plan: NarratorShadowBenchmarkPlanV1,
  request: NarratorShadowCollectorRequestV1,
): value is NarratorShadowCollectorResponseV1 {
  if (narratorEnvelopeByteLength(value) > narratorShadowCollectorMaximumEnvelopeBytes
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "protocolVersion", "runId", "planHash", "workerEpoch", "requestId", "kind", "payload",
      "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || value.protocolVersion !== narratorShadowCollectorProtocolVersion
    || value.runId !== plan.runId
    || value.planHash !== plan.contentHash
    || value.workerEpoch !== request.workerEpoch
    || value.requestId !== request.requestId
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !isNarratorBoundedText(value.requestId, 240)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !isNarratorRecord(value.payload)
    || !hashedContentIsValid(value)) return false;
  const payload = value.payload;
  if (value.kind !== "error") {
    const expectedKind = request.kind === "verify-artifacts"
      ? "artifacts"
      : request.kind === "run-case"
        ? "case-result"
        : "status";
    if (value.kind !== expectedKind) return false;
  }
  if (value.kind === "status") {
    if (!narratorHasExactKeys(payload, ["state", "code"])) return false;
    const legalPairs: Readonly<Record<string, NarratorShadowCollectorWorkerState>> = {
      initialized: "initialized",
      "artifacts-verified": "verified",
      loaded: "ready",
      cancelled: "terminated",
      disposed: "disposed",
    };
    const expectedCode = request.kind === "initialize"
      ? "initialized"
      : request.kind === "load"
        ? "loaded"
        : request.kind === "cancel"
          ? "cancelled"
          : request.kind === "dispose"
            ? "disposed"
            : null;
    return expectedCode !== null
      && payload.code === expectedCode
      && payload.state === legalPairs[expectedCode];
  }
  if (value.kind === "artifacts") {
    if (!narratorHasExactKeys(payload, ["artifacts"])
      || !isNarratorVerifiedArtifactsV1(payload.artifacts)) return false;
    const manifest = [...payload.artifacts]
      .map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    return canonicalHash(manifest) === plan.bindings.artifactManifestHash;
  }
  if (value.kind === "case-result") {
    if (!narratorHasExactKeys(payload, [
      "evaluationCaseOrdinal", "evaluationCaseHash", "inputTokens", "outputTokens", "outputText",
    ])
      || !Number.isSafeInteger(payload.evaluationCaseOrdinal)
      || Number(payload.evaluationCaseOrdinal) < 0
      || Number(payload.evaluationCaseOrdinal) >= narratorEvaluationCasesV1.length) return false;
    const evaluationCase = narratorEvaluationCasesV1[Number(payload.evaluationCaseOrdinal)]!;
    return request.kind === "run-case"
      && payload.evaluationCaseOrdinal === request.payload.evaluationCaseOrdinal
      && payload.evaluationCaseHash === canonicalHash(evaluationCase)
      && Number.isSafeInteger(payload.inputTokens)
      && Number(payload.inputTokens) >= 1
      && Number(payload.inputTokens) <= narratorMaximumInputTokens
      && Number.isSafeInteger(payload.outputTokens)
      && Number(payload.outputTokens) >= 1
      && Number(payload.outputTokens) <= narratorMaximumOutputTokens
      && normalizeNarratorOutput(payload.outputText) === payload.outputText
      && isSafeAmbientNarration(String(payload.outputText), evaluationCase.prompt);
  }
  if (value.kind === "error") {
    return narratorHasExactKeys(payload, ["code"])
      && ["invalid-envelope", "identity-mismatch", "duplicate-conflict", "request-budget-exceeded", "wrong-state",
        "artifact-evidence-invalid", "artifact-mismatch", "model-error", "invalid-output", "cancelled", "device-lost"]
        .includes(String(payload.code));
  }
  return false;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function hashNarratorShadowCollectorResponseV1<T extends Omit<NarratorShadowCollectorResponseV1, "contentHash">>(
  response: T,
): T & { readonly contentHash: string } {
  return deepFreeze({ ...response, contentHash: canonicalHash(response) });
}
