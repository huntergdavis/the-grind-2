import { describe, expect, it } from "vitest";
import {
  narratorBlindStudyContractHashV3,
  narratorBlindStudyContractV3,
  narratorEvaluationCaseReceiptContractHashV3,
  narratorEvaluationCaseReceiptContractV3,
  narratorEvaluationEvidenceContractHashV3,
  narratorEvaluationEvidenceContractV3,
  narratorEvaluationRunReceiptContractHashV3,
  narratorEvaluationRunReceiptContractV3,
  narratorEvaluationRunnerSequencingContractHashV3,
  narratorEvaluationRunnerSequencingContractV3,
  narratorEvaluationWorkerProtocolContractHashV3,
  narratorEvaluationWorkerProtocolContractV3,
} from "./evaluation-evidence-contract-v3";
import { narratorFormSelectionContractHashV3 } from "./evaluation-selection-contract-v3";

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeeplyFrozen);
}

describe("narrator V3 evaluation evidence contract", () => {
  it("freezes exact independent component hashes and the aggregate binding", () => {
    expect({
      protocol: narratorEvaluationWorkerProtocolContractHashV3,
      caseReceipt: narratorEvaluationCaseReceiptContractHashV3,
      runReceipt: narratorEvaluationRunReceiptContractHashV3,
      runner: narratorEvaluationRunnerSequencingContractHashV3,
      blind: narratorBlindStudyContractHashV3,
      aggregate: narratorEvaluationEvidenceContractHashV3,
    }).toEqual({
      protocol: "62b779c32a027d62",
      caseReceipt: "6afa352de72d9279",
      runReceipt: "fae6f5c1cd8b3369",
      runner: "2052bef2cf222bf4",
      blind: "5e3f7a0e9231a018",
      aggregate: "75e944457b23282d",
    });
    expect(narratorFormSelectionContractHashV3).toBe("0b1631e866f3eeae");
    expect(narratorEvaluationEvidenceContractV3).toMatchObject({
      formSelectionContractHash: narratorFormSelectionContractHashV3,
      workerProtocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
      caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
      runReceiptContractHash: narratorEvaluationRunReceiptContractHashV3,
      runnerSequencingContractHash: narratorEvaluationRunnerSequencingContractHashV3,
      blindStudyContractHash: narratorBlindStudyContractHashV3,
      v1AndV2Mutation: false,
      adapterIncluded: false,
      observedRunIncluded: false,
      humanRatingIncluded: false,
      productionAuthority: false,
    });
  });

  it("states the raw-score boundary, host authority, and full validated-envelope retention", () => {
    expect(narratorEvaluationWorkerProtocolContractV3).toMatchObject({
      maximumEnvelopeBytes: 32_768,
      scoreObservation: "processed-model-logits-for-eligible-token-ids-immediately-before-trie-masking",
      trieMasking: "mask-disallowed-token-logits-only",
      workerVisibleProseAuthority: false,
      decodedTextAuthority: false,
      selectedFormAuthority: false,
      modelAdmitted: false,
      displayAuthorized: false,
    });
    expect(narratorEvaluationCaseReceiptContractV3).toMatchObject({
      selectedForm: "derived-only-by-frozen-form-selection-validator",
      renderedText: "deterministic-host-rendering-from-exact-prompt-facts",
      workerEnvelopeRetention: "full-validated-request-and-response-null-only-by-status",
      modelGeneratedVisibleProse: false,
    });
    expect(narratorEvaluationRunReceiptContractV3.chronology)
      .toBe("eligibility-recomputed-from-preceding-validated-selection");
    expect(narratorEvaluationRunnerSequencingContractV3.requestChain)
      .toBe("prior-worker-response-content-hash-null-only-at-ordinal-zero");
    expect(narratorBlindStudyContractV3.humanRatingEvidence).toBe(false);
  });

  it("deeply freezes every descriptor", () => {
    for (const descriptor of [
      narratorEvaluationWorkerProtocolContractV3,
      narratorEvaluationCaseReceiptContractV3,
      narratorEvaluationRunReceiptContractV3,
      narratorEvaluationRunnerSequencingContractV3,
      narratorBlindStudyContractV3,
      narratorEvaluationEvidenceContractV3,
    ]) expect(isDeeplyFrozen(descriptor)).toBe(true);
  });
});
