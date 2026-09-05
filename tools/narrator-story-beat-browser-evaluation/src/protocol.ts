export const browserStoryBeatProtocolVersion = 1 as const;
export const browserStoryBeatExpectedHoldoutCorpusHash = "d88a61b1639188c0" as const;
export const browserStoryBeatExpectedHoldoutSha256 = "140995fd6888c14fec1ea5dd3fd79aeaa4c1ad230f6d4ce50e5ecca10db1f079" as const;
export const browserStoryBeatRepresentativeIndexes = Object.freeze([
  4, 7, 8, 20, 30, 58, 63, 70, 79, 89, 91, 107, 126, 147, 175, 177, 189, 191,
] as const);

export interface BrowserStoryBeatArtifactV1 {
  readonly path: string;
  readonly url: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface BrowserStoryBeatStagedArtifactV1 {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
}

export interface BrowserStoryBeatStageRequestV1 {
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly modelAggregateSha256: string;
  readonly holdout: BrowserStoryBeatArtifactV1;
  readonly modelArtifacts: readonly BrowserStoryBeatArtifactV1[];
  readonly runtimeArtifacts: readonly BrowserStoryBeatArtifactV1[];
  readonly selectedIndexes: readonly number[];
}

export interface BrowserStoryBeatCaseResultV1 {
  readonly index: number;
  readonly id: string;
  readonly caseHash: string;
  readonly candidate: string;
  readonly valid: boolean;
  readonly fallbackRequired: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
}

export type BrowserStoryBeatWorkerRequestV1 =
  | {
      readonly protocolVersion: 1;
      readonly kind: "initialize";
      readonly runId: string;
      readonly operationId: string;
      readonly modelAggregateSha256: string;
      readonly holdoutSha256: string;
      readonly holdoutBytes: ArrayBuffer;
      readonly modelArtifacts: readonly BrowserStoryBeatStagedArtifactV1[];
      readonly runtimeArtifacts: readonly BrowserStoryBeatStagedArtifactV1[];
      readonly selectedIndexes: readonly number[];
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "run";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "dispose";
      readonly runId: string;
      readonly operationId: string;
    };

export type BrowserStoryBeatWorkerResponseV1 =
  | {
      readonly protocolVersion: 1;
      readonly kind: "initialized";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "complete";
      readonly runId: string;
      readonly operationId: string;
      readonly loadElapsedMs: number;
      readonly tokenizerVerified: true;
      readonly results: readonly BrowserStoryBeatCaseResultV1[];
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "disposed";
      readonly runId: string;
      readonly operationId: string;
    }
  | {
      readonly protocolVersion: 1;
      readonly kind: "failed";
      readonly runId: string;
      readonly operationId: string;
      readonly reason: string;
    };

export interface BrowserStoryBeatHarnessV1 {
  readonly protocolVersion: 1;
  stage(request: BrowserStoryBeatStageRequestV1): Promise<void>;
  run(timeoutMs: number): Promise<{
    readonly loadElapsedMs: number;
    readonly tokenizerVerified: true;
    readonly results: readonly BrowserStoryBeatCaseResultV1[];
  }>;
  dispose(): Promise<void>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

export function isStoryBeatAcquisitionUrl(value: unknown, trustedOrigin: string): boolean {
  if (typeof value !== "string" || value.includes("%")) return false;
  try {
    const url = new URL(value, trustedOrigin);
    return url.origin === new URL(trustedOrigin).origin
      && url.username === "" && url.password === ""
      && url.search === "" && url.hash === ""
      && /^\/__story_beat_evaluation_staging__\/(?:holdout|model|runtime)\/\d+$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function isCaseResult(value: unknown): value is BrowserStoryBeatCaseResultV1 {
  return hasExactKeys(value, [
    "candidate", "caseHash", "elapsedMs", "fallbackRequired", "id", "index",
    "inputTokens", "outputTokens", "valid",
  ])
    && Number.isSafeInteger(value.index) && Number(value.index) >= 0
    && isBoundedIdentity(value.id)
    && typeof value.caseHash === "string" && /^[0-9a-f]{16}$/u.test(value.caseHash)
    && typeof value.candidate === "string" && value.candidate.length <= 2_000
    && typeof value.valid === "boolean"
    && value.fallbackRequired === !value.valid
    && Number.isSafeInteger(value.inputTokens) && Number(value.inputTokens) >= 1 && Number(value.inputTokens) <= 320
    && Number.isSafeInteger(value.outputTokens) && Number(value.outputTokens) >= 1 && Number(value.outputTokens) <= 48
    && Number.isSafeInteger(value.elapsedMs) && Number(value.elapsedMs) >= 0;
}

export function isWorkerResponseForRequest(
  value: unknown,
  request: BrowserStoryBeatWorkerRequestV1,
): value is BrowserStoryBeatWorkerResponseV1 {
  if (!isRecord(value)
    || value.protocolVersion !== browserStoryBeatProtocolVersion
    || value.runId !== request.runId
    || value.operationId !== request.operationId) return false;
  if (value.kind === "initialized" || value.kind === "disposed") {
    return hasExactKeys(value, ["kind", "operationId", "protocolVersion", "runId"]);
  }
  if (value.kind === "failed") {
    return hasExactKeys(value, ["kind", "operationId", "protocolVersion", "reason", "runId"])
      && isBoundedIdentity(value.reason, 240);
  }
  return value.kind === "complete"
    && hasExactKeys(value, [
      "kind", "loadElapsedMs", "operationId", "protocolVersion", "results", "runId", "tokenizerVerified",
    ])
    && value.tokenizerVerified === true
    && Number.isSafeInteger(value.loadElapsedMs) && Number(value.loadElapsedMs) >= 0
    && Array.isArray(value.results) && value.results.every(isCaseResult);
}
