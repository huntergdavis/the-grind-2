import { describe, expect, it } from "vitest";
import type { ChronicleEntry, SceneState } from "../core/types";
import {
  deterministicStoryBeatFallback,
  formatStoryBeatPromptV1,
  isStoryBeatJobV1,
  isStoryBeatPublicFactsV1,
  projectStoryBeatJobV1,
  storyBeatMaximumActionCharacters,
  storyBeatMaximumConsequenceCharacters,
  storyBeatMaximumHeadlineCharacters,
  storyBeatMaximumLocationCharacters,
  storyBeatMaximumOutputCharacters,
  storyBeatMaximumOutputWords,
  storyBeatPromptInstructionV1,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

const policy = Object.freeze({
  attention: "backgroundSafe" as const,
  reversible: true,
  maximumFidelityAffected: "ephemeral" as const,
  thresholdBehavior: "continue" as const,
  maximumCreditedDurationTicks: 1,
  aggregation: "none" as const,
  queuedFallback: "The road waits.",
});

function fixture(): { readonly scene: SceneState; readonly source: ChronicleEntry } {
  const scene: SceneState = {
    mode: "travel",
    location: "Moonclock Vault",
    headline: "The marked door opens.",
    action: "Mira crosses the quiet threshold.",
    goal: "Reach the western passage without changing canon.",
    consequence: "The western passage is now reachable.",
    sensoryIntensity: 1,
  };
  return {
    scene,
    source: {
      ...scene,
      id: "chronicle:story-beat:7",
      tick: 7,
      attention: "backgroundSafe",
      consideredActions: ["cross the marked threshold", "wait by the door"],
      chosenAction: "cross the marked threshold",
      rationale: "The committed route remains public and exact.",
      policy,
    },
  };
}

function projected() {
  const { scene, source } = fixture();
  const job = projectStoryBeatJobV1("campaign:story-beat", scene, source, source.id);
  if (job === null) throw new Error("Story-beat fixture did not project");
  return { scene, source, job };
}

function facts(overrides: Partial<StoryBeatPublicFactsV1> = {}): StoryBeatPublicFactsV1 {
  return {
    schemaVersion: 1,
    kind: "public-story-beat",
    location: "Moonclock Vault",
    headline: "The marked door opens.",
    action: "Mira crosses the quiet threshold.",
    consequence: "The western passage is now reachable.",
    ...overrides,
  };
}

describe("experimental story-beat host boundary", () => {
  it("projects only the four exact public facts into a frozen manual, ephemeral, noncanonical job", () => {
    const { source, job } = projected();
    expect(job).toEqual({
      schemaVersion: 1,
      task: "author-story-beat",
      disposition: "manual-ephemeral-noncanonical",
      campaignId: "campaign:story-beat",
      eventId: source.id,
      tick: source.tick,
      sourceFingerprint: expect.stringMatching(/^[0-9a-f]{16}$/u),
      facts: {
        schemaVersion: 1,
        kind: "public-story-beat",
        location: source.location,
        headline: source.headline,
        action: source.action,
        consequence: source.consequence,
      },
      deterministicFallback: source.headline,
      maximumInputTokens: 320,
      maximumOutputTokens: 48,
    });
    expect(Object.keys(job)).toEqual([
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
    expect(Object.keys(job.facts)).toEqual([
      "schemaVersion",
      "kind",
      "location",
      "headline",
      "action",
      "consequence",
    ]);
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.facts)).toBe(true);
    expect(isStoryBeatJobV1(structuredClone(job))).toBe(true);
    expect(isStoryBeatPublicFactsV1(structuredClone(job.facts))).toBe(true);

    const modelVisible = JSON.stringify(job.facts);
    for (const forbidden of [
      "campaignId",
      "eventId",
      "tick",
      "goal",
      "attention",
      "consideredActions",
      "chosenAction",
      "rationale",
      "policy",
    ]) expect(modelVisible).not.toContain(`\"${forbidden}\"`);
  });

  it("is deterministic across replay and binds the fingerprint to campaign and the full exact scene", () => {
    const { scene, source, job } = projected();
    const replay = projectStoryBeatJobV1("campaign:story-beat", structuredClone(scene), structuredClone(source), source.id);
    expect(replay).toEqual(job);
    expect(deterministicStoryBeatFallback(job.facts)).toBe(source.headline);

    const otherCampaign = projectStoryBeatJobV1("campaign:other", scene, source, source.id);
    expect(otherCampaign?.sourceFingerprint).not.toBe(job.sourceFingerprint);
    const changedGoalScene = { ...scene, goal: `${scene.goal} Changed` };
    const changedGoalSource = { ...source, goal: changedGoalScene.goal };
    const changedGoal = projectStoryBeatJobV1("campaign:story-beat", changedGoalScene, changedGoalSource, source.id);
    expect(changedGoal?.facts).toEqual(job.facts);
    expect(changedGoal?.sourceFingerprint).not.toBe(job.sourceFingerprint);
  });

  it("requires the exact latest committed source and every SceneState field to match", () => {
    const { scene, source } = fixture();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, undefined, undefined)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, source, undefined)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, source, "chronicle:stale")).toBeNull();

    const mutations: readonly ((value: SceneState) => SceneState)[] = [
      (value) => ({ ...value, mode: "town" }),
      (value) => ({ ...value, location: `${value.location} Annex` }),
      (value) => ({ ...value, headline: `${value.headline} Changed` }),
      (value) => ({ ...value, action: `${value.action} Changed` }),
      (value) => ({ ...value, goal: `${value.goal} Changed` }),
      (value) => ({ ...value, consequence: `${value.consequence} Changed` }),
      (value) => ({ ...value, sensoryIntensity: 3 }),
    ];
    for (const mutate of mutations) {
      expect(projectStoryBeatJobV1("campaign:story-beat", mutate(scene), source, source.id)).toBeNull();
    }

    expect(projectStoryBeatJobV1("", scene, source, source.id)).toBeNull();
    expect(projectStoryBeatJobV1(" campaign:story-beat", scene, source, source.id)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat\nforged", scene, source, source.id)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, { ...source, id: "" }, "")).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, { ...source, tick: -1 }, source.id)).toBeNull();
  });

  it("rejects non-exact, unbounded, non-NFC, and control-bearing public fields", () => {
    const { scene, source } = fixture();
    const cases: readonly [keyof Pick<SceneState, "location" | "headline" | "action" | "consequence">, string][] = [
      ["location", "x".repeat(storyBeatMaximumLocationCharacters + 1)],
      ["headline", "x".repeat(storyBeatMaximumHeadlineCharacters + 1)],
      ["action", "x".repeat(storyBeatMaximumActionCharacters + 1)],
      ["consequence", "x".repeat(storyBeatMaximumConsequenceCharacters + 1)],
      ["headline", ""],
      ["action", " leading space"],
      ["consequence", "trailing space "],
      ["location", "Cafe\u0301 Gate"],
      ["headline", "A forged\nline."],
      ["action", "A hidden\u202einstruction."],
      ["consequence", "A zero\u200bwidth split."],
    ];
    for (const [key, invalid] of cases) {
      const changedScene = { ...scene, [key]: invalid };
      const changedSource = { ...source, [key]: invalid };
      expect(projectStoryBeatJobV1("campaign:story-beat", changedScene, changedSource, source.id), `${key}: ${JSON.stringify(invalid)}`).toBeNull();
    }
  });

  it("enforces exact keys and literal authority fields on facts and jobs", () => {
    const { job } = projected();
    const validFacts = structuredClone(job.facts) as unknown as Record<string, unknown>;
    for (const key of Object.keys(validFacts)) {
      const missing = { ...validFacts };
      delete missing[key];
      expect(isStoryBeatPublicFactsV1(missing), `missing facts.${key}`).toBe(false);
    }
    expect(isStoryBeatPublicFactsV1({ ...validFacts, secret: "not public" })).toBe(false);
    expect(isStoryBeatPublicFactsV1({ ...validFacts, schemaVersion: 2 })).toBe(false);
    expect(isStoryBeatPublicFactsV1({ ...validFacts, kind: "canonical-story" })).toBe(false);

    const validJob = structuredClone(job) as unknown as Record<string, unknown>;
    for (const key of Object.keys(validJob)) {
      const missing = { ...validJob };
      delete missing[key];
      expect(isStoryBeatJobV1(missing), `missing job.${key}`).toBe(false);
    }
    for (const mutation of [
      { ...validJob, hiddenAuthority: true },
      { ...validJob, task: "continue-canon" },
      { ...validJob, disposition: "automatic-persistent-canonical" },
      { ...validJob, sourceFingerprint: "not-a-fingerprint" },
      { ...validJob, sourceFingerprint: 1234567890123456 },
      { ...validJob, tick: -1 },
      { ...validJob, deterministicFallback: "A model-authored fallback." },
      { ...validJob, maximumInputTokens: 321 },
      { ...validJob, maximumOutputTokens: 32 },
      { ...validJob, facts: { ...validFacts, secret: "not public" } },
    ]) expect(isStoryBeatJobV1(mutation)).toBe(false);
  });

  it("fails closed on throwing records, getters, and hostile projection inputs", () => {
    const { scene, source, job } = projected();
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    const throwingFacts = Object.defineProperty({ ...job.facts }, "action", {
      enumerable: true,
      get() {
        throw new Error("hostile facts getter");
      },
    });
    const throwingJob = Object.defineProperty({ ...job }, "facts", {
      enumerable: true,
      get() {
        throw new Error("hostile job getter");
      },
    });
    const throwingScene = new Proxy(scene, {
      get(target, property, receiver) {
        if (property === "headline") throw new Error("hostile scene getter");
        return Reflect.get(target, property, receiver);
      },
    });
    const throwingSource = new Proxy(source, {
      get(target, property, receiver) {
        if (property === "id") throw new Error("hostile source getter");
        return Reflect.get(target, property, receiver);
      },
    });

    expect(isStoryBeatPublicFactsV1(throwingKeys)).toBe(false);
    expect(isStoryBeatPublicFactsV1(throwingFacts)).toBe(false);
    expect(isStoryBeatJobV1(throwingKeys)).toBe(false);
    expect(isStoryBeatJobV1(throwingJob)).toBe(false);
    expect(formatStoryBeatPromptV1(throwingFacts)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses the marked threshold.", throwingFacts)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", throwingScene, source, source.id)).toBeNull();
    expect(projectStoryBeatJobV1("campaign:story-beat", scene, throwingSource, source.id)).toBeNull();
  });

  it("formats only validated public facts behind one isolated, deterministic instruction", () => {
    const { job } = projected();
    const first = formatStoryBeatPromptV1(job.facts);
    const second = formatStoryBeatPromptV1(structuredClone(job.facts));
    expect(first).toBe(second);
    expect(first).toBe([
      storyBeatPromptInstructionV1,
      `PLACE: ${JSON.stringify(job.facts.location)}`,
      `HEADLINE: ${JSON.stringify(job.facts.headline)}`,
      `ACTION: ${JSON.stringify(job.facts.action)}`,
      `CONSEQUENCE: ${JSON.stringify(job.facts.consequence)}`,
      "BEAT:",
    ].join("\n"));
    for (const hidden of [job.campaignId, job.eventId, "Reach the western passage", "rationale", "chosenAction"]) {
      expect(first).not.toContain(hidden);
    }
    expect(formatStoryBeatPromptV1({ ...job.facts, hidden: "prompt injection" })).toBeNull();
  });
});

