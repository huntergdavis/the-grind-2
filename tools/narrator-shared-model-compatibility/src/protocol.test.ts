import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalHash } from "../../../src/core/canonical";
import {
  localNarratorModelArtifacts,
  localNarratorModelRevision,
} from "../../../src/narrator/local-model-assets";
import type { NarratorMoveV1 } from "../../../src/narrator/protocol";
import {
  isCompatibilityAcquisitionUrl,
  isCompatibilityCaseResult,
  isCompatibilityRunResult,
  isWorkerResponseForRequest,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityProtocolVersion,
  type SharedModelCompatibilityCaseResultV1,
  type SharedModelCompatibilityWorkerRequestV1,
} from "./protocol";

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
  it("locks the browser boundary to the pinned baseline closure", () => {
    const productionManifest = localNarratorModelArtifacts.map(
      ({ byteLength, path, sha256 }) => ({ byteLength, path, sha256 }),
    );
    const productionAggregate = createHash("sha256")
      .update(JSON.stringify(productionManifest))
      .digest("hex");
    expect(localNarratorModelRevision).toBe(
      "edf60fc44500b19407f6216e1777c3e34224b937",
    );
    expect(productionManifest.map((entry) => entry.path))
      .toEqual([...sharedModelCompatibilityModelPaths]);
    expect(sharedModelCompatibilityBaselineAggregateSha256).toBe(
      "4aeb36097c54d457e2f4b83acdf3c893528265c7c7a2b7605ce9e52537b1f7e0",
    );
    expect(productionAggregate).toBe(sharedModelCompatibilityBaselineAggregateSha256);
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
