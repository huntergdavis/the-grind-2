import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import adapterSmokeReceipt from "../../../docs/narrator/narrator-v3-browser-smoke-receipt.json";
import publicationReceipt from "../../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalStringify } from "../../../src/core/canonical";
import { createNarratorBlindStudyV3 } from "../../../src/narrator/blind-evaluation-v3";
import { narratorBrowserOrtRuntimeV2 } from "../../../src/narrator/evaluation-browser-assets-v2";
import {
  createNarratorBrowserFullRunPackageV3,
  createNarratorBrowserFullRunProvenanceReceiptV3,
  narratorBrowserFullRunSourcePathsV3,
} from "../../../src/narrator/evaluation-browser-run-receipt-v3";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
} from "../../../src/narrator/evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "../../../src/narrator/evaluation";
import { createNarratorRateabilitySummaryV3 } from "../../../src/narrator/evaluation-rateability-v3";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
} from "../../../src/narrator/evaluation-receipts-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormsV3,
} from "../../../src/narrator/evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
} from "../../../src/narrator/evaluation-worker-protocol-v3";
import { createNarratorT5PublishedCandidateV1 } from "../../../src/narrator/t5-publication-evidence";
import { verifyNarratorBrowserRateabilityEvidenceSetV3 } from "../run-support.mjs";

const sourceCommit = "2".repeat(40);
const workerEpoch = "worker-epoch:v3:host-compatibility-test";
const runId = "run:v3:host-compatibility-test";
const sheetId = "sheet:v3:host-compatibility-test";
const privateSalt = "0123456789abcdef".repeat(4);
const browser = Object.freeze({ name: "chromium", version: "140.0.7339.16" });
const network = Object.freeze({
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
const buildToolchain = Object.freeze({
  nodeVersion: "22.22.1",
  npmVersion: "10.9.4",
});

function sha256Bytes(bytes) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return createHash("sha256").update(view).digest("hex");
}

function sha256Canonical(value) {
  return sha256Bytes(new TextEncoder().encode(canonicalStringify(value)));
}

function observedBuildFixture() {
  const sourceFiles = narratorBrowserFullRunSourcePathsV3.map((path) => {
    const bytes = new TextEncoder().encode(`committed source for ${path}\n`);
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
  return Object.freeze({
    sourceFiles: Object.freeze(sourceFiles),
    sourceAggregateSha256: sha256Canonical(sourceFiles),
    packageLock: sourceFiles.find((file) => file.path === "package-lock.json"),
    bundleFiles: Object.freeze(bundleFiles),
    bundleAggregateSha256: sha256Canonical(bundleFiles),
  });
}

function targetEvidence(request) {
  const prompt = narratorEvaluationCasesV1[request.ordinal].prompt;
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = narratorFormsV3(prompt).find((entry) => entry.formId === formId);
    return {
      formId: form.formId,
      tokenIds: [...form.targetTokenIds],
      decodedWitness: form.witness,
    };
  });
}

function selectedResponse(request, selectedFormId) {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal];
  const observations = targetEvidence(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    observations,
  );
  const selectedTarget = targetSet.targets.find((target) => target.formId === selectedFormId);
  const selectionTrace = selectedTarget.tokenIds.map((emittedTokenId, index) => {
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
  });
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [
      narratorFormGenerationConfigurationV3.decoderStartTokenId,
      ...selectedTarget.tokenIds,
    ],
    selectionTrace,
  });
}

function passingRows(runSpec, candidate) {
  const rows = [];
  let previousResponseHash = null;
  let priorSelectedFormId = null;
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const burstPrior = ordinal % 2 === 1 ? priorSelectedFormId : null;
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      candidate,
      ordinal,
      workerEpoch,
      burstPrior,
      previousResponseHash,
    );
    const selectedFormId = narratorFormsV3(narratorEvaluationCasesV1[ordinal].prompt)
      .find((form) => request.eligibility.eligibleFormIds.includes(form.formId) && !form.baseline)
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
  return rows;
}

