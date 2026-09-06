import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalHash, canonicalStringify } from "../../../src/core/canonical";
import type { NarratorMoveV1 } from "../../../src/narrator/protocol";
import {
  isCompatibilityAcquisitionUrl,
  isCompatibilityCaseResult,
  isCompatibilityRunResult,
  isSharedModelCompatibilityFailureReason,
  isWorkerResponseForRequest,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityProtocolVersion,
  type SharedModelCompatibilityCaseResultV1,
  type SharedModelCompatibilityWorkerRequestV1,
} from "./protocol";

// The recorded V1 comparison used edf60fc44500b19407f6216e1777c3e34224b937.
// Keep that historical fixture independent of future production model upgrades.
// The active production pin is checked in src/narrator/local-model-assets.test.ts.
const historicalBaselineManifest = Object.freeze([
  { path: "config.json", byteLength: 1_506, sha256: "f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18" },
  { path: "generation_config.json", byteLength: 142, sha256: "8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737" },
  { path: "onnx/decoder_model_merged_quantized.onnx", byteLength: 59_041_810, sha256: "cc1b8d2b96ca051d06d47e9db1b1f1f0c131a6d2e6141b067ab9254c0545c36a" },
  { path: "onnx/encoder_model_quantized.onnx", byteLength: 35_612_462, sha256: "f8c68d0cd1f8773f3ae01a693f38dcffb6052dfb6566c52f633c16b49b6cc6fa" },
  { path: "tokenizer.json", byteLength: 2_422_234, sha256: "4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160" },
  { path: "tokenizer_config.json", byteLength: 20_830, sha256: "26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70" },
]);

function moveAt(ordinal: number): NarratorMoveV1 {
  const scenario = ordinal % 10 === 9
    ? Math.floor(ordinal / 10) % 9
    : ordinal % 10;
  if (scenario <= 4) return "establish-setting";
  if (scenario <= 6) return "shade-atmosphere";
  return "register-pressure";
}

function caseAt(ordinal: number): SharedModelCompatibilityCaseResultV1 {
  const move = moveAt(ordinal);
  return {
    ordinal,
    id: `narrator-eval-v1:${String(Math.floor(ordinal / 10)).padStart(2, "0")}:${String(ordinal % 10).padStart(2, "0")}`,
    seedId: `narrator-eval-seed:${String(Math.floor(ordinal / 10)).padStart(2, "0")}`,
    move,
    promptHash: canonicalHash({ ordinal }),
    selectedFormId: move === "establish-setting"
      ? "establish-holds"
      : move === "shade-atmosphere"
        ? "shade-holds-baseline"
        : "pressure-attention",
    lineHash: canonicalHash({ line: ordinal }),
    inputTokens: 12,
    outputTokens: 8,
    baselineForm: true,
    safe: true,
    eligible: true,
    fallbackUsed: false,
    elapsedMs: ordinal,
  };
}

