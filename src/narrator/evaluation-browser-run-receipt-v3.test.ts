import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import observedSmokeReceipt from "../../docs/narrator/narrator-v3-browser-smoke-receipt.json";
import observedPublicationReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  createNarratorBlindStudyV3,
  type NarratorBlindKeyV3,
  type NarratorBlindSheetV3,
} from "./blind-evaluation-v3";
import { narratorBrowserOrtRuntimeV2 } from "./evaluation-browser-assets-v2";
import {
  type NarratorBrowserAdapterSmokeReceiptV3,
  type NarratorBrowserObservedBuildV3,
  type NarratorBrowserSha256V3,
  isNarratorBrowserAdapterSmokeReceiptV3,
  narratorBrowserBuildToolchainPackagesV3,
} from "./evaluation-browser-receipt-v3";
import {
  createNarratorBrowserFullRunPackageV3,
  createNarratorBrowserFullRunProvenanceReceiptV3,
  isNarratorBrowserFullRunPackageForEvidenceV3,
  isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3,
  narratorBrowserFullRunContractHashV3,
  narratorBrowserFullRunPackageContractHashV3,
  narratorBrowserFullRunSourcePathsV3,
  narratorV3AdapterSmokeReceiptHash,
  narratorV3AdapterSmokeSourceCommit,
  serializeNarratorFullRunEvidenceJsonV3,
  verifyNarratorBrowserFullRunProvenanceReceiptV3,
  type NarratorBrowserFullRunNetworkV3,
  type NarratorBrowserFullRunPackageV3,
  type NarratorBrowserFullRunProvenanceFieldsV3,
  type NarratorBrowserFullRunProvenanceReceiptV3,
} from "./evaluation-browser-run-receipt-v3";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorRateabilitySummaryV3,
  type NarratorRateabilitySummaryV3,
} from "./evaluation-rateability-v3";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormsV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerCaseRequestV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

const privateSalt = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const workerEpoch = "worker-epoch:v3:browser-full-run-test";
const sourceCommit = "2".repeat(40);
const passingNetwork: NarratorBrowserFullRunNetworkV3 = Object.freeze({
  serviceWorkers: "block",
  stagingExternalRequestCount: 0,
  offlineBeforeLoad: true,
  postOfflineRequestCount: 0,
  workerSealStatus: "completed",
  pageCloseStatus: "completed",
  contextCloseStatus: "completed",
  browserCloseStatus: "completed",
  producerSeal: "confirmed",
});

function sha256Bytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return createHash("sha256").update(view).digest("hex");
}

const sha256: NarratorBrowserSha256V3 = async (bytes) => sha256Bytes(bytes);

function sha256Canonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalStringify(value)));
}

function modelCandidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedPublicationReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(
    observedPublicationReceipt as NarratorT5ArtifactPublicationReceiptV1,
  );
}

function smokeReceipt(
  candidate: NarratorModelCandidate,
): NarratorBrowserAdapterSmokeReceiptV3 {
  expect(isNarratorBrowserAdapterSmokeReceiptV3(
    observedSmokeReceipt,
    candidate,
    narratorV3AdapterSmokeSourceCommit,
  )).toBe(true);
  expect(observedSmokeReceipt.contentHash).toBe(narratorV3AdapterSmokeReceiptHash);
  return observedSmokeReceipt as NarratorBrowserAdapterSmokeReceiptV3;
}

function targetEvidence(request: NarratorEvaluationWorkerCaseRequestV3) {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = narratorFormsV3(prompt).find((entry) => entry.formId === formId)!;
    return {
      formId: form.formId,
      tokenIds: [...form.targetTokenIds],
      decodedWitness: form.witness,
    };
  });
}

