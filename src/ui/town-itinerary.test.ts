import { describe, expect, it } from "vitest";
import {
  attentionPolicyForMode,
  createWorld,
  eventPolicyForMode,
} from "../core/simulation";
import type { ChronicleEntry, WorldState } from "../core/types";
import { updateForwardMotion } from "../core/forward-motion";
import {
  applyHeroExperience,
  heroExperienceFloor,
  heroMasteryForExperience,
} from "../depth/rpg";
import { stepDepth } from "../depth/state";
import { generateTown } from "../depth/towns";
import type { TownState } from "../depth/types";
import {
  isTownItineraryPacketV1,
  projectTownItinerary,
  type TownItineraryPacketV1,
} from "./town-itinerary";

interface VisitFixture {
  readonly before: WorldState;
  readonly after: WorldState;
  readonly source: ChronicleEntry;
  readonly packet: TownItineraryPacketV1 | null;
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) expectDeepFrozen(nested);
}

function currentTownLocation(world: WorldState) {
  const location = world.depth.atlas.locations.find(
    (candidate) => candidate.id === world.depth.atlas.currentLocationId,
  );
  if (location?.kind !== "town") throw new Error("Town itinerary fixture has no current town");
  return location;
}

function townVisitFixture(before: WorldState): VisitFixture {
  const location = currentTownLocation(before);
  const commandId = `${before.campaignId}:town:${location.id}`;
  const command = { type: "visit-town" as const };
  const stepped = stepDepth(before.depth, command);
  const progression = applyHeroExperience(stepped.hero, 1);
  const depth = { ...stepped, hero: progression.hero };
  const scene = {
    mode: "town" as const,
    location: location.name,
    headline: `${depth.towns[location.id]?.name ?? location.name} is awake and changing.`,
    action: `${before.hero.name} walks ${depth.towns[location.id]?.districts.length ?? 0} districts known for ${depth.towns[location.id]?.specialty ?? "the town"}.`,
    goal: before.scene.goal,
    consequence: `${depth.towns[location.id]?.residents.length ?? 0} residents remember visit ${depth.towns[location.id]?.visits ?? 0}`,
    sensoryIntensity: 1 as const,
  };
  const selected = {
    commandId,
    actionLabel: "enters town",
    targetLabel: location.name,
    matchedRuleId: "road:continue-purposefully",
  };
  const tick = before.tick + 1;
  const source: ChronicleEntry = {
    ...scene,
    id: `${before.campaignId}:${tick}`,
    tick,
    attention: attentionPolicyForMode("town"),
    consideredActions: [`enter ${location.name}`],
    chosenAction: `enter ${location.name}`,
    rationale: `${before.hero.name} chooses a purposeful town visit.`,
    policy: eventPolicyForMode("town"),
    commandId,
    commandType: "visit-town",
    consideredCommandIds: [commandId],
    decisionTrace: {
      actorId: before.hero.id,
      actorName: before.hero.name,
      context: "road",
      profileId: "road",
      matchedRuleId: selected.matchedRuleId,
      reasonCode: "continue-purposefully",
      considered: [selected],
      selected,
      reasons: ["the town is the purposeful next stop"],
    },
  };
  const opportunity = {
    mode: "town" as const,
    location: location.name,
    goal: before.scene.goal,
    candidates: [{
      id: `town:${location.id}`,
      label: `enter ${location.name}`,
      deciderId: before.hero.id,
      command,
    }],
    forwardMotionReason: null,
  };
  const after: WorldState = {
    ...before,
    tick,
    hero: {
      ...before.hero,
      level: depth.hero.level,
      mastery: heroMasteryForExperience(depth.hero.experience),
      experience: depth.hero.experience,
      health: depth.hero.resources.health,
      maxHealth: depth.hero.resources.maxHealth,
      gold: depth.hero.gold,
    },
    scene,
    chronicle: [...before.chronicle.slice(-31), source],
    lifecycle: {
      ...before.lifecycle,
      simulationTick: tick,
      worldClockMinutes: before.lifecycle.worldClockMinutes + 15,
    },
    forwardMotion: updateForwardMotion(before, depth, opportunity, command, tick),
    pendingAttention: before.pendingAttention.filter((event) => event.tick !== tick),
    depth,
  };
  return { before, after, source, packet: projectTownItinerary(before, after, source) };
}

function requirePacket(packet: TownItineraryPacketV1 | null): TownItineraryPacketV1 {
  if (packet === null) throw new Error("Expected a town itinerary packet");
  return packet;
}

