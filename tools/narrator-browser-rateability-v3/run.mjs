#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
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
  readPrivateNarratorSalt,
  resolveNarratorOutputDirectory,
  sha256,
} from "../narrator-browser-evaluation/run-support.mjs";
import {
  coordinateNarratorBrowserRateabilityAttemptV3,
  parseNarratorBrowserRateabilityArgumentsV3,
} from "./run-support.mjs";

const executeFile = promisify(execFile);
const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "../..");
const sourcePaths = Object.freeze([
  ".gitignore",
  "docs/narrator/narrator-v3-browser-smoke-receipt.json",
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/depth/types.ts",
  "src/narrator/blind-evaluation-v3.ts",
  "src/narrator/blind-evaluation.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v3.ts",
  "src/narrator/evaluation-browser-run-receipt-v3.ts",
  "src/narrator/evaluation-browser-worker-port-v3.ts",
  "src/narrator/evaluation-contract-v3.ts",
  "src/narrator/evaluation-evidence-contract-v3.ts",
  "src/narrator/evaluation-prompt-contract.ts",
  "src/narrator/evaluation-rateability-v3.ts",
  "src/narrator/evaluation-receipts-v3.ts",
  "src/narrator/evaluation-receipts.ts",
  "src/narrator/evaluation-runner-v3.ts",
  "src/narrator/evaluation-runner.ts",
  "src/narrator/evaluation-selection-contract-v3.ts",
  "src/narrator/evaluation-transformers-adapter-v3.ts",
  "src/narrator/evaluation-worker-protocol-v3.ts",
  "src/narrator/evaluation.ts",
  "src/narrator/model-candidate.ts",
  "src/narrator/model-provenance.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/t5-publication-evidence.ts",
  "src/narrator/t5-rebuild-evidence.ts",
  "tools/narrator-browser-evaluation-v3/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
  "tools/narrator-browser-rateability-v3/index.html",
  "tools/narrator-browser-rateability-v3/run-support.mjs",
  "tools/narrator-browser-rateability-v3/run.mjs",
  "tools/narrator-browser-rateability-v3/src/evidence.ts",
  "tools/narrator-browser-rateability-v3/src/harness.ts",
  "tools/narrator-browser-rateability-v3/tsconfig.json",
  "tools/narrator-browser-rateability-v3/vite.config.ts",
  "tools/narrator-browser-rateability-v3/vite.host.config.ts",
  "tsconfig.json",
]);
const runtimeAssets = Object.freeze([
  Object.freeze({
    path: "ort-wasm-simd-threaded.asyncify.mjs",
    role: "runtime-module",
    byteLength: 47_389,
    sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
    file: resolve(repositoryRoot, "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs"),
  }),
  Object.freeze({
    path: "ort-wasm-simd-threaded.asyncify.wasm",
    role: "runtime-wasm",
    byteLength: 23_567_050,
    sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
    file: resolve(repositoryRoot, "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm"),
  }),
]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "Usage: node tools/narrator-browser-rateability-v3/run.mjs run "
      + "--model-dir <dir> --run-id <id> --sheet-id <id> "
      + "--secret-salt-file <private-file> --out <new-external-dir>\n",
  );
  process.exitCode = 2;
}

function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical evidence numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical evidence value: ${typeof value}`);
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Narrator V3 full-run bundle contains a non-regular entry: ${entry.name}`);
  }
  return files;
}

async function snapshotFiles(files, base) {
  const evidence = [];
  const assets = [];
  for (const file of [...files].sort()) {
    const bytes = await readFile(file);
    const path = relative(base, file).split(sep).join("/");
    evidence.push(Object.freeze({
      path,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    }));
    assets.push(Object.freeze({ path, bytes }));
  }
  return Object.freeze({
    evidence: Object.freeze(evidence),
    assets: Object.freeze(assets),
  });
}

