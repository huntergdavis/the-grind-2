import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHash,
  canonicalStringify,
  diagnoseStoryBeatCandidate,
  parseSealedStoryBeatHoldout,
  parseStoryBeatHoldoutFixtureForTest,
  parseStoryBeatBrowserEvaluationArguments,
  parseStoryBeatPrompt,
  resolveStoryBeatEvaluationServerRoute,
  sealStoryBeatBrowserEvaluationReceipt,
  selectStoryBeatHoldoutCases,
  storyBeatBrowserEvaluationDefaultCaseCount,
  storyBeatBrowserEvaluationExpectedHoldoutCorpusHash,
  storyBeatBrowserEvaluationExpectedHoldoutSha256,
  storyBeatBrowserEvaluationFullCaseCount,
  storyBeatBrowserEvaluationModelPaths,
  storyBeatBrowserEvaluationRepresentativeIndexes,
  storyBeatBrowserEvaluationRuntimeFiles,
  storyBeatEvaluationPathsOverlap,
  sha256,
  summarizeStoryBeatResults,
  verifyStoryBeatBrowserEvaluationReceipt,
} from "../run-support.mjs";

const instruction = "Write one sentence of at most 24 words. Name the place and use only facts and words supplied below. Do not add dialogue, thoughts, future events, quests, rewards, harm, or relationships.";

function row(index) {
  const id = `story-beat-training-corpus-v1:holdout:${String(index).padStart(4, "0")}`;
  const place = `Amber Yard ${index}`;
  const prompt = [
    instruction,
    `PLACE: ${JSON.stringify(place)}`,
    `HEADLINE: ${JSON.stringify(`The bell ${index} rests.`)}`,
    `ACTION: ${JSON.stringify(`Mira marks stone ${index}.`)}`,
    `CONSEQUENCE: ${JSON.stringify("The yard remains quiet.")}`,
    "BEAT:",
  ].join("\n");
  const payload = { id, split: "holdout", prompt, target: `At ${place}, Mira marks stone ${index}.` };
  return { ...payload, caseHash: canonicalHash(payload) };
}

function envelope() {
  const cases = Array.from({ length: storyBeatBrowserEvaluationFullCaseCount }, (_, index) => row(index));
  const payload = { schemaVersion: 1, cases };
  return { ...payload, corpusHash: canonicalHash(payload) };
}

function manifest(paths, prefix) {
  return paths.map((path, index) => ({
    path,
    byteLength: index + 1,
    sha256: String(prefix).repeat(64),
  }));
}

function receiptFixture() {
  const indexes = storyBeatBrowserEvaluationRepresentativeIndexes;
  const cases = indexes.map((holdoutIndex, index) => {
    const candidate = `At Amber Yard, marker ${index} rests.`;
    return {
      index,
      id: `story-beat-training-corpus-v1:holdout:${String(holdoutIndex).padStart(4, "0")}`,
      caseHash: canonicalHash({ holdoutIndex }),
      candidate,
      valid: true,
      fallbackRequired: false,
      inputTokens: 40,
      outputTokens: 8,
      elapsedMs: index + 1,
      promptHash: canonicalHash(`prompt:${index}`),
      targetHash: canonicalHash(`target:${index}`),
      candidateHash: canonicalHash(candidate),
      deterministicFallbackHash: canonicalHash(`fallback:${index}`),
      unknownLexemes: [],
      promptScaffoldEcho: false,
      sourceFieldExactEcho: false,
      targetExactMatch: false,
    };
  });
  const sourceFiles = manifest(["source.ts"], "a");
  const bundleFiles = manifest(["index.html"], "b");
  const modelFiles = manifest(storyBeatBrowserEvaluationModelPaths, "c");
  const runtimeFiles = storyBeatBrowserEvaluationRuntimeFiles;
  const timingPayload = { loadElapsedMs: 20, caseElapsedMs: cases.map((entry) => entry.elapsedMs) };
  return sealStoryBeatBrowserEvaluationReceipt({
    schemaVersion: 1,
    kind: "story-beat-browser-evaluation",
    experiment: "manual-ephemeral-noncanonical",
    runId: "receipt:fixture:1",
    modelAdmitted: false,
    displayAuthorized: false,
    selection: {
      policy: "reviewed-balanced-18-v1",
      caseCount: cases.length,
      indexes,
      caseSetHash: sha256(Buffer.from(canonicalStringify(cases.map((entry) => ({
        id: entry.id,
        caseHash: entry.caseHash,
      }))))),
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
      files: modelFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(modelFiles))),
    },
    holdout: {
      path: "sealed-holdout.json",
      byteLength: 143_789,
      sha256: storyBeatBrowserEvaluationExpectedHoldoutSha256,
      corpusHash: storyBeatBrowserEvaluationExpectedHoldoutCorpusHash,
      totalCaseCount: 200,
    },
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      pinnedTokenizerVerified: true,
      files: runtimeFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(runtimeFiles))),
    },
    browser: { name: "chromium", version: "140.0.0.0", execution: "wasm", dtype: "q8" },
    network: {
      serviceWorkers: "blocked",
      offlineBeforeModelLoad: true,
      externalRequestCount: 0,
      postOfflineRequestCount: 0,
    },
    timing: {
      ...timingPayload,
      totalCaseElapsedMs: timingPayload.caseElapsedMs.reduce((sum, value) => sum + value, 0),
      timingHash: sha256(Buffer.from(canonicalStringify(timingPayload))),
    },
    metrics: {
      caseCount: 18,
      validCaseCount: 18,
      invalidCaseCount: 0,
      validityRatePermyriad: 10_000,
      fallbackRequiredCaseCount: 0,
      fallbackRequiredRatePermyriad: 0,
      unknownLexemeCaseCount: 0,
      promptScaffoldEchoCaseCount: 0,
      sourceFieldExactEchoCaseCount: 0,
      targetExactMatchCaseCount: 0,
      uniqueRawOutputCount: 18,
      uniqueRawOutputRatePermyriad: 10_000,
      uniqueValidOutputCount: 18,
      uniqueValidOutputRatePermyriad: 10_000,
      maximumRawDuplicateCount: 1,
    },
    cases,
    outputHash: sha256(Buffer.from(canonicalStringify(cases))),
  });
}

