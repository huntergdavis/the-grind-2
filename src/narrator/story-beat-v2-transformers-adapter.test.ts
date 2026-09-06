import { describe, expect, it } from "vitest";
import {
  factualStoryBeatFormsV2,
  factualStoryBeatPresentationBucketIdsV2,
  selectFactualStoryBeatFormEligibilityV2,
} from "./story-beat-v2-form-selection";
import { factualStoryBeatTrainingCorpusV2 } from "./story-beat-v2-training-corpus";
import {
  createFactualStoryBeatTransformersAdapterV2,
  factualStoryBeatGenerationOptionsV2,
  factualStoryBeatInputTokenizerOptionsV2,
  factualStoryBeatTargetDecodeOptionsV2,
  factualStoryBeatTargetTokenizerOptionsV2,
  type FactualStoryBeatTransformersModelPortV2,
  type FactualStoryBeatTransformersTensorV2,
  type FactualStoryBeatTransformersTokenizerPortV2,
} from "./story-beat-v2-transformers-adapter";
import {
  factualStoryBeatMaximumOutputTokens,
  formatFactualStoryBeatPromptV2,
  validateFactualStoryBeatResultV2,
} from "./story-beat-v2";

const facts = factualStoryBeatTrainingCorpusV2.cases.find(
  (entry) => entry.split === "holdout",
)!.facts;
const forms = factualStoryBeatFormsV2(facts);
const firstEligibility = selectFactualStoryBeatFormEligibilityV2(facts, 0);
const validText = firstEligibility.forms[0]!.text;
const vocabularySize = 256;

class FakeTensor implements FactualStoryBeatTransformersTensorV2 {
  readonly dims: readonly number[];
  readonly data: BigInt64Array;
  disposeCalls = 0;

  constructor(
    ids: readonly number[],
    private readonly throwOnDispose = false,
  ) {
    this.dims = Object.freeze([1, ids.length]);
    this.data = BigInt64Array.from(ids.map(BigInt));
  }

  dispose(): void {
    this.disposeCalls += 1;
    if (this.throwOnDispose) throw new Error("tensor dispose failed");
  }
}

function harness() {
  const inputTensors: FakeTensor[] = [];
  const targetTensors: FakeTensor[] = [];
  const outputTensors: FakeTensor[] = [];
  const tokenizedTexts: string[] = [];
  const tokenizerOptions: unknown[] = [];
  const decodedIds: number[][] = [];
  const pendingTargetDecodes: {
    readonly tokenIds: readonly number[];
    readonly text: string;
  }[] = [];
  let finalDecodedOverride: { readonly value: unknown } | null = null;
  let generatedIdsOverride: readonly number[] | null = null;
  let finishGeneration: (() => void) | null = null;
  let delayed = false;
  let outputDisposeThrows = false;
  let observedGenerationOptions: unknown = null;
  let observedLogitsProcessor: unknown = null;
  let observedDecodeOptions: unknown = null;

  const tokenizer: FactualStoryBeatTransformersTokenizerPortV2 = {
    tokenize(text, options) {
      tokenizedTexts.push(text);
      tokenizerOptions.push(options);
      if (text === formatFactualStoryBeatPromptV2(facts)) {
        const inputIds = new FakeTensor([71, 1]);
        const attentionMask = new FakeTensor([1, 1]);
        inputTensors.push(inputIds, attentionMask);
        return { input_ids: inputIds, attention_mask: attentionMask };
      }
      const formIndex = forms.findIndex((form) => form.text === text);
      if (formIndex < 0) throw new Error("unexpected factual target text");
      const inputIds = new FakeTensor([100 + formIndex, 1]);
      const attentionMask = new FakeTensor([1, 1]);
      targetTensors.push(inputIds, attentionMask);
      pendingTargetDecodes.push({
        tokenIds: [100 + formIndex, 1],
        text: forms[formIndex]!.text,
      });
      return { input_ids: inputIds, attention_mask: attentionMask };
    },
    decode(ids, options) {
      decodedIds.push([...ids]);
      observedDecodeOptions = options;
      const pending = pendingTargetDecodes[0];
      if (pending !== undefined
        && ids.length === pending.tokenIds.length
        && ids.every((tokenId, index) => tokenId === pending.tokenIds[index])) {
        pendingTargetDecodes.shift();
        return pending.text;
      }
      if (finalDecodedOverride !== null) return finalDecodedOverride.value;
      const formIndex = Number(ids[0]) - 100;
      return formIndex >= 0 && formIndex < forms.length
        ? forms[formIndex]!.text
        : "invalid decode";
    },
  };

  const model: FactualStoryBeatTransformersModelPortV2 = {
    async generate(_inputs, options, logitsProcessor) {
      observedGenerationOptions = options;
      observedLogitsProcessor = logitsProcessor;
      if (delayed) {
        await new Promise<void>((resolve) => {
          finishGeneration = resolve;
        });
      }
      const emitted: number[] = [];
      if (generatedIdsOverride === null) {
        for (let step = 0; step < factualStoryBeatMaximumOutputTokens; step += 1) {
          const data = Float32Array.from(
            { length: vocabularySize },
            (_, tokenId) => -tokenId,
          );
          logitsProcessor.process([[0, ...emitted]], {
            dims: [1, vocabularySize],
            data,
          });
          const selected = data.findIndex((score) => Number.isFinite(score));
          if (selected < 0) throw new Error("fake model found no grounded token");
          emitted.push(selected);
          if (selected === 1) break;
        }
      } else {
        for (const tokenId of generatedIdsOverride.slice(1)) {
          const data = new Float32Array(vocabularySize);
          data.fill(-8);
          if (tokenId >= 0 && tokenId < data.length) data[tokenId] = 4;
          logitsProcessor.process([[0, ...emitted]], {
            dims: [1, vocabularySize],
            data,
          });
          emitted.push(tokenId);
        }
      }
      const generatedIds = generatedIdsOverride ?? [0, ...emitted];
      const output = new FakeTensor(generatedIds, outputDisposeThrows);
      outputTensors.push(output);
      return output;
    },
  };

  return {
    adapter: createFactualStoryBeatTransformersAdapterV2(tokenizer, model),
    inputTensors,
    targetTensors,
    outputTensors,
    tokenizedTexts,
    tokenizerOptions,
    decodedIds,
    finishGeneration: () => finishGeneration,
    observedGenerationOptions: () => observedGenerationOptions,
    observedLogitsProcessor: () => observedLogitsProcessor,
    observedDecodeOptions: () => observedDecodeOptions,
    setFinalDecoded(value: unknown) {
      finalDecodedOverride = { value };
    },
    setGeneratedIds(value: readonly number[]) {
      generatedIdsOverride = value;
    },
    delayGeneration() {
      delayed = true;
    },
    throwOnOutputDispose() {
      outputDisposeThrows = true;
    },
  };
}

