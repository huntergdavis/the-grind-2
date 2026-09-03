import { canonicalHash } from "../core/canonical";
import {
  narratorEvaluationCasesV1,
  narratorEvaluationCorpusHashV1,
  narratorEvaluationCorpusVersion,
  narratorEvaluationRequiredCases,
} from "./evaluation";
import { isNarratorModelCandidate, type NarratorModelCandidate } from "./model-candidate";
import { isSafeAmbientNarration, narratorOutputPolicyVersion } from "./output-policy";
import {
  isNarratorBoundedText,
  isNarratorRecord,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  normalizeNarratorOutput,
} from "./protocol";

export const narratorPromptFormatterHashV1 = canonicalHash({
  schemaVersion: 1,
  task: "single-ambient-line",
  fields: ["voice", "move", "facts.schemaVersion", "facts.kind", "facts.sceneKind", "facts.place", "facts.energy"],
});

export const narratorEvaluationDeadlinesV1 = Object.freeze({
  cachedLoadMilliseconds: 60_000,
  wholeCaseMilliseconds: 8_000,
  disposeMilliseconds: 5_000,
});

export const narratorDecodingConfigurationV1 = Object.freeze({
  schemaVersion: 1 as const,
  promptEncoding: "single-ambient-line-v1" as const,
  method: "greedy" as const,
  doSample: false as const,
  maximumInputTokens: narratorMaximumInputTokens,
  maximumOutputTokens: narratorMaximumOutputTokens,
  stopPolicy: "model-eos-or-48" as const,
  outputPolicyVersion: narratorOutputPolicyVersion,
});

export interface NarratorEvaluationRunSpecV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly candidate: {
    readonly candidateId: string;
    readonly candidateManifestHash: string;
    readonly artifactManifestHash: string;
    readonly modelRevision: string;
    readonly sourceRevision: string;
    readonly execution: "wasm";
    readonly runtimePackage: "@huggingface/transformers";
    readonly runtimeVersion: string;
    readonly runtimeIntegrity: string;
  };
  readonly corpus: {
    readonly version: 1;
    readonly hash: string;
    readonly caseCount: 200;
  };
  readonly decoding: typeof narratorDecodingConfigurationV1;
  readonly deadlines: typeof narratorEvaluationDeadlinesV1;
  readonly promptFormatterHash: string;
  readonly contentHash: string;
}

export interface NarratorVerifiedArtifactV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NarratorEvaluationWorkerBindingV1 {
  readonly schemaVersion: 1;
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
  readonly decodingHash: string;
  readonly promptFormatterHash: string;
}

export type NarratorEvaluationLoadStatus =
  | "ok"
  | "worker-binding-mismatch"
  | "artifact-evidence-invalid"
  | "artifact-mismatch"
  | "model-id-mismatch"
  | "load-error"
  | "load-timeout"
  | "device-lost"
  | "aborted";

export type NarratorEvaluationCaseStatus =
  | "ok"
  | "not-run"
  | "run-aborted"
  | "input-tokenizer-error"
  | "input-budget"
  | "realizer-error"
  | "worker-response-invalid"
  | "realizer-timeout"
  | "device-lost"
  | "output-tokenizer-error"
  | "output-budget"
  | "output-policy-rejected";

export type NarratorEvaluationDisposeStatus = "ok" | "error" | "timeout" | "device-lost" | "hard-terminated";

export interface NarratorCaseReceiptV1 {
  readonly schemaVersion: 1;
  readonly runSpecHash: string;
  readonly ordinal: number;
  readonly caseId: string;
  readonly caseHash: string;
  readonly status: NarratorEvaluationCaseStatus;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly outputText: string | null;
  readonly safetyAccepted: boolean;
  readonly knowledgeViolationCount: 0 | 1;
  readonly latencyMilliseconds: number;
  readonly contentHash: string;
}

export interface NarratorRunReceiptV1 {
  readonly schemaVersion: 1;
  readonly runSpec: NarratorEvaluationRunSpecV1;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly load: {
    readonly status: NarratorEvaluationLoadStatus;
    readonly latencyMilliseconds: number;
  };
  readonly rows: readonly NarratorCaseReceiptV1[];
  readonly dispose: {
    readonly status: NarratorEvaluationDisposeStatus;
    readonly latencyMilliseconds: number;
  };
  readonly completedRowCount: number;
  readonly contentHash: string;
}

