import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHash,
  canonicalStringify,
  compareFactualStoryBeatClosurePathSegments,
  diagnoseFactualStoryBeatCandidate,
  factualStoryBeatBrowserEvaluationDefaultCaseCount,
  factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash,
  factualStoryBeatBrowserEvaluationExpectedHoldoutSha256,
  factualStoryBeatBrowserEvaluationExpectedModelAggregateSha256,
  factualStoryBeatBrowserEvaluationFullCaseCount,
  factualStoryBeatBrowserEvaluationModelFiles,
  factualStoryBeatBrowserEvaluationModelPaths,
  factualStoryBeatBrowserEvaluationRebuildReceiptFileSha256,
  factualStoryBeatBrowserEvaluationRebuildRuntimeManifestSha256,
  factualStoryBeatBrowserEvaluationRepresentativeIndexes,
  factualStoryBeatBrowserEvaluationRuntimeFiles,
  factualStoryBeatBrowserEvaluationSourcePaths,
  parseFactualStoryBeatBrowserEvaluationArguments,
  parseFactualStoryBeatHoldoutFixtureForTest,
  parseFactualStoryBeatPrompt,
  parseSealedFactualStoryBeatHoldout,
  resolveStoryBeatEvaluationServerRoute,
  sealFactualStoryBeatBrowserEvaluationReceipt,
  selectFactualStoryBeatHoldoutCases,
  sha256,
  storyBeatEvaluationPathsOverlap,
  summarizeFactualStoryBeatResults,
  verifyFactualStoryBeatBrowserEvaluationReceipt,
} from "../run-support.mjs";

const instruction =
  "Write one sentence of at most 24 words. Name the place, include every REQUIRED clause exactly, and connect it to supplied scene words. Add no dialogue, thoughts, future events, quests, rewards, relationships, or unsupplied harm.";
const buckets = Object.freeze([
  "prefix-as",
  "prefix-while",
  "interior-as",
  "interior-while",
  "suffix-as",
  "suffix-while",
]);

function targetForFacts(facts) {
  const clauses = [facts.requiredCost, facts.requiredConsequence]
    .filter((value) => value !== null);
  return "At " + facts.location + ", " + clauses.join(", and ") + ".";
}

function row(index) {
  const id = "factual-story-beat-training-corpus-v2:holdout:"
    + String(index).padStart(4, "0");
  const lens = ["cost", "consequence", "contrast"][index % 3];
  const requiredCost =
    lens === "cost" || lens === "contrast" ? "health decreased by 2" : null;
  const requiredConsequence =
    lens === "consequence" || lens === "contrast"
      ? "the foe was defeated"
      : null;
  const prompt = [
    instruction,
    "PLACE: " + JSON.stringify("Amber Yard " + index),
    "HEADLINE: " + JSON.stringify("The bell rests."),
    "ACTION: " + JSON.stringify("Mira marks the stone."),
    "CONSEQUENCE: " + JSON.stringify("The yard remains quiet."),
    "LENS: " + JSON.stringify(lens),
    "REQUIRED COST: " + JSON.stringify(requiredCost),
    "REQUIRED CONSEQUENCE: " + JSON.stringify(requiredConsequence),
    "BEAT:",
  ].join("\n");
  const facts = parseFactualStoryBeatPrompt(prompt);
  const payload = {
    id,
    split: "holdout",
    prompt,
    target: targetForFacts(facts),
  };
  return { ...payload, caseHash: canonicalHash(payload) };
}

function envelope() {
  const cases = Array.from(
    { length: factualStoryBeatBrowserEvaluationFullCaseCount },
    (_, index) => row(index),
  );
  const payload = { schemaVersion: 2, cases };
  return { ...payload, corpusHash: canonicalHash(payload) };
}

function manifest(paths, prefix) {
  return paths.map((path, index) => ({
    path,
    byteLength: index + 1,
    sha256: String(prefix).repeat(64),
  }));
}

function resultFor(rowValue, index) {
  const facts = parseFactualStoryBeatPrompt(rowValue.prompt);
  const bucket = buckets[index % buckets.length];
  return {
    index,
    id: rowValue.id,
    caseHash: rowValue.caseHash,
    candidate: targetForFacts(facts),
    valid: true,
    fallbackRequired: false,
    exactPlace: true,
    requiredClausesComplete: true,
    sequenceSlot: index,
    presentationBucketId: bucket,
    formId: bucket + "-action",
    inputTokens: 80,
    outputTokens: 12,
    elapsedMs: index + 1,
  };
}

