import {
  liveNarratorInputTokenizerOptions,
  liveNarratorTargetDecodeOptions,
  liveNarratorTargetTokenizerOptions,
} from "./live-form-selection";
import {
  accountFactualStoryBeatFormTargetsV2,
  createFactualStoryBeatTrieLogitsProcessorV2,
  factualStoryBeatPresentationBucketIdsV2,
  selectFactualStoryBeatFormEligibilityV2,
  type FactualStoryBeatFormDescriptorV2,
  type FactualStoryBeatFormIdV2,
  type FactualStoryBeatFormTargetObservationV2,
  type FactualStoryBeatPresentationBucketIdV2,
  type FactualStoryBeatTrieLogitsProcessorV2,
} from "./story-beat-v2-form-selection";
import {
  factualStoryBeatMaximumInputTokens,
  factualStoryBeatMaximumOutputTokens,
  formatFactualStoryBeatPromptV2,
  isFactualStoryBeatPublicFactsV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatPublicFactsV2,
} from "./story-beat-v2";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const factualStoryBeatInputTokenizerOptionsV2 =
  liveNarratorInputTokenizerOptions;
export const factualStoryBeatTargetTokenizerOptionsV2 =
  liveNarratorTargetTokenizerOptions;
export const factualStoryBeatTargetDecodeOptionsV2 =
  liveNarratorTargetDecodeOptions;
export const factualStoryBeatGenerationOptionsV2 = deepFreeze({
  do_sample: false as const,
  num_beams: 1 as const,
  num_return_sequences: 1 as const,
  max_new_tokens: factualStoryBeatMaximumOutputTokens,
  return_dict_in_generate: false as const,
  min_length: 0 as const,
  min_new_tokens: 0 as const,
  repetition_penalty: 1 as const,
  no_repeat_ngram_size: 0 as const,
  encoder_no_repeat_ngram_size: 0 as const,
  bad_words_ids: null,
  force_words_ids: null,
  forced_bos_token_id: null,
  forced_eos_token_id: null,
  suppress_tokens: null,
  begin_suppress_tokens: null,
  guidance_scale: null,
  decoder_start_token_id: 0 as const,
  pad_token_id: 0 as const,
  eos_token_id: 1 as const,
});

export interface FactualStoryBeatTransformersTensorV2 {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number | bigint>;
  dispose(): void;
}

export type FactualStoryBeatTransformersInputsV2 =
  Readonly<Record<string, FactualStoryBeatTransformersTensorV2>>;

export interface FactualStoryBeatTransformersTokenizerPortV2 {
  tokenize(
    text: string,
    options: typeof factualStoryBeatInputTokenizerOptionsV2,
  ): Promise<unknown> | unknown;
  decode(
    tokenIds: readonly number[],
    options: typeof factualStoryBeatTargetDecodeOptionsV2,
  ): unknown;
}

export interface FactualStoryBeatTransformersModelPortV2 {
  generate(
    inputs: FactualStoryBeatTransformersInputsV2,
    options: typeof factualStoryBeatGenerationOptionsV2,
    logitsProcessor: FactualStoryBeatTrieLogitsProcessorV2,
  ): Promise<unknown>;
}

export interface FactualStoryBeatDecodedCandidateV2 {
  readonly text: string;
  readonly outputTokens: number;
  readonly sequenceSlot: number;
  readonly presentationBucketId: FactualStoryBeatPresentationBucketIdV2;
  readonly formId: FactualStoryBeatFormIdV2;
}

export interface FactualStoryBeatTransformersAdapterV2 {
  countInput(
    facts: FactualStoryBeatPublicFactsV2,
    signal?: AbortSignal,
  ): Promise<number>;
  author(
    facts: FactualStoryBeatPublicFactsV2,
    options: {
      readonly maximumOutputTokens: typeof factualStoryBeatMaximumOutputTokens;
      readonly signal: AbortSignal;
    },
  ): Promise<FactualStoryBeatDecodedCandidateV2>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseNonNegativeIntegerArray(value: unknown): value is readonly number[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length
    && keys.every((key, index) => key === String(index))
    && value.every((entry) => Number.isSafeInteger(entry) && entry >= 0);
}

function isTensor(value: unknown): value is FactualStoryBeatTransformersTensorV2 {
  if (!isRecord(value)
    || !isDenseNonNegativeIntegerArray(value.dims)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || typeof value.dispose !== "function"
    || (typeof value.data !== "object" && typeof value.data !== "function")
    || value.data === null) return false;
  const data = value.data as { readonly length?: unknown };
  return Number.isSafeInteger(data.length)
    && Number(data.length) >= 0
    && value.dims[1] === data.length;
}

function tokenSequence(value: unknown, maximumLength: number): readonly number[] {
  if (!isTensor(value) || value.data.length > maximumLength) {
    throw new TypeError("Factual story-beat tokenizer tensor is invalid or over budget");
  }
  const result: number[] = [];
  for (let index = 0; index < value.data.length; index += 1) {
    const token = value.data[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError("Factual story-beat tensor contains an invalid token id");
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || Number(token) < 0) {
        throw new TypeError("Factual story-beat tensor contains an invalid token id");
      }
      result.push(Number(token));
    }
  }
  return Object.freeze(result);
}

