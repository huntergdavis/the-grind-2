#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const exactRowKeys = Object.freeze(["id", "split", "prompt", "target"]);
const supportedSplits = new Set(["train", "dev", "holdout"]);

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
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

function projectRow(value) {
  if (
    !isRecord(value)
    || !boundedText(value.id, 160)
    || !supportedSplits.has(value.split)
    || !boundedPrompt(value.prompt)
    || !boundedText(value.target, 160)
  ) fail("Training corpus contains an invalid projected row");
  const payload = {
    id: value.id,
    split: value.split,
    prompt: value.prompt,
    target: value.target,
  };
  if (!hasExactKeys(payload, exactRowKeys)) fail("Projected row keys differ");
  return Object.freeze({ ...payload, caseHash: canonicalHash(payload) });
}

function envelope(rows) {
  const payload = { schemaVersion: 1, cases: Object.freeze(rows) };
  return Object.freeze({ ...payload, corpusHash: canonicalHash(payload) });
}

export function projectTrainingExport(sourceCorpus) {
  if (
    !isRecord(sourceCorpus)
    || typeof sourceCorpus.corpusHash !== "string"
    || !/^[0-9a-f]{16}$/u.test(sourceCorpus.corpusHash)
    || !Array.isArray(sourceCorpus.cases)
    || sourceCorpus.cases.length === 0
  ) fail("Source training corpus is invalid");
  const rows = sourceCorpus.cases.map(projectRow);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    fail("Training corpus contains duplicate case ids");
  }
  const trainingRows = rows.filter((row) => row.split === "train" || row.split === "dev");
  const holdoutRows = rows.filter((row) => row.split === "holdout");
  if (
    trainingRows.length === 0
    || !trainingRows.some((row) => row.split === "train")
    || !trainingRows.some((row) => row.split === "dev")
    || holdoutRows.length === 0
    || trainingRows.length + holdoutRows.length !== rows.length
  ) fail("Training corpus split closure is incomplete");
  return Object.freeze({
    sourceCorpusHash: sourceCorpus.corpusHash,
    training: envelope(trainingRows),
    holdout: envelope(holdoutRows),
  });
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function within(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

export async function writeTrainingExport(outputDirectory, projection) {
  const destination = resolve(outputDirectory);
  await mkdir(destination, { recursive: false, mode: 0o700 });
  const trainingText = serialized(projection.training);
  const holdoutText = serialized(projection.holdout);
  const trainingFile = {
    path: "train-dev.json",
    byteLength: Buffer.byteLength(trainingText),
    sha256: sha256(trainingText),
    corpusHash: projection.training.corpusHash,
    caseCount: projection.training.cases.length,
  };
  const holdoutFile = {
    path: "sealed-holdout.json",
    byteLength: Buffer.byteLength(holdoutText),
    sha256: sha256(holdoutText),
    corpusHash: projection.holdout.corpusHash,
    caseCount: projection.holdout.cases.length,
  };
  const manifestPayload = {
    schemaVersion: 1,
    kind: "story-beat-training-export",
    sourceCorpusHash: projection.sourceCorpusHash,
    trainingFile,
    holdoutFile,
  };
  const manifest = { ...manifestPayload, contentHash: canonicalHash(manifestPayload) };
  await Promise.all([
    writeFile(resolve(destination, trainingFile.path), trainingText, { encoding: "utf8", flag: "wx", mode: 0o600 }),
    writeFile(resolve(destination, holdoutFile.path), holdoutText, { encoding: "utf8", flag: "wx", mode: 0o600 }),
    writeFile(resolve(destination, "export-manifest.json"), serialized(manifest), { encoding: "utf8", flag: "wx", mode: 0o600 }),
  ]);
  return Object.freeze(manifest);
}

async function loadProductionCorpus(repositoryRoot) {
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const module = await server.ssrLoadModule("/src/narrator/story-beat-training-corpus.ts");
    if (
      typeof module.isStoryBeatTrainingCorpusV1 !== "function"
      || !module.isStoryBeatTrainingCorpusV1(module.storyBeatTrainingCorpusV1)
    ) fail("Production story-beat training corpus failed validation");
    return module.storyBeatTrainingCorpusV1;
  } finally {
    await server.close();
  }
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) {
    fail("Usage: node export-corpus.mjs --output <ignored-fresh-directory>");
  }
  return argv[1];
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "../..");
  const ignoredRoot = resolve(repositoryRoot, ".narrator-t5-rebuild");
  const outputDirectory = resolve(repositoryRoot, parseArguments(process.argv.slice(2)));
  const realRepositoryRoot = await realpath(repositoryRoot);
  const realIgnoredParent = await realpath(ignoredRoot);
  const realOutputParent = await realpath(dirname(outputDirectory));
  if (realIgnoredParent !== resolve(realRepositoryRoot, ".narrator-t5-rebuild")) {
    fail("Ignored training root must not traverse a symlink");
  }
  if (
    (realOutputParent !== realIgnoredParent && !within(realIgnoredParent, realOutputParent))
    || outputDirectory !== resolve(realOutputParent, basename(outputDirectory))
  ) {
    fail("Training exports must stay beneath .narrator-t5-rebuild");
  }
  const corpus = await loadProductionCorpus(realRepositoryRoot);
  const manifest = await writeTrainingExport(outputDirectory, projectTrainingExport(corpus));
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
