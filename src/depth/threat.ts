import type {
  AtlasState,
  CombatantState,
  EncounterThreatBand,
  EncounterThreatProfile,
  RatedEncounterThreatFactor,
} from "./types";

export const encounterThreatRulesVersion = "place-threat-v1" as const;

export interface EncounterThreatContext {
  readonly edgeId: string;
  readonly fromLocationId: string;
  readonly destinationLocationId: string;
  readonly placeDanger: number;
  readonly questLeadId: string | null;
  readonly questInstanceId: string | null;
  readonly questModifier: 0 | 1;
}

export interface DungeonEncounterThreatContext {
  readonly kind: "dungeon";
  readonly dungeonId: string;
  readonly cellId: string;
  readonly locationId: string;
  readonly placeDanger: number;
}

export function isDungeonThreatLocation(dungeonId: string, locationId: string): boolean {
  const prefix = `dungeon:${locationId}`;
  return dungeonId === prefix || dungeonId.startsWith(`${prefix}:quest:`)
    && /^[1-9]\d*$/.test(dungeonId.slice(`${prefix}:quest:`.length));
}

export interface EncounterThreatSpecies {
  readonly combatantId: string;
  readonly speciesId: string;
}

const threatBands: readonly EncounterThreatBand[] = ["minor", "guarded", "perilous", "dire", "extreme"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function speciesThreatBias(speciesId: string): -1 | 0 | 1 {
  switch (speciesId) {
    case "lantern-wolf": return -1;
    case "mossback-brute":
    case "copperhorn": return 1;
    case "river-wyrmling":
    case "inkcap-mimic": return 0;
    default: throw new RangeError(`Unknown tactical species ${speciesId}`);
  }
}

export function encounterThreatScore(placeDanger: number, questModifier: 0 | 1, speciesBias: -1 | 0 | 1): number {
  if (!safeInteger(placeDanger, 1, 10)) throw new RangeError("Place danger must be an integer from 1 through 10");
  return Math.max(1, Math.min(10, placeDanger + questModifier + speciesBias));
}

export function mechanicalTierForThreatScore(score: number): number {
  if (!safeInteger(score, 1, 10)) throw new RangeError("Threat score must be an integer from 1 through 10");
  return 1 + Math.round(((score - 1) * 49) / 9);
}

export function encounterThreatBand(score: number): EncounterThreatBand {
  if (!safeInteger(score, 1, 10)) throw new RangeError("Threat score must be an integer from 1 through 10");
  return threatBands[Math.floor((score - 1) / 2)] ?? "extreme";
}

export function encounterThreatBandLabel(band: EncounterThreatBand): string {
  return band[0]!.toUpperCase() + band.slice(1);
}

export function createLegacyUnratedThreat(): EncounterThreatProfile {
  return Object.freeze({ schemaVersion: 1, rating: "legacy-unrated" });
}

export function createEncounterThreatProfile(
  context: EncounterThreatContext,
  enemies: readonly EncounterThreatSpecies[],
): EncounterThreatProfile {
  if (enemies.length < 1 || enemies.length > 5) throw new RangeError("A rated encounter needs one through five enemies");
  if (
    context.edgeId.length === 0 || context.fromLocationId.length === 0 || context.destinationLocationId.length === 0 ||
    context.fromLocationId === context.destinationLocationId || !safeInteger(context.placeDanger, 1, 10) ||
    (context.questModifier === 0 && (context.questLeadId !== null || context.questInstanceId !== null)) ||
    (context.questModifier === 1 && (context.questLeadId === null || context.questInstanceId === null))
  ) throw new TypeError("Encounter threat context violates provenance invariants");
  const factors = enemies.map((enemy): RatedEncounterThreatFactor => {
    const speciesBias = speciesThreatBias(enemy.speciesId);
    const score = encounterThreatScore(context.placeDanger, context.questModifier, speciesBias);
    return Object.freeze({
      combatantId: enemy.combatantId,
      speciesId: enemy.speciesId,
      speciesBias,
      score,
      mechanicalTier: mechanicalTierForThreatScore(score),
    });
  });
  if (new Set(factors.map((factor) => factor.combatantId)).size !== factors.length) {
    throw new TypeError("Encounter threat factors must name unique combatants");
  }
  const encounterScore = Math.max(...factors.map((factor) => factor.score));
  return Object.freeze({
    schemaVersion: 1,
    rating: "place-bound",
    rulesVersion: encounterThreatRulesVersion,
    ...context,
    encounterScore,
    band: encounterThreatBand(encounterScore),
    factors: Object.freeze(factors),
  });
}

export function createDungeonEncounterThreatProfile(
  context: DungeonEncounterThreatContext,
  enemies: readonly EncounterThreatSpecies[],
): EncounterThreatProfile {
  if (context.kind !== "dungeon" || !isDungeonThreatLocation(context.dungeonId, context.locationId)
    || !context.cellId.startsWith(`${context.dungeonId}:cell:`) || !safeInteger(context.placeDanger, 1, 10)
    || enemies.length !== 1) throw new TypeError("Dungeon threat needs one guardian at a real dungeon cell");
  const factors = enemies.map((enemy): RatedEncounterThreatFactor => {
    const speciesBias = speciesThreatBias(enemy.speciesId);
    const score = encounterThreatScore(context.placeDanger, 0, speciesBias);
    return { ...enemy, speciesBias, score, mechanicalTier: mechanicalTierForThreatScore(score) };
  });
  const encounterScore = factors[0]!.score;
  return { schemaVersion: 1, rating: "dungeon-bound", rulesVersion: "dungeon-threat-v1",
    dungeonId: context.dungeonId, cellId: context.cellId, locationId: context.locationId,
    placeDanger: context.placeDanger, questModifier: 0, encounterScore,
    band: encounterThreatBand(encounterScore), factors };
}

export function isValidEncounterThreatProfile(
  value: unknown,
  combatants: readonly CombatantState[],
): value is EncounterThreatProfile {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.rating === "legacy-unrated") return Object.keys(value).length === 2;
  const dungeonBound = value.rating === "dungeon-bound";
  if (dungeonBound) {
    if (value.rulesVersion !== "dungeon-threat-v1" || typeof value.dungeonId !== "string"
      || typeof value.locationId !== "string" || typeof value.cellId !== "string"
      || !isDungeonThreatLocation(value.dungeonId, value.locationId)
      || !new RegExp(`^${value.dungeonId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:cell:\\d+,\\d+$`).test(value.cellId)
      || value.questModifier !== 0
      || Object.keys(value).sort().join(",") !== ["schemaVersion", "rating", "rulesVersion", "dungeonId", "cellId", "locationId",
        "placeDanger", "questModifier", "encounterScore", "band", "factors"].sort().join(",")) return false;
  } else if (
    value.rating !== "place-bound" || value.rulesVersion !== encounterThreatRulesVersion ||
    typeof value.edgeId !== "string" || value.edgeId.length === 0 ||
    typeof value.fromLocationId !== "string" || value.fromLocationId.length === 0 ||
    typeof value.destinationLocationId !== "string" || value.destinationLocationId.length === 0 ||
    value.fromLocationId === value.destinationLocationId ||
    !safeInteger(value.placeDanger, 1, 10) || (value.questModifier !== 0 && value.questModifier !== 1) ||
    (value.questModifier === 0 && (value.questLeadId !== null || value.questInstanceId !== null)) ||
    (value.questModifier === 1 && (
      typeof value.questLeadId !== "string" || value.questLeadId.length === 0 ||
      typeof value.questInstanceId !== "string" || value.questInstanceId.length === 0
    ))
  ) return false;
  if (
    !safeInteger(value.placeDanger, 1, 10) ||
    !safeInteger(value.encounterScore, 1, 10) || typeof value.band !== "string" ||
    !threatBands.includes(value.band as EncounterThreatBand) || !Array.isArray(value.factors)
  ) return false;
  const enemies = combatants.filter((combatant) => combatant.side === "enemies");
  if (value.factors.length !== enemies.length || value.factors.length < 1 || value.factors.length > (dungeonBound ? 1 : 5)) return false;
  const factors = value.factors;
  const factorIds = factors.map((factor) => isRecord(factor) ? factor.combatantId : null);
  if (new Set(factorIds).size !== factorIds.length) return false;
  for (let index = 0; index < enemies.length; index += 1) {
    const enemy = enemies[index]!;
    const factor = factors[index];
    if (!isRecord(factor) || enemy.speciesId === null || factor.speciesId !== enemy.speciesId) return false;
    if (factor.combatantId !== enemy.id) return false;
    let bias: -1 | 0 | 1;
    try {
      bias = speciesThreatBias(enemy.speciesId);
    } catch {
      return false;
    }
    const score = encounterThreatScore(value.placeDanger as number, value.questModifier as 0 | 1, bias);
    const tier = mechanicalTierForThreatScore(score);
    if (
      factor.speciesBias !== bias || factor.score !== score || factor.mechanicalTier !== tier ||
      enemy.maxHealth !== 12 + tier * 2 || enemy.maxMana !== 5 + Math.floor(tier / 2) ||
      enemy.power !== 4 + tier || enemy.armor !== Math.floor(tier / 3)
    ) return false;
  }
  const scores = factors.map((factor) => isRecord(factor) ? factor.score : null);
  const maximum = Math.max(...scores.filter((score): score is number => typeof score === "number"));
  return value.encounterScore === maximum && value.band === encounterThreatBand(maximum);
}

