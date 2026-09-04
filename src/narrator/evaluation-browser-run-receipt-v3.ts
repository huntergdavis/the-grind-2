import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  isNarratorBlindKeyV3,
  isNarratorBlindRaterSheetV3,
  type NarratorBlindKeyV3,
  type NarratorBlindSheetV3,
} from "./blind-evaluation-v3";
import {
  narratorBrowserOrtRuntimeV2,
  type NarratorBrowserRuntimeArtifactV2,
} from "./evaluation-browser-assets-v2";
import {
  isNarratorBrowserAdapterSmokeReceiptV3,
  narratorBrowserAdapterSmokeContractHashV3,
  narratorBrowserBuildToolchainPackagesV3,
  type NarratorBrowserAdapterSmokeReceiptV3,
  type NarratorBrowserBuildFileEvidenceV3,
  type NarratorBrowserBuildToolchainV3,
  type NarratorBrowserObservedBuildV3,
  type NarratorBrowserSha256V3,
  type NarratorCommittedSourceBlobReaderV3,
} from "./evaluation-browser-receipt-v3";
import type {
  NarratorEvaluationRunSpecV3,
  NarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  narratorBlindStudyContractHashV3,
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationRunnerSequencingContractHashV3,
  narratorEvaluationRunReceiptContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import {
  isNarratorRateabilitySummaryForEvidenceV3,
  narratorRateabilityContractHashV3,
  type NarratorRateabilityBlockerV3,
  type NarratorRateabilitySummaryV3,
} from "./evaluation-rateability-v3";
import {
  isNarratorRunReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import { narratorFormSelectionContractHashV3 } from "./evaluation-selection-contract-v3";
import { narratorTransformersAdapterContractHashV3 } from "./evaluation-transformers-adapter-v3";
import {
  narratorTransformersJsRuntimeV2,
  type NarratorModelCandidate,
} from "./model-candidate";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
} from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export const narratorV3AdapterSmokeSourceCommit = "991d3bb7d677afde9b7939c0ecb01187bb8ba729" as const;
export const narratorV3AdapterSmokeReceiptHash = "735b61107da7d6c4" as const;

export const narratorBrowserFullRunContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-browser-full-run:v3" as const,
  formSelectionContractHash: narratorFormSelectionContractHashV3,
  transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
  evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
  rateabilityContractHash: narratorRateabilityContractHashV3,
  adapterSmokeContractHash: narratorBrowserAdapterSmokeContractHashV3,
  adapterSmokeSourceCommit: narratorV3AdapterSmokeSourceCommit,
  adapterSmokeReceiptHash: narratorV3AdapterSmokeReceiptHash,
  scope: "one-ordered-200-case-isolated-browser-run" as const,
  sourceBinding: "every-executable-source-byte-read-from-the-named-commit" as const,
  buildBinding: "exact-observed-bundle-not-a-reproducible-build-claim" as const,
  toolchainIdentity: "versions-and-package-lock-sri-not-installed-package-byte-attestation" as const,
  execution: "dedicated-worker-client-only-loopback-staging-then-offline-browser-seal" as const,
  evidenceCreation: "exact-observed-host-bundle-after-browser-producer-seal" as const,
  failureEvidence: "network-lifecycle-rateability-and-producer-close-failures-retained-without-repair" as const,
  humanRatingIncluded: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
  productionAuthority: false as const,
});

export const narratorBrowserFullRunContractHashV3 = canonicalHash(
  narratorBrowserFullRunContractV3,
);

export const narratorBrowserFullRunPackageContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-browser-full-run-package:v3" as const,
  browserFullRunContractHash: narratorBrowserFullRunContractHashV3,
  serialization: "JSON-stringify-two-space-indent-one-trailing-LF" as const,
  fileIdentity: "serialized-byte-length-and-SHA-256-plus-structural-content-hash" as const,
  publicSafeFiles: [
    "adapter-run-provenance-receipt.json",
    "rateability-summary.json",
  ] as const,
  privateUntilRatingFiles: [
    "blind-key.json",
    "blind-sheet.json",
    "run-receipt.json",
  ] as const,
  finalization: "same-parent-private-staging-directory-atomically-renamed" as const,
  overwrite: false as const,
  publicReplayableBeforeRating: false as const,
  humanRatingIncluded: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
  productionAuthority: false as const,
});

