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

function isDenseArray(value) {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
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
  const required = ["chmod", "link", "lstat", "mkdir", "open", "realpath", "unlink"];
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

async function closeAttemptVaultHandles(state) {
  if (state.closed) return;
  state.closed = true;
  const failures = [];
  for (const key of [
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
    if (isRecord(error) && error.code === "EEXIST") {
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

function validAttemptRecordProjection(name, value) {
  if (!isRecord(value)) return false;
  if (name === "20-expected-bindings.json") {
    return !Object.hasOwn(value, "schemaVersion") && !Object.hasOwn(value, "contentHash");
  }
  return Number.isSafeInteger(value.schemaVersion) && hasCanonicalContentHash(value);
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
  if (!bytesEqual(bytes, serialized) || !validAttemptRecordProjection(name, value)) {
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
    parentPath: null,
    destinationPath: null,
    vaultPath: null,
    lockPath: null,
    destinationLockPath: null,
    parentHandle: null,
    vaultHandle: null,
    lockHandle: null,
    destinationLockHandle: null,
    lockCommitments: new Map(),
    commitments: new Map(),
    publishedNames: new Set(),
    highestPublishedIndex: -1,
    failed: false,
    closed: false,
    acceptingOperations: true,
    operationTail: Promise.resolve(),
  };

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
    state.destinationLockPath = resolve(state.parentPath, outputReservation.lockName);
    if (state.destinationPath === state.vaultPath
      || state.destinationPath === state.lockPath
      || state.destinationPath === state.destinationLockPath) {
      throw new Error("output aliases an attempt control path");
    }
    await requireAttemptPathMissing(filesystem, state.destinationPath);
    await requireAttemptPathMissing(filesystem, state.vaultPath);
    await createAttemptLock(state, state.lockPath, "lockHandle");
    await state.parentHandle.sync();
    await createAttemptLock(
      state,
      state.destinationLockPath,
      "destinationLockHandle",
    );
    await state.parentHandle.sync();
    await requireAttemptPathMissing(filesystem, state.destinationPath);
    await requireAttemptPathMissing(filesystem, state.vaultPath);
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
  } catch (error) {
    state.failed = true;
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

  const attempt = Object.freeze({
    schemaVersion: 1,
    attemptId: identity.attemptId,
    vaultContractHash: narratorBrowserRateabilityAttemptVaultContractHashV3,
  });
  attemptVaultStates.set(attempt, state);
  return attempt;
}

export async function publishNarratorBrowserRateabilityAttemptRecordV3({
  attempt,
  name,
  value,
}) {
  const state = requireActiveAttemptState(attempt);
  return enqueueAttemptVaultOperation(state, async () => {
    try {
      return await publishAttemptRecord(state, name, value);
    } catch {
      state.failed = true;
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
  return enqueueAttemptVaultOperation(state, async () => {
    if (!narratorBrowserRateabilityAttemptVaultContractV3.fileOrder.includes(name)) {
      state.failed = true;
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_READBACK_FAILED",
        "Narrator V3 rateability attempt record readback failed",
      );
    }
    try {
      return await readAttemptRecord(state, name, expected);
    } catch {
      state.failed = true;
      throw attemptVaultError(
        "ERR_NARRATOR_V3_ATTEMPT_READBACK_FAILED",
        "Narrator V3 rateability attempt record readback failed",
      );
    }
  });
}

async function verifyRetainedAttemptVault(state) {
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
  if (state.publishedNames.size !== state.commitments.size) {
    throw new Error("private attempt record commitments are incomplete");
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
  return enqueueAttemptVaultOperation(state, async () => {
    let retentionVerified = false;
    try {
      await verifyRetainedAttemptVault(state);
      retentionVerified = true;
    } catch {
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
