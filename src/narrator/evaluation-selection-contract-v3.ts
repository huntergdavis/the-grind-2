import { canonicalHash, canonicalStringify } from "../core/canonical";
import {
  isNarratorBoundedText,
  isNarratorPromptV1,
  isNarratorRecord,
  narratorHasExactKeys,
  narratorMaximumInputTokens,
  narratorMaximumOutputCharacters,
  narratorMaximumOutputTokens,
  type NarratorMoveV1,
} from "./protocol";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const narratorFormIdsV3 = Object.freeze([
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

export type NarratorFormIdV3 = typeof narratorFormIdsV3[number];

export interface NarratorFormDescriptorV3 {
  readonly formId: NarratorFormIdV3;
  readonly move: NarratorMoveV1;
  readonly witness: string;
  readonly targetTokenIds: readonly number[];
  readonly renderingTemplate: string;
  readonly baseline: boolean;
}

const forms = [
  {
    formId: "establish-holds",
    move: "establish-setting",
    witness: "PLACE holds a ENERGY moment.",
    targetTokenIds: [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    renderingTemplate: "{place} holds a {energy} moment.",
    baseline: true,
  },
  {
    formId: "establish-gathers",
    move: "establish-setting",
    witness: "A ENERGY moment gathers at PLACE.",
    targetTokenIds: [71, 3, 25576, 12912, 476, 798, 7479, 7, 44, 17501, 4770, 5, 1],
    renderingTemplate: "A {energy} moment gathers at {place}.",
    baseline: false,
  },
  {
    formId: "establish-waits",
    move: "establish-setting",
    witness: "PLACE waits within a ENERGY moment.",
    targetTokenIds: [17501, 4770, 1749, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    renderingTemplate: "{place} waits within a {energy} moment.",
    baseline: false,
  },
  {
    formId: "shade-holds-baseline",
    move: "shade-atmosphere",
    witness: "PLACE holds a ENERGY moment.",
    targetTokenIds: [17501, 4770, 4532, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    renderingTemplate: "{place} holds a {energy} moment.",
    baseline: true,
  },
  {
    formId: "shade-rests",
    move: "shade-atmosphere",
    witness: "PLACE rests within a ENERGY moment.",
    targetTokenIds: [17501, 4770, 880, 7, 441, 3, 9, 3, 25576, 12912, 476, 798, 5, 1],
    renderingTemplate: "{place} rests within a {energy} moment.",
    baseline: false,
  },
  {
    formId: "shade-settles",
    move: "shade-atmosphere",
    witness: "A ENERGY moment settles over PLACE.",
    targetTokenIds: [71, 3, 25576, 12912, 476, 798, 8955, 7, 147, 17501, 4770, 5, 1],
    renderingTemplate: "A {energy} moment settles over {place}.",
    baseline: false,
  },
  {
    formId: "shade-lingers",
    move: "shade-atmosphere",
    witness: "The ENERGY moment lingers at PLACE.",
    targetTokenIds: [37, 3, 25576, 12912, 476, 798, 3, 14043, 7, 44, 17501, 4770, 5, 1],
    renderingTemplate: "The {energy} moment lingers at {place}.",
    baseline: false,
  },
  {
    formId: "pressure-attention",
    move: "register-pressure",
    witness: "This ENERGY moment has my attention.",
    targetTokenIds: [100, 3, 25576, 12912, 476, 798, 65, 82, 1388, 5, 1],
    renderingTemplate: "This {energy} moment has my attention.",
    baseline: true,
  },
  {
    formId: "pressure-feel",
    move: "register-pressure",
    witness: "I feel this ENERGY moment.",
    targetTokenIds: [27, 473, 48, 3, 25576, 12912, 476, 798, 5, 1],
    renderingTemplate: "I feel this {energy} moment.",
    baseline: false,
  },
  {
    formId: "pressure-close",
    move: "register-pressure",
    witness: "This ENERGY moment feels close.",
    targetTokenIds: [100, 3, 25576, 12912, 476, 798, 4227, 885, 5, 1],
    renderingTemplate: "This {energy} moment feels close.",
    baseline: false,
  },
] as const satisfies readonly NarratorFormDescriptorV3[];

export const narratorFormRegistryContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-registry:v3" as const,
  identity: "globally-unique-stable-form-id" as const,
  selectionWitness: "fact-placeholders-not-visible-prose" as const,
  order: "registry-order-baseline-first-within-move" as const,
  forms,
});

export const narratorFormRegistryHashV3 = canonicalHash(narratorFormRegistryContractV3);

export const narratorFormRendererContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-renderer:v3" as const,
  inputAuthority: "exact-validated-NarratorPromptV1-public-facts" as const,
  selectedAuthority: "validated-model-selected-form-id" as const,
  rendering: "literal-template-substitution" as const,
  placeSource: "prompt.facts.place-exact-code-units" as const,
  energySource: "prompt.facts.energy" as const,
  unicodeNormalization: "none" as const,
  decodedModelTextAuthority: false as const,
  outputPolicy: "exact-rendered-member-of-current-move-form-union" as const,
  maximumOutputCharacters: narratorMaximumOutputCharacters,
});

export const narratorFormRendererHashV3 = canonicalHash(narratorFormRendererContractV3);

export const narratorRenderedSafetyContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-rendered-safety:v3" as const,
  exactMembership: "rendered-current-move-form-union" as const,
  whitespace: "already-normalized-single-ASCII-spaces" as const,
  maximumWords: 24 as const,
  maximumCharacters: narratorMaximumOutputCharacters,
  newlineForbidden: true as const,
  forbiddenPattern: "\\d|https?:|www\\.|[`{}<>\\[\\]]" as const,
  forbiddenFlags: "iu" as const,
  v1PolicyMutation: false as const,
});

