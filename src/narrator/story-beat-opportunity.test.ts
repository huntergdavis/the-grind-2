import { describe, expect, it, vi } from "vitest";

import type { ChronicleEntry, SceneState } from "../core/types";
import {
  isCommittedStoryBeatMechanicsV2,
  type CommittedStoryBeatMechanicsV2,
  type StoryBeatLensIdV2,
} from "./story-beat-mechanics-v2";
import {
  factualStoryBeatOpportunityLensPriority,
  factualStoryBeatOpportunityMaximumAgeTicks,
  isFactualStoryBeatOpportunityV1,
  projectFactualStoryBeatOpportunityV1,
  retainFactualStoryBeatOpportunityV1,
} from "./story-beat-opportunity";
import {
  projectFactualStoryBeatJobV2,
  type FactualStoryBeatJobV2,
} from "./story-beat-v2";
import { projectStoryBeatJobV1 } from "./story-beat";

const campaignId = "campaign:story-spark";

function job(
  lens: StoryBeatLensIdV2,
  tick: number,
  location = `Waystone ${tick}`,
): FactualStoryBeatJobV2 {
  const scene: SceneState = {
    mode: "travel",
    location,
    headline: "The marked road opens.",
    action: "Mira crosses the marked threshold.",
    goal: "Reach the western passage.",
    consequence: "The western passage is now reachable.",
    sensoryIntensity: 1,
  };
  const eventId = `${campaignId}:${tick}`;
  const source: ChronicleEntry = {
    ...scene,
    id: eventId,
    tick,
    attention: "backgroundSafe",
    consideredActions: ["cross the marked threshold"],
    chosenAction: "cross the marked threshold",
    rationale: "The route remains exact.",
    commandId: `${campaignId}:travel:${tick}`,
    commandType: "travel",
    consideredCommandIds: [`${campaignId}:travel:${tick}`],
    policy: {
      attention: "backgroundSafe",
      reversible: true,
      maximumFidelityAffected: "ephemeral",
      thresholdBehavior: "continue",
      maximumCreditedDurationTicks: 1,
      aggregation: "none",
      queuedFallback: "The road waits.",
    },
  };
  const narrative = projectStoryBeatJobV1(campaignId, scene, source, eventId);
  if (narrative === null) throw new Error("Story Spark narrative fixture did not project");
  const cost = {
    kind: "cost" as const,
    metric: "hero-health" as const,
    direction: "decrease" as const,
    before: 20,
    after: 17,
    amount: 3,
  };
  const consequence = {
    kind: "consequence" as const,
    metric: "hero-experience" as const,
    direction: "increase" as const,
    before: 4,
    after: 7,
    amount: 3,
  };
  const mechanics: CommittedStoryBeatMechanicsV2 = {
    schemaVersion: 2,
    kind: "committed-story-beat-mechanics",
    campaignId,
    eventId,
    tick,
    commandId: `${campaignId}:travel:${tick}`,
    commandType: "travel",
    sourceFingerprint: tick.toString(16).padStart(16, "0"),
    facts: {
      schemaVersion: 2,
      kind: "public-story-beat-mechanics",
      beatLensId: lens,
      costs: lens === "consequence" ? [] : [cost],
      consequences: lens === "cost" ? [] : [consequence],
    },
  };
  if (!isCommittedStoryBeatMechanicsV2(mechanics)) {
    throw new Error("Story Spark mechanics fixture is invalid");
  }
  const projected = projectFactualStoryBeatJobV2(narrative, mechanics);
  if (projected === null) throw new Error("Story Spark V2 fixture did not project");
  return projected;
}

function context(currentTick: number, currentCampaignId = campaignId) {
  return { campaignId: currentCampaignId, currentTick };
}

