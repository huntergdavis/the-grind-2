import {
  canonicalHash,
  canonicalStringify,
  compareStoryBeatClosurePathSegments,
  resolveStoryBeatEvaluationServerRoute,
  sha256,
  storyBeatBrowserEvaluationRuntimeFiles,
  storyBeatEvaluationPathsOverlap,
} from "../narrator-story-beat-browser-evaluation/run-support.mjs";

export {
  canonicalHash,
  canonicalStringify,
  resolveStoryBeatEvaluationServerRoute,
  sha256,
  storyBeatEvaluationPathsOverlap,
};

export const factualStoryBeatBrowserEvaluationProtocolVersion = 2;
export const factualStoryBeatBrowserEvaluationReceiptFile =
  "factual-story-beat-v2-browser-evaluation.json";
export const factualStoryBeatBrowserEvaluationDefaultCaseCount = 36;
export const factualStoryBeatBrowserEvaluationFullCaseCount = 200;
export const factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash =
  "164200f6c558639e";
export const factualStoryBeatBrowserEvaluationExpectedHoldoutSha256 =
  "2d6c11b3f295bb355c8b84dd659bc48692febc48f26b33d98cb1d865ae23c1fc";
export const factualStoryBeatBrowserEvaluationExpectedModelAggregateSha256 =
  "3b1175e099212819c76de4d471f0e0084c3b87bc2d234b3b5e70a46076424edb";
export const factualStoryBeatBrowserEvaluationRebuildRuntimeManifestSha256 =
  "ef166be09cf03bc505de153a9b16ae970159b3a66d8c31ed70e4da6061a1bf9a";
export const factualStoryBeatBrowserEvaluationRebuildReceiptFileSha256 =
  "86ca0c2c6e01cfdc56e5d9141c21cc2f01967ad4e3948a67149c050026a333a7";
export const factualStoryBeatBrowserEvaluationRepresentativeIndexes =
  Object.freeze([
    0, 3, 10, 20, 24, 29, 30, 38, 43, 45, 46, 49,
    56, 61, 73, 81, 102, 104, 105, 106, 108, 113, 114, 124,
    131, 136, 139, 143, 147, 148, 152, 157, 161, 167, 170, 195,
  ]);
export const factualStoryBeatBrowserEvaluationModelFiles = Object.freeze([
  Object.freeze({
    path: "config.json",
    byteLength: 1_506,
    sha256: "f8045e716db6684883b20b6274c39cf59e6e84c148542d33c6d01de7574b6b18",
  }),
  Object.freeze({
    path: "generation_config.json",
    byteLength: 142,
    sha256: "8145d7eecabff8e16a9876617a6d52728e9b8fbe24c426e6bf9ebbd6bfb87737",
  }),
  Object.freeze({
    path: "onnx/decoder_model_merged_quantized.onnx",
    byteLength: 59_041_810,
    sha256: "35023ce868af4efe8cf86ef87a12b3c5f5977043503cc22e44636d8da3a217c7",
  }),
  Object.freeze({
    path: "onnx/encoder_model_quantized.onnx",
    byteLength: 35_612_462,
    sha256: "ec8ada2d3ab8c526ff976b083ad36eb4485e5a92f3a8f61bece3ab4c5f245f53",
  }),
  Object.freeze({
    path: "tokenizer.json",
    byteLength: 2_422_234,
    sha256: "4d4b21a8cc7c0407dafd8ac6215269cd05c8e49a521c3580479b567879526160",
  }),
  Object.freeze({
    path: "tokenizer_config.json",
    byteLength: 20_830,
    sha256: "26c1243c486c113e7017520b95ef2e82a7fc64d2b79f857759b4d51de0fb8b70",
  }),
]);
export const factualStoryBeatBrowserEvaluationModelPaths = Object.freeze(
  factualStoryBeatBrowserEvaluationModelFiles.map((entry) => entry.path),
);
export const factualStoryBeatBrowserEvaluationRuntimeFiles =
  storyBeatBrowserEvaluationRuntimeFiles;
