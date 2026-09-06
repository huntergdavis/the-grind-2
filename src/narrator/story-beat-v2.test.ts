import { describe, expect, it } from "vitest";
import type { ChronicleEntry, SceneState } from "../core/types";
import {
  projectStoryBeatJobV1,
  storyBeatMaximumActionCharacters,
  storyBeatMaximumConsequenceCharacters,
  storyBeatMaximumHeadlineCharacters,
  type StoryBeatJobV1,
} from "./story-beat";
import {
  isCommittedStoryBeatMechanicsV2,
  storyBeatConsequenceMetricsV2,
  storyBeatCostMetricsV2,
  type CommittedStoryBeatMechanicsV2,
  type StoryBeatConsequenceFactV2,
  type StoryBeatCostFactV2,
  type StoryBeatLensIdV2,
} from "./story-beat-mechanics-v2";
import {
  factualStoryBeatMaximumInputTokens,
  factualStoryBeatPromptInstructionV2,
  formatFactualStoryBeatPromptV2,
  isFactualStoryBeatJobV2,
  isFactualStoryBeatPublicFactsV2,
  projectFactualStoryBeatJobV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatJobV2,
} from "./story-beat-v2";

const policy = Object.freeze({
  attention: "backgroundSafe" as const,
  reversible: true,
  maximumFidelityAffected: "ephemeral" as const,
  thresholdBehavior: "continue" as const,
  maximumCreditedDurationTicks: 1,
  aggregation: "none" as const,
  queuedFallback: "The road waits.",
});

function narrativeJob(): StoryBeatJobV1 {
  const scene: SceneState = {
    mode: "travel",
    location: "Moonclock Vault",
    headline: "The marked door opens.",
    action: "Mira crosses the marked threshold.",
    goal: "Reach the western passage.",
    consequence: "The western passage is now reachable.",
    sensoryIntensity: 1,
  };
  const source: ChronicleEntry = {
    ...scene,
    id: "campaign:factual-story-beat:7",
    tick: 7,
    attention: "backgroundSafe",
    consideredActions: ["cross the marked threshold"],
    chosenAction: "cross the marked threshold",
    rationale: "The route remains exact.",
    commandId: "campaign:factual-story-beat:travel",
    commandType: "travel",
    consideredCommandIds: ["campaign:factual-story-beat:travel"],
    policy,
  };
  const job = projectStoryBeatJobV1(
    "campaign:factual-story-beat",
    scene,
    source,
    source.id,
  );
  if (job === null) throw new Error("Narrative fixture did not project");
  return job;
}

function cost(
  metric: StoryBeatCostFactV2["metric"] = "hero-health",
  before = 20,
  after = 17,
): StoryBeatCostFactV2 {
  return {
    kind: "cost",
    metric,
    direction: "decrease",
    before,
    after,
    amount: before - after,
  };
}

function consequence(
  metric: StoryBeatConsequenceFactV2["metric"] = "hero-experience",
  before = 4,
  after = 7,
): StoryBeatConsequenceFactV2 {
  const direction = metric === "enemy-health" ? "decrease" : "increase";
  return {
    kind: "consequence",
    metric,
    direction,
    before,
    after,
    amount: Math.abs(after - before),
  };
}

function mechanics(
  beatLensId: StoryBeatLensIdV2,
  costFact: StoryBeatCostFactV2 | null,
  consequenceFact: StoryBeatConsequenceFactV2 | null,
  extras: {
    readonly costs?: readonly StoryBeatCostFactV2[];
    readonly consequences?: readonly StoryBeatConsequenceFactV2[];
  } = {},
): CommittedStoryBeatMechanicsV2 {
  const narrative = narrativeJob();
  const value: CommittedStoryBeatMechanicsV2 = {
    schemaVersion: 2,
    kind: "committed-story-beat-mechanics",
    campaignId: narrative.campaignId,
    eventId: narrative.eventId,
    tick: narrative.tick,
    commandId: "campaign:factual-story-beat:travel",
    commandType: "travel",
    sourceFingerprint: "0123456789abcdef",
    facts: {
      schemaVersion: 2,
      kind: "public-story-beat-mechanics",
      beatLensId,
      costs: extras.costs ?? (costFact === null ? [] : [costFact]),
      consequences:
        extras.consequences ?? (consequenceFact === null ? [] : [consequenceFact]),
    },
  };
  if (!isCommittedStoryBeatMechanicsV2(value)) {
    throw new Error("Mechanics fixture is invalid");
  }
  return value;
}

