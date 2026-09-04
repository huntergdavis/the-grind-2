import {
  countLiveNarratorFormInputTokenIds,
  createLiveNarratorTrieLogitsProcessor,
  formatLiveNarratorFormPrompt,
  liveNarratorFormIds,
  liveNarratorForms,
  liveNarratorGenerationOptions,
  liveNarratorInputTokenizerOptions,
  liveNarratorTargetDecodeOptions,
  liveNarratorTargetTokenizerOptions,
  renderLiveNarratorForm,
  type LiveNarratorTrieLogitsProcessor,
} from "./live-form-selection";
import { isSafeLiveNarration } from "./live-output-policy";
import {
  isNarratorPromptV1,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  type NarratorPromptV1,
} from "./protocol";

export interface LiveNarratorTransformersTensor {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number | bigint>;
  dispose(): void;
}

export type LiveNarratorTransformersInputs =
  Readonly<Record<string, LiveNarratorTransformersTensor>>;

export interface LiveNarratorTransformersTokenizerPort {
  tokenize(
    text: string,
    options: typeof liveNarratorInputTokenizerOptions,
  ): Promise<unknown> | unknown;
  decode(
    tokenIds: readonly number[],
    options: typeof liveNarratorTargetDecodeOptions,
  ): unknown;
  dispose?(): Promise<void> | void;
}

export interface LiveNarratorTransformersModelPort {
  generate(
    inputs: LiveNarratorTransformersInputs,
    options: typeof liveNarratorGenerationOptions,
    logitsProcessor: LiveNarratorTrieLogitsProcessor,
  ): Promise<unknown>;
  dispose(): Promise<void> | void;
}

export interface LiveNarratorTransformersAdapter {
  verifyPinnedTokenizer(signal: AbortSignal): Promise<void>;
  countInput(prompt: NarratorPromptV1, signal?: AbortSignal): Promise<number>;
  countOutput(text: string, signal?: AbortSignal): Promise<number>;
  realize(
    prompt: NarratorPromptV1,
    options: {
      readonly maximumOutputTokens: 48;
      readonly signal: AbortSignal;
    },
  ): Promise<string>;
  dispose(): Promise<void>;
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

function isTensor(value: unknown): value is LiveNarratorTransformersTensor {
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
    throw new TypeError("Live narrator tokenizer tensor is invalid or over budget");
  }
  const result: number[] = [];
  for (let index = 0; index < value.data.length; index += 1) {
    const token = value.data[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError("Live narrator tensor contains an invalid token id");
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || Number(token) < 0) {
        throw new TypeError("Live narrator tensor contains an invalid token id");
      }
      result.push(Number(token));
    }
  }
  return Object.freeze(result);
}

function disposableTensors(value: unknown): readonly LiveNarratorTransformersTensor[] {
  if (isTensor(value)) return Object.freeze([value]);
  if (!isRecord(value)) return Object.freeze([]);
  const tensors: LiveNarratorTransformersTensor[] = [];
  const seen = new Set<LiveNarratorTransformersTensor>();
  for (const child of Object.values(value)) {
    if (isTensor(child) && !seen.has(child)) {
      seen.add(child);
      tensors.push(child);
    }
  }
  return Object.freeze(tensors);
}

