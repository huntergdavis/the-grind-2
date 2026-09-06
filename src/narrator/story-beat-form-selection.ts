import {
  isStoryBeatPublicFactsV1,
  storyBeatMaximumOutputTokens,
  validateStoryBeatResultV1,
  type StoryBeatPublicFactsV1,
} from "./story-beat";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const storyBeatFormLocationShells = Object.freeze([
  "prefix",
  "interior",
  "suffix",
] as const);
export type StoryBeatFormLocationShell = typeof storyBeatFormLocationShells[number];

type StoryBeatFormSource = "headline" | "action" | "consequence";
type StoryBeatFormJoin = "while" | "as" | "semicolon" | "and";

const storyBeatFrameDefinitions = deepFreeze([
  { frameId: "action-while-consequence", first: "action", join: "while", second: "consequence" },
  { frameId: "consequence-while-action", first: "consequence", join: "while", second: "action" },
  { frameId: "headline-while-action", first: "headline", join: "while", second: "action" },
  { frameId: "action-as-headline", first: "action", join: "as", second: "headline" },
  { frameId: "headline-as-consequence", first: "headline", join: "as", second: "consequence" },
  { frameId: "consequence-as-headline", first: "consequence", join: "as", second: "headline" },
  { frameId: "action-semicolon-consequence", first: "action", join: "semicolon", second: "consequence" },
  { frameId: "consequence-semicolon-action", first: "consequence", join: "semicolon", second: "action" },
  { frameId: "headline-semicolon-action", first: "headline", join: "semicolon", second: "action" },
  { frameId: "action-semicolon-headline", first: "action", join: "semicolon", second: "headline" },
  { frameId: "headline-semicolon-consequence", first: "headline", join: "semicolon", second: "consequence" },
  { frameId: "consequence-semicolon-headline", first: "consequence", join: "semicolon", second: "headline" },
  { frameId: "action-and-consequence", first: "action", join: "and", second: "consequence" },
  { frameId: "headline-and-action", first: "headline", join: "and", second: "action" },
  { frameId: "headline-and-consequence", first: "headline", join: "and", second: "consequence" },
] as const satisfies readonly {
  readonly frameId: string;
  readonly first: StoryBeatFormSource;
  readonly join: StoryBeatFormJoin;
  readonly second: StoryBeatFormSource;
}[]);

export const storyBeatFormFrameIds = Object.freeze(
  storyBeatFrameDefinitions.map((frame) => frame.frameId),
);
export type StoryBeatFormFrameId = typeof storyBeatFrameDefinitions[number]["frameId"];
export type StoryBeatFormId = `${StoryBeatFormLocationShell}-${StoryBeatFormFrameId}`;

export interface StoryBeatFormDescriptor {
  readonly formId: StoryBeatFormId;
  readonly locationShell: StoryBeatFormLocationShell;
  readonly frameId: StoryBeatFormFrameId;
  readonly first: StoryBeatFormSource;
  readonly join: StoryBeatFormJoin;
  readonly second: StoryBeatFormSource;
  readonly text: string;
}

function withoutTerminalSentenceMark(value: string): string | null {
  return /[.!?]$/u.test(value) && value.length > 1 ? value.slice(0, -1) : null;
}

function lowerInitial(value: string): string {
  return `${value[0]!.toLocaleLowerCase("en-US")}${value.slice(1)}`;
}

function joinFragments(first: string, join: StoryBeatFormJoin, second: string): string {
  if (join === "semicolon") return `${first}; ${second}`;
  if (join === "and") return `${first} and ${second}`;
  return `${first}, ${join} ${second}`;
}

function renderForm(
  location: string,
  shell: StoryBeatFormLocationShell,
  first: string,
  join: StoryBeatFormJoin,
  second: string,
): string {
  if (shell === "prefix") return `At ${location}, ${joinFragments(first, join, second)}.`;
  if (shell === "suffix") return `${joinFragments(first, join, second)} at ${location}.`;
  const joined = join === "semicolon"
    ? `${first} at ${location}; ${second}`
    : join === "and"
      ? `${first} at ${location} and ${second}`
      : `${first} at ${location}, ${join} ${second}`;
  return `${joined}.`;
}

