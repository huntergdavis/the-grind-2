#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
} from "node:fs/promises";
import { promisify } from "node:util";
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  canonicalHash,
  canonicalStringify,
  loadProductionContracts,
  modelTreeHash,
  parseJsonStrict,
  validateHeldoutEvaluation,
} from "../narrator-story-beat-training/validate-evaluation.mjs";
import {
  canonicalStringify as canonicalBrowserStringify,
  diagnoseStoryBeatCandidate,
  parseSealedStoryBeatHoldout,
  parseStoryBeatPrompt,
  storyBeatBrowserEvaluationExpectedHoldoutCorpusHash,
  storyBeatBrowserEvaluationExpectedHoldoutSha256,
  storyBeatBrowserEvaluationFullCaseCount,
  storyBeatBrowserEvaluationModelPaths,
  storyBeatBrowserEvaluationSourcePaths,
  verifyStoryBeatBrowserEvaluationReceipt,
} from "../narrator-story-beat-browser-evaluation/run-support.mjs";
import {
  assertCommittedSourceSnapshot,
  evidenceForCommit,
} from "../narrator-browser-evaluation/run-support.mjs";

export const publicationSchemaVersion = 1;
export const qualityReceiptFile = "story-beat-tuned-q8-quality-receipt.json";
export const stagingPlanFile = "story-beat-tuned-q8-artifact-staging-plan.json";
export const artifactRepository = "huntergdavis/the-grind-2-narrator-flan-t5-small";
export const producerRepository = "huntergdavis/the-grind-2";
export const maximumRuntimeBytes = 100 * 1024 * 1024;

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "../..");
const ignoredWorkspaceRoot = resolve(repositoryRoot, ".narrator-t5-rebuild");
const sha256Pattern = /^[0-9a-f]{64}$/u;
const hash16Pattern = /^[0-9a-f]{16}$/u;
const safeRelativePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

const neutralWords = new Set([
  "a", "an", "and", "as", "at", "before", "behind", "beneath", "beside",
  "between", "beyond", "but", "by", "during", "each", "every", "for", "from",
  "has", "have", "here", "in", "inside", "into", "is", "it", "its", "near",
  "no", "not", "now", "of", "on", "only", "or", "out", "outside", "over",
  "past", "so", "still", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "toward",
  "under", "was", "were", "where", "which", "while", "who", "with", "within",
  "without",
]);

export const publicationSourcePaths = Object.freeze([
  "src/core/canonical.ts",
  "src/narrator/story-beat-corpus.test.ts",
  "src/narrator/story-beat-corpus.ts",
  "src/narrator/story-beat-form-eligibility.test.ts",
  "src/narrator/story-beat-form-eligibility.ts",
  "src/narrator/story-beat-form-selection.test.ts",
  "src/narrator/story-beat-form-selection.ts",
  "src/narrator/story-beat-training-corpus.test.ts",
  "src/narrator/story-beat-training-corpus.ts",
  "src/narrator/story-beat-transformers-adapter.test.ts",
  "src/narrator/story-beat-transformers-adapter.ts",
  "src/narrator/story-beat.test.ts",
  "src/narrator/story-beat.ts",
  "src/ui/story-beat-controller.test.ts",
  "src/ui/story-beat-controller.ts",
  "src/ui/story-beat-echo.test.ts",
  "src/ui/story-beat-echo.ts",
  "tools/narrator-story-beat-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-publication/README.md",
  "tools/narrator-story-beat-publication/publication.test.mjs",
  "tools/narrator-story-beat-publication/publication.mjs",
  "tools/narrator-story-beat-rebuild/README.md",
  "tools/narrator-story-beat-rebuild/rebuild.py",
  "tools/narrator-story-beat-rebuild/rebuild_test.py",
  "tools/narrator-story-beat-training/README.md",
  "tools/narrator-story-beat-training/evaluate.py",
  "tools/narrator-story-beat-training/evaluate_test.py",
  "tools/narrator-story-beat-training/export-corpus.mjs",
  "tools/narrator-story-beat-training/export-corpus.test.mjs",
  "tools/narrator-story-beat-training/train.py",
  "tools/narrator-story-beat-training/train_test.py",
  "tools/narrator-story-beat-training/validate-evaluation.test.mjs",
  "tools/narrator-story-beat-training/validate-evaluation.mjs",
]);

export const browserEvaluationSourcePaths = storyBeatBrowserEvaluationSourcePaths;

export const storyBeatTunedPublicationPolicyV1 = deepFreeze({
  schemaVersion: 1,
  policyId: "story-beat-tuned-publication-v1",
  fp32Full: {
    caseCount: 200,
    minimumFirstPassValidCount: 198,
    maximumUnknownWordOutputCount: 0,
    maximumUnknownCapitalizedWordOutputCount: 0,
    maximumUnknownNumericClaimOutputCount: 0,
    maximumPromptEchoOutputCount: 0,
    maximumFallbackCopyCount: 0,
    maximumExactSourceFieldCopyCount: 0,
  },
  q8Preview: {
    caseCount: 18,
    minimumValidCount: 18,
    maximumFallbackRequiredCaseCount: 0,
    maximumUnknownLexemeCaseCount: 0,
    maximumPromptScaffoldEchoCaseCount: 0,
    maximumSourceFieldExactEchoCaseCount: 0,
    minimumDelexicalizedShapeCount: 8,
    maximumShapeFrequency: 4,
  },
  q8Full: {
    caseCount: 200,
    minimumValidCount: 198,
    maximumFallbackRequiredCaseCount: 0,
    maximumUnknownLexemeCaseCount: 0,
    maximumPromptScaffoldEchoCaseCount: 0,
    maximumSourceFieldExactEchoCaseCount: 0,
    minimumUniqueValidOutputCount: 190,
    maximumRawDuplicateCount: 2,
    minimumDelexicalizedShapeCount: 8,
    maximumShapeFrequency: 50,
  },
  hostileBoundary: {
    caseCount: 18,
    minimumRejectedCount: 18,
  },
  referenceTargetMatches: "measured-not-a-quality-failure",
});

const policyHash = canonicalHash(storyBeatTunedPublicationPolicyV1);

const lockKeys = Object.freeze([
  "base", "checkpoint", "contentSha256", "displayAuthorized", "disposition",
  "kind", "modelAdmitted", "rebuild", "schemaVersion", "training",
]);
const pairReceiptKeys = Object.freeze([
  "base", "checkpoint", "derivedLock", "displayAuthorized", "disposition", "kind",
  "modelAdmitted", "processIsolation", "rebuild", "receiptSha256", "reproducibility",
  "runs", "schemaVersion", "totalRuntimeBytes", "training",
]);
const fileKeys = Object.freeze(["byteLength", "path", "sha256"]);
const runtimeFileKeys = Object.freeze(["byteLength", "path", "role", "sha256"]);
const recipeKeys = Object.freeze([
  "absoluteTolerance", "constantFolding", "device", "dynamicAxes", "enableSubgraph",
  "exportDtype", "externalData", "framework", "localFilesOnly", "matMulConstBOnly",
  "monolith", "opset", "optimization", "perChannel", "postProcess",
  "quantizationActivationType", "quantizationMethod", "quantizationWeightType",
  "quantizedOperators", "reduceRange", "slim", "sourceDtype", "task",
  "trustRemoteCode", "validation",
]);

const expectedToolchainRepositories = deepFreeze({
  converterRepository: "huggingface/optimum-onnx",
  converterRevision: "d2328e386a81b0970a458a7570a38b131414edc6",
  onnxRuntimeRepository: "microsoft/onnxruntime",
  onnxRuntimeRevision: "8f0278c77bf44b0cc83c098c6c722b92a36ac4b5",
  quantizerPath: "packages/transformers/scripts/quantize.py",
  quantizerRepository: "huggingface/transformers.js",
  quantizerRevision: "faf6c02a68927be59a7379fb84ac30bd2d169d47",
  quantizerSha256: "d376b1ca38f40b839ef0976378770fed1e08c5f344b43bc2a59e21159ce56a71",
});

const expectedRebuildRecipe = deepFreeze({
  absoluteTolerance: "1e-4",
  constantFolding: true,
  device: "cpu",
  dynamicAxes: true,
  enableSubgraph: true,
  exportDtype: "fp32",
  externalData: false,
  framework: "pt",
  localFilesOnly: true,
  matMulConstBOnly: true,
  monolith: false,
  opset: 18,
  optimization: "none",
  perChannel: false,
  postProcess: true,
  quantizationActivationType: "QUInt8",
  quantizationMethod: "transformers-js-onnxquantizer-q8",
  quantizationWeightType: "QInt8",
  quantizedOperators: "IntegerOpsRegistry",
  reduceRange: false,
  slim: false,
  sourceDtype: "fp32",
  task: "text2text-generation-with-past",
  trustRemoteCode: false,
  validation: true,
});

const expectedRebuildSessions = deepFreeze([
  {
    artifactPath: "onnx/encoder_model_quantized.onnx",
    dtype: "q8",
    fileStem: "encoder_model",
    runtimeSessionKey: "model",
  },
  {
    artifactPath: "onnx/decoder_model_merged_quantized.onnx",
    dtype: "q8",
    fileStem: "decoder_model_merged",
    runtimeSessionKey: "decoder_model_merged",
  },
]);

const expectedRebuildRuntimeFiles = deepFreeze([
  { path: "config.json", role: "configuration" },
  { path: "generation_config.json", role: "configuration" },
  { path: "onnx/decoder_model_merged_quantized.onnx", role: "weights" },
  { path: "onnx/encoder_model_quantized.onnx", role: "weights" },
  { path: "tokenizer.json", role: "tokenizer" },
  { path: "tokenizer_config.json", role: "tokenizer" },
]);

