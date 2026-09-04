import { beforeAll, describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
  type NarratorEvaluationRunSpecV3,
} from "./evaluation-contract-v3";
import {
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationRunReceiptContractHashV3,
  narratorEvaluationRunnerSequencingContractHashV3,
  narratorEvaluationWorkerProtocolContractHashV3,
} from "./evaluation-evidence-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV2,
  createNarratorRunReceiptV2,
} from "./evaluation-receipts-v2";
import {
  createNarratorCaseReceiptV1,
  isNarratorRunReceiptV1,
} from "./evaluation-receipts";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
  isNarratorCaseReceiptV3,
  isNarratorRunReceiptV3,
  type NarratorCaseReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormPromptBytesHashV3,
  narratorFormsV3,
  renderNarratorFormV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

type MutableRecord = Record<string, unknown>;

const workerEpoch = "worker-epoch:v3:receipt-test";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function artifacts(model: NarratorModelCandidate) {
  return model.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 }));
}

function rehashedMutation<T extends object>(value: T, mutate: (copy: MutableRecord) => void): MutableRecord {
  const content = structuredClone(value) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

function targetObservations(request: NarratorEvaluationWorkerCaseRequestV3) {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const forms = new Map(narratorFormsV3(prompt).map((form) => [form.formId, form]));
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = forms.get(formId)!;
    return { formId, tokenIds: [...form.targetTokenIds], decodedWitness: form.witness };
  });
}

function selectedResponse(
  request: NarratorEvaluationWorkerCaseRequestV3,
  selectedFormId?: NarratorFormIdV3,
): NarratorEvaluationWorkerCaseResponseV3 {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  const observations = targetObservations(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    observations,
  );
  const selected = selectedFormId === undefined
    ? targetSet.targets.find((target) => target.formId !== request.eligibility.baselineFormId)
      ?? targetSet.targets[0]!
    : targetSet.targets.find((target) => target.formId === selectedFormId)!;
  const prefix: number[] = [];
  const trace: NarratorFormSelectionTraceStepV3[] = selected.tokenIds.map((emittedTokenId) => {
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(
      evaluationCase.prompt,
      request.eligibility,
      targetSet,
      prefix,
    );
    const step = {
      prefixTokenIds: [...prefix],
      allowedTokenIds: [...allowedTokenIds],
      allowedScoreBits: allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 2 : -2)),
      emittedTokenId,
    };
    prefix.push(emittedTokenId);
    return step;
  });
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [narratorFormGenerationConfigurationV3.decoderStartTokenId, ...selected.tokenIds],
    selectionTrace: trace,
  });
}

function generationErrorResponse(
  request: NarratorEvaluationWorkerCaseRequestV3,
): NarratorEvaluationWorkerCaseResponseV3 {
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "generation-error",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: targetObservations(request),
    fullDecoderTokenIds: null,
    selectionTrace: null,
  });
}

function completedRun(
  model: NarratorModelCandidate,
  runId = "run:v3:receipt",
  generationErrorOrdinals: ReadonlySet<number> = new Set(),
): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(model, runId);
  const rows: NarratorCaseReceiptV3[] = [];
  let priorWorkerResponseHash: string | null = null;
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const priorSelectedFormId = ordinal % 2 === 1 && rows[ordinal - 1]?.status === "ok"
      ? rows[ordinal - 1]!.selectedFormId
      : null;
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      model,
      ordinal,
      workerEpoch,
      priorSelectedFormId,
      priorWorkerResponseHash,
    );
    const response = generationErrorOrdinals.has(ordinal)
      ? generationErrorResponse(request)
      : selectedResponse(request);
    const row = createNarratorCaseReceiptV3(
      runSpec,
      model,
      priorSelectedFormId,
      priorWorkerResponseHash,
      {
        ordinal,
        status: generationErrorOrdinals.has(ordinal) ? "generation-error" : "ok",
        request,
        response,
        latencyMilliseconds: 10 + ordinal,
      },
    );
    rows.push(row);
    priorWorkerResponseHash = response.contentHash;
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    verifiedArtifacts: artifacts(model),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
    termination: { status: "not-requested" },
  });
}