export const narratorBrowserFullRunPackageContractHashV3 = canonicalHash(
  narratorBrowserFullRunPackageContractV3,
);

export const narratorBrowserFullRunSourcePathsV3 = Object.freeze([
  ".gitignore",
  "docs/narrator/narrator-v3-browser-smoke-receipt.json",
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/depth/types.ts",
  "src/narrator/blind-evaluation-v3.ts",
  "src/narrator/blind-evaluation.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v3.ts",
  "src/narrator/evaluation-browser-run-receipt-v3.ts",
  "src/narrator/evaluation-browser-worker-port-v3.ts",
  "src/narrator/evaluation-contract-v3.ts",
  "src/narrator/evaluation-evidence-contract-v3.ts",
  "src/narrator/evaluation-prompt-contract.ts",
  "src/narrator/evaluation-rateability-v3.ts",
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
  "tools/narrator-browser-evaluation-v3/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
  "tools/narrator-browser-rateability-v3/index.html",
  "tools/narrator-browser-rateability-v3/run-support.mjs",
  "tools/narrator-browser-rateability-v3/run.mjs",
  "tools/narrator-browser-rateability-v3/src/evidence.ts",
  "tools/narrator-browser-rateability-v3/src/harness.ts",
  "tools/narrator-browser-rateability-v3/tsconfig.json",
  "tools/narrator-browser-rateability-v3/vite.config.ts",
  "tools/narrator-browser-rateability-v3/vite.host.config.ts",
  "tsconfig.json",
] as const);

export type NarratorBrowserFullRunNetworkBlockerV3 =
  | "service-workers-not-blocked"
  | "staging-external-network-observed"
  | "offline-not-before-load"
  | "post-offline-network-observed"
  | "worker-producer-seal-not-ok"
  | "page-producer-close-not-ok"
  | "context-producer-close-not-ok"
  | "browser-producer-close-not-ok";

export type NarratorBrowserFullRunBlockerV3 =
  | NarratorRateabilityBlockerV3
  | NarratorBrowserFullRunNetworkBlockerV3;

export interface NarratorBrowserFullRunNetworkV3 {
  readonly serviceWorkers: "block" | "allow";
  readonly stagingExternalRequestCount: number;
  readonly offlineBeforeLoad: boolean;
  readonly postOfflineRequestCount: number;
  readonly workerSealStatus: "completed" | "failed";
  readonly pageCloseStatus: "completed" | "failed";
  readonly contextCloseStatus: "completed" | "failed";
  readonly browserCloseStatus: "completed" | "failed";
  readonly producerSeal: "confirmed";
}

export interface NarratorBrowserFullRunProvenanceReceiptV3 {
  readonly schemaVersion: 3;
  readonly receiptId: "the-grind-2:narrator-browser-full-run:v3";
  readonly fullRunContractHash: string;
  readonly formSelectionContractHash: string;
  readonly transformersAdapterContractHash: string;
  readonly evidenceContractHash: string;
  readonly protocolContractHash: string;
  readonly caseReceiptContractHash: string;
  readonly runReceiptContractHash: string;
  readonly runnerSequencingContractHash: string;
  readonly blindStudyContractHash: string;
  readonly rateabilityContractHash: string;
  readonly adapterSmokeContractHash: string;
  readonly adapterSmokeSourceCommit: string;
  readonly adapterSmokeReceiptHash: string;
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
  readonly workerBinding: NarratorEvaluationWorkerBindingV3 | null;
  readonly workerBindingHash: string | null;
  readonly verifiedModelArtifacts: NarratorRunReceiptV3["verifiedArtifacts"];
  readonly verifiedRuntimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[];
  readonly browser: {
    readonly name: "chromium";
    readonly version: string;
  };
  readonly network: NarratorBrowserFullRunNetworkV3;
  readonly runReceiptHash: string;
  readonly rateabilitySummaryHash: string;
  readonly lifecycle: {
    readonly load: NarratorRunReceiptV3["load"];
    readonly completedRowCount: number;
    readonly dispose: NarratorRunReceiptV3["dispose"];
    readonly termination: NarratorRunReceiptV3["termination"];
  };
  readonly blockers: readonly NarratorBrowserFullRunBlockerV3[];
  readonly disposition: "rateable-for-blind-rating" | "blocked";
  readonly fullCorpusRun: true;
  readonly humanQualityEvaluated: false;
  readonly humanRatingIncluded: false;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly productionAuthority: false;
  readonly contentHash: string;
}

