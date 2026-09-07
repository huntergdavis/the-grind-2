import { describe, expect, it, vi } from "vitest";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import type { CreativeStoryMemory } from "../narrator/creative-continuity";
import { buildCreativeStoryMessages, selectStorySeed, type CreativeStoryViewpoint } from "../narrator/creative-story";
import { createCreativeStoryController, type CreativeStoryMoment } from "./creative-story-controller";
import { writeStoryBeatAtStableScene } from "./story-beat-write";
import type { FarewellRemembrance } from "../narrator/farewell-remembrance";
import { buildCreativeDirectionMessages, defaultNarrativeDirection, type NarrativeStage } from "../narrator/creative-direction";

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

function setup(cached = false, allowVignette = () => false, previousStage: () => NarrativeStage | undefined = () => undefined,
  continuity?: (moment: CreativeStoryMoment) => readonly CreativeStoryMemory[]) {
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
    previousStage: vi.fn(previousStage),
    ...(continuity === undefined ? {} : { continuity }),
    onChange: vi.fn(),
  };
  const controller = createCreativeStoryController(deps);
  controller.sync({ job, mode: "travel", eligible: true });
  return { controller, writer, deps };
}

// Synthetic public request: canonical projection itself is covered in ui/farewell-remembrance.test.ts.
function remembranceFixture() {
  const farewellJob: StoryBeatJobV1 = {
    ...job, eventId: "farewell-12",
    facts: { ...job.facts, location: "Dunford", headline: "Tamsin's Shared Road Oath is complete.",
      action: "Tamsin departs wounded but alive after 0 shared victories.", consequence: "The party has no active companion." },
  };
  const solo: CreativeStoryViewpoint = { hero: structuredClone(viewpoint.hero), companion: null };
  const remembrance = {
    kind: "farewell-remembrance", campaignId: farewellJob.campaignId, eventId: farewellJob.eventId, tick: farewellJob.tick,
    heroName: solo.hero.name, companionName: "Tamsin",
    oath: { location: "Copper Hollow", headline: "Tamsin joins the road.", tick: 2 },
    farewell: { location: farewellJob.facts.location, headline: farewellJob.facts.headline, tick: farewellJob.tick },
  } satisfies FarewellRemembrance;
  return { farewellJob, solo, remembrance };
}

