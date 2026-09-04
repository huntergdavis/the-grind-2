import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalStringify } from "../core/canonical";
import { narratorBrowserOrtRuntimeV2 } from "./evaluation-browser-assets-v2";
import {
  createNarratorBrowserRunPackageV1,
  isNarratorBrowserAdapterBuildReceiptV1,
  isNarratorBrowserRunPackageV1,
  narratorBrowserAdapterSourcePathsV1,
  verifyNarratorBrowserAdapterBuildReceiptV1,
} from "./evaluation-browser-receipt-v2";
import {
  createNarratorEvaluationRunSpecV2,
  createNarratorEvaluationWorkerBindingV2,
} from "./evaluation-contract-v2";
import { narratorTransformersJsRuntimeV2 } from "./model-candidate";
import { createNarratorT5PublishedCandidateV1 } from "./t5-publication-evidence";

const hash = "0".repeat(64);
const sourceCommit = "1".repeat(40);

function aggregate(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function fixture() {
  const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
  const sourceFiles = narratorBrowserAdapterSourcePathsV1
    .map((path) => ({ path, byteLength: 1, sha256: hash }));
  const packageLock = sourceFiles.find((file) => file.path === "package-lock.json")!;
  const bundleFiles = [
    { path: "assets/index-abc.js", byteLength: 1, sha256: hash },
    { path: "assets/ort-wasm-simd-threaded.asyncify-abc.wasm", byteLength: 1, sha256: hash },
    { path: "assets/transformers.worker-abc.js", byteLength: 1, sha256: hash },
    { path: "index.html", byteLength: 1, sha256: hash },
  ];
  const runId = "browser-receipt-test";
  const runSpec = createNarratorEvaluationRunSpecV2(candidate, runId);
  const content = {
    schemaVersion: 1,
    receiptId: "the-grind-2:narrator-browser-adapter-build:v1",
    sourceCommit,
    sourceFiles,
    sourceAggregateSha256: aggregate(sourceFiles),
    packageLock,
    bundleFiles,
    bundleAggregateSha256: aggregate(bundleFiles),
    runtime: {
      transformersPackage: narratorTransformersJsRuntimeV2.package,
      transformersVersion: narratorTransformersJsRuntimeV2.version,
      transformersIntegrity: narratorTransformersJsRuntimeV2.integrity,
      ortPackage: narratorBrowserOrtRuntimeV2.package,
      ortVersion: narratorBrowserOrtRuntimeV2.version,
      ortIntegrity: narratorBrowserOrtRuntimeV2.integrity,
      assets: narratorBrowserOrtRuntimeV2.assets,
    },
    runId,
    workerBindingHash: canonicalHash(createNarratorEvaluationWorkerBindingV2(runSpec, candidate)),
    verifiedModelArtifacts: candidate.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    verifiedRuntimeArtifacts: narratorBrowserOrtRuntimeV2.assets,
    browser: { name: "chromium", version: "151.0.7922.34" },
    offlineBeforeLoad: true,
    postOfflineRequestCount: 0,
    smoke: {
      outcome: "generated",
      inputTokens: 222,
      outputTokens: 7,
      stopReason: "model-eos",
      modelAdmitted: false,
      displayAuthorized: false,
    },
    modelAdmitted: false,
    displayAuthorized: false,
  };
  const observedBuild = {
    sourceFiles,
    sourceAggregateSha256: content.sourceAggregateSha256,
    packageLock,
    bundleFiles,
    bundleAggregateSha256: content.bundleAggregateSha256,
  };
  return { candidate, observedBuild, receipt: { ...content, contentHash: canonicalHash(content) } };
}

describe("Narrator browser adapter build receipt", () => {
  it("keeps coordinator and browser-validator source manifests exactly aligned", async () => {
    const coordinator = await readFile(
      new URL("../../tools/narrator-browser-evaluation/run.mjs", import.meta.url),
      "utf8",
    );
    const sourceBlock = /const sourcePaths = Object\.freeze\(\[([\s\S]*?)\]\);/u.exec(coordinator)?.[1];
    expect(sourceBlock).toBeDefined();
    const coordinatorPaths = [...(sourceBlock ?? "").matchAll(/^\s*"([^"]+)",$/gmu)]
      .map((match) => match[1]);
    expect(coordinatorPaths).toEqual(narratorBrowserAdapterSourcePathsV1);
    expect(coordinatorPaths).toContain(".gitignore");
    expect(coordinatorPaths).toContain("tools/narrator-browser-evaluation/run-support.mjs");
  });

  it("accepts the separately bound offline build/smoke evidence", async () => {
    const { candidate, observedBuild, receipt } = fixture();
    expect(isNarratorBrowserAdapterBuildReceiptV1(receipt, candidate, sourceCommit)).toBe(true);
    await expect(verifyNarratorBrowserAdapterBuildReceiptV1(
      receipt,
      candidate,
      sourceCommit,
      observedBuild,
    )).resolves.toBe(true);
  });

  it.each([
    ["network request", (receipt: ReturnType<typeof fixture>["receipt"]) => ({ ...receipt, postOfflineRequestCount: 1 })],
    ["display authority", (receipt: ReturnType<typeof fixture>["receipt"]) => ({ ...receipt, displayAuthorized: true })],
    ["runtime substitution", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt,
      runtime: { ...receipt.runtime, ortVersion: "different" },
    })],
    ["bundle omission", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt,
      bundleFiles: receipt.bundleFiles.filter((file) => !file.path.endsWith(".wasm")),
    })],
  ])("rejects a rehashed %s claim", (_label, mutate) => {
    const { candidate, receipt } = fixture();
    const changed = mutate(receipt);
    const { contentHash: _contentHash, ...content } = changed;
    expect(isNarratorBrowserAdapterBuildReceiptV1(
      { ...content, contentHash: canonicalHash(content) },
      candidate,
      sourceCommit,
    )).toBe(false);
  });

  it.each([
    ["source aggregate", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt, sourceAggregateSha256: "3".repeat(64),
    })],
    ["bundle aggregate", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt, bundleAggregateSha256: "4".repeat(64),
    })],
    ["source commit", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt, sourceCommit: "2".repeat(40),
    })],
    ["worker binding", (receipt: ReturnType<typeof fixture>["receipt"]) => ({
      ...receipt, workerBindingHash: "5".repeat(16),
    })],
    ["extra bundle file", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const bundleFiles = [
        ...receipt.bundleFiles,
        { path: "assets/extra.js", byteLength: 1, sha256: hash },
      ];
      return { ...receipt, bundleFiles, bundleAggregateSha256: aggregate(bundleFiles) };
    }],
    ["transitive corpus source omission", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const sourceFiles = receipt.sourceFiles.filter((file) => file.path !== "src/narrator/evaluation.ts");
      return { ...receipt, sourceFiles, sourceAggregateSha256: aggregate(sourceFiles) };
    }],
    ["transitive prompt-contract omission", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const sourceFiles = receipt.sourceFiles
        .filter((file) => file.path !== "src/narrator/evaluation-prompt-contract.ts");
      return { ...receipt, sourceFiles, sourceAggregateSha256: aggregate(sourceFiles) };
    }],
    ["publication receipt omission", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const sourceFiles = receipt.sourceFiles
        .filter((file) => file.path !== "docs/narrator/t5-artifact-publication-receipt.json");
      return { ...receipt, sourceFiles, sourceAggregateSha256: aggregate(sourceFiles) };
    }],
    ["ignore-policy omission", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const sourceFiles = receipt.sourceFiles.filter((file) => file.path !== ".gitignore");
      return { ...receipt, sourceFiles, sourceAggregateSha256: aggregate(sourceFiles) };
    }],
    ["coordinator-support omission", (receipt: ReturnType<typeof fixture>["receipt"]) => {
      const sourceFiles = receipt.sourceFiles
        .filter((file) => file.path !== "tools/narrator-browser-evaluation/run-support.mjs");
      return { ...receipt, sourceFiles, sourceAggregateSha256: aggregate(sourceFiles) };
    }],
  ])("rejects a rehashed %s forgery", async (_label, mutate) => {
    const { candidate, observedBuild, receipt } = fixture();
    const changed = mutate(receipt);
    const { contentHash: _contentHash, ...content } = changed;
    await expect(verifyNarratorBrowserAdapterBuildReceiptV1(
      { ...content, contentHash: canonicalHash(content) },
      candidate,
      sourceCommit,
      observedBuild,
    )).resolves.toBe(false);
  });

  it("rejects a current bundle observation that differs from the validated receipt", async () => {
    const { candidate, observedBuild, receipt } = fixture();
    const bundleFiles = observedBuild.bundleFiles.map((file, index) => index === 0
      ? { ...file, sha256: "6".repeat(64) }
      : file);
    await expect(verifyNarratorBrowserAdapterBuildReceiptV1(
      receipt,
      candidate,
      sourceCommit,
      { ...observedBuild, bundleFiles, bundleAggregateSha256: aggregate(bundleFiles) },
    )).resolves.toBe(false);
  });

  it("rejects sparse imported evidence without throwing", () => {
    const { candidate, receipt } = fixture();
    const sparse = Array(receipt.sourceFiles.length);
    const changed = { ...receipt, sourceFiles: sparse };
    const { contentHash: _contentHash, ...content } = changed;
    expect(() => isNarratorBrowserAdapterBuildReceiptV1(
      { ...content, contentHash: canonicalHash(content) },
      candidate,
      sourceCommit,
    )).not.toThrow();
    expect(isNarratorBrowserAdapterBuildReceiptV1(
      { ...content, contentHash: canonicalHash(content) },
      candidate,
      sourceCommit,
    )).toBe(false);
  });
});

describe("Narrator browser B2 run package", () => {
  it("binds the source, adapter, run, sheet and private key without granting authority", () => {
    const lineage = {
      sourceCommit,
      adapterBuildReceiptHash: "1".repeat(16),
      runReceiptHash: "2".repeat(16),
      blindSheetHash: "3".repeat(16),
      blindKeyHash: "4".repeat(16),
    };
    const runPackage = createNarratorBrowserRunPackageV1(lineage);
    expect(isNarratorBrowserRunPackageV1(runPackage, lineage)).toBe(true);
    expect(runPackage).toMatchObject({ modelAdmitted: false, displayAuthorized: false });

    const { contentHash: _contentHash, ...content } = runPackage;
    const forged = { ...content, blindKeyHash: "5".repeat(16) };
    expect(isNarratorBrowserRunPackageV1(
      { ...forged, contentHash: canonicalHash(forged) },
      lineage,
    )).toBe(false);
  });
});
