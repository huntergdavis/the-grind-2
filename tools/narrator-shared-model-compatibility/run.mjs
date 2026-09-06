#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import {
  assertCommittedSourceSnapshot,
  evidenceForCommit,
} from "../narrator-browser-evaluation/run-support.mjs";
import {
  canonicalStringify,
  compareSharedModelCompatibilityPathSegments,
  compatibilityPathsOverlap,
  parseSharedModelCompatibilityArguments,
  resolveCompatibilityServerRoute,
  sealSharedModelCompatibilityReceipt,
  sha256,
  sharedModelCompatibilityCaseCount,
  sharedModelCompatibilityBaselineAggregateSha256,
  sharedModelCompatibilityCorpusHash,
  sharedModelCompatibilityModelPaths,
  sharedModelCompatibilityProtocolVersion,
  sharedModelCompatibilityReceiptFile,
  sharedModelCompatibilityRuntimeFiles,
  sharedModelCompatibilityTokenizerPaths,
  tokenizerManifestsAreByteIdentical,
  verifySharedModelCompatibilityReceipt,
} from "./run-support.mjs";

const executeFile = promisify(execFile);
const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "../..");
const ignoredRoot = resolve(repositoryRoot, ".narrator-t5-rebuild");
const runtimeArtifacts = Object.freeze(sharedModelCompatibilityRuntimeFiles.map(
  (artifact) => Object.freeze({
    ...artifact,
    file: resolve(repositoryRoot, `node_modules/onnxruntime-web/dist/${artifact.path}`),
  }),
));
const sourcePaths = Object.freeze([
  "package-lock.json",
  "package.json",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/narrator/evaluation.ts",
  "src/narrator/live-form-selection.ts",
  "src/narrator/live-output-policy.ts",
  "src/narrator/live-transformers-adapter.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-shared-model-compatibility/.gitignore",
  "tools/narrator-shared-model-compatibility/README.md",
  "tools/narrator-shared-model-compatibility/index.html",
  "tools/narrator-shared-model-compatibility/run-support.mjs",
  "tools/narrator-shared-model-compatibility/run.mjs",
  "tools/narrator-shared-model-compatibility/src/comparison.test.ts",
  "tools/narrator-shared-model-compatibility/src/comparison.ts",
  "tools/narrator-shared-model-compatibility/src/harness.ts",
  "tools/narrator-shared-model-compatibility/src/protocol.test.ts",
  "tools/narrator-shared-model-compatibility/src/protocol.ts",
  "tools/narrator-shared-model-compatibility/src/state.test.ts",
  "tools/narrator-shared-model-compatibility/src/state.ts",
  "tools/narrator-shared-model-compatibility/src/transformers.worker.ts",
  "tools/narrator-shared-model-compatibility/src/worker-channel.test.ts",
  "tools/narrator-shared-model-compatibility/src/worker-channel.ts",
  "tools/narrator-shared-model-compatibility/tests/run-support.test.mjs",
  "tools/narrator-shared-model-compatibility/tsconfig.json",
  "tools/narrator-shared-model-compatibility/vite.config.ts",
  "tsconfig.json",
]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "Usage: node tools/narrator-shared-model-compatibility/run.mjs compare "
      + "--baseline-model-dir <exact-six-file-dir> "
      + "--candidate-model-dir <exact-six-file-dir> "
      + "--run-id <id> --out <fresh-dir-under-.narrator-t5-rebuild>\n",
  );
  process.exitCode = 2;
}

