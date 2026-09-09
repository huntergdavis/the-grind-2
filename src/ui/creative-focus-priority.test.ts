import { describe, expect, it, vi } from "vitest";
import { buildCreativeDirectionMessages, defaultNarrativeDirection } from "../narrator/creative-direction";
import { buildCreativeMomentMessages } from "../narrator/creative-moment";
import { buildCreativeStoryMessages, selectStorySeed, type CreativeStoryFocus, type CreativeStoryViewpoint } from "../narrator/creative-story";
import type { CreativeWriterMessage } from "../narrator/creative-writer-client";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createCreativeStoryController, type CreativeStoryMoment } from "./creative-story-controller";

type Source = Parameters<ReturnType<typeof createCreativeStoryController>["sync"]>[0];
const prose = "Relief sat uneasily on Mira's shoulders beside Tamsin, a borrowed coat against the uncertainty ahead. Mira let it stay a little longer.";
const rejected = "<p>This completed draft is unusable.</p>";

// Public synthetic fixtures prove host binding, not canonical combat/farewell admission.
// The existing milestone projector suites separately prove real simulation transitions.
function fixtures(kind: "farewell" | "victory" = "farewell") {
  const hero = { name: "Mira", values: ["curiosity", "loyalty"] } satisfies CreativeStoryViewpoint["hero"];
  const job: StoryBeatJobV1 = {
    schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
    campaignId: "focus-campaign", eventId: "milestone-12", tick: 12, sourceFingerprint: "captured-milestone-source",
    facts: {
      schemaVersion: 1, kind: "public-story-beat", location: "Dunford",
      headline: kind === "farewell" ? "Tamsin's Shared Road Oath is complete." : "Mira and Tamsin win their first fight.",
      action: kind === "farewell" ? "Tamsin departs injured but alive." : "The roadside bandit is defeated.",
      consequence: kind === "farewell" ? "Mira now travels alone." : "Tamsin is alive and injured after the victory.",
    },
    deterministicFallback: "Private fallback", maximumInputTokens: 320, maximumOutputTokens: 48,
  };
  const primary: Source = {
    job, mode: kind === "farewell" ? "chronicle" : "battle", eligible: true,
    viewpoint: { hero, companion: kind === "farewell" ? null
      : { name: "Tamsin", role: "miller", purpose: "shared-road-oath", status: "injured", victories: 1 } },
    ...(kind === "farewell" ? { remembrance: {
      kind: "farewell-remembrance" as const, campaignId: job.campaignId, eventId: job.eventId, tick: job.tick,
      heroName: hero.name, companionName: "Tamsin",
      oath: { location: "Copper Hollow", headline: "Tamsin joins the road.", tick: 2 },
      farewell: { location: job.facts.location, headline: job.facts.headline, tick: job.tick },
    } } : { firstVictory: {
      kind: "first-shared-victory" as const, campaignId: job.campaignId, eventId: job.eventId, tick: job.tick,
      heroName: hero.name, companionName: "Tamsin", companionId: "private-tamsin", combatId: "private-combat",
      condition: "injured" as const,
      battle: { location: job.facts.location, headline: job.facts.headline, tick: job.tick },
    } }),
  };
  const current: CreativeStoryMoment = {
    job: { ...job, eventId: "current-14", tick: 14, sourceFingerprint: "captured-current-source", facts: {
      ...job.facts, location: "Amber Crossing", headline: "A fork divides the road.",
      action: "Mira follows the eastern road.", consequence: "The route advances toward the ridge.",
    } },
    mode: "travel", viewpoint: { hero, companion: null },
  };
  return { primary, current };
}