function withTown(world: WorldState, town: TownState): WorldState {
  const discovered = world.depth.atlas.discoveredLocationIds.includes(town.locationId)
    ? world.depth.atlas.discoveredLocationIds
    : [...world.depth.atlas.discoveredLocationIds, town.locationId];
  return {
    ...world,
    scene: { ...world.scene, mode: "town", location: town.name },
    forwardMotion: {
      ...world.forwardMotion,
      recentLocationIds: [town.locationId],
      recentLegs: [],
      activeDirective: null,
    },
    depth: {
      ...world.depth,
      atlas: {
        ...world.depth.atlas,
        currentLocationId: town.locationId,
        route: null,
        discoveredLocationIds: discovered,
      },
      towns: { ...world.depth.towns, [town.locationId]: town },
    },
  };
}

function withoutCurrentTown(world: WorldState, locationId: string): WorldState {
  const towns = { ...world.depth.towns };
  delete towns[locationId];
  const location = world.depth.atlas.locations.find((candidate) => candidate.id === locationId);
  if (location?.kind !== "town") throw new Error("First-visit fixture location is not a town");
  return {
    ...world,
    scene: { ...world.scene, mode: "town", location: location.name },
    forwardMotion: {
      ...world.forwardMotion,
      recentLocationIds: [locationId],
      recentLegs: [],
      activeDirective: null,
    },
    depth: {
      ...world.depth,
      atlas: {
        ...world.depth.atlas,
        currentLocationId: locationId,
        route: null,
        discoveredLocationIds: world.depth.atlas.discoveredLocationIds.includes(locationId)
          ? world.depth.atlas.discoveredLocationIds
          : [...world.depth.atlas.discoveredLocationIds, locationId],
      },
      towns,
    },
  };
}

function reorderedTown(town: TownState): TownState {
  return {
    ...town,
    districts: [...town.districts].reverse().map((district) => ({
      ...district,
      buildingIds: [...district.buildingIds].reverse(),
    })),
    buildings: [...town.buildings].reverse().map((building) => ({
      ...building,
      residentIds: [...building.residentIds].reverse(),
    })),
    residents: [...town.residents].reverse(),
  };
}

