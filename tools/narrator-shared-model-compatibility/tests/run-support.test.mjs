import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalHash,
  canonicalStringify,
  compareSharedModelCompatibilityPathSegments,
  compatibilityPathsOverlap,
  parseSharedModelCompatibilityArguments,
  resolveCompatibilityServerRoute,
  sealSharedModelCompatibilityReceipt,
  sha256,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityBaselineRevision,
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityCorpusHash,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityRuntimeFiles,
  sharedModelCompatibilityTokenizerPaths,
  tokenizerManifestsAreByteIdentical,
  verifySharedModelCompatibilityReceipt,
} from "../run-support.mjs";

const baselineFiles = Object.freeze([
  Object.freeze({ path: "config.json", byteLength: 1_506, sha256: "f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18" }),
  Object.freeze({ path: "generation_config.json", byteLength: 142, sha256: "8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737" }),
  Object.freeze({ path: "onnx/decoder_model_merged_quantized.onnx", byteLength: 59_041_810, sha256: "cc1b8d2b96ca051d06d47e9db1b1f1f0c131a6d2e6141b067ab9254c0545c36a" }),
  Object.freeze({ path: "onnx/encoder_model_quantized.onnx", byteLength: 35_612_462, sha256: "f8c68d0cd1f8773f3ae01a693f38dcffb6052dfb6566c52f633c16b49b6cc6fa" }),
  Object.freeze({ path: "tokenizer.json", byteLength: 2_422_234, sha256: "4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160" }),
  Object.freeze({ path: "tokenizer_config.json", byteLength: 20_830, sha256: "26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70" }),
]);

test("orders closure paths by deterministic code units rather than host locale", () => {
  const unordered = ["tokenizer_config.json", "tokenizer.json", "config.json"];
  assert.deepEqual(unordered.sort(compareSharedModelCompatibilityPathSegments), [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
  ]);
  assert.throws(
    () => compareSharedModelCompatibilityPathSegments("config.json", null),
    /strings/u,
  );
});

function manifestEntry(path, source) {
  const bytes = Buffer.from(source);
  return Object.freeze({ path, byteLength: bytes.byteLength, sha256: sha256(bytes) });
}

function aggregate(files) {
  return sha256(Buffer.from(canonicalStringify(files)));
}

function moveAt(ordinal) {
  const scenario = ordinal % 10 === 9
    ? Math.floor(ordinal / 10) % 9
    : ordinal % 10;
  if (scenario <= 4) return "establish-setting";
  if (scenario <= 6) return "shade-atmosphere";
  return "register-pressure";
}

function formAt(move) {
  if (move === "establish-setting") return "establish-holds";
  if (move === "shade-atmosphere") return "shade-holds-baseline";
  return "pressure-attention";
}

function fixtureReceipt() {
  const sourceFiles = [manifestEntry("fixture-source.ts", "source")];
  const bundleFiles = [
    manifestEntry("assets/index-fixture.js", "index"),
    manifestEntry("assets/ort-wasm-simd-threaded.asyncify-fixture.wasm", "wasm"),
    manifestEntry("assets/transformers.worker-fixture.js", "worker"),
    manifestEntry("index.html", "html"),
  ];
  const cases = Array.from({ length: sharedModelCompatibilityCaseCount }, (_, ordinal) => {
    const seed = Math.floor(ordinal / 10);
    const slot = ordinal % 10;
    const move = moveAt(ordinal);
    const common = {
      selectedFormId: formAt(move),
      lineHash: canonicalHash({ line: ordinal }),
      inputTokens: 12,
      outputTokens: 8,
      baselineForm: true,
      safe: true,
      eligible: true,
      fallbackUsed: false,
      elapsedMs: ordinal,
    };
    return {
      ordinal,
      id: `narrator-eval-v1:${String(seed).padStart(2, "0")}:${String(slot).padStart(2, "0")}`,
      seedId: `narrator-eval-seed:${String(seed).padStart(2, "0")}`,
      move,
      promptHash: canonicalHash({ prompt: ordinal }),
      baseline: { ...common },
      candidate: { ...common },
      exactFormParity: true,
    };
  });
  const timing = {
    baselineLoadElapsedMs: 1,
    candidateLoadElapsedMs: 2,
    baselineCaseElapsedMs: cases.map((entry) => entry.baseline.elapsedMs),
    candidateCaseElapsedMs: cases.map((entry) => entry.candidate.elapsedMs),
    totalElapsedMs: 3 + 2 * cases.reduce((sum, entry) =>
      sum + entry.baseline.elapsedMs, 0),
  };
  return sealSharedModelCompatibilityReceipt({
    schemaVersion: 1,
    kind: "narrator-shared-model-compatibility",
    disposition: "private-developer-evidence-no-authority",
    runId: "fixture-run",
    corpus: {
      version: 1,
      hash: sharedModelCompatibilityCorpusHash,
      caseCount: sharedModelCompatibilityCaseCount,
    },
    source: {
      commit: "a".repeat(40),
      files: sourceFiles,
      aggregateSha256: aggregate(sourceFiles),
    },
    bundle: {
      files: bundleFiles,
      aggregateSha256: aggregate(bundleFiles),
    },
    baselineModel: {
      format: "transformers-js-onnx-q8",
      files: baselineFiles,
      aggregateSha256: aggregate(baselineFiles),
    },
    candidateModel: {
      format: "transformers-js-onnx-q8",
      files: baselineFiles.map((entry) => ({ ...entry })),
      aggregateSha256: aggregate(baselineFiles),
    },
    tokenizer: {
      paths: sharedModelCompatibilityTokenizerPaths,
      byteIdentical: true,
      baselineWitnessesVerified: true,
      candidateWitnessesVerified: true,
    },
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      files: sharedModelCompatibilityRuntimeFiles,
      aggregateSha256: aggregate(sharedModelCompatibilityRuntimeFiles),
    },
    browser: {
      name: "chromium",
      version: "fixture-browser",
      execution: "wasm",
      dtype: "q8",
    },
    network: {
      serviceWorkers: "blocked",
      offlineBeforeModelLoad: true,
      externalRequestCount: 0,
      postOfflineRequestCount: 0,
    },
    comparison: {
      caseCount: 200,
      baselineCompletedCaseCount: 200,
      candidateCompletedCaseCount: 200,
      exactFormParityCount: 200,
      exactFormParity: true,
      fallbackSubstitutionCount: 0,
      unsafeLineCount: 0,
      ineligibleFormCount: 0,
      errorCount: 0,
      timeoutCount: 0,
    },
    timing: {
      ...timing,
      timingHash: sha256(Buffer.from(canonicalStringify(timing))),
    },
    cases,
    outputHash: sha256(Buffer.from(canonicalStringify(cases))),
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  });
}

