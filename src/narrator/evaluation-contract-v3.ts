import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  narratorEvaluationCorpusHashV1,
  narratorEvaluationCorpusVersion,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import {
  narratorArtifactManifestHash,
  narratorCandidateManifestHash,
  narratorEvaluationDeadlinesV1,
} from "./evaluation-receipts";
import {
  narratorFormEligibilityPolicyHashV3,
  narratorFormFloat32ScoreHashV3,
  narratorFormGenerationConfigurationHashV3,
  narratorFormGenerationConfigurationV3,
  narratorFormInputTokenAccountingHashV3,
  narratorFormPromptFormatterHashV3,
  narratorFormRegistryHashV3,
  narratorFormRendererHashV3,
  narratorFormSelectionContractHashV3,
  narratorFormSelectionContractV3,
  narratorFormTargetTokenAccountingHashV3,
  narratorFormTrieSelectionHashV3,
  narratorRenderedSafetyHashV3,
} from "./evaluation-selection-contract-v3";
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

interface NarratorEvaluationCandidateBindingV3 {
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly modelRevision: string;
  readonly sourceRevision: string;
  readonly execution: "wasm";
  readonly runtimePackage: "@huggingface/transformers";
  readonly runtimeVersion: string;
  readonly runtimeIntegrity: string;
}

export interface NarratorEvaluationRunSpecV3 {
  readonly schemaVersion: 3;
  readonly runId: string;
  readonly candidate: NarratorEvaluationCandidateBindingV3;
  readonly corpus: {
    readonly version: 1;
    readonly hash: string;
    readonly caseCount: 200;
  };
  readonly contract: typeof narratorFormSelectionContractV3;
  readonly decoding: typeof narratorFormGenerationConfigurationV3;
  readonly deadlines: typeof narratorEvaluationDeadlinesV1;
  readonly contentHash: string;
}

export interface NarratorEvaluationWorkerBindingV3 {
  readonly schemaVersion: 3;
  readonly runId: string;
  readonly runSpecHash: string;
  readonly candidateId: string;
  readonly candidateManifestHash: string;
  readonly artifactManifestHash: string;
  readonly runtimePackage: "@huggingface/transformers";
  readonly runtimeVersion: string;
  readonly runtimeIntegrity: string;
  readonly corpusVersion: 1;
  readonly corpusHash: string;
  readonly corpusCaseCount: 200;
  readonly contractHash: string;
  readonly promptFormatterHash: string;
  readonly formRegistryHash: string;
  readonly rendererHash: string;
  readonly renderedSafetyHash: string;
  readonly eligibilityPolicyHash: string;
  readonly inputTokenAccountingHash: string;
  readonly targetTokenAccountingHash: string;
  readonly generationConfigurationHash: string;
  readonly float32ScoreHash: string;
  readonly trieSelectionHash: string;
}

function candidateBinding(candidate: NarratorModelCandidate): NarratorEvaluationCandidateBindingV3 {
  return {
    candidateId: candidate.candidateId,
    candidateManifestHash: narratorCandidateManifestHash(candidate),
    artifactManifestHash: narratorArtifactManifestHash(candidate),
    modelRevision: candidate.model.revision,
    sourceRevision: candidate.model.sourceRevision,
    execution: candidate.execution,
    runtimePackage: candidate.runtime.package,
    runtimeVersion: candidate.runtime.version,
    runtimeIntegrity: candidate.runtime.integrity,
  };
}

function candidateMatchesFrozenFormContract(candidate: NarratorModelCandidate): boolean {
  return candidate.schemaVersion === 2
    && candidate.modelFamily === "t5"
    && candidate.candidateId === "flan-t5-small-q8@8c85146b"
    && candidate.model.revision === "8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4"
    && narratorCandidateManifestHash(candidate) === "3ef11de32b935bf8"
    && narratorArtifactManifestHash(candidate) === "cd7b76c208b0aa3d"
    && candidate.runtime.package === narratorFormGenerationConfigurationV3.runtime.package
    && candidate.runtime.version === narratorFormGenerationConfigurationV3.runtime.version
    && candidate.runtime.integrity === narratorFormGenerationConfigurationV3.runtime.integrity;
}

