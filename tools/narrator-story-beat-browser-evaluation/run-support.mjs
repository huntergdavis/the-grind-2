import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

export const storyBeatBrowserEvaluationProtocolVersion = 1;
export const storyBeatBrowserEvaluationReceiptFile = "story-beat-browser-evaluation.json";
export const storyBeatBrowserEvaluationDefaultCaseCount = 18;
export const storyBeatBrowserEvaluationFullCaseCount = 200;
export const storyBeatBrowserEvaluationExpectedHoldoutCorpusHash = "d88a61b1639188c0";
export const storyBeatBrowserEvaluationExpectedHoldoutSha256 = "140995fd6888c14fec1ea5dd3fd79aeaa4c1ad230f6d4ce50e5ecca10db1f079";
export const storyBeatBrowserEvaluationRepresentativeIndexes = Object.freeze([
  4, 7, 8, 20, 30, 58, 63, 70, 79, 89, 91, 107, 126, 147, 175, 177, 189, 191,
]);
export const storyBeatBrowserEvaluationModelPaths = Object.freeze([
  "config.json",
  "generation_config.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
]);
export const storyBeatBrowserEvaluationRuntimeFiles = Object.freeze([
  Object.freeze({
    path: "ort-wasm-simd-threaded.asyncify.mjs",
    role: "runtime-module",
    byteLength: 47_389,
    sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
  }),
  Object.freeze({
    path: "ort-wasm-simd-threaded.asyncify.wasm",
    role: "runtime-wasm",
    byteLength: 23_567_050,
    sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
  }),
]);

const promptInstruction = "Write one sentence of at most 24 words. Name the place and use only facts and words supplied below. Do not add dialogue, thoughts, future events, quests, rewards, harm, or relationships.";
const exactEnvelopeKeys = Object.freeze(["cases", "corpusHash", "schemaVersion"]);
const exactRowKeys = Object.freeze(["caseHash", "id", "prompt", "split", "target"]);
const exactResultKeys = Object.freeze([
  "candidate",
  "caseHash",
  "elapsedMs",
  "fallbackRequired",
  "id",
  "index",
  "inputTokens",
  "outputTokens",
  "valid",
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

export function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("Canonical evidence numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  fail(`Unsupported canonical evidence value: ${typeof value}`);
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
    .toString(16).padStart(8, "0")}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
    && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
    && value.split("\n").every((line) => line.length > 0);
}

function parsePromptField(line, label) {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) fail(`Story-beat prompt is missing ${label}`);
  const encoded = line.slice(prefix.length);
  let decoded;
  try {
    decoded = JSON.parse(encoded);
  } catch {
    fail(`Story-beat prompt ${label} is not JSON`);
  }
  if (!boundedText(decoded, 280) || JSON.stringify(decoded) !== encoded) {
    fail(`Story-beat prompt ${label} is not canonical bounded text`);
  }
  return decoded;
}

export function parseStoryBeatPrompt(prompt) {
  if (!boundedPrompt(prompt)) fail("Story-beat prompt is invalid");
  const lines = prompt.split("\n");
  if (lines.length !== 6 || lines[0] !== promptInstruction || lines[5] !== "BEAT:") {
    fail("Story-beat prompt does not match the V1 frame");
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: "public-story-beat",
    location: parsePromptField(lines[1], "PLACE"),
    headline: parsePromptField(lines[2], "HEADLINE"),
    action: parsePromptField(lines[3], "ACTION"),
    consequence: parsePromptField(lines[4], "CONSEQUENCE"),
  });
}

function validateRow(value, index) {
  if (!hasExactKeys(value, exactRowKeys)
    || value.id !== `story-beat-training-corpus-v1:holdout:${String(index).padStart(4, "0")}`
    || value.split !== "holdout"
    || !boundedPrompt(value.prompt)
    || !boundedText(value.target, 160)
    || !/^[0-9a-f]{16}$/u.test(value.caseHash)) {
    fail(`Sealed holdout row ${index} is invalid`);
  }
  parseStoryBeatPrompt(value.prompt);
  const payload = {
    id: value.id,
    split: value.split,
    prompt: value.prompt,
    target: value.target,
  };
  if (canonicalHash(payload) !== value.caseHash) fail(`Sealed holdout row ${index} hash differs`);
  return Object.freeze({ ...value });
}