describe("captured narrative continuity", () => {
  it("lets a later write use newly archived prose without changing the first request", async () => {
    const archive: CreativeStoryMemory[] = [];
    const continuity = vi.fn((moment: CreativeStoryMoment) => archive.filter((entry) => entry.sourceTick < moment.job.tick));
    const { controller, writer } = setup(false, () => false, () => undefined, continuity);
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    await controller.load();
    expect(continuity).not.toHaveBeenCalled();
    expect(controller.write()).toBe(true);
    expect(continuity).toHaveBeenCalledExactlyOnceWith({ job, mode: "travel", viewpoint });
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.text).toBe(prose);
    const firstRequest = JSON.stringify(writer.write.mock.calls[0]?.[0]);
    expect(firstRequest).not.toContain(prose);
    archive.push({ campaignId: job.campaignId, sourceEventId: job.eventId, sourceTick: job.tick, text: controller.snapshot.text! });
    const laterProse = "Mira carried that relief into the silence ahead. This time she let uncertainty sit beside it.";
    writer.write.mockResolvedValueOnce(laterProse);
    const nextJob = { ...job, eventId: "next-event", tick: job.tick + 1 };
    controller.sync({ job: nextJob, mode: "travel", eligible: true, viewpoint });
    expect(controller.write()).toBe(true);
    await controller.waitForWriteSettlement();
    expect(continuity).toHaveBeenNthCalledWith(2, { job: nextJob, mode: "travel", viewpoint });
    expect(JSON.stringify(writer.write.mock.calls[1]?.[0])).toContain(prose);
    expect(JSON.stringify(writer.write.mock.calls[0]?.[0])).toBe(firstRequest);
    expect(writer.load).toHaveBeenCalledOnce();
    expect(writer.write).toHaveBeenCalledTimes(2);
    expect(controller.snapshot.text).toBe(laterProse);
    expect(controller.snapshot.origin).toBe("model");
  });

  it.each([false, true])("rejects an exact recalled passage captured before archive mutation, recovery %s", async (allowRecovery) => {
    const previous = { campaignId: job.campaignId, sourceEventId: "prior-2", sourceTick: 2,
      text: prose.replace(" She", "\n\nShe") };
    const archive: CreativeStoryMemory[] = [previous];
    const { controller, writer } = setup(false, () => allowRecovery, () => undefined, () => archive);
    let resolve!: (choice: string) => void;
    Object.assign(writer, { direct: vi.fn(() => new Promise<string>((done) => { resolve = done; })) });
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    await controller.load();
    expect(controller.write()).toBe(true);
    await Promise.resolve();
    previous.text = "The archive changed after the request was captured.";
    archive.splice(0, archive.length);
    resolve("1");
    await controller.waitForWriteSettlement();
    expect(writer.write).toHaveBeenCalledOnce();
    expect(controller.snapshot.phase).toBe("ready");
    if (allowRecovery) {
      expect(controller.snapshot.origin).toBe("authored");
      expect(controller.snapshot.text).not.toBe(prose);
      expect(controller.snapshot.text).not.toBeNull();
    } else {
      expect(controller.snapshot.origin).toBeNull();
      expect(controller.snapshot.text).toBeNull();
      expect(controller.snapshot.status).toContain("Repeated model draft skipped");
    }
  });

  it("freezes prior prose before an asynchronous stage choice even if the archive and its entries change", async () => {
    const previous = { campaignId: job.campaignId, sourceEventId: "earlier-event", sourceTick: 2,
      text: "Mira kept the bridge's silence beside her hope." };
    const archive: CreativeStoryMemory[] = [previous];
    const continuity = vi.fn(() => archive);
    const { controller, writer } = setup(false, () => false, () => undefined, continuity);
    let resolve!: (choice: string) => void;
    const directed = Object.assign(writer, { direct: vi.fn(() => new Promise<string>((done) => { resolve = done; })) });
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    const sourceIdentity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
    const seed = selectStorySeed("travel", sourceIdentity, 0, { viewpoint, focus: "inner-life" });
    const expected = buildCreativeStoryMessages(job, seed, viewpoint, "inner-life", structuredClone(archive));
    await controller.load();
    expect(controller.write()).toBe(true);
    expect(continuity).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(directed.direct).toHaveBeenCalledOnce();
    expect(writer.write).not.toHaveBeenCalled();
    previous.text = "A changed archive must not replace the captured memory.";
    archive.push({ ...previous, sourceEventId: "late-entry", sourceTick: 3, text: "Late prose must not enter this request." });
    resolve("2");
    await controller.waitForWriteSettlement();
    expect(writer.write).toHaveBeenCalledExactlyOnceWith(expected);
    expect(JSON.stringify(writer.write.mock.calls)).not.toContain("changed archive");
    expect(JSON.stringify(writer.write.mock.calls)).not.toContain("Late prose");
    expect(continuity).toHaveBeenCalledOnce();
  });

  it.each(["1", "2"] as const)("captures each candidate's own source tick before moment choice %s", async (choice) => {
    const { farewellJob, solo, remembrance } = remembranceFixture();
    const currentJob = { ...job, eventId: "current-13", tick: 13,
      facts: { ...job.facts, headline: "A newer solo scene" } };
    const previous = { campaignId: job.campaignId, sourceEventId: "prior-2", sourceTick: 2,
      text: "Mira wondered whether the old lantern could hold an answer." };
    const between = { campaignId: job.campaignId, sourceEventId: "later-12", sourceTick: 12,
      text: "Mira carried a new question into the quiet." };
    const archive: CreativeStoryMemory[] = [previous, between];
    const continuity = vi.fn((moment: CreativeStoryMoment) => archive.filter((entry) => entry.sourceTick < moment.job.tick));
    const { controller, writer } = setup(false, () => false, () => undefined, continuity);
    let resolve!: (choice: "1" | "2") => void;
    const betweenProse = between.text;
    writer.write.mockResolvedValueOnce(betweenProse);
    const choosing = Object.assign(writer, {
      chooseMoment: vi.fn(() => new Promise<"1" | "2">((done) => { resolve = done; })),
      direct: vi.fn(async () => "1"),
    });
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    const selectedJob = choice === "1" ? currentJob : farewellJob;
    const selectedMode = choice === "1" ? "travel" : "chronicle";
    const sourceIdentity = JSON.stringify([selectedJob.campaignId, selectedJob.eventId, selectedJob.tick, selectedJob.sourceFingerprint]);
    const seed = selectStorySeed(selectedMode, sourceIdentity, 0, { viewpoint: solo, focus: "inner-life" });
    const expected = buildCreativeStoryMessages(selectedJob, seed, solo, "inner-life",
      structuredClone(archive.filter((entry) => entry.sourceTick < selectedJob.tick)));
    await controller.load();
    expect(controller.write(() => true, { job: currentJob, mode: "travel", viewpoint: solo })).toBe(true);
    expect(continuity).toHaveBeenNthCalledWith(1, { job: farewellJob, mode: "chronicle", viewpoint: solo });
    expect(continuity).toHaveBeenNthCalledWith(2, { job: currentJob, mode: "travel", viewpoint: solo });
    expect(choosing.chooseMoment).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(choosing.chooseMoment).toHaveBeenCalledOnce();
    previous.text = "A later edit cannot replace either captured candidate.";
    between.text = "Another later edit cannot replace the newer candidate.";
    archive.splice(0, archive.length);
    resolve(choice);
    await controller.waitForWriteSettlement();
    expect(writer.write).toHaveBeenCalledExactlyOnceWith(expected);
    expect(JSON.stringify(writer.write.mock.calls)).toContain("old lantern");
    expect(JSON.stringify(writer.write.mock.calls).includes("new question")).toBe(choice === "1");
    expect(continuity).toHaveBeenCalledTimes(2);
    expect(controller.snapshot.text).toBe(choice === "1" ? null : betweenProse);
  });

  it("does not consult continuity or start inference while off, loading, stopped, or ineligible", async () => {
    const continuity = vi.fn((): readonly CreativeStoryMemory[] => []);
    const { controller, writer, deps } = setup(true, () => false, () => undefined, continuity);
    await controller.checkCache();
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    controller.setFocus("scene");
    expect(controller.write()).toBe(false);
    expect(deps.createWriter).not.toHaveBeenCalled();
    let resolveLoad!: () => void;
    writer.load.mockImplementationOnce(() => new Promise<void>((done) => { resolveLoad = () => { writer.ready = true; done(); }; }));
    const loading = controller.load();
    expect(controller.write()).toBe(false);
    resolveLoad();
    await loading;
    controller.sync({ job, mode: "travel", eligible: false, viewpoint });
    expect(controller.write()).toBe(false);
    controller.stop();
    expect(controller.write()).toBe(false);
    expect(continuity).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });
});

