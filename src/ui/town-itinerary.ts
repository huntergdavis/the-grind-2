import type { ChronicleEntry, EventPolicy, SceneState, WorldState } from "../core/types";
import { maximumDecisionsSinceProgress } from "../core/forward-motion";
import {
  applyHeroExperience,
  applyQuestProgressFact,
  heroMasteryForExperience,
} from "../depth/rpg";
import { generateTown } from "../depth/towns";
import type {
  TownBuilding,
  TownDistrict,
  TownResident,
  TownState,
} from "../depth/types";

export interface TownItineraryHeroFactV1 {
  readonly id: string;
  readonly name: string;
  readonly className: string;
}

export interface TownItineraryLocationFactV1 {
  readonly id: string;
  readonly name: string;
}

export interface TownItineraryTownFactV1 {
  readonly id: string;
  readonly locationId: string;
  readonly name: string;
  readonly specialty: string;
  readonly foundedYear: number;
}

export interface TownItineraryCounterFactV1 {
  readonly before: number;
  readonly after: number;
}

export interface TownItineraryExperienceFactV1 extends TownItineraryCounterFactV1 {
  readonly delta: 1;
}

export interface TownItineraryResidentFactV1 {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly disposition: TownResident["disposition"];
  readonly homeBuildingId: string;
}

export interface TownItineraryBuildingFactV1 {
  readonly id: string;
  readonly name: string;
  readonly kind: TownBuilding["kind"];
  readonly districtId: string;
}

export interface TownItineraryDistrictFactV1 {
  readonly id: string;
  readonly name: string;
  readonly character: string;
}

export interface TownItineraryPacketV1 {
  readonly schemaVersion: 1;
  readonly packetKind: "town-itinerary@1";
  readonly eventId: string;
  readonly tick: number;
  readonly campaignId: string;
  readonly commandId: string;
  readonly commandType: "visit-town";
  readonly hero: TownItineraryHeroFactV1;
  readonly location: TownItineraryLocationFactV1;
  readonly town: TownItineraryTownFactV1;
  readonly visit: TownItineraryCounterFactV1;
  readonly reputation: TownItineraryCounterFactV1;
  readonly experience: TownItineraryExperienceFactV1;
  readonly selectionOrdinal: number;
  readonly selectionIndex: number;
  readonly residentCount: number;
  readonly resident: TownItineraryResidentFactV1;
  readonly building: TownItineraryBuildingFactV1;
  readonly district: TownItineraryDistrictFactV1;
  readonly routeStops: readonly TownItineraryBuildingFactV1[];
  readonly mechanicalEffect: "visit-and-reputation-already-applied";
}

const packetKeys = Object.freeze([
  "schemaVersion", "packetKind", "eventId", "tick", "campaignId", "commandId", "commandType",
  "hero", "location", "town", "visit", "reputation", "experience", "selectionOrdinal",
  "selectionIndex", "residentCount", "resident", "building", "district", "routeStops",
  "mechanicalEffect",
] as const);
const heroKeys = Object.freeze(["id", "name", "className"] as const);
const locationKeys = Object.freeze(["id", "name"] as const);
const townKeys = Object.freeze(["id", "locationId", "name", "specialty", "foundedYear"] as const);
const counterKeys = Object.freeze(["before", "after"] as const);
const experienceKeys = Object.freeze(["before", "after", "delta"] as const);
const residentKeys = Object.freeze(["id", "name", "role", "disposition", "homeBuildingId"] as const);
const buildingKeys = Object.freeze(["id", "name", "kind", "districtId"] as const);
const districtKeys = Object.freeze(["id", "name", "character"] as const);
const buildingKinds: readonly TownBuilding["kind"][] = Object.freeze([
  "inn", "smithy", "market", "shrine", "hall", "home",
]);
const dispositions: readonly TownResident["disposition"][] = Object.freeze(["wary", "neutral", "warm"]);
const worldMinutesPerVisit = 15;
const maximumVisitLogEntries = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((entry, index) => sameValue(entry, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined).sort();
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length || new Set(left).size !== left.length || new Set(right).size !== right.length) {
    return false;
  }
  const orderedLeft = [...left].sort(lexical);
  const orderedRight = [...right].sort(lexical);
  return orderedLeft.every((entry, index) => entry === orderedRight[index]);
}