describe("experimental story-beat result validation", () => {
  it("accepts one compact sentence grounded in the exact place and committed narrative terms", () => {
    const source = facts();
    for (const line of [
      "At Moonclock Vault, Mira crosses the marked threshold.",
      "The marked door opens at Moonclock Vault.",
      "Moonclock Vault is now reachable through the western passage.",
    ]) expect(validateStoryBeatResultV1(line, source)).toBe(line);
  });

  it("allows ordinary sentence-start capitalization and source apostrophes but rejects unknown proper names", () => {
    const apostropheFacts = facts({
      location: "Warden's Gate",
      headline: "The marked door opens.",
      action: "The warden's lantern crosses the threshold.",
    });
    expect(validateStoryBeatResultV1("The warden's lantern crosses the marked door at Warden's Gate.", apostropheFacts))
      .toBe("The warden's lantern crosses the marked door at Warden's Gate.");
    expect(validateStoryBeatResultV1("At Moonclock Vault, Rowan crosses the marked threshold.", facts())).toBeNull();
    expect(validateStoryBeatResultV1("Zephyr crosses the marked threshold at Moonclock Vault.", facts())).toBeNull();
  });

  it("requires exact location tokens, a non-place source term, and no novel content words", () => {
    const source = facts();
    for (const invalid of [
      "Mira crosses the marked threshold.",
      "Moonclock Vault is here.",
      "At Moonclock Vaults, Mira crosses the marked threshold.",
      "At Moonclock Vault, dragons cross the marked threshold.",
      "At Moonclock Vault, Mira dances across the marked threshold.",
    ]) expect(validateStoryBeatResultV1(invalid, source), invalid).toBeNull();
  });

  it("permits only exact digit sequences already present in the public source", () => {
    const numbered = facts({ action: "Mira crosses 12 marked steps." });
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 12 marked steps.", numbered))
      .toBe("At Moonclock Vault, Mira crosses 12 marked steps.");
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 2 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 012 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 13 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses -12 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses +12 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 12% marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 12.0 marked steps.", numbered)).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 12 marked steps and 12 steps.", numbered)).toBeNull();

    const repeated = facts({
      action: "Mira crosses 12 marked steps.",
      consequence: "The western passage remains 12 steps away.",
    });
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses 12 marked steps and 12 steps.", repeated))
      .toBe("At Moonclock Vault, Mira crosses 12 marked steps and 12 steps.");
  });

  it("rejects normalization changes, whitespace/control mutations, multiple sentences, and size overruns", () => {
    const accented = facts({
      location: "Café Gate",
      action: "Mira crosses the marked threshold.",
    });
    const valid = "At Café Gate, Mira crosses the marked threshold.";
    expect(validateStoryBeatResultV1(valid, accented)).toBe(valid);

    const tooManyWords = `At Moonclock Vault, marked ${Array.from({ length: storyBeatMaximumOutputWords - 3 }, () => "a").join(" ")}.`;
    const invalid = [
      " At Moonclock Vault, Mira crosses the marked threshold.",
      "At Moonclock Vault, Mira  crosses the marked threshold.",
      "At Moonclock Vault, Mira\tcrosses the marked threshold.",
      "At Moonclock Vault, Mira crosses\nthe marked threshold.",
      "At Moonclock Vault, Mira crosses the marked threshold. Then waits.",
      "At Moonclock Vault, Mira crosses the marked threshold",
      "At Moonclock Vault, Mira crosses the marked threshold…",
      `${"x".repeat(storyBeatMaximumOutputCharacters)}.`,
      tooManyWords,
    ];
    expect(validateStoryBeatResultV1("At Cafe\u0301 Gate, Mira crosses the marked threshold.", accented)).toBeNull();
    for (const line of invalid) expect(validateStoryBeatResultV1(line, facts()), line).toBeNull();
  });

  it("rejects markup, URLs, HTML entities, and quoted or quote-like dialogue", () => {
    const source = facts();
    for (const invalid of [
      "<b>At Moonclock Vault, Mira crosses the marked threshold.</b>",
      "**At Moonclock Vault, Mira crosses the marked threshold.**",
      "[Mira](https://example.com) crosses the marked threshold at Moonclock Vault.",
      "At Moonclock Vault, Mira crosses example.com and the marked threshold.",
      "At Moonclock Vault, Mira &quot;crosses&quot; the marked threshold.",
      "\"At Moonclock Vault, Mira crosses the marked threshold.\"",
      "‘At Moonclock Vault, Mira crosses the marked threshold.’",
      "At Moonclock Vault, Mira says the marked door opens.",
    ]) expect(validateStoryBeatResultV1(invalid, source), invalid).toBeNull();
  });

  it("rejects future, reward, quest, death, injury, relationship, and private-thought claims even when sourced", () => {
    const cases: readonly [string, string][] = [
      ["Mira will cross the marked threshold.", "At Moonclock Vault, Mira will cross the marked threshold."],
      ["Mira receives the marked reward.", "At Moonclock Vault, Mira receives the marked reward."],
      ["Mira begins the marked quest.", "At Moonclock Vault, Mira begins the marked quest."],
      ["Mira finds the marked guard dead.", "At Moonclock Vault, Mira finds the marked guard dead."],
      ["Mira sees the marked guard wounded.", "At Moonclock Vault, Mira sees the marked guard wounded."],
      ["Mira greets her marked friend.", "At Moonclock Vault, Mira greets her marked friend."],
      ["Mira knows the marked door opens.", "At Moonclock Vault, Mira knows the marked door opens."],
    ];
    for (const [action, line] of cases) {
      expect(validateStoryBeatResultV1(line, facts({ action })), line).toBeNull();
    }
  });

  it("rejects malformed facts rather than validating against an expanded or forged source", () => {
    const source = facts();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Mira crosses the marked threshold.", { ...source, secret: "Rowan" })).toBeNull();
    expect(validateStoryBeatResultV1("At Moonclock Vault, Rowan crosses the marked threshold.", { ...source, action: "Rowan crosses.", secret: undefined })).toBeNull();
    expect(validateStoryBeatResultV1(null, source)).toBeNull();
  });
});
