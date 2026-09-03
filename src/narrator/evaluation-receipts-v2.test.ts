import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV2,
  createNarratorRunReceiptV2,
  isNarratorCaseReceiptV2,
  isNarratorRunReceiptV2,
} from "./evaluation-receipts-v2";
import { isNarratorRunReceiptV1 } from "./evaluation-receipts";
import {
  createNarratorEvaluationWorkerCaseRequestV2,
  createNarratorEvaluationWorkerCaseResponseV2,
  isNarratorEvaluationWorkerCaseRequestV2,
  isNarratorEvaluationWorkerCaseResponseForRequestV2,
} from "./evaluation-worker-protocol-v2";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function artifacts(model: NarratorModelCandidate) {
  return model.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
}

function successfulReceipt(model = candidate(), runId = "run:v2:receipt") {
  const runSpec = createNarratorEvaluationRunSpecV2(model, runId);
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) => createNarratorCaseReceiptV2({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status: "ok",
    inputTokenIds: [100 + ordinal, 1],
    fullDecoderTokenIds: [0, 200 + ordinal, 1],
    outputText: entry.allowedOutputs[1]!,
    latencyMilliseconds: 20 + ordinal,
  }));
  return createNarratorRunReceiptV2({
    runSpec,
    workerEpoch: "worker-epoch:test",
    workerBinding: createNarratorEvaluationWorkerBindingV2(runSpec, model),
    verifiedArtifacts: artifacts(model),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 4 },
    termination: { status: "not-requested" },
  });
}

function rehash<T extends Record<string, unknown>>(value: T): T {
  const { contentHash: _contentHash, ...content } = value;
  return { ...content, contentHash: canonicalHash(content) } as unknown as T;
}

describe("narrator V2 evaluation worker protocol", () => {
  it("carries only frozen case identity and never prompt or display authority", () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:request");
    const request = createNarratorEvaluationWorkerCaseRequestV2(
      runSpec, model, 73, "worker-epoch:one", "request:73",
    );
    expect(isNarratorEvaluationWorkerCaseRequestV2(request, runSpec, model)).toBe(true);
    expect(request).toMatchObject({
      schemaVersion: 2,
      protocolVersion: 2,
      kind: "run-case",
      ordinal: 73,
      caseId: narratorEvaluationCasesV1[73]!.id,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("deterministicBaseline");
    expect(serialized).not.toContain("allowedOutputs");
    expect(Object.isFrozen(request)).toBe(true);
    expect(isNarratorEvaluationWorkerCaseRequestV2({ ...request, displayAuthorized: true }, runSpec, model)).toBe(false);
  });

  it("binds bounded raw token evidence to one exact request identity", () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:response");
    const request = createNarratorEvaluationWorkerCaseRequestV2(
      runSpec, model, 0, "worker-epoch:one", "request:zero",
    );
    const response = createNarratorEvaluationWorkerCaseResponseV2(request, {
      outcome: "generated",
      inputTokenIds: [71, 1],
      fullDecoderTokenIds: [0, 81, 1],
      decodedText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]!,
    });
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV2(response, request)).toBe(true);
    expect(response.inputTokenIds).toEqual([71, 1]);
    expect(response.fullDecoderTokenIds).toEqual([0, 81, 1]);
    expect(Object.isFrozen(response.fullDecoderTokenIds)).toBe(true);
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV2(
      rehash({ ...response, requestId: "request:replay" }), request,
    )).toBe(false);
    expect(() => createNarratorEvaluationWorkerCaseResponseV2(request, {
      outcome: "generated",
      inputTokenIds: [71, 1],
      fullDecoderTokenIds: Array.from({ length: 50 }, (_, index) => index),
      decodedText: "bounded",
    })).toThrow();
    const sparseInput = Array<number>(2);
    sparseInput[1] = 1;
    expect(isNarratorEvaluationWorkerCaseResponseForRequestV2(
      rehash({ ...response, inputTokenIds: sparseInput }), request,
    )).toBe(false);
  });
});

