import { canonicalHash } from "../core/canonical";
import type { NarratorEvaluationRunSpecV3 } from "./evaluation-contract-v3";
import { narratorEvaluationCasesV1 } from "./evaluation";
import {
  accountNarratorFormTargetsV3,
  allowedNarratorFormTokenIdsV3,
  countNarratorFormInputTokenIdsV3,
  formatNarratorFormPromptV3,
  narratorFloat32ToBitsV3,
  narratorFormGenerationConfigurationV3,
  narratorFormInputTokenAccountingContractV3,
  narratorFormPromptBytesHashV3,
  narratorFormsV3,
  narratorFormSelectionContractHashV3,
  validateNarratorFormSelectionV3,
  type NarratorFormEligibilityDecisionV3,
  type NarratorFormIdV3,
  type NarratorFormSelectionTraceStepV3,
  type NarratorFormTargetSetV3,
} from "./evaluation-selection-contract-v3";
import { narratorEvaluationWorkerProtocolContractHashV3 } from "./evaluation-evidence-contract-v3";
import {
  createNarratorEvaluationWorkerCaseResponseV3,
  isNarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationTargetObservationV3,
  type NarratorEvaluationWorkerCaseRequestV3,
  type NarratorEvaluationWorkerCaseResponseV3,
  type NarratorEvaluationWorkerResponseFieldsV3,
} from "./evaluation-worker-protocol-v3";
import type { NarratorModelCandidate } from "./model-candidate";
import { isNarratorBoundedText, narratorMaximumInputTokens } from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const narratorTransformersInputTokenizerOptionsV3 = deepFreeze({
  ...narratorFormInputTokenAccountingContractV3.tokenizerOptions,
});

export const narratorTransformersTargetTokenizerOptionsV3 = deepFreeze({
  ...narratorFormInputTokenAccountingContractV3.tokenizerOptions,
});

export const narratorTransformersTargetDecodeOptionsV3 = deepFreeze({
  skip_special_tokens: true as const,
  clean_up_tokenization_spaces: false as const,
});

export const narratorTransformersGenerationOptionsV3 = deepFreeze({
  ...narratorFormGenerationConfigurationV3.options,
  decoder_start_token_id: narratorFormGenerationConfigurationV3.decoderStartTokenId,
  pad_token_id: narratorFormGenerationConfigurationV3.padTokenId,
  eos_token_id: narratorFormGenerationConfigurationV3.eosTokenId,
});

export const narratorTransformersAdapterContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-transformers-adapter:v3" as const,
  selectionContractHash: narratorFormSelectionContractHashV3,
  workerProtocolContractHash: narratorEvaluationWorkerProtocolContractHashV3,
  inputTokenizerOptions: narratorTransformersInputTokenizerOptionsV3,
  targetTokenizerOptions: narratorTransformersTargetTokenizerOptionsV3,
  targetWitnessDecodeOptions: narratorTransformersTargetDecodeOptionsV3,
  targetOrder: "request-eligibility-order" as const,
  logitsProcessorPosition: narratorFormGenerationConfigurationV3.logitsProcessorPosition,
  allowedScoreCapture: "float32-raw-bits-before-trie-mask" as const,
  masking: "set-only-disallowed-vocabulary-logits-to-negative-infinity" as const,
  allowedLogitMutation: false as const,
  emittedTokenSource: "returned-full-decoder-token-ids-after-runtime-sampling" as const,
  generatedTextDecode: false as const,
  responseAuthority: "raw-v3-worker-protocol-evidence-only" as const,
  selectionAuthority: false as const,
  decoderStartTokenId: narratorFormGenerationConfigurationV3.decoderStartTokenId,
  padTokenId: narratorFormGenerationConfigurationV3.padTokenId,
  eosTokenId: narratorFormGenerationConfigurationV3.eosTokenId,
  maximumNewTokens: narratorFormGenerationConfigurationV3.options.max_new_tokens,
});

export const narratorTransformersAdapterContractHashV3 = canonicalHash(
  narratorTransformersAdapterContractV3,
);

export interface NarratorTransformersTensorV3 {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number | bigint>;
  dispose(): void;
}

