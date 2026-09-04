import { createHash } from "node:crypto";
import { serializeNarratorBrowserRateabilityEvidenceJsonV3 } from "../run-support.mjs";

export function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("invalid canonical number");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) =>
    `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
}

export function canonicalHash(value) {
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

function withHash(content) {
  return { ...content, contentHash: canonicalHash(content) };
}

export function rehash(value, mutate) {
  const copy = structuredClone(value);
  delete copy.contentHash;
  mutate(copy);
  return withHash(copy);
}

export function replacePackagedEvidence(source, fileName, field, value, mutatePackage = () => {}) {
  const bytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(value);
  const runPackage = rehash(source.runPackage, (copy) => {
    mutatePackage(copy);
    const record = copy.files.find((entry) => entry.name === fileName);
    record.contentHash = value.contentHash;
    record.byteLength = bytes.byteLength;
    record.sha256 = sha256(bytes);
  });
  return { ...source, [field]: value, runPackage };
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const contractHashes = Object.freeze({
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
});

export function fixture({ blocked = false, wholeRowHash = false } = {}) {
  const sourceCommit = "b".repeat(40);
  const adapterSmokeSourceCommit = "991d3bb7d677afde9b7939c0ecb01187bb8ba729";
  const adapterSmokeReceiptHash = "735b61107da7d6c4";
  const candidate = {
    schemaVersion: 2,
    candidateId: "flan-t5-small-q8@11111111",
    task: "single-ambient-line",
    modelFamily: "t5",
    sessions: [{
      runtimeSessionKey: "model",
      fileStem: "model",
      dtype: "q8",
      artifactPath: "model.onnx",
    }],
    model: {
      repository: "test/model",
      revision: "1".repeat(40),
      sourceRepository: "test/source",
      sourceRevision: "2".repeat(40),
      license: "Apache-2.0",
      licenseStatus: "verified",
    },
    runtime: {
      package: "@huggingface/transformers",
      version: "4.2.0",
      license: "Apache-2.0",
      integrity: "sha512-" + "A".repeat(86) + "==",
      unpackedByteLength: 9_536_375,
    },
    execution: "wasm",
    artifacts: [{
      path: "model.onnx",
      role: "weights",
      byteLength: 12,
      sha256: "1".repeat(64),
    }],
    measuredIncrementalMemoryBytes: null,
  };
  const modelArtifacts = candidate.artifacts.map(({ path, byteLength, sha256: hash }) => ({
    path,
    byteLength,
    sha256: hash,
  }));
  const runSpecCandidate = {
    candidateId: candidate.candidateId,
    candidateManifestHash: canonicalHash(candidate),
    artifactManifestHash: canonicalHash([...modelArtifacts]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
    modelRevision: candidate.model.revision,
    sourceRevision: candidate.model.sourceRevision,
    execution: candidate.execution,
    runtimePackage: candidate.runtime.package,
    runtimeVersion: candidate.runtime.version,
    runtimeIntegrity: candidate.runtime.integrity,
  };
  const runtimeArtifacts = [
    {
      path: "ort-wasm-simd-threaded.asyncify.mjs",
      role: "runtime-module",
      byteLength: 47_389,
      sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
    },
    {
      path: "ort-wasm-simd-threaded.asyncify.wasm",
      role: "runtime-wasm",
      byteLength: 23_567_050,
      sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
    },
  ];
  const runtime = {
    transformersPackage: "@huggingface/transformers",
    transformersVersion: candidate.runtime.version,
    transformersIntegrity: candidate.runtime.integrity,
    ortPackage: "onnxruntime-web",
    ortVersion: "1.26.0-dev.20260416-b7804b056c",
    ortIntegrity: "sha512-MD6Ss4GSpQBo6zqoJzyT9LRbKYs7x/JVN23FT24EcEvlqF4VuzPOeH6X38orZPKHQDbprn7K+SBpu0/mj2CQiw==",
    assets: runtimeArtifacts,
  };
  const sourceFiles = [{
    path: "package-lock.json",
    byteLength: 10,
    sha256: "2".repeat(64),
  }];
  const bundleFiles = [
    { path: "assets/index-a.js", byteLength: 10, sha256: "3".repeat(64) },
    {
      path: "assets/ort-wasm-simd-threaded.asyncify-a.wasm",
      byteLength: 10,
      sha256: "4".repeat(64),
    },
    { path: "assets/transformers.worker-a.js", byteLength: 10, sha256: "5".repeat(64) },
    { path: "host/evidence-host.mjs", byteLength: 10, sha256: "7".repeat(64) },
    { path: "index.html", byteLength: 10, sha256: "6".repeat(64) },
  ];
  const observedBuild = {
    sourceFiles,
    sourceAggregateSha256: sha256(new TextEncoder().encode(canonicalStringify(sourceFiles))),
    packageLock: sourceFiles[0],
    bundleFiles,
    bundleAggregateSha256: sha256(new TextEncoder().encode(canonicalStringify(bundleFiles))),
  };
  const buildToolchain = { nodeVersion: "22.19.0", npmVersion: "10.9.3" };
  const buildToolchainPackages = {
    vite: {
      package: "vite",
      version: "8.2.2",
      integrity: "sha512-cFKLV/PRgAUlIRm5WjMjJ86jrftzpqcgH+Us+DS8mI3CDNiH30Whrz8uHL3+MOLPAgqbMBAqWdAHAphOAM+z/Q==",
    },
    typescript: {
      package: "typescript",
      version: "7.0.2",
      integrity: "sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==",
    },
    playwright: {
      package: "@playwright/test",
      version: "1.62.1",
      integrity: "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==",
    },
  };
  const browser = { name: "chromium", version: "140.0.7339.16" };
  const network = {
    serviceWorkers: "block",
    stagingExternalRequestCount: 0,
    offlineBeforeLoad: true,
    postOfflineRequestCount: blocked ? 1 : 0,
    workerSealStatus: "completed",
    pageCloseStatus: "completed",
    contextCloseStatus: "completed",
    browserCloseStatus: "completed",
    producerSeal: "confirmed",
  };
  const runSpec = withHash({
    schemaVersion: 3,
    runId: "narrator-rateability:test:001",
    candidate: runSpecCandidate,
    corpus: { version: 1, hash: "f".repeat(16), caseCount: 200 },
  });
  const workerBinding = { schemaVersion: 3, workerEpoch: "epoch:test:001" };
  const workerBindingHash = canonicalHash(workerBinding);
  const rows = [withHash({
    schemaVersion: 3,
    ordinal: 0,
  })];
  const runReceipt = withHash({
    schemaVersion: 3,
    runReceiptContractHash: contractHashes.runReceipt,
    evidenceContractHash: contractHashes.evidence,
    protocolContractHash: contractHashes.workerProtocol,
    runnerSequencingContractHash: contractHashes.runnerSequencing,
    runSpec,
    workerEpoch: "epoch:test:001",
    workerBinding,
    workerBindingHash,
    verifiedArtifacts: modelArtifacts,
    verifiedArtifactsHash: canonicalHash(modelArtifacts),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 1 },
    rows,
    rowsHash: canonicalHash(wholeRowHash ? rows : rows.map((row) => row.contentHash)),
    dispose: { status: "ok", latencyMilliseconds: 1 },
    termination: { status: "not-requested" },
    completedRowCount: 1,
    modelAdmitted: false,
    displayAuthorized: false,
  });
  const rateabilitySummary = withHash({
    schemaVersion: 3,
    summaryId: "the-grind-2:narrator-rateability-summary:v3",
    rateabilityContractHash: contractHashes.rateability,
    candidateId: runSpec.candidate.candidateId,
    runSpecHash: runSpec.contentHash,
    runReceiptHash: runReceipt.contentHash,
    corpusHash: runSpec.corpus.hash,
    thresholds: {
      requiredCaseCount: 200,
      minimumValidRowCount: 198,
      minimumRateableNonBaselineCount: 140,
      minimumStratumValidityPermille: 900,
      minimumStratumRateablePermille: 600,
      minimumVoiceRateablePermille: 650,
      maximumRepeatedBurstCount: 0,
      maximumSelectedFormRun: 3,
      requiredVariableSeedCount: 20,
      seedCount: 20,
      casesPerSeed: 10,
    },
    caseCount: 200,
    completedRowCount: runReceipt.completedRowCount,
    statusCounts: [{ status: "not-run", count: 200 }],
    validRowCount: 0,
    invalidRowCount: 200,
    rateableNonBaselineCount: 0,
    baselineAutoTieCount: 0,
    acceptedKnowledgeViolationCount: 0,
    validityPermille: 0,
    rateablePermille: 0,
    p95ValidLatencyMilliseconds: null,
    strata: [],
    voices: [],
    selectedForms: [],
    repeatedBurstCount: 0,
    maximumSelectedFormRun: 0,
    variableSeedCount: 0,
    disposition: "run-mechanics-pass",
    blockers: [],
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
  const blindSheet = withHash({
    schemaVersion: 3,
    sheetId: "narrator-rateability-sheet:test:001",
    runReceiptHash: runReceipt.contentHash,
    runSpecHash: runSpec.contentHash,
    corpusHash: runSpec.corpus.hash,
    selectionContractHash: contractHashes.formSelection,
    evidenceContractHash: contractHashes.evidence,
    blindStudyContractHash: contractHashes.blindStudy,
    answerKeySaltFingerprint: "a".repeat(16),
    items: [],
    modelAdmitted: false,
    displayAuthorized: false,
  });
  const blindKey = withHash({
    schemaVersion: 3,
    sheetHash: blindSheet.contentHash,
    runReceiptHash: runReceipt.contentHash,
    runSpecHash: runSpec.contentHash,
    selectionContractHash: contractHashes.formSelection,
    evidenceContractHash: contractHashes.evidence,
    blindStudyContractHash: contractHashes.blindStudy,
    secretSalt: "s".repeat(43),
    items: [],
    modelAdmitted: false,
    displayAuthorized: false,
  });
  const blockers = blocked ? ["post-offline-network-observed"] : [];
  const disposition = blocked ? "blocked" : "rateable-for-blind-rating";
  const provenanceReceipt = withHash({
    schemaVersion: 3,
    receiptId: "the-grind-2:narrator-browser-full-run:v3",
    fullRunContractHash: contractHashes.browserFullRun,
    formSelectionContractHash: contractHashes.formSelection,
    transformersAdapterContractHash: contractHashes.transformersAdapter,
    evidenceContractHash: contractHashes.evidence,
    protocolContractHash: contractHashes.workerProtocol,
    caseReceiptContractHash: contractHashes.caseReceipt,
    runReceiptContractHash: contractHashes.runReceipt,
    runnerSequencingContractHash: contractHashes.runnerSequencing,
    blindStudyContractHash: contractHashes.blindStudy,
    rateabilityContractHash: contractHashes.rateability,
    adapterSmokeContractHash: "257c2c732215bbda",
    adapterSmokeSourceCommit,
    adapterSmokeReceiptHash,
    sourceCommit,
    sourceFiles: observedBuild.sourceFiles,
    sourceAggregateSha256: observedBuild.sourceAggregateSha256,
    packageLock: observedBuild.packageLock,
    buildToolchain: { ...buildToolchain, packages: buildToolchainPackages },
    bundleFiles: observedBuild.bundleFiles,
    bundleAggregateSha256: observedBuild.bundleAggregateSha256,
    runtime,
    runSpec,
    workerEpoch: runReceipt.workerEpoch,
    workerBinding,
    workerBindingHash,
    verifiedModelArtifacts: modelArtifacts,
    verifiedRuntimeArtifacts: runtimeArtifacts,
    browser,
    network,
    runReceiptHash: runReceipt.contentHash,
    rateabilitySummaryHash: rateabilitySummary.contentHash,
    lifecycle: {
      load: runReceipt.load,
      completedRowCount: runReceipt.completedRowCount,
      dispose: runReceipt.dispose,
      termination: runReceipt.termination,
    },
    disposition,
    blockers,
    fullCorpusRun: true,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
  const values = {
    "adapter-run-provenance-receipt.json": provenanceReceipt,
    "blind-key.json": blindKey,
    "blind-sheet.json": blindSheet,
    "rateability-summary.json": rateabilitySummary,
    "run-receipt.json": runReceipt,
  };
  const visibility = {
    "adapter-run-provenance-receipt.json": "public-safe",
    "blind-key.json": "private-until-rating",
    "blind-sheet.json": "private-until-rating",
    "rateability-summary.json": "public-safe",
    "run-receipt.json": "private-until-rating",
  };
  const files = Object.entries(values).map(([name, value]) => {
    const bytes = serializeNarratorBrowserRateabilityEvidenceJsonV3(value);
    return {
      name,
      visibility: visibility[name],
      schemaVersion: 3,
      contentHash: value.contentHash,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
  const runPackage = withHash({
    schemaVersion: 3,
    packageId: "the-grind-2:narrator-browser-full-run-package:v3",
    packageContractHash: "83ef1decba2f3648",
    sourceCommit,
    candidateId: runSpec.candidate.candidateId,
    runId: runSpec.runId,
    sheetId: blindSheet.sheetId,
    runSpecHash: runSpec.contentHash,
    workerBindingHash,
    adapterSmokeSourceCommit,
    adapterSmokeReceiptHash,
    contractHashes,
    files,
    disposition,
    blockers,
    publicReplayableBeforeRating: false,
    humanQualityEvaluated: false,
    humanRatingIncluded: false,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
  const expectedBindings = {
    sourceCommit,
    observedBuild,
    buildToolchain,
    browser,
    network,
    candidate,
    modelArtifacts,
    runtime,
    runtimeArtifacts,
    adapterSmoke: {
      sourceCommit: adapterSmokeSourceCommit,
      receiptHash: adapterSmokeReceiptHash,
    },
    runId: runSpec.runId,
    sheetId: blindSheet.sheetId,
  };
  return {
    runPackage,
    provenanceReceipt,
    blindKey,
    blindSheet,
    rateabilitySummary,
    runReceipt,
    expectedBindings,
  };
}
