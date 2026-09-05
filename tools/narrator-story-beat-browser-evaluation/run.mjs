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
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import {
  assertCommittedSourceSnapshot,
  evidenceForCommit,
} from "../narrator-browser-evaluation/run-support.mjs";
import {
  canonicalHash,
  canonicalStringify,
  diagnoseStoryBeatCandidate,
  parseSealedStoryBeatHoldout,
  parseStoryBeatBrowserEvaluationArguments,
  selectStoryBeatHoldoutCases,
  sha256,
  storyBeatBrowserEvaluationModelPaths,
  storyBeatBrowserEvaluationProtocolVersion,
  storyBeatBrowserEvaluationReceiptFile,
  storyBeatBrowserEvaluationRuntimeFiles,
  storyBeatBrowserEvaluationExpectedHoldoutSha256,
  storyBeatEvaluationPathsOverlap,
  resolveStoryBeatEvaluationServerRoute,
  sealStoryBeatBrowserEvaluationReceipt,
  summarizeStoryBeatResults,
  verifyStoryBeatBrowserEvaluationReceipt,
} from "./run-support.mjs";

const executeFile = promisify(execFile);
const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "../..");
const ignoredRoot = resolve(repositoryRoot, ".narrator-t5-rebuild");
const runtimeArtifacts = Object.freeze(storyBeatBrowserEvaluationRuntimeFiles.map((artifact) =>
  Object.freeze({
    ...artifact,
    file: resolve(repositoryRoot, `node_modules/onnxruntime-web/dist/${artifact.path}`),
  })));