function fail(message) {
  throw new TypeError(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function requireExactKeys(value, expected, label) {
  if (!hasExactKeys(value, expected)) fail(`${label} keys differ`);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer`);
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer`);
  return value;
}

function requireHash(value, label, pattern = sha256Pattern) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${label} is invalid`);
  return value;
}

function requireSafeRelativePath(value, label) {
  if (typeof value !== "string" || !safeRelativePathPattern.test(value)) {
    fail(`${label} is not a safe relative path`);
  }
  return value;
}

export function stableJsonStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Stable JSON numbers must be finite");
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail("Stable JSON number is invalid");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
  }
  fail(`Unsupported stable JSON value: ${typeof value}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Stable(value) {
  return sha256(Buffer.from(stableJsonStringify(value)));
}

function exactCanonical(left, right) {
  return canonicalBrowserStringify(left) === canonicalBrowserStringify(right);
}

function seal(value) {
  if (!isRecord(value) || Object.hasOwn(value, "contentHash")) fail("Cannot seal malformed evidence");
  return deepFreeze({ ...value, contentHash: canonicalHash(value) });
}

function validateFileEntry(value, label, withRole = false) {
  requireExactKeys(value, withRole ? runtimeFileKeys : fileKeys, label);
  requireSafeRelativePath(value.path, `${label}.path`);
  nonnegativeInteger(value.byteLength, `${label}.byteLength`);
  requireHash(value.sha256, `${label}.sha256`);
  if (withRole && (typeof value.role !== "string" || value.role.length === 0 || value.role.length > 80)) {
    fail(`${label}.role is invalid`);
  }
  return value;
}

function validateManifest(value, label, { withRole = false, nonempty = true } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(`${label} is invalid`);
  const paths = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) fail(`${label} is sparse`);
    validateFileEntry(value[index], `${label}[${index}]`, withRole);
    paths.push(value[index].path);
  }
  const sorted = [...paths].sort();
  if (!exactCanonical(paths, sorted) || new Set(paths).size !== paths.length) {
    fail(`${label} paths must be sorted and unique`);
  }
  return value;
}

export function completeCheckpointManifest(trainingFiles, trainingReceipt) {
  validateManifest(trainingFiles, "training checkpoint files");
  if (!isRecord(trainingReceipt)) fail("training receipt evidence is invalid");
  const complete = [
    ...trainingFiles.map((entry) => ({ ...entry })),
    {
      path: "training-receipt.json",
      byteLength: nonnegativeInteger(
        trainingReceipt.byteLength,
        "training receipt evidence.byteLength",
      ),
      sha256: requireHash(trainingReceipt.sha256, "training receipt evidence.sha256"),
    },
  ].sort((left, right) => compareText(left.path, right.path));
  validateManifest(complete, "complete checkpoint files");
  return deepFreeze(complete);
}

function validateBaseEvidence(value) {
  requireExactKeys(value, ["harness", "lock", "platform", "source", "toolchainRepositories", "wheelhouse"], "derived base");
  requireExactKeys(value.lock, ["byteLength", "path", "sha256"], "derived base lock");
  if (value.lock.path !== "tools/narrator-t5-rebuild/toolchain.lock.json"
    || value.lock.byteLength !== 10_282
    || value.lock.sha256 !== "f66c37332647f9ca940ee5295e8d2ecff7d1247b32bed16e2a45b362d0df78f2") {
    fail("derived base lock identity differs");
  }
  requireExactKeys(value.harness, ["harnessPath", "harnessSha256"], "derived base harness");
  if (value.harness.harnessPath !== "tools/narrator-t5-rebuild/rebuild.py"
    || value.harness.harnessSha256 !== "f3415303be353746b0f67ca5ea6263a55491fd0cd6cf50d4344851b9f9d5dd71") {
    fail("derived historical harness identity differs");
  }
  requireExactKeys(value.source, ["fileCount", "licenseEvidencePath", "manifestSha256", "repository", "revision", "spdxLicense"], "derived base source");
  if (value.source.repository !== "google/flan-t5-small"
    || value.source.revision !== "0fc9ddf78a1e988dac52e2dac162b0ede4fd74ab"
    || value.source.spdxLicense !== "Apache-2.0"
    || value.source.licenseEvidencePath !== "README.md"
    || value.source.fileCount !== 8
    || value.source.manifestSha256 !== "b0be7b935d129f9b38863015c2c18375b398d7f4f994609214684fce74aa86f4") {
    fail("derived base source identity differs");
  }
  requireExactKeys(value.wheelhouse, ["fileCount", "manifestSha256", "totalBytes"], "derived wheelhouse");
  if (value.wheelhouse.fileCount !== 34
    || value.wheelhouse.totalBytes !== 265_199_722
    || value.wheelhouse.manifestSha256 !== "509c8fbc50232c1d8393a44cd1b29804c97d2abe3e83b905164b3778866077c8") {
    fail("derived wheelhouse identity differs");
  }
  requireExactKeys(value.platform, ["architecture", "containerDigest", "containerImage", "pythonHashSeed", "pythonVersion"], "derived platform");
  if (value.platform.architecture !== "linux/amd64"
    || value.platform.containerImage !== "python:3.11.11-slim-bookworm"
    || value.platform.containerDigest !== "sha256:081075da77b2b55c23c088251026fb69a7b2bf92471e491ff5fd75c192fd38e5"
    || value.platform.pythonVersion !== "3.11.11"
    || value.platform.pythonHashSeed !== "0") fail("derived platform differs");
  requireExactKeys(value.toolchainRepositories, [
    "converterRepository", "converterRevision", "onnxRuntimeRepository", "onnxRuntimeRevision",
    "quantizerPath", "quantizerRepository", "quantizerRevision", "quantizerSha256",
  ], "derived toolchain repositories");
  if (!exactCanonical(value.toolchainRepositories, expectedToolchainRepositories)) {
    fail("derived toolchain repositories differ");
  }
}

function validateTrainingBinding(value, context) {
  requireExactKeys(value, ["corpus", "receipt", "receiptValidatorObservedAtDerivation", "rows"], "derived training");
  requireExactKeys(value.receiptValidatorObservedAtDerivation, ["path", "sha256", "trustBoundary"], "training validator evidence");
  if (value.receiptValidatorObservedAtDerivation.path !== "tools/narrator-story-beat-training/train.py"
    || value.receiptValidatorObservedAtDerivation.sha256 !== context.sourceByPath.get("tools/narrator-story-beat-training/train.py")?.sha256
    || value.receiptValidatorObservedAtDerivation.trustBoundary !== "executed-local-code-observed-at-derivation-not-training-launch-evidence") {
    fail("training validator binding differs");
  }
  requireExactKeys(value.receipt, ["byteLength", "path", "receiptSha256", "sha256"], "training receipt binding");
  if (value.receipt.path !== "training-receipt.json"
    || value.receipt.byteLength !== context.trainingReceipt.byteLength
    || value.receipt.sha256 !== context.trainingReceipt.sha256
    || value.receipt.receiptSha256 !== context.trainingSummary.receiptSha256) {
    fail("training receipt binding differs");
  }
  requireExactKeys(value.corpus, ["corpusHash", "fileSha256", "schemaVersion"], "training corpus binding");
  if (!exactCanonical(value.corpus, context.trainingSummary.corpus)) fail("training corpus binding differs");
  requireExactKeys(value.rows, ["dev", "total", "train"], "training row binding");
  if (!exactCanonical(value.rows, context.trainingSummary.rows)) fail("training row binding differs");
}

function validateRebuildBinding(value, sourceByPath) {
  requireExactKeys(value, ["harness", "importedHistoricalFunctions", "recipe", "runtimeFiles", "sessions"], "derived rebuild");
  requireExactKeys(value.harness, ["path", "sha256"], "derived rebuild harness");
  if (value.harness.path !== "tools/narrator-story-beat-rebuild/rebuild.py"
    || value.harness.sha256 !== sourceByPath.get(value.harness.path)?.sha256) {
    fail("derived rebuild harness binding differs");
  }
  if (!exactCanonical(value.importedHistoricalFunctions, ["build_once", "observed_run"])) {
    fail("derived imported function list differs");
  }
  requireExactKeys(value.recipe, recipeKeys, "derived rebuild recipe");
  if (!exactCanonical(value.recipe, expectedRebuildRecipe)) fail("derived rebuild recipe differs");
  if (!Array.isArray(value.runtimeFiles) || value.runtimeFiles.length !== 6) fail("derived runtime file closure differs");
  const runtimePaths = [];
  for (const [index, file] of value.runtimeFiles.entries()) {
    requireExactKeys(file, ["path", "role"], `derived runtimeFiles[${index}]`);
    requireSafeRelativePath(file.path, `derived runtimeFiles[${index}].path`);
    if (typeof file.role !== "string" || file.role.length === 0) fail("derived runtime role is invalid");
    runtimePaths.push(file.path);
  }
  if (!exactCanonical(value.runtimeFiles, expectedRebuildRuntimeFiles)
    || !exactCanonical(runtimePaths, storyBeatBrowserEvaluationModelPaths)) fail("derived runtime paths differ");
  if (!Array.isArray(value.sessions) || value.sessions.length !== 2) fail("derived runtime sessions differ");
  for (const [index, session] of value.sessions.entries()) {
    requireExactKeys(session, ["artifactPath", "dtype", "fileStem", "runtimeSessionKey"], `derived sessions[${index}]`);
    requireSafeRelativePath(session.artifactPath, `derived sessions[${index}].artifactPath`);
    if (session.dtype !== "q8") fail("derived session dtype differs");
  }
  if (!exactCanonical(value.sessions, expectedRebuildSessions)) fail("derived sessions differ");
}