async function coreCreatedEvidenceFixture({ blocked }) {
  const candidate = createNarratorT5PublishedCandidateV1(publicationReceipt);
  const runSpec = createNarratorEvaluationRunSpecV3(candidate, runId);
  const workerBinding = createNarratorEvaluationWorkerBindingV3(runSpec, candidate);
  const rows = blocked
    ? narratorEvaluationCasesV1.map((_, ordinal) =>
      createNarratorCaseReceiptV3(runSpec, candidate, null, null, {
        ordinal,
        status: "not-run",
        request: null,
        response: null,
        latencyMilliseconds: 0,
      }))
    : passingRows(runSpec, candidate);
  const modelArtifacts = candidate.artifacts.map(({
    path,
    byteLength,
    sha256,
  }) => ({ path, byteLength, sha256 }));
  const runReceipt = createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding,
    verifiedArtifacts: modelArtifacts,
    load: {
      stage: "model-load",
      status: blocked ? "load-error" : "ok",
      latencyMilliseconds: 1,
    },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 1 },
    termination: { status: "not-requested" },
  });
  const rateabilitySummary = createNarratorRateabilitySummaryV3(candidate, runReceipt);
  const blindStudy = createNarratorBlindStudyV3(candidate, runReceipt, sheetId, privateSalt);
  const observedBuild = observedBuildFixture();
  const provenanceReceipt = createNarratorBrowserFullRunProvenanceReceiptV3(candidate, {
    sourceCommit,
    observedBuild,
    buildToolchain,
    verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
    browser,
    network,
    adapterSmokeReceipt,
    runReceipt,
    rateabilitySummary,
  });
  const runPackage = await createNarratorBrowserFullRunPackageV3(
    candidate,
    adapterSmokeReceipt,
    {
      provenanceReceipt,
      runReceipt,
      rateabilitySummary,
      blindSheet: blindStudy.sheet,
      blindKey: blindStudy.key,
    },
    async (bytes) => sha256Bytes(bytes),
  );
  return {
    runPackage,
    provenanceReceipt,
    blindKey: blindStudy.key,
    blindSheet: blindStudy.sheet,
    rateabilitySummary,
    runReceipt,
    expectedBindings: {
      sourceCommit,
      observedBuild,
      buildToolchain,
      browser,
      network,
      candidate,
      modelArtifacts,
      runtime: adapterSmokeReceipt.runtime,
      runtimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
      adapterSmoke: {
        sourceCommit: adapterSmokeReceipt.sourceCommit,
        receiptHash: adapterSmokeReceipt.contentHash,
      },
      runId,
      sheetId,
    },
  };
}

describe("V3 narrator core and independent host compatibility", () => {
  it("accepts a complete core-created 200-row blocked evidence package", async () => {
    const fixture = await coreCreatedEvidenceFixture({ blocked: true });
    expect(fixture.runReceipt.rows).toHaveLength(200);
    expect(fixture.runReceipt.runSpec.candidate).not.toEqual(fixture.expectedBindings.candidate);
    expect(fixture.rateabilitySummary.disposition).toBe("blocked");
    expect(fixture.runPackage.disposition).toBe("blocked");
    expect(() => verifyNarratorBrowserRateabilityEvidenceSetV3(fixture)).not.toThrow();
  }, 300_000);

  it("accepts a complete core-created 200-row rateable evidence package", async () => {
    const fixture = await coreCreatedEvidenceFixture({ blocked: false });
    expect(fixture.runReceipt.rows).toHaveLength(200);
    expect(fixture.rateabilitySummary.disposition).toBe("run-mechanics-pass");
    expect(fixture.runPackage.disposition).toBe("rateable-for-blind-rating");
    const evidenceSet = verifyNarratorBrowserRateabilityEvidenceSetV3(fixture);
    expect(evidenceSet.map(({ name }) => name)).toEqual([
      "adapter-run-provenance-receipt.json",
      "blind-key.json",
      "blind-sheet.json",
      "rateability-summary.json",
      "run-receipt.json",
      "run-package.json",
    ]);
  }, 300_000);
});
