#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

export const evaluationSchemaVersion = 1;
export const evaluationSeed = 20260904;
export const requiredHoldoutCases = 200;
export const maximumInputTokens = 320;
export const maximumNewTokens = 48;
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

const idPattern = /^story-beat-training-corpus-v1:holdout:\d{4}$/u;
const hash16Pattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const unsafeSurrogate = /\p{Cs}/u;
const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const numericClaimPattern = /[+\-−]?\p{N}+(?:[.,]\p{N}+)*(?:[%‰])?/gu;

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

export function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("Canonical numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) =>
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  fail(`Unsupported canonical value: ${typeof value}`);
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

export function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function scanJsonString(source, start) {
  let index = start + 1;
  while (index < source.length) {
    const scalar = source[index];
    if (scalar === '"') return index + 1;
    if (scalar === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  fail("unterminated JSON string");
}

function rejectDuplicateKeys(source) {
  let index = 0;
  const skipWhitespace = () => {
    while (/[\u0009\u000a\u000d\u0020]/u.test(source[index] ?? "")) index += 1;
  };
  const scanValue = () => {
    skipWhitespace();
    const scalar = source[index];
    if (scalar === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        skipWhitespace();
        if (source[index] !== '"') fail("invalid JSON object key");
        const end = scanJsonString(source, index);
        const key = JSON.parse(source.slice(index, end));
        if (keys.has(key)) fail(`duplicate JSON key: ${key}`);
        keys.add(key);
        index = end;
        skipWhitespace();
        if (source[index] !== ":") fail("invalid JSON object separator");
        index += 1;
        scanValue();
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") fail("invalid JSON object delimiter");
        index += 1;
      }
      fail("unterminated JSON object");
    }
    if (scalar === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        scanValue();
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") fail("invalid JSON array delimiter");
        index += 1;
      }
      fail("unterminated JSON array");
    }
    if (scalar === '"') {
      index = scanJsonString(source, index);
      return;
    }
    while (index < source.length && !/[\s,}\]]/u.test(source[index])) index += 1;
  };
  scanValue();
  skipWhitespace();
  if (index !== source.length) fail("trailing JSON content");
}

