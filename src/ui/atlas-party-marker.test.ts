import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import { advanceRoute, planRoute } from "../depth/atlas";
import type { ActiveCompanion, AtlasState, CompanionRosterState, FormerCompanion } from "../depth/types";
import { projectRoute } from "../render/route-projection";
import { projectAtlasPartyGlyphs, projectAtlasPartyMarker, projectAtlasPartySupportLink, type AtlasPartyMarkerSource } from "./atlas-party-marker";

function fixture(): { source: AtlasPartyMarkerSource; active: ActiveCompanion; destinationId: string } {
  const world = createWorld("atlas-party-marker", "campaign:atlas-party-marker");
  const destination = world.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== world.depth.atlas.currentLocationId,
  );
  if (destination === undefined) throw new Error("Marker fixture needs a second town");
  const active: ActiveCompanion = {
    phase: "travelling",
    identity: {
      residentId: "resident:iona-glass",
      name: "Iona Glass",
      role: "cartographer",
      disposition: "warm",
      originTownId: "town:origin",
      originLocationId: world.depth.atlas.currentLocationId,
      homeBuildingId: "building:iona-home",
    },
    destination: { locationId: destination.id, name: destination.name },
    purpose: "shared-road-oath",
    joinedTick: 7,
    resources: { health: 23, mana: 0 },
    combat: { maxHealth: 31, maxMana: 0, power: 9, armor: 3, initiative: 11 },
    victories: 2,
    bond: 6,
    injury: "none",
  };
  return {
    destinationId: destination.id,
    active,
    source: {
      atlas: world.depth.atlas,
      hero: world.depth.hero,
      companions: {
        schemaVersion: 2,
        kitRulesVersion: "explicit-companion-kit-v1",
        explicitKitAfterTick: 7,
        active: [],
        former: [],
      },
    },
  };
}

function roster(active: readonly ActiveCompanion[] = [], former: readonly FormerCompanion[] = []): CompanionRosterState {
  return {
    schemaVersion: 2,
    kitRulesVersion: "explicit-companion-kit-v1",
    explicitKitAfterTick: 7,
    active,
    former,
  };
}

function withAtlas(source: AtlasPartyMarkerSource, atlas: AtlasState): AtlasPartyMarkerSource {
  return { ...source, atlas };
}

