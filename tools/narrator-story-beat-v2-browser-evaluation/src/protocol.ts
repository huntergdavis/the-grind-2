export const browserFactualStoryBeatProtocolVersion = 2 as const;
export const browserFactualStoryBeatExpectedHoldoutCorpusHash =
  "164200f6c558639e" as const;
export const browserFactualStoryBeatExpectedHoldoutSha256 =
  "2d6c11b3f295bb355c8b84dd659bc48692febc48f26b33d98cb1d865ae23c1fc" as const;
export const browserFactualStoryBeatExpectedModelAggregateSha256 =
  "3b1175e099212819c76de4d471f0e0084c3b87bc2d234b3b5e70a46076424edb" as const;
export const browserFactualStoryBeatRepresentativeIndexes = Object.freeze([
  0, 3, 10, 20, 24, 29, 30, 38, 43, 45, 46, 49,
  56, 61, 73, 81, 102, 104, 105, 106, 108, 113, 114, 124,
  131, 136, 139, 143, 147, 148, 152, 157, 161, 167, 170, 195,
] as const);

export type BrowserFactualStoryBeatPresentationBucketIdV2 =
  "prefix-as" | "prefix-while" | "interior-as" | "interior-while"
  | "suffix-as" | "suffix-while";

export interface BrowserFactualStoryBeatArtifactV2 {
  readonly path: string;
  readonly url: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface BrowserFactualStoryBeatStagedArtifactV2 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
}

export interface BrowserFactualStoryBeatStageRequestV2 {
  readonly protocolVersion: 2;
  readonly runId: string;
  readonly modelAggregateSha256: string;
  readonly holdout: BrowserFactualStoryBeatArtifactV2;
  readonly modelArtifacts: readonly BrowserFactualStoryBeatArtifactV2[];
  readonly runtimeArtifacts: readonly BrowserFactualStoryBeatArtifactV2[];
  readonly selectedIndexes: readonly number[];
}

export interface BrowserFactualStoryBeatCaseResultV2 {
  readonly index: number;
  readonly id: string;
  readonly caseHash: string;
  readonly candidate: string;
  readonly valid: boolean;
  readonly fallbackRequired: boolean;
  readonly exactPlace: boolean;
  readonly requiredClausesComplete: boolean;
  readonly sequenceSlot: number;
  readonly presentationBucketId: BrowserFactualStoryBeatPresentationBucketIdV2;
  readonly formId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
}

export type BrowserFactualStoryBeatWorkerRequestV2 =
  | {
      readonly protocolVersion: 2;
      readonly kind: "initialize";
      readonly runId: string;
      readonly operationId: string;
      readonly modelAggregateSha256: string;
      readonly holdoutSha256: string;
      readonly holdoutBytes: ArrayBuffer;
      readonly modelArtifacts: readonly BrowserFactualStoryBeatStagedArtifactV2[];
      readonly runtimeArtifacts: readonly BrowserFactualStoryBeatStagedArtifactV2[];
      readonly selectedIndexes: readonly number[];
    }
  | {
      readonly protocolVersion: 2;
      readonly kind: "run";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 2;
      readonly kind: "dispose";
      readonly runId: string;
      readonly operationId: string;
    };

export type BrowserFactualStoryBeatWorkerResponseV2 =
  | {
      readonly protocolVersion: 2;
      readonly kind: "initialized";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 2;
      readonly kind: "complete";
      readonly runId: string;
      readonly operationId: string;
      readonly loadElapsedMs: number;
      readonly tokenizerVerified: true;
      readonly results: readonly BrowserFactualStoryBeatCaseResultV2[];
    }
  | {
      readonly protocolVersion: 2;
      readonly kind: "disposed";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 2;
      readonly kind: "failed";
      readonly runId: string;
      readonly operationId: string;
      readonly reason: string;
    };

