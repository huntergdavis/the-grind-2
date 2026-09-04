import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  narratorBrowserOrtRuntimeV2,
  type NarratorBrowserRuntimeArtifactV2,
} from "./evaluation-browser-assets-v2";
import {
  createNarratorEvaluationWorkerBindingV3,
  isNarratorEvaluationRunSpecV3,
  isNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
  type NarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import {
  isNarratorVerifiedArtifactsV1,
  narratorArtifactsMatchCandidate,
  type NarratorVerifiedArtifactV1,
} from "./evaluation-receipts";
import {
  isNarratorCaseReceiptV3,
  type NarratorSuccessfulCaseReceiptV3,
} from "./evaluation-receipts-v3";
import { narratorFormSelectionContractHashV3 } from "./evaluation-selection-contract-v3";
import { narratorTransformersAdapterContractHashV3 } from "./evaluation-transformers-adapter-v3";
import {
  narratorTransformersJsRuntimeV2,
  type NarratorModelCandidate,
} from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export const narratorBrowserAdapterSmokeContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-browser-adapter-smoke:v3" as const,
  formSelectionContractHash: narratorFormSelectionContractHashV3,
  transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
  evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
  workerProtocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
  caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
  scope: "one-successful-ordinal-zero-isolated-browser-adapter-smoke" as const,
  sourceBinding: "every-executable-source-byte-read-from-the-named-commit" as const,
  buildBinding: "exact-observed-bundle-not-a-reproducible-build-claim" as const,
  toolchainIdentity: "versions-and-package-lock-sri-not-installed-package-byte-attestation" as const,
  modelClosure: "exact-six-candidate-artifacts" as const,
  runtimeClosure: "transformers-lockfile-identity-and-exact-two-ort-asset-bytes" as const,
  networkBoundary: "offline-before-load-and-inference-with-zero-post-offline-requests" as const,
  workerAuthority: "validated-raw-tokenizer-generation-and-score-observations-only" as const,
  hostAuthority: "frozen-selection-validation-and-deterministic-safe-rendering-only" as const,
  fullCorpusRun: false as const,
  humanRatingIncluded: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
  productionAuthority: false as const,
});

export const narratorBrowserAdapterSmokeContractHashV3 = canonicalHash(
  narratorBrowserAdapterSmokeContractV3,
);

export const narratorBrowserBuildToolchainPackagesV3 = deepFreeze({
  vite: {
    package: "vite" as const,
    version: "8.2.2" as const,
    integrity: "sha512-cFKLV/PRgAUlIRm5WjMjJ86jrftzpqcgH+Us+DS8mI3CDNiH30Whrz8uHL3+MOLPAgqbMBAqWdAHAphOAM+z/Q==" as const,
  },
  typescript: {
    package: "typescript" as const,
    version: "7.0.2" as const,
    integrity: "sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==" as const,
  },
  playwright: {
    package: "@playwright/test" as const,
    version: "1.62.1" as const,
    integrity: "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==" as const,
  },
});

export const narratorBrowserAdapterSmokeSourcePathsV3 = Object.freeze([
  ".gitignore",
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/depth/types.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v3.ts",
  "src/narrator/evaluation-browser-worker-port-v3.ts",
  "src/narrator/evaluation-contract-v3.ts",
  "src/narrator/evaluation-evidence-contract-v3.ts",
  "src/narrator/evaluation-prompt-contract.ts",
  "src/narrator/evaluation-receipts-v3.ts",
  "src/narrator/evaluation-receipts.ts",
  "src/narrator/evaluation-runner-v3.ts",
  "src/narrator/evaluation-runner.ts",
  "src/narrator/evaluation-selection-contract-v3.ts",
  "src/narrator/evaluation-transformers-adapter-v3.ts",
  "src/narrator/evaluation-worker-protocol-v3.ts",
  "src/narrator/evaluation.ts",
  "src/narrator/model-candidate.ts",
  "src/narrator/model-provenance.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/t5-publication-evidence.ts",
  "src/narrator/t5-rebuild-evidence.ts",
  "tools/narrator-browser-evaluation-v3/index.html",
  "tools/narrator-browser-evaluation-v3/run-support.mjs",
  "tools/narrator-browser-evaluation-v3/run.mjs",
  "tools/narrator-browser-evaluation-v3/src/harness.ts",
  "tools/narrator-browser-evaluation-v3/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation-v3/tsconfig.json",
  "tools/narrator-browser-evaluation-v3/vite.config.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
  "tsconfig.json",
] as const);

