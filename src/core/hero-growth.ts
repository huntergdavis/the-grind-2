import { canonicalHash, canonicalStringify } from "./canonical";
import { recordedDepthCommandTypes, type HeroValue, type RecordedDepthCommandType } from "./types";
import {
  derivedStats,
  derivedStatsFromInputs,
  equippedModifierTotals,
  heroLevelForExperience,
  heroMechanicalLevel,
  type DerivedHeroStats,
  type EquippedModifierTotals,
} from "../depth/rpg";
import type {
  AttributeName,
  DetailedHeroState,
  HeroAttributes,
  HeroGrowthCandidate,
  HeroGrowthPackageId,
  HeroGrowthPackageTotals,
  HeroGrowthReasonCode,
  HeroGrowthRecord,
  HeroGrowthState,
  HeroGrowthTrigger,
  HeroResources,
} from "../depth/types";

export const heroGrowthRulesVersion = "three-turning-points-v1" as const;
export const heroGrowthCheckpointLevels = Object.freeze([10, 25, 50] as const);
export const maximumHeroGrowthRecords = heroGrowthCheckpointLevels.length;
export const maximumHeroGrowthSelectionsPerPackage = 2;

const validatedFrozenGrowthStates = new WeakMap<object, { readonly key: string; readonly tick: number }>();

export const heroGrowthPackageOrder = Object.freeze([
  "growth-v1:field-temper",
  "growth-v1:road-rhythm",
  "growth-v1:inner-pattern",
] as const satisfies readonly HeroGrowthPackageId[]);

export const heroGrowthPackageLabels: Readonly<Record<HeroGrowthPackageId, string>> = Object.freeze({
  "growth-v1:field-temper": "Field Temper",
  "growth-v1:road-rhythm": "Road Rhythm",
  "growth-v1:inner-pattern": "Inner Pattern",
});

const packageAttributes: Readonly<Record<HeroGrowthPackageId, readonly [AttributeName, AttributeName]>> = Object.freeze({
  "growth-v1:field-temper": ["strength", "vitality"],
  "growth-v1:road-rhythm": ["agility", "luck"],
  "growth-v1:inner-pattern": ["intellect", "spirit"],
});

const attributeNames = Object.freeze([
  "strength",
  "agility",
  "vitality",
  "intellect",
  "spirit",
  "luck",
] as const satisfies readonly AttributeName[]);

const modifierNames = Object.freeze([
  ...attributeNames,
  "power",
  "armor",
  "maxHealth",
  "maxMana",
] as const);

const sourceAffinity: Readonly<Partial<Record<RecordedDepthCommandType, HeroGrowthPackageId>>> = Object.freeze({
  "start-combat": "growth-v1:field-temper",
  "combat-action": "growth-v1:field-temper",
  "start-counter-duel": "growth-v1:field-temper",
  "counter-duel-action": "growth-v1:field-temper",
  "plan-route": "growth-v1:road-rhythm",
  travel: "growth-v1:road-rhythm",
  "visit-town": "growth-v1:road-rhythm",
  "enter-dungeon": "growth-v1:road-rhythm",
  "move-dungeon": "growth-v1:road-rhythm",
  "disarm-dungeon-trap": "growth-v1:inner-pattern",
  "unlock-dungeon-gate": "growth-v1:inner-pattern",
  "train-ability": "growth-v1:inner-pattern",
});

const classAffinity: Readonly<Record<string, HeroGrowthPackageId>> = Object.freeze({
  Wayfinder: "growth-v1:road-rhythm",
  Warden: "growth-v1:field-temper",
  Spellblade: "growth-v1:inner-pattern",
  Tinker: "growth-v1:inner-pattern",
  Wildspeaker: "growth-v1:inner-pattern",
});

const valueAffinity: Readonly<Record<HeroValue, readonly HeroGrowthPackageId[]>> = Object.freeze({
  courage: ["growth-v1:field-temper"],
  curiosity: ["growth-v1:road-rhythm", "growth-v1:inner-pattern"],
  mercy: ["growth-v1:inner-pattern"],
  loyalty: ["growth-v1:field-temper", "growth-v1:road-rhythm"],
});

export interface HeroGrowthContext {
  readonly campaignId: string;
  readonly seed: string;
  readonly heroId: string;
  readonly heroName: string;
  readonly className: string;
  readonly values: readonly HeroValue[];
  readonly tick: number;
  readonly sourceCommandId: string;
  readonly sourceCommandType: RecordedDepthCommandType;
  readonly experienceBefore: number;
  readonly experienceAfter: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly encounterActiveAfter: boolean;
}

export interface HeroGrowthApplication {
  readonly state: HeroGrowthState;
  readonly hero: DetailedHeroState;
  readonly appliedRecords: readonly HeroGrowthRecord[];
  readonly queuedTriggers: readonly HeroGrowthTrigger[];
}

