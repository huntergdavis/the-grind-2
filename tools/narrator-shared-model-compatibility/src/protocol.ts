import {
  isLiveNarratorFormId,
  type LiveNarratorFormId,
} from "../../../src/narrator/live-form-selection";
import type { NarratorMoveV1 } from "../../../src/narrator/protocol";

export const sharedModelCompatibilityProtocolVersion = 1 as const;
export const sharedModelCompatibilityCaseCount = 200 as const;
export const sharedModelCompatibilityCorpusHash = "63b3a0ee9fef092a" as const;
export const sharedModelCompatibilityBaselineAggregateSha256 =
  "4aeb36097c54d457e2f4b83acdf3c893528265c7c7a2b7605ce9e52537b1f7e0" as const;
export const sharedModelCompatibilityModelPaths = Object.freeze([
  "config.json",
  "generation_config.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
] as const);
export const sharedModelCompatibilityRuntimePaths = Object.freeze([
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
] as const);

export type SharedModelCompatibilityRoleV1 = "baseline" | "candidate";

export interface SharedModelCompatibilityArtifactV1 {
  readonly path: string;
  readonly url: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface SharedModelCompatibilityStagedArtifactV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
}

export interface SharedModelCompatibilityStageRequestV1 {
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly baselineModelAggregateSha256: string;
  readonly candidateModelAggregateSha256: string;
  readonly baselineModelArtifacts: readonly SharedModelCompatibilityArtifactV1[];
  readonly candidateModelArtifacts: readonly SharedModelCompatibilityArtifactV1[];
  readonly runtimeArtifacts: readonly SharedModelCompatibilityArtifactV1[];
}

export interface SharedModelCompatibilityCaseResultV1 {
  readonly ordinal: number;
  readonly id: string;
  readonly seedId: string;
  readonly move: NarratorMoveV1;
  readonly promptHash: string;
  readonly selectedFormId: LiveNarratorFormId;
  readonly lineHash: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly baselineForm: boolean;
  readonly safe: true;
  readonly eligible: true;
  readonly fallbackUsed: false;
  readonly elapsedMs: number;
}

export interface SharedModelCompatibilityRunResultV1 {
  readonly aggregateSha256: string;
  readonly loadElapsedMs: number;
  readonly tokenizerVerified: true;
  readonly cases: readonly SharedModelCompatibilityCaseResultV1[];
}

export type SharedModelCompatibilityWorkerRequestV1 =
  | {
      readonly protocolVersion: 1;
      readonly kind: "initialize";
      readonly runId: string;
      readonly operationId: string;
      readonly baselineModelAggregateSha256: string;
      readonly candidateModelAggregateSha256: string;
      readonly baselineModelArtifacts: readonly SharedModelCompatibilityStagedArtifactV1[];
      readonly candidateModelArtifacts: readonly SharedModelCompatibilityStagedArtifactV1[];
      readonly runtimeArtifacts: readonly SharedModelCompatibilityStagedArtifactV1[];
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "run";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "dispose";
      readonly runId: string;
      readonly operationId: string;
    };

export type SharedModelCompatibilityWorkerResponseV1 =
  | {
      readonly protocolVersion: 1;
      readonly kind: "initialized";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "complete";
      readonly runId: string;
      readonly operationId: string;
      readonly baseline: SharedModelCompatibilityRunResultV1;
      readonly candidate: SharedModelCompatibilityRunResultV1;
      readonly exactFormParityCount: number;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "disposed";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "failed";
      readonly runId: string;
      readonly operationId: string;
      readonly reason: string;
    };

export interface SharedModelCompatibilityComparisonResultV1 {
  readonly baseline: SharedModelCompatibilityRunResultV1;
  readonly candidate: SharedModelCompatibilityRunResultV1;
  readonly exactFormParityCount: number;
}

