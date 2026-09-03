import {
  narratorIncrementalMemoryBudgetBytes,
  narratorStoredWeightBudgetBytes,
} from "./capability";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";

export type NarratorArtifactRole = "weights" | "tokenizer" | "configuration";
export type NarratorLicenseStatus = "verified" | "unverified";
export type NarratorModelFamilyV2 = "decoder-only" | "t5";

export interface NarratorModelArtifactV1 {
  readonly path: string;
  readonly role: NarratorArtifactRole;
  readonly byteLength: number;
  readonly sha256: string;
}

export type NarratorModelSessionV2 =
  | {
      readonly runtimeSessionKey: "model";
      readonly fileStem: "model" | "encoder_model";
      readonly dtype: "q8";
      readonly artifactPath: string;
    }
  | {
      readonly runtimeSessionKey: "decoder_model_merged";
      readonly fileStem: "decoder_model_merged";
      readonly dtype: "q8";
      readonly artifactPath: string;
    };

export type NarratorCandidateSessionManifestItem =
  | { readonly sessionId: "model"; readonly artifactPath: string }
  | NarratorModelSessionV2;

interface NarratorModelIdentity {
  readonly repository: string;
  readonly revision: string;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly license: string | null;
  readonly licenseStatus: NarratorLicenseStatus;
}

interface NarratorRuntimeIdentity {
  readonly package: "@huggingface/transformers";
  readonly version: string;
  readonly license: string;
  readonly integrity: string;
  readonly unpackedByteLength: number;
}

export interface NarratorModelCandidateV1 {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly task: "single-ambient-line";
  readonly model: NarratorModelIdentity;
  readonly runtime: NarratorRuntimeIdentity;
  readonly execution: "wasm";
  readonly artifacts: readonly NarratorModelArtifactV1[];
  readonly measuredIncrementalMemoryBytes: number | null;
}

export interface NarratorModelCandidateV2 {
  readonly schemaVersion: 2;
  readonly candidateId: string;
  readonly task: "single-ambient-line";
  readonly modelFamily: NarratorModelFamilyV2;
  readonly sessions: readonly NarratorModelSessionV2[];
  readonly model: NarratorModelIdentity;
  readonly runtime: NarratorRuntimeIdentity;
  readonly execution: "wasm";
  readonly artifacts: readonly NarratorModelArtifactV1[];
  readonly measuredIncrementalMemoryBytes: number | null;
}

export type NarratorModelCandidate = NarratorModelCandidateV1 | NarratorModelCandidateV2;

export type NarratorCandidateManifestBlocker =
  | "candidate-schema-invalid"
  | "candidate-model-family-invalid"
  | "candidate-session-set-invalid"
  | "candidate-session-artifact-missing"
  | "candidate-session-artifact-not-weight"
  | "candidate-session-artifact-name-invalid"
  | "candidate-weight-artifact-unmapped"
  | "candidate-runtime-artifact-unmapped"
  | "candidate-runtime-contract-mismatch"
  | "candidate-id-invalid"
  | "model-revision-unpinned"
  | "source-revision-unpinned"
  | "model-license-unverified"
  | "model-license-not-permissive"
  | "runtime-unpinned"
  | "runtime-license-not-permissive"
  | "runtime-integrity-unpinned"
  | "artifact-manifest-empty"
  | "artifact-path-duplicate"
  | "artifact-byte-length-invalid"
  | "artifact-hash-unpinned"
  | "stored-byte-budget-exceeded"
  | "incremental-memory-unmeasured"
  | "incremental-memory-budget-exceeded";

const permissiveSpdxLicenses = new Set(["Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MIT"]);
const sha256Pattern = /^[0-9a-f]{64}$/u;
const revisionPattern = /^[0-9a-f]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u;
const artifactPathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[\p{L}\p{N}._@+-]+(?:\/[\p{L}\p{N}._@+-]+)*$/u;
const integrityPattern = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const versionPattern = /^\d+\.\d+\.\d+$/u;
export const narratorTransformersJsRuntimeV2 = Object.freeze({
  package: "@huggingface/transformers" as const,
  version: "4.2.0",
  license: "Apache-2.0",
  integrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==",
  unpackedByteLength: 9_536_375,
});

function freezeCandidate<T extends NarratorModelCandidate>(candidate: T): T {
  for (const artifact of candidate.artifacts) Object.freeze(artifact);
  Object.freeze(candidate.artifacts);
  if (candidate.schemaVersion === 2) {
    for (const session of candidate.sessions) Object.freeze(session);
    Object.freeze(candidate.sessions);
  }
  Object.freeze(candidate.model);
  Object.freeze(candidate.runtime);
  return Object.freeze(candidate);
}

