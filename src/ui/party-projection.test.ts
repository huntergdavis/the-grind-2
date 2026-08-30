import { describe, expect, it } from "vitest";
import { createWorld } from "../core/simulation";
import type {
  ActiveCompanion,
  CompanionRosterState,
  FormerCompanion,
  TownState,
} from "../depth/types";
import {
  companionDepartureText,
  companionPurposeText,
  companionStatusText,
  isInjuredPartyStatus,
  maximumProjectedFormerCompanions,
  projectParty,
  type PartyProjectionSource,
} from "./party-projection";

function projectionFixture(): {
  source: PartyProjectionSource;
  active: ActiveCompanion;
} {
  const world = createWorld("party-projection", "campaign:party-projection");
  const originLocationId = world.depth.atlas.currentLocationId;
  const originTown = world.depth.towns[originLocationId];
  const destination = world.depth.atlas.locations.find(
    (location) => location.kind === "town" && location.id !== originLocationId,
  );
  if (originTown === undefined || destination === undefined) {
    throw new Error("Party projection fixture needs two towns");
  }
  const active: ActiveCompanion = {
    phase: "travelling",
    identity: {
      residentId: `${originTown.id}:resident:projection`,
      name: "Iona Glass",
      role: "cartographer",
      disposition: "warm",
      originTownId: originTown.id,
      originLocationId,
      homeBuildingId: `${originTown.id}:home:projection`,
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
    active,
    source: {
      atlas: {
        locations: world.depth.atlas.locations,
        discoveredLocationIds: [originLocationId, destination.id],
      },
      towns: { [originLocationId]: originTown },
      companions: { schemaVersion: 1, active: [active], former: [] },
    },
  };
}

function formerFrom(
  active: ActiveCompanion,
  index: number,
  departureTick: number,
  outcome: FormerCompanion["departure"]["outcome"] = "fulfilled",
): FormerCompanion {
  const injured = outcome === "injured";
  return {
    ...active,
    phase: "former",
    identity: {
      ...active.identity,
      residentId: `${active.identity.residentId}:${String(index).padStart(2, "0")}`,
      name: `${active.identity.name} ${index}`,
    },
    resources: { ...active.resources, health: injured ? 0 : active.resources.health },
    injury: injured ? "fallen" : "none",
    departure: {
      tick: departureTick,
      locationId: active.destination.locationId,
      outcome,
    },
  };
}

function withRoster(source: PartyProjectionSource, companions: CompanionRosterState): PartyProjectionSource {
  return { ...source, companions };
}

describe("party projection", () => {
  it("projects exact active identity, public places, purpose, resources, progress, and status", () => {
    const { source, active } = projectionFixture();
    const projected = projectParty(source);
    const originTown = source.towns[active.identity.originLocationId] as TownState;

    expect(projected).toEqual({
      active: {
        id: active.identity.residentId,
        name: active.identity.name,
        role: active.identity.role,
        origin: {
          townId: originTown.id,
          locationId: originTown.locationId,
          name: originTown.name,
        },
        destination: active.destination,
        purpose: "shared-road-oath",
        purposeText: `Shared-road oath · ${originTown.name} → ${active.destination.name}`,
        joinedTick: 7,
        victories: 2,
        bond: 6,
        status: "travelling",
        statusText: `Travelling to ${active.destination.name}`,
        health: 23,
        maxHealth: 31,
      },
      former: [],
    });
  });

  it("derives arrived and injury-precedence status without changing canonical state", () => {
    const { source, active } = projectionFixture();
    const arrived = { ...active, phase: "arrived" as const };
    const fallen = {
      ...arrived,
      resources: { ...arrived.resources, health: 0 },
      injury: "fallen" as const,
    };
    expect(projectParty(withRoster(source, { ...source.companions, active: [arrived] })).active)
      .toMatchObject({ status: "arrived", statusText: `Arrived at ${active.destination.name}` });
    expect(projectParty(withRoster(source, { ...source.companions, active: [fallen] })).active)
      .toMatchObject({ status: "arrived-injured", statusText: `Arrived injured at ${active.destination.name}`, health: 0 });
  });

  it("shares exhaustive human-readable purpose, status, and departure wording", () => {
    expect(companionPurposeText("shared-road-oath", "Bellwick", "Foxbridge"))
      .toBe("Shared-road oath · Bellwick → Foxbridge");
    expect(companionStatusText("travelling", "Foxbridge")).toBe("Travelling to Foxbridge");
    expect(companionStatusText("arrived", "Foxbridge")).toBe("Arrived at Foxbridge");
    expect(companionStatusText("injured", "Foxbridge")).toBe("Injured en route to Foxbridge");
    expect(companionStatusText("arrived-injured", "Foxbridge")).toBe("Arrived injured at Foxbridge");
    expect(isInjuredPartyStatus("travelling")).toBe(false);
    expect(isInjuredPartyStatus("arrived-injured")).toBe(true);
    expect(companionDepartureText("fulfilled", "Foxbridge")).toBe("Oath fulfilled at Foxbridge");
    expect(companionDepartureText("injured", "Foxbridge")).toBe("Journey ended by injury at Foxbridge");
  });

  it("redacts companions whose origin or destination is not public and discovered", () => {
    const { source, active } = projectionFixture();
    const former = formerFrom(active, 1, 12);
    const hidden = withRoster(
      { ...source, atlas: { ...source.atlas, discoveredLocationIds: [active.identity.originLocationId] } },
      { schemaVersion: 1, active: [active], former: [former] },
    );
    const encoded = JSON.stringify(projectParty(hidden));
    expect(projectParty(hidden)).toEqual({ active: null, former: [] });
    expect(encoded).not.toContain(active.destination.locationId);
    expect(encoded).not.toContain(active.destination.name);
  });

  it("copies, deterministically sorts, and bounds former companions newest-first", () => {
    const { source, active } = projectionFixture();
    const former = Array.from(
      { length: maximumProjectedFormerCompanions + 3 },
      (_, index) => formerFrom(active, index, 100 + (index * 7) % 13, index === 4 ? "injured" : "fulfilled"),
    ).reverse();
    const withHistory = withRoster(source, { schemaVersion: 1, active: [], former });
    const before = JSON.stringify(withHistory);
    const projected = projectParty(withHistory);

    expect(projected.active).toBeNull();
    expect(projected.former).toHaveLength(maximumProjectedFormerCompanions);
    expect(projected.former.map((record) => record.departureTick)).toEqual(
      [...projected.former.map((record) => record.departureTick)].sort((left, right) => right - left),
    );
    expect(projected.former.find((record) => record.departureOutcome === "injured"))
      .toMatchObject({ departureText: `Journey ended by injury at ${active.destination.name}` });
    expect(JSON.stringify(withHistory)).toBe(before);
  });

  it("is stable after canonical input and projected output JSON round-trips", () => {
    const { source, active } = projectionFixture();
    const withHistory = withRoster(source, {
      schemaVersion: 1,
      active: [active],
      former: [formerFrom(active, 1, 19), formerFrom(active, 2, 23, "injured")],
    });
    const first = projectParty(withHistory);
    const restoredSource = JSON.parse(JSON.stringify(withHistory)) as PartyProjectionSource;
    const second = projectParty(restoredSource);
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});
