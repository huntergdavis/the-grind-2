import { beforeAll, describe, expect, it } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import {
  createNarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import {
  createNarratorEvaluationRunSpecV3,
  createNarratorEvaluationWorkerBindingV3,
} from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  createNarratorCaseReceiptV2,
  createNarratorRunReceiptV2,
  isNarratorRunReceiptV2,
} from "./evaluation-receipts-v2";
import {
  createNarratorCaseReceiptV1,
  createNarratorEvaluationRunSpecV1,
  createNarratorRunReceiptV1,
  isNarratorRunReceiptV1,
} from "./evaluation-receipts";
import {
  createNarratorCaseReceiptV3,
  createNarratorRunReceiptV3,
  isNarratorRunReceiptV3,
  type NarratorCaseReceiptV3,
  type NarratorRunReceiptV3,
} from "./evaluation-receipts-v3";
import {
  createNarratorRateabilitySummaryV3,
  isNarratorRateabilitySummaryForEvidenceV3,
  narratorRateabilityContractHashV3,
  narratorRateabilityThresholdsV3,
  type NarratorRateabilitySummaryV3,
} from "./evaluation-rateability-v3";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormsV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  createNarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
} from "./evaluation-worker-protocol-v3";
import {
  tinyStoriesInstruct33MInt8Candidate,
  type NarratorModelCandidate,
  type NarratorModelCandidateV1,
} from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

type MutableRecord = Record<string, unknown>;

const workerEpoch = "worker-epoch:v3:rateability-test";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(
    observedReceipt as NarratorT5ArtifactPublicationReceiptV1,
  );
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
  selectedFormId: NarratorFormIdV3,
): NarratorEvaluationWorkerCaseResponseV3 {
  const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
  const observations = targetObservations(request);
  const targetSet = accountNarratorFormTargetsV3(
    evaluationCase.prompt,
    request.eligibility,
    observations,
  );
  const selected = targetSet.targets.find((target) => target.formId === selectedFormId)!;
  const trace: NarratorFormSelectionTraceStepV3[] = selected.tokenIds.map(
    (emittedTokenId, index) => {
      const prefixTokenIds = selected.tokenIds.slice(0, index);
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
          narratorFloat32ToBitsV3(tokenId === emittedTokenId ? 2 : -2)),
        emittedTokenId,
      };
    },
  );
  return createNarratorEvaluationWorkerCaseResponseV3(request, {
    outcome: "selected",
    inputTokenIds: [9, 1],
    observedInputTokens: null,
    targetObservations: observations,
    fullDecoderTokenIds: [
      narratorFormGenerationConfigurationV3.decoderStartTokenId,
      ...selected.tokenIds,
    ],
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

function syntheticRun(
  model: NarratorModelCandidate,
  runId: string,
  baselineOrdinals: ReadonlySet<number>,
  invalidOrdinals: ReadonlySet<number>,
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
    const response = invalidOrdinals.has(ordinal)
      ? generationErrorResponse(request)
      : selectedResponse(
          request,
          baselineOrdinals.has(ordinal)
            ? request.eligibility.baselineFormId
            : request.eligibility.eligibleFormIds.find(
                (formId) => formId !== request.eligibility.baselineFormId,
              )!,
        );
    rows.push(createNarratorCaseReceiptV3(
      runSpec,
      model,
      priorSelectedFormId,
      priorWorkerResponseHash,
      {
        ordinal,
        status: invalidOrdinals.has(ordinal) ? "generation-error" : "ok",
        request,
        response,
        latencyMilliseconds: 10 + ordinal,
      },
    ));
    priorWorkerResponseHash = response.contentHash;
  }
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: createNarratorEvaluationWorkerBindingV3(runSpec, model),
    verifiedArtifacts: model.artifacts.map(({ path, byteLength, sha256 }) => ({
      path,
      byteLength,
      sha256,
    })),
    load: { stage: "model-load", status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
    termination: { status: "not-requested" },
  });
}

