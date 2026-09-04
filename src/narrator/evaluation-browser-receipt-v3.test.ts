import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { narratorBrowserOrtRuntimeV2 } from "./evaluation-browser-assets-v2";
import {
  createNarratorBrowserAdapterSmokeReceiptV3,
  isNarratorBrowserAdapterSmokeReceiptV3,
  narratorBrowserAdapterSmokeContractHashV3,
  narratorBrowserAdapterSmokeContractV3,
  narratorBrowserAdapterSmokeSourcePathsV3,
  narratorBrowserBuildToolchainPackagesV3,
  verifyNarratorBrowserAdapterSmokeReceiptV3,
  type NarratorBrowserAdapterSmokeReceiptV3,
  type NarratorBrowserObservedBuildV3,
} from "./evaluation-browser-receipt-v3";
import {
  createNarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import { createNarratorCaseReceiptV3 } from "./evaluation-receipts-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormSelectionContractHashV3,
  narratorFormsV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import { narratorTransformersAdapterContractHashV3 } from "./evaluation-transformers-adapter-v3";
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

type MutableRecord = Record<string, unknown>;

const sourceCommit = "1".repeat(40);
const workerEpoch = "worker-epoch:v3:browser-smoke-test";

function bytes(value: string): ArrayBuffer {
  return Uint8Array.from(new TextEncoder().encode(value)).buffer;
}

function sha256(value: ArrayBuffer): string {
  return createHash("sha256").update(new Uint8Array(value)).digest("hex");
}

function aggregate(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function targetObservations(request: NarratorEvaluationWorkerCaseRequestV3) {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const forms = new Map(narratorFormsV3(prompt).map((form) => [form.formId, form]));
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = forms.get(formId)!;
    return { formId, tokenIds: [...form.targetTokenIds], decodedWitness: form.witness };
  });
}

function successfulCase(
  model: NarratorModelCandidate,
  runId = "run:v3:browser-smoke",
) {
  const runSpec = createNarratorEvaluationRunSpecV3(model, runId);
  const workerBinding = createNarratorEvaluationWorkerBindingV3(runSpec, model);
  const request = createNarratorEvaluationWorkerCaseRequestV3(
    runSpec,
    model,
    0,
    workerEpoch,
    null,
    null,
  );
  const evaluationCase = narratorEvaluationCasesV1[0]!;
  const observations = targetObservations(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    observations,
  );
  const selected = targetSet.targets.find((target) => target.formId !== request.eligibility.baselineFormId)
    ?? targetSet.targets[0]!;
  const prefix: number[] = [];
  const trace: NarratorFormSelectionTraceStepV3[] = selected.tokenIds.map((emittedTokenId) => {
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(
      evaluationCase.prompt,
      request.eligibility,
      targetSet,
      prefix,
    );
    const step = {
      prefixTokenIds: [...prefix],
      allowedTokenIds: [...allowedTokenIds],
      allowedScoreBits: allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 2 : -2)),
      emittedTokenId,
    };
    prefix.push(emittedTokenId);
    return step;
  });
  const response = createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [narratorFormGenerationConfigurationV3.decoderStartTokenId, ...selected.tokenIds],
    selectionTrace: trace,
  });
  const caseReceipt = createNarratorCaseReceiptV3(runSpec, model, null, null, {
    ordinal: 0,
    status: "ok",
    request,
    response,
    latencyMilliseconds: 17,
  });
  if (caseReceipt.status !== "ok") throw new Error("Expected a successful case fixture");
  return { runSpec, workerBinding, caseReceipt };
}