export interface BrowserFactualStoryBeatHarnessV2 {
  readonly protocolVersion: 2;
  stage(request: BrowserFactualStoryBeatStageRequestV2): Promise<void>;
  run(timeoutMs: number): Promise<{
    readonly loadElapsedMs: number;
    readonly tokenizerVerified: true;
    readonly results: readonly BrowserFactualStoryBeatCaseResultV2[];
  }>;
  dispose(): Promise<void>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

export function isBoundedIdentity(value: unknown, maximum = 160): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function isFactualStoryBeatAcquisitionUrl(
  value: unknown,
  trustedOrigin: string,
): boolean {
  if (typeof value !== "string" || value.includes("%")) return false;
  try {
    const url = new URL(value, trustedOrigin);
    return url.origin === new URL(trustedOrigin).origin
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === ""
      && /^\/__factual_story_beat_v2_evaluation_staging__\/(?:holdout|model|runtime)\/\d+$/u
        .test(url.pathname);
  } catch {
    return false;
  }
}

function isPresentationBucket(
  value: unknown,
): value is BrowserFactualStoryBeatPresentationBucketIdV2 {
  return typeof value === "string"
    && [
      "prefix-as",
      "prefix-while",
      "interior-as",
      "interior-while",
      "suffix-as",
      "suffix-while",
    ].includes(value);
}

export function isCaseResult(
  value: unknown,
): value is BrowserFactualStoryBeatCaseResultV2 {
  return hasExactKeys(value, [
    "candidate", "caseHash", "elapsedMs", "exactPlace", "fallbackRequired",
    "formId", "id", "index", "inputTokens", "outputTokens",
    "presentationBucketId", "requiredClausesComplete", "sequenceSlot", "valid",
  ])
    && Number.isSafeInteger(value.index) && Number(value.index) >= 0
    && isBoundedIdentity(value.id)
    && typeof value.caseHash === "string" && /^[0-9a-f]{16}$/u.test(value.caseHash)
    && typeof value.candidate === "string" && value.candidate.length <= 2_000
    && typeof value.valid === "boolean"
    && value.fallbackRequired === !value.valid
    && typeof value.exactPlace === "boolean"
    && typeof value.requiredClausesComplete === "boolean"
    && Number.isSafeInteger(value.sequenceSlot) && Number(value.sequenceSlot) >= 0
    && isPresentationBucket(value.presentationBucketId)
    && isBoundedIdentity(value.formId, 160)
    && Number.isSafeInteger(value.inputTokens)
    && Number(value.inputTokens) >= 1
    && Number(value.inputTokens) <= 384
    && Number.isSafeInteger(value.outputTokens)
    && Number(value.outputTokens) >= 1
    && Number(value.outputTokens) <= 48
    && Number.isSafeInteger(value.elapsedMs)
    && Number(value.elapsedMs) >= 0;
}

export function isWorkerResponseForRequest(
  value: unknown,
  request: BrowserFactualStoryBeatWorkerRequestV2,
): value is BrowserFactualStoryBeatWorkerResponseV2 {
  if (!isRecord(value)
    || value.protocolVersion !== browserFactualStoryBeatProtocolVersion
    || value.runId !== request.runId
    || value.operationId !== request.operationId) return false;
  if (value.kind === "initialized" || value.kind === "disposed") {
    return hasExactKeys(value, ["kind", "operationId", "protocolVersion", "runId"]);
  }
  if (value.kind === "failed") {
    return hasExactKeys(
      value,
      ["kind", "operationId", "protocolVersion", "reason", "runId"],
    ) && isBoundedIdentity(value.reason, 240);
  }
  return value.kind === "complete"
    && hasExactKeys(value, [
      "kind", "loadElapsedMs", "operationId", "protocolVersion", "results",
      "runId", "tokenizerVerified",
    ])
    && value.tokenizerVerified === true
    && Number.isSafeInteger(value.loadElapsedMs)
    && Number(value.loadElapsedMs) >= 0
    && Array.isArray(value.results)
    && value.results.every(isCaseResult);
}
