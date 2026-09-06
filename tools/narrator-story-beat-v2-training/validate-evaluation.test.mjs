import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluationSchemaVersion,
  evaluationSeed,
  generationContract,
  groundedValidationReportKind,
  loadProductionContracts,
  maximumInputTokens,
  maximumNewTokens,
  parseArguments,
  projectProductionHoldout,
  qualityRequirements,
  requiredHoldoutCases,
  selectHoldoutRows,
  validateHeldoutEvaluation,
  validateSealedHoldout,
} from "./validate-evaluation.mjs";
import {
  groundedGenerationContract,
  parseArguments as parseGroundedArguments,
} from "./validate-grounded-evaluation.mjs";
import {
  canonicalHash,
  canonicalStringify,
  manifestModelDirectory,
  modelTreeHash,
  sha256Bytes,
  sha256Text,
} from "../narrator-story-beat-training/validate-evaluation.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "../..");
const evaluatorPath = resolve(testDirectory, "evaluate.py");
const groundedEvaluatorPath = resolve(testDirectory, "evaluate_grounded.py");
const contractsPromise = loadProductionContracts(repositoryRoot);

function fileEntry(path, bytes) {
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  };
}

function fixtureModel(path = "/tmp/factual-v2-checkpoint") {
  const files = [
    fileEntry("config.json", Buffer.from("{}\n")),
    fileEntry("model.safetensors", Buffer.from("safe factual weights")),
    fileEntry("tokenizer.json", Buffer.from("{}\n")),
  ].sort((left, right) => left.path.localeCompare(right.path));
  return { path, files, treeSha256: modelTreeHash(files) };
}

function rowPayload(row) {
  const { rowHash: _rowHash, ...payload } = row;
  return payload;
}

function evidencePayload(evidence) {
  const { contentHash: _contentHash, ...payload } = evidence;
  return payload;
}

function resealRow(row) {
  row.outputSha256 = sha256Text(row.output);
  row.rowHash = canonicalHash(rowPayload(row));
}

function resealEvidence(evidence) {
  evidence.contentHash = canonicalHash(evidencePayload(evidence));
}

