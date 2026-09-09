import { describe, expect, it } from "vitest";
import { captureChroniclePlateRecipe, projectTownChroniclePlate } from "./chronicle-plate";
import { isTownItineraryPacketV1 } from "./town-itinerary";

// A public packet fixture, not an assertion that these synthetic places were played.
function packet() {
  const landmarks = [
    { id: "town:location:1:inn", name: "The Badger Inn", kind: "inn", districtId: "district:1" },
    { id: "town:location:1:market", name: "The Market", kind: "market", districtId: "district:1" },
    { id: "town:location:1:home", name: "Mill House", kind: "home", districtId: "district:1" },
  ];
  return {
    schemaVersion: 1, packetKind: "town-itinerary@1", eventId: "campaign:plates:7", tick: 7,
    campaignId: "campaign:plates", commandId: "campaign:plates:town:location:1", commandType: "visit-town",
    hero: { id: "hero:one", name: "Mara", className: "Wanderer" },
    location: { id: "location:1", name: "Greyford" },
    town: { id: "town:location:1", locationId: "location:1", name: "Greyford", specialty: "orchards", foundedYear: 840 },
    visit: { before: 2, after: 3 }, reputation: { before: 4, after: 5 },
    experience: { before: 20, after: 21, delta: 1 }, selectionOrdinal: 2, selectionIndex: 0, residentCount: 2,
    resident: { id: "resident:one", name: "Rowan", role: "Miller", disposition: "warm", homeBuildingId: landmarks[2]!.id },
    building: { ...landmarks[2]! }, district: { id: "district:1", name: "Mill Quarter", character: "quiet" },
    routeStops: landmarks, mechanicalEffect: "visit-and-reputation-already-applied",
  };
}

const context = { campaignId: "campaign:plates", currentTick: 7 };

function deepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) deepFrozen(nested);
}

describe("town-visit Chronicle Plate recipe", () => {
  it("uses the validated packet's source, town, counters and exact landmark order without retaining people or equipment", () => {
    const source = packet();
    expect(isTownItineraryPacketV1(source)).toBe(true);
    const recipe = projectTownChroniclePlate(source, context);
    expect(recipe).toEqual({
      schemaVersion: 1, kind: "town-visit", templateId: "town-landmarks@1",
      sourceEventId: source.eventId, campaignId: source.campaignId, sourceTick: source.tick,
      town: { id: source.town.id, locationId: source.town.locationId, name: source.town.name, specialty: source.town.specialty },
      visit: source.visit, reputation: source.reputation, landmarks: source.routeStops,
    });
    expect(JSON.stringify(recipe)).not.toMatch(/hero:one|resident:one|Mara|Rowan|Wanderer|Miller|weather|equipment|experience|foundedYear/u);
    deepFrozen(recipe);
  });

  it("captures event-time facts without freezing or changing caller state and reproduces exact JSON composition", () => {
    const source = packet();
    const original = JSON.stringify(source);
    const recipe = projectTownChroniclePlate(source, context)!;
    expect(JSON.stringify(projectTownChroniclePlate(JSON.parse(original), context))).toBe(JSON.stringify(recipe));
    expect(JSON.stringify(source)).toBe(original);
    expect(Object.isFrozen(source)).toBe(false);
    source.town.name = "Renamed much later";
    source.routeStops[0]!.name = "Rebuilt much later";
    source.visit.after = 90;
    expect(recipe.town.name).toBe("Greyford");
    expect(recipe.landmarks[0]!.name).toBe("The Badger Inn");
    expect(recipe.visit.after).toBe(3);
  });

  it.each([
    { campaignId: "another-campaign", currentTick: 7 },
    { campaignId: "campaign:plates", currentTick: 6 },
    { campaignId: "campaign:plates", currentTick: -1 },
    { campaignId: "campaign:plates", currentTick: Infinity },
    { campaignId: "campaign:plates", currentTick: 7.5 },
  ])("rejects cross-campaign, future and invalid current bounds: %j", (bounds) => {
    expect(projectTownChroniclePlate(packet(), bounds)).toBeNull();
  });

  it("admits an older validated source without rewriting its tick, and preserves saturated reputation", () => {
    const source = packet();
    source.reputation = { before: 100, after: 100 };
    const recipe = projectTownChroniclePlate(source, { ...context, currentTick: 100 });
    expect(recipe?.sourceTick).toBe(7);
    expect(recipe?.reputation).toEqual({ before: 100, after: 100 });
  });

  it("rejects malformed packets rather than salvaging contradictory landmarks or private extra fields", () => {
    const source = packet();
    for (const invalid of [
      null, {}, { ...source, eventId: "another-campaign:7" },
      { ...source, commandId: "unrelated-command" }, { ...source, secret: "private" },
      { ...source, visit: { before: 2, after: 9 } },
      { ...source, routeStops: [] }, { ...source, routeStops: [...source.routeStops, source.routeStops[0]] },
      { ...source, routeStops: [source.routeStops[0], source.routeStops[0], source.routeStops[2]] },
      { ...source, routeStops: [{ ...source.routeStops[0], districtId: "elsewhere" }, ...source.routeStops.slice(1)] },
    ]) expect(projectTownChroniclePlate(invalid, context)).toBeNull();
  });

  it("validates the exact stored recipe schema and counter/source relations independently", () => {
    const recipe = projectTownChroniclePlate(packet(), context)!;
    expect(captureChroniclePlateRecipe(recipe)).toEqual(recipe);
    for (const invalid of [
      { ...recipe, schemaVersion: 2 }, { ...recipe, templateId: "portrait@1" }, { ...recipe, hero: "Mara" },
      { ...recipe, sourceTick: 8 }, { ...recipe, campaignId: "other" },
      { ...recipe, town: { ...recipe.town, id: "another-town" } },
      { ...recipe, town: { ...recipe.town, name: "x".repeat(161) } },
      { ...recipe, town: { ...recipe.town, name: "\nGreyford" } },
      { ...recipe, visit: { before: 2, after: 4 } },
      { ...recipe, reputation: { before: 100, after: 101 } },
      { ...recipe, landmarks: [] },
      { ...recipe, landmarks: [recipe.landmarks[0], recipe.landmarks[0]] },
      { ...recipe, landmarks: [{ ...recipe.landmarks[0], kind: "palace" }] },
      { ...recipe, landmarks: [{ ...recipe.landmarks[0], occupied: true }] },
    ]) expect(captureChroniclePlateRecipe(invalid)).toBeNull();
  });
});