describe("factual V2 story-beat Transformers adapter", () => {
  it("formats only factual public facts, counts input ids, and disposes tensors", async () => {
    const test = harness();
    await expect(test.adapter.countInput(facts)).resolves.toBe(2);
    expect(test.tokenizedTexts).toEqual([formatFactualStoryBeatPromptV2(facts)]);
    expect(test.tokenizerOptions).toEqual([factualStoryBeatInputTokenizerOptionsV2]);
    expect(test.inputTensors).toHaveLength(2);
    expect(test.targetTensors).toHaveLength(0);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("lets model scores choose one exact grounded form and returns its identity", async () => {
    const test = harness();
    await expect(test.adapter.author(facts, {
      maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).resolves.toEqual({
      text: validText,
      outputTokens: 2,
      sequenceSlot: 0,
      presentationBucketId: "prefix-as",
      formId: firstEligibility.forms[0]!.formId,
    });
    expect(validateFactualStoryBeatResultV2(validText, facts)).toBe(validText);
    expect(test.tokenizedTexts).toEqual([
      formatFactualStoryBeatPromptV2(facts),
      ...firstEligibility.forms.map((form) => form.text),
    ]);
    expect(test.tokenizerOptions[0]).toBe(factualStoryBeatInputTokenizerOptionsV2);
    expect(test.tokenizerOptions.slice(1).every(
      (options) => options === factualStoryBeatTargetTokenizerOptionsV2,
    )).toBe(true);
    expect(test.decodedIds).toHaveLength(firstEligibility.forms.length + 1);
    expect(test.observedGenerationOptions()).toBe(factualStoryBeatGenerationOptionsV2);
    expect(test.observedLogitsProcessor()).not.toBeNull();
    expect(test.observedDecodeOptions()).toBe(factualStoryBeatTargetDecodeOptionsV2);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("advances exactly through all six presentation buckets", async () => {
    const test = harness();
    const results = [];
    for (
      let sequenceSlot = 0;
      sequenceSlot < factualStoryBeatPresentationBucketIdsV2.length;
      sequenceSlot += 1
    ) {
      results.push(await test.adapter.author(facts, {
        maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
        signal: new AbortController().signal,
      }));
    }
    expect(results.map((result) => result.presentationBucketId))
      .toEqual(factualStoryBeatPresentationBucketIdsV2);
    expect(results.map((result) => result.text)).toEqual(
      factualStoryBeatPresentationBucketIdsV2.map((_, slot) =>
        selectFactualStoryBeatFormEligibilityV2(facts, slot).forms[0]!.text),
    );
    expect(new Set(results.map((result) => result.text))).toHaveLength(6);
    expect(test.targetTensors).toHaveLength(forms.length * 2);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("rejects hostile decoder output and malformed generation while cleaning up", async () => {
    const hostile = harness();
    hostile.setFinalDecoded("A dragon grants 500 gold.");
    await expect(hostile.adapter.author(facts, {
      maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/grounded form/u);
    expect(hostile.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(hostile.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);

    for (const ids of [[9, 100, 1], [0, 41, 1], [0, 100, 1, 42], [0, 100], [0]]) {
      const malformed = harness();
      malformed.setGeneratedIds(ids);
      await expect(malformed.adapter.author(facts, {
        maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
        signal: new AbortController().signal,
      })).rejects.toThrow();
      expect(malformed.inputTensors.every((tensor) => tensor.disposeCalls === 1))
        .toBe(true);
      expect(malformed.targetTensors.every((tensor) => tensor.disposeCalls === 1))
        .toBe(true);
      expect(malformed.outputTensors.every((tensor) => tensor.disposeCalls === 1))
        .toBe(true);
    }

    const throwingDispose = harness();
    throwingDispose.throwOnOutputDispose();
    await expect(throwingDispose.adapter.author(facts, {
      maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/tensor dispose failed/u);
  });

  it("checks cancellation before work and after generation, then cleans tensors", async () => {
    const before = harness();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(before.adapter.countInput(facts, alreadyAborted.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(before.tokenizedTexts).toHaveLength(0);

    const during = harness();
    during.delayGeneration();
    const controller = new AbortController();
    const pending = during.adapter.author(facts, {
      maximumOutputTokens: factualStoryBeatMaximumOutputTokens,
      signal: controller.signal,
    });
    for (let index = 0; index < 100 && during.finishGeneration() === null; index += 1) {
      await Promise.resolve();
    }
    controller.abort();
    const finishGeneration = during.finishGeneration();
    if (finishGeneration === null) throw new Error("Factual generation did not start");
    finishGeneration();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(during.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(during.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(during.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });
});
