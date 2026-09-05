import { describe, expect, it } from "vitest";
import type {
  StoryBeatClientFallbackReasonV1,
  StoryBeatClientResultV1,
} from "../narrator/narrator-client";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import {
  createStoryBeatController,
  storyBeatFallbackPresentation,
  type StoryBeatUiSnapshot,
} from "./story-beat-controller";

const fallbackPresentationCases = [
  {
    reason: "invalid-job",
    label: "Scene changed · safe",
    announcement: "The scene changed before local drafting could finish. The safe Chronicle headline remains.",
  },
  {
    reason: "unavailable",
    label: "Local unavailable · safe",
    announcement: "Local drafting is unavailable on this device. The safe Chronicle headline remains.",
  },
  {
    reason: "suppressed",
    label: "Local drafting paused · safe",
    announcement: "Local drafting is paused for this view. The safe Chronicle headline remains.",
  },
  {
    reason: "backpressure",
    label: "Local narrator busy · safe",
    announcement: "The local narrator is busy. The safe Chronicle headline remains.",
  },
  {
    reason: "input-budget",
    label: "Scene too large · safe",
    announcement: "This scene is too large for a local draft. The safe Chronicle headline remains.",
  },
  {
    reason: "cooldown",
    label: "Local narrator busy · safe",
    announcement: "The local narrator is busy. The safe Chronicle headline remains.",
  },
  {
    reason: "invalid-output",
    label: "Draft set aside · safe",
    announcement: "The local draft was set aside. The safe Chronicle headline remains.",
  },
  {
    reason: "stale",
    label: "Scene changed · safe",
    announcement: "The scene changed before local drafting could finish. The safe Chronicle headline remains.",
  },
  {
    reason: "transport-failure",
    label: "Local interrupted · safe",
    announcement: "Local drafting was interrupted on this device. The safe Chronicle headline remains.",
  },
] as const satisfies readonly {
  readonly reason: StoryBeatClientFallbackReasonV1;
  readonly label: string;
  readonly announcement: string;
}[];

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

const recentDraftCandidates = Object.freeze([
  "At Amber Crossing, rain rings across amber stone.",
  "At Amber Crossing, wind turns beside silver road.",
  "At Amber Crossing, lantern light marks quiet water.",
  "At Amber Crossing, the eastern path opens beside cedar bells.",
  "At Amber Crossing, shadow falls across bronze rail.",
  "At Amber Crossing, morning settles over moss gate.",
  "At Amber Crossing, river bends past painted post.",
  "At Amber Crossing, birds circle above old tower.",
  "At Amber Crossing, the cart waits near western arch.",
]);

