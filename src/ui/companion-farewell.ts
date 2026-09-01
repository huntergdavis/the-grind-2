import type { ChronicleEntry, SceneState, WorldState } from "../core/types";
import { stepDepth } from "../depth/state";
import type { CompanionDepartureOutcome, CompanionInjury, TownResident } from "../depth/types";

export interface CompanionFarewellPacket {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly tick: number;
  readonly commandId: string;
  readonly commandType: "farewell-companion";
  readonly heroId: string;
  readonly companionId: string;
  readonly companionName: string;
  readonly profession: string;
  readonly disposition: TownResident["disposition"];
  readonly originTownId: string;
  readonly originLocationId: string;
  readonly originName: string;
  readonly destinationId: string;
  readonly destinationName: string;
  readonly purpose: "shared-road-oath";
  readonly joinedTick: number;
  readonly departureTick: number;
  readonly outcome: CompanionDepartureOutcome;
  readonly injury: CompanionInjury;
  readonly health: number;
  readonly maxHealth: number;
  readonly victories: number;
  readonly bond: number;
}

const companionFarewellPacketKeys = Object.freeze([
  "schemaVersion", "eventId", "tick", "commandId", "commandType", "heroId", "companionId", "companionName",
  "profession", "disposition", "originTownId", "originLocationId", "originName", "destinationId",
  "destinationName", "purpose", "joinedTick", "departureTick", "outcome", "injury", "health", "maxHealth",
  "victories", "bond",
] as const);

function farewellPacketRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function farewellPacketHasExactKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...companionFarewellPacketKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function farewellPacketText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function farewellPacketInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

/** Accepts only the exact, internally consistent packet shape emitted by projectCompanionFarewell. */
export function isCompanionFarewellPacket(value: unknown): value is CompanionFarewellPacket {
  const record = farewellPacketRecord(value);
  if (record === null || !farewellPacketHasExactKeys(record)) return false;
  if (record.schemaVersion !== 1
    || !farewellPacketText(record.eventId)
    || !farewellPacketInteger(record.tick)
    || !farewellPacketText(record.commandId)
    || record.commandType !== "farewell-companion"
    || !farewellPacketText(record.heroId)
    || !farewellPacketText(record.companionId)
    || !farewellPacketText(record.companionName)
    || !farewellPacketText(record.profession)
    || !["wary", "neutral", "warm"].includes(String(record.disposition))
    || !farewellPacketText(record.originTownId)
    || !farewellPacketText(record.originLocationId)
    || !farewellPacketText(record.originName)
    || !farewellPacketText(record.destinationId)
    || !farewellPacketText(record.destinationName)
    || record.purpose !== "shared-road-oath"
    || !farewellPacketInteger(record.joinedTick)
    || !farewellPacketInteger(record.departureTick)
    || !["fulfilled", "injured"].includes(String(record.outcome))
    || !["none", "wounded", "fallen"].includes(String(record.injury))
    || !farewellPacketInteger(record.health)
    || !farewellPacketInteger(record.maxHealth, 1)
    || !farewellPacketInteger(record.victories)
    || !farewellPacketInteger(record.bond)) return false;

  const packet = record as unknown as CompanionFarewellPacket;
  const validOutcome = packet.outcome === "fulfilled"
    ? packet.injury === "none" && packet.health > 0
    : packet.injury === (packet.health === 0 ? "fallen" : "wounded");
  return packet.commandId.endsWith(`:companion:farewell:${packet.companionId}`)
    && packet.departureTick === packet.tick
    && packet.joinedTick <= packet.departureTick
    && packet.health <= packet.maxHealth
    && validOutcome;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined).sort();
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]));
}

function sourceScene(source: ChronicleEntry): SceneState {
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

function safeWorldPair(before: WorldState, after: WorldState, source: ChronicleEntry): boolean {
  if (
    before.campaignId !== after.campaignId
    || before.seed !== after.seed
    || before.hero.id !== after.hero.id
    || before.depth.hero.id !== after.depth.hero.id
    || before.hero.id !== before.depth.hero.id
    || after.hero.id !== after.depth.hero.id
    || after.tick !== before.tick + 1
    || after.depth.tick !== before.depth.tick + 1
    || after.tick !== after.depth.tick
    || source.id !== `${after.campaignId}:${after.tick}`
    || source.tick !== after.tick
    || source.commandType !== "farewell-companion"
    || typeof source.commandId !== "string"
    || source.commandId.length === 0
    || source.mode !== "chronicle"
    || before.chronicle.some((entry) => entry.id === source.id)
    || after.chronicle.filter((entry) => entry.id === source.id).length !== 1
    || !sameValue(after.chronicle, [...before.chronicle.slice(-31), source])
    || !sameValue(after.scene, sourceScene(source))
    || !sameValue(before.hero, after.hero)
  ) return false;
  return sameValue(after.chronicle.at(-1), source);
}

export function projectCompanionFarewell(
  before: WorldState,
  after: WorldState,
  source: ChronicleEntry,
): CompanionFarewellPacket | null {
  if (!safeWorldPair(before, after, source)) return null;
  const active = before.depth.companions.active[0];
  if (active === undefined
    || before.depth.companions.active.length !== 1
    || active.phase !== "arrived"
    || active.destination.locationId !== before.depth.atlas.currentLocationId
    || after.depth.companions.active.length !== 0) return null;

  const expectedCommandId = `${before.campaignId}:depth:${after.depth.tick}:companion:farewell:${active.identity.residentId}`;
  if (source.commandId !== expectedCommandId) return null;
  try {
    const expectedDepth = stepDepth(before.depth, {
      type: "farewell-companion",
      residentId: active.identity.residentId,
    });
    if (!sameValue(expectedDepth, after.depth)) return null;
  } catch {
    return null;
  }

  const departed = after.depth.companions.former.at(-1);
  if (departed === undefined
    || departed.identity.residentId !== active.identity.residentId
    || departed.departure.tick !== after.depth.tick
    || departed.departure.locationId !== active.destination.locationId) return null;
  const origin = after.depth.towns[departed.identity.originLocationId];
  const destinationMatches = after.depth.atlas.locations.filter(
    (location) => location.id === departed.destination.locationId,
  );
  const destination = destinationMatches.length === 1 ? destinationMatches[0] : undefined;
  if (origin === undefined
    || origin.id !== departed.identity.originTownId
    || destination?.kind !== "town"
    || destination.name !== departed.destination.name
    || !after.depth.atlas.discoveredLocationIds.includes(origin.locationId)
    || !after.depth.atlas.discoveredLocationIds.includes(destination.id)) return null;

  return Object.freeze({
    schemaVersion: 1,
    eventId: source.id,
    tick: source.tick,
    commandId: source.commandId,
    commandType: "farewell-companion",
    heroId: after.hero.id,
    companionId: departed.identity.residentId,
    companionName: departed.identity.name,
    profession: departed.identity.role,
    disposition: departed.identity.disposition,
    originTownId: origin.id,
    originLocationId: origin.locationId,
    originName: origin.name,
    destinationId: destination.id,
    destinationName: destination.name,
    purpose: departed.purpose,
    joinedTick: departed.joinedTick,
    departureTick: departed.departure.tick,
    outcome: departed.departure.outcome,
    injury: departed.injury,
    health: departed.resources.health,
    maxHealth: departed.combat.maxHealth,
    victories: departed.victories,
    bond: departed.bond,
  });
}