export const tinyStoriesInstruct33MInt8Candidate = freezeCandidate({
  schemaVersion: 1,
  candidateId: "tiny-stories-instruct-33m-int8@02162995",
  task: "single-ambient-line",
  model: {
    repository: "onnx-community/TinyStories-Instruct-33M-ONNX",
    revision: "02162995cfc01a050693c1dab1aa80d83d65b44d",
    sourceRepository: "roneneldan/TinyStories-Instruct-33M",
    sourceRevision: "a16a5748e848e534c3efa91b4d96dd752db27e5f",
    license: null,
    licenseStatus: "unverified",
  },
  runtime: {
    package: "@huggingface/transformers",
    version: "4.2.0",
    license: "Apache-2.0",
    integrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==",
    unpackedByteLength: 9_536_375,
  },
  execution: "wasm",
  artifacts: [
    {
      path: "onnx/model_int8.onnx",
      role: "weights",
      byteLength: 77_282_432,
      sha256: "3e677ac42bf7e06be29c4907dbbad8f92e6dc5aa38e1935210b718c0b8b7d162",
    },
    {
      path: "config.json",
      role: "configuration",
      byteLength: 1_049,
      sha256: "f5f711bd81281a3db30268626a65415a857130b002d53fe95f51eedd07c5185f",
    },
    {
      path: "generation_config.json",
      role: "configuration",
      byteLength: 119,
      sha256: "e7f6144153c0e1c0ccd6c327134b1bcc8f4e36e164d903935b08753947126636",
    },
    {
      path: "merges.txt",
      role: "tokenizer",
      byteLength: 456_318,
      sha256: "1ce1664773c50f3e0cc8842619a93edc4624525b728b188a9e0be33b7726adc5",
    },
    {
      path: "special_tokens_map.json",
      role: "tokenizer",
      byteLength: 438,
      sha256: "98412137ae43c77f8af52eb51b19c3536d3242cb55339167d841005fa94a23b7",
    },
    {
      path: "tokenizer.json",
      role: "tokenizer",
      byteLength: 3_557_680,
      sha256: "1fe93b6152957cf9cfd6d89002467f789ce8b3f3e000b3a2edf27c808ddd0b9e",
    },
    {
      path: "tokenizer_config.json",
      role: "tokenizer",
      byteLength: 545,
      sha256: "d44f96d1a3b18e1424b485eea2c772a6ab6295558cd78d5efa24a0144da8d8f5",
    },
    {
      path: "vocab.json",
      role: "tokenizer",
      byteLength: 798_156,
      sha256: "3ba3c3109ff33976c4bd966589c11ee14fcaa1f4c9e5e154c2ed7f99d80709e7",
    },
  ],
  measuredIncrementalMemoryBytes: null,
});

export function narratorCandidateStoredBytes(candidate: NarratorModelCandidate): number {
  return candidate.artifacts.reduce((total, artifact) => total + artifact.byteLength, 0);
}

function candidateCommonIsValid(value: Record<string, unknown>): boolean {
  return value.task === "single-ambient-line"
    && value.execution === "wasm"
    && isNarratorBoundedText(value.candidateId, 160)
    && isNarratorRecord(value.model)
    && narratorHasExactKeys(value.model, [
      "repository", "revision", "sourceRepository", "sourceRevision", "license", "licenseStatus",
    ])
    && isNarratorBoundedText(value.model.repository, 200)
    && repositoryPattern.test(value.model.repository)
    && revisionPattern.test(String(value.model.revision))
    && isNarratorBoundedText(value.model.sourceRepository, 200)
    && repositoryPattern.test(value.model.sourceRepository)
    && revisionPattern.test(String(value.model.sourceRevision))
    && ["verified", "unverified"].includes(String(value.model.licenseStatus))
    && (value.model.license === null || isNarratorBoundedText(value.model.license, 80))
    && isNarratorRecord(value.runtime)
    && narratorHasExactKeys(value.runtime, ["package", "version", "license", "integrity", "unpackedByteLength"])
    && value.runtime.package === "@huggingface/transformers"
    && versionPattern.test(String(value.runtime.version))
    && isNarratorBoundedText(value.runtime.license, 80)
    && integrityPattern.test(String(value.runtime.integrity))
    && Number.isSafeInteger(value.runtime.unpackedByteLength)
    && Number(value.runtime.unpackedByteLength) > 0
    && Array.isArray(value.artifacts)
    && value.artifacts.length > 0
    && value.artifacts.length <= 64
    && value.artifacts.every(isArtifact)
    && value.artifacts.some((artifact) => artifact.role === "tokenizer")
    && value.artifacts.some((artifact) => artifact.role === "configuration")
    && (value.measuredIncrementalMemoryBytes === null
      || (Number.isSafeInteger(value.measuredIncrementalMemoryBytes)
        && Number(value.measuredIncrementalMemoryBytes) > 0));
}