function reseal(receipt) {
  const { contentHash: _contentHash, ...payload } = structuredClone(receipt);
  return sealStoryBeatBrowserEvaluationReceipt(payload);
}

test("parses only the closed evaluation CLI", () => {
  assert.deepEqual(parseStoryBeatBrowserEvaluationArguments([
    "evaluate", "--model-dir", "m", "--holdout", "h", "--run-id", "run:1", "--out", "o",
  ]), {
    mode: "evaluate", full: false, "model-dir": "m", holdout: "h", "run-id": "run:1", out: "o",
  });
  assert.equal(parseStoryBeatBrowserEvaluationArguments([
    "evaluate", "--model-dir", "m", "--holdout", "h", "--run-id", "run:1", "--out", "o", "--full",
  ])?.full, true);
  for (const invalid of [
    [],
    ["smoke"],
    ["evaluate", "--model-dir", "m", "--holdout", "h", "--run-id", "r"],
    ["evaluate", "--model-dir", "m", "--model-dir", "m", "--holdout", "h", "--run-id", "r", "--out", "o"],
    ["evaluate", "--model-dir", "m", "--holdout", "h", "--run-id", "bad run", "--out", "o"],
    ["evaluate", "--model-dir", "m", "--holdout", "h", "--run-id", "r", "--out", "o", "--full", "--full"],
  ]) assert.equal(parseStoryBeatBrowserEvaluationArguments(invalid), null);
});

test("validates the exact sealed envelope, row hashes, and prompt frame", () => {
  const value = envelope();
  const parsed = parseStoryBeatHoldoutFixtureForTest(`${JSON.stringify(value)}\n`);
  assert.equal(parsed.cases.length, 200);
  assert.equal(parseStoryBeatPrompt(parsed.cases[0].prompt).location, "Amber Yard 0");

  const changed = structuredClone(value);
  changed.cases[9].target = "Changed.";
  assert.throws(() => parseStoryBeatHoldoutFixtureForTest(JSON.stringify(changed)), /hash differs/u);
  const extra = structuredClone(value);
  extra.cases[0].hidden = true;
  assert.throws(() => parseStoryBeatHoldoutFixtureForTest(JSON.stringify(extra)), /row 0 is invalid/u);
  const drift = structuredClone(value);
  drift.corpusHash = "0".repeat(16);
  assert.throws(() => parseStoryBeatHoldoutFixtureForTest(JSON.stringify(drift)), /corpus hash differs/u);
  assert.throws(() => parseSealedStoryBeatHoldout(JSON.stringify(value)), /committed export evidence/u);
  assert.equal(storyBeatBrowserEvaluationExpectedHoldoutCorpusHash, "d88a61b1639188c0");
});