export const narratorRenderedSafetyHashV3 = canonicalHash(narratorRenderedSafetyContractV3);

function isNarratorFormIdV3(value: unknown): value is NarratorFormIdV3 {
  return typeof value === "string" && (narratorFormIdsV3 as readonly string[]).includes(value);
}

function descriptorForId(formId: NarratorFormIdV3): NarratorFormDescriptorV3 {
  const form = forms.find((candidate) => candidate.formId === formId);
  if (form === undefined) throw new TypeError("Narrator form id is invalid");
  return form;
}

export function narratorFormsV3(prompt: unknown): readonly NarratorFormDescriptorV3[] {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  return Object.freeze(forms.filter((form) => form.move === prompt.move));
}

export function renderNarratorFormV3(prompt: unknown, formId: unknown): string {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  if (!isNarratorFormIdV3(formId)) throw new TypeError("Narrator form id is invalid");
  const form = descriptorForId(formId);
  if (form.move !== prompt.move) throw new TypeError("Narrator form does not belong to the prompt move");
  return form.renderingTemplate
    .replace("{place}", prompt.facts.place)
    .replace("{energy}", prompt.facts.energy);
}

export function isSafeRenderedNarrationV3(text: unknown, prompt: unknown): boolean {
  if (typeof text !== "string" || !isNarratorPromptV1(prompt)) return false;
  if (text.length === 0
    || text.length > narratorMaximumOutputCharacters
    || text.trim() !== text
    || text.normalize("NFC") !== text
    || text.replace(/\s+/gu, " ").trim() !== text
    || text.includes("\n")
    || /\d|https?:|www\.|[`{}<>\[\]]/iu.test(text)) return false;
  const words = text.match(/[\p{L}\p{M}'’]+/gu) ?? [];
  if (words.length === 0 || words.length > narratorRenderedSafetyContractV3.maximumWords) return false;
  return narratorFormsV3(prompt).some((form) => renderNarratorFormV3(prompt, form.formId) === text);
}

export const narratorFormPromptFormatterContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-prompt:v3" as const,
  characterEncoding: "UTF-8" as const,
  byteOrderMark: "forbidden" as const,
  instructionLine: "Select the most fitting safe ambient narration form for this scene." as const,
  lineSeparator: "LF" as const,
  trailingLineSeparator: false as const,
  payload: {
    serialization: "the-grind-2-canonical-json-v1" as const,
    objectKeyOrder: "lexicographic" as const,
    stringEscaping: "JSON" as const,
    schemaVersion: 3 as const,
    exactKeys: ["prompt", "schemaVersion"] as const,
    promptProjection: "exact-validated-NarratorPromptV1" as const,
    eligibleFormsVisibility: "generation-trie-only" as const,
  },
});

export const narratorFormPromptFormatterHashV3 = canonicalHash(narratorFormPromptFormatterContractV3);

export function formatNarratorFormPromptV3(prompt: unknown): string {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  return `${narratorFormPromptFormatterContractV3.instructionLine}\n${canonicalStringify({
    schemaVersion: narratorFormPromptFormatterContractV3.payload.schemaVersion,
    prompt,
  })}`;
}

export function formatNarratorFormPromptUtf8V3(prompt: unknown): Uint8Array {
  return new TextEncoder().encode(formatNarratorFormPromptV3(prompt));
}

export function narratorFormPromptBytesHashV3(prompt: unknown): string {
  return canonicalHash([...formatNarratorFormPromptUtf8V3(prompt)]);
}

const runtime = {
  package: "@huggingface/transformers" as const,
  version: "4.2.0" as const,
  integrity: "sha512-8BRCoBMH0XsWaEIamuR0LrJGAfftgHAfb2Vrffy0VKlSAE/MnUJ5/h/zTfEP3fDIft+nk7TqB8xXEyABGitBjQ==" as const,
  sourceRevision: "54652ba3366ccd1e3b64e689a96504309e6fb53b" as const,
};

export const narratorFormInputTokenAccountingContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-input-token-accounting:v3" as const,
  runtime,
  batchSize: 1 as const,
  tokenizerOptions: {
    add_special_tokens: true as const,
    padding: false as const,
    truncation: false as const,
    return_tensor: true as const,
  },
  maximumLengthOption: "omitted" as const,
  maximumInputTokens: narratorMaximumInputTokens,
  eosTokenId: 1 as const,
  terminalEosRequired: true as const,
  countPolicy: "all-input-ids-including-terminal-eos" as const,
});

export const narratorFormInputTokenAccountingHashV3 = canonicalHash(narratorFormInputTokenAccountingContractV3);

export const narratorFormTargetTokenAccountingContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-target-token-accounting:v3" as const,
  runtime,
  source: "frozen-pinned-tokenizer-vector-for-exact-static-selection-witness" as const,
  tokenizerOptions: narratorFormInputTokenAccountingContractV3.tokenizerOptions,
  maximumTargetTokens: narratorMaximumOutputTokens,
  eosTokenId: 1 as const,
  terminalEosRequiredExactlyOnce: true as const,
  decoderStartTokenForbidden: true as const,
  decodedWitnessEquality: "exact-code-unit-equality" as const,
  uniquenessScope: "eligible-forms-within-case" as const,
  promptBinding: "canonical-hash-of-exact-formatted-UTF8-byte-vector" as const,
});

export const narratorFormTargetTokenAccountingHashV3 = canonicalHash(narratorFormTargetTokenAccountingContractV3);

export const narratorFormEligibilityPolicyContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-eligibility:v3" as const,
  sequenceLength: 10 as const,
  burstLength: 2 as const,
  firstCall: "all-current-move-forms-eligible" as const,
  secondCall: "suppress-prior-selected-nonbaseline-form-if-current-move-member" as const,
  baselineAlwaysEligible: true as const,
  reset: "every-fixed-two-call-burst-and-seed" as const,
  invalidOrTiedPriorSelection: "represent-as-null-and-suppress-nothing" as const,
  scoreDependentEligibility: false as const,
  retryOrPostSelectionSubstitution: false as const,
});

export const narratorFormEligibilityPolicyHashV3 = canonicalHash(narratorFormEligibilityPolicyContractV3);

export interface NarratorEligibilityContextV3 {
  readonly seedId: string;
  readonly sequenceSlot: number;
  readonly priorSelectedFormId: NarratorFormIdV3 | null;
}

export interface NarratorFormEligibilityDecisionV3 {
  readonly schemaVersion: 3;
  readonly seedId: string;
  readonly sequenceSlot: number;
  readonly burstIndex: number;
  readonly burstPosition: 0 | 1;
  readonly priorSelectedFormId: NarratorFormIdV3 | null;
  readonly baselineFormId: NarratorFormIdV3;
  readonly eligibleFormIds: readonly NarratorFormIdV3[];
  readonly suppressedFormId: NarratorFormIdV3 | null;
  readonly contentHash: string;
}

function parseEligibilityContext(value: unknown): NarratorEligibilityContextV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["seedId", "sequenceSlot", "priorSelectedFormId"])
    || !isNarratorBoundedText(value.seedId, 160)
    || !Number.isSafeInteger(value.sequenceSlot)
    || Number(value.sequenceSlot) < 0
    || Number(value.sequenceSlot) >= narratorFormEligibilityPolicyContractV3.sequenceLength
    || !(value.priorSelectedFormId === null || isNarratorFormIdV3(value.priorSelectedFormId))) {
    throw new TypeError("Narrator form eligibility context is invalid");
  }
  if (Number(value.sequenceSlot) % narratorFormEligibilityPolicyContractV3.burstLength === 0
    && value.priorSelectedFormId !== null) {
    throw new TypeError("Narrator form eligibility context did not reset at the burst boundary");
  }
  return {
    seedId: value.seedId,
    sequenceSlot: Number(value.sequenceSlot),
    priorSelectedFormId: value.priorSelectedFormId,
  };
}

export function createNarratorFormEligibilityDecisionV3(
  prompt: unknown,
  context: unknown,
): NarratorFormEligibilityDecisionV3 {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  const parsed = parseEligibilityContext(context);
  const currentForms = narratorFormsV3(prompt);
  const baseline = currentForms.find((form) => form.baseline);
  if (baseline === undefined || currentForms.filter((form) => form.baseline).length !== 1) {
    throw new TypeError("Narrator form registry must contain exactly one baseline for the move");
  }
  const prior = parsed.sequenceSlot % 2 === 1 && parsed.priorSelectedFormId !== null
    ? descriptorForId(parsed.priorSelectedFormId)
    : null;
  const suppressedFormId = prior !== null && !prior.baseline && prior.move === prompt.move
    ? prior.formId
    : null;
  const eligibleFormIds = currentForms
    .filter((form) => form.formId !== suppressedFormId)
    .map((form) => form.formId);
  const content = {
    schemaVersion: 3 as const,
    seedId: parsed.seedId,
    sequenceSlot: parsed.sequenceSlot,
    burstIndex: Math.floor(parsed.sequenceSlot / 2),
    burstPosition: (parsed.sequenceSlot % 2) as 0 | 1,
    priorSelectedFormId: parsed.priorSelectedFormId,
    baselineFormId: baseline.formId,
    eligibleFormIds,
    suppressedFormId,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function isNarratorFormEligibilityDecisionV3(
  value: unknown,
  prompt: unknown,
): value is NarratorFormEligibilityDecisionV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "seedId", "sequenceSlot", "burstIndex", "burstPosition",
      "priorSelectedFormId", "baselineFormId", "eligibleFormIds", "suppressedFormId", "contentHash",
    ])
    || !isDenseArray(value.eligibleFormIds)) return false;
  try {
    const expected = createNarratorFormEligibilityDecisionV3(prompt, {
      seedId: value.seedId,
      sequenceSlot: value.sequenceSlot,
      priorSelectedFormId: value.priorSelectedFormId,
    });
    return canonicalStringify(value) === canonicalStringify(expected);
  } catch {
    return false;
  }
}

export const narratorFormGenerationConfigurationV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-generation:v3" as const,
  runtime,
  method: "greedy-with-predeclared-prefix-trie" as const,
  logitsProcessorPosition: "append-after-runtime-processors-before-sampler" as const,
  options: {
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
  },
  decoderStartTokenId: 0 as const,
  padTokenId: 0 as const,
  eosTokenId: 1 as const,
  outputAuthority: "raw-token-ids-matched-to-one-eligible-form-target" as const,
  decodedTextAuthority: false as const,
});

export const narratorFormGenerationConfigurationHashV3 = canonicalHash(narratorFormGenerationConfigurationV3);

export const narratorFormFloat32ScoreContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-float32-scores:v3" as const,
  storage: "IEEE-754-binary32-raw-bits-as-uint32" as const,
  byteOrder: "big-endian" as const,
  finiteRequired: true as const,
  selection: "unique-strict-maximum-among-allowed-token-scores" as const,
  exactTopTie: "invalid-selection" as const,
  positiveNegativeZero: "equal-score-tie" as const,
});

export const narratorFormFloat32ScoreHashV3 = canonicalHash(narratorFormFloat32ScoreContractV3);

export const narratorFormTrieSelectionContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-trie-selection:v3" as const,
  prefix: "generated-target-ids-after-decoder-start-before-current-token" as const,
  allowed: "sorted-unique-next-token-ids-from-matching-eligible-targets" as const,
  unaryBranches: "retained-and-scored" as const,
  completedOrUnmatchedPrefix: "invalid" as const,
  emittedToken: "must-be-unique-strict-score-maximum" as const,
  completion: "exactly-one-complete-eligible-target" as const,
  scoreContractHash: narratorFormFloat32ScoreHashV3,
});

export const narratorFormTrieSelectionHashV3 = canonicalHash(narratorFormTrieSelectionContractV3);

export const narratorFormSelectionContractV3 = deepFreeze({
  schemaVersion: 3 as const,
  contractId: "the-grind-2:narrator-form-selection-contract:v3" as const,
  claim: "model-selected-form-with-deterministic-host-rendering" as const,
  modelGeneratedVisibleProse: false as const,
  promptFormatterHash: narratorFormPromptFormatterHashV3,
  formRegistryHash: narratorFormRegistryHashV3,
  rendererHash: narratorFormRendererHashV3,
  renderedSafetyHash: narratorRenderedSafetyHashV3,
  eligibilityPolicyHash: narratorFormEligibilityPolicyHashV3,
  inputTokenAccountingHash: narratorFormInputTokenAccountingHashV3,
  targetTokenAccountingHash: narratorFormTargetTokenAccountingHashV3,
  generationConfigurationHash: narratorFormGenerationConfigurationHashV3,
  float32ScoreHash: narratorFormFloat32ScoreHashV3,
  trieSelectionHash: narratorFormTrieSelectionHashV3,
});

export const narratorFormSelectionContractHashV3 = canonicalHash(narratorFormSelectionContractV3);

export type NarratorTokenIdSequenceV3 = ArrayLike<number | bigint>;

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length
    && keys.every((key, index) => key === String(index));
}

function copyTokenIds(value: NarratorTokenIdSequenceV3, label: string, maximumLength: number): number[] {
  if (typeof value !== "object"
    || value === null
    || !(Array.isArray(value) || ArrayBuffer.isView(value))
    || !Number.isSafeInteger(value.length)
    || value.length < 0) {
    throw new TypeError(`${label} must be an array-like token-id sequence`);
  }
  if (value.length > maximumLength) throw new RangeError(`${label} exceed the token-id sequence budget`);
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== value.length || !ownKeys.every((key, index) => key === String(index))) {
    throw new TypeError(`${label} must be a dense token-id array without extra properties`);
  }
  const result: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const token = value[index];
    if (typeof token === "bigint") {
      if (token < 0n || token > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new TypeError(`${label} contains an invalid token id`);
      }
      result.push(Number(token));
    } else {
      if (!Number.isSafeInteger(token) || (token as number) < 0) {
        throw new TypeError(`${label} contains an invalid token id`);
      }
      result.push(token as number);
    }
  }
  return result;
}

export function countNarratorFormInputTokenIdsV3(inputIds: NarratorTokenIdSequenceV3): number {
  const ids = copyTokenIds(
    inputIds,
    "Narrator form input ids",
    narratorFormInputTokenAccountingContractV3.maximumInputTokens,
  );
  if (ids.length === 0) throw new RangeError("Narrator form input ids are empty");
  if (ids.at(-1) !== narratorFormInputTokenAccountingContractV3.eosTokenId) {
    throw new TypeError("Narrator form input ids must end with the tokenizer-added EOS id");
  }
  return ids.length;
}

export interface NarratorFormTargetObservationV3 {
  readonly formId: NarratorFormIdV3;
  readonly tokenIds: NarratorTokenIdSequenceV3;
  readonly decodedWitness: string;
}

export interface NarratorFormTargetV3 {
  readonly formId: NarratorFormIdV3;
  readonly witness: string;
  readonly tokenIds: readonly number[];
  readonly tokenCount: number;
  readonly contentHash: string;
}

export interface NarratorFormTargetSetV3 {
  readonly schemaVersion: 3;
  readonly move: NarratorMoveV1;
  readonly promptBytesHash: string;
  readonly eligibilityHash: string;
  readonly targets: readonly NarratorFormTargetV3[];
  readonly contentHash: string;
}

function accountTarget(form: NarratorFormDescriptorV3, value: unknown): NarratorFormTargetV3 {
  if (!isNarratorRecord(value)
    || !narratorHasExactKeys(value, ["formId", "tokenIds", "decodedWitness"])
    || value.formId !== form.formId
    || value.decodedWitness !== form.witness) {
    throw new TypeError("Narrator form target observation is invalid");
  }
  const ids = copyTokenIds(
    value.tokenIds as NarratorTokenIdSequenceV3,
    "Narrator form target ids",
    narratorFormTargetTokenAccountingContractV3.maximumTargetTokens,
  );
  if (ids.length === 0) throw new RangeError("Narrator form target ids are empty");
  const eosTokenId = narratorFormTargetTokenAccountingContractV3.eosTokenId;
  if (ids.includes(narratorFormGenerationConfigurationV3.decoderStartTokenId)
    || ids.at(-1) !== eosTokenId
    || ids.slice(0, -1).includes(eosTokenId)) {
    throw new TypeError("Narrator form target ids must contain EOS exactly once at the end");
  }
  if (ids.length !== form.targetTokenIds.length
    || ids.some((tokenId, index) => tokenId !== form.targetTokenIds[index])) {
    throw new TypeError("Narrator form target ids do not match the frozen pinned-tokenizer vector");
  }
  const content = { formId: form.formId, witness: form.witness, tokenIds: ids, tokenCount: ids.length };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

export function accountNarratorFormTargetsV3(
  prompt: unknown,
  eligibility: unknown,
  observations: readonly NarratorFormTargetObservationV3[],
): NarratorFormTargetSetV3 {
  if (!isNarratorPromptV1(prompt)) throw new TypeError("Narrator prompt is invalid");
  if (!isNarratorFormEligibilityDecisionV3(eligibility, prompt)) {
    throw new TypeError("Narrator form eligibility decision is invalid");
  }
  if (!isDenseArray(observations) || observations.length !== eligibility.eligibleFormIds.length) {
    throw new TypeError("Narrator form target observations do not match the eligible form count");
  }
  const targets = eligibility.eligibleFormIds.map((formId, index) => {
    const form = descriptorForId(formId);
    return accountTarget(form, observations[index]);
  });
  const keys = targets.map((target) => target.tokenIds.join(","));
  if (new Set(keys).size !== keys.length) {
    throw new TypeError("Narrator form targets must be unique within the eligible set");
  }
  const content = {
    schemaVersion: 3 as const,
    move: prompt.move,
    promptBytesHash: narratorFormPromptBytesHashV3(prompt),
    eligibilityHash: eligibility.contentHash,
    targets,
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}

function assertStoredTargetSet(
  value: unknown,
  prompt: unknown,
  eligibility: unknown,
): asserts value is NarratorFormTargetSetV3 {
  if (!isNarratorPromptV1(prompt)
    || !isNarratorFormEligibilityDecisionV3(eligibility, prompt)
    || !isNarratorRecord(value)
    || !narratorHasExactKeys(value, [
      "schemaVersion", "move", "promptBytesHash", "eligibilityHash", "targets", "contentHash",
    ])
    || value.schemaVersion !== 3
    || value.move !== prompt.move
    || value.promptBytesHash !== narratorFormPromptBytesHashV3(prompt)
    || value.eligibilityHash !== eligibility.contentHash
    || !isDenseArray(value.targets)
    || value.targets.length < 2
    || value.targets.length > 4
    || !/^[0-9a-f]{16}$/u.test(String(value.contentHash))) {
    throw new TypeError("Narrator form target set is invalid");
  }
  const ids: string[] = [];
  const keys: string[] = [];
  let baselineCount = 0;
  for (const target of value.targets) {
    if (!isNarratorRecord(target)
      || !narratorHasExactKeys(target, ["formId", "witness", "tokenIds", "tokenCount", "contentHash"])
      || !isNarratorFormIdV3(target.formId)) throw new TypeError("Narrator form target is invalid");
    const descriptor = descriptorForId(target.formId);
    if (descriptor.move !== value.move || descriptor.witness !== target.witness) {
      throw new TypeError("Narrator stored form target does not match the registry");
    }
    if (descriptor.baseline) baselineCount += 1;
    const tokenIds = copyTokenIds(
      target.tokenIds as NarratorTokenIdSequenceV3,
      "Narrator stored form target ids",
      narratorFormTargetTokenAccountingContractV3.maximumTargetTokens,
    );
    if (tokenIds.length === 0
      || target.tokenCount !== tokenIds.length
      || tokenIds.includes(narratorFormGenerationConfigurationV3.decoderStartTokenId)
      || tokenIds.at(-1) !== narratorFormTargetTokenAccountingContractV3.eosTokenId
      || tokenIds.slice(0, -1).includes(narratorFormTargetTokenAccountingContractV3.eosTokenId)
      || tokenIds.length !== descriptor.targetTokenIds.length
      || tokenIds.some((tokenId, index) => tokenId !== descriptor.targetTokenIds[index])) {
      throw new TypeError("Narrator stored form target token accounting is invalid");
    }
    const targetContent = {
      formId: target.formId,
      witness: target.witness,
      tokenIds,
      tokenCount: tokenIds.length,
    };
    if (target.contentHash !== canonicalHash(targetContent)) throw new TypeError("Narrator form target hash is invalid");
    ids.push(target.formId);
    keys.push(tokenIds.join(","));
  }
  const expectedOrder = forms.filter((form) => form.move === value.move && ids.includes(form.formId)).map((form) => form.formId);
  const currentMoveForms = forms.filter((form) => form.move === value.move);
  const missingForms = currentMoveForms.filter((form) => !ids.includes(form.formId));
  if (canonicalStringify(ids) !== canonicalStringify(expectedOrder)
    || canonicalStringify(ids) !== canonicalStringify(eligibility.eligibleFormIds)
    || new Set(ids).size !== ids.length
    || new Set(keys).size !== keys.length
    || baselineCount !== 1
    || missingForms.length > 1
    || missingForms.some((form) => form.baseline)) {
    throw new TypeError("Narrator stored form targets violate registry invariants");
  }
  const { contentHash, ...content } = value;
  if (contentHash !== canonicalHash(content)) throw new TypeError("Narrator form target-set hash is invalid");
}

export function allowedNarratorFormTokenIdsV3(
  prompt: unknown,
  eligibility: unknown,
  targetSet: NarratorFormTargetSetV3,
  prefixTokenIds: NarratorTokenIdSequenceV3,
): readonly number[] {
  assertStoredTargetSet(targetSet, prompt, eligibility);
  const prefix = copyTokenIds(
    prefixTokenIds,
    "Narrator form trie prefix",
    narratorFormTargetTokenAccountingContractV3.maximumTargetTokens,
  );
  const matching = targetSet.targets.filter((target) =>
    prefix.length < target.tokenIds.length
    && prefix.every((token, index) => target.tokenIds[index] === token));
  if (matching.length === 0) throw new TypeError("Narrator form trie prefix does not match an incomplete target");
  return Object.freeze([...new Set(matching.map((target) => target.tokenIds[prefix.length]!))]
    .sort((left, right) => left - right));
}

const scoreBuffer = new ArrayBuffer(4);
const scoreView = new DataView(scoreBuffer);

export function narratorFloat32ToBitsV3(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Narrator form score must be finite");
  }
  scoreView.setFloat32(0, value, false);
  return scoreView.getUint32(0, false);
}

export function narratorFloat32FromBitsV3(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 0xffff_ffff) {
    throw new TypeError("Narrator form score bits must be a uint32");
  }
  scoreView.setUint32(0, Number(value), false);
  const score = scoreView.getFloat32(0, false);
  if (!Number.isFinite(score)) throw new TypeError("Narrator form score bits must encode a finite float32");
  return score;
}

export interface NarratorFormSelectionTraceStepV3 {
  readonly prefixTokenIds: readonly number[];
  readonly allowedTokenIds: readonly number[];
  readonly allowedScoreBits: readonly number[];
  readonly emittedTokenId: number;
}

export interface NarratorFormSelectionV3 {
  readonly schemaVersion: 3;
  readonly promptBytesHash: string;
  readonly eligibilityHash: string;
  readonly targetSetHash: string;
  readonly selectedFormId: NarratorFormIdV3;
  readonly selectionTokenIds: readonly number[];
  readonly fullDecoderTokenIds: readonly number[];
  readonly traceHash: string;
  readonly contentHash: string;
}

function exactNumberArray(value: unknown, expected: readonly number[]): boolean {
  return isDenseArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

export function validateNarratorFormSelectionV3(
  prompt: unknown,
  eligibility: unknown,
  fullSequence: NarratorTokenIdSequenceV3,
  trace: unknown,
  targetSet: NarratorFormTargetSetV3,
): NarratorFormSelectionV3 {
  assertStoredTargetSet(targetSet, prompt, eligibility);
  const fullDecoderTokenIds = copyTokenIds(
    fullSequence,
    "Narrator form full decoder ids",
    narratorMaximumOutputTokens + 1,
  );
  if (fullDecoderTokenIds[0] !== narratorFormGenerationConfigurationV3.decoderStartTokenId) {
    throw new TypeError("Narrator form full decoder ids must begin with the decoder-start id");
  }
  const selectionTokenIds = fullDecoderTokenIds.slice(1);
  if (selectionTokenIds.length === 0
    || selectionTokenIds.at(-1) !== narratorFormGenerationConfigurationV3.eosTokenId
    || selectionTokenIds.slice(0, -1).includes(narratorFormGenerationConfigurationV3.eosTokenId)) {
    throw new TypeError("Narrator form selection ids must contain EOS exactly once at the end");
  }
  if (!isDenseArray(trace) || trace.length !== selectionTokenIds.length) {
    throw new TypeError("Narrator form selection trace length is invalid");
  }
  const storedTrace: NarratorFormSelectionTraceStepV3[] = [];
  for (let index = 0; index < trace.length; index += 1) {
    const step: unknown = trace[index];
    if (!isNarratorRecord(step)
      || !narratorHasExactKeys(step, ["prefixTokenIds", "allowedTokenIds", "allowedScoreBits", "emittedTokenId"])) {
      throw new TypeError("Narrator form selection trace step is invalid");
    }
    const prefix = selectionTokenIds.slice(0, index);
    const allowed = allowedNarratorFormTokenIdsV3(prompt, eligibility, targetSet, prefix);
    if (!exactNumberArray(step.prefixTokenIds, prefix)
      || !exactNumberArray(step.allowedTokenIds, allowed)
      || !isDenseArray(step.allowedScoreBits)
      || step.allowedScoreBits.length !== allowed.length
      || !Number.isSafeInteger(step.emittedTokenId)
      || step.emittedTokenId !== selectionTokenIds[index]) {
      throw new TypeError("Narrator form selection trace does not match the trie path");
    }
    const allowedScoreBits = step.allowedScoreBits as readonly unknown[];
    const normalizedScoreBits = allowedScoreBits.map((bits) => {
      narratorFloat32FromBitsV3(bits);
      return Number(bits);
    });
    const scores: number[] = normalizedScoreBits.map((bits) => narratorFloat32FromBitsV3(bits));
    const maximum = Math.max(...scores);
    const maximumIndexes: number[] = scores.flatMap((score: number, scoreIndex: number) =>
      score === maximum ? [scoreIndex] : []);
    if (maximumIndexes.length !== 1) throw new TypeError("Narrator form selection trace has an exact top-score tie");
    const selectedIndex = maximumIndexes[0]!;
    if (allowed[selectedIndex] !== step.emittedTokenId) {
      throw new TypeError("Narrator form selection did not emit the unique strict score maximum");
    }
    storedTrace.push({
      prefixTokenIds: [...prefix],
      allowedTokenIds: [...allowed],
      allowedScoreBits: normalizedScoreBits,
      emittedTokenId: Number(step.emittedTokenId),
    });
  }
  const selectedTargets = targetSet.targets.filter((target) => exactNumberArray(target.tokenIds, selectionTokenIds));
  if (selectedTargets.length !== 1) {
    throw new TypeError("Narrator form selection does not complete exactly one eligible target");
  }
  const frozenTrace = deepFreeze(storedTrace);
  const content = {
    schemaVersion: 3 as const,
    promptBytesHash: targetSet.promptBytesHash,
    eligibilityHash: targetSet.eligibilityHash,
    targetSetHash: targetSet.contentHash,
    selectedFormId: selectedTargets[0]!.formId,
    selectionTokenIds,
    fullDecoderTokenIds,
    traceHash: canonicalHash(frozenTrace),
  };
  return deepFreeze({ ...content, contentHash: canonicalHash(content) });
}