export interface NarratorBrowserFullRunProvenanceFieldsV3 {
  readonly sourceCommit: string;
  readonly observedBuild: NarratorBrowserObservedBuildV3;
  readonly buildToolchain: Omit<NarratorBrowserBuildToolchainV3, "packages">;
  readonly verifiedRuntimeArtifacts: readonly NarratorBrowserRuntimeArtifactV2[];
  readonly browser: NarratorBrowserFullRunProvenanceReceiptV3["browser"];
  readonly network: NarratorBrowserFullRunNetworkV3;
  readonly adapterSmokeReceipt: NarratorBrowserAdapterSmokeReceiptV3;
  readonly runReceipt: NarratorRunReceiptV3;
  readonly rateabilitySummary: NarratorRateabilitySummaryV3;
}

export interface NarratorBrowserFullRunPackageFileV3 {
  readonly name:
    | "adapter-run-provenance-receipt.json"
    | "blind-key.json"
    | "blind-sheet.json"
    | "rateability-summary.json"
    | "run-receipt.json";
  readonly visibility: "public-safe" | "private-until-rating";
  readonly schemaVersion: 3;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorBrowserFullRunPackageV3 {
  readonly schemaVersion: 3;
  readonly packageId: "the-grind-2:narrator-browser-full-run-package:v3";
  readonly packageContractHash: string;
  readonly sourceCommit: string;
  readonly candidateId: string;
  readonly runId: string;
  readonly sheetId: string;
  readonly runSpecHash: string;
  readonly workerBindingHash: string | null;
  readonly adapterSmokeSourceCommit: string;
  readonly adapterSmokeReceiptHash: string;
  readonly contractHashes: {
    readonly formSelection: string;
    readonly transformersAdapter: string;
    readonly workerProtocol: string;
    readonly caseReceipt: string;
    readonly runReceipt: string;
    readonly runnerSequencing: string;
    readonly evidence: string;
    readonly blindStudy: string;
    readonly rateability: string;
    readonly browserFullRun: string;
  };
  readonly files: readonly NarratorBrowserFullRunPackageFileV3[];
  readonly disposition: "rateable-for-blind-rating" | "blocked";
  readonly blockers: readonly NarratorBrowserFullRunBlockerV3[];
  readonly publicReplayableBeforeRating: false;
  readonly humanQualityEvaluated: false;
  readonly humanRatingIncluded: false;
  readonly modelAdmitted: false;
  readonly displayAuthorized: false;
  readonly productionAuthority: false;
  readonly contentHash: string;
}

const sha256Pattern = /^[0-9a-f]{64}$/u;
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

function observedBuildIsValid(value: unknown): value is NarratorBrowserObservedBuildV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "sourceFiles", "sourceAggregateSha256", "packageLock", "bundleFiles", "bundleAggregateSha256",
    ])
    && fileEvidenceList(value.sourceFiles, 128)
    && sha256Pattern.test(String(value.sourceAggregateSha256))
    && fileEvidence(value.packageLock)
    && fileEvidenceList(value.bundleFiles, 16)
    && sha256Pattern.test(String(value.bundleAggregateSha256));
}