function within(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

async function regularFile(path, label) {
  const lexical = resolve(path);
  const [entry, actual] = await Promise.all([lstat(lexical), realpath(lexical)]);
  if (!entry.isFile() || entry.isSymbolicLink() || actual !== lexical) {
    throw new Error(`${label} must be a real, regular, non-symlink file`);
  }
  return lexical;
}

async function filesUnder(root, prefix = "") {
  const result = [];
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    compareSharedModelCompatibilityPathSegments(left.name, right.name))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`Input closure contains a symlink: ${path}`);
    }
    if (entry.isDirectory()) result.push(...await filesUnder(root, path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Input closure contains a non-regular entry: ${path}`);
  }
  return result;
}

async function snapshotFiles(root, paths) {
  const files = [];
  const assets = [];
  for (const path of paths) {
    const file = await regularFile(resolve(root, path), path);
    const bytes = await readFile(file);
    files.push(Object.freeze({
      path,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    }));
    assets.push(Object.freeze({ path, bytes }));
  }
  return Object.freeze({
    files: Object.freeze(files),
    assets: Object.freeze(assets),
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
  });
}

async function snapshotModel(requested, label) {
  const lexical = isAbsolute(requested)
    ? resolve(requested)
    : resolve(process.cwd(), requested);
  const [entry, actual] = await Promise.all([lstat(lexical), realpath(lexical)]);
  if (!entry.isDirectory() || entry.isSymbolicLink() || actual !== lexical) {
    throw new Error(`${label} model directory must be a real, non-symlink directory`);
  }
  const paths = await filesUnder(lexical);
  if (canonicalStringify(paths)
    !== canonicalStringify(sharedModelCompatibilityModelPaths)) {
    throw new Error(
      `${label} model directory must contain exactly the staged six-file q8 closure`,
    );
  }
  const snapshot = await snapshotFiles(
    lexical,
    sharedModelCompatibilityModelPaths,
  );
  return Object.freeze({ ...snapshot, root: lexical });
}

async function snapshotRuntime() {
  const files = [];
  const assets = [];
  for (const expected of runtimeArtifacts) {
    const file = await regularFile(expected.file, expected.path);
    const bytes = await readFile(file);
    const observed = {
      path: expected.path,
      role: expected.role,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    };
    if (observed.byteLength !== expected.byteLength
      || observed.sha256 !== expected.sha256) {
      throw new Error(`Pinned browser runtime differs: ${expected.path}`);
    }
    files.push(Object.freeze(observed));
    assets.push(Object.freeze({ path: expected.path, bytes }));
  }
  return Object.freeze({
    files: Object.freeze(files),
    assets: Object.freeze(assets),
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
  });
}

async function snapshotSource() {
  const commit = await assertCommittedSourceSnapshot({
    repositoryRoot,
    sourcePaths,
  });
  const files = await evidenceForCommit({
    repositoryRoot,
    sourcePaths,
    sourceCommit: commit,
  });
  return Object.freeze({
    commit,
    files,
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
  });
}

async function resolveOutputTarget(requested, baselineRoot, candidateRoot) {
  const destination = isAbsolute(requested)
    ? resolve(requested)
    : resolve(process.cwd(), requested);
  const [realIgnored, realParent] = await Promise.all([
    realpath(ignoredRoot),
    realpath(dirname(destination)),
  ]);
  if (realIgnored !== ignoredRoot
    || (!within(realIgnored, realParent) && realParent !== realIgnored)
    || destination !== resolve(realParent, basename(destination))) {
    throw new Error(
      "Compatibility output must be a fresh directory beneath .narrator-t5-rebuild",
    );
  }
  if (compatibilityPathsOverlap(baselineRoot, destination)
    || compatibilityPathsOverlap(candidateRoot, destination)) {
    throw new Error("Compatibility output and model directories must not overlap");
  }
  try {
    await lstat(destination);
    throw new Error("Compatibility output must be a fresh directory");
  } catch (error) {
    if (!(typeof error === "object"
      && error !== null
      && error.code === "ENOENT")) throw error;
  }
  return destination;
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function buildBundle() {
  const directory = await mkdtemp(
    resolve(tmpdir(), "grind2-shared-model-compatibility-"),
  );
  try {
    await executeFile(resolve(repositoryRoot, "node_modules/.bin/vite"), [
      "build",
      "--config", resolve(toolRoot, "vite.config.ts"),
      "--outDir", directory,
    ], { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 });
    const paths = await filesUnder(directory);
    if (paths.length !== 4
      || !paths.includes("index.html")
      || paths.filter((path) =>
        /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
      || paths.filter((path) =>
        /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
      || paths.filter((path) =>
        /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u
          .test(path)).length !== 1) {
      throw new Error(
        "Shared-model compatibility browser bundle does not have the exact four-file layout",
      );
    }
    return await snapshotFiles(directory, paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function startServer(bundle, baseline, candidate, runtime) {
  const staged = new Map();
  baseline.assets.forEach((asset, index) => staged.set(
    `/__shared_model_compatibility_staging__/baseline/${index}`,
    asset,
  ));
  candidate.assets.forEach((asset, index) => staged.set(
    `/__shared_model_compatibility_staging__/candidate/${index}`,
    asset,
  ));
  runtime.assets.forEach((asset, index) => staged.set(
    `/__shared_model_compatibility_staging__/runtime/${index}`,
    asset,
  ));
  const bundled = new Map(bundle.assets.map((asset) => [`/${asset.path}`, asset]));
  const availablePaths = new Set([...staged.keys(), ...bundled.keys()]);
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const requestedPath = resolveCompatibilityServerRoute(
          request.method,
          request.url,
          availablePaths,
        );
        if (requestedPath === null) {
          response.writeHead(404).end();
          return;
        }
        const asset = staged.get(requestedPath) ?? bundled.get(requestedPath);
        if (asset === undefined) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-length": String(asset.bytes.byteLength),
          "content-type": contentType(asset.path),
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
        });
        response.end(asset.bytes);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Compatibility server address is invalid");
  }
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) =>
      server.close((error) => error ? reject(error) : resolvePromise())),
  });
}

function stageArtifact(artifact, url) {
  return Object.freeze({
    path: artifact.path,
    url,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
  });
}

async function runBrowser({ options, bundle, baseline, candidate, runtime }) {
  const server = await startServer(bundle, baseline, candidate, runtime);
  let browser;
  let context;
  let primaryError;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const externalRequests = [];
    const postOfflineRequests = [];
    let offline = false;
    page.on("request", (request) => {
      const url = request.url();
      const protocol = new URL(url).protocol;
      if ((protocol === "http:" || protocol === "https:")
        && !url.startsWith(`${server.origin}/`)) externalRequests.push(url);
      if (offline && (protocol === "http:" || protocol === "https:")) {
        postOfflineRequests.push(url);
      }
    });
    await page.goto(server.origin, { waitUntil: "load" });
    await page.waitForFunction(
      () => globalThis.__theGrindSharedModelCompatibility?.protocolVersion === 1,
    );
    const stage = {
      protocolVersion: sharedModelCompatibilityProtocolVersion,
      runId: options["run-id"],
      baselineModelAggregateSha256: baseline.aggregateSha256,
      candidateModelAggregateSha256: candidate.aggregateSha256,
      baselineModelArtifacts: baseline.files.map((artifact, index) =>
        stageArtifact(
          artifact,
          `${server.origin}/__shared_model_compatibility_staging__/baseline/${index}`,
        )),
      candidateModelArtifacts: candidate.files.map((artifact, index) =>
        stageArtifact(
          artifact,
          `${server.origin}/__shared_model_compatibility_staging__/candidate/${index}`,
        )),
      runtimeArtifacts: runtime.files.map((artifact, index) =>
        stageArtifact(
          artifact,
          `${server.origin}/__shared_model_compatibility_staging__/runtime/${index}`,
        )),
    };
    await page.evaluate(
      (request) => globalThis.__theGrindSharedModelCompatibility.stage(request),
      stage,
    );
    if (externalRequests.length !== 0) {
      throw new Error("Compatibility browser staging attempted an external request");
    }
    offline = true;
    await context.setOffline(true);
    const result = await page.evaluate(
      (milliseconds) => globalThis.__theGrindSharedModelCompatibility.run(milliseconds),
      14_400_000,
    );
    await page.evaluate(
      () => globalThis.__theGrindSharedModelCompatibility.dispose(),
    );
    if (externalRequests.length !== 0 || postOfflineRequests.length !== 0) {
      throw new Error("Compatibility browser inference attempted a network request");
    }
    return Object.freeze({
      browserVersion: browser.version(),
      baseline: result.baseline,
      candidate: result.candidate,
      exactFormParityCount: result.exactFormParityCount,
      network: Object.freeze({
        serviceWorkers: "blocked",
        offlineBeforeModelLoad: true,
        externalRequestCount: externalRequests.length,
        postOfflineRequestCount: postOfflineRequests.length,
      }),
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError;
    try { await context?.close(); } catch (error) { cleanupError = error; }
    try { await browser?.close(); } catch (error) { cleanupError ??= error; }
    try { await server.close(); } catch (error) { cleanupError ??= error; }
    if (primaryError === undefined && cleanupError !== undefined) throw cleanupError;
  }
}

function observation(row) {
  return Object.freeze({
    selectedFormId: row.selectedFormId,
    lineHash: row.lineHash,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    baselineForm: row.baselineForm,
    safe: row.safe,
    eligible: row.eligible,
    fallbackUsed: row.fallbackUsed,
    elapsedMs: row.elapsedMs,
  });
}

function createReceipt({
  options,
  source,
  bundle,
  baseline,
  candidate,
  runtime,
  browserResult,
}) {
  const cases = Object.freeze(browserResult.baseline.cases.map((baselineRow, ordinal) => {
    const candidateRow = browserResult.candidate.cases[ordinal];
    if (candidateRow === undefined
      || candidateRow.ordinal !== baselineRow.ordinal
      || candidateRow.id !== baselineRow.id
      || candidateRow.seedId !== baselineRow.seedId
      || candidateRow.move !== baselineRow.move
      || candidateRow.promptHash !== baselineRow.promptHash) {
      throw new Error("Compatibility model result rows do not align");
    }
    return Object.freeze({
      ordinal,
      id: baselineRow.id,
      seedId: baselineRow.seedId,
      move: baselineRow.move,
      promptHash: baselineRow.promptHash,
      baseline: observation(baselineRow),
      candidate: observation(candidateRow),
      exactFormParity: baselineRow.selectedFormId === candidateRow.selectedFormId
        && baselineRow.lineHash === candidateRow.lineHash,
    });
  }));
  const timingPayload = {
    baselineLoadElapsedMs: browserResult.baseline.loadElapsedMs,
    candidateLoadElapsedMs: browserResult.candidate.loadElapsedMs,
    baselineCaseElapsedMs: cases.map((entry) => entry.baseline.elapsedMs),
    candidateCaseElapsedMs: cases.map((entry) => entry.candidate.elapsedMs),
  };
  const totalElapsedMs = timingPayload.baselineLoadElapsedMs
    + timingPayload.candidateLoadElapsedMs
    + timingPayload.baselineCaseElapsedMs.reduce((sum, elapsed) => sum + elapsed, 0)
    + timingPayload.candidateCaseElapsedMs.reduce((sum, elapsed) => sum + elapsed, 0);
  const timing = {
    ...timingPayload,
    totalElapsedMs,
  };
  const payload = {
    schemaVersion: 1,
    kind: "narrator-shared-model-compatibility",
    disposition: "private-developer-evidence-no-authority",
    runId: options["run-id"],
    corpus: {
      version: 1,
      hash: sharedModelCompatibilityCorpusHash,
      caseCount: sharedModelCompatibilityCaseCount,
    },
    source: {
      commit: source.commit,
      files: source.files,
      aggregateSha256: source.aggregateSha256,
    },
    bundle: {
      files: bundle.files,
      aggregateSha256: bundle.aggregateSha256,
    },
    baselineModel: {
      format: "transformers-js-onnx-q8",
      files: baseline.files,
      aggregateSha256: baseline.aggregateSha256,
    },
    candidateModel: {
      format: "transformers-js-onnx-q8",
      files: candidate.files,
      aggregateSha256: candidate.aggregateSha256,
    },
    tokenizer: {
      paths: sharedModelCompatibilityTokenizerPaths,
      byteIdentical: true,
      baselineWitnessesVerified: browserResult.baseline.tokenizerVerified,
      candidateWitnessesVerified: browserResult.candidate.tokenizerVerified,
    },
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      files: runtime.files,
      aggregateSha256: runtime.aggregateSha256,
    },
    browser: {
      name: "chromium",
      version: browserResult.browserVersion,
      execution: "wasm",
      dtype: "q8",
    },
    network: browserResult.network,
    comparison: {
      caseCount: sharedModelCompatibilityCaseCount,
      baselineCompletedCaseCount: browserResult.baseline.cases.length,
      candidateCompletedCaseCount: browserResult.candidate.cases.length,
      exactFormParityCount: browserResult.exactFormParityCount,
      exactFormParity: browserResult.exactFormParityCount
        === sharedModelCompatibilityCaseCount,
      fallbackSubstitutionCount: cases.filter((entry) =>
        entry.baseline.fallbackUsed || entry.candidate.fallbackUsed).length,
      unsafeLineCount: cases.filter((entry) =>
        !entry.baseline.safe || !entry.candidate.safe).length,
      ineligibleFormCount: cases.filter((entry) =>
        !entry.baseline.eligible || !entry.candidate.eligible).length,
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
  };
  return sealSharedModelCompatibilityReceipt(payload);
}

function sameSnapshot(left, right, label) {
  if ((left.commit !== undefined || right.commit !== undefined)
      && left.commit !== right.commit
    || left.aggregateSha256 !== right.aggregateSha256
    || canonicalStringify(left.files) !== canonicalStringify(right.files)) {
    throw new Error(`${label} changed during the comparison`);
  }
}

async function main(options) {
  const [source, baseline, candidate, runtime] = await Promise.all([
    snapshotSource(),
    snapshotModel(options["baseline-model-dir"], "Baseline"),
    snapshotModel(options["candidate-model-dir"], "Candidate"),
    snapshotRuntime(),
  ]);
  if (compatibilityPathsOverlap(baseline.root, candidate.root)) {
    throw new Error("Baseline and candidate model directories must be distinct");
  }
  if (baseline.aggregateSha256
    !== sharedModelCompatibilityBaselineAggregateSha256) {
    throw new Error("Baseline model does not match the pinned V1 six-file closure");
  }
  if (!tokenizerManifestsAreByteIdentical(baseline.files, candidate.files)) {
    throw new Error("Baseline and candidate tokenizer bytes differ");
  }
  const outputTarget = await resolveOutputTarget(
    options.out,
    baseline.root,
    candidate.root,
  );
  const bundle = await buildBundle();
  const browserResult = await runBrowser({
    options,
    bundle,
    baseline,
    candidate,
    runtime,
  });
  const [sourceAfter, baselineAfter, candidateAfter, runtimeAfter] = await Promise.all([
    snapshotSource(),
    snapshotModel(options["baseline-model-dir"], "Baseline"),
    snapshotModel(options["candidate-model-dir"], "Candidate"),
    snapshotRuntime(),
  ]);
  sameSnapshot(source, sourceAfter, "Source closure");
  sameSnapshot(baseline, baselineAfter, "Baseline model closure");
  sameSnapshot(candidate, candidateAfter, "Candidate model closure");
  sameSnapshot(runtime, runtimeAfter, "Runtime closure");
  if (!tokenizerManifestsAreByteIdentical(
    baselineAfter.files,
    candidateAfter.files,
  )) {
    throw new Error("Tokenizer byte identity changed during the comparison");
  }
  if (browserResult.exactFormParityCount !== sharedModelCompatibilityCaseCount) {
    throw new Error(
      `Candidate selected-form parity was ${browserResult.exactFormParityCount}/${sharedModelCompatibilityCaseCount}`,
    );
  }
  const receipt = createReceipt({
    options,
    source,
    bundle,
    baseline,
    candidate,
    runtime,
    browserResult,
  });
  if (!verifySharedModelCompatibilityReceipt(receipt)) {
    throw new Error("Shared-model compatibility receipt failed final verification");
  }
  await mkdir(outputTarget, { recursive: false, mode: 0o700 });
  const outputPath = resolve(outputTarget, sharedModelCompatibilityReceiptFile);
  await writeFile(
    outputPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify({
    kind: receipt.kind,
    runId: receipt.runId,
    sourceCommit: receipt.source.commit,
    baselineModelAggregateSha256: receipt.baselineModel.aggregateSha256,
    candidateModelAggregateSha256: receipt.candidateModel.aggregateSha256,
    caseCount: receipt.comparison.caseCount,
    exactFormParityCount: receipt.comparison.exactFormParityCount,
    contentHash: receipt.contentHash,
    outputPath,
    modelAdmitted: false,
    displayAuthorized: false,
    productionAuthority: false,
  })}\n`);
}

const options = parseSharedModelCompatibilityArguments(process.argv.slice(2));
if (options === null) {
  usage("Invalid shared-model compatibility arguments.");
} else {
  main(options).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
