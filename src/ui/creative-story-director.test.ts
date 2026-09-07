import { describe, expect, it, vi } from "vitest";
import type { CreativeStoryFocus } from "../narrator/creative-story";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createCreativeStoryController } from "./creative-story-controller";
import {
  createCreativeStoryDirector,
  creativeStoryCadenceMs,
  creativeStoryReadyMaximumAgeMs,
  type CreativeStoryCandidate,
} from "./creative-story-director";

const prose = "Relief sat uneasily on Mira's shoulders, a borrowed coat against the uncertainty ahead. She let it stay a little longer beside Iona.";
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

function farewell(tick = 13, campaignId = "campaign"): CreativeStoryCandidate {
  const source = candidate(tick, campaignId);
  return { ...source, remembrance: {
    kind: "farewell-remembrance", campaignId, eventId: source.job.eventId, tick,
    heroName: "Mira", companionName: "Iona",
    oath: { location: "Hollowwatch", headline: "Iona joins the road.", tick: 1 },
    farewell: { location: source.job.facts.location, headline: source.job.facts.headline, tick },
  } };
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

function firstVictory(tick = 13): CreativeStoryCandidate {
  const source = candidate(tick);
  return { ...source,
    viewpoint: { hero: { name: "Mira", values: ["curiosity"] },
      companion: { name: "Iona", role: "scout", purpose: "shared-road-oath", status: "travelling", victories: 1 } },
    firstVictory: {
      kind: "first-shared-victory", campaignId: "campaign", eventId: source.job.eventId, tick,
      combatId: "combat:first", heroName: "Mira", companionName: "Iona", companionId: "resident:iona", condition: "healthy",
      battle: { location: source.job.facts.location, headline: source.job.facts.headline, tick },
    },
  };
}

function setup(allowVignette = false, storyFocus?: () => CreativeStoryFocus) {
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
    allowVignette: () => allowVignette,
    onChange,
  });
  const onReady = vi.fn();
  const onWritten = vi.fn();
  const director = createCreativeStoryDirector({ writer, now: () => time, cadenceMs: () => cadence, onWritten, onReady,
    ...(storyFocus === undefined ? {} : { storyFocus }) });
  const sync = (next = candidate(), active = true) => director.sync({ campaignId: next.job.campaignId, candidate: next, active });
  const settle = async (text = prose, index = pending.length - 1) => {
    pending[index]!.resolve(text);
    await flush();
  };
  return { director, writer, model, pending, onChange, onWritten, onReady, sync, settle,
    setTime: (next: number) => { time = next; }, setCadence: (next: number) => { cadence = next; } };
}

