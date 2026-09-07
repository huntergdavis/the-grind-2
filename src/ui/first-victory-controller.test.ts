import { describe, expect, it, vi } from "vitest";
import { buildCreativeMomentMessages } from "../narrator/creative-moment";
import type { CreativeStoryViewpoint } from "../narrator/creative-story";
import type { CreativeWriterMessage } from "../narrator/creative-writer-client";
import type { FirstSharedVictory } from "../narrator/first-shared-victory";
import type { StoryBeatJobV1 } from "../narrator/story-beat";
import { createCreativeStoryController } from "./creative-story-controller";
import { storyDuetText } from "../narrator/story-duet";

const prose = "Relief sat uneasily on her shoulders, a borrowed coat against the uncertainty ahead. She let it stay a little longer.";
const rejected = "<p>Rejected model draft.</p>";

// Public synthetic fixtures; ui/first-shared-victory.test.ts proves the real simulation transition.
function fixture(injured = false) {
  const job: StoryBeatJobV1 = {
    schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
    campaignId: "private-campaign", eventId: "private-first-victory", tick: 12, sourceFingerprint: "0123456789abcdef",
    facts: { schemaVersion: 1, kind: "public-story-beat", location: "Amber Crossing",
      headline: "Mira and Tamsin win their first fight.", action: "The roadside bandit was defeated.",
      consequence: injured ? "Tamsin is alive and injured after the victory." : "Tamsin is uninjured after the victory." },
    deterministicFallback: "The battle ended.", maximumInputTokens: 320, maximumOutputTokens: 48,
  };
  const viewpoint: CreativeStoryViewpoint = {
    hero: { name: "Mira", values: ["curiosity", "loyalty"] },
    companion: { name: "Tamsin", role: "miller", status: injured ? "injured" : "travelling", purpose: "shared-road-oath", victories: 1 },
  };
  const packet = {
    kind: "first-shared-victory", campaignId: job.campaignId, eventId: job.eventId, tick: job.tick,
    combatId: "private-combat", heroName: "Mira", companionName: "Tamsin", companionId: "private-resident",
    condition: injured ? "injured" : "healthy", battle: { location: job.facts.location, headline: job.facts.headline, tick: job.tick },
  } satisfies FirstSharedVictory;
  const current = { job: { ...job, eventId: "private-current", tick: 13,
    facts: { ...job.facts, headline: "The road bends toward Greyford.", action: "Mira follows the road.", consequence: "The route advanced." } },
  mode: "travel" as const, viewpoint };
  return { job, viewpoint, packet, current };
}

function setup(injured = false, allowVignette = () => true) {
  const source = fixture(injured);
  const writer = {
    ready: false,
    load: vi.fn(async (_progress: (message: string) => void) => { writer.ready = true; }),
    chooseMoment: vi.fn(async (_messages: readonly CreativeWriterMessage[]): Promise<"1" | "2" | null> => "2"),
    direct: vi.fn(async (_messages: readonly CreativeWriterMessage[]): Promise<string | null> => "2"),
    write: vi.fn(async (_messages: readonly CreativeWriterMessage[]) => prose),
    dispose: vi.fn(() => { writer.ready = false; }),
  };
  const deps = { createWriter: vi.fn(() => writer), hasCachedModel: vi.fn(async () => true),
    removeCachedModel: vi.fn(async () => undefined), allowVignette, onChange: vi.fn() };
  const controller = createCreativeStoryController(deps);
  const sync = (packet: FirstSharedVictory | null = source.packet) => controller.sync({
    job: source.job, mode: "battle", eligible: true, viewpoint: source.viewpoint,
    ...(packet === null ? {} : { firstVictory: packet }),
  });
  sync();
  return { ...source, controller, writer, deps, sync };
}