describe("town itinerary projection", () => {
  it("projects a real non-leveling town visit with exact frozen canonical facts", () => {
    const fixture = townVisitFixture(createWorld("town-itinerary-real", "campaign:town-itinerary-real"));
    const packet = requirePacket(fixture.packet);
    const townBefore = fixture.before.depth.towns[packet.location.id];
    const townAfter = fixture.after.depth.towns[packet.location.id];
    expect(townBefore).toBeDefined();
    expect(townAfter).toBeDefined();
    expect(packet).toMatchObject({
      schemaVersion: 1,
      packetKind: "town-itinerary@1",
      eventId: fixture.source.id,
      commandId: fixture.source.commandId,
      commandType: "visit-town",
      hero: {
        id: fixture.after.depth.hero.id,
        name: fixture.after.depth.hero.name,
        className: fixture.after.depth.hero.className,
      },
      visit: { before: townBefore!.visits, after: townAfter!.visits },
      reputation: { before: townBefore!.reputation, after: townAfter!.reputation },
      experience: {
        before: fixture.before.depth.hero.experience,
        delta: 1,
        after: fixture.after.depth.hero.experience,
      },
    });
    expect(isTownItineraryPacketV1(packet)).toBe(true);
    expect(isTownItineraryPacketV1(structuredClone(packet))).toBe(true);
    expectDeepFrozen(packet);
  });

  it("is array-order independent and rotates through every resident before repeating", () => {
    const base = createWorld("town-itinerary-rotation", "campaign:town-itinerary-rotation");
    const location = currentTownLocation(base);
    const original = base.depth.towns[location.id];
    if (original === undefined) throw new Error("Rotation fixture has no town");
    const normal = requirePacket(townVisitFixture(withTown(base, { ...original, visits: 5 })).packet);
    const reordered = requirePacket(townVisitFixture(withTown(base, { ...reorderedTown(original), visits: 5 })).packet);
    expect(reordered).toEqual(normal);

    const selected = Array.from({ length: original.residents.length }, (_, visits) => {
      const fixture = townVisitFixture(withTown(base, { ...original, visits, reputation: Math.min(100, visits) }));
      return requirePacket(fixture.packet).resident.id;
    });
    expect(new Set(selected).size).toBe(original.residents.length);
    const repeated = requirePacket(townVisitFixture(withTown(base, {
      ...original,
      visits: original.residents.length,
      reputation: Math.min(100, original.residents.length),
    })).packet);
    expect(repeated.resident.id).toBe(selected[0]);
  });

  it("supports a generated first visit in another town and clamps reputation at 100", () => {
    const base = createWorld("town-itinerary-many", "campaign:town-itinerary-many");
    const destination = base.depth.atlas.locations.find(
      (location) => location.kind === "town" && location.id !== base.depth.atlas.currentLocationId,
    );
    if (destination === undefined) throw new Error("Multi-town fixture has no second town");
    const firstVisit = townVisitFixture(withoutCurrentTown(base, destination.id));
    const firstPacket = requirePacket(firstVisit.packet);
    expect(firstPacket.location).toEqual({ id: destination.id, name: destination.name });
    expect(firstPacket.visit).toEqual({ before: 0, after: 1 });
    expect(firstPacket.town).toMatchObject({ id: `town:${destination.id}`, locationId: destination.id });

    const generated = generateTown(base.seed, destination.id);
    const capped = townVisitFixture(withTown(base, { ...generated, visits: 17, reputation: 100 }));
    expect(requirePacket(capped.packet).reputation).toEqual({ before: 100, after: 100 });
  });

  it("binds every selected resident, home, district, and bounded route endpoint", () => {
    const fixture = townVisitFixture(createWorld("town-itinerary-route", "campaign:town-itinerary-route"));
    const packet = requirePacket(fixture.packet);
    const sourceTown = fixture.before.depth.towns[packet.location.id]!;
    const sourceResident = sourceTown.residents.find((resident) => resident.id === packet.resident.id);
    const sourceBuilding = sourceTown.buildings.find((building) => building.id === packet.building.id);
    const sourceDistrict = sourceTown.districts.find((district) => district.id === packet.district.id);
    expect(packet.routeStops).toHaveLength(Math.min(3, sourceTown.buildings.filter(
      (building) => building.districtId === packet.district.id,
    ).length));
    expect(packet.routeStops.at(-1)).toEqual(packet.building);
    expect(packet.routeStops.every((stop) => stop.districtId === packet.district.id)).toBe(true);
    expect(sourceResident).toMatchObject(packet.resident);
    expect(sourceBuilding).toMatchObject(packet.building);
    expect(sourceDistrict).toMatchObject(packet.district);
    expect(sourceBuilding?.residentIds).toContain(packet.resident.id);
    expect(sourceDistrict?.buildingIds).toContain(packet.building.id);
  });

  it("fails closed for resident, building, and district join corruption", () => {
    const base = createWorld("town-itinerary-joins", "campaign:town-itinerary-joins");
    const location = currentTownLocation(base);
    const town = base.depth.towns[location.id];
    if (town === undefined) throw new Error("Join fixture has no town");
    const resident = town.residents[0]!;
    const home = town.buildings.find((building) => building.id === resident.homeBuildingId)!;
    const district = town.districts.find((entry) => entry.id === home.districtId)!;
    const corruptions: readonly TownState[] = [
      { ...town, residents: town.residents.map((entry) => entry.id === resident.id ? { ...entry, homeBuildingId: "building:missing" } : entry) },
      { ...town, buildings: town.buildings.map((entry) => entry.id === home.id ? { ...entry, residentIds: entry.residentIds.filter((id) => id !== resident.id) } : entry) },
      { ...town, buildings: town.buildings.map((entry) => entry.id === home.id ? { ...entry, districtId: "district:missing" } : entry) },
      { ...town, districts: town.districts.map((entry) => entry.id === district.id ? { ...entry, buildingIds: entry.buildingIds.filter((id) => id !== home.id) } : entry) },
      { ...town, residents: [...town.residents, { ...resident }] },
    ];
    for (const corrupted of corruptions) {
      const fixture = townVisitFixture(withTown(base, corrupted));
      expect(projectTownItinerary(fixture.before, fixture.after, fixture.source)).toBeNull();
    }
  });

  it("fails closed for campaign, tick, command, source-mode, scene, and Chronicle forgeries", () => {
    const fixture = townVisitFixture(createWorld("town-itinerary-provenance", "campaign:town-itinerary-provenance"));
    const forgeries: readonly [WorldState, WorldState, ChronicleEntry][] = [
      [fixture.before, { ...fixture.after, campaignId: `${fixture.after.campaignId}:forged` }, fixture.source],
      [fixture.before, { ...fixture.after, tick: fixture.after.tick + 1 }, fixture.source],
      [fixture.before, fixture.after, { ...fixture.source, commandId: `${fixture.source.commandId}:forged` }],
      [fixture.before, fixture.after, { ...fixture.source, commandType: "wait" }],
      [fixture.before, fixture.after, { ...fixture.source, mode: "chronicle" }],
      [fixture.before, { ...fixture.after, scene: { ...fixture.after.scene, headline: "Forged" } }, fixture.source],
      [fixture.before, { ...fixture.after, chronicle: [] }, fixture.source],
      [fixture.before, fixture.after, { ...fixture.source, policy: { ...fixture.source.policy, reversible: false } }],
    ];
    for (const [before, after, source] of forgeries) {
      expect(projectTownItinerary(before, after, source)).toBeNull();
    }
  });

  it("rejects leveling visits and unrelated world or depth mutations", () => {
    const initial = createWorld("town-itinerary-level", "campaign:town-itinerary-level");
    const nextFloor = heroExperienceFloor(initial.hero.level + 1);
    const amount = nextFloor - 1 - initial.depth.hero.experience;
    const stagedHero = applyHeroExperience(initial.depth.hero, amount).hero;
    const staged: WorldState = {
      ...initial,
      hero: {
        ...initial.hero,
        level: stagedHero.level,
        experience: stagedHero.experience,
        mastery: heroMasteryForExperience(stagedHero.experience),
      },
      depth: { ...initial.depth, hero: stagedHero },
    };
    const leveling = townVisitFixture(staged);
    expect(projectTownItinerary(leveling.before, leveling.after, leveling.source)).toBeNull();

    const ordinary = townVisitFixture(initial);
    expect(projectTownItinerary(ordinary.before, {
      ...ordinary.after,
      depth: {
        ...ordinary.after.depth,
        hero: { ...ordinary.after.depth.hero, gold: ordinary.after.depth.hero.gold + 1 },
      },
    }, ordinary.source)).toBeNull();
    expect(projectTownItinerary(ordinary.before, {
      ...ordinary.after,
      legacyManifestations: {
        ...ordinary.after.legacyManifestations,
        townVisitBaseline: ordinary.after.legacyManifestations.townVisitBaseline + 1,
      },
    }, ordinary.source)).toBeNull();
  });

  it("rejects exact-key and cross-field packet forgeries", () => {
    const packet = requirePacket(townVisitFixture(
      createWorld("town-itinerary-packet", "campaign:town-itinerary-packet"),
    ).packet);
    const endpointForgery = {
      ...packet,
      routeStops: packet.routeStops.map((stop, index) => index === packet.routeStops.length - 1 ? {
        ...stop,
        id: `${packet.building.id}:forged`,
      } : stop),
    };
    const forgeries: unknown[] = [
      { ...packet, inventedReward: true },
      { ...packet, selectionIndex: (packet.selectionIndex + 1) % packet.residentCount },
      { ...packet, visit: { ...packet.visit, after: packet.visit.after + 1 } },
      { ...packet, reputation: { ...packet.reputation, after: Math.max(0, packet.reputation.after - 1) } },
      { ...packet, experience: { ...packet.experience, delta: 2 } },
      { ...packet, resident: { ...packet.resident, homeBuildingId: `${packet.building.id}:forged` } },
      { ...packet, building: { ...packet.building, districtId: `${packet.district.id}:forged` } },
      { ...packet, routeStops: [] },
      endpointForgery,
      { ...packet, town: { ...packet.town, invented: true } },
    ];
    for (const forged of forgeries) expect(isTownItineraryPacketV1(forged)).toBe(false);
  });

  it("does not mutate its world or source inputs", () => {
    const fixture = townVisitFixture(createWorld("town-itinerary-pure", "campaign:town-itinerary-pure"));
    const beforeCopy = structuredClone(fixture.before);
    const afterCopy = structuredClone(fixture.after);
    const sourceCopy = structuredClone(fixture.source);
    expect(projectTownItinerary(fixture.before, fixture.after, fixture.source)).not.toBeNull();
    expect(fixture.before).toEqual(beforeCopy);
    expect(fixture.after).toEqual(afterCopy);
    expect(fixture.source).toEqual(sourceCopy);
  });
});