export const factualStoryBeatBrowserEvaluationSourcePaths = Object.freeze([
  "package-lock.json",
  "package.json",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/narrator/live-form-selection.ts",
  "src/narrator/live-output-policy.ts",
  "src/narrator/live-transformers-adapter.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/story-beat-mechanics-v2.test.ts",
  "src/narrator/story-beat-mechanics-v2.ts",
  "src/narrator/story-beat-v2-form-selection.test.ts",
  "src/narrator/story-beat-v2-form-selection.ts",
  "src/narrator/story-beat-v2-prompt-parser.test.ts",
  "src/narrator/story-beat-v2-training-corpus.test.ts",
  "src/narrator/story-beat-v2-training-corpus.ts",
  "src/narrator/story-beat-v2-transformers-adapter.test.ts",
  "src/narrator/story-beat-v2-transformers-adapter.ts",
  "src/narrator/story-beat-v2.test.ts",
  "src/narrator/story-beat-v2.ts",
  "src/narrator/story-beat.test.ts",
  "src/narrator/story-beat.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-v2-browser-evaluation/.gitignore",
  "tools/narrator-story-beat-v2-browser-evaluation/README.md",
  "tools/narrator-story-beat-v2-browser-evaluation/index.html",
  "tools/narrator-story-beat-v2-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-v2-browser-evaluation/run.mjs",
  "tools/narrator-story-beat-v2-browser-evaluation/src/harness.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/protocol.test.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/protocol.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/selection-coverage.test.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/transformers.worker.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/worker-channel.test.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/src/worker-channel.ts",
  "tools/narrator-story-beat-v2-browser-evaluation/tests/run-support.test.mjs",
  "tools/narrator-story-beat-v2-browser-evaluation/tsconfig.json",
  "tools/narrator-story-beat-v2-browser-evaluation/vite.config.ts",
  "tools/narrator-story-beat-v2-training/evaluate-grounded-production.test.mjs",
  "tools/narrator-story-beat-v2-training/evaluate.py",
  "tools/narrator-story-beat-v2-training/evaluate_grounded.py",
  "tools/narrator-story-beat-v2-training/evaluate_grounded_test.py",
  "tsconfig.json",
]);

export function compareFactualStoryBeatClosurePathSegments(left, right) {
  return compareStoryBeatClosurePathSegments(left, right);
}

const promptInstruction =
  "Write one sentence of at most 24 words. Name the place, include every REQUIRED clause exactly, and connect it to supplied scene words. Add no dialogue, thoughts, future events, quests, rewards, relationships, or unsupplied harm.";
const exactEnvelopeKeys = Object.freeze(["cases", "corpusHash", "schemaVersion"]);
const exactRowKeys = Object.freeze(["caseHash", "id", "prompt", "split", "target"]);
const exactResultKeys = Object.freeze([
  "candidate",
  "caseHash",
  "elapsedMs",
  "exactPlace",
  "fallbackRequired",
  "formId",
  "id",
  "index",
  "inputTokens",
  "outputTokens",
  "presentationBucketId",
  "requiredClausesComplete",
  "sequenceSlot",
  "valid",
]);
const presentationBuckets = Object.freeze([
  "prefix-as",
  "prefix-while",
  "interior-as",
  "interior-while",
  "suffix-as",
  "suffix-while",
]);
const formSources = Object.freeze([
  "action",
  "compact-action",
  "headline",
  "consequence",
]);
const connectorWords = new Set([
  "a", "an", "and", "as", "at", "before", "behind", "beneath", "beside",
  "between", "beyond", "but", "by", "during", "each", "every", "for", "from",
  "has", "have", "here", "in", "inside", "into", "is", "it", "its", "near",
  "no", "not", "now", "of", "on", "only", "or", "out", "outside", "over",
  "past", "so", "still", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "toward", "under",
  "was", "were", "where", "which", "while", "who", "with", "within", "without",
]);
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

function fail(message) {
  throw new TypeError(message);
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function boundedText(value, maximum) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
}

function boundedPrompt(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 2_400
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u
      .test(value)
    && value.split("\n").every((line) => line.length > 0);
}

