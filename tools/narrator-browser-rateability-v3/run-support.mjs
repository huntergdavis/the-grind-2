import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { constants as filesystemConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(toolRoot, "../..");
const contentHashPattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const stagingPrefix = ".narrator-browser-rateability-v3-staging-";
const attemptVaultPrefix = ".narrator-browser-rateability-v3-attempt-";
const outputReservationPrefix = ".narrator-browser-rateability-v3-output-";
const outputBasenamePattern = /^[a-z0-9][a-z0-9._-]{0,254}$/u;
const attemptVaultStates = new WeakMap();
const readyAttemptAdmissions = new WeakMap();
const activeAttemptAdmissions = new WeakMap();
const attemptAdmissionContext = new AsyncLocalStorage();

const frozenContractBindings = Object.freeze({
  provenanceReceiptId: "the-grind-2:narrator-browser-full-run:v3",
  rateabilitySummaryId: "the-grind-2:narrator-rateability-summary:v3",
  packageId: "the-grind-2:narrator-browser-full-run-package:v3",
  packageContractHash: "83ef1decba2f3648",
  adapterSmokeContractHash: "257c2c732215bbda",
  adapterSmokeSourceCommit: "991d3bb7d677afde9b7939c0ecb01187bb8ba729",
  adapterSmokeReceiptHash: "735b61107da7d6c4",
  contractHashes: Object.freeze({
    formSelection: "0b1631e866f3eeae",
    transformersAdapter: "9d7173899bcc88ae",
    workerProtocol: "62b779c32a027d62",
    caseReceipt: "6afa352de72d9279",
    runReceipt: "fae6f5c1cd8b3369",
    runnerSequencing: "2052bef2cf222bf4",
    evidence: "75e944457b23282d",
    blindStudy: "5e3f7a0e9231a018",
    rateability: "d1bf44588e38a020",
    browserFullRun: "13d5796c19323d97",
  }),
});

const frozenBuildToolchainPackages = Object.freeze({
  vite: Object.freeze({
    package: "vite",
    version: "8.2.2",
    integrity: "sha512-cFKLV/PRgAUlIRm5WjMjJ86jrftzpqcgH+Us+DS8mI3CDNiH30Whrz8uHL3+MOLPAgqbMBAqWdAHAphOAM+z/Q==",
  }),
  typescript: Object.freeze({
    package: "typescript",
    version: "7.0.2",
    integrity: "sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==",
  }),
  playwright: Object.freeze({
    package: "@playwright/test",
    version: "1.62.1",
    integrity: "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==",
  }),
});

const packageFileNames = Object.freeze([
  "adapter-run-provenance-receipt.json",
  "blind-key.json",
  "blind-sheet.json",
  "rateability-summary.json",
  "run-receipt.json",
]);

export const narratorBrowserRateabilityEvidenceFileNamesV3 = Object.freeze([
  ...packageFileNames,
  "run-package.json",
]);

const evidencePrerequisites = Object.freeze([
  "nrv3.evidence.content-hashes",
  "nrv3.evidence.schemas",
]);
const expectedEvidencePrerequisites = Object.freeze([
  "nrv3.expected-bindings.schema",
  ...evidencePrerequisites,
]);

export const narratorBrowserRateabilityEvidencePredicateContractV3 = Object.freeze([
  Object.freeze({ id: "nrv3.expected-bindings.schema", prerequisites: Object.freeze([]) }),
  Object.freeze({ id: "nrv3.evidence.content-hashes", prerequisites: Object.freeze([]) }),
  Object.freeze({ id: "nrv3.evidence.schemas", prerequisites: Object.freeze([]) }),
  Object.freeze({ id: "nrv3.contracts.frozen", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.authority.denied", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.links.evidence", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.commitments.run", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.disposition.blockers", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.source-build", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.browser-network", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.candidate-artifacts", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.runtime", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.run", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.adapter-smoke", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.expected.blockers", prerequisites: expectedEvidencePrerequisites }),
  Object.freeze({ id: "nrv3.contracts.graph", prerequisites: evidencePrerequisites }),
  Object.freeze({ id: "nrv3.package.files", prerequisites: evidencePrerequisites }),
]);

export const narratorBrowserRateabilityEvidencePredicateIdsV3 = Object.freeze(
  narratorBrowserRateabilityEvidencePredicateContractV3.map(({ id }) => id),
);

const attemptCoreFiles = Object.freeze([
  "10-run-receipt.json",
  "11-rateability-summary.json",
  "12-blind-sheet.json",
  "13-blind-key.json",
]);
const attemptHostFiles = Object.freeze([
  "30-provenance-receipt.json",
  "32-run-package.json",
]);
const attemptVaultFiles = Object.freeze([
  "00-attempt-start.json",
  ...attemptCoreFiles,
  "19-core-preservation.json",
  "20-expected-bindings.json",
  "29-bindings-preservation.json",
  "30-provenance-receipt.json",
  "31-provenance-preservation.json",
  "32-run-package.json",
  "39-host-preservation.json",
  "40-verification-diagnostic.json",
  "90-attempt-terminal.json",
]);
const attemptFinalizationPrefixFiles = Object.freeze(
  attemptVaultFiles.slice(0, attemptVaultFiles.indexOf("40-verification-diagnostic.json")),
);
const attemptFinalEvidenceSources = Object.freeze([
  Object.freeze({
    name: "adapter-run-provenance-receipt.json",
    recordName: "30-provenance-receipt.json",
  }),
  Object.freeze({ name: "blind-key.json", recordName: "13-blind-key.json" }),
  Object.freeze({ name: "blind-sheet.json", recordName: "12-blind-sheet.json" }),
  Object.freeze({
    name: "rateability-summary.json",
    recordName: "11-rateability-summary.json",
  }),
  Object.freeze({ name: "run-receipt.json", recordName: "10-run-receipt.json" }),
  Object.freeze({ name: "run-package.json", recordName: "32-run-package.json" }),
]);

export const narratorBrowserRateabilityAttemptVaultContractV3 = Object.freeze({
  schemaVersion: 1,
  contractId: "the-grind-2:narrator-browser-rateability-attempt-vault:v3",
  identityDomain: "the-grind-2:narrator-browser-rateability-run-id:v3",
  identityFields: Object.freeze(["runId"]),
  identityAlgorithm: "sha256-canonical-json",
  identityScope: "one-canonical-private-output-parent",
  runIdMaximumCodeUnits: 200,
  fileOrder: attemptVaultFiles,
  coreFiles: attemptCoreFiles,
  hostFiles: attemptHostFiles,
  preservationFiles: Object.freeze({
    core: "19-core-preservation.json",
    bindings: "29-bindings-preservation.json",
    provenance: "31-provenance-preservation.json",
    host: "39-host-preservation.json",
  }),
  privateDirectoryMode: 0o700,
  privateFileMode: 0o600,
  publication: "exclusive-hard-link-after-file-sync",
  readback: "no-follow-exact-bytes-and-canonical-json",
  lockLifetime: "before-browser-through-durable-terminal",
  retention: "append-only-never-delete-vault",
});

export const narratorBrowserRateabilityAttemptVaultContractHashV3 =
  canonicalHash(narratorBrowserRateabilityAttemptVaultContractV3);

export const narratorBrowserRateabilityOutputReservationContractV3 = Object.freeze({
  schemaVersion: 1,
  contractId: "the-grind-2:narrator-browser-rateability-output-reservation:v3",
  identityDomain: "the-grind-2:narrator-browser-rateability-output:v3",
  identityFields: Object.freeze(["outputBasename"]),
  identityAlgorithm: "sha256-canonical-json",
  identityScope: "one-canonical-private-output-parent",
  outputBasenameMaximumCodeUnits: 255,
  outputBasenamePattern: "^[a-z0-9][a-z0-9._-]{0,254}$",
  reservedPrefix: ".narrator-browser-rateability-v3-",
  privateFileMode: 0o600,
  retention: "held-and-retained-with-attempt-vault",
});

export const narratorBrowserRateabilityOutputReservationContractHashV3 =
  canonicalHash(narratorBrowserRateabilityOutputReservationContractV3);

const attemptSnapshotFields = Object.freeze([
  "name",
  "schemaVersion",
  "contentHash",
  "byteLength",
  "sha256",
]);
const attemptAuthorityFields = Object.freeze([
  "publicReplayableBeforeRating",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
]);
const attemptPreservationPhases = Object.freeze([
  Object.freeze({
    phase: "core",
    recordName: "19-core-preservation.json",
    inputFiles: attemptCoreFiles,
  }),
  Object.freeze({
    phase: "bindings",
    recordName: "29-bindings-preservation.json",
    inputFiles: Object.freeze(["20-expected-bindings.json"]),
  }),
  Object.freeze({
    phase: "provenance",
    recordName: "31-provenance-preservation.json",
    inputFiles: Object.freeze(["30-provenance-receipt.json"]),
  }),
  Object.freeze({
    phase: "host",
    recordName: "39-host-preservation.json",
    inputFiles: attemptHostFiles,
  }),
]);
const attemptDiagnosticFailureCodes = Object.freeze([
  "destination-reservation-collision",
  "attempt-admission-failed",
  "core-preservation-failed",
  "bindings-preservation-failed",
  "host-construction-failed",
  "provenance-preservation-failed",
  "host-preservation-failed",
  "evidence-verification-failed",
  "evidence-publication-failed",
  "retention-verification-failed",
]);
const attemptFailureLifecycles = Object.freeze([
  Object.freeze({
    failureCode: "destination-reservation-collision",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 0,
    maximumPreservationReceipts: 0,
  }),
  Object.freeze({
    failureCode: "attempt-admission-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 0,
    maximumPreservationReceipts: 0,
  }),
  Object.freeze({
    failureCode: "core-preservation-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 0,
    maximumPreservationReceipts: 0,
  }),
  Object.freeze({
    failureCode: "bindings-preservation-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 1,
    maximumPreservationReceipts: 1,
  }),
  Object.freeze({
    failureCode: "host-construction-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 2,
    maximumPreservationReceipts: 3,
  }),
  Object.freeze({
    failureCode: "provenance-preservation-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 2,
    maximumPreservationReceipts: 2,
  }),
  Object.freeze({
    failureCode: "host-preservation-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 3,
    maximumPreservationReceipts: 3,
  }),
  Object.freeze({
    failureCode: "evidence-verification-failed",
    verificationVerdict: "fail",
    minimumPreservationReceipts: 4,
    maximumPreservationReceipts: 4,
  }),
  Object.freeze({
    failureCode: "evidence-publication-failed",
    verificationVerdict: "pass",
    minimumPreservationReceipts: 4,
    maximumPreservationReceipts: 4,
  }),
  Object.freeze({
    failureCode: "retention-verification-failed",
    verificationVerdict: "not-run",
    minimumPreservationReceipts: 0,
    maximumPreservationReceipts: 4,
  }),
]);
const attemptPhaseFailureFinalizations = Object.freeze([
  Object.freeze({
    failureCode: "core-preservation-failed",
    healthyHighestNames: Object.freeze([
      "00-attempt-start.json",
      "10-run-receipt.json",
      "11-rateability-summary.json",
      "12-blind-sheet.json",
      "13-blind-key.json",
    ]),
    latchedHighestNames: Object.freeze([
      "00-attempt-start.json",
      "10-run-receipt.json",
      "11-rateability-summary.json",
      "12-blind-sheet.json",
      "13-blind-key.json",
      "19-core-preservation.json",
    ]),
  }),
  Object.freeze({
    failureCode: "bindings-preservation-failed",
    healthyHighestNames: Object.freeze([
      "19-core-preservation.json",
      "20-expected-bindings.json",
    ]),
    latchedHighestNames: Object.freeze([
      "19-core-preservation.json",
      "20-expected-bindings.json",
      "29-bindings-preservation.json",
    ]),
  }),
  Object.freeze({
    failureCode: "host-construction-failed",
    healthyHighestNames: Object.freeze([
      "29-bindings-preservation.json",
      "31-provenance-preservation.json",
    ]),
    latchedHighestNames: Object.freeze([
      "31-provenance-preservation.json",
      "32-run-package.json",
    ]),
  }),
  Object.freeze({
    failureCode: "provenance-preservation-failed",
    healthyHighestNames: Object.freeze([
      "29-bindings-preservation.json",
      "30-provenance-receipt.json",
    ]),
    latchedHighestNames: Object.freeze([
      "29-bindings-preservation.json",
      "30-provenance-receipt.json",
      "31-provenance-preservation.json",
    ]),
  }),
  Object.freeze({
    failureCode: "host-preservation-failed",
    healthyHighestNames: Object.freeze(["32-run-package.json"]),
    latchedHighestNames: Object.freeze([
      "32-run-package.json",
      "39-host-preservation.json",
    ]),
  }),
]);
const attemptTerminalStatuses = Object.freeze(["verified", "failed"]);
const attemptVerificationVerdicts = Object.freeze(["not-run", "pass", "fail"]);
const attemptVerifiedDispositions = Object.freeze([
  "rateable-for-blind-rating",
  "blocked",
]);

export const narratorBrowserRateabilityAttemptRecordContractV3 = Object.freeze({
  schemaVersion: 1,
  contractId: "the-grind-2:narrator-browser-rateability-attempt-records:v3",
  snapshotFields: attemptSnapshotFields,
  preservationReceiptId:
    "the-grind-2:narrator-browser-rateability-attempt-preservation:v3",
  preservationPhases: attemptPreservationPhases,
  verificationDiagnosticId:
    "the-grind-2:narrator-browser-rateability-verification-diagnostic:v3",
  diagnosticFailureCodes: attemptDiagnosticFailureCodes,
  failureLifecycles: attemptFailureLifecycles,
  terminalReceiptId: "the-grind-2:narrator-browser-rateability-attempt-terminal:v3",
  terminalStatuses: attemptTerminalStatuses,
  verificationVerdicts: attemptVerificationVerdicts,
  verifiedDispositions: attemptVerifiedDispositions,
  verifiedDispositionSource: "32-run-package.json:disposition",
  authorityFields: attemptAuthorityFields,
  diagnosticPredicateContract: narratorBrowserRateabilityEvidencePredicateContractV3,
});

export const narratorBrowserRateabilityAttemptRecordContractHashV3 =
  canonicalHash(narratorBrowserRateabilityAttemptRecordContractV3);

const expectedVisibility = Object.freeze({
  "adapter-run-provenance-receipt.json": "public-safe",
  "blind-key.json": "private-until-rating",
  "blind-sheet.json": "private-until-rating",
  "rateability-summary.json": "public-safe",
  "run-receipt.json": "private-until-rating",
});

const runPackageKeys = Object.freeze([
  "schemaVersion",
  "packageId",
  "packageContractHash",
  "sourceCommit",
  "candidateId",
  "runId",
  "sheetId",
  "runSpecHash",
  "workerBindingHash",
  "adapterSmokeSourceCommit",
  "adapterSmokeReceiptHash",
  "contractHashes",
  "files",
  "disposition",
  "blockers",
  "publicReplayableBeforeRating",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
  "contentHash",
]);

const packageContractHashKeys = Object.freeze([
  "formSelection",
  "transformersAdapter",
  "workerProtocol",
  "caseReceipt",
  "runReceipt",
  "runnerSequencing",
  "evidence",
  "blindStudy",
  "rateability",
  "browserFullRun",
]);

const expectedBindingKeys = Object.freeze([
  "sourceCommit",
  "observedBuild",
  "buildToolchain",
  "browser",
  "network",
  "candidate",
  "modelArtifacts",
  "runtime",
  "runtimeArtifacts",
  "adapterSmoke",
  "runId",
  "sheetId",
]);

const provenanceReceiptKeys = Object.freeze([
  "schemaVersion",
  "receiptId",
  "fullRunContractHash",
  "formSelectionContractHash",
  "transformersAdapterContractHash",
  "evidenceContractHash",
  "protocolContractHash",
  "caseReceiptContractHash",
  "runReceiptContractHash",
  "runnerSequencingContractHash",
  "blindStudyContractHash",
  "rateabilityContractHash",
  "adapterSmokeContractHash",
  "adapterSmokeSourceCommit",
  "adapterSmokeReceiptHash",
  "sourceCommit",
  "sourceFiles",
  "sourceAggregateSha256",
  "packageLock",
  "buildToolchain",
  "bundleFiles",
  "bundleAggregateSha256",
  "runtime",
  "runSpec",
  "workerEpoch",
  "workerBinding",
  "workerBindingHash",
  "verifiedModelArtifacts",
  "verifiedRuntimeArtifacts",
  "browser",
  "network",
  "runReceiptHash",
  "rateabilitySummaryHash",
  "lifecycle",
  "blockers",
  "disposition",
  "fullCorpusRun",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
  "contentHash",
]);

const runReceiptKeys = Object.freeze([
  "schemaVersion",
  "runReceiptContractHash",
  "evidenceContractHash",
  "protocolContractHash",
  "runnerSequencingContractHash",
  "runSpec",
  "workerEpoch",
  "workerBinding",
  "workerBindingHash",
  "verifiedArtifacts",
  "verifiedArtifactsHash",
  "load",
  "rows",
  "rowsHash",
  "dispose",
  "termination",
  "completedRowCount",
  "modelAdmitted",
  "displayAuthorized",
  "contentHash",
]);

const rateabilitySummaryKeys = Object.freeze([
  "schemaVersion",
  "summaryId",
  "rateabilityContractHash",
  "candidateId",
  "runSpecHash",
  "runReceiptHash",
  "corpusHash",
  "thresholds",
  "caseCount",
  "completedRowCount",
  "statusCounts",
  "validRowCount",
  "invalidRowCount",
  "rateableNonBaselineCount",
  "baselineAutoTieCount",
  "acceptedKnowledgeViolationCount",
  "validityPermille",
  "rateablePermille",
  "p95ValidLatencyMilliseconds",
  "strata",
  "voices",
  "selectedForms",
  "repeatedBurstCount",
  "maximumSelectedFormRun",
  "variableSeedCount",
  "disposition",
  "blockers",
  "humanQualityEvaluated",
  "humanRatingIncluded",
  "modelAdmitted",
  "displayAuthorized",
  "productionAuthority",
  "contentHash",
]);

const blindSheetKeys = Object.freeze([
  "schemaVersion",
  "sheetId",
  "runReceiptHash",
  "runSpecHash",
  "corpusHash",
  "selectionContractHash",
  "evidenceContractHash",
  "blindStudyContractHash",
  "answerKeySaltFingerprint",
  "items",
  "modelAdmitted",
  "displayAuthorized",
  "contentHash",
]);

const blindKeyKeys = Object.freeze([
  "schemaVersion",
  "sheetHash",
  "runReceiptHash",
  "runSpecHash",
  "selectionContractHash",
  "evidenceContractHash",
  "blindStudyContractHash",
  "secretSalt",
  "items",
  "modelAdmitted",
  "displayAuthorized",
  "contentHash",
]);

const rateabilityBlockers = new Set([
  "run-load-not-ok",
  "run-worker-binding-missing",
  "run-incomplete",
  "run-dispose-not-ok",
  "run-termination-requested",
  "valid-rows-below-198",
  "accepted-knowledge-violation",
  "rateable-nonbaseline-rows-below-140",
  "stratum-validity-below-90-percent",
  "stratum-rateable-below-60-percent",
  "voice-rateable-below-65-percent",
  "repeated-form-inside-burst",
  "selected-form-run-above-three",
  "seed-form-variants-below-two",
]);

const defaultFilesystem = Object.freeze({
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length
    && keys.every((key, index) => key === sortedExpected[index]);
}

function hasExactOwnKeys(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function isDenseArray(value) {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function captureDenseArray(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Narrator V3 rateability array is invalid");
  }
  const keys = Object.keys(value);
  const length = value.length;
  if (!Number.isSafeInteger(length)
    || length < 0
    || keys.length !== length
    || !keys.every((key, index) => key === String(index))) {
    throw new TypeError("Narrator V3 rateability array is invalid");
  }
  const captured = [];
  for (let index = 0; index < length; index += 1) {
    captured.push(value[index]);
  }
  return captured;
}

function canonicalStringify(value, ancestors = new Set()) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical evidence numbers must be safe integers");
    return String(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`Unsupported canonical evidence value: ${typeof value}`);
  }
  if (ancestors.has(value)) throw new TypeError("Canonical evidence must be acyclic");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((child) => canonicalStringify(child, ancestors)).join(",")}]`;
    }
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) =>
      `${JSON.stringify(key)}:${canonicalStringify(value[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalHash(value) {
  const source = canonicalStringify(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right ^= code + 0x9e3779b9 + (right << 6) + (right >>> 2);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function hasValidContentHash(value) {
  if (!isRecord(value) || value.schemaVersion !== 3 || !contentHashPattern.test(String(value.contentHash))) {
    return false;
  }
  try {
    const { contentHash, ...content } = value;
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isNarratorBoundedText(value, maximum) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function isNarratorRunId(value) {
  return isNarratorBoundedText(
    value,
    narratorBrowserRateabilityAttemptVaultContractV3.runIdMaximumCodeUnits,
  );
}

export function createNarratorBrowserRateabilityAttemptIdentityV3(runId) {
  if (!isNarratorRunId(runId)) {
    throw new TypeError("Narrator V3 rateability attempt run id is invalid");
  }
  const attemptId = digest(new TextEncoder().encode(canonicalStringify({
    domain: narratorBrowserRateabilityAttemptVaultContractV3.identityDomain,
    runId,
  })));
  return Object.freeze({
    schemaVersion: 1,
    identityDomain: narratorBrowserRateabilityAttemptVaultContractV3.identityDomain,
    runId,
    attemptId,
    vaultName: `${attemptVaultPrefix}${attemptId}`,
    lockName: `${attemptVaultPrefix}${attemptId}.lock`,
  });
}

export function createNarratorBrowserRateabilityOutputReservationV3(outputBasename) {
  if (!isNarratorBoundedText(
    outputBasename,
    narratorBrowserRateabilityOutputReservationContractV3.outputBasenameMaximumCodeUnits,
  )
    || outputBasename === "."
    || outputBasename === ".."
    || !outputBasenamePattern.test(outputBasename)
    || outputBasename.startsWith(
      narratorBrowserRateabilityOutputReservationContractV3.reservedPrefix,
    )
    || basename(outputBasename) !== outputBasename) {
    throw new TypeError("Narrator V3 rateability output reservation name is invalid");
  }
  const reservationId = digest(new TextEncoder().encode(canonicalStringify({
    domain: narratorBrowserRateabilityOutputReservationContractV3.identityDomain,
    outputBasename,
  })));
  return Object.freeze({
    schemaVersion: 1,
    identityDomain: narratorBrowserRateabilityOutputReservationContractV3.identityDomain,
    outputBasename,
    reservationId,
    lockName: `${outputReservationPrefix}${reservationId}.lock`,
  });
}

function deepFreezeJson(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreezeJson(value[key]);
  return Object.freeze(value);
}

function withCanonicalContentHash(content) {
  return deepFreezeJson({ ...content, contentHash: canonicalHash(content) });
}

function hasCanonicalContentHash(value) {
  if (!isRecord(value) || !contentHashPattern.test(String(value.contentHash))) return false;
  try {
    const { contentHash, ...content } = value;
    return contentHash === canonicalHash(content);
  } catch {
    return false;
  }
}

function sameCanonical(left, right) {
  try {
    return canonicalStringify(left) === canonicalStringify(right);
  } catch {
    return false;
  }
}

const attemptPreservationReceiptKeys = Object.freeze([
  "schemaVersion",
  "receiptId",
  "recordContractHash",
  "vaultContractHash",
  "attemptId",
  "phase",
  "files",
  ...attemptAuthorityFields,
  "contentHash",
]);
const attemptVerificationDiagnosticKeys = Object.freeze([
  "schemaVersion",
  "diagnosticId",
  "failureCode",
  "audit",
  "officialDisposition",
  ...attemptAuthorityFields,
  "contentHash",
]);
const attemptTerminalReceiptKeys = Object.freeze([
  "schemaVersion",
  "receiptId",
  "recordContractHash",
  "vaultContractHash",
  "attemptId",
  "terminalStatus",
  "preservationReceipts",
  "verificationDiagnostic",
  "failureCode",
  "verificationVerdict",
  "officialDisposition",
  ...attemptAuthorityFields,
  "contentHash",
]);

function falseAttemptAuthority(value) {
  return attemptAuthorityFields.every((field) => value[field] === false);
}

function captureAttemptHandleProjection(attempt) {
  if (!hasExactKeys(attempt, [
    "schemaVersion",
    "attemptId",
    "vaultContractHash",
  ])) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  const captured = {
    schemaVersion: attempt.schemaVersion,
    attemptId: attempt.attemptId,
    vaultContractHash: attempt.vaultContractHash,
  };
  if (captured.schemaVersion !== 1
    || !sha256Pattern.test(String(captured.attemptId))
    || captured.vaultContractHash
      !== narratorBrowserRateabilityAttemptVaultContractHashV3) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  return Object.freeze(captured);
}

function preservationPhaseForName(name) {
  return attemptPreservationPhases.find(({ recordName }) => recordName === name);
}

function preservationPhaseForId(phase) {
  return attemptPreservationPhases.find((entry) => entry.phase === phase);
}

function validAttemptSourceValue(name, value) {
  if (!isRecord(value)) return false;
  if (name === "20-expected-bindings.json") {
    return !Object.hasOwn(value, "schemaVersion")
      && !Object.hasOwn(value, "contentHash");
  }
  return value.schemaVersion === 3 && hasCanonicalContentHash(value);
}

function validAttemptSnapshotCommitment(value, expectedName, expectedSchemaVersion) {
  return hasExactKeys(value, attemptSnapshotFields)
    && value.name === expectedName
    && value.schemaVersion === expectedSchemaVersion
    && (expectedSchemaVersion === null
      ? value.contentHash === null
      : contentHashPattern.test(String(value.contentHash)))
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
    && sha256Pattern.test(String(value.sha256));
}

function sameAttemptSnapshotCommitment(left, right) {
  return attemptSnapshotFields.every((field) => left?.[field] === right?.[field]);
}

function captureAttemptSnapshot(snapshot, expectedName, valueValidator) {
  if (!hasExactKeys(snapshot, [
    "name",
    "schemaVersion",
    "contentHash",
    "byteLength",
    "sha256",
    "value",
    "copyBytes",
  ])) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  const captured = {
    name: snapshot.name,
    schemaVersion: snapshot.schemaVersion,
    contentHash: snapshot.contentHash,
    byteLength: snapshot.byteLength,
    sha256: snapshot.sha256,
    copyBytes: snapshot.copyBytes,
  };
  if (captured.name !== expectedName
    || typeof captured.copyBytes !== "function"
    || !Number.isSafeInteger(captured.byteLength)
    || captured.byteLength <= 0
    || !sha256Pattern.test(String(captured.sha256))) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }

  let returnedBytes;
  try {
    returnedBytes = captured.copyBytes.call(snapshot);
  } catch {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  if (!(returnedBytes instanceof Uint8Array)
    || returnedBytes.byteLength !== captured.byteLength) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  const bytes = new Uint8Array(returnedBytes.byteLength);
  bytes.set(returnedBytes);
  if (digest(bytes) !== captured.sha256) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  let parsedValue;
  let parsedSerialized;
  try {
    parsedValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    parsedSerialized = serializeNarratorBrowserRateabilityEvidenceJsonV3(parsedValue);
  } catch {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  if (!bytesEqual(bytes, parsedSerialized)
    || !valueValidator(parsedValue)) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }
  const expectedSchemaVersion = Number.isSafeInteger(parsedValue.schemaVersion)
    ? parsedValue.schemaVersion
    : null;
  const expectedContentHash = typeof parsedValue.contentHash === "string"
    ? parsedValue.contentHash
    : null;
  if (captured.schemaVersion !== expectedSchemaVersion
    || captured.contentHash !== expectedContentHash) {
    throw new TypeError("Narrator V3 rateability attempt snapshot is invalid");
  }

  return Object.freeze({
    commitment: deepFreezeJson({
      name: captured.name,
      schemaVersion: captured.schemaVersion,
      contentHash: captured.contentHash,
      byteLength: captured.byteLength,
      sha256: captured.sha256,
    }),
    value: deepFreezeJson(parsedValue),
  });
}

function buildAttemptPreservationReceipt({
  attempt,
  phase,
  records,
}) {
  const definition = preservationPhaseForId(phase);
  let capturedAttempt;
  try {
    capturedAttempt = captureAttemptHandleProjection(attempt);
  } catch {
    throw new TypeError("Narrator V3 rateability preservation receipt is invalid");
  }
  if (definition === undefined
    || !isDenseArray(records)
    || records.length !== definition.inputFiles.length) {
    throw new TypeError("Narrator V3 rateability preservation receipt is invalid");
  }
  let files;
  try {
    files = records.map((record, index) =>
      captureAttemptSnapshot(
        record,
        definition.inputFiles[index],
        (value) => validAttemptSourceValue(definition.inputFiles[index], value),
      ).commitment);
  } catch {
    throw new TypeError("Narrator V3 rateability preservation receipt is invalid");
  }
  return withCanonicalContentHash({
    schemaVersion: 1,
    receiptId: narratorBrowserRateabilityAttemptRecordContractV3.preservationReceiptId,
    recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
    attemptId: capturedAttempt.attemptId,
    phase,
    files,
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
}

export function createNarratorBrowserRateabilityAttemptPreservationReceiptV3(input) {
  try {
    if (!hasExactKeys(input, ["attempt", "phase", "records"])) {
      throw new TypeError("invalid preservation receipt input");
    }
    return buildAttemptPreservationReceipt(input);
  } catch {
    throw new TypeError("Narrator V3 rateability preservation receipt is invalid");
  }
}

function validAttemptPreservationReceipt(value) {
  if (!hasExactKeys(value, attemptPreservationReceiptKeys)
    || value.schemaVersion !== 1
    || value.receiptId
      !== narratorBrowserRateabilityAttemptRecordContractV3.preservationReceiptId
    || value.recordContractHash !== narratorBrowserRateabilityAttemptRecordContractHashV3
    || value.vaultContractHash !== narratorBrowserRateabilityAttemptVaultContractHashV3
    || !sha256Pattern.test(String(value.attemptId))
    || !falseAttemptAuthority(value)
    || !hasCanonicalContentHash(value)) {
    return false;
  }
  const definition = preservationPhaseForId(value.phase);
  return definition !== undefined
    && isDenseArray(value.files)
    && value.files.length === definition.inputFiles.length
    && value.files.every((file, index) => validAttemptSnapshotCommitment(
      file,
      definition.inputFiles[index],
      definition.inputFiles[index] === "20-expected-bindings.json" ? null : 3,
    ));
}

export function isNarratorBrowserRateabilityAttemptPreservationReceiptV3(value) {
  try {
    return validAttemptPreservationReceipt(value);
  } catch {
    return false;
  }
}

function captureSafeEvidenceAudit(audit) {
  const keys = [
    "schemaVersion",
    "auditId",
    "verdict",
    "predicates",
    "failedPredicateIds",
    "notEvaluatedPredicateIds",
  ];
  if (!hasExactKeys(audit, keys)) {
    throw new TypeError("Narrator V3 rateability safe audit is invalid");
  }
  let capturedAudit;
  try {
    capturedAudit = {
      schemaVersion: audit.schemaVersion,
      auditId: audit.auditId,
      verdict: audit.verdict,
      predicates: captureDenseArray(audit.predicates),
      failedPredicateIds: captureDenseArray(audit.failedPredicateIds),
      notEvaluatedPredicateIds: captureDenseArray(audit.notEvaluatedPredicateIds),
    };
  } catch {
    throw new TypeError("Narrator V3 rateability safe audit is invalid");
  }
  if (capturedAudit.schemaVersion !== 1
    || capturedAudit.auditId
      !== "the-grind-2:narrator-browser-rateability-evidence-audit:v3"
    || capturedAudit.predicates.length
      !== narratorBrowserRateabilityEvidencePredicateContractV3.length) {
    throw new TypeError("Narrator V3 rateability safe audit is invalid");
  }

  const predicates = [];
  const statuses = new Map();
  for (let index = 0;
    index < narratorBrowserRateabilityEvidencePredicateContractV3.length;
    index += 1) {
    const definition = narratorBrowserRateabilityEvidencePredicateContractV3[index];
    const sourcePredicate = capturedAudit.predicates[index];
    if (!hasExactKeys(sourcePredicate, ["id", "status", "blockedBy"])) {
      throw new TypeError("Narrator V3 rateability safe audit is invalid");
    }
    let predicate;
    try {
      predicate = {
        id: sourcePredicate.id,
        status: sourcePredicate.status,
        blockedBy: captureDenseArray(sourcePredicate.blockedBy),
      };
    } catch {
      throw new TypeError("Narrator V3 rateability safe audit is invalid");
    }
    if (predicate.id !== definition.id) {
      throw new TypeError("Narrator V3 rateability safe audit is invalid");
    }
    const blockedBy = definition.prerequisites.filter(
      (prerequisite) => statuses.get(prerequisite) !== "pass",
    );
    if (!sameCanonical(predicate.blockedBy, blockedBy)
      || (blockedBy.length > 0
        ? predicate.status !== "not-evaluated"
        : !["pass", "fail"].includes(predicate.status))) {
      throw new TypeError("Narrator V3 rateability safe audit is invalid");
    }
    predicates.push(Object.freeze({
      id: predicate.id,
      status: predicate.status,
      blockedBy: Object.freeze([...blockedBy]),
    }));
    statuses.set(predicate.id, predicate.status);
  }
  const failedPredicateIds = predicates
    .filter(({ status }) => status === "fail")
    .map(({ id }) => id);
  const notEvaluatedPredicateIds = predicates
    .filter(({ status }) => status === "not-evaluated")
    .map(({ id }) => id);
  const verdict = failedPredicateIds.length === 0 && notEvaluatedPredicateIds.length === 0
    ? "pass"
    : "fail";
  if (!sameCanonical(capturedAudit.failedPredicateIds, failedPredicateIds)
    || !sameCanonical(
      capturedAudit.notEvaluatedPredicateIds,
      notEvaluatedPredicateIds,
    )
    || capturedAudit.verdict !== verdict) {
    throw new TypeError("Narrator V3 rateability safe audit is invalid");
  }
  return deepFreezeJson({
    schemaVersion: 1,
    auditId: capturedAudit.auditId,
    verdict,
    predicates,
    failedPredicateIds,
    notEvaluatedPredicateIds,
  });
}

export function projectNarratorBrowserRateabilityEvidenceAuditV3(audit) {
  try {
    return captureSafeEvidenceAudit(audit);
  } catch {
    throw new TypeError("Narrator V3 rateability safe audit is invalid");
  }
}

export function isNarratorBrowserRateabilityEvidenceAuditV3(audit) {
  try {
    captureSafeEvidenceAudit(audit);
    return true;
  } catch {
    return false;
  }
}

function expectedVerificationVerdict(failureCode) {
  if (failureCode === null) return "pass";
  return attemptFailureLifecycles.find((entry) =>
    entry.failureCode === failureCode)?.verificationVerdict;
}

function validDiagnosticInputs(audit, failureCode) {
  if (failureCode !== null
    && !attemptDiagnosticFailureCodes.includes(failureCode)) return false;
  if (failureCode === null) return audit?.verdict === "pass";
  if (failureCode === "evidence-verification-failed") return audit?.verdict === "fail";
  if (failureCode === "evidence-publication-failed") return audit?.verdict === "pass";
  return audit === null;
}

function buildVerificationDiagnostic({
  audit = null,
  failureCode,
}) {
  let safeAudit = null;
  if (audit !== null) {
    try {
      safeAudit = captureSafeEvidenceAudit(audit);
    } catch {
      throw new TypeError("Narrator V3 rateability verification diagnostic is invalid");
    }
  }
  if (!validDiagnosticInputs(safeAudit, failureCode)) {
    throw new TypeError("Narrator V3 rateability verification diagnostic is invalid");
  }
  return withCanonicalContentHash({
    schemaVersion: 1,
    diagnosticId:
      narratorBrowserRateabilityAttemptRecordContractV3.verificationDiagnosticId,
    failureCode,
    audit: safeAudit,
    officialDisposition: null,
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
}

export function createNarratorBrowserRateabilityVerificationDiagnosticV3(input) {
  try {
    if (!hasExactKeys(input, ["audit", "failureCode"])) {
      throw new TypeError("invalid verification diagnostic input");
    }
    return buildVerificationDiagnostic(input);
  } catch {
    throw new TypeError("Narrator V3 rateability verification diagnostic is invalid");
  }
}

function validVerificationDiagnostic(value) {
  if (!hasExactKeys(value, attemptVerificationDiagnosticKeys)
    || value.schemaVersion !== 1
    || value.diagnosticId
      !== narratorBrowserRateabilityAttemptRecordContractV3.verificationDiagnosticId
    || value.officialDisposition !== null
    || !falseAttemptAuthority(value)
    || !hasCanonicalContentHash(value)) {
    return false;
  }
  let audit = null;
  if (value.audit !== null) {
    try {
      audit = captureSafeEvidenceAudit(value.audit);
    } catch {
      return false;
    }
  }
  return validDiagnosticInputs(audit, value.failureCode);
}

export function isNarratorBrowserRateabilityVerificationDiagnosticV3(value) {
  try {
    return validVerificationDiagnostic(value);
  } catch {
    return false;
  }
}

function validPreservationCommitmentPrefix(value) {
  return isDenseArray(value)
    && value.length <= attemptPreservationPhases.length
    && value.every((receipt, index) => validAttemptSnapshotCommitment(
      receipt,
      attemptPreservationPhases[index].recordName,
      1,
    ));
}

function validFailurePreservationPrefix(failureCode, receiptCount) {
  const lifecycle = attemptFailureLifecycles.find((entry) =>
    entry.failureCode === failureCode);
  return lifecycle !== undefined
    && receiptCount >= lifecycle.minimumPreservationReceipts
    && receiptCount <= lifecycle.maximumPreservationReceipts;
}

function preservationHistoryIsConsistent(receipts) {
  if (receipts.length < attemptPreservationPhases.length) return true;
  return sameAttemptSnapshotCommitment(
    receipts[2]?.files?.[0],
    receipts[3]?.files?.[0],
  );
}

function buildAttemptTerminalReceipt({
  attempt,
  preservationReceipts,
  verificationDiagnostic,
  runPackage = null,
}) {
  let capturedAttempt;
  try {
    capturedAttempt = captureAttemptHandleProjection(attempt);
  } catch {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }
  if (!isDenseArray(preservationReceipts)
    || preservationReceipts.length > attemptPreservationPhases.length) {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }
  const preserved = [];
  const preservedValues = [];
  try {
    for (let index = 0; index < preservationReceipts.length; index += 1) {
      const definition = attemptPreservationPhases[index];
      const captured = captureAttemptSnapshot(
        preservationReceipts[index],
        definition.recordName,
        isNarratorBrowserRateabilityAttemptPreservationReceiptV3,
      );
      if (captured.value.phase !== definition.phase
        || captured.value.attemptId !== capturedAttempt.attemptId) {
        throw new TypeError("invalid preservation binding");
      }
      preserved.push(captured.commitment);
      preservedValues.push(captured.value);
    }
  } catch {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }
  if (!preservationHistoryIsConsistent(preservedValues)) {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }

  let capturedRunPackage = null;
  if (preserved.length === attemptPreservationPhases.length) {
    try {
      capturedRunPackage = captureAttemptSnapshot(
        runPackage,
        "32-run-package.json",
        (value) => validAttemptSourceValue("32-run-package.json", value),
      );
    } catch {
      throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
    }
    if (!sameAttemptSnapshotCommitment(
      capturedRunPackage.commitment,
      preservedValues[3].files[1],
    )) {
      throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
    }
  } else if (runPackage !== null) {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }

  let diagnostic;
  try {
    diagnostic = captureAttemptSnapshot(
      verificationDiagnostic,
      "40-verification-diagnostic.json",
      isNarratorBrowserRateabilityVerificationDiagnosticV3,
    );
  } catch {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }
  const failureCode = diagnostic.value.failureCode;
  const verificationVerdict = expectedVerificationVerdict(failureCode);
  const terminalStatus = failureCode === null ? "verified" : "failed";
  let officialDisposition = null;
  if (terminalStatus === "verified") {
    if (preserved.length !== attemptPreservationPhases.length
      || !attemptVerifiedDispositions.includes(capturedRunPackage?.value?.disposition)) {
      throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
    }
    officialDisposition = capturedRunPackage.value.disposition;
  } else if (!validFailurePreservationPrefix(failureCode, preserved.length)) {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }

  return withCanonicalContentHash({
    schemaVersion: 1,
    receiptId: narratorBrowserRateabilityAttemptRecordContractV3.terminalReceiptId,
    recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
    attemptId: capturedAttempt.attemptId,
    terminalStatus,
    preservationReceipts: preserved,
    verificationDiagnostic: diagnostic.commitment,
    failureCode,
    verificationVerdict,
    officialDisposition,
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
}

export function createNarratorBrowserRateabilityAttemptTerminalReceiptV3(input) {
  try {
    if (!hasExactKeys(input, [
      "attempt",
      "preservationReceipts",
      "verificationDiagnostic",
      "runPackage",
    ])) {
      throw new TypeError("invalid terminal receipt input");
    }
    return buildAttemptTerminalReceipt(input);
  } catch {
    throw new TypeError("Narrator V3 rateability attempt terminal receipt is invalid");
  }
}

function validAttemptTerminalReceipt(value) {
  if (!hasExactKeys(value, attemptTerminalReceiptKeys)
    || value.schemaVersion !== 1
    || value.receiptId !== narratorBrowserRateabilityAttemptRecordContractV3.terminalReceiptId
    || value.recordContractHash !== narratorBrowserRateabilityAttemptRecordContractHashV3
    || value.vaultContractHash !== narratorBrowserRateabilityAttemptVaultContractHashV3
    || !sha256Pattern.test(String(value.attemptId))
    || !attemptTerminalStatuses.includes(value.terminalStatus)
    || !attemptVerificationVerdicts.includes(value.verificationVerdict)
    || !validPreservationCommitmentPrefix(value.preservationReceipts)
    || !validAttemptSnapshotCommitment(
      value.verificationDiagnostic,
      "40-verification-diagnostic.json",
      1,
    )
    || (value.failureCode !== null
      && !attemptDiagnosticFailureCodes.includes(value.failureCode))
    || !falseAttemptAuthority(value)
    || !hasCanonicalContentHash(value)
    || value.verificationVerdict !== expectedVerificationVerdict(value.failureCode)) {
    return false;
  }
  if (value.terminalStatus === "verified") {
    return value.failureCode === null
      && value.preservationReceipts.length === attemptPreservationPhases.length
      && attemptVerifiedDispositions.includes(value.officialDisposition);
  }
  return value.failureCode !== null
    && value.officialDisposition === null
    && validFailurePreservationPrefix(
      value.failureCode,
      value.preservationReceipts.length,
    );
}

export function isNarratorBrowserRateabilityAttemptTerminalReceiptV3(value) {
  try {
    return validAttemptTerminalReceipt(value);
  } catch {
    return false;
  }
}

function validFileEvidence(value) {
  return hasExactKeys(value, ["path", "byteLength", "sha256"])
    && typeof value.path === "string"
    && value.path.length > 0
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
    && sha256Pattern.test(String(value.sha256));
}

function validFileEvidenceList(value, maximum) {
  return isDenseArray(value)
    && value.length > 0
    && value.length <= maximum
    && value.every(validFileEvidence)
    && new Set(value.map((entry) => entry.path)).size === value.length
    && value.every((entry, index) => index === 0 || value[index - 1].path < entry.path);
}

function validRuntimeArtifact(value) {
  return hasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && ["runtime-module", "runtime-wasm"].includes(value.role)
    && typeof value.path === "string"
    && value.path.length > 0
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
    && sha256Pattern.test(String(value.sha256));
}

function validCandidateArtifact(value) {
  return hasExactKeys(value, ["path", "role", "byteLength", "sha256"])
    && ["weights", "tokenizer", "configuration"].includes(value.role)
    && typeof value.path === "string"
    && value.path.length > 0
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength > 0
    && sha256Pattern.test(String(value.sha256));
}

function validExpectedCandidate(candidate) {
  return hasExactKeys(candidate, [
    "schemaVersion",
    "candidateId",
    "task",
    "modelFamily",
    "sessions",
    "model",
    "runtime",
    "execution",
    "artifacts",
    "measuredIncrementalMemoryBytes",
  ])
    && candidate.schemaVersion === 2
    && typeof candidate.candidateId === "string"
    && candidate.candidateId.length > 0
    && candidate.task === "single-ambient-line"
    && candidate.modelFamily === "t5"
    && isDenseArray(candidate.sessions)
    && candidate.sessions.length > 0
    && isRecord(candidate.model)
    && isRecord(candidate.runtime)
    && candidate.execution === "wasm"
    && isDenseArray(candidate.artifacts)
    && candidate.artifacts.length > 0
    && candidate.artifacts.every(validCandidateArtifact)
    && (candidate.measuredIncrementalMemoryBytes === null
      || (Number.isSafeInteger(candidate.measuredIncrementalMemoryBytes)
        && candidate.measuredIncrementalMemoryBytes >= 0));
}

function validExpectedBindings(expectedBindings) {
  if (!hasExactKeys(expectedBindings, expectedBindingKeys)
    || !commitPattern.test(String(expectedBindings.sourceCommit))
    || typeof expectedBindings.runId !== "string"
    || expectedBindings.runId.length === 0
    || typeof expectedBindings.sheetId !== "string"
    || expectedBindings.sheetId.length === 0
    || !validExpectedCandidate(expectedBindings.candidate)
    || !hasExactKeys(expectedBindings.observedBuild, [
      "sourceFiles", "sourceAggregateSha256", "packageLock", "bundleFiles", "bundleAggregateSha256",
    ])
    || !validFileEvidenceList(expectedBindings.observedBuild.sourceFiles, 128)
    || !validFileEvidence(expectedBindings.observedBuild.packageLock)
    || !validFileEvidenceList(expectedBindings.observedBuild.bundleFiles, 16)
    || !sha256Pattern.test(String(expectedBindings.observedBuild.sourceAggregateSha256))
    || !sha256Pattern.test(String(expectedBindings.observedBuild.bundleAggregateSha256))
    || !sameCanonical(
      expectedBindings.observedBuild.sourceFiles.find((entry) => entry.path === "package-lock.json"),
      expectedBindings.observedBuild.packageLock,
    )
    || digest(new TextEncoder().encode(canonicalStringify(
      expectedBindings.observedBuild.sourceFiles,
    ))) !== expectedBindings.observedBuild.sourceAggregateSha256
    || digest(new TextEncoder().encode(canonicalStringify(
      expectedBindings.observedBuild.bundleFiles,
    ))) !== expectedBindings.observedBuild.bundleAggregateSha256
    || !hasExactKeys(expectedBindings.buildToolchain, ["nodeVersion", "npmVersion"])
    || typeof expectedBindings.buildToolchain.nodeVersion !== "string"
    || expectedBindings.buildToolchain.nodeVersion.length === 0
    || typeof expectedBindings.buildToolchain.npmVersion !== "string"
    || expectedBindings.buildToolchain.npmVersion.length === 0
    || !hasExactKeys(expectedBindings.browser, ["name", "version"])
    || expectedBindings.browser.name !== "chromium"
    || typeof expectedBindings.browser.version !== "string"
    || expectedBindings.browser.version.length === 0
    || !hasExactKeys(expectedBindings.network, [
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
    || !["block", "allow"].includes(expectedBindings.network.serviceWorkers)
    || !Number.isSafeInteger(expectedBindings.network.stagingExternalRequestCount)
    || expectedBindings.network.stagingExternalRequestCount < 0
    || typeof expectedBindings.network.offlineBeforeLoad !== "boolean"
    || !Number.isSafeInteger(expectedBindings.network.postOfflineRequestCount)
    || expectedBindings.network.postOfflineRequestCount < 0
    || !["completed", "failed"].includes(expectedBindings.network.workerSealStatus)
    || !["completed", "failed"].includes(expectedBindings.network.pageCloseStatus)
    || !["completed", "failed"].includes(expectedBindings.network.contextCloseStatus)
    || !["completed", "failed"].includes(expectedBindings.network.browserCloseStatus)
    || expectedBindings.network.producerSeal !== "confirmed"
    || !isDenseArray(expectedBindings.modelArtifacts)
    || expectedBindings.modelArtifacts.length === 0
    || !expectedBindings.modelArtifacts.every(validFileEvidence)
    || !isDenseArray(expectedBindings.runtimeArtifacts)
    || expectedBindings.runtimeArtifacts.length !== 2
    || !expectedBindings.runtimeArtifacts.every(validRuntimeArtifact)
    || !hasExactKeys(expectedBindings.runtime, [
      "transformersPackage",
      "transformersVersion",
      "transformersIntegrity",
      "ortPackage",
      "ortVersion",
      "ortIntegrity",
      "assets",
    ])
    || expectedBindings.runtime.transformersPackage !== "@huggingface/transformers"
    || expectedBindings.runtime.ortPackage !== "onnxruntime-web"
    || !sameCanonical(expectedBindings.runtime.assets, expectedBindings.runtimeArtifacts)
    || !hasExactKeys(expectedBindings.adapterSmoke, ["sourceCommit", "receiptHash"])
    || expectedBindings.adapterSmoke.sourceCommit !== frozenContractBindings.adapterSmokeSourceCommit
    || expectedBindings.adapterSmoke.receiptHash !== frozenContractBindings.adapterSmokeReceiptHash) {
    return false;
  }

  const candidateArtifacts = expectedBindings.candidate.artifacts.map((artifact) => ({
    path: artifact.path,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
  }));
  return sameCanonical(candidateArtifacts, expectedBindings.modelArtifacts)
    && expectedBindings.runtime.transformersVersion === expectedBindings.candidate.runtime.version
    && expectedBindings.runtime.transformersIntegrity === expectedBindings.candidate.runtime.integrity;
}

function expectedNetworkBlockers(network) {
  const blockers = [];
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

function expectedRunSpecCandidateBinding(expectedBindings) {
  const candidate = expectedBindings.candidate;
  const artifacts = expectedBindings.modelArtifacts
    .map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return {
    candidateId: candidate.candidateId,
    candidateManifestHash: canonicalHash(candidate),
    artifactManifestHash: canonicalHash(artifacts),
    modelRevision: candidate.model.revision,
    sourceRevision: candidate.model.sourceRevision,
    execution: candidate.execution,
    runtimePackage: candidate.runtime.package,
    runtimeVersion: candidate.runtime.version,
    runtimeIntegrity: candidate.runtime.integrity,
  };
}

function expectedSourceBuildBindingsAreValid({
  runPackage,
  provenanceReceipt,
  expectedBindings,
}) {
  const observedBuild = {
    sourceFiles: provenanceReceipt.sourceFiles,
    sourceAggregateSha256: provenanceReceipt.sourceAggregateSha256,
    packageLock: provenanceReceipt.packageLock,
    bundleFiles: provenanceReceipt.bundleFiles,
    bundleAggregateSha256: provenanceReceipt.bundleAggregateSha256,
  };
  const expectedBuildToolchain = {
    ...expectedBindings.buildToolchain,
    packages: frozenBuildToolchainPackages,
  };
  return runPackage.sourceCommit === expectedBindings.sourceCommit
    && provenanceReceipt.sourceCommit === expectedBindings.sourceCommit
    && sameCanonical(observedBuild, expectedBindings.observedBuild)
    && sameCanonical(provenanceReceipt.buildToolchain, expectedBuildToolchain);
}

function expectedBrowserNetworkBindingsAreValid({
  provenanceReceipt,
  expectedBindings,
}) {
  return sameCanonical(provenanceReceipt.browser, expectedBindings.browser)
    && sameCanonical(provenanceReceipt.network, expectedBindings.network);
}

function expectedCandidateArtifactBindingsAreValid({
  runPackage,
  provenanceReceipt,
  rateabilitySummary,
  runReceipt,
  expectedBindings,
}) {
  return sameCanonical(
    runReceipt.runSpec.candidate,
    expectedRunSpecCandidateBinding(expectedBindings),
  )
    && sameCanonical(provenanceReceipt.verifiedModelArtifacts, expectedBindings.modelArtifacts)
    && sameCanonical(runReceipt.verifiedArtifacts, expectedBindings.modelArtifacts)
    && runPackage.candidateId === expectedBindings.candidate.candidateId
    && rateabilitySummary.candidateId === expectedBindings.candidate.candidateId;
}

function expectedRuntimeBindingsAreValid({
  provenanceReceipt,
  expectedBindings,
}) {
  return sameCanonical(provenanceReceipt.runtime, expectedBindings.runtime)
    && sameCanonical(
      provenanceReceipt.verifiedRuntimeArtifacts,
      expectedBindings.runtimeArtifacts,
    );
}

function expectedRunBindingsAreValid({
  runPackage,
  provenanceReceipt,
  blindSheet,
  runReceipt,
  expectedBindings,
}) {
  const runSpec = runReceipt.runSpec;
  const lifecycle = {
    load: runReceipt.load,
    completedRowCount: runReceipt.completedRowCount,
    dispose: runReceipt.dispose,
    termination: runReceipt.termination,
  };
  return sameCanonical(provenanceReceipt.lifecycle, lifecycle)
    && sameCanonical(provenanceReceipt.runSpec, runSpec)
    && provenanceReceipt.workerEpoch === runReceipt.workerEpoch
    && sameCanonical(provenanceReceipt.workerBinding, runReceipt.workerBinding)
    && provenanceReceipt.workerBindingHash === runReceipt.workerBindingHash
    && runPackage.workerBindingHash === runReceipt.workerBindingHash
    && runSpec.runId === expectedBindings.runId
    && runPackage.runId === expectedBindings.runId
    && blindSheet.sheetId === expectedBindings.sheetId
    && runPackage.sheetId === expectedBindings.sheetId;
}

function expectedAdapterBindingsAreValid({
  runPackage,
  provenanceReceipt,
  expectedBindings,
}) {
  return provenanceReceipt.adapterSmokeSourceCommit === expectedBindings.adapterSmoke.sourceCommit
    && runPackage.adapterSmokeSourceCommit === expectedBindings.adapterSmoke.sourceCommit
    && provenanceReceipt.adapterSmokeReceiptHash === expectedBindings.adapterSmoke.receiptHash
    && runPackage.adapterSmokeReceiptHash === expectedBindings.adapterSmoke.receiptHash;
}

function expectedBlockerBindingsAreValid({
  runPackage,
  provenanceReceipt,
  rateabilitySummary,
  expectedBindings,
}) {
  const expectedBlockers = [
    ...rateabilitySummary.blockers,
    ...expectedNetworkBlockers(expectedBindings.network),
  ];
  return sameCanonical(provenanceReceipt.blockers, expectedBlockers)
    && sameCanonical(runPackage.blockers, expectedBlockers);
}

function falseAuthority(value, fields) {
  return isRecord(value) && fields.every((field) => value[field] === false);
}

function validBlockers(value) {
  return isDenseArray(value)
    && value.every((blocker) => typeof blocker === "string" && blocker.length > 0)
    && new Set(value).size === value.length;
}

function validRunRowsCommitment(runReceipt) {
  return isDenseArray(runReceipt.rows)
    && runReceipt.rows.every(hasValidContentHash)
    && runReceipt.rowsHash === canonicalHash(
      runReceipt.rows.map((row) => row.contentHash),
    );
}

function validDisposition(disposition, blockers, passingValue) {
  return validBlockers(blockers)
    && (disposition === passingValue || disposition === "blocked")
    && (disposition === passingValue ? blockers.length === 0 : blockers.length > 0);
}

function evidenceShapesAreValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  const runSpec = isRecord(runReceipt.runSpec) ? runReceipt.runSpec : null;
  const candidate = runSpec !== null && isRecord(runSpec.candidate) ? runSpec.candidate : null;
  const contractHashes = runPackage.contractHashes;
  return hasExactKeys(runPackage, runPackageKeys)
    && commitPattern.test(String(runPackage.sourceCommit))
    && isDenseArray(runPackage.files)
    && runPackage.files.length === packageFileNames.length
    && runSpec !== null
    && candidate !== null
    && hasValidContentHash(runSpec)
    && hasExactKeys(provenanceReceipt, provenanceReceiptKeys)
    && hasExactKeys(runReceipt, runReceiptKeys)
    && hasExactKeys(rateabilitySummary, rateabilitySummaryKeys)
    && hasExactKeys(blindSheet, blindSheetKeys)
    && hasExactKeys(blindKey, blindKeyKeys)
    && hasExactKeys(contractHashes, packageContractHashKeys);
}

function frozenContractBindingsAreValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  const contractHashes = runPackage.contractHashes;
  return sameCanonical(contractHashes, frozenContractBindings.contractHashes)
    && runPackage.packageId === frozenContractBindings.packageId
    && runPackage.packageContractHash === frozenContractBindings.packageContractHash
    && provenanceReceipt.receiptId === frozenContractBindings.provenanceReceiptId
    && provenanceReceipt.fullRunContractHash === frozenContractBindings.contractHashes.browserFullRun
    && provenanceReceipt.formSelectionContractHash
      === frozenContractBindings.contractHashes.formSelection
    && provenanceReceipt.transformersAdapterContractHash
      === frozenContractBindings.contractHashes.transformersAdapter
    && provenanceReceipt.protocolContractHash === frozenContractBindings.contractHashes.workerProtocol
    && provenanceReceipt.caseReceiptContractHash === frozenContractBindings.contractHashes.caseReceipt
    && provenanceReceipt.runReceiptContractHash === frozenContractBindings.contractHashes.runReceipt
    && provenanceReceipt.runnerSequencingContractHash
      === frozenContractBindings.contractHashes.runnerSequencing
    && provenanceReceipt.evidenceContractHash === frozenContractBindings.contractHashes.evidence
    && provenanceReceipt.blindStudyContractHash === frozenContractBindings.contractHashes.blindStudy
    && provenanceReceipt.rateabilityContractHash === frozenContractBindings.contractHashes.rateability
    && provenanceReceipt.adapterSmokeContractHash === frozenContractBindings.adapterSmokeContractHash
    && provenanceReceipt.adapterSmokeSourceCommit === frozenContractBindings.adapterSmokeSourceCommit
    && provenanceReceipt.adapterSmokeReceiptHash === frozenContractBindings.adapterSmokeReceiptHash
    && runReceipt.runReceiptContractHash === frozenContractBindings.contractHashes.runReceipt
    && runReceipt.protocolContractHash === frozenContractBindings.contractHashes.workerProtocol
    && runReceipt.runnerSequencingContractHash
      === frozenContractBindings.contractHashes.runnerSequencing
    && runReceipt.evidenceContractHash === frozenContractBindings.contractHashes.evidence
    && rateabilitySummary.summaryId === frozenContractBindings.rateabilitySummaryId
    && rateabilitySummary.rateabilityContractHash
      === frozenContractBindings.contractHashes.rateability
    && blindSheet.selectionContractHash === frozenContractBindings.contractHashes.formSelection
    && blindSheet.evidenceContractHash === frozenContractBindings.contractHashes.evidence
    && blindSheet.blindStudyContractHash === frozenContractBindings.contractHashes.blindStudy
    && blindKey.selectionContractHash === frozenContractBindings.contractHashes.formSelection
    && blindKey.evidenceContractHash === frozenContractBindings.contractHashes.evidence
    && blindKey.blindStudyContractHash === frozenContractBindings.contractHashes.blindStudy
    && runPackage.adapterSmokeSourceCommit === frozenContractBindings.adapterSmokeSourceCommit
    && runPackage.adapterSmokeReceiptHash === frozenContractBindings.adapterSmokeReceiptHash;
}

function evidenceIdentityLinksAreValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  const runSpec = runReceipt.runSpec;
  return runPackage.sourceCommit === provenanceReceipt.sourceCommit
    && runPackage.candidateId === runSpec.candidate.candidateId
    && runPackage.candidateId === rateabilitySummary.candidateId
    && runPackage.runId === runSpec.runId
    && runPackage.sheetId === blindSheet.sheetId
    && runPackage.runSpecHash === runSpec.contentHash
    && runPackage.workerBindingHash === runReceipt.workerBindingHash
    && runPackage.adapterSmokeSourceCommit === provenanceReceipt.adapterSmokeSourceCommit
    && runPackage.adapterSmokeReceiptHash === provenanceReceipt.adapterSmokeReceiptHash
    && provenanceReceipt.runReceiptHash === runReceipt.contentHash
    && provenanceReceipt.rateabilitySummaryHash === rateabilitySummary.contentHash
    && rateabilitySummary.runReceiptHash === runReceipt.contentHash
    && rateabilitySummary.runSpecHash === runSpec.contentHash
    && blindSheet.runReceiptHash === runReceipt.contentHash
    && blindSheet.runSpecHash === runSpec.contentHash
    && blindKey.runReceiptHash === runReceipt.contentHash
    && blindKey.runSpecHash === runSpec.contentHash
    && blindKey.sheetHash === blindSheet.contentHash
    && isRecord(runSpec.corpus)
    && rateabilitySummary.corpusHash === runSpec.corpus.hash
    && blindSheet.corpusHash === runSpec.corpus.hash;
}

function runCommitmentsAreValid({ rateabilitySummary, runReceipt }) {
  return rateabilitySummary.completedRowCount === runReceipt.completedRowCount
    && runReceipt.verifiedArtifactsHash === canonicalHash(runReceipt.verifiedArtifacts)
    && validRunRowsCommitment(runReceipt);
}

function dispositionBindingsAreValid({
  runPackage,
  provenanceReceipt,
  rateabilitySummary,
}) {
  return provenanceReceipt.disposition === runPackage.disposition
    && sameCanonical(provenanceReceipt.blockers, runPackage.blockers)
    && validBlockers(rateabilitySummary.blockers)
    && rateabilitySummary.blockers.every((blocker) => rateabilityBlockers.has(blocker))
    && validDisposition(
      provenanceReceipt.disposition,
      provenanceReceipt.blockers,
      "rateable-for-blind-rating",
    )
    && validDisposition(runPackage.disposition, runPackage.blockers, "rateable-for-blind-rating")
    && validDisposition(
      rateabilitySummary.disposition,
      rateabilitySummary.blockers,
      "run-mechanics-pass",
    )
    && (runPackage.disposition !== "rateable-for-blind-rating"
      || rateabilitySummary.disposition === "run-mechanics-pass");
}

function contractGraphIsValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  const contractHashes = runPackage.contractHashes;
  return contractHashes.formSelection === provenanceReceipt.formSelectionContractHash
    && contractHashes.formSelection === blindSheet.selectionContractHash
    && contractHashes.formSelection === blindKey.selectionContractHash
    && contractHashes.transformersAdapter === provenanceReceipt.transformersAdapterContractHash
    && contractHashes.workerProtocol === provenanceReceipt.protocolContractHash
    && contractHashes.workerProtocol === runReceipt.protocolContractHash
    && contractHashes.caseReceipt === provenanceReceipt.caseReceiptContractHash
    && contractHashes.runReceipt === provenanceReceipt.runReceiptContractHash
    && contractHashes.runnerSequencing === provenanceReceipt.runnerSequencingContractHash
    && contractHashes.runnerSequencing === runReceipt.runnerSequencingContractHash
    && contractHashes.evidence === provenanceReceipt.evidenceContractHash
    && contractHashes.evidence === runReceipt.evidenceContractHash
    && contractHashes.evidence === blindSheet.evidenceContractHash
    && contractHashes.evidence === blindKey.evidenceContractHash
    && contractHashes.blindStudy === provenanceReceipt.blindStudyContractHash
    && contractHashes.blindStudy === blindSheet.blindStudyContractHash
    && contractHashes.blindStudy === blindKey.blindStudyContractHash
    && contractHashes.rateability === provenanceReceipt.rateabilityContractHash
    && contractHashes.rateability === rateabilitySummary.rateabilityContractHash
    && contractHashes.browserFullRun === provenanceReceipt.fullRunContractHash;
}

function authorityFlagsAreValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  return falseAuthority(runPackage, [
    "publicReplayableBeforeRating",
    "humanQualityEvaluated",
    "humanRatingIncluded",
    "modelAdmitted",
    "displayAuthorized",
    "productionAuthority",
  ])
    && falseAuthority(provenanceReceipt, [
      "humanQualityEvaluated",
      "humanRatingIncluded",
      "modelAdmitted",
      "displayAuthorized",
      "productionAuthority",
    ])
    && provenanceReceipt.fullCorpusRun === true
    && falseAuthority(rateabilitySummary, [
      "humanQualityEvaluated",
      "humanRatingIncluded",
      "modelAdmitted",
      "displayAuthorized",
      "productionAuthority",
    ])
    && falseAuthority(blindKey, ["modelAdmitted", "displayAuthorized"])
    && falseAuthority(blindSheet, ["modelAdmitted", "displayAuthorized"])
    && falseAuthority(runReceipt, ["modelAdmitted", "displayAuthorized"]);
}

function evidenceContentHashesAreValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  return [
    runPackage,
    provenanceReceipt,
    blindKey,
    blindSheet,
    rateabilitySummary,
    runReceipt,
  ].every(hasValidContentHash);
}

function snapshotPackageFiles({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
}) {
  const values = {
    "adapter-run-provenance-receipt.json": provenanceReceipt,
    "blind-key.json": blindKey,
    "blind-sheet.json": blindSheet,
    "rateability-summary.json": rateabilitySummary,
    "run-receipt.json": runReceipt,
  };
  const evidenceSet = [];
  for (let index = 0; index < packageFileNames.length; index += 1) {
    const name = packageFileNames[index];
    const record = runPackage.files[index];
    const value = values[name];
    const bytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(value);
    if (!hasExactKeys(record, [
      "name", "visibility", "schemaVersion", "contentHash", "byteLength", "sha256",
    ])
      || record.name !== name
      || record.visibility !== expectedVisibility[name]
      || record.schemaVersion !== 3
      || record.schemaVersion !== value.schemaVersion
      || record.contentHash !== value.contentHash
      || !Number.isSafeInteger(record.byteLength)
      || record.byteLength !== bytes.byteLength
      || !sha256Pattern.test(String(record.sha256))
      || record.sha256 !== digest(bytes)) {
      return Object.freeze({ valid: false, evidenceSet: Object.freeze([]) });
    }
    evidenceSet.push(Object.freeze({ name, value, bytes }));
  }
  const packageBytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(runPackage);
  evidenceSet.push(Object.freeze({
    name: "run-package.json",
    value: runPackage,
    bytes: packageBytes,
  }));
  return Object.freeze({ valid: true, evidenceSet: Object.freeze(evidenceSet) });
}

function predicateResult(id, check, blockedBy = []) {
  const stableBlockedBy = Object.freeze([...blockedBy]);
  if (stableBlockedBy.length > 0) {
    return Object.freeze({ id, status: "not-evaluated", blockedBy: stableBlockedBy });
  }
  try {
    return Object.freeze({ id, status: check() ? "pass" : "fail", blockedBy: stableBlockedBy });
  } catch {
    return Object.freeze({ id, status: "fail", blockedBy: stableBlockedBy });
  }
}

function captureEvidenceInput(evidence) {
  const source = isRecord(evidence) ? evidence : {};
  const captured = {};
  for (const key of [
    "runPackage",
    "provenanceReceipt",
    "blindKey",
    "blindSheet",
    "rateabilitySummary",
    "runReceipt",
    "expectedBindings",
  ]) {
    try {
      captured[key] = source[key];
    } catch {
      captured[key] = undefined;
    }
  }
  return Object.freeze(captured);
}

function inspectNarratorBrowserRateabilityEvidenceSetV3(evidence) {
  const input = captureEvidenceInput(evidence);
  let packageSnapshot = null;
  const checks = Object.freeze({
    "nrv3.expected-bindings.schema": () => validExpectedBindings(input.expectedBindings),
    "nrv3.evidence.content-hashes": () => evidenceContentHashesAreValid(input),
    "nrv3.evidence.schemas": () => evidenceShapesAreValid(input),
    "nrv3.contracts.frozen": () => frozenContractBindingsAreValid(input),
    "nrv3.authority.denied": () => authorityFlagsAreValid(input),
    "nrv3.links.evidence": () => evidenceIdentityLinksAreValid(input),
    "nrv3.commitments.run": () => runCommitmentsAreValid(input),
    "nrv3.disposition.blockers": () => dispositionBindingsAreValid(input),
    "nrv3.expected.source-build": () => expectedSourceBuildBindingsAreValid(input),
    "nrv3.expected.browser-network": () => expectedBrowserNetworkBindingsAreValid(input),
    "nrv3.expected.candidate-artifacts": () =>
      expectedCandidateArtifactBindingsAreValid(input),
    "nrv3.expected.runtime": () => expectedRuntimeBindingsAreValid(input),
    "nrv3.expected.run": () => expectedRunBindingsAreValid(input),
    "nrv3.expected.adapter-smoke": () => expectedAdapterBindingsAreValid(input),
    "nrv3.expected.blockers": () => expectedBlockerBindingsAreValid(input),
    "nrv3.contracts.graph": () => contractGraphIsValid(input),
    "nrv3.package.files": () => {
      packageSnapshot = snapshotPackageFiles(input);
      return packageSnapshot.valid;
    },
  });
  const predicates = [];
  const resultsById = new Map();
  for (const { id, prerequisites } of narratorBrowserRateabilityEvidencePredicateContractV3) {
    const blockedBy = prerequisites.filter(
      (prerequisite) => resultsById.get(prerequisite)?.status !== "pass",
    );
    const result = predicateResult(id, checks[id], blockedBy);
    predicates.push(result);
    resultsById.set(id, result);
  }
  const failedPredicateIds = Object.freeze(predicates
    .filter(({ status }) => status === "fail")
    .map(({ id }) => id));
  const notEvaluatedPredicateIds = Object.freeze(predicates
    .filter(({ status }) => status === "not-evaluated")
    .map(({ id }) => id));
  const audit = Object.freeze({
    schemaVersion: 1,
    auditId: "the-grind-2:narrator-browser-rateability-evidence-audit:v3",
    verdict: failedPredicateIds.length === 0 && notEvaluatedPredicateIds.length === 0
      ? "pass"
      : "fail",
    predicates: Object.freeze(predicates),
    failedPredicateIds,
    notEvaluatedPredicateIds,
  });
  return Object.freeze({ audit, packageSnapshot });
}

export function auditNarratorBrowserRateabilityEvidenceSetV3(evidence) {
  return inspectNarratorBrowserRateabilityEvidenceSetV3(evidence).audit;
}

export function parseNarratorBrowserRateabilityArgumentsV3(argv) {
  if (!Array.isArray(argv)) return null;
  const [mode, ...rest] = argv;
  if (mode !== "run" || rest.length !== 10) return null;
  const allowed = new Set(["model-dir", "run-id", "out", "sheet-id", "secret-salt-file"]);
  const options = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const value = rest[index + 1];
    if (typeof option !== "string"
      || !option.startsWith("--")
      || typeof value !== "string"
      || value.length === 0) return null;
    const name = option.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
  }
  if ([...allowed].some((name) => !Object.hasOwn(options, name))) return null;
  return Object.freeze(options);
}

export function serializeNarratorBrowserRateabilityEvidenceJsonV3(value) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Narrator V3 rateability evidence cannot be serialized");
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("Narrator V3 rateability evidence JSON projection is invalid");
  }
  if (!sameCanonical(parsed, value)) {
    throw new TypeError("Narrator V3 rateability evidence JSON projection is invalid");
  }
  return new TextEncoder().encode(`${serialized}\n`);
}

export function verifyNarratorBrowserRateabilityEvidenceSetV3(evidence) {
  const { audit, packageSnapshot } = inspectNarratorBrowserRateabilityEvidenceSetV3(evidence);
  if (audit.verdict !== "pass") {
    const expectedBindingsFailed =
      audit.predicates[0].status !== "pass";
    const message = expectedBindingsFailed
      ? "Narrator V3 rateability expected host bindings are invalid"
      : "Narrator V3 rateability evidence bindings are invalid";
    const error = new TypeError(
      `${message}: failed=${audit.failedPredicateIds.join("|") || "none"};`
        + `not-evaluated=${audit.notEvaluatedPredicateIds.join("|") || "none"}`,
    );
    Object.defineProperty(error, "code", {
      value: "ERR_NARRATOR_V3_RATEABILITY_EVIDENCE_INVALID",
      enumerable: true,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(error, "audit", {
      value: audit,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    throw error;
  }
  return packageSnapshot.evidenceSet;
}

function pathIsInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function isMissing(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}

async function requireMissing(filesystem, path) {
  try {
    await filesystem.lstat(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw new Error("Narrator V3 rateability output already exists");
}

async function requirePrivateDirectory(filesystem, path, expectedOwner) {
  const metadata = await filesystem.lstat(path);
  if (!metadata.isDirectory()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o7777) !== 0o700
    || metadata.uid !== expectedOwner) {
    throw new Error(
      "Narrator V3 rateability directories must be real exact-mode 0700 directories owned by the current user",
    );
  }
}

async function writePrivateFile(filesystem, path, bytes, expectedOwner) {
  let handle = null;
  let primaryError = null;
  try {
    handle = await filesystem.open(path, "wx", 0o600);
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || (metadata.mode & 0o7777) !== 0o600
      || metadata.uid !== expectedOwner) {
      throw new Error("Narrator V3 rateability evidence is not an exact-mode private regular file");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }
  const metadata = await filesystem.lstat(path);
  if (!metadata.isFile()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o7777) !== 0o600
    || metadata.uid !== expectedOwner) {
    throw new Error("Narrator V3 rateability evidence path is not a private regular file");
  }
}

async function verifyFinalDirectory(filesystem, path, expectedOwner) {
  await requirePrivateDirectory(filesystem, path, expectedOwner);
  const names = (await filesystem.readdir(path)).sort();
  const expected = [...narratorBrowserRateabilityEvidenceFileNamesV3].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error("Narrator V3 rateability output file set is invalid");
  }
  for (const name of expected) {
    const metadata = await filesystem.lstat(resolve(path, name));
    if (!metadata.isFile()
      || metadata.isSymbolicLink()
      || (metadata.mode & 0o7777) !== 0o600
      || metadata.uid !== expectedOwner) {
      throw new Error("Narrator V3 rateability output contains a non-private file");
    }
  }
}

function cooperativeLockPath(parent, destination) {
  const identity = digest(new TextEncoder().encode(destination)).slice(0, 24);
  return resolve(parent, `.narrator-browser-rateability-v3-${identity}.lock`);
}

async function cleanupCooperativeLock(filesystem, path, handle) {
  const errors = [];
  try {
    await handle.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    await filesystem.unlink(path);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      "Narrator V3 rateability cooperative publication lock cleanup failed",
    );
  }
}

async function acquireCooperativeLock(filesystem, path, expectedOwner) {
  let handle;
  try {
    handle = await filesystem.open(path, "wx", 0o600);
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") {
      throw new Error(
        "Narrator V3 rateability publication is already active for this output; "
          + "a stale lock may be removed only after confirming no collector is running",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await handle.chmod(0o600);
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || (metadata.mode & 0o7777) !== 0o600
      || metadata.uid !== expectedOwner) {
      throw new Error(
        "Narrator V3 rateability publication lock must be an exact-mode 0600 file owned by the current user",
      );
    }
    return handle;
  } catch (error) {
    try {
      await cleanupCooperativeLock(filesystem, path, handle);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Narrator V3 rateability publication lock setup and cleanup both failed",
      );
    }
    throw error;
  }
}

function attemptVaultError(code, message) {
  const error = new Error(message);
  Object.defineProperty(error, "code", {
    value: code,
    enumerable: true,
    configurable: false,
    writable: false,
  });
  return error;
}

function sameFilesystemObject(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function exactPrivateDirectoryMetadata(metadata, expectedOwner) {
  return metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && (metadata.mode & 0o7777) === 0o700
    && metadata.uid === expectedOwner;
}

function exactPrivateFileMetadata(metadata, expectedOwner) {
  return metadata.isFile()
    && !metadata.isSymbolicLink()
    && (metadata.mode & 0o7777) === 0o600
    && metadata.uid === expectedOwner
    && metadata.nlink === 1;
}

function attemptFilesystem(filesystemOverrides) {
  if (!isRecord(filesystemOverrides)) {
    throw new TypeError("Narrator V3 rateability attempt filesystem is invalid");
  }
  const filesystem = { ...defaultFilesystem, ...filesystemOverrides };
  const required = [
    "chmod",
    "link",
    "lstat",
    "mkdir",
    "mkdtemp",
    "open",
    "readdir",
    "realpath",
    "rename",
    "unlink",
  ];
  if (required.some((operation) => typeof filesystem[operation] !== "function")) {
    throw new TypeError("Narrator V3 rateability attempt filesystem is invalid");
  }
  return filesystem;
}

function requireAttemptOpenFlags() {
  const names = ["O_RDONLY", "O_WRONLY", "O_CREAT", "O_EXCL", "O_NOFOLLOW", "O_DIRECTORY"];
  if (names.some((name) => !Number.isSafeInteger(filesystemConstants[name]))) {
    throw attemptVaultError(
      "ERR_NARRATOR_V3_ATTEMPT_PLATFORM_UNSUPPORTED",
      "Narrator V3 rateability attempt vault requires POSIX no-follow filesystem operations",
    );
  }
  return Object.freeze({
    create: filesystemConstants.O_WRONLY
      | filesystemConstants.O_CREAT
      | filesystemConstants.O_EXCL
      | filesystemConstants.O_NOFOLLOW,
    read: filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
    directory: filesystemConstants.O_RDONLY
      | filesystemConstants.O_DIRECTORY
      | filesystemConstants.O_NOFOLLOW,
  });
}

async function closeHandle(handle) {
  if (handle !== null) await handle.close();
}

async function closeAttemptVaultHandles(state, invalidatesLease = true) {
  if (state.closed) return;
  invalidateAttemptAdmission(state, invalidatesLease);
  state.closed = true;
  const failures = [];
  for (const key of [
    "finalizationDirectoryHandle",
    "vaultHandle",
    "destinationLockHandle",
    "lockHandle",
    "parentHandle",
  ]) {
    const handle = state[key];
    state[key] = null;
    if (handle === null) continue;
    try {
      await closeHandle(handle);
    } catch {
      failures.push(attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_CLOSE_FAILED",
        "Narrator V3 rateability attempt vault handle close failed",
      ));
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Narrator V3 rateability attempt vault handle close failed",
    );
  }
}

async function openPrivateDirectoryHandle(filesystem, path, expectedOwner, flags) {
  let handle = null;
  let primaryError = null;
  try {
    handle = await filesystem.open(path, flags.directory);
    const handleMetadata = await handle.stat();
    const pathMetadata = await filesystem.lstat(path);
    if (!exactPrivateDirectoryMetadata(handleMetadata, expectedOwner)
      || !exactPrivateDirectoryMetadata(pathMetadata, expectedOwner)
      || !sameFilesystemObject(handleMetadata, pathMetadata)) {
      throw new Error("invalid private directory");
    }
    return handle;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (primaryError !== null && handle !== null) {
      try {
        await handle.close();
      } catch {
        // The exported operation replaces both failures with one path-free code.
      }
    }
  }
}

async function requireBoundPrivateDirectory(state, path, handle) {
  const handleMetadata = await handle.stat();
  const pathMetadata = await state.filesystem.lstat(path);
  if (!exactPrivateDirectoryMetadata(handleMetadata, state.expectedOwner)
    || !exactPrivateDirectoryMetadata(pathMetadata, state.expectedOwner)
    || !sameFilesystemObject(handleMetadata, pathMetadata)) {
    throw new Error("invalid private directory binding");
  }
}

async function requireAttemptPathMissing(filesystem, path) {
  try {
    await filesystem.lstat(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw attemptVaultError(
    "ERR_NARRATOR_V3_ATTEMPT_COLLISION",
    "Narrator V3 rateability attempt identity or output already exists",
  );
}

async function createAttemptLock(state, path, handleKey) {
  let handle = null;
  let primaryError = null;
  try {
    handle = await state.filesystem.open(
      path,
      state.flags.create,
      narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode,
    );
    state[handleKey] = handle;
    state.ownedLockPaths.add(path);
    await handle.chmod(narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode);
    const bytes = new TextEncoder().encode(`${state.identity.attemptId}\n`);
    await handle.writeFile(bytes);
    await handle.sync();
    const handleMetadata = await handle.stat();
    const pathMetadata = await state.filesystem.lstat(path);
    if (!exactPrivateFileMetadata(handleMetadata, state.expectedOwner)
      || !exactPrivateFileMetadata(pathMetadata, state.expectedOwner)
      || !sameFilesystemObject(handleMetadata, pathMetadata)
      || handleMetadata.size !== bytes.byteLength) {
      throw new Error("invalid private attempt lock");
    }
    state.lockCommitments.set(path, Object.freeze({
      byteLength: bytes.byteLength,
      sha256: digest(bytes),
    }));
  } catch (error) {
    primaryError = error;
    if (handle === null && isRecord(error) && error.code === "EEXIST") {
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_COLLISION",
        "Narrator V3 rateability attempt identity or output already exists",
      );
    }
    throw error;
  } finally {
    if (primaryError !== null && handle !== null) {
      try {
        await handle.close();
        state[handleKey] = null;
      } catch {
        // The lock path is deliberately retained even when its handle cannot close cleanly.
      }
    }
  }
}

async function verifyAttemptLock(state, path, heldHandle) {
  const expected = state.lockCommitments.get(path);
  if (expected === undefined) throw new Error("missing attempt lock commitment");
  const heldMetadata = await heldHandle.stat();
  const pathMetadata = await state.filesystem.lstat(path);
  if (!exactPrivateFileMetadata(heldMetadata, state.expectedOwner)
    || !exactPrivateFileMetadata(pathMetadata, state.expectedOwner)
    || !sameFilesystemObject(heldMetadata, pathMetadata)
    || heldMetadata.size !== expected.byteLength) {
    throw new Error("invalid attempt lock binding");
  }

  let readHandle = null;
  let primaryError = null;
  let bytes;
  try {
    readHandle = await state.filesystem.open(path, state.flags.read);
    const readMetadata = await readHandle.stat();
    if (!exactPrivateFileMetadata(readMetadata, state.expectedOwner)
      || !sameFilesystemObject(heldMetadata, readMetadata)) {
      throw new Error("invalid attempt lock readback");
    }
    bytes = new Uint8Array(await readHandle.readFile());
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (readHandle !== null) {
      try {
        await readHandle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }
  const finalPathMetadata = await state.filesystem.lstat(path);
  if (!exactPrivateFileMetadata(finalPathMetadata, state.expectedOwner)
    || !sameFilesystemObject(heldMetadata, finalPathMetadata)
    || bytes.byteLength !== expected.byteLength
    || digest(bytes) !== expected.sha256) {
    throw new Error("attempt lock changed during readback");
  }
}

async function writeAttemptTemporaryFile(state, path, bytes) {
  let handle = null;
  let handleMetadata = null;
  let primaryError = null;
  try {
    handle = await state.filesystem.open(
      path,
      state.flags.create,
      narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode,
    );
    await handle.chmod(narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode);
    await handle.writeFile(bytes);
    await handle.sync();
    handleMetadata = await handle.stat();
    if (!exactPrivateFileMetadata(handleMetadata, state.expectedOwner)
      || handleMetadata.size !== bytes.byteLength) {
      throw new Error("invalid private attempt record");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }
  const pathMetadata = await state.filesystem.lstat(path);
  if (!exactPrivateFileMetadata(pathMetadata, state.expectedOwner)
    || !sameFilesystemObject(handleMetadata, pathMetadata)
    || pathMetadata.size !== bytes.byteLength) {
    throw new Error("invalid private attempt record path");
  }
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validAttemptStartRecord(state, value) {
  return hasExactKeys(value, [
    "schemaVersion",
    "recordId",
    "vaultContractHash",
    "recordContractHash",
    "attemptId",
    "sourceCommit",
    "candidateId",
    "runId",
    "sheetId",
    "outputBasename",
    "outputReservationContractHash",
    "outputReservationId",
    "expectedCoreFiles",
    "expectedHostFiles",
    ...attemptAuthorityFields,
    "contentHash",
  ])
    && value.schemaVersion === 1
    && value.recordId === "the-grind-2:narrator-browser-rateability-attempt-start:v3"
    && value.vaultContractHash === narratorBrowserRateabilityAttemptVaultContractHashV3
    && value.recordContractHash === narratorBrowserRateabilityAttemptRecordContractHashV3
    && value.attemptId === state.identity.attemptId
    && value.sourceCommit === state.sourceCommit
    && value.candidateId === state.candidateId
    && value.runId === state.identity.runId
    && value.sheetId === state.sheetId
    && value.outputBasename === basename(state.destinationPath)
    && value.outputReservationContractHash
      === narratorBrowserRateabilityOutputReservationContractHashV3
    && value.outputReservationId === state.outputReservation.reservationId
    && sameCanonical(
      value.expectedCoreFiles,
      narratorBrowserRateabilityAttemptVaultContractV3.coreFiles,
    )
    && sameCanonical(
      value.expectedHostFiles,
      narratorBrowserRateabilityAttemptVaultContractV3.hostFiles,
    )
    && falseAttemptAuthority(value)
    && hasCanonicalContentHash(value);
}

function validAttemptPreservationBinding(state, definition, value) {
  return isNarratorBrowserRateabilityAttemptPreservationReceiptV3(value)
    && value.phase === definition.phase
    && value.attemptId === state.identity.attemptId
    && value.files.every((file, index) => sameAttemptSnapshotCommitment(
      file,
      state.recordSnapshots.get(definition.inputFiles[index]),
    ));
}

function validAttemptDiagnosticBinding(state, value) {
  if (!isNarratorBrowserRateabilityVerificationDiagnosticV3(value)) return false;
  if (state.failureCode !== null) return value.failureCode === state.failureCode;
  return value.failureCode === null
    || value.failureCode === "evidence-verification-failed";
}

function validAttemptTerminalBinding(state, value) {
  if (!isNarratorBrowserRateabilityAttemptTerminalReceiptV3(value)
    || value.attemptId !== state.identity.attemptId
    || (value.terminalStatus === "verified" && state.failed)
    || (state.failureCode !== null && value.failureCode !== state.failureCode)) return false;
  const preservationValues = [];
  for (let index = 0; index < value.preservationReceipts.length; index += 1) {
    const definition = attemptPreservationPhases[index];
    const snapshot = state.recordSnapshots.get(definition.recordName);
    if (!sameAttemptSnapshotCommitment(value.preservationReceipts[index], snapshot)
      || snapshot?.value?.phase !== definition.phase
      || snapshot?.value?.attemptId !== state.identity.attemptId) return false;
    preservationValues.push(snapshot.value);
  }
  if (!preservationHistoryIsConsistent(preservationValues)) return false;
  const runPackage = state.recordSnapshots.get("32-run-package.json");
  if (value.preservationReceipts.length === attemptPreservationPhases.length
    && !sameAttemptSnapshotCommitment(
      preservationValues[3]?.files?.[1],
      runPackage,
    )) return false;
  if (value.terminalStatus === "verified"
    && value.officialDisposition !== runPackage?.value?.disposition) return false;
  const diagnostic = state.recordSnapshots.get("40-verification-diagnostic.json");
  return sameAttemptSnapshotCommitment(value.verificationDiagnostic, diagnostic)
    && isNarratorBrowserRateabilityVerificationDiagnosticV3(diagnostic?.value)
    && value.failureCode === diagnostic.value.failureCode
    && value.verificationVerdict === expectedVerificationVerdict(diagnostic.value.failureCode);
}

function validAttemptRecordProjection(state, name, value) {
  if (!isRecord(value)) return false;
  if (name === "00-attempt-start.json") return validAttemptStartRecord(state, value);
  const preservation = preservationPhaseForName(name);
  if (preservation !== undefined) {
    return validAttemptPreservationBinding(state, preservation, value);
  }
  if (name === "40-verification-diagnostic.json") {
    return validAttemptDiagnosticBinding(state, value);
  }
  if (name === "90-attempt-terminal.json") {
    return validAttemptTerminalBinding(state, value);
  }
  return validAttemptSourceValue(name, value);
}

function attemptRecordRequiresPrevalidation(name) {
  return name === "00-attempt-start.json"
    || preservationPhaseForName(name) !== undefined
    || name === "40-verification-diagnostic.json"
    || name === "90-attempt-terminal.json";
}

function createAttemptRecordSnapshot(name, bytes, value) {
  const capturedBytes = new Uint8Array(bytes.byteLength);
  capturedBytes.set(bytes);
  const snapshot = {
    name,
    schemaVersion: Number.isSafeInteger(value.schemaVersion) ? value.schemaVersion : null,
    contentHash: typeof value.contentHash === "string" ? value.contentHash : null,
    byteLength: capturedBytes.byteLength,
    sha256: digest(capturedBytes),
    value,
    copyBytes: () => {
      const copy = new Uint8Array(capturedBytes.byteLength);
      copy.set(capturedBytes);
      return copy;
    },
  };
  return Object.freeze(snapshot);
}

function validAttemptExpectation(expected, name) {
  return isRecord(expected)
    && expected.name === name
    && Number.isSafeInteger(expected.byteLength)
    && expected.byteLength > 0
    && sha256Pattern.test(String(expected.sha256));
}

async function readAttemptRecord(state, name, expected) {
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  const path = resolve(state.vaultPath, name);
  let handle = null;
  let primaryError = null;
  let bytes;
  try {
    handle = await state.filesystem.open(path, state.flags.read);
    const handleMetadata = await handle.stat();
    const firstPathMetadata = await state.filesystem.lstat(path);
    if (!exactPrivateFileMetadata(handleMetadata, state.expectedOwner)
      || !exactPrivateFileMetadata(firstPathMetadata, state.expectedOwner)
      || !sameFilesystemObject(handleMetadata, firstPathMetadata)) {
      throw new Error("invalid private attempt record");
    }
    bytes = new Uint8Array(await handle.readFile());
    const secondPathMetadata = await state.filesystem.lstat(path);
    if (!exactPrivateFileMetadata(secondPathMetadata, state.expectedOwner)
      || !sameFilesystemObject(handleMetadata, secondPathMetadata)
      || handleMetadata.size !== bytes.byteLength) {
      throw new Error("private attempt record changed during readback");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }

  const expectations = [state.commitments.get(name), expected].filter((entry) => entry !== undefined);
  if (expectations.length === 0 || expectations.some((entry) =>
    !validAttemptExpectation(entry, name)
      || entry.byteLength !== bytes.byteLength
      || entry.sha256 !== digest(bytes))) {
    throw new Error("private attempt record commitment mismatch");
  }

  let source;
  let value;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    throw new Error("private attempt record JSON is invalid");
  }
  const serialized = serializeNarratorBrowserRateabilityEvidenceJsonV3(value);
  if (!bytesEqual(bytes, serialized) || !validAttemptRecordProjection(state, name, value)) {
    throw new Error("private attempt record projection is invalid");
  }
  return createAttemptRecordSnapshot(name, bytes, deepFreezeJson(value));
}

async function publishAttemptRecord(state, name, value, allowStart = false) {
  const index = narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.indexOf(name);
  const diagnosticOrTerminal = name === "40-verification-diagnostic.json"
    || name === "90-attempt-terminal.json";
  if (index < 0
    || (name === "00-attempt-start.json") !== allowStart
    || (diagnosticOrTerminal
      ? index <= state.highestPublishedIndex
      : index !== state.highestPublishedIndex + 1)
    || state.publishedNames.has(name)
    || (state.failed && !diagnosticOrTerminal)) {
    throw new Error("invalid attempt record order");
  }
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  const finalPath = resolve(state.vaultPath, name);
  const pendingPath = resolve(state.vaultPath, `.${name}.pending`);
  await requireAttemptPathMissing(state.filesystem, finalPath);
  await requireAttemptPathMissing(state.filesystem, pendingPath);

  const bytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(value);
  if (attemptRecordRequiresPrevalidation(name)) {
    let projected;
    try {
      projected = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new Error("invalid private attempt record projection");
    }
    if (!validAttemptRecordProjection(state, name, projected)) {
      throw new Error("invalid private attempt record projection");
    }
  }
  await writeAttemptTemporaryFile(state, pendingPath, bytes);
  await state.filesystem.link(pendingPath, finalPath);
  state.publishedNames.add(name);
  state.highestPublishedIndex = index;
  await state.vaultHandle.sync();
  await state.filesystem.unlink(pendingPath);
  await state.vaultHandle.sync();

  const expected = Object.freeze({
    name,
    byteLength: bytes.byteLength,
    sha256: digest(bytes),
  });
  const snapshot = await readAttemptRecord(state, name, expected);
  state.commitments.set(name, expected);
  state.recordSnapshots.set(name, snapshot);
  return snapshot;
}

function createAttemptStartRecord({
  identity,
  sourceCommit,
  candidateId,
  sheetId,
  outputBasename,
  outputReservationId,
}) {
  const content = {
    schemaVersion: 1,
    recordId: "the-grind-2:narrator-browser-rateability-attempt-start:v3",
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
    recordContractHash: narratorBrowserRateabilityAttemptRecordContractHashV3,
    attemptId: identity.attemptId,
    sourceCommit,
    candidateId,
    runId: identity.runId,
    sheetId,
    outputBasename,
    outputReservationContractHash:
      narratorBrowserRateabilityOutputReservationContractHashV3,
    outputReservationId,
    expectedCoreFiles: [...narratorBrowserRateabilityAttemptVaultContractV3.coreFiles],
    expectedHostFiles: [...narratorBrowserRateabilityAttemptVaultContractV3.hostFiles],
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  };
  return withCanonicalContentHash(content);
}

function requireActiveAttemptState(attempt) {
  const state = attemptVaultStates.get(attempt);
  if (state === undefined || state.closed) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  return state;
}

function enqueueAttemptVaultOperation(state, operation, closesAttempt = false) {
  if (!state.acceptingOperations) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  if (closesAttempt) state.acceptingOperations = false;
  const result = state.operationTail.then(operation);
  state.operationTail = result.catch(() => undefined);
  return result;
}

function attemptAdmissionIsFresh(state) {
  return state.acceptingOperations
    && !state.closed
    && !state.failed
    && state.failureCode === null
    && !state.retentionInvalidated
    && state.highestPublishedIndex === 0
    && state.publishedNames.size === 1
    && state.publishedNames.has("00-attempt-start.json")
    && state.commitments.size === 1
    && state.commitments.has("00-attempt-start.json")
    && state.recordSnapshots.size === 1
    && state.recordSnapshots.has("00-attempt-start.json")
    && state.ownedLockPaths.size === 2
    && state.ownedLockPaths.has(state.lockPath)
    && state.ownedLockPaths.has(state.destinationLockPath)
    && state.lockCommitments.size === 2
    && state.lockCommitments.has(state.lockPath)
    && state.lockCommitments.has(state.destinationLockPath)
    && state.parentHandle !== null
    && state.vaultHandle !== null
    && state.lockHandle !== null
    && state.destinationLockHandle !== null;
}

function invalidateAttemptAdmission(state, invalidatesLease = true) {
  const admission = state.admissionCapability;
  if (admission !== null) {
    readyAttemptAdmissions.delete(admission);
    activeAttemptAdmissions.delete(admission);
  }
  const lease = state.admissionLease;
  if (lease !== null) {
    if (invalidatesLease) lease.invalidated = true;
    return;
  }
  state.admissionCapability = null;
  state.admissionStatus = "invalid";
}

function finishAttemptAdmission(state, lease, status) {
  const admission = state.admissionCapability;
  if (admission !== null) {
    readyAttemptAdmissions.delete(admission);
    activeAttemptAdmissions.delete(admission);
  }
  if (state.admissionLease === lease) state.admissionLease = null;
  state.admissionCapability = null;
  state.admissionStatus = status;
}

function attemptOperationLease(state, closesAttempt) {
  const contextualLease = attemptAdmissionContext.getStore();
  const lease = state.admissionLease;
  if (lease !== null) {
    if (closesAttempt
      || lease.phase !== "active"
      || contextualLease !== lease
      || lease.state !== state
      || lease.admission !== state.admissionCapability) {
      throw new TypeError("Narrator V3 rateability attempt handle is reserved");
    }
    return lease;
  }
  if (contextualLease !== undefined) {
    throw new TypeError("Narrator V3 rateability attempt handle is reserved");
  }
  if (state.admissionStatus === "issuing" || state.admissionStatus === "ready") {
    if (closesAttempt) {
      invalidateAttemptAdmission(state);
      return null;
    }
    throw new TypeError("Narrator V3 rateability attempt handle is reserved");
  }
  if (["spent", "callback-failed"].includes(state.admissionStatus)
    && !closesAttempt) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  if (state.admissionStatus === "invalid" && !state.failed && !closesAttempt) {
    throw new TypeError("Narrator V3 rateability attempt handle is invalid");
  }
  return null;
}

function enqueueAdmissionLeaseOperation(lease, operation) {
  const result = lease.operationTail.then(() =>
    attemptAdmissionContext.run(lease, operation));
  lease.operationTail = result.catch(() => undefined);
  lease.operationOutcomes.push(result.then(
    () => true,
    () => false,
  ));
  return result;
}

function enqueuePublicAttemptVaultOperation(state, operation, closesAttempt = false) {
  const lease = attemptOperationLease(state, closesAttempt);
  if (lease !== null) return enqueueAdmissionLeaseOperation(lease, operation);
  const result = enqueueAttemptVaultOperation(state, operation, closesAttempt);
  return result;
}

function attemptPublicationFailureCode(name) {
  if ([...attemptCoreFiles, "19-core-preservation.json"].includes(name)) {
    return "core-preservation-failed";
  }
  if (["20-expected-bindings.json", "29-bindings-preservation.json"].includes(name)) {
    return "bindings-preservation-failed";
  }
  if (["30-provenance-receipt.json", "31-provenance-preservation.json"].includes(name)) {
    return "provenance-preservation-failed";
  }
  if (name === "32-run-package.json") return "host-construction-failed";
  if (name === "39-host-preservation.json") return "host-preservation-failed";
  if (["40-verification-diagnostic.json", "90-attempt-terminal.json"].includes(name)) {
    return "evidence-publication-failed";
  }
  return "attempt-admission-failed";
}

function latchAttemptFailure(state, failureCode) {
  if (state.publishedNames.has("40-verification-diagnostic.json")) {
    state.retentionInvalidated = true;
  }
  state.failed = true;
  if (state.failureCode === null) state.failureCode = failureCode;
  invalidateAttemptAdmission(state);
}

function createAttemptHandle(identity) {
  return Object.freeze({
    schemaVersion: 1,
    attemptId: identity.attemptId,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
  });
}

async function retainRejectedAttemptVault(
  state,
  attempt,
  failureCode,
  expectedOwnedLockPaths,
) {
  state.acceptingOperations = false;
  latchAttemptFailure(state, failureCode);
  let retentionVerified = false;
  try {
    const diagnostic = await publishAttemptRecord(
      state,
      "40-verification-diagnostic.json",
      createNarratorBrowserRateabilityVerificationDiagnosticV3({
        audit: null,
        failureCode,
      }),
    );
    await publishAttemptRecord(
      state,
      "90-attempt-terminal.json",
      createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
        attempt,
        preservationReceipts: [],
        verificationDiagnostic: diagnostic,
        runPackage: null,
      }),
    );
    await verifyRetainedAttemptVault(state, {
      expectedOwnedLockPaths,
      exactRecordNames: Object.freeze([
        "00-attempt-start.json",
        "40-verification-diagnostic.json",
        "90-attempt-terminal.json",
      ]),
    });
    retentionVerified = true;
  } catch {
    // The stable path-free error below replaces private filesystem details.
  }

  let handlesClosed = false;
  try {
    await closeAttemptVaultHandles(state);
    handlesClosed = true;
  } catch {
    // The stable path-free error below replaces private filesystem details.
  }
  if (!retentionVerified || !handlesClosed) {
    throw attemptVaultError(
      "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
      "Narrator V3 rateability rejected attempt retention could not be verified",
    );
  }
}

export async function beginNarratorBrowserRateabilityAttemptVaultV3({
  outputDirectory,
  sourceCommit,
  candidateId,
  runId,
  sheetId,
  filesystem: filesystemOverrides = {},
  repositoryRoot = defaultRepositoryRoot,
  cwd = process.cwd(),
}) {
  if (process.platform === "win32" || typeof process.geteuid !== "function") {
    throw attemptVaultError(
      "ERR_NARRATOR_V3_ATTEMPT_PLATFORM_UNSUPPORTED",
      "Narrator V3 rateability attempt vault requires POSIX filesystem ownership",
    );
  }
  if (typeof outputDirectory !== "string"
    || outputDirectory.length === 0
    || !commitPattern.test(String(sourceCommit))
    || !isNarratorBoundedText(candidateId, 200)
    || !isNarratorRunId(runId)
    || !isNarratorBoundedText(sheetId, 200)
    || typeof repositoryRoot !== "string"
    || repositoryRoot.length === 0
    || typeof cwd !== "string"
    || cwd.length === 0) {
    throw new TypeError("Narrator V3 rateability attempt start is invalid");
  }

  const filesystem = attemptFilesystem(filesystemOverrides);
  const flags = requireAttemptOpenFlags();
  const identity = createNarratorBrowserRateabilityAttemptIdentityV3(runId);
  const expectedOwner = process.geteuid();
  const state = {
    filesystem,
    flags,
    identity,
    expectedOwner,
    sourceCommit,
    candidateId,
    sheetId,
    outputReservation: null,
    parentPath: null,
    destinationPath: null,
    vaultPath: null,
    lockPath: null,
    destinationLockPath: null,
    parentHandle: null,
    vaultHandle: null,
    lockHandle: null,
    destinationLockHandle: null,
    ownedLockPaths: new Set(),
    lockCommitments: new Map(),
    commitments: new Map(),
    recordSnapshots: new Map(),
    publishedNames: new Set(),
    highestPublishedIndex: -1,
    failed: false,
    failureCode: null,
    retentionInvalidated: false,
    closed: false,
    acceptingOperations: true,
    operationTail: Promise.resolve(),
    admissionStatus: "unissued",
    admissionCapability: null,
    admissionLease: null,
    finalizationDirectoryPath: null,
    finalizationDirectoryHandle: null,
  };
  const attempt = createAttemptHandle(identity);
  attemptVaultStates.set(attempt, state);
  let admissionPhase = "preflight";

  try {
    const requested = isAbsolute(outputDirectory)
      ? resolve(outputDirectory)
      : resolve(cwd, outputDirectory);
    state.parentPath = await filesystem.realpath(dirname(requested));
    state.destinationPath = resolve(state.parentPath, basename(requested));
    if (dirname(state.destinationPath) !== state.parentPath
      || state.destinationPath === state.parentPath
      || !isNarratorBoundedText(basename(state.destinationPath), 255)) {
      throw new Error("invalid output child");
    }
    const realRepositoryRoot = await filesystem.realpath(repositoryRoot);
    if (pathIsInside(realRepositoryRoot, state.destinationPath)) {
      throw new Error("output is inside repository");
    }
    await requirePrivateDirectory(filesystem, state.parentPath, expectedOwner);
    state.parentHandle = await openPrivateDirectoryHandle(
      filesystem,
      state.parentPath,
      expectedOwner,
      flags,
    );
    state.vaultPath = resolve(state.parentPath, identity.vaultName);
    state.lockPath = resolve(state.parentPath, identity.lockName);
    const outputReservation = createNarratorBrowserRateabilityOutputReservationV3(
      basename(state.destinationPath),
    );
    state.outputReservation = outputReservation;
    state.destinationLockPath = resolve(state.parentPath, outputReservation.lockName);
    if (state.destinationPath === state.vaultPath
      || state.destinationPath === state.lockPath
      || state.destinationPath === state.destinationLockPath) {
      throw new Error("output aliases an attempt control path");
    }
    await requireAttemptPathMissing(filesystem, state.destinationPath);
    await requireAttemptPathMissing(filesystem, state.vaultPath);
    await requireAttemptPathMissing(filesystem, state.lockPath);
    admissionPhase = "vault-start";
    await filesystem.mkdir(state.vaultPath, {
      recursive: false,
      mode: narratorBrowserRateabilityAttemptVaultContractV3.privateDirectoryMode,
    });
    await filesystem.chmod(
      state.vaultPath,
      narratorBrowserRateabilityAttemptVaultContractV3.privateDirectoryMode,
    );
    await requirePrivateDirectory(filesystem, state.vaultPath, expectedOwner);
    state.vaultHandle = await openPrivateDirectoryHandle(
      filesystem,
      state.vaultPath,
      expectedOwner,
      flags,
    );
    await state.parentHandle.sync();
    const start = createAttemptStartRecord({
      identity,
      sourceCommit,
      candidateId,
      sheetId,
      outputBasename: basename(state.destinationPath),
      outputReservationId: outputReservation.reservationId,
    });
    await publishAttemptRecord(state, "00-attempt-start.json", start, true);
    await state.parentHandle.sync();

    admissionPhase = "run-lock";
    await createAttemptLock(state, state.lockPath, "lockHandle");
    admissionPhase = "run-lock-parent-sync";
    await state.parentHandle.sync();

    admissionPhase = "destination-reservation";
    await createAttemptLock(
      state,
      state.destinationLockPath,
      "destinationLockHandle",
    );
    admissionPhase = "destination-lock-parent-sync";
    await state.parentHandle.sync();

    admissionPhase = "binding-revalidation";
    await requireBoundPrivateDirectory(state, state.parentPath, state.parentHandle);
    await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
    await verifyAttemptLock(state, state.lockPath, state.lockHandle);
    await verifyAttemptLock(
      state,
      state.destinationLockPath,
      state.destinationLockHandle,
    );
    admissionPhase = "destination-final-check";
    await requireAttemptPathMissing(filesystem, state.destinationPath);
    admissionPhase = "live";
  } catch (error) {
    const collision = isRecord(error)
      && error.code === "ERR_NARRATOR_V3_ATTEMPT_COLLISION";
    const hasDurableStart = state.recordSnapshots.has("00-attempt-start.json");
    if (hasDurableStart) {
      const failureCode = collision
        && (admissionPhase === "destination-reservation"
          || admissionPhase === "destination-final-check")
        ? "destination-reservation-collision"
        : "attempt-admission-failed";
      const expectedOwnedLockPaths = admissionPhase === "run-lock-parent-sync"
        || admissionPhase === "destination-reservation"
        ? Object.freeze([state.lockPath])
        : admissionPhase === "destination-lock-parent-sync"
          || admissionPhase === "binding-revalidation"
          || admissionPhase === "destination-final-check"
          ? Object.freeze([state.lockPath, state.destinationLockPath])
          : Object.freeze([]);
      await retainRejectedAttemptVault(
        state,
        attempt,
        failureCode,
        expectedOwnedLockPaths,
      );
      if (collision) throw error;
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_START_FAILED",
        "Narrator V3 rateability attempt admission failed; inspect the private parent",
      );
    }
    latchAttemptFailure(state, "attempt-admission-failed");
    try {
      await closeAttemptVaultHandles(state);
    } catch {
      // A path-free start error below covers retained handles and filesystem state.
    }
    if (isRecord(error) && error.code === "ERR_NARRATOR_V3_ATTEMPT_COLLISION") throw error;
    throw attemptVaultError(
      "ERR_NARRATOR_V3_ATTEMPT_START_FAILED",
      "Narrator V3 rateability attempt vault start failed; inspect the private parent",
    );
  }

  return attempt;
}

function captureAttemptAdmissionIssue(input) {
  try {
    if (!hasExactOwnKeys(input, ["attempt"])) {
      throw new TypeError("invalid admission issue");
    }
    return input.attempt;
  } catch {
    throw new TypeError("Narrator V3 rateability attempt admission issue is invalid");
  }
}

export function issueNarratorBrowserRateabilityAttemptAdmissionV3(input) {
  if (attemptAdmissionContext.getStore() !== undefined) {
    throw new TypeError("Narrator V3 rateability attempt admission is unavailable");
  }
  const attempt = captureAttemptAdmissionIssue(input);
  const state = requireActiveAttemptState(attempt);
  if (state.admissionStatus !== "unissued" || !attemptAdmissionIsFresh(state)) {
    throw new TypeError("Narrator V3 rateability attempt admission is unavailable");
  }
  state.admissionStatus = "issuing";
  let issuance;
  try {
    issuance = enqueueAttemptVaultOperation(state, () => {
      if (state.admissionStatus !== "issuing" || !attemptAdmissionIsFresh(state)) {
        invalidateAttemptAdmission(state);
        throw new TypeError("Narrator V3 rateability attempt admission is unavailable");
      }
      const admission = Object.freeze(Object.create(null));
      const binding = Object.freeze({ attempt, state });
      state.admissionCapability = admission;
      state.admissionStatus = "ready";
      readyAttemptAdmissions.set(admission, binding);
      return admission;
    });
  } catch (error) {
    invalidateAttemptAdmission(state);
    throw error;
  }
  return issuance;
}

function captureAttemptAdmissionRequest(input) {
  try {
    if (!hasExactOwnKeys(input, ["admission", "launchBrowser"])) {
      throw new TypeError("invalid admission request");
    }
    const admission = input.admission;
    const launchBrowser = input.launchBrowser;
    if ((typeof admission !== "object" && typeof admission !== "function")
      || admission === null
      || typeof launchBrowser !== "function") {
      throw new TypeError("invalid admission request");
    }
    return { admission, launchBrowser };
  } catch {
    throw new TypeError("Narrator V3 rateability attempt admission request is invalid");
  }
}

export async function consumeNarratorBrowserRateabilityAttemptAdmissionV3(input) {
  if (attemptAdmissionContext.getStore() !== undefined) {
    throw new TypeError("Narrator V3 rateability attempt admission is invalid");
  }
  const { admission, launchBrowser } = captureAttemptAdmissionRequest(input);
  const binding = readyAttemptAdmissions.get(admission);
  if (binding === undefined) {
    throw new TypeError("Narrator V3 rateability attempt admission is invalid");
  }
  const { attempt, state } = binding;
  if (state.admissionCapability !== admission
    || state.admissionStatus !== "ready"
    || state.closed
    || !state.acceptingOperations) {
    readyAttemptAdmissions.delete(admission);
    throw new TypeError("Narrator V3 rateability attempt admission is invalid");
  }

  readyAttemptAdmissions.delete(admission);
  const lease = {
    phase: "verifying",
    invalidated: false,
    admission,
    attempt,
    state,
    operationTail: Promise.resolve(),
    operationOutcomes: [],
    finalizationStatus: "unrequested",
    finalizationFailure: null,
    finalizationEvidence: null,
    finalizationTerminal: null,
    finalizationRecordNames: null,
  };
  state.admissionStatus = "verifying";
  state.admissionLease = lease;
  activeAttemptAdmissions.set(admission, binding);

  let admissionOperation;
  try {
    admissionOperation = enqueueAttemptVaultOperation(state, async () => {
      try {
        if (!attemptAdmissionIsFresh(state)) {
          throw new Error("attempt admission state is not fresh");
        }
        await verifyRetainedAttemptVault(state, {
          expectedOwnedLockPaths: Object.freeze([
            state.lockPath,
            state.destinationLockPath,
          ]),
          exactRecordNames: Object.freeze(["00-attempt-start.json"]),
        });
        await requireAttemptPathMissing(state.filesystem, state.destinationPath);
      } catch (error) {
        lease.phase = "draining";
        lease.invalidated = true;
        state.admissionStatus = "draining";
        activeAttemptAdmissions.delete(admission);
        const collision = isRecord(error)
          && error.code === "ERR_NARRATOR_V3_ATTEMPT_COLLISION";
        const failureCode = collision
          ? "destination-reservation-collision"
          : "attempt-admission-failed";
        await retainRejectedAttemptVault(
          state,
          attempt,
          failureCode,
          Object.freeze([state.lockPath, state.destinationLockPath]),
        );
        finishAttemptAdmission(state, lease, "invalid");
        if (collision) throw error;
        throw attemptVaultError(
          "ERR_NARRATOR_V3_ATTEMPT_ADMISSION_FAILED",
          "Narrator V3 rateability attempt admission failed",
        );
      }

      lease.phase = "active";
      state.admissionStatus = "active";
      let callbackPromise;
      attemptAdmissionContext.run(lease, () => {
        try {
          callbackPromise = Promise.resolve(launchBrowser());
        } catch {
          callbackPromise = Promise.reject();
        }
      });
      const callbackOutcome = await callbackPromise.then(
        (value) => ({ fulfilled: true, value }),
        () => ({ fulfilled: false, value: undefined }),
      );
      lease.phase = "draining";
      state.admissionStatus = "draining";
      await lease.operationTail;
      const operationOutcomes = await Promise.all(lease.operationOutcomes);
      let finalizationClosed = false;
      if (["terminal-verified", "terminal-failed"].includes(
        lease.finalizationStatus,
      )) {
        try {
          await verifySettledAttemptFinalization(state, lease);
          await closeAttemptVaultHandles(state, false);
          finalizationClosed = true;
        } catch {
          lease.finalizationStatus = "retention-uncertain";
          lease.finalizationFailure = attemptFinalizationRetentionFailure();
        }
      }
      if (lease.finalizationStatus === "retention-uncertain") {
        try {
          await closeAttemptVaultHandles(state, false);
        } catch {
          // The stable retention error below covers every close uncertainty.
        }
      }
      const succeeded = callbackOutcome.fulfilled
        && operationOutcomes.every((outcome) => outcome)
        && !lease.invalidated
        && lease.finalizationStatus === "terminal-verified"
        && finalizationClosed;
      finishAttemptAdmission(
        state,
        lease,
        succeeded ? "spent" : state.failed ? "failed" : "callback-failed",
      );
      if (!succeeded) {
        if (lease.finalizationFailure !== null) {
          throw lease.finalizationFailure;
        }
        if (callbackOutcome.fulfilled
          && operationOutcomes.every((outcome) => outcome)
          && lease.finalizationStatus === "unrequested") {
          throw attemptVaultError(
            "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_REQUIRED",
            "Narrator V3 rateability admitted callback did not finalize its attempt",
          );
        }
        throw attemptVaultError(
          "ERR_NARRATOR_V3_ATTEMPT_CALLBACK_FAILED",
          "Narrator V3 rateability admitted callback failed",
        );
      }
      return createSettledAttemptFinalizationReceipt(state, lease);
    });
  } catch (error) {
    finishAttemptAdmission(state, lease, "invalid");
    throw error;
  }

  try {
    return await admissionOperation;
  } catch (error) {
    if (state.admissionLease === lease) {
      finishAttemptAdmission(state, lease, "callback-failed");
    }
    throw error;
  }
}

export async function publishNarratorBrowserRateabilityAttemptRecordV3({
  attempt,
  name,
  value,
}) {
  const state = requireActiveAttemptState(attempt);
  return enqueuePublicAttemptVaultOperation(state, async () => {
    try {
      const snapshot = await publishAttemptRecord(state, name, value);
      if (name === "90-attempt-terminal.json") {
        invalidateAttemptAdmission(state, false);
      }
      return snapshot;
    } catch {
      latchAttemptFailure(state, attemptPublicationFailureCode(name));
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_PUBLISH_FAILED",
        "Narrator V3 rateability attempt record publication failed",
      );
    }
  });
}

export async function readNarratorBrowserRateabilityAttemptRecordV3({
  attempt,
  name,
  expected,
}) {
  const state = requireActiveAttemptState(attempt);
  return enqueuePublicAttemptVaultOperation(state, async () => {
    if (!narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.includes(name)) {
      latchAttemptFailure(state, "retention-verification-failed");
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_READBACK_FAILED",
        "Narrator V3 rateability attempt record readback failed",
      );
    }
    try {
      return await readAttemptRecord(state, name, expected);
    } catch {
      latchAttemptFailure(state, "retention-verification-failed");
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_READBACK_FAILED",
        "Narrator V3 rateability attempt record readback failed",
      );
    }
  });
}

async function verifyRetainedAttemptVault(
  state,
  {
    expectedOwnedLockPaths = Object.freeze([
      state.lockPath,
      state.destinationLockPath,
    ]),
    exactRecordNames = null,
  } = {},
) {
  if (state.retentionInvalidated) {
    throw new Error("attempt diagnostic was invalidated after publication");
  }
  const lockBindings = [
    Object.freeze({
      path: state.lockPath,
      handle: state.lockHandle,
    }),
    Object.freeze({
      path: state.destinationLockPath,
      handle: state.destinationLockHandle,
    }),
  ];
  const expectedOwnedLocks = new Set(expectedOwnedLockPaths);
  const validExpectedOwnedLocks = expectedOwnedLocks.size === expectedOwnedLockPaths.length
    && expectedOwnedLockPaths.every((path) =>
      lockBindings.some((binding) => binding.path === path));
  const ownedLockBindings = lockBindings.filter(({ path }) =>
    expectedOwnedLocks.has(path));
  const lockOwnershipIsExact = validExpectedOwnedLocks
    && lockBindings.every(({ path, handle }) => {
      const expectedOwned = expectedOwnedLocks.has(path);
      const observedOwned = state.ownedLockPaths.has(path);
      const committed = state.lockCommitments.has(path);
      return expectedOwned
        ? observedOwned && committed && handle !== null
        : !observedOwned && !committed && handle === null;
    });
  if (!lockOwnershipIsExact) {
    throw new Error("attempt lock ownership is incomplete");
  }
  await requireBoundPrivateDirectory(state, state.parentPath, state.parentHandle);
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  for (const { path, handle } of ownedLockBindings) {
    await verifyAttemptLock(state, path, handle);
    await handle.sync();
  }
  await state.vaultHandle.sync();
  await state.parentHandle.sync();
  await requireBoundPrivateDirectory(state, state.parentPath, state.parentHandle);
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  for (const { path, handle } of ownedLockBindings) {
    await verifyAttemptLock(state, path, handle);
  }
  if (state.publishedNames.size !== state.commitments.size) {
    throw new Error("private attempt record commitments are incomplete");
  }
  if (exactRecordNames !== null) {
    const actualNames = (await state.filesystem.readdir(state.vaultPath)).sort();
    const expectedNames = [...exactRecordNames].sort();
    if (actualNames.length !== expectedNames.length
      || actualNames.some((name, index) => name !== expectedNames[index])
      || state.publishedNames.size !== exactRecordNames.length
      || exactRecordNames.some((name) => !state.publishedNames.has(name))) {
      throw new Error("rejected attempt record set is incomplete");
    }
  }
  for (const name of narratorBrowserRateabilityAttemptVaultContractV3.fileOrder) {
    const published = state.publishedNames.has(name);
    const expected = state.commitments.get(name);
    if (published !== (expected !== undefined)) {
      throw new Error("private attempt record commitments are incomplete");
    }
    if (expected !== undefined) {
      await readAttemptRecord(state, name, expected);
    }
  }
}

export async function retainNarratorBrowserRateabilityAttemptVaultV3(attempt) {
  const state = requireActiveAttemptState(attempt);
  return enqueuePublicAttemptVaultOperation(state, async () => {
    let retentionVerified = false;
    try {
      await verifyRetainedAttemptVault(state);
      retentionVerified = true;
    } catch {
      latchAttemptFailure(state, "retention-verification-failed");
      // Handles are still closed below; neither retained lock path is removed.
    }
    let handlesClosed = false;
    try {
      await closeAttemptVaultHandles(state);
      handlesClosed = true;
    } catch {
      // The stable retention error below covers close failures without paths.
    }
    if (!retentionVerified || !handlesClosed) {
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
        "Narrator V3 rateability attempt vault retention could not be verified",
      );
    }
    return Object.freeze({
      schemaVersion: 1,
      attemptId: attempt.attemptId,
      vaultRetained: true,
      lockRetained: true,
    });
  }, true);
}

function evidenceValues(evidenceSet) {
  if (!isDenseArray(evidenceSet)
    || evidenceSet.length !== narratorBrowserRateabilityEvidenceFileNamesV3.length) {
    throw new TypeError("Narrator V3 rateability evidence set is invalid");
  }
  const values = {};
  for (let index = 0; index < narratorBrowserRateabilityEvidenceFileNamesV3.length; index += 1) {
    const expectedName = narratorBrowserRateabilityEvidenceFileNamesV3[index];
    const entry = evidenceSet[index];
    if (!hasExactKeys(entry, ["name", "value", "bytes"])
      || entry.name !== expectedName
      || !(entry.bytes instanceof Uint8Array)) {
      throw new TypeError("Narrator V3 rateability evidence set is invalid");
    }
    values[expectedName] = entry.value;
  }
  return values;
}

function captureAttemptFinalizationRequest(input) {
  try {
    if (!hasExactOwnKeys(input, ["admission"])) {
      throw new TypeError("invalid finalization request");
    }
    const admission = input.admission;
    if ((typeof admission !== "object" && typeof admission !== "function")
      || admission === null) {
      throw new TypeError("invalid finalization request");
    }
    return admission;
  } catch {
    throw new TypeError(
      "Narrator V3 rateability attempt finalization request is invalid",
    );
  }
}

function captureAttemptFailureFinalizationRequest(input) {
  try {
    if (!hasExactOwnKeys(input, ["admission", "failureCode"])) {
      throw new TypeError("invalid failure finalization request");
    }
    const admission = input.admission;
    const failureCode = input.failureCode;
    if ((typeof admission !== "object" && typeof admission !== "function")
      || admission === null
      || attemptPhaseFailureFinalizations.every((entry) =>
        entry.failureCode !== failureCode)) {
      throw new TypeError("invalid failure finalization request");
    }
    return { admission, failureCode };
  } catch {
    throw new TypeError(
      "Narrator V3 rateability attempt failure finalization request is invalid",
    );
  }
}

function attemptPhaseFailureFinalization(failureCode) {
  return attemptPhaseFailureFinalizations.find((entry) =>
    entry.failureCode === failureCode);
}

function committedAttemptPhaseFailurePrefix(state, definition, alreadyLatched) {
  const highestName = attemptVaultFiles[state.highestPublishedIndex];
  const allowedHighestNames = alreadyLatched
    ? definition.latchedHighestNames
    : definition.healthyHighestNames;
  if (!allowedHighestNames.includes(highestName)) return null;

  const recordNames = [];
  for (const name of attemptFinalizationPrefixFiles) {
    if (!state.publishedNames.has(name)
      || !state.commitments.has(name)
      || !state.recordSnapshots.has(name)) break;
    recordNames.push(name);
  }
  const preservationSnapshots = attemptPreservationPhases
    .filter(({ recordName }) => recordNames.includes(recordName))
    .map(({ recordName }) => requireAttemptFinalizationSnapshot(state, recordName));
  if (!validFailurePreservationPrefix(
    definition.failureCode,
    preservationSnapshots.length,
  )) return null;
  return Object.freeze({
    recordNames: Object.freeze(recordNames),
    preservationSnapshots: Object.freeze(preservationSnapshots),
  });
}

function attemptSnapshotCommitment(snapshot) {
  return deepFreezeJson(Object.fromEntries(
    attemptSnapshotFields.map((field) => [field, snapshot[field]]),
  ));
}

function requireAttemptFinalizationSnapshot(state, name) {
  const snapshot = state.recordSnapshots.get(name);
  if (snapshot === undefined
    || !state.publishedNames.has(name)
    || !state.commitments.has(name)) {
    throw new Error("attempt finalization snapshot is missing");
  }
  return snapshot;
}

function inspectAttemptFinalizationEvidence(state) {
  const snapshots = new Map(attemptFinalEvidenceSources.map(({ recordName }) => [
    recordName,
    requireAttemptFinalizationSnapshot(state, recordName),
  ]));
  const expectedBindings = requireAttemptFinalizationSnapshot(
    state,
    "20-expected-bindings.json",
  );
  const inspection = inspectNarratorBrowserRateabilityEvidenceSetV3({
    runPackage: snapshots.get("32-run-package.json").value,
    provenanceReceipt: snapshots.get("30-provenance-receipt.json").value,
    blindKey: snapshots.get("13-blind-key.json").value,
    blindSheet: snapshots.get("12-blind-sheet.json").value,
    rateabilitySummary: snapshots.get("11-rateability-summary.json").value,
    runReceipt: snapshots.get("10-run-receipt.json").value,
    expectedBindings: expectedBindings.value,
  });
  if (inspection.audit.verdict !== "pass") {
    return Object.freeze({
      audit: inspection.audit,
      evidence: null,
    });
  }

  const verifiedValues = evidenceValues(inspection.packageSnapshot?.evidenceSet);
  const evidence = attemptFinalEvidenceSources.map(({ name, recordName }, index) => {
    const entry = inspection.packageSnapshot.evidenceSet[index];
    const snapshot = snapshots.get(recordName);
    const bytes = snapshot.copyBytes();
    if (entry.name !== name
      || verifiedValues[name] === undefined
      || !sameCanonical(verifiedValues[name], snapshot.value)
      || !bytesEqual(entry.bytes, bytes)
      || bytes.byteLength !== snapshot.byteLength
      || digest(bytes) !== snapshot.sha256) {
      throw new Error("verified evidence diverged from the private vault");
    }
    return Object.freeze({ name, bytes });
  });
  return Object.freeze({
    audit: inspection.audit,
    evidence: Object.freeze(evidence),
  });
}

async function readAttemptFinalEvidenceFile(state, path, expectedBytes) {
  let handle = null;
  let primaryError = null;
  let bytes;
  let heldMetadata;
  try {
    handle = await state.filesystem.open(path, state.flags.read);
    heldMetadata = await handle.stat();
    const firstPathMetadata = await state.filesystem.lstat(path);
    if (!exactPrivateFileMetadata(heldMetadata, state.expectedOwner)
      || !exactPrivateFileMetadata(firstPathMetadata, state.expectedOwner)
      || !sameFilesystemObject(heldMetadata, firstPathMetadata)
      || heldMetadata.size !== expectedBytes.byteLength) {
      throw new Error("invalid private final evidence file");
    }
    bytes = new Uint8Array(await handle.readFile());
    const secondPathMetadata = await state.filesystem.lstat(path);
    if (!exactPrivateFileMetadata(secondPathMetadata, state.expectedOwner)
      || !sameFilesystemObject(heldMetadata, secondPathMetadata)
      || secondPathMetadata.size !== bytes.byteLength
      || !bytesEqual(bytes, expectedBytes)
      || digest(bytes) !== digest(expectedBytes)) {
      throw new Error("private final evidence changed during readback");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }
}

async function writeAttemptFinalEvidenceFile(state, path, bytes) {
  let handle = null;
  let primaryError = null;
  let heldMetadata;
  try {
    handle = await state.filesystem.open(
      path,
      state.flags.create,
      narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode,
    );
    await handle.chmod(
      narratorBrowserRateabilityAttemptVaultContractV3.privateFileMode,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    heldMetadata = await handle.stat();
    if (!exactPrivateFileMetadata(heldMetadata, state.expectedOwner)
      || heldMetadata.size !== bytes.byteLength) {
      throw new Error("invalid private final evidence file");
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch (error) {
        if (primaryError === null) throw error;
      }
    }
  }
  await readAttemptFinalEvidenceFile(state, path, bytes);
}

async function verifyBoundAttemptFinalDirectory(state, evidence) {
  const { finalizationDirectoryHandle: handle, finalizationDirectoryPath: path } = state;
  if (handle === null || path === null) {
    throw new Error("attempt finalization directory is not bound");
  }
  const verify = async () => {
    await requireBoundPrivateDirectory(state, path, handle);
    const names = (await state.filesystem.readdir(path)).sort();
    const expectedNames = evidence.map(({ name }) => name).sort();
    if (names.length !== expectedNames.length
      || names.some((name, index) => name !== expectedNames[index])) {
      throw new Error("attempt final output file set is invalid");
    }
    for (const entry of evidence) {
      await readAttemptFinalEvidenceFile(
        state,
        resolve(path, entry.name),
        entry.bytes,
      );
    }
  };
  await verify();
  await handle.sync();
  await verify();
}

async function createAttemptFinalizationStage(state, evidence) {
  const prefix = resolve(
    state.parentPath,
    `${stagingPrefix}${state.identity.attemptId}-`,
  );
  const path = await state.filesystem.mkdtemp(prefix);
  state.finalizationDirectoryPath = path;
  if (dirname(path) !== state.parentPath || !path.startsWith(prefix)) {
    throw new Error("attempt finalization staging directory escaped its parent");
  }
  await state.filesystem.chmod(
    path,
    narratorBrowserRateabilityAttemptVaultContractV3.privateDirectoryMode,
  );
  await requirePrivateDirectory(state.filesystem, path, state.expectedOwner);
  state.finalizationDirectoryHandle = await openPrivateDirectoryHandle(
    state.filesystem,
    path,
    state.expectedOwner,
    state.flags,
  );
  for (const entry of evidence) {
    await writeAttemptFinalEvidenceFile(
      state,
      resolve(path, entry.name),
      entry.bytes,
    );
  }
  await verifyBoundAttemptFinalDirectory(state, evidence);
}

async function publishAttemptFinalizationOutput(state, evidence) {
  await createAttemptFinalizationStage(state, evidence);
  await verifyRetainedAttemptVault(state, {
    exactRecordNames: attemptFinalizationPrefixFiles,
  });
  await verifyBoundAttemptFinalDirectory(state, evidence);
  await requireBoundPrivateDirectory(state, state.parentPath, state.parentHandle);
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  await verifyAttemptLock(state, state.lockPath, state.lockHandle);
  await verifyAttemptLock(
    state,
    state.destinationLockPath,
    state.destinationLockHandle,
  );
  await state.lockHandle.sync();
  await state.destinationLockHandle.sync();
  await state.vaultHandle.sync();
  await state.parentHandle.sync();
  await requireBoundPrivateDirectory(state, state.parentPath, state.parentHandle);
  await requireBoundPrivateDirectory(state, state.vaultPath, state.vaultHandle);
  await verifyAttemptLock(state, state.lockPath, state.lockHandle);
  await verifyAttemptLock(
    state,
    state.destinationLockPath,
    state.destinationLockHandle,
  );
  await requireAttemptPathMissing(state.filesystem, state.destinationPath);
  await state.filesystem.rename(
    state.finalizationDirectoryPath,
    state.destinationPath,
  );
  state.finalizationDirectoryPath = state.destinationPath;
  await state.parentHandle.sync();
  await verifyBoundAttemptFinalDirectory(state, evidence);
}

function attemptFinalizationPreservationSnapshots(state) {
  return attemptPreservationPhases.map(({ recordName }) =>
    requireAttemptFinalizationSnapshot(state, recordName));
}

async function publishAttemptFinalizationTerminal(
  state,
  attempt,
  audit,
  failureCode,
) {
  const diagnostic = await publishAttemptRecord(
    state,
    "40-verification-diagnostic.json",
    createNarratorBrowserRateabilityVerificationDiagnosticV3({
      audit,
      failureCode,
    }),
  );
  const terminal = await publishAttemptRecord(
    state,
    "90-attempt-terminal.json",
    createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt,
      preservationReceipts: attemptFinalizationPreservationSnapshots(state),
      verificationDiagnostic: diagnostic,
      runPackage: requireAttemptFinalizationSnapshot(state, "32-run-package.json"),
    }),
  );
  await verifyRetainedAttemptVault(state, {
    exactRecordNames: narratorBrowserRateabilityAttemptVaultContractV3.fileOrder,
  });
  return terminal;
}

async function publishAttemptPhaseFailureTerminal(
  state,
  attempt,
  failureCode,
  preservationSnapshots,
) {
  const diagnostic = await publishAttemptRecord(
    state,
    "40-verification-diagnostic.json",
    createNarratorBrowserRateabilityVerificationDiagnosticV3({
      audit: null,
      failureCode,
    }),
  );
  return await publishAttemptRecord(
    state,
    "90-attempt-terminal.json",
    createNarratorBrowserRateabilityAttemptTerminalReceiptV3({
      attempt,
      preservationReceipts: preservationSnapshots,
      verificationDiagnostic: diagnostic,
      runPackage: null,
    }),
  );
}

async function verifySettledAttemptFinalization(state, lease) {
  if (!isDenseArray(lease.finalizationRecordNames)
    || lease.finalizationRecordNames.length < 3
    || lease.finalizationRecordNames.at(-2) !== "40-verification-diagnostic.json"
    || lease.finalizationRecordNames.at(-1) !== "90-attempt-terminal.json") {
    throw new Error("attempt finalization record set is inconsistent");
  }
  await verifyRetainedAttemptVault(state, {
    exactRecordNames: lease.finalizationRecordNames,
  });
  const terminal = requireAttemptFinalizationSnapshot(
    state,
    "90-attempt-terminal.json",
  ).value;
  if (lease.finalizationStatus === "terminal-verified") {
    if (state.failed
      || state.failureCode !== null
      || terminal.terminalStatus !== "verified"
      || state.finalizationDirectoryPath !== state.destinationPath
      || !isDenseArray(lease.finalizationEvidence)
      || lease.finalizationEvidence.length
        !== narratorBrowserRateabilityEvidenceFileNamesV3.length) {
      throw new Error("verified attempt finalization state is inconsistent");
    }
    await verifyBoundAttemptFinalDirectory(state, lease.finalizationEvidence);
    await state.parentHandle.sync();
    await verifyBoundAttemptFinalDirectory(state, lease.finalizationEvidence);
  } else if (lease.finalizationStatus === "terminal-failed") {
    if (!state.failed
      || state.failureCode === null
      || terminal.terminalStatus !== "failed"
      || terminal.failureCode !== state.failureCode) {
      throw new Error("failed attempt finalization state is inconsistent");
    }
    const phaseFailure =
      attemptPhaseFailureFinalization(state.failureCode) !== undefined;
    if (state.failureCode === "evidence-verification-failed" || phaseFailure) {
      if (state.finalizationDirectoryPath !== null
        || state.finalizationDirectoryHandle !== null) {
        throw new Error("evidence-invalid attempt created output state");
      }
    }
    if (state.failureCode === "evidence-verification-failed") {
      await requireAttemptPathMissing(state.filesystem, state.destinationPath);
    }
  } else {
    throw new Error("attempt finalization did not reach a terminal state");
  }
  await verifyRetainedAttemptVault(state, {
    exactRecordNames: lease.finalizationRecordNames,
  });
}

function attemptFinalizationFailure() {
  return attemptVaultError(
    "ERR_NARRATOR_V3_ATTEMPT_FINALIZATION_FAILED",
    "Narrator V3 rateability attempt finalization failed",
  );
}

function createSettledAttemptFinalizationReceipt(state, lease) {
  if (state.closed !== true
    || lease.finalizationStatus !== "terminal-verified"
    || lease.finalizationTerminal === null) {
    throw attemptFinalizationRetentionFailure();
  }
  return Object.freeze({
    schemaVersion: 1,
    attemptId: state.identity.attemptId,
    outputBasename: basename(state.destinationPath),
    destinationPublished: true,
    destinationReservationConsumed: true,
    files: narratorBrowserRateabilityEvidenceFileNamesV3,
    terminal: lease.finalizationTerminal,
  });
}

function attemptFinalizationRetentionFailure() {
  return attemptVaultError(
    "ERR_NARRATOR_V3_ATTEMPT_RETENTION_FAILED",
    "Narrator V3 rateability attempt finalization retention could not be verified",
  );
}

function markAttemptFinalizationRetentionUncertain(state, lease) {
  lease.finalizationStatus = "retention-uncertain";
  lease.invalidated = true;
  state.retentionInvalidated = true;
  const error = attemptFinalizationRetentionFailure();
  lease.finalizationFailure = error;
  return error;
}

async function finalizeAttemptPhaseFailure(lease, failureCode) {
  const { attempt, state } = lease;
  const definition = attemptPhaseFailureFinalization(failureCode);
  const alreadyLatched = state.failed;
  const prefix = definition === undefined
    ? null
    : committedAttemptPhaseFailurePrefix(state, definition, alreadyLatched);
  if (prefix === null
    || state.retentionInvalidated
    || (alreadyLatched
      ? state.failureCode !== failureCode || !lease.invalidated
      : state.failureCode !== null || lease.invalidated)) {
    lease.finalizationStatus = "incomplete";
    lease.finalizationFailure = attemptFinalizationFailure();
    throw lease.finalizationFailure;
  }

  if (!alreadyLatched) latchAttemptFailure(state, failureCode);
  try {
    await verifyRetainedAttemptVault(state, {
      exactRecordNames: prefix.recordNames,
    });
  } catch {
    throw markAttemptFinalizationRetentionUncertain(state, lease);
  }

  const terminalRecordNames = Object.freeze([
    ...prefix.recordNames,
    "40-verification-diagnostic.json",
    "90-attempt-terminal.json",
  ]);
  let terminal;
  try {
    terminal = await publishAttemptPhaseFailureTerminal(
      state,
      attempt,
      failureCode,
      prefix.preservationSnapshots,
    );
    await verifyRetainedAttemptVault(state, {
      exactRecordNames: terminalRecordNames,
    });
  } catch {
    throw markAttemptFinalizationRetentionUncertain(state, lease);
  }
  lease.finalizationRecordNames = terminalRecordNames;
  lease.finalizationStatus = "terminal-failed";
  lease.finalizationTerminal = attemptSnapshotCommitment(terminal);
  lease.finalizationFailure = attemptFinalizationFailure();
  throw lease.finalizationFailure;
}

async function finalizeAttemptEvidence(binding, lease) {
  const { attempt, state } = binding;
  lease.finalizationStatus = "verifying";
  if (state.failed
    || state.failureCode !== null
    || state.retentionInvalidated
    || state.highestPublishedIndex
      !== narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.indexOf(
        "39-host-preservation.json",
      )) {
    lease.finalizationStatus = "incomplete";
    lease.finalizationFailure = attemptFinalizationFailure();
    throw lease.finalizationFailure;
  }
  let inspected;
  try {
    await verifyRetainedAttemptVault(state, {
      exactRecordNames: attemptFinalizationPrefixFiles,
    });
    inspected = inspectAttemptFinalizationEvidence(state);
  } catch {
    throw markAttemptFinalizationRetentionUncertain(state, lease);
  }

  if (inspected.audit.verdict !== "pass") {
    latchAttemptFailure(state, "evidence-verification-failed");
    try {
      await publishAttemptFinalizationTerminal(
        state,
        attempt,
        inspected.audit,
        "evidence-verification-failed",
      );
    } catch {
      throw markAttemptFinalizationRetentionUncertain(state, lease);
    }
    lease.finalizationStatus = "terminal-failed";
    lease.finalizationFailure = attemptFinalizationFailure();
    throw lease.finalizationFailure;
  }

  lease.finalizationStatus = "publishing";
  lease.finalizationEvidence = inspected.evidence;
  try {
    await publishAttemptFinalizationOutput(state, inspected.evidence);
  } catch {
    latchAttemptFailure(state, "evidence-publication-failed");
    try {
      await publishAttemptFinalizationTerminal(
        state,
        attempt,
        inspected.audit,
        "evidence-publication-failed",
      );
    } catch {
      throw markAttemptFinalizationRetentionUncertain(state, lease);
    }
    lease.finalizationStatus = "terminal-failed";
    lease.finalizationFailure = attemptFinalizationFailure();
    throw lease.finalizationFailure;
  }

  let terminal;
  try {
    terminal = await publishAttemptFinalizationTerminal(
      state,
      attempt,
      inspected.audit,
      null,
    );
  } catch {
    throw markAttemptFinalizationRetentionUncertain(state, lease);
  }
  lease.finalizationStatus = "terminal-verified";
  lease.finalizationTerminal = attemptSnapshotCommitment(terminal);
}

export function finalizeNarratorBrowserRateabilityAttemptFailureV3(input) {
  const { admission, failureCode } = captureAttemptFailureFinalizationRequest(input);
  const lease = attemptAdmissionContext.getStore();
  const state = lease?.state;
  const binding = activeAttemptAdmissions.get(admission);
  const healthy = state !== undefined
    && !state.failed
    && state.failureCode === null
    && !lease.invalidated
    && binding?.attempt === lease.attempt
    && binding.state === state;
  const matchingLatch = state !== undefined
    && state.failed
    && state.failureCode === failureCode
    && lease.invalidated
    && binding === undefined;
  if (state === undefined
    || lease.admission !== admission
    || lease.attempt === undefined
    || attemptVaultStates.get(lease.attempt) !== state
    || state.admissionLease !== lease
    || state.admissionCapability !== admission
    || state.admissionStatus !== "active"
    || lease.phase !== "active"
    || lease.finalizationStatus !== "unrequested"
    || lease.finalizationRecordNames !== null
    || state.closed
    || !state.acceptingOperations
    || state.retentionInvalidated
    || state.finalizationDirectoryPath !== null
    || state.finalizationDirectoryHandle !== null
    || ["40-verification-diagnostic.json", "90-attempt-terminal.json"].some((name) =>
      state.publishedNames.has(name)
        || state.commitments.has(name)
        || state.recordSnapshots.has(name))
    || (!healthy && !matchingLatch)) {
    throw new TypeError("Narrator V3 rateability attempt failure finalization is invalid");
  }

  lease.finalizationStatus = "failure-reserved";
  lease.phase = "finalizing";
  activeAttemptAdmissions.delete(admission);
  enqueueAdmissionLeaseOperation(
    lease,
    () => finalizeAttemptPhaseFailure(lease, failureCode),
  );
}

export function finalizeNarratorBrowserRateabilityAttemptEvidenceV3(input) {
  const admission = captureAttemptFinalizationRequest(input);
  const binding = activeAttemptAdmissions.get(admission);
  const lease = attemptAdmissionContext.getStore();
  if (binding === undefined
    || lease === undefined
    || lease !== binding.state.admissionLease
    || lease.admission !== admission
    || lease.state !== binding.state
    || binding.state.admissionCapability !== admission
    || binding.state.admissionStatus !== "active"
    || lease.phase !== "active"
    || lease.invalidated
    || lease.finalizationStatus !== "unrequested") {
    throw new TypeError("Narrator V3 rateability attempt finalization is invalid");
  }

  lease.finalizationStatus = "reserved";
  lease.finalizationRecordNames = narratorBrowserRateabilityAttemptVaultContractV3.fileOrder;
  lease.phase = "finalizing";
  activeAttemptAdmissions.delete(admission);
  enqueueAdmissionLeaseOperation(
    lease,
    () => finalizeAttemptEvidence(binding, lease),
  );
}

function captureAttemptCoordinatorRequest(input) {
  try {
    if (!hasExactOwnKeys(input, [
      "committedSources",
      "loadHostEvidence",
      "observe",
      "start",
    ])) {
      throw new TypeError("invalid attempt coordinator request");
    }
    const startInput = input.start;
    const observe = input.observe;
    const loadHostEvidence = input.loadHostEvidence;
    const committedSourcesInput = input.committedSources;
    if (!hasExactOwnKeys(startInput, [
      "candidateId",
      "outputDirectory",
      "runId",
      "sheetId",
      "sourceCommit",
    ])
      || typeof observe !== "function"
      || typeof loadHostEvidence !== "function"
      || !isDenseArray(committedSourcesInput)) {
      throw new TypeError("invalid attempt coordinator request");
    }
    const start = Object.freeze({
      outputDirectory: startInput.outputDirectory,
      sourceCommit: startInput.sourceCommit,
      candidateId: startInput.candidateId,
      runId: startInput.runId,
      sheetId: startInput.sheetId,
    });
    const seenPaths = new Set();
    const committedSources = committedSourcesInput.map((source) => {
      if (!hasExactOwnKeys(source, ["bytes", "path"])) {
        throw new TypeError("invalid committed source");
      }
      const path = source.path;
      const bytes = source.bytes;
      if (typeof path !== "string"
        || path.length === 0
        || !(bytes instanceof ArrayBuffer)
        || seenPaths.has(path)) {
        throw new TypeError("invalid committed source");
      }
      seenPaths.add(path);
      return Object.freeze({ path, bytes: bytes.slice(0) });
    });
    return Object.freeze({
      start,
      observe,
      loadHostEvidence,
      committedSources: Object.freeze(committedSources),
    });
  } catch {
    throw new TypeError(
      "Narrator V3 rateability attempt coordinator request is invalid",
    );
  }
}

function captureAttemptCoordinatorCompleted(input) {
  try {
    if (!hasExactOwnKeys(input, ["key", "receipt", "sheet", "summary"])) {
      throw new TypeError("invalid completed evidence");
    }
    return Object.freeze({
      receipt: input.receipt,
      summary: input.summary,
      sheet: input.sheet,
      key: input.key,
    });
  } catch {
    throw new TypeError(
      "Narrator V3 rateability completed evidence is invalid",
    );
  }
}

function captureAttemptCoordinatorHost(input) {
  try {
    const createProvenanceReceipt =
      input.createAndVerifyNarratorBrowserProvenanceReceiptV3;
    const createRunPackage =
      input.createAndVerifyNarratorBrowserRunPackageV3;
    if (typeof createProvenanceReceipt !== "function"
      || typeof createRunPackage !== "function") {
      throw new TypeError("invalid observed host");
    }
    return Object.freeze({ createProvenanceReceipt, createRunPackage });
  } catch {
    throw new TypeError(
      "Narrator V3 rateability observed host module is invalid",
    );
  }
}

async function publishAttemptCoordinatorCore(attempt, input) {
  const completed = captureAttemptCoordinatorCompleted(input);
  const receipt = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "10-run-receipt.json",
    value: completed.receipt,
  });
  const summary = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "11-rateability-summary.json",
    value: completed.summary,
  });
  const sheet = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "12-blind-sheet.json",
    value: completed.sheet,
  });
  const key = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "13-blind-key.json",
    value: completed.key,
  });
  await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "19-core-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "core",
      records: [receipt, summary, sheet, key],
    }),
  });
  return Object.freeze({
    receipt: receipt.value,
    summary: summary.value,
    sheet: sheet.value,
    key: key.value,
  });
}

