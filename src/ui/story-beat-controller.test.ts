import { describe, expect, it } from "vitest";
import type {
  StoryBeatClientFallbackReasonV1,
  StoryBeatClientResultV1,
} from "../narrator/narrator-client";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import type { StoryBeatAuthoringJob } from "../narrator/story-beat-authoring";
import {
  copyStoryBeatTrailPlainText,
  createStoryBeatController,
  formatStoryBeatTrailPlainText,
  storyBeatFallbackPresentation,
  storyBeatLensLabel,
  storyBeatSourceIdentity,
  storyBeatWriteLabel,
  type StoryBeatTrailEntry,
  type StoryBeatUiPhase,
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
    label: "Local narrator cooling down · safe",
    announcement: "Local drafting is cooling down. Try again shortly; the safe Chronicle headline remains.",
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
  it("formats and copies only visible Story Trail prose as deterministic plain text", async () => {
    const trail: readonly StoryBeatTrailEntry[] = Object.freeze([
      Object.freeze({
        campaignId: "campaign:hidden",
        eventId: "event:hidden:1",
        tick: 41,
        sourceFingerprint: "abcdef0123456789",
        location: "Briarford",
        lensId: "cost",
        spotlit: true,
        text: "At Briarford, the party pays 1 resolve.",
      }),
      Object.freeze({
        campaignId: "campaign:hidden",
        eventId: "event:hidden:2",
        tick: 42,
        sourceFingerprint: "0123456789abcdef",
        location: "Cinder Vale",
        lensId: null,
        spotlit: false,
        text: "At Cinder Vale, lanterns mark the eastern path.",
      }),
    ]);
    const expected = [
      "The Grind 2 — Session Story Trail",
      "Ephemeral local drafts · Noncanonical",
      "",
      "1. ★ SPOTLIGHT · Briarford · Cost",
      "At Briarford, the party pays 1 resolve.",
      "",
      "2. Cinder Vale",
      "At Cinder Vale, lanterns mark the eastern path.",
    ].join("\n");
    expect(formatStoryBeatTrailPlainText(trail)).toBe(expected);
    expect(expected).not.toMatch(/campaign:hidden|event:hidden|abcdef0123456789|0123456789abcdef|41|42/);

    const writes: string[] = [];
    await expect(copyStoryBeatTrailPlainText(trail, (text) => {
      writes.push(text);
      return Promise.resolve();
    })).resolves.toBe("copied");
    expect(writes).toEqual([expected]);

    await expect(copyStoryBeatTrailPlainText(trail, () => (
      Promise.reject(new DOMException("denied", "NotAllowedError"))
    ))).resolves.toBe("unavailable");
    let emptyWrites = 0;
    await expect(copyStoryBeatTrailPlainText([], () => {
      emptyWrites += 1;
      return Promise.resolve();
    })).resolves.toBe("empty");
    expect(emptyWrites).toBe(0);
    expect(formatStoryBeatTrailPlainText([])).toBeNull();
  });

  it.each([
    { lensId: "cost", label: "Cost" },
    { lensId: "consequence", label: "Change" },
    { lensId: "contrast", label: "Cost + change" },
    { lensId: null, label: null },
  ] as const)("maps the $lensId mechanic lens to $label", ({ lensId, label }) => {
    expect(storyBeatLensLabel(lensId)).toBe(label);
  });

  it.each([
    { phase: "hidden", label: "Write this beat" },
    { phase: "ready", label: "Write this beat" },
    { phase: "writing", label: "Writing locally…" },
    { phase: "authored", label: "Write another" },
    { phase: "retained", label: "Write another" },
    { phase: "fallback", label: "Try again" },
  ] satisfies ReadonlyArray<{ phase: StoryBeatUiPhase; label: string }>)(
    "labels the $phase action as $label",
    ({ phase, label }) => {
      expect(storyBeatWriteLabel(phase)).toBe(label);
    },
  );

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
      actionVisible: false,
      busy: false,
      line: null,
      trail: [],
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
    let settled = false;
    const settlement = controller.waitForWriteSettlement().then(() => {
      settled = true;
    });
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
    expect(settled).toBe(false);

    pending.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, rain rings against the old bridge.",
    });
    await flushPromises();
    await settlement;
    expect(settled).toBe(true);

    expect(controller.snapshot).toMatchObject({
      phase: "authored",
      visible: true,
      actionVisible: true,
      busy: false,
      line: {
        source: "model",
        text: "At Amber Crossing, rain rings against the old bridge.",
        lensId: null,
        sourceFingerprint: source.sourceFingerprint,
      },
      trail: [{
        campaignId: source.campaignId,
        eventId: source.eventId,
        tick: source.tick,
        sourceFingerprint: source.sourceFingerprint,
        location: source.facts.location,
        lensId: null,
        spotlit: false,
        text: "At Amber Crossing, rain rings against the old bridge.",
      }],
    });
    expect(Object.isFrozen(controller.snapshot.trail)).toBe(true);
    expect(Object.isFrozen(controller.snapshot.trail[0])).toBe(true);
    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual([
      "ready",
      "writing",
      "authored",
    ]);
  });

  it("moves, clears, and preserves one spotlight across an exact-event rewrite", async () => {
    const candidates = [
      "At Amber Crossing, rain rings across amber stone.",
      "At Amber Crossing, wind turns beside silver road.",
      "At Amber Crossing, lantern light marks quiet water.",
    ];
    let calls = 0;
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return Promise.resolve({
            outcome: "authored",
            source: "model",
            text: candidates.shift()!,
          });
        },
      },
    });
    const source = richJob(12);
    controller.sync({ enabled: true, eligible: true, job: source });
    controller.write();
    await flushPromises();
    const originalEntry = controller.snapshot.trail[0]!;
    expect(controller.toggleTrailSpotlight(originalEntry)).toBe(true);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    expect(controller.snapshot.announcement).toBe(
      "Amber Crossing is spotlighted for this browser session.",
    );
    expect(calls).toBe(1);

    controller.write();
    await flushPromises();

    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.snapshot.trail[0]).toMatchObject({
      campaignId: source.campaignId,
      eventId: source.eventId,
      tick: source.tick,
      sourceFingerprint: source.sourceFingerprint,
      location: source.facts.location,
      spotlit: true,
      text: "At Amber Crossing, wind turns beside silver road.",
    });
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[0]!)).toBe(true);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(false);
    expect(controller.snapshot.announcement).toBe(
      "Amber Crossing is no longer spotlighted.",
    );
    expect(controller.toggleTrailSpotlight(originalEntry)).toBe(true);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    expect(controller.write()).toBe(true);
    await flushPromises();
    expect(controller.snapshot.trail[0]).toMatchObject({
      spotlit: true,
      text: "At Amber Crossing, lantern light marks quiet water.",
    });
    expect(calls).toBe(3);
  });

  it("keeps the last accepted draft visible while a rewrite runs and when it falls back", async () => {
    const rewrite = deferred<StoryBeatClientResultV1>();
    let calls = 0;
    const accepted = "At Amber Crossing, rain rings against the old bridge.";
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return calls === 1
            ? Promise.resolve({ outcome: "authored", source: "model", text: accepted })
            : rewrite.promise;
        },
      },
    });
    const source = job();
    controller.sync({ enabled: true, eligible: true, job: source });
    controller.write();
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      phase: "authored",
      line: { source: "model", text: accepted },
    });
    expect(controller.write()).toBe(true);
    expect(controller.snapshot).toMatchObject({
      phase: "writing",
      busy: true,
      line: { source: "model", text: accepted },
      announcement: "Previous local draft kept visible while another is written.",
    });

    rewrite.resolve({
      outcome: "fallback",
      source: "deterministic",
      text: source.deterministicFallback,
      reason: "cooldown",
    });
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      phase: "retained",
      busy: false,
      fallbackReason: "cooldown",
      line: { source: "model", text: accepted },
      announcement: "A new local draft was not available. The previous local draft remains.",
    });
  });

  it("restores the last accepted draft when an in-flight rewrite is canceled", async () => {
    const rewrite = deferred<StoryBeatClientResultV1>();
    let calls = 0;
    const accepted = "At Amber Crossing, rain rings against the old bridge.";
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => {
          calls += 1;
          return calls === 1
            ? Promise.resolve({ outcome: "authored", source: "model", text: accepted })
            : rewrite.promise;
        },
      },
    });
    controller.sync({ enabled: true, eligible: true, job: job() });
    controller.write();
    await flushPromises();
    controller.write();

    expect(controller.cancel()).toBe(true);
    expect(controller.snapshot).toMatchObject({
      phase: "retained",
      fallbackReason: null,
      line: { source: "model", text: accepted },
      announcement: "New local drafting was canceled. The previous local draft remains.",
    });

    rewrite.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, the old bridge rings beneath rain.",
    });
    await flushPromises();
    expect(controller.snapshot).toMatchObject({
      phase: "retained",
      line: { source: "model", text: accepted },
    });
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
        trail: [],
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

  it("binds a held write to its exact job and rejects late output when timing changes", async () => {
    const pending = deferred<StoryBeatClientResultV1>();
    const received: StoryBeatAuthoringJob[] = [];
    const snapshots: StoryBeatUiSnapshot[] = [];
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: (source) => {
          received.push(source);
          return pending.promise;
        },
      },
      onChange: (snapshot) => snapshots.push(snapshot),
    });
    const source = job();
    controller.sync({
      enabled: true,
      eligible: true,
      job: source,
      opportunityTiming: "current",
    });
    expect(received).toEqual([]);
    expect(controller.currentWriteIdentity()).toBe(storyBeatSourceIdentity(source));

    expect(controller.write()).toBe(true);
    expect(received).toEqual([source]);
    controller.sync({
      enabled: true,
      eligible: true,
      job: source,
      opportunityTiming: "held",
    });
    expect(controller.snapshot).toMatchObject({
      phase: "ready",
      actionVisible: true,
      line: null,
      trail: [],
    });

    pending.resolve({
      outcome: "authored",
      source: "model",
      text: "At Amber Crossing, rain rings against the old bridge.",
    });
    await flushPromises();

    expect(controller.snapshot).toMatchObject({
      phase: "ready",
      line: null,
      trail: [],
    });
    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual([
      "ready",
      "writing",
      "ready",
    ]);
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
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[0]!)).toBe(true);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    controller.sync({ enabled: true, eligible: false, job: richJob(2) });
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[0]!)).toBe(false);
    await settle(richJob(2));
    expect(controller.snapshot.fallbackReason).toBe("invalid-output");
    expect(controller.snapshot.trail).toHaveLength(1);

    controller.sync({ enabled: false, eligible: true, job: richJob(3) });
    expect(controller.snapshot.trail).toEqual([]);
    await settle(richJob(3));
    expect(controller.snapshot.phase).toBe("authored");
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(false);

    await settle(richJob(4, "campaign:other"));
    expect(controller.snapshot.phase).toBe("authored");
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.campaignId).toBe("campaign:other");
    expect(controller.snapshot.trail[0]?.spotlit).toBe(false);

    controller.dispose();
    expect(controller.snapshot.trail).toEqual([]);
    await settle(richJob(5, "campaign:other"));
    expect(controller.snapshot.phase).toBe("authored");
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(false);
  });

  it("shows a trail without a writable beat and clears it on a jobless campaign switch", async () => {
    const controller = createStoryBeatController({
      author: {
        authorStoryBeat: () => Promise.resolve({
          outcome: "authored",
          source: "model",
          text: recentDraftCandidates[0]!,
        }),
      },
    });
    const source = richJob(1);
    controller.sync({
      enabled: true,
      eligible: true,
      campaignId: source.campaignId,
      job: source,
    });
    controller.write();
    await flushPromises();

    controller.sync({
      enabled: true,
      eligible: true,
      campaignId: source.campaignId,
      job: null,
    });
    expect(controller.snapshot).toMatchObject({
      phase: "hidden",
      visible: true,
      actionVisible: false,
      line: null,
    });
    expect(controller.snapshot.trail).toHaveLength(1);
    expect(controller.reportTrailCopy("copied")).toBe(true);
    expect(controller.snapshot.announcement).toBe("Story Trail copied.");
    expect(controller.reportTrailCopy("unavailable")).toBe(true);
    expect(controller.snapshot.announcement).toBe(
      "Clipboard unavailable. The Story Trail remains in this browser session.",
    );

    controller.sync({
      enabled: true,
      eligible: true,
      campaignId: "campaign:other",
      job: null,
    });
    expect(controller.snapshot).toMatchObject({
      visible: false,
      actionVisible: false,
      trail: [],
    });
    expect(controller.reportTrailCopy("copied")).toBe(false);

    controller.sync({
      enabled: true,
      eligible: true,
      campaignId: "campaign:other",
      job: source,
    });
    expect(controller.snapshot).toMatchObject({
      visible: false,
      actionVisible: false,
      trail: [],
    });
    expect(controller.write()).toBe(false);
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
      expect(controller.snapshot.trail).toHaveLength(index + 1);
    }
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[0]!)).toBe(true);
    expect(controller.snapshot.trail[0]).toMatchObject({
      eventId: "event:story-beat:1",
      spotlit: true,
    });
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[2]!)).toBe(true);
    expect(controller.snapshot.trail.filter((entry) => entry.spotlit)).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(false);
    expect(controller.snapshot.trail[2]).toMatchObject({
      eventId: "event:story-beat:3",
      spotlit: true,
    });
    expect(controller.toggleTrailSpotlight(controller.snapshot.trail[0]!)).toBe(true);
    expect(controller.snapshot.trail.filter((entry) => entry.spotlit)).toHaveLength(1);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    await settle(9, recentDraftCandidates[0]!);
    expect(controller.snapshot.fallbackReason).toBe("invalid-output");
    expect(controller.snapshot.trail).toHaveLength(8);

    await settle(10, recentDraftCandidates[8]!);
    expect(controller.snapshot.phase).toBe("authored");
    expect(controller.snapshot.trail).toHaveLength(8);
    expect(controller.snapshot.trail.map((entry) => entry.eventId)).toEqual([
      "event:story-beat:1",
      "event:story-beat:3",
      "event:story-beat:4",
      "event:story-beat:5",
      "event:story-beat:6",
      "event:story-beat:7",
      "event:story-beat:8",
      "event:story-beat:10",
    ]);
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    await settle(11, recentDraftCandidates[0]!);
    expect(controller.snapshot.phase).toBe("authored");
    expect(controller.snapshot.trail).toHaveLength(8);
    expect(controller.snapshot.trail[0]?.eventId).toBe("event:story-beat:1");
    expect(controller.snapshot.trail[0]?.spotlit).toBe(true);
    expect(controller.snapshot.trail.at(-1)?.eventId).toBe("event:story-beat:11");
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
      actionVisible: false,
      line: null,
      announcement: "",
    });
    expect(controller.snapshot.trail).toEqual([]);

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