describe("one-slot factual Story Spark", () => {
  it("freezes the exact fixed priority and canonical-tick expiry policy", () => {
    expect(factualStoryBeatOpportunityMaximumAgeTicks).toBe(12);
    expect(factualStoryBeatOpportunityLensPriority).toEqual({
      cost: 1,
      consequence: 2,
      contrast: 3,
    });
    expect(Object.isFrozen(factualStoryBeatOpportunityLensPriority)).toBe(true);
  });

  it("copies one current opportunity into deeply frozen session memory", () => {
    const candidate = structuredClone(job("cost", 10));
    const retained = retainFactualStoryBeatOpportunityV1(null, candidate, context(10));
    expect(retained).not.toBeNull();
    expect(retained).not.toBe(candidate);
    expect(isFactualStoryBeatOpportunityV1(retained)).toBe(true);
    expect(retained?.job).toEqual(candidate);
    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(retained?.job)).toBe(true);
    expect(Object.isFrozen(retained?.job.facts)).toBe(true);
    expect(Object.isFrozen(retained?.job.facts.narrative)).toBe(true);
    expect(Object.isFrozen(retained?.job.facts.cost)).toBe(true);
    expect(candidate).toEqual(job("cost", 10));
    expect(Object.isFrozen(candidate)).toBe(false);
  });

  it("labels current and held timing without exposing wall time", () => {
    const retained = retainFactualStoryBeatOpportunityV1(
      null,
      job("consequence", 20),
      context(20),
    );
    expect(projectFactualStoryBeatOpportunityV1(retained, context(20)))
      .toMatchObject({ ageTicks: 0, timing: "current" });
    expect(projectFactualStoryBeatOpportunityV1(retained, context(24)))
      .toMatchObject({ ageTicks: 4, timing: "held" });
  });

  it("retains through the exact 12-tick boundary and expires on tick 13", () => {
    const retained = retainFactualStoryBeatOpportunityV1(
      null,
      job("cost", 8),
      context(8),
    );
    const boundary = retainFactualStoryBeatOpportunityV1(
      retained,
      null,
      context(8 + factualStoryBeatOpportunityMaximumAgeTicks),
    );
    expect(projectFactualStoryBeatOpportunityV1(
      boundary,
      context(8 + factualStoryBeatOpportunityMaximumAgeTicks),
    )).toMatchObject({ ageTicks: 12, timing: "held" });
    expect(retainFactualStoryBeatOpportunityV1(
      boundary,
      null,
      context(8 + factualStoryBeatOpportunityMaximumAgeTicks + 1),
    )).toBeNull();
  });

  it.each([
    ["cost", "cost", "candidate"],
    ["cost", "consequence", "candidate"],
    ["cost", "contrast", "candidate"],
    ["consequence", "cost", "current"],
    ["consequence", "consequence", "candidate"],
    ["consequence", "contrast", "candidate"],
    ["contrast", "cost", "current"],
    ["contrast", "consequence", "current"],
    ["contrast", "contrast", "candidate"],
  ] as const)(
    "ranks a %s incumbent against a newer %s candidate by lens before recency",
    (currentLens, candidateLens, expected) => {
      const current = retainFactualStoryBeatOpportunityV1(
        null,
        job(currentLens, 10),
        context(10),
      );
      const selected = retainFactualStoryBeatOpportunityV1(
        current,
        job(candidateLens, 11),
        context(11),
      );
      expect(selected?.job.tick).toBe(expected === "candidate" ? 11 : 10);
    },
  );

  it("uses the newer event only when lens priority ties", () => {
    const first = retainFactualStoryBeatOpportunityV1(
      null,
      job("cost", 10),
      context(10),
    );
    expect(retainFactualStoryBeatOpportunityV1(
      first,
      job("cost", 11),
      context(11),
    )?.job.tick).toBe(11);
    expect(retainFactualStoryBeatOpportunityV1(
      first,
      job("cost", 10, "Other Same-Tick Road"),
      context(10),
    )?.job.facts.narrative.location).toBe("Waystone 10");
    expect(retainFactualStoryBeatOpportunityV1(
      first,
      job("contrast", 10, "Forged Same-Tick Crossroads"),
      context(10),
    )?.job.facts.narrative.location).toBe("Waystone 10");
  });

  it("treats an exact duplicate as idempotent one-slot input", () => {
    const candidate = job("consequence", 10);
    const first = retainFactualStoryBeatOpportunityV1(
      null,
      candidate,
      context(10),
    );
    const duplicate = retainFactualStoryBeatOpportunityV1(
      first,
      structuredClone(candidate),
      context(10),
    );
    expect(duplicate).toEqual(first);
    expect(duplicate?.job.sourceFingerprint).toBe(candidate.sourceFingerprint);
  });

  it("does not let lower-priority offers refresh a stronger beat's lifetime", () => {
    const strong = retainFactualStoryBeatOpportunityV1(
      null,
      job("contrast", 10),
      context(10),
    );
    const afterLowerPriorityOffer = retainFactualStoryBeatOpportunityV1(
      strong,
      job("cost", 20),
      context(20),
    );
    expect(afterLowerPriorityOffer?.job.tick).toBe(10);
    expect(retainFactualStoryBeatOpportunityV1(
      afterLowerPriorityOffer,
      null,
      context(23),
    )).toBeNull();
  });

  it("rejects cross-campaign, future, expired, malformed, and extra-key jobs", () => {
    const retained = retainFactualStoryBeatOpportunityV1(
      null,
      job("contrast", 10),
      context(10),
    );
    const wrongCampaign = { ...job("contrast", 11), campaignId: "campaign:other" };
    for (const candidate of [
      wrongCampaign,
      job("cost", 12),
      { ...job("cost", 11), hiddenFact: true },
      "not-a-job",
    ]) {
      expect(retainFactualStoryBeatOpportunityV1(
        retained,
        candidate,
        context(11),
      )?.job.tick).toBe(10);
    }
    expect(retainFactualStoryBeatOpportunityV1(
      retained,
      job("cost", 1),
      context(14),
    )?.job.tick).toBe(10);
    expect(retainFactualStoryBeatOpportunityV1(
      retained,
      null,
      context(11, "campaign:other"),
    )).toBeNull();
  });

  it("rejects malformed opportunity state and hostile reflection without throwing", () => {
    const valid = retainFactualStoryBeatOpportunityV1(
      null,
      job("cost", 10),
      context(10),
    );
    expect(isFactualStoryBeatOpportunityV1({ ...valid, extra: true })).toBe(false);
    const hostile = new Proxy({}, {
      ownKeys: () => {
        throw new Error("hostile ownKeys");
      },
    });
    expect(() => retainFactualStoryBeatOpportunityV1(
      hostile,
      hostile,
      hostile,
    )).not.toThrow();
    expect(retainFactualStoryBeatOpportunityV1(hostile, hostile, hostile)).toBeNull();
    expect(projectFactualStoryBeatOpportunityV1(hostile, hostile)).toBeNull();
  });

  it("is replay-stable and independent of clocks and randomness", () => {
    const current = retainFactualStoryBeatOpportunityV1(
      null,
      job("cost", 10),
      context(10),
    );
    const candidate = job("consequence", 12);
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now is forbidden");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });
    try {
      const first = retainFactualStoryBeatOpportunityV1(
        current,
        candidate,
        context(12),
      );
      const replay = retainFactualStoryBeatOpportunityV1(
        structuredClone(current),
        structuredClone(candidate),
        context(12),
      );
      expect(replay).toEqual(first);
    } finally {
      dateNow.mockRestore();
      random.mockRestore();
    }
  });
});
