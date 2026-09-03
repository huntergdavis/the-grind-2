import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { narratorArtifactManifestHash, narratorCandidateManifestHash } from "./evaluation-receipts";
import {
  createNarratorModelCandidateV2,
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidateV1,
  type NarratorModelCandidateV2,
} from "./model-candidate";
import {
  createNarratorCandidateProvenanceDossierV1,
  createNarratorCandidateProvenanceDossierV2,
  createNarratorCandidateStagingReportV1,
  isNarratorCandidateProvenanceDossier,
  isNarratorCandidateProvenanceDossierV1,
  isNarratorCandidateProvenanceDossierV2,
  isNarratorCandidateStagingReportForEvidenceV1,
  type NarratorCandidateProvenanceDossierV1,
  type NarratorCandidateProvenanceDossierV2,
} from "./model-provenance";

function admittedCandidate(): NarratorModelCandidateV1 {
  return {
    ...tinyStoriesInstruct33MInt8Candidate,
    candidateId: "fictional-provenance-fixture@02162995",
    model: {
      ...tinyStoriesInstruct33MInt8Candidate.model,
      repository: "example/fictional-conversion",
      sourceRepository: "example/fictional-source",
      license: "MIT",
      licenseStatus: "verified",
    },
  };
}

function dossier(candidate = admittedCandidate()): NarratorCandidateProvenanceDossierV1 {
  return createNarratorCandidateProvenanceDossierV1({
    candidateId: candidate.candidateId,
    candidateManifestHash: narratorCandidateManifestHash(candidate),
    artifactManifestHash: narratorArtifactManifestHash(candidate),
    artifactRepository: candidate.model.repository,
    artifactRevision: candidate.model.revision,
    artifactSessions: [{ sessionId: "model", artifactPath: "onnx/model_int8.onnx" }],
    modelRepository: candidate.model.repository,
    modelRevision: candidate.model.revision,
    sourceRepository: candidate.model.sourceRepository,
    sourceRevision: candidate.model.sourceRevision,
    sourceLicenseEvidence: {
      repository: candidate.model.sourceRepository,
      revision: candidate.model.sourceRevision,
      path: "LICENSE",
      sha256: "1".repeat(64),
      spdxLicense: "MIT",
      captureMethod: "pinned-repository-file",
    },
    convertedLicenseEvidence: {
      repository: candidate.model.repository,
      revision: candidate.model.revision,
      path: "LICENSE",
      sha256: "2".repeat(64),
      spdxLicense: "MIT",
      captureMethod: "pinned-repository-file",
    },
    conversionLineageEvidence: {
      conversionRepository: candidate.model.repository,
      conversionRevision: candidate.model.revision,
      sourceRepository: candidate.model.sourceRepository,
      sourceRevision: candidate.model.sourceRevision,
      converterRepository: "example/fictional-converter",
      converterRevision: "4".repeat(40),
      conversionCommand: `convert --revision ${candidate.model.sourceRevision} --output fictional-conversion`,
      path: "conversion-provenance.json",
      sha256: "3".repeat(64),
      captureMethod: "pinned-repository-file",
    },
    coordinatorId: "coordinator:test-fixture",
  });
}

function rehashDossier(
  value: NarratorCandidateProvenanceDossierV1,
  changes: Partial<NarratorCandidateProvenanceDossierV1>,
): NarratorCandidateProvenanceDossierV1 {
  const { contentHash: _discarded, ...fields } = { ...value, ...changes };
  return createNarratorCandidateProvenanceDossierV1(fields);
}