function bundleLayoutIsValid(files: readonly NarratorBrowserBuildFileEvidenceV3[]): boolean {
  const paths = files.map((file) => file.path);
  return files.length === 5
    && paths.includes("index.html")
    && paths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && paths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length === 1
    && paths.filter((path) =>
      /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length === 1
    && paths.filter((path) => path === "host/evidence-host.mjs").length === 1;
}

function expectedRuntime(): NarratorBrowserFullRunProvenanceReceiptV3["runtime"] {
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

function networkIsValid(value: unknown): value is NarratorBrowserFullRunNetworkV3 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "serviceWorkers",
      "stagingExternalRequestCount",
      "offlineBeforeLoad",
      "postOfflineRequestCount",
      "workerSealStatus",
      "pageCloseStatus",
      "contextCloseStatus",
      "browserCloseStatus",
      "producerSeal",
    ])
    && (value.serviceWorkers === "block" || value.serviceWorkers === "allow")
    && nonNegativeInteger(value.stagingExternalRequestCount)
    && typeof value.offlineBeforeLoad === "boolean"
    && nonNegativeInteger(value.postOfflineRequestCount)
    && (value.workerSealStatus === "completed" || value.workerSealStatus === "failed")
    && (value.pageCloseStatus === "completed" || value.pageCloseStatus === "failed")
    && (value.contextCloseStatus === "completed" || value.contextCloseStatus === "failed")
    && (value.browserCloseStatus === "completed" || value.browserCloseStatus === "failed")
    && value.producerSeal === "confirmed";
}

function browserIsValid(value: unknown): value is NarratorBrowserFullRunProvenanceReceiptV3["browser"] {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["name", "version"])
    && value.name === "chromium"
    && browserVersionPattern.test(String(value.version));
}

function buildToolchainFieldsAreValid(
  value: NarratorBrowserFullRunProvenanceFieldsV3["buildToolchain"],
): boolean {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["nodeVersion", "npmVersion"])
    && versionPattern.test(String(value.nodeVersion))
    && versionPattern.test(String(value.npmVersion));
}

function networkBlockers(
  network: NarratorBrowserFullRunNetworkV3,
): NarratorBrowserFullRunNetworkBlockerV3[] {
  const blockers: NarratorBrowserFullRunNetworkBlockerV3[] = [];
  if (network.serviceWorkers !== "block") blockers.push("service-workers-not-blocked");
  if (network.stagingExternalRequestCount > 0) blockers.push("staging-external-network-observed");
  if (!network.offlineBeforeLoad) blockers.push("offline-not-before-load");
  if (network.postOfflineRequestCount > 0) blockers.push("post-offline-network-observed");
  if (network.workerSealStatus !== "completed") blockers.push("worker-producer-seal-not-ok");
  if (network.pageCloseStatus !== "completed") blockers.push("page-producer-close-not-ok");
  if (network.contextCloseStatus !== "completed") blockers.push("context-producer-close-not-ok");
  if (network.browserCloseStatus !== "completed") blockers.push("browser-producer-close-not-ok");
  return blockers;
}

