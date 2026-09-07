import { describe, expect, it } from "vitest";
import type { HeldNarrative } from "./creative-story-director";
import { createLastPresentedStory } from "./last-presented-story";
import { narrativeIntermissionRecordedMoments } from "./narrative-intermission";

const story: HeldNarrative = {
  text: "Mara found relief and worry difficult to tell apart. Rowan was leaving alive.",
  location: "Amber Crossing",
  headline: "Rowan leaves the road wounded but alive.",
  campaignId: "campaign:one",
  sourceTick: 19,
  readyAtMs: 2_000,
  inspirationTone: "care",
  origin: "authored",
};

function rememberedStory(): HeldNarrative {
  return { ...story, remembrance: {
    kind: "farewell-remembrance", campaignId: story.campaignId, eventId: "farewell-19", tick: 19,
    heroName: "Mara", companionName: "Rowan",
    oath: { location: "Hollowwatch", headline: "Rowan joins the shared road.", tick: 1 },
    farewell: { location: story.location, headline: story.headline, tick: 19 },
  } };
}

describe("last actually presented story", () => {
  it("starts empty, without inventing a passage or restoring an archive", () => {
    expect(createLastPresentedStory(story.campaignId).get(story.campaignId)).toBeNull();
  });

  it.each(["authored", "model"] as const)("retains the exact %s interpretation, source, tone and original capture times", (origin) => {
    const memory = createLastPresentedStory(story.campaignId);
    const passage = { ...story, origin };
    expect(memory.remember(passage)).toBe(true);
    expect(memory.get(story.campaignId)).toEqual(passage);
    expect(memory.get(story.campaignId)).not.toBe(passage);
    expect(Object.isFrozen(memory.get(story.campaignId))).toBe(true);
  });

  it("rereading does not consume or rewrite the captured story", () => {
    const memory = createLastPresentedStory(story.campaignId);
    memory.remember(story);
    const captured = memory.get(story.campaignId);
    for (let reads = 0; reads < 5; reads++) {
      memory.syncCampaign(story.campaignId);
      expect(memory.get(story.campaignId)).toBe(captured);
    }
  });

  it("freezes the model-selected stage for rereading and drops it when an older-shaped passage replaces it", () => {
    const memory = createLastPresentedStory(story.campaignId);
    const direction = { stage: "orrery" as const, origin: "model" as const };
    memory.remember({ ...story, direction });
    (direction as { stage: string }).stage = "moth-court";
    expect(memory.get(story.campaignId)?.direction).toEqual({ stage: "orrery", origin: "model" });
    expect(Object.isFrozen(memory.get(story.campaignId)?.direction)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("direction");
  });

  it("copies caller-owned text and deeply freezes both remembered public records", () => {
    const memory = createLastPresentedStory(story.campaignId);
    const passage = rememberedStory();
    memory.remember(passage);
    const before = structuredClone(passage);
    (passage as { text: string }).text = "A later invented story.";
    (passage.remembrance as { companionName: string }).companionName = "Someone else";
    (passage.remembrance!.oath as { headline: string }).headline = "A rewritten oath.";
    (passage.remembrance!.farewell as { location: string }).location = "Another town";
    const captured = memory.get(story.campaignId)!;
    expect(captured).toEqual(before);
    expect(Object.isFrozen(captured.remembrance)).toBe(true);
    expect(Object.isFrozen(captured.remembrance!.oath)).toBe(true);
    expect(Object.isFrozen(captured.remembrance!.farewell)).toBe(true);
    expect(narrativeIntermissionRecordedMoments(captured)).toEqual({
      summary: "Recorded moments",
      records: [
        { label: "Farewell · T19", location: "Amber Crossing", headline: story.headline },
        { label: "Earlier oath · T1", location: "Hollowwatch", headline: "Rowan joins the shared road." },
      ],
    });
  });

  it("replaces the one passage without carrying an old oath into a newer ordinary story", () => {
    const memory = createLastPresentedStory(story.campaignId);
    memory.remember(rememberedStory());
    const next = { ...story, text: "The rain gave Mara time to think.", origin: "model" as const, sourceTick: 25 };
    memory.remember(next);
    expect(memory.get(story.campaignId)).toEqual(next);
    expect(memory.get(story.campaignId)).not.toHaveProperty("remembrance");
    expect(narrativeIntermissionRecordedMoments(memory.get(story.campaignId)!)).toEqual({
      summary: "Recorded moment", records: [{ label: null, location: null, headline: story.headline }],
    });
  });

  it("rejects a late other-campaign story without replacing the current one", () => {
    const memory = createLastPresentedStory(story.campaignId);
    memory.remember(story);
    expect(memory.remember({ ...story, campaignId: "campaign:two" })).toBe(false);
    expect(memory.get("campaign:two")).toBeNull();
    expect(memory.get(story.campaignId)).toEqual(story);
  });

  it("clears on campaign adoption, rejects old results, and does not resurrect on switching back", () => {
    const memory = createLastPresentedStory(story.campaignId);
    memory.remember(story);
    memory.syncCampaign("campaign:two");
    expect(memory.get(story.campaignId)).toBeNull();
    expect(memory.get("campaign:two")).toBeNull();
    expect(memory.remember(story)).toBe(false);
    memory.remember({ ...story, campaignId: "campaign:two" });
    memory.syncCampaign(story.campaignId);
    expect(memory.get(story.campaignId)).toBeNull();
    expect(memory.get("campaign:two")).toBeNull();
  });

  it("a fresh page starts empty even when the campaign ID is the same", () => {
    const oldPage = createLastPresentedStory(story.campaignId);
    oldPage.remember(story);
    expect(createLastPresentedStory(story.campaignId).get(story.campaignId)).toBeNull();
    expect(oldPage.get(story.campaignId)).toEqual(story);
  });
});
