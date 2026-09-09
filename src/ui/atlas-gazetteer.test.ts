import { describe, expect, it } from "vitest";
import { generateAtlas } from "../depth/atlas";
import type { AtlasState, TownState } from "../depth/types";
import { projectAtlasGazetteer } from "./atlas-gazetteer";

function fixture(): { atlas: AtlasState; towns: Record<string, TownState> } {
  const generated = generateAtlas("atlas-gazetteer", 12);
  const base = generated.locations[0]!;
  const atlas: AtlasState = {
    ...generated,
    currentLocationId: "visited",
    discoveredLocationIds: ["unvisited", "landmark", "visited"],
    locations: [
      { ...base, id: "hidden", name: "Secret Hollow", kind: "town" },
      { ...base, id: "unvisited", name: "Amber Town", kind: "town" },
      { ...base, id: "landmark", name: "Amber Peak", kind: "landmark", danger: 4, feature: "ancient-peak" },
      { ...base, id: "visited", name: "Zinnia Harbor", kind: "town", danger: 1, feature: "sheltered-coast" },
    ],
    edges: [],
    route: null,
  };
  const town: TownState = {
    id: "town:visited",
    locationId: "visited",
    name: "Zinnia Harbor",
    foundedYear: 380,
    specialty: "river charts",
    visits: 2,
    reputation: 2,
    districts: [
      { id: "ward-z", name: "Old Ward", character: "quiet beneath old trees", buildingIds: ["inn"] },
      { id: "ward-a", name: "Garden Ring", character: "bright with painted signs", buildingIds: ["smithy"] },
    ],
    buildings: [
      { id: "inn", name: "The Heron Inn", kind: "inn", districtId: "ward-z", residentIds: ["borin", "ada"] },
      { id: "smithy", name: "The Moon Smithy", kind: "smithy", districtId: "ward-a", residentIds: ["cato"] },
    ],
    residents: [
      { id: "borin", name: "Borin Vale", role: "miller", disposition: "neutral", homeBuildingId: "inn" },
      { id: "ada", name: "Ada Ash", role: "baker", disposition: "warm", homeBuildingId: "inn" },
      { id: "cato", name: "Cato Dale", role: "smith", disposition: "wary", homeBuildingId: "smithy" },
    ],
  };
  return { atlas, towns: { visited: town } };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function expectFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozen(child);
  }
}

