import { beforeAll, describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import { isNarratorBlindSheetV1 } from "./blind-evaluation";
import {
  createNarratorBlindStudyV3,
  generateNarratorBlindStudySaltV3,
  isNarratorBlindKeyV3,
  isNarratorBlindRaterSheetV3,
  isNarratorBlindSheetV3,
} from "./blind-evaluation-v3";
import { isNarratorBlindSheetV2 } from "./blind-evaluation-v2";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import {
  narratorBlindStudyContractHashV3,
  narratorEvaluationEvidenceContractHashV3,
} from "./evaluation-evidence-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormPromptBytesHashV3,
  narratorFormsV3,
  narratorFormSelectionContractHashV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerCaseRequestV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

const privateSalt = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const workerEpoch = "worker-epoch:v3:blind-synthetic";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function targetEvidence(request: NarratorEvaluationWorkerCaseRequestV3) {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = narratorFormsV3(prompt).find((entry) => entry.formId === formId)!;
    return {
      formId: form.formId,
      tokenIds: [...form.targetTokenIds],
      decodedWitness: form.witness,
    };
  });
}

function selectedResponse(
  request: NarratorEvaluationWorkerCaseRequestV3,
  selectedFormId: NarratorFormIdV3,
) {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  const targetObservations = targetEvidence(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    targetObservations,
  );
  const selectedTarget = targetSet.targets.find((target) => target.formId === selectedFormId)!;
  const trace: NarratorFormSelectionTraceStepV3[] = selectedTarget.tokenIds.map((emittedTokenId, index) => {
    const prefixTokenIds = selectedTarget.tokenIds.slice(0, index);
    const allowedTokenIds = allowedNarratorFormTokenIdsV3(
      evaluationCase.prompt,
      request.eligibility,
      targetSet,
      prefixTokenIds,
    );
    return {
      prefixTokenIds,
      allowedTokenIds,
      allowedScoreBits: allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 1 : 0)),
      emittedTokenId,
    };
  });
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [1],
    observedInputTokens: null,
    targetObservations,
    fullDecoderTokenIds: [
      narratorFormGenerationConfigurationV3.decoderStartTokenId,
      ...selectedTarget.tokenIds,
    ],
    selectionTrace: trace,
  });
}

function syntheticRunReceipt(
  model: NarratorModelCandidate,
  baselineOrdinals: ReadonlySet<number> = new Set([0]),
  invalidOrdinals: ReadonlySet<number> = new Set([2]),
): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:blind-synthetic");
  const rows = [];
  let previousResponseHash: string | null = null;
  let priorSelectedFormId: NarratorFormIdV3 | null = null;
  for (let ordinal = 0; ordinal < narratorEvaluationCasesV1.length; ordinal += 1) {
    const burstPrior = ordinal % 2 === 1 ? priorSelectedFormId : null;
    const request = createNarratorEvaluationWorkerCaseRequestV3(
      runSpec,
      model,
      ordinal,
      workerEpoch,
      burstPrior,
      previousResponseHash,
    );
    if (invalidOrdinals.has(ordinal)) {
      const response = createNarratorEvaluationWorkerCaseResponseV3(request, {
        outcome: "generation-error",
        inputTokenIds: [1],
        observedInputTokens: null,
        targetObservations: targetEvidence(request),
        fullDecoderTokenIds: null,
        selectionTrace: null,
      });
      rows.push(createNarratorCaseReceiptV3(runSpec, model, burstPrior, previousResponseHash, {
        ordinal,
        status: "generation-error",
        request,
        response,
        latencyMilliseconds: 10 + ordinal,
      }));
      priorSelectedFormId = null;
      previousResponseHash = response.contentHash;
      continue;
    }
    const forms = narratorFormsV3(narratorEvaluationCasesV1[ordinal]!.prompt)
      .filter((form) => request.eligibility.eligibleFormIds.includes(form.formId));
    const selectedFormId = baselineOrdinals.has(ordinal)
      ? request.eligibility.baselineFormId
      : forms.find((form) => !form.baseline)!.formId;
    const response = selectedResponse(request, selectedFormId);
    const row = createNarratorCaseReceiptV3(runSpec, model, burstPrior, previousResponseHash, {
      ordinal,
      status: "ok",
      request,
      response,
      latencyMilliseconds: 10 + ordinal,
    });
    rows.push(row);
    priorSelectedFormId = row.selectedFormId;
    previousResponseHash = response.contentHash;
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    verifiedArtifacts: model.artifacts.map(({ path, byteLength, sha256 }) => ({ path, byteLength, sha256 })),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
    termination: { status: "not-requested" },
  });
}

function recursiveKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(recursiveKeys);
  return Object.entries(value).flatMap(([key, child]) => [key, ...recursiveKeys(child)]);
}

describe("narrator V3 blind evaluation", () => {
  let model: NarratorModelCandidate;
  let receipt: NarratorRunReceiptV3;
  let study: ReturnType<typeof createNarratorBlindStudyV3>;

  beforeAll(() => {
    model = candidate();
    receipt = syntheticRunReceipt(model);
    study = createNarratorBlindStudyV3(model, receipt, "sheet:v3:synthetic", privateSalt);
  }, 120_000);

  it("exports an exactly bound secret-free rater sheet and separate coordinator key", () => {
    expect(isNarratorBlindRaterSheetV3(study.sheet, model, receipt)).toBe(true);
    expect(isNarratorBlindSheetV3(study.sheet, model, receipt, study.key)).toBe(true);
    expect(study.sheet).toMatchObject({
      schemaVersion: 3,
      runReceiptHash: receipt.contentHash,
      runSpecHash: receipt.runSpec.contentHash,
      selectionContractHash: narratorFormSelectionContractHashV3,
      evidenceContractHash: narratorEvaluationEvidenceContractHashV3,
      blindStudyContractHash: narratorBlindStudyContractHashV3,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(study.sheet.items[0]).toMatchObject({
      prompt: narratorEvaluationCasesV1[0]!.prompt,
      promptBytesHash: narratorFormPromptBytesHashV3(narratorEvaluationCasesV1[0]!.prompt),
    });
    const publicExport = JSON.stringify(study.sheet);
    expect(publicExport).not.toContain(privateSalt);
    expect(publicExport).not.toContain(model.candidateId);
    for (const formId of requestFormIds(receipt)) expect(publicExport).not.toContain(formId);
    const forbiddenKeys = new Set([
      "modelSide", "secretSalt", "selectedFormId", "priorSelectedFormId", "baselineFormId",
      "eligibleFormIds", "suppressedFormId", "inputTokenIds", "observedInputTokens",
      "targetObservations", "targetSet", "selectionTokenIds", "fullDecoderTokenIds",
      "selectionTrace", "allowedTokenIds", "allowedScoreBits", "workerEpoch", "workerBinding",
      "workerBindingHash", "modelId", "modelRevision", "sourceRevision", "runtimePackage",
      "runtimeVersion", "runtimeIntegrity", "buildReceipt", "candidateId",
    ]);
    expect(recursiveKeys(study.sheet).filter((key) => forbiddenKeys.has(key))).toEqual([]);
    expect(isNarratorBlindSheetV1(study.sheet, model, receipt, study.key)).toBe(false);
    expect(isNarratorBlindSheetV2(study.sheet, model, receipt, study.key)).toBe(false);
  }, 60_000);

  it("balances all 200 model sides globally and within every prompt stratum", () => {
    const { key } = study;
    expect(key.items).toHaveLength(200);
    expect(key.items.filter((item) => item.modelSide === "left")).toHaveLength(100);
    expect(key.items.filter((item) => item.modelSide === "right")).toHaveLength(100);
    const strata = new Map<string, { left: number; right: number }>();
    key.items.forEach((item, ordinal) => {
      const prompt = narratorEvaluationCasesV1[ordinal]!.prompt;
      const stratum = `${prompt.move}:${prompt.facts.energy}:${prompt.voice}`;
      const counts = strata.get(stratum) ?? { left: 0, right: 0 };
      counts[item.modelSide] += 1;
      strata.set(stratum, counts);
    });
    expect([...strata.values()].every(({ left, right }) => Math.abs(left - right) <= 1)).toBe(true);
  });

  it("auto-ties only a validated baseline form and hides an invalid row", () => {
    const { sheet } = study;
    expect(receipt.rows[0]!.selectedFormId).toBe(receipt.rows[0]!.request!.eligibility.baselineFormId);
    expect(sheet.items[0]).toMatchObject({
      resolution: "auto-tie",
      leftText: narratorEvaluationCasesV1[0]!.deterministicBaseline,
      rightText: narratorEvaluationCasesV1[0]!.deterministicBaseline,
    });
    expect(receipt.rows[2]!.status).toBe("generation-error");
    expect(sheet.items[2]).toMatchObject({
      resolution: "unrated-invalid",
      leftText: null,
      rightText: null,
    });
    expect(sheet.items[1]!.resolution).toBe("rate");
  });

  it("requires the exact private key and rejects altered, swapped, and sparse evidence", () => {
    expect(isNarratorBlindKeyV3(
      { ...study.key, secretSalt: "a".repeat(64) }, model, receipt, study.sheet,
    )).toBe(false);
    expect(isNarratorBlindSheetV3(
      { ...study.sheet, evidenceContractHash: "0".repeat(16) }, model, receipt, study.key,
    )).toBe(false);
    const ratedOrdinal = study.sheet.items.findIndex((item) => item.resolution === "rate");
    const alteredItems = [...study.sheet.items];
    const original = alteredItems[ratedOrdinal]!;
    alteredItems[ratedOrdinal] = { ...original, leftText: original.rightText, rightText: original.leftText };
    const sheetContent = { ...study.sheet, items: alteredItems } as Record<string, unknown>;
    delete sheetContent.contentHash;
    const swappedSheet = { ...sheetContent, contentHash: canonicalHash(sheetContent) };
    expect(isNarratorBlindRaterSheetV3(swappedSheet, model, receipt)).toBe(true);
    expect(isNarratorBlindSheetV3(swappedSheet, model, receipt, study.key)).toBe(false);
    expect(isNarratorBlindKeyV3(study.key, model, receipt, swappedSheet)).toBe(false);
    const sparseSheetContent = { ...study.sheet, items: Array(study.sheet.items.length) } as Record<string, unknown>;
    delete sparseSheetContent.contentHash;
    const sparseSheet = { ...sparseSheetContent, contentHash: canonicalHash(sparseSheetContent) };
    expect(() => isNarratorBlindRaterSheetV3(sparseSheet, model, receipt)).not.toThrow();
    expect(isNarratorBlindRaterSheetV3(sparseSheet, model, receipt)).toBe(false);
    const sparseKeyContent = { ...study.key, items: Array(study.key.items.length) } as Record<string, unknown>;
    delete sparseKeyContent.contentHash;
    const sparseKey = { ...sparseKeyContent, contentHash: canonicalHash(sparseKeyContent) };
    expect(() => isNarratorBlindKeyV3(sparseKey, model, receipt, study.sheet)).not.toThrow();
    expect(isNarratorBlindKeyV3(sparseKey, model, receipt, study.sheet)).toBe(false);
  }, 60_000);

  it("freezes copied public/private evidence and returns false for malformed imports", () => {
    expect(study.sheet.items[0]!.prompt).not.toBe(narratorEvaluationCasesV1[0]!.prompt);
    expect(Object.isFrozen(study.sheet)).toBe(true);
    expect(Object.isFrozen(study.sheet.items)).toBe(true);
    expect(Object.isFrozen(study.sheet.items[0])).toBe(true);
    expect(Object.isFrozen(study.sheet.items[0]!.prompt)).toBe(true);
    expect(Object.isFrozen(study.sheet.items[0]!.prompt.facts)).toBe(true);
    expect(Object.isFrozen(study.key)).toBe(true);
    expect(Object.isFrozen(study.key.items[0])).toBe(true);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const malformed of [
      null,
      {},
      { contentHash: [] },
      { ...study.sheet, items: null },
      { ...study.sheet, items: [cyclic, ...study.sheet.items.slice(1)] },
    ]) {
      expect(() => isNarratorBlindRaterSheetV3(malformed, model, receipt)).not.toThrow();
      expect(isNarratorBlindRaterSheetV3(malformed, model, receipt)).toBe(false);
      expect(() => isNarratorBlindSheetV3(malformed, model, receipt, study.key)).not.toThrow();
      expect(isNarratorBlindSheetV3(malformed, model, receipt, study.key)).toBe(false);
    }
  });

  it("draws a private salt from exactly 32 Web Crypto bytes", () => {
    let requested = 0;
    const salt = generateNarratorBlindStudySaltV3({
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        requested = array?.byteLength ?? 0;
        if (array instanceof Uint8Array) array.fill(0xab);
        return array;
      },
    });
    expect(requested).toBe(32);
    expect(salt).toBe("ab".repeat(32));
  });
});

function requestFormIds(runReceipt: NarratorRunReceiptV3): readonly string[] {
  return [...new Set(runReceipt.rows.flatMap((row) => row.request?.eligibility.eligibleFormIds ?? []))];
}