function parsePromptValue(line, label) {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) fail(`Factual prompt is missing ${label}`);
  const encoded = line.slice(prefix.length);
  let decoded;
  try {
    decoded = JSON.parse(encoded);
  } catch {
    fail(`Factual prompt ${label} is not JSON`);
  }
  if (JSON.stringify(decoded) !== encoded) {
    fail(`Factual prompt ${label} is not canonical JSON`);
  }
  return decoded;
}

function promptText(line, label) {
  const value = parsePromptValue(line, label);
  if (!boundedText(value, 280)) fail(`Factual prompt ${label} is not text`);
  return value;
}

function optionalClause(line, label) {
  const value = parsePromptValue(line, label);
  if (value !== null && !boundedText(value, 160)) {
    fail(`Factual prompt ${label} is not a clause`);
  }
  return value;
}

export function parseFactualStoryBeatPrompt(prompt) {
  if (!boundedPrompt(prompt)) fail("Factual story-beat prompt is invalid");
  const lines = prompt.split("\n");
  if (lines.length !== 9
    || lines[0] !== promptInstruction
    || lines[8] !== "BEAT:") {
    fail("Factual story-beat prompt does not match the V2 frame");
  }
  const lens = parsePromptValue(lines[5], "LENS");
  if (!["cost", "consequence", "contrast"].includes(lens)) {
    fail("Factual story-beat prompt lens is invalid");
  }
  const requiredCost = optionalClause(lines[6], "REQUIRED COST");
  const requiredConsequence = optionalClause(
    lines[7],
    "REQUIRED CONSEQUENCE",
  );
  if ((lens === "cost" && (requiredCost === null || requiredConsequence !== null))
    || (lens === "consequence"
      && (requiredCost !== null || requiredConsequence === null))
    || (lens === "contrast"
      && (requiredCost === null || requiredConsequence === null))) {
    fail("Factual story-beat prompt lens clauses differ");
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: "public-factual-story-beat",
    location: promptText(lines[1], "PLACE"),
    headline: promptText(lines[2], "HEADLINE"),
    action: promptText(lines[3], "ACTION"),
    consequence: promptText(lines[4], "CONSEQUENCE"),
    lens,
    requiredCost,
    requiredConsequence,
  });
}

function validateRow(value, index) {
  if (!hasExactKeys(value, exactRowKeys)
    || value.id
      !== `factual-story-beat-training-corpus-v2:holdout:${String(index).padStart(4, "0")}`
    || value.split !== "holdout"
    || !boundedPrompt(value.prompt)
    || !boundedText(value.target, 160)
    || !/^[0-9a-f]{16}$/u.test(value.caseHash)) {
    fail(`Sealed factual holdout row ${index} is invalid`);
  }
  parseFactualStoryBeatPrompt(value.prompt);
  const payload = {
    id: value.id,
    split: value.split,
    prompt: value.prompt,
    target: value.target,
  };
  if (canonicalHash(payload) !== value.caseHash) {
    fail(`Sealed factual holdout row ${index} hash differs`);
  }
  return Object.freeze({ ...value });
}

function parseFactualStoryBeatHoldoutEnvelope(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 4_000_000) {
    fail("Sealed factual holdout bytes are invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("Sealed factual holdout is not JSON");
  }
  if (!hasExactKeys(parsed, exactEnvelopeKeys)
    || parsed.schemaVersion !== 2
    || !Array.isArray(parsed.cases)
    || parsed.cases.length !== factualStoryBeatBrowserEvaluationFullCaseCount
    || !/^[0-9a-f]{16}$/u.test(parsed.corpusHash)) {
    fail("Sealed factual holdout envelope is invalid");
  }
  const cases = Object.freeze(parsed.cases.map(validateRow));
  const payload = { schemaVersion: 2, cases };
  if (canonicalHash(payload) !== parsed.corpusHash) {
    fail("Sealed factual holdout corpus hash differs");
  }
  return Object.freeze({ ...payload, corpusHash: parsed.corpusHash });
}

export function parseFactualStoryBeatHoldoutFixtureForTest(text) {
  return parseFactualStoryBeatHoldoutEnvelope(text);
}