async function publishAttemptCoordinatorBindings(attempt, value) {
  const expectedBindings =
    await publishNarratorBrowserRateabilityAttemptRecordV3({
      attempt,
      name: "20-expected-bindings.json",
      value,
    });
  await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "29-bindings-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "bindings",
      records: [expectedBindings],
    }),
  });
  return expectedBindings.value;
}

function provenanceRequestFromAttemptBindings(expectedBindings) {
  return Object.freeze({
    sourceCommit: expectedBindings.sourceCommit,
    observedBuild: expectedBindings.observedBuild,
    buildToolchain: expectedBindings.buildToolchain,
    browser: expectedBindings.browser,
    network: expectedBindings.network,
  });
}

async function publishAttemptCoordinatorProvenance(attempt, value) {
  const provenance = await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "30-provenance-receipt.json",
    value,
  });
  await publishNarratorBrowserRateabilityAttemptRecordV3({
    attempt,
    name: "31-provenance-preservation.json",
    value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
      attempt,
      phase: "provenance",
      records: [provenance],
    }),
  });
  return provenance;
}

function createAttemptCoordinatorReport(
  expectedBindings,
  completed,
  provenanceReceipt,
  runPackage,
) {
  return Object.freeze({
    status: runPackage.disposition === "rateable-for-blind-rating"
      ? "ok"
      : "blocked",
    mode: "run",
    sourceCommit: expectedBindings.sourceCommit,
    packageHash: runPackage.contentHash,
    provenanceHash: provenanceReceipt.contentHash,
    rateabilitySummaryHash: completed.summary.contentHash,
    validRowCount: completed.summary.validRowCount,
    rateableNonBaselineCount: completed.summary.rateableNonBaselineCount,
    disposition: runPackage.disposition,
    blockers: Object.freeze([...runPackage.blockers]),
    stagingExternalRequestCount:
      expectedBindings.network.stagingExternalRequestCount,
    postOfflineRequestCount: expectedBindings.network.postOfflineRequestCount,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
}

export async function coordinateNarratorBrowserRateabilityAttemptV3(input) {
  const {
    start,
    observe,
    loadHostEvidence,
    committedSources,
  } = captureAttemptCoordinatorRequest(input);
  const attempt = await beginNarratorBrowserRateabilityAttemptVaultV3(start);
  let admission;
  try {
    admission = await issueNarratorBrowserRateabilityAttemptAdmissionV3({
      attempt,
    });
  } catch (error) {
    try {
      await retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
    } catch (retentionError) {
      throw retentionError;
    }
    throw error;
  }

  let callbackEntered = false;
  let finalizationReserved = false;
  let completed = null;
  let expectedBindings = null;
  let provenanceReceipt = null;
  let runPackage = null;
  try {
    await consumeNarratorBrowserRateabilityAttemptAdmissionV3({
      admission,
      launchBrowser: async () => {
        callbackEntered = true;
        let producerSealConfirmed = false;
        let coreSettled = false;
        let corePromise = null;
        let hooksActive = true;
        const preserveCore = (value) => {
          if (!hooksActive || corePromise !== null || producerSealConfirmed) {
            throw new TypeError(
              "Narrator V3 rateability core preservation is invalid",
            );
          }
          corePromise = publishAttemptCoordinatorCore(attempt, value).then(
            (preserved) => {
              completed = preserved;
              coreSettled = true;
              return preserved;
            },
            (error) => {
              coreSettled = true;
              throw error;
            },
          );
          return corePromise;
        };
        const confirmProducerSeal = (...arguments_) => {
          if (!hooksActive
            || arguments_.length !== 0
            || producerSealConfirmed
            || (corePromise !== null && !coreSettled)) {
            throw new TypeError(
              "Narrator V3 rateability producer seal is invalid",
            );
          }
          producerSealConfirmed = true;
        };
        const hooks = Object.freeze(Object.assign(Object.create(null), {
          preserveCore,
          confirmProducerSeal,
        }));
        let observedBindings;
        let observationError = null;
        try {
          observedBindings = await observe(hooks);
        } catch (error) {
          observationError = error;
        } finally {
          hooksActive = false;
        }
        if (corePromise !== null) {
          try {
            await corePromise;
          } catch (error) {
            if (observationError === null) observationError = error;
          }
        }
        if (!producerSealConfirmed) {
          throw observationError ?? new Error(
            "Narrator V3 rateability producer seal was not confirmed",
          );
        }
        const reserveFailure = (failureCode) => {
          const result = finalizeNarratorBrowserRateabilityAttemptFailureV3({
            admission,
            failureCode,
          });
          finalizationReserved = true;
          return result;
        };
        if (observationError !== null || completed === null) {
          reserveFailure(completed === null
            ? "core-preservation-failed"
            : "bindings-preservation-failed");
          throw observationError ?? new Error(
            "Narrator V3 rateability core evidence was not preserved",
          );
        }
        const phase = async (failureCode, operation) => {
          try {
            return await operation();
          } catch (error) {
            reserveFailure(failureCode);
            throw error;
          }
        };

        expectedBindings = await phase(
          "bindings-preservation-failed",
          () => publishAttemptCoordinatorBindings(attempt, observedBindings),
        );
        const provenanceRequest =
          provenanceRequestFromAttemptBindings(expectedBindings);
        const host = await phase(
          "host-construction-failed",
          async () => captureAttemptCoordinatorHost(await loadHostEvidence()),
        );
        const createdProvenance = await phase(
          "host-construction-failed",
          () => host.createProvenanceReceipt(
            provenanceRequest,
            completed,
            committedSources,
          ),
        );
        const provenance = await phase(
          "provenance-preservation-failed",
          () => publishAttemptCoordinatorProvenance(
            attempt,
            createdProvenance,
          ),
        );
        provenanceReceipt = provenance.value;
        const createdPackage = await phase(
          "host-construction-failed",
          () => host.createRunPackage(completed, provenanceReceipt),
        );
        const publishedPackage = await phase(
          "host-construction-failed",
          () => publishNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: "32-run-package.json",
            value: createdPackage,
          }),
        );
        runPackage = publishedPackage.value;
        await phase(
          "host-preservation-failed",
          () => publishNarratorBrowserRateabilityAttemptRecordV3({
            attempt,
            name: "39-host-preservation.json",
            value: createNarratorBrowserRateabilityAttemptPreservationReceiptV3({
              attempt,
              phase: "host",
              records: [provenance, publishedPackage],
            }),
          }),
        );
        const result = finalizeNarratorBrowserRateabilityAttemptEvidenceV3({
          admission,
        });
        finalizationReserved = true;
        return result;
      },
    });
  } catch (error) {
    if (callbackEntered && !finalizationReserved) {
      try {
        await retainNarratorBrowserRateabilityAttemptVaultV3(attempt);
      } catch (retentionError) {
        throw retentionError;
      }
    }
    throw error;
  }

  return createAttemptCoordinatorReport(
    expectedBindings,
    completed,
    provenanceReceipt,
    runPackage,
  );
}

