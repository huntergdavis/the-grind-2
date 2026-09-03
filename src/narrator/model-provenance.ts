import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  narratorArtifactManifestHash,
  narratorCandidateManifestHash,
} from "./evaluation-receipts";
import {
  isNarratorModelCandidate,
  narratorCandidateSessionManifest,
  narratorCandidateManifestBlockers,
  type NarratorModelSessionV2,
} from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";

export interface NarratorPinnedLicenseEvidenceV1 {
  readonly repository: string;
  readonly revision: string;
  readonly path: string;
  readonly sha256: string;
  readonly spdxLicense: string;
  readonly captureMethod: "pinned-repository-file";
}

export interface NarratorConversionLineageEvidenceV1 {
  readonly conversionRepository: string;
  readonly conversionRevision: string;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly converterRepository: string;
  readonly converterRevision: string;
  readonly conversionCommand: string;
  readonly path: string;
  readonly sha256: string;
  readonly captureMethod: "pinned-repository-file";
}

export interface NarratorArtifactSessionV1 {
  readonly sessionId: string;
  readonly artifactPath: string;
}

export interface NarratorCandidateProvenanceDossierV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly artifactRepository: string;
  readonly artifactRevision: string;
  readonly artifactSessions: readonly NarratorArtifactSessionV1[];
  readonly modelRepository: string;
  readonly modelRevision: string;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly sourceLicenseEvidence: NarratorPinnedLicenseEvidenceV1 | null;
  readonly convertedLicenseEvidence: NarratorPinnedLicenseEvidenceV1 | null;
  readonly conversionLineageEvidence: NarratorConversionLineageEvidenceV1 | null;
  readonly coordinatorId: string;
  readonly contentHash: string;
}

export interface NarratorCandidateProvenanceDossierV2 extends Omit<
  NarratorCandidateProvenanceDossierV1,
  "schemaVersion" | "artifactSessions"
> {
  readonly schemaVersion: 2;
  readonly artifactSessions: readonly NarratorModelSessionV2[];
}

export type NarratorCandidateProvenanceDossier =
  | NarratorCandidateProvenanceDossierV1
  | NarratorCandidateProvenanceDossierV2;

export type NarratorCandidateStagingBlocker =
  | "candidate-schema-invalid"
  | "dossier-schema-invalid"
  | "dossier-candidate-version-mismatch"
  | "candidate-id-mismatch"
  | "candidate-manifest-hash-mismatch"
  | "artifact-manifest-hash-mismatch"
  | "artifact-repository-mismatch"
  | "artifact-revision-mismatch"
  | "artifact-session-manifest-mismatch"
  | "model-repository-mismatch"
  | "model-revision-mismatch"
  | "source-repository-mismatch"
  | "source-revision-mismatch"
  | "candidate-license-unverified"
  | "candidate-license-mismatch"
  | "source-license-evidence-missing"
  | "source-license-binding-mismatch"
  | "source-license-not-permissive"
  | "converted-license-evidence-missing"
  | "converted-license-binding-mismatch"
  | "converted-license-not-permissive"
  | "conversion-lineage-evidence-missing"
  | "conversion-lineage-binding-mismatch"
  | "conversion-command-source-revision-missing"
  | "candidate-static-policy-blocked";

export interface NarratorCandidateStagingReportV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly dossierHash: string;
  readonly disposition: "blocked" | "eligible-for-device-staging";
  readonly blockers: readonly NarratorCandidateStagingBlocker[];
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

interface DossierV1Fields extends Omit<NarratorCandidateProvenanceDossierV1,
  "schemaVersion" | "contentHash"> {}

interface DossierV2Fields extends Omit<NarratorCandidateProvenanceDossierV2,
  "schemaVersion" | "contentHash"> {}

const hashPattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const revisionPattern = /^[0-9a-f]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;
const permissiveSpdxLicenses = new Set(["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT"]);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (typeof value.contentHash !== "string" || !hashPattern.test(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

function isRepository(value: unknown): value is string {
  return isNarratorBoundedText(value, 200) && repositoryPattern.test(value);
}

function isEvidencePath(value: unknown): value is string {
  return isNarratorBoundedText(value, 240)
    && !String(value).startsWith("/")
    && !String(value).includes("\\")
    && !String(value).split("/").includes("..");
}

function isPinnedLicenseEvidence(value: unknown): value is NarratorPinnedLicenseEvidenceV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "repository", "revision", "path", "sha256", "spdxLicense", "captureMethod",
    ])
    && isRepository(value.repository)
    && revisionPattern.test(String(value.revision))
    && isEvidencePath(value.path)
    && sha256Pattern.test(String(value.sha256))
    && isNarratorBoundedText(value.spdxLicense, 80)
    && value.captureMethod === "pinned-repository-file";
}

function isConversionLineageEvidence(value: unknown): value is NarratorConversionLineageEvidenceV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "conversionRepository", "conversionRevision", "sourceRepository", "sourceRevision",
      "converterRepository", "converterRevision", "conversionCommand", "path", "sha256", "captureMethod",
    ])
    && isRepository(value.conversionRepository)
    && revisionPattern.test(String(value.conversionRevision))
    && isRepository(value.sourceRepository)
    && revisionPattern.test(String(value.sourceRevision))
    && isRepository(value.converterRepository)
    && revisionPattern.test(String(value.converterRevision))
    && isNarratorBoundedText(value.conversionCommand, 500)
    && isEvidencePath(value.path)
    && sha256Pattern.test(String(value.sha256))
    && value.captureMethod === "pinned-repository-file";
}

function isArtifactSession(value: unknown): value is NarratorArtifactSessionV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["sessionId", "artifactPath"])
    && isNarratorBoundedText(value.sessionId, 120)
    && isEvidencePath(value.artifactPath);
}

function isArtifactSessionV2(value: unknown): value is NarratorModelSessionV2 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["runtimeSessionKey", "fileStem", "dtype", "artifactPath"])
    || value.dtype !== "q8"
    || !isEvidencePath(value.artifactPath)) return false;
  return (value.runtimeSessionKey === "model"
      && (value.fileStem === "model" || value.fileStem === "encoder_model"))
    || (value.runtimeSessionKey === "decoder_model_merged"
      && value.fileStem === "decoder_model_merged");
}

export function createNarratorCandidateProvenanceDossierV1(
  fields: DossierV1Fields,
): NarratorCandidateProvenanceDossierV1 {
  const content = { schemaVersion: 1 as const, ...fields };
  const dossier = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorCandidateProvenanceDossierV1(dossier)) {
    throw new TypeError("Narrator candidate provenance dossier is invalid");
  }
  return dossier;
}

export function createNarratorCandidateProvenanceDossierV2(
  fields: DossierV2Fields,
): NarratorCandidateProvenanceDossierV2 {
  const content = { schemaVersion: 2 as const, ...fields };
  const dossier = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorCandidateProvenanceDossierV2(dossier)) {
    throw new TypeError("Narrator V2 candidate provenance dossier is invalid");
  }
  return dossier;
}

function dossierCommonIsValid(value: Record<string, unknown>): boolean {
  return narratorHasExactKeys(value, [
    "schemaVersion", "candidateId", "candidateManifestHash", "artifactManifestHash",
    "artifactRepository", "artifactRevision", "artifactSessions",
    "modelRepository", "modelRevision", "sourceRepository", "sourceRevision",
    "sourceLicenseEvidence", "convertedLicenseEvidence", "conversionLineageEvidence",
    "coordinatorId", "contentHash",
  ])
    && isNarratorBoundedText(value.candidateId, 160)
    && hashPattern.test(String(value.candidateManifestHash))
    && hashPattern.test(String(value.artifactManifestHash))
    && isRepository(value.artifactRepository)
    && revisionPattern.test(String(value.artifactRevision))
    && Array.isArray(value.artifactSessions)
    && value.artifactSessions.length > 0
    && value.artifactSessions.length <= 8
    && isRepository(value.modelRepository)
    && revisionPattern.test(String(value.modelRevision))
    && isRepository(value.sourceRepository)
    && revisionPattern.test(String(value.sourceRevision))
    && (value.sourceLicenseEvidence === null || isPinnedLicenseEvidence(value.sourceLicenseEvidence))
    && (value.convertedLicenseEvidence === null || isPinnedLicenseEvidence(value.convertedLicenseEvidence))
    && (value.conversionLineageEvidence === null
      || isConversionLineageEvidence(value.conversionLineageEvidence))
    && isNarratorBoundedText(value.coordinatorId, 160)
    && hashedContentIsValid(value);
}