export function parseSealedFactualStoryBeatHoldout(text) {
  const parsed = parseFactualStoryBeatHoldoutEnvelope(text);
  if (parsed.corpusHash
    !== factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash) {
    fail("Sealed factual holdout does not match committed export evidence");
  }
  return parsed;
}

export function selectFactualStoryBeatHoldoutCases(cases, full = false) {
  if (!Array.isArray(cases)
    || cases.length !== factualStoryBeatBrowserEvaluationFullCaseCount) {
    fail("Factual representative selection requires the exact sealed holdout");
  }
  if (full === true) return Object.freeze([...cases]);
  if (full !== false) fail("Full factual selection flag is invalid");
  const indexes = factualStoryBeatBrowserEvaluationRepresentativeIndexes;
  if (new Set(indexes).size !== indexes.length) {
    fail("Factual representative selection collapsed");
  }
  return Object.freeze(indexes.map((index) => cases[index]));
}

function words(value) {
  return (value.match(wordPattern) ?? [])
    .map((word) => word.toLocaleLowerCase("en-US"));
}

function occurrenceCount(value, part) {
  return value.split(part).length - 1;
}

export function diagnoseFactualStoryBeatCandidate(row, candidate) {
  if (!isRecord(row)
    || typeof row.prompt !== "string"
    || typeof candidate !== "string") {
    fail("Factual story-beat diagnostic input is invalid");
  }
  const facts = parseFactualStoryBeatPrompt(row.prompt);
  const clauses = [facts.requiredCost, facts.requiredConsequence]
    .filter((value) => value !== null);
  const sourceWords = new Set(words([
    facts.location,
    facts.headline,
    facts.action,
    facts.consequence,
    ...clauses,
  ].join(" ")));
  const unknownLexemes = Object.freeze([...new Set(words(candidate)
    .filter((word) => !sourceWords.has(word) && !connectorWords.has(word)))].sort());
  const lower = candidate.toLocaleLowerCase("en-US");
  return Object.freeze({
    lensId: facts.lens,
    requiredClauseHashes: Object.freeze(clauses.map(canonicalHash)),
    requiredClausesComplete: clauses.every((clause) =>
      occurrenceCount(lower, clause.toLocaleLowerCase("en-US")) === 1),
    exactPlace: occurrenceCount(candidate, facts.location) === 1,
    unknownLexemes,
    promptScaffoldEcho:
      /(?:PLACE:|HEADLINE:|ACTION:|CONSEQUENCE:|LENS:|REQUIRED COST:|REQUIRED CONSEQUENCE:|BEAT:)/u
        .test(candidate),
    sourceFieldExactEcho: [
      facts.location,
      facts.headline,
      facts.action,
      facts.consequence,
      ...clauses,
    ].includes(candidate),
    targetExactMatch: candidate === row.target,
    deterministicFallback: facts.headline,
  });
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : Math.floor((numerator * 10_000) / denominator);
}

function countBy(values, expected) {
  return Object.fromEntries(expected.map((value) => [
    value,
    values.filter((entry) => entry === value).length,
  ]));
}