function admittedT5Candidate(): NarratorModelCandidateV2 {
  return createNarratorModelCandidateV2({
    candidateId: "fictional-provenance-t5@aaaaaaaa",
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
      repository: "example/fictional-provenance-t5",
      revision: "a".repeat(40),
      sourceRepository: "example/fictional-provenance-source",
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

function dossierV2(candidate = admittedT5Candidate()): NarratorCandidateProvenanceDossierV2 {
  return createNarratorCandidateProvenanceDossierV2({
    candidateId: candidate.candidateId,
    candidateManifestHash: narratorCandidateManifestHash(candidate),
    artifactManifestHash: narratorArtifactManifestHash(candidate),
    artifactRepository: candidate.model.repository,
    artifactRevision: candidate.model.revision,
    artifactSessions: candidate.sessions,
    modelRepository: candidate.model.repository,
    modelRevision: candidate.model.revision,
    sourceRepository: candidate.model.sourceRepository,
    sourceRevision: candidate.model.sourceRevision,
    sourceLicenseEvidence: {
      repository: candidate.model.sourceRepository,
      revision: candidate.model.sourceRevision,
      path: "LICENSE",
      sha256: "1".repeat(64),
      spdxLicense: "MIT",
      captureMethod: "pinned-repository-file",
    },
    convertedLicenseEvidence: {
      repository: candidate.model.repository,
      revision: candidate.model.revision,
      path: "LICENSE",
      sha256: "2".repeat(64),
      spdxLicense: "MIT",
      captureMethod: "pinned-repository-file",
    },
    conversionLineageEvidence: {
      conversionRepository: candidate.model.repository,
      conversionRevision: candidate.model.revision,
      sourceRepository: candidate.model.sourceRepository,
      sourceRevision: candidate.model.sourceRevision,
      converterRepository: "example/fictional-converter",
      converterRevision: "3".repeat(40),
      conversionCommand: `convert --revision ${candidate.model.sourceRevision} --output fictional-provenance-t5`,
      path: "conversion-provenance.json",
      sha256: "4".repeat(64),
      captureMethod: "pinned-repository-file",
    },
    coordinatorId: "coordinator:v2-fixture",
  });
}

function rehashDossierV2(
  value: NarratorCandidateProvenanceDossierV2,
  changes: Partial<NarratorCandidateProvenanceDossierV2>,
): NarratorCandidateProvenanceDossierV2 {
  const { contentHash: _discarded, ...fields } = { ...value, ...changes };
  return createNarratorCandidateProvenanceDossierV2(fields);
}

function rawRehashDossierV2(
  value: NarratorCandidateProvenanceDossierV2,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const { contentHash: _discarded, ...content } = { ...value, ...changes };
  return { ...content, contentHash: canonicalHash(content) };
}

describe("narrator candidate provenance", () => {
  it("allows only a fully pinned fictional fixture to reach device staging", () => {
    const candidate = admittedCandidate();
    const evidence = dossier(candidate);
    const report = createNarratorCandidateStagingReportV1(candidate, evidence);
    expect(isNarratorCandidateProvenanceDossierV1(evidence)).toBe(true);
    expect(isNarratorCandidateStagingReportForEvidenceV1(report, candidate, evidence)).toBe(true);
    expect(report).toMatchObject({
      disposition: "eligible-for-device-staging",
      blockers: [],
      dossierHash: evidence.contentHash,
      modelAdmitted: false,
      displayAuthorized: false,
    });
  });

  it("does not trust a verified manifest without a dossier", () => {
    const candidate = admittedCandidate();
    const report = createNarratorCandidateStagingReportV1(candidate, null);
    expect(report.disposition).toBe("blocked");
    expect(report.blockers).toEqual(["dossier-schema-invalid"]);
  });

  it("requires converted-repository license and exact conversion lineage", () => {
    const candidate = admittedCandidate();
    const evidence = rehashDossier(dossier(candidate), {
      convertedLicenseEvidence: null,
      conversionLineageEvidence: null,
    });
    const report = createNarratorCandidateStagingReportV1(candidate, evidence);
    expect(report.blockers).toEqual([
      "conversion-lineage-evidence-missing",
      "converted-license-evidence-missing",
    ]);
  });

  it.each([
    ["candidate id", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { candidateId: "other/candidate" })],
    ["candidate hash", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { candidateManifestHash: "f".repeat(16) })],
    ["artifact hash", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { artifactManifestHash: "e".repeat(16) })],
    ["artifact repository", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { artifactRepository: "other/artifacts" })],
    ["artifact revision", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { artifactRevision: "d".repeat(40) })],
    ["artifact session", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { artifactSessions: [{ sessionId: "model", artifactPath: "onnx/other.onnx" }] })],
    ["model repository", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { modelRepository: "other/conversion" })],
    ["model revision", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { modelRevision: "a".repeat(40) })],
    ["source repository", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { sourceRepository: "other/source" })],
    ["source revision", (value: NarratorCandidateProvenanceDossierV1) => rehashDossier(value, { sourceRevision: "b".repeat(40) })],
  ])("blocks a rebound %s", (_label, mutate) => {
    const candidate = admittedCandidate();
    expect(createNarratorCandidateStagingReportV1(candidate, mutate(dossier(candidate))).disposition).toBe("blocked");
  });

  it("fails closed on digest, SPDX, lineage, unknown-key, and report mutations", () => {
    const candidate = admittedCandidate();
    const valid = dossier(candidate);
    const badDigest = {
      ...valid,
      sourceLicenseEvidence: { ...valid.sourceLicenseEvidence!, sha256: "bad" },
    };
    expect(createNarratorCandidateStagingReportV1(candidate, badDigest).blockers).toEqual(["dossier-schema-invalid"]);
    const badSpdx = rehashDossier(valid, {
      sourceLicenseEvidence: { ...valid.sourceLicenseEvidence!, spdxLicense: "Proprietary" },
    });
    expect(createNarratorCandidateStagingReportV1(candidate, badSpdx).blockers).toContain("source-license-not-permissive");
    const badLineage = rehashDossier(valid, {
      conversionLineageEvidence: { ...valid.conversionLineageEvidence!, sourceRevision: "c".repeat(40) },
    });
    expect(createNarratorCandidateStagingReportV1(candidate, badLineage).blockers)
      .toContain("conversion-lineage-binding-mismatch");
    const unpinnedCommand = rehashDossier(valid, {
      conversionLineageEvidence: { ...valid.conversionLineageEvidence!, conversionCommand: "convert latest" },
    });
    expect(createNarratorCandidateStagingReportV1(candidate, unpinnedCommand).blockers)
      .toContain("conversion-command-source-revision-missing");
    expect(isNarratorCandidateProvenanceDossierV1({ ...valid, surprise: true })).toBe(false);
    expect(isNarratorCandidateProvenanceDossierV1({
      ...valid,
      artifactSessions: [...valid.artifactSessions, valid.artifactSessions[0]],
    })).toBe(false);

    const report = createNarratorCandidateStagingReportV1(candidate, valid);
    expect(isNarratorCandidateStagingReportForEvidenceV1(
      { ...report, modelAdmitted: true }, candidate, valid,
    )).toBe(false);
    expect(isNarratorCandidateStagingReportForEvidenceV1(
      { ...report, blockers: ["invented"] }, candidate, valid,
    )).toBe(false);
  });

  it("keeps current real research candidate blocked", () => {
    const report = createNarratorCandidateStagingReportV1(tinyStoriesInstruct33MInt8Candidate, null);
    expect(report.disposition).toBe("blocked");
    expect(report.modelAdmitted).toBe(false);
    expect(report.displayAuthorized).toBe(false);
  });

  it("keeps a previously measured over-budget candidate blocked", () => {
    const candidate = { ...admittedCandidate(), measuredIncrementalMemoryBytes: 2_000_000_000 };
    const report = createNarratorCandidateStagingReportV1(candidate, dossier(candidate));
    expect(report.blockers).toContain("candidate-static-policy-blocked");
    expect(report.disposition).toBe("blocked");
  });

  it("stages an eligible V2 T5 candidate only with its exact session provenance", () => {
    const candidate = admittedT5Candidate();
    const evidence = dossierV2(candidate);
    const report = createNarratorCandidateStagingReportV1(candidate, evidence);
    expect(isNarratorCandidateProvenanceDossier(evidence)).toBe(true);
    expect(isNarratorCandidateProvenanceDossierV2(evidence)).toBe(true);
    expect(evidence.artifactSessions).toEqual(candidate.sessions);
    expect(report).toMatchObject({
      disposition: "eligible-for-device-staging",
      blockers: [],
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(isNarratorCandidateStagingReportForEvidenceV1(report, candidate, evidence)).toBe(true);
  });

  it("blocks V2 session order, runtime key, file stem, dtype, and path substitutions", () => {
    const candidate = admittedT5Candidate();
    const valid = dossierV2(candidate);
    const reordered = rehashDossierV2(valid, { artifactSessions: [...valid.artifactSessions].reverse() });
    expect(createNarratorCandidateStagingReportV1(candidate, reordered).blockers)
      .toContain("artifact-session-manifest-mismatch");
    const wrongStem = rehashDossierV2(valid, {
      artifactSessions: [
        {
          runtimeSessionKey: "model",
          fileStem: "model",
          dtype: "q8",
          artifactPath: valid.artifactSessions[0]!.artifactPath,
        },
        valid.artifactSessions[1]!,
      ],
    });
    expect(createNarratorCandidateStagingReportV1(candidate, wrongStem).blockers)
      .toContain("artifact-session-manifest-mismatch");
    const wrongPath = rehashDossierV2(valid, {
      artifactSessions: valid.artifactSessions.map((session, index) => index === 0
        ? { ...session, artifactPath: "onnx/model_quantized.onnx" }
        : session),
    });
    expect(createNarratorCandidateStagingReportV1(candidate, wrongPath).blockers)
      .toContain("artifact-session-manifest-mismatch");
    expect(createNarratorCandidateStagingReportV1(candidate, rawRehashDossierV2(valid, {
      artifactSessions: valid.artifactSessions.map((session, index) => index === 0
        ? { ...session, runtimeSessionKey: "decoder_model_merged" }
        : session),
    })).blockers).toEqual(["dossier-schema-invalid"]);
    expect(createNarratorCandidateStagingReportV1(candidate, rawRehashDossierV2(valid, {
      artifactSessions: valid.artifactSessions.map((session, index) => index === 1
        ? { ...session, runtimeSessionKey: "model" }
        : session),
    })).blockers).toEqual(["dossier-schema-invalid"]);
    expect(createNarratorCandidateStagingReportV1(candidate, rawRehashDossierV2(valid, {
      artifactSessions: valid.artifactSessions.map((session, index) => index === 0
        ? { ...session, dtype: "fp16" }
        : session),
    })).blockers).toEqual(["dossier-schema-invalid"]);
  });

  it("rejects a V1 provenance envelope rebound onto a V2 candidate", () => {
    const candidate = admittedT5Candidate();
    const {
      schemaVersion: _schemaVersion,
      contentHash: _contentHash,
      artifactSessions: _artifactSessions,
      ...commonEvidence
    } = dossierV2(candidate);
    const v1 = createNarratorCandidateProvenanceDossierV1({
      ...commonEvidence,
      artifactSessions: [{ sessionId: "model", artifactPath: candidate.sessions[0]!.artifactPath }],
    });
    const report = createNarratorCandidateStagingReportV1(candidate, v1);
    expect(report.blockers).toEqual(expect.arrayContaining([
      "dossier-candidate-version-mismatch",
      "artifact-session-manifest-mismatch",
    ]));
    expect(report.disposition).toBe("blocked");
  });
});