function balancedThresholdSets(): {
  readonly baselineOrdinals: ReadonlySet<number>;
  readonly invalidOrdinals: ReadonlySet<number>;
} {
  const invalidOrdinals = new Set([0, 4]);
  const baselineOrdinals = new Set(
    narratorEvaluationCasesV1
      .map((_, ordinal) => ordinal)
      .filter((ordinal) => [0, 4, 8].includes(ordinal % 10)),
  );
  let removed = 0;
  const pressureStrata = new Map<string, number[]>();
  narratorEvaluationCasesV1.forEach((entry, ordinal) => {
    if (entry.prompt.move !== "register-pressure") return;
    const key = `${entry.prompt.move}:${entry.prompt.facts.energy}:${entry.prompt.voice}`;
    const ordinals = pressureStrata.get(key) ?? [];
    ordinals.push(ordinal);
    pressureStrata.set(key, ordinals);
  });
  for (const ordinals of pressureStrata.values()) {
    const minimum = Math.ceil(ordinals.length * 0.6);
    while (ordinals.filter((ordinal) =>
      !invalidOrdinals.has(ordinal) && !baselineOrdinals.has(ordinal)).length < minimum) {
      const ordinal = ordinals.find((entry) =>
        baselineOrdinals.has(entry) && !invalidOrdinals.has(entry));
      if (ordinal === undefined) throw new Error("Unable to build a stratum edge fixture");
      baselineOrdinals.delete(ordinal);
      removed += 1;
    }
  }
  const heroOrdinals = narratorEvaluationCasesV1
    .map((_, ordinal) => ordinal)
    .filter((ordinal) =>
      narratorEvaluationCasesV1[ordinal]!.prompt.voice === "hero-aside-v1");
  const heroMinimum = Math.ceil(heroOrdinals.length * 0.65);
  while (heroOrdinals.filter((ordinal) =>
    !invalidOrdinals.has(ordinal) && !baselineOrdinals.has(ordinal)).length < heroMinimum) {
    const ordinal = heroOrdinals.find((entry) =>
      baselineOrdinals.has(entry)
      && !invalidOrdinals.has(entry)
      && narratorEvaluationCasesV1[entry]!.prompt.facts.energy !== "steady");
    if (ordinal === undefined) throw new Error("Unable to build a voice edge fixture");
    baselineOrdinals.delete(ordinal);
    removed += 1;
  }
  const replacements = narratorEvaluationCasesV1
    .map((_, ordinal) => ordinal)
    .filter((ordinal) =>
      narratorEvaluationCasesV1[ordinal]!.prompt.move === "shade-atmosphere"
      && !baselineOrdinals.has(ordinal)
      && !invalidOrdinals.has(ordinal)
      && [2, 6].includes(ordinal % 10))
    .slice(0, removed);
  if (replacements.length !== removed) throw new Error("Unable to preserve the global edge");
  replacements.forEach((ordinal) => baselineOrdinals.add(ordinal));
  return { baselineOrdinals, invalidOrdinals };
}

function blockedThresholdSets(): {
  readonly baselineOrdinals: ReadonlySet<number>;
  readonly invalidOrdinals: ReadonlySet<number>;
} {
  const invalidOrdinals = new Set([5, 6, 7, 8]);
  narratorEvaluationCasesV1
    .map((entry, ordinal) => ({ entry, ordinal }))
    .filter(({ entry }) =>
      entry.prompt.move === "register-pressure"
      && entry.prompt.facts.energy === "quiet")
    .slice(0, 2)
    .forEach(({ ordinal }) => invalidOrdinals.add(ordinal));
  const baselineOrdinals = new Set<number>();
  narratorEvaluationCasesV1.forEach((entry, ordinal) => {
    if (!invalidOrdinals.has(ordinal) && entry.prompt.voice === "hero-aside-v1") {
      baselineOrdinals.add(ordinal);
    }
  });
  for (let ordinal = 0; ordinal < 10; ordinal += 1) {
    if (!invalidOrdinals.has(ordinal)) baselineOrdinals.add(ordinal);
  }
  for (let ordinal = 10; baselineOrdinals.size < 55; ordinal += 1) {
    if (!invalidOrdinals.has(ordinal)) baselineOrdinals.add(ordinal);
  }
  return { baselineOrdinals, invalidOrdinals };
}

