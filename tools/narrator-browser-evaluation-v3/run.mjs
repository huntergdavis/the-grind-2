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
  createPrivateOutputDirectory,
  evidenceForCommit,
  resolveNarratorOutputDirectory,
  sha256,
  writePrivateJsonEvidence,
} from "../narrator-browser-evaluation/run-support.mjs";
import {
  narratorBrowserSmokeReceiptFileV3,
  parseNarratorBrowserSmokeArgumentsV3,
} from "./run-support.mjs";

const executeFile = promisify(execFile);
const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "../..");
const diagnosticDist = resolve(toolRoot, ".narrator-browser-evaluation-v3-dist");
const publicationReceiptPath = resolve(repositoryRoot, "docs/narrator/t5-artifact-publication-receipt.json");
const sourcePaths = Object.freeze([
  ".gitignore",
  "docs/narrator/t5-artifact-publication-receipt.json",
  "package-lock.json",
  "package.json",
  "scripts/check-boundaries.mjs",
  "src/core/canonical.ts",
  "src/core/types.ts",
  "src/depth/types.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v3.ts",
  "src/narrator/evaluation-browser-worker-port-v3.ts",
  "src/narrator/evaluation-contract-v3.ts",
  "src/narrator/evaluation-evidence-contract-v3.ts",
  "src/narrator/evaluation-prompt-contract.ts",
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
  "tools/narrator-browser-evaluation-v3/index.html",
  "tools/narrator-browser-evaluation-v3/run-support.mjs",
  "tools/narrator-browser-evaluation-v3/run.mjs",
  "tools/narrator-browser-evaluation-v3/src/harness.ts",
  "tools/narrator-browser-evaluation-v3/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation-v3/tsconfig.json",
  "tools/narrator-browser-evaluation-v3/vite.config.ts",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
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
    "Usage: node tools/narrator-browser-evaluation-v3/run.mjs smoke "
      + "--model-dir <dir> --run-id <id> --out <new-private-dir>\n",
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
    else throw new Error(`Narrator V3 bundle contains a non-regular entry: ${entry.name}`);
  }
  return files;
}

async function snapshotBundleFiles(files, base) {
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

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function startServer(modelFiles, runtimeFiles, bundleAssets) {
  const staged = new Map();
  modelFiles.forEach((file, index) => staged.set(`/__narrator_staging__/model/${index}`, file));
  runtimeFiles.forEach((file, index) => staged.set(`/__narrator_staging__/runtime/${index}`, file));
  const bundle = new Map(bundleAssets.map((asset) => [`/${asset.path}`, asset.bytes]));
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method !== "GET" || url.search !== "" || url.hash !== "") {
          response.writeHead(405).end();
          return;
        }
        const stagedFile = staged.get(url.pathname);
        let bytes;
        let responsePath;
        if (stagedFile !== undefined) {
          bytes = await readFile(stagedFile);
          responsePath = stagedFile;
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
          "content-length": String(bytes.byteLength),
          "content-type": contentType(responsePath),
        });
        response.end(bytes);
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
  if (typeof address !== "object" || address === null) throw new Error("Narrator V3 server address is invalid");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) =>
      server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

async function buildFresh(sourceCommit) {
  const cleanRoot = await mkdtemp(resolve(tmpdir(), "the-grind-2-narrator-v3-build-"));
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
        resolve(cleanRoot, "tools/narrator-browser-evaluation-v3/vite.config.ts"),
        "--outDir",
        diagnosticDist,
      ],
      { cwd: cleanRoot, maxBuffer: 16 * 1024 * 1024 },
    );
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

async function observeBuild(sourceCommit) {
  const sourceEvidence = await evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit });
  const packageLock = sourceEvidence.find((file) => file.path === "package-lock.json");
  if (packageLock === undefined) throw new Error("Narrator V3 package-lock evidence is missing");
  const bundleSnapshot = await snapshotBundleFiles(await filesUnder(diagnosticDist), diagnosticDist);
  const paths = bundleSnapshot.evidence.map((file) => file.path);
  if (paths.length !== 4
    || !paths.includes("index.html")
    || paths.filter((path) => /^assets\/index-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
    || paths.filter((path) => /^assets\/transformers\.worker-[A-Za-z0-9_-]+\.js$/u.test(path)).length !== 1
    || paths.filter((path) =>
      /^assets\/ort-wasm-simd-threaded\.asyncify-[A-Za-z0-9_-]+\.wasm$/u.test(path)).length !== 1) {
    throw new Error("Narrator V3 browser bundle does not have the exact four-file layout");
  }
  return Object.freeze({
    observedBuild: Object.freeze({
      sourceFiles: sourceEvidence,
      sourceAggregateSha256: sha256(Buffer.from(canonicalStringify(sourceEvidence))),
      packageLock,
      bundleFiles: bundleSnapshot.evidence,
      bundleAggregateSha256: sha256(Buffer.from(canonicalStringify(bundleSnapshot.evidence))),
    }),
    bundleAssets: bundleSnapshot.assets,
  });
}

