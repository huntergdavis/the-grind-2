import { describe, expect, it } from "vitest";
import type { CreativeStoryViewpoint } from "./creative-story";
import type { StoryBeatJobV1 } from "./story-beat";
import { bindRecordedFarewell, captureRecordedFarewell, type RecordedFarewell } from "./recorded-farewell";

function fixture(condition: RecordedFarewell["condition"] = "healthy") {
  const facts: StoryBeatJobV1["facts"] = { schemaVersion: 1, kind: "public-story-beat", location: "Greyford",
    headline: "Rowan's Shared Road Oath is complete.",
    action: `Rowan departs ${condition === "healthy" ? "in good health" : "wounded but alive"} after 2 shared victories.`,
    consequence: `Rowan reaches Greyford ${condition === "healthy" ? "safely" : "wounded but alive"}; 2 shared victories, bond 3. The companions exchange farewells.` };
  const job: StoryBeatJobV1 = { schemaVersion: 1, task: "author-story-beat", disposition: "manual-ephemeral-noncanonical",
    campaignId: "recorded-campaign", eventId: "recorded-event", tick: 12, sourceFingerprint: "0123456789abcdef",
    facts, deterministicFallback: facts.headline, maximumInputTokens: 320, maximumOutputTokens: 48 };
  const packet: RecordedFarewell = { kind: "recorded-farewell", campaignId: job.campaignId,
    eventId: job.eventId, tick: job.tick, heroName: "Mara", companionName: "Rowan", condition, facts: { ...facts } };
  const viewpoint: CreativeStoryViewpoint = { hero: { name: "Mara", values: ["loyalty"] }, companion: null };
  return { job, packet, viewpoint };
}

describe("recorded farewell binding", () => {
  it.each(["healthy", "injured"] as const)("binds exact public %s departure facts without an oath record", (condition) => {
    const { job, packet, viewpoint } = fixture(condition);
    const before = structuredClone({ job, packet, viewpoint });
    const captured = bindRecordedFarewell(packet, job, viewpoint);
    expect(captured).toEqual(packet);
    expect(captured).not.toBe(packet);
    expect(captured?.facts).not.toBe(packet.facts);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured?.facts)).toBe(true);
    expect({ job, packet, viewpoint }).toEqual(before);
    expect(captured).not.toHaveProperty("oath");
  });

  it("captures only declared public fields and detaches nested facts from mutable callers", () => {
    const { packet } = fixture();
    const extra = { ...packet, companionId: "private-resident", health: 30,
      facts: { ...packet.facts, privateField: "private-value" } };
    const captured = captureRecordedFarewell(extra);
    extra.companionName = "Changed";
    extra.facts.headline = "Changed";
    expect(captured).toEqual(packet);
    expect(JSON.stringify(captured)).not.toContain("private");
    expect(Object.keys(captured).sort()).toEqual(["kind", "campaignId", "eventId", "tick", "heroName", "companionName", "condition", "facts"].sort());
  });

  it.each(["campaignId", "eventId", "tick", "heroName", "companionName", "condition", "location", "headline", "action", "consequence"] as const)(
    "rejects a packet with mismatched %s instead of enriching the wrong source", (field) => {
      const { packet, job, viewpoint } = fixture();
      const value = structuredClone(packet) as unknown as Record<string, unknown>;
      if (["location", "headline", "action", "consequence"].includes(field)) {
        (value.facts as Record<string, unknown>)[field] = "Different source";
      } else value[field] = field === "tick" ? 13 : field === "condition" ? "injured" : "Different source";
      expect(bindRecordedFarewell(value as unknown as RecordedFarewell, job, viewpoint)).toBeNull();
    },
  );

  it("requires a solo matching hero and safe bounded names and source identities", () => {
    const { packet, job, viewpoint } = fixture();
    expect(bindRecordedFarewell(undefined, job, viewpoint)).toBeNull();
    expect(bindRecordedFarewell(null, job, viewpoint)).toBeNull();
    expect(bindRecordedFarewell(packet, null, viewpoint)).toBeNull();
    expect(bindRecordedFarewell(packet, job, null)).toBeNull();
    expect(bindRecordedFarewell(packet, job, undefined)).toBeNull();
    const active: CreativeStoryViewpoint = { ...viewpoint, companion: { name: "Rowan", role: "miller",
      purpose: "shared-road-oath", status: "arrived", victories: 2 } };
    expect(bindRecordedFarewell(packet, job, active)).toBeNull();
    for (const name of ["", " Rowan", "Rowan ", "x".repeat(129), "<Rowan>", "Ro\u202Ewan", "Ro\uD800wan"]) {
      expect(bindRecordedFarewell({ ...packet, companionName: name }, job, viewpoint), name).toBeNull();
    }
    for (const tick of [-1, 0.5, NaN, Infinity]) {
      expect(bindRecordedFarewell({ ...packet, tick }, { ...job, tick }, viewpoint)).toBeNull();
    }
    expect(bindRecordedFarewell({} as RecordedFarewell, job, viewpoint)).toBeNull();
  });

  it("requires canonical headline/action syntax and injury-consistent action even when both fact copies agree", () => {
    const { packet, job, viewpoint } = fixture();
    for (const change of [{ headline: "An unrelated farewell." }, { action: "Rowan departs wounded but alive after 2 shared victories." },
      { action: "Rowan departs in good health after 1 shared victories." },
      { action: "Rowan departs in good health after 02 shared victories." },
      { action: "Rowan departs in good health after 9007199254740992 shared victories." },
      { action: "Rowan departs in good health after 2 shared victories. They promise to reunite." }]) {
      const facts = { ...packet.facts, ...change };
      expect(bindRecordedFarewell({ ...packet, facts }, { ...job, facts }, viewpoint)).toBeNull();
    }
    for (const victories of [0, 1]) {
      const facts = { ...packet.facts, action: `Rowan departs in good health after ${victories} shared ${victories === 1 ? "victory" : "victories"}.` };
      expect(bindRecordedFarewell({ ...packet, facts }, { ...job, facts }, viewpoint)).not.toBeNull();
    }
  });
});
