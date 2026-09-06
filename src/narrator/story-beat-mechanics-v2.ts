import { canonicalHash } from "../core/canonical";
import {
  recordedDepthCommandTypes,
  type ChronicleEntry,
  type RecordedDepthCommandType,
  type SceneState,
  type WorldState,
} from "../core/types";

export const storyBeatMechanicsSchemaVersion = 2 as const;
export const storyBeatMaximumCostFactsV2 = 3;
export const storyBeatMaximumConsequenceFactsV2 = 8;

export const storyBeatLensIdsV2 = Object.freeze([
  "cost",
  "consequence",
  "contrast",
] as const);

export type StoryBeatLensIdV2 = typeof storyBeatLensIdsV2[number];

export const storyBeatCostMetricsV2 = Object.freeze([
  "hero-health",
  "hero-mana",
  "hero-gold",
] as const);

export type StoryBeatCostMetricV2 = typeof storyBeatCostMetricsV2[number];

export const storyBeatConsequenceMetricsV2 = Object.freeze([
  "combat-victory",
  "combat-defeat",
  "combat-stalemate",
  "counter-duel-victory",
  "counter-duel-defeat",
  "counter-duel-draw",
  "quests-completed",
  "dungeon-completed",
  "location-reached",
  "route-planned",
  "dungeon-entered",
  "quest-objective-progress",
  "dungeon-cells-visited",
  "enemy-health",
  "hero-level",
  "hero-experience",
  "ability-experience",
  "town-visits",
  "companions-recruited",
  "companions-departed",
  "hero-health",
  "hero-mana",
  "hero-gold",
  "route-distance",
] as const);

export type StoryBeatConsequenceMetricV2 =
  typeof storyBeatConsequenceMetricsV2[number];

export type StoryBeatMechanicDirectionV2 = "increase" | "decrease";

export interface StoryBeatCostFactV2 {
  readonly kind: "cost";
  readonly metric: StoryBeatCostMetricV2;
  readonly direction: "decrease";
  readonly before: number;
  readonly after: number;
  readonly amount: number;
}

export interface StoryBeatConsequenceFactV2 {
  readonly kind: "consequence";
  readonly metric: StoryBeatConsequenceMetricV2;
  readonly direction: StoryBeatMechanicDirectionV2;
  readonly before: number;
  readonly after: number;
  readonly amount: number;
}

export interface StoryBeatPublicMechanicsV2 {
  readonly schemaVersion: 2;
  readonly kind: "public-story-beat-mechanics";
  readonly beatLensId: StoryBeatLensIdV2;
  readonly costs: readonly StoryBeatCostFactV2[];
  readonly consequences: readonly StoryBeatConsequenceFactV2[];
}

export interface CommittedStoryBeatMechanicsV2 {
  readonly schemaVersion: 2;
  readonly kind: "committed-story-beat-mechanics";
  readonly campaignId: string;
  readonly eventId: string;
  readonly tick: number;
  readonly commandId: string;
  readonly commandType: RecordedDepthCommandType;
  readonly sourceFingerprint: string;
  readonly facts: StoryBeatPublicMechanicsV2;
}

const costFactKeys = Object.freeze([
  "kind",
  "metric",
  "direction",
  "before",
  "after",
  "amount",
] as const);

const consequenceFactKeys = costFactKeys;

const publicFactsKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "beatLensId",
  "costs",
  "consequences",
] as const);

const projectionKeys = Object.freeze([
  "schemaVersion",
  "kind",
  "campaignId",
  "eventId",
  "tick",
  "commandId",
  "commandType",
  "sourceFingerprint",
  "facts",
] as const);

const unsafeUnicode = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const fingerprintPattern = /^[0-9a-f]{16}$/u;

const consequenceDirections = Object.freeze({
  "combat-victory": "increase",
  "combat-defeat": "increase",
  "combat-stalemate": "increase",
  "counter-duel-victory": "increase",
  "counter-duel-defeat": "increase",
  "counter-duel-draw": "increase",
  "quests-completed": "increase",
  "dungeon-completed": "increase",
  "location-reached": "increase",
  "route-planned": "increase",
  "dungeon-entered": "increase",
  "quest-objective-progress": "increase",
  "dungeon-cells-visited": "increase",
  "enemy-health": "decrease",
  "hero-level": "increase",
  "hero-experience": "increase",
  "ability-experience": "increase",
  "town-visits": "increase",
  "companions-recruited": "increase",
  "companions-departed": "increase",
  "hero-health": "increase",
  "hero-mana": "increase",
  "hero-gold": "increase",
  "route-distance": "increase",
} as const satisfies Readonly<Record<StoryBeatConsequenceMetricV2, StoryBeatMechanicDirectionV2>>);

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
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

