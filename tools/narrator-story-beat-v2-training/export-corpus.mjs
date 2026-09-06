#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  canonicalHash,
} from "../narrator-story-beat-training/export-corpus.mjs";

const sourceKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "provenance",
  "sourceCorpusHash",
  "splitPolicy",
  "holdoutPolicy",
  "counts",
  "cases",
  "corpusHash",
]);
const countKeys = Object.freeze(["train", "dev", "holdout", "total"]);
const projectedRowKeys = Object.freeze(["id", "split", "prompt", "target"]);
const exportedRowKeys = Object.freeze([
  "id",
  "split",
  "prompt",
  "target",
  "caseHash",
]);
const envelopeKeys = Object.freeze(["schemaVersion", "cases", "corpusHash"]);
const projectionKeys = Object.freeze([
  "sourceCorpusHash",
  "sourceV1CorpusHash",
  "training",
  "holdout",
]);
const supportedSplits = new Set(["train", "dev", "holdout"]);

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

function isHash(value) {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function boundedText(value, maximum) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)
    && /[\p{L}\p{N}]/u.test(value);
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

function sourcePayload(value) {
  const { corpusHash: _corpusHash, ...payload } = value;
  return payload;
}

function validateSourceCorpus(value) {
  if (!hasExactKeys(value, sourceKeys)
    || value.schemaVersion !== 2
    || value.kind !== "factual-story-beat-training-corpus"
    || value.provenance !==
      "project-authored-v1-scenes-plus-original-typed-mechanics-v2"
    || !isHash(value.sourceCorpusHash)
    || value.splitPolicy !==
      "inherits-v1-scene-disjointness-lens-and-metrics-balanced-v2"
    || value.holdoutPolicy !== "sealed-holdout-only-never-training-v2"
    || !hasExactKeys(value.counts, countKeys)
    || !Number.isSafeInteger(value.counts.train)
    || !Number.isSafeInteger(value.counts.dev)
    || !Number.isSafeInteger(value.counts.holdout)
    || !Number.isSafeInteger(value.counts.total)
    || value.counts.train <= 0
    || value.counts.dev <= 0
    || value.counts.holdout <= 0
    || value.counts.total !==
      value.counts.train + value.counts.dev + value.counts.holdout
    || !Array.isArray(value.cases)
    || value.cases.length !== value.counts.total
    || !isHash(value.corpusHash)
    || value.corpusHash !== canonicalHash(sourcePayload(value))) {
    fail("Source factual training corpus is invalid");
  }
}

function projectRow(value) {
  if (!isRecord(value)
    || !boundedText(value.id, 160)
    || !supportedSplits.has(value.split)
    || !boundedPrompt(value.prompt)
    || !boundedText(value.target, 160)) {
    fail("Factual training corpus contains an invalid projected row");
  }
  const payload = {
    id: value.id,
    split: value.split,
    prompt: value.prompt,
    target: value.target,
  };
  if (!hasExactKeys(payload, projectedRowKeys)) {
    fail("Factual projected row keys differ");
  }
  return Object.freeze({ ...payload, caseHash: canonicalHash(payload) });
}

function envelope(rows) {
  const payload = { schemaVersion: 2, cases: Object.freeze(rows) };
  return Object.freeze({ ...payload, corpusHash: canonicalHash(payload) });
}

function validateExportedRow(value, allowedSplits) {
  if (!hasExactKeys(value, exportedRowKeys)
    || !boundedText(value.id, 160)
    || !allowedSplits.has(value.split)
    || !boundedPrompt(value.prompt)
    || !boundedText(value.target, 160)
    || !isHash(value.caseHash)) return false;
  const { caseHash, ...payload } = value;
  return caseHash === canonicalHash(payload);
}

function validateEnvelope(value, allowedSplits) {
  if (!hasExactKeys(value, envelopeKeys)
    || value.schemaVersion !== 2
    || !Array.isArray(value.cases)
    || value.cases.length === 0
    || !value.cases.every((row) => validateExportedRow(row, allowedSplits))
    || new Set(value.cases.map((row) => row.id)).size !== value.cases.length
    || !isHash(value.corpusHash)) return false;
  const { corpusHash, ...payload } = value;
  return corpusHash === canonicalHash(payload);
}