interface CandidateInput {
  readonly campaignId: string;
  readonly seed: string;
  readonly heroId: string;
  readonly className: string;
  readonly values: readonly HeroValue[];
  readonly checkpointLevel: 10 | 25 | 50;
  readonly sourceCommandId: string;
  readonly sourceCommandType: RecordedDepthCommandType;
  readonly appliedLevel: number;
  readonly packageSelections: HeroGrowthPackageTotals;
  readonly attributesBefore: HeroAttributes;
  readonly resourcesBefore: HeroResources;
  readonly equipmentModifiers: EquippedModifierTotals;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function boundedText(value: unknown, maximum = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function sameValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalStringify(left) === canonicalStringify(right);
  } catch {
    return false;
  }
}

function copyAttributes(attributes: HeroAttributes): HeroAttributes {
  return { ...attributes };
}

function zeroAttributes(): HeroAttributes {
  return { strength: 0, agility: 0, vitality: 0, intellect: 0, spirit: 0, luck: 0 };
}

function emptyPackageTotals(): HeroGrowthPackageTotals {
  return { "growth-v1:field-temper": 0, "growth-v1:road-rhythm": 0, "growth-v1:inner-pattern": 0 };
}

function copyPackageTotals(totals: HeroGrowthPackageTotals): HeroGrowthPackageTotals {
  return { ...totals };
}

function copyResources(resources: HeroResources): HeroResources {
  return { ...resources };
}

function copyDerived(stats: DerivedHeroStats): HeroGrowthCandidate["derivedAfter"] {
  return { ...stats };
}

function copyModifiers(totals: EquippedModifierTotals): EquippedModifierTotals {
  return Object.fromEntries(
    modifierNames.flatMap((name) => totals[name] === undefined ? [] : [[name, totals[name]]]),
  ) as EquippedModifierTotals;
}

function isCheckpoint(value: unknown): value is 10 | 25 | 50 {
  return heroGrowthCheckpointLevels.includes(value as 10 | 25 | 50);
}

function crossedCheckpoints(levelBefore: number, levelAfter: number): readonly (10 | 25 | 50)[] {
  return heroGrowthCheckpointLevels.filter((level) => level > levelBefore && level <= levelAfter);
}

function packageScore(input: CandidateInput, packageId: HeroGrowthPackageId): {
  readonly score: number;
  readonly tieBreak: number;
  readonly reasonCodes: readonly HeroGrowthReasonCode[];
} {
  let score = 20;
  const reasons: HeroGrowthReasonCode[] = [];
  if (sourceAffinity[input.sourceCommandType] === packageId) {
    score += 6;
    reasons.push(packageId === "growth-v1:field-temper" ? "combat-pressure" : packageId === "growth-v1:road-rhythm" ? "roadcraft" : "disciplined-study");
  }
  if (classAffinity[input.className] === packageId) {
    score += 4;
    reasons.push("class-affinity");
  }
  const matchingValues = input.values.filter((value) => valueAffinity[value].includes(packageId));
  if (matchingValues.length > 0) {
    score += matchingValues.length * 2;
    reasons.push("personal-value");
  }
  const [first, second] = packageAttributes[packageId];
  const minimumPairSum = Math.min(...heroGrowthPackageOrder.map((id) => {
    const [left, right] = packageAttributes[id];
    return input.attributesBefore[left] + input.attributesBefore[right];
  }));
  if (input.attributesBefore[first] + input.attributesBefore[second] === minimumPairSum) {
    score += 3;
    reasons.push("underdeveloped-path");
  }
  score -= input.packageSelections[packageId] * 2;
  reasons.push("steady-practice");
  const tieBreak = Number.parseInt(canonicalHash({
    rulesVersion: heroGrowthRulesVersion,
    campaignId: input.campaignId,
    seed: input.seed,
    heroId: input.heroId,
    sourceCommandId: input.sourceCommandId,
    checkpointLevel: input.checkpointLevel,
    packageId,
  }).slice(0, 8), 16) >>> 0;
  return { score, tieBreak, reasonCodes: Object.freeze(reasons) };
}

function projectCandidate(input: CandidateInput, packageId: HeroGrowthPackageId): HeroGrowthCandidate {
  const deltas = zeroAttributes();
  const attributesAfter = copyAttributes(input.attributesBefore);
  for (const attribute of packageAttributes[packageId]) {
    deltas[attribute] = 1;
    attributesAfter[attribute] += 1;
  }
  const derivedAfter = derivedStatsFromInputs(attributesAfter, heroMechanicalLevel(input.appliedLevel), input.equipmentModifiers);
  const scored = packageScore(input, packageId);
  return Object.freeze({
    schemaVersion: 1,
    packageId,
    label: heroGrowthPackageLabels[packageId],
    score: scored.score,
    tieBreak: scored.tieBreak,
    reasonCodes: scored.reasonCodes,
    attributeDeltas: Object.freeze(deltas),
    attributesAfter: Object.freeze(attributesAfter),
    derivedAfter: Object.freeze(copyDerived(derivedAfter)),
    resourcesAfter: Object.freeze({
      health: input.resourcesBefore.health,
      maxHealth: derivedAfter.maxHealth,
      mana: input.resourcesBefore.mana,
      maxMana: derivedAfter.maxMana,
    }),
  });
}