export function isNarratorCandidateProvenanceDossierV1(
  value: unknown,
): value is NarratorCandidateProvenanceDossierV1 {
  return isNarratorRecord(value)
    && value.schemaVersion === 1
    && dossierCommonIsValid(value)
    && Array.isArray(value.artifactSessions)
    && value.artifactSessions.every(isArtifactSession)
    && new Set(value.artifactSessions.map((session) => session.sessionId)).size === value.artifactSessions.length
    && new Set(value.artifactSessions.map((session) => session.artifactPath)).size === value.artifactSessions.length
}

export function isNarratorCandidateProvenanceDossierV2(
  value: unknown,
): value is NarratorCandidateProvenanceDossierV2 {
  return isNarratorRecord(value)
    && value.schemaVersion === 2
    && dossierCommonIsValid(value)
    && Array.isArray(value.artifactSessions)
    && value.artifactSessions.every(isArtifactSessionV2)
    && new Set(value.artifactSessions.map((session) => session.runtimeSessionKey)).size
      === value.artifactSessions.length
    && new Set(value.artifactSessions.map((session) => session.artifactPath)).size
      === value.artifactSessions.length;
}

export function isNarratorCandidateProvenanceDossier(
  value: unknown,
): value is NarratorCandidateProvenanceDossier {
  return isNarratorCandidateProvenanceDossierV1(value)
    || isNarratorCandidateProvenanceDossierV2(value);
}

function licenseEvidenceMatches(
  evidence: NarratorPinnedLicenseEvidenceV1,
  repository: string,
  revision: string,
): boolean {
  return evidence.repository === repository && evidence.revision === revision;
}