describe("first-victory controller source and recovery boundaries", () => {
  it("keeps accepted Shared road model prose ordinary with byte-identical prompts, never relabelling it as a duet", async () => {
    const victory = setup();
    const ordinary = setup();
    ordinary.sync(null);
    for (const run of [victory, ordinary]) {
      run.controller.setFocus("shared-road");
      await run.controller.load();
      run.controller.write();
      await run.controller.waitForWriteSettlement();
      expect(run.controller.snapshot).toMatchObject({ text: prose, origin: "model", duet: null });
    }
    expect(victory.writer.write.mock.calls).toEqual(ordinary.writer.write.mock.calls);
    expect(victory.writer.direct.mock.calls).toEqual(ordinary.writer.direct.mock.calls);
    victory.writer.write.mockResolvedValueOnce(rejected);
    victory.controller.write();
    await victory.controller.waitForWriteSettlement();
    expect(victory.controller.snapshot.duet).not.toBeNull();
    victory.writer.write.mockResolvedValueOnce("Hope rested lightly on her shoulders, an unfamiliar warmth against the evening chill. She did not hurry it away.");
    victory.controller.write();
    expect(victory.controller.snapshot.duet).toBeNull();
    await victory.controller.waitForWriteSettlement();
    expect(victory.controller.snapshot).toMatchObject({ origin: "model", duet: null });
  });

  it.each([false, true])("recovers a shared-road duet with captured names and injury=%s", async (injured) => {
    const run = setup(injured);
    expect(run.controller.setFocus("shared-road")).toBe(true);
    run.writer.write.mockResolvedValueOnce(rejected);
    await run.controller.load();
    run.controller.write();
    await run.controller.waitForWriteSettlement();
    const snapshot = run.controller.snapshot;
    expect(snapshot).toMatchObject({ phase: "ready", origin: "authored", seedTheme: "Authored shared-road duet",
      seedTone: injured ? "care" : "trust", firstVictory: run.packet,
      duet: { kind: "inner-voices", hero: { name: "Mira" }, companion: { name: "Tamsin" } } });
    expect(snapshot.text).toBe(storyDuetText(snapshot.duet!));
    expect([snapshot.duet, snapshot.duet!.hero, snapshot.duet!.companion].every(Object.isFrozen)).toBe(true);
    expect(snapshot.duet!.hero.text).not.toBe(snapshot.duet!.companion.text);
    run.controller.setFocus("inner-life");
    expect(run.controller.snapshot).toMatchObject({ text: null, origin: null, duet: null });
  });

  it.each(["current", "no-packet", "inner-life", "quiet", "scene"] as const)("does not attach paired voices for %s", async (reason) => {
    const run = setup(false, () => reason !== "quiet");
    if (reason === "no-packet") run.sync(null);
    // Inner life keeps model subject selection; Shared road now explicitly prioritizes the captured victory.
    if (reason !== "inner-life" && reason !== "current") run.controller.setFocus(reason === "scene" ? "scene" : "shared-road");
    if (reason === "current") run.writer.chooseMoment.mockResolvedValueOnce("1");
    run.writer.write.mockResolvedValueOnce(rejected);
    await run.controller.load();
    run.controller.write(() => true, reason === "current" ? run.current : undefined);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot.duet).toBeNull();
    expect(run.controller.snapshot.seedTheme).not.toBe("Authored shared-road duet");
  });

  it("discards a late duet recovery when the captured request is invalidated", async () => {
    const run = setup();
    run.controller.setFocus("shared-road");
    let resolve!: (text: string) => void;
    let valid = true;
    run.writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await run.controller.load();
    run.controller.write(() => valid);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    valid = false;
    resolve(rejected);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", duet: null, text: null, firstVictory: null });
    run.controller.stop();
    expect(run.controller.snapshot).toMatchObject({ phase: "off", duet: null });
  });

  it.each(["quiet", "scene", "revoked"] as const)("does not publish recovery when %s", async (mode) => {
    let allowed = mode !== "quiet";
    const run = setup(false, () => allowed);
    if (mode === "scene") run.controller.setFocus("scene");
    run.writer.write.mockResolvedValueOnce(rejected);
    await run.controller.load();
    run.controller.write();
    if (mode === "revoked") allowed = false;
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, firstVictory: null });
  });

  it("cancels during source selection without starting direction, prose, or recovery", async () => {
    const run = setup();
    let resolve!: (choice: "1" | "2" | null) => void;
    run.writer.chooseMoment.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await run.controller.load();
    run.controller.write(() => true, run.current);
    await Promise.resolve();
    const settlement = run.controller.waitForWriteSettlement();
    run.controller.stop();
    await settlement;
    resolve("2");
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(run.writer.direct).not.toHaveBeenCalled();
    expect(run.writer.write).not.toHaveBeenCalled();
    expect(run.controller.snapshot).toMatchObject({ phase: "off", text: null, origin: null, firstVictory: null, momentSelection: null });
  });

  it("discards a completed late draft when the director invalidates its request", async () => {
    let current = true;
    const run = setup();
    let resolve!: (text: string) => void;
    run.writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await run.controller.load();
    run.controller.write(() => current, run.current);
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    current = false;
    resolve(rejected);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", text: null, origin: null, firstVictory: null, momentSelection: null });
  });

  it.each(["moment", "direction", "prose"] as const)("never turns a fatal %s error into authored victory prose", async (phase) => {
    const run = setup();
    const fail = async (): Promise<never> => { run.writer.ready = false; throw new Error("Finite worker operation failed"); };
    if (phase === "moment") run.writer.chooseMoment.mockImplementationOnce(fail);
    if (phase === "direction") run.writer.direct.mockImplementationOnce(fail);
    if (phase === "prose") run.writer.write.mockImplementationOnce(fail);
    await run.controller.load();
    run.controller.write(() => true, run.current);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ phase: "failed", text: null, origin: null, firstVictory: null, momentSelection: null, busy: false });
    if (phase !== "prose") expect(run.writer.write).not.toHaveBeenCalled();
  });

  it.each([prose, rejected])("drops the victory packet when the model selects the current scene: %s", async (output) => {
    const run = setup();
    run.writer.chooseMoment.mockResolvedValueOnce("1");
    run.writer.write.mockResolvedValueOnce(output);
    await run.controller.load();
    run.controller.write(() => true, run.current);
    await run.controller.waitForWriteSettlement();
    expect(run.writer.chooseMoment).toHaveBeenCalledExactlyOnceWith(
      buildCreativeMomentMessages(run.current.job, run.job, "first-shared-victory"),
    );
    expect(run.controller.snapshot).toMatchObject({ phase: "ready", firstVictory: null, remembrance: null,
      source: run.current.job.facts, momentSelection: { choice: "current", origin: "model" } });
    expect(run.controller.snapshot.seedTheme).not.toBe("Authored first shared victory");
    expect(JSON.stringify(run.writer.direct.mock.calls)).toContain(run.current.job.facts.headline);
    expect(JSON.stringify(run.writer.write.mock.calls)).not.toContain(run.job.facts.headline);
    expect(run.deps.createWriter).toHaveBeenCalledOnce();
  });

  it.each(["2", null] as const)("attributes selected first victory as model/default independently of prose: %s", async (choice) => {
    const run = setup();
    run.writer.chooseMoment.mockResolvedValueOnce(choice);
    run.writer.write.mockResolvedValueOnce(rejected);
    await run.controller.load();
    run.controller.write(() => true, run.current);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot).toMatchObject({ origin: "authored", firstVictory: run.packet,
      source: run.job.facts, momentSelection: { choice: "milestone", kind: "first-shared-victory",
        origin: choice === "2" ? "model" : "default" } });
    expect(run.writer.direct).toHaveBeenCalledOnce();
    expect(run.writer.write).toHaveBeenCalledOnce();
  });

  it("captures the packet before awaiting and never reads later caller mutations", async () => {
    const run = setup(true);
    const before = structuredClone(run.packet);
    let resolve!: (text: string) => void;
    run.writer.write.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await run.controller.load();
    run.controller.write();
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    run.packet.heroName = "Changed hero";
    run.packet.companionName = "Changed companion";
    run.packet.battle.headline = "Changed event";
    resolve(rejected);
    await run.controller.waitForWriteSettlement();
    expect(run.controller.snapshot.firstVictory).toEqual(before);
    expect(run.controller.snapshot.text).toContain(before.heroName);
    expect(run.controller.snapshot.text).toContain(before.companionName);
    expect(run.controller.snapshot.text).not.toContain("Changed");
  });

  it.each([false, true])("recovers a bound rejected draft with captured names and injury=%s", async (injured) => {
    const { controller, writer, packet } = setup(injured);
    writer.write.mockResolvedValueOnce(rejected);
    await controller.load();
    expect(controller.snapshot.firstVictory).toBeNull();
    expect(controller.write()).toBe(true);
    expect(controller.snapshot.firstVictory).toBeNull();
    await controller.waitForWriteSettlement();
    expect(controller.snapshot).toMatchObject({ phase: "ready", origin: "authored", firstVictory: packet,
      seedTheme: "Authored first shared victory", seedTone: injured ? "care" : "trust", remembrance: null });
    expect(controller.snapshot.text).toContain("Mira");
    expect(controller.snapshot.text).toContain("Tamsin");
    if (injured) expect(controller.snapshot.text).toMatch(/injur/);
    expect(Object.isFrozen(controller.snapshot.firstVictory)).toBe(true);
    expect(Object.isFrozen(controller.snapshot.firstVictory!.battle)).toBe(true);
    expect(writer.chooseMoment).not.toHaveBeenCalled();
  });

  it("keeps accepted model and stage prompts byte-identical with or without the host packet", async () => {
    const bound = setup();
    const ordinary = setup();
    ordinary.sync(null);
    for (const run of [bound, ordinary]) {
      await run.controller.load();
      run.controller.write();
      await run.controller.waitForWriteSettlement();
    }
    expect(bound.writer.write.mock.calls).toEqual(ordinary.writer.write.mock.calls);
    expect(bound.writer.direct.mock.calls).toEqual(ordinary.writer.direct.mock.calls);
    expect(JSON.stringify(bound.writer.write.mock.calls)).not.toMatch(/private-campaign|private-first-victory|private-combat|private-resident/);
    expect(bound.controller.snapshot).toMatchObject({ text: prose, origin: "model", firstVictory: bound.packet });
    expect(ordinary.controller.snapshot.firstVictory).toBeNull();
  });

  it.each(["campaign", "event", "tick", "battle-tick", "location", "headline", "hero", "companion", "condition", "victories", "absent-companion"] as const)(
    "uses ordinary recovery for mismatched %s binding", async (wrong) => {
      const run = setup();
      if (wrong === "campaign") run.packet.campaignId = "wrong-campaign";
      if (wrong === "event") run.packet.eventId = "wrong-event";
      if (wrong === "tick") run.packet.tick += 1;
      if (wrong === "battle-tick") run.packet.battle.tick += 1;
      if (wrong === "location") run.packet.battle.location = "Wrong place";
      if (wrong === "headline") run.packet.battle.headline = "Wrong battle";
      if (wrong === "hero") run.packet.heroName = "Another hero";
      if (wrong === "companion") run.packet.companionName = "Another companion";
      if (wrong === "condition") run.packet.condition = "injured";
      const viewpoint = wrong === "absent-companion" ? { ...run.viewpoint, companion: null }
        : wrong === "victories" ? { ...run.viewpoint, companion: { ...run.viewpoint.companion!, victories: 2 } } : run.viewpoint;
      run.controller.sync({ job: run.job, mode: "battle", eligible: true, viewpoint, firstVictory: run.packet });
      run.writer.write.mockResolvedValueOnce(rejected);
      await run.controller.load();
      run.controller.write();
      await run.controller.waitForWriteSettlement();
      expect(run.controller.snapshot).toMatchObject({ phase: "ready", origin: "authored", firstVictory: null,
        seedTheme: "Authored emotional interlude" });
      expect(run.writer.chooseMoment).not.toHaveBeenCalled();
    },
  );
});