function projected(
  lens: StoryBeatLensIdV2 = "contrast",
): FactualStoryBeatJobV2 {
  const costFact = lens === "consequence" ? null : cost();
  const consequenceFact = lens === "cost" ? null : consequence();
  const result = projectFactualStoryBeatJobV2(
    narrativeJob(),
    mechanics(lens, costFact, consequenceFact),
  );
  if (result === null) throw new Error("Factual V2 fixture did not project");
  return result;
}

describe("factual story-beat V2 job and prompt", () => {
  it("combines matching V1 narrative and host mechanics into a frozen exact-key V2 job", () => {
    const narrative = narrativeJob();
    const mechanicFacts = mechanics("contrast", cost(), consequence());
    const callerCost = mechanicFacts.facts.costs[0]!;
    const callerConsequence = mechanicFacts.facts.consequences[0]!;
    const job = projectFactualStoryBeatJobV2(narrative, mechanicFacts);
    expect(job).toEqual({
      schemaVersion: 2,
      task: "author-factual-story-beat",
      disposition: "manual-ephemeral-noncanonical",
      campaignId: narrative.campaignId,
      eventId: narrative.eventId,
      tick: narrative.tick,
      sourceFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/u),
      facts: {
        schemaVersion: 2,
        kind: "public-factual-story-beat",
        narrative: narrative.facts,
        beatLensId: "contrast",
        cost: cost(),
        consequence: consequence(),
      },
      deterministicFallback: narrative.facts.headline,
      maximumInputTokens: 384,
      maximumOutputTokens: 48,
    });
    expect(Object.keys(job ?? {})).toEqual([
      "schemaVersion",
      "task",
      "disposition",
      "campaignId",
      "eventId",
      "tick",
      "sourceFingerprint",
      "facts",
      "deterministicFallback",
      "maximumInputTokens",
      "maximumOutputTokens",
    ]);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job?.facts)).toBe(true);
    expect(Object.isFrozen(job?.facts.narrative)).toBe(true);
    expect(Object.isFrozen(callerCost)).toBe(false);
    expect(Object.isFrozen(callerConsequence)).toBe(false);
    expect(isFactualStoryBeatJobV2(structuredClone(job))).toBe(true);
    expect(factualStoryBeatMaximumInputTokens).toBe(384);
  });

  it("selects only the highest-priority ordered cost and consequence", () => {
    const selectedCost = cost("hero-health", 20, 17);
    const secondaryCost = cost("hero-mana", 8, 6);
    const selectedConsequence = consequence("hero-level", 2, 3);
    const secondaryConsequence = consequence("hero-experience", 10, 14);
    const job = projectFactualStoryBeatJobV2(
      narrativeJob(),
      mechanics("contrast", selectedCost, selectedConsequence, {
        costs: [selectedCost, secondaryCost],
        consequences: [selectedConsequence, secondaryConsequence],
      }),
    );
    expect(job?.facts.cost).toEqual(selectedCost);
    expect(job?.facts.consequence).toEqual(selectedConsequence);
    expect(JSON.stringify(job?.facts)).not.toContain("hero-mana");
    expect(JSON.stringify(job?.facts)).not.toContain("hero-experience");
  });

  it("formats one deterministic model prompt with exact required clauses and no host IDs", () => {
    const job = projected();
    expect(formatFactualStoryBeatPromptV2(job.facts)).toBe([
      factualStoryBeatPromptInstructionV2,
      'PLACE: "Moonclock Vault"',
      'HEADLINE: "The marked door opens."',
      'ACTION: "Mira crosses the marked threshold."',
      'CONSEQUENCE: "The western passage is now reachable."',
      'LENS: "contrast"',
      'REQUIRED COST: "health falls from 20 to 17"',
      'REQUIRED CONSEQUENCE: "experience rises from 4 to 7"',
      "BEAT:",
    ].join("\n"));
    const prompt = formatFactualStoryBeatPromptV2(structuredClone(job.facts));
    expect(prompt).not.toContain(job.campaignId);
    expect(prompt).not.toContain(job.eventId);
    expect(prompt).not.toContain(job.sourceFingerprint);
  });

  it("rejects mismatched source identities, malformed inputs, and fields with no clause capacity", () => {
    const narrative = narrativeJob();
    const mechanicFacts = mechanics("cost", cost(), null);
    expect(projectFactualStoryBeatJobV2(
      narrative,
      { ...mechanicFacts, campaignId: "campaign:other" },
    )).toBeNull();
    expect(projectFactualStoryBeatJobV2(
      narrative,
      { ...mechanicFacts, eventId: "event:other" },
    )).toBeNull();
    expect(projectFactualStoryBeatJobV2(
      narrative,
      { ...mechanicFacts, tick: narrative.tick + 1 },
    )).toBeNull();
    expect(projectFactualStoryBeatJobV2({ ...narrative, hidden: true }, mechanicFacts))
      .toBeNull();

    const packedNarrative = {
      ...narrative,
      facts: {
        ...narrative.facts,
        headline: "h".repeat(storyBeatMaximumHeadlineCharacters),
        action: "a".repeat(storyBeatMaximumActionCharacters),
        consequence: "c".repeat(storyBeatMaximumConsequenceCharacters),
      },
      deterministicFallback: "h".repeat(storyBeatMaximumHeadlineCharacters),
    };
    expect(projectFactualStoryBeatJobV2(packedNarrative, mechanicFacts)).toBeNull();
  });

  it("fails closed on hostile getters and proxies", () => {
    const job = projected();
    const throwing = Object.defineProperty({ ...job }, "facts", {
      enumerable: true,
      get() {
        throw new Error("hostile facts getter");
      },
    });
    expect(isFactualStoryBeatJobV2(throwing)).toBe(false);
    expect(formatFactualStoryBeatPromptV2(new Proxy(job.facts, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    }))).toBeNull();
    expect(projectFactualStoryBeatJobV2(
      new Proxy(narrativeJob(), {
        get(target, property, receiver) {
          if (property === "campaignId") throw new Error("hostile job getter");
          return Reflect.get(target, property, receiver);
        },
      }),
      mechanics("cost", cost(), null),
    )).toBeNull();
  });
});

