import type {
  ActiveCompanion,
  AtlasState,
  CombatState,
  CompanionDepartureOutcome,
  CompanionPurpose,
  CompanionRosterState,
  FormerCompanion,
  TownState,
} from "../depth/types";
import { companionActionDefinition } from "../depth/companion-kit";
import {
  projectRoadcraftEffectiveness,
  type RoadcraftEffectivenessV1,
} from "./roadcraft-effectiveness";

export const maximumProjectedFormerCompanions = 12;

export type PartyCompanionStatus = "travelling" | "arrived" | "injured" | "arrived-injured";

export interface PartyProjectionSource {
  seed: string;
  atlas: Pick<AtlasState, "locations" | "discoveredLocationIds">;
  towns: Readonly<Record<string, TownState>>;
  companions: CompanionRosterState;
  combat: CombatState | null;
  completedCombats: readonly CombatState[];
}

export interface PartyOriginProjection {
  townId: string;
  locationId: string;
  name: string;
}

export interface PartyDestinationProjection {
  locationId: string;
  name: string;
}

interface PartyCompanionProjectionBase {
  id: string;
  name: string;
  role: string;
  origin: PartyOriginProjection;
  destination: PartyDestinationProjection;
  purpose: CompanionPurpose;
  purposeText: string;
  joinedTick: number;
  victories: number;
  bond: number;
  combatKitId: "legacy-basic" | "basic" | "miller-roadcraft";
  combatKitText: string;
  combatActionTexts: readonly string[];
  roadcraftEffectiveness: RoadcraftEffectivenessV1 | null;
}

export interface ActivePartyCompanionProjection extends PartyCompanionProjectionBase {
  status: PartyCompanionStatus;
  statusText: string;
  health: number;
  maxHealth: number;
}

export interface FormerPartyCompanionProjection extends PartyCompanionProjectionBase {
  departureTick: number;
  departureOutcome: CompanionDepartureOutcome;
  departureText: string;
}

export interface PartyProjection {
  active: ActivePartyCompanionProjection | null;
  former: readonly FormerPartyCompanionProjection[];
}

interface PublicCompanionPlaces {
  origin: PartyOriginProjection;
  destination: PartyDestinationProjection;
}

export function companionPurposeText(
  purpose: CompanionPurpose,
  originName: string,
  destinationName: string,
): string {
  switch (purpose) {
    case "shared-road-oath":
      return `Shared-road oath · ${originName} → ${destinationName}`;
  }
}

export function companionStatusText(status: PartyCompanionStatus, destinationName: string): string {
  switch (status) {
    case "travelling": return `Travelling to ${destinationName}`;
    case "arrived": return `Arrived at ${destinationName}`;
    case "injured": return `Injured en route to ${destinationName}`;
    case "arrived-injured": return `Arrived injured at ${destinationName}`;
  }
}

export function isInjuredPartyStatus(status: PartyCompanionStatus): boolean {
  return status === "injured" || status === "arrived-injured";
}

export function companionDepartureText(
  outcome: CompanionDepartureOutcome,
  destinationName: string,
): string {
  switch (outcome) {
    case "fulfilled": return `Oath fulfilled at ${destinationName}`;
    case "injured": return `Journey ended by injury at ${destinationName}`;
  }
}

function publicPlaces(
  source: PartyProjectionSource,
  companion: ActiveCompanion | FormerCompanion,
): PublicCompanionPlaces | null {
  const discovered = new Set(source.atlas.discoveredLocationIds);
  const originLocationId = companion.identity.originLocationId;
  const destinationLocationId = companion.destination.locationId;
  if (!discovered.has(originLocationId) || !discovered.has(destinationLocationId)) return null;

  const originTown = source.towns[originLocationId];
  const destinationMatches = source.atlas.locations.filter(
    (location) => location.id === destinationLocationId,
  );
  const destination = destinationMatches.length === 1 ? destinationMatches[0] : undefined;
  if (
    originTown === undefined ||
    originTown.id !== companion.identity.originTownId ||
    originTown.locationId !== originLocationId ||
    destination?.name !== companion.destination.name
  ) return null;

  return {
    origin: {
      townId: originTown.id,
      locationId: originTown.locationId,
      name: originTown.name,
    },
    destination: {
      locationId: destination.id,
      name: destination.name,
    },
  };
}

function companionBase(
  source: PartyProjectionSource,
  companion: ActiveCompanion | FormerCompanion,
  places: PublicCompanionPlaces,
): PartyCompanionProjectionBase {
  const combatKitId = companion.combatKit?.kitId ?? "legacy-basic";
  const combatKitText = combatKitId === "miller-roadcraft"
    ? "Miller · Roadcraft V1"
    : combatKitId === "basic" ? "Basic road kit" : "Legacy basic road kit";
  const combatActionTexts = combatKitId === "miller-roadcraft"
    ? (["flour-veil", "millstone-drag"] as const).map((actionId) => {
        const action = companionActionDefinition(actionId);
        return `${action.name} · ${action.effect} ${action.potency}/${action.duration} · 0 MP · 0 damage · CD ${action.cooldownRounds} round`;
      })
    : ["Attack · Guard"];
  return {
    id: companion.identity.residentId,
    name: companion.identity.name,
    role: companion.identity.role,
    origin: places.origin,
    destination: places.destination,
    purpose: companion.purpose,
    purposeText: companionPurposeText(
      companion.purpose,
      places.origin.name,
      places.destination.name,
    ),
    joinedTick: companion.joinedTick,
    victories: companion.victories,
    bond: companion.bond,
    combatKitId,
    combatKitText,
    combatActionTexts,
    roadcraftEffectiveness: projectRoadcraftEffectiveness(source, companion),
  };
}

function activeStatus(companion: ActiveCompanion): PartyCompanionStatus {
  if (companion.injury !== "none" || companion.resources.health === 0) {
    return companion.phase === "arrived" ? "arrived-injured" : "injured";
  }
  return companion.phase;
}

function projectActive(
  source: PartyProjectionSource,
  companion: ActiveCompanion | undefined,
): ActivePartyCompanionProjection | null {
  if (companion === undefined) return null;
  const places = publicPlaces(source, companion);
  if (places === null) return null;
  const status = activeStatus(companion);
  return {
    ...companionBase(source, companion, places),
    status,
    statusText: companionStatusText(status, places.destination.name),
    health: companion.resources.health,
    maxHealth: companion.combat.maxHealth,
  };
}

function projectFormer(
  source: PartyProjectionSource,
  companion: FormerCompanion,
): FormerPartyCompanionProjection | null {
  const places = publicPlaces(source, companion);
  if (places === null) return null;
  return {
    ...companionBase(source, companion, places),
    departureTick: companion.departure.tick,
    departureOutcome: companion.departure.outcome,
    departureText: companionDepartureText(companion.departure.outcome, places.destination.name),
  };
}

export function projectParty(source: PartyProjectionSource): PartyProjection {
  const former = [...source.companions.former]
    .sort((left, right) =>
      right.departure.tick - left.departure.tick ||
      (left.identity.residentId < right.identity.residentId
        ? -1
        : left.identity.residentId > right.identity.residentId ? 1 : 0)
    )
    .flatMap((companion) => {
      const projected = projectFormer(source, companion);
      return projected === null ? [] : [projected];
    })
    .slice(0, maximumProjectedFormerCompanions);

  return {
    active: projectActive(source, source.companions.active[0]),
    former,
  };
}