export function createNarratorBrowserFullRunProvenanceReceiptV3(
  candidate: NarratorModelCandidate,
  fields: NarratorBrowserFullRunProvenanceFieldsV3,
): NarratorBrowserFullRunProvenanceReceiptV3 {
  const observedBuild = cloneAndFreeze(fields.observedBuild);
  if (!observedBuildIsValid(observedBuild)
    || !bundleLayoutIsValid(observedBuild.bundleFiles)
    || observedBuild.sourceFiles.length !== narratorBrowserFullRunSourcePathsV3.length
    || observedBuild.sourceFiles.some((file, index) =>
      file.path !== narratorBrowserFullRunSourcePathsV3[index])
    || !exactCanonical(
      observedBuild.sourceFiles.find((file) => file.path === "package-lock.json"),
      observedBuild.packageLock,
    )
    || !commitPattern.test(fields.sourceCommit)
    || !buildToolchainFieldsAreValid(fields.buildToolchain)
    || !browserIsValid(fields.browser)
    || !networkIsValid(fields.network)
    || !isNarratorBrowserAdapterSmokeReceiptV3(
      fields.adapterSmokeReceipt,
      candidate,
      narratorV3AdapterSmokeSourceCommit,
    )
    || fields.adapterSmokeReceipt.contentHash !== narratorV3AdapterSmokeReceiptHash
    || !isNarratorRunReceiptV3(fields.runReceipt, candidate)
    || !isNarratorRateabilitySummaryForEvidenceV3(
      fields.rateabilitySummary,
      candidate,
      fields.runReceipt,
    )
    || !exactCanonical(fields.verifiedRuntimeArtifacts, narratorBrowserOrtRuntimeV2.assets)) {
    throw new TypeError("Narrator V3 browser full-run provenance fields are invalid");
  }
  const runReceipt = fields.runReceipt;
  const blockers = Object.freeze<NarratorBrowserFullRunBlockerV3[]>([
    ...fields.rateabilitySummary.blockers,
    ...networkBlockers(fields.network),
  ]);
  const content = {
    schemaVersion: 3 as const,
    receiptId: narratorBrowserFullRunContractV3.contractId,
    fullRunContractHash: narratorBrowserFullRunContractHashV3,
    formSelectionContractHash: narratorFormSelectionContractHashV3,
    transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
    evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
    protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
    caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
    runReceiptContractHash: narratorEvaluationRunReceiptContractHashV3,
    runnerSequencingContractHash: narratorEvaluationRunnerSequencingContractHashV3,
    blindStudyContractHash: narratorBlindStudyContractHashV3,
    rateabilityContractHash: narratorRateabilityContractHashV3,
    adapterSmokeContractHash: narratorBrowserAdapterSmokeContractHashV3,
    adapterSmokeSourceCommit: narratorV3AdapterSmokeSourceCommit,
    adapterSmokeReceiptHash: narratorV3AdapterSmokeReceiptHash,
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
    runSpec: cloneAndFreeze(runReceipt.runSpec),
    workerEpoch: runReceipt.workerEpoch,
    workerBinding: cloneAndFreeze(runReceipt.workerBinding),
    workerBindingHash: runReceipt.workerBindingHash,
    verifiedModelArtifacts: cloneAndFreeze(runReceipt.verifiedArtifacts),
    verifiedRuntimeArtifacts: cloneAndFreeze(fields.verifiedRuntimeArtifacts),
    browser: cloneAndFreeze(fields.browser),
    network: cloneAndFreeze(fields.network),
    runReceiptHash: runReceipt.contentHash,
    rateabilitySummaryHash: fields.rateabilitySummary.contentHash,
    lifecycle: cloneAndFreeze({
      load: runReceipt.load,
      completedRowCount: runReceipt.completedRowCount,
      dispose: runReceipt.dispose,
      termination: runReceipt.termination,
    }),
    blockers,
    disposition: blockers.length === 0
      ? "rateable-for-blind-rating" as const
      : "blocked" as const,
    fullCorpusRun: true as const,
    humanQualityEvaluated: false as const,
    humanRatingIncluded: false as const,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
    productionAuthority: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(
  value: unknown,
  candidate: NarratorModelCandidate,
  fields: NarratorBrowserFullRunProvenanceFieldsV3,
): value is NarratorBrowserFullRunProvenanceReceiptV3 {
  try {
    return canonicalStringify(value)
      === canonicalStringify(createNarratorBrowserFullRunProvenanceReceiptV3(candidate, fields));
  } catch {
    return false;
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

export async function verifyNarratorBrowserFullRunProvenanceReceiptV3(
  value: unknown,
  candidate: NarratorModelCandidate,
  fields: NarratorBrowserFullRunProvenanceFieldsV3,
  readCommittedSourceBlob: NarratorCommittedSourceBlobReaderV3,
  sha256: NarratorBrowserSha256V3 = browserSha256,
): Promise<boolean> {
  if (!isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(value, candidate, fields)) {
    return false;
  }
  try {
    const receipt = value as NarratorBrowserFullRunProvenanceReceiptV3;
    const sourceBlobMatches = await Promise.all(receipt.sourceFiles.map(async (file) => {
      const bytes = normalizedSourceBytes(await readCommittedSourceBlob(receipt.sourceCommit, file.path));
      return bytes.byteLength === file.byteLength && await sha256(bytes) === file.sha256;
    }));
    if (sourceBlobMatches.some((matches) => !matches)) return false;
    const [sourceAggregate, bundleAggregate] = await Promise.all([
      canonicalSha256(receipt.sourceFiles, sha256),
      canonicalSha256(receipt.bundleFiles, sha256),
    ]);
    return receipt.sourceAggregateSha256 === sourceAggregate
      && receipt.bundleAggregateSha256 === bundleAggregate;
  } catch {
    return false;
  }
}

export function serializeNarratorFullRunEvidenceJsonV3(value: unknown): Uint8Array {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new TypeError("Narrator V3 evidence cannot be serialized");
  return new TextEncoder().encode(`${serialized}\n`);
}

interface PackageEvidenceV3 {
  readonly provenanceReceipt: NarratorBrowserFullRunProvenanceReceiptV3;
  readonly runReceipt: NarratorRunReceiptV3;
  readonly rateabilitySummary: NarratorRateabilitySummaryV3;
  readonly blindSheet: NarratorBlindSheetV3;
  readonly blindKey: NarratorBlindKeyV3;
}

async function packageFile(
  name: NarratorBrowserFullRunPackageFileV3["name"],
  visibility: NarratorBrowserFullRunPackageFileV3["visibility"],
  value: { readonly schemaVersion: 3; readonly contentHash: string },
  sha256: NarratorBrowserSha256V3,
): Promise<NarratorBrowserFullRunPackageFileV3> {
  const bytes = serializeNarratorFullRunEvidenceJsonV3(value);
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  const digest = await sha256(normalized.buffer);
  if (!sha256Pattern.test(digest)) {
    throw new TypeError("Narrator V3 evidence SHA-256 is invalid");
  }
  return Object.freeze({
    name,
    visibility,
    schemaVersion: value.schemaVersion,
    contentHash: value.contentHash,
    byteLength: bytes.byteLength,
    sha256: digest,
  });
}

export async function createNarratorBrowserFullRunPackageV3(
  candidate: NarratorModelCandidate,
  adapterSmokeReceipt: NarratorBrowserAdapterSmokeReceiptV3,
  evidence: PackageEvidenceV3,
  sha256: NarratorBrowserSha256V3 = browserSha256,
): Promise<NarratorBrowserFullRunPackageV3> {
  const { provenanceReceipt, runReceipt, rateabilitySummary, blindSheet, blindKey } = evidence;
  const provenanceFields: NarratorBrowserFullRunProvenanceFieldsV3 = {
    sourceCommit: provenanceReceipt.sourceCommit,
    observedBuild: {
      sourceFiles: provenanceReceipt.sourceFiles,
      sourceAggregateSha256: provenanceReceipt.sourceAggregateSha256,
      packageLock: provenanceReceipt.packageLock,
      bundleFiles: provenanceReceipt.bundleFiles,
      bundleAggregateSha256: provenanceReceipt.bundleAggregateSha256,
    },
    buildToolchain: {
      nodeVersion: provenanceReceipt.buildToolchain.nodeVersion,
      npmVersion: provenanceReceipt.buildToolchain.npmVersion,
    },
    verifiedRuntimeArtifacts: provenanceReceipt.verifiedRuntimeArtifacts,
    browser: provenanceReceipt.browser,
    network: provenanceReceipt.network,
    adapterSmokeReceipt,
    runReceipt,
    rateabilitySummary,
  };
  if (!isNarratorRunReceiptV3(runReceipt, candidate)
    || !isNarratorRateabilitySummaryForEvidenceV3(rateabilitySummary, candidate, runReceipt)
    || !isNarratorBrowserAdapterSmokeReceiptV3(
      adapterSmokeReceipt,
      candidate,
      narratorV3AdapterSmokeSourceCommit,
    )
    || adapterSmokeReceipt.contentHash !== narratorV3AdapterSmokeReceiptHash
    || !isNarratorBlindRaterSheetV3(blindSheet, candidate, runReceipt)
    || !isNarratorBlindKeyV3(blindKey, candidate, runReceipt, blindSheet)
    || !isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(
      provenanceReceipt,
      candidate,
      provenanceFields,
    )
    || provenanceReceipt.adapterSmokeReceiptHash !== adapterSmokeReceipt.contentHash
    || provenanceReceipt.runReceiptHash !== runReceipt.contentHash
    || provenanceReceipt.rateabilitySummaryHash !== rateabilitySummary.contentHash
    || provenanceReceipt.runSpec.contentHash !== runReceipt.runSpec.contentHash
    || provenanceReceipt.workerBindingHash !== runReceipt.workerBindingHash) {
    throw new TypeError("Narrator V3 browser full-run package evidence is invalid");
  }
  const files = await Promise.all([
    packageFile("adapter-run-provenance-receipt.json", "public-safe", provenanceReceipt, sha256),
    packageFile("blind-key.json", "private-until-rating", blindKey, sha256),
    packageFile("blind-sheet.json", "private-until-rating", blindSheet, sha256),
    packageFile("rateability-summary.json", "public-safe", rateabilitySummary, sha256),
    packageFile("run-receipt.json", "private-until-rating", runReceipt, sha256),
  ]);
  const content = {
    schemaVersion: 3 as const,
    packageId: narratorBrowserFullRunPackageContractV3.contractId,
    packageContractHash: narratorBrowserFullRunPackageContractHashV3,
    sourceCommit: provenanceReceipt.sourceCommit,
    candidateId: candidate.candidateId,
    runId: runReceipt.runSpec.runId,
    sheetId: blindSheet.sheetId,
    runSpecHash: runReceipt.runSpec.contentHash,
    workerBindingHash: runReceipt.workerBindingHash,
    adapterSmokeSourceCommit: narratorV3AdapterSmokeSourceCommit,
    adapterSmokeReceiptHash: narratorV3AdapterSmokeReceiptHash,
    contractHashes: {
      formSelection: narratorFormSelectionContractHashV3,
      transformersAdapter: narratorTransformersAdapterContractHashV3,
      workerProtocol: narratorEvaluationWorkerProtocolContractHashV3,
      caseReceipt: narratorEvaluationCaseReceiptContractHashV3,
      runReceipt: narratorEvaluationRunReceiptContractHashV3,
      runnerSequencing: narratorEvaluationRunnerSequencingContractHashV3,
      evidence: narratorEvaluationEvidenceContractHashV3,
      blindStudy: narratorBlindStudyContractHashV3,
      rateability: narratorRateabilityContractHashV3,
      browserFullRun: narratorBrowserFullRunContractHashV3,
    },
    files: Object.freeze(files),
    disposition: provenanceReceipt.disposition,
    blockers: provenanceReceipt.blockers,
    publicReplayableBeforeRating: false as const,
    humanQualityEvaluated: false as const,
    humanRatingIncluded: false as const,
    modelAdmitted: false as const,
    displayAuthorized: false as const,
    productionAuthority: false as const,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export async function isNarratorBrowserFullRunPackageForEvidenceV3(
  value: unknown,
  candidate: NarratorModelCandidate,
  adapterSmokeReceipt: NarratorBrowserAdapterSmokeReceiptV3,
  evidence: PackageEvidenceV3,
  sha256: NarratorBrowserSha256V3 = browserSha256,
): Promise<boolean> {
  try {
    return canonicalStringify(value) === canonicalStringify(
      await createNarratorBrowserFullRunPackageV3(
        candidate,
        adapterSmokeReceipt,
        evidence,
        sha256,
      ),
    );
  } catch {
    return false;
  }
}