function failedLoadRun(model: NarratorModelCandidate): NarratorRunReceiptV3 {
  const runSpec = createNarratorEvaluationRunSpecV3(model, "run:v3:rateability-load-failure");
  const rows = narratorEvaluationCasesV1.map((_, ordinal) =>
    createNarratorCaseReceiptV3(runSpec, model, null, null, {
      ordinal,
      status: "not-run",
      request: null,
      response: null,
      latencyMilliseconds: 0,
    }));
  return createNarratorRunReceiptV3({
    runSpec,
    workerEpoch,
    workerBinding: null,
    verifiedArtifacts: [],
    load: { stage: "model-identity", status: "model-id-mismatch", latencyMilliseconds: 1 },
    rows,
    dispose: { status: "not-attempted", latencyMilliseconds: 0 },
    termination: { status: "requested" },
  });
}

function v1RunReceipt() {
  const model: NarratorModelCandidateV1 = {
    ...tinyStoriesInstruct33MInt8Candidate,
    model: {
      ...tinyStoriesInstruct33MInt8Candidate.model,
      license: "MIT",
      licenseStatus: "verified",
    },
  };
  const runSpec = createNarratorEvaluationRunSpecV1(model, "run:v1:rateability-cross-version");
  const rows = narratorEvaluationCasesV1.map((entry, ordinal) =>
    createNarratorCaseReceiptV1({
      runSpecHash: runSpec.contentHash,
      ordinal,
      status: "ok",
      inputTokens: 40,
      outputTokens: 8,
      outputText: entry.allowedOutputs[1]!,
      latencyMilliseconds: 10,
    }));
  return { model, receipt: createNarratorRunReceiptV1({
    runSpec,
    verifiedArtifacts: model.artifacts.map(({ path, byteLength, sha256 }) => ({
      path,
      byteLength,
      sha256,
    })),
    load: { status: "ok", latencyMilliseconds: 500 },
    rows,
    dispose: { status: "ok", latencyMilliseconds: 5 },
  }) };
}

function v2RunReceipt(model: NarratorModelCandidate) {
  const runSpec = createNarratorEvaluationRunSpecV2(model, "run:v2:rateability-cross-version");
  const rows = narratorEvaluationCasesV1.map((_, ordinal) => createNarratorCaseReceiptV2({
    runSpecHash: runSpec.contentHash,
    ordinal,
    status: "not-run",
    latencyMilliseconds: 0,
  }));
  return createNarratorRunReceiptV2({
    runSpec,
    workerEpoch,
    workerBinding: null,
    verifiedArtifacts: [],
    load: { stage: "model-identity", status: "model-id-mismatch", latencyMilliseconds: 1 },
    rows,
    dispose: { status: "not-attempted", latencyMilliseconds: 0 },
    termination: { status: "requested" },
  });
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as MutableRecord).every(isDeeplyFrozen);
}

function rehashedMutation<T extends object>(
  value: T,
  mutate: (copy: MutableRecord) => void,
): MutableRecord {
  const content = structuredClone(value) as MutableRecord;
  delete content.contentHash;
  mutate(content);
  return { ...content, contentHash: canonicalHash(content) };
}

