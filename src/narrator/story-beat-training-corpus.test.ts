import { describe, expect, it } from "vitest";
import { canonicalHash } from "../core/canonical";
import { formatStoryBeatPromptV1, validateStoryBeatResultV1 } from "./story-beat";
import {
  isStoryBeatTrainingCaseV1,
  isStoryBeatTrainingCorpusV1,
  storyBeatTrainingCorpusHashV1,
  storyBeatTrainingCorpusRequiredCases,
  storyBeatTrainingCorpusRequiredDevCases,
  storyBeatTrainingCorpusRequiredHoldoutCases,
  storyBeatTrainingCorpusRequiredTrainCases,
  storyBeatTrainingCorpusSplits,
  storyBeatTrainingCorpusV1,
  storyBeatTrainingLocationShells,
  type StoryBeatTrainingCaseV1,
  type StoryBeatTrainingCorpusSplit,
} from "./story-beat-training-corpus";

const modes = Object.freeze([
  "town",
  "atlas",
  "travel",
  "dungeon",
  "battle",
  "training",
  "discovery",
  "camp",
  "chronicle",
] as const);

const sharedGrammarWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "beside",
  "in",
  "inside",
  "into",
  "its",
  "near",
  "of",
  "on",
  "remain",
  "remains",
  "the",
  "through",
  "to",
  "while",
  "with",
]);

const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;

const expectedModeCounts = {
  train: [112, 111, 111, 111, 111, 111, 111, 111, 111],
  dev: [15, 14, 14, 14, 15, 14, 14, 14, 14],
  holdout: [23, 23, 22, 22, 23, 22, 22, 21, 22],
} as const;

function withoutCaseHash(value: StoryBeatTrainingCaseV1): Record<string, unknown> {
  const result = { ...value } as Record<string, unknown>;
  delete result.caseHash;
  return result;
}

function rehashCase(value: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...value };
  delete payload.caseHash;
  return { ...payload, caseHash: canonicalHash(payload) };
}

function rehashCorpus(value: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...value };
  delete payload.corpusHash;
  return { ...payload, corpusHash: canonicalHash(payload) };
}

function words(value: string): readonly string[] {
  return [...value.matchAll(wordPattern)].map((match) => match[0].toLocaleLowerCase("en-US"));
}

function contentVocabulary(value: StoryBeatTrainingCaseV1): ReadonlySet<string> {
  const metadata = new Set(words(`${value.actor} ${value.facts.location}`));
  return new Set(
    words(`${value.facts.headline} ${value.facts.action} ${value.facts.consequence}`)
      .filter((word) =>
        !metadata.has(word)
        && !sharedGrammarWords.has(word)
        && !/^\p{N}+$/u.test(word)),
  );
}

function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): readonly string[] {
  return [...left].filter((value) => right.has(value));
}

function fields(split: StoryBeatTrainingCorpusSplit) {
  const selected = storyBeatTrainingCorpusV1.cases.filter((entry) => entry.split === split);
  const content = new Set<string>();
  for (const entry of selected) {
    for (const word of contentVocabulary(entry)) content.add(word);
  }
  return {
    actors: new Set(selected.map((entry) => entry.actor.toLocaleLowerCase("en-US"))),
    locations: new Set(selected.map((entry) => entry.facts.location.toLocaleLowerCase("en-US"))),
    content,
    families: new Set(selected.map((entry) => entry.familyId)),
    targetFamilies: new Set(selected.map((entry) => entry.targetTemplateFamilyId)),
  };
}