export function validateDerivedEvidence({
  derivedLock,
  derivedLockBytes,
  rebuildReceipt,
  rebuildReceiptBytes,
  checkpointFiles,
  stagedFiles,
  trainingReceipt,
  trainingSummary,
  sourceFiles,
}) {
  const sourceByPath = new Map(sourceFiles.map((entry) => [entry.path, entry]));
  requireExactKeys(derivedLock, lockKeys, "derived lock");
  if (derivedLock.schemaVersion !== 1
    || derivedLock.kind !== "story-beat-derived-q8-rebuild-lock"
    || derivedLock.disposition !== "developer-derived-artifact-not-runtime-admitted"
    || derivedLock.modelAdmitted !== false || derivedLock.displayAuthorized !== false) {
    fail("derived lock authority or identity differs");
  }
  requireHash(derivedLock.contentSha256, "derived lock contentSha256");
  const lockPayload = Object.fromEntries(Object.entries(derivedLock).filter(([key]) => key !== "contentSha256"));
  if (derivedLock.contentSha256 !== sha256Stable(lockPayload)) fail("derived lock content hash differs");
  validateBaseEvidence(derivedLock.base);
  validateTrainingBinding(derivedLock.training, {
    sourceByPath,
    trainingReceipt,
    trainingSummary,
  });
  requireExactKeys(derivedLock.checkpoint, ["files", "treeSha256"], "derived checkpoint");
  validateManifest(derivedLock.checkpoint.files, "derived checkpoint files");
  if (!exactCanonical(derivedLock.checkpoint.files, checkpointFiles)
    || derivedLock.checkpoint.treeSha256 !== sha256Stable(checkpointFiles)) {
    fail("derived checkpoint closure differs");
  }
  validateRebuildBinding(derivedLock.rebuild, sourceByPath);

  requireExactKeys(rebuildReceipt, pairReceiptKeys, "rebuild receipt");
  if (rebuildReceipt.schemaVersion !== 1
    || rebuildReceipt.kind !== "story-beat-derived-q8-rebuild-receipt"
    || rebuildReceipt.disposition !== "derived-checkpoint-rebuild-observed-not-runtime-admitted"
    || rebuildReceipt.modelAdmitted !== false || rebuildReceipt.displayAuthorized !== false
    || rebuildReceipt.processIsolation !== "fresh-python-process-per-build"
    || rebuildReceipt.reproducibility !== "byte-identical-isolated-processes") {
    fail("rebuild receipt identity, authority, or isolation differs");
  }
  requireHash(rebuildReceipt.receiptSha256, "rebuild receipt hash");
  const receiptPayload = Object.fromEntries(Object.entries(rebuildReceipt).filter(([key]) => key !== "receiptSha256"));
  if (rebuildReceipt.receiptSha256 !== sha256Stable(receiptPayload)) fail("rebuild receipt hash differs");
  requireExactKeys(rebuildReceipt.derivedLock, ["contentSha256", "fileSha256"], "rebuild derived lock binding");
  if (rebuildReceipt.derivedLock.contentSha256 !== derivedLock.contentSha256
    || rebuildReceipt.derivedLock.fileSha256 !== sha256(derivedLockBytes)) {
    fail("rebuild receipt derived lock binding differs");
  }
  for (const field of ["base", "training", "checkpoint", "rebuild"]) {
    if (!exactCanonical(rebuildReceipt[field], derivedLock[field])) fail(`rebuild receipt ${field} binding differs`);
  }
  if (!Array.isArray(rebuildReceipt.runs) || rebuildReceipt.runs.length !== 2) fail("rebuild receipt runs differ");
  const expectedIntermediatePaths = [
    "raw/config.json", "raw/decoder_model.onnx", "raw/decoder_model_merged.onnx",
    "raw/decoder_with_past_model.onnx", "raw/encoder_model.onnx",
    "raw/generation_config.json", "raw/special_tokens_map.json", "raw/spiece.model",
    "raw/tokenizer.json", "raw/tokenizer_config.json",
  ];
  for (let index = 0; index < 2; index += 1) {
    const run = rebuildReceipt.runs[index];
    requireExactKeys(run, ["intermediateArtifacts", "ordinal", "processEvidence", "runId", "runtimeArtifacts", "stderrLog", "stdoutLog"], `rebuild runs[${index}]`);
    if (run.ordinal !== index + 1 || typeof run.runId !== "string" || run.runId.length === 0 || run.runId.length > 200) {
      fail(`rebuild runs[${index}] identity differs`);
    }
    requireExactKeys(run.processEvidence, ["ordinal", "pythonHashSeed", "pythonProcessId", "runId", "schemaVersion"], `rebuild runs[${index}].processEvidence`);
    if (run.processEvidence.schemaVersion !== 1 || run.processEvidence.ordinal !== run.ordinal
      || run.processEvidence.runId !== run.runId || run.processEvidence.pythonHashSeed !== "0") {
      fail(`rebuild runs[${index}] process evidence differs`);
    }
    positiveInteger(run.processEvidence.pythonProcessId, `rebuild runs[${index}] pythonProcessId`);
    validateManifest(run.intermediateArtifacts, `rebuild runs[${index}] intermediates`);
    if (!exactCanonical(run.intermediateArtifacts.map((entry) => entry.path), expectedIntermediatePaths)) {
      fail(`rebuild runs[${index}] intermediate paths differ`);
    }
    validateManifest(run.runtimeArtifacts, `rebuild runs[${index}] runtime artifacts`, { withRole: true });
    if (!exactCanonical(run.runtimeArtifacts.map(({ path, role }) => ({ path, role })), expectedRebuildRuntimeFiles)) {
      fail(`rebuild runs[${index}] runtime roles differ`);
    }
    validateFileEntry(run.stdoutLog, `rebuild runs[${index}].stdoutLog`);
    validateFileEntry(run.stderrLog, `rebuild runs[${index}].stderrLog`);
    if (run.stdoutLog.path !== `logs/build-${index + 1}.stdout.log`
      || run.stderrLog.path !== `logs/build-${index + 1}.stderr.log`) fail("rebuild log paths differ");
  }
  if (rebuildReceipt.runs[0].runId === rebuildReceipt.runs[1].runId
    || rebuildReceipt.runs[0].processEvidence.pythonProcessId === rebuildReceipt.runs[1].processEvidence.pythonProcessId) {
    fail("rebuild runs are not isolated");
  }
  if (!exactCanonical(rebuildReceipt.runs[0].intermediateArtifacts, rebuildReceipt.runs[1].intermediateArtifacts)
    || !exactCanonical(rebuildReceipt.runs[0].runtimeArtifacts, rebuildReceipt.runs[1].runtimeArtifacts)) {
    fail("rebuild pair artifacts differ");
  }
  const stagedProjection = rebuildReceipt.runs[0].runtimeArtifacts.map(({ path, byteLength, sha256: digest }) => ({
    path,
    byteLength,
    sha256: digest,
  }));
  if (!exactCanonical(stagedProjection, stagedFiles)) fail("staged q8 closure differs from rebuild receipt");
  const runtimeTotal = stagedFiles.reduce((total, entry) => total + entry.byteLength, 0);
  if (!Number.isSafeInteger(runtimeTotal) || runtimeTotal <= 0 || runtimeTotal > maximumRuntimeBytes
    || rebuildReceipt.totalRuntimeBytes !== runtimeTotal) fail("rebuild runtime byte total differs");
  return deepFreeze({
    lockFileSha256: sha256(derivedLockBytes),
    lockContentSha256: derivedLock.contentSha256,
    rebuildReceiptFileSha256: sha256(rebuildReceiptBytes),
    rebuildReceiptSha256: rebuildReceipt.receiptSha256,
    checkpointTreeSha256: derivedLock.checkpoint.treeSha256,
    baseLockSha256: derivedLock.base.lock.sha256,
    rebuildHarnessSha256: derivedLock.rebuild.harness.sha256,
    totalRuntimeBytes: runtimeTotal,
    processIsolation: rebuildReceipt.processIsolation,
    reproducibility: rebuildReceipt.reproducibility,
    runtimeArtifacts: deepFreeze(rebuildReceipt.runs[0].runtimeArtifacts.map((entry) => ({ ...entry }))),
  });
}

function lexicalWords(value) {
  return [...value.matchAll(wordPattern)].map((match) => ({
    raw: match[0],
    lower: match[0].toLocaleLowerCase("en-US"),
  }));
}

export function delexicalizedStoryBeatShape(output, facts) {
  if (typeof output !== "string" || !isRecord(facts)) fail("shape inputs are invalid");
  const location = new Set(lexicalWords(facts.location).map((token) => token.lower));
  const headline = new Set(lexicalWords(facts.headline).map((token) => token.lower));
  const action = new Set(lexicalWords(facts.action).map((token) => token.lower));
  const consequence = new Set(lexicalWords(facts.consequence).map((token) => token.lower));
  return output.toLocaleLowerCase("en-US").replace(wordPattern, (token) => {
    const lower = token.toLocaleLowerCase("en-US");
    if (/^\p{N}+$/u.test(lower)) return "<number>";
    if (location.has(lower) && !neutralWords.has(lower)) return "<place>";
    if (action.has(lower) && !neutralWords.has(lower)) return "<action>";
    if (headline.has(lower) && !neutralWords.has(lower)) return "<headline>";
    if (consequence.has(lower) && !neutralWords.has(lower)) return "<consequence>";
    if (neutralWords.has(lower)) return lower;
    return "<unknown>";
  }).replace(/(?:<place>[\s\-]*){2,}/gu, "<place> ")
    .replace(/(?:<action>[\s\-]*){2,}/gu, "<action> ")
    .replace(/(?:<headline>[\s\-]*){2,}/gu, "<headline> ")
    .replace(/(?:<consequence>[\s\-]*){2,}/gu, "<consequence> ")
    .replace(/\s+/gu, " ")
    .trim();
}

function permyriad(numerator, denominator) {
  return denominator === 0 ? 0 : Math.floor((numerator * 10_000) / denominator);
}

function exactBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
  return value;
}

export function recomputeQ8Evidence({ receipt, holdout, validateStoryBeatResult }) {
  if (!verifyStoryBeatBrowserEvaluationReceipt(receipt)) fail("q8 browser receipt is invalid");
  if (!isRecord(holdout) || !Array.isArray(holdout.cases)
    || holdout.cases.length !== storyBeatBrowserEvaluationFullCaseCount) fail("q8 holdout is invalid");
  if (typeof validateStoryBeatResult !== "function") fail("production story-beat validator is unavailable");
  const rawCounts = new Map();
  const validOutputs = new Set();
  const shapeCounts = new Map();
  let validCaseCount = 0;
  let fallbackRequiredCaseCount = 0;
  let unknownLexemeCaseCount = 0;
  let promptScaffoldEchoCaseCount = 0;
  let sourceFieldExactEchoCaseCount = 0;
  let targetExactMatchCaseCount = 0;
  for (let ordinal = 0; ordinal < receipt.cases.length; ordinal += 1) {
    const entry = receipt.cases[ordinal];
    const sourceIndex = receipt.selection.indexes[ordinal];
    const row = holdout.cases[sourceIndex];
    if (row === undefined || entry.id !== row.id || entry.caseHash !== row.caseHash
      || entry.promptHash !== canonicalHash(row.prompt)
      || entry.targetHash !== canonicalHash(row.target)) fail(`q8 case ${ordinal} holdout binding differs`);
    const facts = parseStoryBeatPrompt(row.prompt);
    const diagnostic = diagnoseStoryBeatCandidate(row, entry.candidate);
    const fallbackHash = canonicalHash(diagnostic.deterministicFallback);
    const admitted = validateStoryBeatResult(entry.candidate, facts) === entry.candidate;
    const sourceFieldOrFallbackEcho = diagnostic.sourceFieldExactEcho
      || entry.candidate === diagnostic.deterministicFallback;
    if (entry.deterministicFallbackHash !== fallbackHash
      || entry.valid !== admitted
      || entry.fallbackRequired !== !admitted
      || !exactCanonical(entry.unknownLexemes, diagnostic.unknownLexemes)
      || entry.promptScaffoldEcho !== diagnostic.promptScaffoldEcho
      || entry.sourceFieldExactEcho !== sourceFieldOrFallbackEcho
      || entry.targetExactMatch !== diagnostic.targetExactMatch) {
      fail(`q8 case ${ordinal} production diagnostic differs`);
    }
    rawCounts.set(entry.candidate, (rawCounts.get(entry.candidate) ?? 0) + 1);
    if (admitted) {
      validCaseCount += 1;
      validOutputs.add(entry.candidate);
    } else fallbackRequiredCaseCount += 1;
    if (diagnostic.unknownLexemes.length > 0) unknownLexemeCaseCount += 1;
    if (diagnostic.promptScaffoldEcho) promptScaffoldEchoCaseCount += 1;
    if (sourceFieldOrFallbackEcho) sourceFieldExactEchoCaseCount += 1;
    if (diagnostic.targetExactMatch) targetExactMatchCaseCount += 1;
    const shape = delexicalizedStoryBeatShape(entry.candidate, facts);
    shapeCounts.set(shape, (shapeCounts.get(shape) ?? 0) + 1);
  }
  const metrics = deepFreeze({
    caseCount: receipt.cases.length,
    validCaseCount,
    invalidCaseCount: receipt.cases.length - validCaseCount,
    validityRatePermyriad: permyriad(validCaseCount, receipt.cases.length),
    fallbackRequiredCaseCount,
    fallbackRequiredRatePermyriad: permyriad(fallbackRequiredCaseCount, receipt.cases.length),
    unknownLexemeCaseCount,
    promptScaffoldEchoCaseCount,
    sourceFieldExactEchoCaseCount,
    targetExactMatchCaseCount,
    uniqueRawOutputCount: rawCounts.size,
    uniqueRawOutputRatePermyriad: permyriad(rawCounts.size, receipt.cases.length),
    uniqueValidOutputCount: validOutputs.size,
    uniqueValidOutputRatePermyriad: permyriad(validOutputs.size, validCaseCount),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
    delexicalizedShapeCount: shapeCounts.size,
    maximumShapeFrequency: Math.max(...shapeCounts.values()),
  });
  const browserMetrics = Object.fromEntries(Object.keys(receipt.metrics).map((key) => {
    if (!Object.hasOwn(metrics, key)) fail(`q8 browser metric ${key} is unknown to the sanitizer`);
    return [key, metrics[key]];
  }));
  if (!exactCanonical(browserMetrics, receipt.metrics)) fail("q8 recomputed browser metrics differ");
  for (const field of ["delexicalizedShapeCount", "maximumShapeFrequency"]) {
    if (Object.hasOwn(receipt.metrics, field) && receipt.metrics[field] !== metrics[field]) {
      fail(`q8 browser ${field} differs from recomputation`);
    }
  }
  return deepFreeze({
    receiptContentHash: receipt.contentHash,
    outputHash: receipt.outputHash,
    selectionHash: receipt.selection.caseSetHash,
    modelAggregateSha256: receipt.model.aggregateSha256,
    sourceAggregateSha256: receipt.source.aggregateSha256,
    metrics,
  });
}