function receiptFixture() {
  const rows = selectFactualStoryBeatHoldoutCases(envelope().cases);
  const results = rows.map(resultFor);
  const metrics = summarizeFactualStoryBeatResults(rows, results);
  const cases = results.map((result, index) => {
    const source = rows[index];
    const diagnostic = diagnoseFactualStoryBeatCandidate(
      source,
      result.candidate,
    );
    return {
      ...result,
      promptHash: canonicalHash(source.prompt),
      targetHash: canonicalHash(source.target),
      candidateHash: canonicalHash(result.candidate),
      deterministicFallbackHash: canonicalHash(
        diagnostic.deterministicFallback,
      ),
      lensId: diagnostic.lensId,
      requiredClauseHashes: diagnostic.requiredClauseHashes,
      unknownLexemes: diagnostic.unknownLexemes,
      promptScaffoldEcho: diagnostic.promptScaffoldEcho,
      sourceFieldExactEcho: diagnostic.sourceFieldExactEcho,
      targetExactMatch: diagnostic.targetExactMatch,
    };
  });
  const sourceFiles = manifest(["source.ts"], "a");
  const bundleFiles = manifest(["index.html"], "b");
  const timingPayload = {
    loadElapsedMs: 20,
    caseElapsedMs: cases.map((entry) => entry.elapsedMs),
  };
  return sealFactualStoryBeatBrowserEvaluationReceipt({
    schemaVersion: 2,
    kind: "factual-story-beat-v2-browser-evaluation",
    experiment: "manual-ephemeral-factual-noncanonical",
    runId: "receipt:factual-fixture:1",
    modelAdmitted: false,
    displayAuthorized: false,
    selection: {
      policy: "reviewed-balanced-36-factual-v2",
      caseCount: cases.length,
      indexes: factualStoryBeatBrowserEvaluationRepresentativeIndexes,
      caseSetHash: sha256(Buffer.from(canonicalStringify(
        cases.map((entry) => ({ id: entry.id, caseHash: entry.caseHash })),
      ))),
    },
    source: {
      commit: "1".repeat(40),
      files: sourceFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(sourceFiles))),
    },
    bundle: {
      files: bundleFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(bundleFiles))),
    },
    model: {
      format: "transformers-js-onnx-q8",
      files: factualStoryBeatBrowserEvaluationModelFiles,
      aggregateSha256:
        factualStoryBeatBrowserEvaluationExpectedModelAggregateSha256,
      rebuildRuntimeManifestSha256:
        factualStoryBeatBrowserEvaluationRebuildRuntimeManifestSha256,
      rebuildReceiptFileSha256:
        factualStoryBeatBrowserEvaluationRebuildReceiptFileSha256,
    },
    holdout: {
      path: "sealed-holdout.json",
      byteLength: 172_681,
      sha256: factualStoryBeatBrowserEvaluationExpectedHoldoutSha256,
      corpusHash: factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash,
      totalCaseCount: factualStoryBeatBrowserEvaluationFullCaseCount,
    },
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      pinnedTokenizerVerified: true,
      files: factualStoryBeatBrowserEvaluationRuntimeFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(
        factualStoryBeatBrowserEvaluationRuntimeFiles,
      ))),
    },
    browser: {
      name: "chromium",
      version: "140.0.0.0",
      execution: "wasm",
      dtype: "q8",
    },
    network: {
      serviceWorkers: "blocked",
      offlineBeforeModelLoad: true,
      externalRequestCount: 0,
      postOfflineRequestCount: 0,
    },
    timing: {
      ...timingPayload,
      totalCaseElapsedMs: timingPayload.caseElapsedMs.reduce(
        (sum, value) => sum + value,
        0,
      ),
      timingHash: sha256(Buffer.from(canonicalStringify(timingPayload))),
    },
    metrics,
    cases,
    outputHash: sha256(Buffer.from(canonicalStringify(cases))),
  });
}

function reseal(receipt) {
  const { contentHash: _contentHash, ...payload } = structuredClone(receipt);
  return sealFactualStoryBeatBrowserEvaluationReceipt(payload);
}

test("orders and binds the exact committed source closure", () => {
  const unordered = [
    "tokenizer_config.json",
    "tokenizer.json",
    "config.json",
  ];
  assert.deepEqual(
    unordered.sort(compareFactualStoryBeatClosurePathSegments),
    ["config.json", "tokenizer.json", "tokenizer_config.json"],
  );
  assert.throws(
    () => compareFactualStoryBeatClosurePathSegments("config.json", null),
    /strings/u,
  );
  assert.deepEqual(
    factualStoryBeatBrowserEvaluationSourcePaths,
    [...factualStoryBeatBrowserEvaluationSourcePaths]
      .sort(compareFactualStoryBeatClosurePathSegments),
  );
  assert.equal(
    new Set(factualStoryBeatBrowserEvaluationSourcePaths).size,
    factualStoryBeatBrowserEvaluationSourcePaths.length,
  );
  for (const required of [
    "src/narrator/story-beat-v2-form-selection.ts",
    "src/narrator/story-beat-v2-transformers-adapter.ts",
    "src/narrator/story-beat-v2.ts",
    "tools/narrator-story-beat-v2-browser-evaluation/src/transformers.worker.ts",
  ]) {
    assert.ok(
      factualStoryBeatBrowserEvaluationSourcePaths.includes(required),
      required,
    );
  }
});