function projectCandidates(input: CandidateInput): readonly HeroGrowthCandidate[] {
  const legal = heroGrowthPackageOrder.filter((id) => input.packageSelections[id] < maximumHeroGrowthSelectionsPerPackage);
  if (legal.length < 2 || legal.length > 3) throw new Error("Hero growth must offer two or three legal packages");
  return Object.freeze(legal.map((id) => projectCandidate(input, id)));
}

function selectCandidate(candidates: readonly HeroGrowthCandidate[]): HeroGrowthCandidate {
  const selected = [...candidates].sort((left, right) =>
    right.score - left.score
      || left.tieBreak - right.tieBreak
      || (left.packageId < right.packageId ? -1 : left.packageId > right.packageId ? 1 : 0)
  )[0];
  if (selected === undefined) throw new Error("Hero growth has no legal package");
  return selected;
}

function reasonText(reason: HeroGrowthReasonCode): string {
  switch (reason) {
    case "combat-pressure": return "the latest danger demanded a tougher frame";
    case "roadcraft": return "the road rewarded timing and awareness";
    case "disciplined-study": return "careful study exposed a deeper pattern";
    case "class-affinity": return "the path fits their practiced class";
    case "personal-value": return "the path fits their established values";
    case "underdeveloped-path": return "this path needed attention";
    case "steady-practice": return "steady practice broke the tie";
  }
}

function rationaleFor(heroName: string, selected: HeroGrowthCandidate): string {
  return `${heroName} chooses ${selected.label}: ${selected.reasonCodes.slice(0, 2).map(reasonText).join("; ")}.`;
}

function validAttributes(value: unknown, maximum = 999): value is HeroAttributes {
  return isRecord(value) && exactKeys(value, attributeNames) && attributeNames.every((name) => safeInteger(value[name], 0, maximum));
}

function validPackageTotals(value: unknown): value is HeroGrowthPackageTotals {
  return isRecord(value)
    && exactKeys(value, heroGrowthPackageOrder)
    && heroGrowthPackageOrder.every((id) => safeInteger(value[id], 0, maximumHeroGrowthSelectionsPerPackage));
}

function validResources(value: unknown): value is HeroResources {
  return isRecord(value)
    && exactKeys(value, ["health", "maxHealth", "mana", "maxMana"])
    && safeInteger(value.maxHealth, 1)
    && safeInteger(value.health, 0, value.maxHealth as number)
    && safeInteger(value.maxMana, 0)
    && safeInteger(value.mana, 0, value.maxMana as number);
}

function validDerived(value: unknown): value is HeroGrowthCandidate["derivedAfter"] {
  return isRecord(value)
    && exactKeys(value, ["power", "armor", "initiative", "maxHealth", "maxMana"])
    && ["power", "armor", "initiative", "maxHealth", "maxMana"].every((key) => safeInteger(value[key], 0));
}

function validModifiers(value: unknown): value is EquippedModifierTotals {
  return isRecord(value)
    && Object.keys(value).every((key) => modifierNames.includes(key as typeof modifierNames[number]))
    && Object.values(value).every((amount) => safeInteger(amount, 0, 600));
}

function validTrigger(value: unknown, maximumTick: number): value is HeroGrowthTrigger {
  if (!isRecord(value) || !exactKeys(value, [
    "schemaVersion", "checkpointLevel", "crossedTick", "sourceCommandId", "sourceCommandType",
    "experienceBefore", "experienceAfter", "levelBefore", "levelAfter",
  ])) return false;
  return value.schemaVersion === 1
    && isCheckpoint(value.checkpointLevel)
    && safeInteger(value.crossedTick, 1, maximumTick)
    && boundedText(value.sourceCommandId)
    && recordedDepthCommandTypes.includes(value.sourceCommandType as RecordedDepthCommandType)
    && safeInteger(value.experienceBefore, 0)
    && safeInteger(value.experienceAfter, (value.experienceBefore as number) + 1)
    && safeInteger(value.levelBefore, 1, 999)
    && safeInteger(value.levelAfter, (value.levelBefore as number) + 1, 1_000)
    && value.levelBefore === heroLevelForExperience(value.experienceBefore as number)
    && value.levelAfter === heroLevelForExperience(value.experienceAfter as number)
    && (value.levelBefore as number) < (value.checkpointLevel as number)
    && (value.levelAfter as number) >= (value.checkpointLevel as number);
}

