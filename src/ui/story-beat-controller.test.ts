import { describe, expect, it } from "vitest";
import type { StoryBeatClientResultV1 } from "../narrator/narrator-client";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import {
  createStoryBeatController,
  type StoryBeatUiSnapshot,
} from "./story-beat-controller";

function job(
  sourceFingerprint = "0123456789abcdef",
  eventId = "event:story-beat:1",
): StoryBeatJobV1 {
  return {
    schemaVersion: 1,
    task: "author-story-beat",
    disposition: "manual-ephemeral-noncanonical",
    campaignId: "campaign:story-beat",
    eventId,
    tick: 12,
    sourceFingerprint,
    facts: {
      schemaVersion: 1,
      kind: "public-story-beat",
      location: "Amber Crossing",
      headline: "The old bridge answers",
      action: "Rain rings against the old bridge",
      consequence: "The eastern path opens",
    },
    deterministicFallback: "The old bridge answers",
    maximumInputTokens: 320,
    maximumOutputTokens: 48,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("manual ephemeral story-beat controller", () => {
  it("does no work while AI is off and reveals no manual control", () => {
    let calls = 0;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return Promise.resolve({
            outcome: "fallback",
            source: "deterministic",
            text: "The old bridge answers",
            reason: "unavailable",
          });
        },
      },
    });

    controller.sync({ enabled: false, eligible: true, job: job() });

    expect(controller.snapshot).toMatchObject({
      phase: "hidden",
      visible: false,
      busy: false,
      line: null,
    });
    expect(controller.write()).toBe(false);
    expect(calls).toBe(0);
  });

  it("shows the deterministic headline synchronously, then replaces only that scene with validated local prose", async () => {
    const pending = deferred<StoryBeatClientResultV1>();
    const snapshots: StoryBeatUiSnapshot[] = [];
    const controller = createStoryBeatController({
      author: { authorStoryBeat: () => pending.promise },
      onChange: (snapshot) => snapshots.push(snapshot),
    });
    const source = job();
    controller.sync({ enabled: true, eligible: true, job: source });

    expect(controller.write()).toBe(true);
    expect(controller.snapshot).toMatchObject({
      phase: "writing",
      visible: true,
      busy: true,
      line: {
        source: "deterministic",
        text: source.deterministicFallback,
        sourceFingerprint: source.sourceFingerprint,
      },
    });
    expect(controller.snapshot.announcement).toContain("Safe Chronicle headline shown");

    pending.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, rain rings against the old bridge.",
    });
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      phase: "authored",
      visible: true,
      busy: false,
      line: {
        source: "model",
        text: "At Amber Crossing, rain rings against the old bridge.",
        sourceFingerprint: source.sourceFingerprint,
      },
    });
    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual([
      "ready",
      "writing",
      "authored",
    ]);
  });

  it("drops a late model response after scene identity changes", async () => {
    const pending = deferred<StoryBeatClientResultV1>();
    let calls = 0;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return pending.promise;
        },
      },
    });
    const first = job();
    const second = job("fedcba9876543210", "event:story-beat:2");
    controller.sync({ enabled: true, eligible: true, job: first });
    controller.write();
    controller.sync({ enabled: true, eligible: true, job: second });

    pending.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, rain rings against the old bridge.",
    });
    await flushPromises();

    expect(calls).toBe(1);
    expect(controller.snapshot).toMatchObject({
      phase: "ready",
      sourceFingerprint: second.sourceFingerprint,
      line: null,
    });
  });

  it("cancels and clears ephemeral output when battle, cutaway, or hidden context makes it ineligible", async () => {
    const pending = deferred<StoryBeatClientResultV1>();
    const controller = createStoryBeatController({
      author: { authorStoryBeat: () => pending.promise },
    });
    const source = job();
    controller.sync({ enabled: true, eligible: true, job: source });
    controller.write();
    controller.sync({ enabled: true, eligible: false, job: source });

    expect(controller.snapshot).toMatchObject({
      phase: "hidden",
      visible: false,
      line: null,
      announcement: "",
    });

    pending.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, rain rings against the old bridge.",
    });
    await flushPromises();
    expect(controller.snapshot.phase).toBe("hidden");
    expect(controller.snapshot.line).toBeNull();
  });

  it("keeps the safe headline on fallback, invalid prose, rejection, and explicit cancellation", async () => {
    const results: Array<Promise<StoryBeatClientResultV1>> = [
      Promise.resolve({
        outcome: "fallback",
        source: "deterministic",
        text: "The old bridge answers",
        reason: "cooldown",
      }),
      Promise.resolve({
        outcome: "authored",
        source: "model",
        text: "A stranger promises treasure tomorrow.",
      }),
      Promise.reject(new Error("transport failed")),
    ];
    const controller = createStoryBeatController({
      author: { authorStoryBeat: () => results.shift()! },
    });
    const source = job();
    controller.sync({ enabled: true, eligible: true, job: source });

    controller.write();
    await flushPromises();
    expect(controller.snapshot).toMatchObject({
      phase: "fallback",
      fallbackReason: "cooldown",
      line: { source: "deterministic", text: source.deterministicFallback },
    });

    controller.write();
    await flushPromises();
    expect(controller.snapshot).toMatchObject({
      phase: "fallback",
      fallbackReason: "invalid-output",
      line: { source: "deterministic", text: source.deterministicFallback },
    });

    controller.write();
    await flushPromises();
    expect(controller.snapshot.fallbackReason).toBe("transport-failure");
    expect(controller.cancel()).toBe(true);
    expect(controller.snapshot).toMatchObject({ phase: "ready", line: null });
  });
});
