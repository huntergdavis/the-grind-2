import { describe, expect, it } from "vitest";
import {
  createNarratorModelCandidateV2,
  isNarratorModelCandidate,
  isNarratorModelCandidateV1,
  isNarratorModelCandidateV2,
  narratorCandidateSessionManifest,
  narratorCandidateManifestBlockers,
  narratorCandidateStoredBytes,
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV2,
  type NarratorModelCandidateV1,
} from "./model-candidate";

function admittedFixture(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: {
      ...tinyStoriesInstruct33MInt8Candidate.model,
      license: "MIT",
      licenseStatus: "verified",
    },
    measuredIncrementalMemoryBytes: 200 * 1024 * 1024,
  };
}

function t5Fixture(): NarratorModelCandidateV2 {
  return createNarratorModelCandidateV2({
    candidateId: "fictional-t5-q8@11111111",
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
      repository: "example/fictional-t5-conversion",
      revision: "1".repeat(40),
      sourceRepository: "example/fictional-t5-source",
      sourceRevision: "2".repeat(40),
      license: "MIT",
      licenseStatus: "verified",
    },
    runtime: { ...tinyStoriesInstruct33MInt8Candidate.runtime },
    execution: "wasm",
    artifacts: [
      {
        path: "onnx/encoder_model_quantized.onnx",
        role: "weights",
        byteLength: 40_000_000,
        sha256: "3".repeat(64),
      },
      {
        path: "onnx/decoder_model_merged_quantized.onnx",
        role: "weights",
        byteLength: 50_000_000,
        sha256: "4".repeat(64),
      },
      { path: "config.json", role: "configuration", byteLength: 1_000, sha256: "5".repeat(64) },
      { path: "tokenizer.json", role: "tokenizer", byteLength: 2_000, sha256: "6".repeat(64) },
    ],
    measuredIncrementalMemoryBytes: 200 * 1024 * 1024,
  });
}

function decoderFixture(): NarratorModelCandidateV2 {
  const t5 = t5Fixture();
  return createNarratorModelCandidateV2({
    ...t5,
    candidateId: "fictional-decoder-q8@77777777",
    modelFamily: "decoder-only",
    sessions: [{
      runtimeSessionKey: "model",
      fileStem: "model",
      dtype: "q8",
      artifactPath: "onnx/model_quantized.onnx",
    }],
    artifacts: [
      { path: "onnx/model_quantized.onnx", role: "weights", byteLength: 90_000_000, sha256: "7".repeat(64) },
      { path: "config.json", role: "configuration", byteLength: 1_000, sha256: "5".repeat(64) },
      { path: "tokenizer.json", role: "tokenizer", byteLength: 2_000, sha256: "6".repeat(64) },
    ],
  });
}