function gate(name, accepted, observed, boundary) {
  return deepFreeze({ name, accepted: exactBoolean(accepted, `${name}.accepted`), observed, boundary });
}

export function evaluatePublicationPolicy({ fp32Metrics, q8PreviewMetrics, q8FullMetrics, hostile }) {
  if (![fp32Metrics, q8PreviewMetrics, q8FullMetrics, hostile].every(isRecord)) {
    fail("publication policy inputs are invalid");
  }
  validateFp32MetricConsistency(fp32Metrics);
  validateQ8MetricConsistency(q8PreviewMetrics, "q8 preview metrics");
  validateQ8MetricConsistency(q8FullMetrics, "q8 full metrics");
  requireExactKeys(hostile, ["caseCount", "rejectedCount"], "hostile policy metrics");
  nonnegativeInteger(hostile.caseCount, "hostile caseCount");
  nonnegativeInteger(hostile.rejectedCount, "hostile rejectedCount");
  if (hostile.rejectedCount > hostile.caseCount) fail("hostile rejected count exceeds case count");
  const p = storyBeatTunedPublicationPolicyV1;
  const gates = [
    gate("fp32-case-count", fp32Metrics.rowCount === p.fp32Full.caseCount, fp32Metrics.rowCount, p.fp32Full.caseCount),
    gate("fp32-valid", fp32Metrics.firstPassValidCount >= p.fp32Full.minimumFirstPassValidCount, fp32Metrics.firstPassValidCount, p.fp32Full.minimumFirstPassValidCount),
    gate("fp32-unknown-word", fp32Metrics.unknownWordOutputCount <= p.fp32Full.maximumUnknownWordOutputCount, fp32Metrics.unknownWordOutputCount, p.fp32Full.maximumUnknownWordOutputCount),
    gate("fp32-unknown-capitalized", fp32Metrics.unknownCapitalizedWordOutputCount <= p.fp32Full.maximumUnknownCapitalizedWordOutputCount, fp32Metrics.unknownCapitalizedWordOutputCount, p.fp32Full.maximumUnknownCapitalizedWordOutputCount),
    gate("fp32-unknown-numeric", fp32Metrics.unknownNumericClaimOutputCount <= p.fp32Full.maximumUnknownNumericClaimOutputCount, fp32Metrics.unknownNumericClaimOutputCount, p.fp32Full.maximumUnknownNumericClaimOutputCount),
    gate("fp32-prompt-echo", fp32Metrics.promptEchoOutputCount <= p.fp32Full.maximumPromptEchoOutputCount, fp32Metrics.promptEchoOutputCount, p.fp32Full.maximumPromptEchoOutputCount),
    gate("fp32-fallback-copy", fp32Metrics.fallbackCopyCount <= p.fp32Full.maximumFallbackCopyCount, fp32Metrics.fallbackCopyCount, p.fp32Full.maximumFallbackCopyCount),
    gate("fp32-source-copy", fp32Metrics.exactSourceFieldCopyCount <= p.fp32Full.maximumExactSourceFieldCopyCount, fp32Metrics.exactSourceFieldCopyCount, p.fp32Full.maximumExactSourceFieldCopyCount),
    gate("q8-preview-case-count", q8PreviewMetrics.caseCount === p.q8Preview.caseCount, q8PreviewMetrics.caseCount, p.q8Preview.caseCount),
    gate("q8-preview-valid", q8PreviewMetrics.validCaseCount >= p.q8Preview.minimumValidCount, q8PreviewMetrics.validCaseCount, p.q8Preview.minimumValidCount),
    gate("q8-preview-fallback", q8PreviewMetrics.fallbackRequiredCaseCount <= p.q8Preview.maximumFallbackRequiredCaseCount, q8PreviewMetrics.fallbackRequiredCaseCount, p.q8Preview.maximumFallbackRequiredCaseCount),
    gate("q8-preview-unknown", q8PreviewMetrics.unknownLexemeCaseCount <= p.q8Preview.maximumUnknownLexemeCaseCount, q8PreviewMetrics.unknownLexemeCaseCount, p.q8Preview.maximumUnknownLexemeCaseCount),
    gate("q8-preview-scaffold", q8PreviewMetrics.promptScaffoldEchoCaseCount <= p.q8Preview.maximumPromptScaffoldEchoCaseCount, q8PreviewMetrics.promptScaffoldEchoCaseCount, p.q8Preview.maximumPromptScaffoldEchoCaseCount),
    gate("q8-preview-source-copy", q8PreviewMetrics.sourceFieldExactEchoCaseCount <= p.q8Preview.maximumSourceFieldExactEchoCaseCount, q8PreviewMetrics.sourceFieldExactEchoCaseCount, p.q8Preview.maximumSourceFieldExactEchoCaseCount),
    gate("q8-preview-shapes", q8PreviewMetrics.delexicalizedShapeCount >= p.q8Preview.minimumDelexicalizedShapeCount, q8PreviewMetrics.delexicalizedShapeCount, p.q8Preview.minimumDelexicalizedShapeCount),
    gate("q8-preview-shape-frequency", q8PreviewMetrics.maximumShapeFrequency <= p.q8Preview.maximumShapeFrequency, q8PreviewMetrics.maximumShapeFrequency, p.q8Preview.maximumShapeFrequency),
    gate("q8-full-case-count", q8FullMetrics.caseCount === p.q8Full.caseCount, q8FullMetrics.caseCount, p.q8Full.caseCount),
    gate("q8-full-valid", q8FullMetrics.validCaseCount >= p.q8Full.minimumValidCount, q8FullMetrics.validCaseCount, p.q8Full.minimumValidCount),
    gate("q8-full-fallback", q8FullMetrics.fallbackRequiredCaseCount <= p.q8Full.maximumFallbackRequiredCaseCount, q8FullMetrics.fallbackRequiredCaseCount, p.q8Full.maximumFallbackRequiredCaseCount),
    gate("q8-full-unknown", q8FullMetrics.unknownLexemeCaseCount <= p.q8Full.maximumUnknownLexemeCaseCount, q8FullMetrics.unknownLexemeCaseCount, p.q8Full.maximumUnknownLexemeCaseCount),
    gate("q8-full-scaffold", q8FullMetrics.promptScaffoldEchoCaseCount <= p.q8Full.maximumPromptScaffoldEchoCaseCount, q8FullMetrics.promptScaffoldEchoCaseCount, p.q8Full.maximumPromptScaffoldEchoCaseCount),
    gate("q8-full-source-copy", q8FullMetrics.sourceFieldExactEchoCaseCount <= p.q8Full.maximumSourceFieldExactEchoCaseCount, q8FullMetrics.sourceFieldExactEchoCaseCount, p.q8Full.maximumSourceFieldExactEchoCaseCount),
    gate("q8-full-unique-valid", q8FullMetrics.uniqueValidOutputCount >= p.q8Full.minimumUniqueValidOutputCount, q8FullMetrics.uniqueValidOutputCount, p.q8Full.minimumUniqueValidOutputCount),
    gate("q8-full-raw-duplicate", q8FullMetrics.maximumRawDuplicateCount <= p.q8Full.maximumRawDuplicateCount, q8FullMetrics.maximumRawDuplicateCount, p.q8Full.maximumRawDuplicateCount),
    gate("q8-full-shapes", q8FullMetrics.delexicalizedShapeCount >= p.q8Full.minimumDelexicalizedShapeCount, q8FullMetrics.delexicalizedShapeCount, p.q8Full.minimumDelexicalizedShapeCount),
    gate("q8-full-shape-frequency", q8FullMetrics.maximumShapeFrequency <= p.q8Full.maximumShapeFrequency, q8FullMetrics.maximumShapeFrequency, p.q8Full.maximumShapeFrequency),
    gate("hostile-boundary", hostile.rejectedCount >= p.hostileBoundary.minimumRejectedCount && hostile.caseCount === p.hostileBoundary.caseCount, hostile.rejectedCount, p.hostileBoundary.minimumRejectedCount),
  ];
  return deepFreeze({ passed: gates.every((entry) => entry.accepted), gates });
}