function stagingBlockers(
  candidate: unknown,
  dossier: unknown,
): NarratorCandidateStagingBlocker[] {
  if (!isNarratorModelCandidate(candidate)) return ["candidate-schema-invalid"];
  if (!isNarratorCandidateProvenanceDossier(dossier)) return ["dossier-schema-invalid"];
  const blockers: NarratorCandidateStagingBlocker[] = [];
  if (dossier.schemaVersion !== candidate.schemaVersion) blockers.push("dossier-candidate-version-mismatch");
  if (dossier.candidateId !== candidate.candidateId) blockers.push("candidate-id-mismatch");
  if (dossier.candidateManifestHash !== narratorCandidateManifestHash(candidate)) {
    blockers.push("candidate-manifest-hash-mismatch");
  }
  if (dossier.artifactManifestHash !== narratorArtifactManifestHash(candidate)) {
    blockers.push("artifact-manifest-hash-mismatch");
  }
  if (dossier.artifactRepository !== candidate.model.repository) blockers.push("artifact-repository-mismatch");
  if (dossier.artifactRevision !== candidate.model.revision) blockers.push("artifact-revision-mismatch");
  if (canonicalStringify(dossier.artifactSessions)
    !== canonicalStringify(narratorCandidateSessionManifest(candidate))) {
    blockers.push("artifact-session-manifest-mismatch");
  }
  if (dossier.modelRepository !== candidate.model.repository) blockers.push("model-repository-mismatch");
  if (dossier.modelRevision !== candidate.model.revision) blockers.push("model-revision-mismatch");
  if (dossier.sourceRepository !== candidate.model.sourceRepository) blockers.push("source-repository-mismatch");
  if (dossier.sourceRevision !== candidate.model.sourceRevision) blockers.push("source-revision-mismatch");
  if (candidate.model.licenseStatus !== "verified" || candidate.model.license === null) {
    blockers.push("candidate-license-unverified");
  }

  const sourceLicense = dossier.sourceLicenseEvidence;
  if (sourceLicense === null) blockers.push("source-license-evidence-missing");
  else {
    if (!licenseEvidenceMatches(sourceLicense, candidate.model.sourceRepository, candidate.model.sourceRevision)) {
      blockers.push("source-license-binding-mismatch");
    }
    if (!permissiveSpdxLicenses.has(sourceLicense.spdxLicense)) {
      blockers.push("source-license-not-permissive");
    }
  }

  const convertedLicense = dossier.convertedLicenseEvidence;
  if (convertedLicense === null) blockers.push("converted-license-evidence-missing");
  else {
    if (!licenseEvidenceMatches(convertedLicense, candidate.model.repository, candidate.model.revision)) {
      blockers.push("converted-license-binding-mismatch");
    }
    if (!permissiveSpdxLicenses.has(convertedLicense.spdxLicense)) {
      blockers.push("converted-license-not-permissive");
    }
    if (candidate.model.license !== null && convertedLicense.spdxLicense !== candidate.model.license) {
      blockers.push("candidate-license-mismatch");
    }
  }

  const lineage = dossier.conversionLineageEvidence;
  if (lineage === null) blockers.push("conversion-lineage-evidence-missing");
  else if (lineage.conversionRepository !== candidate.model.repository
    || lineage.conversionRevision !== candidate.model.revision
    || lineage.sourceRepository !== candidate.model.sourceRepository
    || lineage.sourceRevision !== candidate.model.sourceRevision) {
    blockers.push("conversion-lineage-binding-mismatch");
  } else if (!lineage.conversionCommand.includes(candidate.model.sourceRevision)) {
    blockers.push("conversion-command-source-revision-missing");
  }

  const staticManifestBlockers = narratorCandidateManifestBlockers(candidate)
    .filter((blocker) => blocker !== "incremental-memory-unmeasured"
      && blocker !== "model-license-unverified"
      && blocker !== "model-license-not-permissive");
  if (staticManifestBlockers.length > 0) blockers.push("candidate-static-policy-blocked");
  return [...new Set(blockers)].sort();
}

export function createNarratorCandidateStagingReportV1(
  candidate: unknown,
  dossier: unknown,
): NarratorCandidateStagingReportV1 {
  const blockers = Object.freeze(stagingBlockers(candidate, dossier));
  const validCandidate = isNarratorModelCandidate(candidate) ? candidate : null;
  const content = {
    schemaVersion: 1 as const,
    candidateId: validCandidate?.candidateId ?? "invalid",
    candidateManifestHash: validCandidate === null ? canonicalHash(candidate) : narratorCandidateManifestHash(validCandidate),
    artifactManifestHash: validCandidate === null ? canonicalHash(null) : narratorArtifactManifestHash(validCandidate),
    dossierHash: isNarratorCandidateProvenanceDossier(dossier) ? dossier.contentHash : canonicalHash(dossier),
    disposition: blockers.length === 0 ? "eligible-for-device-staging" as const : "blocked" as const,
    blockers,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorCandidateStagingReportForEvidenceV1(
  value: unknown,
  candidate: unknown,
  dossier: unknown,
): value is NarratorCandidateStagingReportV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "candidateId", "candidateManifestHash", "artifactManifestHash", "dossierHash",
      "disposition", "blockers", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !["blocked", "eligible-for-device-staging"].includes(String(value.disposition))
    || !Array.isArray(value.blockers)
    || value.blockers.some((blocker) => !isNarratorBoundedText(blocker, 100))
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !hashedContentIsValid(value)) return false;
  return canonicalStringify(value) === canonicalStringify(
    createNarratorCandidateStagingReportV1(candidate, dossier),
  );
}