function validCandidate(value: unknown): value is HeroGrowthCandidate {
  if (!isRecord(value) || !exactKeys(value, [
    "schemaVersion", "packageId", "label", "score", "tieBreak", "reasonCodes", "attributeDeltas",
    "attributesAfter", "derivedAfter", "resourcesAfter",
  ])) return false;
  return value.schemaVersion === 1
    && heroGrowthPackageOrder.includes(value.packageId as HeroGrowthPackageId)
    && value.label === heroGrowthPackageLabels[value.packageId as HeroGrowthPackageId]
    && safeInteger(value.score, -1_000, 1_000)
    && safeInteger(value.tieBreak, 0, 0xffff_ffff)
    && Array.isArray(value.reasonCodes)
    && value.reasonCodes.length >= 1
    && value.reasonCodes.length <= 5
    && value.reasonCodes.every((reason) => [
      "combat-pressure", "roadcraft", "disciplined-study", "class-affinity", "personal-value",
      "underdeveloped-path", "steady-practice",
    ].includes(reason as string))
    && validAttributes(value.attributeDeltas, 1)
    && attributeNames.reduce((total, name) => total + (value.attributeDeltas as HeroAttributes)[name], 0) === 2
    && validAttributes(value.attributesAfter)
    && validDerived(value.derivedAfter)
    && validResources(value.resourcesAfter);
}

function recordWithoutId(record: HeroGrowthRecord): Omit<HeroGrowthRecord, "id"> {
  const copy = { ...record } as Partial<HeroGrowthRecord>;
  delete copy.id;
  return copy as Omit<HeroGrowthRecord, "id">;
}

function recordId(campaignId: string, record: Omit<HeroGrowthRecord, "id">): string {
  return `${campaignId}:growth:${canonicalHash(record)}`;
}

function createTrigger(checkpointLevel: 10 | 25 | 50, context: HeroGrowthContext): HeroGrowthTrigger {
  return Object.freeze({
    schemaVersion: 1,
    checkpointLevel,
    crossedTick: context.tick,
    sourceCommandId: context.sourceCommandId,
    sourceCommandType: context.sourceCommandType,
    experienceBefore: context.experienceBefore,
    experienceAfter: context.experienceAfter,
    levelBefore: context.levelBefore,
    levelAfter: context.levelAfter,
  });
}

function applyTrigger(
  state: HeroGrowthState,
  hero: DetailedHeroState,
  trigger: HeroGrowthTrigger,
  context: Pick<HeroGrowthContext, "campaignId" | "seed" | "values" | "tick">,
): { readonly state: HeroGrowthState; readonly hero: DetailedHeroState; readonly record: HeroGrowthRecord } {
  const packageSelections = copyPackageTotals(state.packageSelections);
  const attributesBefore = copyAttributes(hero.attributes);
  const resourcesBefore = copyResources(hero.resources);
  const equipmentModifiers = copyModifiers(equippedModifierTotals(hero));
  const candidates = projectCandidates({
    campaignId: context.campaignId,
    seed: context.seed,
    heroId: hero.id,
    className: hero.className,
    values: context.values,
    checkpointLevel: trigger.checkpointLevel,
    sourceCommandId: trigger.sourceCommandId,
    sourceCommandType: trigger.sourceCommandType,
    appliedLevel: hero.level,
    packageSelections,
    attributesBefore,
    resourcesBefore,
    equipmentModifiers,
  });
  const selected = selectCandidate(candidates);
  const withoutId: Omit<HeroGrowthRecord, "id"> = {
    schemaVersion: 1,
    tick: context.tick,
    crossedTick: trigger.crossedTick,
    heroId: hero.id,
    checkpointLevel: trigger.checkpointLevel,
    sourceCommandId: trigger.sourceCommandId,
    sourceCommandType: trigger.sourceCommandType,
    experienceBefore: trigger.experienceBefore,
    experienceAfter: trigger.experienceAfter,
    levelBefore: trigger.levelBefore,
    levelAfter: trigger.levelAfter,
    appliedLevel: hero.level,
    packageTotalsBefore: Object.freeze(packageSelections),
    attributesBefore: Object.freeze(attributesBefore),
    derivedBefore: Object.freeze(copyDerived(derivedStats(hero))),
    resourcesBefore: Object.freeze(resourcesBefore),
    equipmentModifiers: Object.freeze(equipmentModifiers),
    candidates,
    selectedPackageId: selected.packageId,
    rationale: rationaleFor(hero.name, selected),
  };
  const record: HeroGrowthRecord = Object.freeze({ ...withoutId, id: recordId(context.campaignId, withoutId) });
  const nextHero: DetailedHeroState = {
    ...hero,
    attributes: copyAttributes(selected.attributesAfter),
    resources: copyResources(selected.resourcesAfter),
  };
  const nextState: HeroGrowthState = Object.freeze({
    ...state,
    settledCheckpointLevels: Object.freeze([...state.settledCheckpointLevels, trigger.checkpointLevel].sort((a, b) => a - b)),
    packageSelections: Object.freeze({ ...packageSelections, [selected.packageId]: packageSelections[selected.packageId] + 1 }),
    pendingTriggers: Object.freeze(state.pendingTriggers.filter((pending) => pending.checkpointLevel !== trigger.checkpointLevel)),
    records: Object.freeze([...state.records, record].sort((left, right) => left.checkpointLevel - right.checkpointLevel)),
  });
  return { state: nextState, hero: nextHero, record };
}

