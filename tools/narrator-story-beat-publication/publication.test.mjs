import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalHash,
  canonicalStringify,
  diagnoseStoryBeatCandidate,
  sealStoryBeatBrowserEvaluationReceipt,
  sha256,
  storyBeatBrowserEvaluationExpectedHoldoutCorpusHash,
  storyBeatBrowserEvaluationExpectedHoldoutSha256,
  storyBeatBrowserEvaluationModelPaths,
  storyBeatBrowserEvaluationRepresentativeIndexes,
  storyBeatBrowserEvaluationRuntimeFiles,
  storyBeatBrowserEvaluationSourcePaths,
} from "../narrator-story-beat-browser-evaluation/run-support.mjs";
import {
  assertPublicSafe,
  browserEvaluationSourcePaths,
  completeCheckpointManifest,
  createPublicationDocuments,
  delexicalizedStoryBeatShape,
  evaluatePublicationPolicy,
  parsePublicationArguments,
  publicationPathsOverlap,
  publicationSourcePaths,
  qualityReceiptFile,
  recomputeQ8Evidence,
  stagingPlanFile,
  stableJsonStringify,
  verifyPublicationDocuments,
} from "./publication.mjs";

const instruction = "Write one sentence of at most 24 words. Name the place and use only facts and words supplied below. Do not add dialogue, thoughts, future events, quests, rewards, harm, or relationships.";
const digest = (text) => createHash("sha256").update(text).digest("hex");
const hash64 = (scalar) => scalar.repeat(64);

test("binds publication evidence to grounded generation and FP32 evaluation source", () => {
  assert.strictEqual(browserEvaluationSourcePaths, storyBeatBrowserEvaluationSourcePaths);
  assert.equal(new Set(publicationSourcePaths).size, publicationSourcePaths.length);

  for (const required of [
    "src/narrator/story-beat-form-eligibility.test.ts",
    "src/narrator/story-beat-form-eligibility.ts",
    "src/narrator/story-beat-form-selection.test.ts",
    "src/narrator/story-beat-form-selection.ts",
    "src/narrator/story-beat-transformers-adapter.test.ts",
    "src/narrator/story-beat-transformers-adapter.ts",
    "tools/narrator-story-beat-rebuild/rebuild.py",
    "tools/narrator-story-beat-rebuild/rebuild_test.py",
    "tools/narrator-story-beat-training/evaluate.py",
    "tools/narrator-story-beat-training/evaluate_test.py",
    "tools/narrator-story-beat-training/validate-evaluation.mjs",
    "tools/narrator-story-beat-training/validate-evaluation.test.mjs",
  ]) {
    assert.ok(publicationSourcePaths.includes(required), required);
  }
});

function manifest(paths, scalar = "a") {
  return paths.map((path, index) => ({ path, byteLength: index + 1, sha256: hash64(scalar) }));
}

test("includes the training receipt in the complete checkpoint manifest", () => {
  const trainingFiles = manifest(["config.json", "training-log.json"]);
  const complete = completeCheckpointManifest(trainingFiles, {
    byteLength: 41,
    sha256: hash64("b"),
  });

  assert.deepEqual(complete, [
    trainingFiles[0],
    trainingFiles[1],
    {
      path: "training-receipt.json",
      byteLength: 41,
      sha256: hash64("b"),
    },
  ]);
  assert.equal(trainingFiles.length, 2);
  assert.throws(
    () => completeCheckpointManifest([
      ...trainingFiles,
      { path: "training-receipt.json", byteLength: 1, sha256: hash64("c") },
    ], {
      byteLength: 41,
      sha256: hash64("b"),
    }),
    /paths must be sorted and unique/u,
  );
});

function holdoutRow(index) {
  const id = `story-beat-training-corpus-v1:holdout:${String(index).padStart(4, "0")}`;
  const location = `Amber Yard ${index}`;
  const headline = `Bell ${index} rests.`;
  const action = `Mira marks stone ${index}.`;
  const consequence = "The yard remains quiet.";
  const prompt = [
    instruction,
    `PLACE: ${JSON.stringify(location)}`,
    `HEADLINE: ${JSON.stringify(headline)}`,
    `ACTION: ${JSON.stringify(action)}`,
    `CONSEQUENCE: ${JSON.stringify(consequence)}`,
    "BEAT:",
  ].join("\n");
  const payload = { id, split: "holdout", prompt, target: `At ${location}, Mira marks stone ${index}.` };
  return { ...payload, caseHash: canonicalHash(payload) };
}

