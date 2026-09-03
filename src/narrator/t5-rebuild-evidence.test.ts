import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-rebuild-receipt.json";
import { canonicalHash } from "../core/canonical";
import { narratorCandidateManifestBlockers } from "./model-candidate";
import {
  createNarratorT5CandidateFromRebuildReceiptV1,
  createNarratorT5RebuildReceiptV1,
  isNarratorT5RebuildReceiptV1,
  narratorT5RebuildMaximumRuntimeBytes,
  narratorT5RebuildRecipeV1,
  narratorT5RebuildSessionsV1,
  narratorT5RebuildSourceV1,
  narratorT5RebuildToolchainV1,
  narratorT5RebuildToolchainLockSha256V1,
  type NarratorT5RebuildReceiptV1,
} from "./t5-rebuild-evidence";

const sha = (digit: string): string => digit.repeat(64);

function artifact(path: string, role: "weights" | "tokenizer" | "configuration", byteLength: number, digit: string) {
  return { path, role, byteLength, sha256: sha(digit) };
}

function fixture(): NarratorT5RebuildReceiptV1 {
  const runtimeArtifacts = [
    artifact("config.json", "configuration", 1_000, "1"),
    artifact("generation_config.json", "configuration", 100, "2"),
    artifact("onnx/decoder_model_merged_quantized.onnx", "weights", 50_000_000, "3"),
    artifact("onnx/encoder_model_quantized.onnx", "weights", 40_000_000, "4"),
    artifact("tokenizer.json", "tokenizer", 2_000, "5"),
    artifact("tokenizer_config.json", "tokenizer", 500, "6"),
  ];
  const run = (ordinal: 1 | 2, runId: string) => ({
    runId,
    ordinal,
    intermediateArtifacts: [
      "config.json", "decoder_model.onnx", "decoder_model_merged.onnx", "decoder_with_past_model.onnx",
      "encoder_model.onnx", "generation_config.json", "special_tokens_map.json", "spiece.model",
      "tokenizer.json", "tokenizer_config.json",
    ].map((path, index) => ({ path: `raw/${path}`, byteLength: 1_000 + index, sha256: sha(index % 2 === 0 ? "7" : "8") })),
    runtimeArtifacts: runtimeArtifacts.map((item) => ({ ...item })),
    stdoutLog: { path: `logs/build-${ordinal}.stdout.log`, byteLength: 20, sha256: sha("9") },
    stderrLog: { path: `logs/build-${ordinal}.stderr.log`, byteLength: 10, sha256: sha("a") },
  });
  return createNarratorT5RebuildReceiptV1({
    source: narratorT5RebuildSourceV1,
    toolchain: { lockSha256: narratorT5RebuildToolchainLockSha256V1, ...narratorT5RebuildToolchainV1 },
    recipe: narratorT5RebuildRecipeV1,
    sessions: narratorT5RebuildSessionsV1,
    runs: [run(1, "fixture:build:1"), run(2, "fixture:build:2")],
    totalRuntimeBytes: runtimeArtifacts.reduce((sum, item) => sum + item.byteLength, 0),
    reproducibility: "byte-identical-two-builds",
    disposition: "immutable-rebuild-observed",
    measuredIncrementalMemoryBytes: null,
    modelAdmitted: false,
    displayAuthorized: false,
  });
}

function rehash(receipt: NarratorT5RebuildReceiptV1, changes: Record<string, unknown>): Record<string, unknown> {
  const { contentHash: _discarded, ...content } = { ...receipt, ...changes };
  return { ...content, contentHash: canonicalHash(content) };
}