export function storyBeatForms(factsValue: unknown): readonly StoryBeatFormDescriptor[] {
  if (!isStoryBeatPublicFactsV1(factsValue)) {
    throw new TypeError("Story-beat form facts are invalid");
  }
  const headline = withoutTerminalSentenceMark(factsValue.headline);
  const action = withoutTerminalSentenceMark(factsValue.action);
  const consequence = withoutTerminalSentenceMark(factsValue.consequence);
  if (headline === null || action === null || consequence === null) return Object.freeze([]);
  const fragments: Readonly<Record<StoryBeatFormSource, {
    readonly sentenceInitial: string;
    readonly interior: string;
  }>> = deepFreeze({
    headline: { sentenceInitial: headline, interior: lowerInitial(headline) },
    action: { sentenceInitial: action, interior: action },
    consequence: { sentenceInitial: consequence, interior: lowerInitial(consequence) },
  });
  const forms: StoryBeatFormDescriptor[] = [];
  const seenText = new Set<string>();
  for (const frame of storyBeatFrameDefinitions) {
    for (const locationShell of storyBeatFormLocationShells) {
      const text = renderForm(
        factsValue.location,
        locationShell,
        locationShell === "prefix"
          ? fragments[frame.first].interior
          : fragments[frame.first].sentenceInitial,
        frame.join,
        fragments[frame.second].interior,
      );
      if (seenText.has(text) || validateStoryBeatResultV1(text, factsValue) !== text) continue;
      seenText.add(text);
      forms.push({
        formId: `${locationShell}-${frame.frameId}`,
        locationShell,
        frameId: frame.frameId,
        first: frame.first,
        join: frame.join,
        second: frame.second,
        text,
      });
    }
  }
  return deepFreeze(forms);
}

export type StoryBeatTokenIdSequence = ArrayLike<number | bigint>;

export interface StoryBeatFormTargetObservation {
  readonly formId: StoryBeatFormId;
  readonly tokenIds: StoryBeatTokenIdSequence;
  readonly decodedWitness: string;
}

export interface StoryBeatFormTarget {
  readonly formId: StoryBeatFormId;
  readonly text: string;
  readonly tokenIds: readonly number[];
  readonly tokenCount: number;
}

export interface StoryBeatFormTargetSet {
  readonly schemaVersion: 1;
  readonly targets: readonly StoryBeatFormTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === value.length && keys.every((key, index) => key === String(index));
}