function holdoutFixture() {
  const cases = Array.from({ length: 200 }, (_, index) => holdoutRow(index));
  const payload = { schemaVersion: 1, cases };
  return { ...payload, corpusHash: canonicalHash(payload) };
}

function q8ReceiptFixture({ fallbackFirst = false } = {}) {
  const holdout = holdoutFixture();
  const indexes = storyBeatBrowserEvaluationRepresentativeIndexes;
  const cases = indexes.map((sourceIndex, index) => {
    const row = holdout.cases[sourceIndex];
    const headline = `Bell ${sourceIndex} rests.`;
    const candidate = fallbackFirst && index === 0 ? headline : row.target;
    const diagnostic = diagnoseStoryBeatCandidate(row, candidate);
    const valid = !(fallbackFirst && index === 0);
    return {
      candidate,
      candidateHash: canonicalHash(candidate),
      caseHash: row.caseHash,
      deterministicFallbackHash: canonicalHash(diagnostic.deterministicFallback),
      elapsedMs: index + 1,
      fallbackRequired: !valid,
      id: row.id,
      index,
      inputTokens: 40,
      outputTokens: 10,
      promptHash: canonicalHash(row.prompt),
      promptScaffoldEcho: diagnostic.promptScaffoldEcho,
      sourceFieldExactEcho: diagnostic.sourceFieldExactEcho,
      targetExactMatch: diagnostic.targetExactMatch,
      targetHash: canonicalHash(row.target),
      unknownLexemes: diagnostic.unknownLexemes,
      valid,
    };
  });
  const valid = cases.filter((entry) => entry.valid);
  const rawCounts = new Map();
  for (const entry of cases) rawCounts.set(entry.candidate, (rawCounts.get(entry.candidate) ?? 0) + 1);
  const metrics = {
    caseCount: 18,
    validCaseCount: valid.length,
    invalidCaseCount: 18 - valid.length,
    validityRatePermyriad: Math.floor(valid.length * 10_000 / 18),
    fallbackRequiredCaseCount: 18 - valid.length,
    fallbackRequiredRatePermyriad: Math.floor((18 - valid.length) * 10_000 / 18),
    unknownLexemeCaseCount: cases.filter((entry) => entry.unknownLexemes.length > 0).length,
    promptScaffoldEchoCaseCount: cases.filter((entry) => entry.promptScaffoldEcho).length,
    sourceFieldExactEchoCaseCount: cases.filter((entry) => entry.sourceFieldExactEcho).length,
    targetExactMatchCaseCount: cases.filter((entry) => entry.targetExactMatch).length,
    uniqueRawOutputCount: rawCounts.size,
    uniqueRawOutputRatePermyriad: Math.floor(rawCounts.size * 10_000 / 18),
    uniqueValidOutputCount: new Set(valid.map((entry) => entry.candidate)).size,
    uniqueValidOutputRatePermyriad: Math.floor(new Set(valid.map((entry) => entry.candidate)).size * 10_000 / valid.length),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
  };
  const sourceFiles = manifest(["source.ts"], "a");
  const bundleFiles = manifest(["index.html"], "b");
  const modelFiles = manifest(storyBeatBrowserEvaluationModelPaths, "c");
  const timingPayload = { loadElapsedMs: 20, caseElapsedMs: cases.map((entry) => entry.elapsedMs) };
  const receipt = sealStoryBeatBrowserEvaluationReceipt({
    schemaVersion: 1,
    kind: "story-beat-browser-evaluation",
    experiment: "manual-ephemeral-noncanonical",
    runId: "publication-fixture-1",
    modelAdmitted: false,
    displayAuthorized: false,
    selection: {
      policy: "reviewed-balanced-18-v1",
      caseCount: 18,
      indexes,
      caseSetHash: sha256(Buffer.from(canonicalStringify(cases.map(({ id, caseHash }) => ({ id, caseHash }))))),
    },
    source: { commit: "1".repeat(40), files: sourceFiles, aggregateSha256: sha256(Buffer.from(canonicalStringify(sourceFiles))) },
    bundle: { files: bundleFiles, aggregateSha256: sha256(Buffer.from(canonicalStringify(bundleFiles))) },
    model: { format: "transformers-js-onnx-q8", files: modelFiles, aggregateSha256: sha256(Buffer.from(canonicalStringify(modelFiles))) },
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
      files: storyBeatBrowserEvaluationRuntimeFiles,
      aggregateSha256: sha256(Buffer.from(canonicalStringify(storyBeatBrowserEvaluationRuntimeFiles))),
    },
    browser: { name: "chromium", version: "140.0.0.0", execution: "wasm", dtype: "q8" },
    network: { serviceWorkers: "blocked", offlineBeforeModelLoad: true, externalRequestCount: 0, postOfflineRequestCount: 0 },
    timing: {
      ...timingPayload,
      totalCaseElapsedMs: timingPayload.caseElapsedMs.reduce((sum, value) => sum + value, 0),
      timingHash: sha256(Buffer.from(canonicalStringify(timingPayload))),
    },
    metrics,
    cases,
    outputHash: sha256(Buffer.from(canonicalStringify(cases))),
  });
  return { receipt, holdout };
}