describe("atlas gazetteer", () => {
  it("shows discovered places current-first with only their public place and visited-town facts", () => {
    const source = fixture();
    const { places } = projectAtlasGazetteer(source);
    expect(places.map((place) => place.id)).toEqual(["visited", "landmark", "unvisited"]);
    expect(places[0]).toEqual({
      id: "visited", name: "Zinnia Harbor", kind: "town", feature: "sheltered-coast", danger: 1, isCurrent: true,
      town: {
        name: "Zinnia Harbor", specialty: "river charts", foundedYear: 380, visits: 2, reputation: 2,
        districts: [
          {
            id: "ward-a", name: "Garden Ring", character: "bright with painted signs",
            buildings: [{ id: "smithy", name: "The Moon Smithy", kind: "smithy", residents: [
              { id: "cato", name: "Cato Dale", role: "smith", disposition: "wary" },
            ] }],
          },
          {
            id: "ward-z", name: "Old Ward", character: "quiet beneath old trees",
            buildings: [{ id: "inn", name: "The Heron Inn", kind: "inn", residents: [
              { id: "ada", name: "Ada Ash", role: "baker", disposition: "warm" },
              { id: "borin", name: "Borin Vale", role: "miller", disposition: "neutral" },
            ] }],
          },
        ],
      },
    });
    expect(places[1]).toEqual({
      id: "landmark", name: "Amber Peak", kind: "landmark", feature: "ancient-peak", danger: 4, isCurrent: false, town: null,
    });
    expect(places[2]?.town).toBeNull();
    expect(JSON.stringify(places)).not.toContain("Secret Hollow");
  });

  it("never generates unvisited town details or trusts a mismatched town location", () => {
    const source = fixture();
    const town = source.towns.visited!;
    source.towns.unvisited = { ...town, id: "town:unvisited", locationId: "unvisited", visits: 0 };
    source.towns.visited = { ...town, locationId: "hidden" };
    source.towns.landmark = { ...town, locationId: "landmark" };
    source.towns.hidden = { ...town, locationId: "hidden", name: "Secret Household" };
    const result = projectAtlasGazetteer(source);
    expect(result.places.every((place) => place.town === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Secret Household");
    expect(projectAtlasGazetteer({ ...source, towns: {} }).places.every((place) => place.town === null)).toBe(true);
  });

  it("requires mutual district/building and building/resident links without discarding valid neighbors", () => {
    const source = fixture();
    const town = source.towns.visited!;
    town.districts = town.districts.map((district) => ({
      ...district, buildingIds: [...district.buildingIds, "missing-building", "wrong-ward"],
    }));
    town.buildings = [
      ...town.buildings.map((building) => ({ ...building, residentIds: [...building.residentIds, "missing-resident", "wrong-home"] })),
      { id: "wrong-ward", name: "Wrong Ward", kind: "hall", districtId: "missing-ward", residentIds: [] },
      { id: "unlisted", name: "Unlisted", kind: "home", districtId: "ward-z", residentIds: [] },
    ];
    town.residents = [
      ...town.residents,
      { id: "wrong-home", name: "Wrong Home", role: "guard", disposition: "neutral", homeBuildingId: "missing-home" },
      { id: "unlisted-resident", name: "Unlisted Resident", role: "guard", disposition: "neutral", homeBuildingId: "inn" },
    ];
    expect(projectAtlasGazetteer(source)).toEqual(projectAtlasGazetteer(fixture()));
  });

  it("sorts identical names by ID and remains identical after source array reorder and JSON reload", () => {
    const source = fixture();
    const duplicateName = { ...source.atlas.locations[1]!, id: "unvisited-a" };
    source.atlas.locations = [...source.atlas.locations, duplicateName];
    source.atlas.discoveredLocationIds = [...source.atlas.discoveredLocationIds, duplicateName.id];
    const expected = projectAtlasGazetteer(source);
    expect(expected.places.map((place) => place.id)).toEqual(["visited", "landmark", "unvisited", "unvisited-a"]);
    source.atlas.locations = [...source.atlas.locations].reverse();
    source.atlas.discoveredLocationIds = [...source.atlas.discoveredLocationIds].reverse();
    const town = source.towns.visited!;
    town.districts = [...town.districts].reverse().map((district) => ({ ...district, buildingIds: [...district.buildingIds].reverse() }));
    town.buildings = [...town.buildings].reverse().map((building) => ({ ...building, residentIds: [...building.residentIds].reverse() }));
    town.residents = [...town.residents].reverse();
    expect(projectAtlasGazetteer(source)).toEqual(expected);
    expect(projectAtlasGazetteer(JSON.parse(JSON.stringify(source)))).toEqual(expected);
  });

  it("does not mutate frozen input and returns a detached, recursively frozen snapshot", () => {
    const source = freezeDeep(fixture());
    const before = JSON.stringify(source);
    const result = projectAtlasGazetteer(source);
    expect(JSON.stringify(source)).toBe(before);
    expectFrozen(result);
    expect(result.places[0]?.town?.districts).not.toBe(source.towns.visited!.districts);
    const changed = fixture();
    const earlier = projectAtlasGazetteer(changed);
    changed.towns.visited!.reputation = 9;
    changed.towns.visited!.residents[0]!.name = "Changed Name";
    expect(earlier).toEqual(result);
    expect(projectAtlasGazetteer(changed).places[0]?.town?.reputation).toBe(9);
  });

  it("does not reveal an undiscovered current location or unknown discovery IDs", () => {
    const source = fixture();
    source.atlas.currentLocationId = "hidden";
    source.atlas.discoveredLocationIds = ["missing"];
    expect(projectAtlasGazetteer(source)).toEqual({ places: [] });
  });
});
