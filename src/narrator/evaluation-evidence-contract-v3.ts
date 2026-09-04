import { canonicalHash } from "../core/canonical";
import { narratorFormSelectionContractHashV3 } from "./evaluation-selection-contract-v3";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const narratorEvaluationWorkerProtocolContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-evaluation-worker-protocol:v3" as const,
  maximumEnvelopeBytes: 32_768 as const,
  requestKind: "run-form-case" as const,
  responseKind: "form-case-result" as const,
  requestIdentity: "exact-run-worker-corpus-case-prompt-eligibility-and-response-chain" as const,
  requestId: "derived-by-host-from-complete-request-identity" as const,
  responseAuthority: "raw-tokenizer-generation-and-processed-logit-observations-only" as const,
  scoreObservation: "processed-model-logits-for-eligible-token-ids-immediately-before-trie-masking" as const,
  trieMasking: "mask-disallowed-token-logits-only" as const,
  workerVisibleProseAuthority: false as const,
  decodedTextAuthority: false as const,
  selectedFormAuthority: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
});

export const narratorEvaluationWorkerProtocolContractHashV3 = canonicalHash(
  narratorEvaluationWorkerProtocolContractV3,
);

export const narratorEvaluationCaseReceiptContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-evaluation-case-receipt:v3" as const,
  source: "validated-worker-raw-observations-plus-host-derived-form-selection" as const,
  promptBinding: "exact-formatted-UTF8-byte-vector-hash" as const,
  eligibility: "host-derived-before-inference-and-chronologically-revalidated" as const,
  targetEvidence: "normalized-observations-reaccounted-against-frozen-tokenizer-vectors" as const,
  selectionEvidence: "raw-decoder-ids-and-complete-strict-trie-trace-revalidated" as const,
  selectedForm: "derived-only-by-frozen-form-selection-validator" as const,
  renderedText: "deterministic-host-rendering-from-exact-prompt-facts" as const,
  workerEnvelopeRetention: "full-validated-request-and-response-null-only-by-status" as const,
  modelGeneratedVisibleProse: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
});

export const narratorEvaluationCaseReceiptContractHashV3 = canonicalHash(
  narratorEvaluationCaseReceiptContractV3,
);

export const narratorEvaluationRunReceiptContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-evaluation-run-receipt:v3" as const,
  runBinding: "exact-V3-run-spec-worker-epoch-worker-binding-and-six-artifact-closure" as const,
  rowOrder: "complete-frozen-200-case-corpus-order" as const,
  loadEvidence: "monotonic-by-observed-load-stage" as const,
  disposalEvidence: "separate-dispose-and-termination-outcomes" as const,
  chronology: "eligibility-recomputed-from-preceding-validated-selection" as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
});

export const narratorEvaluationRunReceiptContractHashV3 = canonicalHash(
  narratorEvaluationRunReceiptContractV3,
);

export const narratorEvaluationRunnerSequencingContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-evaluation-runner-sequencing:v3" as const,
  corpusTraversal: "strict-ordinal-order-zero-through-199" as const,
  workerIdentity: "model-id-and-worker-epoch-snapshotted-exactly-once" as const,
  requestChain: "prior-worker-response-content-hash-null-only-at-ordinal-zero" as const,
  eligibilityHistory: "prior-selected-form-id-only-on-odd-sequence-slots" as const,
  burstReset: "every-even-sequence-slot-and-seed-boundary" as const,
  invalidOrTiedPriorSelection: "null-and-suppress-nothing" as const,
  terminalFailure: "terminate-and-mark-every-later-case-not-run" as const,
  cleanup: "dispose-when-nonterminal-otherwise-record-termination-attempt" as const,
});

export const narratorEvaluationRunnerSequencingContractHashV3 = canonicalHash(
  narratorEvaluationRunnerSequencingContractV3,
);

export const narratorBlindStudyContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-blind-study:v3" as const,
  modelText: "validated-deterministic-host-rendered-text" as const,
  baseline: "frozen-corpus-deterministic-baseline" as const,
  rateable: "valid-nonbaseline-form-selection-only" as const,
  autoTie: "validated-baseline-form-selection" as const,
  invalid: "hide-both-sides-and-mark-unrated-invalid" as const,
  raterSheetSecrecy: "no-model-side-form-id-selection-evidence-or-secret-salt" as const,
  keyAuthority: "separate-coordinator-only-model-side-key" as const,
  humanRatingEvidence: false as const,
  modelAdmitted: false as const,
  displayAuthorized: false as const,
});

export const narratorBlindStudyContractHashV3 = canonicalHash(narratorBlindStudyContractV3);

export const narratorEvaluationEvidenceContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-evaluation-evidence:v3" as const,
  formSelectionContractHash: narratorFormSelectionContractHashV3,
  workerProtocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
  caseReceiptContractHash: narratorEvaluationCaseReceiptContractHashV3,
  runReceiptContractHash: narratorEvaluationRunReceiptContractHashV3,
  runnerSequencingContractHash: narratorEvaluationRunnerSequencingContractHashV3,
  blindStudyContractHash: narratorBlindStudyContractHashV3,
  additiveVersion: true as const,
  v1AndV2Mutation: false as const,
  adapterIncluded: false as const,
  observedRunIncluded: false as const,
  humanRatingIncluded: false as const,
  productionAuthority: false as const,
});

export const narratorEvaluationEvidenceContractHashV3 = canonicalHash(
  narratorEvaluationEvidenceContractV3,
);