function parseStoryBeatHoldoutEnvelope(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 4_000_000) {
    fail("Sealed holdout bytes are invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("Sealed holdout is not JSON");
  }
  if (!hasExactKeys(parsed, exactEnvelopeKeys)
    || parsed.schemaVersion !== 1
    || !Array.isArray(parsed.cases)
    || parsed.cases.length !== storyBeatBrowserEvaluationFullCaseCount
    || !/^[0-9a-f]{16}$/u.test(parsed.corpusHash)) {
    fail("Sealed holdout envelope is invalid");
  }
  const cases = Object.freeze(parsed.cases.map(validateRow));
  const payload = { schemaVersion: 1, cases };
  if (canonicalHash(payload) !== parsed.corpusHash) fail("Sealed holdout corpus hash differs");
  return Object.freeze({ ...payload, corpusHash: parsed.corpusHash });
}

// Fixture-only seam: production callers cannot bypass the committed holdout
// identity enforced by parseSealedStoryBeatHoldout.
export function parseStoryBeatHoldoutFixtureForTest(text) {
  return parseStoryBeatHoldoutEnvelope(text);
}

export function parseSealedStoryBeatHoldout(text) {
  const parsed = parseStoryBeatHoldoutEnvelope(text);
  if (parsed.corpusHash !== storyBeatBrowserEvaluationExpectedHoldoutCorpusHash) {
    fail("Sealed holdout does not match the committed export evidence");
  }
  return parsed;
}

export function selectStoryBeatHoldoutCases(cases, full = false) {
  if (!Array.isArray(cases) || cases.length !== storyBeatBrowserEvaluationFullCaseCount) {
    fail("Representative selection requires the exact sealed holdout");
  }
  if (full === true) return Object.freeze([...cases]);
  if (full !== false) fail("Full selection flag is invalid");
  const indexes = storyBeatBrowserEvaluationRepresentativeIndexes;
  if (new Set(indexes).size !== indexes.length) fail("Representative selection collapsed");
  return Object.freeze(indexes.map((index) => cases[index]));
}

function words(value) {
  return (value.match(wordPattern) ?? []).map((word) => word.toLocaleLowerCase("en-US"));
}

export function diagnoseStoryBeatCandidate(row, candidate) {
  if (!isRecord(row) || typeof row.prompt !== "string" || typeof candidate !== "string") {
    fail("Story-beat diagnostic input is invalid");
  }
  const facts = parseStoryBeatPrompt(row.prompt);
  const sourceWords = new Set(words(`${facts.location} ${facts.headline} ${facts.action} ${facts.consequence}`));
  const unknownLexemes = Object.freeze([...new Set(words(candidate)
    .filter((word) => !sourceWords.has(word) && !connectorWords.has(word)))].sort());
  return Object.freeze({
    unknownLexemes,
    promptScaffoldEcho: /(?:PLACE:|HEADLINE:|ACTION:|CONSEQUENCE:|BEAT:)/u.test(candidate),
    sourceFieldExactEcho: candidate === facts.location
      || candidate === facts.headline
      || candidate === facts.action
      || candidate === facts.consequence,
    targetExactMatch: candidate === row.target,
    deterministicFallback: facts.headline,
  });
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : Math.floor((numerator * 10_000) / denominator);
}