const passingFp32 = Object.freeze({
  rowCount: 200,
  firstPassValidCount: 198,
  firstPassInvalidCount: 2,
  firstPassValidityBasisPoints: 9900,
  unknownWordOutputCount: 0,
  unknownCapitalizedWordOutputCount: 0,
  unknownNumericClaimOutputCount: 0,
  promptEchoOutputCount: 0,
  fallbackCopyCount: 0,
  exactSourceFieldCopyCount: 0,
  exactFieldOrFallbackCopyCount: 0,
  referenceTargetCopyCount: 11,
  uniqueOutputCount: 198,
  delexicalizedShapeCount: 20,
  maximumShapeFrequency: 20,
});

function passingQ8(caseCount) {
  const preview = caseCount === 18;
  return {
    caseCount,
    validCaseCount: caseCount,
    invalidCaseCount: 0,
    validityRatePermyriad: 10_000,
    fallbackRequiredCaseCount: 0,
    fallbackRequiredRatePermyriad: 0,
    unknownLexemeCaseCount: 0,
    promptScaffoldEchoCaseCount: 0,
    sourceFieldExactEchoCaseCount: 0,
    targetExactMatchCaseCount: 2,
    uniqueRawOutputCount: preview ? 18 : 195,
    uniqueRawOutputRatePermyriad: preview ? 10_000 : 9750,
    uniqueValidOutputCount: preview ? 18 : 195,
    uniqueValidOutputRatePermyriad: preview ? 10_000 : 9750,
    maximumRawDuplicateCount: preview ? 1 : 2,
    delexicalizedShapeCount: 8,
    maximumShapeFrequency: preview ? 4 : 50,
  };
}

function aggregateFixture() {
  const generator = { path: "tools/narrator-story-beat-publication/publication.mjs", byteLength: 1, sha256: hash64("1") };
  const files = [generator];
  const contractsPayload = {
    hostile: { caseCount: 18, rejectedCount: 18, corpusHash: "1".repeat(16), caseSetHash: "2".repeat(16), rejectionReasonSetHash: "3".repeat(16) },
    productionBoundary: { validatorSourceSha256: hash64("1"), corpusSourceSha256: hash64("2"), corpusTestSha256: hash64("3"), storyBeatTestSha256: hash64("4") },
    antiEcho: { recentDraftLimit: 8, sourceSha256: hash64("5"), hostileTestSha256: hash64("6") },
    controller: { sourceSha256: hash64("7"), hostileTestSha256: hash64("8") },
  };
  const runtimeArtifacts = storyBeatBrowserEvaluationModelPaths.map((path, index) => ({
    path,
    role: path.includes("onnx/") ? "weights" : path.includes("tokenizer") ? "tokenizer" : "configuration",
    byteLength: index + 100,
    sha256: hash64(String((index + 1) % 10)),
  }));
  const projection = (metrics, scalar) => ({
    receiptFileSha256: hash64(scalar),
    receiptContentHash: scalar.repeat(16),
    outputHash: hash64(scalar),
    selectionHash: hash64(scalar),
    bundleAggregateSha256: hash64(scalar),
    metrics,
  });
  return {
    producer: {
      repository: "huntergdavis/the-grind-2",
      commit: "a".repeat(40),
      files,
      aggregateSha256: digest(Buffer.from(canonicalStringify(files))),
      generator: { path: generator.path, sha256: generator.sha256 },
    },
    contracts: { ...contractsPayload, contractHash: canonicalHash(contractsPayload) },
    training: {
      receiptFileSha256: hash64("1"), receiptSha256: hash64("2"),
      corpus: { schemaVersion: 1, corpusHash: "4".repeat(16), fileSha256: hash64("3") },
      rows: { dev: 20, total: 200, train: 180 }, sourceTreeSha256: hash64("4"), checkpointTreeSha256: hash64("5"),
    },
    derived: {
      lockFileSha256: hash64("1"), lockContentSha256: hash64("2"), rebuildReceiptFileSha256: hash64("3"),
      rebuildReceiptSha256: hash64("4"), checkpointTreeSha256: hash64("5"), baseLockSha256: hash64("6"),
      rebuildHarnessSha256: hash64("7"), totalRuntimeBytes: runtimeArtifacts.reduce((sum, entry) => sum + entry.byteLength, 0),
      processIsolation: "fresh-python-process-per-build", reproducibility: "byte-identical-isolated-processes", runtimeArtifacts,
    },
    fp32: {
      resultsFileSha256: hash64("1"), resultsContentHash: "2".repeat(16),
      validationReportFileSha256: hash64("3"), validationReportContentHash: "4".repeat(16),
      selectionHash: "5".repeat(16), metrics: { ...passingFp32 },
    },
    q8Preview: projection(passingQ8(18), "6"),
    q8Full: projection(passingQ8(200), "7"),
    holdout: { corpusHash: "8".repeat(16), fileSha256: hash64("8"), byteLength: 140_000, caseCount: 200 },
  };
}