export function createHeroGrowthState(hero: DetailedHeroState): HeroGrowthState {
  return Object.freeze({
    schemaVersion: 1,
    rulesVersion: heroGrowthRulesVersion,
    baselineLevel: hero.level,
    settledCheckpointLevels: Object.freeze(heroGrowthCheckpointLevels.filter((checkpoint) => checkpoint <= hero.level)),
    baselineAttributes: Object.freeze(copyAttributes(hero.attributes)),
    packageSelections: Object.freeze(emptyPackageTotals()),
    pendingTriggers: Object.freeze([]),
    records: Object.freeze([]),
  });
}

export function isStructurallyValidHeroGrowthState(
  value: unknown,
  hero: DetailedHeroState,
  tick: number,
): value is HeroGrowthState {
  if (!isRecord(value) || !exactKeys(value, [
    "schemaVersion", "rulesVersion", "baselineLevel", "settledCheckpointLevels", "baselineAttributes",
    "packageSelections", "pendingTriggers", "records",
  ])
    || value.schemaVersion !== 1
    || value.rulesVersion !== heroGrowthRulesVersion
    || !safeInteger(value.baselineLevel, 1, hero.level)
    || !Array.isArray(value.settledCheckpointLevels)
    || value.settledCheckpointLevels.length > maximumHeroGrowthRecords
    || !value.settledCheckpointLevels.every(isCheckpoint)
    || !Array.isArray(value.pendingTriggers)
    || value.pendingTriggers.length > maximumHeroGrowthRecords
    || !value.pendingTriggers.every((trigger) => validTrigger(trigger, tick))
    || !Array.isArray(value.records)
    || value.records.length > maximumHeroGrowthRecords
    || !validAttributes(value.baselineAttributes)
    || !validPackageTotals(value.packageSelections)) return false;

  const settled = value.settledCheckpointLevels as (10 | 25 | 50)[];
  const pending = value.pendingTriggers as HeroGrowthTrigger[];
  const records = value.records as HeroGrowthRecord[];
  const baselineLevel = value.baselineLevel as number;
  const adopted = heroGrowthCheckpointLevels.filter((checkpoint) => checkpoint <= baselineLevel);
  const accounted = [...settled, ...pending.map((trigger) => trigger.checkpointLevel)].sort((a, b) => a - b);
  if (new Set(settled).size !== settled.length
    || settled.some((checkpoint, index) => index > 0 && checkpoint <= settled[index - 1]!)
    || new Set(pending.map((trigger) => trigger.checkpointLevel)).size !== pending.length
    || pending.some((trigger, index) => trigger.checkpointLevel <= baselineLevel
      || settled.includes(trigger.checkpointLevel)
      || (index > 0 && trigger.checkpointLevel <= pending[index - 1]!.checkpointLevel))
    || !sameValue(accounted, heroGrowthCheckpointLevels.filter((checkpoint) => checkpoint <= hero.level))
    || !sameValue(settled, [...adopted, ...records.map((record) => record.checkpointLevel)].sort((a, b) => a - b))) return false;

  let attributes = copyAttributes(value.baselineAttributes as HeroAttributes);
  let totals = emptyPackageTotals();
  let previousCheckpoint = 0;
  let previousCrossedTick = 0;
  let previousAppliedTick = 0;
  let previousExperienceBefore = 0;
  let previousExperienceAfter = 0;
  let previousAppliedLevel = baselineLevel;
  for (const record of records) {
    if (!isRecord(record) || !exactKeys(record, [
      "schemaVersion", "id", "tick", "crossedTick", "heroId", "checkpointLevel", "sourceCommandId",
      "sourceCommandType", "experienceBefore", "experienceAfter", "levelBefore", "levelAfter", "appliedLevel",
      "packageTotalsBefore", "attributesBefore", "derivedBefore", "resourcesBefore", "equipmentModifiers",
      "candidates", "selectedPackageId", "rationale",
    ])
      || record.schemaVersion !== 1
      || !boundedText(record.id)
      || !safeInteger(record.tick, 1, tick)
      || !safeInteger(record.crossedTick, 1, record.tick as number)
      || (record.crossedTick as number) < previousCrossedTick
      || (record.tick as number) < previousAppliedTick
      || record.heroId !== hero.id
      || !isCheckpoint(record.checkpointLevel)
      || record.checkpointLevel <= baselineLevel
      || record.checkpointLevel <= previousCheckpoint
      || !boundedText(record.sourceCommandId)
      || !recordedDepthCommandTypes.includes(record.sourceCommandType as RecordedDepthCommandType)
      || !safeInteger(record.experienceBefore, 0)
      || !safeInteger(record.experienceAfter, (record.experienceBefore as number) + 1)
      || (record.experienceBefore as number) < previousExperienceBefore
      || (record.experienceAfter as number) < previousExperienceAfter
      || !safeInteger(record.levelBefore, 1, 999)
      || !safeInteger(record.levelAfter, (record.levelBefore as number) + 1, 1_000)
      || !safeInteger(record.appliedLevel, Math.max(record.checkpointLevel as number, record.levelAfter as number), hero.level)
      || (record.appliedLevel as number) < previousAppliedLevel
      || record.levelBefore !== heroLevelForExperience(record.experienceBefore as number)
      || record.levelAfter !== heroLevelForExperience(record.experienceAfter as number)
      || (record.levelBefore as number) >= record.checkpointLevel
      || (record.levelAfter as number) < record.checkpointLevel
      || !validPackageTotals(record.packageTotalsBefore)
      || !sameValue(record.packageTotalsBefore, totals)
      || !validAttributes(record.attributesBefore)
      || !sameValue(record.attributesBefore, attributes)
      || !validDerived(record.derivedBefore)
      || !validResources(record.resourcesBefore)
      || !validModifiers(record.equipmentModifiers)
      || !Array.isArray(record.candidates)
      || record.candidates.length < 2
      || record.candidates.length > 3
      || !record.candidates.every(validCandidate)
      || !heroGrowthPackageOrder.includes(record.selectedPackageId as HeroGrowthPackageId)
      || !boundedText(record.rationale, 1_000)) return false;
    const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
    if (selected === undefined) return false;
    const expectedDeltas = zeroAttributes();
    for (const attribute of packageAttributes[record.selectedPackageId]) expectedDeltas[attribute] = 1;
    const expectedAttributes = copyAttributes(attributes);
    for (const attribute of packageAttributes[record.selectedPackageId]) expectedAttributes[attribute] += 1;
    if (!sameValue(selected.attributeDeltas, expectedDeltas) || !sameValue(selected.attributesAfter, expectedAttributes)) return false;
    attributes = expectedAttributes;
    totals = { ...totals, [record.selectedPackageId]: totals[record.selectedPackageId] + 1 };
    previousCheckpoint = record.checkpointLevel;
    previousCrossedTick = record.crossedTick;
    previousAppliedTick = record.tick;
    previousExperienceBefore = record.experienceBefore;
    previousExperienceAfter = record.experienceAfter;
    previousAppliedLevel = record.appliedLevel;
  }
  return sameValue(attributes, hero.attributes)
    && sameValue(totals, value.packageSelections)
    && records.length === Object.values(totals).reduce((sum, count) => sum + count, 0);
}