async function committedSourceBytes(sourceCommit, path) {
  const { stdout } = await executeFile(
    "git",
    ["show", `${sourceCommit}:${path}`],
    { cwd: repositoryRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

async function committedSourceBlobs(sourceCommit) {
  const result = [];
  for (const path of sourcePaths) {
    const bytes = await committedSourceBytes(sourceCommit, path);
    result.push(Object.freeze({ path, base64: bytes.toString("base64") }));
  }
  return Object.freeze(result);
}

function committedJson(sourceBlobs, path) {
  const source = sourceBlobs.find((entry) => entry.path === path);
  if (source === undefined) throw new Error(`Missing committed narrator JSON source: ${path}`);
  return JSON.parse(Buffer.from(source.base64, "base64").toString("utf8"));
}

function publishedCandidate(publicationReceipt) {
  return Object.freeze({
    schemaVersion: 2,
    candidateId: `flan-t5-small-q8@${publicationReceipt.artifactRevision.slice(0, 8)}`,
    task: "single-ambient-line",
    modelFamily: "t5",
    sessions: publicationReceipt.sessions.map((session) => Object.freeze({ ...session })),
    model: Object.freeze({
      repository: publicationReceipt.artifactRepository,
      revision: publicationReceipt.artifactRevision,
      sourceRepository: publicationReceipt.source.repository,
      sourceRevision: publicationReceipt.source.revision,
      license: publicationReceipt.convertedLicense.spdxLicense,
      licenseStatus: "verified",
    }),
    runtime: Object.freeze({ ...publicationReceipt.runtime }),
    execution: "wasm",
    artifacts: publicationReceipt.artifacts.map((artifact) => Object.freeze({ ...artifact })),
    measuredIncrementalMemoryBytes: null,
  });
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function startServer(modelAssets, runtimeAssetBytes, bundleAssets) {
  const staged = new Map();
  modelAssets.forEach((asset, index) =>
    staged.set(`/__narrator_staging__/model/${index}`, asset));
  runtimeAssetBytes.forEach((asset, index) =>
    staged.set(`/__narrator_staging__/runtime/${index}`, asset));
  const bundle = new Map(bundleAssets.map((asset) => [`/${asset.path}`, asset.bytes]));
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method !== "GET" || url.search !== "" || url.hash !== "") {
        response.writeHead(405).end();
        return;
      }
      const stagedAsset = staged.get(url.pathname);
      let bytes;
      let responsePath;
      if (stagedAsset !== undefined) {
        bytes = stagedAsset.bytes;
        responsePath = stagedAsset.path;
      } else {
        const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
        const bundled = bundle.get(requested);
        if (bundled === undefined) {
          response.writeHead(404).end();
          return;
        }
        bytes = bundled;
        responsePath = requested;
      }
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:",
        "content-length": String(bytes.byteLength),
        "content-type": contentType(responsePath),
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Narrator V3 full-run server address is invalid");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) =>
      server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

async function buildFresh(sourceCommit) {
  const cleanRoot = await mkdtemp(resolve(tmpdir(), "the-grind-2-narrator-v3-full-run-build-"));
  const outputRoot = resolve(cleanRoot, "observed-bundle");
  const hostOutputRoot = resolve(outputRoot, "host");
  let primaryError;
  try {
    for (const path of sourcePaths) {
      const destination = resolve(cleanRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await committedSourceBytes(sourceCommit, path));
    }
    await symlink(resolve(repositoryRoot, "node_modules"), resolve(cleanRoot, "node_modules"), "dir");
    await executeFile(
      resolve(repositoryRoot, "node_modules/.bin/vite"),
      [
        "build",
        "--config",
        resolve(cleanRoot, "tools/narrator-browser-rateability-v3/vite.config.ts"),
        "--outDir",
        outputRoot,
      ],
      { cwd: cleanRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    await executeFile(
      resolve(repositoryRoot, "node_modules/.bin/vite"),
      [
        "build",
        "--config",
        resolve(cleanRoot, "tools/narrator-browser-rateability-v3/vite.host.config.ts"),
        "--outDir",
        hostOutputRoot,
      ],
      { cwd: cleanRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    return await snapshotFiles(await filesUnder(outputRoot), outputRoot);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await rm(cleanRoot, { recursive: true, force: true });
    } catch (error) {
      if (primaryError === undefined) throw error;
    }
  }
}

async function observeBuild(sourceCommit, bundleSnapshot) {
  const sourceEvidence = await evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit });
  const packageLock = sourceEvidence.find((file) => file.path === "package-lock.json");
  if (packageLock === undefined) throw new Error("Narrator V3 full-run package-lock evidence is missing");
  const paths = bundleSnapshot.evidence.map((file) => file.path);
  if (paths.length !== 5
    || !paths.includes("index.html")
    || !paths.includes("host/evidence-host.mjs")
    || paths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
    || paths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
    || paths.filter((path) =>
      /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length !== 1) {
    throw new Error("Narrator V3 full-run bundle does not have the exact five-file layout");
  }
  return Object.freeze({
    sourceFiles: sourceEvidence,
    sourceAggregateSha256: sha256(Buffer.from(canonicalStringify(sourceEvidence))),
    packageLock,
    bundleFiles: bundleSnapshot.evidence,
    bundleAggregateSha256: sha256(Buffer.from(canonicalStringify(bundleSnapshot.evidence))),
  });
}

async function snapshotExpectedArtifacts(files, expected, label) {
  if (!Array.isArray(expected) || files.length !== expected.length) {
    throw new Error(`Narrator V3 ${label} closure is invalid`);
  }
  const result = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const expectation = expected[index];
    const metadata = await stat(file);
    if (!metadata.isFile()) {
      throw new Error(`Narrator V3 ${label} input is not a file: ${basename(file)}`);
    }
    const bytes = await readFile(file);
    if (bytes.byteLength !== expectation.byteLength || sha256(bytes) !== expectation.sha256) {
      throw new Error(`Narrator V3 ${label} input bytes do not match the frozen manifest`);
    }
    result.push(Object.freeze({ path: expectation.path, bytes }));
  }
  return Object.freeze(result);
}

async function waitForWorkerSeal(page) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (page.workers().length === 0) return "completed";
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  return "failed";
}

function committedSourceArrayBuffers(sourceBlobs) {
  return sourceBlobs.map(({ path, base64 }) => {
    const source = Buffer.from(base64, "base64");
    const bytes = new Uint8Array(source.byteLength);
    bytes.set(source);
    return Object.freeze({ path, bytes: bytes.buffer });
  });
}

async function loadObservedHostEvidenceModule(bundleSnapshot) {
  const asset = bundleSnapshot.assets.find(({ path }) => path === "host/evidence-host.mjs");
  if (asset === undefined) throw new Error("Narrator V3 observed host evidence bundle is missing");
  const hostEvidenceModuleUrl =
    `data:text/javascript;base64,${Buffer.from(asset.bytes).toString("base64")}`;
  const module = await import(hostEvidenceModuleUrl);
  if (typeof module.createAndVerifyNarratorBrowserProvenanceReceiptV3 !== "function"
    || typeof module.createAndVerifyNarratorBrowserRunPackageV3 !== "function") {
    throw new Error("Narrator V3 observed host evidence bundle has no staged creators");
  }
  return module;
}

async function sealBrowserProducers({ browser, context, page }) {
  const contextWasPresent = context !== undefined;
  const browserWasPresent = browser !== undefined;
  let pageCloseStatus = "completed";
  if (page !== undefined) {
    try {
      await page.close({ runBeforeUnload: false });
    } catch {
      pageCloseStatus = "failed";
    }
  }
  let contextCloseStatus = "completed";
  if (context !== undefined) {
    try {
      await context.close();
    } catch {
      contextCloseStatus = "failed";
    }
  }
  let browserCloseStatus = "completed";
  if (browser !== undefined) {
    try {
      await browser.close();
    } catch {
      browserCloseStatus = "failed";
    }
  }
  let browserDisconnected = browser === undefined;
  if (browser !== undefined) {
    try {
      browserDisconnected = !browser.isConnected();
    } catch {
      browserDisconnected = false;
    }
  }
  return Object.freeze({
    pageCloseStatus,
    contextCloseStatus,
    browserCloseStatus,
    producerSeal: !browserWasPresent
      || (contextWasPresent && contextCloseStatus === "completed")
      || browserCloseStatus === "completed"
      || browserDisconnected
      ? "confirmed"
      : "unconfirmed",
  });
}

const options = parseNarratorBrowserRateabilityArgumentsV3(process.argv.slice(2));
if (options === null) {
  usage("Invalid narrator V3 browser rateability arguments.");
} else {
  const modelDirectory = isAbsolute(options["model-dir"])
    ? options["model-dir"]
    : resolve(process.cwd(), options["model-dir"]);
  const sourceCommit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  const [bundleSnapshot, sourceBlobs, npmVersionResult] = await Promise.all([
    buildFresh(sourceCommit),
    committedSourceBlobs(sourceCommit),
    executeFile("npm", ["--version"], { cwd: repositoryRoot }),
  ]);
  const postBuildSourceCommit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  if (postBuildSourceCommit !== sourceCommit) {
    throw new Error("Narrator V3 full-run source commit changed while building");
  }
  const outputDirectory = await resolveNarratorOutputDirectory({
    requestedPath: options.out,
    mode: "run",
    cwd: process.cwd(),
    repositoryRoot,
    diagnosticDist: toolRoot,
  });
  const secretSalt = await readPrivateNarratorSalt({
    requestedPath: options["secret-salt-file"],
    cwd: process.cwd(),
    repositoryRoot,
  });
  const observedBuild = await observeBuild(sourceCommit, bundleSnapshot);
  const publicationReceipt = committedJson(
    sourceBlobs,
    "docs/narrator/t5-artifact-publication-receipt.json",
  );
  const adapterSmokeReceipt = committedJson(
    sourceBlobs,
    "docs/narrator/narrator-v3-browser-smoke-receipt.json",
  );
  const candidate = publishedCandidate(publicationReceipt);
  const artifacts = publicationReceipt.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 6) {
    throw new Error("Published narrator V3 model closure is invalid");
  }
  const modelFiles = artifacts.map((artifact) => resolve(modelDirectory, artifact.path));
  const runtimeFiles = runtimeAssets.map((artifact) => artifact.file);
  const [modelAssets, runtimeAssetBytes] = await Promise.all([
    snapshotExpectedArtifacts(modelFiles, artifacts, "model"),
    snapshotExpectedArtifacts(runtimeFiles, runtimeAssets, "runtime"),
  ]);

  const browserBundleAssets = bundleSnapshot.assets.filter(
    ({ path }) => path !== "host/evidence-host.mjs",
  );
  const server = await startServer(modelAssets, runtimeAssetBytes, browserBundleAssets);
  let browser;
  let context;
  let primaryError;
  try {
    const report = await coordinateNarratorBrowserRateabilityAttemptV3({
      start: {
        outputDirectory,
        sourceCommit,
        candidateId: candidate.candidateId,
        runId: options["run-id"],
        sheetId: options["sheet-id"],
      },
      committedSources: committedSourceArrayBuffers(sourceBlobs),
      loadHostEvidence: () => loadObservedHostEvidenceModule(bundleSnapshot),
      observe: async ({ preserveCore, confirmProducerSeal }) => {
        let page;
        let producerSealConfirmed = false;
        const sealProducers = async () => {
          const seal = await sealBrowserProducers({ browser, context, page });
          if (seal.pageCloseStatus === "completed"
            || seal.contextCloseStatus === "completed"
            || seal.browserCloseStatus === "completed") {
            page = undefined;
          }
          if (seal.contextCloseStatus === "completed"
            || seal.browserCloseStatus === "completed") {
            context = undefined;
          }
          if (seal.browserCloseStatus === "completed") browser = undefined;
          return seal;
        };
        try {
          browser = await chromium.launch({ headless: true });
          context = await browser.newContext({ serviceWorkers: "block" });
          page = await context.newPage();
          let runPhase = false;
          let offlineBeforeLoad = false;
          const stagingExternalRequests = [];
          const runPhaseRequests = [];
          context.on("request", (request) => {
            const url = request.url();
            const protocol = new URL(url).protocol;
            const isHttp = protocol === "http:" || protocol === "https:";
            if (!isHttp) return;
            if (runPhase) {
              runPhaseRequests.push(url);
            } else if (!url.startsWith(`${server.origin}/`)) {
              stagingExternalRequests.push(url);
            }
          });
          await context.route("**/*", async (route) => {
            const url = route.request().url();
            const protocol = new URL(url).protocol;
            if ((protocol === "http:" || protocol === "https:")
              && !url.startsWith(`${server.origin}/`)) {
              await route.abort("blockedbyclient");
            } else {
              await route.continue();
            }
          });
          await context.routeWebSocket("**/*", async (socket) => {
            const url = socket.url();
            if (runPhase) runPhaseRequests.push(url);
            else stagingExternalRequests.push(url);
            await socket.close({
              code: 1008,
              reason: "Narrator evaluation network isolation",
            });
          });
          await page.goto(server.origin, { waitUntil: "load" });
          const browserPaths = await page.evaluate(() =>
            [...globalThis.__theGrindNarratorRateabilityV3.sourcePaths]);
          if (canonicalStringify(browserPaths) !== canonicalStringify(sourcePaths)) {
            throw new Error(
              "Narrator V3 full-run coordinator and browser source closures differ",
            );
          }

          const stageRequest = {
            runId: options["run-id"],
            workerEpoch: `browser-worker:v3:${options["run-id"]}`,
            modelArtifacts: artifacts.map((artifact, index) => ({
              path: artifact.path,
              url: `${server.origin}/__narrator_staging__/model/${index}`,
            })),
            runtimeArtifacts: runtimeAssets.map((artifact, index) => ({
              path: artifact.path,
              url: `${server.origin}/__narrator_staging__/runtime/${index}`,
            })),
          };
          await page.evaluate(
            (request) => globalThis.__theGrindNarratorRateabilityV3.stage(request),
            stageRequest,
          );

          try {
            await context.setOffline(true);
            offlineBeforeLoad = true;
          } catch {
            offlineBeforeLoad = false;
          }
          runPhase = true;
          const completed = await page.evaluate(
            (request) => globalThis.__theGrindNarratorRateabilityV3.runAfterOffline(request),
            {
              sheetId: options["sheet-id"],
              secretSalt,
            },
          );
          await preserveCore(completed);
          const workerSealStatus = await waitForWorkerSeal(page);
          const browserIdentity = { name: "chromium", version: browser.version() };
          const seal = await sealProducers();
          if (seal.producerSeal !== "confirmed") {
            throw new Error(
              "Narrator V3 browser producers could not be sealed before evidence creation",
            );
          }
          confirmProducerSeal();
          producerSealConfirmed = true;
          await new Promise((resolvePromise) => setImmediate(resolvePromise));
          return Object.freeze({
            sourceCommit,
            observedBuild,
            buildToolchain: {
              nodeVersion: process.versions.node,
              npmVersion: npmVersionResult.stdout.trim(),
            },
            browser: browserIdentity,
            network: {
              serviceWorkers: "block",
              stagingExternalRequestCount: stagingExternalRequests.length,
              offlineBeforeLoad,
              postOfflineRequestCount: runPhaseRequests.length,
              workerSealStatus,
              pageCloseStatus: seal.pageCloseStatus,
              contextCloseStatus: seal.contextCloseStatus,
              browserCloseStatus: seal.browserCloseStatus,
              producerSeal: seal.producerSeal,
            },
            candidate,
            modelArtifacts: artifacts.map(({
              path,
              byteLength,
              sha256: artifactSha256,
            }) => ({
              path,
              byteLength,
              sha256: artifactSha256,
            })),
            runtime: adapterSmokeReceipt.runtime,
            runtimeArtifacts: runtimeAssets.map(({ file: _file, ...artifact }) => artifact),
            adapterSmoke: {
              sourceCommit: adapterSmokeReceipt.sourceCommit,
              receiptHash: adapterSmokeReceipt.contentHash,
            },
            runId: options["run-id"],
            sheetId: options["sheet-id"],
          });
        } catch (error) {
          if (!producerSealConfirmed) {
            const seal = await sealProducers();
            if (seal.producerSeal === "confirmed") {
              confirmProducerSeal();
              producerSealConfirmed = true;
            }
          }
          throw error;
        }
      },
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const cleanup of [
      context === undefined ? null : () => context.close(),
      browser === undefined ? null : () => browser.close(),
      () => server.close(),
    ]) {
      if (cleanup === null) continue;
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (primaryError === undefined && cleanupErrors.length > 0) throw cleanupErrors[0];
  }
}