function isArtifact(value: unknown): value is NarratorModelArtifactV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && artifactPathPattern.test(value.path)
    && ["weights", "tokenizer", "configuration"].includes(String(value.role))
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

export function isNarratorModelCandidateV1(value: unknown): value is NarratorModelCandidateV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, [
    "schemaVersion", "candidateId", "task", "model", "runtime", "execution", "artifacts",
    "measuredIncrementalMemoryBytes",
  ])) return false;
  if (value.schemaVersion !== 1 || !candidateCommonIsValid(value)) return false;
  const roles = (value.artifacts as NarratorModelArtifactV1[]).map((artifact) => artifact.role);
  return roles.filter((role) => role === "weights").length === 1
    && roles.includes("tokenizer")
    && roles.includes("configuration");
}

function v2EnvelopeIsValid(value: unknown): value is Record<string, unknown> & {
  readonly artifacts: readonly NarratorModelArtifactV1[];
  readonly modelFamily: string;
  readonly sessions: readonly {
    readonly runtimeSessionKey: string;
    readonly fileStem: string;
    readonly dtype: string;
    readonly artifactPath: string;
  }[];
} {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "schemaVersion", "candidateId", "task", "modelFamily", "sessions", "model", "runtime",
      "execution", "artifacts", "measuredIncrementalMemoryBytes",
    ])
    && value.schemaVersion === 2
    && candidateCommonIsValid(value)
    && isNarratorBoundedText(value.modelFamily, 80)
    && Array.isArray(value.sessions)
    && value.sessions.length > 0
    && value.sessions.length <= 8
    && value.sessions.every((session) => isNarratorRecord(session)
      && narratorHasExactKeys(session, ["runtimeSessionKey", "fileStem", "dtype", "artifactPath"])
      && isNarratorBoundedText(session.runtimeSessionKey, 80)
      && isNarratorBoundedText(session.fileStem, 80)
      && isNarratorBoundedText(session.dtype, 40)
      && isNarratorBoundedText(session.artifactPath, 240)
      && artifactPathPattern.test(session.artifactPath));
}

function narratorCandidateV2SessionBlockers(
  candidate: unknown,
): NarratorCandidateManifestBlocker[] {
  if (!v2EnvelopeIsValid(candidate)) return ["candidate-schema-invalid"];
  const blockers: NarratorCandidateManifestBlocker[] = [];
  const expectedSessions = candidate.modelFamily === "decoder-only"
    ? [{ runtimeSessionKey: "model", fileStem: "model" }]
    : candidate.modelFamily === "t5"
      ? [
          { runtimeSessionKey: "model", fileStem: "encoder_model" },
          { runtimeSessionKey: "decoder_model_merged", fileStem: "decoder_model_merged" },
        ]
      : [];
  if (!["decoder-only", "t5"].includes(candidate.modelFamily)) blockers.push("candidate-model-family-invalid");
  const runtime = candidate.runtime as unknown as NarratorRuntimeIdentity;
  if (runtime.version !== narratorTransformersJsRuntimeV2.version
    || runtime.license !== narratorTransformersJsRuntimeV2.license
    || runtime.integrity !== narratorTransformersJsRuntimeV2.integrity
    || runtime.unpackedByteLength !== narratorTransformersJsRuntimeV2.unpackedByteLength) {
    blockers.push("candidate-runtime-contract-mismatch");
  }
  if (candidate.sessions.length !== expectedSessions.length
    || candidate.sessions.some((session, index) =>
      session.runtimeSessionKey !== expectedSessions[index]?.runtimeSessionKey
      || session.fileStem !== expectedSessions[index]?.fileStem
      || session.dtype !== "q8")
    || new Set(candidate.sessions.map((session) => session.artifactPath)).size !== candidate.sessions.length) {
    blockers.push("candidate-session-set-invalid");
  }
  const artifactsByPath = new Map(candidate.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const session of candidate.sessions) {
    if (session.artifactPath !== `onnx/${session.fileStem}_quantized.onnx`) {
      blockers.push("candidate-session-artifact-name-invalid");
    }
    const artifact = artifactsByPath.get(session.artifactPath);
    if (artifact === undefined) blockers.push("candidate-session-artifact-missing");
    else if (artifact.role !== "weights") blockers.push("candidate-session-artifact-not-weight");
  }
  const mappedPaths = new Set(candidate.sessions.map((session) => session.artifactPath));
  if (candidate.artifacts.some((artifact) => artifact.role === "weights" && !mappedPaths.has(artifact.path))) {
    blockers.push("candidate-weight-artifact-unmapped");
  }
  if (candidate.artifacts.some((artifact) => artifact.path.startsWith("onnx/") && !mappedPaths.has(artifact.path))) {
    blockers.push("candidate-runtime-artifact-unmapped");
  }
  return [...new Set(blockers)];
}

