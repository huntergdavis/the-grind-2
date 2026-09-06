import { describe, expect, it } from "vitest";
import {
  accountStoryBeatFormTargets,
  createStoryBeatTrieLogitsProcessor,
  storyBeatAllowedTokenIds,
  storyBeatFormFrameIds,
  storyBeatFormLocationShells,
  storyBeatForms,
  type StoryBeatFormTargetObservation,
  type StoryBeatLogitsTensor,
} from "./story-beat-form-selection";
import { storyBeatTrainingCorpusV1 } from "./story-beat-training-corpus";
import { validateStoryBeatResultV1, type StoryBeatPublicFactsV1 } from "./story-beat";

const facts: StoryBeatPublicFactsV1 = {
  schemaVersion: 1,
  kind: "public-story-beat",
  location: "Moonclock Vault",
  headline: "The marked door opens.",
  action: "Mira crosses the quiet threshold.",
  consequence: "The western passage is now reachable.",
};

function observations(count = 3): readonly StoryBeatFormTargetObservation[] {
  return storyBeatForms(facts).slice(0, count).map((form, index) => ({
    formId: form.formId,
    tokenIds: [10, 20 + index, 1],
    decodedWitness: form.text,
  }));
}

function mutableLogits(
  allowedTokenIds: readonly number[],
  preferredTokenId: number,
  vocabularySize = 100,
): StoryBeatLogitsTensor {
  const data = new Float32Array(vocabularySize);
  data.fill(-8);
  for (const tokenId of allowedTokenIds) data[tokenId] = -2;
  data[preferredTokenId] = 4;
  return { dims: [1, vocabularySize], data };
}

describe("grounded story-beat form catalog", () => {
  it("renders 15 sentence frames through three location shells without adding story facts", () => {
    const forms = storyBeatForms(facts);
    expect(storyBeatFormFrameIds).toHaveLength(15);
    expect(storyBeatFormLocationShells).toEqual(["prefix", "interior", "suffix"]);
    expect(forms).toHaveLength(45);
    expect(new Set(forms.map((form) => form.formId))).toHaveLength(45);
    expect(new Set(forms.map((form) => form.text))).toHaveLength(45);
    expect(forms[0]).toEqual({
      formId: "prefix-action-while-consequence",
      locationShell: "prefix",
      frameId: "action-while-consequence",
      first: "action",
      join: "while",
      second: "consequence",
      text: "At Moonclock Vault, Mira crosses the quiet threshold, while the western passage is now reachable.",
    });
    expect(forms.every((form) => validateStoryBeatResultV1(form.text, facts) === form.text))
      .toBe(true);
    expect(forms.every((form) => ![facts.headline, facts.action, facts.consequence].includes(form.text)))
      .toBe(true);
    expect(forms.every((form) => /^\p{Lu}/u.test(form.text))).toBe(true);
    expect(forms.find((form) => form.formId === "suffix-consequence-as-headline")?.text)
      .toBe("The western passage is now reachable, as the marked door opens at Moonclock Vault.");
    expect(Object.isFrozen(forms)).toBe(true);
    expect(forms.every(Object.isFrozen)).toBe(true);
  });

  it("contains the authored target for every train, dev, and sealed-holdout corpus row", () => {
    for (const entry of storyBeatTrainingCorpusV1.cases) {
      const sentenceCasedTarget = `${entry.target[0]!.toLocaleUpperCase("en-US")}${entry.target.slice(1)}`;
      expect(storyBeatForms(entry.facts).map((form) => form.text), entry.id)
        .toContain(sentenceCasedTarget);
    }
  }, 30_000);

  it("filters forms that exceed display policy and rejects invalid fact records", () => {
    const longPhrase = `${new Array(20).fill("marked").join(" ")}.`;
    expect(storyBeatForms({
      ...facts,
      headline: longPhrase,
      action: longPhrase,
      consequence: longPhrase,
    })).toEqual([]);
    expect(() => storyBeatForms({ ...facts, secret: "hidden" })).toThrow(/facts/u);
    expect(() => storyBeatForms({ ...facts, action: "No terminal mark" })).not.toThrow();
    expect(storyBeatForms({ ...facts, action: "No terminal mark" })).not.toEqual([]);
  });

  it("admits grounded mechanics fragments and bounds multi-sentence consequences", () => {
    const shrineFacts: StoryBeatPublicFactsV1 = {
      schemaVersion: 1,
      kind: "public-story-beat",
      location: "Amberford",
      headline: "Moonkennel: the shrine awakens.",
      action: "SHRINE AWAKENS · HP 12→36 (+24) · MP 20→20 (+0)",
      consequence: "Moonkennel reveals a 7×7 maze. Kael Emberlane invokes the shrine: HP 12→36 (+24) · MP 20→20 (+0).",
    };
    const forms = storyBeatForms(shrineFacts);

    expect(forms).toHaveLength(45);
    expect(forms.every((form) => validateStoryBeatResultV1(form.text, shrineFacts) === form.text))
      .toBe(true);
    expect(forms.every((form) => !form.text.includes("Kael Emberlane"))).toBe(true);
    expect(forms.some((form) =>
      form.text.includes("SHRINE AWAKENS · HP 12→36 (+24) · MP 20→20 (+0)")))
      .toBe(true);
  });
});

