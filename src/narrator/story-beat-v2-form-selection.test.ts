import { describe, expect, it } from "vitest";
import {
  accountFactualStoryBeatFormTargetsV2,
  createFactualStoryBeatTrieLogitsProcessorV2,
  factualStoryBeatFormsV2,
  factualStoryBeatPresentationBucketIdsV2,
  selectFactualStoryBeatFormEligibilityV2,
} from "./story-beat-v2-form-selection";
import { factualStoryBeatTrainingCorpusV2 } from "./story-beat-v2-training-corpus";
import { validateFactualStoryBeatResultV2 } from "./story-beat-v2";

const holdout = factualStoryBeatTrainingCorpusV2.cases.filter(
  (entry) => entry.split === "holdout",
);
const firstFacts = holdout[0]!.facts;

function logits(scores: Readonly<Record<number, number>>, size = 64) {
  const data = new Float32Array(size);
  data.fill(-20);
  for (const [token, score] of Object.entries(scores)) data[Number(token)] = score;
  return { dims: [1, size], data };
}

describe("factual V2 grounded story-beat forms", () => {
  it("derives only production-valid forms across the complete sealed fact set", () => {
    expect(holdout).toHaveLength(200);
    let formCount = 0;
    const texts = new Set<string>();
    for (const row of holdout) {
      const forms = factualStoryBeatFormsV2(row.facts);
      formCount += forms.length;
      expect(forms.length).toBeGreaterThanOrEqual(6);
      expect(forms.length).toBeLessThanOrEqual(24);
      expect(new Set(forms.map((form) => form.text)).size).toBe(forms.length);
      expect(new Set(forms.map((form) => `${form.locationShell}-${form.join}`)))
        .toEqual(new Set(factualStoryBeatPresentationBucketIdsV2));
      expect(forms.every((form) =>
        validateFactualStoryBeatResultV2(form.text, row.facts) === form.text,
      )).toBe(true);
      forms.forEach((form) => texts.add(form.text));
      expect(Object.isFrozen(forms)).toBe(true);
      expect(forms.every(Object.isFrozen)).toBe(true);
    }
    expect(formCount).toBe(3_612);
    expect(texts.size).toBe(3_612);
  });

  it("rotates exactly through the six presentation buckets", () => {
    for (let slot = 0; slot < 12; slot += 1) {
      const decision = selectFactualStoryBeatFormEligibilityV2(firstFacts, slot);
      const expected = factualStoryBeatPresentationBucketIdsV2[
        slot % factualStoryBeatPresentationBucketIdsV2.length
      ];
      expect(decision).toMatchObject({
        schemaVersion: 2,
        sequenceSlot: slot,
        requestedBucketId: expected,
        selectedBucketId: expected,
      });
      expect(decision.forms.length).toBeGreaterThan(0);
      expect(decision.forms.every((form) =>
        `${form.locationShell}-${form.join}` === expected,
      )).toBe(true);
      expect(Object.isFrozen(decision)).toBe(true);
    }
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => selectFactualStoryBeatFormEligibilityV2(firstFacts, invalid))
        .toThrow(/slot/u);
    }
    expect(() => factualStoryBeatFormsV2({ ...firstFacts, hidden: true }))
      .toThrow(/facts/u);
  });
});

describe("factual V2 grounded story-beat token trie", () => {
  it("accounts exact tokenizer witnesses and selects the unique model maximum", () => {
    const forms = selectFactualStoryBeatFormEligibilityV2(firstFacts, 0).forms;
    const observations = forms.map((form, index) => ({
      formId: form.formId,
      tokenIds: [index + 2, 1],
      decodedWitness: form.text,
    }));
    const targets = accountFactualStoryBeatFormTargetsV2(firstFacts, observations);
    expect(targets.schemaVersion).toBe(2);
    expect(targets.targets).toHaveLength(forms.length);

    const selectedIndex = forms.length - 1;
    const selectedToken = selectedIndex + 2;
    const processor = createFactualStoryBeatTrieLogitsProcessorV2(firstFacts, targets);
    const rootScores = Object.fromEntries(
      observations.map((_, index) => [index + 2, index]),
    );
    const root = processor.process([[0]], logits(rootScores));
    expect(root.data[selectedToken]).toBe(selectedIndex);
    expect(root.data[0]).toBe(Number.NEGATIVE_INFINITY);

    const terminal = processor.process([[0, selectedToken]], logits({ 1: 3 }));
    expect(terminal.data[1]).toBe(3);
    expect(terminal.data[2]).toBe(Number.NEGATIVE_INFINITY);
    expect(processor.finalize([0, selectedToken, 1])).toEqual({
      formId: forms[selectedIndex]!.formId,
      generatedTokenIds: [selectedToken, 1],
    });
    expect(() => processor.finalize([0, selectedToken, 1])).toThrow(/finalized/u);
  });

  it("fails closed on exact ties, target drift, and hostile observations", () => {
    const forms = selectFactualStoryBeatFormEligibilityV2(firstFacts, 0).forms;
    const observations = forms.map((form, index) => ({
      formId: form.formId,
      tokenIds: [index + 2, 1],
      decodedWitness: form.text,
    }));
    const targets = accountFactualStoryBeatFormTargetsV2(firstFacts, observations);
    const tied = createFactualStoryBeatTrieLogitsProcessorV2(firstFacts, targets);
    expect(() => tied.process([[0]], logits(Object.fromEntries(
      observations.map((_, index) => [index + 2, 0]),
    )))).toThrow(/tie/u);

    expect(() => accountFactualStoryBeatFormTargetsV2(firstFacts, [
      { ...observations[0]!, hidden: true },
    ])).toThrow(/observation/u);
    expect(() => accountFactualStoryBeatFormTargetsV2(firstFacts, [
      observations[1]!,
      observations[0]!,
    ])).toThrow(/out of order/u);

    const changed = {
      ...targets,
      targets: targets.targets.map((target, index) =>
        index === 0 ? { ...target, text: "Changed." } : target),
    };
    expect(() => createFactualStoryBeatTrieLogitsProcessorV2(firstFacts, changed))
      .toThrow(/grounded form/u);
  });
});