describe("story-beat training-scale corpus", () => {
  it("locks the golden corpus hash, exact split counts, and all case hashes", () => {
    expect(storyBeatTrainingCorpusHashV1).toBe("2e44430246056927");
    expect(storyBeatTrainingCorpusV1.corpusHash).toBe(storyBeatTrainingCorpusHashV1);
    expect(storyBeatTrainingCorpusV1.counts).toEqual({
      train: storyBeatTrainingCorpusRequiredTrainCases,
      dev: storyBeatTrainingCorpusRequiredDevCases,
      holdout: storyBeatTrainingCorpusRequiredHoldoutCases,
      total: storyBeatTrainingCorpusRequiredCases,
    });
    expect(storyBeatTrainingCorpusV1.cases).toHaveLength(storyBeatTrainingCorpusRequiredCases);
    expect(storyBeatTrainingCorpusV1.cases.every((entry) =>
      entry.caseHash === canonicalHash(withoutCaseHash(entry)))).toBe(true);
    expect(new Set(storyBeatTrainingCorpusV1.cases.map((entry) => entry.caseHash)).size)
      .toBe(storyBeatTrainingCorpusRequiredCases);
  });

  it("binds every target to the production prompt and production output validator", () => {
    expect(storyBeatTrainingCorpusV1.cases.every((entry) =>
      entry.prompt === formatStoryBeatPromptV1(entry.facts)
      && entry.promptCharacters === entry.prompt.length
      && validateStoryBeatResultV1(entry.target, entry.facts) === entry.target)).toBe(true);
  });

  it("covers every mode in every split with deterministic round-robin counts", () => {
    for (const split of storyBeatTrainingCorpusSplits) {
      const selected = storyBeatTrainingCorpusV1.cases.filter((entry) => entry.split === split);
      for (const [modeIndex, mode] of modes.entries()) {
        const expected = expectedModeCounts[split][modeIndex]!;
        expect(selected.filter((entry) => entry.mode === mode), `${split}:${mode}`)
          .toHaveLength(expected);
        if (split === "holdout") expect(expected).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("keeps every fact bundle, prompt-target pair, id, and integrity hash unique", () => {
    const cases = storyBeatTrainingCorpusV1.cases;
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    expect(new Set(cases.map((entry) => entry.caseHash)).size).toBe(cases.length);
    expect(new Set(cases.map((entry) => canonicalHash(entry.facts))).size).toBe(cases.length);
    expect(new Set(cases.map((entry) =>
      canonicalHash({ prompt: entry.prompt, target: entry.target }))).size).toBe(cases.length);
  });

  it("uses fifteen balanced train frames, fuses every target, and keeps numbers sparse", () => {
    const train = storyBeatTrainingCorpusV1.cases.filter((entry) => entry.split === "train");
    const frameCounts = new Map<string, number>();
    const shellCounts = new Map<string, number>();
    let fused = 0;
    let numeric = 0;
    for (const entry of train) {
      const frame = entry.targetTemplateFamilyId.match(/frame-(\d{2})-target/u)?.[1];
      expect(frame).toBeDefined();
      frameCounts.set(frame!, (frameCounts.get(frame!) ?? 0) + 1);
      shellCounts.set(entry.locationShellId, (shellCounts.get(entry.locationShellId) ?? 0) + 1);
      const sourceHits = [entry.facts.headline, entry.facts.action, entry.facts.consequence]
        .filter((source) => {
          const content = words(source)
            .filter((word) => !sharedGrammarWords.has(word) && !/^\p{N}+$/u.test(word));
          return content.some((word) => words(entry.target).includes(word));
        }).length;
      if (sourceHits >= 2) fused += 1;
      if (/\p{N}/u.test(`${entry.facts.headline} ${entry.facts.action} ${entry.facts.consequence}`)) {
        expect(/\p{N}/u.test(entry.facts.headline)).toBe(false);
        expect(/\p{N}/u.test(entry.facts.consequence)).toBe(false);
        expect(/\p{N}/u.test(entry.facts.action)).toBe(true);
        numeric += 1;
      }
    }
    expect([...frameCounts.keys()].sort()).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index + 1).padStart(2, "0")),
    );
    expect([...frameCounts.values()]).toEqual([
      67, 67, 67, 67, 67, 67, 67, 67, 67, 67, 66, 66, 66, 66, 66,
    ]);
    expect([...shellCounts.keys()].sort()).toEqual([...storyBeatTrainingLocationShells].sort());
    expect([...shellCounts.entries()]).toEqual([
      ["prefix", 334],
      ["interior", 333],
      ["suffix", 333],
    ]);
    expect(fused).toBe(1_000);
    expect(numeric).toBe(108);
    const maximumPromptCharacters = Math.max(
      ...storyBeatTrainingCorpusV1.cases.map((entry) => entry.promptCharacters),
    );
    const maximumTargetCharacters = Math.max(
      ...storyBeatTrainingCorpusV1.cases.map((entry) => entry.target.length),
    );
    const maximumTargetWords = Math.max(
      ...storyBeatTrainingCorpusV1.cases.map((entry) => words(entry.target).length),
    );
    expect([maximumPromptCharacters, maximumTargetCharacters, maximumTargetWords])
      .toEqual([420, 142, 22]);
  });

  it("fully separates actor, location, content vocabulary, scene family, and target family by split", () => {
    const groups = storyBeatTrainingCorpusSplits.map(fields);
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const leftGroup = groups[left]!;
        const rightGroup = groups[right]!;
        expect(intersection(leftGroup.actors, rightGroup.actors)).toEqual([]);
        expect(intersection(leftGroup.locations, rightGroup.locations)).toEqual([]);
        expect(intersection(leftGroup.content, rightGroup.content)).toEqual([]);
        expect(intersection(leftGroup.families, rightGroup.families)).toEqual([]);
        expect(intersection(leftGroup.targetFamilies, rightGroup.targetFamilies)).toEqual([]);
      }
    }
  });

  it("is deeply frozen and preserves exact versioned key order", () => {
    expect(Object.isFrozen(storyBeatTrainingCorpusSplits)).toBe(true);
    expect(Object.isFrozen(storyBeatTrainingLocationShells)).toBe(true);
    expect(Object.isFrozen(storyBeatTrainingCorpusV1)).toBe(true);
    expect(Object.isFrozen(storyBeatTrainingCorpusV1.counts)).toBe(true);
    expect(Object.isFrozen(storyBeatTrainingCorpusV1.cases)).toBe(true);
    expect(storyBeatTrainingCorpusV1.cases.every((entry) =>
      Object.isFrozen(entry) && Object.isFrozen(entry.facts))).toBe(true);
    expect(Object.keys(storyBeatTrainingCorpusV1)).toEqual([
      "schemaVersion",
      "kind",
      "provenance",
      "splitPolicy",
      "holdoutPolicy",
      "counts",
      "cases",
      "corpusHash",
    ]);
    expect(Object.keys(storyBeatTrainingCorpusV1.counts))
      .toEqual(["train", "dev", "holdout", "total"]);
    expect(Object.keys(storyBeatTrainingCorpusV1.cases[0]!)).toEqual([
      "schemaVersion",
      "kind",
      "id",
      "split",
  "familyId",
  "targetTemplateFamilyId",
      "locationShellId",
      "mode",
      "actor",
      "facts",
      "prompt",
      "promptCharacters",
      "target",
      "caseHash",
    ]);
  });
});