function reseal(receipt, mutate) {
  const clone = structuredClone(receipt);
  delete clone.contentHash;
  mutate(clone);
  return sealSharedModelCompatibilityReceipt(clone);
}

test("locks the current baseline and exact six-file/tokenizer identities", () => {
  assert.equal(
    sharedModelCompatibilityBaselineRevision,
    "edf60fc44500b19407f6216e1777c3e34224b937",
  );
  assert.deepEqual(
    sharedModelCompatibilityModelPaths,
    baselineFiles.map((entry) => entry.path),
  );
  assert.equal(aggregate(baselineFiles), sharedModelCompatibilityBaselineAggregateSha256);
  assert.equal(tokenizerManifestsAreByteIdentical(
    baselineFiles,
    baselineFiles.map((entry) => ({ ...entry })),
  ), true);
  const drifted = baselineFiles.map((entry) =>
    entry.path === "tokenizer.json" ? { ...entry, sha256: "0".repeat(64) } : entry);
  assert.equal(tokenizerManifestsAreByteIdentical(baselineFiles, drifted), false);
});

test("parses only the closed comparison CLI", () => {
  assert.deepEqual(parseSharedModelCompatibilityArguments([
    "compare",
    "--baseline-model-dir", "/baseline",
    "--candidate-model-dir", "/candidate",
    "--run-id", "compat-001",
    "--out", ".narrator-t5-rebuild/compat-001",
  ]), {
    mode: "compare",
    "baseline-model-dir": "/baseline",
    "candidate-model-dir": "/candidate",
    "run-id": "compat-001",
    out: ".narrator-t5-rebuild/compat-001",
  });
  for (const argv of [
    [],
    ["run"],
    ["compare", "--baseline-model-dir", "/baseline"],
    ["compare", "--baseline-model-dir", "/baseline", "--baseline-model-dir", "/again", "--candidate-model-dir", "/candidate", "--run-id", "x", "--out", "y"],
    ["compare", "--baseline-model-dir", "/baseline", "--candidate-model-dir", "/candidate", "--run-id", "../escape", "--out", "y"],
    ["compare", "--baseline-model-dir", "/baseline", "--candidate-model-dir", "/candidate", "--run-id", "x", "--out", "y", "--extra", "z"],
  ]) assert.equal(parseSharedModelCompatibilityArguments(argv), null);
});

test("serves only exact known GET routes and detects path overlap", () => {
  const available = new Set([
    "/index.html",
    "/__shared_model_compatibility_staging__/baseline/0",
  ]);
  assert.equal(resolveCompatibilityServerRoute("GET", "/", available), "/index.html");
  assert.equal(resolveCompatibilityServerRoute(
    "GET",
    "/__shared_model_compatibility_staging__/baseline/0",
    available,
  ), "/__shared_model_compatibility_staging__/baseline/0");
  for (const [method, url] of [
    ["POST", "/index.html"],
    ["GET", "/index.html?x=1"],
    ["GET", "/%69ndex.html"],
    ["GET", "/unknown"],
    ["GET", "https://outside.example/index.html"],
  ]) assert.equal(resolveCompatibilityServerRoute(method, url, available), null);
  assert.equal(compatibilityPathsOverlap("/a/model", "/a/model/out"), true);
  assert.equal(compatibilityPathsOverlap("/a/model", "/a/model-two"), false);
});

test("recomputes the complete private receipt and rejects compatibility or authority drift", () => {
  const receipt = fixtureReceipt();
  assert.equal(verifySharedModelCompatibilityReceipt(receipt), true);
  const mutations = [
    (value) => { value.modelAdmitted = true; },
    (value) => { value.displayAuthorized = true; },
    (value) => { value.productionAuthority = true; },
    (value) => { value.network.externalRequestCount = 1; },
    (value) => { value.comparison.exactFormParityCount = 199; },
    (value) => { value.comparison.fallbackSubstitutionCount = 1; },
    (value) => { value.cases[0].candidate.selectedFormId = "establish-gathers"; },
    (value) => { value.cases[0].candidate.safe = false; },
    (value) => { value.candidateModel.files[4].sha256 = "0".repeat(64); },
    (value) => { value.corpus.hash = "0".repeat(16); },
    (value) => { value.cases.pop(); },
    (value) => { value.outputHash = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    assert.equal(verifySharedModelCompatibilityReceipt(
      reseal(receipt, mutate),
    ), false);
  }
});
