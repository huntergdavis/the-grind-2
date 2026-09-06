#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import {
  lstat,
  open,
  readFile,
  realpath,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  canonicalHash,
  canonicalStringify,
  manifestModelDirectory,
  modelTreeHash,
  parseJsonStrict,
  sha256Bytes,
  sha256Text,
} from "../narrator-story-beat-training/validate-evaluation.mjs";

export const evaluationSchemaVersion = 2;
export const evaluationSeed = 20260906;
export const requiredHoldoutCases = 200;
export const maximumInputTokens = 384;
export const maximumNewTokens = 48;
export const rawValidationReportKind =
  "factual-story-beat-v2-heldout-validation-report";
export const groundedValidationReportKind =
  "factual-story-beat-v2-grounded-heldout-validation-report";

export const qualityRequirements = Object.freeze({
  minimumFirstPassValidCount: 198,
  requiredClauseCompleteCount: 200,
  exactPlaceCount: 200,
  maximumUnknownWordOutputCount: 0,
  maximumUnknownCapitalizedWordOutputCount: 0,
  maximumUnknownNumericClaimOutputCount: 0,
  maximumPromptEchoOutputCount: 0,
  maximumFallbackCopyCount: 0,
  minimumUniqueOutputCount: 198,
  minimumDelexicalizedShapeCount: 6,
  maximumShapeFrequency: 60,
});

const maximumEvidenceOutputCharacters = 4096;
const corpusKeys = Object.freeze(["schemaVersion", "corpusHash", "cases"]);
const caseKeys = Object.freeze(["id", "split", "prompt", "target", "caseHash"]);
const fileKeys = Object.freeze(["path", "byteLength", "sha256"]);
const contractKeys = Object.freeze([
  "seed",
  "device",
  "dtype",
  "offline",
  "deterministicAlgorithms",
  "intraopThreads",
  "interopThreads",
  "maximumInputTokens",
  "maximumNewTokens",
  "doSample",
  "numBeams",
  "numReturnSequences",
  "cleanUpTokenizationSpaces",
  "groundingConstraint",
  "presentationSequence",
  "targetTokenization",
  "exactTopScoreTiePolicy",
  "returnDictInGenerate",
  "minLength",
  "minNewTokens",
  "repetitionPenalty",
  "noRepeatNgramSize",
  "encoderNoRepeatNgramSize",
  "badWordsIds",
  "forceWordsIds",
  "forcedBosTokenId",
  "forcedEosTokenId",
  "suppressTokens",
  "beginSuppressTokens",
  "guidanceScale",
  "decoderStartTokenId",
  "padTokenId",
  "eosTokenId",
]);
const modelKeys = Object.freeze(["path", "treeSha256", "files"]);
const holdoutKeys = Object.freeze([
  "path",
  "schemaVersion",
  "corpusHash",
  "fileSha256",
  "caseCount",
]);
const selectionKeys = Object.freeze([
  "method",
  "requestedCaseCount",
  "selectedCaseCount",
  "selectedIdsHash",
]);
const rowKeys = Object.freeze([
  "ordinal",
  "sourceOrdinal",
  "id",
  "caseHash",
  "selectionRankHash",
  "promptSha256",
  "referenceTargetSha256",
  "inputTokenCount",
  "generatedTokenCount",
  "output",
  "outputSha256",
  "elapsedMicroseconds",
  "rowHash",
]);
const summaryKeys = Object.freeze(["rowCount", "totalElapsedMicroseconds"]);
const evidenceKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "disposition",
  "contract",
  "model",
  "holdout",
  "selection",
  "rows",
  "summary",
  "modelAdmitted",
  "displayAuthorized",
  "contentHash",
]);
const idPattern =
  /^factual-story-beat-training-corpus-v2:holdout:\d{4}$/u;
const hash16Pattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const unsafeSurrogate = /\p{Cs}/u;
const wordPattern =
  /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const numericClaimPattern =
  /[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?/gu;
const neutralWords = new Set([
  "a", "an", "and", "as", "at", "before", "behind", "beneath", "beside",
  "between", "beyond", "but", "by", "during", "each", "every", "for", "from",
  "has", "have", "here", "in", "inside", "into", "is", "it", "its", "near",
  "no", "not", "now", "of", "on", "only", "or", "out", "outside", "over",
  "past", "so", "still", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "toward",
  "under", "was", "were", "where", "which", "while", "who", "with", "within",
  "without",
]);

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validProjectedText(value, maximum, lineFeed) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || value.trim() !== value
    || value.normalize("NFC") !== value
    || !/[\p{L}\p{N}]/u.test(value)
  ) return false;
  for (const scalar of value) {
    if (/\p{Cf}|\p{Cs}|\p{Zl}|\p{Zp}/u.test(scalar)) return false;
    if (/\p{Cc}/u.test(scalar) && !(lineFeed && scalar === "\n")) return false;
  }
  return true;
}