function selectedFp32Metrics(metrics) {
  const keys = [
    "rowCount", "firstPassValidCount", "firstPassInvalidCount", "firstPassValidityBasisPoints",
    "unknownWordOutputCount", "unknownCapitalizedWordOutputCount", "unknownNumericClaimOutputCount",
    "promptEchoOutputCount", "fallbackCopyCount", "exactSourceFieldCopyCount",
    "exactFieldOrFallbackCopyCount", "referenceTargetCopyCount", "uniqueOutputCount",
    "delexicalizedShapeCount", "maximumShapeFrequency",
  ];
  requireExactKeys(metrics, keys, "fp32 metrics");
  for (const key of keys) nonnegativeInteger(metrics[key], `fp32 metrics.${key}`);
  return Object.fromEntries(keys.map((key) => [key, metrics[key]]));
}

function validateFp32MetricConsistency(metrics) {
  selectedFp32Metrics(metrics);
  if (metrics.firstPassValidCount + metrics.firstPassInvalidCount !== metrics.rowCount
    || metrics.firstPassValidityBasisPoints !== permyriad(metrics.firstPassValidCount, metrics.rowCount)
    || metrics.referenceTargetCopyCount > metrics.rowCount
    || metrics.uniqueOutputCount > metrics.rowCount
    || metrics.delexicalizedShapeCount < 1 || metrics.delexicalizedShapeCount > metrics.rowCount
    || metrics.maximumShapeFrequency < 1 || metrics.maximumShapeFrequency > metrics.rowCount
    || metrics.exactFieldOrFallbackCopyCount < Math.max(metrics.fallbackCopyCount, metrics.exactSourceFieldCopyCount)
    || metrics.exactFieldOrFallbackCopyCount > metrics.fallbackCopyCount + metrics.exactSourceFieldCopyCount) {
    fail("FP32 metric arithmetic differs");
  }
}

function publicRuntimeArtifacts(entries) {
  return entries.map((entry) => ({
    path: entry.path,
    role: entry.role,
    byteLength: entry.byteLength,
    sha256: entry.sha256,
  }));
}

const q8MetricKeys = Object.freeze([
  "caseCount", "validCaseCount", "invalidCaseCount", "validityRatePermyriad",
  "fallbackRequiredCaseCount", "fallbackRequiredRatePermyriad", "unknownLexemeCaseCount",
  "promptScaffoldEchoCaseCount", "sourceFieldExactEchoCaseCount", "targetExactMatchCaseCount",
  "uniqueRawOutputCount", "uniqueRawOutputRatePermyriad", "uniqueValidOutputCount",
  "uniqueValidOutputRatePermyriad", "maximumRawDuplicateCount", "delexicalizedShapeCount",
  "maximumShapeFrequency",
]);

function validateQ8Projection(value, label) {
  requireExactKeys(value, [
    "bundleAggregateSha256", "metrics", "outputHash", "receiptContentHash",
    "receiptFileSha256", "selectionHash",
  ], label);
  for (const field of ["bundleAggregateSha256", "outputHash", "receiptFileSha256", "selectionHash"]) {
    requireHash(value[field], `${label}.${field}`);
  }
  requireHash(value.receiptContentHash, `${label}.receiptContentHash`, hash16Pattern);
  validateQ8MetricConsistency(value.metrics, `${label}.metrics`);
}

function validateQ8MetricConsistency(metrics, label) {
  requireExactKeys(metrics, q8MetricKeys, label);
  for (const key of q8MetricKeys) nonnegativeInteger(metrics[key], `${label}.${key}`);
  if (metrics.validCaseCount + metrics.invalidCaseCount !== metrics.caseCount
    || metrics.fallbackRequiredCaseCount !== metrics.invalidCaseCount
    || metrics.validityRatePermyriad !== permyriad(metrics.validCaseCount, metrics.caseCount)
    || metrics.fallbackRequiredRatePermyriad !== permyriad(metrics.fallbackRequiredCaseCount, metrics.caseCount)
    || metrics.uniqueRawOutputRatePermyriad !== permyriad(metrics.uniqueRawOutputCount, metrics.caseCount)
    || metrics.uniqueValidOutputRatePermyriad !== permyriad(metrics.uniqueValidOutputCount, metrics.validCaseCount)
    || metrics.targetExactMatchCaseCount > metrics.caseCount
    || metrics.uniqueRawOutputCount < 1 || metrics.uniqueRawOutputCount > metrics.caseCount
    || metrics.uniqueValidOutputCount > metrics.validCaseCount
    || metrics.uniqueValidOutputCount > metrics.uniqueRawOutputCount
    || metrics.maximumRawDuplicateCount < 1 || metrics.maximumRawDuplicateCount > metrics.caseCount
    || metrics.delexicalizedShapeCount < 1 || metrics.delexicalizedShapeCount > metrics.caseCount
    || metrics.maximumShapeFrequency < 1 || metrics.maximumShapeFrequency > metrics.caseCount) {
    fail(`${label} arithmetic differs`);
  }
}

function validateAggregateInputs({ producer, contracts, training, derived, fp32, q8Preview, q8Full, holdout }) {
  requireExactKeys(producer, ["aggregateSha256", "commit", "files", "generator", "repository"], "producer");
  if (producer.repository !== producerRepository || !/^[0-9a-f]{40}$/u.test(producer.commit)) fail("producer identity differs");
  validateManifest(producer.files, "producer files");
  requireHash(producer.aggregateSha256, "producer aggregateSha256");
  if (producer.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(producer.files)))) fail("producer aggregate differs");
  requireExactKeys(producer.generator, ["path", "sha256"], "producer generator");
  if (producer.generator.path !== "tools/narrator-story-beat-publication/publication.mjs") fail("generator path differs");
  requireHash(producer.generator.sha256, "generator sha256");

  requireExactKeys(contracts, ["antiEcho", "contractHash", "controller", "hostile", "productionBoundary"], "contracts");
  const { contractHash, ...contractPayload } = contracts;
  requireHash(contractHash, "contract hash", hash16Pattern);
  if (contractHash !== canonicalHash(contractPayload)) fail("contract hash differs");
  requireExactKeys(contracts.hostile, ["caseCount", "caseSetHash", "corpusHash", "rejectedCount", "rejectionReasonSetHash"], "hostile contract");
  requireExactKeys(contracts.productionBoundary, ["corpusSourceSha256", "corpusTestSha256", "storyBeatTestSha256", "validatorSourceSha256"], "production boundary");
  requireExactKeys(contracts.antiEcho, ["hostileTestSha256", "recentDraftLimit", "sourceSha256"], "anti-echo contract");
  requireExactKeys(contracts.controller, ["hostileTestSha256", "sourceSha256"], "controller contract");
  for (const field of ["caseSetHash", "corpusHash", "rejectionReasonSetHash"]) requireHash(contracts.hostile[field], `hostile.${field}`, hash16Pattern);
  nonnegativeInteger(contracts.hostile.caseCount, "hostile.caseCount");
  nonnegativeInteger(contracts.hostile.rejectedCount, "hostile.rejectedCount");
  for (const group of [contracts.productionBoundary, contracts.antiEcho, contracts.controller]) {
    for (const [field, value] of Object.entries(group)) {
      if (field !== "recentDraftLimit") requireHash(value, `contract.${field}`);
    }
  }
  if (contracts.antiEcho.recentDraftLimit !== 8) fail("anti-echo FIFO limit differs");

  requireExactKeys(training, ["checkpointTreeSha256", "corpus", "receiptFileSha256", "receiptSha256", "rows", "sourceTreeSha256"], "training projection");
  requireExactKeys(training.corpus, ["corpusHash", "fileSha256", "schemaVersion"], "training corpus");
  requireExactKeys(training.rows, ["dev", "total", "train"], "training rows");
  for (const field of ["checkpointTreeSha256", "receiptFileSha256", "receiptSha256", "sourceTreeSha256"] ) requireHash(training[field], `training.${field}`);
  if (training.corpus.schemaVersion !== 1) fail("training corpus schema differs");
  requireHash(training.corpus.corpusHash, "training corpus hash", hash16Pattern);
  requireHash(training.corpus.fileSha256, "training corpus file sha256");
  for (const field of ["dev", "total", "train"]) positiveInteger(training.rows[field], `training rows.${field}`);
  if (training.rows.total !== training.rows.train + training.rows.dev) fail("training row arithmetic differs");

  requireExactKeys(derived, [
    "baseLockSha256", "checkpointTreeSha256", "lockContentSha256", "lockFileSha256",
    "processIsolation", "rebuildHarnessSha256", "rebuildReceiptFileSha256", "rebuildReceiptSha256",
    "reproducibility", "runtimeArtifacts", "totalRuntimeBytes",
  ], "derived projection");
  validateManifest(derived.runtimeArtifacts, "derived runtime artifacts", { withRole: true });
  positiveInteger(derived.totalRuntimeBytes, "derived total runtime bytes");
  for (const field of ["baseLockSha256", "checkpointTreeSha256", "lockContentSha256", "lockFileSha256", "rebuildHarnessSha256", "rebuildReceiptFileSha256", "rebuildReceiptSha256"]) {
    requireHash(derived[field], `derived.${field}`);
  }
  if (derived.processIsolation !== "fresh-python-process-per-build"
    || derived.reproducibility !== "byte-identical-isolated-processes"
    || derived.totalRuntimeBytes !== derived.runtimeArtifacts.reduce((sum, entry) => sum + entry.byteLength, 0)
    || derived.checkpointTreeSha256 !== training.checkpointTreeSha256) fail("derived projection binding differs");

  requireExactKeys(fp32, ["metrics", "resultsContentHash", "resultsFileSha256", "selectionHash", "validationReportContentHash", "validationReportFileSha256"], "FP32 projection");
  for (const field of ["resultsFileSha256", "validationReportFileSha256"]) requireHash(fp32[field], `fp32.${field}`);
  for (const field of ["resultsContentHash", "selectionHash", "validationReportContentHash"]) requireHash(fp32[field], `fp32.${field}`, hash16Pattern);
  validateFp32MetricConsistency(fp32.metrics);
  validateQ8Projection(q8Preview, "q8 preview projection");
  validateQ8Projection(q8Full, "q8 full projection");

  requireExactKeys(holdout, ["byteLength", "caseCount", "corpusHash", "fileSha256"], "holdout projection");
  positiveInteger(holdout.byteLength, "holdout byteLength");
  positiveInteger(holdout.caseCount, "holdout caseCount");
  requireHash(holdout.corpusHash, "holdout corpusHash", hash16Pattern);
  requireHash(holdout.fileSha256, "holdout fileSha256");
}