function exactCanonical(value: unknown, expected: unknown): boolean {
  try {
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

function hasValidContentHash(value: Record<string, unknown>): boolean {
  if (!/^[0-9a-f]{16}$/u.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

export function createNarratorEvaluationRunSpecV3(
  candidate: NarratorModelCandidate,
  runId: string,
): NarratorEvaluationRunSpecV3 {
  if (!isNarratorModelCandidate(candidate)) throw new TypeError("Narrator candidate manifest is invalid");
  if (!candidateMatchesFrozenFormContract(candidate)) {
    throw new TypeError("Narrator candidate does not match the frozen FLAN-T5 form-selection contract");
  }
  if (!isNarratorBoundedText(runId, 200)) throw new TypeError("Narrator evaluation run id is invalid");
  const content = {
    schemaVersion: 3 as const,
    runId,
    candidate: candidateBinding(candidate),
    corpus: {
      version: narratorEvaluationCorpusVersion,
      hash: narratorEvaluationCorpusHashV1,
      caseCount: narratorEvaluationRequiredCases as 200,
    },
    contract: { ...narratorFormSelectionContractV3 },
    decoding: {
      ...narratorFormGenerationConfigurationV3,
      runtime: { ...narratorFormGenerationConfigurationV3.runtime },
      options: { ...narratorFormGenerationConfigurationV3.options },
    },
    deadlines: { ...narratorEvaluationDeadlinesV1 },
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorEvaluationRunSpecV3(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationRunSpecV3 {
  if (!isNarratorModelCandidate(candidate)
    || !candidateMatchesFrozenFormContract(candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "candidate", "corpus", "contract", "decoding", "deadlines", "contentHash",
    ])
    || value.schemaVersion !== 3
    || !isNarratorBoundedText(value.runId, 200)
    || !exactCanonical(value.candidate, candidateBinding(candidate))
    || !exactCanonical(value.corpus, {
      version: narratorEvaluationCorpusVersion,
      hash: narratorEvaluationCorpusHashV1,
      caseCount: narratorEvaluationRequiredCases,
    })
    || !exactCanonical(value.contract, narratorFormSelectionContractV3)
    || !exactCanonical(value.decoding, narratorFormGenerationConfigurationV3)
    || !exactCanonical(value.deadlines, narratorEvaluationDeadlinesV1)
    || !hasValidContentHash(value)) return false;
  return true;
}

export function createNarratorEvaluationWorkerBindingV3(
  runSpec: NarratorEvaluationRunSpecV3,
  candidate: NarratorModelCandidate,
): NarratorEvaluationWorkerBindingV3 {
  if (!isNarratorEvaluationRunSpecV3(runSpec, candidate)) {
    throw new TypeError("Narrator V3 evaluation run specification is invalid");
  }
  return deepFreeze({
    schemaVersion: 3 as const,
    runId: runSpec.runId,
    runSpecHash: runSpec.contentHash,
    candidateId: runSpec.candidate.candidateId,
    candidateManifestHash: runSpec.candidate.candidateManifestHash,
    artifactManifestHash: runSpec.candidate.artifactManifestHash,
    runtimePackage: runSpec.candidate.runtimePackage,
    runtimeVersion: runSpec.candidate.runtimeVersion,
    runtimeIntegrity: runSpec.candidate.runtimeIntegrity,
    corpusVersion: runSpec.corpus.version,
    corpusHash: runSpec.corpus.hash,
    corpusCaseCount: runSpec.corpus.caseCount,
    contractHash: narratorFormSelectionContractHashV3,
    promptFormatterHash: narratorFormPromptFormatterHashV3,
    formRegistryHash: narratorFormRegistryHashV3,
    rendererHash: narratorFormRendererHashV3,
    renderedSafetyHash: narratorRenderedSafetyHashV3,
    eligibilityPolicyHash: narratorFormEligibilityPolicyHashV3,
    inputTokenAccountingHash: narratorFormInputTokenAccountingHashV3,
    targetTokenAccountingHash: narratorFormTargetTokenAccountingHashV3,
    generationConfigurationHash: narratorFormGenerationConfigurationHashV3,
    float32ScoreHash: narratorFormFloat32ScoreHashV3,
    trieSelectionHash: narratorFormTrieSelectionHashV3,
  });
}

export function isNarratorEvaluationWorkerBindingV3(
  value: unknown,
  runSpec: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationWorkerBindingV3 {
  if (!isNarratorEvaluationRunSpecV3(runSpec, candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "runSpecHash", "candidateId", "candidateManifestHash", "artifactManifestHash",
      "runtimePackage", "runtimeVersion", "runtimeIntegrity", "corpusVersion", "corpusHash", "corpusCaseCount",
      "contractHash", "promptFormatterHash", "formRegistryHash", "rendererHash", "renderedSafetyHash",
      "eligibilityPolicyHash", "inputTokenAccountingHash", "targetTokenAccountingHash",
      "generationConfigurationHash", "float32ScoreHash", "trieSelectionHash",
    ])) return false;
  try {
    return exactCanonical(value, createNarratorEvaluationWorkerBindingV3(runSpec, candidate));
  } catch {
    return false;
  }
}
