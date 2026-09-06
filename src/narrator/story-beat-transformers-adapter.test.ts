import { describe, expect, it } from "vitest";
import { storyBeatForms } from "./story-beat-form-selection";
import {
  createStoryBeatTransformersAdapter,
  storyBeatGenerationOptions,
  storyBeatInputTokenizerOptions,
  storyBeatTargetDecodeOptions,
  storyBeatTargetTokenizerOptions,
  type StoryBeatTransformersModelPort,
  type StoryBeatTransformersTensor,
  type StoryBeatTransformersTokenizerPort,
} from "./story-beat-transformers-adapter";
import {
  formatStoryBeatPromptV1,
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

const facts: StoryBeatPublicFactsV1 = {
  schemaVersion: 1,
  kind: "public-story-beat",
  location: "Moonclock Vault",
  headline: "The marked door opens.",
  action: "Mira crosses the quiet threshold.",
  consequence: "The western passage is now reachable.",
};

const forms = storyBeatForms(facts);
const validText = forms[0]!.text;
const vocabularySize = 256;

class FakeTensor implements StoryBeatTransformersTensor {
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
  let finalDecodedOverride: { readonly value: unknown } | null = null;
  let generatedIds: readonly number[] = [0, 100, 1];
  let finishGeneration: (() => void) | null = null;
  let delayed = false;
  let outputDisposeThrows = false;
  let observedGenerationOptions: unknown = null;
  let observedLogitsProcessor: unknown = null;
  let observedDecodeOptions: unknown = null;

  const tokenizer: StoryBeatTransformersTokenizerPort = {
    tokenize(text, options) {
      tokenizedTexts.push(text);
      tokenizerOptions.push(options);
      if (text === formatStoryBeatPromptV1(facts)) {
        const inputIds = new FakeTensor([71, 1]);
        const attentionMask = new FakeTensor([1, 1]);
        inputTensors.push(inputIds, attentionMask);
        return { input_ids: inputIds, attention_mask: attentionMask };
      }
      const formIndex = forms.findIndex((form) => form.text === text);
      if (formIndex < 0) throw new Error("unexpected target text");
      const inputIds = new FakeTensor([100 + formIndex, 1]);
      const attentionMask = new FakeTensor([1, 1]);
      targetTensors.push(inputIds, attentionMask);
      return { input_ids: inputIds, attention_mask: attentionMask };
    },
    decode(ids, options) {
      decodedIds.push([...ids]);
      observedDecodeOptions = options;
      const formIndex = Number(ids[0]) - 100;
      const targetDecode = formIndex >= 0
        && formIndex < forms.length
        && ids.length === 2
        && ids[1] === 1;
      if (decodedIds.length > forms.length && finalDecodedOverride !== null) {
        return finalDecodedOverride.value;
      }
      return targetDecode ? forms[formIndex]!.text : "invalid decode";
    },
  };
  const model: StoryBeatTransformersModelPort = {
    async generate(_inputs, options, logitsProcessor) {
      observedGenerationOptions = options;
      observedLogitsProcessor = logitsProcessor;
      if (delayed) {
        await new Promise<void>((resolve) => {
          finishGeneration = resolve;
        });
      }
      const emitted: number[] = [];
      for (const tokenId of generatedIds.slice(1)) {
        const data = new Float32Array(vocabularySize);
        data.fill(-8);
        if (tokenId >= 0 && tokenId < data.length) data[tokenId] = 4;
        logitsProcessor.process([[0, ...emitted]], { dims: [1, vocabularySize], data });
        emitted.push(tokenId);
      }
      const output = new FakeTensor(generatedIds, outputDisposeThrows);
      outputTensors.push(output);
      return output;
    },
  };

  return {
    adapter: createStoryBeatTransformersAdapter(tokenizer, model),
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
      generatedIds = value;
    },
    delayGeneration() {
      delayed = true;
    },
    throwOnOutputDispose() {
      outputDisposeThrows = true;
    },
  };
}

describe("story-beat Transformers adapter", () => {
  it("formats only public facts, counts exact input ids, and disposes input tensors", async () => {
    const test = harness();
    await expect(test.adapter.countInput(facts)).resolves.toBe(2);
    expect(test.tokenizedTexts).toEqual([formatStoryBeatPromptV1(facts)]);
    expect(test.tokenizerOptions).toEqual([storyBeatInputTokenizerOptions]);
    expect(test.inputTensors).toHaveLength(2);
    expect(test.targetTensors).toHaveLength(0);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("lets model logits choose one exact grounded form and disposes every tensor", async () => {
    const test = harness();
    await expect(test.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).resolves.toEqual({ text: validText, outputTokens: 2 });
    expect(validateStoryBeatResultV1(validText, facts)).toBe(validText);
    expect(test.tokenizedTexts).toEqual([
      formatStoryBeatPromptV1(facts),
      ...forms.map((form) => form.text),
    ]);
    expect(test.tokenizerOptions[0]).toBe(storyBeatInputTokenizerOptions);
    expect(test.tokenizerOptions.slice(1).every(
      (options) => options === storyBeatTargetTokenizerOptions,
    )).toBe(true);
    expect(test.decodedIds).toHaveLength(forms.length + 1);
    expect(test.decodedIds.at(-1)).toEqual([100, 1]);
    expect(test.observedGenerationOptions()).toBe(storyBeatGenerationOptions);
    expect(test.observedLogitsProcessor()).not.toBeNull();
    expect(test.observedDecodeOptions()).toBe(storyBeatTargetDecodeOptions);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.targetTensors).toHaveLength(forms.length * 2);
    expect(test.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("rejects hostile final decoder text instead of granting it visible authority", async () => {
    const test = harness();
    test.setFinalDecoded("A dragon grants 500 gold.");
    await expect(test.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/grounded form/u);
    expect(test.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);

    const nonText = harness();
    nonText.setFinalDecoded({ text: validText });
    await expect(nonText.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/non-text/u);
  });

  it("rejects malformed decoder-start, EOS, early-stop, and trie paths while cleaning tensors", async () => {
    const generatedCases: readonly (readonly number[])[] = [
      [9, 100, 1],
      [0, 41, 1],
      [0, 100, 1, 42],
      [0, 100],
      [0],
    ];
    for (const ids of generatedCases) {
      const test = harness();
      test.setGeneratedIds(ids);
      await expect(test.adapter.author(facts, {
        maximumOutputTokens: storyBeatMaximumOutputTokens,
        signal: new AbortController().signal,
      })).rejects.toThrow();
      expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
      expect(test.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
      expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    }

    const throwingDispose = harness();
    throwingDispose.throwOnOutputDispose();
    await expect(throwingDispose.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/tensor dispose failed/u);
    expect(throwingDispose.outputTensors[0]?.disposeCalls).toBe(1);
    expect(throwingDispose.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(throwingDispose.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("checks cancellation before tokenizer work and after generation, then cleans every tensor", async () => {
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
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: controller.signal,
    });
    for (let index = 0; index < 100 && during.finishGeneration() === null; index += 1) {
      await Promise.resolve();
    }
    controller.abort();
    const finishGeneration = during.finishGeneration();
    if (finishGeneration === null) throw new Error("Story-beat generation did not start");
    finishGeneration();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(during.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(during.targetTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(during.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });
});
