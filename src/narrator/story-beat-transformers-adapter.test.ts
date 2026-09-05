import { describe, expect, it } from "vitest";
import {
  createStoryBeatTransformersAdapter,
  storyBeatGenerationOptions,
  storyBeatInputTokenizerOptions,
  storyBeatTargetDecodeOptions,
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

const validText = "At Moonclock Vault, Mira crosses the quiet threshold.";

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
  const outputTensors: FakeTensor[] = [];
  const prompts: string[] = [];
  const decodedIds: number[][] = [];
  let decoded: unknown = validText;
  let generatedIds: readonly number[] = [0, 41, 42, 1];
  let finishGeneration: (() => void) | null = null;
  let delayed = false;
  let outputDisposeThrows = false;
  let observedGenerationOptions: unknown = null;
  let observedTokenizerOptions: unknown = null;
  let observedDecodeOptions: unknown = null;

  const tokenizer: StoryBeatTransformersTokenizerPort = {
    tokenize(text, options) {
      prompts.push(text);
      observedTokenizerOptions = options;
      const inputIds = new FakeTensor([71, 1]);
      const attentionMask = new FakeTensor([1, 1]);
      inputTensors.push(inputIds, attentionMask);
      return { input_ids: inputIds, attention_mask: attentionMask };
    },
    decode(ids, options) {
      decodedIds.push([...ids]);
      observedDecodeOptions = options;
      return decoded;
    },
  };
  const model: StoryBeatTransformersModelPort = {
    async generate(_inputs, options) {
      observedGenerationOptions = options;
      if (delayed) {
        await new Promise<void>((resolve) => {
          finishGeneration = resolve;
        });
      }
      const output = new FakeTensor(generatedIds, outputDisposeThrows);
      outputTensors.push(output);
      return output;
    },
  };

  return {
    adapter: createStoryBeatTransformersAdapter(tokenizer, model),
    inputTensors,
    outputTensors,
    prompts,
    decodedIds,
    finishGeneration: () => finishGeneration,
    observedGenerationOptions: () => observedGenerationOptions,
    observedTokenizerOptions: () => observedTokenizerOptions,
    observedDecodeOptions: () => observedDecodeOptions,
    setDecoded(value: unknown) {
      decoded = value;
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
    expect(test.prompts).toEqual([formatStoryBeatPromptV1(facts)]);
    expect(test.observedTokenizerOptions()).toBe(storyBeatInputTokenizerOptions);
    expect(test.inputTensors).toHaveLength(2);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("decodes one deterministic bounded sequence without normalizing model text", async () => {
    const test = harness();
    await expect(test.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).resolves.toEqual({ text: validText, outputTokens: 3 });
    expect(validateStoryBeatResultV1(validText, facts)).toBe(validText);
    expect(test.decodedIds).toEqual([[41, 42, 1]]);
    expect(test.observedGenerationOptions()).toBe(storyBeatGenerationOptions);
    expect(test.observedDecodeOptions()).toBe(storyBeatTargetDecodeOptions);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);

    const hostile = harness();
    hostile.setDecoded("A dragon grants 500 gold.");
    await expect(hostile.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).resolves.toEqual({ text: "A dragon grants 500 gold.", outputTokens: 3 });
  });

  it("rejects malformed decoder-start, EOS, early-stop, and decode values while cleaning tensors", async () => {
    const generatedCases: readonly (readonly number[])[] = [
      [9, 41, 1],
      [0, 41, 1, 42],
      [0, 41],
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
      expect(test.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    }

    const nonText = harness();
    nonText.setDecoded({ text: validText });
    await expect(nonText.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/non-text/u);
    expect(nonText.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(nonText.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);

    const throwingDispose = harness();
    throwingDispose.throwOnOutputDispose();
    await expect(throwingDispose.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: new AbortController().signal,
    })).rejects.toThrow(/tensor dispose failed/u);
    expect(throwingDispose.outputTensors[0]?.disposeCalls).toBe(1);
    expect(throwingDispose.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("checks cancellation before tokenizer work and after generation, then cleans every tensor", async () => {
    const before = harness();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(before.adapter.countInput(facts, alreadyAborted.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(before.prompts).toHaveLength(0);

    const during = harness();
    during.delayGeneration();
    const controller = new AbortController();
    const pending = during.adapter.author(facts, {
      maximumOutputTokens: storyBeatMaximumOutputTokens,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    const finishGeneration = during.finishGeneration();
    if (finishGeneration === null) throw new Error("Story-beat generation did not start");
    finishGeneration();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(during.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(during.outputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });
});