export async function finalizeNarratorBrowserRateabilityEvidenceV3({
  outputDirectory,
  evidenceSet,
  expectedBindings,
  filesystem: filesystemOverrides = {},
  repositoryRoot = defaultRepositoryRoot,
  cwd = process.cwd(),
}) {
  if (process.platform === "win32") {
    throw new Error("Narrator V3 rateability evidence collection requires POSIX permissions");
  }
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
    throw new TypeError("Narrator V3 rateability output directory is invalid");
  }
  const filesystem = { ...defaultFilesystem, ...filesystemOverrides };
  if (Object.values(filesystem).some((operation) => typeof operation !== "function")) {
    throw new TypeError("Narrator V3 rateability filesystem is invalid");
  }

  const values = evidenceValues(evidenceSet);
  const verified = verifyNarratorBrowserRateabilityEvidenceSetV3({
    runPackage: values["run-package.json"],
    provenanceReceipt: values["adapter-run-provenance-receipt.json"],
    blindKey: values["blind-key.json"],
    blindSheet: values["blind-sheet.json"],
    rateabilitySummary: values["rateability-summary.json"],
    runReceipt: values["run-receipt.json"],
    expectedBindings,
  });
  const requested = isAbsolute(outputDirectory) ? resolve(outputDirectory) : resolve(cwd, outputDirectory);
  const parent = await filesystem.realpath(dirname(requested));
  const destination = resolve(parent, basename(requested));
  if (dirname(destination) !== parent || destination === parent) {
    throw new Error("Narrator V3 rateability output must name one new child directory");
  }
  const realRepositoryRoot = await filesystem.realpath(repositoryRoot);
  if (pathIsInside(realRepositoryRoot, destination)) {
    throw new Error("Narrator V3 rateability run output must be outside the repository");
  }
  if (typeof process.geteuid !== "function") {
    throw new Error("Narrator V3 rateability evidence collection requires a POSIX effective user id");
  }
  const expectedOwner = process.geteuid();
  await requirePrivateDirectory(filesystem, parent, expectedOwner);
  const lockPath = cooperativeLockPath(parent, destination);
  const lockHandle = await acquireCooperativeLock(filesystem, lockPath, expectedOwner);

  let stagingDirectory = null;
  let published = false;
  let result = null;
  const failures = [];
  try {
    // The exact-mode, current-user-owned parent plus this lock defines the
    // cooperative no-overwrite boundary for collectors using this tool.
    await requireMissing(filesystem, destination);
    stagingDirectory = await filesystem.mkdtemp(resolve(parent, stagingPrefix));
    if (dirname(stagingDirectory) !== parent || !stagingDirectory.startsWith(resolve(parent, stagingPrefix))) {
      throw new Error("Narrator V3 rateability staging directory escaped its parent");
    }
    await filesystem.chmod(stagingDirectory, 0o700);
    await requirePrivateDirectory(filesystem, stagingDirectory, expectedOwner);
    for (const entry of verified) {
      const bytes = new Uint8Array(entry.bytes.byteLength);
      bytes.set(entry.bytes);
      await writePrivateFile(filesystem, resolve(stagingDirectory, entry.name), bytes, expectedOwner);
    }
    await verifyFinalDirectory(filesystem, stagingDirectory, expectedOwner);
    await requireMissing(filesystem, destination);
    await filesystem.rename(stagingDirectory, destination);
    stagingDirectory = null;
    published = true;
    await verifyFinalDirectory(filesystem, destination, expectedOwner);
    result = Object.freeze({
      outputDirectory: destination,
      files: narratorBrowserRateabilityEvidenceFileNamesV3,
    });
  } catch (error) {
    failures.push(error);
    const cleanupTarget = published ? destination : stagingDirectory;
    if (cleanupTarget !== null) {
      try {
        await filesystem.rm(cleanupTarget, { recursive: true, force: true });
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
  }
  try {
    await cleanupCooperativeLock(filesystem, lockPath, lockHandle);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Narrator V3 rateability finalization or cleanup failed; inspect the output parent before retrying",
    );
  }
  return result;
}