const hashPattern = /^[0-9a-f]{16}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const loadStatuses: readonly NarratorEvaluationLoadStatus[] = [
  "ok", "worker-binding-mismatch", "artifact-evidence-invalid", "artifact-mismatch", "model-id-mismatch",
  "load-error", "load-timeout", "device-lost", "aborted",
];
const caseStatuses: readonly NarratorEvaluationCaseStatus[] = [
  "ok", "not-run", "run-aborted", "input-tokenizer-error", "input-budget", "realizer-error",
  "worker-response-invalid", "realizer-timeout", "device-lost", "output-tokenizer-error", "output-budget",
  "output-policy-rejected",
];
const disposeStatuses: readonly NarratorEvaluationDisposeStatus[] = ["ok", "error", "timeout", "device-lost", "hard-terminated"];

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function artifactProjection(candidate: NarratorModelCandidate): readonly NarratorVerifiedArtifactV1[] {
  return Object.freeze(candidate.artifacts
    .map(({ path, byteLength, sha256 }) => Object.freeze({ path, byteLength, sha256 }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function narratorCandidateManifestHash(candidate: NarratorModelCandidate): string {
  return canonicalHash(candidate);
}

export function narratorArtifactManifestHash(candidate: NarratorModelCandidate): string {
  return canonicalHash(artifactProjection(candidate));
}

function runSpecContent(spec: Omit<NarratorEvaluationRunSpecV1, "contentHash">): unknown {
  return spec;
}

export function createNarratorEvaluationRunSpecV1(
  candidate: NarratorModelCandidate,
  runId: string,
): NarratorEvaluationRunSpecV1 {
  if (!isNarratorModelCandidate(candidate)) throw new TypeError("Narrator candidate manifest is invalid");
  if (!isNarratorBoundedText(runId, 200)) throw new TypeError("Narrator evaluation run id is invalid");
  const content = {
    schemaVersion: 1 as const,
    runId,
    candidate: {
      candidateId: candidate.candidateId,
      candidateManifestHash: narratorCandidateManifestHash(candidate),
      artifactManifestHash: narratorArtifactManifestHash(candidate),
      modelRevision: candidate.model.revision,
      sourceRevision: candidate.model.sourceRevision,
      execution: candidate.execution,
      runtimePackage: candidate.runtime.package,
      runtimeVersion: candidate.runtime.version,
      runtimeIntegrity: candidate.runtime.integrity,
    },
    corpus: {
      version: narratorEvaluationCorpusVersion,
      hash: narratorEvaluationCorpusHashV1,
      caseCount: narratorEvaluationRequiredCases as 200,
    },
    decoding: { ...narratorDecodingConfigurationV1 },
    deadlines: { ...narratorEvaluationDeadlinesV1 },
    promptFormatterHash: narratorPromptFormatterHashV1,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(runSpecContent(content)) });
}

export function createNarratorEvaluationWorkerBindingV1(
  runSpec: NarratorEvaluationRunSpecV1,
): NarratorEvaluationWorkerBindingV1 {
  return deepFreeze({
    schemaVersion: 1,
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
    decodingHash: canonicalHash(runSpec.decoding),
    promptFormatterHash: runSpec.promptFormatterHash,
  });
}

export function isNarratorEvaluationWorkerBindingV1(
  value: unknown,
  runSpec: unknown,
): value is NarratorEvaluationWorkerBindingV1 {
  if (!isNarratorRecord(value)
    || !isNarratorRecord(runSpec)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "runSpecHash", "candidateId", "candidateManifestHash",
      "artifactManifestHash", "runtimePackage", "runtimeVersion", "runtimeIntegrity", "corpusVersion",
      "corpusHash", "corpusCaseCount", "decodingHash", "promptFormatterHash",
    ])) return false;
  try {
    const expected = createNarratorEvaluationWorkerBindingV1(runSpec as unknown as NarratorEvaluationRunSpecV1);
    return Object.keys(expected).every((key) => value[key] === expected[key as keyof NarratorEvaluationWorkerBindingV1]);
  } catch {
    return false;
  }
}

function candidateBindingIsValid(value: unknown, candidate: NarratorModelCandidate): boolean {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, [
      "candidateId", "candidateManifestHash", "artifactManifestHash", "modelRevision", "sourceRevision",
      "execution", "runtimePackage", "runtimeVersion", "runtimeIntegrity",
    ])
    && value.candidateId === candidate.candidateId
    && value.candidateManifestHash === narratorCandidateManifestHash(candidate)
    && value.artifactManifestHash === narratorArtifactManifestHash(candidate)
    && value.modelRevision === candidate.model.revision
    && value.sourceRevision === candidate.model.sourceRevision
    && value.execution === candidate.execution
    && value.runtimePackage === candidate.runtime.package
    && value.runtimeVersion === candidate.runtime.version
    && value.runtimeIntegrity === candidate.runtime.integrity;
}