describe("T5 immutable rebuild evidence", () => {
  it("revalidates the committed tool-observed two-build receipt", () => {
    expect(isNarratorT5RebuildReceiptV1(observedReceipt)).toBe(true);
    expect(observedReceipt).toMatchObject({
      totalRuntimeBytes: 97_082_423,
      reproducibility: "byte-identical-two-builds",
      modelAdmitted: false,
      displayAuthorized: false,
    });
  });

  it("accepts, hashes, and deeply freezes an exact two-build receipt", () => {
    const receipt = fixture();
    expect(isNarratorT5RebuildReceiptV1(receipt)).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.runs[0].runtimeArtifacts[0])).toBe(true);
    expect(receipt).toMatchObject({
      reproducibility: "byte-identical-two-builds",
      disposition: "immutable-rebuild-observed",
      measuredIncrementalMemoryBytes: null,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  });

  it("fails closed on unknown keys and malformed records without throwing", () => {
    for (const value of [null, {}, { schemaVersion: 1 }, { ...fixture(), surprise: true }]) {
      expect(() => isNarratorT5RebuildReceiptV1(value)).not.toThrow();
      expect(isNarratorT5RebuildReceiptV1(value)).toBe(false);
    }
  });

  it("rejects rehashed mutations to every authority-bearing boundary", () => {
    const receipt = fixture();
    const mutations: Record<string, unknown>[] = [
      { source: { ...receipt.source, revision: "f".repeat(40) } },
      { source: { ...receipt.source, files: receipt.source.files.slice(1) } },
      { toolchain: { ...receipt.toolchain, lockSha256: sha("c") } },
      { toolchain: { ...receipt.toolchain, containerDigest: `sha256:${sha("d")}` } },
      { recipe: { ...receipt.recipe, opset: 17 } },
      { recipe: { ...receipt.recipe, quantizationWeightType: "QUInt8" } },
      { sessions: [...receipt.sessions].reverse() },
      { runs: [{ ...receipt.runs[0], runId: receipt.runs[1].runId }, receipt.runs[1]] },
      { runs: [{ ...receipt.runs[0], stdoutLog: { ...receipt.runs[0].stdoutLog, path: "logs/wrong.log" } }, receipt.runs[1]] },
      { reproducibility: "repository-metadata" },
      { disposition: "admitted" },
      { measuredIncrementalMemoryBytes: 1 },
      { modelAdmitted: true },
      { displayAuthorized: true },
    ];
    for (const mutation of mutations) {
      expect(isNarratorT5RebuildReceiptV1(rehash(receipt, mutation))).toBe(false);
    }
  });

  it("requires byte-identical intermediate and runtime closures plus the measured total", () => {
    const receipt = fixture();
    const mismatchedIntermediates = [
      receipt.runs[0],
      {
        ...receipt.runs[1],
        intermediateArtifacts: receipt.runs[1].intermediateArtifacts.map((item, index) => index === 4
          ? { ...item, sha256: sha("e") }
          : item),
      },
    ];
    expect(isNarratorT5RebuildReceiptV1(rehash(receipt, { runs: mismatchedIntermediates }))).toBe(false);
    const mismatchedRuns = [
      receipt.runs[0],
      {
        ...receipt.runs[1],
        runtimeArtifacts: receipt.runs[1].runtimeArtifacts.map((item, index) => index === 2
          ? { ...item, sha256: sha("e") }
          : item),
      },
    ];
    expect(isNarratorT5RebuildReceiptV1(rehash(receipt, { runs: mismatchedRuns }))).toBe(false);
    expect(isNarratorT5RebuildReceiptV1(rehash(receipt, { totalRuntimeBytes: receipt.totalRuntimeBytes + 1 }))).toBe(false);
  });

  it("accepts exactly 100 MiB and rejects one byte above it", () => {
    const receipt = fixture();
    const nonFirstBytes = receipt.runs[0].runtimeArtifacts.slice(1)
      .reduce((sum, item) => sum + item.byteLength, 0);
    const atLimitArtifacts = receipt.runs[0].runtimeArtifacts.map((item, index) => index === 0
      ? { ...item, byteLength: narratorT5RebuildMaximumRuntimeBytes - nonFirstBytes }
      : item);
    const atLimitRuns = receipt.runs.map((run) => ({ ...run, runtimeArtifacts: atLimitArtifacts.map((item) => ({ ...item })) }));
    const atLimit = rehash(receipt, { runs: atLimitRuns, totalRuntimeBytes: narratorT5RebuildMaximumRuntimeBytes });
    expect(isNarratorT5RebuildReceiptV1(atLimit)).toBe(true);
    expect(isNarratorT5RebuildReceiptV1(rehash(atLimit as unknown as NarratorT5RebuildReceiptV1, {
      runs: (atLimit as unknown as NarratorT5RebuildReceiptV1).runs.map((run) => ({
        ...run,
        runtimeArtifacts: run.runtimeArtifacts.map((item, index) => index === 0
          ? { ...item, byteLength: item.byteLength + 1 }
          : item),
      })),
      totalRuntimeBytes: narratorT5RebuildMaximumRuntimeBytes + 1,
    }))).toBe(false);
  });

  it("derives a still-blocked Candidate V2 without inventing device evidence", () => {
    const candidate = createNarratorT5CandidateFromRebuildReceiptV1(
      fixture(),
      "example/flan-t5-small-grind2-q8",
      "c".repeat(40),
    );
    expect(candidate.sessions).toEqual(narratorT5RebuildSessionsV1);
    expect(candidate.measuredIncrementalMemoryBytes).toBeNull();
    expect(candidate.model).toMatchObject({ license: null, licenseStatus: "unverified" });
    expect(narratorCandidateManifestBlockers(candidate)).toEqual(expect.arrayContaining([
      "model-license-unverified",
      "incremental-memory-unmeasured",
    ]));
  });

});
