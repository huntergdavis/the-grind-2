import {
  liveNarratorInputTokenizerOptions,
  liveNarratorTargetDecodeOptions,
} from "./live-form-selection";
import {
  formatStoryBeatPromptV1,
  isStoryBeatPublicFactsV1,
  storyBeatMaximumInputTokens,
  storyBeatMaximumOutputTokens,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const storyBeatInputTokenizerOptions = liveNarratorInputTokenizerOptions;
export const storyBeatTargetDecodeOptions = liveNarratorTargetDecodeOptions;
export const storyBeatGenerationOptions = deepFreeze({
  do_sample: false as const,
  num_beams: 1 as const,
  num_return_sequences: 1 as const,
  max_new_tokens: storyBeatMaximumOutputTokens,
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

export interface StoryBeatTransformersTensor {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number | bigint>;
  dispose(): void;
}

export type StoryBeatTransformersInputs =
  Readonly<Record<string, StoryBeatTransformersTensor>>;

export interface StoryBeatTransformersTokenizerPort {
  tokenize(
    text: string,
    options: typeof storyBeatInputTokenizerOptions,
  ): Promise<unknown> | unknown;
  decode(
    tokenIds: readonly number[],
    options: typeof storyBeatTargetDecodeOptions,
  ): unknown;
}

export interface StoryBeatTransformersModelPort {
  generate(
    inputs: StoryBeatTransformersInputs,
    options: typeof storyBeatGenerationOptions,
  ): Promise<unknown>;
}

export interface StoryBeatDecodedCandidateV1 {
  readonly text: string;
  readonly outputTokens: number;
}

export interface StoryBeatTransformersAdapter {
  countInput(facts: StoryBeatPublicFactsV1, signal?: AbortSignal): Promise<number>;
  author(
    facts: StoryBeatPublicFactsV1,
    options: {
      readonly maximumOutputTokens: typeof storyBeatMaximumOutputTokens;
      readonly signal: AbortSignal;
    },
  ): Promise<StoryBeatDecodedCandidateV1>;
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

function isTensor(value: unknown): value is StoryBeatTransformersTensor {
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
    throw new TypeError("Story-beat tokenizer tensor is invalid or over budget");
  }
  const result: number[] = [];
  for (let index = 0; index < value.data.length; index += 1) {
    const token = value.data[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError("Story-beat tensor contains an invalid token id");
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || Number(token) < 0) {
        throw new TypeError("Story-beat tensor contains an invalid token id");
      }
      result.push(Number(token));
    }
  }
  return Object.freeze(result);
}

function disposableTensors(value: unknown): readonly StoryBeatTransformersTensor[] {
  if (isTensor(value)) return Object.freeze([value]);
  if (!isRecord(value)) return Object.freeze([]);
  const tensors: StoryBeatTransformersTensor[] = [];
  const seen = new Set<StoryBeatTransformersTensor>();
  for (const child of Object.values(value)) {
    if (isTensor(child) && !seen.has(child)) {
      seen.add(child);
      tensors.push(child);
    }
  }
  return Object.freeze(tensors);
}

function disposeTensors(tensors: readonly StoryBeatTransformersTensor[]): void {
  let firstError: unknown = null;
  const seen = new Set<StoryBeatTransformersTensor>();
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

function tokenizedInputs(value: unknown): StoryBeatTransformersInputs {
  if (!isRecord(value)
    || !Object.hasOwn(value, "input_ids")
    || Object.keys(value).length === 0
    || !Object.values(value).every(isTensor)) {
    throw new TypeError("Story-beat tokenizer output is invalid");
  }
  return value as StoryBeatTransformersInputs;
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function accountGeneratedTokens(value: unknown): {
  readonly tokenIds: readonly number[];
  readonly outputTokens: number;
} {
  const fullSequence = tokenSequence(value, storyBeatMaximumOutputTokens + 1);
  if (fullSequence[0] !== storyBeatGenerationOptions.decoder_start_token_id) {
    throw new TypeError("Story-beat generated ids must begin with decoder-start");
  }
  const tokenIds = fullSequence.slice(1);
  if (tokenIds.length === 0) {
    throw new RangeError("Story-beat generated ids are empty");
  }
  const eosIndex = tokenIds.indexOf(storyBeatGenerationOptions.eos_token_id);
  if (eosIndex >= 0 && eosIndex !== tokenIds.length - 1) {
    throw new TypeError("Story-beat generated ids contain data after EOS");
  }
  if (eosIndex < 0 && tokenIds.length !== storyBeatMaximumOutputTokens) {
    throw new TypeError("Story-beat generation stopped before EOS or its token limit");
  }
  return Object.freeze({
    tokenIds: Object.freeze(tokenIds),
    outputTokens: tokenIds.length,
  });
}

export function createStoryBeatTransformersAdapter(
  tokenizer: StoryBeatTransformersTokenizerPort,
  model: StoryBeatTransformersModelPort,
): StoryBeatTransformersAdapter {
  const tokenizeFacts = async (
    facts: StoryBeatPublicFactsV1,
    signal?: AbortSignal,
  ): Promise<{
    readonly inputs: StoryBeatTransformersInputs;
    readonly tensors: readonly StoryBeatTransformersTensor[];
    readonly count: number;
  }> => {
    checkAbort(signal);
    if (!isStoryBeatPublicFactsV1(facts)) {
      throw new TypeError("Story-beat public facts are invalid");
    }
    const prompt = formatStoryBeatPromptV1(facts);
    if (prompt === null) throw new TypeError("Story-beat prompt could not be formatted");
    const tokenized = await tokenizer.tokenize(prompt, storyBeatInputTokenizerOptions);
    const tensors = disposableTensors(tokenized);
    try {
      checkAbort(signal);
      const inputs = tokenizedInputs(tokenized);
      const inputIds = tokenSequence(inputs.input_ids, storyBeatMaximumInputTokens);
      if (inputIds.length === 0 || inputIds.at(-1) !== 1) {
        throw new TypeError("Story-beat input token sequence must end in EOS");
      }
      return { inputs, tensors, count: inputIds.length };
    } catch (error) {
      disposeTensors(tensors);
      throw error;
    }
  };

  return Object.freeze({
    async countInput(facts: StoryBeatPublicFactsV1, signal?: AbortSignal): Promise<number> {
      const tokenized = await tokenizeFacts(facts, signal);
      try {
        return tokenized.count;
      } finally {
        disposeTensors(tokenized.tensors);
      }
    },

    async author(
      facts: StoryBeatPublicFactsV1,
      options: {
        readonly maximumOutputTokens: typeof storyBeatMaximumOutputTokens;
        readonly signal: AbortSignal;
      },
    ): Promise<StoryBeatDecodedCandidateV1> {
      checkAbort(options.signal);
      if (options.maximumOutputTokens !== storyBeatMaximumOutputTokens) {
        throw new TypeError("Story-beat output-token limit is invalid");
      }
      const tokenized = await tokenizeFacts(facts, options.signal);
      let generatedTensors: readonly StoryBeatTransformersTensor[] = Object.freeze([]);
      try {
        const generated = await model.generate(tokenized.inputs, storyBeatGenerationOptions);
        generatedTensors = disposableTensors(generated);
        try {
          checkAbort(options.signal);
          const accounted = accountGeneratedTokens(generated);
          const decoded = tokenizer.decode(accounted.tokenIds, storyBeatTargetDecodeOptions);
          checkAbort(options.signal);
          if (typeof decoded !== "string") {
            throw new TypeError("Story-beat tokenizer returned a non-text decode");
          }
          return Object.freeze({
            text: decoded,
            outputTokens: accounted.outputTokens,
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
