import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import { createNarratorEvaluationRunSpecV2 } from "./evaluation-contract-v2";
import { createNarratorEvaluationRunSpecV3 } from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormsV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
  type NarratorFormTargetSetV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV2,
  createNarratorEvaluationWorkerCaseResponseV2,
  isNarratorEvaluationWorkerCaseRequestV2,
  isNarratorEvaluationWorkerCaseResponseForRequestV2,
} from "./evaluation-worker-protocol-v2";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
  isNarratorEvaluationWorkerCaseRequestV3,
  isNarratorEvaluationWorkerCaseResponseForRequestV3,
  narratorEvaluationWorkerMaximumEnvelopeBytesV3,
  type NarratorEvaluationTargetObservationV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerResponseFieldsV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";
import { narratorEnvelopeByteLength, type NarratorRequestEnvelope } from "./protocol";

type MutableRecord = Record<string, unknown>;

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function rehashedMutation(value: object, mutate: (copy: MutableRecord) => void): MutableRecord {
  const content = structuredClone(value) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

function requestFixture(ordinal = 0, priorForm: NarratorFormIdV3 | null = null, priorHash: string | null = null) {
  const model = candidate();
  const runSpec = createNarratorEvaluationRunSpecV3(model, "run:protocol:v3");
  const request = createNarratorEvaluationWorkerCaseRequestV3(
    runSpec,
    model,
    ordinal,
    "worker-epoch:v3",
    priorForm,
    priorHash,
  );
  return { model, runSpec, request };
}

function targetObservations(request: NarratorEvaluationWorkerCaseRequestV3): readonly NarratorEvaluationTargetObservationV3[] {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const forms = new Map(narratorFormsV3(prompt).map((form) => [form.formId, form]));
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = forms.get(formId)!;
    return { formId, tokenIds: [...form.targetTokenIds], decodedWitness: form.witness };
  });
}

function traceFor(
  request: NarratorEvaluationWorkerCaseRequestV3,
  targetSet: NarratorFormTargetSetV3,
  selectionTokenIds: readonly number[],
): readonly NarratorFormSelectionTraceStepV3[] {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const prefix: number[] = [];
  return selectionTokenIds.map((emittedTokenId) => {
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(prompt, request.eligibility, targetSet, prefix);
    const step = {
      prefixTokenIds: [...prefix],
      allowedTokenIds: [...allowedTokenIds],
      allowedScoreBits: allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 2 : -2)),
      emittedTokenId,
    };
    prefix.push(emittedTokenId);
    return step;
  });
}

function selectedFields(request: NarratorEvaluationWorkerCaseRequestV3): NarratorEvaluationWorkerResponseFieldsV3 {
  const observations = targetObservations(request);
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const targetSet = accountNarratorFormTargetsV3(prompt, request.eligibility, observations);
  const selected = targetSet.targets.find((target) => target.formId !== request.eligibility.baselineFormId)
    ?? targetSet.targets[0]!;
  return {
    outcome: "selected",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [0, ...selected.tokenIds],
    selectionTrace: traceFor(request, targetSet, selected.tokenIds),
  };
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeeplyFrozen);
}

