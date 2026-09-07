import { describe, expect, it, vi } from "vitest";
import { buildCreativeDirectionMessages, defaultNarrativeDirection } from "../narrator/creative-direction";
import { buildCreativeMomentMessages } from "../narrator/creative-moment";
import { buildCreativeStoryMessages, selectStorySeed, type CreativeStoryFocus } from "../narrator/creative-story";
import type { CreativeDirectionOptions, CreativeWriterMessage } from "../narrator/creative-writer-client";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createCreativeStoryController } from "./creative-story-controller";
import {
  createCreativeStoryDirector,
  creativeStoryCadenceMs,
  creativeStoryReadyMaximumAgeMs,
  type CreativeStoryCandidate,
} from "./creative-story-director";

const prose = "Relief sat uneasily on Mira's shoulders, a borrowed coat against the uncertainty ahead. Mira let it stay a little longer.";
const rejected = "<p>This draft is unusable.</p>";

// Synthetic public requests exercise integration only; canonical farewell admission has its own projector tests.
function fixtures(): { current: CreativeStoryCandidate; farewell: CreativeStoryCandidate } {
  const job: StoryBeatJobV1 = {
    schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
    campaignId: "moment-campaign", eventId: "farewell-12", tick: 12, sourceFingerprint: "farewell-source",
    facts: {
      schemaVersion: 1, kind: "public-story-beat", location: "Dunford", headline: "Tamsin's Shared Road Oath is complete.",
      action: "Tamsin departs wounded but alive after 0 shared victories.", consequence: "The party has no active companion.",
    },
    deterministicFallback: "Private fallback not offered to the chooser.", maximumInputTokens: 320, maximumOutputTokens: 48,
  };
  const farewell: CreativeStoryCandidate = {
    job, mode: "chronicle", viewpoint: { hero: { name: "Mira", values: ["curiosity", "loyalty"] }, companion: null },
    remembrance: {
      kind: "farewell-remembrance", campaignId: job.campaignId, eventId: job.eventId, tick: job.tick,
      heroName: "Mira", companionName: "Tamsin",
      oath: { location: "Copper Hollow", headline: "Tamsin joins the road.", tick: 2 },
      farewell: { location: job.facts.location, headline: job.facts.headline, tick: job.tick },
    },
  };
  const current: CreativeStoryCandidate = {
    job: { ...job, eventId: "current-14", tick: 14, sourceFingerprint: "current-source", facts: {
      ...job.facts, location: "Amber Crossing", headline: "A fork divides the road.",
      action: "Mira and Neris continue toward the ridge.", consequence: "The party follows the eastern road.",
    } },
    mode: "travel",
    viewpoint: {
      hero: { name: "Mira", values: ["curiosity", "loyalty"] },
      companion: { name: "Neris", role: "miller", status: "travelling", purpose: "shared-road-oath", victories: 0 },
    },
  };
  return { current, farewell };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 24; turn++) await Promise.resolve();
}

function expectedProse(candidate: CreativeStoryCandidate, focus: CreativeStoryFocus = "inner-life") {
  const { job, viewpoint, mode } = candidate;
  const identity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
  const seed = selectStorySeed(mode, identity, 0, { viewpoint, focus });
  return buildCreativeStoryMessages(job, seed, viewpoint ?? undefined, focus);
}

function setup({ chooser = true, allowRecovery = true, focus = "inner-life" as CreativeStoryFocus } = {}) {
  const fixture = fixtures();
  let time = 0;
  const chooseMoment = vi.fn(async (_messages: readonly CreativeWriterMessage[]): Promise<"1" | "2" | null> => "1");
  const model = {
    ready: false,
    load: vi.fn(async () => { model.ready = true; }),
    direct: vi.fn(async (_messages: readonly CreativeWriterMessage[], _options?: CreativeDirectionOptions): Promise<string | null> => "2"),
    write: vi.fn(async (_messages: readonly CreativeWriterMessage[]) => prose),
    dispose: vi.fn(() => { model.ready = false; }),
  };
  const port = chooser ? Object.assign(model, { chooseMoment }) : model;
  const onReady = vi.fn();
  const onChange = vi.fn();
  const controller = createCreativeStoryController({
    createWriter: () => port,
    hasCachedModel: async () => true,
    removeCachedModel: async () => undefined,
    allowVignette: () => allowRecovery,
    onChange,
  });
  const director = createCreativeStoryDirector({ writer: controller, now: () => time, onReady });
  const sync = (candidate: CreativeStoryCandidate | null = fixture.current, campaignId = fixture.current.job.campaignId, active = true) => {
    director.sync({ campaignId, candidate, active });
  };
  const activate = async () => {
    await controller.load();
    controller.sync({ ...fixture.current, eligible: true });
    expect(controller.setFocus(focus)).toBe(true);
    sync(fixture.current, fixture.current.job.campaignId, false);
  };
  const start = async () => {
    await activate();
    expect(director.offerRemembrance(fixture.farewell)).toBe(true);
    sync();
  };
  const settle = async () => { await controller.waitForWriteSettlement(); await flush(); };
  return { ...fixture, model, chooseMoment, controller, director, onReady, onChange, activate, start, sync, settle,
    setTime: (value: number) => { time = value; } };
}

