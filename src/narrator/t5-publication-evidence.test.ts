import { describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import { narratorArtifactManifestHash, narratorCandidateManifestHash } from "./evaluation-receipts";
import {
  narratorCandidateManifestBlockers,
  narratorTransformersJsRuntimeV2,
} from "./model-candidate";
import {
  isNarratorCandidateProvenanceDossierV3,
  isNarratorCandidateStagingReportForEvidenceV1,
} from "./model-provenance";
import {
  createNarratorT5ArtifactPublicationReceiptV1,
  createNarratorT5PublishedCandidateV1,
  createNarratorT5PublishedStagingEvidenceV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  narratorT5ArtifactPublicationUrlV1,
  narratorT5ArtifactRepositoryV1,
  narratorT5ArtifactRevisionV1,
  narratorT5PublicationConvertedLicenseV1,
  narratorT5PublicationFilesV1,
  narratorT5PublicationRebuildV1,
  narratorT5PublicationSourceV1,
  narratorT5PublicationVerificationV1,
  narratorT5PublishedArtifactsV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";
import { narratorT5RebuildSessionsV1 } from "./t5-rebuild-evidence";

type MutableRecord = Record<string, unknown>;

function record(value: unknown): MutableRecord {
  return value as MutableRecord;
}

function records(value: unknown): MutableRecord[] {
  return value as MutableRecord[];
}

function receipt(): NarratorT5ArtifactPublicationReceiptV1 {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return observedReceipt as NarratorT5ArtifactPublicationReceiptV1;
}

function rehashedMutation(mutate: (value: MutableRecord) => void): MutableRecord {
  const content = structuredClone(observedReceipt) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

describe("published T5 artifact evidence", () => {
  it("revalidates the committed full-tree publication receipt", () => {
    const value = receipt();
    expect(value).toMatchObject({
      artifactRepository: narratorT5ArtifactRepositoryV1,
      artifactRevision: narratorT5ArtifactRevisionV1,
      artifactTreeRevision: "f98af3790d8aa5375a2cba6f3bdfda99283e42b0",
      publicationUrl: narratorT5ArtifactPublicationUrlV1,
      releaseTag: "v0.5.80",
      visibility: "public",
      defaultBranch: "main",
      totalRuntimeBytes: 97_082_423,
      modelAdmitted: false,
      displayAuthorized: false,
      contentHash: "2d3b259bc8814e46",
    });
    expect(value.publicationFiles).toEqual(narratorT5PublicationFilesV1);
    expect(value.publicationFiles).toHaveLength(10);
    expect(value.publicationFiles[0]).toMatchObject({
      path: ".gitattributes",
      byteLength: 156,
      sha256: "e6efcdcdc81b4b6eace29d66b4ce10a4f18e2d07fd733b77be7c9c513102e9e9",
    });
    expect(value.artifacts).toEqual(narratorT5PublishedArtifactsV1);
    expect(value.artifacts).toHaveLength(6);
    expect(value.publicationFiles.length + value.artifacts.length).toBe(16);
    expect(value.source).toEqual(narratorT5PublicationSourceV1);
    expect(value.convertedLicense).toEqual(narratorT5PublicationConvertedLicenseV1);
    expect(value.rebuild).toEqual(narratorT5PublicationRebuildV1);
    expect(value.runtime).toEqual(narratorTransformersJsRuntimeV2);
    expect(value.sessions).toEqual(narratorT5RebuildSessionsV1);
    expect(value.verification).toEqual(narratorT5PublicationVerificationV1);
  });

  it("creates and deeply freezes only the exact publication receipt", () => {
    const { schemaVersion: _schemaVersion, contentHash: _contentHash, ...fields } = receipt();
    const created = createNarratorT5ArtifactPublicationReceiptV1(fields);
    expect(created).toEqual(receipt());
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.publicationFiles)).toBe(true);
    expect(Object.isFrozen(created.publicationFiles[0])).toBe(true);
    expect(Object.isFrozen(created.rebuild)).toBe(true);
    expect(Object.isFrozen(created.runtime)).toBe(true);
    expect(Object.isFrozen(created.sessions[0])).toBe(true);
    expect(Object.isFrozen(created.artifacts[0])).toBe(true);
    expect(() => createNarratorT5ArtifactPublicationReceiptV1({
      ...fields,
      defaultBranch: "development",
    } as never)).toThrow("Narrator T5 artifact publication receipt is invalid");
  });

  it("fails closed on malformed and unknown-key envelopes without throwing", () => {
    for (const value of [
      null,
      {},
      { schemaVersion: 1 },
      { ...receipt(), surprise: true },
      { ...receipt(), contentHash: "0".repeat(16) },
      rehashedMutation((value) => { records(value.publicationFiles)[0]!.surprise = true; }),
      rehashedMutation((value) => { record(value.source).surprise = true; }),
      rehashedMutation((value) => { record(value.convertedLicense).surprise = true; }),
      rehashedMutation((value) => { record(value.rebuild).surprise = true; }),
      rehashedMutation((value) => { record(value.runtime).surprise = true; }),
      rehashedMutation((value) => { records(value.sessions)[0]!.surprise = true; }),
      rehashedMutation((value) => { records(value.artifacts)[0]!.surprise = true; }),
      rehashedMutation((value) => { record(value.verification).surprise = true; }),
    ]) {
      expect(() => isNarratorT5ArtifactPublicationReceiptV1(value)).not.toThrow();
      expect(isNarratorT5ArtifactPublicationReceiptV1(value)).toBe(false);
    }
  });

  it("rejects rehashed mutations to repository and verification authority", () => {
    const mutations: Array<(value: MutableRecord) => void> = [
      (value) => { value.artifactRepository = "example/lookalike-artifacts"; },
      (value) => { value.artifactRevision = "f".repeat(40); },
      (value) => { value.artifactTreeRevision = "e".repeat(40); },
      (value) => { value.publicationUrl = "https://example.invalid/artifacts"; },
      (value) => { value.releaseTag = "v0.5.81"; },
      (value) => { value.visibility = "private"; },
      (value) => { value.defaultBranch = "development"; },
      (value) => { value.totalRuntimeBytes = 97_082_424; },
      (value) => { value.modelAdmitted = true; },
      (value) => { value.displayAuthorized = true; },
      (value) => { record(value.verification).captureMethod = "local-source-checkout"; },
      (value) => { record(value.verification).verifiedRevision = "d".repeat(40); },
      (value) => { record(value.verification).checksumPath = "CHECKSUMS"; },
      (value) => { record(value.verification).checksumSha256 = "c".repeat(64); },
    ];
    for (const mutate of mutations) {
      expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation(mutate))).toBe(false);
      expect(() => createNarratorT5PublishedCandidateV1(rehashedMutation(mutate)))
        .toThrow("Narrator T5 artifact publication receipt is invalid");
    }
  });

  it("binds every publication support file field and its ordering", () => {
    for (let index = 0; index < receipt().publicationFiles.length; index += 1) {
      for (const mutate of [
        (file: MutableRecord) => { file.path = `changed/support-${index}`; },
        (file: MutableRecord) => { file.role = "unexpected-role"; },
        (file: MutableRecord) => { file.byteLength = Number(file.byteLength) + 1; },
        (file: MutableRecord) => { file.sha256 = "f".repeat(64); },
      ]) {
        expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation((value) => {
          mutate(records(value.publicationFiles)[index]!);
        }))).toBe(false);
      }
    }
    expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation((value) => {
      value.publicationFiles = [...records(value.publicationFiles)].reverse();
    }))).toBe(false);
  });

  it("binds exact source, redistribution, rebuild, and runtime evidence", () => {
    const mutations: Array<(value: MutableRecord) => void> = [
      (value) => { record(value.source).repository = "example/source"; },
      (value) => { record(value.source).revision = "f".repeat(40); },
      (value) => { record(value.source).spdxLicense = "MIT"; },
      (value) => { record(value.source).licenseEvidencePath = "LICENSE"; },
      (value) => { record(value.source).licenseEvidenceSha256 = "f".repeat(64); },
      (value) => { record(value.source).retainedLicenseEvidencePath = "provenance/license.md"; },
      (value) => { record(value.convertedLicense).spdxLicense = "MIT"; },
      (value) => { record(value.convertedLicense).path = "COPYING"; },
      (value) => { record(value.convertedLicense).sha256 = "f".repeat(64); },
      (value) => { record(value.convertedLicense).noticePath = "NOTICE.md"; },
      (value) => { record(value.convertedLicense).noticeSha256 = "f".repeat(64); },
      (value) => { record(value.convertedLicense).modificationsPath = "CHANGES.md"; },
      (value) => { record(value.convertedLicense).modificationsSha256 = "f".repeat(64); },
      (value) => { record(value.rebuild).repository = "example/rebuild"; },
      (value) => { record(value.rebuild).revision = "f".repeat(40); },
      (value) => { record(value.rebuild).publishedReceiptPath = "provenance/other.json"; },
      (value) => { record(value.rebuild).rebuildReceiptPath = "docs/narrator/other.json"; },
      (value) => { record(value.rebuild).receiptSha256 = "f".repeat(64); },
      (value) => { record(value.rebuild).receiptContentHash = "f".repeat(16); },
      (value) => { record(value.rebuild).publishedToolchainLockPath = "provenance/other-lock.json"; },
      (value) => { record(value.rebuild).toolchainLockPath = "tools/other-lock.json"; },
      (value) => { record(value.rebuild).toolchainLockSha256 = "f".repeat(64); },
      (value) => { record(value.rebuild).processIsolation = "single-process"; },
      (value) => { record(value.rebuild).pythonHashSeed = "random"; },
      (value) => { record(value.rebuild).converterRepository = "example/converter"; },
      (value) => { record(value.rebuild).converterRevision = "f".repeat(40); },
      (value) => { record(value.rebuild).quantizerRepository = "example/quantizer"; },
      (value) => { record(value.rebuild).quantizerRevision = "f".repeat(40); },
      (value) => { record(value.runtime).package = "lookalike-transformers"; },
      (value) => { record(value.runtime).version = "4.1.0"; },
      (value) => { record(value.runtime).license = "MIT"; },
      (value) => { record(value.runtime).integrity = `sha512-${"A".repeat(86)}==`; },
      (value) => { record(value.runtime).unpackedByteLength = 9_536_376; },
    ];
    for (const mutate of mutations) {
      expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation(mutate))).toBe(false);
      expect(() => createNarratorT5PublishedStagingEvidenceV1(rehashedMutation(mutate)))
        .toThrow("Narrator T5 artifact publication receipt is invalid");
    }
  });

  it("binds both runtime sessions and all six artifact fields", () => {
    const sessionMutations: Array<(sessions: MutableRecord[]) => void> = [
      (sessions) => { sessions.reverse(); },
      (sessions) => { sessions[0]!.runtimeSessionKey = "decoder_model_merged"; },
      (sessions) => { sessions[0]!.fileStem = "model"; },
      (sessions) => { sessions[0]!.dtype = "fp16"; },
      (sessions) => { sessions[0]!.artifactPath = "onnx/other.onnx"; },
    ];
    for (const mutate of sessionMutations) {
      expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation((value) => {
        mutate(records(value.sessions));
      }))).toBe(false);
    }
    for (let index = 0; index < receipt().artifacts.length; index += 1) {
      for (const mutate of [
        (artifact: MutableRecord) => { artifact.path = `changed/artifact-${index}`; },
        (artifact: MutableRecord) => {
          artifact.role = artifact.role === "weights" ? "tokenizer" : "weights";
        },
        (artifact: MutableRecord) => { artifact.byteLength = Number(artifact.byteLength) + 1; },
        (artifact: MutableRecord) => { artifact.sha256 = "f".repeat(64); },
      ]) {
        expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation((value) => {
          mutate(records(value.artifacts)[index]!);
        }))).toBe(false);
      }
    }
    expect(isNarratorT5ArtifactPublicationReceiptV1(rehashedMutation((value) => {
      value.artifacts = [...records(value.artifacts)].reverse();
    }))).toBe(false);
  });

  it("derives the exact still-memory-gated candidate and V3 staging evidence", () => {
    const candidate = createNarratorT5PublishedCandidateV1(receipt());
    expect(candidate).toMatchObject({
      candidateId: "flan-t5-small-q8@8c85146b",
      modelFamily: "t5",
      model: {
        repository: narratorT5ArtifactRepositoryV1,
        revision: narratorT5ArtifactRevisionV1,
        sourceRepository: narratorT5PublicationSourceV1.repository,
        sourceRevision: narratorT5PublicationSourceV1.revision,
        license: "Apache-2.0",
        licenseStatus: "verified",
      },
      runtime: narratorTransformersJsRuntimeV2,
      measuredIncrementalMemoryBytes: null,
    });
    expect(candidate.sessions).toEqual(narratorT5RebuildSessionsV1);
    expect(candidate.artifacts).toEqual(narratorT5PublishedArtifactsV1);
    expect(narratorCandidateManifestBlockers(candidate)).toEqual(["incremental-memory-unmeasured"]);
    expect(narratorCandidateManifestHash(candidate)).toBe("3ef11de32b935bf8");
    expect(narratorArtifactManifestHash(candidate)).toBe("cd7b76c208b0aa3d");

    const evidence = createNarratorT5PublishedStagingEvidenceV1(receipt());
    expect(evidence.candidate).toEqual(candidate);
    expect(isNarratorCandidateProvenanceDossierV3(evidence.dossier)).toBe(true);
    expect(evidence.dossier.contentHash).toBe("b8770a69849e0ce6");
    expect(evidence.dossier.conversionLineageEvidence).toMatchObject({
      conversionRepository: narratorT5ArtifactRepositoryV1,
      conversionRevision: narratorT5ArtifactRevisionV1,
      sourceRepository: narratorT5PublicationSourceV1.repository,
      sourceRevision: narratorT5PublicationSourceV1.revision,
      rebuildRepository: narratorT5PublicationRebuildV1.repository,
      rebuildRevision: narratorT5PublicationRebuildV1.revision,
      publishedReceiptPath: narratorT5PublicationRebuildV1.publishedReceiptPath,
      rebuildReceiptPath: narratorT5PublicationRebuildV1.rebuildReceiptPath,
      publishedToolchainLockPath: narratorT5PublicationRebuildV1.publishedToolchainLockPath,
      toolchainLockPath: narratorT5PublicationRebuildV1.toolchainLockPath,
      converterRevision: narratorT5PublicationRebuildV1.converterRevision,
      quantizerRevision: narratorT5PublicationRebuildV1.quantizerRevision,
      captureMethod: "pinned-rebuild-receipt",
    });
    expect(evidence.stagingReport).toMatchObject({
      disposition: "eligible-for-device-staging",
      blockers: [],
      modelAdmitted: false,
      displayAuthorized: false,
      contentHash: "1fcd29e9e93578da",
    });
    expect(isNarratorCandidateStagingReportForEvidenceV1(
      evidence.stagingReport,
      evidence.candidate,
      evidence.dossier,
    )).toBe(true);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.candidate.artifacts[0])).toBe(true);
    expect(Object.isFrozen(evidence.dossier.conversionLineageEvidence)).toBe(true);
    expect(Object.isFrozen(evidence.stagingReport.blockers)).toBe(true);
  });
});
