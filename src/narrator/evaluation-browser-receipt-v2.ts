import { canonicalHash, canonicalStringify } from "../core/canonical";
import { narratorBrowserOrtRuntimeV2 } from "./evaluation-browser-assets-v2";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import {
  isNarratorVerifiedArtifactsV2,
} from "./evaluation-receipts-v2";
import { narratorArtifactsMatchCandidate, type NarratorVerifiedArtifactV1 } from "./evaluation-receipts";
import {
  narratorTransformersJsRuntimeV2,
  type NarratorModelCandidate,
} from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
} from "./protocol";

export interface NarratorBrowserBuildFileEvidenceV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorBrowserObservedBuildV1 {
  readonly sourceFiles: readonly NarratorBrowserBuildFileEvidenceV1[];
  readonly sourceAggregateSha256: string;
  readonly packageLock: NarratorBrowserBuildFileEvidenceV1;
  readonly bundleFiles: readonly NarratorBrowserBuildFileEvidenceV1[];
  readonly bundleAggregateSha256: string;
}

export interface NarratorBrowserAdapterBuildReceiptV1 {
  readonly schemaVersion: 1;
  readonly receiptId: "the-grind-2:narrator-browser-adapter-build:v1";
  readonly sourceCommit: string;
  readonly sourceFiles: readonly NarratorBrowserBuildFileEvidenceV1[];
  readonly sourceAggregateSha256: string;
  readonly packageLock: NarratorBrowserBuildFileEvidenceV1;
  readonly bundleFiles: readonly NarratorBrowserBuildFileEvidenceV1[];
  readonly bundleAggregateSha256: string;
  readonly runtime: {
    readonly transformersPackage: "@huggingface/transformers";
    readonly transformersVersion: "4.2.0";
    readonly transformersIntegrity: string;
    readonly ortPackage: "onnxruntime-web";
    readonly ortVersion: "1.26.0-dev.20260416-b7804b056c";
    readonly ortIntegrity: string;
    readonly assets: typeof narratorBrowserOrtRuntimeV2.assets;
  };
  readonly runId: string;
  readonly workerBindingHash: string;
  readonly verifiedModelArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly verifiedRuntimeArtifacts: typeof narratorBrowserOrtRuntimeV2.assets;
  readonly browser: {
    readonly name: "chromium";
    readonly version: string;
  };
  readonly offlineBeforeLoad: true;
  readonly postOfflineRequestCount: 0;
  readonly smoke: {
    readonly outcome: "generated";
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly stopReason: "model-eos" | "maximum-new-tokens";
    readonly modelAdmitted: false;
    readonly displayAuthorized: false;
  };
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

export interface NarratorBrowserRunPackageV1 {
  readonly schemaVersion: 1;
  readonly packageId: "the-grind-2:narrator-b2-run-package:v1";
  readonly sourceCommit: string;
  readonly adapterBuildReceiptHash: string;
  readonly runReceiptHash: string;
  readonly blindSheetHash: string;
  readonly blindKeyHash: string;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly contentHash: string;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;
const contentHashPattern = /^[0-9a-f]{16}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const safePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;

export const narratorBrowserAdapterSourcePathsV1 = Object.freeze([
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/depth/types.ts",
  "src/narrator/blind-evaluation-v2.ts",
  "src/narrator/blind-evaluation.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v2.ts",
  "src/narrator/evaluation-browser-worker-port-v2.ts",
  "src/narrator/evaluation-contract-v2.ts",
  "src/narrator/evaluation-prompt-contract.ts",
  "src/narrator/evaluation-receipts-v2.ts",
  "src/narrator/evaluation-receipts.ts",
  "src/narrator/evaluation-runner-v2.ts",
  "src/narrator/evaluation-runner.ts",
  "src/narrator/evaluation-transformers-adapter-v2.ts",
  "src/narrator/evaluation-worker-protocol-v2.ts",
  "src/narrator/evaluation.ts",
  "src/narrator/model-candidate.ts",
  "src/narrator/model-provenance.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/t5-publication-evidence.ts",
  "src/narrator/t5-rebuild-evidence.ts",
  "tools/narrator-browser-evaluation/check-runtime-assets.mjs",
  "tools/narrator-browser-evaluation/index.html",
  "tools/narrator-browser-evaluation/run.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/harness.ts",
  "tools/narrator-browser-evaluation/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
  "tools/narrator-browser-evaluation/tsconfig.json",
  "tools/narrator-browser-evaluation/vite.config.ts",
  "tsconfig.json",
] as const);

function denseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function fileEvidence(value: unknown): value is NarratorBrowserBuildFileEvidenceV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 300)
    && safePathPattern.test(value.path)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function fileEvidenceList(value: unknown, maximum: number): value is readonly NarratorBrowserBuildFileEvidenceV1[] {
  return denseArray(value)
    && value.length > 0
    && value.length <= maximum
    && value.every(fileEvidence)
    && new Set(value.map((file) => file.path)).size === value.length;
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function validContentHash(value: Record<string, unknown>): boolean {
  if (!contentHashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

function expectedRuntime() {
  return {
    transformersPackage: narratorTransformersJsRuntimeV2.package,
    transformersVersion: narratorTransformersJsRuntimeV2.version,
    transformersIntegrity: narratorTransformersJsRuntimeV2.integrity,
    ortPackage: narratorBrowserOrtRuntimeV2.package,
    ortVersion: narratorBrowserOrtRuntimeV2.version,
    ortIntegrity: narratorBrowserOrtRuntimeV2.integrity,
    assets: narratorBrowserOrtRuntimeV2.assets,
  };
}

function exactWorkerBindingHash(candidate: NarratorModelCandidate, runId: string): string | null {
  try {
    const runSpec = createNarratorEvaluationRunSpecV2(candidate, runId);
    return canonicalHash(createNarratorEvaluationWorkerBindingV2(runSpec, candidate));
  } catch {
    return null;
  }
}

async function browserSha256(bytes: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function canonicalSha256(
  value: unknown,
  sha256: (bytes: ArrayBuffer) => Promise<string>,
): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalStringify(value)).buffer);
}

export function isNarratorBrowserAdapterBuildReceiptV1(
  value: unknown,
  candidate: NarratorModelCandidate,
  expectedSourceCommit: string,
): value is NarratorBrowserAdapterBuildReceiptV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "receiptId", "sourceCommit", "sourceFiles", "sourceAggregateSha256", "packageLock",
      "bundleFiles", "bundleAggregateSha256", "runtime", "runId", "workerBindingHash",
      "verifiedModelArtifacts", "verifiedRuntimeArtifacts", "browser", "offlineBeforeLoad",
      "postOfflineRequestCount", "smoke", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    || value.schemaVersion !== 1
    || value.receiptId !== "the-grind-2:narrator-browser-adapter-build:v1"
    || !commitPattern.test(expectedSourceCommit)
    || value.sourceCommit !== expectedSourceCommit
    || !fileEvidenceList(value.sourceFiles, 64)
    || !sha256Pattern.test(String(value.sourceAggregateSha256))
    || !fileEvidence(value.packageLock)
    || value.packageLock.path !== "package-lock.json"
    || !fileEvidenceList(value.bundleFiles, 16)
    || value.bundleFiles.length !== 4
    || !sha256Pattern.test(String(value.bundleAggregateSha256))
    || !exactCanonical(value.runtime, expectedRuntime())
    || !isNarratorBoundedText(value.runId, 200)
    || value.workerBindingHash !== exactWorkerBindingHash(candidate, String(value.runId))
    || !isNarratorVerifiedArtifactsV2(value.verifiedModelArtifacts)
    || !narratorArtifactsMatchCandidate(value.verifiedModelArtifacts, candidate)
    || !exactCanonical(value.verifiedRuntimeArtifacts, narratorBrowserOrtRuntimeV2.assets)
    || !isNarratorRecord(value.browser)
    || !narratorHasExactKeys(value.browser, ["name", "version"])
    || value.browser.name !== "chromium"
    || !isNarratorBoundedText(value.browser.version, 80)
    || !/^\d+(?:\.\d+){1,3}$/u.test(String(value.browser.version))
    || value.offlineBeforeLoad !== true
    || value.postOfflineRequestCount !== 0
    || !isNarratorRecord(value.smoke)
    || !narratorHasExactKeys(value.smoke, [
      "outcome", "inputTokens", "outputTokens", "stopReason", "modelAdmitted", "displayAuthorized",
    ])
    || value.smoke.outcome !== "generated"
    || !Number.isSafeInteger(value.smoke.inputTokens)
    || Number(value.smoke.inputTokens) < 1
    || Number(value.smoke.inputTokens) > narratorMaximumInputTokens
    || !Number.isSafeInteger(value.smoke.outputTokens)
    || Number(value.smoke.outputTokens) < 1
    || Number(value.smoke.outputTokens) > narratorMaximumOutputTokens
    || !["model-eos", "maximum-new-tokens"].includes(String(value.smoke.stopReason))
    || value.smoke.modelAdmitted !== false
    || value.smoke.displayAuthorized !== false
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || !validContentHash(value)) return false;