describe("atlas party marker projection", () => {
  it("projects a frozen solo marker at the exact current site and ignores former companions", () => {
    const { source, active } = fixture();
    const former: FormerCompanion = {
      ...active,
      phase: "former",
      departure: { tick: 12, locationId: active.destination.locationId, outcome: "fulfilled" },
    };
    const marker = projectAtlasPartyMarker({ ...source, companions: roster([], [former]) });
    const current = source.atlas.locations.find((location) => location.id === source.atlas.currentLocationId);
    expect(marker).toMatchObject({
      projectionVersion: "atlas-party-marker-v1",
      position: { terrainX: current?.x, terrainY: current?.y, locus: { kind: "location", locationId: current?.id } },
      hero: { id: source.hero.id, name: source.hero.name },
      formation: { kind: "solo", companion: null },
      accessibleText: `Party of one: ${source.hero.name}.`,
    });
    expect(projectAtlasPartyGlyphs(marker!)).toEqual([
      { kind: "hero", pose: "upright", offsetX: 0, offsetY: 0 },
    ]);
    expect(Object.isFrozen(marker)).toBe(true);
    expect(Object.isFrozen(marker?.position)).toBe(true);
    expect(Object.isFrozen(marker?.formation)).toBe(true);
  });

  it("keeps both figures at one exact route anchor and lowers an injured companion", () => {
    const { source, active, destinationId } = fixture();
    const planned = planRoute(source.atlas, destinationId);
    const initialRoute = projectRoute(planned);
    if (initialRoute === null) throw new Error("Marker fixture needs a route");
    const atlas = advanceRoute(planned, Math.max(1, Math.floor(initialRoute.legDistance / 2)));
    const exact = projectRoute(atlas);
    if (exact === null) throw new Error("Marker fixture needs a projected route");
    const healthy = projectAtlasPartyMarker({ ...withAtlas(source, atlas), companions: roster([active]) });
    expect(healthy).toMatchObject({
      position: {
        terrainX: exact.terrainX,
        terrainY: exact.terrainY,
        locus: { kind: "route", edgeId: exact.edgeId, fromId: exact.fromId, toId: exact.toId, legRatio: exact.legRatio },
      },
      formation: { kind: "paired", companion: { id: active.identity.residentId, name: active.identity.name, status: "travelling" } },
      accessibleText: `Party of two with ${active.identity.name}, travelling.`,
    });
    expect(projectAtlasPartyGlyphs(healthy!)).toEqual([
      { kind: "hero", pose: "upright", offsetX: -2.8, offsetY: 0 },
      { kind: "companion", pose: "upright", offsetX: 2.8, offsetY: 0 },
    ]);
    expect(projectAtlasPartySupportLink(healthy!)).toBeNull();

    const fallen: ActiveCompanion = { ...active, resources: { ...active.resources, health: 0 }, injury: "fallen" };
    const injured = projectAtlasPartyMarker({ ...withAtlas(source, atlas), companions: roster([fallen]) });
    expect(injured?.formation).toMatchObject({ kind: "paired-injured", companion: { status: "injured" } });
    expect(projectAtlasPartyGlyphs(injured!).at(1)).toEqual({
      kind: "companion",
      pose: "supported",
      offsetX: 2.8,
      offsetY: 1.2,
    });
    expect(projectAtlasPartySupportLink(injured!)).toEqual({ fromX: -1.3, fromY: 0.7, toX: 1.8, toY: 1.1 });
    expect(Object.isFrozen(projectAtlasPartySupportLink(injured!))).toBe(true);
  });

  it("stays paired after arrival and becomes solo immediately after canonical farewell", () => {
    const { source, active, destinationId } = fixture();
    const arrivedAtlas = { ...source.atlas, currentLocationId: destinationId, route: null };
    const arrived: ActiveCompanion = { ...active, phase: "arrived" };
    expect(projectAtlasPartyMarker({ ...withAtlas(source, arrivedAtlas), companions: roster([arrived]) })?.formation)
      .toMatchObject({ kind: "paired", companion: { status: "arrived" } });
    const fallen: ActiveCompanion = { ...arrived, resources: { ...arrived.resources, health: 0 }, injury: "fallen" };
    expect(projectAtlasPartyMarker({ ...withAtlas(source, arrivedAtlas), companions: roster([fallen]) })?.formation)
      .toMatchObject({ kind: "paired-injured", companion: { status: "arrived-injured" } });
    const former: FormerCompanion = {
      ...arrived,
      phase: "former",
      departure: { tick: 12, locationId: destinationId, outcome: "fulfilled" },
    };
    expect(projectAtlasPartyMarker({ ...withAtlas(source, arrivedAtlas), companions: roster([], [former]) })?.formation)
      .toEqual({ kind: "solo", companion: null });
  });

  it("fails closed for malformed cardinality, route ownership, arrival, or active records", () => {
    const { source, active, destinationId } = fixture();
    const duplicate = { ...active, identity: { ...active.identity, residentId: "resident:duplicate" } };
    expect(projectAtlasPartyMarker({ ...source, companions: { ...roster(), active: [active, duplicate] } as CompanionRosterState })).toBeNull();
    const otherDestination = source.atlas.locations.find((location) => location.id !== destinationId && location.id !== source.atlas.currentLocationId);
    if (otherDestination === undefined) throw new Error("Marker fixture needs another route target");
    expect(projectAtlasPartyMarker({
      ...withAtlas(source, planRoute(source.atlas, otherDestination.id)),
      companions: roster([active]),
    })).toBeNull();
    expect(projectAtlasPartyMarker({ ...source, companions: roster([{ ...active, phase: "arrived" }]) })).toBeNull();
    expect(projectAtlasPartyMarker({
      ...withAtlas(source, { ...source.atlas, currentLocationId: destinationId, route: null }),
      companions: roster([active]),
    })).toBeNull();
    expect(projectAtlasPartyMarker({
      ...source,
      companions: roster([{ ...active, resources: { ...active.resources, health: 0 }, injury: "none" }]),
    })).toBeNull();
  });

  it("is deterministic across JSON reload and location reordering without mutating input", () => {
    const { source, active } = fixture();
    const paired = { ...source, companions: roster([active]) };
    const before = JSON.stringify(paired);
    const first = projectAtlasPartyMarker(paired);
    const restored = JSON.parse(before) as AtlasPartyMarkerSource;
    const reordered = { ...restored, atlas: { ...restored.atlas, locations: [...restored.atlas.locations].reverse() } };
    expect(projectAtlasPartyMarker(reordered)).toEqual(first);
    expect(JSON.stringify(paired)).toBe(before);
  });
});