const options = parseNarratorBrowserSmokeArgumentsV3(process.argv.slice(2));
if (options === null) {
  usage("Invalid narrator V3 browser smoke arguments.");
} else {
  const modelDirectory = isAbsolute(options["model-dir"])
    ? options["model-dir"]
    : resolve(process.cwd(), options["model-dir"]);
  const sourceCommit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  await buildFresh(sourceCommit);
  const postBuildSourceCommit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  if (postBuildSourceCommit !== sourceCommit) {
    throw new Error("Narrator V3 source commit changed while building the browser bundle");
  }
  const outputDirectory = await resolveNarratorOutputDirectory({
    requestedPath: options.out,
    mode: "smoke",
    cwd: process.cwd(),
    repositoryRoot,
    diagnosticDist,
  });
  const [buildObservation, sourceBlobs, npmVersionResult] = await Promise.all([
    observeBuild(sourceCommit),
    committedSourceBlobs(sourceCommit),
    executeFile("npm", ["--version"], { cwd: repositoryRoot }),
  ]);
  const { observedBuild, bundleAssets } = buildObservation;
  const publicationReceipt = JSON.parse(await readFile(publicationReceiptPath, "utf8"));
  const artifacts = publicationReceipt.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 6) {
    throw new Error("Published narrator V3 model closure is invalid");
  }
  const modelFiles = artifacts.map((artifact) => resolve(modelDirectory, artifact.path));
  const runtimeFiles = runtimeAssets.map((artifact) => artifact.file);
  for (const file of [...modelFiles, ...runtimeFiles]) {
    if (!(await stat(file)).isFile()) {
      throw new Error(`Narrator V3 smoke input is not a file: ${basename(file)}`);
    }
  }

  const server = await startServer(modelFiles, runtimeFiles, bundleAssets);
  let browser;
  let context;
  let primaryError;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    let offline = false;
    const externalRequests = [];
    const postOfflineRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      const protocol = new URL(url).protocol;
      if ((protocol === "http:" || protocol === "https:") && !url.startsWith(`${server.origin}/`)) {
        externalRequests.push(url);
      }
      if (offline && (protocol === "http:" || protocol === "https:")) postOfflineRequests.push(url);
    });
    await page.goto(server.origin, { waitUntil: "load" });
    const browserSourcePaths = await page.evaluate(() =>
      [...globalThis.__theGrindNarratorEvaluationV3.sourcePaths]);
    if (canonicalStringify(browserSourcePaths) !== canonicalStringify(sourcePaths)) {
      throw new Error("Narrator V3 coordinator and browser source closures differ");
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
    const stage = await page.evaluate(
      (request) => globalThis.__theGrindNarratorEvaluationV3.stage(request),
      stageRequest,
    );
    if (externalRequests.length !== 0) {
      throw new Error("Narrator V3 staging attempted an external request");
    }
    offline = true;
    await context.setOffline(true);

    const smoke = await page.evaluate(() =>
      globalThis.__theGrindNarratorEvaluationV3.smokeAfterOffline());
    if (postOfflineRequests.length !== 0) {
      const paths = postOfflineRequests.map((value) => new URL(value).pathname).join(", ");
      throw new Error(`Narrator V3 load or inference attempted a network request: ${paths}`);
    }
    const receiptRequest = {
      sourceCommit,
      observedBuild,
      buildToolchain: {
        nodeVersion: process.versions.node,
        npmVersion: npmVersionResult.stdout.trim(),
      },
      browser: { name: "chromium", version: browser.version() },
      stage,
      network: {
        serviceWorkers: "block",
        stagingExternalRequestCount: externalRequests.length,
        offlineBeforeLoad: true,
        postOfflineRequestCount: postOfflineRequests.length,
      },
      smoke,
    };
    const receipt = await page.evaluate(
      (request) => globalThis.__theGrindNarratorEvaluationV3.createSmokeReceipt(request),
      receiptRequest,
    );
    const receiptIsValid = await page.evaluate(
      ({ value, expectedSourceCommit, observed, sources }) => {
        const committedSources = sources.map(({ path, base64 }) => {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return { path, bytes: bytes.buffer };
        });
        return globalThis.__theGrindNarratorEvaluationV3.validateSmokeReceipt(
          value,
          expectedSourceCommit,
          observed,
          committedSources,
        );
      },
      {
        value: receipt,
        expectedSourceCommit: sourceCommit,
        observed: observedBuild,
        sources: sourceBlobs,
      },
    );
    if (!receiptIsValid) throw new Error("Narrator V3 browser smoke receipt is invalid");

    await createPrivateOutputDirectory(outputDirectory);
    const receiptPath = resolve(outputDirectory, narratorBrowserSmokeReceiptFileV3);
    await writePrivateJsonEvidence(receiptPath, receipt);
    process.stdout.write(`${JSON.stringify({
      status: "ok",
      mode: "smoke",
      receiptPath,
      contentHash: receipt.contentHash,
      outcome: receipt.caseReceipt.status,
      postOfflineRequestCount: receipt.network.postOfflineRequestCount,
      modelAdmitted: receipt.modelAdmitted,
      displayAuthorized: receipt.displayAuthorized,
    })}\n`);
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
