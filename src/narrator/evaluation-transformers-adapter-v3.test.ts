import { describe, expect, it, vi } from "vitest";
import observedReceipt from "../../docs/narrator/t5-artifact-publication-receipt.json";
import { canonicalHash } from "../core/canonical";
import { createNarratorEvaluationRunSpecV3 } from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  narratorFloat32ToBitsV3,
  narratorFormsV3,
  type NarratorFormIdV3,
} from "./evaluation-selection-contract-v3";
import {
  createNarratorTransformersCaseAdapterV3,
  createNarratorTrieLogitsProcessorV3,
  narratorTransformersAdapterContractHashV3,
  narratorTransformersAdapterContractV3,
  narratorTransformersGenerationOptionsV3,
  narratorTransformersInputTokenizerOptionsV3,
  narratorTransformersTargetDecodeOptionsV3,
  narratorTransformersTargetTokenizerOptionsV3,
  type NarratorTransformersLogitsTensorV3,
  type NarratorTransformersModelPortV3,
  type NarratorTransformersTensorV3,
  type NarratorTransformersTokenizerPortV3,
  type NarratorTrieLogitsProcessorV3,
} from "./evaluation-transformers-adapter-v3";
import {
  createNarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationTargetObservationV3,
  type NarratorEvaluationWorkerCaseRequestV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import {
  createNarratorT5PublishedCandidateV1,
  isNarratorT5ArtifactPublicationReceiptV1,
  type NarratorT5ArtifactPublicationReceiptV1,
} from "./t5-publication-evidence";

function candidate(): NarratorModelCandidate {
  expect(isNarratorT5ArtifactPublicationReceiptV1(observedReceipt)).toBe(true);
  return createNarratorT5PublishedCandidateV1(observedReceipt as NarratorT5ArtifactPublicationReceiptV1);
}

function tensor(
  ids: readonly number[],
  dispose = vi.fn(),
): NarratorTransformersTensorV3 {
  return { dims: [1, ids.length], data: BigInt64Array.from(ids.map(BigInt)), dispose };
}

function targetObservations(
  request: NarratorEvaluationWorkerCaseRequestV3,
): readonly NarratorEvaluationTargetObservationV3[] {
  const prompt = narratorEvaluationCasesV1[request.ordinal]!.prompt;
  const forms = new Map(narratorFormsV3(prompt).map((form) => [form.formId, form]));
  return request.eligibility.eligibleFormIds.map((formId) => {
    const form = forms.get(formId)!;
    return { formId, tokenIds: [...form.targetTokenIds], decodedWitness: form.witness };
  });
}

function requestFixture(ordinal = 0, priorForm: NarratorFormIdV3 | null = null, priorHash: string | null = null) {
  const modelCandidate = candidate();
  const runSpec = createNarratorEvaluationRunSpecV3(modelCandidate, "run:adapter:v3");
  const request = createNarratorEvaluationWorkerCaseRequestV3(
    runSpec,
    modelCandidate,
    ordinal,
    "worker-epoch:adapter:v3",
    priorForm,
    priorHash,
  );
  return { modelCandidate, runSpec, request };
}

function targetSetFixture() {
  const fixture = requestFixture();
  const prompt = narratorEvaluationCasesV1[0]!.prompt;
  const observations = targetObservations(fixture.request);
  const targetSet = accountNarratorFormTargetsV3(prompt, fixture.request.eligibility, observations);
  return { ...fixture, prompt, observations, targetSet };
}

function runProcessorForTarget(
  processor: NarratorTrieLogitsProcessorV3,
  targetTokenIds: readonly number[],
  tieAtFirstStep = false,
): void {
  const prefix: number[] = [];
  for (let index = 0; index < targetTokenIds.length; index += 1) {
    const emittedTokenId = targetTokenIds[index]!;
    const scores = new Float32Array(33_000);
    scores.fill(-3);
    if (!tieAtFirstStep || index !== 0) scores[emittedTokenId] = 3;
    processor.process(
      [[0n, ...prefix.map(BigInt)]],
      { dims: [1, scores.length], data: scores },
    );
    prefix.push(emittedTokenId);
  }
}

interface SetupOptions {
  readonly inputIds?: readonly number[];
  readonly inputThrows?: boolean;
  readonly malformedInputContainer?: boolean;
  readonly targetIds?: (formId: NarratorFormIdV3, expected: readonly number[]) => readonly number[];
  readonly targetThrows?: boolean;
  readonly malformedTargetOutput?: boolean;
  readonly targetDecode?: (formId: NarratorFormIdV3, witness: string) => unknown;
  readonly generationThrows?: boolean;
  readonly tieAtFirstStep?: boolean;
  readonly selectedFormId?: NarratorFormIdV3;
}

function setup(options: SetupOptions = {}) {
  const fixture = requestFixture();
  const inputDispose = vi.fn();
  const inputMaskDispose = vi.fn();
  const targetDisposes: ReturnType<typeof vi.fn>[] = [];
  const outputDispose = vi.fn();
  let activeRequest = fixture.request;
  const witnessToForm = new Map(
    narratorFormsV3(narratorEvaluationCasesV1[0]!.prompt).map((form) => [form.witness, form]),
  );

  const tokenize = vi.fn((
    text: string,
    _options: typeof narratorTransformersInputTokenizerOptionsV3,
  ) => {
    if (text.startsWith("Select the most fitting safe ambient narration form")) {
      if (options.inputThrows) throw new Error("input tokenizer failed");
      const record: Record<string, unknown> = {
        input_ids: tensor(options.inputIds ?? [9, 1], inputDispose),
        attention_mask: tensor((options.inputIds ?? [9, 1]).map(() => 1), inputMaskDispose),
      };
      if (options.malformedInputContainer) record.invalid = "not-a-tensor";
      return record;
    }
    if (options.targetThrows) throw new Error("target tokenizer failed");
    const form = witnessToForm.get(text);
    if (form === undefined) throw new Error("unknown target witness");
    if (options.malformedTargetOutput) return { input_ids: "not-a-tensor" };
    const dispose = vi.fn();
    const maskDispose = vi.fn();
    targetDisposes.push(dispose, maskDispose);
    const ids = options.targetIds?.(form.formId, form.targetTokenIds) ?? form.targetTokenIds;
    return {
      input_ids: tensor(ids, dispose),
      attention_mask: tensor(ids.map(() => 1), maskDispose),
    };
  });

  const decode = vi.fn((
    ids: readonly number[],
    _options: typeof narratorTransformersTargetDecodeOptionsV3,
  ) => {
    const form = [...witnessToForm.values()].find((entry) =>
      entry.targetTokenIds.length === ids.length
      && entry.targetTokenIds.every((tokenId, index) => tokenId === ids[index]));
    if (form === undefined) {
      const fallback = [...witnessToForm.values()][0]!;
      return options.targetDecode?.(fallback.formId, fallback.witness) ?? fallback.witness;
    }
    return options.targetDecode?.(form.formId, form.witness) ?? form.witness;
  });
  const tokenizer: NarratorTransformersTokenizerPortV3 = {
    tokenize,
    decode,
    dispose: vi.fn(),
  };

  const generate = vi.fn(async (
    _inputs: unknown,
    _generationOptions: unknown,
    processor: NarratorTrieLogitsProcessorV3,
  ) => {
    if (options.generationThrows) throw new Error("generation failed");
    const prompt = narratorEvaluationCasesV1[activeRequest.ordinal]!.prompt;
    const forms = narratorFormsV3(prompt);
    const selectedFormId = options.selectedFormId !== undefined
      && activeRequest.eligibility.eligibleFormIds.includes(options.selectedFormId)
      ? options.selectedFormId
      : activeRequest.eligibility.eligibleFormIds.find(
        (formId) => formId !== activeRequest.eligibility.baselineFormId,
      ) ?? activeRequest.eligibility.baselineFormId;
    const selected = forms.find((form) => form.formId === selectedFormId)!;
    runProcessorForTarget(processor, selected.targetTokenIds, options.tieAtFirstStep);
    return tensor([0, ...selected.targetTokenIds], outputDispose);
  });
  const model: NarratorTransformersModelPortV3 = { generate, dispose: vi.fn() };
  const adapter = createNarratorTransformersCaseAdapterV3(
    fixture.modelCandidate,
    fixture.runSpec,
    "worker-epoch:adapter:v3",
    tokenizer,
    model,
  );

  return {
    ...fixture,
    adapter,
    tokenizer,
    model,
    tokenize,
    decode,
    generate,
    inputDispose,
    inputMaskDispose,
    targetDisposes,
    outputDispose,
    setActiveRequest(request: NarratorEvaluationWorkerCaseRequestV3) {
      activeRequest = request;
    },
  };
}

function isDeeplyFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value)
    && Object.values(value as Record<string, unknown>).every(isDeeplyFrozen);
}

