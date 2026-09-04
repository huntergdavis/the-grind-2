import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { describe, expect, it, vi } from "vitest";
import { createNarratorEvaluationRunSpecV2 } from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  narratorDecodingConfigurationV2,
} from "./evaluation-prompt-contract";
import {
  createNarratorTransformersCaseAdapterV2,
  type NarratorTransformersModelPortV2,
  type NarratorTransformersTensorV2,
  type NarratorTransformersTokenizerPortV2,
} from "./evaluation-transformers-adapter-v2";
import { createNarratorEvaluationWorkerCaseRequestV2 } from "./evaluation-worker-protocol-v2";
import { allowedNarratorLines } from "./output-policy";
import { createNarratorT5PublishedCandidateV1 } from "./t5-publication-evidence";

function tensor(ids: readonly number[], dispose = vi.fn()): NarratorTransformersTensorV2 {
  return { dims: [1, ids.length], data: BigInt64Array.from(ids.map(BigInt)), dispose };
}

function setup(fields: {
  readonly inputIds?: readonly number[];
  readonly outputIds?: readonly number[];
  readonly decoded?: unknown;
} = {}) {
  const candidate = createNarratorT5PublishedCandidateV1(observedReceipt);
  const runSpec = createNarratorEvaluationRunSpecV2(candidate, "adapter-test");
  const inputDispose = vi.fn();
  const maskDispose = vi.fn();
  const outputDispose = vi.fn();
  const decode = vi.fn(() => fields.decoded ?? allowedNarratorLines(narratorEvaluationCasesV1[0]!.prompt)[0]);
  const tokenizer: NarratorTransformersTokenizerPortV2 = {
    tokenize: vi.fn(() => ({
      input_ids: tensor(fields.inputIds ?? [10, 1], inputDispose),
      attention_mask: tensor((fields.inputIds ?? [10, 1]).map(() => 1), maskDispose),
    })),
    decode,
    dispose: vi.fn(),
  };
  const generate = vi.fn(async () => tensor(fields.outputIds ?? [0, 20, 1], outputDispose));
  const model: NarratorTransformersModelPortV2 = { generate, dispose: vi.fn() };
  const adapter = createNarratorTransformersCaseAdapterV2(
    candidate,
    runSpec,
    "worker-epoch:test",
    tokenizer,
    model,
  );
  const request = createNarratorEvaluationWorkerCaseRequestV2(
    runSpec,
    candidate,
    0,
    "worker-epoch:test",
    "request:test:0",
  );
  return {
    adapter, candidate, runSpec, request, tokenizer, model, generate, decode,
    inputDispose, maskDispose, outputDispose,
  };
}