function isCacheableFrozenGrowthState(value: HeroGrowthState): boolean {
  return Object.isFrozen(value)
    && Object.isFrozen(value.settledCheckpointLevels)
    && Object.isFrozen(value.baselineAttributes)
    && Object.isFrozen(value.packageSelections)
    && Object.isFrozen(value.pendingTriggers)
    && value.pendingTriggers.every((trigger) => Object.isFrozen(trigger))
    && Object.isFrozen(value.records)
    && value.records.every((record) => Object.isFrozen(record)
      && Object.isFrozen(record.packageTotalsBefore)
      && Object.isFrozen(record.attributesBefore)
      && Object.isFrozen(record.derivedBefore)
      && Object.isFrozen(record.resourcesBefore)
      && Object.isFrozen(record.equipmentModifiers)
      && Object.isFrozen(record.candidates)
      && record.candidates.every((candidate) => Object.isFrozen(candidate)
        && Object.isFrozen(candidate.reasonCodes)
        && Object.isFrozen(candidate.attributeDeltas)
        && Object.isFrozen(candidate.attributesAfter)
        && Object.isFrozen(candidate.derivedAfter)
        && Object.isFrozen(candidate.resourcesAfter)));
}

export function isValidHeroGrowthState(
  value: unknown,
  hero: DetailedHeroState,
  context: { readonly campaignId: string; readonly seed: string; readonly values: readonly HeroValue[]; readonly tick: number },
): value is HeroGrowthState {
  const cacheKey = JSON.stringify([
    context.campaignId,
    context.seed,
    hero.id,
    hero.name,
    hero.className,
    hero.level,
    context.values,
    attributeNames.map((attribute) => hero.attributes[attribute]),
  ]);
  if (isRecord(value) && isCacheableFrozenGrowthState(value as unknown as HeroGrowthState)) {
    const cached = validatedFrozenGrowthStates.get(value);
    if (cached?.key === cacheKey && context.tick >= cached.tick) return true;
  }
  if (!isStructurallyValidHeroGrowthState(value, hero, context.tick)
    || !isRecord(value) || !exactKeys(value, [
    "schemaVersion", "rulesVersion", "baselineLevel", "settledCheckpointLevels", "baselineAttributes",
    "packageSelections", "pendingTriggers", "records",
  ])
    || value.schemaVersion !== 1
    || value.rulesVersion !== heroGrowthRulesVersion
    || !safeInteger(value.baselineLevel, 1, hero.level)
    || !Array.isArray(value.settledCheckpointLevels)
    || value.settledCheckpointLevels.length > maximumHeroGrowthRecords
    || !value.settledCheckpointLevels.every(isCheckpoint)
    || !Array.isArray(value.pendingTriggers)
    || value.pendingTriggers.length > maximumHeroGrowthRecords
    || !value.pendingTriggers.every((trigger) => validTrigger(trigger, context.tick))
    || !Array.isArray(value.records)
    || value.records.length > maximumHeroGrowthRecords
    || !validAttributes(value.baselineAttributes)
    || !validPackageTotals(value.packageSelections)) return false;

  const settled = value.settledCheckpointLevels as (10 | 25 | 50)[];
  const pending = value.pendingTriggers as HeroGrowthTrigger[];
  const records = value.records as HeroGrowthRecord[];
  const accounted = [...settled, ...pending.map((trigger) => trigger.checkpointLevel)].sort((a, b) => a - b);
  const expectedAccounted = heroGrowthCheckpointLevels.filter((checkpoint) => checkpoint <= hero.level);
  const adopted = heroGrowthCheckpointLevels.filter((checkpoint) => checkpoint <= (value.baselineLevel as number));
  const earned = records.map((record) => record.checkpointLevel);
  if (new Set(settled).size !== settled.length
    || settled.some((checkpoint, index) => index > 0 && checkpoint <= settled[index - 1]!)
    || new Set(pending.map((trigger) => trigger.checkpointLevel)).size !== pending.length
    || pending.some((trigger) => settled.includes(trigger.checkpointLevel))
    || new Set(records.map((record) => record.checkpointLevel)).size !== records.length
    || records.some((record) => !settled.includes(record.checkpointLevel))
    || !sameValue(settled, [...adopted, ...earned].sort((a, b) => a - b))
    || pending.some((trigger) => trigger.checkpointLevel <= (value.baselineLevel as number))
    || !sameValue(accounted, expectedAccounted)
    || [...settled, ...pending.map((trigger) => trigger.checkpointLevel)].some((checkpoint) => checkpoint > hero.level)) return false;

  let attributes = copyAttributes(value.baselineAttributes as HeroAttributes);
  let packageSelections = emptyPackageTotals();
  let previousCheckpoint = 0;
  let previousCrossedTick = 0;
  let previousAppliedTick = 0;
  let previousExperienceBefore = 0;
  let previousExperienceAfter = 0;
  let previousAppliedLevel = value.baselineLevel as number;
  for (const record of records) {
    if (!isRecord(record) || !exactKeys(record, [
      "schemaVersion", "id", "tick", "crossedTick", "heroId", "checkpointLevel", "sourceCommandId",
      "sourceCommandType", "experienceBefore", "experienceAfter", "levelBefore", "levelAfter", "appliedLevel",
      "packageTotalsBefore", "attributesBefore", "derivedBefore", "resourcesBefore", "equipmentModifiers",
      "candidates", "selectedPackageId", "rationale",
    ])
      || record.schemaVersion !== 1
      || !boundedText(record.id)
      || !safeInteger(record.tick, 1, context.tick)
      || !safeInteger(record.crossedTick, 1, record.tick as number)
      || (record.crossedTick as number) < previousCrossedTick
      || (record.tick as number) < previousAppliedTick
      || record.heroId !== hero.id
      || !isCheckpoint(record.checkpointLevel)
      || record.checkpointLevel <= previousCheckpoint
      || !boundedText(record.sourceCommandId)
      || !recordedDepthCommandTypes.includes(record.sourceCommandType as RecordedDepthCommandType)
      || !safeInteger(record.experienceBefore, 0)
      || !safeInteger(record.experienceAfter, (record.experienceBefore as number) + 1)
      || (record.experienceBefore as number) < previousExperienceBefore
      || (record.experienceAfter as number) < previousExperienceAfter
      || !safeInteger(record.levelBefore, 1, 999)
      || !safeInteger(record.levelAfter, (record.levelBefore as number) + 1, 1_000)
      || !safeInteger(record.appliedLevel, Math.max(record.checkpointLevel as number, record.levelAfter as number), hero.level)
      || (record.appliedLevel as number) < previousAppliedLevel
      || record.levelBefore !== heroLevelForExperience(record.experienceBefore as number)
      || record.levelAfter !== heroLevelForExperience(record.experienceAfter as number)
      || (record.levelBefore as number) >= (record.checkpointLevel as number)
      || (record.levelAfter as number) < (record.checkpointLevel as number)
      || !validPackageTotals(record.packageTotalsBefore)
      || !sameValue(record.packageTotalsBefore, packageSelections)
      || !validAttributes(record.attributesBefore)
      || !sameValue(record.attributesBefore, attributes)
      || !validDerived(record.derivedBefore)
      || !validResources(record.resourcesBefore)
      || !validModifiers(record.equipmentModifiers)
      || !Array.isArray(record.candidates)
      || record.candidates.length < 2
      || record.candidates.length > 3
      || !record.candidates.every(validCandidate)
      || !heroGrowthPackageOrder.includes(record.selectedPackageId as HeroGrowthPackageId)
      || !boundedText(record.rationale, 1_000)) return false;

    const input: CandidateInput = {
      campaignId: context.campaignId,
      seed: context.seed,
      heroId: hero.id,
      className: hero.className,
      values: context.values,
      checkpointLevel: record.checkpointLevel,
      sourceCommandId: record.sourceCommandId,
      sourceCommandType: record.sourceCommandType as RecordedDepthCommandType,
      appliedLevel: record.appliedLevel,
      packageSelections,
      attributesBefore: attributes,
      resourcesBefore: record.resourcesBefore,
      equipmentModifiers: record.equipmentModifiers,
    };
    const expectedCandidates = projectCandidates(input);
    const selected = selectCandidate(expectedCandidates);
    const expectedDerivedBefore = derivedStatsFromInputs(attributes, heroMechanicalLevel(record.appliedLevel), record.equipmentModifiers);
    if (!sameValue(record.candidates, expectedCandidates)
      || !sameValue(record.derivedBefore, expectedDerivedBefore)
      || record.selectedPackageId !== selected.packageId
      || record.rationale !== rationaleFor(hero.name, selected)
      || record.id !== recordId(context.campaignId, recordWithoutId(record))) return false;
    attributes = copyAttributes(selected.attributesAfter);
    packageSelections = { ...packageSelections, [selected.packageId]: packageSelections[selected.packageId] + 1 };
    previousCheckpoint = record.checkpointLevel;
    previousCrossedTick = record.crossedTick;
    previousAppliedTick = record.tick;
    previousExperienceBefore = record.experienceBefore;
    previousExperienceAfter = record.experienceAfter;
    previousAppliedLevel = record.appliedLevel;
  }
  const valid = sameValue(attributes, hero.attributes)
    && sameValue(packageSelections, value.packageSelections)
    && records.length === Object.values(packageSelections).reduce((sum, count) => sum + count, 0);
  if (valid && isCacheableFrozenGrowthState(value)) {
    validatedFrozenGrowthStates.set(value, { key: cacheKey, tick: context.tick });
  }
  return valid;
}