function terminalRun(model: NarratorModelCandidate): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:terminal");
  const rows: NarratorCaseReceiptV3[] = [];
  let priorWorkerResponseHash: string | null = null;
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const priorSelectedFormId = ordinal % 2 === 1 && rows[ordinal - 1]?.status === "ok"
      ? rows[ordinal - 1]!.selectedFormId
      : null;
    const request: NarratorEvaluationWorkerCaseRequestV3 | null = ordinal <= 2
      ? createNarratorEvaluationWorkerCaseRequestV3(
        runSpec, model, ordinal, workerEpoch, priorSelectedFormId, priorWorkerResponseHash,
      )
      : null;
    const response: NarratorEvaluationWorkerCaseResponseV3 | null = ordinal < 2
      ? selectedResponse(request!)
      : null;
    const row = createNarratorCaseReceiptV3(
      runSpec,
      model,
      priorSelectedFormId,
      priorWorkerResponseHash,
      {
        ordinal,
        status: ordinal < 2 ? "ok" : ordinal === 2 ? "case-timeout" : "not-run",
        request,
        response,
        latencyMilliseconds: ordinal === 2 ? 8_000 : ordinal < 2 ? 10 : 0,
      },
    );
    rows.push(row);
    if (response !== null) priorWorkerResponseHash = response.contentHash;
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    verifiedArtifacts: artifacts(model),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "not-attempted", latencyMilliseconds: 0 },
    termination: { status: "requested" },
  });
}

function gapBeforeTerminalRun(model: NarratorModelCandidate): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:gap-before-terminal");
  const rows: NarratorCaseReceiptV3[] = [];
  const firstRequest = createNarratorEvaluationWorkerCaseRequestV3(
    runSpec, model, 0, workerEpoch, null, null,
  );
  const firstResponse = selectedResponse(firstRequest);
  rows.push(createNarratorCaseReceiptV3(runSpec, model, null, null, {
    ordinal: 0,
    status: "ok",
    request: firstRequest,
    response: firstResponse,
    latencyMilliseconds: 10,
  }));
  rows.push(createNarratorCaseReceiptV3(
    runSpec, model, rows[0]!.selectedFormId, firstResponse.contentHash, {
      ordinal: 1,
      status: "not-run",
      request: null,
      response: null,
      latencyMilliseconds: 0,
    },
  ));
  const terminalRequest = createNarratorEvaluationWorkerCaseRequestV3(
    runSpec, model, 2, workerEpoch, null, firstResponse.contentHash,
  );
  rows.push(createNarratorCaseReceiptV3(runSpec, model, null, firstResponse.contentHash, {
    ordinal: 2,
    status: "case-timeout",
    request: terminalRequest,
    response: null,
    latencyMilliseconds: 8_000,
  }));
  for (let ordinal = 3; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    rows.push(createNarratorCaseReceiptV3(runSpec, model, null, firstResponse.contentHash, {
      ordinal,
      status: "not-run",
      request: null,
      response: null,
      latencyMilliseconds: 0,
    }));
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    verifiedArtifacts: artifacts(model),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "not-attempted", latencyMilliseconds: 0 },
    termination: { status: "requested" },
  });
}

function runWithRows(receipt: NarratorRunReceiptV3, rows: readonly unknown[]): MutableRecord {
  return rehashedMutation(receipt, (run) => {
    run.rows = rows;
    run.rowsHash = canonicalHash(rows.map((row) =>
      typeof row === "object" && row !== null ? (row as MutableRecord).contentHash : null));
    run.completedRowCount = rows.filter((row) =>
      typeof row === "object" && row !== null && (row as MutableRecord).status !== "not-run").length;
  });
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as MutableRecord).every(isDeeplyFrozen);
}