test("pins the retained q8 model closure and its aggregate digest", () => {
  assert.deepEqual(
    factualStoryBeatBrowserEvaluationModelFiles.map((entry) => entry.path),
    factualStoryBeatBrowserEvaluationModelPaths,
  );
  assert.equal(
    sha256(Buffer.from(canonicalStringify(
      factualStoryBeatBrowserEvaluationModelFiles,
    ))),
    factualStoryBeatBrowserEvaluationExpectedModelAggregateSha256,
  );
});

test("parses only the closed V2 evaluation CLI", () => {
  assert.deepEqual(parseFactualStoryBeatBrowserEvaluationArguments([
    "evaluate",
    "--model-dir",
    "m",
    "--holdout",
    "h",
    "--run-id",
    "run:1",
    "--out",
    "o",
  ]), {
    mode: "evaluate",
    full: false,
    "model-dir": "m",
    holdout: "h",
    "run-id": "run:1",
    out: "o",
  });
  assert.equal(parseFactualStoryBeatBrowserEvaluationArguments([
    "evaluate",
    "--model-dir",
    "m",
    "--holdout",
    "h",
    "--run-id",
    "run:1",
    "--out",
    "o",
    "--full",
  ])?.full, true);
  for (const invalid of [
    [],
    ["smoke"],
    [
      "evaluate",
      "--model-dir",
      "m",
      "--holdout",
      "h",
      "--run-id",
      "r",
    ],
    [
      "evaluate",
      "--model-dir",
      "m",
      "--model-dir",
      "m",
      "--holdout",
      "h",
      "--run-id",
      "r",
      "--out",
      "o",
    ],
    [
      "evaluate",
      "--model-dir",
      "m",
      "--holdout",
      "h",
      "--run-id",
      "bad run",
      "--out",
      "o",
    ],
  ]) {
    assert.equal(parseFactualStoryBeatBrowserEvaluationArguments(invalid), null);
  }
});

test("validates the exact V2 envelope, row hashes, and nine-line prompt", () => {
  const value = envelope();
  const parsed = parseFactualStoryBeatHoldoutFixtureForTest(
    JSON.stringify(value) + "\n",
  );
  assert.equal(parsed.cases.length, 200);
  assert.equal(
    parseFactualStoryBeatPrompt(parsed.cases[0].prompt).location,
    "Amber Yard 0",
  );

  const changed = structuredClone(value);
  changed.cases[9].target = "Changed.";
  assert.throws(
    () => parseFactualStoryBeatHoldoutFixtureForTest(JSON.stringify(changed)),
    /hash differs/u,
  );
  const extra = structuredClone(value);
  extra.cases[0].hidden = true;
  assert.throws(
    () => parseFactualStoryBeatHoldoutFixtureForTest(JSON.stringify(extra)),
    /row 0 is invalid/u,
  );
  const drift = structuredClone(value);
  drift.corpusHash = "0".repeat(16);
  assert.throws(
    () => parseFactualStoryBeatHoldoutFixtureForTest(JSON.stringify(drift)),
    /corpus hash differs/u,
  );
  assert.throws(
    () => parseSealedFactualStoryBeatHoldout(JSON.stringify(value)),
    /committed export evidence/u,
  );
  assert.equal(
    factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash,
    "164200f6c558639e",
  );
});

test("selects the exact balanced 36-case default and all 200 explicitly", () => {
  const cases = envelope().cases;
  const first = selectFactualStoryBeatHoldoutCases(cases);
  const second = selectFactualStoryBeatHoldoutCases(structuredClone(cases));
  assert.equal(first.length, factualStoryBeatBrowserEvaluationDefaultCaseCount);
  assert.deepEqual(
    first.map((value) => value.id),
    second.map((value) => value.id),
  );
  assert.deepEqual(
    first.map((value) => Number(value.id.slice(-4))),
    factualStoryBeatBrowserEvaluationRepresentativeIndexes,
  );
  assert.equal(selectFactualStoryBeatHoldoutCases(cases, true).length, 200);
});