describe("narrator model candidate manifest", () => {
  it("pins every candidate byte and stays below the first stored-byte gate", () => {
    expect(tinyStoriesInstruct33MInt8Candidate.model.revision).toHaveLength(40);
    expect(tinyStoriesInstruct33MInt8Candidate.model.sourceRevision).toHaveLength(40);
    expect(tinyStoriesInstruct33MInt8Candidate.artifacts).toHaveLength(8);
    expect(narratorCandidateStoredBytes(tinyStoriesInstruct33MInt8Candidate)).toBe(82_096_737);
    expect(tinyStoriesInstruct33MInt8Candidate.artifacts.every((artifact) => /^[0-9a-f]{64}$/u.test(artifact.sha256))).toBe(true);
    expect(Object.isFrozen(tinyStoriesInstruct33MInt8Candidate)).toBe(true);
    expect(Object.isFrozen(tinyStoriesInstruct33MInt8Candidate.artifacts)).toBe(true);
    expect(isNarratorModelCandidateV1(tinyStoriesInstruct33MInt8Candidate)).toBe(true);
    expect(tinyStoriesInstruct33MInt8Candidate.runtime).toMatchObject({
      package: "@huggingface/transformers",
      version: "4.2.0",
      license: "Apache-2.0",
      unpackedByteLength: 9_536_375,
    });
  });

  it("keeps the researched candidate benchmark-only until license and memory are verified", () => {
    expect(narratorCandidateManifestBlockers(tinyStoriesInstruct33MInt8Candidate)).toEqual([
      "model-license-unverified",
      "incremental-memory-unmeasured",
    ]);
  });

  it("admits only a pinned permissive manifest inside both byte budgets", () => {
    expect(narratorCandidateManifestBlockers(admittedFixture())).toEqual([]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      model: { ...admittedFixture().model, license: "custom-research-only" },
    })).toContain("model-license-not-permissive");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: [
        ...admittedFixture().artifacts,
        { ...admittedFixture().artifacts[1]!, path: "duplicate" },
        { ...admittedFixture().artifacts[1]!, path: "duplicate" },
      ],
    })).toContain("artifact-path-duplicate");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, byteLength: 101 * 1024 * 1024 } : artifact),
    })).toContain("stored-byte-budget-exceeded");
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      measuredIncrementalMemoryBytes: 257 * 1024 * 1024,
    })).toContain("incremental-memory-budget-exceeded");
  });

  it("rejects forged schemas, runtime identities, unsafe paths, and missing artifact roles", () => {
    expect(narratorCandidateManifestBlockers({ ...admittedFixture(), extra: true })).toEqual([
      "candidate-schema-invalid",
    ]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, package: "lookalike-transformers" },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, integrity: "sha512-a" },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      runtime: { ...admittedFixture().runtime, integrity: `sha512-${"a".repeat(87)}=` },
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, path: "../model.onnx" } : artifact),
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.filter((artifact) => artifact.role !== "tokenizer"),
    })).toEqual(["candidate-schema-invalid"]);
    expect(narratorCandidateManifestBlockers({
      ...admittedFixture(),
      artifacts: admittedFixture().artifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, role: "configuration" } : artifact),
    })).toEqual(["candidate-schema-invalid"]);
  });

  it("models the exact q8 runtime sessions for decoder-only and T5 families", () => {
    const decoder = decoderFixture();
    const t5 = t5Fixture();
    expect(isNarratorModelCandidate(decoder)).toBe(true);
    expect(isNarratorModelCandidateV2(decoder)).toBe(true);
    expect(narratorCandidateManifestBlockers(decoder)).toEqual([]);
    expect(narratorCandidateSessionManifest(decoder)).toEqual([{
      runtimeSessionKey: "model",
      fileStem: "model",
      dtype: "q8",
      artifactPath: "onnx/model_quantized.onnx",
    }]);
    expect(narratorCandidateSessionManifest(t5)).toEqual([
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
    ]);
    expect(Object.isFrozen(t5)).toBe(true);
    expect(Object.isFrozen(t5.sessions)).toBe(true);
    expect(t5.sessions.every(Object.isFrozen)).toBe(true);
  });

  it("rejects reordered, renamed, missing, duplicate, and non-weight V2 sessions", () => {
    const candidate = t5Fixture();
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: [...candidate.sessions].reverse(),
    })).toContain("candidate-session-set-invalid");
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: candidate.sessions.map((session, index) => index === 0
        ? { ...session, runtimeSessionKey: "encoder_model" }
        : session),
    })).toContain("candidate-session-set-invalid");
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: candidate.sessions.map((session, index) => index === 0
        ? { ...session, fileStem: "model" }
        : session),
    })).toContain("candidate-session-set-invalid");
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: candidate.sessions.map((session, index) => index === 0
        ? { ...session, dtype: "fp16" }
        : session),
    })).toContain("candidate-session-set-invalid");
    const oneSession = { ...candidate, sessions: [candidate.sessions[0]!] };
    expect(narratorCandidateManifestBlockers(oneSession)).toEqual(expect.arrayContaining([
      "candidate-session-set-invalid",
      "candidate-weight-artifact-unmapped",
      "candidate-runtime-artifact-unmapped",
    ]));
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: [candidate.sessions[0]!, candidate.sessions[0]!],
    })).toContain("candidate-session-set-invalid");
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      sessions: candidate.sessions.map((session, index) => index === 0
        ? { ...session, artifactPath: "config.json" }
        : session),
    })).toEqual(expect.arrayContaining([
      "candidate-session-artifact-name-invalid",
      "candidate-session-artifact-not-weight",
      "candidate-weight-artifact-unmapped",
      "candidate-runtime-artifact-unmapped",
    ]));
  });

  it("requires every V2 weight and ONNX runtime artifact to have one canonical session", () => {
    const candidate = decoderFixture();
    const orphanWeight = {
      path: "other.bin",
      role: "weights" as const,
      byteLength: 10,
      sha256: "8".repeat(64),
    };
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      artifacts: [...candidate.artifacts, orphanWeight],
    })).toContain("candidate-weight-artifact-unmapped");
    expect(narratorCandidateManifestBlockers({
      ...candidate,
      artifacts: [...candidate.artifacts, {
        path: "onnx/model_quantized.onnx_data",
        role: "configuration",
        byteLength: 10,
        sha256: "9".repeat(64),
      }],
    })).toContain("candidate-runtime-artifact-unmapped");
  });

  it("treats exactly 100 MiB as eligible and one byte more as blocked", () => {
    const candidate = decoderFixture();
    const nonWeightBytes = candidate.artifacts.slice(1)
      .reduce((sum, artifact) => sum + artifact.byteLength, 0);
    const atLimit = {
      ...candidate,
      artifacts: candidate.artifacts.map((artifact, index) => index === 0
        ? { ...artifact, byteLength: (100 * 1024 * 1024) - nonWeightBytes }
        : artifact),
    };
    expect(narratorCandidateStoredBytes(atLimit)).toBe(104_857_600);
    expect(narratorCandidateManifestBlockers(atLimit)).not.toContain("stored-byte-budget-exceeded");
    expect(narratorCandidateManifestBlockers({
      ...atLimit,
      artifacts: atLimit.artifacts.map((artifact, index) => index === 0
        ? { ...artifact, byteLength: artifact.byteLength + 1 }
        : artifact),
    })).toContain("stored-byte-budget-exceeded");
  });

  it("fails closed for unknown V2 families and unknown envelope keys", () => {
    const candidate = decoderFixture();
    expect(narratorCandidateManifestBlockers({ ...candidate, modelFamily: "bert" }))
      .toContain("candidate-model-family-invalid");
    expect(narratorCandidateManifestBlockers({ ...candidate, surprise: true }))
      .toEqual(["candidate-schema-invalid"]);
  });

  it("binds the V2 topology to the exact researched Transformers.js runtime artifact", () => {
    const candidate = decoderFixture();
    for (const runtime of [
      { ...candidate.runtime, version: "4.1.0" },
      { ...candidate.runtime, version: "99.0.0" },
      { ...candidate.runtime, license: "MIT" },
      { ...candidate.runtime, integrity: `sha512-${"A".repeat(86)}==` },
      { ...candidate.runtime, unpackedByteLength: candidate.runtime.unpackedByteLength + 1 },
    ]) {
      expect(narratorCandidateManifestBlockers({ ...candidate, runtime }))
        .toEqual(["candidate-runtime-contract-mismatch"]);
    }
  });
});