describe("factual story-beat V2 result validation", () => {
  it("accepts cost, consequence, and contrast only with their exact mechanic clauses", () => {
    const cases = [
      [
        projected("cost"),
        "At Moonclock Vault, Mira crosses as health falls from 20 to 17.",
      ],
      [
        projected("consequence"),
        "At Moonclock Vault, Mira crosses as experience rises from 4 to 7.",
      ],
      [
        projected("contrast"),
        "At Moonclock Vault, Mira crosses the marked threshold as health falls from 20 to 17 and experience rises from 4 to 7.",
      ],
    ] as const;
    for (const [job, output] of cases) {
      expect(validateFactualStoryBeatResultV2(output, job.facts), job.facts.beatLensId)
        .toBe(output);
    }
  });

  it("rejects missing, altered, reversed, or unsupported mechanic claims", () => {
    const job = projected("contrast");
    for (const output of [
      "At Moonclock Vault, Mira crosses as health falls from 20 to 17.",
      "At Moonclock Vault, Mira crosses as experience rises from 4 to 7.",
      "At Moonclock Vault, Mira crosses as health falls from 20 to 16 and experience rises from 4 to 7.",
      "At Moonclock Vault, Mira crosses as health rises from 17 to 20 and experience rises from 4 to 7.",
      "At Moonclock Vault, Mira crosses as mana falls from 20 to 17 and experience rises from 4 to 7.",
    ]) expect(validateFactualStoryBeatResultV2(output, job.facts), output).toBeNull();
  });

  it("requires scene substance as well as place and mechanics", () => {
    const job = projected("cost");
    expect(validateFactualStoryBeatResultV2(
      "At Moonclock Vault, health falls from 20 to 17.",
      job.facts,
    )).toBeNull();
    expect(validateFactualStoryBeatResultV2(
      "At Moonclock Vault, marked health falls from 20 to 17.",
      job.facts,
    )).toBe("At Moonclock Vault, marked health falls from 20 to 17.");
  });

  it("retains V1 safety rejection for invented names, dialogue, markup, and future claims", () => {
    const job = projected("cost");
    for (const output of [
      "At Moonclock Vault, Rowan crosses as health falls from 20 to 17.",
      "At Moonclock Vault, Mira says health falls from 20 to 17.",
      "<b>At Moonclock Vault, Mira crosses as health falls from 20 to 17.</b>",
      "At Moonclock Vault, Mira will cross as health falls from 20 to 17.",
    ]) expect(validateFactualStoryBeatResultV2(output, job.facts), output).toBeNull();
  });

  it("validates every closed mechanic metric through non-authoritative host wording", () => {
    for (const metric of storyBeatCostMetricsV2) {
      const job = projectFactualStoryBeatJobV2(
        narrativeJob(),
        mechanics("cost", cost(metric), null),
      );
      const prompt = formatFactualStoryBeatPromptV2(job?.facts);
      expect(prompt, metric).toContain("falls from 20 to 17");
    }
    for (const metric of storyBeatConsequenceMetricsV2) {
      const before = metric === "enemy-health" ? 7 : 4;
      const after = metric === "enemy-health" ? 4 : 7;
      const job = projectFactualStoryBeatJobV2(
        narrativeJob(),
        mechanics("consequence", null, consequence(metric, before, after)),
      );
      const prompt = formatFactualStoryBeatPromptV2(job?.facts);
      expect(prompt, metric).toContain(
        metric === "enemy-health" ? "falls from 7 to 4" : "rises from 4 to 7",
      );
      expect(prompt, metric).not.toMatch(/\b(?:gold|quest|enemy|companion)\b/iu);
    }
  });

  it("enforces exact public/job keys, literal lens shape, and hostile failure", () => {
    const job = projected();
    const facts = structuredClone(job.facts);
    expect(isFactualStoryBeatPublicFactsV2(facts)).toBe(true);
    expect(isFactualStoryBeatJobV2(structuredClone(job))).toBe(true);
    expect(isFactualStoryBeatPublicFactsV2({ ...facts, secret: "hidden" })).toBe(false);
    expect(isFactualStoryBeatPublicFactsV2({ ...facts, beatLensId: "cost" })).toBe(false);
    expect(isFactualStoryBeatPublicFactsV2({ ...facts, cost: null })).toBe(false);
    expect(isFactualStoryBeatJobV2({ ...job, maximumInputTokens: 320 })).toBe(false);
    expect(isFactualStoryBeatJobV2({ ...job, task: "continue-canon" })).toBe(false);
    expect(validateFactualStoryBeatResultV2(
      "At Moonclock Vault, Mira crosses as health falls from 20 to 17 and experience rises from 4 to 7.",
      { ...facts, hidden: true },
    )).toBeNull();
  });
});
