import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  canonicalHash,
  canonicalStringify,
  generationContract,
  loadProductionContracts,
  manifestModelDirectory,
  modelTreeHash,
  parseJsonStrict,
  projectProductionHoldout,
  requiredHoldoutCases,
  selectHoldoutRows,
  sha256Bytes,
  sha256Text,
  validateHeldoutEvaluation,
  validateSealedHoldout,
} from "./validate-evaluation.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");
const contractsPromise = loadProductionContracts(repositoryRoot);
const execFileAsync = promisify(execFile);

function rowPayload(row) {
  const { rowHash: _rowHash, ...payload } = row;
  return payload;
}

function resealRow(row) {
  row.outputSha256 = sha256Text(row.output);
  row.rowHash = canonicalHash(rowPayload(row));
}

function resealEvidence(results) {
  const { contentHash: _contentHash, ...payload } = results;
  results.contentHash = canonicalHash(payload);
}

async function fixture(count = 3) {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const root = await mkdtemp(join(tmpdir(), "grind2-story-beat-heldout-"));
  const holdoutPath = join(root, "sealed-holdout.json");
  const holdoutBytes = Buffer.from(`${JSON.stringify(holdout, null, 2)}\n`, "utf8");
  await writeFile(holdoutPath, holdoutBytes);

  const modelPath = join(root, "checkpoint");
  await mkdir(modelPath);
  await Promise.all([
    writeFile(join(modelPath, "config.json"), '{"is_encoder_decoder":true}\n'),
    writeFile(join(modelPath, "tokenizer.json"), '{"version":"fixture"}\n'),
    writeFile(join(modelPath, "model.safetensors"), Buffer.from("safe fixture weights")),
  ]);
  const modelFiles = await manifestModelDirectory(modelPath);
  const model = {
    path: modelPath,
    treeSha256: modelTreeHash(modelFiles),
    files: modelFiles,
  };
  const { selected, receipt } = selectHoldoutRows(holdout, count);
  const rows = selected.map((entry, ordinal) => {
    const payload = {
      ordinal,
      sourceOrdinal: entry.sourceOrdinal,
      id: entry.row.id,
      caseHash: entry.row.caseHash,
      selectionRankHash: entry.rankHash,
      promptSha256: sha256Text(entry.row.prompt),
      referenceTargetSha256: sha256Text(entry.row.target),
      inputTokenCount: 40,
      generatedTokenCount: 20,
      output: entry.row.target,
      outputSha256: sha256Text(entry.row.target),
      elapsedMicroseconds: ordinal + 100,
    };
    return { ...payload, rowHash: canonicalHash(payload) };
  });
  const payload = {
    schemaVersion: 1,
    kind: "story-beat-heldout-generation",
    disposition: "developer-evidence-not-runtime-admitted",
    contract: generationContract(),
    model,
    holdout: {
      path: holdoutPath,
      schemaVersion: 1,
      corpusHash: holdout.corpusHash,
      fileSha256: sha256Bytes(holdoutBytes),
      caseCount: requiredHoldoutCases,
    },
    selection: receipt,
    rows,
    summary: {
      rowCount: rows.length,
      totalElapsedMicroseconds: rows.reduce(
        (total, row) => total + row.elapsedMicroseconds,
        0,
      ),
    },
    modelAdmitted: false,
    displayAuthorized: false,
  };
  return {
    contracts,
    holdout,
    holdoutPath,
    holdoutBytes,
    model,
    results: { ...payload, contentHash: canonicalHash(payload) },
  };
}

function validateFixture(value) {
  return validateHeldoutEvaluation({
    results: value.results,
    resultsFileSha256: "f".repeat(64),
    holdout: value.holdout,
    holdoutPath: value.holdoutPath,
    holdoutFileSha256: sha256Bytes(value.holdoutBytes),
    ...value.contracts,
    model: value.model,
  });
}

test("canonical hashes and strict JSON parsing match the cross-language contract", () => {
  assert.equal(canonicalStringify({ z: 2, a: ["é", true] }), '{"a":["é",true],"z":2}');
  assert.equal(canonicalHash({ z: 2, a: ["é", true] }), "9308d5cbedeb1b37");
  assert.deepEqual(
    parseJsonStrict(Buffer.from('{"outer":{"a":1},"rows":[true,null]}')),
    { outer: { a: 1 }, rows: [true, null] },
  );
  assert.throws(
    () => parseJsonStrict(Buffer.from('{"outer":{"a":1,"a":2}}')),
    /duplicate JSON key/u,
  );
  assert.throws(
    () => parseJsonStrict(Buffer.from('{"elapsed":NaN}')),
    /invalid JSON/u,
  );
});