function fixture() {
  const model = candidate();
  const sourceBytes = new Map<string, ArrayBuffer>();
  const sourceFiles = narratorBrowserAdapterSmokeSourcePathsV3.map((path) => {
    const value = bytes(`source:${path}`);
    sourceBytes.set(path, value);
    return { path, byteLength: value.byteLength, sha256: sha256(value) };
  });
  const packageLock = sourceFiles.find((file) => file.path === "package-lock.json")!;
  const bundleFiles = [
    { path: "assets/index-abc.js", byteLength: 101, sha256: "a".repeat(64) },
    {
      path: "assets/ort-wasm-simd-threaded.asyncify-abc.wasm",
      byteLength: 102,
      sha256: "b".repeat(64),
    },
    { path: "assets/transformers.worker-abc.js", byteLength: 103, sha256: "c".repeat(64) },
    { path: "index.html", byteLength: 104, sha256: "d".repeat(64) },
  ];
  const observedBuild: NarratorBrowserObservedBuildV3 = {
    sourceFiles,
    sourceAggregateSha256: aggregate(sourceFiles),
    packageLock,
    bundleFiles,
    bundleAggregateSha256: aggregate(bundleFiles),
  };
  const { runSpec, workerBinding, caseReceipt } = successfulCase(model);
  const receipt = createNarratorBrowserAdapterSmokeReceiptV3(model, {
    sourceCommit,
    observedBuild,
    buildToolchain: { nodeVersion: "22.22.0", npmVersion: "11.6.2" },
    runSpec,
    workerEpoch,
    workerBinding,
    verifiedModelArtifacts: model.artifacts.map(({ path, byteLength, sha256: digest }) => ({
      path,
      byteLength,
      sha256: digest,
    })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
    browser: { name: "chromium", version: "151.0.7922.34" },
    network: {
      serviceWorkers: "block",
      stagingExternalRequestCount: 0,
      offlineBeforeLoad: true,
      postOfflineRequestCount: 0,
    },
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    caseReceipt,
    dispose: { status: "ok", latencyMilliseconds: 5 },
  });
  const readSource = async (commit: string, path: string) => {
    if (commit !== sourceCommit) throw new Error("wrong commit");
    const value = sourceBytes.get(path);
    if (value === undefined) throw new Error("missing source");
    return value.slice(0);
  };
  return { model, sourceBytes, observedBuild, receipt, readSource };
}

function rehashedMutation<T extends object>(value: T, mutate: (copy: MutableRecord) => void): MutableRecord {
  const content = structuredClone(value) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

function deeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as MutableRecord).every(deeplyFrozen);
}