export function parseJsonStrict(bytes, label = "JSON") {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    fail(`invalid ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  rejectDuplicateKeys(source);
  return value;
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

export function projectProductionHoldout(productionCorpus) {
  if (!isRecord(productionCorpus) || !Array.isArray(productionCorpus.cases)) {
    fail("production training corpus is invalid");
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
    fail(`production holdout must contain exactly ${requiredHoldoutCases} cases`);
  }
  return envelope(rows);
}

export function validateSealedHoldout(value, productionCorpus) {
  if (!hasExactKeys(value, corpusKeys)) fail("sealed holdout keys differ");
  if (value.schemaVersion !== evaluationSchemaVersion) fail("sealed holdout schema differs");
  if (!Array.isArray(value.cases) || value.cases.length !== requiredHoldoutCases) {
    fail(`sealed holdout must contain exactly ${requiredHoldoutCases} cases`);
  }
  const ids = new Set();
  const hashes = new Set();
  const prompts = new Set();
  for (const [index, row] of value.cases.entries()) {
    if (!hasExactKeys(row, caseKeys)) fail(`sealed holdout cases[${index}] keys differ`);
    if (!idPattern.test(row.id)) fail(`sealed holdout cases[${index}].id is invalid`);
    if (row.split !== "holdout") fail("sealed holdout cannot contain train/dev rows");
    if (!validProjectedText(row.prompt, 2400, true)) fail(`sealed holdout cases[${index}].prompt is invalid`);
    if (!validProjectedText(row.target, 160, false)) fail(`sealed holdout cases[${index}].target is invalid`);
    if (!hash16Pattern.test(row.caseHash) || row.caseHash !== canonicalHash(casePayload(row))) {
      fail(`sealed holdout cases[${index}].caseHash differs`);
    }
    if (ids.has(row.id) || hashes.has(row.caseHash) || prompts.has(row.prompt)) {
      fail("sealed holdout contains duplicate rows");
    }
    ids.add(row.id);
    hashes.add(row.caseHash);
    prompts.add(row.prompt);
  }
  const payload = { schemaVersion: value.schemaVersion, cases: value.cases };
  if (!hash16Pattern.test(value.corpusHash) || value.corpusHash !== canonicalHash(payload)) {
    fail("sealed holdout corpusHash differs");
  }
  const expected = projectProductionHoldout(productionCorpus);
  if (canonicalStringify(value) !== canonicalStringify(expected)) {
    fail("sealed holdout differs from the committed production projection");
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
    left.rankHash.localeCompare(right.rankHash)
    || left.row.id.localeCompare(right.row.id));
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
    && value.path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    && Number.isSafeInteger(value.byteLength)
    && value.byteLength >= 0
    && sha256Pattern.test(value.sha256);
}

export function modelTreeHash(files) {
  return sha256Text(canonicalStringify(files));
}

function evidencePayload(evidence) {
  const { contentHash: _contentHash, ...payload } = evidence;
  return payload;
}

function rowPayload(row) {
  const { rowHash: _rowHash, ...payload } = row;
  return payload;
}

function numericClaims(value) {
  const counts = new Map();
  for (const claim of value.match(numericClaimPattern) ?? []) {
    counts.set(claim, (counts.get(claim) ?? 0) + 1);
  }
  return counts;
}

function words(value) {
  return [...value.matchAll(wordPattern)].map((match) => ({
    raw: match[0],
    lower: match[0].toLocaleLowerCase("en-US"),
  }));
}

function sourceText(facts) {
  return `${facts.location} ${facts.headline} ${facts.action} ${facts.consequence}`;
}

function hasUnknownWord(output, facts) {
  const source = new Set(words(sourceText(facts)).map((token) => token.lower));
  return words(output).some((token) =>
    !source.has(token.lower)
    && !neutralWords.has(token.lower)
    && !/^\p{N}+$/u.test(token.lower));
}

function hasUnknownCapitalizedWord(output, facts) {
  const source = new Set(words(sourceText(facts)).map((token) => token.lower));
  return words(output).some((token, index) => {
    const firstLetter = [...token.raw].find((scalar) => /\p{L}/u.test(scalar));
    const capitalized = firstLetter !== undefined
      && firstLetter === firstLetter.toLocaleUpperCase("en-US")
      && firstLetter !== firstLetter.toLocaleLowerCase("en-US");
    return capitalized
      && !source.has(token.lower)
      && !(index === 0 && neutralWords.has(token.lower));
  });
}

function hasUnknownNumericClaim(output, facts) {
  const available = numericClaims(sourceText(facts));
  const used = numericClaims(output);
  return [...used].some(([claim, count]) => count > (available.get(claim) ?? 0));
}

function isPromptEcho(output) {
  return /\b(?:PLACE|HEADLINE|ACTION|CONSEQUENCE|BEAT)\s*:/iu.test(output)
    || /write one sentence of at most/iu.test(output)
    || /do not add dialogue/iu.test(output);
}

function delexicalizedShape(output, facts) {
  const location = new Set(words(facts.location).map((token) => token.lower));
  const headline = new Set(words(facts.headline).map((token) => token.lower));
  const action = new Set(words(facts.action).map((token) => token.lower));
  const consequence = new Set(words(facts.consequence).map((token) => token.lower));
  return output.toLocaleLowerCase("en-US").replace(wordPattern, (token) => {
    const lower = token.toLocaleLowerCase("en-US");
    if (/^\p{N}+$/u.test(lower)) return "<number>";
    if (location.has(lower) && !neutralWords.has(lower)) return "<place>";
    if (action.has(lower) && !neutralWords.has(lower)) return "<action>";
    if (headline.has(lower) && !neutralWords.has(lower)) return "<headline>";
    if (consequence.has(lower) && !neutralWords.has(lower)) return "<consequence>";
    if (neutralWords.has(lower)) return lower;
    return "<unknown>";
  }).replace(/(?:<place>[\s\-]*){2,}/gu, "<place> ")
    .replace(/(?:<action>[\s\-]*){2,}/gu, "<action> ")
    .replace(/(?:<headline>[\s\-]*){2,}/gu, "<headline> ")
    .replace(/(?:<consequence>[\s\-]*){2,}/gu, "<consequence> ")
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
  if (typeof value.path !== "string" || !isAbsolute(value.path)) fail("evaluation model path is invalid");
  if (!sha256Pattern.test(value.treeSha256)) fail("evaluation model tree hash is invalid");
  if (
    !Array.isArray(value.files)
    || value.files.length === 0
    || !value.files.every(validFileEntry)
  ) fail("evaluation model files are invalid");
  const sorted = [...value.files].sort((left, right) => compareText(left.path, right.path));
  if (canonicalStringify(sorted) !== canonicalStringify(value.files)) {
    fail("evaluation model files must be sorted");
  }
  if (new Set(value.files.map((entry) => entry.path)).size !== value.files.length) {
    fail("evaluation model files contain duplicates");
  }
  if (value.treeSha256 !== modelTreeHash(value.files)) fail("evaluation model tree hash differs");
  if (
    value.path !== expectedModel.path
    || canonicalStringify(value.files) !== canonicalStringify(expectedModel.files)
    || value.treeSha256 !== expectedModel.treeSha256
  ) fail("evaluation model closure differs from the supplied checkpoint");
}

function validateHoldoutBinding(value, expectedHoldout) {
  if (!hasExactKeys(value, holdoutKeys)) fail("evaluation holdout keys differ");
  if (
    typeof value.path !== "string"
    || !isAbsolute(value.path)
    || typeof value.corpusHash !== "string"
    || !hash16Pattern.test(value.corpusHash)
    || typeof value.fileSha256 !== "string"
    || !sha256Pattern.test(value.fileSha256)
    ||
    value.path !== expectedHoldout.path
    || value.schemaVersion !== evaluationSchemaVersion
    || value.corpusHash !== expectedHoldout.corpusHash
    || value.fileSha256 !== expectedHoldout.fileSha256
    || value.caseCount !== requiredHoldoutCases
  ) fail("evaluation holdout closure differs");
}

export function validateHeldoutEvaluation({
  results,
  resultsFileSha256,
  holdout,
  holdoutPath,
  holdoutFileSha256,
  productionCorpus,
  validateStoryBeatResult,
  deterministicFallback,
  model,
}) {
  if (typeof resultsFileSha256 !== "string" || !sha256Pattern.test(resultsFileSha256)) {
    fail("results file SHA-256 is invalid");
  }
  if (
    typeof holdoutPath !== "string"
    || !isAbsolute(holdoutPath)
    || typeof holdoutFileSha256 !== "string"
    || !sha256Pattern.test(holdoutFileSha256)
  ) fail("sealed holdout file binding is invalid");
  validateSealedHoldout(holdout, productionCorpus);
  if (!hasExactKeys(results, evidenceKeys)) fail("evaluation evidence keys differ");
  if (results.schemaVersion !== evaluationSchemaVersion) fail("evaluation evidence schema differs");
  if (results.kind !== "story-beat-heldout-generation") fail("evaluation evidence kind differs");
  if (results.disposition !== "developer-evidence-not-runtime-admitted") {
    fail("evaluation evidence disposition differs");
  }
  if (results.modelAdmitted !== false || results.displayAuthorized !== false) {
    fail("evaluation evidence cannot admit a model or authorize display");
  }
  if (!hasExactKeys(results.contract, contractKeys)
    || canonicalStringify(results.contract) !== canonicalStringify(generationContract())) {
    fail("evaluation generation contract differs");
  }
  validateModelBinding(results.model, model);
  validateHoldoutBinding(results.holdout, {
    path: holdoutPath,
    corpusHash: holdout.corpusHash,
    fileSha256: holdoutFileSha256,
  });
  if (!hasExactKeys(results.selection, selectionKeys)) fail("evaluation selection keys differ");
  const requestedCount = results.selection.requestedCaseCount;
  validateInteger(requestedCount, 1, requiredHoldoutCases, "evaluation requested case count");
  const expectedSelection = selectHoldoutRows(holdout, requestedCount);
  if (canonicalStringify(results.selection) !== canonicalStringify(expectedSelection.receipt)) {
    fail("evaluation deterministic selection differs");
  }
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
  let totalElapsedMicroseconds = 0;
  let firstPassValidCount = 0;
  let unknownWordOutputCount = 0;
  let unknownCapitalizedWordOutputCount = 0;
  let unknownNumericClaimOutputCount = 0;
  let promptEchoOutputCount = 0;
  let fallbackCopyCount = 0;
  let exactSourceFieldCopyCount = 0;
  let exactFieldOrFallbackCopyCount = 0;
  let referenceTargetCopyCount = 0;

  for (const [index, row] of results.rows.entries()) {
    const label = `evaluation rows[${index}]`;
    if (!hasExactKeys(row, rowKeys)) fail(`${label} keys differ`);
    validateInteger(row.ordinal, index, index, `${label}.ordinal`);
    validateInteger(row.sourceOrdinal, 0, requiredHoldoutCases - 1, `${label}.sourceOrdinal`);
    validateInteger(row.inputTokenCount, 1, maximumInputTokens, `${label}.inputTokenCount`);
    validateInteger(row.generatedTokenCount, 0, maximumNewTokens, `${label}.generatedTokenCount`);
    validateInteger(
      row.elapsedMicroseconds,
      0,
      Number.MAX_SAFE_INTEGER,
      `${label}.elapsedMicroseconds`,
    );
    if (!idPattern.test(row.id)) fail(`${label}.id is invalid`);
    for (const field of ["caseHash", "selectionRankHash", "rowHash"]) {
      if (!hash16Pattern.test(row[field])) fail(`${label}.${field} is invalid`);
    }
    for (const field of ["promptSha256", "referenceTargetSha256", "outputSha256"]) {
      if (!sha256Pattern.test(row[field])) fail(`${label}.${field} is invalid`);
    }
    if (
      typeof row.output !== "string"
      || row.output.length > maximumEvidenceOutputCharacters
      || row.output.normalize("NFC") !== row.output
      || unsafeSurrogate.test(row.output)
    ) fail(`${label}.output is not one bounded NFC string`);
    if (row.outputSha256 !== sha256Text(row.output)) fail(`${label}.outputSha256 differs`);
    if (row.rowHash !== canonicalHash(rowPayload(row))) fail(`${label}.rowHash differs`);
    const expected = expectedSelection.selected[index];
    if (
      row.sourceOrdinal !== expected.sourceOrdinal
      || row.id !== expected.row.id
      || row.caseHash !== expected.row.caseHash
      || row.selectionRankHash !== expected.rankHash
      || row.promptSha256 !== sha256Text(expected.row.prompt)
      || row.referenceTargetSha256 !== sha256Text(expected.row.target)
    ) fail(`${label} differs from the sealed deterministic selection`);
    if (ids.has(row.id) || rowHashes.has(row.rowHash)) fail("evaluation rows contain duplicates");
    ids.add(row.id);
    rowHashes.add(row.rowHash);
    totalElapsedMicroseconds += row.elapsedMicroseconds;
    if (!Number.isSafeInteger(totalElapsedMicroseconds)) fail("evaluation total timing overflowed");

    const production = productionById.get(row.id);
    if (production === undefined) fail(`${label} has no production facts`);
    const valid = validateStoryBeatResult(row.output, production.facts) === row.output;
    if (valid) firstPassValidCount += 1;
    const unknownWord = hasUnknownWord(row.output, production.facts);
    const unknownCapitalized = hasUnknownCapitalizedWord(row.output, production.facts);
    const unknownNumeric = hasUnknownNumericClaim(row.output, production.facts);
    const echo = isPromptEcho(row.output);
    const fallback = row.output === deterministicFallback(production.facts);
    const exactField = [
      production.facts.headline,
      production.facts.action,
      production.facts.consequence,
    ].includes(row.output);
    if (unknownWord) unknownWordOutputCount += 1;
    if (unknownCapitalized) unknownCapitalizedWordOutputCount += 1;
    if (unknownNumeric) unknownNumericClaimOutputCount += 1;
    if (echo) promptEchoOutputCount += 1;
    if (fallback) fallbackCopyCount += 1;
    if (exactField) exactSourceFieldCopyCount += 1;
    if (fallback || exactField) exactFieldOrFallbackCopyCount += 1;
    if (row.output === expected.row.target) referenceTargetCopyCount += 1;
    outputs.add(row.output);
    const shape = delexicalizedShape(row.output, production.facts);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }

  if (!hasExactKeys(results.summary, summaryKeys)) fail("evaluation summary keys differ");
  if (
    results.summary.rowCount !== results.rows.length
    || results.summary.totalElapsedMicroseconds !== totalElapsedMicroseconds
  ) fail("evaluation summary differs from the rows");
  if (!hash16Pattern.test(results.contentHash)
    || results.contentHash !== canonicalHash(evidencePayload(results))) {
    fail("evaluation contentHash differs");
  }

  const metrics = {
    rowCount: results.rows.length,
    firstPassValidCount,
    firstPassInvalidCount: results.rows.length - firstPassValidCount,
    firstPassValidityBasisPoints: Math.floor(firstPassValidCount * 10_000 / results.rows.length),
    unknownWordOutputCount,
    unknownCapitalizedWordOutputCount,
    unknownNumericClaimOutputCount,
    promptEchoOutputCount,
    fallbackCopyCount,
    exactSourceFieldCopyCount,
    exactFieldOrFallbackCopyCount,
    referenceTargetCopyCount,
    uniqueOutputCount: outputs.size,
    delexicalizedShapeCount: shapes.size,
    maximumShapeFrequency: Math.max(...shapes.values()),
  };
  const reportPayload = {
    schemaVersion: evaluationSchemaVersion,
    kind: "story-beat-heldout-validation-report",
    disposition: "developer-evidence-no-admission-or-display-authority",
    integrityAccepted: true,
    fullEvaluation: results.rows.length === requiredHoldoutCases,
    resultsContentHash: results.contentHash,
    resultsFileSha256,
    holdoutCorpusHash: holdout.corpusHash,
    holdoutFileSha256,
    modelTreeSha256: model.treeSha256,
    selection: results.selection,
    metrics,
    modelAdmitted: false,
    displayAuthorized: false,
  };
  return { ...reportPayload, contentHash: canonicalHash(reportPayload) };
}

function safeRawPath(raw, label) {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0") || raw.includes("\\")) {
    fail(`${label} path is unsafe`);
  }
  const parts = raw.split("/");
  if (parts.some((part, index) => ["~", ".."].includes(part) || (part === "." && index !== 0))) {
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
  if (expectedKind === "file" && !stat.isFile()) fail(`${label} must be a regular file`);
  if (expectedKind === "directory" && !stat.isDirectory()) fail(`${label} must be a regular directory`);
  return absolute;
}

async function walkFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = resolve(directory, entry.name);
    const stat = await lstat(path);
    if (entry.isSymbolicLink() || stat.isSymbolicLink()) fail(`model symlink is forbidden: ${path}`);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, path));
    } else if (entry.isFile() && stat.isFile()) {
      const bytes = await readFile(path);
      files.push({
        path: relative(root, path).split(sep).join("/"),
        byteLength: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    } else {
      fail(`model contains a non-regular entry: ${path}`);
    }
  }
  return files;
}

export async function manifestModelDirectory(root) {
  const files = (await walkFiles(root))
    .sort((left, right) => compareText(left.path, right.path));
  const paths = new Set(files.map((entry) => entry.path));
  if (!paths.has("config.json")) fail("model is missing config.json");
  if (!paths.has("tokenizer.json") && !paths.has("spiece.model")) {
    fail("model is missing tokenizer material");
  }
  if ([...paths].some((path) => /\.(?:bin|pt|pth)$/u.test(path))) {
    fail("pickle model weights are forbidden");
  }
  if (![...paths].some((path) => path.endsWith(".safetensors"))) {
    fail("model is missing safetensors weights");
  }
  return files;
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
      "/src/narrator/story-beat-training-corpus.ts",
    );
    const storyBeatModule = await server.ssrLoadModule("/src/narrator/story-beat.ts");
    if (
      typeof corpusModule.isStoryBeatTrainingCorpusV1 !== "function"
      || !corpusModule.isStoryBeatTrainingCorpusV1(corpusModule.storyBeatTrainingCorpusV1)
      || typeof storyBeatModule.validateStoryBeatResultV1 !== "function"
      || typeof storyBeatModule.deterministicStoryBeatFallback !== "function"
    ) fail("production story-beat contracts failed validation");
    return {
      productionCorpus: corpusModule.storyBeatTrainingCorpusV1,
      validateStoryBeatResult: storyBeatModule.validateStoryBeatResultV1,
      deterministicFallback: storyBeatModule.deterministicStoryBeatFallback,
    };
  } finally {
    await server.close();
  }
}

function parseArguments(argv) {
  if (argv.length !== 6) {
    fail("Usage: node validate-evaluation.mjs --holdout <json> --results <json> --model <checkpoint>");
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--holdout", "--results", "--model"].includes(flag) || !value || flag in result) {
      fail("Evaluation validator arguments are invalid");
    }
    result[flag] = value;
  }
  if (!["--holdout", "--results", "--model"].every((flag) => flag in result)) {
    fail("Evaluation validator arguments are incomplete");
  }
  return result;
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "../..");
  const args = parseArguments(process.argv.slice(2));
  const holdoutPath = await strictExistingPath(args["--holdout"], "holdout", "file");
  const resultsPath = await strictExistingPath(args["--results"], "results", "file");
  const modelPath = await strictExistingPath(args["--model"], "model", "directory");
  if (holdoutPath === resultsPath) fail("holdout and results must be separate files");

  const [holdoutBytes, resultsBytes, modelFiles] = await Promise.all([
    readFile(holdoutPath),
    readFile(resultsPath),
    manifestModelDirectory(modelPath),
  ]);
  const holdoutFileSha256 = sha256Bytes(holdoutBytes);
  const resultsFileSha256 = sha256Bytes(resultsBytes);
  const holdout = parseJsonStrict(holdoutBytes, "sealed holdout JSON");
  const results = parseJsonStrict(resultsBytes, "evaluation results JSON");
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
  ) fail("evaluation input or model closure changed during validation");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`story-beat heldout validation refused: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