describe("narrator V3 pre-rating rateability", () => {
  let model: NarratorModelCandidate;
  let passingReceipt: NarratorRunReceiptV3;
  let passingSummary: NarratorRateabilitySummaryV3;
  let blockedReceipt: NarratorRunReceiptV3;
  let blockedSummary: NarratorRateabilitySummaryV3;

  beforeAll(() => {
    model = candidate();
    const passingSets = balancedThresholdSets();
    passingReceipt = syntheticRun(
      model,
      "run:v3:rateability-passing",
      passingSets.baselineOrdinals,
      passingSets.invalidOrdinals,
    );
    passingSummary = createNarratorRateabilitySummaryV3(model, passingReceipt);
    const blockedSets = blockedThresholdSets();
    blockedReceipt = syntheticRun(
      model,
      "run:v3:rateability-blocked",
      blockedSets.baselineOrdinals,
      blockedSets.invalidOrdinals,
    );
    blockedSummary = createNarratorRateabilitySummaryV3(model, blockedReceipt);
  }, 240_000);

  it("passes an exact 200-row receipt at the global validity and rateability edges", () => {
    expect(narratorRateabilityContractHashV3).toBe("d1bf44588e38a020");
    expect(isNarratorRunReceiptV3(passingReceipt, model)).toBe(true);
    expect(passingSummary).toMatchObject({
      schemaVersion: 3,
      summaryId: "the-grind-2:narrator-rateability-summary:v3",
      rateabilityContractHash: narratorRateabilityContractHashV3,
      runSpecHash: passingReceipt.runSpec.contentHash,
      runReceiptHash: passingReceipt.contentHash,
      thresholds: narratorRateabilityThresholdsV3,
      caseCount: 200,
      completedRowCount: 200,
      validRowCount: 198,
      invalidRowCount: 2,
      rateableNonBaselineCount: 140,
      baselineAutoTieCount: 58,
      validityPermille: 990,
      rateablePermille: 700,
      repeatedBurstCount: 0,
      variableSeedCount: 20,
      disposition: "run-mechanics-pass",
      blockers: [],
      humanQualityEvaluated: false,
      humanRatingIncluded: false,
      modelAdmitted: false,
      displayAuthorized: false,
      productionAuthority: false,
    });
    expect(passingSummary.maximumSelectedFormRun).toBeLessThanOrEqual(3);
    expect(passingSummary.statusCounts.find(({ status }) => status === "ok")?.count).toBe(198);
    expect(passingSummary.statusCounts.find(({ status }) => status === "generation-error")?.count)
      .toBe(2);
    expect(isNarratorRateabilitySummaryForEvidenceV3(
      passingSummary,
      model,
      passingReceipt,
    )).toBe(true);
  }, 60_000);

  it("counts only validated nonbaseline selections and meets integer stratum and voice floors", () => {
    const baselineOrdinal = passingReceipt.rows.findIndex((row) =>
      row.status === "ok"
      && row.selectedFormId === row.request.eligibility.baselineFormId);
    const rateableOrdinal = passingReceipt.rows.findIndex((row) =>
      row.status === "ok"
      && row.selectedFormId !== row.request.eligibility.baselineFormId);
    expect(baselineOrdinal).toBeGreaterThanOrEqual(0);
    expect(rateableOrdinal).toBeGreaterThanOrEqual(0);
    expect(passingReceipt.rows[baselineOrdinal]!.status).toBe("ok");
    expect(passingReceipt.rows[rateableOrdinal]!.status).toBe("ok");
    expect(passingSummary.rateableNonBaselineCount + passingSummary.baselineAutoTieCount)
      .toBe(passingSummary.validRowCount);
    expect(passingSummary.strata.every((entry) =>
      entry.validRowCount * 1_000 >= entry.caseCount * 900
      && entry.rateableNonBaselineCount * 1_000 >= entry.caseCount * 600)).toBe(true);
    expect(passingSummary.strata.find(({ key }) =>
      key === "register-pressure:steady:hero-aside-v1")?.rateablePermille).toBe(600);
    const hero = passingSummary.voices.find(({ key }) => key === "hero-aside-v1")!;
    expect(hero.rateableNonBaselineCount).toBe(Math.ceil(hero.caseCount * 0.65));
    expect(hero.rateableNonBaselineCount * 1_000).toBeGreaterThanOrEqual(hero.caseCount * 650);
  });

  it("blocks just-under global capacity, invalid strata, weak voice capacity, and all fatigue failures", () => {
    expect(blockedSummary).toMatchObject({
      caseCount: 200,
      completedRowCount: 200,
      validRowCount: 194,
      invalidRowCount: 6,
      rateableNonBaselineCount: 139,
      baselineAutoTieCount: 55,
      disposition: "blocked",
    });
    expect(blockedSummary.blockers).toEqual(expect.arrayContaining([
      "valid-rows-below-198",
      "rateable-nonbaseline-rows-below-140",
      "stratum-validity-below-90-percent",
      "stratum-rateable-below-60-percent",
      "voice-rateable-below-65-percent",
      "repeated-form-inside-burst",
      "selected-form-run-above-three",
      "seed-form-variants-below-two",
    ]));
    expect(blockedSummary.repeatedBurstCount).toBeGreaterThan(0);
    expect(blockedSummary.maximumSelectedFormRun).toBeGreaterThan(3);
    expect(blockedSummary.variableSeedCount).toBeLessThan(20);
    const hero = blockedSummary.voices.find(({ key }) => key === "hero-aside-v1")!;
    expect(hero.rateableNonBaselineCount).toBe(0);
    expect(blockedSummary.strata.some((entry) => entry.validityPermille < 900)).toBe(true);
  });

  it("reports failed load, incomplete execution, missing binding, disposal, and termination", () => {
    const receipt = failedLoadRun(model);
    expect(isNarratorRunReceiptV3(receipt, model)).toBe(true);
    const summary = createNarratorRateabilitySummaryV3(model, receipt);
    expect(summary.disposition).toBe("blocked");
    expect(summary.blockers).toEqual(expect.arrayContaining([
      "run-load-not-ok",
      "run-worker-binding-missing",
      "run-incomplete",
      "run-dispose-not-ok",
      "run-termination-requested",
    ]));
    expect(summary.completedRowCount).toBe(0);
    expect(summary.p95ValidLatencyMilliseconds).toBeNull();
  });

  it("deep-freezes summaries and rejects rehashed nested recomputation tampering", () => {
    expect(isDeeplyFrozen(passingSummary)).toBe(true);
    const exactCopy = structuredClone(passingSummary);
    expect(isNarratorRateabilitySummaryForEvidenceV3(
      exactCopy,
      model,
      passingReceipt,
    )).toBe(true);
    const changedStratum = rehashedMutation(passingSummary, (summary) => {
      const strata = summary.strata as MutableRecord[];
      strata[0]!.rateablePermille = 1_000;
    });
    expect(isNarratorRateabilitySummaryForEvidenceV3(
      changedStratum,
      model,
      passingReceipt,
    )).toBe(false);
  }, 90_000);

  it("rejects real V1 and V2 receipts, schema substitution, and a different candidate", () => {
    const v1 = v1RunReceipt();
    const v2 = v2RunReceipt(model);
    expect(isNarratorRunReceiptV1(v1.receipt, v1.model)).toBe(true);
    expect(isNarratorRunReceiptV2(v2, model)).toBe(true);
    expect(() => createNarratorRateabilitySummaryV3(
      model,
      v1.receipt as unknown as NarratorRunReceiptV3,
    )).toThrow("Narrator V3 rateability evidence is invalid");
    expect(() => createNarratorRateabilitySummaryV3(
      model,
      v2 as unknown as NarratorRunReceiptV3,
    )).toThrow("Narrator V3 rateability evidence is invalid");
    expect(isNarratorRateabilitySummaryForEvidenceV3(
      passingSummary,
      model,
      v1.receipt,
    )).toBe(false);
    const otherCandidate = {
      ...model,
      candidateId: "flan-t5-small-q8@rateability-other",
    } as NarratorModelCandidate;
    expect(isNarratorRateabilitySummaryForEvidenceV3(
      passingSummary,
      otherCandidate,
      passingReceipt,
    )).toBe(false);
  }, 30_000);
});