function makeEvidence({
  holdout,
  count,
  model = fixtureModel(),
  outputFor = (entry) => entry.row.target,
  holdoutPath = "/tmp/factual-v2-sealed-holdout.json",
  holdoutFileSha256 = "a".repeat(64),
  contract = generationContract(),
}) {
  const selection = selectHoldoutRows(holdout, count);
  const rows = selection.selected.map((entry, ordinal) => {
    const payload = {
      ordinal,
      sourceOrdinal: entry.sourceOrdinal,
      id: entry.row.id,
      caseHash: entry.row.caseHash,
      selectionRankHash: entry.rankHash,
      promptSha256: sha256Text(entry.row.prompt),
      referenceTargetSha256: sha256Text(entry.row.target),
      inputTokenCount: 200,
      generatedTokenCount: 24,
      output: outputFor(entry, ordinal),
      outputSha256: "",
      elapsedMicroseconds: 100 + ordinal,
    };
    payload.outputSha256 = sha256Text(payload.output);
    return { ...payload, rowHash: canonicalHash(payload) };
  });
  const payload = {
    schemaVersion: evaluationSchemaVersion,
    kind: "story-beat-heldout-generation",
    disposition: "developer-evidence-not-runtime-admitted",
    contract,
    model,
    holdout: {
      path: holdoutPath,
      schemaVersion: evaluationSchemaVersion,
      corpusHash: holdout.corpusHash,
      fileSha256: holdoutFileSha256,
      caseCount: requiredHoldoutCases,
    },
    selection: selection.receipt,
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
  return { ...payload, contentHash: canonicalHash(payload) };
}

function validateFixture({
  evidence,
  holdout,
  contracts,
  model = evidence.model,
  holdoutPath = evidence.holdout.path,
  holdoutFileSha256 = evidence.holdout.fileSha256,
  expectedGenerationContract,
  reportKind,
}) {
  return validateHeldoutEvaluation({
    results: evidence,
    resultsFileSha256: "b".repeat(64),
    holdout,
    holdoutPath,
    holdoutFileSha256,
    ...contracts,
    model,
    expectedGenerationContract,
    reportKind,
  });
}

test("locks the unconstrained V2 evidence and quality contracts", () => {
  assert.equal(evaluationSchemaVersion, 2);
  assert.equal(evaluationSeed, 20260906);
  assert.equal(requiredHoldoutCases, 200);
  assert.equal(maximumInputTokens, 384);
  assert.equal(maximumNewTokens, 48);
  assert.deepEqual(generationContract(), {
    seed: 20260906,
    device: "cpu",
    dtype: "float32",
    offline: true,
    deterministicAlgorithms: true,
    intraopThreads: 4,
    interopThreads: 1,
    maximumInputTokens: 384,
    maximumNewTokens: 48,
    doSample: false,
    numBeams: 1,
    numReturnSequences: 1,
    cleanUpTokenizationSpaces: false,
    groundingConstraint: "none-unconstrained-pass-through-v2",
    presentationSequence: "model-greedy-unforced-v2",
    targetTokenization: "sealed-reference-never-tokenized-v2",
    exactTopScoreTiePolicy: "transformers-greedy-default-v2",
    returnDictInGenerate: false,
    minLength: 0,
    minNewTokens: 0,
    repetitionPenalty: 1,
    noRepeatNgramSize: 0,
    encoderNoRepeatNgramSize: 0,
    badWordsIds: null,
    forceWordsIds: null,
    forcedBosTokenId: null,
    forcedEosTokenId: null,
    suppressTokens: null,
    beginSuppressTokens: null,
    guidanceScale: null,
    decoderStartTokenId: 0,
    padTokenId: 0,
    eosTokenId: 1,
  });
  assert.deepEqual(qualityRequirements, {
    minimumFirstPassValidCount: 198,
    requiredClauseCompleteCount: 200,
    exactPlaceCount: 200,
    maximumUnknownWordOutputCount: 0,
    maximumUnknownCapitalizedWordOutputCount: 0,
    maximumUnknownNumericClaimOutputCount: 0,
    maximumPromptEchoOutputCount: 0,
    maximumFallbackCopyCount: 0,
    minimumUniqueOutputCount: 198,
    minimumDelexicalizedShapeCount: 6,
    maximumShapeFrequency: 60,
  });
});

test("locks the cross-language grounded contract and its exact CLI", () => {
  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('grounded_v2_contract',sys.argv[1])",
    "module=importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "print(json.dumps(module.generation_contract(),separators=(',',':'),sort_keys=True))",
  ].join(";");
  const execution = spawnSync(
    "python3",
    ["-c", script, groundedEvaluatorPath],
    {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(
    JSON.parse(execution.stdout),
    groundedGenerationContract(),
  );
  const required = [
    "--holdout",
    "holdout.json",
    "--results",
    "results.json",
    "--model",
    "checkpoint",
  ];
  assert.deepEqual(parseGroundedArguments(required), {
    "--holdout": "holdout.json",
    "--results": "results.json",
    "--model": "checkpoint",
  });
  assert.deepEqual(
    parseGroundedArguments([...required, "--report", "report.json"]),
    {
      "--holdout": "holdout.json",
      "--results": "results.json",
      "--model": "checkpoint",
      "--report": "report.json",
    },
  );
  assert.throws(
    () => parseGroundedArguments([...required, "--model", "again"]),
    /invalid/u,
  );
});

test("keeps raw and grounded evidence identities disjoint", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const rawEvidence = makeEvidence({ holdout, count: 200 });
  const groundedEvidence = makeEvidence({
    holdout,
    count: 200,
    contract: groundedGenerationContract(),
  });
  assert.throws(
    () => validateFixture({
      evidence: groundedEvidence,
      holdout,
      contracts,
    }),
    /generation contract/u,
  );
  assert.throws(
    () => validateFixture({
      evidence: rawEvidence,
      holdout,
      contracts,
      expectedGenerationContract: groundedGenerationContract(),
      reportKind: groundedValidationReportKind,
    }),
    /generation contract/u,
  );
  const rawReport = validateFixture({
    evidence: rawEvidence,
    holdout,
    contracts,
  });
  assert.equal(
    rawReport.kind,
    "factual-story-beat-v2-heldout-validation-report",
  );
  const groundedReport = validateFixture({
    evidence: groundedEvidence,
    holdout,
    contracts,
    expectedGenerationContract: groundedGenerationContract(),
    reportKind: groundedValidationReportKind,
  });
  assert.equal(groundedReport.kind, groundedValidationReportKind);
  assert.equal(groundedReport.integrityAccepted, true);
  assert.equal(groundedReport.fullEvaluation, true);
  assert.equal(groundedReport.metrics.firstPassValidCount, 200);
  assert.equal(groundedReport.qualityGate.passed, true);
  assert.equal(groundedReport.modelAdmitted, false);
  assert.equal(groundedReport.displayAuthorized, false);
});

test("projects the exact committed V2 holdout and deterministic selection", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  assert.equal(holdout.corpusHash, "164200f6c558639e");
  assert.equal(holdout.cases.length, 200);
  assert.equal(validateSealedHoldout(holdout, contracts.productionCorpus), holdout);
  const full = selectHoldoutRows(holdout, 200);
  assert.equal(full.receipt.selectedIdsHash, "9e5225f13fcad79b");
  assert.equal(
    selectHoldoutRows(holdout, 1).selected[0].row.id,
    "factual-story-beat-training-corpus-v2:holdout:0172",
  );

  const hostile = structuredClone(holdout);
  hostile.cases[0].prompt = hostile.cases[0].prompt.replace(
    "PLACE:",
    "PLACE :",
  );
  const payload = {
    id: hostile.cases[0].id,
    split: hostile.cases[0].split,
    prompt: hostile.cases[0].prompt,
    target: hostile.cases[0].target,
  };
  hostile.cases[0].caseHash = canonicalHash(payload);
  hostile.corpusHash = canonicalHash({
    schemaVersion: hostile.schemaVersion,
    cases: hostile.cases,
  });
  assert.throws(
    () => validateSealedHoldout(hostile, contracts.productionCorpus),
    /committed projection/u,
  );
});