function richJob(index: number, campaignId = "campaign:story-beat"): StoryBeatJobV1 {
  const base = job(index.toString(16).padStart(16, "0"), `event:story-beat:${index}`);
  const facts = {
    ...base.facts,
    headline: "The old bridge answers.",
    action: [
      "Rain rings across amber stone.",
      "Wind turns beside silver road.",
      "Lantern light marks quiet water.",
      "The eastern path opens beside cedar bells.",
    ].join(" "),
    consequence: [
      "Shadow falls across bronze rail.",
      "Morning settles over moss gate.",
      "River bends past painted post.",
      "Birds circle above old tower.",
      "The cart waits near western arch.",
    ].join(" "),
  } as const;
  return {
    ...base,
    campaignId,
    tick: index,
    facts,
    deterministicFallback: facts.headline,
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

  it("sets aside a headline echo without ever exposing model text", async () => {
    const rejected = "At Amber Crossing, the old bridge answers.";
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => Promise.resolve({
          outcome: "authored",
          source: "model",
          text: rejected,
        }),
      },
    });
    const source = richJob(1);
    controller.sync({ enabled: true, eligible: true, job: source });

    expect(controller.write()).toBe(true);
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      phase: "fallback",
      fallbackReason: "invalid-output",
      announcement: "The local draft was set aside. The safe Chronicle headline remains.",
      line: {
        source: "deterministic",
        text: source.deterministicFallback,
      },
    });
    expect(controller.snapshot.line?.text).not.toBe(rejected);
  });

  it.each(fallbackPresentationCases)(
    "maps $reason to concise local status while preserving the canonical fallback",
    async ({ reason, label, announcement }) => {
      const controller = createStoryBeatController({
        author: {
          authorStoryBeat: () => Promise.resolve({
            outcome: "fallback",
            source: "deterministic",
            text: "Caller-supplied fallback must not render.",
            reason,
          }),
        },
      });
      const source = job();
      controller.sync({ enabled: true, eligible: true, job: source });

      expect(controller.write()).toBe(true);
      await flushPromises();

      expect(storyBeatFallbackPresentation(reason)).toEqual({ label, announcement });
      expect(controller.snapshot).toMatchObject({
        phase: "fallback",
        fallbackReason: reason,
        announcement,
        line: {
          source: "deterministic",
          text: source.deterministicFallback,
          sourceFingerprint: source.sourceFingerprint,
        },
      });
      expect(controller.snapshot.announcement).not.toMatch(
        /invalid-job|suppressed|backpressure|input-budget|cooldown|invalid-output|stale|transport-failure/,
      );
    },
  );

  it("drops a late model response after scene identity changes", async () => {
    const pending = deferred<StoryBeatClientResultV1>();
    let calls = 0;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return calls === 1
            ? pending.promise
            : Promise.resolve({
              outcome: "authored",
              source: "model",
              text: "At Amber Crossing, rain rings against the old bridge.",
            });
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

    expect(controller.write()).toBe(true);
    await flushPromises();
    expect(controller.snapshot).toMatchObject({
      phase: "authored",
      line: {
        source: "model",
        text: "At Amber Crossing, rain rings against the old bridge.",
      },
    });
  });

  it("retains accepted drafts across hiding but clears them on AI disable, campaign change, and dispose", async () => {
    let candidate = recentDraftCandidates[0]!;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => Promise.resolve({
          outcome: "authored",
          source: "model",
          text: candidate,
        }),
      },
    });
    const settle = async (
      source: StoryBeatJobV1,
      enabled = true,
      eligible = true,
    ) => {
      controller.sync({ enabled, eligible, job: source });
      if (enabled && eligible) {
        expect(controller.write()).toBe(true);
        await flushPromises();
      }
    };

    await settle(richJob(1));
    expect(controller.snapshot.phase).toBe("authored");
    controller.sync({ enabled: true, eligible: false, job: richJob(2) });
    await settle(richJob(2));
    expect(controller.snapshot.fallbackReason).toBe("invalid-output");

    controller.sync({ enabled: false, eligible: true, job: richJob(3) });
    await settle(richJob(3));
    expect(controller.snapshot.phase).toBe("authored");

    await settle(richJob(4, "campaign:other"));
    expect(controller.snapshot.phase).toBe("authored");

    controller.dispose();
    await settle(richJob(5, "campaign:other"));
    expect(controller.snapshot.phase).toBe("authored");
  });

  it("retains exactly eight accepted signatures and never records a rejected repeat", async () => {
    let candidate = recentDraftCandidates[0]!;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => Promise.resolve({
          outcome: "authored",
          source: "model",
          text: candidate,
        }),
      },
    });
    const settle = async (index: number, text: string) => {
      candidate = text;
      controller.sync({ enabled: true, eligible: true, job: richJob(index) });
      expect(controller.write()).toBe(true);
      await flushPromises();
    };

    for (let index = 0; index < 8; index += 1) {
      await settle(index + 1, recentDraftCandidates[index]!);
      expect(controller.snapshot.phase, `accepted ${index + 1}`).toBe("authored");
    }
    await settle(9, recentDraftCandidates[0]!);
    expect(controller.snapshot.fallbackReason).toBe("invalid-output");

    await settle(10, recentDraftCandidates[8]!);
    expect(controller.snapshot.phase).toBe("authored");
    await settle(11, recentDraftCandidates[0]!);
    expect(controller.snapshot.phase).toBe("authored");
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
