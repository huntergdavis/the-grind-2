import type { SceneMode } from "../core/types";

export const narratorProtocolVersion = 1 as const;
export const narratorMaximumRequestBytes = 8_192;
export const narratorMaximumResponseBytes = 2_048;
export const narratorMaximumPlaceCharacters = 120;
export const narratorMaximumFallbackCharacters = 180;
export const narratorMaximumOutputCharacters = 240;
export const narratorMaximumInputTokens = 320;
export const narratorMaximumOutputTokens = 48;

export type NarratorLifecycleState =
  | "off"
  | "available"
  | "loading"
  | "ready"
  | "cooldown"
  | "failed";

export type NarratorExecutionKind = "webgpu" | "wasm" | "none";
export type NarratorEnergy = "quiet" | "steady" | "heightened";
export type NarratorVoiceV1 = "spare-observer-v1" | "hero-aside-v1";
export type NarratorMoveV1 = "establish-setting" | "shade-atmosphere" | "register-pressure";

export interface PublicSceneFactsV1 {
  readonly schemaVersion: 1;
  readonly kind: "public-scene";
  readonly sceneKind: SceneMode;
  readonly place: string;
  readonly energy: NarratorEnergy;
}

export interface NarratorPromptV1 {
  readonly schemaVersion: 1;
  readonly task: "single-ambient-line";
  readonly voice: NarratorVoiceV1;
  readonly move: NarratorMoveV1;
  readonly facts: PublicSceneFactsV1;
}

export interface NarratorJobV1 {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly sourceFingerprint: string;
  readonly prompt: NarratorPromptV1;
  readonly deterministicFallback: string;
  readonly maximumInputTokens: 320;
  readonly maximumOutputTokens: 48;
}

export interface NarratorCapability {
  readonly execution: NarratorExecutionKind;
  readonly budget: "low-end" | "standard" | "unsupported";
  readonly storedWeightBudgetBytes: number;
  readonly incrementalMemoryBudgetBytes: number;
  readonly reason: string;
}

export interface NarratorModelBindingV1 {
  readonly modelId: string;
  readonly revision: string;
  readonly artifactManifestHash: string;
}

export interface NarratorModelAdmission {
  readonly id: string;
  readonly revision: string;
  readonly artifactManifestHash: string;
  readonly license: string;
  readonly storedWeightBytes: number;
  readonly incrementalMemoryBytes: number;
}

interface NarratorRequestBase {
  readonly protocolVersion: 1;
  readonly campaignId: string;
  readonly workerEpoch: string;
  readonly requestId: string;
}

export type NarratorRequestEnvelope =
  | (NarratorRequestBase & {
      readonly kind: "load";
      readonly payload: NarratorModelBindingV1;
    })
  | (NarratorRequestBase & {
      readonly kind: "realize";
      readonly payload: { readonly job: NarratorJobV1 };
    })
  | (NarratorRequestBase & {
      readonly kind: "cancel";
      readonly payload: { readonly targetRequestId: string };
    })
  | (NarratorRequestBase & {
      readonly kind: "dispose";
      readonly payload: Record<string, never>;
    });

export type NarratorWorkerErrorCode =
  | "invalidEnvelope"
  | "oversizedEnvelope"
  | "wrongProtocolVersion"
  | "unknownRequestKind"
  | "invalidPayload"
  | "wrongCampaign"
  | "wrongWorkerEpoch"
  | "duplicateConflict"
  | "notReady"
  | "backpressure"
  | "cancelled"
  | "invalidOutput"
  | "deviceLost"
  | "modelUnavailable"
  | "internalError";

interface NarratorResponseBase {
  readonly protocolVersion: 1;
  readonly campaignId: string;
  readonly workerEpoch: string;
  readonly requestId: string;
}

export type NarratorResponseEnvelope =
  | (NarratorResponseBase & {
      readonly kind: "status";
      readonly payload: {
        readonly state: NarratorLifecycleState;
        readonly modelId: string;
        readonly revision: string;
        readonly artifactManifestHash: string;
        readonly reason: string;
      };
    })
  | (NarratorResponseBase & {
      readonly kind: "result";
      readonly payload: {
        readonly eventId: string;
        readonly tick: number;
        readonly sourceFingerprint: string;
        readonly text: string;
        readonly outputTokens: number;
        readonly modelId: string;
        readonly revision: string;
        readonly artifactManifestHash: string;
      };
    })
  | (NarratorResponseBase & {
      readonly kind: "error";
      readonly payload: {
        readonly code: NarratorWorkerErrorCode;
        readonly message: string;
      };
    });

const sceneModes: readonly SceneMode[] = [
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "training",
  "discovery",
  "camp",
  "chronicle",
];
const energies: readonly NarratorEnergy[] = ["quiet", "steady", "heightened"];
const voices: readonly NarratorVoiceV1[] = ["spare-observer-v1", "hero-aside-v1"];
const moves: readonly NarratorMoveV1[] = ["establish-setting", "shade-atmosphere", "register-pressure"];
const lifecycleStates: readonly NarratorLifecycleState[] = ["off", "available", "loading", "ready", "cooldown", "failed"];
const workerErrorCodes: readonly NarratorWorkerErrorCode[] = [
  "invalidEnvelope",
  "oversizedEnvelope",
  "wrongProtocolVersion",
  "unknownRequestKind",
  "invalidPayload",
  "wrongCampaign",
  "wrongWorkerEpoch",
  "duplicateConflict",
  "notReady",
  "backpressure",
  "cancelled",
  "invalidOutput",
  "deviceLost",
  "modelUnavailable",
  "internalError",
];

