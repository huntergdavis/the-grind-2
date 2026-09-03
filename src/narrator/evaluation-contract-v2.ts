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
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import {
  narratorDecodingConfigurationHashV2,
  narratorDecodingConfigurationV2,
  narratorGeneratedTokenAccountingHashV2,
  narratorInputTokenAccountingHashV2,
  narratorPromptAndTokenContractHashV2,
  narratorPromptAndTokenContractV2,
  narratorPromptFormatterHashV2,
  narratorVisibleOutputNormalizationHashV2,
} from "./evaluation-prompt-contract";
import { isNarratorBoundedText, isNarratorRecord, narratorHasExactKeys } from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

interface NarratorEvaluationCandidateBindingV2 {
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

export interface NarratorEvaluationRunSpecV2 {
  readonly schemaVersion: 2;
  readonly runId: string;
  readonly candidate: NarratorEvaluationCandidateBindingV2;
  readonly corpus: {
    readonly version: 1;
    readonly hash: string;
    readonly caseCount: 200;
  };
  readonly contract: typeof narratorPromptAndTokenContractV2;
  readonly decoding: typeof narratorDecodingConfigurationV2;
  readonly deadlines: typeof narratorEvaluationDeadlinesV1;
  readonly contentHash: string;
}

export interface NarratorEvaluationWorkerBindingV2 {
  readonly schemaVersion: 2;
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
  readonly inputTokenAccountingHash: string;
  readonly generatedTokenAccountingHash: string;
  readonly visibleOutputNormalizationHash: string;
  readonly decodingHash: string;
}

function candidateBinding(candidate: NarratorModelCandidate): NarratorEvaluationCandidateBindingV2 {
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

function candidateMatchesFrozenTokenContract(candidate: NarratorModelCandidate): boolean {
  return candidate.schemaVersion === 2
    && candidate.modelFamily === "t5"
    && candidate.candidateId === "flan-t5-small-q8@8c85146b"
    && candidate.model.revision === "8c85146bbe1a9bcaa4b77faa2c7ef52b2e5b8dd4"
    && narratorArtifactManifestHash(candidate) === "cd7b76c208b0aa3d"
    && candidate.runtime.package === narratorDecodingConfigurationV2.runtime.package
    && candidate.runtime.version === narratorDecodingConfigurationV2.runtime.version
    && candidate.runtime.integrity === narratorDecodingConfigurationV2.runtime.integrity;
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

export function createNarratorEvaluationRunSpecV2(
  candidate: NarratorModelCandidate,
  runId: string,
): NarratorEvaluationRunSpecV2 {
  if (!isNarratorModelCandidate(candidate)) throw new TypeError("Narrator candidate manifest is invalid");
  if (!candidateMatchesFrozenTokenContract(candidate)) {
    throw new TypeError("Narrator candidate does not match the frozen FLAN-T5 token contract");
  }
  if (!isNarratorBoundedText(runId, 200)) throw new TypeError("Narrator evaluation run id is invalid");
  const content = {
    schemaVersion: 2 as const,
    runId,
    candidate: candidateBinding(candidate),
    corpus: {
      version: narratorEvaluationCorpusVersion,
      hash: narratorEvaluationCorpusHashV1,
      caseCount: narratorEvaluationRequiredCases as 200,
    },
    contract: { ...narratorPromptAndTokenContractV2 },
    decoding: {
      ...narratorDecodingConfigurationV2,
      runtime: { ...narratorDecodingConfigurationV2.runtime },
      input: { ...narratorDecodingConfigurationV2.input },
      generation: { ...narratorDecodingConfigurationV2.generation },
      output: {
        ...narratorDecodingConfigurationV2.output,
        decodeOptions: { ...narratorDecodingConfigurationV2.output.decodeOptions },
        normalization: { ...narratorDecodingConfigurationV2.output.normalization },
      },
    },
    deadlines: { ...narratorEvaluationDeadlinesV1 },
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorEvaluationRunSpecV2(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationRunSpecV2 {
  if (!isNarratorModelCandidate(candidate)
    || !candidateMatchesFrozenTokenContract(candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "candidate", "corpus", "contract", "decoding", "deadlines", "contentHash",
    ])
    || value.schemaVersion !== 2
    || !isNarratorBoundedText(value.runId, 200)
    || !exactCanonical(value.candidate, candidateBinding(candidate))
    || !exactCanonical(value.corpus, {
      version: narratorEvaluationCorpusVersion,
      hash: narratorEvaluationCorpusHashV1,
      caseCount: narratorEvaluationRequiredCases,
    })
    || !exactCanonical(value.contract, narratorPromptAndTokenContractV2)
    || !exactCanonical(value.decoding, narratorDecodingConfigurationV2)
    || !exactCanonical(value.deadlines, narratorEvaluationDeadlinesV1)
    || !hasValidContentHash(value)) return false;
  return true;
}

export function createNarratorEvaluationWorkerBindingV2(
  runSpec: NarratorEvaluationRunSpecV2,
  candidate: NarratorModelCandidate,
): NarratorEvaluationWorkerBindingV2 {
  if (!isNarratorEvaluationRunSpecV2(runSpec, candidate)) {
    throw new TypeError("Narrator V2 evaluation run specification is invalid");
  }
  return deepFreeze({
    schemaVersion: 2 as const,
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
    contractHash: narratorPromptAndTokenContractHashV2,
    promptFormatterHash: narratorPromptFormatterHashV2,
    inputTokenAccountingHash: narratorInputTokenAccountingHashV2,
    generatedTokenAccountingHash: narratorGeneratedTokenAccountingHashV2,
    visibleOutputNormalizationHash: narratorVisibleOutputNormalizationHashV2,
    decodingHash: narratorDecodingConfigurationHashV2,
  });
}

export function isNarratorEvaluationWorkerBindingV2(
  value: unknown,
  runSpec: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationWorkerBindingV2 {
  if (!isNarratorEvaluationRunSpecV2(runSpec, candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "runSpecHash", "candidateId", "candidateManifestHash", "artifactManifestHash",
      "runtimePackage", "runtimeVersion", "runtimeIntegrity", "corpusVersion", "corpusHash", "corpusCaseCount",
      "contractHash", "promptFormatterHash", "inputTokenAccountingHash", "generatedTokenAccountingHash",
      "visibleOutputNormalizationHash", "decodingHash",
    ])) return false;
  try {
    const expected = createNarratorEvaluationWorkerBindingV2(runSpec, candidate);
    return exactCanonical(value, expected);
  } catch {
    return false;
  }
}