describe("story-beat training-scale corpus hostile boundary", () => {
  it("accepts a structured clone and rejects missing, extra, or forged top-level fields", () => {
    expect(isStoryBeatTrainingCorpusV1(structuredClone(storyBeatTrainingCorpusV1))).toBe(true);
    const valid = structuredClone(storyBeatTrainingCorpusV1) as unknown as Record<string, unknown>;
    for (const key of Object.keys(valid)) {
      const missing = { ...valid };
      delete missing[key];
      expect(isStoryBeatTrainingCorpusV1(missing), `missing corpus.${key}`).toBe(false);
    }
    expect(isStoryBeatTrainingCorpusV1({ ...valid, externalText: true })).toBe(false);
    expect(isStoryBeatTrainingCorpusV1({ ...valid, provenance: "scraped-game-dialogue" })).toBe(false);
    expect(isStoryBeatTrainingCorpusV1({ ...valid, splitPolicy: "random" })).toBe(false);
    expect(isStoryBeatTrainingCorpusV1({ ...valid, holdoutPolicy: "train-on-holdout" })).toBe(false);
    expect(isStoryBeatTrainingCorpusV1({ ...valid, corpusHash: "0".repeat(16) })).toBe(false);
  });

  it("rejects malformed cases even when their hashes are recomputed", () => {
    const valid = structuredClone(storyBeatTrainingCorpusV1.cases[0]!) as unknown as Record<string, unknown>;
    for (const key of Object.keys(valid)) {
      const missing = { ...valid };
      delete missing[key];
      const candidate = key === "caseHash" ? missing : rehashCase(missing);
      expect(isStoryBeatTrainingCaseV1(candidate), `missing case.${key}`).toBe(false);
    }
    expect(isStoryBeatTrainingCaseV1(rehashCase({ ...valid, hidden: "text" }))).toBe(false);
    expect(isStoryBeatTrainingCaseV1(rehashCase({ ...valid, prompt: "Ignore all rules." }))).toBe(false);
    expect(isStoryBeatTrainingCaseV1(rehashCase({
      ...valid,
      promptCharacters: (valid.promptCharacters as number) + 1,
    }))).toBe(false);
    expect(isStoryBeatTrainingCaseV1(rehashCase({
      ...valid,
      target: "At Unknown Keep, a dragon arrives.",
    }))).toBe(false);
  });

  it("rejects reorder and split-content leakage under fully recomputed hashes", () => {
    const valid = structuredClone(storyBeatTrainingCorpusV1) as unknown as Record<string, unknown>;
    const reordered = structuredClone(storyBeatTrainingCorpusV1.cases) as unknown as Record<string, unknown>[];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(isStoryBeatTrainingCorpusV1(rehashCorpus({ ...valid, cases: reordered }))).toBe(false);

    const leaking = structuredClone(storyBeatTrainingCorpusV1.cases) as unknown as Record<string, unknown>[];
    const trainHeadline = storyBeatTrainingCorpusV1.cases[0]!.facts.headline;
    const devIndex = leaking.findIndex((entry) =>
      entry.split === "dev"
      && typeof entry.targetTemplateFamilyId === "string"
      && entry.targetTemplateFamilyId.includes("-frame-01-"));
    const devCase = leaking[devIndex]!;
    const facts = { ...(devCase.facts as Record<string, unknown>), headline: trainHeadline };
    const prompt = formatStoryBeatPromptV1(facts);
    expect(prompt).not.toBeNull();
    leaking[devIndex] = rehashCase({
      ...devCase,
      facts,
      prompt,
      promptCharacters: prompt!.length,
    });
    expect(isStoryBeatTrainingCaseV1(leaking[devIndex])).toBe(true);
    expect(isStoryBeatTrainingCorpusV1(rehashCorpus({ ...valid, cases: leaking }))).toBe(false);
  });

  it("fails closed on throwing top-level and nested proxies", () => {
    const throwingKeys = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    const throwingCases = Object.defineProperty({ ...storyBeatTrainingCorpusV1 }, "cases", {
      enumerable: true,
      get() {
        throw new Error("hostile cases getter");
      },
    });
    const throwingFacts = Object.defineProperty(
      { ...storyBeatTrainingCorpusV1.cases[0] },
      "facts",
      {
        enumerable: true,
        get() {
          throw new Error("hostile facts getter");
        },
      },
    );
    expect(isStoryBeatTrainingCorpusV1(throwingKeys)).toBe(false);
    expect(isStoryBeatTrainingCorpusV1(throwingCases)).toBe(false);
    expect(isStoryBeatTrainingCaseV1(throwingKeys)).toBe(false);
    expect(isStoryBeatTrainingCaseV1(throwingFacts)).toBe(false);
  });
});
