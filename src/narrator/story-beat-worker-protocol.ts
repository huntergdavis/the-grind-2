import {
  isNarratorBoundedText,
  isNarratorRecord,
  isNarratorResponseEnvelope,
  narratorHasExactKeys,
  narratorProtocolVersion,
  type NarratorRequestEnvelope,
  type NarratorResponseEnvelope,
} from "./protocol";
import {
  storyBeatMaximumOutputCharacters,
  storyBeatMaximumOutputTokens,
  type StoryBeatJobV1,
} from "./story-beat";

export type StoryBeatWorkerFallbackReasonV1 = "invalid-output";

interface StoryBeatNarratorRequestBase {
  readonly protocolVersion: 1;
  readonly campaignId: string;
  readonly workerEpoch: string;
  readonly requestId: string;
}

export type StoryBeatNarratorRequestEnvelopeV1 =
  StoryBeatNarratorRequestBase & {
    readonly kind: "author-story-beat";
    readonly payload: { readonly job: StoryBeatJobV1 };
  };

interface StoryBeatNarratorResponseBase {
  readonly protocolVersion: 1;
  readonly campaignId: string;
  readonly workerEpoch: string;
  readonly requestId: string;
}

export type StoryBeatNarratorResponseEnvelopeV1 =
  StoryBeatNarratorResponseBase & {
    readonly kind: "story-beat-result";
    readonly payload:
      | {
          readonly outcome: "authored";
          readonly eventId: string;
          readonly tick: number;
          readonly sourceFingerprint: string;
          readonly text: string;
          readonly outputTokens: number;
          readonly modelId: string;
          readonly revision: string;
          readonly artifactManifestHash: string;
        }
      | {
          readonly outcome: "fallback";
          readonly eventId: string;
          readonly tick: number;
          readonly sourceFingerprint: string;
          readonly reason: StoryBeatWorkerFallbackReasonV1;
          readonly modelId: string;
          readonly revision: string;
          readonly artifactManifestHash: string;
        };
  };

export type NarratorTransportRequestEnvelope =
  | NarratorRequestEnvelope
  | StoryBeatNarratorRequestEnvelopeV1;

export type NarratorTransportResponseEnvelope =
  | NarratorResponseEnvelope
  | StoryBeatNarratorResponseEnvelopeV1;

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isNarratorTransportResponseEnvelope(
  value: unknown,
): value is NarratorTransportResponseEnvelope {
  try {
    if (isNarratorResponseEnvelope(value)) return true;
    if (
      !isNarratorRecord(value)
      || value.protocolVersion !== narratorProtocolVersion
      || !narratorHasExactKeys(value, [
        "protocolVersion",
        "campaignId",
        "workerEpoch",
        "requestId",
        "kind",
        "payload",
      ])
      || !isNarratorBoundedText(value.campaignId, 160)
      || !isNarratorBoundedText(value.workerEpoch, 200)
      || !isNarratorBoundedText(value.requestId, 240)
      || value.kind !== "story-beat-result"
      || !isNarratorRecord(value.payload)
    ) return false;

    const identityIsValid = isNarratorBoundedText(value.payload.eventId, 200)
      && isNonNegativeInteger(value.payload.tick)
      && /^[0-9a-f]{16}$/u.test(String(value.payload.sourceFingerprint))
      && isNarratorBoundedText(value.payload.modelId, 160)
      && /^[0-9a-f]{40}$/u.test(String(value.payload.revision))
      && /^[0-9a-f]{16}$/u.test(String(value.payload.artifactManifestHash));
    if (!identityIsValid) return false;
    if (value.payload.outcome === "authored") {
      return narratorHasExactKeys(value.payload, [
        "outcome",
        "eventId",
        "tick",
        "sourceFingerprint",
        "text",
        "outputTokens",
        "modelId",
        "revision",
        "artifactManifestHash",
      ])
        && isNarratorBoundedText(value.payload.text, storyBeatMaximumOutputCharacters)
        && Number.isSafeInteger(value.payload.outputTokens)
        && (value.payload.outputTokens as number) > 0
        && (value.payload.outputTokens as number) <= storyBeatMaximumOutputTokens;
    }
    return value.payload.outcome === "fallback"
      && narratorHasExactKeys(value.payload, [
        "outcome",
        "eventId",
        "tick",
        "sourceFingerprint",
        "reason",
        "modelId",
        "revision",
        "artifactManifestHash",
      ])
      && value.payload.reason === "invalid-output";
  } catch {
    return false;
  }
}
