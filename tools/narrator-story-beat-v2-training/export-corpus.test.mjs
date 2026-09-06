import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import {
  canonicalHash,
} from "../narrator-story-beat-training/export-corpus.mjs";
import {
  loadFactualProductionCorpus,
  projectFactualTrainingExport,
  writeFactualTrainingExport,
} from "./export-corpus.mjs";

function sourceFixture() {
  const cases = [
    {
      id: "factual:train:0",
      split: "train",
      prompt: 'Instruction.\nPLACE: "Train Gate"\nBEAT:',
      target: "At Train Gate, the bell turns.",
    },
    {
      id: "factual:dev:0",
      split: "dev",
      prompt: 'Instruction.\nPLACE: "Dev Gate"\nBEAT:',
      target: "At Dev Gate, the bell turns.",
    },
    {
      id: "factual:holdout:0",
      split: "holdout",
      prompt: 'Instruction.\nPLACE: "Holdout Gate"\nBEAT:',
      target: "At Holdout Gate, the bell turns.",
    },
  ];
  const payload = {
    schemaVersion: 2,
    kind: "factual-story-beat-training-corpus",
    provenance: "project-authored-v1-scenes-plus-original-typed-mechanics-v2",
    sourceCorpusHash: "2e44430246056927",
    splitPolicy: "inherits-v1-scene-disjointness-lens-and-metrics-balanced-v2",
    holdoutPolicy: "sealed-holdout-only-never-training-v2",
    counts: { train: 1, dev: 1, holdout: 1, total: 3 },
    cases,
  };
  return { ...payload, corpusHash: canonicalHash(payload) };
}

function rehashSource(value) {
  const payload = { ...value };
  delete payload.corpusHash;
  return { ...payload, corpusHash: canonicalHash(payload) };
}

test("projects deterministic V2 train/dev and separately sealed holdout envelopes", () => {
  const first = projectFactualTrainingExport(sourceFixture());
  const second = projectFactualTrainingExport(structuredClone(sourceFixture()));
  assert.deepEqual(first, second);
  assert.equal(first.sourceCorpusHash, sourceFixture().corpusHash);
  assert.equal(first.sourceV1CorpusHash, "2e44430246056927");
  assert.equal(first.training.schemaVersion, 2);
  assert.equal(first.holdout.schemaVersion, 2);
  assert.deepEqual(
    first.training.cases.map((row) => row.split),
    ["train", "dev"],
  );
  assert.deepEqual(first.holdout.cases.map((row) => row.split), ["holdout"]);
  for (const row of [...first.training.cases, ...first.holdout.cases]) {
    const { caseHash, ...payload } = row;
    assert.equal(caseHash, canonicalHash(payload));
    assert.deepEqual(Object.keys(payload), ["id", "split", "prompt", "target"]);
  }
  const { corpusHash, ...trainingPayload } = first.training;
  assert.equal(corpusHash, canonicalHash(trainingPayload));
});

test("rejects forged sources, malformed rows, duplicate ids, and split drift", () => {
  assert.throws(
    () => projectFactualTrainingExport({
      ...sourceFixture(),
      corpusHash: "0".repeat(16),
    }),
    /source factual training corpus is invalid/iu,
  );
  assert.throws(
    () => projectFactualTrainingExport(rehashSource({
      ...sourceFixture(),
      sourceCorpusHash: "bad",
    })),
    /source factual training corpus is invalid/iu,
  );
  assert.throws(
    () => projectFactualTrainingExport(rehashSource({
      ...sourceFixture(),
      cases: sourceFixture().cases.map((row, index) =>
        index === 1 ? { ...row, prompt: "bad\rtext" } : row
      ),
    })),
    /invalid projected row/iu,
  );
  assert.throws(
    () => projectFactualTrainingExport(rehashSource({
      ...sourceFixture(),
      cases: sourceFixture().cases.map((row, index) =>
        index === 2 ? { ...row, id: "factual:train:0" } : row
      ),
    })),
    /duplicate case ids/iu,
  );
  assert.throws(
    () => projectFactualTrainingExport(rehashSource({
      ...sourceFixture(),
      cases: sourceFixture().cases.map((row, index) =>
        index === 1 ? { ...row, split: "holdout" } : row
      ),
    })),
    /split closure/iu,
  );
  assert.throws(
    () => projectFactualTrainingExport(rehashSource({
      ...sourceFixture(),
      cases: sourceFixture().cases.map((row, index) =>
        index === 1 ? { ...row, split: "test" } : row
      ),
    })),
    /invalid projected row/iu,
  );
});

test("writes a fresh private V2 closure with matching hashes and authority false", async () => {
  const parent = await mkdtemp(join(tmpdir(), "grind2-factual-beat-export-"));
  const destination = join(parent, "first");
  const projection = projectFactualTrainingExport(sourceFixture());
  const manifest = await writeFactualTrainingExport(destination, projection);
  const training = await readFile(join(destination, "train-dev.json"), "utf8");
  const holdout = await readFile(
    join(destination, "sealed-holdout.json"),
    "utf8",
  );
  const manifestText = await readFile(
    join(destination, "export-manifest.json"),
    "utf8",
  );
  const writtenManifest = JSON.parse(manifestText);
  assert.equal(Buffer.byteLength(training), manifest.trainingFile.byteLength);
  assert.equal(Buffer.byteLength(holdout), manifest.holdoutFile.byteLength);
  assert.deepEqual(writtenManifest, manifest);
  const { contentHash, ...payload } = writtenManifest;
  assert.equal(contentHash, canonicalHash(payload));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.kind, "factual-story-beat-training-export");
  assert.equal(manifest.modelAdmitted, false);
  assert.equal(manifest.displayAuthorized, false);
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
  for (const name of [
    "train-dev.json",
    "sealed-holdout.json",
    "export-manifest.json",
  ]) {
    assert.equal((await stat(join(destination, name))).mode & 0o777, 0o600);
  }
  await assert.rejects(
    () => writeFactualTrainingExport(destination, projection),
    /exist/iu,
  );
  await assert.rejects(
    () => writeFactualTrainingExport(join(parent, "forged"), {
      ...projection,
      sourceCorpusHash: "bad",
    }),
    /projection is invalid/iu,
  );
  const sourceRow = projection.training.cases[0];
  const holdoutRowPayload = {
    ...projection.holdout.cases[0],
    id: sourceRow.id,
  };
  delete holdoutRowPayload.caseHash;
  const holdoutRow = {
    ...holdoutRowPayload,
    caseHash: canonicalHash(holdoutRowPayload),
  };
  const holdoutPayload = { schemaVersion: 2, cases: [holdoutRow] };
  await assert.rejects(
    () => writeFactualTrainingExport(join(parent, "overlap"), {
      ...projection,
      holdout: {
        ...holdoutPayload,
        corpusHash: canonicalHash(holdoutPayload),
      },
    }),
    /ids overlap/iu,
  );
});

test("loads and independently validates the committed production V2 corpus", async () => {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "../..");
  const corpus = await loadFactualProductionCorpus(repositoryRoot);
  assert.equal(corpus.corpusHash, "d66b901b71c4613a");
  assert.deepEqual(corpus.counts, {
    train: 1_000,
    dev: 128,
    holdout: 200,
    total: 1_328,
  });
  const projection = projectFactualTrainingExport(corpus);
  assert.equal(projection.training.cases.length, 1_128);
  assert.equal(projection.holdout.cases.length, 200);
  assert.equal(
    projection.training.cases.some((row) => row.split === "holdout"),
    false,
  );
  assert.equal(
    projection.holdout.cases.every((row) => row.split === "holdout"),
    true,
  );
});
