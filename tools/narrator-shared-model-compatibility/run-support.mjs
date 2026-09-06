import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

export const sharedModelCompatibilityProtocolVersion = 1;
export const sharedModelCompatibilityReceiptFile = "shared-model-compatibility.json";
export const sharedModelCompatibilityCaseCount = 200;
export const sharedModelCompatibilityCorpusHash = "63b3a0ee9fef092a";
export const sharedModelCompatibilityBaselineRevision =
  "edf60fc44500b19407f6216e1777c3e34224b937";
export const sharedModelCompatibilityBaselineAggregateSha256 =
  "4aeb36097c54d457e2f4b83acdf3c893528265c7c7a2b7605ce9e52537b1f7e0";
export const sharedModelCompatibilityModelPaths = Object.freeze([
  "config.json",
  "generation_config.json",
  "onnx/decoder_model_merged_quantized.onnx",
  "onnx/encoder_model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
]);
export const sharedModelCompatibilityTokenizerPaths = Object.freeze([
  "tokenizer.json",
  "tokenizer_config.json",
]);
export const sharedModelCompatibilityRuntimeFiles = Object.freeze([
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

export function compareSharedModelCompatibilityPathSegments(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    throw new TypeError("Shared-model compatibility path segments must be strings");
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

const formIdsByMove = Object.freeze({
  "establish-setting": Object.freeze([
    "establish-holds", "establish-gathers", "establish-waits",
  ]),
  "shade-atmosphere": Object.freeze([
    "shade-holds-baseline", "shade-rests", "shade-settles", "shade-lingers",
  ]),
  "register-pressure": Object.freeze([
    "pressure-attention", "pressure-feel", "pressure-close",
  ]),
});
const baselineFormIds = new Set([
  "establish-holds",
  "shade-holds-baseline",
  "pressure-attention",
]);

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
    return `{${keys.map((key) =>
      `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
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

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isHash16(value) {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function safeInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validFileEntry(value, role = false) {
  return hasExactKeys(value, role
    ? ["byteLength", "path", "role", "sha256"]
    : ["byteLength", "path", "sha256"])
    && boundedText(value.path, 300)
    && safeInteger(value.byteLength, 1)
    && isSha256(value.sha256)
    && (!role || boundedText(value.role, 80));
}

function validManifest(value, role = false) {
  if (!Array.isArray(value)
    || value.length === 0
    || !value.every((entry) => validFileEntry(entry, role))) return false;
  return new Set(value.map((entry) => entry.path)).size === value.length;
}

function validModel(value) {
  return hasExactKeys(value, ["aggregateSha256", "files", "format"])
    && value.format === "transformers-js-onnx-q8"
    && Array.isArray(value.files)
    && canonicalStringify(value.files.map((entry) => entry.path))
      === canonicalStringify(sharedModelCompatibilityModelPaths)
    && validManifest(value.files)
    && isSha256(value.aggregateSha256)
    && value.aggregateSha256
      === sha256(Buffer.from(canonicalStringify(value.files)));
}

export function tokenizerManifestsAreByteIdentical(baselineFiles, candidateFiles) {
  if (!Array.isArray(baselineFiles)
    || !Array.isArray(candidateFiles)
    || canonicalStringify(baselineFiles.map((entry) => entry?.path))
      !== canonicalStringify(sharedModelCompatibilityModelPaths)
    || canonicalStringify(candidateFiles.map((entry) => entry?.path))
      !== canonicalStringify(sharedModelCompatibilityModelPaths)) return false;
  return sharedModelCompatibilityTokenizerPaths.every((path) => {
    const baseline = baselineFiles.find((entry) => entry.path === path);
    const candidate = candidateFiles.find((entry) => entry.path === path);
    return validFileEntry(baseline)
      && validFileEntry(candidate)
      && baseline.byteLength === candidate.byteLength
      && baseline.sha256 === candidate.sha256;
  });
}

export function compatibilityPathsOverlap(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    fail("Compatibility overlap paths are invalid");
  }
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}${sep}`)
    || normalizedRight.startsWith(`${normalizedLeft}${sep}`);
}

export function resolveCompatibilityServerRoute(method, rawUrl, availablePaths) {
  if (method !== "GET"
    || typeof rawUrl !== "string"
    || rawUrl.includes("%")
    || !(availablePaths instanceof Set)) return null;
  try {
    const url = new URL(rawUrl, "http://127.0.0.1");
    if (url.origin !== "http://127.0.0.1"
      || url.search !== ""
      || url.hash !== "") return null;
    const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    return availablePaths.has(path) ? path : null;
  } catch {
    return null;
  }
}

export function parseSharedModelCompatibilityArguments(argv) {
  if (!Array.isArray(argv) || argv[0] !== "compare") return null;
  const options = { mode: "compare" };
  const allowed = new Set([
    "baseline-model-dir", "candidate-model-dir", "run-id", "out",
  ]);
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
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
  if (!options["baseline-model-dir"]
    || !options["candidate-model-dir"]
    || !options["run-id"]
    || !options.out
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(options["run-id"])) return null;
  return Object.freeze(options);
}

function expectedMove(ordinal) {
  const seed = Math.floor(ordinal / 10);
  const slot = ordinal % 10;
  const scenario = slot === 9 ? seed % 9 : slot;
  if (scenario <= 4) return "establish-setting";
  if (scenario <= 6) return "shade-atmosphere";
  return "register-pressure";
}

function validObservation(value, move) {
  return hasExactKeys(value, [
    "baselineForm", "elapsedMs", "eligible", "fallbackUsed", "inputTokens",
    "lineHash", "outputTokens", "safe", "selectedFormId",
  ])
    && formIdsByMove[move].includes(value.selectedFormId)
    && isHash16(value.lineHash)
    && safeInteger(value.inputTokens, 1, 320)
    && safeInteger(value.outputTokens, 1, 48)
    && value.baselineForm === baselineFormIds.has(value.selectedFormId)
    && value.safe === true
    && value.eligible === true
    && value.fallbackUsed === false
    && safeInteger(value.elapsedMs);
}

function validCase(value, ordinal) {
  const seed = Math.floor(ordinal / 10);
  const slot = ordinal % 10;
  const move = expectedMove(ordinal);
  if (!hasExactKeys(value, [
    "baseline", "candidate", "exactFormParity", "id", "move", "ordinal",
    "promptHash", "seedId",
  ])
    || value.ordinal !== ordinal
    || value.id !== `narrator-eval-v1:${String(seed).padStart(2, "0")}:${String(slot).padStart(2, "0")}`
    || value.seedId !== `narrator-eval-seed:${String(seed).padStart(2, "0")}`
    || value.move !== move
    || !isHash16(value.promptHash)
    || !validObservation(value.baseline, move)
    || !validObservation(value.candidate, move)
    || value.exactFormParity !== true) return false;
  return value.baseline.selectedFormId === value.candidate.selectedFormId
    && value.baseline.lineHash === value.candidate.lineHash
    && value.baseline.inputTokens === value.candidate.inputTokens
    && value.baseline.outputTokens === value.candidate.outputTokens
    && value.baseline.baselineForm === value.candidate.baselineForm;
}

function validSource(value) {
  return hasExactKeys(value, ["aggregateSha256", "commit", "files"])
    && /^[0-9a-f]{40}$/u.test(value.commit)
    && validManifest(value.files)
    && value.aggregateSha256 === sha256(Buffer.from(canonicalStringify(value.files)));
}

function validBundle(value) {
  return hasExactKeys(value, ["aggregateSha256", "files"])
    && validManifest(value.files)
    && value.files.length === 4
    && value.files.some((entry) => entry.path === "index.html")
    && value.files.filter((entry) =>
      /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(entry.path)).length === 1
    && value.files.filter((entry) =>
      /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(entry.path)).length === 1
    && value.files.filter((entry) =>
      /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u
        .test(entry.path)).length === 1
    && value.aggregateSha256 === sha256(Buffer.from(canonicalStringify(value.files)));
}

function validTiming(value, cases) {
  if (!hasExactKeys(value, [
    "baselineCaseElapsedMs", "baselineLoadElapsedMs", "candidateCaseElapsedMs",
    "candidateLoadElapsedMs", "timingHash", "totalElapsedMs",
  ])
    || !safeInteger(value.baselineLoadElapsedMs)
    || !safeInteger(value.candidateLoadElapsedMs)
    || !Array.isArray(value.baselineCaseElapsedMs)
    || !Array.isArray(value.candidateCaseElapsedMs)
    || value.baselineCaseElapsedMs.length !== sharedModelCompatibilityCaseCount
    || value.candidateCaseElapsedMs.length !== sharedModelCompatibilityCaseCount
    || !value.baselineCaseElapsedMs.every((entry) => safeInteger(entry))
    || !value.candidateCaseElapsedMs.every((entry) => safeInteger(entry))) return false;
  if (canonicalStringify(value.baselineCaseElapsedMs)
      !== canonicalStringify(cases.map((entry) => entry.baseline.elapsedMs))
    || canonicalStringify(value.candidateCaseElapsedMs)
      !== canonicalStringify(cases.map((entry) => entry.candidate.elapsedMs))) return false;
  const totalElapsedMs = value.baselineLoadElapsedMs
    + value.candidateLoadElapsedMs
    + value.baselineCaseElapsedMs.reduce((sum, entry) => sum + entry, 0)
    + value.candidateCaseElapsedMs.reduce((sum, entry) => sum + entry, 0);
  if (!Number.isSafeInteger(totalElapsedMs) || value.totalElapsedMs !== totalElapsedMs) {
    return false;
  }
  return value.timingHash === sha256(Buffer.from(canonicalStringify({
    baselineLoadElapsedMs: value.baselineLoadElapsedMs,
    candidateLoadElapsedMs: value.candidateLoadElapsedMs,
    baselineCaseElapsedMs: value.baselineCaseElapsedMs,
    candidateCaseElapsedMs: value.candidateCaseElapsedMs,
    totalElapsedMs,
  })));
}

export function sealSharedModelCompatibilityReceipt(payload) {
  if (!isRecord(payload) || Object.hasOwn(payload, "contentHash")) {
    fail("Compatibility receipt payload is invalid");
  }
  return Object.freeze({ ...payload, contentHash: canonicalHash(payload) });
}

export function verifySharedModelCompatibilityReceipt(value) {
  try {
    if (!hasExactKeys(value, [
      "baselineModel", "browser", "bundle", "candidateModel", "cases",
      "comparison", "contentHash", "corpus", "displayAuthorized", "disposition",
      "kind", "modelAdmitted", "network", "outputHash", "productionAuthority",
      "runId", "runtime", "schemaVersion", "source", "timing", "tokenizer",
    ])
      || value.schemaVersion !== 1
      || value.kind !== "narrator-shared-model-compatibility"
      || value.disposition !== "private-developer-evidence-no-authority"
      || value.modelAdmitted !== false
      || value.displayAuthorized !== false
      || value.productionAuthority !== false
      || !boundedText(value.runId, 160)
      || !isHash16(value.contentHash)
      || !isSha256(value.outputHash)
      || !hasExactKeys(value.corpus, ["caseCount", "hash", "version"])
      || value.corpus.version !== 1
      || value.corpus.hash !== sharedModelCompatibilityCorpusHash
      || value.corpus.caseCount !== sharedModelCompatibilityCaseCount
      || !validSource(value.source)
      || !validBundle(value.bundle)
      || !validModel(value.baselineModel)
      || !validModel(value.candidateModel)
      || value.baselineModel.aggregateSha256
        !== sharedModelCompatibilityBaselineAggregateSha256
      || !tokenizerManifestsAreByteIdentical(
        value.baselineModel.files,
        value.candidateModel.files,
      )
      || !hasExactKeys(value.tokenizer, [
        "baselineWitnessesVerified", "byteIdentical", "candidateWitnessesVerified",
        "paths",
      ])
      || canonicalStringify(value.tokenizer.paths)
        !== canonicalStringify(sharedModelCompatibilityTokenizerPaths)
      || value.tokenizer.byteIdentical !== true
      || value.tokenizer.baselineWitnessesVerified !== true
      || value.tokenizer.candidateWitnessesVerified !== true
      || !hasExactKeys(value.runtime, [
        "aggregateSha256", "files", "transformersPackage", "transformersVersion",
      ])
      || value.runtime.transformersPackage !== "@huggingface/transformers"
      || value.runtime.transformersVersion !== "4.2.0"
      || canonicalStringify(value.runtime.files)
        !== canonicalStringify(sharedModelCompatibilityRuntimeFiles)
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
      || !hasExactKeys(value.comparison, [
        "baselineCompletedCaseCount", "candidateCompletedCaseCount", "caseCount",
        "errorCount", "exactFormParity", "exactFormParityCount",
        "fallbackSubstitutionCount", "ineligibleFormCount", "timeoutCount",
        "unsafeLineCount",
      ])
      || value.comparison.caseCount !== sharedModelCompatibilityCaseCount
      || value.comparison.baselineCompletedCaseCount !== sharedModelCompatibilityCaseCount
      || value.comparison.candidateCompletedCaseCount !== sharedModelCompatibilityCaseCount
      || value.comparison.exactFormParity !== true
      || value.comparison.exactFormParityCount !== sharedModelCompatibilityCaseCount
      || value.comparison.errorCount !== 0
      || value.comparison.timeoutCount !== 0
      || value.comparison.fallbackSubstitutionCount !== 0
      || value.comparison.unsafeLineCount !== 0
      || value.comparison.ineligibleFormCount !== 0
      || !Array.isArray(value.cases)
      || value.cases.length !== sharedModelCompatibilityCaseCount
      || !value.cases.every(validCase)
      || value.outputHash
        !== sha256(Buffer.from(canonicalStringify(value.cases)))
      || !validTiming(value.timing, value.cases)) return false;
    const payload = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    );
    return value.contentHash === canonicalHash(payload);
  } catch {
    return false;
  }
}
