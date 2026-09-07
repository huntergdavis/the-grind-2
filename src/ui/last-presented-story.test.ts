import { describe, expect, it } from "vitest";
import type { HeldNarrative } from "./creative-story-director";
import { createLastPresentedStory } from "./last-presented-story";
import { narrativeIntermissionRecordedMoments } from "./narrative-intermission";
import { storyDuetText, type StoryDuet } from "../narrator/story-duet";

const story: HeldNarrative = {
  text: "Mara found relief and worry difficult to tell apart. Rowan was leaving alive.",
  location: "Amber Crossing",
  headline: "Rowan leaves the road wounded but alive.",
  campaignId: "campaign:one",
  sourceEventId: "event:19",
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
  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("captures the %s farewell attribution without recomputing it on replay", (value) => {
    const memory = createLastPresentedStory(story.campaignId);
    const voiceInspiration = { kind: "hero-value" as const, heroName: "Mara", value, text: story.text };
    const passage = { ...rememberedStory(), voiceInspiration };
    memory.remember(passage);
    voiceInspiration.heroName = "Changed";
    const captured = memory.get(story.campaignId);
    expect(captured?.voiceInspiration).toEqual({ kind: "hero-value", heroName: "Mara", value, text: story.text });
    expect(Object.isFrozen(captured?.voiceInspiration)).toBe(true);
    expect(memory.get(story.campaignId)).toBe(captured);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("voiceInspiration");
    memory.remember(passage);
    memory.syncCampaign("new-campaign");
    expect(memory.get(story.campaignId)).toBeNull();
  });

  it.each(["model", "text", "hero", "missing-memory", "value", "duet"])("omits unsupported farewell attribution: %s", (wrong) => {
    const memory = createLastPresentedStory(story.campaignId);
    const passage: HeldNarrative = { ...(wrong === "missing-memory" ? story : rememberedStory()),
      origin: wrong === "model" ? "model" : "authored",
      voiceInspiration: { kind: "hero-value", heroName: wrong === "hero" ? "Another hero" : "Mara",
        value: "loyalty", text: wrong === "text" ? "Different text." : story.text },
      ...(wrong !== "duet" ? {} : { duet: { kind: "inner-voices", hero: { name: "Mara", text: "I worry." },
        companion: { name: "Rowan", text: "I hope." } } as StoryDuet }),
    };
    if (wrong === "value") (passage.voiceInspiration as { value: string }).value = "invented";
    memory.remember(passage);
    expect(memory.get(story.campaignId)).not.toHaveProperty("voiceInspiration");
  });

  it.each(["curiosity", "loyalty", "mercy", "courage"] as const)("freezes the %s hero-voice attribution for replay and drops it on replacement", (voiceValue) => {
    const memory = createLastPresentedStory(story.campaignId);
    const duet: StoryDuet = { kind: "inner-voices", hero: { name: "Mara", text: "I want this relief to last.", voiceValue },
      companion: { name: "Rowan", text: "I hope I can trust this small beginning." } };
    memory.remember({ ...story, text: storyDuetText(duet), duet });
    (duet.hero as { voiceValue: string }).voiceValue = "invented";
    expect(memory.get(story.campaignId)?.duet?.hero.voiceValue).toBe(voiceValue);
    expect(Object.isFrozen(memory.get(story.campaignId)?.duet?.hero)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("duet");
  });

  it.each(["authored", "model"] as const)("deeply captures both %s voices for replay and clears them on replacement", (origin) => {
    const memory = createLastPresentedStory(story.campaignId);
    const duet: StoryDuet = { kind: "inner-voices", hero: { name: "Mara", text: "I want this relief to last." },
      companion: { name: "Rowan", text: "I hope I can trust this small beginning." } };
    const passage = { ...story, origin, text: storyDuetText(duet), duet };
    const expected = structuredClone(passage);
    memory.remember(passage);
    (duet.hero as { name: string }).name = "Changed";
    (duet.companion as { text: string }).text = "Changed";
    const captured = memory.get(story.campaignId);
    expect(captured).toEqual(expected);
    expect([captured?.duet, captured?.duet?.hero, captured?.duet?.companion].every(Object.isFrozen)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("duet");
    memory.remember(passage);
    memory.syncCampaign("another-campaign");
    expect(memory.get(story.campaignId)).toBeNull();
  });

  it.each(["authored", "model"] as const)("preserves verified first-victory context with %s prose and drops it on replacement", (origin) => {
    const memory = createLastPresentedStory(story.campaignId);
    const passage: HeldNarrative = { ...story, origin, firstVictory: {
      kind: "first-shared-victory", campaignId: story.campaignId, eventId: "victory-19", tick: 19,
      combatId: "combat:one", heroName: "Mara", companionName: "Rowan", companionId: "resident:rowan", condition: "injured",
      battle: { location: story.location, headline: "A first shared battle ends in victory.", tick: 19 },
    }, momentSelection: { choice: "milestone", kind: "first-shared-victory", origin: "model" } };
    const expected = structuredClone(passage);
    expect(memory.remember(passage)).toBe(true);
    (passage.firstVictory as { companionName: string }).companionName = "Changed";
    (passage.firstVictory!.battle as { headline: string }).headline = "Changed";
    expect(memory.get(story.campaignId)).toEqual(expected);
    expect(Object.isFrozen(memory.get(story.campaignId)?.firstVictory)).toBe(true);
    expect(Object.isFrozen(memory.get(story.campaignId)?.firstVictory?.battle)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("firstVictory");
    expect(memory.get(story.campaignId)).not.toHaveProperty("momentSelection");
  });

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

  it("preserves the chosen source event identity without consulting a newer current scene", () => {
    const memory = createLastPresentedStory(story.campaignId);
    const passage = { ...story, sourceEventId: "selected-earlier-event" };
    memory.remember(passage);
    passage.sourceEventId = "a-new-current-event";
    expect(memory.get(story.campaignId)?.sourceEventId).toBe("selected-earlier-event");
    memory.remember({ ...story, sourceEventId: "selected-new-event", sourceTick: 20 });
    expect(memory.get(story.campaignId)).toMatchObject({ sourceEventId: "selected-new-event", sourceTick: 20 });
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

  it.each(["model", "default", "focus"] as const)("preserves the exact %s-selected farewell metadata without rerunning selection", (origin) => {
    const memory = createLastPresentedStory(story.campaignId);
    const momentSelection = { choice: "milestone" as const, kind: "farewell-remembrance" as const, origin };
    memory.remember({ ...story, momentSelection });
    (momentSelection as { kind: string }).kind = "invented-milestone";
    expect(memory.get(story.campaignId)?.momentSelection).toEqual({ choice: "milestone", kind: "farewell-remembrance", origin });
    expect(Object.isFrozen(memory.get(story.campaignId)?.momentSelection)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("momentSelection");
  });

  it("retains first-victory focus priority without attributing it to the model", () => {
    const memory = createLastPresentedStory(story.campaignId);
    const momentSelection = { choice: "milestone" as const, kind: "first-shared-victory" as const, origin: "focus" as const };
    memory.remember({ ...story, momentSelection });
    (momentSelection as { origin: string }).origin = "model";
    expect(memory.get(story.campaignId)?.momentSelection).toEqual({ choice: "milestone", kind: "first-shared-victory", origin: "focus" });
    expect(Object.isFrozen(memory.get(story.campaignId)?.momentSelection)).toBe(true);
    memory.remember(story);
    expect(memory.get(story.campaignId)).not.toHaveProperty("momentSelection");
  });

  it("preserves current-scene model selection but drops malformed selection metadata", () => {
    const memory = createLastPresentedStory(story.campaignId);
    memory.remember({ ...story, momentSelection: { choice: "current", origin: "model" } });
    expect(memory.get(story.campaignId)?.momentSelection).toEqual({ choice: "current", origin: "model" });
    memory.remember({ ...story, momentSelection: { choice: "current", origin: "default" } });
    expect(memory.get(story.campaignId)).not.toHaveProperty("momentSelection");
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