describe("narrator V2 evaluation receipts", () => {
  it("derives EOS-inclusive counts and stop reason from retained raw ids", () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:raw-accounting");
    const row = createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal: 0,
      status: "ok",
      inputTokenIds: [31, 32, 1],
      fullDecoderTokenIds: [0, 41, 42, 1],
      outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[1]!,
      latencyMilliseconds: 19.9,
    });
    expect(isNarratorCaseReceiptV2(row, runSpec, 0)).toBe(true);
    expect(row).toMatchObject({
      inputTokens: 3,
      outputTokens: 3,
      generationStopReason: "model-eos",
      latencyMilliseconds: 19,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(Object.isFrozen(row.inputTokenIds)).toBe(true);
    expect(Object.isFrozen(row.fullDecoderTokenIds)).toBe(true);
  });

  it("represents input and generated-token contract failures before decoded text exists", () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:contract-failures");
    const inputFailure = createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal: 0,
      status: "input-token-contract-error",
      inputTokenIds: [55],
      latencyMilliseconds: 2,
    });
    const generationFailure = createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal: 1,
      status: "generated-token-contract-error",
      inputTokenIds: [55, 1],
      fullDecoderTokenIds: [0, 77],
      latencyMilliseconds: 3,
    });
    expect(inputFailure).toMatchObject({ inputTokens: null, outputTokens: null, outputText: null });
    expect(generationFailure).toMatchObject({ inputTokens: 2, outputTokens: null, outputText: null });
    expect(isNarratorCaseReceiptV2(inputFailure, runSpec, 0)).toBe(true);
    expect(isNarratorCaseReceiptV2(generationFailure, runSpec, 1)).toBe(true);
    expect(() => createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal: 1,
      status: "ok",
      inputTokenIds: [55, 1],
      fullDecoderTokenIds: [0, 77],
      outputText: narratorEvaluationCasesV1[1]!.allowedOutputs[1]!,
      latencyMilliseconds: 3,
    })).toThrow();
  });

  it("binds the exact worker, six artifacts, 200 ordered rows, and no authority", () => {
    const model = candidate();
    const receipt = successfulReceipt(model);
    expect(isNarratorRunReceiptV2(receipt, model)).toBe(true);
    expect(receipt.verifiedArtifacts).toHaveLength(6);
    expect(receipt.rows).toHaveLength(200);
    expect(receipt.completedRowCount).toBe(200);
    expect(receipt.modelAdmitted).toBe(false);
    expect(receipt.displayAuthorized).toBe(false);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.rows)).toBe(true);
    expect(isNarratorRunReceiptV1(receipt, model)).toBe(false);
  });

  it("rejects forged raw counts and causally impossible histories after rehashing", () => {
    const model = candidate();
    const receipt = successfulReceipt(model, "run:v2:mutations");
    const forgedRow = rehash({ ...receipt.rows[0]!, outputTokens: 99 });
    const forgedRows = [forgedRow, ...receipt.rows.slice(1)];
    const forgedReceipt = rehash({ ...receipt, rows: forgedRows });
    expect(isNarratorRunReceiptV2(forgedReceipt, model)).toBe(false);

    const terminalRow = createNarratorCaseReceiptV2({
      runSpecHash: receipt.runSpec.contentHash,
      ordinal: 2,
      status: "case-timeout",
      latencyMilliseconds: 8_000,
    });
    const continuedRows = [receipt.rows[0]!, receipt.rows[1]!, terminalRow, ...receipt.rows.slice(3)];
    const impossible = createNarratorRunReceiptV2({
      ...receipt,
      rows: continuedRows,
      dispose: { status: "not-attempted", latencyMilliseconds: 0 },
      termination: { status: "requested" },
    });
    expect(isNarratorRunReceiptV2(impossible, model)).toBe(false);
    expect(isNarratorRunReceiptV2(rehash({ ...receipt, modelAdmitted: true }), model)).toBe(false);
    const sparseRows = Array(receipt.rows.length);
    const sparseReceipt = rehash({ ...receipt, rows: sparseRows });
    expect(() => isNarratorRunReceiptV2(sparseReceipt, model)).not.toThrow();
    expect(isNarratorRunReceiptV2(sparseReceipt, model)).toBe(false);
    const sparseArtifacts = Array(1);
    const sparseArtifactReceipt = rehash({ ...receipt, verifiedArtifacts: sparseArtifacts });
    expect(() => isNarratorRunReceiptV2(sparseArtifactReceipt, model)).not.toThrow();
    expect(isNarratorRunReceiptV2(sparseArtifactReceipt, model)).toBe(false);
  });

  it("permits only binding and artifact evidence observable at each load stage", () => {
    const model = candidate();
    const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:load-matrix");
    const binding = createNarratorEvaluationWorkerBindingV2(runSpec, model);
    const notRunRows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV2({
      runSpecHash: runSpec.contentHash,
      ordinal,
      status: "not-run",
      latencyMilliseconds: 0,
    }));
    const failed = (overrides: Parameters<typeof createNarratorRunReceiptV2>[0]) =>
      createNarratorRunReceiptV2(overrides);
    const modelMismatch = failed({
      runSpec,
      workerEpoch: "worker-epoch:load-matrix",
      workerBinding: null,
      verifiedArtifacts: [],
      load: { stage: "model-identity", status: "model-id-mismatch", latencyMilliseconds: 1 },
      rows: notRunRows,
      dispose: { status: "not-attempted", latencyMilliseconds: 0 },
      termination: { status: "requested" },
    });
    expect(isNarratorRunReceiptV2(modelMismatch, model)).toBe(true);
    expect(isNarratorRunReceiptV2(failed({ ...modelMismatch, workerBinding: binding }), model)).toBe(false);
    expect(isNarratorRunReceiptV2(failed({ ...modelMismatch, verifiedArtifacts: artifacts(model) }), model)).toBe(false);

    const artifactInvalid = failed({
      ...modelMismatch,
      workerBinding: binding,
      load: { stage: "artifact-verification", status: "artifact-evidence-invalid", latencyMilliseconds: 2 },
    });
    expect(isNarratorRunReceiptV2(artifactInvalid, model)).toBe(true);
    expect(isNarratorRunReceiptV2(failed({
      ...artifactInvalid,
      verifiedArtifacts: artifacts(model),
    }), model)).toBe(false);

    const mismatchedArtifacts = artifacts(model);
    mismatchedArtifacts[0] = { ...mismatchedArtifacts[0]!, sha256: "f".repeat(64) };
    const artifactMismatch = failed({
      ...modelMismatch,
      workerBinding: binding,
      verifiedArtifacts: mismatchedArtifacts,
      load: { stage: "artifact-verification", status: "artifact-mismatch", latencyMilliseconds: 3 },
    });
    expect(isNarratorRunReceiptV2(artifactMismatch, model)).toBe(true);
    expect(isNarratorRunReceiptV2(failed({
      ...artifactMismatch,
      workerBinding: null,
      verifiedArtifacts: [],
    }), model)).toBe(false);

    const modelLoadError = failed({
      ...modelMismatch,
      workerBinding: binding,
      verifiedArtifacts: artifacts(model),
      load: { stage: "model-load", status: "load-error", latencyMilliseconds: 4 },
      dispose: { status: "ok", latencyMilliseconds: 1 },
      termination: { status: "not-requested" },
    });
    expect(isNarratorRunReceiptV2(modelLoadError, model)).toBe(true);
  });
});