describe("automatic creative story director", () => {
  it("notifies writing once before display, retaining an unshown completion independently of ready expiry", async () => {
    const { director, writer, onWritten, onReady, sync, settle, setTime } = setup();
    const order: string[] = [];
    onWritten.mockImplementation((passage) => {
      order.push("written");
      expect(Object.isFrozen(passage)).toBe(true);
      expect(passage).toBe(director.snapshot.ready);
      expect(onReady).not.toHaveBeenCalled();
    });
    onReady.mockImplementation(() => { order.push("ready"); });
    await writer.load();
    sync();
    await flush();
    expect(onWritten).not.toHaveBeenCalled();
    setTime(1_000);
    await settle();
    const passage = director.snapshot.ready;
    expect(order).toEqual(["written", "ready"]);
    expect(onWritten).toHaveBeenCalledExactlyOnceWith(passage);
    expect(passage).toMatchObject({ sourceEventId: "event-12", sourceTick: 12, origin: "model", text: prose });
    sync(candidate(13));
    setTime(1_000 + creativeStoryReadyMaximumAgeMs);
    expect(director.takeReady()).toBeNull();
    expect(onWritten).toHaveBeenCalledOnce();
    expect(onWritten.mock.calls[0]?.[0]).toBe(passage);
  });

  it("notifies an accepted authored recovery with its explicit origin, never the rejected raw draft", async () => {
    const { director, writer, onWritten, sync, settle } = setup(true);
    await writer.load();
    sync();
    await flush();
    await settle("<p>Rejected draft.</p>");
    const passage = director.takeReady();
    expect(onWritten).toHaveBeenCalledExactlyOnceWith(passage);
    expect(passage).toMatchObject({ sourceEventId: "event-12", origin: "authored" });
    expect(passage?.text).not.toContain("Rejected draft");
    expect(director.takeReady()).toBeNull();
    expect(onWritten).toHaveBeenCalledOnce();
  });

  it.each(["navigation", "campaign", "off", "dispose", "rejected", "error"] as const)(
    "does not archive a %s completion", async (reason) => {
      const { director, writer, pending, onWritten, onReady, sync, settle } = setup();
      await writer.load();
      sync();
      await flush();
      if (reason === "navigation") director.invalidate();
      if (reason === "campaign") sync(candidate(1, "another-campaign"), false);
      if (reason === "off") writer.stop();
      if (reason === "dispose") writer.dispose();
      if (reason === "error") {
        pending[0]!.reject(Error("Inference failed"));
        await flush();
      } else await settle(reason === "rejected" ? "An unfinished thought" : prose);
      expect(director.snapshot.ready).toBeNull();
      expect(onWritten).not.toHaveBeenCalled();
      expect(onReady).not.toHaveBeenCalled();
    },
  );

  it("still presents once when optional archive storage throws, without retrying the write callback", async () => {
    const { director, writer, onWritten, onReady, sync, settle } = setup();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      onWritten.mockImplementation(() => { throw Error("Storage full"); });
      await writer.load();
      sync();
      await flush();
      await settle();
      expect(onWritten).toHaveBeenCalledOnce();
      expect(onReady).toHaveBeenCalledOnce();
      expect(director.takeReady()?.text).toBe(prose);
      expect(director.takeReady()).toBeNull();
      expect(warning).toHaveBeenCalledExactlyOnceWith("The completed story could not be archived; it remains available to read.");
      expect(onWritten).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it("does not issue a stale presentation notification if the completion callback changes campaigns", async () => {
    const { director, writer, onWritten, onReady, sync, settle } = setup();
    onWritten.mockImplementation(() => { sync(candidate(1, "another-campaign"), false); });
    await writer.load();
    sync();
    await flush();
    await settle();
    expect(onWritten).toHaveBeenCalledOnce();
    expect(onWritten.mock.calls[0]?.[0]).toMatchObject({ campaignId: "campaign", sourceEventId: "event-12" });
    expect(onReady).not.toHaveBeenCalled();
    expect(director.snapshot.ready).toBeNull();
  });

  it.each(["farewell", "victory"] as const)("captures stored Shared road for %s despite the current solo view and retires both offers", async (kind) => {
    let focus: CreativeStoryFocus = "shared-road";
    const storyFocus = vi.fn(() => focus);
    const { director, writer, model, sync, settle, setTime } = setup(true, storyFocus);
    const choosing = Object.assign(model, { chooseMoment: vi.fn(async () => "1"), direct: vi.fn(async () => "2") });
    await writer.load();
    sync(candidate(), false);
    writer.sync({ ...candidate(), eligible: true });
    expect(writer.snapshot.focus).toBe("inner-life");
    const milestone = kind === "farewell" ? farewell() : firstVictory();
    expect(kind === "farewell" ? director.offerRemembrance(milestone) : director.offerFirstVictory(milestone)).toBe(true);
    sync(candidate(20));
    focus = "scene"; // Preference changes cannot rewrite a request already captured by the director.
    await flush();
    await settle();
    expect(storyFocus).toHaveBeenCalledOnce();
    expect(choosing.chooseMoment).not.toHaveBeenCalled();
    expect(choosing.direct).toHaveBeenCalledOnce();
    expect(model.write).toHaveBeenCalledOnce();
    expect(director.takeReady()).toMatchObject({ sourceTick: 13, origin: "model",
      direction: { stage: "orrery", origin: "model" }, momentSelection: {
        choice: "milestone", kind: kind === "farewell" ? "farewell-remembrance" : "first-shared-victory", origin: "focus",
      } });
    setTime(creativeStoryCadenceMs);
    sync(candidate(20));
    expect(model.write).toHaveBeenCalledOnce();
    expect(storyFocus).toHaveBeenCalledOnce();
    expect(kind === "farewell" ? director.offerRemembrance(milestone) : director.offerFirstVictory(milestone)).toBe(false);
  });

  it.each(["missing", "expired", "foreign"] as const)("does not credit Shared road with selecting a %s milestone", async (condition) => {
    const { director, writer, model, sync, settle, setTime } = setup(true, () => "shared-road");
    const choosing = Object.assign(model, { chooseMoment: vi.fn(async () => "1") });
    await writer.load();
    sync(candidate(), false);
    if (condition === "expired") {
      expect(director.offerRemembrance(farewell())).toBe(true);
      setTime(creativeStoryReadyMaximumAgeMs);
    } else if (condition === "foreign") expect(director.offerRemembrance(farewell(13, "other"))).toBe(false);
    sync(candidate(20));
    await flush();
    await settle();
    const held = director.takeReady();
    expect(held).toMatchObject({ sourceTick: 20, origin: "model" });
    expect(held).not.toHaveProperty("momentSelection");
    expect(choosing.chooseMoment).not.toHaveBeenCalled();
    expect(model.write).toHaveBeenCalledOnce();
  });

  it("holds a Shared road duet with the exact first victory and replaces it with ordinary model prose", async () => {
    const { director, writer, sync, settle, setTime } = setup(true);
    await writer.load();
    sync(candidate(), false);
    const victory = firstVictory();
    writer.sync({ ...victory, eligible: true });
    expect(writer.setFocus("shared-road")).toBe(true);
    expect(director.offerFirstVictory(victory)).toBe(true);
    sync(candidate(20));
    await flush();
    await settle("<p>Rejected draft.</p>");
    const held = director.takeReady();
    expect(held).toMatchObject({ sourceTick: 13, origin: "authored", inspirationTone: "trust",
      duet: { kind: "inner-voices", hero: { name: "Mira", voiceValue: "curiosity" }, companion: { name: "Iona" } }, firstVictory: victory.firstVictory });
    expect(held?.text).toBe(`${held?.duet?.hero.text}\n\n${held?.duet?.companion.text}`);
    expect([held?.duet, held?.duet?.hero, held?.duet?.companion].every(Object.isFrozen)).toBe(true);
    setTime(creativeStoryCadenceMs);
    sync(candidate(21));
    await flush();
    await settle();
    expect(director.takeReady()).toMatchObject({ text: prose, origin: "model", sourceTick: 21 });
    expect(writer.snapshot.duet).toBeNull();
  });

  it("captures the first victory once and freezes its source behind a current draft", async () => {
    const { director, writer, model, sync, settle, setTime } = setup(true);
    await writer.load();
    sync();
    await flush();
    const victory = firstVictory();
    expect(director.offerFirstVictory(victory)).toBe(true);
    (victory.firstVictory!.battle as { location: string }).location = "Changed later";
    (victory.firstVictory as { companionName: string }).companionName = "Someone else";
    await settle();
    director.takeReady();
    setTime(creativeStoryCadenceMs);
    sync(candidate(20));
    await flush();
    await settle("This is a continuation of the story.");
    const held = director.takeReady();
    expect(held).toMatchObject({ sourceTick: 13, origin: "authored", inspirationTone: "trust",
      firstVictory: { companionName: "Iona", battle: { location: job.facts.location, tick: 13 } } });
    expect(held?.text).toContain("Iona");
    expect(Object.isFrozen(held?.firstVictory?.battle)).toBe(true);
    expect(director.offerFirstVictory(firstVictory())).toBe(false);
    expect(model.write).toHaveBeenCalledTimes(2);
  });

  it.each(["1", "2", null] as const)("binds first-victory selection %s to the chosen source and retires both offered moments", async (choice) => {
    const { director, writer, model, onWritten, sync, settle, setTime } = setup(true);
    const choosing = Object.assign(model, { chooseMoment: vi.fn(async () => choice), direct: vi.fn(async () => "2") });
    await writer.load();
    sync(candidate(), false);
    expect(director.offerFirstVictory(firstVictory())).toBe(true);
    sync(candidate(20));
    await flush();
    await settle();
    const held = director.takeReady();
    expect(choosing.chooseMoment).toHaveBeenCalledOnce();
    expect(JSON.stringify(choosing.chooseMoment.mock.calls)).toContain("Recorded first shared victory");
    expect(onWritten).toHaveBeenCalledExactlyOnceWith(held);
    expect(held).toMatchObject({ origin: "model", sourceTick: choice === "1" ? 20 : 13,
      sourceEventId: choice === "1" ? "event-20" : "event-13",
      direction: { stage: "orrery", origin: "model" }, momentSelection: choice === "1"
        ? { choice: "current", origin: "model" }
        : { choice: "milestone", kind: "first-shared-victory", origin: choice === "2" ? "model" : "default" } });
    if (choice === "1") expect(held).not.toHaveProperty("firstVictory");
    else expect(held?.firstVictory?.tick).toBe(13);
    setTime(creativeStoryCadenceMs);
    sync(candidate(20));
    expect(model.write).toHaveBeenCalledOnce();
    expect(director.offerFirstVictory(firstVictory())).toBe(false);
  });

  it("shares one newest-milestone slot with farewell and expires repeated victory offers", async () => {
    const { director, writer, sync, settle, setTime } = setup(true);
    await writer.load();
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell(13))).toBe(true);
    expect(director.offerFirstVictory(firstVictory(14))).toBe(true);
    expect(director.offerRemembrance(farewell(13))).toBe(false);
    setTime(100_000);
    expect(director.offerFirstVictory(firstVictory(14))).toBe(false);
    setTime(creativeStoryReadyMaximumAgeMs);
    sync(candidate(30));
    await flush();
    await settle();
    expect(director.takeReady()).toMatchObject({ sourceTick: 30 });
    expect(writer.snapshot.firstVictory).toBeNull();
  });

  it("rejects ambiguous, misbound, off-mode, and wrong-kind victory offers", async () => {
    const { director, writer, sync } = setup(true);
    sync(candidate(), false);
    expect(director.offerFirstVictory(firstVictory())).toBe(false);
    await writer.load();
    expect(director.offerFirstVictory(farewell())).toBe(false);
    expect(director.offerRemembrance(firstVictory())).toBe(false);
    expect(director.offerFirstVictory({ ...firstVictory(), remembrance: farewell().remembrance! })).toBe(false);
    expect(director.offerFirstVictory({ ...firstVictory(), job: candidate(14).job })).toBe(false);
    expect(director.offerFirstVictory({ ...firstVictory(), job: candidate(13, "other").job })).toBe(false);
  });

  it("does not start a queued DM choice after immediate navigation invalidation", async () => {
    const { director, writer, model, sync } = setup(true);
    const directing = Object.assign(model, { direct: vi.fn(async () => "2") });
    await writer.load();
    sync();
    director.invalidate();
    await writer.waitForWriteSettlement();
    await flush();
    expect(directing.direct).not.toHaveBeenCalled();
    expect(model.write).not.toHaveBeenCalled();
    expect(writer.snapshot).toMatchObject({ phase: "ready", text: null, origin: null });
    expect(director.snapshot).toEqual({ ready: null, generating: false });
  });

  it.each(["navigation", "new-campaign"])("does not start prose after %s invalidates a pending DM choice", async (reason) => {
    const { director, writer, model, sync, settle, onReady, setTime } = setup(true);
    let resolve!: (choice: string) => void;
    Object.assign(model, { direct: vi.fn(() => new Promise<string>((done) => { resolve = done; })) });
    await writer.load();
    sync();
    await flush();
    expect(model.write).not.toHaveBeenCalled();
    if (reason === "navigation") director.invalidate();
    else sync(candidate(1, "new-campaign"));
    resolve("2");
    await writer.waitForWriteSettlement();
    await flush();
    expect(model.write).not.toHaveBeenCalled();
    expect(model.dispose).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    expect(writer.snapshot).toMatchObject({ phase: "ready", text: null, origin: null });
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    setTime(creativeStoryCadenceMs);
    sync(candidate(13, reason === "navigation" ? "campaign" : "new-campaign"));
    await flush();
    resolve("3");
    await flush();
    expect(model.write).toHaveBeenCalledOnce();
    await settle();
    expect(director.takeReady()?.direction).toEqual({ stage: "moth-court", origin: "model" });
    expect(model.load).toHaveBeenCalledOnce();
  });

  it("freezes the local DM's choice into the ready passage without changing its public scene", async () => {
    const { director, writer, model, sync, settle } = setup();
    const directing = Object.assign(model, { direct: vi.fn(async () => "2") });
    await writer.load();
    sync();
    await flush();
    expect(directing.direct).toHaveBeenCalledOnce();
    expect(model.write).toHaveBeenCalledOnce();
    await settle();
    const ready = director.takeReady();
    expect(ready).toMatchObject({
      text: prose, campaignId: "campaign", sourceTick: 12,
      location: job.facts.location, headline: job.facts.headline,
      direction: { stage: "orrery", origin: "model" },
    });
    expect(Object.isFrozen(ready?.direction)).toBe(true);
    expect(director.snapshot.ready).toBeNull();
  });

  it("remembers one farewell behind a draft, held passage, and normal presentation cooldown", async () => {
    const { director, writer, model, sync, settle, setTime } = setup(true);
    await writer.load();
    sync();
    await flush();
    const remembered = farewell();
    expect(director.offerRemembrance(remembered)).toBe(true);
    (remembered.viewpoint!.hero.values as string[])[0] = "mercy";
    (remembered.remembrance!.oath as { location: string }).location = "Changed caller location";
    (remembered.remembrance as { companionName: string }).companionName = "Someone else";
    sync(candidate(14));
    await settle();
    setTime(10_000);
    sync(candidate(20));
    expect(model.write).toHaveBeenCalledOnce();
    expect(director.takeReady()?.sourceTick).toBe(12);
    setTime(10_000 + creativeStoryCadenceMs - 1);
    sync(candidate(21));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(10_000 + creativeStoryCadenceMs);
    sync(candidate(22));
    await flush();
    expect(model.write).toHaveBeenCalledTimes(2);
    await settle("This is a continuation of the story.");
    expect(director.snapshot.ready).toMatchObject({
      sourceTick: 13, origin: "authored", inspirationTone: "care",
      remembrance: { companionName: "Iona", oath: { location: "Hollowwatch", tick: 1 } },
      voiceInspiration: { kind: "hero-value", heroName: "Mira", value: "curiosity", text: director.snapshot.ready?.text },
    });
    expect(director.snapshot.ready?.text).toContain("Iona");
    expect(director.snapshot.ready?.text).not.toContain("Someone else");
    expect(Object.isFrozen(director.snapshot.ready?.remembrance?.oath)).toBe(true);
    expect(Object.isFrozen(director.snapshot.ready?.voiceInspiration)).toBe(true);
  });

  it("keeps accepted model prose ordinary even when a farewell was offered", async () => {
    const { director, writer, sync, settle } = setup(true);
    await writer.load();
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell())).toBe(true);
    sync(candidate(14));
    await flush();
    await settle();
    const held = director.takeReady();
    expect(held).toMatchObject({ sourceTick: 13, origin: "model" });
    expect(held).not.toHaveProperty("voiceInspiration");
    expect(writer.snapshot.remembrance).toBeNull();
    expect(writer.snapshot.voiceInspiration).toBeNull();
  });

  it("uses only the newest pending farewell and never refreshes an identical offer's expiry", async () => {
    const { director, writer, sync, settle, setTime } = setup(true);
    await writer.load();
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell())).toBe(true);
    expect(director.offerRemembrance(farewell(14))).toBe(true);
    expect(director.offerRemembrance(farewell(13))).toBe(false);
    setTime(100_000);
    expect(director.offerRemembrance(farewell(14))).toBe(false);
    setTime(creativeStoryReadyMaximumAgeMs);
    sync(candidate(30));
    await flush();
    await settle("This is a continuation of the story.");
    expect(director.takeReady()).toMatchObject({ sourceTick: 30, origin: "authored" });
    expect(writer.snapshot.remembrance).toBeNull();
  });

  it.each(["navigation", "off", "campaign"])("discards queued remembrance on %s", async (reason) => {
    const { director, writer, sync, settle } = setup(true);
    await writer.load();
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell())).toBe(true);
    if (reason === "navigation") director.invalidate();
    if (reason === "off") {
      writer.stop();
      expect(director.snapshot.ready).toBeNull();
      await writer.load();
    }
    const next = candidate(30, reason === "campaign" ? "new-campaign" : "campaign");
    sync(next);
    await flush();
    await settle("This is a continuation of the story.");
    expect(director.takeReady()).toMatchObject({ sourceTick: 30, campaignId: next.job.campaignId });
    expect(writer.snapshot.remembrance).toBeNull();
  });

  it("does not lose a pending farewell or advance cadence when the writer refuses a start", async () => {
    const { director, writer, model, sync, settle } = setup(true);
    await writer.load();
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell())).toBe(true);
    const write = vi.spyOn(writer, "write").mockReturnValueOnce(false);
    sync(candidate(14));
    expect(director.snapshot.generating).toBe(false);
    expect(model.write).not.toHaveBeenCalled();
    sync(candidate(15));
    await flush();
    expect(write).toHaveBeenCalledTimes(2);
    await settle("This is a continuation of the story.");
    expect(director.takeReady()).toMatchObject({ sourceTick: 13, remembrance: { tick: 13 } });
  });

  it("does not consume a newer farewell offered by a reentrant writer notification", async () => {
    const { director, writer, sync, settle, onChange, setTime } = setup(true);
    await writer.load();
    sync(candidate(), false);
    director.offerRemembrance(farewell());
    let offered = false;
    onChange.mockImplementation(() => {
      if (!offered && writer.snapshot.phase === "writing") {
        offered = true;
        expect(director.offerRemembrance(farewell(14))).toBe(true);
      }
    });
    sync(candidate(20));
    await flush();
    await settle("This is a continuation of the story.");
    expect(director.takeReady()?.sourceTick).toBe(13);
    setTime(creativeStoryCadenceMs);
    sync(candidate(21));
    await flush();
    await settle("This is a continuation of the story.");
    expect(director.takeReady()?.sourceTick).toBe(14);
  });

  it("rejects off-mode, wrong-campaign, malformed and already attempted offers", async () => {
    const { director, writer, sync, settle } = setup(true);
    sync(candidate(), false);
    expect(director.offerRemembrance(farewell())).toBe(false);
    await writer.load();
    expect(director.offerRemembrance(candidate(13))).toBe(false);
    expect(director.offerRemembrance(farewell(13, "elsewhere"))).toBe(false);
    expect(director.offerRemembrance(farewell(NaN))).toBe(false);
    const mismatched = { ...farewell(), job: candidate(14).job };
    expect(director.offerRemembrance(mismatched)).toBe(false);
    sync(farewell());
    await flush();
    await settle();
    expect(director.offerRemembrance(farewell())).toBe(false);
  });

  it("cannot overwrite a new campaign's cadence when write publication switches campaigns", async () => {
    const { director, writer, model, sync, settle, onChange } = setup();
    await writer.load();
    let switched = false;
    onChange.mockImplementation(() => {
      if (!switched && writer.snapshot.phase === "writing") {
        switched = true;
        sync(candidate(1, "new-campaign"));
      }
    });
    sync(candidate(100));
    await writer.waitForWriteSettlement();
    await flush();
    expect(model.write).not.toHaveBeenCalled();
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    sync(candidate(1, "new-campaign"));
    await flush();
    expect(model.write).toHaveBeenCalledOnce();
    await settle();
    expect(director.takeReady()).toMatchObject({ sourceTick: 1, campaignId: "new-campaign" });
  });

  it("carries authored origin and captured injured people through play with the same cooldown", async () => {
    const { director, writer, model, sync, settle, setTime } = setup(true);
    const companion = { name: "Iona", role: "miller", status: "injured" as const, purpose: "shared-road-oath" as const, victories: 0 };
    const injured = { ...candidate(), viewpoint: { hero: { name: "Mira", values: ["loyalty" as const] }, companion } };
    writer.sync({ ...injured, eligible: true });
    writer.setFocus("shared-road");
    await writer.load();
    sync(injured);
    await flush();
    sync(candidate(13));
    await settle("This is a continuation of the story.");
    expect(director.snapshot.ready).toMatchObject({ origin: "authored", inspirationTone: "care", sourceTick: 12 });
    expect(director.snapshot.ready?.text).toContain("Iona");
    expect(director.takeReady()?.origin).toBe("authored");
    expect(director.takeReady()).toBeNull();
    setTime(creativeStoryCadenceMs - 1);
    sync(candidate(14));
    expect(model.write).toHaveBeenCalledOnce();
    setTime(creativeStoryCadenceMs);
    sync(candidate(14));
    await flush();
    await settle();
    expect(director.snapshot.ready).toMatchObject({ origin: "model", sourceTick: 14 });
  });

  it("does not queue an authored recovery after a navigation invalidation", async () => {
    const { director, writer, sync, settle, onReady } = setup(true);
    await writer.load();
    sync();
    await flush();
    director.invalidate();
    await settle("This is a continuation of the story.");
    expect(director.snapshot).toEqual({ ready: null, generating: false });
    expect(onReady).not.toHaveBeenCalled();
  });

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
    (original.job as { eventId: string }).eventId = "mutated-source-event";
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
      campaignId: "campaign", sourceEventId: "event-12", sourceTick: 12, readyAtMs: duration,
      inspirationTone: writer.snapshot.seedTone,
      origin: "model",
      direction: { stage: "parchment", origin: "default" },
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