export interface NarratorBrowserBuildFileEvidenceV3 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorBrowserObservedBuildV3 {
  readonly sourceFiles: readonly NarratorBrowserBuildFileEvidenceV3[];
  readonly sourceAggregateSha256: string;
  readonly packageLock: NarratorBrowserBuildFileEvidenceV3;
  readonly bundleFiles: readonly NarratorBrowserBuildFileEvidenceV3[];
  readonly bundleAggregateSha256: string;
}

export interface NarratorBrowserBuildToolchainV3 {
  readonly nodeVersion: string;
  readonly npmVersion: string;
  readonly packages: typeof narratorBrowserBuildToolchainPackagesV3;
}

export interface NarratorBrowserAdapterSmokeReceiptV3 {
  readonly schemaVersion: 3;
  readonly receiptId: "the-grind-2:narrator-browser-adapter-smoke:v3";
  readonly smokeContractHash: string;
  readonly formSelectionContractHash: string;
  readonly transformersAdapterContractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly caseReceiptContractHash: string;
  readonly sourceCommit: string;
  readonly sourceFiles: readonly NarratorBrowserBuildFileEvidenceV3[];
  readonly sourceAggregateSha256: string;
  readonly packageLock: NarratorBrowserBuildFileEvidenceV3;
  readonly buildToolchain: NarratorBrowserBuildToolchainV3;
  readonly bundleFiles: readonly NarratorBrowserBuildFileEvidenceV3[];
  readonly bundleAggregateSha256: string;
  readonly runtime: {
    readonly transformersPackage: "@huggingface/transformers";
    readonly transformersVersion: string;
    readonly transformersIntegrity: string;
    readonly ortPackage: "onnxruntime-web";
    readonly ortVersion: string;
    readonly ortIntegrity: string;
    readonly assets: typeof narratorBrowserOrtRuntimeV2.assets;
  };
  readonly runSpec: NarratorEvaluationRunSpecV3;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV3;
  readonly workerBindingHash: string;
  readonly verifiedModelArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly verifiedRuntimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[];
  readonly browser: {
    readonly name: "chromium";
    readonly version: string;
  };
  readonly network: {
    readonly serviceWorkers: "block";
    readonly stagingExternalRequestCount: 0;
    readonly offlineBeforeLoad: true;
    readonly postOfflineRequestCount: 0;
  };
  readonly load: {
    readonly stage: "model-load";
    readonly status: "ok";
    readonly latencyMilliseconds: number;
  };
  readonly caseReceipt: NarratorSuccessfulCaseReceiptV3;
  readonly dispose: {
    readonly status: "ok";
    readonly latencyMilliseconds: number;
  };
  readonly fullCorpusRun: false;
  readonly humanRatingIncluded: false;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly productionAuthority: false;
  readonly contentHash: string;
}

export interface NarratorBrowserAdapterSmokeReceiptFieldsV3 {
  readonly sourceCommit: string;
  readonly observedBuild: NarratorBrowserObservedBuildV3;
  readonly buildToolchain: Omit<NarratorBrowserBuildToolchainV3, "packages">;
  readonly runSpec: NarratorEvaluationRunSpecV3;
  readonly workerEpoch: string;
  readonly workerBinding: NarratorEvaluationWorkerBindingV3;
  readonly verifiedModelArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly verifiedRuntimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[];
  readonly browser: NarratorBrowserAdapterSmokeReceiptV3["browser"];
  readonly network: NarratorBrowserAdapterSmokeReceiptV3["network"];
  readonly load: NarratorBrowserAdapterSmokeReceiptV3["load"];
  readonly caseReceipt: NarratorSuccessfulCaseReceiptV3;
  readonly dispose: NarratorBrowserAdapterSmokeReceiptV3["dispose"];
}

export type NarratorCommittedSourceBlobReaderV3 = (
  sourceCommit: string,
  path: string,
) => Promise<ArrayBuffer | Uint8Array>;

export type NarratorBrowserSha256V3 = (bytes: ArrayBuffer) => Promise<string>;

