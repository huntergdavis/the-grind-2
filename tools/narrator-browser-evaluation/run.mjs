#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  assertCommittedSourceSnapshot,
  createNarratorFullRunEvidenceSet,
  createPrivateOutputDirectory,
  evidenceForCommit,
  parseNarratorBrowserArguments,
  pathIsInside,
  readPrivateNarratorSalt,
  resolveNarratorOutputDirectory,
  sha256,
  writePrivateJsonEvidence,
} from "./run-support.mjs";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "../..");
const diagnosticDist = resolve(toolRoot, ".narrator-browser-evaluation-dist");
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
  "src/narrator/blind-evaluation-v2.ts",
  "src/narrator/blind-evaluation.ts",
  "src/narrator/capability.ts",
  "src/narrator/evaluation-browser-assets-v2.ts",
  "src/narrator/evaluation-browser-receipt-v2.ts",
  "src/narrator/evaluation-browser-worker-port-v2.ts",
  "src/narrator/evaluation-contract-v2.ts",
  "src/narrator/evaluation-prompt-contract.ts",
  "src/narrator/evaluation-receipts-v2.ts",
  "src/narrator/evaluation-receipts.ts",
  "src/narrator/evaluation-runner-v2.ts",
  "src/narrator/evaluation-runner.ts",
  "src/narrator/evaluation-transformers-adapter-v2.ts",
  "src/narrator/evaluation-worker-protocol-v2.ts",
  "src/narrator/evaluation.ts",
  "src/narrator/model-candidate.ts",
  "src/narrator/model-provenance.ts",
  "src/narrator/output-policy.ts",
  "src/narrator/protocol.ts",
  "src/narrator/t5-publication-evidence.ts",
  "src/narrator/t5-rebuild-evidence.ts",
  "tools/narrator-browser-evaluation/check-runtime-assets.mjs",
  "tools/narrator-browser-evaluation/index.html",
  "tools/narrator-browser-evaluation/run-support.mjs",
  "tools/narrator-browser-evaluation/run.mjs",
  "tools/narrator-browser-evaluation/src/artifact-acquisition.ts",
  "tools/narrator-browser-evaluation/src/harness.ts",
  "tools/narrator-browser-evaluation/src/transformers.worker.ts",
  "tools/narrator-browser-evaluation/src/verified-model-fetch.ts",
  "tools/narrator-browser-evaluation/tsconfig.json",
  "tools/narrator-browser-evaluation/vite.config.ts",
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
    "Usage: node tools/narrator-browser-evaluation/run.mjs <smoke|run> "
      + "--model-dir <dir> --run-id <id> --out <dir> "
      + "[--sheet-id <id> --secret-salt-file <private-file> --adapter-receipt <file>]\n",
  );
  process.exitCode = 2;
}

