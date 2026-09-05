import { describe, expect, it } from "vitest";
import {
  isNarratorResponseEnvelope,
  type NarratorResponseEnvelope,
} from "./protocol";
import { storyBeatMaximumOutputTokens } from "./story-beat";
import {
  isNarratorTransportResponseEnvelope,
  type StoryBeatNarratorResponseEnvelopeV1,
} from "./story-beat-worker-protocol";

const base = Object.freeze({
  protocolVersion: 1 as const,
  campaignId: "campaign:story-beat-protocol",
  workerEpoch: "epoch:story-beat-protocol",
  requestId: "request:story-beat-protocol",
});

const binding = Object.freeze({
  modelId: "test-story-beat-model",
  revision: "a".repeat(40),
  artifactManifestHash: "b".repeat(16),
});

const authored: StoryBeatNarratorResponseEnvelopeV1 = {
  ...base,
  kind: "story-beat-result",
  payload: {
    outcome: "authored",
    eventId: "chronicle:story-beat:7",
    tick: 7,
    sourceFingerprint: "0123456789abcdef",
    text: "At Moonclock Vault, Mira crosses the quiet threshold.",
    outputTokens: 12,
    ...binding,
  },
};

const fallback: StoryBeatNarratorResponseEnvelopeV1 = {
  ...base,
  kind: "story-beat-result",
  payload: {
    outcome: "fallback",
    eventId: "chronicle:story-beat:7",
    tick: 7,
    sourceFingerprint: "0123456789abcdef",
    reason: "invalid-output",
    ...binding,
  },
};

describe("story-beat worker protocol boundary", () => {
  it("accepts exact authored and no-text fallback envelopes", () => {
    expect(isNarratorTransportResponseEnvelope(structuredClone(authored))).toBe(true);
    expect(isNarratorTransportResponseEnvelope(structuredClone(fallback))).toBe(true);
    expect(JSON.stringify(fallback)).not.toContain("text");
  });

  it("rejects extra keys, token overflow, forged identities, and fallback text", () => {
    const hostile: readonly unknown[] = [
      { ...authored, extra: true },
      { ...authored, payload: { ...authored.payload, extra: true } },
      {
        ...authored,
        payload: {
          ...authored.payload,
          outputTokens: storyBeatMaximumOutputTokens + 1,
        },
      },
      {
        ...authored,
        payload: { ...authored.payload, sourceFingerprint: "A".repeat(16) },
      },
      {
        ...fallback,
        payload: { ...fallback.payload, text: "A dragon grants 500 gold." },
      },
      {
        ...fallback,
        payload: { ...fallback.payload, reason: "accept-anyway" },
      },
    ];
    for (const candidate of hostile) {
      expect(isNarratorTransportResponseEnvelope(candidate)).toBe(false);
    }
  });

  it("fails closed when hostile proxy keys or getters throw", () => {
    const ownKeysTrap = new Proxy(authored, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    const getterTrap = new Proxy(authored, {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() => isNarratorTransportResponseEnvelope(ownKeysTrap)).not.toThrow();
    expect(() => isNarratorTransportResponseEnvelope(getterTrap)).not.toThrow();
    expect(isNarratorTransportResponseEnvelope(ownKeysTrap)).toBe(false);
    expect(isNarratorTransportResponseEnvelope(getterTrap)).toBe(false);
  });

  it("delegates unchanged ambient envelopes to the original protocol guard", () => {
    const ambient: NarratorResponseEnvelope = {
      ...base,
      kind: "status",
      payload: {
        state: "ready",
        ...binding,
        reason: "model ready",
      },
    };
    const before = JSON.stringify(ambient);
    expect(isNarratorResponseEnvelope(ambient)).toBe(true);
    expect(isNarratorTransportResponseEnvelope(ambient)).toBe(true);
    expect(JSON.stringify(ambient)).toBe(before);
  });
});