function casePayload(value) {
  return {
    id: value.id,
    split: value.split,
    prompt: value.prompt,
    target: value.target,
  };
}

function envelope(cases) {
  const payload = { schemaVersion: evaluationSchemaVersion, cases };
  return { ...payload, corpusHash: canonicalHash(payload) };
}

export function projectProductionHoldout(productionCorpus) {
  if (!isRecord(productionCorpus) || !Array.isArray(productionCorpus.cases)) {
    fail("factual V2 production training corpus is invalid");
  }
  const rows = productionCorpus.cases
    .filter((entry) => entry.split === "holdout")
    .map((entry) => {
      const payload = {
        id: entry.id,
        split: entry.split,
        prompt: entry.prompt,
        target: entry.target,
      };
      return { ...payload, caseHash: canonicalHash(payload) };
    });
  if (rows.length !== requiredHoldoutCases) {
    fail(
      `factual V2 production holdout must contain exactly ${requiredHoldoutCases} cases`,
    );
  }
  return envelope(rows);
}

export function validateSealedHoldout(value, productionCorpus) {
  if (!hasExactKeys(value, corpusKeys)) fail("factual V2 sealed holdout keys differ");
  if (value.schemaVersion !== evaluationSchemaVersion) {
    fail("factual V2 sealed holdout schema differs");
  }
  if (!Array.isArray(value.cases) || value.cases.length !== requiredHoldoutCases) {
    fail(
      `factual V2 sealed holdout must contain exactly ${requiredHoldoutCases} cases`,
    );
  }
  const ids = new Set();
  const hashes = new Set();
  const prompts = new Set();
  for (const [index, row] of value.cases.entries()) {
    if (!hasExactKeys(row, caseKeys)) {
      fail(`factual V2 sealed holdout cases[${index}] keys differ`);
    }
    if (!idPattern.test(row.id)) {
      fail(`factual V2 sealed holdout cases[${index}].id is invalid`);
    }
    if (row.split !== "holdout") {
      fail("factual V2 sealed holdout cannot contain train/dev rows");
    }
    if (!validProjectedText(row.prompt, 2400, true)) {
      fail(`factual V2 sealed holdout cases[${index}].prompt is invalid`);
    }
    if (!validProjectedText(row.target, 160, false)) {
      fail(`factual V2 sealed holdout cases[${index}].target is invalid`);
    }
    if (
      !hash16Pattern.test(row.caseHash)
      || row.caseHash !== canonicalHash(casePayload(row))
    ) {
      fail(`factual V2 sealed holdout cases[${index}].caseHash differs`);
    }
    if (ids.has(row.id) || hashes.has(row.caseHash) || prompts.has(row.prompt)) {
      fail("factual V2 sealed holdout contains duplicate rows");
    }
    ids.add(row.id);
    hashes.add(row.caseHash);
    prompts.add(row.prompt);
  }
  const payload = { schemaVersion: value.schemaVersion, cases: value.cases };
  if (
    !hash16Pattern.test(value.corpusHash)
    || value.corpusHash !== canonicalHash(payload)
  ) fail("factual V2 sealed holdout corpusHash differs");
  const expected = projectProductionHoldout(productionCorpus);
  if (canonicalStringify(value) !== canonicalStringify(expected)) {
    fail("factual V2 sealed holdout differs from the committed projection");
  }
  return value;
}

