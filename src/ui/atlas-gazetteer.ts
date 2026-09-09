import type {
  AtlasLocation,
  AtlasState,
  TownBuilding,
  TownResident,
  TownState,
} from "../depth/types";

export interface AtlasGazetteerResident {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly disposition: TownResident["disposition"];
}

export interface AtlasGazetteerBuilding {
  readonly id: string;
  readonly name: string;
  readonly kind: TownBuilding["kind"];
  readonly residents: readonly AtlasGazetteerResident[];
}

export interface AtlasGazetteerDistrict {
  readonly id: string;
  readonly name: string;
  readonly character: string;
  readonly buildings: readonly AtlasGazetteerBuilding[];
}

export interface AtlasGazetteerTown {
  readonly name: string;
  readonly specialty: string;
  readonly foundedYear: number;
  readonly visits: number;
  readonly reputation: number;
  readonly districts: readonly AtlasGazetteerDistrict[];
}

export interface AtlasGazetteerPlace {
  readonly id: string;
  readonly name: string;
  readonly kind: AtlasLocation["kind"];
  readonly feature: AtlasLocation["feature"];
  readonly danger: number;
  readonly isCurrent: boolean;
  readonly town: AtlasGazetteerTown | null;
}

export interface AtlasGazetteer {
  readonly places: readonly AtlasGazetteerPlace[];
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byNameAndId(left: { name: string; id: string }, right: { name: string; id: string }): number {
  return lexical(left.name, right.name) || lexical(left.id, right.id);
}

function projectTown(town: TownState): AtlasGazetteerTown {
  return Object.freeze({
    name: town.name,
    specialty: town.specialty,
    foundedYear: town.foundedYear,
    visits: town.visits,
    reputation: town.reputation,
    districts: Object.freeze([...town.districts].sort(byNameAndId).map((district) => Object.freeze({
      id: district.id,
      name: district.name,
      character: district.character,
      buildings: Object.freeze(town.buildings
        .filter((building) => building.districtId === district.id && district.buildingIds.includes(building.id))
        .sort(byNameAndId)
        .map((building) => Object.freeze({
          id: building.id,
          name: building.name,
          kind: building.kind,
          residents: Object.freeze(town.residents
            .filter((resident) => resident.homeBuildingId === building.id && building.residentIds.includes(resident.id))
            .sort(byNameAndId)
            .map((resident) => Object.freeze({
              id: resident.id,
              name: resident.name,
              role: resident.role,
              disposition: resident.disposition,
            }))),
        }))),
    }))),
  });
}

/** Inspect only discovered places and previously visited, recorded town details. */
export function projectAtlasGazetteer(source: {
  atlas: AtlasState;
  towns: Readonly<Record<string, TownState>>;
}): AtlasGazetteer {
  const discovered = new Set(source.atlas.discoveredLocationIds);
  const places = source.atlas.locations
    .filter((location) => discovered.has(location.id))
    .map((location): AtlasGazetteerPlace => {
      const town = source.towns[location.id];
      return Object.freeze({
        id: location.id,
        name: location.name,
        kind: location.kind,
        feature: location.feature,
        danger: location.danger,
        isCurrent: location.id === source.atlas.currentLocationId,
        town: location.kind === "town" && town?.locationId === location.id && town.visits > 0
          ? projectTown(town)
          : null,
      });
    })
    .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || byNameAndId(left, right));
  return Object.freeze({ places: Object.freeze(places) });
}