export interface SharedModelCompatibilityHarnessV1 {
  readonly protocolVersion: 1;
  stage(request: SharedModelCompatibilityStageRequestV1): Promise<void>;
  run(timeoutMs: number): Promise<SharedModelCompatibilityComparisonResultV1>;
  dispose(): Promise<void>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

export function isBoundedIdentity(value: unknown, maximum = 160): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function isSharedModelCompatibilityFailureReason(value: unknown): value is string {
  return typeof value === "string"
    && /^shared-model-compatibility-worker-failed:(?:request|initialization|baseline-(?:load|case-[0-9]{3}|dispose)|candidate-(?:load|case-[0-9]{3}|dispose)|comparison|dispose):[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
    && value.length <= 180;
}

export function isCompatibilityAcquisitionUrl(
  value: unknown,
  trustedOrigin: string,
  family?: SharedModelCompatibilityRoleV1 | "runtime",
): boolean {
  if (typeof value !== "string" || value.includes("%")) return false;
  try {
    const origin = new URL(trustedOrigin);
    const url = new URL(value, trustedOrigin);
    const familyPattern = family === undefined
      ? "(?:baseline|candidate|runtime)"
      : family;
    return url.origin === origin.origin
      && url.username === "" && url.password === ""
      && url.search === "" && url.hash === ""
      && new RegExp(
        `^/__shared_model_compatibility_staging__/${familyPattern}/\\d+$`,
        "u",
      ).test(url.pathname);
  } catch {
    return false;
  }
}

function expectedMove(ordinal: number): NarratorMoveV1 | null {
  const seed = Math.floor(ordinal / 10);
  const slot = ordinal % 10;
  const scenario = slot === 9 ? seed % 9 : slot;
  if (scenario <= 4) return "establish-setting";
  if (scenario <= 6) return "shade-atmosphere";
  if (scenario <= 8) return "register-pressure";
  return null;
}

export function isCompatibilityCaseResult(
  value: unknown,
  expectedOrdinal?: number,
): value is SharedModelCompatibilityCaseResultV1 {
  if (!hasExactKeys(value, [
    "baselineForm", "elapsedMs", "eligible", "fallbackUsed", "id", "inputTokens",
    "lineHash", "move", "ordinal", "outputTokens", "promptHash", "safe", "seedId",
    "selectedFormId",
  ])
    || !Number.isSafeInteger(value.ordinal)
    || Number(value.ordinal) < 0
    || Number(value.ordinal) >= sharedModelCompatibilityCaseCount
    || (expectedOrdinal !== undefined && value.ordinal !== expectedOrdinal)
    || value.id !== `narrator-eval-v1:${String(Math.floor(Number(value.ordinal) / 10)).padStart(2, "0")}:${String(Number(value.ordinal) % 10).padStart(2, "0")}`
    || value.seedId !== `narrator-eval-seed:${String(Math.floor(Number(value.ordinal) / 10)).padStart(2, "0")}`
    || value.move !== expectedMove(Number(value.ordinal))
    || typeof value.promptHash !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.promptHash)
    || !isLiveNarratorFormId(value.selectedFormId)
    || typeof value.lineHash !== "string"
    || !/^[0-9a-f]{16}$/u.test(value.lineHash)
    || !Number.isSafeInteger(value.inputTokens)
    || Number(value.inputTokens) < 1
    || Number(value.inputTokens) > 320
    || !Number.isSafeInteger(value.outputTokens)
    || Number(value.outputTokens) < 1
    || Number(value.outputTokens) > 48
    || typeof value.baselineForm !== "boolean"
    || value.safe !== true
    || value.eligible !== true
    || value.fallbackUsed !== false
    || !Number.isSafeInteger(value.elapsedMs)
    || Number(value.elapsedMs) < 0) return false;
  return true;
}

export function isCompatibilityRunResult(
  value: unknown,
  expectedAggregateSha256?: string,
): value is SharedModelCompatibilityRunResultV1 {
  return hasExactKeys(value, [
    "aggregateSha256", "cases", "loadElapsedMs", "tokenizerVerified",
  ])
    && isSha256(value.aggregateSha256)
    && (expectedAggregateSha256 === undefined
      || value.aggregateSha256 === expectedAggregateSha256)
    && Number.isSafeInteger(value.loadElapsedMs)
    && Number(value.loadElapsedMs) >= 0
    && value.tokenizerVerified === true
    && Array.isArray(value.cases)
    && value.cases.length === sharedModelCompatibilityCaseCount
    && value.cases.every((entry, index) => isCompatibilityCaseResult(entry, index));
}

export function isWorkerResponseForRequest(
  value: unknown,
  request: SharedModelCompatibilityWorkerRequestV1,
): value is SharedModelCompatibilityWorkerResponseV1 {
  if (!isRecord(value)
    || value.protocolVersion !== sharedModelCompatibilityProtocolVersion
    || value.runId !== request.runId
    || value.operationId !== request.operationId) return false;
  if (value.kind === "failed") {
    return hasExactKeys(value, [
      "kind", "operationId", "protocolVersion", "reason", "runId",
    ]) && isSharedModelCompatibilityFailureReason(value.reason);
  }
  if (request.kind === "initialize") {
    return value.kind === "initialized"
      && hasExactKeys(value, ["kind", "operationId", "protocolVersion", "runId"]);
  }
  if (request.kind === "dispose") {
    return value.kind === "disposed"
      && hasExactKeys(value, ["kind", "operationId", "protocolVersion", "runId"]);
  }
  const baseline = value.baseline;
  const candidate = value.candidate;
  if (value.kind !== "complete"
    || !hasExactKeys(value, [
      "baseline", "candidate", "exactFormParityCount", "kind", "operationId",
      "protocolVersion", "runId",
    ])
    || !isCompatibilityRunResult(baseline)
    || !isCompatibilityRunResult(candidate)
    || !Number.isSafeInteger(value.exactFormParityCount)
    || Number(value.exactFormParityCount) < 0
    || Number(value.exactFormParityCount) > sharedModelCompatibilityCaseCount) {
    return false;
  }
  const exactFormParityCount = baseline.cases.reduce(
    (count, row, ordinal) => count + (
      row.selectedFormId === candidate.cases[ordinal]?.selectedFormId
      && row.lineHash === candidate.cases[ordinal]?.lineHash
        ? 1
        : 0
    ),
    0,
  );
  return value.exactFormParityCount === exactFormParityCount;
}