describe("Narrator Transformers adapter contract V3", () => {
  it("deeply freezes and hashes the exact source-bound adapter behavior", () => {
    expect(isDeeplyFrozen(narratorTransformersAdapterContractV3)).toBe(true);
    expect(narratorTransformersAdapterContractHashV3).toBe(canonicalHash(narratorTransformersAdapterContractV3));
    expect(narratorTransformersAdapterContractV3).toMatchObject({
      targetWitnessDecodeOptions: {
        skip_special_tokens: true,
        clean_up_tokenization_spaces: false,
      },
      allowedScoreCapture: "float32-raw-bits-before-trie-mask",
      masking: "set-only-disallowed-vocabulary-logits-to-negative-infinity",
      generatedTextDecode: false,
      decoderStartTokenId: 0,
      padTokenId: 0,
      eosTokenId: 1,
    });
  });
});

describe("Narrator Transformers trie logits processor V3", () => {
  it("captures allowed float32 bits before masking, mutates only disallowed logits, and finalizes emissions", () => {
    const fixture = targetSetFixture();
    const selected = fixture.targetSet.targets[1]!;
    const processor = createNarratorTrieLogitsProcessorV3(
      fixture.prompt,
      fixture.request.eligibility,
      fixture.targetSet,
    );
    const allowed = allowedNarratorFormTokenIdsV3(
      fixture.prompt,
      fixture.request.eligibility,
      fixture.targetSet,
      [],
    );
    const scores = new Float32Array(33_000);
    scores.fill(-7.5);
    allowed.forEach((tokenId, index) => { scores[tokenId] = index === 0 ? -0 : 2.25 + index; });
    const allowedBefore = allowed.map((tokenId) => scores[tokenId]!);
    const logits: NarratorTransformersLogitsTensorV3 = { dims: [1, scores.length], data: scores };

    expect(processor.process([[0n]], logits)).toBe(logits);
    expect(allowed.map((tokenId) => scores[tokenId])).toEqual(allowedBefore);
    expect(scores[2]).toBe(Number.NEGATIVE_INFINITY);

    const trace = processor.finalize([0, selected.tokenIds[0]!]);
    expect(trace[0]).toEqual({
      prefixTokenIds: [],
      allowedTokenIds: allowed,
      allowedScoreBits: allowedBefore.map(narratorFloat32ToBitsV3),
      emittedTokenId: selected.tokenIds[0],
    });
    expect(isDeeplyFrozen(trace)).toBe(true);
  });

  it("rejects malformed batches, repeated prefixes, out-of-vocabulary branches, and non-finite allowed scores", () => {
    const fixture = targetSetFixture();
    const make = () => createNarratorTrieLogitsProcessorV3(
      fixture.prompt,
      fixture.request.eligibility,
      fixture.targetSet,
    );
    const validScores = () => new Float32Array(33_000).fill(-1);

    expect(() => make().process([], { dims: [1, 33_000], data: validScores() })).toThrow(/one dense/u);
    expect(() => make().process([[1n]], { dims: [1, 33_000], data: validScores() })).toThrow(/decoder-start/u);
    const repeated = make();
    repeated.process([[0n]], { dims: [1, 33_000], data: validScores() });
    expect(() => repeated.process([[0n]], { dims: [1, 33_000], data: validScores() })).toThrow(/next trie/u);
    expect(() => make().process([[0n]], { dims: [1, 4], data: new Float32Array(4) })).toThrow(/vocabulary/u);
    const nonFinite = validScores();
    const allowed = allowedNarratorFormTokenIdsV3(
      fixture.prompt, fixture.request.eligibility, fixture.targetSet, [],
    );
    nonFinite[allowed[0]!] = Number.POSITIVE_INFINITY;
    expect(() => make().process([[0n]], { dims: [1, 33_000], data: nonFinite })).toThrow(/finite/u);
  });
});

