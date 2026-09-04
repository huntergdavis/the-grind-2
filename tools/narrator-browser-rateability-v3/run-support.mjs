import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
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
  lstat,
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

function matchesExpectedBindings({
  runPackage,
  provenanceReceipt,
  blindSheet,
  rateabilitySummary,
  runReceipt,
  expectedBindings,
}) {
  const runSpec = runReceipt.runSpec;
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
  const lifecycle = {
    load: runReceipt.load,
    completedRowCount: runReceipt.completedRowCount,
    dispose: runReceipt.dispose,
    termination: runReceipt.termination,
  };
  const expectedBlockers = [
    ...rateabilitySummary.blockers,
    ...expectedNetworkBlockers(expectedBindings.network),
  ];

  return runPackage.sourceCommit === expectedBindings.sourceCommit
    && provenanceReceipt.sourceCommit === expectedBindings.sourceCommit
    && sameCanonical(observedBuild, expectedBindings.observedBuild)
    && sameCanonical(provenanceReceipt.buildToolchain, expectedBuildToolchain)
    && sameCanonical(provenanceReceipt.browser, expectedBindings.browser)
    && sameCanonical(provenanceReceipt.network, expectedBindings.network)
    && sameCanonical(runSpec.candidate, expectedRunSpecCandidateBinding(expectedBindings))
    && sameCanonical(provenanceReceipt.verifiedModelArtifacts, expectedBindings.modelArtifacts)
    && sameCanonical(runReceipt.verifiedArtifacts, expectedBindings.modelArtifacts)
    && sameCanonical(provenanceReceipt.runtime, expectedBindings.runtime)
    && sameCanonical(provenanceReceipt.verifiedRuntimeArtifacts, expectedBindings.runtimeArtifacts)
    && sameCanonical(provenanceReceipt.lifecycle, lifecycle)
    && sameCanonical(provenanceReceipt.runSpec, runSpec)
    && provenanceReceipt.workerEpoch === runReceipt.workerEpoch
    && sameCanonical(provenanceReceipt.workerBinding, runReceipt.workerBinding)
    && provenanceReceipt.workerBindingHash === runReceipt.workerBindingHash
    && runPackage.workerBindingHash === runReceipt.workerBindingHash
    && runPackage.candidateId === expectedBindings.candidate.candidateId
    && rateabilitySummary.candidateId === expectedBindings.candidate.candidateId
    && runSpec.runId === expectedBindings.runId
    && runPackage.runId === expectedBindings.runId
    && blindSheet.sheetId === expectedBindings.sheetId
    && runPackage.sheetId === expectedBindings.sheetId
    && provenanceReceipt.adapterSmokeSourceCommit === expectedBindings.adapterSmoke.sourceCommit
    && runPackage.adapterSmokeSourceCommit === expectedBindings.adapterSmoke.sourceCommit
    && provenanceReceipt.adapterSmokeReceiptHash === expectedBindings.adapterSmoke.receiptHash
    && runPackage.adapterSmokeReceiptHash === expectedBindings.adapterSmoke.receiptHash
    && sameCanonical(provenanceReceipt.blockers, expectedBlockers)
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

function linkedEvidenceIsValid({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
  expectedBindings,
}) {
  const runSpec = isRecord(runReceipt.runSpec) ? runReceipt.runSpec : null;
  const candidate = runSpec !== null && isRecord(runSpec.candidate) ? runSpec.candidate : null;
  const contractHashes = runPackage.contractHashes;
  if (runSpec === null
    || candidate === null
    || !hasValidContentHash(runSpec)
    || !hasExactKeys(provenanceReceipt, provenanceReceiptKeys)
    || !hasExactKeys(runReceipt, runReceiptKeys)
    || !hasExactKeys(rateabilitySummary, rateabilitySummaryKeys)
    || !hasExactKeys(blindSheet, blindSheetKeys)
    || !hasExactKeys(blindKey, blindKeyKeys)
    || !hasExactKeys(contractHashes, packageContractHashKeys)
    || !sameCanonical(contractHashes, frozenContractBindings.contractHashes)
    || runPackage.packageId !== frozenContractBindings.packageId
    || runPackage.packageContractHash !== frozenContractBindings.packageContractHash
    || provenanceReceipt.receiptId !== frozenContractBindings.provenanceReceiptId
    || provenanceReceipt.fullRunContractHash !== frozenContractBindings.contractHashes.browserFullRun
    || provenanceReceipt.formSelectionContractHash !== frozenContractBindings.contractHashes.formSelection
    || provenanceReceipt.transformersAdapterContractHash
      !== frozenContractBindings.contractHashes.transformersAdapter
    || provenanceReceipt.protocolContractHash !== frozenContractBindings.contractHashes.workerProtocol
    || provenanceReceipt.caseReceiptContractHash !== frozenContractBindings.contractHashes.caseReceipt
    || provenanceReceipt.runReceiptContractHash !== frozenContractBindings.contractHashes.runReceipt
    || provenanceReceipt.runnerSequencingContractHash
      !== frozenContractBindings.contractHashes.runnerSequencing
    || provenanceReceipt.evidenceContractHash !== frozenContractBindings.contractHashes.evidence
    || provenanceReceipt.blindStudyContractHash !== frozenContractBindings.contractHashes.blindStudy
    || provenanceReceipt.rateabilityContractHash !== frozenContractBindings.contractHashes.rateability
    || provenanceReceipt.adapterSmokeContractHash !== frozenContractBindings.adapterSmokeContractHash
    || provenanceReceipt.adapterSmokeSourceCommit !== frozenContractBindings.adapterSmokeSourceCommit
    || provenanceReceipt.adapterSmokeReceiptHash !== frozenContractBindings.adapterSmokeReceiptHash
    || runReceipt.runReceiptContractHash !== frozenContractBindings.contractHashes.runReceipt
    || runReceipt.protocolContractHash !== frozenContractBindings.contractHashes.workerProtocol
    || runReceipt.runnerSequencingContractHash
      !== frozenContractBindings.contractHashes.runnerSequencing
    || runReceipt.evidenceContractHash !== frozenContractBindings.contractHashes.evidence
    || rateabilitySummary.summaryId !== frozenContractBindings.rateabilitySummaryId
    || rateabilitySummary.rateabilityContractHash !== frozenContractBindings.contractHashes.rateability
    || blindSheet.selectionContractHash !== frozenContractBindings.contractHashes.formSelection
    || blindSheet.evidenceContractHash !== frozenContractBindings.contractHashes.evidence
    || blindSheet.blindStudyContractHash !== frozenContractBindings.contractHashes.blindStudy
    || blindKey.selectionContractHash !== frozenContractBindings.contractHashes.formSelection
    || blindKey.evidenceContractHash !== frozenContractBindings.contractHashes.evidence
    || blindKey.blindStudyContractHash !== frozenContractBindings.contractHashes.blindStudy
    || runPackage.adapterSmokeSourceCommit !== frozenContractBindings.adapterSmokeSourceCommit
    || runPackage.adapterSmokeReceiptHash !== frozenContractBindings.adapterSmokeReceiptHash
    || runPackage.sourceCommit !== provenanceReceipt.sourceCommit
    || runPackage.candidateId !== candidate.candidateId
    || runPackage.candidateId !== rateabilitySummary.candidateId
    || runPackage.runId !== runSpec.runId
    || runPackage.sheetId !== blindSheet.sheetId
    || runPackage.runSpecHash !== runSpec.contentHash
    || runPackage.workerBindingHash !== runReceipt.workerBindingHash
    || runPackage.adapterSmokeSourceCommit !== provenanceReceipt.adapterSmokeSourceCommit
    || runPackage.adapterSmokeReceiptHash !== provenanceReceipt.adapterSmokeReceiptHash
    || provenanceReceipt.runReceiptHash !== runReceipt.contentHash
    || provenanceReceipt.rateabilitySummaryHash !== rateabilitySummary.contentHash
    || rateabilitySummary.runReceiptHash !== runReceipt.contentHash
    || rateabilitySummary.runSpecHash !== runSpec.contentHash
    || blindSheet.runReceiptHash !== runReceipt.contentHash
    || blindSheet.runSpecHash !== runSpec.contentHash
    || blindKey.runReceiptHash !== runReceipt.contentHash
    || blindKey.runSpecHash !== runSpec.contentHash
    || blindKey.sheetHash !== blindSheet.contentHash
    || !isRecord(runSpec.corpus)
    || rateabilitySummary.corpusHash !== runSpec.corpus.hash
    || blindSheet.corpusHash !== runSpec.corpus.hash
    || rateabilitySummary.completedRowCount !== runReceipt.completedRowCount
    || runReceipt.verifiedArtifactsHash !== canonicalHash(runReceipt.verifiedArtifacts)
    || !validRunRowsCommitment(runReceipt)
    || provenanceReceipt.disposition !== runPackage.disposition
    || !sameCanonical(provenanceReceipt.blockers, runPackage.blockers)
    || !validBlockers(rateabilitySummary.blockers)
    || rateabilitySummary.blockers.some((blocker) => !rateabilityBlockers.has(blocker))
    || !validDisposition(provenanceReceipt.disposition, provenanceReceipt.blockers, "rateable-for-blind-rating")
    || !validDisposition(runPackage.disposition, runPackage.blockers, "rateable-for-blind-rating")
    || !validDisposition(rateabilitySummary.disposition, rateabilitySummary.blockers, "run-mechanics-pass")
    || (runPackage.disposition === "rateable-for-blind-rating"
      && rateabilitySummary.disposition !== "run-mechanics-pass")
    || !matchesExpectedBindings({
      runPackage,
      provenanceReceipt,
      blindSheet,
      rateabilitySummary,
      runReceipt,
      expectedBindings,
    })) return false;

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
  return new TextEncoder().encode(`${serialized}\n`);
}

export function verifyNarratorBrowserRateabilityEvidenceSetV3({
  runPackage,
  provenanceReceipt,
  blindKey,
  blindSheet,
  rateabilitySummary,
  runReceipt,
  expectedBindings,
}) {
  if (!validExpectedBindings(expectedBindings)) {
    throw new TypeError("Narrator V3 rateability expected host bindings are invalid");
  }
  const values = Object.freeze({
    "adapter-run-provenance-receipt.json": provenanceReceipt,
    "blind-key.json": blindKey,
    "blind-sheet.json": blindSheet,
    "rateability-summary.json": rateabilitySummary,
    "run-receipt.json": runReceipt,
  });
  for (const value of [...Object.values(values), runPackage]) {
    if (!hasValidContentHash(value)) {
      throw new TypeError("Narrator V3 rateability evidence content hash is invalid");
    }
  }
  if (!hasExactKeys(runPackage, runPackageKeys)
    || runPackage.packageId !== frozenContractBindings.packageId
    || runPackage.packageContractHash !== frozenContractBindings.packageContractHash
    || !commitPattern.test(String(runPackage.sourceCommit))
    || !isDenseArray(runPackage.files)
    || runPackage.files.length !== packageFileNames.length
    || !falseAuthority(runPackage, [
      "publicReplayableBeforeRating",
      "humanQualityEvaluated",
      "humanRatingIncluded",
      "modelAdmitted",
      "displayAuthorized",
      "productionAuthority",
    ])
    || !falseAuthority(provenanceReceipt, [
      "humanQualityEvaluated",
      "humanRatingIncluded",
      "modelAdmitted",
      "displayAuthorized",
      "productionAuthority",
    ])
    || provenanceReceipt.fullCorpusRun !== true
    || !falseAuthority(rateabilitySummary, [
      "humanQualityEvaluated",
      "humanRatingIncluded",
      "modelAdmitted",
      "displayAuthorized",
      "productionAuthority",
    ])
    || !falseAuthority(blindKey, ["modelAdmitted", "displayAuthorized"])
    || !falseAuthority(blindSheet, ["modelAdmitted", "displayAuthorized"])
    || !falseAuthority(runReceipt, ["modelAdmitted", "displayAuthorized"])
    || !linkedEvidenceIsValid({
      runPackage,
      provenanceReceipt,
      blindKey,
      blindSheet,
      rateabilitySummary,
      runReceipt,
      expectedBindings,
    })) {
    throw new TypeError("Narrator V3 rateability evidence bindings are invalid");
  }

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
      throw new TypeError("Narrator V3 rateability package file evidence is invalid");
    }
    evidenceSet.push(Object.freeze({ name, value, bytes }));
  }
  const packageBytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(runPackage);
  evidenceSet.push(Object.freeze({
    name: "run-package.json",
    value: runPackage,
    bytes: packageBytes,
  }));
  return Object.freeze(evidenceSet);
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
    || (metadata.mode & 0o777) !== 0o700
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
      || (metadata.mode & 0o777) !== 0o600
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
    || (metadata.mode & 0o777) !== 0o600
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
      || (metadata.mode & 0o777) !== 0o600
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
      || (metadata.mode & 0o777) !== 0o600
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
