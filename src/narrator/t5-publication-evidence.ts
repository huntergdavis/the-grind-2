import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  narratorArtifactManifestHash,
  narratorCandidateManifestHash,
} from "./evaluation-receipts";
import {
  createNarratorModelCandidateV2,
  narratorCandidateManifestBlockers,
  narratorTransformersJsRuntimeV2,
  type NarratorModelArtifactV1,
  type NarratorModelCandidateV2,
  type NarratorModelSessionV2,
} from "./model-candidate";
import {
  createNarratorCandidateProvenanceDossierV3,
  createNarratorCandidateStagingReportV1,
  type NarratorCandidateProvenanceDossierV3,
  type NarratorCandidateStagingReportV1,
} from "./model-provenance";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";
import {
  narratorT5RebuildSessionsV1,
  narratorT5RebuildSourceV1,
  narratorT5RebuildToolchainV1,
} from "./t5-rebuild-evidence";

export const narratorT5ArtifactRepositoryV1 = "huntergdavis/the-grind-2-narrator-flan-t5-small";
export const narratorT5ArtifactRevisionV1 = "8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4";
export const narratorT5ArtifactReleaseTagV1 = "v0.5.80";
export const narratorT5ArtifactPublicationUrlV1 =
  `https://github.com/${narratorT5ArtifactRepositoryV1}/tree/${narratorT5ArtifactRevisionV1}`;

export type NarratorT5PublicationFileRoleV1 =
  | "artifact-manifest"
  | "checksums"
  | "converted-license"
  | "modifications"
  | "notice"
  | "publication-readme"
  | "rebuild-receipt"
  | "repository-attributes"
  | "source-license"
  | "toolchain-lock";