export type NarratorTransformersInputsV3 = Readonly<Record<string, NarratorTransformersTensorV3>>;

export interface NarratorTransformersLogitsTensorV3 {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

export interface NarratorTrieLogitsProcessorV3 {
  process(
    inputIds: readonly (readonly (number | bigint)[])[],
    logits: NarratorTransformersLogitsTensorV3,
  ): NarratorTransformersLogitsTensorV3;
  finalize(fullDecoderTokenIds: readonly number[]): readonly NarratorFormSelectionTraceStepV3[];
}

export interface NarratorTransformersTokenizerPortV3 {
  tokenize(
    text: string,
    options: typeof narratorTransformersInputTokenizerOptionsV3,
  ): Promise<unknown> | unknown;
  decode(
    tokenIds: readonly number[],
    options: typeof narratorTransformersTargetDecodeOptionsV3,
  ): unknown;
  dispose?(): Promise<void> | void;
}

export interface NarratorTransformersModelPortV3 {
  generate(
    inputs: NarratorTransformersInputsV3,
    options: typeof narratorTransformersGenerationOptionsV3,
    logitsProcessor: NarratorTrieLogitsProcessorV3,
  ): Promise<unknown>;
  dispose(): Promise<void> | void;
}

export interface NarratorTransformersCaseAdapterV3 {
  readonly nextOrdinal: number;
  evaluate(
    request: NarratorEvaluationWorkerCaseRequestV3,
    maximumOutputTokens: 48,
  ): Promise<NarratorEvaluationWorkerCaseResponseV3>;
  dispose(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseNumberArray(value: unknown): value is readonly number[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length
    && keys.every((key, index) => key === String(index))
    && value.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0);
}

function isTensor(value: unknown): value is NarratorTransformersTensorV3 {
  if (!isRecord(value)
    || !isDenseNumberArray(value.dims)
    || typeof value.dispose !== "function"
    || (typeof value.data !== "object" && typeof value.data !== "function")
    || value.data === null) return false;
  const data = value.data as { readonly length?: unknown };
  return Number.isSafeInteger(data.length) && Number(data.length) >= 0;
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

function tensorSequence(value: unknown, maximumLength: number): readonly number[] | null {
  const observedLength = observedTensorLength(value);
  if (!isTensor(value) || observedLength === null || observedLength > maximumLength) return null;
  const result: number[] = [];
  for (let index = 0; index < value.data.length; index += 1) {
    const token = value.data[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || Number(token) < 0) return null;
      result.push(Number(token));
    }
  }
  return Object.freeze(result);
}

function disposableTensors(value: unknown): readonly NarratorTransformersTensorV3[] {
  if (!isRecord(value)) return Object.freeze([]);
  const tensors: NarratorTransformersTensorV3[] = [];
  const seen = new Set<NarratorTransformersTensorV3>();
  for (const child of Object.values(value)) {
    if (isTensor(child) && !seen.has(child)) {
      seen.add(child);
      tensors.push(child);
    }
  }
  return Object.freeze(tensors);
}

function disposeTensors(tensors: readonly NarratorTransformersTensorV3[]): void {
  let firstError: unknown = null;
  const seen = new Set<NarratorTransformersTensorV3>();
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

function copyDecoderInputIds(
  value: readonly (readonly (number | bigint)[])[],
): readonly number[] {
  if (!Array.isArray(value)
    || Object.keys(value).length !== 1
    || Object.keys(value)[0] !== "0"
    || !Array.isArray(value[0])) {
    throw new TypeError("Narrator V3 logits processor requires one dense decoder batch");
  }
  const row = value[0];
  if (Object.keys(row).length !== row.length
    || !Object.keys(row).every((key, index) => key === String(index))
    || row.length === 0
    || row.length > narratorFormGenerationConfigurationV3.options.max_new_tokens + 1) {
    throw new TypeError("Narrator V3 decoder input ids are invalid");
  }
  const result: number[] = [];
  for (const token of row) {
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError("Narrator V3 decoder input contains an invalid token id");
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || token < 0) {
        throw new TypeError("Narrator V3 decoder input contains an invalid token id");
      }
      result.push(token);
    }
  }
  if (result[0] !== narratorFormGenerationConfigurationV3.decoderStartTokenId) {
    throw new TypeError("Narrator V3 decoder input is missing its decoder-start token");
  }
  return Object.freeze(result);
}

function exactNumberArray(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

interface PendingTraceStep {
  readonly prefixTokenIds: readonly number[];
  readonly allowedTokenIds: readonly number[];
  readonly allowedScoreBits: readonly number[];
}

export function createNarratorTrieLogitsProcessorV3(
  prompt: unknown,
  eligibility: NarratorFormEligibilityDecisionV3,
  targetSet: NarratorFormTargetSetV3,
): NarratorTrieLogitsProcessorV3 {
  // This preflight also validates the prompt, eligibility, target-set hashes, and initial trie state.
  allowedNarratorFormTokenIdsV3(prompt, eligibility, targetSet, Object.freeze([]));
  const pendingSteps: PendingTraceStep[] = [];
  let previousPrefix: readonly number[] | null = null;

  return Object.freeze({
    process(
      inputIds: readonly (readonly (number | bigint)[])[],
      logits: NarratorTransformersLogitsTensorV3,
    ): NarratorTransformersLogitsTensorV3 {
      const decoderIds = copyDecoderInputIds(inputIds);
      const prefix = Object.freeze(decoderIds.slice(1));
      if (prefix.length !== pendingSteps.length
        || (previousPrefix !== null
          && (prefix.length !== previousPrefix.length + 1
            || !exactNumberArray(prefix.slice(0, -1), previousPrefix)))) {
        throw new TypeError("Narrator V3 decoder prefix is not the next trie step");
      }
      if (previousPrefix !== null) {
        const previouslyEmitted = prefix.at(-1)!;
        const priorAllowed = pendingSteps.at(-1)!.allowedTokenIds;
        if (!priorAllowed.includes(previouslyEmitted)) {
          throw new TypeError("Narrator V3 decoder emitted a token outside the prior trie branch");
        }
      }
      if (!isRecord(logits)
        || !isDenseNumberArray(logits.dims)
        || logits.dims.length !== 2
        || logits.dims[0] !== 1
        || logits.dims[1] !== logits.data?.length
        || !(logits.data instanceof Float32Array)) {
        throw new TypeError("Narrator V3 processed logits tensor is invalid");
      }
      const allowedTokenIds = allowedNarratorFormTokenIdsV3(prompt, eligibility, targetSet, prefix);
      if (allowedTokenIds.some((tokenId) => tokenId >= logits.data.length)) {
        throw new RangeError("Narrator V3 allowed token is outside the logits vocabulary");
      }
      const allowedScoreBits = allowedTokenIds.map((tokenId) =>
        narratorFloat32ToBitsV3(logits.data[tokenId]!));
      pendingSteps.push(deepFreeze({
        prefixTokenIds: [...prefix],
        allowedTokenIds: [...allowedTokenIds],
        allowedScoreBits,
      }));
      previousPrefix = prefix;

      const allowedSet = new Set(allowedTokenIds);
      for (let tokenId = 0; tokenId < logits.data.length; tokenId += 1) {
        if (!allowedSet.has(tokenId)) logits.data[tokenId] = Number.NEGATIVE_INFINITY;
      }
      return logits;
    },

    finalize(fullDecoderTokenIds: readonly number[]): readonly NarratorFormSelectionTraceStepV3[] {
      if (!isDenseNumberArray(fullDecoderTokenIds)
        || fullDecoderTokenIds.length > narratorFormGenerationConfigurationV3.options.max_new_tokens + 1) {
        throw new TypeError("Narrator V3 full decoder ids are structurally invalid");
      }
      const emitted = fullDecoderTokenIds.slice(1);
      return deepFreeze(pendingSteps.slice(0, emitted.length).map((step, index) => ({
        prefixTokenIds: [...step.prefixTokenIds],
        allowedTokenIds: [...step.allowedTokenIds],
        allowedScoreBits: [...step.allowedScoreBits],
        emittedTokenId: emitted[index]!,
      })));
    },
  });
}

function emptyEarlyFields(
  outcome: "prompt-format-error" | "input-tokenizer-error",
): NarratorEvaluationWorkerResponseFieldsV3 {
  return {
    outcome,
    inputTokenIds: null,
    observedInputTokens: null,
    targetObservations: null,
    fullDecoderTokenIds: null,
    selectionTrace: null,
  };
}

export function createNarratorTransformersCaseAdapterV3(
  candidate: NarratorModelCandidate,
  runSpec: NarratorEvaluationRunSpecV3,
  workerEpoch: string,
  tokenizer: NarratorTransformersTokenizerPortV3,
  model: NarratorTransformersModelPortV3,
): NarratorTransformersCaseAdapterV3 {
  if (!isNarratorBoundedText(workerEpoch, 200)) {
    throw new TypeError("Narrator Transformers V3 worker epoch is invalid");
  }
  let nextOrdinal = 0;
  let priorSelectedFormId: NarratorFormIdV3 | null = null;
  let priorWorkerResponseHash: string | null = null;
  let disposed = false;

  return Object.freeze({
    get nextOrdinal(): number {
      return nextOrdinal;
    },

    async evaluate(
      request: NarratorEvaluationWorkerCaseRequestV3,
      maximumOutputTokens: 48,
    ): Promise<NarratorEvaluationWorkerCaseResponseV3> {
      if (disposed) throw new Error("Narrator Transformers V3 adapter is disposed");
      if (maximumOutputTokens !== narratorFormGenerationConfigurationV3.options.max_new_tokens) {
        throw new TypeError("Narrator Transformers V3 output-token limit is invalid");
      }
      const expectedPriorForm = nextOrdinal % 2 === 1 ? priorSelectedFormId : null;
      if (!isNarratorEvaluationWorkerCaseRequestV3(
        request,
        runSpec,
        candidate,
        expectedPriorForm,
        priorWorkerResponseHash,
      )
        || request.workerEpoch !== workerEpoch
        || request.ordinal !== nextOrdinal
        || request.ordinal >= narratorEvaluationCasesV1.length) {
        throw new TypeError("Narrator Transformers V3 case request is invalid or out of order");
      }
      nextOrdinal += 1;

      let selectedForHistory: NarratorFormIdV3 | null = null;
      const complete = (
        fields: NarratorEvaluationWorkerResponseFieldsV3,
      ): NarratorEvaluationWorkerCaseResponseV3 => {
        const completed = createNarratorEvaluationWorkerCaseResponseV3(request, fields);
        priorSelectedFormId = fields.outcome === "selected" ? selectedForHistory : null;
        priorWorkerResponseHash = completed.contentHash;
        return completed;
      };

      const evaluationCase = narratorEvaluationCasesV1[request.ordinal]!;
      let promptText: string;
      try {
        promptText = formatNarratorFormPromptV3(evaluationCase.prompt);
        if (narratorFormPromptBytesHashV3(evaluationCase.prompt) !== request.promptBytesHash) {
          throw new TypeError("Narrator V3 prompt hash does not match the request");
        }
      } catch {
        return complete(emptyEarlyFields("prompt-format-error"));
      }

      let inputTokenized: unknown;
      try {
        inputTokenized = await tokenizer.tokenize(
          promptText,
          narratorTransformersInputTokenizerOptionsV3,
        );
      } catch {
        return complete(emptyEarlyFields("input-tokenizer-error"));
      }

      const inputTensors = disposableTensors(inputTokenized);
      let generatedTensors: readonly NarratorTransformersTensorV3[] = Object.freeze([]);
      try {
        const inputIdsTensor = isRecord(inputTokenized) ? inputTokenized.input_ids : null;
        const observedInputTokens = observedTensorLength(inputIdsTensor);
        if (observedInputTokens !== null && observedInputTokens > narratorMaximumInputTokens) {
          return complete({
            outcome: "input-budget",
            inputTokenIds: null,
            observedInputTokens,
            targetObservations: null,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        let inputTokenIds = tensorSequence(inputIdsTensor, narratorMaximumInputTokens)
          ?? Object.freeze([]);
        if (!isRecord(inputTokenized) || !Object.values(inputTokenized).every(isTensor)) {
          inputTokenIds = Object.freeze([]);
        }
        try {
          countNarratorFormInputTokenIdsV3(inputTokenIds);
        } catch {
          return complete({
            outcome: "input-token-contract-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations: null,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        const formById = new Map(narratorFormsV3(evaluationCase.prompt).map((form) => [form.formId, form]));
        const targetObservations: NarratorEvaluationTargetObservationV3[] = [];
        for (const formId of request.eligibility.eligibleFormIds) {
          const form = formById.get(formId)!;
          let targetTokenized: unknown;
          try {
            targetTokenized = await tokenizer.tokenize(
              form.witness,
              narratorTransformersTargetTokenizerOptionsV3,
            );
          } catch {
            return complete({
              outcome: "target-tokenizer-error",
              inputTokenIds,
              observedInputTokens: null,
              targetObservations: null,
              fullDecoderTokenIds: null,
              selectionTrace: null,
            });
          }

          const targetTensors = disposableTensors(targetTokenized);
          try {
            const targetIdsTensor = isRecord(targetTokenized) ? targetTokenized.input_ids : null;
            const targetIds = tensorSequence(targetIdsTensor, narratorMaximumInputTokens);
            if (targetIds === null) {
              return complete({
                outcome: "target-tokenizer-error",
                inputTokenIds,
                observedInputTokens: null,
                targetObservations: null,
                fullDecoderTokenIds: null,
                selectionTrace: null,
              });
            }
            let decodedWitness: unknown;
            try {
              decodedWitness = tokenizer.decode(targetIds, narratorTransformersTargetDecodeOptionsV3);
            } catch {
              return complete({
                outcome: "target-tokenizer-error",
                inputTokenIds,
                observedInputTokens: null,
                targetObservations: null,
                fullDecoderTokenIds: null,
                selectionTrace: null,
              });
            }
            if (typeof decodedWitness !== "string") {
              return complete({
                outcome: "target-tokenizer-error",
                inputTokenIds,
                observedInputTokens: null,
                targetObservations: null,
                fullDecoderTokenIds: null,
                selectionTrace: null,
              });
            }
            targetObservations.push({ formId, tokenIds: targetIds, decodedWitness });
          } finally {
            disposeTensors(targetTensors);
          }
        }

        let targetSet: NarratorFormTargetSetV3;
        try {
          targetSet = accountNarratorFormTargetsV3(
            evaluationCase.prompt,
            request.eligibility,
            targetObservations,
          );
        } catch {
          return complete({
            outcome: "target-token-contract-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        const processor = createNarratorTrieLogitsProcessorV3(
          evaluationCase.prompt,
          request.eligibility,
          targetSet,
        );
        let generated: unknown;
        try {
          generated = await model.generate(
            inputTokenized as NarratorTransformersInputsV3,
            narratorTransformersGenerationOptionsV3,
            processor,
          );
        } catch {
          return complete({
            outcome: "generation-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        generatedTensors = isTensor(generated)
          ? Object.freeze([generated])
          : disposableTensors(generated);
        const fullDecoderTokenIds = tensorSequence(
          generated,
          narratorFormGenerationConfigurationV3.options.max_new_tokens + 1,
        );
        if (fullDecoderTokenIds === null) {
          return complete({
            outcome: "generation-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        let selectionTrace: readonly NarratorFormSelectionTraceStepV3[];
        try {
          selectionTrace = processor.finalize(fullDecoderTokenIds);
        } catch {
          return complete({
            outcome: "generation-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds: null,
            selectionTrace: null,
          });
        }

        try {
          const selection = validateNarratorFormSelectionV3(
            evaluationCase.prompt,
            request.eligibility,
            fullDecoderTokenIds,
            selectionTrace,
            targetSet,
          );
          selectedForHistory = selection.selectedFormId;
          return complete({
            outcome: "selected",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds,
            selectionTrace,
          });
        } catch {
          return complete({
            outcome: "selection-contract-error",
            inputTokenIds,
            observedInputTokens: null,
            targetObservations,
            fullDecoderTokenIds,
            selectionTrace,
          });
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