function expectedProse(source: Source | CreativeStoryMoment, requestedFocus: CreativeStoryFocus) {
  const job = source.job!;
  const viewpoint = source.viewpoint ?? null;
  const focus = requestedFocus === "shared-road" && viewpoint?.companion == null ? "inner-life" : requestedFocus;
  const identity = JSON.stringify([job.campaignId, job.eventId, job.tick, job.sourceFingerprint]);
  const seed = selectStorySeed(source.mode, identity, 0, { viewpoint, focus });
  return buildCreativeStoryMessages(job, seed, viewpoint ?? undefined, focus, [],
    "remembrance" in source ? source.remembrance : undefined,
    "firstVictory" in source ? source.firstVictory : undefined);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

function setup(kind: "farewell" | "victory" = "farewell", allowRecovery = () => true) {
  const fixture = fixtures(kind);
  const model = {
    ready: false,
    load: vi.fn(async () => { model.ready = true; }),
    chooseMoment: vi.fn(async (_messages: readonly CreativeWriterMessage[]): Promise<"1" | "2" | null> => "1"),
    direct: vi.fn(async (_messages: readonly CreativeWriterMessage[]): Promise<string | null> => "2"),
    write: vi.fn(async (_messages: readonly CreativeWriterMessage[]) => prose),
    dispose: vi.fn(() => { model.ready = false; }),
  };
  const controller = createCreativeStoryController({
    createWriter: () => model, hasCachedModel: async () => true, removeCachedModel: async () => undefined,
    allowVignette: allowRecovery, onChange: vi.fn(),
  });
  const activate = async (primary = fixture.primary) => {
    controller.sync({ ...fixture.current, eligible: true });
    expect(controller.snapshot.focus).toBe("inner-life");
    await controller.load();
    controller.sync(primary);
  };
  return { ...fixture, controller, model, activate };
}

describe("explicit Shared road companion-story priority", () => {
  it.each([false, true])("prioritizes the captured farewell over a newer current scene, current companion=%s", async (withCompanion) => {
    const run = setup();
    const current = withCompanion ? { ...run.current, viewpoint: {
      ...run.current.viewpoint!, companion: { name: "Neris", role: "miller", purpose: "shared-road-oath" as const,
        status: "travelling" as const, victories: 0 },
    } } : run.current;
    await run.activate();
    expect(run.controller.snapshot.focus).toBe("inner-life");
    expect(run.controller.write(() => true, current, "shared-road")).toBe(true);
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.model.direct).toHaveBeenCalledExactlyOnceWith(
      buildCreativeDirectionMessages(run.primary.job!, run.primary.viewpoint!, "inner-life"));
    expect(run.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(run.primary, "shared-road"));
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", source: run.primary.job!.facts, text: prose, origin: "model",
      momentSelection: { choice: "milestone", kind: "farewell-remembrance", origin: "focus" },
      direction: { stage: "orrery", origin: "model" }, remembrance: null, firstVictory: null, duet: null });
    expect(Object.isFrozen(run.controller.snapshot.momentSelection)).toBe(true);
    expect(JSON.stringify(run.model.write.mock.calls)).not.toContain("Neris");
    expect(JSON.stringify(run.model.write.mock.calls)).not.toContain("Copper Hollow");
  });

  it("uses the captured first-victory companion focus even though the current view is solo", async () => {
    const run = setup("victory");
    await run.activate();
    expect(run.controller.snapshot.focus).toBe("inner-life");
    run.controller.write(() => true, run.current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.model.direct).toHaveBeenCalledExactlyOnceWith(
      buildCreativeDirectionMessages(run.primary.job!, run.primary.viewpoint!, "shared-road"));
    expect(run.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(run.primary, "shared-road"));
    expect(run.controller.snapshot).toMatchObject({ text: prose, origin: "model", firstVictory: run.primary.firstVictory,
      momentSelection: { choice: "milestone", kind: "first-shared-victory", origin: "focus" }, duet: null });
  });

  it.each(["inner-life", "scene"] as const)("retains model subject selection for %s", async (focus) => {
    const run = setup();
    await run.activate();
    run.controller.write(() => true, run.current, focus);
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).toHaveBeenCalledExactlyOnceWith(buildCreativeMomentMessages(run.current.job, run.primary.job!));
    expect(run.model.direct).toHaveBeenCalledExactlyOnceWith(buildCreativeDirectionMessages(run.current.job, run.current.viewpoint!, focus));
    expect(run.model.write).toHaveBeenCalledExactlyOnceWith(expectedProse(run.current, focus));
    expect(run.controller.snapshot).toMatchObject({ source: run.current.job.facts, momentSelection: { choice: "current", origin: "model" } });
  });

  it.each(["missing", "foreign-packet", "mismatched-event", "mismatched-headline", "non-earlier-oath"] as const)(
    "cannot claim focused priority for a %s farewell packet", async (invalid) => {
      const run = setup();
      const memory = run.primary.remembrance!;
      const primary: Source = { ...run.primary };
      delete primary.remembrance;
      if (invalid !== "missing") primary.remembrance = {
        ...memory,
        ...(invalid === "foreign-packet" ? { campaignId: "another-campaign" } : {}),
        ...(invalid === "mismatched-event" ? { eventId: "another-event" } : {}),
        ...(invalid === "mismatched-headline" ? { farewell: { ...memory.farewell, headline: "Another farewell." } } : {}),
        ...(invalid === "non-earlier-oath" ? { oath: { ...memory.oath, tick: memory.tick } } : {}),
      };
      await run.activate(primary);
      run.controller.write(() => true, run.current, "shared-road");
      await run.controller.waitForWriteSettlement();
      expect(run.model.chooseMoment).not.toHaveBeenCalled();
      expect(run.model.direct).toHaveBeenCalledOnce();
      expect(run.model.write).toHaveBeenCalledOnce();
      expect(run.controller.snapshot).toMatchObject({ momentSelection: null, remembrance: null });
    },
  );

  it.each(["foreign-current", "same-tick", "missing-current"] as const)("does not claim a competition with %s", async (invalid) => {
    const run = setup();
    const current = invalid === "missing-current" ? undefined : { ...run.current, job: { ...run.current.job,
      ...(invalid === "foreign-current" ? { campaignId: "another-campaign" } : { tick: run.primary.job!.tick }),
    } };
    await run.activate();
    run.controller.write(() => true, current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.model.direct).toHaveBeenCalledOnce();
    expect(run.model.write).toHaveBeenCalledOnce();
    expect(run.controller.snapshot.momentSelection).toBeNull();
  });

  it("allows authored duet recovery without relabelling the player priority as model selection", async () => {
    const run = setup("victory");
    run.model.write.mockResolvedValueOnce(rejected);
    await run.activate();
    run.controller.write(() => true, run.current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.controller.snapshot).toMatchObject({ origin: "authored", firstVictory: run.primary.firstVictory,
      momentSelection: { choice: "milestone", kind: "first-shared-victory", origin: "focus" },
      duet: { hero: { name: "Mira" }, companion: { name: "Tamsin" } } });
  });

  it("keeps quiet recovery quiet after prioritizing a completed rejected draft", async () => {
    const run = setup("victory", () => false);
    run.model.write.mockResolvedValueOnce(rejected);
    await run.activate();
    run.controller.write(() => true, run.current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, duet: null, firstVictory: null });
  });

  it("clears priority provenance on the next ordinary story", async () => {
    const run = setup();
    await run.activate();
    run.controller.write(() => true, run.current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot.momentSelection?.origin).toBe("focus");
    run.controller.sync({ ...run.current, eligible: true });
    expect(run.controller.snapshot.momentSelection).toBeNull();
    run.controller.write();
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ origin: "model", source: run.current.job.facts, momentSelection: null });
  });

  it("cancels before priority is installed without starting any model operation", async () => {
    const run = setup();
    await run.activate();
    run.controller.write(() => false, run.current, "shared-road");
    await run.controller.waitForWriteSettlement();
    expect(run.model.chooseMoment).not.toHaveBeenCalled();
    expect(run.model.direct).not.toHaveBeenCalled();
    expect(run.model.write).not.toHaveBeenCalled();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", busy: false, text: null, momentSelection: null });
  });

  it("No LLM during staging settles immediately and cannot start late prose or recovery", async () => {
    const run = setup("victory");
    const pending = deferred<string | null>();
    run.model.direct.mockImplementationOnce(() => pending.promise);
    await run.activate();
    run.controller.write(() => true, run.current, "shared-road");
    await flush();
    expect(run.model.direct).toHaveBeenCalledOnce();
    run.controller.stop();
    await run.controller.waitForWriteSettlement();
    pending.resolve("2");
    await flush();
    expect(run.model.write).not.toHaveBeenCalled();
    expect(run.controller.snapshot).toMatchObject({ phase: "off", busy: false, text: null, origin: null,
      duet: null, firstVictory: null, momentSelection: null, direction: defaultNarrativeDirection });
  });

  it("drops a late completed draft when its captured request is invalidated", async () => {
    const run = setup("victory");
    const pending = deferred<string>();
    let valid = true;
    run.model.write.mockImplementationOnce(() => pending.promise);
    await run.activate();
    run.controller.write(() => valid, run.current, "shared-road");
    await flush();
    expect(run.model.write).toHaveBeenCalledOnce();
    valid = false;
    pending.resolve(rejected);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", busy: false, text: null, origin: null,
      duet: null, firstVictory: null, momentSelection: null, direction: defaultNarrativeDirection });
  });
});