test("passes a complete 200-row production-target control without granting authority", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const evidence = makeEvidence({ holdout, count: 200 });
  const report = validateFixture({ evidence, holdout, contracts });
  assert.equal(report.integrityAccepted, true);
  assert.equal(report.fullEvaluation, true);
  assert.equal(report.metrics.rowCount, 200);
  assert.equal(report.metrics.firstPassValidCount, 200);
  assert.equal(report.metrics.requiredClauseCompleteCount, 200);
  assert.equal(report.metrics.exactPlaceCount, 200);
  assert.equal(report.metrics.referenceTargetCopyCount, 200);
  assert.equal(report.qualityGate.evaluated, true);
  assert.equal(report.qualityGate.passed, true);
  assert.equal(report.modelAdmitted, false);
  assert.equal(report.displayAuthorized, false);
  assert.match(report.contentHash, /^[0-9a-f]{16}$/u);
});

test("classifies the real wrong-place failure without treating a smoke as a gate", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const evidence = makeEvidence({
    holdout,
    count: 1,
    outputFor: (entry) => entry.row.target.replace(
      "Crimson Bridge Span",
      "Cesta Bridge Span",
    ),
  });
  const report = validateFixture({ evidence, holdout, contracts });
  assert.equal(evidence.rows[0].id.endsWith(":0172"), true);
  assert.equal(report.metrics.firstPassValidCount, 0);
  assert.equal(report.metrics.requiredClauseCompleteCount, 1);
  assert.equal(report.metrics.exactPlaceCount, 0);
  assert.equal(report.metrics.unknownWordOutputCount, 1);
  assert.equal(report.metrics.unknownCapitalizedWordOutputCount, 1);
  assert.deepEqual(report.metrics.rowCountByLens, {
    cost: 0,
    consequence: 1,
    contrast: 0,
  });
  assert.deepEqual(report.metrics.validCountByLens, {
    cost: 0,
    consequence: 0,
    contrast: 0,
  });
  assert.equal(report.qualityGate.evaluated, false);
  assert.equal(report.qualityGate.passed, null);
});

test("rejects evidence, selection, model, and authority drift", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const evidence = makeEvidence({ holdout, count: 1 });

  const authority = structuredClone(evidence);
  authority.modelAdmitted = true;
  resealEvidence(authority);
  assert.throws(
    () => validateFixture({ evidence: authority, holdout, contracts }),
    /cannot admit/u,
  );

  const contract = structuredClone(evidence);
  contract.contract.targetTokenization = "reference-target-leak";
  resealEvidence(contract);
  assert.throws(
    () => validateFixture({ evidence: contract, holdout, contracts }),
    /generation contract/u,
  );

  const output = structuredClone(evidence);
  output.rows[0].output = "tampered";
  resealRow(output.rows[0]);
  resealEvidence(output);
  const report = validateFixture({ evidence: output, holdout, contracts });
  assert.equal(report.metrics.firstPassValidCount, 0);

  const model = structuredClone(evidence.model);
  model.files[0].sha256 = "0".repeat(64);
  model.treeSha256 = modelTreeHash(model.files);
  assert.throws(
    () => validateFixture({ evidence, holdout, contracts, model }),
    /closure differs/u,
  );
});