describe("local DM direction before prose", () => {
  it("captures only the last shown stage and excludes it from both the prompt and model choices", async () => {
    let previous: NarrativeStage = "parchment";
    const { controller, writer, deps } = setup(true, () => false, () => previous);
    const directed = Object.assign(writer, { direct: vi.fn(async () => "3") });
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    await controller.load();
    controller.write();
    previous = "orrery";
    await controller.waitForWriteSettlement();
    expect(deps.previousStage).toHaveBeenCalledOnce();
    expect(directed.direct).toHaveBeenCalledExactlyOnceWith(
      buildCreativeDirectionMessages(job, viewpoint, "inner-life", "parchment"), { exclude: "1" },
    );
    expect(controller.snapshot.direction).toEqual({ stage: "moth-court", origin: "model" });
  });

  it("does not label an excluded worker response as a model-directed choice", async () => {
    const { controller, writer } = setup(true, () => false, () => "orrery");
    Object.assign(writer, { direct: vi.fn(async () => "2") });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.direction).toEqual(defaultNarrativeDirection);
    expect(writer.write).toHaveBeenCalledOnce();
  });

  it.each([
    ["1", "parchment", "model"], ["2", "orrery", "model"], ["3", "moth-court", "model"],
    [null, "parchment", "default"], ["invented-scene", "parchment", "default"],
  ] as const)("carries choice %s into the passage without changing the prose prompt", async (choice, stage, origin) => {
    const { controller, writer, deps } = setup(true);
    const directed = Object.assign(writer, { direct: vi.fn(async () => choice) });
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(directed.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(job, viewpoint, "inner-life"));
    const sourceIdentity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
    const seed = selectStorySeed("travel", sourceIdentity, 0, { viewpoint, focus: "inner-life" });
    expect(writer.write).toHaveBeenCalledExactlyOnceWith(buildCreativeStoryMessages(job, seed, viewpoint, "inner-life"));
    expect(controller.snapshot).toMatchObject({ phase: "ready", text: prose, origin: "model", direction: { stage, origin } });
    expect(deps.createWriter).toHaveBeenCalledOnce();
  });

  it("keeps one busy operation through direction and uses the originally captured scene", async () => {
    const { controller, writer } = setup(true);
    let resolve!: (choice: string) => void;
    const directed = Object.assign(writer, { direct: vi.fn(() => new Promise<string>((done) => { resolve = done; })) });
    const captured = structuredClone(job);
    controller.sync({ job: captured, mode: "travel", eligible: true, viewpoint });
    const expected = buildCreativeDirectionMessages(captured, viewpoint, "inner-life");
    await controller.load();
    expect(controller.write()).toBe(true);
    await Promise.resolve();
    expect(controller.snapshot).toMatchObject({ phase: "writing", busy: true, text: null });
    expect(controller.write()).toBe(false);
    expect(writer.write).not.toHaveBeenCalled();
    (captured.facts as { headline: string }).headline = "A later scene must not replace this one.";
    resolve("2");
    await controller.waitForWriteSettlement();
    expect(directed.direct).toHaveBeenCalledExactlyOnceWith(expected);
    expect(JSON.stringify(writer.write.mock.calls)).not.toContain("A later scene");
    expect(controller.snapshot.direction).toEqual({ stage: "orrery", origin: "model" });
  });

  it("keeps model-directed staging distinct from authored recovery prose", async () => {
    const { controller, writer } = setup(true, () => true);
    Object.assign(writer, { direct: vi.fn(async () => "3") });
    controller.sync({ job, mode: "travel", eligible: true, viewpoint });
    writer.write.mockResolvedValueOnce("<p>Rejected draft.</p>");
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", origin: "authored", direction: { stage: "moth-court", origin: "model" } });
    expect(controller.snapshot.text).not.toBeNull();
  });

  it("does not start prose or restore direction after cancellation during the model choice", async () => {
    const { controller, writer } = setup(true);
    let resolve!: (choice: string) => void;
    Object.assign(writer, { direct: vi.fn(() => new Promise<string>((done) => { resolve = done; })) });
    await controller.load();
    controller.write();
    await Promise.resolve();
    controller.stop();
    resolve("2");
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(writer.write).not.toHaveBeenCalled();
    expect(controller.snapshot).toMatchObject({ phase: "off", text: null, direction: defaultNarrativeDirection });
  });

  it("a failed direction operation cannot claim authored prose or a model-selected stage", async () => {
    const { controller, writer } = setup(true, () => true);
    Object.assign(writer, { direct: vi.fn(async () => { writer.ready = false; throw Error("Direction timed out"); }) });
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(writer.write).not.toHaveBeenCalled();
    expect(controller.snapshot).toMatchObject({ phase: "failed", busy: false, text: null, origin: null, direction: defaultNarrativeDirection });
  });
});

