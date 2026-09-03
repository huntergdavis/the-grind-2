import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  createNarratorModelCandidateV2,
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelArtifactV1,
  type NarratorModelCandidateV2,
  type NarratorModelSessionV2,
} from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";

export const narratorT5RebuildMaximumRuntimeBytes = 100 * 1024 * 1024;
export const narratorT5RebuildToolchainLockSha256V1 = "7fb01a08b7c879eb5b4dcfca7c4883e02c8636273ee16bfc62ae761cb77ce7d0";

export interface NarratorRebuildFileV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorT5RebuildRunV1 {
  readonly runId: string;
  readonly ordinal: 1 | 2;
  readonly intermediateArtifacts: readonly NarratorRebuildFileV1[];
  readonly runtimeArtifacts: readonly NarratorModelArtifactV1[];
  readonly stdoutLog: NarratorRebuildFileV1;
  readonly stderrLog: NarratorRebuildFileV1;
}

export interface NarratorT5RebuildReceiptV1 {
  readonly schemaVersion: 1;
  readonly source: {
    readonly repository: "google/flan-t5-small";
    readonly revision: "0fc9ddf78a1e988dac52e2dac162b0ede4fd74ab";
    readonly spdxLicense: "Apache-2.0";
    readonly licenseEvidencePath: "README.md";
    readonly files: readonly NarratorRebuildFileV1[];
  };
  readonly toolchain: {
    readonly lockSha256: string;
    readonly containerImage: "python:3.11.11-slim-bookworm";
    readonly containerDigest: "sha256:081075da77b2b55c23c088251026fb69a7b2bf92471e491ff5fd75c192fd38e5";
    readonly architecture: "linux/amd64";
    readonly pythonVersion: "3.11.11";
    readonly harnessPath: "tools/narrator-t5-rebuild/rebuild.py";
    readonly harnessSha256: string;
    readonly converterRepository: "huggingface/optimum-onnx";
    readonly converterRevision: "d2328e386a81b0970a458a7570a38b131414edc6";
    readonly onnxRuntimeRepository: "microsoft/onnxruntime";
    readonly onnxRuntimeRevision: "8f0278c77bf44b0cc83c098c6c722b92a36ac4b5";
    readonly quantizerRepository: "huggingface/transformers.js";
    readonly quantizerRevision: "faf6c02a68927be59a7379fb84ac30bd2d169d47";
    readonly quantizerPath: "packages/transformers/scripts/quantize.py";
    readonly quantizerSha256: "d376b1ca38f40b839ef0976378770fed1e08c5f344b43bc2a59e21159ce56a71";
    readonly wheelCount: 34;
    readonly wheelBytes: 265199722;
  };
  readonly recipe: {
    readonly task: "text2text-generation-with-past";
    readonly framework: "pt";
    readonly device: "cpu";
    readonly opset: 18;
    readonly sourceDtype: "fp32";
    readonly exportDtype: "fp32";
    readonly optimization: "none";
    readonly absoluteTolerance: "1e-4";
    readonly monolith: false;
    readonly postProcess: true;
    readonly validation: true;
    readonly dynamicAxes: true;
    readonly constantFolding: true;
    readonly slim: false;
    readonly localFilesOnly: true;
    readonly trustRemoteCode: false;
    readonly quantizationMethod: "transformers-js-onnxquantizer-q8";
    readonly quantizationWeightType: "QInt8";
    readonly quantizationActivationType: "QUInt8";
    readonly quantizedOperators: "IntegerOpsRegistry";
    readonly perChannel: false;
    readonly reduceRange: false;
    readonly enableSubgraph: true;
    readonly matMulConstBOnly: true;
    readonly externalData: false;
  };
  readonly sessions: readonly NarratorModelSessionV2[];
  readonly runs: readonly [NarratorT5RebuildRunV1, NarratorT5RebuildRunV1];
  readonly totalRuntimeBytes: number;
  readonly reproducibility: "byte-identical-two-builds";
  readonly disposition: "immutable-rebuild-observed";
  readonly measuredIncrementalMemoryBytes: null;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;
const revisionPattern = /^[0-9a-f]{40}$/u;
const safePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;

export const narratorT5RebuildSourceV1 = Object.freeze({
  repository: "google/flan-t5-small" as const,
  revision: "0fc9ddf78a1e988dac52e2dac162b0ede4fd74ab" as const,
  spdxLicense: "Apache-2.0" as const,
  licenseEvidencePath: "README.md" as const,
  files: Object.freeze([
    Object.freeze({ path: "README.md", byteLength: 10820, sha256: "6cc6dc3d056aaeda9549dc685ca51600d600ab5b87c73c12e7165d8eff6b0c51" }),
    Object.freeze({ path: "config.json", byteLength: 1401, sha256: "439aa0fecf5a5546a1def68b1fc45e538e2c94528ce805378daf091e2bf6e4de" }),
    Object.freeze({ path: "generation_config.json", byteLength: 147, sha256: "f5a1c7e2be8092018d8835128987edf0111637dd98e90599cc80310fef75d95a" }),
    Object.freeze({ path: "model.safetensors", byteLength: 307867048, sha256: "495fa51e204676f1a857a9fc13c4c89f3f5ba9f480b898cebca02add25e6d749" }),
    Object.freeze({ path: "special_tokens_map.json", byteLength: 2201, sha256: "5c87151ef0f72a99d1f766a4c418bd2a1f90aaa30a8e22fe5eca9641daebb64f" }),
    Object.freeze({ path: "spiece.model", byteLength: 791656, sha256: "d60acb128cf7b7f2536e8f38a5b18a05535c9e14c7a355904270e15b0945ea86" }),
    Object.freeze({ path: "tokenizer.json", byteLength: 2424064, sha256: "fe2ebbbbde2985be723e0ce18217853e4020c5e9d35bd07be2c27ab9d3ead57a" }),
    Object.freeze({ path: "tokenizer_config.json", byteLength: 2539, sha256: "fcde0f79bffda3688119c94330866a8fbf8de20ae65a8c492c9bd47c704655a0" }),
  ]),
});

export const narratorT5RebuildToolchainV1 = Object.freeze({
  containerImage: "python:3.11.11-slim-bookworm" as const,
  containerDigest: "sha256:081075da77b2b55c23c088251026fb69a7b2bf92471e491ff5fd75c192fd38e5" as const,
  architecture: "linux/amd64" as const,
  pythonVersion: "3.11.11" as const,
  harnessPath: "tools/narrator-t5-rebuild/rebuild.py" as const,
  harnessSha256: "d32e908f9d70e57e05b9a11574b6550047c2b8c9c4b1954b735ba19b9def3c98",
  converterRepository: "huggingface/optimum-onnx" as const,
  converterRevision: "d2328e386a81b0970a458a7570a38b131414edc6" as const,
  onnxRuntimeRepository: "microsoft/onnxruntime" as const,
  onnxRuntimeRevision: "8f0278c77bf44b0cc83c098c6c722b92a36ac4b5" as const,
  quantizerRepository: "huggingface/transformers.js" as const,
  quantizerRevision: "faf6c02a68927be59a7379fb84ac30bd2d169d47" as const,
  quantizerPath: "packages/transformers/scripts/quantize.py" as const,
  quantizerSha256: "d376b1ca38f40b839ef0976378770fed1e08c5f344b43bc2a59e21159ce56a71" as const,
  wheelCount: 34 as const,
  wheelBytes: 265199722 as const,
});

export const narratorT5RebuildRecipeV1 = Object.freeze({
  task: "text2text-generation-with-past" as const,
  framework: "pt" as const,
  device: "cpu" as const,
  opset: 18 as const,
  sourceDtype: "fp32" as const,
  exportDtype: "fp32" as const,
  optimization: "none" as const,
  absoluteTolerance: "1e-4" as const,
  monolith: false as const,
  postProcess: true as const,
  validation: true as const,
  dynamicAxes: true as const,
  constantFolding: true as const,
  slim: false as const,
  localFilesOnly: true as const,
  trustRemoteCode: false as const,
  quantizationMethod: "transformers-js-onnxquantizer-q8" as const,
  quantizationWeightType: "QInt8" as const,
  quantizationActivationType: "QUInt8" as const,
  quantizedOperators: "IntegerOpsRegistry" as const,
  perChannel: false as const,
  reduceRange: false as const,
  enableSubgraph: true as const,
  matMulConstBOnly: true as const,
  externalData: false as const,
});

export const narratorT5RebuildSessionsV1: readonly NarratorModelSessionV2[] = Object.freeze([
  Object.freeze({
    runtimeSessionKey: "model" as const,
    fileStem: "encoder_model" as const,
    dtype: "q8" as const,
    artifactPath: "onnx/encoder_model_quantized.onnx",
  }),
  Object.freeze({
    runtimeSessionKey: "decoder_model_merged" as const,
    fileStem: "decoder_model_merged" as const,
    dtype: "q8" as const,
    artifactPath: "onnx/decoder_model_merged_quantized.onnx",
  }),
]);

const runtimeArtifactRoles = new Map<string, NarratorModelArtifactV1["role"]>([
  ["config.json", "configuration"],
  ["generation_config.json", "configuration"],
  ["tokenizer.json", "tokenizer"],
  ["tokenizer_config.json", "tokenizer"],
  ["onnx/encoder_model_quantized.onnx", "weights"],
  ["onnx/decoder_model_merged_quantized.onnx", "weights"],
]);
const intermediatePaths = [
  "raw/config.json",
  "raw/decoder_model.onnx",
  "raw/decoder_model_merged.onnx",
  "raw/decoder_with_past_model.onnx",
  "raw/encoder_model.onnx",
  "raw/generation_config.json",
  "raw/special_tokens_map.json",
  "raw/spiece.model",
  "raw/tokenizer.json",
  "raw/tokenizer_config.json",
];
const hashPattern = /^[0-9a-f]{16}$/u;

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function fileIsValid(value: unknown): value is NarratorRebuildFileV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && safePathPattern.test(value.path)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function artifactIsValid(value: unknown): value is NarratorModelArtifactV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && fileIsValid({ path: value.path, byteLength: value.byteLength, sha256: value.sha256 })
    && runtimeArtifactRoles.get(String(value.path)) === value.role;
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function runIsValid(value: unknown, ordinal: 1 | 2): value is NarratorT5RebuildRunV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, [
    "runId", "ordinal", "intermediateArtifacts", "runtimeArtifacts", "stdoutLog", "stderrLog",
  ])) return false;
  if (!isNarratorBoundedText(value.runId, 200) || value.ordinal !== ordinal
    || !Array.isArray(value.intermediateArtifacts)
    || !Array.isArray(value.runtimeArtifacts)
    || !fileIsValid(value.stdoutLog)
    || !fileIsValid(value.stderrLog)) return false;
  const intermediates = value.intermediateArtifacts;
  const artifacts = value.runtimeArtifacts;
  return intermediates.length === intermediatePaths.length
    && intermediates.every(fileIsValid)
    && exactCanonical(intermediates.map((file) => file.path), intermediatePaths)
    && artifacts.length === runtimeArtifactRoles.size
    && artifacts.every(artifactIsValid)
    && exactCanonical(artifacts.map((artifact) => artifact.path), [...runtimeArtifactRoles.keys()].sort())
    && value.stdoutLog.path === `logs/build-${ordinal}.stdout.log`
    && value.stderrLog.path === `logs/build-${ordinal}.stderr.log`;
}