export function generationContract() {
  return {
    seed: evaluationSeed,
    device: "cpu",
    dtype: "float32",
    offline: true,
    deterministicAlgorithms: true,
    intraopThreads: 4,
    interopThreads: 1,
    maximumInputTokens,
    maximumNewTokens,
    doSample: false,
    numBeams: 1,
    numReturnSequences: 1,
    cleanUpTokenizationSpaces: false,
    groundingConstraint: "none-unconstrained-pass-through-v2",
    presentationSequence: "model-greedy-unforced-v2",
    targetTokenization: "sealed-reference-never-tokenized-v2",
    exactTopScoreTiePolicy: "transformers-greedy-default-v2",
    returnDictInGenerate: false,
    minLength: 0,
    minNewTokens: 0,
    repetitionPenalty: 1,
    noRepeatNgramSize: 0,
    encoderNoRepeatNgramSize: 0,
    badWordsIds: null,
    forceWordsIds: null,
    forcedBosTokenId: null,
    forcedEosTokenId: null,
    suppressTokens: null,
    beginSuppressTokens: null,
    guidanceScale: null,
    decoderStartTokenId: 0,
    padTokenId: 0,
    eosTokenId: 1,
  };
}

export function selectionRank(row) {
  return canonicalHash({
    schemaVersion: evaluationSchemaVersion,
    purpose: "story-beat-heldout-selection-v1",
    seed: evaluationSeed,
    id: row.id,
    caseHash: row.caseHash,
  });
}

export function selectHoldoutRows(holdout, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > requiredHoldoutCases) {
    fail(`selection count must be within 1..${requiredHoldoutCases}`);
  }
  const ranked = holdout.cases.map((row, sourceOrdinal) => ({
    row,
    sourceOrdinal,
    rankHash: selectionRank(row),
  })).sort((left, right) =>
    compareText(left.rankHash, right.rankHash)
    || compareText(left.row.id, right.row.id));
  const selected = ranked.slice(0, count);
  return {
    selected,
    receipt: {
      method: "canonical-rank-v1",
      requestedCaseCount: count,
      selectedCaseCount: count,
      selectedIdsHash: canonicalHash(selected.map((entry) => entry.row.id)),
    },
  };
}

function validFileEntry(value) {
  return hasExactKeys(value, fileKeys)
    && typeof value.path === "string"
    && value.path.length > 0
    && !value.path.startsWith("/")
    && !value.path.includes("\\")
    && value.path.split("/").every((part) =>
      part !== "" && part !== "." && part !== "..")
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength >= 0
    && sha256Pattern.test(value.sha256);
}

function evidencePayload(evidence) {
  const { contentHash: _contentHash, ...payload } = evidence;
  return payload;
}

function rowPayload(row) {
  const { rowHash: _rowHash, ...payload } = row;
  return payload;
}

function words(value) {
  return [...value.matchAll(wordPattern)].map((match) => ({
    raw: match[0],
    lower: match[0].toLocaleLowerCase("en-US"),
  }));
}

function numericClaims(value) {
  const counts = new Map();
  for (const claim of value.match(numericClaimPattern) ?? []) {
    counts.set(claim, (counts.get(claim) ?? 0) + 1);
  }
  return counts;
}

function sourceText(production, requiredClauses) {
  const narrative = production.facts.narrative;
  return [
    narrative.location,
    narrative.headline,
    narrative.action,
    narrative.consequence,
    ...requiredClauses,
  ].join(" ");
}

function hasUnknownWord(output, source) {
  const available = new Set(words(source).map((token) => token.lower));
  return words(output).some((token) =>
    !available.has(token.lower)
    && !neutralWords.has(token.lower)
    && !/^\p{N}+$/u.test(token.lower));
}

function hasUnknownCapitalizedWord(output, source) {
  const available = new Set(words(source).map((token) => token.lower));
  return words(output).some((token, index) => {
    const firstLetter = [...token.raw].find((scalar) => /\p{L}/u.test(scalar));
    const capitalized = firstLetter !== undefined
      && firstLetter === firstLetter.toLocaleUpperCase("en-US")
      && firstLetter !== firstLetter.toLocaleLowerCase("en-US");
    return capitalized
      && !available.has(token.lower)
      && !(index === 0 && neutralWords.has(token.lower));
  });
}

function hasUnknownNumericClaim(output, source) {
  const available = numericClaims(source);
  const used = numericClaims(output);
  return [...used].some(([claim, count]) =>
    count > (available.get(claim) ?? 0));
}

function isPromptEcho(output) {
  return /\b(?:PLACE|HEADLINE|ACTION|CONSEQUENCE|LENS|REQUIRED COST|REQUIRED CONSEQUENCE|BEAT)\s*:/iu
    .test(output)
    || /write one sentence of at most/iu.test(output)
    || /include every required clause/iu.test(output);
}