describe("DM moment choice binds the whole story request", () => {
  it("choice 1 uses the current scene's people, prose, staging and presented source", async () => {
    const test = setup();
    await test.start();
    await test.settle();
    expect(test.chooseMoment).toHaveBeenCalledExactlyOnceWith(buildCreativeMomentMessages(test.current.job, test.farewell.job));
    expect(test.model.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(test.current.job, test.current.viewpoint!));
    expect(test.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(test.current));
    const story = test.director.takeReady();
    expect(story).toMatchObject({
      text: prose, origin: "model", location: test.current.job.facts.location, headline: test.current.job.facts.headline,
      campaignId: test.current.job.campaignId, sourceTick: test.current.job.tick,
      momentSelection: { choice: "current", origin: "model" }, direction: { stage: "orrery", origin: "model" },
    });
    expect(test.controller.snapshot.source).toEqual(test.current.job.facts);
    expect(story).not.toHaveProperty("remembrance");
    expect(Object.isFrozen(story?.momentSelection)).toBe(true);
    expect(JSON.stringify(test.model.write.mock.calls)).toContain("Neris");
    expect(JSON.stringify(test.model.write.mock.calls)).not.toContain("Tamsin");
  });

  it("prioritizes the captured farewell under Shared road instead of the newer companion scene", async () => {
    const test = setup({ focus: "shared-road" });
    await test.start();
    await test.settle();
    expect(test.chooseMoment).not.toHaveBeenCalled();
    expect(test.model.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(test.farewell.job, test.farewell.viewpoint!, "inner-life"));
    expect(test.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(test.farewell));
    expect(JSON.stringify(test.model.write.mock.calls)).not.toContain("Neris");
    expect(test.director.takeReady()).toMatchObject({ sourceTick: test.farewell.job.tick,
      momentSelection: { choice: "milestone", kind: "farewell-remembrance", origin: "focus" } });
  });

  it.each(["1", "2"] as const)("choice %s remains bound when caller-owned facts and people mutate during the await", async (choice) => {
    const test = setup();
    const pending = deferred<"1" | "2" | null>();
    test.chooseMoment.mockReturnValueOnce(pending.promise);
    const captured = structuredClone({ current: test.current, farewell: test.farewell });
    const selected = choice === "1" ? captured.current : captured.farewell;
    await test.start();
    await flush();
    (test.current.job.facts as { headline: string }).headline = "MUTATED CURRENT FACT";
    (test.current.viewpoint!.companion as { name: string }).name = "MUTATED COMPANION";
    (test.farewell.job.facts as { location: string }).location = "MUTATED FAREWELL";
    (test.farewell.remembrance!.oath as { headline: string }).headline = "MUTATED OATH";
    pending.resolve(choice);
    await test.settle();
    expect(test.chooseMoment).toHaveBeenCalledExactlyOnceWith(buildCreativeMomentMessages(captured.current.job, captured.farewell.job));
    expect(test.model.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(selected.job, selected.viewpoint!));
    expect(test.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(selected));
    expect(test.director.takeReady()).toMatchObject({ location: selected.job.facts.location, headline: selected.job.facts.headline, sourceTick: selected.job.tick });
    expect(JSON.stringify([test.model.direct.mock.calls, test.model.write.mock.calls])).not.toContain("MUTATED");
  });

  it.each([false, true])("choice 2 uses the exact farewell, with authored recovery only for a rejected draft: %s", async (rejectDraft) => {
    const test = setup();
    test.chooseMoment.mockResolvedValueOnce("2");
    if (rejectDraft) test.model.write.mockResolvedValueOnce(rejected);
    await test.start();
    await test.settle();
    expect(test.model.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(test.farewell.job, test.farewell.viewpoint!, "inner-life"));
    expect(test.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(test.farewell));
    const story = test.director.takeReady();
    expect(story).toMatchObject({
      origin: rejectDraft ? "authored" : "model", location: test.farewell.job.facts.location,
      headline: test.farewell.job.facts.headline, sourceTick: test.farewell.job.tick,
      momentSelection: { choice: "milestone", origin: "model", kind: "farewell-remembrance" },
    });
    expect(test.controller.snapshot.source).toEqual(test.farewell.job.facts);
    if (rejectDraft) {
      expect(story?.remembrance).toEqual(test.farewell.remembrance);
      expect(story?.text).toContain("Tamsin");
      expect(story?.text).not.toContain("Neris");
    } else expect(story).not.toHaveProperty("remembrance");
    // Recorded oath memory remains authored-only, never fed into any model call.
    expect(JSON.stringify([test.chooseMoment.mock.calls, test.model.direct.mock.calls, test.model.write.mock.calls])).not.toContain("Copper Hollow");
  });

  it("current-scene recovery cannot inherit the unchosen farewell's people or memory", async () => {
    const test = setup();
    test.model.write.mockResolvedValueOnce(rejected);
    await test.start();
    await test.settle();
    const story = test.director.takeReady();
    expect(story).toMatchObject({ origin: "authored", momentSelection: { choice: "current", origin: "model" }, sourceTick: test.current.job.tick });
    expect(story?.text).toContain("Mira");
    expect(story?.text).not.toContain("Tamsin");
    expect(story).not.toHaveProperty("remembrance");
  });

  it("a completed invalid choice preserves farewell priority with default, not model, selection attribution", async () => {
    const test = setup();
    test.chooseMoment.mockResolvedValueOnce(null);
    await test.start();
    await test.settle();
    expect(test.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(test.farewell));
    expect(test.director.takeReady()).toMatchObject({
      sourceTick: test.farewell.job.tick, origin: "model",
      momentSelection: { choice: "milestone", origin: "default", kind: "farewell-remembrance" },
    });
  });

  it("quiet recovery preference does not substitute authored text after an unusable chosen draft", async () => {
    const test = setup({ allowRecovery: false });
    test.chooseMoment.mockResolvedValueOnce("2");
    test.model.write.mockResolvedValueOnce(rejected);
    await test.start();
    await test.settle();
    expect(test.director.snapshot).toEqual({ ready: null, generating: false });
    expect(test.controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, remembrance: null });
    expect(test.onReady).not.toHaveBeenCalled();
  });
});