function selectedResponse(
  request: NarratorEvaluationWorkerCaseRequestV3,
  selectedFormId: NarratorFormIdV3,
) {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  const targetObservations = targetEvidence(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    targetObservations,
  );
  const selectedTarget = targetSet.targets.find((target) => target.formId === selectedFormId)!;
  const selectionTrace: NarratorFormSelectionTraceStepV3[] = selectedTarget.tokenIds.map(
    (emittedTokenId, index) => {
      const prefixTokenIds = selectedTarget.tokenIds.slice(0, index);
      const allowedTokenIds = allowedNarratorFormTokenIdsV3(
        evaluationCase.prompt,
        request.eligibility,
        targetSet,
        prefixTokenIds,
      );
      return {
        prefixTokenIds,
        allowedTokenIds,
        allowedScoreBits: allowedTokenIds.map((tokenId) =>
          narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 1 : 0)),
        emittedTokenId,
      };
    },
  );
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [1],
    observedInputTokens: null,
    targetObservations,
    fullDecoderTokenIds: [
      narratorFormGenerationConfigurationV3.decoderStartTokenId,
      ...selectedTarget.tokenIds,
    ],
    selectionTrace,
  });
}

function passingRunReceipt(candidate: NarratorModelCandidate): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(candidate, "run:v3:browser-full-run-test");
  const rows = [];
  let previousResponseHash: string | null = null;
  let priorSelectedFormId: NarratorFormIdV3 | null = null;
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const burstPrior = ordinal % 2 === 1 ? priorSelectedFormId : null;
    const request: NarratorEvaluationWorkerCaseRequestV3 =
      createNarratorEvaluationWorkerCaseRequestV3(
        runSpec,
        candidate,
        ordinal,
        workerEpoch,
        burstPrior,
        previousResponseHash,
      );
    const selectedFormId = narratorFormsV3(narratorEvaluationCasesV1[ordinal]!.prompt)
      .find((form) => request.eligibility.eligibleFormIds.includes(form.formId) && !form.baseline)!
      .formId;
    const response = selectedResponse(request, selectedFormId);
    const row = createNarratorCaseReceiptV3(
      runSpec,
      candidate,
      burstPrior,
      previousResponseHash,
      {
        ordinal,
        status: "ok",
        request,
        response,
        latencyMilliseconds: 10 + ordinal,
      },
    );
    rows.push(row);
    previousResponseHash = response.contentHash;
    priorSelectedFormId = row.selectedFormId;
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, candidate),
    verifiedArtifacts: candidate.artifacts.map(({ path, byteLength, sha256: artifactSha256 }) => ({
      path,
      byteLength,
      sha256: artifactSha256,
    })),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
    termination: { status: "not-requested" },
  });
}

function failedLifecycleReceipt(receipt: NarratorRunReceiptV3): NarratorRunReceiptV3 {
  return createNarratorRunReceiptV3({
    runSpec: receipt.runSpec,
    workerEpoch: receipt.workerEpoch,
    workerBinding: receipt.workerBinding,
    verifiedArtifacts: receipt.verifiedArtifacts,
    load: receipt.load,
    rows: receipt.rows,
    dispose: { status: "error", latencyMilliseconds: 7 },
    termination: { status: "requested" },
  });
}

function observedBuildFixture(): {
  readonly observedBuild: NarratorBrowserObservedBuildV3;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
} {
  const sourceBytes = new Map<string, Uint8Array>();
  const sourceFiles = narratorBrowserFullRunSourcePathsV3.map((path) => {
    const bytes = new TextEncoder().encode(`committed source for ${path}\n`);
    sourceBytes.set(path, bytes);
    return Object.freeze({ path, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes) });
  });
  const bundleFiles = [
    "assets/index-full-run.js",
    "assets/ort-wasm-simd-threaded.asyncify-full-run.wasm",
    "assets/transformers.worker-full-run.js",
    "host/evidence-host.mjs",
    "index.html",
  ].map((path) => {
    const bytes = new TextEncoder().encode(`observed bundle for ${path}\n`);
    return Object.freeze({ path, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes) });
  });
  const packageLock = sourceFiles.find((file) => file.path === "package-lock.json")!;
  return {
    observedBuild: Object.freeze({
      sourceFiles: Object.freeze(sourceFiles),
      sourceAggregateSha256: sha256Canonical(sourceFiles),
      packageLock,
      bundleFiles: Object.freeze(bundleFiles),
      bundleAggregateSha256: sha256Canonical(bundleFiles),
    }),
    sourceBytes,
  };
}