export function isNarratorEvaluationRunSpecV1(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorEvaluationRunSpecV1 {
  if (!isNarratorModelCandidate(candidate)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runId", "candidate", "corpus", "decoding", "deadlines", "promptFormatterHash", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorBoundedText(value.runId, 200)
    || !candidateBindingIsValid(value.candidate, candidate)
    || !isNarratorRecord(value.corpus)
    || !narratorHasExactKeys(value.corpus, ["version", "hash", "caseCount"])
    || value.corpus.version !== narratorEvaluationCorpusVersion
    || value.corpus.hash !== narratorEvaluationCorpusHashV1
    || value.corpus.caseCount !== narratorEvaluationRequiredCases
    || !isNarratorRecord(value.decoding)
    || !narratorHasExactKeys(value.decoding, [
      "schemaVersion", "promptEncoding", "method", "doSample", "maximumInputTokens", "maximumOutputTokens",
      "stopPolicy", "outputPolicyVersion",
    ])
    || canonicalHash(value.decoding) !== canonicalHash(narratorDecodingConfigurationV1)
    || !isNarratorRecord(value.deadlines)
    || !narratorHasExactKeys(value.deadlines, ["cachedLoadMilliseconds", "wholeCaseMilliseconds", "disposeMilliseconds"])
    || canonicalHash(value.deadlines) !== canonicalHash(narratorEvaluationDeadlinesV1)
    || value.promptFormatterHash !== narratorPromptFormatterHashV1
    || !hashPattern.test(String(value.contentHash))) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

function isVerifiedArtifact(value: unknown): value is NarratorVerifiedArtifactV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["path", "byteLength", "sha256"])
    && isNarratorBoundedText(value.path, 240)
    && positiveInteger(value.byteLength)
    && sha256Pattern.test(String(value.sha256));
}

export function isNarratorVerifiedArtifactsV1(value: unknown): value is readonly NarratorVerifiedArtifactV1[] {
  if (!Array.isArray(value) || value.length > 64 || !value.every(isVerifiedArtifact)) return false;
  return new Set(value.map((artifact) => artifact.path)).size === value.length;
}