describe("shared-model compatibility browser protocol", () => {
  it("accepts only bounded, normalized worker failure diagnostics", () => {
    expect(isSharedModelCompatibilityFailureReason(
      "shared-model-compatibility-worker-failed:baseline-case-083:selected-output-not-in-evaluation-policy",
    )).toBe(true);
    expect(isSharedModelCompatibilityFailureReason(
      "shared-model-compatibility-worker-failed:candidate-load:unexpected-error",
    )).toBe(true);
    expect(isSharedModelCompatibilityFailureReason(
      "shared-model-compatibility-worker-failed:baseline-case-83:selected-output-not-in-evaluation-policy",
    )).toBe(false);
    expect(isSharedModelCompatibilityFailureReason(
      "shared-model-compatibility-worker-failed:baseline-case-083:/private/path",
    )).toBe(false);
  });

  it("locks the browser boundary to the historical V1 baseline closure", () => {
    const historicalAggregate = createHash("sha256")
      .update(canonicalStringify(historicalBaselineManifest))
      .digest("hex");
    expect(historicalBaselineManifest.map((entry) => entry.path))
      .toEqual([...sharedModelCompatibilityModelPaths]);
    expect(sharedModelCompatibilityBaselineAggregateSha256).toBe(
      "4aeb36097c54d457e2f4b83acdf3c893528265c7c7a2b7605ce9e52537b1f7e0",
    );
    expect(historicalAggregate).toBe(sharedModelCompatibilityBaselineAggregateSha256);
  });

  it("accepts only exact same-origin acquisition routes", () => {
    const origin = "http://127.0.0.1:43121";
    expect(isCompatibilityAcquisitionUrl(
      `${origin}/__shared_model_compatibility_staging__/baseline/0`,
      origin,
    )).toBe(true);
    expect(isCompatibilityAcquisitionUrl(
      `${origin}/__shared_model_compatibility_staging__/candidate/5`,
      origin,
    )).toBe(true);
    expect(isCompatibilityAcquisitionUrl(
      `${origin}/__shared_model_compatibility_staging__/runtime/1`,
      origin,
    )).toBe(true);
    for (const value of [
      "https://outside.example/__shared_model_compatibility_staging__/baseline/0",
      `${origin}/__shared_model_compatibility_staging__/baseline/0?x=1`,
      `${origin}/__shared_model_compatibility_staging__/baseline/%30`,
      `${origin}/__shared_model_compatibility_staging__/holdout/0`,
      `${origin}/__shared_model_compatibility_staging__/baseline/-1`,
    ]) expect(isCompatibilityAcquisitionUrl(value, origin)).toBe(false);
  });

  it("validates one complete ordered 200-case model result", () => {
    const aggregate = "a".repeat(64);
    const value = {
      aggregateSha256: aggregate,
      loadElapsedMs: 4,
      tokenizerVerified: true,
      cases: Array.from({ length: sharedModelCompatibilityCaseCount }, (_, index) =>
        caseAt(index)),
    };
    expect(isCompatibilityRunResult(value, aggregate)).toBe(true);
    expect(isCompatibilityRunResult({
      ...value,
      cases: value.cases.slice(1),
    }, aggregate)).toBe(false);
    expect(isCompatibilityCaseResult({
      ...value.cases[0],
      fallbackUsed: true,
    })).toBe(false);
  });

  it("binds responses to the exact request identity and closed shape", () => {
    const request: SharedModelCompatibilityWorkerRequestV1 = {
      protocolVersion: sharedModelCompatibilityProtocolVersion,
      kind: "run",
      runId: "fixture-run",
      operationId: "fixture-run:run:0",
    };
    const result = {
      aggregateSha256: "a".repeat(64),
      loadElapsedMs: 4,
      tokenizerVerified: true,
      cases: Array.from({ length: sharedModelCompatibilityCaseCount }, (_, index) =>
        caseAt(index)),
    };
    const response = {
      protocolVersion: sharedModelCompatibilityProtocolVersion,
      kind: "complete",
      runId: request.runId,
      operationId: request.operationId,
      baseline: result,
      candidate: { ...result, aggregateSha256: "b".repeat(64) },
      exactFormParityCount: sharedModelCompatibilityCaseCount,
    };
    expect(isWorkerResponseForRequest(response, request)).toBe(true);
    expect(isWorkerResponseForRequest({
      ...response,
      operationId: "stale",
    }, request)).toBe(false);
    expect(isWorkerResponseForRequest({
      ...response,
      extra: true,
    }, request)).toBe(false);
    const candidateCases = result.cases.map((entry, index) => index === 0
      ? { ...entry, lineHash: canonicalHash({ line: "drift" }) }
      : entry);
    expect(isWorkerResponseForRequest({
      ...response,
      candidate: {
        ...response.candidate,
        cases: candidateCases,
      },
    }, request)).toBe(false);
    expect(isWorkerResponseForRequest({
      ...response,
      candidate: {
        ...response.candidate,
        cases: candidateCases,
      },
      exactFormParityCount: sharedModelCompatibilityCaseCount - 1,
    }, request)).toBe(true);
  });
});