describe("Narrator V3 isolated browser adapter smoke receipt", () => {
  it("freezes a separate smoke-only contract over the frozen V3 contracts", () => {
    expect(narratorBrowserAdapterSmokeContractV3).toMatchObject({
      formSelectionContractHash: narratorFormSelectionContractHashV3,
      transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
      evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
      workerProtocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
      caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
      fullCorpusRun: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    });
    expect(narratorBrowserAdapterSmokeContractHashV3).toBe(canonicalHash(narratorBrowserAdapterSmokeContractV3));
    expect(deeplyFrozen(narratorBrowserAdapterSmokeContractV3)).toBe(true);
    expect(deeplyFrozen(narratorBrowserBuildToolchainPackagesV3)).toBe(true);
  });

  it("constructs a deeply frozen exact ordinal-zero receipt", () => {
    const { model, receipt } = fixture();
    expect(isNarratorBrowserAdapterSmokeReceiptV3(receipt, model, sourceCommit)).toBe(true);
    expect(receipt).toMatchObject({
      schemaVersion: 3,
      receiptId: "the-grind-2:narrator-browser-adapter-smoke:v3",
      smokeContractHash: narratorBrowserAdapterSmokeContractHashV3,
      formSelectionContractHash: narratorFormSelectionContractHashV3,
      transformersAdapterContractHash: narratorTransformersAdapterContractHashV3,
      evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
      protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
      caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
      workerEpoch,
      workerBindingHash: canonicalHash(receipt.workerBinding),
      fullCorpusRun: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    });
    expect(receipt.verifiedModelArtifacts).toHaveLength(6);
    expect(receipt.verifiedRuntimeArtifacts).toHaveLength(2);
    expect(receipt.caseReceipt).toMatchObject({
      ordinal: 0,
      status: "ok",
      safetyAccepted: true,
      knowledgeViolationCount: 0,
    });
    expect(receipt.caseReceipt.request).not.toBeNull();
    expect(receipt.caseReceipt.response).not.toBeNull();
    expect(receipt.caseReceipt.selectedFormId).not.toBeNull();
    expect(receipt.caseReceipt.renderedText).not.toBeNull();
    expect(deeplyFrozen(receipt)).toBe(true);
  });

  it("verifies every source blob against the named commit and both observed aggregates", async () => {
    const { model, observedBuild, receipt, readSource } = fixture();
    const calls: string[] = [];
    await expect(verifyNarratorBrowserAdapterSmokeReceiptV3(
      receipt,
      model,
      sourceCommit,
      observedBuild,
      async (commit, path) => {
        calls.push(`${commit}:${path}`);
        return new Uint8Array(await readSource(commit, path));
      },
      async (value) => sha256(value),
    )).resolves.toBe(true);
    expect(calls).toEqual(narratorBrowserAdapterSmokeSourcePathsV3.map((path) => `${sourceCommit}:${path}`));
  });

  it.each([
    ["contract hash", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, smokeContractHash: "0".repeat(16),
    })],
    ["adapter hash", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, transformersAdapterContractHash: "0".repeat(16),
    })],
    ["runtime", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, runtime: { ...receipt.runtime, ortVersion: "1.0.0" },
    })],
    ["toolchain", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt,
      buildToolchain: {
        ...receipt.buildToolchain,
        packages: {
          ...receipt.buildToolchain.packages,
          vite: { ...receipt.buildToolchain.packages.vite, integrity: `sha512-${"A".repeat(86)}==` },
        },
      },
    })],
    ["browser", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, browser: { name: "chromium", version: "not-a-version" },
    })],
    ["network", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, network: { ...receipt.network, postOfflineRequestCount: 1 },
    })],
    ["load", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, load: { ...receipt.load, status: "load-error" },
    })],
    ["dispose", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, dispose: { ...receipt.dispose, status: "error" },
    })],
    ["admission authority", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, modelAdmitted: true,
    })],
    ["production authority", (receipt: NarratorBrowserAdapterSmokeReceiptV3) => ({
      ...receipt, productionAuthority: true,
    })],
  ])("rejects a rehashed %s substitution", (_label, mutate) => {
    const { model, receipt } = fixture();
    const changed = mutate(receipt);
    const { contentHash: _contentHash, ...content } = changed;
    expect(isNarratorBrowserAdapterSmokeReceiptV3(
      { ...content, contentHash: canonicalHash(content) },
      model,
      sourceCommit,
    )).toBe(false);
  });

  it("rejects omitted, reordered, added, sparse, or package-lock-divergent source evidence", () => {
    const { model, receipt } = fixture();
    const alterations: unknown[] = [
      receipt.sourceFiles.slice(1),
      [receipt.sourceFiles[1], receipt.sourceFiles[0], ...receipt.sourceFiles.slice(2)],
      [...receipt.sourceFiles, { path: "extra.ts", byteLength: 1, sha256: "0".repeat(64) }],
      Array(receipt.sourceFiles.length),
    ];
    for (const sourceFiles of alterations) {
      const changed = rehashedMutation(receipt, (copy) => {
        copy.sourceFiles = sourceFiles;
        copy.sourceAggregateSha256 = Array.isArray(sourceFiles) && Object.keys(sourceFiles).length === sourceFiles.length
          ? aggregate(sourceFiles)
          : receipt.sourceAggregateSha256;
      });
      expect(() => isNarratorBrowserAdapterSmokeReceiptV3(changed, model, sourceCommit)).not.toThrow();
      expect(isNarratorBrowserAdapterSmokeReceiptV3(changed, model, sourceCommit)).toBe(false);
    }
    const wrongLock = rehashedMutation(receipt, (copy) => {
      copy.packageLock = { ...receipt.packageLock, sha256: "f".repeat(64) };
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(wrongLock, model, sourceCommit)).toBe(false);
  });

  it("rejects rehashed bundle and model-closure substitutions", () => {
    const { model, receipt } = fixture();
    const extraBundle = [...receipt.bundleFiles, {
      path: "assets/extra.js", byteLength: 1, sha256: "e".repeat(64),
    }].sort((left, right) => left.path.localeCompare(right.path));
    const changedBundle = rehashedMutation(receipt, (copy) => {
      copy.bundleFiles = extraBundle;
      copy.bundleAggregateSha256 = aggregate(extraBundle);
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(changedBundle, model, sourceCommit)).toBe(false);

    const modelArtifacts = receipt.verifiedModelArtifacts.map((artifact, index) => index === 0
      ? { ...artifact, sha256: "e".repeat(64) }
      : artifact);
    const changedModel = rehashedMutation(receipt, (copy) => {
      copy.verifiedModelArtifacts = modelArtifacts;
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(changedModel, model, sourceCommit)).toBe(false);
  });

  it("rejects a rehashed worker binding or derived render mutation", () => {
    const { model, receipt } = fixture();
    const binding = { ...receipt.workerBinding, trieSelectionHash: "0".repeat(16) };
    const changedBinding = rehashedMutation(receipt, (copy) => {
      copy.workerBinding = binding;
      copy.workerBindingHash = canonicalHash(binding);
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(changedBinding, model, sourceCommit)).toBe(false);

    const caseReceipt = rehashedMutation(receipt.caseReceipt, (copy) => {
      copy.renderedText = "forged host rendering";
    });
    const changedRender = rehashedMutation(receipt, (copy) => {
      copy.caseReceipt = caseReceipt;
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(changedRender, model, sourceCommit)).toBe(false);
  });

  it("rejects a rehashed response-trace mutation even when its enclosing hashes are repaired", () => {
    const { model, receipt } = fixture();
    const response = rehashedMutation(receipt.caseReceipt.response, (copy) => {
      const trace = copy.selectionTrace as MutableRecord[];
      trace[0] = { ...trace[0], allowedScoreBits: [narratorFloat32ToBitsV3(99)] };
    });
    const caseReceipt = rehashedMutation(receipt.caseReceipt, (copy) => {
      copy.response = response;
      copy.workerResponseHash = response.contentHash;
    });
    const changed = rehashedMutation(receipt, (copy) => {
      copy.caseReceipt = caseReceipt;
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(changed, model, sourceCommit)).toBe(false);
  });

  it("rejects V2 run/case substitutions and extra top-level keys", () => {
    const { model, receipt } = fixture();
    const v2RunSpec = createNarratorEvaluationRunSpecV2(model, receipt.runSpec.runId);
    const runSubstitution = rehashedMutation(receipt, (copy) => {
      copy.runSpec = v2RunSpec;
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(runSubstitution, model, sourceCommit)).toBe(false);

    const caseSubstitution = rehashedMutation(receipt, (copy) => {
      copy.caseReceipt = {
        schemaVersion: 2,
        ordinal: 0,
        status: "ok",
        contentHash: "0".repeat(16),
      };
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(caseSubstitution, model, sourceCommit)).toBe(false);

    const extra = rehashedMutation(receipt, (copy) => {
      copy.unexpected = false;
    });
    expect(isNarratorBrowserAdapterSmokeReceiptV3(extra, model, sourceCommit)).toBe(false);
  });

  it("fails closed on wrong committed bytes, callback errors, and current-build divergence", async () => {
    const { model, observedBuild, receipt, readSource } = fixture();
    await expect(verifyNarratorBrowserAdapterSmokeReceiptV3(
      receipt,
      model,
      sourceCommit,
      observedBuild,
      async (commit, path) => path === narratorBrowserAdapterSmokeSourcePathsV3[0]
        ? bytes("tampered")
        : readSource(commit, path),
      async (value) => sha256(value),
    )).resolves.toBe(false);
    await expect(verifyNarratorBrowserAdapterSmokeReceiptV3(
      receipt,
      model,
      sourceCommit,
      observedBuild,
      async () => { throw new Error("git show failed"); },
      async (value) => sha256(value),
    )).resolves.toBe(false);
    const bundleFiles = observedBuild.bundleFiles.map((file, index) => index === 0
      ? { ...file, sha256: "f".repeat(64) }
      : file);
    await expect(verifyNarratorBrowserAdapterSmokeReceiptV3(
      receipt,
      model,
      sourceCommit,
      { ...observedBuild, bundleFiles, bundleAggregateSha256: aggregate(bundleFiles) },
      readSource,
      async (value) => sha256(value),
    )).resolves.toBe(false);
  });

  it("rejects invalid observed fields at construction instead of normalizing them", () => {
    const { model, observedBuild, receipt } = fixture();
    expect(() => createNarratorBrowserAdapterSmokeReceiptV3(model, {
      sourceCommit,
      observedBuild,
      buildToolchain: { nodeVersion: "22.22.0", npmVersion: "11.6.2" },
      runSpec: receipt.runSpec,
      workerEpoch,
      workerBinding: receipt.workerBinding,
      verifiedModelArtifacts: receipt.verifiedModelArtifacts,
      verifiedRuntimeArtifacts: receipt.verifiedRuntimeArtifacts,
      browser: receipt.browser,
      network: { ...receipt.network, postOfflineRequestCount: 1 as never },
      load: receipt.load,
      caseReceipt: receipt.caseReceipt,
      dispose: receipt.dispose,
    })).toThrow(TypeError);
  });
});