export function narratorArtifactsMatchCandidate(
  artifacts: unknown,
  candidate: unknown,
): boolean {
  if (!isNarratorVerifiedArtifactsV1(artifacts) || !isNarratorModelCandidate(candidate)) return false;
  return canonicalHash([...artifacts].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    === canonicalHash(artifactProjection(candidate));
}

interface CaseReceiptFields {
  readonly runSpecHash: string;
  readonly ordinal: number;
  readonly status: NarratorEvaluationCaseStatus;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly outputText: string | null;
  readonly latencyMilliseconds: number;
}

export function createNarratorCaseReceiptV1(fields: CaseReceiptFields): NarratorCaseReceiptV1 {
  const evaluationCase = narratorEvaluationCasesV1[fields.ordinal];
  if (evaluationCase === undefined) throw new RangeError("Narrator evaluation ordinal is invalid");
  const normalized = fields.outputText === null ? null : normalizeNarratorOutput(fields.outputText);
  const safe = normalized !== null && isSafeAmbientNarration(normalized, evaluationCase.prompt);
  const content = {
    schemaVersion: 1 as const,
    runSpecHash: fields.runSpecHash,
    ordinal: fields.ordinal,
    caseId: evaluationCase.id,
    caseHash: canonicalHash(evaluationCase),
    status: fields.status,
    inputTokens: fields.inputTokens,
    outputTokens: fields.outputTokens,
    outputText: normalized,
    safetyAccepted: safe,
    knowledgeViolationCount: (normalized === null || safe ? 0 : 1) as 0 | 1,
    latencyMilliseconds: Math.max(0, Math.floor(fields.latencyMilliseconds)),
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

function caseReceiptIsValid(value: unknown, runSpec: NarratorEvaluationRunSpecV1, ordinal: number): value is NarratorCaseReceiptV1 {
  const evaluationCase = narratorEvaluationCasesV1[ordinal];
  if (evaluationCase === undefined
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runSpecHash", "ordinal", "caseId", "caseHash", "status", "inputTokens", "outputTokens",
      "outputText", "safetyAccepted", "knowledgeViolationCount", "latencyMilliseconds", "contentHash",
    ])
    || value.schemaVersion !== 1
    || value.runSpecHash !== runSpec.contentHash
    || value.ordinal !== ordinal
    || value.caseId !== evaluationCase.id
    || value.caseHash !== canonicalHash(evaluationCase)
    || !caseStatuses.includes(value.status as NarratorEvaluationCaseStatus)
    || !(value.inputTokens === null || nonNegativeInteger(value.inputTokens))
    || !(value.outputTokens === null || nonNegativeInteger(value.outputTokens))
    || !(value.outputText === null || normalizeNarratorOutput(value.outputText) === value.outputText)
    || typeof value.safetyAccepted !== "boolean"
    || ![0, 1].includes(Number(value.knowledgeViolationCount))
    || !nonNegativeInteger(value.latencyMilliseconds)
    || !hashPattern.test(String(value.contentHash))) return false;
  const safe = typeof value.outputText === "string" && isSafeAmbientNarration(value.outputText, evaluationCase.prompt);
  if (value.safetyAccepted !== safe || value.knowledgeViolationCount !== (value.outputText === null || safe ? 0 : 1)) return false;
  const inputInBudget = positiveInteger(value.inputTokens) && value.inputTokens <= narratorMaximumInputTokens;
  const outputInBudget = positiveInteger(value.outputTokens) && value.outputTokens <= narratorMaximumOutputTokens;
  if (value.status === "ok" && (!inputInBudget || !outputInBudget || !safe)) return false;
  if (value.status === "input-budget" && (
    value.inputTokens === null
    || (value.inputTokens >= 1 && value.inputTokens <= narratorMaximumInputTokens)
    || value.outputTokens !== null
    || value.outputText !== null
  )) return false;
  if (["not-run", "run-aborted", "input-tokenizer-error", "worker-response-invalid", "realizer-timeout", "device-lost"].includes(String(value.status))
    && (value.inputTokens !== null || value.outputTokens !== null || value.outputText !== null)) return false;
  if (value.status === "realizer-error" && (
    !(value.inputTokens === null || inputInBudget)
    || value.outputTokens !== null
    || value.outputText !== null
  )) return false;
  if (value.status === "output-tokenizer-error" && (!inputInBudget || value.outputTokens !== null || value.outputText === null)) return false;
  if (value.status === "output-budget" && (!inputInBudget
    || value.outputTokens === null
    || (value.outputTokens >= 1 && value.outputTokens <= narratorMaximumOutputTokens))) return false;
  if (value.status === "output-policy-rejected" && (!inputInBudget || !outputInBudget || safe)) return false;
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}

interface RunReceiptFields {
  readonly runSpec: NarratorEvaluationRunSpecV1;
  readonly verifiedArtifacts: readonly NarratorVerifiedArtifactV1[];
  readonly load: NarratorRunReceiptV1["load"];
  readonly rows: readonly NarratorCaseReceiptV1[];
  readonly dispose: NarratorRunReceiptV1["dispose"];
}

export function createNarratorRunReceiptV1(fields: RunReceiptFields): NarratorRunReceiptV1 {
  const verifiedArtifacts = fields.verifiedArtifacts
    .map((artifact) => Object.freeze({ ...artifact }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const completedRowCount = fields.rows.filter((row) => row.status !== "not-run").length;
  const content = {
    schemaVersion: 1 as const,
    runSpec: fields.runSpec,
    verifiedArtifacts: Object.freeze(verifiedArtifacts),
    load: Object.freeze({ ...fields.load }),
    rows: Object.freeze([...fields.rows]),
    dispose: Object.freeze({ ...fields.dispose }),
    completedRowCount,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorRunReceiptV1(
  value: unknown,
  candidate: NarratorModelCandidate,
): value is NarratorRunReceiptV1 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "runSpec", "verifiedArtifacts", "load", "rows", "dispose", "completedRowCount", "contentHash",
    ])
    || value.schemaVersion !== 1
    || !isNarratorEvaluationRunSpecV1(value.runSpec, candidate)
    || !isNarratorVerifiedArtifactsV1(value.verifiedArtifacts)
    || !isNarratorRecord(value.load)
    || !narratorHasExactKeys(value.load, ["status", "latencyMilliseconds"])
    || !loadStatuses.includes(value.load.status as NarratorEvaluationLoadStatus)
    || !nonNegativeInteger(value.load.latencyMilliseconds)
    || !Array.isArray(value.rows)
    || value.rows.length !== narratorEvaluationRequiredCases
    || !value.rows.every((row, ordinal) => caseReceiptIsValid(row, value.runSpec as NarratorEvaluationRunSpecV1, ordinal))
    || !isNarratorRecord(value.dispose)
    || !narratorHasExactKeys(value.dispose, ["status", "latencyMilliseconds"])
    || !disposeStatuses.includes(value.dispose.status as NarratorEvaluationDisposeStatus)
    || !nonNegativeInteger(value.dispose.latencyMilliseconds)
    || !nonNegativeInteger(value.completedRowCount)
    || value.completedRowCount !== value.rows.filter((row) => isNarratorRecord(row) && row.status !== "not-run").length
    || !hashPattern.test(String(value.contentHash))) return false;
  const loadStatus = value.load.status as NarratorEvaluationLoadStatus;
  const disposeStatus = value.dispose.status as NarratorEvaluationDisposeStatus;
  const rows = value.rows as NarratorCaseReceiptV1[];
  const artifactsMatch = narratorArtifactsMatchCandidate(value.verifiedArtifacts, candidate);
  const terminalStatuses = new Set<NarratorEvaluationCaseStatus>([
    "run-aborted", "worker-response-invalid", "realizer-timeout", "device-lost",
  ]);
  if (loadStatus === "ok") {
    if (!artifactsMatch) return false;
    let terminalSeen = false;
    for (const row of rows) {
      if (terminalSeen) {
        if (row.status !== "not-run") return false;
        continue;
      }
      if (row.status === "not-run") return false;
      if (terminalStatuses.has(row.status)) terminalSeen = true;
    }
    if ((terminalSeen && disposeStatus !== "hard-terminated")
      || (!terminalSeen && disposeStatus === "hard-terminated")) return false;
  } else {
    if (loadStatus === "artifact-mismatch" && artifactsMatch) return false;
    const abortShape = loadStatus === "aborted"
      && rows[0]?.status === "run-aborted"
      && rows.slice(1).every((row) => row.status === "not-run");
    const notRunShape = rows.every((row) => row.status === "not-run");
    if (!(abortShape || (loadStatus !== "aborted" && notRunShape))) return false;
    const requiresHardTermination = [
      "worker-binding-mismatch", "artifact-evidence-invalid", "artifact-mismatch", "model-id-mismatch",
      "load-timeout", "device-lost", "aborted",
    ].includes(loadStatus);
    if ((requiresHardTermination && disposeStatus !== "hard-terminated")
      || (!requiresHardTermination && disposeStatus === "hard-terminated")) return false;
  }
  const { contentHash, ...content } = value;
  return contentHash === canonicalHash(content);
}