  const sourceFiles = value.sourceFiles as readonly NarratorBrowserBuildFileEvidenceV1[];
  const packageLock = sourceFiles.find((file) => file.path === "package-lock.json");
  if (!exactCanonical(packageLock, value.packageLock)) return false;
  const sourcePaths = sourceFiles.map((file) => file.path);
  if (sourcePaths.length !== narratorBrowserAdapterSourcePathsV1.length
    || sourcePaths.some((path, index) => path !== narratorBrowserAdapterSourcePathsV1[index])) return false;

  const bundlePaths = (value.bundleFiles as readonly NarratorBrowserBuildFileEvidenceV1[])
    .map((file) => file.path);
  return bundlePaths.includes("index.html")
    && bundlePaths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && bundlePaths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && bundlePaths.filter((path) => /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length === 1;
}

export async function verifyNarratorBrowserAdapterBuildReceiptV1(
  value: unknown,
  candidate: NarratorModelCandidate,
  expectedSourceCommit: string,
  observedBuild: NarratorBrowserObservedBuildV1,
  sha256: (bytes: ArrayBuffer) => Promise<string> = browserSha256,
): Promise<boolean> {
  if (!isNarratorBrowserAdapterBuildReceiptV1(value, candidate, expectedSourceCommit)) return false;
  try {
    if (!exactCanonical(value.sourceFiles, observedBuild.sourceFiles)
      || value.sourceAggregateSha256 !== observedBuild.sourceAggregateSha256
      || !exactCanonical(value.packageLock, observedBuild.packageLock)
      || !exactCanonical(value.bundleFiles, observedBuild.bundleFiles)
      || value.bundleAggregateSha256 !== observedBuild.bundleAggregateSha256) return false;
    const [sourceAggregate, bundleAggregate] = await Promise.all([
      canonicalSha256(value.sourceFiles, sha256),
      canonicalSha256(value.bundleFiles, sha256),
    ]);
    return value.sourceAggregateSha256 === sourceAggregate
      && value.bundleAggregateSha256 === bundleAggregate;
  } catch {
    return false;
  }
}

export function isNarratorBrowserRunPackageV1(
  value: unknown,
  expected?: {
    readonly sourceCommit: string;
    readonly adapterBuildReceiptHash: string;
    readonly runReceiptHash: string;
    readonly blindSheetHash: string;
    readonly blindKeyHash: string;
  },
): value is NarratorBrowserRunPackageV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "schemaVersion", "packageId", "sourceCommit", "adapterBuildReceiptHash", "runReceiptHash",
      "blindSheetHash", "blindKeyHash", "modelAdmitted", "displayAuthorized", "contentHash",
    ])
    && value.schemaVersion === 1
    && value.packageId === "the-grind-2:narrator-b2-run-package:v1"
    && commitPattern.test(String(value.sourceCommit))
    && (expected === undefined || (value.sourceCommit === expected.sourceCommit
      && value.adapterBuildReceiptHash === expected.adapterBuildReceiptHash
      && value.runReceiptHash === expected.runReceiptHash
      && value.blindSheetHash === expected.blindSheetHash
      && value.blindKeyHash === expected.blindKeyHash))
    && contentHashPattern.test(String(value.adapterBuildReceiptHash))
    && contentHashPattern.test(String(value.runReceiptHash))
    && contentHashPattern.test(String(value.blindSheetHash))
    && contentHashPattern.test(String(value.blindKeyHash))
    && value.modelAdmitted === false
    && value.displayAuthorized === false
    && validContentHash(value);
}

export function createNarratorBrowserRunPackageV1(fields: {
  readonly sourceCommit: string;
  readonly adapterBuildReceiptHash: string;
  readonly runReceiptHash: string;
  readonly blindSheetHash: string;
  readonly blindKeyHash: string;
}): NarratorBrowserRunPackageV1 {
  const content = {
    schemaVersion: 1 as const,
    packageId: "the-grind-2:narrator-b2-run-package:v1" as const,
    ...fields,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
  };
  const runPackage = Object.freeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorBrowserRunPackageV1(runPackage, fields)) {
    throw new TypeError("Narrator browser run package is invalid");
  }
  return runPackage;
}
