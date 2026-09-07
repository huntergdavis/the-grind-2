import { describe, expect, it, vi } from "vitest";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { buildCreativeStoryMessages, selectStorySeed, type CreativeStoryViewpoint } from "../narrator/creative-story";
import { createCreativeStoryController } from "./creative-story-controller";
import { writeStoryBeatAtStableScene } from "./story-beat-write";

const job: StoryBeatJobV1 = {
  schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
  campaignId: "campaign", eventId: "event", tick: 12, sourceFingerprint: "0123456789abcdef",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: "Amber Crossing",
    headline: "A bridge behind her", action: "The hero crosses the bridge.",
    consequence: "The toll costs 2 gold." },
  deterministicFallback: "A bridge behind her", maximumInputTokens: 320, maximumOutputTokens: 48,
};
const prose = "Relief sat uneasily on her shoulders, a borrowed coat against the uncertainty ahead. She let it stay a little longer.";
const viewpoint: CreativeStoryViewpoint = {
  hero: { name: "Mira", values: ["curiosity", "loyalty"] },
  companion: { name: "Tamsin", role: "miller", status: "travelling", purpose: "shared-road-oath", victories: 0 },
};

function setup(cached = false, allowVignette = () => false) {
  const writer = {
    ready: false,
    load: vi.fn(async (_progress: (message: string) => void) => { writer.ready = true; }),
    write: vi.fn(async (_messages: unknown) => prose),
    dispose: vi.fn(() => { writer.ready = false; }),
  };
  const deps = {
    createWriter: vi.fn(() => writer),
    hasCachedModel: vi.fn(async () => cached),
    removeCachedModel: vi.fn(async (): Promise<void> => undefined),
    allowVignette,
    onChange: vi.fn(),
  };
  const controller = createCreativeStoryController(deps);
  controller.sync({ job, mode: "travel", eligible: true });
  return { controller, writer, deps };
}

