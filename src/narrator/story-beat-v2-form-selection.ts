import {
  factualStoryBeatMaximumOutputTokens,
  factualStoryBeatRequiredClausesV2,
  isFactualStoryBeatPublicFactsV2,
  validateFactualStoryBeatResultV2,
  type FactualStoryBeatPublicFactsV2,
} from "./story-beat-v2";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const factualStoryBeatPresentationBucketIdsV2 = Object.freeze([
  "prefix-as",
  "prefix-while",
  "interior-as",
  "interior-while",
  "suffix-as",
  "suffix-while",
] as const);

export type FactualStoryBeatPresentationBucketIdV2 =
  typeof factualStoryBeatPresentationBucketIdsV2[number];
export type FactualStoryBeatLocationShellV2 = "prefix" | "interior" | "suffix";
export type FactualStoryBeatConnectorV2 = "as" | "while";
export type FactualStoryBeatFormSourceV2 =
  "action" | "compact-action" | "headline" | "consequence";
export type FactualStoryBeatFormIdV2 =
  `${FactualStoryBeatPresentationBucketIdV2}-${FactualStoryBeatFormSourceV2}`;

export interface FactualStoryBeatFormDescriptorV2 {
  readonly formId: FactualStoryBeatFormIdV2;
  readonly locationShell: FactualStoryBeatLocationShellV2;
  readonly frameId: FactualStoryBeatFormSourceV2;
  readonly first: FactualStoryBeatFormSourceV2;
  readonly join: FactualStoryBeatConnectorV2;
  readonly second: "mechanic";
  readonly text: string;
}

export interface FactualStoryBeatFormEligibilityV2 {
  readonly schemaVersion: 2;
  readonly sequenceSlot: number;
  readonly requestedBucketId: FactualStoryBeatPresentationBucketIdV2;
  readonly selectedBucketId: FactualStoryBeatPresentationBucketIdV2 | null;
  readonly forms: readonly FactualStoryBeatFormDescriptorV2[];
}

const wordPattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

function withoutTerminal(value: string, label: string): string {
  if (value.length <= 1 || !/[.!?]$/u.test(value)) {
    throw new TypeError(`Factual story-beat ${label} lacks a terminal sentence mark`);
  }
  return value.slice(0, -1);
}

function lowerInitial(value: string): string {
  return `${value[0]!.toLocaleLowerCase("en-US")}${value.slice(1)}`;
}

function compactAction(actionValue: string): string {
  const action = withoutTerminal(actionValue, "action");
  const marker = " gracefully ";
  if (action.split(marker).length !== 2) {
    throw new TypeError("Factual story-beat action lacks its exact authored marker");
  }
  const [actor, remainder] = action.split(marker);
  const actorWords = actor!.match(wordPattern) ?? [];
  const remainderWords = remainder!.match(wordPattern) ?? [];
  if (actorWords.length === 0 || remainderWords.length === 0) {
    throw new TypeError("Factual story-beat action cannot be compacted");
  }
  return `${actorWords[0]} ${remainderWords[0]}`;
}

interface NarrativeFragment {
  readonly sourceId: FactualStoryBeatFormSourceV2;
  readonly ordinary: string;
  readonly afterPrefix: string;
}