function disposableTensors(
  value: unknown,
): readonly FactualStoryBeatTransformersTensorV2[] {
  if (isTensor(value)) return Object.freeze([value]);
  if (!isRecord(value)) return Object.freeze([]);
  const tensors: FactualStoryBeatTransformersTensorV2[] = [];
  const seen = new Set<FactualStoryBeatTransformersTensorV2>();
  for (const child of Object.values(value)) {
    if (isTensor(child) && !seen.has(child)) {
      seen.add(child);
      tensors.push(child);
    }
  }
  return Object.freeze(tensors);
}

function disposeTensors(
  tensors: readonly FactualStoryBeatTransformersTensorV2[],
): void {
  let firstError: unknown = null;
  const seen = new Set<FactualStoryBeatTransformersTensorV2>();
  for (const tensor of tensors) {
    if (seen.has(tensor)) continue;
    seen.add(tensor);
    try {
      tensor.dispose();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== null) throw firstError;
}

function tokenizedInputs(value: unknown): FactualStoryBeatTransformersInputsV2 {
  if (!isRecord(value)
    || !Object.hasOwn(value, "input_ids")
    || Object.keys(value).length === 0
    || !Object.values(value).every(isTensor)) {
    throw new TypeError("Factual story-beat tokenizer output is invalid");
  }
  return value as FactualStoryBeatTransformersInputsV2;
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function accountGeneratedTokens(value: unknown): {
  readonly tokenIds: readonly number[];
  readonly outputTokens: number;
} {
  const fullSequence = tokenSequence(
    value,
    factualStoryBeatMaximumOutputTokens + 1,
  );
  if (fullSequence[0] !== factualStoryBeatGenerationOptionsV2.decoder_start_token_id) {
    throw new TypeError("Factual story-beat generated ids must begin with decoder-start");
  }
  const tokenIds = fullSequence.slice(1);
  if (tokenIds.length === 0) {
    throw new RangeError("Factual story-beat generated ids are empty");
  }
  const eosIndex = tokenIds.indexOf(factualStoryBeatGenerationOptionsV2.eos_token_id);
  if (eosIndex >= 0 && eosIndex !== tokenIds.length - 1) {
    throw new TypeError("Factual story-beat generated ids contain data after EOS");
  }
  if (eosIndex < 0 && tokenIds.length !== factualStoryBeatMaximumOutputTokens) {
    throw new TypeError(
      "Factual story-beat generation stopped before EOS or its token limit",
    );
  }
  return Object.freeze({
    tokenIds: Object.freeze(tokenIds),
    outputTokens: tokenIds.length,
  });
}

export function createFactualStoryBeatTransformersAdapterV2(
  tokenizer: FactualStoryBeatTransformersTokenizerPortV2,
  model: FactualStoryBeatTransformersModelPortV2,
): FactualStoryBeatTransformersAdapterV2 {
  let nextPresentationSlot = 0;

  const tokenizeFacts = async (
    facts: FactualStoryBeatPublicFactsV2,
    signal?: AbortSignal,
  ): Promise<{
    readonly inputs: FactualStoryBeatTransformersInputsV2;
    readonly tensors: readonly FactualStoryBeatTransformersTensorV2[];
    readonly count: number;
  }> => {
    checkAbort(signal);
    if (!isFactualStoryBeatPublicFactsV2(facts)) {
      throw new TypeError("Factual story-beat public facts are invalid");
    }
    const prompt = formatFactualStoryBeatPromptV2(facts);
    if (prompt === null) {
      throw new TypeError("Factual story-beat prompt could not be formatted");
    }
    const tokenized = await tokenizer.tokenize(
      prompt,
      factualStoryBeatInputTokenizerOptionsV2,
    );
    const tensors = disposableTensors(tokenized);
    try {
      checkAbort(signal);
      const inputs = tokenizedInputs(tokenized);
      const inputIds = tokenSequence(
        inputs.input_ids,
        factualStoryBeatMaximumInputTokens,
      );
      if (inputIds.length === 0 || inputIds.at(-1) !== 1) {
        throw new TypeError("Factual story-beat input token sequence must end in EOS");
      }
      return { inputs, tensors, count: inputIds.length };
    } catch (error) {
      disposeTensors(tensors);
      throw error;
    }
  };

  const tokenizeTargets = async (
    facts: FactualStoryBeatPublicFactsV2,
    forms: readonly FactualStoryBeatFormDescriptorV2[],
    signal: AbortSignal,
  ) => {
    const observations: FactualStoryBeatFormTargetObservationV2[] = [];
    for (const form of forms) {
      checkAbort(signal);
      const tokenized = await tokenizer.tokenize(
        form.text,
        factualStoryBeatTargetTokenizerOptionsV2,
      );
      const tensors = disposableTensors(tokenized);
      try {
        checkAbort(signal);
        const inputs = tokenizedInputs(tokenized);
        const inputIds = inputs.input_ids;
        if (inputIds === undefined) {
          throw new TypeError("Factual story-beat target tokenizer omitted input ids");
        }
        if (inputIds.data.length > factualStoryBeatMaximumOutputTokens) continue;
        const tokenIds = tokenSequence(
          inputIds,
          factualStoryBeatMaximumOutputTokens,
        );
        const decodedWitness = tokenizer.decode(
          tokenIds,
          factualStoryBeatTargetDecodeOptionsV2,
        );
        if (typeof decodedWitness !== "string") {
          throw new TypeError("Factual story-beat tokenizer returned a non-text target");
        }
        observations.push({
          formId: form.formId,
          tokenIds,
          decodedWitness,
        });
      } finally {
        disposeTensors(tensors);
      }
    }
    checkAbort(signal);
    return accountFactualStoryBeatFormTargetsV2(facts, observations);
  };

  return Object.freeze({
    async countInput(
      facts: FactualStoryBeatPublicFactsV2,
      signal?: AbortSignal,
    ): Promise<number> {
      const tokenized = await tokenizeFacts(facts, signal);
      try {
        return tokenized.count;
      } finally {
        disposeTensors(tokenized.tensors);
      }
    },

    async author(
      facts: FactualStoryBeatPublicFactsV2,
      options: {
        readonly maximumOutputTokens: typeof factualStoryBeatMaximumOutputTokens;
        readonly signal: AbortSignal;
      },
    ): Promise<FactualStoryBeatDecodedCandidateV2> {
      checkAbort(options.signal);
      if (options.maximumOutputTokens !== factualStoryBeatMaximumOutputTokens) {
        throw new TypeError("Factual story-beat output-token limit is invalid");
      }
      const sequenceSlot = nextPresentationSlot;
      const eligibility = selectFactualStoryBeatFormEligibilityV2(
        facts,
        sequenceSlot,
      );
      nextPresentationSlot = (
        nextPresentationSlot + 1
      ) % factualStoryBeatPresentationBucketIdsV2.length;
      if (eligibility.selectedBucketId === null || eligibility.forms.length === 0) {
        throw new TypeError("Factual story-beat has no eligible presentation bucket");
      }
      const tokenized = await tokenizeFacts(facts, options.signal);
      let generatedTensors: readonly FactualStoryBeatTransformersTensorV2[] =
        Object.freeze([]);
      try {
        const targetSet = await tokenizeTargets(
          facts,
          eligibility.forms,
          options.signal,
        );
        const logitsProcessor = createFactualStoryBeatTrieLogitsProcessorV2(
          facts,
          targetSet,
        );
        const generated = await model.generate(
          tokenized.inputs,
          factualStoryBeatGenerationOptionsV2,
          logitsProcessor,
        );
        generatedTensors = disposableTensors(generated);
        try {
          checkAbort(options.signal);
          const accounted = accountGeneratedTokens(generated);
          const selection = logitsProcessor.finalize([
            factualStoryBeatGenerationOptionsV2.decoder_start_token_id,
            ...accounted.tokenIds,
          ]);
          const decoded = tokenizer.decode(
            accounted.tokenIds,
            factualStoryBeatTargetDecodeOptionsV2,
          );
          checkAbort(options.signal);
          if (typeof decoded !== "string") {
            throw new TypeError("Factual story-beat tokenizer returned non-text decode");
          }
          const selectedTarget = targetSet.targets.find(
            (target) => target.formId === selection.formId,
          );
          if (selectedTarget === undefined
            || decoded !== selectedTarget.text
            || validateFactualStoryBeatResultV2(decoded, facts) !== decoded) {
            throw new TypeError(
              "Factual story-beat generated decode does not match its grounded form",
            );
          }
          return deepFreeze({
            text: decoded,
            outputTokens: accounted.outputTokens,
            sequenceSlot,
            presentationBucketId: eligibility.selectedBucketId,
            formId: selection.formId,
          });
        } finally {
          const tensorsToDispose = generatedTensors;
          generatedTensors = Object.freeze([]);
          disposeTensors(tensorsToDispose);
        }
      } finally {
        disposeTensors([...tokenized.tensors, ...generatedTensors]);
      }
    },
  });
}