export function isValidEncounterThreatProvenance(
  profile: EncounterThreatProfile,
  atlas: AtlasState,
): boolean {
  if (profile.rating === "legacy-unrated") return true;
  if (profile.rating === "dungeon-bound") {
    return isDungeonThreatLocation(profile.dungeonId, profile.locationId)
      && atlas.locations.some((location) => location.id === profile.locationId && location.kind === "dungeon"
        && location.danger === profile.placeDanger) && atlas.discoveredLocationIds.includes(profile.locationId);
  }
  const edge = atlas.edges.find((candidate) => candidate.id === profile.edgeId);
  const destination = atlas.locations.find((candidate) => candidate.id === profile.destinationLocationId);
  return edge !== undefined && destination !== undefined &&
    ((edge.from === profile.fromLocationId && edge.to === profile.destinationLocationId) ||
      (edge.to === profile.fromLocationId && edge.from === profile.destinationLocationId)) &&
    destination.danger === profile.placeDanger;
}

export function describeEncounterThreat(profile: EncounterThreatProfile): string {
  if (profile.rating === "legacy-unrated") return "Legacy encounter · threat unrated";
  const decisive = [...profile.factors].sort((left, right) => (
    right.score - left.score
    || (left.combatantId < right.combatantId ? -1 : left.combatantId > right.combatantId ? 1 : 0)
  ))[0];
  const bias = decisive?.speciesBias ?? 0;
  const biasText = bias === 0 ? "+ species 0" : bias > 0 ? `+ species ${bias}` : `− species ${Math.abs(bias)}`;
  return profile.rating === "dungeon-bound"
    ? `Threat ${profile.encounterScore} ${encounterThreatBandLabel(profile.band)} · dungeon ${profile.placeDanger} ${biasText}`
    : `Threat ${profile.encounterScore} ${encounterThreatBandLabel(profile.band)} · place ${profile.placeDanger} + quest ${profile.questModifier} ${biasText}`;
}