export function summarizeFactualStoryBeatResults(rows, results) {
  if (!Array.isArray(rows)
    || !Array.isArray(results)
    || rows.length === 0
    || rows.length !== results.length) {
    fail("Factual story-beat result closure is incomplete");
  }
  const rawOutputs = [];
  const validOutputs = [];
  const lenses = [];
  const buckets = [];
  let validCaseCount = 0;
  let fallbackRequiredCaseCount = 0;
  let exactPlaceCaseCount = 0;
  let requiredClausesCompleteCaseCount = 0;
  let unknownLexemeCaseCount = 0;
  let promptScaffoldEchoCaseCount = 0;
  let sourceFieldExactEchoCaseCount = 0;
  let targetExactMatchCaseCount = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const row = rows[index];
    if (!hasExactKeys(result, exactResultKeys)
      || result.index !== index
      || result.sequenceSlot !== index
      || result.id !== row.id
      || result.caseHash !== row.caseHash
      || typeof result.candidate !== "string"
      || result.candidate.length > 2_000
      || typeof result.valid !== "boolean"
      || result.fallbackRequired !== !result.valid
      || typeof result.exactPlace !== "boolean"
      || typeof result.requiredClausesComplete !== "boolean"
      || result.presentationBucketId
        !== presentationBuckets[index % presentationBuckets.length]
      || typeof result.formId !== "string"
      || !formSources.some(
        (source) => result.formId === `${result.presentationBucketId}-${source}`,
      )
      || !Number.isSafeInteger(result.inputTokens)
      || result.inputTokens < 1
      || result.inputTokens > 384
      || !Number.isSafeInteger(result.outputTokens)
      || result.outputTokens < 1
      || result.outputTokens > 48
      || !Number.isSafeInteger(result.elapsedMs)
      || result.elapsedMs < 0) {
      fail(`Factual story-beat browser result ${index} is invalid`);
    }
    const diagnostic = diagnoseFactualStoryBeatCandidate(row, result.candidate);
    if (result.exactPlace !== diagnostic.exactPlace
      || result.requiredClausesComplete !== diagnostic.requiredClausesComplete) {
      fail(`Factual story-beat browser result ${index} diagnostics differ`);
    }
    rawOutputs.push(result.candidate);
    lenses.push(diagnostic.lensId);
    buckets.push(result.presentationBucketId);
    if (result.valid) {
      validCaseCount += 1;
      validOutputs.push(result.candidate);
    } else {
      fallbackRequiredCaseCount += 1;
    }
    if (result.exactPlace) exactPlaceCaseCount += 1;
    if (result.requiredClausesComplete) requiredClausesCompleteCaseCount += 1;
    if (diagnostic.unknownLexemes.length > 0) unknownLexemeCaseCount += 1;
    if (diagnostic.promptScaffoldEcho) promptScaffoldEchoCaseCount += 1;
    if (diagnostic.sourceFieldExactEcho) sourceFieldExactEchoCaseCount += 1;
    if (diagnostic.targetExactMatch) targetExactMatchCaseCount += 1;
  }
  const rawCounts = new Map();
  for (const output of rawOutputs) {
    rawCounts.set(output, (rawCounts.get(output) ?? 0) + 1);
  }
  return Object.freeze({
    caseCount: rows.length,
    validCaseCount,
    invalidCaseCount: rows.length - validCaseCount,
    validityRatePermyriad: rate(validCaseCount, rows.length),
    fallbackRequiredCaseCount,
    fallbackRequiredRatePermyriad: rate(fallbackRequiredCaseCount, rows.length),
    exactPlaceCaseCount,
    requiredClausesCompleteCaseCount,
    unknownLexemeCaseCount,
    promptScaffoldEchoCaseCount,
    sourceFieldExactEchoCaseCount,
    targetExactMatchCaseCount,
    uniqueRawOutputCount: rawCounts.size,
    uniqueRawOutputRatePermyriad: rate(rawCounts.size, rows.length),
    uniqueValidOutputCount: new Set(validOutputs).size,
    uniqueValidOutputRatePermyriad: rate(
      new Set(validOutputs).size,
      validCaseCount,
    ),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
    lensCaseCounts: countBy(lenses, ["cost", "consequence", "contrast"]),
    presentationBucketCaseCounts: countBy(buckets, presentationBuckets),
  });
}

function hashManifestIsValid(value, expectedKeys = ["byteLength", "path", "sha256"]) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => hasExactKeys(entry, expectedKeys)
      && typeof entry.path === "string"
      && entry.path.length > 0
      && Number.isSafeInteger(entry.byteLength)
      && entry.byteLength > 0
      && typeof entry.sha256 === "string"
      && /^[0-9a-f]{64}$/u.test(entry.sha256));
}

function expectedSelectionIndexes(caseCount) {
  if (caseCount === factualStoryBeatBrowserEvaluationDefaultCaseCount) {
    return factualStoryBeatBrowserEvaluationRepresentativeIndexes;
  }
  if (caseCount === factualStoryBeatBrowserEvaluationFullCaseCount) {
    return Object.freeze(Array.from(
      { length: factualStoryBeatBrowserEvaluationFullCaseCount },
      (_, index) => index,
    ));
  }
  return null;
}