export function summarizeStoryBeatResults(rows, results) {
  if (!Array.isArray(rows) || !Array.isArray(results) || rows.length === 0 || rows.length !== results.length) {
    fail("Story-beat result closure is incomplete");
  }
  const rawOutputs = [];
  const validOutputs = [];
  let validCaseCount = 0;
  let fallbackRequiredCaseCount = 0;
  let unknownLexemeCaseCount = 0;
  let promptScaffoldEchoCaseCount = 0;
  let sourceFieldExactEchoCaseCount = 0;
  let targetExactMatchCaseCount = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const row = rows[index];
    if (!hasExactKeys(result, exactResultKeys)
      || result.index !== index
      || result.id !== row.id
      || result.caseHash !== row.caseHash
      || typeof result.candidate !== "string"
      || result.candidate.length > 2_000
      || typeof result.valid !== "boolean"
      || result.fallbackRequired !== !result.valid
      || !Number.isSafeInteger(result.inputTokens) || result.inputTokens < 1 || result.inputTokens > 320
      || !Number.isSafeInteger(result.outputTokens) || result.outputTokens < 1 || result.outputTokens > 48
      || !Number.isSafeInteger(result.elapsedMs) || result.elapsedMs < 0) {
      fail(`Story-beat browser result ${index} is invalid`);
    }
    const diagnostic = diagnoseStoryBeatCandidate(row, result.candidate);
    rawOutputs.push(result.candidate);
    if (result.valid) {
      validCaseCount += 1;
      validOutputs.push(result.candidate);
    } else fallbackRequiredCaseCount += 1;
    if (diagnostic.unknownLexemes.length > 0) unknownLexemeCaseCount += 1;
    if (diagnostic.promptScaffoldEcho) promptScaffoldEchoCaseCount += 1;
    if (diagnostic.sourceFieldExactEcho) sourceFieldExactEchoCaseCount += 1;
    if (diagnostic.targetExactMatch) targetExactMatchCaseCount += 1;
  }
  const rawCounts = new Map();
  for (const output of rawOutputs) rawCounts.set(output, (rawCounts.get(output) ?? 0) + 1);
  const uniqueRawOutputCount = rawCounts.size;
  const uniqueValidOutputCount = new Set(validOutputs).size;
  return Object.freeze({
    caseCount: rows.length,
    validCaseCount,
    invalidCaseCount: rows.length - validCaseCount,
    validityRatePermyriad: rate(validCaseCount, rows.length),
    fallbackRequiredCaseCount,
    fallbackRequiredRatePermyriad: rate(fallbackRequiredCaseCount, rows.length),
    unknownLexemeCaseCount,
    promptScaffoldEchoCaseCount,
    sourceFieldExactEchoCaseCount,
    targetExactMatchCaseCount,
    uniqueRawOutputCount,
    uniqueRawOutputRatePermyriad: rate(uniqueRawOutputCount, rows.length),
    uniqueValidOutputCount,
    uniqueValidOutputRatePermyriad: rate(uniqueValidOutputCount, validCaseCount),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
  });
}

