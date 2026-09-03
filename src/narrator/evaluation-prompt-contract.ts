import { canonicalHash, canonicalStringify } from "../core/canonical";
import { allowedNarratorLines, narratorOutputPolicyVersion } from "./output-policy";
import {
  isNarratorPromptV1,
  narratorMaximumInputTokens,
  narratorMaximumOutputCharacters,
  narratorMaximumOutputTokens,
} from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const narratorPromptFormatterContractV2 = deepFreeze({
  schemaVersion: 2 as const,
  contractId: "the-grind-2:narrator-prompt:v2" as const,
  characterEncoding: "UTF-8" as const,
  byteOrderMark: "forbidden" as const,
  instructionLine: "Return exactly one value from allowedOutputs, without JSON quoting or any other text." as const,
  lineSeparator: "LF" as const,
  trailingLineSeparator: false as const,
  payload: {
    serialization: "the-grind-2-canonical-json-v1" as const,
    objectKeyOrder: "lexicographic" as const,
    stringEscaping: "JSON" as const,
    schemaVersion: 2 as const,
    exactKeys: ["allowedOutputs", "prompt", "responseFormat", "schemaVersion"] as const,
    promptProjection: "exact-validated-NarratorPromptV1" as const,
    allowedOutputs: {
      source: "allowedNarratorLines" as const,
      policyVersion: narratorOutputPolicyVersion,
      order: "policy-order" as const,
      requiredCount: 3 as const,
    },
    responseFormat: "one-allowed-output-verbatim" as const,
  },
});

export const narratorPromptFormatterHashV2 = canonicalHash(narratorPromptFormatterContractV2);

export function formatNarratorPromptV2(prompt: unknown): string {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  const allowedOutputs = allowedNarratorLines(prompt);
  if (allowedOutputs.length !== narratorPromptFormatterContractV2.payload.allowedOutputs.requiredCount) {
    throw new TypeError("Narrator output policy did not produce exactly three lines");
  }
  const payload = {
    allowedOutputs,
    prompt,
    responseFormat: narratorPromptFormatterContractV2.payload.responseFormat,
    schemaVersion: narratorPromptFormatterContractV2.payload.schemaVersion,
  };
  return `${narratorPromptFormatterContractV2.instructionLine}\n${canonicalStringify(payload)}`;
}

export function formatNarratorPromptUtf8V2(prompt: unknown): Uint8Array {
  return new TextEncoder().encode(formatNarratorPromptV2(prompt));
}

export const narratorDecodingConfigurationV2 = deepFreeze({
  schemaVersion: 2 as const,
  contractId: "the-grind-2:narrator-token-accounting:v2" as const,
  runtime: {
    package: "@huggingface/transformers" as const,
    version: "4.2.0" as const,
    integrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==" as const,
    sourceRevision: "54652ba3366ccd1e3b64e689a96504309e6fb53b" as const,
  },
  input: {
    batchSize: 1 as const,
    tokenizerOptions: {
      add_special_tokens: true as const,
      padding: false as const,
      truncation: false as const,
      return_tensor: true as const,
    },
    maximumLengthOption: "omitted" as const,
    maximumInputTokens: narratorMaximumInputTokens,
    padTokenId: 0 as const,
    eosTokenId: 1 as const,
    terminalEosRequired: true as const,
    countPolicy: "all-input-ids-including-terminal-eos" as const,
  },
  generation: {
    method: "greedy" as const,
    options: {
      do_sample: false as const,
      num_beams: 1 as const,
      num_return_sequences: 1 as const,
      max_new_tokens: narratorMaximumOutputTokens,
      return_dict_in_generate: false as const,
    },
    decoderStartTokenId: 0 as const,
    padTokenId: 0 as const,
    eosTokenId: 1 as const,
    stopPolicy: "first-eos-or-exactly-48-new-tokens" as const,
  },
  output: {
    sequencePolicy: "one-full-decoder-sequence" as const,
    decoderStartPolicy: "require-and-remove-exactly-one-leading-id" as const,
    countPolicy: "all-remaining-generated-ids-including-terminal-eos" as const,
    maximumOutputTokens: narratorMaximumOutputTokens,
    decodeOptions: {
      skip_special_tokens: true as const,
      clean_up_tokenization_spaces: false as const,
    },
    normalization: {
      inputType: "string-required" as const,
      unicode: "NFC" as const,
      whitespacePattern: "\\s+" as const,
      whitespaceFlags: "gu" as const,
      whitespaceReplacement: "ASCII-space" as const,
      trim: true as const,
      maximumOutputCharacters: narratorMaximumOutputCharacters,
      boundedTextPostcondition: {
        nonEmpty: true as const,
        trimEqual: true as const,
        nfcEqual: true as const,
        forbiddenCodePointPattern: "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f\\u202a-\\u202e\\u2066-\\u2069]" as const,
        forbiddenCodePointFlags: "u" as const,
      },
      invalidResult: null,
    },
    outputPolicyVersion: narratorOutputPolicyVersion,
  },
});

export const narratorDecodingConfigurationHashV2 = canonicalHash(narratorDecodingConfigurationV2);

export const narratorInputTokenAccountingContractV2 = deepFreeze({
  schemaVersion: 2 as const,
  runtime: narratorDecodingConfigurationV2.runtime,
  input: narratorDecodingConfigurationV2.input,
});