function metricsFromEvidence(cases) {
  const valid = cases.filter((entry) => entry.valid);
  const rawCounts = new Map();
  for (const entry of cases) {
    rawCounts.set(entry.candidate, (rawCounts.get(entry.candidate) ?? 0) + 1);
  }
  return {
    caseCount: cases.length,
    validCaseCount: valid.length,
    invalidCaseCount: cases.length - valid.length,
    validityRatePermyriad: rate(valid.length, cases.length),
    fallbackRequiredCaseCount: cases.filter((entry) => entry.fallbackRequired).length,
    fallbackRequiredRatePermyriad: rate(
      cases.filter((entry) => entry.fallbackRequired).length,
      cases.length,
    ),
    exactPlaceCaseCount: cases.filter((entry) => entry.exactPlace).length,
    requiredClausesCompleteCaseCount:
      cases.filter((entry) => entry.requiredClausesComplete).length,
    unknownLexemeCaseCount:
      cases.filter((entry) => entry.unknownLexemes.length > 0).length,
    promptScaffoldEchoCaseCount:
      cases.filter((entry) => entry.promptScaffoldEcho).length,
    sourceFieldExactEchoCaseCount:
      cases.filter((entry) => entry.sourceFieldExactEcho).length,
    targetExactMatchCaseCount:
      cases.filter((entry) => entry.targetExactMatch).length,
    uniqueRawOutputCount: rawCounts.size,
    uniqueRawOutputRatePermyriad: rate(rawCounts.size, cases.length),
    uniqueValidOutputCount: new Set(valid.map((entry) => entry.candidate)).size,
    uniqueValidOutputRatePermyriad: rate(
      new Set(valid.map((entry) => entry.candidate)).size,
      valid.length,
    ),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
    lensCaseCounts: countBy(
      cases.map((entry) => entry.lensId),
      ["cost", "consequence", "contrast"],
    ),
    presentationBucketCaseCounts: countBy(
      cases.map((entry) => entry.presentationBucketId),
      presentationBuckets,
    ),
  };
}

export function sealFactualStoryBeatBrowserEvaluationReceipt(payload) {
  if (!isRecord(payload) || Object.hasOwn(payload, "contentHash")) {
    fail("Factual receipt payload is invalid");
  }
  return Object.freeze({ ...payload, contentHash: canonicalHash(payload) });
}