export function narratorEnvelopeByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function isNarratorRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function narratorHasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isNarratorBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && value.normalize("NFC") === value
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

export function isNarratorModelBindingV1(value: unknown): value is NarratorModelBindingV1 {
  return isNarratorRecord(value)
    && narratorHasExactKeys(value, ["modelId", "revision", "artifactManifestHash"])
    && isNarratorBoundedText(value.modelId, 160)
    && /^[0-9a-f]{40}$/u.test(String(value.revision))
    && /^[0-9a-f]{16}$/u.test(String(value.artifactManifestHash));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isNarratorPromptV1(value: unknown): value is NarratorPromptV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, ["schemaVersion", "task", "voice", "move", "facts"])) return false;
  if (
    value.schemaVersion !== 1
    || value.task !== "single-ambient-line"
    || !voices.includes(value.voice as NarratorVoiceV1)
    || !moves.includes(value.move as NarratorMoveV1)
    || !isNarratorRecord(value.facts)
    || !narratorHasExactKeys(value.facts, ["schemaVersion", "kind", "sceneKind", "place", "energy"])
    || value.facts.schemaVersion !== 1
    || value.facts.kind !== "public-scene"
    || !sceneModes.includes(value.facts.sceneKind as SceneMode)
    || !isNarratorBoundedText(value.facts.place, narratorMaximumPlaceCharacters)
    || !energies.includes(value.facts.energy as NarratorEnergy)
  ) return false;
  return value.move === "register-pressure"
    ? value.voice === "hero-aside-v1"
    : value.voice === "spare-observer-v1";
}

export function isNarratorJobV1(value: unknown): value is NarratorJobV1 {
  if (!isNarratorRecord(value) || !narratorHasExactKeys(value, [
    "schemaVersion",
    "campaignId",
    "eventId",
    "tick",
    "sourceFingerprint",
    "prompt",
    "deterministicFallback",
    "maximumInputTokens",
    "maximumOutputTokens",
  ])) return false;
  return value.schemaVersion === 1
    && isNarratorBoundedText(value.campaignId, 160)
    && isNarratorBoundedText(value.eventId, 200)
    && isNonNegativeInteger(value.tick)
    && /^[0-9a-f]{16}$/u.test(String(value.sourceFingerprint))
    && isNarratorPromptV1(value.prompt)
    && isNarratorBoundedText(value.deterministicFallback, narratorMaximumFallbackCharacters)
    && value.maximumInputTokens === narratorMaximumInputTokens
    && value.maximumOutputTokens === narratorMaximumOutputTokens;
}

export function normalizeNarratorOutput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return isNarratorBoundedText(normalized, narratorMaximumOutputCharacters) ? normalized : null;
}

export function isNarratorResponseEnvelope(value: unknown): value is NarratorResponseEnvelope {
  if (!isNarratorRecord(value) || value.protocolVersion !== narratorProtocolVersion) return false;
  if (
    !narratorHasExactKeys(value, ["protocolVersion", "campaignId", "workerEpoch", "requestId", "kind", "payload"])
    || !isNarratorBoundedText(value.campaignId, 160)
    || !isNarratorBoundedText(value.workerEpoch, 200)
    || !isNarratorBoundedText(value.requestId, 240)
    || !isNarratorRecord(value.payload)
  ) return false;
  if (value.kind === "status") {
    return narratorHasExactKeys(value.payload, ["state", "modelId", "revision", "artifactManifestHash", "reason"])
      && lifecycleStates.includes(value.payload.state as NarratorLifecycleState)
      && isNarratorBoundedText(value.payload.modelId, 160)
      && /^[0-9a-f]{40}$/u.test(String(value.payload.revision))
      && /^[0-9a-f]{16}$/u.test(String(value.payload.artifactManifestHash))
      && isNarratorBoundedText(value.payload.reason, 240);
  }
  if (value.kind === "result") {
    return narratorHasExactKeys(value.payload, [
      "eventId",
      "tick",
      "sourceFingerprint",
      "text",
      "outputTokens",
      "modelId",
      "revision",
      "artifactManifestHash",
    ])
      && isNarratorBoundedText(value.payload.eventId, 200)
      && isNonNegativeInteger(value.payload.tick)
      && /^[0-9a-f]{16}$/u.test(String(value.payload.sourceFingerprint))
      && normalizeNarratorOutput(value.payload.text) === value.payload.text
      && Number.isSafeInteger(value.payload.outputTokens)
      && (value.payload.outputTokens as number) > 0
      && (value.payload.outputTokens as number) <= narratorMaximumOutputTokens
      && isNarratorBoundedText(value.payload.modelId, 160)
      && /^[0-9a-f]{40}$/u.test(String(value.payload.revision))
      && /^[0-9a-f]{16}$/u.test(String(value.payload.artifactManifestHash));
  }
  if (value.kind === "error") {
    return narratorHasExactKeys(value.payload, ["code", "message"])
      && workerErrorCodes.includes(value.payload.code as NarratorWorkerErrorCode)
      && isNarratorBoundedText(value.payload.message, 320);
  }
  return false;
}
