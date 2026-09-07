import { describe, expect, it, vi } from "vitest";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createCreativeStoryController } from "./creative-story-controller";
import {
  createCreativeStoryDirector,
  creativeStoryCadenceMs,
  creativeStoryReadyMaximumAgeMs,
  type CreativeStoryCandidate,
} from "./creative-story-director";

const prose = "Relief sat uneasily on her shoulders, a borrowed coat against the uncertainty ahead. She let it stay a little longer.";
const job: StoryBeatJobV1 = {
  schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
  campaignId: "campaign", eventId: "event", tick: 12, sourceFingerprint: "0123456789abcdef",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: "Amber Crossing",
    headline: "A bridge behind her", action: "The hero crosses the bridge.", consequence: "The toll costs 2 gold." },
  deterministicFallback: "A bridge behind her", maximumInputTokens: 320, maximumOutputTokens: 48,
};

function candidate(tick = 12, campaignId = "campaign"): CreativeStoryCandidate {
  return {
    job: { ...job, campaignId, tick, eventId: `event-${tick}`, facts: { ...job.facts } },
    mode: "travel",
    viewpoint: { hero: { name: "Mira", values: ["curiosity"] }, companion: null },
  };
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function setup() {
  let time = 0;
  let cadence = creativeStoryCadenceMs;
  const pending: { resolve(value: string): void; reject(error: Error): void }[] = [];
  const model = {
    ready: false,
    load: vi.fn(async () => { model.ready = true; }),
    write: vi.fn((_messages: unknown) => new Promise<string>((resolve, reject) => { pending.push({ resolve, reject }); })),
    dispose: vi.fn(() => { model.ready = false; }),
  };
  const onChange = vi.fn();
  const writer = createCreativeStoryController({
    createWriter: () => model,
    hasCachedModel: async () => true,
    removeCachedModel: async () => undefined,
    onChange,
  });
  const onReady = vi.fn();
  const director = createCreativeStoryDirector({ writer, now: () => time, cadenceMs: () => cadence, onReady });
  const sync = (next = candidate(), active = true) => director.sync({ campaignId: next.job.campaignId, candidate: next, active });
  const settle = async (text = prose, index = pending.length - 1) => {
    pending[index]!.resolve(text);
    await flush();
  };
  return { director, writer, model, pending, onChange, onReady, sync, settle,
    setTime: (next: number) => { time = next; }, setCadence: (next: number) => { cadence = next; } };
}

describe("automatic creative story director", () => {
  it("keeps captured care tone through ordinary party changes and uses trust only for the next captured story", async () => {
    const { director, writer, sync, settle, setTime } = setup();
    const companion = { name: "Iona", role: "miller", status: "injured" as const, purpose: "shared-road-oath" as const, victories: 0 };
    const injured = { ...candidate(), viewpoint: { hero: { name: "Mira", values: ["loyalty" as const] }, companion } };
    const healthy = { ...candidate(13), viewpoint: { ...injured.viewpoint, companion: { ...companion, status: "travelling" as const } } };
    await writer.load();
    sync(injured);
    await flush();
    sync(healthy);
    await settle();
    expect(director.snapshot.ready?.inspirationTone).toBe("care");
    expect(director.takeReady()?.sourceTick).toBe(12);
    setTime(creativeStoryCadenceMs);
    sync(healthy);
    await flush();
    await settle();
    expect(director.snapshot.ready?.inspirationTone).toBe("trust");
    expect(director.snapshot.ready?.sourceTick).toBe(13);
  });

  it.each([180_000, 300_000])("spaces new stories by the selected %ims rhythm", async (cadence) => {
    const { director, writer, model, sync, settle, setTime, setCadence } = setup();
    setCadence(cadence);
    await writer.load();
    sync();
    await flush();
    setTime(5_000);
    await settle();
    director.takeReady();
    setTime(5_000 + cadence - 1);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(5_000 + cadence);
    sync(candidate(13));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it("recalculates an edited rhythm from the last presentation, including after invalidation", async () => {
    const { director, writer, model, sync, settle, setTime, setCadence } = setup();
    await writer.load();
    sync();
    await flush();
    setTime(5_000);
    await settle();
    director.takeReady();
    director.invalidate();
    setCadence(300_000);
    setTime(100_000);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    setCadence(90_000);
    sync(candidate(13));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
    // The same scene still cannot be rewritten, even if rhythm changes again.
    await settle();
    director.invalidate();
    setTime(1_000_000);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it("applies a longer rhythm to unusable drafts without retrying the same moment", async () => {
    const { writer, model, sync, settle, setTime, setCadence } = setup();
    setCadence(300_000);
    await writer.load();
    sync();
    await flush();
    await settle("An unfinished thought");
    setTime(299_999);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(300_000);
    sync();
    expect(model.write).toHaveBeenCalledOnce();
    sync(candidate(13));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate requests when controller changes re-enter sync and ready is consumed immediately", async () => {
    const { director, writer, model, onChange, onReady, sync, settle } = setup();
    await writer.load();
    let tick = 13;
    onChange.mockImplementation(() => sync(candidate(tick++)));
    onReady.mockImplementation(() => {
      expect(director.takeReady()?.sourceTick).toBe(12);
      sync(candidate(tick++));
    });
    sync();
    await flush();
    await settle();
    expect(model.write).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    expect(model.dispose).not.toHaveBeenCalled();
  });

  it("never loads a model or writes until an explicitly activated writer is ready", async () => {
    const { director, writer, model, sync } = setup();
    sync();
    expect(model.load).not.toHaveBeenCalled();
    expect(model.write).not.toHaveBeenCalled();
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    await writer.load();
    sync(candidate(), false);
    expect(model.write).not.toHaveBeenCalled();
    director.sync({ campaignId: "campaign", candidate: null, active: true });
    expect(model.write).not.toHaveBeenCalled();
    sync();
    await flush();
    expect(model.write).toHaveBeenCalledOnce();
  });

  it.each([5_000, 30_000])("keeps normal gameplay and fights out of a %ims captured request", async (duration) => {
    const { director, writer, model, onReady, sync, settle, setTime } = setup();
    await writer.load();
    const original = candidate();
    sync(original);
    await flush();
    (original.job.facts as { location: string }).location = "Mutated caller location";
    (original.viewpoint!.hero as { name: string }).name = "Another hero";
    for (let tick = 13; tick <= 30; tick++) {
      sync({ ...candidate(tick), mode: "battle", viewpoint: null });
    }
    expect(model.write).toHaveBeenCalledOnce();
    expect(model.dispose).not.toHaveBeenCalled();
    expect(writer.snapshot.source?.location).toBe("Amber Crossing");
    expect(director.snapshot.generating).toBe(true);
    setTime(duration);
    await settle();
    expect(onReady).toHaveBeenCalledOnce();
    expect(director.snapshot.ready).toEqual({
      text: prose, location: "Amber Crossing", headline: job.facts.headline,
      campaignId: "campaign", sourceTick: 12, readyAtMs: duration,
      inspirationTone: writer.snapshot.seedTone,
    });
    expect(Object.isFrozen(director.snapshot.ready)).toBe(true);
    sync(candidate(40));
    expect(model.write).toHaveBeenCalledOnce();
  });

  it("consumes a passage only once and waits 90 seconds after presentation before another attempt", async () => {
    const { director, writer, model, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    setTime(5_000);
    await settle();
    expect(director.takeReady()?.text).toBe(prose);
    expect(director.takeReady()).toBeNull();
    setTime(5_000 + creativeStoryCadenceMs - 1);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(5_000 + creativeStoryCadenceMs);
    sync(candidate(13));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it("expires an unshown passage after 180 seconds and retains no scene queue", async () => {
    const { director, writer, model, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    setTime(30_000);
    await settle();
    for (let tick = 13; tick < 100; tick++) sync(candidate(tick));
    setTime(30_000 + creativeStoryReadyMaximumAgeMs - 1);
    expect(director.snapshot.ready).not.toBeNull();
    setTime(30_000 + creativeStoryReadyMaximumAgeMs);
    expect(director.takeReady()).toBeNull();
    sync(candidate(100));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
    expect(writer.snapshot.source).toEqual(candidate(100).job.facts);
  });

  it("does not repeat a committed moment, including after newer moments and navigation invalidation", async () => {
    const { director, writer, model, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    await settle();
    director.takeReady();
    setTime(creativeStoryCadenceMs);
    sync();
    expect(model.write).toHaveBeenCalledOnce();
    sync(candidate(13));
    await flush();
    await settle();
    director.invalidate();
    setTime(creativeStoryCadenceMs * 2);
    sync(candidate(12));
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it.each(["<script>bad()</script>", "An unfinished thought"])("quietly backs off unusable drafts: %s", async (draft) => {
    const { director, writer, model, onReady, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    await settle(draft);
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    expect(onReady).not.toHaveBeenCalled();
    for (let tick = 13; tick < 100; tick++) sync(candidate(tick));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(creativeStoryCadenceMs);
    sync();
    expect(model.write).toHaveBeenCalledOnce();
    sync(candidate(100));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it("does not automatically reload a failed writer and backs off recoverable write errors", async () => {
    const { director, writer, model, pending, sync, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    pending[0]!.reject(Error("Inference failed"));
    await flush();
    expect(director.snapshot.ready).toBeNull();
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(creativeStoryCadenceMs);
    sync(candidate(13));
    await flush();
    model.ready = false;
    pending[1]!.reject(Error("Worker stopped"));
    await flush();
    expect(writer.snapshot.phase).toBe("failed");
    setTime(creativeStoryCadenceMs * 2);
    sync(candidate(14));
    expect(model.write).toHaveBeenCalledTimes(2);
    expect(model.load).toHaveBeenCalledOnce();
  });

  it("active=false prevents new work without canceling an already captured request", async () => {
    const { director, writer, model, sync, settle } = setup();
    await writer.load();
    sync();
    await flush();
    sync(candidate(13), false);
    await settle();
    expect(director.snapshot.ready?.sourceTick).toBe(12);
    expect(model.dispose).not.toHaveBeenCalled();
  });

  it("drops navigation-invalidated output, then recovers after the finite request settles", async () => {
    const { director, writer, model, onReady, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    director.invalidate();
    setTime(creativeStoryCadenceMs);
    sync(candidate(13));
    expect(model.write).toHaveBeenCalledOnce();
    await settle();
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    expect(onReady).not.toHaveBeenCalled();
    expect(model.dispose).not.toHaveBeenCalled();
    sync(candidate(13));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
    await settle();
    expect(director.takeReady()?.sourceTick).toBe(13);
  });

  it("never associates an old-campaign completion with the new campaign", async () => {
    const { director, writer, model, sync, settle } = setup();
    await writer.load();
    sync();
    await flush();
    sync(candidate(1, "new-campaign"));
    await settle();
    expect(director.snapshot.ready).toBeNull();
    sync(candidate(1, "new-campaign"));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
    await settle();
    expect(director.takeReady()?.campaignId).toBe("new-campaign");
  });

  it("clears held prose when turned off and rejects a late old-worker result after reactivation", async () => {
    const { director, writer, model, sync, settle, setTime } = setup();
    await writer.load();
    sync();
    await flush();
    writer.stop();
    sync();
    await flush();
    await writer.load();
    setTime(creativeStoryCadenceMs);
    sync(candidate(13));
    await flush();
    await settle("An obsolete worker finds its ending.", 0);
    expect(director.snapshot.generating).toBe(true);
    expect(director.snapshot.ready).toBeNull();
    await settle(prose, 1);
    expect(director.snapshot.ready?.sourceTick).toBe(13);
    writer.stop();
    expect(director.snapshot.ready).toBeNull();
    expect(model.load).toHaveBeenCalledTimes(2);
  });
});
