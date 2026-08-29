import { pick, randomInt } from "../core/rng";
import type { TownBuilding, TownDistrict, TownResident, TownState } from "./types";

const townPrefixes = ["Bell", "Copper", "Fox", "Moss", "Oak", "Rain", "Star", "Thorn"] as const;
const townSuffixes = ["bridge", "cross", "harbor", "hollow", "market", "stead", "watch", "wick"] as const;
const districtNames = ["Old Ward", "Lantern Row", "River Quarter", "High Court", "Garden Ring", "Foundry"] as const;
const characters = ["crowded and musical", "quiet beneath old trees", "bright with painted signs", "smoky and industrious", "built over winding canals"] as const;
const buildingKinds: readonly TownBuilding["kind"][] = ["inn", "smithy", "market", "shrine", "hall", "home"];
const buildingWords = ["Badger", "Bell", "Candle", "Crown", "Heron", "Kettle", "Moon", "Wheel"] as const;
const givenNames = ["Ada", "Borin", "Cato", "Dima", "Eris", "Fara", "Galen", "Hale", "Iona", "Joss"] as const;
const familyNames = ["Ash", "Bramble", "Cooper", "Dale", "Fen", "Glass", "Marsh", "Vale"] as const;
const roles = ["baker", "cartographer", "guard", "healer", "merchant", "miller", "scholar", "smith"] as const;
const specialties = ["astral clocks", "blue iron", "glass fruit", "river charts", "singing pottery", "storm silk"] as const;

export function generateTown(seed: string, locationId: string): TownState {
  const townId = `town:${locationId}`;
  const name = `${pick(townPrefixes, seed, "town", townId, 0, "prefix")}${pick(townSuffixes, seed, "town", townId, 0, "suffix")}`;
  const districtCount = 3 + randomInt(3, seed, "town", townId, 0, "district-count");
  const districts: TownDistrict[] = [];
  const buildings: TownBuilding[] = [];
  const residents: TownResident[] = [];

  for (let districtIndex = 0; districtIndex < districtCount; districtIndex += 1) {
    const districtId = `${townId}:district:${districtIndex}`;
    const buildingIds: string[] = [];
    const buildingCount = 2 + randomInt(3, seed, "town", districtId, 0, "building-count");
    for (let buildingIndex = 0; buildingIndex < buildingCount; buildingIndex += 1) {
      const buildingId = `${districtId}:building:${buildingIndex}`;
      const kind = pick(buildingKinds, seed, "town", buildingId, 0, "kind");
      const residentIds: string[] = [];
      const residentCount = 1 + randomInt(3, seed, "town", buildingId, 0, "resident-count");
      for (let residentIndex = 0; residentIndex < residentCount; residentIndex += 1) {
        const residentId = `${buildingId}:resident:${residentIndex}`;
        residentIds.push(residentId);
        residents.push({
          id: residentId,
          name: `${pick(givenNames, seed, "town", residentId, 0, "given")} ${pick(familyNames, seed, "town", residentId, 0, "family")}`,
          role: pick(roles, seed, "town", residentId, 0, "role"),
          disposition: pick(["wary", "neutral", "warm"] as const, seed, "town", residentId, 0, "disposition"),
          homeBuildingId: buildingId,
        });
      }
      buildingIds.push(buildingId);
      buildings.push({
        id: buildingId,
        name: `The ${pick(buildingWords, seed, "town", buildingId, 0, "name")} ${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`,
        kind,
        districtId,
        residentIds,
      });
    }
    districts.push({
      id: districtId,
      name: `${pick(districtNames, seed, "town", districtId, 0, "name")} ${districtIndex + 1}`,
      character: pick(characters, seed, "town", districtId, 0, "character"),
      buildingIds,
    });
  }

  return {
    id: townId,
    locationId,
    name,
    foundedYear: 240 + randomInt(760, seed, "town", townId, 0, "founded"),
    specialty: pick(specialties, seed, "town", townId, 0, "specialty"),
    districts,
    buildings,
    residents,
    reputation: 0,
    visits: 0,
  };
}

export function visitTown(town: TownState): TownState {
  return { ...town, visits: town.visits + 1, reputation: Math.min(100, town.reputation + 1) };
}