function narrativeFragments(
  facts: FactualStoryBeatPublicFactsV2,
): readonly NarrativeFragment[] {
  const action = withoutTerminal(facts.narrative.action, "action");
  const headline = withoutTerminal(facts.narrative.headline, "headline");
  const consequence = withoutTerminal(facts.narrative.consequence, "consequence");
  const candidates: readonly NarrativeFragment[] = [
    { sourceId: "action", ordinary: action, afterPrefix: action },
    {
      sourceId: "compact-action",
      ordinary: compactAction(facts.narrative.action),
      afterPrefix: compactAction(facts.narrative.action),
    },
    { sourceId: "headline", ordinary: headline, afterPrefix: lowerInitial(headline) },
    {
      sourceId: "consequence",
      ordinary: consequence,
      afterPrefix: lowerInitial(consequence),
    },
  ];
  const seen = new Set<string>();
  return deepFreeze(candidates.filter((candidate) => {
    const identity = `${candidate.ordinary}\u0000${candidate.afterPrefix}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }));
}

function renderForm(
  location: string,
  shell: FactualStoryBeatLocationShellV2,
  fragment: string,
  connector: FactualStoryBeatConnectorV2,
  mechanic: string,
): string {
  if (shell === "prefix") return `At ${location}, ${fragment} ${connector} ${mechanic}.`;
  if (shell === "interior") return `${fragment} at ${location} ${connector} ${mechanic}.`;
  return `${fragment} ${connector} ${mechanic} at ${location}.`;
}

function exactOccurrenceCount(value: string, part: string): number {
  return value.split(part).length - 1;
}

function validForm(
  value: string,
  facts: FactualStoryBeatPublicFactsV2,
  clauses: readonly string[],
): boolean {
  const lower = value.toLocaleLowerCase("en-US");
  return value.length > 0
    && value.length <= 160
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value)
    && !value.includes("\n")
    && !value.includes("  ")
    && /^\p{Lu}/u.test(value)
    && value.endsWith(".")
    && exactOccurrenceCount(value, facts.narrative.location) === 1
    && clauses.every((clause) =>
      exactOccurrenceCount(lower, clause.toLocaleLowerCase("en-US")) === 1)
    && (value.match(wordPattern) ?? []).length <= 24
    && validateFactualStoryBeatResultV2(value, facts) === value;
}

function splitBucketId(
  bucketId: FactualStoryBeatPresentationBucketIdV2,
): readonly [FactualStoryBeatLocationShellV2, FactualStoryBeatConnectorV2] {
  const [shell, connector] = bucketId.split("-");
  return [
    shell as FactualStoryBeatLocationShellV2,
    connector as FactualStoryBeatConnectorV2,
  ];
}

export function factualStoryBeatFormsV2(
  factsValue: unknown,
): readonly FactualStoryBeatFormDescriptorV2[] {
  if (!isFactualStoryBeatPublicFactsV2(factsValue)) {
    throw new TypeError("Factual story-beat form facts are invalid");
  }
  const clauses = factualStoryBeatRequiredClausesV2(factsValue);
  if (clauses === null || (clauses.length !== 1 && clauses.length !== 2)) {
    throw new TypeError("Factual story-beat required clauses are invalid");
  }
  const mechanic = clauses.join(" and ");
  const fragments = narrativeFragments(factsValue);
  const forms: FactualStoryBeatFormDescriptorV2[] = [];
  const seenText = new Set<string>();
  for (const bucketId of factualStoryBeatPresentationBucketIdsV2) {
    const [locationShell, join] = splitBucketId(bucketId);
    for (const fragment of fragments) {
      const text = renderForm(
        factsValue.narrative.location,
        locationShell,
        locationShell === "prefix" ? fragment.afterPrefix : fragment.ordinary,
        join,
        mechanic,
      );
      if (seenText.has(text) || !validForm(text, factsValue, clauses)) continue;
      seenText.add(text);
      forms.push({
        formId: `${bucketId}-${fragment.sourceId}`,
        locationShell,
        frameId: fragment.sourceId,
        first: fragment.sourceId,
        join,
        second: "mechanic",
        text,
      });
    }
  }
  if (forms.length === 0) {
    throw new TypeError("Factual story-beat facts have no bounded grounded forms");
  }
  const availableBuckets = new Set(
    forms.map((form) => `${form.locationShell}-${form.join}`),
  );
  if (availableBuckets.size !== factualStoryBeatPresentationBucketIdsV2.length
    || factualStoryBeatPresentationBucketIdsV2.some(
      (bucketId) => !availableBuckets.has(bucketId),
    )) {
    throw new TypeError("Factual story-beat forms do not cover every presentation bucket");
  }
  return deepFreeze(forms);
}

export function selectFactualStoryBeatFormEligibilityV2(
  factsValue: unknown,
  sequenceSlot: number,
): FactualStoryBeatFormEligibilityV2 {
  if (!Number.isSafeInteger(sequenceSlot) || sequenceSlot < 0) {
    throw new TypeError("Factual story-beat presentation sequence slot is invalid");
  }
  const forms = factualStoryBeatFormsV2(factsValue);
  const requestedIndex = sequenceSlot % factualStoryBeatPresentationBucketIdsV2.length;
  const requestedBucketId = factualStoryBeatPresentationBucketIdsV2[requestedIndex]!;
  for (let offset = 0; offset < factualStoryBeatPresentationBucketIdsV2.length; offset += 1) {
    const bucketId = factualStoryBeatPresentationBucketIdsV2[
      (requestedIndex + offset) % factualStoryBeatPresentationBucketIdsV2.length
    ]!;
    const [shell, connector] = splitBucketId(bucketId);
    const eligible = forms.filter((form) =>
      form.locationShell === shell && form.join === connector);
    if (eligible.length > 0) {
      return deepFreeze({
        schemaVersion: 2 as const,
        sequenceSlot,
        requestedBucketId,
        selectedBucketId: bucketId,
        forms: eligible,
      });
    }
  }
  return deepFreeze({
    schemaVersion: 2 as const,
    sequenceSlot,
    requestedBucketId,
    selectedBucketId: null,
    forms: [],
  });
}

export type FactualStoryBeatTokenIdSequenceV2 = ArrayLike<number | bigint>;

export interface FactualStoryBeatFormTargetObservationV2 {
  readonly formId: FactualStoryBeatFormIdV2;
  readonly tokenIds: FactualStoryBeatTokenIdSequenceV2;
  readonly decodedWitness: string;
}

export interface FactualStoryBeatFormTargetV2 {
  readonly formId: FactualStoryBeatFormIdV2;
  readonly text: string;
  readonly tokenIds: readonly number[];
  readonly tokenCount: number;
}

export interface FactualStoryBeatFormTargetSetV2 {
  readonly schemaVersion: 2;
  readonly targets: readonly FactualStoryBeatFormTargetV2[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

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
  const sequence = value as FactualStoryBeatTokenIdSequenceV2;
  if (!Number.isSafeInteger(sequence.length)
    || sequence.length < 0
    || sequence.length > maximumLength) {
    throw new TypeError(`${label} has an invalid length`);
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

function descriptorById(
  forms: readonly FactualStoryBeatFormDescriptorV2[],
  formId: unknown,
): FactualStoryBeatFormDescriptorV2 | null {
  return typeof formId === "string"
    ? forms.find((candidate) => candidate.formId === formId) ?? null
    : null;
}

function assertTargetTokenIds(ids: readonly number[], label: string): void {
  if (ids.length === 0
    || ids.includes(0)
    || ids.at(-1) !== 1
    || ids.slice(0, -1).includes(1)) {
    throw new TypeError(`${label} must contain EOS exactly once at the end`);
  }
}

export function accountFactualStoryBeatFormTargetsV2(
  factsValue: unknown,
  observationsValue: unknown,
): FactualStoryBeatFormTargetSetV2 {
  const forms = factualStoryBeatFormsV2(factsValue);
  if (!isDenseArray(observationsValue)
    || observationsValue.length === 0
    || observationsValue.length > forms.length) {
    throw new TypeError("Factual story-beat target observations are invalid or empty");
  }
  let previousFormIndex = -1;
  const targets: FactualStoryBeatFormTargetV2[] = observationsValue.map(
    (observation, index) => {
      if (!isRecord(observation)
        || !hasExactKeys(observation, ["formId", "tokenIds", "decodedWitness"])) {
        throw new TypeError("Factual story-beat target observation is invalid");
      }
      const descriptor = descriptorById(forms, observation.formId);
      if (descriptor === null || observation.decodedWitness !== descriptor.text) {
        throw new TypeError(
          "Factual story-beat target observation does not match its grounded form",
        );
      }
      const formIndex = forms.indexOf(descriptor);
      if (formIndex <= previousFormIndex) {
        throw new TypeError(
          "Factual story-beat target observations are duplicated or out of order",
        );
      }
      previousFormIndex = formIndex;
      const tokenIds = copyTokenIds(
        observation.tokenIds,
        `Factual story-beat form target ${index} ids`,
        factualStoryBeatMaximumOutputTokens,
      );
      assertTargetTokenIds(tokenIds, `Factual story-beat form target ${index} ids`);
      return {
        formId: descriptor.formId,
        text: descriptor.text,
        tokenIds,
        tokenCount: tokenIds.length,
      };
    },
  );
  const tokenKeys = targets.map((target) => target.tokenIds.join(","));
  if (new Set(tokenKeys).size !== tokenKeys.length) {
    throw new TypeError("Factual story-beat form targets must have unique token sequences");
  }
  return deepFreeze({ schemaVersion: 2 as const, targets });
}

function assertTargetSet(
  factsValue: unknown,
  targetSetValue: unknown,
): asserts targetSetValue is FactualStoryBeatFormTargetSetV2 {
  const forms = factualStoryBeatFormsV2(factsValue);
  if (!isRecord(targetSetValue)
    || !hasExactKeys(targetSetValue, ["schemaVersion", "targets"])
    || targetSetValue.schemaVersion !== 2
    || !isDenseArray(targetSetValue.targets)
    || targetSetValue.targets.length === 0
    || targetSetValue.targets.length > forms.length) {
    throw new TypeError("Factual story-beat form target set is invalid");
  }
  let previousFormIndex = -1;
  const tokenKeys: string[] = [];
  for (const target of targetSetValue.targets) {
    if (!isRecord(target)
      || !hasExactKeys(target, ["formId", "text", "tokenIds", "tokenCount"])) {
      throw new TypeError("Factual story-beat form target is invalid");
    }
    const descriptor = descriptorById(forms, target.formId);
    const formIndex = descriptor === null ? -1 : forms.indexOf(descriptor);
    const tokenIds = copyTokenIds(
      target.tokenIds,
      "Factual story-beat stored target ids",
      factualStoryBeatMaximumOutputTokens,
    );
    if (descriptor === null
      || formIndex <= previousFormIndex
      || target.text !== descriptor.text
      || target.tokenCount !== tokenIds.length) {
      throw new TypeError("Factual story-beat stored target does not match its grounded form");
    }
    assertTargetTokenIds(tokenIds, "Factual story-beat stored target ids");
    previousFormIndex = formIndex;
    tokenKeys.push(tokenIds.join(","));
  }
  if (new Set(tokenKeys).size !== tokenKeys.length) {
    throw new TypeError("Factual story-beat stored targets must have unique token sequences");
  }
}

function allowedTokenIdsFromVerifiedTargetSet(
  targetSet: FactualStoryBeatFormTargetSetV2,
  prefix: readonly number[],
): readonly number[] {
  const matching = targetSet.targets.filter((target) =>
    prefix.length < target.tokenIds.length
    && prefix.every((tokenId, index) => target.tokenIds[index] === tokenId));
  if (matching.length === 0) {
    throw new TypeError(
      "Factual story-beat trie prefix does not match an incomplete grounded form",
    );
  }
  return Object.freeze([...new Set(
    matching.map((target) => target.tokenIds[prefix.length]!),
  )].sort((left, right) => left - right));
}

export interface FactualStoryBeatLogitsTensorV2 {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

export interface FactualStoryBeatFormSelectionV2 {
  readonly formId: FactualStoryBeatFormIdV2;
  readonly generatedTokenIds: readonly number[];
}

export interface FactualStoryBeatTrieLogitsProcessorV2 {
  process(inputIds: unknown, logits: FactualStoryBeatLogitsTensorV2):
    FactualStoryBeatLogitsTensorV2;
  finalize(fullDecoderTokenIds: FactualStoryBeatTokenIdSequenceV2):
    FactualStoryBeatFormSelectionV2;
}

function copyDecoderInputIds(value: unknown): readonly number[] {
  if (!isDenseArray(value) || value.length !== 1) {
    throw new TypeError("Factual story-beat logits processor requires one decoder batch");
  }
  const decoderIds = copyTokenIds(
    value[0],
    "Factual story-beat decoder input ids",
    factualStoryBeatMaximumOutputTokens + 1,
  );
  if (decoderIds.length === 0 || decoderIds[0] !== 0) {
    throw new TypeError("Factual story-beat decoder input is missing its start token");
  }
  return decoderIds;
}

function isDenseNonNegativeIntegerArray(value: unknown): value is readonly number[] {
  return isDenseArray(value)
    && value.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0);
}

function assertLogitsTensor(
  value: unknown,
): asserts value is FactualStoryBeatLogitsTensorV2 {
  if (!isRecord(value)
    || !isDenseNonNegativeIntegerArray(value.dims)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || !(value.data instanceof Float32Array)
    || value.dims[1] !== value.data.length) {
    throw new TypeError("Factual story-beat logits tensor is invalid");
  }
}

export function createFactualStoryBeatTrieLogitsProcessorV2(
  factsValue: FactualStoryBeatPublicFactsV2,
  targetSet: FactualStoryBeatFormTargetSetV2,
): FactualStoryBeatTrieLogitsProcessorV2 {
  assertTargetSet(factsValue, targetSet);
  const verifiedTargetSet: FactualStoryBeatFormTargetSetV2 = deepFreeze({
    schemaVersion: 2,
    targets: targetSet.targets.map((target) => ({
      formId: target.formId,
      text: target.text,
      tokenIds: [...target.tokenIds],
      tokenCount: target.tokenCount,
    })),
  });
  allowedTokenIdsFromVerifiedTargetSet(verifiedTargetSet, Object.freeze([]));
  let previousPrefix: readonly number[] | null = null;
  let previousExpectedTokenId: number | null = null;
  const expectedGeneratedTokenIds: number[] = [];
  let finalized = false;

  return Object.freeze({
    process(
      inputIds: unknown,
      logits: FactualStoryBeatLogitsTensorV2,
    ): FactualStoryBeatLogitsTensorV2 {
      if (finalized) throw new TypeError("Factual story-beat selection is already finalized");
      const decoderIds = copyDecoderInputIds(inputIds);
      const prefix = Object.freeze(decoderIds.slice(1));
      if (previousPrefix === null) {
        if (prefix.length !== 0) {
          throw new TypeError("Factual story-beat decoder prefix must begin at trie root");
        }
      } else {
        if (prefix.length !== previousPrefix.length + 1
          || !exactNumberArray(prefix.slice(0, -1), previousPrefix)) {
          throw new TypeError("Factual story-beat decoder prefix is not the next trie step");
        }
        if (prefix.at(-1) !== previousExpectedTokenId) {
          throw new TypeError("Factual story-beat decoder did not emit the unique maximum token");
        }
      }
      assertLogitsTensor(logits);
      const allowedTokenIds = allowedTokenIdsFromVerifiedTargetSet(
        verifiedTargetSet,
        prefix,
      );
      if (allowedTokenIds.some((tokenId) => tokenId >= logits.data.length)) {
        throw new RangeError("Factual story-beat allowed token is outside the vocabulary");
      }
      const allowedScores = allowedTokenIds.map((tokenId) => logits.data[tokenId]!);
      if (allowedScores.some((score) => !Number.isFinite(score))) {
        throw new TypeError("Factual story-beat allowed token scores must be finite");
      }
      const maximum = Math.max(...allowedScores);
      const maximumIndexes = allowedScores.flatMap((score, index) =>
        score === maximum ? [index] : []);
      if (maximumIndexes.length !== 1) {
        throw new TypeError("Factual story-beat form selection has an exact top-score tie");
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

    finalize(
      fullDecoderTokenIds: FactualStoryBeatTokenIdSequenceV2,
    ): FactualStoryBeatFormSelectionV2 {
      if (finalized) throw new TypeError("Factual story-beat selection is already finalized");
      finalized = true;
      const fullSequence = copyTokenIds(
        fullDecoderTokenIds,
        "Factual story-beat full decoder ids",
        factualStoryBeatMaximumOutputTokens + 1,
      );
      if (fullSequence[0] !== 0) {
        throw new TypeError("Factual story-beat full decoder ids must begin with start");
      }
      const generatedTokenIds = Object.freeze(fullSequence.slice(1));
      if (generatedTokenIds.length === 0
        || generatedTokenIds.at(-1) !== 1
        || generatedTokenIds.slice(0, -1).includes(1)) {
        throw new TypeError(
          "Factual story-beat generated ids must contain EOS once at the end",
        );
      }
      if (!exactNumberArray(generatedTokenIds, expectedGeneratedTokenIds)) {
        throw new TypeError(
          "Factual story-beat generated ids differ from the unique maximum path",
        );
      }
      const selected = verifiedTargetSet.targets.filter((target) =>
        exactNumberArray(target.tokenIds, generatedTokenIds));
      if (selected.length !== 1) {
        throw new TypeError(
          "Factual story-beat generation does not complete exactly one grounded form",
        );
      }
      return deepFreeze({
        formId: selected[0]!.formId,
        generatedTokenIds: [...generatedTokenIds],
      });
    },
  });
}
