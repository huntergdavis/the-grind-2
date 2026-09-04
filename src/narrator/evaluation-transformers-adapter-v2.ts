import type {
  NarratorEvaluationRunSpecV2,
} from "./evaluation-contract-v2";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorGeneratedTokenIdsV2,
  countNarratorInputTokenIdsV2,
  formatNarratorPromptV2,
  narratorDecodingConfigurationV2,
} from "./evaluation-prompt-contract";
import {
  createNarratorEvaluationWorkerCaseResponseV2,
  isNarratorEvaluationWorkerCaseRequestV2,
  type NarratorEvaluationWorkerCaseRequestV2,
  type NarratorEvaluationWorkerCaseResponseV2,
} from "./evaluation-worker-protocol-v2";
import type { NarratorModelCandidate } from "./model-candidate";
import { isNarratorBoundedText } from "./protocol";

export interface NarratorTransformersTensorV2 {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number | bigint>;
  dispose(): void;
}

export type NarratorTransformersInputsV2 = Readonly<Record<string, NarratorTransformersTensorV2>>;

export interface NarratorTransformersTokenizerPortV2 {
  tokenize(
    text: string,
    options: typeof narratorDecodingConfigurationV2.input.tokenizerOptions,
  ): Promise<unknown> | unknown;
  decode(
    tokenIds: readonly number[],
    options: typeof narratorDecodingConfigurationV2.output.decodeOptions,
  ): unknown;
  dispose?(): Promise<void> | void;
}

export interface NarratorTransformersModelPortV2 {
  generate(
    inputs: NarratorTransformersInputsV2,
    options: typeof narratorDecodingConfigurationV2.generation.options,
  ): Promise<unknown>;
  dispose(): Promise<void> | void;
}

export interface NarratorTransformersCaseAdapterV2 {
  readonly nextOrdinal: number;
  evaluate(
    request: NarratorEvaluationWorkerCaseRequestV2,
    maximumOutputTokens: 48,
  ): Promise<NarratorEvaluationWorkerCaseResponseV2>;
  dispose(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseNumberArray(value: unknown): value is readonly number[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !Number.isSafeInteger(value[index]) || Number(value[index]) < 0) return false;
  }
  return true;
}

function isTensor(value: unknown): value is NarratorTransformersTensorV2 {
  if (!isRecord(value)
    || !isDenseNumberArray(value.dims)
    || typeof value.dispose !== "function"
    || (typeof value.data !== "object" && typeof value.data !== "function")
    || value.data === null) return false;
  const data = value.data as { readonly length?: unknown };
  return Number.isSafeInteger(data.length) && Number(data.length) >= 0;
}

function tensorSequence(value: unknown, maximumLength: number): readonly number[] | null {
  if (!isTensor(value)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || !Number.isSafeInteger(value.dims[1])
    || Number(value.dims[1]) < 0
    || value.data.length !== value.dims[1]
    || value.data.length > maximumLength) return null;
  const ids: number[] = [];
  for (let index = 0; index < value.data.length; index += 1) {
    const token = value.data[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      ids.push(Number(token));
    } else if (!Number.isSafeInteger(token) || Number(token) < 0) return null;
    else ids.push(Number(token));
  }
  return Object.freeze(ids);
}

function observedTensorLength(value: unknown): number | null {
  if (!isTensor(value)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || !Number.isSafeInteger(value.dims[1])
    || Number(value.dims[1]) < 0
    || value.data.length !== value.dims[1]) return null;
  return Number(value.dims[1]);
}

function disposableTensors(value: unknown): readonly NarratorTransformersTensorV2[] {
  if (!isRecord(value)) return Object.freeze([]);
  const tensors: NarratorTransformersTensorV2[] = [];
  const seen = new Set<NarratorTransformersTensorV2>();
  for (const child of Object.values(value)) {
    if (isTensor(child) && !seen.has(child)) {
      seen.add(child);
      tensors.push(child);
    }
  }
  return Object.freeze(tensors);
}