function containsWordSequence(output, expected) {
  const haystack = words(output).map((token) => token.lower);
  const needle = words(expected).map((token) => token.lower);
  return needle.length > 0 && haystack.some((_token, start) =>
    needle.every((token, offset) => haystack[start + offset] === token));
}

function delexicalizedShape(output, production, requiredClauses) {
  const narrative = production.facts.narrative;
  const groups = [
    ["place", narrative.location],
    ["action", narrative.action],
    ["headline", narrative.headline],
    ["consequence", narrative.consequence],
    ["mechanic", requiredClauses.join(" ")],
  ].map(([name, value]) => [
    name,
    new Set(words(value).map((token) => token.lower)),
  ]);
  return output.toLocaleLowerCase("en-US").replace(wordPattern, (token) => {
    const lower = token.toLocaleLowerCase("en-US");
    if (/^\p{N}+$/u.test(lower)) return "<number>";
    for (const [name, members] of groups) {
      if (members.has(lower) && !neutralWords.has(lower)) return `<${name}>`;
    }
    if (neutralWords.has(lower)) return lower;
    return "<unknown>";
  }).replace(/(<([a-z]+)>)(?:[\s\-]*\1)+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function validateInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be a safe integer within ${minimum}..${maximum}`);
  }
}

function validateModelBinding(value, expectedModel) {
  if (!hasExactKeys(value, modelKeys)) fail("evaluation model keys differ");
  if (typeof value.path !== "string" || !isAbsolute(value.path)) {
    fail("evaluation model path is invalid");
  }
  if (!sha256Pattern.test(value.treeSha256)) {
    fail("evaluation model tree hash is invalid");
  }
  if (
    !Array.isArray(value.files)
    || value.files.length === 0
    || !value.files.every(validFileEntry)
  ) fail("evaluation model files are invalid");
  const sorted = [...value.files].sort((left, right) =>
    compareText(left.path, right.path));
  if (canonicalStringify(sorted) !== canonicalStringify(value.files)) {
    fail("evaluation model files must be sorted");
  }
  if (new Set(value.files.map((entry) => entry.path)).size !== value.files.length) {
    fail("evaluation model files contain duplicates");
  }
  if (value.treeSha256 !== modelTreeHash(value.files)) {
    fail("evaluation model tree hash differs");
  }
  if (
    value.path !== expectedModel.path
    || value.treeSha256 !== expectedModel.treeSha256
    || canonicalStringify(value.files) !== canonicalStringify(expectedModel.files)
  ) fail("evaluation model closure differs from the supplied checkpoint");
}

function validateHoldoutBinding(value, expectedHoldout) {
  if (!hasExactKeys(value, holdoutKeys)) fail("evaluation holdout keys differ");
  if (
    typeof value.path !== "string"
    || !isAbsolute(value.path)
    || value.path !== expectedHoldout.path
    || value.schemaVersion !== evaluationSchemaVersion
    || value.corpusHash !== expectedHoldout.corpusHash
    || value.fileSha256 !== expectedHoldout.fileSha256
    || value.caseCount !== requiredHoldoutCases
    || !hash16Pattern.test(value.corpusHash)
    || !sha256Pattern.test(value.fileSha256)
  ) fail("evaluation holdout closure differs");
}

function qualityGate(metrics, fullEvaluation) {
  const passed = fullEvaluation
    && metrics.firstPassValidCount
      >= qualityRequirements.minimumFirstPassValidCount
    && metrics.requiredClauseCompleteCount
      === qualityRequirements.requiredClauseCompleteCount
    && metrics.exactPlaceCount === qualityRequirements.exactPlaceCount
    && metrics.unknownWordOutputCount
      <= qualityRequirements.maximumUnknownWordOutputCount
    && metrics.unknownCapitalizedWordOutputCount
      <= qualityRequirements.maximumUnknownCapitalizedWordOutputCount
    && metrics.unknownNumericClaimOutputCount
      <= qualityRequirements.maximumUnknownNumericClaimOutputCount
    && metrics.promptEchoOutputCount
      <= qualityRequirements.maximumPromptEchoOutputCount
    && metrics.fallbackCopyCount
      <= qualityRequirements.maximumFallbackCopyCount
    && metrics.uniqueOutputCount
      >= qualityRequirements.minimumUniqueOutputCount
    && metrics.delexicalizedShapeCount
      >= qualityRequirements.minimumDelexicalizedShapeCount
    && metrics.maximumShapeFrequency
      <= qualityRequirements.maximumShapeFrequency;
  return {
    evaluated: fullEvaluation,
    passed: fullEvaluation ? passed : null,
    requirements: qualityRequirements,
  };
}

export function validateHeldoutEvaluation({
  results,
  resultsFileSha256,
  holdout,
  holdoutPath,
  holdoutFileSha256,
  productionCorpus,
  validateFactualStoryBeatResult,
  factualStoryBeatRequiredClauses,
  deterministicFallback,
  model,
  expectedGenerationContract = generationContract(),
  reportKind = rawValidationReportKind,
}) {
  if (!sha256Pattern.test(resultsFileSha256)) {
    fail("results file SHA-256 is invalid");
  }
  if (
    typeof holdoutPath !== "string"
    || !isAbsolute(holdoutPath)
    || !sha256Pattern.test(holdoutFileSha256)
  ) fail("sealed holdout file binding is invalid");
  validateSealedHoldout(holdout, productionCorpus);
  if (!hasExactKeys(results, evidenceKeys)) {
    fail("evaluation evidence keys differ");
  }
  if (results.schemaVersion !== evaluationSchemaVersion) {
    fail("evaluation evidence schema differs");
  }
  if (
    results.kind !== "story-beat-heldout-generation"
    || results.disposition !== "developer-evidence-not-runtime-admitted"
  ) fail("evaluation evidence identity differs");
  if (results.modelAdmitted !== false || results.displayAuthorized !== false) {
    fail("evaluation evidence cannot admit a model or authorize display");
  }
  if (!hasExactKeys(expectedGenerationContract, contractKeys)) {
    fail("expected evaluation generation contract differs");
  }
  if (
    reportKind !== rawValidationReportKind
    && reportKind !== groundedValidationReportKind
  ) fail("evaluation report kind differs");
  if (
    !hasExactKeys(results.contract, contractKeys)
    || canonicalStringify(results.contract)
      !== canonicalStringify(expectedGenerationContract)
  ) fail("evaluation generation contract differs");
  validateModelBinding(results.model, model);
  validateHoldoutBinding(results.holdout, {
    path: holdoutPath,
    corpusHash: holdout.corpusHash,
    fileSha256: holdoutFileSha256,
  });
  if (!hasExactKeys(results.selection, selectionKeys)) {
    fail("evaluation selection keys differ");
  }
  const requestedCount = results.selection.requestedCaseCount;
  validateInteger(
    requestedCount,
    1,
    requiredHoldoutCases,
    "evaluation requested case count",
  );
  const expectedSelection = selectHoldoutRows(holdout, requestedCount);
  if (
    canonicalStringify(results.selection)
      !== canonicalStringify(expectedSelection.receipt)
  ) fail("evaluation deterministic selection differs");
  if (!Array.isArray(results.rows) || results.rows.length !== requestedCount) {
    fail("evaluation rows differ from the selected count");
  }

  const productionById = new Map(
    productionCorpus.cases
      .filter((entry) => entry.split === "holdout")
      .map((entry) => [entry.id, entry]),
  );
  const ids = new Set();
  const rowHashes = new Set();
  const outputs = new Set();
  const shapes = new Map();
  const rowCountByLens = { cost: 0, consequence: 0, contrast: 0 };
  const validCountByLens = { cost: 0, consequence: 0, contrast: 0 };
  let totalElapsedMicroseconds = 0;
  let firstPassValidCount = 0;
  let requiredClauseCompleteCount = 0;
  let exactPlaceCount = 0;
  let unknownWordOutputCount = 0;
  let unknownCapitalizedWordOutputCount = 0;
  let unknownNumericClaimOutputCount = 0;
  let promptEchoOutputCount = 0;
  let fallbackCopyCount = 0;
  let exactSourceFieldCopyCount = 0;
  let referenceTargetCopyCount = 0;

  for (const [index, row] of results.rows.entries()) {
    const label = `evaluation rows[${index}]`;
    if (!hasExactKeys(row, rowKeys)) fail(`${label} keys differ`);
    validateInteger(row.ordinal, index, index, `${label}.ordinal`);
    validateInteger(
      row.sourceOrdinal,
      0,
      requiredHoldoutCases - 1,
      `${label}.sourceOrdinal`,
    );
    validateInteger(
      row.inputTokenCount,
      1,
      maximumInputTokens,
      `${label}.inputTokenCount`,
    );
    validateInteger(
      row.generatedTokenCount,
      0,
      maximumNewTokens,
      `${label}.generatedTokenCount`,
    );
    validateInteger(
      row.elapsedMicroseconds,
      0,
      Number.MAX_SAFE_INTEGER,
      `${label}.elapsedMicroseconds`,
    );
    if (!idPattern.test(row.id)) fail(`${label}.id is invalid`);
    for (const field of ["caseHash", "selectionRankHash", "rowHash"]) {
      if (!hash16Pattern.test(row[field])) {
        fail(`${label}.${field} is invalid`);
      }
    }
    for (
      const field of [
        "promptSha256",
        "referenceTargetSha256",
        "outputSha256",
      ]
    ) {
      if (!sha256Pattern.test(row[field])) {
        fail(`${label}.${field} is invalid`);
      }
    }
    if (
      typeof row.output !== "string"
      || row.output.length > maximumEvidenceOutputCharacters
      || row.output.normalize("NFC") !== row.output
      || unsafeSurrogate.test(row.output)
    ) fail(`${label}.output is not one bounded NFC string`);
    if (row.outputSha256 !== sha256Text(row.output)) {
      fail(`${label}.outputSha256 differs`);
    }
    if (row.rowHash !== canonicalHash(rowPayload(row))) {
      fail(`${label}.rowHash differs`);
    }
    const expected = expectedSelection.selected[index];
    if (
      row.sourceOrdinal !== expected.sourceOrdinal
      || row.id !== expected.row.id
      || row.caseHash !== expected.row.caseHash
      || row.selectionRankHash !== expected.rankHash
      || row.promptSha256 !== sha256Text(expected.row.prompt)
      || row.referenceTargetSha256 !== sha256Text(expected.row.target)
    ) fail(`${label} differs from the sealed deterministic selection`);
    if (ids.has(row.id) || rowHashes.has(row.rowHash)) {
      fail("evaluation rows contain duplicates");
    }
    ids.add(row.id);
    rowHashes.add(row.rowHash);
    totalElapsedMicroseconds += row.elapsedMicroseconds;
    if (!Number.isSafeInteger(totalElapsedMicroseconds)) {
      fail("evaluation total timing overflowed");
    }

    const production = productionById.get(row.id);
    if (production === undefined) fail(`${label} has no production facts`);
    const requiredClauses = factualStoryBeatRequiredClauses(production.facts);
    if (!Array.isArray(requiredClauses) || requiredClauses.length < 1) {
      fail(`${label} has invalid production mechanic clauses`);
    }
    const lens = production.facts.beatLensId;
    if (!(lens in rowCountByLens)) fail(`${label} has an unknown lens`);
    rowCountByLens[lens] += 1;
    const valid = validateFactualStoryBeatResult(
      row.output,
      production.facts,
    ) === row.output;
    if (valid) {
      firstPassValidCount += 1;
      validCountByLens[lens] += 1;
    }
    const lowerOutput = row.output.toLocaleLowerCase("en-US");
    if (requiredClauses.every((clause) =>
      lowerOutput.includes(clause.toLocaleLowerCase("en-US")))) {
      requiredClauseCompleteCount += 1;
    }
    const narrative = production.facts.narrative;
    if (containsWordSequence(row.output, narrative.location)) {
      exactPlaceCount += 1;
    }
    const source = sourceText(production, requiredClauses);
    if (hasUnknownWord(row.output, source)) unknownWordOutputCount += 1;
    if (hasUnknownCapitalizedWord(row.output, source)) {
      unknownCapitalizedWordOutputCount += 1;
    }
    if (hasUnknownNumericClaim(row.output, source)) {
      unknownNumericClaimOutputCount += 1;
    }
    if (isPromptEcho(row.output)) promptEchoOutputCount += 1;
    if (row.output === deterministicFallback(narrative)) {
      fallbackCopyCount += 1;
    }
    if ([
      narrative.headline,
      narrative.action,
      narrative.consequence,
    ].includes(row.output)) exactSourceFieldCopyCount += 1;
    if (row.output === expected.row.target) referenceTargetCopyCount += 1;
    outputs.add(row.output);
    const shape = delexicalizedShape(
      row.output,
      production,
      requiredClauses,
    );
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }

  if (!hasExactKeys(results.summary, summaryKeys)) {
    fail("evaluation summary keys differ");
  }
  if (
    results.summary.rowCount !== results.rows.length
    || results.summary.totalElapsedMicroseconds !== totalElapsedMicroseconds
  ) fail("evaluation summary differs from the rows");
  if (
    !hash16Pattern.test(results.contentHash)
    || results.contentHash !== canonicalHash(evidencePayload(results))
  ) fail("evaluation contentHash differs");

  const metrics = {
    rowCount: results.rows.length,
    firstPassValidCount,
    firstPassInvalidCount: results.rows.length - firstPassValidCount,
    firstPassValidityBasisPoints:
      Math.floor(firstPassValidCount * 10_000 / results.rows.length),
    requiredClauseCompleteCount,
    exactPlaceCount,
    unknownWordOutputCount,
    unknownCapitalizedWordOutputCount,
    unknownNumericClaimOutputCount,
    promptEchoOutputCount,
    fallbackCopyCount,
    exactSourceFieldCopyCount,
    referenceTargetCopyCount,
    uniqueOutputCount: outputs.size,
    delexicalizedShapeCount: shapes.size,
    maximumShapeFrequency: Math.max(...shapes.values()),
    rowCountByLens,
    validCountByLens,
  };
  const fullEvaluation = results.rows.length === requiredHoldoutCases;
  const reportPayload = {
    schemaVersion: evaluationSchemaVersion,
    kind: reportKind,
    disposition: "developer-evidence-no-admission-or-display-authority",
    integrityAccepted: true,
    fullEvaluation,
    resultsContentHash: results.contentHash,
    resultsFileSha256,
    holdoutCorpusHash: holdout.corpusHash,
    holdoutFileSha256,
    modelTreeSha256: model.treeSha256,
    selection: results.selection,
    metrics,
    qualityGate: qualityGate(metrics, fullEvaluation),
    modelAdmitted: false,
    displayAuthorized: false,
  };
  return { ...reportPayload, contentHash: canonicalHash(reportPayload) };
}

export async function loadProductionContracts(repositoryRoot) {
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const corpusModule = await server.ssrLoadModule(
      "/src/narrator/story-beat-v2-training-corpus.ts",
    );
    const contractModule = await server.ssrLoadModule(
      "/src/narrator/story-beat-v2.ts",
    );
    const v1Module = await server.ssrLoadModule(
      "/src/narrator/story-beat.ts",
    );
    if (
      typeof corpusModule.isFactualStoryBeatTrainingCorpusV2 !== "function"
      || !corpusModule.isFactualStoryBeatTrainingCorpusV2(
        corpusModule.factualStoryBeatTrainingCorpusV2,
      )
      || typeof contractModule.validateFactualStoryBeatResultV2 !== "function"
      || typeof contractModule.factualStoryBeatRequiredClausesV2 !== "function"
      || typeof v1Module.deterministicStoryBeatFallback !== "function"
    ) fail("production factual story-beat V2 contracts failed validation");
    return {
      productionCorpus: corpusModule.factualStoryBeatTrainingCorpusV2,
      validateFactualStoryBeatResult:
        contractModule.validateFactualStoryBeatResultV2,
      factualStoryBeatRequiredClauses:
        contractModule.factualStoryBeatRequiredClausesV2,
      deterministicFallback: v1Module.deterministicStoryBeatFallback,
    };
  } finally {
    await server.close();
  }
}

function safeRawPath(raw, label) {
  if (
    typeof raw !== "string"
    || raw.length === 0
    || raw.includes("\0")
    || raw.includes("\\")
  ) fail(`${label} path is unsafe`);
  const parts = raw.split("/");
  if (parts.some((part, index) =>
    ["~", ".."].includes(part) || (part === "." && index !== 0))) {
    fail(`${label} path traversal is forbidden`);
  }
}

async function strictExistingPath(raw, label, expectedKind) {
  safeRawPath(raw, label);
  const absolute = resolve(raw);
  const resolved = await realpath(absolute);
  if (resolved !== absolute) fail(`${label} path must not traverse a symlink`);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) fail(`${label} path must not be a symlink`);
  if (expectedKind === "file" && !stat.isFile()) {
    fail(`${label} must be a regular file`);
  }
  if (expectedKind === "directory" && !stat.isDirectory()) {
    fail(`${label} must be a regular directory`);
  }
  return absolute;
}

async function strictNewFilePath(raw, label) {
  safeRawPath(raw, label);
  const absolute = resolve(raw);
  const parent = dirname(absolute);
  const resolvedParent = await realpath(parent);
  if (resolvedParent !== parent) {
    fail(`${label} parent must not traverse a symlink`);
  }
  const parentStat = await lstat(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail(`${label} parent must be a regular directory`);
  }
  try {
    await lstat(absolute);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return absolute;
    }
    throw error;
  }
  fail(`${label} must not already exist`);
}

function pathIsWithin(root, candidate) {
  const child = relative(root, candidate);
  return child === ""
    || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`));
}

