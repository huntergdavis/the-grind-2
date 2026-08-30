import { randomInt } from "../core/rng";
import type {
  ActiveCompanion,
  AtlasLocation,
  AtlasState,
  CombatantState,
  CombatState,
  CompanionCombatProfile,
  CompanionRosterState,
  FormerCompanion,
  TownResident,
  TownState,
} from "./types";

export const maximumActiveCompanionsV1 = 1;
export const maximumFormerCompanions = 12;

export interface SharedRoadCompanionSelection {
  seed: string;
  atlas: AtlasState;
  town: TownState;
  roster: CompanionRosterState;
  joinedTick: number;
  heroLevel: number;
}

export interface CompanionDestinationDepartureFacts {
  tick: number;
  locationId: string;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function boundedText(value: unknown, maximumLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength;
}

function uniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function locationById(atlas: AtlasState, id: string): AtlasLocation | null {
  const matches = atlas.locations.filter((location) => location.id === id);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function residentBelongsToTown(town: TownState, resident: TownResident): boolean {
  if (!boundedText(resident.id) || !boundedText(resident.name, 128) || !boundedText(resident.role, 64)) return false;
  if (resident.disposition !== "wary" && resident.disposition !== "neutral" && resident.disposition !== "warm") return false;
  const homes = town.buildings.filter((building) => building.id === resident.homeBuildingId);
  return homes.length === 1 && homes[0]?.residentIds.filter((id) => id === resident.id).length === 1;
}

function reachable(atlas: AtlasState, originLocationId: string, destinationLocationId: string): boolean {
  const knownIds = new Set(atlas.locations.map((location) => location.id));
  if (knownIds.size !== atlas.locations.length) return false;
  const neighbors = new Map<string, Set<string>>();
  for (const id of knownIds) neighbors.set(id, new Set());
  for (const edge of atlas.edges) {
    if (!knownIds.has(edge.from) || !knownIds.has(edge.to) || edge.from === edge.to) return false;
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }
  const visited = new Set<string>([originLocationId]);
  const queue = [originLocationId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === destinationLocationId) return true;
    for (const next of neighbors.get(current ?? "") ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

export function createEmptyCompanionRoster(): CompanionRosterState {
  return { schemaVersion: 1, active: [], former: [] };
}

export function isPublicReachableDistinctTown(
  atlas: AtlasState,
  originLocationId: string,
  destinationLocationId: string,
): boolean {
  if (originLocationId === destinationLocationId) return false;
  const origin = locationById(atlas, originLocationId);
  const destination = locationById(atlas, destinationLocationId);
  if (origin?.kind !== "town" || destination?.kind !== "town") return false;
  if (new Set(atlas.discoveredLocationIds).size !== atlas.discoveredLocationIds.length) return false;
  if (!atlas.discoveredLocationIds.includes(originLocationId) || !atlas.discoveredLocationIds.includes(destinationLocationId)) return false;
  return reachable(atlas, originLocationId, destinationLocationId);
}

function sharedRoadDestinations(atlas: AtlasState, originLocationId: string): readonly AtlasLocation[] {
  return atlas.locations
    .filter((location) => isPublicReachableDistinctTown(atlas, originLocationId, location.id))
    .sort((left, right) => compareIds(left.id, right.id));
}

export function createCompanionCombatProfile(
  seed: string,
  residentId: string,
  heroLevel: number,
): CompanionCombatProfile {
  if (!boundedText(seed) || !boundedText(residentId) || !safeInteger(heroLevel, 1, 50)) {
    throw new TypeError("Companion combat profile input is invalid");
  }
  return {
    maxHealth: 18 + heroLevel * 2 + randomInt(7, seed, "companion", residentId, 0, "max-health"),
    maxMana: 0,
    power: 4 + heroLevel + randomInt(4, seed, "companion", residentId, 0, "power"),
    armor: 1 + Math.floor(heroLevel / 3) + randomInt(3, seed, "companion", residentId, 0, "armor"),
    initiative: 6 + randomInt(12, seed, "companion", residentId, 0, "initiative"),
  };
}

export function selectSharedRoadCompanion(input: SharedRoadCompanionSelection): ActiveCompanion | null {
  if (!isValidCompanionRoster(input.roster)) throw new TypeError("Companion roster is invalid");
  if (
    !boundedText(input.seed) ||
    !safeInteger(input.joinedTick, 0) ||
    !safeInteger(input.heroLevel, 1, 50) ||
    input.roster.active.length !== 0 ||
    input.roster.former.length >= maximumFormerCompanions ||
    input.atlas.route !== null ||
    input.atlas.currentLocationId !== input.town.locationId ||
    !safeInteger(input.town.visits, 1)
  ) return null;
  const origin = locationById(input.atlas, input.town.locationId);
  if (origin?.kind !== "town" || !input.atlas.discoveredLocationIds.includes(origin.id)) return null;
  if (!boundedText(input.town.id) || !uniqueIds(input.town.residents) || !uniqueIds(input.town.buildings)) return null;
  const destinations = sharedRoadDestinations(input.atlas, origin.id);
  if (destinations.length === 0) return null;
  const unavailable = new Set(input.roster.former.map((companion) => companion.identity.residentId));
  const residents = input.town.residents
    .filter((resident) => !unavailable.has(resident.id) && residentBelongsToTown(input.town, resident))
    .sort((left, right) => compareIds(left.id, right.id));
  if (residents.length === 0) return null;
  const resident = residents[randomInt(
    residents.length,
    input.seed,
    "companion",
    input.town.id,
    input.joinedTick,
    "resident",
  )];
  if (resident === undefined) return null;
  const destination = destinations[randomInt(
    destinations.length,
    input.seed,
    "companion",
    resident.id,
    input.joinedTick,
    "destination",
  )];
  if (destination === undefined) return null;
  const combat = createCompanionCombatProfile(input.seed, resident.id, input.heroLevel);
  const initialBond = resident.disposition === "warm" ? 2 : resident.disposition === "neutral" ? 1 : 0;
  return {
    phase: "travelling",
    identity: {
      residentId: resident.id,
      name: resident.name,
      role: resident.role,
      disposition: resident.disposition,
      originTownId: input.town.id,
      originLocationId: input.town.locationId,
      homeBuildingId: resident.homeBuildingId,
    },
    destination: { locationId: destination.id, name: destination.name },
    purpose: "shared-road-oath",
    joinedTick: input.joinedTick,
    resources: { health: combat.maxHealth, mana: combat.maxMana },
    combat,
    victories: 0,
    bond: initialBond,
    injury: "none",
  };
}

export function addActiveCompanion(
  roster: CompanionRosterState,
  companion: ActiveCompanion,
): CompanionRosterState {
  if (!isValidCompanionRoster(roster) || !isValidActiveCompanion(companion)) {
    throw new TypeError("Cannot add an invalid companion");
  }
  if (roster.active.length !== 0) throw new Error("This release supports exactly one active companion");
  if (roster.former.length >= maximumFormerCompanions) throw new Error("Former companion history is full");
  if (roster.former.some((record) => record.identity.residentId === companion.identity.residentId)) {
    throw new Error("A former companion cannot rejoin in this release");
  }
  return { ...roster, active: [companion] };
}

export function companionToCombatant(companion: ActiveCompanion): CombatantState {
  if (!isValidActiveCompanion(companion)) throw new TypeError("Cannot create a combatant from an invalid companion");
  return {
    id: companion.identity.residentId,
    name: companion.identity.name,
    side: "heroes",
    health: companion.resources.health,
    maxHealth: companion.combat.maxHealth,
    mana: companion.resources.mana,
    maxMana: companion.combat.maxMana,
    power: companion.combat.power,
    armor: companion.combat.armor,
    initiative: companion.combat.initiative,
    statuses: [],
    speciesId: null,
    abilities: [],
  };
}

export function syncCompanionResources(
  companion: ActiveCompanion,
  combatant: CombatantState,
): ActiveCompanion {
  if (!isValidActiveCompanion(companion)) throw new TypeError("Cannot synchronize an invalid companion");
  if (
    combatant.id !== companion.identity.residentId ||
    combatant.name !== companion.identity.name ||
    combatant.side !== "heroes" ||
    combatant.speciesId !== null ||
    combatant.abilities.length !== 0 ||
    combatant.maxHealth !== companion.combat.maxHealth ||
    combatant.maxMana !== companion.combat.maxMana ||
    combatant.power !== companion.combat.power ||
    combatant.armor !== companion.combat.armor ||
    combatant.initiative !== companion.combat.initiative ||
    !safeInteger(combatant.health, 0, combatant.maxHealth) ||
    !safeInteger(combatant.mana, 0, combatant.maxMana)
  ) throw new TypeError("Combatant does not match the companion's fixed combat profile");
  return {
    ...companion,
    resources: { health: combatant.health, mana: combatant.mana },
    injury: combatant.health === 0 ? "fallen" : "none",
  };
}

export function syncActiveCompanionResources(
  roster: CompanionRosterState,
  combatants: readonly CombatantState[],
): CompanionRosterState {
  if (!isValidCompanionRoster(roster)) throw new TypeError("Companion roster is invalid");
  if (roster.active.length === 0) return roster;
  const active = roster.active[0];
  if (active === undefined) return roster;
  const matches = combatants.filter((combatant) => combatant.id === active.identity.residentId);
  if (matches.length !== 1) throw new Error("Active companion combatant is missing or duplicated");
  return { ...roster, active: [syncCompanionResources(active, matches[0]!)] };
}

export function syncActiveCompanionCombat(
  roster: CompanionRosterState,
  combatants: readonly CombatantState[],
  outcome: CombatState["outcome"],
): CompanionRosterState {
  if (!isValidCompanionRoster(roster)) throw new TypeError("Companion roster is invalid");
  if (outcome !== "ongoing" && outcome !== "victory" && outcome !== "defeat" && outcome !== "stalemate") {
    throw new TypeError("Combat outcome is invalid");
  }
  const synchronized = syncActiveCompanionResources(roster, combatants);
  const active = synchronized.active[0];
  if (active === undefined || outcome !== "victory") return synchronized;
  return {
    ...synchronized,
    active: [{
      ...active,
      victories: Math.min(Number.MAX_SAFE_INTEGER, active.victories + 1),
      bond: Math.min(100, active.bond + 2),
    }],
  };
}

export function retireActiveCompanionAtDestination(
  roster: CompanionRosterState,
  facts: CompanionDestinationDepartureFacts,
): CompanionRosterState {
  if (!isValidCompanionRoster(roster)) throw new TypeError("Companion roster is invalid");
  if (roster.active.length === 0) return roster;
  if (!safeInteger(facts.tick, 0) || !boundedText(facts.locationId)) {
    throw new TypeError("Companion departure facts are invalid");
  }
  const active = roster.active[0];
  if (active === undefined || facts.tick < active.joinedTick) throw new Error("Companion departure predates the oath");
  if (active.phase !== "arrived" || facts.locationId !== active.destination.locationId) {
    throw new Error("Companion can retire only after arriving at the oath destination");
  }
  const fulfilled = active.injury === "none";
  const former: FormerCompanion = {
    ...active,
    phase: "former",
    departure: {
      tick: facts.tick,
      locationId: facts.locationId,
      outcome: fulfilled ? "fulfilled" : "injured",
    },
  };
  const formerHistory = [...roster.former.slice(-(maximumFormerCompanions - 1)), former];
  return { ...roster, active: [], former: formerHistory };
}

function isValidCompanionBase(value: unknown): value is ActiveCompanion | FormerCompanion {
  if (!isRecord(value) || !isRecord(value.identity) || !isRecord(value.destination) || !isRecord(value.resources) || !isRecord(value.combat)) return false;
  const identity = value.identity;
  const destination = value.destination;
  const resources = value.resources;
  const combat = value.combat;
  return (
    boundedText(identity.residentId) &&
    boundedText(identity.name, 128) &&
    boundedText(identity.role, 64) &&
    (identity.disposition === "wary" || identity.disposition === "neutral" || identity.disposition === "warm") &&
    boundedText(identity.originTownId) &&
    boundedText(identity.originLocationId) &&
    boundedText(identity.homeBuildingId) &&
    boundedText(destination.locationId) &&
    boundedText(destination.name, 128) &&
    destination.locationId !== identity.originLocationId &&
    value.purpose === "shared-road-oath" &&
    safeInteger(value.joinedTick, 0) &&
    safeInteger(combat.maxHealth, 1, 10_000) &&
    safeInteger(combat.maxMana, 0, 10_000) &&
    safeInteger(combat.power, 1, 10_000) &&
    safeInteger(combat.armor, 0, 10_000) &&
    safeInteger(combat.initiative, 0, 10_000) &&
    safeInteger(resources.health, 0, combat.maxHealth as number) &&
    safeInteger(resources.mana, 0, combat.maxMana as number) &&
    safeInteger(value.victories, 0) &&
    safeInteger(value.bond, 0, 100) &&
    (value.injury === "none" || value.injury === "wounded" || value.injury === "fallen")
  );
}

export function isValidActiveCompanion(value: unknown): value is ActiveCompanion {
  if (!isValidCompanionBase(value) || (value.phase !== "travelling" && value.phase !== "arrived")) return false;
  return value.injury === (value.resources.health === 0 ? "fallen" : "none");
}

export function isValidFormerCompanion(value: unknown): value is FormerCompanion {
  if (!isValidCompanionBase(value) || value.phase !== "former" || !isRecord(value.departure)) return false;
  const departure = value.departure;
  if (
    !safeInteger(departure.tick, value.joinedTick) ||
    !boundedText(departure.locationId) ||
    departure.locationId !== value.destination.locationId ||
    (departure.outcome !== "fulfilled" && departure.outcome !== "injured")
  ) return false;
  return departure.outcome === "fulfilled"
    ? value.resources.health > 0 && value.injury === "none"
    : value.injury === (value.resources.health === 0 ? "fallen" : "wounded");
}

export function isValidCompanionRoster(value: unknown): value is CompanionRosterState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.active) || !Array.isArray(value.former)) return false;
  if (value.active.length > maximumActiveCompanionsV1 || value.former.length > maximumFormerCompanions) return false;
  if (!value.active.every(isValidActiveCompanion) || !value.former.every(isValidFormerCompanion)) return false;
  const ids = [...value.active, ...value.former].map((companion) => companion.identity.residentId);
  return new Set(ids).size === ids.length;
}

export function isValidCompanionReferences(
  roster: CompanionRosterState,
  atlas: AtlasState,
  towns: Readonly<Record<string, TownState>>,
): boolean {
  if (!isValidCompanionRoster(roster)) return false;
  return [...roster.active, ...roster.former].every((companion) => {
    const town = towns[companion.identity.originLocationId];
    const destination = locationById(atlas, companion.destination.locationId);
    if (
      town?.id !== companion.identity.originTownId ||
      town.locationId !== companion.identity.originLocationId ||
      destination?.name !== companion.destination.name ||
      !isPublicReachableDistinctTown(atlas, companion.identity.originLocationId, companion.destination.locationId)
    ) return false;
    if (companion.phase === "arrived" && atlas.currentLocationId !== companion.destination.locationId) return false;
    const residents = town.residents.filter((resident) => resident.id === companion.identity.residentId);
    if (residents.length !== 1) return false;
    const resident = residents[0];
    return resident !== undefined && residentBelongsToTown(town, resident) &&
      resident.name === companion.identity.name &&
      resident.role === companion.identity.role &&
      resident.disposition === companion.identity.disposition &&
      resident.homeBuildingId === companion.identity.homeBuildingId;
  });
}