function fieldsFor(
  adapterSmokeReceipt: NarratorBrowserAdapterSmokeReceiptV3,
  runReceipt: NarratorRunReceiptV3,
  rateabilitySummary: NarratorRateabilitySummaryV3,
  observedBuild: NarratorBrowserObservedBuildV3,
  network: NarratorBrowserFullRunNetworkV3 = passingNetwork,
): NarratorBrowserFullRunProvenanceFieldsV3 {
  return {
    sourceCommit,
    observedBuild,
    buildToolchain: { nodeVersion: "24.6.0", npmVersion: "11.5.1" },
    verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
    browser: { name: "chromium", version: "140.0.7339.16" },
    network,
    adapterSmokeReceipt,
    runReceipt,
    rateabilitySummary,
  };
}

function rehash<T extends { readonly contentHash: string }>(
  value: T,
  mutate: (copy: Record<string, unknown>) => void,
): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  delete copy.contentHash;
  mutate(copy);
  return { ...copy, contentHash: canonicalHash(copy) } as T;
}

function recursivelyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(recursivelyFrozen);
}

interface FullFixture {
  readonly candidate: NarratorModelCandidate;
  readonly adapterSmokeReceipt: NarratorBrowserAdapterSmokeReceiptV3;
  readonly runReceipt: NarratorRunReceiptV3;
  readonly rateabilitySummary: NarratorRateabilitySummaryV3;
  readonly provenanceFields: NarratorBrowserFullRunProvenanceFieldsV3;
  readonly provenanceReceipt: NarratorBrowserFullRunProvenanceReceiptV3;
  readonly blindSheet: NarratorBlindSheetV3;
  readonly blindKey: NarratorBlindKeyV3;
  readonly packageReceipt: NarratorBrowserFullRunPackageV3;
  readonly sourceBytes: ReadonlyMap<string, Uint8Array>;
}

