import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import {
  canonicalHash,
  canonicalStringify,
  projectTrainingExport,
  writeTrainingExport,
} from "./export-corpus.mjs";

function fixture() {
  return {
    corpusHash: "1234567890abcdef",
    cases: [
      { id: "train:0", split: "train", prompt: "Instruction.\nPLACE: \"Train Gate\"\nBEAT:", target: "At Train Gate, the bell turns." },
      { id: "dev:0", split: "dev", prompt: "Instruction.\nPLACE: \"Dev Gate\"\nBEAT:", target: "At Dev Gate, the bell turns." },
      { id: "holdout:0", split: "holdout", prompt: "Instruction.\nPLACE: \"Holdout Gate\"\nBEAT:", target: "At Holdout Gate, the bell turns." },
    ],
  };
}

test("canonical hashing matches the repository algorithm", () => {
  assert.equal(canonicalStringify({ z: 2, a: ["é", true] }), '{"a":["é",true],"z":2}');
  assert.equal(canonicalHash({ z: 2, a: ["é", true] }), "9308d5cbedeb1b37");
  assert.throws(() => canonicalHash({ unsafe: 1.5 }), /safe integers/u);
});

test("projects deterministic train/dev and separately sealed holdout envelopes", () => {
  const first = projectTrainingExport(fixture());
  const second = projectTrainingExport(structuredClone(fixture()));
  assert.deepEqual(first, second);
  assert.deepEqual(first.training.cases.map((row) => row.split), ["train", "dev"]);
  assert.deepEqual(first.holdout.cases.map((row) => row.split), ["holdout"]);
  for (const row of [...first.training.cases, ...first.holdout.cases]) {
    const { caseHash, ...payload } = row;
    assert.equal(caseHash, canonicalHash(payload));
    assert.deepEqual(Object.keys(payload), ["id", "split", "prompt", "target"]);
  }
  const { corpusHash, ...trainingPayload } = first.training;
  assert.equal(corpusHash, canonicalHash(trainingPayload));
  assert.equal(first.sourceCorpusHash, fixture().corpusHash);
});

test("rejects malformed rows, duplicate ids, missing splits, and control text", () => {
  assert.throws(() => projectTrainingExport({ ...fixture(), corpusHash: "bad" }), /invalid/u);
  assert.throws(() => projectTrainingExport({ ...fixture(), cases: fixture().cases.slice(0, 2) }), /split closure/u);
  assert.throws(() => projectTrainingExport({
    ...fixture(),
    cases: fixture().cases.map((row, index) => index === 2 ? { ...row, id: "train:0" } : row),
  }), /duplicate/u);
  assert.throws(() => projectTrainingExport({
    ...fixture(),
    cases: fixture().cases.map((row, index) => index === 1 ? { ...row, prompt: "bad\rtext" } : row),
  }), /invalid projected row/u);
  assert.throws(() => projectTrainingExport({
    ...fixture(),
    cases: fixture().cases.map((row, index) => index === 1 ? { ...row, split: "test" } : row),
  }), /invalid projected row/u);
});

test("writes a fresh private closure with matching SHA and content hashes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "grind2-story-beat-export-"));
  const destination = join(parent, "first");
  const projection = projectTrainingExport(fixture());
  const manifest = await writeTrainingExport(destination, projection);
  const training = await readFile(join(destination, "train-dev.json"), "utf8");
  const holdout = await readFile(join(destination, "sealed-holdout.json"), "utf8");
  const writtenManifest = JSON.parse(await readFile(join(destination, "export-manifest.json"), "utf8"));
  assert.equal(Buffer.byteLength(training), manifest.trainingFile.byteLength);
  assert.equal(Buffer.byteLength(holdout), manifest.holdoutFile.byteLength);
  assert.deepEqual(writtenManifest, manifest);
  const { contentHash, ...payload } = writtenManifest;
  assert.equal(contentHash, canonicalHash(payload));
  await assert.rejects(() => writeTrainingExport(destination, projection), /exist/u);
});