export function applyHeroGrowth(state: HeroGrowthState, hero: DetailedHeroState, context: HeroGrowthContext): HeroGrowthApplication {
  const heroBeforeTransition: DetailedHeroState = {
    ...hero,
    experience: context.experienceBefore,
    level: context.levelBefore,
  };
  if (hero.id !== context.heroId
    || hero.name !== context.heroName
    || hero.className !== context.className
    || hero.level !== context.levelAfter
    || hero.experience !== context.experienceAfter
    || context.levelBefore !== heroLevelForExperience(context.experienceBefore)
    || context.levelAfter !== heroLevelForExperience(context.experienceAfter)
    || context.experienceAfter < context.experienceBefore
    || !recordedDepthCommandTypes.includes(context.sourceCommandType)
    || !boundedText(context.sourceCommandId)
    || !isValidHeroGrowthState(state, heroBeforeTransition, context)) {
    throw new TypeError("Hero growth input violates canonical progression invariants");
  }
  const alreadyKnown = new Set([...state.settledCheckpointLevels, ...state.pendingTriggers.map((trigger) => trigger.checkpointLevel)]);
  const queued = crossedCheckpoints(context.levelBefore, context.levelAfter)
    .filter((checkpoint) => !alreadyKnown.has(checkpoint))
    .map((checkpoint) => createTrigger(checkpoint, context));
  let nextState: HeroGrowthState = queued.length === 0 ? state : Object.freeze({
    ...state,
    pendingTriggers: Object.freeze([...state.pendingTriggers, ...queued].sort((a, b) => a.checkpointLevel - b.checkpointLevel)),
  });
  if (context.encounterActiveAfter || nextState.pendingTriggers.length === 0) {
    return { state: nextState, hero, appliedRecords: Object.freeze([]), queuedTriggers: Object.freeze(queued) };
  }
  let nextHero = hero;
  const applied: HeroGrowthRecord[] = [];
  for (const trigger of [...nextState.pendingTriggers].sort((a, b) => a.checkpointLevel - b.checkpointLevel)) {
    const resolved = applyTrigger(nextState, nextHero, trigger, context);
    nextState = resolved.state;
    nextHero = resolved.hero;
    applied.push(resolved.record);
  }
  if (!isValidHeroGrowthState(nextState, nextHero, context)) throw new TypeError("Resolved hero growth violates canonical invariants");
  return { state: nextState, hero: nextHero, appliedRecords: Object.freeze(applied), queuedTriggers: Object.freeze(queued) };
}

export function describeHeroGrowthRecord(record: HeroGrowthRecord): string {
  const selected = record.candidates.find((candidate) => candidate.packageId === record.selectedPackageId);
  if (selected === undefined) throw new TypeError("Growth record has no selected candidate");
  const deltas = attributeNames.flatMap((attribute) => selected.attributeDeltas[attribute] === 0
    ? []
    : [`${attribute.slice(0, 3).toUpperCase()} +${selected.attributeDeltas[attribute]}`]);
  return `TURNING POINT ${record.checkpointLevel} · ${selected.label} · ${deltas.join(" · ")} · ${record.rationale}`;
}