function validTownGraph(town: TownState): boolean {
  if (!boundedText(town.id, 512)
    || !boundedText(town.locationId, 512)
    || !boundedText(town.name, 160)
    || !boundedText(town.specialty, 160)
    || !safeInteger(town.foundedYear)
    || !safeInteger(town.visits, 0, Number.MAX_SAFE_INTEGER - 1)
    || !safeInteger(town.reputation, 0, 100)
    || town.districts.length < 1
    || town.buildings.length < 1
    || town.residents.length < 1) return false;

  const districtIds = town.districts.map((district) => district.id);
  const buildingIds = town.buildings.map((building) => building.id);
  const residentIds = town.residents.map((resident) => resident.id);
  if (new Set(districtIds).size !== districtIds.length
    || new Set(buildingIds).size !== buildingIds.length
    || new Set(residentIds).size !== residentIds.length) return false;

  for (const district of town.districts) {
    if (!boundedText(district.id, 512)
      || !boundedText(district.name, 160)
      || !boundedText(district.character, 240)
      || !sameMembers(
        district.buildingIds,
        town.buildings.filter((building) => building.districtId === district.id).map((building) => building.id),
      )) return false;
  }
  for (const building of town.buildings) {
    if (!boundedText(building.id, 512)
      || !boundedText(building.name, 160)
      || !buildingKinds.includes(building.kind)
      || !districtIds.includes(building.districtId)
      || !sameMembers(
        building.residentIds,
        town.residents.filter((resident) => resident.homeBuildingId === building.id).map((resident) => resident.id),
      )) return false;
  }
  return town.residents.every((resident) =>
    boundedText(resident.id, 512)
    && boundedText(resident.name, 160)
    && boundedText(resident.role, 160)
    && dispositions.includes(resident.disposition)
    && buildingIds.includes(resident.homeBuildingId)
  );
}

function validHeroFact(value: unknown): value is TownItineraryHeroFactV1 {
  return isRecord(value)
    && exactKeys(value, heroKeys)
    && boundedText(value.id, 512)
    && boundedText(value.name, 160)
    && boundedText(value.className, 160);
}

function validLocationFact(value: unknown): value is TownItineraryLocationFactV1 {
  return isRecord(value)
    && exactKeys(value, locationKeys)
    && boundedText(value.id, 512)
    && boundedText(value.name, 160);
}

function validTownFact(value: unknown): value is TownItineraryTownFactV1 {
  return isRecord(value)
    && exactKeys(value, townKeys)
    && boundedText(value.id, 512)
    && boundedText(value.locationId, 512)
    && boundedText(value.name, 160)
    && boundedText(value.specialty, 160)
    && safeInteger(value.foundedYear);
}