const sha256Pattern = /^[0-9a-f]{64}$/u;
const contentHashPattern = /^[0-9a-f]{16}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const browserVersionPattern = /^\d+(?:\.\d+){1,3}$/u;
const safePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*[\\:?#])[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/u;

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
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
  try {
    const { contentHash, ...content } = value;
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function fileEvidence(value: unknown): value is NarratorBrowserBuildFileEvidenceV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 300)
    && safePathPattern.test(value.path)
    && Number.isSafeInteger(value.byteLength)
    && Number(value.byteLength) > 0
    && sha256Pattern.test(String(value.sha256));
}

function fileEvidenceList(
  value: unknown,
  maximum: number,
): value is readonly NarratorBrowserBuildFileEvidenceV3[] {
  return isDenseArray(value)
    && value.length > 0
    && value.length <= maximum
    && value.every(fileEvidence)
    && new Set(value.map((file) => file.path)).size === value.length
    && value.every((file, index) => index === 0 || value[index - 1]!.path < file.path);
}

function expectedRuntime(): NarratorBrowserAdapterSmokeReceiptV3["runtime"] {
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

function expectedModelArtifacts(candidate: NarratorModelCandidate): readonly NarratorVerifiedArtifactV1[] {
  return candidate.artifacts
    .map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function bundleLayoutIsValid(files: readonly NarratorBrowserBuildFileEvidenceV3[]): boolean {
  const paths = files.map((file) => file.path);
  return files.length === 4
    && paths.includes("index.html")
    && paths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && paths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && paths.filter((path) => /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length === 1;
}

function observedBuildIsValid(value: unknown): value is NarratorBrowserObservedBuildV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "sourceFiles", "sourceAggregateSha256", "packageLock", "bundleFiles", "bundleAggregateSha256",
    ])
    && fileEvidenceList(value.sourceFiles, 96)
    && sha256Pattern.test(String(value.sourceAggregateSha256))
    && fileEvidence(value.packageLock)
    && fileEvidenceList(value.bundleFiles, 16)
    && sha256Pattern.test(String(value.bundleAggregateSha256));
}

function buildToolchainIsValid(value: unknown): value is NarratorBrowserBuildToolchainV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["nodeVersion", "npmVersion", "packages"])
    && versionPattern.test(String(value.nodeVersion))
    && versionPattern.test(String(value.npmVersion))
    && exactCanonical(value.packages, narratorBrowserBuildToolchainPackagesV3);
}