describe("creative scene writing lifecycle", () => {
  // Actual rejected text retained in the v0.5.94 subject-last context-fit report.
  const rejectedDraft = "This is a continuation of the story. The story continues with a description of the scene at Greyford camp.";

  it("propagates cache-only restoration and waits for explicit retry after a missing cache", async () => {
    const { controller, writer } = setup(true);
    writer.load.mockRejectedValueOnce(Error("Saved runtime was evicted"));
    await controller.load({ cacheOnly: true });
    expect(writer.load).toHaveBeenNthCalledWith(1, expect.any(Function), { cacheOnly: true });
    expect(controller.snapshot.phase).toBe("failed");
    expect(controller.snapshot.status).toContain("Retry to allow missing files to download");
    expect(writer.dispose).toHaveBeenCalledOnce();
    expect(writer.load).toHaveBeenCalledOnce();
    await controller.load();
    expect(writer.load).toHaveBeenNthCalledWith(2, expect.any(Function), undefined);
    expect(controller.snapshot.phase).toBe("ready");
  });

  it("recovers a rejected draft with named authored prose, then returns to model attribution", async () => {
    const { controller, writer } = setup(true, () => true);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    controller.setFocus("shared-road");
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", busy: false, origin: "authored", seedTone: "trust" });
    expect(controller.snapshot.text).toContain("Mira");
    expect(controller.snapshot.text).toContain("Tamsin");
    expect(controller.snapshot.status).toContain("Model draft skipped");
    controller.write();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null, seedTone: null, seedTheme: null });
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ text: prose, origin: "model", phase: "ready" });
    expect(writer.write).toHaveBeenCalledTimes(2);
    controller.stop();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null });
  });

  it.each(["quiet", "scene", "missing-viewpoint"])("does not invent recovery for %s", async (condition) => {
    const { controller, writer } = setup(true, () => condition !== "quiet");
    controller.sync({ job, mode: "travel", eligible: true, viewpoint: condition === "missing-viewpoint" ? null : viewpoint });
    if (condition === "scene") controller.setFocus("scene");
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, seedTone: null });
  });

  it("clears a previous model result on a rejected or repeated quiet attempt", async () => {
    const { controller, writer } = setup();
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.origin).toBe("model");
    writer.write.mockResolvedValueOnce(rejectedDraft);
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null, seedTone: null, seedTheme: null });
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null });
    expect(controller.snapshot.status).toContain("Repeated model draft");
  });

  it("uses authored recovery for an exact repeated model draft without relabelling it as model prose", async () => {
    const { controller } = setup(true, () => true);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.origin).toBe("model");
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.origin).toBe("authored");
    expect(controller.snapshot.text).not.toBe(prose);
    const first = controller.snapshot.text;
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.origin).toBe("authored");
    expect(controller.snapshot.text).not.toBe(first);
  });

  it("captures authored people before async inference rather than reading a mutated caller", async () => {
    const { controller, writer } = setup(true, () => true);
    const captured = structuredClone(viewpoint);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint: captured });
    controller.setFocus("shared-road");
    let resolve!: (value: string) => void;
    writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    (captured.hero as { name: string }).name = "Someone else";
    (captured.companion as { name: string }).name = "Another companion";
    resolve(rejectedDraft);
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.text).toContain("Mira");
    expect(controller.snapshot.text).toContain("Tamsin");
    expect(controller.snapshot.text).not.toContain("Someone else");
  });

  it.each(["cancel", "stale", "opt-out"])("drops rejected-draft recovery after %s", async (action) => {
    let allowed = true;
    const { controller, writer } = setup(true, () => allowed);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    let resolve!: (value: string) => void;
    writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    if (action === "cancel") controller.stop();
    if (action === "stale") controller.sync({ job: { ...job, tick: 13 }, mode: "travel", eligible: true, viewpoint });
    if (action === "opt-out") allowed = false;
    resolve(rejectedDraft);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null, busy: false });
  });

  it.each([true, false])("does not use a vignette for a rejected promise with ready=%s", async (stillReady) => {
    const { controller, writer } = setup(true, () => true);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    writer.write.mockImplementationOnce(async () => { writer.ready = stillReady; throw Error("timeout or worker failure"); });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null, busy: false });
  });

  it("does not publish recovery when a stopped worker resolves an unusable string", async () => {
    const { controller, writer } = setup(true, () => true);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    writer.write.mockImplementationOnce(async () => { writer.ready = false; return rejectedDraft; });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "failed", text: null, origin: null, busy: false });
  });

  it.each(["travelling", "injured"] as const)("uses captured %s companion context for both prompt and inspiration tone", async (status) => {
    const { controller, writer } = setup();
    const captured = { ...viewpoint, companion: { ...viewpoint.companion!, status } };
    controller.sync({ job, mode: "travel", eligible: true, viewpoint: captured });
    controller.setFocus("shared-road");
    await controller.load();
    const identity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
    const seed = selectStorySeed("travel", identity, 0, { viewpoint: captured, focus: "shared-road" });
    controller.write();
    await controller.waitForWriteSettlement();
    expect(writer.write).toHaveBeenCalledWith(buildCreativeStoryMessages(job, seed, captured, "shared-road"));
    expect(controller.snapshot.seedTone).toBe(status === "injured" ? "care" : "trust");
    expect(controller.snapshot.seedTheme).toBe(seed.theme);
    controller.stop();
    expect(controller.snapshot.seedTone).toBeNull();
  });

  it("offers relationship focus only with a real companion and never writes on focus change", async () => {
    const { controller, writer } = setup();
    expect(controller.snapshot.focus).toBe("inner-life");
    expect(controller.setFocus("shared-road")).toBe(false);
    expect(controller.setFocus("invented-focus")).toBe(false);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    expect(controller.snapshot.relationshipAvailable).toBe(true);
    await controller.load();
    const before = controller.currentWriteIdentity();
    expect(controller.setFocus("shared-road")).toBe(true);
    expect(controller.currentWriteIdentity()).not.toBe(before);
    expect(writer.write).not.toHaveBeenCalled();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(JSON.stringify(writer.write.mock.calls[0]?.[0])).toContain("Tamsin");
    expect(controller.snapshot.text).toBe(prose);
    expect(controller.setFocus("scene")).toBe(true);
    expect(controller.snapshot.text).toBeNull();
    expect(controller.snapshot.seedTheme).toBeNull();
    expect(writer.write).toHaveBeenCalledTimes(1);
  });

  it("keeps an in-flight focus fixed and discards output when companion context changes", async () => {
    const { controller, writer } = setup();
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    let resolve!: (value: string) => void;
    writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    expect(controller.setFocus("scene")).toBe(false);
    const settled = controller.waitForWriteSettlement();
    controller.sync({ job, mode: "travel", eligible: true,
      viewpoint: { ...viewpoint, companion: { ...viewpoint.companion!, status: "injured" } } });
    await settled;
    resolve(prose);
    await Promise.resolve();
    expect(writer.dispose).toHaveBeenCalledOnce();
    expect(controller.snapshot.busy).toBe(false);
    expect(controller.snapshot.text).toBeNull();
  });

  it("preserves prose for equivalent context but clears it and resets shared-road focus after departure", async () => {
    const { controller, writer } = setup();
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    controller.setFocus("shared-road");
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    controller.sync({ job, mode: "travel", eligible: true, viewpoint: structuredClone(viewpoint) });
    expect(controller.snapshot.text).toBe(prose);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint: { ...viewpoint, companion: null } });
    expect(controller.snapshot.text).toBeNull();
    expect(controller.snapshot.focus).toBe("inner-life");
    expect(controller.snapshot.relationshipAvailable).toBe(false);
    expect(writer.dispose).not.toHaveBeenCalled();
  });

  it("does not dispatch a paused-scene request after its storytelling focus changes", async () => {
    const { controller, writer } = setup();
    await controller.load();
    const started = await writeStoryBeatAtStableScene(controller, {
      isPaused: () => true,
      pause: () => undefined,
      waitForStable: async () => { controller.setFocus("scene"); },
    });
    expect(started).toBe(false);
    expect(writer.write).not.toHaveBeenCalled();
  });

  it("checks the saved cache without creating a worker or downloading a model", async () => {
    const { controller, deps } = setup(true);
    await controller.checkCache();
    expect(controller.snapshot.cached).toBe(true);
    expect(controller.snapshot.status).toContain("without downloading");
    expect(deps.createWriter).not.toHaveBeenCalled();
    expect(controller.write()).toBe(false);
    await controller.load();
    expect(controller.snapshot.phase).toBe("ready");
  });

  it("writes again after settlement, rotates ideas, and never mutates source facts", async () => {
    const { controller, writer } = setup();
    const original = JSON.stringify(job);
    await controller.load();
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(controller.write()).toBe(true);
      expect(controller.snapshot.busy).toBe(true);
      expect(controller.write()).toBe(false);
      await controller.waitForWriteSettlement();
      expect(controller.snapshot.busy).toBe(false);
      expect(controller.snapshot.phase).toBe("ready");
    }
    expect(writer.write).toHaveBeenCalledTimes(5);
    expect(writer.write.mock.calls[0]?.[0]).not.toEqual(writer.write.mock.calls[1]?.[0]);
    expect(controller.snapshot.text).toBeNull();
    expect(controller.snapshot.status).toContain("Repeated model draft");
    expect(JSON.stringify(job)).toBe(original);
  });

  it("reuses the stable-scene pause seam before dispatching", async () => {
    const { controller, writer } = setup();
    await controller.load();
    let paused = false;
    const started = await writeStoryBeatAtStableScene(controller, {
      isPaused: () => paused,
      pause: () => { paused = true; },
      waitForStable: async () => { expect(paused).toBe(true); expect(writer.write).not.toHaveBeenCalled(); },
    });
    expect(started).toBe(true);
    await controller.waitForWriteSettlement();
    expect(paused).toBe(true);
  });

  it("drops late output and releases busy when the source changes", async () => {
    const { controller, writer } = setup(true);
    let resolve!: (value: string) => void;
    writer.write.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    const settled = controller.waitForWriteSettlement();
    controller.sync({ job: { ...job, campaignId: "another-campaign" }, mode: "town", eligible: true });
    await settled;
    resolve(prose);
    await Promise.resolve();
    expect(writer.dispose).toHaveBeenCalled();
    expect(controller.snapshot.busy).toBe(false);
    expect(controller.snapshot.text).toBeNull();
  });

  it("unloads on explicit cancel, keeps cache, and ignores a late load result", async () => {
    const { controller, writer, deps } = setup(true);
    let resolve!: () => void;
    writer.load.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const loading = controller.load();
    controller.stop();
    resolve();
    await loading;
    expect(controller.snapshot.phase).toBe("off");
    expect(deps.removeCachedModel).not.toHaveBeenCalled();
  });

  it("recovers from an unusable draft without showing it or sticking busy", async () => {
    const { controller, writer } = setup();
    writer.write.mockResolvedValueOnce("<script>bad()</script>");
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.text).toBeNull();
    expect(controller.snapshot.busy).toBe(false);
    expect(controller.write()).toBe(true);
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.text).toBe(prose);
  });

  it("releases busy after a worker failure and allows cached reload", async () => {
    const { controller, writer } = setup(true);
    writer.write.mockImplementationOnce(async () => { writer.ready = false; throw Error("stopped"); });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.phase).toBe("failed");
    expect(controller.snapshot.busy).toBe(false);
    await controller.load();
    expect(controller.write()).toBe(true);
    await controller.waitForWriteSettlement();
  });

  it("suppresses writing outside the eligible view and deletes only on remove", async () => {
    const { controller, deps } = setup(true);
    await controller.load();
    controller.sync({ job, mode: "battle", eligible: false });
    expect(controller.write()).toBe(false);
    expect(controller.snapshot.visible).toBe(false);
    await controller.remove();
    expect(deps.removeCachedModel).toHaveBeenCalledTimes(1);
    expect(controller.snapshot.cached).toBe(false);
    expect(controller.snapshot.phase).toBe("off");
  });

  it("cannot resurrect a removed cache through an overlapping cache check", async () => {
    const { controller, deps } = setup(true);
    await controller.checkCache();
    let finishRemoval!: () => void;
    deps.removeCachedModel.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
    const removal = controller.remove();
    const checksBefore = deps.hasCachedModel.mock.calls.length;
    await controller.checkCache();
    expect(deps.hasCachedModel).toHaveBeenCalledTimes(checksBefore);
    finishRemoval();
    await removal;
    expect(controller.snapshot.cached).toBe(false);
    expect(controller.snapshot.status).toContain("removed");
  });

  it("does not apply a load's late cache observation after cancellation", async () => {
    const { controller, deps } = setup();
    let finishCheck!: (found: boolean) => void;
    deps.hasCachedModel.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishCheck = resolve; }));
    const loading = controller.load();
    await Promise.resolve();
    controller.stop();
    finishCheck(true);
    await loading;
    expect(controller.snapshot.phase).toBe("off");
    expect(controller.snapshot.cached).toBe(false);
  });
});
