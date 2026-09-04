import { describe, expect, it } from "vitest";
import {
  createLiveNarratorTransformersAdapter,
  type LiveNarratorTransformersModelPort,
  type LiveNarratorTransformersTensor,
  type LiveNarratorTransformersTokenizerPort,
} from "./live-transformers-adapter";
import {
  formatLiveNarratorFormPrompt,
  liveNarratorForms,
  renderLiveNarratorForm,
  type LiveNarratorFormDescriptor,
  type LiveNarratorTrieLogitsProcessor,
} from "./live-form-selection";
import type { NarratorPromptV1 } from "./protocol";

const vocabularySize = 25_600;

function prompt(): NarratorPromptV1 {
  return {
    schemaVersion: 1,
    task: "single-ambient-line",
    voice: "spare-observer-v1",
    move: "establish-setting",
    facts: {
      schemaVersion: 1,
      kind: "public-scene",
      sceneKind: "travel",
      place: "Moonclock Vault",
      energy: "steady",
    },
  };
}

class FakeTensor implements LiveNarratorTransformersTensor {
  readonly dims: readonly number[];
  readonly data: BigInt64Array;
  disposeCalls = 0;

  constructor(ids: readonly number[]) {
    this.dims = Object.freeze([1, ids.length]);
    this.data = BigInt64Array.from(ids.map(BigInt));
  }

  dispose(): void {
    this.disposeCalls += 1;
  }
}

function allForms(): readonly LiveNarratorFormDescriptor[] {
  const base = prompt();
  return Object.freeze([
    ...liveNarratorForms(base),
    ...liveNarratorForms({
      ...base,
      move: "shade-atmosphere",
      facts: { ...base.facts, sceneKind: "camp" },
    }),
    ...liveNarratorForms({
      ...base,
      voice: "hero-aside-v1",
      move: "register-pressure",
      facts: { ...base.facts, sceneKind: "battle" },
    }),
  ]);
}

function harness(selectedFormId = "establish-gathers") {
  const formByWitness = new Map(allForms().map((form) => [form.witness, form]));
  const inputTensors: FakeTensor[] = [];
  const outputTensors: FakeTensor[] = [];
  const decoded: readonly number[][] = [];
  let tokenizerDisposeCalls = 0;
  let modelDisposeCalls = 0;
  let tokenizeCalls = 0;
  let mutateTokenizerTarget: string | null = null;
  let generationMode: "normal" | "tie" | "wrong-sequence" = "normal";

  const tokenizer: LiveNarratorTransformersTokenizerPort = {
    tokenize(text) {
      tokenizeCalls += 1;
      const form = formByWitness.get(text);
      const ids = form === undefined
        ? [71, 1]
        : form.witness === mutateTokenizerTarget
          ? [...form.targetTokenIds.slice(0, -1), 2, 1]
          : [...form.targetTokenIds];
      const inputIds = new FakeTensor(ids);
      const attentionMask = new FakeTensor(ids.map(() => 1));
      inputTensors.push(inputIds, attentionMask);
      return { input_ids: inputIds, attention_mask: attentionMask };
    },
    decode(ids) {
      const match = allForms().find((form) =>
        form.targetTokenIds.length === ids.length
        && form.targetTokenIds.every((tokenId, index) => tokenId === ids[index]));
      return match?.witness ?? "";
    },
    dispose() {
      tokenizerDisposeCalls += 1;
    },
  };

  const model: LiveNarratorTransformersModelPort = {
    async generate(_inputs, _options, processor: LiveNarratorTrieLogitsProcessor) {
      const selected = allForms().find((form) => form.formId === selectedFormId);
      if (selected === undefined) throw new Error("Unknown selected form fixture");
      const emitted: number[] = [];
      for (const tokenId of selected.targetTokenIds) {
        const logits = {
          dims: [1, vocabularySize],
          data: new Float32Array(vocabularySize),
        };
        logits.data.fill(-8);
        if (generationMode === "tie" && emitted.length === 0) {
          logits.data.fill(0);
        } else {
          logits.data[tokenId] = 4;
        }
        processor.process([[0, ...emitted]], logits);
        emitted.push(tokenId);
      }
      const sequence = generationMode === "wrong-sequence"
        ? [0, ...emitted.slice(0, -1)]
        : [0, ...emitted];
      const tensor = new FakeTensor(sequence);
      outputTensors.push(tensor);
      return tensor;
    },
    dispose() {
      modelDisposeCalls += 1;
    },
  };

  return {
    adapter: createLiveNarratorTransformersAdapter(tokenizer, model),
    inputTensors,
    outputTensors,
    decoded,
    tokenizeCalls: () => tokenizeCalls,
    tokenizerDisposeCalls: () => tokenizerDisposeCalls,
    modelDisposeCalls: () => modelDisposeCalls,
    mutateTokenizerTarget(value: string | null) {
      mutateTokenizerTarget = value;
    },
    generationMode(value: typeof generationMode) {
      generationMode = value;
    },
  };
}