function structuralReceiptIsValid(
  value: Record<string, unknown>,
  candidate: NarratorModelCandidate,
  expectedSourceCommit: string,
): value is Record<string, unknown> & NarratorBrowserAdapterSmokeReceiptV3 {
  if (!narratorHasExactKeys(value, [
    "schemaVersion", "receiptId", "smokeContractHash", "formSelectionContractHash", "transformersAdapterContractHash",
    "evidenceContractHash", "protocolContractHash", "caseReceiptContractHash", "sourceCommit", "sourceFiles", "sourceAggregateSha256",
    "packageLock", "buildToolchain", "bundleFiles", "bundleAggregateSha256", "runtime", "runSpec",
    "workerEpoch", "workerBinding", "workerBindingHash", "verifiedModelArtifacts", "verifiedRuntimeArtifacts",
    "browser", "network", "load", "caseReceipt", "dispose", "fullCorpusRun", "humanRatingIncluded",
    "modelAdmitted", "displayAuthorized", "productionAuthority", "contentHash",
  ])
    || value.schemaVersion !== 3
    || value.receiptId !== narratorBrowserAdapterSmokeContractV3.contractId
    || value.smokeContractHash !== narratorBrowserAdapterSmokeContractHashV3
    || value.formSelectionContractHash !== narratorFormSelectionContractHashV3
    || value.transformersAdapterContractHash !== narratorTransformersAdapterContractHashV3
    || value.evidenceContractHash !== narratorEvaluationEvidenceContractHashV3
    || value.protocolContractHash !== narratorEvaluationWorkerProtocolContractHashV3
    || value.caseReceiptContractHash !== narratorEvaluationCaseReceiptContractHashV3
    || !commitPattern.test(expectedSourceCommit)
    || value.sourceCommit !== expectedSourceCommit
    || !fileEvidenceList(value.sourceFiles, 96)
    || !sha256Pattern.test(String(value.sourceAggregateSha256))
    || !fileEvidence(value.packageLock)
    || value.packageLock.path !== "package-lock.json"
    || !buildToolchainIsValid(value.buildToolchain)
    || !fileEvidenceList(value.bundleFiles, 16)
    || !bundleLayoutIsValid(value.bundleFiles)
    || !sha256Pattern.test(String(value.bundleAggregateSha256))
    || !exactCanonical(value.runtime, expectedRuntime())
    || !isNarratorEvaluationRunSpecV3(value.runSpec, candidate)
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !isNarratorEvaluationWorkerBindingV3(value.workerBinding, value.runSpec, candidate)
    || value.workerBindingHash !== canonicalHash(value.workerBinding)
    || !isNarratorVerifiedArtifactsV1(value.verifiedModelArtifacts)
    || !narratorArtifactsMatchCandidate(value.verifiedModelArtifacts, candidate)
    || !exactCanonical(value.verifiedModelArtifacts, expectedModelArtifacts(candidate))
    || !exactCanonical(value.verifiedRuntimeArtifacts, narratorBrowserOrtRuntimeV2.assets)
    || !isNarratorRecord(value.browser)
    || !narratorHasExactKeys(value.browser, ["name", "version"])
    || value.browser.name !== "chromium"
    || !browserVersionPattern.test(String(value.browser.version))
    || !isNarratorRecord(value.network)
    || !narratorHasExactKeys(value.network, [
      "serviceWorkers", "stagingExternalRequestCount", "offlineBeforeLoad", "postOfflineRequestCount",
    ])
    || value.network.serviceWorkers !== "block"
    || value.network.stagingExternalRequestCount !== 0
    || value.network.offlineBeforeLoad !== true
    || value.network.postOfflineRequestCount !== 0
    || !isNarratorRecord(value.load)
    || !narratorHasExactKeys(value.load, ["stage", "status", "latencyMilliseconds"])
    || value.load.stage !== "model-load"
    || value.load.status !== "ok"
    || !nonNegativeInteger(value.load.latencyMilliseconds)
    || !isNarratorRecord(value.dispose)
    || !narratorHasExactKeys(value.dispose, ["status", "latencyMilliseconds"])
    || value.dispose.status !== "ok"
    || !nonNegativeInteger(value.dispose.latencyMilliseconds)
    || value.fullCorpusRun !== false
    || value.humanRatingIncluded !== false
    || value.modelAdmitted !== false
    || value.displayAuthorized !== false
    || value.productionAuthority !== false
    || !validContentHash(value)) return false;

  const sourceFiles = value.sourceFiles;
  if (sourceFiles.length !== narratorBrowserAdapterSmokeSourcePathsV3.length
    || sourceFiles.some((file, index) => file.path !== narratorBrowserAdapterSmokeSourcePathsV3[index])) return false;
  const packageLock = sourceFiles.find((file) => file.path === "package-lock.json");
  if (!exactCanonical(packageLock, value.packageLock)) return false;

  const runSpec = value.runSpec;
  const workerBinding = value.workerBinding;
  if (workerBinding.runId !== runSpec.runId
    || workerBinding.runSpecHash !== runSpec.contentHash
    || value.workerBindingHash !== canonicalHash(createNarratorEvaluationWorkerBindingV3(runSpec, candidate))) return false;

  if (!isNarratorCaseReceiptV3(value.caseReceipt, runSpec, candidate, 0, null, null)
    || value.caseReceipt.status !== "ok"
    || value.caseReceipt.ordinal !== 0
    || value.caseReceipt.request.workerEpoch !== value.workerEpoch
    || value.caseReceipt.request.workerBindingHash !== value.workerBindingHash
    || value.caseReceipt.workerBindingHash !== value.workerBindingHash
    || value.caseReceipt.response.outcome !== "selected"
    || value.caseReceipt.selection === null
    || value.caseReceipt.selectedFormId === null
    || value.caseReceipt.renderedText === null
    || value.caseReceipt.safetyAccepted !== true) return false;
  return true;
}