describe("narrator V3 evaluation worker protocol", () => {
  it("derives and freezes exact request identity, prompt, eligibility, and response-chain bindings", () => {
    const { model, runSpec, request } = requestFixture();
    expect(isNarratorEvaluationWorkerCaseRequestV3(request, runSpec, model, null, null)).toBe(true);
    expect(request).toMatchObject({
      schemaVersion: 3,
      protocolVersion: 3,
      kind: "run-form-case",
      ordinal: 0,
      priorWorkerResponseHash: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(request.requestId).toMatch(/^case:000:[0-9a-f]{16}$/u);
    expect(Object.hasOwn(request, "prompt")).toBe(false);
    expect(isDeeplyFrozen(request)).toBe(true);

    const priorHash = "1".repeat(16);
    const next = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      model,
      1,
      "worker-epoch:v3",
      "establish-gathers",
      priorHash,
    );
    expect(next.eligibility).toMatchObject({
      sequenceSlot: 1,
      priorSelectedFormId: "establish-gathers",
      suppressedFormId: "establish-gathers",
    });
    expect(isNarratorEvaluationWorkerCaseRequestV3(
      next,
      runSpec,
      model,
      "establish-gathers",
      priorHash,
    )).toBe(true);
    expect(isNarratorEvaluationWorkerCaseRequestV3(next, runSpec, model, "establish-holds", priorHash)).toBe(false);
    expect(isNarratorEvaluationWorkerCaseRequestV3(next, runSpec, model, "establish-gathers", "2".repeat(16)))
      .toBe(false);
  });

  it("rejects invalid chain position, even-slot history, replay, and rehashed same-move prompt substitution", () => {
    const { model, runSpec, request } = requestFixture();
    expect(() => createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 0, "worker-epoch:v3", null, "1".repeat(16),
    )).toThrow(TypeError);
    expect(() => createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 1, "worker-epoch:v3", null, null,
    )).toThrow(TypeError);
    expect(() => createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 2, "worker-epoch:v3", "establish-gathers", "1".repeat(16),
    )).toThrow(TypeError);

    const anotherRun = createNarratorEvaluationRunSpecV3(model, "run:protocol:v3:other");
    expect(isNarratorEvaluationWorkerCaseRequestV3(request, anotherRun, model, null, null)).toBe(false);
    const next = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 1, "worker-epoch:v3", "establish-gathers", "1".repeat(16),
    );
    expect(isNarratorEvaluationWorkerCaseRequestV3(next, runSpec, model, null, "1".repeat(16))).toBe(false);

    const crossPrompt = rehashedMutation(request, (copy) => {
      copy.ordinal = 1;
      copy.caseId = narratorEvaluationCasesV1[1]!.id;
      copy.caseHash = canonicalHash(narratorEvaluationCasesV1[1]!);
      copy.promptBytesHash = next.promptBytesHash;
      copy.eligibility = next.eligibility;
      copy.priorWorkerResponseHash = next.priorWorkerResponseHash;
    });
    expect(isNarratorEvaluationWorkerCaseRequestV3(
      crossPrompt,
      runSpec,
      model,
      "establish-gathers",
      "1".repeat(16),
    )).toBe(false);
  });

  it("accepts a raw selected trace and does not expose form or prose authority", () => {
    const { request } = requestFixture();
    const source = selectedFields(request);
    const response = createNarratorEvaluationWorkerCaseResponseV3(request, source);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(response, request)).toBe(true);
    expect(response).toMatchObject({
      outcome: "selected",
      promptBytesHash: request.promptBytesHash,
      eligibilityHash: request.eligibility.contentHash,
      requestHash: request.contentHash,
      priorWorkerResponseHash: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    for (const forbidden of ["selectedFormId", "decodedText", "renderedText", "targetSet", "selection"]) {
      expect(Object.hasOwn(response, forbidden)).toBe(false);
    }
    expect(isDeeplyFrozen(response)).toBe(true);
    expect(response.inputTokenIds).not.toBe(source.inputTokenIds);
    expect(response.targetObservations).not.toBe(source.targetObservations);
    expect(response.selectionTrace).not.toBe(source.selectionTrace);
  });

  it("enforces all error-stage evidence shapes and retains failing target observations", () => {
    const { request } = requestFixture();
    const observations = targetObservations(request);
    const good = selectedFields(request);
    const validFields: readonly NarratorEvaluationWorkerResponseFieldsV3[] = [
      { outcome: "prompt-format-error", inputTokenIds: null, observedInputTokens: null, targetObservations: null, fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "input-tokenizer-error", inputTokenIds: null, observedInputTokens: null, targetObservations: null, fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "input-token-contract-error", inputTokenIds: [9], observedInputTokens: null, targetObservations: null, fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "input-budget", inputTokenIds: null, observedInputTokens: 321, targetObservations: null, fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "target-tokenizer-error", inputTokenIds: [9, 1], observedInputTokens: null, targetObservations: null, fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "target-token-contract-error", inputTokenIds: [9, 1], observedInputTokens: null, targetObservations: [{ ...observations[0]!, tokenIds: [9, 1] }], fullDecoderTokenIds: null, selectionTrace: null },
      { outcome: "generation-error", inputTokenIds: [9, 1], observedInputTokens: null, targetObservations: observations, fullDecoderTokenIds: null, selectionTrace: null },
      { ...good, outcome: "selection-contract-error", fullDecoderTokenIds: [0], selectionTrace: [] },
      good,
    ];
    for (const fields of validFields) {
      const response = createNarratorEvaluationWorkerCaseResponseV3(request, fields);
      expect(response.outcome).toBe(fields.outcome);
      expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(response, request)).toBe(true);
    }
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      ...good, outcome: "selection-contract-error",
    })).toThrow(TypeError);
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      ...good, fullDecoderTokenIds: [0], selectionTrace: [],
    })).toThrow(TypeError);
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      outcome: "target-token-contract-error",
      inputTokenIds: [9, 1],
      observedInputTokens: null,
      targetObservations: observations,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    })).toThrow(TypeError);
  });

  it("retains a bounded over-limit target vector only as target-contract-error evidence", () => {
    const { request } = requestFixture();
    const observations = targetObservations(request);
    const overLimitObservations = [
      { ...observations[0]!, tokenIds: [...Array(48).fill(9), 1] },
    ];
    const failureFields: NarratorEvaluationWorkerResponseFieldsV3 = {
      outcome: "target-token-contract-error",
      inputTokenIds: [9, 1],
      observedInputTokens: null,
      targetObservations: overLimitObservations,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    };
    const response = createNarratorEvaluationWorkerCaseResponseV3(request, failureFields);
    expect(response.targetObservations?.[0]?.tokenIds).toHaveLength(49);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(response, request)).toBe(true);
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      ...failureFields,
      outcome: "generation-error",
    })).toThrow(TypeError);
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      ...failureFields,
      outcome: "selected",
      fullDecoderTokenIds: [0],
      selectionTrace: [],
    })).toThrow(TypeError);
  });

  it("rejects response replay across prompt, epoch, request hash, and response-chain identity", () => {
    const { model, runSpec, request } = requestFixture();
    const response = createNarratorEvaluationWorkerCaseResponseV3(request, selectedFields(request));
    const next = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 1, "worker-epoch:v3", "establish-gathers", response.contentHash,
    );
    const otherEpoch = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 0, "worker-epoch:v3:other", null, null,
    );
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(response, next)).toBe(false);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(response, otherEpoch)).toBe(false);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(
      rehashedMutation(response, (copy) => { copy.requestHash = "0".repeat(16); }),
      request,
    )).toBe(false);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(
      rehashedMutation(response, (copy) => { copy.priorWorkerResponseHash = "0".repeat(16); }),
      request,
    )).toBe(false);
  });

  it("rejects extra properties, sparse arrays, and structurally valid oversized envelopes", () => {
    const { model, runSpec, request } = requestFixture();
    const fields = selectedFields(request);
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, { ...fields, extra: true } as never))
      .toThrow(TypeError);
    const sparse = new Array<number>(2);
    sparse[1] = 1;
    expect(() => createNarratorEvaluationWorkerCaseResponseV3(request, {
      ...fields,
      outcome: "input-token-contract-error",
      inputTokenIds: sparse,
      targetObservations: null,
      fullDecoderTokenIds: null,
      selectionTrace: null,
    })).toThrow(TypeError);
    const eligibleWithExtra = Object.assign([...request.eligibility.eligibleFormIds], { extra: true });
    const sparseRequest = rehashedMutation(request, (copy) => {
      copy.eligibility = rehashedMutation(request.eligibility, (eligibility) => {
        eligibility.eligibleFormIds = eligibleWithExtra;
      });
    });
    expect(isNarratorEvaluationWorkerCaseRequestV3(sparseRequest, runSpec, model, null, null)).toBe(false);

    const response = createNarratorEvaluationWorkerCaseResponseV3(request, fields);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3({ ...response, extra: true }, request)).toBe(false);
    const hugeTrace = Array.from({ length: 48 }, (_, index) => ({
      prefixTokenIds: Array(48).fill(Number.MAX_SAFE_INTEGER),
      allowedTokenIds: [1, 2, 3, 4],
      allowedScoreBits: [0, 1, 2, 3],
      emittedTokenId: index + 1,
    }));
    const oversized = rehashedMutation(response, (copy) => {
      copy.outcome = "selection-contract-error";
      copy.fullDecoderTokenIds = [0];
      copy.selectionTrace = hugeTrace;
    });
    expect(narratorEnvelopeByteLength(oversized)).toBeGreaterThan(narratorEvaluationWorkerMaximumEnvelopeBytesV3);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(oversized, request)).toBe(false);
  });

  it("rejects authentic V1/V2 envelopes in both directions", () => {
    const { model, runSpec, request } = requestFixture();
    const v1: NarratorRequestEnvelope = {
      protocolVersion: 1,
      campaignId: "campaign:v1",
      workerEpoch: "worker:v1",
      requestId: "request:v1",
      kind: "dispose",
      payload: {},
    };
    expect(isNarratorEvaluationWorkerCaseRequestV3(v1, runSpec, model, null, null)).toBe(false);

    const v2RunSpec = createNarratorEvaluationRunSpecV2(model, "run:protocol:v2");
    const v2Request = createNarratorEvaluationWorkerCaseRequestV2(
      v2RunSpec, model, 0, "worker-epoch:v2", "request:v2",
    );
    const v2Response = createNarratorEvaluationWorkerCaseResponseV2(v2Request, {
      outcome: "prompt-format-error",
      inputTokenIds: null,
      fullDecoderTokenIds: null,
      decodedText: null,
    });
    expect(isNarratorEvaluationWorkerCaseRequestV3(v2Request, runSpec, model, null, null)).toBe(false);
    expect(isNarratorEvaluationWorkerCaseRequestV2(request, v2RunSpec, model)).toBe(false);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV3(v2Response, request)).toBe(false);
    const v3Response = createNarratorEvaluationWorkerCaseResponseV3(request, selectedFields(request));
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV2(v3Response, v2Request)).toBe(false);
  });
});