describe("moment competition eligibility and bounded retirement", () => {
  it.each(["missing-priority", "expired-priority", "missing-current", "same-event", "same-tick", "older-current", "foreign-current", "legacy-writer"] as const)(
    "%s uses a single source without any moment call", async (condition) => {
      const test = setup({ chooser: condition !== "legacy-writer" });
      await test.activate();
      if (condition !== "missing-priority") expect(test.director.offerRemembrance(test.farewell)).toBe(true);
      let candidate: CreativeStoryCandidate | null = test.current;
      if (condition === "expired-priority") test.setTime(creativeStoryReadyMaximumAgeMs);
      if (condition === "missing-current") candidate = null;
      if (condition === "same-event") candidate = { ...test.current, job: { ...test.current.job, eventId: test.farewell.job.eventId } };
      if (condition === "same-tick") candidate = { ...test.current, job: { ...test.current.job, tick: test.farewell.job.tick } };
      if (condition === "older-current") candidate = { ...test.current, job: { ...test.current.job, tick: test.farewell.job.tick - 1 } };
      if (condition === "foreign-current") candidate = { ...test.current, job: { ...test.current.job, campaignId: "another-campaign" } };
      test.sync(candidate);
      await test.settle();
      expect(test.chooseMoment).not.toHaveBeenCalled();
      expect(test.model.direct).toHaveBeenCalledOnce();
      expect(test.model.write).toHaveBeenCalledOnce();
      const selected = condition === "missing-priority" || condition === "expired-priority" ? test.current : test.farewell;
      expect(test.director.takeReady()).toMatchObject({ location: selected.job.facts.location, sourceTick: selected.job.tick });
      expect(test.controller.snapshot.momentSelection).toBeNull();
    },
  );

  it.each(["1", "2"] as const)("retires both offered ticks in one attempt after choice %s, not a second queued story", async (choice) => {
    const test = setup();
    test.chooseMoment.mockResolvedValueOnce(choice);
    await test.start();
    await test.settle();
    test.director.takeReady();
    test.setTime(creativeStoryCadenceMs);
    expect(test.director.offerRemembrance(test.farewell)).toBe(false);
    test.sync();
    await flush();
    expect(test.chooseMoment).toHaveBeenCalledOnce();
    expect(test.model.write).toHaveBeenCalledOnce();
    test.sync({ ...test.current, job: { ...test.current.job, tick: test.current.job.tick + 1, eventId: "next-event" } });
    await test.settle();
    expect(test.chooseMoment).toHaveBeenCalledOnce();
    expect(test.model.write).toHaveBeenCalledTimes(2);
  });
});