test("delexicalizes with the frozen evaluator algorithm", () => {
  const shape = delexicalizedStoryBeatShape("At Bell Tower, Mira marks 2 bridge.", {
    location: "Bell Tower", headline: "The bridge falls", action: "Mira marks bridge", consequence: "The ward closes",
  });
  assert.equal(shape, "at <place> , <action> <number> <action>.");
});

test("recomputes q8 evidence from raw cases and counts deterministic-headline echo", () => {
  const { receipt, holdout } = q8ReceiptFixture({ fallbackFirst: true });
  const evidence = recomputeQ8Evidence({
    receipt,
    holdout,
    validateStoryBeatResult: (candidate, facts) => candidate === facts.headline ? null : candidate,
  });
  assert.equal(evidence.metrics.validCaseCount, 17);
  assert.equal(evidence.metrics.fallbackRequiredCaseCount, 1);
  assert.equal(evidence.metrics.sourceFieldExactEchoCaseCount, 1);
  assert.equal(evidence.metrics.targetExactMatchCaseCount, 17);
  assert.ok(evidence.metrics.delexicalizedShapeCount >= 1);
});

test("frozen policy accepts exact boundary values and treats target copies as measured", () => {
  const result = evaluatePublicationPolicy({
    fp32Metrics: passingFp32,
    q8PreviewMetrics: passingQ8(18),
    q8FullMetrics: passingQ8(200),
    hostile: { caseCount: 18, rejectedCount: 18 },
  });
  assert.equal(result.passed, true);
  assert.equal(result.gates.some((entry) => entry.name.includes("target")), false);
});

test("frozen policy rejects each critical quality regression", () => {
  for (const mutate of [
    (value) => {
      value.fp32Metrics.firstPassValidCount = 197;
      value.fp32Metrics.firstPassInvalidCount = 3;
      value.fp32Metrics.firstPassValidityBasisPoints = 9850;
    },
    (value) => { value.fp32Metrics.unknownWordOutputCount = 1; },
    (value) => { value.q8PreviewMetrics.delexicalizedShapeCount = 7; },
    (value) => { value.q8PreviewMetrics.maximumShapeFrequency = 5; },
    (value) => {
      value.q8FullMetrics.uniqueValidOutputCount = 189;
      value.q8FullMetrics.uniqueValidOutputRatePermyriad = 9450;
    },
    (value) => { value.q8FullMetrics.maximumRawDuplicateCount = 3; },
    (value) => { value.q8FullMetrics.sourceFieldExactEchoCaseCount = 1; },
    (value) => { value.hostile.rejectedCount = 17; },
  ]) {
    const value = { fp32Metrics: { ...passingFp32 }, q8PreviewMetrics: passingQ8(18), q8FullMetrics: passingQ8(200), hostile: { caseCount: 18, rejectedCount: 18 } };
    mutate(value);
    assert.equal(evaluatePublicationPolicy(value).passed, false);
  }
});