export function isNarratorModelCandidateV2(value: unknown): value is NarratorModelCandidateV2 {
  return v2EnvelopeIsValid(value) && narratorCandidateV2SessionBlockers(value).length === 0;
}

export function createNarratorModelCandidateV2(
  fields: Omit<NarratorModelCandidateV2, "schemaVersion">,
): NarratorModelCandidateV2 {
  const candidate: NarratorModelCandidateV2 = {
    schemaVersion: 2,
    ...fields,
    sessions: fields.sessions.map((session) => ({ ...session })),
    model: { ...fields.model },
    runtime: { ...fields.runtime },
    artifacts: fields.artifacts.map((artifact) => ({ ...artifact })),
  };
  if (!isNarratorModelCandidateV2(candidate)) throw new TypeError("Narrator V2 candidate manifest is invalid");
  return freezeCandidate(candidate);
}

export function isNarratorModelCandidate(value: unknown): value is NarratorModelCandidate {
  return isNarratorModelCandidateV1(value) || isNarratorModelCandidateV2(value);
}

export function narratorCandidateSessionManifest(
  candidate: NarratorModelCandidate,
): readonly NarratorCandidateSessionManifestItem[] {
  if (!isNarratorModelCandidate(candidate)) throw new TypeError("Narrator candidate manifest is invalid");
  const sessions: readonly NarratorCandidateSessionManifestItem[] = candidate.schemaVersion === 1
    ? [{
        sessionId: "model",
        artifactPath: candidate.artifacts.find((artifact) => artifact.role === "weights")!.path,
      }]
    : candidate.sessions;
  return Object.freeze(sessions.map((session) => Object.freeze({ ...session })));
}

export function narratorCandidateManifestBlockers(
  candidate: unknown,
): readonly NarratorCandidateManifestBlocker[] {
  const v2SessionBlockers = isNarratorRecord(candidate) && candidate.schemaVersion === 2
    ? narratorCandidateV2SessionBlockers(candidate)
    : [];
  if (!isNarratorModelCandidate(candidate) && v2SessionBlockers.length === 0) {
    return Object.freeze(["candidate-schema-invalid"]);
  }
  if (!isNarratorModelCandidate(candidate)) return Object.freeze(v2SessionBlockers);
  const blockers: NarratorCandidateManifestBlocker[] = [];
  blockers.push(...v2SessionBlockers);
  if (candidate.candidateId.length === 0 || candidate.candidateId.length > 160) blockers.push("candidate-id-invalid");
  if (!revisionPattern.test(candidate.model.revision)) blockers.push("model-revision-unpinned");
  if (!revisionPattern.test(candidate.model.sourceRevision)) blockers.push("source-revision-unpinned");
  if (candidate.model.licenseStatus !== "verified" || candidate.model.license === null) {
    blockers.push("model-license-unverified");
  } else if (!permissiveSpdxLicenses.has(candidate.model.license)) blockers.push("model-license-not-permissive");
  if (!versionPattern.test(candidate.runtime.version)) blockers.push("runtime-unpinned");
  if (!permissiveSpdxLicenses.has(candidate.runtime.license)) blockers.push("runtime-license-not-permissive");
  if (!integrityPattern.test(candidate.runtime.integrity)) blockers.push("runtime-integrity-unpinned");
  if (candidate.artifacts.length === 0) blockers.push("artifact-manifest-empty");
  const paths = new Set<string>();
  for (const artifact of candidate.artifacts) {
    if (paths.has(artifact.path)) blockers.push("artifact-path-duplicate");
    paths.add(artifact.path);
    if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 1) blockers.push("artifact-byte-length-invalid");
    if (!sha256Pattern.test(artifact.sha256)) blockers.push("artifact-hash-unpinned");
  }
  if (narratorCandidateStoredBytes(candidate) > narratorStoredWeightBudgetBytes) {
    blockers.push("stored-byte-budget-exceeded");
  }
  if (candidate.measuredIncrementalMemoryBytes === null) {
    blockers.push("incremental-memory-unmeasured");
  } else if (
    !Number.isSafeInteger(candidate.measuredIncrementalMemoryBytes)
    || candidate.measuredIncrementalMemoryBytes < 1
    || candidate.measuredIncrementalMemoryBytes > narratorIncrementalMemoryBudgetBytes
  ) blockers.push("incremental-memory-budget-exceeded");
  return Object.freeze([...new Set(blockers)]);
}