test("the sealed file is the exact committed 200-case holdout projection", async () => {
  const { productionCorpus } = await contractsPromise;
  const holdout = projectProductionHoldout(productionCorpus);
  assert.equal(holdout.cases.length, 200);
  assert.equal(validateSealedHoldout(holdout, productionCorpus), holdout);
  const first = selectHoldoutRows(holdout, 9);
  const second = selectHoldoutRows(structuredClone(holdout), 9);
  assert.deepEqual(first, second);
  assert.equal(selectHoldoutRows(holdout, 200).selected.length, 200);

  const contaminated = structuredClone(holdout);
  contaminated.cases[0].split = "train";
  const { caseHash: _caseHash, ...casePayload } = contaminated.cases[0];
  contaminated.cases[0].caseHash = canonicalHash(casePayload);
  contaminated.corpusHash = canonicalHash({
    schemaVersion: contaminated.schemaVersion,
    cases: contaminated.cases,
  });
  assert.throws(
    () => validateSealedHoldout(contaminated, productionCorpus),
    /train\/dev/u,
  );

  const rewritten = structuredClone(holdout);
  rewritten.cases[0].target = `${rewritten.cases[0].target.slice(0, -1)} now.`;
  const { caseHash: _rewrittenHash, ...rewrittenPayload } = rewritten.cases[0];
  rewritten.cases[0].caseHash = canonicalHash(rewrittenPayload);
  rewritten.corpusHash = canonicalHash({
    schemaVersion: rewritten.schemaVersion,
    cases: rewritten.cases,
  });
  assert.throws(
    () => validateSealedHoldout(rewritten, productionCorpus),
    /committed production projection/u,
  );
});

test("validates hash-bound outputs with production facts and reports quality metrics", async () => {
  const value = await fixture(5);
  const report = validateFixture(value);
  assert.equal(report.integrityAccepted, true);
  assert.equal(report.fullEvaluation, false);
  assert.equal(report.metrics.rowCount, 5);
  assert.equal(report.metrics.firstPassValidCount, 5);
  assert.equal(report.metrics.firstPassValidityBasisPoints, 10_000);
  assert.equal(report.metrics.referenceTargetCopyCount, 5);
  assert.equal(report.metrics.uniqueOutputCount, 5);
  assert.ok(report.metrics.delexicalizedShapeCount >= 1);
  assert.ok(report.metrics.maximumShapeFrequency >= 1);
  assert.equal(report.modelAdmitted, false);
  assert.equal(report.displayAuthorized, false);
  const { contentHash, ...payload } = report;
  assert.equal(contentHash, canonicalHash(payload));
});

test("marks the complete deterministic 200-row selection as a full evaluation", async () => {
  const value = await fixture(requiredHoldoutCases);
  const report = validateFixture(value);
  assert.equal(report.fullEvaluation, true);
  assert.equal(report.metrics.rowCount, 200);
  assert.equal(report.metrics.firstPassValidCount, 200);
  assert.equal(report.metrics.firstPassValidityBasisPoints, 10_000);
});