export function isNarratorBrowserAdapterSmokeReceiptV3(
  value: unknown,
  candidate: NarratorModelCandidate,
  expectedSourceCommit: string,
): value is NarratorBrowserAdapterSmokeReceiptV3 {
  return isNarratorRecord(value) && structuralReceiptIsValid(value, candidate, expectedSourceCommit);
}

export function createNarratorBrowserAdapterSmokeReceiptV3(
  candidate: NarratorModelCandidate,
  fields: NarratorBrowserAdapterSmokeReceiptFieldsV3,
): NarratorBrowserAdapterSmokeReceiptV3 {
  const observedBuild = cloneAndFreeze(fields.observedBuild);
  if (!observedBuildIsValid(observedBuild)) {
    throw new TypeError("Narrator V3 browser observed build is invalid");
  }
  const content = {
    schemaVersion: 3 as const,
    receiptId: narratorBrowserAdapterSmokeContractV3.contractId,
    smokeContractHash: narratorBrowserAdapterSmokeContractHashV3,
    formSelectionContractHash: narratorFormSelectionContractHashV3,
    transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
    sourceCommit: fields.sourceCommit,
    sourceFiles: observedBuild.sourceFiles,
    sourceAggregateSha256: observedBuild.sourceAggregateSha256,
    packageLock: observedBuild.packageLock,
    buildToolchain: cloneAndFreeze({
      ...fields.buildToolchain,
      packages: narratorBrowserBuildToolchainPackagesV3,
    }),
    bundleFiles: observedBuild.bundleFiles,
    bundleAggregateSha256: observedBuild.bundleAggregateSha256,
    runtime: cloneAndFreeze(expectedRuntime()),
    runSpec: cloneAndFreeze(fields.runSpec),
    workerEpoch: fields.workerEpoch,
    workerBinding: cloneAndFreeze(fields.workerBinding),
    workerBindingHash: canonicalHash(fields.workerBinding),
    verifiedModelArtifacts: cloneAndFreeze(fields.verifiedModelArtifacts),
    verifiedRuntimeArtifacts: cloneAndFreeze(fields.verifiedRuntimeArtifacts),
    browser: cloneAndFreeze(fields.browser),
    network: cloneAndFreeze(fields.network),
    load: cloneAndFreeze(fields.load),
    caseReceipt: cloneAndFreeze(fields.caseReceipt),
    dispose: cloneAndFreeze(fields.dispose),
    fullCorpusRun: false as const,
    humanRatingIncluded: false as const,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
    productionAuthority: false as const,
  };
  const receipt = deepFreeze({ ...content, contentHash: canonicalHash(content) });
  if (!isNarratorBrowserAdapterSmokeReceiptV3(receipt, candidate, fields.sourceCommit)) {
    throw new TypeError("Narrator V3 browser adapter smoke receipt fields are invalid");
  }
  return receipt;
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
  sha256: NarratorBrowserSha256V3,
): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalStringify(value)).buffer);
}

function normalizedSourceBytes(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export async function verifyNarratorBrowserAdapterSmokeReceiptV3(
  value: unknown,
  candidate: NarratorModelCandidate,
  expectedSourceCommit: string,
  observedBuild: NarratorBrowserObservedBuildV3,
  readCommittedSourceBlob: NarratorCommittedSourceBlobReaderV3,
  sha256: NarratorBrowserSha256V3 = browserSha256,
): Promise<boolean> {
  if (!isNarratorBrowserAdapterSmokeReceiptV3(value, candidate, expectedSourceCommit)
    || !observedBuildIsValid(observedBuild)) return false;
  try {
    if (!exactCanonical(value.sourceFiles, observedBuild.sourceFiles)
      || value.sourceAggregateSha256 !== observedBuild.sourceAggregateSha256
      || !exactCanonical(value.packageLock, observedBuild.packageLock)
      || !exactCanonical(value.bundleFiles, observedBuild.bundleFiles)
      || value.bundleAggregateSha256 !== observedBuild.bundleAggregateSha256) return false;

    const sourceBlobMatches = await Promise.all(value.sourceFiles.map(async (file) => {
      const bytes = normalizedSourceBytes(await readCommittedSourceBlob(value.sourceCommit, file.path));
      return bytes.byteLength === file.byteLength && await sha256(bytes) === file.sha256;
    }));
    if (sourceBlobMatches.some((matches) => !matches)) return false;

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