describe("live narrator Transformers adapter", () => {
  it("verifies all ten pinned form tokenizations and disposes every tensor", async () => {
    const test = harness();
    await test.adapter.verifyPinnedTokenizer(new AbortController().signal);
    expect(test.tokenizeCalls()).toBe(10);
    expect(test.inputTensors).toHaveLength(20);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("rejects any tokenizer target drift", async () => {
    const test = harness();
    test.mutateTokenizerTarget("A ENERGY moment gathers at PLACE.");
    await expect(test.adapter.verifyPinnedTokenizer(new AbortController().signal))
      .rejects.toThrow(/pinned form catalog/u);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("counts the exact formatted input and rendered output token tensors", async () => {
    const test = harness();
    await expect(test.adapter.countInput(prompt())).resolves.toBe(2);
    const text = renderLiveNarratorForm(prompt(), "establish-gathers");
    await expect(test.adapter.countOutput(text)).resolves.toBe(2);
    expect(formatLiveNarratorFormPrompt(prompt())).toContain("Moonclock Vault");
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("constrains generation to a form and returns only trusted host rendering", async () => {
    const test = harness("establish-gathers");
    const packet = prompt();
    await expect(test.adapter.realize(packet, {
      maximumOutputTokens: 48,
      signal: new AbortController().signal,
    })).resolves.toBe(renderLiveNarratorForm(packet, "establish-gathers"));
    expect(test.outputTensors).toHaveLength(1);
    expect(test.outputTensors[0]?.disposeCalls).toBe(1);
    expect(test.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
  });

  it("fails closed on a logits tie or incomplete returned sequence", async () => {
    const tied = harness("establish-gathers");
    tied.generationMode("tie");
    await expect(tied.adapter.realize(prompt(), {
      maximumOutputTokens: 48,
      signal: new AbortController().signal,
    })).rejects.toThrow(/top-score tie/u);
    expect(tied.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);

    const incomplete = harness("establish-gathers");
    incomplete.generationMode("wrong-sequence");
    await expect(incomplete.adapter.realize(prompt(), {
      maximumOutputTokens: 48,
      signal: new AbortController().signal,
    })).rejects.toThrow(/generated ids/u);
    expect(incomplete.inputTensors.every((tensor) => tensor.disposeCalls === 1)).toBe(true);
    expect(incomplete.outputTensors[0]?.disposeCalls).toBe(1);
  });

  it("checks aborts before tokenizer work and after asynchronous generation", async () => {
    const before = harness();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(before.adapter.countInput(prompt(), alreadyAborted.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(before.tokenizeCalls()).toBe(0);

    let finishGeneration: (() => void) | null = null;
    const tokenizerTensor = new FakeTensor([71, 1]);
    const tokenizer: LiveNarratorTransformersTokenizerPort = {
      tokenize: () => ({ input_ids: tokenizerTensor }),
      decode: () => "",
    };
    const generated = new FakeTensor([0, 1]);
    const model: LiveNarratorTransformersModelPort = {
      async generate() {
        await new Promise<void>((resolve) => {
          finishGeneration = resolve;
        });
        return generated;
      },
      dispose() {},
    };
    const adapter = createLiveNarratorTransformersAdapter(tokenizer, model);
    const controller = new AbortController();
    const pending = adapter.realize(prompt(), {
      maximumOutputTokens: 48,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    if (finishGeneration === null) throw new Error("Generation did not start");
    (finishGeneration as () => void)();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(tokenizerTensor.disposeCalls).toBe(1);
    expect(generated.disposeCalls).toBe(1);
  });

  it("disposes model and tokenizer exactly once and refuses later work", async () => {
    const test = harness();
    await test.adapter.dispose();
    await test.adapter.dispose();
    expect(test.modelDisposeCalls()).toBe(1);
    expect(test.tokenizerDisposeCalls()).toBe(1);
    await expect(test.adapter.countInput(prompt())).rejects.toThrow(/disposed/u);
  });
});