function hashedContentIsValid(value: Record<string, unknown>): boolean {
  if (typeof value.contentHash !== "string" || !hashPattern.test(value.contentHash)) return false;
  const { contentHash, ...content } = value;
  try {
    return value.contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

export function isNarratorT5RebuildReceiptV1(value: unknown): value is NarratorT5RebuildReceiptV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, [
    "schemaVersion", "source", "toolchain", "recipe", "sessions", "runs", "totalRuntimeBytes",
    "reproducibility", "disposition", "measuredIncrementalMemoryBytes", "modelAdmitted",
    "displayAuthorized", "contentHash",
  ])) return false;
  if (value.schemaVersion !== 1
    || !isNarratorRecord(value.source)
    || !narratorHasExactKeys(value.source, ["repository", "revision", "spdxLicense", "licenseEvidencePath", "files"])
    || !exactCanonical(value.source, narratorT5RebuildSourceV1)
    || !isNarratorRecord(value.toolchain)
    || !narratorHasExactKeys(value.toolchain, [
      "lockSha256", "containerImage", "containerDigest", "architecture", "pythonVersion",
      "harnessPath", "harnessSha256",
      "converterRepository", "converterRevision", "onnxRuntimeRepository", "onnxRuntimeRevision",
      "quantizerRepository", "quantizerRevision", "quantizerPath", "quantizerSha256", "wheelCount", "wheelBytes",
    ])
    || value.toolchain.lockSha256 !== narratorT5RebuildToolchainLockSha256V1
    || !exactCanonical(
      Object.fromEntries(Object.entries(value.toolchain).filter(([key]) => key !== "lockSha256")),
      narratorT5RebuildToolchainV1,
    )
    || !exactCanonical(value.recipe, narratorT5RebuildRecipeV1)
    || !exactCanonical(value.sessions, narratorT5RebuildSessionsV1)
    || !Array.isArray(value.runs)
    || value.runs.length !== 2
    || !runIsValid(value.runs[0], 1)
    || !runIsValid(value.runs[1], 2)
    || value.runs[0].runId === value.runs[1].runId
    || value.reproducibility !== "byte-identical-two-builds"
    || value.disposition !== "immutable-rebuild-observed"
    || value.measuredIncrementalMemoryBytes !== null
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !Number.isSafeInteger(value.totalRuntimeBytes)
    || Number(value.totalRuntimeBytes) < 1
    || Number(value.totalRuntimeBytes) > narratorT5RebuildMaximumRuntimeBytes
    || !hashedContentIsValid(value)) return false;
  const [first, second] = value.runs;
  const total = first.runtimeArtifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0);
  return total === value.totalRuntimeBytes
    && exactCanonical(first.intermediateArtifacts, second.intermediateArtifacts)
    && exactCanonical(first.runtimeArtifacts, second.runtimeArtifacts);
}

