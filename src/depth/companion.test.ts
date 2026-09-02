import { describe, expect, it } from "vitest";
import { generateAtlas } from "./atlas";
import {
  addActiveCompanion,
  companionToCombatant,
  createCompanionCombatProfile,
  createEmptyCompanionRoster,
  isPublicReachableDistinctTown,
  isValidActiveCompanion,
  isValidCompanionReferences,
  isValidCompanionRoster,
  maximumFormerCompanions,
  retireActiveCompanionAtDestination,
  selectSharedRoadCompanion,
  syncActiveCompanionCombat,
  syncCompanionResources,
} from "./companion";
import { generateTown } from "./towns";
import type { ActiveCompanion, AtlasState, CompanionRosterState, FormerCompanion, TownState } from "./types";

function fixture(seed = "shared-road-fixture"): { atlas: AtlasState; town: TownState } {
  const generated = generateAtlas(seed, 5, ["town", "town", "town", "wilds", "dungeon"]);
  const origin = generated.locations.find((location) => location.id === generated.currentLocationId);
  if (origin?.kind !== "town") throw new Error("Companion fixture origin is not a town");
  return {
    atlas: { ...generated, discoveredLocationIds: generated.locations.map((location) => location.id) },
    town: { ...generateTown(seed, origin.id), visits: 1 },
  };
}

function select(seed = "shared-road-fixture"): { companion: ActiveCompanion; atlas: AtlasState; town: TownState } {
  const { atlas, town } = fixture(seed);
  const companion = selectSharedRoadCompanion({
    seed,
    atlas,
    town,
    roster: createEmptyCompanionRoster(),
    joinedTick: 7,
    heroLevel: 9,
  });
  if (companion === null) throw new Error("Companion fixture produced no candidate");
  return { companion, atlas, town };
}