function validCounterFact(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is TownItineraryCounterFactV1 {
  return isRecord(value)
    && exactKeys(value, counterKeys)
    && safeInteger(value.before, 0, maximum)
    && safeInteger(value.after, 0, maximum);
}

function validExperienceFact(value: unknown): value is TownItineraryExperienceFactV1 {
  return isRecord(value)
    && exactKeys(value, experienceKeys)
    && safeInteger(value.before, 0, Number.MAX_SAFE_INTEGER - 1)
    && safeInteger(value.after, 1)
    && value.delta === 1
    && value.after === (value.before as number) + 1;
}

function validResidentFact(value: unknown): value is TownItineraryResidentFactV1 {
  return isRecord(value)
    && exactKeys(value, residentKeys)
    && boundedText(value.id, 512)
    && boundedText(value.name, 160)
    && boundedText(value.role, 160)
    && dispositions.includes(value.disposition as TownResident["disposition"])
    && boundedText(value.homeBuildingId, 512);
}

function validBuildingFact(value: unknown): value is TownItineraryBuildingFactV1 {
  return isRecord(value)
    && exactKeys(value, buildingKeys)
    && boundedText(value.id, 512)
    && boundedText(value.name, 160)
    && buildingKinds.includes(value.kind as TownBuilding["kind"])
    && boundedText(value.districtId, 512);
}

function validDistrictFact(value: unknown): value is TownItineraryDistrictFactV1 {
  return isRecord(value)
    && exactKeys(value, districtKeys)
    && boundedText(value.id, 512)
    && boundedText(value.name, 160)
    && boundedText(value.character, 240);
}

/** Accepts only the exact, internally consistent packet shape emitted by projectTownItinerary. */
export function isTownItineraryPacketV1(value: unknown): value is TownItineraryPacketV1 {
  if (!isRecord(value)
    || !exactKeys(value, packetKeys)
    || !validHeroFact(value.hero)
    || !validLocationFact(value.location)
    || !validTownFact(value.town)
    || !validCounterFact(value.visit)
    || !validCounterFact(value.reputation, 100)
    || !validExperienceFact(value.experience)
    || !validResidentFact(value.resident)
    || !validBuildingFact(value.building)
    || !validDistrictFact(value.district)
    || !Array.isArray(value.routeStops)
    || value.routeStops.length < 1
    || value.routeStops.length > 3
    || !value.routeStops.every(validBuildingFact)) return false;

  const packet = value as unknown as TownItineraryPacketV1;
  const routeIds = packet.routeStops.map((stop) => stop.id);
  const endpoint = packet.routeStops.at(-1);
  return packet.schemaVersion === 1
    && packet.packetKind === "town-itinerary@1"
    && boundedText(packet.eventId, 512)
    && safeInteger(packet.tick)
    && boundedText(packet.campaignId, 512)
    && boundedText(packet.commandId, 512)
    && packet.commandType === "visit-town"
    && packet.eventId === `${packet.campaignId}:${packet.tick}`
    && packet.commandId === `${packet.campaignId}:town:${packet.location.id}`
    && packet.town.id === `town:${packet.location.id}`
    && packet.town.locationId === packet.location.id
    && packet.visit.after === packet.visit.before + 1
    && packet.reputation.after === Math.min(100, packet.reputation.before + 1)
    && safeInteger(packet.selectionOrdinal)
    && packet.selectionOrdinal === packet.visit.before
    && safeInteger(packet.residentCount, 1)
    && safeInteger(packet.selectionIndex, 0, packet.residentCount - 1)
    && packet.selectionIndex === packet.selectionOrdinal % packet.residentCount
    && packet.resident.homeBuildingId === packet.building.id
    && packet.building.districtId === packet.district.id
    && new Set(routeIds).size === routeIds.length
    && packet.routeStops.every((stop) => stop.districtId === packet.district.id)
    && endpoint !== undefined
    && sameValue(endpoint, packet.building)
    && packet.mechanicalEffect === "visit-and-reputation-already-applied";
}

function expectedTownPolicy(maximumCatchUpTicks: number): EventPolicy {
  return {
    attention: "backgroundSafe",
    reversible: true,
    maximumFidelityAffected: "aggregate",
    thresholdBehavior: "continue",
    maximumCreditedDurationTicks: maximumCatchUpTicks,
    aggregation: "summarize",
    queuedFallback: "chronicle-summary",
  };
}

function sceneFromSource(source: ChronicleEntry): SceneState {
  return {
    mode: source.mode,
    location: source.location,
    headline: source.headline,
    action: source.action,
    goal: source.goal,
    consequence: source.consequence,
    sensoryIntensity: source.sensoryIntensity,
  };
}

function questSignature(world: WorldState): string {
  return [...world.depth.quest.objectives, ...world.depth.quest.subquests.flatMap((subquest) => subquest.objectives)]
    .map((objective) => `${objective.id}:${objective.current}:${objective.status}`)
    .join("|");
}

function validSource(before: WorldState, after: WorldState, source: ChronicleEntry, locationId: string, locationName: string): boolean {
  const expectedCommandId = `${before.campaignId}:town:${locationId}`;
  const considered = source.consideredCommandIds;
  const trace = source.decisionTrace;
  return source.id === `${after.campaignId}:${after.tick}`
    && source.tick === after.tick
    && source.commandId === expectedCommandId
    && source.commandType === "visit-town"
    && source.mode === "town"
    && source.location === locationName
    && source.attention === "backgroundSafe"
    && sameValue(source.policy, expectedTownPolicy(before.lifecycle.maximumCatchUpTicks))
    && Array.isArray(considered)
    && considered.length >= 1
    && considered.length <= 4
    && considered.includes(expectedCommandId)
    && trace !== undefined
    && trace.actorId === before.hero.id
    && trace.actorName === before.hero.name
    && trace.selected.commandId === expectedCommandId
    && trace.considered.some((entry) => entry.commandId === expectedCommandId)
    && before.chronicle.every((entry) => entry.id !== source.id)
    && after.chronicle.filter((entry) => entry.id === source.id).length === 1
    && sameValue(after.chronicle, [...before.chronicle.slice(-31), source])
    && sameValue(after.chronicle.at(-1), source)
    && sameValue(after.scene, sceneFromSource(source));
}

function expectedVisitDepth(before: WorldState, townBefore: TownState, firstVisit: boolean): WorldState["depth"] | null {
  if (!validTownGraph(townBefore)) return null;
  const tick = before.depth.tick + 1;
  const townAfter: TownState = {
    ...townBefore,
    visits: townBefore.visits + 1,
    reputation: Math.min(100, townBefore.reputation + 1),
  };
  const quest = firstVisit
    ? applyQuestProgressFact(before.depth.quest, {
        schemaVersion: 1,
        kind: "location-first-visited",
        locationId: townBefore.locationId,
        locationKind: "town",
      })
    : before.depth.quest;
  const progression = applyHeroExperience(before.depth.hero, 1);
  if (progression.experienceDelta !== 1 || progression.levelAfter !== progression.levelBefore) return null;
  const logEntry = {
    id: `${before.depth.seed}:depth:${tick}:town`,
    tick,
    category: "town" as const,
    message: `${townAfter.name} opens its ${townAfter.districts.length} districts to the party.`,
  };
  return {
    ...before.depth,
    tick,
    towns: { ...before.depth.towns, [townBefore.locationId]: townAfter },
    hero: progression.hero,
    quest,
    log: [...before.depth.log.slice(-(maximumVisitLogEntries - 1)), logEntry],
  };
}

function expectedForwardMotion(before: WorldState, expectedDepth: WorldState["depth"]): WorldState["forwardMotion"] {
  const progressed = questSignature(before) !== questSignature({ ...before, depth: expectedDepth });
  return {
    ...before.forwardMotion,
    decisionsSinceProgress: progressed
      ? 0
      : Math.min(maximumDecisionsSinceProgress, before.forwardMotion.decisionsSinceProgress + 1),
    lastProgressTick: progressed ? expectedDepth.tick : before.forwardMotion.lastProgressTick,
    activeDirective: null,
  };
}

function validWorldTransition(before: WorldState, after: WorldState, source: ChronicleEntry): TownState | null {
  if (before.schemaVersion !== 9
    || after.schemaVersion !== 9
    || before.campaignId !== after.campaignId
    || before.seed !== after.seed
    || before.depth.seed !== before.seed
    || after.depth.seed !== after.seed
    || before.hero.id !== before.depth.hero.id
    || after.hero.id !== after.depth.hero.id
    || before.hero.id !== after.hero.id
    || before.hero.name !== before.depth.hero.name
    || after.hero.name !== after.depth.hero.name
    || before.hero.name !== after.hero.name
    || before.depth.hero.className !== after.depth.hero.className
    || before.tick !== before.depth.tick
    || after.tick !== after.depth.tick
    || after.tick !== before.tick + 1
    || before.depth.atlas.route !== null
    || before.depth.combat !== null
    || before.depth.counterDuel !== null) return null;

  const locationMatches = before.depth.atlas.locations.filter(
    (location) => location.id === before.depth.atlas.currentLocationId,
  );
  const location = locationMatches.length === 1 ? locationMatches[0] : undefined;
  if (location?.kind !== "town"
    || after.depth.atlas.currentLocationId !== location.id
    || !validSource(before, after, source, location.id, location.name)) return null;

  const storedTown = before.depth.towns[location.id];
  const townBefore = storedTown ?? generateTown(before.seed, location.id);
  const firstVisit = storedTown === undefined || storedTown.visits === 0;
  if (townBefore.locationId !== location.id
    || townBefore.id !== `town:${location.id}`) return null;
  const expectedDepth = expectedVisitDepth(before, townBefore, firstVisit);
  if (expectedDepth === null || !sameValue(after.depth, expectedDepth)) return null;

  const expectedHero = {
    ...before.hero,
    level: expectedDepth.hero.level,
    mastery: heroMasteryForExperience(expectedDepth.hero.experience),
    experience: expectedDepth.hero.experience,
    health: expectedDepth.hero.resources.health,
    maxHealth: expectedDepth.hero.resources.maxHealth,
    gold: expectedDepth.hero.gold,
  };
  const expectedLifecycle = {
    ...before.lifecycle,
    simulationTick: after.tick,
    worldClockMinutes: before.lifecycle.worldClockMinutes + worldMinutesPerVisit,
    attentionClock: before.lifecycle.attentionClock,
  };
  return sameValue(after.hero, expectedHero)
    && sameValue(after.lifecycle, expectedLifecycle)
    && sameValue(after.forwardMotion, expectedForwardMotion(before, expectedDepth))
    && sameValue(after.pendingAttention, before.pendingAttention.filter((event) => event.tick !== after.tick))
    && after.campaignPolicy === before.campaignPolicy
    && sameValue(after.championInduction, before.championInduction)
    && sameValue(after.legacy, before.legacy)
    && sameValue(after.legacyManifestations, before.legacyManifestations)
      ? townBefore
      : null;
}

function buildingFact(building: TownBuilding): TownItineraryBuildingFactV1 {
  return {
    id: building.id,
    name: building.name,
    kind: building.kind,
    districtId: building.districtId,
  };
}

function routeStops(town: TownState, district: TownDistrict, home: TownBuilding): readonly TownItineraryBuildingFactV1[] {
  const earlierStops = town.buildings
    .filter((building) => building.districtId === district.id && building.id !== home.id)
    .sort((left, right) => lexical(left.id, right.id))
    .slice(0, 2);
  return [...earlierStops, home].map(buildingFact);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

/** Projects one live, ordinary, non-leveling town visit without changing either input world. */
export function projectTownItinerary(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): TownItineraryPacketV1 | null {
  const townBefore = validWorldTransition(before, after, source);
  if (townBefore === null) return null;
  const townAfter = after.depth.towns[townBefore.locationId];
  if (townAfter === undefined || !validTownGraph(townAfter)) return null;

  const residents = [...townBefore.residents].sort((left, right) => lexical(left.id, right.id));
  const selectionOrdinal = townBefore.visits;
  const selectionIndex = selectionOrdinal % residents.length;
  const resident = residents[selectionIndex];
  if (resident === undefined) return null;
  const homes = townBefore.buildings.filter((building) => building.id === resident.homeBuildingId);
  const home = homes.length === 1 ? homes[0] : undefined;
  const districts = home === undefined
    ? []
    : townBefore.districts.filter((district) => district.id === home.districtId);
  const district = districts.length === 1 ? districts[0] : undefined;
  const location = before.depth.atlas.locations.find((candidate) => candidate.id === townBefore.locationId);
  if (home === undefined || district === undefined || location?.kind !== "town") return null;

  const packet: TownItineraryPacketV1 = {
    schemaVersion: 1,
    packetKind: "town-itinerary@1",
    eventId: source.id,
    tick: source.tick,
    campaignId: after.campaignId,
    commandId: source.commandId!,
    commandType: "visit-town",
    hero: {
      id: after.depth.hero.id,
      name: after.depth.hero.name,
      className: after.depth.hero.className,
    },
    location: { id: location.id, name: location.name },
    town: {
      id: townBefore.id,
      locationId: townBefore.locationId,
      name: townBefore.name,
      specialty: townBefore.specialty,
      foundedYear: townBefore.foundedYear,
    },
    visit: { before: townBefore.visits, after: townAfter.visits },
    reputation: { before: townBefore.reputation, after: townAfter.reputation },
    experience: {
      before: before.depth.hero.experience,
      delta: 1,
      after: after.depth.hero.experience,
    },
    selectionOrdinal,
    selectionIndex,
    residentCount: residents.length,
    resident: {
      id: resident.id,
      name: resident.name,
      role: resident.role,
      disposition: resident.disposition,
      homeBuildingId: resident.homeBuildingId,
    },
    building: buildingFact(home),
    district: { id: district.id, name: district.name, character: district.character },
    routeStops: routeStops(townBefore, district, home),
    mechanicalEffect: "visit-and-reputation-already-applied",
  };
  return isTownItineraryPacketV1(packet) ? deepFreeze(packet) : null;
}