export function storyBeatEvaluationPathsOverlap(left, right) {
  if (typeof left !== "string" || typeof right !== "string") fail("Overlap paths are invalid");
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}${sep}`)
    || normalizedRight.startsWith(`${normalizedLeft}${sep}`);
}

export function resolveStoryBeatEvaluationServerRoute(method, rawUrl, availablePaths) {
  if (method !== "GET" || typeof rawUrl !== "string" || rawUrl.includes("%")
    || !(availablePaths instanceof Set)) return null;
  try {
    const url = new URL(rawUrl, "http://127.0.0.1");
    if (url.origin !== "http://127.0.0.1" || url.search !== "" || url.hash !== "") return null;
    const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    return availablePaths.has(path) ? path : null;
  } catch {
    return null;
  }
}

function hashManifestIsValid(value, expectedKeys = ["byteLength", "path", "sha256"]) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => hasExactKeys(entry, expectedKeys)
      && typeof entry.path === "string" && entry.path.length > 0
      && Number.isSafeInteger(entry.byteLength) && entry.byteLength > 0
      && typeof entry.sha256 === "string" && /^[0-9a-f]{64}$/u.test(entry.sha256));
}

function expectedSelectionIndexes(caseCount) {
  if (caseCount === storyBeatBrowserEvaluationDefaultCaseCount) {
    return storyBeatBrowserEvaluationRepresentativeIndexes;
  }
  if (caseCount === storyBeatBrowserEvaluationFullCaseCount) {
    return Object.freeze(Array.from({ length: storyBeatBrowserEvaluationFullCaseCount }, (_, index) => index));
  }
  return null;
}

function metricsFromEvidence(cases) {
  const valid = cases.filter((entry) => entry.valid);
  const rawCounts = new Map();
  for (const entry of cases) rawCounts.set(entry.candidate, (rawCounts.get(entry.candidate) ?? 0) + 1);
  return {
    caseCount: cases.length,
    validCaseCount: valid.length,
    invalidCaseCount: cases.length - valid.length,
    validityRatePermyriad: rate(valid.length, cases.length),
    fallbackRequiredCaseCount: cases.filter((entry) => entry.fallbackRequired).length,
    fallbackRequiredRatePermyriad: rate(cases.filter((entry) => entry.fallbackRequired).length, cases.length),
    unknownLexemeCaseCount: cases.filter((entry) => entry.unknownLexemes.length > 0).length,
    promptScaffoldEchoCaseCount: cases.filter((entry) => entry.promptScaffoldEcho).length,
    sourceFieldExactEchoCaseCount: cases.filter((entry) => entry.sourceFieldExactEcho).length,
    targetExactMatchCaseCount: cases.filter((entry) => entry.targetExactMatch).length,
    uniqueRawOutputCount: rawCounts.size,
    uniqueRawOutputRatePermyriad: rate(rawCounts.size, cases.length),
    uniqueValidOutputCount: new Set(valid.map((entry) => entry.candidate)).size,
    uniqueValidOutputRatePermyriad: rate(new Set(valid.map((entry) => entry.candidate)).size, valid.length),
    maximumRawDuplicateCount: Math.max(...rawCounts.values()),
  };
}

export function sealStoryBeatBrowserEvaluationReceipt(payload) {
  if (!isRecord(payload) || Object.hasOwn(payload, "contentHash")) fail("Receipt payload is invalid");
  return Object.freeze({ ...payload, contentHash: canonicalHash(payload) });
}

export function verifyStoryBeatBrowserEvaluationReceipt(value) {
  try {
    if (!hasExactKeys(value, [
      "browser", "bundle", "cases", "contentHash", "displayAuthorized", "experiment", "holdout",
      "kind", "metrics", "model", "modelAdmitted", "network", "outputHash", "runId", "runtime",
      "schemaVersion", "selection", "source", "timing",
    ])
      || value.schemaVersion !== 1
      || value.kind !== "story-beat-browser-evaluation"
      || value.experiment !== "manual-ephemeral-noncanonical"
      || value.modelAdmitted !== false || value.displayAuthorized !== false
      || !boundedText(value.runId, 160)
      || typeof value.contentHash !== "string" || !/^[0-9a-f]{16}$/u.test(value.contentHash)
      || typeof value.outputHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.outputHash)
      || !hasExactKeys(value.source, ["aggregateSha256", "commit", "files"])
      || typeof value.source.commit !== "string" || !/^[0-9a-f]{40}$/u.test(value.source.commit)
      || !hashManifestIsValid(value.source.files)
      || value.source.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(value.source.files)))
      || !hasExactKeys(value.bundle, ["aggregateSha256", "files"])
      || !hashManifestIsValid(value.bundle.files)
      || value.bundle.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(value.bundle.files)))
      || !hasExactKeys(value.model, ["aggregateSha256", "files", "format"])
      || value.model.format !== "transformers-js-onnx-q8"
      || !hashManifestIsValid(value.model.files)
      || canonicalStringify(value.model.files.map((entry) => entry.path))
        !== canonicalStringify(storyBeatBrowserEvaluationModelPaths)
      || value.model.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(value.model.files)))
      || !hasExactKeys(value.holdout, ["byteLength", "corpusHash", "path", "sha256", "totalCaseCount"])
      || value.holdout.path !== "sealed-holdout.json"
      || !Number.isSafeInteger(value.holdout.byteLength) || value.holdout.byteLength <= 0
      || value.holdout.sha256 !== storyBeatBrowserEvaluationExpectedHoldoutSha256
      || value.holdout.corpusHash !== storyBeatBrowserEvaluationExpectedHoldoutCorpusHash
      || value.holdout.totalCaseCount !== storyBeatBrowserEvaluationFullCaseCount
      || !hasExactKeys(value.runtime, [
        "aggregateSha256", "files", "pinnedTokenizerVerified", "transformersPackage", "transformersVersion",
      ])
      || value.runtime.transformersPackage !== "@huggingface/transformers"
      || value.runtime.transformersVersion !== "4.2.0"
      || value.runtime.pinnedTokenizerVerified !== true
      || !hashManifestIsValid(value.runtime.files, ["byteLength", "path", "role", "sha256"])
      || canonicalStringify(value.runtime.files) !== canonicalStringify(storyBeatBrowserEvaluationRuntimeFiles)
      || value.runtime.aggregateSha256 !== sha256(Buffer.from(canonicalStringify(value.runtime.files)))
      || !hasExactKeys(value.browser, ["dtype", "execution", "name", "version"])
      || value.browser.name !== "chromium" || value.browser.execution !== "wasm" || value.browser.dtype !== "q8"
      || !boundedText(value.browser.version, 160)
      || !hasExactKeys(value.network, [
        "externalRequestCount", "offlineBeforeModelLoad", "postOfflineRequestCount", "serviceWorkers",
      ])
      || value.network.serviceWorkers !== "blocked" || value.network.offlineBeforeModelLoad !== true
      || value.network.externalRequestCount !== 0 || value.network.postOfflineRequestCount !== 0
      || !Array.isArray(value.cases) || value.cases.length === 0) return false;

    const indexes = expectedSelectionIndexes(value.cases.length);
    if (indexes === null
      || !hasExactKeys(value.selection, ["caseCount", "caseSetHash", "indexes", "policy"])
      || value.selection.caseCount !== value.cases.length
      || canonicalStringify(value.selection.indexes) !== canonicalStringify(indexes)
      || value.selection.policy !== (value.cases.length === 200
        ? "full-sealed-holdout" : "reviewed-balanced-18-v1")) return false;

    for (let index = 0; index < value.cases.length; index += 1) {
      const entry = value.cases[index];
      if (!hasExactKeys(entry, [
        "candidate", "candidateHash", "caseHash", "deterministicFallbackHash", "elapsedMs",
        "fallbackRequired", "id", "index", "inputTokens", "outputTokens", "promptHash",
        "promptScaffoldEcho", "sourceFieldExactEcho", "targetExactMatch", "targetHash",
        "unknownLexemes", "valid",
      ])
        || entry.index !== index
        || entry.id !== `story-beat-training-corpus-v1:holdout:${String(indexes[index]).padStart(4, "0")}`
        || typeof entry.caseHash !== "string" || !/^[0-9a-f]{16}$/u.test(entry.caseHash)
        || typeof entry.candidate !== "string" || entry.candidate.length > 2_000
        || entry.candidateHash !== canonicalHash(entry.candidate)
        || typeof entry.promptHash !== "string" || !/^[0-9a-f]{16}$/u.test(entry.promptHash)
        || typeof entry.targetHash !== "string" || !/^[0-9a-f]{16}$/u.test(entry.targetHash)
        || typeof entry.deterministicFallbackHash !== "string" || !/^[0-9a-f]{16}$/u.test(entry.deterministicFallbackHash)
        || typeof entry.valid !== "boolean" || entry.fallbackRequired !== !entry.valid
        || !Number.isSafeInteger(entry.inputTokens) || entry.inputTokens < 1 || entry.inputTokens > 320
        || !Number.isSafeInteger(entry.outputTokens) || entry.outputTokens < 1 || entry.outputTokens > 48
        || !Number.isSafeInteger(entry.elapsedMs) || entry.elapsedMs < 0
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
      || !Number.isSafeInteger(value.timing.loadElapsedMs) || value.timing.loadElapsedMs < 0
      || canonicalStringify(value.timing.caseElapsedMs)
        !== canonicalStringify(value.cases.map((entry) => entry.elapsedMs))
      || value.timing.totalCaseElapsedMs !== value.timing.caseElapsedMs.reduce((sum, elapsed) => sum + elapsed, 0)
      || value.timing.timingHash !== sha256(Buffer.from(canonicalStringify({
        loadElapsedMs: value.timing.loadElapsedMs,
        caseElapsedMs: value.timing.caseElapsedMs,
      })))
      || canonicalStringify(value.metrics) !== canonicalStringify(metricsFromEvidence(value.cases))) return false;

    const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "contentHash"));
    return value.contentHash === canonicalHash(payload);
  } catch {
    return false;
  }
}

export function parseStoryBeatBrowserEvaluationArguments(argv) {
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
    if (typeof key !== "string" || !key.startsWith("--") || typeof value !== "string" || value.length === 0) {
      return null;
    }
    const name = key.slice(2);
    if (!allowed.has(name) || Object.hasOwn(options, name)) return null;
    options[name] = value;
    index += 1;
  }
  if (!options["model-dir"] || !options.holdout || !options["run-id"] || !options.out
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(options["run-id"])) return null;
  return Object.freeze(options);
}