describe("story-beat dynamic target accounting", () => {
  it("binds ordered tokenizer observations to exact grounded text and bounded EOS targets", () => {
    const targetSet = accountStoryBeatFormTargets(facts, observations());
    expect(targetSet.targets).toHaveLength(3);
    expect(targetSet.targets[1]).toEqual({
      formId: storyBeatForms(facts)[1]!.formId,
      text: storyBeatForms(facts)[1]!.text,
      tokenIds: [10, 21, 1],
      tokenCount: 3,
    });
    expect(Object.isFrozen(targetSet)).toBe(true);
    expect(Object.isFrozen(targetSet.targets)).toBe(true);
    expect(targetSet.targets.every((target) => Object.isFrozen(target.tokenIds))).toBe(true);
  });

  it("rejects empty, forged, reordered, non-round-tripping, duplicate, and malformed targets", () => {
    const valid = observations();
    const cases: readonly unknown[] = [
      [],
      [valid[0], valid[0]],
      [valid[1], valid[0]],
      [{ ...valid[0], decodedWitness: "At Moonclock Vault, a dragon arrives." }],
      [{ ...valid[0], formId: "prefix-unknown-frame" }],
      [{ ...valid[0], secret: true }],
      [{ ...valid[0], tokenIds: [10, 20] }],
      [{ ...valid[0], tokenIds: [0, 20, 1] }],
      [{ ...valid[0], tokenIds: [10, 1, 20] }],
      [{ ...valid[0], tokenIds: new Array(49).fill(9) }],
      [valid[0], { ...valid[1], tokenIds: valid[0]!.tokenIds }],
    ];
    for (const value of cases) {
      expect(() => accountStoryBeatFormTargets(facts, value)).toThrow();
    }
  });

  it("derives sorted unique next-token branches and rejects completed or foreign prefixes", () => {
    const targetSet = accountStoryBeatFormTargets(facts, observations());
    expect(storyBeatAllowedTokenIds(facts, targetSet, [])).toEqual([10]);
    expect(storyBeatAllowedTokenIds(facts, targetSet, [10])).toEqual([20, 21, 22]);
    expect(storyBeatAllowedTokenIds(facts, targetSet, [10, 21])).toEqual([1]);
    expect(() => storyBeatAllowedTokenIds(facts, targetSet, [99])).toThrow(/incomplete/u);
    expect(() => storyBeatAllowedTokenIds(facts, targetSet, [10, 21, 1])).toThrow(/incomplete/u);
    expect(() => storyBeatAllowedTokenIds(
      facts,
      { ...targetSet, targets: [...targetSet.targets].reverse() },
      [],
    )).toThrow(/grounded form/u);
  });
});

describe("story-beat grounded token trie", () => {
  it("lets model logits select one complete grounded form and masks every other token", () => {
    const targetSet = accountStoryBeatFormTargets(facts, observations());
    const processor = createStoryBeatTrieLogitsProcessor(facts, targetSet);
    const emitted: number[] = [];
    for (const preferred of [10, 21, 1]) {
      const allowed = storyBeatAllowedTokenIds(facts, targetSet, emitted);
      const logits = mutableLogits(allowed, preferred);
      const before = new Float32Array(logits.data);
      expect(processor.process([[0, ...emitted]], logits)).toBe(logits);
      for (let tokenId = 0; tokenId < logits.data.length; tokenId += 1) {
        expect(logits.data[tokenId]).toBe(
          allowed.includes(tokenId) ? before[tokenId] : Number.NEGATIVE_INFINITY,
        );
      }
      emitted.push(preferred);
    }
    expect(processor.finalize([0, ...emitted])).toEqual({
      formId: targetSet.targets[1]!.formId,
      generatedTokenIds: [10, 21, 1],
    });
    expect(() => processor.finalize([0, ...emitted])).toThrow(/already finalized/u);
  });

  it("rejects exact score ties, non-finite scores, malformed tensors, and small vocabularies", () => {
    const targetSet = accountStoryBeatFormTargets(facts, observations());
    const root = storyBeatAllowedTokenIds(facts, targetSet, []);
    const branch = storyBeatAllowedTokenIds(facts, targetSet, [10]);
    const tied = createStoryBeatTrieLogitsProcessor(facts, targetSet);
    tied.process([[0]], mutableLogits(root, 10));
    const tiedLogits = mutableLogits(branch, 20);
    tiedLogits.data[20] = 4;
    tiedLogits.data[21] = 4;
    expect(() => tied.process([[0, 10]], tiedLogits)).toThrow(/top-score tie/u);

    for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const processor = createStoryBeatTrieLogitsProcessor(facts, targetSet);
      const logits = mutableLogits(root, 10);
      logits.data[10] = score;
      expect(() => processor.process([[0]], logits)).toThrow(/finite/u);
    }
    expect(() => createStoryBeatTrieLogitsProcessor(facts, targetSet).process(
      [[0]],
      { dims: [1, 5], data: new Float32Array(5) },
    )).toThrow(/outside the logits vocabulary/u);
    expect(() => createStoryBeatTrieLogitsProcessor(facts, targetSet).process(
      [[0]],
      { dims: [2, 100], data: new Float32Array(100) },
    )).toThrow(/logits tensor/u);
  });

  it("requires sequential unique-maximum emissions and exact completed decoder framing", () => {
    const targetSet = accountStoryBeatFormTargets(facts, observations());
    const root = storyBeatAllowedTokenIds(facts, targetSet, []);
    const processor = createStoryBeatTrieLogitsProcessor(facts, targetSet);
    processor.process([[0]], mutableLogits(root, 10));
    const branch = storyBeatAllowedTokenIds(facts, targetSet, [10]);
    processor.process([[0, 10]], mutableLogits(branch, 20));
    expect(() => processor.process(
      [[0, 10, 21]],
      mutableLogits([1], 1),
    )).toThrow(/unique maximum/u);

    for (const sequence of [
      [0],
      [9, 10, 20, 1],
      [0, 10, 20],
      [0, 10, 1, 20],
      [0, 10, 20, 1],
    ]) {
      expect(() => createStoryBeatTrieLogitsProcessor(facts, targetSet).finalize(sequence))
        .toThrow();
    }
  });
});