describe("moment-choice lifecycle guards", () => {
  it("immediate invalidation prevents even the first queued choice", async () => {
    const test = setup();
    await test.activate();
    test.director.offerRemembrance(test.farewell);
    test.sync();
    test.director.invalidate();
    await test.settle();
    expect(test.chooseMoment).not.toHaveBeenCalled();
    expect(test.model.direct).not.toHaveBeenCalled();
    expect(test.model.write).not.toHaveBeenCalled();
    expect(test.controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, momentSelection: null });
  });

  it.each(["navigation", "no-llm", "new-campaign"] as const)("%s during the choice prevents staging, prose, recovery and late attribution", async (reason) => {
    const test = setup();
    const pending = deferred<"1" | "2" | null>();
    test.chooseMoment.mockReturnValueOnce(pending.promise);
    await test.start();
    await flush();
    expect(test.chooseMoment).toHaveBeenCalledOnce();
    expect(test.controller.snapshot).toMatchObject({ phase: "writing", busy: true });
    if (reason === "navigation") test.director.invalidate();
    else if (reason === "no-llm") test.controller.stop();
    else test.sync({ ...test.current, job: { ...test.current.job, campaignId: "new-campaign", eventId: "new-event", tick: 1 } }, "new-campaign");
    pending.resolve("2");
    await test.settle();
    expect(test.model.direct).not.toHaveBeenCalled();
    expect(test.model.write).not.toHaveBeenCalled();
    expect(test.controller.snapshot).toMatchObject({
      phase: reason === "no-llm" ? "off" : "ready", busy: false, text: null, origin: null,
      momentSelection: null, remembrance: null, direction: defaultNarrativeDirection,
    });
    expect(test.director.snapshot).toEqual({ ready: null, generating: false });
    expect(test.onReady).not.toHaveBeenCalled();
    expect(test.model.dispose).toHaveBeenCalledTimes(reason === "no-llm" ? 1 : 0);
    if (reason === "no-llm") {
      test.sync();
      await flush();
      expect(test.chooseMoment).toHaveBeenCalledOnce();
      expect(test.model.load).toHaveBeenCalledOnce();
    }
  });

  it("a fatal choice failure stays quiet and cannot create a default or authored ready passage", async () => {
    const test = setup();
    test.chooseMoment.mockImplementationOnce(async () => { test.model.ready = false; throw new Error("Choice timed out"); });
    await test.start();
    await test.settle();
    expect(test.model.direct).not.toHaveBeenCalled();
    expect(test.model.write).not.toHaveBeenCalled();
    expect(test.controller.snapshot).toMatchObject({ phase: "failed", busy: false, text: null, origin: null, momentSelection: null, remembrance: null });
    expect(test.director.snapshot).toEqual({ ready: null, generating: false });
    expect(test.onReady).not.toHaveBeenCalled();
  });

  it("stays one busy request across moment choice, staging and prose", async () => {
    const test = setup();
    const choice = deferred<"1" | "2" | null>();
    const stage = deferred<string | null>();
    const draft = deferred<string>();
    test.chooseMoment.mockReturnValueOnce(choice.promise);
    test.model.direct.mockReturnValueOnce(stage.promise);
    test.model.write.mockReturnValueOnce(draft.promise);
    await test.start();
    await flush();
    expect(test.controller.write()).toBe(false);
    choice.resolve("1");
    await flush();
    expect(test.model.direct).toHaveBeenCalledOnce();
    expect(test.model.write).not.toHaveBeenCalled();
    expect(test.controller.snapshot.busy).toBe(true);
    expect(test.controller.write()).toBe(false);
    stage.resolve("3");
    await flush();
    expect(test.model.write).toHaveBeenCalledOnce();
    expect(test.controller.snapshot.busy).toBe(true);
    expect(test.controller.write()).toBe(false);
    draft.resolve(prose);
    await test.settle();
    expect(test.controller.snapshot.busy).toBe(false);
    expect(test.director.takeReady()?.direction).toEqual({ stage: "moth-court", origin: "model" });
  });
});