function canonicalStringify(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Canonical receipt numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical receipt value: ${typeof value}`);
}

function canonicalHash(value) {
  const source = canonicalStringify(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right ^= code + 0x9e3779b9 + (right << 6) + (right >>> 2);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

async function evidenceForFiles(files, base) {
  const evidence = [];
  for (const file of [...files].sort()) {
    const bytes = await readFile(file);
    evidence.push(Object.freeze({
      path: relative(base, file).split(sep).join("/"),
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
    }));
  }
  return Object.freeze(evidence);
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

async function startServer(modelFiles, runtimeFiles) {
  const staged = new Map();
  modelFiles.forEach((file, index) => staged.set(`/__narrator_staging__/model/${index}`, file));
  runtimeFiles.forEach((file, index) => staged.set(`/__narrator_staging__/runtime/${index}`, file));
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method !== "GET" || url.search !== "" || url.hash !== "") {
          response.writeHead(405).end();
          return;
        }
        const stagedFile = staged.get(url.pathname);
        let path;
        if (stagedFile !== undefined) path = stagedFile;
        else {
          const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
          path = resolve(diagnosticDist, `.${requested}`);
          if (!pathIsInside(diagnosticDist, path)) {
            response.writeHead(404).end();
            return;
          }
        }
        const bytes = await readFile(path);
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-length": String(bytes.byteLength),
          "content-type": contentType(path),
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
  if (typeof address !== "object" || address === null) throw new Error("Narrator diagnostic server address is invalid");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

async function observeBuild(sourceCommit) {
  const sourceEvidence = await evidenceForCommit({ repositoryRoot, sourcePaths, sourceCommit });
  const packageLock = sourceEvidence.find((file) => file.path === "package-lock.json");
  if (packageLock === undefined) throw new Error("Narrator browser package-lock evidence is missing");
  const bundleFiles = (await filesUnder(diagnosticDist))
    .filter((path) => /\.(?:html|js|wasm)$/u.test(path));
  const bundleEvidence = await evidenceForFiles(bundleFiles, diagnosticDist);
  return Object.freeze({
    sourceFiles: sourceEvidence,
    sourceAggregateSha256: sha256(Buffer.from(canonicalStringify(sourceEvidence))),
    packageLock,
    bundleFiles: bundleEvidence,
    bundleAggregateSha256: sha256(Buffer.from(canonicalStringify(bundleEvidence))),
  });
}

async function buildReceipt(fields) {
  const content = {
    schemaVersion: 1,
    receiptId: "the-grind-2:narrator-browser-adapter-build:v1",
    sourceCommit: fields.sourceCommit,
    sourceFiles: fields.observedBuild.sourceFiles,
    sourceAggregateSha256: fields.observedBuild.sourceAggregateSha256,
    packageLock: fields.observedBuild.packageLock,
    bundleFiles: fields.observedBuild.bundleFiles,
    bundleAggregateSha256: fields.observedBuild.bundleAggregateSha256,
    runtime: {
      transformersPackage: "@huggingface/transformers",
      transformersVersion: "4.2.0",
      transformersIntegrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==",
      ortPackage: "onnxruntime-web",
      ortVersion: "1.26.0-dev.20260416-b7804b056c",
      ortIntegrity: "sha512-MD6Ss4GSpQBo6zqoJzyT9LRbKYs7x/JVN23FT24EcEvlqF4VuzPOeH6X38orZPKHQDbprn7K+SBpu0/mj2CQiw==",
      assets: runtimeAssets.map(({ file: _file, ...artifact }) => artifact),
    },
    runId: fields.runId,
    workerBindingHash: canonicalHash(fields.stage.workerBinding),
    verifiedModelArtifacts: fields.stage.verifiedModelArtifacts,
    verifiedRuntimeArtifacts: fields.stage.verifiedRuntimeArtifacts,
    browser: { name: "chromium", version: fields.browserVersion },
    offlineBeforeLoad: true,
    postOfflineRequestCount: fields.postOfflineRequests.length,
    smoke: fields.smoke,
    modelAdmitted: false,
    displayAuthorized: false,
  };
  return Object.freeze({ ...content, contentHash: canonicalHash(content) });
}

const options = parseNarratorBrowserArguments(process.argv.slice(2));
if (options === null) {
  usage("Invalid narrator browser evaluation arguments.");
} else {
  const modelDirectory = isAbsolute(options["model-dir"])
    ? options["model-dir"]
    : resolve(process.cwd(), options["model-dir"]);
  const outputDirectory = await resolveNarratorOutputDirectory({
    requestedPath: options.out,
    mode: options.mode,
    cwd: process.cwd(),
    repositoryRoot,
    diagnosticDist,
  });
  const sourceCommit = await assertCommittedSourceSnapshot({ repositoryRoot, sourcePaths });
  const observedBuild = await observeBuild(sourceCommit);
  const secretSalt = options.mode === "run" ? await readPrivateNarratorSalt({
    requestedPath: options["secret-salt-file"],
    cwd: process.cwd(),
    repositoryRoot,
  }) : null;
  const adapterReceipt = options.mode === "run"
    ? JSON.parse(await readFile(await realpath(options["adapter-receipt"]), "utf8"))
    : null;
    const publicationReceipt = JSON.parse(await readFile(publicationReceiptPath, "utf8"));
    const artifacts = publicationReceipt.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length !== 6) throw new Error("Published model closure is invalid");
    const modelFiles = artifacts.map((artifact) => resolve(modelDirectory, artifact.path));
    const runtimeFiles = runtimeAssets.map((artifact) => artifact.file);
    for (const file of [...modelFiles, ...runtimeFiles]) {
      if (!(await stat(file)).isFile()) throw new Error(`Narrator evaluation input is not a file: ${basename(file)}`);
    }
    const server = await startServer(modelFiles, runtimeFiles);
    const browser = await chromium.launch({ headless: true });
    let context;
    try {
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
      if (adapterReceipt !== null) {
        const adapterReceiptIsValid = await page.evaluate(
          ({ value, expectedSourceCommit, observed }) => globalThis.__theGrindNarratorEvaluationV2
            .validateBuildReceipt(value, expectedSourceCommit, observed),
          { value: adapterReceipt, expectedSourceCommit: sourceCommit, observed: observedBuild },
        );
        if (!adapterReceiptIsValid) throw new Error("Narrator B2 adapter receipt is invalid or stale");
      }
      const stageRequest = {
        runId: options["run-id"],
        workerEpoch: `browser-worker:${options["run-id"]}`,
        modelArtifacts: artifacts.map((artifact, index) => ({
          path: artifact.path,
          url: `${server.origin}/__narrator_staging__/model/${index}`,
        })),
        runtimeArtifacts: runtimeAssets.map((artifact, index) => ({
          path: artifact.path,
          url: `${server.origin}/__narrator_staging__/runtime/${index}`,
        })),
      };
      const stage = await page.evaluate((request) => globalThis.__theGrindNarratorEvaluationV2.stage(request), stageRequest);
      if (externalRequests.length !== 0) throw new Error("Narrator staging attempted an external request");
      offline = true;
      await context.setOffline(true);

      if (options.mode === "smoke") {
        const smoke = await page.evaluate(() => globalThis.__theGrindNarratorEvaluationV2.smokeAfterOffline());
        if (postOfflineRequests.length !== 0) {
          const paths = postOfflineRequests.map((value) => new URL(value).pathname).join(", ");
          throw new Error(`Narrator load or inference attempted a network request: ${paths}`);
        }
        const receipt = await buildReceipt({
          sourceCommit,
          observedBuild,
          runId: options["run-id"],
          stage,
          smoke,
          browserVersion: browser.version(),
          postOfflineRequests,
        });
        const receiptIsValid = await page.evaluate(
          ({ value, expectedSourceCommit, observed }) => globalThis.__theGrindNarratorEvaluationV2
            .validateBuildReceipt(value, expectedSourceCommit, observed),
          { value: receipt, expectedSourceCommit: sourceCommit, observed: observedBuild },
        );
        if (!receiptIsValid) throw new Error("Narrator browser adapter build receipt is invalid");
        await createPrivateOutputDirectory(outputDirectory);
        const receiptPath = resolve(outputDirectory, "adapter-build-receipt.json");
        await writePrivateJsonEvidence(receiptPath, receipt);
        process.stdout.write(`${JSON.stringify({
          status: "ok",
          mode: "smoke",
          receiptPath,
          outcome: receipt.smoke.outcome,
          postOfflineRequestCount: receipt.postOfflineRequestCount,
        })}\n`);
      } else {
        const result = await page.evaluate(
          (request) => globalThis.__theGrindNarratorEvaluationV2.runAfterOffline(request),
          { sheetId: options["sheet-id"], secretSalt },
        );
        if (postOfflineRequests.length !== 0) {
          const paths = postOfflineRequests.map((value) => new URL(value).pathname).join(", ");
          throw new Error(`Narrator evaluation attempted a network request: ${paths}`);
        }
        const runPackage = await page.evaluate(
          (fields) => globalThis.__theGrindNarratorEvaluationV2.createRunPackage(fields),
          {
          sourceCommit,
          adapterBuildReceiptHash: adapterReceipt.contentHash,
          runReceiptHash: result.receipt.contentHash,
          blindSheetHash: result.sheet.contentHash,
          blindKeyHash: result.key.contentHash,
          },
        );
        await createPrivateOutputDirectory(outputDirectory);
        const evidenceSet = createNarratorFullRunEvidenceSet({
          adapterReceipt,
          runReceipt: result.receipt,
          blindSheet: result.sheet,
          blindKey: result.key,
          runPackage,
        });
        await Promise.all(evidenceSet.map(({ name, value }) =>
          writePrivateJsonEvidence(resolve(outputDirectory, name), value)));
        process.stdout.write(`${JSON.stringify({
          status: "ok",
          mode: "run",
          outputDirectory,
          runReceiptHash: result.receipt.contentHash,
          blindSheetHash: result.sheet.contentHash,
          postOfflineRequestCount: postOfflineRequests.length,
        })}\n`);
      }
    } finally {
      await context?.close();
      await browser.close();
      await server.close();
    }
}