describe("Narrator Transformers case adapter V3", () => {
  it("uses exact tokenizer/decode/generation options, returns raw selected evidence, and disposes tensors", async () => {
    const harness = setup();
    const result = await harness.adapter.evaluate(harness.request, 48);

    expect(result.outcome).toBe("selected");
    expect(result.inputTokenIds).toEqual([9, 1]);
    expect(result.fullDecoderTokenIds?.[0]).toBe(0);
    expect(result.selectionTrace?.at(-1)?.emittedTokenId).toBe(1);
    expect(harness.tokenize.mock.calls[0]?.[1]).toBe(narratorTransformersInputTokenizerOptionsV3);
    const forms = narratorFormsV3(narratorEvaluationCasesV1[0]!.prompt);
    expect(harness.tokenize.mock.calls.slice(1).map(([text]) => text))
      .toEqual(harness.request.eligibility.eligibleFormIds.map((formId) =>
        forms.find((form) => form.formId === formId)!.witness));
    for (const call of harness.tokenize.mock.calls.slice(1)) {
      expect(call[1]).toBe(narratorTransformersTargetTokenizerOptionsV3);
    }
    expect(harness.decode).toHaveBeenCalledTimes(harness.request.eligibility.eligibleFormIds.length);
    for (const call of harness.decode.mock.calls) {
      expect(call[1]).toBe(narratorTransformersTargetDecodeOptionsV3);
    }
    expect(harness.generate.mock.calls[0]?.[1]).toBe(narratorTransformersGenerationOptionsV3);
    expect(narratorTransformersGenerationOptionsV3).toMatchObject({
      max_new_tokens: 48,
      do_sample: false,
      num_beams: 1,
      decoder_start_token_id: 0,
      pad_token_id: 0,
      eos_token_id: 1,
    });
    for (const forbidden of ["selectedFormId", "decodedText", "renderedText", "targetSet", "selection"]) {
      expect(Object.hasOwn(result, forbidden)).toBe(false);
    }
    expect(harness.inputDispose).toHaveBeenCalledOnce();
    expect(harness.inputMaskDispose).toHaveBeenCalledOnce();
    expect(harness.outputDispose).toHaveBeenCalledOnce();
    expect(harness.targetDisposes).toHaveLength(harness.request.eligibility.eligibleFormIds.length * 2);
    harness.targetDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it("binds the response hash and successful form into the next odd-slot request history", async () => {
    const harness = setup({ selectedFormId: "establish-gathers" });
    const first = await harness.adapter.evaluate(harness.request, 48);
    expect(first.outcome).toBe("selected");

    const wrong = createNarratorEvaluationWorkerCaseRequestV3(
      harness.runSpec,
      harness.modelCandidate,
      1,
      "worker-epoch:adapter:v3",
      null,
      first.contentHash,
    );
    await expect(harness.adapter.evaluate(wrong, 48)).rejects.toThrow(/invalid or out of order/u);
    const callsBefore = harness.tokenize.mock.calls.length;

    const next = createNarratorEvaluationWorkerCaseRequestV3(
      harness.runSpec,
      harness.modelCandidate,
      1,
      "worker-epoch:adapter:v3",
      "establish-gathers",
      first.contentHash,
    );
    harness.setActiveRequest(next);
    const second = await harness.adapter.evaluate(next, 48);
    expect(second.outcome).toBe("selected");
    expect(next.eligibility.suppressedFormId).toBe("establish-gathers");
    expect(harness.tokenize.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("rejects stale epoch, replay, and wrong output limit before tokenization or inference", async () => {
    const harness = setup();
    const stale = createNarratorEvaluationWorkerCaseRequestV3(
      harness.runSpec,
      harness.modelCandidate,
      0,
      "worker-epoch:stale",
      null,
      null,
    );
    await expect(harness.adapter.evaluate(stale, 48)).rejects.toThrow(/invalid or out of order/u);
    await expect(harness.adapter.evaluate(harness.request, 47 as 48)).rejects.toThrow(/output-token limit/u);
    expect(harness.tokenize).not.toHaveBeenCalled();
    expect(harness.generate).not.toHaveBeenCalled();
    await harness.adapter.evaluate(harness.request, 48);
    await expect(harness.adapter.evaluate(harness.request, 48)).rejects.toThrow(/invalid or out of order/u);
  });

  it("maps input tokenizer, input contract, and input budget failures without inference", async () => {
    const tokenizerFailure = setup({ inputThrows: true });
    expect((await tokenizerFailure.adapter.evaluate(tokenizerFailure.request, 48)).outcome)
      .toBe("input-tokenizer-error");

    const contractFailure = setup({ inputIds: [9] });
    const invalid = await contractFailure.adapter.evaluate(contractFailure.request, 48);
    expect(invalid).toMatchObject({ outcome: "input-token-contract-error", inputTokenIds: [9] });
    expect(contractFailure.generate).not.toHaveBeenCalled();

    const malformedContainer = setup({ malformedInputContainer: true });
    const malformed = await malformedContainer.adapter.evaluate(malformedContainer.request, 48);
    expect(malformed).toMatchObject({ outcome: "input-token-contract-error", inputTokenIds: [] });
    expect(malformedContainer.generate).not.toHaveBeenCalled();

    const budgetFailure = setup({ inputIds: [...Array.from({ length: 320 }, () => 9), 1] });
    const budget = await budgetFailure.adapter.evaluate(budgetFailure.request, 48);
    expect(budget).toMatchObject({ outcome: "input-budget", observedInputTokens: 321, inputTokenIds: null });
    expect(budgetFailure.generate).not.toHaveBeenCalled();
  });

  it("maps target tokenizer errors and retains bounded target-contract evidence, including 49 ids", async () => {
    const tokenizerFailure = setup({ targetThrows: true });
    expect((await tokenizerFailure.adapter.evaluate(tokenizerFailure.request, 48)).outcome)
      .toBe("target-tokenizer-error");

    const malformedTarget = setup({ malformedTargetOutput: true });
    expect((await malformedTarget.adapter.evaluate(malformedTarget.request, 48)).outcome)
      .toBe("target-tokenizer-error");

    let replaced = false;
    const contractFailure = setup({
      targetIds: (_formId, expected) => {
        if (replaced) return expected;
        replaced = true;
        return [...Array.from({ length: 48 }, () => 9), 1];
      },
      targetDecode: (_formId, witness) => witness,
    });
    const result = await contractFailure.adapter.evaluate(contractFailure.request, 48);
    expect(result.outcome).toBe("target-token-contract-error");
    expect(result.targetObservations?.[0]?.tokenIds).toHaveLength(49);
    expect(contractFailure.generate).not.toHaveBeenCalled();
  });

  it("separates target decode execution errors from decoded-witness contract mismatches", async () => {
    const decodeFailure = setup({
      targetDecode: () => { throw new Error("target decode failed"); },
    });
    expect((await decodeFailure.adapter.evaluate(decodeFailure.request, 48)).outcome)
      .toBe("target-tokenizer-error");
    expect(decodeFailure.inputDispose).toHaveBeenCalledOnce();
    decodeFailure.targetDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());

    const mismatch = setup({ targetDecode: () => "wrong witness" });
    const result = await mismatch.adapter.evaluate(mismatch.request, 48);
    expect(result.outcome).toBe("target-token-contract-error");
    expect(result.targetObservations?.[0]?.decodedWitness).toBe("wrong witness");
    expect(mismatch.generate).not.toHaveBeenCalled();
  });

  it("maps generation rejection and exact-score ties without manufacturing a selection", async () => {
    const generationFailure = setup({ generationThrows: true });
    const failed = await generationFailure.adapter.evaluate(generationFailure.request, 48);
    expect(failed.outcome).toBe("generation-error");
    expect(failed.fullDecoderTokenIds).toBeNull();
    expect(failed.selectionTrace).toBeNull();
    expect(generationFailure.inputDispose).toHaveBeenCalledOnce();
    generationFailure.targetDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());

    const tied = setup({ tieAtFirstStep: true });
    const tiedResult = await tied.adapter.evaluate(tied.request, 48);
    expect(tiedResult.outcome).toBe("selection-contract-error");
    expect(tiedResult.fullDecoderTokenIds).not.toBeNull();
    expect(tiedResult.selectionTrace).not.toBeNull();
    expect(tiedResult.selectionTrace?.[0]?.allowedScoreBits.every((bits) =>
      bits === tiedResult.selectionTrace?.[0]?.allowedScoreBits[0])).toBe(true);
  });

  it("disposes model and tokenizer once while attempting both after an error", async () => {
    const harness = setup();
    vi.mocked(harness.model.dispose).mockRejectedValueOnce(new Error("model dispose failed"));
    await expect(harness.adapter.dispose()).rejects.toThrow("model dispose failed");
    await harness.adapter.dispose();
    expect(harness.model.dispose).toHaveBeenCalledOnce();
    expect(harness.tokenizer.dispose).toHaveBeenCalledOnce();
    await expect(harness.adapter.evaluate(harness.request, 48)).rejects.toThrow(/disposed/u);
  });
});
