import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorCaseReceiptV1,
  createNarratorEvaluationRunSpecV1,
  createNarratorEvaluationWorkerBindingV1,
  createNarratorRunReceiptV1,
  isNarratorEvaluationRunSpecV1,
  isNarratorEvaluationWorkerBindingV1,
  isNarratorRunReceiptV1,
  narratorArtifactManifestHash,
  narratorCandidateManifestHash,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorModelCandidateV2,
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidate,
  type NarratorModelCandidateV1,
  type NarratorModelCandidateV2,
} from "./model-candidate";

function benchmarkCandidate(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: { ...tinyStoriesInstruct33MInt8Candidate.model, license: "MIT", licenseStatus: "verified" },
  };
}

function t5Candidate(): NarratorModelCandidateV2 {
  return createNarratorModelCandidateV2({
    candidateId: "fictional-receipt-t5@aaaaaaaa",
    task: "single-ambient-line",
    modelFamily: "t5",
    sessions: [
      {
        runtimeSessionKey: "model",
        fileStem: "encoder_model",
        dtype: "q8",
        artifactPath: "onnx/encoder_model_quantized.onnx",
      },
      {
        runtimeSessionKey: "decoder_model_merged",
        fileStem: "decoder_model_merged",
        dtype: "q8",
        artifactPath: "onnx/decoder_model_merged_quantized.onnx",
      },
    ],
    model: {
      repository: "example/fictional-receipt-conversion",
      revision: "a".repeat(40),
      sourceRepository: "example/fictional-receipt-source",
      sourceRevision: "b".repeat(40),
      license: "MIT",
      licenseStatus: "verified",
    },
    runtime: { ...tinyStoriesInstruct33MInt8Candidate.runtime },
    execution: "wasm",
    artifacts: [
      { path: "onnx/encoder_model_quantized.onnx", role: "weights", byteLength: 40_000_000, sha256: "c".repeat(64) },
      { path: "onnx/decoder_model_merged_quantized.onnx", role: "weights", byteLength: 50_000_000, sha256: "d".repeat(64) },
      { path: "config.json", role: "configuration", byteLength: 1_000, sha256: "e".repeat(64) },
      { path: "tokenizer.json", role: "tokenizer", byteLength: 2_000, sha256: "f".repeat(64) },
    ],
    measuredIncrementalMemoryBytes: 200 * 1024 * 1024,
  });
}

function artifacts(candidate: NarratorModelCandidate): NarratorVerifiedArtifactV1[] {
  return candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
}

function successfulReceipt(candidate: NarratorModelCandidate = benchmarkCandidate()) {
  const runSpec = createNarratorEvaluationRunSpecV1(candidate, "run:receipts:v1");
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) => createNarratorCaseReceiptV1({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status: "ok",
    inputTokens: 40,
    outputTokens: 8,
    outputText: entry.allowedOutputs[1]!,
    latencyMilliseconds: 25 + ordinal,
  }));
  return createNarratorRunReceiptV1({
    runSpec,
    verifiedArtifacts: artifacts(candidate),
    load: { status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
  });
}

