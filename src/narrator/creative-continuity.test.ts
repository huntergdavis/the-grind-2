import { describe, expect, it } from "vitest";
import { captureCreativeStoryMemory, type CreativeStoryMemory } from "./creative-continuity";
import type { StoryBeatJobV1 } from "./story-beat";

const job: StoryBeatJobV1 = {
  schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
  campaignId: "campaign:one", eventId: "event:current", tick: 10, sourceFingerprint: "current",
  facts: { schemaVersion: 1, kind: "public-story-beat", location: "Greyford", headline: "Arrival.",
    action: "The journey reaches Greyford.", consequence: "Rowan remains injured and alive." },
  deterministicFallback: "The journey reaches Greyford.", maximumInputTokens: 320, maximumOutputTokens: 48,
};
const memory: CreativeStoryMemory = {
  campaignId: job.campaignId, sourceEventId: "event:earlier", sourceTick: 4,
  text: "Mara wondered whether hope could quiet her worry.",
};

describe("captured creative continuity source scenes", () => {
  it("preserves old prose without requiring source-scene metadata", () => {
    expect(captureCreativeStoryMemory(job, [memory])).toEqual([memory]);
    expect(captureCreativeStoryMemory(job, [memory])[0]).not.toHaveProperty("scene");
  });

  it("captures bounded labels, discards extra fields and deeply freezes detached output", () => {
    const scene = { location: "Oldford", headline: "The road towards Greyford.", privateField: "not forwarded" };
    const source = { ...memory, scene };
    const result = captureCreativeStoryMemory(job, [source]);
    expect(result).toEqual([{ ...memory, scene: { location: "Oldford", headline: "The road towards Greyford." } }]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]?.scene)).toBe(true);
    expect(result[0]).not.toBe(source);
    expect(result[0]?.scene).not.toBe(scene);
    scene.location = "Changed";
    scene.headline = "Changed";
    expect(result[0]?.scene).toEqual({ location: "Oldford", headline: "The road towards Greyford." });
  });

  it("accepts exact character bounds without truncating the original labels", () => {
    const scene = { location: "x".repeat(120), headline: "y".repeat(160) };
    expect(captureCreativeStoryMemory(job, [{ ...memory, scene }])[0]?.scene).toEqual(scene);
  });

  it.each([
    null, false, "Oldford", [], {}, { location: "Oldford" }, { headline: "The road." },
    { location: "x".repeat(121), headline: "The road." },
    { location: "Oldford", headline: "x".repeat(161) },
    { location: "<Oldford>", headline: "The road." },
    { location: "Oldford", headline: "The\nroad." },
    { location: "Old\u202Eford", headline: "The road." },
    { location: "Oldford", headline: "The\uD800road." },
    { location: "", headline: "The road." }, { location: "Oldford", headline: " " },
    { location: " Oldford", headline: "The road." },
  ])("omits malformed scene metadata but preserves eligible prose: %j", (scene) => {
    const source = { ...memory, scene } as unknown as CreativeStoryMemory;
    expect(captureCreativeStoryMemory(job, [source])).toEqual([memory]);
  });

  it("does not let valid labels bypass campaign, current-event or future-tick boundaries", () => {
    const scene = { location: "Oldford", headline: "The road." };
    expect(captureCreativeStoryMemory(job, [
      { ...memory, scene, campaignId: "campaign:other" },
      { ...memory, scene, sourceEventId: job.eventId },
      { ...memory, scene, sourceTick: job.tick },
      { ...memory, scene, sourceTick: job.tick + 1 },
    ])).toEqual([]);
  });
});