async function writeValidationReport(path, bytes) {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("report must not already exist");
    }
    throw error;
  }
  try {
    await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const [written, stat] = await Promise.all([readFile(path), lstat(path)]);
  if (!written.equals(bytes) || stat.isSymbolicLink() || !stat.isFile()) {
    fail("report bytes or file type differ after write");
  }
  const parent = await open(dirname(path), fsConstants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

export function parseArguments(argv) {
  if (![6, 8].includes(argv.length)) {
    fail(
      "Usage: node validate-evaluation.mjs --holdout <json> --results <json> "
      + "--model <checkpoint> [--report <new-json>]",
    );
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !["--holdout", "--results", "--model", "--report"].includes(flag)
      || !value
      || flag in result
    ) fail("factual V2 evaluation validator arguments are invalid");
    result[flag] = value;
  }
  if (!["--holdout", "--results", "--model"].every((flag) => flag in result)) {
    fail("factual V2 evaluation validator arguments are incomplete");
  }
  return result;
}

export async function validateEvaluationFiles(
  args,
  {
    expectedGenerationContract = generationContract(),
    reportKind = rawValidationReportKind,
  } = {},
) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "../..");
  const holdoutPath = await strictExistingPath(
    args["--holdout"],
    "holdout",
    "file",
  );
  const resultsPath = await strictExistingPath(
    args["--results"],
    "results",
    "file",
  );
  const modelPath = await strictExistingPath(
    args["--model"],
    "model",
    "directory",
  );
  const reportPath = args["--report"] === undefined
    ? undefined
    : await strictNewFilePath(args["--report"], "report");
  if (holdoutPath === resultsPath) {
    fail("holdout and results must be separate files");
  }
  if (
    reportPath !== undefined
    && (
      reportPath === holdoutPath
      || reportPath === resultsPath
      || pathIsWithin(modelPath, reportPath)
    )
  ) fail("report must not overlap evaluation inputs or model closure");

  const [holdoutBytes, resultsBytes, modelFiles] = await Promise.all([
    readFile(holdoutPath),
    readFile(resultsPath),
    manifestModelDirectory(modelPath),
  ]);
  const holdoutFileSha256 = sha256Bytes(holdoutBytes);
  const resultsFileSha256 = sha256Bytes(resultsBytes);
  const holdout = parseJsonStrict(holdoutBytes, "factual V2 sealed holdout JSON");
  const results = parseJsonStrict(resultsBytes, "factual V2 evaluation results JSON");
  const contracts = await loadProductionContracts(repositoryRoot);
  const model = {
    path: modelPath,
    files: modelFiles,
    treeSha256: modelTreeHash(modelFiles),
  };
  const report = validateHeldoutEvaluation({
    results,
    resultsFileSha256,
    holdout,
    holdoutPath,
    holdoutFileSha256,
    ...contracts,
    model,
    expectedGenerationContract,
    reportKind,
  });

  const [holdoutAfter, resultsAfter, modelFilesAfter] = await Promise.all([
    readFile(holdoutPath),
    readFile(resultsPath),
    manifestModelDirectory(modelPath),
  ]);
  if (
    sha256Bytes(holdoutAfter) !== holdoutFileSha256
    || sha256Bytes(resultsAfter) !== resultsFileSha256
    || canonicalStringify(modelFilesAfter) !== canonicalStringify(modelFiles)
  ) fail("factual V2 evaluation input or model closure changed");
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (reportPath !== undefined) {
    await writeValidationReport(reportPath, reportBytes);
  }
  return reportBytes;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const reportBytes = await validateEvaluationFiles(args);
  process.stdout.write(reportBytes);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `factual story-beat V2 heldout validation refused: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 2;
  });
}