function validateProjection(value) {
  if (!hasExactKeys(value, projectionKeys)
    || !isHash(value.sourceCorpusHash)
    || !isHash(value.sourceV1CorpusHash)
    || !validateEnvelope(value.training, new Set(["train", "dev"]))
    || !value.training.cases.some((row) => row.split === "train")
    || !value.training.cases.some((row) => row.split === "dev")
    || !validateEnvelope(value.holdout, new Set(["holdout"]))) {
    fail("Factual training export projection is invalid");
  }
  const trainingIds = new Set(value.training.cases.map((row) => row.id));
  if (value.holdout.cases.some((row) => trainingIds.has(row.id))) {
    fail("Factual training and sealed holdout ids overlap");
  }
}

export function projectFactualTrainingExport(sourceCorpus) {
  validateSourceCorpus(sourceCorpus);
  const rows = sourceCorpus.cases.map(projectRow);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    fail("Factual training corpus contains duplicate case ids");
  }
  const trainingRows = rows.filter(
    (row) => row.split === "train" || row.split === "dev",
  );
  const holdoutRows = rows.filter((row) => row.split === "holdout");
  if (trainingRows.length !== sourceCorpus.counts.train + sourceCorpus.counts.dev
    || holdoutRows.length !== sourceCorpus.counts.holdout
    || trainingRows.length + holdoutRows.length !== rows.length) {
    fail("Factual training corpus split closure is incomplete");
  }
  const projection = Object.freeze({
    sourceCorpusHash: sourceCorpus.corpusHash,
    sourceV1CorpusHash: sourceCorpus.sourceCorpusHash,
    training: envelope(trainingRows),
    holdout: envelope(holdoutRows),
  });
  validateProjection(projection);
  return projection;
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function writeFactualTrainingExport(outputDirectory, projection) {
  validateProjection(projection);
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
    schemaVersion: 2,
    kind: "factual-story-beat-training-export",
    disposition: "developer-only-no-admission-no-display",
    sourceCorpusHash: projection.sourceCorpusHash,
    sourceV1CorpusHash: projection.sourceV1CorpusHash,
    trainingFile,
    holdoutFile,
    modelAdmitted: false,
    displayAuthorized: false,
  };
  const manifest = Object.freeze({
    ...manifestPayload,
    contentHash: canonicalHash(manifestPayload),
  });
  await Promise.all([
    writeFile(resolve(destination, trainingFile.path), trainingText, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    }),
    writeFile(resolve(destination, holdoutFile.path), holdoutText, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    }),
    writeFile(resolve(destination, "export-manifest.json"), serialized(manifest), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    }),
  ]);
  return manifest;
}

export async function loadFactualProductionCorpus(repositoryRoot) {
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true },
  });
  try {
    const module = await server.ssrLoadModule(
      "/src/narrator/story-beat-v2-training-corpus.ts",
    );
    if (typeof module.isFactualStoryBeatTrainingCorpusV2 !== "function"
      || !module.isFactualStoryBeatTrainingCorpusV2(
        module.factualStoryBeatTrainingCorpusV2,
      )) {
      fail("Production factual story-beat corpus failed validation");
    }
    return module.factualStoryBeatTrainingCorpusV2;
  } finally {
    await server.close();
  }
}

function within(parent, child) {
  const path = relative(parent, child);
  const separator = process.platform === "win32" ? "\\" : "/";
  return path !== "" && path !== ".." && !path.startsWith(`..${separator}`);
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) {
    fail(
      "Usage: node tools/narrator-story-beat-v2-training/export-corpus.mjs "
      + "--output <ignored-fresh-directory>",
    );
  }
  return argv[1];
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "../..");
  const ignoredRoot = resolve(repositoryRoot, ".narrator-t5-rebuild");
  const outputDirectory = resolve(
    repositoryRoot,
    parseArguments(process.argv.slice(2)),
  );
  const realRepositoryRoot = await realpath(repositoryRoot);
  const realIgnoredParent = await realpath(ignoredRoot);
  const realOutputParent = await realpath(dirname(outputDirectory));
  if (realIgnoredParent !== resolve(realRepositoryRoot, ".narrator-t5-rebuild")) {
    fail("Ignored training root must not traverse a symlink");
  }
  if ((realOutputParent !== realIgnoredParent
      && !within(realIgnoredParent, realOutputParent))
    || outputDirectory !== resolve(realOutputParent, basename(outputDirectory))) {
    fail("Factual training exports must stay beneath .narrator-t5-rebuild");
  }
  const corpus = await loadFactualProductionCorpus(realRepositoryRoot);
  const manifest = await writeFactualTrainingExport(
    outputDirectory,
    projectFactualTrainingExport(corpus),
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