test("policy validation rejects type coercion before comparisons", () => {
  const q8FullMetrics = passingQ8(200);
  q8FullMetrics.validCaseCount = "200";
  assert.throws(() => evaluatePublicationPolicy({
    fp32Metrics: passingFp32,
    q8PreviewMetrics: passingQ8(18),
    q8FullMetrics,
    hostile: { caseCount: 18, rejectedCount: 18 },
  }), /safe integer/u);
});

test("documents are deterministic, authority-false, public-safe, and non-cyclic", () => {
  const first = createPublicationDocuments(aggregateFixture());
  const second = createPublicationDocuments(aggregateFixture());
  assert.equal(stableJsonStringify(first), stableJsonStringify(second));
  assert.equal(first.qualityReceipt.modelAdmitted, false);
  assert.equal(first.stagingPlan.displayAuthorized, false);
  assert.equal(first.stagingPlan.qualityReceipt.contentHash, first.qualityReceipt.contentHash);
  assert.equal(Object.hasOwn(first.qualityReceipt, "stagingPlan"), false);
  assert.doesNotThrow(() => assertPublicSafe(first));
});

test("aggregate constructor rejects unknown keys, authority, and private prose/path fields", () => {
  const unknown = aggregateFixture();
  unknown.q8Full.unknown = 1;
  assert.throws(() => createPublicationDocuments(unknown), /keys differ/u);
  const failed = aggregateFixture();
  failed.q8Full.metrics.sourceFieldExactEchoCaseCount = 1;
  assert.throws(() => createPublicationDocuments(failed), /publication policy failed/u);
  assert.throws(() => assertPublicSafe({ modelAdmitted: false, candidate: "secret prose" }), /forbidden/u);
  assert.throws(() => assertPublicSafe({ source: "/private/checkpoint" }), /local path/u);
});

test("parses only the exact closed publication CLI", () => {
  const flags = [
    "--checkpoint", "c", "--training-receipt", "t", "--fp32-results", "fr", "--fp32-report", "fp",
    "--derived-lock", "d", "--rebuild-receipt", "r", "--staged-model", "s", "--q8-preview", "p",
    "--q8-full", "f", "--holdout", "h", "--out", "o",
  ];
  assert.equal(parsePublicationArguments(["create", ...flags])?.mode, "create");
  assert.equal(parsePublicationArguments(["verify", ...flags])?.mode, "verify");
  assert.equal(parsePublicationArguments(["create", ...flags.slice(0, -2)]), null);
  assert.equal(parsePublicationArguments(["create", ...flags, "--out", "again"]), null);
  assert.equal(parsePublicationArguments(["publish", ...flags]), null);
});

test("path overlap is symmetric and segment-aware", () => {
  assert.equal(publicationPathsOverlap("/a/model", "/a/model/file"), true);
  assert.equal(publicationPathsOverlap("/a/model/file", "/a/model"), true);
  assert.equal(publicationPathsOverlap("/a/model", "/a/model-two"), false);
});

test("verify mode is byte-exact and rejects unknown keys, authority changes, numeric coercion, and symlinks", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "story-beat-publication-test-"));
  try {
    const output = join(temporary, "evidence");
    await mkdir(output);
    const documents = createPublicationDocuments(aggregateFixture());
    const qualityBytes = `${stableJsonStringify(documents.qualityReceipt)}\n`;
    const planBytes = `${stableJsonStringify(documents.stagingPlan)}\n`;
    await writeFile(join(output, qualityReceiptFile), qualityBytes);
    await writeFile(join(output, stagingPlanFile), planBytes);
    await assert.doesNotReject(verifyPublicationDocuments(output, documents));

    const unknown = { ...documents.qualityReceipt, unknown: 1 };
    await writeFile(join(output, qualityReceiptFile), `${stableJsonStringify(unknown)}\n`);
    await assert.rejects(verifyPublicationDocuments(output, documents), /bytes differ/u);

    await writeFile(join(output, qualityReceiptFile), qualityBytes.replace('"modelAdmitted":false', '"modelAdmitted":true'));
    await assert.rejects(verifyPublicationDocuments(output, documents), /bytes differ/u);

    await writeFile(join(output, qualityReceiptFile), qualityBytes.replace('"schemaVersion":1', '"schemaVersion":1.0'));
    await assert.rejects(verifyPublicationDocuments(output, documents), /bytes differ/u);

    await rm(join(output, qualityReceiptFile));
    await symlink(stagingPlanFile, join(output, qualityReceiptFile));
    await assert.rejects(verifyPublicationDocuments(output, documents), /closure differs/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