export interface NarratorT5PublicationFileV1 {
  readonly path: string;
  readonly role: NarratorT5PublicationFileRoleV1;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorT5ArtifactPublicationReceiptV1 {
  readonly schemaVersion: 1;
  readonly artifactRepository: typeof narratorT5ArtifactRepositoryV1;
  readonly artifactRevision: typeof narratorT5ArtifactRevisionV1;
  readonly artifactTreeRevision: "f98af3790d8aa5375a2cba6f3bdfda99283e42b0";
  readonly publicationUrl: typeof narratorT5ArtifactPublicationUrlV1;
  readonly releaseTag: typeof narratorT5ArtifactReleaseTagV1;
  readonly visibility: "public";
  readonly defaultBranch: "main";
  readonly publicationFiles: readonly NarratorT5PublicationFileV1[];
  readonly source: {
    readonly repository: "google/flan-t5-small";
    readonly revision: "0fc9ddf78a1e988dac52e2dac162b0ede4fd74ab";
    readonly spdxLicense: "Apache-2.0";
    readonly licenseEvidencePath: "README.md";
    readonly licenseEvidenceSha256: string;
    readonly retainedLicenseEvidencePath: "provenance/source-model-card.md";
  };
  readonly convertedLicense: {
    readonly spdxLicense: "Apache-2.0";
    readonly path: "LICENSE";
    readonly sha256: string;
    readonly noticePath: "NOTICE";
    readonly noticeSha256: string;
    readonly modificationsPath: "MODIFICATIONS.md";
    readonly modificationsSha256: string;
  };
  readonly rebuild: {
    readonly repository: "huntergdavis/the-grind-2";
    readonly revision: "c02e7a6326c85bbd0faf878bee65faf5c6b8dc70";
    readonly publishedReceiptPath: "provenance/t5-rebuild-receipt-v2.json";
    readonly rebuildReceiptPath: "docs/narrator/t5-rebuild-receipt-v2.json";
    readonly receiptSha256: string;
    readonly receiptContentHash: string;
    readonly publishedToolchainLockPath: "provenance/toolchain.lock.json";
    readonly toolchainLockPath: "tools/narrator-t5-rebuild/toolchain.lock.json";
    readonly toolchainLockSha256: string;
    readonly processIsolation: "fresh-python-process-per-build";
    readonly pythonHashSeed: "0";
    readonly converterRepository: "huggingface/optimum-onnx";
    readonly converterRevision: "d2328e386a81b0970a458a7570a38b131414edc6";
    readonly quantizerRepository: "huggingface/transformers.js";
    readonly quantizerRevision: "faf6c02a68927be59a7379fb84ac30bd2d169d47";
  };
  readonly runtime: typeof narratorTransformersJsRuntimeV2;
  readonly sessions: readonly NarratorModelSessionV2[];
  readonly artifacts: readonly NarratorModelArtifactV1[];
  readonly totalRuntimeBytes: number;
  readonly verification: {
    readonly captureMethod: "fresh-public-clone-sha256sum";
    readonly verifiedRevision: typeof narratorT5ArtifactRevisionV1;
    readonly checksumPath: "SHA256SUMS";
    readonly checksumSha256: string;
  };
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorT5PublishedStagingEvidenceV1 {
  readonly candidate: NarratorModelCandidateV2;
  readonly dossier: NarratorCandidateProvenanceDossierV3;
  readonly stagingReport: NarratorCandidateStagingReportV1;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;
const hashPattern = /^[0-9a-f]{16}$/u;
const safePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;

export const narratorT5PublicationFilesV1: readonly NarratorT5PublicationFileV1[] = deepFreeze([
  {
    path: ".gitattributes",
    role: "repository-attributes",
    byteLength: 156,
    sha256: "e6efcdcdc81b4b6eace29d66b4ce10a4f18e2d07fd733b77be7c9c513102e9e9",
  },
  {
    path: "artifact-manifest.json",
    role: "artifact-manifest",
    byteLength: 3_010,
    sha256: "425925892eac16997bd47c5cda3797f06a0b68950531ec1e4e039b6e8ffc832b",
  },
  {
    path: "LICENSE",
    role: "converted-license",
    byteLength: 11_358,
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
  {
    path: "MODIFICATIONS.md",
    role: "modifications",
    byteLength: 1_450,
    sha256: "59280bdb8b8d565b554ca87687981a5ee39cb3c2e09c445f486c8a3c3c549ece",
  },
  {
    path: "NOTICE",
    role: "notice",
    byteLength: 986,
    sha256: "58fc8127b21df7fc69cba6e097f7296e37291c39e6162300943c8492262fde1d",
  },
  {
    path: "README.md",
    role: "publication-readme",
    byteLength: 3_445,
    sha256: "de849f79de4b51f70ee17a1caf1d4da747be3b5c61bf82cf5de26b759d0981d2",
  },
  {
    path: "SHA256SUMS",
    role: "checksums",
    byteLength: 1_318,
    sha256: "f568e2e09f9ee56228946e93ce54d35e7651197993a75b7a34437b153159025a",
  },
  {
    path: "provenance/source-model-card.md",
    role: "source-license",
    byteLength: 10_820,
    sha256: "6cc6dc3d056aaeda9549dc685ca51600d600ab5b87c73c12e7165d8eff6b0c51",
  },
  {
    path: "provenance/t5-rebuild-receipt-v2.json",
    role: "rebuild-receipt",
    byteLength: 11_915,
    sha256: "90730a2fef7197ac081e6bc8022331c5bd90ce42604b1855c7774058c956d0a2",
  },
  {
    path: "provenance/toolchain.lock.json",
    role: "toolchain-lock",
    byteLength: 10_282,
    sha256: "f66c37332647f9ca940ee5295e8d2ecff7d1247b32bed16e2a45b362d0df78f2",
  },
]);

export const narratorT5PublishedArtifactsV1: readonly NarratorModelArtifactV1[] = deepFreeze([
  {
    path: "config.json",
    role: "configuration",
    byteLength: 1_401,
    sha256: "439aa0fecf5a5546a1def68b1fc45e538e2c94528ce805378daf091e2bf6e4de",
  },
  {
    path: "generation_config.json",
    role: "configuration",
    byteLength: 147,
    sha256: "f5a1c7e2be8092018d8835128987edf0111637dd98e90599cc80310fef75d95a",
  },
  {
    path: "onnx/decoder_model_merged_quantized.onnx",
    role: "weights",
    byteLength: 59_041_810,
    sha256: "b311b1a2e1977d79613363959a03fc10db0829e1a317886a9f973630d811d648",
  },
  {
    path: "onnx/encoder_model_quantized.onnx",
    role: "weights",
    byteLength: 35_612_462,
    sha256: "eb075ffa4c573796cf5a2c95197b4be7e2138552224ddeecca8a7454d218ab24",
  },
  {
    path: "tokenizer.json",
    role: "tokenizer",
    byteLength: 2_424_064,
    sha256: "fe2ebbbbde2985be723e0ce18217853e4020c5e9d35bd07be2c27ab9d3ead57a",
  },
  {
    path: "tokenizer_config.json",
    role: "tokenizer",
    byteLength: 2_539,
    sha256: "fcde0f79bffda3688119c94330866a8fbf8de20ae65a8c492c9bd47c704655a0",
  },
]);

export const narratorT5PublicationSourceV1 = deepFreeze({
  repository: narratorT5RebuildSourceV1.repository,
  revision: narratorT5RebuildSourceV1.revision,
  spdxLicense: narratorT5RebuildSourceV1.spdxLicense,
  licenseEvidencePath: narratorT5RebuildSourceV1.licenseEvidencePath,
  licenseEvidenceSha256: narratorT5RebuildSourceV1.files.find(
    (file) => file.path === narratorT5RebuildSourceV1.licenseEvidencePath,
  )!.sha256,
  retainedLicenseEvidencePath: "provenance/source-model-card.md" as const,
});

export const narratorT5PublicationConvertedLicenseV1 = deepFreeze({
  spdxLicense: "Apache-2.0" as const,
  path: "LICENSE" as const,
  sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  noticePath: "NOTICE" as const,
  noticeSha256: "58fc8127b21df7fc69cba6e097f7296e37291c39e6162300943c8492262fde1d",
  modificationsPath: "MODIFICATIONS.md" as const,
  modificationsSha256: "59280bdb8b8d565b554ca87687981a5ee39cb3c2e09c445f486c8a3c3c549ece",
});

export const narratorT5PublicationRebuildV1 = deepFreeze({
  repository: "huntergdavis/the-grind-2" as const,
  revision: "c02e7a6326c85bbd0faf878bee65faf5c6b8dc70" as const,
  publishedReceiptPath: "provenance/t5-rebuild-receipt-v2.json" as const,
  rebuildReceiptPath: "docs/narrator/t5-rebuild-receipt-v2.json" as const,
  receiptSha256: "90730a2fef7197ac081e6bc8022331c5bd90ce42604b1855c7774058c956d0a2",
  receiptContentHash: "ea7f769303bb5e2b",
  publishedToolchainLockPath: "provenance/toolchain.lock.json" as const,
  toolchainLockPath: "tools/narrator-t5-rebuild/toolchain.lock.json" as const,
  toolchainLockSha256: "f66c37332647f9ca940ee5295e8d2ecff7d1247b32bed16e2a45b362d0df78f2",
  processIsolation: "fresh-python-process-per-build" as const,
  pythonHashSeed: "0" as const,
  converterRepository: narratorT5RebuildToolchainV1.converterRepository,
  converterRevision: narratorT5RebuildToolchainV1.converterRevision,
  quantizerRepository: narratorT5RebuildToolchainV1.quantizerRepository,
  quantizerRevision: narratorT5RebuildToolchainV1.quantizerRevision,
});

export const narratorT5PublicationVerificationV1 = deepFreeze({
  captureMethod: "fresh-public-clone-sha256sum" as const,
  verifiedRevision: narratorT5ArtifactRevisionV1,
  checksumPath: "SHA256SUMS" as const,
  checksumSha256: "f568e2e09f9ee56228946e93ce54d35e7651197993a75b7a34437b153159025a",
});

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function publicationFileIsValid(value: unknown): value is NarratorT5PublicationFileV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && safePathPattern.test(value.path)
    && isNarratorBoundedText(value.role, 80)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (typeof value.contentHash !== "string" || !hashPattern.test(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  try {
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

export function isNarratorT5ArtifactPublicationReceiptV1(
  value: unknown,
): value is NarratorT5ArtifactPublicationReceiptV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, [
    "schemaVersion", "artifactRepository", "artifactRevision", "artifactTreeRevision",
    "publicationUrl", "releaseTag",
    "visibility", "defaultBranch", "publicationFiles", "source", "convertedLicense", "rebuild", "runtime",
    "sessions", "artifacts", "totalRuntimeBytes", "verification", "modelAdmitted",
    "displayAuthorized", "contentHash",
  ])) return false;
  if (value.schemaVersion !== 1
    || value.artifactRepository !== narratorT5ArtifactRepositoryV1
    || value.artifactRevision !== narratorT5ArtifactRevisionV1
    || value.artifactTreeRevision !== "f98af3790d8aa5375a2cba6f3bdfda99283e42b0"
    || value.publicationUrl !== narratorT5ArtifactPublicationUrlV1
    || value.releaseTag !== narratorT5ArtifactReleaseTagV1
    || value.visibility !== "public"
    || value.defaultBranch !== "main"
    || !Array.isArray(value.publicationFiles)
    || value.publicationFiles.length !== narratorT5PublicationFilesV1.length
    || !value.publicationFiles.every(publicationFileIsValid)
    || !exactCanonical(value.publicationFiles, narratorT5PublicationFilesV1)
    || !exactCanonical(value.source, narratorT5PublicationSourceV1)
    || !exactCanonical(value.convertedLicense, narratorT5PublicationConvertedLicenseV1)
    || !exactCanonical(value.rebuild, narratorT5PublicationRebuildV1)
    || !exactCanonical(value.runtime, narratorTransformersJsRuntimeV2)
    || !exactCanonical(value.sessions, narratorT5RebuildSessionsV1)
    || !exactCanonical(value.artifacts, narratorT5PublishedArtifactsV1)
    || !exactCanonical(value.verification, narratorT5PublicationVerificationV1)
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !Number.isSafeInteger(value.totalRuntimeBytes)
    || value.totalRuntimeBytes !== narratorT5PublishedArtifactsV1.reduce(
      (total, artifact) => total + artifact.byteLength,
      0,
    )
    || !hashedContentIsValid(value)) return false;
  return true;
}

export function createNarratorT5ArtifactPublicationReceiptV1(
  fields: Omit<NarratorT5ArtifactPublicationReceiptV1, "schemaVersion" | "contentHash">,
): NarratorT5ArtifactPublicationReceiptV1 {
  const content = { schemaVersion: 1 as const, ...fields };
  const receipt = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorT5ArtifactPublicationReceiptV1(receipt)) {
    throw new TypeError("Narrator T5 artifact publication receipt is invalid");
  }
  return receipt;
}

export function createNarratorT5PublishedCandidateV1(
  receipt: unknown,
): NarratorModelCandidateV2 {
  if (!isNarratorT5ArtifactPublicationReceiptV1(receipt)) {
    throw new TypeError("Narrator T5 artifact publication receipt is invalid");
  }
  return createNarratorModelCandidateV2({
    candidateId: `flan-t5-small-q8@${receipt.artifactRevision.slice(0, 8)}`,
    task: "single-ambient-line",
    modelFamily: "t5",
    sessions: receipt.sessions,
    model: {
      repository: receipt.artifactRepository,
      revision: receipt.artifactRevision,
      sourceRepository: receipt.source.repository,
      sourceRevision: receipt.source.revision,
      license: receipt.convertedLicense.spdxLicense,
      licenseStatus: "verified",
    },
    runtime: { ...receipt.runtime },
    execution: "wasm",
    artifacts: receipt.artifacts,
    measuredIncrementalMemoryBytes: null,
  });
}

export function createNarratorT5PublishedStagingEvidenceV1(
  receipt: unknown,
): NarratorT5PublishedStagingEvidenceV1 {
  if (!isNarratorT5ArtifactPublicationReceiptV1(receipt)) {
    throw new TypeError("Narrator T5 artifact publication receipt is invalid");
  }
  const candidate = createNarratorT5PublishedCandidateV1(receipt);
  const dossier = createNarratorCandidateProvenanceDossierV3({
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
      path: receipt.source.licenseEvidencePath,
      sha256: receipt.source.licenseEvidenceSha256,
      spdxLicense: receipt.source.spdxLicense,
      captureMethod: "pinned-repository-file",
    },
    convertedLicenseEvidence: {
      repository: candidate.model.repository,
      revision: candidate.model.revision,
      path: receipt.convertedLicense.path,
      sha256: receipt.convertedLicense.sha256,
      spdxLicense: receipt.convertedLicense.spdxLicense,
      captureMethod: "pinned-repository-file",
    },
    conversionLineageEvidence: {
      conversionRepository: candidate.model.repository,
      conversionRevision: candidate.model.revision,
      sourceRepository: candidate.model.sourceRepository,
      sourceRevision: candidate.model.sourceRevision,
      rebuildRepository: receipt.rebuild.repository,
      rebuildRevision: receipt.rebuild.revision,
      converterRepository: receipt.rebuild.converterRepository,
      converterRevision: receipt.rebuild.converterRevision,
      quantizerRepository: receipt.rebuild.quantizerRepository,
      quantizerRevision: receipt.rebuild.quantizerRevision,
      publishedReceiptPath: receipt.rebuild.publishedReceiptPath,
      rebuildReceiptPath: receipt.rebuild.rebuildReceiptPath,
      rebuildReceiptSha256: receipt.rebuild.receiptSha256,
      rebuildReceiptContentHash: receipt.rebuild.receiptContentHash,
      publishedToolchainLockPath: receipt.rebuild.publishedToolchainLockPath,
      toolchainLockPath: receipt.rebuild.toolchainLockPath,
      toolchainLockSha256: receipt.rebuild.toolchainLockSha256,
      captureMethod: "pinned-rebuild-receipt",
    },
    coordinatorId: "the-grind-2:v0.5.81-publication-closure",
  });
  const stagingReport = createNarratorCandidateStagingReportV1(candidate, dossier);
  if (stagingReport.disposition !== "eligible-for-device-staging"
    || stagingReport.blockers.length !== 0
    || narratorCandidateManifestBlockers(candidate).some(
      (blocker) => blocker !== "incremental-memory-unmeasured",
    )) {
    throw new TypeError("Published narrator candidate is not eligible for device staging");
  }
  return deepFreeze({ candidate, dossier, stagingReport });
}