function disposeTensors(tensors: readonly NarratorTransformersTensorV2[]): void {
  let firstError: unknown = null;
  const seen = new Set<NarratorTransformersTensorV2>();
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

function response(
  request: NarratorEvaluationWorkerCaseRequestV2,
  fields: Parameters<typeof createNarratorEvaluationWorkerCaseResponseV2>[1],
): NarratorEvaluationWorkerCaseResponseV2 {
  return createNarratorEvaluationWorkerCaseResponseV2(request, fields);
}

export function createNarratorTransformersCaseAdapterV2(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV2,
  workerEpoch: string,
  tokenizer: NarratorTransformersTokenizerPortV2,
  model: NarratorTransformersModelPortV2,
): NarratorTransformersCaseAdapterV2 {
  if (!isNarratorBoundedText(workerEpoch, 200)) {
    throw new TypeError("Narrator Transformers worker epoch is invalid");
  }
  let nextOrdinal = 0;
  let disposed = false;

  return Object.freeze({
    get nextOrdinal(): number {
      return nextOrdinal;
    },

    async evaluate(
      request: NarratorEvaluationWorkerCaseRequestV2,
      maximumOutputTokens: 48,
    ): Promise<NarratorEvaluationWorkerCaseResponseV2> {
      if (disposed) throw new Error("Narrator Transformers adapter is disposed");
      if (maximumOutputTokens !== narratorDecodingConfigurationV2.generation.options.max_new_tokens) {
        throw new TypeError("Narrator Transformers output-token limit is invalid");
      }
      if (!isNarratorEvaluationWorkerCaseRequestV2(request, runSpec, candidate)
        || request.workerEpoch !== workerEpoch
        || request.ordinal !== nextOrdinal
        || request.ordinal >= narratorEvaluationCasesV1.length) {
        throw new TypeError("Narrator Transformers case request is invalid or out of order");
      }
      nextOrdinal += 1;

      let promptText: string;
      try {
        promptText = formatNarratorPromptV2(narratorEvaluationCasesV1[request.ordinal]!.prompt);
      } catch {
        return response(request, {
          outcome: "prompt-format-error",
          inputTokenIds: null,
          fullDecoderTokenIds: null,
          decodedText: null,
        });
      }

      let tokenized: unknown;
      try {
        tokenized = await tokenizer.tokenize(promptText, narratorDecodingConfigurationV2.input.tokenizerOptions);
      } catch {
        return response(request, {
          outcome: "input-tokenizer-error",
          inputTokenIds: null,
          fullDecoderTokenIds: null,
          decodedText: null,
        });
      }

      const inputTensors = disposableTensors(tokenized);
      let generatedTensor: NarratorTransformersTensorV2 | null = null;
      try {
        const inputIdsTensor = isRecord(tokenized) ? tokenized.input_ids : null;
        const observedInputTokens = observedTensorLength(inputIdsTensor);
        if (observedInputTokens !== null
          && observedInputTokens > narratorDecodingConfigurationV2.input.maximumInputTokens) {
          return response(request, {
            outcome: "input-budget",
            inputTokenIds: null,
            observedInputTokens,
            fullDecoderTokenIds: null,
            decodedText: null,
          });
        }

        const inputTokenIds = tensorSequence(
          inputIdsTensor,
          narratorDecodingConfigurationV2.input.maximumInputTokens,
        ) ?? Object.freeze([]);
        try {
          countNarratorInputTokenIdsV2(inputTokenIds);
        } catch {
          return response(request, {
            outcome: "input-token-contract-error",
            inputTokenIds,
            fullDecoderTokenIds: null,
            decodedText: null,
          });
        }
        if (!isRecord(tokenized) || !Object.values(tokenized).every(isTensor)) {
          return response(request, {
            outcome: "input-token-contract-error",
            inputTokenIds: Object.freeze([]),
            fullDecoderTokenIds: null,
            decodedText: null,
          });
        }

        let generated: unknown;
        try {
          generated = await model.generate(
            tokenized as NarratorTransformersInputsV2,
            narratorDecodingConfigurationV2.generation.options,
          );
        } catch {
          return response(request, {
            outcome: "generation-error",
            inputTokenIds,
            fullDecoderTokenIds: null,
            decodedText: null,
          });
        }

        if (isTensor(generated)) generatedTensor = generated;
        const fullDecoderTokenIds = tensorSequence(
          generated,
          narratorDecodingConfigurationV2.generation.options.max_new_tokens + 1,
        );
        if (fullDecoderTokenIds === null) {
          return response(request, {
            outcome: "generated-token-contract-error",
            inputTokenIds,
            fullDecoderTokenIds: null,
            decodedText: null,
          });
        }

        let generatedTokenIds: readonly number[];
        try {
          generatedTokenIds = accountNarratorGeneratedTokenIdsV2(fullDecoderTokenIds).generatedTokenIds;
        } catch {
          return response(request, {
            outcome: "generated-token-contract-error",
            inputTokenIds,
            fullDecoderTokenIds,
            decodedText: null,
          });
        }

        let decodedText: unknown;
        try {
          decodedText = tokenizer.decode(
            generatedTokenIds,
            narratorDecodingConfigurationV2.output.decodeOptions,
          );
        } catch {
          return response(request, {
            outcome: "decode-error",
            inputTokenIds,
            fullDecoderTokenIds,
            decodedText: null,
          });
        }
        if (typeof decodedText !== "string") {
          return response(request, {
            outcome: "decode-error",
            inputTokenIds,
            fullDecoderTokenIds,
            decodedText: null,
          });
        }
        return response(request, {
          outcome: "generated",
          inputTokenIds,
          fullDecoderTokenIds,
          decodedText,
        });
      } finally {
        disposeTensors(generatedTensor === null ? inputTensors : [...inputTensors, generatedTensor]);
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