describe("narrator V3 browser full-run receipt", () => {
  let fixture: FullFixture;

  beforeAll(async () => {
    const candidate = modelCandidate();
    const adapterSmokeReceipt = smokeReceipt(candidate);
    const runReceipt = passingRunReceipt(candidate);
    const rateabilitySummary = createNarratorRateabilitySummaryV3(candidate, runReceipt);
    expect(rateabilitySummary.disposition).toBe("run-mechanics-pass");
    expect(rateabilitySummary.blockers).toEqual([]);
    const { observedBuild, sourceBytes } = observedBuildFixture();
    const provenanceFields = fieldsFor(
      adapterSmokeReceipt,
      runReceipt,
      rateabilitySummary,
      observedBuild,
    );
    const provenanceReceipt = createNarratorBrowserFullRunProvenanceReceiptV3(
      candidate,
      provenanceFields,
    );
    const study = createNarratorBlindStudyV3(
      candidate,
      runReceipt,
      "sheet:v3:browser-full-run-test",
      privateSalt,
    );
    const evidence = {
      provenanceReceipt,
      runReceipt,
      rateabilitySummary,
      blindSheet: study.sheet,
      blindKey: study.key,
    };
    const packageReceipt = await createNarratorBrowserFullRunPackageV3(
      candidate,
      adapterSmokeReceipt,
      evidence,
      sha256,
    );
    fixture = {
      candidate,
      adapterSmokeReceipt,
      runReceipt,
      rateabilitySummary,
      provenanceFields,
      provenanceReceipt,
      blindSheet: study.sheet,
      blindKey: study.key,
      packageReceipt,
      sourceBytes,
    };
  }, 300_000);

  it("binds the exact source, bundle, toolchain, smoke, run, and authority lineage", () => {
    const { provenanceReceipt: receipt, provenanceFields } = fixture;
    expect(narratorBrowserFullRunContractHashV3).toBe("13d5796c19323d97");
    expect(narratorBrowserFullRunPackageContractHashV3).toBe("83ef1decba2f3648");
    expect(isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(
      receipt,
      fixture.candidate,
      provenanceFields,
    )).toBe(true);
    expect(receipt).toMatchObject({
      schemaVersion: 3,
      fullRunContractHash: narratorBrowserFullRunContractHashV3,
      sourceCommit,
      sourceFiles: provenanceFields.observedBuild.sourceFiles,
      sourceAggregateSha256: provenanceFields.observedBuild.sourceAggregateSha256,
      packageLock: provenanceFields.observedBuild.packageLock,
      bundleFiles: provenanceFields.observedBuild.bundleFiles,
      bundleAggregateSha256: provenanceFields.observedBuild.bundleAggregateSha256,
      adapterSmokeSourceCommit: narratorV3AdapterSmokeSourceCommit,
      adapterSmokeReceiptHash: narratorV3AdapterSmokeReceiptHash,
      runReceiptHash: fixture.runReceipt.contentHash,
      rateabilitySummaryHash: fixture.rateabilitySummary.contentHash,
      disposition: "rateable-for-blind-rating",
      blockers: [],
      fullCorpusRun: true,
      humanQualityEvaluated: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    });
    expect(receipt.buildToolchain).toEqual({
      ...provenanceFields.buildToolchain,
      packages: narratorBrowserBuildToolchainPackagesV3,
    });
    expect(receipt.sourceFiles.map(({ path }) => path)).toEqual(narratorBrowserFullRunSourcePathsV3);
    expect(recursivelyFrozen(receipt)).toBe(true);
  }, 90_000);

  it("retains nonzero and failed network observations as valid blocked evidence", () => {
    const network = {
      serviceWorkers: "allow" as const,
      stagingExternalRequestCount: 2,
      offlineBeforeLoad: false,
      postOfflineRequestCount: 1,
      workerSealStatus: "failed" as const,
      pageCloseStatus: "failed" as const,
      contextCloseStatus: "failed" as const,
      browserCloseStatus: "failed" as const,
      producerSeal: "confirmed" as const,
    };
    const fields = fieldsFor(
      fixture.adapterSmokeReceipt,
      fixture.runReceipt,
      fixture.rateabilitySummary,
      fixture.provenanceFields.observedBuild,
      network,
    );
    const receipt = createNarratorBrowserFullRunProvenanceReceiptV3(fixture.candidate, fields);
    expect(receipt.network).toEqual(network);
    expect(receipt.blockers).toEqual([
      "service-workers-not-blocked",
      "staging-external-network-observed",
      "offline-not-before-load",
      "post-offline-network-observed",
      "worker-producer-seal-not-ok",
      "page-producer-close-not-ok",
      "context-producer-close-not-ok",
      "browser-producer-close-not-ok",
    ]);
    expect(receipt.disposition).toBe("blocked");
    expect(receipt.contentHash).toBe(canonicalHash(
      Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "contentHash")),
    ));
  }, 60_000);

  it("retains a failed lifecycle as valid blocked evidence", () => {
    const runReceipt = failedLifecycleReceipt(fixture.runReceipt);
    const rateabilitySummary = createNarratorRateabilitySummaryV3(fixture.candidate, runReceipt);
    expect(rateabilitySummary.blockers).toEqual([
      "run-dispose-not-ok",
      "run-termination-requested",
    ]);
    const fields = fieldsFor(
      fixture.adapterSmokeReceipt,
      runReceipt,
      rateabilitySummary,
      fixture.provenanceFields.observedBuild,
    );
    const receipt = createNarratorBrowserFullRunProvenanceReceiptV3(fixture.candidate, fields);
    expect(receipt.lifecycle).toEqual({
      load: runReceipt.load,
      completedRowCount: 200,
      dispose: { status: "error", latencyMilliseconds: 7 },
      termination: { status: "requested" },
    });
    expect(receipt.disposition).toBe("blocked");
    expect(receipt.blockers).toEqual(rateabilitySummary.blockers);
  }, 60_000);

  it("asynchronously verifies every committed source byte and both aggregate hashes", async () => {
    const reads: string[] = [];
    const read = async (commit: string, path: string) => {
      expect(commit).toBe(sourceCommit);
      reads.push(path);
      return fixture.sourceBytes.get(path)!;
    };
    expect(await verifyNarratorBrowserFullRunProvenanceReceiptV3(
      fixture.provenanceReceipt,
      fixture.candidate,
      fixture.provenanceFields,
      read,
      sha256,
    )).toBe(true);
    expect(reads).toEqual(narratorBrowserFullRunSourcePathsV3);

    const alteredPath = narratorBrowserFullRunSourcePathsV3[1]!;
    expect(await verifyNarratorBrowserFullRunProvenanceReceiptV3(
      fixture.provenanceReceipt,
      fixture.candidate,
      fixture.provenanceFields,
      async (_commit, path) => path === alteredPath
        ? new TextEncoder().encode("different committed bytes\n")
        : fixture.sourceBytes.get(path)!,
      sha256,
    )).toBe(false);
    expect(await verifyNarratorBrowserFullRunProvenanceReceiptV3(
      fixture.provenanceReceipt,
      fixture.candidate,
      fixture.provenanceFields,
      async () => { throw new Error("git cat-file failed"); },
      sha256,
    )).toBe(false);
  }, 180_000);

  it("commits exactly five serialized files with SHA-256, length, hash, and visibility", async () => {
    const evidenceByName = new Map<string, { schemaVersion: 3; contentHash: string }>([
      ["adapter-run-provenance-receipt.json", fixture.provenanceReceipt],
      ["blind-key.json", fixture.blindKey],
      ["blind-sheet.json", fixture.blindSheet],
      ["rateability-summary.json", fixture.rateabilitySummary],
      ["run-receipt.json", fixture.runReceipt],
    ]);
    expect(fixture.packageReceipt.packageContractHash)
      .toBe(narratorBrowserFullRunPackageContractHashV3);
    expect(fixture.packageReceipt.files.map(({ name, visibility }) => ({ name, visibility })))
      .toEqual([
        { name: "adapter-run-provenance-receipt.json", visibility: "public-safe" },
        { name: "blind-key.json", visibility: "private-until-rating" },
        { name: "blind-sheet.json", visibility: "private-until-rating" },
        { name: "rateability-summary.json", visibility: "public-safe" },
        { name: "run-receipt.json", visibility: "private-until-rating" },
      ]);
    for (const file of fixture.packageReceipt.files) {
      const evidence = evidenceByName.get(file.name)!;
      const bytes = serializeNarratorFullRunEvidenceJsonV3(evidence);
      expect(file).toEqual({
        name: file.name,
        visibility: file.visibility,
        schemaVersion: 3,
        contentHash: evidence.contentHash,
        byteLength: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    }
    expect(fixture.packageReceipt).toMatchObject({
      disposition: "rateable-for-blind-rating",
      blockers: [],
      publicReplayableBeforeRating: false,
      humanQualityEvaluated: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    });
    expect(recursivelyFrozen(fixture.packageReceipt)).toBe(true);
  }, 30_000);

  it("binds the private blind sheet and key to the exact run", async () => {
    const evidence = {
      provenanceReceipt: fixture.provenanceReceipt,
      runReceipt: fixture.runReceipt,
      rateabilitySummary: fixture.rateabilitySummary,
      blindSheet: fixture.blindSheet,
      blindKey: fixture.blindKey,
    };
    expect(await isNarratorBrowserFullRunPackageForEvidenceV3(
      fixture.packageReceipt,
      fixture.candidate,
      fixture.adapterSmokeReceipt,
      evidence,
      sha256,
    )).toBe(true);

    const wrongKey = rehash(fixture.blindKey, (copy) => {
      copy.secretSalt = "a".repeat(64);
    });
    const wrongSheet = rehash(fixture.blindSheet, (copy) => {
      copy.runReceiptHash = "0".repeat(16);
    });
    expect(await isNarratorBrowserFullRunPackageForEvidenceV3(
      fixture.packageReceipt,
      fixture.candidate,
      fixture.adapterSmokeReceipt,
      { ...evidence, blindSheet: wrongSheet, blindKey: wrongKey },
      sha256,
    )).toBe(false);
  }, 240_000);

  it("rejects tampered and rehashed source, bundle, toolchain, smoke, run, and package links", async () => {
    const altered = rehash(fixture.provenanceReceipt, (copy) => {
      copy.sourceAggregateSha256 = "0".repeat(64);
      copy.bundleAggregateSha256 = "1".repeat(64);
      copy.buildToolchain = { ...copy.buildToolchain as object, nodeVersion: "24.6.1" };
      copy.adapterSmokeReceiptHash = "0".repeat(16);
      copy.runReceiptHash = "1".repeat(16);
      copy.rateabilitySummaryHash = "2".repeat(16);
    });
    expect(isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(
      altered,
      fixture.candidate,
      fixture.provenanceFields,
    )).toBe(false);

    const changedFiles = fixture.packageReceipt.files.map((file, index) => index === 0
      ? { ...file, visibility: "private-until-rating" as const }
      : file);
    const alteredPackage = rehash(fixture.packageReceipt, (copy) => {
      copy.files = changedFiles;
    });
    const evidence = {
      provenanceReceipt: fixture.provenanceReceipt,
      runReceipt: fixture.runReceipt,
      rateabilitySummary: fixture.rateabilitySummary,
      blindSheet: fixture.blindSheet,
      blindKey: fixture.blindKey,
    };
    expect(await isNarratorBrowserFullRunPackageForEvidenceV3(
      alteredPackage,
      fixture.candidate,
      fixture.adapterSmokeReceipt,
      evidence,
      sha256,
    )).toBe(false);
  }, 180_000);

  it("rejects sparse evidence and wrong-version substitutions without throwing", async () => {
    const sparseFiles = Array(fixture.packageReceipt.files.length);
    const sparsePackage = rehash(fixture.packageReceipt, (copy) => { copy.files = sparseFiles; });
    const evidence = {
      provenanceReceipt: fixture.provenanceReceipt,
      runReceipt: fixture.runReceipt,
      rateabilitySummary: fixture.rateabilitySummary,
      blindSheet: fixture.blindSheet,
      blindKey: fixture.blindKey,
    };
    expect(await isNarratorBrowserFullRunPackageForEvidenceV3(
      sparsePackage,
      fixture.candidate,
      fixture.adapterSmokeReceipt,
      evidence,
      sha256,
    )).toBe(false);
    expect(isNarratorBrowserFullRunProvenanceReceiptForEvidenceV3(
      {
        ...fixture.provenanceReceipt,
        schemaVersion: 2,
        sourceFiles: Array(fixture.provenanceReceipt.sourceFiles.length),
      },
      fixture.candidate,
      fixture.provenanceFields,
    )).toBe(false);
    expect(() => createNarratorBrowserFullRunProvenanceReceiptV3(
      fixture.candidate,
      {
        ...fixture.provenanceFields,
        runReceipt: { ...fixture.runReceipt, schemaVersion: 2 } as unknown as NarratorRunReceiptV3,
      },
    )).toThrow(TypeError);
  }, 180_000);
});