describe("narrator evaluation receipts", () => {
  it("preserves the released V1 canonical hash contract", () => {
    expect(narratorCandidateManifestHash(tinyStoriesInstruct33MInt8Candidate))
      .toBe("baa6fd8c14b96f19");
    expect(narratorArtifactManifestHash(tinyStoriesInstruct33MInt8Candidate))
      .toBe("3463d67bb2c733fe");
  });

  it("binds an exact run specification to candidate, artifacts, runtime, corpus, and decoding", () => {
    const candidate = benchmarkCandidate();
    const spec = createNarratorEvaluationRunSpecV1(candidate, "run:bound:v1");
    expect(isNarratorEvaluationRunSpecV1(spec, candidate)).toBe(true);
    expect(spec.candidate).toMatchObject({
      candidateId: candidate.candidateId,
      candidateManifestHash: narratorCandidateManifestHash(candidate),
      artifactManifestHash: narratorArtifactManifestHash(candidate),
      runtimeIntegrity: candidate.runtime.integrity,
    });
    expect(spec.corpus).toEqual({ version: 1, hash: "63b3a0ee9fef092a", caseCount: 200 });
    expect(spec.decoding).toMatchObject({ method: "greedy", doSample: false, maximumInputTokens: 320, maximumOutputTokens: 48 });
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.candidate)).toBe(true);
    const workerBinding = createNarratorEvaluationWorkerBindingV1(spec);
    expect(isNarratorEvaluationWorkerBindingV1(workerBinding, spec)).toBe(true);
    expect(workerBinding).toMatchObject({
      runSpecHash: spec.contentHash,
      runtimeVersion: candidate.runtime.version,
      runtimeIntegrity: candidate.runtime.integrity,
      corpusHash: spec.corpus.hash,
    });
    expect(isNarratorEvaluationWorkerBindingV1(
      { ...workerBinding, runtimeIntegrity: "sha512-wrong" }, spec,
    )).toBe(false);
  });

  it("validates every ordered row and nested content hash", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    expect(receipt.rows).toHaveLength(200);
    expect(receipt.completedRowCount).toBe(200);
    expect(new Set(receipt.rows.map((row) => row.caseId)).size).toBe(200);
    expect(Object.isFrozen(receipt.rows[0])).toBe(true);

    const alteredRow = { ...receipt.rows[0]!, inputTokens: 41 };
    const alteredRows = [alteredRow, ...receipt.rows.slice(1)];
    const alteredContent = { ...receipt, rows: alteredRows };
    const altered = { ...alteredContent, contentHash: canonicalHash({ ...alteredContent, contentHash: undefined }) };
    expect(isNarratorRunReceiptV1(altered, candidate)).toBe(false);
    expect(isNarratorRunReceiptV1({ ...receipt, extra: true }, candidate)).toBe(false);
    expect(isNarratorRunReceiptV1({ ...receipt, rows: [receipt.rows[1], receipt.rows[0], ...receipt.rows.slice(2)] }, candidate)).toBe(false);
  });

  it("accepts a structurally honest artifact-mismatch failure but never as a successful load", () => {
    const candidate = benchmarkCandidate();
    const runSpec = createNarratorEvaluationRunSpecV1(candidate, "run:artifact-mismatch");
    const rows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV1({
      runSpecHash: runSpec.contentHash,
      ordinal,
      status: "not-run",
      inputTokens: null,
      outputTokens: null,
      outputText: null,
      latencyMilliseconds: 0,
    }));
    const mismatched = artifacts(candidate);
    mismatched[0] = { ...mismatched[0]!, sha256: "f".repeat(64) };
    const receipt = createNarratorRunReceiptV1({
      runSpec,
      verifiedArtifacts: mismatched,
      load: { status: "artifact-mismatch", latencyMilliseconds: 10 },
      rows,
      dispose: { status: "hard-terminated", latencyMilliseconds: 0 },
    });
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);
    const claimedSuccess = createNarratorRunReceiptV1({ ...receipt, load: { status: "ok", latencyMilliseconds: 10 } });
    expect(isNarratorRunReceiptV1(claimedSuccess, candidate)).toBe(false);
  });

  it("rejects status relabeling even when the outer receipt hash is recomputed", () => {
    const candidate = benchmarkCandidate();
    const receipt = successfulReceipt(candidate);
    const unsafeOk = createNarratorCaseReceiptV1({
      runSpecHash: receipt.runSpec.contentHash,
      ordinal: 0,
      status: "ok",
      inputTokens: 40,
      outputTokens: 8,
      outputText: "A dragon grants five hundred gold.",
      latencyMilliseconds: 20,
    });
    const forged = createNarratorRunReceiptV1({
      ...receipt,
      rows: [unsafeOk, ...receipt.rows.slice(1)],
    });
    expect(isNarratorRunReceiptV1(forged, candidate)).toBe(false);
  });

  it("rejects causally impossible load, row, and disposal histories", () => {
    const candidate = benchmarkCandidate();
    const successful = successfulReceipt(candidate);
    expect(isNarratorRunReceiptV1(createNarratorRunReceiptV1({
      ...successful,
      load: { status: "load-error", latencyMilliseconds: 1 },
    }), candidate)).toBe(false);
    expect(isNarratorRunReceiptV1(createNarratorRunReceiptV1({
      ...successful,
      dispose: { status: "hard-terminated", latencyMilliseconds: 0 },
    }), candidate)).toBe(false);

    const timeoutRow = createNarratorCaseReceiptV1({
      runSpecHash: successful.runSpec.contentHash,
      ordinal: 2,
      status: "realizer-timeout",
      inputTokens: null,
      outputTokens: null,
      outputText: null,
      latencyMilliseconds: 8_000,
    });
    const rowAfterTimeout = createNarratorCaseReceiptV1({
      runSpecHash: successful.runSpec.contentHash,
      ordinal: 3,
      status: "ok",
      inputTokens: 40,
      outputTokens: 8,
      outputText: narratorEvaluationCasesV1[3]!.allowedOutputs[1]!,
      latencyMilliseconds: 20,
    });
    const impossibleContinuation = createNarratorRunReceiptV1({
      ...successful,
      rows: [successful.rows[0]!, successful.rows[1]!, timeoutRow, rowAfterTimeout, ...successful.rows.slice(4)],
      dispose: { status: "hard-terminated", latencyMilliseconds: 0 },
    });
    expect(isNarratorRunReceiptV1(impossibleContinuation, candidate)).toBe(false);
  });

  it("carries an exact two-session T5 candidate through the V1 receipt envelope", () => {
    const candidate = t5Candidate();
    const receipt = successfulReceipt(candidate);
    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.runSpec.schemaVersion).toBe(1);
    expect(receipt.verifiedArtifacts.filter((artifact) => artifact.path.startsWith("onnx/")))
      .toHaveLength(2);
    expect(isNarratorEvaluationRunSpecV1(receipt.runSpec, candidate)).toBe(true);
    expect(isNarratorRunReceiptV1(receipt, candidate)).toBe(true);

    const substituted = {
      ...candidate,
      sessions: [...candidate.sessions].reverse(),
    } as NarratorModelCandidateV2;
    expect(narratorCandidateManifestHash(substituted))
      .not.toBe(narratorCandidateManifestHash(candidate));
    expect(narratorArtifactManifestHash(substituted))
      .toBe(narratorArtifactManifestHash(candidate));
    expect(isNarratorEvaluationRunSpecV1(receipt.runSpec, substituted)).toBe(false);
    expect(isNarratorRunReceiptV1(receipt, substituted)).toBe(false);
  });
});