test("accepts evidence authored by the Python contract without importing ML", async () => {
  const value = await fixture(4);
  const evaluatorPath = join(testDirectory, "evaluate.py");
  const source = [
    "import importlib.util,json,pathlib,sys",
    "spec=importlib.util.spec_from_file_location('heldout_eval',sys.argv[1])",
    "module=importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "holdout_path=pathlib.Path(sys.argv[2])",
    "model_path=pathlib.Path(sys.argv[3])",
    "holdout=module.load_holdout(holdout_path)",
    "files=module.validate_model(model_path)",
    "selected,selection=module.select_cases(holdout,4)",
    "rows=[module.make_result_row(ordinal=i,source_ordinal=s,case=c,rank_hash=r,input_token_count=40,generated_token_count=20,output=c['target'],elapsed_microseconds=100+i) for i,(s,c,r) in enumerate(selected)]",
    "evidence=module.build_evidence(model=model_path,model_files=files,holdout_path=holdout_path,holdout=holdout,selection=selection,rows=rows)",
    "print(json.dumps(evidence,ensure_ascii=False,allow_nan=False,separators=(',',':'),sort_keys=True))",
  ].join(";");
  const { stdout, stderr } = await execFileAsync(
    "python3",
    ["-c", source, evaluatorPath, value.holdoutPath, value.model.path],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(stderr, "");
  value.results = parseJsonStrict(Buffer.from(stdout, "utf8"), "Python evaluation evidence");
  const report = validateFixture(value);
  assert.equal(report.metrics.rowCount, 4);
  assert.equal(report.metrics.firstPassValidCount, 4);
  assert.equal(report.modelTreeSha256, value.model.treeSha256);
});

test("reports unknown claims, prompt echo, fallback copies, and invalid first passes", async () => {
  const value = await fixture(3);
  const selected = selectHoldoutRows(value.holdout, 3).selected;
  const productionById = new Map(
    value.contracts.productionCorpus.cases.map((entry) => [entry.id, entry]),
  );
  const firstFacts = productionById.get(selected[0].row.id).facts;
  const secondFacts = productionById.get(selected[1].row.id).facts;
  const thirdFacts = productionById.get(selected[2].row.id).facts;
  value.results.rows[0].output = value.contracts.deterministicFallback(firstFacts);
  value.results.rows[1].output = `PLACE: ${secondFacts.location}.`;
  value.results.rows[2].output = `At ${thirdFacts.location}, dragons arrive.`;
  value.results.rows.forEach(resealRow);
  resealEvidence(value.results);

  const report = validateFixture(value);
  assert.equal(report.metrics.firstPassValidCount, 0);
  assert.equal(report.metrics.firstPassInvalidCount, 3);
  assert.equal(report.metrics.promptEchoOutputCount, 1);
  assert.equal(report.metrics.fallbackCopyCount, 1);
  assert.equal(report.metrics.exactFieldOrFallbackCopyCount, 1);
  assert.ok(report.metrics.unknownWordOutputCount >= 2);
  assert.ok(report.metrics.unknownCapitalizedWordOutputCount >= 1);
  assert.equal(report.metrics.referenceTargetCopyCount, 0);
});

test("fails closed on extra keys, token/timing overflow, output drift, and model drift", async () => {
  const extra = await fixture();
  extra.results.authority = true;
  resealEvidence(extra.results);
  assert.throws(() => validateFixture(extra), /evidence keys differ/u);

  const overbudget = await fixture();
  overbudget.results.rows[0].generatedTokenCount = 49;
  resealRow(overbudget.results.rows[0]);
  resealEvidence(overbudget.results);
  assert.throws(() => validateFixture(overbudget), /0\.\.48/u);

  const nonfinite = await fixture();
  nonfinite.results.rows[0].elapsedMicroseconds = Number.POSITIVE_INFINITY;
  assert.throws(() => validateFixture(nonfinite), /safe integer/u);

  const outputDrift = await fixture();
  outputDrift.results.rows[0].output = "Changed without its SHA.";
  outputDrift.results.rows[0].rowHash = canonicalHash(rowPayload(outputDrift.results.rows[0]));
  resealEvidence(outputDrift.results);
  assert.throws(() => validateFixture(outputDrift), /outputSha256 differs/u);

  const modelDrift = await fixture();
  modelDrift.model = structuredClone(modelDrift.model);
  modelDrift.model.files[0].sha256 = "0".repeat(64);
  modelDrift.model.treeSha256 = modelTreeHash(modelDrift.model.files);
  assert.throws(() => validateFixture(modelDrift), /model closure differs/u);
});

test("model manifest rejects pickle weights and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "grind2-story-beat-model-"));
  const model = join(root, "checkpoint");
  await mkdir(model);
  await Promise.all([
    writeFile(join(model, "config.json"), "{}"),
    writeFile(join(model, "tokenizer.json"), "{}"),
    writeFile(join(model, "model.safetensors"), "safe"),
    writeFile(join(model, "weights.bin"), "pickle"),
  ]);
  await assert.rejects(() => manifestModelDirectory(model), /pickle/u);

  const clean = join(root, "clean");
  await mkdir(clean);
  await Promise.all([
    writeFile(join(clean, "config.json"), "{}"),
    writeFile(join(clean, "tokenizer.json"), "{}"),
    writeFile(join(clean, "model.safetensors"), "safe"),
  ]);
  const nested = join(clean, "nested");
  await mkdir(nested);
  const { symlink } = await import("node:fs/promises");
  await symlink(join(clean, "config.json"), join(nested, "linked.json"));
  await assert.rejects(() => manifestModelDirectory(clean), /symlink/u);
});