function copyTokenIds(value: unknown, label: string, maximumLength: number): readonly number[] {
  if (typeof value !== "object"
    || value === null
    || !(Array.isArray(value) || ArrayBuffer.isView(value))) {
    throw new TypeError(`${label} must be an array-like token-id sequence`);
  }
  const sequence = value as StoryBeatTokenIdSequence;
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

function descriptorById(
  forms: readonly StoryBeatFormDescriptor[],
  formId: unknown,
): StoryBeatFormDescriptor | null {
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

export function accountStoryBeatFormTargets(
  factsValue: unknown,
  observationsValue: unknown,
): StoryBeatFormTargetSet {
  const forms = storyBeatForms(factsValue);
  if (!isDenseArray(observationsValue)
    || observationsValue.length === 0
    || observationsValue.length > forms.length) {
    throw new TypeError("Story-beat target observations are invalid or empty");
  }
  let previousFormIndex = -1;
  const targets: StoryBeatFormTarget[] = observationsValue.map((observation, index) => {
    if (!isRecord(observation)
      || !hasExactKeys(observation, ["formId", "tokenIds", "decodedWitness"])) {
      throw new TypeError("Story-beat target observation is invalid");
    }
    const descriptor = descriptorById(forms, observation.formId);
    if (descriptor === null || observation.decodedWitness !== descriptor.text) {
      throw new TypeError("Story-beat target observation does not match its grounded form");
    }
    const formIndex = forms.indexOf(descriptor);
    if (formIndex <= previousFormIndex) {
      throw new TypeError("Story-beat target observations are duplicated or out of order");
    }
    previousFormIndex = formIndex;
    const tokenIds = copyTokenIds(
      observation.tokenIds,
      `Story-beat form target ${index} ids`,
      storyBeatMaximumOutputTokens,
    );
    assertTargetTokenIds(tokenIds, `Story-beat form target ${index} ids`);
    return {
      formId: descriptor.formId,
      text: descriptor.text,
      tokenIds,
      tokenCount: tokenIds.length,
    };
  });
  const tokenKeys = targets.map((target) => target.tokenIds.join(","));
  if (new Set(tokenKeys).size !== tokenKeys.length) {
    throw new TypeError("Story-beat form targets must have unique token sequences");
  }
  return deepFreeze({ schemaVersion: 1 as const, targets });
}

function assertTargetSet(
  factsValue: unknown,
  targetSetValue: unknown,
): asserts targetSetValue is StoryBeatFormTargetSet {
  const forms = storyBeatForms(factsValue);
  if (!isRecord(targetSetValue)
    || !hasExactKeys(targetSetValue, ["schemaVersion", "targets"])
    || targetSetValue.schemaVersion !== 1
    || !isDenseArray(targetSetValue.targets)
    || targetSetValue.targets.length === 0
    || targetSetValue.targets.length > forms.length) {
    throw new TypeError("Story-beat form target set is invalid");
  }
  let previousFormIndex = -1;
  const tokenKeys: string[] = [];
  for (const target of targetSetValue.targets) {
    if (!isRecord(target)
      || !hasExactKeys(target, ["formId", "text", "tokenIds", "tokenCount"])) {
      throw new TypeError("Story-beat form target is invalid");
    }
    const descriptor = descriptorById(forms, target.formId);
    const formIndex = descriptor === null ? -1 : forms.indexOf(descriptor);
    const tokenIds = copyTokenIds(
      target.tokenIds,
      "Story-beat stored target ids",
      storyBeatMaximumOutputTokens,
    );
    if (descriptor === null
      || formIndex <= previousFormIndex
      || target.text !== descriptor.text
      || target.tokenCount !== tokenIds.length) {
      throw new TypeError("Story-beat stored target does not match its grounded form");
    }
    assertTargetTokenIds(tokenIds, "Story-beat stored target ids");
    previousFormIndex = formIndex;
    tokenKeys.push(tokenIds.join(","));
  }
  if (new Set(tokenKeys).size !== tokenKeys.length) {
    throw new TypeError("Story-beat stored targets must have unique token sequences");
  }
}

export function storyBeatAllowedTokenIds(
  factsValue: unknown,
  targetSet: StoryBeatFormTargetSet,
  prefixTokenIds: StoryBeatTokenIdSequence,
): readonly number[] {
  assertTargetSet(factsValue, targetSet);
  const prefix = copyTokenIds(
    prefixTokenIds,
    "Story-beat trie prefix",
    storyBeatMaximumOutputTokens,
  );
  return allowedTokenIdsFromVerifiedTargetSet(targetSet, prefix);
}

function allowedTokenIdsFromVerifiedTargetSet(
  targetSet: StoryBeatFormTargetSet,
  prefix: readonly number[],
): readonly number[] {
  const matching = targetSet.targets.filter((target) =>
    prefix.length < target.tokenIds.length
    && prefix.every((tokenId, index) => target.tokenIds[index] === tokenId));
  if (matching.length === 0) {
    throw new TypeError("Story-beat trie prefix does not match an incomplete grounded form");
  }
  return Object.freeze([...new Set(
    matching.map((target) => target.tokenIds[prefix.length]!),
  )].sort((left, right) => left - right));
}

export interface StoryBeatLogitsTensor {
  readonly dims: readonly number[];
  readonly data: Float32Array;
}

export interface StoryBeatFormSelection {
  readonly formId: StoryBeatFormId;
  readonly generatedTokenIds: readonly number[];
}

export interface StoryBeatTrieLogitsProcessor {
  process(inputIds: unknown, logits: StoryBeatLogitsTensor): StoryBeatLogitsTensor;
  finalize(fullDecoderTokenIds: StoryBeatTokenIdSequence): StoryBeatFormSelection;
}

function copyDecoderInputIds(value: unknown): readonly number[] {
  if (!isDenseArray(value) || value.length !== 1) {
    throw new TypeError("Story-beat logits processor requires one dense decoder batch");
  }
  const decoderIds = copyTokenIds(
    value[0],
    "Story-beat decoder input ids",
    storyBeatMaximumOutputTokens + 1,
  );
  if (decoderIds.length === 0 || decoderIds[0] !== 0) {
    throw new TypeError("Story-beat decoder input is missing its decoder-start token");
  }
  return decoderIds;
}

function isDenseNonNegativeIntegerArray(value: unknown): value is readonly number[] {
  return isDenseArray(value)
    && value.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0);
}

function assertLogitsTensor(value: unknown): asserts value is StoryBeatLogitsTensor {
  if (!isRecord(value)
    || !isDenseNonNegativeIntegerArray(value.dims)
    || value.dims.length !== 2
    || value.dims[0] !== 1
    || !(value.data instanceof Float32Array)
    || value.dims[1] !== value.data.length) {
    throw new TypeError("Story-beat logits tensor is invalid");
  }
}

export function createStoryBeatTrieLogitsProcessor(
  factsValue: StoryBeatPublicFactsV1,
  targetSet: StoryBeatFormTargetSet,
): StoryBeatTrieLogitsProcessor {
  assertTargetSet(factsValue, targetSet);
  const verifiedTargetSet: StoryBeatFormTargetSet = deepFreeze({
    schemaVersion: 1,
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
    process(inputIds: unknown, logits: StoryBeatLogitsTensor): StoryBeatLogitsTensor {
      if (finalized) throw new TypeError("Story-beat form selection is already finalized");
      const decoderIds = copyDecoderInputIds(inputIds);
      const prefix = Object.freeze(decoderIds.slice(1));
      if (previousPrefix === null) {
        if (prefix.length !== 0) {
          throw new TypeError("Story-beat decoder prefix must begin at the trie root");
        }
      } else {
        if (prefix.length !== previousPrefix.length + 1
          || !exactNumberArray(prefix.slice(0, -1), previousPrefix)) {
          throw new TypeError("Story-beat decoder prefix is not the next trie step");
        }
        if (prefix.at(-1) !== previousExpectedTokenId) {
          throw new TypeError("Story-beat decoder did not emit the unique maximum token");
        }
      }

      assertLogitsTensor(logits);
      const allowedTokenIds = allowedTokenIdsFromVerifiedTargetSet(verifiedTargetSet, prefix);
      if (allowedTokenIds.some((tokenId) => tokenId >= logits.data.length)) {
        throw new RangeError("Story-beat allowed token is outside the logits vocabulary");
      }
      const allowedScores = allowedTokenIds.map((tokenId) => logits.data[tokenId]!);
      if (allowedScores.some((score) => !Number.isFinite(score))) {
        throw new TypeError("Story-beat allowed token scores must be finite");
      }
      const maximum = Math.max(...allowedScores);
      const maximumIndexes = allowedScores.flatMap((score, index) =>
        score === maximum ? [index] : []);
      if (maximumIndexes.length !== 1) {
        throw new TypeError("Story-beat form selection has an exact top-score tie");
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

    finalize(fullDecoderTokenIds: StoryBeatTokenIdSequence): StoryBeatFormSelection {
      if (finalized) throw new TypeError("Story-beat form selection is already finalized");
      finalized = true;
      const fullSequence = copyTokenIds(
        fullDecoderTokenIds,
        "Story-beat full decoder ids",
        storyBeatMaximumOutputTokens + 1,
      );
      if (fullSequence[0] !== 0) {
        throw new TypeError("Story-beat full decoder ids must begin with decoder-start");
      }
      const generatedTokenIds = Object.freeze(fullSequence.slice(1));
      if (generatedTokenIds.length === 0
        || generatedTokenIds.at(-1) !== 1
        || generatedTokenIds.slice(0, -1).includes(1)) {
        throw new TypeError("Story-beat generated ids must contain EOS exactly once at the end");
      }
      if (!exactNumberArray(generatedTokenIds, expectedGeneratedTokenIds)) {
        throw new TypeError("Story-beat generated ids do not match the unique maximum trie path");
      }
      const selected = verifiedTargetSet.targets.filter((target) =>
        exactNumberArray(target.tokenIds, generatedTokenIds));
      if (selected.length !== 1) {
        throw new TypeError("Story-beat generation does not complete exactly one grounded form");
      }
      return deepFreeze({
        formId: selected[0]!.formId,
        generatedTokenIds: [...generatedTokenIds],
      });
    },
  });
}