describe("narrator V3 evaluation receipts", () => {
  let model: NarratorModelCandidate;
  let receipt: NarratorRunReceiptV3;

  beforeAll(() => {
    model = candidate();
    receipt = completedRun(model);
  }, 30_000);

  it("retains complete validated envelopes and derives the form and safe host rendering", () => {
    const row = receipt.rows[0]!;
    expect(isNarratorCaseReceiptV3(row, receipt.runSpec, model, 0, null, null)).toBe(true);
    expect(row).toMatchObject({
      schemaVersion: 3,
      caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
      evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
      protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
      runSpecHash: receipt.runSpec.contentHash,
      workerBindingHash: receipt.workerBindingHash,
      promptBytesHash: narratorFormPromptBytesHashV3(narratorEvaluationCasesV1[0]!.prompt),
      requestHash: row.request!.contentHash,
      workerResponseHash: row.response!.contentHash,
      selectedFormId: row.selection!.selectedFormId,
      renderedText: renderNarratorFormV3(narratorEvaluationCasesV1[0]!.prompt, row.selectedFormId),
      safetyAccepted: true,
      knowledgeViolationCount: 0,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(row.request!.eligibility).toEqual(receipt.rows[0]!.request!.eligibility);
    expect(row.response!.targetObservations).not.toBeNull();
    expect(row.response!.selectionTrace).not.toBeNull();
    expect(isDeeplyFrozen(row)).toBe(true);
  });

  it("retains only stage-valid failure evidence and keeps derived authority null", () => {
    const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:failure-row");
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec, model, 0, workerEpoch, null, null,
    );
    const response = generationErrorResponse(request);
    const failure = createNarratorCaseReceiptV3(runSpec, model, null, null, {
      ordinal: 0,
      status: "generation-error",
      request,
      response,
      latencyMilliseconds: 7,
    });
    expect(isNarratorCaseReceiptV3(failure, runSpec, model, 0, null, null)).toBe(true);
    expect(failure).toMatchObject({
      request,
      response,
      selection: null,
      selectedFormId: null,
      renderedText: null,
      safetyAccepted: false,
      knowledgeViolationCount: 0,
    });
    expect(() => createNarratorCaseReceiptV3(runSpec, model, null, null, {
      ordinal: 0,
      status: "worker-call-error",
      request,
      response,
      latencyMilliseconds: 7,
    })).toThrow(TypeError);
    expect(() => createNarratorCaseReceiptV3(runSpec, model, null, null, {
      ordinal: 0,
      status: "not-run",
      request,
      response: null,
      latencyMilliseconds: 0,
    })).toThrow(TypeError);
    expect(() => createNarratorCaseReceiptV3(runSpec, model, null, null, {
      ordinal: 0,
      status: "render-contract-error" as never,
      request,
      response: selectedResponse(request),
      latencyMilliseconds: 7,
    })).toThrow(TypeError);
  });

  it("binds exact contracts, full run preimages, six artifacts, and 200 chained rows", () => {
    expect(isNarratorRunReceiptV3(receipt, model)).toBe(true);
    expect(receipt).toMatchObject({
      schemaVersion: 3,
      runReceiptContractHash: narratorEvaluationRunReceiptContractHashV3,
      evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
      protocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
      runnerSequencingContractHash: narratorEvaluationRunnerSequencingContractHashV3,
      workerEpoch,
      completedRowCount: 200,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(receipt.verifiedArtifacts).toHaveLength(6);
    expect(receipt.rows).toHaveLength(200);
    expect(receipt.rowsHash).toBe(canonicalHash(receipt.rows.map((row) => row.contentHash)));
    expect(receipt.rows[1]!.request!.priorWorkerResponseHash).toBe(receipt.rows[0]!.response!.contentHash);
    expect(receipt.rows[1]!.request!.eligibility.priorSelectedFormId).toBe(receipt.rows[0]!.selectedFormId);
    expect(receipt.rows[2]!.request!.eligibility.priorSelectedFormId).toBeNull();
    expect(isDeeplyFrozen(receipt)).toBe(true);
  }, 30_000);

  it("allows ordinary model failures to continue but requires terminal failures to stop", () => {
    const nonterminal = completedRun(model, "run:v3:nonterminal", new Set([2]));
    expect(nonterminal.rows[2]).toMatchObject({
      status: "generation-error",
      selectedFormId: null,
      renderedText: null,
    });
    expect(nonterminal.rows[3]!.status).toBe("ok");
    expect(nonterminal.rows[3]!.request!.eligibility.priorSelectedFormId).toBeNull();
    expect(nonterminal.rows[3]!.request!.priorWorkerResponseHash).toBe(nonterminal.rows[2]!.response!.contentHash);
    expect(isNarratorRunReceiptV3(nonterminal, model)).toBe(true);

    const terminal = terminalRun(model);
    expect(terminal.rows[2]).toMatchObject({ status: "case-timeout", response: null });
    expect(terminal.rows.slice(3).every((row) => row.status === "not-run" && row.request === null)).toBe(true);
    expect(isNarratorRunReceiptV3(terminal, model)).toBe(true);
    const continued = runWithRows(terminal, [
      ...terminal.rows.slice(0, 3),
      receipt.rows[3]!,
      ...terminal.rows.slice(4),
    ]);
    expect(isNarratorRunReceiptV3(continued, model)).toBe(false);
    expect(isNarratorRunReceiptV3(gapBeforeTerminalRun(model), model)).toBe(false);
  }, 30_000);

  it("rejects fully rehashed render, selection, prompt, target, and trace mutations", () => {
    const sourceRow = receipt.rows[0]!;
    const extraRow = rehashedMutation(sourceRow, (row) => { row.extra = true; });
    expect(isNarratorCaseReceiptV3(extraRow, receipt.runSpec, model, 0, null, null)).toBe(false);
    const extraRun = rehashedMutation(receipt, (run) => { run.extra = true; });
    expect(isNarratorRunReceiptV3(extraRun, model)).toBe(false);

    const rendered = rehashedMutation(sourceRow, (row) => { row.renderedText = "Forged host prose."; });
    expect(isNarratorCaseReceiptV3(rendered, receipt.runSpec, model, 0, null, null)).toBe(false);

    const forgedSelection = rehashedMutation(sourceRow.selection!, (selection) => {
      selection.selectedFormId = sourceRow.request!.eligibility.baselineFormId;
    });
    const selectionRow = rehashedMutation(sourceRow, (row) => {
      row.selection = forgedSelection;
      row.selectedFormId = sourceRow.request!.eligibility.baselineFormId;
    });
    expect(isNarratorCaseReceiptV3(selectionRow, receipt.runSpec, model, 0, null, null)).toBe(false);

    const promptHash = "0".repeat(16);
    const forgedRequest = rehashedMutation(sourceRow.request!, (request) => {
      request.promptBytesHash = promptHash;
    });
    const promptResponse = rehashedMutation(sourceRow.response!, (response) => {
      response.promptBytesHash = promptHash;
      response.requestHash = forgedRequest.contentHash;
    });
    const promptRow = rehashedMutation(sourceRow, (row) => {
      row.promptBytesHash = promptHash;
      row.request = forgedRequest;
      row.requestHash = forgedRequest.contentHash;
      row.response = promptResponse;
      row.workerResponseHash = promptResponse.contentHash;
    });
    expect(isNarratorCaseReceiptV3(promptRow, receipt.runSpec, model, 0, null, null)).toBe(false);

    const targetResponse = rehashedMutation(sourceRow.response!, (response) => {
      const observations = response.targetObservations as MutableRecord[];
      observations[0]!.tokenIds = [9, 1];
    });
    const targetRow = rehashedMutation(sourceRow, (row) => {
      row.response = targetResponse;
      row.workerResponseHash = targetResponse.contentHash;
    });
    expect(isNarratorCaseReceiptV3(targetRow, receipt.runSpec, model, 0, null, null)).toBe(false);

    const traceResponse = rehashedMutation(sourceRow.response!, (response) => {
      const trace = response.selectionTrace as MutableRecord[];
      trace[0]!.emittedTokenId = 99;
    });
    const traceRow = rehashedMutation(sourceRow, (row) => {
      row.response = traceResponse;
      row.workerResponseHash = traceResponse.contentHash;
    });
    expect(isNarratorCaseReceiptV3(traceRow, receipt.runSpec, model, 0, null, null)).toBe(false);
  });

  it("replays eligibility and every executed response hash across exact corpus order", () => {
    const swappedRows = [...receipt.rows];
    [swappedRows[0], swappedRows[1]] = [swappedRows[1]!, swappedRows[0]!];
    expect(isNarratorRunReceiptV3(runWithRows(receipt, swappedRows), model)).toBe(false);

    const ordinal = 1;
    const priorResponseHash = receipt.rows[0]!.response!.contentHash;
    const wrongHistoryRequest = createNarratorEvaluationWorkerCaseRequestV3(
      receipt.runSpec,
      model,
      ordinal,
      workerEpoch,
      null,
      priorResponseHash,
    );
    const wrongHistoryResponse = selectedResponse(wrongHistoryRequest);
    const wrongHistoryRow = createNarratorCaseReceiptV3(
      receipt.runSpec,
      model,
      null,
      priorResponseHash,
      {
        ordinal,
        status: "ok",
        request: wrongHistoryRequest,
        response: wrongHistoryResponse,
        latencyMilliseconds: 11,
      },
    );
    const wrongHistoryRows = [...receipt.rows];
    wrongHistoryRows[ordinal] = wrongHistoryRow;
    expect(isNarratorRunReceiptV3(runWithRows(receipt, wrongHistoryRows), model)).toBe(false);

    const wrongChainHash = "f".repeat(16);
    const wrongChainRequest = createNarratorEvaluationWorkerCaseRequestV3(
      receipt.runSpec,
      model,
      2,
      workerEpoch,
      null,
      wrongChainHash,
    );
    const wrongChainResponse = selectedResponse(wrongChainRequest);
    const wrongChainRow = createNarratorCaseReceiptV3(
      receipt.runSpec,
      model,
      null,
      wrongChainHash,
      {
        ordinal: 2,
        status: "ok",
        request: wrongChainRequest,
        response: wrongChainResponse,
        latencyMilliseconds: 12,
      },
    );
    const wrongChainRows = [...receipt.rows];
    wrongChainRows[2] = wrongChainRow;
    expect(isNarratorRunReceiptV3(runWithRows(receipt, wrongChainRows), model)).toBe(false);
  });

  it("enforces load-stage evidence, exact artifact closure, and failure cleanup", () => {
    const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:load-failure");
    const rows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV3(
      runSpec, model, null, null, {
        ordinal,
        status: "not-run",
        request: null,
        response: null,
        latencyMilliseconds: 0,
      },
    ));
    const failed = createNarratorRunReceiptV3({
      runSpec,
      workerEpoch,
      workerBinding: null,
      verifiedArtifacts: [],
      load: { stage: "model-identity", status: "model-id-mismatch", latencyMilliseconds: 1 },
      rows,
      dispose: { status: "not-attempted", latencyMilliseconds: 0 },
      termination: { status: "requested" },
    });
    expect(isNarratorRunReceiptV3(failed, model)).toBe(true);
    expect(isNarratorRunReceiptV3(createNarratorRunReceiptV3({
      ...failed,
      workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    }), model)).toBe(false);
    expect(isNarratorRunReceiptV3(createNarratorRunReceiptV3({
      ...failed,
      verifiedArtifacts: artifacts(model),
    }), model)).toBe(false);

    const missingArtifact = createNarratorRunReceiptV3({ ...receipt, verifiedArtifacts: artifacts(model).slice(1) });
    expect(isNarratorRunReceiptV3(missingArtifact, model)).toBe(false);
    const sparseRows = new Array(receipt.rows.length);
    expect(() => isNarratorRunReceiptV3(runWithRows(receipt, sparseRows), model)).not.toThrow();
    expect(isNarratorRunReceiptV3(runWithRows(receipt, sparseRows), model)).toBe(false);
  }, 30_000);

  it("rejects genuine V1/V2 receipt substitutions", () => {
    const v1Case = createNarratorCaseReceiptV1({
      runSpecHash: receipt.runSpec.contentHash,
      ordinal: 0,
      status: "ok",
      inputTokens: 1,
      outputTokens: 1,
      outputText: narratorEvaluationCasesV1[0]!.allowedOutputs[0]!,
      latencyMilliseconds: 1,
    });
    const v2Spec = createNarratorEvaluationRunSpecV2(model, "run:v2:substitution");
    const v2Rows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV2({
      runSpecHash: v2Spec.contentHash,
      ordinal,
      status: "not-run",
      latencyMilliseconds: 0,
    }));
    const v2Run = createNarratorRunReceiptV2({
      runSpec: v2Spec,
      workerEpoch,
      workerBinding: null,
      verifiedArtifacts: [],
      load: { stage: "model-identity", status: "model-id-mismatch", latencyMilliseconds: 1 },
      rows: v2Rows,
      dispose: { status: "not-attempted", latencyMilliseconds: 0 },
      termination: { status: "requested" },
    });
    expect(isNarratorCaseReceiptV3(v1Case, receipt.runSpec, model, 0, null, null)).toBe(false);
    expect(isNarratorCaseReceiptV3(v2Rows[0], receipt.runSpec, model, 0, null, null)).toBe(false);
    expect(isNarratorRunReceiptV3(v2Run, model)).toBe(false);
    expect(isNarratorRunReceiptV1(receipt, model)).toBe(false);
  });

  it("rejects a V3 receipt under a different run or candidate identity", () => {
    const otherSpec: NarratorEvaluationRunSpecV3 = createNarratorEvaluationRunSpecV3(model, "run:v3:other");
    expect(isNarratorCaseReceiptV3(receipt.rows[0], otherSpec, model, 0, null, null)).toBe(false);
    if (model.schemaVersion !== 2) throw new Error("Published candidate must be V2");
    const otherCandidate = { ...model, candidateId: "flan-t5-small-q8@other" } as NarratorModelCandidate;
    expect(isNarratorRunReceiptV3(receipt, otherCandidate)).toBe(false);
  });
});
