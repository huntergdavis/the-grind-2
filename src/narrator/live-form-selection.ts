import { canonicalStringify } from "../core/canonical";
import {
  allowedNarratorLines,
  deterministicNarratorFallback,
} from "./output-policy";
import {
  isNarratorPromptV1,
  narratorMaximumInputTokens,
  narratorMaximumOutputTokens,
  type NarratorMoveV1,
} from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const liveNarratorFormIds = Object.freeze([
  "establish-holds",
  "establish-gathers",
  "establish-waits",
  "shade-holds-baseline",
  "shade-rests",
  "shade-settles",
  "shade-lingers",
  "pressure-attention",
  "pressure-feel",
  "pressure-close",
] as const);

export type LiveNarratorFormId = typeof liveNarratorFormIds[number];

export interface LiveNarratorFormDescriptor {
  readonly formId: LiveNarratorFormId;
  readonly move: NarratorMoveV1;
  readonly witness: string;
  readonly targetTokenIds: readonly number[];
  readonly baseline: boolean;
  readonly allowedLineIndex: 0 | 1 | 2 | null;
}

const forms = deepFreeze([
  {
    formId: "establish-holds",
    move: "establish-setting",
    witness: "PLACE holds a ENERGY moment.",
    targetTokenIds: [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    baseline: true,
    allowedLineIndex: null,
  },
  {
    formId: "establish-gathers",
    move: "establish-setting",
    witness: "A ENERGY moment gathers at PLACE.",
    targetTokenIds: [71, 3, 25576, 12912, 476, 798, 7479, 7, 44, 17501, 4770, 5, 1],
    baseline: false,
    allowedLineIndex: 1,
  },
  {
    formId: "establish-waits",
    move: "establish-setting",
    witness: "PLACE waits within a ENERGY moment.",
    targetTokenIds: [17501, 4770, 1749, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    baseline: false,
    allowedLineIndex: 2,
  },
  {
    formId: "shade-holds-baseline",
    move: "shade-atmosphere",
    witness: "PLACE holds a ENERGY moment.",
    targetTokenIds: [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    baseline: true,
    allowedLineIndex: null,
  },
  {
    formId: "shade-rests",
    move: "shade-atmosphere",
    witness: "PLACE rests within a ENERGY moment.",
    targetTokenIds: [17501, 4770, 880, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    baseline: false,
    allowedLineIndex: 0,
  },
  {
    formId: "shade-settles",
    move: "shade-atmosphere",
    witness: "A ENERGY moment settles over PLACE.",
    targetTokenIds: [71, 3, 25576, 12912, 476, 798, 8955, 7, 147, 17501, 4770, 5, 1],
    baseline: false,
    allowedLineIndex: 1,
  },
  {
    formId: "shade-lingers",
    move: "shade-atmosphere",
    witness: "The ENERGY moment lingers at PLACE.",
    targetTokenIds: [37, 3, 25576, 12912, 476, 798, 3, 14043, 7, 44, 17501, 4770, 5, 1],
    baseline: false,
    allowedLineIndex: 2,
  },
  {
    formId: "pressure-attention",
    move: "register-pressure",
    witness: "This ENERGY moment has my attention.",
    targetTokenIds: [100, 3, 25576, 12912, 476, 798, 65, 82, 1388, 5, 1],
    baseline: true,
    allowedLineIndex: null,
  },
  {
    formId: "pressure-feel",
    move: "register-pressure",
    witness: "I feel this ENERGY moment.",
    targetTokenIds: [27, 473, 48, 3, 25576, 12912, 476, 798, 5, 1],
    baseline: false,
    allowedLineIndex: 1,
  },
  {
    formId: "pressure-close",
    move: "register-pressure",
    witness: "This ENERGY moment feels close.",
    targetTokenIds: [100, 3, 25576, 12912, 476, 798, 4227, 885, 5, 1],
    baseline: false,
    allowedLineIndex: 2,
  },
] as const satisfies readonly LiveNarratorFormDescriptor[]);

export const liveNarratorFormPromptInstruction =
  "Select the most fitting safe ambient narration form for this scene." as const;

export const liveNarratorInputTokenizerOptions = deepFreeze({
  add_special_tokens: true as const,
  padding: false as const,
  truncation: false as const,
  return_tensor: true as const,
});

export const liveNarratorTargetTokenizerOptions = deepFreeze({
  ...liveNarratorInputTokenizerOptions,
});

export const liveNarratorTargetDecodeOptions = deepFreeze({
  skip_special_tokens: true as const,
  clean_up_tokenization_spaces: false as const,
});

export const liveNarratorGenerationOptions = deepFreeze({
  do_sample: false as const,
  num_beams: 1 as const,
  num_return_sequences: 1 as const,
  max_new_tokens: narratorMaximumOutputTokens,
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

export const liveNarratorDecoderStartTokenId = 0 as const;
export const liveNarratorEosTokenId = 1 as const;

export function isLiveNarratorFormId(value: unknown): value is LiveNarratorFormId {
  return typeof value === "string"
    && (liveNarratorFormIds as readonly string[]).includes(value);
}

function descriptorForId(formId: LiveNarratorFormId): LiveNarratorFormDescriptor {
  const descriptor = forms.find((candidate) => candidate.formId === formId);
  if (descriptor === undefined) throw new TypeError("Live narrator form id is invalid");
  return descriptor;
}

export function liveNarratorForms(prompt: unknown): readonly LiveNarratorFormDescriptor[] {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Live narrator prompt is invalid");
  return Object.freeze(forms.filter((form) => form.move === prompt.move));
}

export function formatLiveNarratorFormPrompt(prompt: unknown): string {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Live narrator prompt is invalid");
  return `${liveNarratorFormPromptInstruction}\n${canonicalStringify({
    schemaVersion: 3,
    prompt,
  })}`;
}

export function formatLiveNarratorFormPromptUtf8(prompt: unknown): Uint8Array {
  return new TextEncoder().encode(formatLiveNarratorFormPrompt(prompt));
}

export function renderLiveNarratorForm(prompt: unknown, formId: unknown): string {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Live narrator prompt is invalid");
  if (!isLiveNarratorFormId(formId)) throw new TypeError("Live narrator form id is invalid");
  const descriptor = descriptorForId(formId);
  if (descriptor.move !== prompt.move) {
    throw new TypeError("Live narrator form does not belong to the prompt move");
  }
  if (descriptor.baseline) return deterministicNarratorFallback(prompt);
  if (descriptor.allowedLineIndex === null) {
    throw new TypeError("Live narrator nonbaseline form is missing its output-policy mapping");
  }
  const rendered = allowedNarratorLines(prompt)[descriptor.allowedLineIndex];
  if (rendered === undefined) {
    throw new TypeError("Live narrator output policy is missing the selected form");
  }
  return rendered;
}

export type LiveNarratorTokenIdSequence = ArrayLike<number | bigint>;

function copyTokenIds(
  value: unknown,
  label: string,
  maximumLength: number,
): readonly number[] {
  if (typeof value !== "object"
    || value === null
    || !(Array.isArray(value) || ArrayBuffer.isView(value))) {
    throw new TypeError(`${label} must be an array-like token-id sequence`);
  }
  const sequence = value as unknown as LiveNarratorTokenIdSequence;
  if (!Number.isSafeInteger(sequence.length) || sequence.length < 0) {
    throw new TypeError(`${label} must have a valid length`);
  }
  if (sequence.length > maximumLength) {
    throw new RangeError(`${label} exceeds the token-id sequence budget`);
  }
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== sequence.length
    || !ownKeys.every((key, index) => key === String(index))) {
    throw new TypeError(`${label} must be dense and contain no extra properties`);
  }
  const result: number[] = [];
  for (let index = 0; index < sequence.length; index += 1) {
    const token = sequence[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError(`${label} contains an invalid token id`);
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || Number(token) < 0) {
        throw new TypeError(`${label} contains an invalid token id`);
      }
      result.push(Number(token));
    }
  }
  return Object.freeze(result);
}

function exactNumberArray(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length
    && left.every((tokenId, index) => tokenId === right[index]);
}

export function liveNarratorAllowedTokenIds(
  prompt: unknown,
  prefixTokenIds: LiveNarratorTokenIdSequence,
): readonly number[] {
  const eligibleForms = liveNarratorForms(prompt);
  const prefix = copyTokenIds(
    prefixTokenIds,
    "Live narrator trie prefix",
    narratorMaximumOutputTokens,
  );
  const matching = eligibleForms.filter((form) =>
    prefix.length < form.targetTokenIds.length
    && prefix.every((tokenId, index) => form.targetTokenIds[index] === tokenId));
  if (matching.length === 0) {
    throw new TypeError("Live narrator trie prefix does not match an incomplete eligible form");
  }
  return Object.freeze([...new Set(
    matching.map((form) => form.targetTokenIds[prefix.length]!),
  )].sort((left, right) => left - right));
}

export interface LiveNarratorLogitsTensor {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

export interface LiveNarratorFormSelection {
  readonly formId: LiveNarratorFormId;
  readonly generatedTokenIds: readonly number[];
}

export interface LiveNarratorTrieLogitsProcessor {
  process(inputIds: unknown, logits: LiveNarratorLogitsTensor): LiveNarratorLogitsTensor;
  finalize(fullDecoderTokenIds: LiveNarratorTokenIdSequence): LiveNarratorFormSelection;
}

function isDenseNonNegativeIntegerArray(value: unknown): value is readonly number[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length
    && keys.every((key, index) => key === String(index))
    && value.every((entry) => Number.isSafeInteger(entry) && entry >= 0);
}

function copyDecoderInputIds(value: unknown): readonly number[] {
  if (!Array.isArray(value)
    || Object.keys(value).length !== 1
    || Object.keys(value)[0] !== "0") {
    throw new TypeError("Live narrator logits processor requires one dense decoder batch");
  }
  const decoderIds = copyTokenIds(
    value[0],
    "Live narrator decoder input ids",
    narratorMaximumOutputTokens + 1,
  );
  if (decoderIds.length === 0
    || decoderIds[0] !== liveNarratorDecoderStartTokenId) {
    throw new TypeError("Live narrator decoder input is missing its decoder-start token");
  }
  return decoderIds;
}

function assertLogitsTensor(value: unknown): asserts value is LiveNarratorLogitsTensor {
  if (typeof value !== "object"
    || value === null
    || !("dims" in value)
    || !("data" in value)
    || !isDenseNonNegativeIntegerArray(value.dims)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || !(value.data instanceof Float32Array)
    || value.dims[1] !== value.data.length) {
    throw new TypeError("Live narrator logits tensor is invalid");
  }
}

export function createLiveNarratorTrieLogitsProcessor(
  prompt: unknown,
): LiveNarratorTrieLogitsProcessor {
  const eligibleForms = liveNarratorForms(prompt);
  liveNarratorAllowedTokenIds(prompt, Object.freeze([]));
  let previousPrefix: readonly number[] | null = null;
  let previousExpectedTokenId: number | null = null;
  const expectedGeneratedTokenIds: number[] = [];
  let finalized = false;

  return Object.freeze({
    process(inputIds: unknown, logits: LiveNarratorLogitsTensor): LiveNarratorLogitsTensor {
      if (finalized) throw new TypeError("Live narrator form selection is already finalized");
      const decoderIds = copyDecoderInputIds(inputIds);
      const prefix = Object.freeze(decoderIds.slice(1));
      if (previousPrefix === null) {
        if (prefix.length !== 0) {
          throw new TypeError("Live narrator decoder prefix must begin at the trie root");
        }
      } else {
        if (prefix.length !== previousPrefix.length + 1
          || !exactNumberArray(prefix.slice(0, -1), previousPrefix)) {
          throw new TypeError("Live narrator decoder prefix is not the next trie step");
        }
        if (prefix.at(-1) !== previousExpectedTokenId) {
          throw new TypeError("Live narrator decoder did not emit the unique maximum token");
        }
      }

      assertLogitsTensor(logits);
      const allowedTokenIds = liveNarratorAllowedTokenIds(prompt, prefix);
      if (allowedTokenIds.some((tokenId) => tokenId >= logits.data.length)) {
        throw new RangeError("Live narrator allowed token is outside the logits vocabulary");
      }
      const allowedScores = allowedTokenIds.map((tokenId) => logits.data[tokenId]!);
      if (allowedScores.some((score) => !Number.isFinite(score))) {
        throw new TypeError("Live narrator allowed token scores must be finite");
      }
      const maximum = Math.max(...allowedScores);
      const maximumIndexes = allowedScores.flatMap((score, index) =>
        score === maximum ? [index] : []);
      if (maximumIndexes.length !== 1) {
        throw new TypeError("Live narrator form selection has an exact top-score tie");
      }
      const expectedTokenId = allowedTokenIds[maximumIndexes[0]!]!;

      const allowedSet = new Set(allowedTokenIds);
      for (let tokenId = 0; tokenId < logits.data.length; tokenId += 1) {
        if (!allowedSet.has(tokenId)) logits.data[tokenId] = Number.NEGATIVE_INFINITY;
      }
      previousPrefix = prefix;
      previousExpectedTokenId = expectedTokenId;
      expectedGeneratedTokenIds.push(expectedTokenId);
      return logits;
    },

    finalize(fullDecoderTokenIds: LiveNarratorTokenIdSequence): LiveNarratorFormSelection {
      if (finalized) throw new TypeError("Live narrator form selection is already finalized");
      finalized = true;
      const fullSequence = copyTokenIds(
        fullDecoderTokenIds,
        "Live narrator full decoder ids",
        narratorMaximumOutputTokens + 1,
      );
      if (fullSequence[0] !== liveNarratorDecoderStartTokenId) {
        throw new TypeError("Live narrator full decoder ids must begin with the decoder-start token");
      }
      const generatedTokenIds = Object.freeze(fullSequence.slice(1));
      if (generatedTokenIds.length === 0) {
        throw new TypeError("Live narrator generated token sequence is empty");
      }
      if (generatedTokenIds.at(-1) !== liveNarratorEosTokenId
        || generatedTokenIds.slice(0, -1).includes(liveNarratorEosTokenId)) {
        throw new TypeError("Live narrator generated ids must contain EOS exactly once at the end");
      }
      if (!exactNumberArray(generatedTokenIds, expectedGeneratedTokenIds)) {
        throw new TypeError("Live narrator generated ids do not match the unique maximum trie path");
      }
      const selected = eligibleForms.filter((form) =>
        exactNumberArray(form.targetTokenIds, generatedTokenIds));
      if (selected.length !== 1) {
        throw new TypeError("Live narrator generation does not complete exactly one eligible form");
      }
      return deepFreeze({
        formId: selected[0]!.formId,
        generatedTokenIds: [...generatedTokenIds],
      });
    },
  });
}

export function countLiveNarratorFormInputTokenIds(
  inputIds: LiveNarratorTokenIdSequence,
): number {
  const ids = copyTokenIds(
    inputIds,
    "Live narrator input ids",
    narratorMaximumInputTokens,
  );
  if (ids.length === 0 || ids.at(-1) !== liveNarratorEosTokenId) {
    throw new TypeError("Live narrator input ids must end with the tokenizer-added EOS token");
  }
  return ids.length;
}