function disposeTensors(tensors: readonly LiveNarratorTransformersTensor[]): void {
  let firstError: unknown = null;
  const seen = new Set<LiveNarratorTransformersTensor>();
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

function tokenizedInputs(value: unknown): LiveNarratorTransformersInputs {
  if (!isRecord(value)
    || !Object.hasOwn(value, "input_ids")
    || Object.keys(value).length === 0
    || !Object.values(value).every(isTensor)) {
    throw new TypeError("Live narrator tokenizer output is invalid");
  }
  return value as LiveNarratorTransformersInputs;
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function exactTokens(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((tokenId, index) => tokenId === right[index]);
}

function tokenizerVerificationPrompts(): readonly NarratorPromptV1[] {
  return Object.freeze([
    {
      schemaVersion: 1,
      task: "single-ambient-line",
      voice: "spare-observer-v1",
      move: "establish-setting",
      facts: {
        schemaVersion: 1,
        kind: "public-scene",
        sceneKind: "travel",
        place: "PLACE",
        energy: "steady",
      },
    },
    {
      schemaVersion: 1,
      task: "single-ambient-line",
      voice: "spare-observer-v1",
      move: "shade-atmosphere",
      facts: {
        schemaVersion: 1,
        kind: "public-scene",
        sceneKind: "camp",
        place: "PLACE",
        energy: "steady",
      },
    },
    {
      schemaVersion: 1,
      task: "single-ambient-line",
      voice: "hero-aside-v1",
      move: "register-pressure",
      facts: {
        schemaVersion: 1,
        kind: "public-scene",
        sceneKind: "battle",
        place: "PLACE",
        energy: "steady",
      },
    },
  ]);
}

export function createLiveNarratorTransformersAdapter(
  tokenizer: LiveNarratorTransformersTokenizerPort,
  model: LiveNarratorTransformersModelPort,
): LiveNarratorTransformersAdapter {
  let disposed = false;
  const requireActive = (signal?: AbortSignal): void => {
    if (disposed) throw new Error("Live narrator Transformers adapter is disposed");
    checkAbort(signal);
  };

  const countText = async (
    text: string,
    options: typeof liveNarratorInputTokenizerOptions,
    maximumTokens: number,
    signal?: AbortSignal,
  ): Promise<{ readonly count: number; readonly tokenIds: readonly number[] }> => {
    requireActive(signal);
    const tokenized = await tokenizer.tokenize(text, options);
    const tensors = disposableTensors(tokenized);
    try {
      requireActive(signal);
      const inputs = tokenizedInputs(tokenized);
      const ids = tokenSequence(inputs.input_ids, maximumTokens);
      if (ids.length === 0 || ids.at(-1) !== 1) {
        throw new TypeError("Live narrator token sequence must end in EOS");
      }
      return Object.freeze({ count: ids.length, tokenIds: ids });
    } finally {
      disposeTensors(tensors);
    }
  };

  return Object.freeze({
    async verifyPinnedTokenizer(signal: AbortSignal): Promise<void> {
      requireActive(signal);
      const observed = new Set<string>();
      for (const prompt of tokenizerVerificationPrompts()) {
        for (const form of liveNarratorForms(prompt)) {
          if (observed.has(form.formId)) continue;
          observed.add(form.formId);
          const tokenized = await countText(
            form.witness,
            liveNarratorTargetTokenizerOptions,
            narratorMaximumOutputTokens,
            signal,
          );
          requireActive(signal);
          if (!exactTokens(tokenized.tokenIds, form.targetTokenIds)
            || tokenizer.decode(
              [...tokenized.tokenIds],
              liveNarratorTargetDecodeOptions,
            ) !== form.witness) {
            throw new TypeError("Live narrator tokenizer does not match the pinned form catalog");
          }
        }
      }
      if (observed.size !== liveNarratorFormIds.length) {
        throw new TypeError("Live narrator tokenizer verification did not cover every form");
      }
    },

    async countInput(prompt: NarratorPromptV1, signal?: AbortSignal): Promise<number> {
      if (!isNarratorPromptV1(prompt)) throw new TypeError("Live narrator prompt is invalid");
      const tokenized = await countText(
        formatLiveNarratorFormPrompt(prompt),
        liveNarratorInputTokenizerOptions,
        narratorMaximumInputTokens,
        signal,
      );
      return countLiveNarratorFormInputTokenIds(tokenized.tokenIds);
    },

    async countOutput(text: string, signal?: AbortSignal): Promise<number> {
      const tokenized = await countText(
        text,
        liveNarratorTargetTokenizerOptions,
        narratorMaximumOutputTokens,
        signal,
      );
      return tokenized.count;
    },

    async realize(
      prompt: NarratorPromptV1,
      options: {
        readonly maximumOutputTokens: 48;
        readonly signal: AbortSignal;
      },
    ): Promise<string> {
      requireActive(options.signal);
      if (!isNarratorPromptV1(prompt)
        || options.maximumOutputTokens !== narratorMaximumOutputTokens) {
        throw new TypeError("Live narrator realization request is invalid");
      }
      const tokenized = await tokenizer.tokenize(
        formatLiveNarratorFormPrompt(prompt),
        liveNarratorInputTokenizerOptions,
      );
      const inputTensors = disposableTensors(tokenized);
      let generatedTensors: readonly LiveNarratorTransformersTensor[] = Object.freeze([]);
      try {
        requireActive(options.signal);
        const inputs = tokenizedInputs(tokenized);
        countLiveNarratorFormInputTokenIds(
          tokenSequence(inputs.input_ids, narratorMaximumInputTokens),
        );
        const processor = createLiveNarratorTrieLogitsProcessor(prompt);
        const generated = await model.generate(
          inputs,
          liveNarratorGenerationOptions,
          processor,
        );
        generatedTensors = disposableTensors(generated);
        try {
          requireActive(options.signal);
          const fullDecoderTokenIds = tokenSequence(
            generated,
            narratorMaximumOutputTokens + 1,
          );
          const selection = processor.finalize(fullDecoderTokenIds);
          const text = renderLiveNarratorForm(prompt, selection.formId);
          if (!isSafeLiveNarration(text, prompt)) {
            throw new TypeError("Live narrator rendered form failed the output policy");
          }
          return text;
        } finally {
          disposeTensors(generatedTensors);
          generatedTensors = Object.freeze([]);
        }
      } finally {
        disposeTensors([...inputTensors, ...generatedTensors]);
      }
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      let firstError: unknown = null;
      try {
        await model.dispose();
      } catch (error) {
        firstError = error;
      }
      try {
        await tokenizer.dispose?.();
      } catch (error) {
        firstError ??= error;
      }
      if (firstError !== null) throw firstError;
    },
  });
}