test("accepts evidence built by the Python schema-2 contract", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const root = await mkdtemp(resolve(tmpdir(), "grind2-factual-v2-eval-"));
  try {
    const holdoutPath = resolve(root, "sealed-holdout.json");
    const modelPath = resolve(root, "checkpoint");
    await writeFile(
      holdoutPath,
      `${JSON.stringify(holdout, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    const { mkdir } = await import("node:fs/promises");
    await mkdir(modelPath);
    await Promise.all([
      writeFile(resolve(modelPath, "config.json"), "{}\n"),
      writeFile(resolve(modelPath, "tokenizer.json"), "{}\n"),
      writeFile(resolve(modelPath, "model.safetensors"), "safe factual weights"),
    ]);
    const script = [
      "import importlib.util,json,sys",
      "from pathlib import Path",
      "spec=importlib.util.spec_from_file_location('factual_v2_cross_language',sys.argv[1])",
      "module=importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(module)",
      "holdout_path=Path(sys.argv[2]).resolve()",
      "model_path=Path(sys.argv[3]).resolve()",
      "holdout=module.load_holdout(holdout_path)",
      "files=module.validate_model(model_path)",
      "selected,selection=module.select_cases(holdout,1)",
      "source_ordinal,case,rank_hash=selected[0]",
      "row=module.make_result_row(ordinal=0,source_ordinal=source_ordinal,case=case,rank_hash=rank_hash,input_token_count=200,generated_token_count=24,output=case['target'],elapsed_microseconds=101)",
      "evidence=module.build_evidence(model=model_path,model_files=files,holdout_path=holdout_path,holdout=holdout,selection=selection,rows=[row])",
      "print(json.dumps(evidence,ensure_ascii=False,allow_nan=False,separators=(',',':'),sort_keys=True))",
    ].join(";");
    const execution = spawnSync(
      "python3",
      ["-c", script, evaluatorPath, holdoutPath, modelPath],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    assert.equal(execution.status, 0, execution.stderr);
    const evidence = JSON.parse(execution.stdout);
    const modelFiles = await manifestModelDirectory(modelPath);
    const model = {
      path: modelPath,
      files: modelFiles,
      treeSha256: modelTreeHash(modelFiles),
    };
    const holdoutBytes = Buffer.from(
      `${JSON.stringify(holdout, null, 2)}\n`,
      "utf8",
    );
    const report = validateHeldoutEvaluation({
      results: evidence,
      resultsFileSha256: sha256Text(execution.stdout),
      holdout,
      holdoutPath,
      holdoutFileSha256: sha256Bytes(holdoutBytes),
      ...contracts,
      model,
    });
    assert.equal(report.integrityAccepted, true);
    assert.equal(report.metrics.firstPassValidCount, 1);
    assert.equal(report.qualityGate.passed, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses only the exact CLI argument set", () => {
  const required = [
    "--holdout",
    "holdout.json",
    "--results",
    "results.json",
    "--model",
    "checkpoint",
  ];
  assert.deepEqual(parseArguments(required), {
    "--holdout": "holdout.json",
    "--results": "results.json",
    "--model": "checkpoint",
  });
  assert.deepEqual(
    parseArguments([...required, "--report", "report.json"]),
    {
      "--holdout": "holdout.json",
      "--results": "results.json",
      "--model": "checkpoint",
      "--report": "report.json",
    },
  );
  assert.throws(() => parseArguments(required.slice(0, -2)), /Usage/u);
  assert.throws(
    () => parseArguments([...required, "--model", "again"]),
    /invalid/u,
  );
});

test("canonical fixture construction stays stable", async () => {
  const contracts = await contractsPromise;
  const holdout = projectProductionHoldout(contracts.productionCorpus);
  const evidence = makeEvidence({ holdout, count: 1 });
  assert.equal(
    canonicalStringify(evidence.contract),
    canonicalStringify(generationContract()),
  );
  assert.equal(evidence.contentHash, canonicalHash(evidencePayload(evidence)));
});