describe("Narrator Transformers adapter V2", () => {
  it("uses the frozen one-pass options, preserves raw ids, and disposes every tensor", async () => {
    const harness = setup();
    const result = await harness.adapter.evaluate(harness.request, 48);

    expect(result.outcome).toBe("generated");
    expect(result.inputTokenIds).toEqual([10, 1]);
    expect(result.fullDecoderTokenIds).toEqual([0, 20, 1]);
    expect(harness.tokenizer.tokenize).toHaveBeenCalledTimes(1);
    expect(harness.tokenizer.tokenize).toHaveBeenCalledWith(
      expect.any(String),
      narratorDecodingConfigurationV2.input.tokenizerOptions,
    );
    expect(harness.generate).toHaveBeenCalledWith(
      expect.objectContaining({ input_ids: expect.any(Object), attention_mask: expect.any(Object) }),
      narratorDecodingConfigurationV2.generation.options,
    );
    expect(harness.decode).toHaveBeenCalledWith(
      [20, 1],
      narratorDecodingConfigurationV2.output.decodeOptions,
    );
    expect(harness.inputDispose).toHaveBeenCalledOnce();
    expect(harness.maskDispose).toHaveBeenCalledOnce();
    expect(harness.outputDispose).toHaveBeenCalledOnce();
  });

  it("reports oversized input without retaining ids or constructing output", async () => {
    const harness = setup({ inputIds: [...Array.from({ length: 320 }, () => 10), 1] });
    const result = await harness.adapter.evaluate(harness.request, 48);

    expect(result.outcome).toBe("input-budget");
    expect(result.observedInputTokens).toBe(321);
    expect(result.inputTokenIds).toBeNull();
    expect(harness.generate).not.toHaveBeenCalled();
    expect(harness.inputDispose).toHaveBeenCalledOnce();
    expect(harness.maskDispose).toHaveBeenCalledOnce();
  });

  it("makes malformed input and generated sequences independently auditable", async () => {
    const badInput = setup({ inputIds: [10] });
    const inputResult = await badInput.adapter.evaluate(badInput.request, 48);
    expect(inputResult.outcome).toBe("input-token-contract-error");
    expect(inputResult.inputTokenIds).toEqual([10]);
    expect(badInput.generate).not.toHaveBeenCalled();

    const badOutput = setup({ outputIds: [0, 20] });
    const outputResult = await badOutput.adapter.evaluate(badOutput.request, 48);
    expect(outputResult.outcome).toBe("generated-token-contract-error");
    expect(outputResult.fullDecoderTokenIds).toEqual([0, 20]);
    expect(badOutput.decode).not.toHaveBeenCalled();
  });

  it("separates generation and decode failures without re-tokenizing text", async () => {
    const generationFailure = setup();
    generationFailure.generate.mockRejectedValueOnce(new Error("generation failed"));
    const generationResult = await generationFailure.adapter.evaluate(generationFailure.request, 48);
    expect(generationResult.outcome).toBe("generation-error");
    expect(generationFailure.decode).not.toHaveBeenCalled();

    const decodeFailure = setup();
    decodeFailure.decode.mockImplementationOnce(() => {
      throw new Error("decode failed");
    });
    const decodeResult = await decodeFailure.adapter.evaluate(decodeFailure.request, 48);
    expect(decodeResult.outcome).toBe("decode-error");
    expect(decodeResult.fullDecoderTokenIds).toEqual([0, 20, 1]);
    expect(decodeFailure.tokenizer.tokenize).toHaveBeenCalledTimes(1);
  });

  it("accepts exactly the next frozen corpus case", async () => {
    const harness = setup();
    await harness.adapter.evaluate(harness.request, 48);
    await expect(harness.adapter.evaluate(harness.request, 48)).rejects.toThrow(/out of order/u);

    const skipped = createNarratorEvaluationWorkerCaseRequestV2(
      harness.runSpec,
      harness.candidate,
      2,
      "worker-epoch:test",
      "request:test:2",
    );
    await expect(harness.adapter.evaluate(skipped, 48)).rejects.toThrow(/out of order/u);
  });

  it("rejects a stale worker epoch before tokenization or inference", async () => {
    const harness = setup();
    const stale = createNarratorEvaluationWorkerCaseRequestV2(
      harness.runSpec,
      harness.candidate,
      0,
      "worker-epoch:stale",
      "request:test:stale",
    );
    await expect(harness.adapter.evaluate(stale, 48)).rejects.toThrow(/invalid or out of order/u);
    expect(harness.tokenizer.tokenize).not.toHaveBeenCalled();
    expect(harness.generate).not.toHaveBeenCalled();
  });

  it("disposes model and tokenizer once, attempting both after an error", async () => {
    const harness = setup();
    vi.mocked(harness.model.dispose).mockRejectedValueOnce(new Error("model dispose failed"));
    await expect(harness.adapter.dispose()).rejects.toThrow("model dispose failed");
    await harness.adapter.dispose();
    expect(harness.model.dispose).toHaveBeenCalledOnce();
    expect(harness.tokenizer.dispose).toHaveBeenCalledOnce();
    await expect(harness.adapter.evaluate(harness.request, 48)).rejects.toThrow(/disposed/u);
  });
});