export const narratorGeneratedTokenAccountingContractV2 = deepFreeze({
  schemaVersion: 2 as const,
  runtime: narratorDecodingConfigurationV2.runtime,
  generation: narratorDecodingConfigurationV2.generation,
  sequencePolicy: narratorDecodingConfigurationV2.output.sequencePolicy,
  decoderStartPolicy: narratorDecodingConfigurationV2.output.decoderStartPolicy,
  countPolicy: narratorDecodingConfigurationV2.output.countPolicy,
  maximumOutputTokens: narratorDecodingConfigurationV2.output.maximumOutputTokens,
});

export const narratorVisibleOutputNormalizationContractV2 = deepFreeze({
  schemaVersion: 2 as const,
  decodeOptions: narratorDecodingConfigurationV2.output.decodeOptions,
  normalization: narratorDecodingConfigurationV2.output.normalization,
  outputPolicyVersion: narratorDecodingConfigurationV2.output.outputPolicyVersion,
});

export const narratorInputTokenAccountingHashV2 = canonicalHash(narratorInputTokenAccountingContractV2);
export const narratorGeneratedTokenAccountingHashV2 = canonicalHash(narratorGeneratedTokenAccountingContractV2);
export const narratorVisibleOutputNormalizationHashV2 = canonicalHash(narratorVisibleOutputNormalizationContractV2);

export const narratorPromptAndTokenContractV2 = deepFreeze({
  schemaVersion: 2 as const,
  contractId: "the-grind-2:narrator-prompt-and-token-contract:v2" as const,
  promptFormatterHash: narratorPromptFormatterHashV2,
  inputTokenAccountingHash: narratorInputTokenAccountingHashV2,
  generatedTokenAccountingHash: narratorGeneratedTokenAccountingHashV2,
  visibleOutputNormalizationHash: narratorVisibleOutputNormalizationHashV2,
  decodingConfigurationHash: narratorDecodingConfigurationHashV2,
});

export const narratorPromptAndTokenContractHashV2 = canonicalHash(narratorPromptAndTokenContractV2);

export type NarratorTokenIdSequence = ArrayLike<number | bigint>;

function copyTokenIds(value: NarratorTokenIdSequence, label: string, maximumLength: number): number[] {
  if (typeof value !== "object" || value === null || !Number.isSafeInteger(value.length) || value.length < 0) {
    throw new TypeError(`${label} must be an array-like token-id sequence`);
  }
  if (value.length > maximumLength) throw new RangeError(`${label} exceed the token-id sequence budget`);
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const token = value[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError(`${label} contains an invalid token id`);
      }
      result.push(Number(token));
      continue;
    }
    if (!Number.isSafeInteger(token) || (token as number) < 0) {
      throw new TypeError(`${label} contains an invalid token id`);
    }
    result.push(token as number);
  }
  return result;
}

export function countNarratorInputTokenIdsV2(inputIds: NarratorTokenIdSequence): number {
  const ids = copyTokenIds(
    inputIds,
    "Narrator input ids",
    narratorDecodingConfigurationV2.input.maximumInputTokens,
  );
  if (ids.length === 0) throw new RangeError("Narrator input ids are empty");
  if (ids.at(-1) !== narratorDecodingConfigurationV2.input.eosTokenId) {
    throw new TypeError("Narrator input ids must end with the tokenizer-added EOS id");
  }
  return ids.length;
}

export interface NarratorGeneratedTokenAccountingV2 {
  readonly generatedTokenIds: readonly number[];
  readonly outputTokens: number;
  readonly stopReason: "model-eos" | "maximum-new-tokens";
}

export function accountNarratorGeneratedTokenIdsV2(
  fullSequence: NarratorTokenIdSequence,
): NarratorGeneratedTokenAccountingV2 {
  const { decoderStartTokenId, eosTokenId } = narratorDecodingConfigurationV2.generation;
  const { max_new_tokens: maxNewTokens } = narratorDecodingConfigurationV2.generation.options;
  const ids = copyTokenIds(fullSequence, "Narrator generated ids", maxNewTokens + 1);
  if (ids[0] !== decoderStartTokenId) {
    throw new TypeError("Narrator generated ids must begin with the decoder-start id");
  }
  const generatedTokenIds = ids.slice(1);
  if (generatedTokenIds.length === 0) {
    throw new RangeError("Narrator generated ids are empty after decoder-start removal");
  }
  const eosIndex = generatedTokenIds.indexOf(eosTokenId);
  if (eosIndex >= 0 && eosIndex !== generatedTokenIds.length - 1) {
    throw new TypeError("Narrator generated ids contain data after EOS");
  }
  if (eosIndex < 0 && generatedTokenIds.length !== maxNewTokens) {
    throw new TypeError("Narrator generated ids stopped before EOS and max_new_tokens");
  }
  const frozenIds = Object.freeze(generatedTokenIds);
  return Object.freeze({
    generatedTokenIds: frozenIds,
    outputTokens: frozenIds.length,
    stopReason: eosIndex >= 0 ? "model-eos" : "maximum-new-tokens",
  });
}

export function normalizeNarratorDecodedOutputV2(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (normalized.length === 0
    || normalized.length > narratorMaximumOutputCharacters
    || normalized.trim() !== normalized
    || normalized.normalize("NFC") !== normalized
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) {
    return null;
  }
  return normalized;
}