export function verifyFactualStoryBeatBrowserEvaluationReceipt(value) {
  try {
    if (!hasExactKeys(value, [
      "browser", "bundle", "cases", "contentHash", "displayAuthorized",
      "experiment", "holdout", "kind", "metrics", "model", "modelAdmitted",
      "network", "outputHash", "runId", "runtime", "schemaVersion",
      "selection", "source", "timing",
    ])
      || value.schemaVersion !== 2
      || value.kind !== "factual-story-beat-v2-browser-evaluation"
      || value.experiment !== "manual-ephemeral-factual-noncanonical"
      || value.modelAdmitted !== false
      || value.displayAuthorized !== false
      || !boundedText(value.runId, 160)
      || typeof value.contentHash !== "string"
      || !/^[0-9a-f]{16}$/u.test(value.contentHash)
      || typeof value.outputHash !== "string"
      || !/^[0-9a-f]{64}$/u.test(value.outputHash)
      || !hasExactKeys(value.source, ["aggregateSha256", "commit", "files"])
      || typeof value.source.commit !== "string"
      || !/^[0-9a-f]{40}$/u.test(value.source.commit)
      || !hashManifestIsValid(value.source.files)
      || value.source.aggregateSha256
        !== sha256(Buffer.from(canonicalStringify(value.source.files)))
      || !hasExactKeys(value.bundle, ["aggregateSha256", "files"])
      || !hashManifestIsValid(value.bundle.files)
      || value.bundle.aggregateSha256
        !== sha256(Buffer.from(canonicalStringify(value.bundle.files)))
      || !hasExactKeys(value.model, [
        "aggregateSha256", "files", "format", "rebuildReceiptFileSha256",
        "rebuildRuntimeManifestSha256",
      ])
      || value.model.format !== "transformers-js-onnx-q8"
      || canonicalStringify(value.model.files)
        !== canonicalStringify(factualStoryBeatBrowserEvaluationModelFiles)
      || value.model.aggregateSha256
        !== factualStoryBeatBrowserEvaluationExpectedModelAggregateSha256
      || value.model.rebuildReceiptFileSha256
        !== factualStoryBeatBrowserEvaluationRebuildReceiptFileSha256
      || value.model.rebuildRuntimeManifestSha256
        !== factualStoryBeatBrowserEvaluationRebuildRuntimeManifestSha256
      || !hasExactKeys(value.holdout, [
        "byteLength", "corpusHash", "path", "sha256", "totalCaseCount",
      ])
      || value.holdout.path !== "sealed-holdout.json"
      || !Number.isSafeInteger(value.holdout.byteLength)
      || value.holdout.byteLength <= 0
      || value.holdout.sha256
        !== factualStoryBeatBrowserEvaluationExpectedHoldoutSha256
      || value.holdout.corpusHash
        !== factualStoryBeatBrowserEvaluationExpectedHoldoutCorpusHash
      || value.holdout.totalCaseCount
        !== factualStoryBeatBrowserEvaluationFullCaseCount
      || !hasExactKeys(value.runtime, [
        "aggregateSha256", "files", "pinnedTokenizerVerified",
        "transformersPackage", "transformersVersion",
      ])
      || value.runtime.transformersPackage !== "@huggingface/transformers"
      || value.runtime.transformersVersion !== "4.2.0"
      || value.runtime.pinnedTokenizerVerified !== true
      || !hashManifestIsValid(
        value.runtime.files,
        ["byteLength", "path", "role", "sha256"],
      )
      || canonicalStringify(value.runtime.files)
        !== canonicalStringify(factualStoryBeatBrowserEvaluationRuntimeFiles)
      || value.runtime.aggregateSha256
        !== sha256(Buffer.from(canonicalStringify(value.runtime.files)))
      || !hasExactKeys(value.browser, ["dtype", "execution", "name", "version"])
      || value.browser.name !== "chromium"
      || value.browser.execution !== "wasm"
      || value.browser.dtype !== "q8"
      || !boundedText(value.browser.version, 160)
      || !hasExactKeys(value.network, [
        "externalRequestCount", "offlineBeforeModelLoad",
        "postOfflineRequestCount", "serviceWorkers",
      ])
      || value.network.serviceWorkers !== "blocked"
      || value.network.offlineBeforeModelLoad !== true
      || value.network.externalRequestCount !== 0
      || value.network.postOfflineRequestCount !== 0
      || !Array.isArray(value.cases)
      || value.cases.length === 0) return false;

    const indexes = expectedSelectionIndexes(value.cases.length);
    if (indexes === null
      || !hasExactKeys(value.selection, [
        "caseCount", "caseSetHash", "indexes", "policy",
      ])
      || value.selection.caseCount !== value.cases.length
      || canonicalStringify(value.selection.indexes) !== canonicalStringify(indexes)
      || value.selection.policy !== (value.cases.length === 200
        ? "full-sealed-factual-holdout"
        : "reviewed-balanced-36-factual-v2")) return false;

    for (let index = 0; index < value.cases.length; index += 1) {
      const entry = value.cases[index];
      const expectedBucket = presentationBuckets[index % presentationBuckets.length];
      if (!hasExactKeys(entry, [
        "candidate", "candidateHash", "caseHash", "deterministicFallbackHash",
        "elapsedMs", "exactPlace", "fallbackRequired", "formId", "id", "index",
        "inputTokens", "lensId", "outputTokens", "presentationBucketId",
        "promptHash", "promptScaffoldEcho", "requiredClauseHashes",
        "requiredClausesComplete", "sequenceSlot", "sourceFieldExactEcho",
        "targetExactMatch", "targetHash", "unknownLexemes", "valid",
      ])
        || entry.index !== index
        || entry.sequenceSlot !== index
        || entry.id
          !== `factual-story-beat-training-corpus-v2:holdout:${String(indexes[index]).padStart(4, "0")}`
        || typeof entry.caseHash !== "string"
        || !/^[0-9a-f]{16}$/u.test(entry.caseHash)
        || typeof entry.candidate !== "string"
        || entry.candidate.length > 2_000
        || entry.candidateHash !== canonicalHash(entry.candidate)
        || typeof entry.promptHash !== "string"
        || !/^[0-9a-f]{16}$/u.test(entry.promptHash)
        || typeof entry.targetHash !== "string"
        || !/^[0-9a-f]{16}$/u.test(entry.targetHash)
        || typeof entry.deterministicFallbackHash !== "string"
        || !/^[0-9a-f]{16}$/u.test(entry.deterministicFallbackHash)
        || typeof entry.valid !== "boolean"
        || entry.fallbackRequired !== !entry.valid
        || typeof entry.exactPlace !== "boolean"
        || typeof entry.requiredClausesComplete !== "boolean"
        || !["cost", "consequence", "contrast"].includes(entry.lensId)
        || entry.presentationBucketId !== expectedBucket
        || typeof entry.formId !== "string"
        || !formSources.some(
          (source) => entry.formId === `${expectedBucket}-${source}`,
        )
        || !Array.isArray(entry.requiredClauseHashes)
        || entry.requiredClauseHashes.length
          !== (entry.lensId === "contrast" ? 2 : 1)
        || !entry.requiredClauseHashes.every(
          (hash) => typeof hash === "string" && /^[0-9a-f]{16}$/u.test(hash),
        )
        || !Number.isSafeInteger(entry.inputTokens)
        || entry.inputTokens < 1
        || entry.inputTokens > 384
        || !Number.isSafeInteger(entry.outputTokens)
        || entry.outputTokens < 1
        || entry.outputTokens > 48
        || !Number.isSafeInteger(entry.elapsedMs)
        || entry.elapsedMs < 0
        || !Array.isArray(entry.unknownLexemes)
        || !entry.unknownLexemes.every((word) => boundedText(word, 160))
        || typeof entry.promptScaffoldEcho !== "boolean"
        || typeof entry.sourceFieldExactEcho !== "boolean"
        || typeof entry.targetExactMatch !== "boolean") return false;
    }

    if (value.selection.caseSetHash !== sha256(Buffer.from(canonicalStringify(
      value.cases.map((entry) => ({ id: entry.id, caseHash: entry.caseHash })),
    )))
      || value.outputHash !== sha256(Buffer.from(canonicalStringify(value.cases)))
      || !hasExactKeys(value.timing, [
        "caseElapsedMs", "loadElapsedMs", "timingHash", "totalCaseElapsedMs",
      ])
      || !Number.isSafeInteger(value.timing.loadElapsedMs)
      || value.timing.loadElapsedMs < 0
      || canonicalStringify(value.timing.caseElapsedMs)
        !== canonicalStringify(value.cases.map((entry) => entry.elapsedMs))
      || value.timing.totalCaseElapsedMs
        !== value.timing.caseElapsedMs.reduce((sum, elapsed) => sum + elapsed, 0)
      || value.timing.timingHash !== sha256(Buffer.from(canonicalStringify({
        loadElapsedMs: value.timing.loadElapsedMs,
        caseElapsedMs: value.timing.caseElapsedMs,
      })))
      || canonicalStringify(value.metrics)
        !== canonicalStringify(metricsFromEvidence(value.cases))) return false;

    const payload = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    );
    return value.contentHash === canonicalHash(payload);
  } catch {
    return false;
  }
}

export function parseFactualStoryBeatBrowserEvaluationArguments(argv) {
  if (!Array.isArray(argv) || argv[0] !== "evaluate") return null;
  const options = { mode: "evaluate", full: false };
  const allowed = new Set(["model-dir", "holdout", "run-id", "out"]);
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--full") {
      if (options.full) return null;
      options.full = true;
      continue;
    }
    const value = argv[index + 1];
    if (typeof key !== "string"
      || !key.startsWith("--")
      || typeof value !== "string"
      || value.length === 0) return null;
    const name = key.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
    index += 1;
  }
  if (!options["model-dir"]
    || !options.holdout
    || !options["run-id"]
    || !options.out
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(options["run-id"])) {
    return null;
  }
  return Object.freeze(options);
}