describe("Shared Road Oath companion domain", () => {
  it("selects the same resident, destination, and fixed profile independent of source order", () => {
    const seed = "companion-reorder";
    const { atlas, town } = fixture(seed);
    const roster = createEmptyCompanionRoster();
    const selected = selectSharedRoadCompanion({ seed, atlas, town, roster, joinedTick: 11, heroLevel: 12 });
    const reorderedTown: TownState = {
      ...town,
      residents: [...town.residents].reverse(),
      buildings: [...town.buildings].reverse().map((building) => ({
        ...building,
        residentIds: [...building.residentIds].reverse(),
      })),
      districts: [...town.districts].reverse(),
    };
    const reorderedAtlas: AtlasState = {
      ...atlas,
      locations: [...atlas.locations].reverse(),
      edges: [...atlas.edges].reverse(),
      discoveredLocationIds: [...atlas.discoveredLocationIds].reverse(),
    };
    const replayed = selectSharedRoadCompanion({
      seed,
      atlas: reorderedAtlas,
      town: reorderedTown,
      roster,
      joinedTick: 11,
      heroLevel: 12,
    });

    expect(replayed).toEqual(selected);
    expect(selected?.phase).toBe("travelling");
    expect(selected?.purpose).toBe("shared-road-oath");
    expect(selected?.resources.health).toBe(selected?.combat.maxHealth);
    expect(selected?.combat.maxMana).toBe(0);
    expect(createCompanionCombatProfile(seed, selected!.identity.residentId, 12)).toEqual(selected?.combat);
  });

  it("uses only public, reachable, distinct towns and rejects hidden or disconnected destinations", () => {
    const { atlas, town } = fixture("companion-public-route");
    const destination = atlas.locations.find((location) => location.kind === "town" && location.id !== town.locationId);
    const wilds = atlas.locations.find((location) => location.kind === "wilds");
    if (destination === undefined || wilds === undefined) throw new Error("Atlas fixture lacks destination kinds");

    expect(isPublicReachableDistinctTown(atlas, town.locationId, destination.id)).toBe(true);
    expect(isPublicReachableDistinctTown(atlas, town.locationId, town.locationId)).toBe(false);
    expect(isPublicReachableDistinctTown(atlas, town.locationId, wilds.id)).toBe(false);
    expect(isPublicReachableDistinctTown(
      { ...atlas, discoveredLocationIds: [town.locationId] },
      town.locationId,
      destination.id,
    )).toBe(false);
    expect(isPublicReachableDistinctTown({ ...atlas, edges: [] }, town.locationId, destination.id)).toBe(false);
    expect(selectSharedRoadCompanion({
      seed: "companion-public-route",
      atlas: { ...atlas, discoveredLocationIds: [town.locationId] },
      town,
      roster: createEmptyCompanionRoster(),
      joinedTick: 3,
      heroLevel: 2,
    })).toBeNull();
  });

  it("converts to one exact basic combatant and synchronizes resources without changing identity or phase", () => {
    const { companion } = select("companion-combat-sync");
    const combatant = companionToCombatant(companion);
    expect(combatant).toMatchObject({
      id: companion.identity.residentId,
      name: companion.identity.name,
      side: "heroes",
      speciesId: null,
      abilities: [],
      statuses: [],
      maxHealth: companion.combat.maxHealth,
      maxMana: 0,
    });
    const wounded = syncCompanionResources(companion, { ...combatant, health: combatant.health - 4 });
    expect(wounded).toEqual({ ...companion, resources: { health: combatant.health - 4, mana: 0 } });
    const fallen = syncCompanionResources(companion, { ...combatant, health: 0 });
    expect(fallen.phase).toBe("travelling");
    expect(fallen.injury).toBe("fallen");
    expect(() => syncCompanionResources(companion, { ...combatant, id: "resident:forged" })).toThrow(/fixed combat profile/i);
    expect(() => syncCompanionResources(companion, { ...combatant, power: combatant.power + 1 })).toThrow(/fixed combat profile/i);
  });

  it("records victories and bond while the companion remains active, including when fallen", () => {
    const { companion } = select("companion-victory-sync");
    const roster = addActiveCompanion(createEmptyCompanionRoster(), companion);
    const unit = companionToCombatant(companion);
    const resolved = syncActiveCompanionCombat(roster, [{ ...unit, health: 0 }], "victory");

    expect(resolved.former).toEqual([]);
    expect(resolved.active[0]).toMatchObject({
      phase: "travelling",
      resources: { health: 0, mana: 0 },
      victories: 1,
      bond: companion.bond + 2,
      injury: "fallen",
    });
    expect(isValidCompanionRoster(resolved)).toBe(true);
  });

  it("retires only at the exact arrived destination and derives fulfilled or injured truthfully", () => {
    const { companion } = select("companion-farewell");
    const travelling = addActiveCompanion(createEmptyCompanionRoster(), companion);
    expect(() => retireActiveCompanionAtDestination(travelling, {
      tick: 20,
      locationId: companion.destination.locationId,
    })).toThrow(/only after arriving/i);

    const arrived: CompanionRosterState = {
      ...travelling,
      active: [{ ...companion, phase: "arrived" }],
    };
    expect(() => retireActiveCompanionAtDestination(arrived, {
      tick: 20,
      locationId: companion.identity.originLocationId,
    })).toThrow(/oath destination/i);
    const fulfilled = retireActiveCompanionAtDestination(arrived, {
      tick: 20,
      locationId: companion.destination.locationId,
    });
    expect(fulfilled.active).toEqual([]);
    expect(fulfilled.former[0]).toMatchObject({
      phase: "former",
      departure: { tick: 20, locationId: companion.destination.locationId, outcome: "fulfilled" },
    });
    expect(retireActiveCompanionAtDestination(fulfilled, {
      tick: 21,
      locationId: companion.destination.locationId,
    })).toBe(fulfilled);

    const fallen = syncCompanionResources(companion, { ...companionToCombatant(companion), health: 0 });
    const injured = retireActiveCompanionAtDestination({
      ...createEmptyCompanionRoster(),
      active: [{ ...fallen, phase: "arrived" }],
    }, { tick: 22, locationId: companion.destination.locationId });
    expect(injured.former[0]).toMatchObject({ injury: "fallen", departure: { outcome: "injured" } });
  });

  it("bounds former history, rejects corrupt lifecycle records, and survives JSON roundtrip", () => {
    const { companion } = select("companion-validation");
    const former = Array.from({ length: maximumFormerCompanions }, (_, index): FormerCompanion => ({
      ...companion,
      phase: "former",
      identity: {
        ...companion.identity,
        residentId: `former:${index}`,
        name: `Former ${index}`,
      },
      departure: {
        tick: companion.joinedTick + index + 1,
        locationId: companion.destination.locationId,
        outcome: "fulfilled",
      },
    }));
    const arrived = {
      ...companion,
      phase: "arrived" as const,
      identity: { ...companion.identity, residentId: "active:new", name: "Active New" },
    };
    const full: CompanionRosterState = {
      schemaVersion: 2,
      kitRulesVersion: "explicit-companion-kit-v1",
      explicitKitAfterTick: Math.max(0, companion.joinedTick - 1),
      active: [arrived],
      former,
    };
    expect(isValidCompanionRoster(full)).toBe(true);
    const bounded = retireActiveCompanionAtDestination(full, {
      tick: companion.joinedTick + 20,
      locationId: companion.destination.locationId,
    });
    expect(bounded.former).toHaveLength(maximumFormerCompanions);
    expect(bounded.former[0]?.identity.residentId).toBe("former:1");
    expect(isValidCompanionRoster(JSON.parse(JSON.stringify(bounded)))).toBe(true);

    expect(isValidCompanionRoster({ ...full, active: [arrived, { ...arrived, identity: { ...arrived.identity, residentId: "active:two" } }] })).toBe(false);
    expect(isValidCompanionRoster({ ...full, active: [{ ...arrived, resources: { ...arrived.resources, health: arrived.combat.maxHealth + 1 } }] })).toBe(false);
    expect(isValidActiveCompanion({ ...arrived, destination: { ...arrived.destination, locationId: arrived.identity.originLocationId } })).toBe(false);
    expect(isValidCompanionRoster({ ...full, former: [former[0], former[0]] })).toBe(false);
  });

  it("cross-checks resident identity, destination truth, and arrived location against canonical world data", () => {
    const { companion, atlas, town } = select("companion-references");
    const travelling: CompanionRosterState = {
      schemaVersion: 2,
      kitRulesVersion: "explicit-companion-kit-v1",
      explicitKitAfterTick: Math.max(0, companion.joinedTick - 1),
      active: [companion],
      former: [],
    };
    const towns = { [town.locationId]: town };
    expect(isValidCompanionReferences(travelling, atlas, towns)).toBe(true);
    expect(isValidCompanionReferences({
      ...travelling,
      active: [{ ...companion, identity: { ...companion.identity, name: "Invented Person" } }],
    }, atlas, towns)).toBe(false);
    expect(isValidCompanionReferences({
      ...travelling,
      active: [{ ...companion, destination: { ...companion.destination, name: "Secret Elsewhere" } }],
    }, atlas, towns)).toBe(false);
    const arrived: CompanionRosterState = { ...travelling, active: [{ ...companion, phase: "arrived" }] };
    expect(isValidCompanionReferences(arrived, atlas, towns)).toBe(false);
    expect(isValidCompanionReferences(
      arrived,
      { ...atlas, currentLocationId: companion.destination.locationId },
      towns,
    )).toBe(true);
  });
});