test("selects a deterministic, spread 18-case default and all 200 only explicitly", () => {
  const cases = envelope().cases;
  const first = selectStoryBeatHoldoutCases(cases);
  const second = selectStoryBeatHoldoutCases(structuredClone(cases));
  assert.equal(first.length, storyBeatBrowserEvaluationDefaultCaseCount);
  assert.deepEqual(first.map((value) => value.id), second.map((value) => value.id));
  assert.deepEqual(first.map((value) => Number(value.id.slice(-4))), storyBeatBrowserEvaluationRepresentativeIndexes);
  assert.equal(selectStoryBeatHoldoutCases(cases, true).length, 200);
});

test("recomputes grounding diagnostics and aggregate metrics from raw results", () => {
  const rows = [row(0), row(1)];
  const candidates = [rows[0].target, "PLACE: Zephyr arrives."];
  const results = candidates.map((candidate, index) => ({
    index,
    id: rows[index].id,
    caseHash: rows[index].caseHash,
    candidate,
    valid: index === 0,
    fallbackRequired: index !== 0,
    inputTokens: 40,
    outputTokens: 8,
    elapsedMs: 12 + index,
  }));
  const diagnostic = diagnoseStoryBeatCandidate(rows[1], candidates[1]);
  assert.equal(diagnostic.promptScaffoldEcho, true);
  assert.deepEqual(diagnostic.unknownLexemes, ["arrives", "place", "zephyr"]);
  assert.deepEqual(summarizeStoryBeatResults(rows, results), {
    caseCount: 2,
    validCaseCount: 1,
    invalidCaseCount: 1,
    validityRatePermyriad: 5000,
    fallbackRequiredCaseCount: 1,
    fallbackRequiredRatePermyriad: 5000,
    unknownLexemeCaseCount: 1,
    promptScaffoldEchoCaseCount: 1,
    sourceFieldExactEchoCaseCount: 0,
    targetExactMatchCaseCount: 1,
    uniqueRawOutputCount: 2,
    uniqueRawOutputRatePermyriad: 10000,
    uniqueValidOutputCount: 1,
    uniqueValidOutputRatePermyriad: 10000,
    maximumRawDuplicateCount: 1,
  });
  const stale = structuredClone(results);
  stale[1].id = rows[0].id;
  assert.throws(() => summarizeStoryBeatResults(rows, stale), /result 1 is invalid/u);
});

test("rejects model/output overlap in either direction", () => {
  assert.equal(storyBeatEvaluationPathsOverlap("/private/model", "/private/model"), true);
  assert.equal(storyBeatEvaluationPathsOverlap("/private/model", "/private/model/evidence"), true);
  assert.equal(storyBeatEvaluationPathsOverlap("/private/model/../model", "/private/model/evidence"), true);
  assert.equal(storyBeatEvaluationPathsOverlap("/private/model/", "/private/model"), true);
  assert.equal(storyBeatEvaluationPathsOverlap("/private/output", "/private/output/model"), true);
  assert.equal(storyBeatEvaluationPathsOverlap("/private/model-a", "/private/model-b"), false);
});

test("serves only exact GET routes without query, fragment, traversal, or unknown paths", () => {
  const paths = new Set(["/index.html", "/assets/worker.js", "/__story_beat_evaluation_staging__/model/0"]);
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/", paths), "/index.html");
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/assets/worker.js", paths), "/assets/worker.js");
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/__story_beat_evaluation_staging__/model/0", paths), "/__story_beat_evaluation_staging__/model/0");
  assert.equal(resolveStoryBeatEvaluationServerRoute("POST", "/", paths), null);
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/?x=1", paths), null);
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/assets/worker.js#x", paths), null);
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/assets/%2e%2e/index.html", paths), null);
  assert.equal(resolveStoryBeatEvaluationServerRoute("GET", "/unknown", paths), null);
});

test("verifies the final receipt by recomputation and rejects authority or evidence drift", () => {
  const receipt = receiptFixture();
  assert.equal(verifyStoryBeatBrowserEvaluationReceipt(receipt), true);

  for (const mutate of [
    (value) => { value.modelAdmitted = true; },
    (value) => { value.displayAuthorized = true; },
    (value) => { value.runtime.pinnedTokenizerVerified = false; },
    (value) => { value.holdout.sha256 = "0".repeat(64); },
    (value) => { value.cases[0].fallbackRequired = true; },
    (value) => { value.timing.totalCaseElapsedMs += 1; },
    (value) => { value.outputHash = "0".repeat(64); },
    (value) => { value.hidden = true; },
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    assert.equal(verifyStoryBeatBrowserEvaluationReceipt(reseal(changed)), false);
  }
  const staleHash = structuredClone(receipt);
  staleHash.runId = "receipt:changed";
  assert.equal(verifyStoryBeatBrowserEvaluationReceipt(staleHash), false);
});