describe("farewell remembrance recovery boundary", () => {
  const rejectedDraft = "This is a continuation of the story.";

  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("captures %s before a pending write and clears attribution on stop", async (value) => {
    const { controller, writer } = setup(true, () => true);
    const { farewellJob, solo, remembrance } = remembranceFixture();
    const values = [value];
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true,
      viewpoint: { ...solo, hero: { ...solo.hero, values } }, remembrance });
    let resolve!: (text: string) => void;
    writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    values[0] = value === "mercy" ? "courage" : "mercy";
    expect(controller.snapshot.voiceInspiration).toBeNull();
    resolve(rejectedDraft);
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ origin: "authored", remembrance,
      voiceInspiration: { kind: "hero-value", heroName: "Mira", value, text: controller.snapshot.text } });
    expect(controller.snapshot.text).toContain("wounded but alive");
    expect(Object.isFrozen(controller.snapshot.voiceInspiration)).toBe(true);
    controller.stop();
    expect(controller.snapshot.voiceInspiration).toBeNull();
  });

  it("uses the unchanged neutral farewell without values and no attribution", async () => {
    const { controller, writer } = setup(true, () => true);
    const { farewellJob, solo, remembrance } = remembranceFixture();
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true,
      viewpoint: { ...solo, hero: { ...solo.hero, values: [] } }, remembrance });
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ origin: "authored", remembrance, voiceInspiration: null });
  });

  it("publishes a bound remembrance only as authored care after a rejected model draft", async () => {
    const { controller, writer } = setup(true, () => true);
    const { farewellJob, solo, remembrance } = remembranceFixture();
    const original = JSON.stringify({ farewellJob, solo, remembrance });
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    expect(controller.snapshot.remembrance).toBeNull();
    expect(controller.write()).toBe(true);
    expect(controller.snapshot.remembrance).toBeNull();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", origin: "authored", seedTone: "care",
      seedTheme: "Authored farewell remembrance", remembrance });
    expect(controller.snapshot.text).toContain("Mira");
    expect(controller.snapshot.text).toContain("Tamsin");
    expect(controller.snapshot.text).toContain("Copper Hollow");
    expect([controller.snapshot.remembrance, controller.snapshot.remembrance!.oath, controller.snapshot.remembrance!.farewell].every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify({ farewellJob, solo, remembrance })).toBe(original);
  });

  it("clears the previous authored remembrance when a later model draft is accepted", async () => {
    const { controller, writer } = setup(true, () => true);
    const { farewellJob, solo, remembrance } = remembranceFixture();
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.remembrance).toEqual(remembrance);
    expect(controller.snapshot.voiceInspiration).not.toBeNull();
    controller.write();
    expect(controller.snapshot).toMatchObject({ text: null, origin: null, remembrance: null, voiceInspiration: null });
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ text: prose, origin: "model", remembrance: null, voiceInspiration: null });
  });

  it.each(["campaign", "event", "tick", "hero", "oath-tick", "farewell-tick", "farewell-location", "farewell-headline", "active-companion"] as const)(
    "uses ordinary recovery instead of a remembrance with mismatched %s binding", async (wrong) => {
      const { controller, writer } = setup(true, () => true);
      const { farewellJob, solo, remembrance } = remembranceFixture();
      if (wrong === "campaign") remembrance.campaignId = "another-campaign";
      if (wrong === "event") remembrance.eventId = "another-event";
      if (wrong === "tick") remembrance.tick += 1;
      if (wrong === "hero") remembrance.heroName = "Another hero";
      if (wrong === "oath-tick") remembrance.oath.tick = farewellJob.tick;
      if (wrong === "farewell-tick") remembrance.farewell.tick += 1;
      if (wrong === "farewell-location") remembrance.farewell.location = "Another place";
      if (wrong === "farewell-headline") remembrance.farewell.headline = "Another goodbye";
      controller.sync({ job: farewellJob, mode: "chronicle", eligible: true,
        viewpoint: wrong === "active-companion" ? viewpoint : solo, remembrance });
      writer.write.mockResolvedValueOnce(rejectedDraft);
      await controller.load();
      controller.write();
      await controller.waitForWriteSettlement();
      expect(controller.snapshot).toMatchObject({ origin: "authored", remembrance: null, voiceInspiration: null, seedTheme: "Authored emotional interlude" });
      expect(controller.snapshot.text).not.toContain("Copper Hollow");
    },
  );

  it.each(["quiet", "scene"])("does not publish a remembrance when %s excludes recovery", async (condition) => {
    const { controller, writer } = setup(true, () => condition !== "quiet");
    const { farewellJob, solo, remembrance } = remembranceFixture();
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    if (condition === "scene") expect(controller.setFocus("scene")).toBe(true);
    writer.write.mockResolvedValueOnce(rejectedDraft);
    await controller.load();
    controller.write();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, remembrance: null, voiceInspiration: null });
  });

  it("deep-captures the two record excerpts before both dispatch and asynchronous settlement", async () => {
    const { controller, writer } = setup(true, () => true);
    const { farewellJob, solo, remembrance } = remembranceFixture();
    const expected = structuredClone(remembrance);
    controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    remembrance.oath.location = "Changed before dispatch";
    let resolve!: (value: string) => void;
    writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await controller.load();
    controller.write();
    await Promise.resolve();
    remembrance.companionName = "Changed after dispatch";
    remembrance.farewell.headline = "Changed after dispatch";
    resolve(rejectedDraft);
    await controller.waitForWriteSettlement();
    expect(controller.snapshot.remembrance).toEqual(expected);
    expect(controller.snapshot.text).toContain("Copper Hollow");
    expect(controller.snapshot.text).toContain("Tamsin");
    expect(controller.snapshot.text).not.toContain("Changed");
  });

  it("sends byte-identical model prompts with and without the host-only remembrance", async () => {
    const { farewellJob, solo, remembrance } = remembranceFixture();
    const plain = setup(true, () => true);
    const remembered = setup(true, () => true);
    plain.controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo });
    remembered.controller.sync({ job: farewellJob, mode: "chronicle", eligible: true, viewpoint: solo, remembrance });
    for (const { controller } of [plain, remembered]) {
      await controller.load();
      controller.write();
      await controller.waitForWriteSettlement();
      expect(controller.snapshot).toMatchObject({ origin: "model", remembrance: null });
    }
    const ordinaryPrompt = JSON.stringify(plain.writer.write.mock.calls[0]![0]);
    const rememberedPrompt = JSON.stringify(remembered.writer.write.mock.calls[0]![0]);
    expect(rememberedPrompt).toBe(ordinaryPrompt);
    expect(rememberedPrompt).not.toContain(remembrance.oath.location);
    expect(rememberedPrompt).not.toContain(remembrance.oath.headline);
  });
});

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