export function createNarratorT5RebuildReceiptV1(
  fields: Omit<NarratorT5RebuildReceiptV1, "schemaVersion" | "contentHash">,
): NarratorT5RebuildReceiptV1 {
  const content = { schemaVersion: 1 as const, ...fields };
  const receipt = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorT5RebuildReceiptV1(receipt)) {
    throw new TypeError("Narrator T5 rebuild receipt is invalid");
  }
  return receipt;
}

export function createNarratorT5CandidateFromRebuildReceiptV1(
  receipt: NarratorT5RebuildReceiptV1,
  artifactRepository: string,
  artifactRevision: string,
): NarratorModelCandidateV2 {
  if (!isNarratorT5RebuildReceiptV1(receipt)) throw new TypeError("Narrator T5 rebuild receipt is invalid");
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(artifactRepository)
    || !revisionPattern.test(artifactRevision)) {
    throw new TypeError("Narrator T5 artifact publication identity is invalid");
  }
  return createNarratorModelCandidateV2({
    candidateId: `flan-t5-small-q8@${artifactRevision.slice(0, 8)}`,
    task: "single-ambient-line",
    modelFamily: "t5",
    sessions: receipt.sessions,
    model: {
      repository: artifactRepository,
      revision: artifactRevision,
      sourceRepository: receipt.source.repository,
      sourceRevision: receipt.source.revision,
      license: null,
      licenseStatus: "unverified",
    },
    runtime: { ...tinyStoriesInstruct33MInt8Candidate.runtime },
    execution: "wasm",
    artifacts: receipt.runs[0].runtimeArtifacts,
    measuredIncrementalMemoryBytes: null,
  });
}