test("recomputes required facts and metrics from raw browser results", () => {
  const rows = [row(0), row(1)];
  const valid = resultFor(rows[0], 0);
  const badCandidate = "PLACE: Zephyr arrives.";
  const diagnostic = diagnoseFactualStoryBeatCandidate(rows[1], badCandidate);
  const invalid = {
    ...resultFor(rows[1], 1),
    candidate: badCandidate,
    valid: false,
    fallbackRequired: true,
    exactPlace: diagnostic.exactPlace,
    requiredClausesComplete: diagnostic.requiredClausesComplete,
  };
  assert.equal(diagnostic.promptScaffoldEcho, true);
  assert.deepEqual(diagnostic.unknownLexemes, ["arrives", "place", "zephyr"]);
  const metrics = summarizeFactualStoryBeatResults(rows, [valid, invalid]);
  assert.equal(metrics.caseCount, 2);
  assert.equal(metrics.validCaseCount, 1);
  assert.equal(metrics.exactPlaceCaseCount, 1);
  assert.equal(metrics.requiredClausesCompleteCaseCount, 1);
  assert.equal(metrics.unknownLexemeCaseCount, 1);
  assert.equal(metrics.promptScaffoldEchoCaseCount, 1);
  assert.deepEqual(metrics.presentationBucketCaseCounts, {
    "prefix-as": 1,
    "prefix-while": 1,
    "interior-as": 0,
    "interior-while": 0,
    "suffix-as": 0,
    "suffix-while": 0,
  });

  const stale = structuredClone([valid, invalid]);
  stale[1].id = rows[0].id;
  assert.throws(
    () => summarizeFactualStoryBeatResults(rows, stale),
    /result 1 is invalid/u,
  );
});

test("rejects model and output overlap in either direction", () => {
  assert.equal(
    storyBeatEvaluationPathsOverlap("/private/model", "/private/model"),
    true,
  );
  assert.equal(
    storyBeatEvaluationPathsOverlap(
      "/private/model",
      "/private/model/evidence",
    ),
    true,
  );
  assert.equal(
    storyBeatEvaluationPathsOverlap(
      "/private/output",
      "/private/output/model",
    ),
    true,
  );
  assert.equal(
    storyBeatEvaluationPathsOverlap("/private/model-a", "/private/model-b"),
    false,
  );
});

test("serves only exact GET routes without traversal or URL adornments", () => {
  const staged =
    "/__factual_story_beat_v2_evaluation_staging__/model/0";
  const paths = new Set(["/index.html", "/assets/worker.js", staged]);
  assert.equal(
    resolveStoryBeatEvaluationServerRoute("GET", "/", paths),
    "/index.html",
  );
  assert.equal(
    resolveStoryBeatEvaluationServerRoute("GET", staged, paths),
    staged,
  );
  assert.equal(
    resolveStoryBeatEvaluationServerRoute("POST", "/", paths),
    null,
  );
  assert.equal(
    resolveStoryBeatEvaluationServerRoute("GET", "/?x=1", paths),
    null,
  );
  assert.equal(
    resolveStoryBeatEvaluationServerRoute(
      "GET",
      "/assets/%2e%2e/index.html",
      paths,
    ),
    null,
  );
  assert.equal(
    resolveStoryBeatEvaluationServerRoute("GET", "/unknown", paths),
    null,
  );
});

test("verifies the sealed receipt and rejects authority or evidence drift", () => {
  const receipt = receiptFixture();
  assert.equal(verifyFactualStoryBeatBrowserEvaluationReceipt(receipt), true);

  for (const mutate of [
    (value) => { value.modelAdmitted = true; },
    (value) => { value.displayAuthorized = true; },
    (value) => { value.runtime.pinnedTokenizerVerified = false; },
    (value) => { value.holdout.sha256 = "0".repeat(64); },
    (value) => { value.model.rebuildReceiptFileSha256 = "0".repeat(64); },
    (value) => { value.cases[0].fallbackRequired = true; },
    (value) => { value.cases[0].exactPlace = false; },
    (value) => { value.cases[0].presentationBucketId = "suffix-as"; },
    (value) => { value.timing.totalCaseElapsedMs += 1; },
    (value) => { value.outputHash = "0".repeat(64); },
    (value) => { value.hidden = true; },
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.equal(
      verifyFactualStoryBeatBrowserEvaluationReceipt(reseal(changed)),
      false,
    );
  }
  const staleHash = structuredClone(receipt);
  staleHash.runId = "receipt:changed";
  assert.equal(
    verifyFactualStoryBeatBrowserEvaluationReceipt(staleHash),
    false,
  );
});