// Keep source evidence retrievable and scoped to the evaluator plus its production dependencies.
const sourcePaths = Object.freeze([
  "package-lock.json",
  "package.json",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/narrator/live-form-selection.ts",
  "src/narrator/live-output-policy.ts",
  "src/narrator/live-transformers-adapter.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/story-beat-transformers-adapter.ts",
  "src/narrator/story-beat-training-corpus.ts",
  "src/narrator/story-beat.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-browser-evaluation/README.md",
  "tools/narrator-story-beat-browser-evaluation/index.html",
  "tools/narrator-story-beat-browser-evaluation/run-support.mjs",
  "tools/narrator-story-beat-browser-evaluation/run.mjs",
  "tools/narrator-story-beat-browser-evaluation/src/harness.ts",
  "tools/narrator-story-beat-browser-evaluation/src/protocol.test.ts",
  "tools/narrator-story-beat-browser-evaluation/src/protocol.ts",
  "tools/narrator-story-beat-browser-evaluation/src/selection-coverage.test.ts",
  "tools/narrator-story-beat-browser-evaluation/src/transformers.worker.ts",
  "tools/narrator-story-beat-browser-evaluation/src/worker-channel.test.ts",
  "tools/narrator-story-beat-browser-evaluation/src/worker-channel.ts",
  "tools/narrator-story-beat-browser-evaluation/tests/provenance.test.mjs",
  "tools/narrator-story-beat-browser-evaluation/tests/run-support.test.mjs",
  "tools/narrator-story-beat-browser-evaluation/tsconfig.json",
  "tools/narrator-story-beat-browser-evaluation/vite.config.ts",
  "tsconfig.json",
]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "Usage: node tools/narrator-story-beat-browser-evaluation/run.mjs evaluate "
      + "--model-dir <exact-six-file-dir> --holdout <sealed-holdout.json> "
      + "--run-id <id> --out <fresh-dir-under-.narrator-t5-rebuild> [--full]\n",
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
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Input closure contains a symlink: ${path}`);
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
    files.push(Object.freeze({ path, byteLength: bytes.byteLength, sha256: sha256(bytes) }));
    assets.push(Object.freeze({ path, bytes }));
  }
  return Object.freeze({
    files: Object.freeze(files),
    assets: Object.freeze(assets),
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
  });
}

async function snapshotModel(requested) {
  const lexical = isAbsolute(requested) ? resolve(requested) : resolve(process.cwd(), requested);
  const [entry, actual] = await Promise.all([lstat(lexical), realpath(lexical)]);
  if (!entry.isDirectory() || entry.isSymbolicLink() || actual !== lexical) {
    throw new Error("Model directory must be a real, non-symlink directory");
  }
  const paths = await filesUnder(lexical);
  if (canonicalStringify(paths) !== canonicalStringify(storyBeatBrowserEvaluationModelPaths)) {
    throw new Error("Model directory must contain exactly the staged six-file q8 closure");
  }
  const snapshot = await snapshotFiles(lexical, storyBeatBrowserEvaluationModelPaths);
  return Object.freeze({ ...snapshot, root: lexical });
}

async function snapshotRuntime() {
  const files = [];
  const assets = [];
  for (const expected of runtimeArtifacts) {
    const file = await regularFile(expected.file, expected.path);
    const bytes = await readFile(file);
    const observed = { path: expected.path, role: expected.role, byteLength: bytes.byteLength, sha256: sha256(bytes) };
    if (observed.byteLength !== expected.byteLength || observed.sha256 !== expected.sha256) {
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
  const commit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  const files = await evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit: commit });
  return Object.freeze({
    commit,
    files,
    aggregateSha256: sha256(Buffer.from(canonicalStringify(files))),
  });
}

async function snapshotHoldout(requested, full) {
  const lexical = isAbsolute(requested) ? resolve(requested) : resolve(process.cwd(), requested);
  const file = await regularFile(lexical, "Sealed holdout");
  const bytes = await readFile(file);
  const observedSha256 = sha256(bytes);
  if (observedSha256 !== storyBeatBrowserEvaluationExpectedHoldoutSha256) {
    throw new Error("Sealed holdout SHA-256 does not match committed export evidence");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const envelope = parseSealedStoryBeatHoldout(text);
  const selected = selectStoryBeatHoldoutCases(envelope.cases, full);
  const indexes = Object.freeze(selected.map((row) => envelope.cases.indexOf(row)));
  return Object.freeze({
    path: "sealed-holdout.json",
    file,
    bytes,
    byteLength: bytes.byteLength,
    sha256: observedSha256,
    corpusHash: envelope.corpusHash,
    totalCaseCount: envelope.cases.length,
    selected,
    indexes,
  });
}

async function resolveOutputTarget(requested, modelDirectory) {
  const destination = isAbsolute(requested) ? resolve(requested) : resolve(process.cwd(), requested);
  const [realIgnored, realParent] = await Promise.all([realpath(ignoredRoot), realpath(dirname(destination))]);
  if (realIgnored !== ignoredRoot
    || (!within(realIgnored, realParent) && realParent !== realIgnored)
    || destination !== resolve(realParent, basename(destination))) {
    throw new Error("Evaluation output must be a fresh directory beneath .narrator-t5-rebuild");
  }
  if (storyBeatEvaluationPathsOverlap(modelDirectory, destination)) {
    throw new Error("Evaluation output and model directory must not overlap");
  }
  try {
    await lstat(destination);
    throw new Error("Evaluation output must be a fresh directory");
  } catch (error) {
    if (!(typeof error === "object" && error !== null && error.code === "ENOENT")) throw error;
  }
  return destination;
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function buildBundle() {
  const directory = await mkdtemp(resolve(tmpdir(), "grind2-story-beat-browser-evaluation-"));
  try {
    await executeFile(resolve(repositoryRoot, "node_modules/.bin/vite"), [
      "build",
      "--config", resolve(toolRoot, "vite.config.ts"),
      "--outDir", directory,
    ], { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 });
    const paths = await filesUnder(directory);
    if (paths.length !== 4
      || !paths.includes("index.html")
      || paths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
      || paths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
      || paths.filter((path) => /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length !== 1) {
      throw new Error("Story-beat browser bundle does not have the exact four-file layout");
    }
    return await snapshotFiles(directory, paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function startServer(bundle, model, runtime, holdout) {
  const staged = new Map();
  model.assets.forEach((asset, index) => staged.set(`/__story_beat_evaluation_staging__/model/${index}`, asset));
  runtime.assets.forEach((asset, index) => staged.set(`/__story_beat_evaluation_staging__/runtime/${index}`, asset));
  staged.set("/__story_beat_evaluation_staging__/holdout/0", {
    path: "sealed-holdout.json",
    bytes: holdout.bytes,
  });
  const bundled = new Map(bundle.assets.map((asset) => [`/${asset.path}`, asset]));
  const availablePaths = new Set([...staged.keys(), ...bundled.keys()]);
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const requestedPath = resolveStoryBeatEvaluationServerRoute(
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
  if (typeof address !== "object" || address === null) throw new Error("Evaluation server address is invalid");
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

async function runBrowser({ options, bundle, model, runtime, holdout }) {
  const server = await startServer(bundle, model, runtime, holdout);
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
      if ((protocol === "http:" || protocol === "https:") && !url.startsWith(`${server.origin}/`)) {
        externalRequests.push(url);
      }
      if (offline && (protocol === "http:" || protocol === "https:")) postOfflineRequests.push(url);
    });
    await page.goto(server.origin, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__theGrindStoryBeatBrowserEvaluation?.protocolVersion === 1);
    const stage = {
      protocolVersion: storyBeatBrowserEvaluationProtocolVersion,
      runId: options["run-id"],
      modelAggregateSha256: model.aggregateSha256,
      holdout: stageArtifact(holdout, `${server.origin}/__story_beat_evaluation_staging__/holdout/0`),
      modelArtifacts: model.files.map((artifact, index) =>
        stageArtifact(artifact, `${server.origin}/__story_beat_evaluation_staging__/model/${index}`)),
      runtimeArtifacts: runtime.files.map((artifact, index) =>
        stageArtifact(artifact, `${server.origin}/__story_beat_evaluation_staging__/runtime/${index}`)),
      selectedIndexes: holdout.indexes,
    };
    await page.evaluate((request) => globalThis.__theGrindStoryBeatBrowserEvaluation.stage(request), stage);
    if (externalRequests.length !== 0) throw new Error("Browser staging attempted an external request");
    offline = true;
    await context.setOffline(true);
    const timeoutMs = options.full ? 14_400_000 : 2_700_000;
    const result = await page.evaluate(
      (milliseconds) => globalThis.__theGrindStoryBeatBrowserEvaluation.run(milliseconds),
      timeoutMs,
    );
    await page.evaluate(() => globalThis.__theGrindStoryBeatBrowserEvaluation.dispose());
    if (externalRequests.length !== 0 || postOfflineRequests.length !== 0) {
      throw new Error("Browser inference attempted a network request");
    }
    return Object.freeze({
      browserVersion: browser.version(),
      loadElapsedMs: result.loadElapsedMs,
      tokenizerVerified: result.tokenizerVerified,
      results: Object.freeze(result.results),
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

function createReceipt({ options, source, bundle, model, runtime, holdout, browserResult }) {
  const metrics = summarizeStoryBeatResults(holdout.selected, browserResult.results);
  const cases = Object.freeze(browserResult.results.map((result, index) => {
    const row = holdout.selected[index];
    const diagnostic = diagnoseStoryBeatCandidate(row, result.candidate);
    return Object.freeze({
      ...result,
      promptHash: canonicalHash(row.prompt),
      targetHash: canonicalHash(row.target),
      candidateHash: canonicalHash(result.candidate),
      deterministicFallbackHash: canonicalHash(diagnostic.deterministicFallback),
      unknownLexemes: diagnostic.unknownLexemes,
      promptScaffoldEcho: diagnostic.promptScaffoldEcho,
      sourceFieldExactEcho: diagnostic.sourceFieldExactEcho,
      targetExactMatch: diagnostic.targetExactMatch,
    });
  }));
  const timingPayload = {
    loadElapsedMs: browserResult.loadElapsedMs,
    caseElapsedMs: cases.map((value) => value.elapsedMs),
  };
  const payload = {
    schemaVersion: 1,
    kind: "story-beat-browser-evaluation",
    experiment: "manual-ephemeral-noncanonical",
    runId: options["run-id"],
    modelAdmitted: false,
    displayAuthorized: false,
    selection: {
      policy: options.full ? "full-sealed-holdout" : "reviewed-balanced-18-v1",
      caseCount: holdout.selected.length,
      indexes: holdout.indexes,
      caseSetHash: sha256(Buffer.from(canonicalStringify(holdout.selected.map((row) => ({ id: row.id, caseHash: row.caseHash }))))),
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
    model: {
      format: "transformers-js-onnx-q8",
      files: model.files,
      aggregateSha256: model.aggregateSha256,
    },
    holdout: {
      path: "sealed-holdout.json",
      byteLength: holdout.byteLength,
      sha256: holdout.sha256,
      corpusHash: holdout.corpusHash,
      totalCaseCount: holdout.totalCaseCount,
    },
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      pinnedTokenizerVerified: browserResult.tokenizerVerified,
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
    timing: {
      ...timingPayload,
      totalCaseElapsedMs: timingPayload.caseElapsedMs.reduce((sum, value) => sum + value, 0),
      timingHash: sha256(Buffer.from(canonicalStringify(timingPayload))),
    },
    metrics,
    cases,
    outputHash: sha256(Buffer.from(canonicalStringify(cases))),
  };
  return sealStoryBeatBrowserEvaluationReceipt(payload);
}

async function sameSnapshot(left, right, label) {
  if ((left.commit !== undefined || right.commit !== undefined) && left.commit !== right.commit
    || left.aggregateSha256 !== right.aggregateSha256
    || canonicalStringify(left.files) !== canonicalStringify(right.files)) {
    throw new Error(`${label} changed during the evaluation`);
  }
}

async function main(options) {
  const [source, model, runtime, holdout] = await Promise.all([
    snapshotSource(),
    snapshotModel(options["model-dir"]),
    snapshotRuntime(),
    snapshotHoldout(options.holdout, options.full),
  ]);
  const outputTarget = await resolveOutputTarget(options.out, model.root);
  const bundle = await buildBundle();
  const browserResult = await runBrowser({ options, bundle, model, runtime, holdout });
  const [sourceAfter, modelAfter, runtimeAfter, holdoutAfter] = await Promise.all([
    snapshotSource(),
    snapshotModel(options["model-dir"]),
    snapshotRuntime(),
    snapshotHoldout(options.holdout, options.full),
  ]);
  await sameSnapshot(source, sourceAfter, "Source closure");
  await sameSnapshot(model, modelAfter, "Model closure");
  await sameSnapshot(runtime, runtimeAfter, "Runtime closure");
  if (holdout.sha256 !== holdoutAfter.sha256 || holdout.corpusHash !== holdoutAfter.corpusHash) {
    throw new Error("Sealed holdout changed during the evaluation");
  }
  const receipt = createReceipt({ options, source, bundle, model, runtime, holdout, browserResult });
  if (!verifyStoryBeatBrowserEvaluationReceipt(receipt)) {
    throw new Error("Story-beat evaluation receipt failed final verification");
  }
  await mkdir(outputTarget, { recursive: false, mode: 0o700 });
  const outputPath = resolve(outputTarget, storyBeatBrowserEvaluationReceiptFile);
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({
    receipt: relative(repositoryRoot, outputPath),
    contentHash: receipt.contentHash,
    outputHash: receipt.outputHash,
    metrics: receipt.metrics,
    modelAdmitted: false,
    displayAuthorized: false,
  }, null, 2)}\n`);
}

const options = parseStoryBeatBrowserEvaluationArguments(process.argv.slice(2));
if (options === null) {
  usage("Invalid story-beat browser evaluation arguments.");
} else {
  main(options).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