function isDenseArray(value: unknown, maximumLength: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) return false;
  if (Object.keys(value).length !== value.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value.trim() === value
    && value.normalize("NFC") === value
    && !unsafeUnicode.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isCostMetric(value: unknown): value is StoryBeatCostMetricV2 {
  return typeof value === "string"
    && (storyBeatCostMetricsV2 as readonly string[]).includes(value);
}

function isConsequenceMetric(value: unknown): value is StoryBeatConsequenceMetricV2 {
  return typeof value === "string"
    && (storyBeatConsequenceMetricsV2 as readonly string[]).includes(value);
}

function isLensId(value: unknown): value is StoryBeatLensIdV2 {
  return typeof value === "string"
    && (storyBeatLensIdsV2 as readonly string[]).includes(value);
}

function isCostFact(value: unknown): value is StoryBeatCostFactV2 {
  return isRecord(value)
    && hasExactKeys(value, costFactKeys)
    && value.kind === "cost"
    && isCostMetric(value.metric)
    && value.direction === "decrease"
    && isNonNegativeSafeInteger(value.before)
    && isNonNegativeSafeInteger(value.after)
    && isPositiveSafeInteger(value.amount)
    && value.before > value.after
    && value.before - value.after === value.amount;
}

function isConsequenceFact(value: unknown): value is StoryBeatConsequenceFactV2 {
  if (!isRecord(value)
    || !hasExactKeys(value, consequenceFactKeys)
    || value.kind !== "consequence"
    || !isConsequenceMetric(value.metric)
    || (value.direction !== "increase" && value.direction !== "decrease")
    || consequenceDirections[value.metric] !== value.direction
    || !isNonNegativeSafeInteger(value.before)
    || !isNonNegativeSafeInteger(value.after)
    || !isPositiveSafeInteger(value.amount)) return false;
  return value.direction === "increase"
    ? value.after > value.before && value.after - value.before === value.amount
    : value.before > value.after && value.before - value.after === value.amount;
}

function isStrictlyOrderedMetrics<TMetric extends string>(
  values: readonly unknown[],
  order: readonly TMetric[],
  validate: (value: unknown) => boolean,
): boolean {
  let prior = -1;
  for (const value of values) {
    if (!validate(value)) return false;
    const metric = (value as { readonly metric: TMetric }).metric;
    const rank = order.indexOf(metric);
    if (rank <= prior) return false;
    prior = rank;
  }
  return true;
}

function lensFor(
  costs: readonly StoryBeatCostFactV2[],
  consequences: readonly StoryBeatConsequenceFactV2[],
): StoryBeatLensIdV2 | null {
  if (costs.length > 0 && consequences.length > 0) return "contrast";
  if (costs.length > 0) return "cost";
  if (consequences.length > 0) return "consequence";
  return null;
}

function safelyValidatePublicFacts(value: unknown): value is StoryBeatPublicMechanicsV2 {
  if (!isRecord(value)
    || !hasExactKeys(value, publicFactsKeys)
    || value.schemaVersion !== storyBeatMechanicsSchemaVersion
    || value.kind !== "public-story-beat-mechanics"
    || !isLensId(value.beatLensId)
    || !isDenseArray(value.costs, storyBeatMaximumCostFactsV2)
    || !isDenseArray(value.consequences, storyBeatMaximumConsequenceFactsV2)
    || !isStrictlyOrderedMetrics(value.costs, storyBeatCostMetricsV2, isCostFact)
    || !isStrictlyOrderedMetrics(
      value.consequences,
      storyBeatConsequenceMetricsV2,
      isConsequenceFact,
    )) return false;
  return lensFor(
    value.costs as readonly StoryBeatCostFactV2[],
    value.consequences as readonly StoryBeatConsequenceFactV2[],
  ) === value.beatLensId;
}

export function isStoryBeatPublicMechanicsV2(
  value: unknown,
): value is StoryBeatPublicMechanicsV2 {
  try {
    return safelyValidatePublicFacts(value);
  } catch {
    return false;
  }
}

function safelyValidateProjection(value: unknown): value is CommittedStoryBeatMechanicsV2 {
  return isRecord(value)
    && hasExactKeys(value, projectionKeys)
    && value.schemaVersion === storyBeatMechanicsSchemaVersion
    && value.kind === "committed-story-beat-mechanics"
    && isBoundedIdentifier(value.campaignId)
    && isBoundedIdentifier(value.eventId)
    && isNonNegativeSafeInteger(value.tick)
    && isBoundedIdentifier(value.commandId)
    && typeof value.commandType === "string"
    && (recordedDepthCommandTypes as readonly string[]).includes(value.commandType)
    && typeof value.sourceFingerprint === "string"
    && fingerprintPattern.test(value.sourceFingerprint)
    && isStoryBeatPublicMechanicsV2(value.facts);
}

export function isCommittedStoryBeatMechanicsV2(
  value: unknown,
): value is CommittedStoryBeatMechanicsV2 {
  try {
    return safelyValidateProjection(value);
  } catch {
    return false;
  }
}

function sourceMatchesScene(scene: Readonly<SceneState>, source: Readonly<ChronicleEntry>): boolean {
  return source.mode === scene.mode
    && source.location === scene.location
    && source.headline === scene.headline
    && source.action === scene.action
    && source.goal === scene.goal
    && source.consequence === scene.consequence
    && source.sensoryIntensity === scene.sensoryIntensity;
}

function sourceMatchesChronicle(
  source: Readonly<ChronicleEntry>,
  recorded: Readonly<ChronicleEntry>,
): boolean {
  return source.id === recorded.id
    && source.tick === recorded.tick
    && source.commandId === recorded.commandId
    && source.commandType === recorded.commandType
    && sourceMatchesScene(recorded, source);
}

function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function costFact(
  metric: StoryBeatCostMetricV2,
  before: number,
  after: number,
): StoryBeatCostFactV2 | null {
  const amount = before - after;
  if (!isNonNegativeSafeInteger(before)
    || !isNonNegativeSafeInteger(after)
    || !isPositiveSafeInteger(amount)) return null;
  return { kind: "cost", metric, direction: "decrease", before, after, amount };
}

function consequenceFact(
  metric: StoryBeatConsequenceMetricV2,
  before: number,
  after: number,
): StoryBeatConsequenceFactV2 | null {
  const direction = consequenceDirections[metric];
  const amount = direction === "increase" ? after - before : before - after;
  if (!isNonNegativeSafeInteger(before)
    || !isNonNegativeSafeInteger(after)
    || !isPositiveSafeInteger(amount)) return null;
  return { kind: "consequence", metric, direction, before, after, amount };
}

function questProgress(state: Readonly<WorldState>): number | null {
  return safeSum([
    ...state.depth.quest.objectives.map((objective) => objective.current),
    ...state.depth.quest.subquests.flatMap((subquest) =>
      subquest.objectives.map((objective) => objective.current)
    ),
  ]);
}

function abilityExperienceForSharedIds(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): readonly [number, number] | null {
  const afterById = new Map(after.depth.hero.abilities.map((ability) => [
    ability.id,
    ability.experience,
  ] as const));
  const pairs = before.depth.hero.abilities
    .filter((ability) => afterById.has(ability.id))
    .map((ability) => [ability.experience, afterById.get(ability.id)!] as const);
  const beforeTotal = safeSum(pairs.map(([experience]) => experience));
  const afterTotal = safeSum(pairs.map(([, experience]) => experience));
  return beforeTotal === null || afterTotal === null ? null : [beforeTotal, afterTotal];
}

function townVisits(state: Readonly<WorldState>): number | null {
  return safeSum(Object.values(state.depth.towns).map((town) => town.visits));
}

function enemyHealthPair(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): readonly [number, number] | null {
  const beforeCombat = before.depth.combat;
  if (beforeCombat === null) return null;
  const afterCombat = after.depth.combat?.id === beforeCombat.id
    ? after.depth.combat
    : [...after.depth.completedCombats].reverse().find((combat) => combat.id === beforeCombat.id);
  if (afterCombat === undefined || afterCombat === null) return null;
  const afterById = new Map(afterCombat.combatants.map((combatant) => [
    combatant.id,
    combatant,
  ] as const));
  const beforeEnemies = beforeCombat.combatants.filter((combatant) => combatant.side === "enemies");
  if (beforeEnemies.length === 0
    || beforeEnemies.some((combatant) => afterById.get(combatant.id)?.side !== "enemies")) return null;
  const beforeHealth = safeSum(beforeEnemies.map((combatant) => combatant.health));
  const afterHealth = safeSum(beforeEnemies.map((combatant) => afterById.get(combatant.id)!.health));
  return beforeHealth === null || afterHealth === null ? null : [beforeHealth, afterHealth];
}

function terminalCombatMetric(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): StoryBeatConsequenceMetricV2 | null {
  const active = before.depth.combat;
  if (active === null || after.depth.combat?.id === active.id) return null;
  const completed = [...after.depth.completedCombats].reverse()
    .find((combat) => combat.id === active.id);
  if (completed?.outcome === "victory") return "combat-victory";
  if (completed?.outcome === "defeat") return "combat-defeat";
  if (completed?.outcome === "stalemate") return "combat-stalemate";
  return null;
}

function terminalCounterDuelMetric(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): StoryBeatConsequenceMetricV2 | null {
  const active = before.depth.counterDuel;
  if (active === null || after.depth.counterDuel?.id === active.id) return null;
  const completed = [...after.depth.completedCounterDuels].reverse()
    .find((duel) => duel.id === active.id);
  if (completed?.outcome === "victory") return "counter-duel-victory";
  if (completed?.outcome === "defeat") return "counter-duel-defeat";
  if (completed?.outcome === "draw") return "counter-duel-draw";
  return null;
}

function deriveCosts(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): readonly StoryBeatCostFactV2[] {
  const candidates = [
    costFact("hero-health", before.hero.health, after.hero.health),
    costFact("hero-mana", before.depth.hero.resources.mana, after.depth.hero.resources.mana),
    costFact("hero-gold", before.hero.gold, after.hero.gold),
  ];
  return candidates.filter((fact): fact is StoryBeatCostFactV2 => fact !== null);
}

function deriveConsequences(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
): readonly StoryBeatConsequenceFactV2[] {
  const byMetric = new Map<StoryBeatConsequenceMetricV2, StoryBeatConsequenceFactV2>();
  const add = (metric: StoryBeatConsequenceMetricV2, beforeValue: number, afterValue: number) => {
    const fact = consequenceFact(metric, beforeValue, afterValue);
    if (fact !== null) byMetric.set(metric, fact);
  };

  const combatMetric = terminalCombatMetric(before, after);
  if (combatMetric !== null) add(combatMetric, 0, 1);
  const duelMetric = terminalCounterDuelMetric(before, after);
  if (duelMetric !== null) add(duelMetric, 0, 1);

  add("quests-completed", before.depth.totalCompletedQuests, after.depth.totalCompletedQuests);

  if (
    before.depth.dungeon !== null
    && after.depth.dungeon?.id === before.depth.dungeon.id
  ) {
    if (!before.depth.dungeon.completed && after.depth.dungeon.completed) {
      add("dungeon-completed", 0, 1);
    }
    add(
      "dungeon-cells-visited",
      before.depth.dungeon.visitedCellIds.length,
      after.depth.dungeon.visitedCellIds.length,
    );
  }

  if (before.depth.atlas.currentLocationId !== after.depth.atlas.currentLocationId) {
    add("location-reached", 0, 1);
  }
  if (before.depth.atlas.route === null && after.depth.atlas.route !== null) {
    add("route-planned", 0, 1);
  }
  if (before.depth.dungeon === null && after.depth.dungeon !== null) {
    add("dungeon-entered", 0, 1);
  }

  if (before.depth.quest.instanceId === after.depth.quest.instanceId) {
    const beforeProgress = questProgress(before);
    const afterProgress = questProgress(after);
    if (beforeProgress !== null && afterProgress !== null) {
      add("quest-objective-progress", beforeProgress, afterProgress);
    }
  }

  const enemyHealth = enemyHealthPair(before, after);
  if (enemyHealth !== null) add("enemy-health", enemyHealth[0], enemyHealth[1]);

  add("hero-level", before.hero.level, after.hero.level);
  add("hero-experience", before.hero.experience, after.hero.experience);

  const abilityExperience = abilityExperienceForSharedIds(before, after);
  if (abilityExperience !== null) {
    add("ability-experience", abilityExperience[0], abilityExperience[1]);
  }

  const beforeTownVisits = townVisits(before);
  const afterTownVisits = townVisits(after);
  if (beforeTownVisits !== null && afterTownVisits !== null) {
    add("town-visits", beforeTownVisits, afterTownVisits);
  }

  const beforeCompanions = before.depth.companions.active.length;
  const afterCompanions = after.depth.companions.active.length;
  if (afterCompanions > beforeCompanions) {
    add("companions-recruited", beforeCompanions, afterCompanions);
  } else if (afterCompanions < beforeCompanions) {
    add("companions-departed", afterCompanions, beforeCompanions);
  }

  add("hero-health", before.hero.health, after.hero.health);
  add(
    "hero-mana",
    before.depth.hero.resources.mana,
    after.depth.hero.resources.mana,
  );
  add("hero-gold", before.hero.gold, after.hero.gold);

  const beforeRoute = before.depth.atlas.route;
  const afterRoute = after.depth.atlas.route;
  if (
    beforeRoute !== null
    && afterRoute !== null
    && beforeRoute.destinationId === afterRoute.destinationId
  ) {
    add("route-distance", beforeRoute.distanceTravelled, afterRoute.distanceTravelled);
  }

  return storyBeatConsequenceMetricsV2
    .flatMap((metric) => byMetric.get(metric) ?? [])
    .slice(0, storyBeatMaximumConsequenceFactsV2);
}

function safelyProject(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
  source: Readonly<ChronicleEntry> | undefined,
  latestEventId: string | undefined,
): CommittedStoryBeatMechanicsV2 | null {
  if (
    source === undefined
    || latestEventId !== source.id
    || before.campaignId !== after.campaignId
    || !isBoundedIdentifier(after.campaignId)
    || !Number.isSafeInteger(before.tick)
    || !Number.isSafeInteger(after.tick)
    || after.tick !== before.tick + 1
    || before.depth.tick !== before.tick
    || after.depth.tick !== after.tick
    || source.tick !== after.tick
    || source.id !== `${after.campaignId}:${after.tick}`
    || !sourceMatchesScene(after.scene, source)
    || !Array.isArray(after.chronicle)
    || after.chronicle.length === 0
    || !sourceMatchesChronicle(source, after.chronicle.at(-1)!)
    || !isBoundedIdentifier(source.commandId)
    || typeof source.commandType !== "string"
    || !(recordedDepthCommandTypes as readonly string[]).includes(source.commandType)
  ) return null;

  const costs = deriveCosts(before, after);
  const consequences = deriveConsequences(before, after);
  const beatLensId = lensFor(costs, consequences);
  if (beatLensId === null) return null;

  const facts: StoryBeatPublicMechanicsV2 = {
    schemaVersion: storyBeatMechanicsSchemaVersion,
    kind: "public-story-beat-mechanics",
    beatLensId,
    costs,
    consequences,
  };
  const sourceFingerprint = canonicalHash({
    schemaVersion: storyBeatMechanicsSchemaVersion,
    campaignId: after.campaignId,
    eventId: source.id,
    tick: source.tick,
    commandId: source.commandId,
    commandType: source.commandType,
    scene: {
      mode: source.mode,
      location: source.location,
      headline: source.headline,
      action: source.action,
      goal: source.goal,
      consequence: source.consequence,
      sensoryIntensity: source.sensoryIntensity,
    },
    facts,
  });
  const projection: CommittedStoryBeatMechanicsV2 = {
    schemaVersion: storyBeatMechanicsSchemaVersion,
    kind: "committed-story-beat-mechanics",
    campaignId: after.campaignId,
    eventId: source.id,
    tick: source.tick,
    commandId: source.commandId,
    commandType: source.commandType,
    sourceFingerprint,
    facts,
  };
  if (!isCommittedStoryBeatMechanicsV2(projection)) return null;
  return deepFreeze(projection);
}

/**
 * Projects one committed simulation tick into prose-free public mechanics.
 *
 * This is deliberately not a model job. V1 prompts, validators, checkpoints,
 * workers, and UI remain untouched until a separately evidenced V2 contract
 * can consume these host-derived facts.
 */
export function projectCommittedStoryBeatMechanicsV2(
  before: Readonly<WorldState>,
  after: Readonly<WorldState>,
  source: Readonly<ChronicleEntry> | undefined,
  latestEventId: string | undefined,
): CommittedStoryBeatMechanicsV2 | null {
  try {
    return safelyProject(before, after, source, latestEventId);
  } catch {
    return null;
  }
}