export function assertPublicSafe(value, forbiddenFragments = []) {
  const forbiddenKeys = /(?:^|_)(?:candidate|output|prompt|target|elapsed|timing|loss|localPath|absolutePath)(?:$|_)/iu;
  const visit = (node, path = "receipt") => {
    if (Array.isArray(node)) return node.forEach((child, index) => visit(child, `${path}[${index}]`));
    if (!isRecord(node)) {
      if (typeof node === "string") {
        if (node.includes("\n") || node.includes("\r") || node.startsWith("file:")
          || /^[A-Za-z]:[\\/]/u.test(node) || node.startsWith("/")) fail(`${path} leaks private text or a local path`);
        for (const fragment of forbiddenFragments) {
          if (fragment && node.includes(fragment)) fail(`${path} leaks a private input path`);
        }
      }
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenKeys.test(key)) fail(`${path}.${key} is forbidden in public evidence`);
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
  return value;
}

export function createPublicationDocuments({
  producer,
  contracts,
  training,
  derived,
  fp32,
  q8Preview,
  q8Full,
  holdout,
  privatePathFragments = [],
}) {
  validateAggregateInputs({ producer, contracts, training, derived, fp32, q8Preview, q8Full, holdout });
  const policyEvaluation = evaluatePublicationPolicy({
    fp32Metrics: fp32.metrics,
    q8PreviewMetrics: q8Preview.metrics,
    q8FullMetrics: q8Full.metrics,
    hostile: { caseCount: contracts.hostile.caseCount, rejectedCount: contracts.hostile.rejectedCount },
  });
  if (!policyEvaluation.passed) {
    const failures = policyEvaluation.gates.filter((entry) => !entry.accepted).map((entry) => entry.name);
    fail(`publication policy failed: ${failures.join(",")}`);
  }
  const runtimeArtifacts = publicRuntimeArtifacts(derived.runtimeArtifacts);
  const runtimeAggregateSha256 = sha256(Buffer.from(canonicalStringify(runtimeArtifacts)));
  const versionSuffix = `${runtimeAggregateSha256.slice(0, 12)}-${q8Full.outputHash.slice(0, 12)}`;
  const immutableVersion = `story-beat-tuned-q8-v1-${versionSuffix}`;
  const immutableTag = `v1-${versionSuffix}`;
  const receiptPayload = {
    schemaVersion: publicationSchemaVersion,
    kind: "story-beat-tuned-q8-publication-quality-receipt",
    disposition: "public-quality-evidence-not-runtime-admission",
    policy: storyBeatTunedPublicationPolicyV1,
    policyHash,
    producer,
    contracts,
    training,
    derivation: {
      lockFileSha256: derived.lockFileSha256,
      lockContentSha256: derived.lockContentSha256,
      rebuildReceiptFileSha256: derived.rebuildReceiptFileSha256,
      rebuildReceiptSha256: derived.rebuildReceiptSha256,
      checkpointTreeSha256: derived.checkpointTreeSha256,
      baseLockSha256: derived.baseLockSha256,
      rebuildHarnessSha256: derived.rebuildHarnessSha256,
      processIsolation: derived.processIsolation,
      reproducibility: derived.reproducibility,
    },
    model: {
      format: "transformers-js-onnx-q8",
      runtimeArtifacts,
      runtimeAggregateSha256,
      totalRuntimeBytes: derived.totalRuntimeBytes,
    },
    holdout,
    evaluations: {
      fp32: { ...fp32, metrics: selectedFp32Metrics(fp32.metrics) },
      q8Preview,
      q8Full,
    },
    policyEvaluation,
    immutableVersion,
    immutableTag,
    modelAdmitted: false,
    displayAuthorized: false,
  };
  const qualityReceipt = seal(receiptPayload);
  const qualityBytes = Buffer.from(`${stableJsonStringify(qualityReceipt)}\n`);
  const qualityReceiptSha256 = sha256(qualityBytes);
  const planPayload = {
    schemaVersion: publicationSchemaVersion,
    kind: "story-beat-tuned-q8-artifact-staging-plan",
    disposition: "deterministic-plan-no-publication-authority",
    artifactRepository,
    immutableVersion,
    immutableTag,
    overwriteAllowed: false,
    qualityReceipt: {
      path: qualityReceiptFile,
      byteLength: qualityBytes.byteLength,
      sha256: qualityReceiptSha256,
      contentHash: qualityReceipt.contentHash,
    },
    artifacts: runtimeArtifacts.map((entry) => ({
      sourcePath: entry.path,
      destinationPath: entry.path,
      role: entry.role,
      byteLength: entry.byteLength,
      sha256: entry.sha256,
    })),
    modelAdmitted: false,
    displayAuthorized: false,
  };
  const stagingPlan = seal(planPayload);
  assertPublicSafe(qualityReceipt, privatePathFragments);
  assertPublicSafe(stagingPlan, privatePathFragments);
  return deepFreeze({ qualityReceipt, stagingPlan });
}

export function publicationPathsOverlap(left, right) {
  if (typeof left !== "string" || typeof right !== "string") fail("overlap paths are invalid");
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}${sep}`)
    || normalizedRight.startsWith(`${normalizedLeft}${sep}`);
}

function safeRawPath(raw, label) {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0") || raw.includes("\\")) {
    fail(`${label} path is unsafe`);
  }
  const parts = raw.split("/");
  if (parts.some((part, index) => part === "~" || part === ".." || (part === "." && index !== 0))) {
    fail(`${label} path traversal is forbidden`);
  }
}

async function strictExistingPath(raw, label, expectedKind) {
  safeRawPath(raw, label);
  const absolute = resolve(raw);
  let resolved;
  try {
    resolved = await realpath(absolute);
  } catch (error) {
    fail(`${label} cannot be resolved: ${error.message}`);
  }
  if (resolved !== absolute) fail(`${label} path must not traverse a symlink`);
  const metadata = await lstat(absolute, { bigint: true });
  if (metadata.isSymbolicLink()) fail(`${label} path must not be a symlink`);
  if (expectedKind === "file" && !metadata.isFile()) fail(`${label} must be a regular file`);
  if (expectedKind === "directory" && !metadata.isDirectory()) fail(`${label} must be a regular directory`);
  return absolute;
}

async function readStableFile(path, label) {
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(`${label} must be a regular file`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const fields = ["dev", "ino", "size", "mtimeNs", "ctimeNs"];
    if (fields.some((field) => before[field] !== after[field]) || BigInt(bytes.byteLength) !== after.size) {
      fail(`${label} changed while being read`);
    }
    return {
      path,
      bytes,
      evidence: {
        path: basename(path),
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
      },
    };
  } finally {
    await handle.close();
  }
}

async function hashStableFile(path, label) {
  const handle = await open(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(`${label} must be a regular file`);
    const digest = createHash("sha256");
    let byteLength = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      byteLength += chunk.byteLength;
      if (!Number.isSafeInteger(byteLength)) fail(`${label} byte length overflowed`);
      digest.update(chunk);
    }
    const after = await handle.stat({ bigint: true });
    const fields = ["dev", "ino", "size", "mtimeNs", "ctimeNs"];
    if (fields.some((field) => before[field] !== after[field]) || BigInt(byteLength) !== after.size) {
      fail(`${label} changed while being hashed`);
    }
    return { byteLength, sha256: digest.digest("hex") };
  } finally {
    await handle.close();
  }
}

async function snapshotDirectory(root, label, directory = root) {
  const first = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => compareText(left.name, right.name));
  const files = [];
  for (const entry of first) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path, { bigint: true });
    if (entry.isSymbolicLink() || metadata.isSymbolicLink()) fail(`${label} contains a symlink`);
    if (entry.isDirectory() && metadata.isDirectory()) {
      files.push(...await snapshotDirectory(root, label, path));
    } else if (entry.isFile() && metadata.isFile()) {
      const snapshot = await hashStableFile(path, `${label}/${entry.name}`);
      files.push({
        path: relative(root, path).split(sep).join("/"),
        byteLength: snapshot.byteLength,
        sha256: snapshot.sha256,
      });
    } else fail(`${label} contains a non-regular entry`);
  }
  const second = (await readdir(directory, { withFileTypes: true }))
    .map((entry) => `${entry.name}:${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "x"}`)
    .sort(compareText);
  const expected = first.map((entry) => `${entry.name}:${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "x"}`);
  if (!exactCanonical(second, expected)) fail(`${label} changed while being read`);
  return files.sort((left, right) => compareText(left.path, right.path));
}

async function assertFileSnapshotCurrent(snapshot, label) {
  const current = await readStableFile(snapshot.path, label);
  if (!current.bytes.equals(snapshot.bytes)) fail(`${label} drifted during publication validation`);
}

async function assertDirectorySnapshotCurrent(root, expected, label) {
  const current = await snapshotDirectory(root, label);
  if (!exactCanonical(current, expected)) fail(`${label} drifted during publication validation`);
}

async function validateTrainingReceiptWithPython(checkpoint, trainingReceiptPath) {
  const trainerPath = resolve(repositoryRoot, "tools/narrator-story-beat-training/train.py");
  const bridge = [
    "import importlib.util,json,pathlib,sys",
    "trainer_path=pathlib.Path(sys.argv[1])",
    "checkpoint=pathlib.Path(sys.argv[2])",
    "receipt_path=pathlib.Path(sys.argv[3])",
    "spec=importlib.util.spec_from_file_location('story_beat_publication_trainer',trainer_path)",
    "module=importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "receipt=module.load_json(receipt_path,'training receipt')",
    "validated=module.validate_receipt(checkpoint,receipt)",
    "summary={'receiptSha256':validated['receiptSha256'],'corpus':{'schemaVersion':validated['corpus']['schemaVersion'],'corpusHash':validated['corpus']['corpusHash'],'fileSha256':validated['corpus']['fileSha256']},'rows':validated['rows'],'source':{'treeSha256':validated['source']['treeSha256'],'files':validated['source']['files']},'recipe':validated['recipe'],'packages':validated['packages'],'files':validated['files']}",
    "print(json.dumps(summary,ensure_ascii=False,allow_nan=False,separators=(',',':'),sort_keys=True))",
  ].join(";");
  let stdout;
  try {
    ({ stdout } = await execFile("python3", ["-c", bridge, trainerPath, checkpoint, trainingReceiptPath], {
      cwd: repositoryRoot,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    fail(`training receipt validator failed: ${String(error.stderr || error.message).trim()}`);
  }
  const summary = parseJsonStrict(Buffer.from(stdout), "training validator summary");
  requireExactKeys(summary, ["corpus", "files", "packages", "receiptSha256", "recipe", "rows", "source"], "training validator summary");
  requireHash(summary.receiptSha256, "training receipt digest");
  validateManifest(summary.files, "training checkpoint manifest");
  validateManifest(summary.source.files, "training base source manifest");
  requireExactKeys(summary.packages, ["python", "safetensors", "tokenizers", "torch", "transformers"], "training packages");
  if (!exactCanonical(summary.packages, {
    python: "3.11.11",
    safetensors: "0.8.0",
    tokenizers: "0.22.2",
    torch: "2.5.1+cpu",
    transformers: "4.57.6",
  })) fail("training package environment differs from locked rebuild inputs");
  return summary;
}

async function collectProducerEvidence() {
  const sourcePaths = [...new Set([...publicationSourcePaths, ...browserEvaluationSourcePaths])].sort();
  const commit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail("producer commit is invalid");
  const files = await evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit: commit });
  validateManifest(files, "producer source manifest");
  return deepFreeze({
    repository: producerRepository,
    commit,
    files,
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
    generator: {
      path: "tools/narrator-story-beat-publication/publication.mjs",
      sha256: files.find((entry) => entry.path === "tools/narrator-story-beat-publication/publication.mjs")?.sha256,
    },
  });
}

async function assertProducerEvidenceCurrent(expected) {
  const current = await collectProducerEvidence();
  if (!exactCanonical(current, expected)) fail("producer source changed during publication validation");
}

function sourceEntry(sourceByPath, path) {
  const entry = sourceByPath.get(path);
  if (entry === undefined) fail(`producer source closure is missing ${path}`);
  return entry;
}

async function loadPublicationContracts(producer) {
  const production = await loadProductionContracts(repositoryRoot);
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const corpusModule = await server.ssrLoadModule("/src/narrator/story-beat-corpus.ts");
    const echoModule = await server.ssrLoadModule("/src/ui/story-beat-echo.ts");
    const controllerModule = await server.ssrLoadModule("/src/ui/story-beat-controller.ts");
    if (typeof corpusModule.isStoryBeatCorpusV1 !== "function"
      || !corpusModule.isStoryBeatCorpusV1(corpusModule.storyBeatCorpusV1)
      || corpusModule.storyBeatCorpusRequiredNegativeCases !== 18
      || !Array.isArray(corpusModule.storyBeatCorpusRejectionReasons)
      || corpusModule.storyBeatCorpusRejectionReasons.length !== 18
      || new Set(corpusModule.storyBeatCorpusRejectionReasons).size !== 18) {
      fail("hostile story-beat corpus contract differs");
    }
    const hostileCases = corpusModule.storyBeatCorpusV1.cases
      .filter((entry) => entry.kind === "story-beat-negative");
    const rejectedCount = hostileCases.filter((entry) =>
      production.validateStoryBeatResult(entry.candidate, entry.facts) === null).length;
    if (hostileCases.length !== 18 || rejectedCount !== 18) fail("hostile production boundary is not intact");
    if (echoModule.storyBeatRecentDraftLimit !== 8
      || typeof echoModule.createStoryBeatDraftSignatureV1 !== "function"
      || typeof echoModule.storyBeatDraftEchoReasonV1 !== "function"
      || typeof controllerModule.StoryBeatController !== "function"
      || typeof controllerModule.createStoryBeatController !== "function") {
      fail("production anti-echo/controller contract differs");
    }
    const sourceByPath = new Map(producer.files.map((entry) => [entry.path, entry]));
    const hostile = {
      caseCount: hostileCases.length,
      rejectedCount,
      corpusHash: corpusModule.storyBeatCorpusHashV1,
      caseSetHash: canonicalHash(hostileCases.map((entry) => ({ id: entry.id, caseHash: entry.caseHash }))),
      rejectionReasonSetHash: canonicalHash([...corpusModule.storyBeatCorpusRejectionReasons]),
    };
    const productionBoundary = {
      validatorSourceSha256: sourceEntry(sourceByPath, "src/narrator/story-beat.ts").sha256,
      corpusSourceSha256: sourceEntry(sourceByPath, "src/narrator/story-beat-corpus.ts").sha256,
      corpusTestSha256: sourceEntry(sourceByPath, "src/narrator/story-beat-corpus.test.ts").sha256,
      storyBeatTestSha256: sourceEntry(sourceByPath, "src/narrator/story-beat.test.ts").sha256,
    };
    const antiEcho = {
      recentDraftLimit: 8,
      sourceSha256: sourceEntry(sourceByPath, "src/ui/story-beat-echo.ts").sha256,
      hostileTestSha256: sourceEntry(sourceByPath, "src/ui/story-beat-echo.test.ts").sha256,
    };
    const controller = {
      sourceSha256: sourceEntry(sourceByPath, "src/ui/story-beat-controller.ts").sha256,
      hostileTestSha256: sourceEntry(sourceByPath, "src/ui/story-beat-controller.test.ts").sha256,
    };
    const payload = { hostile, productionBoundary, antiEcho, controller };
    return {
      production,
      publicEvidence: deepFreeze({ ...payload, contractHash: canonicalHash(payload) }),
    };
  } finally {
    await server.close();
  }
}

function browserSourceEvidence(producer) {
  const sourceByPath = new Map(producer.files.map((entry) => [entry.path, entry]));
  return browserEvaluationSourcePaths.map((path) => ({ ...sourceEntry(sourceByPath, path) }));
}

function validateQ8ReceiptBindings({ receipt, receiptSnapshot, holdout, holdoutSnapshot, stagedFiles, producer, production }) {
  const expectedSourceFiles = browserSourceEvidence(producer);
  if (receipt.source.commit !== producer.commit
    || !exactCanonical(receipt.source.files, expectedSourceFiles)
    || receipt.source.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(expectedSourceFiles)))) {
    fail("q8 browser receipt producer source binding differs");
  }
  if (!exactCanonical(receipt.model.files, stagedFiles)
    || receipt.model.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(stagedFiles)))) {
    fail("q8 browser receipt staged model binding differs");
  }
  if (receipt.holdout.sha256 !== holdoutSnapshot.evidence.sha256
    || receipt.holdout.byteLength !== holdoutSnapshot.bytes.byteLength
    || receipt.holdout.corpusHash !== holdout.corpusHash) fail("q8 browser holdout binding differs");
  const recomputed = recomputeQ8Evidence({
    receipt,
    holdout,
    validateStoryBeatResult: production.validateStoryBeatResult,
  });
  return deepFreeze({
    receiptFileSha256: receiptSnapshot.evidence.sha256,
    receiptContentHash: recomputed.receiptContentHash,
    outputHash: recomputed.outputHash,
    selectionHash: recomputed.selectionHash,
    bundleAggregateSha256: receipt.bundle.aggregateSha256,
    metrics: recomputed.metrics,
  });
}

function validateFp32Bindings({
  results,
  resultsSnapshot,
  suppliedReport,
  reportSnapshot,
  holdout,
  holdoutPath,
  holdoutSnapshot,
  checkpoint,
  checkpointFiles,
  production,
}) {
  const model = { path: checkpoint, files: checkpointFiles, treeSha256: modelTreeHash(checkpointFiles) };
  const report = validateHeldoutEvaluation({
    results,
    resultsFileSha256: resultsSnapshot.evidence.sha256,
    holdout,
    holdoutPath,
    holdoutFileSha256: holdoutSnapshot.evidence.sha256,
    productionCorpus: production.productionCorpus,
    validateStoryBeatResult: production.validateStoryBeatResult,
    deterministicFallback: production.deterministicFallback,
    model,
  });
  if (!exactCanonical(report, suppliedReport)) fail("FP32 validation report differs from raw-evidence recomputation");
  if (report.integrityAccepted !== true || report.fullEvaluation !== true
    || report.modelAdmitted !== false || report.displayAuthorized !== false) {
    fail("FP32 validation report authority or completeness differs");
  }
  return deepFreeze({
    resultsFileSha256: resultsSnapshot.evidence.sha256,
    resultsContentHash: results.contentHash,
    validationReportFileSha256: reportSnapshot.evidence.sha256,
    validationReportContentHash: report.contentHash,
    selectionHash: report.selection.selectedIdsHash,
    metrics: selectedFp32Metrics(report.metrics),
  });
}

function assertIntegerOnlyJsonNumbers(bytes, label) {
  const text = bytes.toString("utf8");
  let string = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const scalar = text[index];
    if (string) {
      if (escaped) escaped = false;
      else if (scalar === "\\") escaped = true;
      else if (scalar === "\"") string = false;
      continue;
    }
    if (scalar === "\"") {
      string = true;
      continue;
    }
    if (scalar === "-" || /[0-9]/u.test(scalar)) {
      const match = text.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u);
      if (match === null) fail(`${label} contains an invalid number`);
      if (/[.eE]/u.test(match[0])) fail(`${label} uses a non-integer numeric representation`);
      index += match[0].length - 1;
    }
  }
}

export function parsePublicationArguments(argv) {
  if (!Array.isArray(argv) || !["create", "verify"].includes(argv[0])) return null;
  const required = [
    "checkpoint", "training-receipt", "fp32-results", "fp32-report", "derived-lock",
    "rebuild-receipt", "staged-model", "q8-preview", "q8-full", "holdout", "out",
  ];
  const allowed = new Set(required);
  const options = { mode: argv[0] };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== "string" || !flag.startsWith("--")
      || typeof value !== "string" || value.length === 0) return null;
    const name = flag.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
  }
  if (!required.every((name) => Object.hasOwn(options, name))
    || Object.keys(options).length !== required.length + 1) return null;
  return Object.freeze(options);
}

async function resolvePublicationPaths(options) {
  const files = {};
  for (const name of [
    "training-receipt", "fp32-results", "fp32-report", "derived-lock", "rebuild-receipt",
    "q8-preview", "q8-full", "holdout",
  ]) files[name] = await strictExistingPath(options[name], name, "file");
  const checkpoint = await strictExistingPath(options.checkpoint, "checkpoint", "directory");
  const stagedModel = await strictExistingPath(options["staged-model"], "staged-model", "directory");
  if (files["training-receipt"] !== join(checkpoint, "training-receipt.json")) {
    fail("training receipt must be the checkpoint's exact training-receipt.json");
  }
  if (publicationPathsOverlap(checkpoint, stagedModel)) fail("checkpoint and staged model overlap");
  const fileEntries = Object.entries(files);
  for (let left = 0; left < fileEntries.length; left += 1) {
    for (let right = left + 1; right < fileEntries.length; right += 1) {
      if (publicationPathsOverlap(fileEntries[left][1], fileEntries[right][1])) {
        fail(`${fileEntries[left][0]} and ${fileEntries[right][0]} overlap`);
      }
    }
  }
  for (const [name, path] of fileEntries) {
    if (name !== "training-receipt" && (publicationPathsOverlap(path, checkpoint)
      || publicationPathsOverlap(path, stagedModel))) fail(`${name} overlaps a model input`);
  }
  safeRawPath(options.out, "out");
  const output = resolve(options.out);
  const realIgnoredRoot = await realpath(ignoredWorkspaceRoot);
  if (realIgnoredRoot !== ignoredWorkspaceRoot || dirname(output) !== ignoredWorkspaceRoot
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(basename(output))) {
    fail("output must be a direct, safe child of the real .narrator-t5-rebuild directory");
  }
  for (const path of [checkpoint, stagedModel, ...Object.values(files)]) {
    if (publicationPathsOverlap(output, path)) fail("output overlaps an immutable input");
  }
  if (options.mode === "verify") await strictExistingPath(output, "out", "directory");
  else {
    try {
      await lstat(output);
      fail("create output must be fresh");
    } catch (error) {
      if (error instanceof TypeError) throw error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { files, checkpoint, stagedModel, output };
}

async function readJsonEvidence(path, label, { integersOnly = true } = {}) {
  const snapshot = await readStableFile(path, label);
  if (snapshot.bytes.byteLength === 0 || snapshot.bytes.byteLength > 64 * 1024 * 1024) {
    fail(`${label} byte length is invalid`);
  }
  if (integersOnly) assertIntegerOnlyJsonNumbers(snapshot.bytes, label);
  return { snapshot, value: parseJsonStrict(snapshot.bytes, label) };
}

function exactStagedModel(files) {
  validateManifest(files, "staged q8 model");
  if (!exactCanonical(files.map((entry) => entry.path), storyBeatBrowserEvaluationModelPaths)
    || files.some((entry) => entry.byteLength <= 0)) fail("staged q8 model closure differs");
  return files;
}

async function collectPublicationBuild(options) {
  const paths = await resolvePublicationPaths(options);
  const [
    trainingReceipt,
    fp32Results,
    fp32Report,
    derivedLock,
    rebuildReceipt,
    q8PreviewReceipt,
    q8FullReceipt,
    holdoutEvidence,
  ] = await Promise.all([
    readJsonEvidence(paths.files["training-receipt"], "training receipt", { integersOnly: false }),
    readJsonEvidence(paths.files["fp32-results"], "FP32 results"),
    readJsonEvidence(paths.files["fp32-report"], "FP32 validation report"),
    readJsonEvidence(paths.files["derived-lock"], "derived lock"),
    readJsonEvidence(paths.files["rebuild-receipt"], "rebuild receipt"),
    readJsonEvidence(paths.files["q8-preview"], "q8 preview receipt"),
    readJsonEvidence(paths.files["q8-full"], "q8 full receipt"),
    readJsonEvidence(paths.files.holdout, "sealed holdout"),
  ]);
  const [checkpointSnapshot, stagedFiles, producer] = await Promise.all([
    snapshotDirectory(paths.checkpoint, "checkpoint"),
    snapshotDirectory(paths.stagedModel, "staged q8 model"),
    collectProducerEvidence(),
  ]);
  exactStagedModel(stagedFiles);
  if (holdoutEvidence.snapshot.evidence.sha256 !== storyBeatBrowserEvaluationExpectedHoldoutSha256) {
    fail("sealed holdout file differs from committed export evidence");
  }
  const holdout = parseSealedStoryBeatHoldout(holdoutEvidence.snapshot.bytes.toString("utf8"));
  if (holdout.corpusHash !== storyBeatBrowserEvaluationExpectedHoldoutCorpusHash) {
    fail("sealed holdout corpus differs from committed export evidence");
  }
  const trainingSummary = await validateTrainingReceiptWithPython(
    paths.checkpoint,
    paths.files["training-receipt"],
  );
  const expectedCheckpointSnapshot = completeCheckpointManifest(
    trainingSummary.files,
    trainingReceipt.snapshot.evidence,
  );
  if (!exactCanonical(checkpointSnapshot, expectedCheckpointSnapshot)) {
    fail("checkpoint closure differs from the validated training receipt");
  }
  const contractBundle = await loadPublicationContracts(producer);
  const derived = validateDerivedEvidence({
    derivedLock: derivedLock.value,
    derivedLockBytes: derivedLock.snapshot.bytes,
    rebuildReceipt: rebuildReceipt.value,
    rebuildReceiptBytes: rebuildReceipt.snapshot.bytes,
    checkpointFiles: expectedCheckpointSnapshot,
    stagedFiles,
    trainingReceipt: trainingReceipt.snapshot.evidence,
    trainingSummary,
    sourceFiles: producer.files,
  });
  if (trainingSummary.source.treeSha256 !== derivedLock.value.base.source.manifestSha256
    || sha256Stable(trainingSummary.source.files) !== trainingSummary.source.treeSha256) {
    fail("training source lineage differs from immutable base model evidence");
  }
  const fp32 = validateFp32Bindings({
    results: fp32Results.value,
    resultsSnapshot: fp32Results.snapshot,
    suppliedReport: fp32Report.value,
    reportSnapshot: fp32Report.snapshot,
    holdout,
    holdoutPath: paths.files.holdout,
    holdoutSnapshot: holdoutEvidence.snapshot,
    checkpoint: paths.checkpoint,
    checkpointFiles: expectedCheckpointSnapshot,
    production: contractBundle.production,
  });
  const q8Preview = validateQ8ReceiptBindings({
    receipt: q8PreviewReceipt.value,
    receiptSnapshot: q8PreviewReceipt.snapshot,
    holdout,
    holdoutSnapshot: holdoutEvidence.snapshot,
    stagedFiles,
    producer,
    production: contractBundle.production,
  });
  const q8Full = validateQ8ReceiptBindings({
    receipt: q8FullReceipt.value,
    receiptSnapshot: q8FullReceipt.snapshot,
    holdout,
    holdoutSnapshot: holdoutEvidence.snapshot,
    stagedFiles,
    producer,
    production: contractBundle.production,
  });
  const publicProducer = {
    repository: producer.repository,
    commit: producer.commit,
    files: producer.files,
    aggregateSha256: producer.aggregateSha256,
    generator: producer.generator,
  };
  const documents = createPublicationDocuments({
    producer: publicProducer,
    contracts: contractBundle.publicEvidence,
    training: {
      receiptFileSha256: trainingReceipt.snapshot.evidence.sha256,
      receiptSha256: trainingSummary.receiptSha256,
      corpus: trainingSummary.corpus,
      rows: trainingSummary.rows,
      sourceTreeSha256: trainingSummary.source.treeSha256,
      checkpointTreeSha256: modelTreeHash(expectedCheckpointSnapshot),
    },
    derived,
    fp32,
    q8Preview,
    q8Full,
    holdout: {
      corpusHash: holdout.corpusHash,
      fileSha256: holdoutEvidence.snapshot.evidence.sha256,
      byteLength: holdoutEvidence.snapshot.bytes.byteLength,
      caseCount: holdout.cases.length,
    },
    privatePathFragments: [paths.checkpoint, paths.stagedModel, ...Object.values(paths.files), paths.output],
  });
  for (const [label, evidence] of [
    ["training receipt", trainingReceipt], ["FP32 results", fp32Results],
    ["FP32 validation report", fp32Report], ["derived lock", derivedLock],
    ["rebuild receipt", rebuildReceipt], ["q8 preview receipt", q8PreviewReceipt],
    ["q8 full receipt", q8FullReceipt], ["sealed holdout", holdoutEvidence],
  ]) await assertFileSnapshotCurrent(evidence.snapshot, label);
  await Promise.all([
    assertDirectorySnapshotCurrent(paths.checkpoint, checkpointSnapshot, "checkpoint"),
    assertDirectorySnapshotCurrent(paths.stagedModel, stagedFiles, "staged q8 model"),
    assertProducerEvidenceCurrent(producer),
  ]);
  return { paths, documents };
}

function encodedDocument(value) {
  return Buffer.from(`${stableJsonStringify(value)}\n`);
}

async function writeExclusiveDocument(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writePublicationDocuments(output, documents) {
  await mkdir(output, { mode: 0o700 });
  const qualityBytes = encodedDocument(documents.qualityReceipt);
  const planBytes = encodedDocument(documents.stagingPlan);
  await Promise.all([
    writeExclusiveDocument(join(output, qualityReceiptFile), qualityBytes),
    writeExclusiveDocument(join(output, stagingPlanFile), planBytes),
  ]);
  const handle = await open(output, fsConstants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
  await verifyPublicationDocuments(output, documents);
}

export async function verifyPublicationDocuments(output, expected) {
  const entries = (await readdir(output, { withFileTypes: true }))
    .sort((left, right) => compareText(left.name, right.name));
  if (!exactCanonical(entries.map((entry) => entry.name), [stagingPlanFile, qualityReceiptFile].sort())
    || entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    fail("publication output closure differs");
  }
  const quality = await readStableFile(join(output, qualityReceiptFile), "quality receipt");
  const plan = await readStableFile(join(output, stagingPlanFile), "staging plan");
  const expectedQualityBytes = encodedDocument(expected.qualityReceipt);
  const expectedPlanBytes = encodedDocument(expected.stagingPlan);
  if (!quality.bytes.equals(expectedQualityBytes) || !plan.bytes.equals(expectedPlanBytes)) {
    fail("publication output bytes differ from recomputed evidence");
  }
  const parsedQuality = parseJsonStrict(quality.bytes, "quality receipt");
  const parsedPlan = parseJsonStrict(plan.bytes, "staging plan");
  if (!exactCanonical(parsedQuality, expected.qualityReceipt)
    || !exactCanonical(parsedPlan, expected.stagingPlan)
    || parsedQuality.modelAdmitted !== false || parsedQuality.displayAuthorized !== false
    || parsedPlan.modelAdmitted !== false || parsedPlan.displayAuthorized !== false) {
    fail("publication output schema, authority, or content differs");
  }
  await assertFileSnapshotCurrent(quality, "quality receipt");
  await assertFileSnapshotCurrent(plan, "staging plan");
  return true;
}

export async function runPublication(options) {
  const build = await collectPublicationBuild(options);
  if (options.mode === "create") await writePublicationDocuments(build.paths.output, build.documents);
  else await verifyPublicationDocuments(build.paths.output, build.documents);
  return deepFreeze({
    mode: options.mode,
    immutableVersion: build.documents.qualityReceipt.immutableVersion,
    immutableTag: build.documents.qualityReceipt.immutableTag,
    qualityReceiptSha256: sha256(encodedDocument(build.documents.qualityReceipt)),
    verified: true,
    modelAdmitted: false,
    displayAuthorized: false,
  });
}

async function main() {
  const options = parsePublicationArguments(process.argv.slice(2));
  if (options === null) {
    process.stderr.write("Usage: publication.mjs <create|verify> --checkpoint <dir> --training-receipt <json> --fp32-results <json> --fp32-report <json> --derived-lock <json> --rebuild-receipt <json> --staged-model <dir> --q8-preview <json> --q8-full <json> --holdout <json> --out <direct-child-of-.narrator-t5-rebuild>\n");
    process.exitCode = 2;
    return;
  }
  try {
    process.stdout.write(`${stableJsonStringify(await runPublication(options))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) await main();
