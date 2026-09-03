import { describe, expect, it } from "vitest";
import { narratorArtifactManifestHash, narratorCandidateManifestHash } from "./evaluation-receipts";
import { tinyStoriesInstruct33MInt8Candidate, type NarratorModelCandidateV1 } from "./model-candidate";
import {
  createNarratorCandidateProvenanceDossierV1,
  createNarratorCandidateStagingReportV1,
  isNarratorCandidateProvenanceDossierV1,
  isNarratorCandidateStagingReportForEvidenceV1,
  type NarratorCandidateProvenanceDossierV1,
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
});
