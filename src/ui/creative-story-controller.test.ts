import { describe, expect, it, vi } from "vitest";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
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

function setup(cached = false) {
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
    onChange: vi.fn(),
  };
  const controller = createCreativeStoryController(deps);
  controller.sync({ job, mode: "travel", eligible: true });
  return { controller, writer, deps };
}

describe("creative scene writing lifecycle", () => {
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
    expect(controller.snapshot.text).toBe(prose);
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
